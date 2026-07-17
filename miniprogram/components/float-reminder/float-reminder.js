// components/float-reminder/float-reminder.js
// 半透明悬浮提醒：显示后约 3 秒内自动淡化消失，pointer-events:none 不阻塞用户操作
Component({
  properties: {
    // 动画时长（毫秒），默认 3000
    duration: {
      type: Number,
      value: 3000
    }
  },
  data: {
    show: false,
    text: ''
  },
  methods: {
    show: function (text) {
      if (this._timer) {
        clearTimeout(this._timer)
        this._timer = null
      }
      this.setData({ show: true, text: text || '' })
      const d = this.data.duration
      this._timer = setTimeout(() => {
        this.setData({ show: false })
        this._timer = null
      }, d)
    }
  }
})
