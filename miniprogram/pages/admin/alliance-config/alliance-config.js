// pages/admin/alliance-config/alliance-config.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')
const auth = require('../../../utils/auth')
const cache = require('../../../utils/cache')

Page({
  data: {
    zones: [],
    selectedZone: null,

    alliances: [],
    auditors: [],
    phoneInputAllianceIndex: -1,
    phoneInputValue: ''
  },

  onLoad: function (options) {
    this.waitForRoleReady(options)
    this.loadAuditors()
  },

  onShow: function () {
    // 每次显示时重新加载分区和联盟（角色已就绪）
    if (app.globalData.roleReady && this.data.selectedZone) {
      const alcZone = this.data.selectedZone || app.globalData.currentZone
      if (alcZone) {
        const alcCached = cache.get('cfg_alliance_' + alcZone._id)
        if (alcCached) {
          this.setData({ alliances: alcCached.alliances, loading: false })
        }
      }
      this.loadZones()
      this.loadAlliances(this.data.selectedZone._id)
      this.loadAuditors()
    }
  },

  // 等待角色就绪
  waitForRoleReady: function (options) {
    if (app.globalData.roleReady) {
      this.checkPermission(options)
    } else {
      setTimeout(() => {
        this.waitForRoleReady(options)
      }, 100)
    }
  },

  // 检查权限
  checkPermission: function (options) {
    const role = app.globalData.role || 'user'
    if (!auth.isAdminOrAbove(role)) {
      util.showError('权限不足')
      wx.switchTab({
        url: '/pages/index/index'
      })
      return
    }
    if (options && options.zoneId) {
      this.loadZoneById(options.zoneId)
    } else {
      this.loadZones()
    }
  },

  // 加载分区列表
  loadZones: async function () {
    try {
      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid
      const role = app.globalData.role || 'admin'

      // 超级管理员可以看到所有分区，管理员只能看到自己创建的
      let zones
      if (role === 'superAdmin') {
        zones = await db.getAllZones()
      } else {
        zones = await db.getZonesByCreator(userId)
      }

      if (zones && zones.length > 0) {
        // 优先读取全局分区
        let selectedZone = zones[0]

        if (app.globalData.currentZone) {
          const foundIndex = zones.findIndex(z => z._id === app.globalData.currentZone._id)
          if (foundIndex >= 0) {
            selectedZone = zones[foundIndex]
          }
        } else {
          // 尝试本地存储
          const lastZoneId = wx.getStorageSync('lastZoneId')
          if (lastZoneId) {
            const foundIndex = zones.findIndex(z => z._id === lastZoneId)
            if (foundIndex >= 0) {
              selectedZone = zones[foundIndex]
            }
          }
        }

        this.setData({
          zones: zones,
          selectedZone: selectedZone
        })
        this.loadAlliances(selectedZone._id)
      } else {
        this.setData({
          zones: [],
          zoneIndex: 0,
          selectedZone: null,
          alliances: []
        })
      }

    } catch (err) {
      console.error('加载分区失败:', err)
      util.showError('加载分区失败')
    }
  },

  // 根据ID加载分区
  loadZoneById: async function (zoneId) {
    try {
      const wxdb = wx.cloud.database()
      const res = await wxdb.collection('zones').doc(zoneId).get()

      this.setData({
        selectedZone: res.data,
        zones: [res.data]
      })

      this.loadAlliances(zoneId)

    } catch (err) {
      util.showError('加载分区失败')
    }
  },

  // 加载联盟列表
  loadAlliances: async function (zoneId) {
    try {
      const alliances = await db.getAlliancesByZone(zoneId)

      const processedAlliances = (alliances || []).map(alliance => ({
        ...alliance,
        editName: alliance.allianceName,
        auditorNames: [],
        showAddAuditor: false,
        auditorPickerIndex: 0
      }))

      this.setData({
        alliances: processedAlliances
      })

      const alcZoneId = this.data.selectedZone ? this.data.selectedZone._id : null
      if (alcZoneId) {
        cache.set('cfg_alliance_' + alcZoneId, { alliances: processedAlliances }, 30 * 1000)
      }

      // 加载每个联盟的盟管信息
      for (let i = 0; i < processedAlliances.length; i++) {
        const alliance = processedAlliances[i]
        const auditorIds = alliance.auditorIds || []
        if (auditorIds.length > 0) {
          try {
            const wxdb = wx.cloud.database()
            const res = await wxdb.collection('users').where({
              _id: wxdb.command.in(auditorIds)
            }).get()
            const names = res.data.map(u => ({ _id: u._id, nickName: u.nickName || '未知' }))

            const alliances = this.data.alliances
            alliances[i].auditorNames = names
            this.setData({ alliances })
          } catch (err) {
            console.error('获取盟管信息失败:', err)
          }
        }
      }

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

      // 添加一个"未绑定"选项
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

      // 更新列表显示
      const alliances = this.data.alliances
      alliances[index].allianceName = name
      alliances[index].editName = name

      this.setData({
        alliances: alliances
      })

      const alcClearZoneId = this.data.selectedZone ? this.data.selectedZone._id : null
      if (alcClearZoneId) {
        cache.invalidate('cfg_alliance_' + alcClearZoneId)
        cache.invalidate('fortress_alliances_' + alcClearZoneId)
      }
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
      const alcClearZoneId = this.data.selectedZone ? this.data.selectedZone._id : null
      if (alcClearZoneId) {
        cache.invalidate('cfg_alliance_' + alcClearZoneId)
        cache.invalidate('fortress_alliances_' + alcClearZoneId)
      }
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
      const alcClearZoneId = this.data.selectedZone ? this.data.selectedZone._id : null
      if (alcClearZoneId) {
        cache.invalidate('cfg_alliance_' + alcClearZoneId)
        cache.invalidate('fortress_alliances_' + alcClearZoneId)
      }
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

      // removeMember 已包含从联盟解绑 + 角色重置逻辑
      if (this.data.selectedZone) {
        await db.removeMember(auditorId, 'auditor', this.data.selectedZone._id)
      } else {
        await db.bindAllianceAuditors(alliance._id, auditorId, 'remove')
      }

      // 重新加载联盟列表以反映所有变更
      const alcClearZoneId = this.data.selectedZone ? this.data.selectedZone._id : null
      if (alcClearZoneId) {
        cache.invalidate('cfg_alliance_' + alcClearZoneId)
        cache.invalidate('fortress_alliances_' + alcClearZoneId)
      }
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