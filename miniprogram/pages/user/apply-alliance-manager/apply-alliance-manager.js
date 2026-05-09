// pages/user/apply-alliance-manager/apply-alliance-manager.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')

Page({
  data: {
    selectedZone: null,
    alliances: [],
    alliancePickerIndex: 0,
    selectedAlliance: null,
    showAllianceNameInput: false,
    customAllianceName: '',
    phone: '',
    submitting: false
  },

  onLoad: function () {
    this.loadZoneAndAlliances()
  },

  // 加载分区和联盟列表
  loadZoneAndAlliances: async function () {
    try {
      const zone = app.globalData.currentZone
      if (!zone) {
        this.setData({ selectedZone: null })
        return
      }

      this.setData({ selectedZone: zone })

      // 加载该分区的联盟列表
      const alliances = await db.getAlliancesByZone(zone._id)
      this.setData({
        alliances: alliances,
        selectedAlliance: alliances.length > 0 ? alliances[0] : null,
        alliancePickerIndex: 0
      })

      // 检查选中的联盟是否为默认名称
      this.checkAllianceName(this.data.selectedAlliance)
    } catch (err) {
      console.error('加载分区和联盟失败:', err)
    }
  },

  // 检查联盟是否为默认名称（联盟N）
  checkAllianceName: function (alliance) {
    if (!alliance) {
      this.setData({ showAllianceNameInput: false, customAllianceName: '' })
      return
    }
    // 匹配默认名称模式 "联盟1" ~ "联盟12"
    const isDefaultName = /^联盟\d{1,2}$/.test(alliance.allianceName)
    this.setData({
      showAllianceNameInput: isDefaultName,
      customAllianceName: ''
    })
  },

  // 联盟选择变化
  onAllianceChange: function (e) {
    const index = parseInt(e.detail.value)
    const alliance = this.data.alliances[index]
    this.setData({
      alliancePickerIndex: index,
      selectedAlliance: alliance
    })
    this.checkAllianceName(alliance)
  },

  // 联盟名称输入
  onAllianceNameInput: function (e) {
    this.setData({ customAllianceName: e.detail.value })
  },

  // 手机号输入
  onPhoneInput: function (e) {
    this.setData({ phone: e.detail.value })
  },

  // 提交申请
  submitApplication: async function () {
    if (this.data.submitting) return

    // 验证联盟选择
    if (!this.data.selectedAlliance) {
      util.showInfo('请选择联盟')
      return
    }

    // 验证自定义联盟名称（如需填写）
    if (this.data.showAllianceNameInput && !this.data.customAllianceName.trim()) {
      util.showInfo('请输入联盟名称')
      return
    }

    // 验证手机号
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

      // 检查是否已有待审核的盟管申请
      const existingApplications = await db.getUserApplications(userId)
      const pendingApp = existingApplications.find(a => a.applyType === 'allianceManager' && a.status === 'pending')
      if (pendingApp) {
        util.hideLoading()
        util.showInfo('您已有待审核的盟管申请')
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
        zoneName: this.data.selectedZone.zoneName,
        allianceId: this.data.selectedAlliance._id,
        allianceName: this.data.selectedAlliance.allianceName
      }

      // 如果提供了自定义联盟名称，保存到申请记录中
      if (this.data.showAllianceNameInput && this.data.customAllianceName.trim()) {
        extraData.customAllianceName = this.data.customAllianceName.trim()
      }

      // 创建申请
      await db.createAdminApplication(userId, phone, 'allianceManager', extraData)

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
