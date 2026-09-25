const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')
const auth = require('../../../utils/auth')

Page({
  data: {
    userInfo: null,
    isSuperAdmin: false,
    isAdmin: false,
    roleDisplayName: '',
    myAlliances: [],
    selectedAllianceIndex: 0,
    zones: [],
    selectedZone: null,
    // 注：此页不再展示分区（分区切换统一在首页，含超管），故无 zoneLabel
    alliances: [],
    allianceIndex: 0,
    selectedAlliance: null,
    adminZoneIndex: 0
  },

  onLoad: function () {
    this.waitForRoleReady()
  },

  onShow: function () {
    if (app.globalData.roleReady) {
      this.loadUserInfo()
      const role = app.globalData.role || 'user'
      this.setData({
        isSuperAdmin: role === 'superAdmin',
        isAdmin: role === 'admin',
        roleDisplayName: auth.getRoleDisplayName(role)
      })
    }
  },

  // 等待角色就绪
  waitForRoleReady: function () {
    if (app.globalData.roleReady) {
      this.checkPermission()
    } else {
      setTimeout(() => {
        this.waitForRoleReady()
      }, 100)
    }
  },

  // 检查权限
  checkPermission: function () {
    const role = app.globalData.role || 'user'
    if (!auth.isAdminOrAbove(role)) {
      util.showError('权限不足')
      wx.switchTab({
        url: '/pages/index/index'
      })
      return
    }
    this.initPage()
  },

  // 初始化页面（角色已就绪）
  initPage: function () {
    const role = app.globalData.role || 'user'
    this.setData({
      isSuperAdmin: role === 'superAdmin',
      isAdmin: role === 'admin',
      roleDisplayName: auth.getRoleDisplayName(role)
    })
    this.loadUserInfo()

    if (role === 'superAdmin') {
      this.loadZones()
    } else if (role === 'admin') {
      this.loadAdminZonesAndAlliances()
    } else {
      this.loadMyAlliances()
    }
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
        // 优先使用全局分区记忆（首页选的当前分区）
        let selectedZone = zones[0]

        if (app.globalData.currentZone) {
          const foundIndex = zones.findIndex(z => z._id === app.globalData.currentZone._id)
          if (foundIndex >= 0) {
            selectedZone = zones[foundIndex]
          }
        } else {
          const lastZoneId = wx.getStorageSync('lastZoneId')
          if (lastZoneId) {
            const foundIndex = zones.findIndex(z => z._id === lastZoneId)
            if (foundIndex >= 0) {
              selectedZone = zones[foundIndex]
            }
          }
        }

        // 如果没匹配到全局/本地分区，回退到第一个并同步状态
        if (selectedZone._id !== (app.globalData.currentZone && app.globalData.currentZone._id)) {
          app.globalData.currentZone = selectedZone
          wx.setStorageSync('lastZoneId', selectedZone._id)
        }

        this.setData({ selectedZone: selectedZone })
        this.loadAlliances(selectedZone._id)
      }
    } catch (err) {
      console.error('加载分区失败:', err)
    }
  },

  // 载入分区联盟，并尽量选回「上次选的联盟」（storage lastAllianceId），避免每次都要重选
  loadAlliances: async function (zoneId) {
    try {
      const alliances = await db.getAlliancesByZone(zoneId)
      this.setData({ alliances: alliances })

      if (alliances.length > 0) {
        let index = 0
        const lastAllianceId = wx.getStorageSync('lastAllianceId')
        if (lastAllianceId) {
          const found = alliances.findIndex(a => a._id === lastAllianceId)
          if (found >= 0) index = found
        }
        this.setData({
          selectedAlliance: alliances[index],
          allianceIndex: index
        })
      }
    } catch (err) {
      console.error('加载联盟失败:', err)
    }
  },

  // 注：本页不再提供分区切换（统一在首页），故原 onZoneChange / onAdminZoneChange 已移除。

  onAllianceChange: function (e) {
    const index = e.detail.value
    const alliance = this.data.alliances[index]

    this.setData({
      allianceIndex: index,
      selectedAlliance: alliance
    })

    // 联盟活跃：记录"最后一次选择的联盟"并立即登记今日活跃
    // （此前这里只 setData，导致所选联盟从未同步给云函数，自动活跃登记不上）
    if (alliance && alliance._id) {
      wx.setStorageSync('lastAllianceId', alliance._id)
      app.markAllianceActive(true)
    }
  },

  // 普通盟管切换绑定的联盟
  onMyAllianceChange: function (e) {
    const index = parseInt(e.detail.value)
    this.setData({
      selectedAllianceIndex: index
    })

    // 联盟活跃：记录"最后一次选择的联盟"并立即登记今日活跃
    const alliance = this.data.myAlliances[index]
    if (alliance && alliance._id) {
      wx.setStorageSync('lastAllianceId', alliance._id)
      app.markAllianceActive(true)
    }
  },

  loadMyAlliances: async function () {
    try {
      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

      const wxdb = wx.cloud.database()
      const res = await wxdb.collection('alliances').where({
        auditorIds: userId
      }).get()

      // 批量查询 zone 信息（一次查询所有 zone）
      const zoneIds = res.data.map(a => a.zoneId).filter(Boolean)
      let zoneMap = {}
      if (zoneIds.length > 0) {
        const uniqueIds = [...new Set(zoneIds)]
        // 分批查询，避免超过20条限制
        let allZones = []
        for (let i = 0; i < uniqueIds.length; i += 10) {
          const batch = uniqueIds.slice(i, i + 10)
          const batchRes = await wxdb.collection('zones').where({
            _id: wxdb.command.in(batch)
          }).limit(10).get()
          allZones = allZones.concat(batchRes.data)
        }
        for (const zone of allZones) {
          zoneMap[zone._id] = zone.zoneName
        }
      }

      const myAlliances = res.data.map(alliance => ({
        ...alliance,
        zoneName: zoneMap[alliance.zoneId] || '未知分区'
      }))

      // 尽量选回上次选的联盟
      let index = 0
      const lastAllianceId = wx.getStorageSync('lastAllianceId')
      if (lastAllianceId) {
        const found = myAlliances.findIndex(a => a._id === lastAllianceId)
        if (found >= 0) index = found
      }

      this.setData({
        myAlliances: myAlliances,
        selectedAllianceIndex: index
      })
    } catch (err) {
      console.error('加载联盟信息失败:', err)
    }
  },

  // 区管加载其分区下的联盟
  loadAdminZonesAndAlliances: async function () {
    try {
      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid
      const zones = await db.getZonesByCreator(userId)

      if (!zones || zones.length === 0) {
        this.setData({ myAlliances: [], zones: [], selectedZone: null })
        return
      }

      let selectedZone = zones[0]
      let adminZoneIndex = 0
      if (app.globalData.currentZone) {
        const foundIndex = zones.findIndex(z => z._id === app.globalData.currentZone._id)
        if (foundIndex >= 0) {
          selectedZone = zones[foundIndex]
          adminZoneIndex = foundIndex
        }
      }

      this.setData({
        zones: zones,
        selectedZone: selectedZone,
        adminZoneIndex: adminZoneIndex
      })

      // 走 db 的联盟缓存（命中即返回，不再每次等云端）
      const list = await db.getAlliancesByZone(selectedZone._id)
      const myAlliances = list.map(a => ({
        ...a,
        zoneName: selectedZone.zoneName
      }))

      // 尽量选回上次选的联盟
      let index = 0
      const lastAllianceId = wx.getStorageSync('lastAllianceId')
      if (lastAllianceId) {
        const found = myAlliances.findIndex(a => a._id === lastAllianceId)
        if (found >= 0) index = found
      }

      this.setData({
        myAlliances: myAlliances,
        selectedAllianceIndex: index
      })
    } catch (err) {
      console.error('加载区管联盟信息失败:', err)
    }
  },

  goToConfig: function () {
    if (this.data.isSuperAdmin) {
      if (!this.data.selectedAlliance) {
        util.showInfo('请先选择联盟')
        return
      }
      wx.navigateTo({
        url: '/pages/auditor/config/config?allianceId=' + this.data.selectedAlliance._id + '&zoneId=' + this.data.selectedZone._id
      })
    } else if (this.data.isAdmin) {
      const alliance = this.data.myAlliances[this.data.selectedAllianceIndex]
      if (!alliance) {
        util.showInfo('请先选择联盟')
        return
      }
      wx.navigateTo({
        url: '/pages/auditor/config/config?allianceId=' + alliance._id + '&zoneId=' + alliance.zoneId
      })
    } else {
      const alliance = this.data.myAlliances[this.data.selectedAllianceIndex]
      if (!alliance) {
        util.showInfo('您还未绑定联盟')
        return
      }
      wx.navigateTo({
        url: '/pages/auditor/config/config?allianceId=' + alliance._id + '&zoneId=' + alliance.zoneId
      })
    }
  },

  goToArsenalConfig: function () {
    if (this.data.isSuperAdmin) {
      if (!this.data.selectedAlliance) {
        util.showInfo('请先选择联盟')
        return
      }
      wx.navigateTo({
        url: '/pages/auditor/arsenal-config/arsenal-config?allianceId=' + this.data.selectedAlliance._id + '&zoneId=' + this.data.selectedZone._id
      })
    } else if (this.data.isAdmin) {
      const alliance = this.data.myAlliances[this.data.selectedAllianceIndex]
      if (!alliance) {
        util.showInfo('请先选择联盟')
        return
      }
      wx.navigateTo({
        url: '/pages/auditor/arsenal-config/arsenal-config?allianceId=' + alliance._id + '&zoneId=' + alliance.zoneId
      })
    } else {
      const alliance = this.data.myAlliances[this.data.selectedAllianceIndex]
      if (!alliance) {
        util.showInfo('您还未绑定联盟')
        return
      }
      wx.navigateTo({
        url: '/pages/auditor/arsenal-config/arsenal-config?allianceId=' + alliance._id + '&zoneId=' + alliance.zoneId
      })
    }
  },

  // 联盟活跃：进入当前选中联盟的成员管理页
  goToAllianceActivity: function () {
    let alliance = null
    if (this.data.isSuperAdmin) {
      alliance = this.data.selectedAlliance
    } else {
      alliance = this.data.myAlliances[this.data.selectedAllianceIndex]
    }
    if (!alliance) {
      util.showInfo(this.data.isSuperAdmin ? '请先选择联盟' : '您还未绑定联盟')
      return
    }
    wx.navigateTo({
      url: '/pages/auditor/alliance-activity/alliance-activity?allianceId=' + alliance._id +
        (alliance.zoneId ? '&zoneId=' + alliance.zoneId : '')
    })
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
    } else if (this.data.isAdmin) {
      const alliance = this.data.myAlliances[this.data.selectedAllianceIndex]
      if (!alliance) {
        util.showInfo('请先选择联盟')
        return
      }
      wx.navigateTo({
        url: '/pages/auditor/statistics/statistics?allianceId=' + alliance._id
      })
    } else {
      const alliance = this.data.myAlliances[this.data.selectedAllianceIndex]
      if (!alliance) {
        util.showInfo('您还未绑定联盟')
        return
      }
      wx.navigateTo({
        url: '/pages/auditor/statistics/statistics?allianceId=' + alliance._id
      })
    }
  },

  goToClearData: function () {
    let allianceId = null
    if (this.data.isSuperAdmin) {
      allianceId = this.data.selectedAlliance ? this.data.selectedAlliance._id : null
    } else if (this.data.isAdmin) {
      const alliance = this.data.myAlliances[this.data.selectedAllianceIndex]
      allianceId = alliance ? alliance._id : null
    } else {
      const alliance = this.data.myAlliances[this.data.selectedAllianceIndex]
      allianceId = alliance ? alliance._id : null
    }

    if (!allianceId) {
      util.showInfo('请先选择联盟')
      return
    }

    wx.showModal({
      title: '确认清空',
      content: '确定要清空该联盟的过期报名数据吗？此操作不可恢复！',
      confirmColor: '#e94560',
      success: async (res) => {
        if (res.confirm) {
          try {
            util.showLoading('正在清空...')
            const result = await wx.cloud.callFunction({
              name: 'clearRegistrations',
              data: {
                action: 'clearExpiredByAlliance',
                data: { allianceId: allianceId }
              }
            })
            util.hideLoading()
            if (result.result.err) {
              util.showError('清空失败: ' + result.result.err)
            } else {
              util.showSuccess(result.result.message || '清空成功')
            }
          } catch (err) {
            util.hideLoading()
            util.showError('清空失败: ' + err.message)
          }
        }
      }
    })
  },

  // 分享
  onShareAppMessage: function () {
    return {
      title: '盟管控制台 - 无尽冬日堡垒分配',
      path: '/pages/index/index'
    }
  }
})