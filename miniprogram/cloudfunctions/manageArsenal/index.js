// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 容量默认配置
const DEFAULT_CAPACITY = {
  combat: 30,
  substitute: 10
}

// 确保所需集合存在（云函数端可创建集合）
const ARSENAL_COLLECTIONS = ['arsenalConfigs', 'arsenalRegistrations', 'canyonConfigs', 'canyonRegistrations']

async function ensureCollections() {
  for (const name of ARSENAL_COLLECTIONS) {
    try {
      await db.createCollection(name)
    } catch (err) {
      // 集合已存在会报错，忽略
      if (err.errMsg && err.errMsg.includes('collection name has been used')) {
        // 已存在，正常
      } else if (err.errMsg && err.errMsg.includes('already exist')) {
        // 已存在，正常
      } else if (err.errCode === -502005 || (err.errMsg && err.errMsg.includes('not exists'))) {
        // 重试一次
        try { await db.createCollection(name) } catch (_) {}
      }
      // 其他错误也忽略，不影响主流程
    }
  }
}

// 活动类型对应的集合名称映射
function getCollectionNames(activityType) {
  if (activityType === 'arsenal') {
    return { config: 'arsenalConfigs', registration: 'arsenalRegistrations' }
  }
  if (activityType === 'canyon') {
    return { config: 'canyonConfigs', registration: 'canyonRegistrations' }
  }
  throw new Error('无效的活动类型')
}

// 云函数入口函数
exports.main = async (event, context) => {
  const { action, data } = event

  // 首次调用时自动创建集合
  await ensureCollections()

  try {
    switch (action) {
      case 'createConfig':
        return await createConfig(data)
      case 'getConfigs':
        return await getConfigs(data)
      case 'deleteConfig':
        return await deleteConfig(data)
      case 'createRegistration':
        return await createRegistration(data)
      case 'getRegistrations':
        return await getRegistrations(data)
      case 'getRegistrationsByUser':
        return await getRegistrationsByUser(data)
      case 'cancelRegistration':
        return await cancelRegistration(data)
      case 'getStats':
        return await getStats(data)
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

// 验证用户角色（auditor/admin/superAdmin）
async function verifyRole(openid) {
  // 检查是否为超级管理员
  const superAdminRes = await db.collection('superAdmins').where({
    userId: openid
  }).get()

  if (superAdminRes.data.length > 0) {
    return { role: 'superAdmin', userId: openid }
  }

  // 检查是否为区管或盟管（admins 集合中 approved 状态）
  const adminRes = await db.collection('admins').where({
    userId: openid,
    status: 'approved'
  }).get()

  if (adminRes.data.length > 0) {
    const adminRecord = adminRes.data[0]
    // approvedRole 为 'admin'(区管) 或 'auditor'(盟管)
    const role = adminRecord.approvedRole || 'admin'
    return { role: role, userId: openid }
  }

  throw new Error('权限不足')
}

// 验证盟管是否绑定到指定联盟
async function verifyAuditorAlliance(userId, allianceId) {
  const adminRes = await db.collection('admins').where({
    userId: userId,
    status: 'approved',
    approvedRole: 'auditor'
  }).get()

  if (adminRes.data.length === 0) {
    throw new Error('权限不足')
  }

  // 检查盟管是否绑定到该联盟（通过 alliances 集合中的 auditorIds）
  const allianceRes = await db.collection('alliances').where({
    _id: allianceId,
    auditorIds: userId
  }).get()

  if (allianceRes.data.length === 0) {
    throw new Error('您未绑定到该联盟，无权操作')
  }

  return true
}

// 创建活动配置
async function createConfig(data) {
  const { openid } = await cloud.getWXContext()
  const { role, userId } = await verifyRole(openid)

  const { activityType, date, timeValue, corps, zoneId, zoneName, allianceId, allianceName } = data

  if (!activityType || !date || !timeValue || !corps) {
    throw new Error('缺少必要参数')
  }

  // 盟管需要验证联盟绑定
  if (role === 'auditor' && allianceId) {
    await verifyAuditorAlliance(userId, allianceId)
  }

  const collectionName = getCollectionNames(activityType).config

  const result = await db.collection(collectionName).add({
    data: {
      activityType: activityType,
      date: date,
      timeValue: timeValue,
      corps: corps,
      zoneId: zoneId || null,
      zoneName: zoneName || '',
      allianceId: allianceId || null,
      allianceName: allianceName || '',
      creatorId: userId,
      capacity: {
        combat: DEFAULT_CAPACITY.combat,
        substitute: DEFAULT_CAPACITY.substitute
      },
      status: 'active',
      createTime: db.serverDate()
    }
  })

  return {
    success: true,
    data: {
      _id: result._id
    }
  }
}

// 获取配置列表（支持分页）
async function getConfigs(data) {
  const { activityType, zoneId, allianceId, date } = data

  if (!activityType) {
    throw new Error('缺少活动类型参数')
  }

  const collectionName = getCollectionNames(activityType).config

  const query = {
    status: 'active'
  }

  if (zoneId) {
    query.zoneId = zoneId
  }
  if (allianceId) {
    query.allianceId = allianceId
  }
  if (date) {
    query.date = date
  }

  // 分页获取所有记录（>100 时循环拉取）
  let allData = []
  let skip = 0
  const limit = 100
  let hasMore = true

  while (hasMore) {
    const res = await db.collection(collectionName)
      .where(query)
      .orderBy('date', 'asc')
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(limit)
      .get()

    allData = allData.concat(res.data)
    hasMore = res.data.length === limit
    skip += limit
  }

  return {
    success: true,
    data: allData
  }
}

// 删除配置（同时删除相关报名记录）
async function deleteConfig(data) {
  const { configId, activityType } = data

  if (!configId || !activityType) {
    throw new Error('缺少必要参数')
  }

  const collections = getCollectionNames(activityType)

  // 先删除该配置的所有报名记录
  await db.collection(collections.registration).where({
    configId: configId
  }).remove()

  // 再软删除配置
  await db.collection(collections.config).doc(configId).update({
    data: {
      status: 'inactive',
      updateTime: db.serverDate()
    }
  })

  return {
    success: true
  }
}

// 创建报名记录（带事务）
async function createRegistration(data) {
  const { activityType, configId, userId, nickName, position } = data

  if (!activityType || !configId || !userId || !nickName || !position) {
    throw new Error('缺少必要参数')
  }

  if (position !== 'combat' && position !== 'substitute') {
    throw new Error('无效的职位类型')
  }

  const collections = getCollectionNames(activityType)
  const capacity = DEFAULT_CAPACITY

  // 使用事务确保原子性
  const transaction = await db.startTransaction()

  try {
    // 1. 检查配置是否存在且活跃
    const configRes = await transaction.collection(collections.config).doc(configId).get()
    const config = configRes.data

    if (!config || config.status !== 'active') {
      await transaction.rollback()
      throw new Error('配置不存在或已失效')
    }

    // 2. 统计当前参战/替补人数
    const combatCountRes = await transaction.collection(collections.registration).where({
      configId: configId,
      position: 'combat',
      status: 'active'
    }).count()

    const substituteCountRes = await transaction.collection(collections.registration).where({
      configId: configId,
      position: 'substitute',
      status: 'active'
    }).count()

    const combatCount = combatCountRes.total
    const substituteCount = substituteCountRes.total

    // 3. 检查名额是否已满
    if (position === 'combat' && combatCount >= capacity.combat) {
      await transaction.rollback()
      throw new Error('参战名额已满')
    }

    if (position === 'substitute' && substituteCount >= capacity.substitute) {
      await transaction.rollback()
      throw new Error('替补名额已满')
    }

    // 4. 检查昵称唯一性
    const existingNickRes = await transaction.collection(collections.registration).where({
      configId: configId,
      nickName: nickName,
      status: 'active'
    }).get()

    if (existingNickRes.data.length > 0) {
      await transaction.rollback()
      throw new Error('该昵称已被使用')
    }

    // 5. 创建报名记录
    const result = await transaction.collection(collections.registration).add({
      data: {
        configId: configId,
        userId: userId,
        nickName: nickName,
        position: position,
        status: 'active',
        createTime: db.serverDate()
      }
    })

    await transaction.commit()

    return {
      success: true,
      data: {
        _id: result._id
      }
    }
  } catch (err) {
    await transaction.rollback()
    throw err
  }
}

// 获取配置的所有报名记录
async function getRegistrations(data) {
  const { configId, activityType } = data

  if (!configId || !activityType) {
    throw new Error('缺少必要参数')
  }

  const collectionName = getCollectionNames(activityType).registration

  const res = await db.collection(collectionName).where({
    configId: configId,
    status: 'active'
  }).orderBy('createTime', 'asc').get()

  return {
    success: true,
    data: res.data
  }
}

// 获取用户的报名记录
async function getRegistrationsByUser(data) {
  const { userId, activityType } = data

  if (!userId || !activityType) {
    throw new Error('缺少必要参数')
  }

  const collectionName = getCollectionNames(activityType).registration

  const res = await db.collection(collectionName).where({
    userId: userId,
    status: 'active'
  }).orderBy('createTime', 'desc').get()

  return {
    success: true,
    data: res.data
  }
}

// 取消报名
async function cancelRegistration(data) {
  const { registrationId, activityType } = data

  if (!registrationId || !activityType) {
    throw new Error('缺少必要参数')
  }

  const collections = getCollectionNames(activityType)

  // 获取报名记录验证所有权
  const registrationRes = await db.collection(collections.registration).doc(registrationId).get()
  const registration = registrationRes.data

  if (!registration) {
    throw new Error('报名记录不存在')
  }

  // 验证用户是否为该报名记录的创建者
  const { openid } = await cloud.getWXContext()
  if (registration.userId !== openid) {
    throw new Error('无权取消此报名')
  }

  // 软删除报名记录
  await db.collection(collections.registration).doc(registrationId).update({
    data: {
      status: 'cancelled',
      updateTime: db.serverDate()
    }
  })

  return {
    success: true
  }
}

// 获取统计信息
async function getStats(data) {
  const { configId, activityType } = data

  if (!configId || !activityType) {
    throw new Error('缺少必要参数')
  }

  const collectionName = getCollectionNames(activityType).registration

  const combatCountRes = await db.collection(collectionName).where({
    configId: configId,
    position: 'combat',
    status: 'active'
  }).count()

  const substituteCountRes = await db.collection(collectionName).where({
    configId: configId,
    position: 'substitute',
    status: 'active'
  }).count()

  const totalRes = await db.collection(collectionName).where({
    configId: configId,
    status: 'active'
  }).count()

  const combatCount = combatCountRes.total
  const substituteCount = substituteCountRes.total

  return {
    success: true,
    data: {
      totalRegistered: totalRes.total,
      combatCount: combatCount,
      substituteCount: substituteCount,
      combatRemaining: DEFAULT_CAPACITY.combat - combatCount,
      substituteRemaining: DEFAULT_CAPACITY.substitute - substituteCount
    }
  }
}
