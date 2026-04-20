# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

This is a WeChat Mini Program project. Development requires **WeChat Developer Tools**:

- Open project in WeChat Developer Tools for preview/testing
- Deploy cloud functions: Right-click each folder in `miniprogram/cloudfunctions/` → "上传并部署：云端安装依赖"
- Upload code: Click "上传" button → submit for review in WeChat Public Platform

## Project Architecture

A multi-role registration management system for alliance activities ("无尽冬日堡垒分配").

### Core Data Model

**Hierarchy**: Zone → Alliance (up to 12) → TimeSlots → Registrations

**Collections**:
- `users`: `{ openid, nickName, avatarUrl, phone, role, status }` — role: user/admin/auditor/superAdmin
- `zones`: `{ zoneCode (4-digit), zoneName, creatorId, status }`
- `alliances`: `{ zoneId, allianceIndex (1-12), allianceName, auditorId }`
- `timeSlots`: `{ allianceId, timeValue, slotIndex, displayName, remark, maxCount (default 15), status }`
- `registrations`: `{ timeSlotId, userId, nickName, position (head/body), status }`
- `admins`: `{ userId, phone, status (pending/approved/rejected), reviewedBy }` — admin applications
- `superAdmins`: `{ phone, userId }` — phone must match user's bound phone for superAdmin access

### Permission System

Defined in `miniprogram/utils/auth.js`:
- **user**: registration, myRegistrations
- **admin**: zoneManage, allianceConfig, timeSlotConfig, statistics
- **auditor**: config, statistics (bound to specific alliances)
- **superAdmin**: adminReview, allStatistics, phoneManage, allianceManage + all admin permissions

### Key Files

- `miniprogram/utils/db.js`: All database operations (users, zones, alliances, timeSlots, registrations, statistics)
- `miniprogram/utils/auth.js`: Permission helpers (hasPermission, isAdminOrAbove, isSuperAdmin, etc.)
- `miniprogram/utils/util.js`: Date formatting, validation, UI helpers (showToast, showLoading)
- `miniprogram/cloudfunctions/`: 7 cloud functions (login, register, getStatistics, manageZone, manageTimeSlot, manageAdmin, clearRegistrations)

### Cloud Environment

Environment ID: `cloud1-9gip4qyf7e753868` (configured in `app.js`, `cloudbaserc.json`, and login cloud function)

### Preset Time Values

`['10:00', '12:00', '15:00', '19:30', '21:00']` — defined in `db.js` as `TIME_VALUES`

### Global Styles

Color scheme in `app.wxss`: Primary `#4A90D9`, Secondary `#6BB3F0`, Danger `#FF6B6B`, Success `#52C41A`

## Important Notes

- Phone number binding is unique — one phone can only bind to one openid
- SuperAdmin access requires phone matching a record in `superAdmins` collection
- Clear registrations operation is irreversible
- Zone code must be 4 digits
- Time slots become "full" (grayed out) when registration count reaches `maxCount`