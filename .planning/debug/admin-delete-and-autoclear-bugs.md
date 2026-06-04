---
slug: admin-delete-and-autoclear-bugs
status: resolved
date: 2026-06-03
trigger: manual
---

# Debug Session: admin-delete-and-autoclear-bugs

## Symptoms

1. **Bug 1**: 区管（admin role）无法看到国战日期的删除按钮，只有超管能看到。
2. **Bug 2**: 超管自动清空配置页面手动点击"清除"，未清除已过期的国战报名记录（battleRegistrations / battleConfigs）。

## Investigation

### Bug 1: Admin cannot see delete button for battle date configs

**Files investigated:**
- `miniprogram/pages/user/battle-list/battle-list.wxml`
- `miniprogram/pages/user/battle-list/battle-list.js`
- `miniprogram/utils/auth.js`

**Root cause:**

In `battle-list.wxml` line 47 (original), the delete button used `wx:if="{{isSuperAdmin}}"` as its visibility condition. However, `canCreate` was already set to `isSuperAdmin || role === 'admin'` (line 50 in the JS), meaning admin can create battle configs but could not see the delete button.

Additionally, the `onDeleteConfig` handler in `battle-list.js` contained a hard check: `if (!auth.isSuperAdmin(app.globalData.role))` that would reject any non-superAdmin trying to call delete, even if the button were somehow shown.

The mismatch: `canCreate` correctly includes admin, but the delete button visibility and handler guard were written superAdmin-only — inconsistent with the stated intent that admin (区管) manages their own zone's battle configs.

### Bug 2: Manual clear in auto-clear page does not clear expired battle registrations

**Files investigated:**
- `miniprogram/pages/superAdmin/auto-clear/auto-clear.js`
- `miniprogram/cloudfunctions/clearRegistrations/index.js`

**Root cause:**

The auto-clear page's `manualClear` calls the `clearRegistrations` cloud function with action `clearExpiredAll`. The `clearExpiredAll()` function clears:
- `timeSlots` + `registrations` (堡垒时间段报名)
- `positionConfigs` + `positionRegistrations` (官职报名)
- `arsenalConfigs` + `arsenalRegistrations` (兵工厂)
- `canyonConfigs` + `canyonRegistrations` (峡谷)

But it completely omits `battleConfigs` + `battleRegistrations` (国战报名). These are stored in a separate collection (`battleConfigs` / `battleRegistrations`) added later than the original clear logic, and the `clearExpiredAll()` function was never updated to include them.

## Fixes Applied

### Fix 1: `miniprogram/pages/user/battle-list/battle-list.wxml`

Changed delete button visibility from `wx:if="{{isSuperAdmin}}"` to `wx:if="{{canCreate}}"`.

`canCreate` is already defined as `isSuperAdmin || role === 'admin'` in the JS, so this correctly shows the button for both admin and superAdmin while hiding it for regular users and auditors.

### Fix 2: `miniprogram/pages/user/battle-list/battle-list.js`

Changed the permission guard in `onDeleteConfig` from:
```js
if (!auth.isSuperAdmin(app.globalData.role)) {
  util.showError('仅超级管理员可删除')
```
to:
```js
if (!auth.canManageZone(app.globalData.role)) {
  util.showError('仅区管及以上可删除')
```

`auth.canManageZone()` returns `true` for both `admin` and `superAdmin` roles.

### Fix 3: `miniprogram/cloudfunctions/clearRegistrations/index.js`

Added step 4 to `clearExpiredAll()`:
- Added `battleConfigs: 0, battleRegistrations: 0` to the results object.
- Added a block that queries all `battleConfigs`, filters for expired/inactive ones (same pattern used for other config types), deletes the matching `battleRegistrations` first, then deletes the `battleConfigs`.
- Updated the return `message` string to include `国战报名 N 条，国战配置 N 个`.

## Files Modified

- `miniprogram/pages/user/battle-list/battle-list.wxml` — delete button condition: `isSuperAdmin` → `canCreate`
- `miniprogram/pages/user/battle-list/battle-list.js` — permission guard: `isSuperAdmin` → `canManageZone`
- `miniprogram/cloudfunctions/clearRegistrations/index.js` — `clearExpiredAll()` now clears expired `battleConfigs` and `battleRegistrations`

## Deployment Notes

The cloud function `clearRegistrations` must be redeployed after this fix:
- Right-click `miniprogram/cloudfunctions/clearRegistrations/` in WeChat Developer Tools
- Select "上传并部署：云端安装依赖"

The WXML/JS page changes take effect on next mini-program upload.

## Resolution

```
root_cause: |
  Bug 1: battle-list.wxml delete button checked isSuperAdmin instead of canCreate (which already
  includes admin). The onDeleteConfig handler also had a superAdmin-only guard.
  Bug 2: clearExpiredAll() in clearRegistrations cloud function had no logic to handle
  battleConfigs/battleRegistrations collections, so expired 国战 data was never cleaned.

fix: |
  Bug 1: Changed delete button wx:if to {{canCreate}} and updated onDeleteConfig guard to
  auth.canManageZone() (allows admin + superAdmin).
  Bug 2: Added step 4 to clearExpiredAll() that deletes expired battleRegistrations first,
  then expired battleConfigs, using the same date-expiry pattern as other config types.
```
