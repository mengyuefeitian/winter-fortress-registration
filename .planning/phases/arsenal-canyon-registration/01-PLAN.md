---
phase: "新增需求开发"
name: "兵工厂&峡谷报名系统"
mode: standard
waves: 4
---

# Plan: 兵工厂&峡谷报名系统

**Phase Goal:** 新增兵工厂和峡谷两个联盟活动报名系统，包括管理端配置、用户端报名、我的报名展示、数据统计集成，以及现有UI优化。

## Must Haves

**Truths:**
- 4个新数据库集合：arsenalConfigs, arsenalRegistrations, canyonConfigs, canyonRegistrations
- 1个新云函数：manageArsenal（同时处理兵工厂和峡谷）
- 2个新页面：arsenal-registration, canyon-registration
- 每个活动配置：30参战 + 10替补，报名时检查名额
- 盟管只能管理自己绑定的联盟（auditorIds）
- 我的报名：混合列表+标签区分活动类型
- 首页控制台菜单红色角标数字（待审核数量）
- 所有改动仅改UI文案，不改代码变量名

## Wave 1: 数据库集合 + 云函数

### Plan 01: 新建数据库集合和 db.js 操作方法

**Objective:** 创建4个新集合并添加 CRUD 方法到 db.js

**Type:** execute
**Depends on:** none
**Files modified:**
- `miniprogram/utils/db.js`
- `miniprogram/scripts/db-init.js`
- `miniprogram/app.js`

**Tasks:**

```xml
<task>
<id>1.1</id>
<type>execute</type>
<action>
在 miniprogram/scripts/db-init.js 中添加4个新集合的创建逻辑：arsenalConfigs, arsenalRegistrations, canyonConfigs, canyonRegistrations。确保集合创建时设置正确的权限（与 positionConfigs 一致：仅创建者可写，所有人可读）。
</action>
<read_first>
- miniprogram/scripts/db-init.js
- miniprogram/utils/db.js (集合初始化部分)
- miniprogram/app.js
</read_first>
<acceptance_criteria>
- db-init.js 中包含 arsenalConfigs, arsenalRegistrations, canyonConfigs, canyonRegistrations 四个集合的创建逻辑
- 集合权限设置为 creator-only write, all read
- 运行 db-init.js 成功创建集合
</acceptance_criteria>
</task>

<task>
<id>1.2</id>
<type>execute</type>
<action>
在 miniprogram/utils/db.js 中添加 arsenal/canyon 的 CRUD 方法，参照 managePosition 的模式：
- createArsenalConfig(data) / createCanyonConfig(data) — 创建活动配置
- getArsenalConfigs(zoneId, allianceId) / getCanyonConfigs(zoneId, allianceId) — 获取活动配置列表
- deleteArsenalConfig(configId) / deleteCanyonConfig(configId) — 删除活动配置
- createArsenalRegistration(data) / createCanyonRegistration(data) — 创建报名（含名额检查和昵称唯一性检查）
- getArsenalRegistrations(configId) / getCanyonRegistrations(configId) — 获取报名列表
- cancelArsenalRegistration(registrationId) / cancelCanyonRegistration(registrationId) — 取消报名释放名额
- getArsenalStats(configId) / getCanyonStats(configId) — 统计报名人数

数据模型：
- arsenalConfig/canyonConfig: { date, timeValue (12:00/19:00/20:30/22:00), corps (军团1/军团2), zoneId, zoneName, allianceId, allianceName, creatorId, status, capacity: { combat: 30, substitute: 10 } }
- arsenalRegistration/canyonRegistration: { configId, userId, nickName, position (combat/substitute), status, createdAt }
</action>
<read_first>
- miniprogram/utils/db.js (全部，特别是 positionConfigs 和 positionRegistrations 相关方法)
- miniprogram/cloudfunctions/managePosition/index.js (事务处理参考)
- .planning/phases/arsenal-canyon-registration/00-CONTEXT.md
</read_first>
<acceptance_criteria>
- db.js 中新增至少10个 arsenal/canyon 相关方法
- createArsenalRegistration 和 createCanyonRegistration 包含名额上限检查（combat≤30, substitute≤10）
- createArsenalRegistration 和 createCanyonRegistration 包含同一 configId 内 nickName 唯一性检查
- 所有方法返回格式与现有 db.js 方法一致
</acceptance_criteria>
</task>
```

**Verification:**
- `node -c miniprogram/utils/db.js` 语法检查通过
- `node -c miniprogram/scripts/db-init.js` 语法检查通过
- 在微信开发者工具中运行 db-init.js，4个集合成功创建

### Plan 02: 新建 manageArsenal 云函数

**Objective:** 创建 manageArsenal 云函数，使用 action-based routing 模式处理配置和报名的 CRUD

**Type:** execute
**Depends on:** none
**Files modified:**
- `miniprogram/cloudfunctions/manageArsenal/index.js` (新建)
- `miniprogram/cloudfunctions/manageArsenal/package.json` (新建)

**Tasks:**

```xml
<task>
<id>2.1</id>
<type>execute</type>
<action>
创建 miniprogram/cloudfunctions/manageArsenal/ 目录，包含 index.js 和 package.json。index.js 使用 event.action switch 模式，支持的 actions：
- createConfig: 创建活动配置（检查 creator 角色权限）
- getConfigs: 获取活动配置列表（支持按 zoneId, allianceId 过滤）
- deleteConfig: 删除活动配置（级联删除所有报名记录）
- createRegistration: 创建报名（使用事务保证原子性：先查名额→检查昵称唯一性→插入记录）
- getRegistrations: 获取报名列表
- cancelRegistration: 取消报名（释放名额）
- getStats: 获取统计数据

package.json 依赖：wx-server-sdk
</action>
<read_first>
- miniprogram/cloudfunctions/managePosition/index.js (完整参考)
- miniprogram/cloudfunctions/manageTimeSlot/index.js (action 模式参考)
- .planning/codebase/ARCHITECTURE.md
- .planning/codebase/CONCERNS.md (注意 auth bypass 风险)
</read_first>
<acceptance_criteria>
- manageArsenal/index.js 包含至少7个 action 处理
- createRegistration 使用数据库事务或顺序检查保证名额不超限
- 所有 action 包含角色权限验证（auditor/admin/superAdmin 不同权限）
- package.json 包含 wx-server-sdk 依赖
- node -c miniprogram/cloudfunctions/manageArsenal/index.js 语法检查通过
</acceptance_criteria>
</task>
```

**Verification:**
- `node -c miniprogram/cloudfunctions/manageArsenal/index.js` 语法检查通过
- 在微信开发者工具中可以上传并部署 manageArsenal 云函数

## Wave 2: 管理端页面

### Plan 03: 盟管控制台 — 兵工厂&峡谷配置页面

**Objective:** 在盟管控制台新增独立菜单区块和配置页面，支持日期、时间、活动类型、军团选择和配置列表展示

**Type:** execute
**Depends on:** Plan 01, Plan 02
**Files modified:**
- `miniprogram/pages/auditor/home/home.js`
- `miniprogram/pages/auditor/home/home.wxml`
- `miniprogram/pages/auditor/home/home.wxss`
- `miniprogram/pages/auditor/arsenal-config/index.js` (新建)
- `miniprogram/pages/auditor/arsenal-config/index.json` (新建)
- `miniprogram/pages/auditor/arsenal-config/index.wxml` (新建)
- `miniprogram/pages/auditor/arsenal-config/index.wxss` (新建)
- `miniprogram/app.json` (新增页面路由)

**Tasks:**

```xml
<task>
<id>3.1</id>
<type>execute</type>
<action>
在 miniprogram/pages/auditor/home/home.js 和 home.wxml 中新增 [兵工厂&峡谷] 独立菜单区块，与现有的 [堡垒配置]、[官职管理] 并列。点击后跳转到 /pages/auditor/arsenal-config/index 页面。同时在区管和超管控制台首页做同样处理。
</action>
<read_first>
- miniprogram/pages/auditor/home/home.js
- miniprogram/pages/auditor/home/home.wxml
- miniprogram/pages/admin/home/home.js (区管参考)
- miniprogram/pages/superAdmin/home/home.js (超管参考)
</read_first>
<acceptance_criteria>
- 盟管/区管/超管控制台首页新增 [兵工厂&峡谷] 菜单区块
- 点击可跳转到对应角色的 arsenal-config 页面
- 菜单样式与现有 [堡垒配置]、[官职管理] 一致
</acceptance_criteria>
</task>

<task>
<id>3.2</id>
<type>execute</type>
<action>
创建 miniprogram/pages/auditor/arsenal-config/ 页面（4个文件），包含：
- 表单区域：日期选择器、时间选择器(4选1: 12:00/19:00/20:30/22:00)、活动类型选择(兵工厂/峡谷会战)、军团选择(军团1/军团2)
- 添加配置按钮：调用 manageArsenal 云函数 createConfig action
- 配置列表：展示已创建的配置（日期、时间、活动类型、军团标签）
- 删除操作：支持删除配置（级联删除报名）

区管控制台版本增加：分区(置灰当前分区)+联盟(下拉当前区域联盟列表)
超管控制台版本：分区(可下拉)+联盟(下拉)
</action>
<read_first>
- miniprogram/pages/admin/time-slot-config/ (堡垒时间段配置页面，表单模式参考)
- miniprogram/pages/user/registration/registration.wxml (UI组件参考)
- miniprogram/utils/db.js (新增的 arsenal/canyon CRUD 方法)
- miniprogram/components/zone-selector/ (分区选择组件)
</read_first>
<acceptance_criteria>
- 页面包含完整的表单（日期、时间4选1、活动类型2选1、军团2选1）
- 添加配置后列表实时更新显示
- 区管/超管版本包含分区+联盟选择
- 超管版本分区可下拉切换，区管版本分区置灰
- 支持删除配置
- 在微信开发者工具中页面可正常渲染和操作
</acceptance_criteria>
</task>
```

**Verification:**
- `node -c miniprogram/pages/auditor/arsenal-config/index.js` 语法检查通过
- 在微信开发者工具中盟管控制台可见新菜单并可进入配置页面
- 可以成功创建和删除活动配置

### Plan 04: 区管/超管控制台 — 兵工厂&峡谷配置页面

**Objective:** 创建区管和超管版本的兵工厂&峡谷配置页面，支持分区和联盟选择

**Type:** execute
**Depends on:** Plan 03
**Files modified:**
- `miniprogram/pages/admin/arsenal-config/index.js` (新建)
- `miniprogram/pages/admin/arsenal-config/index.json` (新建)
- `miniprogram/pages/admin/arsenal-config/index.wxml` (新建)
- `miniprogram/pages/admin/arsenal-config/index.wxss` (新建)
- `miniprogram/pages/superAdmin/arsenal-config/index.js` (新建)
- `miniprogram/pages/superAdmin/arsenal-config/index.json` (新建)
- `miniprogram/pages/superAdmin/arsenal-config/index.wxml` (新建)
- `miniprogram/pages/superAdmin/arsenal-config/index.wxss` (新建)
- `miniprogram/app.json` (新增页面路由)

**Tasks:**

```xml
<task>
<id>4.1</id>
<type>execute</type>
<action>
创建区管和超管的 arsenal-config 页面（各4个文件）。区管版本：分区选择置灰（当前区管所在分区），联盟下拉选择（当前区域联盟列表）。超管版本：分区可下拉切换，联盟随分区动态加载。复用 auditor/arsenal-config 的表单和列表组件逻辑。
</action>
<read_first>
- miniprogram/pages/auditor/arsenal-config/ (Plan 03 创建的页面)
- miniprogram/pages/admin/time-slot-config/ (区管时间段配置参考)
- miniprogram/pages/superAdmin/ (超管页面模式参考)
- miniprogram/components/zone-selector/ (分区选择组件)
</read_first>
<acceptance_criteria>
- 区管页面：分区显示当前分区(不可切换)，联盟下拉可选
- 超管页面：分区可下拉切换，联盟随分区动态更新
- 两个版本均可创建、查看、删除活动配置
- app.json 中正确注册新页面路由
</acceptance_criteria>
</task>
```

**Verification:**
- 区管和超管控制台可见新菜单并可以进入配置页面
- 分区和联盟选择功能正常

## Wave 3: 用户端报名页面

### Plan 05: 兵工厂报名页面

**Objective:** 创建兵工厂用户报名页面，展示可报名活动列表，支持选择和提交报名

**Type:** execute
**Depends on:** Plan 01, Plan 02
**Files modified:**
- `miniprogram/pages/user/arsenal-registration/index.js` (新建)
- `miniprogram/pages/user/arsenal-registration/index.json` (新建)
- `miniprogram/pages/user/arsenal-registration/index.wxml` (新建)
- `miniprogram/pages/user/arsenal-registration/index.wxss` (新建)
- `miniprogram/app.json` (新增页面路由)

**Tasks:**

```xml
<task>
<id>5.1</id>
<type>execute</type>
<action>
创建 miniprogram/pages/user/arsenal-registration/ 页面，参考堡垒报名页面 design：
- 活动列表：展示管理员创建的活动（日期、时间、军团标签），区分已满/已报名状态
- 点击活动进入报名表单：昵称（自动填入 userInfo.nickName）、位置（参战/替补 二选一）
- 提交报名：调用 manageArsenal createRegistration action
- 已报名人员预览：显示已报名列表（昵称+位置）
- 帮助提示：联盟管理员可以在控制台中[兵工厂&峡谷]中创建好配置，用户即可选择对应活动进行报名
- 支持单用户报名多个游戏昵称（同一活动内昵称不可重复）
</action>
<read_first>
- miniprogram/pages/user/registration/registration.js
- miniprogram/pages/user/registration/registration.wxml
- miniprogram/pages/user/registration/registration.wxss
- miniprogram/utils/db.js (arsenal CRUD 方法)
</read_first>
<acceptance_criteria>
- 页面展示活动列表（日期、时间、军团标签、名额状态）
- 点击活动可进入报名，昵称自动填入 userInfo.nickName
- 位置选择为参战/替补二选一
- 提交后列表更新显示报名状态
- 已满活动显示不可点击或明确提示
- 帮助提示信息正确展示
</acceptance_criteria>
</task>
```

**Verification:**
- `node -c miniprogram/pages/user/arsenal-registration/index.js` 语法检查通过
- 在微信开发者工具中页面可正常渲染
- 可以成功报名并看到已报名人员

### Plan 06: 峡谷会战报名页面

**Objective:** 创建峡谷会战用户报名页面，与兵工厂报名页面结构相同，数据隔离

**Type:** execute
**Depends on:** Plan 05
**Files modified:**
- `miniprogram/pages/user/canyon-registration/index.js` (新建)
- `miniprogram/pages/user/canyon-registration/index.json` (新建)
- `miniprogram/pages/user/canyon-registration/index.wxml` (新建)
- `miniprogram/pages/user/canyon-registration/index.wxss` (新建)
- `miniprogram/app.json` (新增页面路由)

**Tasks:**

```xml
<task>
<id>6.1</id>
<type>execute</type>
<action>
创建 miniprogram/pages/user/canyon-registration/ 页面，复用 arsenal-registration 的结构，数据操作使用 canyonConfigs 和 canyonRegistrations 集合。UI 和交互与兵工厂报名完全一致，仅数据源不同。
</action>
<read_first>
- miniprogram/pages/user/arsenal-registration/ (Plan 05 创建的页面)
- miniprogram/utils/db.js (canyon CRUD 方法)
</read_first>
<acceptance_criteria>
- 页面结构与兵工厂报名一致
- 数据操作使用 canyonConfigs 和 canyonRegistrations
- 报名功能、列表展示、表单提交均正常
- app.json 中正确注册页面路由
</acceptance_criteria>
</task>
```

**Verification:**
- 峡谷报名页面可正常渲染和操作
- 报名数据与兵工厂完全隔离

### Plan 07: 首页入口 + 我的报名扩展

**Objective:** 在首页新增兵工厂和峡谷报名入口，扩展我的报名页面支持多类型混合展示

**Type:** execute
**Depends on:** Plan 05, Plan 06
**Files modified:**
- `miniprogram/pages/index/index.js`
- `miniprogram/pages/index/index.wxml`
- `miniprogram/pages/index/index.wxss`
- `miniprogram/pages/user/my-registrations/my-registrations.js`
- `miniprogram/pages/user/my-registrations/my-registrations.wxml`
- `miniprogram/pages/user/my-registrations/my-registrations.wxss`

**Tasks:**

```xml
<task>
<id>7.1</id>
<type>execute</type>
<action>
在首页 (miniprogram/pages/index/index.js/.wxml) 新增两个报名入口按钮：
- "兵工厂报名" → 跳转到 /pages/user/arsenal-registration/index
- "峡谷会战报名" → 跳转到 /pages/user/canyon-registration/index

入口样式与现有的堡垒报名、官职报名入口保持一致。
</action>
<read_first>
- miniprogram/pages/index/index.wxml (首页布局)
- miniprogram/pages/index/index.js
</read_first>
<acceptance_criteria>
- 首页新增兵工厂报名和峡谷会战报名两个入口
- 点击正确跳转到对应页面
- 入口样式与现有入口一致
</acceptance_criteria>
</task>

<task>
<id>7.2</id>
<type>execute</type>
<action>
扩展我的报名页面 (my-registrations)，支持堡垒/兵工厂/峡谷三种报名类型的混合列表展示：
- 每个报名项增加活动类型标签（堡垒/兵工厂/峡谷）
- 时间/标签：日期(YY/MM/DD)第一行，时间第二行，标签第三行（堡垒名称+奖励并排）
- 移除分区字段
- 联盟：联盟名称前3字符 + 分区编号标签
- 操作：取消按钮，点击取消对应报名释放名额
- 兵工厂/峡谷报名显示：活动时间(日期+时间分两行)、活动类型+军团(如"兵工厂 军团1")、昵称、取消操作
</action>
<read_first>
- miniprogram/pages/user/my-registrations/my-registrations.js
- miniprogram/pages/user/my-registrations/my-registrations.wxml
- miniprogram/utils/db.js (获取各类报名数据的方法)
</read_first>
<acceptance_criteria>
- 列表混合展示堡垒/兵工厂/峡谷三种报名
- 每项包含活动类型标签
- 时间/标签三行展示（日期、时间、标签）
- 联盟名称只显示前3字符+分区标签
- 无分区字段显示
- 取消按钮功能正常，取消后列表实时更新
- 兵工厂/峡谷报名显示正确的时间、活动名称、昵称
</acceptance_criteria>
</task>

<task>
<id>7.3</id>
<type>execute</type>
<action>
在 auth.js 中新增活动管理相关权限：
- 新增 activityManage 权限，auditor/admin/superAdmin 均可访问
- 新增 canManageActivity 函数，返回 auditor/admin/superAdmin 可以管理活动
同时更新首页控制台菜单，在盟管/区管/超管菜单项右上角增加红色角标数字，显示待审核申请数量。
</action>
<read_first>
- miniprogram/utils/auth.js
- miniprogram/pages/index/index.wxml (首页菜单布局)
- miniprogram/utils/db.js (获取待审核申请数量的方法)
</read_first>
<acceptance_criteria>
- auth.js 新增 activityManage 权限和 canManageActivity 函数
- auditor/admin/superAdmin 角色均可访问 activityManage
- 首页控制台菜单项右上角显示红色数字（待审核数量）
- 数字正确反映 admins 集合中 pending 状态的数量
</acceptance_criteria>
</task>
```

**Verification:**
- 首页新增入口可正常点击跳转
- 我的报名页面正确显示三种类型的报名
- 取消报名功能正常

## Wave 4: 数据统计集成 + UI 优化

### Plan 08: 数据统计扩展 + 堡垒报名列表UI改进 + 文案重命名

**Objective:** 在统计页面增加兵工厂/峡谷报名选项，优化堡垒报名列表展示，重命名管理端文案

**Type:** execute
**Depends on:** Plan 03, Plan 07
**Files modified:**
- `miniprogram/pages/admin/statistics/statistics.js`
- `miniprogram/pages/admin/statistics/statistics.wxml`
- `miniprogram/pages/auditor/statistics/statistics.js`
- `miniprogram/pages/auditor/statistics/statistics.wxml`
- `miniprogram/pages/superAdmin/all-statistics/all-statistics.js`
- `miniprogram/pages/superAdmin/all-statistics/all-statistics.wxml`
- 各角色控制台首页 wxml/js 文件 (文案更新)
- 堡垒报名相关页面 wxml 文件 (文案和UI优化)

**Tasks:**

```xml
<task>
<id>8.1</id>
<type>execute</type>
<action>
扩展统计页面：
- 盟管统计：增加联盟下拉选项（置灰当前联盟），报名类型下拉包含：堡垒报名/兵工厂报名/峡谷报名（三选一）
- 区管统计：报名类型增加兵工厂报名/峡谷报名两个选项
- 超管统计：同上
- 统计数据支持清空操作，支持截图保存

在 db.js 中添加 getArsenalStats 和 getCanyonStats 方法，返回各活动的报名人数统计。
</action>
<read_first>
- miniprogram/pages/admin/statistics/statistics.js
- miniprogram/pages/auditor/statistics/statistics.js
- miniprogram/pages/superAdmin/all-statistics/all-statistics.js
- miniprogram/cloudfunctions/getStatistics/index.js
- miniprogram/utils/db.js
</read_first>
<acceptance_criteria>
- 盟管统计页面新增联盟下拉和报名类型三选一
- 区管/超管统计页面新增兵工厂/峡谷报名类型
- 统计数据正确显示兵工厂和峡谷的报名人数
- 支持清空统计和截图
- 统计数据分开独立展示
</acceptance_criteria>
</task>

<task>
<id>8.2</id>
<type>execute</type>
<action>
UI文案重命名（仅改页面显示文字，不改代码变量名）：
- [时间段配置] → [堡垒配置]（所有管理控制台中的标题）
- [添加时间段] → [添加活动]（按钮文字）
- [时间段列表] → [活动列表]（列表标题）

影响的页面：
- miniprogram/pages/admin/time-slot-config/
- miniprogram/pages/auditor/config/
- miniprogram/pages/superAdmin/ (时间段配置相关页面)
</action>
<read_first>
- miniprogram/pages/admin/time-slot-config/index.wxml
- miniprogram/pages/auditor/config/index.wxml
- miniprogram/pages/superAdmin/ (搜索"时间段配置"相关文字)
</read_first>
<acceptance_criteria>
- 所有管理控制台中"时间段配置"改为"堡垒配置"
- "添加时间段"改为"添加活动"
- "时间段列表"改为"活动列表"
- 代码变量名保持不变
- 搜索代码确认无变量名改动
</acceptance_criteria>
</task>

<task>
<id>8.3</id>
<type>execute</type>
<action>
堡垒报名列表UI优化（我的报名页面）：
- 时间/标签：日期(YY/MM/DD)第一行，时间第二行，标签第三行（堡垒名称+奖励并排展示）
- 移除分区字段
- 联盟：联盟名称只显示前3字符，分区编号用标签展示
- 操作：取消按钮

注意：此改动与 Plan 07.2 的我的报名扩展合并执行。
</action>
<read_first>
- miniprogram/pages/user/my-registrations/my-registrations.wxml
- miniprogram/pages/user/my-registrations/my-registrations.js
- miniprogram/utils/util.js (日期格式化函数)
</read_first>
<acceptance_criteria>
- 堡垒报名列表项按多行格式展示
- 日期格式为 YY/MM/DD
- 联盟名称截断为前3字符+分区标签
- 无分区字段
- 取消按钮功能正常
</acceptance_criteria>
</task>
```

**Verification:**
- 统计页面可以切换报名类型查看不同数据
- 管理控制台文案已正确更新
- 堡垒报名列表UI正确显示
- 所有页面在微信开发者工具中可正常预览
