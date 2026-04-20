// pages/superAdmin/admin-review/admin-review.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')

Page({
  data: {
    applyType: null, // 筛选类型：zoneManager 或 allianceManager，null 表示全部
    pageTitle: '管理员审核',
    applications: [],
    reviewedApplications: []
  },

  onLoad: function (options) {
    // 从URL参数获取筛选类型
    if (options.applyType) {
      this.setData({
        applyType: options.applyType,
        pageTitle: options.applyType === 'zoneManager' ? '区管审核' : '盟管审核'
      })
      wx.setNavigationBarTitle({
        title: this.data.pageTitle
      })
    }
    this.loadApplications()
  },

  onShow: function () {
    this.loadApplications()
  },

  // 加载申请列表
  loadApplications: async function () {
    try {
      util.showLoading('加载申请列表...')

      const wxdb = wx.cloud.database()
      const _ = wxdb.command

      // 构建查询条件
      const whereCondition = { status: 'pending' }
      if (this.data.applyType) {
        whereCondition.applyType = this.data.applyType
      }

      // 获取待审核申请
      let pendingRes
      try {
        pendingRes = await wxdb.collection('admins').where(whereCondition).orderBy('createTime', 'desc').get()
      } catch (err) {
        console.error('查询待审核申请失败:', err)
        pendingRes = { data: [] }
      }

      // 加载申请人信息
      const applications = []
      for (const application of pendingRes.data) {
        try {
          let nickName = '未知用户'
          let avatarUrl = null

          if (application.userId) {
            const userRes = await wxdb.collection('users').doc(application.userId).get()
            if (userRes.data) {
              nickName = userRes.data.nickName || '未知用户'
              avatarUrl = userRes.data.avatarUrl
            }
          }

          applications.push({
            ...application,
            nickName: nickName,
            avatarUrl: avatarUrl,
            formattedTime: application.createTime ? util.formatDate(application.createTime, 'YYYY-MM-DD HH:mm') : ''
          })
        } catch (err) {
          console.error('获取用户信息失败:', err)
          applications.push({
            ...application,
            nickName: '未知用户',
            avatarUrl: null,
            formattedTime: application.createTime ? util.formatDate(application.createTime, 'YYYY-MM-DD HH:mm') : ''
          })
        }
      }

      // 获取已审核申请
      let reviewedRes
      try {
        reviewedRes = await wxdb.collection('admins').where({
          status: _.in(['approved', 'rejected'])
        }).orderBy('reviewTime', 'desc').limit(20).get()
      } catch (err) {
        console.error('查询已审核申请失败:', err)
        reviewedRes = { data: [] }
      }

      // 加载申请人信息
      const reviewedApplications = []
      for (const application of reviewedRes.data) {
        try {
          let nickName = '未知用户'

          if (application.userId) {
            const userRes = await wxdb.collection('users').doc(application.userId).get()
            if (userRes.data) {
              nickName = userRes.data.nickName || '未知用户'
            }
          }

          reviewedApplications.push({
            ...application,
            nickName: nickName,
            formattedReviewTime: application.reviewTime ? util.formatDate(application.reviewTime, 'YYYY-MM-DD HH:mm') : ''
          })
        } catch (err) {
          console.error('获取用户信息失败:', err)
          reviewedApplications.push({
            ...application,
            nickName: '未知用户',
            formattedReviewTime: application.reviewTime ? util.formatDate(application.reviewTime, 'YYYY-MM-DD HH:mm') : ''
          })
        }
      }

      this.setData({
        applications: applications,
        reviewedApplications: reviewedApplications
      })

      util.hideLoading()

    } catch (err) {
      console.error('加载申请列表失败:', err)
      util.hideLoading()
      util.showError('加载申请列表失败: ' + (err.message || '未知错误'))
    }
  },

  // 批准申请
  approveApplication: async function (e) {
    const applicationId = e.currentTarget.dataset.id
    const userId = e.currentTarget.dataset.userid
    const applyType = e.currentTarget.dataset.applytype
    const index = e.currentTarget.dataset.index

    const roleText = applyType === 'zoneManager' ? '区管' : '盟管'
    const confirm = await util.showConfirm('确认批准', `确定要批准该${roleText}申请吗？`)

    if (!confirm) return

    try {
      util.showLoading('正在批准...')

      const reviewerId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

      // 根据申请类型确定批准的角色
      const approvedRole = applyType === 'zoneManager' ? 'admin' : 'auditor'

      // 更新申请状态（记录批准的角色）
      await db.reviewAdminApplication(applicationId, 'approved', reviewerId, approvedRole)

      // 更新用户角色
      await db.updateUserRole(userId, approvedRole)

      // 从待审核列表移除
      const applications = this.data.applications
      const approvedApp = applications.splice(index, 1)[0]

      // 添加到已审核列表
      const reviewedApplications = this.data.reviewedApplications
      reviewedApplications.unshift({
        ...approvedApp,
        status: 'approved',
        approvedRole: approvedRole,
        formattedReviewTime: util.formatDate(new Date(), 'YYYY-MM-DD HH:mm')
      })

      this.setData({
        applications: applications,
        reviewedApplications: reviewedApplications
      })

      util.hideLoading()
      util.showSuccess('已批准')

    } catch (err) {
      util.hideLoading()
      util.showError('批准失败')
    }
  },

  // 拒绝申请
  rejectApplication: async function (e) {
    const applicationId = e.currentTarget.dataset.id
    const index = e.currentTarget.dataset.index

    const confirm = await util.showConfirm('确认拒绝', '确定要拒绝该管理员申请吗？')

    if (!confirm) return

    try {
      util.showLoading('正在拒绝...')

      const reviewerId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

      // 更新申请状态
      await db.reviewAdminApplication(applicationId, 'rejected', reviewerId)

      // 从待审核列表移除
      const applications = this.data.applications
      const rejectedApp = applications.splice(index, 1)[0]

      // 添加到已审核列表
      const reviewedApplications = this.data.reviewedApplications
      reviewedApplications.unshift({
        ...rejectedApp,
        status: 'rejected',
        formattedReviewTime: util.formatDate(new Date(), 'YYYY-MM-DD HH:mm')
      })

      this.setData({
        applications: applications,
        reviewedApplications: reviewedApplications
      })

      util.hideLoading()
      util.showSuccess('已拒绝')

    } catch (err) {
      util.hideLoading()
      util.showError('拒绝失败')
    }
  }
})