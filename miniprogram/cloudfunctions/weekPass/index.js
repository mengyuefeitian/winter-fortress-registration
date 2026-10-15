// cloudfunctions/weekPass/index.js
// 「本周通行证」云端权威校验与发放
//
// 为什么必须走云函数：本地 storage 判定会被改手机系统时间绕过，
// 自然周的归属必须由**服务器时间**说了算。
//
// ⚠️ 时区：云函数运行环境默认 UTC（+0），而自然周要按北京时间算。
//    所以先给时间戳加 8 小时再交给 Date 方法处理，读出来的才是北京时间的年月日/星期。
//
// ⚠️ 铁律（本项目 v1.18.13 的血泪）：云数据库底层是 MongoDB，
//    不允许在标量 null 上创建子字段。weekPass 若曾被写成 null，
//    直接 update 成对象会报 -502001。所以旧值为 null 时先 _.remove() 再写。
//
// action:
//   query      查询本周（服务器时间所在自然周）是否已持有通行证
//   grant      发放本周通行证
//   reset      清空自己的本周通行证（**仅供联调测试**，只能清自己）
//   config     读取远程开关（集合 appConfig），供客户端决定要不要拦某一类操作
//   setConfig  修改远程开关，**仅超管**（超管控制台的「广告开关」页面用）
//
// ⚠️ 开关为什么不依赖固定 _id（实测踩到）：
//    云开发控制台的「添加记录」界面**不提供 _id 输入框**，_id 由系统自动生成。
//    只有走 API（云函数 add 时传 _id）才能指定 _id。所以这里的读法是：
//      ① 先按约定 _id = 'adGate' 取（云函数自己建的、或将来能指定时）
//      ② 取不到 → 读集合第一条（兼容用户在控制台手工建的记录）
//      ③ 都没有 → 云函数**自动建一条**默认开关，用户直接去控制台改值即可
//    这样用户连集合都不用手建，也不需要考虑 _id 怎么写。

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 北京时间偏移（云函数默认 UTC+0）
const BJ_OFFSET = 8 * 60 * 60 * 1000

// 远程开关所在集合与约定文档 ID
const CONFIG_COLLECTION = 'appConfig'
const CONFIG_DOC_ID = 'adGate'

// 云函数内置兜底值：集合读不到、也写不进去时用它
// （想让开关在「集合完全不可用」时也生效，改这里并重新部署本云函数即可，不用发版小程序）
const GATE_FALLBACK = { registerGate: true, valueGate: true }

// 开关字段名。归一化后只吐出这几个 key，_id 之类的元字段不带出去
const GATE_KEYS = ['registerGate', 'valueGate']

/**
 * 从一条文档里抽出开关字段，一条都没有则返回 null
 * 兼容 boolean 与 0/1 数字：控制台手工填值很容易填成数字，
 * 但**字符串一律不认**（"false" 是最危险的误配置，会被当成真值用）
 * @param {Object} doc
 * @returns {Object|null}
 */
function pickGates(doc) {
  if (!doc) return null
  const out = {}
  let hit = false
  GATE_KEYS.forEach(function (k) {
    const v = doc[k]
    if (typeof v === 'boolean') {
      out[k] = v
      hit = true
    } else if (v === 1 || v === 0) {
      out[k] = v === 1
      hit = true
    }
  })
  return hit ? out : null
}

/**
 * 校验调用者是不是超管
 * 沿用 manageAdmin 的口径：`users.role === 'superAdmin'`
 * （先按 _openid 查，查不到再按业务 openid 字段回落一次，兼容两种存法的用户文档）
 * @param {string} openid
 * @returns {Promise<{ok:boolean, reason?:string}>>}
 */
async function requireSuperAdmin(openid) {
  if (!openid) return { ok: false, reason: 'noOpenid' }

  let user = await findUser(openid)
  if (!user) {
    try {
      const r = await db.collection('users').where({ openid: openid }).limit(1).get()
      user = (r && r.data && r.data[0]) || null
    } catch (e) {
      user = null
    }
  }
  if (!user) return { ok: false, reason: 'noUser' }
  if (user.role !== 'superAdmin') return { ok: false, reason: 'permissionDenied' }
  return { ok: true }
}

/**
 * 只接受布尔值与 0/1，且必须至少有一个有效字段
 * @param {Object} data
 * @returns {Object|null}
 */
function normalizePatch(data) {
  const patch = {}
  const keys = GATE_KEYS
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]
    const v = data[k]
    if (typeof v === 'boolean') patch[k] = v
    else if (v === 1 || v === 0) patch[k] = v === 1
  }
  return Object.keys(patch).length ? patch : null
}

/**
 * 写入开关字段：优先更新约定文档，不存在就建，再不行更新集合第一条
 * @param {Object} patch
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
async function writeGates(patch) {
  const coll = db.collection(CONFIG_COLLECTION)

  // ① 更新约定文档（超管页面改的就是它）
  try {
    const r = await coll.doc(CONFIG_DOC_ID).update({ data: patch })
    if (r && r.stats && r.stats.updated > 0) return { ok: true, target: CONFIG_DOC_ID }
  } catch (e) {
    // 文档不存在（update 对不存在的 doc 会抛错）→ 走创建
  }

  // ② 建集合 + 建文档
  try {
    if (typeof db.createCollection === 'function') {
      try {
        await db.createCollection(CONFIG_COLLECTION)
      } catch (e) {
        // 已存在会报错，忽略
      }
    }
    const res = await coll.add({
      data: Object.assign({ _id: CONFIG_DOC_ID }, GATE_FALLBACK, patch)
    })
    if (res && res._id) return { ok: true, target: res._id, created: true }
  } catch (e) {
    console.warn('[weekPass] 写入开关文档失败', String((e && e.message) || e))
  }

  // ③ 兜底：更新集合第一条（例如只有用户手工建的随机 _id 记录）
  try {
    const r = await coll.limit(1).get()
    const first = (r && r.data && r.data[0]) || null
    if (first) {
      await coll.doc(first._id).update({ data: patch })
      return { ok: true, target: first._id }
    }
  } catch (e) {
    // 彻底写不进去
  }

  return { ok: false, reason: 'writeFailed' }
}

/**
 * 读取远程开关，读不到就地建/修一份默认的
 *
 * 关键点：**不能盲目相信 _id = adGate 那条**。控制台手工添加记录时很容易只填了 _id
 * 就保存，留下一条「空壳」记录；如果直接返回它，开关就永远读不到值。
 * 所以每一级都要求「确实含开关字段」，空壳只记下来、最后用来补字段。
 *
 * @returns {Promise<{config:Object, source:string}>}
 */
async function readGateConfig() {
  const coll = db.collection(CONFIG_COLLECTION)
  let shell = null // 只填了 _id 的空壳文档

  // ① 约定 _id（云函数自动建的就是它），但必须含开关字段才算数
  try {
    const r = await coll.doc(CONFIG_DOC_ID).get()
    const doc = (r && r.data) || null
    const g = pickGates(doc)
    if (g) {
      return { config: Object.assign({ _id: CONFIG_DOC_ID }, g), source: 'remote' }
    }
    if (doc) shell = doc
  } catch (e) {
    // 集合不存在 / 文档不存在，继续往下试
  }

  // ② 集合里任意一条含开关字段的记录（兼容控制台手工建的随机 _id）
  try {
    const r = await coll.limit(50).get()
    const list = (r && r.data) || []
    for (let i = 0; i < list.length; i++) {
      const g = pickGates(list[i])
      if (g) {
        return { config: Object.assign({ _id: list[i]._id }, g), source: 'remote' }
      }
    }
  } catch (e) {
    // 集合不存在，继续往下走自动创建
  }

  // ③ 没有任何一条带开关字段的记录 → 新建或修补
  //    官方文档：新建集合「仅支持通过云函数端 SDK 及控制台」→ 这里显式建，不赌 add 的隐式行为
  try {
    if (typeof db.createCollection === 'function') {
      try {
        await db.createCollection(CONFIG_COLLECTION)
      } catch (e) {
        // 集合已存在会报错，忽略
      }
    }

    // 空壳 → 补字段（再 add 一条同 _id 会报重复，必须走 update）
    if (shell) {
      await coll.doc(CONFIG_DOC_ID).update({ data: Object.assign({}, GATE_FALLBACK) })
      return { config: Object.assign({ _id: CONFIG_DOC_ID }, GATE_FALLBACK), source: 'repaired' }
    }

    const res = await coll.add({
      data: Object.assign({ _id: CONFIG_DOC_ID }, GATE_FALLBACK)
    })
    if (res && res._id) {
      return { config: Object.assign({ _id: CONFIG_DOC_ID }, GATE_FALLBACK), source: 'created' }
    }
  } catch (e) {
    // 建不了（配额 / 权限异常）→ 用云函数内置值，不影响用户使用
    console.warn('[weekPass] 自动创建开关文档失败', String((e && e.message) || e))
  }

  return { config: GATE_FALLBACK, source: 'cloudfunction' }
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

/**
 * 按北京时间构造 Date（内部时间戳已偏移，后续 getDay/setHours 等读出的都是北京时间语义）
 * @param {number} ts
 * @returns {Date}
 */
function beijingDate(ts) {
  return new Date((ts == null ? Date.now() : ts) + BJ_OFFSET)
}

/**
 * 自然周唯一标识：该周周一日期 YYYYMMDD（北京时间口径）
 * @param {Date} d
 * @returns {string}
 */
function weekKeyOf(d) {
  const x = new Date(d.getTime())
  x.setHours(0, 0, 0, 0)
  const day = x.getDay() // 0=周日 1=周一 ... 6=周六
  const offset = (day + 6) % 7 // 周一 → 0，周日 → 6
  x.setDate(x.getDate() - offset)
  return `${x.getFullYear()}${pad2(x.getMonth() + 1)}${pad2(x.getDate())}`
}

/**
 * 服务端算出的当前自然周 key（前端传来的只做记录，不做判定依据）
 */
function serverWeekKey() {
  return weekKeyOf(beijingDate())
}

async function findUser(openid) {
  const res = await db
    .collection('users')
    .where({ _openid: openid })
    .limit(1)
    .get()
  return (res && res.data && res.data[0]) || null
}

/**
 * 写入 weekPass，规避 null → 对象 的 -502001
 * @param {string} docId
 * @param {*} oldVal 旧值
 * @param {Object} newVal
 */
async function safeWriteWeekPass(docId, oldVal, newVal) {
  const coll = db.collection('users')
  // 旧值是标量（null / 字符串 / 数字）而新值是对象 → 必须先删掉该字段再写
  const needRemove =
    oldVal !== undefined && (oldVal === null || typeof oldVal !== 'object')
  if (needRemove) {
    await coll.doc(docId).update({ data: { weekPass: _.remove() } })
  }
  await coll.doc(docId).update({ data: { weekPass: newVal } })
}

exports.main = async (event) => {
  const data = event.data || event
  const action = data.action

  // ⚠️ 远程开关必须放在 openid 校验**之前**：
  //    ① 它纯读配置，与用户身份无关（未入库用户也要能取到）；
  //    ② 云开发控制台的「云端测试」不携带 openid，放在后面会被 noOpenid 直接拦掉，
  //       导致用来生成默认开关文档的测试调用永远返回 {"ok":false,"reason":"noOpenid"}。
  if (action === 'config') {
    try {
      const r = await readGateConfig()
      return { ok: true, config: r.config, source: r.source }
    } catch (e) {
      // 兜底：读配置本身出异常也不能让云函数 500
      console.error('[weekPass] 读开关异常', e)
      return { ok: true, config: GATE_FALLBACK, source: 'cloudfunction' }
    }
  }

  // 修改开关：必须超管。鉴权放云函数里，客户端改不了也绕不过
  if (action === 'setConfig') {
    try {
      const guard = await requireSuperAdmin(cloud.getWXContext().OPENID)
      if (!guard.ok) return { ok: false, reason: guard.reason }

      const patch = normalizePatch(data)
      if (!patch) return { ok: false, reason: 'noValidField' }

      const w = await writeGates(patch)
      if (!w.ok) return { ok: false, reason: w.reason }

      // 回读一次，把真正生效的值返回给前端（避免前端以为是改了其实没写进去）
      const r = await readGateConfig()
      return { ok: true, saved: true, config: r.config, source: r.source }
    } catch (e) {
      console.error('[weekPass] setConfig 异常', e)
      return { ok: false, reason: 'exception', message: String((e && e.message) || e) }
    }
  }

  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { ok: false, reason: 'noOpenid' }
  }

  const weekKey = serverWeekKey()

  try {
    const user = await findUser(openid)

    if (!user) {
      // 用户尚未入库（没登录过 / 未产生记录）：视为未持有，不影响本地放行
      return { ok: true, valid: false, weekKey: weekKey, reason: 'noUser' }
    }

    if (action === 'query') {
      const wp = user.weekPass
      return {
        ok: true,
        valid: !!(wp && wp.weekKey === weekKey),
        weekKey: weekKey,
        grantedAt: wp && wp.grantedAt ? wp.grantedAt : null
      }
    }

    if (action === 'grant') {
      await safeWriteWeekPass(user._id, user.weekPass, {
        weekKey: weekKey,
        grantedAt: Date.now(),
        // 前端算出的周 key 只作留痕，判定一律以服务端 weekKey 为准
        clientWeekKey: data.weekKey || null
      })
      return { ok: true, weekKey: weekKey }
    }

    // 清空「自己」的本周通行证，仅供联调测试重新走一遍解锁流程。
    // 只能清自己的（openid 来自微信上下文，客户端伪造不了），不影响其他用户。
    // 用 _.remove() 而不是写 null —— 字段不存在 → 对象 是允许的，
    // 而 null → 对象 会撞 -502001（v1.18.13 的血泪）。
    if (action === 'reset') {
      await db.collection('users').doc(user._id).update({ data: { weekPass: _.remove() } })
      return { ok: true, reset: true, weekKey: weekKey }
    }

    return { ok: false, reason: 'unknownAction' }
  } catch (e) {
    console.error('[weekPass] 失败', { action: action, openid: openid, err: e })
    return { ok: false, reason: 'exception', message: String((e && e.message) || e) }
  }
}
