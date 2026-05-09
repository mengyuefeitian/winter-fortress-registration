// pages/superAdmin/alliance-manage/alliance-manage.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')
const auth = require('../../../utils/auth')

Page({
  data: {
    zones: [],
    selectedZone: null,

    alliances: [],
    auditors: [],
    phoneInputAllianceIndex: -1,
    phoneInputValue: ''
  },

  onLoad: function () {
    this.waitForRoleReady()
  },

  onShow: function () {
    if (app.globalData.roleReady && this.data.selectedZone) {
      this.loadAlliances(this.data.selectedZone._id)
      this.loadAuditors()
    }
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
    if (!auth.isSuperAdmin(role)) {
      util.showError('权限不足')
      wx.switchTab({
        url: '/pages/index/index'
      })
      return
    }
    this.loadZones()
    this.loadAuditors()
  },

  // 加载分区列表
  loadZones: async function () {
    try {
      util.showLoading('加载分区...')

      const zones = await db.getAllZones()

      this.setData({
        zones: zones
      })

      if (zones.length > 0) {
        // 优先读取全局分区
        let selectedZone = zones[0]

        if (app.globalData.currentZone) {
          const foundIndex = zones.findIndex(z => z._id === app.globalData.currentZone._id)
          if (foundIndex >= 0) {
            selectedZone = zones[foundIndex]
          }
        }

        this.setData({ selectedZone: selectedZone })
        this.loadAlliances(selectedZone._id)
      }

      util.hideLoading()

    } catch (err) {
      util.hideLoading()
      util.showError('加载分区失败')
    }
  },

  // 加载联盟列表
  loadAlliances: async function (zoneId) {
    try {
      const alliances = await db.getAlliancesByZone(zoneId)

      const processedAlliances = alliances.map(alliance => ({
        ...alliance,
        editName: alliance.allianceName,
        auditorNames: [],
        showAddAuditor: false,
        showPhoneInput: false,
        auditorPickerIndex: 0
      }))

      // 批量查询所有盟管信息（一次查询，收集所有 auditorIds）
      const allAuditorIds = new Set()
      for (const alliance of processedAlliances) {
        const auditorIds = alliance.auditorIds || []
        for (const id of auditorIds) {
          allAuditorIds.add(id)
        }
      }

      let auditorMap = {}
      if (allAuditorIds.size > 0) {
        const wxdb = wx.cloud.database()
        const auditorsRes = await wxdb.collection('users').where({
          _id: wxdb.command.in([...allAuditorIds])
        }).get()
        for (const user of auditorsRes.data) {
          auditorMap[user._id] = user.nickName || '未知'
        }
      }

      // 填充盟管名称
      for (const alliance of processedAlliances) {
        const auditorIds = alliance.auditorIds || []
        alliance.auditorNames = auditorIds.map(id => ({ _id: id, nickName: auditorMap[id] || '未知' }))
      }

      this.setData({
        alliances: processedAlliances
      })

    } catch (err) {
      console.error('加载联盟失败:', err)
      util.showError('加载联盟失败')
    }
  },

  // 加载盟管列表
  loadAuditors: async function () {
    try {
      const wxdb = wx.cloud.database()
      const res = await wxdb.collection('users').where({
        role: 'auditor'
      }).get()

      const auditors = [{ nickName: '未绑定', _id: null }, ...res.data]

      this.setData({
        auditors: auditors
      })

    } catch (err) {
      console.error('加载盟管失败', err)
    }
  },

  // 分区选择变化（由组件内部处理全局状态同步）
  onZoneChange: function (e) {
    const zone = e.detail.zone
    if (!zone) return

    this.setData({
      selectedZone: zone
    })

    this.loadAlliances(zone._id)
  },

  // 输入联盟名称
  onNameInput: function (e) {
    const index = e.currentTarget.dataset.index
    const value = e.detail.value

    const alliances = this.data.alliances
    alliances[index].editName = value

    this.setData({
      alliances: alliances
    })
  },

  // 保存联盟名称
  saveAllianceName: async function (e) {
    const allianceId = e.currentTarget.dataset.id
    const index = e.currentTarget.dataset.index
    const name = e.currentTarget.dataset.name

    if (!name) {
      util.showInfo('请输入联盟名称')
      return
    }

    try {
      util.showLoading('正在保存...')

      await db.updateAllianceName(allianceId, name)

      const alliances = this.data.alliances
      alliances[index].allianceName = name
      alliances[index].editName = name

      this.setData({
        alliances: alliances
      })

      util.hideLoading()
      util.showSuccess('保存成功')

    } catch (err) {
      util.hideLoading()
      util.showError('保存失败')
    }
  },

  // 显示添加盟管选择器
  showAddAuditorPicker: function (e) {
    const index = e.currentTarget.dataset.index
    const alliances = this.data.alliances
    alliances[index].showAddAuditor = true
    alliances[index].showPhoneInput = false
    alliances[index].auditorPickerIndex = 0
    this.setData({ alliances })
  },

  // 取消添加盟管
  cancelAddAuditor: function (e) {
    const index = e.currentTarget.dataset.index
    const alliances = this.data.alliances
    alliances[index].showAddAuditor = false
    alliances[index].showPhoneInput = false
    this.setData({ alliances })
  },

  // 盟管选择变化
  onAuditorPickerChange: function (e) {
    const allianceIndex = e.currentTarget.dataset.index
    const auditorIndex = parseInt(e.detail.value)
    const alliances = this.data.alliances
    alliances[allianceIndex].auditorPickerIndex = auditorIndex
    this.setData({ alliances })
  },

  // 确认添加盟管
  confirmAddAuditor: async function (e) {
    const allianceIndex = e.currentTarget.dataset.index
    const alliance = this.data.alliances[allianceIndex]
    const auditorIndex = alliance.auditorPickerIndex || 0
    const auditor = this.data.auditors[auditorIndex]

    if (!auditor._id) {
      util.showInfo('请选择盟管')
      return
    }

    const existingIds = alliance.auditorIds || []
    if (existingIds.includes(auditor._id)) {
      util.showInfo('该盟管已绑定此联盟')
      return
    }

    try {
      util.showLoading('正在绑定...')
      await db.bindAllianceAuditors(alliance._id, auditor._id)

      // 如果用户不是盟管及以上角色，升级为盟管
      if (auditor.role && auditor.role !== 'auditor' && auditor.role !== 'admin' && auditor.role !== 'superAdmin') {
        await db.updateUserRole(auditor._id, 'auditor')
      }

      const alliances = this.data.alliances
      if (!alliances[allianceIndex].auditorIds) {
        alliances[allianceIndex].auditorIds = []
      }
      alliances[allianceIndex].auditorIds.push(auditor._id)
      if (!alliances[allianceIndex].auditorNames) {
        alliances[allianceIndex].auditorNames = []
      }
      alliances[allianceIndex].auditorNames.push({ _id: auditor._id, nickName: auditor.nickName })
      alliances[allianceIndex].showAddAuditor = false

      this.setData({ alliances })
      this.loadAuditors()
      util.hideLoading()
      util.showSuccess('绑定成功')

    } catch (err) {
      util.hideLoading()
      util.showError('绑定失败: ' + (err.message || '未知错误'))
    }
  },

  // 显示手机号添加盟管
  showAddAuditorByPhone: function (e) {
    const index = e.currentTarget.dataset.index
    const alliances = this.data.alliances
    alliances[index].showAddAuditor = false
    alliances[index].showPhoneInput = true
    this.setData({
      alliances,
      phoneInputAllianceIndex: index,
      phoneInputValue: ''
    })
  },

  // 取消手机号输入
  cancelPhoneInput: function (e) {
    const index = this.data.phoneInputAllianceIndex
    const alliances = this.data.alliances
    if (index >= 0 && alliances[index]) {
      alliances[index].showPhoneInput = false
    }
    this.setData({
      alliances,
      phoneInputAllianceIndex: -1,
      phoneInputValue: ''
    })
  },

  // 手机号输入
  onPhoneInput: function (e) {
    this.setData({ phoneInputValue: e.detail.value })
  },

  // 确认手机号绑定
  confirmBindByPhone: async function () {
    const phone = this.data.phoneInputValue.trim()
    if (!util.validatePhone(phone)) {
      util.showInfo('请输入正确的手机号')
      return
    }

    const allianceIndex = this.data.phoneInputAllianceIndex
    const alliance = this.data.alliances[allianceIndex]

    if (!alliance) {
      util.showError('联盟信息异常')
      return
    }

    try {
      util.showLoading('正在查找用户...')

      const user = await db.getUserByPhone(phone)
      if (!user) {
        util.hideLoading()
        util.showInfo('未找到该手机号对应的注册用户')
        return
      }

      const existingIds = alliance.auditorIds || []
      if (existingIds.includes(user._id)) {
        util.hideLoading()
        util.showInfo('该用户已是此联盟的盟管')
        return
      }

      // 绑定盟管到联盟
      await db.bindAllianceAuditors(alliance._id, user._id)

      // 如果用户不是盟管及以上角色，升级为盟管
      if (user.role !== 'auditor' && user.role !== 'admin' && user.role !== 'superAdmin') {
        await db.updateUserRole(user._id, 'auditor')
      }

      // 更新本地数据
      const alliances = this.data.alliances
      if (!alliances[allianceIndex].auditorIds) {
        alliances[allianceIndex].auditorIds = []
      }
      alliances[allianceIndex].auditorIds.push(user._id)
      if (!alliances[allianceIndex].auditorNames) {
        alliances[allianceIndex].auditorNames = []
      }
      alliances[allianceIndex].auditorNames.push({ _id: user._id, nickName: user.nickName || '未知' })
      alliances[allianceIndex].showPhoneInput = false

      this.setData({
        alliances,
        phoneInputAllianceIndex: -1,
        phoneInputValue: ''
      })

      this.loadAuditors()
      util.hideLoading()
      util.showSuccess('绑定成功')

    } catch (err) {
      util.hideLoading()
      util.showError('绑定失败: ' + (err.message || '未知错误'))
    }
  },

  // 移除盟管
  removeAuditor: async function (e) {
    const allianceIndex = e.currentTarget.dataset.allianceindex
    const auditorId = e.currentTarget.dataset.auditorid
    const alliance = this.data.alliances[allianceIndex]

    const confirm = await util.showConfirm('确认移除', '确定要移除该盟管吗？')
    if (!confirm) return

    try {
      util.showLoading('正在移除...')

      // removeMember 已包含从联盟解绑 + admins记录清理 + 角色重置逻辑
      if (this.data.selectedZone) {
        await db.removeMember(auditorId, 'auditor', this.data.selectedZone._id)
      } else {
        await db.bindAllianceAuditors(alliance._id, auditorId, 'remove')
      }

      // 重新加载联盟列表以反映所有变更
      this.loadAlliances(this.data.selectedZone._id)
      this.loadAuditors()
      util.hideLoading()
      util.showSuccess('已移除')

    } catch (err) {
      util.hideLoading()
      util.showError('移除失败')
    }
  }
})
