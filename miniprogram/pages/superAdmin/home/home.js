const app = getApp()
const util = require('../../../utils/util')

Page({
  data: {
    userInfo: null,
    pendingCount: 0
  },

  onLoad: function () {
    this.loadUserInfo()
    this.loadPendingCount()
  },

  onShow: function () {
    this.loadUserInfo()
    this.loadPendingCount()
  },

  loadUserInfo: function () {
    const userInfo = app.globalData.userInfo
    this.setData({
      userInfo: userInfo
    })
  },

  loadPendingCount: async function () {
    try {
      const wxdb = wx.cloud.database()
      const res = await wxdb.collection('admins').where({ status: 'pending' }).count()
      this.setData({
        pendingCount: res.total
      })
    } catch (err) {
      console.error('加载待审核数量失败:', err)
    }
  },

  goToZoneManage: function () {
    wx.navigateTo({
      url: '/pages/admin/zone-manage/zone-manage'
    })
  },

  goToAdminReview: function () {
    wx.navigateTo({
      url: '/pages/superAdmin/admin-review/admin-review'
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