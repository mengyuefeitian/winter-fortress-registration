# Technology Stack

**Analysis Date:** 2026-05-17

## Languages

**Primary:**
- **JavaScript (ES6+)** - All application code: miniprogram pages, cloud functions, utilities
  - `project.config.json` enables ES6 transpilation (`"es6": true`)
  - No TypeScript — pure JavaScript throughout

## Runtime

**Client (Mini Program):**
- **WeChat Mini Program Runtime** — base library version `2.19.4` (`project.config.json`)
- Requires base library `>= 2.2.3` for cloud capabilities (checked in `miniprogram/app.js`)

**Server (Cloud Functions):**
- **Node.js 12.16** — all cloud functions target `Nodejs12.16` runtime (`cloudbaserc.json`)
- 13 cloud function directories, each with its own `package.json`

**Package Manager:**
- **npm** — each cloud function has its own `package.json` with `wx-server-sdk` dependency
- No root-level `package.json` — no bundler, no build step
- Lockfile: **not present** — no npm/yarn lock files anywhere

## Frameworks

**Core:**
- **WeChat Mini Program Framework** — `.wxml`/`.wxss`/`.js`/`.json` four-file page structure
- **WeChat Cloud Development** (`wx.cloud`) — serverless backend via Tencent CloudBase

**Testing:**
- **Not detected** — no test framework, no test files, no test configuration

**Build/Dev:**
- **WeChat Developer Tools** — sole development and deployment environment
- No build tooling: `"swc": false`, `"disableSWC": true`, `"nodeModules": false` in `project.config.json`
- Syntax validation: `node -c <file.js>` (manual, no linter)

## Key Dependencies

**Critical:**
- **wx-server-sdk ~2.6.3** — server-side SDK for cloud functions, provides `cloud.init()`, `cloud.database()`, `cloud.getWXContext()`, `cloud.getTempFileURL()`
  - Every cloud function depends on this
- **wx.cloud** — client-side SDK (`wx.cloud.init()`, `wx.cloud.database()`, `wx.cloud.callFunction()`)
  - Used in `miniprogram/app.js`, `miniprogram/utils/db.js`, and all page logic

**Secondary:**
- **nodemailer ^6.9.0** — used only in `sendFeedbackEmail` cloud function for sending feedback emails via SMTP

**Infrastructure:**
- **Tencent CloudBase** — cloud environment `cloud1-9gip4qyf7e753868`, configured in three places:
  - `miniprogram/app.js` (client init)
  - `miniprogram/cloudbaserc.json` (cloud function config)
  - `miniprogram/cloudfunctions/login/index.js` (hardcoded env ID)

## Database

**Type:**
- **WeChat Cloud Database** — MongoDB-compatible document database provided by Tencent CloudBase
  - Accessed via `wx.cloud.database()` on client
  - Accessed via `cloud.database()` on server (cloud functions)

**Collections (12):**
- `users`, `admins`, `zones`, `alliances`, `timeSlots`, `registrations`, `superAdmins`, `positionConfigs`, `positionRegistrations`, `battleConfigs`, `battleRegistrations`, `feedbacks`

**ORM:**
- **None** — raw document database API, no ORM layer
  - Direct `.collection().add()`, `.collection().where().get()`, `.collection().doc().update()` pattern throughout
  - All database operations centralized in `miniprogram/utils/db.js` (1480+ lines)

**Pagination pattern:**
- Manual skip/limit with `batchSize = 20`, `offset` increment, hard cap at 500 records
- Used in `getAllZones()`, `getZonesByCreator()`, `getAllianceStatistics()`, `getBattleConfigs()`

## Configuration

**Environment:**
- Single cloud environment: `cloud1-9gip4qyf7e753868`
- No `.env` files — configuration hardcoded or in JSON config files
- Cloud function timeouts configured per-function: 10s default, 60s for `clearRegistrations`

**Project settings** (`project.config.json`):
- `appid: wxa12f4f967f0633b8`
- `libVersion: 2.19.4`
- ES6 enabled, WXML/WXSS minification enabled
- No npm modules in mini program (`"nodeModules": false`)

**Version management:**
- Centralized in `miniprogram/utils/version.js`: `APP_VERSION = '1.1.5'`
- Runtime prefers WeChat platform version via `wx.getAccountInfoSync()`, falls back to local version

## Platform Requirements

**Development:**
- WeChat Developer Tools (desktop application)
- WeChat developer account with appid `wxa12f4f967f0633b8`
- Cloud development enabled for environment `cloud1-9gip4qyf7e753868`
- No npm install required — just open in Developer Tools

**Production:**
- WeChat Mini Program hosting (published via WeChat Public Platform)
- Cloud functions deployed via Developer Tools: right-click folder → "上传并部署：云端安装依赖"
- Code uploaded via "上传" button → review in WeChat Public Platform

## Color Scheme

Defined in `miniprogram/app.wxss`:
- Primary: `#4A90D9`
- Secondary: `#6BB3F0`
- Danger: `#FF6B6B`
- Success: `#52C41A`
- Navigation bar: `#1a1a2e` (dark)

---

*Stack analysis: 2026-05-17*
