// 游戏账号资料库 —— 云函数
// 集合：gameAccounts（一个用户可有多条游戏账号，其中一条 isMain=true）
//
// 为什么走云函数而不是客户端直连：
//   1) 报名列表需要按 userId 批量查「别人的主账号熔炉等级」用于老记录兜底展示，
//      客户端跨用户读会受「仅创建者可读」权限限制；
//   2) 「设为主账号」要求同一用户下 isMain 互斥 + 同步回写 users.gameNickName，
//      这两步必须原子收口在服务端，否则并发下会出现两个主账号。
//
// 等级数据结构（客户端 utils/gameAccount.js 保持同一份规范）：
//   spec = { kind: 'fire' | 'level', value: Number }   // 火晶 / 普通等级，二选一
//   barracksItem = { kind, value, stage: '' | 'T11' | 'T12' }  // stage 仅火晶有意义
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

const COLL = 'gameAccounts'
const MAX_ACCOUNTS = 20          // 单用户账号数量上限，防刷
const MAX_FIRE = 10              // 火晶 1-10
const MAX_LEVEL = 30             // 普通等级 1-30
const STAGES = ['T11', 'T12']

// ============ 数据规整 ============

function trimStr(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max || 30)
}

// 规整单个等级：非法/缺省 → null（表示"未设置"）
function normalizeSpec(raw) {
  if (!raw || typeof raw !== 'object') return null
  const value = parseInt(raw.value, 10)
  if (!value || value <= 0) return null
  if (raw.kind === 'fire') {
    return { kind: 'fire', value: Math.min(value, MAX_FIRE) }
  }
  if (raw.kind === 'level') {
    return { kind: 'level', value: Math.min(value, MAX_LEVEL) }
  }
  return null
}

// 规整兵营项：普通等级没有兵种阶，故非火晶时强制清空 stage
function normalizeBarracksItem(raw) {
  const spec = normalizeSpec(raw)
  if (!spec) return null
  let stage = trimStr(raw && raw.stage, 4).toUpperCase()
  if (spec.kind !== 'fire' || STAGES.indexOf(stage) < 0) stage = ''
  return { kind: spec.kind, value: spec.value, stage: stage }
}

function normalizeBarracks(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  return {
    shield: normalizeBarracksItem(src.shield),
    spear: normalizeBarracksItem(src.spear),
    bow: normalizeBarracksItem(src.bow)
  }
}

/**
 * 找出「旧值是标量、新值是对象」的字段路径（点记号），供 safeUpdate 先删后写。
 *
 * 云数据库（MongoDB）不允许在标量上创建子字段，典型报错：
 *   Cannot create field 'kind' in element {bow: null}      ← -502001
 * 熊坑报名建出的账号 barracks 三项全是 null、furnace 也是 null，
 * 一旦要把它们改成 {kind,value,stage} 就会撞上这条限制；
 * 而「信息完整」的账号这些字段本来就是对象，覆盖已有字段是允许的 ——
 * 这就是「只有熊坑建的账号保存失败」的真正原因。
 *
 * 例：old={barracks:{bow:null}} new={barracks:{bow:{kind:'fire'}}}
 *     → ['barracks.bow']
 */
function scalarToObjectPaths(oldVal, newVal, base) {
  const out = []
  if (!newVal || typeof newVal !== 'object' || Array.isArray(newVal)) return out
  if (oldVal === undefined) return out   // 字段本就不存在，直接创建对象没问题
  if (oldVal === null || typeof oldVal !== 'object' || Array.isArray(oldVal)) {
    out.push(base)                       // 标量 → 对象：必须先把这个标量删掉
    return out
  }
  Object.keys(newVal).forEach(k => {
    out.push.apply(out, scalarToObjectPaths(oldVal[k], newVal[k], base ? base + '.' + k : k))
  })
  return out
}

/**
 * 安全更新：先把「标量 → 对象」的路径整体删除，再写入新值。
 * 绕过 MongoDB「不能在 null 上创建子字段」的限制，从而修复 -502001。
 */
async function safeUpdate(id, oldDoc, patch) {
  const paths = scalarToObjectPaths(oldDoc || {}, patch, '')
  if (paths.length > 0) {
    const clear = {}
    paths.forEach(p => { clear[p] = _.remove() })
    console.log('[manageGameAccount] 先清除标量字段再写入', 'docId=' + id, paths.join(','))
    await db.collection(COLL).doc(id).update({ data: clear })
  }
  return await db.collection(COLL).doc(id).update({ data: patch })
}

// 地心探险：纯自然数
function normalizeDixin(raw) {
  if (raw === '' || raw === null || raw === undefined) return null
  const n = parseInt(raw, 10)
  if (isNaN(n) || n < 0) return null
  return Math.min(n, 999999)
}

// 对外输出的精简结构（不含任何隐私字段）
function publicView(doc) {
  return {
    _id: doc._id,
    gameNickName: doc.gameNickName || '',
    isMain: !!doc.isMain,
    furnace: doc.furnace || null,
    dixin: doc.dixin === undefined ? null : doc.dixin,
    barracks: doc.barracks || { shield: null, spear: null, bow: null },
    allianceId: doc.allianceId || '',
    allianceName: doc.allianceName || ''
  }
}

// ============ 调用者解析 ============

async function resolveCaller(openid) {
  try {
    const res = await db.collection('users').where({ openid }).limit(1).get()
    return res.data[0] || null
  } catch (e) {
    return null
  }
}

async function fetchAll(query) {
  const pageSize = 100
  let all = []
  let skip = 0
  while (true) {
    const res = await query.skip(skip).limit(pageSize).get()
    all = all.concat(res.data)
    if (res.data.length < pageSize) break
    skip += pageSize
    if (skip > 1000) break
  }
  return all
}

async function listOwnAccounts(userId) {
  return await fetchAll(db.collection(COLL).where({ userId }))
    .then(list => list.sort((a, b) => {
      if (!!b.isMain !== !!a.isMain) return b.isMain ? 1 : -1
      return (a.createTime && a.createTime.$date ? a.createTime.$date : a.createTime || 0) -
        (b.createTime && b.createTime.$date ? b.createTime.$date : b.createTime || 0)
    }))
}

function getMain(accounts) {
  return accounts.filter(a => a.isMain)[0] || null
}

// 把某条设为主账号：同用户下 isMain 互斥 + 同步 users.gameNickName / users.allianceId
async function applyMain(userId, openid, accountId, gameNickName) {
  const accounts = await listOwnAccounts(userId)
  for (const a of accounts) {
    const shouldBeMain = a._id === accountId
    if (!!a.isMain !== shouldBeMain) {
      await db.collection(COLL).doc(a._id).update({
        data: { isMain: shouldBeMain, updateTime: db.serverDate() }
      })
    }
  }
  await syncUserProfile(userId, openid, gameNickName)
}

// 报名默认昵称与联盟活跃登记都读 users.gameNickName，主账号变更必须同步过去。
//
// ⚠️ 本函数保证「不抛错」：users.gameNickName 只是账号的派生数据，账号本身已经写成功了，
//    没理由因为它同步失败就让整个保存失败——历史上正是这一步把主账号的保存拖垮成
//    document.update:fail-502001（非主账号不触发本函数，所以只有主账号保存会失败）。
//    失败一律只记日志，日志里带 stage=syncUserProfile 便于定位。
async function syncUserProfile(userId, openid, gameNickName) {
  const patch = { gameNickName: gameNickName || '' }
  try {
    const byId = await db.collection('users').doc(userId).get().catch(() => null)
    if (byId && byId.data) {
      await db.collection('users').doc(userId).update({ data: patch })
      return true
    }
  } catch (e) {
    console.error('[manageGameAccount] syncUserProfile(按_id) 失败',
      'stage=syncUserProfile', 'userId=' + userId, (e && (e.errMsg || e.message)) || e)
  }
  try {
    const res = await db.collection('users').where({ openid }).limit(1).get()
    if (res.data[0]) {
      await db.collection('users').doc(res.data[0]._id).update({ data: patch })
      return true
    }
  } catch (e) {
    console.error('[manageGameAccount] syncUserProfile(按openid) 失败',
      'stage=syncUserProfile', 'openid=' + openid, (e && (e.errMsg || e.message)) || e)
  }
  return false
}

// ============ 入口 ============

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const data = (event && event.data) || event || {}
  const action = data.action

  let caller = null
  try {
    caller = await resolveCaller(openid)
  } catch (e) { /* 忽略 */ }

  // 只允许操作自己的数据：客户端传来的 userId 与调用者不一致时，一律回退为调用者本人
  const ownUserId = (caller && caller._id) || data.userId || openid
  const userId = ownUserId

  try {
    switch (action) {
      // ---- 我的账号列表 ----
      case 'list': {
        const accounts = await listOwnAccounts(userId)
        return { success: true, accounts: accounts.map(publicView) }
      }

      // ---- 我的主账号（国战报名预填用）----
      case 'getMain': {
        const accounts = await listOwnAccounts(userId)
        const main = getMain(accounts) || accounts[0] || null
        return { success: true, account: main ? publicView(main) : null }
      }

      // ---- 新增 / 更新账号 ----
      case 'save': {
        const gameNickName = trimStr(data.gameNickName, 30)
        if (!gameNickName) return { success: false, error: '请填写游戏昵称' }

        const payload = {
          gameNickName,
          furnace: normalizeSpec(data.furnace),
          dixin: normalizeDixin(data.dixin),
          barracks: normalizeBarracks(data.barracks),
          allianceId: trimStr(data.allianceId, 64),
          allianceName: trimStr(data.allianceName, 40),
          updateTime: db.serverDate()
        }

        // 昵称唯一性校验（同一用户下）
        const accounts = await listOwnAccounts(userId)
        const dup = accounts.filter(a => a.gameNickName === gameNickName && a._id !== data.id)
        if (dup.length > 0) {
          return { success: false, error: '已存在同名游戏账号' }
        }

        if (data.id) {
          const owned = accounts.filter(a => a._id === data.id)[0]
          if (!owned) return { success: false, error: '账号不存在' }
          try {
            // ⚠️ 必须走 safeUpdate：账号里 furnace / barracks.* 可能是 null（熊坑报名建出的
            //    账号就是全 null），直接 update 成对象会被 MongoDB 拒绝（-502001）。
            await safeUpdate(data.id, owned, payload)
          } catch (e) {
            // 单独捕获：把出错的文档 id 与完整错误带回去，
            // 便于区分「id 不存在 / 格式不对」与「写入被拒绝」两类 502001。
            // payload 一并打出来——若真是字段格式问题，日志里能直接看到是哪个字段。
            const em = (e && (e.errMsg || e.message)) || ''
            const ec = (e && e.errCode) || ''
            console.error('[manageGameAccount] update 失败', 'stage=accountUpdate',
              'docId=' + data.id, 'userId=' + userId, 'errCode=' + ec, em,
              'payload=' + JSON.stringify(payload), e)
            return {
              success: false,
              error: '保存失败：' + em + (ec ? ' (' + ec + ')' : '') +
                ' [stage=accountUpdate] [id=' + data.id + ']'
            }
          }
          // 更新的是主账号 → 同步 users.gameNickName
          if (owned.isMain) await syncUserProfile(userId, openid, gameNickName)
          return { success: true, id: data.id }
        }

        if (accounts.length >= MAX_ACCOUNTS) {
          return { success: false, error: `最多只能保存 ${MAX_ACCOUNTS} 个游戏账号` }
        }

        // 首个账号自动成为主账号
        const isFirst = accounts.length === 0
        const res = await db.collection(COLL).add({
          data: Object.assign({}, payload, {
            userId,
            openid,
            isMain: isFirst,
            createTime: db.serverDate()
          })
        })
        if (isFirst) await syncUserProfile(userId, openid, gameNickName)
        return { success: true, id: res._id, isMain: isFirst }
      }

      // ---- 删除账号 ----
      case 'remove': {
        if (!data.id) return { success: false, error: '缺少账号 ID' }
        const accounts = await listOwnAccounts(userId)
        const target = accounts.filter(a => a._id === data.id)[0]
        if (!target) return { success: false, error: '账号不存在' }

        await db.collection(COLL).doc(data.id).remove()

        // 删掉的是主账号 → 顺位把剩下的第一个顶上，避免出现"没有主账号"
        if (target.isMain) {
          const rest = accounts.filter(a => a._id !== data.id)
          if (rest.length > 0) {
            await applyMain(userId, openid, rest[0]._id, rest[0].gameNickName)
          } else {
            await syncUserProfile(userId, openid, '')
          }
        }
        return { success: true }
      }

      // ---- 设为主账号 ----
      case 'setMain': {
        if (!data.id) return { success: false, error: '缺少账号 ID' }
        const accounts = await listOwnAccounts(userId)
        const target = accounts.filter(a => a._id === data.id)[0]
        if (!target) return { success: false, error: '账号不存在' }
        await applyMain(userId, openid, target._id, target.gameNickName)
        return { success: true }
      }

      // ---- 报名成功后同步：把报名里填的资料写回账号，并让该账号成为主账号 ----
      // 分支（见 requirement）：昵称命中已有账号 → 更新它；否则主账号没数据 → 补进主账号；
      // 否则新增一个账号；这三种情况最后都把该账号设为主账号。
      case 'syncFromRegistration': {
        const gameNickName = trimStr(data.gameNickName, 30)
        if (!gameNickName) return { success: false, error: '缺少游戏昵称' }

        const incoming = {
          furnace: normalizeSpec(data.furnace),
          dixin: normalizeDixin(data.dixin),
          barracks: normalizeBarracks(data.barracks),
          allianceId: trimStr(data.allianceId, 64),
          allianceName: trimStr(data.allianceName, 40)
        }

        const accounts = await listOwnAccounts(userId)
        const main = getMain(accounts)

        // 只把「本次真正填了的值」写回，避免把账号里已有的资料清空
        const mergePatch = (acc) => {
          const patch = { updateTime: db.serverDate() }
          if (incoming.furnace) patch.furnace = incoming.furnace
          if (incoming.dixin !== null) patch.dixin = incoming.dixin
          if (incoming.allianceId) {
            patch.allianceId = incoming.allianceId
            patch.allianceName = incoming.allianceName
          }
          const b = incoming.barracks || {}
          const merged = Object.assign({}, acc.barracks || {})
          let bChanged = false
          for (const k of ['shield', 'spear', 'bow']) {
            if (b[k]) { merged[k] = b[k]; bChanged = true }
          }
          if (bChanged) patch.barracks = merged
          return patch
        }

        let target = accounts.filter(a => a.gameNickName === gameNickName)[0] || null

        if (!target) {
          const mainHasData = main && (
            main.furnace || main.dixin !== null && main.dixin !== undefined ||
            (main.barracks && (main.barracks.shield || main.barracks.spear || main.barracks.bow))
          )
          if (main && !mainHasData) {
            // 主账号还是空壳（只在报名时被自动创建过）→ 资料直接补进主账号
            target = main
          } else if (accounts.length < MAX_ACCOUNTS) {
            // 昵称是新的 → 增加一个账号
            const isFirst = accounts.length === 0
            const addRes = await db.collection(COLL).add({
              data: {
                userId,
                openid,
                gameNickName,
                isMain: isFirst,
                furnace: incoming.furnace,
                dixin: incoming.dixin,
                barracks: incoming.barracks,
                allianceId: incoming.allianceId,
                allianceName: incoming.allianceName,
                createTime: db.serverDate(),
                updateTime: db.serverDate()
              }
            })
            target = { _id: addRes._id, gameNickName, isMain: isFirst, barracks: incoming.barracks }
          } else {
            // 已经到上限：退化为只更新主账号，不让报名失败
            target = main
          }
        }

        if (target) {
          if (target._id) {
            const patch = mergePatch(target)
            patch.gameNickName = gameNickName
            // 同样走 safeUpdate：这里会把 barracks 的 null 项写成对象，
            // 正是「熊坑报名后联盟没写进去」那个静默失败的元凶（此前 .catch 吞掉了）
            await safeUpdate(target._id, target, patch)
          }
          await applyMain(userId, openid, target._id, gameNickName)
        }

        return { success: true, accountId: target ? target._id : '', gameNickName }
      }

      // ---- 批量取「各用户的账号」：报名列表给历史记录兜底显示熔炉等级 ----
      // 只返回昵称 + 熔炉等级，不含任何其它字段，跨用户读取是安全的
      case 'listMainByUsers': {
        const userIds = Array.isArray(data.userIds) ? data.userIds.filter(Boolean).slice(0, 200) : []
        if (userIds.length === 0) return { success: true, map: {} }

        const map = {}
        const chunkSize = 10   // _.in 单次最多 10 个
        for (let i = 0; i < userIds.length; i += chunkSize) {
          const chunk = userIds.slice(i, i + chunkSize)
          const list = await fetchAll(db.collection(COLL).where({ userId: _.in(chunk) }))
          for (const a of list) {
            const cur = map[a.userId]
            // 主账号优先；没有主账号时取第一条有熔炉等级的
            if (!cur || (a.isMain && !cur.isMain) ||
              (!cur.isMain && !a.isMain && !cur.furnace && a.furnace)) {
              map[a.userId] = { isMain: !!a.isMain, gameNickName: a.gameNickName || '', furnace: a.furnace || null }
            }
          }
        }
        return { success: true, map }
      }

      default:
        return { success: false, error: '未知操作: ' + action }
    }
  } catch (err) {
    // 云数据库错误的完整信息在 errMsg / message 上，errCode 是关键（如 -502001 等），
    // 统一透出，避免前端只看到一个孤零零的 message
    const em = (err && (err.errMsg || err.message)) || '操作失败'
    const ec = (err && err.errCode) || ''
    console.error('[manageGameAccount] 失败', action, 'errCode=' + ec, em, err)
    return { success: false, error: em + (ec ? ' (' + ec + ')' : '') + ' [action=' + action + ']' }
  }
}
