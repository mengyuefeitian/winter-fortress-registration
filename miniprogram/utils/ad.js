// utils/ad.js
// 广告封装：激励式视频 / 插屏
//
// 三条必须遵守的纪律（改这个文件前先读）：
//   1) 小程序端激励视频是「页面内单例，不允许跨页面使用」——官方文档明确写了，
//      小游戏端才是全局单例。所以实例必须挂在页面 this 上，不要做全局单例复用。
//   2) 奖励只能在 onClose 且 res.isEnded === true 时发放。用户中途退出不发奖，
//      这是平台合规强制项，不是可选项；反过来，看完了不发奖也不行。
//   3) 广告会拉不到（无填充 / 弱网 / 广告位未生效）。所有失败都要回调出去，
//      由调用方决定兜底策略——绝不能出现「看不了广告 = 功能用不了」的死路。

const adConfig = require('./adConfig.js')

// 挂在页面实例上的 key（保证页面内单例）
const REWARDED_KEY = '__rewardedAd'
const INTERSTITIAL_KEY = '__interstitialAd'
const LAST_INTERSTITIAL_KEY = '__lastInterstitialAt'

function enabled() {
  return adConfig.ENABLED === true
}

function hasAdUnit(adUnitId) {
  return !!adUnitId && /^adunit-/.test(adUnitId)
}

/**
 * 取（或创建）当前页面的激励视频广告实例
 * @param {Object} pageCtx 页面 this
 * @returns {Object|null} 广告实例，未配置广告位时返回 null
 */
function getRewardedAd(pageCtx) {
  if (!enabled() || !hasAdUnit(adConfig.REWARDED_AD_UNIT)) return null
  if (!pageCtx) return null

  if (!pageCtx[REWARDED_KEY]) {
    try {
      pageCtx[REWARDED_KEY] = wx.createRewardedVideoAd({
        adUnitId: adConfig.REWARDED_AD_UNIT
      })
    } catch (e) {
      console.error('[ad] createRewardedVideoAd 失败', e)
      return null
    }
  }
  return pageCtx[REWARDED_KEY]
}

/**
 * 观看激励视频换取奖励
 *
 * 回调语义（调用方必须两个都传，尤其是 onFail）：
 *   onGranted(reason)  完整观看到结束 → 发奖励
 *   onFail(reason)     拉取失败 / 展示失败 / 未看完就关 → 由调用方决定是否兜底放行
 *
 * @param {Object} opts
 * @param {Object} opts.pageCtx 页面 this
 * @param {Function} opts.onGranted 完整观看后回调
 * @param {Function} opts.onFail 失败或未完整观看回调
 */
function showRewarded(opts) {
  const o = opts || {}
  const onGranted = typeof o.onGranted === 'function' ? o.onGranted : function () {}
  const onFail = typeof o.onFail === 'function' ? o.onFail : function () {}

  if (!enabled()) {
    // 总开关关闭：直接视为已授权，保持功能可用
    onGranted('adDisabled')
    return
  }

  const ad = getRewardedAd(o.pageCtx)
  if (!ad) {
    onFail('noAdUnit')
    return
  }

  // 每次展示前先解绑上一次的 onClose，否则回调会累积（看一次触发 N 次发奖）
  try {
    if (ad.__closeHandler) ad.offClose(ad.__closeHandler)
    if (ad.__errorHandler) ad.offError(ad.__errorHandler)
  } catch (e) {
    // 低版本基础库没有 offClose，忽略即可（下面用一次性标记兜底去重）
  }

  let settled = false // 一次性结算，防止重复回调
  const closeHandler = function (res) {
    if (settled) return
    settled = true
    // isEnded 为 true 才是「完整播放到结束」，提前关闭不发奖励
    if (res && res.isEnded) {
      onGranted('watched')
    } else {
      onFail('notFinished')
    }
  }
  const errorHandler = function (err) {
    if (settled) return
    settled = true
    console.warn('[ad] 激励视频错误', err)
    onFail('error')
  }

  ad.__closeHandler = closeHandler
  ad.__errorHandler = errorHandler

  try {
    ad.onClose(closeHandler)
    ad.onError(errorHandler)
  } catch (e) {
    console.error('[ad] 绑定广告回调失败', e)
    onFail('bindFailed')
    return
  }

  // 官方推荐写法：先 show，失败再 load 后重试一次
  const showPromise = ad.show()
  if (showPromise && typeof showPromise.catch === 'function') {
    showPromise.catch(function () {
      return ad
        .load()
        .then(function () {
          return ad.show()
        })
        .catch(function (err) {
          if (settled) return
          settled = true
          console.warn('[ad] 激励视频加载失败', err)
          onFail('loadFailed')
        })
    })
  }
}

/**
 * 展示插屏广告（浏览类页面的曝光位）
 *
 * 插屏是「低价值、可失败」的：拉不到就算了，绝不影响用户正常使用，
 * 所以这里不抛错、不回调，只打日志。
 *
 * @param {Object} pageCtx 页面 this
 * @param {boolean} force 是否跳过本地间隔限制
 * @returns {boolean} 是否真的触发了展示
 */
function showInterstitial(pageCtx, force) {
  if (!enabled()) return false
  if (!hasAdUnit(adConfig.INTERSTITIAL_AD_UNIT)) return false
  if (!pageCtx) return false

  // 本地频控：官方是 30 秒，这里按配置放宽，避免连续刷屏
  const now = Date.now()
  const last = pageCtx[LAST_INTERSTITIAL_KEY] || 0
  if (!force && now - last < adConfig.INTERSTITIAL_MIN_INTERVAL) return false
  pageCtx[LAST_INTERSTITIAL_KEY] = now

  try {
    if (!pageCtx[INTERSTITIAL_KEY]) {
      pageCtx[INTERSTITIAL_KEY] = wx.createInterstitialAd({
        adUnitId: adConfig.INTERSTITIAL_AD_UNIT
      })
    }
    const ad = pageCtx[INTERSTITIAL_KEY]
    const p = ad.show()
    if (p && typeof p.catch === 'function') {
      p.catch(function (err) {
        console.warn('[ad] 插屏广告展示失败', err)
      })
    }
    return true
  } catch (e) {
    console.warn('[ad] createInterstitialAd 失败', e)
    return false
  }
}

module.exports = {
  enabled: enabled,
  showRewarded: showRewarded,
  showInterstitial: showInterstitial,
  getRewardedAd: getRewardedAd
}
