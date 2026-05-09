// pages/user/battle-registration/battle-registration.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')

Page({
  data: {
    configId: '',
    date: '',
    zoneName: '',
    alliances: [],
    allianceIndex: -1,
    inputNickName: '',
    furnaceLevel: '',
    barracksLevel: '',
    diamonds: '',
    voiceOptions: db.VOICE_OPTIONS,
    voiceIndex: 0,
    positionOptions: db.BATTLE_POSITION_OPTIONS,
    positionIndex: 0,
    loading: false
  },

  onLoad: function (options) {
    // 读取上次填写的昵称
    const lastNickName = wx.getStorageSync('lastBattleNickName') || ''
    this.setData({
      configId: options.configId,
      date: options.date,
      zoneName: options.zoneName || '',
      inputNickName: lastNickName
    })
    this.loadAlliances()
  },

  loadAlliances: async function () {
    try {
      const zone = app.globalData.currentZone
      if (zone) {
        const alliances = await db.getAlliancesByZone(zone._id)
        this.setData({ alliances: alliances || [] })
      }
    } catch (err) {
      console.error('加载联盟失败:', err)
    }
  },

  onAllianceChange: function (e) {
    this.setData({ allianceIndex: parseInt(e.detail.value) })
  },

  onNickNameInput: function (e) {
    this.setData({ inputNickName: e.detail.value })
  },

  onFurnaceInput: function (e) {
    this.setData({ furnaceLevel: e.detail.value })
  },

  onBarracksInput: function (e) {
    this.setData({ barracksLevel: e.detail.value })
  },

  onDiamondsInput: function (e) {
    this.setData({ diamonds: e.detail.value })
  },

  onVoiceChange: function (e) {
    this.setData({ voiceIndex: parseInt(e.detail.value) })
  },

  onPositionChange: function (e) {
    this.setData({ positionIndex: parseInt(e.detail.value) })
  },

  validate: function () {
    const { allianceIndex, alliances, inputNickName, furnaceLevel, barracksLevel, diamonds } = this.data
    if (allianceIndex < 0) {
      util.showError('请选择联盟')
      return false
    }
    if (!inputNickName || inputNickName.trim().length === 0) {
      util.showError('请输入游戏昵称')
      return false
    }
    if (!furnaceLevel || furnaceLevel.trim().length === 0) {
      util.showError('请输入熔炉等级')
      return false
    }
    if (!barracksLevel || barracksLevel.trim().length === 0) {
      util.showError('请输入兵营等级')
      return false
    }
    if (!diamonds || diamonds.trim().length === 0) {
      util.showError('请输入钻石数量')
      return false
    }
    return true
  },

  onSubmit: async function () {
    if (!this.validate()) return

    const { configId, alliances, allianceIndex, inputNickName, furnaceLevel, barracksLevel, diamonds, voiceIndex, positionIndex } = this.data
    const userInfo = app.globalData.userInfo

    try {
      this.setData({ loading: true })
      util.showLoading('提交中...')

      // 保存昵称供下次使用
      wx.setStorageSync('lastBattleNickName', inputNickName.trim())

      const alliance = alliances[allianceIndex]
      const zone = app.globalData.currentZone
      const registrationData = {
        configId,
        zoneId: zone ? zone._id : '',
        userId: userInfo._id,
        nickName: inputNickName.trim(),
        allianceId: alliance._id,
        allianceName: alliance.allianceName,
        furnaceLevel: furnaceLevel.trim(),
        barracksLevel: barracksLevel.trim(),
        diamonds: diamonds.trim(),
        voice: db.VOICE_OPTIONS[voiceIndex],
        position: db.BATTLE_POSITION_OPTIONS[positionIndex]
      }

      await db.createBattleRegistration(registrationData)

      util.hideLoading()
      util.showSuccess('报名成功')
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    } catch (err) {
      util.hideLoading()
      console.error('报名失败:', err)
      if (err.message && err.message.includes('已报名')) {
        util.showError('您已报名该日期的国战')
      } else {
        util.showError('报名失败')
      }
    }
  }
})
