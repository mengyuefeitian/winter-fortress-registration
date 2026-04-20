// pages/admin/position-manage/position-manage.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')

Page({
  data: {
    // 日期选择
    selectedDate: '',
    minDate: '',
    maxDate: '',

    // 职位类型
    positionTypes: db.POSITION_TYPES || ['副执行官', '教育部长'],
    positionTypeIndex: 0,

    // 起始时间
    startTimes: ['0:00', '0:30'],
    startTimeIndex: 0,

    // 是否可以创建
    canCreate: false,

    // 配置列表
    configs: [],
    loading: true
  },

  onLoad: function () {
    this.initDateRange()
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

  // 检查是否可以创建
  checkCanCreate: function () {
    return this.data.selectedDate !== ''
  },

  // 创建配置
  createConfig: async function () {
    try {
      if (!this.data.canCreate) {
        util.showInfo('请选择日期')
        return
      }

      util.showLoading('正在创建...')

      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

      const data = {
        positionType: this.data.positionTypes[this.data.positionTypeIndex],
        date: this.data.selectedDate,
        startTime: this.data.startTimes[this.data.startTimeIndex],
        creatorId: userId
      }

      await db.createPositionConfig(data)

      util.hideLoading()
      util.showSuccess('创建成功')

      // 重置表单
      this.setData({
        selectedDate: '',
        canCreate: false
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
  }
})