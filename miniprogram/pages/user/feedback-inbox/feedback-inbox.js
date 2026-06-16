// pages/user/feedback-inbox/feedback-inbox.js
const app = getApp()
const util = require('../../../utils/util')

Page({
  data: {
    feedbacks: [],
    loading: true
  },

  onLoad: function () {
    this.loadFeedbacks()
  },

  onShow: function () {
    this.loadFeedbacks()
  },

  loadFeedbacks: async function () {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageFeedback',
        data: { action: 'getMyFeedbacks' }
      })
      if (!res.result.success) throw new Error(res.result.error)

      const list = res.result.data.map(item => ({
        ...item,
        titleTruncated: item.title.length === 20,
        createTimeStr: util.formatDate(item.createTime, 'MM-DD HH:mm')
      }))

      this.setData({ feedbacks: list, loading: false })
    } catch (err) {
      console.error('加载反馈列表失败:', err)
      util.showError('加载失败')
      this.setData({ loading: false })
    }
  },

  goToDetail: function (e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/user/feedback-detail/feedback-detail?feedbackId=${id}`
    })
  }
})
