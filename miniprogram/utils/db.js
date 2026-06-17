/**
 * 数据库操作工具
 */

// 将云数据库/云函数错误信息转为用户友好的中文提示
function friendlyErrorMsg(errMsg) {
  if (!errMsg) return '操作失败'
  const msg = String(errMsg)
  // 云数据库底层错误（如 ResourceUnavailable、Transaction 等）
  if (msg.includes('Resource') || msg.includes('Unava') || msg.includes('resource')) {
    return '服务器繁忙，请稍后再试'
  }
  if (msg.includes('Transaction') || msg.includes('transaction')) {
    return '操作冲突，请稍后再试'
  }
  if (msg.includes('timeout') || msg.includes('Timeout')) {
    return '请求超时，请检查网络后重试'
  }
  // 纯英文错误（无中文字符）统一返回通用提示
  if (!/[一-龥]/.test(msg)) {
    return '操作失败，请稍后再试'
  }
  // 云函数返回的中文错误直接返回
  return msg
}

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
  const phoneStr = String(phone).trim()
  const res = await db.collection('users').where({
    phone: phoneStr
  }).get()
  if (res.data.length > 0) return res.data[0]

  // 兼容历史数据：手机号可能以数字类型存储
  const phoneNum = parseInt(phone, 10)
  if (!isNaN(phoneNum)) {
    const resNum = await db.collection('users').where({
      phone: phoneNum
    }).get()
    if (resNum.data.length > 0) return resNum.data[0]
  }

  return null
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

  // 清理 admins 集合中该用户的已通过记录，否则无法重新申请
  const openid = user.data.openid
  if (openid) {
    const adminRes = await db.collection('admins').where({
      userId: openid,
      status: 'approved'
    }).get()
    for (const record of adminRes.data) {
      await db.collection('admins').doc(record._id).remove()
    }
  }

  // 返回更新后的用户信息
  return await db.collection('users').doc(userId).get()
}

/**
 * 管理员申请相关操作
 */

// 创建管理员申请（支持区管和盟管申请）
async function createAdminApplication(userId, phone, applyType = 'allianceManager', extraData = {}) {
  const db = getDb()

  // 验证申请类型
  const validTypes = ['zoneManager', 'allianceManager', 'zoneCreation']
  if (!validTypes.includes(applyType)) {
    throw new Error('申请类型错误')
  }

  const data = {
    userId: userId,
    phone: phone,
    applyType: applyType,
    status: 'pending',
    createTime: db.serverDate()
  }

  // 合并额外数据（如 zoneId, zoneName）
  Object.assign(data, extraData)

  return await db.collection('admins').add({ data })
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

// 审核管理员申请（记录批准的角色类型，支持额外数据）
async function reviewAdminApplication(applicationId, status, reviewedBy, approvedRole = null, extraData = {}) {
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

  // 合并额外数据（如 zoneId, zoneName）
  Object.assign(updateData, extraData)

  return await db.collection('admins').doc(applicationId).update({
    data: updateData
  })
}

// 通过云函数添加区管到分区（绕过 creator-only 写权限）
async function updateZoneCreator(zoneId, userId) {
  const res = await wx.cloud.callFunction({
    name: 'manageZone',
    data: {
      action: 'addZoneAdmin',
      data: { zoneId, userId }
    }
  })
  if (!res.result || !res.result.success) {
    throw new Error((res.result && res.result.err) || '添加区管失败')
  }
  return res.result
}

/**
 * 分区相关操作
 */

// 创建分区（支持多区管）
async function createZone(zoneCode, zoneName, creatorId) {
  const db = getDb()
  // 检查分区编号是否已存在
  const existing = await getZoneByCode(zoneCode)
  if (existing) {
    throw new Error('分区编号' + zoneCode + '已存在（分区：' + existing.zoneName + '），请更换编号')
  }

  return await db.collection('zones').add({
    data: {
      zoneCode: zoneCode,
      zoneName: zoneName,
      creatorId: creatorId,  // 保留（向后兼容）
      adminIds: [creatorId], // 新字段：支持多区管
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

// 获取所有活跃分区（分页获取全部记录）
async function getAllZones() {
  const db = getDb()
  let allZones = []
  let offset = 0
  const batchSize = 20

  while (true) {
    const res = await db.collection('zones').where({
      status: 'active'
    }).orderBy('createTime', 'desc').skip(offset).limit(batchSize).get()
    allZones = allZones.concat(res.data)
    if (res.data.length < batchSize) break
    offset += batchSize
    if (offset > 500) break
  }

  return allZones
}

// 获取管理员创建的分区（支持多区管）
async function getZonesByCreator(creatorId) {
  const db = getDb()
  const _ = db.command
  let allZones = []
  let offset = 0
  const batchSize = 20

  while (true) {
    // 查询 adminIds 包含该用户，或 creatorId 等于该用户（向后兼容）
    const res = await db.collection('zones').where(_.or([
      { adminIds: creatorId },
      { creatorId: creatorId }
    ]).and({ status: 'active' }))
    .orderBy('createTime', 'desc').skip(offset).limit(batchSize).get()
    allZones = allZones.concat(res.data)
    if (res.data.length < batchSize) break
    offset += batchSize
    if (offset > 500) break
  }

  return allZones
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
        auditorIds: [],
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

  // 兼容旧数据：从 auditorId 迁移到 auditorIds
  for (const alliance of res.data) {
    if (alliance.auditorId && !alliance.auditorIds) {
      alliance.auditorIds = [alliance.auditorId]
    } else if (!alliance.auditorIds) {
      alliance.auditorIds = []
    }
  }

  return res.data
}

// 根据ID获取联盟
async function getAllianceById(allianceId) {
  const db = getDb()
  const res = await db.collection('alliances').doc(allianceId).get()
  return res.data
}

// 批量根据ID获取分区（返回 id → zone 的 Map）
async function getZonesByIds(zoneIds) {
  if (!zoneIds || zoneIds.length === 0) return {}
  const db = getDb()
  const _ = db.command
  const uniqueIds = [...new Set(zoneIds)]
  const result = {}
  const chunkSize = 10
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize)
    const res = await db.collection('zones').where({ _id: _.in(chunk) }).get()
    res.data.forEach(z => { result[z._id] = z })
  }
  return result
}

// 批量根据ID获取联盟（返回 id → alliance 的 Map）
async function getAlliancesByIds(allianceIds) {
  if (!allianceIds || allianceIds.length === 0) return {}
  const db = getDb()
  const _ = db.command
  const uniqueIds = [...new Set(allianceIds)]
  const result = {}
  const chunkSize = 10
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize)
    const res = await db.collection('alliances').where({ _id: _.in(chunk) }).get()
    res.data.forEach(a => { result[a._id] = a })
  }
  return result
}

// 更新联盟名称（通过云函数，绕过客户端权限限制）
async function updateAllianceName(allianceId, name) {
  const res = await wx.cloud.callFunction({
    name: 'manageZone',
    data: {
      action: 'updateAllianceName',
      data: { allianceId, name }
    }
  })
  if (res.result.err) throw new Error(res.result.err)
  return res.result
}

// 绑定盟管（通过云函数，绕过客户端权限限制）
async function bindAllianceAuditors(allianceId, auditorId, action = 'add') {
  if (action === 'remove') {
    const res = await wx.cloud.callFunction({
      name: 'manageZone',
      data: {
        action: 'unbindAllianceAuditor',
        data: { allianceId, auditorId }
      }
    })
    if (res.result.err) throw new Error(res.result.err)
    return res.result
  }
  const res = await wx.cloud.callFunction({
    name: 'manageZone',
    data: {
      action: 'bindAllianceAuditor',
      data: { allianceId, auditorId }
    }
  })
  if (res.result.err) throw new Error(res.result.err)
  return res.result
}

// 获取联盟绑定的盟管信息列表
async function getAllianceAuditorInfo(allianceId) {
  const db = getDb()
  const _ = db.command
  const alliance = await db.collection('alliances').doc(allianceId).get()
  let auditorIds = alliance.data.auditorIds || []

  // 兼容旧数据
  if (alliance.data.auditorId && !alliance.data.auditorIds) {
    auditorIds = [alliance.data.auditorId]
  }

  if (auditorIds.length === 0) return []

  const res = await db.collection('users').where({
    _id: _.in(auditorIds)
  }).get()

  return res.data
}

// 获取用户的所有申请记录
async function getUserApplications(userId) {
  const db = getDb()
  const res = await db.collection('admins').where({
    userId: userId
  }).orderBy('createTime', 'desc').get()
  return res.data
}

// 获取分区的成员列表（盟管和区管）
async function getZoneMembers(zoneId) {
  const db = getDb()
  const _ = db.command

  const alliances = await db.collection('alliances').where({
    zoneId: zoneId
  }).get()

  const auditorIds = []
  const auditorAllianceMap = {}
  for (const alliance of alliances.data) {
    let ids = alliance.auditorIds || []
    if (alliance.auditorId && !alliance.auditorIds) {
      ids = [alliance.auditorId]
    }
    for (const id of ids) {
      if (!auditorIds.includes(id)) {
        auditorIds.push(id)
      }
      if (!auditorAllianceMap[id]) {
        auditorAllianceMap[id] = []
      }
      auditorAllianceMap[id].push(alliance.allianceName)
    }
  }

  const auditors = []
  if (auditorIds.length > 0) {
    const res = await db.collection('users').where({
      _id: _.in(auditorIds)
    }).get()
    for (const user of res.data) {
      auditors.push({
        _id: user._id,
        nickName: user.nickName || '未知',
        phone: user.phone || '',
        role: 'auditor',
        allianceNames: auditorAllianceMap[user._id] || []
      })
    }
  }

  const zone = await db.collection('zones').doc(zoneId).get()
  // 获取区管列表（支持多区管，向后兼容）
  let adminIds = zone.data.adminIds || []
  if (adminIds.length === 0 && zone.data.creatorId) {
    adminIds = [zone.data.creatorId]
  }

  const admins = []
  if (adminIds.length > 0) {
    const res = await db.collection('users').where({
      _id: _.in(adminIds)
    }).get()
    for (const user of res.data) {
      admins.push({
        _id: user._id,
        nickName: user.nickName || '未知',
        phone: user.phone || '',
        role: 'admin'
      })
    }
  }

  return { auditors, admins }
}

// 移除成员（重置为普通用户）
async function removeMember(userId, role, zoneId) {
  const db = getDb()

  // alliances/zones 集合为"仅创建者可写"，客户端写入会被权限拒绝
  // 通过云函数执行受限写入操作
  const res = await wx.cloud.callFunction({
    name: 'manageZone',
    data: {
      action: 'removeMember',
      data: {
        userId: userId,
        role: role,
        zoneId: zoneId
      }
    }
  })

  const result = res.result || {}
  if (result.err) {
    throw new Error(result.err || '移除成员失败')
  }

  // 云函数返回 shouldResetRole 标志，客户端处理 users/admins 集合（所有人可读写）
  if (result.shouldResetRole) {
    await db.collection('users').doc(userId).update({
      data: {
        role: 'user',
        updateTime: db.serverDate()
      }
    })

    const userDoc = await db.collection('users').doc(userId).get()
    const openid = userDoc.data && userDoc.data.openid
    if (openid) {
      const adminRes = await db.collection('admins').where({
        userId: openid,
        status: 'approved'
      }).get()
      for (const record of adminRes.data) {
        await db.collection('admins').doc(record._id).remove()
      }
    }
  }
}

/**
 * 时间段相关操作
 */

// 预设时间段
const TIME_VALUES = ['10:00', '12:00', '15:00', '19:30', '21:00']

// 标签选项
const TAG_OPTIONS = ['高迁', '生命', '穿透', '加兵', '火晶', '橙碎', '加速', '螺丝', '宠石', '宠箱', '其他']

// 堡垒名称选项（单选）
const FORTRESS_OPTIONS = ['要塞1', '要塞2', '要塞3', '要塞4', '堡垒1', '堡垒2', '堡垒3', '堡垒4', '堡垒5', '堡垒6', '堡垒7', '堡垒8', '堡垒9', '堡垒10', '堡垒11', '堡垒12']

// 国战报名 - 语音选项
const VOICE_OPTIONS = ['是', '否', '不确定']

// 国战报名 - 位置选项
const BATTLE_POSITION_OPTIONS = ['车头', '车身']

// 创建时间段
async function createTimeSlot(zoneId, allianceId, timeValue, slotIndex, date, tag, fortress) {
  const displayName = slotIndex > 1 ? `${timeValue}-${slotIndex}` : timeValue
  const res = await wx.cloud.callFunction({
    name: 'manageTimeSlot',
    data: {
      action: 'create',
      data: { zoneId, allianceId, timeValue, slotIndex, displayName, date: date || '', tag: tag || '', fortress: fortress || '' }
    }
  })
  if (!res.result || res.result.err) {
    throw new Error((res.result && res.result.err) || '创建时间段失败')
  }
  return { _id: res.result._id }
}

// 获取联盟的时间段列表（直接 DB 查询，避免云函数冷启动延迟）
async function getTimeSlotsByAlliance(allianceId) {
  const db = getDb()
  const res = await db.collection('timeSlots').where({
    allianceId: allianceId,
    status: 'active'
  }).orderBy('timeValue', 'asc').orderBy('slotIndex', 'asc').limit(100).get()
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

// 更新时间段标签
async function updateTimeSlotTag(timeSlotId, tag) {
  const db = getDb()
  return await db.collection('timeSlots').doc(timeSlotId).update({
    data: {
      tag: tag || '',
      updateTime: db.serverDate()
    }
  })
}

// 删除时间段（同时删除相关报名记录）
async function deleteTimeSlot(timeSlotId) {
  const db = getDb()
  // 先删除该时间段的所有报名记录
  await db.collection('registrations').where({
    timeSlotId: timeSlotId
  }).remove()
  // 再软删除时间段
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

// 批量根据ID获取时间段（返回 id → timeSlot 的 Map）
async function getTimeSlotsByIds(timeSlotIds) {
  if (!timeSlotIds || timeSlotIds.length === 0) return {}
  const db = getDb()
  const _ = db.command
  const uniqueIds = [...new Set(timeSlotIds)]
  const result = {}
  const chunkSize = 10
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize)
    const res = await db.collection('timeSlots').where({ _id: _.in(chunk) }).get()
    res.data.forEach(t => { result[t._id] = t })
  }
  return result
}

// 批量根据ID获取兵营/峡谷活动配置（返回 id → config 的 Map）
async function getArsenalConfigsByIds(configIds, activityType) {
  if (!configIds || configIds.length === 0) return {}
  const db = getDb()
  const _ = db.command
  const collectionName = activityType === 'canyon' ? 'canyonConfigs' : 'arsenalConfigs'
  const uniqueIds = [...new Set(configIds)]
  const result = {}
  const chunkSize = 10
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize)
    const res = await db.collection(collectionName).where({ _id: _.in(chunk) }).get()
    res.data.forEach(c => { result[c._id] = c })
  }
  return result
}

// 通过云函数删除时间段（绕过数据库 creator-only 写权限限制）
async function deleteTimeSlotViaCloud(timeSlotId) {
  return await wx.cloud.callFunction({
    name: 'manageTimeSlot',
    data: {
      action: 'delete',
      data: { timeSlotId }
    }
  })
}

// 通过云函数更新时间段标签（绕过数据库 creator-only 写权限限制）
async function updateTimeSlotTagViaCloud(timeSlotId, tag, fortress) {
  const cloudData = { timeSlotId }
  if (tag !== undefined) cloudData.tag = tag || ''
  if (fortress !== undefined) cloudData.fortress = fortress || ''
  return await wx.cloud.callFunction({
    name: 'manageTimeSlot',
    data: {
      action: 'updateTag',
      data: cloudData
    }
  })
}

/**
 * 报名相关操作
 */

// 创建报名记录（通过云函数，避免客户端写入后立即读取的最终一致性延迟）
async function createRegistration(data) {
  const res = await wx.cloud.callFunction({
    name: 'register',
    data: {
      action: 'create',
      data: {
        zoneId: data.zoneId,
        allianceId: data.allianceId,
        timeSlotId: data.timeSlotId,
        userId: data.userId,
        nickName: data.nickName,
        position: data.position
      }
    }
  })
  if (!res.result || res.result.err) {
    throw new Error((res.result && res.result.err) || '报名失败')
  }
  return { _id: res.result._id }
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

// 获取时间段报名列表（通过云函数，避免最终一致性延迟）
async function getRegistrationsByTimeSlot(timeSlotId) {
  const res = await wx.cloud.callFunction({
    name: 'register',
    data: {
      action: 'getByTimeSlot',
      data: { timeSlotId }
    }
  })
  if (!res.result || res.result.err) {
    throw new Error((res.result && res.result.err) || '获取报名列表失败')
  }
  return res.result.data
}

// 获取用户的报名记录
async function getRegistrationsByUser(userId) {
  const db = getDb()
  // 分页获取所有记录，避免20条限制
  let allData = []
  let skip = 0
  const batchSize = 20
  while (true) {
    const res = await db.collection('registrations').where({
      userId: userId,
      status: 'active'
    }).orderBy('createTime', 'desc').skip(skip).limit(batchSize).get()
    allData = allData.concat(res.data)
    if (res.data.length < batchSize) break
    skip += batchSize
    if (skip > 500) break
  }
  return allData
}

// 取消报名（通过云函数，避免客户端写入后立即读取的最终一致性延迟）
async function cancelRegistration(registrationId) {
  const res = await wx.cloud.callFunction({
    name: 'register',
    data: {
      action: 'cancel',
      data: { registrationId }
    }
  })
  if (!res.result || res.result.err) {
    throw new Error((res.result && res.result.err) || '取消失败')
  }
  return res.result
}

/**
 * 统计相关操作
 */

// 获取联盟统计数据
async function getAllianceStatistics(allianceId) {
  const timeSlots = await getTimeSlotsByAlliance(allianceId)
  if (timeSlots.length === 0) return []

  const timeSlotIds = timeSlots.map(s => s._id)
  const db = getDb()
  let regsBySlot = {}

  // 分页获取所有报名记录
  let allRegs = []
  let offset = 0
  const batchSize = 20

  while (true) {
    const res = await db.collection('registrations').where({
      timeSlotId: db.command.in(timeSlotIds),
      status: 'active'
    }).skip(offset).limit(batchSize).get()
    allRegs = allRegs.concat(res.data)
    if (res.data.length < batchSize) break
    offset += batchSize
    if (offset > 500) break
  }

  for (const reg of allRegs) {
    if (!regsBySlot[reg.timeSlotId]) {
      regsBySlot[reg.timeSlotId] = []
    }
    regsBySlot[reg.timeSlotId].push(reg)
  }

  return timeSlots.map(slot => {
    const regs = (regsBySlot[slot._id] || [])
      .sort((a, b) => (a.position === 'head' ? -1 : 1) - (b.position === 'head' ? -1 : 1))
    return {
      timeSlot: slot,
      registrations: regs,
      count: regs.length,
      remaining: slot.maxCount - regs.length,
      isFull: regs.length >= slot.maxCount
    }
  })
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

  // 验证起始时间格式（从0:00到0:30）
  const startTimePattern = /^0:([0-9]|[0-2][0-9]|30)$/
  if (!startTimePattern.test(data.startTime)) {
    throw new Error('起始时间格式错误，应为 0:00 到 0:30')
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
      zoneId: data.zoneId || null,
      zoneName: data.zoneName || '',
      creatorId: data.creatorId,
      status: 'active',
      createTime: db.serverDate()
    }
  })
}

// 获取官职配置列表（通过云函数读取，避免客户端写入后查询的3-5分钟最终一致性延迟）
async function getPositionConfigs(filters = {}) {
  const filterData = {}
  if (filters.zoneId) filterData.zoneId = filters.zoneId
  if (filters.creatorId) filterData.creatorId = filters.creatorId
  if (filters.allianceId) filterData.allianceId = filters.allianceId
  if (filters.date) filterData.date = filters.date
  if (filters.positionType) filterData.positionType = filters.positionType

  const res = await wx.cloud.callFunction({
    name: 'managePosition',
    data: {
      action: 'getConfigs',
      data: filterData
    }
  })
  if (!res.result || !res.result.success) {
    throw new Error((res.result && res.result.error) || '获取配置列表失败')
  }
  return res.result.data || []
}

// 根据ID获取官职配置
async function getPositionConfigById(configId) {
  const db = getDb()
  const res = await db.collection('positionConfigs').doc(configId).get()
  return res.data
}

// 删除官职配置（通过云函数绕过 creator-only 写权限，同时删除相关报名记录）
async function deletePositionConfig(configId) {
  const res = await wx.cloud.callFunction({
    name: 'managePosition',
    data: {
      action: 'deleteConfig',
      data: { configId }
    }
  })
  if (!res.result || !res.result.success) {
    throw new Error((res.result && res.result.error) || '删除配置失败')
  }
  return res.result
}

// 将 H:MM 格式统一为 HH:MM（兼容新旧数据）
function normalizeTimeToHHMM(t) {
  if (!t) return t
  return t.replace(/^(\d):/, '0$1:')
}

// 根据起始时间生成时间段列表（每30分钟一格，到24:00）
function generatePositionTimeSlots(startTime) {
  const slots = []
  const [startHourStr, startMinuteStr] = startTime.split(':')
  const startHour = parseInt(startHourStr)
  const startMinute = parseInt(startMinuteStr)

  let currentHour = startHour
  let currentMinute = startMinute

  while (currentHour < 24) {
    const timeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`
    slots.push({
      time: timeStr,
      period: currentHour < 12 ? 'morning' : 'afternoon'
    })

    currentMinute += 30
    if (currentMinute >= 60) {
      currentHour += 1
      currentMinute -= 60
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
  const normalizedTimeSlot = normalizeTimeToHHMM(data.timeSlot)

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

  // 检查时间段是否已被占用（同时检查新旧两种格式）
  const existingSlot = await db.collection('positionRegistrations')
    .where({
      configId: data.configId,
      timeSlot: db.command.in([normalizedTimeSlot, data.timeSlot]),
      status: 'active'
    })
    .get()

  if (existingSlot.data.length > 0) {
    throw new Error('该时间位置已被选择')
  }

  return await db.collection('positionRegistrations').add({
    data: {
      configId: data.configId,
      timeSlot: normalizedTimeSlot,
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
  // 分页获取所有记录，避免20条限制
  let allData = []
  let skip = 0
  const batchSize = 20
  while (true) {
    const res = await db.collection('positionRegistrations')
      .where({
        configId: configId,
        status: 'active'
      })
      .orderBy('timeSlot', 'asc')
      .skip(skip)
      .limit(batchSize)
      .get()
    allData = allData.concat(res.data)
    if (res.data.length < batchSize) break
    skip += batchSize
    if (skip > 500) break
  }
  return allData
}

// 根据时间段获取报名记录
async function getPositionRegistrationByTimeSlot(configId, timeSlot) {
  const db = getDb()
  const normalized = normalizeTimeToHHMM(timeSlot)
  const res = await db.collection('positionRegistrations')
    .where({
      configId: configId,
      timeSlot: db.command.in([normalized, timeSlot]),
      status: 'active'
    })
    .get()
  return res.data.length > 0 ? res.data[0] : null
}

// 获取用户的官职报名记录
async function getPositionRegistrationsByUser(userId) {
  const db = getDb()

  // 分页获取所有记录，避免20条限制
  let allData = []
  let skip = 0
  const batchSize = 20
  while (true) {
    const res = await db.collection('positionRegistrations')
      .where({
        userId: userId,
        status: 'active'
      })
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(batchSize)
      .get()
    allData = allData.concat(res.data)
    if (res.data.length < batchSize) break
    skip += batchSize
    if (skip > 500) break
  }

  // 获取关联的配置信息（批量获取，避免N+1查询）
  const configIds = [...new Set(allData.map(r => r.configId))]
  const configs = []
  if (configIds.length > 0) {
    const _ = db.command
    // WeChat _.in() 限制最多10个，需要分片查询
    const chunkSize = 10
    for (let i = 0; i < configIds.length; i += chunkSize) {
      const chunk = configIds.slice(i, i + chunkSize)
      const configRes = await db.collection('positionConfigs')
        .where({ _id: _.in(chunk) })
        .get()
      configs.push(...configRes.data)
    }
  }
  const configMap = {}
  configs.forEach(cfg => { configMap[cfg._id] = cfg })

  for (const reg of allData) {
    reg.config = configMap[reg.configId] || null
  }

  return allData
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

// 删除官职报名记录（通过云函数绕过 creator-only 写权限，区管/超管操作）
async function deletePositionRegistration(registrationId) {
  const res = await wx.cloud.callFunction({
    name: 'managePosition',
    data: {
      action: 'deleteRegistration',
      data: { registrationId }
    }
  })
  if (!res.result || !res.result.success) {
    throw new Error((res.result && res.result.error) || '删除报名失败')
  }
  return res.result
}

// 清空官职配置的所有报名记录（通过云函数绕过 creator-only 写权限）
async function clearPositionRegistrations(configId) {
  const res = await wx.cloud.callFunction({
    name: 'managePosition',
    data: {
      action: 'clearRegistrations',
      data: { configId }
    }
  })
  if (!res.result || !res.result.success) {
    throw new Error((res.result && res.result.error) || '清空报名失败')
  }
  return (res.result.data && res.result.data.clearedCount) || 0
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

/**
 * 国战报名相关操作
 */

// 创建国战报名配置
async function createBattleConfig(zoneId, zoneName, date, creatorId) {
  const db = getDb()

  // 检查是否已有相同日期的配置
  const existing = await db.collection('battleConfigs').where({
    zoneId: zoneId,
    date: date,
    status: 'active'
  }).get()

  if (existing.data.length > 0) {
    throw new Error('该日期已存在国战报名')
  }

  return await db.collection('battleConfigs').add({
    data: {
      zoneId: zoneId,
      zoneName: zoneName,
      date: date,
      creatorId: creatorId,
      status: 'active',
      createTime: db.serverDate()
    }
  })
}

// 获取国战配置列表
async function getBattleConfigs(zoneId) {
  const db = getDb()
  const query = { status: 'active' }
  if (zoneId) query.zoneId = zoneId

  let allConfigs = []
  let offset = 0
  const batchSize = 20
  while (true) {
    const res = await db.collection('battleConfigs')
      .where(query)
      .orderBy('date', 'asc')
      .skip(offset)
      .limit(batchSize)
      .get()
    allConfigs = allConfigs.concat(res.data)
    if (res.data.length < batchSize) break
    offset += batchSize
    if (offset > 500) break
  }

  return allConfigs
}

// 根据ID获取国战配置
async function getBattleConfigById(configId) {
  const db = getDb()
  const res = await db.collection('battleConfigs').doc(configId).get()
  return res.data
}

// 删除国战配置（通过云函数，服务端校验分区归属）
async function deleteBattleConfig(configId) {
  const res = await wx.cloud.callFunction({
    name: 'clearRegistrations',
    data: {
      action: 'deleteBattleConfig',
      data: { configId }
    }
  })
  if (!res.result || !res.result.success) {
    throw new Error((res.result && res.result.err) || '删除失败')
  }
  return res.result
}

// 创建国战报名记录
async function createBattleRegistration(data) {
  const db = getDb()
  const { configId, zoneId, userId, nickName, allianceId, allianceName, furnaceLevel, barracksLevel, diamonds, voice, position } = data

  // 检查同一 configId + nickName 是否已报名（一人多账号按昵称去重）
  const existing = await db.collection('battleRegistrations').where({
    configId: configId,
    nickName: nickName,
    status: 'active'
  }).get()

  if (existing.data.length > 0) {
    throw new Error('您已报名此国战活动')
  }

  return await db.collection('battleRegistrations').add({
    data: {
      configId: configId,
      zoneId: zoneId,
      userId: userId,
      nickName: nickName,
      allianceId: allianceId,
      allianceName: allianceName,
      furnaceLevel: furnaceLevel,
      barracksLevel: barracksLevel,
      diamonds: diamonds,
      voice: voice,
      position: position,
      assignment: position === '车头' ? nickName : '机动',
      status: 'active',
      createTime: db.serverDate()
    }
  })
}

// 获取国战配置的报名列表
async function getBattleRegistrationsByConfig(configId) {
  const db = getDb()
  const res = await db.collection('battleRegistrations').where({
    configId: configId,
    status: 'active'
  }).orderBy('createTime', 'asc').get()

  return res.data
}

// 获取用户的报名记录
async function getBattleRegistrationsByUser(userId) {
  const db = getDb()
  const res = await db.collection('battleRegistrations').where({
    userId: userId,
    status: 'active'
  }).orderBy('createTime', 'desc').get()

  return res.data
}

// 根据ID获取报名记录
async function getBattleRegistrationById(registrationId) {
  const db = getDb()
  const res = await db.collection('battleRegistrations').doc(registrationId).get()
  return res.data
}

// 更新报名分配的"安排"
async function updateBattleRegistrationAssignment(registrationId, assignment) {
  const res = await wx.cloud.callFunction({
    name: 'clearRegistrations',
    data: {
      action: 'updateBattleRegistrationAssignment',
      data: { registrationId, assignment }
    }
  })
  if (!res.result || !res.result.success) {
    throw new Error((res.result && res.result.err) || '更新失败')
  }
  return res.result
}

// 删除单条报名记录
async function deleteBattleRegistration(registrationId) {
  const db = getDb()
  return await db.collection('battleRegistrations').doc(registrationId).remove()
}

// 管理员删除单条报名记录（调用云函数绕过客户端权限）
async function adminDeleteBattleRegistration(registrationId) {
  const res = await wx.cloud.callFunction({
    name: 'clearRegistrations',
    data: {
      action: 'adminDeleteBattleRegistration',
      data: { registrationId }
    }
  })
  if (!res.result || !res.result.success) {
    throw new Error((res.result && res.result.err) || '删除失败')
  }
  return res.result
}

// 清空国战配置的所有报名
async function clearBattleRegistrations(configId) {
  const db = getDb()
  return await db.collection('battleRegistrations').where({
    configId: configId
  }).remove()
}

// 获取报名人数
async function getBattleRegistrationCount(configId) {
  const db = getDb()
  const res = await db.collection('battleRegistrations').where({
    configId: configId,
    status: 'active'
  }).count()
  return res.total
}

/**
 * 兵营/峡谷报名相关操作
 */

// 兵营/峡谷活动类型常量
const ARSENAL_ACTIVITY_TYPES = ['arsenal', 'canyon']

// 创建兵营配置
async function createArsenalConfig(data) {
  const res = await wx.cloud.callFunction({
    name: 'manageArsenal',
    data: {
      action: 'createConfig',
      data: {
        ...data,
        activityType: 'arsenal'
      }
    }
  })
  if (!res.result || !res.result.success) {
    throw new Error((res.result && res.result.error) || '创建兵营配置失败')
  }
  return res.result
}

// 获取兵营配置列表（需云函数：arsenalConfigs 集合权限为仅创建者可读写）
async function getArsenalConfigs(filters = {}) {
  const filterData = { activityType: 'arsenal' }
  if (filters.zoneId) filterData.zoneId = filters.zoneId
  if (filters.allianceId) filterData.allianceId = filters.allianceId
  if (filters.date) filterData.date = filters.date
  if (filters.creatorId) filterData.creatorId = filters.creatorId

  const res = await wx.cloud.callFunction({
    name: 'manageArsenal',
    data: {
      action: 'getConfigs',
      data: filterData
    }
  })
  if (!res.result || !res.result.success) {
    throw new Error((res.result && res.result.error) || '获取兵营配置列表失败')
  }
  return res.result.data || []
}

// 删除兵营配置
async function deleteArsenalConfig(configId) {
  const res = await wx.cloud.callFunction({
    name: 'manageArsenal',
    data: {
      action: 'deleteConfig',
      data: { configId, activityType: 'arsenal' }
    }
  })
  if (!res.result || !res.result.success) {
    throw new Error((res.result && res.result.error) || '删除兵营配置失败')
  }
  return res.result
}

// 创建峡谷配置
async function createCanyonConfig(data) {
  const res = await wx.cloud.callFunction({
    name: 'manageArsenal',
    data: {
      action: 'createConfig',
      data: {
        ...data,
        activityType: 'canyon'
      }
    }
  })
  if (!res.result || !res.result.success) {
    throw new Error((res.result && res.result.error) || '创建峡谷配置失败')
  }
  return res.result
}

// 获取峡谷配置列表（需云函数：canyonConfigs 集合权限为仅创建者可读写）
async function getCanyonConfigs(filters = {}) {
  const filterData = { activityType: 'canyon' }
  if (filters.zoneId) filterData.zoneId = filters.zoneId
  if (filters.allianceId) filterData.allianceId = filters.allianceId
  if (filters.date) filterData.date = filters.date
  if (filters.creatorId) filterData.creatorId = filters.creatorId

  const res = await wx.cloud.callFunction({
    name: 'manageArsenal',
    data: {
      action: 'getConfigs',
      data: filterData
    }
  })
  if (!res.result || !res.result.success) {
    throw new Error((res.result && res.result.error) || '获取峡谷配置列表失败')
  }
  return res.result.data || []
}

// 删除峡谷配置
async function deleteCanyonConfig(configId) {
  const res = await wx.cloud.callFunction({
    name: 'manageArsenal',
    data: {
      action: 'deleteConfig',
      data: { configId, activityType: 'canyon' }
    }
  })
  if (!res.result || !res.result.success) {
    throw new Error((res.result && res.result.error) || '删除峡谷配置失败')
  }
  return res.result
}

/**
 * 兵营报名记录相关操作
 */

// 创建兵营报名记录
async function createArsenalRegistration(data) {
  const res = await wx.cloud.callFunction({
    name: 'manageArsenal',
    data: {
      action: 'createRegistration',
      data: {
        ...data,
        activityType: 'arsenal'
      }
    }
  })
  if (!res.result || !res.result.success) {
    const rawErr = (res.result && res.result.error) || '兵营报名失败'
    throw new Error(friendlyErrorMsg(rawErr))
  }
  return res.result
}

// 获取兵营配置的报名列表
async function getArsenalRegistrations(configId) {
  const res = await wx.cloud.callFunction({
    name: 'manageArsenal',
    data: {
      action: 'getRegistrations',
      data: { configId, activityType: 'arsenal' }
    }
  })
  if (!res.result || !res.result.success) {
    throw new Error((res.result && res.result.error) || '获取兵营报名列表失败')
  }
  return res.result.data || []
}

// 取消兵营报名
async function cancelArsenalRegistration(registrationId) {
  const res = await wx.cloud.callFunction({
    name: 'manageArsenal',
    data: {
      action: 'cancelRegistration',
      data: { registrationId, activityType: 'arsenal' }
    }
  })
  if (!res.result || !res.result.success) {
    throw new Error((res.result && res.result.error) || '取消兵营报名失败')
  }
  return res.result
}

// 获取用户的兵营报名记录
async function getArsenalRegistrationsByUser(userId) {
  const res = await wx.cloud.callFunction({
    name: 'manageArsenal',
    data: {
      action: 'getRegistrationsByUser',
      data: { userId, activityType: 'arsenal' }
    }
  })
  if (!res.result || !res.result.success) {
    throw new Error((res.result && res.result.error) || '获取用户兵营报名记录失败')
  }
  return res.result.data || []
}

/**
 * 峡谷报名记录相关操作
 */

// 创建峡谷报名记录
async function createCanyonRegistration(data) {
  const res = await wx.cloud.callFunction({
    name: 'manageArsenal',
    data: {
      action: 'createRegistration',
      data: {
        ...data,
        activityType: 'canyon'
      }
    }
  })
  if (!res.result || !res.result.success) {
    const rawErr = (res.result && res.result.error) || '峡谷报名失败'
    throw new Error(friendlyErrorMsg(rawErr))
  }
  return res.result
}

// 获取峡谷配置的报名列表
async function getCanyonRegistrations(configId) {
  const res = await wx.cloud.callFunction({
    name: 'manageArsenal',
    data: {
      action: 'getRegistrations',
      data: { configId, activityType: 'canyon' }
    }
  })
  if (!res.result || !res.result.success) {
    throw new Error((res.result && res.result.error) || '获取峡谷报名列表失败')
  }
  return res.result.data || []
}

// 取消峡谷报名
async function cancelCanyonRegistration(registrationId) {
  const res = await wx.cloud.callFunction({
    name: 'manageArsenal',
    data: {
      action: 'cancelRegistration',
      data: { registrationId, activityType: 'canyon' }
    }
  })
  if (!res.result || !res.result.success) {
    throw new Error((res.result && res.result.error) || '取消峡谷报名失败')
  }
  return res.result
}

// 获取用户的峡谷报名记录
async function getCanyonRegistrationsByUser(userId) {
  const res = await wx.cloud.callFunction({
    name: 'manageArsenal',
    data: {
      action: 'getRegistrationsByUser',
      data: { userId, activityType: 'canyon' }
    }
  })
  if (!res.result || !res.result.success) {
    throw new Error((res.result && res.result.error) || '获取用户峡谷报名记录失败')
  }
  return res.result.data || []
}

/**
 * 兵营/峡谷统计
 */

// 获取兵营统计数据
async function getArsenalStats(configId, options = {}) {
  const res = await wx.cloud.callFunction({
    name: 'manageArsenal',
    data: {
      action: 'getStats',
      data: { configId, activityType: 'arsenal', includeRegistrations: options.includeRegistrations || false, userId: options.userId || null }
    }
  })
  if (!res.result || !res.result.success) {
    throw new Error((res.result && res.result.error) || '获取兵营统计失败')
  }
  return res.result.data
}

// 获取峡谷统计数据
async function getCanyonStats(configId, options = {}) {
  const res = await wx.cloud.callFunction({
    name: 'manageArsenal',
    data: {
      action: 'getStats',
      data: { configId, activityType: 'canyon', includeRegistrations: options.includeRegistrations || false, userId: options.userId || null }
    }
  })
  if (!res.result || !res.result.success) {
    throw new Error((res.result && res.result.error) || '获取峡谷统计失败')
  }
  return res.result.data
}

/**
 * 意见反馈
 */
async function createFeedback(userId, nickName, type, content, contactInfo, imageUrls) {
  const db = getDb()
  return await db.collection('feedbacks').add({
    data: {
      userId,
      nickName,
      type,
      content,
      contactInfo: contactInfo || null,
      imageUrls: imageUrls || [],
      status: 'pending',
      createTime: db.serverDate()
    }
  })
}

/**
 * 导出所有数据库操作
 */

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
  updateZoneCreator,

  // 分区
  createZone,
  getZoneByCode,
  getAllZones,
  getZonesByCreator,

  // 联盟
  initAlliances,
  getAlliancesByZone,
  getAllianceById,
  getZonesByIds,
  getAlliancesByIds,
  updateAllianceName,
  bindAllianceAuditors,
  getAllianceAuditorInfo,

  // 管理员申请查询
  getUserApplications,

  // 成员管理
  getZoneMembers,
  removeMember,

  // 时间段
  TIME_VALUES,
  TAG_OPTIONS,
  FORTRESS_OPTIONS,
  createTimeSlot,
  getTimeSlotsByAlliance,
  getMaxSlotIndex,
  updateTimeSlotRemark,
  updateTimeSlotTag,
  updateTimeSlotTagViaCloud,
  deleteTimeSlot,
  deleteTimeSlotViaCloud,
  getTimeSlotById,
  getTimeSlotsByIds,
  getArsenalConfigsByIds,

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
  isPhoneSuperAdmin,

  // 国战报名
  VOICE_OPTIONS,
  BATTLE_POSITION_OPTIONS,
  createBattleConfig,
  getBattleConfigs,
  getBattleConfigById,
  deleteBattleConfig,
  createBattleRegistration,
  getBattleRegistrationsByConfig,
  getBattleRegistrationsByUser,
  getBattleRegistrationById,
  updateBattleRegistrationAssignment,
  deleteBattleRegistration,
  adminDeleteBattleRegistration,
  clearBattleRegistrations,
  getBattleRegistrationCount,

  // 意见反馈
  createFeedback,

  // 兵营/峡谷配置
  ARSENAL_ACTIVITY_TYPES,
  createArsenalConfig,
  getArsenalConfigs,
  deleteArsenalConfig,
  createCanyonConfig,
  getCanyonConfigs,
  deleteCanyonConfig,

  // 兵营报名
  createArsenalRegistration,
  getArsenalRegistrations,
  cancelArsenalRegistration,
  getArsenalRegistrationsByUser,

  // 峡谷报名
  createCanyonRegistration,
  getCanyonRegistrations,
  cancelCanyonRegistration,
  getCanyonRegistrationsByUser,

  // 兵营/峡谷统计
  getArsenalStats,
  getCanyonStats
}