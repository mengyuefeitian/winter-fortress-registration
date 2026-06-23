# Bug Fixes: Battle Statistics & Position Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 reported bugs across battle statistics (国战统计表), battle registration (国战报名页), and position registration (官职报名) pages.

**Architecture:** Pure client-side fixes for bugs 1–4 (WXML/JS changes only). Bug 5 requires a new `manageBattle` cloud function to bypass per-user write permissions for admin deletes.

**Tech Stack:** WeChat Mini Program (WXML + JS), WeChat Cloud Functions (Node.js + wx-server-sdk)

---

## Bug Summary

| # | Page | Issue | Fix |
|---|------|-------|-----|
| 1 | 国战统计表 canvas | 联盟名过长与熔炉数据粘连 | 截图中联盟名截取前3字符 |
| 2 | 国战统计表 UI | 非管理员可见选择列+删除按钮 | 选择列和删除按钮仅 isAdminOrAbove 可见 |
| 3 | 国战报名页 | 无转发分享功能 | 添加 onShareAppMessage |
| 4 | 官职报名 | 时间格式不统一（9:00 而非 09:00） | generatePositionTimeSlots 补零，loadRegistrations 做向后兼容规范化 |
| 5 | 国战统计表 | 区管删除报名记录失败 | 新建 manageBattle 云函数 + adminDeleteBattleRegistration，绕过客户端权限限制 |

---

## Task 1: Bug 2 — Hide select/delete UI for non-admins

**Files:**
- Modify: `miniprogram/pages/user/battle-statistics/battle-statistics.wxml`

**Root cause:** `col-checkbox` header and per-row checkboxes, `全选` button, and `删除选中` button are shown to all users. Only `isAdminOrAbove` users should see these.

- [ ] **Step 1: Update WXML to conditionally show checkbox column and action buttons**

In `battle-statistics.wxml`, make the following changes:

1. Wrap the checkbox header column with `wx:if`:
```xml
<!-- BEFORE -->
<view class="col col-checkbox">选择</view>

<!-- AFTER -->
<view class="col col-checkbox" wx:if="{{isAdminOrAbove}}">选择</view>
```

2. Wrap the per-row checkbox with `wx:if`:
```xml
<!-- BEFORE -->
<view class="col col-checkbox">
  <checkbox-group bindchange="onSlotCheckChange" data-index="{{index}}">
    <checkbox value="{{item._id}}" checked="{{item.selected}}" />
  </checkbox-group>
</view>

<!-- AFTER -->
<view class="col col-checkbox" wx:if="{{isAdminOrAbove}}">
  <checkbox-group bindchange="onSlotCheckChange" data-index="{{index}}">
    <checkbox value="{{item._id}}" checked="{{item.selected}}" />
  </checkbox-group>
</view>
```

3. Wrap `全选` button and `删除选中` button with `wx:if`:
```xml
<!-- BEFORE -->
<view class="btn-select-all" bindtap="onSelectAll">
  {{selectAllChecked ? '取消全选' : '全选'}}
</view>
<view class="btn btn-delete" bindtap="onDeleteSelected">删除选中</view>

<!-- AFTER -->
<view class="btn-select-all" wx:if="{{isAdminOrAbove}}" bindtap="onSelectAll">
  {{selectAllChecked ? '取消全选' : '全选'}}
</view>
<view class="btn btn-delete" wx:if="{{isAdminOrAbove}}" bindtap="onDeleteSelected">删除选中</view>
```

- [ ] **Step 2: Verify syntax**

Run: `node -c miniprogram/pages/user/battle-statistics/battle-statistics.js`

Expected: No output (syntax OK). WXML has no syntax checker; visually review the diff.

- [ ] **Step 3: Commit**

```bash
git add miniprogram/pages/user/battle-statistics/battle-statistics.wxml
git commit -m "fix: 国战统计表非管理员不显示选择列和删除按钮"
```

---

## Task 2: Bug 1 — Truncate alliance name to 3 chars in canvas screenshot

**Files:**
- Modify: `miniprogram/pages/user/battle-statistics/battle-statistics.js`

**Root cause:** Line ~291 renders full `r.allianceName` which can overflow into the adjacent `熔炉` column. Fix by slicing to first 3 characters.

- [ ] **Step 1: Modify canvas rendering to truncate alliance name**

In `battle-statistics.js` around line 291, change the alliance name rendering:

```javascript
// BEFORE (line ~291)
ctx.fillText(r.allianceName, colDefs[1].x + 8, rowStartY)

// AFTER
ctx.fillText((r.allianceName || '').substring(0, 3), colDefs[1].x + 8, rowStartY)
```

- [ ] **Step 2: Verify syntax**

Run: `node -c miniprogram/pages/user/battle-statistics/battle-statistics.js`

Expected: No output (syntax OK).

- [ ] **Step 3: Commit**

```bash
git add miniprogram/pages/user/battle-statistics/battle-statistics.js
git commit -m "fix: 国战统计表截图联盟名截取前3字符避免列溢出"
```

---

## Task 3: Bug 3 — Add share/forward function to battle-registration page

**Files:**
- Modify: `miniprogram/pages/user/battle-registration/battle-registration.js`

**Root cause:** Page has no `onShareAppMessage` handler; WeChat Mini Program needs this function defined for the forward menu item to be active.

- [ ] **Step 1: Add onShareAppMessage to battle-registration.js**

In `battle-registration.js`, add the following method inside the `Page({...})` object, after `onSubmit`:

```javascript
onShareAppMessage: function () {
  const { date, zoneName, configId } = this.data
  const title = date
    ? `国战报名 - ${date}${zoneName ? ' · ' + zoneName : ''}`
    : '国战报名 - 无尽冬日'
  return {
    title: title,
    path: `/pages/user/battle-registration/battle-registration?configId=${configId || ''}&date=${date || ''}&zoneName=${encodeURIComponent(zoneName || '')}`
  }
}
```

- [ ] **Step 2: Verify syntax**

Run: `node -c miniprogram/pages/user/battle-registration/battle-registration.js`

Expected: No output (syntax OK).

- [ ] **Step 3: Commit**

```bash
git add miniprogram/pages/user/battle-registration/battle-registration.js
git commit -m "feat: 国战报名页增加转发分享功能"
```

---

## Task 4: Bug 4 — Normalize position registration time to HH:MM format

**Files:**
- Modify: `miniprogram/utils/db.js` (lines ~960–973 in `generatePositionTimeSlots`)
- Modify: `miniprogram/pages/user/position-registration/position-registration.js` (lines ~135–165 in `loadRegistrations`)

**Root cause:** `generatePositionTimeSlots` produces `H:MM` (e.g. `9:00`) when hour < 10, instead of `HH:MM` (`09:00`). Old registrations in the DB already store `H:MM` format, so we need backward-compatible normalization when matching.

- [ ] **Step 1: Update generatePositionTimeSlots to zero-pad hour**

In `db.js` at line ~960, change:

```javascript
// BEFORE
const timeStr = `${currentHour}:${String(currentMinute).padStart(2, '0')}`

// AFTER
const timeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`
```

- [ ] **Step 2: Add normalizeTimeToHHMM helper and update loadRegistrations**

In `position-registration.js`, update `loadRegistrations` to normalize existing `H:MM` DB records to `HH:MM` when building the lookup map:

```javascript
// Add helper at top of file (after the require statements, before Page({})):
function normalizeTimeToHHMM(t) {
  if (!t) return t
  return t.replace(/^(\d):/, '0$1:')
}
```

In `loadRegistrations`, change the regMap building block:

```javascript
// BEFORE
const regMap = {}
for (const reg of registrations) {
  regMap[reg.timeSlot] = reg
}

// AFTER
const regMap = {}
for (const reg of registrations) {
  regMap[normalizeTimeToHHMM(reg.timeSlot)] = reg
}
```

- [ ] **Step 3: Normalize config.startTime display**

In `loadConfigData`, after setting `config`, also normalize `startTime` for display. Find the line that does `this.setData({ config, ... })` and update `config.startTime` before setting:

```javascript
// In loadConfigData, after: const config = await db.getPositionConfigById(configId)
// and before: this.setData({ config, ... })
// Add:
if (config && config.startTime) {
  config.startTime = normalizeTimeToHHMM(config.startTime)
}
```

- [ ] **Step 4: Verify syntax**

Run: `node -c miniprogram/utils/db.js && node -c miniprogram/pages/user/position-registration/position-registration.js`

Expected: No output (syntax OK).

- [ ] **Step 5: Commit**

```bash
git add miniprogram/utils/db.js miniprogram/pages/user/position-registration/position-registration.js
git commit -m "fix: 官职报名时间格式统一为HH:MM，兼容旧数据"
```

---

## Task 5: Bug 5 — Admin delete battle registration via cloud function

**Files:**
- Create: `miniprogram/cloudfunctions/manageBattle/index.js`
- Create: `miniprogram/cloudfunctions/manageBattle/package.json`
- Modify: `miniprogram/utils/db.js` (add `adminDeleteBattleRegistration`)
- Modify: `miniprogram/pages/user/battle-statistics/battle-statistics.js` (use new function in `onDeleteSelected`)

**Root cause:** `deleteBattleRegistration` uses the client-side SDK. The `battleRegistrations` collection is set to "仅创建者可写", so admin deleting someone else's record fails with a permission error. Cloud functions use server-side SDK which bypasses per-user write permissions.

- [ ] **Step 1: Create manageBattle cloud function directory and package.json**

Create `miniprogram/cloudfunctions/manageBattle/package.json`:

```json
{
  "name": "manageBattle",
  "version": "1.0.0",
  "description": "Admin operations for battle registrations",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  }
}
```

- [ ] **Step 2: Create manageBattle/index.js**

Create `miniprogram/cloudfunctions/manageBattle/index.js`:

```javascript
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { action, data } = event

  try {
    switch (action) {
      case 'adminDeleteRegistration':
        return await adminDeleteRegistration(data)
      default:
        return { success: false, error: 'Unknown action' }
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
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

  // 兼容 superAdmin 通过 phone 判断
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

// 管理员删除单条国战报名记录（绕过客户端权限限制）
async function adminDeleteRegistration(data) {
  const { registrationId } = data
  if (!registrationId) {
    throw new Error('缺少 registrationId 参数')
  }

  const wxContext = await cloud.getWXContext()
  await verifyAdminRole(wxContext.OPENID)

  await db.collection('battleRegistrations').doc(registrationId).remove()

  return { success: true }
}
```

- [ ] **Step 3: Add adminDeleteBattleRegistration to db.js**

In `db.js`, after the existing `deleteBattleRegistration` function (~line 1401), add:

```javascript
// 管理员删除单条报名记录（调用云函数绕过客户端权限）
async function adminDeleteBattleRegistration(registrationId) {
  const res = await wx.cloud.callFunction({
    name: 'manageBattle',
    data: {
      action: 'adminDeleteRegistration',
      data: { registrationId }
    }
  })
  if (!res.result || !res.result.success) {
    throw new Error((res.result && res.result.error) || '删除失败')
  }
  return res.result
}
```

Also add `adminDeleteBattleRegistration` to the `module.exports` at the bottom of `db.js`.

Look for the section that exports battle-related functions (around line 1824–1831) and add:
```javascript
adminDeleteBattleRegistration,
```

- [ ] **Step 4: Update battle-statistics.js to use adminDeleteBattleRegistration**

In `battle-statistics.js`, in the `onDeleteSelected` method, change the delete call to use the new cloud function:

```javascript
// BEFORE (line ~129)
await db.deleteBattleRegistration(id)

// AFTER
await db.adminDeleteBattleRegistration(id)
```

- [ ] **Step 5: Verify syntax**

Run:
```bash
node -c miniprogram/cloudfunctions/manageBattle/index.js
node -c miniprogram/utils/db.js
node -c miniprogram/pages/user/battle-statistics/battle-statistics.js
```

Expected: No output from any command (syntax OK).

- [ ] **Step 6: Commit**

```bash
git add miniprogram/cloudfunctions/manageBattle/ miniprogram/utils/db.js miniprogram/pages/user/battle-statistics/battle-statistics.js
git commit -m "fix: 区管删除国战报名记录 — 新增manageBattle云函数绕过客户端权限限制"
```

---

## Deployment Note

After committing, the `manageBattle` cloud function must be deployed to WeChat Cloud:
- Open WeChat Developer Tools
- Right-click `miniprogram/cloudfunctions/manageBattle/` → "上传并部署：云端安装依赖"
