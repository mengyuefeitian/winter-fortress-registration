// pages/admin/time-slot-config/time-slot-config.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')

Page({
  data: {
    TIME_OPTIONS: [
      { label: '10点', value: '10:00' },
      { label: '12点', value: '12:00' },
      { label: '15点', value: '15:00' },
      { label: '19点30', value: '19:30' },
      { label: '21点', value: '21:00' }
    ],
    selectedTimeIndex: 0,
    selectedTime: { label: '10点', value: '10:00' },
    newRemark: '',

    zones: [],
    zoneIndex: 0,
    selectedZone: null,

    alliances: [],
    allianceIndex: 0,
    selectedAlliance: null,

    timeSlots: []
  },

  onLoad: function () {
    this.loadZones()
  },

  onShow: function () {
    // 每次显示时重新检查
    if (this.data.zones.length === 0) {
      this.loadZones()
    } else if (this.data.selectedAlliance) {
      this.loadTimeSlots()
    }
  },

  // 加载分区列表
  loadZones: async function () {
    try {
      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid
      const role = app.globalData.role

      // 超级管理员可以看到所有分区，管理员只能看到自己创建的
      let zones
      if (role === 'superAdmin') {
        zones = await db.getAllZones()
      } else {
        zones = await db.getZonesByCreator(userId)
      }

      console.log('加载分区:', zones)

      if (zones && zones.length > 0) {
        // 优先读取全局分区
        let selectedZone = zones[0]
        let zoneIndex = 0

        if (app.globalData.currentZone) {
          const foundIndex = zones.findIndex(z => z._id === app.globalData.currentZone._id)
          if (foundIndex >= 0) {
            selectedZone = zones[foundIndex]
            zoneIndex = foundIndex
          }
        } else {
          // 尝试本地存储
          const lastZoneId = wx.getStorageSync('lastZoneId')
          if (lastZoneId) {
            const foundIndex = zones.findIndex(z => z._id === lastZoneId)
            if (foundIndex >= 0) {
              selectedZone = zones[foundIndex]
              zoneIndex = foundIndex
            }
          }
        }

        this.setData({
          zones: zones,
          zoneIndex: zoneIndex,
          selectedZone: selectedZone
        })
        this.loadAlliances(selectedZone._id)
      } else {
        this.setData({
          zones: [],
          zoneIndex: 0,
          selectedZone: null,
          selectedAlliance: null,
          alliances: [],
          timeSlots: []
        })
      }

    } catch (err) {
      console.error('加载分区失败:', err)
      util.showError('加载分区失败')
    }
  },

  // 加载联盟列表
  loadAlliances: async function (zoneId) {
    try {
      const alliances = await db.getAlliancesByZone(zoneId)

      this.setData({
        alliances: alliances || [],
        allianceIndex: 0
      })

      if (alliances && alliances.length > 0) {
        this.setData({
          selectedAlliance: alliances[0]
        })
        this.loadTimeSlots()
      } else {
        this.setData({
          selectedAlliance: null,
          timeSlots: []
        })
      }

    } catch (err) {
      console.error('加载联盟失败:', err)
      util.showError('加载联盟失败')
    }
  },

  // 加载时间段列表
  loadTimeSlots: async function () {
    try {
      if (!this.data.selectedAlliance) return

      const allianceId = this.data.selectedAlliance._id
      const timeSlots = await db.getTimeSlotsByAlliance(allianceId)

      // 添加当前报名人数
      const processedSlots = []
      for (const slot of timeSlots) {
        const count = await db.getRegistrationCount(slot._id)
        processedSlots.push({
          ...slot,
          currentCount: count,
          editing: false,
          editRemark: slot.remark
        })
      }

      this.setData({
        timeSlots: processedSlots
      })

    } catch (err) {
      console.error('加载时间段失败:', err)
      util.showError('加载时间段失败')
    }
  },

  // 分区选择变化
  onZoneChange: function (e) {
    const index = parseInt(e.detail.value)
    const zone = this.data.zones[index]

    this.setData({
      zoneIndex: index,
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

  // 选择基础时间
  onBaseTimeChange: function (e) {
    const index = parseInt(e.detail.value)
    const selectedTime = this.data.TIME_OPTIONS[index]

    this.setData({
      selectedTimeIndex: index,
      selectedTime: selectedTime
    })
  },

  // 输入备注
  onRemarkInput: function (e) {
    this.setData({
      newRemark: e.detail.value
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

      // 获取该时间的最大序号
      const maxIndex = await db.getMaxSlotIndex(allianceId, timeValue)
      const newSlotIndex = maxIndex + 1

      // 创建时间段
      await db.createTimeSlot(zoneId, allianceId, timeValue, newSlotIndex, this.data.newRemark)

      util.hideLoading()
      util.showSuccess('添加成功')

      // 重置备注
      this.setData({
        newRemark: ''
      })

      // 重新加载时间段列表
      this.loadTimeSlots()

    } catch (err) {
      util.hideLoading()
      util.showError('添加失败')
    }
  },

  // 编辑备注
  editRemark: function (e) {
    const index = e.currentTarget.dataset.index
    const timeSlots = this.data.timeSlots
    timeSlots[index].editing = true
    timeSlots[index].editRemark = timeSlots[index].remark

    this.setData({
      timeSlots: timeSlots
    })
  },

  // 输入编辑备注
  onEditRemarkInput: function (e) {
    const index = e.currentTarget.dataset.index
    const timeSlots = this.data.timeSlots
    timeSlots[index].editRemark = e.detail.value

    this.setData({
      timeSlots: timeSlots
    })
  },

  // 保存备注
  saveRemark: async function (e) {
    const timeSlotId = e.currentTarget.dataset.id
    const index = e.currentTarget.dataset.index
    const remark = this.data.timeSlots[index].editRemark

    try {
      util.showLoading('正在保存...')

      await db.updateTimeSlotRemark(timeSlotId, remark)

      // 更新显示
      const timeSlots = this.data.timeSlots
      timeSlots[index].remark = remark
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

  // 取消编辑备注
  cancelEditRemark: function (e) {
    const index = e.currentTarget.dataset.index
    const timeSlots = this.data.timeSlots
    timeSlots[index].editing = false

    this.setData({
      timeSlots: timeSlots
    })
  },

  // 删除时间段
  deleteTimeSlot: async function (e) {
    const timeSlotId = e.currentTarget.dataset.id
    const index = e.currentTarget.dataset.index

    const confirm = await util.showConfirm('确认删除', '确定要删除这个时间段吗？已有的报名记录将被保留。')

    if (!confirm) return

    try {
      util.showLoading('正在删除...')

      await db.deleteTimeSlot(timeSlotId)

      // 从列表中移除
      const timeSlots = this.data.timeSlots
      timeSlots.splice(index, 1)

      this.setData({
        timeSlots: timeSlots
      })

      util.hideLoading()
      util.showSuccess('删除成功')

    } catch (err) {
      util.hideLoading()
      util.showError('删除失败')
    }
  }
})