# External Integrations

**Analysis Date:** 2026-05-17

## APIs & External Services

**WeChat Platform APIs:**
- **wx.login** — Silent login, retrieves code for openid exchange
- **wx.cloud** — Cloud development SDK (database, functions, storage)
- **wx.getAccountInfoSync** — Retrieves current mini program version and appid
- **wx.showLoading / wx.showToast / wx.showModal** — Built-in UI feedback APIs
- **wx.getStorageSync / wx.setStorageSync** — Local persistent storage
- **wx.showModal** — Confirmation dialogs (used in `showConfirm()` in `miniprogram/utils/util.js`)

**WeChat Open Data:**
- **cloud.getOpenData** — Decrypts cloudID for phone number (`login` cloud function, `event.action === 'getPhone'`)
  - Requires user to grant phone number permission via `<button open-type="getPhoneNumber">`

## Email Service

**SMTP (163 Mail):**
- **Service:** NetEase 163 Mail (`smtp.163.com:465`, SSL)
- **Cloud function:** `sendFeedbackEmail` (`miniprogram/cloudfunctions/sendFeedbackEmail/index.js`)
- **Library:** `nodemailer ^6.9.0`
- **Purpose:** Sends feedback email notifications to admin when users submit feedback
- **Auth:** SMTP credentials hardcoded in `EMAIL_CONFIG` — `user: '17817560527@163.com'`, `pass` field contains SMTP authorization code
- **Storage integration:** Converts WeChat cloud storage fileIDs to temp download URLs via `cloud.getTempFileURL()` for embedding feedback images in emails

## Data Storage

**Primary Database:**
- **WeChat Cloud Database** (MongoDB-compatible)
  - Environment: `cloud1-9gip4qyf7e753868`
  - No ORM — direct document API via `db.collection()`
  - Collection-level permissions defined in WeChat Cloud Console

**Cloud Storage:**
- **WeChat Cloud Storage** — used for feedback images uploaded via `wx.chooseMedia` / `wx.cloud.uploadFile`
  - Images stored as cloud fileIDs, converted to temp URLs for email embedding

**Local Storage:**
- **wx.storage** — client-side key-value store
  - Keys: `userInfo`, `openid`, `hasLaunched`
  - Used for auto-login session persistence

**Caching:**
- **None** — no Redis, no CDN caching, no client-side cache beyond localStorage

## Authentication & Identity

**Auth Provider:**
- **WeChat Open Platform** — openid-based authentication
  - `login` cloud function retrieves openid via `cloud.getWXContext().OPENID`
  - No JWT, no session tokens — openid is the identity

**Role System:**
- **Custom RBAC** — defined in `miniprogram/utils/auth.js`
  - Roles: `user`, `auditor`, `admin`, `superAdmin`
  - Role stored in `users` collection, checked client-side for UI gating
  - Permission escalation: user → applies for auditor/admin → reviewed by higher role

**Phone Binding:**
- Phone number uniquely binds to one openid
- Historical data stores phones as both strings and numbers — queries check both types
  - Pattern seen in `checkSuperAdmin()` (`miniprogram/app.js`) and `getUserByPhone()` (`miniprogram/utils/db.js`)

## Monitoring & Observability

**Error Tracking:**
- **None** — no Sentry, no Bugsnag, no error reporting service
- Errors logged via `console.error()` only

**Logs:**
- **Cloud function logs** — accessible via WeChat Cloud Development Console
- **Client logs** — `console.log()` / `console.error()` visible in Developer Tools console
- No structured logging framework

## CI/CD & Deployment

**Hosting:**
- **WeChat Mini Program Platform** — published via WeChat Public Platform

**Deployment Process:**
1. Open project in WeChat Developer Tools
2. Click "上传" (Upload) → fills version number and description
3. Submit for review in WeChat Public Platform
4. After approval, release to production

**Cloud Functions Deployment:**
- Right-click cloud function folder in Developer Tools → "上传并部署：云端安装依赖"
- Each function deployed independently (no CI pipeline)
- npm dependencies installed during deployment ("云端安装依赖")

**No CI Pipeline:**
- No GitHub Actions, no Jenkins, no automated testing
- No linting, no type checking, no automated builds
- Manual deploy via Developer Tools UI

## Environment Configuration

**Cloud Environment ID:** `cloud1-9gip4qyf7e753868`

Configured in **3 locations**:
1. `miniprogram/app.js` — `wx.cloud.init({ env: 'cloud1-9gip4qyf7e753868' })`
2. `miniprogram/cloudbaserc.json` — `"env_id": "cloud1-9gip4qyf7e753868"`
3. `miniprogram/cloudfunctions/login/index.js` — hardcoded in `cloud.init()`
4. `miniprogram/app.js` `checkLoginStatus()` — `config: { env: 'cloud1-9gip4qyf7e753868' }` in `callFunction`

**App ID:** `wxa12f4f967f0633b8` (in `project.config.json`)

**Required environment variables (cloud functions):**
- None defined in `envVariables` — all config (email credentials, env ID) hardcoded in source

**Secrets location:**
- Email SMTP credentials hardcoded in `miniprogram/cloudfunctions/sendFeedbackEmail/index.js` (`EMAIL_CONFIG`)
- No external secret manager — credentials committed to source

## Webhooks & Callbacks

**Incoming:**
- **None detected** — no external webhooks calling into the mini program

**Outgoing:**
- **SMTP email** — `sendFeedbackEmail` sends outbound emails when feedback is submitted
- **Cloud function calls** — client → cloud function via `wx.cloud.callFunction()` (13 functions, action-based routing)

## Cloud Function Architecture

**Pattern:** Action-based routing (every cloud function uses `event.action` switch pattern)

```javascript
// Standard pattern across all cloud functions
exports.main = async (event, context) => {
  const { action, data } = event
  switch (action) {
    case 'create': return await createXxx(data)
    case 'get': return await getXxx(data)
    case 'update': return await updateXxx(data)
    case 'delete': return await deleteXxx(data)
    default: return { err: 'Unknown action' }
  }
}
```

**All 13 cloud functions:**

| Function | Actions | Dependencies |
|----------|---------|-------------|
| `login` | `getPhone` (decrypts cloudID for phone), default returns `openid` | wx-server-sdk |
| `register` | User registration/update | wx-server-sdk |
| `getStatistics` | Alliance/zone statistics | wx-server-sdk |
| `manageZone` | `create`, `list`, `delete`, `updateZone`, `addZoneAdmin`, `updateAllianceName`, `bindAllianceAuditor`, `unbindAllianceAuditor`, `getAlliancesByZone`, `removeMember` | wx-server-sdk |
| `manageTimeSlot` | `create`, `getByAlliance`, `updateRemark`, `delete`, `getMaxIndex`, `updateTag` | wx-server-sdk |
| `manageAdmin` | `apply`, `getPending`, `review`, `getApplications` | wx-server-sdk |
| `managePosition` | `createConfig`, `getConfigs`, `deleteConfig`, `createRegistration`, `getRegistrations`, `cancelRegistration`, `deleteRegistration`, `clearRegistrations` | wx-server-sdk |
| `manageUserIdentity` | Add zone manager, pre-bind, get zone roles | wx-server-sdk |
| `clearRegistrations` | `clear` (fortress registrations by alliance) | wx-server-sdk |
| `clearExpiredData` | Clears expired position registrations and inactive timeSlots | wx-server-sdk |
| `sendFeedbackEmail` | Sends feedback email with image attachments | wx-server-sdk, nodemailer |
| `migrate-zone-admin-ids` | Migration: creatorId → adminIds | wx-server-sdk |
| `repair-zone-creator` | Repair zone admin bindings | wx-server-sdk |

**Client-server split pattern:**
- Client reads directly from database for most operations
- Writes that bypass creator-only permission go through cloud functions:
  - `createTimeSlot` → `manageTimeSlot` cloud function
  - `createRegistration` → `register` cloud function (avoids eventual consistency delay)
  - `updateAllianceName` → `manageZone` cloud function
  - `bindAllianceAuditors` → `manageZone` cloud function
  - `deletePositionConfig` → `managePosition` cloud function
  - `removeMember` → `manageZone` cloud function

---

*Integration audit: 2026-05-17*
