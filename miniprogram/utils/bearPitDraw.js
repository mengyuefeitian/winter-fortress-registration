/**
 * utils/bearPitDraw.js —— 「熊坑分布图」canvas 绘制
 *
 * 几何完全来自 utils/bearPitLayout.js（唯一来源），本文件只负责画。
 * 画面结构与用户给的参考图一致：
 *   四个风车色块（四色只是配色，方便看图）→ 每块里 2×2 细格一个座位
 *   → 中心 3×3 红「熊坑」→ 16 个旗子位（红，不能排人）→ 邻居红虚线 → 文字
 *
 * 坐标系：map 坐标 = 细格坐标（0..25），绘制前统一 translate(-12.5,-12.5)，
 * 于是整张图以 (12.5,12.5) 为中心。缩放 / 拖动只改 u / offset，不用改绘制代码。
 */

const layout = require('./bearPitLayout')

const FONT_STACK = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif'

// 画布留白（细格单位）
const PAD = 0.6

// ---------------------------------------------------------------------------
// 文字基线
//
// 微信 Canvas 2D（尤其 iOS）上 `textBaseline = 'middle'` 不可靠：
//   ① 给 ctx.font 赋值会把 textBaseline 重置回默认值 alphabetic，
//      所以「先设 baseline 再设 font」的写法等于没设；
//   ② 即使生效，middle 的位置依赖字体自身的 ascent/descent，中日韩字体
//      与数字字体差得很多，同一段代码在不同机型上会上下漂。
//
// 因此这里统一约定：
//   · 一律使用 alphabetic（所有平台都严格一致）
//   · 每次设置 ctx.font 之后立刻重设 textAlign / textBaseline
//   · 需要「垂直居中」时，用 measureText 实测墨迹盒，自己反推基线位置
// ---------------------------------------------------------------------------
function setFont(ctx, fs, weight) {
  ctx.font = (weight || '400') + ' ' + fs.toFixed(3) + 'px ' + FONT_STACK
  // 注意顺序：font 之后再设，否则被 font 赋值重置掉
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
}

/** 文字相对 alphabetic 基线的墨迹上沿 / 下沿（细格；正数表示在基线之上） */
function inkMetrics(ctx, text, fs) {
  let m = null
  try { m = ctx.measureText(text) } catch (e) { m = null }
  let a = 0
  let d = 0
  if (m) {
    a = Number(m.actualBoundingBoxAscent)
    d = Number(m.actualBoundingBoxDescent)
  }
  if (!(a > 0) && !(d > 0)) {
    // 量不到（iOS 上 actualBoundingBox* 经常返回 0）→ 用字形经验值兜底
    if (/^[0-9]+$/.test(String(text))) {
      a = fs * 0.72; d = fs * 0.02 // 数字：只有帽高，不下伸
    } else {
      a = fs * 0.88; d = fs * 0.12 // 中日韩：字面基本占满 em 框
    }
  }
  return { asc: a, desc: d }
}

/** 在 (cx, centerY) 画一行字，使其「墨迹盒」垂直居中 */
function fillLineCentered(ctx, text, cx, centerY, fs, weight) {
  setFont(ctx, fs, weight)
  const mt = inkMetrics(ctx, text, fs)
  const baseline = centerY + (mt.asc - mt.desc) / 2
  ctx.fillText(text, cx, baseline)
  return { top: baseline - mt.asc, bottom: baseline + mt.desc }
}

// 每个色块的「已坐」加深色（空位用原色，坐人后用深一档，一眼能看出谁坐哪）
const ON_FILL = {
  '#FFE796': '#FFD24D',
  '#99C3E5': '#6FA8D8',
  '#FAD969': '#F5BE2E',
  '#BDD7EE': '#93BFE3'
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.arcTo(x + w, y, x + w, y + rr, rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr)
  ctx.lineTo(x + rr, y + h)
  ctx.arcTo(x, y + h, x, y + h - rr, rr)
  ctx.lineTo(x, y + rr)
  ctx.arcTo(x, y, x + rr, y, rr)
  ctx.closePath()
}

// 贪婪换行（中文按字断行即可）
function greedyWrap(ctx, text, maxW) {
  const chars = String(text || '').split('')
  const lines = []
  let cur = ''
  for (let i = 0; i < chars.length; i++) {
    const next = cur + chars[i]
    if (cur && ctx.measureText(next).width > maxW) {
      lines.push(cur)
      cur = chars[i]
    } else {
      cur = next
    }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['']
}

// 均衡换行：中文昵称优先「每行字数均匀」，避免「城南种 / 田」这种尾行只剩一个字
function balancedWrap(ctx, text, maxW) {
  const lines = greedyWrap(ctx, text, maxW)
  if (lines.length <= 1) return lines
  const chars = String(text || '').split('')
  const per = Math.ceil(chars.length / lines.length)
  const out = []
  for (let i = 0; i < chars.length; i += per) out.push(chars.slice(i, i + per).join(''))
  if (out.length > lines.length) return lines
  for (let i = 0; i < out.length; i++) {
    if (ctx.measureText(out[i]).width > maxW) return lines
  }
  return out
}

/** 自动缩字号 + 最多 maxLines 行 + 最多 maxH 高；仍放不下则末行省略号。返回 { fs, lines } */
function fitText(ctx, text, maxW, maxLines, startFs, minFs, weight, maxH) {
  const w = weight || '700'
  const LINE = 1.05
  const H = (maxH && maxH > 0) ? maxH : Infinity
  const fits = function (lines, fs) {
    return lines.length <= maxLines && lines.length * fs * LINE <= H + 1e-9
  }
  let fs = startFs
  let lines = []
  while (fs > minFs + 1e-6) {
    setFont(ctx, fs, w)
    lines = balancedWrap(ctx, text, maxW)
    if (fits(lines, fs)) return { fs: fs, lines: lines }
    fs -= 0.01
  }
  // 到最小字号还是放不下：先砍行数（高度不够时），再砍末行加省略号
  setFont(ctx, minFs, w)
  lines = balancedWrap(ctx, text, maxW)
  let keep = maxLines
  while (keep > 1 && keep * minFs * LINE > H) keep--
  if (lines.length > keep) {
    lines = lines.slice(0, keep)
    let last = lines[keep - 1]
    while (last.length > 1 && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1)
    lines[keep - 1] = last + '…'
  }
  return { fs: minFs, lines: lines }
}

/**
 * 旗子位：在座位上画一个 1×1 细格的红格（与参考图逐像素一致）。
 * 红格落在座位的哪个角由 layout 里的 corner（TL/TR/BL/BR）决定；
 * 座位其余 3 格保持色块本色——红格只是「这个位置留给插旗子，不能排人」的标记。
 */
function drawFlag(ctx, seat) {
  const half = seat.w / 2
  const right = seat.corner === 'TR' || seat.corner === 'BR'
  const bottom = seat.corner === 'BL' || seat.corner === 'BR'
  const x = seat.x + (right ? half : 0)
  const y = seat.y + (bottom ? half : 0)
  ctx.fillStyle = layout.PIT_STYLE.flagFill
  ctx.fillRect(x, y, half, half)
  ctx.strokeStyle = layout.PIT_STYLE.pitStroke
  ctx.lineWidth = 0.05
  ctx.strokeRect(x + 0.025, y + 0.025, half - 0.05, half - 0.05)
}

/**
 * 绘制熊坑分布图
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} opts
 *   width/height  画布 CSS 尺寸
 *   dpr           设备像素比（默认 1）
 *   scale/offsetX/offsetY  缩放与平移（px）
 *   mode          'index' 编号 | 'nick' 昵称
 *   members       [{ nickName, dixin, seatIndex, neighborSeat }]
 *   footer        是否画底部说明文字
 *   seatTotal     位置总数（默认 140）
 *   background    是否铺底色（默认 true）
 */
function drawPit(ctx, opts) {
  const o = opts || {}
  const width = o.width || 300
  const height = o.height || 300
  const dpr = o.dpr || 1
  const mode = o.mode === 'nick' ? 'nick' : 'index'
  const members = o.members || []
  const scale = o.scale || 1
  const offsetX = o.offsetX || 0
  const offsetY = o.offsetY || 0
  const footer = o.footer !== false
  const style = layout.PIT_STYLE
  const G = layout.GRID

  // 座位号 → 成员
  const bySeat = {}
  members.forEach(function (m) {
    const s = Number(m.seatIndex)
    if (s >= 1) bySeat[s] = m
  })

  const u = Math.min(width, height) / (G + PAD * 2) * scale

  ctx.save()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  if (o.background !== false) {
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, width, height)
  }

  ctx.translate(width / 2 + offsetX, height / 2 + offsetY)
  ctx.scale(u, u)
  ctx.translate(-G / 2, -G / 2)

  // 1) 四个风车色块
  layout.BLOCKS.forEach(function (b) {
    const c0 = b.c0
    const r0 = b.r0
    ctx.fillStyle = b.fill
    ctx.fillRect(c0, r0, b.c1 - c0 + 1, b.r1 - r0 + 1)
  })

  // 2) 座位格子：空位 = 色块本色 + 细格线；坐人 = 加深一档
  ctx.lineWidth = 0.05
  layout.SEATS.forEach(function (seat) {
    const member = bySeat[seat.index]
    if (seat.isFlag) {
      // 旗子位：只画细格线（红格由 drawFlag 补），永远不填「已坐」色
      ctx.strokeStyle = style.seatStroke
      ctx.strokeRect(seat.c + 0.025, seat.r + 0.025, seat.w - 0.05, seat.h - 0.05)
      return
    }
    if (member) {
      const base = layout.blockOf(seat.block).fill
      ctx.fillStyle = ON_FILL[base] || base
      ctx.fillRect(seat.c, seat.r, seat.w, seat.h)
    }
    ctx.strokeStyle = style.seatStroke
    ctx.strokeRect(seat.c + 0.025, seat.r + 0.025, seat.w - 0.05, seat.h - 0.05)
  })

  // 3) 中心熊坑（3×3）
  const p = layout.PIT
  ctx.fillStyle = style.pitFill
  ctx.fillRect(p.c0, p.r0, p.c1 - p.c0 + 1, p.r1 - p.r0 + 1)
  ctx.strokeStyle = style.pitStroke
  ctx.lineWidth = 0.1
  ctx.strokeRect(p.c0, p.r0, p.c1 - p.c0 + 1, p.r1 - p.r0 + 1)
  ctx.fillStyle = style.pitInk
  fillLineCentered(ctx, '熊坑', (p.c0 + p.c1 + 1) / 2, (p.r0 + p.r1 + 1) / 2 + 0.03, 0.95, '700')

  // 4) 旗子位
  layout.FLAG_SEATS.forEach(function (seat) { drawFlag(ctx, seat) })

  // 5) 座位文字（基线由 fillLineCentered / drawNickLabel 各自负责，这里只给个兜底）
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  layout.SEATS.forEach(function (seat) {
    if (seat.isFlag) return
    const member = bySeat[seat.index]
    const ink = layout.blockOf(seat.block).ink
    const cx = seat.c + seat.w / 2
    const cy = seat.r + seat.h / 2
    if (mode === 'index') {
      ctx.fillStyle = member ? ink : 'rgba(60,60,60,0.45)'
      fillLineCentered(ctx, String(seat.index), cx, cy + 0.02, member ? 0.62 : 0.5, member ? '700' : '400')
    } else if (member) {
      drawNickLabel(ctx, seat, member, ink)
    } else {
      ctx.fillStyle = 'rgba(60,60,60,0.32)'
      fillLineCentered(ctx, String(seat.index), cx, cy + 0.02, 0.4, '400')
    }
  })

  // 6) 邻居连线（每对只画一次）
  ctx.save()
  ctx.setLineDash([0.16, 0.12])
  ctx.strokeStyle = 'rgba(233,53,43,0.9)'
  ctx.lineWidth = 0.11
  members.forEach(function (m) {
    if (!m.neighborSeat || Number(m.neighborSeat) <= Number(m.seatIndex)) return
    const a = layout.seatByIndex(m.seatIndex)
    const b = layout.seatByIndex(m.neighborSeat)
    if (!a || !b) return
    ctx.beginPath()
    ctx.moveTo(a.c + a.w / 2, a.r + a.h / 2)
    ctx.lineTo(b.c + b.w / 2, b.r + b.h / 2)
    ctx.stroke()
  })
  ctx.restore()

  // 7) 外框
  ctx.strokeStyle = 'rgba(28,28,28,0.85)'
  ctx.lineWidth = 0.14
  ctx.strokeRect(0, 0, G, G)

  ctx.restore()

  // 8) 底部说明（画在 CSS 像素空间，避免随缩放变形）
  if (footer) {
    const occupied = members.filter(function (m) { return Number(m.seatIndex) >= 1 }).length
    const total = o.seatTotal || layout.TOTAL_SLOTS
    const cap = o.maxMembers || layout.MAX_MEMBERS
    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#6B7280'
    ctx.font = '500 11px ' + FONT_STACK
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText('共 ' + total + ' 个位置（可排 ' + cap + ' 人）· 已排 ' + occupied + ' 人 · 数字＝地心探险等级', width / 2, height - 5)
    ctx.restore()
  }
}

/**
 * 昵称模式：昵称自动缩字号、最多两行，并且保证整体**落在座位格子内**；
 * 地心探险等级做成深色小徽标，统一贴在座位**右下角**
 * （原来是右上角，会压住昵称第一行，用户 2026-10-10 反馈）。
 *
 * 版面把一个座位分成两区：昵称占上方（有徽标时就是徽标上沿以上的区域），
 * 徽标占右下角。缩字号同时受「宽度」和「昵称区高度」两个约束，
 * 所以 5 个字的长昵称也不会顶出格子、更不会和徽标叠在一起。
 */
function drawNickLabel(ctx, seat, member, ink) {
  const name = String(member.nickName || '')
  const lv = member.dixin
  const hasLevel = lv !== null && lv !== undefined && lv !== ''

  const cx = seat.c + seat.w / 2
  const maxW = seat.w * 0.86 // 左右各留 7% 余量

  // ① 徽标尺寸先量出来：昵称的可用高度取决于它的上沿
  let badge = null
  if (hasLevel) {
    const txt = String(lv)
    const maxBW = seat.w * 0.64
    let bfs = seat.h * 0.22
    setFont(ctx, bfs, '700')
    let bw = ctx.measureText(txt).width + seat.w * 0.12
    if (bw > maxBW) {
      // 位数多（4 位以上）时压一档字号，别让徽标把半格都吃掉
      bfs = Math.max(seat.h * 0.15, bfs * maxBW / bw)
      setFont(ctx, bfs, '700')
      bw = Math.min(maxBW, ctx.measureText(txt).width + seat.w * 0.12)
    }
    const bh = seat.h * 0.26
    badge = {
      txt: txt,
      fs: bfs,
      w: Math.min(bw, maxBW),
      h: bh,
      x: seat.c + seat.w * 0.94 - Math.min(bw, maxBW),
      y: seat.r + seat.h * 0.94 - bh
    }
  }

  // ② 昵称区域：上下边界一律写成 seat.r / seat.h 的常量表达式，
  //    不再经过 badge.y 这类中间量，也不再依赖 ctx.textBaseline。
  //    （有徽标时下沿 = seat.r + 0.62h，等价于 badge.y - 0.06h）
  const areaTop = seat.r + seat.h * 0.07
  const areaBottom = badge ? seat.r + seat.h * 0.62 : seat.r + seat.h * 0.93
  const areaH = Math.max(seat.h * 0.18, areaBottom - areaTop)
  const areaCY = (areaTop + areaBottom) / 2

  const fit = fitText(ctx, name, maxW, 2, seat.h * 0.34, seat.h * 0.15, '700', areaH)
  const lineH = fit.fs * 1.05
  // 只保留非空行：万一某端换行结果里混进空串，不能让它把「墨迹总高」算虚高
  const lines = (fit.lines || []).filter(function (t) { return String(t || '').length > 0 })
  if (!lines.length) lines.push(String(name || ''))
  const n = lines.length

  // ③ 按「实测墨迹盒」整体居中：首行基线 = 区域中心 − 墨迹总高/2 + 墨迹上沿
  setFont(ctx, fit.fs, '700')
  let asc = 0
  let desc = 0
  lines.forEach(function (t) {
    const mt = inkMetrics(ctx, t, fit.fs)
    if (mt.asc > asc) asc = mt.asc
    if (mt.desc > desc) desc = mt.desc
  })
  const inkH = asc + (n - 1) * lineH + desc
  let firstBaseline = areaCY - inkH / 2 + asc

  // ④ 硬夹紧：墨迹整体不许越过座位上沿、也不许压到徽标
  const minTop = seat.r + seat.h * 0.04
  const maxBottom = (badge ? badge.y : seat.r + seat.h) - seat.h * 0.04
  const inkTop = firstBaseline - asc
  const inkBottom = firstBaseline + (n - 1) * lineH + desc
  if (inkTop < minTop) firstBaseline += minTop - inkTop
  else if (inkBottom > maxBottom) firstBaseline -= inkBottom - maxBottom

  ctx.fillStyle = ink
  lines.forEach(function (line, i) {
    setFont(ctx, fit.fs, '700')
    ctx.fillText(line, cx, firstBaseline + i * lineH)
  })

  // ⑤ 徽标最后画，统一右下角
  if (badge) {
    roundRect(ctx, badge.x, badge.y, badge.w, badge.h, badge.h * 0.3)
    ctx.fillStyle = 'rgba(31,35,41,0.82)'
    ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    fillLineCentered(ctx, badge.txt, badge.x + badge.w / 2, badge.y + badge.h / 2 + 0.005, badge.fs, '700')
  }
}

module.exports = {
  drawPit: drawPit,
  roundRect: roundRect,
  fitText: fitText,
  FONT_STACK: FONT_STACK
}
