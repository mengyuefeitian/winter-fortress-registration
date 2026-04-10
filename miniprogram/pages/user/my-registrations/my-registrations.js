// pages/user/my-registrations/my-registrations.js
const app = getApp()
const util = require('../../utils/util')
const db = require('../../utils/db')

Page({
  data: {
    registrations: []
  },

  onLoad: function () {
    this.loadMyRegistrations()
  },

  onShow: function () {
    this.loadMyRegistrations()
  },

  // 加载我的报名记录
  loadMyRegistrations: async function () {
    try {
      util.showLoading('加载报名记录...')

      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

      const registrations = await db.getRegistrationsByUser(userId)

      // 加载关联的分区、联盟、时间段信息
      const processedRegistrations = []
      for (const reg of registrations) {
        // 获取分区信息
        const zone = await this.getZoneById(reg.zoneId)

        // 获取联盟信息
        const alliance = await this.getAllianceById(reg.allianceId)

        // 获取时间段信息
        const timeSlot = await db.getTimeSlotById(reg.timeSlotId)

        processedRegistrations.push({
          ...reg,
          zoneName: zone ? zone.zoneName : '未知分区',
          allianceName: alliance ? alliance.allianceName : '未知联盟',
          displayName: timeSlot ? timeSlot.displayName : '未知时间',
          formattedTime: util.formatDate(reg.createTime, 'YYYY-MM-DD HH:mm')
        })
      }

      this.setData({
        registrations: processedRegistrations
      })

      util.hideLoading()

    } catch (err) {
      util.hideLoading()
      util.showError('加载报名记录失败')
    }
  },

  // 获取分区信息
  getZoneById: async function (zoneId) {
    try {
      const db = wx.cloud.database()
      const res = await db.collection('zones').doc(zoneId).get()
      return res.data
    } catch (err) {
      return null
    }
  },

  // 获取联盟信息
  getAllianceById: async function (allianceId) {
    try {
      const db = wx.cloud.database()
      const res = await db.collection('alliances').doc(allianceId).get()
      return res.data
    } catch (err) {
      return null
    }
  },

  // 取消报名
  cancelRegistration: async function (e) {
    const registrationId = e.currentTarget.dataset.id
    const index = e.currentTarget.dataset.index

    const confirm = await util.showConfirm('确认取消', '确定要取消这条报名记录吗？')

    if (!confirm) return

    try {
      util.showLoading('正在取消...')

      await db.cancelRegistration(registrationId)

      // 从列表中移除
      const registrations = this.data.registrations
      registrations.splice(index, 1)

      this.setData({
        registrations: registrations
      })

      util.hideLoading()
      util.showSuccess('取消成功')

    } catch (err) {
      util.hideLoading()
      util.showError('取消失败')
    }
  },

  // 去报名
  goToRegistration: function () {
    wx.navigateTo({
      url: '/pages/user/registration/registration'
    })
  }
})