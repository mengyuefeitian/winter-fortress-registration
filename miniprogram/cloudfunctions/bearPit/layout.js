/**
 * cloudfunctions/bearPit/layout.js —— 「熊坑」座位布局（几何 + 排位算法）
 *
 * ⚠️ 本文件是 miniprogram/utils/bearPitLayout.js 的**手工副本**（云函数不能 require
 *    小程序目录）。两边必须保持一致，改动请同时改两处；
 *    .workbuddy/tools/bear_pit_test.js 会逐座位 + 逐用例比对，不一致直接报错。
 *
 * ── 与前端的关系 ────────────────────────────────────────────────────────
 *  前端副本：miniprogram/utils/bearPitLayout.js（负责绘制与表单校验）。
 */

// 细格坐标系
const GRID = 25
// 座位边长（细格）
const SLOT = 2
// 熊坑本体（列/行都含首尾）
const PIT = { c0: 11, c1: 13, r0: 11, r1: 13 }
// 熊坑中心（细格坐标，用于算距离与角度）
const PIT_CX = (PIT.c0 + PIT.c1 + 1) / 2
const PIT_CY = (PIT.r0 + PIT.r1 + 1) / 2

// 四个风车色块 —— 颜色取自参考图本身
const BLOCKS = [
  { id: 'NW', fill: '#FFE796', ink: '#6B5A10', c0: 1, c1: 10, r0: 0, r1: 13 },
  { id: 'NE', fill: '#99C3E5', ink: '#123A5C', c0: 11, c1: 24, r0: 1, r1: 10 },
  { id: 'SE', fill: '#FAD969', ink: '#6A4C00', c0: 14, c1: 23, r0: 11, r1: 24 },
  { id: 'SW', fill: '#BDD7EE', ink: '#1D3F5E', c0: 0, c1: 13, r0: 14, r1: 23 }
]

// 旗子位：每条 = 块 / 块内第几列 / 块内第几行（都从 1 起）/ 落在该座位的哪个 1×1 角
// 位置与参考图逐像素对齐（每块 4 个、呈 90° 旋转对称），改动请对照参考图。
const FLAG_SLOTS = [
  { block: 'NW', ci: 2, ri: 1, corner: 'TL' },
  { block: 'NW', ci: 5, ri: 1, corner: 'TR' },
  { block: 'NW', ci: 2, ri: 4, corner: 'BL' },
  { block: 'NW', ci: 5, ri: 4, corner: 'BR' },
  { block: 'NE', ci: 4, ri: 2, corner: 'TL' },
  { block: 'NE', ci: 7, ri: 2, corner: 'TR' },
  { block: 'NE', ci: 4, ri: 5, corner: 'BL' },
  { block: 'NE', ci: 7, ri: 5, corner: 'BR' },
  { block: 'SE', ci: 1, ri: 4, corner: 'TL' },
  { block: 'SE', ci: 4, ri: 4, corner: 'TR' },
  { block: 'SE', ci: 1, ri: 7, corner: 'BL' },
  { block: 'SE', ci: 4, ri: 7, corner: 'BR' },
  { block: 'SW', ci: 1, ri: 1, corner: 'TL' },
  { block: 'SW', ci: 4, ri: 1, corner: 'TR' },
  { block: 'SW', ci: 1, ri: 4, corner: 'BL' },
  { block: 'SW', ci: 4, ri: 4, corner: 'BR' }
]

// 最多可排多少人（用户要求：140 个位置但只排 100 人）
const MAX_MEMBERS = 100

// 布局 / 排位算法版本。改动座位几何或排位规则时必须 +1：
// 云函数 getBoard 发现看板上记录的版本落后，会自动重排一次并回写（一次性自愈，
// 免去让盟管重新报名）。
//   v2 = 邻居改为「就近换位」（2026-10-10）
//   v3 = 落座改为「严格按地心等级名次」+ 邻居只在本环内换位、不允许把等级更高的
//        人挤到外圈（修正用户截图里「第一名跑到 11 号、最后一名占了 1 号位」）
//   v4 = **同一环内自由换位**（可挪到空位、可与同环的人互换），保证邻居能挨上
//        （修正「到处混/灰姨在二环却连不到一环的邻居」）
const LAYOUT_VERSION = 4

// 绘制用色
const PIT_STYLE = {
  pitFill: '#E8352B',
  pitInk: '#FFFFFF',
  pitStroke: '#8C1F14',
  flagFill: '#E8352B',
  flagPole: '#5A2A00',
  seatStroke: 'rgba(28,28,28,0.55)',
  emptyFill: 'rgba(255,255,255,0.30)',
  ink: '#1F2329'
}

function round4(v) {
  return Math.round(v * 10000) / 10000
}

/** 查某个块内座位 (ci,ri)（都从 1 起）对应的旗子位定义，没有则返回 null */
function findFlagSlot(blockId, ci, ri) {
  for (let i = 0; i < FLAG_SLOTS.length; i++) {
    const f = FLAG_SLOTS[i]
    if (f.block === blockId && f.ci === ci && f.ri === ri) return f
  }
  return null
}

/** 某个块内座位 (ci,ri)（都从 1 起）是否旗子位 */
function isFlagSlot(blockId, ci, ri) {
  return !!findFlagSlot(blockId, ci, ri)
}

/**
 * 生成全部座位（未编号），再按「到熊坑中心的距离 → 顺时针角」编好 1..N。
 * 同一圈内以「最接近正下方的座位」为起点，顺时针推进。
 */
function buildLayout() {
  const raw = []
  BLOCKS.forEach(function (b) {
    const cols = Math.round((b.c1 - b.c0 + 1) / SLOT)
    const rows = Math.round((b.r1 - b.r0 + 1) / SLOT)
    for (let ci = 1; ci <= cols; ci++) {
      for (let ri = 1; ri <= rows; ri++) {
        const c = b.c0 + SLOT * (ci - 1)
        const r = b.r0 + SLOT * (ri - 1)
        const cx = c + SLOT / 2
        const cy = r + SLOT / 2
        const dx = cx - PIT_CX
        const dy = cy - PIT_CY
        // 顺时针角：正下方 = 0°，左 = 90°，上 = 180°，右 = 270°
        let ang = Math.atan2(-dx, dy) * 180 / Math.PI
        if (ang < 0) ang += 360
        const flag = findFlagSlot(b.id, ci, ri)
        raw.push({
          block: b.id,
          ci: ci,
          ri: ri,
          c: c,
          r: r,
          x: c,
          y: r,
          w: SLOT,
          h: SLOT,
          isFlag: !!flag,
          // 旗子画在座位的哪个 1×1 角（TL/TR/BL/BR），普通座位为空串
          corner: flag ? flag.corner : '',
          dist: round4(Math.sqrt(dx * dx + dy * dy)),
          angle: round4(ang)
        })
      }
    }
  })

  // 按「距离 ÷ 座位边长」取整分圈（1 环 = 到熊坑约 1 个座位远）
  // ⚠️ 不能用「精确距离」分圈：风车形四块的起点错位半个座位，
  //    贴坑那 8 个座位会算成两种距离（2.55 / 2.92）被拆成 4+4；
  //    取整后正好并成 1 环 8 个，与用户口径「贴熊坑那圈是一环、一圈 8 个」一致。
  const rings = []
  const sorted = raw.slice().sort(function (a, b) {
    if (a.dist !== b.dist) return a.dist - b.dist
    return a.angle - b.angle
  })
  sorted.forEach(function (s) {
    s.ringKey = Math.round(s.dist / SLOT)
    const last = rings[rings.length - 1]
    if (!last || last.key !== s.ringKey) rings.push({ key: s.ringKey, dist: s.dist, seats: [s] })
    else last.seats.push(s)
  })

  // 圈内：以「最接近正下方」的座位为起点，顺时针（角递增，越界回绕）
  const seats = []
  rings.forEach(function (ring, ri) {
    const arr = ring.seats.slice().sort(function (a, b) { return a.angle - b.angle })
    let start = 0
    let best = 1e9
    arr.forEach(function (s, i) {
      const off = Math.min(s.angle, 360 - s.angle)   // 与正下方的夹角
      if (off < best - 1e-9) { best = off; start = i }
    })
    for (let k = 0; k < arr.length; k++) {
      const s = arr[(start + k) % arr.length]
      s.ring = ri + 1
      s.index = seats.length + 1
      seats.push(s)
    }
  })

  return {
    seats: seats,
    rings: rings.map(function (r, i) { return { ring: i + 1, dist: r.dist, count: r.seats.length } })
  }
}

const LAYOUT = buildLayout()
const SEATS = LAYOUT.seats
const RINGS = LAYOUT.rings
const TOTAL_SLOTS = SEATS.length
const SEATABLE = SEATS.filter(function (s) { return !s.isFlag })
const FLAG_SEATS = SEATS.filter(function (s) { return s.isFlag })

function seatByIndex(i) {
  const n = Number(i)
  if (!n || n < 1 || n > SEATS.length) return null
  return SEATS[n - 1]
}

/** 座位在细格坐标系里的方框 */
function seatBox(seat) {
  if (!seat) return null
  return { x: seat.c, y: seat.r, w: SLOT, h: SLOT }
}

function blockOf(id) {
  for (let i = 0; i < BLOCKS.length; i++) if (BLOCKS[i].id === id) return BLOCKS[i]
  return BLOCKS[0]
}

/** 座位颜色（四色块只是配色，方便看图） */
function colorOf(seat) {
  const b = blockOf(seat && seat.block)
  return { fill: b.fill, ink: b.ink }
}

/** 两个方框之间的空隙（<=0 表示贴上或重叠） */
function gapBetween(a, b) {
  const gx = Math.max(0, b.c - (a.c + SLOT), a.c - (b.c + SLOT))
  const gy = Math.max(0, b.r - (a.r + SLOT), a.r - (b.r + SLOT))
  return { gx: gx, gy: gy }
}

/**
 * 相邻判定（用户口径：共用边或斜对角都算）。
 * 同块相邻座位紧挨着；跨块时只要两个方框贴上（含只在角上碰到）就算相邻。
 */
function areAdjacent(a, b) {
  if (!a || !b || a === b || a.index === b.index) return false
  const g = gapBetween(a, b)
  return g.gx <= 0 && g.gy <= 0
}

const NEIGHBOR_CACHE = {}
function neighborsOf(seat) {
  if (!seat) return []
  if (NEIGHBOR_CACHE[seat.index]) return NEIGHBOR_CACHE[seat.index]
  const out = []
  for (let i = 0; i < SEATS.length; i++) {
    if (areAdjacent(seat, SEATS[i])) out.push(SEATS[i])
  }
  out.sort(function (a, b) { return a.index - b.index })
  NEIGHBOR_CACHE[seat.index] = out
  return out
}

// ───────────────────────── 排位算法 ─────────────────────────

function nickKey(nick) {
  return String(nick === undefined || nick === null ? '' : nick).trim()
}

function dixinOf(m) {
  const v = Number(m && m.dixin)
  return isNaN(v) ? -1 : v
}

function timeOf(m) {
  const t = m && m.createTime
  if (t instanceof Date) return t.getTime()
  const v = Number(t)
  return isNaN(v) ? 0 : v
}

/** 排名：地心探险等级高 → 靠前（更靠内圈）；同等级 → 先报名靠内；再同 → 按昵称 */
function compareRank(a, b) {
  const da = dixinOf(a)
  const db = dixinOf(b)
  if (da !== db) return db - da
  const ta = timeOf(a)
  const tb = timeOf(b)
  if (ta !== tb) return ta - tb
  const ka = nickKey(a && a.nickName)
  const kb = nickKey(b && b.nickName)
  return ka < kb ? -1 : (ka > kb ? 1 : 0)
}

/**
 * 邻居关系失效：清空并回落为「按地心排」。
 * 管理员删人、或目标被别人抢走后不能留下悬空的邻居指向。
 */
function resetNeighbor(u) {
  u.mode = 'power'
  u.neighborNick = ''
  u.neighborSeat = 0
}

/**
 * 排位 + 邻居绑定。
 * @param {Array} members 报名人员 [{ nickName, dixin, createTime, mode, neighborNick }]
 * @returns {Array} 新数组，带 seatIndex（座位号，1 起）/ neighborSeat / mode / neighborNick
 *
 * 规则（用户口径 2026-10-10：**同一环内可以互换位置，保障邻居能相邻**）：
 *  1. 地心探险等级越高越靠内圈；同级先报名靠前 —— 先按名次各就各位
 *  2. 旗子位不能排人（直接跳过）
 *  3. 邻居：把 A 排在指定邻居 B 旁边；A→B→C 链条一节一节往回贴
 *  4. 邻居目标被删除 / 被别人抢走 → 自动重置为「按地心排」
 *  5. 修正阶段：**环的归属不变**（仍由名次决定），人在自己那一环里**任意换位**
 *     （挪到空位 / 与同环的人互换），让邻居尽量挨上；只接受「不减少已连上邻居数」
 *     的移动，避免反复横跳
 */
function planSeats(members) {
  const list = (members || []).map(function (m) { return Object.assign({}, m) })
  if (!list.length) return list

  const byNick = {}
  list.forEach(function (m) {
    const k = nickKey(m.nickName)
    if (k && !byNick[k]) byNick[k] = m
  })

  const rank = list.slice().sort(compareRank)

  // 1) 邻居关系清洗
  const targetOf = {}
  const chosenBy = {}
  rank.forEach(function (u) {
    const uk = nickKey(u.nickName)
    const tk = nickKey(u.neighborNick)
    if (!tk || !uk || tk === uk || !byNick[tk]) {
      resetNeighbor(u)
      return
    }
    if (targetOf[uk] || chosenBy[tk]) {
      if (chosenBy[tk] && chosenBy[tk] !== uk) resetNeighbor(u)
      return
    }
    targetOf[uk] = tk
    chosenBy[tk] = uk
  })

  // 2) 拆环：A→B→A 这种互选，把排名靠后的那条边断掉
  rank.forEach(function (u) {
    const uk = nickKey(u.nickName)
    if (!targetOf[uk]) return
    const seen = {}
    let cur = uk
    while (targetOf[cur]) {
      if (seen[cur]) {
        delete targetOf[cur]
        if (byNick[cur]) resetNeighbor(byNick[cur])
        const t = cur
        Object.keys(chosenBy).forEach(function (k) { if (chosenBy[k] === t) delete chosenBy[k] })
        break
      }
      seen[cur] = 1
      cur = targetOf[cur]
    }
  })

  // 3) 落座顺序：**严格按名次**（地心探险高 → 座位号小）
  //    ⚠️ 曾经把「整条链挪到链内排名最高者位置」，结果排名靠后的人拿到了很靠内的
  //       座位号（用户看到的「地心探险等级最低的跑到 1 环 1 号位」）。邻居一律留到第 5 步
  //       用「环内换位」处理。
  const order = rank.slice()

  // 4) 落座：按名次顺序取「可坐」的座位（旗子位跳过）—— 这一步只决定**环的归属**
  let cursor = 0
  order.forEach(function (u) {
    while (cursor < SEATS.length && SEATS[cursor].isFlag) cursor++
    const seat = cursor < SEATS.length ? SEATS[cursor] : null
    cursor++
    u.seatIndex = seat ? seat.index : 0
  })

  // 5) 环内自由换位：**保证邻居相邻**
  //
  //  用户口径（2026-10-10）：「到处混和灰姨在第二环，就可以在二环任意位置……
  //  同一环内可以互换位置。为了保障需要相邻的两个人能够相邻。」
  //
  //  · **环 = 名次段**，第 i 名 → 第 i 个可坐座位，其所在的环就是这个人的所属环，永不改变；
  //  · 人在**自己那一环里可以任意换位**（挪到空位 / 与同环的人互换），环内的先后顺序
  //    让位给邻居 —— 这样「二环的人」就能挑到贴着「一环邻居」的那个二环座位。
  //
  //  ⚠️ 旧实现的两个坑（用户截图里邻居全部没连上，就是这个原因）：
  //   (a) 候选只从已占座（occ）里取 —— 只跟「有人坐的座位」换，**空位再多也用不上**；
  //       人少（140 个位置才排 11 人）时空位一大把，邻居修正等于完全失效；
  //   (b) MAX_SWAP = 6 的位移上限 —— 同环内稍远一点的位置也去不了。
  const ringOf = {}    // nick -> 所属环（名次决定，永不改变）
  const homeSeat = {}  // nick -> 名次对应的座位
  const rankOf = {}    // nick -> 名次
  order.forEach(function (u, i) {
    const k = nickKey(u.nickName)
    const s = u.seatIndex ? seatByIndex(u.seatIndex) : null
    homeSeat[k] = s
    ringOf[k] = s ? s.ring : 0
    rankOf[k] = i + 1
  })

  const seatOf = {}   // nick -> 当前座位
  const nickAt = {}   // 座位号 -> nick
  order.forEach(function (u) {
    const k = nickKey(u.nickName)
    const s = homeSeat[k]
    if (s) { seatOf[k] = s; nickAt[s.index] = k }
  })

  const nextOf = {}   // nick -> 他选的邻居（出边）
  Object.keys(targetOf).forEach(function (k) { nextOf[k] = targetOf[k] })

  function areBonded(u, t) {
    const su = seatOf[u]
    const st = seatOf[t]
    return !!(su && st && areAdjacent(su, st))
  }

  /** 当前已经连上的邻居对数（移动只许让它不变少，避免反复横跳） */
  function bondCount() {
    let n = 0
    order.forEach(function (u) {
      const k = nickKey(u.nickName)
      if (targetOf[k] && areBonded(k, targetOf[k])) n++
    })
    return n
  }

  /** 链深：沿「他选的邻居」还能走几节（链尾 = 0）。链尾优先定，再一节节往回贴。 */
  function chainDepth(k) {
    let d = 0
    let cur = k
    const guard = {}
    while (nextOf[cur] && !guard[cur]) { guard[cur] = 1; d++; cur = nextOf[cur] }
    return d
  }

  const edges = order
    .map(function (u) {
      const k = nickKey(u.nickName)
      if (!targetOf[k]) return null
      return { u: k, t: targetOf[k], d: chainDepth(k), r: rankOf[k] }
    })
    .filter(Boolean)
    .sort(function (a, b) { return a.d - b.d || a.r - b.r })

  const ringSeatList = {}
  SEATABLE.forEach(function (s) {
    if (!ringSeatList[s.ring]) ringSeatList[s.ring] = []
    ringSeatList[s.ring].push(s)
  })

  let bonds = bondCount()
  for (let pass = 0; pass < 24; pass++) {
    let moved = false
    edges.forEach(function (e) {
      if (areBonded(e.u, e.t)) return
      const su = seatOf[e.u]
      const st = seatOf[e.t]
      if (!su || !st) return
      const myRing = ringOf[e.u]
      const pool = ringSeatList[myRing] || []

      // 候选 = 本人所属环里、与目标座位相邻的座位
      //   · 空位 → 直接挪过去；
      //   · 有人 → 只有「同环、且不是自己/目标」的人才可以互换（换完两人都还在本环）
      const cands = pool.filter(function (s) {
        if (s.index === su.index) return false
        if (!areAdjacent(s, st)) return false
        const occ = nickAt[s.index]
        if (!occ) return true
        if (occ === e.u || occ === e.t) return false
        return ringOf[occ] === myRing
      }).sort(function (a, b) {
        const oa = nickAt[a.index] ? 1 : 0
        const ob = nickAt[b.index] ? 1 : 0
        if (oa !== ob) return oa - ob                    // 空位优先
        const da = Math.abs(a.index - su.index)
        const db = Math.abs(b.index - su.index)
        if (da !== db) return da - db                    // 离现在的位置近优先
        return a.index - b.index                         // 再按座位号稳定排序
      })

      let best = null
      for (let i = 0; i < cands.length; i++) {
        const s = cands[i]
        const occ = nickAt[s.index]        // undefined = 空位
        // 试算：u 挪到 s；若 s 有人，那人挪到 u 原来的座位
        delete nickAt[su.index]
        seatOf[e.u] = s
        nickAt[s.index] = e.u
        if (occ) { seatOf[occ] = su; nickAt[su.index] = occ }
        const n = bondCount()
        // 回滚
        delete nickAt[s.index]
        seatOf[e.u] = su
        nickAt[su.index] = e.u
        if (occ) { seatOf[occ] = s; nickAt[s.index] = occ }

        if (n > bonds) { best = { s: s, occ: occ, n: n }; break }
      }
      if (!best) return

      const s = best.s
      const occ = best.occ
      delete nickAt[su.index]
      seatOf[e.u] = s
      nickAt[s.index] = e.u
      if (occ) { seatOf[occ] = su; nickAt[su.index] = occ }
      bonds = best.n
      moved = true
    })
    if (!moved) break
  }

  // 回写座位号
  order.forEach(function (u) {
    const k = nickKey(u.nickName)
    const s = seatOf[k]
    u.seatIndex = s ? s.index : 0
  })

  // 6) 回写最终邻居座位号（相邻才算绑上）
  order.forEach(function (u) {
    const uk = nickKey(u.nickName)
    const tk = targetOf[uk]
    if (!tk) { u.neighborSeat = 0; return }
    const tu = byNick[tk]
    const su = seatByIndex(u.seatIndex)
    const st = tu ? seatByIndex(tu.seatIndex) : null
    u.neighborSeat = (su && st && areAdjacent(su, st)) ? st.index : 0
  })

  return order
}

module.exports = {
  GRID,
  SLOT,
  PIT,
  PIT_CX,
  PIT_CY,
  PIT_STYLE,
  BLOCKS,
  FLAG_SLOTS,
  MAX_MEMBERS,
  LAYOUT_VERSION,
  TOTAL_SLOTS,
  // 兼容旧调用点：位置总数（140）
  TOTAL_SEATS: TOTAL_SLOTS,
  SEATS,
  SEATABLE,
  FLAG_SEATS,
  RINGS,
  buildLayout,
  seatByIndex,
  seatBox,
  blockOf,
  colorOf,
  isFlagSlot,
  findFlagSlot,
  areAdjacent,
  neighborsOf,
  planSeats,
  compareRank,
  nickKey,
  dixinOf
}
