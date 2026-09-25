// pages/common/webview/webview.js
// 通用网页容器 —— 在小程序内打开外部页面（功能介绍 / 官网 / 备案查询）。
//
// ⚠️ 当前已**从 app.json 的 pages 中移除**（不参与编译）：本小程序是个人主体，
//    微信不给个人主体配「业务域名」，web-view 在正式版必然打不开。
//    外部链接当前统一走 utils/link.js（复制链接 → 浏览器打开）。
//
// 🔧 主体升级为企业 / 个体工商户并配好业务域名后，恢复两步即可复用本页：
//    ① 把 "pages/common/webview/webview" 加回 app.json 的 pages；
//    ② utils/link.js 的 openExternal 换成 navigateTo 本页。
Page({
  data: {
    url: '',
    rawUrl: '',
    errorText: ''
  },

  onLoad: function (options) {
    const opts = options || {}

    if (opts.title) {
      wx.setNavigationBarTitle({ title: decodeURIComponent(opts.title) })
    }

    const raw = opts.url ? decodeURIComponent(opts.url) : ''
    const url = /^https:\/\//i.test(raw) ? raw : ''
    if (!url) {
      this.setData({ errorText: '页面地址无效，请稍后再试' })
      return
    }
    this.setData({ url: url, rawUrl: url })
  },

  // web-view 加载失败（网络异常 / 页面不存在）
  onError: function () {
    this.setData({
      url: '',
      errorText: '页面加载失败。\n请检查网络，或确认已在小程序后台\n「业务域名」中配置该域名'
    })
  },

  // 兜底出口：复制地址到剪贴板，可粘贴到浏览器打开
  copyLink: function () {
    const link = this.data.rawUrl
    if (!link) return
    wx.setClipboardData({
      data: link,
      success: () => {
        wx.hideToast()
        wx.showToast({ title: '链接已复制，可粘贴到浏览器打开', icon: 'none', duration: 2000 })
      },
      fail: () => {
        wx.showToast({ title: '复制失败，请稍后重试', icon: 'none' })
      }
    })
  },

  onShareAppMessage: function () {
    return {
      title: '无尽冬日报名助手',
      path: '/pages/index/index'
    }
  }
})
