// 版本配置 - 集中管理版本号
// 上传新版本前请更新此文件

const APP_VERSION = '1.6.0'
const APP_NAME = '无尽冬日管理助手'

/**
 * 获取版本号
 * 优先使用微信小程序平台发布的版本号（通过 wx.getAccountInfoSync）
 * 如果获取失败（如开发版/体验版），则返回本地版本号
 */
function getVersionText() {
  try {
    const accountInfo = wx.getAccountInfoSync()
    const platformVersion = accountInfo.miniProgram.version
    // 正式版中 platformVersion 为上传时填写的版本号
    if (platformVersion && typeof platformVersion === 'string') {
      return `${APP_NAME} v${platformVersion}`
    }
  } catch (err) {
    // 获取失败时静默降级
  }
  return `${APP_NAME} v${APP_VERSION}`
}

module.exports = {
  APP_VERSION,
  APP_NAME,
  getVersionText
}