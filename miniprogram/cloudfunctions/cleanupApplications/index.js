// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 已处理申请（已审批/已拒绝）的保留天数，超过则自动清理
const RETENTION_DAYS = 14

// 定时触发：清理超过保留期的已处理管理员申请记录
// 仅处理 admins 集合中 status 为 approved / rejected 的记录，绝不删除待审核(pending)
exports.main = async (event, context) => {
  try {
    const threshold = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)

    // 清理条件（两组均为已处理记录）：
    // 1) 有 reviewTime 的：按审核时间判断是否超期
    // 2) 历史数据无 reviewTime 的：按创建时间兜底（同样要求已处理，避免误删待审核）
    const where = _.or([
      {
        status: _.in(['approved', 'rejected']),
        reviewTime: _.lt(threshold)
      },
      {
        status: _.in(['approved', 'rejected']),
        reviewTime: _.exists(false),
        createTime: _.lt(threshold)
      }
    ])

    const countRes = await db.collection('admins').where(where).count()
    const total = countRes.total

    let deleted = 0
    if (total > 0) {
      // 云函数端拥有管理员权限，可直接批量删除匹配记录
      const removeRes = await db.collection('admins').where(where).remove()
      deleted = (removeRes.stats && removeRes.stats.removed) ? removeRes.stats.removed : total
    }

    console.log(`[cleanupApplications] 已清理 ${deleted} 条超过 ${RETENTION_DAYS} 天的已处理申请`)
    return {
      success: true,
      deleted: deleted,
      retentionDays: RETENTION_DAYS
    }
  } catch (err) {
    console.error('[cleanupApplications] 清理失败:', err)
    return {
      success: false,
      error: err.message || '未知错误'
    }
  }
}
