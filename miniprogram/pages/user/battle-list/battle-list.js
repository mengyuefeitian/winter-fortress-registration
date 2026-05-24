// pages/user/battle-list/battle-list.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')
const auth = require('../../../utils/auth')

Page({
  data: {
    configs: [],
    selectedConfig: null,
    loading: false,
    isSuperAdmin: false,
    canCreate: false,
    selectedDate: '',
    currentZone: null,
    zones: [],
    showTip: false
  },

  onLoad: function () {
    this.waitForRoleReady()
  },

  onShow: function () {
    if (app.globalData.roleReady) {
      this.loadConfigs()
    }
  },

  waitForRoleReady: function () {
    if (app.globalData.roleReady) {
      this.loadConfigs()
    } else {
      setTimeout(() => {
        this.waitForRoleReady()
      }, 100)
    }
  },

  // 切换提示信息显示
  toggleTip: function () {
    this.setData({ showTip: !this.data.showTip })
  },

  loadConfigs: async function () {
    try {
      this.setData({ loading: true })
      const role = app.globalData.role || 'user'
      const isSuperAdmin = role === 'superAdmin'
      const canCreate = isSuperAdmin || role === 'admin'

      // 所有用户（包括区管）都应该能选择所有分区来报名国战
      // 区管的"创建配置"权限不应限制分区选择
      const zones = await db.getAllZones()

      let currentZone = zones.length > 0 ? zones[0] : null
      if (app.globalData.currentZone) {
        const foundIndex = zones.findIndex(z => z._id === app.globalData.currentZone._id)
        if (foundIndex >= 0) {
          currentZone = zones[foundIndex]
        }
      } else {
        // 尝试从本地存储恢复上次选择的分区
        const lastZoneId = wx.getStorageSync('lastZoneId')
        if (lastZoneId) {
          const foundIndex = zones.findIndex(z => z._id === lastZoneId)
          if (foundIndex >= 0) {
            currentZone = zones[foundIndex]
            app.globalData.currentZone = currentZone
          }
        }
      }

      let configs
      if (currentZone) {
        configs = await db.getBattleConfigs(currentZone._id)
        configs = configs.map(c => ({ ...c, zoneName: currentZone.zoneName }))
      } else {
        configs = []
      }

      this.setData({
        configs: configs || [],
        isSuperAdmin,
        canCreate,
        selectedDate: this.getDefaultDate(),
        currentZone,
        zones,
        loading: false
      })
    } catch (err) {
      console.error('加载国战配置失败:', err)
      util.showError('加载失败')
      this.setData({ loading: false })
    }
  },

  onZoneChange: function (e) {
    const zone = e.detail.zone
    if (!zone) return
    this.setData({ currentZone: zone, selectedConfig: null })
    this.loadConfigs()
  },

  onConfigSelect: function (e) {
    const configId = e.currentTarget.dataset.id
    const date = e.currentTarget.dataset.date
    const zoneName = e.currentTarget.dataset.zoneName || ''
    if (!configId) return
    this.setData({ selectedConfig: { _id: configId, date, zoneName } })
    wx.navigateTo({
      url: `/pages/user/battle-registration/battle-registration?configId=${configId}&date=${date}&zoneName=${zoneName}`
    })
  },

  onDeleteConfig: async function (e) {
    const configId = e.currentTarget.dataset.id
    const date = e.currentTarget.dataset.date

    if (!auth.isSuperAdmin(app.globalData.role)) {
      util.showError('仅超级管理员可删除')
      return
    }

    const confirm = await util.showConfirm('确认删除', `确定要删除 ${date} 的国战配置吗？所有相关报名记录也会被删除，此操作不可恢复。`)
    if (!confirm) return

    try {
      util.showLoading('正在删除...')
      await db.deleteBattleConfig(configId)
      util.hideLoading()
      util.showSuccess('删除成功')
      this.loadConfigs()
    } catch (err) {
      util.hideLoading()
      console.error('删除失败:', err)
      util.showError('删除失败')
    }
  },

  onStatistics: function () {
    if (!this.data.selectedConfig) {
      util.showInfo('请先选择一个日期的国战')
      return
    }
    wx.navigateTo({
      url: `/pages/user/battle-statistics/battle-statistics?configId=${this.data.selectedConfig._id}&date=${this.data.selectedConfig.date}`
    })
  },

  onAllocation: function () {
    if (!this.data.selectedConfig) {
      util.showInfo('请先选择一个日期的国战')
      return
    }
    wx.navigateTo({
      url: `/pages/user/battle-allocation/battle-allocation?configId=${this.data.selectedConfig._id}&date=${this.data.selectedConfig.date}`
    })
  },

  getDefaultDate: function () {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  onDateChange: function (e) {
    this.setData({ selectedDate: e.detail.value })
  },

  onShareAppMessage: function () {
    const { currentZone } = this.data
    const title = currentZone
      ? `国战报名 · ${currentZone.zoneName}`
      : '国战报名 - 无尽冬日'
    return {
      title: title,
      path: '/pages/user/battle-list/battle-list'
    }
  },

  onCreateConfig: async function () {
    try {
      const userId = app.globalData.openid
      const zone = this.data.currentZone

      if (!zone) {
        util.showInfo('请先选择分区')
        return
      }

      util.showLoading('正在创建...')

      const result = await db.createBattleConfig(zone._id, zone.zoneName, this.data.selectedDate, userId)

      util.hideLoading()
      util.showSuccess('创建成功')

      // 立即将新配置添加到本地列表
      const newConfig = {
        _id: result._id,
        date: this.data.selectedDate,
        zoneName: zone.zoneName
      }
      this.setData({
        configs: [newConfig, ...this.data.configs]
      })
    } catch (err) {
      util.hideLoading()
      console.error('创建失败:', err)
      if (err.message && err.message.includes('已存在')) {
        util.showError('该日期的国战已存在')
      } else {
        util.showError('创建失败')
      }
    }
  }
})
