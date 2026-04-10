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
    roleName: '普通用户',
    canBeAdmin: false,
    canBeAuditor: false,
    isSuperAdmin: false,
    isAdminOrAbove: false,
    canManageZone: false,
    canConfigTimeSlot: false,
    canReviewAdmin: false
  },

  onLoad: function () {
    this.checkLoginStatus()
  },

  onShow: function () {
    this.updateRoleInfo()
  },

  // 检查登录状态
  checkLoginStatus: function () {
    const userInfo = app.globalData.userInfo
    const openid = app.globalData.openid

    if (userInfo && openid) {
      this.setData({
        isLoggedIn: true,
        userInfo: userInfo,
        currentRole: app.globalData.role
      })
      this.updateRoleInfo()
    } else {
      // 延迟检查，等待云函数返回
      setTimeout(() => {
        this.checkLoginStatus()
      }, 1000)
    }
  },

  // 更新角色信息
  updateRoleInfo: function () {
    const role = app.globalData.role
    const roleName = util.getRoleName(role)

    this.setData({
      currentRole: role,
      roleName: roleName,
      isSuperAdmin: auth.isSuperAdmin(role),
      canBeAdmin: auth.isAdminOrAbove(role),
      canBeAuditor: role === 'auditor' || role === 'superAdmin',
      isAdminOrAbove: auth.isAdminOrAbove(role),
      canManageZone: auth.canManageZone(role),
      canConfigTimeSlot: auth.canConfigTimeSlot(role),
      canReviewAdmin: auth.canReviewAdmin(role)
    })
  },

  // 处理登录
  handleLogin: function () {
    wx.navigateTo({
      url: '/pages/login/login'
    })
  },

  // 切换角色
  switchRole: function (e) {
    const targetRole = e.currentTarget.dataset.role
    const currentRole = this.data.currentRole

    // 不能切换到没有权限的角色
    if (!this.checkRolePermission(targetRole)) {
      util.showInfo('您没有该角色的权限')
      return
    }

    if (targetRole !== currentRole) {
      this.setData({
        currentRole: targetRole,
        roleName: util.getRoleName(targetRole)
      })

      // 根据角色跳转到不同页面
      this.navigateToRoleHome(targetRole)
    }
  },

  // 检查角色权限
  checkRolePermission: function (targetRole) {
    const role = app.globalData.role

    switch (targetRole) {
      case 'user':
        return true
      case 'admin':
        return auth.isAdminOrAbove(role)
      case 'auditor':
        return role === 'auditor' || role === 'superAdmin'
      case 'superAdmin':
        return auth.isSuperAdmin(role)
      default:
        return false
    }
  },

  // 根据角色跳转到首页
  navigateToRoleHome: function (role) {
    switch (role) {
      case 'user':
        // 普通用户跳转到报名页
        wx.navigateTo({
          url: '/pages/user/registration/registration'
        })
        break
      case 'admin':
        wx.navigateTo({
          url: '/pages/admin/home/home'
        })
        break
      case 'auditor':
        wx.navigateTo({
          url: '/pages/auditor/home/home'
        })
        break
      case 'superAdmin':
        wx.navigateTo({
          url: '/pages/superAdmin/home/home'
        })
        break
    }
  },

  // 申请管理员
  applyAdmin: function () {
    wx.showModal({
      title: '申请管理员',
      content: '申请成为管理员需要绑定手机号，是否继续？',
      success: (res) => {
        if (res.confirm) {
          this.applyForAdmin()
        }
      }
    })
  },

  // 执行申请管理员
  applyForAdmin: async function () {
    try {
      util.showLoading('正在申请...')

      const userId = app.globalData.userInfo._id

      // 检查是否已有申请
      const existingApplication = await this.checkExistingApplication(userId)

      if (existingApplication) {
        util.hideLoading()
        util.showInfo('您已有待审核的申请')
        return
      }

      // 获取手机号
      const phone = await this.getPhoneNumber()

      if (!phone) {
        util.hideLoading()
        util.showInfo('需要绑定手机号')
        return
      }

      // 创建申请
      await db.createAdminApplication(userId, phone)

      util.hideLoading()
      util.showSuccess('申请已提交，等待审核')

    } catch (err) {
      util.hideLoading()
      util.showError('申请失败：' + err.message)
    }
  },

  // 检查是否已有申请
  checkExistingApplication: async function (userId) {
    const wx.cloud.database()
    const res = await wx.cloud.database().collection('admins').where({
      userId: userId,
      status: 'pending'
    }).get()
    return res.data.length > 0
  },

  // 获取手机号
  getPhoneNumber: function () {
    return new Promise((resolve, reject) => {
      wx.showModal({
        title: '绑定手机号',
        content: '请点击确定按钮，然后在弹出窗口中选择手机号',
        success: async (res) => {
          if (res.confirm) {
            // 这里需要使用button组件的open-type="getPhoneNumber"
            // 由于Modal不支持，这里简化处理
            resolve(app.globalData.phone || null)
          } else {
            resolve(null)
          }
        }
      })
    })
  },

  // 快捷入口跳转
  goToRegistration: function () {
    wx.navigateTo({
      url: '/pages/user/registration/registration'
    })
  },

  goToStatistics: function () {
    // 根据角色跳转到对应的统计页面
    const role = this.data.currentRole
    let url = '/pages/admin/statistics/statistics'

    if (role === 'auditor') {
      url = '/pages/auditor/statistics/statistics'
    } else if (role === 'superAdmin') {
      url = '/pages/superAdmin/all-statistics/all-statistics'
    }

    wx.navigateTo({ url: url })
  },

  goToZoneManage: function () {
    wx.navigateTo({
      url: '/pages/admin/zone-manage/zone-manage'
    })
  },

  goToTimeSlotConfig: function () {
    wx.navigateTo({
      url: '/pages/admin/time-slot-config/time-slot-config'
    })
  },

  goToAdminReview: function () {
    wx.navigateTo({
      url: '/pages/superAdmin/admin-review/admin-review'
    })
  },

  goToPhoneManage: function () {
    wx.navigateTo({
      url: '/pages/superAdmin/phone-manage/phone-manage'
    })
  }
})