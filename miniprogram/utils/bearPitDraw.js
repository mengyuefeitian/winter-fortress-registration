/**
 * utils/bearPitDraw.js —— 「熊坑分布图」canvas 绘制
 *
 * 主页缩略图与地图大图共用同一套绘制逻辑（差别只在 opts）。
 * 绘制内容自内向外：
 *   熊坑本体（橙）+ 四角战旗（红）→ 108 个固定大小的座位（空位画淡底 + 虚线框）
 *   → 草地底纹 + 网格线 → 底部说明
 *
 * 坐标系：先 translate 到画布中心，再 scale(u)，于是所有绘制都用「座位单位」
 * （1 = 一个座位的边长，整张图 ±4.5）。这样缩放 / 拖动只是改 scale / offset。
 */

const layout = require('./bearPitLayout')

const FONT_STACK = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif'

// 画布留白（座位单位）
const PAD = 0.42

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

/**
 * 自动缩字号 + 最多 maxLines 行；仍放不下则末行省略号
 * 返回 { fs, lines }
 */
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
 * 绘制熊坑分布图
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} opts
 *   width/height  画布 CSS 尺寸
 *   dpr           设备像素比（默认 1）
 *   scale/offsetX/offsetY  缩放与平移（px）
 *   mode          'index' 编号 | 'nick' 昵称
 *   colorMode     'quadrant'（默认，四象限配色）| 'ring'
 *   members       [{ nickName, dixin, seatIndex, neighborSeat }]
 *   footer        是否画底部说明文字
 *   seatTotal     座位总数（默认 108）
 */
function drawPit(ctx, opts) {
  const o = opts || {}
  const width = o.width || 300
  const height = o.height || 300
  const dpr = o.dpr || 1
  const mode = o.mode === 'nick' ? 'nick' : 'index'
  const colorMode = o.colorMode || 'quadrant'
  const members = o.members || []
  const scale = o.scale || 1
  const offsetX = o.offsetX || 0
  const offsetY = o.offsetY || 0
  const footer = o.footer !== false
  const style = layout.PIT_STYLE

  // 座位号 → 成员
  const bySeat = {}
  members.forEach(function (m) {
    const s = Number(m.seatIndex)
    if (s >= 1) bySeat[s] = m
  })

  const base = Math.min(width, height) / (layout.MAP_HALF * 2 + PAD * 2)
  const u = base * scale

  ctx.save()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#FAFBF7'
  ctx.fillRect(0, 0, width, height)

  ctx.translate(width / 2 + offsetX, height / 2 + offsetY)
  ctx.scale(u, u)

  const outer = layout.MAP_HALF + 0.3

  // 1) 草地底板
  ctx.fillStyle = style.grass
  roundRect(ctx, -outer, -outer, outer * 2, outer * 2, 0.35)
  ctx.fill()

  // 2) 草地网格（每 1 个座位单位一格，淡色）
  ctx.strokeStyle = style.grassLine
  ctx.lineWidth = 0.018
  ctx.beginPath()
  for (let g = -Math.floor(outer); g <= Math.floor(outer); g++) {
    ctx.moveTo(g, -outer)
    ctx.lineTo(g, outer)
    ctx.moveTo(-outer, g)
    ctx.lineTo(outer, g)
  }
  ctx.stroke()

  // 3) 熊坑本体（中心 2×2）
  const pitGrad = ctx.createLinearGradient(-layout.PIT_HALF, -layout.PIT_HALF, layout.PIT_HALF, layout.PIT_HALF)
  pitGrad.addColorStop(0, '#F09A52')
  pitGrad.addColorStop(1, style.pitFill)
  ctx.fillStyle = pitGrad
  roundRect(ctx, -layout.PIT_HALF, -layout.PIT_HALF, layout.PIT_HALF * 2, layout.PIT_HALF * 2, 0.14)
  ctx.fill()
  ctx.strokeStyle = 'rgba(90,42,0,0.35)'
  ctx.lineWidth = 0.04
  ctx.stroke()

  ctx.fillStyle = style.pitText
  ctx.font = '800 0.62px ' + FONT_STACK
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('熊坑', 0, 0.03)

  // 4) 熊坑四角战旗
  const flag = 0.3
  const corners = [[-layout.PIT_HALF, -layout.PIT_HALF], [layout.PIT_HALF, -layout.PIT_HALF], [layout.PIT_HALF, layout.PIT_HALF], [-layout.PIT_HALF, layout.PIT_HALF]]
  corners.forEach(function (c) {
    const fx = c[0] < 0 ? c[0] - flag + 0.06 : c[0] - 0.06
    const fy = c[1] < 0 ? c[1] - flag + 0.06 : c[1] - 0.06
    ctx.fillStyle = style.flagFill
    roundRect(ctx, fx, fy, flag, flag, 0.05)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.lineWidth = 0.03
    ctx.stroke()
  })

  // 5) 座位：先把全部 108 个「槽位」画出来（空位只画淡底 + 虚线框）
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < layout.SEATS.length; i++) {
    const seat = layout.SEATS[i]
    const box = layout.seatBox(seat)
    const member = bySeat[seat.index]
    const color = layout.colorOf(seat, colorMode)

    if (!member) {
      ctx.fillStyle = 'rgba(255,255,255,0.42)'
      roundRect(ctx, box.x, box.y, box.w, box.h, 0.1)
      ctx.fill()
      ctx.save()
      ctx.setLineDash([0.09, 0.07])
      ctx.strokeStyle = 'rgba(120,130,110,0.5)'
      ctx.lineWidth = 0.03
      ctx.stroke()
      ctx.restore()
    } else {
      ctx.fillStyle = color.fill
      roundRect(ctx, box.x, box.y, box.w, box.h, 0.1)
      ctx.fill()
      ctx.strokeStyle = style.seatStroke
      ctx.lineWidth = style.seatStrokeWidth
      ctx.stroke()
    }

    // 6) 座位内的文字：编号 or 昵称
    if (mode === 'index') {
      ctx.fillStyle = member ? color.ink : 'rgba(120,130,110,0.55)'
      ctx.font = '700 0.4px ' + FONT_STACK
      ctx.fillText(String(seat.index), seat.x, seat.y + 0.015)
    } else if (member) {
      drawNickLabel(ctx, seat, member, color)
    } else {
      // 空位只画很淡的座位号，提示编号规律但不喧宾夺主
      ctx.fillStyle = 'rgba(120,130,110,0.34)'
      ctx.font = '600 0.24px ' + FONT_STACK
      ctx.fillText(String(seat.index), seat.x, seat.y + 0.01)
    }

    // 邻居连线：绑定了邻居的座位，画一条淡淡的虚线到邻居座位
    if (member && member.neighborSeat && bySeat[member.neighborSeat]) {
      const other = layout.seatByIndex(member.neighborSeat)
      if (other && member.seatIndex < member.neighborSeat) {
        ctx.save()
        ctx.setLineDash([0.08, 0.06])
        ctx.strokeStyle = 'rgba(233,69,96,0.85)'
        ctx.lineWidth = 0.05
        ctx.beginPath()
        ctx.moveTo(seat.x, seat.y)
        ctx.lineTo(other.x, other.y)
        ctx.stroke()
        ctx.restore()
      }
    }
  }

  ctx.restore()

  // 7) 底部说明（画在 CSS 像素空间，避免随缩放变形）
  if (footer) {
    const occupied = members.filter(function (m) { return Number(m.seatIndex) >= 1 }).length
    const total = o.seatTotal || layout.TOTAL_SEATS
    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#6B7280'
    ctx.font = '500 11px ' + FONT_STACK
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText('共 ' + total + ' 个座位 · 已报名 ' + occupied + ' 人', width / 2, height - 5)
    ctx.restore()
  }
}

// 昵称模式：昵称自动缩字号、最多两行；地心等级做右上角的小数字徽标
function drawNickLabel(ctx, seat, member, color) {
  const maxW = 0.82
  const name = String(member.nickName || '')
  const lv = member.dixin
  const hasLevel = lv !== null && lv !== undefined && lv !== ''

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // 有等级徽标时，昵称往下让出徽标的位置
  const centerY = hasLevel ? seat.y + 0.13 : seat.y
  const fit = fitText(ctx, name, maxW, 2, 0.32, 0.19, '700')
  const lineH = fit.fs * 1.04
  const totalH = lineH * fit.lines.length
  let y = centerY - totalH / 2 + lineH / 2
  ctx.fillStyle = color.ink
  ctx.font = '700 ' + fit.fs.toFixed(3) + 'px ' + FONT_STACK
  fit.lines.forEach(function (line) {
    ctx.fillText(line, seat.x, y)
    y += lineH
  })

  if (hasLevel) {
    const txt = String(lv)
    ctx.font = '700 0.19px ' + FONT_STACK
    const bw = Math.max(0.26, ctx.measureText(txt).width + 0.12)
    const bh = 0.22
    const bx = seat.x + 0.5 - bw - 0.05
    const by = seat.y - 0.5 + 0.05
    ctx.fillStyle = 'rgba(17,24,39,0.7)'
    roundRect(ctx, bx, by, bw, bh, 0.05)
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
