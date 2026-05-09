# 时间段配置功能改进实施计划

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 改进时间段配置页面，添加日期选择和标签功能，修复超管入口缺失bug。

**Architecture:** 
- 将 remark 字段改为 tag（标签单选）
- 添加 date 字段用于日期选择
- 在报名和统计页面展示标签
- 超管首页添加时间段配置入口

**Tech Stack:** 微信小程序 + 云数据库

---

## Task 1: 修复超管时间段配置入口缺失

**Objective:** 在超管首页添加时间段配置入口

**Files:**
- Modify: `miniprogram/pages/superAdmin/home/home.wxml` (添加时间段配置卡片)
- Modify: `miniprogram/pages/superAdmin/home/home.js` (添加跳转函数)

**Step 1: 添加时间段配置卡片到WXML**

在 `goToPositionManage` 卡片后面添加：

```xml
<view class="function-card" bindtap="goToTimeSlotConfig">
  <view class="function-content">
    <text class="function-name">时间段配置</text>
    <text class="function-desc">配置堡垒活动时间</text>
  </view>
</view>
```

**Step 2: 添加跳转函数到JS**

在 `goToPositionManage` 函数后面添加：

```javascript
goToTimeSlotConfig: function () {
  wx.navigateTo({
    url: '/pages/admin/time-slot-config/time-slot-config'
  })
},
```

**Step 3: 验证**

- 超管登录 → 进入超管首页 → 点击时间段配置 → 应跳转到时间段配置页面

---

## Task 2: 重构时间段配置页面UI - 紧凑布局

**Objective:** 参考 position-manage 的紧凑布局设计

**Files:**
- Modify: `miniprogram/pages/admin/time-slot-config/time-slot-config.wxml`
- Modify: `miniprogram/pages/admin/time-slot-config/time-slot-config.wxss`

**Step 1: 修改WXML布局为紧凑两行布局**

将配置区域改为：
```xml
<!-- 紧凑配置区域 -->
<view class="card">
  <!-- 第一行：分区 + 联盟 -->
  <view class="form-row">
    <view class="form-col">
      <text class="form-label">分区</text>
      <picker range="{{zones}}" range-key="zoneName" value="{{zoneIndex}}" bindchange="onZoneChange">
        <view class="picker">{{selectedZone.zoneName || '请选择'}}</view>
      </picker>
    </view>
    <view class="form-col">
      <text class="form-label">联盟</text>
      <picker range="{{alliances}}" range-key="allianceName" value="{{allianceIndex}}" bindchange="onAllianceChange">
        <view class="picker">{{selectedAlliance.allianceName || '请选择'}}</view>
      </picker>
    </view>
  </view>
  
  <!-- 第二行：日期 + 时间 -->
  <view class="form-row">
    <view class="form-col">
      <text class="form-label">日期</text>
      <picker mode="date" value="{{selectedDate}}" bindchange="onDateChange">
        <view class="picker">{{selectedDate || '请选择'}}</view>
      </picker>
    </view>
    <view class="form-col">
      <text class="form-label">时间</text>
      <picker range="{{TIME_OPTIONS}}" range-key="label" value="{{selectedTimeIndex}}" bindchange="onBaseTimeChange">
        <view class="picker">{{selectedTime.label}}</view>
      </picker>
    </view>
  </view>
  
  <!-- 第三行：标签选择 -->
  <view class="form-row">
    <view class="form-col-full">
      <text class="form-label">标签</text>
      <view class="tag-options">
        <view wx:for="{{TAG_OPTIONS}}" wx:key="*this" 
              class="tag-option {{selectedTag === item ? 'active' : ''}}"
              bindtap="onTagSelect" data-tag="{{item}}">
          {{item}}
        </view>
      </view>
    </view>
  </view>
  
  <button class="btn btn-primary btn-full" bindtap="addTimeSlot">添加时间段</button>
</view>
```

**Step 2: 更新WXSS为微信风格紧凑布局**

使用与 position-manage.wxss 相同的紧凑样式。

---

## Task 3: 添加标签数据和处理逻辑

**Objective:** 在JS中添加标签选项和处理逻辑

**Files:**
- Modify: `miniprogram/pages/admin/time-slot-config/time-slot-config.js`

**Step 1: 添加标签常量和数据**

在 data 中添加：
```javascript
TAG_OPTIONS: ['高迁', '生命', '穿透', '加兵', '火晶', '橙碎', '加速', '螺丝', '宠石', '宠箱', '其他'],
selectedTag: '',
selectedDate: '',
```

**Step 2: 添加日期选择处理**

```javascript
onDateChange: function (e) {
  this.setData({
    selectedDate: e.detail.value
  })
},
```

**Step 3: 添加标签选择处理**

```javascript
onTagSelect: function (e) {
  const tag = e.currentTarget.dataset.tag
  this.setData({
    selectedTag: this.data.selectedTag === tag ? '' : tag
  })
},
```

---

## Task 4: 更新数据库createTimeSlot函数支持date和tag

**Objective:** 修改创建时间段函数，增加date和tag参数

**Files:**
- Modify: `miniprogram/utils/db.js:336-352`

**Step 1: 修改createTimeSlot函数**

```javascript
async function createTimeSlot(zoneId, allianceId, timeValue, slotIndex, date, tag) {
  const db = getDb()
  const displayName = slotIndex > 1 ? `${timeValue}-${slotIndex}` : timeValue

  return await db.collection('timeSlots').add({
    data: {
      zoneId: zoneId,
      allianceId: allianceId,
      timeValue: timeValue,
      slotIndex: slotIndex,
      displayName: displayName,
      date: date || '',
      tag: tag || '',
      maxCount: 15,
      status: 'active',
      createTime: db.serverDate()
    }
  })
}
```

**Step 2: 更新导出列表**

在导出的 createTimeSlot 后添加参数说明注释。

---

## Task 5: 更新时间段列表显示标签

**Objective:** 在时间段列表中显示标签而非备注

**Files:**
- Modify: `miniprogram/pages/admin/time-slot-config/time-slot-config.wxml`

**Step 1: 修改时间段卡片显示**

```xml
<view wx:for="{{timeSlots}}" wx:key="_id" class="slot-card">
  <view class="slot-header">
    <view class="slot-time">
      {{item.displayName}}
      <text wx:if="{{item.tag}}" class="slot-tag">{{item.tag}}</text>
    </view>
    <view class="slot-count">{{item.currentCount}}/{{item.maxCount}}人</view>
  </view>
  <view wx:if="{{item.date}}" class="slot-date">日期: {{item.date}}</view>
</view>
```

---

## Task 6: 更新报名页面显示标签

**Objective:** 在报名页面时间段卡片中显示标签

**Files:**
- Modify: `miniprogram/pages/user/registration/registration.wxml:43-49`

**Step 1: 修改时间段卡片**

```xml
<view wx:for="{{timeSlots}}" wx:key="_id" class="time-slot-card">
  <view class="slot-time">
    {{item.displayName}}
    <text wx:if="{{item.tag}}" class="slot-tag">{{item.tag}}</text>
  </view>
  <view class="slot-count">{{item.count}}/{{item.maxCount}}</view>
  <view wx:if="{{item.date}}" class="slot-date">{{item.date}}</view>
</view>
```

---

## Task 7: 更新统计页面显示标签

**Objective:** 在统计页面中显示标签

**Files:**
- Modify: `miniprogram/pages/admin/statistics/statistics.wxml`
- Modify: `miniprogram/pages/auditor/statistics/statistics.wxml`

---

## Task 8: 更新时间段编辑功能为标签选择

**Objective:** 编辑时使用标签选择而非备注输入

**Files:**
- Modify: `miniprogram/pages/admin/time-slot-config/time-slot-config.wxml`
- Modify: `miniprogram/pages/admin/time-slot-config/time-slot-config.js`

**Step 1: 添加编辑标签弹窗**

点击编辑按钮时显示标签选择弹窗，而非输入框。

---

## Critical Files Summary

| 文件 | 改动类型 |
|------|----------|
| `miniprogram/pages/superAdmin/home/home.wxml` | 添加入口 |
| `miniprogram/pages/superAdmin/home/home.js` | 添加跳转函数 |
| `miniprogram/pages/admin/time-slot-config/time-slot-config.wxml` | UI重构 |
| `miniprogram/pages/admin/time-slot-config/time-slot-config.wxss` | 紧凑样式 |
| `miniprogram/pages/admin/time-slot-config/time-slot-config.js` | 标签逻辑 |
| `miniprogram/utils/db.js` | createTimeSlot增加参数 |
| `miniprogram/pages/user/registration/registration.wxml` | 显示标签 |

---

## Verification

测试步骤：
1. 超管首页 → 点击时间段配置 → 正常跳转
2. 时间段配置 → 选择分区、联盟、日期、时间、标签 → 添加成功
3. 报名页面 → 时间段卡片显示标签
4. 统计页面 → 显示标签