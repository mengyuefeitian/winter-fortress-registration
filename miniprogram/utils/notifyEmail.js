// 申请提交后异步发送邮件通知超管（不阻塞主流程）
function sendApplyEmail(params) {
  try {
    wx.cloud.callFunction({
      name: 'sendApplyEmail',
      data: params
    }).then((res) => {
      console.log('[notifyEmail] 申请邮件发送结果:', res.result)
    }).catch((err) => {
      // 邮件发送失败不影响申请主流程
      console.error('[notifyEmail] 申请邮件发送失败:', err)
    })
  } catch (err) {
    console.error('[notifyEmail] 调用云函数异常:', err)
  }
}

module.exports = { sendApplyEmail }
