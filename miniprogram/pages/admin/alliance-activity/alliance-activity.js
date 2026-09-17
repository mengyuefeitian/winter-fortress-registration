// pages/admin/alliance-activity/alliance-activity.js
// 联盟活跃 —— 区管总览页：第一列【联盟】固定，后 7 列本周日期可左右滑动
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')

Page({
  data: {
    zoneId: '',

    weekDates: [],
    dayIndex: 0,
    rows: [],

    scrollLeft: 0,
    loading: true
  },

  onLoad: function (options) {
    // 惰性清理：仅保留本周
    db.cleanupExpiredAllianceActivity().catch(() => {})

    if (options.zoneId) {
      this.setData({ zoneId: options.zoneId })
      this.loadData(options.zoneId)
    } else {
      this.resolveZone()
    }
  },

  onShow: function () {
    // 每次进入页面更新数据（需求：不实时刷新，进入时更新）
    if (this.data.zoneId) {
      this.loadData(this.data.zoneId)
    }
  },

  onPullDownRefresh: function () {
    if (this.data.zoneId) {
      this.loadData(this.data.zoneId, () => wx.stopPullDownRefresh())
    } else {
      wx.stopPullDownRefresh()
    }
  },

  // 未传 zoneId：优先用首页选择的分区，其次取自己管理的第一个分区
  resolveZone: async function () {
    try {
      let zone = app.globalData.currentZone
      if (!zone) {
        const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid
        const zones = await db.getZonesByCreator(userId)
        zone = (zones && zones.length > 0) ? zones[0] : null
      }
      if (!zone) {
        this.setData({ loading: false })
        util.showInfo('暂无可管理的分区')
        return
      }
      this.setData({ zoneId: zone._id })
      this.loadData(zone._id)
    } catch (err) {
      console.error('解析分区失败:', err)
      this.setData({ loading: false })
      util.showError('加载失败')
    }
  },

  loadData: async function (zoneId, callback) {
    try {
      const res = await db.getAllianceActivityOverview(zoneId)
      const dayIndex = res.dayIndex || 0

      this.setData({
        weekDates: res.weekDates || [],
        dayIndex: dayIndex,
        rows: res.rows || [],
        scrollLeft: 0,   // 列宽自适应，默认 7 列全显示、不滚动
        loading: false
      }, () => this.ensureTodayVisible())
    } catch (err) {
      console.error('加载联盟活跃总览失败:', err)
      this.setData({ loading: false })
      util.showError(err.message || '加载失败')
    }
    if (callback) callback()
  },

  /**
   * 保证"今天"所在列可见
   * 列宽已由 wxss 做成自适应（1/7，最小 32px）：
   *   - 7 列能放进可视区 → 不滚动（原来固定滚 (dayIndex-2)*56，今天本来可见也被滚走，周一会看不见）
   *   - 放不进（小屏/大字体）→ 滚动到让今天列贴右边缘，且不越过最大滚动量
   */
  ensureTodayVisible: function () {
    const self = this
    wx.createSelectorQuery()
      .select('.right-col').boundingClientRect()
      .select('.th').boundingClientRect()
      .exec(function (res) {
        if (self.__destroyed) return
        const viewW = (res[0] && res[0].width) || 0
        const colW = (res[1] && res[1].width) || 0
        if (!viewW || !colW) return

        const contentW = colW * 7
        if (contentW <= viewW + 1) {
          self.setData({ scrollLeft: 0 })
          return
        }
        const target = (self.data.dayIndex + 1) * colW - viewW
        const max = contentW - viewW
        self.setData({ scrollLeft: Math.max(0, Math.min(target, max)) })
      })
  },

  onUnload: function () {
    this.__destroyed = true
  },

  // 点击联盟名 → 进入该联盟的成员管理页（与盟管所见一致）
  onAllianceTap: function (e) {
    const allianceId = e.currentTarget.dataset.id
    if (!allianceId) return
    wx.navigateTo({
      url: '/pages/auditor/alliance-activity/alliance-activity?allianceId=' + allianceId
    })
  }
})
