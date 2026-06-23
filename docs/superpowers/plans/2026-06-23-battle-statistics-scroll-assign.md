# 国战统计表优化（横向滚动 + 批量分配）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统计表表头与内容同步横向滚动（类 Excel）；移除清空全部；新增批量分配功能（选中车身 → 选择车头 → 批量赋值）；车头行灰色不可选。

**Architecture:** 纯前端改动，无云函数/DB schema 变更。分两个任务：Task 1 处理滚动修复和车头行视觉（WXML+WXSS），Task 2 处理 action bar 改动和批量分配逻辑（WXML+JS+WXSS 小补丁）。

**Tech Stack:** 微信小程序（WXML/WXSS/JS），`wx.showActionSheet` 实现车头选择弹出，`db.updateBattleRegistrationAssignment` 更新分配字段。

## Global Constraints

- 不使用 `*` CSS 选择器
- 不修改云函数文件
- 车头行（`position === '车头'`）：checkbox 禁用，背景灰色，文字浅色
- 全选只选中车身行
- 批量分配：仅对已选中的车身行生效；无车头时提示
- 移除 `清空全部` 按钮及其 JS 逻辑（`onClearAll`、`isSuperAdmin` data 字段、`auth` require）
- `分配` 按钮的显示条件与 `删除选中` 相同：`canDeleteRegistration`
- 滚动修复：移除 `.table-header` 的 `position: sticky`，移除 `.col-assignment` 的 `position: sticky`，表头和内容在同一 scroll-view 内自然同步横向滚动

---

## 改动文件清单

| 文件 | 操作 |
|------|------|
| `miniprogram/pages/user/battle-statistics/battle-statistics.wxml` | 修改 — 表头/行去 sticky；车头行加 class；checkbox 加 disabled；action bar 改动 |
| `miniprogram/pages/user/battle-statistics/battle-statistics.wxss` | 修改 — 去除 sticky 样式；更新 min-width；新增 row-head、btn-assign 样式；移除不再需要的 z-index 覆盖 |
| `miniprogram/pages/user/battle-statistics/battle-statistics.js` | 修改 — 移除 isSuperAdmin/auth/onClearAll；更新 onSelectAll；更新 onSlotCheckChange；新增 onBatchAssign |

---

## Task 1：横向滚动修复 + 车头行视觉（WXML + WXSS）

**Files:**
- Modify: `miniprogram/pages/user/battle-statistics/battle-statistics.wxml`
- Modify: `miniprogram/pages/user/battle-statistics/battle-statistics.wxss`

**Interfaces:**
- Produces: `row-head` CSS class（Task 2 中 JS `onSelectAll`/`onSlotCheckChange` 逻辑依赖 `position === '车头'` 判断，与本任务视觉完全独立）

---

- [ ] **Step 1：修复横向滚动 — battle-statistics.wxss**

**原因：** WeChat Mini Program scroll-view 同时开启 `scroll-x scroll-y` 时，`position: sticky; top: 0` 会导致表头不跟随横向滚动。需去除，改为表头与内容一起在 scroll-view 内自然滚动。同理去除 `col-assignment` 的右侧 sticky，避免表头与内容列不对齐。

将 `.table-header` 规则替换为：

```css
.table-header {
  display: flex;
  background: #4A90D9;
  color: #fff;
  font-size: 24rpx;
  min-width: 1100rpx;
}
```

（删除 `position: sticky; top: 0; z-index: 10;`，将 `min-width` 从 750rpx 改为 1100rpx）

将 `.table-row` 规则替换为：

```css
.table-row {
  display: flex;
  border-bottom: 1rpx solid #f0f0f0;
  font-size: 24rpx;
  min-width: 1100rpx;
}
```

（`min-width` 从 750rpx 改为 1100rpx）

将 `.table-body` 规则替换为：

```css
.table-body {
  width: 100%;
  max-height: 800rpx;
}
```

（删除 `min-width: 750rpx`，改为 `width: 100%`）

将 `.col-assignment` 规则替换为：

```css
.col-assignment {
  width: 140rpx;
}
```

（删除 `position: sticky; right: 0; z-index: 5; background: #fff;`）

删除以下两个现在无用的规则（它们是为 sticky col-assignment 服务的）：

```css
/* 删除这两条规则 */
.table-header .col-assignment {
  background: #4A90D9;
  z-index: 15;
}

.table-row:nth-child(even) .col-assignment {
  background: #fafbfc;
}
```

- [ ] **Step 2：新增 row-head 和 row-body 样式 — battle-statistics.wxss**

在 `.table-row:nth-child(even)` 后新增：

```css
.row-head {
  background: #f0f0f0;
  color: #bbb;
}

.row-head .col {
  color: #bbb;
}
```

同时保留 `.btn-clear` 规则暂不动（Task 2 会处理 action bar）。

- [ ] **Step 3：给车头行加 class，给 checkbox 加 disabled — battle-statistics.wxml**

将 `<view class="table-row" wx:for="{{registrations}}" wx:key="_id">` 改为：

```xml
<view class="table-row {{item.position === '车头' ? 'row-head' : ''}}" wx:for="{{registrations}}" wx:key="_id">
```

将 checkbox 改为：

```xml
<checkbox-group bindchange="onSlotCheckChange" data-index="{{index}}">
  <checkbox value="{{item._id}}" checked="{{item.selected}}" disabled="{{item.position === '车头'}}" />
</checkbox-group>
```

- [ ] **Step 4：语法校验**

```bash
node -c miniprogram/pages/user/battle-statistics/battle-statistics.wxml 2>/dev/null || echo "WXML skip (not JS)"
```

目视检查 WXML 标签闭合无误。在微信开发者工具确认无编译报错。

- [ ] **Step 5：Commit**

```bash
git add miniprogram/pages/user/battle-statistics/battle-statistics.wxml
git add miniprogram/pages/user/battle-statistics/battle-statistics.wxss
git commit -m "fix: 统计表横向滚动修复，车头行灰色禁选样式"
```

---

## Task 2：Action Bar 改动 + 批量分配逻辑（WXML + JS + WXSS）

**Files:**
- Modify: `miniprogram/pages/user/battle-statistics/battle-statistics.wxml`
- Modify: `miniprogram/pages/user/battle-statistics/battle-statistics.js`
- Modify: `miniprogram/pages/user/battle-statistics/battle-statistics.wxss`

**Interfaces:**
- Consumes: Task 1 产出的 `row-head` class（不直接依赖，仅共享同文件）
- Consumes: `db.updateBattleRegistrationAssignment(id, headName)` — 已存在于 `miniprogram/utils/db.js`
- Consumes: `headNickNames: []` — 已在 `loadRegistrations` 中计算，无需改动

---

- [ ] **Step 1：更新 action bar WXML — battle-statistics.wxml**

将以下 action bar 内容：

```xml
<view class="action-bar">
  <view class="btn-select-all" wx:if="{{canDeleteRegistration}}" bindtap="onSelectAll">
    {{selectAllChecked ? '取消全选' : '全选'}}
  </view>
  <view class="btn btn-delete" wx:if="{{canDeleteRegistration}}" bindtap="onDeleteSelected">删除选中</view>
  <view class="btn btn-clear" wx:if="{{isSuperAdmin}}" bindtap="onClearAll">清空全部</view>
  <view class="btn btn-save" bindtap="onSaveScreenshot">保存截图</view>
</view>
```

替换为：

```xml
<view class="action-bar">
  <view class="btn-select-all" wx:if="{{canDeleteRegistration}}" bindtap="onSelectAll">
    {{selectAllChecked ? '取消全选' : '全选'}}
  </view>
  <view class="btn btn-delete" wx:if="{{canDeleteRegistration}}" bindtap="onDeleteSelected">删除选中</view>
  <view class="btn btn-assign" wx:if="{{canDeleteRegistration}}" bindtap="onBatchAssign">分配</view>
  <view class="btn btn-save" bindtap="onSaveScreenshot">保存截图</view>
</view>
```

- [ ] **Step 2：新增 btn-assign 样式 + 移除 btn-clear — battle-statistics.wxss**

将 `.btn-clear { background: #999; }` 替换为：

```css
.btn-assign {
  background: #FA8C16;
}
```

- [ ] **Step 3：清理 JS — battle-statistics.js**

**3a** — 删除顶部的 `const auth = require('../../../utils/auth')` 行（`auth` 仅在 `onClearAll` 中使用）。

**3b** — 在 `data: { ... }` 中删除 `isSuperAdmin: false,` 一行。

**3c** — 在 `onLoad` 中删除以下行：
```js
isSuperAdmin: app.globalData.role === 'superAdmin',
```

**3d** — 删除整个 `onClearAll` 函数（从 `onClearAll: async function ()` 到其对应的结束 `},` 包含在内）。

- [ ] **Step 4：更新 onSelectAll — 只选车身行**

将现有 `onSelectAll` 函数替换为：

```js
onSelectAll: function () {
  const checked = !this.data.selectAllChecked
  const registrations = this.data.registrations.map(r => ({
    ...r,
    selected: checked && r.position !== '车头'
  }))
  const selectedIds = checked
    ? registrations.filter(r => r.selected).map(r => r._id)
    : []
  const bodyCount = registrations.filter(r => r.position !== '车头').length
  const selectAllChecked = bodyCount > 0 && selectedIds.length === bodyCount

  this.setData({
    registrations,
    selectAllChecked,
    selectedIds
  })
},
```

- [ ] **Step 5：更新 onSlotCheckChange — 防止选中车头**

将现有 `onSlotCheckChange` 函数替换为：

```js
onSlotCheckChange: function (e) {
  const index = e.currentTarget.dataset.index
  const item = this.data.registrations[index]
  if (item.position === '车头') return

  const value = e.detail.value
  const selected = value.length > 0

  const registrations = this.data.registrations.map((r, i) =>
    i === index ? { ...r, selected } : r
  )

  const selectedIds = registrations.filter(r => r.selected).map(r => r._id)
  const bodyCount = registrations.filter(r => r.position !== '车头').length
  const selectAllChecked = bodyCount > 0 && selectedIds.length === bodyCount

  this.setData({
    registrations,
    selectedIds,
    selectAllChecked
  })
},
```

- [ ] **Step 6：新增 onBatchAssign 函数**

在 `onSaveScreenshot` 函数前插入：

```js
onBatchAssign: function () {
  const bodyIds = this.data.selectedIds.filter(id => {
    const reg = this.data.registrations.find(r => r._id === id)
    return reg && reg.position !== '车头'
  })

  if (bodyIds.length === 0) {
    util.showInfo('请先勾选车身报名者')
    return
  }

  if (this.data.headNickNames.length === 0) {
    util.showInfo('暂无车头可分配')
    return
  }

  wx.showActionSheet({
    itemList: this.data.headNickNames,
    success: async (res) => {
      const headName = this.data.headNickNames[res.tapIndex]
      try {
        util.showLoading('分配中...')
        for (const id of bodyIds) {
          await db.updateBattleRegistrationAssignment(id, headName)
        }
        util.hideLoading()
        util.showSuccess(`已将 ${bodyIds.length} 人分配到 ${headName}`)
        this.loadRegistrations()
      } catch (err) {
        util.hideLoading()
        console.error('批量分配失败:', err)
        util.showError('分配失败')
      }
    }
  })
},
```

- [ ] **Step 7：语法校验**

```bash
node -c miniprogram/pages/user/battle-statistics/battle-statistics.js
```

预期：无报错（exit 0）。

- [ ] **Step 8：Commit**

```bash
git add miniprogram/pages/user/battle-statistics/battle-statistics.wxml
git add miniprogram/pages/user/battle-statistics/battle-statistics.js
git add miniprogram/pages/user/battle-statistics/battle-statistics.wxss
git commit -m "feat: 移除清空全部，新增批量分配功能，全选仅选车身"
```

---

## 验收检查清单

在微信开发者工具中逐项验证：

- [ ] 统计表：表头与数据行可同步左右滑动（类 Excel），不出现错位
- [ ] 车头行：背景灰色，文字浅色，checkbox 不可勾选（disabled 状态）
- [ ] 车身行：checkbox 正常可勾选
- [ ] 全选按钮：只选中所有车身行，车头行保持不选
- [ ] action bar：无"清空全部"按钮；有"分配"按钮（橙色）
- [ ] 分配流程：勾选若干车身 → 点分配 → 弹出车头列表（wx.showActionSheet） → 选择车头 → 所有勾选车身的分配字段更新为该车头昵称，页面刷新
- [ ] 无车身选中时点分配：提示"请先勾选车身报名者"
- [ ] 无车头时点分配：提示"暂无车头可分配"
- [ ] 保存截图功能：不受影响，正常生成截图
- [ ] 删除选中功能：不受影响
