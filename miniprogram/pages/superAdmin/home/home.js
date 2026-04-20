const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')

Page({
  data: {
    userInfo: null,
    pendingZoneManagerCount: 0,
    pendingAllianceManagerCount: 0
  },

  onLoad: function () {
    this.loadUserInfo()
    this.loadPendingCounts()
  },

  onShow: function () {
    this.loadUserInfo()
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

      this.setData({
        pendingZoneManagerCount: zoneManagerCount,
        pendingAllianceManagerCount: allianceManagerCount
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

  goToPhoneManage: function () {
    wx.navigateTo({
      url: '/pages/superAdmin/phone-manage/phone-manage'
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

  goToAutoClear: function () {
    wx.navigateTo({
      url: '/pages/superAdmin/auto-clear/auto-clear'
    })
  }
})