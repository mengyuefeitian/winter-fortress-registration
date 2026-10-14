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

    // 用于判断「邮件已发出、但库里没写进去」——只有这种情况才补发告警邮件
    let mailSent = false
    let wrote = false

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

      // ① 先发邮件通知超管（无论后续写库是否成功，超管都能第一时间看到申请）
      sendApplyEmail({
        applyType: 'zoneManager',
        nickName: app.globalData.userInfo ? app.globalData.userInfo.nickName : '',
        phone: phone,
        zoneName: this.data.selectedZone.zoneName
      })
      mailSent = true

      // ② 再创建区管申请（写库）。顺序不要调换：写库若静默失败，
      //    至少邮件已经到达超管，catch 里还会补发一封入库失败告警。
      await db.createAdminApplication(userId, phone, 'zoneManager', extraData)
      wrote = true

      util.hideLoading()
      util.showSuccess('申请已提交，等待审核')

      // 延迟返回首页
      setTimeout(() => {
        wx.switchTab({ url: '/pages/index/index' })
      }, 1500)

    } catch (err) {
      util.hideLoading()
      // 邮件已发出但申请没写进 admins：补发告警，避免超管「收到邮件却在审核列表里找不到」
      if (mailSent && !wrote) {
        const zoneN = (this.data.selectedZone && this.data.selectedZone.zoneName) || ''
        try {
          wx.cloud.callFunction({
            name: 'sendApplyEmail',
            data: {
              alert: true,
              subject: '[冬日堡垒][⚠️入库失败] 区管申请未写入数据库',
              html: '<h2 style="color:#c0392b">⚠️ 区管申请：邮件已发送，但数据库写入失败</h2>' +
                '<p>该申请<strong>没有</strong>进入 admins 集合，超管在「管理员审核」中<strong>看不到</strong>这条申请。</p>' +
                `<p><strong>手机号：</strong>${phone || '未提供'}</p>` +
                `<p><strong>分区：</strong>${zoneN}</p>` +
                `<p><strong>用户 openid：</strong>${app.globalData.openid || ''}</p>` +
                `<p><strong>失败原因：</strong>${(err && err.message) || '未知'}</p>`
            }
          })
        } catch (e) {
          console.error('[apply-zone-manager] 入库失败告警发送异常:', e)
        }
        util.showErrorLong('申请已通知管理员，但系统记录写入失败，请联系管理员处理')
        return
      }
      util.showError('申请失败：' + (err.message || '未知错误'))
    } finally {
      this.setData({ submitting: false })
    }
  }
})
