// pages/user/battle-allocation/battle-allocation.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')

Page({
  data: {
    configId: '',
    date: '',
    rows: [],
    loading: false
  },

  onLoad: function (options) {
    this.setData({
      configId: options.configId,
      date: options.date
    })
    this.loadData()
  },

  loadData: async function () {
    try {
      this.setData({ loading: true })
      const registrations = await db.getBattleRegistrationsByConfig(this.data.configId)

      const heads = (registrations || []).filter(r => r.position === '车头')
      const bodies = (registrations || []).filter(r => r.position === '车身')

      // 找出所有重名的昵称
      const allNames = [...heads, ...bodies].map(r => r.nickName)
      const dupNames = {}
      for (const name of allNames) {
        dupNames[name] = (dupNames[name] || 0) + 1
      }

      // 格式化昵称：重名则加 (联盟) 后缀
      const formatName = (r) => {
        if (dupNames[r.nickName] > 1) {
          return `${r.nickName}(${r.allianceName})`
        }
        return r.nickName
      }

      // 构建分配表：每行一个车头，关联 assignment 匹配的车身
      // 未分配的车身放到"机动"行
      const rows = []
      const assignedBodyIds = new Set()

      for (const head of heads) {
        const headKey = head.assignment || head.nickName
        const matchedBodies = bodies.filter(b => {
          const bAssignment = (b.assignment || '').trim()
          if (bAssignment === headKey) return true
          if (bAssignment === head.nickName) return true
          return false
        })

        matchedBodies.forEach(b => assignedBodyIds.add(b._id))

        rows.push({
          type: 'head',
          headNickName: formatName(head),
          bodyList: matchedBodies.map(formatName).join('，'),
          bodyCount: matchedBodies.length
        })
      }

      // 未分配的车身归入"机动"行
      const unassignedBodies = bodies.filter(b => !assignedBodyIds.has(b._id))
      if (unassignedBodies.length > 0) {
        rows.push({
          type: 'mobile',
          headNickName: '机动',
          bodyList: unassignedBodies.map(formatName).join('，'),
          bodyCount: unassignedBodies.length
        })
      }

      this.setData({ rows, loading: false })
    } catch (err) {
      console.error('加载数据失败:', err)
      util.showError('加载失败')
      this.setData({ loading: false })
    }
  },

  onSaveScreenshot: async function () {
    if (this.data.rows.length === 0) {
      util.showInfo('暂无数据可截图')
      return
    }

    try {
      util.showLoading('正在生成截图...')

      const screenshotData = this.buildScreenshotData()

      // 页边距和间距配置
      const margin = 40
      const canvasWidth = 750
      const rowHeight = 45
      const headerHeight = 50
      const titleY = 70
      const dateY = 115
      const lineY = 135
      const headerY = 155
      const dataStartY = headerY + headerHeight

      const innerWidth = canvasWidth - margin * 2
      const colHeadWidth = Math.floor(innerWidth * 0.25)
      const colBodyWidth = innerWidth - colHeadWidth

      const canvas = wx.createOffscreenCanvas({
        type: '2d',
        width: canvasWidth,
        height: screenshotData.height
      })
      const ctx = canvas.getContext('2d')

      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, canvasWidth, screenshotData.height)

      // 标题
      ctx.fillStyle = '#4A90D9'
      ctx.font = 'bold 36px sans-serif'
      ctx.fillText('国战分配表', margin, titleY)

      // 日期
      ctx.fillStyle = '#999999'
      ctx.font = '26px sans-serif'
      ctx.fillText(this.data.date, margin, dateY)

      // 分隔线
      ctx.strokeStyle = '#E8E8E8'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(margin, lineY)
      ctx.lineTo(canvasWidth - margin, lineY)
      ctx.stroke()

      // 表头
      ctx.fillStyle = '#4A90D9'
      ctx.fillRect(margin, headerY, innerWidth, headerHeight)
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 24px sans-serif'
      ctx.fillText('车头', margin + 12, headerY + 32)
      ctx.fillText('车身', margin + colHeadWidth + 12, headerY + 32)

      ctx.textBaseline = 'top'

      // 数据行
      let y = dataStartY
      const headMaxWidth = colHeadWidth - 24
      for (let i = 0; i < this.data.rows.length; i++) {
        const r = this.data.rows[i]

        if (i % 2 === 1) {
          ctx.fillStyle = '#F5F5F5'
          ctx.fillRect(margin, y, innerWidth, rowHeight)
        }

        // 机动行高亮
        if (r.type === 'mobile') {
          ctx.fillStyle = '#FFF8E1'
          ctx.fillRect(margin, y, innerWidth, rowHeight)
        }

        const rowStartY = y + 5

        // 车头昵称 - 自动换行
        ctx.fillStyle = r.type === 'mobile' ? '#FF9800' : '#333333'
        ctx.font = `bold 22px sans-serif`
        const headLines = this.wrapText(ctx, r.headNickName, headMaxWidth)
        for (let j = 0; j < headLines.length; j++) {
          ctx.fillText(headLines[j], margin + 12, rowStartY + j * 26)
        }

        // 车身文字 - 自动换行
        ctx.fillStyle = '#333333'
        ctx.font = '22px sans-serif'
        const bodyText = r.bodyList || '-'
        const bodyMaxWidth = colBodyWidth - 16
        const bodyLines = this.wrapText(ctx, bodyText, bodyMaxWidth)
        for (let j = 0; j < bodyLines.length; j++) {
          ctx.fillText(bodyLines[j], margin + colHeadWidth + 12, rowStartY + j * 26)
        }

        // 行高取两者最大值
        const headCount = headLines.length || 1
        const bodyCount = bodyLines.length || 1
        const lineCount = Math.max(headCount, bodyCount)
        const neededHeight = Math.max(rowHeight, lineCount * 26 + 10)
        y += neededHeight
      }

      ctx.textBaseline = 'alphabetic'

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
                    if (modalRes.confirm) wx.openSetting()
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

    } catch (err) {
      util.hideLoading()
      console.error('截图失败:', err)
      util.showError('截图失败')
    }
  },

  wrapText: function (ctx, text, maxWidth) {
    const lines = []
    let currentLine = ''
    for (const char of text) {
      const testLine = currentLine + char
      const metrics = ctx.measureText(testLine)
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine)
        currentLine = char
      } else {
        currentLine = testLine
      }
    }
    if (currentLine) lines.push(currentLine)
    return lines
  },

  buildScreenshotData: function () {
    const topArea = 155 + 50
    const rowHeight = 45
    const bottomMargin = 40
    const margin = 40
    const canvasWidth = 750
    const innerWidth = canvasWidth - margin * 2
    const colHeadWidth = Math.floor(innerWidth * 0.25)
    const colBodyWidth = innerWidth - colHeadWidth
    const headMaxWidth = colHeadWidth - 24
    let dataHeight = 0
    for (const r of this.data.rows) {
      const headLines = Math.ceil(r.headNickName.length / Math.floor(headMaxWidth / 22)) || 1
      const bodyLines = Math.ceil(r.bodyList.length / Math.floor(colBodyWidth / 22)) || 1
      const lineCount = Math.max(headLines, bodyLines)
      const h = Math.max(rowHeight, lineCount * 26 + 10)
      dataHeight += h
    }
    return { height: topArea + dataHeight + bottomMargin }
  }
})
