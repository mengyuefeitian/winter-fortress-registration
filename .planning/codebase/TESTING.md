# Testing Patterns

**Analysis Date:** 2026-05-17

## Test Framework

**Runner:** **None detected**

This project has no formal test infrastructure. There are:
- No test files (`*.test.*`, `*.spec.*`) anywhere in the codebase
- No test configuration (no `jest.config.*`, `vitest.config.*`, `mocha*`)
- No test dependencies in any `package.json` (only `wx-server-sdk` in cloud functions)
- No `test` script in any package manifest
- No `__tests__` directories

**Run Commands:** Not applicable.

## Test File Organization

**Location:** No test files exist.

**Naming:** No convention established.

**Structure:** Not applicable.

## Current Verification Approach

The project relies entirely on **manual testing** through the WeChat Developer Tools:

1. **Preview in Developer Tools**: Open project in WeChat Developer Tools, click through pages, verify functionality
2. **Console inspection**: Use `console.log` / `console.error` output in the Developer Tools console for debugging
3. **Database inspection**: Check WeChat Cloud Console directly for data state verification
4. **Real device testing**: Deploy to real WeChat client for production-like verification

This approach has significant gaps:
- No automated regression detection
- No way to verify behavior after refactoring
- Manual testing is not reproducible or repeatable
- Edge cases are only tested if manually thought of during development

## Mocking

**Framework:** None

**Observed patterns:**
- Cloud functions are called directly via `wx.cloud.callFunction()` — no mocking of cloud SDK
- Database operations use real `wx.cloud.database()` — no fake/in-memory database layer
- `app.js` global state is used directly — no test doubles for app context

**What would benefit from mocking if tests were added:**
- `wx.cloud.callFunction()` — mock cloud function responses
- `wx.cloud.database()` — provide in-memory database for unit tests
- `wx.getStorageSync()` / `wx.setStorageSync()` — mock local storage
- `wx.showModal()`, `wx.showToast()`, `wx.showLoading()` — mock UI dialogs

## Fixtures and Factories

**Test Data:** None

**Location:** Not applicable.

**Observed data patterns in code:**
- Preset constants in `db.js`: `TIME_VALUES`, `TAG_OPTIONS`, `POSITION_TYPES`, `FORTRESS_OPTIONS`, `VOICE_OPTIONS`, `BATTLE_POSITION_OPTIONS`
- These could serve as fixture sources for test data generation

## Coverage

**Requirements:** None enforced

**View Coverage:** Not applicable.

## Test Types

**Unit Tests:** None

**Integration Tests:** None

**E2E Tests:** None

## What Should Be Tested (Recommended Priority)

Based on the codebase analysis, these areas should have test coverage if a testing strategy is introduced:

### High Priority

1. **Database operations (`miniprogram/utils/db.js`)** — 1480 lines, all data access logic
   - User creation/update with phone binding constraints
   - Admin application workflow (create, review, approve/reject)
   - Zone creation with duplicate code prevention
   - Registration creation with capacity checks and uniqueness constraints
   - Position registration with time slot conflict detection
   - Battle registration with nickname deduplication

2. **Permission system (`miniprogram/utils/auth.js`)** — 114 lines, security-critical
   - Role permission matrix (`ROLE_PERMISSIONS`)
   - Permission check functions (`hasPermission`, `canManageZone`, etc.)
   - Role escalation rules (`canApplyZoneManager`, `canReviewAllianceManager`)

3. **Validation functions (`miniprogram/utils/util.js`)** — pure functions, easy to test
   - `validateZoneCode()` — 4-digit number validation
   - `validatePhone()` — Chinese mobile format validation
   - `formatDate()` — date formatting with various templates
   - `formatTimeSlotName()` — time slot display name generation
   - `isTimeSlotFull()` — capacity check logic
   - `generatePositionTimeSlots()` — 30-minute interval generation
   - `debounce()` / `throttle()` — utility function behavior

4. **Cloud functions** — business rule enforcement
   - `register/index.js` — capacity check, nickname uniqueness
   - `login/index.js` — openid extraction, phone decryption
   - `manageAdmin/index.js` — application review workflow

### Medium Priority

5. **Page-level logic** — interaction with data layer
   - Login flow and role-based routing
   - Zone selection and persistence
   - Registration submission with validation chain
   - Admin review workflow

### Low Priority

6. **UI components** — visual rendering
   - `zone-selector` component filtering behavior
   - Layout and style rendering (would need visual regression testing)

## Recommended Testing Strategy

If testing were to be introduced, the approach would need to account for WeChat Mini Program platform constraints:

**Option 1: Extract pure logic for unit testing**
- Extract `util.js` validation/formatting functions into a standalone module
- Extract `db.js` business logic into a testable layer
- Run with Node.js + Jest/Vitest
- Test pure functions without WeChat runtime dependencies

**Option 2: Cloud function testing**
- Cloud functions use `wx-server-sdk` which can be mocked
- Test cloud function handlers with Jest/Vitest + mocked `cloud` module
- Focus on business rules: capacity checks, uniqueness constraints, permission validation

**Option 3: Mini Program test framework**
- WeChat provides `miniprogram-simulate` for component testing
- Limited support for full app testing
- Best for component-level unit tests

**Recommended approach:** Start with **Option 1** (pure logic) since it has no platform dependencies and provides immediate value. The validation and formatting functions in `util.js` are ideal first targets.

## Test Anti-Patterns Observed

Since there are no tests, there are no test anti-patterns. However, if tests are added, avoid:

- **Testing WeChat framework behavior** — don't test that `wx.cloud.callFunction` works; test what your code does with the result
- **Over-mocking the database layer** — prefer in-memory fakes over mock expectations for database operations
- **Testing implementation details of pages** — test the data flow and user outcomes, not internal `setData` calls
- **Snapshot testing WXML** — templates change frequently; snapshots would break on every layout tweak

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "WeChat Mini Programs can't be tested" | Pure logic can be extracted and tested. Cloud functions can be tested with mocked SDK. |
| "Manual testing is enough" | Manual testing catches regressions only if someone remembers to check everything. |
| "The app is small enough" | 1480-line `db.js` and 928-line `index.js` are not small. Changes risk breaking existing behavior. |
| "We'll add tests later" | Adding tests after the fact tests implementation, not behavior. The best time was at the start. |

---

*Testing analysis: 2026-05-17*
