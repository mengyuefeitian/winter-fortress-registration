// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  const { zoneId, allianceId } = event

  try {
    if (allianceId) {
      return await getAllianceStatistics(allianceId)
    } else if (zoneId) {
      return await getZoneStatistics(zoneId)
    } else {
      return await getAllStatistics()
    }
  } catch (err) {
    return {
      err: err.message
    }
  }
}

// 获取联盟统计数据
async function getAllianceStatistics(allianceId) {
  const timeSlotsRes = await db.collection('timeSlots').where({
    allianceId: allianceId,
    status: 'active'
  }).orderBy('timeValue', 'asc').orderBy('slotIndex', 'asc').get()

  const stats = []

  for (const slot of timeSlotsRes.data) {
    const registrationsRes = await db.collection('registrations').where({
      timeSlotId: slot._id,
      status: 'active'
    }).get()

    stats.push({
      timeSlot: slot,
      registrations: registrationsRes.data,
      count: registrationsRes.data.length,
      remaining: slot.maxCount - registrationsRes.data.length,
      isFull: registrationsRes.data.length >= slot.maxCount
    })
  }

  return {
    data: stats
  }
}

// 获取分区统计数据
async function getZoneStatistics(zoneId) {
  const alliancesRes = await db.collection('alliances').where({
    zoneId: zoneId
  }).orderBy('allianceIndex', 'asc').get()

  const stats = []

  for (const alliance of alliancesRes.data) {
    const allianceStats = await getAllianceStatistics(alliance._id)
    stats.push({
      alliance: alliance,
      stats: allianceStats.data,
      totalCount: allianceStats.data.reduce((sum, s) => sum + s.count, 0)
    })
  }

  return {
    data: stats
  }
}

// 获取全局统计数据
async function getAllStatistics() {
  const zonesRes = await db.collection('zones').where({
    status: 'active'
  }).get()

  const stats = []

  for (const zone of zonesRes.data) {
    const zoneStats = await getZoneStatistics(zone._id)
    stats.push({
      zone: zone,
      stats: zoneStats.data,
      totalCount: zoneStats.data.reduce((sum, s) => sum + s.totalCount, 0)
    })
  }

  return {
    data: stats
  }
}