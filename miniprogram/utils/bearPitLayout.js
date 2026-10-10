/**
 * utils/bearPitLayout.js —— 「熊坑」座位布局（几何 + 排位算法的唯一来源）
 *
 * ⚠️ 本文件按用户给的参考图**逐像素复刻**（528×525 的图，25×25 细格，
 *    复刻后与原图逐格比对 625 格中 622 格一致，3 格差异是原图右下角水印）。
 *    之前做成「方形同心环 8/12/16/20/24/28」是**完全错的**，别再改回去。
 *
 * ── 结构（2026-10-10 与用户确认） ───────────────────────────────────────
 *  · 25×25 细格坐标系（1 个细格 = 半个座位边长）
 *  · 中心 3×3（列 11–13、行 11–13）= 熊坑本体（红色，写「熊坑」）
 *  · 四个色块呈**风车状**排布（不是同心环），每块是一个矩形，四角向外错开：
 *        NW 淡黄  列 1–10   行 0–13    10×14 细格 = 5 列 × 7 行 = 35
 *        NE 中蓝  列 11–24  行 1–10    14×10       = 7 列 × 5 行 = 35
 *        SE 金黄  列 14–23  行 11–24   10×14       = 5 列 × 7 行 = 35
 *        SW 浅蓝  列 0–13   行 14–23   14×10       = 7 列 × 5 行 = 35
 *    合计 **140 个位置**。外层四个角各留一条 1 细格宽的白边（风车缺口）。
 *    ⚠️ 四色只是「配色，方便看图」，**不代表分组**（用户原话）。
 *  · 每 **2×2 细格 = 一个座位**，边长固定；座位之间紧挨着，没有缝。
 *  · **16 个「旗子位」**（每块 4 个，图上画成红格）：固定占位、**不能排人**，
 *    保留给「插旗子」用。旗位不在最内圈，所以 1–8 号永远是能坐人的。
 *  · 总容量：140 个位置里去掉 16 个旗位 = **124 个可坐座位**；
 *    但**最多只排 100 人**（用户要求「140 座但只排 100 人」），多出来的座位留空。
 *
 * ── 编号规则（用户口径） ────────────────────────────────────────────────
 *  · 按「到熊坑中心的距离」由内向外一圈圈排；同一圈里从**正下方**开始**顺时针**
 *    （正下方 → 左侧 → 上方 → 右侧），所以 1 号在熊坑正下方。
 *  · 座位号 ≈ **战力名次**：战力越高座位号越小（越靠内圈），同战力先报名靠内。
 *    选了「邻居」的人会和邻居挨着，但只做**就近换位**，不会把高战力的人顶到后面。
 *  · 贴住熊坑的那 8 个座位（每块 2 个）会自然排成 1–8 号 = **一环 8 个**；
 *    9、10 号就进入二环，与用户描述一致。
 *
 * ── 与云函数的关系 ──────────────────────────────────────────────────────
 *  cloudfunctions/bearPit/layout.js 是同一套算法的手工副本（云函数不能 require
 *  小程序目录）。两者必须逐字等价，由 .workbuddy/tools/bear_pit_test.js 逐座位比对。
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
// 免去让盟管重新报名）。v2 = 邻居改为「就近换位」（2026-10-10）
const LAYOUT_VERSION = 2

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

/** 排名：战力高 → 靠前（更靠内圈）；同战力 → 先报名靠内；再同 → 按昵称 */
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
 * 邻居关系失效：清空并回落为「按战力排」。
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
 * 规则（用户口径：**优先按战力排，然后再调整相邻的位置**）：
 *  1. 战力（＝报名填的那个数）越高越靠内圈（座位号越小）；同战力先报名靠内
 *  2. 旗子位不能排人（直接跳过）
 *  3. 邻居：尽量把 A 排在指定邻居 B 旁边；A→B→C 链条整条拉直
 *  4. 邻居目标被删除 / 被别人抢走 → 自动重置为「按战力排」
 *  5. 修正阶段**只做就近换位**：跟「座位号离自己最近、且不会拆散别人邻居」的人换，
 *     不让低战力的人插到高战力的人前面
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

  // 3) 并查集：把链/环的成员并成一组
  const parent = {}
  function find(k) {
    if (parent[k] === undefined) parent[k] = k
    while (parent[k] !== k) { parent[k] = parent[parent[k]]; k = parent[k] }
    return k
  }
  function union(a, b) {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }
  rank.forEach(function (u) {
    const uk = nickKey(u.nickName)
    find(uk)
    if (targetOf[uk]) union(uk, targetOf[uk])
  })
  const groups = {}
  rank.forEach(function (u) {
    const k = nickKey(u.nickName)
    const r = find(k)
    if (!groups[r]) groups[r] = []
    groups[r].push(u)
  })

  // 4) 输出顺序：整条链挪到「链内排名最高者」的位置，链内按排名
  const emitted = {}
  const order = []
  rank.forEach(function (u) {
    const uk = nickKey(u.nickName)
    if (emitted[uk]) return
    const group = groups[find(uk)] || [u]
    group.slice().sort(compareRank).forEach(function (x) {
      const xk = nickKey(x.nickName)
      if (emitted[xk]) return
      emitted[xk] = 1
      order.push(x)
    })
  })

  // 5) 落座：按编号顺序取「可坐」的座位（旗子位跳过）
  const occ = {}
  let cursor = 0
  order.forEach(function (u) {
    while (cursor < SEATS.length && SEATS[cursor].isFlag) cursor++
    const seat = cursor < SEATS.length ? SEATS[cursor] : null
    cursor++
    u.seatIndex = seat ? seat.index : 0
    if (seat) occ[seat.index] = u
  })

  // 6) 相邻修正：**就近换位**（用户口径 2026-10-10：「优先按战力排，然后再调整相邻的位置」）
  //
  //    目标是「座位号 ≈ 战力名次」：选邻居的人要和邻居挨着，但腾位置时只跟
  //    「座位号离自己最近、且换完之后不会拆散别人邻居」的人换。
  //    ⚠️ 旧实现是取 neighborsOf(target)[0]（座位号最小的那个），会出现
  //       「7 号的人跟 4 号的人换 → 低战力的插到前面、高战力的被顶到 7 号」，
  //       这正是用户看到的「没有按战力排」。
  const seatOfNick = {}
  order.forEach(function (u) { seatOfNick[nickKey(u.nickName)] = u.seatIndex })

  // 试算用：除 skipNick 外，其他人的「邻居」是否都还挨着
  function relationsHold(skipNick) {
    for (let i = 0; i < order.length; i++) {
      const x = order[i]
      const xk = nickKey(x.nickName)
      if (xk === skipNick) continue
      const tk = targetOf[xk]
      if (!tk) continue
      const sx = seatByIndex(seatOfNick[xk])
      const st = seatByIndex(seatOfNick[tk])
      if (!sx || !st || !areAdjacent(sx, st)) return false
    }
    return true
  }

  order.forEach(function (u) {
    const uk = nickKey(u.nickName)
    const tk = targetOf[uk]
    if (!tk) return
    const tu = byNick[tk]
    if (!tu || !tu.seatIndex) return
    const su = seatByIndex(u.seatIndex)
    const st = seatByIndex(tu.seatIndex)
    if (!su || !st) return
    if (areAdjacent(su, st)) return

    // 候选 = 目标座位四周、已被人占着的座位（旗子位不能占）
    const cands = neighborsOf(st)
    let best = null
    for (let i = 0; i < cands.length; i++) {
      const seat = cands[i]
      if (seat.isFlag) continue
      const v = occ[seat.index]
      if (!v || v === u) continue
      const vk = nickKey(v.nickName)

      seatOfNick[uk] = v.seatIndex
      seatOfNick[vk] = u.seatIndex
      const ok = relationsHold(uk)      // u 自己的邻居由这次换位满足，不用检查
      seatOfNick[uk] = u.seatIndex
      seatOfNick[vk] = v.seatIndex
      if (!ok) continue

      const d = Math.abs(v.seatIndex - u.seatIndex)   // 座位号距离 = 扰动量
      if (!best || d < best.d || (d === best.d && v.seatIndex < best.v.seatIndex)) {
        best = { v: v, d: d }
      }
    }
    if (!best) return

    const v = best.v
    const vk = nickKey(v.nickName)
    const uSeat = u.seatIndex
    const vSeat = v.seatIndex
    occ[uSeat] = v
    occ[vSeat] = u
    u.seatIndex = vSeat
    v.seatIndex = uSeat
    seatOfNick[uk] = vSeat
    seatOfNick[vk] = uSeat
  })

  // 7) 回写最终邻居座位号（相邻才算绑上）
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
