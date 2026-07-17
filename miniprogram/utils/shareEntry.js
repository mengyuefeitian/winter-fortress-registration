// utils/shareEntry.js
// 分享进入的报名页：校验登录状态与分区归属。
// 校验不通过时，展示半透明悬浮提醒，并跳转回首页（首页既能登录也能重新选择分区）。
const app = getApp()

// 展示悬浮提醒并跳回首页
function showReminderAndExit(page, text) {
  const comp = page.selectComponent('#entryReminder')
  if (comp && typeof comp.show === 'function') {
    comp.show(text)
  }
  setTimeout(function () {
    wx.reLaunch({ url: '/pages/index/index' })
  }, 1500)
}

// 校验分享进入的报名页
// page: 当前页面实例
// sharedZoneId: 分享链接指向的分区 ID；为 null/undefined 表示非分享进入（直接放行）
// 返回 true=校验通过，false=已拦截并跳转
async function checkSharedEntry(page, sharedZoneId) {
  const userInfo = app.globalData.userInfo
  if (!userInfo || !userInfo.nickName) {
    showReminderAndExit(page, '未登录，请先登录')
    return false
  }
  if (!sharedZoneId) return true

  const userZone = app.globalData.currentZone
  // 用户尚未选择分区：允许进入，由页面采用分享分区
  if (!userZone) return true
  // 当前分区与分享分区一致：放行
  if (userZone._id === sharedZoneId) return true

  // 分区不一致：查询分享分区名称后提醒并跳转
  let zoneName = ''
  try {
    const wxdb = wx.cloud.database()
    const res = await wxdb.collection('zones').doc(sharedZoneId).get()
    if (res.data) zoneName = res.data.zoneName || ''
  } catch (e) {
    console.error('查询分享分区名称失败', e)
  }
  showReminderAndExit(page, '不属于' + zoneName + '分区，请切换到' + zoneName + '分区后再重新进入报名')
  return false
}

module.exports = {
  checkSharedEntry,
  showReminderAndExit
}
