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
    loading: false,
    initialized: false
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
          if (!alliance.zoneId) {
            util.showError('联盟数据异常，缺少分区信息')
            wx.navigateBack()
            return
          }
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
      if (!this.data.zoneId) {
        util.showInfo('缺少分区信息')
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

      // 确保所有字段都有值，避免 undefined 传给云函数
      if (!this.data.zoneId || this.data.zoneId === 'undefined') {
        util.hideLoading()
        util.showInfo('缺少分区信息，请刷新页面重试')
        return
      }
      if (!this.data.allianceId || this.data.allianceId === 'undefined') {
        util.hideLoading()
        util.showInfo('缺少联盟信息，请刷新页面重试')
        return
      }

      // 添加前预检查：确认当前用户确实在联盟的 auditorIds 中
      const role = app.globalData.role || 'user'
      const userInfo = app.globalData.userInfo
      const userId = userInfo ? userInfo._id : app.globalData.openid
      console.log('[auditor addConfig] 角色:', role, 'userId:', userId)

      // admin 和 superAdmin 不需要验证联盟绑定，直接放行
      if (role !== 'auditor') {
        console.log('[auditor addConfig] 角色非 auditor，直接放行')
      } else {
        // auditor 需要验证联盟绑定
        try {
          const wxdb = wx.cloud.database()
          const allianceRes = await wxdb.collection('alliances').doc(this.data.allianceId).get()
          const auditorIds = allianceRes.data.auditorIds || []
          console.log('[auditor addConfig] 联盟 auditorIds:', JSON.stringify(auditorIds))
          if (!auditorIds.includes(userId)) {
            util.hideLoading()
            util.showError('您未绑定到该联盟，无法添加配置。请联系区管绑定您到此联盟。')
            return
          }
          console.log('[auditor addConfig] 预检查通过')
        } catch (err) {
          console.error('[auditor addConfig] 预检查失败:', err)
          // 预检查失败不阻止，让云函数做最终判断
        }
      }

      const configData = {
        date: this.data.selectedDate,
        timeValue: this.data.selectedTime,
        corps: this.data.selectedCorps,
        zoneId: this.data.zoneId,
        zoneName: this.data.zoneName || '',
        allianceId: this.data.allianceId,
        allianceName: this.data.allianceName || '',
        activityType: this.data.selectedActivityType === '兵工厂' ? 'arsenal' : 'canyon'
      }

      console.log('auditor addConfig configData:', JSON.stringify(configData))

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
      // 显示详细错误信息，帮助诊断
      const errMsg = err.message || err.errMsg || '未知错误'
      util.showError('添加失败: ' + errMsg)
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
