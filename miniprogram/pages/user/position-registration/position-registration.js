// pages/user/position-registration/position-registration.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')
const shareEntry = require('../../../utils/shareEntry')
const ga = require('../../../utils/gameAccount')

function normalizeTimeToHHMM(t) {
  if (!t) return t
  return t.replace(/^(\d):/, '0$1:')
}

Page({
  data: {
    configId: null,
    config: null,
    loading: false,
    currentUserId: null,
    canDelete: false, // 区管和超管可以删除

    // 时间段
    allSlots: [],
    filteredSlots: [],
    currentPeriod: 'morning', // 'morning' 或 'afternoon'

    // 弹窗状态
    showModal: false,
    selectedTime: '',
    inputNickName: '',
    inputRemark: '',
    accountList: [],          // 游戏账号列表（昵称下拉切换用）
    accountSelectedId: '',    // 报名弹窗：当前选中的账号 _id（手动填写时为 ''）

    // 编辑弹窗状态
    showEditModal: false,
    editingReg: null,
    editNickName: '',
    editRemark: '',
    editAccountSelectedId: ''
  },

  onLoad: function (options) {
    this.waitForRoleReady(options)
  },

  onShow: function () {
    // 刷新数据
    if (app.globalData.roleReady && this.data.configId) {
      this.loadRegistrations()
    }
  },

  // 等待角色就绪
  waitForRoleReady: function (options) {
    if (app.globalData.roleReady) {
      const configId = options ? options.configId : null
      if (configId) {
        this.setData({ configId })
        this.checkAndLoad(configId)
      } else {
        // 如果没有传入 configId，尝试获取今天的配置
        this.loadTodayConfig()
      }
    } else {
      setTimeout(() => {
        this.waitForRoleReady(options)
      }, 100)
    }
  },

  // 校验分享进入的登录与分区归属，通过后再加载配置
  checkAndLoad: async function (configId) {
    const pass = await this.checkSharedEntry(configId)
    if (!pass) return
    this.loadConfigData(configId)
  },

  // 分享进入：首次校验登录与分区归属
  checkSharedEntry: async function (configId) {
    if (this._entryChecked) return true
    this._entryChecked = true

    const userInfo = app.globalData.userInfo
    if (!userInfo || !userInfo.nickName) {
      shareEntry.showReminderAndExit(this, '未登录，请先登录')
      return false
    }

    // 解析分享配置所属分区
    let configZoneId = null
    let configZoneName = ''
    try {
      const cfg = await db.getPositionConfigById(configId)
      if (cfg) {
        configZoneId = cfg.zoneId
        configZoneName = cfg.zoneName
      }
    } catch (e) {
      console.error('获取官职配置失败', e)
    }

    const zone = await this.resolveZone()
    if (!zone) {
      shareEntry.showReminderAndExit(this, '请先在首页选择分区后再报名')
      return false
    }

    if (configZoneId && zone._id !== configZoneId) {
      const name = configZoneName || ''
      shareEntry.showReminderAndExit(this, '不属于' + name + '分区，请切换到' + name + '分区后再重新进入报名')
      return false
    }
    return true
  },

  // 解析当前分区：优先全局状态，其次本地缓存的上次选择分区
  resolveZone: async function () {
    let zone = app.globalData.currentZone
    if (zone) return zone

    const lastZoneId = wx.getStorageSync('lastZoneId')
    if (!lastZoneId) return null

    try {
      const wxdb = wx.cloud.database()
      const res = await wxdb.collection('zones').doc(lastZoneId).get()
      if (res.data && res.data.status !== 'inactive') {
        zone = res.data
        app.globalData.currentZone = zone
        return zone
      }
    } catch (err) {
      console.error('恢复分区失败:', err)
    }
    return null
  },

  // 加载今天的配置（如果没有传入 configId）
  loadTodayConfig: async function () {
    try {
      this.setData({ loading: true })
      const today = util.formatDate(new Date(), 'YYYY-MM-DD')
      const configs = await db.getPositionConfigs({ date: today })

      if (configs.length > 0) {
        const configId = configs[0]._id
        this.setData({ configId })
        this.loadConfigData(configId)
      } else {
        util.showInfo('暂无可报名的官职配置')
        this.setData({ loading: false })
      }
    } catch (err) {
      console.error('加载配置失败:', err)
      util.showError('加载失败')
      this.setData({ loading: false })
    }
  },

  // 加载配置数据
  loadConfigData: async function (configId) {
    try {
      this.setData({ loading: true })

      // 获取当前用户信息
      const userInfo = app.globalData.userInfo
      const openid = app.globalData.openid
      const currentUserId = userInfo ? userInfo._id : openid

      // 检查是否为区管或超管（可以删除）
      const role = app.globalData.role || 'user'
      const canDelete = role === 'admin' || role === 'superAdmin'

      // 获取配置详情
      const config = await db.getPositionConfigById(configId)

      if (!config) {
        util.showError('配置不存在')
        this.setData({ loading: false })
        return
      }

      if (config && config.startTime) {
        config.startTime = normalizeTimeToHHMM(config.startTime)
      }

      this.setData({
        config,
        currentUserId,
        canDelete
      })

      // 加载游戏账号列表（昵称下拉切换用）
      this.loadAccounts()

      // 生成时间段并加载报名情况
      await this.loadRegistrations()

    } catch (err) {
      console.error('加载配置失败:', err)
      util.showError('加载失败')
      this.setData({ loading: false })
    }
  },

  // 加载报名记录
  loadRegistrations: async function () {
    try {
      this.setData({ loading: true })

      // 检查config是否已加载
      if (!this.data.config || !this.data.config.startTime) {
        this.setData({ loading: false })
        return
      }

      // 生成时间段列表
      const slots = db.generatePositionTimeSlots(this.data.config.startTime)

      // 获取该配置的所有报名记录
      const registrations = await db.getPositionRegistrationsByConfig(this.data.configId)

      // 熔炉等级徽章：记录自带 furnace，老记录按 userId 兜底查主账号（decorate 就地写入）
      await ga.decorate(registrations)

      // 创建报名记录的映射
      const regMap = {}
      for (const reg of registrations) {
        regMap[normalizeTimeToHHMM(reg.timeSlot)] = reg
      }

      // 处理每个时间段的报名情况
      const processedSlots = slots.map(slot => {
        const registration = regMap[slot.time]
        return {
          time: slot.time,
          period: slot.period,
          registration: registration || null
        }
      })

      // 根据当前时段筛选
      const filteredSlots = processedSlots.filter(
        slot => slot.period === this.data.currentPeriod
      )

      this.setData({
        allSlots: processedSlots,
        filteredSlots,
        loading: false
      })

    } catch (err) {
      console.error('加载报名记录失败:', err)
      util.showError('加载失败')
      this.setData({ loading: false })
    }
  },

  // 切换上午/下午
  switchPeriod: function (e) {
    const period = e.currentTarget.dataset.period
    if (period === this.data.currentPeriod) return

    const filteredSlots = this.data.allSlots.filter(
      slot => slot.period === period
    )

    this.setData({
      currentPeriod: period,
      filteredSlots
    })
  },

  // 加载游戏账号列表（昵称下拉切换用）
  loadAccounts: function () {
    const self = this
    ga.list().then(list => {
      self.setData({ accountList: list || [] })
    }).catch(() => { })
  },

  // 昵称复合选择器回调（报名弹窗）：默认主账号 / 下拉切换 / 手动填写
  onAccountChange: function (e) {
    this.setData({
      inputNickName: e.detail.nickName,
      accountSelectedId: e.detail.selectedId
    })
  },

  // 昵称复合选择器回调（编辑弹窗）
  onEditAccountChange: function (e) {
    this.setData({
      editNickName: e.detail.nickName,
      editAccountSelectedId: e.detail.selectedId
    })
  },

  // 选择空座位
  selectSeat: function (e) {
    const time = e.currentTarget.dataset.time

    // 默认昵称：优先主账号，没有则回退微信昵称
    const userInfo = app.globalData.userInfo
    const list = this.data.accountList || []
    const mainIdx = list.findIndex(a => a.isMain)
    const main = mainIdx >= 0 ? list[mainIdx] : null
    const defaultNickName = (main && main.gameNickName) || (userInfo ? userInfo.nickName : '')

    this.setData({
      showModal: true,
      selectedTime: time,
      inputNickName: defaultNickName,
      inputRemark: '',
      accountSelectedId: main ? main._id : ''
    })
  },

  // 输入备注
  onRemarkInput: function (e) {
    this.setData({ inputRemark: e.detail.value })
  },

  // 关闭选择弹窗
  closeModal: function () {
    this.setData({
      showModal: false,
      selectedTime: '',
      inputNickName: '',
      inputRemark: ''
    })
  },

  // 确认选择座位
  confirmSeat: async function () {
    const { selectedTime, inputNickName, inputRemark, configId, currentUserId } = this.data

    // 验证昵称
    if (!inputNickName || inputNickName.trim() === '') {
      util.showInfo('请输入游戏昵称')
      return
    }

    const nickName = inputNickName.trim()
    const remark = inputRemark.trim()

    try {
      util.showLoading('正在提交...')

      // 检查座位是否已被占用（并发检测）
      const existingReg = await db.getPositionRegistrationByTimeSlot(configId, normalizeTimeToHHMM(selectedTime))
      if (existingReg && existingReg.userId !== currentUserId) {
        util.hideLoading()
        util.showErrorLong('该座位已被其他人选择，请刷新后重新选择')
        this.closeModal()
        this.loadRegistrations()
        return
      }

      // 检查昵称是否重复
      const registrations = await db.getPositionRegistrationsByConfig(configId)
      const duplicateNick = registrations.find(
        r => r.nickName === nickName && r.userId !== currentUserId
      )
      if (duplicateNick) {
        util.hideLoading()
        util.showErrorLong(`昵称 "${nickName}" 已被其他人使用`)
        return
      }

      // 熔炉等级：带上主账号的等级，报名列表 / 截图会按它展示等级图标
      const furnace = await ga.selfFurnace()

      // 创建报名
      await db.createPositionRegistration({
        configId: configId,
        timeSlot: selectedTime,
        userId: currentUserId,
        nickName: nickName,
        remark: remark,
        furnace: furnace
      })

      util.hideLoading()
      util.showSuccess('选择成功')

      // 自动把本次使用的昵称追加到游戏账号列表（仅当不在已有账号里）
      const existsSel = (this.data.accountList || []).some(a => a.gameNickName === nickName)
      if (nickName && !existsSel) {
        ga.save({ gameNickName: nickName }).then(() => { ga.clearMainCache(); this.loadAccounts() }).catch(() => { })
      }

      this.closeModal()
      this.loadRegistrations()

    } catch (err) {
      util.hideLoading()
      console.error('提交失败:', err)
      util.showErrorLong('提交失败：' + (err.message || '未知错误'))
    }
  },

  // 编辑自己的座位
  editMySeat: function (e) {
    const reg = e.currentTarget.dataset.reg

    const list = this.data.accountList || []
    const idx = list.findIndex(a => a.gameNickName === reg.nickName)

    this.setData({
      showEditModal: true,
      editingReg: reg,
      editNickName: reg.nickName,
      editRemark: reg.remark || '',
      editAccountSelectedId: idx >= 0 ? list[idx]._id : ''
    })
  },

  // 输入编辑备注
  onEditRemarkInput: function (e) {
    this.setData({ editRemark: e.detail.value })
  },

  // 关闭编辑弹窗
  closeEditModal: function () {
    this.setData({
      showEditModal: false,
      editingReg: null,
      editNickName: '',
      editRemark: ''
    })
  },

  // 更新自己的座位
  updateMySeat: async function () {
    const { editingReg, editNickName, editRemark, configId, currentUserId } = this.data

    // 验证昵称
    if (!editNickName || editNickName.trim() === '') {
      util.showInfo('请输入游戏昵称')
      return
    }

    const nickName = editNickName.trim()
    const remark = editRemark.trim()

    try {
      util.showLoading('正在保存...')

      // 检查昵称是否与其他记录重复
      const registrations = await db.getPositionRegistrationsByConfig(configId)
      const duplicateNick = registrations.find(
        r => r.nickName === nickName && r.userId !== currentUserId
      )
      if (duplicateNick) {
        util.hideLoading()
        util.showErrorLong(`昵称 "${nickName}" 已被其他人使用`)
        return
      }

      // 更新报名（顺带刷新熔炉等级：用户可能刚在「我的」里改过主账号）
      await db.updatePositionRegistration(editingReg._id, {
        nickName: nickName,
        remark: remark,
        furnace: await ga.selfFurnace()
      })

      util.hideLoading()
      util.showSuccess('保存成功')

      // 自动把本次使用的昵称追加到游戏账号列表（仅当不在已有账号里）
      const existsEdit = (this.data.accountList || []).some(a => a.gameNickName === nickName)
      if (nickName && !existsEdit) {
        ga.save({ gameNickName: nickName }).then(() => { ga.clearMainCache(); this.loadAccounts() }).catch(() => { })
      }

      this.closeEditModal()
      this.loadRegistrations()

    } catch (err) {
      util.hideLoading()
      console.error('保存失败:', err)
      util.showErrorLong('保存失败：' + (err.message || '未知错误'))
    }
  },

  // 删除自己的座位
  deleteMySeat: async function () {
    const { editingReg } = this.data

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个座位吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            util.showLoading('正在删除...')
            await db.cancelPositionRegistration(editingReg._id)
            util.hideLoading()
            util.showSuccess('删除成功')

            this.closeEditModal()
            this.loadRegistrations()

          } catch (err) {
            util.hideLoading()
            console.error('删除失败:', err)
            util.showError('删除失败')
          }
        }
      }
    })
  },

  // 查看别人的座位信息
  viewOtherSeat: function (e) {
    const reg = e.currentTarget.dataset.reg
    wx.showModal({
      title: '座位信息',
      content: `${reg.nickName}${reg.remark ? '\n备注：' + reg.remark : ''}`,
      showCancel: false,
      confirmText: '确定'
    })
  },

  // 区管删除任意座位
  deleteSeat: async function (e) {
    const reg = e.currentTarget.dataset.reg

    wx.showModal({
      title: '确认删除',
      content: `确定要删除 ${reg.nickName} 的座位吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            util.showLoading('正在删除...')
            await db.deletePositionRegistration(reg._id)
            util.hideLoading()
            util.showSuccess('删除成功')
            this.loadRegistrations()

          } catch (err) {
            util.hideLoading()
            console.error('删除失败:', err)
            util.showError('删除失败')
          }
        }
      }
    })
  },

  // 刷新数据
  refreshData: function () {
    if (this.data.configId) {
      this.loadRegistrations()
    } else {
      this.loadTodayConfig()
    }
  },

  // 分享
  onShareAppMessage: function () {
    const config = this.data.config
    const title = config
      ? `官职报名 - ${config.positionType} (${config.date})`
      : '官职报名 - 无尽冬日'
    return {
      title: title,
      path: `/pages/user/position-registration/position-registration?configId=${this.data.configId || ''}`
    }
  }
})