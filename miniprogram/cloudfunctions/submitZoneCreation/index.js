// 分区开通申请：云端提交
//
// 【顺序约定 —— 不要随意调换】
//   ① 先发申请邮件（无条件必达，让超管第一时间知道有人申请）
//   ② 再写库
//   ③ 写完立刻回读校验
//   ④ 校验不到 → 再发一封「入库失败」告警邮件 + 返回明确错误
//
// 为什么是「先邮件后写库」而不是反过来：
//   写库这一步出现过「不抛错但没落库」的情况，静默失败时前端无任何感知；
//   只有邮件先到，超管才知道有人提交了申请。因此邮件必须在最前面。
//   但反过来会带来「收到邮件却查不到条目」的老问题，所以第 ③ ④ 步的
//   回读校验 + 告警邮件是必须的：邮件必达，且写库失败也一定会被看见。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 发邮件统一出口（sendApplyEmail 云函数，支持 alert 告警模式）
async function sendEmail(payload) {
  try {
    const r = await cloud.callFunction({ name: 'sendApplyEmail', data: payload })
    const res = r && r.result
    if (res && res.success === false) {
      console.error('[submitZoneCreation] 邮件返回失败:', res.error)
      return false
    }
    return true
  } catch (e) {
    console.error('[submitZoneCreation] 发邮件异常:', e)
    return false
  }
}

// 入库失败告警：写库没落库时立刻告知超管，避免出现「邮件有、列表空」
async function alertDbWriteFailed(info) {
  const rows = [
    ['申请人', info.nickName || '匿名'],
    ['手机号', info.phone || '未提供'],
    ['分区信息', info.zoneName || ''],
    ['用户 openid', info.userId || ''],
    ['写入返回 _id', info.docId || '（无）'],
    ['失败原因', info.reason || '未知']
  ]
  let table = ''
  rows.forEach(function (r) {
    table += `<p><strong>${r[0]}：</strong>${r[1]}</p>`
  })
  const html =
    '<h2 style="color:#c0392b">⚠️ 分区开通申请：邮件已发送，但数据库写入失败</h2>' +
    '<p>该申请<strong>没有</strong>进入 admins 集合，超管在「管理员审核 → 分区开通审核」中<strong>看不到</strong>这条申请。</p>' +
    table +
    '<hr><p><small>请检查云函数 submitZoneCreation 与 admins 集合状态；必要时请让申请人重新提交。</small></p>'
  return sendEmail({
    alert: true,
    subject: '[冬日堡垒][⚠️入库失败] 分区开通申请未写入数据库',
    html: html
  })
}

exports.main = async (event, context) => {
  const { userId, phone, zoneName, nickName } = event

  if (!userId) return { success: false, error: '缺少用户信息，请重新登录后重试' }
  if (!zoneName || !String(zoneName).trim()) return { success: false, error: '请填写分区信息' }

  const content = String(zoneName).trim()

  // 防重：同用户已有 pending 的分区开通申请则拒绝（库里确实已有，不需要再发邮件）
  try {
    const exist = await db.collection('admins').where({
      userId: userId,
      applyType: 'zoneCreation',
      status: 'pending'
    }).count()
    if (exist.total > 0) {
      return { success: false, error: '您已有待审核的分区开通申请' }
    }
  } catch (e) {
    console.error('[submitZoneCreation] 查重失败:', e)
  }

  // ① 先发申请邮件（无论后续写库是否成功，超管都能第一时间看到申请）
  const mailSent = await sendEmail({
    applyType: 'zoneCreation',
    nickName: nickName || '',
    phone: phone || '',
    zoneName: content
  })

  // ② 写库（服务端 admin 上下文，不受客户端集合权限限制）
  let addRes = null
  let writeErr = ''
  try {
    addRes = await db.collection('admins').add({
      data: {
        userId: userId,
        phone: phone || '',
        applyType: 'zoneCreation',
        zoneName: content,
        status: 'pending',
        createTime: db.serverDate()
      }
    })
  } catch (e) {
    writeErr = (e && e.message) || String(e)
    console.error('[submitZoneCreation] 写库异常:', e)
  }

  const docId = (addRes && addRes._id) || ''

  // ③ 回读校验：确认这条记录真的在 admins 里
  let verified = false
  let verifyErr = ''
  if (docId) {
    try {
      const got = await db.collection('admins').doc(docId).get()
      if (got && got.data) verified = true
      else verifyErr = '回读无数据'
    } catch (e) {
      verifyErr = (e && e.message) || String(e)
      console.error('[submitZoneCreation] 回读校验失败:', e)
    }
  } else {
    verifyErr = writeErr || 'add 未返回 _id'
  }

  // ④ 校验不过 → 立刻发告警邮件，并如实告诉申请人
  if (!verified) {
    await alertDbWriteFailed({
      nickName: nickName || '',
      phone: phone || '',
      zoneName: content,
      userId: userId,
      docId: docId,
      reason: verifyErr || writeErr || '未知'
    })
    return {
      success: false,
      mailSent: mailSent,
      error: '申请已通知管理员，但系统记录写入失败，请联系管理员处理'
    }
  }

  return { success: true, _id: docId, mailSent: mailSent }
}
