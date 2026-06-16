# 反馈回信功能设计文档

**日期**：2026-06-16  
**分支**：dev  
**状态**：已确认，待实现

---

## 目标

在「意见与反馈」页面顶部增加「反馈回信」入口，用户可查看自己历史提交的反馈及开发者回复。超管可在管理后台查看全部反馈并输入回复内容。功能仅针对本次发布后产生的新反馈，历史数据不纳入。

---

## 数据模型

扩展现有 `feedbacks` 集合，新增两个字段（旧记录无需迁移，查询时以字段是否存在判断）：

```js
{
  // 现有字段（不变）
  userId,        // 用户 openid
  nickName,      // 提交时的昵称
  type,          // '需求' | 'bug'
  content,       // 反馈内容
  contactInfo,   // 联系方式（可选）
  imageUrls,     // 云存储图片 fileID 列表
  status,        // 'pending'（保留现有逻辑）
  createTime,    // 提交时间

  // 新增
  reply: null,       // string | null — 开发者回复内容；null 表示未回复
  repliedAt: null,   // Date | null   — 回复时间；用于30天自动删除判断
  isRead: false      // boolean       — 用户是否已查看过回复
}
```

**自动删除规则**：`repliedAt` 非空且距今超过 30 天 → 删除整条记录。未回复的记录永不自动删除。

---

## 页面结构

### 新增页面（用户侧）

#### `pages/user/feedback-inbox/feedback-inbox` — 反馈回信列表

- 展示当前用户所有反馈，按 `createTime` 倒序
- 每行一条，单行布局：
  - 左侧：内容前 20 字作为标题（正常字号，粗体），下方小字显示日期
  - 右侧：若有回复且未读，显示红点提示
- 空状态文案："暂无反馈记录"
- 点击跳转详情页，传入 `feedbackId`

#### `pages/user/feedback-detail/feedback-detail` — 反馈详情

- 上方展示反馈完整内容（类型、内容、图片）
- 若 `reply` 非空，底部渲染「开发者回复」卡片，显示回复文本和回复日期；不显示开发者邮件或身份信息
- 若 `reply` 为空，不渲染回复区块
- 进入页面时调用 `getFeedbackDetail`，后端同时将 `isRead` 置为 true

### 新增页面（超管侧）

#### `pages/superAdmin/feedback-manage/feedback-manage` — 反馈管理列表

- 展示全部用户的反馈，按 `createTime` 倒序，支持分页（每页 20 条）
- 每行：昵称、类型标签、内容前 20 字、日期；已回复显示「已回复」绿色标签
- 点击进入回复页

#### `pages/superAdmin/feedback-reply/feedback-reply` — 回复页

- 上方展示原始反馈完整内容（只读）
- 若已有回复，展示当前回复内容，可修改覆盖
- 底部输入框（最多 500 字）填写回复，点击「发送回复」保存
- 保存后写入 `reply` + `repliedAt`，返回列表页

### 修改页面

#### `pages/user/feedback/feedback.wxml`

在页面顶部 `header` 区块下方，增加「反馈回信」入口按钮，`bindtap` 跳转至 `feedback-inbox`。

---

## 云函数

新建云函数 `manageFeedback`，使用 `event.action` 路由：

| action | 调用方 | 说明 |
|--------|--------|------|
| `getMyFeedbacks` | 用户 | 查询当前用户反馈列表，返回 `_id, type, content(截取前20字), createTime, reply(仅判断是否非空), isRead`，按 createTime 倒序 |
| `getFeedbackDetail` | 用户 | 返回单条反馈完整字段（含 `reply`, `repliedAt`）；同时将 `isRead` 更新为 true |
| `getAllFeedbacks` | 超管 | 返回全部反馈列表，支持分页（skip/limit），包含 `reply` 状态 |
| `replyFeedback` | 超管 | 写入 `reply` + `repliedAt: serverDate()`；调用前校验 openid 是否在 `superAdmins` 集合 |

**权限校验**：`getAllFeedbacks` 和 `replyFeedback` 在云函数内部查询 `superAdmins` 集合验证调用者身份，非超管返回 `{ success: false, error: 'forbidden' }`。

---

## 自动删除

扩展现有 `clearExpiredData` 云函数，在现有清理逻辑末尾追加：

```js
// 清理已回复超过 30 天的反馈
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
await db.collection('feedbacks')
  .where({
    repliedAt: db.command.lt(thirtyDaysAgo)
  })
  .remove()
```

---

## 路由注册

在 `miniprogram/app.json` 的 `pages` 数组中新增：

```json
"pages/user/feedback-inbox/feedback-inbox",
"pages/user/feedback-detail/feedback-detail",
"pages/superAdmin/feedback-manage/feedback-manage",
"pages/superAdmin/feedback-reply/feedback-reply"
```

超管首页 (`pages/superAdmin/home`) 增加「反馈管理」入口卡片，跳转至 `feedback-manage`。

---

## 范围限制

- 仅展示功能发布后新提交的反馈（历史 `feedbacks` 记录因缺少 `isRead` 字段，查询时过滤 `createTime` 晚于发布时间，或直接展示、由用户自然归零）
- 开发者回复通过超管页面输入，不通过邮件解析
- 不展示开发者邮件地址或任何身份信息，仅展示回复文本

---

## 成功标准

- [ ] 用户在反馈页看到「反馈回信」入口
- [ ] 用户可查看自己所有历史反馈列表（含截断标题和日期）
- [ ] 有回复的反馈在列表显示红点，进入详情后红点消失
- [ ] 详情页底部展示开发者回复，无回复时不渲染该区块
- [ ] 超管可在管理页查看全部反馈并输入/修改回复
- [ ] `clearExpiredData` 定时任务自动删除已回复超 30 天的记录
