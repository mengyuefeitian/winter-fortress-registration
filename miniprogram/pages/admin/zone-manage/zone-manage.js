// pages/admin/zone-manage/zone-manage.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')

Page({
  data: {
    newZoneCode: '',
    newZoneName: '',
    zones: [],
    isSuperAdmin: false,
    showEditModal: false,
    editZoneId: '',
    editZoneCode: '',
    editZoneName: ''
  },

  onLoad: function () {
    this.setData({
      isSuperAdmin: app.globalData.role === 'superAdmin'
    })
    this.loadZones()
  },

  onShow: function () {
    this.setData({
      isSuperAdmin: app.globalData.role === 'superAdmin'
    })
    this.loadZones()
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
        zones: processedZones,
        isSuperAdmin: role === 'superAdmin'
      })

    } catch (err) {
      console.error('加载分区失败:', err)
    }
  },

  // 输入分区编号
  onZoneCodeInput: function (e) {
    let value = e.detail.value.replace(/\D/g, '')
    value = value.slice(0, 4)
    this.setData({
      newZoneCode: value
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
      let zoneCode = this.data.newZoneCode

      if (!zoneCode || zoneCode.length < 1 || zoneCode.length > 4) {
        util.showInfo('请输入1-4位数字')
        return
      }

      zoneCode = zoneCode.padStart(4, '0')

      if (!util.validateZoneCode(zoneCode)) {
        util.showInfo('分区编号格式不正确，请输入有效数字 (0001-9999)')
        return
      }

      if (!this.data.newZoneName) {
        util.showInfo('请输入分区名称')
        return
      }

      util.showLoading('正在创建...')

      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

      const result = await db.createZone(zoneCode, this.data.newZoneName, userId)
      await db.initAlliances(result._id)

      util.hideLoading()
      util.showSuccess('分区创建成功')

      this.setData({
        newZoneCode: '',
        newZoneName: ''
      })

      this.loadZones()

    } catch (err) {
      util.hideLoading()
      util.showError(err.message || '创建分区失败')
    }
  },

  // 编辑分区
  editZone: function (e) {
    const zone = e.currentTarget.dataset.zone
    this.setData({
      showEditModal: true,
      editZoneId: zone._id,
      editZoneCode: zone.zoneCode,
      editZoneName: zone.zoneName
    })
  },

  // 关闭编辑弹窗
  closeEditModal: function () {
    this.setData({
      showEditModal: false
    })
  },

  // 编辑分区编号输入
  onEditZoneCodeInput: function (e) {
    let value = e.detail.value.replace(/\D/g, '')
    value = value.slice(0, 4)
    this.setData({
      editZoneCode: value
    })
  },

  // 编辑分区名称输入
  onEditZoneNameInput: function (e) {
    this.setData({
      editZoneName: e.detail.value
    })
  },

  // 保存编辑
  saveEditZone: async function () {
    try {
      let zoneCode = this.data.editZoneCode

      if (!zoneCode || zoneCode.length < 1 || zoneCode.length > 4) {
        util.showInfo('请输入1-4位数字')
        return
      }

      zoneCode = zoneCode.padStart(4, '0')

      if (!util.validateZoneCode(zoneCode)) {
        util.showInfo('分区编号格式不正确')
        return
      }

      if (!this.data.editZoneName) {
        util.showInfo('请输入分区名称')
        return
      }

      // 检查分区编号是否重复（排除自己）
      const wxdb = wx.cloud.database()
      const existingRes = await wxdb.collection('zones').where({
        zoneCode: zoneCode,
        status: 'active',
        _id: wxdb.command.neq(this.data.editZoneId)
      }).count()

      if (existingRes.total > 0) {
        util.showInfo('分区编号已存在，请使用其他编号')
        return
      }

      util.showLoading('正在保存...')

      await wxdb.collection('zones').doc(this.data.editZoneId).update({
        data: {
          zoneCode: zoneCode,
          zoneName: this.data.editZoneName,
          updateTime: wxdb.serverDate()
        }
      })

      util.hideLoading()
      util.showSuccess('修改成功')

      this.setData({
        showEditModal: false
      })

      this.loadZones()

    } catch (err) {
      util.hideLoading()
      util.showError('修改失败')
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

      const wxdb = wx.cloud.database()
      await wxdb.collection('zones').doc(zoneId).update({
        data: {
          status: 'inactive',
          updateTime: wxdb.serverDate()
        }
      })

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