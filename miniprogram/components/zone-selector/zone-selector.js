Component({
  properties: {
    // 当前选中的 zone
    value: {
      type: Object,
      value: null
    },
    // 分区列表
    zones: {
      type: Array,
      value: []
    },
    // 是否已加载完成
    loaded: {
      type: Boolean,
      value: false
    },
    // 未找到分区时是否显示"申请开通分区"快捷入口
    showApplyEntry: {
      type: Boolean,
      value: false
    }
  },

  data: {
    showPicker: false,
    keyword: '',
    filteredZones: []
  },

  observers: {
    'zones, keyword': function(zones, keyword) {
      if (!zones) {
        this.setData({ filteredZones: [] })
        return
      }
      const kw = keyword.trim()
      if (!kw) {
        this.setData({ filteredZones: zones })
      } else {
        const filtered = zones.filter(z => {
          const name = String(z.zoneName || '')
          const code = String(z.zoneCode || '')
          return name.includes(kw) || code.includes(kw)
        })
        this.setData({ filteredZones: filtered })
      }
    }
  },

  methods: {
    openPicker: function() {
      this.setData({
        showPicker: true,
        keyword: '',
        filteredZones: this.data.zones
      })
    },

    closePicker: function() {
      this.setData({ showPicker: false })
    },

    // 阻止事件冒泡到overlay（防止点击面板区域时关闭）
    stopPropagation: function() {},

    onKeywordInput: function(e) {
      this.setData({ keyword: e.detail.value })
    },

    clearKeyword: function() {
      this.setData({ keyword: '' })
    },

    selectZone: function(e) {
      const zone = e.currentTarget.dataset.zone
      // 同步到全局和本地存储
      const app = getApp()
      app.globalData.currentZone = zone
      wx.setStorageSync('lastZoneId', zone._id)

      this.setData({
        showPicker: false,
        keyword: ''
      })
      this.triggerEvent('change', { zone: zone })
    },

    // 未找到分区时点击"申请开通分区"，交由父页面处理具体申请流程
    onApplyZoneTap: function() {
      this.setData({ showPicker: false })
      this.triggerEvent('applyzone')
    }
  }
})
