// pages/superAdmin/auto-clear/auto-clear.js
const app = getApp()
const util = require('../../../utils/util')
const auth = require('../../../utils/auth')

Page({
  data: {
    enabled: false,
    dayIndex: 0,
    hourIndex: 0,
    dayOptions: [
      { value: 1, name: '周一' },
      { value: 2, name: '周二' },
      { value: 3, name: '周三' },
      { value: 4, name: '周四' },
      { value: 5, name: '周五' },
      { value: 6, name: '周六' },
      { value: 7, name: '周日' }
    ],
    hourOptions: []
  },

  onLoad: function () {
    this.waitForRoleReady()
  },

  // 等待角色就绪
  waitForRoleReady: function () {
    if (app.globalData.roleReady) {
      this.checkPermission()
    } else {
      setTimeout(() => {
        this.waitForRoleReady()
      }, 100)
    }
  },

  // 检查权限
  checkPermission: function () {
    const role = app.globalData.role || 'user'
    if (!auth.isSuperAdmin(role)) {
      util.showError('权限不足')
      wx.switchTab({
        url: '/pages/index/index'
      })
      return
    }
    this.initHourOptions()
    this.loadConfig()
  },

  // 初始化小时选项
  initHourOptions: function () {
    const hours = []
    for (let i = 0; i <= 24; i++) {
      hours.push(i.toString().padStart(2, '0'))
    }
    this.setData({ hourOptions: hours })
  },

  // 加载配置
  loadConfig: async function () {
    try {
      const wxdb = wx.cloud.database()
      const res = await wxdb.collection('settings').where({
        _id: 'autoClear'
      }).get()

      if (res.data && res.data.length > 0) {
        const config = res.data[0]
        this.setData({
          enabled: config.enabled || false,
          dayIndex: (config.day || 1) - 1,
          hourIndex: config.hour || 0
        })
      }
    } catch (err) {
      console.log('暂无配置，使用默认值')
    }
  },

  // 开关变化
  onSwitchChange: function (e) {
    this.setData({
      enabled: e.detail.value
    })
  },

  // 日期变化
  onDayChange: function (e) {
    this.setData({
      dayIndex: parseInt(e.detail.value)
    })
  },

  // 小时变化
  onHourChange: function (e) {
    this.setData({
      hourIndex: parseInt(e.detail.value)
    })
  },

  // 保存配置
  saveConfig: async function () {
    try {
      util.showLoading('保存中...')

      const wxdb = wx.cloud.database()
      const config = {
        _id: 'autoClear',
        enabled: this.data.enabled,
        day: this.data.dayOptions[this.data.dayIndex].value,
        hour: this.data.hourIndex,
        updateTime: new Date()
      }

      // 先尝试查询是否存在
      let exists = false
      try {
        const checkRes = await wxdb.collection('settings').doc('autoClear').get()
        exists = true
      } catch (err) {
        exists = false
      }

      if (exists) {
        // 更新
        await wxdb.collection('settings').doc('autoClear').update({
          data: {
            enabled: config.enabled,
            day: config.day,
            hour: config.hour,
            updateTime: new Date()
          }
        })
      } else {
        // 新增
        await wxdb.collection('settings').add({
          data: config
        })
      }

      util.hideLoading()
      util.showSuccess('保存成功')

      if (this.data.enabled) {
        const dayName = this.data.dayOptions[this.data.dayIndex].name
        const hourStr = this.data.hourOptions[this.data.hourIndex]
        wx.showModal({
          title: '配置已保存',
          content: `自动清空已开启（${dayName} ${hourStr}:00 执行）。\n\n定时任务由云函数自动处理，无需手动配置。`,
          showCancel: false,
          confirmText: '我知道了'
        })
      }

    } catch (err) {
      console.error('保存失败:', err)
      util.hideLoading()
      util.showError('保存失败: ' + (err.message || '请检查数据库权限'))
    }
  },

  // 手动清空
  manualClear: function () {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空所有报名数据吗？此操作不可恢复！',
      confirmText: '确认清空',
      confirmColor: '#FF6B6B',
      success: async (res) => {
        if (res.confirm) {
          try {
            util.showLoading('正在清空...')

            const result = await wx.cloud.callFunction({
              name: 'clearRegistrations',
              data: {
                action: 'clearExpiredAll',
                data: {}
              }
            })

            util.hideLoading()
            if (result.result.err) {
              util.showError('清空失败: ' + result.result.err)
            } else {
              util.showSuccess(result.result.message || '清空成功')
            }

          } catch (err) {
            util.hideLoading()
            util.showError('清空失败: ' + err.message)
          }
        }
      }
    })
  }
})