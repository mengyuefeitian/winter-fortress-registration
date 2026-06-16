# 页面缓存性能优化设计文档

**日期**：2026-06-17
**分支**：dev
**状态**：已确认，待实现

---

## 目标

消除各报名页面和管理员配置页面进入时的 2-3 秒白屏等待。用户进入页面后毫秒级看到数据，后台静默刷新保证数据最终一致。

---

## 根本原因

每次 `onShow` 都串行发起多次数据库查询（分区→联盟→时间段→报名记录），没有任何缓存。典型链路：

```
onShow
  └─ loadZone (DB query)
       └─ loadAlliances (DB query)
            └─ loadTimeSlots (DB query)
                 └─ loadRegistrationCounts (DB query × N)
```

每次进页面全量重新查询，哪怕数据在过去几秒内没有任何变化。

---

## 方案：运行时内存缓存 + Stale-While-Revalidate

把查询结果存入 `app.globalData.pageCache`。进页面时：

1. 命中缓存 → 立即渲染（毫秒级）→ 后台静默拉新数据 → 有差异再更新
2. 未命中缓存 → 正常加载，加载完成后写入缓存

写操作（新增/删除/报名/取消）执行成功后，主动清除对应缓存前缀，下次进来重新拉取。

---

## 缓存工具 `miniprogram/utils/cache.js`

新建共享工具，所有页面统一调用：

```js
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

function set(key, data, ttl = DEFAULT_TTL) {
  _store()[key] = { data, timestamp: Date.now(), ttl }
}

// 清除所有以 prefix 开头的缓存（如 'fortress_zoneA_' 清除该分区所有联盟缓存）
function invalidate(prefix) {
  const store = _store()
  Object.keys(store).filter(k => k.startsWith(prefix)).forEach(k => delete store[k])
}

module.exports = { get, set, invalidate }
```

---

## 缓存 Key 规范

| 页面 | Key 格式 | 示例 |
|------|---------|------|
| 堡垒报名 | `fortress_{zoneId}_{allianceId}` | `fortress_z001_a003` |
| 官职报名 | `position_{zoneId}` | `position_z001` |
| 兵工厂报名 | `arsenal_{zoneId}` | `arsenal_z001` |
| 峡谷会战 | `canyon_{zoneId}` | `canyon_z001` |
| 我的报名记录 | `myregs_{openid}_{zoneId}` | `myregs_abc_z001` |
| 堡垒时间配置(admin) | `cfg_fortress_{zoneId}_{allianceId}` | `cfg_fortress_z001_a003` |
| 联盟管理(admin) | `cfg_alliance_{zoneId}` | `cfg_alliance_z001` |
| 官职管理(admin) | `cfg_position_{zoneId}` | `cfg_position_z001` |
| 兵工厂配置(admin) | `cfg_arsenal_{zoneId}` | `cfg_arsenal_z001` |
| 盟管配置(auditor) | `cfg_auditor_{allianceId}` | `cfg_auditor_a003` |
| 盟管兵工厂(auditor) | `cfg_auditor_arsenal_{allianceId}` | `cfg_auditor_arsenal_a003` |

---

## TTL 规则

| 页面类型 | TTL | 原因 |
|---------|-----|------|
| 用户报名页 | 60 秒 | 数据变化不频繁，用户短时间不会重复进入 |
| 管理员配置页 | 30 秒 | 管理员会主动修改，缓存不能太长 |

---

## 各页面改造模式

统一改法，以堡垒报名为例：

```js
// onShow 中
const key = `fortress_${zoneId}_${allianceId}`
const cached = cache.get(key)

if (cached) {
  // 立即渲染缓存数据
  this.setData({ ...cached, loading: false })
  // 后台静默刷新
  this.loadData({ key, silent: true })
} else {
  this.setData({ loading: true })
  this.loadData({ key, silent: false })
}

// loadData 内部
async loadData({ key, silent }) {
  const fresh = await fetchAllData()  // 并行化的查询
  cache.set(key, fresh, TTL)
  this.setData({ ...fresh, loading: false })
}
```

**写操作后清缓存：**
```js
// 新增/删除时间段成功后
cache.invalidate('fortress_')           // 清除该页所有联盟缓存
cache.invalidate('cfg_fortress_')       // 清除管理员配置缓存

// 报名/取消成功后
cache.invalidate(`fortress_${zoneId}_${allianceId}`)
cache.invalidate(`myregs_${openid}_`)
```

---

## 涉及文件

**新增：**
- `miniprogram/utils/cache.js`

**修改（用户报名页）：**
- `miniprogram/pages/user/registration/registration.js`
- `miniprogram/pages/user/position-list/position-list.js`
- `miniprogram/pages/user/arsenal-registration/arsenal-registration.js`
- `miniprogram/pages/user/canyon-registration/canyon-registration.js`
- `miniprogram/pages/user/my-registrations/my-registrations.js`

**修改（管理员配置页）：**
- `miniprogram/pages/admin/time-slot-config/time-slot-config.js`
- `miniprogram/pages/admin/alliance-config/alliance-config.js`
- `miniprogram/pages/admin/position-manage/position-manage.js`
- `miniprogram/pages/admin/arsenal-config/arsenal-config.js`
- `miniprogram/pages/auditor/config/config.js`
- `miniprogram/pages/auditor/arsenal-config/arsenal-config.js`

**修改（初始化）：**
- `miniprogram/app.js` — `globalData` 中添加 `pageCache: {}`

---

## 成功标准

- [ ] 二次进入报名页面时，数据在 100ms 内显示（不再有白屏等待）
- [ ] 后台刷新静默进行，用户不感知加载过程
- [ ] 报名/取消/新增/删除操作后，下次进入页面显示最新数据（缓存已清除）
- [ ] 管理员修改配置后，再次进入页面显示最新数据
- [ ] 首次进入页面行为不变（无缓存时正常加载）
