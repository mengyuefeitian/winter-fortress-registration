// pages/admin/time-slot-config/time-slot-config.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')
const auth = require('../../../utils/auth')
const cache = require('../../../utils/cache')

// 标签选项常量
const TAG_OPTIONS = ['高迁', '生命', '穿透', '加兵', '火晶', '橙碎', '加速', '螺丝', '宠石', '宠箱', '其他']
// 堡垒名称选项（单选）
const FORTRESS_OPTIONS = db.FORTRESS_OPTIONS

Page({
  data: {
    TIME_OPTIONS: [
      { label: '10点', value: '10:00' },
      { label: '12点', value: '12:00' },
      { label: '15点', value: '15:00' },
      { label: '19点30', value: '19:30' },
      { label: '21点', value: '21:00' }
    ],
    TAG_OPTIONS: TAG_OPTIONS,
    FORTRESS_OPTIONS: FORTRESS_OPTIONS,
    selectedTimeIndex: 0,
    selectedTime: { label: '10点', value: '10:00' },
    selectedTag: '',
    selectedFortress: '',
    selectedDate: '',
    minDate: '',
    maxDate: '',

    zones: [],
    selectedZone: null,

    alliances: [],
    allianceIndex: 0,
    selectedAlliance: null,

    timeSlots: [],
    selectedSlots: [],
    selectAllChecked: false,
    loading: false,
    zonesLoaded: false
  },

  onLoad: function () {
    this.initDateRange()
    this.waitForRoleReady()
  },

  onShow: function () {
    if (!app.globalData.roleReady) return
    // 快速路径：用区级缓存（新实例用 app.globalData.currentZone 也能命中）
    const tsZone = this.data.selectedZone || app.globalData.currentZone
    let hadCache = false
    if (tsZone) {
      const tsCached = cache.get('cfg_fortress_zone_' + tsZone._id)
      if (tsCached) {
        this.setData({
          timeSlots: tsCached.timeSlots,
          selectedSlots: [],
          selectAllChecked: false,
          loading: false
        })
        hadCache = true
      }
    }
    this._silentLoad = hadCache
    // 已初始化的页面实例：主动刷新；新实例：checkPermission → loadZones 会处理
    if (this.data.zonesLoaded) {
      this.loadZones(hadCache)
    }
  },

  // 初始化日期范围
  initDateRange: function () {
    const today = new Date()
    const year = today.getFullYear()
    const minDate = this.formatDate(today)
    const maxDate = this.formatDate(new Date(year + 1, today.getMonth(), today.getDate()))
    this.setData({
      minDate: minDate,
      maxDate: maxDate,
      selectedDate: minDate
    })
  },

  // 格式化日期
  formatDate: function (date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  // 等待角色就绪
  waitForRoleReady: function () {
    if (app.globalData.roleReady) {
      this.checkPermission()
    } else {
      setTimeout(() => {
        this.waitForRoleReady()
      }, 100)
    }
  },

  // 检查权限
  checkPermission: function () {
    const role = app.globalData.role || 'user'
    if (!auth.isAdminOrAbove(role)) {
      util.showError('权限不足')
      wx.switchTab({
        url: '/pages/index/index'
      })
      return
    }
    // onShow 已展示缓存时静默加载，避免 loading:true 覆盖缓存渲染
    this.loadZones(this._silentLoad)
  },

  // 加载分区列表
  // silent=true 时跳过 loading: true，用于缓存命中后的后台刷新
  loadZones: async function (silent) {
    try {
      if (!silent) this.setData({ loading: true })
      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid
      const role = app.globalData.role || 'admin'

      let zones
      if (role === 'superAdmin') {
        zones = await db.getAllZones()
      } else {
        zones = await db.getZonesByCreator(userId)
      }

      if (zones && zones.length > 0) {
        let selectedZone = zones[0]

        if (app.globalData.currentZone) {
          const foundIndex = zones.findIndex(z => z._id === app.globalData.currentZone._id)
          if (foundIndex >= 0) {
            selectedZone = zones[foundIndex]
          }
        }

        this.setData({
          zones: zones,
          selectedZone: selectedZone,
          zonesLoaded: true
        })
        this.loadAlliances(selectedZone._id, silent)
      } else {
        this.setData({
          zones: [],
          selectedZone: null,
          alliances: [],
          selectedAlliance: null,
          timeSlots: [],
          loading: false,
          zonesLoaded: true
        })
      }
    } catch (err) {
      console.error('加载分区失败:', err)
      util.showError('加载分区失败')
      this.setData({ loading: false })
    }
  },

  // 加载联盟列表
  loadAlliances: async function (zoneId, silent) {
    try {
      const alliances = await db.getAlliancesByZone(zoneId)
      this.setData({
        alliances: alliances || [],
        allianceIndex: 0
      })

      if (alliances && alliances.length > 0) {
        this.setData({ selectedAlliance: alliances[0] })
        this.loadTimeSlots(silent)
      } else {
        this.setData({
          selectedAlliance: null,
          timeSlots: [],
          loading: false
        })
      }
    } catch (err) {
      console.error('加载联盟失败:', err)
      util.showError('加载联盟失败')
      this.setData({ loading: false })
    }
  },

  // 加载时间段列表
  // silent=true 时跳过 loading: true，用于缓存命中后的后台刷新
  loadTimeSlots: async function (silent) {
    try {
      if (!this.data.selectedAlliance) return

      if (!silent) this.setData({ loading: true })
      const allianceId = this.data.selectedAlliance._id
      const timeSlots = await db.getTimeSlotsByAlliance(allianceId)

      if (timeSlots.length === 0) {
        this.setData({
          timeSlots: [],
          selectedSlots: [],
          selectAllChecked: false,
          loading: false
        })
        return
      }

      // 批量查询所有时间段的报名（一次查询，替代 N+1 循环查询）
      const timeSlotIds = timeSlots.map(s => s._id)
      const wxdb = wx.cloud.database()
      let countBySlot = {}

      if (timeSlotIds.length > 0) {
        // 并行 count() 查询，只取总数不拉文档，避免分页串行循环
        const countResults = await Promise.all(timeSlotIds.map(function (tsId) {
          return wxdb.collection('registrations').where({
            timeSlotId: tsId,
            status: 'active'
          }).count()
        }))
        timeSlotIds.forEach(function (tsId, i) {
          countBySlot[tsId] = countResults[i].total
        })
      }

      const processedSlots = timeSlots.map(slot => ({
        ...slot,
        currentCount: countBySlot[slot._id] || 0,
        editing: false,
        editTag: slot.tag || '',
        editFortress: slot.fortress || '',
        selected: false
      }))

      this.setData({
        timeSlots: processedSlots,
        selectedSlots: [],
        selectAllChecked: false,
        loading: false
      })
      const tsZoneId = this.data.selectedZone ? this.data.selectedZone._id : null
      if (tsZoneId) {
        cache.set('cfg_fortress_zone_' + tsZoneId, { timeSlots: this.data.timeSlots }, 5 * 60 * 1000)
      }
    } catch (err) {
      console.error('加载时间段失败:', err)
      util.showError('加载时间段失败')
      this.setData({ loading: false })
    }
  },

  // 分区选择变化（由组件内部处理全局状态同步）
  onZoneChange: function (e) {
    const zone = e.detail.zone
    if (!zone) return

    this.setData({
      selectedZone: zone,
      allianceIndex: 0,
      selectedAlliance: null,
      timeSlots: []
    })
    this.loadAlliances(zone._id)
  },

  // 联盟选择变化
  onAllianceChange: function (e) {
    const index = parseInt(e.detail.value)
    const alliance = this.data.alliances[index]
    this.setData({
      allianceIndex: index,
      selectedAlliance: alliance
    })
    this.loadTimeSlots()
  },

  // 日期选择变化
  onDateChange: function (e) {
    this.setData({
      selectedDate: e.detail.value
    })
  },

  // 选择基础时间
  onBaseTimeChange: function (e) {
    const index = parseInt(e.detail.value)
    this.setData({
      selectedTimeIndex: index,
      selectedTime: this.data.TIME_OPTIONS[index]
    })
  },

  // 选择标签
  onTagSelect: function (e) {
    const tag = e.currentTarget.dataset.tag
    this.setData({
      selectedTag: this.data.selectedTag === tag ? '' : tag
    })
  },

  // 选择堡垒名称（单选标签）
  onFortressSelect: function (e) {
    const fortress = e.currentTarget.dataset.fortress
    this.setData({
      selectedFortress: this.data.selectedFortress === fortress ? '' : fortress
    })
  },

  // 添加时间段
  addTimeSlot: async function () {
    try {
      if (!this.data.selectedAlliance) {
        util.showInfo('请先选择联盟')
        return
      }

      util.showLoading('正在添加...')

      const allianceId = this.data.selectedAlliance._id
      const zoneId = this.data.selectedZone._id
      const timeValue = this.data.selectedTime.value
      const date = this.data.selectedDate
      const tag = this.data.selectedTag
      const fortress = this.data.selectedFortress

      const maxIndex = await db.getMaxSlotIndex(allianceId, timeValue)
      const newSlotIndex = maxIndex + 1

      await db.createTimeSlot(zoneId, allianceId, timeValue, newSlotIndex, date, tag, fortress)

      util.hideLoading()
      util.showSuccess('添加成功')

      const addZoneId = this.data.selectedZone ? this.data.selectedZone._id : null
      if (addZoneId) {
        cache.invalidate('cfg_fortress_zone_' + addZoneId)
        cache.invalidate('fortress_slots_')
      }
      this.setData({ selectedTag: '', selectedFortress: '' })
      this.loadTimeSlots()
    } catch (err) {
      util.hideLoading()
      console.error('添加失败:', err)
      util.showError('添加失败')
    }
  },

  // 编辑标签
  editTag: function (e) {
    const index = e.currentTarget.dataset.index
    const timeSlots = this.data.timeSlots
    timeSlots[index].editing = true
    timeSlots[index].editTag = timeSlots[index].tag || ''
    timeSlots[index].editFortress = timeSlots[index].fortress || ''
    this.setData({ timeSlots })
  },

  // 选择编辑标签
  onEditTagSelect: function (e) {
    const slotIndex = e.currentTarget.dataset.slotIndex
    const tag = e.currentTarget.dataset.tag
    const timeSlots = this.data.timeSlots
    timeSlots[slotIndex].editTag = timeSlots[slotIndex].editTag === tag ? '' : tag
    this.setData({ timeSlots })
  },

  // 选择编辑堡垒名称（单选标签）
  onEditFortressSelect: function (e) {
    const slotIndex = parseInt(e.currentTarget.dataset.slotIndex)
    const fortress = e.currentTarget.dataset.fortress
    const timeSlots = this.data.timeSlots
    timeSlots[slotIndex].editFortress = timeSlots[slotIndex].editFortress === fortress ? '' : fortress
    this.setData({ timeSlots })
  },

  // 保存标签
  saveTag: async function (e) {
    const timeSlotId = e.currentTarget.dataset.id
    const index = e.currentTarget.dataset.index
    const tag = this.data.timeSlots[index].editTag
    const fortress = this.data.timeSlots[index].editFortress || ''

    try {
      util.showLoading('正在保存...')
      await db.updateTimeSlotTagViaCloud(timeSlotId, tag, fortress)

      const timeSlots = this.data.timeSlots
      timeSlots[index].tag = tag
      timeSlots[index].fortress = fortress
      timeSlots[index].editing = false

      this.setData({ timeSlots })
      util.hideLoading()
      util.showSuccess('保存成功')
    } catch (err) {
      util.hideLoading()
      util.showError('保存失败')
    }
  },

  // 取消编辑标签
  cancelEditTag: function (e) {
    const index = e.currentTarget.dataset.index
    const timeSlots = this.data.timeSlots
    timeSlots[index].editing = false
    this.setData({ timeSlots })
  },

  // 删除时间段
  deleteTimeSlot: async function (e) {
    const timeSlotId = e.currentTarget.dataset.id
    const index = e.currentTarget.dataset.index

    const confirm = await util.showConfirm('确认删除', '确定要删除这个时间段吗？相关的报名记录也会被删除。')
    if (!confirm) return

    try {
      util.showLoading('正在删除...')
      await db.deleteTimeSlotViaCloud(timeSlotId)

      const timeSlots = this.data.timeSlots.filter((_, i) => i !== index)

      this.setData({ timeSlots })
      util.hideLoading()
      util.showSuccess('删除成功')
      const delZoneId = this.data.selectedZone ? this.data.selectedZone._id : null
      if (delZoneId) {
        cache.invalidate('cfg_fortress_zone_' + delZoneId)
        cache.invalidate('fortress_slots_')
      }
    } catch (err) {
      util.hideLoading()
      util.showError('删除失败')
    }
  },

  // 全选/取消全选
  onSelectAll: function () {
    const checked = !this.data.selectAllChecked
    const timeSlots = this.data.timeSlots.map(slot => ({
      ...slot,
      selected: checked
    }))
    const selectedSlots = checked ? timeSlots.map(s => s._id) : []

    this.setData({
      timeSlots,
      selectAllChecked: checked,
      selectedSlots
    })
  },

  // 单个选择变化
  onSlotCheckChange: function (e) {
    const index = e.currentTarget.dataset.index
    const value = e.detail.value
    const selected = value.length > 0

    const timeSlots = this.data.timeSlots
    timeSlots[index].selected = selected

    const selectedSlots = timeSlots.filter(s => s.selected).map(s => s._id)
    const selectAllChecked = selectedSlots.length === timeSlots.length

    this.setData({
      timeSlots,
      selectedSlots,
      selectAllChecked
    })
  },

  // 批量删除
  batchDeleteTimeSlots: async function () {
    const selectedSlots = this.data.selectedSlots

    if (selectedSlots.length === 0) {
      util.showInfo('请先选择要删除的时间段')
      return
    }

    const confirm = await util.showConfirm(
      '确认批量删除',
      `确定要删除选中的 ${selectedSlots.length} 个时间段吗？相关的报名记录也会被删除，此操作不可恢复。`
    )
    if (!confirm) return

    try {
      util.showLoading('正在删除...')
      for (const slotId of selectedSlots) {
        await db.deleteTimeSlotViaCloud(slotId)
      }

      const timeSlots = this.data.timeSlots.filter(s => !s.selected)
      this.setData({
        timeSlots,
        selectedSlots: [],
        selectAllChecked: false
      })

      util.hideLoading()
      util.showSuccess(`成功删除 ${selectedSlots.length} 个时间段`)
    } catch (err) {
      util.hideLoading()
      util.showError('删除失败')
    }
  }
})