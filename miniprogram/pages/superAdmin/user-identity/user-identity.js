// pages/superAdmin/user-identity/user-identity.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')
const auth = require('../../../utils/auth')

const PAGE_SIZE = 20

Page({
  data: {
    // 分区列表（用于添加区管时的选择）
    zones: [],
    // 用户列表（分页）
    users: [],
    usersPage: 0,
    hasMoreUsers: true,
    usersLoading: false,
    usersTotal: 0,
    // 搜索
    searchKeyword: '',
    searchResults: [],
    searchMode: false,
    // 添加区管
    showAddAdminModal: false,
    addAdminPhone: '',
    addAdminZoneIndex: 0
  },

  onLoad: function () {
    this.waitForRoleReady()
  },

  onShow: function () {
    if (app.globalData.roleReady) {
      this.loadZones()
      this.loadUsersWithZoneInfo()
    }
  },

  waitForRoleReady: function () {
    if (app.globalData.roleReady) {
      this.checkPermission()
    } else {
      setTimeout(() => { this.waitForRoleReady() }, 100)
    }
  },

  checkPermission: function () {
    const role = app.globalData.role || 'user'
    if (!auth.isSuperAdmin(role)) {
      util.showError('权限不足')
      wx.switchTab({ url: '/pages/index/index' })
      return
    }
    this.loadZones()
    this.loadUsersWithZoneInfo()
  },

  // 加载分区列表（用于添加区管时选择）
  loadZones: async function () {
    try {
      const zones = await db.getAllZones()
      this.setData({ zones, zonesLoaded: true })
    } catch (err) {
      console.error('加载分区失败:', err)
    }
  },

  // 加载用户列表（带分区身份信息）- 批量查询优化
  loadUsersWithZoneInfo: async function (loadMore = false) {
    if (this.data.usersLoading) return
    if (loadMore && !this.data.hasMoreUsers) return

    try {
      this.setData({ usersLoading: true })

      const wxdb = wx.cloud.database()
      const _ = wxdb.command
      const page = loadMore ? this.data.usersPage + 1 : 0
      const skip = page * PAGE_SIZE

      // 1. 获取用户列表
      const res = await wxdb.collection('users')
        .orderBy('createTime', 'desc')
        .skip(skip)
        .limit(PAGE_SIZE)
        .get()

      const countRes = await wxdb.collection('users').count()

      // 2. 批量获取所有分区和联盟（一次性查询）
      const allZones = await db.getAllZones()
      const allAlliancesRes = await wxdb.collection('alliances').get()
      const allAlliances = allAlliancesRes.data

      // 3. 在内存中为每个用户计算分区身份（避免N+1查询）
      const usersWithZoneInfo = res.data.map(user => {
        const zoneRoles = []

        // 查找作为区管的分区（支持多区管）
        for (const zone of allZones) {
          const adminIds = zone.adminIds || []
          // 向后兼容：如果 adminIds 为空但有 creatorId
          if (adminIds.length === 0 && zone.creatorId) {
            adminIds.push(zone.creatorId)
          }
          if (adminIds.includes(user._id) || zone.creatorId === user._id) {
            zoneRoles.push({
              zoneId: zone._id,
              zoneName: zone.zoneName,
              role: 'admin'
            })
          }
        }

        // 查找作为盟管的联盟
        for (const alliance of allAlliances) {
          const auditorIds = alliance.auditorIds || []
          if (auditorIds.includes(user._id)) {
            const zone = allZones.find(z => z._id === alliance.zoneId)
            if (zone) {
              const existing = zoneRoles.find(zr => zr.zoneId === zone._id)
              if (!existing) {
                zoneRoles.push({
                  zoneId: zone._id,
                  zoneName: zone.zoneName,
                  role: 'auditor',
                  alliances: [alliance.allianceName]
                })
              } else if (existing.role === 'auditor') {
                existing.alliances.push(alliance.allianceName)
              }
            }
          }
        }

        return { ...user, zoneRoles }
      })

      const users = loadMore
        ? this.data.users.concat(usersWithZoneInfo)
        : usersWithZoneInfo

      this.setData({
        users: users,
        usersPage: page,
        usersTotal: countRes.total,
        hasMoreUsers: res.data.length === PAGE_SIZE,
        usersLoading: false
      })

    } catch (err) {
      console.error('加载用户列表失败:', err)
      this.setData({ usersLoading: false })
    }
  },

  // 获取单个用户分区身份（用于搜索结果的增量查询，支持多区管）
  getUserZoneRoles: async function (userId) {
    const wxdb = wx.cloud.database()
    const _ = wxdb.command

    const zoneRoles = []

    // 查询作为区管的分区（adminIds 包含 userId 或 creatorId 等于 userId）
    const zonesAsAdmin = await wxdb.collection('zones')
      .where(_.or([
        { adminIds: userId },
        { creatorId: userId }
      ]).and({ status: 'active' }))
      .get()

    for (const zone of zonesAsAdmin.data) {
      zoneRoles.push({
        zoneId: zone._id,
        zoneName: zone.zoneName,
        role: 'admin'
      })
    }

    // 查询作为盟管的联盟
    const alliancesAsAuditor = await wxdb.collection('alliances')
      .where({ auditorIds: userId })
      .get()

    for (const alliance of alliancesAsAuditor.data) {
      try {
        const zone = await wxdb.collection('zones').doc(alliance.zoneId).get()
        if (zone && zone.data) {
          const existing = zoneRoles.find(zr => zr.zoneId === zone.data._id)
          if (!existing) {
            zoneRoles.push({
              zoneId: zone.data._id,
              zoneName: zone.data.zoneName,
              role: 'auditor',
              alliances: [alliance.allianceName]
            })
          } else if (existing.role === 'auditor') {
            existing.alliances.push(alliance.allianceName)
          }
        }
      } catch (e) {
        // 分区可能已删除，忽略
      }
    }

    return zoneRoles
  },

  loadMoreUsers: function () {
    this.loadUsersWithZoneInfo(true)
  },

  // 搜索
  onSearchKeywordInput: function (e) {
    this.setData({ searchKeyword: e.detail.value })
  },

  doSearch: async function () {
    const keyword = this.data.searchKeyword.trim()
    if (!keyword) {
      this.setData({ searchMode: false, searchResults: [] })
      return
    }

    try {
      util.showLoading('搜索中...')

      const wxdb = wx.cloud.database()
      const _ = wxdb.command

      const regex = wxdb.RegExp({ regexp: keyword, options: 'i' })

      const res = await wxdb.collection('users')
        .where(_.or([
          { nickName: regex },
          { phone: regex }
        ]))
        .limit(50)
        .get()

      // 为搜索结果添加分区身份
      const searchResults = await Promise.all(
        res.data.map(async (user) => {
          const zoneRoles = await this.getUserZoneRoles(user._id)
          return { ...user, zoneRoles }
        })
      )

      this.setData({ searchMode: true, searchResults })
      util.hideLoading()

      if (searchResults.length === 0) {
        util.showInfo('未找到匹配的用户')
      }

    } catch (err) {
      util.hideLoading()
      console.error('搜索失败:', err)
      util.showError('搜索失败')
    }
  },

  clearSearch: function () {
    this.setData({ searchKeyword: '', searchMode: false, searchResults: [] })
  },

  // 打开添加区管弹窗
  openAddAdminModal: function () {
    if (this.data.zones.length === 0) {
      util.showInfo('暂无分区，请先创建分区')
      return
    }
    this.setData({
      showAddAdminModal: true,
      addAdminZoneIndex: 0,
      addAdminPhone: ''
    })
  },

  closeAddAdminModal: function () {
    this.setData({ showAddAdminModal: false })
  },

  // 阻止事件冒泡（弹窗内容区域点击不关闭）
  stopPropagation: function () {},

  // 分区选择变化
  onAddAdminZoneChange: function (e) {
    this.setData({ addAdminZoneIndex: parseInt(e.detail.value) })
  },

  onAddAdminPhoneInput: function (e) {
    this.setData({ addAdminPhone: e.detail.value })
  },

  // 确认添加区管
  confirmAddAdmin: async function () {
    const phone = this.data.addAdminPhone.trim()
    const zoneIndex = this.data.addAdminZoneIndex
    const zone = this.data.zones[zoneIndex]

    if (!zone) {
      util.showInfo('请选择分区')
      return
    }

    if (!util.validatePhone(phone)) {
      util.showInfo('请输入正确的手机号')
      return
    }

    try {
      util.showLoading('正在添加...')

      const result = await wx.cloud.callFunction({
        name: 'manageUserIdentity',
        data: {
          action: 'addZoneAdmin',
          data: { zoneId: zone._id, zoneName: zone.zoneName, phone }
        }
      })

      if (result.result.err) {
        util.hideLoading()
        util.showError(result.result.err)
        return
      }

      util.hideLoading()
      util.showSuccess(result.result.message || '添加成功')

      this.setData({ showAddAdminModal: false })
      this.loadUsersWithZoneInfo()

    } catch (err) {
      util.hideLoading()
      console.error('添加区管失败:', err)
      util.showError('添加失败: ' + (err.message || '未知错误'))
    }
  },

  // 移除用户身份
  removeUserRole: async function (e) {
    const userId = e.currentTarget.dataset.userid
    const zoneId = e.currentTarget.dataset.zoneid
    const role = e.currentTarget.dataset.role

    const userList = this.data.searchMode ? this.data.searchResults : this.data.users
    const user = userList.find(u => u._id === userId)
    if (!user) return
    const zoneRole = user.zoneRoles.find(zr => zr.zoneId === zoneId)
    if (!zoneRole) return

    const confirm = await util.showConfirm('确认移除',
      `确定要将「${user.nickName}」从「${zoneRole.zoneName}」的${role === 'admin' ? '区管' : '盟管'}身份移除吗？`)

    if (!confirm) return

    try {
      util.showLoading('正在移除...')

      await db.removeMember(userId, role, zoneId)

      util.hideLoading()
      util.showSuccess('已移除')

      if (this.data.searchMode) {
        this.doSearch()
      } else {
        this.loadUsersWithZoneInfo()
      }

    } catch (err) {
      util.hideLoading()
      console.error('移除失败:', err)
      util.showError('移除失败: ' + (err.message || '未知错误'))
    }
  }
})