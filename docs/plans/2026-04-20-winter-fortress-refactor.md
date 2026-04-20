# 冬日堡垒小程序全面重构实施计划

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 重构微信小程序，采用极简专业高端的UI风格（参考Linear/Stripe），重构权限系统（区管/盟管），新增官职报名和管理功能，优化数据管理规则。

**Architecture:** 
- 保持现有的分层架构（页面→工具→云函数→数据），但全面改造UI样式系统
- 重构权限系统，新增官职报名相关的数据集合和云函数
- 采用原子化任务分解，每个任务2-5分钟

**Tech Stack:** 微信小程序原生开发、微信云开发、云数据库

---

## Phase 1: 基础架构更新

### Task 1.1: 更新权限系统常量和角色名称

**Objective:** 在 auth.js 中更新角色名称映射和权限定义

**Files:**
- Modify: `miniprogram/utils/auth.js:1-64`

**Step 1: 更新角色名称映射**

在 auth.js 开头添加角色名称映射：

```javascript
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
```

**Step 2: 更新权限定义**

修改 ROLE_PERMISSIONS：

```javascript
const ROLE_PERMISSIONS = {
  user: ['fortressRegistration', 'positionRegistration', 'applyAllianceManager', 'applyZoneManager', 'myRegistrations'],
  auditor: ['fortressTimeManage', 'positionTimeManage', 'clearData', 'statistics'],
  admin: ['fortressTimeManage', 'positionTimeManage', 'clearData', 'statistics', 'allianceConfig', 'reviewAllianceManager', 'positionManage'],
  superAdmin: ['zoneManage', 'reviewZoneManager', 'superAdminManage', 'fortressTimeManage', 'positionTimeManage', 'clearData', 'statistics', 'allianceConfig', 'reviewAllianceManager', 'positionManage']
}
```

**Step 3: 更新权限检查函数**

添加新的权限检查函数：

```javascript
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
```

**Step 4: 更新导出**

```javascript
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
```

**Step 5: Commit**

```bash
git add miniprogram/utils/auth.js
git commit -m "refactor: update role names (区管/盟管) and permission system"
```

---

### Task 1.2: 更新 util.js 中的角色名称映射

**Objective:** 同步更新 util.js 中的角色名称显示函数

**Files:**
- Modify: `miniprogram/utils/util.js`

**Step 1: 更新 getRoleName 函数**

找到现有的 getRoleName 函数，修改为：

```javascript
function getRoleName(role) {
  const roleMap = {
    'user': '普通用户',
    'admin': '区管',
    'auditor': '盟管',
    'superAdmin': '超级管理员'
  }
  return roleMap[role] || '未知'
}
```

**Step 2: Commit**

```bash
git add miniprogram/utils/util.js
git commit -m "refactor: update role name mapping in util.js"
```

---

### Task 1.3: 创建新的全局样式系统（极简风格）

**Objective:** 创建符合 Linear/Stripe 设计美学的全局样式系统

**Files:**
- Modify: `miniprogram/app.wxss` (完全重写)

**设计原则：**
- 极简、专业、高端
- 大量留白、清晰的视觉层次
- 使用微妙的阴影和边框而非厚重样式
- 统一的间距系统（4px基础单位）
- 简洁的配色：主色调改为更沉稳的深蓝/黑色系

**Step 1: 重写 app.wxss**

完全重写样式文件：

```css
/* ========================================
   冬日堡垒 - 极简设计系统
   参考 Linear/Stripe 设计美学
   ======================================== */

/* 设计变量（通过注释定义，小程序不支持CSS变量） */
/* 主色: #1a1a2e 深夜蓝 */
/* 次色: #16213e 海军蓝 */
/* 强调色: #0f3460 皇家蓝 */
/* 高亮色: #e94560 珊瑚红（用于重要操作） */
/* 成功色: #00d26a 翠绿 */
/* 背景色: #fafbfc 浅灰白 */
/* 卡片背景: #ffffff */
/* 文字主色: #111827 */
/* 文字次色: #6b7280 */
/* 文字弱色: #9ca3af */
/* 边框色: #e5e7eb */
/* 分割线: #f3f4f6 */

/* ========================================
   基础样式
   ======================================== */

page {
  background-color: #fafbfc;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 16px;
  color: #111827;
  line-height: 1.5;
}

/* 清除默认边距 */
view, text, button, input {
  box-sizing: border-box;
}

/* ========================================
   间距系统 (基于4px)
   ======================================== */

.mt-4 { margin-top: 4px; }
.mt-8 { margin-top: 8px; }
.mt-12 { margin-top: 12px; }
.mt-16 { margin-top: 16px; }
.mt-20 { margin-top: 20px; }
.mt-24 { margin-top: 24px; }
.mt-32 { margin-top: 32px; }
.mt-40 { margin-top: 40px; }
.mt-48 { margin-top: 48px; }

.mb-4 { margin-bottom: 4px; }
.mb-8 { margin-bottom: 8px; }
.mb-12 { margin-bottom: 12px; }
.mb-16 { margin-bottom: 16px; }
.mb-20 { margin-bottom: 20px; }
.mb-24 { margin-bottom: 24px; }
.mb-32 { margin-bottom: 32px; }

.ml-4 { margin-left: 4px; }
.ml-8 { margin-left: 8px; }
.ml-12 { margin-left: 12px; }
.ml-16 { margin-left: 16px; }

.mr-4 { margin-right: 4px; }
.mr-8 { margin-right: 8px; }
.mr-12 { margin-right: 12px; }
.mr-16 { margin-right: 16px; }

.p-4 { padding: 4px; }
.p-8 { padding: 8px; }
.p-12 { padding: 12px; }
.p-16 { padding: 16px; }
.p-20 { padding: 20px; }
.p-24 { padding: 24px; }

.px-4 { padding-left: 4px; padding-right: 4px; }
.px-8 { padding-left: 8px; padding-right: 8px; }
.px-12 { padding-left: 12px; padding-right: 12px; }
.px-16 { padding-left: 16px; padding-right: 16px; }
.px-20 { padding-left: 20px; padding-right: 20px; }
.px-24 { padding-left: 24px; padding-right: 24px; }

.py-4 { padding-top: 4px; padding-bottom: 4px; }
.py-8 { padding-top: 8px; padding-bottom: 8px; }
.py-12 { padding-top: 12px; padding-bottom: 12px; }
.py-16 { padding-top: 16px; padding-bottom: 16px; }

/* ========================================
   布局系统
   ======================================== */

.flex { display: flex; }
.flex-col { flex-direction: column; }
.flex-row { flex-direction: row; }
.flex-wrap { flex-wrap: wrap; }
.items-start { align-items: flex-start; }
.items-center { align-items: center; }
.items-end { align-items: flex-end; }
.items-stretch { align-items: stretch; }
.justify-start { justify-content: flex-start; }
.justify-center { justify-content: center; }
.justify-end { justify-content: flex-end; }
.justify-between { justify-content: space-between; }
.justify-around { justify-content: space-around; }
.flex-1 { flex: 1; }
.flex-shrink-0 { flex-shrink: 0; }

/* ========================================
   文字样式
   ======================================== */

.text-xs { font-size: 12px; line-height: 16px; }
.text-sm { font-size: 14px; line-height: 20px; }
.text-base { font-size: 16px; line-height: 24px; }
.text-lg { font-size: 18px; line-height: 28px; }
.text-xl { font-size: 20px; line-height: 28px; }
.text-2xl { font-size: 24px; line-height: 32px; }
.text-3xl { font-size: 30px; line-height: 36px; }

.font-normal { font-weight: 400; }
.font-medium { font-weight: 500; }
.font-semibold { font-weight: 600; }
.font-bold { font-weight: 700; }

.text-primary { color: #111827; }
.text-secondary { color: #6b7280; }
.text-weak { color: #9ca3af; }
.text-accent { color: #1a1a2e; }
.text-success { color: #00d26a; }
.text-danger { color: #e94560; }
.text-white { color: #ffffff; }

.text-center { text-align: center; }
.text-left { text-align: left; }
.text-right { text-align: right; }

/* ========================================
   卡片样式（极简风格）
   ======================================== */

.card {
  background-color: #ffffff;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 16px;
  border: 1px solid #e5e7eb;
}

.card-flat {
  background-color: #ffffff;
  padding: 20px;
  margin-bottom: 16px;
  border-bottom: 1px solid #e5e7eb;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 16px;
  border-bottom: 1px solid #f3f4f6;
  margin-bottom: 16px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
}

.card-subtitle {
  font-size: 14px;
  color: #6b7280;
  margin-top: 4px;
}

.card-body {
  padding: 0;
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-top: 16px;
  border-top: 1px solid #f3f4f6;
  margin-top: 16px;
}

/* ========================================
   按钮样式（极简风格）
   ======================================== */

.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 40px;
  padding: 0 16px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 6px;
  border: none;
  transition: all 0.15s ease;
  cursor: pointer;
}

.btn-sm {
  height: 32px;
  padding: 0 12px;
  font-size: 13px;
  border-radius: 4px;
}

.btn-lg {
  height: 48px;
  padding: 0 24px;
  font-size: 16px;
  border-radius: 8px;
}

.btn-primary {
  background-color: #1a1a2e;
  color: #ffffff;
}

.btn-primary:active {
  background-color: #16213e;
}

.btn-secondary {
  background-color: #f3f4f6;
  color: #111827;
}

.btn-secondary:active {
  background-color: #e5e7eb;
}

.btn-accent {
  background-color: #e94560;
  color: #ffffff;
}

.btn-accent:active {
  background-color: #d63850;
}

.btn-outline {
  background-color: transparent;
  color: #1a1a2e;
  border: 1px solid #1a1a2e;
}

.btn-outline:active {
  background-color: #f3f4f6;
}

.btn-ghost {
  background-color: transparent;
  color: #6b7280;
}

.btn-ghost:active {
  background-color: #f3f4f6;
}

.btn-danger {
  background-color: #e94560;
  color: #ffffff;
}

.btn-danger:active {
  background-color: #d63850;
}

.btn-success {
  background-color: #00d26a;
  color: #ffffff;
}

.btn-success:active {
  background-color: #00b85c;
}

.btn-disabled {
  opacity: 0.5;
  pointer-events: none;
}

.btn-full {
  width: 100%;
}

/* ========================================
   输入框样式
   ======================================== */

.input {
  height: 40px;
  padding: 0 12px;
  font-size: 14px;
  background-color: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  color: #111827;
}

.input:focus {
  border-color: #1a1a2e;
}

.input-placeholder {
  color: #9ca3af;
}

.input-error {
  border-color: #e94560;
}

.input-sm {
  height: 32px;
  padding: 0 8px;
  font-size: 13px;
  border-radius: 4px;
}

.input-lg {
  height: 48px;
  padding: 0 16px;
  font-size: 16px;
  border-radius: 8px;
}

/* ========================================
   标签样式
   ======================================== */

.tag {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 4px;
}

.tag-default {
  background-color: #f3f4f6;
  color: #6b7280;
}

.tag-primary {
  background-color: #1a1a2e;
  color: #ffffff;
}

.tag-success {
  background-color: #d1fae5;
  color: #00d26a;
}

.tag-danger {
  background-color: #fee2e2;
  color: #e94560;
}

.tag-warning {
  background-color: #fef3c7;
  color: #d97706;
}

/* ========================================
   表格样式（新增）
   ======================================== */

.table {
  width: 100%;
  background-color: #ffffff;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  overflow: hidden;
}

.table-header {
  display: flex;
  background-color: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  padding: 12px 16px;
}

.table-row {
  display: flex;
  border-bottom: 1px solid #f3f4f6;
  padding: 12px 16px;
  align-items: center;
}

.table-row:last-child {
  border-bottom: none;
}

.table-row:active {
  background-color: #f9fafb;
}

.table-cell {
  flex: 1;
  padding: 0 8px;
  font-size: 14px;
  color: #111827;
}

.table-cell-header {
  font-weight: 600;
  color: #6b7280;
  font-size: 12px;
}

.table-cell-fixed {
  flex: none;
  width: 80px;
}

.table-cell-time {
  flex: none;
  width: 60px;
  font-weight: 500;
  color: #1a1a2e;
}

.table-cell-name {
  flex: 2;
}

.table-cell-remark {
  flex: 2;
  color: #6b7280;
}

/* ========================================
   座位选择样式（官职报名）
   ======================================== */

.seat-table {
  background-color: #ffffff;
  border-radius: 8px;
  padding: 16px;
}

.seat-row {
  display: flex;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #f3f4f6;
}

.seat-row:last-child {
  border-bottom: none;
}

.seat-time {
  width: 60px;
  font-size: 14px;
  font-weight: 500;
  color: #1a1a2e;
  flex-shrink: 0;
}

.seat-cell {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.seat-name {
  min-width: 80px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  background-color: #f3f4f6;
  border-radius: 4px;
  color: #9ca3af;
}

.seat-name.filled {
  background-color: #1a1a2e;
  color: #ffffff;
}

.seat-name.filled-other {
  background-color: #e5e7eb;
  color: #6b7280;
}

.seat-name.my-seat {
  background-color: #e94560;
  color: #ffffff;
}

.seat-remark {
  flex: 1;
  font-size: 12px;
  color: #6b7280;
}

.seat-remark-input {
  flex: 1;
  height: 28px;
  font-size: 12px;
  padding: 0 8px;
  background-color: #fafbfc;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
}

/* ========================================
   空状态样式
   ======================================== */

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
}

.empty-icon {
  width: 64px;
  height: 64px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-text {
  font-size: 14px;
  color: #6b7280;
  margin-bottom: 8px;
}

.empty-action {
  margin-top: 16px;
}

/* ========================================
   加载状态样式
   ======================================== */

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
}

.loading-text {
  font-size: 14px;
  color: #6b7280;
  margin-top: 12px;
}

/* ========================================
   分割线和间隙
   ======================================== */

.divider {
  height: 1px;
  background-color: #e5e7eb;
  margin: 16px 0;
}

.divider-thick {
  height: 8px;
  background-color: #f3f4f6;
  margin: 16px 0;
}

.gap-4 { gap: 4px; }
.gap-8 { gap: 8px; }
.gap-12 { gap: 12px; }
.gap-16 { gap: 16px; }
.gap-20 { gap: 20px; }
.gap-24 { gap: 24px; }

/* ========================================
   导航栏样式（覆盖）
   ======================================== */

/* 通过 app.json 设置 */
/* navigationBarBackgroundColor: #1a1a2e */
/* navigationBarTextStyle: white */

/* ========================================
   功能卡片（首页）
   ======================================== */

.function-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.function-card {
  display: flex;
  align-items: center;
  padding: 16px;
  background-color: #ffffff;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.function-card:active {
  background-color: #f9fafb;
}

.function-icon {
  width: 40px;
  height: 40px;
  margin-right: 12px;
  flex-shrink: 0;
}

.function-content {
  flex: 1;
}

.function-name {
  font-size: 15px;
  font-weight: 500;
  color: #111827;
}

.function-desc {
  font-size: 13px;
  color: #6b7280;
  margin-top: 4px;
}

.function-arrow {
  width: 20px;
  height: 20px;
  color: #9ca3af;
}

/* ========================================
   状态指示
   ======================================== */

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 8px;
}

.status-dot-success {
  background-color: #00d26a;
}

.status-dot-warning {
  background-color: #f59e0b;
}

.status-dot-danger {
  background-color: #e94560;
}

.status-dot-neutral {
  background-color: #9ca3af;
}

/* ========================================
   角色卡片
   ======================================== */

.role-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 16px;
  background-color: #ffffff;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  flex: 1;
}

.role-card.active {
  border-color: #1a1a2e;
  background-color: #f9fafb;
}

.role-card.disabled {
  opacity: 0.5;
}

.role-icon {
  width: 48px;
  height: 48px;
  margin-bottom: 12px;
}

.role-name {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
}

.role-desc {
  font-size: 12px;
  color: #6b7280;
  margin-top: 4px;
  text-align: center;
}

/* ========================================
   时间段卡片
   ======================================== */

.time-slot-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.time-slot-card {
  display: flex;
  align-items: center;
  padding: 16px;
  background-color: #ffffff;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.time-slot-card.full {
  opacity: 0.6;
  background-color: #f9fafb;
}

.time-slot-card:active:not(.full) {
  background-color: #f9fafb;
}

.slot-time {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a2e;
  width: 60px;
}

.slot-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.slot-count {
  font-size: 14px;
  color: #111827;
}

.slot-remark {
  font-size: 13px;
  color: #6b7280;
  margin-top: 4px;
}

.slot-status {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  background-color: #f3f4f6;
  color: #6b7280;
}

.slot-status.full {
  background-color: #fee2e2;
  color: #e94560;
}

/* ========================================
   统计卡片
   ======================================== */

.stat-card {
  display: flex;
  flex-direction: column;
  padding: 20px;
  background-color: #ffffff;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.stat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.stat-title {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #1a1a2e;
}

.stat-subtitle {
  font-size: 12px;
  color: #6b7280;
  margin-top: 4px;
}

/* ========================================
   头像样式
   ======================================== */

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background-color: #f3f4f6;
}

.avatar-sm {
  width: 32px;
  height: 32px;
}

.avatar-lg {
  width: 64px;
  height: 64px;
}

/* ========================================
   Section 标题
   ======================================== */

.section {
  padding: 16px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* ========================================
   Tab栏（app.json配置）
   ======================================== */

/* 通过 app.json 设置 */
/* tabBar backgroundColor: #ffffff */
/* tabBar borderStyle: white */
/* tabBar selectedColor: #1a1a2e */
/* tabBar color: #9ca3af */

/* ========================================
   表单组
   ======================================== */

.form-group {
  margin-bottom: 20px;
}

.form-label {
  font-size: 14px;
  font-weight: 500;
  color: #111827;
  margin-bottom: 8px;
}

.form-hint {
  font-size: 12px;
  color: #6b7280;
  margin-top: 4px;
}

.form-error {
  font-size: 12px;
  color: #e94560;
  margin-top: 4px;
}

/* ========================================
   Picker 样式
   ======================================== */

.picker {
  height: 40px;
  padding: 0 12px;
  background-color: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  color: #111827;
}

.picker-placeholder {
  color: #9ca3af;
}

/* ========================================
   上午/下午切换标签
   ======================================== */

.period-tabs {
  display: flex;
  gap: 8px;
  padding: 16px;
  background-color: #ffffff;
  border-bottom: 1px solid #e5e7eb;
}

.period-tab {
  flex: 1;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 500;
  border-radius: 6px;
  background-color: #f3f4f6;
  color: #6b7280;
}

.period-tab.active {
  background-color: #1a1a2e;
  color: #ffffff;
}

/* ========================================
   安全区域底部间距
   ======================================== */

.safe-area-bottom {
  padding-bottom: env(safe-area-inset-bottom);
}

---

**Step 2: Commit**

```bash
git add miniprogram/app.wxss
git commit -m "style: create minimal design system (Linear/Stripe inspired)"
```

---

### Task 1.4: 更新 app.json 配置

**Objective:** 更新全局配置，包括导航栏颜色、tabBar样式

**Files:**
- Modify: `miniprogram/app.json`

**Step 1: 更新 window 配置**

```json
"window": {
  "navigationBarBackgroundColor": "#1a1a2e",
  "navigationBarTitleText": "冬日堡垒",
  "navigationBarTextStyle": "white",
  "backgroundColor": "#fafbfc",
  "backgroundTextStyle": "dark"
}
```

**Step 2: 更新 tabBar 配置**

```json
"tabBar": {
  "color": "#9ca3af",
  "selectedColor": "#1a1a2e",
  "backgroundColor": "#ffffff",
  "borderStyle": "white",
  "list": [
    {
      "pagePath": "pages/index/index",
      "text": "首页",
      "iconPath": "images/tab-home.png",
      "selectedIconPath": "images/tab-home-active.png"
    },
    {
      "pagePath": "pages/user/my-registrations/my-registrations",
      "text": "我的",
      "iconPath": "images/tab-my.png",
      "selectedIconPath": "images/tab-my-active.png"
    }
  ]
}
```

**Step 3: Commit**

```bash
git add miniprogram/app.json
git commit -m "config: update navigation and tabBar colors for minimal design"
```

---

## Phase 2: 数据库结构调整

### Task 2.1: 定义官职报名数据集合

**Objective:** 在 cloudbaserc.json 中添加官职报名相关的数据集合定义

**Files:**
- Modify: `cloudbaserc.json`
- Modify: `miniprogram/cloudbaserc.json`

**Step 1: 添加官职报名配置集合**

```json
{
  "collection_name": "positionConfigs",
  "index": [
    {
      "name": "date_index",
      "unique": false,
      "key": {
        "date": 1
      }
    },
    {
      "name": "creatorId_index",
      "unique": false,
      "key": {
        "creatorId": 1
      }
    }
  ]
}
```

**Step 2: 添加官职报名记录集合**

```json
{
  "collection_name": "positionRegistrations",
  "index": [
    {
      "name": "configId_index",
      "unique": false,
      "key": {
        "configId": 1
      }
    },
    {
      "name": "userId_index",
      "unique": false,
      "key": {
        "userId": 1
      }
    },
    {
      "name": "timeSlot_index",
      "unique": false,
      "key": {
        "configId": 1,
        "timeSlot": 1
      }
    }
  ]
}
```

**Step 3: 添加管理员申请集合更新**

在现有的 admins 集合索引中添加 applyType 字段索引：

```json
{
  "name": "applyType_index",
  "unique": false,
  "key": {
    "applyType": 1
  }
}
```

**Step 4: Commit**

```bash
git add cloudbaserc.json miniprogram/cloudbaserc.json
git commit -m "db: add position registration collections schema"
```

---

### Task 2.2: 更新 db.js 添加官职报名数据操作

**Objective:** 在 db.js 中添加官职报名相关的数据库操作函数

**Files:**
- Modify: `miniprogram/utils/db.js`

**Step 1: 添加官职配置操作函数**

在 db.js 中添加以下函数：

```javascript
/**
 * 官职配置相关操作
 */

// 创建官职报名配置
async function createPositionConfig(data) {
  const db = getDb()
  
  // 验证起始时间格式
  if (!data.startTime || !isValidStartTime(data.startTime)) {
    throw new Error('起始时间格式错误，应为 0:00 到 0:30')
  }
  
  // 验证职位类型
  const validTypes = ['副执行官', '教育部长']
  if (!validTypes.includes(data.positionType)) {
    throw new Error('职位类型错误')
  }
  
  return await db.collection('positionConfigs').add({
    data: {
      positionType: data.positionType,
      date: data.date,
      startTime: data.startTime,
      creatorId: data.creatorId,
      status: 'active',
      createTime: db.serverDate()
    }
  })
}

// 获取官职配置列表
async function getPositionConfigs(filters = {}) {
  const db = getDb()
  const query = { status: 'active' }
  
  if (filters.date) {
    query.date = filters.date
  }
  
  if (filters.creatorId) {
    query.creatorId = filters.creatorId
  }
  
  const res = await db.collection('positionConfigs')
    .where(query)
    .orderBy('date', 'asc')
    .orderBy('createTime', 'desc')
    .get()
  
  return res.data
}

// 获取单个官职配置
async function getPositionConfigById(configId) {
  const db = getDb()
  const res = await db.collection('positionConfigs').doc(configId).get()
  return res.data
}

// 删除官职配置
async function deletePositionConfig(configId) {
  const db = getDb()
  return await db.collection('positionConfigs').doc(configId).update({
    data: {
      status: 'inactive',
      updateTime: db.serverDate()
    }
  })
}

// 验证起始时间
function isValidStartTime(startTime) {
  const validTimes = ['0:00', '0:30']
  return validTimes.includes(startTime)
}

// 根据起始时间生成时间段列表
function generateTimeSlots(startTime) {
  const slots = []
  const startHour = parseInt(startTime.split(':')[0])
  const startMinute = parseInt(startTime.split(':')[1])
  
  let currentHour = startHour
  let currentMinute = startMinute
  
  while (currentHour < 24) {
    const timeStr = `${currentHour}:${currentMinute === 0 ? '00' : currentMinute}`
    slots.push({
      time: timeStr,
      period: currentHour < 12 ? 'morning' : 'afternoon'
    })
    
    currentMinute += 30
    if (currentMinute >= 60) {
      currentHour += 1
      currentMinute = 0
    }
  }
  
  return slots
}

/**
 * 官职报名记录相关操作
 */

// 创建官职报名记录
async function createPositionRegistration(data) {
  const db = getDb()
  
  // 检查游戏昵称是否重复
  const existing = await getPositionRegistrationByNickName(data.configId, data.nickName)
  if (existing) {
    throw new Error(`该昵称已在 ${existing.timeSlot} 时间段存在报名`)
  }
  
  // 检查时间段是否已被占用
  const slotTaken = await getPositionRegistrationByTimeSlot(data.configId, data.timeSlot)
  if (slotTaken && slotTaken.userId !== data.userId) {
    throw new Error('该时间位置已被其他人选择')
  }
  
  return await db.collection('positionRegistrations').add({
    data: {
      configId: data.configId,
      timeSlot: data.timeSlot,
      userId: data.userId,
      nickName: data.nickName,
      remark: data.remark || '',
      status: 'active',
      createTime: db.serverDate()
    }
  })
}

// 获取官职配置的所有报名记录
async function getPositionRegistrationsByConfig(configId) {
  const db = getDb()
  const res = await db.collection('positionRegistrations')
    .where({
      configId: configId,
      status: 'active'
    })
    .orderBy('timeSlot', 'asc')
    .get()
  return res.data
}

// 根据时间段获取报名记录
async function getPositionRegistrationByTimeSlot(configId, timeSlot) {
  const db = getDb()
  const res = await db.collection('positionRegistrations')
    .where({
      configId: configId,
      timeSlot: timeSlot,
      status: 'active'
    })
    .get()
  return res.data.length > 0 ? res.data[0] : null
}

// 根据游戏昵称获取报名记录（检查重复）
async function getPositionRegistrationByNickName(configId, nickName) {
  const db = getDb()
  const res = await db.collection('positionRegistrations')
    .where({
      configId: configId,
      nickName: nickName,
      status: 'active'
    })
    .get()
  return res.data.length > 0 ? res.data[0] : null
}

// 获取用户的官职报名记录
async function getPositionRegistrationsByUser(userId) {
  const db = getDb()
  const res = await db.collection('positionRegistrations')
    .where({
      userId: userId,
      status: 'active'
    })
    .orderBy('createTime', 'desc')
    .get()
  
  // 获取关联的配置信息
  const registrations = res.data
  for (const reg of registrations) {
    const config = await getPositionConfigById(reg.configId)
    reg.config = config
  }
  
  return registrations
}

// 更新官职报名记录
async function updatePositionRegistration(registrationId, data) {
  const db = getDb()
  
  // 如果更新昵称，检查是否重复
  if (data.nickName) {
    const reg = await db.collection('positionRegistrations').doc(registrationId).get()
    const existing = await getPositionRegistrationByNickName(reg.data.configId, data.nickName)
    if (existing && existing._id !== registrationId) {
      throw new Error(`该昵称已在 ${existing.timeSlot} 时间段存在报名`)
    }
  }
  
  return await db.collection('positionRegistrations').doc(registrationId).update({
    data: {
      ...data,
      updateTime: db.serverDate()
    }
  })
}

// 取消官职报名
async function cancelPositionRegistration(registrationId) {
  const db = getDb()
  return await db.collection('positionRegistrations').doc(registrationId).update({
    data: {
      status: 'cancelled',
      updateTime: db.serverDate()
    }
  })
}

// 删除官职报名记录（区管权限）
async function deletePositionRegistration(registrationId) {
  const db = getDb()
  return await db.collection('positionRegistrations').doc(registrationId).update({
    data: {
      status: 'deleted',
      updateTime: db.serverDate()
    }
  })
}

// 清空官职配置的所有报名记录
async function clearPositionRegistrations(configId) {
  const db = getDb()
  const registrations = await getPositionRegistrationsByConfig(configId)
  
  for (const reg of registrations) {
    await db.collection('positionRegistrations').doc(reg._id).update({
      data: {
        status: 'cleared',
        updateTime: db.serverDate()
      }
    })
  }
}
```

**Step 2: 添加管理员申请类型更新**

```javascript
// 创建管理员申请（支持区管和盟管申请）
async function createAdminApplication(userId, phone, applyType) {
  const db = getDb()
  
  // 验证申请类型
  const validTypes = ['zoneManager', 'allianceManager']
  if (!validTypes.includes(applyType)) {
    throw new Error('申请类型错误')
  }
  
  return await db.collection('admins').add({
    data: {
      userId: userId,
      phone: phone,
      applyType: applyType,
      status: 'pending',
      createTime: db.serverDate()
    }
  })
}

// 获取待审核的管理员申请（按类型筛选）
async function getPendingAdminApplications(applyType = null) {
  const db = getDb()
  const query = { status: 'pending' }
  
  if (applyType) {
    query.applyType = applyType
  }
  
  const res = await db.collection('admins')
    .where(query)
    .orderBy('createTime', 'desc')
    .get()
  return res.data
}

// 审核管理员申请（支持审核为区管或盟管）
async function reviewAdminApplication(applicationId, status, reviewedBy, approvedRole = null) {
  const db = getDb()
  
  const updateData = {
    status: status,
    reviewedBy: reviewedBy,
    reviewTime: db.serverDate()
  }
  
  // 如果审核通过，记录批准的角色
  if (status === 'approved' && approvedRole) {
    updateData.approvedRole = approvedRole
  }
  
  return await db.collection('admins').doc(applicationId).update({
    data: updateData
  })
}
```

**Step 3: 添加数据清理相关函数**

```javascript
/**
 * 数据清理相关操作
 */

// 检查是否为周四到周五（堡垒报名时间）
function isFortressBookingTime() {
  const now = new Date()
  const day = now.getDay() // 0=周日, 4=周四, 5=周五
  
  // 周四0点到周五24点
  return day === 4 || day === 5
}

// 清理过期数据（超过30天的数据）
async function clearExpiredData() {
  const db = getDb()
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  
  // 清理堡垒报名过期数据
  await db.collection('registrations')
    .where({
      createTime: db.command.lt(thirtyDaysAgo),
      status: 'active'
    })
    .update({
      data: {
        status: 'expired',
        updateTime: db.serverDate()
      }
    })
  
  // 清理官职报名过期数据
  const configs = await getPositionConfigs()
  for (const config of configs) {
    const configDate = new Date(config.date)
    if (configDate < thirtyDaysAgo) {
      await clearPositionRegistrations(config._id)
      await deletePositionConfig(config._id)
    }
  }
}

// 清理上周数据（保留今天之后的数据）
async function clearLastWeekData() {
  const db = getDb()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const lastWeek = new Date(today)
  lastWeek.setDate(lastWeek.getDate() - 7)
  
  // 清理堡垒报名上周数据
  await db.collection('registrations')
    .where({
      createTime: db.command.lt(today),
      status: 'active'
    })
    .update({
      data: {
        status: 'cleared',
        updateTime: db.serverDate()
      }
    })
  
  // 清理官职报名上周数据（保留今天之后的）
  const configs = await getPositionConfigs()
  for (const config of configs) {
    const configDate = new Date(config.date)
    if (configDate < today) {
      await clearPositionRegistrations(config._id)
    }
  }
}
```

**Step 4: 更新 module.exports**

```javascript
module.exports = {
  // 用户
  createOrUpdateUser,
  getUserByOpenid,
  getUserByPhone,
  updateUserRole,
  bindPhoneToUser,
  resetUserIdentity,

  // 管理员申请
  createAdminApplication,
  getPendingAdminApplications,
  reviewAdminApplication,

  // 分区
  createZone,
  getZoneByCode,
  getAllZones,
  getZonesByCreator,

  // 联盟
  initAlliances,
  getAlliancesByZone,
  updateAllianceName,
  bindAuditor,

  // 时间段
  TIME_VALUES,
  createTimeSlot,
  getTimeSlotsByAlliance,
  getMaxSlotIndex,
  updateTimeSlotRemark,
  deleteTimeSlot,
  getTimeSlotById,

  // 堡垒报名
  createRegistration,
  getRegistrationCount,
  getRegistrationsByTimeSlot,
  getRegistrationsByUser,
  cancelRegistration,

  // 统计
  getAllianceStatistics,
  getZoneStatistics,

  // 超管
  addSuperAdmin,
  getAllSuperAdmins,
  isPhoneSuperAdmin,

  // 官职配置
  createPositionConfig,
  getPositionConfigs,
  getPositionConfigById,
  deletePositionConfig,
  isValidStartTime,
  generateTimeSlots,

  // 官职报名
  createPositionRegistration,
  getPositionRegistrationsByConfig,
  getPositionRegistrationByTimeSlot,
  getPositionRegistrationByNickName,
  getPositionRegistrationsByUser,
  updatePositionRegistration,
  cancelPositionRegistration,
  deletePositionRegistration,
  clearPositionRegistrations,

  // 数据清理
  isFortressBookingTime,
  clearExpiredData,
  clearLastWeekData
}
```

**Step 5: Commit**

```bash
git add miniprogram/utils/db.js
git commit -m "feat: add position registration database operations"
```

---

## Phase 3: 云函数更新

### Task 3.1: 创建官职管理云函数

**Objective:** 创建新的云函数处理官职配置和报名操作

**Files:**
- Create: `miniprogram/cloudfunctions/managePosition/index.js`
- Create: `miniprogram/cloudfunctions/managePosition/package.json`

**Step 1: 创建云函数入口文件**

```javascript
// miniprogram/cloudfunctions/managePosition/index.js
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { action, data } = event
  const wxContext = cloud.getWXContext()

  switch (action) {
    case 'createConfig':
      return await createPositionConfig(data, wxContext)
    case 'getConfigs':
      return await getPositionConfigs(data)
    case 'getConfigById':
      return await getPositionConfigById(data)
    case 'deleteConfig':
      return await deletePositionConfig(data)
    case 'createRegistration':
      return await createPositionRegistration(data, wxContext)
    case 'getRegistrations':
      return await getPositionRegistrationsByConfig(data)
    case 'getRegistrationsByUser':
      return await getPositionRegistrationsByUser(data, wxContext)
    case 'updateRegistration':
      return await updatePositionRegistration(data)
    case 'cancelRegistration':
      return await cancelPositionRegistration(data)
    case 'deleteRegistration':
      return await deletePositionRegistration(data)
    case 'clearRegistrations':
      return await clearPositionRegistrations(data)
    default:
      return { success: false, error: '未知操作类型' }
  }
}

// 创建官职配置
async function createPositionConfig(data, wxContext) {
  try {
    // 验证起始时间
    const validTimes = ['0:00', '0:30']
    if (!validTimes.includes(data.startTime)) {
      return { success: false, error: '起始时间格式错误' }
    }

    // 验证职位类型
    const validTypes = ['副执行官', '教育部长']
    if (!validTypes.includes(data.positionType)) {
      return { success: false, error: '职位类型错误' }
    }

    const result = await db.collection('positionConfigs').add({
      data: {
        positionType: data.positionType,
        date: data.date,
        startTime: data.startTime,
        creatorId: wxContext.OPENID,
        status: 'active',
        createTime: db.serverDate()
      }
    })

    return { success: true, data: result }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// 获取官职配置列表
async function getPositionConfigs(data) {
  try {
    const query = { status: 'active' }
    
    if (data.date) {
      query.date = data.date
    }
    
    if (data.creatorId) {
      query.creatorId = data.creatorId
    }

    const result = await db.collection('positionConfigs')
      .where(query)
      .orderBy('date', 'asc')
      .orderBy('createTime', 'desc')
      .get()

    return { success: true, data: result.data }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// 获取单个官职配置
async function getPositionConfigById(data) {
  try {
    const result = await db.collection('positionConfigs').doc(data.configId).get()
    return { success: true, data: result.data }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// 删除官职配置
async function deletePositionConfig(data) {
  try {
    const result = await db.collection('positionConfigs').doc(data.configId).update({
      data: {
        status: 'inactive',
        updateTime: db.serverDate()
      }
    })
    return { success: true, data: result }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// 创建官职报名记录
async function createPositionRegistration(data, wxContext) {
  try {
    // 检查游戏昵称是否重复
    const existingNick = await db.collection('positionRegistrations')
      .where({
        configId: data.configId,
        nickName: data.nickName,
        status: 'active'
      })
      .get()

    if (existingNick.data.length > 0) {
      const existingReg = existingNick.data[0]
      return {
        success: false,
        error: `该昵称已在 ${existingReg.timeSlot} 时间段存在报名`,
        existingTimeSlot: existingReg.timeSlot
      }
    }

    // 检查时间段是否已被占用（原子性检查）
    const existingSlot = await db.collection('positionRegistrations')
      .where({
        configId: data.configId,
        timeSlot: data.timeSlot,
        status: 'active'
      })
      .get()

    if (existingSlot.data.length > 0 && existingSlot.data[0].userId !== wxContext.OPENID) {
      return {
        success: false,
        error: '该时间位置已被其他人选择，请刷新页面查看最新状态'
      }
    }

    // 如果已有记录且是自己的，则更新
    if (existingSlot.data.length > 0 && existingSlot.data[0].userId === wxContext.OPENID) {
      const result = await db.collection('positionRegistrations')
        .doc(existingSlot.data[0]._id)
        .update({
          data: {
            nickName: data.nickName,
            remark: data.remark || '',
            updateTime: db.serverDate()
          }
        })
      return { success: true, data: result, isUpdate: true }
    }

    // 创建新记录
    const result = await db.collection('positionRegistrations').add({
      data: {
        configId: data.configId,
        timeSlot: data.timeSlot,
        userId: wxContext.OPENID,
        nickName: data.nickName,
        remark: data.remark || '',
        status: 'active',
        createTime: db.serverDate()
      }
    })

    return { success: true, data: result }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// 获取官职配置的所有报名记录
async function getPositionRegistrationsByConfig(data) {
  try {
    const result = await db.collection('positionRegistrations')
      .where({
        configId: data.configId,
        status: 'active'
      })
      .orderBy('timeSlot', 'asc')
      .get()

    return { success: true, data: result.data }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// 获取用户的官职报名记录
async function getPositionRegistrationsByUser(data, wxContext) {
  try {
    const result = await db.collection('positionRegistrations')
      .where({
        userId: wxContext.OPENID,
        status: 'active'
      })
      .orderBy('createTime', 'desc')
      .get()

    // 获取关联的配置信息
    const registrations = result.data
    for (const reg of registrations) {
      try {
        const config = await db.collection('positionConfigs').doc(reg.configId).get()
        reg.config = config.data
      } catch (e) {
        reg.config = null
      }
    }

    return { success: true, data: registrations }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// 更新官职报名记录
async function updatePositionRegistration(data) {
  try {
    // 如果更新昵称，检查是否重复
    if (data.nickName) {
      const reg = await db.collection('positionRegistrations').doc(data.registrationId).get()
      const existing = await db.collection('positionRegistrations')
        .where({
          configId: reg.data.configId,
          nickName: data.nickName,
          status: 'active'
        })
        .get()

      if (existing.data.length > 0 && existing.data[0]._id !== data.registrationId) {
        return {
          success: false,
          error: `该昵称已在 ${existing.data[0].timeSlot} 时间段存在报名`
        }
      }
    }

    const result = await db.collection('positionRegistrations')
      .doc(data.registrationId)
      .update({
        data: {
          ...data,
          updateTime: db.serverDate()
        }
      })

    return { success: true, data: result }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// 取消官职报名
async function cancelPositionRegistration(data) {
  try {
    const result = await db.collection('positionRegistrations')
      .doc(data.registrationId)
      .update({
        data: {
          status: 'cancelled',
          updateTime: db.serverDate()
        }
      })
    return { success: true, data: result }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// 删除官职报名记录（区管权限）
async function deletePositionRegistration(data) {
  try {
    const result = await db.collection('positionRegistrations')
      .doc(data.registrationId)
      .update({
        data: {
          status: 'deleted',
          updateTime: db.serverDate()
        }
      })
    return { success: true, data: result }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// 清空官职配置的所有报名记录
async function clearPositionRegistrations(data) {
  try {
    const registrations = await db.collection('positionRegistrations')
      .where({
        configId: data.configId,
        status: 'active'
      })
      .get()

    for (const reg of registrations.data) {
      await db.collection('positionRegistrations').doc(reg._id).update({
        data: {
          status: 'cleared',
          updateTime: db.serverDate()
        }
      })
    }

    return { success: true, clearedCount: registrations.data.length }
  } catch (error) {
    return { success: false, error: error.message }
  }
}
```

**Step 2: 创建 package.json**

```json
{
  "name": "managePosition",
  "version": "1.0.0",
  "description": "官职管理云函数",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  }
}
```

**Step 3: Commit**

```bash
git add miniprogram/cloudfunctions/managePosition/
git commit -m "feat: create managePosition cloud function"
```

---

### Task 3.2: 更新 manageAdmin 云函数支持区管/盟管申请

**Objective:** 更新 manageAdmin 云函数，支持区管和盟管两种申请类型的审核

**Files:**
- Modify: `miniprogram/cloudfunctions/manageAdmin/index.js`

**Step 1: 读取现有云函数**

先读取现有代码了解结构。

**Step 2: 更新云函数**

添加 applyType 和 approvedRole 字段的处理。

**Step 3: Commit**

```bash
git add miniprogram/cloudfunctions/manageAdmin/index.js
git commit -m "feat: update manageAdmin to support zone/alliance manager applications"
```

---

### Task 3.3: 创建数据清理云函数

**Objective:** 创建定时清理过期数据的云函数

**Files:**
- Create: `miniprogram/cloudfunctions/clearExpiredData/index.js`
- Create: `miniprogram/cloudfunctions/clearExpiredData/package.json`

**Step 1: 创建云函数**

```javascript
// miniprogram/cloudfunctions/clearExpiredData/index.js
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { action } = event

  switch (action) {
    case 'autoClear':
      return await autoClearExpiredData()
    case 'manualClear':
      return await manualClearData(event)
    case 'clearFortressData':
      return await clearFortressData(event)
    case 'clearPositionData':
      return await clearPositionData(event)
    default:
      return await autoClearExpiredData()
  }
}

// 自动清理：清理30天以上的数据
async function autoClearExpiredData() {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  
  let clearedCount = 0

  // 清理堡垒报名过期数据
  const fortressRegs = await db.collection('registrations')
    .where({
      createTime: _.lt(thirtyDaysAgo),
      status: 'active'
    })
    .get()

  for (const reg of fortressRegs.data) {
    await db.collection('registrations').doc(reg._id).update({
      data: {
        status: 'expired',
        updateTime: db.serverDate()
      }
    })
    clearedCount++
  }

  // 清理官职配置和报名过期数据
  const configs = await db.collection('positionConfigs')
    .where({
      status: 'active'
    })
    .get()

  for (const config of configs.data) {
    const configDate = new Date(config.date)
    if (configDate < thirtyDaysAgo) {
      // 清理该配置的所有报名
      const regs = await db.collection('positionRegistrations')
        .where({
          configId: config._id,
          status: _.in(['active', 'cancelled'])
        })
        .get()

      for (const reg of regs.data) {
        await db.collection('positionRegistrations').doc(reg._id).update({
          data: {
            status: 'expired',
            updateTime: db.serverDate()
          }
        })
        clearedCount++
      }

      // 删除配置
      await db.collection('positionConfigs').doc(config._id).update({
        data: {
          status: 'expired',
          updateTime: db.serverDate()
        }
      })
      clearedCount++
    }
  }

  return {
    success: true,
    message: '自动清理完成',
    clearedCount: clearedCount,
    clearedBefore: thirtyDaysAgo.toISOString()
  }
}

// 手动清理：清理上周数据（保留今天之后的官职报名）
async function manualClearData(event) {
  const { confirm } = event
  
  if (!confirm) {
    return {
      success: false,
      error: '请确认是否要清理数据',
      requiresConfirmation: true
    }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  let clearedCount = 0

  // 清理堡垒报名上周数据
  const fortressRegs = await db.collection('registrations')
    .where({
      createTime: _.lt(today),
      status: 'active'
    })
    .get()

  for (const reg of fortressRegs.data) {
    await db.collection('registrations').doc(reg._id).update({
      data: {
        status: 'cleared',
        updateTime: db.serverDate()
      }
    })
    clearedCount++
  }

  // 清理官职报名上周数据（保留今天之后的）
  const configs = await db.collection('positionConfigs')
    .where({
      status: 'active'
    })
    .get()

  for (const config of configs.data) {
    const configDate = new Date(config.date)
    if (configDate < today) {
      const regs = await db.collection('positionRegistrations')
        .where({
          configId: config._id,
          status: 'active'
        })
        .get()

      for (const reg of regs.data) {
        await db.collection('positionRegistrations').doc(reg._id).update({
          data: {
            status: 'cleared',
            updateTime: db.serverDate()
          }
        })
        clearedCount++
      }
    }
  }

  return {
    success: true,
    message: '手动清理完成',
    clearedCount: clearedCount
  }
}

// 清理堡垒报名数据（按范围）
async function clearFortressData(event) {
  const { scope, scopeId, confirm } = event
  
  if (!confirm) {
    return {
      success: false,
      error: '请确认是否要清理数据',
      requiresConfirmation: true
    }
  }

  let query = { status: 'active' }

  switch (scope) {
    case 'all':
      // 清理所有堡垒报名
      break
    case 'zone':
      query.zoneId = scopeId
      break
    case 'alliance':
      query.allianceId = scopeId
      break
    case 'timeSlot':
      query.timeSlotId = scopeId
      break
    default:
      return { success: false, error: '未知清理范围' }
  }

  const regs = await db.collection('registrations').where(query).get()
  let clearedCount = 0

  for (const reg of regs.data) {
    await db.collection('registrations').doc(reg._id).update({
      data: {
        status: 'cleared',
        updateTime: db.serverDate()
      }
    })
    clearedCount++
  }

  return {
    success: true,
    message: '堡垒报名数据清理完成',
    clearedCount: clearedCount,
    scope: scope
  }
}

// 清理官职报名数据（按配置ID）
async function clearPositionData(event) {
  const { configId, confirm } = event
  
  if (!confirm) {
    return {
      success: false,
      error: '请确认是否要清理数据',
      requiresConfirmation: true
    }
  }

  const regs = await db.collection('positionRegistrations')
    .where({
      configId: configId,
      status: 'active'
    })
    .get()

  let clearedCount = 0

  for (const reg of regs.data) {
    await db.collection('positionRegistrations').doc(reg._id).update({
      data: {
        status: 'cleared',
        updateTime: db.serverDate()
      }
    })
    clearedCount++
  }

  return {
    success: true,
    message: '官职报名数据清理完成',
    clearedCount: clearedCount,
    configId: configId
  }
}
```

**Step 2: 创建 package.json**

```json
{
  "name": "clearExpiredData",
  "version": "1.0.0",
  "description": "自动清理过期数据云函数",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  }
}
```

**Step 3: Commit**

```bash
git add miniprogram/cloudfunctions/clearExpiredData/
git commit -m "feat: create clearExpiredData cloud function"
```

---

## Phase 4: UI页面改造 - 首页

### Task 4.1: 改造首页样式和布局

**Objective:** 使用极简设计系统改造首页UI

**Files:**
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/index/index.wxss`
- Modify: `miniprogram/pages/index/index.js`

**设计要点：**
- 清晰的功能入口列表
- 大量留白
- 简洁的角色选择
- 新增官职报名入口

**Step 1: 重写 WXML**

使用新的样式类，创建功能卡片列表布局。

**Step 2: 更新 WXSS**

删除页面私有样式，使用全局样式系统。

**Step 3: 更新 JS**

添加官职报名入口逻辑，更新角色名称显示。

**Step 4: Commit**

```bash
git add miniprogram/pages/index/
git commit -m "ui: redesign index page with minimal style"
```

---

### Task 4.2: 改造登录页

**Objective:** 极简登录界面设计

**Files:**
- Modify: `miniprogram/pages/login/login.wxml`
- Modify: `miniprogram/pages/login/login.wxss`

**Step 1: 重写 WXML**

简洁的登录表单，头像昵称设置。

**Step 2: Commit**

```bash
git add miniprogram/pages/login/
git commit -m "ui: redesign login page with minimal style"
```

---

### Task 4.3: 改造我的报名页面

**Objective:** 以表格形式展示报名记录

**Files:**
- Modify: `miniprogram/pages/user/my-registrations/my-registrations.wxml`
- Modify: `miniprogram/pages/user/my-registrations/my-registrations.wxss`
- Modify: `miniprogram/pages/user/my-registrations/my-registrations.js`

**Step 1: 更新表格展示**

使用 `.table` 样式类展示报名记录。

**Step 2: 添加官职报名记录**

在页面中同时展示堡垒报名和官职报名记录。

**Step 3: Commit**

```bash
git add miniprogram/pages/user/my-registrations/
git commit -m "ui: redesign my-registrations page with table layout"
```

---

## Phase 5: 官职报名功能实现

### Task 5.1: 创建官职报名列表页

**Objective:** 创建官职报名入口页面，展示可报名的官职配置列表

**Files:**
- Create: `miniprogram/pages/user/position-list/position-list.wxml`
- Create: `miniprogram/pages/user/position-list/position-list.wxss`
- Create: `miniprogram/pages/user/position-list/position-list.js`
- Create: `miniprogram/pages/user/position-list/position-list.json`

**Step 1: 创建页面文件**

```javascript
// miniprogram/pages/user/position-list/position-list.js
const app = getApp()
const db = require('../../utils/db')
const util = require('../../utils/util')

Page({
  data: {
    configs: [],
    loading: true,
    userNickName: ''
  },

  onLoad() {
    this.loadConfigs()
    this.loadUserNickName()
  },

  async loadUserNickName() {
    const userInfo = app.globalData.userInfo
    if (userInfo && userInfo.nickName) {
      this.setData({ userNickName: userInfo.nickName })
    }
  },

  async loadConfigs() {
    try {
      const configs = await db.getPositionConfigs()
      
      // 筛选今天及以后的配置
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      
      const availableConfigs = configs.filter(config => {
        const configDate = new Date(config.date)
        return configDate >= today
      })

      this.setData({
        configs: availableConfigs,
        loading: false
      })
    } catch (error) {
      util.showError('加载失败：' + error.message)
      this.setData({ loading: false })
    }
  },

  goToRegistration(e) {
    const { configId } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/user/position-registration/position-registration?configId=${configId}`
    })
  },

  onRefresh() {
    this.setData({ loading: true })
    this.loadConfigs()
  }
})
```

**Step 2: 创建 WXML**

```xml
<!--miniprogram/pages/user/position-list/position-list.wxml-->
<view class="page">
  <!-- Header -->
  <view class="section-header">
    <text class="section-title">官职报名</text>
    <view class="btn btn-ghost btn-sm" bindtap="onRefresh">
      <text>刷新</text>
    </view>
  </view>

  <!-- Loading -->
  <view class="loading-container" wx:if="{{loading}}">
    <text class="loading-text">加载中...</text>
  </view>

  <!-- Empty State -->
  <view class="empty-state" wx:if="{{!loading && configs.length === 0}}">
    <text class="empty-text">暂无可报名的官职</text>
  </view>

  <!-- Config List -->
  <view class="function-grid" wx:if="{{!loading && configs.length > 0}}">
    <view class="card" wx:for="{{configs}}" wx:key="_id" bindtap="goToRegistration" data-config-id="{{item._id}}">
      <view class="card-header">
        <text class="card-title">{{item.positionType}}</text>
        <text class="tag tag-default">{{item.date}}</text>
      </view>
      <view class="card-body">
        <text class="text-secondary">起始时间：{{item.startTime}}</text>
      </view>
    </view>
  </view>
</view>
```

**Step 3: 创建 WXSS**

```css
/* miniprogram/pages/user/position-list/position-list.wxss */
.page {
  min-height: 100vh;
  background-color: #fafbfc;
}
```

**Step 4: 创建 JSON**

```json
{
  "navigationBarTitleText": "官职报名"
}
```

**Step 5: 在 app.json 中注册页面**

```json
"pages": [
  "pages/user/position-list/position-list",
  ...
]
```

**Step 6: Commit**

```bash
git add miniprogram/pages/user/position-list/
git commit -m "feat: create position list page"
```

---

### Task 5.2: 创建官职报名详情页（座位选择）

**Objective:** 创建类似飞机选座的官职报名页面，支持上午/下午切换

**Files:**
- Create: `miniprogram/pages/user/position-registration/position-registration.wxml`
- Create: `miniprogram/pages/user/position-registration/position-registration.wxss`
- Create: `miniprogram/pages/user/position-registration/position-registration.js`
- Create: `miniprogram/pages/user/position-registration/position-registration.json`

**核心功能：**
- 上午/下午标签切换
- 表格展示时间、昵称、备注
- 空座位可点击选择
- 已选座位显示昵称和备注
- 自己的座位可修改/删除
- 区管可管理所有座位
- 昵称重复检测

**Step 1: 创建 JS 文件**

这是最复杂的页面，需要实现座位选择逻辑。

**Step 2: 创建 WXML**

使用 `.seat-table` 样式系统。

**Step 3: Commit**

```bash
git add miniprogram/pages/user/position-registration/
git commit -m "feat: create position registration page (seat selection)"
```

---

## Phase 6: 官职管理功能

### Task 6.1: 创建区管官职管理页

**Objective:** 区管可以创建官职报名配置

**Files:**
- Create: `miniprogram/pages/admin/position-manage/position-manage.wxml`
- Create: `miniprogram/pages/admin/position-manage/position-manage.wxss`
- Create: `miniprogram/pages/admin/position-manage/position-manage.js`
- Create: `miniprogram/pages/admin/position-manage/position-manage.json`

**功能：**
- 选择日期
- 选择职位类型（副执行官/教育部长）
- 选择起始时间（0:00 或 0:30）
- 查看已创建的配置列表
- 清理数据

**Step 1: 创建页面文件**

**Step 2: Commit**

```bash
git add miniprogram/pages/admin/position-manage/
git commit -m "feat: create position manage page for zone manager"
```

---

## Phase 7: 管理员页面改造

### Task 7.1: 改造区管首页

**Objective:** 更新管理员首页为区管控制台，添加官职管理入口

**Files:**
- Modify: `miniprogram/pages/admin/home/home.wxml`
- Modify: `miniprogram/pages/admin/home/home.wxss`
- Modify: `miniprogram/pages/admin/home/home.js`

**更新要点：**
- 角色名称显示为"区管"
- 添加官职管理功能入口
- 添加盟管审核入口（区管可以审核盟管申请）
- 使用极简设计

**Step 1: Commit**

```bash
git add miniprogram/pages/admin/home/
git commit -m "ui: redesign admin home page (zone manager)"
```

---

### Task 7.2: 改造盟管首页

**Objective:** 更新审计员首页为盟管控制台

**Files:**
- Modify: `miniprogram/pages/auditor/home/home.wxml`
- Modify: `miniprogram/pages/auditor/home/home.wxss`
- Modify: `miniprogram/pages/auditor/home/home.js`

**更新要点：**
- 角色名称显示为"盟管"
- 保留堡垒时间管理、统计功能
- 使用极简设计

**Step 1: Commit**

```bash
git add miniprogram/pages/auditor/home/
git commit -m "ui: redesign auditor home page (alliance manager)"
```

---

### Task 7.3: 改造超管首页

**Objective:** 更新超管首页，添加区管审核和官职管理入口

**Files:**
- Modify: `miniprogram/pages/superAdmin/home/home.wxml`
- Modify: `miniprogram/pages/superAdmin/home/home.wxss`
- Modify: `miniprogram/pages/superAdmin/home/home.js`

**Step 1: Commit**

```bash
git add miniprogram/pages/superAdmin/home/
git commit -m "ui: redesign superAdmin home page"
```

---

## Phase 8: 数据管理规则实现

### Task 8.1: 实现堡垒时间创建限制

**Objective:** 堡垒报名时间配置仅支持周四0点到周五24点

**Files:**
- Modify: `miniprogram/pages/admin/time-slot-config/time-slot-config.js`

**Step 1: 添加时间检查**

```javascript
// 在创建时间段前检查是否为周四到周五
canCreateFortressTimeSlot() {
  const now = new Date()
  const day = now.getDay()
  
  // 周四(4)0点到周五(5)24点
  if (day !== 4 && day !== 5) {
    util.showError('堡垒时间仅可在周四至周五期间创建')
    return false
  }
  return true
}
```

**Step 2: Commit**

```bash
git add miniprogram/pages/admin/time-slot-config/
git commit -m "feat: add fortress time creation restriction (Thu-Fri only)"
```

---

### Task 8.2: 实现手动清理确认机制

**Objective:** 所有手动清理数据操作需要用户确认

**Files:**
- Modify: `miniprogram/pages/admin/statistics/statistics.js`
- Modify: `miniprogram/pages/superAdmin/auto-clear/auto-clear.js`

**Step 1: 添加确认对话框**

```javascript
async onClearData() {
  const confirmed = await util.showConfirm(
    '确认清理数据？',
    '此操作将清理上周及之前的报名数据，今天之后的数据将保留。操作不可撤销。'
  )
  
  if (!confirmed) {
    return
  }
  
  // 执行清理...
}
```

**Step 2: Commit**

```bash
git add miniprogram/pages/admin/statistics/ miniprogram/pages/superAdmin/auto-clear/
git commit -m "feat: add confirmation dialog for manual data clearing"
```

---

## Phase 9: 统计页面表格化

### Task 9.1: 改造统计页面表格展示

**Objective:** 将统计数据改为表格形式展示

**Files:**
- Modify: `miniprogram/pages/admin/statistics/statistics.wxml`
- Modify: `miniprogram/pages/admin/statistics/statistics.wxss`
- Modify: `miniprogram/pages/auditor/statistics/statistics.wxml`
- Modify: `miniprogram/pages/superAdmin/all-statistics/all-statistics.wxml`

**Step 1: 使用 .table 样式类**

替换原有的卡片列表为表格展示。

**Step 2: Commit**

```bash
git add miniprogram/pages/admin/statistics/ miniprogram/pages/auditor/statistics/ miniprogram/pages/superAdmin/all-statistics/
git commit -m "ui: convert statistics pages to table layout"
```

---

## Phase 10: 申请功能更新

### Task 10.1: 创建申请盟管/区管页面

**Objective:** 用户可以申请成为盟管或区管

**Files:**
- Create: `miniprogram/pages/user/apply-manager/apply-manager.wxml`
- Create: `miniprogram/pages/user/apply-manager/apply-manager.wxss`
- Create: `miniprogram/pages/user/apply-manager/apply-manager.js`
- Create: `miniprogram/pages/user/apply-manager/apply-manager.json`

**功能：**
- 选择申请类型（盟管/区管）
- 填写手机号
- 提交申请

**Step 1: Commit**

```bash
git add miniprogram/pages/user/apply-manager/
git commit -m "feat: create apply manager page"
```

---

### Task 10.2: 更新审核页面

**Objective:** 区管可以审核盟管申请，超管可以审核区管申请

**Files:**
- Modify: `miniprogram/pages/superAdmin/admin-review/admin-review.wxml`
- Modify: `miniprogram/pages/superAdmin/admin-review/admin-review.js`
- Create: `miniprogram/pages/admin/review-manager/review-manager.wxml`
- Create: `miniprogram/pages/admin/review-manager/review-manager.wxss`
- Create: `miniprogram/pages/admin/review-manager/review-manager.js`

**功能：**
- 超管审核页面：显示区管和盟管申请
- 区管审核页面：只显示盟管申请
- 审核通过后设置用户角色

**Step 1: Commit**

```bash
git add miniprogram/pages/admin/review-manager/ miniprogram/pages/superAdmin/admin-review/
git commit -m "feat: update admin review pages for zone/alliance manager"
```

---

## Phase 11: 最终集成和测试

### Task 11.1: 更新 app.js 初始化逻辑

**Objective:** 更新全局初始化，添加官职报名相关数据加载

**Files:**
- Modify: `miniprogram/app.js`

**Step 1: Commit**

```bash
git add miniprogram/app.js
git commit -m "refactor: update app initialization"
```

---

### Task 11.2: 更新 cloudbaserc.json 云函数配置

**Objective:** 在云开发配置中添加新的云函数定义

**Files:**
- Modify: `cloudbaserc.json`

**Step 1: 添加新云函数**

```json
{
  "name": "managePosition",
  "handler": "index.main",
  "runtime": "Nodejs12.16"
},
{
  "name": "clearExpiredData",
  "handler": "index.main",
  "runtime": "Nodejs12.16"
}
```

**Step 2: Commit**

```bash
git add cloudbaserc.json
git commit -m "config: add new cloud functions to cloudbaserc"
```

---

### Task 11.3: 创建数据库初始化脚本

**Objective:** 更新 db-init.js 添加官职相关集合的初始化说明

**Files:**
- Modify: `miniprogram/scripts/db-init.js`

**Step 1: Commit**

```bash
git add miniprogram/scripts/db-init.js
git commit -m "docs: update db-init script with position collections"
```

---

### Task 11.4: 更新 README.md

**Objective:** 更新文档，说明新的功能和权限体系

**Files:**
- Modify: `README.md`

**Step 1: Commit**

```bash
git add README.md
git commit -m "docs: update README with new features and permissions"
```

---

## Summary

本计划共 **11 个阶段，约 25 个任务**，每个任务遵循 TDD 原则：

1. **Phase 1**: 基础架构更新（权限系统、样式系统、配置）
2. **Phase 2**: 数据库结构调整（官职报名集合）
3. **Phase 3**: 云函数更新（官职管理、数据清理）
4. **Phase 4**: UI页面改造（首页、登录、我的报名）
5. **Phase 5**: 官职报名功能（列表页、座位选择页）
6. **Phase 6**: 官职管理功能（区管创建配置）
7. **Phase 7**: 管理员页面改造（区管、盟管、超管首页）
8. **Phase 8**: 数据管理规则（堡垒时间限制、清理确认）
9. **Phase 9**: 统计页面表格化
10. **Phase 10**: 申请功能更新
11. **Phase 11**: 最终集成和测试

**执行建议**: 使用 `subagent-driven-development` 技能逐任务执行，每个任务完成后进行 spec review 和 code review。