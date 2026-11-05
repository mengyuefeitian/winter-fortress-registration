// pages/user/updates-detail/updates-detail.js
// 功能介绍 —— 版本详情页（站内）。列表摘要超长会被截断，完整正文在这里看。
//
// 数据统一来自 utils/updates.js 的 getByVersion()，不在页面里写死任何版本内容。
// 本小程序是个人主体用不了 web-view，只有已有官网说明页的版本才提供「复制链接」。

const updates = require('../../../utils/updates')
const link = require('../../../utils/link')

Page({
  data: {
    release: null,
    notFound: false
  },

  onLoad: function (options) {
    const version = options && options.version
    const release = updates.getByVersion(version)
    if (!release) {
      this.setData({ notFound: true })
      return
    }
    this.setData({ release: release })
    wx.setNavigationBarTitle({
      title: 'V' + release.version + ' 功能介绍',
      fail: (err) => console.warn('[updates-detail] setNavigationBarTitle fail', err)
    })
  },

  // 可选：复制该版本官网说明页链接（新版本没有官网页面时按钮不显示）
  copyWebLink: function () {
    const release = this.data.release
    if (!release || !release.url) return
    link.openExternal(
      release.url,
      'V' + release.version + ' 说明链接已复制，请粘贴到浏览器打开'
    )
  },

  onShareAppMessage: function () {
    const release = this.data.release
    if (!release) {
      return { title: '无尽冬日报名助手 · 功能介绍', path: '/pages/user/updates/updates' }
    }
    return {
      title: '无尽冬日报名助手 · V' + release.version + ' ' + release.title,
      path: '/pages/user/updates-detail/updates-detail?version=' + release.version
    }
  }
})
