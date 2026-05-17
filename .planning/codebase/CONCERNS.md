# Codebase Concerns

**Analysis Date:** 2026-05-17

## Security Concerns

### Auth Bypass: Cloud Functions Lack Caller Verification

**Risk: HIGH**
- Files: `miniprogram/cloudfunctions/manageZone/index.js` (all actions), `miniprogram/cloudfunctions/manageAdmin/index.js`, `miniprogram/cloudfunctions/manageTimeSlot/index.js`, `miniprogram/cloudfunctions/managePosition/index.js`, `miniprogram/cloudfunctions/clearRegistrations/index.js`, `miniprogram/cloudfunctions/clearExpiredData/index.js`

**What happens:** None of the cloud functions verify the caller's identity or role before executing actions. They accept `event.action` and `event.data` from the client without checking `cloud.getWXContext().OPENID` against the requested operation. For example, `manageZone`'s `deleteZone` action (line 105-116) accepts any `zoneId` and deletes it without verifying the caller is an admin of that zone. `manageAdmin`'s `updateUserRole` (line 97-108) accepts any `userId` and `role` — a malicious client could elevate any user to superAdmin.

**Impact:** Any authenticated user can call these cloud functions directly to:
- Delete any zone (`manageZone/delete`)
- Change any user's role (`manageAdmin/updateRole`)
- Clear all registrations (`clearRegistrations/clearAll`)
- Delete any time slot (`manageTimeSlot/delete`)

**Current mitigation:** Database-level permissions restrict collection writes to "creator only" for most collections. However, cloud functions run with full admin privileges, bypassing these restrictions entirely.

**Recommendations:**
1. Every cloud function action should extract `openid` from `cloud.getWXContext()` and verify the caller has permission for the requested operation
2. Implement a permission check middleware pattern at the top of each `exports.main`
3. For `clearExpiredData/clearAll`, add explicit superAdmin-only verification

### Cloud Environment ID Hardcoded Inconsistently

**Risk: LOW (but operational risk)**
- Files: `miniprogram/cloudfunctions/login/index.js` (line 5: `env: 'cloud1-9gip4qyf7e753868'`), `miniprogram/app.js` (line 21), `miniprogram/pages/login/login.js` (line 77)

**What happens:** The `login` cloud function hardcodes the environment ID instead of using `cloud.DYNAMIC_CURRENT_ENV` (which all other cloud functions use). If the environment ID ever changes, the login function must be redeployed separately.

**Impact:** Minor deployment friction. Most functions use `DYNAMIC_CURRENT_ENV` but login does not.

### SuperAdmin Detection Depends on Local Phone Data

**Risk: MEDIUM**
- Files: `miniprogram/app.js` (lines 124-152), `miniprogram/pages/login/login.js` (lines 266-283)

**What happens:** SuperAdmin status is determined by querying the `superAdmins` collection for the user's phone number. However, the login page (`login.js` lines 266-283) can directly update a user's role to `superAdmin` and persist it to the cache without going through any server-side verification gate. The cache (`wx.setStorageSync('userInfo', finalUserInfo)`) stores the elevated role, and subsequent `autoLogin` reads from cache.

**Impact:** If an attacker can manipulate the `superAdmins` collection (which is "creator-only read/write"), they could grant themselves superAdmin. The local cache would then persist the elevated role even after the database is corrected.

### Database Permissions: `users` and `admins` Collections Are World-Readable/Writable

**Risk: MEDIUM**
- Per `CLAUDE.md`: `users`, `admins` collections have "所有人可读写" (everyone can read/write)

**What happens:** Any authenticated user can read all user records (including phone numbers) and all admin application records. They can also write to these collections.

**Impact:**
- User phone numbers are exposed to any authenticated user
- Admin applications can be manipulated by anyone (create fake applications, modify existing ones)
- The `reviewAdminApplication` in `db.js` (line 223) writes to `admins` collection — this works because it's world-writable, but anyone else can too

## Data Integrity Concerns

### Race Condition: Fortress Registration Capacity Check

**Risk: HIGH**
- Files: `miniprogram/cloudfunctions/register/index.js` (lines 37-79)

**What happens:** The `createRegistration` function checks the current count against `maxCount` (line 39-48), then creates the record (line 63). These are two separate database operations with no transaction or locking. Under concurrent load, two users could both pass the capacity check simultaneously, exceeding the intended limit.

**Impact:** Time slots could exceed `maxCount` by 1-2 registrations under concurrent registration scenarios.

**Note:** The `managePosition/createRegistration` cloud function (line 150-216) uses transactions correctly for position registrations, but the fortress registration path (`register/index.js`) does not.

### Non-Atomic Check-Then-Insert Patterns Throughout

**Risk: MEDIUM**
- Files: `miniprogram/utils/db.js` (`createPositionRegistration` lines 949-990, `createBattleRegistration` lines 1253-1286, `createZone` lines 265-283)

**What happens:** Multiple functions follow the pattern: (1) check if record exists, (2) throw if exists, (3) create record. Between steps 1 and 3, another concurrent request could create the same record.

**Specific examples:**
- `createPositionRegistration` (`db.js` line 949): checks nickname uniqueness, then time slot uniqueness, then creates — all non-atomically
- `createBattleRegistration` (`db.js` line 1253): checks nickname uniqueness, then creates
- `createZone` (`db.js` line 265): checks zone code uniqueness, then creates (the cloud function version in `manageZone/index.js` line 52 has the same issue)

**Impact:** Duplicate registrations or zones could be created under concurrent requests.

### Phone Number Type Inconsistency Persists

**Risk: MEDIUM**
- Files: `miniprogram/utils/db.js` (lines 87-105, 1152-1176), `miniprogram/app.js` (lines 134-141), `miniprogram/pages/login/login.js` (lines 268-269)

**What happens:** Historical data stores phones as both strings and numbers. The codebase handles this by querying twice (string first, then parseInt fallback), doubling the query count for every phone lookup.

**Impact:**
- Performance: 2x queries for every phone lookup
- Fragility: If a third type variation appears (e.g., floating point), the fallback pattern breaks
- The dual-query pattern is repeated in at least 4 locations without abstraction

**Recommendation:** Run a one-time migration to normalize all phone fields to strings, then remove the dual-query pattern.

### `clearExpiredData` Auto-Clear Deletes Active Fortress Registrations Indiscriminately

**Risk: MEDIUM**
- Files: `miniprogram/cloudfunctions/clearExpiredData/index.js` (lines 42-91)

**What happens:** The `autoClear` function (line 55-58) removes ALL `registrations` where `createTime < 30 days ago` regardless of status. This includes `active` registrations that may still be relevant.

**Impact:** Users with legitimate active registrations older than 30 days would have their data deleted without warning. There is no dry-run or notification before the purge.

### Orphaned Records After Deletion

**Risk: LOW-MEDIUM**
- Files: `miniprogram/utils/db.js` (`deleteTimeSlot` lines 652-665, `deleteBattleConfig` lines 1242-1250)

**What happens:** When a timeSlot is deleted, related registrations are removed (line 655-657). But when registrations reference a timeSlot that was deleted by another path (e.g., `clearRegistrations` cloud function), the registration records become orphaned with dangling `timeSlotId` references.

**Impact:** The `clearExpiredData` cloud function attempts to clean these up (lines 266-292 in `clearExpiredByAlliance`), but this is a reactive cleanup that runs on a schedule, not a preventive measure.

## Performance Bottlenecks

### N+1 Query Pattern in Statistics

**Risk: HIGH (scales poorly)**
- Files: `miniprogram/cloudfunctions/getStatistics/index.js` (lines 31-57, 60-79, 82-101), `miniprogram/utils/db.js` (lines 776-818)

**What happens:** `getAllianceStatistics` fetches all timeSlots, then for each timeSlot fetches all registrations in a separate query (line 40). `getZoneStatistics` calls `getAllianceStatistics` for each alliance in a loop. `getAllStatistics` calls `getZoneStatistics` for each zone in a loop.

**Query count for a zone with 12 alliances and 5 time slots each: 1 + 12 + (12 * 5) = 73 queries.**

**Impact:** Statistics page will become noticeably slow as the number of zones/alliances/timeSlots grows. The `db.js` version (`getAllianceStatistics` line 776) does paginate registrations but still queries per timeSlot.

**Recommendation:** Use a single query with `db.command.in(timeSlotIds)` to fetch all registrations at once, then group in memory.

### Pagination Hard-Capped at 500 Records

**Risk: MEDIUM**
- Files: `miniprogram/utils/db.js` (`getAllZones` line 309, `getZonesByCreator` line 333, `getAllianceStatistics` line 797, `getBattleConfigs` line 1228)

**What happens:** Multiple functions use manual pagination with `offset > 500` as a hard break:
```javascript
if (offset > 500) break
```

**Impact:** If any collection exceeds 500 records for a given query, data will be silently truncated. For example, `getAllZones()` would only return the first 500 zones.

### `clearExpiredData` Loads Entire Collections Into Memory

**Risk: MEDIUM**
- Files: `miniprogram/cloudfunctions/clearExpiredData/index.js` (`getAllRecords` helper lines 12-31, used throughout)

**What happens:** The `getAllRecords` helper fetches all records from a collection in batches of 100 and accumulates them in an array. Functions like `clearExpiredByZone` call this for multiple collections (alliances, timeSlots, registrations, positionConfigs, positionRegistrations).

**Impact:** For large datasets, this can exceed cloud function memory limits. The `clearExpiredAll` function (line 537) loads ALL records from ALL collections — this could easily hit memory limits at scale.

### Client-Side Batch Pagination in Registration Page

**Risk: LOW-MEDIUM**
- Files: `miniprogram/pages/user/registration/registration.js` (lines 210-222)

**What happens:** The registration page manually pag registrations in batches of 20 with a 500 record cap. This is done on the client side during `loadTimeSlots`.

**Impact:** If a time slot has more than 500 registrations, the count will be wrong and the slot might appear not-full when it actually is.

## Scalability Risks

### Single Environment, No Multi-Tenancy Isolation

**Risk: MEDIUM**
- Files: All cloud functions share `cloud1-9gip4qyf7e753868`

**What happens:** All data for all zones/alliances/users lives in a single cloud environment. There is no data partitioning or tenant isolation at the infrastructure level.

**Impact:** As the number of zones and users grows, query performance will degrade uniformly across all tenants. A single misbehaving query (like `getAllStatistics`) affects everyone.

### `auditorId` to `auditorIds` Migration Debt

**Risk: LOW (but persistent)**
- Files: `miniprogram/utils/db.js` (lines 369-374, 430-434, 465-469), `miniprogram/cloudfunctions/manageZone/index.js` (lines 168-174, 193-199, 220-226, 248-252)

**What happens:** The migration from single `auditorId` to array `auditorIds` is handled with backward-compatible checks scattered throughout the codebase. Every alliance read operation checks for the old field. Every write operation sets `auditorId: null` alongside `auditorIds`.

**Impact:** This adds branching logic to every alliance operation. The migration debt will persist indefinitely unless a one-time data migration is performed.

### `manageZone` Cloud Function Is a God Function

**Risk: MEDIUM**
- Files: `miniprogram/cloudfunctions/manageZone/index.js` (49 lines main, 290 total)

**What happens:** The `manageZone` cloud function handles 10 different actions: zone CRUD, alliance management, auditor binding, member removal, zone admin addition. It also has the `removeMember` function (lines 242-311) that spans 70 lines and touches 3 collections.

**Impact:** Any change to one action risks breaking another. The function is hard to reason about and test.

## Maintainability Concernes

### No Input Validation in Cloud Functions

**Risk: MEDIUM**
- Files: All cloud functions

**What happens:** Cloud functions accept `event.data` parameters without validation. For example, `manageTimeSlot/create` (line 41-62) accepts `data.maxCount` without checking if it's a positive number. `manageAdmin/reviewApplication` (line 75-94) accepts any `status` value without validating it's 'approved' or 'rejected'.

**Impact:** Invalid or malformed data can be written directly to the database.

### Magic Numbers Scattered Throughout

**Risk: LOW**
- Files: `miniprogram/utils/db.js` (maxCount default 15 at lines 238, 815), `miniprogram/cloudfunctions/manageTimeSlot/index.js` (maxCount default 15 at line 53), `miniprogram/cloudfunctions/register/index.js` (maxCount default 15 at line 45)

**What happens:** The default `maxCount` of 15 is hardcoded in at least 3 separate locations. If this default needs to change, all locations must be updated.

**Impact:** Configuration drift if one location is updated but others are not.

### Pagination Limit Inconsistency

**Risk: LOW**
- Files: Various

**What happens:** Pagination batch sizes are inconsistent: 20 in `db.js` functions, 100 in `clearExpiredData/getAllRecords`. The skip-limit offset pattern also has a 500-record hard cap in some places but not others.

### `generateId` Uses Time-Based IDs (Collision Risk)

**Risk: LOW**
- Files: `miniprogram/utils/util.js` (line 183-185)

**What happens:**
```javascript
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}
```
This produces ~15 character IDs based on timestamp + random. Under concurrent requests within the same millisecond, collisions are possible (though unlikely).

**Impact:** WeChat Mini Program's database auto-generates `_id` fields, so this function is likely used for application-level IDs only. Still, collisions would cause data loss.

### `console.log` Statements in Production Code

**Risk: LOW**
- Files: Nearly all files (`db.js`, `app.js`, `login.js`, `registration.js`, cloud functions)

**What happens:** Extensive `console.log` statements throughout production code. These execute on every call and increase cloud function logging costs.

**Impact:** Increased cloud function logging costs, potential information leakage in logs (phone numbers, user IDs, etc.).

### Cloud Functions Without `package.json` Dependencies

**Risk: LOW**
- Files: Cloud function directories

**What happens:** All cloud functions only depend on `wx-server-sdk`. However, some cloud functions that are listed in the directory (like `sendFeedbackEmail`) were not examined and may have additional dependencies.

### No Error Boundary / Global Error Handler

**Risk: LOW-MEDIUM**
- Files: All page `.js` files

**What happens:** Each page handles errors independently with `try/catch` and `util.showError`. There is no global error handler or error boundary pattern. If an unhandled exception occurs (e.g., in a callback), the app may enter an inconsistent state.

**Impact:** Unhandled errors may leave the UI in a loading state or cause silent failures.

## Missing Critical Features

### No Rate Limiting

**Risk: MEDIUM**
- Files: All cloud functions

**What happens:** There is no rate limiting on any cloud function action. A user could call `createRegistration` hundreds of times per second.

**Impact:** Under abuse, this could lead to data inconsistency (race conditions), resource exhaustion, or inflated cloud function costs.

### No Audit Trail for Destructive Operations

**Risk: LOW-MEDIUM**
- Files: `miniprogram/cloudfunctions/clearRegistrations/index.js`, `miniprogram/cloudfunctions/clearExpiredData/index.js`

**What happens:** Operations like `clearAll`, `clearByZone`, `clearByAlliance`, and `autoClear` permanently delete data without any audit log recording who performed the action, when, or what was deleted.

**Impact:** If data is accidentally cleared, there is no way to recover or investigate what happened.

### No Backup/Recovery Mechanism

**Risk: MEDIUM**

**What happens:** The codebase has no built-in backup or data export functionality. All data deletion operations are irreversible.

**Impact:** Accidental data loss (through bugs or misuse of clear operations) cannot be recovered from within the application.

## Fragile Areas

### Admin Review Flow Depends on `openid` Not `_id`

**Risk: MEDIUM**
- Files: `miniprogram/pages/superAdmin/admin-review/admin-review.js` (lines 370-399, 674-704)

**What happens:** The admin review page stores `userId` as `openid` in `admins` collection, but zones and alliances reference users by MongoDB `_id`. The review flow has to work around this by looking up the real `_id` from the `users` collection at review time (lines 378-389, 685-699).

**Impact:** If the user hasn't logged in yet (no `users` record), the review fails with "用户数据异常". The code also saves `userOpenid` separately in the application data (line 270) as a workaround.

### `app.js` Auto-Login Uses `setTimeout` Polling

**Risk: LOW**
- Files: `miniprogram/pages/index/index.js` (lines 99-107, `waitForRoleReady`)

**What happens:** Multiple pages use `setTimeout(..., 100)` polling loops waiting for `app.globalData.roleReady`. If `roleReady` never becomes true (e.g., network failure), the polling continues indefinitely.

**Impact:** Potential infinite polling loop consuming resources.

### `computeCurrentZoneRole` Makes Multiple Database Queries Per Page Load

**Risk: LOW-MEDIUM**
- Files: `miniprogram/pages/index/index.js` (lines 268-285)

**What happens:** On every `onShow`, `updateRoleInfo` calls `computeCurrentZoneRole`, which makes separate queries for `checkIsZoneManagerInZone` and `checkIsAuditorInZone`. Each is a database query.

**Impact:** On slow networks, this adds noticeable delay to page navigation.

## Test Coverage Gaps

**Risk: HIGH**
- Files: Entire codebase

**What's not tested:** There are no test files anywhere in the codebase. No unit tests, no integration tests, no E2E tests.

**Impact:** Any change to core logic (db.js, cloud functions, auth.js) could introduce regressions with no automated detection. The test coverage is effectively 0%.

**Priority: HIGH** — This is the most critical concern. The codebase has zero automated tests, meaning every deployment is a leap of faith.

## Dependencies at Risk

### WeChat Cloud Development Platform Lock-In

**Risk: MEDIUM**

**What's wrong:** The entire backend relies on WeChat Cloud Development (wx-server-sdk, wx.cloud API). This is a proprietary platform with no portability path.

**Impact:** If the WeChat Cloud platform changes pricing, deprecates APIs, or has outages, the entire application is affected with no fallback.

### No Version Pinning for `wx-server-sdk`

**Risk: LOW**

**What's wrong:** Cloud function `package.json` files likely use `"wx-server-sdk": "latest"` or similar. If the SDK introduces breaking changes, deployed functions could break on next dependency install.

---

*Concerns audit: 2026-05-17*
