/**
 * 权限验证工具
 */

// 角色权限映射
const ROLE_PERMISSIONS = {
  user: ['registration', 'myRegistrations'],
  admin: ['zoneManage', 'allianceConfig', 'timeSlotConfig', 'statistics'],
  auditor: ['config', 'statistics'],
  superAdmin: ['adminReview', 'allStatistics', 'phoneManage', 'allianceManage', 'zoneManage', 'allianceConfig', 'timeSlotConfig']
}

// 检查是否有权限访问某个功能
function hasPermission(role, feature) {
  if (!ROLE_PERMISSIONS[role]) return false
  return ROLE_PERMISSIONS[role].includes(feature)
}

// 检查是否为管理员及以上角色
function isAdminOrAbove(role) {
  return role === 'admin' || role === 'auditor' || role === 'superAdmin'
}

// 检查是否为超级管理员
function isSuperAdmin(role) {
  return role === 'superAdmin'
}

// 检查是否可以管理分区
function canManageZone(role) {
  return role === 'admin' || role === 'superAdmin'
}

// 检查是否可以配置时间段
function canConfigTimeSlot(role) {
  return role === 'admin' || role === 'auditor' || role === 'superAdmin'
}

// 检查是否可以查看全局统计
function canViewAllStats(role) {
  return role === 'superAdmin'
}

// 检查是否可以审核管理员申请
function canReviewAdmin(role) {
  return role === 'superAdmin'
}

// 检查是否可以清空报名数据
function canClearRegistrations(role) {
  return role === 'admin' || role === 'auditor' || role === 'superAdmin'
}

module.exports = {
  hasPermission,
  isAdminOrAbove,
  isSuperAdmin,
  canManageZone,
  canConfigTimeSlot,
  canViewAllStats,
  canReviewAdmin,
  canClearRegistrations,
  ROLE_PERMISSIONS
}