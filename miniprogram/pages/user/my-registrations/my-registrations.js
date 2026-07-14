// pages/user/my-registrations/my-registrations.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')
const version = require('../../../utils/version')
const cache = require('../../../utils/cache')

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
    battleRegistrations: [],
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

      // 快速路径：若有缓存先渲染
      const myUserId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid
      if (myUserId) {
        // 优先内存缓存，没有则读持久化缓存（跨 app 重启仍有效，TTL 5 分钟）
        let myCached = cache.get('myregs_' + myUserId)
        if (!myCached) {
          try {
            const persisted = wx.getStorageSync('myregs_persist_' + myUserId)
            if (persisted && persisted.timestamp && (Date.now() - persisted.timestamp < 5 * 60 * 1000)) {
              myCached = persisted
            }
          } catch (e) {}
        }
        if (myCached) {
          this.setData({
            registrations: myCached.registrations,
            weeklyRegistrations: myCached.weeklyRegistrations,
            positionRegistrations: myCached.positionRegistrations,
            arsenalRegistrations: myCached.arsenalRegistrations,
            canyonRegistrations: myCached.canyonRegistrations,
            battleRegistrations: myCached.battleRegistrations || []
          })
        }
      }

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
    // 防止 waitForRoleReady 与 onShow 并发触发时重复加载（2 秒内去重）
    const now = Date.now()
    if (this._lastLoadTime && (now - this._lastLoadTime < 2000)) return
    this._lastLoadTime = now

    try {
      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

      if (!userId) {
        this.setData({
          registrations: [],
          weeklyRegistrations: [],
          positionRegistrations: [],
          arsenalRegistrations: [],
          canyonRegistrations: [],
          battleRegistrations: []
        })
        return
      }

      // 并行拉取堡垒、官职、兵工厂、峡谷、国战报名记录，减少串行等待
      const [registrations, positionRegistrations, arsenalRegistrations, canyonRegistrations, battleRegistrations] =
        await Promise.all([
          db.getRegistrationsByUser(userId),
          db.getPositionRegistrationsByUser(userId),
          db.getArsenalRegistrationsByUser(userId),
          db.getCanyonRegistrationsByUser(userId),
          db.getBattleRegistrationsByUser(userId)
        ])

      // 批量获取堡垒报名关联的分区、联盟、时间段（避免 N+1 逐条查询）
      const zoneIds = registrations.map(r => r.zoneId).filter(Boolean)
      const allianceIds = registrations.map(r => r.allianceId).filter(Boolean)
      const timeSlotIds = registrations.map(r => r.timeSlotId).filter(Boolean)

      // 并行批量拉取三类关联数据
      const [zoneMap, allianceMap, timeSlotMap] = await Promise.all([
        db.getZonesByIds(zoneIds),
        db.getAlliancesByIds(allianceIds),
        db.getTimeSlotsByIds(timeSlotIds)
      ])

      // 组装堡垒报名展示数据
      const processedRegistrations = registrations.map(reg => {
        const zone = zoneMap[reg.zoneId]
        const alliance = allianceMap[reg.allianceId]
        const timeSlot = timeSlotMap[reg.timeSlotId]

        let formattedDate = ''
        if (timeSlot && timeSlot.date) {
          const dateParts = timeSlot.date.split('-')
          if (dateParts.length === 3) {
            formattedDate = dateParts[0].slice(-2) + '/' + dateParts[1] + '/' + dateParts[2]
          }
        }

        const allianceName = alliance ? alliance.allianceName : '未知联盟'
        const shortAllianceName = allianceName.substring(0, 3)
        const zoneCode = zone ? zone.zoneCode : ''

        return {
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
        }
      })

      // 按分区过滤
      const filteredRegistrations = this.data.currentZone
        ? processedRegistrations.filter(r => r.zoneId === this.data.currentZone._id)
        : processedRegistrations

      const weeklyRegistrations = this.filterWeeklyRegistrations(filteredRegistrations)

      // 处理官职报名记录（config 已由 getPositionRegistrationsByUser 批量关联）
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

      // 批量获取兵工厂配置（仅拉取用户已报名的 configId，不拉全量）
      const arsenalConfigIds = arsenalRegistrations.map(r => r.configId).filter(Boolean)
      const canyonConfigIds = canyonRegistrations.map(r => r.configId).filter(Boolean)

      const [arsenalConfigMap, canyonConfigMap] = await Promise.all([
        db.getArsenalConfigsByIds(arsenalConfigIds, 'arsenal'),
        db.getArsenalConfigsByIds(canyonConfigIds, 'canyon')
      ])

      const processedArsenal = arsenalRegistrations.map(reg => {
        const config = arsenalConfigMap[reg.configId]
        return {
          ...reg,
          type: 'arsenal',
          date: config ? config.date : '',
          time: config ? config.timeValue : '',
          corps: config ? config.corps : '',
          activityType: config ? config.activityType : 'arsenal',
          activityLabel: '兵工厂'
        }
      })

      const processedCanyon = canyonRegistrations.map(reg => {
        const config = canyonConfigMap[reg.configId]
        return {
          ...reg,
          type: 'canyon',
          date: config ? config.date : '',
          time: config ? config.timeValue : '',
          corps: config ? config.corps : '',
          activityType: config ? config.activityType : 'canyon',
          activityLabel: '峡谷会战'
        }
      })

      // 批量获取国战配置（仅拉取用户已报名的 configId，不拉全量）
      const battleConfigIds = battleRegistrations.map(r => r.configId).filter(Boolean)
      const battleConfigMap = await db.getBattleConfigsByIds(battleConfigIds)

      const processedBattle = battleRegistrations.map(reg => {
        const config = battleConfigMap[reg.configId]
        return {
          ...reg,
          date: config ? config.date : '',
          zoneName: config ? config.zoneName : (reg.zoneName || ''),
          formattedTime: util.formatDate(reg.createTime, 'YYYY-MM-DD HH:mm')
        }
      })

      this.setData({
        registrations: filteredRegistrations,
        weeklyRegistrations: weeklyRegistrations,
        positionRegistrations: processedPositionRegistrations,
        arsenalRegistrations: processedArsenal,
        canyonRegistrations: processedCanyon,
        battleRegistrations: processedBattle
      })

      if (userId) {
        const cachePayload = {
          registrations: filteredRegistrations,
          weeklyRegistrations: weeklyRegistrations,
          positionRegistrations: processedPositionRegistrations,
          arsenalRegistrations: processedArsenal,
          canyonRegistrations: processedCanyon,
          battleRegistrations: processedBattle,
          timestamp: Date.now()
        }
        cache.set('myregs_' + userId, cachePayload)
        // 持久化到 storage，跨 app 重启仍可快速显示上次数据
        try { wx.setStorageSync('myregs_persist_' + userId, cachePayload) } catch (e) {}
      }

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
      const cancelMyUserId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid
      if (cancelMyUserId) cache.invalidate('myregs_' + cancelMyUserId)

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
      const cancelMyUserId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid
      if (cancelMyUserId) cache.invalidate('myregs_' + cancelMyUserId)

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
      const cancelMyUserId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid
      if (cancelMyUserId) cache.invalidate('myregs_' + cancelMyUserId)

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
      const cancelMyUserId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid
      if (cancelMyUserId) cache.invalidate('myregs_' + cancelMyUserId)

    } catch (err) {
      util.hideLoading()
      util.showError('取消失败')
    }
  },

  // 取消国战报名
  cancelBattleRegistration: async function (e) {
    const registrationId = e.currentTarget.dataset.id

    const confirm = await util.showConfirm('确认取消', '确定要取消这条国战报名记录吗？')

    if (!confirm) return

    try {
      util.showLoading('正在取消...')

      await db.deleteBattleRegistration(registrationId)

      await this.loadMyRegistrations()

      util.hideLoading()
      util.showSuccess('取消成功')
      const cancelMyUserId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid
      if (cancelMyUserId) cache.invalidate('myregs_' + cancelMyUserId)

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

  goToPositionList: function () {
    wx.navigateTo({
      url: '/pages/user/position-list/position-list'
    })
  },

  goToArsenal: function () {
    wx.navigateTo({
      url: '/pages/user/arsenal-registration/arsenal-registration'
    })
  },

  goToCanyon: function () {
    wx.navigateTo({
      url: '/pages/user/canyon-registration/canyon-registration'
    })
  },

  goToBattle: function () {
    wx.navigateTo({
      url: '/pages/user/battle-list/battle-list'
    })
  },

  goToInbox: function () {
    wx.navigateTo({
      url: '/pages/user/feedback-inbox/feedback-inbox'
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
            weeklyRegistrations: [],
            positionRegistrations: [],
            arsenalRegistrations: [],
            canyonRegistrations: [],
            battleRegistrations: []
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