// pages/user/bear-pit/bear-pit.js
// 熊坑主页：标题 / 已报名人数 / 报名按钮 / 分布图缩略图 / 报名人员表格
//
// 一个联盟一张图（看板文档 bearPitBoards），页面顶部可切换联盟。
// 座位几何与排位规则见 utils/bearPitLayout.js；绘制见 utils/bearPitDraw.js。
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')
const draw = require('../../../utils/bearPitDraw')
const layout = require('../../../utils/bearPitLayout')
const shareEntry = require('../../../utils/shareEntry')

const MANAGE_ROLES = ['auditor', 'admin', 'superAdmin']

Page({
  data: {
    isLoggedIn: false,
    loading: true,
    selectedZone: null,
    alliances: [],
    allianceIndex: -1,
    selectedAlliance: null,
    members: [],
    tableList: [],
    memberCount: 0,
    // 图上位置总数（140，含 16 个旗子位）——只用于绘制与说明
    seatTotal: layout.TOTAL_SLOTS,
    // 可报名人数上限（100）——用户口径「140 座但只排 100 人」
    capacity: layout.MAX_MEMBERS,
    seatsFull: false,
    canManage: false,
    thumbMode: 'nick'
  },

  onLoad: function (options) {
    if (options && options.zoneId) {
      this._pendingZoneId = options.zoneId
      this._sharedZoneId = options.zoneId
    }
    this._entryChecked = false
    this._thumbReady = false
  },

  onShow: function () {
    this.waitForRoleReady()
  },

  waitForRoleReady: function () {
    if (app.globalData.roleReady) {
      this.checkLoginAndLoadData()
    } else {
      setTimeout(() => this.waitForRoleReady(), 100)
    }
  },

  checkLoginAndLoadData: async function () {
    if (!this._entryChecked && this._sharedZoneId) {
      this._entryChecked = true
      const pass = await shareEntry.checkSharedEntry(this, this._sharedZoneId)
      if (!pass) return
    }

    const userInfo = app.globalData.userInfo
    const role = app.globalData.role || 'user'
    this.setData({
      isLoggedIn: !!(userInfo && userInfo.nickName),
      canManage: MANAGE_ROLES.indexOf(role) >= 0
    })

    const zone = app.globalData.currentZone
    if (zone) {
      this.setData({ selectedZone: zone })
      await this.loadAlliances(zone._id)
    } else {
      this.setData({ loading: false })
    }
  },

  // 联盟列表 + 默认选中「上次用的联盟」
  loadAlliances: async function (zoneId) {
    try {
      const alliances = await db.getAlliancesByZone(zoneId)
      if (!alliances.length) {
        this.setData({ alliances: [], selectedAlliance: null, allianceIndex: -1, loading: false, members: [], tableList: [], memberCount: 0 })
        return
      }
      const lastId = wx.getStorageSync('lastAllianceId') || ''
      let index = lastId ? alliances.findIndex(a => a._id === lastId) : -1
      if (index < 0) index = 0
      this.setData({
        alliances: alliances,
        allianceIndex: index,
        selectedAlliance: alliances[index],
        loading: true
      })
      await this.loadBoard(alliances[index]._id)
    } catch (err) {
      console.error('加载联盟失败:', err)
      this.setData({ loading: false })
    }
  },

  onAllianceChange: function (e) {
    const index = e.detail.value
    const alliance = this.data.alliances[index]
    if (!alliance) return
    wx.setStorageSync('lastAllianceId', alliance._id)
    this.setData({ allianceIndex: index, selectedAlliance: alliance, loading: true }, () => {
      this.loadBoard(alliance._id)
    })
  },

  // 拉看板：members 已由云函数按「地心降序 → 顺延外圈」重排好，seatIndex 即座位号
  loadBoard: async function (allianceId) {
    try {
      const board = await db.getBearPitBoard(allianceId)
      const members = (board.members || []).slice().sort((a, b) => (a.seatIndex || 999) - (b.seatIndex || 999))
      const tableList = members.slice().sort((a, b) => {
        const da = layout.dixinOf(a)
        const dbv = layout.dixinOf(b)
        if (da !== dbv) return dbv - da
        return (a.createTime || 0) - (b.createTime || 0)
      }).map(m => Object.assign({}, m, {
        dixinText: (m.dixin === null || m.dixin === undefined || m.dixin === '') ? '—' : String(m.dixin)
      }))

      this.setData({
        members: members,
        tableList: tableList,
        memberCount: members.length,
        seatTotal: board.seatTotal || layout.TOTAL_SLOTS,
        capacity: board.maxMembers || layout.MAX_MEMBERS,
        seatsFull: members.length >= (board.maxMembers || layout.MAX_MEMBERS),
        loading: false
      }, () => {
        this.renderThumb()
      })
    } catch (err) {
      console.error('加载熊坑看板失败:', err)
      this.setData({ loading: false })
      util.showError(err.message || '加载失败')
    }
  },

  // 缩略图：canvas 2d 绘制（与地图大图同一套绘制逻辑）
  renderThumb: function () {
    const query = wx.createSelectorQuery().in(this)
    query.select('#bearPitThumb').fields({ node: true, size: true }).exec(res => {
      const info = res && res[0]
      if (!info || !info.node) return
      const canvas = info.node
      const ctx = canvas.getContext('2d')
      let dpr = 2
      try {
        const w = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
        dpr = Math.min(w.pixelRatio || 2, 3)
      } catch (e) { /* 用默认值 */ }
      const width = info.width
      const height = info.height
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      draw.drawPit(ctx, {
        width: width,
        height: height,
        dpr: dpr,
        mode: this.data.thumbMode,
        members: this.data.members,
        seatTotal: this.data.seatTotal,
        maxMembers: this.data.capacity
      })
    })
  },

  switchThumbMode: function (e) {
    const mode = e.currentTarget.dataset.mode
    if (mode === this.data.thumbMode) return
    this.setData({ thumbMode: mode }, () => this.renderThumb())
  },

  // 查看大图（可缩放 / 保存到相册）
  openMap: function () {
    if (!this.data.selectedAlliance) {
      util.showInfo('请先选择联盟')
      return
    }
    wx.navigateTo({
      url: '/pages/user/bear-pit-map/bear-pit-map?allianceId=' + this.data.selectedAlliance._id
    })
  },

  // 去报名
  goRegister: function () {
    if (!this.data.isLoggedIn) {
      wx.showModal({
        title: '提示',
        content: '请先登录后再报名',
        confirmText: '去登录',
        success: (res) => { if (res.confirm) wx.navigateTo({ url: '/pages/login/login' }) }
      })
      return
    }
    if (!this.data.selectedZone) {
      util.showInfo('请先在首页选择分区')
      return
    }
    if (!this.data.selectedAlliance) {
      util.showInfo('请先选择联盟')
      return
    }
    if (this.data.seatsFull) {
      util.showInfo('熊坑座位已满，无法新增报名')
      return
    }
    wx.navigateTo({
      url: '/pages/user/bear-pit-register/bear-pit-register?allianceId=' + this.data.selectedAlliance._id
    })
  },

  // 管理员删除（盟管 / 区管 / 超管）：删除后云函数会整体重排，并把失效的邻居重置为「无邻居」
  removeMember: function (e) {
    const item = this.data.tableList[e.currentTarget.dataset.index]
    if (!item) return
    wx.showModal({
      title: '删除报名',
      content: '确定把「' + item.nickName + '」从熊坑报名中删除？删除后其余人的座位会重新排列。',
      confirmText: '删除',
      confirmColor: '#e94560',
      success: async (res) => {
        if (!res.confirm) return
        util.showLoading('正在删除…')
        try {
          await db.bearPitRemove({ allianceId: this.data.selectedAlliance._id, regId: item.regId })
          util.hideLoading()
          util.showSuccess('已删除')
          this.loadBoard(this.data.selectedAlliance._id)
        } catch (err) {
          util.hideLoading()
          util.showError(err.message || '删除失败')
        }
      }
    })
  },

  onShareAppMessage: function () {
    const zone = this.data.selectedZone || app.globalData.currentZone
    const path = zone
      ? '/pages/user/bear-pit/bear-pit?zoneId=' + zone._id
      : '/pages/user/bear-pit/bear-pit'
    return {
      title: zone ? '熊坑报名 - ' + zone.zoneName : '熊坑报名 - 无尽冬日',
      path: path
    }
  }
})
