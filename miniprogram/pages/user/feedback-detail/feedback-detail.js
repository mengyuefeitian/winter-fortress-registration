// pages/user/feedback-detail/feedback-detail.js
const util = require('../../../utils/util')

Page({
  data: {
    detail: null,
    loading: true
  },

  onLoad: function (options) {
    const feedbackId = options.feedbackId
    if (!feedbackId) {
      util.showError('参数错误')
      wx.navigateBack()
      return
    }
    this.loadDetail(feedbackId)
  },

  loadDetail: async function (feedbackId) {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageFeedback',
        data: { action: 'getFeedbackDetail', data: { feedbackId } }
      })
      if (!res.result.success) throw new Error(res.result.error)

      const item = res.result.data
      const replies = (item.replies || []).map(r => ({
        ...r,
        repliedAtStr: r.repliedAt ? util.formatDate(r.repliedAt, 'YYYY-MM-DD HH:mm') : ''
      }))
      this.setData({
        detail: {
          ...item,
          replies: replies,
          createTimeStr: util.formatDate(item.createTime, 'YYYY-MM-DD HH:mm')
        },
        loading: false
      })
    } catch (err) {
      console.error('加载反馈详情失败:', err)
      util.showError('加载失败')
      this.setData({ loading: false })
    }
  },

  previewImage: function (e) {
    const url = e.currentTarget.dataset.url
    wx.previewImage({
      current: url,
      urls: this.data.detail.imageUrls
    })
  }
})
