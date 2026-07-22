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
    // 冷启动恢复分区（小程序进程被杀后 globalData 会丢失，导致缓存命中不了而走完整冷加载）
    if (!app.globalData.currentZone) {
      const savedZone = wx.getStorageSync('positionZoneCache')
      if (savedZone && savedZone._id) {
        app.globalData.currentZone = savedZone
      }
    }

    // 快速路径：若分区已知且有缓存，先渲染（内存缓存或持久化缓存）
    const zone = app.globalData.currentZone
    if (zone) {
      const cached = cache.get('position_' + zone._id) || this._readStorageCache(zone._id)
      if (cached) {
        this.setData({
          configs: cached.configs,
          selectedZone: cached.selectedZone || zone,
          noZoneSelected: false,
          loading: false
        })
        this.loadConfigs(true) // 后台静默刷新
        return
      }
    }
    this.loadConfigs()
  },

  // ===== 持久化配置缓存（跨进程杀存活，避免冷启动重新走云函数）=====
  _readStorageCache: function (zoneId) {
    try {
      const raw = wx.getStorageSync('posCfg_' + zoneId)
      if (raw && raw.ts && (Date.now() - raw.ts < 10 * 60 * 1000)) {
        return raw.data
      }
    } catch (e) {}
    return null
  },

  _writeStorageCache: function (zoneId, data) {
    try {
      wx.setStorageSync('posCfg_' + zoneId, { data: data, ts: Date.now() })
    } catch (e) {}
  },

  // 解析当前分区：优先内存/全局，其次分享链接，再次本地存储，最后兜底取首个活跃分区
  _resolveZone: async function () {
    let selectedZone = app.globalData.currentZone
    if (selectedZone) return selectedZone

    if (this._pendingZoneId) {
      try {
        const wxdb = wx.cloud.database()
        const res = await wxdb.collection('zones').doc(this._pendingZoneId).get()
        if (res.data && res.data.status !== 'inactive') {
          selectedZone = res.data
          app.globalData.currentZone = selectedZone
          wx.setStorageSync('lastZoneId', selectedZone._id)
          wx.setStorageSync('positionZoneCache', selectedZone)
          this._pendingZoneId = null
          return selectedZone
        }
      } catch (e) { console.error('从分享链接恢复分区失败:', e) }
    }

    const lastZoneId = wx.getStorageSync('lastZoneId')
    if (lastZoneId) {
      try {
        const wxdb = wx.cloud.database()
        const res = await wxdb.collection('zones').doc(lastZoneId).get()
        if (res.data && res.data.status !== 'inactive') {
          selectedZone = res.data
          app.globalData.currentZone = selectedZone
          wx.setStorageSync('positionZoneCache', selectedZone)
          return selectedZone
        }
      } catch (e) { console.error('从本地存储恢复分区失败:', e) }
    }

    // 兜底：无本地记录时加载分区列表取首个
    try {
      const wxdb = wx.cloud.database()
      const res = await wxdb.collection('zones').where({ status: 'active' }).orderBy('createTime', 'desc').limit(100).get()
      if (res.data.length > 0) {
        selectedZone = res.data[0]
        app.globalData.currentZone = selectedZone
        wx.setStorageSync('lastZoneId', selectedZone._id)
        wx.setStorageSync('positionZoneCache', selectedZone)
        return selectedZone
      }
    } catch (e) { console.error('加载分区列表失败:', e) }

    return null
  },

  // silent=true 时跳过 loading: true，用于缓存命中后的后台刷新
  loadConfigs: async function (silent) {
    try {
      // 并行：尽早恢复/确认分区 + 拉取配置（配置全局，分区过滤在客户端做）
      const zonePromise = this._resolveZone()
      const configsPromise = db.getPositionConfigs()

      const selectedZone = await zonePromise
      if (!selectedZone) {
        this.setData({ configs: [], selectedZone: null, noZoneSelected: true, loading: false })
        return
      }

      this.setData({
        selectedZone: selectedZone,
        noZoneSelected: false,
        loading: silent ? false : true
      })
      wx.setStorageSync('positionZoneCache', selectedZone)

      const today = util.formatDate(new Date(), 'YYYY-MM-DD')
      const allConfigs = await configsPromise

      let validConfigs = allConfigs.filter(config => config.date && config.date >= today)
      validConfigs = validConfigs.filter(config => !config.zoneId || config.zoneId === selectedZone._id)
      validConfigs.sort((a, b) => {
        if (a.date === b.date) return a.positionType.localeCompare(b.positionType)
        return a.date.localeCompare(b.date)
      })

      // 1) 先渲染配置外壳（不带报名人数），保证立即出列表
      const shellConfigs = validConfigs.map(config => ({
        ...config,
        registeredCount: 0,
        totalSlots: db.generatePositionTimeSlots(config.startTime).length
      }))
      this.setData({ configs: shellConfigs, loading: false })

      // 2) 单次查询统计所有配置的报名人数（替代每个配置一次 count，减少多次往返）
      const validIds = validConfigs.map(c => c._id)
      const countByConfig = {}
      if (validIds.length > 0) {
        try {
          const wxdb = wx.cloud.database()
          const _ = wxdb.command
          const regs = await wxdb.collection('positionRegistrations')
            .where({ status: 'active', configId: _.in(validIds) })
            .field({ configId: true, _id: true })
            .limit(1000)
            .get()
          regs.data.forEach(r => {
            if (r.configId) countByConfig[r.configId] = (countByConfig[r.configId] || 0) + 1
          })
        } catch (err) {
          console.error('统计报名人数失败:', err)
        }
      }

      const processedConfigs = validConfigs.map(config => ({
        ...config,
        registeredCount: countByConfig[config._id] || 0,
        totalSlots: db.generatePositionTimeSlots(config.startTime).length
      }))

      this.setData({ configs: processedConfigs })

      // 写入内存缓存 + 持久化缓存（10 分钟），覆盖冷启动场景
      const cacheZoneId = selectedZone._id
      cache.set('position_' + cacheZoneId, { configs: processedConfigs, selectedZone: selectedZone }, 10 * 60 * 1000)
      this._writeStorageCache(cacheZoneId, { configs: processedConfigs, selectedZone: selectedZone })

    } catch (err) {
      console.error('加载配置失败:', err)
      this.setData({ configs: [], noZoneSelected: false, loading: false })
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
