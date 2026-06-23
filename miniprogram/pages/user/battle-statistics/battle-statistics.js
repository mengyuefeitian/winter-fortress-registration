// pages/user/battle-statistics/battle-statistics.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')
Page({
  data: {
    configId: '',
    date: '',
    headRegistrations: [],
    bodyRegistrations: [],
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
      }))

      const headRegistrations = processed.filter(r => r.position === '车头')
      const headNickNames = headRegistrations.map(r => r.nickName)

      const bodyRegistrations = processed.filter(r => r.position !== '车头').map(r => ({
        ...r,
        pickerIdx: r.assignment ? Math.max(headNickNames.indexOf(r.assignment), 0) : 0
      }))

      this.setData({
        headRegistrations,
        bodyRegistrations,
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
    const bodyRegistrations = this.data.bodyRegistrations.map(r => ({
      ...r,
      selected: checked
    }))
    const selectedIds = checked ? bodyRegistrations.map(r => r._id) : []
    const selectAllChecked = checked && bodyRegistrations.length > 0

    this.setData({ bodyRegistrations, selectAllChecked, selectedIds })
  },

  onSlotCheckChange: function (e) {
    const index = e.currentTarget.dataset.index
    const value = e.detail.value
    const selected = value.length > 0

    const bodyRegistrations = this.data.bodyRegistrations.map((r, i) =>
      i === index ? { ...r, selected } : r
    )

    const selectedIds = bodyRegistrations.filter(r => r.selected).map(r => r._id)
    const selectAllChecked = bodyRegistrations.length > 0 && selectedIds.length === bodyRegistrations.length

    this.setData({ bodyRegistrations, selectedIds, selectAllChecked })
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

  onPickerChange: async function (e) {
    const registrationId = e.currentTarget.dataset.id
    const index = e.currentTarget.dataset.index
    const pickerIdx = parseInt(e.detail.value)
    const selectedName = this.data.headNickNames[pickerIdx]

    try {
      await db.updateBattleRegistrationAssignment(registrationId, selectedName)
      const bodyRegistrations = this.data.bodyRegistrations.map((r, i) =>
        i === index ? { ...r, assignment: selectedName, editAssignment: selectedName, pickerIdx } : r
      )
      this.setData({ bodyRegistrations })
    } catch (err) {
      console.error('更新分配失败:', err)
      util.showError('更新失败')
    }
  },

  onBatchAssign: function () {
    if (this.data.selectedIds.length === 0) {
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
          for (const id of this.data.selectedIds) {
            await db.updateBattleRegistrationAssignment(id, headName)
          }
          util.hideLoading()
          util.showSuccess(`已将 ${this.data.selectedIds.length} 人分配到 ${headName}`)
          this.loadRegistrations()
        } catch (err) {
          util.hideLoading()
          console.error('批量分配失败:', err)
          util.showError('分配失败')
        }
      }
    })
  },

  buildScreenshotData: function () {
    const sectionHeaderH = 40
    const tableHeaderH = 50
    const rowH = 70
    const sectionGap = 20
    const bottomMargin = 40
    const topArea = 155

    const headH = sectionHeaderH + tableHeaderH + this.data.headRegistrations.length * rowH
    const bodyH = sectionHeaderH + tableHeaderH + this.data.bodyRegistrations.length * rowH

    return { height: topArea + headH + sectionGap + bodyH + bottomMargin }
  },

  onSaveScreenshot: async function () {
    if (this.data.headRegistrations.length === 0 && this.data.bodyRegistrations.length === 0) {
      util.showInfo('暂无数据可截图')
      return
    }

    try {
      util.showLoading('正在生成截图...')

      const screenshotData = this.buildScreenshotData()
      const margin = 40
      const canvasWidth = 750
      const innerWidth = canvasWidth - margin * 2
      const rowH = 70
      const tableHeaderH = 50
      const sectionHeaderH = 40

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
      ctx.fillText('国战统计表', margin, 70)

      // 日期
      ctx.fillStyle = '#999999'
      ctx.font = '26px sans-serif'
      ctx.fillText(this.data.date, margin, 115)

      // 分隔线
      ctx.strokeStyle = '#E8E8E8'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(margin, 135)
      ctx.lineTo(canvasWidth - margin, 135)
      ctx.stroke()

      // 列定义 — ratios 之和必须 = 1.0
      const headColDefs = [
        { key: '昵称/联盟',  ratio: 0.30 },
        { key: '熔炉',       ratio: 0.13 },
        { key: '兵种实力(万)', ratio: 0.22 },
        { key: '钻石(万)',   ratio: 0.18 },
        { key: '开麦',       ratio: 0.17 },
      ]
      const bodyColDefs = [
        { key: '昵称/联盟',  ratio: 0.26 },
        { key: '熔炉',       ratio: 0.11 },
        { key: '兵种实力(万)', ratio: 0.19 },
        { key: '钻石(万)',   ratio: 0.15 },
        { key: '开麦',       ratio: 0.11 },
        { key: '分配',       ratio: 0.18 },
      ]

      // 计算每列 x 坐标和宽度
      const buildCols = (colDefs) => {
        let x = margin
        return colDefs.map(col => {
          const w = Math.floor(innerWidth * col.ratio)
          const result = { key: col.key, w, x }
          x += w
          return result
        })
      }

      // 渲染 section header（灰底标题行）
      const drawSectionHeader = (title, y) => {
        ctx.fillStyle = '#F5F5F5'
        ctx.fillRect(margin, y, innerWidth, sectionHeaderH)
        ctx.fillStyle = '#333333'
        ctx.font = 'bold 26px sans-serif'
        ctx.textBaseline = 'middle'
        ctx.fillText(title, margin + 12, y + sectionHeaderH / 2)
        ctx.textBaseline = 'alphabetic'
      }

      // 渲染表头行（蓝底白字）
      const drawTableHeader = (cols, y) => {
        ctx.fillStyle = '#4A90D9'
        ctx.fillRect(margin, y, innerWidth, tableHeaderH)
        ctx.fillStyle = '#FFFFFF'
        ctx.font = 'bold 22px sans-serif'
        ctx.textBaseline = 'middle'
        for (const col of cols) {
          ctx.fillText(col.key, col.x + 8, y + tableHeaderH / 2)
        }
        ctx.textBaseline = 'alphabetic'
      }

      // 渲染数据行（双行单元格）
      const drawRow = (row, cols, rowIndex, y) => {
        if (rowIndex % 2 === 1) {
          ctx.fillStyle = '#F5F5F5'
          ctx.fillRect(margin, y, innerWidth, rowH)
        }
        ctx.textBaseline = 'top'
        const line1Y = y + 8
        const line2Y = y + 8 + 28

        for (const col of cols) {
          if (col.key === '昵称/联盟') {
            ctx.fillStyle = '#333333'
            ctx.font = '22px sans-serif'
            ctx.fillText(row.nickName || '-', col.x + 8, line1Y)
            ctx.fillStyle = '#6BB3F0'
            ctx.font = '20px sans-serif'
            ctx.fillText(row.allianceName || '-', col.x + 8, line2Y)
          } else if (col.key === '兵种实力(万)') {
            ctx.fillStyle = '#333333'
            ctx.font = '22px sans-serif'
            ctx.fillText(row.barracksLevel || '-', col.x + 8, line1Y)
            ctx.fillStyle = '#4A90D9'
            ctx.font = '20px sans-serif'
            ctx.fillText(row.troopCount || '-', col.x + 8, line2Y)
          } else {
            ctx.fillStyle = '#333333'
            ctx.font = '22px sans-serif'
            const val = col.key === '熔炉'    ? (row.furnaceLevel || '-')
                      : col.key === '钻石(万)' ? (row.diamonds || '-')
                      : col.key === '开麦'    ? (row.voice || '-')
                      : col.key === '分配'    ? (row.assignment || '-')
                      : '-'
            ctx.fillText(val, col.x + 8, line1Y)
          }
        }
        ctx.textBaseline = 'alphabetic'
      }

      const headCols = buildCols(headColDefs)
      const bodyCols = buildCols(bodyColDefs)

      // 渲染车头区
      let y = 155
      drawSectionHeader(`车头（${this.data.headRegistrations.length}人）`, y)
      y += sectionHeaderH
      drawTableHeader(headCols, y)
      y += tableHeaderH
      for (let i = 0; i < this.data.headRegistrations.length; i++) {
        drawRow(this.data.headRegistrations[i], headCols, i, y)
        y += rowH
      }

      y += 20  // section gap

      // 渲染车身区
      drawSectionHeader(`车身（${this.data.bodyRegistrations.length}人）`, y)
      y += sectionHeaderH
      drawTableHeader(bodyCols, y)
      y += tableHeaderH
      for (let i = 0; i < this.data.bodyRegistrations.length; i++) {
        drawRow(this.data.bodyRegistrations[i], bodyCols, i, y)
        y += rowH
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
  }
})
