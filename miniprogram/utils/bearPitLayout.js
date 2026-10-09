/**
 * utils/bearPitLayout.js —— 「熊坑」座位布局（几何 + 排位算法的唯一来源）
 *
 * ── 座位模型（2026-10-09 与用户确认） ─────────────────────────────────────
 *  · 方形同心环，共 6 环：
 *      一环 每边 3 个（含两个角）→ 4×3−4 = 8  个座位（编号 1–8）
 *      二环 每边 4 个             → 12 个（9–20）
 *      三环 每边 5 个             → 16 个（21–36）
 *      四环 每边 6 个             → 20 个（37–56）
 *      五环 每边 7 个             → 24 个（57–80）
 *      六环 每边 8 个             → 28 个（81–108）
 *    合计 108 个座位。**四角本身就是座位**，所以对角线不会留空位。
 *  · 编号：1 号在「正下方」，顺时针（正下方往左 → 左下角 → 左侧自下而上 → 左上角
 *    → 顶部自左向右 → 右上角 → 右侧自上而下 → 右下角）；随后一圈圈往外。
 *    偶数个/边的环没有严格的正中点，起编位取「从正下方往顺时针方向遇到的第一个座位」。
 *  · 每个座位大小固定（边长恒为 1 个座位单位）。
 *    为「边长固定 1」必然有取舍：一环每边 3 个座位刚好铺满一环的边（间距 1，紧挨着），
 *    环与环之间按半径 +1 递进（保证四角座位不互相压住）；外环座位少、边长长，
 *    多出来的空隙均匀分摊到同一环的相邻座位之间（六环最宽 0.71 格）。
 *  · 熊坑（中心）半边长 1 个座位单位，即熊坑本体 2×2；整张图外沿 ±7。
 *    ⚠️ 环半径必须按 +1 递进：按 +0.5 递进会让相邻环的四角座位重叠 0.25 格（实测 180 对）。
 *
 * ── 与云函数的关系 ──────────────────────────────────────────────────────
 *  cloudfunctions/bearPit/layout.js 是同一套算法的手工副本（云函数不能 require
 *  小程序目录）。两者必须逐字等价，由 .workbuddy/tools/bear_pit_test.js 逐座位比对把关。
 */

// 环数 / 座位总数
const RING_COUNT = 6
const TOTAL_SEATS = 108

// 熊坑半边长（座位单位）
const PIT_HALF = 1
// 整张图外沿（含最外环座位的外半格）：六环半边长 6.5，再加半格
const MAP_HALF = RING_COUNT + 1

// 相邻判定阈值：两个座位中心的 |dx|、|dy| 都不超过它就视为「挨着」
// （一环格距 1.0 = 共用边；四角斜对角 1.0/1.0；取 1.05 略留浮点余量）
const ADJ_TOL = 1.05

// 四象限配色 —— 与用户给的第一张「分布图」一致（左上淡黄 / 右上中蓝 / 右下亮黄 / 左下浅蓝）
// 用户说「颜色我自己分配」，要换只改这里
const QUADRANT_COLORS = {
  NW: { fill: '#FFE89C', ink: '#6B5A10' },
  NE: { fill: '#9BC1E6', ink: '#123A5C' },
  SE: { fill: '#FED966', ink: '#6A4C00' },
  SW: { fill: '#BDD7EE', ink: '#1D3F5E' }
}

// 按环配色（备选：colorMode = 'ring'）
const RING_COLORS = [
  { fill: '#F7D64A', ink: '#5C4A00' },
  { fill: '#8FB8E8', ink: '#0F2E4E' },
  { fill: '#F3A96A', ink: '#5C2C08' },
  { fill: '#DE93B4', ink: '#4D1D34' },
  { fill: '#96C97F', ink: '#22401A' },
  { fill: '#C4B4E8', ink: '#2F2350' }
]

// 熊坑 / 战旗 / 草地等绘制用色
const PIT_STYLE = {
  pitFill: '#E8863C',
  pitInk: '#5A2A00',
  pitText: '#FFFFFF',
  flagFill: '#E8352B',
  grass: '#CFE7B4',
  grassLine: '#BCDA9E',
  seatStroke: '#FFFFFF',
  seatStrokeWidth: 0.045
}

const EPS = 1e-6

/**
 * 座位落在哪个象限（决定配色）
 * x / y 为座位中心坐标，y 轴向下（屏幕坐标系）。x=0 或 y=0 时按「右 / 下」兜底，
 * 保证每个座位都有确定颜色。
 */
function quadrantOf(x, y) {
  if (x < -EPS) return y < -EPS ? 'NW' : 'SW'
  if (x > EPS) return y < -EPS ? 'NE' : 'SE'
  return y < -EPS ? 'NE' : 'SE'
}

/**
 * 生成全部座位。返回 { seats, rings }
 *  seat  = { index, ring, perSide, half, step, x, y, q }
 *  ring  = { ring, perSide, half, step, count, first, last }
 */
function buildLayout() {
  const seats = []
  const rings = []
  let index = 0

  for (let ring = 1; ring <= RING_COUNT; ring++) {
    const perSide = ring + 2
    const half = ring + 0.5
    const step = round4((2 * half) / (perSide - 1))

    // 南边（正下方那条边）座位自左向右的 x 坐标
    const southX = []
    for (let i = 0; i < perSide; i++) southX.push(-half + i * step)

    // 起编位：从正下方（x=0）往顺时针（向左）遇到的第一个座位
    // 即满足 x <= 0 的最后一个；上一环结束位与它相邻，编号才能连续往外绕
    let startIdx = 0
    for (let i = 0; i < perSide; i++) {
      if (southX[i] <= EPS) startIdx = i
    }

    const pts = []
    // (a) 南边：自起编位向左，到左下角
    for (let i = startIdx; i >= 0; i--) pts.push([southX[i], half])
    // (b) 西边：自下而上（不含左下角，含左上角）
    for (let j = 1; j < perSide - 1; j++) pts.push([-half, half - j * step])
    pts.push([-half, -half])
    // (c) 北边：自左向右（不含左上角，含右上角）
    for (let i = 1; i < perSide - 1; i++) pts.push([-half + i * step, -half])
    pts.push([half, -half])
    // (d) 东边：自上而下（不含右上角，含右下角）
    for (let j = 1; j < perSide - 1; j++) pts.push([half, -half + j * step])
    pts.push([half, half])
    // (e) 南边剩余：从右下角左侧继续向左，到起编位之前收尾
    for (let i = perSide - 2; i > startIdx; i--) pts.push([southX[i], half])

    const first = index + 1
    for (let p = 0; p < pts.length; p++) {
      index += 1
      const x = round4(pts[p][0])
      const y = round4(pts[p][1])
      seats.push({
        index: index,
        ring: ring,
        perSide: perSide,
        half: round4(half),
        step: round4(step),
        x: x,
        y: y,
        q: quadrantOf(pts[p][0], pts[p][1])
      })
    }
    rings.push({ ring: ring, perSide: perSide, half: round4(half), step: round4(step), count: pts.length, first: first, last: index })
  }

  return { seats: seats, rings: rings }
}

function round4(v) {
  return Math.round(v * 10000) / 10000
}

const LAYOUT = buildLayout()
const SEATS = LAYOUT.seats
const RINGS = LAYOUT.rings

function seatByIndex(i) {
  const n = Number(i)
  if (!n || n < 1 || n > SEATS.length) return null
  return SEATS[n - 1]
}

/** 座位方框（座位单位） */
function seatBox(seat) {
  if (!seat) return null
  return { x: seat.x - 0.5, y: seat.y - 0.5, w: 1, h: 1 }
}

/** 座位颜色：colorMode = 'quadrant'（默认，四象限）| 'ring'（按环） */
function colorOf(seat, colorMode) {
  if (!seat) return QUADRANT_COLORS.NW
  if (colorMode === 'ring') return RING_COLORS[(seat.ring - 1) % RING_COLORS.length]
  return QUADRANT_COLORS[seat.q] || QUADRANT_COLORS.NW
}

/** 几何相邻：两个座位方框相接（共用边或斜对角） */
function adjacentByGeometry(a, b) {
  if (!a || !b || a.index === b.index) return false
  return Math.abs(a.x - b.x) <= ADJ_TOL && Math.abs(a.y - b.y) <= ADJ_TOL
}

/**
 * 相邻判定（用户口径）：
 *  1) 同一环内编号连续 = 相邻
 *  2) 同一环是一条**闭合回路**：起编位（正下方）左右两侧的座位也互为邻居，
 *     否则每环都会在 1 号处断开一个缺口，链条走到环末就接不回来
 *  3) 其余按直线距离（共用边、斜对角都算）
 */
function areAdjacent(a, b) {
  if (!a || !b || a.index === b.index) return false
  if (a.ring === b.ring) {
    const d = Math.abs(a.index - b.index)
    const meta = RINGS[a.ring - 1]
    if (d === 1) return true
    if (meta && d === meta.count - 1) return true   // 首尾相接
  }
  return adjacentByGeometry(a, b)
}

/** 某座位的全部相邻座位（按编号升序 = 由内向外） */
const NEIGHBOR_CACHE = {}
function neighborsOf(seat) {
  if (!seat) return []
  if (NEIGHBOR_CACHE[seat.index]) return NEIGHBOR_CACHE[seat.index]
  const out = []
  for (let i = 0; i < SEATS.length; i++) {
    if (areAdjacent(seat, SEATS[i])) out.push(SEATS[i])
  }
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

/**
 * 邻居关系失效：清空并回落为「按战力排」。
 * 管理员删人、或目标被别人抢走后，库里不能留下悬空的邻居指向，
 * 否则列表会一直显示一个并不存在的邻居。
 */
function resetNeighbor(u) {
  u.mode = 'power'
  u.neighborNick = ''
  u.neighborSeat = 0
}

function timeOf(m) {
  const t = m && m.createTime
  if (t instanceof Date) return t.getTime()
  const v = Number(t)
  return isNaN(v) ? 0 : v
}

/** 排名：地心探险高 → 靠前（更靠内圈）；同等级 → 先报名靠内 */
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
 * 排位 + 邻居绑定
 * @param {Array} members 报名人员 [{ nickName, dixin, createTime, neighborNick, ... }]
 * @returns {Array} 新数组（不改原对象），带 seatIndex / neighborSeat / neighborNick
 *
 * 规则：
 *  1. 地心探险越高越靠内圈；同等级先报名靠内；排满一环顺延下一环
 *  2. 邻居：A 可以指定一个「未被别人选走的已报名用户」B 做邻居，尽量把 A 排在 B 旁边；
 *     A→B、B→C 这种链会整条拉直，尽量 3 人相邻
 *  3. 邻居目标被删除 → 该条邻居关系自动重置为「无邻居」
 *  4. 修正阶段只跟「无任何邻居关系」的人换位，不会破坏别人的邻居
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

  // 1) 邻居关系清洗：目标必须仍然在报名列表里，否则重置为无邻居
  const targetOf = {}   // 想要挨着谁（被选者 nick）
  const chosenBy = {}   // 被谁选走了（选者 nick）
  rank.forEach(function (u) {
    const uk = nickKey(u.nickName)
    const tk = nickKey(u.neighborNick)
    if (!tk || !uk || tk === uk || !byNick[tk]) {
      resetNeighbor(u)      // 没填 / 填了自己 / 目标已被删除
      return
    }
    if (targetOf[uk] || chosenBy[tk]) {   // 自己已选 / 目标已被别人选走
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
      if (seen[cur]) {                 // 回到环上 → 断当前这条边
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

  // 5) 按顺序落座（1 号 = 最内环起编位）
  const occ = {}
  order.forEach(function (u, i) {
    const seat = SEATS[i]
    u.seatIndex = seat ? seat.index : 0
    if (seat) occ[seat.index] = u
  })

  // 6) 相邻修正：没排到目标旁边的，跟「零邻居关系」的人换位
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
    const cands = neighborsOf(st)
    for (let i = 0; i < cands.length; i++) {
      const v = occ[cands[i].index]
      if (!v || v === u) continue
      const vk = nickKey(v.nickName)
      if (targetOf[vk] || chosenBy[vk]) continue   // 动了他会破坏别人的邻居
      const uSeat = u.seatIndex
      const vSeat = v.seatIndex
      occ[uSeat] = v
      occ[vSeat] = u
      u.seatIndex = vSeat
      v.seatIndex = uSeat
      break
    }
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
  RING_COUNT,
  TOTAL_SEATS,
  PIT_HALF,
  MAP_HALF,
  ADJ_TOL,
  QUADRANT_COLORS,
  RING_COLORS,
  PIT_STYLE,
  SEATS,
  RINGS,
  buildLayout,
  seatByIndex,
  seatBox,
  colorOf,
  quadrantOf,
  areAdjacent,
  adjacentByGeometry,
  neighborsOf,
  planSeats,
  compareRank,
  nickKey,
  dixinOf
}
