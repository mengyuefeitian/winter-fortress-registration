// pages/user/my-registrations/my-registrations.js
// 「我的」个人中心：用户信息 + 分区 + 菜单入口
// 报名记录的查看与取消已迁移到 pages/user/my-records/my-records
const app = getApp()
const util = require('../../../utils/util')
const version = require('../../../utils/version')

Page({
  data: {
    isLoggedIn: false,
    userInfo: null,
    roleName: '',
    // 当前分区（仅展示该分区数据；切换分区需在首页操作）
    currentZone: null,
    versionText: version.getVersionText()
  },

  onLoad: function () {
    this.waitForRoleReady()
  },

  onShow: function () {
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
  },

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

          this.setData({
            isLoggedIn: false,
            userInfo: null,
            roleName: '未登录'
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
