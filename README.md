# 无尽冬日活动分配 - 微信小程序

一个用于联盟活动报名管理的微信小程序，支持五种活动类型的报名、权限管理与数据统计。

## 立即体验

微信扫描下方二维码即可访问小程序：

<div align="center">
  <img src="docs/qrcode.jpg" alt="无尽冬日小程序二维码" width="280" />
</div>

## 功能特点

- **五种活动报名**：堡垒报名、兵工厂报名、峡谷会战报名、国战报名、官职报名
- **多角色系统**：普通用户、盟管、区管、超级管理员
- **分区管理**：支持创建多个分区，每个分区最多12个联盟
- **多区管支持**：一个分区可配置多个区管
- **权限申请与审核**：用户可在线申请盟管/区管，超管审核后生效
- **报名管理**：实时显示报名状态，满员自动置灰，容量控制（堡垒可自定义，兵工厂/峡谷参战30人+替补10人）
- **数据统计**：管理员可查看统计数据，支持截图保存到相册
- **自动清理**：定时清理过期数据和失效时间段

## 技术栈

- 微信小程序原生开发
- 微信云开发（云数据库 + 云函数）

## 部署步骤

### 1. 注册微信小程序

1. 前往 [微信公众平台](https://mp.weixin.qq.com/) 注册小程序账号
2. 获取小程序 AppID

### 2. 开通云开发

1. 在微信开发者工具中打开项目
2. 点击"云开发"按钮
3. 创建云开发环境，记录环境 ID

### 3. 配置项目

1. 打开 `project.config.json`，填写 `appid`
2. 打开 `miniprogram/app.js`，将 `env` 替换为您的云开发环境 ID
3. 打开 `miniprogram/cloudbaserc.json`，将 `env_id` 替换为您的云开发环境 ID

### 4. 初始化数据库

在云开发控制台中创建以下集合：

| 集合 | 说明 |
|------|------|
| `users` | 用户信息表 |
| `admins` | 管理员申请表 |
| `zones` | 分区表 |
| `alliances` | 联盟配置表 |
| `timeSlots` | 堡垒时间段配置表 |
| `registrations` | 堡垒报名记录表 |
| `superAdmins` | 超级管理员表 |
| `positionConfigs` | 官职配置表 |
| `positionRegistrations` | 官职报名记录表 |
| `battleConfigs` | 国战配置表 |
| `battleRegistrations` | 国战报名记录表 |
| `arsenalConfigs` | 兵工厂配置表 |
| `arsenalRegistrations` | 兵工厂报名记录表 |
| `canyonConfigs` | 峡谷会战配置表 |
| `canyonRegistrations` | 峡谷会战报名记录表 |
| `userFeedbacks` | 用户反馈表 |

### 5. 添加超级管理员

在云开发数据库的 `superAdmins` 集合中添加记录：

```json
{
  "phone": "您的手机号"
}
```

> 注意：phone 字段支持 string 和 number 类型。

### 6. 部署云函数

在微信开发者工具中，右键点击 `miniprogram/cloudfunctions/` 下的每个云函数目录，选择"上传并部署：云端安装依赖"。

### 7. 上传代码

1. 点击"上传"按钮上传代码（版本号在 `miniprogram/utils/version.js` 中管理）
2. 在微信公众平台提交审核
3. 审核通过后发布

## 使用说明

### 角色说明

| 角色 | 名称 | 权限 |
|------|------|------|
| `user` | 普通用户 | 报名各类活动、查看我的报名、申请盟管/区管 |
| `auditor` | 盟管 | 管理绑定联盟的堡垒配置、兵工厂/峡谷配置、统计数据、清空数据 |
| `admin` | 区管 | 创建分区、管理联盟、配置堡垒/兵工厂/峡谷、审核盟管申请、官职管理、统计数据 |
| `superAdmin` | 超级管理员 | 全部权限 + 审核区管申请、管理超管手机号、全局统计 |

### 超级管理员

1. 使用绑定的手机号登录
2. 可以审核区管/盟管申请
3. 可以查看所有分区和联盟的统计数据（含截图保存）
4. 可以设置超管手机号
5. 可以清空任意联盟的报名数据
6. 可以管理用户身份（降级/移除）

### 区管

1. 首先申请成为区管，等待超管审核
2. 可以创建分区（4位数字编号）
3. 可以管理联盟（名称、盟管绑定）
4. 可以配置堡垒时间段、兵工厂/峡谷活动
5. 可以管理官职配置
6. 可以清空联盟报名数据
7. 可以查看统计数据并截图

### 盟管

1. 由区管绑定到联盟
2. 可以管理绑定联盟的堡垒配置
3. 可以管理绑定联盟的兵工厂/峡谷配置
4. 可以查看绑定联盟的报名数据并截图
5. 可以清空绑定联盟的报名数据

### 普通用户

1. 在首页选择分区
2. 参与五种活动报名：
   - **堡垒报名**：选择联盟 → 选择时间段 → 填写昵称和位置（车头/车身）
   - **兵工厂报名**：选择联盟 → 选择活动配置 → 填写昵称和位置（参战/替补）
   - **峡谷会战报名**：选择联盟 → 选择活动配置 → 填写昵称和位置（参战/替补）
   - **国战报名**：选择活动配置 → 填写昵称，选择语音和位置（参战/替补）
   - **官职报名**：选择官职配置 → 选择时间段 → 填写昵称
3. 可以在【我的】中查看所有报名记录并取消

## 项目结构

```
winter-fortress-registration/
├── miniprogram/
│   ├── pages/
│   │   ├── index/                    # 首页（分区选择、功能入口）
│   │   ├── login/                    # 登录页
│   │   ├── user/                     # 用户页面
│   │   │   ├── registration/         # 堡垒报名
│   │   │   ├── arsenal-registration/ # 兵工厂报名
│   │   │   ├── canyon-registration/  # 峡谷会战报名
│   │   │   ├── position-list/        # 官职列表
│   │   │   ├── position-registration/ # 官职报名
│   │   │   ├── battle-list/          # 国战列表
│   │   │   ├── battle-registration/  # 国战报名
│   │   │   ├── battle-statistics/    # 国战统计
│   │   │   ├── battle-allocation/    # 国战分配
│   │   │   ├── my-registrations/     # 我的报名
│   │   │   ├── feedback/             # 意见反馈
│   │   │   └── apply-alliance-manager/ # 申请盟管
│   │   ├── admin/                    # 区管控制台
│   │   │   ├── home/                 # 区管首页
│   │   │   ├── zone-manage/          # 分区管理
│   │   │   ├── alliance-config/      # 联盟配置
│   │   │   ├── time-slot-config/     # 堡垒配置
│   │   │   ├── arsenal-config/       # 兵工厂&峡谷配置
│   │   │   ├── position-manage/      # 官职管理
│   │   │   ├── statistics/           # 数据统计
│   │   │   └── member-manage/        # 成员管理
│   │   ├── auditor/                  # 盟管控制台
│   │   │   ├── home/                 # 盟管首页
│   │   │   ├── config/               # 堡垒配置
│   │   │   ├── arsenal-config/       # 兵工厂&峡谷配置
│   │   │   └── statistics/           # 数据统计
│   │   └── superAdmin/               # 超管控制台
│   │       ├── home/                 # 超管首页
│   │       ├── admin-review/         # 管理员审核
│   │       ├── all-statistics/       # 全局统计
│   │       ├── phone-manage/         # 手机号管理
│   │       ├── alliance-manage/      # 联盟管理
│   │       ├── auto-clear/           # 自动清理
│   │       ├── member-manage/        # 成员管理
│   │       ├── user-identity/        # 用户身份管理
│   │       └── arsenal-config/       # 兵工厂&峡谷配置
│   ├── components/
│   │   └── zone-selector/            # 分区选择组件
│   ├── cloudfunctions/               # 云函数
│   │   ├── login/                    # 登录 + 获取手机号
│   │   ├── register/                 # 注册
│   │   ├── manageZone/               # 分区管理
│   │   ├── manageTimeSlot/           # 堡垒时间段管理
│   │   ├── manageArsenal/            # 兵工厂/峡谷配置与报名
│   │   ├── managePosition/           # 官职配置与报名
│   │   ├── manageAdmin/              # 管理员申请与审核
│   │   ├── manageUserIdentity/       # 用户身份管理
│   │   ├── getStatistics/            # 统计数据查询
│   │   ├── clearRegistrations/       # 清空报名数据
│   │   └── clearExpiredData/         # 自动清理过期数据
│   ├── utils/                        # 工具函数
│   │   ├── db.js                     # 数据库操作封装
│   │   ├── auth.js                   # 权限验证
│   │   ├── util.js                   # 通用工具
│   │   └── version.js                # 版本号管理
│   ├── scripts/                      # 脚本（数据库初始化等）
│   ├── images/                       # 图片资源
│   ├── app.js                        # 应用入口
│   ├── app.json                      # 应用配置
│   └── app.wxss                      # 全局样式
├── docs/                             # 文档
│   ├── CHANGELOG.md                  # 版本历史
│   └── plans/                        # 开发计划
├── project.config.json               # 项目配置
└── README.md                         # 说明文档
```

## 数据模型

### 核心集合

**users** — 用户表
```json
{
  "_id": "users._id",
  "openid": "微信openid",
  "nickName": "昵称",
  "avatarUrl": "头像URL",
  "phone": "手机号",
  "role": "user | auditor | admin | superAdmin",
  "status": "active | inactive"
}
```

**zones** — 分区表
```json
{
  "_id": "zones._id",
  "zoneCode": "4位数字分区编号",
  "zoneName": "分区名称",
  "adminIds": ["区管用户ID列表"],
  "creatorId": "创建者ID",
  "status": "active | inactive"
}
```

**alliances** — 联盟表
```json
{
  "_id": "alliances._id",
  "zoneId": "所属分区ID",
  "allianceIndex": 1,
  "allianceName": "联盟名称",
  "auditorIds": ["盟管用户ID列表"]
}
```

**timeSlots** — 堡垒时间段表
```json
{
  "_id": "timeSlots._id",
  "zoneId": "分区ID",
  "allianceId": "联盟ID",
  "date": "日期",
  "timeValue": "时间",
  "displayName": "显示名称",
  "tag": "标签",
  "fortress": "堡垒名称",
  "reward": "奖励",
  "maxCount": 15,
  "slotIndex": 0,
  "status": "active | inactive"
}
```

**registrations** — 堡垒报名表
```json
{
  "_id": "registrations._id",
  "zoneId": "分区ID",
  "allianceId": "联盟ID",
  "timeSlotId": "时间段ID",
  "userId": "用户ID",
  "nickName": "昵称",
  "position": "head | body",
  "status": "active | cancelled"
}
```

**positionConfigs** — 官职配置表
```json
{
  "_id": "positionConfigs._id",
  "positionType": "副执行官 | 教育部长",
  "date": "日期",
  "startTime": "起始时间",
  "zoneId": "分区ID",
  "creatorId": "创建者ID",
  "status": "active | inactive"
}
```

**positionRegistrations** — 官职报名表
```json
{
  "_id": "positionRegistrations._id",
  "configId": "配置ID",
  "timeSlot": "时间段",
  "userId": "用户ID",
  "nickName": "昵称",
  "status": "active | cancelled"
}
```

**battleConfigs** — 国战配置表
```json
{
  "_id": "battleConfigs._id",
  "date": "日期",
  "voiceOption": "语音选项",
  "allianceId": "联盟ID",
  "zoneId": "分区ID",
  "creatorId": "创建者ID",
  "status": "active | inactive"
}
```

**battleRegistrations** — 国战报名表
```json
{
  "_id": "battleRegistrations._id",
  "configId": "配置ID",
  "userId": "用户ID",
  "nickName": "昵称",
  "voice": "语音选项",
  "position": "combat | substitute",
  "status": "active | cancelled"
}
```

**arsenalConfigs / canyonConfigs** — 兵工厂/峡谷配置表
```json
{
  "_id": "config._id",
  "activityType": "arsenal | canyon",
  "date": "日期",
  "timeValue": "时间",
  "corps": "军团1 | 军团2",
  "zoneId": "分区ID",
  "allianceId": "联盟ID",
  "creatorId": "创建者ID",
  "capacity": { "combat": 30, "substitute": 10 },
  "status": "active | inactive"
}
```

**arsenalRegistrations / canyonRegistrations** — 兵工厂/峡谷报名表
```json
{
  "_id": "registration._id",
  "configId": "配置ID",
  "zoneId": "分区ID",
  "allianceId": "联盟ID",
  "userId": "用户ID",
  "nickName": "昵称",
  "position": "combat | substitute",
  "status": "active | cancelled"
}
```

**admins** — 管理员申请表
```json
{
  "_id": "admins._id",
  "userId": "申请人ID",
  "phone": "手机号",
  "applyType": "zoneManager | allianceManager | zoneCreation",
  "status": "pending | approved | rejected",
  "zoneId": "分区ID",
  "zoneName": "分区名称"
}
```

**superAdmins** — 超级管理员表
```json
{
  "_id": "superAdmins._id",
  "phone": "手机号"
}
```

## 注意事项

1. 请确保云开发环境已正确配置
2. 首次使用请添加超级管理员手机号
3. 图片资源需要自行添加到 `images` 目录
4. 提交审核前请测试所有功能
5. **清空数据操作不可恢复，请谨慎操作**
6. WeChat Mini Program 不支持 `*` 通用 CSS 选择器，不要在 `.wxss` 中使用

## 版本历史

- **v1.3.0** — 报名功能全面扩展 + 多项优化
  - 新增兵工厂报名、峡谷会战报名、国战报名
  - 新增兵工厂/峡谷管理控制台（盟管/区管/超管）
  - 国战报名活动支持（语音选项 + 参战/替补）
  - 多区管架构重构（`auditorId` → `auditorIds`）
  - 国战删除区管不生效修复
  - 权限模型修复 + 最终一致性延迟修复
  - 官职管理竞态条件修复
  - 报名页 N+1 查询优化
  - 云函数分页查询（突破微信20条限制）

- **v1.2.0** — 多区管支持 + Bug 修复
  - 分区支持多个区管
  - 国战功能完善
  - 权限申请流程优化

- **v1.1.0** — 数据统计增强
  - 按联盟统计数据和截图
  - 清空报名数据功能
  - 盟管统计页面

- **v1.0.0** — 初始版本
  - 堡垒报名功能
  - 官职报名功能
  - 多角色权限系统
  - 区管/盟管/超管管理功能
  - 数据统计

---

## 开发

### 版本管理

版本号集中管理在 `miniprogram/utils/version.js`，上传新版本前请更新 `APP_VERSION`。

### 代码规范

- 微信小程序原生开发，无构建工具
- 云函数使用 action-based routing（`event.action` 路由分发）
- 数据库操作封装在 `utils/db.js`
- 权限验证使用 `utils/auth.js`

### 提交规范

使用 Conventional Commits 格式：
- `feat:` 新功能
- `fix:` Bug 修复
- `docs:` 文档更新
- `chore:` 配置/工具更新
- `refactor:` 重构（非功能变更）
