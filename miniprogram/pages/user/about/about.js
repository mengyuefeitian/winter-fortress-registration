// pages/user/about/about.js
// 「关于」页：产品 logo + 产品名称 + 版本号（三行居中），下面挂官网 / 客服微信 / 备案号。
const version = require('../../../utils/version')
const link = require('../../../utils/link')

const WEBSITE = 'www.xiaoanhome.xyz'
const WEBSITE_URL = 'https://www.xiaoanhome.xyz/winter-fortress'
const SERVICE_WECHAT = 'xiaoanhome925'
const ICP = '京ICP备2026021298号-1X'
const BEIAN_URL = 'https://beian.miit.gov.cn/#/Integrated/recordQuery'

// 版本号展示：与 version.js 一致，正式版取平台上传的版本号，取不到退回本地常量
function versionLabel() {
  try {
    const info = wx.getAccountInfoSync()
    const v = info && info.miniProgram && info.miniProgram.version
    if (v) return 'v' + v
  } catch (err) { /* 开发版/体验版取不到，静默降级 */ }
  return 'v' + version.APP_VERSION
}

Page({
  data: {
    appName: version.APP_NAME,
    versionText: versionLabel(),
    website: WEBSITE,
    serviceWechat: SERVICE_WECHAT,
    icp: ICP
  },

  // 外部地址一律走「复制链接 → 浏览器打开」：
  // 本小程序是个人主体，后台没有「业务域名」入口，web-view 在正式版打不开；
  // 小程序也没有唤起系统浏览器的 API。详见 utils/link.js
  openWebsite: function () {
    link.openExternal(WEBSITE_URL, '官网链接已复制，请粘贴到浏览器打开')
  },

  openBeian: function () {
    link.openExternal(BEIAN_URL, '备案查询链接已复制，请粘贴到浏览器打开')
  },

  // 客服微信：一键复制 + 悬浮提示（2 秒后自动消失）
  copyWechat: function () {
    wx.setClipboardData({
      data: SERVICE_WECHAT,
      success: () => {
        // 干掉系统自带的「内容已复制」提示，换成明确的操作指引
        wx.hideToast()
        wx.showToast({
          title: '复制成功，请在微信添加客服',
          icon: 'none',
          duration: 2000
        })
      },
      fail: () => {
        wx.showToast({ title: '复制失败，请手动输入微信号', icon: 'none' })
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
