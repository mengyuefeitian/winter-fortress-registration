// pages/user/bear-pit-register/bear-pit-register.js
// 熊坑报名：联盟 / 昵称 / 地心探险等级 + 二选一（按战力排 · 邻居）
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')
const ga = require('../../../utils/gameAccount')
const layout = require('../../../utils/bearPitLayout')

Page({
  data: {
    selectedZone: null,
    alliances: [],
    allianceIndex: -1,
    selectedAlliance: null,

    accountList: [],
    nickName: '',
    accountSelectedId: '',
    dixin: '',

    mode: 'power',
    neighborList: [],
    neighborNick: '',
    canNeighbor: false,

    memberCount: 0,
    seatTotal: layout.TOTAL_SEATS,
    submitting: false
  },

  onLoad: function (options) {
    this._pendingAllianceId = (options && options.allianceId) || ''
    this._boardMembers = []
  },

  onShow: function () {
    this.waitForRoleReady()
  },

  waitForRoleReady: function () {
    if (app.globalData.roleReady) {
      this.init()
    } else {
      setTimeout(() => this.waitForRoleReady(), 100)
    }
  },

  init: async function () {
    const zone = app.globalData.currentZone
    if (!zone) {
      util.showInfo('请先在首页选择分区')
      setTimeout(() => wx.navigateBack(), 800)
      return
    }
    this.setData({ selectedZone: zone })
    this.loadAccounts()
    await this.loadAlliances(zone._id)
  },

  loadAccounts: function () {
    ga.list().then(list => {
      const accounts = list || []
      const patch = { accountList: accounts }
      const main = accounts.filter(a => a.isMain)[0]
      if (main) {
        patch.nickName = main.gameNickName
        patch.accountSelectedId = main._id
        patch.dixin = (main.dixin === null || main.dixin === undefined) ? '' : String(main.dixin)
      } else {
        const u = app.globalData.userInfo
        if (u && u.nickName) patch.nickName = u.nickName
      }
      this.setData(patch, () => {
        this.buildNeighborList()
      })
    }).catch(() => { })
  },

  loadAlliances: async function (zoneId) {
    try {
      const alliances = await db.getAlliancesByZone(zoneId)
      if (!alliances.length) {
        this.setData({ alliances: [], selectedAlliance: null, allianceIndex: -1 })
        return
      }
      let index = -1
      if (this._pendingAllianceId) {
        index = alliances.findIndex(a => a._id === this._pendingAllianceId)
      }
      if (index < 0) {
        const lastId = wx.getStorageSync('lastAllianceId') || ''
        index = lastId ? alliances.findIndex(a => a._id === lastId) : -1
      }
      if (index < 0) index = 0
      this.setData({
        alliances: alliances,
        allianceIndex: index,
        selectedAlliance: alliances[index]
      })
      await this.loadBoard(alliances[index]._id)
    } catch (err) {
      console.error('加载联盟失败:', err)
    }
  },

  onAllianceChange: function (e) {
    const index = e.detail.value
    const alliance = this.data.alliances[index]
    if (!alliance) return
    wx.setStorageSync('lastAllianceId', alliance._id)
    this.setData({ allianceIndex: index, selectedAlliance: alliance, neighborNick: '' }, () => {
      this.loadBoard(alliance._id)
    })
  },

  loadBoard: async function (allianceId) {
    try {
      const board = await db.getBearPitBoard(allianceId)
      this._boardMembers = board.members || []
      this.setData({
        memberCount: this._boardMembers.length,
        seatTotal: board.seatTotal || layout.TOTAL_SEATS
      }, () => this.buildNeighborList())
    } catch (err) {
      console.error('加载熊坑看板失败:', err)
      this._boardMembers = []
      this.setData({ memberCount: 0 })
      this.buildNeighborList()
    }
  },

  // 可选邻居：本联盟已报名的人（排除自己）；已被别人选为邻居的置灰不可选
  buildNeighborList: function () {
    const me = layout.nickKey(this.data.nickName)
    const members = this._boardMembers || []
    const takenMap = {}
    members.forEach(m => {
      const tk = layout.nickKey(m.neighborNick)
      const owner = layout.nickKey(m.nickName)
      if (tk && owner !== me) takenMap[tk] = true
    })
    const list = members
      .filter(m => layout.nickKey(m.nickName) !== me)
      .map(m => ({
        nickName: m.nickName,
        dixinText: (m.dixin === null || m.dixin === undefined || m.dixin === '') ? '地心 —' : '地心 ' + m.dixin,
        taken: !!takenMap[layout.nickKey(m.nickName)]
      }))
    const canNeighbor = list.filter(x => !x.taken).length > 0
    const patch = { neighborList: list, canNeighbor: canNeighbor }
    if (this.data.neighborNick && !list.filter(x => x.nickName === this.data.neighborNick && !x.taken).length) {
      patch.neighborNick = ''
    }
    if (!canNeighbor && this.data.mode === 'neighbor') patch.mode = 'power'
    this.setData(patch)
  },

  // 昵称选择器：切换账号时同步带出该账号的地心等级
  onAccountChange: function (e) {
    const nickName = e.detail.nickName
    const selectedId = e.detail.selectedId
    const account = ga.pickAccount(this.data.accountList, selectedId, nickName)
    const patch = { nickName: nickName, accountSelectedId: selectedId }
    if (account && account.dixin !== null && account.dixin !== undefined && account.dixin !== '') {
      patch.dixin = String(account.dixin)
    }
    this.setData(patch, () => this.buildNeighborList())
  },

  onDixinInput: function (e) {
    this.setData({ dixin: String(e.detail.value || '').replace(/[^0-9]/g, '') })
  },

  selectMode: function (e) {
    const mode = e.currentTarget.dataset.mode
    if (mode === 'neighbor' && !this.data.canNeighbor) {
      util.showInfo('还没有其他已报名的人，先按战力排吧')
      return
    }
    this.setData({ mode: mode })
  },

  pickNeighbor: function (e) {
    const item = this.data.neighborList[e.currentTarget.dataset.index]
    if (!item) return
    if (item.taken) {
      util.showInfo('「' + item.nickName + '」已经被别人选为邻居了')
      return
    }
    this.setData({ neighborNick: this.data.neighborNick === item.nickName ? '' : item.nickName })
  },

  clearNeighbor: function () {
    this.setData({ neighborNick: '' })
  },

  submit: async function () {
    if (this.data.submitting) return
    const nickName = layout.nickKey(this.data.nickName)
    if (!nickName) {
      util.showInfo('请选择或输入昵称')
      return
    }
    if (!this.data.selectedAlliance) {
      util.showInfo('请选择联盟')
      return
    }
    if (this.data.mode === 'neighbor' && !this.data.neighborNick) {
      util.showInfo('请选择一位邻居，或改选「按战力排」')
      return
    }

    this.setData({ submitting: true })
    util.showLoading('正在报名…')
    try {
      const zoneId = this.data.selectedZone ? this.data.selectedZone._id : ''
      const allianceId = this.data.selectedAlliance._id
      await db.bearPitRegister({
        zoneId: zoneId,
        allianceId: allianceId,
        nickName: nickName,
        accountId: this.data.accountSelectedId || '',
        dixin: this.data.dixin === '' ? null : this.data.dixin,
        mode: this.data.mode,
        neighborNick: this.data.mode === 'neighbor' ? this.data.neighborNick : ''
      })

      // 回写报名时填的地心等级到该游戏账号（改了等级要重新报名才会重排座位）
      ga.syncFromRegistration({
        gameNickName: nickName,
        dixin: this.data.dixin === '' ? null : this.data.dixin
      }).catch(() => { })

      // 顺带登记联盟归属与今日活跃，失败不影响报名结果
      db.joinAllianceByRegistration(allianceId, zoneId, nickName).then(() => {
        app.markAllianceActive(true)
      }).catch(err => console.warn('[联盟活跃] 归属记录失败(已忽略):', err))

      util.hideLoading()
      util.showSuccess('报名成功')
      setTimeout(() => wx.navigateBack(), 700)
    } catch (err) {
      util.hideLoading()
      util.showError(err.message || '报名失败')
    } finally {
      this.setData({ submitting: false })
    }
  }
})
