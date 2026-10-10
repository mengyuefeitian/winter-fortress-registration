// cloudfunctions/bearPit/index.js
// 熊坑报名：一个联盟一条「看板」文档（bearPitBoards），members 数组存全部报名人员
//
// 为什么用「看板文档」而不是「一人一条记录」：
//   熊坑的座位号是全局重排的（任何人报名 / 被删都会牵动所有人），
//   如果一人一条记录，一次重排要写 100+ 条 → 云函数容易超时。
//   整张看板放进一个文档后，一次重排 = 一次读 + 一次写。
//
// 动作：
//   getBoard  { allianceId }                        → 读看板
//   register  { zoneId, allianceId, nickName, ... }  → 覆盖报名 + 重排
//   remove    { allianceId, regId }                  → 盟管/区管/超管删除 + 重排
//   (clearBoard 留给超管清空，谨慎使用)
//
// 位置口径（见 layout.js）：全部 140 个位置，其中 16 个是「旗子位」不能排人，
// 可坐 124 个；但**最多只排 100 人**（layout.MAX_MEMBERS）。
//
// 排位规则：先按地心探险等级从高到低把每个人排进自己那一环（环由名次决定、永不改变），
// 然后在**自己那一环内自由换位**（挪空位 / 与同环的人互换），保证选了「邻居」的人
// 能挨上邻居，同时等级低的人不会被带进更靠内的环。
//
// 看板文档带 layoutVersion：座位几何 / 排位规则升级后，getBoard 发现版本落后会
// 自动重排一次并回写，用户不用重新报名（见 layout.LAYOUT_VERSION）。

const cloud = require('wx-server-sdk')
const layout = require('./layout')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const COLL = 'bearPitBoards'

const MANAGE_ROLES = ['auditor', 'admin', 'superAdmin']

exports.main = async (event, context) => {
  const data = (event && event.data) || event || {}
  const action = (event && event.action) || data.action

  try {
    switch (action) {
      case 'getBoard':
        return await getBoard(data)
      case 'register':
        return await register(data)
      case 'remove':
        return await remove(data)
      case 'clearBoard':
        return await clearBoard(data)
      default:
        return { success: false, error: 'Unknown action: ' + action }
    }
  } catch (err) {
    return { success: false, error: err.message || String(err) }
  }
}

// ─────────────────────────── 工具 ───────────────────────────

function nickKey(nick) {
  return String(nick === undefined || nick === null ? '' : nick).trim()
}

function normalizeDixin(v) {
  if (v === '' || v === null || v === undefined) return null
  const n = parseInt(v, 10)
  if (isNaN(n) || n < 0) return null
  return Math.min(n, 999999)
}

function newRegId() {
  return 'bp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
}

// 读看板（不存在则返回空看板，不落库）
async function readBoard(allianceId) {
  if (!allianceId) throw new Error('缺少 allianceId')
  const res = await db.collection(COLL).where({ allianceId }).limit(1).get()
  const doc = (res.data && res.data[0]) || null
  if (doc) return doc
  return { _id: '', allianceId, zoneId: '', members: [], updateTime: 0 }
}

// 重排座位：清掉已被删除的邻居目标，再整体重排
function replan(members) {
  const planned = layout.planSeats(members || [])
  return planned.map(m => ({
    regId: m.regId,
    userId: m.userId || '',
    nickName: nickKey(m.nickName),
    accountId: m.accountId || '',
    dixin: (m.dixin === null || m.dixin === undefined) ? null : m.dixin,
    mode: m.mode === 'neighbor' ? 'neighbor' : 'power',
    neighborNick: m.neighborNick || '',
    neighborSeat: m.neighborSeat || 0,
    seatIndex: m.seatIndex || 0,
    createTime: m.createTime || 0,
    updateTime: m.updateTime || 0
  }))
}

async function saveBoard(board, members) {
  const payload = {
    allianceId: board.allianceId,
    zoneId: board.zoneId || '',
    members,
    // 记下算这些座位号用的布局版本：老看板（版本落后）在 getBoard 时自动重排一次
    layoutVersion: layout.LAYOUT_VERSION,
    updateTime: db.serverDate()
  }
  if (board._id) {
    await db.collection(COLL).doc(board._id).update({ data: payload })
    return board._id
  }
  const res = await db.collection(COLL).add({ data: payload })
  return res._id
}

// ─────────────────────────── 动作 ───────────────────────────

async function getBoard(data) {
  const board = await readBoard(data.allianceId)
  let members = board.members || []
  // 座位几何 / 排位规则升级过 → 老座位号已经不对了，就地重排一次并回写（一次性自愈）
  if (board._id && board.layoutVersion !== layout.LAYOUT_VERSION) {
    members = replan(members)
    await saveBoard(board, members)
  }
  return {
    success: true,
    board: {
      allianceId: board.allianceId,
      zoneId: board.zoneId || '',
      members: members,
      seatTotal: layout.TOTAL_SLOTS,
      maxMembers: layout.MAX_MEMBERS,
      layoutVersion: layout.LAYOUT_VERSION,
      updateTime: board.updateTime || 0
    }
  }
}

async function register(data) {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) throw new Error('未获取到用户身份，请重新进入小程序')

  const allianceId = data.allianceId
  const nickName = nickKey(data.nickName)
  if (!allianceId) throw new Error('请选择联盟')
  if (!nickName) throw new Error('请填写昵称')
  if (nickName.length > 24) throw new Error('昵称过长（最多 24 个字）')

  const dixin = normalizeDixin(data.dixin)
  const mode = data.mode === 'neighbor' ? 'neighbor' : 'power'
  let neighborNick = mode === 'neighbor' ? nickKey(data.neighborNick) : ''

  const board = await readBoard(allianceId)
  const members = (board.members || []).slice()
  if (data.zoneId) board.zoneId = data.zoneId

  const now = Date.now()
  const idx = members.findIndex(m => nickKey(m.nickName) === nickName)

  // 邻居合法性：目标必须是本联盟已报名的人，且没有被别人选走
  if (neighborNick) {
    if (neighborNick === nickName) {
      neighborNick = ''
    } else {
      const target = members.filter(m => nickKey(m.nickName) === neighborNick)[0]
      if (!target) {
        neighborNick = ''
      } else {
        const takenBy = members.filter(m => nickKey(m.nickName) !== nickName && nickKey(m.neighborNick) === neighborNick)[0]
        if (takenBy) neighborNick = ''
      }
    }
  }

  if (idx >= 0) {
    const old = members[idx]
    members[idx] = Object.assign({}, old, {
      nickName,
      accountId: data.accountId || old.accountId || '',
      userId: openid,
      dixin,
      mode,
      neighborNick,
      updateTime: now
    })
  } else {
    if (members.length >= layout.MAX_MEMBERS) {
      throw new Error('熊坑最多排 ' + layout.MAX_MEMBERS + ' 人，已经满了')
    }
    members.push({
      regId: newRegId(),
      userId: openid,
      nickName,
      accountId: data.accountId || '',
      dixin,
      mode,
      neighborNick,
      neighborSeat: 0,
      seatIndex: 0,
      createTime: now,
      updateTime: now
    })
  }

  const planned = replan(members)
  await saveBoard(board, planned)

  const mine = planned.filter(m => m.nickName === nickName)[0] || null
  return {
    success: true,
    member: mine,
    members: planned,
    seatTotal: layout.TOTAL_SLOTS,
    maxMembers: layout.MAX_MEMBERS
  }
}

// 删除一条报名（盟管 / 区管 / 超管）：删除后整体重排，曾经选他为邻居的人自动变成「无邻居」
async function remove(data) {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const allianceId = data.allianceId
  const regId = data.regId
  const nickName = nickKey(data.nickName)

  if (!allianceId) throw new Error('缺少 allianceId')
  if (!regId && !nickName) throw new Error('缺少要删除的报名记录')

  await assertCanManage(openid, allianceId)

  const board = await readBoard(allianceId)
  const members = (board.members || []).slice()
  const next = members.filter(m => {
    if (regId) return m.regId !== regId
    return nickKey(m.nickName) !== nickName
  })
  if (next.length === members.length) throw new Error('该报名记录不存在或已被删除')

  const planned = replan(next)
  await saveBoard(board, planned)

  return {
    success: true,
    removed: members.length - next.length,
    members: planned,
    seatTotal: layout.TOTAL_SLOTS,
    maxMembers: layout.MAX_MEMBERS
  }
}

// 超管清空某联盟的熊坑看板
async function clearBoard(data) {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  await assertCanManage(openid, data.allianceId, true)
  const board = await readBoard(data.allianceId)
  if (!board._id) return { success: true, members: [] }
  await db.collection(COLL).doc(board._id).update({
    data: { members: [], updateTime: db.serverDate() }
  })
  return { success: true, members: [] }
}

// 鉴权：超管 / 区管放行；盟管必须是该联盟绑定的盟管
async function assertCanManage(openid, allianceId, superOnly) {
  if (!openid) throw new Error('未获取到用户身份，请重新进入小程序')
  const userRes = await db.collection('users').where({ openid }).limit(1).get()
  const user = (userRes.data && userRes.data[0]) || null
  if (!user) throw new Error('用户不存在')
  const role = user.role || 'user'

  if (role === 'superAdmin') return true
  if (superOnly) throw new Error('只有超级管理员可以执行该操作')
  if (role === 'admin') return true

  if (role === 'auditor') {
    const allianceRes = await db.collection('alliances').doc(allianceId).get()
    const alliance = allianceRes.data || {}
    const ids = alliance.auditorIds || (alliance.auditorId ? [alliance.auditorId] : [])
    if (ids.indexOf(user._id) >= 0) return true
    throw new Error('只能删除本联盟的报名')
  }

  throw new Error('权限不足，仅盟管、区管和超级管理员可删除报名')
}
