// utils/adConfig.js
// 广告位配置
//
// 两类广告位必须在流量主后台【广告位管理】里分别创建，ID 不能混用：
//   - 激励式视频广告位 → REWARDED_AD_UNIT（看完整视频换「本周通行证」）
//   - 插屏广告位       → INTERSTITIAL_AD_UNIT（浏览类页面曝光）
//
// ⚠️ 下面的 ID 是占位符，必须替换为你在后台创建的真实广告位 ID，
//    否则广告拉不到（表现为「点了没反应」或 onError 回调）。

module.exports = {
  // 总开关：false 时所有广告校验直接放行（排查问题、提审期间可一键关闭）
  ENABLED: true,

  // 激励式视频广告位 ID
  REWARDED_AD_UNIT: 'adunit-xxxxxxxxxxxxxxxx',

  // 插屏广告位 ID
  INTERSTITIAL_AD_UNIT: 'adunit-yyyyyyyyyyyyyyyy',

  // 插屏广告最小展示间隔（毫秒）
  // 官方频控是「同一用户每 30 秒最多 1 次」，这里主动放宽到 10 分钟，
  // 报名工具类小程序打断一次就够烦了，别为了曝光把自己作成骚扰。
  INTERSTITIAL_MIN_INTERVAL: 10 * 60 * 1000
}
