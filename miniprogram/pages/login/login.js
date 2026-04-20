// pages/login/login.js
const app = getApp()
const util = require('../../utils/util')
const db = require('../../utils/db')

Page({
  data: {
    tempAvatarUrl: '',
    tempNickName: '',
    openid: null
  },

  onLoad: async function () {
    console.log('=== 登录页面 onLoad ===')

    // 先获取 openid
    await this.initOpenid()

    // 如果已有用户信息，显示出来
    if (app.globalData.userInfo) {
      this.setData({
        tempAvatarUrl: app.globalData.userInfo.avatarUrl,
        tempNickName: app.globalData.userInfo.nickName
      })
    } else if (this.data.openid) {
      // 检查该 openid 是否已有用户记录
      await this.checkExistingUser()
    }
  },

  // 初始化 openid
  initOpenid: async function () {
    // 检查是否已有 openid
    if (app.globalData.openid) {
      this.setData({ openid: app.globalData.openid })
      console.log('使用已有的 openid:', app.globalData.openid)
      return true
    }

    // 检查缓存
    const cachedOpenid = wx.getStorageSync('openid')
    if (cachedOpenid) {
      app.globalData.openid = cachedOpenid
      this.setData({ openid: cachedOpenid })
      console.log('使用缓存的 openid:', cachedOpenid)
      return true
    }

    // 调用云函数获取 openid
    try {
      console.log('调用云函数获取 openid...')
      const res = await wx.cloud.callFunction({
        name: 'login'
      })
      console.log('云函数返回:', res)

      if (res.result && res.result.openid) {
        app.globalData.openid = res.result.openid
        wx.setStorageSync('openid', res.result.openid)
        this.setData({ openid: res.result.openid })
        console.log('云函数返回 openid:', res.result.openid)
        return true
      } else {
        console.error('云函数返回格式错误:', res)
        return false
      }
    } catch (err) {
      console.error('获取 openid 失败:', err)
      return false
    }
  },

  // 检查是否已有用户记录
  checkExistingUser: async function () {
    if (!this.data.openid) return

    try {
      const existingUser = await db.getUserByOpenid(this.data.openid)
      console.log('检查已有用户记录:', existingUser)

      if (existingUser) {
        // 已有用户记录，显示信息
        this.setData({
          tempAvatarUrl: existingUser.avatarUrl || '',
          tempNickName: existingUser.nickName || ''
        })

        if (existingUser.phone) {
          console.log('该用户已绑定手机号:', existingUser.phone)
        }
      }
    } catch (err) {
      console.error('检查用户记录失败:', err)
    }
  },

  // 选择头像
  onChooseAvatar: function (e) {
    const { avatarUrl } = e.detail
    console.log('选择头像:', avatarUrl)
    this.setData({ tempAvatarUrl: avatarUrl })
  },

  // 输入昵称中
  onNicknameInputing: function (e) {
    this.setData({ tempNickName: e.detail.value })
  },

  // 使用微信昵称
  onUseWxNicknameInput: function (e) {
    const nickName = e.detail.value
    if (nickName) {
      this.setData({ tempNickName: nickName })
      wx.showToast({
        title: '已使用微信昵称',
        icon: 'success',
        duration: 1500
      })
    }
  },

  // 完成登录
  completeLogin: async function () {
    console.log('=== 点击完成登录 ===')

    const tempAvatarUrl = this.data.tempAvatarUrl
    const tempNickName = this.data.tempNickName

    // 验证必填信息
    if (!tempNickName) {
      util.showInfo('请输入游戏昵称')
      return
    }

    if (!tempAvatarUrl) {
      util.showInfo('请点击选择头像')
      return
    }

    util.showLoading('正在登录...')

    try {
      // 确保 openid 存在
      let openid = this.data.openid

      if (!openid) {
        const success = await this.initOpenid()
        openid = this.data.openid
      }

      if (!openid) {
        util.hideLoading()
        wx.showModal({
          title: '登录失败',
          content: '无法获取用户标识。\n\n可能原因：\n1. 云函数 login 未部署\n2. 云开发环境未初始化\n\n请在开发者工具中右键 cloudfunctions/login 文件夹，选择「上传并部署：云端安装依赖」',
          showCancel: false
        })
        return
      }

      console.log('当前 openid:', openid)

      // 上传头像到云存储（如果是临时文件）
      let avatarUrl = tempAvatarUrl
      if (avatarUrl.startsWith('http://tmp/') || avatarUrl.startsWith('wxfile://')) {
        try {
          const uploadRes = await wx.cloud.uploadFile({
            cloudPath: `avatars/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`,
            filePath: avatarUrl
          })
          avatarUrl = uploadRes.fileID
          console.log('头像上传成功:', avatarUrl)
        } catch (err) {
          console.error('头像上传失败:', err)
        }
      }

      // 检查是否已存在该 openid 的用户记录
      let existingUser = await db.getUserByOpenid(openid)
      console.log('已存在的用户记录:', existingUser)

      // 使用已绑定的手机号（如果有）
      let finalPhone = existingUser && existingUser.phone ? existingUser.phone : null

      // 创建或更新用户
      const userData = {
        openid: openid,
        nickName: tempNickName,
        avatarUrl: avatarUrl,
        phone: finalPhone || null
      }

      await db.createOrUpdateUser(userData)

      // 获取最新的用户记录
      let userRecord = await db.getUserByOpenid(openid)
      console.log('登录后的用户记录:', userRecord)

      // 检查是否为超管
      let role = userRecord ? (userRecord.role || 'user') : 'user'

      if (finalPhone) {
        const wxdb = wx.cloud.database()
        const resStr = await wxdb.collection('superAdmins').where({ phone: finalPhone }).get()
        const resNum = await wxdb.collection('superAdmins').where({ phone: parseInt(finalPhone, 10) }).get()

        if (resStr.data.length > 0 || resNum.data.length > 0) {
          role = 'superAdmin'
          // 更新用户角色
          if (userRecord && userRecord._id) {
            await wxdb.collection('users').doc(userRecord._id).update({
              data: {
                role: 'superAdmin',
                updateTime: wxdb.serverDate()
              }
            })
          }
        }
      }

      // 更新全局数据
      const finalUserInfo = userRecord || {
        openid: openid,
        nickName: tempNickName,
        avatarUrl: avatarUrl,
        phone: finalPhone,
        role: role
      }

      finalUserInfo.nickName = tempNickName
      finalUserInfo.avatarUrl = avatarUrl
      finalUserInfo.phone = finalPhone
      finalUserInfo.role = role

      app.globalData.userInfo = finalUserInfo
      app.globalData.openid = openid
      app.globalData.phone = finalPhone || null
      app.globalData.role = role
      app.globalData.roleReady = true

      // 缓存用户信息
      wx.setStorageSync('userInfo', finalUserInfo)
      wx.setStorageSync('openid', openid)

      console.log('=== 登录完成 ===')
      console.log('用户ID:', finalUserInfo._id)
      console.log('角色:', role)

      util.hideLoading()
      util.showSuccess('登录成功')

      setTimeout(() => {
        wx.navigateBack()
      }, 800)

    } catch (err) {
      console.error('登录失败:', err)
      util.hideLoading()
      util.showError('登录失败: ' + (err.message || '未知错误'))
    }
  }
})