// pages/superAdmin/admin-review/admin-review.js
const app = getApp()
const util = require('../../utils/util')
const db = require('../../utils/db')

Page({
  data: {
    applications: [],
    reviewedApplications: []
  },

  onLoad: function () {
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

      // 获取待审核申请
      const pendingRes = await wxdb.collection('admins').where({
        status: 'pending'
      }).orderBy('createTime', 'desc').get()

      // 加载申请人信息
      const applications = []
      for (const application of pendingRes.data) {
        const userRes = await wxdb.collection('users').doc(application.userId).get()
        applications.push({
          ...application,
          nickName: userRes.data ? userRes.data.nickName : '未知用户',
          avatarUrl: userRes.data ? userRes.data.avatarUrl : null,
          formattedTime: util.formatDate(application.createTime, 'YYYY-MM-DD HH:mm')
        })
      }

      // 获取已审核申请
      const reviewedRes = await wxdb.collection('admins').where({
        status: wxdb.command.in(['approved', 'rejected'])
      }).orderBy('reviewTime', 'desc').limit(20).get()

      // 加载申请人信息
      const reviewedApplications = []
      for (const application of reviewedRes.data) {
        const userRes = await wxdb.collection('users').doc(application.userId).get()
        reviewedApplications.push({
          ...application,
          nickName: userRes.data ? userRes.data.nickName : '未知用户',
          formattedReviewTime: util.formatDate(application.reviewTime, 'YYYY-MM-DD HH:mm')
        })
      }

      this.setData({
        applications: applications,
        reviewedApplications: reviewedApplications
      })

      util.hideLoading()

    } catch (err) {
      util.hideLoading()
      util.showError('加载申请列表失败')
    }
  },

  // 批准申请
  approveApplication: async function (e) {
    const applicationId = e.currentTarget.dataset.id
    const userId = e.currentTarget.dataset.userid
    const index = e.currentTarget.dataset.index

    const confirm = await util.showConfirm('确认批准', '确定要批准该管理员申请吗？')

    if (!confirm) return

    try {
      util.showLoading('正在批准...')

      const reviewerId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

      // 更新申请状态
      await db.reviewAdminApplication(applicationId, 'approved', reviewerId)

      // 更新用户角色
      await db.updateUserRole(userId, 'admin')

      // 从待审核列表移除
      const applications = this.data.applications
      const approvedApp = applications.splice(index, 1)[0]

      // 添加到已审核列表
      const reviewedApplications = this.data.reviewedApplications
      reviewedApplications.unshift({
        ...approvedApp,
        status: 'approved',
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