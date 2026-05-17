# Phase 1 Context: 权限继承与可见度模型

**Date:** 2026-05-17
**Trigger:** 3827区测试反馈 — 多个权限/可见度问题

---

## Domain

统一化三类管理员（盟管/区管/超管）的权限继承和数据可见度，确保同角色之间的权限共通性，消除"删除成功但数据未变"的静默失败模式。

---

## Decisions

### 官职管理 (Position Management) 权限矩阵

| 操作 | 盟管(auditor) | 区管(admin) | 超管(superAdmin) |
|------|-------------|------------|-----------------|
| 官职配置 - 查看 | ❌ (报名时仅看可报名项) | ✅ 本区全部配置 | ✅ 所有区 |
| 官职配置 - 新建 | ❌ | ✅ 本区 | ✅ 所有区 |
| 官职配置 - 删除 | ❌ | ✅ 本区任何人的（级联删除所有报名） | ✅ 所有区 |
| 官职报名 - 报名/取消自己 | ✅ 同普通用户 | ✅ | ✅ |
| 官职报名 - 删除他人记录 | ❌ | ✅ 本区 | ✅ 所有区 |

**关键决策：盟管在官职管理中等同普通用户**，只能报名和取消自己的报名，无法查看/操作配置。

### 分区 (Zone) 管理权限

| 操作 | 区管(admin) | 超管(superAdmin) |
|------|------------|-----------------|
| 查看本区分区 | ✅ 本人所属区（adminIds 包含本人） | ✅ 所有区 |
| 修改分区名称/编号 | ❌ | ✅ |
| 删除分区 | ❌ | ✅ |
| 区内活动内容（联盟/时间段/报名等） | ✅ 本区所有区管共通 | ✅ 所有区 |

**关键决策：**
- 分区本身（创建/修改名称/删除）属于**超管专属权限**
- 同区内的多个区管，对区内**活动内容**具有完全相同的可见度和操作权限（互相可见可操作，不限创建者）
- 分区创建通过申请流程由超管审批开通，不是区管直接操作的功能

### 通用可见度原则

1. **先分区，再分盟**：所有数据按 zoneId 过滤，盟数据在此基础上再按 allianceId 过滤
2. **同盟盟管共通**：同一盟内所有盟管的可见度和权限完全相同（按 zoneId + allianceId）
3. **同区区管共通**：同一区内所有区管的可见度和权限完全相同（按 zoneId）
4. **超管全局**：具备所有区、所有盟的全部权限

---

## Implementation Status

### 已修复 (此次 debug 会话)

- ✅ `db.deletePositionRegistration` → managePosition 云函数（绕过 creator-only 限制）
- ✅ `db.deletePositionConfig` → managePosition 云函数（级联删报名）
- ✅ `db.clearPositionRegistrations` → managePosition 云函数
- ✅ `position-manage.js loadConfigs` → 按 zoneId 查询（而非 creatorId），区管/超管看全区配置

### 待修复

- ⚠️ `zone-manage.js` edit/delete → 仍使用客户端写入 `zones` 集合（creator-only）
  - 非创建者区管编辑/删除分区会静默失败
  - 需要迁移到 `manageZone` 云函数（已有 `delete` action，需新增 `updateZone` action）

---

## Root Cause Pattern

**所有权限类 bug 共享同一根因：**
客户端直接写入"仅创建者可写"的集合（zones / alliances / positionConfigs / positionRegistrations），非创建者的写操作被数据库权限静默拒绝，UI 显示成功但数据未变。

**修复策略：** 将受限集合的写入操作迁移到云函数（云函数以管理员权限运行，绕过集合权限规则）。客户端只直接操作"所有人可读写"的集合（users / admins）。

---

## Canonical Refs

- `miniprogram/cloudfunctions/manageZone/index.js` — 分区云函数，需新增 updateZone action
- `miniprogram/pages/admin/zone-manage/zone-manage.js:242,278` — 待迁移的客户端写入
- `miniprogram/cloudfunctions/managePosition/index.js` — 官职云函数（已完整）
- `miniprogram/utils/db.js` — 数据库工具层，所有集合写入应在此统一封装
- `CLAUDE.md` → Database Permissions 表 — 权限规则权威来源
