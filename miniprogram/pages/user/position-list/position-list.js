// pages/user/position-list/position-list.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')
const cache = require('../../../utils/cache')

Page({
  data: {
    loading: false,
    configs: [],
    selectedZone: null,
    noZoneSelected: false,
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
    // 快速路径：若分区已知且有缓存，先渲染
    const zone = app.globalData.currentZone
    if (zone) {
      const cached = cache.get('position_' + zone._id)
      if (cached) {
        this.setData({
          configs: cached.configs,
          selectedZone: cached.selectedZone,
          noZoneSelected: false,
          loading: false
        })
        this.loadConfigs(true)
        return
      }
    }
    this.loadConfigs()
  },

  // silent=true 时跳过 loading: true，用于缓存命中后的后台刷新
  loadConfigs: async function (silent) {
    try {
      // 使用首页选择的分区，如果没有则从分享链接恢复
      let selectedZone = app.globalData.currentZone

      if (!selectedZone && this._pendingZoneId) {
        const wxdb = wx.cloud.database()
        try {
          const res = await wxdb.collection('zones').doc(this._pendingZoneId).get()
          if (res.data && res.data.status !== 'inactive') {
            selectedZone = res.data
            app.globalData.currentZone = selectedZone
            wx.setStorageSync('lastZoneId', selectedZone._id)
            this._pendingZoneId = null
          }
        } catch (err) {
          console.error('从分享链接恢复分区失败:', err)
        }
      }

      if (!selectedZone) {
        const lastZoneId = wx.getStorageSync('lastZoneId')
        if (lastZoneId) {
          const wxdb = wx.cloud.database()
          try {
            const res = await wxdb.collection('zones').doc(lastZoneId).get()
            if (res.data && res.data.status !== 'inactive') {
              selectedZone = res.data
              app.globalData.currentZone = selectedZone
            }
          } catch (err) {
            console.error('从本地存储恢复分区失败:', err)
          }
        }
      }

      // 如果仍然没有分区，尝试加载分区列表
      if (!selectedZone) {
        const wxdb = wx.cloud.database()
        try {
          const res = await wxdb.collection('zones').where({
            status: 'active'
          }).orderBy('createTime', 'desc').limit(100).get()
          if (res.data.length > 0) {
            selectedZone = res.data[0]
            app.globalData.currentZone = selectedZone
            wx.setStorageSync('lastZoneId', selectedZone._id)
          }
        } catch (err) {
          console.error('加载分区列表失败:', err)
        }
      }

      if (!selectedZone) {
        this.setData({
          configs: [],
          selectedZone: null,
          noZoneSelected: true,
          loading: false
        })
        return
      }

      this.setData({
        selectedZone: selectedZone,
        noZoneSelected: false,
        loading: silent ? false : true
      })

      // 获取今天的日期字符串（只保留日期部分）
      const today = util.formatDate(new Date(), 'YYYY-MM-DD')

      // 获取所有活跃的官职配置
      const allConfigs = await db.getPositionConfigs()

      // 筛选今天及以后的配置
      let validConfigs = allConfigs.filter(config => {
        return config.date && config.date >= today
      })

      // 按分区过滤：只显示该分区和全局配置
      validConfigs = validConfigs.filter(config => !config.zoneId || config.zoneId === selectedZone._id)

      // 按日期排序
      validConfigs.sort((a, b) => {
        if (a.date === b.date) {
          return a.positionType.localeCompare(b.positionType)
        }
        return a.date.localeCompare(b.date)
      })

      // 并行 count 查询每个配置的报名人数（替代原 for 循环顺序查询）
      const wxdb = wx.cloud.database()
      const countResults = await Promise.all(validConfigs.map(async (config) => {
        const res = await wxdb.collection('positionRegistrations').where({
          configId: config._id,
          status: 'active'
        }).count()
        return { configId: config._id, count: res.total || 0 }
      }))

      const countByConfig = {}
      for (const { configId, count } of countResults) {
        countByConfig[configId] = count
      }

      const processedConfigs = validConfigs.map(config => {
        const slots = db.generatePositionTimeSlots(config.startTime)
        return {
          ...config,
          registeredCount: countByConfig[config._id] || 0,
          totalSlots: slots.length
        }
      })

      this.setData({
        configs: processedConfigs,
        loading: false
      })

      const cacheZoneId = selectedZone ? selectedZone._id : null
      if (cacheZoneId) {
        cache.set('position_' + cacheZoneId, {
          configs: processedConfigs,
          selectedZone: selectedZone
        })
      }

    } catch (err) {
      console.error('加载配置失败:', err)
      this.setData({
        configs: [],
        noZoneSelected: false,
        loading: false
      })
      util.showError('加载失败')
    }
  },

  // 跳转到座位选择页
  goToRegistration: function (e) {
    const configId = e.currentTarget.dataset.configId
    wx.navigateTo({
      url: `/pages/user/position-registration/position-registration?configId=${configId}`
    })
  },

  // 分享
  onShareAppMessage: function () {
    const zone = this.data.selectedZone || app.globalData.currentZone
    const path = zone
      ? `/pages/user/position-list/position-list?zoneId=${zone._id}`
      : '/pages/user/position-list/position-list'
    const title = zone
      ? `官职报名 - ${zone.zoneName}`
      : '官职报名 - 无尽冬日'
    return {
      title: title,
      path: path
    }
  }
})
