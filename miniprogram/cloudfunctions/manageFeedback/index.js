const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { action, data } = event
  const { OPENID } = await cloud.getWXContext()

  try {
    switch (action) {
      case 'getMyFeedbacks':
        return await getMyFeedbacks(OPENID)
      case 'getFeedbackDetail':
        return await getFeedbackDetail(OPENID, data)
      case 'getAllFeedbacks':
        await verifySuperAdmin(OPENID)
        return await getAllFeedbacks(data)
      case 'getFeedbackForAdmin':
        await verifySuperAdmin(OPENID)
        return await getFeedbackForAdmin(data)
      case 'replyFeedback':
        await verifySuperAdmin(OPENID)
        return await replyFeedback(data)
      default:
        return { success: false, error: 'Unknown action' }
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// 验证超管身份（phone 字段兼容 string 和 number）
async function verifySuperAdmin(openid) {
  const userRes = await db.collection('users').where({ openid }).get()
  if (userRes.data.length === 0) throw new Error('forbidden')
  const phone = userRes.data[0].phone
  if (!phone) throw new Error('forbidden')

  const saStr = await db.collection('superAdmins').where({ phone: String(phone) }).get()
  if (saStr.data.length > 0) return

  const phoneNum = parseInt(phone, 10)
  if (!isNaN(phoneNum)) {
    const saNum = await db.collection('superAdmins').where({ phone: phoneNum }).get()
    if (saNum.data.length > 0) return
  }

  throw new Error('forbidden')
}

// 用户查询自己的反馈列表
async function getMyFeedbacks(openid) {
  const res = await db.collection('feedbacks')
    .where({ userId: openid })
    .orderBy('createTime', 'desc')
    .limit(100)
    .get()

  const list = res.data.map(item => ({
    _id: item._id,
    type: item.type,
    title: item.content ? item.content.slice(0, 20) : '',
    truncated: item.content ? item.content.length > 20 : false,
    createTime: item.createTime,
    hasReply: !!(item.replies && item.replies.length > 0) || !!item.reply,
    isRead: item.isRead || false
  }))

  return { success: true, data: list }
}

// 用户查看单条反馈详情，并将 isRead 置 true
async function getFeedbackDetail(openid, data) {
  const { feedbackId } = data || {}
  if (!feedbackId) throw new Error('缺少 feedbackId')

  const res = await db.collection('feedbacks').doc(feedbackId).get()
  const item = res.data

  if (item.userId !== openid) throw new Error('forbidden')

  // 兼容旧数据（单条 reply 字段）和新数据（replies 数组）
  let replies = item.replies || []
  if (replies.length === 0 && item.reply) {
    replies = [{ content: item.reply, repliedAt: item.repliedAt || null }]
  }

  const hasReply = replies.length > 0
  if (hasReply && !item.isRead) {
    await db.collection('feedbacks').doc(feedbackId).update({
      data: { isRead: true }
    })
  }

  return {
    success: true,
    data: {
      _id: item._id,
      type: item.type,
      content: item.content,
      imageUrls: item.imageUrls || [],
      createTime: item.createTime,
      replies: replies
    }
  }
}

// 超管查询全部反馈列表（分页）
async function getAllFeedbacks(data) {
  const skip = Number((data || {}).skip) || 0
  const limit = Math.min(Number((data || {}).limit) || 20, 100)

  const res = await db.collection('feedbacks')
    .orderBy('createTime', 'desc')
    .skip(skip)
    .limit(limit)
    .get()

  const countRes = await db.collection('feedbacks').count()

  const list = res.data.map(item => ({
    _id: item._id,
    nickName: item.nickName || '匿名',
    type: item.type,
    title: item.content ? item.content.slice(0, 20) : '',
    truncated: item.content ? item.content.length > 20 : false,
    createTime: item.createTime,
    hasReply: !!(item.replies && item.replies.length > 0) || !!item.reply
  }))

  return { success: true, data: list, total: countRes.total }
}

// 超管查询单条反馈完整内容（用于回复页）
async function getFeedbackForAdmin(data) {
  const { feedbackId } = data || {}
  if (!feedbackId) throw new Error('缺少 feedbackId')

  const res = await db.collection('feedbacks').doc(feedbackId).get()
  const item = res.data

  // 兼容旧数据（单条 reply 字段）和新数据（replies 数组）
  let replies = item.replies || []
  if (replies.length === 0 && item.reply) {
    replies = [{ content: item.reply, repliedAt: item.repliedAt || null }]
  }

  // 反馈图片是其他用户上传的，客户端直接调用 getTempFileURL 会受存储安全规则限制而失败，
  // 需在云函数（管理员权限）里解析成可访问的临时链接
  const imageUrls = await resolveImageUrls(item.imageUrls)

  return {
    success: true,
    data: {
      _id: item._id,
      nickName: item.nickName || '匿名',
      type: item.type,
      content: item.content,
      imageUrls: imageUrls,
      createTime: item.createTime,
      replies: replies
    }
  }
}

// 将云存储 fileID 数组解析为可访问的临时链接
async function resolveImageUrls(fileIds) {
  if (!fileIds || fileIds.length === 0) return []
  try {
    const res = await cloud.getTempFileURL({ fileList: fileIds })
    return res.fileList.map(f => f.tempFileURL || f.fileID)
  } catch (err) {
    console.error('解析反馈图片地址失败:', err)
    return fileIds
  }
}

// 超管追加新回复（每次新增一条，不覆盖旧回复）
async function replyFeedback(data) {
  const { feedbackId, reply } = data || {}
  if (!feedbackId || !reply || !reply.trim()) throw new Error('缺少必要参数')

  const now = new Date()
  const newReply = { content: reply.trim(), repliedAt: now }

  const updateRes = await db.collection('feedbacks').doc(feedbackId).update({
    data: {
      replies: _.push(newReply),
      repliedAt: now,  // 顶层字段用于自动删除查询
      isRead: false
    }
  })

  if (updateRes.stats.updated === 0) throw new Error('反馈不存在')

  return { success: true }
}
