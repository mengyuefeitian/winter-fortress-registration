// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  const { action, data } = event

  try {
    switch (action) {
      case 'autoClear':
        return await autoClear()
      case 'manualClear':
        return await manualClear(data)
      case 'clearFortressData':
        return await clearFortressData(data)
      case 'clearPositionData':
        return await clearPositionData(data)
      default:
        return {
          success: false,
          error: 'Unknown action'
        }
    }
  } catch (err) {
    return {
      success: false,
      error: err.message
    }
  }
}

// 自动清理（定时触发，无需确认）
// 清理30天以上的堡垒报名数据和官职配置/报名数据
// 同时将已过期的 timeSlots 标记为 inactive
async function autoClear() {
  const results = {
    registrations: 0,
    positionConfigs: 0,
    positionRegistrations: 0,
    expiredTimeSlots: 0
  }

  // 计算30天前的时间
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  // 1. 清理30天以上的堡垒报名数据
  const regResult = await db.collection('registrations').where({
    createTime: _.lt(thirtyDaysAgo)
  }).remove()
  results.registrations = regResult.stats.removed

  // 2. 清理30天以上的官职配置
  const configResult = await db.collection('positionConfigs').where({
    createTime: _.lt(thirtyDaysAgo),
    status: 'inactive'
  }).remove()
  results.positionConfigs = configResult.stats.removed

  // 3. 清理30天以上的官职报名数据
  const posRegResult = await db.collection('positionRegistrations').where({
    createTime: _.lt(thirtyDaysAgo),
    status: _.in(['cancelled', 'deleted', 'cleared'])
  }).remove()
  results.positionRegistrations = posRegResult.stats.removed

  // 4. 将已过期的 timeSlots 标记为 inactive（date 字段非空且早于今天）
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]

  const timeSlotUpdate = await db.collection('timeSlots').where({
    status: 'active',
    date: _.and(_.neq(''), _.lt(todayStr))
  }).update({
    data: { status: 'inactive', updateTime: db.serverDate() }
  })
  results.expiredTimeSlots = timeSlotUpdate.stats.updated

  // 5. 清理已回复超过 30 天的反馈
  const feedbackResult = await db.collection('feedbacks').where({
    repliedAt: _.lt(thirtyDaysAgo)
  }).remove()
  results.repliedFeedbacks = feedbackResult.stats.removed

  return {
    success: true,
    data: results,
    message: `自动清理完成：堡垒报名 ${results.registrations} 条，官职配置 ${results.positionConfigs} 条，官职报名 ${results.positionRegistrations} 条，过期时间段 ${results.expiredTimeSlots} 个，已回复反馈 ${results.repliedFeedbacks} 条`
  }
}

// 手动清理（需要确认）
// 清理上周及之前的堡垒报名数据，清理今天之前的官职报名数据
async function manualClear(data) {
  // 检查是否确认
  if (!data || !data.confirm) {
    return {
      success: false,
      requiresConfirmation: true,
      message: '此操作将清理过期数据，请确认后执行'
    }
  }

  const results = {
    registrations: 0,
    positionRegistrations: 0
  }

  // 计算"上周及之前"的时间（本周一00:00:00之前）
  const now = new Date()
  const thisMonday = new Date(now)
  thisMonday.setHours(0, 0, 0, 0)
  const dayOfWeek = thisMonday.getDay()
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  thisMonday.setDate(thisMonday.getDate() - daysToMonday)

  // 1. 清理上周及之前的堡垒报名数据（状态为active的）
  const regResult = await db.collection('registrations').where({
    createTime: _.lt(thisMonday),
    status: 'active'
  }).remove()
  results.registrations = regResult.stats.removed

  // 计算今天00:00:00
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // 2. 清理今天之前的官职报名数据（保留今天及之后）
  const posRegResult = await db.collection('positionRegistrations').where({
    createTime: _.lt(today),
    status: 'active'
  }).remove()
  results.positionRegistrations = posRegResult.stats.removed

  return {
    success: true,
    data: results,
    message: `手动清理完成：堡垒报名 ${results.registrations} 条，官职报名 ${results.positionRegistrations} 条`
  }
}

// 清理堡垒报名数据（按范围）
// scope: all / zone / alliance / timeSlot
async function clearFortressData(data) {
  const { scope, zoneId, allianceId, timeSlotId, confirm } = data

  // 检查是否确认
  if (!confirm) {
    return {
      success: false,
      requiresConfirmation: true,
      message: '此操作将清理堡垒报名数据，请确认后执行'
    }
  }

  let query = {
    status: 'active'
  }

  switch (scope) {
    case 'all':
      // 清理所有活跃的堡垒报名
      break
    case 'zone':
      if (!zoneId) {
        throw new Error('缺少 zoneId 参数')
      }
      query.zoneId = zoneId
      break
    case 'alliance':
      if (!allianceId) {
        throw new Error('缺少 allianceId 参数')
      }
      query.allianceId = allianceId
      break
    case 'timeSlot':
      if (!timeSlotId) {
        throw new Error('缺少 timeSlotId 参数')
      }
      query.timeSlotId = timeSlotId
      break
    default:
      throw new Error('无效的 scope 参数')
  }

  const result = await db.collection('registrations').where(query).remove()

  return {
    success: true,
    data: {
      deletedCount: result.stats.removed
    },
    message: `已清理 ${result.stats.removed} 条堡垒报名记录`
  }
}

// 清理官职报名数据
// 按 configId 清理
async function clearPositionData(data) {
  const { configId, confirm } = data

  // 检查是否确认
  if (!confirm) {
    return {
      success: false,
      requiresConfirmation: true,
      message: '此操作将清理官职报名数据，请确认后执行'
    }
  }

  if (!configId) {
    throw new Error('缺少 configId 参数')
  }

  const result = await db.collection('positionRegistrations').where({
    configId: configId,
    status: 'active'
  }).remove()

  return {
    success: true,
    data: {
      deletedCount: result.stats.removed
    },
    message: `已清理 ${result.stats.removed} 条官职报名记录`
  }
}