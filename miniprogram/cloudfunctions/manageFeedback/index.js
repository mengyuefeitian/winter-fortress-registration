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
    createTime: item.createTime,
    hasReply: !!item.reply,
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

  if (item.reply && !item.isRead) {
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
      reply: item.reply || null,
      repliedAt: item.repliedAt || null
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
    createTime: item.createTime,
    hasReply: !!item.reply
  }))

  return { success: true, data: list, total: countRes.total }
}

// 超管查询单条反馈完整内容（用于回复页）
async function getFeedbackForAdmin(data) {
  const { feedbackId } = data || {}
  if (!feedbackId) throw new Error('缺少 feedbackId')

  const res = await db.collection('feedbacks').doc(feedbackId).get()
  const item = res.data

  return {
    success: true,
    data: {
      _id: item._id,
      nickName: item.nickName || '匿名',
      type: item.type,
      content: item.content,
      imageUrls: item.imageUrls || [],
      createTime: item.createTime,
      reply: item.reply || null,
      repliedAt: item.repliedAt || null
    }
  }
}

// 超管写入回复
async function replyFeedback(data) {
  const { feedbackId, reply } = data || {}
  if (!feedbackId || !reply || !reply.trim()) throw new Error('缺少必要参数')

  const updateRes = await db.collection('feedbacks').doc(feedbackId).update({
    data: {
      reply: reply.trim(),
      repliedAt: db.serverDate(),
      isRead: false
    }
  })

  if (updateRes.stats.updated === 0) throw new Error('反馈不存在')

  return { success: true }
}
