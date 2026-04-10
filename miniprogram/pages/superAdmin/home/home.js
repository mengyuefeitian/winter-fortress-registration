// pages/superAdmin/home/home.js
const app = getApp()
const util = require('../../utils/util')
const db = require('../../utils/db')

Page({
  data: {
    pendingCount: 0,
    totalZones: 0,
    totalAlliances: 0,
    totalRegistrations: 0,
    totalAdmins: 0
  },

  onLoad: function () {
    this.loadOverviewData()
  },

  onShow: function () {
    this.loadOverviewData()
  },

  // 加载概览数据
  loadOverviewData: async function () {
    try {
      util.showLoading('加载数据...')

      const wxdb = wx.cloud.database()

      // 获取待审核数量
      const pendingRes = await wxdb.collection('admins').where({
        status: 'pending'
      }).count()
      this.setData({ pendingCount: pendingRes.total })

      // 获取分区总数
      const zonesRes = await wxdb.collection('zones').where({
        status: 'active'
      }).count()
      this.setData({ totalZones: zonesRes.total })

      // 获取联盟总数
      const alliancesRes = await wxdb.collection('alliances').count()
      this.setData({ totalAlliances: alliancesRes.total })

      // 获取报名总数
      const registrationsRes = await wxdb.collection('registrations').where({
        status: 'active'
      }).count()
      this.setData({ totalRegistrations: registrationsRes.total })

      // 获取管理员数量
      const adminsRes = await wxdb.collection('users').where({
        role: 'admin'
      }).count()
      this.setData({ totalAdmins: adminsRes.total })

      util.hideLoading()

    } catch (err) {
      util.hideLoading()
      util.showError('加载数据失败')
    }
  },

  // 跳转到管理员审核
  goToAdminReview: function () {
    wx.navigateTo({
      url: '/pages/superAdmin/admin-review/admin-review'
    })
  },

  // 跳转到全局统计
  goToAllStats: function () {
    wx.navigateTo({
      url: '/pages/superAdmin/all-statistics/all-statistics'
    })
  },

  // 跳转到手机号管理
  goToPhoneManage: function () {
    wx.navigateTo({
      url: '/pages/superAdmin/phone-manage/phone-manage'
    })
  },

  // 跳转到联盟管理
  goToAllianceManage: function () {
    wx.navigateTo({
      url: '/pages/superAdmin/alliance-manage/alliance-manage'
    })
  }
})