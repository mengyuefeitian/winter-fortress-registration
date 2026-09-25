// pages/user/my-registrations/my-registrations.js
// 「我的」个人中心：用户信息 + 分区 + 游戏账号 + 菜单入口
// 报名记录的查看与取消在 pages/user/my-records/my-records
const app = getApp()
const util = require('../../../utils/util')
const version = require('../../../utils/version')
const db = require('../../../utils/db')
const ga = require('../../../utils/gameAccount')

// 标题与国战报名保持一致（components/level-picker 弹窗头部直接用这里的文案）
const TARGET_TITLES = {
  furnace: { title: '熔炉等级', icon: '/images/game-account/furnace.png' },
  shield: { title: '盾兵营等级', icon: '/images/game-account/barracks-shield.png' },
  spear: { title: '矛兵营等级', icon: '/images/game-account/barracks-spear.png' },
  bow: { title: '射手营等级', icon: '/images/game-account/barracks-bow.png' }
}

// 空草稿：新增账号时用
function emptyDraft() {
  return {
    _id: '',
    gameNickName: '',
    dixin: '',
    furnace: null,
    barracks: { shield: null, spear: null, bow: null },
    allianceId: '',
    allianceName: '',
    allianceIndex: -1
  }
}

// 等级规格 → 展示对象（无规格时返回 null，wxml 里据此显示「未设置」/「—」）
// 注意：stage 要从原始对象上取 —— normalizeSpec 只保留 {kind,value}，会把 stage 丢掉。
function chipOf(spec) {
  const s = ga.normalizeSpec(spec)
  if (!s) return null
  return {
    icon: ga.iconSrc(s),
    ring: ga.ringOf(s),
    stage: (s.kind === 'fire' && spec && spec.stage) || '',
    kind: s.kind,
    value: s.value
  }
}

Page({
  data: {
    isLoggedIn: false,
    userInfo: null,
    roleName: '',
    currentZone: null,
    versionText: version.getVersionText(),

    // 游戏账号
    gameAccounts: [],
    accountsLoading: false,
    expanded: false,          // 账号列表是否展开（默认折叠，只显主账号）
    hasMain: true,            // 列表里是否存在主账号（无主账号时折叠态也显示全部）
    alliances: [],            // 当前分区的联盟列表（编辑账号时下拉选择）

    // 弹窗状态
    sheet: '',                 // '' | 'edit'（等级选择改成独立组件，不再占用 sheet 状态）
    draft: emptyDraft(),
    draftFurnace: null,
    draftShield: null,
    draftSpear: null,
    draftBow: null,

    // 等级选择弹窗（复用 components/level-picker，与国战报名同一套）
    levelShow: false,
    levelTarget: 'furnace',    // furnace | shield | spear | bow
    levelTitle: '熔炉等级',
    levelIcon: '',
    levelSpec: null            // 当前规格 {kind,value,stage} | null
  },

  onLoad: function () {
    this.waitForRoleReady()
  },

  onShow: function () {
    // 页面切换回来后默认折叠，只展示主账号
    this.setData({ expanded: false })
    if (app.globalData.roleReady) {
      this.loadUserInfo()
    } else {
      this.waitForRoleReady()
    }
  },

  // 等待角色就绪（tabBar 页可能在角色计算完成前就被打开）
  waitForRoleReady: function () {
    if (app.globalData.roleReady) {
      this.loadUserInfo()
    } else {
      setTimeout(() => {
        this.waitForRoleReady()
      }, 100)
    }
  },

  // 加载用户信息与当前分区
  loadUserInfo: function () {
    const userInfo = app.globalData.userInfo
    const role = app.globalData.role || 'user'
    const roleName = util.getRoleName(role)

    this.setData({
      isLoggedIn: !!userInfo,
      userInfo: userInfo,
      roleName: userInfo ? roleName : '未登录',
      currentZone: app.globalData.currentZone || null
    })

    // 当前分区下的联盟列表（编辑账号时下拉选择）
    if (this.data.currentZone) this.loadZoneAlliances(this.data.currentZone)

    if (userInfo) {
      // 弹窗打开期间不刷新列表，避免把用户正在编辑的内容冲掉
      if (this.data.sheet === '') this.loadAccounts()
    } else {
      this.setData({ gameAccounts: [] })
    }
  },

  // 加载当前分区的联盟列表（编辑账号时下拉选择已有联盟）
  // ⚠️ 必须返回 Promise：onEditAccount 需要等列表就位后才能算出选中项索引，
  //    否则首次打开弹窗时 alliances 还是空数组，已绑定的联盟显示不出选中态。
  //    按 zoneId 记忆，重复开弹窗 / 重复进页面不再重复请求。
  loadZoneAlliances: function (zone) {
    const self = this
    const zoneId = (zone && zone._id) ? zone._id : ''
    if (!zoneId) {
      this.setData({ alliances: [] })
      return Promise.resolve([])
    }
    return db.getAlliancesByZone(zoneId).then(list => {
      const arr = list || []
      self._alliancesZoneId = zoneId
      self._alliances = arr
      self.setData({ alliances: arr })
      return arr
    }).catch(() => {
      self.setData({ alliances: [] })
      return []
    })
  },

  // 打开编辑弹窗前确保联盟列表已就绪（命中记忆则同步返回）
  ensureAlliances: function () {
    const zone = this.data.currentZone
    const zoneId = (zone && zone._id) ? zone._id : ''
    if (!zoneId) return Promise.resolve([])
    if (this._alliancesZoneId === zoneId && this._alliances) {
      if (this.data.alliances !== this._alliances) this.setData({ alliances: this._alliances })
      return Promise.resolve(this._alliances)
    }
    return this.loadZoneAlliances(zone)
  },

  // ==================== 游戏账号列表 ====================

  loadAccounts: function () {
    if (this._accountsLoading) return
    this._accountsLoading = true
    this.setData({ accountsLoading: this.data.gameAccounts.length === 0 })

    ga.list().then(list => {
      this._accountsLoading = false
      const decorated = this.decorateAccounts(list)
      const hasMain = decorated.some(a => a.isMain)
      this.setData({ gameAccounts: decorated, accountsLoading: false, hasMain: hasMain })
    }).catch(() => {
      this._accountsLoading = false
      this.setData({ accountsLoading: false })
    })
  },

  // 展开 / 收起账号列表（默认折叠，只显主账号）
  onToggleAccounts: function () {
    this.setData({ expanded: !this.data.expanded })
  },

  // 补上 wxml 直接可用的展示字段（图标路径 / 圆环数字 / 未设置文案）
  decorateAccounts: function (list) {
    return (list || []).map(a => {
      const furnace = ga.normalizeSpec(a.furnace)
      const b = a.barracks || {}
      return Object.assign({}, a, {
        furnaceIcon: ga.iconSrc(furnace),
        furnaceRing: ga.ringOf(furnace),
        dixinText: (a.dixin === null || a.dixin === undefined || a.dixin === '') ? '—' : String(a.dixin),
        bShield: chipOf(b.shield),
        bSpear: chipOf(b.spear),
        bBow: chipOf(b.bow)
      })
    })
  },

  // ==================== 编辑弹窗 ====================

  onAddAccount: function () {
    if (!this.data.isLoggedIn) {
      util.showInfo('请先登录')
      return
    }
    if (this.data.gameAccounts.length >= 20) {
      util.showError('最多只能保存 20 个游戏账号')
      return
    }
    // 确保联盟列表已加载（编辑账号时下拉用）
    this.ensureAlliances()
    this.setData({
      sheet: 'edit',
      draft: emptyDraft()
    })
    this.syncDraftViews()
  },

  onEditAccount: function (e) {
    const id = e.currentTarget.dataset.id
    const target = this.data.gameAccounts.filter(a => a._id === id)[0]
    if (!target) return
    const self = this
    const boundAllianceId = target.allianceId || ''
    this.setData({
      sheet: 'edit',
      draft: {
        _id: target._id,
        gameNickName: target.gameNickName || '',
        dixin: (target.dixin === null || target.dixin === undefined) ? '' : String(target.dixin),
        furnace: ga.normalizeSpec(target.furnace),
        barracks: {
          shield: ga.normalizeBarracksItem(target.barracks && target.barracks.shield),
          spear: ga.normalizeBarracksItem(target.barracks && target.barracks.spear),
          bow: ga.normalizeBarracksItem(target.barracks && target.barracks.bow)
        },
        allianceId: target.allianceId || '',
        allianceName: target.allianceName || '',
        allianceIndex: -1
      }
    })
    this.syncDraftViews()

    // 联盟列表异步就位后回写选中项（列表在别的分区时会重新拉）
    this.ensureAlliances().then(list => {
      if (self.data.sheet !== 'edit') return
      const idx = (list || []).findIndex(a => a._id === boundAllianceId)
      if (idx >= 0) {
        self.setData({
          'draft.allianceIndex': idx,
          'draft.allianceId': list[idx]._id,
          'draft.allianceName': list[idx].allianceName
        })
      }
    })
  },

  // 编辑弹窗内：选择联盟
  onAllianceChange: function (e) {
    const index = parseInt(e.detail.value, 10)
    const alliance = this.data.alliances[index]
    if (!alliance) return
    this.setData({
      'draft.allianceIndex': index,
      'draft.allianceId': alliance._id,
      'draft.allianceName': alliance.allianceName
    })
  },

  closeSheet: function () {
    this.setData({ sheet: '' })
  },

  // 草稿 → 展示字段（每次改动后调用）
  syncDraftViews: function () {
    const d = this.data.draft
    this.setData({
      draftFurnace: chipOf(d.furnace),
      draftShield: chipOf(d.barracks && d.barracks.shield),
      draftSpear: chipOf(d.barracks && d.barracks.spear),
      draftBow: chipOf(d.barracks && d.barracks.bow)
    })
  },

  // 输入类一律用 data-path 写法：draft 是嵌套对象，直接改引用再 setData 容易和
  // 「路径式 setData」互相覆盖（两者对同一份数据的更新语义不同）
  onNickNameInput: function (e) {
    this.setData({ 'draft.gameNickName': e.detail.value })
  },

  onDixinInput: function (e) {
    // 地心探险是纯自然数输入
    this.setData({ 'draft.dixin': String(e.detail.value || '').replace(/[^0-9]/g, '') })
  },

  onSaveAccount: function () {
    const d = this.data.draft
    const nickName = String(d.gameNickName || '').trim()
    if (!nickName) {
      util.showError('请填写游戏昵称')
      return
    }

    const payload = {
      _id: d._id || '',
      gameNickName: nickName,
      furnace: ga.normalizeSpec(d.furnace),
      dixin: d.dixin === '' ? null : d.dixin,
      barracks: d.barracks,
      allianceId: d.allianceId,
      allianceName: d.allianceName
    }

    wx.showLoading({ title: '保存中...', mask: true })
    ga.save(payload).then(res => {
      wx.hideLoading()
      if (!res.success) {
        util.showError(res.error || '保存失败')
        return
      }
      ga.clearMainCache()
      this.setData({ sheet: '' })
      util.showSuccess('已保存')
      this.loadAccounts()
    }).catch(() => {
      wx.hideLoading()
      util.showError('保存失败')
    })
  },

  onRemoveAccount: function (e) {
    const id = e.currentTarget.dataset.id
    const target = this.data.gameAccounts.filter(a => a._id === id)[0]
    if (!target) return
    wx.showModal({
      title: '删除游戏账号',
      content: `确定删除「${target.gameNickName}」吗？删除后不可恢复。` +
        (target.isMain ? '\n（这是当前主账号，删除后会自动把列表中第一个设为新的主账号）' : ''),
      confirmText: '删除',
      confirmColor: '#FF6B6B',
      success: (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中...', mask: true })
        ga.remove(id).then(r => {
          wx.hideLoading()
          if (!r.success) {
            util.showError(r.error || '删除失败')
            return
          }
          ga.clearMainCache()
          util.showSuccess('已删除')
          this.loadAccounts()
        }).catch(() => {
          wx.hideLoading()
          util.showError('删除失败')
        })
      }
    })
  },

  onSetMain: function (e) {
    const id = e.currentTarget.dataset.id
    const target = this.data.gameAccounts.filter(a => a._id === id)[0]
    if (!target || target.isMain) return
    wx.showLoading({ title: '设置中...', mask: true })
    ga.setMain(id).then(r => {
      wx.hideLoading()
      if (!r.success) {
        util.showError(r.error || '设置失败')
        return
      }
      ga.clearMainCache()
      util.showSuccess('已设为主账号')
      this.loadAccounts()
    }).catch(() => {
      wx.hideLoading()
      util.showError('设置失败')
    })
  },

  // ==================== 等级选择弹窗 ====================

  openLevelSheet: function (e) {
    const target = e.currentTarget.dataset.target
    const d = this.data.draft
    const info = TARGET_TITLES[target] || TARGET_TITLES.furnace

    // 兵营规格自带兵种阶级 stage；熔炉没有（normalizeSpec 只留 {kind,value}）
    const spec = target === 'furnace'
      ? ga.normalizeSpec(d.furnace)
      : ga.normalizeBarracksItem(d.barracks && d.barracks[target])

    this.setData({
      levelShow: true,
      levelTarget: target,
      levelTitle: info.title,
      levelIcon: info.icon,
      levelSpec: spec || null
    })
  },

  closeLevelSheet: function () {
    this.setData({ levelShow: false })
  },

  onLevelConfirm: function (e) {
    const target = this.data.levelTarget
    const spec = e.detail.spec || null

    const patch = { levelShow: false }
    if (target === 'furnace') {
      patch['draft.furnace'] = spec ? { kind: spec.kind, value: spec.value } : null
    } else {
      patch['draft.barracks.' + target] = ga.normalizeBarracksItem(spec)
    }

    this.setData(patch)
    this.syncDraftViews()
  },

  // 阻止弹窗内的滚动穿透到页面
  noop: function () { },

  // ==================== 菜单跳转 ====================

  // 我的报名（独立页面，查看与取消各类报名记录）
  goToMyRecords: function () {
    if (!app.globalData.userInfo) {
      util.showInfo('请先登录')
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    wx.navigateTo({ url: '/pages/user/my-records/my-records' })
  },

  goToInbox: function () {
    wx.navigateTo({
      url: '/pages/user/feedback-inbox/feedback-inbox'
    })
  },

  // 意见与建议
  goToFeedback: function () {
    wx.navigateTo({
      url: '/pages/user/feedback/feedback'
    })
  },

  // 功能介绍：先到版本列表（二级菜单），再点某个版本看说明
  // 版本清单在 utils/updates.js，新增版本只改那里
  goToIntro: function () {
    wx.navigateTo({
      url: '/pages/user/updates/updates'
    })
  },

  // 关于：产品信息 / 官网 / 客服微信 / 备案号
  goToAbout: function () {
    wx.navigateTo({
      url: '/pages/user/about/about'
    })
  },

  // 去登录
  goToLogin: function () {
    wx.navigateTo({
      url: '/pages/login/login'
    })
  },

  // 退出登录
  logout: function () {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？退出后将清除您的登录信息。',
      confirmText: '退出',
      confirmColor: '#FF6B6B',
      success: (res) => {
        if (res.confirm) {
          // 清除全局数据
          app.globalData.userInfo = null
          app.globalData.openid = null
          app.globalData.phone = null
          app.globalData.role = 'user'
          app.globalData.roleReady = true  // 设置为true，表示角色状态已确定（未登录状态）

          // 清除本地缓存
          wx.removeStorageSync('userInfo')
          wx.removeStorageSync('openid')
          ga.clearMainCache()

          this.setData({
            isLoggedIn: false,
            userInfo: null,
            roleName: '未登录',
            gameAccounts: []
          })

          util.showSuccess('已退出登录')

          // 跳转到首页
          setTimeout(() => {
            wx.switchTab({
              url: '/pages/index/index'
            })
          }, 500)
        }
      }
    })
  },

  onShareAppMessage: function () {
    return {
      title: '无尽冬日报名助手',
      path: '/pages/index/index'
    }
  }
})
