/**
 * 订阅消息通知配置
 *
 * 使用前请到小程序后台配置订阅消息模板：
 * 1. 登录 mp.weixin.qq.com → 功能 → 订阅消息
 * 2. 在「公共模板库」中选择包含以下字段的模板：
 *    - 申请类型 / 申请内容 (thing 类型)
 *    - 审核结果 (phrase 类型)
 *    - 审核时间 (time 或 date 类型)
 *    - 备注 (thing 类型)
 * 3. 将模板 ID 填入下面的 TEMPLATE_ID
 * 4. 根据实际模板字段编号，调整 TEMPLATE_DATA_KEYS 的 value
 *    （微信模板字段名形如 thing1、phrase2、time3、thing4，编号因模板而异）
 */

// ====== 审核结果通知模板 ID ======
const TEMPLATE_ID = '6SGXLQjFHcVZf7dW68GMoff--FyBHox05W_g1FctnEw'

/**
 * 模板字段映射
 * key   = 代码中的语义名称（固定）
 * value = 微信模板中的字段编号（根据实际模板修改）
 */
const TEMPLATE_DATA_KEYS = {
  applyType: 'short_thing16', // 申请类型，如"区管申请"
  time: 'time7',              // 审核时间
  result: 'phrase3',          // 审核结果，如"已通过" / "已拒绝"
  remark: 'thing9'            // 备注（分区/联盟信息 或 拒绝原因）
}

/**
 * 请求订阅消息授权（一次性）
 * 必须在用户点击事件回调中调用。
 * 用户同意后，服务端可通过 subscribeMessage.send 发送一条消息。
 *
 * @param {string} [tmplId] 模板ID，默认使用上方 TEMPLATE_ID
 * @returns {Promise<boolean>} 用户是否同意接收
 */
function requestSubscribe(tmplId) {
  var id = tmplId || TEMPLATE_ID
  return new Promise(function (resolve) {
    // 未配置模板 ID 时静默跳过
    if (!id) {
      console.warn('[notifyConfig] 未配置订阅消息模板ID，跳过授权请求')
      resolve(false)
      return
    }
    wx.requestSubscribeMessage({
      tmplIds: [id],
      success: function (res) {
        resolve(res[id] === 'accept')
      },
      fail: function (err) {
        console.warn('[notifyConfig] 订阅消息授权失败:', err)
        resolve(false)
      }
    })
  })
}

module.exports = {
  TEMPLATE_ID: TEMPLATE_ID,
  TEMPLATE_DATA_KEYS: TEMPLATE_DATA_KEYS,
  requestSubscribe: requestSubscribe
}
