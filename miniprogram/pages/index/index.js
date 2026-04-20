// pages/index/index.js
const app = getApp()
const util = require('../../utils/util')
const auth = require('../../utils/auth')
const db = require('../../utils/db')

Page({
  data: {
    isLoggedIn: false,
    userInfo: null,
    currentRole: 'user',
    roleDisplayName: '普通用户',
    // 功能入口显示控制
    showFortressRegistration: false,
    showPositionRegistration: false,
    showMyRegistrations: false,
    showApplyAllianceManager: false,
    showApplyZoneManager: false,
    showAdminConsole: false,
    showAuditorConsole: false,
    showSuperAdminConsole: false,
    // 区域选择
    zones: [],
    currentZone: null,
    zoneIndex: 0
  },

  onLoad: function () {
    this.checkLoginStatus()
  },

  onShow: function () {
    // 每次显示页面时都重新检查登录状态
    this.checkLoginStatus()
  },

  // 等待角色就绪
  waitForRoleReady: function () {
    if (app.globalData.roleReady) {
      this.updateRoleInfo()
      this.loadZones()
    } else {
      setTimeout(() => {
        this.waitForRoleReady()
      }, 100)
    }
  },

  // 检查登录状态
  checkLoginStatus: function () {
    const userInfo = app.globalData.userInfo
    const openid = app.globalData.openid

    console.log('checkLoginStatus - userInfo:', userInfo ? '有' : '无', 'openid:', openid ? '有' : '无')

    if (userInfo && openid) {
      this.setData({
        isLoggedIn: true,
        userInfo: userInfo,
        currentRole: app.globalData.role || 'user'
      })
      this.waitForRoleReady()
    } else {
      // 未登录状态
      this.setData({
        isLoggedIn: false,
        userInfo: null,
        currentRole: 'user',
        roleDisplayName: '未登录',
        showFortressRegistration: false,
        showPositionRegistration: false,
        showMyRegistrations: false,
        showApplyAllianceManager: false,
        showApplyZoneManager: false,
        showAdminConsole: false,
        showAuditorConsole: false,
        showSuperAdminConsole: false,
        zones: [],
        currentZone: null
      })
    }
  },

  // 更新角色信息和功能入口显示
  updateRoleInfo: function () {
    const role = app.globalData.role
    const roleDisplayName = auth.getRoleDisplayName(role)
    let userInfo = app.globalData.userInfo
    const phone = app.globalData.phone

    // 确保userInfo包含phone信息
    if (userInfo && phone && !userInfo.phone) {
      userInfo = { ...userInfo, phone: phone }
    }

    // 根据角色设置功能入口显示
    const isUser = role === 'user'
    const isAdmin = role === 'admin'
    const isAuditor = role === 'auditor'
    const isSuperAdmin = role === 'superAdmin'

    this.setData({
      userInfo: userInfo || this.data.userInfo,
      currentRole: role,
      roleDisplayName: roleDisplayName,
      // 普通用户功能
      showFortressRegistration: isUser,
      showPositionRegistration: isUser,
      showMyRegistrations: isUser,
      showApplyAllianceManager: isUser,
      showApplyZoneManager: isUser,
      // 管理员功能
      showAdminConsole: isAdmin,
      // 盟管功能
      showAuditorConsole: isAuditor,
      // 超管功能
      showSuperAdminConsole: isSuperAdmin
    })
  },

  // 加载区域列表
  loadZones: async function () {
    try {
      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid
      const role = app.globalData.role

      // 超级管理员可以看到所有分区，管理员只能看到自己创建的
      let zones
      if (role === 'superAdmin') {
        zones = await db.getAllZones()
      } else if (role === 'admin') {
        zones = await db.getZonesByCreator(userId)
      } else {
        // 普通用户和审计员可以看到所有分区
        zones = await db.getAllZones()
      }

      if (!zones || zones.length === 0) {
        this.setData({
          zones: [],
          currentZone: null
        })
        return
      }

      // 从本地存储读取上次选择的区域
      const lastZoneId = wx.getStorageSync('lastZoneId')
      let currentZone = null
      let zoneIndex = 0

      if (lastZoneId) {
        const foundIndex = zones.findIndex(z => z._id === lastZoneId)
        if (foundIndex !== -1) {
          currentZone = zones[foundIndex]
          zoneIndex = foundIndex
        }
      }

      // 如果没找到上次的区域，默认选择第一个
      if (!currentZone && zones.length > 0) {
        currentZone = zones[0]
        zoneIndex = 0
      }

      // 保存到全局
      if (currentZone) {
        app.globalData.currentZone = currentZone
      }

      this.setData({
        zones: zones,
        currentZone: currentZone,
        zoneIndex: zoneIndex
      })

    } catch (err) {
      console.error('加载区域失败:', err)
      // 失败时设置空列表，不影响其他功能
      this.setData({
        zones: [],
        currentZone: null
      })
    }
  },

  // 区域选择变化
  onZoneChange: function (e) {
    const index = parseInt(e.detail.value)
    const zone = this.data.zones[index]

    if (zone) {
      // 保存选择到本地存储
      wx.setStorageSync('lastZoneId', zone._id)
      app.globalData.currentZone = zone

      this.setData({
        zoneIndex: index,
        currentZone: zone
      })
    }
  },

  // 处理登录
  handleLogin: function () {
    wx.navigateTo({
      url: '/pages/login/login'
    })
  },

  // 堡垒报名
  goToFortressRegistration: function () {
    wx.navigateTo({
      url: '/pages/user/registration/registration'
    })
  },

  // 官职报名
  goToPositionRegistration: function () {
    wx.navigateTo({
      url: '/pages/user/position-list/position-list'
    })
  },

  // 我的报名
  goToMyRegistrations: function () {
    wx.navigateTo({
      url: '/pages/user/my-registrations/my-registrations'
    })
  },

  // 申请盟管
  applyAllianceManager: function () {
    this.showApplyDialog('申请盟管', 'auditor')
  },

  // 申请区管
  applyZoneManager: function () {
    this.showApplyDialog('申请区管', 'admin')
  },

  // 显示申请弹窗
  showApplyDialog: function (title, targetRole) {
    const phone = app.globalData.phone

    wx.showModal({
      title: title,
      content: '申请需要绑定手机号，是否立即申请？',
      confirmText: '立即申请',
      success: (res) => {
        if (res.confirm) {
          this.showPhoneInputDialog(targetRole)
        }
      }
    })
  },

  // 显示手机号输入弹窗
  showPhoneInputDialog: function (targetRole) {
    wx.showModal({
      title: '绑定手机号',
      editable: true,
      placeholderText: '请输入手机号',
      success: (res) => {
        if (res.confirm && res.content) {
          const phone = res.content.trim()
          if (!phone || phone.length !== 11) {
            util.showInfo('请输入正确的11位手机号')
            return
          }
          this.submitApplication(phone, targetRole)
        }
      }
    })
  },

  // 提交申请
  submitApplication: async function (phone, targetRole) {
    try {
      util.showLoading('正在申请...')

      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

      if (!userId) {
        util.hideLoading()
        util.showInfo('请先登录')
        return
      }

      // 检查手机号是否已被其他用户绑定
      const userByPhone = await db.getUserByPhone(phone)
      const currentOpenid = app.globalData.openid

      if (userByPhone && userByPhone.openid !== currentOpenid) {
        util.hideLoading()
        util.showError('该手机号已被其他用户绑定')
        return
      }

      // 检查是否已有申请
      const existingApplication = await this.checkExistingApplication(userId)

      if (existingApplication) {
        util.hideLoading()
        util.showInfo('您已有待审核的申请')
        return
      }

      // 绑定手机号到当前用户
      const wxdb = wx.cloud.database()
      const userRecord = await db.getUserByOpenid(currentOpenid)

      if (userRecord) {
        await wxdb.collection('users').doc(userRecord._id).update({
          data: {
            phone: phone,
            updateTime: wxdb.serverDate()
          }
        })
      }

      // 更新全局数据
      app.globalData.phone = phone
      if (app.globalData.userInfo) {
        app.globalData.userInfo.phone = phone
      }

      // 创建管理员申请（根据目标角色确定申请类型）
      const applyType = targetRole === 'admin' ? 'zoneManager' : 'allianceManager'
      await db.createAdminApplication(userId, phone, applyType)

      util.hideLoading()
      util.showSuccess('申请已提交，等待审核')

    } catch (err) {
      util.hideLoading()
      util.showError('申请失败：' + (err.message || '未知错误'))
    }
  },

  // 检查是否已有申请
  checkExistingApplication: async function (userId) {
    const db = wx.cloud.database()
    const res = await db.collection('admins').where({
      userId: userId,
      status: 'pending'
    }).get()
    return res.data.length > 0
  },

  // 区管控制台
  goToAdminConsole: function () {
    wx.navigateTo({
      url: '/pages/admin/home/home'
    })
  },

  // 盟管控制台
  goToAuditorConsole: function () {
    wx.navigateTo({
      url: '/pages/auditor/home/home'
    })
  },

  // 超管控制台
  goToSuperAdminConsole: function () {
    wx.navigateTo({
      url: '/pages/superAdmin/home/home'
    })
  }
})