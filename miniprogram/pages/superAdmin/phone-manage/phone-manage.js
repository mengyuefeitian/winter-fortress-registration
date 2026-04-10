// pages/superAdmin/phone-manage/phone-manage.js
const app = getApp()
const util = require('../../utils/util')
const db = require('../../utils/db')

Page({
  data: {
    newPhone: '',
    superAdmins: []
  },

  onLoad: function () {
    this.loadSuperAdmins()
  },

  onShow: function () {
    this.loadSuperAdmins()
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
          const userRes = await wxdb.collection('users').doc(admin.userId).get()
          nickName = userRes.data ? userRes.data.nickName : null
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

  // 输入手机号
  onPhoneInput: function (e) {
    this.setData({
      newPhone: e.detail.value
    })
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
  }
})