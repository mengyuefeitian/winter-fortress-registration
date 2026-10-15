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
    dirty: false,
    diag: null,
    diagRunning: false,
    diagConclusion: ''
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
  },

  // ==================== 链路自检 ====================
  //
  // 真机没有控制台，「用户点了没反应」这类问题靠猜是猜不出来的。
  // 这里把链路逐段探测一遍直接显示出来：远程开关 → 云端通行证 → 广告实例与素材。
  runDiagnose: function () {
    if (this.data.diagRunning) return
    this.setData({ diagRunning: true, diag: null, diagConclusion: '' })
    util.showLoading('检测中...')

    weekPass
      .diagnose(this)
      .then(res => {
        util.hideLoading()
        this.setData({
          diag: res,
          diagRunning: false,
          diagConclusion: this.conclude(res)
        })
      })
      .catch(err => {
        util.hideLoading()
        this.setData({ diagRunning: false })
        util.showErrorLong('自检失败：' + ((err && err.message) || err))
      })
  },

  // 把检测结果翻译成一句人话：先报会阻断的硬错误，再报降级行为，最后才是正常
  conclude: function (d) {
    if (!d.enabled) return '结论：总开关已关闭，所有高级功能直接放行，不会出现弹窗。'
    if (d.configErr) return '结论：远程开关拉取失败（' + d.configErr + '），已回落代码默认值（默认开启），不影响功能。'
    if (d.queryErr) return '结论：云端通行证查询失败（' + d.queryErr + '），按设计会直接放行，所以用户看不到弹窗 —— 优先排查 weekPass 云函数与网络。'

    const ad = d.ad || {}
    if (!ad.adUnitOk) return '结论：广告位未配置或格式不对，用户点确认后无法播放，会临时放行。请核对 adConfig.js 的 REWARDED_AD_UNIT。'
    if (!ad.created) return '结论：广告实例创建失败，用户点确认后无法播放，会临时放行。'
    if (!ad.loaded) {
      return (
        '结论：素材加载失败（' + (ad.err || '未知') + '）→ 用户点「看视频解锁」后会临时放行，不会卡住。' +
        '常见原因：未开通流量主、广告位刚建未生效、当前无广告填充、开发者工具不支持真实广告。'
      )
    }
    if (d.localPass) return '结论：链路正常；本机本周已解锁，所以本机不会再弹窗（换一台未解锁的机器测才会看到弹窗）。'
    return '结论：链路正常；未持通行证的用户会看到解锁弹窗。'
  }
})
