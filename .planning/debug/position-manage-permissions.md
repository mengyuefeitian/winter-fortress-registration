---
slug: position-manage-permissions
status: resolved
trigger: manual
created: 2026-05-17
---

# Debug Session: 官职管理权限问题

## Symptoms

Three bugs reported from 3827区 testing:

1. 区管/超管删除官职报名记录失败：显示"删除成功"但数据未实际删除
2. 超管和区管在官职管理页面只能看到自己创建的配置，看不到其他区管的配置，导致重复创建
3. (Audit) 系统性权限检查：确认所有写操作是否正确路由

## Evidence

- Collection `positionRegistrations`: 权限为"仅创建者可写，所有人可读"
- Collection `positionConfigs`: 权限为"仅创建者可写，所有人可读"
- 最近提交 fb29557 修复了相同的"静默失败"模式（盟管删除），通过云函数路由写操作

## Root Causes

### Bug 1: 删除官职报名失败（静默失败）

**文件**: `miniprogram/utils/db.js:1133-1141`

`deletePositionRegistration(registrationId)` 直接在客户端调用：
```js
db.collection('positionRegistrations').doc(registrationId).update({ status: 'deleted' })
```
WeChat Cloud DB "仅创建者可写"权限规则：只有创建该文档的用户才能写入。区管或超管尝试更新其他用户创建的报名记录时，客户端请求被静默拒绝（不抛出错误，只是不执行），因此显示"删除成功"但数据未变。

**同一问题还影响**:
- `deletePositionConfig()` (db.js:953) — 对 `positionRegistrations` 做 `.remove()` 批删除，对 `positionConfigs` 做 `.update()` 软删除，均为客户端写入受限集合
- `clearPositionRegistrations()` (db.js:1144) — 对各条 `positionRegistrations` 逐一客户端 `.update()`

**根因**: 这三个函数均在小程序端（客户端上下文）直接写入"仅创建者可写"的集合，必须改由云函数执行（云函数有管理员权限，绕过集合权限规则）。

### Bug 2: 区管/超管只能看到自己的官职配置

**文件**: `miniprogram/pages/admin/position-manage/position-manage.js:299-309`

`loadConfigs()` 中对非超管角色（即区管 admin）使用 `creatorId: userId` 作为查询过滤条件：
```js
configs = await db.getPositionConfigs({ creatorId: userId })
```
这导致每个区管只能看到自己创建的配置，无法看到同区其他区管的配置。

超管路径使用 `zoneId` 过滤（不限制 `creatorId`），逻辑正确，但实际报告超管也看不到其他人的配置 — 这可能是因为超管通过同一页面（`position-manage`）访问，而超管没有选中分区时返回空数组，或历史数据没有 `zoneId` 字段。

**根因**: `loadConfigs` 的查询策略以"谁创建的"为维度而非"属于哪个分区"，导致跨区管的可见性缺失。

### Bug 3: 权限审计结果

在小程序端（客户端上下文）对受限集合进行的写操作清单：

| 函数 | 集合 | 操作类型 | 问题 |
|------|------|----------|------|
| `deletePositionRegistration` (db.js:1133) | `positionRegistrations` | `.update()` 他人记录 | 静默失败 |
| `deletePositionConfig` (db.js:953) | `positionRegistrations` | `.remove()` 批量删除 | 静默失败 |
| `deletePositionConfig` (db.js:960) | `positionConfigs` | `.update()` 他人记录 | 静默失败 |
| `clearPositionRegistrations` (db.js:1144) | `positionRegistrations` | `.update()` 他人记录 | 静默失败 |

用户自身操作（`cancelPositionRegistration`, `createPositionRegistration`）无问题，因为用户只写入自己的记录。

## Fixes Applied

### Fix 1: db.js — deletePositionConfig 路由到云函数

替换客户端直接写入为云函数调用 `managePosition.deleteConfig`，云函数已实现：先删除关联报名记录，再软删除配置。

### Fix 2: db.js — deletePositionRegistration 路由到云函数

替换客户端 `.update()` 为云函数调用 `managePosition.deleteRegistration`，云函数以管理员身份执行写入。

### Fix 3: db.js — clearPositionRegistrations 路由到云函数

替换客户端逐条 `.update()` 为云函数调用 `managePosition.clearRegistrations`（云函数已实现批量 where-update）。

### Fix 4: position-manage.js — loadConfigs 按分区而非创建者查询

将 admin 角色的配置加载逻辑从 `{ creatorId: userId }` 改为 `{ zoneId: currentZone._id }`，与超管逻辑统一，确保同分区内所有区管互相可见对方创建的配置。

## Files Modified

- `miniprogram/utils/db.js` — lines 952-966, 1132-1158 (三处客户端写入改为云函数路由)
- `miniprogram/pages/admin/position-manage/position-manage.js` — lines 299-309 (查询过滤从 creatorId 改为 zoneId)

## Resolution

- root_cause: positionRegistrations/positionConfigs 集合的"仅创建者可写"权限导致区管/超管客户端写入静默失败；loadConfigs 以 creatorId 而非 zoneId 过滤导致跨区管可见性缺失
- fix: 三个写操作函数路由到 managePosition 云函数；loadConfigs 统一改用 zoneId 过滤
- syntax_check: node -c 验证两个修改文件均通过

## Deployment Note

修改后需要重新部署 `managePosition` 云函数（本次未修改云函数，无需重新部署）。修改 `db.js` 和 `position-manage.js` 属于小程序端代码，随小程序版本发布生效。
