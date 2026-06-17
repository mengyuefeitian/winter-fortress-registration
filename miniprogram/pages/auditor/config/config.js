// pages/auditor/config/config.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')
const auth = require('../../../utils/auth')
const cache = require('../../../utils/cache')

// 标签选项常量
const TAG_OPTIONS = ['高迁', '生命', '穿透', '加兵', '火晶', '橙碎', '加速', '螺丝', '宠石', '宠箱', '其他']

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
    FORTRESS_OPTIONS: db.FORTRESS_OPTIONS,
    selectedTimeIndex: 0,
    selectedTime: { label: '10点', value: '10:00' },
    selectedTag: '',
    selectedFortress: '',
    selectedDate: '',
    minDate: '',
    maxDate: '',
    allianceId: null,
    zoneId: null,
    timeSlots: [],
    loading: false
  },

  onLoad: function (options) {
    this.initDateRange()
    this.waitForRoleReady(options)
  },

  onShow: function () {
    // 快速路径：若 allianceId 已知（由 onLoad 设置），先渲染缓存
    const audAllianceId = this.data.allianceId
    if (audAllianceId) {
      const audCached = cache.get('cfg_auditor_' + audAllianceId)
      if (audCached) {
        this.setData({ timeSlots: audCached.timeSlots, loading: false })
      }
      this.loadTimeSlots()
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
  waitForRoleReady: function (options) {
    if (app.globalData.roleReady) {
      if (options && options.allianceId) {
        this.setData({
          allianceId: options.allianceId,
          zoneId: options.zoneId || null
        })
        this.verifyAllianceAccess(options.allianceId)
      } else {
        util.showError('缺少联盟参数')
        wx.navigateBack()
      }
    } else {
      setTimeout(() => {
        this.waitForRoleReady(options)
      }, 100)
    }
  },

  // 验证联盟访问权限
  verifyAllianceAccess: async function (allianceId) {
    const role = app.globalData.role || 'user'
    const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

    // 超管和区管可以操作所有联盟
    if (auth.isSuperAdmin(role) || role === 'admin') {
      // 需要先获取联盟信息来获取zoneId
      try {
        const alliance = await db.getAllianceById(allianceId)
        if (alliance) {
          this.setData({
            zoneId: alliance.zoneId
          })
        }
      } catch (err) {
        console.error('获取联盟信息失败:', err)
      }
      this.loadTimeSlots()
      return
    }

    // 监管只能操作自己绑定的联盟
    try {
      const alliance = await db.getAllianceById(allianceId)
      if (!alliance || !((alliance.auditorIds || []).includes(userId) || alliance.auditorId === userId)) {
        util.showError('您没有权限操作该联盟')
        wx.navigateBack()
        return
      }
      this.setData({
        zoneId: alliance.zoneId
      })
      this.loadTimeSlots()
    } catch (err) {
      util.showError('验证权限失败')
      wx.navigateBack()
    }
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
      if (!this.data.allianceId) {
        util.showInfo('缺少联盟信息')
        return
      }

      util.showLoading('正在添加...')

      const allianceId = this.data.allianceId
      const zoneId = this.data.zoneId
      const timeValue = this.data.selectedTime.value
      const date = this.data.selectedDate
      const tag = this.data.selectedTag
      const fortress = this.data.selectedFortress

      // 获取该时间的最大序号
      const maxIndex = await db.getMaxSlotIndex(allianceId, timeValue)
      const newSlotIndex = maxIndex + 1

      // 创建时间段
      await db.createTimeSlot(zoneId, allianceId, timeValue, newSlotIndex, date, tag, fortress)

      util.hideLoading()
      util.showSuccess('添加成功')

      const audAddId = this.data.allianceId
      if (audAddId) {
        cache.invalidate('cfg_auditor_' + audAddId)
        cache.invalidate('fortress_slots_' + audAddId)
      }

      // 重置标签和堡垒名称
      this.setData({
        selectedTag: '',
        selectedFortress: ''
      })

      // 重新加载时间段列表
      this.loadTimeSlots()

    } catch (err) {
      util.hideLoading()
      console.error('添加失败:', err)
      util.showError('添加失败')
    }
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

      this.setData({
        timeSlots: timeSlots
      })

      util.hideLoading()
      util.showSuccess('删除成功')

      const audDelId = this.data.allianceId
      if (audDelId) {
        cache.invalidate('cfg_auditor_' + audDelId)
        cache.invalidate('fortress_slots_' + audDelId)
      }

    } catch (err) {
      util.hideLoading()
      util.showError('删除失败')
    }
  },

  // 加载时间段列表
  loadTimeSlots: async function () {
    try {
      this.setData({ loading: true })

      const timeSlots = await db.getTimeSlotsByAlliance(this.data.allianceId)

      if (timeSlots.length === 0) {
        this.setData({ timeSlots: [], loading: false })
        return
      }

      // 批量查询所有时间段的报名（一次查询，替代 N+1 循环查询）
      const timeSlotIds = timeSlots.map(s => s._id)
      const wxdb = wx.cloud.database()
      let countBySlot = {}

      if (timeSlotIds.length > 0) {
        // 分页获取所有报名记录（一次查询，替代 N+1 循环查询）
        let allRegs = []
        let offset = 0
        const batchSize = 20
        while (true) {
          const res = await wxdb.collection('registrations').where({
            timeSlotId: wxdb.command.in(timeSlotIds),
            status: 'active'
          }).skip(offset).limit(batchSize).get()
          allRegs = allRegs.concat(res.data)
          if (res.data.length < batchSize) break
          offset += batchSize
          if (offset > 500) break
        }

        // 按 timeSlotId 分组计数
        for (const reg of allRegs) {
          countBySlot[reg.timeSlotId] = (countBySlot[reg.timeSlotId] || 0) + 1
        }
      }

      const processedSlots = timeSlots.map(slot => ({
        ...slot,
        currentCount: countBySlot[slot._id] || 0,
        editing: false,
        editTag: slot.tag || '',
        editFortress: slot.fortress || ''
      }))

      this.setData({
        timeSlots: processedSlots,
        loading: false
      })

      const audCacheAllianceId = this.data.allianceId
      if (audCacheAllianceId) {
        cache.set('cfg_auditor_' + audCacheAllianceId, { timeSlots: processedSlots }, 30 * 1000)
      }

    } catch (err) {
      console.error('加载时间段失败:', err)
      this.setData({ loading: false })
      util.showError('加载时间段失败')
    }
  },

  // 编辑标签
  editTag: function (e) {
    const index = e.currentTarget.dataset.index
    const timeSlots = this.data.timeSlots
    timeSlots[index].editing = true
    timeSlots[index].editTag = timeSlots[index].tag || ''
    timeSlots[index].editFortress = timeSlots[index].fortress || ''

    this.setData({
      timeSlots: timeSlots
    })
  },

  // 选择编辑标签
  onEditTagSelect: function (e) {
    const slotIndex = e.currentTarget.dataset.slotIndex
    const tag = e.currentTarget.dataset.tag
    const timeSlots = this.data.timeSlots
    timeSlots[slotIndex].editTag = timeSlots[slotIndex].editTag === tag ? '' : tag

    this.setData({
      timeSlots: timeSlots
    })
  },

  // 选择编辑堡垒名称（单选标签）
  onEditFortressSelect: function (e) {
    const slotIndex = parseInt(e.currentTarget.dataset.slotIndex)
    const fortress = e.currentTarget.dataset.fortress
    const timeSlots = this.data.timeSlots
    timeSlots[slotIndex].editFortress = timeSlots[slotIndex].editFortress === fortress ? '' : fortress
    this.setData({
      timeSlots: timeSlots
    })
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

      // 更新显示
      const timeSlots = this.data.timeSlots
      timeSlots[index].tag = tag
      timeSlots[index].fortress = fortress
      timeSlots[index].editing = false

      this.setData({
        timeSlots: timeSlots
      })

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

    this.setData({
      timeSlots: timeSlots
    })
  }
})