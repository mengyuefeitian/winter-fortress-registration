// pages/user/battle-registration/battle-registration.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')
const shareEntry = require('../../../utils/shareEntry')
const ga = require('../../../utils/gameAccount')

// 熔炉 / 三兵营 的标题与图标
const TARGET_TITLES = {
  furnace: { title: '熔炉等级', icon: '/images/game-account/furnace.png' },
  shield: { title: '盾兵营等级', icon: '/images/game-account/barracks-shield.png' },
  spear: { title: '矛兵营等级', icon: '/images/game-account/barracks-spear.png' },
  bow: { title: '射手营等级', icon: '/images/game-account/barracks-bow.png' }
}

Page({
  data: {
    configId: '',
    date: '',
    zoneName: '',
    alliances: [],
    allianceIndex: -1,
    inputNickName: '',
    // 游戏账号列表：游戏昵称复合选择器（可下拉切换 / 可手填新昵称）
    accountList: [],
    accountSelectedId: '',

    // 等级改用规格对象 {kind,value,stage}，由图标选择器维护
    furnaceSpec: null,
    shieldSpec: null,
    spearSpec: null,
    archerSpec: null,
    // 列表展示用：{has, icon, ring, text}
    furnaceView: { has: false },
    shieldView: { has: false },
    spearView: { has: false },
    archerView: { has: false },

    troopShield: '',
    troopSpear: '',
    troopArcher: '',
    diamonds: '',
    voiceOptions: db.VOICE_OPTIONS,
    voiceIndex: 0,
    positionOptions: db.BATTLE_POSITION_OPTIONS,
    positionIndex: 0,
    joinExpedition: false,   // 参加远征战争
    joinRoyalCity: false,    // 参加王城战争
    loading: false,

    // 等级选择弹窗
    levelShow: false,
    levelTarget: '',
    levelTitle: '',
    levelIcon: '',
    levelValue: null
  },

  onLoad: function (options) {
    // 读取上次填写的昵称
    const lastNickName = wx.getStorageSync('lastBattleNickName') || ''
    this.setData({
      configId: options.configId,
      date: options.date,
      zoneName: options.zoneName || '',
      inputNickName: lastNickName
    })
    this.waitForRoleReady()
  },

  // 等待全局登录状态确定后再校验登录/分区，避免通过转发链接直接进入时状态未就绪
  waitForRoleReady: function () {
    if (app.globalData.roleReady) {
      this.checkAccessAndLoad()
    } else {
      setTimeout(() => {
        this.waitForRoleReady()
      }, 100)
    }
  },

  // 校验登录状态与分区绑定，缺失则跳转首页登录/选择分区，避免转发链接进入后无法选择联盟
  checkAccessAndLoad: async function () {
    if (!this._entryChecked) {
      this._entryChecked = true
      const userInfo = app.globalData.userInfo
      if (!userInfo || !userInfo.nickName) {
        shareEntry.showReminderAndExit(this, '未登录，请先登录')
        return
      }

      const zone = await this.resolveZone()
      if (!zone) {
        shareEntry.showReminderAndExit(this, '请先在首页选择分区后再报名')
        return
      }

      // 校验分享链接指向的分区是否与当前分区一致
      let configZoneId = null
      let configZoneName = ''
      try {
        const cfg = await db.getBattleConfigById(this.data.configId)
        if (cfg) {
          configZoneId = cfg.zoneId
          configZoneName = cfg.zoneName
        }
      } catch (e) {
        console.error('获取国战配置失败', e)
      }
      if (configZoneId && zone._id !== configZoneId) {
        shareEntry.showReminderAndExit(this, '不属于' + configZoneName + '分区，请切换到' + configZoneName + '分区后再重新进入报名')
        return
      }
      this._verifiedZone = zone
    }

    const zone = this._verifiedZone || await this.resolveZone()
    if (!zone) return
    // 先取主游戏账号再拉联盟：联盟要用账号里"最近一次报名用的联盟"优先预填
    await this.prefillFromMainAccount()
    this.loadAlliances(zone)
  },

  /**
   * 从「主游戏账号」预填资料：游戏昵称 / 熔炉等级 / 兵营等级（规格对象）。
   * 联盟不在这里填 —— 它要靠 allianceIndex，必须等联盟列表拉回来之后才能定位。
   * 只填用户还没动过的字段，避免覆盖用户已经输入的内容。
   *
   * ⚠️ 用 ga.list() 一次拿全量账号（而不是 getMain() + list() 两次云调用）：
   *    列表要喂给昵称下拉，主账号从列表里筛出来即可。
   */
  prefillFromMainAccount: async function () {
    let accounts = []
    try {
      accounts = await ga.list()
    } catch (err) {
      console.warn('[游戏账号] 账号列表加载失败(已忽略):', err)
    }

    const account = accounts.filter(a => a.isMain)[0] || null
    this._mainAccount = account

    // 列表始终要喂给下拉，即使没有主账号
    const patch = { accountList: accounts }

    if (account) {
      const b = account.barracks || {}
      if (account.gameNickName && !this._typed) {
        patch.inputNickName = account.gameNickName
        patch.accountSelectedId = account._id
      }
      // ⚠️ 一定要过 normalizeBarracksItem：它保留 stage（兵种阶级），
      //    直接塞 b.shield 虽然能用，但拿到的是未规整的原始数据。
      if (account.furnace && !this.data.furnaceSpec) patch.furnaceSpec = ga.normalizeSpec(account.furnace)
      if (b.shield && !this.data.shieldSpec) patch.shieldSpec = ga.normalizeBarracksItem(b.shield)
      if (b.spear && !this.data.spearSpec) patch.spearSpec = ga.normalizeBarracksItem(b.spear)
      if (b.bow && !this.data.archerSpec) patch.archerSpec = ga.normalizeBarracksItem(b.bow)
    }

    const needSyncViews = !!(patch.furnaceSpec || patch.shieldSpec || patch.spearSpec || patch.archerSpec)
    this.setData(patch)
    if (needSyncViews) this.syncLevelViews()
  },

  // 把 4 个规格对象算成列表展示用的 {has, icon, ring, text}
  syncLevelViews: function () {
    this.setData({
      furnaceView: ga.viewOf({ furnace: this.data.furnaceSpec }),
      shieldView: ga.viewOf({ furnace: this.data.shieldSpec }),
      spearView: ga.viewOf({ furnace: this.data.spearSpec }),
      archerView: ga.viewOf({ furnace: this.data.archerSpec })
    })
  },

  // 解析当前分区：优先全局状态，其次本地缓存的上次选择分区
  resolveZone: async function () {
    let zone = app.globalData.currentZone
    if (zone) return zone

    const lastZoneId = wx.getStorageSync('lastZoneId')
    if (!lastZoneId) return null

    try {
      const wxdb = wx.cloud.database()
      const res = await wxdb.collection('zones').doc(lastZoneId).get()
      if (res.data && res.data.status !== 'inactive') {
        zone = res.data
        app.globalData.currentZone = zone
        return zone
      }
    } catch (err) {
      console.error('恢复分区失败:', err)
    }
    return null
  },

  loadAlliances: async function (zone) {
    try {
      const alliances = await db.getAlliancesByZone(zone._id)
      const list = alliances || []
      this.setData({ alliances: list })

      // 联盟预填优先级：主游戏账号「最近一次报名用的联盟」→ 本地缓存的最后选择
      const accountAllianceId = (this._mainAccount && this._mainAccount.allianceId) || ''
      const lastId = accountAllianceId || wx.getStorageSync('lastBattleAllianceId')
      if (lastId) {
        const idx = list.findIndex(a => a._id === lastId)
        if (idx >= 0) {
          this.setData({ allianceIndex: idx })
        }
      }
    } catch (err) {
      console.error('加载联盟失败:', err)
    }
  },

  onAllianceChange: function (e) {
    this.setData({ allianceIndex: parseInt(e.detail.value) })
  },

  // 游戏昵称复合选择器回调：选中已有账号 或 手动输入新昵称
  // 标记用户动过昵称：之后主账号的预填就不再覆盖它
  //
  // ⚠️ 切换账号是一次「整账号切换」，必须把该账号的资料一并同步过来，否则会串号：
  //    ① 熔炉 / 三兵营等级（含兵种阶级 stage）
  //    ② 该账号最近一次报名用的联盟（"主账号 = 最后报名的账号"）
  //    手动填的新昵称（列表里没有）不同步任何东西，保留用户已填内容。
  onAccountChange: function (e) {
    this._typed = true
    const patch = {
      inputNickName: e.detail.nickName,
      accountSelectedId: e.detail.selectedId
    }

    const account = ga.pickAccount(this.data.accountList, e.detail.selectedId, e.detail.nickName)
    let needSyncViews = false
    if (account) {
      this._mainAccount = account                       // 供后续联盟预填沿用
      const specs = ga.specsOf(account)
      Object.assign(patch, specs)
      needSyncViews = true

      // 联盟选择器同步切到该账号的联盟
      const idx = ga.allianceIndexIn(this.data.alliances, account.allianceId)
      if (idx >= 0) patch.allianceIndex = idx
    }

    this.setData(patch)
    if (needSyncViews) this.syncLevelViews()
  },

  // ==================== 等级图标选择器 ====================
  openLevelSheet: function (e) {
    const target = e.currentTarget.dataset.target
    const info = TARGET_TITLES[target] || TARGET_TITLES.furnace
    const current = this.data[target + 'Spec']
    this.setData({
      levelShow: true,
      levelTarget: target,
      levelTitle: info.title,
      levelIcon: info.icon,
      levelValue: current
    })
  },

  closeLevelSheet: function () {
    this.setData({ levelShow: false })
  },

  onLevelConfirm: function (e) {
    const target = this.data.levelTarget
    const spec = e.detail.spec
    const patch = { levelShow: false }
    patch[target + 'Spec'] = spec
    this.setData(patch)
    this.syncLevelViews()
  },

  onTroopShieldInput: function (e) {
    this.setData({ troopShield: e.detail.value })
  },

  onTroopSpearInput: function (e) {
    this.setData({ troopSpear: e.detail.value })
  },

  onTroopArcherInput: function (e) {
    this.setData({ troopArcher: e.detail.value })
  },

  onDiamondsInput: function (e) {
    this.setData({ diamonds: e.detail.value })
  },

  onVoiceChange: function (e) {
    this.setData({ voiceIndex: parseInt(e.detail.value) })
  },

  onPositionChange: function (e) {
    this.setData({ positionIndex: parseInt(e.detail.value) })
  },

  onToggleExpedition: function () {
    this.setData({ joinExpedition: !this.data.joinExpedition })
  },

  onToggleRoyalCity: function () {
    this.setData({ joinRoyalCity: !this.data.joinRoyalCity })
  },

  validate: function () {
    const {
      allianceIndex, inputNickName, furnaceSpec, shieldSpec, spearSpec, archerSpec,
      troopShield, troopSpear, troopArcher, diamonds
    } = this.data

    if (allianceIndex < 0) {
      util.showError('请选择联盟')
      return false
    }
    if (!inputNickName || inputNickName.trim().length === 0) {
      util.showError('请输入游戏昵称')
      return false
    }
    if (!furnaceSpec) {
      util.showError('请选择熔炉等级')
      return false
    }
    if (!shieldSpec || !spearSpec || !archerSpec) {
      util.showError('请完整选择兵营等级（盾/矛/射）')
      return false
    }
    if (!troopShield.trim() || !troopSpear.trim() || !troopArcher.trim()) {
      util.showError('请完整填写兵种数量（盾/矛/射）')
      return false
    }
    const isValidNumber = v => v.trim() !== '' && !isNaN(parseFloat(v.trim()))
    if (!isValidNumber(troopShield) || !isValidNumber(troopSpear) || !isValidNumber(troopArcher)) {
      util.showError('兵种数量请填写有效数字（如 10 或 1.5）')
      return false
    }
    if (!diamonds || diamonds.trim().length === 0) {
      util.showError('请输入钻石数量')
      return false
    }
    return true
  },

  onSubmit: async function () {
    if (!this.validate()) return

    const {
      configId, alliances, allianceIndex, inputNickName,
      furnaceSpec, shieldSpec, spearSpec, archerSpec,
      troopShield, troopSpear, troopArcher,
      diamonds, voiceIndex, positionIndex,
      joinExpedition, joinRoyalCity
    } = this.data
    const userInfo = app.globalData.userInfo

    try {
      this.setData({ loading: true })
      util.showLoading('提交中...')

      wx.setStorageSync('lastBattleNickName', inputNickName.trim())

      const alliance = alliances[allianceIndex]
      const zone = app.globalData.currentZone
      const barracksLevel = `${ga.specToText(shieldSpec)}/${ga.specToText(spearSpec)}/${ga.specToText(archerSpec)}`
      const troopCount = `${troopShield.trim()}/${troopSpear.trim()}/${troopArcher.trim()}`

      const registrationData = {
        configId,
        zoneId: zone ? zone._id : '',
        userId: userInfo._id,
        nickName: inputNickName.trim(),
        allianceId: alliance._id,
        allianceName: alliance.allianceName,
        furnaceLevel: ga.specToText(furnaceSpec),
        // 结构化熔炉等级（含兵营）：报名列表 / 截图据此展示等级图标
        furnace: ga.normalizeSpec(furnaceSpec),
        barracks: {
          shield: ga.normalizeBarracksItem(shieldSpec),
          spear: ga.normalizeBarracksItem(spearSpec),
          bow: ga.normalizeBarracksItem(archerSpec)
        },
        barracksLevel,
        troopCount,
        diamonds: diamonds.trim(),
        voice: db.VOICE_OPTIONS[voiceIndex],
        position: db.BATTLE_POSITION_OPTIONS[positionIndex],
        joinExpedition: !!joinExpedition,
        joinRoyalCity: !!joinRoyalCity
      }

      await db.createBattleRegistration(registrationData)

      wx.setStorageSync('lastBattleAllianceId', alliance._id)

      // 游戏账号：把本次报名填的资料回写到账号，并把该账号设为主账号。
      // 主账号还没数据就补进主账号；昵称是新的就新增一条账号再设为主账号。
      // fire-and-forget —— 失败不影响报名结果。
      ga.syncFromRegistration({
        gameNickName: inputNickName.trim(),
        furnace: ga.normalizeSpec(furnaceSpec),
        barracks: {
          shield: ga.normalizeBarracksItem(shieldSpec),
          spear: ga.normalizeBarracksItem(spearSpec),
          bow: ga.normalizeBarracksItem(archerSpec)
        },
        allianceId: alliance._id,
        allianceName: alliance.allianceName
      }).catch(err => console.warn('[游戏账号] 回写失败(已忽略):', err))

      // 联盟活跃：记录本次选择的联盟归属（以最后一次报名为准），失败不影响报名结果
      db.joinAllianceByRegistration(
        alliance._id,
        zone ? zone._id : '',
        inputNickName.trim()
      ).then(() => {
        // 归属记录成功后立即标记今日活跃（force 绕过节流）
        app.markAllianceActive(true)
      }).catch(err => console.warn('[联盟活跃] 归属记录失败(已忽略):', err))

      util.hideLoading()
      util.showSuccess('报名成功')
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    } catch (err) {
      util.hideLoading()
      console.error('报名失败:', err)
      if (err.message && err.message.includes('已报名')) {
        util.showError('您已报名该日期的国战')
      } else {
        util.showError('报名失败')
      }
    }
  },

  onShareAppMessage: function () {
    const { date, zoneName, configId } = this.data
    const title = date
      ? `国战报名 - ${date}${zoneName ? ' · ' + zoneName : ''}`
      : '国战报名 - 无尽冬日'
    return {
      title: title,
      path: `/pages/user/battle-registration/battle-registration?configId=${configId || ''}&date=${date || ''}&zoneName=${encodeURIComponent(zoneName || '')}`
    }
  }
})
