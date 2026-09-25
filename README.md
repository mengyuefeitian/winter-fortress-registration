<a id="readme-top"></a>

# 无尽冬日报名助手

[![平台](https://img.shields.io/badge/平台-微信小程序-07C160?logo=wechat)](https://mp.weixin.qq.com/)
[![版本](https://img.shields.io/badge/version-1.17.2-blue)](https://github.com/mengyuefeitian/winter-fortress-registration/releases)
[![后端](https://img.shields.io/badge/后端-微信云开发-4A90D9)](https://cloud.weixin.qq.com/)
[![更新日志](https://img.shields.io/badge/docs-CHANGELOG-brightgreen)](docs/CHANGELOG.md)

> 为《无尽冬日》联盟活动打造的一站式报名管理小程序：堡垒、兵工厂、峡谷会战、国战、官职五种活动一个入口，成员活跃度自动统计，告别 Excel 表格和群里刷屏报名。

<details>
<summary><strong>目录</strong></summary>

- [项目简介](#项目简介)
- [功能特性](#功能特性)
- [快速体验](#快速体验)
- [使用指南](#使用指南)
- [本地运行与部署](#本地运行与部署)
- [项目结构](#项目结构)
- [技术架构](#技术架构)
- [常见问题](#常见问题)
- [更新日志](#更新日志)
- [许可与相关链接](#许可与相关链接)

</details>

---

## 项目简介

联盟活动一多，报名管理很快就会失控：谁报了、报满没、谁是替补、谁该让位……全靠人工翻聊天记录、手动数表格，费时又容易出错。到了每周活跃统计更麻烦：管理层要在群里挨个点名，跨天还得重新来一遍。

**无尽冬日报名助手** 把这些搬进小程序：

- 成员自助报名，管理员实时看到报名与满员状态；
- 用户打开小程序即自动登记当日活跃，管理层打开就能看到本周整周活跃表，一键截图存档；
- 分区、联盟、活动配置与权限分级收口到管理端，多区管可协同。

小程序已上线使用，前端为**原生小程序**（无第三方 UI 库），后端完全基于**微信云开发**，无需自建服务器。

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

## 功能特性

### 报名管理

- **五种活动全覆盖**：堡垒、兵工厂、峡谷会战、国战、官职报名，一个小程序全搞定
- **分角色管理**：普通用户 / 盟管 / 区管 / 超级管理员，权限逐级细分
- **多分区 / 多联盟**：分区与联盟数量不限，支持多区管协同
- **在线申请与审核**：申请盟管、区管、开通分区均在线提交，上级一键审批，结果通过订阅消息推送
- **实时报名状态**：满员自动置灰，容量按活动类型自定义，排队情况一目了然
- **数据统计与截图**：管理员查看统计数据，一键生成图片保存到相册
- **游戏账号资料库**：在「我的」维护多个游戏账号（熔炉等级 / 三兵营等级 / 地心探险 / 兵种阶级），设主账号后报名自动填充
- **等级徽章**：报名列表与统计截图中，账号名前展示熔炉与兵营等级图标（火晶为宝石徽章，普通等级为圆环数字）

### 联盟活跃

- **自动登记活跃**：用户打开小程序即自动标记当日活跃，无需人工点名
- **归属自动识别**：按「最后一次报名选择的联盟」判定归属，老用户也能自动回溯补登
- **双列表勾选**：今日活跃 / 未活跃两个列表互相迁移，多列自适应铺满屏幕
- **周活跃表截图**：导出 8 列表格（成员 + 本周 7 天），活跃打勾、未活跃打叉，未来日期留空
- **区管总览**：一张表看全分区各联盟每天的活跃人数，点联盟名可下钻管理

### 运维与通知

- **审核结果通知**：申请结果通过微信订阅消息直接推送到用户
- **邮件提醒**：有人提交申请时自动通知超级管理员
- **自动清理**：过期报名、失效时间段、超期审批记录定时自动清空

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

## 快速体验

微信扫描下方二维码即可访问小程序：

<div align="center">
  <img src="docs/qrcode.jpg" alt="无尽冬日报名助手小程序二维码" width="280" />
</div>

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

## 使用指南

### 普通用户

1. 首页选择自己所在的分区
2. 选择要报名的活动（堡垒 / 兵工厂 / 峡谷会战 / 国战 / 官职）
3. 选择游戏账号、填写位置信息即可完成报名
4. 在【我的】→【我的报名】中随时查看或取消

> 只要通过任意活动报名成功并选择过联盟，系统会记住你的归属，之后每天打开小程序自动登记为当日活跃。

### 盟管 / 区管 / 超级管理员

| 角色 | 主要能力 |
|------|----------|
| **盟管** | 管理所绑定联盟的活动配置与报名数据，查看统计并截图；在【联盟活跃】中登记与导出成员活跃 |
| **区管** | 创建分区、配置联盟与各类活动、审核盟管申请、管理成员；在【联盟活跃】总览中查看全分区活跃人数 |
| **超级管理员** | 审核区管申请、管理超管名单、查看全局统计、配置自动清理、必要时清空数据 |

权限从普通用户开始逐级申请：想管理联盟就申请盟管，想管理整个分区就申请区管，均需上级审核通过后生效。

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

## 本地运行与部署

### 前置条件

- [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)（稳定版）
- 一个小程序 AppID，并已开通**云开发**环境

### 部署步骤

1. 克隆仓库

   ```bash
   git clone https://github.com/mengyuefeitian/winter-fortress-registration.git
   ```

2. 用微信开发者工具导入项目根目录，填入自己的 AppID 并开通云开发，记录环境 ID
3. 替换环境 ID：`project.config.json` 的 `appid`，以及 `miniprogram/app.js`、`miniprogram/cloudbaserc.json` 中的 `env`
4. 在云开发控制台创建下方数据集合
5. 在 `superAdmins` 集合中添加自己的手机号，成为第一位超级管理员
6. 逐个右键 `miniprogram/cloudfunctions/` 下的云函数目录，选择「上传并部署：云端安装依赖」
7. 点击「上传」提交审核，通过后即可发布

> 版本号统一在 `miniprogram/utils/version.js` 中管理，上传新版本前记得更新。

### 数据集合

| 分类 | 集合 |
|------|------|
| 用户与权限 | `users`、`superAdmins`、`admins`、`settings` |
| 分区与联盟 | `zones`、`alliances` |
| 活动配置 | `timeSlots`、`battleConfigs`、`arsenalConfigs`、`canyonConfigs`、`positionConfigs` |
| 报名记录 | `registrations`、`battleRegistrations`、`arsenalRegistrations`、`canyonRegistrations`、`positionRegistrations` |
| 游戏账号 | `gameAccounts` |
| 联盟活跃 | `allianceMembers`（持久成员名单）、`allianceActivity`（周活跃记录，仅保留本周） |
| 其他 | `feedbacks` |

### 关于定时清理

云函数的定时触发器**按函数独立注册**，且在开发者工具中不可见，需到[网页版云开发控制台](https://mp.weixin.qq.com/)确认：

- `cleanupApplications` 的 timer 定义在 `config.json`（每日运行，清理 14 天前的已处理申请）
- `clearRegistrations` 的 hourly 触发器同时负责清理联盟活跃的过期周数据

若控制台触发器列表为空，函数不会自动运行 —— 需重新部署或在网页版手动添加触发器。

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

## 项目结构

```
.
├── miniprogram/
│   ├── pages/              # 页面
│   │   ├── index/          # 首页（选择分区与活动入口）
│   │   ├── user/           # 报名页、我的、我的报名、统计、功能介绍、关于
│   │   ├── admin/          # 区管控制台
│   │   ├── auditor/        # 盟管控制台
│   │   ├── superAdmin/     # 超级管理员控制台
│   │   ├── login/          # 登录
│   │   └── common/         # 通用页（网页容器，当前未注册）
│   ├── components/         # 自定义组件
│   │   ├── level-picker/       # 等级选择器（标准等级 / 火晶等级 / 兵种阶级）
│   │   ├── alliance-picker/    # 联盟选择器（两列六行弹窗）
│   │   ├── account-nickname/   # 游戏账号昵称复合选择器
│   │   ├── zone-selector/      # 分区选择器
│   │   └── float-reminder/     # 浮动提示
│   ├── templates/          # 公共模板（等级徽章等）
│   ├── utils/              # 工具层（db 缓存、gameAccount、link、updates、version…）
│   ├── images/             # 图片资源
│   └── cloudfunctions/     # 云函数
├── docs/                   # 文档（CHANGELOG、二维码等）
└── project.config.json     # 小程序项目配置
```

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

## 技术架构

| 层级 | 说明 |
|------|------|
| 前端 | 微信小程序原生框架（WXML / WXSS / JS），无第三方 UI 库 |
| 后端 | 微信云开发 —— 云数据库 + 云函数（Node.js）+ 定时触发器 |
| 权限 | 分级角色模型，敏感读写一律收口到云函数（绕开客户端 20 条查询上限与集合写权限限制） |
| 统计截图 | 离屏 Canvas 2D，两遍计算高度的绘制法，避免长列表被截断 |

### 云函数

| 云函数 | 职责 |
|--------|------|
| `login` | 登录与用户初始化 |
| `register` | 堡垒报名与取消 |
| `manageTimeSlot` / `manageZone` | 时间段与分区配置 |
| `manageBattle` / `manageArsenal` / `managePosition` | 国战 / 兵工厂 / 峡谷与官职报名管理 |
| `manageGameAccount` | 游戏账号资料库（多账号、设主、报名同步） |
| `manageAdmin` | 盟管、区管、分区开通三类申请的列表与审批 |
| `manageAllianceActivity` | 联盟活跃：成员名单、周活跃记录、自动登记与过期清理 |
| `manageUserIdentity` / `manageFeedback` | 身份与反馈管理 |
| `sendReviewNotify` / `sendApplyEmail` / `sendFeedbackEmail` | 订阅消息与邮件通知 |
| `clearRegistrations` / `clearExpiredData` / `cleanupApplications` | 定时清理（含联盟活跃过期数据） |
| `getStatistics` | 统计数据聚合 |

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

## 常见问题

**外部链接为什么是「复制链接」而不是直接打开？**
本小程序为**个人主体**，微信个人主体无法配置业务域名，`web-view` 在正式版不可用，且小程序没有唤起系统浏览器的 API，因此统一走「复制链接 → 浏览器打开」（`utils/link.js`）。

**联盟活跃数据能保留多久？**
只保留本周，历史数据由定时任务自动清理，需要存档请用「周活跃表截图」导出图片。

**定时清理没有生效？**
触发器按云函数独立注册，需到网页版云开发控制台确认；列表为空时重新部署一次云函数即可注册。

**清空数据能恢复吗？**
不能。清空操作不可恢复，请谨慎使用。

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

## 更新日志

- **v1.17.2** — 官职报名页视觉收敛（切换条减高、等级徽章放大）；「功能介绍」新增 v1.17.0 说明入口
- **v1.17.0** — 游戏账号全面升级：多账号管理、报名自动填充、兵种阶级（T11/T12）同步、等级选择器全站统一；分区权限收紧与盟管审核按分区隔离
- **v1.16.0** — 国战报名页等级图标放大并居中；盟管 / 区管控制台移除分区显示

完整变更记录见 [`docs/CHANGELOG.md`](docs/CHANGELOG.md)，版本说明页见[官网更新日志](https://www.xiaoanhome.xyz/winter-fortress)。

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

## 许可与相关链接

- 官网：<https://www.xiaoanhome.xyz/winter-fortress>
- 更新日志：<https://www.xiaoanhome.xyz/winter-fortress>（小程序内【帮助与反馈】→【功能介绍】）
- 问题反馈：小程序内【帮助与反馈】，或在本仓库提交 Issue

本项目为《无尽冬日》玩家社群工具，代码公开用于学习交流；仓库暂未附带开源许可证，二次分发或商用前请先联系作者。

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>
