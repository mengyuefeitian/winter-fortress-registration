// pages/login/login.js
const app = getApp()
const util = require('../../utils/util')
const db = require('../../utils/db')

Page({
  data: {
    userInfo: null,
    hasPhone: false,
    phone: null
  },

  onLoad: function () {
    // 检查是否已有用户信息
    if (app.globalData.userInfo) {
      this.setData({
        userInfo: app.globalData.userInfo,
        hasPhone: !!app.globalData.phone,
        phone: app.globalData.phone
      })
    }
  },

  // 获取用户信息
  getUserProfile: function () {
    wx.getUserProfile({
      desc: '用于完善用户资料',
      success: (res) => {
        this.setData({
          userInfo: res.userInfo
        })
      },
      fail: (err) => {
        util.showInfo('获取用户信息失败')
      }
    })
  },

  // 获取手机号
  getPhoneNumber: function (e) {
    if (e.detail.errMsg === 'getPhoneNumber:ok') {
      // 需要调用云函数解密手机号
      this.decryptPhoneNumber(e.detail.cloudID || e.detail.encryptedData)
    } else {
      util.showInfo('获取手机号失败')
    }
  },

  // 解密手机号
  decryptPhoneNumber: async function (cloudID) {
    try {
      util.showLoading('正在获取手机号...')

      // 调用云函数解密手机号
      const res = await wx.cloud.callFunction({
        name: 'login',
        data: {
          action: 'getPhone',
          cloudID: cloudID
        }
      })

      if (res.result && res.result.phone) {
        this.setData({
          hasPhone: true,
          phone: res.result.phone
        })
        util.hideLoading()
        util.showSuccess('手机号绑定成功')
      } else {
        util.hideLoading()
        util.showInfo('获取手机号失败')
      }
    } catch (err) {
      util.hideLoading()
      util.showError('获取手机号失败')
    }
  },

  // 完成登录
  completeLogin: async function () {
    try {
      util.showLoading('正在登录...')

      const userInfo = this.data.userInfo
      const phone = this.data.phone

      if (!userInfo) {
        util.hideLoading()
        util.showInfo('请先获取头像昵称')
        return
      }

      // 获取openid
      const loginRes = await wx.cloud.callFunction({
        name: 'login',
        data: {}
      })

      const openid = loginRes.result.openid

      // 创建或更新用户
      const userData = {
        openid: openid,
        nickName: userInfo.nickName,
        avatarUrl: userInfo.avatarUrl,
        phone: phone
      }

      await db.createOrUpdateUser(userData)

      // 检查是否为超管
      if (phone) {
        const isSuperAdmin = await db.isPhoneSuperAdmin(phone)
        if (isSuperAdmin) {
          app.updateRole('superAdmin')
        }
      }

      // 更新全局数据
      app.globalData.userInfo = userData
      app.globalData.openid = openid
      app.globalData.phone = phone

      if (phone && await db.isPhoneSuperAdmin(phone)) {
        app.globalData.role = 'superAdmin'
      }

      util.hideLoading()
      util.showSuccess('登录成功')

      // 返回首页
      setTimeout(() => {
        wx.navigateBack()
      }, 1000)

    } catch (err) {
      util.hideLoading()
      util.showError('登录失败')
    }
  }
})