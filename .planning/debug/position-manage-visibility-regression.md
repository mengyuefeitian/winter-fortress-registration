---
status: resolved
trigger: "区管/超管控制台>配置管理>官职管理，还是看不到已创建的官职配置。3558区今天创建过数据了。"
created: 2026-05-17T00:00:00Z
updated: 2026-05-17T00:00:00Z
---

## Current Focus

hypothesis: 假设A 已确认 — loadZones() 和 loadConfigs() 在 onShow/checkPermission 中并发调用，loadConfigs 执行时 currentZone 仍为 null（初始值），进入 else 分支返回 []。

## Symptoms

expected: 区管/超管进入官职管理页面后立即看到该区所有官职配置
actual: 配置列表为空，但数据确实存在（今天已创建）
errors: 无报错
reproduction: 进入 官职管理 页面 → 配置列表空白

## Root Cause

race condition: `onShow` 和 `checkPermission` 同时调用 `this.loadZones()` 和 `this.loadConfigs()`（无 await）。

`loadConfigs` 在 line 300 检查 `this.data.currentZone`，初始值为 `null`（position-manage.js data.currentZone: null）。由于 `loadZones` 是 async 且尚未完成，`currentZone` 还没被设置，`loadConfigs` 走 else 分支返回 `configs = []`。

此 bug 是上一次修复引入的：将 loadConfigs 的查询条件从 `creatorId`（不依赖 currentZone）改为 `zoneId: this.data.currentZone._id` 后，出现了对 currentZone 的依赖，但没有保证 loadZones 先完成。

另：`onZoneChange`（超管切换分区）没有调用 `loadConfigs`，超管换区后配置列表不刷新。

## Resolution

root_cause: race condition between loadZones() and loadConfigs() — loadConfigs runs before loadZones sets currentZone
fix: |
  1. position-manage.js:onShow — make async, await this.loadZones() before this.loadConfigs()
  2. position-manage.js:checkPermission — make async, await this.loadZones() before this.loadConfigs()
  3. position-manage.js:onZoneChange — call this.loadConfigs() after setData (fix zone-switch not refreshing)
files_changed:
  - miniprogram/pages/admin/position-manage/position-manage.js
