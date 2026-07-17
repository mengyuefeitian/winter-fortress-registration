/**
 * 云函数：sendReviewNotify
 * 功能：管理员审核通过/拒绝后，向申请人发送微信订阅消息通知
 *
 * 调用方式：
 *   wx.cloud.callFunction({
 *     name: 'sendReviewNotify',
 *     data: {
 *       applicationId: 'xxx',       // 申请记录 _id
 *       status: 'approved',         // 'approved' 或 'rejected'
 *       zoneCode: '0001',          // 可选，分区编号（4位数字）
 *       zoneName: '第一区',         // 可选，分区名称（无编号时兜底）
 *       allianceName: '青龙联盟',   // 可选，联盟名称
 *       rejectReason: '...'         // 可选，拒绝原因
 *     }
 *   })
 *
 * 注意：发送订阅消息需要用户在申请时已通过 wx.requestSubscribeMessage 授权。
 *       一次授权 = 一条消息配额。如果用户未授权或配额已用完，消息发送会失败，
 *       但不影响审批结果本身。
 */

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// ====== 订阅消息模板配置（需与前端 notifyConfig.js 保持一致）======
const TEMPLATE_ID = '6SGXLQjFHcVZf7dW68GMoff--FyBHox05W_g1FctnEw'

var TEMPLATE_DATA_KEYS = {
  applyType: 'short_thing16',
  time: 'time7',
  result: 'phrase3',
  remark: 'thing9'
}

// ====== 辅助函数 ======

function getApplyTypeName(applyType) {
  var names = {
    zoneManager: '区管申请',
    allianceManager: '盟管申请',
    zoneCreation: '开通申请'
  }
  return names[applyType] || '管理员申请'
}

function formatTime(date) {
  // 云函数运行在 UTC 时区，new Date() 得到的是 UTC 时间
  // 转换为北京时间（UTC+8）：加上 8 小时偏移后按 UTC 读取
  var bj = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  var y = bj.getUTCFullYear()
  var m = String(bj.getUTCMonth() + 1).padStart(2, '0')
  var d = String(bj.getUTCDate()).padStart(2, '0')
  var h = String(bj.getUTCHours()).padStart(2, '0')
  var min = String(bj.getUTCMinutes()).padStart(2, '0')
  return y + '-' + m + '-' + d + ' ' + h + ':' + min
}

// 微信 thing 类型字段限制 20 字符
function truncate(text, max) {
  max = max || 20
  if (!text) return ''
  return text.length > max ? text.substring(0, max) : text
}

// 联盟名称只取前 3 个字符（中英文均算一个字符）
function first3(text) {
  if (!text) return ''
  return text.substring(0, 3)
}

// 从「分区名称+编号」字符串中解析出分区编号（与前端 startCreateZone 逻辑一致）
// 如 "第一区 3558" -> "3558"；纯 4 位数字 -> 本身
function parseZoneCodeFromName(zoneName) {
  if (!zoneName) return ''
  var trimmed = String(zoneName).trim()
  if (/^\d{4}$/.test(trimmed)) return trimmed
  var parts = trimmed.split(/\s+/)
  if (parts.length > 1) return parts[parts.length - 1]
  return ''
}

// 解析分区编号（手动拒绝拼文案用）
// - 分区开通申请：编号嵌在 zoneName 中（如 "第一区 3558"）
// - 其他申请：优先用申请记录自带 zoneCode，否则按 zoneId 查 zones 集合，最后兜底用 zoneName
async function resolveZoneCode(application, db) {
  if (application.applyType === 'zoneCreation') {
    return parseZoneCodeFromName(application.zoneName)
  }
  if (application.zoneCode) return application.zoneCode
  if (application.zoneId) {
    try {
      var z = await db.collection('zones').doc(application.zoneId).get()
      if (z && z.data && z.data.zoneCode) return z.data.zoneCode
    } catch (e) {
      console.warn('[sendReviewNotify] 查询分区失败:', e)
    }
  }
  return application.zoneName || ''
}

// 手动拒绝备注：{项目}申请未通过（code 为空时去掉多余分隔符）
function buildManualRejectText(applyType, code, allianceName) {
  if (applyType === 'zoneCreation') {
    return '分区' + code + '开通申请未通过'
  }
  if (applyType === 'allianceManager') {
    return (code ? code + '：' : '') + first3(allianceName) + '盟管申请未通过'
  }
  // zoneManager 或其他
  return (code ? code + ' ' : '') + '区管申请未通过'
}

// ====== 云函数入口 ======

exports.main = async (event, context) => {
  var applicationId = event.applicationId
  var status = event.status
  var zoneCode = event.zoneCode || ''        // 分区编号（4位数字，如 '0001'）
  var zoneName = event.zoneName || ''
  var allianceName = event.allianceName || ''
  var rejectReason = event.rejectReason || ''
  var auto = event.auto || false           // true=自动拒绝（如分区已存在），false=管理员手动拒绝

  // 基本参数校验
  if (!applicationId) {
    return { success: false, error: '缺少 applicationId' }
  }
  if (!status || (status !== 'approved' && status !== 'rejected')) {
    return { success: false, error: 'status 必须为 approved 或 rejected' }
  }

  // 模板 ID 未配置时直接跳过
  if (!TEMPLATE_ID) {
    console.warn('[sendReviewNotify] 未配置订阅消息模板ID，跳过发送')
    return { success: false, error: '未配置模板ID' }
  }

  try {
    // 1. 查询申请记录，获取申请人 openid
    var appRes = await db.collection('admins').doc(applicationId).get()
    var application = appRes.data
    var applicantOpenid = application.userId

    if (!applicantOpenid) {
      console.error('[sendReviewNotify] 申请记录中无 userId/openid:', applicationId)
      return { success: false, error: '无法获取申请人openid' }
    }

    // 2. 构建消息内容
    var applyTypeName = getApplyTypeName(application.applyType)
    var resultText = status === 'approved' ? '已通过' : '已拒绝'
    var timeText = formatTime(new Date())

    // 备注内容（thing9 最多 20 字）
    // 优先级：分区编号 > 分区名称（前端已尽量传 zoneCode）
    var code = zoneCode || zoneName || ''
    var remarkText = ''
    if (status === 'approved') {
      if (application.applyType === 'allianceManager') {
        // 盟管：分区编号：联盟前3个字符 已开通并成为盟管
        // 加冒号分隔：联盟前3字符可能是数字/英文字母，避免与4位分区编号混淆
        remarkText = '分区' + code + '：' + first3(allianceName) + '已开通并成为盟管'
      } else {
        // 区管 / 分区开通：分区编号 已开通，已自动成为区管
        remarkText = '分区' + code + '已开通，已自动成为区管'
      }
    } else if (auto) {
      // 自动拒绝（如分区已存在）：前端已传入具体原因，原样展示（超长截断）
      remarkText = truncate(rejectReason)
    } else {
      // 手动拒绝：结构化为「{项目}申请未通过」，不展示自定义理由
      code = await resolveZoneCode(application, db)
      remarkText = buildManualRejectText(application.applyType, code, application.allianceName)
    }
    remarkText = truncate(remarkText)

    // 3. 组装模板数据
    var msgData = {}
    msgData[TEMPLATE_DATA_KEYS.applyType] = { value: applyTypeName }
    msgData[TEMPLATE_DATA_KEYS.result] = { value: resultText }
    msgData[TEMPLATE_DATA_KEYS.time] = { value: timeText }
    msgData[TEMPLATE_DATA_KEYS.remark] = { value: remarkText }

    // 4. 发送订阅消息
    var sendResult = await cloud.openapi.subscribeMessage.send({
      touser: applicantOpenid,
      templateId: TEMPLATE_ID,
      page: 'pages/index/index',
      data: msgData
    })

    console.log('[sendReviewNotify] 发送成功:', applicationId, applicantOpenid)
    return { success: true }

  } catch (err) {
    console.error('[sendReviewNotify] 发送失败:', err)

    // errCode 43101 = 用户未授权接收消息，属正常情况
    if (err.errCode === 43101) {
      return { success: false, error: '用户未授权接收消息', errCode: 43101 }
    }
    // errCode 40037 = 模板 ID 不正确
    if (err.errCode === 40037) {
      return { success: false, error: '模板ID不正确', errCode: 40037 }
    }

    return { success: false, error: err.message || String(err) }
  }
}
