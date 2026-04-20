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
      case 'createApplication':
        return await createAdminApplication(data)
      case 'getPending':
        return await getPendingApplications(data)
      case 'review':
        return await reviewApplication(data)
      case 'updateRole':
        return await updateUserRole(data)
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

// 创建管理员申请
async function createAdminApplication(data) {
  const applyType = data.applyType || 'allianceManager' // 默认为盟管申请

  const result = await db.collection('admins').add({
    data: {
      userId: data.userId,
      phone: data.phone,
      applyType: applyType, // 'zoneManager' 或 'allianceManager'
      status: 'pending',
      createTime: db.serverDate()
    }
  })

  return {
    success: true,
    _id: result._id
  }
}

// 获取待审核申请
async function getPendingApplications(data) {
  const query = {
    status: 'pending'
  }

  // 如果传入 applyType，按类型筛选
  if (data && data.applyType) {
    query.applyType = data.applyType
  }

  const res = await db.collection('admins').where(query).orderBy('createTime', 'desc').get()

  return {
    data: res.data
  }
}

// 审核申请
async function reviewApplication(data) {
  const updateData = {
    status: data.status,
    reviewedBy: data.reviewedBy,
    reviewTime: db.serverDate()
  }

  // status 为 'approved' 时，记录 approvedRole
  if (data.status === 'approved' && data.approvedRole) {
    updateData.approvedRole = data.approvedRole // 'admin'(区管) 或 'auditor'(盟管)
  }

  await db.collection('admins').doc(data.applicationId).update({
    data: updateData
  })

  return {
    success: true
  }
}

// 更新用户角色
async function updateUserRole(data) {
  await db.collection('users').doc(data.userId).update({
    data: {
      role: data.role,
      updateTime: db.serverDate()
    }
  })

  return {
    success: true
  }
}