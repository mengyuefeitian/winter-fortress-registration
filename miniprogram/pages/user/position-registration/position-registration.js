// pages/user/position-registration/position-registration.js
const app = getApp()
const util = require('../../utils/util')
const db = require('../../utils/db')

Page({
  data: {
    userInfo: null,
    currentZone: null,
    positionConfigs: [],
    currentConfig: null,
    timeSlots: [],
    loading: false,
    POSITION_TYPES: ['副执行官', '教育部长']
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
    const openid = app.globalData.openid

    if (userInfo && openid) {
      this.setData({
        userInfo: userInfo,
        currentZone: app.globalData.currentZone
      })
      this.loadPositionConfigs()
    } else {
      util.showInfo('请先登录')
      wx.navigateTo({
        url: '/pages/login/login'
      })
    }
  },

  // 加载官职配置
  loadPositionConfigs: async function () {
    try {
      this.setData({ loading: true })

      // 获取今天的日期
      const today = util.formatDate(new Date())

      // 获取今天的官职配置
      const configs = await db.getPositionConfigs({ date: today })

      if (configs.length === 0) {
        this.setData({
          positionConfigs: [],
          currentConfig: null,
          timeSlots: [],
          loading: false
        })
        return
      }

      // 默认选择第一个配置
      const currentConfig = configs[0]

      // 生成时间段并加载报名情况
      await this.loadTimeSlotsWithRegistrations(currentConfig)

    } catch (err) {
      console.error('加载官职配置失败:', err)
      util.showError('加载失败')
      this.setData({
        positionConfigs: [],
        currentConfig: null,
        timeSlots: [],
        loading: false
      })
    }
  },

  // 加载时间段和报名情况
  loadTimeSlotsWithRegistrations: async function (config) {
    try {
      // 生成时间段列表
      const slots = db.generatePositionTimeSlots(config.startTime)

      // 获取该配置的所有报名记录
      const registrations = await db.getPositionRegistrationsByConfig(config._id)

      // 处理每个时间段的报名情况
      const processedSlots = slots.map(slot => {
        const registration = registrations.find(r => r.timeSlot === slot.time)
        return {
          ...slot,
          configId: config._id,
          positionType: config.positionType,
          isRegistered: !!registration,
          registeredUser: registration ? registration.nickName : null,
          isMyRegistration: registration && registration.userId === (app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid)
        }
      })

      this.setData({
        currentConfig: config,
        timeSlots: processedSlots,
        loading: false
      })

    } catch (err) {
      console.error('加载时间段失败:', err)
      this.setData({
        timeSlots: [],
        loading: false
      })
    }
  },

  // 切换官职配置
  onConfigChange: function (e) {
    const index = e.detail.value
    const config = this.data.positionConfigs[index]
    if (config) {
      this.loadTimeSlotsWithRegistrations(config)
    }
  },

  // 选择时间段
  selectTimeSlot: async function (e) {
    const slot = e.currentTarget.dataset.slot

    // 检查是否已被占用
    if (slot.isRegistered && !slot.isMyRegistration) {
      util.showInfo('该时间段已被 ' + slot.registeredUser + ' 占用')
      return
    }

    // 如果是用户自己的报名，询问是否取消
    if (slot.isMyRegistration) {
      wx.showModal({
        title: '取消预约',
        content: '确认取消该时间段的预约？',
        success: (res) => {
          if (res.confirm) {
            this.cancelRegistration(slot)
          }
        }
      })
      return
    }

    // 弹出输入框让用户输入游戏昵称
    wx.showModal({
      title: '预约官职',
      content: `确认预约 ${slot.time} 的 ${this.data.currentConfig.positionType}？`,
      editable: true,
      placeholderText: '请输入游戏昵称',
      success: (res) => {
        if (res.confirm) {
          const nickName = res.content ? res.content.trim() : ''
          if (!nickName) {
            util.showInfo('请输入游戏昵称')
            return
          }
          this.registerPosition(slot, nickName)
        }
      }
    })
  },

  // 预约官职
  registerPosition: async function (slot, nickName) {
    try {
      util.showLoading('正在预约...')

      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

      if (!userId) {
        util.hideLoading()
        util.showInfo('数据不完整，请重试')
        return
      }

      // 检查用户是否已在该配置中有其他报名
      const existingRegistrations = await db.getPositionRegistrationsByUser(userId)
      const existingInConfig = existingRegistrations.find(r => r.configId === this.data.currentConfig._id)

      if (existingInConfig && existingInConfig.timeSlot !== slot.time) {
        util.hideLoading()
        util.showInfo('您已预约了其他时间段，请先取消再重新预约')
        return
      }

      // 创建预约
      await db.createPositionRegistration({
        configId: this.data.currentConfig._id,
        timeSlot: slot.time,
        userId: userId,
        nickName: nickName,
        remark: ''
      })

      util.hideLoading()
      util.showSuccess('预约成功')

      // 刷新数据
      this.loadTimeSlotsWithRegistrations(this.data.currentConfig)

    } catch (err) {
      util.hideLoading()
      util.showError('预约失败：' + (err.message || '未知错误'))
    }
  },

  // 取消预约
  cancelRegistration: async function (slot) {
    try {
      util.showLoading('正在取消...')

      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

      // 获取用户的报名记录
      const registrations = await db.getPositionRegistrationsByUser(userId)
      const targetReg = registrations.find(r => r.configId === this.data.currentConfig._id && r.timeSlot === slot.time)

      if (!targetReg) {
        util.hideLoading()
        util.showInfo('未找到您的预约记录')
        return
      }

      // 取消报名
      await db.cancelPositionRegistration(targetReg._id)

      util.hideLoading()
      util.showSuccess('取消成功')

      // 刷新数据
      this.loadTimeSlotsWithRegistrations(this.data.currentConfig)

    } catch (err) {
      util.hideLoading()
      util.showError('取消失败：' + (err.message || '未知错误'))
    }
  },

  // 刷新数据
  refreshData: function () {
    this.loadPositionConfigs()
  }
})