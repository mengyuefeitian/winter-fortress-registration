// components/level-picker/level-picker.js
// 等级选择弹窗（等级 1-30 / 火晶 1-10，二选一互斥；火晶且非熔炉时可选兵种阶）
// 目前由国战报名页使用（「我的」页编辑账号暂用自己的 sheet，视觉保持一致）。
const ga = require('../../utils/gameAccount')

const RING_LIST = (() => { const a = []; for (let i = 1; i <= ga.MAX_LEVEL; i++) a.push(i); return a })()
const FIRE_LIST = (() => { const a = []; for (let i = 1; i <= ga.MAX_FIRE; i++) a.push(i); return a })()

Component({
  properties: {
    show: { type: Boolean, value: false },
    target: { type: String, value: 'furnace' },   // furnace | shield | spear | bow
    title: { type: String, value: '等级' },
    icon: { type: String, value: '' },            // 标题左侧图标路径
    value: { type: Object, value: null }          // 当前规格 {kind,value,stage} | null
  },

  data: {
    // 默认停在「火晶等级」列（用户习惯先看火晶），有既有值时才按既有值展开
    levelKind: 'fire',
    levelValue: null,
    stage: '',
    ringList: RING_LIST,
    fireList: FIRE_LIST
  },

  observers: {
    'show': function (show) {
      if (show) this.initFromValue()
    }
  },

  methods: {
    noop: function () { },

    initFromValue: function () {
      const spec = ga.normalizeSpec(this.data.value)
      this.setData({
        // 没值（含老报名数据）时默认展开「火晶等级」列
        levelKind: spec ? spec.kind : 'fire',
        levelValue: spec ? spec.value : null,
        stage: (spec && spec.kind === 'fire' && spec.stage) || ''
      })
    },

    onKindTap: function (e) {
      const kind = e.currentTarget.dataset.kind
      if (kind === this.data.levelKind) return
      const max = kind === 'fire' ? ga.MAX_FIRE : ga.MAX_LEVEL
      const keep = this.data.levelValue && this.data.levelValue <= max ? this.data.levelValue : null
      this.setData({
        levelKind: kind,
        levelValue: keep,
        // 切到「等级」时清空兵种阶（只对火晶有意义）
        stage: kind === 'fire' ? this.data.stage : ''
      })
    },

    onValueTap: function (e) {
      const value = parseInt(e.currentTarget.dataset.value, 10)
      // 再点一次已选中的值 = 取消选择
      this.setData({ levelValue: this.data.levelValue === value ? null : value })
    },

    onStageTap: function (e) {
      this.setData({ stage: e.currentTarget.dataset.stage || '' })
    },

    onClear: function () {
      this.setData({ levelValue: null, stage: '' })
    },

    onCancel: function () {
      this.triggerEvent('cancel')
    },

    onConfirm: function () {
      const { levelKind, levelValue, stage, target } = this.data
      const spec = levelValue
        ? {
          kind: levelKind,
          value: levelValue,
          // 兵种阶只在「火晶」且非熔炉时生效
          stage: (levelKind === 'fire' && target !== 'furnace') ? stage : ''
        }
        : null
      this.triggerEvent('confirm', { spec: spec })
    }
  }
})
