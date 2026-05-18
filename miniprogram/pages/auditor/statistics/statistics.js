// pages/auditor/statistics/statistics.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')
const auth = require('../../../utils/auth')

Page({
  data: {
    allianceId: null,
    allianceName: '',
    stats: [],
    totalRegistrations: 0,
    fullSlots: 0,
    remainingSlots: 0,

    // 报名类型选择
    registrationTypes: ['堡垒报名', '兵工厂报名', '峡谷报名'],
    regTypeIndex: 0,
    selectedRegType: '堡垒报名',

    // 兵工厂报名数据
    arsenalConfigs: [],
    arsenalStats: [],
    arsenalTotal: 0,

    // 峡谷报名数据
    canyonConfigs: [],
    canyonStats: [],
    canyonTotal: 0,

    ACTIVITY_TYPE_LABELS: { 'arsenal': '兵工厂', 'canyon': '峡谷会战' }
  },

  onLoad: function (options) {
    this.waitForRoleReady(options)
  },

  onShow: function () {
    if (app.globalData.roleReady && this.data.allianceId) {
      this.loadStatistics()
    }
  },

  // 等待角色就绪
  waitForRoleReady: function (options) {
    if (app.globalData.roleReady) {
      this.checkPermission(options)
    } else {
      setTimeout(() => {
        this.waitForRoleReady(options)
      }, 100)
    }
  },

  // 检查权限
  checkPermission: function (options) {
    const role = app.globalData.role || 'user'
    if (!auth.isAdminOrAbove(role)) {
      util.showError('权限不足')
      wx.switchTab({
        url: '/pages/index/index'
      })
      return
    }
    if (options && options.allianceId) {
      this.setData({
        allianceId: options.allianceId
      })
      this.loadStatistics()
    } else {
      this.loadMyAlliance()
    }
  },

  // 加载绑定的联盟
  loadMyAlliance: async function () {
    try {
      util.showLoading('加载联盟信息...')

      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

      const wxdb = wx.cloud.database()
      const res = await wxdb.collection('alliances').where({
        auditorIds: userId
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

  // 报名类型切换
  onRegTypeChange: function (e) {
    const index = parseInt(e.detail.value)
    this.setData({
      regTypeIndex: index,
      selectedRegType: this.data.registrationTypes[index]
    })
    this.loadStatistics()
  },

  // 加载统计数据
  loadStatistics: async function () {
    try {
      util.showLoading('加载统计数据...')

      if (this.data.selectedRegType === '堡垒报名') {
        // Current behavior - fortress statistics
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
          remainingSlots: remainingSlots,
          arsenalStats: [],
          arsenalTotal: 0,
          canyonStats: [],
          canyonTotal: 0
        })

      } else if (this.data.selectedRegType === '兵工厂报名') {
        // 兵工厂报名统计
        const wxdb = wx.cloud.database()
        const allianceRes = await wxdb.collection('alliances').doc(this.data.allianceId).get()
        const alliance = allianceRes.data

        this.setData({
          allianceName: alliance ? alliance.allianceName : '未知联盟'
        })

        if (!alliance) {
          util.hideLoading()
          return
        }

        const configs = await db.getArsenalConfigs({ allianceId: this.data.allianceId })

        const arsenalStats = []
        let arsenalTotal = 0

        for (const config of configs) {
          const stats = await db.getArsenalStats(config._id, { includeRegistrations: true })
          const regs = (stats.registrations || []).sort((a, b) => (a.position === 'substitute' ? -1 : 1) - (b.position === 'substitute' ? -1 : 1))
          arsenalStats.push({
            config: config,
            activityTypeLabel: this.data.ACTIVITY_TYPE_LABELS[config.activityType] || config.activityType,
            registrations: regs,
            count: stats.count || 0
          })
          arsenalTotal += stats.count || 0
        }

        this.setData({
          arsenalConfigs: configs,
          arsenalStats: arsenalStats,
          arsenalTotal: arsenalTotal,
          stats: [],
          totalRegistrations: 0,
          fullSlots: 0,
          remainingSlots: 0,
          canyonStats: [],
          canyonTotal: 0
        })

      } else if (this.data.selectedRegType === '峡谷报名') {
        // 峡谷报名统计
        const wxdb = wx.cloud.database()
        const allianceRes = await wxdb.collection('alliances').doc(this.data.allianceId).get()
        const alliance = allianceRes.data

        this.setData({
          allianceName: alliance ? alliance.allianceName : '未知联盟'
        })

        if (!alliance) {
          util.hideLoading()
          return
        }

        const configs = await db.getCanyonConfigs({ allianceId: this.data.allianceId })

        const canyonStats = []
        let canyonTotal = 0

        for (const config of configs) {
          const stats = await db.getCanyonStats(config._id, { includeRegistrations: true })
          const regs = (stats.registrations || []).sort((a, b) => (a.position === 'substitute' ? -1 : 1) - (b.position === 'substitute' ? -1 : 1))
          canyonStats.push({
            config: config,
            activityTypeLabel: this.data.ACTIVITY_TYPE_LABELS[config.activityType] || config.activityType,
            registrations: regs,
            count: stats.count || 0
          })
          canyonTotal += stats.count || 0
        }

        this.setData({
          canyonConfigs: configs,
          canyonStats: canyonStats,
          canyonTotal: canyonTotal,
          stats: [],
          totalRegistrations: 0,
          fullSlots: 0,
          remainingSlots: 0,
          arsenalStats: [],
          arsenalTotal: 0
        })

      }

      util.hideLoading()

    } catch (err) {
      util.hideLoading()
      util.showError('加载统计数据失败')
    }
  },

  // 清空过期数据
  clearRegistrations: async function () {
    if (!this.data.allianceId) {
      util.showInfo('未绑定联盟')
      return
    }

    const confirm = await util.showConfirm(
      '确认清空',
      `确定要清空「${this.data.allianceName}」今日之前的所有报名数据和时间段配置吗？\n\n此操作不可恢复！`
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
          action: 'clearExpiredByAlliance',
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
      const regType = this.data.selectedRegType

      if (regType === '堡垒报名') {
        if (this.data.stats.length === 0) {
          util.showInfo('暂无数据可截图')
          return
        }
        await this.saveFortressScreenshot()
      } else if (regType === '兵工厂报名') {
        if (this.data.arsenalStats.length === 0) {
          util.showInfo('暂无数据可截图')
          return
        }
        await this.saveArsenalScreenshot()
      } else if (regType === '峡谷报名') {
        if (this.data.canyonStats.length === 0) {
          util.showInfo('暂无数据可截图')
          return
        }
        await this.saveCanyonScreenshot()
      }
    } catch (err) {
      util.hideLoading()
      this.saveScreenshotFallback()
    }
  },

  // 堡垒报名截图
  saveFortressScreenshot: async function () {
    util.showLoading('正在生成截图...')

    const screenshotData = this.buildScreenshotData()

    const margin = 40
    const canvasWidth = 750
    const titleY = 70
    const dateY = 115
    const summaryY = 165
    const lineY = 190
    const dataStartY = 230

    const canvas = wx.createOffscreenCanvas({
      type: '2d',
      width: canvasWidth,
      height: screenshotData.height
    })
    const ctx = canvas.getContext('2d')

    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvasWidth, screenshotData.height)

    ctx.fillStyle = '#07C160'
    ctx.font = 'bold 36px sans-serif'
    ctx.fillText(this.data.allianceName + ' 报名统计', margin, titleY)

    ctx.fillStyle = '#999999'
    ctx.font = '26px sans-serif'
    ctx.fillText(util.formatDate(new Date(), 'YY/MM/DD HH:mm'), margin, dateY)

    ctx.fillStyle = '#333333'
    ctx.font = 'bold 28px sans-serif'
    ctx.fillText(`总人数: ${this.data.totalRegistrations}  已满: ${this.data.fullSlots}  剩余: ${this.data.remainingSlots}`, margin, summaryY)

    ctx.strokeStyle = '#E8E8E8'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(margin, lineY)
    ctx.lineTo(canvasWidth - margin, lineY)
    ctx.stroke()

    let y = dataStartY
    for (const stat of this.data.stats) {
      ctx.fillStyle = stat.isFull ? '#FF6B6B' : '#333333'
      ctx.font = 'bold 28px sans-serif'
      ctx.fillText(`${stat.timeSlot.displayName} (${stat.count}/${stat.timeSlot.maxCount}人)`, margin, y)

      y += 45

      if (stat.timeSlot.tag) {
        ctx.fillStyle = '#07C160'
        ctx.font = '24px sans-serif'
        ctx.fillText(`标签: ${stat.timeSlot.tag}`, margin + 20, y)
        y += 40
      }

      if (stat.timeSlot.fortress) {
        ctx.fillStyle = '#4A90D9'
        ctx.font = '24px sans-serif'
        ctx.fillText(`堡垒: ${stat.timeSlot.fortress}`, margin + 20, y)
        y += 40
      }

      if (stat.timeSlot.date) {
        ctx.fillStyle = '#A6A6A6'
        ctx.font = '24px sans-serif'
        ctx.fillText(`日期: ${stat.timeSlot.date}`, margin + 20, y)
        y += 40
      }

      if (stat.registrations.length > 0) {
        ctx.fillStyle = '#666666'
        ctx.font = '24px sans-serif'
        const sorted = [...stat.registrations].sort((a, b) => (a.position === 'head' ? -1 : 1) - (b.position === 'head' ? -1 : 1))
        const nameStrs = sorted.map((r, i) => `${i + 1}.${r.nickName}(${r.position === 'head' ? '车头' : '车身'})`)
        for (let i = 0; i < nameStrs.length; i += 3) {
          ctx.fillText(nameStrs.slice(i, i + 3).join(' '), margin + 20, y)
          y += 40
        }
      }

      y += 25
    }

    await this.canvasToImage(canvas, screenshotData.height)
  },

  // 兵工厂/峡谷报名截图
  saveArsenalScreenshot: async function () {
    await this.saveActivityScreenshot(this.data.arsenalStats, this.data.arsenalTotal, '兵工厂')
  },

  saveCanyonScreenshot: async function () {
    await this.saveActivityScreenshot(this.data.canyonStats, this.data.canyonTotal, '峡谷')
  },

  saveActivityScreenshot: async function (stats, total, label) {
    const margin = 40
    const canvasWidth = 750
    const titleY = 70
    const dateY = 115
    const summaryY = 155
    const lineY = 180
    const dataStartY = 220

    let totalHeight = dataStartY + 20
    for (const stat of stats) {
      totalHeight += 50
      if (stat.registrations.length > 0) {
        totalHeight += 60 + Math.ceil(stat.registrations.length / 3) * 40
      }
      totalHeight += 25
    }

    const canvas = wx.createOffscreenCanvas({
      type: '2d',
      width: canvasWidth,
      height: totalHeight
    })
    const ctx = canvas.getContext('2d')

    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvasWidth, totalHeight)

    ctx.fillStyle = '#07C160'
    ctx.font = 'bold 36px sans-serif'
    ctx.fillText(this.data.allianceName + ' ' + label + '报名统计', margin, titleY)

    ctx.fillStyle = '#999999'
    ctx.font = '26px sans-serif'
    ctx.fillText(util.formatDate(new Date(), 'YY/MM/DD HH:mm'), margin, dateY)

    ctx.fillStyle = '#333333'
    ctx.font = 'bold 28px sans-serif'
    ctx.fillText(`总人数: ${total}`, margin, summaryY)

    ctx.strokeStyle = '#E8E8E8'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(margin, lineY)
    ctx.lineTo(canvasWidth - margin, lineY)
    ctx.stroke()

    let y = dataStartY
    for (const stat of stats) {
      ctx.fillStyle = '#333333'
      ctx.font = 'bold 28px sans-serif'
      ctx.fillText(`${stat.activityTypeLabel} ${stat.config.corps || ''} ${stat.config.date || ''} ${stat.config.timeValue || ''} (${stat.count}人)`, margin, y)
      y += 40

      if (stat.registrations.length > 0) {
        // 替补在前
        const substitutes = stat.registrations.filter(r => r.position === 'substitute')
        const combats = stat.registrations.filter(r => r.position === 'combat')

        if (substitutes.length > 0) {
          ctx.fillStyle = '#07C160'
          ctx.font = 'bold 24px sans-serif'
          ctx.fillText(`替补(${substitutes.length}):`, margin + 20, y)
          y += 30

          ctx.fillStyle = '#666666'
          ctx.font = '24px sans-serif'
          const subNames = substitutes.map((r, i) => `${i + 1}.${r.nickName}`)
          for (let i = 0; i < subNames.length; i += 3) {
            ctx.fillText(subNames.slice(i, i + 3).join('  '), margin + 20, y)
            y += 35
          }
        }

        if (combats.length > 0) {
          ctx.fillStyle = '#FA5151'
          ctx.font = 'bold 24px sans-serif'
          ctx.fillText(`参战(${combats.length}):`, margin + 20, y)
          y += 30

          ctx.fillStyle = '#666666'
          ctx.font = '24px sans-serif'
          const combatNames = combats.map((r, i) => `${i + 1}.${r.nickName}`)
          for (let i = 0; i < combatNames.length; i += 3) {
            ctx.fillText(combatNames.slice(i, i + 3).join('  '), margin + 20, y)
            y += 35
          }
        }
      }

      y += 25
    }

    await this.canvasToImage(canvas, totalHeight)
  },

  canvasToImage: function (canvas, height) {
    return new Promise((resolve, reject) => {
      wx.canvasToTempFilePath({
        canvas: canvas,
        destWidth: 750,
        destHeight: height,
        success: (res) => {
          wx.saveImageToPhotosAlbum({
            filePath: res.tempFilePath,
            success: () => {
              util.hideLoading()
              util.showSuccess('截图已保存到相册')
              resolve()
            },
            fail: (err) => {
              util.hideLoading()
              if (err.errMsg.indexOf('auth deny') !== -1) {
                wx.showModal({
                  title: '提示',
                  content: '需要您授权保存图片权限',
                  confirmText: '去授权',
                  success: (modalRes) => {
                    if (modalRes.confirm) wx.openSetting()
                  }
                })
              } else {
                util.showError('保存失败')
              }
              resolve()
            }
          })
        },
        fail: (err) => {
          util.hideLoading()
          reject(err)
        }
      })
    })
  },

  buildScreenshotData: function () {
    let height = 230
    const bottomMargin = 40

    for (const stat of this.data.stats) {
      height += 45
      if (stat.timeSlot.tag) {
        height += 40
      }
      if (stat.timeSlot.fortress) {
        height += 40
      }
      if (stat.timeSlot.date) {
        height += 40
      }
      if (stat.registrations.length > 0) {
        height += 40 * Math.ceil(stat.registrations.length / 3)
      }
      height += 25
    }

    return { height: height + bottomMargin }
  },

  saveScreenshotFallback: function () {
    wx.showModal({
      title: '提示',
      content: '请使用手机截图功能保存当前页面',
      showCancel: false
    })
  }
})