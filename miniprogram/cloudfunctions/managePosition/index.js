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
      case 'createConfig':
        return await createConfig(data)
      case 'getConfigs':
        return await getConfigs(data)
      case 'getConfigById':
        return await getConfigById(data.configId)
      case 'deleteConfig':
        return await deleteConfig(data.configId)
      case 'createRegistration':
        return await createRegistration(data)
      case 'getRegistrations':
        return await getRegistrations(data.configId)
      case 'getRegistrationsByUser':
        return await getRegistrationsByUser(data.userId)
      case 'updateRegistration':
        return await updateRegistration(data)
      case 'cancelRegistration':
        return await cancelRegistration(data.registrationId)
      case 'deleteRegistration':
        return await deleteRegistration(data.registrationId)
      case 'clearRegistrations':
        return await clearRegistrations(data.configId)
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

// 创建官职配置
async function createConfig(data) {
  // 检查配置名称是否已存在
  const existingRes = await db.collection('positionConfigs').where({
    name: data.name,
    status: 'active'
  }).get()

  if (existingRes.data.length > 0) {
    throw new Error('配置名称已存在')
  }

  const result = await db.collection('positionConfigs').add({
    data: {
      name: data.name,
      positions: data.positions || [],
      creatorId: data.creatorId,
      zoneId: data.zoneId || null,
      allianceId: data.allianceId || null,
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

// 获取配置列表
async function getConfigs(data) {
  const query = {
    status: 'active'
  }

  if (data.creatorId) {
    query.creatorId = data.creatorId
  }
  if (data.zoneId) {
    query.zoneId = data.zoneId
  }
  if (data.allianceId) {
    query.allianceId = data.allianceId
  }
  if (data.date) {
    query.date = data.date
  }
  if (data.positionType) {
    query.positionType = data.positionType
  }

  // 分页获取所有记录，避免20条限制
  let allData = []
  let skip = 0
  const batchSize = 20
  while (true) {
    const res = await db.collection('positionConfigs')
      .where(query)
      .orderBy('date', 'asc')
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(batchSize)
      .get()
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

// 获取单个配置
async function getConfigById(configId) {
  const res = await db.collection('positionConfigs').doc(configId).get()

  return {
    success: true,
    data: res.data
  }
}

// 删除配置（同时删除相关报名记录）
async function deleteConfig(configId) {
  // 先删除该配置的所有报名记录
  await db.collection('positionRegistrations').where({
    configId: configId
  }).remove()

  // 再软删除配置
  await db.collection('positionConfigs').doc(configId).update({
    data: {
      status: 'inactive',
      updateTime: db.serverDate()
    }
  })

  return {
    success: true
  }
}

// 创建报名记录（带并发检测和昵称重复检测）
async function createRegistration(data) {
  const { configId, userId, nickName, positionId, positionName, remark } = data

  // 使用事务确保原子性
  const transaction = await db.startTransaction()

  try {
    // 1. 检查昵称是否重复
    const existingNickRes = await transaction.collection('positionRegistrations').where({
      configId: configId,
      nickName: nickName,
      status: 'active'
    }).get()

    if (existingNickRes.data.length > 0) {
      await transaction.rollback()
      throw new Error('该昵称已被使用，请更换昵称')
    }

    // 2. 检查官职是否已被占用（如果有职位数量限制）
    const configRes = await transaction.collection('positionConfigs').doc(configId).get()
    const config = configRes.data

    if (config && config.positions) {
      const position = config.positions.find(p => p.id === positionId || p.name === positionName)
      if (position && position.maxCount) {
        // 检查该职位已报名人数
        const positionCountRes = await transaction.collection('positionRegistrations').where({
          configId: configId,
          positionId: positionId,
          status: 'active'
        }).count()

        if (positionCountRes.total >= position.maxCount) {
          await transaction.rollback()
          throw new Error('该官职报名人数已满')
        }
      }
    }

    // 3. 创建报名记录
    const result = await transaction.collection('positionRegistrations').add({
      data: {
        configId: configId,
        userId: userId,
        nickName: nickName,
        positionId: positionId,
        positionName: positionName,
        remark: remark || '',
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
async function getRegistrations(configId) {
  // 分页获取所有记录，避免20条限制
  let allData = []
  let skip = 0
  const batchSize = 20
  while (true) {
    const res = await db.collection('positionRegistrations').where({
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
async function getRegistrationsByUser(userId) {
  // 分页获取所有记录，避免20条限制
  let allData = []
  let skip = 0
  const batchSize = 20
  while (true) {
    const res = await db.collection('positionRegistrations').where({
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

// 更新报名记录
async function updateRegistration(data) {
  const { registrationId, nickName, positionId, positionName, remark } = data

  // 检查昵称是否与其他记录重复
  const registrationRes = await db.collection('positionRegistrations').doc(registrationId).get()
  const registration = registrationRes.data

  if (nickName && nickName !== registration.nickName) {
    const existingNickRes = await db.collection('positionRegistrations').where({
      configId: registration.configId,
      nickName: nickName,
      status: 'active',
      _id: _.neq(registrationId)
    }).get()

    if (existingNickRes.data.length > 0) {
      throw new Error('该昵称已被使用，请更换昵称')
    }
  }

  const updateData = {
    updateTime: db.serverDate()
  }

  if (nickName) updateData.nickName = nickName
  if (positionId) updateData.positionId = positionId
  if (positionName) updateData.positionName = positionName
  if (remark !== undefined) updateData.remark = remark

  await db.collection('positionRegistrations').doc(registrationId).update({
    data: updateData
  })

  return {
    success: true
  }
}

// 获取调用者用户信息（角色 + 文档 id），用于权限判定
async function getCallerUser(openid) {
  const res = await db.collection('users').where({ openid: openid }).get()
  if (res.data && res.data.length > 0) {
    return res.data[0]
  }
  return null
}

// 判断是否为特权角色（区管 / 超管），可取消或删除他人的报名
function isPrivilegedRole(role) {
  return role === 'admin' || role === 'superAdmin'
}

// 取消报名（普通用户仅可取消自己的；区管/超管可取消任何人）
async function cancelRegistration(registrationId) {
  const wxContext = cloud.getWXContext()
  const callerOpenid = wxContext.OPENID
  const caller = await getCallerUser(callerOpenid)
  const callerRole = caller ? (caller.role || 'user') : 'user'

  const regRes = await db.collection('positionRegistrations').doc(registrationId).get()
  if (!regRes.data) {
    throw new Error('报名记录不存在')
  }
  const registration = regRes.data

  if (!isPrivilegedRole(callerRole)) {
    // 普通用户：仅允许取消本人的报名
    const callerId = caller ? caller._id : null
    const isOwner = (callerId && registration.userId === callerId) || registration.userId === callerOpenid
    if (!isOwner) {
      throw new Error('无权取消他人的报名')
    }
  }

  await db.collection('positionRegistrations').doc(registrationId).update({
    data: {
      status: 'cancelled',
      updateTime: db.serverDate()
    }
  })

  return {
    success: true
  }
}

// 删除报名（仅区管 / 超管可删除他人）
async function deleteRegistration(registrationId) {
  const wxContext = cloud.getWXContext()
  const callerOpenid = wxContext.OPENID
  const caller = await getCallerUser(callerOpenid)
  const callerRole = caller ? (caller.role || 'user') : 'user'

  if (!isPrivilegedRole(callerRole)) {
    throw new Error('无权删除他人的报名')
  }

  await db.collection('positionRegistrations').doc(registrationId).update({
    data: {
      status: 'deleted',
      updateTime: db.serverDate()
    }
  })

  return {
    success: true
  }
}

// 清空配置的所有报名
async function clearRegistrations(configId) {
  // 批量更新所有活跃状态的报名记录
  const res = await db.collection('positionRegistrations').where({
    configId: configId,
    status: 'active'
  }).update({
    data: {
      status: 'cleared',
      updateTime: db.serverDate()
    }
  })

  return {
    success: true,
    data: {
      clearedCount: res.stats.updated
    }
  }
}