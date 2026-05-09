// pages/login/login.js
const app = getApp()
const util = require('../../utils/util')
const db = require('../../utils/db')

Page({
  data: {
    tempAvatarUrl: '',
    tempNickName: '',
    openid: null,
    privacyAgreed: false,
    userInfoLoaded: false
  },

  onLoad: async function () {
    console.log('=== 登录页面 onLoad ===')

    // 先获取 openid（后台静默获取，不涉及用户信息）
    await this.initOpenid()
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

  // 同意协议后，加载用户信息并显示输入区域
  loadUserInfoAfterAgree: async function () {
    // 如果已有用户信息，自动填充
    if (app.globalData.userInfo) {
      this.setData({
        tempAvatarUrl: app.globalData.userInfo.avatarUrl,
        tempNickName: app.globalData.userInfo.nickName,
        userInfoLoaded: true
      })
    } else if (this.data.openid) {
      // 检查该 openid 是否已有用户记录
      await this.checkExistingUser()
      this.setData({ userInfoLoaded: true })
    } else {
      this.setData({ userInfoLoaded: true })
    }
  },

  // 检查是否已有用户记录
  checkExistingUser: async function () {
    if (!this.data.openid) return

    try {
      const existingUser = await db.getUserByOpenid(this.data.openid)
      console.log('检查已有用户记录:', existingUser)

      if (existingUser) {
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

  // 切换隐私协议勾选
  togglePrivacy: async function () {
    const newAgreed = !this.data.privacyAgreed
    this.setData({ privacyAgreed: newAgreed })

    // 用户首次同意协议时，加载用户信息并显示输入区域
    if (newAgreed && !this.data.userInfoLoaded) {
      await this.loadUserInfoAfterAgree()
    }
  },

  // 打开隐私保护指引
  openPrivacyContract: function () {
    if (wx.openPrivacyContract) {
      wx.openPrivacyContract({
        success: () => {
          console.log('打开隐私协议成功')
        },
        fail: err => {
          console.error('打开隐私协议失败:', err)
          wx.showToast({ title: '请在设置中查看隐私协议', icon: 'none' })
        }
      })
    } else {
      wx.showToast({ title: '当前微信版本不支持，请升级微信', icon: 'none' })
    }
  },

  // 打开用户服务协议
  openUserAgreement: function () {
    wx.showModal({
      title: '用户服务协议',
      content: '1. 本小程序为联盟活动报名管理工具，仅用于活动报名及管理。\n\n2. 用户须提供游戏昵称和头像用于身份识别，手机号仅用于管理员身份验证。\n\n3. 用户应遵守活动规则，不得恶意占用报名名额。\n\n4. 管理员应公正履职，不得滥用管理权限。\n\n5. 我们重视您的隐私保护，详细信息请查阅《隐私保护指引》。\n\n6. 本小程序保留对违规用户限制使用的权利。',
      showCancel: false,
      confirmText: '我已知晓'
    })
  },

  // 处理隐私授权同意（resolve 挂起的隐私授权请求）
  resolvePrivacyAuthorization: function () {
    const app = getApp()
    if (app.globalData.privacyResolve) {
      app.globalData.privacyResolve({ event: 'agree' })
      app.globalData.privacyResolve = null
    }
    app.globalData.privacyAuthorized = true
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

    if (!this.data.privacyAgreed) {
      util.showInfo('请先阅读并同意隐私政策和用户协议')
      return
    }

    // 处理挂起的隐私授权请求
    this.resolvePrivacyAuthorization()

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
        // 兼容两种入口：navigateTo 进来的可以返回，reLaunch 进来的用 switchTab
        const pages = getCurrentPages()
        if (pages.length > 1) {
          wx.navigateBack()
        } else {
          wx.switchTab({
            url: '/pages/index/index'
          })
        }
      }, 800)

    } catch (err) {
      console.error('登录失败:', err)
      util.hideLoading()
      util.showError('登录失败: ' + (err.message || '未知错误'))
    }
  }
})
