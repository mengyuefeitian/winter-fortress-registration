// utils/weekPass.js
// 「本周通行证」：观看一次激励视频 → 获得本周全部增值操作权限
//
// 口径（用户明确要求）：按**自然周**计算，不是「从观看时刻起 7 天」。
// 无论周三还是周日看的广告，权限都在这周日 23:59:59 到期，周一 00:00 自动归零。
//
// 校验分两层：
//   本地 storage —— 快速判定，供 UI 立即响应（记录 weekKey，跨周自然失效）
//   云端 users.weekPass —— 权威校验，用服务器时间，防止改手机系统时间绕过
//
// 兜底纪律：广告拉不到（无填充 / 弱网 / 广告位未生效）时一律**临时放行**，
// 只写本地不写云端。宁可少收一次广告钱，也不能让用户卡在「看不了广告=用不了」。

const adConfig = require('./adConfig.js')
const ad = require('./ad.js')

const CLOUD_NAME = 'weekPass'
const LOCAL_KEY = 'weekPassLocal'

function pad2(n) {
  return String(n).padStart(2, '0')
}

/**
 * 取某个日期所在自然周的周一 00:00:00
 * @param {Date|number} date 默认当前时间
 * @returns {Date}
 */
function getWeekStart(date) {
  const d = date ? new Date(date) : new Date()
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() // 0=周日 1=周一 ... 6=周六
  const offset = (day + 6) % 7 // 周一 → 0，周日 → 6
  d.setDate(d.getDate() - offset)
  return d
}

/**
 * 自然周唯一标识 = 该周周一的日期（YYYYMMDD）
 * 跨周即变化，因此天然实现「周一自动归零」
 * @param {Date|number} date
 * @returns {string}
 */
function getWeekKey(date) {
  const s = getWeekStart(date)
  return `${s.getFullYear()}${pad2(s.getMonth() + 1)}${pad2(s.getDate())}`
}

/**
 * 本周日 23:59:59
 * @param {Date|number} date
 * @returns {Date}
 */
function getWeekEnd(date) {
  const s = getWeekStart(date)
  const e = new Date(s.getTime())
  e.setDate(e.getDate() + 6)
  e.setHours(23, 59, 59, 999)
  return e
}

/**
 * 本周区间文案，如「10月13日 - 10月19日」
 * @param {Date|number} date
 * @returns {string}
 */
function getWeekRangeText(date) {
  const s = getWeekStart(date)
  const e = getWeekEnd(date)
  return `${s.getMonth() + 1}月${s.getDate()}日 - ${e.getMonth() + 1}月${e.getDate()}日`
}

// ============ 本地缓存 ============

function readLocal() {
  try {
    return wx.getStorageSync(LOCAL_KEY) || null
  } catch (e) {
    return null
  }
}

function writeLocal(weekKey) {
  try {
    wx.setStorageSync(LOCAL_KEY, {
      weekKey: weekKey,
      grantedAt: Date.now()
    })
  } catch (e) {
    console.warn('[weekPass] 写本地缓存失败', e)
  }
}

/**
 * 同步判定：本地缓存的本周通行证是否有效
 * 只用于 UI 快速响应，权威判定请用 ensurePass()
 * @returns {boolean}
 */
function hasPassSync() {
  if (!adConfig.ENABLED) return true
  const local = readLocal()
  if (!local || !local.weekKey) return false
  return local.weekKey === getWeekKey()
}

// ============ 云端 ============

function callCloud(action, extra) {
  const data = Object.assign({ action: action }, extra || {})
  return wx.cloud.callFunction({ name: CLOUD_NAME, data: data }).then(function (res) {
    return (res && res.result) || {}
  })
}

/**
 * 云端权威校验：本周是否已持有通行证
 * @returns {Promise<boolean>}
 */
function ensurePass() {
  if (!adConfig.ENABLED) return Promise.resolve(true)

  // 本地已有效就不再打云函数（省一次网络往返）
  if (hasPassSync()) return Promise.resolve(true)

  return callCloud('query')
    .then(function (r) {
      if (r && r.ok && r.valid) {
        writeLocal(getWeekKey())
        return true
      }
      return false
    })
    .catch(function (e) {
      // 云端查不到：不视为有权限，也不阻断——交给 requirePass 走引导流程
      console.warn('[weekPass] 云端查询失败', e)
      return false
    })
}

/**
 * 发放本周通行证（看完激励视频后调用）
 * @returns {Promise<boolean>}
 */
function grantPass() {
  const weekKey = getWeekKey()
  writeLocal(weekKey) // 先写本地，保证当前会话立刻可用（云端失败也不影响本次）
  return callCloud('grant', { weekKey: weekKey })
    .then(function (r) {
      return !!(r && r.ok)
    })
    .catch(function (e) {
      console.warn('[weekPass] 云端发放入库失败（本地已放行）', e)
      return true // 本地已写，按成功处理
    })
}

// ============ 统一拦截入口 ============

/**
 * 增值操作前的权限校验：没有通行证就引导看一次激励视频
 *
 * @param {Object} opts
 * @param {Object} opts.pageCtx 页面 this（激励视频实例是页面内单例，必须传）
 * @param {string} opts.feature 功能名，用于弹窗文案，如「统计截图」
 * @returns {Promise<boolean>} true 表示放行，false 表示用户放弃
 */
function requirePass(opts) {
  const o = opts || {}
  const feature = o.feature || '该功能'

  if (!adConfig.ENABLED) return Promise.resolve(true)

  return ensurePass().then(function (valid) {
    if (valid) return true
    return new Promise(function (resolve) {
      const rangeText = getWeekRangeText()
      wx.showModal({
        title: '需要本周通行证',
        content: `「${feature}」是增值功能。观看一次约 30 秒的视频广告，即可解锁本周（${rangeText}）全部增值功能，本周内不再重复观看。`,
        confirmText: '看广告解锁',
        cancelText: '以后再说',
        success: function (res) {
          if (!res.confirm) {
            resolve(false)
            return
          }
          ad.showRewarded({
            pageCtx: o.pageCtx,
            onGranted: function () {
              grantPass().then(function () {
                wx.showToast({ title: '本周已解锁', icon: 'none' })
                resolve(true)
              })
            },
            onFail: function (reason) {
              if (reason === 'notFinished') {
                // 用户自己中途退出：不给权限，也不打扰
                wx.showToast({ title: '需看完视频才能解锁', icon: 'none' })
                resolve(false)
                return
              }
              // 广告拉不到 / 创建失败 / 绑定失败：一律临时放行，只写本地不写云端
              console.warn('[weekPass] 广告不可用，临时放行', reason)
              writeLocal(getWeekKey())
              wx.showToast({ title: '广告加载失败，本次已放行', icon: 'none' })
              resolve(true)
            }
          })
        },
        fail: function () {
          resolve(false)
        }
      })
    })
  })
}

module.exports = {
  getWeekStart: getWeekStart,
  getWeekEnd: getWeekEnd,
  getWeekKey: getWeekKey,
  getWeekRangeText: getWeekRangeText,
  hasPassSync: hasPassSync,
  ensurePass: ensurePass,
  grantPass: grantPass,
  requirePass: requirePass
}
