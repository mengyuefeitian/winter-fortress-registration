// components/alliance-picker/alliance-picker.js
// 联盟选择器（弹窗网格版）：替代原生的 <picker> 滚轮。
//
// 为什么要换：一个分区固定 12 个联盟，滚轮要一个个拨，容易选错；
// 改成两列六行的网格，全部选项一屏可见，点一下即选中。
//
// ⚠️ 事件契约刻意与原生 picker 对齐：change 事件回抛 { value: 选中的索引 }，
//    所以各页面原有的 onAllianceChange(e) { e.detail.value } 一行都不用改。
//
// variant 三档，用于贴合各页面原有触发器的外观：
//   compact —— 灰底小胶囊（报名页 / 管理端表单，对应旧 .picker-compact）
//   field   —— 圆角浅底 + 右箭头（「我的」页编辑账号弹窗，对应旧 .picker-row）
//   plain   —— 无底色、右对齐文字 + ▾（国战报名页，与旁边开麦/报名位置一致）
Component({
  properties: {
    alliances: { type: Array, value: [] },     // [{_id, allianceName, zoneName?}]
    value: { type: Number, value: -1 },        // 当前选中索引，-1 = 未选
    placeholder: { type: String, value: '请选择联盟' },
    variant: { type: String, value: 'compact' },
    showZone: { type: Boolean, value: false }  // 触发器里是否带「 · 分区名」
  },

  data: {
    open: false,
    display: ''
  },

  observers: {
    'alliances, value, placeholder, showZone': function (list, value, placeholder, showZone) {
      this.setData({ display: this.buildDisplay(list, value, placeholder, showZone) })
    }
  },

  // 兜底：观测器在「初始值等于默认值」时可能不触发，附加一次显式计算
  attached: function () {
    this.setData({
      display: this.buildDisplay(this.data.alliances, this.data.value, this.data.placeholder, this.data.showZone)
    })
  },

  methods: {
    buildDisplay: function (list, value, placeholder, showZone) {
      const arr = list || []
      const idx = typeof value === 'number' ? value : parseInt(value, 10)
      if (isNaN(idx) || idx < 0 || idx >= arr.length) return placeholder || '请选择联盟'
      const item = arr[idx] || {}
      const name = item.allianceName || placeholder || '请选择联盟'
      return (showZone && item.zoneName) ? `${name} · ${item.zoneName}` : name
    },

    openSheet: function () {
      // 没有可选项时不开空面板（调用方一般已有「暂无联盟」的兜底分支）
      if (!(this.data.alliances || []).length) return
      this.setData({ open: true })
    },

    closeSheet: function () {
      this.setData({ open: false })
    },

    onPick: function (e) {
      const index = parseInt(e.currentTarget.dataset.index, 10)
      const alliance = (this.data.alliances || [])[index] || null
      if (!alliance) return
      this.setData({ open: false })
      this.triggerEvent('change', { value: index, index: index, alliance: alliance })
    },

    noop: function () { }
  }
})
