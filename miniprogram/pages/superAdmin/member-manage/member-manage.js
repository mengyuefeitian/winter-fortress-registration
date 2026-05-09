const app = getApp()
const util = require('../../../utils/util')
const auth = require('../../../utils/auth')
const db = require('../../../utils/db')

Page({
  data: {
    zones: [],
    selectedZone: null,
    auditors: [],
    admins: []
  },

  onLoad: function () {
    this.waitForRoleReady()
  },

  onShow: function () {
    if (app.globalData.roleReady && this.data.selectedZone) {
      this.loadMembers(this.data.selectedZone._id)
    }
  },

  waitForRoleReady: function () {
    if (app.globalData.roleReady) {
      this.checkPermission()
    } else {
      setTimeout(() => { this.waitForRoleReady() }, 100)
    }
  },

  checkPermission: function () {
    const role = app.globalData.role || 'user'
    if (!auth.isSuperAdmin(role)) {
      util.showError('权限不足')
      wx.switchTab({ url: '/pages/index/index' })
      return
    }
    this.loadZones()
  },

  loadZones: async function () {
    try {
      const zones = await db.getAllZones()
      if (zones && zones.length > 0) {
        let selectedZone = zones[0]
        if (app.globalData.currentZone) {
          const foundIndex = zones.findIndex(z => z._id === app.globalData.currentZone._id)
          if (foundIndex >= 0) {
            selectedZone = zones[foundIndex]
          }
        }
        this.setData({ zones, selectedZone })
        this.loadMembers(selectedZone._id)
      } else {
        this.setData({ zones: [], selectedZone: null, auditors: [], admins: [] })
      }
    } catch (err) {
      console.error('加载分区失败:', err)
    }
  },
  onZoneChange: function (e) {
    const zone = e.detail.zone
    if (!zone) return
    this.setData({ selectedZone: zone })
    this.loadMembers(zone._id)
  },

  loadMembers: async function (zoneId) {
    try {
      util.showLoading('加载成员...')
      const { auditors, admins } = await db.getZoneMembers(zoneId)
      this.setData({ auditors, admins })
      util.hideLoading()
    } catch (err) {
      util.hideLoading()
      console.error('加载成员失败:', err)
      util.showError('加载成员失败')
    }
  },

  removeMember: async function (e) {
    const userId = e.currentTarget.dataset.id
    const role = e.currentTarget.dataset.role
    const index = e.currentTarget.dataset.index
    const list = role === 'auditor' ? this.data.auditors : this.data.admins
    const member = list[index]

    const confirm = await util.showConfirm('确认移除', '确定要将「' + member.nickName + '」移除吗？该用户将变为普通用户。')
    if (!confirm) return

    try {
      util.showLoading('正在移除...')
      await db.removeMember(userId, role, this.data.selectedZone._id)

      if (role === 'auditor') {
        const auditors = this.data.auditors.filter((_, i) => i !== index)
        this.setData({ auditors })
      } else {
        const admins = this.data.admins.filter((_, i) => i !== index)
        this.setData({ admins })
      }

      util.hideLoading()
      util.showSuccess('已移除')
    } catch (err) {
      util.hideLoading()
      console.error('移除失败:', err)
      util.showError('移除失败')
    }
  }
})
