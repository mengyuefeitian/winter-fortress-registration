/**
 * 修复历史区管身份数据
 *
 * 问题背景：
 * 1. 分区创建时 creatorId 存的是 MongoDB _id
 * 2. 但 checkIsZoneManagerInZone 之前用的是 openid 查询，导致永远匹配不上
 * 3. 已修复为使用 MongoDB _id 查询，但历史数据中可能存在 creatorId 不一致的情况
 *
 * 修复内容：
 * 1. 检查所有已批准的 zoneManager 和 zoneCreation 申请
 * 2. 验证对应分区的 creatorId 是否与申请人 MongoDB _id 一致
 * 3. 不一致的自动修复
 *
 * 使用方法：
 * 在微信开发者工具控制台中运行：
 * 1. 先复制本文件内容到控制台
 * 2. 调用 await repairZoneManagerIdentities()
 */
async function repairZoneManagerIdentities() {
  const wxdb = wx.cloud.database()
  const _ = wxdb.command

  let totalFixed = 0
  let totalChecked = 0
  let totalIssues = []

  console.log('=== 开始修复区管身份数据 ===')

  // 1. 查找所有已批准的 zoneManager 申请（带有 zoneId 的）
  console.log('\n[1] 检查已批准的区管申请...')
  const zoneManagerApps = await wxdb.collection('admins').where({
    applyType: 'zoneManager',
    status: 'approved',
    zoneId: _.neq(null)
  }).get()

  console.log('  找到 ' + zoneManagerApps.data.length + ' 条区管申请记录')

  for (const app of zoneManagerApps.data) {
    if (!app.zoneId || !app.userId) continue

    const zoneId = app.zoneId
    const userOpenid = app.userId

    // 查询用户的 MongoDB _id
    const userRes = await wxdb.collection('users').where({ openid: userOpenid }).get()
    if (userRes.data.length === 0) {
      console.log('  [跳过] 用户不存在: ' + userOpenid)
      continue
    }
    const userMongoId = userRes.data[0]._id

    // 检查分区的 creatorId
    const zoneRes = await wxdb.collection('zones').doc(zoneId).get()
    if (!zoneRes.data) {
      console.log('  [跳过] 分区不存在: ' + zoneId)
      continue
    }

    totalChecked++
    const currentCreatorId = zoneRes.data.creatorId

    if (currentCreatorId !== userMongoId) {
      console.log('  [修复] 分区 ' + zoneRes.data.zoneName + '(' + zoneId + ') 的 creatorId: ' +
        currentCreatorId + ' → ' + userMongoId)

      await wxdb.collection('zones').doc(zoneId).update({
        data: {
          creatorId: userMongoId,
          updateTime: wxdb.serverDate()
        }
      })
      totalFixed++
    } else {
      console.log('  [OK] 分区 ' + zoneRes.data.zoneName + ' creatorId 正确')
    }
  }

  // 2. 查找所有已批准的 zoneCreation 申请
  console.log('\n[2] 检查已批准的分区开通申请...')
  const zoneCreationApps = await wxdb.collection('admins').where({
    applyType: 'zoneCreation',
    status: 'approved'
  }).get()

  console.log('  找到 ' + zoneCreationApps.data.length + ' 条分区开通申请记录')

  for (const app of zoneCreationApps.data) {
    if (!app.userId) continue

    const userOpenid = app.userId

    // 查询用户的 MongoDB _id
    const userRes = await wxdb.collection('users').where({ openid: userOpenid }).get()
    if (userRes.data.length === 0) {
      console.log('  [跳过] 用户不存在: ' + userOpenid)
      continue
    }
    const userMongoId = userRes.data[0]._id

    // 查找该用户创建的所有分区
    const zonesRes = await wxdb.collection('zones').where({ creatorId: userMongoId }).get()
    totalChecked += zonesRes.data.length

    // 如果有分区但 creatorId 不正确（比如存的是 openid 而不是 _id）
    // 这种情况比较少，因为 createZone 内部用的是 MongoDB _id
    // 但如果用户通过其他方式（如云函数 manageZone）创建，creatorId 可能是 openid
    const zonesByOpenid = await wxdb.collection('zones').where({ creatorId: userOpenid }).get()
    totalChecked += zonesByOpenid.data.length

    if (zonesByOpenid.data.length > 0) {
      for (const zone of zonesByOpenid.data) {
        console.log('  [修复] 分区 ' + zone.zoneName + '(' + zone._id + ') creatorId: openid → MongoDB _id')

        await wxdb.collection('zones').doc(zone._id).update({
          data: {
            creatorId: userMongoId,
            updateTime: wxdb.serverDate()
          }
        })
        totalFixed++
      }
    }
  }

  // 3. 全局扫描：检查所有分区，如果 creatorId 是 openid 格式，转换为 MongoDB _id
  console.log('\n[3] 全局扫描所有分区...')
  const allZones = await wxdb.collection('zones').get()
  console.log('  找到 ' + allZones.data.length + ' 个分区')

  for (const zone of allZones.data) {
    if (!zone.creatorId) {
      console.log('  [警告] 分区 ' + zone.zoneName + ' 没有 creatorId')
      totalIssues.push({ zoneId: zone._id, zoneName: zone.zoneName, issue: '无creatorId' })
      continue
    }

    // 检查 creatorId 是否是 openid 格式（以 'o' 开头的 28 位字符串）
    const looksLikeOpenid = /^o[A-Za-z0-9_-]{27,}$/.test(zone.creatorId)
    if (!looksLikeOpenid) continue

    // 是 openid，查找对应的 MongoDB _id
    const userRes = await wxdb.collection('users').where({ openid: zone.creatorId }).get()
    if (userRes.data.length === 0) {
      console.log('  [警告] 分区 ' + zone.zoneName + ' 的 creatorId 找不到对应用户: ' + zone.creatorId)
      totalIssues.push({ zoneId: zone._id, zoneName: zone.zoneName, issue: 'creatorId无对应用户' })
      continue
    }

    const userMongoId = userRes.data[0]._id
    if (zone.creatorId !== userMongoId) {
      console.log('  [修复] 分区 ' + zone.zoneName + ' creatorId: openid → MongoDB _id')
      await wxdb.collection('zones').doc(zone._id).update({
        data: {
          creatorId: userMongoId,
          updateTime: wxdb.serverDate()
        }
      })
      totalFixed++
    }
  }

  console.log('\n=== 修复完成 ===')
  console.log('检查总数: ' + totalChecked)
  console.log('修复总数: ' + totalFixed)
  if (totalIssues.length > 0) {
    console.log('未解决问题: ' + totalIssues.length)
    console.log(JSON.stringify(totalIssues, null, 2))
  }

  return { totalChecked, totalFixed, totalIssues }
}

// 导出（在控制台手动调用）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = repairZoneManagerIdentities
}
