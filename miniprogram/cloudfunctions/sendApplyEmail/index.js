const cloud = require('wx-server-sdk')
const nodemailer = require('nodemailer')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 邮件配置 - 使用163邮箱作为发件人（与 sendFeedbackEmail 一致）
const EMAIL_CONFIG = {
  host: 'smtp.163.com',
  port: 465,
  secure: true,
  user: '17817560527@163.com',
  pass: 'ZBp4QZTBsu3UZY55'
}

// 申请类型中文名
const APPLY_TYPE_NAMES = {
  zoneManager: '区管',
  allianceManager: '盟管',
  zoneCreation: '分区开通'
}

function createTransporter() {
  return nodemailer.createTransport({
    host: EMAIL_CONFIG.host,
    port: EMAIL_CONFIG.port,
    secure: EMAIL_CONFIG.secure,
    auth: {
      user: EMAIL_CONFIG.user,
      pass: EMAIL_CONFIG.pass
    }
  })
}

// 北京时间格式化（云函数运行在 UTC，需 +8 小时）
function formatTime(date) {
  const bj = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  const y = bj.getUTCFullYear()
  const m = String(bj.getUTCMonth() + 1).padStart(2, '0')
  const d = String(bj.getUTCDate()).padStart(2, '0')
  const h = String(bj.getUTCHours()).padStart(2, '0')
  const min = String(bj.getUTCMinutes()).padStart(2, '0')
  return y + '-' + m + '-' + d + ' ' + h + ':' + min
}

exports.main = async (event, context) => {
  const { applyType, nickName, phone, zoneName, allianceName } = event
  const typeName = APPLY_TYPE_NAMES[applyType] || '管理员'

  try {
    if (!EMAIL_CONFIG.pass || EMAIL_CONFIG.pass === '请填写授权码') {
      console.error('未配置邮件授权码')
      return { success: false, error: '未配置邮件授权码' }
    }

    const transporter = createTransporter()

    const subject = `[冬日堡垒][新${typeName}申请待审核]`

    let detail = ''
    detail += `<p><strong>申请类型：</strong>${typeName}申请</p>`
    detail += `<p><strong>申请人：</strong>${nickName || '匿名'}</p>`
    detail += `<p><strong>手机号：</strong>${phone || '未提供'}</p>`
    if (zoneName) detail += `<p><strong>分区：</strong>${zoneName}</p>`
    if (allianceName) detail += `<p><strong>联盟：</strong>${allianceName}</p>`
    detail += `<p><strong>提交时间：</strong>${formatTime(new Date())}（北京时间）</p>`

    const html = `
      <h2>新的${typeName}申请待审核</h2>
      ${detail}
      <hr>
      <p><small>请尽快在小程序中进入「管理员审核」处理该申请</small></p>
    `

    await transporter.sendMail({
      from: `"冬日堡垒申请通知" <${EMAIL_CONFIG.user}>`,
      to: EMAIL_CONFIG.user,
      subject,
      html
    })

    return { success: true }
  } catch (err) {
    console.error('发送申请邮件失败:', err)
    return { success: false, error: err.message }
  }
}
