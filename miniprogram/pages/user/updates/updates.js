// pages/user/updates/updates.js
// 功能介绍 —— 版本列表（二级菜单）。列的是「已发布说明页」的版本，点进去看详情。
//
// 版本清单统一维护在 utils/updates.js（白名单），新增版本只要往那里加一条，
// 这里不用改。
//
// ⚠️ 打开方式走 utils/link.js（复制链接 → 浏览器打开）：本小程序是个人主体，
//    微信不给配业务域名，web-view 在正式版打不开，小程序也没有唤起浏览器的 API。
const updates = require('../../../utils/updates')
const link = require('../../../utils/link')

Page({
  data: {
    releases: []
  },

  onLoad: function () {
    this.setData({ releases: updates.list() })
  },

  // 复制该版本说明页的链接，引导到浏览器打开
  openRelease: function (e) {
    const index = parseInt(e.currentTarget.dataset.index, 10)
    const item = (this.data.releases || [])[index]
    if (!item || !item.url) return

    link.openExternal(item.url, 'V' + item.version + ' 说明链接已复制，请粘贴到浏览器打开')
  },

  onShareAppMessage: function () {
    return {
      title: '无尽冬日报名助手 · 功能介绍',
      path: '/pages/user/updates/updates'
    }
  }
})
