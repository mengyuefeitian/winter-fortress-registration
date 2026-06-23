# 国战报名优化设计

**日期**: 2026-06-23
**分支**: dev
**状态**: 已确认，待生成实现计划

## 目标

优化国战报名表单与统计展示：
1. 兵营等级拆分为 盾/矛/射 三个独立文本输入
2. 新增 兵种数量(万) 行，按 盾/矛/射 三个数字输入，带"万"单位
3. 报名时联盟默认回填用户上次选择的联盟
4. 统计表：兵营等级与兵种数量按 "盾/矛/射" 用 "/" 分割展示；联盟字段只显示前 3 字符

## 约束

- 历史数据不迁移、不转换。现有 `battleRegistrations` 中 `barracksLevel` 为自由文本，需原样显示。
- `createBattleRegistration` 位于 `miniprogram/utils/db.js`（本地直连 DB），非云函数，无云函数变更。
- 全部字段（兵营三组、兵种数量三组）必填。
- 联盟默认回填仅本机 `wx.storage` 缓存，不跨设备。

## 存储方案：组合字符串

采用方案 A。新记录将三个值用 `/` 拼接后落库，显示时直接取用。

- `barracksLevel`: `"盾/矛/射"`，如 `"30/30/30"`
- `troopCount`（新增字段）: `"盾/矛/射"`，如 `"10/20/30"`

历史记录的 `barracksLevel` 自由文本（如 `"555"`、`"30/30/30"`）原样显示，无 fallback 逻辑。
历史记录无 `troopCount` 字段，统计表显示 `-`。

## 改动范围

### 1. 报名表单 — `miniprogram/pages/user/battle-registration/`

#### battle-registration.wxml

兵营等级行：单输入框 → 三个并排文本输入框

```
兵营等级   盾[___] 矛[___] 射[___]
```

- 3 个 `input type="text"`，分别绑定 `barracksShield / barracksSpear / barracksArcher`
- placeholder 示例：盾位 "30"

新增 兵种数量(万) 行，紧跟兵营等级下方：

```
兵种数量   盾[__]万 矛[__]万 射[__]万
```

- 3 个 `input type="digit"`，分别绑定 `troopShield / troopSpear / troopArcher`
- 每个输入框右侧固定显示单位 "万"

#### battle-registration.js

data 新增：
```js
barracksShield: '', barracksSpear: '', barracksArcher: '',
troopShield: '', troopSpear: '', troopArcher: '',
```

新增 6 个 `bindinput` 处理函数（与现有 `onBarracksInput` 模式一致）。

`onLoad` 中 `loadAlliances` 完成后，读 `wx.getStorageSync('lastBattleAllianceId')`，在 `alliances` 中查找匹配项；命中则 `setData({ allianceIndex })`，未命中保持 `-1`。

`validate` 校验规则：
- 现有：联盟、昵称、熔炉、钻石校验不变
- 兵营等级：盾/矛/射 三个均 trim 后非空
- 兵种数量：盾/矛/射 三个均 trim 后非空，且为有效数字（允许小数如 `1.5`）

`onSubmit` 组装数据：
```js
barracksLevel: `${barracksShield.trim()}/${barracksSpear.trim()}/${barracksArcher.trim()}`,
troopCount: `${troopShield.trim()}/${troopSpear.trim()}/${troopArcher.trim()}`,
```
提交成功后追加：`wx.setStorageSync('lastBattleAllianceId', alliance._id)`。

#### battle-registration.wxss

为三个并排输入行新增样式类（如 `.triple-input-group`、`.unit-suffix`），保持与现有 `.form-item` / `.input-group` 风格一致。

### 2. 数据落库 — `miniprogram/utils/db.js`

`createBattleRegistration` 函数：
- 解构新增 `troopCount` 参数
- `add` 的 data 中新增 `troopCount: troopCount` 字段
- 其余字段不变

### 3. 统计表 — `miniprogram/pages/user/battle-statistics/`

#### battle-statistics.js

`loadRegistrations` 中 `processed.map` 增加：`allianceShortName: (r.allianceName || '').substring(0, 3)`（注意：截取 3 个字符，中文按字符计）。

#### battle-statistics.wxml

- 联盟列：`{{item.allianceName}}` → `{{item.allianceShortName}}`
- 兵营列：保持 `{{item.barracksLevel}}`（已是 "盾/矛/射" 格式，历史自由文本也原样显示）
- 新增 兵种(万) 列，插在 兵营 与 钻石 之间：`{{item.troopCount || '-'}}`

表头顺序：选择 / 昵称 / 联盟 / 熔炉 / 兵营 / 兵种(万) / 钻石(万) / 开麦 / 位置 / 分配

#### battle-statistics.js 截图 canvas（`onSaveScreenshot`）

- `colDefs` 新增 `{ key: '兵种(万)', ratio: ... }`，插在 兵营 后
- 重新分配各列 ratio 使总宽度=1.0
- 数据行新增：`ctx.fillText(r.troopCount || '-', colDefs[idx].x + 8, rowStartY)`
- 联盟截取前 3 字符逻辑已存在（`.substring(0,3)`），保持不变

#### battle-statistics.wxss

如新增列需要列宽样式（`col-troop`），补充对应 class。

## 不改动范围

- 历史数据不迁移、不转换
- 不改云函数（无云函数变更）
- 不改熔炉/钻石/开麦/位置 等其它字段
- 不改 `getBattleRegistrationsByConfig`（返回原始记录即可，新字段自动带上）

## 验收标准

1. 报名页：兵营等级显示 盾/矛/射 三个输入框；兵种数量显示 盾/矛/射 三个输入框且每个带"万"单位
2. 报名页：进入页面时，若本机缓存有上次联盟，自动选中该联盟
3. 提交后：`battleRegistrations` 新记录含 `barracksLevel`（"x/x/x"）与 `troopCount`（"x/x/x"）两个字段
4. 统计表：联盟列只显示前 3 字符；兵营列显示 "盾/矛/射"；新增 兵种(万) 列显示 "盾/矛/射"，历史无该字段的记录显示 "-"
5. 统计表截图：包含新增的 兵种(万) 列，联盟仍为前 3 字符
6. 校验：兵营三组、兵种数量三组任一为空均报错并阻止提交
7. 历史记录（无 troopCount）在统计表与截图中正常显示，不报错

## 风险

- 历史记录 `barracksLevel` 为自由文本，统计表会显示原值（如 "555"），与新的 "30/30/30" 格式混杂。这是预期行为，不做转换。
- `troopCount` 为新增字段，老记录缺失，已通过 `|| '-'` 兜底。
