// pages/user/battle-allocation/battle-allocation.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')
const weekPass = require('../../../utils/weekPass')

Page({
  data: {
    configId: '',
    date: '',
    rows: [],
    loading: false
  },

  onLoad: function (options) {
    // 预热激励视频（纯优化：点「看视频」时素材已就绪，失败不影响任何流程）
    weekPass.warmup(this)
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

  // 保存截图：属增值操作，需持有「本周通行证」
  // 广告拉不到时 requirePass 会自动放行，不会把用户卡在截图这一步
  onSaveScreenshot: async function () {
    if (this.data.rows.length === 0) {
      util.showInfo('暂无数据可截图')
      return
    }
    let ok = false
    try {
      ok = await weekPass.requirePass({ pageCtx: this, feature: '国战分配截图' })
    } catch (e) {
      console.warn('[battle-allocation] 通行证校验异常，按放行处理', e)
      ok = true
    }
    if (!ok) return
    await this.doSaveScreenshot()
  },

  doSaveScreenshot: async function () {
    try {
      util.showLoading('正在生成截图...')

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
      const headMaxWidth = colHeadWidth - 24
      const bodyMaxWidth = colBodyWidth - 16

      // 先量高度再建画布：行高会随真实换行结果撑开（车身名单长时一行变两三行），
      // 必须跟绘制用同一个 wrapText 量。见 measureScreenshot()。
      const screenshotData = this.measureScreenshot({
        canvasWidth: canvasWidth,
        rowHeight: rowHeight,
        headerHeight: headerHeight,
        headerY: headerY,
        headMaxWidth: headMaxWidth,
        bodyMaxWidth: bodyMaxWidth
      })

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
        const headLines = this.wrapText(ctx, r.headNickName || '-', headMaxWidth)
        for (let j = 0; j < headLines.length; j++) {
          ctx.fillText(headLines[j], margin + 12, rowStartY + j * 26)
        }

        // 车身文字 - 自动换行
        ctx.fillStyle = '#333333'
        ctx.font = '22px sans-serif'
        const bodyText = r.bodyList || '-'
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

  // 量出截图真实高度 —— 必须与 doSaveScreenshot 里的绘制步进**完全一致**。
  // ⚠️ 旧实现按「字符数 ÷ 每行能放几个字」估算行数，而绘制用的是 ctx.measureText 换行：
  //    中英混排 / 长车身名单时实际行数比估算多，画布就比内容矮，最后几行被裁掉。
  //    这里直接借一块临时画布跑同一个 wrapText，量出多少就是多少。
  measureScreenshot: function (opt) {
    const canvasWidth = opt.canvasWidth
    const rowHeight = opt.rowHeight
    const headerHeight = opt.headerHeight
    const headerY = opt.headerY
    const bottomMargin = 40

    const measure = wx.createOffscreenCanvas({ type: '2d', width: canvasWidth, height: 200 })
    const mctx = measure.getContext('2d')

    let dataHeight = 0
    for (const r of this.data.rows || []) {
      mctx.font = 'bold 22px sans-serif'
      const headLines = this.wrapText(mctx, r.headNickName || '-', opt.headMaxWidth).length || 1
      mctx.font = '22px sans-serif'
      const bodyLines = this.wrapText(mctx, r.bodyList || '-', opt.bodyMaxWidth).length || 1
      const lineCount = Math.max(headLines, bodyLines)
      dataHeight += Math.max(rowHeight, lineCount * 26 + 10)
    }

    const dataStartY = headerY + headerHeight
    return { height: Math.max(dataStartY + dataHeight + bottomMargin, 300) }
  }
})
