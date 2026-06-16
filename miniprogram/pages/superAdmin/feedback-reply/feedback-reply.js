// pages/superAdmin/feedback-reply/feedback-reply.js
const util = require('../../../utils/util')

Page({
  data: {
    detail: null,
    replyText: '',
    submitting: false,
    loading: true
  },

  onLoad: function (options) {
    const feedbackId = options.feedbackId
    if (!feedbackId) {
      util.showError('参数错误')
      wx.navigateBack()
      return
    }
    this.feedbackId = feedbackId
    this.loadDetail(feedbackId)
  },

  loadDetail: async function (feedbackId) {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageFeedback',
        data: { action: 'getFeedbackForAdmin', data: { feedbackId } }
      })
      if (!res.result.success) throw new Error(res.result.error)

      const item = res.result.data
      this.setData({
        detail: {
          ...item,
          createTimeStr: util.formatDate(item.createTime, 'YYYY-MM-DD HH:mm')
        },
        replyText: item.reply || '',
        loading: false
      })
    } catch (err) {
      console.error('加载反馈详情失败:', err)
      util.showError('加载失败')
      this.setData({ loading: false })
    }
  },

  onReplyInput: function (e) {
    this.setData({ replyText: e.detail.value })
  },

  previewImage: function (e) {
    const url = e.currentTarget.dataset.url
    wx.previewImage({
      current: url,
      urls: this.data.detail.imageUrls
    })
  },

  onSubmit: async function () {
    const reply = this.data.replyText.trim()
    if (!reply) {
      util.showError('请输入回复内容')
      return
    }

    this.setData({ submitting: true })
    util.showLoading('提交中...')

    try {
      const res = await wx.cloud.callFunction({
        name: 'manageFeedback',
        data: {
          action: 'replyFeedback',
          data: { feedbackId: this.feedbackId, reply }
        }
      })
      if (!res.result.success) throw new Error(res.result.error)

      util.hideLoading()
      util.showSuccess('回复成功')
      setTimeout(() => wx.navigateBack(), 1500)
    } catch (err) {
      util.hideLoading()
      console.error('回复失败:', err)
      util.showError('回复失败')
    } finally {
      this.setData({ submitting: false })
    }
  }
})
