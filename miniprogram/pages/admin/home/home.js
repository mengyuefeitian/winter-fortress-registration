const app = getApp()
const util = require('../../../utils/util')
const auth = require('../../../utils/auth')
const db = require('../../../utils/db')

Page({
  data: {
    userInfo: null,
    roleDisplayName: '',
    zones: [],
    // 页面已不再展示分区（切换统一在首页）；仍加载是因为清空数据、联盟活跃等操作要用 zoneId
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
  // 分区切换统一在首页，这里只解析「当前分区」用于展示与跳转。
  // db.getAllZones / getZonesByCreator 内部走缓存，命中即返回，不再每次等云端。
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

  // 注：本页不再提供分区切换（统一在首页），故原 onZoneChange 已移除。
  //     若将来要恢复页内切区，必须同时同步 globalData.currentZone + lastZoneId，
  //     并调 app.markAllianceActive(true) 重新解析联盟归属。

  goToAllianceConfig: function () {
    wx.navigateTo({
      url: '/pages/admin/alliance-config/alliance-config'
    })
  },

  goToArsenalConfig: function () {
    wx.navigateTo({
      url: '/pages/admin/arsenal-config/arsenal-config'
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

  // 联盟活跃：查看当前分区下各联盟本周活跃（8列总览）
  goToAllianceActivity: function () {
    const zone = this.data.selectedZone || app.globalData.currentZone
    if (!zone) {
      util.showInfo('请先在首页选择分区')
      return
    }
    wx.navigateTo({
      url: '/pages/admin/alliance-activity/alliance-activity?zoneId=' + zone._id
    })
  },

  goToPositionManage: function () {
    wx.navigateTo({
      url: '/pages/admin/position-manage/position-manage'
    })
  },

  // 盟管审核：带 scope=zone —— 区管控制台只审「本分区」的盟管申请
  // （超管从自己的控制台进入时不带该参数，看到的是全部分区）
  goToReviewManager: function () {
    const zoneId = (this.data.selectedZone && this.data.selectedZone._id) ||
      (app.globalData.currentZone && app.globalData.currentZone._id) ||
      wx.getStorageSync('lastZoneId') || ''
    wx.navigateTo({
      url: '/pages/superAdmin/admin-review/admin-review?applyType=allianceManager&scope=zone&zoneId=' + zoneId
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