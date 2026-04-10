// pages/user/registration/registration.js
const app = getApp()
const util = require('../../utils/util')
const db = require('../../utils/db')

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
    position: 'head' // 默认车头
  },

  onLoad: function () {
    this.loadZones()
  },

  onShow: function () {
    // 每次显示时重新加载数据，确保状态最新
    if (this.data.selectedAlliance) {
      this.loadTimeSlots()
    }
  },

  // 加载分区列表
  loadZones: async function () {
    try {
      util.showLoading('加载分区...')

      const zones = await db.getAllZones()

      this.setData({
        zones: zones
      })

      if (zones.length > 0) {
        this.setData({
          selectedZone: zones[0]
        })
        this.loadAlliances(zones[0]._id)
      }

      util.hideLoading()

    } catch (err) {
      util.hideLoading()
      util.showError('加载分区失败')
    }
  },

  // 加载联盟列表
  loadAlliances: async function (zoneId) {
    try {
      util.showLoading('加载联盟...')

      const alliances = await db.getAlliancesByZone(zoneId)

      this.setData({
        alliances: alliances
      })

      if (alliances.length > 0) {
        this.setData({
          selectedAlliance: alliances[0]
        })
        this.loadTimeSlots()
      }

      util.hideLoading()

    } catch (err) {
      util.hideLoading()
      util.showError('加载联盟失败')
    }
  },

  // 加载时间段列表
  loadTimeSlots: async function () {
    try {
      if (!this.data.selectedAlliance) return

      util.showLoading('加载时间段...')

      const allianceId = this.data.selectedAlliance._id
      const timeSlots = await db.getTimeSlotsByAlliance(allianceId)

      // 计算每个时间段的报名人数和是否已满
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

      util.hideLoading()

    } catch (err) {
      util.hideLoading()
      util.showError('加载时间段失败')
    }
  },

  // 分区选择变化
  onZoneChange: function (e) {
    const index = e.detail.value
    const zone = this.data.zones[index]

    this.setData({
      zoneIndex: index,
      selectedZone: zone,
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

    // 加载已报名人员
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
      util.showError('加载报名列表失败')
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
      // 验证数据
      if (!this.data.nickName) {
        util.showInfo('请输入昵称')
        return
      }

      if (!this.data.selectedTimeSlot) {
        util.showInfo('请选择时间段')
        return
      }

      // 检查是否已满
      if (this.data.selectedTimeSlot.isFull) {
        util.showInfo('该时间段报名人数已满')
        return
      }

      util.showLoading('正在报名...')

      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

      // 创建报名记录
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

      // 重置表单
      this.setData({
        nickName: '',
        selectedTimeSlot: null,
        registrations: []
      })

      // 重新加载时间段数据
      this.loadTimeSlots()

    } catch (err) {
      util.hideLoading()
      util.showError(err.message || '报名失败')
    }
  }
})