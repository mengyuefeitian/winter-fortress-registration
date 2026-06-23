# 国战报名优化（兵营拆分+兵种数量+联盟回填+统计展示）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将兵营等级拆为盾/矛/射三个输入框，新增兵种数量行，联盟自动回填上次选择，统计表新增兵种列并截取联盟前 3 字符。

**Architecture:** 纯前端改动，无云函数变更。报名页 JS/WXML/WXSS 三件套 + db.js 新增 troopCount 字段落库 + 统计页 JS/WXML/WXSS 三件套。历史数据原样显示，troopCount 缺失时以 `-` 兜底。

**Tech Stack:** 微信小程序（WXML/WXSS/JS），无构建工具。语法校验：`node -c <file.js>`。调试：微信开发者工具。

## Global Constraints

- 无云函数变更；所有改动均在 `miniprogram/` 目录下的客户端文件
- 历史 `barracksLevel` 自由文本原样显示，不迁移、不转换
- 历史记录无 `troopCount` 字段，统计表与截图统一显示 `-`（`|| '-'`）
- `barracksLevel` 落库格式：`"盾值/矛值/射值"`，如 `"30/30/30"`
- `troopCount` 落库格式：`"盾值/矛值/射值"`，如 `"10/20/30"`
- 联盟回填仅本机 `wx.getStorageSync('lastBattleAllianceId')`，不跨设备
- 不使用 `*` CSS 选择器（微信小程序不支持）
- 所有字段（兵营三组、兵种数量三组）提交时必填，任一为空阻止提交

---

## 改动文件清单

| 文件 | 操作 |
|------|------|
| `miniprogram/pages/user/battle-registration/battle-registration.wxml` | 修改 — 兵营行拆分为三个输入；新增兵种数量行 |
| `miniprogram/pages/user/battle-registration/battle-registration.wxss` | 修改 — 新增 `.triple-input-row`、`.triple-cell`、`.unit-suffix` 样式 |
| `miniprogram/pages/user/battle-registration/battle-registration.js` | 修改 — data 新增 6 字段；6 个 input handler；loadAlliances 回填联盟；validate 扩展；onSubmit 组装并缓存 |
| `miniprogram/utils/db.js` | 修改 — `createBattleRegistration` 解构并落库 `troopCount` |
| `miniprogram/pages/user/battle-statistics/battle-statistics.js` | 修改 — `loadRegistrations` 计算 `allianceShortName`；canvas `colDefs` 新增兵种列 |
| `miniprogram/pages/user/battle-statistics/battle-statistics.wxml` | 修改 — 联盟列改用 `allianceShortName`；新增兵种(万)列 |
| `miniprogram/pages/user/battle-statistics/battle-statistics.wxss` | 修改 — 新增 `.col-troop` 宽度定义 |

---

## Task 1：报名表单 UI（WXML + WXSS）

**Files:**
- Modify: `miniprogram/pages/user/battle-registration/battle-registration.wxml`
- Modify: `miniprogram/pages/user/battle-registration/battle-registration.wxss`

**Interfaces:**
- Produces: `barracksShield`/`barracksSpear`/`barracksArcher` 三个文本 input；`troopShield`/`troopSpear`/`troopArcher` 三个 digit input，分别绑定同名 bindinput handler（Task 2 实现）

---

- [ ] **Step 1：替换兵营等级行 — battle-registration.wxml**

将以下旧代码（第 34–38 行）：

```xml
<view class="form-item">
  <text class="label">兵营等级</text>
  <view class="input-group">
    <input type="text" placeholder="可输入兵营等级如555,543,30/30/30等" maxlength="20" bindinput="onBarracksInput" value="{{barracksLevel}}" />
  </view>
</view>
```

替换为：

```xml
<view class="form-item">
  <text class="label">兵营等级</text>
  <view class="triple-input-row">
    <view class="triple-cell">
      <text class="triple-label">盾</text>
      <input type="text" placeholder="30" maxlength="5" bindinput="onBarracksShieldInput" value="{{barracksShield}}" />
    </view>
    <view class="triple-cell">
      <text class="triple-label">矛</text>
      <input type="text" placeholder="30" maxlength="5" bindinput="onBarracksSpearInput" value="{{barracksSpear}}" />
    </view>
    <view class="triple-cell">
      <text class="triple-label">射</text>
      <input type="text" placeholder="30" maxlength="5" bindinput="onBarracksArcherInput" value="{{barracksArcher}}" />
    </view>
  </view>
</view>
```

- [ ] **Step 2：在兵营行下方插入兵种数量行 — battle-registration.wxml**

紧接兵营等级 `</view>` 后、钻石行 `<view class="form-item">` 前，插入：

```xml
<view class="form-item">
  <text class="label">兵种数量</text>
  <view class="triple-input-row">
    <view class="triple-cell">
      <text class="triple-label">盾</text>
      <input type="digit" placeholder="10" maxlength="6" bindinput="onTroopShieldInput" value="{{troopShield}}" />
      <text class="unit-suffix">万</text>
    </view>
    <view class="triple-cell">
      <text class="triple-label">矛</text>
      <input type="digit" placeholder="20" maxlength="6" bindinput="onTroopSpearInput" value="{{troopSpear}}" />
      <text class="unit-suffix">万</text>
    </view>
    <view class="triple-cell">
      <text class="triple-label">射</text>
      <input type="digit" placeholder="30" maxlength="6" bindinput="onTroopArcherInput" value="{{troopArcher}}" />
      <text class="unit-suffix">万</text>
    </view>
  </view>
</view>
```

- [ ] **Step 3：新增样式 — battle-registration.wxss**

在文件末尾追加（不修改任何现有样式）：

```css
.triple-input-row {
  flex: 1;
  display: flex;
  justify-content: flex-end;
  gap: 12rpx;
}

.triple-cell {
  display: flex;
  align-items: center;
  gap: 4rpx;
}

.triple-label {
  font-size: 22rpx;
  color: #999;
  white-space: nowrap;
}

.triple-cell input {
  width: 80rpx;
  text-align: center;
  font-size: 26rpx;
  color: #333;
  border-bottom: 1rpx solid #ddd;
}

.unit-suffix {
  font-size: 22rpx;
  color: #999;
  white-space: nowrap;
}
```

- [ ] **Step 4：语法校验**

```bash
node -c miniprogram/pages/user/battle-registration/battle-registration.wxml 2>/dev/null || echo "WXML skip (not JS)"
```

WXML 无法用 node -c 校验，改为肉眼检查标签闭合。在微信开发者工具中打开该页面确认无编译报错。

- [ ] **Step 5：Commit**

```bash
git add miniprogram/pages/user/battle-registration/battle-registration.wxml
git add miniprogram/pages/user/battle-registration/battle-registration.wxss
git commit -m "feat: 兵营等级拆分为盾/矛/射三输入框，新增兵种数量行"
```

---

## Task 2：报名表单逻辑（battle-registration.js）

**Files:**
- Modify: `miniprogram/pages/user/battle-registration/battle-registration.js`

**Interfaces:**
- Consumes: Task 1 产出的 6 个 bindinput 绑定名（`onBarracksShieldInput`、`onBarracksSpearInput`、`onBarracksArcherInput`、`onTroopShieldInput`、`onTroopSpearInput`、`onTroopArcherInput`）
- Produces: `registrationData.barracksLevel`（"盾/矛/射" 格式字符串）、`registrationData.troopCount`（"盾/矛/射" 格式字符串），供 Task 3 的 `createBattleRegistration` 使用

---

- [ ] **Step 1：在 data 中新增 6 个字段**

将 `data: {` 块中的 `barracksLevel: '',` 替换为：

```js
barracksShield: '',
barracksSpear: '',
barracksArcher: '',
troopShield: '',
troopSpear: '',
troopArcher: '',
```

> 说明：`barracksLevel` 原字段删除，不再作为独立 data；最终值在 onSubmit 时组装。

- [ ] **Step 2：在 loadAlliances 完成后回填上次联盟**

将现有 `loadAlliances` 函数替换为：

```js
loadAlliances: async function () {
  try {
    const zone = app.globalData.currentZone
    if (zone) {
      const alliances = await db.getAlliancesByZone(zone._id)
      const list = alliances || []
      this.setData({ alliances: list })

      const lastId = wx.getStorageSync('lastBattleAllianceId')
      if (lastId) {
        const idx = list.findIndex(a => a._id === lastId)
        if (idx >= 0) {
          this.setData({ allianceIndex: idx })
        }
      }
    }
  } catch (err) {
    console.error('加载联盟失败:', err)
  }
},
```

- [ ] **Step 3：新增 6 个 input handler**

在 `onDiamondsInput` 函数后插入以下 6 个函数（与现有 handler 风格一致）：

```js
onBarracksShieldInput: function (e) {
  this.setData({ barracksShield: e.detail.value })
},

onBarracksSpearInput: function (e) {
  this.setData({ barracksSpear: e.detail.value })
},

onBarracksArcherInput: function (e) {
  this.setData({ barracksArcher: e.detail.value })
},

onTroopShieldInput: function (e) {
  this.setData({ troopShield: e.detail.value })
},

onTroopSpearInput: function (e) {
  this.setData({ troopSpear: e.detail.value })
},

onTroopArcherInput: function (e) {
  this.setData({ troopArcher: e.detail.value })
},
```

- [ ] **Step 4：更新 validate 函数**

将现有 `validate` 函数整体替换为：

```js
validate: function () {
  const {
    allianceIndex, inputNickName, furnaceLevel,
    barracksShield, barracksSpear, barracksArcher,
    troopShield, troopSpear, troopArcher,
    diamonds
  } = this.data

  if (allianceIndex < 0) {
    util.showError('请选择联盟')
    return false
  }
  if (!inputNickName || inputNickName.trim().length === 0) {
    util.showError('请输入游戏昵称')
    return false
  }
  if (!furnaceLevel || furnaceLevel.trim().length === 0) {
    util.showError('请输入熔炉等级')
    return false
  }
  if (!barracksShield.trim() || !barracksSpear.trim() || !barracksArcher.trim()) {
    util.showError('请完整填写兵营等级（盾/矛/射）')
    return false
  }
  if (!troopShield.trim() || !troopSpear.trim() || !troopArcher.trim()) {
    util.showError('请完整填写兵种数量（盾/矛/射）')
    return false
  }
  const isValidNumber = v => v.trim() !== '' && !isNaN(parseFloat(v.trim()))
  if (!isValidNumber(troopShield) || !isValidNumber(troopSpear) || !isValidNumber(troopArcher)) {
    util.showError('兵种数量请填写有效数字（如 10 或 1.5）')
    return false
  }
  if (!diamonds || diamonds.trim().length === 0) {
    util.showError('请输入钻石数量')
    return false
  }
  return true
},
```

- [ ] **Step 5：更新 onSubmit 函数**

将 `onSubmit` 中的解构和 `registrationData` 组装部分替换为：

```js
onSubmit: async function () {
  if (!this.validate()) return

  const {
    configId, alliances, allianceIndex, inputNickName, furnaceLevel,
    barracksShield, barracksSpear, barracksArcher,
    troopShield, troopSpear, troopArcher,
    diamonds, voiceIndex, positionIndex
  } = this.data
  const userInfo = app.globalData.userInfo

  try {
    this.setData({ loading: true })
    util.showLoading('提交中...')

    wx.setStorageSync('lastBattleNickName', inputNickName.trim())

    const alliance = alliances[allianceIndex]
    const zone = app.globalData.currentZone
    const barracksLevel = `${barracksShield.trim()}/${barracksSpear.trim()}/${barracksArcher.trim()}`
    const troopCount = `${troopShield.trim()}/${troopSpear.trim()}/${troopArcher.trim()}`

    const registrationData = {
      configId,
      zoneId: zone ? zone._id : '',
      userId: userInfo._id,
      nickName: inputNickName.trim(),
      allianceId: alliance._id,
      allianceName: alliance.allianceName,
      furnaceLevel: furnaceLevel.trim(),
      barracksLevel,
      troopCount,
      diamonds: diamonds.trim(),
      voice: db.VOICE_OPTIONS[voiceIndex],
      position: db.BATTLE_POSITION_OPTIONS[positionIndex]
    }

    await db.createBattleRegistration(registrationData)

    wx.setStorageSync('lastBattleAllianceId', alliance._id)

    util.hideLoading()
    util.showSuccess('报名成功')
    setTimeout(() => {
      wx.navigateBack()
    }, 1500)
  } catch (err) {
    util.hideLoading()
    console.error('报名失败:', err)
    if (err.message && err.message.includes('已报名')) {
      util.showError('您已报名该日期的国战')
    } else {
      util.showError('报名失败')
    }
  }
},
```

- [ ] **Step 6：语法校验**

```bash
node -c miniprogram/pages/user/battle-registration/battle-registration.js
```

预期输出：`miniprogram/pages/user/battle-registration/battle-registration.js` 无报错（exit 0）。

- [ ] **Step 7：Commit**

```bash
git add miniprogram/pages/user/battle-registration/battle-registration.js
git commit -m "feat: 报名逻辑 — 兵营/兵种输入handler、联盟回填、validate与submit更新"
```

---

## Task 3：数据落库（db.js）

**Files:**
- Modify: `miniprogram/utils/db.js:1398-1431`

**Interfaces:**
- Consumes: Task 2 传入的 `registrationData.troopCount`（字符串）
- Produces: `battleRegistrations` 集合新记录含 `troopCount` 字段

---

- [ ] **Step 1：更新 createBattleRegistration 函数**

将第 1400 行的解构：
```js
const { configId, zoneId, userId, nickName, allianceId, allianceName, furnaceLevel, barracksLevel, diamonds, voice, position } = data
```

替换为：
```js
const { configId, zoneId, userId, nickName, allianceId, allianceName, furnaceLevel, barracksLevel, troopCount, diamonds, voice, position } = data
```

将 `db.collection('battleRegistrations').add({ data: { ... } })` 中 `barracksLevel: barracksLevel,` 后插入：

```js
troopCount: troopCount,
```

最终 add 的 data 块完整如下（供核对）：

```js
return await db.collection('battleRegistrations').add({
  data: {
    configId: configId,
    zoneId: zoneId,
    userId: userId,
    nickName: nickName,
    allianceId: allianceId,
    allianceName: allianceName,
    furnaceLevel: furnaceLevel,
    barracksLevel: barracksLevel,
    troopCount: troopCount,
    diamonds: diamonds,
    voice: voice,
    position: position,
    assignment: position === '车头' ? nickName : '机动',
    status: 'active',
    createTime: db.serverDate()
  }
})
```

- [ ] **Step 2：语法校验**

```bash
node -c miniprogram/utils/db.js
```

预期：无报错。

- [ ] **Step 3：Commit**

```bash
git add miniprogram/utils/db.js
git commit -m "feat: createBattleRegistration 新增 troopCount 字段落库"
```

---

## Task 4：统计表（battle-statistics 全套）

**Files:**
- Modify: `miniprogram/pages/user/battle-statistics/battle-statistics.js`
- Modify: `miniprogram/pages/user/battle-statistics/battle-statistics.wxml`
- Modify: `miniprogram/pages/user/battle-statistics/battle-statistics.wxss`

**Interfaces:**
- Consumes: `battleRegistrations` 记录中的 `troopCount`（新记录有值，历史记录为 undefined）；`allianceName`（字符串）
- Produces: 统计表新增 兵种(万) 列；联盟列截取前 3 字符；截图 canvas 包含新列

---

- [ ] **Step 1：loadRegistrations 中增加 allianceShortName — battle-statistics.js**

在 `loadRegistrations` 的 `processed.map` 中，将：

```js
const processed = (registrations || []).map(r => ({
  ...r,
  selected: false,
  editAssignment: r.assignment || ''
}))
```

替换为：

```js
const processed = (registrations || []).map(r => ({
  ...r,
  selected: false,
  editAssignment: r.assignment || '',
  allianceShortName: (r.allianceName || '').substring(0, 3)
}))
```

- [ ] **Step 2：更新 canvas colDefs 并渲染 troopCount — battle-statistics.js**

在 `onSaveScreenshot` 中，将 `colDefs` 数组替换为（在 兵营 后插入 兵种(万)，重新分配比例使总和为 1.00）：

```js
const colDefs = [
  { key: '昵称',    ratio: 0.17 },
  { key: '联盟',    ratio: 0.10 },
  { key: '熔炉',    ratio: 0.08 },
  { key: '兵营',    ratio: 0.09 },
  { key: '兵种(万)', ratio: 0.09 },
  { key: '钻石(万)', ratio: 0.11 },
  { key: '开麦',    ratio: 0.08 },
  { key: '位置',    ratio: 0.09 },
  { key: '分配',    ratio: 0.19 }
]
```

在数据行渲染部分，将：

```js
ctx.fillText((r.allianceName || '').substring(0, 3), colDefs[1].x + 8, rowStartY)
ctx.fillText(r.furnaceLevel || '-', colDefs[2].x + 8, rowStartY)
ctx.fillText(r.barracksLevel || '-', colDefs[3].x + 8, rowStartY)
ctx.fillText(r.diamonds || '-', colDefs[4].x + 8, rowStartY)
ctx.fillText(r.voice || '-', colDefs[5].x + 8, rowStartY)
ctx.fillText(r.position || '-', colDefs[6].x + 8, rowStartY)
ctx.fillText(r.assignment || '-', colDefs[7].x + 8, rowStartY)
```

替换为：

```js
ctx.fillText((r.allianceName || '').substring(0, 3), colDefs[1].x + 8, rowStartY)
ctx.fillText(r.furnaceLevel || '-', colDefs[2].x + 8, rowStartY)
ctx.fillText(r.barracksLevel || '-', colDefs[3].x + 8, rowStartY)
ctx.fillText(r.troopCount || '-', colDefs[4].x + 8, rowStartY)
ctx.fillText(r.diamonds || '-', colDefs[5].x + 8, rowStartY)
ctx.fillText(r.voice || '-', colDefs[6].x + 8, rowStartY)
ctx.fillText(r.position || '-', colDefs[7].x + 8, rowStartY)
ctx.fillText(r.assignment || '-', colDefs[8].x + 8, rowStartY)
```

- [ ] **Step 3：语法校验 — battle-statistics.js**

```bash
node -c miniprogram/pages/user/battle-statistics/battle-statistics.js
```

预期：无报错。

- [ ] **Step 4：更新统计表 WXML — battle-statistics.wxml**

**4a** — 将联盟列表头和数据行从 `allianceName` 改为 `allianceShortName`：

表头行：保持 `联盟` 文字不变。

数据行 `{{item.allianceName}}` 替换为 `{{item.allianceShortName}}`：

```xml
<view class="col col-alliance">{{item.allianceShortName}}</view>
```

**4b** — 在兵营列 `</view>` 后、钻石列 `<view class="col col-diamonds">` 前，插入新列（表头和数据行各加一处）：

表头（`.table-header` 内，`col-barracks` 后）：

```xml
<view class="col col-troop">兵种(万)</view>
```

数据行（`.table-row` wx:for 内，`col-barracks` 后）：

```xml
<view class="col col-troop">{{item.troopCount || '-'}}</view>
```

完整表头顺序（含条件选择列）：
```
选择(条件) / 昵称 / 联盟 / 熔炉 / 兵营 / 兵种(万) / 钻石(万) / 开麦 / 位置 / 分配
```

- [ ] **Step 5：新增 col-troop 样式 — battle-statistics.wxss**

在 `.col-barracks { width: 80rpx; }` 行之后插入：

```css
.col-troop { width: 100rpx; }
```

同时将 `.table-body`、`.table-header`、`.table-row` 的 `min-width` 由 `650rpx` 更新为 `750rpx`，确保新列不被挤压：

```css
.table-body {
  max-height: 800rpx;
  min-width: 750rpx;
}

.table-header {
  ...
  min-width: 750rpx;
}

.table-row {
  ...
  min-width: 750rpx;
}
```

- [ ] **Step 6：Commit**

```bash
git add miniprogram/pages/user/battle-statistics/battle-statistics.js
git add miniprogram/pages/user/battle-statistics/battle-statistics.wxml
git add miniprogram/pages/user/battle-statistics/battle-statistics.wxss
git commit -m "feat: 统计表新增兵种(万)列，联盟截取前3字符，截图canvas同步更新"
```

---

## 验收检查清单

在微信开发者工具中逐项验证：

- [ ] 报名页：兵营等级显示盾/矛/射三个文本输入框，占位文本 "30"
- [ ] 报名页：兵种数量显示盾/矛/射三个数字输入框，每个右侧有 "万" 单位
- [ ] 报名页：进入页面时，若本机 storage 有 `lastBattleAllianceId` 且匹配当前联盟列表，自动选中该联盟
- [ ] 报名页：兵营任一为空点提交 → 报错"请完整填写兵营等级（盾/矛/射）"
- [ ] 报名页：兵种数量任一为空点提交 → 报错"请完整填写兵种数量（盾/矛/射）"
- [ ] 报名页：兵种数量填写非数字（如"abc"）点提交 → 报错"兵种数量请填写有效数字"
- [ ] 提交成功后：云数据库 `battleRegistrations` 新记录含 `barracksLevel: "x/x/x"` 与 `troopCount: "x/x/x"`
- [ ] 提交成功后：`wx.storage` 中 `lastBattleAllianceId` 已更新
- [ ] 统计表：联盟列仅显示联盟名前 3 个字符
- [ ] 统计表：兵营列显示 "盾/矛/射" 格式（新记录）或原始文本（历史记录）
- [ ] 统计表：新增 兵种(万) 列，新记录显示 "盾/矛/射"，历史记录显示 "-"
- [ ] 统计表截图：保存至相册的图片包含 兵种(万) 列，联盟仍为前 3 字符
- [ ] 历史记录在统计表和截图中正常显示，不报错、不崩溃
