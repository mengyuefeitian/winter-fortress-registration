// 云函数：迁移 zones.creatorId 到 zones.adminIds
// 支持多区管架构重构的数据迁移
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    // 获取所有活跃分区
    const zones = await db.collection('zones')
      .where({ status: 'active' })
      .get()

    let migrated = 0
    let skipped = 0
    let errors = []

    for (const zone of zones.data) {
      // 已有 adminIds 且非空，跳过
      if (zone.adminIds && zone.adminIds.length > 0) {
        skipped++
        continue
      }

      // 有 creatorId 但无 adminIds，需要迁移
      if (zone.creatorId) {
        try {
          await db.collection('zones').doc(zone._id).update({
            data: {
              adminIds: [zone.creatorId],
              updateTime: db.serverDate()
            }
          })
          migrated++
        } catch (err) {
          errors.push({ zoneId: zone._id, zoneName: zone.zoneName, error: err.message })
        }
      } else {
        // 无 creatorId 也无 adminIds，跳过
        skipped++
      }
    }

    return {
      success: true,
      migrated,
      skipped,
      errors,
      total: zones.data.length,
      message: `迁移完成：${migrated} 个分区已添加 adminIds，${skipped} 个分区已跳过`
    }
  } catch (err) {
    return {
      success: false,
      err: err.message
    }
  }
}