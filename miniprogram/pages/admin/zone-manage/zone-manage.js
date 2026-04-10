// pages/admin/zone-manage/zone-manage.js
const app = getApp()
const util = require('../../utils/util')
const db = require('../../utils/db')

Page({
  data: {
    newZoneCode: '',
    newZoneName: '',
    zones: []
  },

  onLoad: function () {
    this.loadZones()
  },

  onShow: function () {
    this.loadZones()
  },

  // 加载分区列表
  loadZones: async function () {
    try {
      util.showLoading('加载分区...')

      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

      const zones = await db.getZonesByCreator(userId)

      // 处理时间格式
      const processedZones = zones.map(zone => ({
        ...zone,
        formattedTime: util.formatDate(zone.createTime, 'YYYY-MM-DD')
      }))

      // 加载每个分区的联盟数量
      for (let i = 0; i < processedZones.length; i++) {
        const alliances = await db.getAlliancesByZone(processedZones[i]._id)
        processedZones[i].allianceCount = alliances.length
      }

      this.setData({
        zones: processedZones
      })

      util.hideLoading()

    } catch (err) {
      util.hideLoading()
      util.showError('加载分区失败')
    }
  },

  // 输入分区编号
  onZoneCodeInput: function (e) {
    let value = e.detail.value

    // 格式化为4位数字
    if (value.length > 0) {
      value = value.padStart(4, '0')
    }

    this.setData({
      newZoneCode: value.slice(0, 4)
    })
  },

  // 输入分区名称
  onZoneNameInput: function (e) {
    this.setData({
      newZoneName: e.detail.value
    })
  },

  // 创建分区
  createZone: async function () {
    try {
      // 验证分区编号
      if (!util.validateZoneCode(this.data.newZoneCode)) {
        util.showInfo('分区编号格式不正确，请输入4位数字 (0001-9999)')
        return
      }

      if (!this.data.newZoneName) {
        util.showInfo('请输入分区名称')
        return
      }

      util.showLoading('正在创建...')

      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

      // 创建分区
      const result = await db.createZone(this.data.newZoneCode, this.data.newZoneName, userId)

      // 初始化12个联盟
      await db.initAlliances(result._id)

      util.hideLoading()
      util.showSuccess('分区创建成功')

      // 重置表单
      this.setData({
        newZoneCode: '',
        newZoneName: ''
      })

      // 重新加载分区列表
      this.loadZones()

    } catch (err) {
      util.hideLoading()
      util.showError(err.message || '创建分区失败')
    }
  },

  // 删除分区
  deleteZone: async function (e) {
    const zoneId = e.currentTarget.dataset.id
    const index = e.currentTarget.dataset.index

    const confirm = await util.showConfirm('确认删除', '删除分区将同时删除该分区下的所有联盟和时间段配置，确定要删除吗？')

    if (!confirm) return

    try {
      util.showLoading('正在删除...')

      // 删除分区
      const db = wx.cloud.database()
      await db.collection('zones').doc(zoneId).update({
        data: {
          status: 'inactive',
          updateTime: db.serverDate()
        }
      })

      // 从列表中移除
      const zones = this.data.zones
      zones.splice(index, 1)

      this.setData({
        zones: zones
      })

      util.hideLoading()
      util.showSuccess('删除成功')

    } catch (err) {
      util.hideLoading()
      util.showError('删除失败')
    }
  },

  // 配置联盟
  goToAllianceConfig: function (e) {
    const zone = e.currentTarget.dataset.zone
    app.setCurrentZone(zone)
    wx.navigateTo({
      url: '/pages/admin/alliance-config/alliance-config?zoneId=' + zone._id
    })
  }
})