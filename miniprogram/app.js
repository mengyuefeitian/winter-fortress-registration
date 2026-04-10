// app.js
App({
  globalData: {
    userInfo: null,
    openid: null,
    role: 'user', // user, admin, auditor, superAdmin
    phone: null,
    currentZone: null,
    currentAlliance: null,
    dbReady: false
  },

  onLaunch: function () {
    // 初始化云开发环境
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        env: 'cloud1-9gip4qyf7e753868', // 替换为您的云开发环境ID
        traceUser: true,
      })
    }

    // 初始化数据库
    this.globalData.db = wx.cloud.database()
    this.globalData.dbReady = true

    // 检查登录状态
    this.checkLoginStatus()
  },

  // 检查登录状态
  checkLoginStatus: function () {
    const that = this
    wx.cloud.callFunction({
      name: 'login',
      data: {},
      success: res => {
        that.globalData.openid = res.result.openid
        that.getUserInfo(res.result.openid)
      },
      fail: err => {
        console.error('登录失败:', err)
        // 如果云函数失败，使用本地缓存
        const userInfo = wx.getStorageSync('userInfo')
        if (userInfo) {
          that.globalData.userInfo = userInfo
          that.globalData.role = userInfo.role || 'user'
        }
      }
    })
  },

  // 获取用户信息
  getUserInfo: function (openid) {
    const that = this
    const db = wx.cloud.database()

    db.collection('users').where({
      openid: openid
    }).get().then(res => {
      if (res.data.length > 0) {
        const userData = res.data[0]
        that.globalData.userInfo = userData
        that.globalData.role = userData.role || 'user'
        that.globalData.phone = userData.phone

        // 检查是否为超管
        that.checkSuperAdmin(userData.phone)
      } else {
        // 新用户，默认为普通用户
        that.globalData.role = 'user'
      }
    }).catch(err => {
      console.error('获取用户信息失败:', err)
    })
  },

  // 检查超管身份
  checkSuperAdmin: function (phone) {
    if (!phone) return

    const db = wx.cloud.database()
    db.collection('superAdmins').where({
      phone: phone
    }).get().then(res => {
      if (res.data.length > 0) {
        this.globalData.role = 'superAdmin'
      }
    }).catch(err => {
      console.error('检查超管身份失败:', err)
    })
  },

  // 更新用户角色
  updateRole: function (role) {
    this.globalData.role = role
    if (this.globalData.userInfo) {
      this.globalData.userInfo.role = role
      wx.setStorageSync('userInfo', this.globalData.userInfo)
    }
  },

  // 设置当前分区
  setCurrentZone: function (zone) {
    this.globalData.currentZone = zone
  },

  // 设置当前联盟
  setCurrentAlliance: function (alliance) {
    this.globalData.currentAlliance = alliance
  }
})