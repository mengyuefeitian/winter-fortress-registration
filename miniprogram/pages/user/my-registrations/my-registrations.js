// pages/user/my-registrations/my-registrations.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')

Page({
  data: {
    isLoggedIn: false,
    userInfo: null,
    roleName: '',
    registrations: [],
    weeklyRegistrations: [],
    positionRegistrations: []
  },

  onLoad: function () {
    this.loadUserInfo()
    this.loadMyRegistrations()
  },

  onShow: function () {
    this.loadUserInfo()
    this.loadMyRegistrations()
  },

  // 加载用户信息
  loadUserInfo: function () {
    const userInfo = app.globalData.userInfo
    const role = app.globalData.role
    const roleName = util.getRoleName(role)

    this.setData({
      isLoggedIn: !!userInfo,
      userInfo: userInfo,
      roleName: userInfo ? roleName : '未登录'
    })
  },

  // 加载我的报名记录
  loadMyRegistrations: async function () {
    try {
      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

      if (!userId) {
        this.setData({
          registrations: [],
          weeklyRegistrations: [],
          positionRegistrations: []
        })
        return
      }

      // 加载堡垒报名记录
      const registrations = await db.getRegistrationsByUser(userId)

      // 加载关联的分区、联盟、时间段信息
      const processedRegistrations = []
      for (const reg of registrations) {
        const zone = await this.getZoneById(reg.zoneId)
        const alliance = await this.getAllianceById(reg.allianceId)
        const timeSlot = await db.getTimeSlotById(reg.timeSlotId)

        processedRegistrations.push({
          ...reg,
          zoneName: zone ? zone.zoneName : '未知分区',
          zoneCode: zone ? zone.zoneCode : '',
          allianceName: alliance ? alliance.allianceName : '未知联盟',
          displayName: timeSlot ? timeSlot.displayName : '未知时间',
          timeRemark: timeSlot ? timeSlot.remark : '',
          formattedTime: util.formatDate(reg.createTime, 'YYYY-MM-DD HH:mm')
        })
      }

      const weeklyRegistrations = this.filterWeeklyRegistrations(processedRegistrations)

      // 加载官职报名记录
      const positionRegistrations = await db.getPositionRegistrationsByUser(userId)

      // 处理官职报名记录
      const processedPositionRegistrations = positionRegistrations.map(reg => {
        return {
          ...reg,
          configInfo: reg.config ? {
            positionType: reg.config.positionType,
            date: reg.config.date,
            startTime: reg.config.startTime
          } : null,
          formattedTime: util.formatDate(reg.createTime, 'YYYY-MM-DD HH:mm')
        }
      })

      this.setData({
        registrations: processedRegistrations,
        weeklyRegistrations: weeklyRegistrations,
        positionRegistrations: processedPositionRegistrations
      })

    } catch (err) {
      console.error('加载报名记录失败:', err)
    }
  },

  // 筛选本周报名
  filterWeeklyRegistrations: function (registrations) {
    const now = new Date()
    const dayOfWeek = now.getDay() || 7
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - dayOfWeek + 1)
    weekStart.setHours(0, 0, 0, 0)

    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 7)

    return registrations.filter(reg => {
      const createTime = new Date(reg.createTime)
      return createTime >= weekStart && createTime < weekEnd
    })
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

      const registrations = this.data.registrations
      registrations.splice(index, 1)

      const weeklyRegistrations = this.filterWeeklyRegistrations(registrations)

      this.setData({
        registrations: registrations,
        weeklyRegistrations: weeklyRegistrations
      })

      util.hideLoading()
      util.showSuccess('取消成功')

    } catch (err) {
      util.hideLoading()
      util.showError('取消失败')
    }
  },

  // 取消官职报名
  cancelPositionRegistration: async function (e) {
    const registrationId = e.currentTarget.dataset.id
    const index = e.currentTarget.dataset.index

    const confirm = await util.showConfirm('确认取消', '确定要取消这条官职报名记录吗？')

    if (!confirm) return

    try {
      util.showLoading('正在取消...')

      await db.cancelPositionRegistration(registrationId)

      const positionRegistrations = this.data.positionRegistrations
      positionRegistrations.splice(index, 1)

      this.setData({
        positionRegistrations: positionRegistrations
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
  },

  // 去登录
  goToLogin: function () {
    wx.navigateTo({
      url: '/pages/login/login'
    })
  },

  // 退出登录
  logout: function () {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？退出后将清除您的登录信息。',
      confirmText: '退出',
      confirmColor: '#FF6B6B',
      success: (res) => {
        if (res.confirm) {
          // 清除全局数据
          app.globalData.userInfo = null
          app.globalData.openid = null
          app.globalData.phone = null
          app.globalData.role = 'user'
          app.globalData.roleReady = true  // 设置为true，表示角色状态已确定（未登录状态）

          // 清除本地缓存
          wx.removeStorageSync('userInfo')
          wx.removeStorageSync('openid')

          // 更新页面
          this.setData({
            isLoggedIn: false,
            userInfo: null,
            roleName: '未登录',
            registrations: [],
            weeklyRegistrations: []
          })

          util.showSuccess('已退出登录')

          // 跳转到首页
          setTimeout(() => {
            wx.switchTab({
              url: '/pages/index/index'
            })
          }, 500)
        }
      }
    })
  }
})