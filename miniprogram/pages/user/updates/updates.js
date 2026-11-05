// pages/user/updates/updates.js
// 功能介绍 —— 版本列表（二级菜单）。卡片统一高度、摘要截断两行，
// 点击进站内详情页看完整正文。
//
// 版本清单统一维护在 utils/updates.js，新增版本只要往那里加一条，
// 这里不用改。
const updates = require('../../../utils/updates')

Page({
  data: {
    releases: []
  },

  onLoad: function () {
    this.setData({ releases: updates.list() })
  },

  // 进站内详情页（列表摘要被截断，完整内容在详情页）
  openRelease: function (e) {
    const index = parseInt(e.currentTarget.dataset.index, 10)
    const item = (this.data.releases || [])[index]
    if (!item) return

    wx.navigateTo({
      url: '/pages/user/updates-detail/updates-detail?version=' + item.version,
      fail: (err) => console.warn('[updates] navigateTo detail fail', err)
    })
  },

  onShareAppMessage: function () {
    return {
      title: '无尽冬日报名助手 · 功能介绍',
      path: '/pages/user/updates/updates'
    }
  }
})
