// pages/user/position-list/position-list.js
const app = getApp()
const util = require('../../utils/util')
const db = require('../../utils/db')

Page({
  data: {
    loading: false,
    configs: []
  },

  onLoad: function () {
    this.loadConfigs()
  },

  onShow: function () {
    // 每次显示页面时刷新数据
    this.loadConfigs()
  },

  // 加载官职配置列表
  loadConfigs: async function () {
    try {
      this.setData({ loading: true })

      // 获取今天的日期字符串
      const today = util.formatDate(new Date())

      // 获取所有活跃的官职配置
      const allConfigs = await db.getPositionConfigs()

      // 筛选今天及以后的配置
      const validConfigs = allConfigs.filter(config => {
        return config.date >= today
      })

      // 按日期排序
      validConfigs.sort((a, b) => {
        if (a.date === b.date) {
          return a.positionType.localeCompare(b.positionType)
        }
        return a.date.localeCompare(b.date)
      })

      this.setData({
        configs: validConfigs,
        loading: false
      })

    } catch (err) {
      console.error('加载配置失败:', err)
      util.showError('加载失败')
      this.setData({
        configs: [],
        loading: false
      })
    }
  },

  // 跳转到座位选择页
  goToRegistration: function (e) {
    const configId = e.currentTarget.dataset.configId
    wx.navigateTo({
      url: `/pages/user/position-registration/position-registration?configId=${configId}`
    })
  },

  // 刷新数据
  refreshData: function () {
    this.loadConfigs()
  }
})