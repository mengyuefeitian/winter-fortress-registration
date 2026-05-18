---
status: awaiting_human_verify
trigger: "Debug two errors in arsenal-canyon-registration: Error 1 - collection not exists (arsenalConfigs), Error 2 - query params all undefined"
created: 2026-05-17T12:00:00Z
updated: 2026-05-17T12:20:00Z
---

## Current Focus

hypothesis: "CONFIRMED. Error 1: db-init.js defines 4 arsenal/canyon collections but was never called from app.js, so collections were never created. Error 2: arsenal-config pages lacked defensive null checks for selectedZone/selectedAlliance before building configData for cloud function calls."
test: "Applied fixes: (1) integrated db-init.js into app.js onLaunch, improved initDatabase to use db.createCollection(), (2) added null checks in admin/superAdmin/auditor arsenal-config pages."
expecting: "After deploying, collections will be auto-created on app launch, and form validation will prevent undefined parameters."
next_action: "Commit changes and prepare for deployment verification"

## Symptoms

expected: Clicking "兵工厂报名" page should load configs. Adding arsenal config should succeed with valid form data.
actual: Error 1: "collection.get:fail -502005 database collection not exists. [ResourceNotFound] Db or Table not exist: arsenalConfigs" at db.js:1393. Error 2: "添加失败: Error: 查询参数对象值不能均为undefined" at db.js:1372.
errors: ["collection.get:fail -502005 database collection not exists. [ResourceNotFound] Db or Table not exist: arsenalConfigs", "添加失败: Error: 查询参数对象值不能均为undefined"]
reproduction: 1. Open "兵工厂报名" page -> Error 1. 2. Try to add arsenal config -> Error 2.
started: Always broken — collections never created since manageArsenal feature was added.

## Eliminated

## Evidence

- timestamp: 2026-05-17T12:00:00Z
  checked: miniprogram/scripts/db-init.js
  found: COLLECTIONS array includes arsenalConfigs, arsenalRegistrations, canyonConfigs, canyonRegistrations
  implication: Collections are defined in db-init.js

- timestamp: 2026-05-17T12:01:00Z
  checked: miniprogram/app.js — searched for db-init, dbInit, initDatabase
  found: No references to db-init.js or initDatabase()
  implication: db-init.js is never called — collections are never auto-created

- timestamp: 2026-05-17T12:02:00Z
  checked: miniprogram/cloudfunctions/manageArsenal/index.js
  found: Uses collections arsenalConfigs, canyonConfigs, arsenalRegistrations, canyonRegistrations via getCollectionNames() mapping
  implication: Cloud function is correct but collections must exist

- timestamp: 2026-05-17T12:03:00Z
  checked: miniprogram/pages/admin/arsenal-config/arsenal-config.js — addConfig function
  found: configData built from this.data.selectedZone._id, selectedAlliance._id without null guard after showLoading
  implication: If selectedZone or selectedAlliance is null, _id would be undefined

- timestamp: 2026-05-17T12:04:00Z
  checked: miniprogram/pages/auditor/arsenal-config/arsenal-config.js — addConfig function
  found: No check for this.data.zoneId before building configData
  implication: If zoneId is null (e.g., verifyAllianceAccess fails silently), zoneId in configData would be undefined

## Resolution

root_cause: "Error 1: db-init.js defines 4 collections (arsenalConfigs, arsenalRegistrations, canyonConfigs, canyonRegistrations) but is never imported or called from app.js, so collections are never created. Error 2: arsenal-config pages (admin, superAdmin, auditor) lacked defensive null checks for zone/alliance data before building configData for cloud function calls. When collections don't exist, the cloud function's database operations produce cryptic errors."
fix: "1. Import db-init.js in app.js onLaunch and call initDatabase() to auto-create all collections on app start. 2. Improved initDatabase() to use db.createCollection() for explicit collection creation. 3. Added defensive null checks for selectedZone._id and selectedAlliance._id in admin/superAdmin arsenal-config pages, and zoneId check in auditor page, before calling createArsenalConfig/createCanyonConfig."
verification: "Pending: user needs to deploy updated cloud function code (if not already deployed), upload mini-program code, and test on real device."
files_changed: ["miniprogram/app.js", "miniprogram/scripts/db-init.js", "miniprogram/pages/admin/arsenal-config/arsenal-config.js", "miniprogram/pages/superAdmin/arsenal-config/arsenal-config.js", "miniprogram/pages/auditor/arsenal-config/arsenal-config.js"]
