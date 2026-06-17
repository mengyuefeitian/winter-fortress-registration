// pages/user/registration/registration.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')
const cache = require('../../../utils/cache')

Page({
  data: {
    alliances: [],
    allianceIndex: 0,
    selectedAlliance: null,

    timeSlots: [],
    selectedTimeSlot: null,

    registrations: [],

    nickName: '',
    position: 'head',
    loading: true,
    isLoggedIn: false,
    selectedZone: null,
    showTip: false
  },

  onLoad: function (options) {
    // 如果分享链接带有zoneId参数，优先使用该参数
    if (options && options.zoneId) {
      this._pendingZoneId = options.zoneId
    }
    // 数据加载由 onShow 处理
  },

  // 切换提示信息显示
  toggleTip: function () {
    this.setData({ showTip: !this.data.showTip })
  },

  onShow: function () {
    this.checkLoginAndLoadData()
  },

  // 检查登录并加载数据
  checkLoginAndLoadData: function () {
    const userInfo = app.globalData.userInfo

    if (userInfo && userInfo.nickName) {
      // 已登录，自动填充昵称
      this.setData({
        isLoggedIn: true,
        nickName: userInfo.nickName
      })
    } else {
      this.setData({
        isLoggedIn: false,
        nickName: ''
      })
    }

    // 快速路径：若分区已知，尝试立即渲染缓存
    const zone = app.globalData.currentZone
    if (zone) {
      const alliancesKey = 'fortress_alliances_' + zone._id
      const cachedAlliances = cache.get(alliancesKey)
      if (cachedAlliances) {
        const lastAllianceId = wx.getStorageSync('lastAllianceId')
        const alliances = cachedAlliances.alliances
        let selectedAlliance = null
        let allianceIndex = -1
        if (lastAllianceId) {
          allianceIndex = alliances.findIndex(function(a) { return a._id === lastAllianceId })
          if (allianceIndex >= 0) selectedAlliance = alliances[allianceIndex]
        }
        this.setData({
          selectedZone: zone,
          alliances: alliances,
          selectedAlliance: selectedAlliance,
          allianceIndex: allianceIndex,
          loading: false
        })
        if (selectedAlliance) {
          const slotsKey = 'fortress_slots_' + selectedAlliance._id
          const cachedSlots = cache.get(slotsKey)
          if (cachedSlots) {
            this.setData({ timeSlots: cachedSlots.timeSlots })
          }
        }
        // 后台静默刷新，不显示 loading
        this.loadAlliancesFromCurrentZone(true)
        return
      }
    }
    this.loadAlliancesFromCurrentZone()
  },

  // 从首页选择的分区加载联盟
  // silent=true 时跳过 loading: true，用于缓存命中后的后台刷新
  loadAlliancesFromCurrentZone: async function (silent) {
    try {
      if (!silent) this.setData({ loading: true })

      let zone = app.globalData.currentZone

      // 优先使用分享链接中的zoneId参数
      if (!zone && this._pendingZoneId) {
        const wxdb = wx.cloud.database()
        try {
          const res = await wxdb.collection('zones').doc(this._pendingZoneId).get()
          if (res.data && res.data.status !== 'inactive') {
            zone = res.data
            app.globalData.currentZone = zone
            wx.setStorageSync('lastZoneId', zone._id)
            this._pendingZoneId = null
          }
        } catch (err) {
          console.error('从分享链接恢复分区失败:', err)
        }
      }

      // 如果全局分区未设置，尝试从本地存储恢复
      if (!zone) {
        const lastZoneId = wx.getStorageSync('lastZoneId')
        if (lastZoneId) {
          const wxdb = wx.cloud.database()
          try {
            const res = await wxdb.collection('zones').doc(lastZoneId).get()
            if (res.data && res.data.status !== 'inactive') {
              zone = res.data
              app.globalData.currentZone = zone
            }
          } catch (err) {
            console.error('从本地存储恢复分区失败:', err)
          }
        }
      }

      // 如果仍然没有分区，尝试加载分区列表
      if (!zone) {
        const wxdb = wx.cloud.database()
        try {
          const res = await wxdb.collection('zones').where({
            status: 'active'
          }).orderBy('createTime', 'desc').limit(100).get()
          if (res.list.length > 0) {
            zone = res.list[0]
            app.globalData.currentZone = zone
            wx.setStorageSync('lastZoneId', zone._id)
          }
        } catch (err) {
          console.error('加载分区列表失败:', err)
        }
      }

      if (!zone) {
        this.setData({
          selectedZone: null,
          alliances: [],
          selectedAlliance: null,
          loading: false
        })
        return
      }

      this.setData({ selectedZone: zone })
      await this.loadAlliances(zone._id)
    } catch (err) {
      console.error('加载联盟失败:', err)
      this.setData({ loading: false })
    }
  },

  // 加载联盟列表
  loadAlliances: async function (zoneId) {
    try {
      const alliances = await db.getAlliancesByZone(zoneId)

      if (alliances.length > 0) {
        // 从本地存储读取上次选择的联盟
        const lastAllianceId = wx.getStorageSync('lastAllianceId')
        let selectedAlliance = null
        let allianceIndex = -1

        if (lastAllianceId) {
          const foundIndex = alliances.findIndex(a => a._id === lastAllianceId)
          if (foundIndex >= 0) {
            selectedAlliance = alliances[foundIndex]
            allianceIndex = foundIndex
          }
        }

        this.setData({
          alliances: alliances,
          selectedAlliance: selectedAlliance,
          allianceIndex: allianceIndex,
          loading: false
        })
        cache.set('fortress_alliances_' + zoneId, { alliances: alliances || [] })

        if (selectedAlliance) {
          this.loadTimeSlots()
        }
      } else {
        this.setData({
          alliances: [],
          selectedAlliance: null,
          allianceIndex: -1,
          loading: false
        })
        cache.set('fortress_alliances_' + zoneId, { alliances: [] })
      }

    } catch (err) {
      console.error('加载联盟失败:', err)
      this.setData({ loading: false })
    }
  },

  // 加载时间段列表
  loadTimeSlots: async function () {
    try {
      if (!this.data.selectedAlliance) return

      const allianceId = this.data.selectedAlliance._id
      const timeSlots = await db.getTimeSlotsByAlliance(allianceId)

      // 过滤掉已过期的时间段（只保留今天及以后的）
      const today = this.getTodayString()
      const filteredSlots = timeSlots.filter(slot => {
        if (!slot.date) return true // 没有日期的时间段保留
        return slot.date >= today
      })

      if (filteredSlots.length === 0) {
        this.setData({ timeSlots: [] })
        return
      }

      const currentUserId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

      // 批量查询所有时间段的报名（一次查询，替代 N+1 循环查询）
      const timeSlotIds = filteredSlots.map(s => s._id)
      const wxdb = wx.cloud.database()
      let registrationsBySlot = {}

      if (timeSlotIds.length > 0) {
        // 分页获取所有报名记录
        let allRegs = []
        let offset = 0
        const batchSize = 20
        while (true) {
          const res = await wxdb.collection('registrations').where({
            timeSlotId: wxdb.command.in(timeSlotIds),
            status: 'active'
          }).skip(offset).limit(batchSize).get()
          allRegs = allRegs.concat(res.data)
          if (res.data.length < batchSize) break
          offset += batchSize
          if (offset > 500) break
        }

        // 按 timeSlotId 分组
        for (const reg of allRegs) {
          if (!registrationsBySlot[reg.timeSlotId]) {
            registrationsBySlot[reg.timeSlotId] = []
          }
          registrationsBySlot[reg.timeSlotId].push(reg)
        }
      }

      const processedSlots = filteredSlots.map(slot => {
        const regs = registrationsBySlot[slot._id] || []
        const count = regs.length
        return {
          ...slot,
          count: count,
          isFull: util.isTimeSlotFull(count, slot.maxCount),
          isMySlot: currentUserId ? regs.some(r => r.userId === currentUserId) : false
        }
      })

      this.setData({
        timeSlots: processedSlots
      })
      const cacheAllianceId = this.data.selectedAlliance ? this.data.selectedAlliance._id : null
      if (cacheAllianceId) {
        cache.set('fortress_slots_' + cacheAllianceId, { timeSlots: this.data.timeSlots })
      }

    } catch (err) {
      console.error('加载时间段失败:', err)
    }
  },

  // 获取今天的日期字符串（YYYY-MM-DD）
  getTodayString: function () {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  // 联盟选择变化
  onAllianceChange: function (e) {
    const index = e.detail.value
    const alliance = this.data.alliances[index]

    // 保存选择的联盟到本地存储
    wx.setStorageSync('lastAllianceId', alliance._id)

    this.setData({
      allianceIndex: index,
      selectedAlliance: alliance,
      selectedTimeSlot: null,
      registrations: []
    })

    this.loadTimeSlots()
  },

  // 选择时间段
  selectTimeSlot: async function (e) {
    const index = e.currentTarget.dataset.index
    const timeSlot = this.data.timeSlots[index]

    if (timeSlot.isFull && !timeSlot.isMySlot) {
      util.showInfo('该时间段报名人数已满')
      return
    }

    await this.loadRegistrations(timeSlot._id)

    this.setData({
      selectedTimeSlot: timeSlot
    })
  },

  // 加载已报名人员
  loadRegistrations: async function (timeSlotId) {
    try {
      const registrations = await db.getRegistrationsByTimeSlot(timeSlotId)

      const currentUserId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

      const processed = registrations.map(r => ({
        ...r,
        isMine: currentUserId && r.userId === currentUserId
      }))

      processed.sort((a, b) => (a.position === 'head' ? -1 : 1) - (b.position === 'head' ? -1 : 1))

      this.setData({
        registrations: processed
      })

    } catch (err) {
      console.error('加载报名列表失败:', err)
    }
  },

  // 输入昵称
  onNickNameInput: function (e) {
    this.setData({
      nickName: e.detail.value
    })
  },

  // 选择位置
  selectPosition: function (e) {
    const position = e.currentTarget.dataset.position

    this.setData({
      position: position
    })
  },

  // 提交报名
  submitRegistration: async function () {
    try {
      // 检查登录
      if (!this.data.isLoggedIn) {
        wx.showModal({
          title: '提示',
          content: '请先登录后再报名',
          confirmText: '去登录',
          success: (res) => {
            if (res.confirm) {
              wx.navigateTo({
                url: '/pages/login/login'
              })
            }
          }
        })
        return
      }

      // 验证数据
      const zone = this.data.selectedZone || app.globalData.currentZone
      if (!zone) {
        util.showInfo('请先在首页选择分区')
        return
      }

      if (!this.data.selectedAlliance) {
        util.showInfo('请选择联盟')
        return
      }

      if (!this.data.nickName) {
        util.showInfo('请输入昵称')
        return
      }

      if (!this.data.selectedTimeSlot) {
        util.showInfo('请选择时间段')
        return
      }

      if (this.data.selectedTimeSlot.isFull) {
        util.showInfo('该时间段报名人数已满')
        return
      }

      util.showLoading('正在报名...')

      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

      await db.createRegistration({
        zoneId: zone._id,
        allianceId: this.data.selectedAlliance._id,
        timeSlotId: this.data.selectedTimeSlot._id,
        userId: userId,
        nickName: this.data.nickName,
        position: this.data.position
      })

      util.hideLoading()
      util.showSuccess('报名成功')

      const regAllianceId = this.data.selectedAlliance ? this.data.selectedAlliance._id : null
      if (regAllianceId) cache.invalidate('fortress_slots_' + regAllianceId)
      const regUserId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid
      if (regUserId) cache.invalidate('myregs_' + regUserId)

      this.setData({
        selectedTimeSlot: null,
        registrations: []
      })

      this.loadTimeSlots()

    } catch (err) {
      util.hideLoading()
      util.showError(err.message || '报名失败')
    }
  },

  // 去登录
  goToLogin: function () {
    wx.navigateTo({
      url: '/pages/login/login'
    })
  },

  // 分享
  onShareAppMessage: function () {
    const zone = this.data.selectedZone || app.globalData.currentZone
    const path = zone
      ? `/pages/user/registration/registration?zoneId=${zone._id}`
      : '/pages/user/registration/registration'
    const title = zone
      ? `堡垒报名 - ${zone.zoneName}`
      : '堡垒报名 - 无尽冬日'
    return {
      title: title,
      path: path
    }
  }
})
