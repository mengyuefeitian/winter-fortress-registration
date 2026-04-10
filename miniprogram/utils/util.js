/**
 * 通用工具函数
 */

/**
 * 格式化时间
 * @param {Date|string|number} date 日期对象、字符串或时间戳
 * @param {string} format 格式化模板，如 'YYYY-MM-DD HH:mm:ss'
 * @returns {string} 格式化后的时间字符串
 */
function formatDate(date, format = 'YYYY-MM-DD HH:mm:ss') {
  if (!date) return ''

  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const seconds = String(d.getSeconds()).padStart(2, '0')

  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds)
}

/**
 * 格式化时间段显示名称
 * @param {string} timeValue 基础时间值，如 '15:00'
 * @param {number} slotIndex 序号
 * @returns {string} 显示名称，如 '15点' 或 '15点-2'
 */
function formatTimeSlotName(timeValue, slotIndex) {
  // 将时间格式转换为更友好的显示格式
  const hourMap = {
    '10:00': '10点',
    '12:00': '12点',
    '15:00': '15点',
    '19:30': '19点30',
    '21:00': '21点'
  }

  const baseName = hourMap[timeValue] || timeValue
  return slotIndex > 1 ? `${baseName}-${slotIndex}` : baseName
}

/**
 * 验证分区编号格式
 * @param {string} code 分区编号
 * @returns {boolean} 是否有效
 */
function validateZoneCode(code) {
  // 必须是4位数字，范围0001-9999
  const regex = /^[0-9]{4}$/
  if (!regex.test(code)) return false

  const num = parseInt(code, 10)
  return num >= 1 && num <= 9999
}

/**
 * 验证手机号格式
 * @param {string} phone 手机号
 * @returns {boolean} 是否有效
 */
function validatePhone(phone) {
  const regex = /^1[3-9]\d{9}$/
  return regex.test(phone)
}

/**
 * 显示加载提示
 * @param {string} title 提示文字
 */
function showLoading(title = '加载中...') {
  wx.showLoading({
    title: title,
    mask: true
  })
}

/**
 * 隐藏加载提示
 */
function hideLoading() {
  wx.hideLoading()
}

/**
 * 显示成功提示
 * @param {string} title 提示文字
 */
function showSuccess(title) {
  wx.showToast({
    title: title,
    icon: 'success',
    duration: 2000
  })
}

/**
 * 显示错误提示
 * @param {string} title 提示文字
 */
function showError(title) {
  wx.showToast({
    title: title,
    icon: 'error',
    duration: 2000
  })
}

/**
 * 显示普通提示
 * @param {string} title 提示文字
 */
function showInfo(title) {
  wx.showToast({
    title: title,
    icon: 'none',
    duration: 2000
  })
}

/**
 * 显示确认对话框
 * @param {string} title 标题
 * @param {string} content 内容
 * @returns {Promise<boolean>} 用户是否确认
 */
function showConfirm(title, content) {
  return new Promise((resolve) => {
    wx.showModal({
      title: title,
      content: content,
      success: (res) => {
        resolve(res.confirm)
      }
    })
  })
}

/**
 * 深拷贝对象
 * @param {Object} obj 要拷贝的对象
 * @returns {Object} 拷贝后的对象
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj

  const clone = Array.isArray(obj) ? [] : {}
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      clone[key] = deepClone(obj[key])
    }
  }
  return clone
}

/**
 * 生成唯一ID
 * @returns {string} 唯一ID
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

/**
 * 防抖函数
 * @param {Function} fn 要防抖的函数
 * @param {number} delay 延迟时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
function debounce(fn, delay = 300) {
  let timer = null
  return function (...args) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      fn.apply(this, args)
    }, delay)
  }
}

/**
 * 节流函数
 * @param {Function} fn 要节流的函数
 * @param {number} delay 延迟时间（毫秒）
 * @returns {Function} 节流后的函数
 */
function throttle(fn, delay = 300) {
  let lastTime = 0
  return function (...args) {
    const now = Date.now()
    if (now - lastTime >= delay) {
      lastTime = now
      fn.apply(this, args)
    }
  }
}

/**
 * 获取日期字符串
 * @returns {string} YYYY-MM-DD格式的日期字符串
 */
function getDateString() {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 时间段是否已满
 * @param {number} count 当前报名人数
 * @param {number} maxCount 最大人数
 * @returns {boolean} 是否已满
 */
function isTimeSlotFull(count, maxCount = 15) {
  return count >= maxCount
}

/**
 * 获取角色显示名称
 * @param {string} role 角色
 * @returns {string} 角色显示名称
 */
function getRoleName(role) {
  const roleMap = {
    user: '普通用户',
    admin: '管理员',
    auditor: '审计员',
    superAdmin: '超级管理员'
  }
  return roleMap[role] || '未知角色'
}

/**
 * 获取位置显示名称
 * @param {string} position 位置
 * @returns {string} 位置显示名称
 */
function getPositionName(position) {
  const positionMap = {
    head: '车头',
    body: '车身'
  }
  return positionMap[position] || '未知位置'
}

module.exports = {
  formatDate,
  formatTimeSlotName,
  validateZoneCode,
  validatePhone,
  showLoading,
  hideLoading,
  showSuccess,
  showError,
  showInfo,
  showConfirm,
  deepClone,
  generateId,
  debounce,
  throttle,
  getDateString,
  isTimeSlotFull,
  getRoleName,
  getPositionName
}