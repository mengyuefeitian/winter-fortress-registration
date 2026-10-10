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

/** 自动缩字号 + 最多 maxLines 行；仍放不下则末行省略号。返回 { fs, lines } */
function fitText(ctx, text, maxW, maxLines, startFs, minFs, weight) {
  const w = weight || '700'
  let fs = startFs
  let lines = []
  while (fs > minFs + 1e-6) {
    ctx.font = w + ' ' + fs.toFixed(3) + 'px ' + FONT_STACK
    lines = greedyWrap(ctx, text, maxW)
    if (lines.length <= maxLines) return { fs: fs, lines: lines }
    fs -= 0.01
  }
  ctx.font = w + ' ' + minFs + 'px ' + FONT_STACK
  lines = greedyWrap(ctx, text, maxW)
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines)
    let last = lines[maxLines - 1]
    while (last.length > 1 && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1)
    lines[maxLines - 1] = last + '…'
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
  ctx.font = '700 0.95px ' + FONT_STACK
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('熊坑', (p.c0 + p.c1 + 1) / 2, (p.r0 + p.r1 + 1) / 2 + 0.03)

  // 4) 旗子位
  layout.FLAG_SEATS.forEach(function (seat) { drawFlag(ctx, seat) })

  // 5) 座位文字
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  layout.SEATS.forEach(function (seat) {
    if (seat.isFlag) return
    const member = bySeat[seat.index]
    const ink = layout.blockOf(seat.block).ink
    const cx = seat.c + seat.w / 2
    const cy = seat.r + seat.h / 2
    if (mode === 'index') {
      ctx.fillStyle = member ? ink : 'rgba(60,60,60,0.45)'
      ctx.font = (member ? '700 ' : '400 ') + (member ? 0.62 : 0.5) + 'px ' + FONT_STACK
      ctx.fillText(String(seat.index), cx, cy + 0.02)
    } else if (member) {
      drawNickLabel(ctx, seat, member, ink)
    } else {
      ctx.fillStyle = 'rgba(60,60,60,0.32)'
      ctx.font = '400 0.4px ' + FONT_STACK
      ctx.fillText(String(seat.index), cx, cy + 0.02)
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
    ctx.fillText('共 ' + total + ' 个位置（可排 ' + cap + ' 人）· 已排 ' + occupied + ' 人', width / 2, height - 5)
    ctx.restore()
  }
}

// 昵称模式：昵称自动缩字号、最多两行；战力（dixin 字段）做右上角小徽标
function drawNickLabel(ctx, seat, member, ink) {
  const maxW = seat.w * 0.86
  const name = String(member.nickName || '')
  const lv = member.dixin
  const hasLevel = lv !== null && lv !== undefined && lv !== ''

  const cx = seat.c + seat.w / 2
  const cy = seat.r + seat.h / 2

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const centerY = hasLevel ? cy + seat.h * 0.09 : cy
  const fit = fitText(ctx, name, maxW, 2, seat.h * 0.34, seat.h * 0.18, '700')
  const lineH = fit.fs * 1.05
  let y = centerY - (lineH * fit.lines.length) / 2 + lineH / 2
  ctx.fillStyle = ink
  ctx.font = '700 ' + fit.fs.toFixed(3) + 'px ' + FONT_STACK
  fit.lines.forEach(function (line) {
    ctx.fillText(line, cx, y)
    y += lineH
  })

  if (hasLevel) {
    const txt = String(lv)
    ctx.font = '700 ' + (seat.h * 0.24).toFixed(3) + 'px ' + FONT_STACK
    const bw = Math.max(seat.w * 0.34, ctx.measureText(txt).width + seat.w * 0.14)
    const bh = seat.h * 0.30
    const bx = seat.c + seat.w - bw - seat.w * 0.05
    const by = seat.r + seat.h * 0.04
    ctx.fillStyle = 'rgba(31,35,41,0.82)'
    roundRect(ctx, bx, by, bw, bh, bh * 0.28)
    ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    ctx.fillText(txt, bx + bw / 2, by + bh / 2 + 0.005)
  }
}

module.exports = {
  drawPit: drawPit,
  roundRect: roundRect,
  fitText: fitText,
  FONT_STACK: FONT_STACK
}
