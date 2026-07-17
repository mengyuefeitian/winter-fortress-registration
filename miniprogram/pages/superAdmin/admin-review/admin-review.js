// pages/superAdmin/admin-review/admin-review.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')
const auth = require('../../../utils/auth')

Page({
  data: {
    applyType: null, // 筛选类型：zoneManager 或 allianceManager，null 表示全部
    pageTitle: '管理员审核',
    applications: [],
    reviewedApplications: [],
    availableZones: []
  },

  onLoad: function (options) {
    this.waitForRoleReady(options)
  },

  onShow: function () {
    if (app.globalData.roleReady) {
      // 区管审核页面需要确保 availableZones 已加载
      if (this.data.applyType === 'allianceManager' && this.data.availableZones.length === 0) {
        this.loadAvailableZones().then(() => {
          this.loadApplications()
        })
      } else {
        this.loadApplications()
      }
    }
  },

  // 等待角色就绪
  waitForRoleReady: function (options) {
    if (app.globalData.roleReady) {
      this.checkPermission(options)
    } else {
      setTimeout(() => {
        this.waitForRoleReady(options)
      }, 100)
    }
  },

  // 检查权限
  checkPermission: async function (options) {
    const role = app.globalData.role || 'user'
    const applyType = options && options.applyType

    // 区管可以审核盟管申请，但不能审核区管申请
    if (applyType === 'allianceManager') {
      if (!auth.canReviewAllianceManager(role)) {
        util.showError('权限不足')
        wx.switchTab({ url: '/pages/index/index' })
        return
      }
    } else {
      if (!auth.isSuperAdmin(role)) {
        util.showError('权限不足')
        wx.switchTab({ url: '/pages/index/index' })
        return
      }
    }
    // 从URL参数获取筛选类型
    if (options && options.applyType) {
      let pageTitle = '管理员审核'
      if (options.applyType === 'zoneManager') pageTitle = '区管审核'
      else if (options.applyType === 'allianceManager') pageTitle = '盟管审核'
      else if (options.applyType === 'zoneCreation') pageTitle = '分区开通审核'

      this.setData({
        applyType: options.applyType,
        pageTitle: pageTitle
      })
      wx.setNavigationBarTitle({
        title: this.data.pageTitle
      })
    }
    await this.loadAvailableZones()
    this.loadApplications()
  },

  // 加载可用分区列表
  loadAvailableZones: async function () {
    try {
      const role = app.globalData.role || 'user'
      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid
      let zones
      if (role === 'superAdmin') {
        zones = await db.getAllZones()
      } else {
        zones = await db.getZonesByCreator(userId)
      }
      this.setData({ availableZones: zones || [] })
    } catch (err) {
      console.error('加载分区失败:', err)
      this.setData({ availableZones: [] })
    }
  },

  // 加载申请列表
  loadApplications: async function () {
    try {
      util.showLoading('加载申请列表...')

      const wxdb = wx.cloud.database()
      const _ = wxdb.command
      const role = app.globalData.role || 'user'

      // 构建查询条件
      const whereCondition = { status: 'pending' }
      if (this.data.applyType) {
        whereCondition.applyType = this.data.applyType
      }

      // 获取待审核申请
      let pendingRes
      try {
        pendingRes = await wxdb.collection('admins').where(whereCondition).orderBy('createTime', 'desc').get()
      } catch (err) {
        console.error('查询待审核申请失败:', err)
        pendingRes = { data: [] }
      }

      const pendingApps = pendingRes.data || []

      // 批量查询：收集所有需要查询的 userId
      const pendingUserIds = pendingApps.map(a => a.userId).filter(Boolean)

      // 批量查询用户信息（一次查询所有）
      let usersMap = {}
      if (pendingUserIds.length > 0) {
        try {
          const uniqueUserIds = [...new Set(pendingUserIds)]
          const usersRes = await wxdb.collection('users').where({
            openid: _.in(uniqueUserIds)
          }).get()
          usersMap = {}
          for (const user of usersRes.data) {
            usersMap[user.openid] = {
              nickName: user.nickName || '未知用户',
              avatarUrl: user.avatarUrl,
              _id: user._id
            }
          }
        } catch (err) {
          console.error('批量获取用户信息失败:', err)
        }
      }

      // 收集所有需要查询的 zone 的 userId（用于盟管申请的 zoneId 查找）
      const allianceManagerUserIds = pendingApps
        .filter(a => a.applyType === 'allianceManager' && a.userId)
        .map(a => a.userId)

      // 批量查询 zoneManager 申请记录
      let zoneManagerAppsMap = {}
      if (allianceManagerUserIds.length > 0) {
        try {
          const zmRes = await wxdb.collection('admins').where({
            userId: _.in([...new Set(allianceManagerUserIds)]),
            applyType: 'zoneManager',
            status: 'approved'
          }).get()
          for (const app of zmRes.data) {
            if (!zoneManagerAppsMap[app.userId]) zoneManagerAppsMap[app.userId] = app
          }
        } catch (err) {
          console.error('查询区管申请失败:', err)
        }
      }

      // 批量查询 zoneCreation 申请记录
      let zoneCreationAppsMap = {}
      if (allianceManagerUserIds.length > 0) {
        try {
          const zcRes = await wxdb.collection('admins').where({
            userId: _.in([...new Set(allianceManagerUserIds)]),
            applyType: 'zoneCreation',
            status: 'approved'
          }).get()
          for (const app of zcRes.data) {
            if (!zoneCreationAppsMap[app.userId]) zoneCreationAppsMap[app.userId] = app
          }
        } catch (err) {
          console.error('查询分区开通申请失败:', err)
        }
      }

      // 批量查询 zones（只查一次）
      let allZones = []
      try {
        allZones = await db.getAllZones()
      } catch (err) {
        console.error('查询分区失败:', err)
      }
      const zonesMap = {}
      for (const z of allZones) {
        zonesMap[z._id] = z
        zonesMap[z.zoneName] = z  // also by name for zoneCreation lookup
      }

      // 收集所有需要查询联盟的 zoneId
      const zoneIdsForAlliances = new Set()
      for (const app of pendingApps) {
        if (app.applyType === 'allianceManager' && app.zoneId) {
          zoneIdsForAlliances.add(app.zoneId)
        }
      }

      // 批量查询联盟（按 zoneId 分组）
      let alliancesByZone = {}
      const zoneIdArr = [...zoneIdsForAlliances]
      const alliancePromises = zoneIdArr.map(zoneId =>
        db.getAlliancesByZone(zoneId).then(alliances => {
          alliancesByZone[zoneId] = alliances
        })
      )
      await Promise.all(alliancePromises)

      // 处理每条申请
      const applications = []
      for (const application of pendingApps) {
        const userId = application.userId
        const userInfo = usersMap[userId] || { nickName: '未知用户', avatarUrl: null, _id: null }

        let applicantAlliances = []
        let applicantZoneId = null
        let applicantZoneIndex = -1

        // 确定分区
        if (application.zoneId) {
          applicantZoneId = application.zoneId
        } else if (application.applyType === 'allianceManager') {
          // 从 zoneManager 申请中获取
          const zmApp = zoneManagerAppsMap[userId]
          if (zmApp && zmApp.zoneId) {
            applicantZoneId = zmApp.zoneId
          } else {
            // 从 zoneCreation 申请中获取
            const zcApp = zoneCreationAppsMap[userId]
            if (zcApp && zcApp.zoneName) {
              const foundZone = zonesMap[zcApp.zoneName]
              if (foundZone) applicantZoneId = foundZone._id
            }
          }
        }

        // 区管数据隔离：只显示自己管理分区的盟管申请
        if (role === 'admin' && this.data.applyType === 'allianceManager') {
          const availableZoneIds = this.data.availableZones.map(z => z._id)
          if (applicantZoneId && !availableZoneIds.includes(applicantZoneId)) {
            continue // 跳过不属于自己管理的分区申请
          }
        }

        // 匹配分区索引
        if (applicantZoneId) {
          const foundZoneIndex = allZones.findIndex(z => z._id === applicantZoneId)
          applicantZoneIndex = foundZoneIndex >= 0 ? foundZoneIndex : -1
        }

        // 获取联盟列表
        if (application.applyType === 'allianceManager' && applicantZoneId) {
          applicantAlliances = alliancesByZone[applicantZoneId] || []
        }

        applications.push({
          ...application,
          userId: userInfo._id,
          userOpenid: userId, // 保存原始 openid 用于数据修复
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl,
          selectingZone: false,
          selectingAlliance: false,
          zonePickerIndex: applicantZoneIndex >= 0 ? applicantZoneIndex : 0,
          alliancePickerIndex: 0,
          applicantAlliances: applicantAlliances,
          applicantZoneIndex: applicantZoneIndex,
          applicantZoneId: applicantZoneId,
          formattedTime: application.createTime ? util.formatDate(application.createTime, 'YYYY-MM-DD HH:mm') : '',
          valid: userInfo._id !== null,
          // 显示申请时的分区信息
          applicantZoneName: application.zoneName || '',
          // 区管申请自带分区：自动预填，超管无需手动选择即可确认
          selectedZone: (applicantZoneId && applicantZoneIndex >= 0) ? allZones[applicantZoneIndex] : null
        })
      }

      // 获取已审核申请（根据当前 applyType 过滤）
      let reviewedRes
      try {
        const reviewedWhereCondition = {
          status: _.in(['approved', 'rejected'])
        }
        if (this.data.applyType) {
          reviewedWhereCondition.applyType = this.data.applyType
        }
        reviewedRes = await wxdb.collection('admins').where(reviewedWhereCondition).orderBy('reviewTime', 'desc').limit(20).get()
      } catch (err) {
        console.error('查询已审核申请失败:', err)
        reviewedRes = { data: [] }
      }

      // 批量查询已审核记录的用户信息
      const reviewedUserIds = (reviewedRes.data || []).map(a => a.userId).filter(Boolean)
      let reviewedUsersMap = {}
      if (reviewedUserIds.length > 0) {
        try {
          const uniqueUserIds = [...new Set(reviewedUserIds)]
          const reviewedUsersRes = await wxdb.collection('users').where({
            openid: _.in(uniqueUserIds)
          }).get()
          for (const user of reviewedUsersRes.data) {
            reviewedUsersMap[user.openid] = user.nickName || '未知用户'
          }
        } catch (err) {
          console.error('批量获取已审核用户信息失败:', err)
        }
      }

      const reviewedApplications = (reviewedRes.data || []).map(application => ({
        ...application,
        nickName: reviewedUsersMap[application.userId] || '未知用户',
        formattedReviewTime: application.reviewTime ? util.formatDate(application.reviewTime, 'YYYY-MM-DD HH:mm') : ''
      }))

      // 区管数据隔离：过滤已审核记录，只显示自己管理分区的盟管审核记录
      let filteredReviewedApplications = reviewedApplications
      if (role === 'admin' && this.data.applyType === 'allianceManager') {
        const availableZoneIds = this.data.availableZones.map(z => z._id)
        filteredReviewedApplications = reviewedApplications.filter(app => {
          // 已审核的盟管申请应该有 zoneId 字段
          return app.zoneId && availableZoneIds.includes(app.zoneId)
        })
      }

      this.setData({
        applications: applications,
        reviewedApplications: filteredReviewedApplications
      })

      util.hideLoading()

    } catch (err) {
      console.error('加载申请列表失败:', err)
      util.hideLoading()
      util.showError('加载申请列表失败: ' + (err.message || '未知错误'))
    }
  },

  // 开始选择分区（区管申请）
  startSelectZone: function (e) {
    const index = e.currentTarget.dataset.index
    const applications = this.data.applications.map((app, i) =>
      // 保留已预填的 selectedZone（区管申请自带分区），仅在未预填时才置空
      i === index ? { ...app, selectingZone: true } : app
    )
    this.setData({ applications })
  },

  // 分区选择变化（由组件内部处理全局状态同步）
  onZoneSelect: function (e) {
    const zone = e.detail.zone
    const appIndex = e.currentTarget.dataset.appIndex
    const applications = this.data.applications.map((app, i) =>
      i === appIndex ? { ...app, selectedZone: zone } : app
    )
    this.setData({ applications })
  },

  // 确认批准区管（带分区绑定）
  confirmApproveZoneManager: async function (e) {
    const applicationId = e.currentTarget.dataset.id
    let userId = e.currentTarget.dataset.userid
    const userOpenid = e.currentTarget.dataset.useropenid
    const index = e.currentTarget.dataset.index

    // 校验 userId 是否有效
    if (!userId) {
      // userId 为空时，尝试从 openid 获取真实的 _id
      if (userOpenid) {
        util.showLoading('正在获取用户信息...')
        try {
          const userRecord = await db.getUserByOpenid(userOpenid)
          if (userRecord && userRecord._id) {
            userId = userRecord._id
            util.hideLoading()
          } else {
            util.hideLoading()
            util.showError('用户数据异常，无法找到用户记录')
            return
          }
        } catch (err) {
          util.hideLoading()
          util.showError('获取用户信息失败：' + (err.message || '未知错误'))
          return
        }
      } else {
        util.showError('用户数据异常，无法批准')
        return
      }
    }

    const selectedZone = this.data.applications[index].selectedZone

    if (!selectedZone) {
      util.showInfo('请选择分区')
      return
    }

    try {
      util.showLoading('正在批准...')

      // 使用 openid 作为统一的审核者标识
      const reviewerId = app.globalData.openid

      // 更新申请状态（带分区绑定）
      await db.reviewAdminApplication(applicationId, 'approved', reviewerId, 'admin', {
        zoneId: selectedZone._id,
        zoneName: selectedZone.zoneName
      })

      // 更新用户角色 - 使用真实的 _id
      console.log('批准区管 - userId:', userId, 'role: admin')
      const updateResult = await db.updateUserRole(userId, 'admin')
      console.log('updateUserRole 结果:', updateResult)

      // 更新分区创建者（让区管能管理该分区）
      const zoneUpdateResult = await db.updateZoneCreator(selectedZone._id, userId)
      console.log('updateZoneCreator 结果:', zoneUpdateResult)

      // 从待审核列表移除
      const applications = this.data.applications.filter((_, i) => i !== index)
      const approvedApp = this.data.applications[index]

      // 添加到已审核列表
      const reviewedApplications = [
        {
          ...approvedApp,
          status: 'approved',
          approvedRole: 'admin',
          zoneId: selectedZone._id,
          zoneName: selectedZone.zoneName,
          formattedReviewTime: util.formatDate(new Date(), 'YYYY-MM-DD HH:mm')
        },
        ...this.data.reviewedApplications
      ]

      this.setData({
        applications: applications,
        reviewedApplications: reviewedApplications
      })

      util.hideLoading()
      util.showSuccess('已批准并绑定分区')

      // 异步发送审核结果通知（不阻塞）
      this.sendReviewNotify(applicationId, 'approved', {
        zoneName: selectedZone.zoneName,
        zoneCode: selectedZone.zoneCode || ''
      })

    } catch (err) {
      util.hideLoading()
      console.error('批准失败:', err)
      util.showError('批准失败: ' + (err.message || '未知错误'))
    }
  },

  // 取消选择分区
  cancelSelectZone: function (e) {
    const index = e.currentTarget.dataset.index
    const applications = this.data.applications.map((app, i) =>
      i === index ? { ...app, selectingZone: false } : app
    )
    this.setData({ applications })
  },

  // 开始选择联盟（盟管申请批准流程）
  startSelectAlliance: function (e) {
    const index = e.currentTarget.dataset.index
    const applications = this.data.applications.map((app, i) =>
      i === index ? { ...app, selectingAlliance: true } : app
    )
    this.setData({ applications })
  },

  // 联盟选择变化
  onAllianceSelect: function (e) {
    const appIndex = e.currentTarget.dataset.appIndex
    const allianceIndex = parseInt(e.detail.value)
    const applications = this.data.applications.map((app, i) =>
      i === appIndex ? { ...app, alliancePickerIndex: allianceIndex } : app
    )
    this.setData({ applications })
  },

  // 盟管批准流程中的分区选择变化
  onAllianceZoneSelect: async function (e) {
    const appIndex = e.currentTarget.dataset.appIndex
    const zoneIndex = parseInt(e.detail.value)
    const selectedZone = this.data.availableZones[zoneIndex]
    if (!selectedZone) return

    try {
      util.showLoading('加载联盟...')
      const alliances = await db.getAlliancesByZone(selectedZone._id)

      const applications = this.data.applications.map((app, i) =>
        i === appIndex ? {
          ...app,
          applicantZoneIndex: zoneIndex,
          applicantZoneId: selectedZone._id,
          applicantAlliances: alliances,
          alliancePickerIndex: 0
        } : app
      )

      this.setData({ applications })
      util.hideLoading()
    } catch (err) {
      util.hideLoading()
      console.error('加载联盟失败:', err)
      util.showError('加载联盟失败')
    }
  },

  // 取消选择联盟
  cancelSelectAlliance: function (e) {
    const index = e.currentTarget.dataset.index
    const applications = this.data.applications.map((app, i) =>
      i === index ? { ...app, selectingAlliance: false } : app
    )
    this.setData({ applications })
  },

  // 确认批准盟管（带联盟绑定）
  confirmApproveAllianceManager: async function (e) {
    const applicationId = e.currentTarget.dataset.id
    const userId = e.currentTarget.dataset.userid
    const index = e.currentTarget.dataset.index

    if (!userId) {
      util.showError('用户数据异常，无法批准')
      return
    }

    const application = this.data.applications[index]
    const alliances = application.applicantAlliances || []

    if (alliances.length === 0) {
      util.showError('未找到可绑定的联盟，请先配置分区联盟')
      return
    }

    const selectedAllianceIndex = application.alliancePickerIndex || 0
    const selectedAlliance = alliances[selectedAllianceIndex]

    if (!selectedAlliance) {
      util.showInfo('请选择联盟')
      return
    }

    // 获取选中的分区信息
    if (application.applicantZoneIndex < 0) {
      util.showInfo('请选择分区')
      return
    }
    const selectedZone = this.data.availableZones[application.applicantZoneIndex]

    try {
      util.showLoading('正在批准...')

      const reviewerId = app.globalData.openid
      const approvedRole = 'auditor'

      // 如果申请时提供了自定义联盟名称，先更新联盟名称
      if (application.customAllianceName && application.customAllianceName.trim()) {
        await db.updateAllianceName(selectedAlliance._id, application.customAllianceName.trim())
      }

      const extraData = {
        allianceId: selectedAlliance._id,
        allianceName: application.customAllianceName && application.customAllianceName.trim()
          ? application.customAllianceName.trim()
          : selectedAlliance.allianceName
      }
      if (selectedZone) {
        extraData.zoneId = selectedZone._id
        extraData.zoneName = selectedZone.zoneName
      }

      await db.reviewAdminApplication(applicationId, 'approved', reviewerId, approvedRole, extraData)
      await db.updateUserRole(userId, approvedRole)

      // 绑定盟管到联盟
      await db.bindAllianceAuditors(selectedAlliance._id, userId)

      // 从待审核列表移除
      const applications = this.data.applications.filter((_, i) => i !== index)
      const approvedApp = this.data.applications[index]

      // 添加到已审核列表
      const reviewedApplications = [
        {
          ...approvedApp,
          status: 'approved',
          approvedRole: approvedRole,
          allianceName: selectedAlliance.allianceName,
          zoneName: selectedZone ? selectedZone.zoneName : '',
          formattedReviewTime: util.formatDate(new Date(), 'YYYY-MM-DD HH:mm')
        },
        ...this.data.reviewedApplications
      ]

      this.setData({
        applications: applications,
        reviewedApplications: reviewedApplications
      })

      util.hideLoading()
      util.showSuccess('已批准并绑定到 ' + selectedAlliance.allianceName)

      // 异步发送审核结果通知（不阻塞）
      this.sendReviewNotify(applicationId, 'approved', {
        zoneName: selectedZone ? selectedZone.zoneName : '',
        zoneCode: selectedZone ? (selectedZone.zoneCode || '') : '',
        allianceName: extraData.allianceName
      })

    } catch (err) {
      util.hideLoading()
      console.error('批准失败:', err)
      util.showError('批准失败: ' + (err.message || '未知错误'))
    }
  },

  // 开始创建分区（展开表单）
  startCreateZone: function (e) {
    const index = e.currentTarget.dataset.index
    const zoneName = e.currentTarget.dataset.zonename
    const trimmed = zoneName ? zoneName.trim() : ''
    let inputZoneCode, inputZoneName

    // 若申请内容仅为4位数字，自动填入分区编号和名称
    if (/^\d{4}$/.test(trimmed)) {
      inputZoneCode = trimmed
      inputZoneName = trimmed
    } else {
      // 尝试按空格分割提取名称和编号（如"第一区 3558"）
      const parts = trimmed.split(/\s+/)
      inputZoneName = parts.length > 1 ? parts.slice(0, -1).join(' ') : trimmed
      inputZoneCode = parts.length > 1 ? parts[parts.length - 1] : ''
    }

    const applications = this.data.applications.map((app, i) =>
      i === index ? { ...app, creatingZone: true, inputZoneCode, inputZoneName } : app
    )
    this.setData({ applications })
  },

  // 取消创建分区
  cancelCreateZone: function (e) {
    const index = e.currentTarget.dataset.index
    const applications = this.data.applications.map((app, i) =>
      i === index ? { ...app, creatingZone: false } : app
    )
    this.setData({ applications })
  },

  // 分区编号输入
  onZoneCodeInput: function (e) {
    const index = e.currentTarget.dataset.index
    const applications = this.data.applications.map((app, i) =>
      i === index ? { ...app, inputZoneCode: e.detail.value } : app
    )
    this.setData({ applications })
  },

  // 分区名称输入
  onZoneNameInput: function (e) {
    const index = e.currentTarget.dataset.index
    const applications = this.data.applications.map((app, i) =>
      i === index ? { ...app, inputZoneName: e.detail.value } : app
    )
    this.setData({ applications })
  },

  // 确认批准分区开通
  confirmApproveZoneCreation: async function (e) {
    const applicationId = e.currentTarget.dataset.id
    let userId = e.currentTarget.dataset.userid
    const userOpenid = e.currentTarget.dataset.useropenid
    const index = e.currentTarget.dataset.index

    // 校验 userId 是否有效
    if (!userId) {
      // userId 为空时，尝试从 openid 获取真实的 _id
      if (userOpenid) {
        util.showLoading('正在获取用户信息...')
        try {
          const userRecord = await db.getUserByOpenid(userOpenid)
          if (userRecord && userRecord._id) {
            userId = userRecord._id
            util.hideLoading()
          } else {
            util.hideLoading()
            util.showError('用户数据异常，无法找到用户记录')
            return
          }
        } catch (err) {
          util.hideLoading()
          util.showError('获取用户信息失败：' + (err.message || '未知错误'))
          return
        }
      } else {
        util.showError('用户数据异常，无法批准')
        return
      }
    }

    const application = this.data.applications[index]
    const zoneCode = (application.inputZoneCode || '').trim()
    const zoneName = (application.inputZoneName || '').trim()

    if (!zoneCode) {
      util.showInfo('请输入分区编号')
      return
    }
    if (!zoneName) {
      util.showInfo('请输入分区名称')
      return
    }

    try {
      util.showLoading('正在检查分区...')

      const paddedCode = zoneCode.padStart(4, '0')

      // 检查分区编号是否已存在
      const existingZone = await db.getZoneByCode(paddedCode)

      if (existingZone) {
        // 分区已存在，自动拒绝并通知用户
        util.hideLoading()
        await this.autoRejectZoneCreation(applicationId, index, paddedCode, existingZone.zoneName)
        return
      }

      // 分区不存在，继续创建流程
      util.showLoading('正在创建分区...')

      const reviewerId = app.globalData.openid

      // 创建分区（createZone 内部会再次检查编号是否重复）
      const zoneResult = await db.createZone(paddedCode, zoneName, userId)

      // 初始化12个联盟
      if (zoneResult && zoneResult._id) {
        await db.initAlliances(zoneResult._id)
      }

      // 更新申请状态
      await db.reviewAdminApplication(applicationId, 'approved', reviewerId, 'admin', {
        zoneId: zoneResult ? zoneResult._id : '',
        zoneName: zoneName
      })

      // 将申请人设为区管
      await db.updateUserRole(userId, 'admin')

      // 从待审核列表移除
      const applications = this.data.applications.filter((_, i) => i !== index)
      const approvedApp = this.data.applications[index]

      // 添加到已审核列表
      const reviewedApplications = [
        {
          ...approvedApp,
          status: 'approved',
          approvedRole: 'admin',
          zoneName: zoneName,
          formattedReviewTime: util.formatDate(new Date(), 'YYYY-MM-DD HH:mm')
        },
        ...this.data.reviewedApplications
      ]

      this.setData({
        applications: applications,
        reviewedApplications: reviewedApplications
      })

      util.hideLoading()
      util.showSuccess('已创建分区并设为区管')

      // 异步发送审核结果通知（不阻塞）
      this.sendReviewNotify(applicationId, 'approved', {
        zoneName: zoneName,
        zoneCode: paddedCode
      })

    } catch (err) {
      util.hideLoading()
      console.error('批准分区开通失败:', err)
      util.showError('批准失败: ' + (err.message || '未知错误'))
    }
  },

  // 自动拒绝分区开通申请（分区已存在时）
  autoRejectZoneCreation: async function (applicationId, index, zoneCode, existingZoneName) {
    const rejectReason = '分区' + zoneCode + '已开通，开通失败'

    try {
      const reviewerId = app.globalData.openid
      await db.reviewAdminApplication(applicationId, 'rejected', reviewerId, null, {
        rejectReason: rejectReason,
        rejectType: 'zoneAlreadyExists'
      })

      // 从待审核列表移除
      const applications = this.data.applications.filter((_, i) => i !== index)
      const rejectedApp = this.data.applications[index]

      // 添加到已审核列表
      const reviewedApplications = [
        {
          ...rejectedApp,
          status: 'rejected',
          rejectReason: rejectReason,
          rejectType: 'zoneAlreadyExists',
          formattedReviewTime: util.formatDate(new Date(), 'YYYY-MM-DD HH:mm')
        },
        ...this.data.reviewedApplications
      ]

      this.setData({
        applications: applications,
        reviewedApplications: reviewedApplications
      })

      util.showInfo('分区已存在，已自动拒绝该申请并通知申请人')

      // 异步发送审核结果通知（不阻塞）
      this.sendReviewNotify(applicationId, 'rejected', {
        rejectReason: rejectReason,
        zoneCode: zoneCode,
        auto: true
      })
    } catch (err) {
      console.error('自动拒绝申请失败:', err)
      // 即使自动拒绝失败，也提示管理员分区已存在
      util.showInfo('分区编号' + zoneCode + '已存在，无法创建')
    }
  },

  // 拒绝申请
  rejectApplication: async function (e) {
    const applicationId = e.currentTarget.dataset.id
    const index = e.currentTarget.dataset.index

    const confirm = await util.showConfirm('确认拒绝', '确定要拒绝该管理员申请吗？')

    if (!confirm) return

    try {
      util.showLoading('正在拒绝...')

      // 使用 openid 作为统一的审核者标识
      const reviewerId = app.globalData.openid

      // 更新申请状态
      await db.reviewAdminApplication(applicationId, 'rejected', reviewerId)

      // 从待审核列表移除
      const applications = this.data.applications.filter((_, i) => i !== index)
      const rejectedApp = this.data.applications[index]

      // 添加到已审核列表
      const reviewedApplications = [
        {
          ...rejectedApp,
          status: 'rejected',
          formattedReviewTime: util.formatDate(new Date(), 'YYYY-MM-DD HH:mm')
        },
        ...this.data.reviewedApplications
      ]

      this.setData({
        applications: applications,
        reviewedApplications: reviewedApplications
      })

      util.hideLoading()
      util.showSuccess('已拒绝')

      // 异步发送审核结果通知（不阻塞）
      this.sendReviewNotify(applicationId, 'rejected')

    } catch (err) {
      util.hideLoading()
      util.showError('拒绝失败')
    }
  },

  // 删除已审核记录
  deleteReviewedApplication: async function (e) {
    const applicationId = e.currentTarget.dataset.id
    const index = e.currentTarget.dataset.index

    const confirm = await util.showConfirm('确认删除', '确定要删除该审核记录吗？此操作不可恢复。')

    if (!confirm) return

    try {
      util.showLoading('正在删除...')

      const wxdb = wx.cloud.database()
      await wxdb.collection('admins').doc(applicationId).remove()

      // 从已审核列表移除
      const reviewedApplications = this.data.reviewedApplications.filter((_, i) => i !== index)

      this.setData({
        reviewedApplications: reviewedApplications
      })

      util.hideLoading()
      util.showSuccess('已删除')

    } catch (err) {
      util.hideLoading()
      console.error('删除失败:', err)
      util.showError('删除失败: ' + (err.message || '未知错误'))
    }
  },

  // 发送审核结果订阅消息通知（异步，不阻塞审批流程）
  // 审批操作（更新数据库、角色）已完成后再调用，通知发送失败不影响审批结果
  sendReviewNotify: function (applicationId, status, extra) {
    wx.cloud.callFunction({
      name: 'sendReviewNotify',
      data: {
        applicationId: applicationId,
        status: status,
        zoneCode: (extra && extra.zoneCode) || '',
        zoneName: (extra && extra.zoneName) || '',
        allianceName: (extra && extra.allianceName) || '',
        rejectReason: (extra && extra.rejectReason) || '',
        auto: (extra && extra.auto) || false
      }
    }).then(function (res) {
      if (res.result && res.result.success) {
        console.log('[通知] 审核结果通知已发送:', applicationId, status)
      } else {
        console.log('[通知] 通知未发送（用户未授权或配额已用完）:', res.result && res.result.error)
      }
    }).catch(function (err) {
      console.error('[通知] 发送审核结果通知失败:', err)
    })
  }
})