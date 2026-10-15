// pages/superAdmin/ad-gate/ad-gate.js
// 超管「激励开关」配置页：在线切换高级功能的两类解锁方式，不用去控制台改数据库
//
// ⚠️ 对外文案口径（合规要求，改文案前必读）：统一说「解锁高级功能 / 高级控制权限」，
//    不要写「需观看广告」「看广告才能用」这类直白表述 —— 那属于变相强迫，平台会管。
//    但**奖励必须在触发前说清楚**（解锁本周全部高级功能、本周内不再重复），
//    含糊其辞把用户骗进去同样是违规。两条都要满足，不是二选一。
//
// 鉴权分两层，缺一不可：
//   1) 页面层：auth.isSuperAdmin(role)，非超管直接踢回首页（和 superAdmin/home 一致）
//   2) 云函数层：weekPass 的 setConfig 再校验一次 users.role === 'superAdmin'
//      页面层只是体验，云函数那层才是真防线 —— 客户端改代码也绕不过。
//
// 生效时延：本机保存后立即清缓存生效；其他用户端最长等 CONFIG_CACHE_TTL（5 分钟）。

const app = getApp()
const util = require('../../../utils/util')
const auth = require('../../../utils/auth')
const weekPass = require('../../../utils/weekPass')

Page({
  data: {
    registerGate: true,
    valueGate: true,
    weekRange: '',
    loading: true,
    saving: false,
    dirty: false
  },

  onLoad: function () {
    this.waitForRoleReady()
  },

  // 周期文案是「打开时按当前时间算」的，若小程序挂在后台跨过周一再回来会显示陈旧，
  // 所以每次显示都重算一遍（纯本地计算，无网络开销）。
  // 注意开关值本身与周无关，不需要重新拉取云端配置。
  onShow: function () {
    if (!this.data.loading) {
      this.setData({ weekRange: weekPass.getWeekRangeText() })
    }
  },

  // 角色就绪前 app.globalData.role 不可信，与 superAdmin/home 同样的等待方式
  waitForRoleReady: function () {
    if (app.globalData.roleReady) {
      this.checkPermission()
    } else {
      setTimeout(() => {
        this.waitForRoleReady()
      }, 100)
    }
  },

  checkPermission: function () {
    const role = app.globalData.role || 'user'
    if (!auth.isSuperAdmin(role)) {
      util.showError('权限不足')
      wx.switchTab({
        url: '/pages/index/index'
      })
      return
    }
    this.setData({ weekRange: weekPass.getWeekRangeText() })
    this.loadConfig()
  },

  loadConfig: async function () {
    try {
      const cfg = await weekPass.getGateConfig()
      this.setData({
        registerGate: cfg.registerGate !== false,
        valueGate: cfg.valueGate !== false,
        loading: false
      })
    } catch (err) {
      console.error('[ad-gate] 加载开关失败', err)
      this.setData({ loading: false })
      util.showErrorLong('加载失败，请下拉或返回重试')
    }
  },

  onPullDownRefresh: function () {
    this.loadConfig().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  onRegisterGateChange: function (e) {
    this.setData({
      registerGate: e.detail.value,
      dirty: true
    })
  },

  onValueGateChange: function (e) {
    this.setData({
      valueGate: e.detail.value,
      dirty: true
    })
  },

  save: async function () {
    if (this.data.saving) return
    if (!this.data.dirty) {
      util.showInfo('没有需要保存的改动')
      return
    }

    this.setData({ saving: true })
    util.showLoading('保存中...')
    try {
      const cfg = await weekPass.setGates({
        registerGate: this.data.registerGate,
        valueGate: this.data.valueGate
      })
      util.hideLoading()
      // 用云端回读值覆盖本地，避免「界面显示已关、实际没写进去」
      this.setData({
        registerGate: cfg.registerGate !== false,
        valueGate: cfg.valueGate !== false,
        dirty: false,
        saving: false
      })
      util.showSuccess('已保存，本机立即生效')
    } catch (err) {
      util.hideLoading()
      this.setData({ saving: false })
      util.showErrorLong((err && err.message) || '保存失败，请稍后重试')
    }
  }
})
