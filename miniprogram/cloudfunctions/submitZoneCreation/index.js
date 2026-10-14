// 分区开通申请：云端原子提交
// 先写库（服务端写入，admin 上下文，不受客户端集合权限/瞬时失败影响，必然落库），
// 写成功后才发邮件。彻底杜绝「邮件发了但 admins 集合里没记录」的问题。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { userId, phone, zoneName, nickName } = event

  if (!userId) return { success: false, error: '缺少用户信息，请重新登录后重试' }
  if (!zoneName || !String(zoneName).trim()) return { success: false, error: '请填写分区信息' }

  const content = String(zoneName).trim()

  // 防重：同用户已有 pending 的分区开通申请则拒绝
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

  // 1) 先写库（服务端写入，admin 上下文，不受客户端集合权限限制）
  let addRes
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
    console.error('[submitZoneCreation] 写库失败:', e)
    return { success: false, error: '提交失败，请稍后重试' }
  }
  if (!addRes || !addRes._id) {
    return { success: false, error: '提交失败（写库无返回），请稍后重试' }
  }

  // 2) 写库成功后才发邮件（原子：没有记录就绝不发邮件）
  try {
    await cloud.callFunction({
      name: 'sendApplyEmail',
      data: {
        applyType: 'zoneCreation',
        nickName: nickName || '',
        phone: phone || '',
        zoneName: content
      }
    })
  } catch (e) {
    // 邮件失败不影响申请已记录，仅记日志
    console.error('[submitZoneCreation] 邮件通知发送失败（申请已记录）:', e)
  }

  return { success: true, _id: addRes._id }
}
