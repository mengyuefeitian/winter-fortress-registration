# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git 操作规范（严格执行，不得违反）

### 禁止未经确认直接推送

**任何情况下，未经用户明确确认，不得执行 `git push`。**

完成开发后的标准流程：

1. **本地 commit** — 将改动提交到本地分支
2. **列出测试清单** — 告知用户本次改动涉及的功能点，以及如何在微信开发者工具中验证
3. **等待用户测试并确认** — 不得催促，不得跳过
4. **用户明确说"可以推送"后** — 才执行 `git push`

### 合并到主分支的流程

用户说"合并到主分支"或"提交到主分支"时：
1. 本地执行 `git checkout master && git merge dev`
2. 列出本次合并包含的功能清单
3. **停下来等用户确认**，再执行 `git push origin master`

### 云函数变更提醒

修改了云函数代码后，必须在测试清单中注明：
- 哪个云函数需要重新部署
- 部署方法：右键对应文件夹 → "上传并部署：云端安装依赖"
- 未部署前功能不会生效

---

## Development Commands

This is a WeChat Mini Program project. Development requires **WeChat Developer Tools**:

- Open project in WeChat Developer Tools for preview/testing
- Deploy cloud functions: Right-click each folder in `miniprogram/cloudfunctions/` → "上传并部署：云端安装依赖"
- Upload code: Click "上传" button → submit for review in WeChat Public Platform
- Version number is centralized in `miniprogram/utils/version.js` — update `APP_VERSION` before each upload
- Syntax check JS files: `node -c <file.js>` (no runtime, just parse validation — useful since there's no linter)

## Project Architecture

A multi-role registration management system for alliance activities ("无尽冬日堡垒分配"). Two independent registration sub-systems: **堡垒报名** (fortress registration) and **官职报名** (position registration).

### Role System

| Role Key | Display Name | Description |
|----------|-------------|-------------|
| `user` | 普通用户 | Can register for fortress & position slots, apply for admin |
| `auditor` | 盟管 | Manages time slots for bound alliances, can clear data |
| `admin` | 区管 | Creates zones, configures alliances/time slots, reviews 盟管 applications |
| `superAdmin` | 超级管理员 | Reviews 区管 applications, manages super admin phones, full access |

Permission escalation: `user` can apply to become `auditor` (盟管) or `admin` (区管). `auditor` can apply to upgrade to `admin`.

### Core Data Model

**Hierarchy**: Zone → Alliance (up to 12) → TimeSlots → Registrations

**Collections**:
- `users`: `{ openid, nickName, avatarUrl, phone, role, status }`
- `zones`: `{ zoneCode (4-digit), zoneName, creatorId, status }`
- `alliances`: `{ zoneId, allianceIndex (1-12), allianceName, auditorIds[] }` — see migration note below
- `timeSlots`: `{ zoneId, allianceId, timeValue, slotIndex, displayName, date, tag, remark (legacy), maxCount (default 15), status }`
- `registrations`: `{ zoneId, allianceId, timeSlotId, userId, nickName, position (head/body), status }`
- `admins`: `{ userId, phone, applyType (zoneManager/allianceManager/zoneCreation), status (pending/approved/rejected), reviewedBy, approvedRole, zoneId, zoneName }`
- `superAdmins`: `{ phone, userId }` — phone must match user's bound phone for superAdmin access
- `positionConfigs`: `{ positionType (副执行官/教育部长), date, startTime (0:00–0:30), zoneId, zoneName, creatorId, status }`
- `positionRegistrations`: `{ configId, timeSlot, userId, nickName, remark, status }`

### Permission System

Defined in `miniprogram/utils/auth.js`:
- **user**: fortressRegistration, positionRegistration, applyAllianceManager, applyZoneManager, myRegistrations
- **auditor**: fortressTimeManage, positionTimeManage, clearData, statistics
- **admin**: fortressTimeManage, positionTimeManage, clearData, statistics, allianceConfig, reviewAllianceManager, positionManage
- **superAdmin**: all admin permissions + zoneManage, reviewZoneManager, superAdminManage

### Key Files

- `miniprogram/utils/db.js`: All database operations — users, zones, alliances, timeSlots, registrations, positionConfigs, positionRegistrations, statistics. Also exports preset constants (`TIME_VALUES`, `TAG_OPTIONS`, `POSITION_TYPES`).
- `miniprogram/utils/auth.js`: Permission helpers (hasPermission, isAdminOrAbove, isSuperAdmin, etc.) — defines `ROLE_PERMISSIONS` map and role-specific capability checks.
- `miniprogram/utils/util.js`: Date formatting, validation, UI helpers (showToast, showLoading)
- `miniprogram/utils/version.js`: Centralized version number (`APP_VERSION`)
- `miniprogram/scripts/db-init.js`: Database initialization (collection creation, super admin setup)
- `miniprogram/app.js`: App entry point, global state management, auto-login flow, superAdmin detection
- `miniprogram/app.json`: Page routes, tabBar config, window settings — defines all 25 page routes
- `miniprogram/cloudbaserc.json`: Cloud environment configuration
- `miniprogram/components/zone-selector`: Reusable zone picker component with keyword search filtering, used across multiple role pages

### Components

- `zone-selector`: Zone selection with keyword search, used by admin/auditor/superAdmin pages

### Page Structure by Role

- **TabBar**: index (首页), my-registrations (我的)
- **Common**: login (登录 page, shared across all roles)
- **user**: registration, position-list, position-registration, my-registrations
- **admin**: home, zone-manage, alliance-config, time-slot-config, position-manage, statistics, member-manage
- **auditor**: home, config, statistics
- **superAdmin**: home, admin-review, all-statistics, phone-manage, alliance-manage, auto-clear, member-manage

### Cloud Functions (9)

All located in `miniprogram/cloudfunctions/`, each with `index.js` entry point and `package.json`. All use action-based routing (`event.action` switch pattern):

| Cloud Function | Actions |
|---------------|---------|
| `login` | `getPhone` (decrypt phone number), default returns `openid` |
| `register` | Creates/updates user in database |
| `getStatistics` | Returns statistics for alliance/zone |
| `manageZone` | `create`, `list`, `delete` |
| `manageTimeSlot` | `create`, `getByAlliance`, `updateRemark`, `delete`, `getMaxIndex` |
| `manageAdmin` | `apply`, `getPending`, `review`, `getApplications` |
| `managePosition` | `createConfig`, `getConfigs`, `deleteConfig`, `createRegistration`, `getRegistrations`, `cancelRegistration`, `deleteRegistration`, `clearRegistrations` |
| `clearRegistrations` | `clear` (fortress registrations by alliance) |
| `clearExpiredData` | Clears expired position registrations and inactive timeSlots |

### Page Structure by Role

- **TabBar**: index (首页), my-registrations (我的)
- **user**: registration, position-list, position-registration, my-registrations
- **admin**: home, zone-manage, alliance-config, time-slot-config, position-manage, statistics, member-manage
- **auditor**: home, config, statistics
- **superAdmin**: home, admin-review, all-statistics, phone-manage, alliance-manage, auto-clear, member-manage

### Cloud Environment

Environment ID: `cloud1-9gip4qyf7e753868` (configured in `app.js`, `cloudbaserc.json`, and login cloud function)

### Preset Constants

- Time values: `['10:00', '12:00', '15:00', '19:30', '21:00']` — `TIME_VALUES` in `db.js`
- Tag options: `['高迁', '生命', '穿透', '加兵', '火晶', '橙碎', '加速', '螺丝', '宠石', '宠箱', '其他']` — `TAG_OPTIONS` in `db.js`
- Position types: `['副执行官', '教育部长']` — `POSITION_TYPES` in `db.js`

### Database Permissions

| Collection | Permission |
|-----------|-----------|
| `users`, `admins` | 所有人可读写 |
| `zones`, `alliances`, `timeSlots`, `registrations` | 仅创建者可写，所有人可读 |
| `positionConfigs`, `positionRegistrations` | 仅创建者可写，所有人可读 |
| `superAdmins` | 仅创建者可读写 |

### Global Styles

Color scheme in `app.wxss`: Primary `#4A90D9`, Secondary `#6BB3F0`, Danger `#FF6B6B`, Success `#52C41A`

## Important Notes

- Phone number binding is unique — one phone can only bind to one openid
- **Phone type inconsistency**: Historical data stores phones as both strings and numbers. Always query both types when looking up by phone (see `checkSuperAdmin` and `getUserByPhone` in `db.js` for the pattern: query with string first, then `parseInt` as fallback)
- SuperAdmin access requires phone matching a record in `superAdmins` collection (checked as both string and number)
- **`auditorId` → `auditorIds` migration**: Alliances originally used a single `auditorId` field, now migrated to `auditorIds` array for multi-auditor support. Code in `db.js` handles backward compatibility (checks `auditorId` if `auditorIds` is missing, migrates on write). When writing alliance data, always set `auditorId: null` alongside `auditorIds` updates.
- Clear registrations operation is irreversible
- Zone code must be 4 digits
- Time slots become "full" (grayed out) when registration count reaches `maxCount`
- Position registration uses 30-minute intervals starting from `startTime` (0:00–0:30) to 24:00
- WeChat Mini Program does not support `*` (universal) CSS selector — never use it in `.wxss` files
- Admin applications have three types: `zoneManager` (区管), `allianceManager` (盟管), and `zoneCreation` — filtered by `applyType` field
- `removeMember` in `db.js` checks across all zones before resetting a user's global role — removing from one zone won't reset role if user still has bindings in other zones
- Fortress registration position values: `head` (车头) and `body` (车身) — sorted with head first in statistics
- Position registration enforces unique nickName per configId and unique timeSlot per configId (no double-booking)
- Time slot `tag` field is the current labeling system; `remark` is legacy but still present for backward compatibility
- Version history and planned features are tracked in `docs/CHANGELOG.md`
- Implementation plans are in `docs/plans/`
- **Login page** (`pages/login/login`) is shared across all roles — handles auto-login and role-based routing
- **Cloud environment ID** follows pattern `cloud1-XXXXXXXXXXXXXXXX` — configured in 3 places: `app.js`, `cloudbaserc.json`, and `login` cloud function
- **No build tooling**: This is a pure WeChat Mini Program project — no npm/yarn, no bundler, no linter. Use `node -c <file.js>` for syntax validation
- **WeChat Mini Program patterns**: Pages use `.js` (logic), `.json` (config), `.wxml` (template), `.wxss` (styles) — all four files per page. Components use the same convention with `.wxml`/`.wxss`/`.js`/`.json`
