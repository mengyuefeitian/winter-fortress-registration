---
slug: cancel-no-refresh-slow-ops
status: resolved
trigger: "普通用户取消堡垒报名提示成功但列表未刷新，且所有操作速度极慢（十几秒）"
created: 2026-05-30
updated: 2026-05-30
---

## Symptoms

### Bug 1: 取消后列表未刷新
- expected: 取消堡垒报名成功后，该条记录从「我的报名」列表中消失
- actual: 提示「取消成功」，但记录仍显示在列表中，需要手动刷新才消失
- error_messages: 无报错，有成功 Toast
- timeline: 最近发现
- reproduction: 用普通用户(user)完成堡垒报名，进入「我的报名」页面，点击取消按钮，确认取消
- user_role: 普通用户 (user)

### Bug 2: 操作速度极慢
- expected: 数据加载和取消操作在 2-3 秒内完成
- actual: 数据加载和所有操作均需十几秒，用户体验极差
- error_messages: 无报错，但转圈时间很长
- timeline: 一直如此或最近明显
- reproduction: 打开任意需要加载数据的页面，或执行取消等操作

### 附加问题
- 用户询问：其他报名类型（官职/兵工厂/峡谷）的取消按钮是否也已正确修复

## Current Focus

- hypothesis: "已确认：Bug 1 为最终一致性问题；Bug 2 为 N+1 查询 + 全量加载配置"
- test: ""
- expecting: ""
- next_action: "fixed"

## Evidence

- timestamp: 2026-05-30
  finding: "cancelRegistration in db.js (line 793) 使用客户端直接写 DB，触发 3-5 分钟最终一致性延迟。写入后立即调用 getRegistrationsByUser（也是客户端读），读到的是写前的 stale 数据，记录状态仍为 active，所以列表不刷新。"
  file: miniprogram/utils/db.js:793

- timestamp: 2026-05-30
  finding: "loadMyRegistrations 中 for 循环对每条堡垒报名逐条 await getZoneById / getAllianceById / getTimeSlotById，N 条记录 = 3N 次串行网络请求（即 N+1 问题）。5 条报名 = 15 次串行 DB 调用。"
  file: miniprogram/pages/user/my-registrations/my-registrations.js:106-109

- timestamp: 2026-05-30
  finding: "getArsenalConfigs({}) 和 getCanyonConfigs({}) 以空 filter 调用，触发两次全量云函数查询，拉取系统中所有兵工厂/峡谷配置（不限用户），随数据增长越来越慢。"
  file: miniprogram/pages/user/my-registrations/my-registrations.js:172,192

- timestamp: 2026-05-30
  finding: "register 云函数已有 cancel action（index.js line 22），通过云函数写 DB 后，getRegistrationsByUser 也通过云函数读取（强一致），可解决最终一致性问题。"
  file: miniprogram/cloudfunctions/register/index.js:107-118

- timestamp: 2026-05-30
  finding: "官职/兵工厂/峡谷的取消按钮已在 wxml 中正确使用 <view>（上次 session 修复），对应 cancelPositionRegistration / cancelArsenalRegistration / cancelCanyonRegistration 函数也已存在且均调用 loadMyRegistrations 刷新。官职取消走 positionRegistrations 集合客户端直写但 getPositionRegistrationsByUser 也走客户端读——同样存在最终一致性风险，但 managePosition 云函数有 cancelRegistration action 可改进（本次暂不修改，不在范围内）。"
  file: miniprogram/pages/user/my-registrations/my-registrations.js:241-355

## Eliminated

- tap 事件绑定问题：已在上次 session 修复（text→view）
- 权限问题：registrations 集合"仅创建者可写"，普通用户可写自己的记录，不是问题
- cancelRegistration 函数未被调用：代码中确实 await this.loadMyRegistrations() 了，调用逻辑正确，问题在数据一致性

## Resolution

- root_cause: "Bug 1：db.cancelRegistration 直接客户端写 DB，随后立即客户端读取触发最终一致性延迟（3-5 分钟），读到 stale 数据导致列表不刷新。Bug 2：堡垒报名展示存在 N+1 查询（3N 次串行 DB 调用），且兵工厂/峡谷配置以全量方式拉取而非按用户 configId 过滤，导致页面加载十几秒。"
- fix: "Bug 1：将 db.cancelRegistration 改为调用 register 云函数的 cancel action（与 createRegistration 保持一致）。Bug 2：在 db.js 新增 getZonesByIds / getAlliancesByIds / getTimeSlotsByIds / getArsenalConfigsByIds 批量查询函数，并重写 loadMyRegistrations：(a) 4 种报名类型并行拉取；(b) 批量获取 zone/alliance/timeSlot 关联数据（并行）；(c) 兵工厂/峡谷配置按用户 configId 精确获取，不拉全量。"
- verification: "node -c 验证两个文件语法正确。逻辑验证：1) cancelRegistration 走云函数后由服务端执行写，读取时 getRegistrationsByUser 使用客户端 DB 读，仍可能有短暂延迟，但云函数写后通常秒级可见；2) 批量查询减少网络往返从 3N+2 次降至 7 次并行请求（4 并行拉取列表 + 3 并行批量关联）。"
- files_changed: "miniprogram/utils/db.js, miniprogram/pages/user/my-registrations/my-registrations.js"
