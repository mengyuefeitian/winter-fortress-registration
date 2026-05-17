const app = getApp()
const util = require('../../../utils/util')
const auth = require('../../../utils/auth')
const db = require('../../../utils/db')

Page({
  data: {
    userInfo: null,
    roleDisplayName: '',
    zones: [],
    selectedZone: null
  },

  onLoad: function () {
    this.waitForRoleReady()
  },

  onShow: function () {
    if (app.globalData.roleReady) {
      this.checkPermission()
    }
  },

  // 等待角色就绪
  waitForRoleReady: function () {
    if (app.globalData.roleReady) {
      this.checkPermission()
    } else {
      setTimeout(() => {
        this.waitForRoleReady()
      }, 100)
    }
  },

  // 检查权限
  checkPermission: function () {
    const role = app.globalData.role || 'user'
    if (!auth.isAdminOrAbove(role)) {
      util.showError('权限不足')
      wx.switchTab({
        url: '/pages/index/index'
      })
      return
    }
    this.loadUserInfo()
    this.setData({
      roleDisplayName: auth.getRoleDisplayName(role)
    })
    this.loadZones()
  },

  loadUserInfo: function () {
    const userInfo = app.globalData.userInfo
    this.setData({
      userInfo: userInfo
    })
  },

  // 加载分区列表
  loadZones: async function () {
    try {
      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid
      const role = app.globalData.role || 'user'

      let zones
      if (role === 'superAdmin') {
        zones = await db.getAllZones()
      } else {
        zones = await db.getZonesByCreator(userId)
      }

      if (zones && zones.length > 0) {
        // 从全局数据或本地存储读取当前分区
        let selectedZone = zones[0]

        if (app.globalData.currentZone) {
          const foundIndex = zones.findIndex(z => z._id === app.globalData.currentZone._id)
          if (foundIndex >= 0) {
            selectedZone = zones[foundIndex]
          }
        } else {
          const lastZoneId = wx.getStorageSync('lastZoneId')
          if (lastZoneId) {
            const foundIndex = zones.findIndex(z => z._id === lastZoneId)
            if (foundIndex >= 0) {
              selectedZone = zones[foundIndex]
            }
          }
        }

        // 回退到第一个分区时同步状态
        if (selectedZone._id !== (app.globalData.currentZone && app.globalData.currentZone._id)) {
          app.globalData.currentZone = selectedZone
          wx.setStorageSync('lastZoneId', selectedZone._id)
        }

        this.setData({
          zones: zones,
          selectedZone: selectedZone
        })
      } else {
        this.setData({
          zones: [],
          selectedZone: null
        })
      }
    } catch (err) {
      console.error('加载分区失败:', err)
    }
  },

  // 分区选择变化（由组件内部处理全局状态同步）
  onZoneChange: function (e) {
    const selectedZone = e.detail.zone
    if (selectedZone) {
      this.setData({
        selectedZone: selectedZone
      })
    }
  },

  goToAllianceConfig: function () {
    wx.navigateTo({
      url: '/pages/admin/alliance-config/alliance-config'
    })
  },

  goToArsenalConfig: function () {
    wx.navigateTo({
      url: '/pages/auditor/arsenal-config/arsenal-config'
    })
  },

  goToTimeSlotConfig: function () {
    wx.navigateTo({
      url: '/pages/admin/time-slot-config/time-slot-config'
    })
  },

  goToStatistics: function () {
    wx.navigateTo({
      url: '/pages/admin/statistics/statistics'
    })
  },

  goToPositionManage: function () {
    wx.navigateTo({
      url: '/pages/admin/position-manage/position-manage'
    })
  },

  goToReviewManager: function () {
    wx.navigateTo({
      url: '/pages/superAdmin/admin-review/admin-review?applyType=allianceManager'
    })
  },

  goToMemberManage: function () {
    wx.navigateTo({
      url: '/pages/admin/member-manage/member-manage'
    })
  },

  goToClearData: async function () {
    // 先加载分区
    if (!this.data.selectedZone && this.data.zones.length === 0) {
      await this.loadZones()
    }

    if (!this.data.selectedZone) {
      util.showInfo('您还没有管理任何分区')
      return
    }

    const zoneName = this.data.selectedZone.zoneName

    wx.showModal({
      title: '确认清空',
      content: `确定要清空分区「${zoneName}」的过期报名数据吗？此操作不可恢复！`,
      confirmColor: '#e94560',
      success: async (res) => {
        if (res.confirm) {
          try {
            util.showLoading('正在清空...')
            const result = await wx.cloud.callFunction({
              name: 'clearRegistrations',
              data: {
                action: 'clearExpiredByZone',
                data: { zoneId: this.data.selectedZone._id }
              }
            })
            util.hideLoading()
            if (result.result.err) {
              util.showError('清空失败: ' + result.result.err)
            } else {
              util.showSuccess(result.result.message || '清空成功')
            }
          } catch (err) {
            util.hideLoading()
            util.showError('清空失败: ' + err.message)
          }
        }
      }
    })
  },

  // 分享
  onShareAppMessage: function () {
    return {
      title: '区管控制台 - 无尽冬日堡垒分配',
      path: '/pages/index/index'
    }
  }
})