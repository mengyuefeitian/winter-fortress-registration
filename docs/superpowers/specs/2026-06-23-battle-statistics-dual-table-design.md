# 国战统计表双表格重设计 Design Spec

## Objective

将国战统计表从单表格改为双表格（车头表 + 车身表），同时合并昵称/联盟、兵营/兵种(万)为双行单元格，减少列数、消除水平滚动，提升可读性和分配操作体验。

目标用户：报名后需要查看战力分配情况的普通用户和盟管。

成功标准：
- 统计表不需要水平滚动（所有列在屏幕宽度内显示）
- 车头表在上、车身表在下，各自显示人数
- 每行单元格高度能容纳两行文字
- Canvas 截图与页面显示一致（双表格布局）

## Architecture

纯前端改动，不涉及云函数和 DB schema。

改动范围：`battle-statistics.wxml` / `.wxss` / `.js` 三个文件。

JS 层将 `registrations` 数组拆分为 `headRegistrations` 和 `bodyRegistrations`，分别驱动两个表格渲染。Canvas 截图分两段渲染（车头区 → 车身区）。

## Column Design

### 车头表（顶部，无 checkbox，无分配列）

| 列名 | class | 宽度 | 说明 |
|------|-------|------|------|
| 昵称/联盟 | col-name-alliance | 200rpx | 两行：nickname + alliance |
| 熔炉 | col-furnace | 80rpx | 不变 |
| 兵营实(万) | col-barracks-troop | 130rpx | 两行：level + count |
| 钻石(万) | col-diamonds | 100rpx | 不变 |
| 开麦 | col-voice | 80rpx | 不变 |

车头表列总宽 = 590rpx，无需横向滚动。

### 车身表（下方，有 checkbox 和分配列）

| 列名 | class | 宽度 | 说明 |
|------|-------|------|------|
| 选择 | col-checkbox | 60rpx | checkbox |
| 昵称/联盟 | col-name-alliance | 200rpx | 两行：nickname + alliance |
| 熔炉 | col-furnace | 80rpx | 不变 |
| 兵营实(万) | col-barracks-troop | 130rpx | 两行：level + count |
| 钻石(万) | col-diamonds | 100rpx | 不变 |
| 开麦 | col-voice | 80rpx | 不变 |
| 分配 | col-assignment | 160rpx | 车头名 |

车身表列总宽 = 810rpx，无需横向滚动。

### 移除的列

- `col-name`（160rpx）— 并入 col-name-alliance
- `col-alliance`（140rpx）— 并入 col-name-alliance
- `col-barracks`（80rpx）— 并入 col-barracks-troop
- `col-troop`（100rpx）— 并入 col-barracks-troop
- `col-position`（100rpx）— 移除（分表后语义自明）

## Two-Line Cell Design

### 昵称/联盟 cell

```xml
<view class="col col-name-alliance">
  <text class="cell-nickname">{{item.nickName}}</text>
  <text class="cell-alliance">{{item.allianceName}}</text>
</view>
```

- `col-name-alliance`：`flex-direction: column; align-items: flex-start; text-align: left`
- `cell-nickname`：font-size 24rpx，color #333，自动换行（不设 white-space: nowrap）
- `cell-alliance`：font-size 20rpx，color #6BB3F0，display block（始终独占一行，即使昵称换行也在昵称下方）

### 兵营实(万) cell

```xml
<view class="col col-barracks-troop">
  <text class="cell-barracks-level">{{item.barracksLevel}}</text>
  <text class="cell-troop-count">{{item.troopCount}}</text>
</view>
```

- `cell-barracks-level`：font-size 22rpx，color #333，如 "5/5/5"
- `cell-troop-count`：font-size 20rpx，color #4A90D9，如 "30/30/30"

### `.col` 公共样式调整

当前 `.col` 使用 `align-items: center; justify-content: center`（水平垂直居中），对于双行单元格需改为 `align-items: center; justify-content: flex-start`，并保留 `padding: 16rpx 8rpx; min-height: 80rpx`（行高比当前 60rpx 增大以容纳两行）。

## Section Headers

在两个表格之间插入各自的 section header：

```xml
<view class="section-header">车头（{{headRegistrations.length}}人）</view>
```

样式：背景 #f5f5f5，左对齐，font-size 26rpx，font-weight bold，padding 16rpx 20rpx，color #333。

## Page Layout

```
[action bar: 全选 | 删除选中 | 分配 | 保存截图]

[section-header: 车头（N人）]
[车头表头行]
[车头行 × N]

[section-header: 车身（M人）]
[车身表头行]
[车身行 × M]
```

两个表格都在同一个 scroll-view（scroll-y）内，各自不超过屏幕宽度故不需要 scroll-x 和 min-width 限制。

## JS Data Changes

### `loadRegistrations` 处理

```js
const processed = (registrations || []).map(r => ({
  ...r,
  selected: false,
  editAssignment: r.assignment || '',
  // allianceShortName 移除，新设计显示完整 allianceName
}))

const headRegistrations = processed.filter(r => r.position === '车头')
const headNickNames = headRegistrations.map(r => r.nickName)

const bodyRegistrations = processed.filter(r => r.position !== '车头').map(r => ({
  ...r,
  pickerIdx: r.assignment ? Math.max(headNickNames.indexOf(r.assignment), 0) : 0
}))

this.setData({ headRegistrations, bodyRegistrations, headNickNames, selectedIds: [], selectAllChecked: false, loading: false })
```

移除：
- `registrations`（混合数组）→ 拆为 `headRegistrations` + `bodyRegistrations`
- `displayNames`（重名消歧数组）→ 新设计昵称/联盟双行展示，联盟始终可见，消歧天然解决，无需单独维护
- `allianceShortName`（3字截断）→ 改用完整 `allianceName`，双行布局空间足够

### `data` 字段变更

```js
// 移除
registrations: [],
displayNames: [],

// 保留
headNickNames: [],   // 仍作为 data 字段，供 onPickerChange 和 onBatchAssign 使用

// 新增
headRegistrations: [],
bodyRegistrations: [],
```

### 受影响的函数

**`onSelectAll`**：操作 `bodyRegistrations`（不再需要过滤 position）

**`onSlotCheckChange`**：操作 `bodyRegistrations[index]`（`data-index` 对应 bodyRegistrations 下标）

**`onBatchAssign`**：从 `bodyRegistrations` 过滤 `selectedIds`，`headNickNames` 直接读 `this.data.headNickNames`

**`onDeleteSelected`**：操作 `bodyRegistrations` 中 selected 的行

**`onPickerChange`**（行内逐条分配）：当前实现读 `registrations[index]` 和 `headNickNames`。新实现改为读 `bodyRegistrations[index]` 并更新 `bodyRegistrations`：

```js
onPickerChange: async function (e) {
  const index = e.currentTarget.dataset.index
  const pickerIdx = parseInt(e.detail.value)
  const selectedName = this.data.headNickNames[pickerIdx]
  const registrationId = e.currentTarget.dataset.id

  try {
    await db.updateBattleRegistrationAssignment(registrationId, selectedName)
    const bodyRegistrations = this.data.bodyRegistrations.map((r, i) =>
      i === index ? { ...r, assignment: selectedName, editAssignment: selectedName, pickerIdx } : r
    )
    this.setData({ bodyRegistrations })
  } catch (err) {
    console.error('更新分配失败:', err)
    util.showError('更新失败')
  }
},
```

## Canvas Screenshot Design

### colDefs 重定义

两段 colDefs（共用 ratio，总和 = 1.0）：

**车头段 colDefs** (5列，ratio 之和 = 1.0):
```js
const headColDefs = [
  { key: 'nameAlliance', label: '昵称/联盟', ratio: 0.30 },
  { key: 'furnaceLevel', label: '熔炉',     ratio: 0.13 },
  { key: 'barracksTroop', label: '兵营实(万)', ratio: 0.22 },
  { key: 'diamonds',      label: '钻石(万)', ratio: 0.18 },
  { key: 'voice',         label: '开麦',    ratio: 0.17 },
]
```

**车身段 colDefs** (6列，ratio 之和 = 1.0):
```js
const bodyColDefs = [
  { key: 'nameAlliance', label: '昵称/联盟', ratio: 0.26 },
  { key: 'furnaceLevel', label: '熔炉',     ratio: 0.11 },
  { key: 'barracksTroop', label: '兵营实(万)', ratio: 0.19 },
  { key: 'diamonds',      label: '钻石(万)', ratio: 0.15 },
  { key: 'voice',         label: '开麦',    ratio: 0.11 },
  { key: 'assignment',    label: '分配',    ratio: 0.18 },
]
```

### 行高

双行单元格需要更高行高：canvas 行高从当前约 50px 增至 70px（容纳两行文字 + padding）。

### 渲染逻辑

```
renderSection(ctx, '车头', headRegistrations, headColDefs, canvasWidth, startY)
  → drawSectionHeader(...)
  → drawTableHeader(...)
  → for each row: drawRow(...) // 双行单元格分两次 fillText

startY += headSection.height

renderSection(ctx, '车身', bodyRegistrations, bodyColDefs, canvasWidth, startY)
  → drawSectionHeader(...)
  → drawTableHeader(...)
  → for each row: drawRow(...)
```

双行单元格在 canvas 中的处理：
- `nameAlliance`：第一行 `fillText(nickName, x, y1)`，第二行 `fillText(allianceName, x, y1 + lineHeight)`，第二行颜色 `#6BB3F0`
- `barracksTroop`：第一行 `fillText(barracksLevel, x, y1)`，第二行 `fillText(troopCount, x, y1 + lineHeight)`，第二行颜色 `#4A90D9`

## Removed CSS Classes

以下 class 在新版本中删除（不再引用）：
- `.col-name`
- `.col-alliance`
- `.col-barracks`
- `.col-troop`
- `.col-position`
- `.row-head`
- `.row-head .col`

## Constraints

- 不使用 `*` CSS 选择器
- 不修改云函数文件
- `barracksLevel` 字段格式："盾等级/矛等级/射等级"，如 "5/5/5"（已由 battle-registration.js 存储）
- `troopCount` 字段格式："盾万/矛万/射万"，如 "30/30/30"（已由 battle-registration.js 存储）
- Canvas ratio 精度：headColDefs 和 bodyColDefs 各自 ratio 之和精确等于 1.0

## Success Criteria

- [ ] 页面无水平滚动（或显著减少）
- [ ] 车头表在上，显示 "车头（N人）" 标题
- [ ] 车身表在下，显示 "车身（M人）" 标题
- [ ] 昵称/联盟单元格：昵称换行时联盟始终在独立行
- [ ] 兵营实(万)单元格：等级在上，兵力在下，颜色区分
- [ ] 选择/分配功能不受影响（全选、批量分配、删除选中）
- [ ] Canvas 截图与页面布局一致（双表格、双行单元格）
