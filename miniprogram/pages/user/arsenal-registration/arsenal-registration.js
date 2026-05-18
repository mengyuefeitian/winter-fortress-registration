// pages/user/arsenal-registration/arsenal-registration.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')

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

    this.loadConfigsFromCurrentZone()
  },

  loadConfigsFromCurrentZone: async function () {
    try {
      this.setData({ loading: true })

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

  loadConfigs: async function () {
    try {
      if (!this.data.selectedAlliance) {
        this.setData({ configs: [], loading: false })
        return
      }

      const configs = await db.getArsenalConfigs({ allianceId: this.data.selectedAlliance._id })

      const today = this.getTodayString()
      const activeConfigs = configs.filter(cfg => {
        if (!cfg.date) return true
        return cfg.date >= today
      })

      if (activeConfigs.length === 0) {
        this.setData({ configs: [], loading: false })
        return
      }

      // 批量查询：一次 DB 请求获取所有配置的统计数据
      const wxdb = wx.cloud.database()
      const configIds = activeConfigs.map(c => c._id)
      const allRegs = await this.batchFetchRegistrations(wxdb, configIds)

      const statsByConfigId = {}
      for (const reg of allRegs) {
        if (!statsByConfigId[reg.configId]) {
          statsByConfigId[reg.configId] = { combatCount: 0, substituteCount: 0, myRegs: [] }
        }
        if (reg.position === 'combat') statsByConfigId[reg.configId].combatCount++
        if (reg.position === 'substitute') statsByConfigId[reg.configId].substituteCount++
      }

      const currentUserId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

      const processed = activeConfigs.map(cfg => {
        const stats = statsByConfigId[cfg._id] || { combatCount: 0, substituteCount: 0, myRegs: [] }
        const combatCount = stats.combatCount
        const substituteCount = stats.substituteCount
        const combatFull = combatCount >= CAPACITY_LIMITS.combat
        const substituteFull = substituteCount >= CAPACITY_LIMITS.substitute
        const totalCount = combatCount + substituteCount
        const totalCapacity = CAPACITY_LIMITS.combat + CAPACITY_LIMITS.substitute
        const myRegs = stats.myRegs || []

        return {
          ...cfg,
          combatCount,
          substituteCount,
          totalCount,
          totalCapacity,
          combatFull,
          substituteFull,
          isFull: combatFull && substituteFull,
          isMyConfig: myRegs.length > 0,
          myPositions: myRegs.map(r => r.position)
        }
      })

      this.setData({
        configs: processed,
        loading: false
      })
    } catch (err) {
      console.error('加载配置失败:', err)
      this.setData({ loading: false })
    }
  },

  // 批量获取所有配置的报名记录（一次 DB 查询）
  batchFetchRegistrations: async function (wxdb, configIds) {
    const batchSize = 100
    let allRegs = []
    let skip = 0

    while (true) {
      const res = await wxdb.collection('arsenalRegistrations').where({
        configId: wxdb.command.in(configIds),
        status: 'active'
      }).skip(skip).limit(batchSize).get()
      allRegs = allRegs.concat(res.data)
      if (res.data.length < batchSize) break
      skip += batchSize
      if (skip > 500) break
    }

    return allRegs
  },

  getConfigStats: async function (configId) {
    try {
      const stats = await db.getArsenalStats(configId)
      return stats || { combatCount: 0, combat: 0, substituteCount: 0, substitute: 0, myRegistrations: [] }
    } catch (err) {
      console.error('获取配置统计失败:', err)
      return { combatCount: 0, combat: 0, substituteCount: 0, substitute: 0, myRegistrations: [] }
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
