# 国战统计表双表格重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将国战统计表拆为车头/车身两个独立表格，合并昵称/联盟和兵营/兵种列为双行单元格，消除水平滚动，重构 Canvas 截图为双段渲染。

**Architecture:** 纯前端改动，无云函数变更。Task 1 重构 JS 数据层（headRegistrations/bodyRegistrations 拆分）并重写 Canvas；Task 2 重写 WXML + WXSS（双表格布局 + 新列样式）。

**Tech Stack:** 微信小程序（WXML/WXSS/JS），wx.createOffscreenCanvas，无 npm/bundler。

## Global Constraints

- 不使用 `*` CSS 选择器
- 不修改 `miniprogram/cloudfunctions/` 下任何文件
- `barracksLevel` 格式："盾/矛/射"，如 "5/5/5"（已由报名表单存储）
- `troopCount` 格式："盾/矛/射"，如 "30/30/30"（已由报名表单存储）
- headColDefs ratios 之和 = 1.0；bodyColDefs ratios 之和 = 1.0
- WXML 标签必须正确闭合；JS 使用 `node -c` 校验

---

## 改动文件清单

| 文件 | 操作 |
|------|------|
| `miniprogram/pages/user/battle-statistics/battle-statistics.js` | 修改 — Task 1 全量 |
| `miniprogram/pages/user/battle-statistics/battle-statistics.wxml` | 修改 — Task 2 全量 |
| `miniprogram/pages/user/battle-statistics/battle-statistics.wxss` | 修改 — Task 2 全量 |

---

## Task 1：JS 数据层重构 + Canvas 重写

**Files:**
- Modify: `miniprogram/pages/user/battle-statistics/battle-statistics.js`

**Interfaces:**
- Produces:
  - `data.headRegistrations: Array<{_id, nickName, allianceName, furnaceLevel, barracksLevel, troopCount, diamonds, voice, position}>`
  - `data.bodyRegistrations: Array<{_id, nickName, allianceName, furnaceLevel, barracksLevel, troopCount, diamonds, voice, position, assignment, selected, pickerIdx}>`
  - `data.headNickNames: string[]` — 供 WXML picker 和 onBatchAssign 使用
  - `data.selectedIds: string[]` — bodyRegistrations 中已勾选行的 `_id`

---

- [ ] **Step 1：更新 `data` 对象**

将 `data: { ... }` 块中的以下字段修改：

```js
data: {
  configId: '',
  date: '',
  headRegistrations: [],   // 新增
  bodyRegistrations: [],   // 新增
  headNickNames: [],
  loading: false,
  canDeleteRegistration: false,
  selectAllChecked: false,
  selectedIds: []
  // 删除: registrations: [], displayNames: []
},
```

- [ ] **Step 2：重写 `loadRegistrations`**

完整替换现有 `loadRegistrations` 函数：

```js
loadRegistrations: async function () {
  try {
    this.setData({ loading: true })
    const registrations = await db.getBattleRegistrationsByConfig(this.data.configId)

    const processed = (registrations || []).map(r => ({
      ...r,
      selected: false,
      editAssignment: r.assignment || '',
    }))

    const headRegistrations = processed.filter(r => r.position === '车头')
    const headNickNames = headRegistrations.map(r => r.nickName)

    const bodyRegistrations = processed.filter(r => r.position !== '车头').map(r => ({
      ...r,
      pickerIdx: r.assignment ? Math.max(headNickNames.indexOf(r.assignment), 0) : 0
    }))

    this.setData({
      headRegistrations,
      bodyRegistrations,
      headNickNames,
      selectedIds: [],
      selectAllChecked: false,
      loading: false
    })
  } catch (err) {
    console.error('加载报名记录失败:', err)
    util.showError('加载失败')
    this.setData({ loading: false })
  }
},
```

- [ ] **Step 3：重写 `onSelectAll`**

```js
onSelectAll: function () {
  const checked = !this.data.selectAllChecked
  const bodyRegistrations = this.data.bodyRegistrations.map(r => ({
    ...r,
    selected: checked
  }))
  const selectedIds = checked ? bodyRegistrations.map(r => r._id) : []
  const selectAllChecked = checked && bodyRegistrations.length > 0

  this.setData({ bodyRegistrations, selectAllChecked, selectedIds })
},
```

- [ ] **Step 4：重写 `onSlotCheckChange`**

```js
onSlotCheckChange: function (e) {
  const index = e.currentTarget.dataset.index
  const value = e.detail.value
  const selected = value.length > 0

  const bodyRegistrations = this.data.bodyRegistrations.map((r, i) =>
    i === index ? { ...r, selected } : r
  )

  const selectedIds = bodyRegistrations.filter(r => r.selected).map(r => r._id)
  const selectAllChecked = bodyRegistrations.length > 0 && selectedIds.length === bodyRegistrations.length

  this.setData({ bodyRegistrations, selectedIds, selectAllChecked })
},
```

- [ ] **Step 5：重写 `onPickerChange`**

```js
onPickerChange: async function (e) {
  const registrationId = e.currentTarget.dataset.id
  const index = e.currentTarget.dataset.index
  const pickerIdx = parseInt(e.detail.value)
  const selectedName = this.data.headNickNames[pickerIdx]

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

- [ ] **Step 6：简化 `onBatchAssign`**

`selectedIds` 现在只含 bodyRegistrations 的 id，无需再过滤 position：

```js
onBatchAssign: function () {
  if (this.data.selectedIds.length === 0) {
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
        for (const id of this.data.selectedIds) {
          await db.updateBattleRegistrationAssignment(id, headName)
        }
        util.hideLoading()
        util.showSuccess(`已将 ${this.data.selectedIds.length} 人分配到 ${headName}`)
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

- [ ] **Step 7：重写 `buildScreenshotData`**

完整替换现有 `buildScreenshotData` 函数（同时删除 `_countLines` 和 `_wrapTextFixed` 两个辅助函数）：

```js
buildScreenshotData: function () {
  const sectionHeaderH = 40
  const tableHeaderH = 50
  const rowH = 70
  const sectionGap = 20
  const bottomMargin = 40
  const topArea = 155

  const headH = sectionHeaderH + tableHeaderH + this.data.headRegistrations.length * rowH
  const bodyH = sectionHeaderH + tableHeaderH + this.data.bodyRegistrations.length * rowH

  return { height: topArea + headH + sectionGap + bodyH + bottomMargin }
},
```

- [ ] **Step 8：重写 `onSaveScreenshot` Canvas 渲染**

完整替换现有 `onSaveScreenshot` 函数：

```js
onSaveScreenshot: async function () {
  if (this.data.headRegistrations.length === 0 && this.data.bodyRegistrations.length === 0) {
    util.showInfo('暂无数据可截图')
    return
  }

  try {
    util.showLoading('正在生成截图...')

    const screenshotData = this.buildScreenshotData()
    const margin = 40
    const canvasWidth = 750
    const innerWidth = canvasWidth - margin * 2
    const rowH = 70
    const tableHeaderH = 50
    const sectionHeaderH = 40

    const canvas = wx.createOffscreenCanvas({
      type: '2d',
      width: canvasWidth,
      height: screenshotData.height
    })
    const ctx = canvas.getContext('2d')

    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvasWidth, screenshotData.height)

    // 标题
    ctx.fillStyle = '#07C160'
    ctx.font = 'bold 36px sans-serif'
    ctx.fillText('国战统计表', margin, 70)

    // 日期
    ctx.fillStyle = '#999999'
    ctx.font = '26px sans-serif'
    ctx.fillText(this.data.date, margin, 115)

    // 分隔线
    ctx.strokeStyle = '#E8E8E8'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(margin, 135)
    ctx.lineTo(canvasWidth - margin, 135)
    ctx.stroke()

    // 列定义 — ratios 之和必须 = 1.0
    const headColDefs = [
      { key: '昵称/联盟',  ratio: 0.30 },
      { key: '熔炉',       ratio: 0.13 },
      { key: '兵营实(万)', ratio: 0.22 },
      { key: '钻石(万)',   ratio: 0.18 },
      { key: '开麦',       ratio: 0.17 },
    ]
    const bodyColDefs = [
      { key: '昵称/联盟',  ratio: 0.26 },
      { key: '熔炉',       ratio: 0.11 },
      { key: '兵营实(万)', ratio: 0.19 },
      { key: '钻石(万)',   ratio: 0.15 },
      { key: '开麦',       ratio: 0.11 },
      { key: '分配',       ratio: 0.18 },
    ]

    // 计算每列 x 坐标和宽度
    const buildCols = (colDefs) => {
      let x = margin
      return colDefs.map(col => {
        const w = Math.floor(innerWidth * col.ratio)
        const result = { key: col.key, w, x }
        x += w
        return result
      })
    }

    // 渲染 section header（灰底标题行）
    const drawSectionHeader = (title, y) => {
      ctx.fillStyle = '#F5F5F5'
      ctx.fillRect(margin, y, innerWidth, sectionHeaderH)
      ctx.fillStyle = '#333333'
      ctx.font = 'bold 26px sans-serif'
      ctx.textBaseline = 'middle'
      ctx.fillText(title, margin + 12, y + sectionHeaderH / 2)
      ctx.textBaseline = 'alphabetic'
    }

    // 渲染表头行（蓝底白字）
    const drawTableHeader = (cols, y) => {
      ctx.fillStyle = '#4A90D9'
      ctx.fillRect(margin, y, innerWidth, tableHeaderH)
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 22px sans-serif'
      ctx.textBaseline = 'middle'
      for (const col of cols) {
        ctx.fillText(col.key, col.x + 8, y + tableHeaderH / 2)
      }
      ctx.textBaseline = 'alphabetic'
    }

    // 渲染数据行（双行单元格）
    const drawRow = (row, cols, rowIndex, y) => {
      if (rowIndex % 2 === 1) {
        ctx.fillStyle = '#F5F5F5'
        ctx.fillRect(margin, y, innerWidth, rowH)
      }
      ctx.textBaseline = 'top'
      const line1Y = y + 8
      const line2Y = y + 8 + 28

      for (const col of cols) {
        if (col.key === '昵称/联盟') {
          ctx.fillStyle = '#333333'
          ctx.font = '22px sans-serif'
          ctx.fillText(row.nickName || '-', col.x + 8, line1Y)
          ctx.fillStyle = '#6BB3F0'
          ctx.font = '20px sans-serif'
          ctx.fillText(row.allianceName || '-', col.x + 8, line2Y)
        } else if (col.key === '兵营实(万)') {
          ctx.fillStyle = '#333333'
          ctx.font = '22px sans-serif'
          ctx.fillText(row.barracksLevel || '-', col.x + 8, line1Y)
          ctx.fillStyle = '#4A90D9'
          ctx.font = '20px sans-serif'
          ctx.fillText(row.troopCount || '-', col.x + 8, line2Y)
        } else {
          ctx.fillStyle = '#333333'
          ctx.font = '22px sans-serif'
          const val = col.key === '熔炉'    ? (row.furnaceLevel || '-')
                    : col.key === '钻石(万)' ? (row.diamonds || '-')
                    : col.key === '开麦'    ? (row.voice || '-')
                    : col.key === '分配'    ? (row.assignment || '-')
                    : '-'
          ctx.fillText(val, col.x + 8, line1Y)
        }
      }
      ctx.textBaseline = 'alphabetic'
    }

    const headCols = buildCols(headColDefs)
    const bodyCols = buildCols(bodyColDefs)

    // 渲染车头区
    let y = 155
    drawSectionHeader(`车头（${this.data.headRegistrations.length}人）`, y)
    y += sectionHeaderH
    drawTableHeader(headCols, y)
    y += tableHeaderH
    for (let i = 0; i < this.data.headRegistrations.length; i++) {
      drawRow(this.data.headRegistrations[i], headCols, i, y)
      y += rowH
    }

    y += 20  // section gap

    // 渲染车身区
    drawSectionHeader(`车身（${this.data.bodyRegistrations.length}人）`, y)
    y += sectionHeaderH
    drawTableHeader(bodyCols, y)
    y += tableHeaderH
    for (let i = 0; i < this.data.bodyRegistrations.length; i++) {
      drawRow(this.data.bodyRegistrations[i], bodyCols, i, y)
      y += rowH
    }

    wx.canvasToTempFilePath({
      canvas: canvas,
      destWidth: 750,
      destHeight: screenshotData.height,
      success: (res) => {
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: () => {
            util.hideLoading()
            util.showSuccess('截图已保存到相册')
          },
          fail: (err) => {
            util.hideLoading()
            if (err.errMsg.indexOf('auth deny') !== -1) {
              wx.showModal({
                title: '提示',
                content: '需要您授权保存图片权限',
                confirmText: '去授权',
                success: (modalRes) => {
                  if (modalRes.confirm) wx.openSetting()
                }
              })
            } else {
              util.showError('保存失败')
            }
          }
        })
      },
      fail: (err) => {
        util.hideLoading()
        console.error('生成图片失败:', err)
        util.showError('生成图片失败')
      }
    })

  } catch (err) {
    util.hideLoading()
    console.error('截图失败:', err)
    util.showError('截图失败')
  }
},
```

- [ ] **Step 9：删除 `_countLines` 和 `_wrapTextFixed`**

删除整个 `_countLines` 函数（含结束 `},`）和整个 `_wrapTextFixed` 函数（含结束 `}`）。这两个辅助函数仅在旧 Canvas 渲染中使用，新版不再需要。

- [ ] **Step 10：语法校验**

```bash
node -c miniprogram/pages/user/battle-statistics/battle-statistics.js
```

预期：无报错（exit 0）。

- [ ] **Step 11：Commit**

```bash
git add miniprogram/pages/user/battle-statistics/battle-statistics.js
git commit -m "refactor: 国战统计表 JS 重构——双表格数据层 + Canvas 双段渲染"
```

---

## Task 2：WXML + WXSS 双表格布局

**Files:**
- Modify: `miniprogram/pages/user/battle-statistics/battle-statistics.wxml`
- Modify: `miniprogram/pages/user/battle-statistics/battle-statistics.wxss`

**Interfaces:**
- Consumes（Task 1 产出）:
  - `data.headRegistrations` — 车头表 wx:for 数据源
  - `data.bodyRegistrations` — 车身表 wx:for 数据源
  - `data.headNickNames` — picker range
  - `data.selectedIds`, `data.selectAllChecked`, `data.canDeleteRegistration`

---

- [ ] **Step 1：完整替换 battle-statistics.wxml**

用以下内容完整替换文件（注意所有标签闭合）：

```xml
<!--pages/user/battle-statistics/battle-statistics.wxml-->
<view class="container">
  <view class="header">
    <text class="title">国战统计表</text>
    <text class="date">{{date}}</text>
  </view>

  <!-- 车头表 -->
  <view class="section-header">车头（{{headRegistrations.length}}人）</view>
  <view class="table-wrapper">
    <view class="table-header">
      <view class="col col-name-alliance">昵称/联盟</view>
      <view class="col col-furnace">熔炉</view>
      <view class="col col-barracks-troop">兵营实(万)</view>
      <view class="col col-diamonds">钻石(万)</view>
      <view class="col col-voice">开麦</view>
    </view>
    <view class="table-row" wx:for="{{headRegistrations}}" wx:key="_id">
      <view class="col col-name-alliance">
        <view class="cell-nickname">{{item.nickName}}</view>
        <view class="cell-alliance">{{item.allianceName || '-'}}</view>
      </view>
      <view class="col col-furnace">{{item.furnaceLevel || '-'}}</view>
      <view class="col col-barracks-troop">
        <view class="cell-barracks-level">{{item.barracksLevel || '-'}}</view>
        <view class="cell-troop-count">{{item.troopCount || '-'}}</view>
      </view>
      <view class="col col-diamonds">{{item.diamonds || '-'}}</view>
      <view class="col col-voice">{{item.voice || '-'}}</view>
    </view>
    <view class="empty-row" wx:if="{{headRegistrations.length === 0}}">
      <text class="empty-text">暂无车头报名</text>
    </view>
  </view>

  <!-- 车身表 -->
  <view class="section-header" style="margin-top:20rpx">车身（{{bodyRegistrations.length}}人）</view>
  <view class="table-wrapper">
    <view class="table-header">
      <view class="col col-checkbox" wx:if="{{canDeleteRegistration}}">选择</view>
      <view class="col col-name-alliance">昵称/联盟</view>
      <view class="col col-furnace">熔炉</view>
      <view class="col col-barracks-troop">兵营实(万)</view>
      <view class="col col-diamonds">钻石(万)</view>
      <view class="col col-voice">开麦</view>
      <view class="col col-assignment">分配</view>
    </view>
    <view class="table-row" wx:for="{{bodyRegistrations}}" wx:key="_id">
      <view class="col col-checkbox" wx:if="{{canDeleteRegistration}}">
        <checkbox-group bindchange="onSlotCheckChange" data-index="{{index}}">
          <checkbox value="{{item._id}}" checked="{{item.selected}}" />
        </checkbox-group>
      </view>
      <view class="col col-name-alliance">
        <view class="cell-nickname">{{item.nickName}}</view>
        <view class="cell-alliance">{{item.allianceName || '-'}}</view>
      </view>
      <view class="col col-furnace">{{item.furnaceLevel || '-'}}</view>
      <view class="col col-barracks-troop">
        <view class="cell-barracks-level">{{item.barracksLevel || '-'}}</view>
        <view class="cell-troop-count">{{item.troopCount || '-'}}</view>
      </view>
      <view class="col col-diamonds">{{item.diamonds || '-'}}</view>
      <view class="col col-voice">{{item.voice || '-'}}</view>
      <view class="col col-assignment">
        <picker wx:if="{{canDeleteRegistration}}" mode="selector" range="{{headNickNames}}" value="{{item.pickerIdx}}" bindchange="onPickerChange" data-id="{{item._id}}" data-index="{{index}}">
          <view class="assignment-cell">
            <text class="assignment-value {{item.assignment ? '' : 'unassigned'}}">{{item.assignment || '未分配'}}</text>
            <text class="assignment-arrow">▾</text>
          </view>
        </picker>
        <text wx:else>{{item.assignment || '-'}}</text>
      </view>
    </view>
    <view class="empty-row" wx:if="{{bodyRegistrations.length === 0}}">
      <text class="empty-text">暂无车身报名</text>
    </view>
  </view>

  <view class="action-bar">
    <view class="btn-select-all" wx:if="{{canDeleteRegistration}}" bindtap="onSelectAll">
      {{selectAllChecked ? '取消全选' : '全选'}}
    </view>
    <view class="btn btn-delete" wx:if="{{canDeleteRegistration}}" bindtap="onDeleteSelected">删除选中</view>
    <view class="btn btn-assign" wx:if="{{canDeleteRegistration}}" bindtap="onBatchAssign">分配</view>
    <view class="btn btn-save" bindtap="onSaveScreenshot">保存截图</view>
  </view>
</view>
```

- [ ] **Step 2：完整替换 battle-statistics.wxss**

用以下内容完整替换文件：

```css
/* pages/user/battle-statistics/battle-statistics.wxss */
.container {
  padding: 20rpx;
  min-height: 100vh;
  background: #fafbfc;
}

.header {
  text-align: center;
  padding: 20rpx 0;
}

.title {
  font-size: 36rpx;
  font-weight: bold;
  color: #1a1a2e;
  display: block;
}

.date {
  font-size: 28rpx;
  color: #4A90D9;
  margin-top: 8rpx;
  display: block;
}

.section-header {
  background: #f5f5f5;
  padding: 16rpx 20rpx;
  font-size: 26rpx;
  font-weight: bold;
  color: #333;
  border-radius: 8rpx 8rpx 0 0;
}

.table-wrapper {
  background: #fff;
  border-radius: 0 0 12rpx 12rpx;
  overflow: hidden;
  margin-bottom: 4rpx;
}

.table-header {
  display: flex;
  background: #4A90D9;
  color: #fff;
  font-size: 24rpx;
}

.table-row {
  display: flex;
  border-bottom: 1rpx solid #f0f0f0;
  font-size: 24rpx;
}

.table-row:nth-child(even) {
  background: #fafbfc;
}

.col {
  padding: 12rpx 8rpx;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 80rpx;
}

.col-checkbox { width: 60rpx; }
.col-furnace  { width: 65rpx; }
.col-diamonds { width: 85rpx; }
.col-voice    { width: 60rpx; }
.col-assignment { width: 120rpx; }

/* 宽度设计目标：含 checkbox 的车身表总宽 ≤ 710rpx（750 - 2×20 padding）
   60+165+65+115+85+60+120 = 670rpx ✓ */
.col-name-alliance {
  width: 165rpx;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  text-align: left;
}

.col-barracks-troop {
  width: 115rpx;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  text-align: left;
}

.cell-nickname {
  font-size: 24rpx;
  color: #333;
}

.cell-alliance {
  font-size: 20rpx;
  color: #6BB3F0;
  margin-top: 4rpx;
}

.cell-barracks-level {
  font-size: 22rpx;
  color: #333;
}

.cell-troop-count {
  font-size: 20rpx;
  color: #4A90D9;
  margin-top: 4rpx;
}

.assignment-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
}

.assignment-value {
  color: #333;
  font-size: 24rpx;
}

.assignment-value.unassigned {
  color: #999;
}

.assignment-arrow {
  color: #4A90D9;
  font-size: 20rpx;
}

.empty-row {
  display: flex;
  justify-content: center;
  padding: 40rpx 0;
}

.empty-text {
  font-size: 28rpx;
  color: #999;
}

.action-bar {
  display: flex;
  gap: 16rpx;
  margin-top: 20rpx;
  padding: 0 4rpx;
}

.btn-select-all {
  flex: 1;
  padding: 20rpx 10rpx;
  background: #6BB3F0;
  color: #fff;
  border-radius: 8rpx;
  font-size: 26rpx;
  text-align: center;
  white-space: nowrap;
}

.btn {
  flex: 1;
  padding: 20rpx 10rpx;
  border-radius: 8rpx;
  font-size: 26rpx;
  color: #fff;
  text-align: center;
  white-space: nowrap;
}

.btn-delete {
  background: #FF6B6B;
}

.btn-assign {
  background: #FA8C16;
}

.btn-save {
  background: #52C41A;
}
```

- [ ] **Step 3：目视检查 WXML 标签闭合**

逐行确认所有 `<view>`, `<text>`, `<picker>`, `<checkbox-group>`, `<checkbox>` 标签正确闭合，无嵌套错误。

- [ ] **Step 4：JS 语法校验（确认 Task 1 的改动未被意外覆盖）**

```bash
node -c miniprogram/pages/user/battle-statistics/battle-statistics.js
```

预期：exit 0。

- [ ] **Step 5：Commit**

```bash
git add miniprogram/pages/user/battle-statistics/battle-statistics.wxml
git add miniprogram/pages/user/battle-statistics/battle-statistics.wxss
git commit -m "feat: 国战统计表双表格布局 + 昵称/联盟、兵营实(万)双行单元格"
```

---

## 验收检查清单

在微信开发者工具中逐项验证：

- [ ] 页面无水平滚动（两个表格均在屏幕宽度内）
- [ ] "车头（N人）"区在上，"车身（M人）"区在下，各有标题行
- [ ] 车头表：无 checkbox，无分配列，仅 5 列
- [ ] 车身表：有 checkbox，有分配列，共 7 列（含 checkbox）
- [ ] 昵称/联盟单元格：昵称正常显示，联盟独立一行（蓝色），昵称换行时联盟仍在最下方
- [ ] 兵营实(万)单元格：等级在上（如 5/5/5），兵力在下（如 30/30/30，蓝色）
- [ ] 全选：只选中车身行，数量与 "车身（M人）" 一致
- [ ] 分配功能：勾选车身 → 点分配 → 弹出车头列表 → 选择后更新分配字段
- [ ] 行内 picker：点击车身行分配列的下拉箭头 → 选择车头 → 当行分配字段立即更新
- [ ] 删除选中功能不受影响
- [ ] 保存截图：生成双段 Canvas（车头区 + 车身区），截图内有 section header 文字
