// pages/user/canyon-registration/canyon-registration.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')
const cache = require('../../../utils/cache')
const ga = require('../../../utils/gameAccount')
const shareEntry = require('../../../utils/shareEntry')

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
    accountList: [],
    accountSelectedId: '',
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
      this._sharedZoneId = options.zoneId
    }
    this._entryChecked = false
    // onShow 由小程序框架在 onLoad 后自动调用，无需手动调用
  },

  onShow: function () {
    this.waitForRoleReady()
  },

  // 等待登录决策完成（roleReady）后再校验，避免冷启动未就绪时误判未登录
  waitForRoleReady: function () {
    if (app.globalData.roleReady) {
      this.checkLoginAndLoadData()
    } else {
      setTimeout(() => {
        this.waitForRoleReady()
      }, 100)
    }
  },

  // 切换提示信息显示
  toggleTip: function () {
    this.setData({ showTip: !this.data.showTip })
  },

  // 加载游戏账号列表（昵称下拉切换用），并默认把昵称填成主账号
  loadAccounts: function () {
    const self = this
    ga.list().then(list => {
      const accounts = list || []
      const patch = { accountList: accounts }
      const main = accounts.filter(a => a.isMain)[0]
      // 记下主账号：联盟预填要用它「最近一次报名用的联盟」（主账号 = 最后报名的账号）
      self._mainAccount = main || null
      if (main && !self.data.nickName) {
        patch.nickName = main.gameNickName
        patch.accountSelectedId = main._id
      } else if (!self.data.nickName) {
        const u = app.globalData.userInfo
        if (u && u.nickName) {
          patch.nickName = u.nickName
          patch.accountSelectedId = ''
        }
      }
      self.setData(patch)
    }).catch(() => { })
  },

  // 联盟预填优先级：主游戏账号「最近一次报名用的联盟」→ 本地缓存的上次选择
  resolveDefaultAllianceId: function () {
    return (this._mainAccount && this._mainAccount.allianceId) ||
      wx.getStorageSync('lastAllianceId') || ''
  },

  // 昵称选择器回调：回填昵称 + 选中账号
  // ⚠️ 切换账号是「整账号切换」：该账号最近一次报名用的联盟要一起同步过来
  onAccountChange: function (e) {
    const patch = {
      nickName: e.detail.nickName,
      accountSelectedId: e.detail.selectedId
    }
    const account = ga.pickAccount(this.data.accountList, e.detail.selectedId, e.detail.nickName)
    if (account) {
      this._mainAccount = account
      const idx = ga.allianceIndexIn(this.data.alliances, account.allianceId)
      if (idx >= 0) {
        patch.allianceIndex = idx
        patch.selectedAlliance = this.data.alliances[idx]
      }
    }
    this.setData(patch)
  },

  // 检查登录并加载数据
  checkLoginAndLoadData: async function () {
    // 分享进入：首次校验登录与分区归属
    if (!this._entryChecked && this._sharedZoneId) {
      this._entryChecked = true
      const pass = await shareEntry.checkSharedEntry(this, this._sharedZoneId)
      if (!pass) return
    }

    const userInfo = app.globalData.userInfo

    if (userInfo && userInfo.nickName) {
      // 已登录：昵称默认展示主账号（由 loadAccounts 兜底，没账号时回退到微信昵称）
      this.setData({ isLoggedIn: true })
      this.loadAccounts()
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
        // 联盟预填：主账号最近一次报名的联盟优先，其次本地缓存
        const lastAllianceId = this.resolveDefaultAllianceId()
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

      // 1) 先渲染配置外壳（不带统计），保证 1 秒内出列表
      const shellConfigs = filteredConfigs.map(cfg => ({
        ...cfg,
        combatCount: 0,
        substituteCount: 0,
        totalCount: 0,
        totalCapacity: POSITION_CAPACITY.combat + POSITION_CAPACITY.substitute,
        combatFull: false,
        substituteFull: false,
        isFull: false,
        isMyConfig: false,
        myPositions: []
      }))
      this.setData({ configs: shellConfigs })

      // 2) 后台并行拉取每个配置的统计，完成后静默更新（不阻塞列表展示）
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

      this.setData({ configs: processedConfigs })

      const canyonZoneId = this.data.selectedZone ? this.data.selectedZone._id : null
      if (canyonZoneId) {
        cache.set('canyon_' + canyonZoneId, {
          selectedZone: this.data.selectedZone,
          alliances: this.data.alliances || [],
          configs: processedConfigs
        }, 5 * 60 * 1000)
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

      // 熔炉等级徽章：记录自带 furnace，老记录按 userId 兜底查主账号
      await ga.decorate(processed)

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

      // 熔炉等级：带上主账号的等级，报名列表 / 截图会按它展示等级图标
      const furnace = await ga.selfFurnace()

      await db.createCanyonRegistration({
        configId: this.data.selectedConfig._id,
        zoneId: zone._id,
        allianceId: this.data.selectedAlliance._id,
        userId: userId,
        nickName: this.data.nickName,
        position: this.data.position,
        furnace: furnace
      })

      util.hideLoading()
      util.showSuccess('报名成功')

      // 自动把本次使用的昵称追加到游戏账号列表（仅当不在已有账号里）
      const finalNick = this.data.nickName
      const exists = (this.data.accountList || []).some(a => a.gameNickName === finalNick)
      if (finalNick && !exists) {
        ga.save({ gameNickName: finalNick }).then(() => { ga.clearMainCache(); this.loadAccounts() }).catch(() => { })
      }

      // 联盟活跃：记录本次选择的联盟归属（以最后一次报名为准），失败不影响报名结果
      db.joinAllianceByRegistration(
        this.data.selectedAlliance._id,
        zone._id,
        this.data.nickName
      ).then(() => {
        // 归属记录成功后立即标记今日活跃（force 绕过节流）
        app.markAllianceActive(true)
      }).catch(err => console.warn('[联盟活跃] 归属记录失败(已忽略):', err))

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
