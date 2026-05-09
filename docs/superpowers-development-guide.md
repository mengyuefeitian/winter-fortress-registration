# Superpowers 开发指南 — 故障复盘与规范

## 1. 故障复盘：2026-05-08 大规模故障根因分析

### 1.1 触发事件

修改分区选择器（zone-selector）搜索功能后，引发大面积故障：
- **界面空白** — 应用无法启动
- **样式丢失** — 所有页面视觉元素失效
- **路由失效** — 多个页面无法访问

### 1.2 根因链路

| 改动 | 影响 | 根本原因 |
|------|------|----------|
| `app.json` 新增 8 个页面路由 | 全应用白屏 | 小程序要求任何注册页面必须完整存在（4个文件格式齐全），否则阻塞整个应用启动 |
| `app.wxss` 移除 `*` 选择器（commit `01cbc18`） | 所有 grid 布局坍塌 | `.grid-2 > *` 改为 `.grid-2-item`，但没有任何 `.wxml` 使用了 `.grid-2-item` 类名 |
| `app.wxss` 修改 `.function-card` 布局 | 首页功能卡片从垂直变水平 | `flex-direction: column` → `row`，`align-items: center` → `flex-start` |
| `db.js` 新增 755 行代码 | 新页面依赖未完成的函数 | 页面 `require('db.js')` 时，函数可能尚未导出 |

### 1.3 核心教训

**一次性改动过大是根本原因。** 开发过程违反了以下原则：

1. **增量式开发** — 84 个文件同时修改，9358 行新增代码
2. **影响范围控制** — 改搜索功能，却动了样式、路由、数据库层
3. **验证隔离** — 没有在每步改动后独立验证
4. **TDD 缺失** — 没有任何先写测试的步骤

---

## 2. Superpowers 技能体系

Superpowers-dev 插件提供以下核心技能，用于在开发过程中建立结构化流程：

### 2.1 核心技能列表

| 技能 | 何时使用 | 防止的问题 |
|------|---------|-----------|
| `brainstorming` | 接到任何任务时 | 没有想清楚就开始写代码 |
| `writing-plans` | 复杂功能实现前 | 缺乏实施步骤导致遗漏 |
| `executing-plans` | 按计划逐步实施 | 跳过步骤、自行发挥 |
| `test-driven-development` | 每个功能/修复 | 写完代码再补测试 |
| `verification-before-completion` | 标记完成前 | 没有验证就声称完成 |
| `systematic-debugging` | 遇到 bug 时 | 盲目尝试修复 |
| `finishing-a-development-branch` | 所有开发完成时 | 没有完整验证就合并 |
| `using-git-worktrees` | 需要隔离工作区时 | 在 main 分支直接改坏代码 |
| `requesting-code-review` | 代码完成后的 review | 缺少质量把关 |

### 2.2 技能执行优先级

```
1. Process skills 优先（brainstorming, debugging, planning）
   → 决定 HOW 来完成任务

2. Implementation skills 其次（test-driven-development）
   → 指导具体执行
```

### 2.3 TDD 铁律

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

- 写代码之前没有先看到测试失败 → 删除重写
- 测试立即通过 → 说明测试写错了，或者测的是已有行为
- 不要"先写实现，后面补测试" → 补测试 ≠ TDD

---

## 3. 标准开发流程（对照本次故障）

### 正确的流程

```
用户："修复分区选择器搜索问题"

Step 1 → /brainstorming
         分析：只改 zone-selector 组件
         风险：不要动 app.wxss 中的无关样式
         影响：使用了该组件的页面需要回归测试

Step 2 → /writing-plans
         生成计划：
           1. 修改 zone-selector.js 搜索逻辑
           2. 验证搜索过滤结果正确
           3. 更新对应页面的 wxml（如有需要）
           4. 独立验证每个页面

Step 3 → /test-driven-development
         先写测试 → 看着测试失败 → 写最小实现 → 测试通过

Step 4 → /verification-before-completion
         检查：所有使用 zone-selector 的页面能正常打开
         检查：搜索功能正常工作
         检查：不影响其他页面
```

### 实际发生的过程

```
用户："修复分区选择器搜索问题"
→ 直接改代码（无 brainstorming）
→ 顺便改了 app.wxss 的 * 选择器（无 plan，无影响分析）
→ 顺便改了 function-card 布局（无 plan）
→ 同时在 app.json 注册了 8 个新页面（无 plan）
→ db.js 加了 755 行（无 TDD）
→ 84 个文件同时修改，9358 行新增
→ 没有验证步骤就声称完成
```

---

## 4. 为什么预设规则失效

CLAUDE.md 和全局规则中已经定义了大量规范，但仍然被无视了。

### 原因

**Claude 的行为模式：优先响应用户当前指令，而不是遵循预设规则。**

```
你说："帮我改一下分区选择器搜索"
→ Claude 理解为："改搜索功能"
→ 直接改代码
→ 顺便改了样式（以为对齐了更好看）
→ 顺便加了新功能（顺手做了）
→ 一次改了 84 个文件
```

预设规则被当前任务的紧急感覆盖了。

### 三层防护方案

#### 第一层：对话开头 + 主动调用技能

```
/b brainstorming    → 先分析影响范围
/w writing-plans    → 生成具体实施计划
/t test-driven-development → 进入 TDD 流程
```

这会强制 Claude **停下来**，而不是直接跳进代码。

#### 第二层：任务拆解 + 逐个确认

```
❌ 错误做法：
  你说："修复分区选择器搜索"
  Claude：直接改（连带改了样式、路由、db.js）

✅ 正确做法：
  你说："修复分区选择器搜索"
  Claude：分析后说需要改 3 个文件
  你说："先只改 zone-selector 组件，其他别动"
  Claude：改完，测试通过
  你说："好，继续改 index.js"
```

**关键：每完成一个小改动，手动说"继续"。不要一次性给太大空间。**

#### 第三层：完成前验证

```
/verification-before-completion
```

强制跑检查清单，而不是直接说"搞定"。

---

## 5. 底线

**没有任何方式能 100% 强制 Claude 严格执行流程。** 它不是编译器，是概率模型。最可靠的保障仍然是：

1. **你控制节奏** — 不要一次让改太多东西
2. **你定期检查** — 每改完一小块就看 git diff
3. **你要求验证** — 每次改动后说"跑一下验证"

工具和规范能减少问题，但最终靠的是**保持对开发过程的掌控感**。
