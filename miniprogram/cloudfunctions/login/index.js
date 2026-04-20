// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: 'cloud1-9gip4qyf7e753868'  // 指定具体环境ID
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()

  // 获取用户openid
  const openid = wxContext.OPENID

  // 如果是获取手机号
  if (event.action === 'getPhone') {
    try {
      const result = await cloud.getOpenData({
        list: [event.cloudID]
      })

      if (result.list && result.list.length > 0) {
        const phoneInfo = result.list[0]
        return {
          phone: phoneInfo.data.phoneNumber
        }
      }
    } catch (err) {
      console.error('获取手机号失败:', err)
      return {
        err: err,
        openid: openid
      }
    }
  }

  // 默认返回openid
  return {
    openid: openid
  }
}