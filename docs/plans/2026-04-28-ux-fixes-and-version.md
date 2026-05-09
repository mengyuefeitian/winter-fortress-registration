# UX Fixes & Version Display Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Fix 4 UX issues: (1) new users can't find their zone or apply for one, (2) unselected-zone users see other zones' data, (3) super admin alliance dropdown empty when approving auditor, (4) version display not auto-updating.

**Architecture:** All fixes are in the WeChat Mini Program frontend (`miniprogram/`). Issues 1-2 involve the index page and registration/position-list pages. Issue 3 is a data loading order bug in admin-review. Issue 4 is a version string update in `version.js`.

**Tech Stack:** WeChat Mini Program (WXML/WXSS/JS), WeChat Cloud Database

---

## Issue 1: New users can't find zone / no apply zone option

**Root Cause:** The "申请开通分区" button only appears when `zones.length === 0` (no zones at all). When zones exist but the user's zone is not among them, there's no escape hatch — only a guidance card saying "请选择您的分区" with no "my zone isn't listed" option.

**Fix:** Always show a "申请开通分区" link in the zone guidance area (both when zones exist but user hasn't selected one, and when no zones exist). This way, users who can't find their zone can always apply to create one.

### Task 1.1: Add "申请开通分区" option to the unselected-zone guidance card

**Files:**
- Modify: `miniprogram/pages/index/index.wxml:79-82`

**Step 1: Update the zone guidance card to include the apply button**

Change:
```xml
<!-- 分区引导：未选择分区 -->
<view wx:if="{{zones.length > 0 && !currentZone}}" class="zone-guide-card">
  <text class="zone-guide-text">请选择您的分区，以便查看对应联盟和报名信息</text>
</view>
```

To:
```xml
<!-- 分区引导：未选择分区 -->
<view wx:if="{{zones.length > 0 && !currentZone}}" class="zone-guide-card">
  <text class="zone-guide-text">请选择您的分区，以便查看对应联盟和报名信息</text>
  <text class="zone-guide-desc">找不到您的分区？可以申请开通新分区</text>
  <view class="zone-guide-btn" bindtap="applyCreateZone">申请开通分区</view>
</view>
```

**Step 2: Verify** — Open in WeChat Developer Tools, login as a user who hasn't selected a zone, confirm both the guidance text and "申请开通分区" button appear.

---

## Issue 2: Users without zone selection can see other zones' data

**Root Cause:**
- `registration.js` auto-selects the first zone if no saved preference exists (`zones[0]` fallback at line 64), so users always see some zone's data.
- `position-list.js` loads ALL position configs with no zone filter at all.

**Fix:**
- In `registration.js`, do NOT auto-select a zone. If user has no saved preference and no global zone, leave `selectedZone` as null. Show a prompt instead of data.
- In `position-list.js`, filter position configs by the user's selected zone (if any). If no zone selected, show a prompt to select one first.

### Task 2.1: Remove auto-zone-selection in registration.js

**Files:**
- Modify: `miniprogram/pages/user/registration/registration.js:62-84`

**Step 1: Change the zone fallback logic**

In `loadZones()`, change the fallback block (lines 62-84):

From:
```javascript
if (zones.length > 0) {
  // 优先使用全局分区，其次使用本地存储，最后默认第一个
  let selectedZone = zones[0]
  let zoneIndex = 0

  // 从全局数据读取当前分区
  if (app.globalData.currentZone) {
    const foundIndex = zones.findIndex(z => z._id === app.globalData.currentZone._id)
    if (foundIndex >= 0) {
      selectedZone = zones[foundIndex]
      zoneIndex = foundIndex
    }
  } else {
    // 从本地存储读取上次选择的分区
    const lastZoneId = wx.getStorageSync('lastZoneId')
    if (lastZoneId) {
      const foundIndex = zones.findIndex(z => z._id === lastZoneId)
      if (foundIndex >= 0) {
        selectedZone = zones[foundIndex]
        zoneIndex = foundIndex
      }
    }
  }
```

To:
```javascript
if (zones.length > 0) {
  // 优先使用全局分区，其次使用本地存储，不自动选择
  let selectedZone = null
  let zoneIndex = -1

  // 从全局数据读取当前分区
  if (app.globalData.currentZone) {
    const foundIndex = zones.findIndex(z => z._id === app.globalData.currentZone._id)
    if (foundIndex >= 0) {
      selectedZone = zones[foundIndex]
      zoneIndex = foundIndex
    }
  }

  // 如果全局分区未匹配，尝试本地存储
  if (!selectedZone) {
    const lastZoneId = wx.getStorageSync('lastZoneId')
    if (lastZoneId) {
      const foundIndex = zones.findIndex(z => z._id === lastZoneId)
      if (foundIndex >= 0) {
        selectedZone = zones[foundIndex]
        zoneIndex = foundIndex
      }
    }
  }
```

**Step 2: Update the setData and alliance loading**

Change:
```javascript
        this.setData({
          zones: zones,
          selectedZone: selectedZone,
          zoneIndex: zoneIndex,
          loading: false
        })

        // 加载联盟并恢复上次选择
        this.loadAlliances(selectedZone._id)
```

To:
```javascript
        this.setData({
          zones: zones,
          selectedZone: selectedZone,
          zoneIndex: zoneIndex,
          loading: false
        })

        // 仅当已选择分区时才加载联盟
        if (selectedZone) {
          this.loadAlliances(selectedZone._id)
        }
```

**Step 3: Verify** — Open registration page without a saved zone preference. Confirm zone picker shows "请选择分区" and no alliance/time slot data is displayed.

### Task 2.2: Add zone-not-selected prompt in registration.wxml

**Files:**
- Modify: `miniprogram/pages/user/registration/registration.wxml`

**Step 1: Add a prompt when no zone is selected**

After the zone picker section (around line 20-22), add a prompt view. Look for the `wx:else` block when zones exist but no zone is selected, and add:

```xml
<!-- 未选择分区提示 -->
<view wx:if="{{zones.length > 0 && !selectedZone}}" class="zone-guide-card" style="margin: 16px 0;">
  <text class="zone-guide-text">请先选择您的分区</text>
</view>
```

Place it before the alliance picker, so it shows between the zone picker and the alliance picker when no zone is selected.

**Step 2: Gate alliance picker behind zone selection**

Ensure the alliance picker and everything below it is hidden when `selectedZone` is null. Check that existing `wx:if` conditions on the alliance picker already handle this (they use `selectedZone` — if not, add the condition).

### Task 2.3: Add zone filter and prompt to position-list

**Files:**
- Modify: `miniprogram/pages/user/position-list/position-list.js`
- Modify: `miniprogram/pages/user/position-list/position-list.wxml`

**Step 1: Add zone data and filter logic to position-list.js**

Add zone selection data and a zone-not-selected state:

```javascript
data: {
  loading: false,
  configs: [],
  selectedZone: null,
  zones: [],
  zoneIndex: -1,
  noZoneSelected: false
},
```

In `onShow`, add zone loading before `loadConfigs`:

```javascript
onShow: function () {
  this.loadZonesAndConfigs()
},

loadZonesAndConfigs: async function () {
  try {
    const zones = await db.getAllZones()

    let selectedZone = null
    let zoneIndex = -1

    if (app.globalData.currentZone) {
      const foundIndex = zones.findIndex(z => z._id === app.globalData.currentZone._id)
      if (foundIndex >= 0) {
        selectedZone = zones[foundIndex]
        zoneIndex = foundIndex
      }
    }

    if (!selectedZone) {
      const lastZoneId = wx.getStorageSync('lastZoneId')
      if (lastZoneId) {
        const foundIndex = zones.findIndex(z => z._id === lastZoneId)
        if (foundIndex >= 0) {
          selectedZone = zones[foundIndex]
          zoneIndex = foundIndex
        }
      }
    }

    this.setData({
      zones: zones,
      selectedZone: selectedZone,
      zoneIndex: zoneIndex,
      noZoneSelected: !selectedZone
    })

    if (selectedZone) {
      this.loadConfigs(selectedZone._id)
    }
  } catch (err) {
    console.error('加载分区失败:', err)
    this.loadConfigs(null)
  }
},
```

Update `loadConfigs` to accept a `zoneId` parameter:

```javascript
loadConfigs: async function (zoneId) {
  try {
    this.setData({ loading: true })

    const today = util.formatDate(new Date(), 'YYYY-MM-DD')
    const allConfigs = await db.getPositionConfigs()

    let validConfigs = allConfigs.filter(config => config.date >= today)

    // 按分区过滤（如果有选中的分区）
    if (zoneId) {
      validConfigs = validConfigs.filter(config => !config.zoneId || config.zoneId === zoneId)
    }

    validConfigs.sort((a, b) => {
      if (a.date === b.date) {
        return a.positionType.localeCompare(b.positionType)
      }
      return a.date.localeCompare(b.date)
    })

    const processedConfigs = []
    for (const config of validConfigs) {
      const registrations = await db.getPositionRegistrationsByConfig(config._id)
      const slots = db.generatePositionTimeSlots(config.startTime)
      processedConfigs.push({
        ...config,
        registeredCount: registrations.length,
        totalSlots: slots.length
      })
    }

    this.setData({
      configs: processedConfigs,
      loading: false
    })

  } catch (err) {
    console.error('加载配置失败:', err)
    util.showError('加载失败')
    this.setData({
      configs: [],
      loading: false
    })
  }
},
```

Add zone change handler:

```javascript
onZoneChange: function (e) {
  const index = e.detail.value
  const zone = this.data.zones[index]

  if (zone) {
    wx.setStorageSync('lastZoneId', zone._id)
    app.globalData.currentZone = zone

    this.setData({
      zoneIndex: index,
      selectedZone: zone,
      noZoneSelected: false
    })

    this.loadConfigs(zone._id)
  }
},
```

**Step 2: Add zone picker and prompt to position-list.wxml**

Add a zone picker and no-zone-selected prompt before the configs list:

```xml
<!-- 分区选择 -->
<view class="zone-picker-section" wx:if="{{zones.length > 0}}" style="padding: 0 16px;">
  <picker mode="selector" range="{{zones}}" range-key="zoneName" value="{{zoneIndex >= 0 ? zoneIndex : 0}}" bindchange="onZoneChange">
    <view class="zone-picker-btn" style="display: flex; align-items: center; padding: 8px 12px; background: #fff; border-radius: 8px; border: 1px solid #e5e7eb;">
      <text class="text-sm">{{selectedZone ? selectedZone.zoneName : '请选择分区'}}</text>
      <text class="text-weak ml-4">▼</text>
    </view>
  </picker>
</view>

<!-- 未选择分区提示 -->
<view wx:if="{{noZoneSelected}}" class="zone-guide-card" style="margin: 16px;">
  <text class="zone-guide-text">请先选择您的分区</text>
</view>
```

Update the empty state and config list to only show when zone is selected:

Change `wx:if="{{!loading && configs.length === 0}}"` to `wx:if="{{!loading && !noZoneSelected && configs.length === 0}}"`
Change `wx:if="{{!loading && configs.length > 0}}"` to `wx:if="{{!loading && !noZoneSelected && configs.length > 0}}"`

**Step 3: Verify** — Open position-list without a zone selected. Confirm the prompt appears and no configs are shown. Select a zone and confirm configs load filtered by that zone.

---

## Issue 3: Super admin alliance dropdown empty when approving auditor

**Root Cause:** In `admin-review.js` `loadApplications()` (lines 140-178), when a user applies for `allianceManager`, the code looks for an approved `zoneManager` record to determine the applicant's zone. If the applicant has no approved zone-manager record (which is the common case — a regular user applying for 盟管 doesn't need to be a 区管 first), `applicantZoneId` is null. The fallback then tries `this.data.availableZones`, but `loadAvailableZones()` runs in parallel with `loadApplications()` (both called from `checkPermission`), and it may not have completed yet. Even when it does complete, the code falls back to `zones[0]._id` which could be wrong. More importantly, if the applicant doesn't have an approved zoneManager record AND `availableZones` hasn't loaded or is empty for some reason, the alliance list is empty.

The real fix: for `allianceManager` applications, the super admin should first pick a zone, then pick an alliance within that zone — similar to how `zoneManager` applications already work (zone picker first). The current code tries to auto-detect the zone from the applicant's previous records, but that's unreliable.

### Task 3.1: Add zone picker to alliance-manager approval flow

**Files:**
- Modify: `miniprogram/pages/superAdmin/admin-review/admin-review.js`
- Modify: `miniprogram/pages/superAdmin/admin-review/admin-review.wxml`

**Step 1: In admin-review.js, modify the alliance-manager flow to add a zone picker**

In `loadApplications()`, for `allianceManager` applications, instead of trying to auto-detect the zone, store `availableZones` on each application and add `applicantZoneIndex` and `applicantZoneId` fields:

Change the `allianceManager` block (lines 141-178) to:

```javascript
// 获取申请人的分区信息（盟管申请需要）
let applicantAlliances = []
let applicantZoneId = null
let applicantZoneIndex = 0

if (application.applyType === 'allianceManager' && userIdForUpdate) {
  try {
    // 查看申请人之前申请的区管记录中是否有分区信息
    const adminRes = await wxdb.collection('admins').where({
      userId: application.userId,
      applyType: 'zoneManager',
      status: 'approved'
    }).get()

    if (adminRes.data.length > 0 && adminRes.data[0].zoneId) {
      applicantZoneId = adminRes.data[0].zoneId
    }

    // 如果没有区管记录，尝试从原始申请的 zoneId 字段获取
    if (!applicantZoneId && application.zoneId) {
      applicantZoneId = application.zoneId
    }

    // 确定可用分区列表
    const zonesForApplicant = role === 'superAdmin' ? await db.getAllZones() : this.data.availableZones

    if (applicantZoneId) {
      const foundZoneIndex = zonesForApplicant.findIndex(z => z._id === applicantZoneId)
      if (foundZoneIndex >= 0) {
        applicantZoneIndex = foundZoneIndex
      } else {
        applicantZoneId = null
      }
    }

    // 加载该分区的联盟列表
    if (applicantZoneId) {
      applicantAlliances = await db.getAlliancesByZone(applicantZoneId)
    }
  } catch (err) {
    console.error('获取申请人分区信息失败:', err)
  }
}
```

And in the `applications.push(...)` block, add the new fields:

```javascript
applications.push({
  ...application,
  userId: userIdForUpdate,
  nickName: nickName,
  avatarUrl: avatarUrl,
  selectingZone: false,
  selectingAlliance: false,
  zonePickerIndex: 0,
  alliancePickerIndex: 0,
  applicantAlliances: applicantAlliances,
  applicantZoneIndex: applicantZoneIndex,
  applicantZoneId: applicantZoneId,
  formattedTime: application.createTime ? util.formatDate(application.createTime, 'YYYY-MM-DD HH:mm') : '',
  valid: userIdForUpdate !== null
})
```

**Step 2: Add zone picker to the alliance-manager WXML flow**

In `admin-review.wxml`, modify the alliance-manager selection section (lines 64-76). When `selectingAlliance` is true, first show a zone picker, then show the alliance picker:

Change:
```xml
<!-- 盟管联盟选择 -->
<view wx:if="{{item.valid && item.applyType === 'allianceManager' && item.selectingAlliance}}" class="zone-select-section">
  <text class="select-label">选择联盟：</text>
  <picker bindchange="onAllianceSelect" data-app-index="{{appIndex}}"
          range="{{item.applicantAlliances}}" range-key="allianceName" value="{{item.alliancePickerIndex || 0}}">
    <view class="picker-compact">{{item.applicantAlliances[item.alliancePickerIndex || 0].allianceName || '请选择'}}</view>
  </picker>
```

To:
```xml
<!-- 盟管联盟选择 -->
<view wx:if="{{item.valid && item.applyType === 'allianceManager' && item.selectingAlliance}}" class="zone-select-section">
  <text class="select-label">选择分区：</text>
  <picker bindchange="onAllianceZoneSelect" data-app-index="{{appIndex}}"
          range="{{availableZones}}" range-key="zoneName" value="{{item.applicantZoneIndex || 0}}">
    <view class="picker-compact">{{availableZones[item.applicantZoneIndex || 0].zoneName || '请选择'}}</view>
  </picker>
  <text class="select-label" style="margin-top: 8px;">选择联盟：</text>
  <picker wx:if="{{item.applicantAlliances.length > 0}}" bindchange="onAllianceSelect" data-app-index="{{appIndex}}"
          range="{{item.applicantAlliances}}" range-key="allianceName" value="{{item.alliancePickerIndex || 0}}">
    <view class="picker-compact">{{item.applicantAlliances[item.alliancePickerIndex || 0].allianceName || '请选择'}}</view>
  </picker>
  <view wx:else class="picker-compact text-weak">请先选择分区</view>
```

**Step 3: Add `onAllianceZoneSelect` handler in admin-review.js**

Add this method after `onAllianceSelect`:

```javascript
// 盟管批准流程中的分区选择变化
onAllianceZoneSelect: async function (e) {
  const appIndex = e.currentTarget.dataset.appIndex
  const zoneIndex = parseInt(e.detail.value)
  const applications = this.data.applications

  const selectedZone = this.data.availableZones[zoneIndex]
  if (!selectedZone) return

  // 加载该分区的联盟列表
  try {
    util.showLoading('加载联盟...')
    const alliances = await db.getAlliancesByZone(selectedZone._id)

    applications[appIndex].applicantZoneIndex = zoneIndex
    applications[appIndex].applicantZoneId = selectedZone._id
    applications[appIndex].applicantAlliances = alliances
    applications[appIndex].alliancePickerIndex = 0

    this.setData({ applications })
    util.hideLoading()
  } catch (err) {
    util.hideLoading()
    console.error('加载联盟失败:', err)
    util.showError('加载联盟失败')
  }
},
```

**Step 4: Update `confirmApproveAllianceManager` to use the selected zone**

No change needed — the existing code already reads `application.applicantAlliances` for the selected alliance, which is now correctly populated from the zone picker.

**Step 5: Verify** — Login as superAdmin, go to 盟管审核, tap 批准 on an allianceManager application. Confirm the zone picker appears first, selecting a zone loads alliances, and the alliance picker then works.

---

## Issue 4: Version display not auto-updating (shows 1.0.1)

**Root Cause:** The version string in `utils/version.js` is `1.0.1` but the product has been updated to `1.1.2`. The version is only displayed on the index page. Since this is a WeChat Mini Program (no CI/CD pipeline), there's no way to truly "auto-update" — someone must update `version.js` before each upload. The fix is:
1. Update `version.js` to the correct version `1.1.2`
2. Add version display to the "我的" page (my-registrations) for consistency, since users spend time there
3. The version update process is already documented in CLAUDE.md and CHANGELOG.md — no further automation is possible in WeChat Mini Programs

### Task 4.1: Update version.js to current version

**Files:**
- Modify: `miniprogram/utils/version.js`

**Step 1: Update the version string**

Change:
```javascript
const APP_VERSION = '1.0.1'
```

To:
```javascript
const APP_VERSION = '1.1.2'
```

### Task 4.2: Add version display to my-registrations page

**Files:**
- Modify: `miniprogram/pages/user/my-registrations/my-registrations.js`
- Modify: `miniprogram/pages/user/my-registrations/my-registrations.wxml`

**Step 1: Import version.js in my-registrations.js**

Add at the top:
```javascript
const version = require('../../../utils/version')
```

In the `data` object, add:
```javascript
versionText: version.getVersionText()
```

**Step 2: Add version text to my-registrations.wxml**

At the bottom of the page, before closing `</view>`, add:
```xml
<view class="text-center mt-32 mb-16">
  <text class="text-weak text-xs">{{versionText}}</text>
</view>
```

**Step 3: Verify** — Open both the index page and "我的" page. Confirm both show "无尽冬日活动管理 v1.1.2".
