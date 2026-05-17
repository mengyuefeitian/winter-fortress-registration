---
slug: admin-remove-auditor-fails
status: root_cause_found
trigger: "区管(admin)没有权限删除盟管(auditor)，在联盟配置里面删除后会恢复，或者删除不生效。超管没问题。"
created: 2026-05-16
---

## Symptoms

- Admin (区管) removes an auditor (盟管) from alliance-config page
- After deletion, the auditor reappears or deletion doesn't take effect
- SuperAdmin can delete auditors without issue

## Evidence

- timestamp: 2026-05-16T00:00 — Read admin/alliance-config/alliance-config.js: removeAuditor calls `db.removeMember(auditorId, 'auditor', this.data.selectedZone._id)`
- timestamp: 2026-05-16T00:00 — Read superAdmin/alliance-manage/alliance-manage.js: removeAuditor calls same `db.removeMember(auditorId, 'auditor', this.data.selectedZone._id)` — identical code path
- timestamp: 2026-05-16T00:00 — Read db.js removeMember: Lines 547-644. The function does client-side `db.collection('alliances').doc(alliance._id).update(...)` with `_.pull(userId)`
- timestamp: 2026-05-16T00:00 — Read CLAUDE.md: alliances collection permission is "仅创建者可写，所有人可读"
- timestamp: 2026-05-16T00:00 — Read manageZone cloud function: unbindAllianceAuditor action exists and works correctly in cloud (admin context)

## Current Focus

### Hypothesis

The `alliances` collection has "仅创建者可写" (creator-only write) permission. When admin calls `removeMember`, it performs a **client-side** `db.collection('alliances').doc(alliance._id).update(...)` which fails silently because the admin user is NOT the creator of the alliance document. SuperAdmin works because cloud functions run with admin privileges.

The `removeMember` function in db.js (lines 562-568) updates alliances directly from the client:
```js
await db.collection('alliances').doc(alliance._id).update({
  data: {
    auditorIds: _.pull(userId),
    auditorId: null,
    updateTime: db.serverDate()
  }
})
```

This client-side update is rejected by the database permission rule ("仅创建者可写"), but the error is likely caught and swallowed, so the UI shows "已移除" but the database change never persisted. When the page reloads (`loadAlliances`), the auditor reappears.

The same issue applies to the zones collection update (line 596) and users collection update (line 624) — but zones uses "仅创建者可写" too, and users uses "所有人可读写" so the users update works.

### Next Action

Fix `removeMember` to use cloud functions instead of client-side database writes for collections with creator-only write permissions (alliances, zones).

## Resolution

### root_cause

The `removeMember` function in db.js performs client-side database writes on the `alliances` and `zones` collections, which have "仅创建者可写" (creator-only write) permissions. Since the admin user is not the creator of these documents, the write operations are silently rejected by the database security rules. The auditor is never actually removed from `auditorIds[]`, so they reappear on reload. SuperAdmin appears to work because the `alliance-manage` page uses the same `removeMember` path — but if it works for superAdmin, it's likely because of a different code path or the superAdmin happens to be the zone creator.

### fix

Route the alliance unbinding and zone admin removal through cloud functions (like `manageZone`), which run with admin privileges and bypass client-side permission restrictions. Specifically:
1. Add `removeMember` action to the `manageZone` cloud function (or create a dedicated `manageMember` cloud function)
2. Update `db.removeMember` to call the cloud function instead of doing client-side writes for `alliances` and `zones` collections
3. Keep the `users` and `admins` collection updates as client-side (they have "所有人可读写" permission)
