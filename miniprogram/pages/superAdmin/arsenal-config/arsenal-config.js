// pages/superAdmin/arsenal-config/arsenal-config.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')
const auth = require('../../../utils/auth')

// 活动类型和军团选项常量
const ACTIVITY_TYPE_OPTIONS = ['兵工厂', '峡谷会战']
const CORPS_OPTIONS = ['军团1', '军团2']
// 时间选项
const TIME_OPTIONS = ['12:00', '19:00', '20:30', '22:00']

Page({
  data: {
    TIME_OPTIONS: TIME_OPTIONS,
    ACTIVITY_TYPE_OPTIONS: ACTIVITY_TYPE_OPTIONS,
    CORPS_OPTIONS: CORPS_OPTIONS,
    selectedTimeIndex: 0,
    selectedTime: '12:00',
    selectedActivityType: '',
    selectedCorps: '',
    selectedDate: '',
    minDate: '',
    maxDate: '',

    zones: [],
    selectedZone: null,

    alliances: [],
    allianceIndex: 0,
    selectedAlliance: null,

    configs: [],
    loading: false
  },

  onLoad: function () {
    this.initDateRange()
    this.waitForRoleReady()
  },

  onShow: function () {
    if (app.globalData.roleReady) {
      this.loadZones()
    }
  },

  // 初始化日期范围
  initDateRange: function () {
    const today = new Date()
    const year = today.getFullYear()
    const minDate = this.formatDate(today)
    const maxDate = this.formatDate(new Date(year + 1, today.getMonth(), today.getDate()))
    this.setData({
      minDate: minDate,
      maxDate: maxDate,
      selectedDate: minDate
    })
  },

  // 格式化日期
  formatDate: function (date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
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
  checkPermission: function () {
    const role = app.globalData.role || 'user'
    if (!auth.isSuperAdmin(role)) {
      util.showError('权限不足')
      wx.switchTab({
        url: '/pages/index/index'
      })
      return
    }
    this.loadZones()
  },

  // 加载分区列表（超管可以看到所有分区）
  loadZones: async function () {
    try {
      const zones = await db.getAllZones()

      if (zones && zones.length > 0) {
        let selectedZone = zones[0]

        if (app.globalData.currentZone) {
          const foundIndex = zones.findIndex(z => z._id === app.globalData.currentZone._id)
          if (foundIndex >= 0) {
            selectedZone = zones[foundIndex]
          }
        }

        this.setData({
          zones: zones,
          selectedZone: selectedZone,
          loading: false
        })
        this.loadAlliances(selectedZone._id)
      } else {
        this.setData({
          zones: [],
          selectedZone: null,
          alliances: [],
          selectedAlliance: null,
          loading: false
        })
      }
    } catch (err) {
      console.error('加载分区失败:', err)
      util.showError('加载分区失败')
      this.setData({ loading: false })
    }
  },

  // 加载联盟列表
  loadAlliances: async function (zoneId) {
    try {
      const alliances = await db.getAlliancesByZone(zoneId)
      this.setData({
        alliances: alliances || [],
        allianceIndex: 0
      })

      if (alliances && alliances.length > 0) {
        this.setData({ selectedAlliance: alliances[0] })
        this.loadConfigs()
      } else {
        this.setData({
          selectedAlliance: null,
          configs: []
        })
      }
    } catch (err) {
      console.error('加载联盟失败:', err)
      util.showError('加载联盟失败')
    }
  },

  // 分区选择变化
  onZoneChange: function (e) {
    const zone = e.detail.zone
    if (!zone) return

    this.setData({
      selectedZone: zone,
      allianceIndex: 0,
      selectedAlliance: null,
      configs: []
    })
    this.loadAlliances(zone._id)
  },

  // 联盟选择变化
  onAllianceChange: function (e) {
    const index = parseInt(e.detail.value)
    const alliance = this.data.alliances[index]
    this.setData({
      allianceIndex: index,
      selectedAlliance: alliance
    })
    this.loadConfigs()
  },

  // 日期选择变化
  onDateChange: function (e) {
    this.setData({
      selectedDate: e.detail.value
    })
  },

  // 时间选择变化
  onTimeChange: function (e) {
    const index = parseInt(e.detail.value)
    this.setData({
      selectedTimeIndex: index,
      selectedTime: this.data.TIME_OPTIONS[index]
    })
  },

  // 选择活动类型
  onActivityTypeSelect: function (e) {
    const type = e.currentTarget.dataset.type
    this.setData({
      selectedActivityType: this.data.selectedActivityType === type ? '' : type
    })
  },

  // 选择军团
  onCorpsSelect: function (e) {
    const corps = e.currentTarget.dataset.corps
    this.setData({
      selectedCorps: this.data.selectedCorps === corps ? '' : corps
    })
  },

  // 添加配置
  addConfig: async function () {
    try {
      if (!this.data.selectedDate) {
        util.showInfo('请选择日期')
        return
      }
      if (!this.data.selectedTime) {
        util.showInfo('请选择时间')
        return
      }
      if (!this.data.selectedActivityType) {
        util.showInfo('请选择活动类型')
        return
      }
      if (!this.data.selectedCorps) {
        util.showInfo('请选择军团')
        return
      }

      util.showLoading('正在添加...')

      if (!this.data.selectedZone || !this.data.selectedZone._id) {
        util.hideLoading()
        util.showInfo('请先选择分区')
        return
      }
      if (!this.data.selectedAlliance || !this.data.selectedAlliance._id) {
        util.hideLoading()
        util.showInfo('请先选择联盟')
        return
      }

      const configData = {
        date: this.data.selectedDate,
        timeValue: this.data.selectedTime,
        corps: this.data.selectedCorps,
        zoneId: this.data.selectedZone._id,
        zoneName: this.data.selectedZone.zoneName,
        allianceId: this.data.selectedAlliance._id,
        allianceName: this.data.selectedAlliance.allianceName,
        activityType: this.data.selectedActivityType === '兵工厂' ? 'arsenal' : 'canyon'
      }

      if (this.data.selectedActivityType === '兵工厂') {
        await db.createArsenalConfig(configData)
      } else {
        await db.createCanyonConfig(configData)
      }

      util.hideLoading()
      util.showSuccess('添加成功')

      // 重置选择
      this.setData({
        selectedActivityType: '',
        selectedCorps: ''
      })

      // 重新加载配置列表
      this.loadConfigs()

    } catch (err) {
      util.hideLoading()
      console.error('添加失败:', err)
      util.showError('添加失败')
    }
  },

  // 删除配置
  deleteConfig: async function (e) {
    const configId = e.currentTarget.dataset.id
    const index = e.currentTarget.dataset.index

    const confirm = await util.showConfirm('确认删除', '确定要删除这个活动配置吗？')

    if (!confirm) return

    try {
      util.showLoading('正在删除...')

      const config = this.data.configs[index]
      if (config.activityType === 'arsenal') {
        await db.deleteArsenalConfig(configId)
      } else {
        await db.deleteCanyonConfig(configId)
      }

      const configs = this.data.configs.filter((_, i) => i !== index)

      this.setData({
        configs: configs
      })

      util.hideLoading()
      util.showSuccess('删除成功')

    } catch (err) {
      util.hideLoading()
      util.showError('删除失败')
    }
  },

  // 加载配置列表
  loadConfigs: async function () {
    try {
      if (!this.data.selectedAlliance) {
        this.setData({ configs: [], loading: false })
        return
      }

      this.setData({ loading: true })

      const [arsenalConfigs, canyonConfigs] = await Promise.all([
        db.getArsenalConfigs({ allianceId: this.data.selectedAlliance._id }),
        db.getCanyonConfigs({ allianceId: this.data.selectedAlliance._id })
      ])

      // 合并并按日期时间排序
      const allConfigs = [...arsenalConfigs, ...canyonConfigs]
        .map(config => ({
          ...config,
          activityTypeLabel: config.activityType === 'arsenal' ? '兵工厂' : '峡谷会战'
        }))
        .sort((a, b) => {
          const dateCompare = (a.date || '').localeCompare(b.date || '')
          if (dateCompare !== 0) return dateCompare
          return (a.timeValue || '').localeCompare(b.timeValue || '')
        })

      this.setData({
        configs: allConfigs,
        loading: false
      })

    } catch (err) {
      console.error('加载配置失败:', err)
      this.setData({ loading: false })
      util.showError('加载配置失败')
    }
  }
})
