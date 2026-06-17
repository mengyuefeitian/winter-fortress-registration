// pages/user/canyon-registration/canyon-registration.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')
const cache = require('../../../utils/cache')

// 位置选项：参战/替补
const POSITION_OPTIONS = [
  { value: 'combat', label: '参战' },
  { value: 'substitute', label: '替补' }
]

// 各位置容量
const POSITION_CAPACITY = {
  combat: 30,
  substitute: 10
}

const ACTIVITY_TYPE_LABELS = {
  'arsenal': '兵工厂',
  'canyon': '峡谷会战'
}

Page({
  data: {
    ACTIVITY_TYPE_LABELS: ACTIVITY_TYPE_LABELS,
    alliances: [],
    allianceIndex: 0,
    selectedAlliance: null,

    configs: [],
    selectedConfig: null,

    registrations: [],

    nickName: '',
    position: 'combat',
    loading: true,
    isLoggedIn: false,
    selectedZone: null,
    showTip: false,

    POSITION_OPTIONS: POSITION_OPTIONS
  },

  onLoad: function (options) {
    if (options && options.zoneId) {
      this._pendingZoneId = options.zoneId
    }
    // onShow 由小程序框架在 onLoad 后自动调用，无需手动调用
  },

  onShow: function () {
    this.checkLoginAndLoadData()
  },

  // 切换提示信息显示
  toggleTip: function () {
    this.setData({ showTip: !this.data.showTip })
  },

  // 检查登录并加载数据
  checkLoginAndLoadData: function () {
    const userInfo = app.globalData.userInfo

    if (userInfo && userInfo.nickName) {
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

    const zone = app.globalData.currentZone
    if (zone) {
      const cached = cache.get('canyon_' + zone._id)
      if (cached) {
        this.setData({
          selectedZone: cached.selectedZone,
          alliances: cached.alliances || [],
          configs: cached.configs || [],
          loading: false
        })
        // 后台静默刷新，不显示 loading
        this.loadAlliancesFromCurrentZone(true)
        return
      }
    }

    this.loadAlliancesFromCurrentZone()
  },

  // 从首页选择的分区加载联盟
  // silent=true 时跳过 loading: true，用于缓存命中后的后台刷新
  loadAlliancesFromCurrentZone: async function (silent) {
    try {
      if (!silent) this.setData({ loading: true })

      let zone = app.globalData.currentZone

      if (!zone && this._pendingZoneId) {
        const wxdb = wx.cloud.database()
        try {
          const res = await wxdb.collection('zones').doc(this._pendingZoneId).get()
          if (res.data && res.data.status !== 'inactive') {
            zone = res.data
            app.globalData.currentZone = zone
            wx.setStorageSync('lastZoneId', zone._id)
            this._pendingZoneId = null
          }
        } catch (err) {
          console.error('从分享链接恢复分区失败:', err)
        }
      }

      if (!zone) {
        const lastZoneId = wx.getStorageSync('lastZoneId')
        if (lastZoneId) {
          const wxdb = wx.cloud.database()
          try {
            const res = await wxdb.collection('zones').doc(lastZoneId).get()
            if (res.data && res.data.status !== 'inactive') {
              zone = res.data
              app.globalData.currentZone = zone
            }
          } catch (err) {
            console.error('从本地存储恢复分区失败:', err)
          }
        }
      }

      if (!zone) {
        const wxdb = wx.cloud.database()
        try {
          const res = await wxdb.collection('zones').where({
            status: 'active'
          }).orderBy('createTime', 'desc').limit(100).get()
          if (res.list.length > 0) {
            zone = res.list[0]
            app.globalData.currentZone = zone
            wx.setStorageSync('lastZoneId', zone._id)
          }
        } catch (err) {
          console.error('加载分区列表失败:', err)
        }
      }

      if (!zone) {
        this.setData({
          selectedZone: null,
          alliances: [],
          selectedAlliance: null,
          loading: false
        })
        return
      }

      this.setData({ selectedZone: zone })
      await this.loadAlliances(zone._id)
    } catch (err) {
      console.error('加载联盟失败:', err)
      this.setData({ loading: false })
    }
  },

  // 加载联盟列表
  loadAlliances: async function (zoneId) {
    try {
      const alliances = await db.getAlliancesByZone(zoneId)

      if (alliances.length > 0) {
        const lastAllianceId = wx.getStorageSync('lastAllianceId')
        let selectedAlliance = null
        let allianceIndex = -1

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
          allianceIndex: allianceIndex,
          loading: false
        })

        if (selectedAlliance) {
          this.loadConfigs()
        }
      } else {
        this.setData({
          alliances: [],
          selectedAlliance: null,
          allianceIndex: -1,
          loading: false
        })
      }

    } catch (err) {
      console.error('加载联盟失败:', err)
      this.setData({ loading: false })
    }
  },

  // 加载峡谷配置列表
  loadConfigs: async function () {
    try {
      if (!this.data.selectedAlliance) return

      const allianceId = this.data.selectedAlliance._id
      const configs = await db.getCanyonConfigs({ allianceId: allianceId })

      const today = this.getTodayString()
      const filteredConfigs = configs.filter(cfg => {
        if (!cfg.date) return true
        return cfg.date >= today
      })

      if (filteredConfigs.length === 0) {
        this.setData({ configs: [] })
        return
      }

      const currentUserId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

      // 并行查询所有配置的统计数据（云函数端权限，count查询快速返回）
      const processedConfigs = await Promise.all(filteredConfigs.map(async (cfg) => {
        const stats = await this.getConfigStats(cfg._id)
        const combatCount = stats.combatCount || stats.combat || 0
        const substituteCount = stats.substituteCount || stats.substitute || 0
        const combatFull = combatCount >= POSITION_CAPACITY.combat
        const substituteFull = substituteCount >= POSITION_CAPACITY.substitute
        const totalCount = combatCount + substituteCount
        const totalCapacity = POSITION_CAPACITY.combat + POSITION_CAPACITY.substitute
        const myRegistrations = stats.myRegistrations || stats.registrations || []

        return {
          ...cfg,
          combatCount,
          substituteCount,
          totalCount,
          totalCapacity,
          combatFull,
          substituteFull,
          isFull: combatFull && substituteFull,
          isMyConfig: currentUserId ? myRegistrations.some(r => r.userId === currentUserId) : false,
          myPositions: currentUserId ? myRegistrations.filter(r => r.userId === currentUserId).map(r => r.position) : []
        }
      }))

      this.setData({
        configs: processedConfigs
      })

      const canyonZoneId = this.data.selectedZone ? this.data.selectedZone._id : null
      if (canyonZoneId) {
        cache.set('canyon_' + canyonZoneId, {
          selectedZone: this.data.selectedZone,
          alliances: this.data.alliances || [],
          configs: this.data.configs || []
        })
      }

    } catch (err) {
      console.error('加载配置失败:', err)
    }
  },

  getConfigStats: async function (configId) {
    try {
      const currentUserId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid
      const stats = await db.getCanyonStats(configId, { userId: currentUserId })
      return stats || { combatCount: 0, combat: 0, substituteCount: 0, substitute: 0, myRegistrations: [] }
    } catch (err) {
      console.error('获取配置统计失败:', err)
      return { combatCount: 0, combat: 0, substituteCount: 0, substitute: 0, myRegistrations: [] }
    }
  },

  // 获取今天的日期字符串（YYYY-MM-DD）
  getTodayString: function () {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  // 联盟选择变化
  onAllianceChange: function (e) {
    const index = e.detail.value
    const alliance = this.data.alliances[index]

    wx.setStorageSync('lastAllianceId', alliance._id)

    this.setData({
      allianceIndex: index,
      selectedAlliance: alliance,
      selectedConfig: null,
      registrations: []
    })

    this.loadConfigs()
  },

  // 选择配置
  selectConfig: async function (e) {
    const index = e.currentTarget.dataset.index
    const config = this.data.configs[index]

    if (config.isFull && !config.isMyConfig) {
      util.showInfo('该配置报名已满')
      return
    }

    await this.loadRegistrations(config._id)

    this.setData({
      selectedConfig: config
    })
  },

  // 加载已报名人员
  loadRegistrations: async function (configId) {
    try {
      const registrations = await db.getCanyonRegistrations(configId)

      const currentUserId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

      const processed = registrations.map(r => ({
        ...r,
        isMine: currentUserId && r.userId === currentUserId
      }))

      processed.sort((a, b) => (a.position === 'substitute' ? -1 : 1) - (b.position === 'substitute' ? -1 : 1))

      this.setData({
        registrations: processed
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

      const zone = this.data.selectedZone || app.globalData.currentZone
      if (!zone) {
        util.showInfo('请先在首页选择分区')
        return
      }

      if (!this.data.selectedAlliance) {
        util.showInfo('请选择联盟')
        return
      }

      if (!this.data.nickName) {
        util.showInfo('请输入昵称')
        return
      }

      if (!this.data.selectedConfig) {
        util.showInfo('请选择配置')
        return
      }

      if (this.data.selectedConfig.isFull) {
        util.showInfo('该配置报名人数已满')
        return
      }

      // 检查所选位置是否已满
      if (this.data.position === 'combat' && this.data.selectedConfig.isCombatFull) {
        util.showInfo('参战位置已满，请选择替补')
        return
      }
      if (this.data.position === 'substitute' && this.data.selectedConfig.isSubstituteFull) {
        util.showInfo('替补位置已满')
        return
      }

      util.showLoading('正在报名...')

      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

      await db.createCanyonRegistration({
        configId: this.data.selectedConfig._id,
        zoneId: zone._id,
        allianceId: this.data.selectedAlliance._id,
        userId: userId,
        nickName: this.data.nickName,
        position: this.data.position
      })

      util.hideLoading()
      util.showSuccess('报名成功')

      const canyonClearZoneId = this.data.selectedZone ? this.data.selectedZone._id : null
      if (canyonClearZoneId) cache.invalidate('canyon_' + canyonClearZoneId)
      const canyonClearUserId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid
      if (canyonClearUserId) cache.invalidate('myregs_' + canyonClearUserId)

      this.setData({
        selectedConfig: null,
        registrations: []
      })

      this.loadConfigs()

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
  },

  // 分享
  onShareAppMessage: function () {
    const zone = this.data.selectedZone || app.globalData.currentZone
    const path = zone
      ? `/pages/user/canyon-registration/canyon-registration?zoneId=${zone._id}`
      : '/pages/user/canyon-registration/canyon-registration'
    const title = zone
      ? `峡谷会战报名 - ${zone.zoneName}`
      : '峡谷会战报名 - 无尽冬日'
    return {
      title: title,
      path: path
    }
  }
})
