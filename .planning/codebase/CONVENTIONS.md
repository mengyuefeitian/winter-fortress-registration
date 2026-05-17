# Coding Conventions

**Analysis Date:** 2026-05-17

## Project Context

This is a WeChat Mini Program (微信小程序) project built with WeChat Cloud Development. There is no build tooling, no linter, no formatter, and no test framework. Code runs directly in the WeChat Developer Tools runtime.

## Naming Patterns

**Files:**
- Pages: `kebab-case` directory + file names, e.g., `pages/user/registration/registration.js`
- Utilities: `camelCase.js`, e.g., `util.js`, `auth.js`, `db.js`, `version.js`
- Cloud functions: `kebab-case` directories with `index.js` entry point, e.g., `cloudfunctions/managePosition/index.js`
- Components: `kebab-case` prefix, e.g., `zone-selector/zone-selector.js`
- Page files follow 4-file convention: `.js` (logic), `.json` (config), `.wxml` (template), `.wxss` (styles)

**Functions:**
- `camelCase` throughout, e.g., `createRegistration()`, `checkLoginStatus()`, `loadAlliances()`
- Page lifecycle methods use `function` keyword with trailing `: function()` syntax, e.g., `onLoad: function()`, `onShow: function()`
- Cloud function handlers use `async/await` with arrow or function syntax, e.g., `exports.main = async (event, context) => {}`
- Database operations prefixed with action verbs: `create`, `get`, `update`, `delete`, `cancel`, `clear`, `bind`, `reset`, `init`, `review`

**Variables:**
- `camelCase` for all variables, e.g., `currentZone`, `selectedAlliance`, `userInfo`
- Booleans use `is`, `has`, `show`, `can` prefixes: `isLoggedIn`, `isFull`, `showPicker`, `canManageZone`
- Constants in `UPPER_SNAKE_CASE`: `APP_VERSION`, `TIME_VALUES`, `TAG_OPTIONS`, `POSITION_TYPES`, `ROLE_PERMISSIONS`

**Types:**
- No TypeScript — pure JavaScript (ES6+ with `const`/`let`)
- JSDoc comments used sparingly, only on utility functions in `util.js` and `db.js`

## Code Style

**Formatting:**
- No automated formatting tool (no Prettier, ESLint, or Biome)
- 2-space indentation throughout
- Semicolons used consistently
- Single quotes for strings in JS, double quotes in JSON
- Trailing commas in multi-line objects and arrays

**Linting:**
- No linting configuration (no `.eslintrc`, no `eslint.config.js`)
- Syntax validation via `node -c <file.js>` (parse-only check, no runtime)
- Manual review is the only quality gate

**Import Organization:**
- `require()` calls at top of file, grouped logically:
  1. Global app reference: `const app = getApp()`
  2. Local utilities: `const util = require('../../../utils/util')`
  3. Auth helpers: `const auth = require('../../../utils/auth')`
  4. Database ops: `const db = require('../../../utils/db')`
  5. Version config: `const version = require('../../../utils/version')`
- Relative paths with `../` traversal (no path aliases configured)
- CommonJS `module.exports` for all modules (no ES modules)

## Error Handling

**Patterns:**
- **Client-side**: `try/catch` with `util.showError(err.message || '默认错误')` pattern. Example from `registration.js`:
  ```javascript
  } catch (err) {
    util.hideLoading()
    util.showError(err.message || '报名失败')
  }
  ```
- **Cloud functions**: Wrap entire `main` handler in `try/catch`, return `{ err: err.message }` on failure. Example from `register/index.js`:
  ```javascript
  try {
    switch (action) { ... }
  } catch (err) {
    return { err: err.message }
  }
  ```
- **Database operations**: Functions throw `new Error('描述性错误')` for validation failures. Caller catches and displays via `util.showError()`.
- **Silent failures**: Some errors are caught and logged with `console.error()` without user notification (e.g., `refreshUserRole`, `checkSystemNotifications`). This is intentional — non-critical operations should not block the UI.

**Loading States:**
- `util.showLoading('正在...')` before async operations
- `util.hideLoading()` in both success and error paths (must be called in both)
- Pattern: show loading → await operation → hide loading → show success/error toast

**User Feedback:**
- `util.showSuccess('操作成功')` — green checkmark toast, 2s duration
- `util.showError('操作失败')` — red X toast, 2s duration
- `util.showInfo('提示信息')` — no-icon toast, 2s duration
- `util.showErrorLong('长文本错误')` — modal dialog for long messages
- `util.showConfirm('标题', '内容')` — returns `Promise<boolean>` for confirmation dialogs
- Critical destructive actions (clear registrations, delete configs) use `wx.showModal` with explicit confirm/cancel

## Input Validation

**Client-side validation in `util.js`:**
- `validateZoneCode(code)` — must be 4 digits, range 0001-9999
- `validatePhone(phone)` — must match `/^1[3-9]\d{9}$/` (Chinese mobile format)

**Page-level validation (inline):**
- Required field checks before submission: `if (!this.data.nickName) { util.showInfo('请输入昵称'); return; }`
- State checks: `if (timeSlot.isFull) { util.showInfo('该时间段报名人数已满'); return; }`
- Login guards: `if (!this.data.isLoggedIn) { ... redirect to login ... }`

**Cloud function validation:**
- Enum validation: `if (!POSITION_TYPES.includes(data.positionType)) { throw new Error('职位类型错误') }`
- Format validation with regex: `if (!startTimePattern.test(data.startTime)) { throw new Error(...) }`
- Duplicate checks: query database for existing records before insert (nickname uniqueness, time slot uniqueness)
- Business rule enforcement: capacity checks (`count >= maxCount`) before insert

**Security note:** Validation is duplicated between client and cloud function layers. Client validation provides UX feedback; cloud function validation provides security enforcement. This is correct — never trust client-side validation alone.

## UI/Styling Conventions

**Design System (`app.wxss`):**
- Utility-first CSS with Tailwind-like class names
- 4px-based spacing system: `mt-4`, `p-16`, `gap-8`, etc.
- Color tokens:
  - Primary: `#1a1a2e` (deep navy)
  - Secondary: `#16213e` (navy blue)
  - Accent: `#0f3460` (royal blue)
  - Highlight/Danger: `#e94560` (coral red)
  - Success: `#00d26a` (emerald green)
  - Background: `#fafbfc` (light gray-white)
  - Text Primary: `#111827`
  - Text Secondary: `#6b7280`
  - Text Weak: `#9ca3af`
  - Border: `#e5e7eb`
  - Divider: `#f3f4f6`
- Font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', ...`
- Base font size: 14px

**Component patterns:**
- `.card` — white background, 8px border-radius, 1px border
- `.btn` — 40px height, 6px border-radius, variants: `.btn-primary`, `.btn-secondary`, `.btn-accent`, `.btn-danger`, `.btn-success`, `.btn-outline`, `.btn-ghost`
- `.input` — 40px height, 1px border, 6px border-radius
- `.tag` — 24px height, 4px border-radius, size variants `.tag-sm`, `.tag-lg`
- `.table`/`.table-row`/`.table-cell` — flex-based table layout
- `.function-card` — 2-column grid for admin dashboard cards
- `.period-tabs` — segmented control for date/period switching

**Layout:**
- Flex-based layouts throughout (no CSS grid, wxss doesn't support it)
- `.flex`, `.flex-col`, `.flex-row` with `.items-*`, `.justify-*` utilities
- Grid layouts via `.grid-2` / `.grid-3` with `.grid-*-item` child classes
- **WeChat Mini Program constraint**: `*` universal selector is NOT supported in wxss — must use explicit child selectors

**Component structure:**
- Reusable component: `zone-selector` (the only component in the project)
- Component follows 4-file pattern: `.js` (Component({})), `.json` (component declaration), `.wxml` (template), `.wxss` (scoped styles)
- Components use `properties`, `data`, `observers`, `methods` structure
- Communication via `this.triggerEvent('change', { zone })` and parent `bind:change`

## Module Design

**Exports:**
- All modules use `module.exports = { ... }` at the bottom
- `db.js` groups exports by domain with comment headers (用户, 分区, 联盟, 时间段, 报名, 统计, etc.)
- `auth.js` exports individual permission check functions and constants
- `util.js` exports utility functions, validation, and UI helpers

**Barrel files:**
- No barrel/index files — each module imports directly from source
- `db.js` acts as a barrel for database operations and preset constants (`TIME_VALUES`, `TAG_OPTIONS`, etc.)

**Code organization:**
- `utils/` — shared utilities (auth, db, util, version)
- `pages/` — role-based page hierarchy (`user/`, `admin/`, `auditor/`, `superAdmin/`)
- `cloudfunctions/` — serverless functions with action-based routing
- `components/` — reusable UI components (currently only `zone-selector`)

## Function Design

**Size:**
- Utility functions: 10-30 lines
- Page methods: 20-80 lines typical
- Large methods exist in `index.js` (e.g., `submitApplication` ~60 lines, `checkAndShowApplyDialog` ~100 lines)
- `db.js` is 1480 lines — a single monolithic file containing all database operations

**Parameters:**
- Single object parameter for complex inputs: `createRegistration({ zoneId, allianceId, timeSlotId, ... })`
- Positional parameters for simple functions: `formatDate(date, format)`, `isTimeSlotFull(count, maxCount)`
- Default values via destructuring: `filters = {}`, `action = 'add'`

**Return Values:**
- Async functions return `Promise` with `await`
- Database operations return raw result objects or extracted data
- Cloud functions return `{ success: true, _id: ... }` or `{ err: 'message' }` envelope
- Boolean queries return `true/false` or `null`

## Logging

**Framework:** `console.log`, `console.error` (WeChat Mini Program native)

**Patterns:**
- Success paths: `console.log('操作成功:', result)` — used sparingly in client code
- Error paths: `console.error('操作失败:', err)` — used consistently in catch blocks
- Debug logging: Cloud functions and `app.js` use verbose logging for identity checks (e.g., `console.log('字符串查询结果:', resStr.data)`)
- Logging in production: All `console` output visible in WeChat Developer Tools console and production monitoring

## Comments

**JSDoc usage:**
- Present on utility functions in `util.js` (formatDate, showLoading, etc.)
- Present on database functions in `db.js` (section headers and key functions)
- Absent on page methods and cloud function handlers

**Inline comments:**
- Chinese language throughout (consistent with project audience)
- Used to explain business logic, not code mechanics
- Section separators in `db.js`: `/** 用户相关操作 */`, `/** 分区相关操作 */`, etc.
- Backward compatibility notes: `// 保留（向后兼容）`, `// 兼容旧数据`

**When to comment (observed convention):**
- Complex database queries with pagination
- Backward compatibility handling (auditorId -> auditorIds migration)
- Workarounds for platform limitations (cloud function bypass for write permissions)
- Non-obvious business rules (phone type string/number inconsistency)

## Cross-Cutting Concerns

**Authentication:**
- Centralized in `app.js` (autoLogin, checkLoginStatus, getUserInfo, checkSuperAdmin)
- `app.globalData` holds `userInfo`, `openid`, `role`, `phone`, `currentZone`
- Role stored in `app.globalData.role` — checked on every page via `onShow`
- Pages check `app.globalData.userInfo` and `app.globalData.openid` before operations
- No token-based auth — relies on WeChat cloud session + openid

**Permission enforcement:**
- Role-based access control via `auth.js` functions (`hasPermission`, `canManageZone`, etc.)
- Page-level visibility controlled by `data` flags (`showAdminConsole`, etc.)
- Database-level permissions configured in WeChat Cloud console (not in code)
- Cloud functions used as permission bypass for write operations on restricted collections

**Data consistency patterns:**
- Soft deletes: `status: 'inactive'` or `status: 'cancelled'` instead of `remove()`
- Pagination with 20-item batches and 500-record hard cap
- Dual query for phone fields (string + parseInt fallback) for historical data consistency
- Local storage caching (`wx.setStorageSync`) for zone/alliance selection persistence

**Anti-patterns to avoid:**
- **N+1 queries**: Use batch queries with `db.command.in()` instead of looping individual queries (see `loadTimeSlots` in `registration.js`)
- **Direct database writes on restricted collections**: Use cloud functions for writes to `zones`, `alliances`, `timeSlots` (creator-only write permissions)
- **Duplicated date formatting**: `getTodayString()` is defined in both `util.js` and page code — use the utility version
- **Missing `hideLoading()` on error path**: Always pair `showLoading()` with `hideLoading()` in both success and catch branches

---

*Convention analysis: 2026-05-17*
