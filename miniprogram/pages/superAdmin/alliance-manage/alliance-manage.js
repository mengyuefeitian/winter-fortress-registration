// pages/superAdmin/alliance-manage/alliance-manage.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')

Page({
  data: {
    zones: [],
    zoneIndex: 0,
    selectedZone: null,

    alliances: [],
    auditors: []
  },

  onLoad: function () {
    this.loadZones()
    this.loadAuditors()
  },

  onShow: function () {
    if (this.data.selectedZone) {
      this.loadAlliances(this.data.selectedZone._id)
    }
  },

  // 加载分区列表
  loadZones: async function () {
    try {
      util.showLoading('加载分区...')

      const zones = await db.getAllZones()

      this.setData({
        zones: zones
      })

      if (zones.length > 0) {
        this.setData({
          selectedZone: zones[0]
        })
        this.loadAlliances(zones[0]._id)
      }

      util.hideLoading()

    } catch (err) {
      util.hideLoading()
      util.showError('加载分区失败')
    }
  },

  // 加载联盟列表
  loadAlliances: async function (zoneId) {
    try {
      util.showLoading('加载联盟...')

      const alliances = await db.getAlliancesByZone(zoneId)

      // 为每个联盟添加编辑名称和审计员信息
      const processedAlliances = alliances.map(alliance => ({
        ...alliance,
        editName: alliance.allianceName,
        auditorName: alliance.auditorId ? '已绑定' : '未绑定',
        auditorIndex: 0
      }))

      this.setData({
        alliances: processedAlliances
      })

      util.hideLoading()

    } catch (err) {
      util.hideLoading()
      util.showError('加载联盟失败')
    }
  },

  // 加载审计员列表
  loadAuditors: async function () {
    try {
      const wxdb = wx.cloud.database()
      const res = await wxdb.collection('users').where({
        role: 'auditor'
      }).get()

      // 添加一个"未绑定"选项
      const auditors = [{ nickName: '未绑定', _id: null }, ...res.data]

      this.setData({
        auditors: auditors
      })

    } catch (err) {
      console.error('加载审计员失败', err)
    }
  },

  // 分区选择变化
  onZoneChange: function (e) {
    const index = e.detail.value
    const zone = this.data.zones[index]

    this.setData({
      zoneIndex: index,
      selectedZone: zone
    })

    this.loadAlliances(zone._id)
  },

  // 输入联盟名称
  onNameInput: function (e) {
    const index = e.currentTarget.dataset.index
    const value = e.detail.value

    const alliances = this.data.alliances
    alliances[index].editName = value

    this.setData({
      alliances: alliances
    })
  },

  // 保存联盟名称
  saveAllianceName: async function (e) {
    const allianceId = e.currentTarget.dataset.id
    const index = e.currentTarget.dataset.index
    const name = e.currentTarget.dataset.name

    if (!name) {
      util.showInfo('请输入联盟名称')
      return
    }

    try {
      util.showLoading('正在保存...')

      await db.updateAllianceName(allianceId, name)

      // 更新列表显示
      const alliances = this.data.alliances
      alliances[index].allianceName = name
      alliances[index].editName = name

      this.setData({
        alliances: alliances
      })

      util.hideLoading()
      util.showSuccess('保存成功')

    } catch (err) {
      util.hideLoading()
      util.showError('保存失败')
    }
  },

  // 选择审计员
  onAuditorChange: function (e) {
    const allianceIndex = e.currentTarget.dataset.index
    const auditorIndex = parseInt(e.detail.value)
    const auditor = this.data.auditors[auditorIndex]

    const alliances = this.data.alliances
    alliances[allianceIndex].auditorIndex = auditorIndex
    alliances[allianceIndex].auditorName = auditor._id ? auditor.nickName : '未绑定'

    this.setData({
      alliances: alliances
    })
  },

  // 绑定审计员
  bindAuditor: async function (e) {
    const allianceId = e.currentTarget.dataset.id
    const index = e.currentTarget.dataset.index
    const auditorIndex = e.currentTarget.dataset.auditorindex
    const auditor = this.data.auditors[auditorIndex]

    try {
      util.showLoading('正在绑定...')

      await db.bindAuditor(allianceId, auditor._id)

      // 如果绑定了审计员，更新用户角色
      if (auditor._id) {
        await db.updateUserRole(auditor._id, 'auditor')
      }

      // 更新显示
      const alliances = this.data.alliances
      alliances[index].auditorId = auditor._id

      this.setData({
        alliances: alliances
      })

      util.hideLoading()
      util.showSuccess('绑定成功')

    } catch (err) {
      util.hideLoading()
      util.showError('绑定失败')
    }
  }
})