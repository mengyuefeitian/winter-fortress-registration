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
      case 'clearByAlliance':
        return await clearByAlliance(data.allianceId)
      case 'clearByZone':
        return await clearByZone(data.zoneId)
      case 'clearAll':
        return await clearAll()
      case 'clearByTimeSlot':
        return await clearByTimeSlot(data.timeSlotId)
      default:
        return {
          err: 'Unknown action'
        }
    }
  } catch (err) {
    return {
      err: err.message
    }
  }
}

// 按联盟清空报名数据
async function clearByAlliance(allianceId) {
  // 获取该联盟的所有时间段
  const timeSlotsRes = await db.collection('timeSlots').where({
    allianceId: allianceId,
    status: 'active'
  }).get()

  const timeSlotIds = timeSlotsRes.data.map(slot => slot._id)

  if (timeSlotIds.length === 0) {
    return {
      success: true,
      deletedCount: 0,
      message: '该联盟暂无时间段'
    }
  }

  // 删除这些时间段的报名记录
  const result = await db.collection('registrations').where({
    timeSlotId: _.in(timeSlotIds)
  }).remove()

  return {
    success: true,
    deletedCount: result.stats.removed,
    message: `已清空 ${result.stats.removed} 条报名记录`
  }
}

// 按分区清空报名数据
async function clearByZone(zoneId) {
  // 获取该分区的所有联盟
  const alliancesRes = await db.collection('alliances').where({
    zoneId: zoneId
  }).get()

  const allianceIds = alliancesRes.data.map(a => a._id)

  if (allianceIds.length === 0) {
    return {
      success: true,
      deletedCount: 0,
      message: '该分区暂无联盟'
    }
  }

  // 获取所有时间段
  const timeSlotsRes = await db.collection('timeSlots').where({
    allianceId: _.in(allianceIds),
    status: 'active'
  }).get()

  const timeSlotIds = timeSlotsRes.data.map(slot => slot._id)

  if (timeSlotIds.length === 0) {
    return {
      success: true,
      deletedCount: 0,
      message: '该分区暂无时间段'
    }
  }

  // 删除报名记录
  const result = await db.collection('registrations').where({
    timeSlotId: _.in(timeSlotIds)
  }).remove()

  return {
    success: true,
    deletedCount: result.stats.removed,
    message: `已清空 ${result.stats.removed} 条报名记录`
  }
}

// 清空所有报名数据（仅超级管理员）
async function clearAll() {
  const result = await db.collection('registrations').where({
    status: 'active'
  }).remove()

  return {
    success: true,
    deletedCount: result.stats.removed,
    message: `已清空全部 ${result.stats.removed} 条报名记录`
  }
}

// 按时间段清空报名数据
async function clearByTimeSlot(timeSlotId) {
  const result = await db.collection('registrations').where({
    timeSlotId: timeSlotId
  }).remove()

  return {
    success: true,
    deletedCount: result.stats.removed,
    message: `已清空 ${result.stats.removed} 条报名记录`
  }
}