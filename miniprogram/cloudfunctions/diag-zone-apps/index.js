// 诊断用云函数（只读）：列出 admins 集合中所有分区开通(zoneCreation)申请
// 用途：定位「超管看不到审批条目」——确认记录是否存在、status 是什么、zoneName 存了什么
// 用完可删除，不影响任何业务
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    const res = await db.collection('admins')
      .where({ applyType: 'zoneCreation' })
      .orderBy('createTime', 'desc')
      .limit(100)
      .get()
    const list = (res.data || []).map(a => ({
      _id: a._id,
      status: a.status,
      zoneName: a.zoneName,
      userId: a.userId,
      phone: a.phone,
      createTime: a.createTime
    }))
    return { success: true, count: list.length, applications: list }
  } catch (err) {
    return { success: false, err: err.message }
  }
}
