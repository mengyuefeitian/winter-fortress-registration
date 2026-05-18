// pages/admin/statistics/statistics.js
const app = getApp()
const util = require('../../../utils/util')
const auth = require('../../../utils/auth')
const db = require('../../../utils/db')

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
    // 每次显示时重新加载分区（角色已就绪）
    if (app.globalData.roleReady) {
      this.loadZones()
    }
  },

  // 等待角色就绪
  waitForRoleReady: function () {
    if (app.globalData.roleReady) {
      this.loadZones()
    } else {
      setTimeout(() => {
        this.waitForRoleReady()
      }, 100)
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

  // 加载分区列表
  loadZones: async function () {
    try {
      util.showLoading('加载分区...')

      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid
      const role = app.globalData.role || 'admin'

      // 超级管理员可以看到所有分区，管理员只能看到自己创建的
      let zones
      if (role === 'superAdmin') {
        zones = await db.getAllZones()
      } else {
        zones = await db.getZonesByCreator(userId)
      }

      if (zones && zones.length > 0) {
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
          zones: zones,
          selectedZone: selectedZone
        })
        this.loadAlliances(selectedZone._id)
      } else {
        util.hideLoading()
        this.setData({
          zones: [],
          zoneIndex: 0,
          selectedZone: null,
          alliances: [],
          selectedAlliance: null
        })
      }

    } catch (err) {
      util.hideLoading()
      console.error('加载分区失败:', err)
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

        // 计算汇总数据
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
          const stats = await db.getArsenalStats(config._id)
          const regs = (stats.registrations || []).sort((a, b) => (a.position === 'substitute' ? -1 : 1) - (b.position === 'substitute' ? -1 : 1))
          arsenalStats.push({
            config: config,
            activityTypeLabel: ACTIVITY_TYPE_LABELS[config.activityType] || config.activityType,
            registrations: regs,
            count: stats.totalRegistered || stats.count || 0
          })
          arsenalTotal += stats.totalRegistered || stats.count || 0
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
          const stats = await db.getCanyonStats(config._id)
          const regs = (stats.registrations || []).sort((a, b) => (a.position === 'substitute' ? -1 : 1) - (b.position === 'substitute' ? -1 : 1))
          canyonStats.push({
            config: config,
            activityTypeLabel: ACTIVITY_TYPE_LABELS[config.activityType] || config.activityType,
            registrations: regs,
            count: stats.totalRegistered || stats.count || 0
          })
          canyonTotal += stats.totalRegistered || stats.count || 0
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

        // 加载官职配置（通过 db.js），按分区过滤
        const configs = await db.getPositionConfigs({ zoneId: this.data.selectedZone._id })

        // 批量查询所有配置的报名记录（一次查询，替代 N+1 循环）
        const configIds = configs.map(c => c._id)
        const wxdb = wx.cloud.database()
        let regsByConfig = {}

        if (configIds.length > 0) {
          // 分页获取所有报名记录（一次查询，替代 N+1 循环）
          let allRegs = []
          let offset = 0
          const batchSize = 20
          while (true) {
            const res = await wxdb.collection('positionRegistrations').where({
              configId: wxdb.command.in(configIds),
              status: 'active'
            }).skip(offset).limit(batchSize).get()
            allRegs = allRegs.concat(res.data)
            if (res.data.length < batchSize) break
            offset += batchSize
            if (offset > 500) break
          }

          for (const reg of allRegs) {
            if (!regsByConfig[reg.configId]) {
              regsByConfig[reg.configId] = []
            }
            regsByConfig[reg.configId].push(reg)
          }
        }

        // 组装统计数据
        const positionStats = configs.map(config => {
          const regs = (regsByConfig[config._id] || []).sort((a, b) => {
            const aTime = a.timeSlot || ''
            const bTime = b.timeSlot || ''
            return aTime < bTime ? -1 : aTime > bTime ? 1 : 0
          })
          return {
            config: config,
            registrations: regs,
            count: regs.length
          }
        })

        let positionTotal = positionStats.reduce((sum, s) => sum + s.count, 0)

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
      util.showError('加载统计数据失败')
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

    // 堡垒报名需要加载联盟，其他类型直接加载统计
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
    // 堡垒报名模式需要选择联盟（但实际清空整个分区）
    if (this.data.selectedRegType === '堡垒报名' && !this.data.selectedAlliance) {
      util.showInfo('请先选择联盟')
      return
    }
    // 官职/兵工厂/峡谷报名模式需要选择分区
    if ((this.data.selectedRegType === '官职报名' || this.data.selectedRegType === '兵工厂报名' || this.data.selectedRegType === '峡谷报名') && !this.data.selectedZone) {
      util.showInfo('请先选择分区')
      return
    }
    // 任何模式都需要选择分区
    if (!this.data.selectedZone) {
      util.showInfo('请先选择分区')
      return
    }

    // 区管需要清空整个分区的数据
    const confirm = await util.showConfirm(
      '确认清空',
      `确定要清空「${this.data.selectedZone.zoneName}」分区下今日之前的所有报名数据、时间段配置和官职报名数据吗？\n\n此操作不可恢复！`
    )

    if (!confirm) return

    // 二次确认
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
          action: 'clearExpiredByZone',
          data: {
            zoneId: this.data.selectedZone._id
          }
        }
      })

      if (res.result.err) {
        throw new Error(res.result.err)
      }

      util.hideLoading()
      util.showSuccess(res.result.message || '清空成功')

      // 重新加载统计数据
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

      // 根据报名类型生成不同的截图
      if (this.data.selectedRegType === '堡垒报名') {
        // 堡垒报名截图
        if (!this.data.selectedAlliance) {
          util.hideLoading()
          util.showInfo('请先选择联盟')
          return
        }

        const screenshotData = this.buildScreenshotData()

        // 页边距和间距配置
        const margin = 40
        const canvasWidth = 750
        const innerWidth = canvasWidth - margin * 2
        const titleY = 70
        const dateY = 115
        const zoneY = 155
        const summaryY = 195
        const lineY = 220
        const dataStartY = 260

        // 创建离屏canvas
        const canvas = wx.createOffscreenCanvas({
          type: '2d',
          width: canvasWidth,
          height: screenshotData.height
        })
        const ctx = canvas.getContext('2d')

        // 绘制背景
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, canvasWidth, screenshotData.height)

        // 绘制标题
        ctx.fillStyle = '#07C160'
        ctx.font = 'bold 36px sans-serif'
        ctx.fillText(this.data.selectedAlliance.allianceName + ' 堡垒报名统计', margin, titleY)

        // 绘制日期
        ctx.fillStyle = '#999999'
        ctx.font = '26px sans-serif'
        ctx.fillText(util.formatDate(new Date(), 'YY/MM/DD HH:mm'), margin, dateY)

        // 绘制分区信息
        if (this.data.selectedZone) {
          ctx.fillStyle = '#666666'
          ctx.font = '26px sans-serif'
          ctx.fillText(`分区: ${this.data.selectedZone.zoneName} (${this.data.selectedZone.zoneCode})`, margin, zoneY)
        }

        // 绘制汇总
        ctx.fillStyle = '#333333'
        ctx.font = 'bold 28px sans-serif'
        ctx.fillText(`总人数: ${this.data.totalRegistrations}  已满: ${this.data.fullSlots}  剩余: ${this.data.remainingSlots}`, margin, summaryY)

        // 绘制分隔线
        ctx.strokeStyle = '#E8E8E8'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(margin, lineY)
        ctx.lineTo(canvasWidth - margin, lineY)
        ctx.stroke()

        // 绘制时间段数据
        let y = dataStartY
        for (const stat of this.data.timeSlotStats) {
          // 时间段标题
          ctx.fillStyle = stat.isFull ? '#FF6B6B' : '#333333'
          ctx.font = 'bold 28px sans-serif'
          ctx.fillText(`${stat.timeSlot.displayName} (${stat.count}/${stat.timeSlot.maxCount}人)`, margin, y)

          y += 45

          // 标签
          if (stat.timeSlot.tag) {
            ctx.fillStyle = '#07C160'
            ctx.font = '24px sans-serif'
            ctx.fillText(`标签: ${stat.timeSlot.tag}`, margin + 20, y)
            y += 40
          }

          // 堡垒名称
          if (stat.timeSlot.fortress) {
            ctx.fillStyle = '#4A90D9'
            ctx.font = '24px sans-serif'
            ctx.fillText(`堡垒: ${stat.timeSlot.fortress}`, margin + 20, y)
            y += 40
          }

          // 日期
          if (stat.timeSlot.date) {
            ctx.fillStyle = '#A6A6A6'
            ctx.font = '24px sans-serif'
            ctx.fillText(`日期: ${stat.timeSlot.date}`, margin + 20, y)
            y += 40
          }

          // 报名人员
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

        // 生成图片
        wx.canvasToTempFilePath({
          canvas: canvas,
          destWidth: 750,
          destHeight: screenshotData.height,
          success: (res) => {
            // 保存到相册
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
            console.error('生成图片失败:', err)
            this.saveScreenshotFallback()
          }
        })

      } else if (this.data.selectedRegType === '兵工厂报名') {
        // 兵工厂报名截图
        if (!this.data.selectedZone) {
          util.hideLoading()
          util.showInfo('请先选择分区')
          return
        }

        if (this.data.arsenalStats.length === 0) {
          util.hideLoading()
          util.showInfo('暂无数据可截图')
          return
        }

        const margin = 40
        const canvasWidth = 750
        const titleY = 70
        const dateY = 115
        const summaryY = 155
        const lineY = 180
        const dataStartY = 220

        let totalHeight = dataStartY + 20
        for (const stat of this.data.arsenalStats) {
          totalHeight += 50
          if (stat.registrations.length > 0) {
            totalHeight += Math.ceil(stat.registrations.length / 3) * 40 + 20
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
        ctx.fillText(this.data.selectedZone.zoneName + ' 兵工厂报名统计', margin, titleY)

        ctx.fillStyle = '#999999'
        ctx.font = '26px sans-serif'
        ctx.fillText(util.formatDate(new Date(), 'YY/MM/DD HH:mm'), margin, dateY)

        ctx.fillStyle = '#333333'
        ctx.font = 'bold 28px sans-serif'
        ctx.fillText(`总人数: ${this.data.arsenalTotal}`, margin, summaryY)

        ctx.strokeStyle = '#E8E8E8'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(margin, lineY)
        ctx.lineTo(canvasWidth - margin, lineY)
        ctx.stroke()

        let y = dataStartY
        for (const stat of this.data.arsenalStats) {
          ctx.fillStyle = '#333333'
          ctx.font = 'bold 28px sans-serif'
          ctx.fillText(`${stat.config.corps} (${stat.count}人)`, margin, y)
          y += 40

          ctx.fillStyle = '#A6A6A6'
          ctx.font = '24px sans-serif'
          ctx.fillText(`日期: ${stat.config.date}  时间: ${stat.config.timeValue}`, margin + 20, y)
          y += 40

          if (stat.registrations.length > 0) {
            ctx.fillStyle = '#666666'
            ctx.font = '24px sans-serif'
            const sorted = [...stat.registrations].sort((a, b) => (a.position === 'substitute' ? -1 : 1) - (b.position === 'substitute' ? -1 : 1))
            const nameStrs = sorted.map((r, i) => `${i + 1}.${r.nickName}(${r.position === 'combat' ? '参战' : '替补'})`)
            for (let i = 0; i < nameStrs.length; i += 3) {
              ctx.fillText(nameStrs.slice(i, i + 3).join(' '), margin + 20, y)
              y += 40
            }
          }

          y += 25
        }

        wx.canvasToTempFilePath({
          canvas: canvas,
          destWidth: 750,
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
          fail: () => {
            util.hideLoading()
            util.showError('生成图片失败')
          }
        })

      } else if (this.data.selectedRegType === '峡谷报名') {
        // 峡谷报名截图
        if (!this.data.selectedZone) {
          util.hideLoading()
          util.showInfo('请先选择分区')
          return
        }

        if (this.data.canyonStats.length === 0) {
          util.hideLoading()
          util.showInfo('暂无数据可截图')
          return
        }

        const margin = 40
        const canvasWidth = 750
        const titleY = 70
        const dateY = 115
        const summaryY = 155
        const lineY = 180
        const dataStartY = 220

        let totalHeight = dataStartY + 20
        for (const stat of this.data.canyonStats) {
          totalHeight += 50
          if (stat.registrations.length > 0) {
            totalHeight += Math.ceil(stat.registrations.length / 3) * 40 + 20
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
        ctx.fillText(this.data.selectedZone.zoneName + ' 峡谷报名统计', margin, titleY)

        ctx.fillStyle = '#999999'
        ctx.font = '26px sans-serif'
        ctx.fillText(util.formatDate(new Date(), 'YY/MM/DD HH:mm'), margin, dateY)

        ctx.fillStyle = '#333333'
        ctx.font = 'bold 28px sans-serif'
        ctx.fillText(`总人数: ${this.data.canyonTotal}`, margin, summaryY)

        ctx.strokeStyle = '#E8E8E8'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(margin, lineY)
        ctx.lineTo(canvasWidth - margin, lineY)
        ctx.stroke()

        let y = dataStartY
        for (const stat of this.data.canyonStats) {
          ctx.fillStyle = '#333333'
          ctx.font = 'bold 28px sans-serif'
          ctx.fillText(`${stat.config.corps} (${stat.count}人)`, margin, y)
          y += 40

          ctx.fillStyle = '#A6A6A6'
          ctx.font = '24px sans-serif'
          ctx.fillText(`日期: ${stat.config.date}  时间: ${stat.config.timeValue}`, margin + 20, y)
          y += 40

          if (stat.registrations.length > 0) {
            ctx.fillStyle = '#666666'
            ctx.font = '24px sans-serif'
            const sorted = [...stat.registrations].sort((a, b) => (a.position === 'substitute' ? -1 : 1) - (b.position === 'substitute' ? -1 : 1))
            const nameStrs = sorted.map((r, i) => `${i + 1}.${r.nickName}(${r.position === 'combat' ? '参战' : '替补'})`)
            for (let i = 0; i < nameStrs.length; i += 3) {
              ctx.fillText(nameStrs.slice(i, i + 3).join(' '), margin + 20, y)
              y += 40
            }
          }

          y += 25
        }

        wx.canvasToTempFilePath({
          canvas: canvas,
          destWidth: 750,
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

        const screenshotData = this.buildScreenshotData()

        const margin = 40
        const canvasWidth = 750
        const innerWidth = canvasWidth - margin * 2
        const titleY = 70
        const dateY = 115
        const summaryY = 160
        const lineY = 185
        const dataStartY = 225

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
        ctx.fillText(this.data.selectedZone.zoneName + ' 官职报名统计', margin, titleY)

        ctx.fillStyle = '#999999'
        ctx.font = '26px sans-serif'
        ctx.fillText(util.formatDate(new Date(), 'YY/MM/DD HH:mm'), margin, dateY)

        ctx.fillStyle = '#333333'
        ctx.font = 'bold 28px sans-serif'
        ctx.fillText(`总人数: ${this.data.positionTotal}  配置数: ${this.data.positionStats.length}`, margin, summaryY)

        ctx.strokeStyle = '#E8E8E8'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(margin, lineY)
        ctx.lineTo(canvasWidth - margin, lineY)
        ctx.stroke()

        let y = dataStartY
        for (const stat of this.data.positionStats) {
          ctx.fillStyle = '#333333'
          ctx.font = 'bold 28px sans-serif'
          ctx.fillText(`${stat.config.positionType} (${stat.count}人)`, margin, y)

          y += 45

          ctx.fillStyle = '#07C160'
          ctx.font = '24px sans-serif'
          ctx.fillText(`日期: ${stat.config.date}  起始: ${stat.config.startTime}`, margin + 20, y)
          y += 40

          if (stat.registrations.length > 0) {
            ctx.fillStyle = '#666666'
            ctx.font = '24px sans-serif'
            const nameStrs = stat.registrations.map((r, i) => `${i + 1}.${r.nickName}(${r.timeSlot})`)
            for (let i = 0; i < nameStrs.length; i += 5) {
              ctx.fillText(nameStrs.slice(i, i + 5).join(' '), margin + 20, y)
              y += 40
            }
          }

          y += 25
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
      }

    } catch (err) {
      util.hideLoading()
      console.error('截图失败:', err)
      this.saveScreenshotFallback()
    }
  },

  // 构建截图数据，计算高度
  buildScreenshotData: function () {
    let height = 0
    const bottomMargin = 40

    if (this.data.selectedRegType === '堡垒报名') {
      height = 260

      for (const stat of this.data.timeSlotStats) {
        height += 45 // 标题行高
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
    } else {
      // 官职报名截图高度
      height = 225

      for (const stat of this.data.positionStats) {
        height += 45 // 标题
        height += 40 // 日期起始时间
        if (stat.registrations.length > 0) {
          height += 40 * Math.ceil(stat.registrations.length / 3) // 报名人员（每3人换行）
        }
        height += 25 // 间隔
      }
    }

    return { height: Math.max(height + bottomMargin, 300) }
  },

  // 备选截图方案
  saveScreenshotFallback: function () {
    wx.showModal({
      title: '提示',
      content: '请使用手机截图功能保存当前页面',
      showCancel: false
    })
  }
})