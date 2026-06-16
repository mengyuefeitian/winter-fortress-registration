// pages/superAdmin/feedback-manage/feedback-manage.js
const app = getApp()
const util = require('../../../utils/util')
const auth = require('../../../utils/auth')

const PAGE_SIZE = 20

Page({
  data: {
    feedbacks: [],
    loading: true,
    hasMore: false,
    skip: 0
  },

  onLoad: function () {
    this.waitForRoleReady()
  },

  onShow: function () {
    if (app.globalData.roleReady) {
      this.resetAndLoad()
    }
  },

  waitForRoleReady: function () {
    if (app.globalData.roleReady) {
      this.checkPermission()
    } else {
      setTimeout(() => this.waitForRoleReady(), 100)
    }
  },

  checkPermission: function () {
    const role = app.globalData.role || 'user'
    if (!auth.isSuperAdmin(role)) {
      util.showError('权限不足')
      wx.switchTab({ url: '/pages/index/index' })
      return
    }
    this.loadFeedbacks(0)
  },

  resetAndLoad: function () {
    this.setData({ feedbacks: [], skip: 0 })
    this.loadFeedbacks(0)
  },

  loadFeedbacks: async function (skip) {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageFeedback',
        data: { action: 'getAllFeedbacks', data: { skip, limit: PAGE_SIZE } }
      })
      if (!res.result.success) throw new Error(res.result.error)

      const newItems = res.result.data.map(item => ({
        ...item,
        titleTruncated: item.title.length === 20,
        createTimeStr: util.formatDate(item.createTime, 'MM-DD HH:mm')
      }))

      const feedbacks = skip === 0 ? newItems : [...this.data.feedbacks, ...newItems]
      const nextSkip = skip + newItems.length

      this.setData({
        feedbacks,
        skip: nextSkip,
        hasMore: nextSkip < res.result.total,
        loading: false
      })
    } catch (err) {
      console.error('加载反馈列表失败:', err)
      util.showError('加载失败')
      this.setData({ loading: false })
    }
  },

  loadMore: function () {
    this.loadFeedbacks(this.data.skip)
  },

  goToReply: function (e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/superAdmin/feedback-reply/feedback-reply?feedbackId=${id}`
    })
  }
})
