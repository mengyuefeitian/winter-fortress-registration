// pages/superAdmin/all-statistics/all-statistics.js
const app = getApp()
const util = require('../../utils/util')
const db = require('../../utils/db')

Page({
  data: {
    zones: [],
    zoneIndex: 0,
    selectedZone: null,

    alliances: [],
    allianceIndex: 0,
    selectedAlliance: null,

    timeSlotStats: [],
    totalRegistrations: 0,
    fullSlots: 0,
    remainingSlots: 0
  },

  onLoad: function () {
    this.loadZones()
  },

  onShow: function () {
    if (this.data.selectedAlliance) {
      this.loadStatistics()
    }
  },

  // 加载分区列表
  loadZones: async function () {
    try {
      util.showLoading('加载分区...')

      const zones = await db.getAllZones()

      this.setData({
        zones: zones
      })

      if (zones.length > 0) {
        this.setData({
          selectedZone: zones[0]
        })
        this.loadAlliances(zones[0]._id)
      } else {
        util.hideLoading()
      }

    } catch (err) {
      util.hideLoading()
      util.showError('加载分区失败')
    }
  },

  // 加载联盟列表
  loadAlliances: async function (zoneId) {
    try {
      util.showLoading('加载联盟...')

      const alliances = await db.getAlliancesByZone(zoneId)

      this.setData({
        alliances: alliances
      })

      if (alliances.length > 0) {
        this.setData({
          selectedAlliance: alliances[0]
        })
        this.loadStatistics()
      } else {
        util.hideLoading()
      }

    } catch (err) {
      util.hideLoading()
      util.showError('加载联盟失败')
    }
  },

  // 加载统计数据
  loadStatistics: async function () {
    try {
      if (!this.data.selectedAlliance) return

      util.showLoading('加载统计数据...')

      const allianceId = this.data.selectedAlliance._id
      const stats = await db.getAllianceStatistics(allianceId)

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
        timeSlotStats: stats,
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

  // 分区选择变化
  onZoneChange: function (e) {
    const index = e.detail.value
    const zone = this.data.zones[index]

    this.setData({
      zoneIndex: index,
      selectedZone: zone,
      selectedAlliance: null,
      timeSlotStats: []
    })

    this.loadAlliances(zone._id)
  },

  // 联盟选择变化
  onAllianceChange: function (e) {
    const index = e.detail.value
    const alliance = this.data.alliances[index]

    this.setData({
      allianceIndex: index,
      selectedAlliance: alliance
    })

    this.loadStatistics()
  },

  // 清空报名数据
  clearRegistrations: async function () {
    if (!this.data.selectedAlliance) {
      util.showInfo('请先选择联盟')
      return
    }

    const confirm = await util.showConfirm(
      '确认清空',
      `确定要清空「${this.data.selectedAlliance.allianceName}」的所有报名数据吗？\n\n此操作不可恢复！`
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
            allianceId: this.data.selectedAlliance._id
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
      if (!this.data.selectedAlliance) {
        util.showInfo('请先选择联盟')
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
      ctx.fillText(this.data.selectedAlliance.allianceName + ' 报名统计', 30, 50)

      ctx.fillStyle = '#999999'
      ctx.font = '24px sans-serif'
      ctx.fillText(util.formatDate(new Date(), 'YYYY-MM-DD HH:mm'), 30, 90)

      if (this.data.selectedZone) {
        ctx.fillStyle = '#666666'
        ctx.font = '24px sans-serif'
        ctx.fillText(`分区: ${this.data.selectedZone.zoneName} (${this.data.selectedZone.zoneCode})`, 30, 125)
      }

      ctx.fillStyle = '#333333'
      ctx.font = '28px sans-serif'
      ctx.fillText(`总人数: ${this.data.totalRegistrations}  已满: ${this.data.fullSlots}  剩余: ${this.data.remainingSlots}`, 30, 165)

      ctx.strokeStyle = '#E8E8E8'
      ctx.beginPath()
      ctx.moveTo(30, 185)
      ctx.lineTo(720, 185)
      ctx.stroke()

      let y = 225
      for (const stat of this.data.timeSlotStats) {
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
    let height = 225

    for (const stat of this.data.timeSlotStats) {
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