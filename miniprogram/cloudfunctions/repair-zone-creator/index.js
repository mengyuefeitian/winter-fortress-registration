// 云函数：修复区管分区绑定问题（批量查询优化版，支持多区管）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  console.log('=== 开始修复区管分区绑定 ===')

  try {
    // 1. 批量查询所有 admin 用户
    const adminUsersRes = await db.collection('users').where({
      role: 'admin'
    }).get()

    const adminUsers = adminUsersRes.data
    console.log(`找到 ${adminUsers.length} 个区管用户`)

    if (adminUsers.length === 0) {
      return { success: true, summary: { total: 0, repaired: 0, skipped: 0, errors: 0 }, details: [] }
    }

    // 2. 批量查询所有申请记录
    const adminOpenids = adminUsers.map(u => u.openid)
    const adminAppsRes = await db.collection('admins').where({
      userId: _.in(adminOpenids),
      status: 'approved'
    }).get()

    // 建立 openid -> 申请记录 的映射
    const appsByOpenid = {}
    for (const app of adminAppsRes.data) {
      if (!appsByOpenid[app.userId]) {
        appsByOpenid[app.userId] = []
      }
      appsByOpenid[app.userId].push(app)
    }

    // 3. 批量查询所有分区
    const allZonesRes = await db.collection('zones').where({
      status: 'active'
    }).get()

    // 建立 zoneId -> zone 和 zoneName -> zone 的映射
    const zonesById = {}
    const zonesByName = {}
    for (const zone of allZonesRes.data) {
      zonesById[zone._id] = zone
      zonesByName[zone.zoneName] = zone
    }

    // 4. 批量更新需要修复的分区
    let repairedCount = 0
    let skippedCount = 0
    let errorCount = 0
    const details = []
    const updatePromises = []

    for (const user of adminUsers) {
      const userId = user._id
      const openid = user.openid
      const nickName = user.nickName || '未知'
      const apps = appsByOpenid[openid] || []

      if (apps.length === 0) {
        skippedCount++
        details.push({ user: nickName, status: 'skipped', reason: '无申请记录' })
        continue
      }

      // 找到有效的申请记录
      let targetZone = null
      let app = apps.find(a => a.applyType === 'zoneManager')
      if (app && app.zoneId && zonesById[app.zoneId]) {
        targetZone = zonesById[app.zoneId]
      } else {
        app = apps.find(a => a.applyType === 'zoneCreation')
        if (app) {
          if (app.zoneId && zonesById[app.zoneId]) {
            targetZone = zonesById[app.zoneId]
          } else if (app.zoneName && zonesByName[app.zoneName]) {
            targetZone = zonesByName[app.zoneName]
          }
        }
      }

      if (!targetZone) {
        skippedCount++
        details.push({ user: nickName, status: 'skipped', reason: '无法匹配分区' })
        continue
      }

      // 获取现有 adminIds（向后兼容）
      let existingAdminIds = targetZone.adminIds || []
      if (existingAdminIds.length === 0 && targetZone.creatorId) {
        existingAdminIds = [targetZone.creatorId]
      }

      // 检查是否需要修复（用户已在 adminIds 中）
      if (existingAdminIds.includes(userId) || targetZone.creatorId === userId) {
        skippedCount++
        details.push({ user: nickName, zone: targetZone.zoneName, status: 'ok', reason: '已正确绑定' })
        continue
      }

      // 需要修复 - 添加到 adminIds
      details.push({
        user: nickName,
        zone: targetZone.zoneName,
        zoneId: targetZone._id,
        status: 'repairing',
        reason: '添加到 adminIds'
      })

      updatePromises.push(
        db.collection('zones').doc(targetZone._id).update({
          data: {
            adminIds: _.push(userId),
            creatorId: targetZone.creatorId || userId, // 保留第一个区管
            updateTime: db.serverDate()
          }
        }).then(() => {
          repairedCount++
          console.log(`修复成功: ${nickName} -> ${targetZone.zoneName}`)
        }).catch(err => {
          errorCount++
          console.log(`修复失败: ${nickName} -> ${targetZone.zoneName}: ${err.message}`)
        })
      )
    }

    // 5. 并行执行所有更新
    await Promise.all(updatePromises)

    console.log('=== 修复完成 ===')

    return {
      success: true,
      summary: {
        total: adminUsers.length,
        repaired: repairedCount,
        skipped: skippedCount,
        errors: errorCount
      },
      details: details
    }

  } catch (err) {
    console.error('修复过程出错:', err)
    return {
      success: false,
      error: err.message
    }
  }
}