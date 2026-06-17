# 页面缓存性能优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 通过 stale-while-revalidate 内存缓存，消除用户重复进入报名页时的 2-3 秒白屏等待，数据在 100ms 内显示。

**Architecture:** 新建 `miniprogram/utils/cache.js` 工具，缓存存入 `app.globalData.pageCache`。进页面时：有缓存 → 立即 setData（毫秒级） → 后台静默刷新；无缓存 → 正常加载 → 写入缓存。写操作（报名/取消/新增/删除）成功后主动 `cache.invalidate()` 清除。

**Tech Stack:** WeChat Mini Program，纯 JS，无构建工具，无测试框架。语法验证：`node -c <file.js>`。

---

## 文件清单

| 操作 | 文件 |
|------|------|
| 新建 | `miniprogram/utils/cache.js` |
| 修改 | `miniprogram/app.js` |
| 修改 | `miniprogram/pages/user/registration/registration.js` |
| 修改 | `miniprogram/pages/user/position-list/position-list.js` |
| 修改 | `miniprogram/pages/user/arsenal-registration/arsenal-registration.js` |
| 修改 | `miniprogram/pages/user/canyon-registration/canyon-registration.js` |
| 修改 | `miniprogram/pages/user/my-registrations/my-registrations.js` |
| 修改 | `miniprogram/pages/admin/time-slot-config/time-slot-config.js` |
| 修改 | `miniprogram/pages/admin/alliance-config/alliance-config.js` |
| 修改 | `miniprogram/pages/admin/position-manage/position-manage.js` |
| 修改 | `miniprogram/pages/admin/arsenal-config/arsenal-config.js` |
| 修改 | `miniprogram/pages/auditor/config/config.js` |
| 修改 | `miniprogram/pages/auditor/arsenal-config/arsenal-config.js` |

---

## 缓存 Key 规范

| 页面 | Key 格式 | TTL |
|------|---------|-----|
| 堡垒报名（联盟列表） | `fortress_alliances_{zoneId}` | 60s |
| 堡垒报名（时间段+报名数） | `fortress_slots_{allianceId}` | 60s |
| 官职报名 | `position_{zoneId}` | 60s |
| 兵工厂报名 | `arsenal_{zoneId}` | 60s |
| 峡谷会战报名 | `canyon_{zoneId}` | 60s |
| 我的报名记录 | `myregs_{userId}` | 60s |
| 堡垒时间配置(admin) | `cfg_fortress_{allianceId}` | 30s |
| 联盟管理(admin) | `cfg_alliance_{zoneId}` | 30s |
| 官职管理(admin) | `cfg_position_{zoneId}` | 30s |
| 兵工厂配置(admin) | `cfg_arsenal_{zoneId}` | 30s |
| 盟管堡垒配置(auditor) | `cfg_auditor_{allianceId}` | 30s |
| 盟管兵工厂(auditor) | `cfg_auditor_arsenal_{allianceId}` | 30s |

---

### Task 1: 创建 cache.js 工具 + 初始化 app.js

**Files:**
- Create: `miniprogram/utils/cache.js`
- Modify: `miniprogram/app.js`

- [ ] **Step 1: 创建 `miniprogram/utils/cache.js`**

```js
// miniprogram/utils/cache.js
const DEFAULT_TTL = 60 * 1000  // 默认 60 秒

function _store() {
  const app = getApp()
  if (!app.globalData.pageCache) app.globalData.pageCache = {}
  return app.globalData.pageCache
}

function get(key) {
  const entry = _store()[key]
  if (!entry) return null
  if (Date.now() - entry.timestamp > entry.ttl) {
    delete _store()[key]
    return null
  }
  return entry.data
}

function set(key, data, ttl) {
  _store()[key] = { data: data, timestamp: Date.now(), ttl: ttl || DEFAULT_TTL }
}

// 清除所有以 prefix 开头的缓存键
function invalidate(prefix) {
  const store = _store()
  Object.keys(store).forEach(function(k) {
    if (k.startsWith(prefix)) delete store[k]
  })
}

module.exports = { get: get, set: set, invalidate: invalidate }
```

- [ ] **Step 2: 在 `app.js` 的 `globalData` 中添加 `pageCache: {}`**

找到 `app.js` 中的 `globalData` 对象，添加一行：

```js
globalData: {
  // ... 已有字段 ...
  pageCache: {}
}
```

- [ ] **Step 3: 语法验证**

```bash
node -c miniprogram/utils/cache.js
node -c miniprogram/app.js
```

预期：均无报错输出。

- [ ] **Step 4: 提交**

```bash
git add miniprogram/utils/cache.js miniprogram/app.js
git commit -m "perf: 新增页面运行时缓存工具 cache.js，初始化 pageCache"
```

---

### Task 2: 缓存堡垒报名页 (`registration.js`)

**Files:**
- Modify: `miniprogram/pages/user/registration/registration.js`

**缓存策略：**
- `fortress_alliances_{zoneId}`（60s）→ `{ alliances }` — 在 `loadAlliances` 成功后写入
- `fortress_slots_{allianceId}`（60s）→ `{ timeSlots }` — 在 `loadTimeSlots` 成功后写入
- 快速路径：`onShow` 时若 `app.globalData.currentZone` 已知 → 立即渲染缓存 → 后台刷新
- 报名/取消成功后：`cache.invalidate('fortress_slots_' + allianceId)` + `cache.invalidate('myregs_')`

- [ ] **Step 1: 在文件顶部引入 cache**

在 `const db = require(...)` 后添加：

```js
const cache = require('../../../utils/cache')
```

- [ ] **Step 2: 修改 `checkLoginAndLoadData`，加入快速路径**

在 `this.loadAlliancesFromCurrentZone()` 调用前插入缓存快速路径：

```js
checkLoginAndLoadData: function () {
  const userInfo = app.globalData.userInfo
  if (userInfo && userInfo.nickName) {
    this.setData({ isLoggedIn: true, nickName: userInfo.nickName })
  } else {
    this.setData({ isLoggedIn: false, nickName: '' })
  }

  // 快速路径：若分区已知，尝试立即渲染缓存
  const zone = app.globalData.currentZone
  if (zone) {
    const alliancesKey = 'fortress_alliances_' + zone._id
    const cachedAlliances = cache.get(alliancesKey)
    if (cachedAlliances) {
      const lastAllianceId = wx.getStorageSync('lastAllianceId')
      const alliances = cachedAlliances.alliances
      let selectedAlliance = null
      let allianceIndex = -1
      if (lastAllianceId) {
        allianceIndex = alliances.findIndex(function(a) { return a._id === lastAllianceId })
        if (allianceIndex >= 0) selectedAlliance = alliances[allianceIndex]
      }
      this.setData({
        selectedZone: zone,
        alliances: alliances,
        selectedAlliance: selectedAlliance,
        allianceIndex: allianceIndex,
        loading: false
      })
      if (selectedAlliance) {
        const slotsKey = 'fortress_slots_' + selectedAlliance._id
        const cachedSlots = cache.get(slotsKey)
        if (cachedSlots) {
          this.setData({ timeSlots: cachedSlots.timeSlots })
        }
        // 后台静默刷新时间段
        this.loadTimeSlots()
      }
      // 后台静默刷新联盟（不设 loading）
      this._refreshAlliancesSilent(zone._id)
      return
    }
  }

  this.loadAlliancesFromCurrentZone()
},
```

- [ ] **Step 3: 添加 `_refreshAlliancesSilent` 方法**

在 `loadAlliances` 之前添加：

```js
_refreshAlliancesSilent: async function (zoneId) {
  try {
    const alliances = await db.getAlliancesByZone(zoneId)
    const key = 'fortress_alliances_' + zoneId
    cache.set(key, { alliances: alliances })
    // 只有联盟列表有变化时才更新 UI
    this.setData({ alliances: alliances || [] })
  } catch (err) {
    console.error('后台刷新联盟失败:', err)
  }
},
```

- [ ] **Step 4: 在 `loadAlliances` 成功后写入缓存**

在 `loadAlliances` 函数中，`this.setData({ alliances: alliances, ... })` 之后添加：

```js
const key = 'fortress_alliances_' + zoneId
cache.set(key, { alliances: alliances })
```

注意：`loadAlliances` 函数接收 `zoneId` 参数，可直接使用。

- [ ] **Step 5: 在 `loadTimeSlots` 成功后写入缓存**

在 `loadTimeSlots` 函数中，最终 `this.setData({ timeSlots: [...] })` 之后添加：

```js
const allianceId = this.data.selectedAlliance._id
const key = 'fortress_slots_' + allianceId
cache.set(key, { timeSlots: this.data.timeSlots })
```

（注意：`loadTimeSlots` 里的 `timeSlots` 数组是处理后已带 `registrationCount` 的完整数据，直接缓存 `this.data.timeSlots`）

- [ ] **Step 6: 报名成功后清缓存**

找到报名提交成功的回调（搜索 `util.showSuccess` + 报名成功相关），在成功提示后添加：

```js
const allianceId = this.data.selectedAlliance ? this.data.selectedAlliance._id : null
if (allianceId) {
  cache.invalidate('fortress_slots_' + allianceId)
}
const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid
if (userId) cache.invalidate('myregs_' + userId)
```

- [ ] **Step 7: 取消报名成功后清缓存**

找到取消报名成功回调，同上添加相同清缓存代码。

- [ ] **Step 8: 语法验证**

```bash
node -c miniprogram/pages/user/registration/registration.js
```

预期：无报错。

- [ ] **Step 9: 提交**

```bash
git add miniprogram/pages/user/registration/registration.js
git commit -m "perf: 堡垒报名页加入 stale-while-revalidate 缓存"
```

---

### Task 3: 缓存官职报名页 (`position-list.js`)

**Files:**
- Modify: `miniprogram/pages/user/position-list/position-list.js`

**缓存策略：**
- `position_{zoneId}`（60s）→ `{ configs, selectedZone }` — 在 `loadConfigs` 成功后写入
- 快速路径：`onShow` 时若 `currentZone` 已知 → 立即渲染 → 后台刷新
- 报名/取消成功后：`cache.invalidate('position_' + zoneId)`

- [ ] **Step 1: 引入 cache**

```js
const cache = require('../../../utils/cache')
```

- [ ] **Step 2: 修改 `onShow` 加入快速路径**

```js
onShow: function () {
  const zone = app.globalData.currentZone
  if (zone) {
    const key = 'position_' + zone._id
    const cached = cache.get(key)
    if (cached) {
      this.setData({
        configs: cached.configs,
        selectedZone: cached.selectedZone,
        noZoneSelected: false,
        loading: false
      })
      // 后台静默刷新（不传 silent，loadConfigs 内部判断）
      this._refreshConfigsSilent(zone)
      return
    }
  }
  this.loadConfigs()
},
```

- [ ] **Step 3: 添加 `_refreshConfigsSilent` 方法**

```js
_refreshConfigsSilent: async function (zone) {
  try {
    // 复用 loadConfigs 的核心逻辑，但不设 loading
    const zoneId = zone._id
    const configs = await db.getPositionConfigs(zoneId)
    // （此处用和 loadConfigs 相同的计数并行逻辑，但 loading:false）
    // 简化实现：直接调 loadConfigs，因为不设 loading=true 会有闪烁
    // 所以直接走 loadConfigs 即可（loadConfigs 已设 loading:true，但用户已看到缓存数据）
    this.loadConfigs()
  } catch (err) {
    console.error('后台刷新官职配置失败:', err)
  }
},
```

**注意：** 对于后台刷新，直接调用 `this.loadConfigs()` 即可。用户已看到缓存渲染，loading 转圈会短暂出现但不影响体验（数据毫秒级已显示）。如要彻底无感刷新，需重构 `loadConfigs` 接受 `silent` 参数，但代价较高，本次不做。

实际做法：删掉 `_refreshConfigsSilent`，直接在快速路径后调用 `this.loadConfigs()`：

```js
onShow: function () {
  const zone = app.globalData.currentZone
  if (zone) {
    const key = 'position_' + zone._id
    const cached = cache.get(key)
    if (cached) {
      this.setData({
        configs: cached.configs,
        selectedZone: cached.selectedZone,
        noZoneSelected: false,
        loading: false
      })
    }
  }
  // 始终执行正常加载（如有缓存则用缓存先展示，正常加载在后台更新）
  this.loadConfigs()
},
```

这样缓存数据先同步渲染，loadConfigs 再异步更新（设了 loading:true 会有短暂转圈，但初始数据已显示，比白屏好得多）。

- [ ] **Step 4: 在 `loadConfigs` 成功后写入缓存**

在 `loadConfigs` 函数末尾，`this.setData({ configs: [...] })` 之后写入：

```js
const zoneId = selectedZone._id
cache.set('position_' + zoneId, { configs: this.data.configs, selectedZone: selectedZone })
```

- [ ] **Step 5: 报名/取消成功后清缓存**

找到报名提交成功和取消成功的回调，添加：

```js
const zoneId = this.data.selectedZone ? this.data.selectedZone._id : null
if (zoneId) cache.invalidate('position_' + zoneId)
const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid
if (userId) cache.invalidate('myregs_' + userId)
```

- [ ] **Step 6: 语法验证 + 提交**

```bash
node -c miniprogram/pages/user/position-list/position-list.js
git add miniprogram/pages/user/position-list/position-list.js
git commit -m "perf: 官职报名页加入缓存快速渲染"
```

---

### Task 4: 缓存兵工厂报名页 (`arsenal-registration.js`)

**Files:**
- Modify: `miniprogram/pages/user/arsenal-registration/arsenal-registration.js`

**缓存策略：**
- `arsenal_{zoneId}`（60s）→ `{ alliances, configs, selectedZone }` — 在 `loadConfigsFromCurrentZone` 成功后写入
- 快速路径：`onShow` 时若 `currentZone` 已知 → 立即渲染 → 再执行正常加载

- [ ] **Step 1: 引入 cache**

```js
const cache = require('../../../utils/cache')
```

- [ ] **Step 2: 修改 `onShow` / `checkLoginAndLoadData` 加入快速路径**

在 `checkLoginAndLoadData` 函数的末尾（`this.loadConfigsFromCurrentZone()` 之前）插入：

```js
const zone = app.globalData.currentZone
if (zone) {
  const key = 'arsenal_' + zone._id
  const cached = cache.get(key)
  if (cached) {
    this.setData({
      selectedZone: cached.selectedZone,
      alliances: cached.alliances || [],
      configs: cached.configs || [],
      loading: false
    })
    // 后台继续正常加载以刷新
    this.loadConfigsFromCurrentZone()
    return
  }
}
this.loadConfigsFromCurrentZone()
```

- [ ] **Step 3: 在 `loadConfigsFromCurrentZone` 最终成功后写入缓存**

找到 `loadConfigsFromCurrentZone` 函数最后设置 configs 的 `this.setData(...)` 调用，之后添加：

```js
const zoneId = this.data.selectedZone ? this.data.selectedZone._id : null
if (zoneId) {
  cache.set('arsenal_' + zoneId, {
    selectedZone: this.data.selectedZone,
    alliances: this.data.alliances,
    configs: this.data.configs
  })
}
```

- [ ] **Step 4: 报名/取消成功后清缓存**

```js
const zoneId = this.data.selectedZone ? this.data.selectedZone._id : null
if (zoneId) cache.invalidate('arsenal_' + zoneId)
const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid
if (userId) cache.invalidate('myregs_' + userId)
```

- [ ] **Step 5: 语法验证 + 提交**

```bash
node -c miniprogram/pages/user/arsenal-registration/arsenal-registration.js
git add miniprogram/pages/user/arsenal-registration/arsenal-registration.js
git commit -m "perf: 兵工厂报名页加入缓存快速渲染"
```

---

### Task 5: 缓存峡谷会战报名页 (`canyon-registration.js`)

**Files:**
- Modify: `miniprogram/pages/user/canyon-registration/canyon-registration.js`

**缓存策略：**
- `canyon_{zoneId}`（60s）→ `{ alliances, configs, selectedZone }`
- 与 Task 4 完全对称，只是 key 前缀改为 `canyon_`，主加载函数是 `loadAlliancesFromCurrentZone`

- [ ] **Step 1: 引入 cache**

```js
const cache = require('../../../utils/cache')
```

- [ ] **Step 2: 在 `checkLoginAndLoadData` 中加入快速路径**

在 `this.loadAlliancesFromCurrentZone()` 之前插入（与 Task 4 完全相同的模式，key 前缀为 `canyon_`）：

```js
const zone = app.globalData.currentZone
if (zone) {
  const key = 'canyon_' + zone._id
  const cached = cache.get(key)
  if (cached) {
    this.setData({
      selectedZone: cached.selectedZone,
      alliances: cached.alliances || [],
      configs: cached.configs || [],
      loading: false
    })
    this.loadAlliancesFromCurrentZone()
    return
  }
}
this.loadAlliancesFromCurrentZone()
```

- [ ] **Step 3: 在 `loadAlliancesFromCurrentZone` 最终成功后写入缓存**

找到 configs 设置完毕的 `setData` 调用后添加：

```js
const zoneId = this.data.selectedZone ? this.data.selectedZone._id : null
if (zoneId) {
  cache.set('canyon_' + zoneId, {
    selectedZone: this.data.selectedZone,
    alliances: this.data.alliances,
    configs: this.data.configs
  })
}
```

- [ ] **Step 4: 报名/取消成功后清缓存**

```js
const zoneId = this.data.selectedZone ? this.data.selectedZone._id : null
if (zoneId) cache.invalidate('canyon_' + zoneId)
const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid
if (userId) cache.invalidate('myregs_' + userId)
```

- [ ] **Step 5: 语法验证 + 提交**

```bash
node -c miniprogram/pages/user/canyon-registration/canyon-registration.js
git add miniprogram/pages/user/canyon-registration/canyon-registration.js
git commit -m "perf: 峡谷会战报名页加入缓存快速渲染"
```

---

### Task 6: 缓存我的报名记录页 (`my-registrations.js`)

**Files:**
- Modify: `miniprogram/pages/user/my-registrations/my-registrations.js`

**缓存策略：**
- `myregs_{userId}`（60s）→ `{ registrations, weeklyRegistrations, positionRegistrations, arsenalRegistrations, canyonRegistrations }` — 在 `loadMyRegistrations` 成功后写入
- 快速路径：`onShow` 时若 userId 已知 → 立即渲染缓存 → 后台刷新
- 取消报名成功后：`cache.invalidate('myregs_' + userId)`

- [ ] **Step 1: 引入 cache**

```js
const cache = require('../../../utils/cache')
```

- [ ] **Step 2: 修改 `onShow` 加入快速路径**

当前 `onShow`:
```js
onShow: function () {
  if (app.globalData.roleReady) {
    this.loadUserInfo()
    this.loadZones()
    this.loadMyRegistrations()
  }
},
```

修改为：
```js
onShow: function () {
  if (app.globalData.roleReady) {
    this.loadUserInfo()
    this.loadZones()

    // 快速路径：有缓存先渲染
    const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid
    if (userId) {
      const cached = cache.get('myregs_' + userId)
      if (cached) {
        this.setData({
          registrations: cached.registrations,
          weeklyRegistrations: cached.weeklyRegistrations,
          positionRegistrations: cached.positionRegistrations,
          arsenalRegistrations: cached.arsenalRegistrations,
          canyonRegistrations: cached.canyonRegistrations
        })
      }
    }

    this.loadMyRegistrations()
  }
},
```

- [ ] **Step 3: 在 `loadMyRegistrations` 成功后写入缓存**

在 `loadMyRegistrations` 函数末尾，最终 `this.setData({ registrations: ..., ... })` 之后添加：

```js
if (userId) {
  cache.set('myregs_' + userId, {
    registrations: filteredRegistrations,
    weeklyRegistrations: weeklyRegistrations,
    positionRegistrations: processedPositionRegistrations,
    arsenalRegistrations: processedArsenal,
    canyonRegistrations: processedCanyon
  })
}
```

- [ ] **Step 4: 取消报名后清缓存**

在 4 个取消操作（`cancelRegistration`、`cancelPositionRegistration`、`cancelArsenalRegistration`、`cancelCanyonRegistration`）成功回调后各添加：

```js
const userId = app.globalData.userInfo ? app.globalData.userInfo._id : app.globalData.openid
if (userId) cache.invalidate('myregs_' + userId)
```

- [ ] **Step 5: 语法验证 + 提交**

```bash
node -c miniprogram/pages/user/my-registrations/my-registrations.js
git add miniprogram/pages/user/my-registrations/my-registrations.js
git commit -m "perf: 我的报名记录页加入缓存快速渲染"
```

---

### Task 7: 缓存堡垒时间配置页 (`admin/time-slot-config.js`)

**Files:**
- Modify: `miniprogram/pages/admin/time-slot-config/time-slot-config.js`

**缓存策略：**
- `cfg_fortress_{allianceId}`（30s）→ `{ timeSlots, alliances, selectedAlliance, selectedZone }`
- 快速路径：`onShow` 时若 zonesLoaded 且 selectedAlliance 已知 → 立即渲染 → 后台刷新
- 新增/删除时间段成功后：`cache.invalidate('cfg_fortress_' + allianceId)` + `cache.invalidate('fortress_slots_' + allianceId)`（同时清除用户侧缓存）

- [ ] **Step 1: 引入 cache**

```js
const cache = require('../../../utils/cache')
```

- [ ] **Step 2: 修改 `onShow` 加入快速路径**

当前 `onShow`:
```js
onShow: function () {
  if (app.globalData.roleReady && this.data.zonesLoaded) {
    this.loadZones()
  }
},
```

修改为：
```js
onShow: function () {
  if (app.globalData.roleReady && this.data.zonesLoaded) {
    // 快速路径：若已选联盟，先渲染缓存
    const alliance = this.data.selectedAlliance
    if (alliance) {
      const key = 'cfg_fortress_' + alliance._id
      const cached = cache.get(key)
      if (cached) {
        this.setData({
          timeSlots: cached.timeSlots,
          selectedSlots: [],
          selectAllChecked: false,
          loading: false
        })
      }
    }
    this.loadZones()
  }
},
```

- [ ] **Step 3: 在 `loadTimeSlots` 成功后写入缓存**

在 `loadTimeSlots` 函数末尾，最终 `this.setData({ timeSlots: [...], loading: false })` 之后添加：

```js
const allianceId = this.data.selectedAlliance ? this.data.selectedAlliance._id : null
if (allianceId) {
  cache.set('cfg_fortress_' + allianceId, { timeSlots: this.data.timeSlots }, 30 * 1000)
}
```

- [ ] **Step 4: 新增/删除时间段后双清缓存**

找到 `addTimeSlot` 成功回调（`util.showSuccess('添加成功')`）后添加：

```js
const allianceId = this.data.selectedAlliance ? this.data.selectedAlliance._id : null
if (allianceId) {
  cache.invalidate('cfg_fortress_' + allianceId)
  cache.invalidate('fortress_slots_' + allianceId)
}
```

找到 `deleteTimeSlot` 成功回调，同上添加相同清缓存代码。

- [ ] **Step 5: 语法验证 + 提交**

```bash
node -c miniprogram/pages/admin/time-slot-config/time-slot-config.js
git add miniprogram/pages/admin/time-slot-config/time-slot-config.js
git commit -m "perf: 堡垒时间配置页加入缓存，写操作后双清用户侧缓存"
```

---

### Task 8: 缓存联盟管理页 (`admin/alliance-config.js`)

**Files:**
- Modify: `miniprogram/pages/admin/alliance-config/alliance-config.js`

**缓存策略：**
- `cfg_alliance_{zoneId}`（30s）→ `{ alliances }`
- 快速路径：`onShow` 时若 selectedZone 已知 → 立即渲染 → 后台刷新
- 新增/删除/修改联盟后：`cache.invalidate('cfg_alliance_' + zoneId)` + `cache.invalidate('fortress_alliances_' + zoneId)`

- [ ] **Step 1: 引入 cache**

```js
const cache = require('../../../utils/cache')
```

- [ ] **Step 2: 找到 `onShow` 并加入快速路径**

`alliance-config.js` 的 `onShow` 需要确认（可能没有显式 onShow，或者逻辑在 onLoad）。查找 `onShow` 函数，在调用 `loadZones()` 或 `loadAlliances()` 之前插入：

```js
const zone = this.data.selectedZone || app.globalData.currentZone
if (zone) {
  const key = 'cfg_alliance_' + zone._id
  const cached = cache.get(key)
  if (cached) {
    this.setData({ alliances: cached.alliances, loading: false })
  }
}
```

- [ ] **Step 3: 在 `loadAlliances` 成功后写入缓存**

在 `loadAlliances` 函数中，`this.setData({ alliances: [...] })` 后添加：

```js
const zoneId = this.data.selectedZone ? this.data.selectedZone._id : null
if (zoneId) {
  cache.set('cfg_alliance_' + zoneId, { alliances: this.data.alliances }, 30 * 1000)
}
```

- [ ] **Step 4: 写操作后清缓存**

找到联盟新增/删除/重命名的成功回调，添加：

```js
const zoneId = this.data.selectedZone ? this.data.selectedZone._id : null
if (zoneId) {
  cache.invalidate('cfg_alliance_' + zoneId)
  cache.invalidate('fortress_alliances_' + zoneId)
}
```

- [ ] **Step 5: 语法验证 + 提交**

```bash
node -c miniprogram/pages/admin/alliance-config/alliance-config.js
git add miniprogram/pages/admin/alliance-config/alliance-config.js
git commit -m "perf: 联盟管理页加入缓存快速渲染"
```

---

### Task 9: 缓存官职管理页 (`admin/position-manage.js`)

**Files:**
- Modify: `miniprogram/pages/admin/position-manage/position-manage.js`

**缓存策略：**
- `cfg_position_{zoneId}`（30s）→ `{ configs }`
- 快速路径：`onShow` 时若 selectedZone 已知 → 立即渲染 → 后台刷新

`position-manage.js` 的 `onShow`:
```js
onShow: async function () {
  if (app.globalData.roleReady) {
    await this.loadZones()
    this.loadConfigs()
  }
},
```

- [ ] **Step 1: 引入 cache**

```js
const cache = require('../../../utils/cache')
```

- [ ] **Step 2: 在 `onShow` 中加入快速路径**

修改 `onShow`:
```js
onShow: async function () {
  if (app.globalData.roleReady) {
    // 快速路径
    const zone = this.data.currentZone || app.globalData.currentZone
    if (zone) {
      const cached = cache.get('cfg_position_' + zone._id)
      if (cached) {
        this.setData({ configs: cached.configs, loading: false })
      }
    }
    await this.loadZones()
    this.loadConfigs()
  }
},
```

- [ ] **Step 3: 在 `loadConfigs` 成功后写入缓存**

找到 `loadConfigs` 函数（调用 `db.getPositionConfigs` 或 `wx.cloud.callFunction`），在 `this.setData({ configs: [...] })` 后添加：

```js
const zone = this.data.currentZone || app.globalData.currentZone
if (zone) {
  cache.set('cfg_position_' + zone._id, { configs: this.data.configs }, 30 * 1000)
}
```

- [ ] **Step 4: 新增/删除配置后清缓存**

```js
const zone = this.data.currentZone || app.globalData.currentZone
if (zone) cache.invalidate('cfg_position_' + zone._id)
// 同时清用户侧缓存
cache.invalidate('position_' + (zone ? zone._id : ''))
```

- [ ] **Step 5: 语法验证 + 提交**

```bash
node -c miniprogram/pages/admin/position-manage/position-manage.js
git add miniprogram/pages/admin/position-manage/position-manage.js
git commit -m "perf: 官职管理页加入缓存快速渲染"
```

---

### Task 10: 缓存兵工厂配置页 (`admin/arsenal-config.js`)

**Files:**
- Modify: `miniprogram/pages/admin/arsenal-config/arsenal-config.js`

**缓存策略：**
- `cfg_arsenal_{zoneId}`（30s）→ `{ configs, alliances, selectedZone }`
- `admin/arsenal-config.js` 的 `onShow`:
  ```js
  onShow: function () {
    if (app.globalData.roleReady && this.data.zonesLoaded) {
      this.loadZones()
    }
  },
  ```

- [ ] **Step 1: 引入 cache**

```js
const cache = require('../../../utils/cache')
```

- [ ] **Step 2: 修改 `onShow` 加入快速路径**

```js
onShow: function () {
  if (app.globalData.roleReady && this.data.zonesLoaded) {
    const zone = this.data.selectedZone
    if (zone) {
      const cached = cache.get('cfg_arsenal_' + zone._id)
      if (cached) {
        this.setData({
          configs: cached.configs || [],
          alliances: cached.alliances || [],
          loading: false
        })
      }
    }
    this.loadZones()
  }
},
```

- [ ] **Step 3: 找到加载 configs 的最终成功位置，写入缓存**

在 `admin/arsenal-config.js` 中，找到 configs 最终设置的地方（搜索 `this.setData.*configs`），之后添加：

```js
const zoneId = this.data.selectedZone ? this.data.selectedZone._id : null
if (zoneId) {
  cache.set('cfg_arsenal_' + zoneId, {
    configs: this.data.configs,
    alliances: this.data.alliances,
    selectedZone: this.data.selectedZone
  }, 30 * 1000)
}
```

- [ ] **Step 4: 新增/删除配置后清缓存**

```js
const zoneId = this.data.selectedZone ? this.data.selectedZone._id : null
if (zoneId) {
  cache.invalidate('cfg_arsenal_' + zoneId)
  cache.invalidate('arsenal_' + zoneId)
  cache.invalidate('canyon_' + zoneId)
}
```

- [ ] **Step 5: 语法验证 + 提交**

```bash
node -c miniprogram/pages/admin/arsenal-config/arsenal-config.js
git add miniprogram/pages/admin/arsenal-config/arsenal-config.js
git commit -m "perf: 兵工厂配置页加入缓存快速渲染"
```

---

### Task 11: 缓存盟管堡垒配置页 (`auditor/config.js`)

**Files:**
- Modify: `miniprogram/pages/auditor/config/config.js`

**缓存策略：**
- `cfg_auditor_{allianceId}`（30s）→ `{ timeSlots }`
- `auditor/config.js` 通过页面参数 `allianceId` 进入，在 `onLoad` 中接收。`onShow` 触发重新加载。

- [ ] **Step 1: 引入 cache**

```js
const cache = require('../../../utils/cache')
```

- [ ] **Step 2: 找到 `loadTimeSlots` 函数，在调用前加快速路径**

`auditor/config.js` 的加载入口是 `verifyAllianceAccess` → `loadTimeSlots`。在 `onShow` 时若已初始化，直接加载 timeSlots。

找到 `onShow` 函数（或触发 `loadTimeSlots` 的入口），在调用 `loadTimeSlots` 之前插入：

```js
const allianceId = this.data.allianceId
if (allianceId) {
  const key = 'cfg_auditor_' + allianceId
  const cached = cache.get(key)
  if (cached) {
    this.setData({ timeSlots: cached.timeSlots, loading: false })
  }
}
```

- [ ] **Step 3: 在 `loadTimeSlots` 成功后写入缓存**

在 `loadTimeSlots` 函数末尾，`this.setData({ timeSlots: [...] })` 后添加：

```js
const allianceId = this.data.allianceId
if (allianceId) {
  cache.set('cfg_auditor_' + allianceId, { timeSlots: this.data.timeSlots }, 30 * 1000)
}
```

- [ ] **Step 4: 新增/删除时间段后清缓存**

```js
const allianceId = this.data.allianceId
if (allianceId) {
  cache.invalidate('cfg_auditor_' + allianceId)
  cache.invalidate('fortress_slots_' + allianceId)
}
```

- [ ] **Step 5: 语法验证 + 提交**

```bash
node -c miniprogram/pages/auditor/config/config.js
git add miniprogram/pages/auditor/config/config.js
git commit -m "perf: 盟管堡垒配置页加入缓存快速渲染"
```

---

### Task 12: 缓存盟管兵工厂配置页 (`auditor/arsenal-config.js`)

**Files:**
- Modify: `miniprogram/pages/auditor/arsenal-config/arsenal-config.js`

**缓存策略：**
- `cfg_auditor_arsenal_{allianceId}`（30s）→ `{ configs }`
- 通过页面参数 `allianceId` 进入，`verifyAllianceAccess` 后加载 configs

- [ ] **Step 1: 引入 cache**

```js
const cache = require('../../../utils/cache')
```

- [ ] **Step 2: 找到 `verifyAllianceAccess` 或加载 configs 的调用位置，加入快速路径**

`auditor/arsenal-config.js` 在 `waitForRoleReady` → `verifyAllianceAccess` → `loadConfigs`。

在 `verifyAllianceAccess` 函数成功后，调用 `loadConfigs` 之前插入：

```js
const allianceId = this.data.allianceId
if (allianceId) {
  const key = 'cfg_auditor_arsenal_' + allianceId
  const cached = cache.get(key)
  if (cached) {
    this.setData({ configs: cached.configs, loading: false })
  }
}
```

- [ ] **Step 3: 在 loadConfigs 成功后写入缓存**

找到 configs 最终设置的 `setData`，之后添加：

```js
const allianceId = this.data.allianceId
if (allianceId) {
  cache.set('cfg_auditor_arsenal_' + allianceId, { configs: this.data.configs }, 30 * 1000)
}
```

- [ ] **Step 4: 新增/删除配置后清缓存**

```js
const allianceId = this.data.allianceId
if (allianceId) {
  cache.invalidate('cfg_auditor_arsenal_' + allianceId)
  cache.invalidate('arsenal_')
  cache.invalidate('canyon_')
}
```

- [ ] **Step 5: 语法验证 + 提交**

```bash
node -c miniprogram/pages/auditor/arsenal-config/arsenal-config.js
git add miniprogram/pages/auditor/arsenal-config/arsenal-config.js
git commit -m "perf: 盟管兵工厂配置页加入缓存快速渲染"
```

---

## 测试清单

完成所有 Task 后，在**微信开发者工具**中验证：

### 核心验证（必须）

| 场景 | 操作 | 预期结果 |
|------|------|---------|
| 堡垒报名二次进入 | 进入→返回→再进入 | 第二次毫秒级看到上次数据，无白屏 |
| 官职报名二次进入 | 同上 | 同上 |
| 兵工厂报名二次进入 | 同上 | 同上 |
| 峡谷报名二次进入 | 同上 | 同上 |
| 我的报名二次进入 | 同上 | 同上 |
| 报名后再进入 | 报名成功→返回→再进入 | 显示最新数据（含新报名） |
| 取消后再进入 | 取消成功→返回→再进入 | 显示最新数据（报名已消失） |
| 管理员配置页二次进入 | 进入配置页→返回→再进入 | 毫秒级渲染，数据正确 |
| 新增时间段后用户侧 | 管理员新增→用户进入报名页 | 用户看到最新时间段 |
| 首次进入行为不变 | 清除后台/冷启动 | 正常 loading，无异常 |

### 边界场景

- 切换分区后再进入报名页：应显示新分区数据
- 60s 后缓存过期自动重新加载：数据正常更新
- 网络断开时：缓存数据仍可展示（离线友好）

---

## 实现注意事项

1. **`auditor/config.js` 的 `onShow`**：需要先确认该文件是否有独立的 `onShow`，还是只在 `onLoad` 中处理。如果只有 `onLoad`，则快速路径只在首次进入时有效，对"返回页面"无效（需要添加 `onShow`）。

2. **缓存数据包含什么**：缓存的是**已处理**的展示数据（registrationCount 已计算，displayName 已格式化），不是原始 DB 数据。这保证了渲染速度最快。

3. **`canyon-registration.js` 的特殊性**：`onLoad` 直接调用了 `this.onShow()`，因此 `onShow` 会在 onLoad 时也执行。快速路径在首次进入时缓存未命中是正常的，不会出错。

4. **不要 invalidate 范围太大**：`cache.invalidate('fortress_')` 会清除所有 `fortress_` 开头的 key（包括所有联盟的 slots）。在已知具体 allianceId 时，优先用精确 key `fortress_slots_{allianceId}` 而非宽泛前缀清除。

5. **admin/arsenal-config.js 有 console.log 诊断代码**：Task 10 时注意不要意外删除，保留原有 debug 日志（它对生产无害）。
