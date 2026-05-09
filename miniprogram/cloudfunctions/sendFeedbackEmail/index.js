const cloud = require('wx-server-sdk')
const nodemailer = require('nodemailer')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 邮件配置 - 使用163邮箱作为发件人
const EMAIL_CONFIG = {
  host: 'smtp.163.com',
  port: 465,
  secure: true,
  user: '17817560527@163.com',
  pass: 'ZBp4QZTBsu3UZY55'
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

exports.main = async (event, context) => {
  const { feedbackId, type, content, contactInfo, nickName, imageUrls } = event

  try {
    if (!EMAIL_CONFIG.pass || EMAIL_CONFIG.pass === '请填写授权码') {
      console.error('未配置邮件授权码，请在 EMAIL_CONFIG.pass 中填入163邮箱的客户端授权码')
      return { success: false, error: '未配置邮件授权码' }
    }

    const transporter = createTransporter()

    const subject = `[轻趣规划][${type}]`

    // 将云存储 fileID 转换为临时下载链接
    let imageHtml = ''
    if (imageUrls && imageUrls.length > 0) {
      try {
        console.log('图片fileIDs:', imageUrls)
        const res = await cloud.getTempFileURL({ fileList: imageUrls })
        console.log('获取临时链接结果:', JSON.stringify(res))
        imageHtml = '<h3>反馈图片：</h3>'
        for (const item of res.fileList) {
          if (item.tempFileURL) {
            imageHtml += `<img src="${item.tempFileURL}" style="max-width:400px;margin:8px 0;border:1px solid #eee;" /><br>`
          } else {
            console.error('单张图片获取链接失败:', item)
          }
        }
      } catch (imgErr) {
        console.error('获取图片临时链接失败:', imgErr)
        imageHtml = `<p style="color:#999;">（图片上传成功但获取下载链接失败: ${imgErr.message}）</p>`
      }
    }

    const html = `
      <h2>意见反馈</h2>
      <p><strong>类型：</strong>${type}</p>
      <p><strong>用户：</strong>${nickName || '匿名'}</p>
      <p><strong>联系方式：</strong>${contactInfo || '未提供'}</p>
      <h3>反馈内容：</h3>
      <p>${content.replace(/\n/g, '<br>')}</p>
      ${imageHtml}
      <hr>
      <p><small>请在小程序中查看详情</small></p>
    `

    await transporter.sendMail({
      from: `"轻趣规划反馈" <${EMAIL_CONFIG.user}>`,
      to: EMAIL_CONFIG.user,
      subject,
      html
    })

    return { success: true }
  } catch (err) {
    console.error('发送邮件失败:', err)
    return { success: false, error: err.message }
  }
}
