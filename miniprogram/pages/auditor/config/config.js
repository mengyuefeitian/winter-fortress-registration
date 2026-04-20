// pages/auditor/config/config.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')

Page({
  data: {
    allianceId: null,
    timeSlots: []
  },

  onLoad: function (options) {
    if (options.allianceId) {
      this.setData({
        allianceId: options.allianceId
      })
      this.loadTimeSlots()
    }
  },

  // 加载时间段列表
  loadTimeSlots: async function () {
    try {
      util.showLoading('加载时间段...')

      const timeSlots = await db.getTimeSlotsByAlliance(this.data.allianceId)

      // 添加当前报名人数
      const processedSlots = []
      for (const slot of timeSlots) {
        const count = await db.getRegistrationCount(slot._id)
        processedSlots.push({
          ...slot,
          currentCount: count,
          editRemark: slot.remark
        })
      }

      this.setData({
        timeSlots: processedSlots
      })

      util.hideLoading()

    } catch (err) {
      util.hideLoading()
      util.showError('加载时间段失败')
    }
  },

  // 输入备注
  onRemarkInput: function (e) {
    const index = e.currentTarget.dataset.index
    const timeSlots = this.data.timeSlots
    timeSlots[index].editRemark = e.detail.value

    this.setData({
      timeSlots: timeSlots
    })
  },

  // 保存备注
  saveRemark: async function (e) {
    const timeSlotId = e.currentTarget.dataset.id
    const index = e.currentTarget.dataset.index
    const remark = this.data.timeSlots[index].editRemark

    try {
      util.showLoading('正在保存...')

      await db.updateTimeSlotRemark(timeSlotId, remark)

      // 更新显示
      const timeSlots = this.data.timeSlots
      timeSlots[index].remark = remark

      this.setData({
        timeSlots: timeSlots
      })

      util.hideLoading()
      util.showSuccess('保存成功')

    } catch (err) {
      util.hideLoading()
      util.showError('保存失败')
    }
  }
})