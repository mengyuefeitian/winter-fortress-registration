// miniprogram/utils/cache.js
const DEFAULT_TTL = 60 * 1000  // 默认 60 秒

function _store() {
  const app = getApp()
  if (!app.globalData.pageCache) app.globalData.pageCache = {}
  return app.globalData.pageCache
}

function get(key) {
  const entry = _store()[key]
  if (!entry) return null
  if (Date.now() - entry.timestamp > entry.ttl) {
    delete _store()[key]
    return null
  }
  return entry.data
}

function set(key, data, ttl) {
  _store()[key] = { data: data, timestamp: Date.now(), ttl: ttl || DEFAULT_TTL }
}

function invalidate(prefix) {
  const store = _store()
  Object.keys(store).forEach(function(k) {
    if (k.startsWith(prefix)) delete store[k]
  })
}

module.exports = { get: get, set: set, invalidate: invalidate }
