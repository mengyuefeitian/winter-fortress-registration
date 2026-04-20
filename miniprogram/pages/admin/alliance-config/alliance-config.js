// pages/admin/alliance-config/alliance-config.js
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

  onLoad: function (options) {
    if (options.zoneId) {
      this.loadZoneById(options.zoneId)
    } else {
      this.loadZones()
    }
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
      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid
      const role = app.globalData.role

      // 超级管理员可以看到所有分区，管理员只能看到自己创建的
      let zones
      if (role === 'superAdmin') {
        zones = await db.getAllZones()
      } else {
        zones = await db.getZonesByCreator(userId)
      }

      if (zones && zones.length > 0) {
        // 优先读取全局分区
        let selectedZone = zones[0]
        let zoneIndex = 0

        if (app.globalData.currentZone) {
          const foundIndex = zones.findIndex(z => z._id === app.globalData.currentZone._id)
          if (foundIndex >= 0) {
            selectedZone = zones[foundIndex]
            zoneIndex = foundIndex
          }
        } else {
          // 尝试本地存储
          const lastZoneId = wx.getStorageSync('lastZoneId')
          if (lastZoneId) {
            const foundIndex = zones.findIndex(z => z._id === lastZoneId)
            if (foundIndex >= 0) {
              selectedZone = zones[foundIndex]
              zoneIndex = foundIndex
            }
          }
        }

        this.setData({
          zones: zones,
          zoneIndex: zoneIndex,
          selectedZone: selectedZone
        })
        this.loadAlliances(selectedZone._id)
      } else {
        this.setData({
          zones: [],
          zoneIndex: 0,
          selectedZone: null,
          alliances: []
        })
      }

    } catch (err) {
      console.error('加载分区失败:', err)
      util.showError('加载分区失败')
    }
  },

  // 根据ID加载分区
  loadZoneById: async function (zoneId) {
    try {
      const db = wx.cloud.database()
      const res = await db.collection('zones').doc(zoneId).get()

      this.setData({
        selectedZone: res.data,
        zones: [res.data]
      })

      this.loadAlliances(zoneId)

    } catch (err) {
      util.showError('加载分区失败')
    }
  },

  // 加载联盟列表
  loadAlliances: async function (zoneId) {
    try {
      const alliances = await db.getAlliancesByZone(zoneId)

      // 为每个联盟添加编辑名称和审计员信息
      const processedAlliances = (alliances || []).map(alliance => ({
        ...alliance,
        editName: alliance.allianceName,
        auditorName: alliance.auditorId ? '已绑定' : '未绑定',
        auditorIndex: 0
      }))

      this.setData({
        alliances: processedAlliances
      })

    } catch (err) {
      console.error('加载联盟失败:', err)
      util.showError('加载联盟失败')
    }
  },

  // 加载审计员列表
  loadAuditors: async function () {
    try {
      const db = wx.cloud.database()
      const res = await db.collection('users').where({
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
    const index = parseInt(e.detail.value)
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
  onAuditorChange: async function (e) {
    const allianceIndex = e.currentTarget.dataset.index
    const auditorIndex = parseInt(e.detail.value)
    const auditor = this.data.auditors[auditorIndex]

    const alliance = this.data.alliances[allianceIndex]

    try {
      util.showLoading('正在绑定...')

      await db.bindAuditor(alliance._id, auditor._id)

      // 更新显示
      const alliances = this.data.alliances
      alliances[allianceIndex].auditorId = auditor._id
      alliances[allianceIndex].auditorName = auditor._id ? auditor.nickName : '未绑定'
      alliances[allianceIndex].auditorIndex = auditorIndex

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