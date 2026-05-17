// pages/index/index.js
const app = getApp()
const util = require('../../utils/util')
const auth = require('../../utils/auth')
const db = require('../../utils/db')
const version = require('../../utils/version')

Page({
  data: {
    isLoggedIn: false,
    userInfo: null,
    currentRole: 'user',
    roleDisplayName: '普通用户',
    versionText: version.getVersionText(),
    // 功能入口显示控制
    showFortressRegistration: false,
    showPositionRegistration: false,
    showBattleRegistration: false,
    showMyRegistrations: false,
    showApplyAllianceManager: false,
    showApplyZoneManager: false,
    showAdminConsole: false,
    showAuditorConsole: false,
    showSuperAdminConsole: false,
    // 区域选择
    zones: [],
    currentZone: null,
    zonesLoaded: false
  },

  onLoad: function () {
    this.checkLoginStatus()
  },

  onShow: function () {
    // 每次显示页面时都重新检查登录状态
    this.checkLoginStatus()
    // 检查是否有未读的系统通知（分区开通被拒等）
    this.checkSystemNotifications()
  },

  // 检查系统通知（分区开通被拒等）
  checkSystemNotifications: async function () {
    try {
      const userId = app.globalData.openid
      if (!userId) return

      // 用户已选择分区则不再提示
      if (this.data.currentZone) return

      // 检查是否已提示过（按用户ID区分）
      const notifiedKey = `zoneCreationNotified_${userId}`
      const notified = wx.getStorageSync(notifiedKey)
      if (notified) return

      const wxdb = wx.cloud.database()
      const res = await wxdb.collection('admins').where({
        userId: userId,
        status: 'rejected',
        rejectType: 'zoneAlreadyExists'
      }).orderBy('reviewTime', 'desc').limit(1).get()

      if (res.data && res.data.length > 0) {
        const latest = res.data[0]
        if (latest.rejectReason && latest.reviewTime) {
          const reviewDate = new Date(latest.reviewTime)
          const now = new Date()
          const daysDiff = (now - reviewDate) / (1000 * 60 * 60 * 24)
          if (daysDiff <= 7) {
            // 显示通知
            wx.showModal({
              title: '分区开通通知',
              content: latest.rejectReason,
              showCancel: false,
              confirmText: '我知道了',
              success: async () => {
                // 用户确认后，彻底删除该记录，不再重复通知
                try {
                  await wxdb.collection('admins').doc(latest._id).remove()
                  // 同时标记本地缓存，防止同一账号多端登录时重复通知
                  wx.setStorageSync(notifiedKey, true)
                  console.log('已删除分区开通拒绝记录:', latest._id)
                } catch (err) {
                  console.error('删除通知记录失败:', err)
                  // 删除失败时至少标记缓存
                  wx.setStorageSync(notifiedKey, true)
                }
              }
            })
          }
        }
      }
    } catch (err) {
      console.error('检查系统通知失败:', err)
    }
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
  checkLoginStatus: async function () {
    const userInfo = app.globalData.userInfo
    const openid = app.globalData.openid

    console.log('checkLoginStatus - userInfo:', userInfo ? '有' : '无', 'openid:', openid ? '有' : '无')

    if (userInfo && openid) {
      this.setData({
        isLoggedIn: true,
        userInfo: userInfo,
        currentRole: app.globalData.role || 'user'
      })

      // 从数据库实时查询用户角色（确保权限实时更新）
      await this.refreshUserRole()

      this.waitForRoleReady()
    } else {
      // 未登录状态，仍显示浏览类功能，不强制跳转登录页
      this.setData({
        isLoggedIn: false,
        userInfo: null,
        currentRole: 'user',
        roleDisplayName: '未登录',
        // 浏览类功能可见（点击时引导登录）
        showFortressRegistration: true,
        showPositionRegistration: true,
        showBattleRegistration: true,
        showMyRegistrations: false,
        // 需要登录的功能隐藏
        showApplyAllianceManager: false,
        showApplyZoneManager: false,
        showAdminConsole: false,
        showAuditorConsole: false,
        showSuperAdminConsole: false,
        zones: [],
        currentZone: null,
        zonesLoaded: true
      })

      // 确保角色就绪标志设为 true（让 openid 获取完成）
      if (app.globalData.roleReady) {
        this.loadZones()
      } else {
        this.waitForRoleReady()
      }
    }
  },

  // 从数据库实时刷新用户角色
  refreshUserRole: async function () {
    try {
      const openid = app.globalData.openid
      if (!openid) return

      const wxdb = wx.cloud.database()
      const res = await wxdb.collection('users').where({ openid: openid }).get()

      if (res.data && res.data.length > 0) {
        const userData = res.data[0]
        const newRole = userData.role || 'user'
        const oldRole = app.globalData.role || 'user'

        // 如果角色发生变化，更新缓存
        if (newRole !== oldRole) {
          console.log('角色已更新:', oldRole, '→', newRole)

          app.globalData.role = newRole
          app.globalData.userInfo = userData

          // 更新本地缓存
          wx.setStorageSync('userInfo', userData)

          this.setData({
            currentRole: newRole,
            userInfo: userData
          })
        }
      }
    } catch (err) {
      console.error('刷新用户角色失败:', err)
    }
  },

  // 更新角色信息和功能入口显示
  updateRoleInfo: async function () {
    const globalRole = app.globalData.role || 'user'
    let roleDisplayName = auth.getRoleDisplayName(globalRole)
    let userInfo = app.globalData.userInfo
    const phone = app.globalData.phone
    const isLoggedIn = !!(userInfo && app.globalData.openid)

    // 确保userInfo包含phone信息
    if (userInfo && phone && !userInfo.phone) {
      userInfo = { ...userInfo, phone: phone }
    }

    if (!isLoggedIn) {
      // 未登录：只显示浏览类功能
      this.setData({
        isLoggedIn: false,
        userInfo: null,
        currentRole: 'user',
        roleDisplayName: '未登录',
        showFortressRegistration: true,
        showPositionRegistration: true,
        showBattleRegistration: true,
        showMyRegistrations: false,
        showApplyAllianceManager: false,
        showApplyZoneManager: false,
        showAdminConsole: false,
        showAuditorConsole: false,
        showSuperAdminConsole: false
      })
      return
    }

    // 计算用户在当前分区的有效角色
    let effectiveRole = globalRole
    if (this.data.currentZone && globalRole !== 'superAdmin') {
      effectiveRole = await this.computeCurrentZoneRole(this.data.currentZone)
      roleDisplayName = auth.getRoleDisplayName(effectiveRole)
    }

    // 根据有效角色设置功能入口显示
    const isUser = effectiveRole === 'user'
    const isAdmin = effectiveRole === 'admin'
    const isAuditor = effectiveRole === 'auditor'
    const isSuperAdmin = effectiveRole === 'superAdmin'
    const isAdminOrAbove = isAdmin || isAuditor || isSuperAdmin
    const isSuperAdminOrAdmin = isSuperAdmin || isAdmin
    const canApplyZoneManager = isUser || isAuditor

    this.setData({
      isLoggedIn: true,
      userInfo: userInfo || this.data.userInfo,
      currentRole: effectiveRole,
      roleDisplayName: roleDisplayName,
      // 普通用户功能（所有角色都可见）
      showFortressRegistration: true,
      showPositionRegistration: true,
      showBattleRegistration: true,
      showMyRegistrations: true,
      // 申请盟管：仅普通用户可见
      showApplyAllianceManager: isUser,
      // 申请区管：普通用户和盟管可见（角色升级）
      showApplyZoneManager: canApplyZoneManager,
      // 区管控制台（区管和超管可见）
      showAdminConsole: isSuperAdminOrAdmin,
      // 盟管控制台（盟管、区管和超管可见）
      showAuditorConsole: isAdminOrAbove,
      // 超管控制台（仅超管可见）
      showSuperAdminConsole: isSuperAdmin
    })
  },

  // 计算用户在当前分区的有效角色
  computeCurrentZoneRole: async function (zone) {
    const globalRole = app.globalData.role || 'user'
    const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

    // 超管在任何分区都是超管
    if (globalRole === 'superAdmin') return 'superAdmin'

    // 检查是否是该分区的区管
    const isZoneManager = await this.checkIsZoneManagerInZone(userId, zone)
    if (isZoneManager) return 'admin'

    // 检查是否是该分区的盟管
    const isAuditor = await this.checkIsAuditorInZone(userId, zone)
    if (isAuditor) return 'auditor'

    // 默认普通用户
    return 'user'
  },

  // 加载区域列表
  loadZones: async function () {
    try {
      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid
      const role = app.globalData.role || 'user'

      // 首页分区选择：所有角色（包括区管）都可以看到所有分区
      // 区管在首页选择分区用于普通用户功能（报名等）
      // 区管控制台才限制为只显示自己管理的分区
      let zones = await db.getAllZones()

      if (!zones || zones.length === 0) {
        this.setData({
          zones: [],
          currentZone: null,
          zonesLoaded: true
        })
        return
      }

      // 优先级：全局分区 > 本地存储
      let currentZone = null

      // 1. 优先读取全局分区
      if (app.globalData.currentZone) {
        const foundIndex = zones.findIndex(z => z._id === app.globalData.currentZone._id)
        if (foundIndex !== -1) {
          currentZone = zones[foundIndex]
        }
      }

      // 2. 如果全局分区不在列表中，尝试本地存储
      if (!currentZone) {
        const lastZoneId = wx.getStorageSync('lastZoneId')
        if (lastZoneId) {
          const foundIndex = zones.findIndex(z => z._id === lastZoneId)
          if (foundIndex !== -1) {
            currentZone = zones[foundIndex]
          }
        }
      }

      // 保存到全局
      if (currentZone) {
        app.globalData.currentZone = currentZone
        wx.setStorageSync('lastZoneId', currentZone._id)
      }

      this.setData({
        zones: zones,
        currentZone: currentZone,
        zonesLoaded: true
      })

      // 分区加载完成后更新角色显示
      if (currentZone) {
        await this.updateRoleInfo()
      }

    } catch (err) {
      console.error('加载区域失败:', err)
      this.setData({
        zones: [],
        currentZone: null,
        zonesLoaded: true
      })
      // 未选中分区时仍可提示通知
      wx.removeStorageSync('zoneCreationNotified')
    }
  },

  // 区域选择变化（由组件内部处理全局状态同步）
  onZoneChange: async function (e) {
    const zone = e.detail.zone
    if (zone) {
      this.setData({
        currentZone: zone
      })
      // 用户选择了分区，清除通知标记
      wx.removeStorageSync('zoneCreationNotified')
      // 分区切换后重新计算角色
      await this.updateRoleInfo()
    }
  },

  // 处理登录
  handleLogin: function () {
    wx.navigateTo({
      url: '/pages/login/login'
    })
  },

  // 确保已登录（未登录则引导到登录页）
  ensureLogin: function () {
    if (this.data.isLoggedIn) return true

    wx.showModal({
      title: '需要登录',
      content: '该功能需要登录后使用，是否前往登录？',
      confirmText: '去登录',
      success: (res) => {
        if (res.confirm) {
          wx.navigateTo({
            url: '/pages/login/login'
          })
        }
      }
    })
    return false
  },

  // 堡垒报名
  goToFortressRegistration: function () {
    if (!this.ensureLogin()) return
    wx.navigateTo({
      url: '/pages/user/registration/registration'
    })
  },

  // 官职报名
  goToPositionRegistration: function () {
    if (!this.ensureLogin()) return
    wx.navigateTo({
      url: '/pages/user/position-list/position-list'
    })
  },

  // 国战报名
  goToBattleRegistration: function () {
    if (!this.ensureLogin()) return
    wx.navigateTo({
      url: '/pages/user/battle-list/battle-list'
    })
  },

  // 兵工厂报名
  goToArsenalRegistration: function () {
    if (!this.ensureLogin()) return
    wx.navigateTo({
      url: '/pages/user/arsenal-registration/arsenal-registration'
    })
  },

  // 峡谷会战报名
  goToCanyonRegistration: function () {
    if (!this.ensureLogin()) return
    wx.navigateTo({
      url: '/pages/user/canyon-registration/canyon-registration'
    })
  },

  // 意见与建议
  goToFeedback: function () {
    wx.navigateTo({
      url: '/pages/user/feedback/feedback'
    })
  },

  // 我的报名
  goToMyRegistrations: function () {
    if (!this.ensureLogin()) return
    wx.switchTab({
      url: '/pages/user/my-registrations/my-registrations'
    })
  },

  // 申请盟管
  applyAllianceManager: async function () {
    if (!this.ensureLogin()) return
    if (!this.data.currentZone) {
      util.showInfo('请先选择您的分区后再申请')
      return
    }

    // 检查申请记录
    const userId = app.globalData.openid
    if (!userId) return

    const typeText = '盟管'
    try {
      const applications = await db.getUserApplications(userId)
      const sameTypeApps = applications.filter(a => a.applyType === 'allianceManager')

      if (sameTypeApps.length > 0) {
        const latestApp = sameTypeApps[0]

        if (latestApp.status === 'pending') {
          wx.showModal({
            title: '申请' + typeText,
            content: '您已提交' + typeText + '申请，正在等待审核。',
            showCancel: false,
            confirmText: '我知道了'
          })
          return
        }

        if (latestApp.status === 'rejected') {
          wx.showModal({
            title: '申请' + typeText,
            content: '您之前的' + typeText + '申请已被拒绝。是否重新申请？',
            confirmText: '重新申请',
            success: (res) => {
              if (res.confirm) {
                wx.navigateTo({ url: '/pages/user/apply-alliance-manager/apply-alliance-manager' })
              }
            }
          })
          return
        }

        if (latestApp.status === 'approved') {
          const currentUserId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid
          const currentZone = this.data.currentZone || app.globalData.currentZone
          const isCurrentZoneAuditor = await this.checkIsAuditorInZone(currentUserId, currentZone)

          if (isCurrentZoneAuditor) {
            wx.showModal({
              title: '申请' + typeText,
              content: '您已是该分区的盟管。',
              showCancel: false,
              confirmText: '我知道了'
            })
            return
          }
        }
      }

      // 没有任何记录或允许重新申请，跳转到申请页面
      wx.navigateTo({ url: '/pages/user/apply-alliance-manager/apply-alliance-manager' })
    } catch (err) {
      console.error('查询申请记录失败:', err)
      // 查询失败，仍允许进入申请页面
      wx.navigateTo({ url: '/pages/user/apply-alliance-manager/apply-alliance-manager' })
    }
  },

  // 申请区管
  applyZoneManager: async function () {
    if (!this.ensureLogin()) return
    if (!this.data.currentZone) {
      util.showInfo('请先选择您的分区后再申请')
      return
    }
    await this.checkAndShowApplyDialog('zoneManager')
  },

  // 检查用户是否是指定分区的区管（支持多区管）
  // 注意：adminIds/creatorId 存储的是 MongoDB _id，不是 openid
  checkIsZoneManagerInZone: async function (userId, zone) {
    if (!userId || !zone) return false
    try {
      const wxdb = wx.cloud.database()
      const _ = wxdb.command
      // 查询 adminIds 包含 userId 或 creatorId 等于 userId（向后兼容）
      const res = await wxdb.collection('zones').where({
        _id: zone._id,
        status: 'active'
      }).where(_.or([
        { adminIds: userId },
        { creatorId: userId }
      ])).count()
      return res.total > 0
    } catch (err) {
      return false
    }
  },

  // 检查用户是否是指定分区的盟管（任一联盟的 auditorIds 包含该用户）
  // 注意：auditorIds 存储的是 MongoDB _id，不是 openid
  checkIsAuditorInZone: async function (userId, zone) {
    if (!userId || !zone) return false
    try {
      const wxdb = wx.cloud.database()
      const res = await wxdb.collection('alliances').where({
        zoneId: zone._id,
        auditorIds: userId
      }).count()
      return res.total > 0
    } catch (err) {
      return false
    }
  },

  // 检查申请记录并显示弹窗
  checkAndShowApplyDialog: async function (applyType) {
    const typeText = applyType === 'zoneManager' ? '区管' : '盟管'
    const userId = app.globalData.openid

    if (!userId) {
      util.showInfo('请先登录')
      return
    }

    try {
      const applications = await db.getUserApplications(userId)
      const sameTypeApps = applications.filter(a => a.applyType === applyType)

      if (sameTypeApps.length > 0) {
        const latestApp = sameTypeApps[0]

        if (latestApp.status === 'pending') {
          wx.showModal({
            title: '申请' + typeText,
            content: '您已提交' + typeText + '申请，正在等待审核。',
            showCancel: false,
            confirmText: '我知道了'
          })
          return
        }

        if (latestApp.status === 'rejected') {
          wx.showModal({
            title: '申请' + typeText,
            content: '您之前的' + typeText + '申请已被拒绝。是否重新申请？',
            confirmText: '重新申请',
            success: (res) => {
              if (res.confirm) {
                if (applyType === 'allianceManager') {
                  wx.navigateTo({ url: '/pages/user/apply-alliance-manager/apply-alliance-manager' })
                } else {
                  this.showPhoneInputDialog(applyType === 'zoneManager' ? 'admin' : 'auditor')
                }
              }
            }
          })
          return
        }

        if (latestApp.status === 'approved') {
          // 按分区验证身份：区管身份仅在当前分区有效，跨区后为普通用户
          // 注意：creatorId 和 auditorIds 存储的是 MongoDB _id
          const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid
          const currentZone = this.data.currentZone || app.globalData.currentZone
          const isCurrentZoneAdmin = await this.checkIsZoneManagerInZone(userId, currentZone)
          const isCurrentZoneAuditor = await this.checkIsAuditorInZone(userId, currentZone)

          if (applyType === 'zoneManager' && isCurrentZoneAdmin) {
            wx.showModal({
              title: '申请' + typeText,
              content: '您已是该分区的区管。',
              showCancel: false,
              confirmText: '我知道了'
            })
            return
          }

          if (applyType === 'allianceManager' && isCurrentZoneAuditor) {
            wx.showModal({
              title: '申请' + typeText,
              content: '您已是该分区的盟管。',
              showCancel: false,
              confirmText: '我知道了'
            })
            return
          }

          // 当前分区无对应身份，允许重新申请
        }
      }

      // 没有任何记录，走正常申请流程
      if (applyType === 'allianceManager') {
        wx.navigateTo({ url: '/pages/user/apply-alliance-manager/apply-alliance-manager' })
      } else {
        wx.showModal({
          title: '申请' + typeText,
          content: '申请需要绑定手机号，是否立即申请？',
          confirmText: '立即申请',
          success: (res) => {
            if (res.confirm) {
              this.showPhoneInputDialog(applyType === 'zoneManager' ? 'admin' : 'auditor')
            }
          }
        })
      }
    } catch (err) {
      console.error('查询申请记录失败:', err)
      if (applyType === 'allianceManager') {
        wx.navigateTo({ url: '/pages/user/apply-alliance-manager/apply-alliance-manager' })
      } else {
        wx.showModal({
          title: '申请' + typeText,
          content: '申请需要绑定手机号，是否立即申请？',
          confirmText: '立即申请',
          success: (res) => {
            if (res.confirm) {
              this.showPhoneInputDialog(applyType === 'zoneManager' ? 'admin' : 'auditor')
            }
          }
        })
      }
    }
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
          if (!util.validatePhone(phone)) {
            util.showInfo('请输入正确的手机号')
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

      // 使用 openid 作为统一的用户标识（避免 userInfo._id 可能不存在的问题）
      const userId = app.globalData.openid

      if (!userId) {
        util.hideLoading()
        util.showInfo('请先登录')
        return
      }

      // 创建管理员申请（根据目标角色确定申请类型）
      const applyType = targetRole === 'admin' ? 'zoneManager' : 'allianceManager'

      // 检查手机号是否已被其他用户绑定
      const userByPhone = await db.getUserByPhone(phone)
      const currentOpenid = app.globalData.openid

      if (userByPhone && userByPhone.openid !== currentOpenid) {
        util.hideLoading()
        util.showError('该手机号已被其他用户绑定')
        return
      }

      // 检查是否已有相同类型的申请（不同类型可以同时申请）
      const existingApplication = await this.checkExistingApplication(userId, applyType)

      if (existingApplication) {
        util.hideLoading()
        const typeText = applyType === 'zoneManager' ? '区管' : '盟管'
        util.showInfo(`您已有待审核的${typeText}申请`)
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

      // 创建管理员申请（附带当前选择的分区信息）
      const currentZone = this.data.currentZone || app.globalData.currentZone
      const zoneData = currentZone ? { zoneId: currentZone._id, zoneName: currentZone.zoneName } : {}
      await db.createAdminApplication(userId, phone, applyType, zoneData)

      util.hideLoading()
      util.showSuccess('申请已提交，等待审核')

    } catch (err) {
      util.hideLoading()
      util.showError('申请失败：' + (err.message || '未知错误'))
    }
  },

  // 检查是否已有相同类型的申请（不同类型可以同时申请）
  checkExistingApplication: async function (userId, applyType) {
    const db = wx.cloud.database()
    const res = await db.collection('admins').where({
      userId: userId,
      applyType: applyType,
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
  },

  // 申请开通分区
  applyCreateZone: async function () {
    if (!this.ensureLogin()) return

    // 检查是否已有待审核的分区开通申请
    try {
      const userId = app.globalData.openid
      const wxdb = wx.cloud.database()
      const existingRes = await wxdb.collection('admins').where({
        userId: userId,
        applyType: 'zoneCreation',
        status: 'pending'
      }).count()

      if (existingRes.total > 0) {
        util.showInfo('您已有待审核的分区开通申请')
        return
      }
    } catch (err) {
      console.error('检查申请记录失败:', err)
    }

    // 先检查并绑定手机号
    const currentPhone = app.globalData.phone
    if (!currentPhone) {
      wx.showModal({
        title: '申请开通分区',
        content: '申请开通分区需要绑定手机号，申请通过后您将成为该分区的管理员（区管）。是否继续？',
        confirmText: '继续',
        success: (res) => {
          if (res.confirm) {
            this.showPhoneInputDialogForZoneCreation()
          }
        }
      })
      return
    }

    // 已有手机号，直接进入分区信息输入
    this.showZoneInfoDialog()
  },

  // 显示手机号输入弹窗（用于分区开通申请）
  showPhoneInputDialogForZoneCreation: function () {
    wx.showModal({
      title: '绑定手机号',
      editable: true,
      placeholderText: '请输入手机号',
      success: (res) => {
        if (res.confirm && res.content) {
          const phone = res.content.trim()
          if (!util.validatePhone(phone)) {
            util.showInfo('请输入正确的手机号')
            return
          }
          // 保存手机号到当前用户
          this.bindPhoneForZoneCreation(phone)
        }
      }
    })
  },

  // 绑定手机号并进入分区信息输入
  bindPhoneForZoneCreation: async function (phone) {
    try {
      util.showLoading('正在绑定...')

      const wxdb = wx.cloud.database()
      const userRecord = await db.getUserByOpenid(app.globalData.openid)

      if (userRecord) {
        await wxdb.collection('users').doc(userRecord._id).update({
          data: {
            phone: phone,
            updateTime: wxdb.serverDate()
          }
        })
      }

      app.globalData.phone = phone
      if (app.globalData.userInfo) {
        app.globalData.userInfo.phone = phone
      }

      util.hideLoading()
      this.showZoneInfoDialog()
    } catch (err) {
      util.hideLoading()
      util.showError('绑定手机号失败：' + (err.message || '未知错误'))
    }
  },

  // 显示分区信息输入弹窗
  showZoneInfoDialog: function () {
    wx.showModal({
      title: '申请开通分区\n请填写分区名称和期望的分区编号',
      content: '',
      editable: true,
      placeholderText: '如：第一区 3558',
      success: async (res) => {
        if (res.confirm && res.content) {
          const content = res.content.trim()
          if (!content) {
            util.showInfo('请输入分区信息')
            return
          }

          try {
            util.showLoading('正在申请...')
            const userId = app.globalData.openid
            const phone = app.globalData.phone || ''

            const wxdb = wx.cloud.database()
            await wxdb.collection('admins').add({
              data: {
                userId: userId,
                phone: phone,
                applyType: 'zoneCreation',
                zoneName: content,
                status: 'pending',
                createTime: wxdb.serverDate()
              }
            })

            util.hideLoading()
            util.showSuccess('申请已提交，审核通过后您将成为该分区的管理员（区管）')
          } catch (err) {
            util.hideLoading()
            util.showError('申请失败：' + (err.message || '未知错误'))
          }
        }
      }
    })
  },

  // 分享
  onShareAppMessage: function () {
    return {
      title: '无尽冬日堡垒分配管理系统',
      path: '/pages/index/index'
    }
  }
})