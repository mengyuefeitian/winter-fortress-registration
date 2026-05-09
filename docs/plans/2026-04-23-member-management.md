# Member Management Module Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add member management pages for 区管 and 超管 to view and remove auditors/admins, resetting them to ordinary users.

**Architecture:** Two new pages — `admin/member-manage` (区管 sees auditors in their zone) and `superAdmin/member-manage` (超管 sees auditors+admins per zone). A new `db.removeMember` function handles role reset + unbinding from alliances/zones. Role is single-scalar, so deleting just resets to 'user'.

**Key Design Decisions:**
- Roles are exclusive (upgrade replaces). So each user has exactly one role. Deleting = reset to 'user'.
- When removing an auditor: reset role to 'user', remove their `_id` from all `alliances.auditorIds` arrays in the zone.
- When removing an admin: reset role to 'user', remove their zone creator binding.
- 区管 cannot see or delete other admins — only auditors in their zone.
- 超管 sees both auditors and admins, grouped by zone.

---

### Task 1: Add `removeMember` and `getZoneMembers` to db.js

**Files:** Modify `miniprogram/utils/db.js`

**Step 1: Add helper functions after the existing `getAllianceAuditorInfo` function**

```js
// 获取分区的成员列表（盟管和区管）
async function getZoneMembers(zoneId) {
  const db = getDb()
  const _ = db.command

  // 获取该分区的所有联盟
  const alliances = await db.collection('alliances').where({
    zoneId: zoneId
  }).get()

  // 收集所有盟管ID（从 auditorIds 数组）
  const auditorIds = []
  const auditorAllianceMap = {} // userId -> [allianceNames]
  for (const alliance of alliances.data) {
    const ids = alliance.auditorIds || []
    if (alliance.auditorId && !alliance.auditorIds) {
      ids.push(alliance.auditorId)
    }
    for (const id of ids) {
      if (!auditorIds.includes(id)) {
        auditorIds.push(id)
      }
      if (!auditorAllianceMap[id]) {
        auditorAllianceMap[id] = []
      }
      auditorAllianceMap[id].push(alliance.allianceName)
    }
  }

  // 获取盟管用户信息
  const auditors = []
  if (auditorIds.length > 0) {
    const res = await db.collection('users').where({
      _id: _.in(auditorIds)
    }).get()
    for (const user of res.data) {
      auditors.push({
        _id: user._id,
        nickName: user.nickName || '未知',
        phone: user.phone || '',
        role: 'auditor',
        allianceNames: auditorAllianceMap[user._id] || []
      })
    }
  }

  // 获取该分区的区管（通过 zones.creatorId）
  const zone = await db.collection('zones').doc(zoneId).get()
  const adminIds = []
  if (zone.data.creatorId) {
    adminIds.push(zone.data.creatorId)
  }

  const admins = []
  if (adminIds.length > 0) {
    const res = await db.collection('users').where({
      _id: _.in(adminIds)
    }).get()
    for (const user of res.data) {
      admins.push({
        _id: user._id,
        nickName: user.nickName || '未知',
        phone: user.phone || '',
        role: 'admin'
      })
    }
  }

  return { auditors, admins }
}

// 移除成员（重置为普通用户）
async function removeMember(userId, role, zoneId) {
  const db = getDb()
  const _ = db.command

  // 1. 重置用户角色
  await db.collection('users').doc(userId).update({
    data: {
      role: 'user',
      updateTime: db.serverDate()
    }
  })

  // 2. 根据角色类型清理绑定关系
  if (role === 'auditor') {
    // 从该分区所有联盟的 auditorIds 中移除
    const alliances = await db.collection('alliances').where({
      zoneId: zoneId
    }).get()

    for (const alliance of alliances.data) {
      const ids = alliance.auditorIds || []
      if (ids.includes(userId)) {
        await db.collection('alliances').doc(alliance._id).update({
          data: {
            auditorIds: _.pull(userId),
            auditorId: null,
            updateTime: db.serverDate()
          }
        })
      }
    }
  } else if (role === 'admin') {
    // 清除分区创建者绑定
    const zone = await db.collection('zones').doc(zoneId).get()
    if (zone.data.creatorId === userId) {
      await db.collection('zones').doc(zoneId).update({
        data: {
          creatorId: null,
          updateTime: db.serverDate()
        }
      })
    }
  }
}
```

**Step 2: Add to module.exports**

```js
getZoneMembers,
removeMember,
```

---

### Task 2: Create admin member-manage page (区管 — auditors only)

**Files:**
- Create: `miniprogram/pages/admin/member-manage/member-manage.js`
- Create: `miniprogram/pages/admin/member-manage/member-manage.wxml`
- Create: `miniprogram/pages/admin/member-manage/member-manage.wxss`
- Create: `miniprogram/pages/admin/member-manage/member-manage.json`
- Modify: `miniprogram/pages/admin/home/home.js` — add navigation
- Modify: `miniprogram/pages/admin/home/home.wxml` — add button
- Modify: `miniprogram/app.json` — register page

**Step 1: Create member-manage.json**

```json
{
  "navigationBarTitleText": "成员管理",
  "usingComponents": {}
}
```

**Step 2: Create member-manage.js**

```js
const app = getApp()
const util = require('../../../utils/util')
const auth = require('../../../utils/auth')
const db = require('../../../utils/db')

Page({
  data: {
    zones: [],
    zoneIndex: 0,
    selectedZone: null,
    auditors: []
  },

  onLoad: function () {
    this.waitForRoleReady()
  },

  onShow: function () {
    if (app.globalData.roleReady && this.data.selectedZone) {
      this.loadMembers(this.data.selectedZone._id)
    }
  },

  waitForRoleReady: function () {
    if (app.globalData.roleReady) {
      this.checkPermission()
    } else {
      setTimeout(() => { this.waitForRoleReady() }, 100)
    }
  },

  checkPermission: function () {
    const role = app.globalData.role || 'user'
    if (!auth.isAdminOrAbove(role)) {
      util.showError('权限不足')
      wx.redirectTo({ url: '/pages/index/index' })
      return
    }
    this.loadZones()
  },

  loadZones: async function () {
    try {
      const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid
      const role = app.globalData.role || 'admin'

      let zones
      if (role === 'superAdmin') {
        zones = await db.getAllZones()
      } else {
        zones = await db.getZonesByCreator(userId)
      }

      if (zones && zones.length > 0) {
        let selectedZone = zones[0]
        let zoneIndex = 0

        if (app.globalData.currentZone) {
          const foundIndex = zones.findIndex(z => z._id === app.globalData.currentZone._id)
          if (foundIndex >= 0) {
            selectedZone = zones[foundIndex]
            zoneIndex = foundIndex
          }
        }

        this.setData({ zones, zoneIndex, selectedZone })
        this.loadMembers(selectedZone._id)
      } else {
        this.setData({ zones: [], selectedZone: null, auditors: [] })
      }
    } catch (err) {
      console.error('加载分区失败:', err)
      util.showError('加载分区失败')
    }
  },

  onZoneChange: function (e) {
    const index = parseInt(e.detail.value)
    const zone = this.data.zones[index]
    this.setData({ zoneIndex: index, selectedZone: zone })
    this.loadMembers(zone._id)
  },

  loadMembers: async function (zoneId) {
    try {
      util.showLoading('加载成员...')
      const { auditors } = await db.getZoneMembers(zoneId)
      this.setData({ auditors })
      util.hideLoading()
    } catch (err) {
      util.hideLoading()
      console.error('加载成员失败:', err)
      util.showError('加载成员失败')
    }
  },

  removeMember: async function (e) {
    const userId = e.currentTarget.dataset.id
    const index = e.currentTarget.dataset.index
    const member = this.data.auditors[index]

    const confirm = await util.showConfirm('确认移除', `确定要将「${member.nickName}」移除吗？该用户将变为普通用户。`)
    if (!confirm) return

    try {
      util.showLoading('正在移除...')
      await db.removeMember(userId, 'auditor', this.data.selectedZone._id)

      const auditors = this.data.auditors
      auditors.splice(index, 1)
      this.setData({ auditors })
      util.hideLoading()
      util.showSuccess('已移除')
    } catch (err) {
      util.hideLoading()
      console.error('移除失败:', err)
      util.showError('移除失败')
    }
  }
})
```

**Step 3: Create member-manage.wxml**

```xml
<view class="page">
  <!-- 分区选择 -->
  <view wx:if="{{zones.length > 1}}" class="section">
    <view class="section-title">选择分区</view>
    <picker bindchange="onZoneChange" value="{{zoneIndex}}" range="{{zones}}" range-key="zoneName">
      <view class="picker-compact">{{selectedZone ? selectedZone.zoneName : '请选择'}}</view>
    </picker>
  </view>

  <!-- 盟管列表 -->
  <view class="section">
    <view class="section-title">盟管成员</view>
    <view wx:if="{{auditors.length === 0}}" class="empty-state">
      <text class="empty-text">暂无盟管成员</text>
    </view>
    <view wx:else class="member-list">
      <view wx:for="{{auditors}}" wx:key="_id" class="member-card">
        <view class="member-info">
          <text class="member-name">{{item.nickName}}</text>
          <view class="member-tags">
            <view class="tag tag-primary">盟管</view>
            <view wx:for="{{item.allianceNames}}" wx:for-item="allianceName" wx:key="*this" class="tag tag-default">{{allianceName}}</view>
          </view>
        </view>
        <view class="member-actions">
          <button class="btn btn-danger btn-sm" bindtap="removeMember" data-id="{{item._id}}" data-index="{{index}}">移除</button>
        </view>
      </view>
    </view>
  </view>
</view>
```

**Step 4: Create member-manage.wxss**

```css
.page { padding: 20px; background-color: #F5F7FA; min-height: 100vh; }
.section { background-color: #FFFFFF; border-radius: 12px; padding: 16px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
.section-title { font-size: 16px; font-weight: 500; color: #333333; margin-bottom: 16px; }
.picker-compact { background-color: #F5F5F5; border-radius: 4px; padding: 8px 12px; font-size: 14px; }
.empty-state { text-align: center; padding: 32px 0; }
.empty-text { color: #9ca3af; font-size: 14px; }
.member-list { display: flex; flex-direction: column; gap: 12px; }
.member-card { display: flex; justify-content: space-between; align-items: center; background-color: #F5F7FA; border-radius: 8px; padding: 12px 16px; }
.member-info { flex: 1; }
.member-name { font-size: 15px; font-weight: 500; color: #333333; display: block; margin-bottom: 6px; }
.member-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; }
.tag-primary { background: #e8f0fe; color: #4A90D9; }
.tag-default { background: #f0f0f0; color: #666; }
.member-actions { margin-left: 12px; }
.btn-sm { font-size: 12px; padding: 4px 12px; min-width: auto; }
```

**Step 5: Add navigation from admin/home**

In home.js add:
```js
goToMemberManage: function () {
  wx.navigateTo({ url: '/pages/admin/member-manage/member-manage' })
},
```

In home.wxml add a card in the "权限审核" section after 盟管审核:
```xml
<view class="function-card-compact" bindtap="goToMemberManage">
  <view class="function-content">
    <text class="function-name">成员管理</text>
    <text class="function-desc">查看和管理盟管成员</text>
  </view>
</view>
```

**Step 6: Register page in app.json**

Add `"pages/admin/member-manage/member-manage"` to the pages array.

---

### Task 3: Create superAdmin member-manage page (超管 — auditors + admins)

**Files:**
- Create: `miniprogram/pages/superAdmin/member-manage/member-manage.js`
- Create: `miniprogram/pages/superAdmin/member-manage/member-manage.wxml`
- Create: `miniprogram/pages/superAdmin/member-manage/member-manage.wxss`
- Create: `miniprogram/pages/superAdmin/member-manage/member-manage.json`
- Modify: `miniprogram/pages/superAdmin/home/home.js` — add navigation
- Modify: `miniprogram/pages/superAdmin/home/home.wxml` — add button
- Modify: `miniprogram/app.json` — register page

**Step 1: Create superAdmin member-manage.json**

```json
{
  "navigationBarTitleText": "成员管理",
  "usingComponents": {}
}
```

**Step 2: Create superAdmin member-manage.js**

Similar to admin version but:
- Loads ALL zones (not just creator's)
- Shows both auditors AND admins per zone
- Zone switching reloads both lists
- `removeMember` works for both 'auditor' and 'admin' role types

```js
const app = getApp()
const util = require('../../../utils/util')
const auth = require('../../../utils/auth')
const db = require('../../../utils/db')

Page({
  data: {
    zones: [],
    zoneIndex: 0,
    selectedZone: null,
    auditors: [],
    admins: []
  },

  onLoad: function () {
    this.waitForRoleReady()
  },

  onShow: function () {
    if (app.globalData.roleReady && this.data.selectedZone) {
      this.loadMembers(this.data.selectedZone._id)
    }
  },

  waitForRoleReady: function () {
    if (app.globalData.roleReady) {
      this.checkPermission()
    } else {
      setTimeout(() => { this.waitForRoleReady() }, 100)
    }
  },

  checkPermission: function () {
    const role = app.globalData.role || 'user'
    if (!auth.isSuperAdmin(role)) {
      util.showError('权限不足')
      wx.redirectTo({ url: '/pages/index/index' })
      return
    }
    this.loadZones()
  },

  loadZones: async function () {
    try {
      const zones = await db.getAllZones()
      if (zones && zones.length > 0) {
        let selectedZone = zones[0]
        let zoneIndex = 0
        if (app.globalData.currentZone) {
          const foundIndex = zones.findIndex(z => z._id === app.globalData.currentZone._id)
          if (foundIndex >= 0) {
            selectedZone = zones[foundIndex]
            zoneIndex = foundIndex
          }
        }
        this.setData({ zones, zoneIndex, selectedZone })
        this.loadMembers(selectedZone._id)
      } else {
        this.setData({ zones: [], selectedZone: null, auditors: [], admins: [] })
      }
    } catch (err) {
      console.error('加载分区失败:', err)
    }
  },

  onZoneChange: function (e) {
    const index = parseInt(e.detail.value)
    const zone = this.data.zones[index]
    this.setData({ zoneIndex: index, selectedZone: zone })
    this.loadMembers(zone._id)
  },

  loadMembers: async function (zoneId) {
    try {
      util.showLoading('加载成员...')
      const { auditors, admins } = await db.getZoneMembers(zoneId)
      this.setData({ auditors, admins })
      util.hideLoading()
    } catch (err) {
      util.hideLoading()
      console.error('加载成员失败:', err)
      util.showError('加载成员失败')
    }
  },

  removeMember: async function (e) {
    const userId = e.currentTarget.dataset.id
    const role = e.currentTarget.dataset.role
    const index = e.currentTarget.dataset.index
    const list = role === 'auditor' ? this.data.auditors : this.data.admins
    const member = list[index]

    const confirm = await util.showConfirm('确认移除', `确定要将「${member.nickName}」移除吗？该用户将变为普通用户。`)
    if (!confirm) return

    try {
      util.showLoading('正在移除...')
      await db.removeMember(userId, role, this.data.selectedZone._id)

      if (role === 'auditor') {
        const auditors = this.data.auditors
        auditors.splice(index, 1)
        this.setData({ auditors })
      } else {
        const admins = this.data.admins
        admins.splice(index, 1)
        this.setData({ admins })
      }

      util.hideLoading()
      util.showSuccess('已移除')
    } catch (err) {
      util.hideLoading()
      console.error('移除失败:', err)
      util.showError('移除失败')
    }
  }
})
```

**Step 3: Create superAdmin member-manage.wxml**

```xml
<view class="page">
  <!-- 分区选择 -->
  <view wx:if="{{zones.length > 1}}" class="section">
    <view class="section-title">选择分区</view>
    <picker bindchange="onZoneChange" value="{{zoneIndex}}" range="{{zones}}" range-key="zoneName">
      <view class="picker-compact">{{selectedZone ? selectedZone.zoneName : '请选择'}}</view>
    </picker>
  </view>

  <!-- 区管列表 -->
  <view class="section">
    <view class="section-title">区管成员</view>
    <view wx:if="{{admins.length === 0}}" class="empty-state">
      <text class="empty-text">暂无区管成员</text>
    </view>
    <view wx:else class="member-list">
      <view wx:for="{{admins}}" wx:key="_id" class="member-card">
        <view class="member-info">
          <text class="member-name">{{item.nickName}}</text>
          <view class="member-tags">
            <view class="tag tag-warning">区管</view>
          </view>
        </view>
        <view class="member-actions">
          <button class="btn btn-danger btn-sm" bindtap="removeMember" data-id="{{item._id}}" data-role="admin" data-index="{{index}}">移除</button>
        </view>
      </view>
    </view>
  </view>

  <!-- 盟管列表 -->
  <view class="section">
    <view class="section-title">盟管成员</view>
    <view wx:if="{{auditors.length === 0}}" class="empty-state">
      <text class="empty-text">暂无盟管成员</text>
    </view>
    <view wx:else class="member-list">
      <view wx:for="{{auditors}}" wx:key="_id" class="member-card">
        <view class="member-info">
          <text class="member-name">{{item.nickName}}</text>
          <view class="member-tags">
            <view class="tag tag-primary">盟管</view>
            <view wx:for="{{item.allianceNames}}" wx:for-item="allianceName" wx:key="*this" class="tag tag-default">{{allianceName}}</view>
          </view>
        </view>
        <view class="member-actions">
          <button class="btn btn-danger btn-sm" bindtap="removeMember" data-id="{{item._id}}" data-role="auditor" data-index="{{index}}">移除</button>
        </view>
      </view>
    </view>
  </view>
</view>
```

**Step 4: Create superAdmin member-manage.wxss**

Same styles as admin version, plus:
```css
.tag-warning { background: #fff3e0; color: #e65100; }
```

**Step 5: Add navigation from superAdmin/home**

In home.js add:
```js
goToMemberManage: function () {
  wx.navigateTo({ url: '/pages/superAdmin/member-manage/member-manage' })
},
```

In home.wxml add in the "权限审核" section:
```xml
<view class="function-card-compact" bindtap="goToMemberManage">
  <view class="function-content">
    <text class="function-name">成员管理</text>
    <text class="function-desc">查看和管理区管盟管</text>
  </view>
</view>
```

**Step 6: Register page in app.json**

Add `"pages/superAdmin/member-manage/member-manage"` to pages array.
