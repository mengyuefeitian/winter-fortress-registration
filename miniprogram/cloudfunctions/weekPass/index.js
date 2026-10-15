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
//   query  查询本周（服务器时间所在自然周）是否已持有通行证
//   grant  发放本周通行证

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 北京时间偏移（云函数默认 UTC+0）
const BJ_OFFSET = 8 * 60 * 60 * 1000

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

    return { ok: false, reason: 'unknownAction' }
  } catch (e) {
    console.error('[weekPass] 失败', { action: action, openid: openid, err: e })
    return { ok: false, reason: 'exception', message: String((e && e.message) || e) }
  }
}
