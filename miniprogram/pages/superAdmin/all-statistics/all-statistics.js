// pages/superAdmin/all-statistics/all-statistics.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')
const auth = require('../../../utils/auth')

Page({
  data: {
    // 报名类型选择
    registrationTypes: ['堡垒报名', '兵工厂报名', '峡谷报名', '官职报名'],
    regTypeIndex: 0,
    selectedRegType: '堡垒报名',

    zones: [],
    selectedZone: null,

    alliances: [],
    allianceIndex: 0,
    selectedAlliance: null,

    timeSlotStats: [],
    totalRegistrations: 0,
    fullSlots: 0,
    remainingSlots: 0,

    // 官职报名数据
    positionConfigs: [],
    positionStats: [],
    positionTotal: 0,

    // 兵工厂报名数据
    arsenalConfigs: [],
    arsenalStats: [],
    arsenalTotal: 0,

    // 峡谷报名数据
    canyonConfigs: [],
    canyonStats: [],
    canyonTotal: 0
  },

  onLoad: function () {
    this.waitForRoleReady()
  },

  onShow: function () {
    if (app.globalData.roleReady && this.data.selectedZone) {
      this.loadStatistics()
    }
  },

  // 等待角色就绪
  waitForRoleReady: function () {
    if (app.globalData.roleReady) {
      this.checkPermission()
    } else {
      setTimeout(() => {
        this.waitForRoleReady()
      }, 100)
    }
  },

  // 检查权限
  checkPermission: function () {
    const role = app.globalData.role || 'user'
    if (!auth.isSuperAdmin(role)) {
      util.showError('权限不足')
      wx.switchTab({
        url: '/pages/index/index'
      })
      return
    }
    this.loadZones()
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

  // 加载分区列表
  loadZones: async function () {
    try {
      util.showLoading('加载分区...')

      const zones = await db.getAllZones()

      this.setData({
        zones: zones
      })

      if (zones.length > 0) {
        // 优先读取全局分区
        let selectedZone = zones[0]

        if (app.globalData.currentZone) {
          const foundIndex = zones.findIndex(z => z._id === app.globalData.currentZone._id)
          if (foundIndex >= 0) {
            selectedZone = zones[foundIndex]
          }
        } else {
          // 尝试本地存储
          const lastZoneId = wx.getStorageSync('lastZoneId')
          if (lastZoneId) {
            const foundIndex = zones.findIndex(z => z._id === lastZoneId)
            if (foundIndex >= 0) {
              selectedZone = zones[foundIndex]
            }
          }
        }

        this.setData({
          selectedZone: selectedZone
        })
        this.loadAlliances(selectedZone._id)
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
      util.showLoading('加载统计数据...')

      if (this.data.selectedRegType === '堡垒报名') {
        // 堡垒报名统计
        if (!this.data.selectedAlliance) {
          util.hideLoading()
          return
        }

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
          remainingSlots: remainingSlots,
          positionStats: [],
          positionTotal: 0,
          arsenalStats: [],
          arsenalTotal: 0,
          canyonStats: [],
          canyonTotal: 0
        })

      } else if (this.data.selectedRegType === '兵工厂报名') {
        // 兵工厂报名统计
        if (!this.data.selectedZone) {
          util.hideLoading()
          return
        }

        const configs = await db.getArsenalConfigs({ zoneId: this.data.selectedZone._id })

        const arsenalStats = []
        let arsenalTotal = 0

        const ACTIVITY_TYPE_LABELS = { 'arsenal': '兵工厂', 'canyon': '峡谷会战' }

        for (const config of configs) {
          const stats = await db.getArsenalStats(config._id, { includeRegistrations: true })
          const regs = (stats.registrations || []).sort((a, b) => (a.position === 'substitute' ? -1 : 1) - (b.position === 'substitute' ? -1 : 1))
          arsenalStats.push({
            config: config,
            activityTypeLabel: ACTIVITY_TYPE_LABELS[config.activityType] || config.activityType,
            registrations: regs,
            count: stats.count || 0
          })
          arsenalTotal += stats.count || 0
        }

        this.setData({
          arsenalConfigs: configs,
          arsenalStats: arsenalStats,
          arsenalTotal: arsenalTotal,
          timeSlotStats: [],
          totalRegistrations: 0,
          fullSlots: 0,
          remainingSlots: 0,
          positionStats: [],
          positionTotal: 0,
          canyonStats: [],
          canyonTotal: 0
        })

      } else if (this.data.selectedRegType === '峡谷报名') {
        // 峡谷报名统计
        if (!this.data.selectedZone) {
          util.hideLoading()
          return
        }

        const configs = await db.getCanyonConfigs({ zoneId: this.data.selectedZone._id })

        const canyonStats = []
        let canyonTotal = 0

        const ACTIVITY_TYPE_LABELS = { 'arsenal': '兵工厂', 'canyon': '峡谷会战' }

        for (const config of configs) {
          const stats = await db.getCanyonStats(config._id, { includeRegistrations: true })
          const regs = (stats.registrations || []).sort((a, b) => (a.position === 'substitute' ? -1 : 1) - (b.position === 'substitute' ? -1 : 1))
          canyonStats.push({
            config: config,
            activityTypeLabel: ACTIVITY_TYPE_LABELS[config.activityType] || config.activityType,
            registrations: regs,
            count: stats.count || 0
          })
          canyonTotal += stats.count || 0
        }

        this.setData({
          canyonConfigs: configs,
          canyonStats: canyonStats,
          canyonTotal: canyonTotal,
          timeSlotStats: [],
          totalRegistrations: 0,
          fullSlots: 0,
          remainingSlots: 0,
          positionStats: [],
          positionTotal: 0,
          arsenalStats: [],
          arsenalTotal: 0
        })

      } else {
        // 官职报名统计
        if (!this.data.selectedZone) {
          util.hideLoading()
          return
        }

        // 加载该分区下的官职配置
        const res = await wx.cloud.callFunction({
          name: 'managePosition',
          data: {
            action: 'getConfigs',
            data: {
              zoneId: this.data.selectedZone._id
            }
          }
        })

        if (!res.result.success) {
          throw new Error('获取官职配置失败')
        }

        const configs = res.result.data

        // 加载每个配置的报名统计
        const positionStats = []
        let positionTotal = 0

        for (const config of configs) {
          const regRes = await wx.cloud.callFunction({
            name: 'managePosition',
            data: {
              action: 'getRegistrations',
              data: {
                configId: config._id
              }
            }
          })

          if (regRes.result.success) {
            const registrations = (regRes.result.data || []).sort((a, b) => {
              const aTime = a.timeSlot || ''
              const bTime = b.timeSlot || ''
              const parseTime = (t) => {
                const parts = t.split(':')
                if (parts.length === 2) return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10)
                return 0
              }
              return parseTime(aTime) - parseTime(bTime)
            })
            positionStats.push({
              config: config,
              registrations: registrations,
              count: registrations.length
            })
            positionTotal += registrations.length
          }
        }

        this.setData({
          positionConfigs: configs,
          positionStats: positionStats,
          positionTotal: positionTotal,
          timeSlotStats: [],
          totalRegistrations: 0,
          fullSlots: 0,
          remainingSlots: 0,
          arsenalStats: [],
          arsenalTotal: 0,
          canyonStats: [],
          canyonTotal: 0
        })
      }

      util.hideLoading()

    } catch (err) {
      util.hideLoading()
      console.error('加载统计数据失败:', err)
      util.showError('加载统计数据失败: ' + (err.message || '未知错误'))
    }
  },

  // 分区选择变化（由组件内部处理全局状态同步）
  onZoneChange: function (e) {
    const zone = e.detail.zone
    if (!zone) return

    this.setData({
      selectedZone: zone,
      selectedAlliance: null,
      timeSlotStats: [],
      positionStats: []
    })

    if (this.data.selectedRegType === '堡垒报名') {
      this.loadAlliances(zone._id)
    } else {
      this.loadStatistics()
    }
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

  // 清空过期数据
  clearRegistrations: async function () {
    if (this.data.selectedRegType === '堡垒报名' && !this.data.selectedAlliance) {
      util.showInfo('请先选择联盟')
      return
    }
    if (this.data.selectedRegType === '官职报名' && !this.data.selectedZone) {
      util.showInfo('请先选择分区')
      return
    }

    // 超管清空所有过期数据
    const confirm = await util.showConfirm(
      '确认清空',
      `确定要清空今日之前的所有报名数据、时间段配置和官职报名配置吗？\n\n此操作将影响所有分区，不可恢复！`
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
          action: 'clearExpiredAll',
          data: {}
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

      // 根据报名类型生成不同的截图
      if (this.data.selectedRegType === '堡垒报名') {
        // 堡垒报名截图
        if (!this.data.selectedAlliance) {
          util.hideLoading()
          util.showInfo('请先选择联盟')
          return
        }

        ctx.fillStyle = '#07C160'
        ctx.font = 'bold 32px sans-serif'
        ctx.fillText(this.data.selectedAlliance.allianceName + ' 堡垒报名统计', 30, 50)

        ctx.fillStyle = '#999999'
        ctx.font = '24px sans-serif'
        ctx.fillText(util.formatDate(new Date(), 'YY/MM/DD HH:mm'), 30, 90)

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

          if (stat.timeSlot.tag) {
            ctx.fillStyle = '#07C160'
            ctx.font = '24px sans-serif'
            ctx.fillText(`标签: ${stat.timeSlot.tag}`, 50, y)
            y += 35
          }

          if (stat.timeSlot.fortress) {
            ctx.fillStyle = '#4A90D9'
            ctx.font = '24px sans-serif'
            ctx.fillText(`堡垒: ${stat.timeSlot.fortress}`, 50, y)
            y += 35
          }

          if (stat.timeSlot.date) {
            ctx.fillStyle = '#A6A6A6'
            ctx.font = '24px sans-serif'
            ctx.fillText(`日期: ${stat.timeSlot.date}`, 50, y)
            y += 35
          }

          if (stat.registrations.length > 0) {
            ctx.fillStyle = '#666666'
            ctx.font = '24px sans-serif'
            const sorted = [...stat.registrations].sort((a, b) => (a.position === 'head' ? -1 : 1) - (b.position === 'head' ? -1 : 1))
            const nameStrs = sorted.map((r, i) => `${i + 1}.${r.nickName}(${r.position === 'head' ? '车头' : '车身'})`)
            for (let i = 0; i < nameStrs.length; i += 3) {
              ctx.fillText(nameStrs.slice(i, i + 3).join(' '), 50, y)
              y += 35
            }
          }

          y += 20
        }

      } else if (this.data.selectedRegType === '兵工厂报名') {
        if (!this.data.selectedZone || this.data.arsenalStats.length === 0) {
          util.hideLoading()
          util.showInfo('暂无数据可截图')
          return
        }

        const margin = 40
        const canvasWidth = 750
        let totalHeight = 220
        for (const stat of this.data.arsenalStats) {
          totalHeight += 50
          if (stat.registrations.length > 0) {
            totalHeight += Math.ceil(stat.registrations.length / 3) * 40 + 20
          }
          totalHeight += 25
        }

        canvas.width = canvasWidth
        canvas.height = totalHeight

        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, canvasWidth, totalHeight)

        ctx.fillStyle = '#07C160'
        ctx.font = 'bold 32px sans-serif'
        ctx.fillText(this.data.selectedZone.zoneName + ' 兵工厂报名统计', margin, 50)

        ctx.fillStyle = '#999999'
        ctx.font = '24px sans-serif'
        ctx.fillText(util.formatDate(new Date(), 'YY/MM/DD HH:mm'), margin, 90)

        ctx.fillStyle = '#333333'
        ctx.font = 'bold 28px sans-serif'
        ctx.fillText(`总人数: ${this.data.arsenalTotal}`, margin, 130)

        ctx.strokeStyle = '#E8E8E8'
        ctx.beginPath()
        ctx.moveTo(margin, 155)
        ctx.lineTo(canvasWidth - margin, 155)
        ctx.stroke()

        let y = 195
        for (const stat of this.data.arsenalStats) {
          ctx.fillStyle = '#333333'
          ctx.font = 'bold 28px sans-serif'
          ctx.fillText(`${stat.activityTypeLabel} - ${stat.config.corps} (${stat.count}人)`, margin, y)
          y += 40

          ctx.fillStyle = '#A6A6A6'
          ctx.font = '24px sans-serif'
          ctx.fillText(`日期: ${stat.config.date}  时间: ${stat.config.timeValue}`, margin + 20, y)
          y += 40

          if (stat.registrations.length > 0) {
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

        wx.canvasToTempFilePath({
          canvas: canvas,
          destWidth: canvasWidth,
          destHeight: totalHeight,
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
                  wx.showModal({ title: '提示', content: '需要您授权保存图片权限', confirmText: '去授权', success: (modalRes) => { if (modalRes.confirm) { wx.openSetting() } } })
                } else {
                  util.showError('保存失败')
                }
              }
            })
          },
          fail: () => {
            util.hideLoading()
            util.showError('生成图片失败')
          }
        })

      } else if (this.data.selectedRegType === '峡谷报名') {
        if (!this.data.selectedZone || this.data.canyonStats.length === 0) {
          util.hideLoading()
          util.showInfo('暂无数据可截图')
          return
        }

        const margin = 40
        const canvasWidth = 750
        let totalHeight = 220
        for (const stat of this.data.canyonStats) {
          totalHeight += 50
          if (stat.registrations.length > 0) {
            totalHeight += 60 + Math.ceil(stat.registrations.length / 3) * 40
          }
          totalHeight += 25
        }

        canvas.width = canvasWidth
        canvas.height = totalHeight

        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, canvasWidth, totalHeight)

        ctx.fillStyle = '#07C160'
        ctx.font = 'bold 32px sans-serif'
        ctx.fillText(this.data.selectedZone.zoneName + ' 峡谷报名统计', margin, 50)

        ctx.fillStyle = '#999999'
        ctx.font = '24px sans-serif'
        ctx.fillText(util.formatDate(new Date(), 'YY/MM/DD HH:mm'), margin, 90)

        ctx.fillStyle = '#333333'
        ctx.font = 'bold 28px sans-serif'
        ctx.fillText(`总人数: ${this.data.canyonTotal}`, margin, 130)

        ctx.strokeStyle = '#E8E8E8'
        ctx.beginPath()
        ctx.moveTo(margin, 155)
        ctx.lineTo(canvasWidth - margin, 155)
        ctx.stroke()

        let y = 195
        for (const stat of this.data.canyonStats) {
          ctx.fillStyle = '#333333'
          ctx.font = 'bold 28px sans-serif'
          ctx.fillText(`${stat.activityTypeLabel} - ${stat.config.corps} (${stat.count}人)`, margin, y)
          y += 40

          ctx.fillStyle = '#A6A6A6'
          ctx.font = '24px sans-serif'
          ctx.fillText(`日期: ${stat.config.date}  时间: ${stat.config.timeValue}`, margin + 20, y)
          y += 40

          if (stat.registrations.length > 0) {
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

        wx.canvasToTempFilePath({
          canvas: canvas,
          destWidth: canvasWidth,
          destHeight: totalHeight,
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
                  wx.showModal({ title: '提示', content: '需要您授权保存图片权限', confirmText: '去授权', success: (modalRes) => { if (modalRes.confirm) { wx.openSetting() } } })
                } else {
                  util.showError('保存失败')
                }
              }
            })
          },
          fail: () => {
            util.hideLoading()
            util.showError('生成图片失败')
          }
        })

      } else {
        // 官职报名截图
        if (!this.data.selectedZone) {
          util.hideLoading()
          util.showInfo('请先选择分区')
          return
        }

        ctx.fillStyle = '#07C160'
        ctx.font = 'bold 32px sans-serif'
        ctx.fillText(this.data.selectedZone.zoneName + ' 官职报名统计', 30, 50)

        ctx.fillStyle = '#999999'
        ctx.font = '24px sans-serif'
        ctx.fillText(util.formatDate(new Date(), 'YY/MM/DD HH:mm'), 30, 90)

        ctx.fillStyle = '#333333'
        ctx.font = '28px sans-serif'
        ctx.fillText(`总人数: ${this.data.positionTotal}  配置数: ${this.data.positionStats.length}`, 30, 130)

        ctx.strokeStyle = '#E8E8E8'
        ctx.beginPath()
        ctx.moveTo(30, 150)
        ctx.lineTo(720, 150)
        ctx.stroke()

        let y = 190
        for (const stat of this.data.positionStats) {
          ctx.fillStyle = '#333333'
          ctx.font = 'bold 28px sans-serif'
          ctx.fillText(`${stat.config.positionType} (${stat.count}人)`, 30, y)

          y += 45

          ctx.fillStyle = '#07C160'
          ctx.font = '24px sans-serif'
          ctx.fillText(`日期: ${stat.config.date}  起始: ${stat.config.startTime}`, 50, y)
          y += 40

          if (stat.registrations.length > 0) {
            ctx.fillStyle = '#666666'
            ctx.font = '24px sans-serif'
            const items = stat.registrations.map(r => `${r.timeSlot} ${r.nickName}`)
            const colX = [50, 375]
            for (let i = 0; i < items.length; i += 2) {
              ctx.fillText(`${i + 1}. ${items[i]}`, colX[0], y)
              if (items[i + 1]) {
                ctx.fillText(`${i + 2}. ${items[i + 1]}`, colX[1], y)
              }
              y += 40
            }
          }

          y += 25
        }
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
    let height = 0

    if (this.data.selectedRegType === '堡垒报名') {
      height = 225

      for (const stat of this.data.timeSlotStats) {
        height += 60
        if (stat.timeSlot.tag) {
          height += 35
        }
        if (stat.timeSlot.fortress) {
          height += 35
        }
        if (stat.timeSlot.date) {
          height += 35
        }
        if (stat.registrations.length > 0) {
          height += 35 * Math.ceil(stat.registrations.length / 3)
        }
        height += 20
      }
    } else {
      // 官职报名截图高度
      height = 190

      for (const stat of this.data.positionStats) {
        height += 45 // 标题
        height += 40 // 日期起始时间
        if (stat.registrations.length > 0) {
          height += 40 * Math.ceil(stat.registrations.length / 2) // 报名人员（每2人换行）
        }
        height += 25 // 间隔
      }
    }

    return { height: Math.max(height, 300) }
  },

  saveScreenshotFallback: function () {
    wx.showModal({
      title: '提示',
      content: '请使用手机截图功能保存当前页面',
      showCancel: false
    })
  }
})