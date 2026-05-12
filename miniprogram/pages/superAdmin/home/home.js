const app = getApp()
const util = require('../../../utils/util')
const auth = require('../../../utils/auth')
const db = require('../../../utils/db')

Page({
  data: {
    userInfo: null,
    roleDisplayName: '',
    pendingZoneManagerCount: 0,
    pendingAllianceManagerCount: 0,
    pendingZoneCreationCount: 0
  },

  onLoad: function () {
    this.waitForRoleReady()
  },

  onShow: function () {
    if (app.globalData.roleReady) {
      this.loadUserInfo()
      this.loadPendingCounts()
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
    if (!auth.isSuperAdmin(role)) {
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
    this.loadPendingCounts()
  },

  loadUserInfo: function () {
    const userInfo = app.globalData.userInfo
    this.setData({
      userInfo: userInfo
    })
  },

  loadPendingCounts: async function () {
    try {
      // 分别获取区管和盟管的待审核数量
      const zoneManagerCount = await this.getPendingCountByType('zoneManager')
      const allianceManagerCount = await this.getPendingCountByType('allianceManager')
      const zoneCreationCount = await this.getPendingCountByType('zoneCreation')

      this.setData({
        pendingZoneManagerCount: zoneManagerCount,
        pendingAllianceManagerCount: allianceManagerCount,
        pendingZoneCreationCount: zoneCreationCount
      })
    } catch (err) {
      console.error('加载待审核数量失败:', err)
    }
  },

  getPendingCountByType: async function (applyType) {
    try {
      const wxdb = wx.cloud.database()
      const res = await wxdb.collection('admins')
        .where({
          status: 'pending',
          applyType: applyType
        })
        .count()
      return res.total
    } catch (err) {
      console.error('获取待审核数量失败:', err)
      return 0
    }
  },

  goToZoneManage: function () {
    wx.navigateTo({
      url: '/pages/admin/zone-manage/zone-manage'
    })
  },

  goToAdminReview: function () {
    wx.navigateTo({
      url: '/pages/superAdmin/admin-review/admin-review?applyType=zoneManager'
    })
  },

  goToAllianceManagerReview: function () {
    wx.navigateTo({
      url: '/pages/superAdmin/admin-review/admin-review?applyType=allianceManager'
    })
  },

  goToZoneCreationReview: function () {
    wx.navigateTo({
      url: '/pages/superAdmin/admin-review/admin-review?applyType=zoneCreation'
    })
  },

  goToPhoneManage: function () {
    wx.navigateTo({
      url: '/pages/superAdmin/phone-manage/phone-manage'
    })
  },

  goToMemberManage: function () {
    wx.navigateTo({
      url: '/pages/superAdmin/member-manage/member-manage'
    })
  },

  goToAllStats: function () {
    wx.navigateTo({
      url: '/pages/superAdmin/all-statistics/all-statistics'
    })
  },

  goToAllianceManage: function () {
    wx.navigateTo({
      url: '/pages/superAdmin/alliance-manage/alliance-manage'
    })
  },

  goToPositionManage: function () {
    wx.navigateTo({
      url: '/pages/admin/position-manage/position-manage'
    })
  },

  goToTimeSlotConfig: function () {
    wx.navigateTo({
      url: '/pages/admin/time-slot-config/time-slot-config'
    })
  },

  goToAutoClear: function () {
    wx.navigateTo({
      url: '/pages/superAdmin/auto-clear/auto-clear'
    })
  },

  goToBattleConfig: function () {
    wx.navigateTo({
      url: '/pages/user/battle-list/battle-list'
    })
  },

  goToUserIdentity: function () {
    wx.navigateTo({
      url: '/pages/superAdmin/user-identity/user-identity'
    })
  },

  // 分享
  onShareAppMessage: function () {
    return {
      title: '无尽冬日堡垒分配管理系统',
      path: '/pages/index/index'
    }
  }
})