// pages/auditor/arsenal-config/arsenal-config.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')
const auth = require('../../../utils/auth')

// 活动类型和军团选项常量
const ACTIVITY_TYPE_OPTIONS = ['兵工厂', '峡谷会战']
const CORPS_OPTIONS = ['军团1', '军团2']
// 时间选项
const TIME_OPTIONS = ['12:00', '19:00', '20:30', '22:00']

Page({
  data: {
    TIME_OPTIONS: TIME_OPTIONS,
    ACTIVITY_TYPE_OPTIONS: ACTIVITY_TYPE_OPTIONS,
    CORPS_OPTIONS: CORPS_OPTIONS,
    selectedTimeIndex: 0,
    selectedTime: '12:00',
    selectedActivityType: '',
    selectedCorps: '',
    selectedDate: '',
    minDate: '',
    maxDate: '',
    allianceId: null,
    zoneId: null,
    allianceName: '',
    zoneName: '',
    configs: [],
    loading: false
  },

  onLoad: function (options) {
    this.initDateRange()
    this.waitForRoleReady(options)
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
      try {
        const alliance = await db.getAllianceById(allianceId)
        if (alliance) {
          this.setData({
            zoneId: alliance.zoneId,
            allianceName: alliance.allianceName,
            zoneName: alliance.zoneName || ''
          })
        }
      } catch (err) {
        console.error('获取联盟信息失败:', err)
      }
      this.loadConfigs()
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
        zoneId: alliance.zoneId,
        allianceName: alliance.allianceName,
        zoneName: alliance.zoneName || ''
      })
      this.loadConfigs()
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

  // 时间选择变化
  onTimeChange: function (e) {
    const index = parseInt(e.detail.value)
    this.setData({
      selectedTimeIndex: index,
      selectedTime: this.data.TIME_OPTIONS[index]
    })
  },

  // 选择活动类型
  onActivityTypeSelect: function (e) {
    const type = e.currentTarget.dataset.type
    this.setData({
      selectedActivityType: this.data.selectedActivityType === type ? '' : type
    })
  },

  // 选择军团
  onCorpsSelect: function (e) {
    const corps = e.currentTarget.dataset.corps
    this.setData({
      selectedCorps: this.data.selectedCorps === corps ? '' : corps
    })
  },

  // 添加配置
  addConfig: async function () {
    try {
      if (!this.data.allianceId) {
        util.showInfo('缺少联盟信息')
        return
      }
      if (!this.data.selectedDate) {
        util.showInfo('请选择日期')
        return
      }
      if (!this.data.selectedTime) {
        util.showInfo('请选择时间')
        return
      }
      if (!this.data.selectedActivityType) {
        util.showInfo('请选择活动类型')
        return
      }
      if (!this.data.selectedCorps) {
        util.showInfo('请选择军团')
        return
      }

      util.showLoading('正在添加...')

      const configData = {
        date: this.data.selectedDate,
        timeValue: this.data.selectedTime,
        corps: this.data.selectedCorps,
        zoneId: this.data.zoneId,
        zoneName: this.data.zoneName,
        allianceId: this.data.allianceId,
        allianceName: this.data.allianceName,
        activityType: this.data.selectedActivityType === '兵工厂' ? 'arsenal' : 'canyon'
      }

      if (this.data.selectedActivityType === '兵工厂') {
        await db.createArsenalConfig(configData)
      } else {
        await db.createCanyonConfig(configData)
      }

      util.hideLoading()
      util.showSuccess('添加成功')

      // 重置选择
      this.setData({
        selectedActivityType: '',
        selectedCorps: ''
      })

      // 重新加载配置列表
      this.loadConfigs()

    } catch (err) {
      util.hideLoading()
      console.error('添加失败:', err)
      util.showError('添加失败')
    }
  },

  // 删除配置
  deleteConfig: async function (e) {
    const configId = e.currentTarget.dataset.id
    const index = e.currentTarget.dataset.index

    const confirm = await util.showConfirm('确认删除', '确定要删除这个活动配置吗？')

    if (!confirm) return

    try {
      util.showLoading('正在删除...')

      const config = this.data.configs[index]
      if (config.activityType === 'arsenal') {
        await db.deleteArsenalConfig(configId)
      } else {
        await db.deleteCanyonConfig(configId)
      }

      const configs = this.data.configs.filter((_, i) => i !== index)

      this.setData({
        configs: configs
      })

      util.hideLoading()
      util.showSuccess('删除成功')

    } catch (err) {
      util.hideLoading()
      util.showError('删除失败')
    }
  },

  // 加载配置列表
  loadConfigs: async function () {
    try {
      this.setData({ loading: true })

      const [arsenalConfigs, canyonConfigs] = await Promise.all([
        db.getArsenalConfigs({ allianceId: this.data.allianceId }),
        db.getCanyonConfigs({ allianceId: this.data.allianceId })
      ])

      // 合并并按日期时间排序
      const allConfigs = [...arsenalConfigs, ...canyonConfigs]
        .map(config => ({
          ...config,
          activityTypeLabel: config.activityType === 'arsenal' ? '兵工厂' : '峡谷会战'
        }))
        .sort((a, b) => {
          const dateCompare = (a.date || '').localeCompare(b.date || '')
          if (dateCompare !== 0) return dateCompare
          return (a.timeValue || '').localeCompare(b.timeValue || '')
        })

      this.setData({
        configs: allConfigs,
        loading: false
      })

    } catch (err) {
      console.error('加载配置失败:', err)
      this.setData({ loading: false })
      util.showError('加载配置失败')
    }
  }
})
