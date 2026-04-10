// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const { action, data } = event

  try {
    switch (action) {
      case 'create':
        return await createTimeSlot(data)
      case 'getByAlliance':
        return await getTimeSlotsByAlliance(data.allianceId)
      case 'updateRemark':
        return await updateTimeSlotRemark(data.timeSlotId, data.remark)
      case 'delete':
        return await deleteTimeSlot(data.timeSlotId)
      case 'getMaxIndex':
        return await getMaxSlotIndex(data.allianceId, data.timeValue)
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

// 创建时间段
async function createTimeSlot(data) {
  const result = await db.collection('timeSlots').add({
    data: {
      zoneId: data.zoneId,
      allianceId: data.allianceId,
      timeValue: data.timeValue,
      slotIndex: data.slotIndex,
      displayName: data.displayName,
      remark: data.remark || '',
      maxCount: data.maxCount || 15,
      status: 'active',
      createTime: db.serverDate()
    }
  })

  return {
    success: true,
    _id: result._id
  }
}

// 获取联盟的时间段列表
async function getTimeSlotsByAlliance(allianceId) {
  const res = await db.collection('timeSlots').where({
    allianceId: allianceId,
    status: 'active'
  }).orderBy('timeValue', 'asc').orderBy('slotIndex', 'asc').get()

  return {
    data: res.data
  }
}

// 更新时间段备注
async function updateTimeSlotRemark(timeSlotId, remark) {
  await db.collection('timeSlots').doc(timeSlotId).update({
    data: {
      remark: remark,
      updateTime: db.serverDate()
    }
  })

  return {
    success: true
  }
}

// 删除时间段
async function deleteTimeSlot(timeSlotId) {
  await db.collection('timeSlots').doc(timeSlotId).update({
    data: {
      status: 'inactive',
      updateTime: db.serverDate()
    }
  })

  return {
    success: true
  }
}

// 获取某个时间的最大序号
async function getMaxSlotIndex(allianceId, timeValue) {
  const res = await db.collection('timeSlots').where({
    allianceId: allianceId,
    timeValue: timeValue,
    status: 'active'
  }).orderBy('slotIndex', 'desc').limit(1).get()

  return {
    maxIndex: res.data.length > 0 ? res.data[0].slotIndex : 0
  }
}