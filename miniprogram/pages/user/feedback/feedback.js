// pages/user/feedback/feedback.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')

const FEEDBACK_TYPES = [
  { label: '需求', value: '需求', desc: '新功能或改进建议' },
  { label: 'Bug', value: 'bug', desc: '使用中遇到的问题' }
]

Page({
  data: {
    feedbackTypes: FEEDBACK_TYPES,
    selectedType: '',
    content: '',
    contactInfo: '',
    imagePaths: [],
    maxImages: 3,
    submitting: false,
    charCount: 0
  },

  onTypeSelect: function (e) {
    const type = e.currentTarget.dataset.type
    this.setData({ selectedType: type })
  },

  onContentInput: function (e) {
    const content = e.detail.value
    this.setData({
      content: content,
      charCount: content.length
    })
  },

  onContactInput: function (e) {
    this.setData({ contactInfo: e.detail.value })
  },

  // 选择图片
  onChooseImage: function () {
    const remaining = this.data.maxImages - this.data.imagePaths.length
    if (remaining <= 0) {
      util.showInfo(`最多上传${this.data.maxImages}张图片`)
      return
    }

    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newPaths = res.tempFiles.map(f => f.tempFilePath)
        this.setData({
          imagePaths: [...this.data.imagePaths, ...newPaths]
        })
      }
    })
  },

  // 删除图片
  onRemoveImage: function (e) {
    const index = e.currentTarget.dataset.index
    const imagePaths = this.data.imagePaths.filter((_, i) => i !== index)
    this.setData({ imagePaths })
  },

  // 预览图片
  onPreviewImage: function (e) {
    const url = e.currentTarget.dataset.url
    wx.previewImage({
      current: url,
      urls: this.data.imagePaths
    })
  },

  validate: function () {
    if (!this.data.selectedType) {
      util.showError('请选择反馈类型')
      return false
    }
    if (!this.data.content || this.data.content.length < 10) {
      util.showError('内容至少10个字')
      return false
    }
    return true
  },

  onSubmit: async function () {
    if (!this.validate()) return

    this.setData({ submitting: true })
    util.showLoading('提交中...')

    try {
      // 上传图片到云存储
      const imageUrls = []
      let uploadFailed = 0
      for (const path of this.data.imagePaths) {
        try {
          const cloudPath = `feedback/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
          const uploadRes = await wx.cloud.uploadFile({
            cloudPath,
            filePath: path
          })
          imageUrls.push(uploadRes.fileID)
        } catch (err) {
          uploadFailed++
          console.error('上传图片失败:', err)
        }
      }
      if (uploadFailed > 0) {
        util.showInfo(`${uploadFailed} 张图片上传失败`)
        if (imageUrls.length === 0) {
          util.hideLoading()
          return
        }
      }

      // 保存反馈到数据库
      const result = await db.createFeedback(
        app.globalData.openid,
        app.globalData.userInfo?.nickName || '',
        this.data.selectedType,
        this.data.content,
        this.data.contactInfo,
        imageUrls
      )

      // 发送邮件通知
      try {
        const emailRes = await wx.cloud.callFunction({
          name: 'sendFeedbackEmail',
          data: {
            feedbackId: result._id,
            type: this.data.selectedType,
            content: this.data.content,
            contactInfo: this.data.contactInfo,
            nickName: app.globalData.userInfo?.nickName || '',
            imageUrls: imageUrls
          },
          config: {
            timeout: 30000
          }
        })
        console.log('邮件发送结果:', emailRes)
        if (emailRes.result && !emailRes.result.success) {
          console.error('邮件发送失败:', emailRes.result.error)
        }
      } catch (emailErr) {
        // 邮件发送失败不影响反馈提交
        console.error('邮件发送失败:', emailErr)
        util.showInfo('反馈已提交，但邮件通知发送失败')
      }

      util.hideLoading()
      util.showSuccess('提交成功')
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    } catch (err) {
      util.hideLoading()
      console.error('提交反馈失败:', err)
      util.showError('提交失败')
    } finally {
      this.setData({ submitting: false })
    }
  }
})
