// utils/updates.js
// 「功能介绍」的版本清单 —— 决定「我的 → 帮助与反馈 → 功能介绍」里能点哪些版本。
//
// ⚠️ 白名单规则：只登记**网站上确实已经发布说明页**的版本。
//    没上线的版本不要提前加，否则用户点进去是 404。
//    新版本页面发布后，在 RELEASES 数组顶部追加一条即可，列表页会自动显示。
//
// ⚠️ 打开方式：由 `pages/user/updates` 列表点击后交给 `utils/link.js`
//    （复制链接 → 引导到浏览器打开）。本小程序是个人主体，用不了 web-view。

const BASE = 'https://www.xiaoanhome.xyz/winter-fortress/updates'

// 版本号 → URL slug：1.7.0 → v1-7-0
function slugOf(ver) {
  return 'v' + String(ver || '').replace(/\./g, '-')
}

// 已上线版本说明（倒序，最新在最上）
const RELEASES = [
  {
    version: '1.17.0',
    date: '2026-09-25',
    // ⚠️ 标题与摘要必须与官网说明页一致（取自「本次更新概览」）
    title: '游戏账号全面升级',
    summary: '多账号管理 + 报名自动填充 + 兵种阶级同步。这个版本围绕「游戏账号」做了一次全面升级：多个游戏账号统一管理、报名时一键切换自动填充、等级选择器全站统一，并新增兵种阶级（T11 / T12）的展示与同步。另外，「帮助与反馈」里还新增了「功能介绍」与「关于」两个入口。',
    url: BASE + '/v1-17-0'
  },
  {
    version: '1.7.0',
    date: '2026-09-17',
    title: '联盟活跃',
    summary: '成员周活跃自动登记、区管总览、成员详情与活跃截图',
    url: BASE + '/v1-7-0'
  }
]

// 列表页数据源；url 缺失的条目自动补成按规则拼出的地址
function list() {
  return RELEASES.map(function (item) {
    return {
      version: item.version,
      date: item.date || '',
      title: item.title || '',
      summary: item.summary || '',
      url: item.url || (BASE + '/' + slugOf(item.version))
    }
  })
}

module.exports = {
  BASE: BASE,
  slugOf: slugOf,
  list: list
}
