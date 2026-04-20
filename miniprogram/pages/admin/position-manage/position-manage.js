// pages/admin/position-manage/position-manage.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')

Page({
  data: {
    // 当前角色
    role: '',
    isSuperAdmin: false,

    // 分区选择（超管可见）
    zones: [],
    zoneIndex: 0,
    currentZone: null,
    showZonePicker: false,

    // 日期选择
    selectedDate: '',
    minDate: '',
    maxDate: '',

    // 职位类型
    positionTypes: db.POSITION_TYPES || ['副执行官', '教育部长'],
    positionTypeIndex: 0,

    // 起始时间（在onLoad中初始化）
    startTimes: [],
    startTimeIndex: 0,

    // 是否可以创建
    canCreate: false,

    // 配置列表
    configs: [],
    loading: true
  },

  onLoad: function () {
    this.initRole()
    this.initDateRange()
    this.initStartTimes()
    this.loadZones()
    this.loadConfigs()
  },

  onShow: function () {
    // 每次显示时重新加载配置
    this.loadConfigs()
  },

  // 初始化日期范围
  initDateRange: function () {
    const today = new Date()
    const year = today.getFullYear()

    // 最小日期为今天
    const minDate = this.formatDate(today)

    // 最大日期为一年后
    const maxDate = this.formatDate(new Date(year + 1, today.getMonth(), today.getDate()))

    this.setData({
      minDate: minDate,
      maxDate: maxDate
    })
  },

  // 初始化起始时间选项（从0:00到0:30，每分钟一个选项，共31个）
  initStartTimes: function () {
    const times = []
    for (let minute = 0; minute <= 30; minute++) {
      times.push(`0:${String(minute).padStart(2, '0')}`)
    }
    this.setData({
      startTimes: times
    })
  },

  // 初始化角色信息
  initRole: function () {
    const role = app.globalData.role || 'admin'
    const isSuperAdmin = role === 'superAdmin'
    this.setData({
      role: role,
      isSuperAdmin: isSuperAdmin,
      showZonePicker: isSuperAdmin
    })
  },

  // 加载分区列表
  loadZones: async function () {
    try {
      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid
      const role = this.data.role

      let zones
      if (role === 'superAdmin') {
        // 超管可以看到所有分区
        zones = await db.getAllZones()
      } else {
        // 区管只能看到自己创建的分区
        zones = await db.getZonesByCreator(userId)
      }

      if (zones && zones.length > 0) {
        // 优先使用全局分区，其次使用本地存储，最后默认第一个
        let currentZone = zones[0]
        let zoneIndex = 0

        // 从全局数据读取当前分区
        if (app.globalData.currentZone) {
          const foundIndex = zones.findIndex(z => z._id === app.globalData.currentZone._id)
          if (foundIndex >= 0) {
            currentZone = zones[foundIndex]
            zoneIndex = foundIndex
          }
        } else {
          // 从本地存储读取上次选择的分区
          const lastZoneId = wx.getStorageSync('lastPositionZoneId')
          if (lastZoneId) {
            const foundIndex = zones.findIndex(z => z._id === lastZoneId)
            if (foundIndex >= 0) {
              currentZone = zones[foundIndex]
              zoneIndex = foundIndex
            }
          }
        }

        this.setData({
          zones: zones,
          currentZone: currentZone,
          zoneIndex: zoneIndex,
          canCreate: this.checkCanCreate()
        })
      } else {
        // 没有分区时
        this.setData({
          zones: [],
          currentZone: null,
          canCreate: false
        })
        // 超管提示创建分区，区管提示创建分区
        util.showInfo('当前没有分区，请先创建分区')
      }
    } catch (err) {
      console.error('加载分区失败:', err)
      util.showError('加载分区失败')
    }
  },

  // 分区选择变化
  onZoneChange: function (e) {
    const index = parseInt(e.detail.value)
    const currentZone = this.data.zones[index]
    wx.setStorageSync('lastPositionZoneId', currentZone._id)
    this.setData({
      zoneIndex: index,
      currentZone: currentZone,
      canCreate: this.checkCanCreate()
    })
  },

  // 格式化日期
  formatDate: function (date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  // 日期选择变化
  onDateChange: function (e) {
    const selectedDate = e.detail.value
    this.setData({
      selectedDate: selectedDate,
      canCreate: this.checkCanCreate()
    })
  },

  // 职位类型选择变化
  onPositionTypeChange: function (e) {
    const index = parseInt(e.detail.value)
    this.setData({
      positionTypeIndex: index
    })
  },

  // 起始时间选择变化
  onStartTimeChange: function (e) {
    const index = parseInt(e.detail.value)
    this.setData({
      startTimeIndex: index
    })
  },

  // 检查是否可以创建（需要选择日期和分区）
  checkCanCreate: function () {
    const hasDate = this.data.selectedDate !== ''
    const hasZone = this.data.currentZone !== null
    return hasDate && hasZone
  },

  // 创建配置
  createConfig: async function () {
    try {
      if (!this.data.canCreate) {
        if (!this.data.selectedDate) {
          util.showInfo('请选择日期')
        } else if (!this.data.currentZone) {
          util.showInfo('请选择分区')
        }
        return
      }

      util.showLoading('正在创建...')

      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

      const data = {
        positionType: this.data.positionTypes[this.data.positionTypeIndex],
        date: this.data.selectedDate,
        startTime: this.data.startTimes[this.data.startTimeIndex],
        zoneId: this.data.currentZone._id,
        zoneName: this.data.currentZone.zoneName,
        creatorId: userId
      }

      await db.createPositionConfig(data)

      util.hideLoading()
      util.showSuccess('创建成功')

      // 重置表单（保留分区选择）
      this.setData({
        selectedDate: '',
        canCreate: this.checkCanCreate()
      })

      // 重新加载配置列表
      this.loadConfigs()

    } catch (err) {
      util.hideLoading()
      console.error('创建配置失败:', err)
      util.showError(err.message || '创建失败')
    }
  },

  // 加载配置列表
  loadConfigs: async function () {
    try {
      this.setData({ loading: true })

      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid
      const role = app.globalData.role

      // 区管只能看到自己创建的配置，超管可以看到所有配置
      let configs
      if (role === 'superAdmin') {
        configs = await db.getPositionConfigs()
      } else {
        configs = await db.getPositionConfigs({ creatorId: userId })
      }

      // 获取每个配置的报名人数
      const processedConfigs = []
      for (const config of configs) {
        const registrations = await db.getPositionRegistrationsByConfig(config._id)
        processedConfigs.push({
          ...config,
          registrationCount: registrations.length
        })
      }

      this.setData({
        configs: processedConfigs,
        loading: false
      })

    } catch (err) {
      console.error('加载配置失败:', err)
      this.setData({ loading: false })
      util.showError('加载配置失败')
    }
  },

  // 清空数据
  clearData: async function (e) {
    const configId = e.currentTarget.dataset.configId
    const configInfo = e.currentTarget.dataset.configInfo

    const confirm = await util.showConfirm(
      '确认清空',
      `确定要清空「${configInfo}」的所有报名数据吗？此操作不可恢复。`
    )

    if (!confirm) return

    try {
      util.showLoading('正在清空...')

      const count = await db.clearPositionRegistrations(configId)

      util.hideLoading()
      util.showSuccess(`已清空 ${count} 条报名记录`)

      // 重新加载配置列表
      this.loadConfigs()

    } catch (err) {
      util.hideLoading()
      console.error('清空数据失败:', err)
      util.showError('清空失败')
    }
  },

  // 删除配置
  deleteConfig: async function (e) {
    const configId = e.currentTarget.dataset.configId
    const configInfo = e.currentTarget.dataset.configInfo

    const confirm = await util.showConfirm(
      '确认删除',
      `确定要删除「${configInfo}」配置吗？已有的报名记录将被保留。`
    )

    if (!confirm) return

    try {
      util.showLoading('正在删除...')

      await db.deletePositionConfig(configId)

      util.hideLoading()
      util.showSuccess('删除成功')

      // 重新加载配置列表
      this.loadConfigs()

    } catch (err) {
      util.hideLoading()
      console.error('删除配置失败:', err)
      util.showError('删除失败')
    }
  },

  // 跳转到分区管理
  goToZoneManage: function () {
    wx.navigateTo({
      url: '/pages/admin/zone-manage/zone-manage'
    })
  }
})