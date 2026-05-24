const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { action, data } = event

  try {
    switch (action) {
      case 'adminDeleteRegistration':
        return await adminDeleteRegistration(data)
      default:
        return { success: false, error: 'Unknown action' }
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// 验证调用者是否为 admin 或 superAdmin
async function verifyAdminRole(openid) {
  const userRes = await db.collection('users').where({ openid }).get()
  if (userRes.data.length === 0) {
    throw new Error('用户不存在')
  }
  const user = userRes.data[0]
  const role = user.role || 'user'

  if (role === 'admin' || role === 'superAdmin') {
    return true
  }

  // 兼容 superAdmin 通过 phone 判断
  const phone = user.phone
  if (phone) {
    const saRes = await db.collection('superAdmins').where({ phone }).get()
    if (saRes.data.length > 0) return true
    const phoneNum = parseInt(phone, 10)
    if (!isNaN(phoneNum)) {
      const saNumRes = await db.collection('superAdmins').where({ phone: phoneNum }).get()
      if (saNumRes.data.length > 0) return true
    }
  }

  throw new Error('权限不足，仅区管和超级管理员可删除报名记录')
}

// 管理员删除单条国战报名记录（绕过客户端权限限制）
async function adminDeleteRegistration(data) {
  const { registrationId } = data || {}
  if (!registrationId) {
    throw new Error('缺少 registrationId 参数')
  }

  const wxContext = await cloud.getWXContext()
  await verifyAdminRole(wxContext.OPENID)

  await db.collection('battleRegistrations').doc(registrationId).remove()

  return { success: true }
}
