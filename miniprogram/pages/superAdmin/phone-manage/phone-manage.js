// pages/superAdmin/phone-manage/phone-manage.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')
const auth = require('../../../utils/auth')

const PAGE_SIZE = 20

Page({
  data: {
    newPhone: '',
    superAdmins: [],
    users: [],
    // 分页状态
    usersPage: 0,
    hasMoreUsers: true,
    usersLoading: false,
    usersTotal: 0,
    // 模糊搜索
    searchKeyword: '',
    searchResults: [],
    searchMode: false,
    // 手机号搜索
    userSearchPhone: '',
    searchPhone: '',
    searchResult: null
  },

  onLoad: function () {
    this.waitForRoleReady()
  },

  onShow: function () {
    if (app.globalData.roleReady) {
      this.loadSuperAdmins()
      this.loadUsersWithPhone()
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
    this.loadSuperAdmins()
    this.loadUsersWithPhone()
  },

  // 加载超管列表
  loadSuperAdmins: async function () {
    try {
      util.showLoading('加载超管列表...')

      const wxdb = wx.cloud.database()
      const res = await wxdb.collection('superAdmins').get()

      // 加载绑定的用户信息
      const superAdmins = []
      for (const admin of res.data) {
        let nickName = null
        if (admin.userId) {
          try {
            const userRes = await wxdb.collection('users').where({ openid: admin.userId }).get()
            if (userRes.data && userRes.data.length > 0) {
              nickName = userRes.data[0].nickName
            }
          } catch (err) {
            console.log('获取用户信息失败')
          }
        }
        superAdmins.push({
          ...admin,
          nickName: nickName
        })
      }

      this.setData({
        superAdmins: superAdmins
      })

      util.hideLoading()

    } catch (err) {
      util.hideLoading()
      util.showError('加载超管列表失败')
    }
  },

  // 加载绑定了手机号的用户列表（分页）
  loadUsersWithPhone: async function (loadMore = false) {
    if (this.data.usersLoading) return
    if (loadMore && !this.data.hasMoreUsers) return

    try {
      this.setData({ usersLoading: true })

      const wxdb = wx.cloud.database()
      const _ = wxdb.command

      const page = loadMore ? this.data.usersPage + 1 : 0
      const skip = page * PAGE_SIZE

      // 获取用户列表
      const res = await wxdb.collection('users')
        .where({ phone: _.neq(null) })
        .orderBy('createTime', 'desc')
        .skip(skip)
        .limit(PAGE_SIZE)
        .get()

      // 获取总数
      const countRes = await wxdb.collection('users')
        .where({ phone: _.neq(null) })
        .count()

      const users = loadMore
        ? this.data.users.concat(res.data)
        : res.data

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

  // 加载更多用户
  loadMoreUsers: function () {
    this.loadUsersWithPhone(true)
  },

  // 搜索关键词输入
  onSearchKeywordInput: function (e) {
    this.setData({ searchKeyword: e.detail.value })
  },

  // 执行模糊搜索
  doSearch: async function () {
    const keyword = this.data.searchKeyword.trim()
    if (!keyword) {
      this.setData({
        searchMode: false,
        searchResults: []
      })
      return
    }

    try {
      util.showLoading('搜索中...')

      const wxdb = wx.cloud.database()
      const _ = wxdb.command

      // 构建正则表达式（支持昵称和手机号模糊匹配）
      const regex = wxdb.RegExp({
        regexp: keyword,
        options: 'i'
      })

      const res = await wxdb.collection('users')
        .where(_.or([
          { nickName: regex },
          { phone: regex }
        ]))
        .limit(50)
        .get()

      this.setData({
        searchMode: true,
        searchResults: res.data || []
      })

      util.hideLoading()

      if (res.data.length === 0) {
        util.showInfo('未找到匹配的用户')
      }

    } catch (err) {
      util.hideLoading()
      console.error('搜索失败:', err)
      util.showError('搜索失败')
    }
  },

  // 清空搜索
  clearSearchKeyword: function () {
    this.setData({
      searchKeyword: '',
      searchMode: false,
      searchResults: []
    })
  },

  // 输入手机号
  onPhoneInput: function (e) {
    this.setData({
      newPhone: e.detail.value
    })
  },

  // 搜索用户手机号输入
  onSearchPhoneInput: function (e) {
    this.setData({
      searchPhone: e.detail.value
    })
  },

  // 搜索用户
  onUserSearchInput: function (e) {
    this.setData({
      userSearchPhone: e.detail.value
    })
  },

  // 按手机号查找用户
  searchByPhone: async function () {
    const phone = this.data.searchPhone

    if (!util.validatePhone(phone)) {
      util.showInfo('请输入正确的手机号')
      return
    }

    try {
      util.showLoading('查找中...')

      const user = await db.getUserByPhone(phone)

      if (user) {
        this.setData({
          searchResult: user
        })
        util.hideLoading()
        util.showSuccess('找到用户')
      } else {
        this.setData({
          searchResult: null
        })
        util.hideLoading()
        util.showInfo('未找到绑定该手机号的用户')
      }

    } catch (err) {
      util.hideLoading()
      util.showError('查找失败')
    }
  },

  // 清空搜索结果
  clearSearch: function () {
    this.setData({
      searchResult: null,
      searchPhone: ''
    })
  },

  // 重置搜索到的用户
  resetSearchUser: async function (e) {
    const userId = e.currentTarget.dataset.id
    const user = this.data.searchResult

    const confirm = await util.showConfirm('确认重置', `确定要清空用户 "${user.nickName}" 的手机号绑定吗？\n手机号：${user.phone}\n该用户需要重新登录并绑定手机号。`)

    if (!confirm) return

    try {
      util.showLoading('正在重置...')

      await db.resetUserIdentity(userId)

      util.hideLoading()
      util.showSuccess('重置成功')

      this.setData({
        searchResult: null,
        searchPhone: ''
      })
      this.loadUsersWithPhone()

    } catch (err) {
      util.hideLoading()
      util.showError('重置失败: ' + (err.message || '未知错误'))
    }
  },

  // 添加超管手机号
  addSuperAdminPhone: async function () {
    try {
      if (!util.validatePhone(this.data.newPhone)) {
        util.showInfo('请输入正确的手机号')
        return
      }

      const existing = this.data.superAdmins.find(admin => admin.phone === this.data.newPhone)
      if (existing) {
        util.showInfo('该手机号已是超管')
        return
      }

      util.showLoading('正在添加...')

      const user = await db.getUserByPhone(this.data.newPhone)
      const userId = user ? user._id : null

      await db.addSuperAdmin(this.data.newPhone, userId)

      util.hideLoading()
      util.showSuccess('添加成功')

      this.setData({ newPhone: '' })
      this.loadSuperAdmins()

    } catch (err) {
      util.hideLoading()
      util.showError('添加失败')
    }
  },

  // 删除超管
  deleteSuperAdmin: async function (e) {
    const adminId = e.currentTarget.dataset.id
    const index = e.currentTarget.dataset.index

    const confirm = await util.showConfirm('确认删除', '确定要删除该超级管理员吗？')

    if (!confirm) return

    try {
      util.showLoading('正在删除...')

      const wxdb = wx.cloud.database()
      await wxdb.collection('superAdmins').doc(adminId).remove()

      const superAdmins = this.data.superAdmins.filter((_, i) => i !== index)

      this.setData({ superAdmins: superAdmins })

      util.hideLoading()
      util.showSuccess('删除成功')

    } catch (err) {
      util.hideLoading()
      util.showError('删除失败')
    }
  },

  // 重置用户身份（清空手机号）
  resetUserIdentity: async function (e) {
    const userId = e.currentTarget.dataset.id
    const index = e.currentTarget.dataset.index
    const userList = this.data.searchMode ? this.data.searchResults : this.data.users
    const user = userList[index]

    const confirm = await util.showConfirm('确认重置', `确定要重置用户 "${user.nickName}" 的身份吗？\n这将清空其绑定的手机号 "${user.phone}"，用户需要重新登录并绑定手机号。`)

    if (!confirm) return

    try {
      util.showLoading('正在重置...')

      await db.resetUserIdentity(userId)

      util.hideLoading()
      util.showSuccess('重置成功')

      if (this.data.searchMode) {
        this.doSearch()
      } else {
        this.loadUsersWithPhone()
      }

    } catch (err) {
      util.hideLoading()
      util.showError('重置失败: ' + (err.message || '未知错误'))
    }
  }
})