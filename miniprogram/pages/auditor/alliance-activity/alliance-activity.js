// pages/auditor/alliance-activity/alliance-activity.js
// 联盟活跃 —— 成员管理页（盟管进入；区管从总览点联盟名也进入本页）
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')
const ga = require('../../../utils/gameAccount')

// 给成员补上「熔炉等级」展示字段（火晶图 / 圆环数字 / 是否展示）
// 三级兜底（交给 ga.decorate）：成员自带 furnace → 老数据文本 furnaceLevel → 按 userId 查该用户主账号。
// 第三级走 manageGameAccount.listMainByUsers，所以即使 manageAllianceActivity 还是旧版
// （没返回 furnace），这里也能补上等级图标。
async function decorateMembers(list) {
  const arr = (list || []).map(m => Object.assign({}, m))
  try {
    await ga.decorate(arr)
  } catch (e) {
    console.warn('[联盟活跃] 熔炉等级兜底失败(已忽略):', e)
  }
  return arr
}

// 成员行 → 熔炉规格（decorateMembers 已兜底，优先用算好的 furnaceSpec）
function memberSpec(m) {
  return (m && m.furnaceSpec) || ga.specFromRecord(m)
}

// 单行文本截断（超出加省略号）
function truncateText(ctx, text, maxW) {
  const str = String(text || '')
  if (ctx.measureText(str).width <= maxW) return str
  let t = str
  while (t.length > 0 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
  return t.length > 0 ? t + '…' : ''
}

Page({
  data: {
    allianceId: '',
    allianceName: '',
    weekDates: [],
    dayIndex: 0,
    weekStart: '',

    members: [],
    activeList: [],
    inactiveList: [],
    total: 0,
    activeCount: 0,

    myMark: null,
    loading: true
  },

  onLoad: function (options) {
    const allianceId = options.allianceId || ''
    this.__alive = true
    this.setData({ allianceId: allianceId })

    // 惰性清理：仅保留本周数据（定时触发器兜底）
    db.cleanupExpiredAllianceActivity().catch(() => {})

    this.refreshMyMark()

    if (allianceId) {
      this.loadData(allianceId)
    } else {
      this.resolveMyAlliance()
    }
  },

  onShow: function () {
    // app.onShow 会重新上报活跃（异步请求），先读一次再延迟补读一次
    this.refreshMyMark()
    const self = this
    setTimeout(function () {
      if (self.__alive) self.refreshMyMark()
    }, 1200)
  },

  onUnload: function () {
    this.__alive = false
  },

  // 展示"我自己"的活跃登记状态：仅失败时提示，便于自助排查
  // （常见原因：云函数未部署 → Unknown action / timeout；未加入联盟；无游戏昵称）
  refreshMyMark: function () {
    this.setData({
      myMark: wx.getStorageSync('lastAllianceActiveResult') || null
    })
  },

  // 点击提示条立即重试登记（force 绕过节流）
  onRetryMark: function () {
    const self = this
    util.showLoading('登记中...')
    app.markAllianceActive(true).then(function () {
      util.hideLoading()
      self.refreshMyMark()
      const mark = wx.getStorageSync('lastAllianceActiveResult') || {}
      if (mark.ok) {
        util.showSuccess('已登记今日活跃')
        if (self.data.allianceId) self.loadData(self.data.allianceId)
      } else {
        util.showError(mark.error || '登记失败')
      }
    })
  },

  onPullDownRefresh: function () {
    if (this.data.allianceId) {
      this.loadData(this.data.allianceId, () => {
        wx.stopPullDownRefresh()
      })
    } else {
      wx.stopPullDownRefresh()
    }
  },

  // 未传入 allianceId 时：取当前用户绑定的第一个联盟
  resolveMyAlliance: async function () {
    try {
      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid
      if (!userId) {
        this.setData({ loading: false })
        util.showError('未获取到用户信息')
        return
      }
      const wxdb = wx.cloud.database()
      const res = await wxdb.collection('alliances').where({
        auditorIds: userId
      }).get()

      const list = res.data || []
      // 兼容旧数据：auditorId 单值
      const mine = list.length > 0 ? list : await wxdb.collection('alliances').where({
        auditorId: userId
      }).get().then(r => r.data || []).catch(() => [])

      if (mine.length === 0) {
        this.setData({ loading: false })
        util.showInfo('暂未绑定联盟')
        return
      }
      this.setData({ allianceId: mine[0]._id })
      this.loadData(mine[0]._id)
    } catch (err) {
      console.error('解析联盟失败:', err)
      this.setData({ loading: false })
      util.showError('加载失败')
    }
  },

  // 加载本周成员活跃数据
  loadData: async function (allianceId, callback) {
    try {
      const res = await db.getAllianceActivityMembers(allianceId)
      // 依次补熔炉等级：第一个列表发兜底查询并写入 3 分钟缓存，后两个直接命中缓存，不会重复发请求
      const members = await decorateMembers(res.members)
      const activeList = await decorateMembers(res.activeList)
      const inactiveList = await decorateMembers(res.inactiveList)
      this.setData({
        allianceName: res.allianceName || '',
        weekDates: res.weekDates || [],
        dayIndex: res.dayIndex || 0,
        weekStart: res.weekStart || '',
        members,
        activeList,
        inactiveList,
        total: res.total || 0,
        activeCount: res.activeCount || 0,
        loading: false
      })
      if (res.allianceName) {
        wx.setNavigationBarTitle({ title: res.allianceName + ' · 联盟活跃' })
      }
    } catch (err) {
      console.error('加载联盟活跃失败:', err)
      this.setData({ loading: false })
      util.showError(err.message || '加载失败')
    }
    if (callback) callback()
  },

  // 未活跃 → 勾选为活跃
  onCheckActive: async function (e) {
    const nick = e.currentTarget.dataset.nick
    if (!nick) return
    await this.setActive(nick, true)
  },

  // 活跃 → 点叉取消活跃
  onRemoveActive: async function (e) {
    const nick = e.currentTarget.dataset.nick
    if (!nick) return
    await this.setActive(nick, false)
  },

  setActive: async function (nick, active) {
    const allianceId = this.data.allianceId
    if (!allianceId) return
    try {
      util.showLoading('处理中...')
      await db.setAllianceMemberActive(allianceId, nick, active)
      await this.loadData(allianceId)
      util.hideLoading()
    } catch (err) {
      util.hideLoading()
      console.error('设置活跃失败:', err)
      util.showError(err.message || '操作失败')
    }
  },

  // 长按成员行 → 删除（二次确认）
  onLongPressMember: function (e) {
    const nick = e.currentTarget.dataset.nick
    if (!nick) return
    wx.showModal({
      title: '删除',
      content: '确认删除当前用户本周活跃信息，用户下次登录小程序仍可自动添加。',
      confirmText: '删除',
      confirmColor: '#FF4D4F',
      success: (res) => {
        if (res.confirm) this.confirmDelete(nick)
      }
    })
  },

  confirmDelete: async function (nick) {
    const allianceId = this.data.allianceId
    try {
      util.showLoading('删除中...')
      await db.removeAllianceActivityMember(allianceId, nick)
      await this.loadData(allianceId)
      util.hideLoading()
      util.showSuccess('已删除')
    } catch (err) {
      util.hideLoading()
      console.error('删除成员失败:', err)
      util.showError(err.message || '删除失败')
    }
  },

  // 添加成员（默认进入未活跃列表）
  onAddMember: function () {
    wx.showModal({
      title: '添加成员',
      editable: true,
      placeholderText: '请输入成员游戏昵称',
      confirmText: '添加',
      success: async (res) => {
        if (!res.confirm) return
        const name = (res.content || '').trim()
        if (!name) {
          util.showInfo('请输入昵称')
          return
        }
        try {
          util.showLoading('添加中...')
          await db.addAllianceActivityMember(this.data.allianceId, name)
          await this.loadData(this.data.allianceId)
          util.hideLoading()
          util.showSuccess('已添加')
        } catch (err) {
          util.hideLoading()
          console.error('添加成员失败:', err)
          util.showError(err.message || '添加失败')
        }
      }
    })
  },

  // ============ 保存截图：8列（用户 + 本周7天） ============
  // 两遍法：先算高度再建画布，保证内容不被截断
  buildScreenshotData: function () {
    const topArea = 155
    const tableHeaderH = 76   // 两行表头（0917 / 周四）
    const rowH = 48
    const bottomMargin = 40
    const rows = (this.data.members || []).length
    const height = topArea + tableHeaderH + rows * rowH + bottomMargin
    return { height: Math.max(height, 300) }
  },

  onSaveScreenshot: async function () {
    if (!this.data.members || this.data.members.length === 0) {
      util.showInfo('暂无数据可截图')
      return
    }

    try {
      util.showLoading('正在生成截图...')

      const screenshotData = this.buildScreenshotData()
      const margin = 40
      // 加宽到 900：用户列要放得下「熔炉等级图标 + 昵称」，避免昵称被截断
      const canvasWidth = 900
      const innerWidth = canvasWidth - margin * 2   // 820
      const rowH = 48
      const tableHeaderH = 76   // 两行表头，与 buildScreenshotData 保持一致
      const topArea = 155

      const canvas = wx.createOffscreenCanvas({
        type: '2d',
        width: canvasWidth,
        height: screenshotData.height
      })
      const ctx = canvas.getContext('2d')

      // 预加载熔炉等级素材（加载失败会自动降级为程序化绘制）
      const members = this.data.members || []
      const badgeImgs = await ga.preloadBadges(canvas, members.map(m => memberSpec(m)))

      // 背景
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, canvasWidth, screenshotData.height)

      // 标题
      ctx.fillStyle = '#07C160'
      ctx.font = 'bold 36px sans-serif'
      ctx.fillText((this.data.allianceName || '联盟') + ' · 本周活跃', margin, 70)

      // 副标题：本周日期范围
      const weekDates = this.data.weekDates || []
      const rangeText = weekDates.length === 7
        ? (weekDates[0].date + ' ~ ' + weekDates[6].date)
        : ''
      ctx.fillStyle = '#999999'
      ctx.font = '26px sans-serif'
      ctx.fillText(rangeText, margin, 115)

      // 分隔线
      ctx.strokeStyle = '#E8E8E8'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(margin, 135)
      ctx.lineTo(canvasWidth - margin, 135)
      ctx.stroke()

      // 列宽：第一列「用户」较宽（要放得下熔炉等级图标 + 昵称），后 7 列均分
      const nameColW = 250
      const dayColW = Math.floor((innerWidth - nameColW) / 7)
      const colX = [margin]
      for (let i = 1; i < 8; i++) {
        colX.push(margin + nameColW + dayColW * (i - 1))
      }
      const colW = [nameColW]
      for (let i = 1; i < 8; i++) colW.push(dayColW)

      // 表头：日期列两行展示（第一行 0917，第二行 周四），避免窄列里被截断成 "091…"
      let y = topArea
      ctx.fillStyle = '#4A90D9'
      ctx.fillRect(margin, y, innerWidth, tableHeaderH)
      ctx.fillStyle = '#FFFFFF'
      ctx.textBaseline = 'middle'
      ctx.font = 'bold 24px sans-serif'
      ctx.fillText('用户', colX[0] + 8, y + tableHeaderH / 2)
      for (let i = 0; i < 7; i++) {
        const wd = weekDates[i] || {}
        const cx = colX[i + 1] + colW[i + 1] / 2
        ctx.textAlign = 'center'
        ctx.font = 'bold 24px sans-serif'
        ctx.fillText(wd.md || '', cx, y + tableHeaderH * 0.33)
        ctx.font = '20px sans-serif'
        ctx.fillText(wd.weekName || '', cx, y + tableHeaderH * 0.72)
      }
      ctx.textAlign = 'left'      // 复原，数据行按左对齐绘制
      ctx.textBaseline = 'alphabetic'
      y += tableHeaderH

      // 数据行
      const dayIndex = this.data.dayIndex || 0
      for (let r = 0; r < this.data.members.length; r++) {
        const m = this.data.members[r]

        // 斑马纹
        if (r % 2 === 1) {
          ctx.fillStyle = '#F5F5F5'
          ctx.fillRect(margin, y, innerWidth, rowH)
        }

        // 昵称：前面先画熔炉等级图标，文字起点顺延
        const nameX = colX[0] + 8
        ctx.font = '22px sans-serif'
        ctx.textBaseline = 'middle'
        const bw = ga.drawBadge(ctx, nameX, y + rowH / 2, ga.BADGE_SIZE, memberSpec(m), badgeImgs)
        ctx.fillStyle = '#333333'
        ctx.font = '22px sans-serif'
        ctx.fillText(
          truncateText(ctx, m.nickName, nameColW - 16 - bw),
          nameX + bw + (bw ? 4 : 0),
          y + rowH / 2
        )

        // 7 天状态：已过去/今天画 ✓ 或 ✗；未来日期留空
        const days = m.activeDays || []
        ctx.textAlign = 'center'
        for (let i = 0; i < 7; i++) {
          if (i > dayIndex) continue   // 未来日期不打勾打叉
          const isActive = !!days[i]
          ctx.fillStyle = isActive ? '#52C41A' : '#FF4D4F'
          ctx.font = 'bold 26px sans-serif'
          ctx.fillText(isActive ? '✓' : '✗', colX[i + 1] + dayColW / 2, y + rowH / 2)
        }
        ctx.textAlign = 'left'
        ctx.textBaseline = 'alphabetic'
        y += rowH
      }

      // 导出
      wx.canvasToTempFilePath({
        canvas: canvas,
        destWidth: canvasWidth,
        destHeight: screenshotData.height,
        success: (res) => {
          wx.saveImageToPhotosAlbum({
            filePath: res.tempFilePath,
            success: () => {
              util.hideLoading()
              util.showSuccess('截图已保存到相册')
            },
            fail: (err) => {
              util.hideLoading()
              if (err.errMsg && err.errMsg.indexOf('auth deny') !== -1) {
                wx.showModal({
                  title: '提示',
                  content: '需要您授权保存图片权限',
                  confirmText: '去授权',
                  success: (modalRes) => {
                    if (modalRes.confirm) wx.openSetting()
                  }
                })
              } else {
                // 保存失败降级为预览，用户可长按保存
                wx.previewImage({ urls: [res.tempFilePath] })
              }
            }
          })
        },
        fail: (err) => {
          util.hideLoading()
          console.error('生成图片失败:', err)
          util.showError('生成图片失败')
        }
      })
    } catch (err) {
      util.hideLoading()
      console.error('截图失败:', err)
      util.showError('截图失败')
    }
  }
})
