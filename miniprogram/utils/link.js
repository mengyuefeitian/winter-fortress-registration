// utils/link.js
// 外部链接的统一出口（功能介绍各版本 / 官网 / 备案查询）。
//
// ⚠️ 为什么不用 web-view 站内打开？
//   1. 本小程序是**个人主体**，微信官方规定「小程序内嵌网页能力暂不开放给个人类型账号」，
//      后台连「业务域名」入口都没有 → web-view 在正式版永远打不开。
//   2. 小程序也**没有**唤起系统浏览器的 API（微信刻意不开放，防止把用户导流出微信）。
//   → 剩下唯一通用可行解：复制链接，引导用户粘贴到浏览器打开。
//
// 🔧 若将来主体升级为企业 / 个体工商户并配好业务域名，把 openExternal 换回
//    wx.navigateTo({ url: '/pages/common/webview/webview?url=' + encodeURIComponent(link) })
//    并把 pages/common/webview/webview 加回 app.json 的 pages 即可（页面文件已保留）。

const COPY_TIP = '链接已复制，请粘贴到浏览器打开'

/**
 * 复制外部链接并提示用户到浏览器打开
 * @param {string} url  必须是 https 开头的合法地址
 * @param {string} tip  自定义提示文案（不传用默认文案）
 */
function openExternal(url, tip) {
  const link = String(url || '')
  if (!/^https:\/\//i.test(link)) {
    wx.showToast({ title: '链接无效', icon: 'none' })
    return
  }

  wx.setClipboardData({
    data: link,
    success: () => {
      // 干掉系统自带的「内容已复制」，换成明确的操作指引
      wx.hideToast()
      wx.showToast({
        title: tip || COPY_TIP,
        icon: 'none',
        duration: 2500
      })
    },
    fail: () => {
      wx.showToast({ title: '复制失败，请稍后重试', icon: 'none' })
    }
  })
}

module.exports = {
  openExternal: openExternal,
  COPY_TIP: COPY_TIP
}
