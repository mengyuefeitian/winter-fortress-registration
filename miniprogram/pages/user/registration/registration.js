// pages/user/registration/registration.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')

Page({
  data: {
    zones: [],
    zoneIndex: 0,
    selectedZone: null,

    alliances: [],
    allianceIndex: 0,
    selectedAlliance: null,

    timeSlots: [],
    selectedTimeSlot: null,

    registrations: [],

    nickName: '',
    position: 'head',
    loading: true,
    isLoggedIn: false
  },

  onLoad: function () {
    this.checkLoginAndLoadData()
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

    this.loadZones()
  },

  // 加载分区列表
  loadZones: async function () {
    try {
      this.setData({ loading: true })

      const zones = await db.getAllZones()

      if (zones.length > 0) {
        // 从本地存储读取上次选择的分区
        const lastZoneId = wx.getStorageSync('lastZoneId')
        let selectedZone = zones[0]
        let zoneIndex = 0

        if (lastZoneId) {
          const foundIndex = zones.findIndex(z => z._id === lastZoneId)
          if (foundIndex >= 0) {
            selectedZone = zones[foundIndex]
            zoneIndex = foundIndex
          }
        }

        this.setData({
          zones: zones,
          selectedZone: selectedZone,
          zoneIndex: zoneIndex,
          loading: false
        })

        // 加载联盟并恢复上次选择
        this.loadAlliances(selectedZone._id)
      } else {
        this.setData({
          zones: [],
          selectedZone: null,
          loading: false
        })
      }

    } catch (err) {
      console.error('加载分区失败:', err)
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
        let selectedAlliance = alliances[0]
        let allianceIndex = 0

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
          allianceIndex: allianceIndex
        })

        this.loadTimeSlots()
      } else {
        this.setData({
          alliances: [],
          selectedAlliance: null,
          allianceIndex: 0
        })
      }

    } catch (err) {
      console.error('加载联盟失败:', err)
    }
  },

  // 加载时间段列表
  loadTimeSlots: async function () {
    try {
      if (!this.data.selectedAlliance) return

      const allianceId = this.data.selectedAlliance._id
      const timeSlots = await db.getTimeSlotsByAlliance(allianceId)

      const processedSlots = []
      for (const slot of timeSlots) {
        const count = await db.getRegistrationCount(slot._id)
        const isFull = util.isTimeSlotFull(count, slot.maxCount)
        processedSlots.push({
          ...slot,
          count: count,
          isFull: isFull
        })
      }

      this.setData({
        timeSlots: processedSlots
      })

    } catch (err) {
      console.error('加载时间段失败:', err)
    }
  },

  // 分区选择变化
  onZoneChange: function (e) {
    const index = e.detail.value
    const zone = this.data.zones[index]

    // 保存选择的分区到本地存储
    wx.setStorageSync('lastZoneId', zone._id)

    this.setData({
      zoneIndex: index,
      selectedZone: zone,
      allianceIndex: 0,
      selectedAlliance: null,
      selectedTimeSlot: null,
      timeSlots: [],
      registrations: []
    })

    this.loadAlliances(zone._id)
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

    if (timeSlot.isFull) {
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

      this.setData({
        registrations: registrations
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
        zoneId: this.data.selectedZone._id,
        allianceId: this.data.selectedAlliance._id,
        timeSlotId: this.data.selectedTimeSlot._id,
        userId: userId,
        nickName: this.data.nickName,
        position: this.data.position
      })

      util.hideLoading()
      util.showSuccess('报名成功')

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
  }
})