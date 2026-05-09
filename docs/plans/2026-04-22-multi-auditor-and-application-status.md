# Multi-Auditor Alliance Binding & Application Status Display Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Enable multiple auditors per alliance, show application history in the apply dialog, and allow in-review alliance binding for approved auditors.

**Architecture:** Change `alliances.auditorId` from a single `_id` to an array `auditorIds`. Add a `bindAllianceAuditors` db function. During 盟管 approval, show a picker to select the applicant's zone's alliances and bind immediately. In 联盟管理/联盟配置 pages, replace the picker+button UI with a read-only list of bound auditor nicknames. In the index page apply dialog, check and display existing application records (pending/rejected/approved).

**Tech Stack:** WeChat Mini Program (WXML/WXSS/JS), Cloud Database, existing utils/db.js and utils/auth.js

---

### Task 1: Add `bindAllianceAuditors` and `getAllianceAuditorInfo` to db.js

**Objective:** Create new DB functions to support multiple auditor IDs per alliance and resolve auditor display info.

**Files:**
- Modify: `miniprogram/utils/db.js:332-340` (replace `bindAuditor`)

**Step 1: Add the new `bindAllianceAuditors` function**

In `db.js`, after the existing `bindAuditor` function (line 340), add:

```js
// 绑定盟管到联盟（支持多盟管）
async function bindAllianceAuditors(allianceId, auditorId, action = 'add') {
  const db = getDb()
  const _ = db.command

  const alliance = await db.collection('alliances').doc(allianceId).get()
  const currentIds = alliance.data.auditorIds || []

  if (action === 'add') {
    if (currentIds.includes(auditorId)) {
      throw new Error('该盟管已绑定此联盟')
    }
    return await db.collection('alliances').doc(allianceId).update({
      data: {
        auditorIds: _.push(auditorId),
        updateTime: db.serverDate()
      }
    })
  } else if (action === 'remove') {
    return await db.collection('alliances').doc(allianceId).update({
      data: {
        auditorIds: _.pull(auditorId),
        updateTime: db.serverDate()
      }
    })
  }
}

// 获取联盟绑定的盟管信息列表
async function getAllianceAuditorInfo(allianceId) {
  const db = getDb()
  const alliance = await db.collection('alliances').doc(allianceId).get()
  const auditorIds = alliance.data.auditorIds || []

  if (auditorIds.length === 0) return []

  const res = await db.collection('users').where({
    _id: db.command.in(auditorIds)
  }).get()

  return res.data
}
```

**Step 2: Add `getUserApplications` function**

```js
// 获取用户的所有申请记录
async function getUserApplications(userId) {
  const db = getDb()
  const res = await db.collection('admins').where({
    userId: userId
  }).orderBy('createTime', 'desc').get()
  return res.data
}
```

**Step 3: Update module.exports**

Add these new exports:
```js
bindAllianceAuditors,
getAllianceAuditorInfo,
getUserApplications,
```

**Step 4: Verify**

Run: `grep -n "bindAllianceAuditors\|getAllianceAuditorInfo\|getUserApplications" miniprogram/utils/db.js`
Expected: All three function names appear in both definition and exports.

**Step 5: Commit**

```bash
git add miniprogram/utils/db.js
git commit -m "feat: add multi-auditor db functions and user application query"
```

---

### Task 2: Update index.js — show application records in apply dialog

**Objective:** When a user clicks "申请盟管" or "申请区管", check their existing applications first. If they have records (pending or rejected), show the status instead of the phone input dialog directly.

**Files:**
- Modify: `miniprogram/pages/index/index.js:293-419`

**Step 1: Rewrite `applyAllianceManager` and `applyZoneManager`**

Replace lines 293-301:

```js
// 申请盟管
applyAllianceManager: async function () {
  await this.checkAndShowApplyDialog('allianceManager')
},

// 申请区管
applyZoneManager: async function () {
  await this.checkAndShowApplyDialog('zoneManager')
},
```

**Step 2: Replace `showApplyDialog` with `checkAndShowApplyDialog`**

Replace lines 304-316 with:

```js
// 检查申请记录并显示弹窗
checkAndShowApplyDialog: async function (applyType) {
  const typeText = applyType === 'zoneManager' ? '区管' : '盟管'
  const userId = app.globalData.openid

  if (!userId) {
    util.showInfo('请先登录')
    return
  }

  try {
    const applications = await db.getUserApplications(userId)
    const sameTypeApps = applications.filter(a => a.applyType === applyType)

    // 找到最新的一条记录
    if (sameTypeApps.length > 0) {
      const latestApp = sameTypeApps[0]

      if (latestApp.status === 'pending') {
        wx.showModal({
          title: `申请${typeText}`,
          content: `您已提交${typeText}申请，正在等待审核。`,
          showCancel: false,
          confirmText: '我知道了'
        })
        return
      }

      if (latestApp.status === 'rejected') {
        wx.showModal({
          title: `申请${type管}`,
          content: `您之前的${typeText}申请已被拒绝。是否重新申请？`,
          confirmText: '重新申请',
          success: (res) => {
            if (res.confirm) {
              this.showPhoneInputDialog(applyType === 'zoneManager' ? 'admin' : 'auditor')
            }
          }
        })
        return
      }

      if (latestApp.status === 'approved') {
        // 已通过 — 入口不应显示，但作为安全措施
        wx.showModal({
          title: `申请${typeText}`,
          content: `您的${typeText}申请已通过。`,
          showCancel: false,
          confirmText: '我知道了'
        })
        return
      }
    }

    // 没有任何记录，走正常申请流程
    wx.showModal({
      title: `申请${typeText}`,
      content: '申请需要绑定手机号，是否立即申请？',
      confirmText: '立即申请',
      success: (res) => {
        if (res.confirm) {
          this.showPhoneInputDialog(applyType === 'zoneManager' ? 'admin' : 'auditor')
        }
      }
    })
  } catch (err) {
    console.error('查询申请记录失败:', err)
    // 查询失败时降级为正常申请流程
    wx.showModal({
      title: `申请${typeText}`,
      content: '申请需要绑定手机号，是否立即申请？',
      confirmText: '立即申请',
      success: (res) => {
        if (res.confirm) {
          this.showPhoneInputDialog(applyType === 'zoneManager' ? 'admin' : 'auditor')
        }
      }
    })
  }
},
```

**Step 3: Update `showPhoneInputDialog` to accept applyType directly**

No changes needed — the `targetRole` parameter already maps correctly. But update `submitApplication` to also check for existing non-pending applications:

In `submitApplication`, replace lines 367-377 (the `checkExistingApplication` block) with:

```js
// 检查是否已有待审核的申请
const existingApplication = await this.checkExistingApplication(userId, applyType)

if (existingApplication) {
  util.hideLoading()
  const typeText = applyType === 'zoneManager' ? '区管' : '盟管'
  util.showInfo(`您已有待审核的${typeText}申请`)
  return
}
```

This remains the same — the check for pending applications still prevents duplicate submissions. The `checkAndShowApplyDialog` handles the UI-side display of status.

**Step 4: Verify**

Read the modified file to confirm all function signatures are consistent and the flow is correct.

**Step 5: Commit**

```bash
git add miniprogram/pages/index/index.js
git commit -m "feat: show application status in apply dialog (pending/rejected/approved)"
```

---

### Task 3: Update admin-review page — alliance picker on 盟管 approval

**Objective:** When approving an 盟管 (allianceManager) application, show a picker to select which alliance (from the applicant's zone) to bind the auditor to. Also load the applicant's zone info.

**Files:**
- Modify: `miniprogram/pages/superAdmin/admin-review/admin-review.js:96-129, 287-348`
- Modify: `miniprogram/pages/superAdmin/admin-review/admin-review.wxml:56-62`

**Step 1: In `loadApplications`, load applicant's zone and alliance info for 盟管 applications**

After line 128 (before `applications.push(...)`), add logic to fetch the applicant's zone/alliance context:

Replace the push block (lines 120-129) with:

```js
// 获取申请人的分区信息（盟管申请需要）
let applicantZoneId = null
let applicantZoneName = ''
let applicantAlliances = []

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
      applicantZoneName = adminRes.data[0].zoneName || ''
    }

    // 如果没有区管记录，查看当前分区选择
    if (!applicantZoneId) {
      // 尝试所有分区（让审核者选择）
      const allZones = await db.getAllZones()
      if (allZones.length > 0) {
        applicantZoneId = allZones[0]._id
        applicantZoneName = allZones[0].zoneName
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

applications.push({
  ...application,
  userId: userIdForUpdate,
  nickName: nickName,
  avatarUrl: avatarUrl,
  selectingZone: false,
  selectingAlliance: false,
  zonePickerIndex: 0,
  alliancePickerIndex: 0,
  applicantZoneId: applicantZoneId,
  applicantZoneName: applicantZoneName,
  applicantAlliances: applicantAlliances,
  formattedTime: application.createTime ? util.formatDate(application.createTime, 'YYYY-MM-DD HH:mm') : '',
  valid: userIdForUpdate !== null
})
```

**Step 2: Add data fields for alliance selection state**

In the `data` object (line 8-14), no changes needed — the per-application state is stored within each application object.

**Step 3: Add functions for alliance selection flow**

Add these new functions before `approveApplication` (before line 287):

```js
// 开始选择联盟（盟管申请批准流程）
startSelectAlliance: function (e) {
  const index = e.currentTarget.dataset.index
  const applications = this.data.applications
  applications[index].selectingAlliance = true
  applications[index].alliancePickerIndex = 0
  this.setData({ applications })
},

// 联盟选择变化
onAllianceSelect: function (e) {
  const appIndex = e.currentTarget.dataset.appIndex
  const allianceIndex = parseInt(e.detail.value)
  const applications = this.data.applications
  applications[appIndex].alliancePickerIndex = allianceIndex
  this.setData({ applications })
},

// 取消选择联盟
cancelSelectAlliance: function (e) {
  const index = e.currentTarget.dataset.index
  const applications = this.data.applications
  applications[index].selectingAlliance = false
  this.setData({ applications })
},
```

**Step 4: Rewrite `approveApplication` to include alliance binding**

Replace lines 287-348:

```js
// 确认批准盟管（带联盟绑定）
confirmApproveAllianceManager: async function (e) {
  const applicationId = e.currentTarget.dataset.id
  const userId = e.currentTarget.dataset.userid
  const index = e.currentTarget.dataset.index

  if (!userId) {
    util.showError('用户数据异常，无法批准')
    return
  }

  const application = this.data.applications[index]
  const alliances = application.applicantAlliances || []

  if (alliances.length === 0) {
    util.showError('未找到可绑定的联盟，请先配置分区联盟')
    return
  }

  const selectedAllianceIndex = application.alliancePickerIndex || 0
  const selectedAlliance = alliances[selectedAllianceIndex]

  if (!selectedAlliance) {
    util.showInfo('请选择联盟')
    return
  }

  try {
    util.showLoading('正在批准...')

    const reviewerId = app.globalData.openid
    const approvedRole = 'auditor'

    // 更新申请状态
    await db.reviewAdminApplication(applicationId, 'approved', reviewerId, approvedRole)

    // 更新用户角色
    await db.updateUserRole(userId, approvedRole)

    // 绑定盟管到联盟
    await db.bindAllianceAuditors(selectedAlliance._id, userId)

    // 从待审核列表移除
    const applications = this.data.applications
    const approvedApp = applications.splice(index, 1)[0]

    // 添加到已审核列表
    const reviewedApplications = this.data.reviewedApplications
    reviewedApplications.unshift({
      ...approvedApp,
      status: 'approved',
      approvedRole: approvedRole,
      allianceName: selectedAlliance.allianceName,
      formattedReviewTime: util.formatDate(new Date(), 'YYYY-MM-DD HH:mm')
    })

    this.setData({
      applications: applications,
      reviewedApplications: reviewedApplications
    })

    util.hideLoading()
    util.showSuccess('已批准并绑定到 ' + selectedAlliance.allianceName)

  } catch (err) {
    util.hideLoading()
    console.error('批准失败:', err)
    util.showError('批准失败: ' + (err.message || '未知错误'))
  }
},
```

**Step 5: Update WXML — replace simple approve buttons with alliance selection flow**

Replace lines 56-62 in the WXML:

```xml
<!-- 盟管申请按钮（仅有效申请可审核） -->
<view wx:if="{{item.valid && item.applyType === 'allianceManager' && !item.selectingAlliance}}" class="card-footer">
  <button class="btn btn-success" bindtap="startSelectAlliance"
          data-id="{{item._id}}" data-userid="{{item.userId}}" data-index="{{appIndex}}">批准</button>
  <button class="btn btn-danger" bindtap="rejectApplication"
          data-id="{{item._id}}" data-index="{{appIndex}}">拒绝</button>
</view>

<!-- 盟管联盟选择 -->
<view wx:if="{{item.valid && item.applyType === 'allianceManager' && item.selectingAlliance}}" class="zone-select-section">
  <text class="select-label">选择联盟：</text>
  <picker bindchange="onAllianceSelect" data-app-index="{{appIndex}}"
          range="{{item.applicantAlliances}}" range-key="allianceName" value="{{item.alliancePickerIndex || 0}}">
    <view class="picker-compact">{{item.applicantAlliances[item.alliancePickerIndex || 0].allianceName || '请选择'}}</view>
  </picker>
  <view class="select-actions">
    <button class="btn btn-success" bindtap="confirmApproveAllianceManager"
            data-id="{{item._id}}" data-userid="{{item.userId}}" data-index="{{appIndex}}">确认</button>
    <button class="btn btn-ghost" bindtap="cancelSelectAlliance" data-index="{{appIndex}}">取消</button>
  </view>
</view>
```

**Step 6: Also update the reviewed record display to show alliance name**

In the reviewed section, after line 91 (`<text wx:if="{{item.zoneName}}"...>`), add:

```xml
<text wx:if="{{item.allianceName}}" class="text-xs text-secondary mt-2">联盟: {{item.allianceName}}</text>
```

**Step 7: Verify**

Read both modified files to confirm consistency.

**Step 8: Commit**

```bash
git add miniprogram/pages/superAdmin/admin-review/admin-review.js miniprogram/pages/superAdmin/admin-review/admin-review.wxml
git commit -m "feat: add alliance picker on auditor approval, bind to alliance directly"
```

---

### Task 4: Update alliance-config page — display auditor nicknames, remove picker

**Objective:** Replace the single-auditor picker UI with a read-only list of bound auditor nicknames. Add ability to add/remove auditors.

**Files:**
- Modify: `miniprogram/pages/admin/alliance-config/alliance-config.js`
- Modify: `miniprogram/pages/admin/alliance-config/alliance-config.wxml`
- Modify: `miniprogram/pages/admin/alliance-config/alliance-config.wxss`

**Step 1: Update `loadAlliances` in alliance-config.js**

Replace the processing in `loadAlliances` (lines 140-145):

```js
const processedAlliances = (alliances || []).map(alliance => ({
  ...alliance,
  editName: alliance.allianceName,
  auditorNames: [],  // will be filled after auditor info loaded
  showAddAuditor: false,
  auditorPickerIndex: 0
}))
```

After setting alliances data, load auditor info for each:

```js
this.setData({
  alliances: processedAlliances
})

// Load auditor display names for each alliance
for (let i = 0; i < processedAlliances.length; i++) {
  const alliance = processedAlliances[i]
  const auditorIds = alliance.auditorIds || []
  if (auditorIds.length > 0) {
    try {
      const wxdb = wx.cloud.database()
      const res = await wxdb.collection('users').where({
        _id: wxdb.command.in(auditorIds)
      }).get()
      const names = res.data.map(u => ({ _id: u._id, nickName: u.nickName || '未知' }))

      const alliances = this.data.alliances
      alliances[i].auditorNames = names
      this.setData({ alliances })
    } catch (err) {
      console.error('获取盟管信息失败:', err)
    }
  }
}
```

**Step 2: Replace `onAuditorChange` and add new auditor management functions**

Remove `onAuditorChange` (lines 238-267) entirely. Add:

```js
// 显示添加盟管选择器
showAddAuditorPicker: function (e) {
  const index = e.currentTarget.dataset.index
  const alliances = this.data.alliances
  alliances[index].showAddAuditor = true
  alliances[index].auditorPickerIndex = 0
  this.setData({ alliances })
},

// 取消添加盟管
cancelAddAuditor: function (e) {
  const index = e.currentTarget.dataset.index
  const alliances = this.data.alliances
  alliances[index].showAddAuditor = false
  this.setData({ alliances })
},

// 盟管选择变化
onAuditorPickerChange: function (e) {
  const allianceIndex = e.currentTarget.dataset.index
  const auditorIndex = parseInt(e.detail.value)
  const alliances = this.data.alliances
  alliances[allianceIndex].auditorPickerIndex = auditorIndex
  this.setData({ alliances })
},

// 确认添加盟管
confirmAddAuditor: async function (e) {
  const allianceIndex = e.currentTarget.dataset.index
  const alliance = this.data.alliances[allianceIndex]
  const auditorIndex = alliance.auditorPickerIndex || 0
  const auditor = this.data.auditors[auditorIndex]

  // Skip "未绑定" placeholder (index 0)
  if (!auditor._id) {
    util.showInfo('请选择盟管')
    return
  }

  // Check if already bound
  const existingIds = alliance.auditorIds || []
  if (existingIds.includes(auditor._id)) {
    util.showInfo('该盟管已绑定此联盟')
    return
  }

  try {
    util.showLoading('正在绑定...')
    await db.bindAllianceAuditors(alliance._id, auditor._id)

    // Update local state
    const alliances = this.data.alliances
    if (!alliances[allianceIndex].auditorIds) {
      alliances[allianceIndex].auditorIds = []
    }
    alliances[allianceIndex].auditorIds.push(auditor._id)
    if (!alliances[allianceIndex].auditorNames) {
      alliances[allianceIndex].auditorNames = []
    }
    alliances[allianceIndex].auditorNames.push({ _id: auditor._id, nickName: auditor.nickName })
    alliances[allianceIndex].showAddAuditor = false

    this.setData({ alliances })
    util.hideLoading()
    util.showSuccess('绑定成功')

  } catch (err) {
    util.hideLoading()
    util.showError('绑定失败: ' + (err.message || '未知错误'))
  }
},

// 移除盟管
removeAuditor: async function (e) {
  const allianceIndex = e.currentTarget.dataset.allianceindex
  const auditorId = e.currentTarget.dataset.auditorid
  const alliance = this.data.alliances[allianceIndex]

  const confirm = await util.showConfirm('确认移除', '确定要移除该盟管吗？')

  if (!confirm) return

  try {
    util.showLoading('正在移除...')
    await db.bindAllianceAuditors(alliance._id, auditorId, 'remove')

    // Update local state
    const alliances = this.data.alliances
    alliances[allianceIndex].auditorIds = (alliances[allianceIndex].auditorIds || []).filter(id => id !== auditorId)
    alliances[allianceIndex].auditorNames = (alliances[allianceIndex].auditorNames || []).filter(a => a._id !== auditorId)

    this.setData({ alliances })
    util.hideLoading()
    util.showSuccess('已移除')

  } catch (err) {
    util.hideLoading()
    util.showError('移除失败')
  }
},
```

**Step 3: Update WXML — replace auditor picker with name list + add/remove**

Replace lines 29-37 in alliance-config.wxml:

```xml
<!-- 盟管列表 -->
<view class="auditor-section">
  <view class="auditor-label">盟管</view>
  <view class="auditor-list">
    <view wx:if="{{item.auditorNames.length === 0}}" class="auditor-empty">
      <text class="text-weak text-xs">未绑定</text>
    </view>
    <view wx:for="{{item.auditorNames}}" wx:for-item="auditor" wx:key="_id" class="auditor-tag">
      <text class="auditor-name">{{auditor.nickName}}</text>
      <view class="auditor-remove" bindtap="removeAuditor" data-allianceindex="{{index}}" data-auditorid="{{auditor._id}}">×</view>
    </view>
  </view>
  <!-- 添加盟管按钮 -->
  <view wx:if="{{!item.showAddAuditor}}" class="add-auditor-btn" bindtap="showAddAuditorPicker" data-index="{{index}}">
    <text>+ 添加盟管</text>
  </view>
  <!-- 添加盟管选择器 -->
  <view wx:if="{{item.showAddAuditor}}" class="add-auditor-picker">
    <picker bindchange="onAuditorPickerChange" value="{{item.auditorPickerIndex}}" range="{{auditors}}" range-key="nickName" data-index="{{index}}">
      <view class="picker-compact">{{auditors[item.auditorPickerIndex].nickName || '请选择'}}</view>
    </picker>
    <view class="picker-actions">
      <button class="btn btn-success btn-sm" bindtap="confirmAddAuditor" data-index="{{index}}">确认</button>
      <button class="btn btn-ghost btn-sm" bindtap="cancelAddAuditor" data-index="{{index}}">取消</button>
    </view>
  </view>
</view>
```

**Step 4: Add new styles to alliance-config.wxss**

Add after existing auditor-related styles:

```css
.auditor-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
  margin-top: 8rpx;
}

.auditor-empty {
  padding: 4rpx 0;
}

.auditor-tag {
  display: inline-flex;
  align-items: center;
  background: #e8f0fe;
  color: #4A90D9;
  padding: 6rpx 16rpx;
  border-radius: 20rpx;
  font-size: 22rpx;
}

.auditor-name {
  margin-right: 8rpx;
}

.auditor-remove {
  color: #9ca3af;
  font-size: 26rpx;
  line-height: 1;
  padding: 0 4rpx;
}

.add-auditor-btn {
  display: inline-block;
  color: #4A90D9;
  font-size: 22rpx;
  margin-top: 8rpx;
  padding: 6rpx 16rpx;
  border: 1rpx dashed #4A90D9;
  border-radius: 20rpx;
}

.add-auditor-picker {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-top: 8rpx;
}

.picker-actions {
  display: flex;
  gap: 8rpx;
}

.btn-sm {
  font-size: 22rpx;
  padding: 6rpx 20rpx;
  min-width: auto;
}
```

**Step 5: Verify**

Read modified files.

**Step 6: Commit**

```bash
git add miniprogram/pages/admin/alliance-config/
git commit -m "feat: alliance-config shows auditor name list, supports add/remove"
```

---

### Task 5: Update superAdmin alliance-manage page — display auditor nicknames, remove picker+button

**Objective:** Same changes as Task 4 but for the superAdmin alliance-manage page. Replace the picker+bind-button UI with auditor name list + add/remove.

**Files:**
- Modify: `miniprogram/pages/superAdmin/alliance-manage/alliance-manage.js`
- Modify: `miniprogram/pages/superAdmin/alliance-manage/alliance-manage.wxml`
- Modify: `miniprogram/pages/superAdmin/alliance-manage/alliance-manage.wxss`

**Step 1: Update `loadAlliances` in alliance-manage.js**

Replace lines 86-91:

```js
const processedAlliances = alliances.map(alliance => ({
  ...alliance,
  editName: alliance.allianceName,
  auditorNames: [],
  showAddAuditor: false,
  auditorPickerIndex: 0
}))
```

After `setData`, load auditor info:

```js
this.setData({
  alliances: processedAlliances
})

for (let i = 0; i < processedAlliances.length; i++) {
  const alliance = processedAlliances[i]
  const auditorIds = alliance.auditorIds || []
  if (auditorIds.length > 0) {
    try {
      const wxdb = wx.cloud.database()
      const res = await wxdb.collection('users').where({
        _id: wxdb.command.in(auditorIds)
      }).get()
      const names = res.data.map(u => ({ _id: u._id, nickName: u.nickName || '未知' }))

      const alliances = this.data.alliances
      alliances[i].auditorNames = names
      this.setData({ alliances })
    } catch (err) {
      console.error('获取盟管信息失败:', err)
    }
  }
}
```

**Step 2: Remove `onAuditorChange` and `bindAuditor` functions, add new ones**

Remove `onAuditorChange` (lines 186-198) and `bindAuditor` (lines 201-232). Add the same functions as Task 4:

```js
// 显示添加盟管选择器
showAddAuditorPicker: function (e) {
  const index = e.currentTarget.dataset.index
  const alliances = this.data.alliances
  alliances[index].showAddAuditor = true
  alliances[index].auditorPickerIndex = 0
  this.setData({ alliances })
},

// 取消添加盟管
cancelAddAuditor: function (e) {
  const index = e.currentTarget.dataset.index
  const alliances = this.data.alliances
  alliances[index].showAddAuditor = false
  this.setData({ alliances })
},

// 盟管选择变化
onAuditorPickerChange: function (e) {
  const allianceIndex = e.currentTarget.dataset.index
  const auditorIndex = parseInt(e.detail.value)
  const alliances = this.data.alliances
  alliances[allianceIndex].auditorPickerIndex = auditorIndex
  this.setData({ alliances })
},

// 确认添加盟管
confirmAddAuditor: async function (e) {
  const allianceIndex = e.currentTarget.dataset.index
  const alliance = this.data.alliances[allianceIndex]
  const auditorIndex = alliance.auditorPickerIndex || 0
  const auditor = this.data.auditors[auditorIndex]

  if (!auditor._id) {
    util.showInfo('请选择盟管')
    return
  }

  const existingIds = alliance.auditorIds || []
  if (existingIds.includes(auditor._id)) {
    util.showInfo('该盟管已绑定此联盟')
    return
  }

  try {
    util.showLoading('正在绑定...')
    await db.bindAllianceAuditors(alliance._id, auditor._id)

    const alliances = this.data.alliances
    if (!alliances[allianceIndex].auditorIds) {
      alliances[allianceIndex].auditorIds = []
    }
    alliances[allianceIndex].auditorIds.push(auditor._id)
    if (!alliances[allianceIndex].auditorNames) {
      alliances[allianceIndex].auditorNames = []
    }
    alliances[allianceIndex].auditorNames.push({ _id: auditor._id, nickName: auditor.nickName })
    alliances[allianceIndex].showAddAuditor = false

    this.setData({ alliances })
    util.hideLoading()
    util.showSuccess('绑定成功')

  } catch (err) {
    util.hideLoading()
    util.showError('绑定失败: ' + (err.message || '未知错误'))
  }
},

// 移除盟管
removeAuditor: async function (e) {
  const allianceIndex = e.currentTarget.dataset.allianceindex
  const auditorId = e.currentTarget.dataset.auditorid
  const alliance = this.data.alliances[allianceIndex]

  const confirm = await util.showConfirm('确认移除', '确定要移除该盟管吗？')
  if (!confirm) return

  try {
    util.showLoading('正在移除...')
    await db.bindAllianceAuditors(alliance._id, auditorId, 'remove')

    const alliances = this.data.alliances
    alliances[allianceIndex].auditorIds = (alliances[allianceIndex].auditorIds || []).filter(id => id !== auditorId)
    alliances[allianceIndex].auditorNames = (alliances[allianceIndex].auditorNames || []).filter(a => a._id !== auditorId)

    this.setData({ alliances })
    util.hideLoading()
    util.showSuccess('已移除')

  } catch (err) {
    util.hideLoading()
    util.showError('移除失败')
  }
},
```

**Step 3: Update WXML — replace lines 29-41**

```xml
<!-- 盟管列表 -->
<view class="auditor-section">
  <view class="auditor-label">盟管</view>
  <view class="auditor-list">
    <view wx:if="{{item.auditorNames.length === 0}}" class="auditor-empty">
      <text class="text-weak text-xs">未绑定</text>
    </view>
    <view wx:for="{{item.auditorNames}}" wx:for-item="auditor" wx:key="_id" class="auditor-tag">
      <text class="auditor-name">{{auditor.nickName}}</text>
      <view class="auditor-remove" bindtap="removeAuditor" data-allianceindex="{{index}}" data-auditorid="{{auditor._id}}">×</view>
    </view>
  </view>
  <!-- 添加盟管按钮 -->
  <view wx:if="{{!item.showAddAuditor}}" class="add-auditor-btn" bindtap="showAddAuditorPicker" data-index="{{index}}">
    <text>+ 添加盟管</text>
  </view>
  <!-- 添加盟管选择器 -->
  <view wx:if="{{item.showAddAuditor}}" class="add-auditor-picker">
    <picker bindchange="onAuditorPickerChange" value="{{item.auditorPickerIndex}}" range="{{auditors}}" range-key="nickName" data-index="{{index}}">
      <view class="picker-compact">{{auditors[item.auditorPickerIndex].nickName || '请选择'}}</view>
    </picker>
    <view class="picker-actions">
      <button class="btn btn-success btn-sm" bindtap="confirmAddAuditor" data-index="{{index}}">确认</button>
      <button class="btn btn-ghost btn-sm" bindtap="cancelAddAuditor" data-index="{{index}}">取消</button>
    </view>
  </view>
</view>
```

**Step 4: Add same styles as Task 4 to alliance-manage.wxss**

Same CSS as Task 4 Step 4.

**Step 5: Verify and commit**

```bash
git add miniprogram/pages/superAdmin/alliance-manage/
git commit -m "feat: alliance-manage shows auditor name list, supports add/remove"
```

---

### Task 6: Update auditor home page — support multiple alliance bindings

**Objective:** The auditor home page currently assumes one-to-one binding. Update `loadMyAlliance` to handle multiple alliances (since `auditorIds` is now an array and the auditor can be in multiple).

**Files:**
- Modify: `miniprogram/pages/auditor/home/home.js:135-158`
- Modify: `miniprogram/pages/auditor/home/home.wxml`

**Step 1: Update data model**

Change `myAlliance: null` to `myAlliances: []` in the data object (line 16).

**Step 2: Rewrite `loadMyAlliance` to `loadMyAlliances`**

Replace lines 135-158:

```js
loadMyAlliances: async function () {
  try {
    const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid

    const wxdb = wx.cloud.database()
    const _ = wxdb.command
    const res = await wxdb.collection('alliances').where({
      auditorIds: _.elemMatch(_.eq(userId))
    }).get()

    const myAlliances = []
    for (const alliance of res.data) {
      try {
        const zoneRes = await wxdb.collection('zones').doc(alliance.zoneId).get()
        myAlliances.push({
          ...alliance,
          zoneName: zoneRes.data ? zoneRes.data.zoneName : '未知分区'
        })
      } catch (err) {
        myAlliances.push({
          ...alliance,
          zoneName: '未知分区'
        })
      }
    }

    this.setData({
      myAlliances: myAlliances,
      myAlliance: myAlliances.length > 0 ? myAlliances[0] : null
    })
  } catch (err) {
    console.error('加载联盟信息失败:', err)
  }
},
```

**Step 3: Update references to `myAlliance` in `goToConfig`, `goToStatistics`, `goToClearData`**

Replace singular `this.data.myAlliance` checks. For non-superAdmin users, if they have multiple alliances, they need to select one. Update the WXML to show a list instead of a single card.

**Step 4: Update WXML**

Replace the `myAlliance` display section. Add a list showing all bound alliances, each with config/statistics/clear buttons.

**Step 5: Verify and commit**

```bash
git add miniprogram/pages/auditor/home/
git commit -m "feat: auditor home supports multiple alliance bindings"
```

---

### Task 7: Backward compatibility — handle both `auditorId` and `auditorIds`

**Objective:** Existing data has `auditorId` (single value). New code uses `auditorIds` (array). Add migration logic so old data works.

**Files:**
- Modify: `miniprogram/utils/db.js`

**Step 1: Add a helper in `getAlliancesByZone` to normalize the data**

In the `getAlliancesByZone` function, after getting results, normalize each alliance:

```js
// Normalize: if alliance has old auditorId but no auditorIds, migrate
for (const alliance of res.data) {
  if (alliance.auditorId && !alliance.auditorIds) {
    alliance.auditorIds = [alliance.auditorId]
  } else if (!alliance.auditorIds) {
    alliance.auditorIds = []
  }
}
```

**Step 2: In `bindAllianceAuditors`, also clear old `auditorId` field on first write**

```js
async function bindAllianceAuditors(allianceId, auditorId, action = 'add') {
  const db = getDb()
  const _ = db.command

  const alliance = await db.collection('alliances').doc(allianceId).get()
  let currentIds = alliance.data.auditorIds || []

  // Migrate from old single auditorId
  if (alliance.data.auditorId && !alliance.data.auditorIds) {
    currentIds = [alliance.data.auditorId]
  }

  if (action === 'add') {
    if (currentIds.includes(auditorId)) {
      throw new Error('该盟管已绑定此联盟')
    }
    const updateData = {
      auditorIds: _.push(auditorId),
      auditorId: null, // Clear old field
      updateTime: db.serverDate()
    }
    return await db.collection('alliances').doc(allianceId).update({ data: updateData })
  } else if (action === 'remove') {
    const updateData = {
      auditorIds: _.pull(auditorId),
      updateTime: db.serverDate()
    }
    return await db.collection('alliances').doc(allianceId).update({ data: updateData })
  }
}
```

**Step 3: Verify and commit**

```bash
git add miniprogram/utils/db.js
git commit -m "feat: backward compatibility for auditorId to auditorIds migration"
```

---

### Task 8: Fix typo in Task 2 and final verification

**Objective:** Fix the typo `申请${type管}` should be `申请${typeText}` in `checkAndShowApplyDialog`. Run through all files to verify consistency.

**Files:**
- Modify: `miniprogram/pages/index/index.js`

**Step 1: Fix the typo**

Change `申请${type管}` to `申请${typeText}` in the rejected branch.

**Step 2: Final review of all changes**

Read all modified files and verify:
1. db.js: new functions exported, backward compat logic
2. index.js: apply dialog shows status correctly
3. admin-review: alliance picker on approval
4. alliance-config: auditor name list
5. alliance-manage: auditor name list
6. auditor/home: multiple alliance support

**Step 3: Commit**

```bash
git add -A
git commit -m "fix: typo fix and final consistency check"
```
