/**
 * 数据库操作工具
 */

const db = wx.cloud.database()

/**
 * 用户相关操作
 */

// 创建或更新用户
async function createOrUpdateUser(userData) {
  const { openid } = userData
  const existingUser = await getUserByOpenid(openid)

  if (existingUser) {
    return await db.collection('users').doc(existingUser._id).update({
      data: {
        nickName: userData.nickName,
        avatarUrl: userData.avatarUrl,
        phone: userData.phone,
        updateTime: db.serverDate()
      }
    })
  } else {
    return await db.collection('users').add({
      data: {
        openid: openid,
        nickName: userData.nickName,
        avatarUrl: userData.avatarUrl,
        phone: userData.phone,
        role: 'user',
        status: 'active',
        createTime: db.serverDate()
      }
    })
  }
}

// 根据openid获取用户
async function getUserByOpenid(openid) {
  const res = await db.collection('users').where({
    openid: openid
  }).get()
  return res.data.length > 0 ? res.data[0] : null
}

// 根据手机号获取用户
async function getUserByPhone(phone) {
  const res = await db.collection('users').where({
    phone: phone
  }).get()
  return res.data.length > 0 ? res.data[0] : null
}

// 更新用户角色
async function updateUserRole(userId, role) {
  return await db.collection('users').doc(userId).update({
    data: {
      role: role,
      updateTime: db.serverDate()
    }
  })
}

/**
 * 管理员申请相关操作
 */

// 创建管理员申请
async function createAdminApplication(userId, phone) {
  return await db.collection('admins').add({
    data: {
      userId: userId,
      phone: phone,
      status: 'pending',
      createTime: db.serverDate()
    }
  })
}

// 获取待审核的管理员申请
async function getPendingAdminApplications() {
  const res = await db.collection('admins').where({
    status: 'pending'
  }).orderBy('createTime', 'desc').get()
  return res.data
}

// 审核管理员申请
async function reviewAdminApplication(applicationId, status, reviewedBy) {
  return await db.collection('admins').doc(applicationId).update({
    data: {
      status: status,
      reviewedBy: reviewedBy,
      reviewTime: db.serverDate()
    }
  })
}

/**
 * 分区相关操作
 */

// 创建分区
async function createZone(zoneCode, zoneName, creatorId) {
  // 检查分区编号是否已存在
  const existing = await getZoneByCode(zoneCode)
  if (existing) {
    throw new Error('分区编号已存在')
  }

  return await db.collection('zones').add({
    data: {
      zoneCode: zoneCode,
      zoneName: zoneName,
      creatorId: creatorId,
      status: 'active',
      createTime: db.serverDate()
    }
  })
}

// 根据分区编号获取分区
async function getZoneByCode(zoneCode) {
  const res = await db.collection('zones').where({
    zoneCode: zoneCode,
    status: 'active'
  }).get()
  return res.data.length > 0 ? res.data[0] : null
}

// 获取所有活跃分区
async function getAllZones() {
  const res = await db.collection('zones').where({
    status: 'active'
  }).orderBy('createTime', 'desc').get()
  return res.data
}

// 获取管理员创建的分区
async function getZonesByCreator(creatorId) {
  const res = await db.collection('zones').where({
    creatorId: creatorId,
    status: 'active'
  }).orderBy('createTime', 'desc').get()
  return res.data
}

/**
 * 联盟相关操作
 */

// 初始化联盟配置
async function initAlliances(zoneId) {
  const promises = []
  for (let i = 1; i <= 12; i++) {
    promises.push(db.collection('alliances').add({
      data: {
        zoneId: zoneId,
        allianceIndex: i,
        allianceName: `联盟${i}`,
        auditorId: null,
        createTime: db.serverDate()
      }
    }))
  }
  return await Promise.all(promises)
}

// 获取分区的联盟列表
async function getAlliancesByZone(zoneId) {
  const res = await db.collection('alliances').where({
    zoneId: zoneId
  }).orderBy('allianceIndex', 'asc').get()
  return res.data
}

// 更新联盟名称
async function updateAllianceName(allianceId, name) {
  return await db.collection('alliances').doc(allianceId).update({
    data: {
      allianceName: name,
      updateTime: db.serverDate()
    }
  })
}

// 绑定审计员
async function bindAuditor(allianceId, auditorId) {
  return await db.collection('alliances').doc(allianceId).update({
    data: {
      auditorId: auditorId,
      updateTime: db.serverDate()
    }
  })
}

/**
 * 时间段相关操作
 */

// 预设时间段
const TIME_VALUES = ['10:00', '12:00', '15:00', '19:30', '21:00']

// 创建时间段
async function createTimeSlot(zoneId, allianceId, timeValue, slotIndex, remark) {
  const displayName = slotIndex > 1 ? `${timeValue}-${slotIndex}` : timeValue

  return await db.collection('timeSlots').add({
    data: {
      zoneId: zoneId,
      allianceId: allianceId,
      timeValue: timeValue,
      slotIndex: slotIndex,
      displayName: displayName,
      remark: remark || '',
      maxCount: 15,
      status: 'active',
      createTime: db.serverDate()
    }
  })
}

// 获取联盟的时间段列表
async function getTimeSlotsByAlliance(allianceId) {
  const res = await db.collection('timeSlots').where({
    allianceId: allianceId,
    status: 'active'
  }).orderBy('timeValue', 'asc').orderBy('slotIndex', 'asc').get()
  return res.data
}

// 获取时间段某个基础时间的最大序号
async function getMaxSlotIndex(allianceId, timeValue) {
  const res = await db.collection('timeSlots').where({
    allianceId: allianceId,
    timeValue: timeValue,
    status: 'active'
  }).orderBy('slotIndex', 'desc').limit(1).get()
  return res.data.length > 0 ? res.data[0].slotIndex : 0
}

// 更新时间段备注
async function updateTimeSlotRemark(timeSlotId, remark) {
  return await db.collection('timeSlots').doc(timeSlotId).update({
    data: {
      remark: remark,
      updateTime: db.serverDate()
    }
  })
}

// 删除时间段
async function deleteTimeSlot(timeSlotId) {
  return await db.collection('timeSlots').doc(timeSlotId).update({
    data: {
      status: 'inactive',
      updateTime: db.serverDate()
    }
  })
}

/**
 * 报名相关操作
 */

// 创建报名记录
async function createRegistration(data) {
  // 检查时间段是否已满
  const count = await getRegistrationCount(data.timeSlotId)
  const timeSlot = await getTimeSlotById(data.timeSlotId)

  if (count >= timeSlot.maxCount) {
    throw new Error('该时间段报名人数已满')
  }

  return await db.collection('registrations').add({
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
}

// 根据ID获取时间段
async function getTimeSlotById(timeSlotId) {
  const res = await db.collection('timeSlots').doc(timeSlotId).get()
  return res.data
}

// 获取时间段报名人数
async function getRegistrationCount(timeSlotId) {
  const res = await db.collection('registrations').where({
    timeSlotId: timeSlotId,
    status: 'active'
  }).count()
  return res.total
}

// 获取时间段报名列表
async function getRegistrationsByTimeSlot(timeSlotId) {
  const res = await db.collection('registrations').where({
    timeSlotId: timeSlotId,
    status: 'active'
  }).orderBy('createTime', 'asc').get()
  return res.data
}

// 获取用户的报名记录
async function getRegistrationsByUser(userId) {
  const res = await db.collection('registrations').where({
    userId: userId,
    status: 'active'
  }).orderBy('createTime', 'desc').get()
  return res.data
}

// 取消报名
async function cancelRegistration(registrationId) {
  return await db.collection('registrations').doc(registrationId).update({
    data: {
      status: 'cancelled',
      updateTime: db.serverDate()
    }
  })
}

/**
 * 统计相关操作
 */

// 获取联盟统计数据
async function getAllianceStatistics(allianceId) {
  const timeSlots = await getTimeSlotsByAlliance(allianceId)
  const stats = []

  for (const slot of timeSlots) {
    const registrations = await getRegistrationsByTimeSlot(slot._id)
    stats.push({
      timeSlot: slot,
      registrations: registrations,
      count: registrations.length,
      remaining: slot.maxCount - registrations.length,
      isFull: registrations.length >= slot.maxCount
    })
  }

  return stats
}

// 获取分区统计数据
async function getZoneStatistics(zoneId) {
  const alliances = await getAlliancesByZone(zoneId)
  const stats = []

  for (const alliance of alliances) {
    const allianceStats = await getAllianceStatistics(alliance._id)
    stats.push({
      alliance: alliance,
      stats: allianceStats,
      totalCount: allianceStats.reduce((sum, s) => sum + s.count, 0)
    })
  }

  return stats
}

/**
 * 超级管理员相关操作
 */

// 添加超级管理员
async function addSuperAdmin(phone, userId) {
  return await db.collection('superAdmins').add({
    data: {
      phone: phone,
      userId: userId,
      createTime: db.serverDate()
    }
  })
}

// 获取所有超级管理员
async function getAllSuperAdmins() {
  const res = await db.collection('superAdmins').get()
  return res.data
}

// 检查手机号是否为超管
async function isPhoneSuperAdmin(phone) {
  const res = await db.collection('superAdmins').where({
    phone: phone
  }).get()
  return res.data.length > 0
}

module.exports = {
  // 用户
  createOrUpdateUser,
  getUserByOpenid,
  getUserByPhone,
  updateUserRole,

  // 管理员申请
  createAdminApplication,
  getPendingAdminApplications,
  reviewAdminApplication,

  // 分区
  createZone,
  getZoneByCode,
  getAllZones,
  getZonesByCreator,

  // 联盟
  initAlliances,
  getAlliancesByZone,
  updateAllianceName,
  bindAuditor,

  // 时间段
  TIME_VALUES,
  createTimeSlot,
  getTimeSlotsByAlliance,
  getMaxSlotIndex,
  updateTimeSlotRemark,
  deleteTimeSlot,
  getTimeSlotById,

  // 报名
  createRegistration,
  getRegistrationCount,
  getRegistrationsByTimeSlot,
  getRegistrationsByUser,
  cancelRegistration,

  // 统计
  getAllianceStatistics,
  getZoneStatistics,

  // 超管
  addSuperAdmin,
  getAllSuperAdmins,
  isPhoneSuperAdmin
}