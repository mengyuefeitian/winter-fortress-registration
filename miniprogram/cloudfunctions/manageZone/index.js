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
      case 'create':
        return await createZone(data)
      case 'getByCreator':
        return await getZonesByCreator(data.creatorId)
      case 'getAll':
        return await getAllZones()
      case 'delete':
        return await deleteZone(data.zoneId)
      case 'updateAllianceName':
        return await updateAllianceName(data.allianceId, data.name)
      case 'bindAllianceAuditor':
        return await bindAllianceAuditor(data.allianceId, data.auditorId)
      case 'unbindAllianceAuditor':
        return await unbindAllianceAuditor(data.allianceId, data.auditorId)
      case 'getAlliancesByZone':
        return await getAlliancesByZone(data.zoneId)
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

// 创建分区
async function createZone(data) {
  // 检查分区编号是否已存在
  const existingRes = await db.collection('zones').where({
    zoneCode: data.zoneCode,
    status: 'active'
  }).get()

  if (existingRes.data.length > 0) {
    throw new Error('分区编号已存在')
  }

  const result = await db.collection('zones').add({
    data: {
      zoneCode: data.zoneCode,
      zoneName: data.zoneName,
      creatorId: data.creatorId,
      status: 'active',
      createTime: db.serverDate()
    }
  })

  return {
    success: true,
    _id: result._id
  }
}

// 获取管理员创建的分区
async function getZonesByCreator(creatorId) {
  const res = await db.collection('zones').where({
    creatorId: creatorId,
    status: 'active'
  }).orderBy('createTime', 'desc').get()

  return {
    data: res.data
  }
}

// 获取所有活跃分区
async function getAllZones() {
  const res = await db.collection('zones').where({
    status: 'active'
  }).orderBy('createTime', 'desc').get()

  return {
    data: res.data
  }
}

// 删除分区
async function deleteZone(zoneId) {
  await db.collection('zones').doc(zoneId).update({
    data: {
      status: 'inactive',
      updateTime: db.serverDate()
    }
  })

  return {
    success: true
  }
}

// 获取分区的联盟列表（云函数版本，不受客户端权限限制）
async function getAlliancesByZone(zoneId) {
  const res = await db.collection('alliances').where({
    zoneId: zoneId
  }).orderBy('allianceIndex', 'asc').get()

  // 兼容旧数据
  for (const alliance of res.data) {
    if (alliance.auditorId && !alliance.auditorIds) {
      alliance.auditorIds = [alliance.auditorId]
    } else if (!alliance.auditorIds) {
      alliance.auditorIds = []
    }
  }

  return { data: res.data }
}

// 更新联盟名称（云函数版本，绕过客户端权限限制）
async function updateAllianceName(allianceId, name) {
  await db.collection('alliances').doc(allianceId).update({
    data: {
      allianceName: name,
      updateTime: db.serverDate()
    }
  })

  return { success: true }
}

// 绑定盟管到联盟
async function bindAllianceAuditor(allianceId, auditorId) {
  const alliance = await db.collection('alliances').doc(allianceId).get()
  let currentIds = alliance.data.auditorIds || []

  // 兼容旧数据
  if (alliance.data.auditorId && !alliance.data.auditorIds) {
    currentIds = [alliance.data.auditorId]
  }

  if (currentIds.includes(auditorId)) {
    throw new Error('该盟管已绑定此联盟')
  }

  currentIds.push(auditorId)

  await db.collection('alliances').doc(allianceId).update({
    data: {
      auditorId: null,
      auditorIds: currentIds,
      updateTime: db.serverDate()
    }
  })

  return { success: true }
}

// 从联盟解绑盟管
async function unbindAllianceAuditor(allianceId, auditorId) {
  const alliance = await db.collection('alliances').doc(allianceId).get()
  let currentIds = alliance.data.auditorIds || []

  // 兼容旧数据
  if (alliance.data.auditorId && !alliance.data.auditorIds) {
    currentIds = [alliance.data.auditorId]
  }

  currentIds = currentIds.filter(id => id !== auditorId)

  await db.collection('alliances').doc(allianceId).update({
    data: {
      auditorId: null,
      auditorIds: currentIds,
      updateTime: db.serverDate()
    }
  })

  return { success: true }
}