// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  const { action } = event
  // 兼容两种调用约定：前端既可能把参数放在 event.data 内，
  // 也可能直接放在 event 顶层（callFunction 的 data 字段即 event）。
  // 统一取 data = event.data || event，避免 data 为 undefined 导致读取属性报错。
  const data = (event && event.data) || event

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
      case 'listApplications':
        return await listApplications(data)
      case 'deleteApplication':
        return await deleteApplication(data)
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

// 拉取全部申请（待审核 + 已审核），服务端管理员权限，无小程序端 20 条上限
// 同时补全申请人昵称/头像，减少前端往返，解决列表慢与不全的问题
async function listApplications(data) {
  const wherePending = { status: 'pending' }
  const whereReviewed = { status: _.in(['approved', 'rejected']) }
  if (data && data.applyType) {
    wherePending.applyType = data.applyType
    whereReviewed.applyType = data.applyType
  }

  const pending = await fetchAll('admins', wherePending, 'createTime', 'desc')
  const reviewed = await fetchAll('admins', whereReviewed, 'reviewTime', 'desc')

  const openids = [...new Set([...pending, ...reviewed].map(a => a.userId).filter(Boolean))]
  const userMap = await fetchUsers(openids)

  const enrich = (a) => {
    const u = userMap[a.userId] || {}
    return Object.assign({}, a, {
      nickName: u.nickName || '未知用户',
      avatarUrl: u.avatarUrl || null,
      userDocId: u._id || null,
      valid: !!u._id
    })
  }

  // 统计：直接从已拉取的全量数组计算，避免额外 count() 往返（省掉 5 次 DB 调用，显著降低云函数耗时）
  const pendingByType = { zoneManager: 0, allianceManager: 0, zoneCreation: 0 }
  for (const p of pending) {
    if (pendingByType[p.applyType] !== undefined) pendingByType[p.applyType]++
  }

  return {
    success: true,
    pending: pending.map(enrich),
    reviewed: reviewed.map(enrich),
    stats: {
      pendingTotal: pending.length,
      reviewedTotal: reviewed.length,
      pendingByType
    }
  }
}

// 服务端分页拉取（突破单 get 100 条上限，最多 1000 条）
async function fetchAll(collection, where, orderField, orderDir) {
  const MAX = 1000
  const pageSize = 100
  const all = []
  let skip = 0
  while (all.length < MAX) {
    const res = await db.collection(collection).where(where).orderBy(orderField, orderDir).skip(skip).limit(pageSize).get()
    const data = (res && res.data) || []
    all.push.apply(all, data)
    if (data.length < pageSize) break
    skip += pageSize
  }
  return all
}

// 批量查用户（服务端分块，单 get 上限 100）
async function fetchUsers(openids) {
  const map = {}
  for (let i = 0; i < openids.length; i += 100) {
    const chunk = openids.slice(i, i + 100)
    try {
      const res = await db.collection('users').where({ openid: _.in(chunk) }).get()
      for (const u of (res.data || [])) {
        map[u.openid] = { nickName: u.nickName || '未知用户', avatarUrl: u.avatarUrl, _id: u._id }
      }
    } catch (err) {
      console.error('批量获取用户信息失败:', err)
    }
  }
  return map
}

// 删除申请记录（服务端管理员权限，真正落库；前端直连会被集合权限拒绝导致删了又复活）
async function deleteApplication(data) {
  const ctx = cloud.getWXContext()
  const callerOpenid = ctx && ctx.OPENID
  if (!callerOpenid) return { err: 'no openid' }

  const userRes = await db.collection('users').where({ openid: callerOpenid }).get()
  const caller = userRes.data && userRes.data[0]
  if (!caller || caller.role !== 'superAdmin') {
    return { err: 'permission denied' }
  }

  await db.collection('admins').doc(data.applicationId).remove()
  return { success: true }
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