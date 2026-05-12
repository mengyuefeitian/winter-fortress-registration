// 云函数：管理用户身份
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { action, data } = event

  try {
    switch (action) {
      case 'addZoneAdmin':
        return await addZoneAdmin(data)
      case 'getUserZoneRoles':
        return await getUserZoneRoles(data)
      default:
        return { err: `Unknown action: ${action || 'undefined'}` }
    }
  } catch (err) {
    return { err: err.message }
  }
}

// 添加区管（支持预绑定，支持多区管）
async function addZoneAdmin(data) {
  const { zoneId, zoneName, phone } = data
  const _ = db.command

  // 检查分区是否存在
  const zoneRes = await db.collection('zones').doc(zoneId).get()
  if (!zoneRes.data) {
    return { err: '分区不存在' }
  }

  // 查找手机号对应的用户
  const phoneStr = String(phone).trim()
  const userRes = await db.collection('users').where({
    phone: phoneStr
  }).get()

  if (userRes.data.length > 0) {
    // 用户已存在，直接添加为区管
    const user = userRes.data[0]

    // 获取现有区管列表（向后兼容）
    let existingAdminIds = zoneRes.data.adminIds || []
    if (existingAdminIds.length === 0 && zoneRes.data.creatorId) {
      existingAdminIds = [zoneRes.data.creatorId]
    }

    // 检查是否已是该分区区管
    if (existingAdminIds.includes(user._id)) {
      return { err: `用户「${user.nickName}」已是该分区区管` }
    }

    // 添加到 adminIds 数组
    try {
      await db.collection('zones').doc(zoneId).update({
        data: {
          adminIds: _.push(user._id),
          creatorId: zoneRes.data.creatorId || user._id, // 保留第一个区管
          updateTime: db.serverDate()
        }
      })

      // 更新用户角色为区管（如果还不是）
      if (user.role !== 'admin' && user.role !== 'superAdmin') {
        await db.collection('users').doc(user._id).update({
          data: {
            role: 'admin',
            updateTime: db.serverDate()
          }
        })
      }

      return {
        success: true,
        message: `已将用户「${user.nickName}」设为 ${zoneName} 区管`,
        userId: user._id,
        nickName: user.nickName
      }
    } catch (err) {
      return { err: '绑定失败，请稍后重试' }
    }
  }

  // 用户不存在，创建预绑定记录
  try {
    const pendingRes = await db.collection('admins').add({
      data: {
        userId: null, // 待绑定
        phone: phoneStr,
        applyType: 'zoneManager',
        status: 'pending_bind', // 预绑定状态
        zoneId: zoneId,
        zoneName: zoneName,
        createTime: db.serverDate()
      }
    })

    return {
      success: true,
      message: `已创建预绑定记录。用户首次登录并绑定手机号 ${phoneStr} 后，将自动成为 ${zoneName} 区管`,
      pendingId: pendingRes._id
    }
  } catch (err) {
    return { err: '创建预绑定记录失败' }
  }
}

// 获取用户分区角色（支持多区管）
async function getUserZoneRoles(data) {
  const { userId } = data
  const _ = db.command
  const zoneRoles = []

  // 查询作为区管的分区（adminIds 包含 userId 或 creatorId 等于 userId）
  const zonesAsAdmin = await db.collection('zones')
    .where(_.or([
      { adminIds: userId },
      { creatorId: userId }
    ]).and({ status: 'active' }))
    .get()

  for (const zone of zonesAsAdmin.data) {
    zoneRoles.push({
      zoneId: zone._id,
      zoneName: zone.zoneName,
      role: 'admin'
    })
  }

  // 查询作为盟管的联盟
  const alliancesAsAuditor = await db.collection('alliances')
    .where({ auditorIds: userId })
    .get()

  for (const alliance of alliancesAsAuditor.data) {
    try {
      const zone = await db.collection('zones').doc(alliance.zoneId).get()
      if (zone && zone.data) {
        const existing = zoneRoles.find(zr => zr.zoneId === zone.data._id)
        if (!existing) {
          zoneRoles.push({
            zoneId: zone.data._id,
            zoneName: zone.data.zoneName,
            role: 'auditor',
            alliances: [alliance.allianceName]
          })
        } else if (existing.role === 'auditor') {
          existing.alliances.push(alliance.allianceName)
        }
      }
    } catch (e) {
      // 分区可能已删除，忽略
    }
  }

  return { zoneRoles }
}