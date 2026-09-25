// components/account-nickname/account-nickname.js
// 报名页「游戏昵称」复合选择器：
//   · 默认展示主账号
//   · 下拉切换已有游戏账号
//   · 允许手动填写（填写的新昵称会在报名提交时自动追加到游戏账号列表）
// 通过 bind:change 把 { nickName, selectedId } 抛给父页面。
Component({
  properties: {
    accounts: { type: Array, value: [] },          // [{_id, gameNickName, isMain}]
    value: { type: String, value: '' },            // 当前昵称
    selectedId: { type: String, value: '' },       // 当前选中的账号 _id（手动填写时为 ''）
    placeholder: { type: String, value: '请选择或输入昵称' }
  },

  data: {
    sheetOpen: false,
    manualOpen: false,
    localValue: ''
  },

  methods: {
    openSheet: function () {
      this.setData({ sheetOpen: true, manualOpen: false })
    },

    closeSheet: function () {
      this.setData({ sheetOpen: false, manualOpen: false })
    },

    // 选中已有账号：立即回填并关闭
    onPick: function (e) {
      const id = e.currentTarget.dataset.id
      const nick = e.currentTarget.dataset.nick
      this.triggerEvent('change', { nickName: nick, selectedId: id })
      this.setData({ sheetOpen: false, manualOpen: false })
    },

    // 进入手动输入：把当前昵称带进输入框
    onManual: function () {
      this.setData({ manualOpen: true, localValue: this.data.value })
    },

    onManualInput: function (e) {
      const v = e.detail.value
      this.setData({ localValue: v })
      this.triggerEvent('change', { nickName: v, selectedId: '' })
    },

    confirm: function () {
      this.setData({ sheetOpen: false, manualOpen: false })
    },

    noop: function () { }
  }
})
