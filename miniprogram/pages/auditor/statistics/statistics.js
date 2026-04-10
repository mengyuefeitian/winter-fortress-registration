// pages/auditor/statistics/statistics.js
const app = getApp()
const util = require('../../utils/util')
const db = require('../../utils/db')

Page({
  data: {
    allianceId: null,
    allianceName: '',
    stats: [],
    totalRegistrations: 0,
    fullSlots: 0,
    remainingSlots: 0
  },

  onLoad: function (options) {
    if (options.allianceId) {
      this.setData({
        allianceId: options.allianceId
      })
      this.loadStatistics()
    } else {
      this.loadMyAlliance()
    }
  },

  onShow: function () {
    if (this.data.allianceId) {
      this.loadStatistics()
    }
  },

  // 加载绑定的联盟
  loadMyAlliance: async function () {
    try {
      util.showLoading('加载联盟信息...')

      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

      const wxdb = wx.cloud.database()
      const res = await wxdb.collection('alliances').where({
        auditorId: userId
      }).get()

      if (res.data.length > 0) {
        const alliance = res.data[0]
        this.setData({
          allianceId: alliance._id
        })
        this.loadStatistics()
      } else {
        util.hideLoading()
        this.setData({
          allianceName: '未绑定联盟'
        })
      }

    } catch (err) {
      util.hideLoading()
      util.showError('加载联盟信息失败')
    }
  },

  // 加载统计数据
  loadStatistics: async function () {
    try {
      util.showLoading('加载统计数据...')

      const wxdb = wx.cloud.database()
      const allianceRes = await wxdb.collection('alliances').doc(this.data.allianceId).get()

      this.setData({
        allianceName: allianceRes.data ? allianceRes.data.allianceName : '未知联盟'
      })

      const stats = await db.getAllianceStatistics(this.data.allianceId)

      let totalRegistrations = 0
      let fullSlots = 0
      let remainingSlots = 0

      for (const stat of stats) {
        totalRegistrations += stat.count
        if (stat.isFull) {
          fullSlots++
        }
        remainingSlots += stat.remaining
      }

      this.setData({
        stats: stats,
        totalRegistrations: totalRegistrations,
        fullSlots: fullSlots,
        remainingSlots: remainingSlots
      })

      util.hideLoading()

    } catch (err) {
      util.hideLoading()
      util.showError('加载统计数据失败')
    }
  },

  // 清空报名数据
  clearRegistrations: async function () {
    if (!this.data.allianceId) {
      util.showInfo('未绑定联盟')
      return
    }

    const confirm = await util.showConfirm(
      '确认清空',
      `确定要清空「${this.data.allianceName}」的所有报名数据吗？\n\n此操作不可恢复！`
    )

    if (!confirm) return

    const confirm2 = await util.showConfirm(
      '再次确认',
      '清空后数据将无法恢复，确定继续吗？'
    )

    if (!confirm2) return

    try {
      util.showLoading('正在清空...')

      const res = await wx.cloud.callFunction({
        name: 'clearRegistrations',
        data: {
          action: 'clearByAlliance',
          data: {
            allianceId: this.data.allianceId
          }
        }
      })

      if (res.result.err) {
        throw new Error(res.result.err)
      }

      util.hideLoading()
      util.showSuccess(res.result.message || '清空成功')

      this.loadStatistics()

    } catch (err) {
      util.hideLoading()
      util.showError('清空失败: ' + err.message)
    }
  },

  // 保存截图
  saveScreenshot: async function () {
    try {
      if (this.data.stats.length === 0) {
        util.showInfo('暂无数据可截图')
        return
      }

      util.showLoading('正在生成截图...')

      const screenshotData = this.buildScreenshotData()

      const canvas = wx.createOffscreenCanvas({
        type: '2d',
        width: 750,
        height: screenshotData.height
      })
      const ctx = canvas.getContext('2d')

      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, 750, screenshotData.height)

      ctx.fillStyle = '#4A90D9'
      ctx.font = 'bold 32px sans-serif'
      ctx.fillText(this.data.allianceName + ' 报名统计', 30, 50)

      ctx.fillStyle = '#999999'
      ctx.font = '24px sans-serif'
      ctx.fillText(util.formatDate(new Date(), 'YYYY-MM-DD HH:mm'), 30, 90)

      ctx.fillStyle = '#333333'
      ctx.font = '28px sans-serif'
      ctx.fillText(`总人数: ${this.data.totalRegistrations}  已满: ${this.data.fullSlots}  剩余: ${this.data.remainingSlots}`, 30, 140)

      ctx.strokeStyle = '#E8E8E8'
      ctx.beginPath()
      ctx.moveTo(30, 160)
      ctx.lineTo(720, 160)
      ctx.stroke()

      let y = 200
      for (const stat of this.data.stats) {
        ctx.fillStyle = stat.isFull ? '#FF6B6B' : '#333333'
        ctx.font = 'bold 28px sans-serif'
        ctx.fillText(`${stat.timeSlot.displayName} (${stat.count}/${stat.timeSlot.maxCount}人)`, 30, y)

        y += 40

        if (stat.timeSlot.remark) {
          ctx.fillStyle = '#999999'
          ctx.font = '24px sans-serif'
          ctx.fillText(`备注: ${stat.timeSlot.remark}`, 50, y)
          y += 35
        }

        if (stat.registrations.length > 0) {
          ctx.fillStyle = '#666666'
          ctx.font = '24px sans-serif'
          const names = stat.registrations.map((r, i) => `${i + 1}.${r.nickName}(${r.position === 'head' ? '车头' : '车身'})`).join(' ')
          ctx.fillText(names, 50, y)
          y += 35
        }

        y += 20
      }

      wx.canvasToTempFilePath({
        canvas: canvas,
        destWidth: 750,
        destHeight: screenshotData.height,
        success: (res) => {
          wx.saveImageToPhotosAlbum({
            filePath: res.tempFilePath,
            success: () => {
              util.hideLoading()
              util.showSuccess('截图已保存到相册')
            },
            fail: (err) => {
              util.hideLoading()
              if (err.errMsg.indexOf('auth deny') !== -1) {
                wx.showModal({
                  title: '提示',
                  content: '需要您授权保存图片权限',
                  confirmText: '去授权',
                  success: (modalRes) => {
                    if (modalRes.confirm) {
                      wx.openSetting()
                    }
                  }
                })
              } else {
                util.showError('保存失败')
              }
            }
          })
        },
        fail: (err) => {
          util.hideLoading()
          this.saveScreenshotFallback()
        }
      })

    } catch (err) {
      util.hideLoading()
      this.saveScreenshotFallback()
    }
  },

  buildScreenshotData: function () {
    let height = 200

    for (const stat of this.data.stats) {
      height += 60
      if (stat.timeSlot.remark) {
        height += 35
      }
      if (stat.registrations.length > 0) {
        height += 35
      }
      height += 20
    }

    return { height: height }
  },

  saveScreenshotFallback: function () {
    wx.showModal({
      title: '提示',
      content: '请使用手机截图功能保存当前页面',
      showCancel: false
    })
  }
})