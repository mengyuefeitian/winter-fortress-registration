// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 批量查询所有数据（突破默认100条限制）
async function getAllRecords(collection, whereCondition = {}) {
  const MAX_LIMIT = 100
  const allData = []

  // 先获取总数
  const countRes = await db.collection(collection).where(whereCondition).count()
  const total = countRes.total

  // 批量获取
  const batchTimes = Math.ceil(total / MAX_LIMIT)
  for (let i = 0; i < batchTimes; i++) {
    const res = await db.collection(collection).where(whereCondition)
      .skip(i * MAX_LIMIT)
      .limit(MAX_LIMIT)
      .get()
    allData.push(...res.data)
  }

  return allData
}

// 验证调用者是否为 admin 或 superAdmin
async function verifyAdminRole(openid) {
  const userRes = await db.collection('users').where({ openid }).get()
  if (userRes.data.length === 0) {
    throw new Error('用户不存在')
  }
  const user = userRes.data[0]
  const role = user.role || 'user'

  if (role === 'admin' || role === 'superAdmin') {
    return true
  }

  const phone = user.phone
  if (phone) {
    const saRes = await db.collection('superAdmins').where({ phone }).get()
    if (saRes.data.length > 0) return true
    const phoneNum = parseInt(phone, 10)
    if (!isNaN(phoneNum)) {
      const saNumRes = await db.collection('superAdmins').where({ phone: phoneNum }).get()
      if (saNumRes.data.length > 0) return true
    }
  }

  throw new Error('权限不足，仅区管和超级管理员可删除报名记录')
}

// 定时触发：读取 settings.autoClear 配置，时间匹配时执行清空
async function timedClearCheck() {
  let config
  try {
    const res = await db.collection('settings').doc('autoClear').get()
    config = res.data
  } catch (err) {
    console.log('未找到自动清空配置，跳过')
    return { success: true, message: '未配置自动清空' }
  }

  if (!config || !config.enabled) {
    console.log('自动清空未启用，跳过')
    return { success: true, message: '自动清空未启用' }
  }

  // 云函数运行时区默认为 UTC，需手动换算为北京时间（UTC+8）再比较，
  // 否则"周一0点"这类配置会整体偏移8小时
  const beijingNow = new Date(Date.now() + 8 * 60 * 60 * 1000)

  // config.day: 1=周一 ... 7=周日；getUTCDay(): 0=周日, 1=周一 ... 6=周六
  const jsDay = beijingNow.getUTCDay()
  const dayOfWeek = jsDay === 0 ? 7 : jsDay // 转为 1-7

  if (dayOfWeek !== config.day) {
    console.log(`今天是第${dayOfWeek}天，配置为第${config.day}天，跳过`)
    return { success: true, message: '今日不执行自动清空' }
  }

  const currentHour = beijingNow.getUTCHours()
  if (currentHour !== config.hour) {
    console.log(`当前小时${currentHour}，配置为${config.hour}时，跳过`)
    return { success: true, message: '当前时间不执行自动清空' }
  }

  console.log(`定时自动清空触发：周${dayOfWeek} ${config.hour}:00`)
  return await clearExpiredAll()
}

// 云函数入口函数
exports.main = async (event, context) => {
  const { action, data } = event

  // 定时触发器调用时 action 为 undefined
  if (!action) {
    return await timedClearCheck()
  }

  try {
    switch (action) {
      case 'clearByAlliance':
        return await clearByAlliance(data.allianceId)
      case 'clearByZone':
        return await clearByZone(data.zoneId)
      case 'clearAll':
        return await clearAll()
      case 'clearByTimeSlot':
        return await clearByTimeSlot(data.timeSlotId)
      case 'clearExpiredByAlliance':
        return await clearExpiredByAlliance(data.allianceId)
      case 'clearExpiredByZone':
        return await clearExpiredByZone(data.zoneId)
      case 'clearExpiredAll':
        return await clearExpiredAll()
      case 'adminDeleteBattleRegistration':
        return await adminDeleteBattleRegistration(data, context)
      case 'updateBattleRegistrationAssignment':
        return await updateBattleRegistrationAssignment(data, context)
      case 'deleteBattleConfig':
        return await deleteBattleConfig(data, context)
      default:
        return {
          err: 'Unknown action'
        }
    }
  } catch (err) {
    return {
      err: err.message
    }
  }
}

// 管理员更新国战报名分配（绕过客户端权限限制）
async function updateBattleRegistrationAssignment(data, context) {
  const { registrationId, assignment } = data || {}
  if (!registrationId) {
    throw new Error('缺少 registrationId 参数')
  }

  const wxContext = cloud.getWXContext()
  await verifyAdminRole(wxContext.OPENID)

  await db.collection('battleRegistrations').doc(registrationId).update({
    data: {
      assignment: assignment || '',
      updateTime: db.serverDate()
    }
  })

  return { success: true }
}

// 管理员删除单条国战报名记录（绕过客户端权限限制）
async function adminDeleteBattleRegistration(data, context) {
  const { registrationId } = data || {}
  if (!registrationId) {
    throw new Error('缺少 registrationId 参数')
  }

  const wxContext = cloud.getWXContext()
  await verifyAdminRole(wxContext.OPENID)

  await db.collection('battleRegistrations').doc(registrationId).remove()

  return { success: true }
}

// 删除国战配置及其所有报名（校验调用者必须管理该分区）
async function deleteBattleConfig(data, context) {
  const { configId } = data || {}
  if (!configId) {
    throw new Error('缺少 configId 参数')
  }

  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  // 读取配置，获取所属分区
  const configRes = await db.collection('battleConfigs').doc(configId).get()
  if (!configRes.data) {
    throw new Error('国战配置不存在')
  }
  const zoneId = configRes.data.zoneId

  // 校验调用者是否为超管，或是该分区的区管
  const userRes = await db.collection('users').where({ openid }).get()
  if (!userRes.data.length) throw new Error('用户不存在')
  const user = userRes.data[0]
  const role = user.role || 'user'

  if (role === 'superAdmin') {
    // 超管直接放行
  } else if (role === 'admin') {
    // 区管需校验分区归属
    const adminRes = await db.collection('admins').where({
      userId: openid,
      status: 'approved',
      zoneId: zoneId
    }).get()
    if (!adminRes.data.length) {
      throw new Error('无权删除其他分区的国战配置')
    }
  } else {
    throw new Error('权限不足')
  }

  // 先删报名记录，再删配置
  await db.collection('battleRegistrations').where({ configId }).remove()
  await db.collection('battleConfigs').doc(configId).remove()

  return { success: true }
}

// 解析各种格式的日期字符串为 Date 对象
// 支持格式：YYYY-MM-DD, YY/MM/DD, YYYY/MM/DD 等
function parseDate(dateStr) {
  if (!dateStr) return null

  // 尝试 YYYY-MM-DD 格式
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-')
    if (parts.length === 3) {
      const year = parseInt(parts[0])
      const month = parseInt(parts[1]) - 1
      const day = parseInt(parts[2])
      return new Date(year, month, day)
    }
  }

  // 尝试 YY/MM/DD 或 YYYY/MM/DD 格式
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/')
    if (parts.length === 3) {
      // 处理两位年份（如 26 -> 2026）
      let year = parseInt(parts[0])
      if (year < 100) {
        year += 2000 // 假设是 2000 年代
      }
      const month = parseInt(parts[1]) - 1
      const day = parseInt(parts[2])
      return new Date(year, month, day)
    }
  }

  return null
}

// 获取今天的日期对象和字符串（按北京时间计算，避免云函数 UTC 运行时区导致跨天误判）
function getTodayInfo() {
  const beijingNow = new Date(Date.now() + 8 * 60 * 60 * 1000)
  const year = beijingNow.getUTCFullYear()
  const month = beijingNow.getUTCMonth()
  const day = beijingNow.getUTCDate()
  const today = new Date(year, month, day) // 与 parseDate() 保持一致，用本地时区构造零点
  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return { dateObj: today, dateStr: dateStr }
}

// 判断日期是否过期（早于今天）
function isDateExpired(dateStr, todayObj) {
  if (!dateStr) return true // 无日期视为过期

  const dateObj = parseDate(dateStr)
  if (!dateObj) return true // 无法解析视为过期

  return dateObj < todayObj
}

// 按联盟清空报名数据（原有功能）
async function clearByAlliance(allianceId) {
  // 获取该联盟的所有时间段
  const timeSlotsRes = await db.collection('timeSlots').where({
    allianceId: allianceId,
    status: 'active'
  }).get()

  const timeSlotIds = timeSlotsRes.data.map(slot => slot._id)

  if (timeSlotIds.length === 0) {
    return {
      success: true,
      deletedCount: 0,
      message: '该联盟暂无时间段'
    }
  }

  // 删除这些时间段的报名记录
  const result = await db.collection('registrations').where({
    timeSlotId: _.in(timeSlotIds)
  }).remove()

  return {
    success: true,
    deletedCount: result.stats.removed,
    message: `已清空 ${result.stats.removed} 条报名记录`
  }
}

// 按分区清空报名数据（原有功能）
async function clearByZone(zoneId) {
  // 获取该分区的所有联盟
  const alliancesRes = await db.collection('alliances').where({
    zoneId: zoneId
  }).get()

  const allianceIds = alliancesRes.data.map(a => a._id)

  if (allianceIds.length === 0) {
    return {
      success: true,
      deletedCount: 0,
      message: '该分区暂无联盟'
    }
  }

  // 获取所有时间段
  const timeSlotsRes = await db.collection('timeSlots').where({
    allianceId: _.in(allianceIds),
    status: 'active'
  }).get()

  const timeSlotIds = timeSlotsRes.data.map(slot => slot._id)

  if (timeSlotIds.length === 0) {
    return {
      success: true,
      deletedCount: 0,
      message: '该分区暂无时间段'
    }
  }

  // 删除报名记录
  const result = await db.collection('registrations').where({
    timeSlotId: _.in(timeSlotIds)
  }).remove()

  return {
    success: true,
    deletedCount: result.stats.removed,
    message: `已清空 ${result.stats.removed} 条报名记录`
  }
}

// 清空所有报名数据（仅超级管理员）
async function clearAll() {
  const result = await db.collection('registrations').where({
    status: 'active'
  }).remove()

  return {
    success: true,
    deletedCount: result.stats.removed,
    message: `已清空全部 ${result.stats.removed} 条报名记录`
  }
}

// 按时间段清空报名数据
async function clearByTimeSlot(timeSlotId) {
  const result = await db.collection('registrations').where({
    timeSlotId: timeSlotId
  }).remove()

  return {
    success: true,
    deletedCount: result.stats.removed,
    message: `已清空 ${result.stats.removed} 条报名记录`
  }
}

// 盟管清空过期数据：清空今日之前的报名数据、时间段配置，以及孤立的报名记录
async function clearExpiredByAlliance(allianceId) {
  const { dateObj: todayObj, dateStr: today } = getTodayInfo()
  const results = {
    registrations: 0,
    timeSlots: 0,
    orphanRegistrations: 0,
    arsenalConfigs: 0,
    arsenalRegistrations: 0,
    canyonConfigs: 0,
    canyonRegistrations: 0
  }

  console.log('开始清空联盟数据, allianceId:', allianceId, '今天:', today)

  // 1. 获取该联盟的所有时间段（不管status，批量查询）
  const allTimeSlots = await getAllRecords('timeSlots', { allianceId: allianceId })
  console.log('查询到时间段数量:', allTimeSlots.length)

  // 打印所有时间段的日期信息，方便调试
  allTimeSlots.forEach(slot => {
    console.log('时间段:', slot._id, 'date:', slot.date, 'status:', slot.status)
  })

  const allTimeSlotIds = allTimeSlots.map(slot => slot._id)

  // 2. 找出需要删除的时间段（使用日期对象比较）
  const toDeleteTimeSlots = allTimeSlots.filter(slot => {
    if (!slot.status) return true // 无状态字段
    if (slot.status === 'inactive') return true // 已删除
    if (isDateExpired(slot.date, todayObj)) return true // 过期或无日期
    return false
  })

  console.log('需要删除的时间段数量:', toDeleteTimeSlots.length)
  const toDeleteTimeSlotIds = toDeleteTimeSlots.map(slot => slot._id)

  if (toDeleteTimeSlotIds.length > 0) {
    // 删除这些时间段的报名记录（通过timeSlotId删除）
    const regResult = await db.collection('registrations').where({
      timeSlotId: _.in(toDeleteTimeSlotIds)
    }).remove()
    results.registrations = regResult.stats.removed

    // 删除时间段配置
    const slotResult = await db.collection('timeSlots').where({
      _id: _.in(toDeleteTimeSlotIds)
    }).remove()
    results.timeSlots = slotResult.stats.removed
  }

  // 3. 清理兵工厂/峡谷过期配置和报名
  const toDeleteArsenalConfigs = (await getAllRecords('arsenalConfigs', { allianceId: allianceId }))
    .filter(cfg => !cfg.status || cfg.status === 'inactive' || isDateExpired(cfg.date, todayObj))
  const toDeleteArsenalConfigIds = toDeleteArsenalConfigs.map(c => c._id)

  if (toDeleteArsenalConfigIds.length > 0) {
    const arRegResult = await db.collection('arsenalRegistrations').where({
      configId: _.in(toDeleteArsenalConfigIds)
    }).remove()
    results.arsenalRegistrations = arRegResult.stats.removed

    const arConfigResult = await db.collection('arsenalConfigs').where({
      _id: _.in(toDeleteArsenalConfigIds)
    }).remove()
    results.arsenalConfigs = arConfigResult.stats.removed
  }

  const toDeleteCanyonConfigs = (await getAllRecords('canyonConfigs', { allianceId: allianceId }))
    .filter(cfg => !cfg.status || cfg.status === 'inactive' || isDateExpired(cfg.date, todayObj))
  const toDeleteCanyonConfigIds = toDeleteCanyonConfigs.map(c => c._id)

  if (toDeleteCanyonConfigIds.length > 0) {
    const cnRegResult = await db.collection('canyonRegistrations').where({
      configId: _.in(toDeleteCanyonConfigIds)
    }).remove()
    results.canyonRegistrations = cnRegResult.stats.removed

    const cnConfigResult = await db.collection('canyonConfigs').where({
      _id: _.in(toDeleteCanyonConfigIds)
    }).remove()
    results.canyonConfigs = cnConfigResult.stats.removed
  }

  // 4. 清理孤立的报名记录（报名记录对应的timeSlotId不存在或已删除）
  // 方法：直接查询所有报名记录，找出那些 timeSlotId 不在时间段列表中的
  const allRegistrations = await getAllRecords('registrations', { allianceId: allianceId })
  console.log('查询到报名记录数量（按allianceId）:', allRegistrations.length)

  // 找出活跃时间段的ID（使用日期对象比较）
  const activeTimeSlotIds = allTimeSlots
    .filter(slot => slot.status === 'active' && !isDateExpired(slot.date, todayObj))
    .map(slot => slot._id)

  // 找出孤立报名记录（timeSlotId不在活跃时间段列表中，或者timeSlotId为空）
  const orphanRegistrations = allRegistrations.filter(reg => {
    // 没有timeSlotId字段的旧数据
    if (!reg.timeSlotId) return true
    // timeSlotId不在活跃时间段列表中
    if (!activeTimeSlotIds.includes(reg.timeSlotId)) return true
    return false
  })

  const orphanRegIds = orphanRegistrations.map(reg => reg._id)
  console.log('孤立报名记录数量:', orphanRegIds.length)

  if (orphanRegIds.length > 0) {
    const orphanRegResult = await db.collection('registrations').where({
      _id: _.in(orphanRegIds)
    }).remove()
    results.orphanRegistrations = orphanRegResult.stats.removed
  }

  // 5. 清理没有 allianceId 的孤立报名记录（旧数据可能没有 allianceId）
  // 这部分记录无法通过 allianceId 查询到，需要通过 timeSlotId 反查
  if (allTimeSlotIds.length > 0) {
    // 获取所有可能的报名记录（通过 timeSlotId 查询）
    const regsByTimeSlot = await getAllRecords('registrations', { timeSlotId: _.in(allTimeSlotIds) })
    console.log('通过timeSlotId查询到的报名记录数量:', regsByTimeSlot.length)

    // 找出不属于当前活跃时间段的报名记录
    const additionalOrphanRegs = regsByTimeSlot.filter(reg => {
      if (!reg.timeSlotId) return true
      if (!activeTimeSlotIds.includes(reg.timeSlotId)) return true
      return false
    })

    const additionalOrphanIds = additionalOrphanRegs.map(reg => reg._id)
    console.log('额外孤立报名记录数量:', additionalOrphanIds.length)

    if (additionalOrphanIds.length > 0) {
      const additionalResult = await db.collection('registrations').where({
        _id: _.in(additionalOrphanIds)
      }).remove()
      results.orphanRegistrations += additionalResult.stats.removed
    }
  }

  console.log('清空结果:', results)
  return {
    success: true,
    data: results,
    message: `已清空：堡垒报名 ${results.registrations} 条，时间段 ${results.timeSlots} 个，兵工厂报名 ${results.arsenalRegistrations} 条，峡谷报名 ${results.canyonRegistrations} 条，孤立报名 ${results.orphanRegistrations} 条`
  }
}

// 区管清空过期数据：清空分区下所有联盟的过期数据、官职配置，以及孤立数据
async function clearExpiredByZone(zoneId) {
  const { dateObj: todayObj, dateStr: today } = getTodayInfo()
  const results = {
    registrations: 0,
    timeSlots: 0,
    positionConfigs: 0,
    positionRegistrations: 0,
    orphanRegistrations: 0,
    orphanPositionRegistrations: 0,
    arsenalConfigs: 0,
    arsenalRegistrations: 0,
    canyonConfigs: 0,
    canyonRegistrations: 0
  }

  console.log('开始清空分区数据, zoneId:', zoneId, '今天:', today)

  // 1. 获取该分区的所有联盟
  const allAlliances = await getAllRecords('alliances', { zoneId: zoneId })
  const allianceIds = allAlliances.map(a => a._id)
  console.log('分区联盟数量:', allianceIds.length)

  // 收集所有时间段（用于后续查询报名记录）
  let allTimeSlots = []

  if (allianceIds.length > 0) {
    // 获取所有时间段（批量查询）
    for (const allianceId of allianceIds) {
      const slots = await getAllRecords('timeSlots', { allianceId: allianceId })
      allTimeSlots.push(...slots)
    }
    console.log('查询到时间段数量:', allTimeSlots.length)

    // 打印所有时间段的日期信息
    allTimeSlots.forEach(slot => {
      console.log('时间段:', slot._id, 'allianceId:', slot.allianceId, 'date:', slot.date, 'status:', slot.status)
    })

    // 找出需要删除的时间段（使用日期对象比较）
    const toDeleteTimeSlots = allTimeSlots.filter(slot => {
      if (!slot.status) return true // 无状态字段
      if (slot.status === 'inactive') return true // 已删除
      if (isDateExpired(slot.date, todayObj)) return true // 过期或无日期
      return false
    })

    const toDeleteTimeSlotIds = toDeleteTimeSlots.map(slot => slot._id)
    console.log('需要删除的时间段数量:', toDeleteTimeSlotIds.length)

    if (toDeleteTimeSlotIds.length > 0) {
      // 删除报名记录（通过 timeSlotId 删除）
      const regResult = await db.collection('registrations').where({
        timeSlotId: _.in(toDeleteTimeSlotIds)
      }).remove()
      results.registrations = regResult.stats.removed

      // 删除时间段配置
      const slotResult = await db.collection('timeSlots').where({
        _id: _.in(toDeleteTimeSlotIds)
      }).remove()
      results.timeSlots = slotResult.stats.removed
    }

    // 找出活跃时间段的ID
    const activeTimeSlotIds = allTimeSlots
      .filter(slot => slot.status === 'active' && !isDateExpired(slot.date, todayObj))
      .map(slot => slot._id)
    console.log('活跃时间段数量:', activeTimeSlotIds.length)

    // 2. 清理孤立的堡垒报名记录
    // 方法1：通过 allianceId 查询报名记录
    const allRegistrations = []
    for (const allianceId of allianceIds) {
      const regs = await getAllRecords('registrations', { allianceId: allianceId })
      allRegistrations.push(...regs)
    }
    console.log('通过allianceId查询到报名记录数量:', allRegistrations.length)

    // 找出孤立报名记录
    const orphanRegistrations = allRegistrations.filter(reg => {
      if (!reg.timeSlotId) return true
      if (!activeTimeSlotIds.includes(reg.timeSlotId)) return true
      return false
    })

    const orphanRegIds = orphanRegistrations.map(reg => reg._id)
    console.log('孤立报名记录数量（方法1）:', orphanRegIds.length)

    if (orphanRegIds.length > 0) {
      const orphanRegResult = await db.collection('registrations').where({
        _id: _.in(orphanRegIds)
      }).remove()
      results.orphanRegistrations = orphanRegResult.stats.removed
    }

    // 方法2：通过 zoneId 直接查询报名记录（部分旧数据可能没有 allianceId 但有 zoneId）
    const regsByZone = await getAllRecords('registrations', { zoneId: zoneId })
    console.log('通过zoneId查询到报名记录数量:', regsByZone.length)

    const orphanByZone = regsByZone.filter(reg => {
      if (!reg.timeSlotId) return true
      if (!activeTimeSlotIds.includes(reg.timeSlotId)) return true
      return false
    })

    const orphanByZoneIds = orphanByZone.map(reg => reg._id)
    console.log('孤立报名记录数量（方法2）:', orphanByZoneIds.length)

    if (orphanByZoneIds.length > 0) {
      const orphanZoneResult = await db.collection('registrations').where({
        _id: _.in(orphanByZoneIds)
      }).remove()
      results.orphanRegistrations += orphanZoneResult.stats.removed
    }

    // 方法3：通过所有时间段ID查询报名记录（最全面）
    const allTimeSlotIds = allTimeSlots.map(slot => slot._id)
    if (allTimeSlotIds.length > 0) {
      const regsByTimeSlot = await getAllRecords('registrations', { timeSlotId: _.in(allTimeSlotIds) })
      console.log('通过timeSlotId查询到报名记录数量:', regsByTimeSlot.length)

      const orphanByTimeSlot = regsByTimeSlot.filter(reg => {
        if (!reg.timeSlotId) return true
        if (!activeTimeSlotIds.includes(reg.timeSlotId)) return true
        return false
      })

      const orphanByTimeSlotIds = orphanByTimeSlot.map(reg => reg._id)
      console.log('孤立报名记录数量（方法3）:', orphanByTimeSlotIds.length)

      if (orphanByTimeSlotIds.length > 0) {
        const orphanTimeSlotResult = await db.collection('registrations').where({
          _id: _.in(orphanByTimeSlotIds)
        }).remove()
        results.orphanRegistrations += orphanTimeSlotResult.stats.removed
      }
    }
  }

  // 2b. 清空兵工厂/峡谷过期配置和报名（按分区）
  if (allianceIds.length > 0) {
    const toDeleteArsenalConfigs = (await getAllRecords('arsenalConfigs', { zoneId: zoneId }))
      .filter(cfg => !cfg.status || cfg.status === 'inactive' || isDateExpired(cfg.date, todayObj))
    const toDeleteArsenalConfigIds = toDeleteArsenalConfigs.map(c => c._id)

    if (toDeleteArsenalConfigIds.length > 0) {
      const arRegResult = await db.collection('arsenalRegistrations').where({
        configId: _.in(toDeleteArsenalConfigIds)
      }).remove()
      results.arsenalRegistrations = arRegResult.stats.removed

      const arConfigResult = await db.collection('arsenalConfigs').where({
        _id: _.in(toDeleteArsenalConfigIds)
      }).remove()
      results.arsenalConfigs = arConfigResult.stats.removed
    }

    const toDeleteCanyonConfigs = (await getAllRecords('canyonConfigs', { zoneId: zoneId }))
      .filter(cfg => !cfg.status || cfg.status === 'inactive' || isDateExpired(cfg.date, todayObj))
    const toDeleteCanyonConfigIds = toDeleteCanyonConfigs.map(c => c._id)

    if (toDeleteCanyonConfigIds.length > 0) {
      const cnRegResult = await db.collection('canyonRegistrations').where({
        configId: _.in(toDeleteCanyonConfigIds)
      }).remove()
      results.canyonRegistrations = cnRegResult.stats.removed

      const cnConfigResult = await db.collection('canyonConfigs').where({
        _id: _.in(toDeleteCanyonConfigIds)
      }).remove()
      results.canyonConfigs = cnConfigResult.stats.removed
    }
  }

  // 3. 清空该分区下的官职配置和报名数据
  const allConfigs = await getAllRecords('positionConfigs', { zoneId: zoneId })
  console.log('查询到官职配置数量:', allConfigs.length)

  // 打印所有配置的日期信息
  allConfigs.forEach(config => {
    console.log('官职配置:', config._id, 'date:', config.date, 'status:', config.status)
  })

  const toDeleteConfigs = allConfigs.filter(config => {
    if (!config.status) return true // 无状态字段
    if (config.status === 'inactive') return true // 已删除
    if (isDateExpired(config.date, todayObj)) return true // 过期或无日期
    return false
  })

  const toDeleteConfigIds = toDeleteConfigs.map(c => c._id)
  console.log('需要删除的官职配置数量:', toDeleteConfigIds.length)

  if (toDeleteConfigIds.length > 0) {
    // 删除官职报名记录（通过 configId 删除）
    const posRegResult = await db.collection('positionRegistrations').where({
      configId: _.in(toDeleteConfigIds)
    }).remove()
    results.positionRegistrations = posRegResult.stats.removed

    // 删除官职配置
    const configResult = await db.collection('positionConfigs').where({
      _id: _.in(toDeleteConfigIds)
    }).remove()
    results.positionConfigs = configResult.stats.removed
  }

  // 4. 清理孤立的官职报名记录
  const allConfigIds = allConfigs.map(c => c._id)
  console.log('所有官职配置ID数量:', allConfigIds.length)

  // 找出活跃配置ID
  const activeConfigIds = allConfigs
    .filter(c => c.status === 'active' && !isDateExpired(c.date, todayObj))
    .map(c => c._id)
  console.log('活跃官职配置数量:', activeConfigIds.length)

  // 方法1：通过配置ID查询报名记录
  if (allConfigIds.length > 0) {
    const allPositionRegs = await getAllRecords('positionRegistrations', { configId: _.in(allConfigIds) })
    console.log('通过configId查询到官职报名记录数量:', allPositionRegs.length)

    const orphanPositionRegs = allPositionRegs.filter(reg => {
      if (!reg.configId) return true
      if (!activeConfigIds.includes(reg.configId)) return true
      return false
    })

    const orphanPosRegIds = orphanPositionRegs.map(reg => reg._id)
    console.log('孤立官职报名数量（方法1）:', orphanPosRegIds.length)

    if (orphanPosRegIds.length > 0) {
      const orphanPosRegResult = await db.collection('positionRegistrations').where({
        _id: _.in(orphanPosRegIds)
      }).remove()
      results.orphanPositionRegistrations = orphanPosRegResult.stats.removed
    }
  }

  console.log('清空结果:', results)
  return {
    success: true,
    data: results,
    message: `已清空：堡垒报名 ${results.registrations} 条，时间段 ${results.timeSlots} 个，兵工厂报名 ${results.arsenalRegistrations} 条，峡谷报名 ${results.canyonRegistrations} 条，官职报名 ${results.positionRegistrations} 条，官职配置 ${results.positionConfigs} 个，孤立数据 ${results.orphanRegistrations + results.orphanPositionRegistrations} 条`
  }
}

// 超管清空所有过期数据和孤立数据
async function clearExpiredAll() {
  const { dateObj: todayObj, dateStr: today } = getTodayInfo()
  const results = {
    registrations: 0,
    timeSlots: 0,
    positionConfigs: 0,
    positionRegistrations: 0,
    orphanRegistrations: 0,
    orphanPositionRegistrations: 0,
    arsenalConfigs: 0,
    arsenalRegistrations: 0,
    canyonConfigs: 0,
    canyonRegistrations: 0,
    battleConfigs: 0,
    battleRegistrations: 0
  }

  console.log('开始清空所有数据, 今天:', today)

  // 1. 清空所有时间段和报名数据（批量查询）
  const allTimeSlots = await getAllRecords('timeSlots')
  console.log('查询到时间段数量:', allTimeSlots.length)

  // 打印所有时间段的日期信息
  allTimeSlots.forEach(slot => {
    console.log('时间段:', slot._id, 'date:', slot.date, 'status:', slot.status)
  })

  const toDeleteTimeSlots = allTimeSlots.filter(slot => {
    if (!slot.status) return true // 无状态字段
    if (slot.status === 'inactive') return true // 已删除
    if (isDateExpired(slot.date, todayObj)) return true // 过期或无日期
    return false
  })

  const toDeleteTimeSlotIds = toDeleteTimeSlots.map(slot => slot._id)
  console.log('需要删除的时间段数量:', toDeleteTimeSlotIds.length)

  if (toDeleteTimeSlotIds.length > 0) {
    // 删除报名记录
    const regResult = await db.collection('registrations').where({
      timeSlotId: _.in(toDeleteTimeSlotIds)
    }).remove()
    results.registrations = regResult.stats.removed

    // 删除时间段配置
    const slotResult = await db.collection('timeSlots').where({
      _id: _.in(toDeleteTimeSlotIds)
    }).remove()
    results.timeSlots = slotResult.stats.removed
  }

  // 清理孤立的堡垒报名记录
  const allRegistrations = await getAllRecords('registrations')
  console.log('查询到报名记录数量:', allRegistrations.length)

  const activeTimeSlotIds = allTimeSlots
    .filter(slot => slot.status === 'active' && !isDateExpired(slot.date, todayObj))
    .map(slot => slot._id)

  const orphanRegistrations = allRegistrations.filter(reg => {
    if (!reg.timeSlotId) return true
    if (!activeTimeSlotIds.includes(reg.timeSlotId)) return true
    return false
  })

  const orphanRegIds = orphanRegistrations.map(reg => reg._id)
  console.log('孤立报名记录数量:', orphanRegIds.length)

  if (orphanRegIds.length > 0) {
    const orphanRegResult = await db.collection('registrations').where({
      _id: _.in(orphanRegIds)
    }).remove()
    results.orphanRegistrations = orphanRegResult.stats.removed
  }

  // 2. 清空所有官职配置和报名数据
  const allConfigs = await getAllRecords('positionConfigs')
  console.log('查询到官职配置数量:', allConfigs.length)

  // 打印所有配置的日期信息
  allConfigs.forEach(config => {
    console.log('官职配置:', config._id, 'date:', config.date, 'status:', config.status)
  })

  const toDeleteConfigs = allConfigs.filter(config => {
    if (!config.status) return true // 无状态字段
    if (config.status === 'inactive') return true // 已删除
    if (isDateExpired(config.date, todayObj)) return true // 过期或无日期
    return false
  })

  const toDeleteConfigIds = toDeleteConfigs.map(c => c._id)
  console.log('需要删除的官职配置数量:', toDeleteConfigIds.length)

  if (toDeleteConfigIds.length > 0) {
    // 删除官职报名记录
    const posRegResult = await db.collection('positionRegistrations').where({
      configId: _.in(toDeleteConfigIds)
    }).remove()
    results.positionRegistrations = posRegResult.stats.removed

    // 删除官职配置
    const configResult = await db.collection('positionConfigs').where({
      _id: _.in(toDeleteConfigIds)
    }).remove()
    results.positionConfigs = configResult.stats.removed
  }

  // 清理孤立的官职报名记录
  const allPositionRegs = await getAllRecords('positionRegistrations')
  console.log('查询到官职报名记录数量:', allPositionRegs.length)

  const activeConfigIds = allConfigs
    .filter(c => c.status === 'active' && !isDateExpired(c.date, todayObj))
    .map(c => c._id)

  const orphanPositionRegs = allPositionRegs.filter(reg => {
    if (!reg.configId) return true
    if (!activeConfigIds.includes(reg.configId)) return true
    return false
  })

  const orphanPosRegIds = orphanPositionRegs.map(reg => reg._id)
  console.log('孤立官职报名数量:', orphanPosRegIds.length)

  if (orphanPosRegIds.length > 0) {
    const orphanPosRegResult = await db.collection('positionRegistrations').where({
      _id: _.in(orphanPosRegIds)
    }).remove()
    results.orphanPositionRegistrations = orphanPosRegResult.stats.removed
  }

  // 3. 清空所有兵工厂/峡谷过期配置和报名
  const toDeleteArsenalConfigs = (await getAllRecords('arsenalConfigs'))
    .filter(cfg => !cfg.status || cfg.status === 'inactive' || isDateExpired(cfg.date, todayObj))
  const toDeleteArsenalConfigIds = toDeleteArsenalConfigs.map(c => c._id)

  if (toDeleteArsenalConfigIds.length > 0) {
    const arRegResult = await db.collection('arsenalRegistrations').where({
      configId: _.in(toDeleteArsenalConfigIds)
    }).remove()
    results.arsenalRegistrations = arRegResult.stats.removed

    const arConfigResult = await db.collection('arsenalConfigs').where({
      _id: _.in(toDeleteArsenalConfigIds)
    }).remove()
    results.arsenalConfigs = arConfigResult.stats.removed
  }

  const toDeleteCanyonConfigs = (await getAllRecords('canyonConfigs'))
    .filter(cfg => !cfg.status || cfg.status === 'inactive' || isDateExpired(cfg.date, todayObj))
  const toDeleteCanyonConfigIds = toDeleteCanyonConfigs.map(c => c._id)

  if (toDeleteCanyonConfigIds.length > 0) {
    const cnRegResult = await db.collection('canyonRegistrations').where({
      configId: _.in(toDeleteCanyonConfigIds)
    }).remove()
    results.canyonRegistrations = cnRegResult.stats.removed

    const cnConfigResult = await db.collection('canyonConfigs').where({
      _id: _.in(toDeleteCanyonConfigIds)
    }).remove()
    results.canyonConfigs = cnConfigResult.stats.removed
  }

  // 4. 清空所有过期国战配置和报名数据
  const allBattleConfigs = await getAllRecords('battleConfigs')
  console.log('查询到国战配置数量:', allBattleConfigs.length)

  allBattleConfigs.forEach(cfg => {
    console.log('国战配置:', cfg._id, 'date:', cfg.date, 'status:', cfg.status)
  })

  const toDeleteBattleConfigs = allBattleConfigs.filter(cfg => {
    if (!cfg.status) return true // 无状态字段
    if (cfg.status === 'inactive') return true // 已删除
    if (isDateExpired(cfg.date, todayObj)) return true // 过期或无日期
    return false
  })

  const toDeleteBattleConfigIds = toDeleteBattleConfigs.map(c => c._id)
  console.log('需要删除的国战配置数量:', toDeleteBattleConfigIds.length)

  if (toDeleteBattleConfigIds.length > 0) {
    // 先删除对应的国战报名记录
    const battleRegResult = await db.collection('battleRegistrations').where({
      configId: _.in(toDeleteBattleConfigIds)
    }).remove()
    results.battleRegistrations = battleRegResult.stats.removed

    // 再删除国战配置
    const battleConfigResult = await db.collection('battleConfigs').where({
      _id: _.in(toDeleteBattleConfigIds)
    }).remove()
    results.battleConfigs = battleConfigResult.stats.removed
  }

  console.log('清空结果:', results)
  return {
    success: true,
    data: results,
    message: `已清空全部数据：堡垒报名 ${results.registrations} 条，时间段 ${results.timeSlots} 个，兵工厂报名 ${results.arsenalRegistrations} 条，峡谷报名 ${results.canyonRegistrations} 条，官职报名 ${results.positionRegistrations} 条，官职配置 ${results.positionConfigs} 个，国战报名 ${results.battleRegistrations} 条，国战配置 ${results.battleConfigs} 个，孤立数据 ${results.orphanRegistrations + results.orphanPositionRegistrations} 条`
  }
}
