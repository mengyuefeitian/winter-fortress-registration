// pages/superAdmin/phone-manage/phone-manage.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')

Page({
  data: {
    newPhone: '',
    superAdmins: [],
    users: [],
    userSearchPhone: '',
    searchPhone: '',
    searchResult: null
  },

  onLoad: function () {
    this.loadSuperAdmins()
    this.loadUsersWithPhone()
  },

  onShow: function () {
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
            const userRes = await wxdb.collection('users').doc(admin.userId).get()
            nickName = userRes.data ? userRes.data.nickName : null
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

  // 加载绑定了手机号的用户列表
  loadUsersWithPhone: async function () {
    try {
      const wxdb = wx.cloud.database()
      const res = await wxdb.collection('users').where({
        phone: wxdb.command.neq(null)
      }).get()

      this.setData({
        users: res.data || []
      })

    } catch (err) {
      console.error('加载用户列表失败:', err)
    }
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

    if (!phone || phone.length !== 11) {
      util.showInfo('请输入正确的11位手机号')
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

      // 清空搜索结果并重新加载
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
      // 验证手机号
      if (!util.validatePhone(this.data.newPhone)) {
        util.showInfo('请输入正确的手机号')
        return
      }

      // 检查是否已存在
      const existing = this.data.superAdmins.find(admin => admin.phone === this.data.newPhone)
      if (existing) {
        util.showInfo('该手机号已是超管')
        return
      }

      util.showLoading('正在添加...')

      // 检查是否有对应用户
      const user = await db.getUserByPhone(this.data.newPhone)
      const userId = user ? user._id : null

      // 添加超管
      await db.addSuperAdmin(this.data.newPhone, userId)

      util.hideLoading()
      util.showSuccess('添加成功')

      // 重置输入
      this.setData({
        newPhone: ''
      })

      // 重新加载列表
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

      // 从列表中移除
      const superAdmins = this.data.superAdmins
      superAdmins.splice(index, 1)

      this.setData({
        superAdmins: superAdmins
      })

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
    const user = this.data.users[index]

    const confirm = await util.showConfirm('确认重置', `确定要重置用户 "${user.nickName}" 的身份吗？\n这将清空其绑定的手机号 "${user.phone}"，用户需要重新登录并绑定手机号。`)

    if (!confirm) return

    try {
      util.showLoading('正在重置...')

      await db.resetUserIdentity(userId)

      util.hideLoading()
      util.showSuccess('重置成功')

      // 重新加载用户列表
      this.loadUsersWithPhone()

    } catch (err) {
      util.hideLoading()
      util.showError('重置失败: ' + (err.message || '未知错误'))
    }
  }
})