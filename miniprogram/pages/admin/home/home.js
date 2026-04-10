// pages/admin/home/home.js
const app = getApp()
const util = require('../../utils/util')
const db = require('../../utils/db')

Page({
  data: {
    myZones: [],
    totalAlliances: 0,
    totalRegistrations: 0,
    timeSlotsCount: 0
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

      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

      // 获取我的分区
      const myZones = await db.getZonesByCreator(userId)

      // 计算统计数据
      let totalAlliances = 0
      let totalRegistrations = 0
      let timeSlotsCount = 0

      for (const zone of myZones) {
        const alliances = await db.getAlliancesByZone(zone._id)
        totalAlliances += alliances.length

        for (const alliance of alliances) {
          const timeSlots = await db.getTimeSlotsByAlliance(alliance._id)
          timeSlotsCount += timeSlots.length

          for (const slot of timeSlots) {
            const count = await db.getRegistrationCount(slot._id)
            totalRegistrations += count
          }
        }
      }

      this.setData({
        myZones: myZones,
        totalAlliances: totalAlliances,
        totalRegistrations: totalRegistrations,
        timeSlotsCount: timeSlotsCount
      })

      util.hideLoading()

    } catch (err) {
      util.hideLoading()
      util.showError('加载数据失败')
    }
  },

  // 跳转到分区管理
  goToZoneManage: function () {
    wx.navigateTo({
      url: '/pages/admin/zone-manage/zone-manage'
    })
  },

  // 跳转到联盟配置
  goToAllianceConfig: function () {
    wx.navigateTo({
      url: '/pages/admin/alliance-config/alliance-config'
    })
  },

  // 跳转到时间段配置
  goToTimeSlotConfig: function () {
    wx.navigateTo({
      url: '/pages/admin/time-slot-config/time-slot-config'
    })
  },

  // 跳转到数据统计
  goToStatistics: function () {
    wx.navigateTo({
      url: '/pages/admin/statistics/statistics'
    })
  }
})