<!-- refreshed: 2026-05-17 -->
# Architecture

**Analysis Date:** 2026-05-17

## System Overview

A WeChat Mini Program for alliance activity registration management ("无尽冬日堡垒分配"). The system supports two independent registration sub-systems: fortress registration (堡垒报名) and position registration (官职报名), with a later-added battle registration (国战报名) system.

```text
┌─────────────────────────────────────────────────────────────┐
│                      WeChat Mini Program Client               │
├──────────────────┬──────────────────┬───────────────────────┤
│   Pages (31)     │   Components (1) │   Utils (5)           │
│   [pages/]*      │   zone-selector  │   app.js (globalState)│
│   Role-scoped:   │   [components/]  │   auth.js (perm.)     │
│   index, login,  │                  │   db.js (data ops)    │
│   user/*,        │                  │   util.js (helpers)   │
│   admin/*,       │                  │   version.js          │
│   auditor/*,     │                  │                        │
│   superAdmin/*   │                  │                        │
└────────┬─────────┴──────────────────┴──────────┬────────────┘
         │                                       │
         │ wx.cloud.callFunction({action, data}) │
         │ wx.cloud.database() (client-side)     │
         ▼                                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    WeChat Cloud Functions (12)                │
│         [miniprogram/cloudfunctions/]                         │
├──────────────┬──────────────┬────────────────────────────────┤
│ login        │ register     │ getStatistics                  │
│ manageZone   │ manageAdmin  │ manageTimeSlot                 │
│ managePosition            │ manageUserIdentity               │
│ clearRegistrations        │ clearExpiredData                 │
│ sendFeedbackEmail         │ migrate-zone-admin-ids           │
│ repair-zone-creator        │                                │
└────────┬──────────────────┴──────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  WeChat Cloud Database (MongoDB-based)                       │
│  Collections: users, zones, alliances, timeSlots,            │
│  registrations, admins, superAdmins, positionConfigs,        │
│  positionRegistrations, battleConfigs, battleRegistrations,  │
│  feedbacks                                                  │
└─────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| App entry | Global state, auto-login flow, cloud init, superAdmin detection | `miniprogram/app.js` |
| Page routes | All 31 page routes, tabBar config, lazy loading | `miniprogram/app.json` |
| Auth | Role-permission mapping, capability checks (canManageZone, canReviewAdmin, etc.) | `miniprogram/utils/auth.js` |
| Database | All CRUD operations for every collection, preset constants | `miniprogram/utils/db.js` |
| Utils | Date formatting, validation, UI helpers (showToast/showLoading), debounce/throttle | `miniprogram/utils/util.js` |
| Version | Centralized version number (APP_VERSION), dynamic version display | `miniprogram/utils/version.js` |
| Zone selector | Reusable zone picker with keyword search filtering | `miniprogram/components/zone-selector/zone-selector.js` |
| Login cloud fn | openid retrieval, phone number decryption | `miniprogram/cloudfunctions/login/index.js` |
| Register cloud fn | Fortress registration with capacity/duplication checks | `miniprogram/cloudfunctions/register/index.js` |
| manageZone | Zone CRUD, alliance name updates, auditor binding, member removal | `miniprogram/cloudfunctions/manageZone/index.js` |
| manageAdmin | Admin application lifecycle (create/review/update role) | `miniprogram/cloudfunctions/manageAdmin/index.js` |
| manageTimeSlot | Time slot CRUD, tag/remark updates | `miniprogram/cloudfunctions/manageTimeSlot/index.js` |
| managePosition | Position config + registration CRUD, transactional registration | `miniprogram/cloudfunctions/managePosition/index.js` |
| getStatistics | Alliance/zone/global statistics aggregation | `miniprogram/cloudfunctions/getStatistics/index.js` |
| clearRegistrations | Expired data cleanup by alliance/zone/all scopes | `miniprogram/cloudfunctions/clearRegistrations/index.js` |
| clearExpiredData | Scheduled auto-cleanup (30-day retention) | `miniprogram/cloudfunctions/clearExpiredData/index.js` |
| manageUserIdentity | Zone admin binding by phone, pre-binding flow | `miniprogram/cloudfunctions/manageUserIdentity/index.js` |
| sendFeedbackEmail | SMTP email notifications for feedback (163.com) | `miniprogram/cloudfunctions/sendFeedbackEmail/index.js` |
| migrate-zone-admin-ids | One-time migration: creatorId -> adminIds | `miniprogram/cloudfunctions/migrate-zone-admin-ids/index.js` |
| repair-zone-creator | Batch repair: bind approved admins to zones | `miniprogram/cloudfunctions/repair-zone-creator/index.js` |

## Pattern Overview

**Overall:** Client-server with action-based cloud function routing

**Key Characteristics:**
- **Action-based routing**: Every cloud function uses `event.action` switch pattern to dispatch to internal handlers
- **Shared utility layer**: All pages import from `utils/db.js`, `utils/auth.js`, `utils/util.js` — no direct database calls in pages
- **Global state pattern**: `app.globalData` holds userInfo, openid, role, phone, currentZone, currentAlliance, dbReady, roleReady flags
- **Role-scoped pages**: Pages are organized by role directory (`pages/admin/`, `pages/auditor/`, `pages/superAdmin/`, `pages/user/`)
- **Hybrid data access**: Pages call `db.js` helpers which route some operations through cloud functions (for permission bypass or consistency) and others directly to the client-side database SDK
- **Soft-delete pattern**: Entities use `status` field ('active'/'inactive'/'cancelled'/'deleted'/'cleared') rather than hard deletion

## Layers

**Presentation (Pages + Component):**
- Purpose: UI rendering, user interaction handling
- Location: `miniprogram/pages/`, `miniprogram/components/`
- Contains: `.js` (logic), `.json` (config), `.wxml` (template), `.wxss` (styles)
- Depends on: Utils layer (`auth.js`, `db.js`, `util.js`), global state (`app.js`)
- Used by: End users via WeChat Mini Program runtime

**Utility (Business Logic + Data Access):**
- Purpose: Database operations, permission checks, formatting, UI helpers
- Location: `miniprogram/utils/`
- Contains: Pure functions, async database wrappers, permission predicates
- Depends on: WeChat Mini Program APIs (`wx.cloud`, `wx.showToast`, etc.)
- Used by: All pages

**Cloud Functions (Server-side Logic):**
- Purpose: Operations requiring server-side trust (permission bypass, transactions, encryption, email)
- Location: `miniprogram/cloudfunctions/`
- Contains: Node.js entry points with `wx-server-sdk`
- Depends on: WeChat Cloud SDK (`wx-server-sdk`), database
- Used by: Client pages via `wx.cloud.callFunction()`

**Database (Persistence):**
- Purpose: Data storage with MongoDB-compatible API
- Location: WeChat Cloud Database
- Contains: 12+ collections
- Used by: Both client-side SDK (with permission rules) and cloud functions (full access)

## Data Flow

### Primary Registration Path (Fortress)

1. User selects zone on index page (`miniprogram/pages/index/index.js:359`)
2. User navigates to fortress registration (`miniprogram/pages/index/index.js:399-403`)
3. Registration page loads available time slots via `db.getTimeSlotsByAlliance()` → cloud function `manageTimeSlot` action `getByAlliance` (`miniprogram/utils/db.js:604-616`)
4. User selects time slot, submits registration
5. `db.createRegistration()` → cloud function `register` action `create` (`miniprogram/utils/db.js:704-723`)
6. Cloud function checks capacity, creates record, returns `_id`
7. Page reloads registration list to reflect change

### Position Registration Path

1. User navigates to position list (`miniprogram/pages/index/index.js:407-410`)
2. `db.getPositionConfigs()` → cloud function `managePosition` action `getConfigs` (`miniprogram/utils/db.js:874-893`)
3. User selects config, navigates to registration form
4. `db.createPositionRegistration()` — direct client-side DB call with uniqueness checks (`miniprogram/utils/db.js:949-990`)
5. On duplicate nickname or occupied slot, throws error

### Admin Approval Flow

1. User submits application via `db.createAdminApplication()` → writes to `admins` collection (`miniprogram/utils/db.js:183-204`)
2. Admin (role `admin` or `superAdmin`) views pending applications via `db.getPendingAdminApplications()`
3. Admin reviews via `db.reviewAdminApplication()` → updates status to approved/rejected
4. On approval, `manageAdmin` cloud function `updateRole` action sets user's role in `users` collection

### State Management

**Global State (`app.globalData`):**
- `userInfo`: Full user object from `users` collection
- `openid`: WeChat openid (string)
- `role`: Current role string (`user` | `auditor` | `admin` | `superAdmin`)
- `phone`: User's bound phone number
- `currentZone`: Currently selected zone object
- `currentAlliance`: Currently selected alliance object
- `dbReady`: Boolean flag for database initialization
- `roleReady`: Boolean flag for role determination completion
- `firstLaunch`: Boolean for first-time launch detection

**Local State (Page `data`):**
- Each page manages its own `data` object via `this.setData()`
- Pages poll `app.globalData.roleReady` with `setTimeout` loop (100ms interval) until ready (`miniprogram/pages/index/index.js:99-107`)

**Persistent State (Storage):**
- `userInfo`: Cached user object
- `openid`: Cached openid
- `lastZoneId`: Last selected zone ID
- `hasLaunched`: First launch flag
- `zoneCreationNotified_{userId}`: Notification suppression flag

**Cloud State (Database):**
- All business data persisted in WeChat Cloud Database collections
- Database permissions enforced at collection level (see CLAUDE.md Database Permissions table)

## Key Abstractions

**Role-Based Access Control:**
- Purpose: Map roles to feature permissions
- Examples: `miniprogram/utils/auth.js` (ROLE_PERMISSIONS map, capability check functions)
- Pattern: Centralized permission map + predicate functions (`canManageZone(role)`, `hasPermission(role, feature)`)

**Time Slot Abstraction:**
- Purpose: Represent registration windows with capacity limits
- Examples: `miniprogram/utils/db.js:588-665` (createTimeSlot, getTimeSlotsByAlliance, etc.)
- Pattern: Slots have `timeValue`, `slotIndex`, `displayName`, `maxCount`, `status`, `date`, `tag`, `fortress` fields. Display name computed from timeValue + slotIndex (e.g., "15:00-2")

**Registration System Duality:**
- Purpose: Two parallel registration systems (fortress + position)
- Examples: Fortress uses `timeSlots` → `registrations` chain; Position uses `positionConfigs` → `positionRegistrations` chain
- Pattern: Each has config (time slot / position config) and enrollment (registration) collections with similar lifecycle

## Entry Points

**App Launch (`miniprogram/app.js:15-36`):**
- Triggers: WeChat Mini Program startup
- Responsibilities: Cloud init, DB init, cached login check, auto-login flow, superAdmin detection

**Index Page (`miniprogram/pages/index/index.js`):**
- Triggers: TabBar "首页" tap, app launch default page
- Responsibilities: Login status check, role-based feature visibility, zone loading, navigation hub to all sub-systems

**Login Page (`miniprogram/pages/login/login.js`):**
- Triggers: `handleLogin()` from index, `ensureLogin()` guard
- Responsibilities: openid retrieval, nickname/avatar input, user creation/update, superAdmin detection, role assignment

## Architectural Constraints

- **Threading:** Single-threaded WeChat Mini Program event loop. Cloud functions run in Node.js environment on Tencent Cloud.
- **Global state:** `app.globalData` is the single shared mutable state object across all pages. Pages mutate it directly (e.g., `app.globalData.currentZone = zone`). No immutability guarantees — pages read/write freely.
- **Circular imports:** No detected circular imports. Dependency graph is strictly: pages → utils → wx APIs.
- **Database permission model:** Collections use "creator-only write" or "all read/write" permission rules. Pages that need cross-user writes MUST route through cloud functions (see `db.updateAllianceName`, `db.bindAllianceAuditors`, `db.deleteTimeSlotViaCloud` patterns).
- **WeChat Cloud Database 100-record limit:** Client-side `.get()` returns max 100 records. Functions in `db.js` implement manual pagination with `skip()`/`limit()` loops (`miniprogram/utils/db.js:296-313`, `miniprogram/utils/db.js:784-798`).

## Anti-Patterns

### Polling for Role Readiness

**What happens:** Pages use `setTimeout` loops with 100ms intervals to wait for `app.globalData.roleReady` (`miniprogram/pages/index/index.js:99-107`, `miniprogram/pages/admin/home/home.js:25-32`).

**Why it's wrong:** Wastes CPU cycles, creates race condition window where roleReady flips between check and usage, adds latency (up to 100ms per poll cycle).

**Do this instead:** Use event-based notification (e.g., publish/subscribe pattern or Promise-based readiness). See callback pattern in `app.js` autoLogin for how this could work.

### Mixed Direct DB and Cloud Function Access

**What happens:** `db.js` contains both direct client-side database calls (`db.collection('users').where(...).get()`) and cloud function wrappers (`wx.cloud.callFunction({name: 'manageTimeSlot', ...})`). The choice of which to use is not always clear — sometimes both exist for the same entity (e.g., `updateTimeSlotRemark` direct vs `deleteTimeSlotViaCloud` cloud).

**Why it's wrong:** Creates confusion about which path to use, leads to permission errors when the wrong path is chosen, and makes it hard to reason about data consistency.

**Do this instead:** Establish a clear convention: all write operations go through cloud functions; read operations can use direct DB calls if permission allows. Document the reason for each cloud function route.

### Inline N+1 Queries in Page Logic

**What happens:** `my-registrations.js` loads registrations, then for each registration makes separate queries for zone, alliance, and timeSlot (`miniprogram/pages/user/my-registrations/my-registrations.js:101-117`).

**Why it's wrong:** O(n) database round-trips for n registrations. Each registration triggers 3 sequential queries (zone, alliance, timeSlot), resulting in 3n+1 total queries.

**Do this instead:** Batch-fetch all related entities in parallel using `_.in()` with IDs collected from the registration list, then join in memory.

### Dual Identity Storage (openid vs MongoDB _id)

**What happens:** User identity is tracked by both `openid` (string, used in `users.openid` and `admins.userId`) and MongoDB `_id` (used in `zones.adminIds`, `zones.creatorId`, `alliances.auditorIds`). Pages sometimes use one, sometimes the other (`miniprogram/pages/index/index.js:519-551`).

**Why it's wrong:** Requires dual queries and type-aware lookups. The `checkIsZoneManagerInZone` function uses `userId` (which could be openid or _id depending on caller), leading to potential mismatches.

**Do this instead:** Standardize on MongoDB `_id` as the sole user identifier across all collections. Migrate `admins.userId` from openid to _id format.

## Error Handling

**Strategy:** Try/catch with UI toast feedback

**Patterns:**
- Client-side: `try { ... } catch (err) { util.showError('操作失败: ' + err.message) }` — used in all page handlers
- Cloud functions: `try { switch(action) { ... } } catch (err) { return { err: err.message } }` — wrapper catches all and returns error object
- Database operations in `db.js`: Throw `new Error('descriptive message')` on validation failure, caught by calling page
- Capacity checks: Cloud functions check `count >= maxCount` before insert, throw error if full
- Duplicate detection: Cloud functions query before insert, throw error if exists

## Cross-Cutting Concerns

**Logging:** `console.log()` and `console.error()` throughout. Pages log operation context; cloud functions log entry/exit and intermediate results. No structured logging framework.

**Validation:** Input validation at page level (util.validatePhone, util.validateZoneCode) and cloud function level (type checks, uniqueness checks). No shared validation schema.

**Authentication:** Openid-based identity via WeChat cloud function `login`. Role-based authorization via `auth.js` permission map. SuperAdmin detected by phone number matching `superAdmins` collection. Phone lookup queries both string and number types for backward compatibility.

---

*Architecture analysis: 2026-05-17*
