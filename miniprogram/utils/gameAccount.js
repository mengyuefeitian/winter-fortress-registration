// utils/gameAccount.js
// 游戏账号资料库：客户端 SDK
//
// 职责分三块：
//   1) 等级规格（spec）的规整与展示：{kind:'fire'|'level', value}  ⇄  文字 / 图标路径
//   2) 账号 CRUD：全部走 manageGameAccount 云函数（见该函数头注释里的选型原因）
//   3) decorate()：给各类报名记录补上「熔炉等级图标」字段，供报名列表 / 截图展示
//
// 字段约定（与云函数保持同一份规范，改一处必须同步改另一处）：
//   gameNickName  游戏昵称（必填，同用户下唯一）
//   furnace       {kind,value} | null        熔炉等级
//   dixin         Number | null              地心探险（自然数）
//   barracks      {shield,spear,bow}         每项 {kind,value,stage} | null，stage ∈ ''|'T11'|'T12'
//   isMain        Boolean                    同一用户下互斥
//   allianceId/Name                          最近一次报名使用的联盟（供报名页预填）

const MAX_FIRE = 10
const MAX_LEVEL = 30
const STAGES = ['T11', 'T12']

const COLL_ICON_DIR = '/images/game-account'
const FURNACE_ICON = `${COLL_ICON_DIR}/furnace.png`

// 三兵营图标（截图里与等级徽章并排展示，替代文字"盾兵营/矛兵营/射手营"）
const BAR_ICONS = {
  shield: `${COLL_ICON_DIR}/barracks-shield.png`,
  spear: `${COLL_ICON_DIR}/barracks-spear.png`,
  bow: `${COLL_ICON_DIR}/barracks-bow.png`
}
const BAR_KEYS = ['shield', 'spear', 'bow']

// 报名记录里"账号级"的兜底缓存：userId → {furnace,ts}，避免同一次会话里反复打云函数
const mainCache = {}
const MAIN_CACHE_TTL = 3 * 60 * 1000

// 「我自己的熔炉等级」缓存（storage 级，跨页面共用，避免 4 个报名页各打一次云函数）
const SELF_KEY = 'gameAccountSelfFurnace'
const SELF_CACHE_TTL = 5 * 60 * 1000

// ============ 工具 ============

function trimStr(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max || 30)
}

function clampInt(v, min, max) {
  const n = parseInt(v, 10)
  if (isNaN(n)) return null
  if (n < min) return min
  if (n > max) return max
  return n
}

function safeCall(action, payload) {
  return new Promise((resolve) => {
    const app = getApp()
    const userInfo = (app && app.globalData && app.globalData.userInfo) || null
    const userId = (userInfo && userInfo._id) || (app && app.globalData && app.globalData.openid) || ''
    wx.cloud.callFunction({
      name: 'manageGameAccount',
      data: Object.assign({ action, userId }, payload || {}),
      success: (res) => resolve((res && res.result) || { success: false, error: '空返回' }),
      fail: (err) => {
        console.error('[gameAccount] 云函数调用失败', action, err)
        resolve({ success: false, error: (err && (err.errMsg || err.message)) || '网络异常' })
      }
    })
  })
}

// ============ 等级规格 ============

// 规整：非法 / 缺省 → null（表示"未设置"）
function normalizeSpec(raw) {
  if (!raw || typeof raw !== 'object') return null
  const value = parseInt(raw.value, 10)
  if (!value || value <= 0) return null
  if (raw.kind === 'fire') return { kind: 'fire', value: Math.min(value, MAX_FIRE) }
  if (raw.kind === 'level') return { kind: 'level', value: Math.min(value, MAX_LEVEL) }
  return null
}

function normalizeBarracksItem(raw) {
  const spec = normalizeSpec(raw)
  if (!spec) return null
  let stage = trimStr(raw && raw.stage, 4).toUpperCase()
  if (spec.kind !== 'fire' || STAGES.indexOf(stage) < 0) stage = ''
  return { kind: spec.kind, value: spec.value, stage }
}

function normalizeBarracks(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  return {
    shield: normalizeBarracksItem(src.shield),
    spear: normalizeBarracksItem(src.spear),
    bow: normalizeBarracksItem(src.bow)
  }
}

// 规格 → 图标路径（仅火晶有图片素材；普通等级用 CSS 圆环，见 furnaceRingOf）
function iconSrc(spec) {
  return spec && spec.kind === 'fire' ? `${COLL_ICON_DIR}/fire${spec.value}.png` : ''
}

// 规格 → 圆环里要显示的数字（普通等级专用）
function ringOf(spec) {
  return spec && spec.kind === 'level' ? String(spec.value) : ''
}

// 规格 → 文案（火9 / 28）
function specToText(spec) {
  if (!spec) return ''
  return spec.kind === 'fire' ? `火${spec.value}` : String(spec.value)
}

// 文案 → 规格：国战报名等处熔炉等级是自由文本（"火4"、"城堡25"），写回账号时解析成结构化数据
function parseText(text) {
  const t = String(text == null ? '' : text).trim()
  if (!t) return null
  let m = t.match(/火\s*([0-9]{1,2})/)
  if (m) {
    const v = clampInt(m[1], 1, MAX_FIRE)
    if (v) return { kind: 'fire', value: v }
  }
  m = t.match(/([0-9]{1,2})/)
  if (m) {
    const v = clampInt(m[1], 1, MAX_LEVEL)
    if (v) return { kind: 'level', value: v }
  }
  return null
}

// 把 spec 挂到任意对象上，供 wxml / canvas 直接使用
function applySpec(target, spec) {
  const s = normalizeSpec(spec)
  target.furnaceSpec = s
  target.furnaceIcon = iconSrc(s)
  target.furnaceRing = ringOf(s)
  target.furnaceText = specToText(s)
  target.furnaceHas = !!s
  return target
}

// ============ 账号 CRUD ============

function list() {
  return safeCall('list').then(r => (r.success ? (r.accounts || []) : []))
}

function getMain() {
  return safeCall('getMain').then(r => (r.success ? (r.account || null) : null))
}

function save(account) {
  return safeCall('save', {
    id: account && account._id ? account._id : '',
    gameNickName: trimStr(account && account.gameNickName, 30),
    furnace: normalizeSpec(account && account.furnace),
    dixin: (account && account.dixin !== '' && account.dixin !== null && account.dixin !== undefined)
      ? clampInt(account.dixin, 0, 999999) : null,
    barracks: normalizeBarracks(account && account.barracks),
    allianceId: trimStr(account && account.allianceId, 64),
    allianceName: trimStr(account && account.allianceName, 40)
  })
}

function remove(id) {
  return safeCall('remove', { id })
}

function setMain(id) {
  return safeCall('setMain', { id })
}

// 报名成功后回写：把报名里填的资料同步到账号，并让该账号成为主账号
function syncFromRegistration(payload) {
  const p = payload || {}
  return safeCall('syncFromRegistration', {
    gameNickName: trimStr(p.gameNickName, 30),
    furnace: normalizeSpec(p.furnace),
    dixin: (p.dixin === '' || p.dixin === null || p.dixin === undefined) ? null : clampInt(p.dixin, 0, 999999),
    barracks: normalizeBarracks(p.barracks),
    allianceId: trimStr(p.allianceId, 64),
    allianceName: trimStr(p.allianceName, 40)
  }).then(r => {
    if (r.success) clearMainCache()
    return r
  })
}

// ============ 报名列表 / 截图：熔炉等级展示 ============

function clearMainCache() {
  Object.keys(mainCache).forEach(k => { delete mainCache[k] })
  try { wx.removeStorageSync(SELF_KEY) } catch (e) { /* 忽略 */ }
}

function currentUserId() {
  const app = getApp()
  if (!app || !app.globalData) return ''
  const u = app.globalData.userInfo
  return (u && u._id) || app.globalData.openid || ''
}

/**
 * 「我自己的熔炉等级」：报名时写进报名记录，供报名列表 / 截图展示等级图标。
 * 取的是主账号的熔炉等级；没有主账号或没填过则为 null。
 * 走 storage 缓存（5 分钟）—— 4 个报名页都会调用，没必要每页各打一次云函数。
 */
async function selfFurnace(force) {
  const uid = currentUserId()
  if (!force) {
    try {
      const c = wx.getStorageSync(SELF_KEY)
      if (c && c.uid === uid && Date.now() - c.ts < SELF_CACHE_TTL) {
        return normalizeSpec(c.furnace)
      }
    } catch (e) { /* 忽略，走真实查询 */ }
  }

  const account = await getMain()
  const furnace = normalizeSpec(account && account.furnace)
  try {
    wx.setStorageSync(SELF_KEY, { uid, furnace, ts: Date.now() })
  } catch (e) { /* 忽略 */ }
  return furnace
}

// 批量取各用户的主账号熔炉等级（老报名记录里没有存 furnace 时兜底）
async function fetchMainFurnace(userIds) {
  const need = (userIds || []).filter(id => id && !(mainCache[id] && Date.now() - mainCache[id].ts < MAIN_CACHE_TTL))
  const uniq = [...new Set(need)]
  if (uniq.length > 0) {
    const res = await safeCall('listMainByUsers', { userIds: uniq })
    if (res.success && res.map) {
      const now = Date.now()
      uniq.forEach(id => {
        const hit = res.map[id]
        mainCache[id] = { furnace: (hit && hit.furnace) || null, ts: now }
      })
    }
  }
  const out = {}
  ;(userIds || []).forEach(id => {
    if (!id) return
    if (mainCache[id]) out[id] = mainCache[id].furnace
  })
  return out
}

/**
 * 给一批报名记录补上熔炉等级展示字段（就地修改并返回同一个数组）。
 *
 * 取值优先级：
 *   ① 记录自带的 furnace（新的报名都会存）
 *   ② 记录里的 furnaceLevel 文本（国战这类老字段，"火4"/"城堡25" 都能解析）
 *   ③ 按 userId 查该用户的账号（老记录兜底，走云函数 + 3 分钟缓存）
 *
 * @param {Array} list 报名记录数组
 * @param {Object} [opts] { fallback: false } 可关闭第 ③ 步，用于不想发云函数的场景
 */
async function decorate(list, opts) {
  if (!Array.isArray(list) || list.length === 0) return list
  const options = opts || {}

  const missing = []
  list.forEach(r => {
    if (!r) return
    const spec = normalizeSpec(r.furnace) || parseText(r.furnaceLevel)
    if (spec) applySpec(r, spec)
    else {
      applySpec(r, null)
      if (r.userId) missing.push(r.userId)
    }
  })

  if (options.fallback === false || missing.length === 0) return list

  try {
    const map = await fetchMainFurnace(missing)
    list.forEach(r => {
      if (!r || r.furnaceHas) return
      const spec = map[r.userId]
      if (spec) applySpec(r, spec)
    })
  } catch (e) {
    console.warn('[gameAccount] 兜底查询熔炉等级失败(已忽略):', e)
  }
  return list
}

/**
 * wxml 用的展示数据：{ icon, ring, has, stage }
 *
 * stage（兵种阶级 T11/T12）从原始 spec 上读 —— 只有「火晶」才有意义，
 * 标准等级一律为空（与 normalizeBarracksItem 同一口径）。
 * 传参约定：熔炉传 { furnace: spec }；兵营传 { furnace: spec }（spec 自带 stage）。
 */
function viewOf(record) {
  const raw = record && record.furnace
  const spec = normalizeSpec(raw) || parseText(record && record.furnaceLevel)
  let stage = ''
  if (spec && spec.kind === 'fire' && raw && typeof raw === 'object') {
    const st = trimStr(raw.stage, 4).toUpperCase()
    if (STAGES.indexOf(st) >= 0) stage = st
  }
  return { icon: iconSrc(spec), ring: ringOf(spec), has: !!spec, stage: stage }
}

// ============ 切换账号时的「资料同步」============

/**
 * 在账号列表里定位一个账号：优先按 selectedId，其次按游戏昵称。
 * 报名页的昵称复合选择器切换账号时用 —— 手动填的新昵称没有 selectedId，会走到昵称匹配，
 * 匹配不上返回 null（页面据此保持原样，不清空用户已填内容）。
 */
function pickAccount(list, selectedId, nickName) {
  const arr = Array.isArray(list) ? list : []
  if (selectedId) {
    const hit = arr.filter(a => a && a._id === selectedId)[0]
    if (hit) return hit
  }
  const n = String(nickName == null ? '' : nickName).trim()
  if (n) {
    const hit = arr.filter(a => a && a.gameNickName === n)[0]
    if (hit) return hit
  }
  return null
}

/**
 * 账号 → 等级字段 patch（熔炉 + 三兵营，含兵种阶级 stage）。
 * 切换账号后整体覆盖页面上的等级，避免沿用上一个账号的等级造成数据串号。
 * 账号没有对应字段时该项为 null（页面会显示"未选"）。
 */
function specsOf(account) {
  if (!account) return null
  const b = account.barracks || {}
  return {
    furnaceSpec: normalizeSpec(account.furnace),
    shieldSpec: normalizeBarracksItem(b.shield),
    spearSpec: normalizeBarracksItem(b.spear),
    archerSpec: normalizeBarracksItem(b.bow)
  }
}

/**
 * 账号里「最近一次报名用的联盟」在页面联盟列表里的下标；没有/找不到返回 -1。
 * 切换账号后用它把联盟选择器一起切过去（"主账号 = 最后报名的账号"的配套行为）。
 */
function allianceIndexIn(alliances, allianceId) {
  const id = String(allianceId || '')
  if (!id || !Array.isArray(alliances) || alliances.length === 0) return -1
  return alliances.findIndex(a => a && a._id === id)
}

// 报名记录 → 熔炉规格：优先结构化 furnace，其次老数据文本 furnaceLevel（"火9" / "城堡25"）
function specFromRecord(rec) {
  if (!rec) return null
  return normalizeSpec(rec.furnace) || parseText(rec.furnaceLevel)
}

// 报名记录 → 某个兵营的规格：优先结构化 barracks[key]，其次老数据 barracksLevel（"火5/火5/火5"）
function barracksSpecFromRecord(rec, key) {
  if (!rec) return null
  const idx = BAR_KEYS.indexOf(key)
  if (idx < 0) return null
  const item = normalizeBarracksItem(rec.barracks && rec.barracks[key])
  if (item) return item
  const parts = String(rec.barracksLevel || '').split('/')
  return parts[idx] ? parseText(parts[idx]) : null
}

// ============ Canvas 绘制（截图用） ============

const FURNACE_BADGE_SIZE = 30      // 截图里徽章的边长（canvas 逻辑像素）
const BADGE_SIZE = 32              // 截图里「熔炉等级图标」的边长（列表观感偏小，放大到 32）

/**
 * 预加载火晶徽章图片。
 * 小程序 <image> 能直接用代码包路径，但 canvas 的 drawImage 需要真实文件路径，
 * 故先用 wx.getImageInfo 把 `/images/...` 解析成临时路径，再喂给 canvas.createImage()。
 * 任何一步失败都静默降级为「程序化绘制」（见 drawBadge），保证截图不会因为素材加载失败而中断。
 */
async function preloadBadges(canvas, specs) {
  const keys = [...new Set((specs || [])
    .filter(s => s && s.kind === 'fire')
    .map(s => `fire${s.value}`))]
  const out = {}
  await Promise.all(keys.map(async k => {
    const img = await loadImageToCanvas(canvas, `${COLL_ICON_DIR}/${k}.png`)
    if (img) out[k] = img
  }))
  return out
}

/**
 * 预加载任意代码包图片（例如三兵营图标），返回 { 路径: img }。
 * 与 preloadBadges 同样做「getImageInfo 解析 → 直接喂代码包路径」两次尝试，失败静默跳过。
 */
async function preloadFiles(canvas, paths) {
  const out = {}
  await Promise.all([...new Set(paths || [])].map(async p => {
    const img = await loadImageToCanvas(canvas, p)
    if (img) out[p] = img
  }))
  return out
}

/**
 * 把代码包路径加载成 canvas 可绘制的图片。
 * 小程序 <image> 能直接用 `/images/...`，但 canvas 的 drawImage 需要真实文件路径，
 * 故先用 wx.getImageInfo 解析；再直接喂一次作为兜底（部分基础库/机型只认其中一种）。
 */
async function loadImageToCanvas(canvas, pkgPath) {
  const info = await new Promise(resolve => {
    wx.getImageInfo({ src: pkgPath, success: resolve, fail: () => resolve(null) })
  })
  let img = await loadCanvasImage(canvas, (info && info.path) || pkgPath)
  if (!img) img = await loadCanvasImage(canvas, pkgPath)
  return img
}

// 用 canvas.createImage() 加载一张图片，成功返回 img，失败/超时返回 null（绝不 reject）
function loadCanvasImage(canvas, src) {
  return new Promise(resolve => {
    let settled = false
    const finish = (v) => { if (!settled) { settled = true; resolve(v) } }
    try {
      const img = canvas.createImage()
      img.onload = () => finish(img)
      img.onerror = () => finish(null)
      img.src = src
      // 兜底：个别环境下 onload/onerror 都不回调，1.2s 后按失败处理
      setTimeout(() => finish(null), 1200)
    } catch (e) {
      finish(null)
    }
  })
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

/**
 * 在 canvas 上画一个「熔炉等级徽章」，返回本次绘制的宽度。
 * 有图片素材（火晶）优先贴图；否则程序化绘制：
 *   · 火晶 → 红色六边形宝石 + 白字
 *   · 普通等级 → 蓝色圆环 + 蓝字（与小程序里的 CSS 圆环一致）
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Number} x 左边缘
 * @param {Number} y 垂直中心
 * @param {Number} size 徽章边长
 * @param {Object} spec {kind,value} | null
 * @param {Object} images preloadBadges 的返回值
 */
function drawBadge(ctx, x, y, size, spec, images) {
  const s = normalizeSpec(spec)
  if (!s) return 0

  // ⚠️ 必须 save/restore：本函数会改 fillStyle / strokeStyle / font / textAlign /
  //    textBaseline，调用方（截图循环）紧接着要用自己的 fillStyle+font 画昵称。
  //    之前没隔离，降级绘制把 fillStyle 留成 #FFFFFF，导致徽章之后的所有昵称
  //    在白底上"隐身"——新报名数据只看得见图标、看不见游戏昵称就是这个原因。
  ctx.save()
  try {
    const top = y - size / 2

    // 兵种阶级（T11/T12）：火晶专属，画在徽章右下角当角标（与小程序里 .ga-stage 同色同观感）
    // ⚠️ 必须从「原始 spec」上取：normalizeSpec() 只保留 {kind,value}，stage 会被丢掉。
    //    同理调用方（drawBadgeRow）也必须传原始 spec，别先 normalize 一遍再传进来。
    const rawStage = (spec && typeof spec === 'object') ? String(spec.stage || '').toUpperCase() : ''
    const stage = STAGES.indexOf(rawStage) >= 0 ? rawStage : ''

    if (s.kind === 'fire') {
      const img = images && images[`fire${s.value}`]
      if (img) {
        ctx.drawImage(img, x, top, size, size)
        if (stage) drawStageTag(ctx, x, top, size, stage)
        return size
      }
      drawFireFallback(ctx, x, y, size, s.value)
      if (stage) drawStageTag(ctx, x, top, size, stage)
      return size
    }

    // 普通等级：蓝色圆环 + 居中数字
    const cx = x + size / 2
    const r = size / 2
    ctx.beginPath()
    ctx.arc(cx, y, r - Math.max(1, size * 0.06), 0, Math.PI * 2)
    ctx.fillStyle = '#FFFFFF'
    ctx.fill()
    ctx.strokeStyle = '#4A90D9'
    ctx.lineWidth = Math.max(1, size * 0.09)
    ctx.stroke()

    ctx.fillStyle = '#4A90D9'
    ctx.font = `bold ${Math.round(size * (s.value >= 10 ? 0.46 : 0.56))}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(s.value), cx, y + 1)
    return size
  } finally {
    ctx.restore()
  }
}

/**
 * 兵种阶级角标（T11 / T12）：贴在等级徽章的右下角，与小程序里 `.ga-stage` 同色。
 *
 * ⚠️ 刻意「横向不凸出徽章」—— 截图里三个兵营徽章是用斜杠串成一行的，
 *    任何向右的凸出都会累积并挤到右边的列（兵种数量 / 战争），宁可纵向稍微出界。
 */
function drawStageTag(ctx, x, top, size, stage) {
  const fs = Math.max(6, Math.round(size * 0.28))
  ctx.save()
  try {
    ctx.font = `bold ${fs}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const tw = ctx.measureText(stage).width
    const padX = Math.max(2, Math.round(size * 0.09))
    const w = Math.min(size, Math.round(tw + padX * 2))   // 绝不宽于徽章本身
    const h = Math.round(fs + Math.max(2, size * 0.10))
    const left = x + size - w                              // 右边缘与徽齐平
    const tagTop = top + size - Math.round(h * 0.86)       // 下沿略微出界，视觉上像"角标"

    roundRectPath(ctx, left, tagTop, w, h, Math.max(2, h * 0.26))
    ctx.fillStyle = '#c8862a'
    ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    ctx.fillText(stage, left + w / 2, tagTop + h / 2 + 0.5)
  } finally {
    ctx.restore()
  }
}

/**
 * 截图里「多个等级徽章 + 斜杠分隔」组合（如兵营等级 火5/火5/火5），返回本次绘制的总宽度。
 *
 * 与「兵种数量 100/50/80」的写法保持一致：只画等级徽章，用斜杠分开，
 * 不再画「盾/矛/射」兵营 logo（logo 占宽且有歧义，等级本身已足够表达）。
 * 缺值的位次画「—」占位，保证三段的视觉顺序与含义固定。
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Number} x 左边缘
 * @param {Number} y 垂直中心
 * @param {Number} size 单个徽章边长
 * @param {Array} specs [{kind,value}] 按固定顺序（盾/矛/射）传入，可含 null
 * @param {Object} images preloadBadges 的返回值
 * @param {Object} [opts] { slashColor }
 */
function drawBadgeRow(ctx, x, y, size, specs, images, opts) {
  const list = specs || []
  const sepColor = (opts && opts.slashColor) || '#B0B6C0'
  const sepFont = `${Math.round(size * 0.62)}px sans-serif`
  const sepGap = Math.round(size * 0.22)

  // ⚠️ 同样必须 save/restore：本函数会改 fillStyle/font/textAlign/textBaseline
  ctx.save()
  try {
    let bx = x
    list.forEach((spec, i) => {
      // ⚠️ 判空用归一化后的 s，但**绘制必须传原始 spec** —— 否则 stage（兵种阶级）会被丢掉
      const s = normalizeSpec(spec)
      if (i > 0) {
        ctx.fillStyle = sepColor
        ctx.font = sepFont
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText('/', bx, y)
        bx += ctx.measureText('/').width + sepGap
      }
      if (s) {
        bx += drawBadge(ctx, bx, y, size, spec, images) + sepGap
      } else {
        ctx.fillStyle = sepColor
        ctx.font = sepFont
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText('—', bx, y)
        bx += size * 0.9 + sepGap
      }
    })
    // 末尾多算了一个 sepGap，减掉才是真实占用宽度
    return list.length > 0 ? bx - x - sepGap : 0
  } finally {
    ctx.restore()
  }
}

/**
 * 火晶素材加载失败时的程序化降级绘制。
 * 尽量贴近 miniprogram/images/game-account/fireN.png 的观感：
 *   火1-3 = 红宝石 + 古铜外框；火4-5 = 红宝石 + 浅蓝外框；火6-10 = 紫金外框 + 亮红宝石。
 */
function drawFireFallback(ctx, x, y, size, value) {
  const cx = x + size / 2
  const r = size / 2
  const v = Number(value) || 0
  const frame = v >= 6 ? '#8A5BD9' : (v >= 4 ? '#7FB6D9' : '#B07A3C')
  const gem = v >= 6 ? '#E0453C' : '#C8342E'

  // 外框（六边形，稍大）
  hexPath(ctx, cx, y, r)
  ctx.fillStyle = frame
  ctx.fill()

  // 内层红宝石
  hexPath(ctx, cx, y, r * 0.76)
  ctx.fillStyle = gem
  ctx.fill()

  // 高光
  ctx.beginPath()
  ctx.moveTo(cx - r * 0.36, y - r * 0.30)
  ctx.lineTo(cx + r * 0.10, y - r * 0.46)
  ctx.lineTo(cx - r * 0.06, y - r * 0.10)
  ctx.closePath()
  ctx.fillStyle = 'rgba(255,255,255,0.30)'
  ctx.fill()

  // 数字：白字 + 深色描边，保证在任何底色上都清晰
  const fs = Math.round(size * (v >= 10 ? 0.44 : 0.52))
  ctx.font = `bold ${fs}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = Math.max(1.5, size * 0.09)
  ctx.strokeStyle = 'rgba(60,10,10,0.75)'
  ctx.strokeText(String(value), cx, y + 1)
  ctx.fillStyle = '#FFFFFF'
  ctx.fillText(String(value), cx, y + 1)
}

// 尖顶朝上的正六边形（与 fireN.png 的宝石朝向一致）
function hexPath(ctx, cx, cy, r) {
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const ang = -Math.PI / 2 + i * Math.PI / 3
    const px = cx + r * Math.cos(ang)
    const py = cy + r * Math.sin(ang)
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
  }
  ctx.closePath()
}

/**
 * 截图里「熔炉图标 + 等级徽章」组合：先画火炉图标，再画等级徽章，返回总宽度。
 * 没填等级时不画（返回 0），避免出现"有图标没数字"的怪状态。
 */
function drawFurnaceBadge(ctx, x, y, spec, images, badgeSize) {
  const s = normalizeSpec(spec)
  if (!s) return 0
  ctx.save()
  try {
    return drawFurnaceBadgeInner(ctx, x, y, s, images, badgeSize)
  } finally {
    ctx.restore()
  }
}

function drawFurnaceBadgeInner(ctx, x, y, s, images, badgeSize) {
  const size = badgeSize || FURNACE_BADGE_SIZE
  const furnaceSize = Math.round(size * 0.78)
  const gap = Math.round(size * 0.16)

  // 火炉图标：优先用素材，缺失时用一个小橙点代替（保证不空窗）
  const fur = images && images.furnace
  if (fur) {
    ctx.drawImage(fur, x, y - furnaceSize / 2, furnaceSize, furnaceSize)
  } else {
    ctx.beginPath()
    ctx.arc(x + furnaceSize / 2, y, furnaceSize / 2, 0, Math.PI * 2)
    ctx.fillStyle = '#F0813C'
    ctx.fill()
  }

  const used = drawBadge(ctx, x + furnaceSize + gap, y, size, s, images)
  return used ? furnaceSize + gap + used : 0
}

// 顺带把火炉图标一起预加载（drawFurnaceBadge 要用）
async function preloadAll(canvas, specs) {
  const imgs = await preloadBadges(canvas, specs)
  await new Promise(resolve => {
    wx.getImageInfo({
      src: FURNACE_ICON,
      success: (info) => {
        const img = canvas.createImage()
        img.onload = () => { imgs.furnace = img; resolve() }
        img.onerror = () => resolve()
        img.src = (info && info.path) || FURNACE_ICON
      },
      fail: () => resolve()
    })
  })
  return imgs
}

module.exports = {
  // 常量
  MAX_FIRE,
  MAX_LEVEL,
  STAGES,
  FURNACE_ICON,
  BAR_ICONS,
  BAR_KEYS,
  BADGE_SIZE,

  // 规格
  normalizeSpec,
  normalizeBarracks,
  normalizeBarracksItem,
  iconSrc,
  ringOf,
  specToText,
  parseText,
  applySpec,

  // CRUD
  list,
  getMain,
  save,
  remove,
  setMain,
  syncFromRegistration,

  // 切换账号时的资料同步
  pickAccount,
  specsOf,
  allianceIndexIn,

  // 列表 / 截图
  decorate,
  viewOf,
  specFromRecord,
  barracksSpecFromRecord,
  fetchMainFurnace,
  selfFurnace,
  currentUserId,
  clearMainCache,

  // canvas
  preloadAll,
  preloadBadges,
  preloadFiles,
  drawBadge,
  drawBadgeRow,
  drawFurnaceBadge,
  FURNACE_BADGE_SIZE,
  roundRectPath
}
