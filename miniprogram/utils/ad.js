// utils/ad.js
// 广告封装：激励式视频
//
// 只有一种广告形态：看完整视频 → 换「本周通行证」。
// 插屏由流量主后台自带能力覆盖，代码里不接入，避免重复打扰用户。
//
// 三条必须遵守的纪律（改这个文件前先读）：
//   1) 小程序端激励视频是「页面内单例，不允许跨页面使用」——官方文档明确写了，
//      小游戏端才是全局单例。所以实例必须挂在页面 this 上，不要做全局单例复用。
//      同一个 adUnitId 可以在多个页面复用，但每个页面要各自创建实例。
//   2) 奖励只能在 onClose 且 res.isEnded === true 时发放。用户中途退出不发奖，
//      这是平台合规强制项，不是可选项；反过来，看完了不发奖也不行。
//   3) 广告会拉不到（无填充 / 弱网 / 广告位未生效）。所有失败都要回调出去，
//      由调用方决定兜底策略——绝不能出现「看不了广告 = 功能用不了」的死路。

const adConfig = require('./adConfig.js')

// 挂在页面实例上的 key（保证页面内单例）
const REWARDED_KEY = '__rewardedAd'

// 唤起超时（毫秒）：show() / load() 若长时间既没 resolve 也没 reject，
// 就按「拉不到广告」处理。开发者工具、广告位刚建未生效、无填充都可能出现这种静默无响应，
// 不设这个超时用户就会永远卡在「点了没反应」。
const AD_SHOW_TIMEOUT = 10000

// 确认拉不到之后的冷却期（毫秒）：这段时间内不再尝试唤起，直接按「不可用」回调。
// 否则广告位故障期间用户每做一次操作都要白等 10 秒，等于反复折腾用户。
const UNAVAILABLE_COOLDOWN = 10 * 60 * 1000

let unavailableUntil = 0

function markUnavailable() {
  unavailableUntil = Date.now() + UNAVAILABLE_COOLDOWN
}

function isUnavailable() {
  return Date.now() < unavailableUntil
}

/**
 * 清除「广告不可用」冷却（仅供联调测试）
 *
 * 一旦确认过拉不到广告，10 分钟内不再尝试唤起。测试时想重新走一遍完整流程，
 * 就得把这个冷却清掉，否则会直接走「不可用」分支，看不到真实行为。
 */
function resetUnavailable() {
  unavailableUntil = 0
}

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

  // 失败统一出口：除「用户自己没看完」外，都认定为广告不可用，进入冷却
  const failWith = function (reason) {
    if (reason !== 'notFinished') markUnavailable()
    onFail(reason)
  }

  if (!enabled()) {
    // 总开关关闭：直接视为已授权，保持功能可用
    onGranted('adDisabled')
    return
  }

  // 刚确认过拉不到：别再反复唤起，直接告诉调用方不可用（调用方会兜底放行）
  if (isUnavailable()) {
    onFail('recentlyFailed')
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
    failWith('error')
  }

  ad.__closeHandler = closeHandler
  ad.__errorHandler = errorHandler

  try {
    ad.onClose(closeHandler)
    ad.onError(errorHandler)
  } catch (e) {
    console.error('[ad] 绑定广告回调失败', e)
    failWith('bindFailed')
    return
  }

  // 唤起超时兜底：只要广告真的播起来了就撤掉，否则到点按失败处理
  let showTimer = setTimeout(function () {
    if (settled) return
    settled = true
    console.warn('[ad] 激励视频唤起超时（无响应）')
    failWith('showTimeout')
  }, AD_SHOW_TIMEOUT)
  const clearShowTimer = function () {
    if (showTimer) clearTimeout(showTimer)
  }

  // 官方推荐写法：先 show，失败再 load 后重试一次
  let showPromise
  try {
    showPromise = ad.show()
  } catch (e) {
    // show() 同步抛错（基础库差异 / 广告位异常）
    if (settled) return
    settled = true
    clearShowTimer()
    console.error('[ad] show 同步异常', e)
    failWith('showException')
    return
  }

  if (showPromise && typeof showPromise.then === 'function') {
    showPromise
      .then(function () {
        // 成功展示：广告在播，交给 onClose 判定，撤掉唤起超时
        clearShowTimer()
      })
      .catch(function () {
        return ad
          .load()
          .then(function () {
            return ad.show()
          })
          .then(function () {
            clearShowTimer()
          })
          .catch(function (err) {
            if (settled) return
            settled = true
            clearShowTimer()
            console.warn('[ad] 激励视频加载失败', err)
            failWith('loadFailed')
          })
      })
  }
  // 低版本基础库 show() 无返回值：无法判定，交给唤起超时与外层兜底
}

// （插屏广告已移除：由流量主后台自带能力覆盖，代码不再接入）

/**
 * 自检：这套广告链路到底哪一步不通
 *
 * 「点了没反应」最常见的三类根因，肉眼在真机上看不出来，只能靠这一步步探出来：
 *   ① 广告位没配 / 格式不对 → adUnitOk = false
 *   ② 小程序未开通流量主、广告位刚建未生效 → created 成功但 loaded = false
 *   ③ 刚失败过还在冷却期内 → cooling = true（这是设计内的行为，不是故障）
 *
 * ⚠️ 只 load 不 show：不打扰用户，也不产生曝光。
 *
 * @param {Object} pageCtx 页面 this
 * @returns {Promise<Object>}
 */
function probeAd(pageCtx) {
  const r = {
    enabled: enabled(),
    adUnit: adConfig.REWARDED_AD_UNIT || '',
    adUnitOk: hasAdUnit(adConfig.REWARDED_AD_UNIT),
    cooling: isUnavailable(),
    created: false,
    loaded: false,
    ms: 0,
    err: ''
  }
  const t0 = Date.now()

  if (!r.adUnitOk) {
    r.err = '广告位 ID 未配置或格式不对（应以 adunit- 开头）'
    return Promise.resolve(r)
  }

  const ad = getRewardedAd(pageCtx)
  r.created = !!ad
  if (!ad) {
    r.err = '广告实例创建失败'
    r.ms = Date.now() - t0
    return Promise.resolve(r)
  }

  return new Promise(function (resolve) {
    let settled = false
    const done = function () {
      if (settled) return
      settled = true
      r.ms = Date.now() - t0
      resolve(r)
    }
    // load 也可能静默无响应，必须有超时
    const timer = setTimeout(function () {
      r.err = 'load 超时（8 秒无响应）'
      done()
    }, 8000)

    try {
      const p = ad.load()
      if (p && typeof p.then === 'function') {
        p.then(function () {
          clearTimeout(timer)
          r.loaded = true
          done()
        }).catch(function (e) {
          clearTimeout(timer)
          r.err = 'load 失败：' + ((e && (e.errMsg || e.errCode || e.message)) || '未知')
          done()
        })
      } else {
        clearTimeout(timer)
        r.err = '基础库过低，load 无返回值'
        done()
      }
    } catch (e) {
      clearTimeout(timer)
      r.err = 'load 抛异常：' + ((e && e.message) || e)
      done()
    }
  })
}

module.exports = {
  enabled: enabled,
  showRewarded: showRewarded,
  getRewardedAd: getRewardedAd,
  probeAd: probeAd,
  resetUnavailable: resetUnavailable
}
