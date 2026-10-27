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
const CONFIG_KEY = 'adGateConfig'

// 内存级配置缓存（同一次会话内只读一次云函数）
let configCache = null

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

// 云端调用超时（毫秒）。超时或任何异常都按「查不到」处理，由调用方兜底放行，
// 绝不让用户卡在一次网络请求上。
const CLOUD_TIMEOUT = 8000

// 广告唤起后的兜底超时（毫秒）。只在用户点了「看视频」之后才开始计时，
// 所以不会影响正常观看（激励视频一般 15–30 秒，90 秒足够）。
const AD_GUARD_TIMEOUT = 90000

// 弹窗出现「之前」的总闸（毫秒）。
//
// 这一段能卡住的环节太多：云函数、storage、Promise 链、showModal 本身……
// 逐个加超时既啰嗦又必然漏掉某个分支，而漏掉的那个分支表现就是
// 「点了完全没反应、控制台还不报错」—— 用户根本没法反馈有用信息。
// 所以统一用总闸：只要弹窗还没交到用户手上，到点一定放行。
//
// 弹窗一旦弹出就撤掉总闸，改由广告自己的超时负责 —— 否则用户正在看广告时
// 被强行放行，广告就白看了。
const PRE_MODAL_TIMEOUT = 12000

// 弹窗自身的兜底（毫秒）：极端情况下 showModal 既不显示也不回调，
// 整条链会永久挂起且控制台无任何报错。3 分钟足够用户读完并做决定。
const MODAL_TIMEOUT = 180000

// 链路日志：排查「点了没反应」的唯一有效线索（真机上只能靠 vConsole 看）。
// 定位完问题可以把函数体改成 return 关掉噪音，别删 —— 下次还会用到。
function trace() {
  try {
    console.log.apply(console, ['[weekPass]'].concat(Array.prototype.slice.call(arguments)))
  } catch (e) {
    // 控制台不可用（极老基础库）也不能影响主流程
  }
}

/**
 * 调用 weekPass 云函数
 *
 * ⚠️ 必须同时防两件事，缺一个就会把用户堵死：
 *   1) **同步抛错**（wx.cloud 未就绪 / 未 init）→ 转成 reject，否则调用方
 *      的 .catch 根本挂不上，异常会一路冒泡，表现为「点了没反应」。
 *   2) **永不回调**（网络异常、云函数不存在且框架沉默）→ 超时兜底。
 *
 * @param {string} action
 * @param {Object} [extra]
 * @returns {Promise<Object>}
 */
function callCloud(action, extra) {
  const data = Object.assign({ action: action }, extra || {})
  return new Promise(function (resolve, reject) {
    let settled = false
    const finish = function (fn, arg) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn(arg)
    }
    const timer = setTimeout(function () {
      finish(reject, new Error('cloudTimeout'))
    }, CLOUD_TIMEOUT)

    try {
      wx.cloud.callFunction({ name: CLOUD_NAME, data: data }).then(
        function (res) {
          finish(resolve, (res && res.result) || {})
        },
        function (e) {
          finish(reject, e)
        }
      )
    } catch (e) {
      finish(reject, e)
    }
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
      // 云端查不到 / 超时 / 同步异常：这是「判不了」，不是「确定没有」。
      // 返回 'unknown'，由 requirePass 直接放行 —— 云函数挂了就让全体用户去点广告，
      // 那是把基础设施故障转嫁给用户，绝不能这么做。
      console.warn('[weekPass] 云端查询失败，视为不可判定', e)
      // 顺手写本地：下次 hasPassSync 直接命中，不用每个操作都白等一次超时
      writeLocal(getWeekKey())
      return 'unknown'
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

// ============ 远程开关 ============
//
// 报名类拦截是「收益 vs 流失」的赌注，所以开关必须能不停机调整：
// 运营在云开发控制台改 appConfig/adGate 文档的布尔值即可，最长 5 分钟全量生效。
// 拉不到配置（集合没建 / 文档不存在 / 网络问题）→ 回落 adConfig.GATE_DEFAULT。

function defaultGates() {
  const out = {}
  const def = adConfig.GATE_DEFAULT || {}
  Object.keys(def).forEach(function (k) {
    out[k] = def[k] !== false
  })
  return out
}

function readConfigCache() {
  const now = Date.now()
  if (configCache && now - configCache.at < adConfig.CONFIG_CACHE_TTL) {
    return configCache.data
  }
  try {
    const raw = wx.getStorageSync(CONFIG_KEY)
    if (raw && raw.at && now - raw.at < adConfig.CONFIG_CACHE_TTL) {
      configCache = raw
      return raw.data
    }
  } catch (e) {
    // storage 不可用：走网络
  }
  return null
}

function writeConfigCache(data) {
  configCache = { at: Date.now(), data: data }
  try {
    wx.setStorageSync(CONFIG_KEY, configCache)
  } catch (e) {
    console.warn('[weekPass] 开关缓存写入失败（仅影响性能）', e)
  }
}

/**
 * 取当前生效的分场景开关（已与代码默认值合并）
 * @returns {Promise<Object>} 如 { registerGate: true, valueGate: true }
 */
function getGateConfig() {
  const cached = readConfigCache()
  if (cached) return Promise.resolve(cached)

  return callCloud('config')
    .then(function (r) {
      const remote = r && r.ok && r.config ? r.config : null
      const def = adConfig.GATE_DEFAULT || {}
      const merged = {}
      Object.keys(def).forEach(function (k) {
        const v = remote ? remote[k] : undefined
        // 认布尔值与 0/1（控制台手工填值很容易填成数字）；
        // 字符串一律不认 —— "false" 会被当成真值用，是最危险的误配置
        if (typeof v === 'boolean') {
          merged[k] = v
        } else if (v === 1 || v === 0) {
          merged[k] = v === 1
        } else {
          merged[k] = def[k] !== false
        }
      })
      writeConfigCache(merged)
      return merged
    })
    .catch(function (e) {
      console.warn('[weekPass] 远程开关拉取失败，回落默认值', e)
      return defaultGates()
    })
}

/**
 * 清掉开关缓存：超管改完配置后立刻生效，不用等 5 分钟 TTL
 */
function clearConfigCache() {
  configCache = null
  try {
    wx.removeStorageSync(CONFIG_KEY)
  } catch (e) {
    // 清不掉也无所谓，最多等 TTL 自然过期
  }
}

/**
 * 修改远程开关（**仅超管**，鉴权在云函数里做，客户端绕不过）
 *
 * @param {Object} patch 如 { registerGate: false }，只传需要改的字段
 * @returns {Promise<Object>} 云函数回读到的最新配置
 */
function setGates(patch) {
  const body = {}
  if (patch && typeof patch.registerGate === 'boolean') body.registerGate = patch.registerGate
  if (patch && typeof patch.valueGate === 'boolean') body.valueGate = patch.valueGate
  if (Object.keys(body).length === 0) {
    return Promise.reject(new Error('没有需要保存的改动'))
  }

  return callCloud('setConfig', body).then(function (r) {
    if (!r || !r.ok) {
      const reason = (r && r.reason) || 'unknown'
      const msg =
        reason === 'permissionDenied'
          ? '权限不足：仅超级管理员可修改'
          : reason === 'noValidField'
          ? '参数无效，未做任何修改'
          : reason === 'writeFailed'
          ? '写入数据库失败，请稍后重试'
          : reason === 'noOpenid'
          ? '登录状态失效，请重新进入'
          : '保存失败，请稍后重试'
      return Promise.reject(new Error(msg))
    }
    clearConfigCache()
    return r.config || {}
  })
}

/**
 * 某一类拦截是否开启（开启 = 会要求看广告）
 * @param {string} gate 'register' → registerGate，'value' → valueGate
 * @returns {Promise<boolean>}
 */
function isGateOn(gate) {
  if (!adConfig.ENABLED) return Promise.resolve(false)
  const key = gate === 'register' ? 'registerGate' : 'valueGate'
  return getGateConfig().then(function (c) {
    return c[key] !== false
  })
}

// ============ 统一拦截入口 ============

/**
 * 操作前的权限校验：没有通行证就引导看一次激励视频
 *
 * @param {Object} opts
 * @param {Object} opts.pageCtx 页面 this（激励视频实例是页面内单例，必须传）
 * @param {string} opts.feature 功能名，用于弹窗文案，如「熊坑报名」「统计截图」
 * @param {string} [opts.gate] 'value'（默认，增值类）| 'register'（报名类）
 * @param {string} [opts.content] 自定义弹窗正文，不传则用默认文案
 * @returns {Promise<boolean>} true 表示放行，false 表示用户放弃
 */
function requirePass(opts) {
  const o = opts || {}
  const feature = o.feature || '该功能'
  const gate = o.gate === 'register' ? 'register' : 'value'

  if (!adConfig.ENABLED) {
    trace('总开关关闭，直接放行', feature)
    return Promise.resolve(true)
  }

  // ⚠️ 整条链路必须保证「一定 resolve」：调用方有的是 await（报名提交），
  // 有的是 .then/.catch（账号编辑）。一旦这里同步抛错或永不回调，用户就是
  // 「点了完全没反应」，比弹广告糟糕得多。
  //
  // 所以这里不直接返回 runGateFlow 的 Promise，而是自己 new 一个：
  // 内部流程只负责「汇报结论」，真正的结算统一走 settle —— 这样无论流程
  // 是跑通、抛错还是永远卡住，总闸都能在 PRE_MODAL_TIMEOUT 后终结它。
  return new Promise(function (resolve) {
    let settled = false
    let hardTimer = null
    let modalTimer = null

    const settle = function (value, why) {
      if (settled) {
        trace('重复结算已忽略', why)
        return
      }
      settled = true
      if (hardTimer) clearTimeout(hardTimer)
      if (modalTimer) clearTimeout(modalTimer)
      trace('结论', value ? '放行' : '拒绝', why)
      resolve(value)
    }

    hardTimer = setTimeout(function () {
      console.warn('[weekPass] 弹窗前链路超时，兜底放行', feature)
      settle(true, 'preModalTimeout')
    }, PRE_MODAL_TIMEOUT)

    // 弹窗已交给用户：撤掉总闸，换成更长的弹窗超时
    const onModalShown = function () {
      if (hardTimer) {
        clearTimeout(hardTimer)
        hardTimer = null
      }
      modalTimer = setTimeout(function () {
        console.warn('[weekPass] 弹窗长时间未响应，兜底放行', feature)
        settle(true, 'modalTimeout')
      }, MODAL_TIMEOUT)
    }

    let flow
    try {
      flow = runGateFlow(o, feature, gate, onModalShown)
    } catch (e) {
      console.warn('[weekPass] 校验链路同步异常，兜底放行', e)
      settle(true, 'syncThrow')
      return
    }

    flow
      .then(function (v) {
        settle(v, 'flow:' + v)
      })
      .catch(function (e) {
        console.warn('[weekPass] 校验链路异常，兜底放行', e)
        settle(true, 'flowError')
      })
  })
}

function runGateFlow(o, feature, gate, onModalShown) {
  return isGateOn(gate).then(function (on) {
    trace('开关判定', gate, on ? '开启' : '关闭', feature)
    // 该类拦截已被远程关闭 → 直接放行
    if (!on) return true

    return ensurePass().then(function (valid) {
      trace('云端校验', valid === true ? '已持有' : valid === 'unknown' ? '不可判定' : '未持有')
      // 云端不可判定（超时 / 异常 / 云函数没部署）→ 放行，不拿基础设施故障为难用户
      if (valid === 'unknown') return true
      if (valid) return true
      trace('准备弹窗', feature)
      return new Promise(function (resolve) {
        const rangeText = getWeekRangeText()
        // ⚠️ 文案口径（用户 2026-10-15 定，改之前先读）：
        //   说成「免费赞助开发者」，**不要**说「高级功能 / 付费 / 会员」——
        //   本产品本来就免费，激励任务是对开发者的赞助，不是买权限。
        //   同时仍必须满足平台对激励类的硬性要求：**奖励在触发前说清楚**
        //   （本周全部功能免费使用、本周内不再重复），不能含糊其辞把用户骗进去。
        const content =
          o.content ||
          `本产品免费使用，靠激励任务维持运营。\n完成一次激励任务（约 30 秒）即可免费赞助开发者，并获得本周（${rangeText}）全部功能的免费使用权，本周内无需重复。`

        // 一次性结算 + 超时兜底：广告唤起后若长时间没有任何回调
        // （平台侧偶发「show 成功但既不播也不报错」），不能让用户永远等下去
        let settled = false
        let guardTimer = null
        const settle = function (value) {
          if (settled) return
          settled = true
          if (guardTimer) clearTimeout(guardTimer)
          resolve(value)
        }

        // 弹窗前顺手关掉可能存在的 loading：全局层互斥时 showModal 会走 fail。
        // （本次的 fail 实测是 confirmText 超长引起的，与 loading 无关；
        //  这行只是顺手去掉一个同类隐患，不是本次修复点。）
        try {
          wx.hideLoading()
        } catch (e) {
          // hideLoading 无内容时不会抛错，兜着以防基础库差异
        }

        // ⚠️⚠️ confirmText / cancelText 最多 4 个中文字符（或 8 个英文字母），
        // 超了 wx.showModal **整个调用直接 fail**，弹窗根本不显示、控制台默认也不报错。
        // 实测踩到：'看视频解锁' 5 个字 →
        //   showModal:fail confirmText length should not larger than 4 Chinese characters
        // 表现为「点了没反应 + 不弹窗」，是本项目最难定位的一次故障。
        // 改这两个文案时**必须数一下字数**，别再写长。
        wx.showModal({
          title: '赞助开发者',
          content: content,
          confirmText: '看视频',
          cancelText: '暂不用',
          success: function (res) {
            if (!res.confirm) {
              // 用户主动放弃：明确告诉他这次操作没生效，别让他以为「点了没反应」
              wx.showToast({ title: '已取消，本次操作未生效', icon: 'none' })
              settle(false)
              return
            }

            // 用户已确认，开始等广告结果；超时无响应就放行
            guardTimer = setTimeout(function () {
              console.warn('[weekPass] 激励任务超时无响应，临时放行')
              writeLocal(getWeekKey())
              settle(true)
            }, AD_GUARD_TIMEOUT)

            try {
              ad.showRewarded({
                pageCtx: o.pageCtx,
                onGranted: function () {
                  grantPass().then(function () {
                    wx.showToast({ title: '感谢赞助，本周已开放', icon: 'none' })
                    settle(true)
                  })
                },
                onFail: function (reason) {
                  if (reason === 'notFinished') {
                    // 用户自己中途退出：不给权限，也不打扰
                    wx.showToast({ title: '未完成赞助，本次暂不可用', icon: 'none' })
                    settle(false)
                    return
                  }
                  // 拉取不到 / 创建失败 / 绑定失败：一律临时放行，只写本地不写云端
                  // 绝不能让用户卡在「解锁不了 = 功能用不了」的死路上
                  console.warn('[weekPass] 激励任务不可用，临时放行', reason)
                  writeLocal(getWeekKey())
                  wx.showToast({ title: '加载失败，本次已开放', icon: 'none' })
                  settle(true)
                }
              })
            } catch (e) {
              // showRewarded 同步抛错（基础库差异 / 广告位异常）也必须放行
              console.warn('[weekPass] 唤起激励任务异常，临时放行', e)
              writeLocal(getWeekKey())
              settle(true)
            }
          },
          fail: function (err) {
            // 弹窗调用失败：参数非法（confirmText 超 4 个中文字符等）或全局层冲突。
            // 用户什么都没看到，这时候拒绝他就是「点了没反应」，比放行糟糕得多。
            // ⚠️ 旧代码这里 settle(false)，正是「不弹窗 + 无法提交 + 无报错」的根因。
            // ⚠️ 这行 warn 是定位这类问题的唯一线索，别删。
            console.warn('[weekPass] 弹窗调用失败，本次放行', err)
            writeLocal(getWeekKey())
            wx.showToast({ title: '本次已为您开放', icon: 'none' })
            settle(true)
          }
        })

        // 弹窗已交到用户手上：撤掉 12 秒总闸，改用更长的弹窗超时
        if (typeof onModalShown === 'function') onModalShown()
      })
    })
  })
}

/**
 * 清除本机的解锁状态，**仅供联调测试**
 *
 * ⚠️ 为什么必须做这个工具：兜底逻辑会在多处「顺手」写本地通行证
 * （云端查不到、弹窗失败、广告拉不到都会放行并写本地），
 * 于是一旦失败过一次，**本周之内就再也弹不出解锁弹窗了** —— 想复测只能等下周一。
 * 测试态被这种兜底污染，是排查过程中最耽误事的一环。
 *
 * 三处都得清，清一处都不够：
 *   ① 本地 storage 通行证（weekPassLocal）
 *   ② 云端 users.weekPass（服务端权威记录，不清它下一轮 query 又判定已持有）
 *   ③ 广告的「不可用」冷却（内存变量，10 分钟内会直接跳过唤起）
 *
 * @returns {Promise<{local:boolean, cloud:boolean, cloudErr:string}>}
 */
function resetForTest() {
  let local = false
  try {
    wx.removeStorageSync(LOCAL_KEY)
    local = true
  } catch (e) {
    console.warn('[weekPass] 清除本地通行证失败', e)
  }

  // 开关缓存一并清掉，保证重新拉到最新的远程配置
  clearConfigCache()

  if (typeof ad.resetUnavailable === 'function') ad.resetUnavailable()

  return callCloud('reset')
    .then(function (r) {
      return { local: local, cloud: !!(r && r.ok), cloudErr: r && r.ok ? '' : (r && r.reason) || 'unknown' }
    })
    .catch(function (e) {
      return {
        local: local,
        cloud: false,
        cloudErr: (e && (e.errMsg || e.message)) || String(e)
      }
    })
}

/**
 * 自检：把「点了没反应」拆成能一眼定位的几段
 *
 * 真机上看不到控制台，光加日志解决不了问题 —— 所以把链路每段的耗时与结论
 * 直接返回给调用方（超管「激励开关」页的自检面板），用数据说话而不是猜：
 *   总开关 → 远程开关读取 → 云端通行证查询 → 广告实例创建与加载
 *
 * ⚠️ 全程直连云函数、不走缓存，否则看到的可能是 5 分钟前的旧值。
 *
 * @param {Object} pageCtx 页面 this
 * @returns {Promise<Object>}
 */
function diagnose(pageCtx) {
  const out = {
    enabled: adConfig.ENABLED === true,
    weekKey: getWeekKey(),
    weekRange: getWeekRangeText(),
    localPass: hasPassSync(),
    configMs: -1,
    config: null,
    configErr: '',
    queryMs: -1,
    cloudValid: null,
    queryErr: '',
    ad: null
  }

  const t0 = Date.now()
  return callCloud('config')
    .then(
      function (r) {
        out.configMs = Date.now() - t0
        out.config = (r && r.config) || null
        if (!r || !r.ok) out.configErr = (r && r.reason) || '云函数返回 ok=false'
      },
      function (e) {
        out.configMs = Date.now() - t0
        out.configErr = (e && (e.errMsg || e.message)) || String(e)
      }
    )
    .then(function () {
      const t1 = Date.now()
      return callCloud('query').then(
        function (r) {
          out.queryMs = Date.now() - t1
          out.cloudValid = !!(r && r.ok && r.valid)
          if (!r || !r.ok) out.queryErr = (r && r.reason) || 'ok=false'
        },
        function (e) {
          out.queryMs = Date.now() - t1
          out.queryErr = (e && (e.errMsg || e.message)) || String(e)
        }
      )
    })
    .then(function () {
      return ad.probeAd(pageCtx)
    })
    .then(function (adResult) {
      out.ad = adResult
      return out
    })
}

/**
 * 预热激励视频（页面 onLoad 里调一次，纯体验优化，可以随便删掉不影响功能）
 *
 * 为什么需要：广告实例是「首次点击才创建」的，第一次点击要等
 * show 失败 → load → 再 show 这一圈，弱网下就是「点了半天没动静」。
 * 页面进来时静默 load 一次，点下去能直接播。
 *
 * 三种情况直接跳过，一次多余请求都不发：
 *   ① 总开关关闭 / 广告位没配（ad.warmup 内部判断）
 *   ② 本周已经持有通行证 —— 这个页面根本不会弹广告
 *   ③ 广告刚失败过、还在冷却期（ad.warmup 内部判断）
 *
 * ⚠️ 全程 try/catch + 静默失败：预热是加分项，**不能**让它影响页面加载。
 *
 * @param {Object} pageCtx 页面 this（必须是页面实例，不能是 app）
 */
function warmup(pageCtx) {
  try {
    if (!adConfig.ENABLED) return
    // 本地已持有 = 本周不会再弹广告，别白拉一次素材
    if (hasPassSync()) return
    ad.warmup(pageCtx)
  } catch (e) {
    console.warn('[weekPass] 预热激励视频失败', e)
  }
}

module.exports = {
  diagnose: diagnose,
  resetForTest: resetForTest,
  warmup: warmup,
  getWeekStart: getWeekStart,
  getWeekEnd: getWeekEnd,
  getWeekKey: getWeekKey,
  getWeekRangeText: getWeekRangeText,
  hasPassSync: hasPassSync,
  ensurePass: ensurePass,
  grantPass: grantPass,
  getGateConfig: getGateConfig,
  clearConfigCache: clearConfigCache,
  setGates: setGates,
  isGateOn: isGateOn,
  requirePass: requirePass
}
