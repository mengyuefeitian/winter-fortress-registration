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
        return await createRegistration(data)
      case 'getByTimeSlot':
        return await getRegistrationsByTimeSlot(data.timeSlotId)
      case 'getByUser':
        return await getRegistrationsByUser(data.userId)
      case 'cancel':
        return await cancelRegistration(data.registrationId)
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

// 创建报名记录
async function createRegistration(data) {
  // 检查时间段是否已满
  const countRes = await db.collection('registrations').where({
    timeSlotId: data.timeSlotId,
    status: 'active'
  }).count()

  const timeSlotRes = await db.collection('timeSlots').doc(data.timeSlotId).get()
  const maxCount = timeSlotRes.data.maxCount || 15

  if (countRes.total >= maxCount) {
    throw new Error('该时间段报名人数已满')
  }

  // 创建报名记录
  const result = await db.collection('registrations').add({
    data: {
      zoneId: data.zoneId,
      allianceId: data.allianceId,
      timeSlotId: data.timeSlotId,
      userId: data.userId,
      nickName: data.nickName,
      position: data.position,
      status: 'active',
      createTime: db.serverDate()
    }
  })

  return {
    success: true,
    _id: result._id
  }
}

// 获取时间段报名列表
async function getRegistrationsByTimeSlot(timeSlotId) {
  const res = await db.collection('registrations').where({
    timeSlotId: timeSlotId,
    status: 'active'
  }).orderBy('createTime', 'asc').get()

  return {
    data: res.data
  }
}

// 获取用户报名记录
async function getRegistrationsByUser(userId) {
  const res = await db.collection('registrations').where({
    userId: userId,
    status: 'active'
  }).orderBy('createTime', 'desc').get()

  return {
    data: res.data
  }
}

// 取消报名
async function cancelRegistration(registrationId) {
  await db.collection('registrations').doc(registrationId).update({
    data: {
      status: 'cancelled',
      updateTime: db.serverDate()
    }
  })

  return {
    success: true
  }
}