// pages/user/battle-statistics/battle-statistics.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')
Page({
  data: {
    configId: '',
    date: '',
    registrations: [],
    displayNames: [],
    headNickNames: [],
    loading: false,
    canDeleteRegistration: false,
    selectAllChecked: false,
    selectedIds: []
  },

  onLoad: function (options) {
    this.setData({
      configId: options.configId,
      date: options.date,
      canDeleteRegistration: app.globalData.role === 'superAdmin' || app.globalData.role === 'admin'
    })
    this.loadRegistrations()
  },

  loadRegistrations: async function () {
    try {
      this.setData({ loading: true })
      const registrations = await db.getBattleRegistrationsByConfig(this.data.configId)

      const processed = (registrations || []).map(r => ({
        ...r,
        selected: false,
        editAssignment: r.assignment || '',
        allianceShortName: (r.allianceName || '').substring(0, 3)
      }))

      // 找出重名昵称
      const allNames = processed.map(r => r.nickName)
      const nameCount = {}
      for (const name of allNames) {
        nameCount[name] = (nameCount[name] || 0) + 1
      }

      const displayNames = processed.map(r => {
        if (nameCount[r.nickName] > 1) {
          return `${r.nickName}(${r.allianceName})`
        }
        return r.nickName
      })

      // 提取车头昵称列表供分配选择
      const headNickNames = processed.filter(r => r.position === '车头').map(r => r.nickName)

      // 为每条记录计算 picker 初始索引
      processed.forEach(r => {
        const idx = r.assignment ? headNickNames.indexOf(r.assignment) : -1
        r.pickerIdx = idx >= 0 ? idx : 0
      })

      this.setData({
        registrations: processed,
        displayNames,
        headNickNames,
        selectedIds: [],
        selectAllChecked: false,
        loading: false
      })
    } catch (err) {
      console.error('加载报名记录失败:', err)
      util.showError('加载失败')
      this.setData({ loading: false })
    }
  },

  onSelectAll: function () {
    const checked = !this.data.selectAllChecked
    const registrations = this.data.registrations.map(r => ({
      ...r,
      selected: checked && r.position !== '车头'
    }))
    const selectedIds = checked
      ? registrations.filter(r => r.selected).map(r => r._id)
      : []
    const bodyCount = registrations.filter(r => r.position !== '车头').length
    const selectAllChecked = bodyCount > 0 && selectedIds.length === bodyCount

    this.setData({
      registrations,
      selectAllChecked,
      selectedIds
    })
  },

  onSlotCheckChange: function (e) {
    const index = e.currentTarget.dataset.index
    const item = this.data.registrations[index]
    if (item.position === '车头') return

    const value = e.detail.value
    const selected = value.length > 0

    const registrations = this.data.registrations.map((r, i) =>
      i === index ? { ...r, selected } : r
    )

    const selectedIds = registrations.filter(r => r.selected).map(r => r._id)
    const bodyCount = registrations.filter(r => r.position !== '车头').length
    const selectAllChecked = bodyCount > 0 && selectedIds.length === bodyCount

    this.setData({
      registrations,
      selectedIds,
      selectAllChecked
    })
  },

  onDeleteSelected: async function () {
    if (this.data.selectedIds.length === 0) {
      util.showInfo('请先选择要删除的报名')
      return
    }

    const confirm = await util.showConfirm(
      '确认删除',
      `确定要删除选中的 ${this.data.selectedIds.length} 条报名记录吗？此操作不可恢复。`
    )
    if (!confirm) return

    try {
      util.showLoading('正在删除...')
      for (const id of this.data.selectedIds) {
        await db.adminDeleteBattleRegistration(id)
      }
      util.hideLoading()
      util.showSuccess(`成功删除 ${this.data.selectedIds.length} 条记录`)
      this.loadRegistrations()
    } catch (err) {
      util.hideLoading()
      util.showError('删除失败')
      await this.loadRegistrations()
    }
  },

  // 选择器变化 - 直接更新分配
  onPickerChange: async function (e) {
    const registrationId = e.currentTarget.dataset.id
    const index = e.currentTarget.dataset.index
    const pickerIdx = parseInt(e.detail.value)
    const selectedName = this.data.headNickNames[pickerIdx]

    try {
      await db.updateBattleRegistrationAssignment(registrationId, selectedName)

      // 更新本地数据
      const registrations = this.data.registrations.map((r, i) =>
        i === index ? { ...r, assignment: selectedName, editAssignment: selectedName, pickerIdx } : r
      )
      this.setData({ registrations })
    } catch (err) {
      console.error('更新分配失败:', err)
      util.showError('更新失败')
    }
  },

  onBatchAssign: function () {
    const bodyIds = this.data.selectedIds.filter(id => {
      const reg = this.data.registrations.find(r => r._id === id)
      return reg && reg.position !== '车头'
    })

    if (bodyIds.length === 0) {
      util.showInfo('请先勾选车身报名者')
      return
    }

    if (this.data.headNickNames.length === 0) {
      util.showInfo('暂无车头可分配')
      return
    }

    wx.showActionSheet({
      itemList: this.data.headNickNames,
      success: async (res) => {
        const headName = this.data.headNickNames[res.tapIndex]
        try {
          util.showLoading('分配中...')
          for (const id of bodyIds) {
            await db.updateBattleRegistrationAssignment(id, headName)
          }
          util.hideLoading()
          util.showSuccess(`已将 ${bodyIds.length} 人分配到 ${headName}`)
          this.loadRegistrations()
        } catch (err) {
          util.hideLoading()
          console.error('批量分配失败:', err)
          util.showError('分配失败')
        }
      }
    })
  },

  onSaveScreenshot: async function () {
    if (this.data.registrations.length === 0) {
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
      const colTotalWidth = innerWidth

      const canvas = wx.createOffscreenCanvas({
        type: '2d',
        width: canvasWidth,
        height: screenshotData.height
      })
      const ctx = canvas.getContext('2d')

      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, canvasWidth, screenshotData.height)

      // 标题
      ctx.fillStyle = '#07C160'
      ctx.font = 'bold 36px sans-serif'
      ctx.fillText('国战统计表', margin, titleY)

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

      // 表头 - 按比例分配，确保宽字段有足够空间
      const colDefs = [
        { key: '昵称',    ratio: 0.17 },
        { key: '联盟',    ratio: 0.10 },
        { key: '熔炉',    ratio: 0.08 },
        { key: '兵营',    ratio: 0.09 },
        { key: '兵种(万)', ratio: 0.09 },
        { key: '钻石(万)', ratio: 0.11 },
        { key: '开麦',    ratio: 0.08 },
        { key: '位置',    ratio: 0.09 },
        { key: '分配',    ratio: 0.19 }
      ]

      let colX = margin
      for (const col of colDefs) {
        col.w = Math.floor(colTotalWidth * col.ratio)
        col.x = colX
        colX += col.w
      }

      ctx.fillStyle = '#4A90D9'
      ctx.fillRect(margin, headerY, innerWidth, headerHeight)
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 24px sans-serif'
      for (const col of colDefs) {
        ctx.fillText(col.key, col.x + 8, headerY + 32)
      }

      // 数据行 - 昵称自动换行
      let y = dataStartY
      const namePaddingX = colDefs[0].x + 8
      const nameMaxWidth = colDefs[0].w - 16
      ctx.textBaseline = 'top'

      for (let i = 0; i < this.data.registrations.length; i++) {
        const r = this.data.registrations[i]
        const displayName = this.data.displayNames[i]

        if (i % 2 === 1) {
          ctx.fillStyle = '#F5F5F5'
          ctx.fillRect(margin, y, innerWidth, rowHeight)
        }

        const rowStartY = y + 5

        // 昵称 - 自动换行
        ctx.fillStyle = '#333333'
        ctx.font = '22px sans-serif'
        const nameLines = this._wrapTextFixed(ctx, displayName, nameMaxWidth)
        for (let j = 0; j < nameLines.length; j++) {
          ctx.fillText(nameLines[j], namePaddingX, rowStartY + j * 26)
        }

        // 其他字段 - 对齐到第一行
        ctx.fillText((r.allianceName || '').substring(0, 3), colDefs[1].x + 8, rowStartY)
        ctx.fillText(r.furnaceLevel || '-', colDefs[2].x + 8, rowStartY)
        ctx.fillText(r.barracksLevel || '-', colDefs[3].x + 8, rowStartY)
        ctx.fillText(r.troopCount || '-', colDefs[4].x + 8, rowStartY)
        ctx.fillText(r.diamonds || '-', colDefs[5].x + 8, rowStartY)
        ctx.fillText(r.voice || '-', colDefs[6].x + 8, rowStartY)
        ctx.fillText(r.position || '-', colDefs[7].x + 8, rowStartY)
        ctx.fillText(r.assignment || '-', colDefs[8].x + 8, rowStartY)

        // 行高根据昵称行数动态计算
        const lineCount = Math.max(1, nameLines.length)
        y += Math.max(rowHeight, lineCount * 26 + 10)
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
        fail: (err) => {
          util.hideLoading()
          console.error('生成图片失败:', err)
          util.showError('生成图片失败')
        }
      })

    } catch (err) {
      util.hideLoading()
      console.error('截图失败:', err)
      util.showError('截图失败')
    }
  },

  buildScreenshotData: function () {
    const topArea = 155 + 50
    const rowHeight = 45
    const bottomMargin = 40
    const margin = 40
    const canvasWidth = 750
    const nameMaxWidth = Math.floor((canvasWidth - margin * 2) * 0.18) - 16

    let totalHeight = topArea
    for (let i = 0; i < this.data.displayNames.length; i++) {
      const displayName = this.data.displayNames[i]
      const lineCount = this._countLines(displayName, nameMaxWidth)
      const h = Math.max(rowHeight, lineCount * 26 + 10)
      totalHeight += h
    }
    return { height: totalHeight + bottomMargin }
  },

  _countLines: function (text, maxWidth) {
    // 粗略估算：22px 字体每个中文字约 22px 宽
    const charWidth = 22
    const charsPerLine = Math.floor(maxWidth / charWidth)
    return Math.ceil(text.length / charsPerLine)
  },

  _wrapTextFixed: function (ctx, text, maxWidth) {
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
  }
})
