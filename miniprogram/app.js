// app.js

// 北京时间日期串 YYYY-MM-DD：用于"跨天必须重新上报活跃"的判断
function beijingDateStr() {
  const d = new Date(Date.now() + 8 * 3600 * 1000)
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return d.getUTCFullYear() + '-' + m + '-' + day
}

App({
  globalData: {
    userInfo: null,
    openid: null,
    role: 'user',
    phone: null,
    currentZone: null,
    currentAlliance: null,
    dbReady: false,
    roleReady: false,
    firstLaunch: true,
    pageCache: {}
  },

  onLaunch: function () {
    // 初始化云开发环境
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        env: 'cloud1-9gip4qyf7e753868',
        traceUser: true,
      })
    }

    // 初始化数据库
    this.globalData.db = wx.cloud.database()
    this.globalData.dbReady = true

    // 冷启动恢复上次选择的分区（小程序进程被杀后 globalData 会丢失，导致各页缓存命中不了）
    const savedZone = wx.getStorageSync('positionZoneCache')
    if (savedZone && savedZone._id) {
      this.globalData.currentZone = savedZone
    }

    // 检查是否首次启动
    const hasLaunched = wx.getStorageSync('hasLaunched')
    this.globalData.firstLaunch = !hasLaunched

    // 自动登录
    this.autoLogin()

    // 联盟活跃：打开小程序自动把本人标记为今日活跃（内部有节流，失败静默）
    this.markAllianceActive()
  },

  onShow: function () {
    // 从后台切回前台也补一次（管理员中途取消活跃后，用户再次打开会重新置为活跃）
    this.markAllianceActive()
  },

  /**
   * 联盟活跃：自动标记今日活跃
   * - fire-and-forget，不阻塞启动，失败仅打日志
   * - 节流 5 分钟，避免频繁调用云函数
   * - 用户未加入联盟 / 无游戏昵称时云函数返回 error，静默忽略
   * @param {boolean} force 明确时机（分区就绪 / 切换联盟 / 报名成功）传 true，绕过节流立即上报
   * @returns {Promise<object|null>} 云函数返回结果，节流跳过时为 null
   */
  markAllianceActive: async function (force) {
    try {
      const now = Date.now()
      const last = wx.getStorageSync('lastAllianceActiveMark') || 0

      // 节流窗口按上次结果区分：
      //   成功 → 5 分钟（用户再打开小程序时会重新置为活跃，故不能锁一整天）
      //   未成功（尚未加入联盟 / 刚启动时 currentZone 还没恢复）→ 仅 60 秒，等分区就绪后能尽快重试
      const lastOk = wx.getStorageSync('lastAllianceActiveOk') === true
      const throttle = lastOk ? 5 * 60 * 1000 : 60 * 1000

      // 跨天必上报：昨天 23:58 标过（成功锁 5 分钟），今天 00:01 打开会被节流吃掉 → 新的一天标不上
      const today = beijingDateStr()
      const newDay = (wx.getStorageSync('lastAllianceActiveDate') || '') !== today

      // force 用于明确时机：onLaunch 那次往往拿不到 currentZone，
      // 若不放行 force，分区就绪后的上报会被 60 秒节流挡掉，导致一次都没登记上
      if (!force && !newDay && last && now - last < throttle) return null

      const zone = this.globalData.currentZone
      // storage 里"最后一次选择的联盟"（报名页 / 盟管控制台选中联盟时写入），交由云函数按分区分隔校验
      const preferred = wx.getStorageSync('lastAllianceId') ||
        wx.getStorageSync('lastBattleAllianceId') || ''

      // 先占位，避免同一时刻重复调用；日期记录保证跨天强制只触发一次
      wx.setStorageSync('lastAllianceActiveMark', now)
      wx.setStorageSync('lastAllianceActiveDate', today)

      const res = await wx.cloud.callFunction({
        name: 'manageAllianceActivity',
        data: {
          action: 'markSelfActive',
          zoneId: zone ? zone._id : '',
          preferredAllianceId: preferred
        }
      })
      const r = (res && res.result) || {}
      wx.setStorageSync('lastAllianceActiveOk', !!r.success)
      // 结果落 storage：联盟活跃页据此提示"我为什么没被登记"，便于自助排查
      wx.setStorageSync('lastAllianceActiveResult', {
        ok: !!r.success,
        error: r.error || '',
        nickName: r.nickName || '',
        allianceId: r.allianceId || '',
        time: now
      })
      if (r.success) {
        if (r.changed) console.log('[联盟活跃] 已标记今日活跃:', r.nickName)
      } else {
        // 业务性跳过（尚未加入联盟 / 无游戏昵称）：60 秒后自动重试
        console.log('[联盟活跃] 自动标记跳过:', r.error || '未知原因')
      }
      return r
    } catch (err) {
      wx.setStorageSync('lastAllianceActiveOk', false)
      wx.setStorageSync('lastAllianceActiveResult', {
        ok: false,
        error: (err && (err.errMsg || err.message)) || '云函数调用失败',
        nickName: '',
        allianceId: '',
        time: Date.now()
      })
      console.warn('[联盟活跃] 自动标记失败(将重试):', err)
      return null
    }
  },

  // 自动登录
  autoLogin: async function () {
    try {
      // 从本地缓存读取用户信息
      const cachedUserInfo = wx.getStorageSync('userInfo')
      const cachedOpenid = wx.getStorageSync('openid')

      if (cachedUserInfo && cachedOpenid) {
        console.log('使用缓存自动登录')
        this.globalData.userInfo = cachedUserInfo
        this.globalData.openid = cachedOpenid
        this.globalData.phone = cachedUserInfo.phone
        this.globalData.role = cachedUserInfo.role || 'user'

        // 检查超管身份
        if (cachedUserInfo.phone) {
          await this.checkSuperAdmin(cachedUserInfo.phone)
        } else {
          this.globalData.roleReady = true
        }
        return
      }

      // 没有缓存，尝试云函数登录
      this.checkLoginStatus()
    } catch (err) {
      console.error('自动登录失败:', err)
      this.globalData.roleReady = true
    }
  },

  // 检查登录状态
  checkLoginStatus: function () {
    const that = this

    wx.cloud.callFunction({
      name: 'login',
      config: {
        env: 'cloud1-9gip4qyf7e753868'
      },
      data: {},
      success: res => {
        console.log('云函数调用成功:', res)
        that.globalData.openid = res.result.openid
        wx.setStorageSync('openid', res.result.openid)
        that.getUserInfo(res.result.openid)
      },
      fail: err => {
        console.error('云函数调用失败:', err)
        that.globalData.roleReady = true
      }
    })
  },

  // 获取用户信息
  getUserInfo: async function (openid) {
    const that = this
    const db = wx.cloud.database()

    try {
      const res = await db.collection('users').where({
        openid: openid
      }).get()

      if (res.data.length > 0) {
        const userData = res.data[0]
        that.globalData.userInfo = userData
        that.globalData.role = userData.role || 'user'
        that.globalData.phone = userData.phone

        // 缓存用户信息
        wx.setStorageSync('userInfo', userData)

        // 检查是否为超管
        await that.checkSuperAdmin(userData.phone)
      } else {
        that.globalData.role = 'user'
        that.globalData.roleReady = true
      }
    } catch (err) {
      console.error('获取用户信息失败:', err)
      that.globalData.roleReady = true
    }
  },

  // 检查超管身份
  checkSuperAdmin: async function (phone) {
    console.log('检查超管身份, phone:', phone)
    if (!phone) {
      console.log('没有phone，跳过超管检查')
      this.globalData.roleReady = true
      return
    }

    const db = wx.cloud.database()
    try {
      const resStr = await db.collection('superAdmins').where({
        phone: phone
      }).get()
      console.log('字符串查询结果:', resStr.data)

      const resNum = await db.collection('superAdmins').where({
        phone: parseInt(phone, 10)
      }).get()
      console.log('数字查询结果:', resNum.data)

      if (resStr.data.length > 0 || resNum.data.length > 0) {
        this.globalData.role = 'superAdmin'
        console.log('检测到超管身份')
      }
      this.globalData.roleReady = true
    } catch (err) {
      console.error('检查超管身份失败:', err)
      this.globalData.roleReady = true
    }
  },

  // 更新用户角色
  updateRole: function (role) {
    this.globalData.role = role
    if (this.globalData.userInfo) {
      this.globalData.userInfo.role = role
      wx.setStorageSync('userInfo', this.globalData.userInfo)
    }
  },

  // 设置已启动标记
  setHasLaunched: function () {
    wx.setStorageSync('hasLaunched', true)
    this.globalData.firstLaunch = false
  },

  // 设置当前分区
  setCurrentZone: function (zone) {
    this.globalData.currentZone = zone
  },

  // 设置当前联盟
  setCurrentAlliance: function (alliance) {
    this.globalData.currentAlliance = alliance
  }
})