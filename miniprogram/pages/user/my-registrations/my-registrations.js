// pages/user/my-registrations/my-registrations.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')
const version = require('../../../utils/version')

Page({
  data: {
    isLoggedIn: false,
    userInfo: null,
    roleName: '',
    registrations: [],
    weeklyRegistrations: [],
    positionRegistrations: [],
    arsenalRegistrations: [],
    canyonRegistrations: [],
    versionText: version.getVersionText(),
    // 分区过滤
    currentZone: null,
    zones: [],
    zonesLoaded: false
  },

  onLoad: function () {
    this.waitForRoleReady()
  },

  onShow: function () {
    if (app.globalData.roleReady) {
      this.loadUserInfo()
      this.loadZones()
      this.loadMyRegistrations()
    }
  },

  // 等待角色就绪
  waitForRoleReady: function () {
    if (app.globalData.roleReady) {
      this.loadUserInfo()
      this.loadZones()
      this.loadMyRegistrations()
    } else {
      setTimeout(() => {
        this.waitForRoleReady()
      }, 100)
    }
  },

  // 加载用户信息
  loadUserInfo: function () {
    const userInfo = app.globalData.userInfo
    const role = app.globalData.role || 'user'
    const roleName = util.getRoleName(role)

    this.setData({
      isLoggedIn: !!userInfo,
      userInfo: userInfo,
      roleName: userInfo ? roleName : '未登录'
    })
  },

  // 加载分区列表
  loadZones: async function () {
    try {
      const zones = await db.getAllZones()
      const currentZone = app.globalData.currentZone || null
      this.setData({
        zones: zones,
        currentZone: currentZone,
        zonesLoaded: true
      })
    } catch (err) {
      console.error('加载分区失败:', err)
      this.setData({ zones: [], zonesLoaded: true })
    }
  },

  // 分区选择变化
  onZoneChange: function (e) {
    const zone = e.detail.zone
    this.setData({ currentZone: zone })
    this.loadMyRegistrations()
  },

  // 加载我的报名记录
  loadMyRegistrations: async function () {
    try {
      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

      if (!userId) {
        this.setData({
          registrations: [],
          weeklyRegistrations: [],
          positionRegistrations: [],
          arsenalRegistrations: [],
          canyonRegistrations: []
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

        // Format date as YY/MM/DD
        let formattedDate = ''
        if (timeSlot && timeSlot.date) {
          const dateParts = timeSlot.date.split('-')
          if (dateParts.length === 3) {
            formattedDate = dateParts[0].slice(-2) + '/' + dateParts[1] + '/' + dateParts[2]
          }
        }

        // Truncate alliance name to first 3 chars
        const allianceName = alliance ? alliance.allianceName : '未知联盟'
        const shortAllianceName = allianceName.substring(0, 3)
        const zoneCode = zone ? zone.zoneCode : ''

        processedRegistrations.push({
          ...reg,
          zoneName: zone ? zone.zoneName : '未知分区',
          zoneCode: zoneCode,
          zoneId: reg.zoneId,
          allianceName: allianceName,
          shortAllianceName: shortAllianceName,
          displayName: timeSlot ? timeSlot.displayName : '未知时间',
          timeTag: timeSlot ? timeSlot.tag : '',
          timeFortress: timeSlot ? timeSlot.fortress : '',
          timeDate: timeSlot ? timeSlot.date : '',
          formattedDate: formattedDate,
          formattedTime: util.formatDate(reg.createTime, 'YYYY-MM-DD HH:mm')
        })
      }

      // 按分区过滤
      const filteredRegistrations = this.data.currentZone
        ? processedRegistrations.filter(r => r.zoneId === this.data.currentZone._id)
        : processedRegistrations

      const weeklyRegistrations = this.filterWeeklyRegistrations(filteredRegistrations)

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
        registrations: filteredRegistrations,
        weeklyRegistrations: weeklyRegistrations,
        positionRegistrations: processedPositionRegistrations
      })

      // 加载兵工厂报名记录（批量获取配置，避免N+1查询）
      const arsenalRegistrations = await db.getArsenalRegistrationsByUser(userId)
      const allArsenalConfigs = await db.getArsenalConfigs({})
      const arsenalConfigMap = {}
      allArsenalConfigs.forEach(cfg => { arsenalConfigMap[cfg._id] = cfg })

      const processedArsenal = []
      for (const reg of arsenalRegistrations) {
        const config = arsenalConfigMap[reg.configId]
        processedArsenal.push({
          ...reg,
          type: 'arsenal',
          date: config?.date || '',
          time: config?.timeValue || '',
          corps: config?.corps || '',
          activityType: config?.activityType || 'arsenal',
          activityLabel: '兵工厂'
        })
      }

      // 加载峡谷会战报名记录（批量获取配置，避免N+1查询）
      const canyonRegistrations = await db.getCanyonRegistrationsByUser(userId)
      const allCanyonConfigs = await db.getCanyonConfigs({})
      const canyonConfigMap = {}
      allCanyonConfigs.forEach(cfg => { canyonConfigMap[cfg._id] = cfg })

      const processedCanyon = []
      for (const reg of canyonRegistrations) {
        const config = canyonConfigMap[reg.configId]
        processedCanyon.push({
          ...reg,
          type: 'canyon',
          date: config?.date || '',
          time: config?.timeValue || '',
          corps: config?.corps || '',
          activityType: config?.activityType || 'canyon',
          activityLabel: '峡谷会战'
        })
      }

      this.setData({
        arsenalRegistrations: processedArsenal,
        canyonRegistrations: processedCanyon
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
      const wxdb = wx.cloud.database()
      const res = await wxdb.collection('zones').doc(zoneId).get()
      return res.data
    } catch (err) {
      return null
    }
  },

  // 获取联盟信息
  getAllianceById: async function (allianceId) {
    try {
      const wxdb = wx.cloud.database()
      const res = await wxdb.collection('alliances').doc(allianceId).get()
      return res.data
    } catch (err) {
      return null
    }
  },

  // 取消报名
  cancelRegistration: async function (e) {
    const registrationId = e.currentTarget.dataset.id

    const confirm = await util.showConfirm('确认取消', '确定要取消这条报名记录吗？')

    if (!confirm) return

    try {
      util.showLoading('正在取消...')

      await db.cancelRegistration(registrationId)

      // 重新加载数据（确保数据一致性）
      await this.loadMyRegistrations()

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

    const confirm = await util.showConfirm('确认取消', '确定要取消这条官职报名记录吗？')

    if (!confirm) return

    try {
      util.showLoading('正在取消...')

      await db.cancelPositionRegistration(registrationId)

      // 重新加载数据（确保数据一致性）
      await this.loadMyRegistrations()

      util.hideLoading()
      util.showSuccess('取消成功')

    } catch (err) {
      util.hideLoading()
      util.showError('取消失败')
    }
  },

  // 取消兵工厂报名
  cancelArsenalRegistration: async function (e) {
    const registrationId = e.currentTarget.dataset.id

    const confirm = await util.showConfirm('确认取消', '确定要取消这条兵工厂报名记录吗？')

    if (!confirm) return

    try {
      util.showLoading('正在取消...')

      await db.cancelArsenalRegistration(registrationId)

      await this.loadMyRegistrations()

      util.hideLoading()
      util.showSuccess('取消成功')

    } catch (err) {
      util.hideLoading()
      util.showError('取消失败')
    }
  },

  // 取消峡谷会战报名
  cancelCanyonRegistration: async function (e) {
    const registrationId = e.currentTarget.dataset.id

    const confirm = await util.showConfirm('确认取消', '确定要取消这条峡谷会战报名记录吗？')

    if (!confirm) return

    try {
      util.showLoading('正在取消...')

      await db.cancelCanyonRegistration(registrationId)

      await this.loadMyRegistrations()

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

  // 意见反馈
  goToFeedback: function () {
    wx.navigateTo({
      url: '/pages/user/feedback/feedback'
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
  },

  // 分享
  onShareAppMessage: function () {
    return {
      title: '我的报名记录 - 无尽冬日堡垒分配',
      path: '/pages/user/my-registrations/my-registrations'
    }
  }
})