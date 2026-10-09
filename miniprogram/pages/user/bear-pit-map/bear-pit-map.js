// pages/user/bear-pit-map/bear-pit-map.js
// 熊坑分布图大图：可缩放 / 拖动 / 切换编号-昵称 / 保存到相册
const util = require('../../../utils/util')
const db = require('../../../utils/db')
const draw = require('../../../utils/bearPitDraw')
const layout = require('../../../utils/bearPitLayout')

const MIN_SCALE = 1
const MAX_SCALE = 6
const EXPORT_SIZE = 1440

Page({
  data: {
    mode: 'nick',
    loading: true,
    memberCount: 0,
    seatTotal: layout.TOTAL_SEATS
  },

  onLoad: function (options) {
    this._allianceId = (options && options.allianceId) || ''
    this._members = []
    this._scale = 1
    this._offsetX = 0
    this._offsetY = 0
    this._touch = null
    this._canvas = null
    this._ctx = null
    this._cssW = 0
    this._cssH = 0
    this._dpr = 2
    this._drawPending = false
  },

  onReady: function () {
    this.initCanvas()
    this.loadBoard()
  },

  initCanvas: function () {
    const query = wx.createSelectorQuery().in(this)
    query.select('#pitCanvas').fields({ node: true, size: true }).exec(res => {
      const info = res && res[0]
      if (!info || !info.node) return
      let dpr = 2
      try {
        const w = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
        dpr = Math.min(w.pixelRatio || 2, 3)
      } catch (e) { /* 用默认值 */ }
      this._canvas = info.node
      this._ctx = info.node.getContext('2d')
      this._cssW = info.width
      this._cssH = info.height
      this._dpr = dpr
      this._canvas.width = Math.floor(info.width * dpr)
      this._canvas.height = Math.floor(info.height * dpr)
      this.redraw()
    })
  },

  loadBoard: async function () {
    if (!this._allianceId) {
      this.setData({ loading: false })
      return
    }
    try {
      const board = await db.getBearPitBoard(this._allianceId)
      this._members = (board.members || []).slice().sort((a, b) => (a.seatIndex || 999) - (b.seatIndex || 999))
      this.setData({
        loading: false,
        memberCount: this._members.length,
        seatTotal: board.seatTotal || layout.TOTAL_SEATS
      }, () => this.redraw())
    } catch (err) {
      console.error('加载熊坑看板失败:', err)
      this.setData({ loading: false })
      util.showError(err.message || '加载失败')
    }
  },

  // ── 绘制（拖动 / 缩放时高频调用，用 _drawPending 做一帧节流）──
  redraw: function () {
    if (this._drawPending) return
    this._drawPending = true
    setTimeout(() => {
      this._drawPending = false
      this.paint(this._ctx, this._cssW, this._cssH, this._dpr, this._scale, this._offsetX, this._offsetY, this.data.mode)
    }, 16)
  },

  paint: function (ctx, width, height, dpr, scale, offsetX, offsetY, mode) {
    if (!ctx || !width || !height) return
    draw.drawPit(ctx, {
      width: width,
      height: height,
      dpr: dpr,
      scale: scale,
      offsetX: offsetX,
      offsetY: offsetY,
      mode: mode,
      members: this._members,
      seatTotal: this.data.seatTotal
    })
  },

  switchMode: function (e) {
    const mode = e.currentTarget.dataset.mode
    if (mode === this.data.mode) return
    this.setData({ mode: mode }, () => this.redraw())
  },

  resetView: function () {
    this._scale = 1
    this._offsetX = 0
    this._offsetY = 0
    this.redraw()
  },

  // ── 手势：单指拖动、双指缩放 ──
  onTouchStart: function (e) {
    const touches = e.touches || []
    this._touch = {
      startX: touches.length ? touches[0].x : 0,
      startY: touches.length ? touches[0].y : 0,
      baseOffsetX: this._offsetX,
      baseOffsetY: this._offsetY,
      lastDist: touches.length > 1 ? this.distance(touches[0], touches[1]) : 0,
      baseScale: this._scale,
      moved: false
    }
  },

  onTouchMove: function (e) {
    const touches = e.touches || []
    if (!this._touch) return

    if (touches.length > 1) {
      const dist = this.distance(touches[0], touches[1])
      if (this._touch.lastDist > 0) {
        let scale = this._touch.baseScale * (dist / this._touch.lastDist)
        scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale))
        this._scale = scale
        this._touch.moved = true
        this.redraw()
      }
      return
    }

    if (touches.length === 1) {
      const dx = touches[0].x - this._touch.startX
      const dy = touches[0].y - this._touch.startY
      if (Math.abs(dx) + Math.abs(dy) > 3) this._touch.moved = true
      this._offsetX = this._touch.baseOffsetX + dx
      this._offsetY = this._touch.baseOffsetY + dy
      this.redraw()
    }
  },

  onTouchEnd: function (e) {
    const touches = e.touches || []
    if (touches.length === 1) {
      // 双指变单指：以当前状态重新起手，避免跳变
      this._touch = {
        startX: touches[0].x,
        startY: touches[0].y,
        baseOffsetX: this._offsetX,
        baseOffsetY: this._offsetY,
        lastDist: 0,
        baseScale: this._scale,
        moved: true
      }
      return
    }
    this._touch = null
  },

  distance: function (a, b) {
    const dx = a.x - b.x
    const dy = a.y - b.y
    return Math.sqrt(dx * dx + dy * dy)
  },

  // ── 保存到相册：离屏画布按 1440px 重绘一份高清图 ──
  saveAlbum: function () {
    if (this.data.loading) {
      util.showInfo('还在加载中，稍后再试')
      return
    }
    util.showLoading('正在生成图片…')
    try {
      const canvas = wx.createOffscreenCanvas({ type: '2d', width: EXPORT_SIZE, height: EXPORT_SIZE })
      const ctx = canvas.getContext('2d')
      this.paint(ctx, EXPORT_SIZE, EXPORT_SIZE, 1, 1, 0, 0, this.data.mode)

      wx.canvasToTempFilePath({
        canvas: canvas,
        destWidth: EXPORT_SIZE,
        destHeight: EXPORT_SIZE,
        success: (res) => {
          wx.saveImageToPhotosAlbum({
            filePath: res.tempFilePath,
            success: () => {
              util.hideLoading()
              util.showSuccess('已保存到相册')
            },
            fail: (err) => {
              util.hideLoading()
              const msg = (err && err.errMsg) || ''
              if (msg.indexOf('auth deny') !== -1 || msg.indexOf('authorize') !== -1) {
                wx.showModal({
                  title: '提示',
                  content: '需要您授权「保存到相册」权限',
                  confirmText: '去授权',
                  success: (m) => { if (m.confirm) wx.openSetting() }
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
      console.error('保存分布图失败:', err)
      util.showError('保存失败')
    }
  }
})
