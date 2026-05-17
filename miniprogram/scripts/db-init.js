/**
 * 数据库初始化脚本
 *
 * 使用方法：
 * 1. 在微信开发者工具中打开云开发控制台
 * 2. 进入数据库
 * 3. 创建以下集合：
 *    - users
 *    - admins
 *    - zones
 *    - alliances
 *    - timeSlots
 *    - registrations
 *    - superAdmins
 * 4. 为每个集合添加索引（参考 cloudbaserc.json）
 *
 * 5. 添加超级管理员手机号：
 *    在 superAdmins 集合中添加记录：
 *    {
 *      "phone": "您的手机号",
 *      "createTime": new Date()
 *    }
 */

// 集合名称
const COLLECTIONS = [
  'users',
  'admins',
  'zones',
  'alliances',
  'timeSlots',
  'registrations',
  'superAdmins',
  'arsenalConfigs',
  'arsenalRegistrations',
  'canyonConfigs',
  'canyonRegistrations'
]

// 创建集合的函数（在小程序端执行）
async function initDatabase() {
  const db = wx.cloud.database()

  for (const collection of COLLECTIONS) {
    try {
      // 先尝试创建集合（如果已存在会自动跳过）
      await db.createCollection(collection)
      console.log(`集合 ${collection} 已创建`)
    } catch (err) {
      // 集合已存在时会报错，这是正常的
      if (err.errMsg && err.errMsg.includes('already exists')) {
        console.log(`集合 ${collection} 已存在`)
      } else {
        // 尝试访问集合确认其可用性
        try {
          await db.collection(collection).limit(1).get()
          console.log(`集合 ${collection} 已就绪`)
        } catch (err2) {
          console.error(`集合 ${collection} 初始化失败:`, err2)
        }
      }
    }
  }
}

// 添加超级管理员手机号
async function addSuperAdmin(phone) {
  const db = wx.cloud.database()

  try {
    await db.collection('superAdmins').add({
      data: {
        phone: phone,
        createTime: db.serverDate()
      }
    })
    console.log('超级管理员添加成功')
  } catch (err) {
    console.error('添加超级管理员失败:', err)
  }
}

// 导出
module.exports = {
  initDatabase,
  addSuperAdmin,
  COLLECTIONS
}

/**
 * 使用示例：
 *
 * // 在 app.js 的 onLaunch 中执行
 * const dbInit = require('./scripts/db-init')
 *
 * App({
 *   onLaunch: function() {
 *     wx.cloud.init({ env: 'your-env-id' })
 *     dbInit.initDatabase()
 *     // 首次部署时添加超管手机号
 *     // dbInit.addSuperAdmin('13800138000')
 *   }
 * })
 */