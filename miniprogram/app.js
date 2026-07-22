// app.js
App({
  globalData: {
    userInfo: null,
    openid: null,
    role: 'user',
    phone: null,
    currentZone: null,
    currentAlliance: null,
    dbReady: false,
    roleReady: false,
    firstLaunch: true,
    pageCache: {}
  },

  onLaunch: function () {
    // 初始化云开发环境
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        env: 'cloud1-9gip4qyf7e753868',
        traceUser: true,
      })
    }

    // 初始化数据库
    this.globalData.db = wx.cloud.database()
    this.globalData.dbReady = true

    // 冷启动恢复上次选择的分区（小程序进程被杀后 globalData 会丢失，导致各页缓存命中不了）
    const savedZone = wx.getStorageSync('positionZoneCache')
    if (savedZone && savedZone._id) {
      this.globalData.currentZone = savedZone
    }

    // 检查是否首次启动
    const hasLaunched = wx.getStorageSync('hasLaunched')
    this.globalData.firstLaunch = !hasLaunched

    // 自动登录
    this.autoLogin()
  },

  // 自动登录
  autoLogin: async function () {
    try {
      // 从本地缓存读取用户信息
      const cachedUserInfo = wx.getStorageSync('userInfo')
      const cachedOpenid = wx.getStorageSync('openid')

      if (cachedUserInfo && cachedOpenid) {
        console.log('使用缓存自动登录')
        this.globalData.userInfo = cachedUserInfo
        this.globalData.openid = cachedOpenid
        this.globalData.phone = cachedUserInfo.phone
        this.globalData.role = cachedUserInfo.role || 'user'

        // 检查超管身份
        if (cachedUserInfo.phone) {
          await this.checkSuperAdmin(cachedUserInfo.phone)
        } else {
          this.globalData.roleReady = true
        }
        return
      }

      // 没有缓存，尝试云函数登录
      this.checkLoginStatus()
    } catch (err) {
      console.error('自动登录失败:', err)
      this.globalData.roleReady = true
    }
  },

  // 检查登录状态
  checkLoginStatus: function () {
    const that = this

    wx.cloud.callFunction({
      name: 'login',
      config: {
        env: 'cloud1-9gip4qyf7e753868'
      },
      data: {},
      success: res => {
        console.log('云函数调用成功:', res)
        that.globalData.openid = res.result.openid
        wx.setStorageSync('openid', res.result.openid)
        that.getUserInfo(res.result.openid)
      },
      fail: err => {
        console.error('云函数调用失败:', err)
        that.globalData.roleReady = true
      }
    })
  },

  // 获取用户信息
  getUserInfo: async function (openid) {
    const that = this
    const db = wx.cloud.database()

    try {
      const res = await db.collection('users').where({
        openid: openid
      }).get()

      if (res.data.length > 0) {
        const userData = res.data[0]
        that.globalData.userInfo = userData
        that.globalData.role = userData.role || 'user'
        that.globalData.phone = userData.phone

        // 缓存用户信息
        wx.setStorageSync('userInfo', userData)

        // 检查是否为超管
        await that.checkSuperAdmin(userData.phone)
      } else {
        that.globalData.role = 'user'
        that.globalData.roleReady = true
      }
    } catch (err) {
      console.error('获取用户信息失败:', err)
      that.globalData.roleReady = true
    }
  },

  // 检查超管身份
  checkSuperAdmin: async function (phone) {
    console.log('检查超管身份, phone:', phone)
    if (!phone) {
      console.log('没有phone，跳过超管检查')
      this.globalData.roleReady = true
      return
    }

    const db = wx.cloud.database()
    try {
      const resStr = await db.collection('superAdmins').where({
        phone: phone
      }).get()
      console.log('字符串查询结果:', resStr.data)

      const resNum = await db.collection('superAdmins').where({
        phone: parseInt(phone, 10)
      }).get()
      console.log('数字查询结果:', resNum.data)

      if (resStr.data.length > 0 || resNum.data.length > 0) {
        this.globalData.role = 'superAdmin'
        console.log('检测到超管身份')
      }
      this.globalData.roleReady = true
    } catch (err) {
      console.error('检查超管身份失败:', err)
      this.globalData.roleReady = true
    }
  },

  // 更新用户角色
  updateRole: function (role) {
    this.globalData.role = role
    if (this.globalData.userInfo) {
      this.globalData.userInfo.role = role
      wx.setStorageSync('userInfo', this.globalData.userInfo)
    }
  },

  // 设置已启动标记
  setHasLaunched: function () {
    wx.setStorageSync('hasLaunched', true)
    this.globalData.firstLaunch = false
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