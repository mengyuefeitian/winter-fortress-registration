---
slug: fortress-cancel-no-response
status: resolved
trigger: "测试堡垒报名后，在我的报名里面无法取消"
created: 2026-05-30
updated: 2026-05-30
---

## Symptoms

- expected: 点击取消按钮后，报名记录从列表消失
- actual: 点击取消按钮没有任何反应，页面无变化
- error_messages: 无报错信息
- timeline: 最近刚出现
- reproduction: 用区管(admin)账号完成堡垒报名，进入「我的报名」页面，点击取消按钮

## Current Focus

- hypothesis: "取消按钮的外层容器是 <text> 元素，WeChat Mini Program 的 <text> 不支持 bindtap 事件"
- test: "将外层 <text class='table-cell action-cell'> 和内层 <text bindtap> 改为 <view>"
- expecting: "点击取消按钮后弹出确认框，确认后记录消失"
- next_action: "已修复，等待验证"

## Evidence

- timestamp: 2026-05-30T00:00:00Z
  file: miniprogram/pages/user/my-registrations/my-registrations.wxml
  finding: "堡垒/官职/兵工厂/峡谷 四个取消按钮均用 <text class='table-cell action-cell'><text bindtap='...'> 结构，WeChat Mini Program 中 <text> 不投递 tap 事件"

- timestamp: 2026-05-30T00:00:00Z
  file: git log
  finding: "此结构自 commit 9fa4f57 (checkpoint) 起存在，ccb09dc 进行了 UI 重构但保留了该错误结构"

- timestamp: 2026-05-30T00:00:00Z
  file: miniprogram/utils/db.js line 793-801
  finding: "cancelRegistration 直接调用 db.collection('registrations').doc(id).update()，逻辑正确，问题在 UI 层而非数据库层"

## Eliminated

- 数据库权限问题：admin 用户自己创建的报名记录，自己有权更新（满足「仅创建者可写」规则）
- cancelRegistration JS 逻辑问题：函数实现正确，问题在事件根本未被触发

## Resolution

- root_cause: "所有四个取消按钮（堡垒/官职/兵工厂/峡谷）的外层容器和按钮本身均为 <text> 元素；WeChat Mini Program 的 <text> 组件是纯展示内联元素，不支持 bindtap 触摸事件，导致点击无响应"
- fix: "将四处 <text class='table-cell action-cell'><text bindtap='...'> 全部改为 <view class='table-cell action-cell'><view bindtap='...'>，共 8 个标签替换"
- verification: "在微信开发者工具中以区管身份完成堡垒报名，进入「我的报名」，点击取消按钮应弹出确认框，确认后记录消失"
- files_changed: "miniprogram/pages/user/my-registrations/my-registrations.wxml"
