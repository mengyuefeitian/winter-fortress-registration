/**
 * 权限验证工具
 */

// 角色名称映射（中文名称）
const ROLE_NAMES = {
  user: '普通用户',
  admin: '区管',
  auditor: '盟管',
  superAdmin: '超级管理员'
}

// 获取角色显示名称
function getRoleDisplayName(role) {
  return ROLE_NAMES[role] || '未知角色'
}

// 角色权限映射
const ROLE_PERMISSIONS = {
  user: ['fortressRegistration', 'positionRegistration', 'applyAllianceManager', 'applyZoneManager', 'myRegistrations'],
  auditor: ['fortressTimeManage', 'positionTimeManage', 'clearData', 'statistics'],
  admin: ['fortressTimeManage', 'positionTimeManage', 'clearData', 'statistics', 'allianceConfig', 'reviewAllianceManager', 'positionManage'],
  superAdmin: ['zoneManage', 'reviewZoneManager', 'superAdminManage', 'fortressTimeManage', 'positionTimeManage', 'clearData', 'statistics', 'allianceConfig', 'reviewAllianceManager', 'positionManage']
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

// 检查是否可以申请盟管
function canApplyAllianceManager(role) {
  return role === 'user'
}

// 检查是否可以申请区管
function canApplyZoneManager(role) {
  return role === 'user'
}

// 检查是否可以审核盟管申请
function canReviewAllianceManager(role) {
  return role === 'admin' || role === 'superAdmin'
}

// 检查是否可以审核区管申请
function canReviewZoneManager(role) {
  return role === 'superAdmin'
}

// 检查是否可以管理官职
function canManagePosition(role) {
  return role === 'admin' || role === 'superAdmin'
}

// 检查是否可以管理超管
function canManageSuperAdmin(role) {
  return role === 'superAdmin'
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
  ROLE_PERMISSIONS,
  ROLE_NAMES,
  getRoleDisplayName,
  canApplyAllianceManager,
  canApplyZoneManager,
  canReviewAllianceManager,
  canReviewZoneManager,
  canManagePosition,
  canManageSuperAdmin
}