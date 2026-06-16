# 反馈回信 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在用户反馈页顶部新增「反馈回信」入口，用户可查看历史反馈及开发者回复；超管可在管理后台查看所有反馈并输入回复。

**Architecture:** 新建云函数 `manageFeedback` 处理所有读写操作，`feedbacks` 集合新增 `reply/repliedAt/isRead` 字段，新建 4 个页面（用户侧 2 个、超管侧 2 个），扩展 `clearExpiredData` 支持自动删除已回复超 30 天的记录。

**Tech Stack:** 微信小程序原生 JS + 微信云开发（云函数 + 云数据库），无外部依赖。

---

## 文件清单

**新建：**
- `miniprogram/cloudfunctions/manageFeedback/index.js`
- `miniprogram/cloudfunctions/manageFeedback/package.json`
- `miniprogram/pages/user/feedback-inbox/feedback-inbox.js`
- `miniprogram/pages/user/feedback-inbox/feedback-inbox.json`
- `miniprogram/pages/user/feedback-inbox/feedback-inbox.wxml`
- `miniprogram/pages/user/feedback-inbox/feedback-inbox.wxss`
- `miniprogram/pages/user/feedback-detail/feedback-detail.js`
- `miniprogram/pages/user/feedback-detail/feedback-detail.json`
- `miniprogram/pages/user/feedback-detail/feedback-detail.wxml`
- `miniprogram/pages/user/feedback-detail/feedback-detail.wxss`
- `miniprogram/pages/superAdmin/feedback-manage/feedback-manage.js`
- `miniprogram/pages/superAdmin/feedback-manage/feedback-manage.json`
- `miniprogram/pages/superAdmin/feedback-manage/feedback-manage.wxml`
- `miniprogram/pages/superAdmin/feedback-manage/feedback-manage.wxss`
- `miniprogram/pages/superAdmin/feedback-reply/feedback-reply.js`
- `miniprogram/pages/superAdmin/feedback-reply/feedback-reply.json`
- `miniprogram/pages/superAdmin/feedback-reply/feedback-reply.wxml`
- `miniprogram/pages/superAdmin/feedback-reply/feedback-reply.wxss`

**修改：**
- `miniprogram/cloudfunctions/clearExpiredData/index.js` — 新增已回复反馈自动删除逻辑
- `miniprogram/app.json` — 注册 4 条新路由
- `miniprogram/pages/user/feedback/feedback.wxml` — 顶部增加「反馈回信」入口
- `miniprogram/pages/user/feedback/feedback.js` — 增加 `goToInbox` 方法
- `miniprogram/pages/user/feedback/feedback.wxss` — 入口按钮样式
- `miniprogram/pages/superAdmin/home/home.wxml` — 增加「反馈管理」功能卡片
- `miniprogram/pages/superAdmin/home/home.js` — 增加 `goToFeedbackManage` 方法

---

## Task 1: 创建 manageFeedback 云函数

**Files:**
- Create: `miniprogram/cloudfunctions/manageFeedback/package.json`
- Create: `miniprogram/cloudfunctions/manageFeedback/index.js`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "manageFeedback",
  "version": "1.0.0",
  "description": "反馈回信管理云函数",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  }
}
```

路径：`miniprogram/cloudfunctions/manageFeedback/package.json`

- [ ] **Step 2: 创建 index.js**

```js
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { action, data } = event
  const { OPENID } = await cloud.getWXContext()

  try {
    switch (action) {
      case 'getMyFeedbacks':
        return await getMyFeedbacks(OPENID)
      case 'getFeedbackDetail':
        return await getFeedbackDetail(OPENID, data)
      case 'getAllFeedbacks':
        await verifySuperAdmin(OPENID)
        return await getAllFeedbacks(data)
      case 'getFeedbackForAdmin':
        await verifySuperAdmin(OPENID)
        return await getFeedbackForAdmin(data)
      case 'replyFeedback':
        await verifySuperAdmin(OPENID)
        return await replyFeedback(data)
      default:
        return { success: false, error: 'Unknown action' }
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// 验证超管身份（phone 字段兼容 string 和 number）
async function verifySuperAdmin(openid) {
  const userRes = await db.collection('users').where({ openid }).get()
  if (userRes.data.length === 0) throw new Error('forbidden')
  const phone = userRes.data[0].phone
  if (!phone) throw new Error('forbidden')

  const saStr = await db.collection('superAdmins').where({ phone: String(phone) }).get()
  if (saStr.data.length > 0) return

  const phoneNum = parseInt(phone, 10)
  if (!isNaN(phoneNum)) {
    const saNum = await db.collection('superAdmins').where({ phone: phoneNum }).get()
    if (saNum.data.length > 0) return
  }

  throw new Error('forbidden')
}

// 用户查询自己的反馈列表
async function getMyFeedbacks(openid) {
  const res = await db.collection('feedbacks')
    .where({ userId: openid })
    .orderBy('createTime', 'desc')
    .get()

  const list = res.data.map(item => ({
    _id: item._id,
    type: item.type,
    title: item.content ? item.content.slice(0, 20) : '',
    createTime: item.createTime,
    hasReply: !!item.reply,
    isRead: item.isRead || false
  }))

  return { success: true, data: list }
}

// 用户查看单条反馈详情，并将 isRead 置 true
async function getFeedbackDetail(openid, data) {
  const { feedbackId } = data || {}
  if (!feedbackId) throw new Error('缺少 feedbackId')

  const res = await db.collection('feedbacks').doc(feedbackId).get()
  const item = res.data

  if (item.userId !== openid) throw new Error('forbidden')

  if (item.reply && !item.isRead) {
    await db.collection('feedbacks').doc(feedbackId).update({
      data: { isRead: true }
    })
  }

  return {
    success: true,
    data: {
      _id: item._id,
      type: item.type,
      content: item.content,
      imageUrls: item.imageUrls || [],
      createTime: item.createTime,
      reply: item.reply || null,
      repliedAt: item.repliedAt || null
    }
  }
}

// 超管查询全部反馈列表（分页）
async function getAllFeedbacks(data) {
  const { skip = 0, limit = 20 } = data || {}

  const res = await db.collection('feedbacks')
    .orderBy('createTime', 'desc')
    .skip(skip)
    .limit(limit)
    .get()

  const countRes = await db.collection('feedbacks').count()

  const list = res.data.map(item => ({
    _id: item._id,
    nickName: item.nickName || '匿名',
    type: item.type,
    title: item.content ? item.content.slice(0, 20) : '',
    createTime: item.createTime,
    hasReply: !!item.reply
  }))

  return { success: true, data: list, total: countRes.total }
}

// 超管查询单条反馈完整内容（用于回复页）
async function getFeedbackForAdmin(data) {
  const { feedbackId } = data || {}
  if (!feedbackId) throw new Error('缺少 feedbackId')

  const res = await db.collection('feedbacks').doc(feedbackId).get()
  const item = res.data

  return {
    success: true,
    data: {
      _id: item._id,
      nickName: item.nickName || '匿名',
      type: item.type,
      content: item.content,
      imageUrls: item.imageUrls || [],
      createTime: item.createTime,
      reply: item.reply || null,
      repliedAt: item.repliedAt || null
    }
  }
}

// 超管写入回复
async function replyFeedback(data) {
  const { feedbackId, reply } = data || {}
  if (!feedbackId || !reply || !reply.trim()) throw new Error('缺少必要参数')

  await db.collection('feedbacks').doc(feedbackId).update({
    data: {
      reply: reply.trim(),
      repliedAt: db.serverDate(),
      isRead: false
    }
  })

  return { success: true }
}
```

路径：`miniprogram/cloudfunctions/manageFeedback/index.js`

- [ ] **Step 3: 语法验证**

```bash
node -c miniprogram/cloudfunctions/manageFeedback/index.js
```

预期输出：`miniprogram/cloudfunctions/manageFeedback/index.js is OK`

- [ ] **Step 4: Commit**

```bash
git add miniprogram/cloudfunctions/manageFeedback/
git commit -m "feat: 新增 manageFeedback 云函数"
```

---

## Task 2: 扩展 clearExpiredData — 自动删除已回复超 30 天的反馈

**Files:**
- Modify: `miniprogram/cloudfunctions/clearExpiredData/index.js`

- [ ] **Step 1: 在 `autoClear` 函数末尾、return 语句前追加删除逻辑**

找到 `autoClear` 函数中的这段代码：

```js
  return {
    success: true,
    data: results,
    message: `自动清理完成：堡垒报名 ${results.registrations} 条，官职配置 ${results.positionConfigs} 条，官职报名 ${results.positionRegistrations} 条，过期时间段 ${results.expiredTimeSlots} 个`
  }
```

替换为：

```js
  // 5. 清理已回复超过 30 天的反馈
  const feedbackResult = await db.collection('feedbacks').where({
    repliedAt: _.lt(thirtyDaysAgo)
  }).remove()
  results.repliedFeedbacks = feedbackResult.stats.removed

  return {
    success: true,
    data: results,
    message: `自动清理完成：堡垒报名 ${results.registrations} 条，官职配置 ${results.positionConfigs} 条，官职报名 ${results.positionRegistrations} 条，过期时间段 ${results.expiredTimeSlots} 个，已回复反馈 ${results.repliedFeedbacks} 条`
  }
```

- [ ] **Step 2: 语法验证**

```bash
node -c miniprogram/cloudfunctions/clearExpiredData/index.js
```

预期输出：`miniprogram/cloudfunctions/clearExpiredData/index.js is OK`

- [ ] **Step 3: Commit**

```bash
git add miniprogram/cloudfunctions/clearExpiredData/index.js
git commit -m "feat: 扩展 clearExpiredData，自动删除已回复超30天的反馈"
```

---

## Task 3: 注册新路由 + 修改反馈页入口

**Files:**
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/pages/user/feedback/feedback.wxml`
- Modify: `miniprogram/pages/user/feedback/feedback.js`
- Modify: `miniprogram/pages/user/feedback/feedback.wxss`

- [ ] **Step 1: 在 app.json 的 pages 数组中，在 `pages/user/feedback/feedback` 这行后面插入 4 条新路由**

```json
"pages/user/feedback-inbox/feedback-inbox",
"pages/user/feedback-detail/feedback-detail",
"pages/superAdmin/feedback-manage/feedback-manage",
"pages/superAdmin/feedback-reply/feedback-reply",
```

- [ ] **Step 2: 在 feedback.wxml 的 `<view class="header">` 块后面、`<view class="form">` 前面插入入口按钮**

```wxml
  <!-- 反馈回信入口 -->
  <view class="inbox-entry" bindtap="goToInbox">
    <text class="inbox-text">反馈回信</text>
    <text class="inbox-arrow">›</text>
  </view>
```

完整位置（在 `</view>` 闭合 header 之后）：

```wxml
  <view class="header">
    <text class="title">意见与建议</text>
    <text class="hint">您的反馈帮助我们做得更好</text>
  </view>

  <!-- 反馈回信入口 -->
  <view class="inbox-entry" bindtap="goToInbox">
    <text class="inbox-text">反馈回信</text>
    <text class="inbox-arrow">›</text>
  </view>

  <view class="form">
```

- [ ] **Step 3: 在 feedback.js 中追加 `goToInbox` 方法（在 `onSubmit` 方法后面）**

```js
  goToInbox: function () {
    wx.navigateTo({
      url: '/pages/user/feedback-inbox/feedback-inbox'
    })
  }
```

- [ ] **Step 4: 在 feedback.wxss 末尾追加入口样式**

```css
.inbox-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-radius: 12rpx;
  padding: 24rpx 30rpx;
  margin-bottom: 20rpx;
}

.inbox-text {
  font-size: 28rpx;
  color: #4A90D9;
  font-weight: 500;
}

.inbox-arrow {
  font-size: 32rpx;
  color: #4A90D9;
}
```

- [ ] **Step 5: 语法验证**

```bash
node -c miniprogram/pages/user/feedback/feedback.js
```

预期输出：`miniprogram/pages/user/feedback/feedback.js is OK`

- [ ] **Step 6: Commit**

```bash
git add miniprogram/app.json miniprogram/pages/user/feedback/
git commit -m "feat: 注册新路由，反馈页添加反馈回信入口"
```

---

## Task 4: 创建 feedback-inbox 页（用户反馈列表）

**Files:**
- Create: `miniprogram/pages/user/feedback-inbox/feedback-inbox.json`
- Create: `miniprogram/pages/user/feedback-inbox/feedback-inbox.wxml`
- Create: `miniprogram/pages/user/feedback-inbox/feedback-inbox.wxss`
- Create: `miniprogram/pages/user/feedback-inbox/feedback-inbox.js`

- [ ] **Step 1: 创建 feedback-inbox.json**

```json
{
  "navigationBarTitleText": "反馈回信",
  "usingComponents": {}
}
```

- [ ] **Step 2: 创建 feedback-inbox.wxml**

```wxml
<!--pages/user/feedback-inbox/feedback-inbox.wxml-->
<view class="page">
  <view wx:if="{{loading}}" class="loading-state">
    <text class="loading-text">加载中...</text>
  </view>

  <view wx:elif="{{feedbacks.length === 0}}" class="empty-state">
    <text class="empty-text">暂无反馈记录</text>
  </view>

  <view wx:else class="feedback-list">
    <view
      class="feedback-item"
      wx:for="{{feedbacks}}"
      wx:key="_id"
      bindtap="goToDetail"
      data-id="{{item._id}}"
    >
      <view class="item-main">
        <text class="item-title">{{item.title}}{{item.titleTruncated ? '...' : ''}}</text>
        <text class="item-date">{{item.createTimeStr}}</text>
      </view>
      <view wx:if="{{item.hasReply && !item.isRead}}" class="red-dot"></view>
    </view>
  </view>
</view>
```

- [ ] **Step 3: 创建 feedback-inbox.wxss**

```css
/* pages/user/feedback-inbox/feedback-inbox.wxss */
.page {
  padding: 20rpx 30rpx;
  min-height: 100vh;
  background: #f5f7fa;
}

.loading-state,
.empty-state {
  display: flex;
  justify-content: center;
  padding-top: 120rpx;
}

.loading-text,
.empty-text {
  font-size: 28rpx;
  color: #999;
}

.feedback-list {
  background: #fff;
  border-radius: 12rpx;
  overflow: hidden;
}

.feedback-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28rpx 30rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.feedback-item:last-child {
  border-bottom: none;
}

.item-main {
  flex: 1;
  margin-right: 16rpx;
}

.item-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #333;
  display: block;
  margin-bottom: 8rpx;
}

.item-date {
  font-size: 22rpx;
  color: #999;
  display: block;
}

.red-dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  background: #FF6B6B;
  flex-shrink: 0;
}
```

- [ ] **Step 4: 创建 feedback-inbox.js**

```js
// pages/user/feedback-inbox/feedback-inbox.js
const app = getApp()
const util = require('../../../utils/util')

Page({
  data: {
    feedbacks: [],
    loading: true
  },

  onLoad: function () {
    this.loadFeedbacks()
  },

  onShow: function () {
    this.loadFeedbacks()
  },

  loadFeedbacks: async function () {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageFeedback',
        data: { action: 'getMyFeedbacks' }
      })
      if (!res.result.success) throw new Error(res.result.error)

      const list = res.result.data.map(item => ({
        ...item,
        title: item.title,
        titleTruncated: item.title.length === 20,
        createTimeStr: util.formatDate(item.createTime, 'MM-DD HH:mm')
      }))

      this.setData({ feedbacks: list, loading: false })
    } catch (err) {
      console.error('加载反馈列表失败:', err)
      util.showError('加载失败')
      this.setData({ loading: false })
    }
  },

  goToDetail: function (e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/user/feedback-detail/feedback-detail?feedbackId=${id}`
    })
  }
})
```

- [ ] **Step 5: 语法验证**

```bash
node -c miniprogram/pages/user/feedback-inbox/feedback-inbox.js
```

预期输出：`miniprogram/pages/user/feedback-inbox/feedback-inbox.js is OK`

- [ ] **Step 6: Commit**

```bash
git add miniprogram/pages/user/feedback-inbox/
git commit -m "feat: 新增反馈回信列表页"
```

---

## Task 5: 创建 feedback-detail 页（用户反馈详情）

**Files:**
- Create: `miniprogram/pages/user/feedback-detail/feedback-detail.json`
- Create: `miniprogram/pages/user/feedback-detail/feedback-detail.wxml`
- Create: `miniprogram/pages/user/feedback-detail/feedback-detail.wxss`
- Create: `miniprogram/pages/user/feedback-detail/feedback-detail.js`

- [ ] **Step 1: 创建 feedback-detail.json**

```json
{
  "navigationBarTitleText": "反馈详情",
  "usingComponents": {}
}
```

- [ ] **Step 2: 创建 feedback-detail.wxml**

```wxml
<!--pages/user/feedback-detail/feedback-detail.wxml-->
<view class="page">
  <view wx:if="{{loading}}" class="loading-state">
    <text class="loading-text">加载中...</text>
  </view>

  <view wx:elif="{{detail}}" class="content">
    <!-- 原始反馈 -->
    <view class="feedback-card">
      <view class="type-tag">{{detail.type}}</view>
      <text class="feedback-content">{{detail.content}}</text>
      <view wx:if="{{detail.imageUrls.length > 0}}" class="image-list">
        <image
          wx:for="{{detail.imageUrls}}"
          wx:key="index"
          src="{{item}}"
          mode="aspectFill"
          class="feedback-img"
          bindtap="previewImage"
          data-url="{{item}}"
        />
      </view>
      <text class="meta-date">{{detail.createTimeStr}}</text>
    </view>

    <!-- 开发者回复（有回复才渲染） -->
    <view wx:if="{{detail.reply}}" class="reply-card">
      <text class="reply-label">开发者回复</text>
      <text class="reply-content">{{detail.reply}}</text>
      <text class="reply-date">{{detail.repliedAtStr}}</text>
    </view>
  </view>
</view>
```

- [ ] **Step 3: 创建 feedback-detail.wxss**

```css
/* pages/user/feedback-detail/feedback-detail.wxss */
.page {
  padding: 20rpx 30rpx;
  min-height: 100vh;
  background: #f5f7fa;
}

.loading-state {
  display: flex;
  justify-content: center;
  padding-top: 120rpx;
}

.loading-text {
  font-size: 28rpx;
  color: #999;
}

.feedback-card {
  background: #fff;
  border-radius: 12rpx;
  padding: 30rpx;
  margin-bottom: 20rpx;
}

.type-tag {
  display: inline-block;
  font-size: 22rpx;
  color: #4A90D9;
  background: #e8f0fd;
  border-radius: 8rpx;
  padding: 4rpx 16rpx;
  margin-bottom: 16rpx;
}

.feedback-content {
  font-size: 28rpx;
  color: #333;
  line-height: 1.7;
  display: block;
  margin-bottom: 20rpx;
}

.image-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-bottom: 20rpx;
}

.feedback-img {
  width: 180rpx;
  height: 180rpx;
  border-radius: 8rpx;
}

.meta-date {
  font-size: 22rpx;
  color: #999;
  display: block;
}

.reply-card {
  background: #fff;
  border-radius: 12rpx;
  padding: 30rpx;
  border-left: 6rpx solid #4A90D9;
}

.reply-label {
  font-size: 24rpx;
  color: #4A90D9;
  font-weight: 600;
  display: block;
  margin-bottom: 12rpx;
}

.reply-content {
  font-size: 28rpx;
  color: #333;
  line-height: 1.7;
  display: block;
  margin-bottom: 16rpx;
}

.reply-date {
  font-size: 22rpx;
  color: #999;
  display: block;
}
```

- [ ] **Step 4: 创建 feedback-detail.js**

```js
// pages/user/feedback-detail/feedback-detail.js
const util = require('../../../utils/util')

Page({
  data: {
    detail: null,
    loading: true
  },

  onLoad: function (options) {
    const feedbackId = options.feedbackId
    if (!feedbackId) {
      util.showError('参数错误')
      wx.navigateBack()
      return
    }
    this.loadDetail(feedbackId)
  },

  loadDetail: async function (feedbackId) {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageFeedback',
        data: { action: 'getFeedbackDetail', data: { feedbackId } }
      })
      if (!res.result.success) throw new Error(res.result.error)

      const item = res.result.data
      this.setData({
        detail: {
          ...item,
          createTimeStr: util.formatDate(item.createTime, 'YYYY-MM-DD HH:mm'),
          repliedAtStr: item.repliedAt ? util.formatDate(item.repliedAt, 'YYYY-MM-DD HH:mm') : ''
        },
        loading: false
      })
    } catch (err) {
      console.error('加载反馈详情失败:', err)
      util.showError('加载失败')
      this.setData({ loading: false })
    }
  },

  previewImage: function (e) {
    const url = e.currentTarget.dataset.url
    wx.previewImage({
      current: url,
      urls: this.data.detail.imageUrls
    })
  }
})
```

- [ ] **Step 5: 语法验证**

```bash
node -c miniprogram/pages/user/feedback-detail/feedback-detail.js
```

预期输出：`miniprogram/pages/user/feedback-detail/feedback-detail.js is OK`

- [ ] **Step 6: Commit**

```bash
git add miniprogram/pages/user/feedback-detail/
git commit -m "feat: 新增反馈详情页（含开发者回复展示）"
```

---

## Task 6: 创建 feedback-manage 页（超管反馈列表）

**Files:**
- Create: `miniprogram/pages/superAdmin/feedback-manage/feedback-manage.json`
- Create: `miniprogram/pages/superAdmin/feedback-manage/feedback-manage.wxml`
- Create: `miniprogram/pages/superAdmin/feedback-manage/feedback-manage.wxss`
- Create: `miniprogram/pages/superAdmin/feedback-manage/feedback-manage.js`

- [ ] **Step 1: 创建 feedback-manage.json**

```json
{
  "navigationBarTitleText": "反馈管理",
  "usingComponents": {}
}
```

- [ ] **Step 2: 创建 feedback-manage.wxml**

```wxml
<!--pages/superAdmin/feedback-manage/feedback-manage.wxml-->
<view class="page">
  <view wx:if="{{loading}}" class="loading-state">
    <text class="loading-text">加载中...</text>
  </view>

  <view wx:elif="{{feedbacks.length === 0}}" class="empty-state">
    <text class="empty-text">暂无反馈</text>
  </view>

  <view wx:else class="feedback-list">
    <view
      class="feedback-item"
      wx:for="{{feedbacks}}"
      wx:key="_id"
      bindtap="goToReply"
      data-id="{{item._id}}"
    >
      <view class="item-header">
        <text class="item-nick">{{item.nickName}}</text>
        <view class="type-tag">{{item.type}}</view>
        <view wx:if="{{item.hasReply}}" class="replied-tag">已回复</view>
      </view>
      <text class="item-title">{{item.title}}{{item.titleTruncated ? '...' : ''}}</text>
      <text class="item-date">{{item.createTimeStr}}</text>
    </view>
  </view>

  <view wx:if="{{hasMore}}" class="load-more" bindtap="loadMore">
    <text class="load-more-text">加载更多</text>
  </view>
</view>
```

- [ ] **Step 3: 创建 feedback-manage.wxss**

```css
/* pages/superAdmin/feedback-manage/feedback-manage.wxss */
.page {
  padding: 20rpx 30rpx;
  min-height: 100vh;
  background: #f5f7fa;
}

.loading-state,
.empty-state {
  display: flex;
  justify-content: center;
  padding-top: 120rpx;
}

.loading-text,
.empty-text {
  font-size: 28rpx;
  color: #999;
}

.feedback-list {
  background: #fff;
  border-radius: 12rpx;
  overflow: hidden;
}

.feedback-item {
  padding: 24rpx 30rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.feedback-item:last-child {
  border-bottom: none;
}

.item-header {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 10rpx;
}

.item-nick {
  font-size: 24rpx;
  color: #666;
}

.type-tag {
  font-size: 20rpx;
  color: #4A90D9;
  background: #e8f0fd;
  border-radius: 8rpx;
  padding: 2rpx 12rpx;
}

.replied-tag {
  font-size: 20rpx;
  color: #52C41A;
  background: #f0fff0;
  border-radius: 8rpx;
  padding: 2rpx 12rpx;
}

.item-title {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
  display: block;
  margin-bottom: 8rpx;
}

.item-date {
  font-size: 22rpx;
  color: #999;
  display: block;
}

.load-more {
  display: flex;
  justify-content: center;
  padding: 30rpx;
}

.load-more-text {
  font-size: 26rpx;
  color: #4A90D9;
}
```

- [ ] **Step 4: 创建 feedback-manage.js**

```js
// pages/superAdmin/feedback-manage/feedback-manage.js
const app = getApp()
const util = require('../../../utils/util')
const auth = require('../../../utils/auth')

const PAGE_SIZE = 20

Page({
  data: {
    feedbacks: [],
    loading: true,
    hasMore: false,
    skip: 0
  },

  onLoad: function () {
    this.waitForRoleReady()
  },

  onShow: function () {
    if (app.globalData.roleReady) {
      this.resetAndLoad()
    }
  },

  waitForRoleReady: function () {
    if (app.globalData.roleReady) {
      this.checkPermission()
    } else {
      setTimeout(() => this.waitForRoleReady(), 100)
    }
  },

  checkPermission: function () {
    const role = app.globalData.role || 'user'
    if (!auth.isSuperAdmin(role)) {
      util.showError('权限不足')
      wx.switchTab({ url: '/pages/index/index' })
      return
    }
    this.loadFeedbacks(0)
  },

  resetAndLoad: function () {
    this.setData({ feedbacks: [], skip: 0 })
    this.loadFeedbacks(0)
  },

  loadFeedbacks: async function (skip) {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageFeedback',
        data: { action: 'getAllFeedbacks', data: { skip, limit: PAGE_SIZE } }
      })
      if (!res.result.success) throw new Error(res.result.error)

      const newItems = res.result.data.map(item => ({
        ...item,
        titleTruncated: item.title.length === 20,
        createTimeStr: util.formatDate(item.createTime, 'MM-DD HH:mm')
      }))

      const feedbacks = skip === 0 ? newItems : [...this.data.feedbacks, ...newItems]
      const nextSkip = skip + newItems.length

      this.setData({
        feedbacks,
        skip: nextSkip,
        hasMore: nextSkip < res.result.total,
        loading: false
      })
    } catch (err) {
      console.error('加载反馈列表失败:', err)
      util.showError('加载失败')
      this.setData({ loading: false })
    }
  },

  loadMore: function () {
    this.loadFeedbacks(this.data.skip)
  },

  goToReply: function (e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/superAdmin/feedback-reply/feedback-reply?feedbackId=${id}`
    })
  }
})
```

- [ ] **Step 5: 语法验证**

```bash
node -c miniprogram/pages/superAdmin/feedback-manage/feedback-manage.js
```

预期输出：`miniprogram/pages/superAdmin/feedback-manage/feedback-manage.js is OK`

- [ ] **Step 6: Commit**

```bash
git add miniprogram/pages/superAdmin/feedback-manage/
git commit -m "feat: 新增超管反馈管理列表页"
```

---

## Task 7: 创建 feedback-reply 页（超管回复页）

**Files:**
- Create: `miniprogram/pages/superAdmin/feedback-reply/feedback-reply.json`
- Create: `miniprogram/pages/superAdmin/feedback-reply/feedback-reply.wxml`
- Create: `miniprogram/pages/superAdmin/feedback-reply/feedback-reply.wxss`
- Create: `miniprogram/pages/superAdmin/feedback-reply/feedback-reply.js`

- [ ] **Step 1: 创建 feedback-reply.json**

```json
{
  "navigationBarTitleText": "回复反馈",
  "usingComponents": {}
}
```

- [ ] **Step 2: 创建 feedback-reply.wxml**

```wxml
<!--pages/superAdmin/feedback-reply/feedback-reply.wxml-->
<view class="page">
  <view wx:if="{{loading}}" class="loading-state">
    <text class="loading-text">加载中...</text>
  </view>

  <view wx:elif="{{detail}}" class="content">
    <!-- 原始反馈（只读） -->
    <view class="original-card">
      <view class="original-header">
        <text class="nick">{{detail.nickName}}</text>
        <view class="type-tag">{{detail.type}}</view>
      </view>
      <text class="original-content">{{detail.content}}</text>
      <text class="meta-date">{{detail.createTimeStr}}</text>
    </view>

    <!-- 回复表单 -->
    <view class="reply-form">
      <text class="form-label">回复内容</text>
      <textarea
        class="reply-input"
        placeholder="输入回复内容..."
        maxlength="500"
        bindinput="onReplyInput"
        value="{{replyText}}"
        auto-height
      />
      <text class="char-count">{{replyText.length}}/500</text>
    </view>

    <button class="btn-submit" bindtap="onSubmit" loading="{{submitting}}" disabled="{{submitting}}">发送回复</button>
  </view>
</view>
```

- [ ] **Step 3: 创建 feedback-reply.wxss**

```css
/* pages/superAdmin/feedback-reply/feedback-reply.wxss */
.page {
  padding: 20rpx 30rpx;
  min-height: 100vh;
  background: #f5f7fa;
}

.loading-state {
  display: flex;
  justify-content: center;
  padding-top: 120rpx;
}

.loading-text {
  font-size: 28rpx;
  color: #999;
}

.original-card {
  background: #fff;
  border-radius: 12rpx;
  padding: 30rpx;
  margin-bottom: 20rpx;
}

.original-header {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 16rpx;
}

.nick {
  font-size: 26rpx;
  color: #666;
}

.type-tag {
  font-size: 20rpx;
  color: #4A90D9;
  background: #e8f0fd;
  border-radius: 8rpx;
  padding: 2rpx 12rpx;
}

.original-content {
  font-size: 28rpx;
  color: #333;
  line-height: 1.7;
  display: block;
  margin-bottom: 16rpx;
}

.meta-date {
  font-size: 22rpx;
  color: #999;
  display: block;
}

.reply-form {
  background: #fff;
  border-radius: 12rpx;
  padding: 30rpx;
  margin-bottom: 30rpx;
}

.form-label {
  font-size: 26rpx;
  color: #333;
  font-weight: 500;
  display: block;
  margin-bottom: 16rpx;
}

.reply-input {
  width: 100%;
  min-height: 160rpx;
  font-size: 28rpx;
  color: #333;
  line-height: 1.6;
  border: 1rpx solid #e0e0e0;
  border-radius: 8rpx;
  padding: 16rpx;
  box-sizing: border-box;
}

.char-count {
  font-size: 22rpx;
  color: #999;
  display: block;
  text-align: right;
  margin-top: 8rpx;
}

.btn-submit {
  background: #4A90D9;
  color: #fff;
  border-radius: 12rpx;
  font-size: 30rpx;
  width: 100%;
}
```

- [ ] **Step 4: 创建 feedback-reply.js**

```js
// pages/superAdmin/feedback-reply/feedback-reply.js
const util = require('../../../utils/util')

Page({
  data: {
    detail: null,
    replyText: '',
    submitting: false,
    loading: true
  },

  onLoad: function (options) {
    const feedbackId = options.feedbackId
    if (!feedbackId) {
      util.showError('参数错误')
      wx.navigateBack()
      return
    }
    this.feedbackId = feedbackId
    this.loadDetail(feedbackId)
  },

  loadDetail: async function (feedbackId) {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageFeedback',
        data: { action: 'getFeedbackForAdmin', data: { feedbackId } }
      })
      if (!res.result.success) throw new Error(res.result.error)

      const item = res.result.data
      this.setData({
        detail: {
          ...item,
          createTimeStr: util.formatDate(item.createTime, 'YYYY-MM-DD HH:mm')
        },
        replyText: item.reply || '',
        loading: false
      })
    } catch (err) {
      console.error('加载反馈详情失败:', err)
      util.showError('加载失败')
      this.setData({ loading: false })
    }
  },

  onReplyInput: function (e) {
    this.setData({ replyText: e.detail.value })
  },

  onSubmit: async function () {
    const reply = this.data.replyText.trim()
    if (!reply) {
      util.showError('请输入回复内容')
      return
    }

    this.setData({ submitting: true })
    util.showLoading('提交中...')

    try {
      const res = await wx.cloud.callFunction({
        name: 'manageFeedback',
        data: {
          action: 'replyFeedback',
          data: { feedbackId: this.feedbackId, reply }
        }
      })
      if (!res.result.success) throw new Error(res.result.error)

      util.hideLoading()
      util.showSuccess('回复成功')
      setTimeout(() => wx.navigateBack(), 1500)
    } catch (err) {
      util.hideLoading()
      console.error('回复失败:', err)
      util.showError('回复失败')
    } finally {
      this.setData({ submitting: false })
    }
  }
})
```

- [ ] **Step 5: 语法验证**

```bash
node -c miniprogram/pages/superAdmin/feedback-reply/feedback-reply.js
```

预期输出：`miniprogram/pages/superAdmin/feedback-reply/feedback-reply.js is OK`

- [ ] **Step 6: Commit**

```bash
git add miniprogram/pages/superAdmin/feedback-reply/
git commit -m "feat: 新增超管回复页"
```

---

## Task 8: 超管首页增加「反馈管理」入口

**Files:**
- Modify: `miniprogram/pages/superAdmin/home/home.wxml`
- Modify: `miniprogram/pages/superAdmin/home/home.js`

- [ ] **Step 1: 在 home.wxml 的「统计数据」section 末尾追加「反馈管理」卡片**

找到这段代码：

```wxml
  <!-- 统计数据 -->
  <view class="section-header mt-24">
    <text class="section-title">统计数据</text>
  </view>
  <view class="function-grid">
    <view class="function-card-compact" bindtap="goToAllStats">
```

在「统计数据」`function-grid` 的最后一个卡片（`goToAutoClear`）后面追加：

```wxml
    <view class="function-card-compact" bindtap="goToFeedbackManage">
      <view class="function-content">
        <text class="function-name">反馈管理</text>
        <text class="function-desc">查看并回复用户反馈</text>
      </view>
    </view>
```

- [ ] **Step 2: 在 home.js 末尾（`onShareAppMessage` 之前）追加跳转方法**

```js
  goToFeedbackManage: function () {
    wx.navigateTo({
      url: '/pages/superAdmin/feedback-manage/feedback-manage'
    })
  },
```

- [ ] **Step 3: 语法验证**

```bash
node -c miniprogram/pages/superAdmin/home/home.js
```

预期输出：`miniprogram/pages/superAdmin/home/home.js is OK`

- [ ] **Step 4: Commit**

```bash
git add miniprogram/pages/superAdmin/home/
git commit -m "feat: 超管首页新增反馈管理入口"
```

---

## 验收清单

在微信开发者工具中手动验证：

**用户侧：**
- [ ] 打开「意见与反馈」页，顶部看到「反馈回信 ›」按钮
- [ ] 点击进入反馈回信列表，无反馈时显示"暂无反馈记录"
- [ ] 提交一条反馈后，列表出现该条记录，显示截断标题和日期
- [ ] 点击进入详情，能看到完整反馈内容，无回复时不显示回复区块

**超管侧：**
- [ ] 超管首页「统计数据」区域看到「反馈管理」卡片
- [ ] 进入反馈管理，能看到所有用户提交的反馈列表
- [ ] 点击某条反馈进入回复页，能看到原始内容
- [ ] 填写回复内容，点击「发送回复」，返回列表该条变为「已回复」标签
- [ ] 用户端进入该条反馈详情，底部显示「开发者回复」区块和回复内容
- [ ] 用户进入详情后，列表页红点消失

**云函数：**
- [ ] 在微信开发者工具中上传并部署 `manageFeedback` 云函数
- [ ] 验证非超管调用 `getAllFeedbacks` 返回 `{ success: false, error: 'forbidden' }`
