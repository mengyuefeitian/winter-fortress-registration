const app = getApp()
const util = require('../../../utils/util')

Page({
  data: {
    userInfo: null
  },

  onLoad: function () {
    this.loadUserInfo()
  },

  onShow: function () {
    this.loadUserInfo()
  },

  loadUserInfo: function () {
    const userInfo = app.globalData.userInfo
    this.setData({
      userInfo: userInfo
    })
  },

  goToAllianceConfig: function () {
    wx.navigateTo({
      url: '/pages/admin/alliance-config/alliance-config'
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
      url: '/pages/admin/auditor-review/auditor-review'
    })
  },

  goToClearData: function () {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空所有报名数据吗？此操作不可恢复！',
      confirmColor: '#e94560',
      success: async (res) => {
        if (res.confirm) {
          try {
            util.showLoading('正在清空...')
            await wx.cloud.callFunction({
              name: 'clearRegistrations',
              data: { clearAll: true }
            })
            util.hideLoading()
            util.showSuccess('清空成功')
          } catch (err) {
            util.hideLoading()
            util.showError('清空失败')
          }
        }
      }
    })
  }
})