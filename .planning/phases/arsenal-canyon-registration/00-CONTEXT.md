# Phase Context: 兵工厂&峡谷报名系统

**Phase:** 新增需求开发
**Date:** 2026-05-17

## Domain

在现有堡垒报名和官职报名之外，新增**兵工厂**和**峡谷会战**两个联盟活动报名系统。由盟管(auditor)权限管理活动配置，用户报名参与，支持参战(30人)和替补(10人)两个位置。

## Decisions

### 数据架构
- **独立集合** — 新建 arsenalConfigs/arsenalRegistrations 和 canyonConfigs/canyonRegistrations 四个集合，不复用 timeSlots/registrations
- **云函数** — 新建 manageArsenal 云函数，同时处理兵工厂和峡谷的配置+报名 CRUD
- **字段结构** — 活动配置包含：日期、时间(4选1: 12:00/19:00/20:30/22:00)、活动类型(兵工厂/峡谷)、军团(军团1/军团2)、关联联盟/分区

### 页面结构
- **两个独立页面** — arsenal-registration 和 canyon-registration，参考堡垒报名的页面设计（列表→点击→表单→提交）
- **我的报名** — 混合列表+标签区分活动类型（堡垒/兵工厂/峡谷），标签显示活动类型
- **取消入口** — 用户在"我的报名"列表中直接点击取消

### 权限模型
- **盟管** — 只能管理自己绑定的联盟（auditorIds），控制台增加[兵工厂&峡谷]独立菜单区块
- **区管** — 增加分区(置灰)+联盟下拉选项，分区为当前区管所在分区
- **超管** — 与区管相同但分区可下拉切换
- **用户** — 可报名多个游戏昵称，昵称来自 userInfo.nickName 自动填充，同一活动内昵称不可重复

### 业务规则
- **名额限制** — 每个活动配置固定 30参战 + 10替补，报名时检查名额，满员提示"人员已满，请选择其他活动"
- **取消规则** — 直接取消释放名额，无需审核
- **统计数据** — 分开独立统计：堡垒报名/兵工厂报名/峡谷报名三个独立选项
  - 盟管：联盟下拉(置灰当前联盟) + 报名类型(堡垒/兵工厂/峡谷 三选一)
  - 区管/超管：报名类型增加兵工厂/峡谷两个选项
- **审核标记** — 首页控制台菜单右上角红色角标数字，显示待审核申请数量

### UI 优化
- **重命名** — [时间段配置]→[堡垒配置]，[添加时间段]→[添加活动]，[时间段列表]→[活动列表]（仅UI文案，不改代码变量）
- **我的报名-堡垒列表** — 多行展示：
  - 时间/标签：日期(YY/MM/DD)第一行，时间第二行，标签第三行（堡垒名称+奖励并排）
  - 分区：移除该字段
  - 联盟：联盟名称前3字符 + 分区编号标签
  - 操作：取消按钮

### 数据统计优化
- 统计数据管理员可清空，可保存截图
- 盟管控制台增加联盟下拉选项

## Canonical Refs

- `.planning/codebase/ARCHITECTURE.md` — 现有系统架构，数据流，云函数模式
- `.planning/codebase/CONCERNS.md` — 安全风险评估（auth bypass, race conditions）
- `miniprogram/utils/auth.js` — 权限系统，需要新增 activityManage 权限
- `miniprogram/utils/db.js` — 数据库操作层，需要新增 arsenal/canyon CRUD 方法
- `miniprogram/pages/user/registration/` — 堡垒报名页面，UI 参考模板
- `miniprogram/pages/user/my-registrations/` — 我的报名页面，需要扩展支持多类型
- `miniprogram/cloudfunctions/managePosition/` — 官职管理云函数，事务处理参考
- `miniprogram/cloudfunctions/manageTimeSlot/` — 时间段管理云函数，CRUD 模式参考

## Code Context

### 可复用组件/模式
- **堡垒报名表单** — registration.wxml/js 的卡片列表+表单布局可直接复用
- **全局状态** — app.globalData 的 zone/alliance 选择模式
- **云函数 action-based routing** — 所有云函数使用 event.action switch 模式
- **软删除** — status 字段 ('active'/'inactive'/'cancelled'/'deleted')
- **容量检查** — cloud function 中 count >= maxCount 检查模式
- **zone-selector 组件** — 分区选择组件，区管/超管控制台复用

### 需要注意的已知风险
- 云函数无角色验证（auth bypass）— 新增 manageArsenal 应考虑加入角色检查
- 注册竞态条件 — 堡垒报名存在 capacity check 和 insert 分离的竞态，arsenal 报名应用事务保证原子性
- 数据库权限过于开放 — users/admins 集合所有人可读写

## Deferred Ideas

无

## Discussion Log

| Area | Decision | Notes |
|------|----------|-------|
| 数据结构 | 新独立集合 | 4个新集合 |
| 云函数 | manageArsenal | 新建，同时处理兵工厂和峡谷 |
| 首页入口 | 两个独立页面 | arsenal-registration, canyon-registration |
| 游戏昵称 | 复用 userInfo.nickName | 同堡垒/官职报名模式 |
| 名额控制 | 每配置固定名额 | 30参战+10替补 |
| 审核标记 | 红色角标数字 | 首页菜单右上角 |
| 权限模型 | 绑定联盟限制 | auditorIds 绑定 |
| 控制台菜单 | 独立新菜单区块 | 与堡垒配置/官职管理并列 |
| 我的报名 | 混合列表+标签 | 活动类型标签区分 |
| 重命名 | 仅UI文案 | 不改代码变量 |
| 取消报名 | 直接取消 | 无需审核 |
| 联盟显示 | 前3字符+分区标签 | 如 "龙之谷 [1区]" |
| 统计展示 | 分开独立统计 | 堡垒/兵工厂/峡谷三选项 |
| 取消入口 | 我的报名中取消 | 列表内操作 |
