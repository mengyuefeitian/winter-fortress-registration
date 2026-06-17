// pages/admin/arsenal-config/arsenal-config.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')
const auth = require('../../../utils/auth')
const cache = require('../../../utils/cache')

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
    loading: false,
    zonesLoaded: false
  },

  onLoad: function () {
    this.initDateRange()
    this.waitForRoleReady()
  },

  onShow: function () {
    // 只在从其他页面返回时刷新（例如添加配置后返回）
    // 首次加载由 onLoad → waitForRoleReady → checkPermission 处理
    if (app.globalData.roleReady && this.data.zonesLoaded) {
      // 快速路径：若已选分区有缓存，先渲染
      const arZone = this.data.selectedZone
      if (arZone) {
        const arCached = cache.get('cfg_arsenal_' + arZone._id)
        if (arCached) {
          this.setData({
            configs: arCached.configs || [],
            alliances: arCached.alliances || [],
            loading: false
          })
        }
      }
      if (arCached) {
        this.loadZones(true)
        return
      }
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
    if (!auth.isAdminOrAbove(role)) {
      util.showError('权限不足')
      wx.switchTab({
        url: '/pages/index/index'
      })
      return
    }
    this.loadZones()
  },

  // 加载分区列表（区管只能看到自己管理的分区）
  // silent=true 时跳过 loading: true，用于缓存命中后的后台刷新
  loadZones: async function (silent) {
    try {
      if (!silent) this.setData({ loading: true })

      // 确保 userInfo 已加载
      if (!app.globalData.userInfo || !app.globalData.userInfo._id) {
        console.warn('userInfo not ready, retrying...')
        this.setData({ loading: false })
        // 延迟重试
        setTimeout(() => this.loadZones(), 500)
        return
      }

      const userId = app.globalData.userInfo._id
      const role = app.globalData.role || 'admin'

      console.log('admin arsenal-config loadZones, userId:', userId, 'role:', role)

      let zones
      if (role === 'superAdmin') {
        zones = await db.getAllZones()
      } else {
        zones = await db.getZonesByCreator(userId)
      }

      console.log('loadZones result, zones count:', zones ? zones.length : 0)

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
          loading: false,
          zonesLoaded: true
        })
        this.loadAlliances(selectedZone._id, silent)
      } else {
        console.log('No zones found for userId:', userId, 'role:', role)
        // 诊断：直接查询 zones 中 adminIds 包含当前 userId 的记录
        try {
          const wxdb = wx.cloud.database()
          const _ = wxdb.command
          const diagRes = await wxdb.collection('zones').where({
            status: 'active'
          }).limit(20).get()
          console.log('[诊断] 所有活跃分区:', JSON.stringify(diagRes.data.map(z => ({
            _id: z._id, zoneName: z.zoneName, creatorId: z.creatorId, adminIds: z.adminIds
          }))))
        } catch (diagErr) {
          console.log('[诊断] 查询分区失败:', diagErr)
        }
        this.setData({
          zones: [],
          selectedZone: null,
          alliances: [],
          selectedAlliance: null,
          loading: false,
          zonesLoaded: true
        })
        util.showInfo('您当前没有管理任何分区，请联系超管开通权限')
      }
    } catch (err) {
      console.error('加载分区失败:', err)
      util.showError('加载分区失败: ' + (err.message || '未知错误'))
      this.setData({ loading: false })
    }
  },

  // 加载联盟列表
  loadAlliances: async function (zoneId, silent) {
    try {
      const alliances = await db.getAlliancesByZone(zoneId)
      this.setData({
        alliances: alliances || [],
        allianceIndex: 0
      })

      if (alliances && alliances.length > 0) {
        this.setData({ selectedAlliance: alliances[0] })
        this.loadConfigs(silent)
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
        zoneName: this.data.selectedZone.zoneName || '',
        allianceId: this.data.selectedAlliance._id,
        allianceName: this.data.selectedAlliance.allianceName || '',
        activityType: this.data.selectedActivityType === '兵工厂' ? 'arsenal' : 'canyon'
      }

      if (this.data.selectedActivityType === '兵工厂') {
        await db.createArsenalConfig(configData)
      } else {
        await db.createCanyonConfig(configData)
      }

      util.hideLoading()
      util.showSuccess('添加成功')

      const arAddZoneId = this.data.selectedZone ? this.data.selectedZone._id : null
      if (arAddZoneId) {
        cache.invalidate('cfg_arsenal_' + arAddZoneId)
        cache.invalidate('arsenal_' + arAddZoneId)
        cache.invalidate('canyon_' + arAddZoneId)
      }

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

      const arDelZoneId = this.data.selectedZone ? this.data.selectedZone._id : null
      if (arDelZoneId) {
        cache.invalidate('cfg_arsenal_' + arDelZoneId)
        cache.invalidate('arsenal_' + arDelZoneId)
        cache.invalidate('canyon_' + arDelZoneId)
      }

    } catch (err) {
      util.hideLoading()
      util.showError('删除失败')
    }
  },

  // 加载配置列表
  // silent=true 时跳过 loading: true，用于缓存命中后的后台刷新
  loadConfigs: async function (silent) {
    try {
      if (!this.data.selectedAlliance) {
        this.setData({ configs: [], loading: false })
        return
      }

      if (!silent) this.setData({ loading: true })

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

      const arCacheZoneId = this.data.selectedZone ? this.data.selectedZone._id : null
      if (arCacheZoneId) {
        cache.set('cfg_arsenal_' + arCacheZoneId, {
          configs: allConfigs,
          alliances: this.data.alliances || [],
          selectedZone: this.data.selectedZone
        }, 30 * 1000)
      }

    } catch (err) {
      console.error('加载配置失败:', err)
      this.setData({ loading: false })
      util.showError('加载配置失败')
    }
  }
})
