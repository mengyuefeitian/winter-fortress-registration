// pages/user/apply-zone-manager/apply-zone-manager.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')
const { requestSubscribe } = require('../../../utils/notifyConfig')
const { sendApplyEmail } = require('../../../utils/notifyEmail')

Page({
  data: {
    selectedZone: null,
    phone: '',
    submitting: false
  },

  onLoad: function () {
    this.loadZone()
  },

  // 加载当前选择的分区
  loadZone: function () {
    const zone = app.globalData.currentZone
    if (!zone) {
      this.setData({ selectedZone: null })
      return
    }
    this.setData({ selectedZone: zone })
  },

  // 手机号输入
  onPhoneInput: function (e) {
    this.setData({ phone: e.detail.value })
  },

  // 提交申请
  submitApplication: async function () {
    if (this.data.submitting) return

    if (!this.data.selectedZone) {
      util.showInfo('请先在首页选择您的分区')
      return
    }

    if (!this.data.phone) {
      util.showInfo('请输入手机号')
      return
    }

    const phone = this.data.phone.trim()
    if (!util.validatePhone(phone)) {
      util.showInfo('请输入正确的手机号')
      return
    }

    this.setData({ submitting: true })

    // 请求订阅消息授权（用户同意后，审核通过时可收到微信通知）
    // 必须在用户点击事件回调中调用，放在验证之后、提交之前
    var subscribed = await requestSubscribe()

    util.showLoading('正在提交...')

    try {
      const userId = app.globalData.openid
      if (!userId) {
        util.hideLoading()
        util.showInfo('请先登录')
        this.setData({ submitting: false })
        return
      }

      // 检查手机号是否已被其他用户绑定
      const userByPhone = await db.getUserByPhone(phone)
      if (userByPhone && userByPhone.openid !== userId) {
        util.hideLoading()
        util.showError('该手机号已被其他用户绑定')
        this.setData({ submitting: false })
        return
      }

      // 检查是否已有待审核的区管申请
      const existingApplications = await db.getUserApplications(userId)
      const pendingApp = existingApplications.find(a => a.applyType === 'zoneManager' && a.status === 'pending')
      if (pendingApp) {
        util.hideLoading()
        util.showInfo('您已有待审核的区管申请')
        this.setData({ submitting: false })
        return
      }

      // 绑定手机号到当前用户
      const wxdb = wx.cloud.database()
      const userRecord = await db.getUserByOpenid(userId)
      if (userRecord) {
        await wxdb.collection('users').doc(userRecord._id).update({
          data: { phone: phone, updateTime: wxdb.serverDate() }
        })
      }

      // 构建申请额外数据
      const extraData = {
        zoneId: this.data.selectedZone._id,
        zoneName: this.data.selectedZone.zoneName
      }

      // 创建区管申请
      await db.createAdminApplication(userId, phone, 'zoneManager', extraData)

      // 异步发送邮件通知超管（不阻塞）
      sendApplyEmail({
        applyType: 'zoneManager',
        nickName: app.globalData.userInfo ? app.globalData.userInfo.nickName : '',
        phone: phone,
        zoneName: this.data.selectedZone.zoneName
      })

      util.hideLoading()
      util.showSuccess('申请已提交，等待审核')

      // 延迟返回首页
      setTimeout(() => {
        wx.switchTab({ url: '/pages/index/index' })
      }, 1500)

    } catch (err) {
      util.hideLoading()
      util.showError('申请失败：' + (err.message || '未知错误'))
    } finally {
      this.setData({ submitting: false })
    }
  }
})
