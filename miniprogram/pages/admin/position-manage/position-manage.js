// pages/admin/position-manage/position-manage.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')
const auth = require('../../../utils/auth')
const cache = require('../../../utils/cache')

Page({
  data: {
    // 当前角色
    role: '',
    isSuperAdmin: false,

    // 分区选择（超管可见）
    zones: [],
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
    this.initDateRange()
    this.initStartTimes()
    this.waitForRoleReady()
  },

  onShow: async function () {
    // 每次显示时重新加载分区和配置（角色已就绪）
    if (app.globalData.roleReady) {
      // 快速路径：若分区已知且有缓存，先渲染
      const pmZone = this.data.currentZone || app.globalData.currentZone
      let hadCache = false
      if (pmZone) {
        const pmCached = cache.get('cfg_position_' + pmZone._id)
        if (pmCached) {
          this.setData({ configs: pmCached.configs, loading: false })
          hadCache = true
        }
      }
      await this.loadZones()
      this.loadConfigs(hadCache)  // hadCache=true 时静默刷新，不显示 loading
    }
  },

  // 等待角色就绪
  waitForRoleReady: function () {
    if (app.globalData.roleReady) {
      this.checkPermission()
    } else {
      setTimeout(() => {
        this.waitForRoleReady()
      }, 100)
    }
  },

  // 检查权限
  checkPermission: async function () {
    const role = app.globalData.role || 'user'
    if (!auth.isAdminOrAbove(role)) {
      util.showError('权限不足')
      wx.switchTab({
        url: '/pages/index/index'
      })
      return
    }
    this.initRole()
    await this.loadZones()
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
      selectedDate: minDate,
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
      const role = app.globalData.role || 'admin'

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

        // 从全局数据读取当前分区
        if (app.globalData.currentZone) {
          const foundIndex = zones.findIndex(z => z._id === app.globalData.currentZone._id)
          if (foundIndex >= 0) {
            currentZone = zones[foundIndex]
          }
        } else {
          // 从本地存储读取上次选择的分区
          const lastZoneId = wx.getStorageSync('lastPositionZoneId')
          if (lastZoneId) {
            const foundIndex = zones.findIndex(z => z._id === lastZoneId)
            if (foundIndex >= 0) {
              currentZone = zones[foundIndex]
            }
          }
        }

        const hasDate = this.data.selectedDate !== ''
        const hasZone = currentZone !== null
        this.setData({
          zones: zones,
          currentZone: currentZone,
          canCreate: hasDate && hasZone
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

  // 分区选择变化（由组件内部处理全局状态同步）
  onZoneChange: function (e) {
    const currentZone = e.detail.zone
    if (!currentZone) return

    const hasDate = this.data.selectedDate !== ''
    const hasZone = currentZone !== null
    this.setData({
      currentZone: currentZone,
      canCreate: hasDate && hasZone
    })
    this.loadConfigs()
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
    const hasDate = selectedDate !== ''
    const hasZone = this.data.currentZone !== null
    this.setData({
      selectedDate: selectedDate,
      canCreate: hasDate && hasZone
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

      const result = await db.createPositionConfig(data)

      util.hideLoading()
      util.showSuccess('创建成功')

      const pmCreateZoneId = this.data.currentZone ? this.data.currentZone._id : null
      if (pmCreateZoneId) {
        cache.invalidate('cfg_position_' + pmCreateZoneId)
        cache.invalidate('position_' + pmCreateZoneId)
      }

      // 重置表单（保留分区选择）
      this.setData({
        selectedDate: this.data.minDate,
        canCreate: this.data.minDate !== '' && this.data.currentZone !== null
      })

      // 立即将新配置添加到本地列表，避免数据库索引延迟导致列表为空
      const newConfig = {
        _id: result._id,
        positionType: data.positionType,
        date: data.date,
        startTime: data.startTime,
        zoneId: data.zoneId,
        zoneName: data.zoneName,
        creatorId: data.creatorId,
        registrationCount: 0
      }
      this.setData({
        configs: [newConfig, ...this.data.configs]
      })

    } catch (err) {
      util.hideLoading()
      console.error('创建配置失败:', err)
      util.showError(err.message || '创建失败')
    }
  },

  // 加载配置列表
  // silent=true 时跳过 loading: true，用于缓存命中后的后台刷新
  loadConfigs: async function (silent) {
    try {
      if (!silent) this.setData({ loading: true })

      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

      // 区管和超管都按分区查看所有配置，避免重复创建
      let configs
      if (this.data.currentZone) {
        configs = await db.getPositionConfigs({ zoneId: this.data.currentZone._id })
      } else {
        configs = []
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

      const pmCacheZoneId = this.data.currentZone ? this.data.currentZone._id : null
      if (pmCacheZoneId) {
        cache.set('cfg_position_' + pmCacheZoneId, { configs: processedConfigs }, 30 * 1000)
      }

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
      `确定要删除「${configInfo}」配置吗？相关的报名记录也会被删除。`
    )

    if (!confirm) return

    try {
      util.showLoading('正在删除...')

      await db.deletePositionConfig(configId)

      util.hideLoading()
      util.showSuccess('删除成功')

      const pmDeleteZoneId = this.data.currentZone ? this.data.currentZone._id : null
      if (pmDeleteZoneId) {
        cache.invalidate('cfg_position_' + pmDeleteZoneId)
        cache.invalidate('position_' + pmDeleteZoneId)
      }

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