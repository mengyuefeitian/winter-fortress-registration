// pages/user/arsenal-registration/arsenal-registration.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')
const cache = require('../../../utils/cache')

const POSITION_OPTIONS = [
  { label: '参战', value: 'combat' },
  { label: '替补', value: 'substitute' }
]

const ACTIVITY_TYPE_LABELS = {
  'arsenal': '兵工厂',
  'canyon': '峡谷会战'
}

const CAPACITY_LIMITS = {
  combat: 30,
  substitute: 10
}

Page({
  data: {
    POSITION_OPTIONS: POSITION_OPTIONS,
    ACTIVITY_TYPE_LABELS: ACTIVITY_TYPE_LABELS,
    selectedPosition: 'combat',
    nickName: '',
    isLoggedIn: false,
    selectedZone: null,

    alliances: [],
    allianceIndex: -1,
    selectedAlliance: null,

    configs: [],
    selectedConfig: null,
    registrations: [],
    loading: true,
    showTip: false
  },

  onLoad: function (options) {
    if (options && options.zoneId) {
      this._pendingZoneId = options.zoneId
    }
    this.waitForUserInfoReady()
  },

  waitForUserInfoReady: function () {
    if (app.globalData.userInfo) {
      this.checkLoginAndLoadData()
    } else {
      setTimeout(() => {
        this.waitForUserInfoReady()
      }, 100)
    }
  },

  onShow: function () {
    if (app.globalData.userInfo) {
      this.checkLoginAndLoadData()
    }
  },

  toggleTip: function () {
    this.setData({ showTip: !this.data.showTip })
  },

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
      const cached = cache.get('arsenal_' + zone._id)
      if (cached) {
        this.setData({
          selectedZone: cached.selectedZone,
          alliances: cached.alliances || [],
          configs: cached.configs || [],
          loading: false
        })
        // 后台静默刷新，不显示 loading
        this.loadConfigsFromCurrentZone(true)
        return
      }
    }

    this.loadConfigsFromCurrentZone()
  },

  // silent=true 时跳过 loading: true，用于缓存命中后的后台刷新
  loadConfigsFromCurrentZone: async function (silent) {
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
          configs: [],
          selectedConfig: null,
          loading: false
        })
        return
      }

      this.setData({ selectedZone: zone })
      await this.loadAlliances(zone._id)
    } catch (err) {
      console.error('加载分区失败:', err)
      this.setData({ loading: false })
    }
  },

  // 加载联盟列表
  loadAlliances: async function (zoneId) {
    try {
      const alliances = await db.getAlliancesByZone(zoneId)

      if (alliances && alliances.length > 0) {
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

  // 加载兵工厂配置列表（全部直接 DB 查询，无云函数调用）
  loadConfigs: async function () {
    try {
      if (!this.data.selectedAlliance) {
        this.setData({ configs: [], loading: false })
        return
      }

      const configs = await db.getArsenalConfigs({ allianceId: this.data.selectedAlliance._id })

      const today = this.getTodayString()
      const activeConfigs = configs.filter(function (cfg) {
        return !cfg.date || cfg.date >= today
      })

      if (activeConfigs.length === 0) {
        this.setData({ configs: [], loading: false })
        return
      }

      const currentUserId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid
      const configIds = activeConfigs.map(function (c) { return c._id })
      const wxdb = wx.cloud.database()

      // 并行：每个 config 的参战/替补人数 + 当前用户跨 config 的报名记录
      const [combatCounts, substituteCounts, myRegRes] = await Promise.all([
        Promise.all(configIds.map(function (id) {
          return wxdb.collection('arsenalRegistrations').where({
            configId: id, position: 'combat', status: 'active'
          }).count()
        })),
        Promise.all(configIds.map(function (id) {
          return wxdb.collection('arsenalRegistrations').where({
            configId: id, position: 'substitute', status: 'active'
          }).count()
        })),
        currentUserId ? wxdb.collection('arsenalRegistrations').where({
          configId: wxdb.command.in(configIds),
          userId: currentUserId,
          status: 'active'
        }).get() : Promise.resolve({ data: [] })
      ])

      const myPositionsByConfig = {}
      myRegRes.data.forEach(function (r) {
        if (!myPositionsByConfig[r.configId]) myPositionsByConfig[r.configId] = []
        myPositionsByConfig[r.configId].push(r.position)
      })

      const processed = activeConfigs.map(function (cfg, i) {
        const combatCount = combatCounts[i].total
        const substituteCount = substituteCounts[i].total
        const combatFull = combatCount >= CAPACITY_LIMITS.combat
        const substituteFull = substituteCount >= CAPACITY_LIMITS.substitute
        return Object.assign({}, cfg, {
          combatCount: combatCount,
          substituteCount: substituteCount,
          totalCount: combatCount + substituteCount,
          totalCapacity: CAPACITY_LIMITS.combat + CAPACITY_LIMITS.substitute,
          combatFull: combatFull,
          substituteFull: substituteFull,
          isFull: combatFull && substituteFull,
          isMyConfig: (myPositionsByConfig[cfg._id] || []).length > 0,
          myPositions: myPositionsByConfig[cfg._id] || []
        })
      })

      this.setData({ configs: processed, loading: false })

      const arsenalZoneId = this.data.selectedZone ? this.data.selectedZone._id : null
      if (arsenalZoneId) {
        cache.set('arsenal_' + arsenalZoneId, {
          selectedZone: this.data.selectedZone,
          alliances: this.data.alliances || [],
          configs: processed
        }, 5 * 60 * 1000)
      }
    } catch (err) {
      console.error('加载配置失败:', err)
      this.setData({ loading: false })
    }
  },

  getTodayString: function () {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  selectConfig: async function (e) {
    const index = e.currentTarget.dataset.index
    const config = this.data.configs[index]

    if (config.isFull && !config.isMyConfig) {
      util.showInfo('该活动报名人数已满')
      return
    }

    await this.loadRegistrations(config._id)

    this.setData({
      selectedConfig: config
    })
  },

  loadRegistrations: async function (configId) {
    try {
      const registrations = await db.getArsenalRegistrations(configId)

      const currentUserId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

      const processed = registrations.map(r => ({
        ...r,
        isMine: currentUserId && r.userId === currentUserId
      }))

      processed.sort((a, b) => {
        if (a.position === 'substitute' && b.position !== 'substitute') return -1
        if (a.position !== 'substitute' && b.position === 'substitute') return 1
        return 0
      })

      this.setData({
        registrations: processed
      })
    } catch (err) {
      console.error('加载报名列表失败:', err)
    }
  },

  onNickNameInput: function (e) {
    this.setData({
      nickName: e.detail.value
    })
  },

  selectPosition: function (e) {
    const position = e.currentTarget.dataset.position
    this.setData({
      selectedPosition: position
    })
  },

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

      if (!this.data.selectedConfig) {
        util.showInfo('请选择活动')
        return
      }

      if (!this.data.nickName) {
        util.showInfo('请输入昵称')
        return
      }

      if (this.data.selectedConfig.isFull) {
        util.showInfo('该活动报名人数已满')
        return
      }

      util.showLoading('正在报名...')

      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

      await db.createArsenalRegistration({
        configId: this.data.selectedConfig._id,
        userId: userId,
        nickName: this.data.nickName,
        position: this.data.selectedPosition
      })

      util.hideLoading()
      util.showSuccess('报名成功')

      const arsenalClearZoneId = this.data.selectedZone ? this.data.selectedZone._id : null
      if (arsenalClearZoneId) cache.invalidate('arsenal_' + arsenalClearZoneId)
      const arsenalClearUserId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid
      if (arsenalClearUserId) cache.invalidate('myregs_' + arsenalClearUserId)

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

  goToLogin: function () {
    wx.navigateTo({
      url: '/pages/login/login'
    })
  },

  onShareAppMessage: function () {
    const zone = this.data.selectedZone || app.globalData.currentZone
    const path = zone
      ? `/pages/user/arsenal-registration/arsenal-registration?zoneId=${zone._id}`
      : '/pages/user/arsenal-registration/arsenal-registration'
    const title = zone
      ? `兵工厂报名 - ${zone.zoneName}`
      : '兵工厂报名 - 无尽冬日'
    return {
      title: title,
      path: path
    }
  }
})
