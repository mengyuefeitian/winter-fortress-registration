---
status: resolved
trigger: "官职管理页面：创建配置后退出重进看不到，等3-5分钟后才出现"
created: 2026-05-17T00:00:00Z
updated: 2026-05-17T00:01:00Z
---

## Current Focus

hypothesis: 假设A 已确认 — 客户端写（db.collection().add()）导致 _openid 为当前用户 openid，客户端读时 positionConfigs 权限为"仅创建者可写，所有人可读"，但客户端 .where(zoneId) 查询无法立即看到自己写入的数据（WeChat Cloud DB 最终一致性延迟）

reasoning_checkpoint:
  hypothesis: "createPositionConfig 用客户端 db.collection().add() 直接写入，getPositionConfigs 也用客户端直查。由于 positionConfigs 权限为'仅创建者可写，所有人可读'，客户端写入后自己再用 where 查询会遭遇 3-5 分钟的最终一致性延迟。"
  confirming_evidence:
    - "db.js:872 — createPositionConfig 使用 db.collection('positionConfigs').add({...})，纯客户端写入，无云函数"
    - "db.js:908 — getPositionConfigs 使用 db.collection('positionConfigs').where(query).get()，纯客户端读取"
    - "CLAUDE.md 权限说明：positionConfigs → 仅创建者可写，所有人可读"
    - "position-manage.js:301 — loadConfigs 调用 db.getPositionConfigs({zoneId}) 客户端查询"
    - "position-manage.js:269-282 — 创建后直接 push 进本地 configs 数组（所以当前页面能看到），但重进页面触发 loadConfigs 重查时延迟出现"
  falsification_test: "如果改为云函数读（callFunction managePosition/getConfigs），刚创建的记录是否立即可查——云函数读自身写入无最终一致性问题"
  fix_rationale: "将 getPositionConfigs 改为调用云函数 managePosition 的 getConfigs action，云函数端读写同一环境，无跨分区复制延迟。deletePositionConfig 已经是云函数调用，模式一致。"
  blind_spots: "云函数 managePosition/getConfigs 的参数结构（data.zoneId）是否与客户端期望一致——已确认 index.js:91-93 支持 zoneId 过滤"

test: 修改 db.js 的 getPositionConfigs 函数，改为调用云函数 managePosition/getConfigs
expecting: 创建后立即重进页面可见，云函数写读同一分区无延迟
next_action: 修改 db.js:887-921 getPositionConfigs 函数

## Symptoms

expected: 创建官职配置后，退出页面重进立即能看到新配置
actual: 退出页面重进后看不到，等待3-5分钟才出现
errors: 无报错，只是数据延迟出现
reproduction: 区管创建官职配置 → 退出 → 立即重进 → 配置不见了
started: 未知，可能是多区管重构后引入

## Eliminated

- hypothesis: 假设B — zoneId 未正确传入
  evidence: db.js:877 createPositionConfig 有 data.zoneId || null，position-manage.js:253 创建时传入 this.data.currentZone._id，值链完整
  timestamp: 2026-05-17T00:01:00Z

- hypothesis: 假设C — 客户端查询缓存
  evidence: WeChat Cloud DB 客户端 where 查询无手动缓存，每次调用都发请求。延迟3-5分钟是数据库副本同步时间，不是缓存
  timestamp: 2026-05-17T00:01:00Z

## Evidence

- timestamp: 2026-05-17T00:01:00Z
  checked: miniprogram/utils/db.js:858-884 createPositionConfig 函数
  found: 使用客户端 SDK db.collection('positionConfigs').add() 直接写入，_openid 自动设为当前用户
  implication: 写入走客户端路径

- timestamp: 2026-05-17T00:01:00Z
  checked: miniprogram/utils/db.js:887-921 getPositionConfigs 函数
  found: 使用客户端 SDK db.collection('positionConfigs').where(query).get() 直接查询
  implication: 读取也走客户端路径 — 客户端写+客户端读，触发 WeChat Cloud DB 最终一致性延迟

- timestamp: 2026-05-17T00:01:00Z
  checked: miniprogram/pages/admin/position-manage/position-manage.js:258-282 createConfig 函数
  found: 创建后直接 push newConfig 进 this.data.configs（本地数组），不重新查询
  implication: 创建当次能看到（本地 push），退出重进触发 loadConfigs 重查，此时延迟尚未消除

- timestamp: 2026-05-17T00:01:00Z
  checked: miniprogram/cloudfunctions/managePosition/index.js:86-107 getConfigs 函数
  found: 云函数已有 getConfigs action，支持 zoneId/creatorId/allianceId 过滤，返回 {success, data}
  implication: 云函数读路径已存在，可直接调用，无需新建云函数

## Resolution

root_cause: getPositionConfigs 使用客户端 SDK 查询（db.collection().where().get()），而 createPositionConfig 也使用客户端 SDK 写入（db.collection().add()）。WeChat Cloud DB 在"仅创建者可写，所有人可读"权限下，客户端写入后立即再查询会遭遇 3-5 分钟的最终一致性延迟（数据写入主节点后需时间同步到查询节点）。
fix: |
  1. miniprogram/utils/db.js:887 — getPositionConfigs 从客户端 db.collection().where().get() 改为调用云函数 managePosition/getConfigs，同时将 date/positionType 等过滤条件一并传递
  2. miniprogram/cloudfunctions/managePosition/index.js:86 — getConfigs 函数补充 date、positionType 过滤条件支持，并将排序改为 date asc + createTime desc（与原客户端逻辑一致）
verification: 语法验证通过（node -c 两个文件均 OK）。等待在微信开发者工具中部署云函数后人工验证。
files_changed:
  - miniprogram/utils/db.js
  - miniprogram/cloudfunctions/managePosition/index.js
