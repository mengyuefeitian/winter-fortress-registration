# Codebase Structure

**Analysis Date:** 2026-05-17

## Directory Layout

```
winter-fortress-registration/
├── miniprogram/                    # WeChat Mini Program root
│   ├── app.js                      # App entry: global state, auto-login, cloud init
│   ├── app.json                    # Page routes, tabBar, window config
│   ├── app.wxss                    # Global styles (color scheme, common classes)
│   ├── cloudbaserc.json            # Cloud environment config
│   ├── sitemap.json                # WeChat sitemap
│   ├── project.config.json         # WeChat Developer Tools config
│   │
│   ├── pages/                      # All page modules (31 pages)
│   │   ├── index/                  # Home page (tabBar) — feature hub by role
│   │   ├── login/                  # Shared login page — all roles
│   │   ├── user/                   # User-facing pages (4 roles: user)
│   │   │   ├── registration/       # Fortress registration form
│   │   │   ├── position-list/      # Position config listing
│   │   │   ├── position-registration/  # Position registration form
│   │   │   ├── battle-list/        # Battle config listing
│   │   │   ├── battle-registration/    # Battle registration form
│   │   │   ├── battle-statistics/      # Battle statistics view
│   │   │   ├── battle-allocation/      # Battle assignment editor
│   │   │   ├── feedback/           # User feedback form
│   │   │   ├── apply-alliance-manager/ # Alliance manager application
│   │   │   └── my-registrations/   # User's registration history (tabBar)
│   │   ├── admin/                  # Admin pages (4 roles: admin / 区管)
│   │   │   ├── home/               # Admin dashboard
│   │   │   ├── zone-manage/        # Zone CRUD
│   │   │   ├── alliance-config/    # Alliance naming, auditor binding
│   │   │   ├── time-slot-config/   # Time slot creation/management
│   │   │   ├── position-manage/    # Position config + registration management
│   │   │   ├── statistics/         # Zone-level statistics
│   │   │   └── member-manage/      # Zone member management
│   │   ├── auditor/                # Auditor pages (4 roles: auditor / 盟管)
│   │   │   ├── home/               # Auditor dashboard
│   │   │   ├── config/             # Time slot config for bound alliances
│   │   │   └── statistics/         # Alliance-level statistics
│   │   └── superAdmin/             # Super admin pages (4 roles: superAdmin)
│   │       ├── home/               # Super admin dashboard
│   │       ├── admin-review/       # Review admin applications
│   │       ├── all-statistics/     # Global statistics
│   │       ├── phone-manage/       # Phone number management
│   │       ├── alliance-manage/    # Cross-zone alliance management
│   │       ├── auto-clear/         # Scheduled data cleanup
│   │       ├── member-manage/      # Cross-zone member management
│   │       └── user-identity/      # User identity reset
│   │
│   ├── components/                 # Reusable components (1)
│   │   └── zone-selector/          # Zone picker with keyword search
│   │       ├── zone-selector.js    # Component logic
│   │       ├── zone-selector.json  # Component config
│   │       ├── zone-selector.wxml  # Template
│   │       └── zone-selector.wxss  # Styles
│   │
│   ├── utils/                      # Shared utilities
│   │   ├── app.js                  # Re-exported from root (symlink or duplicate)
│   │   ├── auth.js                 # Permission system: ROLE_PERMISSIONS, capability checks
│   │   ├── db.js                   # Database operations: all CRUD for all collections
│   │   ├── util.js                 # Formatting, validation, UI helpers
│   │   └── version.js              # Version number (APP_VERSION = '1.1.5')
│   │
│   ├── cloudfunctions/             # Cloud functions (12)
│   │   ├── login/                  # openid retrieval, phone decryption
│   │   ├── register/               # Fortress registration (create/cancel/list)
│   │   ├── getStatistics/          # Statistics aggregation
│   │   ├── manageZone/             # Zone CRUD, alliance ops, member removal
│   │   ├── manageAdmin/            # Admin application lifecycle
│   │   ├── manageTimeSlot/         # Time slot CRUD, tag/remark updates
│   │   ├── managePosition/         # Position config + registration (with transactions)
│   │   ├── manageUserIdentity/     # Zone admin binding by phone, pre-binding
│   │   ├── clearRegistrations/     # Expired data cleanup (alliance/zone/global)
│   │   ├── clearExpiredData/       # Scheduled auto-cleanup (30-day retention)
│   │   ├── sendFeedbackEmail/      # SMTP email for feedback
│   │   ├── migrate-zone-admin-ids/ # Migration: creatorId -> adminIds
│   │   └── repair-zone-creator/    # Batch repair: bind approved admins to zones
│   │
│   ├── images/                     # Static assets
│   │   ├── tab-home.png            # TabBar icons (home active/inactive)
│   │   ├── tab-my.png              # TabBar icons (my active/inactive)
│   │   ├── icon-*.png              # Role and feature icons
│   │   ├── logo.png                # App logo
│   │   └── default-avatar.png      # Fallback avatar
│   │
│   └── scripts/                    # Database initialization/migration scripts
│       ├── db-init.js              # Collection creation, super admin setup
│       ├── repair-zone-creator-binding.js  # Zone-creator binding repair
│       └── repair-zone-manager-identity.js # Zone manager identity repair
│
├── docs/                           # Documentation
│   ├── CHANGELOG.md                # Version history and planned features
│   └── plans/                      # Implementation plans
│
├── .cloudbase/                     # CloudBase container config
│   └── container/
│
├── .claude/                        # Claude Code configuration
│   └── ...
│
└── .planning/                      # GSD planning documents
    └── codebase/
        ├── ARCHITECTURE.md
        └── STRUCTURE.md
```

## Directory Purposes

**`miniprogram/pages/`:**
- Purpose: All UI pages, organized by role scope
- Contains: Each page has `.js` (logic), `.json` (config), `.wxml` (template), `.wxss` (styles)
- Key files: `index/index.js` (feature hub), `login/login.js` (shared auth), `user/my-registrations/` (tabBar)

**`miniprogram/utils/`:**
- Purpose: Shared business logic and data access layer
- Contains: Pure functions and async database wrappers
- Key files: `db.js` (1481 lines — all DB operations), `auth.js` (115 lines — permissions)

**`miniprogram/cloudfunctions/`:**
- Purpose: Server-side operations requiring trust (permissions, transactions, external APIs)
- Contains: Node.js modules with `index.js` + `package.json` per function
- Key files: Each function uses action-based routing pattern

**`miniprogram/components/`:**
- Purpose: Reusable UI components
- Contains: Currently only `zone-selector`
- Key files: `zone-selector/zone-selector.js` — keyword search filtering, global state sync

**`miniprogram/images/`:**
- Purpose: Static image assets
- Contains: PNG icons for tabBar, roles, features
- Note: WeChat Mini Program does not support SVG in templates

**`miniprogram/scripts/`:**
- Purpose: Database initialization and migration scripts
- Contains: One-time setup and repair operations
- Key files: `db-init.js` (collection creation)

**`docs/`:**
- Purpose: Project documentation
- Contains: Changelog, implementation plans

## Key File Locations

**Entry Points:**
- `miniprogram/app.js`: App lifecycle, global state, auto-login
- `miniprogram/app.json`: Page route registry (defines all 31 pages), tabBar (2 tabs)
- `miniprogram/app.wxss`: Global color scheme (Primary `#4A90D9`, Danger `#FF6B6B`, Success `#52C41A`)

**Configuration:**
- `miniprogram/cloudbaserc.json`: Cloud environment ID (`cloud1-9gip4qyf7e753868`)
- `miniprogram/utils/version.js`: Version number (`APP_VERSION = '1.1.5'`)
- `miniprogram/utils/db.js`: Preset constants (`TIME_VALUES`, `TAG_OPTIONS`, `FORTRESS_OPTIONS`, `VOICE_OPTIONS`, `BATTLE_POSITION_OPTIONS`, `POSITION_TYPES`)

**Core Logic:**
- `miniprogram/utils/db.js` (1481 lines): All database operations — users, zones, alliances, timeSlots, registrations, positionConfigs, positionRegistrations, battleConfigs, battleRegistrations, admins, superAdmins, feedbacks
- `miniprogram/utils/auth.js` (115 lines): Role-permission mapping, 15+ capability check functions
- `miniprogram/utils/util.js` (290 lines): Date formatting, validation, UI helpers, debounce/throttle, deep clone, ID generation

**Testing:**
- No test framework detected. This is a WeChat Mini Program project — no npm/yarn, no bundler, no linter.
- Manual testing only via WeChat Developer Tools
- Syntax validation: `node -c <file.js>` for parse-only checks

## Naming Conventions

**Files:**
- Pages: `kebab-case` directory names, repeated filename (`pages/user/my-registrations/my-registrations.js`)
- Utils: `camelCase.js` (`auth.js`, `db.js`, `util.js`, `version.js`)
- Cloud functions: `camelCase` directory names (`manageZone`, `clearRegistrations`, `sendFeedbackEmail`)
- Components: `kebab-case` (`zone-selector`)
- Page JS files use `Page({ ... })` factory; components use `Component({ ... })` factory

**Functions:**
- camelCase throughout (`createZone`, `getUserByPhone`, `checkPermission`)
- Async functions use `async/await` pattern
- Cloud function handlers are internal `async function` declarations

**Variables:**
- camelCase for local variables
- Constants: `UPPER_SNAKE_CASE` (`TIME_VALUES`, `TAG_OPTIONS`, `POSITION_TYPES`, `ROLE_PERMISSIONS`, `ROLE_NAMES`)
- Page data: camelCase (`selectedZone`, `isLoggedIn`, `userInfo`)

**Types:**
- No TypeScript — pure JavaScript (ES6+)
- No type annotations or interfaces

## Where to Add New Code

**New Feature:**
- Primary code: Create new directory under `miniprogram/pages/` with role-appropriate naming (e.g., `pages/user/new-feature/new-feature.js`)
- Register route in `miniprogram/app.json` → `pages` array
- Add navigation from appropriate page (usually `pages/index/index.js` or role-specific home)
- If server-side logic needed: Create new cloud function under `miniprogram/cloudfunctions/` with action-based routing

**New Database Collection:**
- Add CRUD operations to `miniprogram/utils/db.js` in the appropriate section
- Define any preset constants at the top of `db.js` (with the existing `TIME_VALUES`, `TAG_OPTIONS`, etc.)
- Update database permissions in WeChat Cloud Console

**New Cloud Function Action:**
- Add new `case` to the `switch (action)` in the relevant cloud function's `index.js`
- Add corresponding wrapper function in `miniprogram/utils/db.js` if called from client
- Deploy via WeChat Developer Tools: right-click folder → "上传并部署：云端安装依赖"

**New Utility Function:**
- Add to appropriate file in `miniprogram/utils/`:
  - DB operations → `db.js`
  - Auth/permission → `auth.js`
  - Formatting/validation/UI → `util.js`
- Export in `module.exports` at bottom of file

**New Reusable Component:**
- Create directory under `miniprogram/components/` with 4 files: `.js`, `.json`, `.wxml`, `.wxss`
- Register in page's `.json` `usingComponents` field

**New Tab:**
- Add to `miniprogram/app.json` → `tabBar.list` array
- Add icon files to `miniprogram/images/`
- Note: Maximum 5 tabs in WeChat Mini Program

## Special Directories

**`miniprogram/cloudfunctions/`:**
- Purpose: Serverless functions running on Tencent Cloud
- Generated: No — hand-written Node.js
- Committed: Yes — each has `index.js` and `package.json`
- Deployment: Manual via WeChat Developer Tools or CLI
- Environment: `cloud1-9gip4qyf7e753868` (consistent across all functions)

**`miniprogram/images/`:**
- Purpose: Static image assets for UI
- Generated: No — hand-designed or sourced PNGs
- Committed: Yes — part of the app bundle
- Note: Images contribute to mini program bundle size (max 2MB for code package)

**`docs/`:**
- Purpose: Human-readable documentation
- Contains: `CHANGELOG.md` (version history), `plans/` (implementation plans)
- Not loaded by the app at runtime

**`.cloudbase/container/`:**
- Purpose: CloudBase container deployment configuration
- Generated: By CloudBase CLI
- Committed: Yes

**`miniprogram/scripts/`:**
- Purpose: One-time database initialization and migration
- Not loaded by the app — run manually in Developer Tools console
- Contains: `db-init.js`, `repair-zone-creator-binding.js`, `repair-zone-manager-identity.js`

---

*Structure analysis: 2026-05-17*
