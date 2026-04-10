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
        return await createZone(data)
      case 'getByCreator':
        return await getZonesByCreator(data.creatorId)
      case 'getAll':
        return await getAllZones()
      case 'delete':
        return await deleteZone(data.zoneId)
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