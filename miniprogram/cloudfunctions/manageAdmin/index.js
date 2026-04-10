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
        return await getPendingApplications()
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
  const result = await db.collection('admins').add({
    data: {
      userId: data.userId,
      phone: data.phone,
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
async function getPendingApplications() {
  const res = await db.collection('admins').where({
    status: 'pending'
  }).orderBy('createTime', 'desc').get()

  return {
    data: res.data
  }
}

// 审核申请
async function reviewApplication(data) {
  await db.collection('admins').doc(data.applicationId).update({
    data: {
      status: data.status,
      reviewedBy: data.reviewedBy,
      reviewTime: db.serverDate()
    }
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