/**
 * 数据库操作工具
 */

// 获取数据库实例
function getDb() {
  return wx.cloud.database()
}

/**
 * 用户相关操作
 */

// 创建或更新用户（带手机号绑定验证）
async function createOrUpdateUser(userData) {
  const db = getDb()
  const { openid, phone } = userData
  console.log('createOrUpdateUser - openid:', openid, 'phone:', phone)

  // 先根据openid查找用户
  let existingUser = await getUserByOpenid(openid)
  console.log('根据openid查到的用户:', existingUser)

  // 如果提供了手机号，检查手机号是否已被其他微信ID绑定
  if (phone) {
    const userByPhone = await getUserByPhone(phone)
    console.log('根据phone查到的用户:', userByPhone)

    if (userByPhone && userByPhone.openid !== openid) {
      // 手机号已被其他微信ID绑定，拒绝绑定
      console.log('手机号已被其他微信ID绑定')
      throw new Error('该手机号已被其他微信账号绑定，请使用绑定的微信账号登录')
    }
  }

  if (existingUser) {
    // 更新现有用户（只更新有值的字段）
    const updateData = {
      nickName: userData.nickName,
      avatarUrl: userData.avatarUrl,
      updateTime: db.serverDate()
    }

    // 只有当用户没有手机号时才更新手机号
    if (phone && !existingUser.phone) {
      updateData.phone = phone
    }

    await db.collection('users').doc(existingUser._id).update({
      data: updateData
    })

    // 重新获取更新后的用户信息
    existingUser = await getUserByOpenid(openid)
    return existingUser
  } else {
    // 创建新用户
    const result = await db.collection('users').add({
      data: {
        openid: openid,
        nickName: userData.nickName,
        avatarUrl: userData.avatarUrl,
        phone: phone || null,
        role: 'user',
        status: 'active',
        createTime: db.serverDate()
      }
    })
    console.log('创建结果:', result)

    // 返回新创建的用户
    return await getUserByOpenid(openid)
  }
}

// 根据openid获取用户
async function getUserByOpenid(openid) {
  const db = getDb()
  const res = await db.collection('users').where({
    openid: openid
  }).get()
  console.log('getUserByOpenid查询结果:', res.data)
  return res.data.length > 0 ? res.data[0] : null
}

// 根据手机号获取用户
async function getUserByPhone(phone) {
  const db = getDb()
  const res = await db.collection('users').where({
    phone: phone
  }).get()
  return res.data.length > 0 ? res.data[0] : null
}

// 绑定手机号到用户
async function bindPhoneToUser(openid, phone) {
  const db = getDb()

  // 检查手机号是否已被其他用户绑定
  const existingUser = await getUserByPhone(phone)
  if (existingUser && existingUser.openid !== openid) {
    throw new Error('该手机号已被其他微信账号绑定')
  }

  // 更新用户手机号
  const user = await getUserByOpenid(openid)
  if (user) {
    await db.collection('users').doc(user._id).update({
      data: {
        phone: phone,
        updateTime: db.serverDate()
      }
    })
    return await getUserByOpenid(openid)
  }

  return null
}

// 更新用户角色
async function updateUserRole(userId, role) {
  const db = getDb()
  return await db.collection('users').doc(userId).update({
    data: {
      role: role,
      updateTime: db.serverDate()
    }
  })
}

// 重置用户身份（清空手机号，由超级管理员操作）
async function resetUserIdentity(userId) {
  const db = getDb()

  // 获取用户信息
  const user = await db.collection('users').doc(userId).get()
  if (!user.data) {
    throw new Error('用户不存在')
  }

  // 清空手机号，重置为普通用户角色
  await db.collection('users').doc(userId).update({
    data: {
      phone: null,
      role: 'user',
      updateTime: db.serverDate()
    }
  })

  // 返回更新后的用户信息
  return await db.collection('users').doc(userId).get()
}

/**
 * 管理员申请相关操作
 */

// 创建管理员申请（支持区管和盟管申请）
async function createAdminApplication(userId, phone, applyType = 'allianceManager') {
  const db = getDb()

  // 验证申请类型
  const validTypes = ['zoneManager', 'allianceManager']
  if (!validTypes.includes(applyType)) {
    throw new Error('申请类型错误')
  }

  return await db.collection('admins').add({
    data: {
      userId: userId,
      phone: phone,
      applyType: applyType,
      status: 'pending',
      createTime: db.serverDate()
    }
  })
}

// 获取待审核的管理员申请（支持按类型筛选）
async function getPendingAdminApplications(applyType = null) {
  const db = getDb()
  const query = { status: 'pending' }

  if (applyType) {
    query.applyType = applyType
  }

  const res = await db.collection('admins')
    .where(query)
    .orderBy('createTime', 'desc')
    .get()
  return res.data
}

// 审核管理员申请（记录批准的角色类型）
async function reviewAdminApplication(applicationId, status, reviewedBy, approvedRole = null) {
  const db = getDb()

  const updateData = {
    status: status,
    reviewedBy: reviewedBy,
    reviewTime: db.serverDate()
  }

  // 如果审核通过，记录批准的角色
  if (status === 'approved' && approvedRole) {
    updateData.approvedRole = approvedRole
  }

  return await db.collection('admins').doc(applicationId).update({
    data: updateData
  })
}

/**
 * 分区相关操作
 */

// 创建分区
async function createZone(zoneCode, zoneName, creatorId) {
  const db = getDb()
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
  const db = getDb()
  const res = await db.collection('zones').where({
    zoneCode: zoneCode,
    status: 'active'
  }).get()
  return res.data.length > 0 ? res.data[0] : null
}

// 获取所有活跃分区
async function getAllZones() {
  const db = getDb()
  const res = await db.collection('zones').where({
    status: 'active'
  }).orderBy('createTime', 'desc').get()
  return res.data
}

// 获取管理员创建的分区
async function getZonesByCreator(creatorId) {
  const db = getDb()
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
  const db = getDb()
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
  const db = getDb()
  const res = await db.collection('alliances').where({
    zoneId: zoneId
  }).orderBy('allianceIndex', 'asc').get()
  return res.data
}

// 更新联盟名称
async function updateAllianceName(allianceId, name) {
  const db = getDb()
  return await db.collection('alliances').doc(allianceId).update({
    data: {
      allianceName: name,
      updateTime: db.serverDate()
    }
  })
}

// 绑定审计员
async function bindAuditor(allianceId, auditorId) {
  const db = getDb()
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
  const db = getDb()
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
  const db = getDb()
  const res = await db.collection('timeSlots').where({
    allianceId: allianceId,
    status: 'active'
  }).orderBy('timeValue', 'asc').orderBy('slotIndex', 'asc').get()
  return res.data
}

// 获取时间段某个基础时间的最大序号
async function getMaxSlotIndex(allianceId, timeValue) {
  const db = getDb()
  const res = await db.collection('timeSlots').where({
    allianceId: allianceId,
    timeValue: timeValue,
    status: 'active'
  }).orderBy('slotIndex', 'desc').limit(1).get()
  return res.data.length > 0 ? res.data[0].slotIndex : 0
}

// 更新时间段备注
async function updateTimeSlotRemark(timeSlotId, remark) {
  const db = getDb()
  return await db.collection('timeSlots').doc(timeSlotId).update({
    data: {
      remark: remark,
      updateTime: db.serverDate()
    }
  })
}

// 删除时间段
async function deleteTimeSlot(timeSlotId) {
  const db = getDb()
  return await db.collection('timeSlots').doc(timeSlotId).update({
    data: {
      status: 'inactive',
      updateTime: db.serverDate()
    }
  })
}

// 根据ID获取时间段
async function getTimeSlotById(timeSlotId) {
  const db = getDb()
  const res = await db.collection('timeSlots').doc(timeSlotId).get()
  return res.data
}

/**
 * 报名相关操作
 */

// 创建报名记录
async function createRegistration(data) {
  const db = getDb()
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

// 获取时间段报名人数
async function getRegistrationCount(timeSlotId) {
  const db = getDb()
  const res = await db.collection('registrations').where({
    timeSlotId: timeSlotId,
    status: 'active'
  }).count()
  return res.total
}

// 获取时间段报名列表
async function getRegistrationsByTimeSlot(timeSlotId) {
  const db = getDb()
  const res = await db.collection('registrations').where({
    timeSlotId: timeSlotId,
    status: 'active'
  }).orderBy('createTime', 'asc').get()
  return res.data
}

// 获取用户的报名记录
async function getRegistrationsByUser(userId) {
  const db = getDb()
  const res = await db.collection('registrations').where({
    userId: userId,
    status: 'active'
  }).orderBy('createTime', 'desc').get()
  return res.data
}

// 取消报名
async function cancelRegistration(registrationId) {
  const db = getDb()
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
 * 官职配置相关操作
 */

// 官职类型常量
const POSITION_TYPES = ['副执行官', '教育部长']

// 创建官职配置
async function createPositionConfig(data) {
  const db = getDb()

  // 验证起始时间格式
  if (!['0:00', '0:30'].includes(data.startTime)) {
    throw new Error('起始时间格式错误，应为 0:00 或 0:30')
  }

  // 验证职位类型
  if (!POSITION_TYPES.includes(data.positionType)) {
    throw new Error('职位类型错误')
  }

  return await db.collection('positionConfigs').add({
    data: {
      positionType: data.positionType,
      date: data.date,
      startTime: data.startTime,
      creatorId: data.creatorId,
      status: 'active',
      createTime: db.serverDate()
    }
  })
}

// 获取官职配置列表
async function getPositionConfigs(filters = {}) {
  const db = getDb()
  const query = { status: 'active' }

  if (filters.date) {
    query.date = filters.date
  }
  if (filters.creatorId) {
    query.creatorId = filters.creatorId
  }
  if (filters.positionType) {
    query.positionType = filters.positionType
  }

  const res = await db.collection('positionConfigs')
    .where(query)
    .orderBy('date', 'asc')
    .orderBy('createTime', 'desc')
    .get()

  return res.data
}

// 根据ID获取官职配置
async function getPositionConfigById(configId) {
  const db = getDb()
  const res = await db.collection('positionConfigs').doc(configId).get()
  return res.data
}

// 删除官职配置
async function deletePositionConfig(configId) {
  const db = getDb()
  return await db.collection('positionConfigs').doc(configId).update({
    data: {
      status: 'inactive',
      updateTime: db.serverDate()
    }
  })
}

// 根据起始时间生成时间段列表（0:00或0:30开始，每30分钟一格，到24:00）
function generatePositionTimeSlots(startTime) {
  const slots = []
  const startHour = parseInt(startTime.split(':')[0])
  const startMinute = parseInt(startTime.split(':')[1])

  let currentHour = startHour
  let currentMinute = startMinute

  while (currentHour < 24) {
    const timeStr = `${currentHour}:${currentMinute === 0 ? '00' : currentMinute}`
    slots.push({
      time: timeStr,
      period: currentHour < 12 ? 'morning' : 'afternoon'
    })

    currentMinute += 30
    if (currentMinute >= 60) {
      currentHour += 1
      currentMinute = 0
    }
  }

  return slots
}

/**
 * 官职报名记录相关操作
 */

// 创建官职报名记录（带并发检测）
async function createPositionRegistration(data) {
  const db = getDb()

  // 检查游戏昵称是否重复
  const existingNick = await db.collection('positionRegistrations')
    .where({
      configId: data.configId,
      nickName: data.nickName,
      status: 'active'
    })
    .get()

  if (existingNick.data.length > 0) {
    const existingReg = existingNick.data[0]
    throw new Error(`该昵称已在 ${existingReg.timeSlot} 时间段存在报名`)
  }

  // 检查时间段是否已被占用
  const existingSlot = await db.collection('positionRegistrations')
    .where({
      configId: data.configId,
      timeSlot: data.timeSlot,
      status: 'active'
    })
    .get()

  if (existingSlot.data.length > 0 && existingSlot.data[0].userId !== data.userId) {
    throw new Error('该时间位置已被其他人选择')
  }

  return await db.collection('positionRegistrations').add({
    data: {
      configId: data.configId,
      timeSlot: data.timeSlot,
      userId: data.userId,
      nickName: data.nickName,
      remark: data.remark || '',
      status: 'active',
      createTime: db.serverDate()
    }
  })
}

// 获取官职配置的所有报名记录
async function getPositionRegistrationsByConfig(configId) {
  const db = getDb()
  const res = await db.collection('positionRegistrations')
    .where({
      configId: configId,
      status: 'active'
    })
    .orderBy('timeSlot', 'asc')
    .get()
  return res.data
}

// 根据时间段获取报名记录
async function getPositionRegistrationByTimeSlot(configId, timeSlot) {
  const db = getDb()
  const res = await db.collection('positionRegistrations')
    .where({
      configId: configId,
      timeSlot: timeSlot,
      status: 'active'
    })
    .get()
  return res.data.length > 0 ? res.data[0] : null
}

// 获取用户的官职报名记录
async function getPositionRegistrationsByUser(userId) {
  const db = getDb()
  const res = await db.collection('positionRegistrations')
    .where({
      userId: userId,
      status: 'active'
    })
    .orderBy('createTime', 'desc')
    .get()

  // 获取关联的配置信息
  const registrations = res.data
  for (const reg of registrations) {
    try {
      reg.config = await getPositionConfigById(reg.configId)
    } catch (e) {
      reg.config = null
    }
  }

  return registrations
}

// 更新官职报名记录
async function updatePositionRegistration(registrationId, data) {
  const db = getDb()

  // 如果更新昵称，检查是否重复
  if (data.nickName) {
    const reg = await db.collection('positionRegistrations').doc(registrationId).get()
    const existingNick = await db.collection('positionRegistrations')
      .where({
        configId: reg.data.configId,
        nickName: data.nickName,
        status: 'active'
      })
      .get()

    if (existingNick.data.length > 0 && existingNick.data[0]._id !== registrationId) {
      throw new Error(`该昵称已在 ${existingNick.data[0].timeSlot} 时间段存在报名`)
    }
  }

  return await db.collection('positionRegistrations').doc(registrationId).update({
    data: {
      ...data,
      updateTime: db.serverDate()
    }
  })
}

// 取消官职报名（用户操作）
async function cancelPositionRegistration(registrationId) {
  const db = getDb()
  return await db.collection('positionRegistrations').doc(registrationId).update({
    data: {
      status: 'cancelled',
      updateTime: db.serverDate()
    }
  })
}

// 删除官职报名记录（区管操作）
async function deletePositionRegistration(registrationId) {
  const db = getDb()
  return await db.collection('positionRegistrations').doc(registrationId).update({
    data: {
      status: 'deleted',
      updateTime: db.serverDate()
    }
  })
}

// 清空官职配置的所有报名记录
async function clearPositionRegistrations(configId) {
  const db = getDb()
  const registrations = await getPositionRegistrationsByConfig(configId)

  for (const reg of registrations) {
    await db.collection('positionRegistrations').doc(reg._id).update({
      data: {
        status: 'cleared',
        updateTime: db.serverDate()
      }
    })
  }

  return registrations.length
}

/**
 * 数据清理相关操作
 */

// 检查是否为周四到周五（堡垒报名时间）
function isFortressBookingTime() {
  const now = new Date()
  const day = now.getDay() // 0=周日, 4=周四, 5=周五
  return day === 4 || day === 5
}

// 获取今天的日期字符串
function getTodayDateString() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

/**
 * 超级管理员相关操作
 */

// 添加超级管理员
async function addSuperAdmin(phone, userId) {
  const db = getDb()
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
  const db = getDb()
  const res = await db.collection('superAdmins').get()
  return res.data
}

// 检查手机号是否为超管
async function isPhoneSuperAdmin(phone) {
  const db = getDb()
  // 确保 phone 是字符串
  const phoneStr = String(phone).trim()
  const phoneNum = parseInt(phone, 10)
  console.log('检查超管, phone:', phoneStr, 'phoneNum:', phoneNum)

  // 先用字符串查询
  const resStr = await db.collection('superAdmins').where({
    phone: phoneStr
  }).get()
  console.log('字符串查询结果:', resStr.data)

  if (resStr.data.length > 0) {
    return true
  }

  // 如果没找到，尝试用数字查询
  const resNum = await db.collection('superAdmins').where({
    phone: phoneNum
  }).get()
  console.log('数字查询结果:', resNum.data)

  return resNum.data.length > 0
}

module.exports = {
  // 用户
  createOrUpdateUser,
  getUserByOpenid,
  getUserByPhone,
  updateUserRole,
  bindPhoneToUser,
  resetUserIdentity,

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

  // 官职配置
  POSITION_TYPES,
  createPositionConfig,
  getPositionConfigs,
  getPositionConfigById,
  deletePositionConfig,
  generatePositionTimeSlots,

  // 官职报名
  createPositionRegistration,
  getPositionRegistrationsByConfig,
  getPositionRegistrationByTimeSlot,
  getPositionRegistrationsByUser,
  updatePositionRegistration,
  cancelPositionRegistration,
  deletePositionRegistration,
  clearPositionRegistrations,

  // 数据清理
  isFortressBookingTime,
  getTodayDateString,

  // 超管
  addSuperAdmin,
  getAllSuperAdmins,
  isPhoneSuperAdmin
}