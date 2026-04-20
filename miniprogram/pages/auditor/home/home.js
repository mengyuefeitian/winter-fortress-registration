const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')

Page({
  data: {
    userInfo: null,
    isSuperAdmin: false,
    myAlliance: null,
    zones: [],
    zoneIndex: 0,
    selectedZone: null,
    alliances: [],
    allianceIndex: 0,
    selectedAlliance: null
  },

  onLoad: function () {
    this.loadUserInfo()
    this.setData({
      isSuperAdmin: app.globalData.role === 'superAdmin'
    })

    if (app.globalData.role === 'superAdmin') {
      this.loadZones()
    } else {
      this.loadMyAlliance()
    }
  },

  onShow: function () {
    this.loadUserInfo()
    this.setData({
      isSuperAdmin: app.globalData.role === 'superAdmin'
    })
  },

  loadUserInfo: function () {
    const userInfo = app.globalData.userInfo
    this.setData({
      userInfo: userInfo
    })
  },

  loadZones: async function () {
    try {
      const zones = await db.getAllZones()
      this.setData({ zones: zones })

      if (zones.length > 0) {
        this.setData({
          selectedZone: zones[0],
          zoneIndex: 0
        })
        this.loadAlliances(zones[0]._id)
      }
    } catch (err) {
      console.error('加载分区失败:', err)
    }
  },

  loadAlliances: async function (zoneId) {
    try {
      const alliances = await db.getAlliancesByZone(zoneId)
      this.setData({ alliances: alliances })

      if (alliances.length > 0) {
        this.setData({
          selectedAlliance: alliances[0],
          allianceIndex: 0
        })
      }
    } catch (err) {
      console.error('加载联盟失败:', err)
    }
  },

  onZoneChange: function (e) {
    const index = e.detail.value
    const zone = this.data.zones[index]

    this.setData({
      zoneIndex: index,
      selectedZone: zone,
      selectedAlliance: null
    })

    this.loadAlliances(zone._id)
  },

  onAllianceChange: function (e) {
    const index = e.detail.value
    const alliance = this.data.alliances[index]

    this.setData({
      allianceIndex: index,
      selectedAlliance: alliance
    })
  },

  loadMyAlliance: async function () {
    try {
      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

      const wxdb = wx.cloud.database()
      const res = await wxdb.collection('alliances').where({
        auditorId: userId
      }).get()

      if (res.data.length > 0) {
        const alliance = res.data[0]
        const zoneRes = await wxdb.collection('zones').doc(alliance.zoneId).get()

        this.setData({
          myAlliance: {
            ...alliance,
            zoneName: zoneRes.data ? zoneRes.data.zoneName : '未知分区'
          }
        })
      }
    } catch (err) {
      console.error('加载联盟信息失败:', err)
    }
  },

  goToConfig: function () {
    if (this.data.isSuperAdmin) {
      if (!this.data.selectedAlliance) {
        util.showInfo('请先选择联盟')
        return
      }
      wx.navigateTo({
        url: '/pages/auditor/config/config?allianceId=' + this.data.selectedAlliance._id
      })
    } else {
      if (!this.data.myAlliance) {
        util.showInfo('您还未绑定联盟')
        return
      }
      wx.navigateTo({
        url: '/pages/auditor/config/config?allianceId=' + this.data.myAlliance._id
      })
    }
  },

  goToStatistics: function () {
    if (this.data.isSuperAdmin) {
      if (!this.data.selectedAlliance) {
        util.showInfo('请先选择联盟')
        return
      }
      wx.navigateTo({
        url: '/pages/auditor/statistics/statistics?allianceId=' + this.data.selectedAlliance._id
      })
    } else {
      if (!this.data.myAlliance) {
        util.showInfo('您还未绑定联盟')
        return
      }
      wx.navigateTo({
        url: '/pages/auditor/statistics/statistics?allianceId=' + this.data.myAlliance._id
      })
    }
  },

  goToClearData: function () {
    const allianceId = this.data.isSuperAdmin
      ? (this.data.selectedAlliance ? this.data.selectedAlliance._id : null)
      : (this.data.myAlliance ? this.data.myAlliance._id : null)

    if (!allianceId) {
      util.showInfo('请先选择联盟')
      return
    }

    wx.showModal({
      title: '确认清空',
      content: '确定要清空该联盟的报名数据吗？此操作不可恢复！',
      confirmColor: '#e94560',
      success: async (res) => {
        if (res.confirm) {
          try {
            util.showLoading('正在清空...')
            await wx.cloud.callFunction({
              name: 'clearRegistrations',
              data: { allianceId: allianceId }
            })
            util.hideLoading()
            util.showSuccess('清空成功')
          } catch (err) {
            util.hideLoading()
            util.showError('清空失败')
          }
        }
      }
    })
  }
})