// 联盟活跃 —— 云函数
// 说明：allianceMembers（持久成员名单）/ allianceActivity（本周活跃记录）两个集合
// 均为服务端管理员权限写入，客户端无法直接操作，故所有读写都收口到本云函数。
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

const WEEK_NAMES = ['一', '二', '三', '四', '五', '六', '日']

// ============ 时间工具：统一按北京时间(UTC+8)计算 ============
function toBeijing(date) {
  return new Date(date.getTime() + 8 * 3600 * 1000)
}

function fmtDate(dt) {
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// 本周一 YYYY-MM-DD
function getWeekStart(date = new Date()) {
  const bj = toBeijing(date)
  const day = bj.getUTCDay()            // 0=周日 ... 6=周六
  const diff = day === 0 ? 6 : day - 1  // 让周一为 0
  bj.setUTCDate(bj.getUTCDate() - diff)
  bj.setUTCHours(0, 0, 0, 0)
  return fmtDate(bj)
}

// 今天是一周第几天（0=周一 ... 6=周日）
function getDayIndex(date = new Date()) {
  const bj = toBeijing(date)
  const day = bj.getUTCDay()
  return day === 0 ? 6 : day - 1
}

// 本周 7 天：{ date: '2026-09-16', md: '0916', weekName: '周三', label: '0916(三)' }
// md / weekName 用于两行表头展示，避免窄列里 "0916(三)" 被截断成 "091…"
function buildWeekDates(weekStart) {
  const parts = String(weekStart).split('-').map(Number)
  const start = Date.UTC(parts[0], parts[1] - 1, parts[2])
  const out = []
  for (let i = 0; i < 7; i++) {
    const dt = new Date(start + i * 86400000)
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(dt.getUTCDate()).padStart(2, '0')
    out.push({
      date: fmtDate(dt),
      md: `${mm}${dd}`,
      weekName: `周${WEEK_NAMES[i]}`,
      label: `${mm}${dd}(${WEEK_NAMES[i]})`
    })
  }
  return out
}

function emptyDays() {
  return [false, false, false, false, false, false, false]
}

// ============ 通用：分页全量拉取（云函数端单 get 上限 100 条） ============
async function fetchAll(coll, where, orderField, orderDir) {
  const pageSize = 100
  const MAX = 2000
  let all = []
  let skip = 0
  while (true) {
    let q = db.collection(coll).where(where)
    if (orderField) q = q.orderBy(orderField, orderDir || 'asc')
    const res = await q.skip(skip).limit(pageSize).get()
    all = all.concat(res.data)
    if (res.data.length < pageSize) break
    skip += pageSize
    if (skip >= MAX) break
  }
  return all
}

async function getCaller(openid) {
  if (!openid) return null
  const res = await db.collection('users').where({ openid: openid }).limit(1).get()
  return res.data.length > 0 ? res.data[0] : null
}

// 是否有权管理该联盟：超管=全部；盟管=自己绑定的联盟；区管=自己分区下的联盟
async function canManageAlliance(caller, alliance) {
  if (!caller || !alliance) return false
  const role = caller.role
  const uid = caller._id
  if (role === 'superAdmin') return true
  if (role === 'auditor') {
    const ids = alliance.auditorIds || (alliance.auditorId ? [alliance.auditorId] : [])
    return ids.indexOf(uid) >= 0
  }
  if (role === 'admin') {
    let zoneRes = null
    try {
      zoneRes = await db.collection('zones').doc(alliance.zoneId).get()
    } catch (e) {
      zoneRes = null
    }
    if (!zoneRes || !zoneRes.data) return false
    const z = zoneRes.data
    return (z.adminIds || []).indexOf(uid) >= 0 || z.creatorId === uid
  }
  return false
}

async function loadAlliance(allianceId) {
  try {
    const res = await db.collection('alliances').doc(allianceId).get()
    return res.data || null
  } catch (e) {
    return null
  }
}

// 检查联盟是否属于指定分区（zoneId 为空时不做分区限制）
function allianceInZone(alliance, zoneId) {
  if (!zoneId) return true
  return !!alliance && alliance.zoneId === zoneId
}

/**
 * 回溯历史报名记录，找出该用户"最后一次选择的联盟"
 * 背景：users.allianceId 只有在报名成功时才回写，本次改动前报过名的老用户该字段为空，
 *       导致自动活跃登记失败。这里按分区隔离（避免用户在多个分区有账号时串区）。
 * 覆盖集合：registrations(堡垒) / battleRegistrations(国战) / canyonRegistrations(峡谷)
 *          （兵工厂报名记录不含 allianceId，无法回溯）
 */
async function findLastAllianceFromRegistrations(userId, zoneId) {
  if (!userId) return null
  const collections = ['registrations', 'battleRegistrations', 'canyonRegistrations']
  let best = null // { allianceId, nickName, time }

  for (const coll of collections) {
    const where = { userId: userId }
    if (zoneId) where.zoneId = zoneId
    let res
    try {
      res = await db.collection(coll).where(where).orderBy('createTime', 'desc').limit(20).get()
    } catch (e) {
      continue // 集合不存在或字段索引缺失，跳过
    }
    for (const r of (res.data || [])) {
      if (!r.allianceId) continue
      const t = r.createTime ? new Date(r.createTime).getTime() : 0
      if (!best || t > best.time) {
        best = { allianceId: r.allianceId, nickName: r.nickName || '', time: t }
      }
    }
  }

  if (!best) return null
  const alliance = await loadAlliance(best.allianceId)
  if (!alliance) return null
  if (!allianceInZone(alliance, zoneId)) return null
  return { allianceId: best.allianceId, alliance: alliance, nickName: best.nickName }
}

// 只保留本周：删除非本周的活跃记录（成员名单保留，跨周延续）
async function cleanupExpired() {
  const weekStart = getWeekStart()
  let deleted = 0
  // 分批删除，避免单次 remove 数量过大
  for (let i = 0; i < 50; i++) {
    const res = await db.collection('allianceActivity')
      .where({ weekStart: _.neq(weekStart) })
      .limit(100)
      .get()
    if (!res.data || res.data.length === 0) break
    for (const doc of res.data) {
      await db.collection('allianceActivity').doc(doc._id).remove()
      deleted++
    }
    if (res.data.length < 100) break
  }
  return { success: true, deleted: deleted, weekStart: weekStart }
}

// ============ Action: 盟管/区管/超管 查看某联盟本周活跃 ============
async function listMembers(data, openid) {
  const { allianceId } = data
  if (!allianceId) return { success: false, error: '缺少 allianceId' }

  const caller = await getCaller(openid)
  const alliance = await loadAlliance(allianceId)
  if (!alliance) return { success: false, error: '联盟不存在' }
  const allowed = await canManageAlliance(caller, alliance)
  if (!allowed) return { success: false, error: '权限不足' }

  const weekStart = getWeekStart()
  const dayIndex = getDayIndex()

  const members = await fetchAll('allianceMembers', { allianceId: allianceId }, 'createTime', 'asc')
  const activities = await fetchAll('allianceActivity', { allianceId: allianceId, weekStart: weekStart })

  const actMap = {}
  for (const a of activities) actMap[a.nickName] = a

  const list = members.map(m => {
    const a = actMap[m.nickName]
    const activeDays = (a && Array.isArray(a.activeDays)) ? a.activeDays.slice() : emptyDays()
    return {
      _id: m._id,
      nickName: m.nickName,
      userId: m.userId || '',
      activeDays: activeDays,
      activeToday: !!activeDays[dayIndex]
    }
  })
  list.sort((a, b) => String(a.nickName).localeCompare(String(b.nickName), 'zh'))

  const activeList = list.filter(m => m.activeToday)
  const inactiveList = list.filter(m => !m.activeToday)

  return {
    success: true,
    allianceId: allianceId,
    allianceName: alliance.allianceName,
    zoneId: alliance.zoneId,
    weekStart: weekStart,
    dayIndex: dayIndex,
    weekDates: buildWeekDates(weekStart),
    members: list,
    activeList: activeList,
    inactiveList: inactiveList,
    total: list.length,
    activeCount: activeList.length
  }
}

// ============ Action: 区管/超管 查看分区下各联盟本周活跃人数 ============
async function getZoneOverview(data, openid) {
  const { zoneId } = data
  if (!zoneId) return { success: false, error: '缺少 zoneId' }

  const caller = await getCaller(openid)
  if (!caller) return { success: false, error: '用户不存在' }
  const role = caller.role
  if (role !== 'superAdmin') {
    if (role === 'admin') {
      let zoneRes = null
      try {
        zoneRes = await db.collection('zones').doc(zoneId).get()
      } catch (e) {
        zoneRes = null
      }
      if (!zoneRes || !zoneRes.data) return { success: false, error: '分区不存在' }
      const z = zoneRes.data
      const ok = (z.adminIds || []).indexOf(caller._id) >= 0 || z.creatorId === caller._id
      if (!ok) return { success: false, error: '权限不足' }
    } else {
      return { success: false, error: '权限不足' }
    }
  }

  const weekStart = getWeekStart()
  const dayIndex = getDayIndex()

  const alliances = await fetchAll('alliances', { zoneId: zoneId }, 'allianceIndex', 'asc')
  const activities = await fetchAll('allianceActivity', { zoneId: zoneId, weekStart: weekStart })
  const members = await fetchAll('allianceMembers', { zoneId: zoneId })

  // 每个联盟的成员数（成员为 0 的联盟不展示）
  const memberCount = {}
  for (const m of members) {
    memberCount[m.allianceId] = (memberCount[m.allianceId] || 0) + 1
  }

  // 每个联盟每天活跃人数
  const countsMap = {}
  for (const a of activities) {
    if (!countsMap[a.allianceId]) countsMap[a.allianceId] = [0, 0, 0, 0, 0, 0, 0]
    const days = a.activeDays || []
    for (let i = 0; i < 7; i++) {
      if (days[i]) countsMap[a.allianceId][i]++
    }
  }

  const rows = []
  for (const al of alliances) {
    const mcount = memberCount[al._id] || 0
    if (mcount <= 0) continue // 联盟成员为 0 时不展示
    const counts = countsMap[al._id] || [0, 0, 0, 0, 0, 0, 0]
    rows.push({
      allianceId: al._id,
      allianceName: al.allianceName,
      allianceIndex: al.allianceIndex,
      memberCount: mcount,
      counts: counts
    })
  }

  return {
    success: true,
    zoneId: zoneId,
    weekStart: weekStart,
    dayIndex: dayIndex,
    weekDates: buildWeekDates(weekStart),
    rows: rows
  }
}

// ============ Action: 设置某成员当天活跃状态 ============
async function setActive(data, openid) {
  const { allianceId, nickName, active } = data
  const dayIndex = (data.dayIndex === 0 || data.dayIndex) ? data.dayIndex : getDayIndex()
  if (!allianceId || !nickName) return { success: false, error: '参数不完整' }

  const caller = await getCaller(openid)
  const alliance = await loadAlliance(allianceId)
  if (!alliance) return { success: false, error: '联盟不存在' }
  if (!await canManageAlliance(caller, alliance)) return { success: false, error: '权限不足' }

  const weekStart = getWeekStart()
  const res = await db.collection('allianceActivity')
    .where({ allianceId: allianceId, nickName: nickName, weekStart: weekStart })
    .limit(1)
    .get()

  if (res.data.length > 0) {
    const doc = res.data[0]
    const activeDays = Array.isArray(doc.activeDays) ? doc.activeDays.slice() : emptyDays()
    activeDays[dayIndex] = !!active
    await db.collection('allianceActivity').doc(doc._id).update({
      data: { activeDays: activeDays, updateTime: db.serverDate() }
    })
    return { success: true }
  }

  // 无记录且是"取消活跃"：无需创建
  if (!active) return { success: true, changed: false }

  const activeDays = emptyDays()
  activeDays[dayIndex] = true
  await db.collection('allianceActivity').add({
    data: {
      allianceId: allianceId,
      zoneId: alliance.zoneId,
      nickName: nickName,
      userId: data.userId || '',
      weekStart: weekStart,
      activeDays: activeDays,
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }
  })
  return { success: true }
}

// ============ Action: 手动添加成员（默认未活跃） ============
async function addMember(data, openid) {
  const { allianceId, nickName } = data
  if (!allianceId || !nickName || !String(nickName).trim()) {
    return { success: false, error: '请输入成员昵称' }
  }
  const name = String(nickName).trim()

  const caller = await getCaller(openid)
  const alliance = await loadAlliance(allianceId)
  if (!alliance) return { success: false, error: '联盟不存在' }
  if (!await canManageAlliance(caller, alliance)) return { success: false, error: '权限不足' }

  const exist = await db.collection('allianceMembers')
    .where({ allianceId: allianceId, nickName: name })
    .limit(1)
    .get()
  if (exist.data.length > 0) return { success: false, error: '该成员已存在' }

  await db.collection('allianceMembers').add({
    data: {
      allianceId: allianceId,
      zoneId: alliance.zoneId,
      nickName: name,
      userId: data.userId || '',
      source: 'manual',
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }
  })
  return { success: true }
}

// ============ Action: 删除成员及其本周活跃信息 ============
// 提示：删除后该用户下次登录小程序仍会被自动添加回来（自动活跃会 upsert）
async function removeMember(data, openid) {
  const { allianceId, nickName } = data
  if (!allianceId || !nickName) return { success: false, error: '参数不完整' }

  const caller = await getCaller(openid)
  const alliance = await loadAlliance(allianceId)
  if (!alliance) return { success: false, error: '联盟不存在' }
  if (!await canManageAlliance(caller, alliance)) return { success: false, error: '权限不足' }

  // 删除成员
  const mRes = await db.collection('allianceMembers')
    .where({ allianceId: allianceId, nickName: nickName })
    .limit(1)
    .get()
  if (mRes.data.length > 0) {
    await db.collection('allianceMembers').doc(mRes.data[0]._id).remove()
  }

  // 删除本周活跃记录
  const weekStart = getWeekStart()
  const aRes = await db.collection('allianceActivity')
    .where({ allianceId: allianceId, nickName: nickName, weekStart: weekStart })
    .limit(100)
    .get()
  for (const doc of aRes.data) {
    await db.collection('allianceActivity').doc(doc._id).remove()
  }

  return { success: true }
}

// ============ Action: 用户端 —— 报名成功后加入联盟（记录"最后一次选择的联盟"） ============
async function joinByRegistration(data, openid) {
  const { allianceId, zoneId, nickName } = data
  if (!allianceId) return { success: false, error: '缺少 allianceId' }

  const caller = await getCaller(openid)
  if (!caller) return { success: false, error: '用户不存在' }
  const name = (nickName || caller.gameNickName || caller.nickName || '').trim()
  if (!name) return { success: false, error: '缺少游戏昵称' }

  // 记录用户的联盟归属 + 游戏昵称（以最后一次报名选择为主）
  await db.collection('users').doc(caller._id).update({
    data: {
      allianceId: allianceId,
      zoneId: zoneId || '',
      gameNickName: name,
      updateTime: db.serverDate()
    }
  })

  // 加入成员名单（若已存在则不重复添加，保持未活跃）
  const exist = await db.collection('allianceMembers')
    .where({ allianceId: allianceId, nickName: name })
    .limit(1)
    .get()
  if (exist.data.length === 0) {
    await db.collection('allianceMembers').add({
      data: {
        allianceId: allianceId,
        zoneId: zoneId || '',
        nickName: name,
        userId: caller._id,
        source: 'auto',
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })
  }

  return { success: true, nickName: name }
}

// ============ Action: 用户端 —— 打开小程序自动标记今日活跃 ============
// 联盟 / 游戏昵称的解析优先级（解决老用户 users.allianceId 为空导致登记不上的问题）：
//   1) users.allianceId（且属于当前分区）
//   2) 前端传入的 preferredAllianceId（storage 里"最后一次选择的联盟"，且属于当前分区）
//   3) 回溯报名记录中最后一次选择的联盟
// 解析成功后回写 users，避免每次回溯；游戏昵称优先取报名记录里的（更可信），其次 users 字段。
async function markSelfActive(data, openid) {
  const caller = await getCaller(openid)
  if (!caller) return { success: false, error: '用户不存在' }

  // 冷启动时前端可能还没加载出分区（zoneId 为空），此时用 users.zoneId 兜底，
  // 否则会退化成"只信任 users.allianceId"，老用户永远登记不上
  const wantZoneId = data.zoneId || caller.zoneId || ''
  const selfName = (caller.gameNickName || caller.nickName || '').trim()

  let allianceId = caller.allianceId || ''
  let alliance = allianceId ? await loadAlliance(allianceId) : null
  let name = selfName
  let needWriteBack = false

  // 无当前分区信息时只信任 users.allianceId：多区都有账号的用户若在此处回溯，
  // 会把昵称误登记到其他分区的联盟，因此 prefer/回溯 一律要求已知当前分区。
  if (wantZoneId) {
    // users.allianceId 缺失 / 联盟不存在 / 不属于当前分区 → 尝试前端传入的偏好联盟
    if (!allianceInZone(alliance, wantZoneId) || !alliance) {
      const preferredId = data.preferredAllianceId || ''
      if (preferredId && preferredId !== allianceId) {
        const pref = await loadAlliance(preferredId)
        if (allianceInZone(pref, wantZoneId)) {
          allianceId = preferredId
          alliance = pref
          needWriteBack = true
        }
      }
    }

    // 仍不可用 → 回溯历史报名记录（按当前分区分隔）
    if (!allianceInZone(alliance, wantZoneId) || !alliance) {
      const found = await findLastAllianceFromRegistrations(caller._id, wantZoneId)
      if (found) {
        allianceId = found.allianceId
        alliance = found.alliance
        if (found.nickName) name = String(found.nickName).trim()
        needWriteBack = true
      }
    }
  }

  if (!alliance) return { success: false, error: '尚未加入联盟' }
  if (!name) return { success: false, error: '缺少游戏昵称' }

  // 回写 users，避免后续每次都要回溯
  if (needWriteBack) {
    try {
      await db.collection('users').doc(caller._id).update({
        data: {
          allianceId: allianceId,
          zoneId: alliance.zoneId || wantZoneId || '',
          gameNickName: name,
          updateTime: db.serverDate()
        }
      })
    } catch (e) {
      console.warn('[联盟活跃] 回写 users 失败(忽略):', e.message)
    }
  }

  // 成员不存在则自动添加（对应"用户下次登录仍可自动添加"）
  const mRes = await db.collection('allianceMembers')
    .where({ allianceId: allianceId, nickName: name })
    .limit(1)
    .get()
  if (mRes.data.length === 0) {
    await db.collection('allianceMembers').add({
      data: {
        allianceId: allianceId,
        zoneId: alliance.zoneId,
        nickName: name,
        userId: caller._id,
        source: 'auto',
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })
  }

  // 标记今日活跃
  const weekStart = getWeekStart()
  const dayIndex = getDayIndex()
  const aRes = await db.collection('allianceActivity')
    .where({ allianceId: allianceId, nickName: name, weekStart: weekStart })
    .limit(1)
    .get()

  if (aRes.data.length > 0) {
    const doc = aRes.data[0]
    const activeDays = Array.isArray(doc.activeDays) ? doc.activeDays.slice() : emptyDays()
    if (activeDays[dayIndex]) return { success: true, changed: false, allianceId: allianceId, nickName: name }
    activeDays[dayIndex] = true
    await db.collection('allianceActivity').doc(doc._id).update({
      data: { activeDays: activeDays, updateTime: db.serverDate() }
    })
  } else {
    const activeDays = emptyDays()
    activeDays[dayIndex] = true
    await db.collection('allianceActivity').add({
      data: {
        allianceId: allianceId,
        zoneId: alliance.zoneId,
        nickName: name,
        userId: caller._id,
        weekStart: weekStart,
        activeDays: activeDays,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })
  }

  return { success: true, changed: true, allianceId: allianceId, nickName: name }
}

// ============ 入口 ============
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  // 定时触发（event.Type === 'Timer'）直接执行清理
  // 说明：本函数已不配 config.json 定时器，过期清理统一由 clearRegistrations 的
  //       hourly 触发器（0 0 * * * * *，已在云端运行）接管，避免重复配置。
  //       此处保留 Timer 分支仅作为手动/未来启用的兼容入口。
  if (event && event.Type === 'Timer') {
    try {
      const r = await cleanupExpired()
      console.log('[manageAllianceActivity] 定时清理完成:', JSON.stringify(r))
      return r
    } catch (err) {
      console.error('[manageAllianceActivity] 定时清理失败:', err)
      return { success: false, error: err.message || '清理失败' }
    }
  }

  // 兼容两种传参：{ action, data:{...} } 或 { action, ... }
  const data = (event && event.data) ? event.data : event
  const action = data ? data.action : null

  try {
    switch (action) {
      case 'listMembers':
        return await listMembers(data, openid)
      case 'getZoneOverview':
        return await getZoneOverview(data, openid)
      case 'setActive':
        return await setActive(data, openid)
      case 'addMember':
        return await addMember(data, openid)
      case 'removeMember':
        return await removeMember(data, openid)
      case 'joinByRegistration':
        return await joinByRegistration(data, openid)
      case 'markSelfActive':
        return await markSelfActive(data, openid)
      case 'cleanupExpired':
        return await cleanupExpired()
      default:
        return { success: false, error: 'Unknown action: ' + action }
    }
  } catch (err) {
    console.error('[manageAllianceActivity] 执行失败:', err)
    return { success: false, error: err.message || '操作失败' }
  }
}
