// pages/user/position-registration/position-registration.js
const app = getApp()
const util = require('../../../utils/util')
const db = require('../../../utils/db')

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

    // 编辑弹窗状态
    showEditModal: false,
    editingReg: null,
    editNickName: '',
    editRemark: ''
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
        this.loadConfigData(configId)
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

      this.setData({
        config,
        currentUserId,
        canDelete
      })

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

      // 创建报名记录的映射
      const regMap = {}
      for (const reg of registrations) {
        regMap[reg.timeSlot] = reg
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

  // 选择空座位
  selectSeat: function (e) {
    const time = e.currentTarget.dataset.time

    // 获取用户昵称作为默认值
    const userInfo = app.globalData.userInfo
    const defaultNickName = userInfo ? userInfo.nickName : ''

    this.setData({
      showModal: true,
      selectedTime: time,
      inputNickName: defaultNickName,
      inputRemark: ''
    })
  },

  // 输入昵称
  onNickNameInput: function (e) {
    this.setData({ inputNickName: e.detail.value })
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
      const existingReg = await db.getPositionRegistrationByTimeSlot(configId, selectedTime)
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

      // 创建报名
      await db.createPositionRegistration({
        configId: configId,
        timeSlot: selectedTime,
        userId: currentUserId,
        nickName: nickName,
        remark: remark
      })

      util.hideLoading()
      util.showSuccess('选择成功')

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

    this.setData({
      showEditModal: true,
      editingReg: reg,
      editNickName: reg.nickName,
      editRemark: reg.remark || ''
    })
  },

  // 输入编辑昵称
  onEditNickNameInput: function (e) {
    this.setData({ editNickName: e.detail.value })
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

      // 更新报名
      await db.updatePositionRegistration(editingReg._id, {
        nickName: nickName,
        remark: remark
      })

      util.hideLoading()
      util.showSuccess('保存成功')

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