---
slug: ui-redesign-three-bugs
status: resolved
trigger: "UI改版后：1.官职报名内容空白 2.报名页标题文字黑色 3.三个管理后台全部挂了"
created: 2026-06-02
updated: 2026-06-02
---

## Symptoms

### Bug 1: 官职报名页内容空白
- expected: 官职报名页显示时间段列表，可选择报名
- actual: 页面内容空白，现有逻辑不在了
- reproduction: 进入官职报名页面

### Bug 2: 报名页标题文字黑色
- expected: 导航栏/页面左上角标题文字应与深色背景搭配（白色）
- actual: 标题文字是黑色，和新版深色背景不搭
- reproduction: 进入堡垒报名、官职报名等报名页面

### Bug 3: 三个管理后台全部挂了
- expected: 区管/盟管/超管后台正常显示
- actual: 三个管理后台全部挂了（无响应或崩溃）
- reproduction: 以区管/盟管/超管身份登录，进入各自后台

## Pre-investigation Evidence

- Bug1 根因线索：diff 显示新版 position-registration.js 缺少本地定义的
  normalizeTimeToHHMM 函数，且3处调用被移除（lines 6-10, 111-114, 151, 250）
  生产版本 454 行 vs 新版 445 行，差9行正好对应缺失内容
- Bug2 根因线索：新版 app.wxss 使用深色背景变量 --wf-bg-start:#0F172A，
  但各报名页面 .json 的 navigationBarTextStyle 未更新为 white
- Bug3 根因线索：待调查，admin/auditor/superAdmin home.js 依赖 db.js 函数，
  新版 db.js 已补回所有函数；可能是 app.wxss 全局样式破坏管理页布局

## Current Focus

- hypothesis: "All three root causes confirmed and fixed"
- test: ""
- expecting: ""
- next_action: "resolved"

## Evidence

- timestamp: 2026-06-02T19:30:00
  file: miniprogram/utils/db.js
  finding: "UI merge changed generatePositionTimeSlots to use non-padded hour (0:00 vs 00:00) AND removed normalizeTimeToHHMM calls from createPositionRegistration and getPositionRegistrationByTimeSlot. Existing DB records stored as 00:xx format won't match generated 0:xx slot keys, causing regMap lookup failures and empty slot display."

- timestamp: 2026-06-02T19:30:00
  file: miniprogram/pages/user/*.json
  finding: "All user-facing pages (battle-list, battle-registration, battle-statistics, position-list, position-registration, my-registrations, index, login) have no navigationBarTextStyle set. Default is black. New app.wxss sets dark page background (#0F172A) globally, causing black text on dark nav bar."

- timestamp: 2026-06-02T19:30:00
  file: miniprogram/app.wxss
  finding: "UI merge replaced full 1208-line Minimal Design System app.wxss with an 88-line wf-* only file. Admin/auditor/superAdmin pages use .page, .card, .card-body, .card-footer, .section-header, .function-grid, .function-card-compact, .btn-*, .text-*, .flex, .items-center, .mt-*, .ml-* etc — ALL stripped from app.wxss. Pages render with no layout, no spacing, invisible card backgrounds on dark page backdrop."

## Eliminated

- JS crash in admin pages: No syntax errors, all db.js functions used by admin pages exist
- Missing db.js functions: All functions (getAllZones, getZonesByCreator, getAlliancesByZone) confirmed present

## Resolution

- root_cause: "Bug1: generatePositionTimeSlots generates non-padded times (0:00) but DB stores normalized times (00:00), so regMap lookups fail silently. Bug2: navigationBarTextStyle defaults to black but new app.wxss sets dark page background. Bug3: UI merge replaced full 1208-line design system with 88-line wf-only file, stripping all admin page CSS utility classes."
- fix: "Bug1: Restored padStart(2,'0') for hours in generatePositionTimeSlots, restored normalizeTimeToHHMM call and db.command.in dual-format check in createPositionRegistration and getPositionRegistrationByTimeSlot in db.js. Bug2: Added navigationBarTextStyle:white and navigationBarBackgroundColor:#0F172A to 8 user-facing page JSON files. Bug3: Added full admin compatibility CSS layer to app.wxss (spacing, layout, text, card, button, tag, section-header, function-grid, status-dot, avatar, picker-compact, badge classes) plus .page class for white admin background."
- verification: "node -c db.js passes. All JSON files updated. app.wxss has all required classes verified by grep."
- files_changed: "miniprogram/utils/db.js, miniprogram/app.wxss, miniprogram/pages/user/battle-list/battle-list.json, miniprogram/pages/user/battle-registration/battle-registration.json, miniprogram/pages/user/battle-statistics/battle-statistics.json, miniprogram/pages/user/position-list/position-list.json, miniprogram/pages/user/position-registration/position-registration.json, miniprogram/pages/user/my-registrations/my-registrations.json, miniprogram/pages/index/index.json, miniprogram/pages/login/login.json"
