/**
 * 数据修复脚本：修复区管分区绑定问题
 *
 * 问题：部分区管用户的 zones.creatorId 未正确绑定
 * 原因：审核流程中 userId 类型不匹配或用户信息查询失败
 *
 * 修复策略：
 * 1. 查找所有 role = 'admin' 的用户
 * 2. 查找这些用户的 admins 申请记录（zoneManager 类型，已批准）
 * 3. 根据申请记录中的 zoneId/zoneName 更新 zones.creatorId
 *
 * 运行方式：在微信开发者工具中打开云开发控制台，运行此脚本
 */

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

async function repairZoneCreatorBindings() {
  console.log('=== 开始修复区管分区绑定 ===')

  // 1. 查找所有 admin 角色的用户
  const adminUsersRes = await db.collection('users').where({
    role: 'admin'
  }).get()

  console.log(`找到 ${adminUsersRes.data.length} 个区管用户`)

  let repairedCount = 0
  let skippedCount = 0
  let errorCount = 0

  for (const user of adminUsersRes.data) {
    const userId = user._id
    const openid = user.openid
    const nickName = user.nickName || '未知'

    console.log(`\n处理用户: ${nickName} (${userId})`)

    // 2. 查找该用户的 zoneManager 申请记录
    const adminAppsRes = await db.collection('admins').where({
      userId: openid, // admins 表中 userId 是 openid
      applyType: 'zoneManager',
      status: 'approved'
    }).orderBy('reviewTime', 'desc').limit(1).get()

    if (adminAppsRes.data.length === 0) {
      console.log(`  未找到 zoneManager 申请记录，跳过`)
      skippedCount++
      continue
    }

    const app = adminAppsRes.data[0]
    const zoneId = app.zoneId
    const zoneName = app.zoneName

    if (!zoneId) {
      console.log(`  申请记录中没有 zoneId，跳过`)
      skippedCount++
      continue
    }

    // 3. 查找分区并检查 creatorId
    const zoneRes = await db.collection('zones').doc(zoneId).get()

    if (!zoneRes.data) {
      console.log(`  分区 ${zoneId} 不存在，跳过`)
      skippedCount++
      continue
    }

    const zone = zoneRes.data
    const currentCreatorId = zone.creatorId

    // 4. 检查是否需要修复
    if (currentCreatorId === userId) {
      console.log(`  creatorId 已正确绑定 (${zoneName})，跳过`)
      skippedCount++
      continue
    }

    // 5. 修复 creatorId
    console.log(`  需要修复: ${zoneName} (${zoneId})`)
    console.log(`    当前 creatorId: ${currentCreatorId}`)
    console.log(`    应该绑定到: ${userId}`)

    try {
      await db.collection('zones').doc(zoneId).update({
        data: {
          creatorId: userId,
          updateTime: db.serverDate()
        }
      })
      console.log(`  ✓ 修复成功`)
      repairedCount++
    } catch (err) {
      console.log(`  ✗ 修复失败: ${err.message}`)
      errorCount++
    }
  }

  console.log('\n=== 修复完成 ===')
  console.log(`修复成功: ${repairedCount}`)
  console.log(`跳过: ${skippedCount}`)
  console.log(`失败: ${errorCount}`)

  return {
    repaired: repairedCount,
    skipped: skippedCount,
    errors: errorCount
  }
}

// 导出修复函数
module.exports = {
  repairZoneCreatorBindings
}

// 如果作为独立脚本运行
if (require.main === module) {
  repairZoneCreatorBindings()
    .then(result => console.log('结果:', result))
    .catch(err => console.error('错误:', err))
}