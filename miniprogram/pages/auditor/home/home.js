// pages/auditor/home/home.js
const app = getApp()
const util = require('../../utils/util')
const db = require('../../utils/db')

Page({
  data: {
    myAlliance: null
  },

  onLoad: function () {
    this.loadMyAlliance()
  },

  onShow: function () {
    this.loadMyAlliance()
  },

  // 加载绑定的联盟
  loadMyAlliance: async function () {
    try {
      util.showLoading('加载联盟信息...')

      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

      // 查找绑定的联盟
      const wxdb = wx.cloud.database()
      const res = await wxdb.collection('alliances').where({
        auditorId: userId
      }).get()

      if (res.data.length > 0) {
        const alliance = res.data[0]

        // 获取分区信息
        const zoneRes = await wxdb.collection('zones').doc(alliance.zoneId).get()

        this.setData({
          myAlliance: {
            ...alliance,
            zoneName: zoneRes.data ? zoneRes.data.zoneName : '未知分区'
          }
        })
      } else {
        this.setData({
          myAlliance: null
        })
      }

      util.hideLoading()

    } catch (err) {
      util.hideLoading()
      util.showError('加载联盟信息失败')
    }
  },

  // 跳转到配置页面
  goToConfig: function () {
    if (!this.data.myAlliance) {
      util.showInfo('您还未绑定联盟')
      return
    }

    wx.navigateTo({
      url: '/pages/auditor/config/config?allianceId=' + this.data.myAlliance._id
    })
  },

  // 跳转到统计页面
  goToStatistics: function () {
    if (!this.data.myAlliance) {
      util.showInfo('您还未绑定联盟')
      return
    }

    wx.navigateTo({
      url: '/pages/auditor/statistics/statistics?allianceId=' + this.data.myAlliance._id
    })
  }
})