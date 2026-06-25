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

let collectionsEnsured = false

// 云函数入口函数
exports.main = async (event, context) => {
  const { action, data } = event

  // 每个实例只初始化一次集合，避免并发时重复创建导致 ResourceUnavailable
  if (!collectionsEnsured) {
    await ensureCollections()
    collectionsEnsured = true
  }

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
  console.log('verifyRole called with openid:', openid)

  const userRes = await db.collection('users').where({
    openid: openid
  }).get()

  console.log('users query result count:', userRes.data.length)

  if (userRes.data.length === 0) {
    throw new Error('用户不存在 (openid: ' + openid + ')')
  }

  const user = userRes.data[0]
  const userId = user._id
  const userRole = user.role || 'user'
  const userPhone = user.phone || null
  console.log('Found user, _id:', userId, 'role:', userRole, 'phone:', userPhone)

  // 检查 superAdmin：用 phone 匹配（superAdmins 集合只存了 phone）
  if (userPhone) {
    const superAdminPhoneRes = await db.collection('superAdmins').where({
      phone: userPhone
    }).get()
    console.log('superAdmins by phone query count:', superAdminPhoneRes.data.length)
    if (superAdminPhoneRes.data.length > 0) {
      console.log('User is superAdmin (matched by phone)')
      return { role: 'superAdmin', userId: userId, openid: openid }
    }
    // 兼容 phone 为 number 类型的旧数据
    const phoneNum = parseInt(userPhone, 10)
    if (!isNaN(phoneNum)) {
      const superAdminPhoneNumRes = await db.collection('superAdmins').where({
        phone: phoneNum
      }).get()
      console.log('superAdmins by phone number query count:', superAdminPhoneNumRes.data.length)
      if (superAdminPhoneNumRes.data.length > 0) {
        console.log('User is superAdmin (matched by phone number)')
        return { role: 'superAdmin', userId: userId, openid: openid }
      }
    }
  }

  // admin/auditor 直接用 users.role
  if (userRole === 'admin' || userRole === 'auditor') {
    return { role: userRole, userId: userId, openid: openid }
  }

  // 权限不足：提供详细日志
  console.log('PERMISSION DENIED: user _id:', userId, 'role:', userRole, 'phone:', userPhone,
    'openid:', openid, 'auditorIds:', JSON.stringify(user.auditorIds || []))
  throw new Error('权限不足（当前角色: ' + userRole + '，需要 auditor/admin/superAdmin）')
}

// 验证盟管是否绑定到指定联盟（alliances.auditorIds 存的是 users._id）
async function verifyAuditorAlliance(userId, allianceId) {
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
  console.log('=== createConfig ENTRY POINT ===')
  const wxContext = await cloud.getWXContext()
  const openid = wxContext.OPENID
  console.log('=== OPENID:', openid, '===')
  const roleInfo = await verifyRole(openid)
  const { role, userId } = roleInfo
  console.log('=== ROLE:', role, 'USER_ID:', userId, '===')

  const { activityType, date, timeValue, corps, zoneId, zoneName, allianceId, allianceName } = data

  // 详细日志：打印收到的所有参数
  console.log('createConfig called with:', JSON.stringify({
    activityType, date, timeValue, corps, zoneId, zoneName, allianceId, allianceName, role, userId, openid: openid
  }))

  if (!activityType || !date || !timeValue || !corps) {
    throw new Error('缺少必要参数: ' + JSON.stringify({ activityType, date, timeValue, corps }))
  }

  // 盟管需要验证联盟绑定
  if (role === 'auditor') {
    if (!allianceId) {
      throw new Error('盟管需要指定联盟ID')
    }
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

  // 确保 query 对象至少有一个条件，避免全 undefined 报错
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

  const collectionName = getCollectionNames(activityType).config

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

  // 分页获取所有记录，避免20条限制
  let allData = []
  let skip = 0
  const batchSize = 20
  while (true) {
    const res = await db.collection(collectionName).where({
      configId: configId,
      status: 'active'
    }).orderBy('createTime', 'asc').skip(skip).limit(batchSize).get()
    allData = allData.concat(res.data)
    if (res.data.length < batchSize) break
    skip += batchSize
    if (skip > 500) break
  }

  return {
    success: true,
    data: allData
  }
}

// 获取用户的报名记录
async function getRegistrationsByUser(data) {
  const { userId, activityType } = data

  if (!userId || !activityType) {
    throw new Error('缺少必要参数')
  }

  const collectionName = getCollectionNames(activityType).registration

  // 分页获取所有记录，避免20条限制
  let allData = []
  let skip = 0
  const batchSize = 20
  while (true) {
    const res = await db.collection(collectionName).where({
      userId: userId,
      status: 'active'
    }).orderBy('createTime', 'desc').skip(skip).limit(batchSize).get()
    allData = allData.concat(res.data)
    if (res.data.length < batchSize) break
    skip += batchSize
    if (skip > 500) break
  }

  return {
    success: true,
    data: allData
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
  const wxContext2 = await cloud.getWXContext()
  const openid2 = wxContext2.OPENID
  // 报名记录的 userId 可能是 users._id 或 openid，两种都尝试
  const userRes = await db.collection('users').where({ openid: openid2 }).get()
  const isOwner = userRes.data.length > 0
    ? (registration.userId === userRes.data[0]._id || registration.userId === openid2)
    : (registration.userId === openid2)
  if (!isOwner) {
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
  const { configId, activityType, includeRegistrations, userId } = data

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

  // 查询报名记录：
  // - includeRegistrations=true: 查所有记录（统计页）
  // - userId 存在但 includeRegistrations=false: 只查该用户的记录（列表页 isMyConfig）
  // - 都没有: 不查询（最快）
  let allRegs = []
  let userRegs = []
  if (includeRegistrations) {
    let skip = 0
    const batchSize = 20
    while (true) {
      const res = await db.collection(collectionName).where({
        configId: configId,
        status: 'active'
      }).skip(skip).limit(batchSize).get()
      allRegs = allRegs.concat(res.data)
      if (res.data.length < batchSize) break
      skip += batchSize
      if (skip > 200) break
    }
  } else if (userId) {
    userRegs = (await db.collection(collectionName).where({
      configId: configId,
      userId: userId,
      status: 'active'
    }).limit(50).get()).data || []
  }

  return {
    success: true,
    data: {
      totalRegistered: totalRes.total,
      combatCount: combatCount,
      substituteCount: substituteCount,
      combatRemaining: DEFAULT_CAPACITY.combat - combatCount,
      substituteRemaining: DEFAULT_CAPACITY.substitute - substituteCount,
      // 兼容前端不同页面的字段名
      combat: combatCount,
      substitute: substituteCount,
      count: totalRes.total,
      registrations: allRegs,
      myRegistrations: includeRegistrations ? allRegs : userRegs
    }
  }
}
