// utils/updates.js
// 「功能介绍」的版本说明数据源 —— 列表页 + 小程序内详情页都从这里取数。
//
// ⚠️ 数据来源已改为**本地**（2026-11-05）：列表点进去是站内详情页，不再直接跳官网，
//    所以新增版本不再受「官网必须先发说明页」的白名单限制。
//    只有 url 非空的版本才在详情页显示「复制官网说明页链接」按钮；
//    新版本没有官网页面时 url 留空即可，list() 不会自动拼地址（拼出来会 404）。
//
// ⚠️ 每个版本的字段：
//    version / date  列表头部
//    title           蓝色标题（列表 + 详情）
//    summary         列表摘要（会被截断成 2 行，写短一点更醒目）
//    content[]       详情页分段正文，{ heading, text }，heading 可省略
//    url             官网说明页，可选；没有就留空字符串

const BASE = 'https://www.xiaoanhome.xyz/winter-fortress/updates'

// 版本号 → URL slug：1.7.0 → v1-7-0（保留供日后官网说明页命名用）
function slugOf(ver) {
  return 'v' + String(ver || '').replace(/\./g, '-')
}

// 版本说明（倒序，最新在最上）
const RELEASES = [
  {
    version: '1.20.0',
    date: '2026-11-05',
    title: '雪域战火报名 · 50 人满员',
    summary: '新增第三种联盟活动「雪域战火」，配置、报名、统计、我的报名全链路打通；30 参战 + 20 替补共 50 人，名单与截图都不再被 20 人上限截断。',
    content: [
      {
        heading: '配置',
        text: '盟管控制台的「兵工厂&峡谷」升级为「兵工厂&峡谷&雪域」，活动类型新增「雪域战火」，仍然可以选择军团 1 或军团 2。时间段新增 12:30 与 15:00，和原有的 12:00 / 19:00 / 20:30 / 22:00 一起按时间先后排列。'
      },
      {
        heading: '报名',
        text: '首页新增「雪域战火报名」（说明：联盟活动报名），内部页面与兵工厂、峡谷会战完全一致，只有替补上限不同 —— 由 10 人提升到 20 人，也就是 30 个参战 + 20 个替补，一场最多 50 人。'
      },
      {
        heading: '名单不再被截断',
        text: '过去报名人数一多，列表和统计只显示前 20 人，而且不会报错。本版把所有「取全部报名记录」的地方改成逐页拉取，人数单独精确统计，名额校验也改为按实际人数判断。报满 50 人时，名单、统计和导出截图都能完整呈现，不会悄悄少人。'
      },
      {
        heading: '统计与截图',
        text: '盟管、区管、超管三处数据统计都新增「雪域报名」，查看方式与兵工厂 / 峡谷一致。保存截图按真实人数决定画面长度，参战在上、替补在下，人再多也不会被裁掉。'
      },
      {
        heading: '我的报名',
        text: '「我的报名」新增雪域战火区块，样式与兵工厂报名一致，可以查看本人在当前分区的雪域报名记录，也能直接取消。'
      }
    ],
    url: ''
  },
  {
    version: '1.18.0',
    date: '2026-10-09',
    title: '熊坑报名 · 排位图',
    summary: '给每个联盟生成一张排位图，按地心探险等级自动排座，可指定一位邻居连坐；分布图按游戏内还原，支持缩放与保存到相册。',
    content: [
      {
        heading: '报名',
        text: '报名信息为「联盟 + 昵称 + 地心探险等级」，可以任选「按等级排」或指定一位邻居连坐。每个联盟生成一张自己的排位图，不会自动清空；管理员可以删除成员，删完自动重排。'
      },
      {
        heading: '分布图严格按游戏内还原',
        text: '采用 25×25 细格坐标系，四个风车状色块围绕中心熊坑，共 140 个位置、最多排 100 人。1 号位在熊坑正下方，同环内顺时针编号。四种颜色只是方便看图的配色，不代表分组。'
      },
      {
        heading: '排位规则',
        text: '座位严格按地心探险等级的名次落座；指定的邻居限定在同一环内自由换位，所以一定能挨上，同时不会把名次更高的人挤到后面。'
      },
      {
        heading: '看图与导出',
        text: '图上可以直接切换查看编号或座位号，支持全屏缩放查看，也能保存到相册发到群里。'
      }
    ],
    url: ''
  },
  {
    version: '1.17.0',
    date: '2026-09-25',
    title: '游戏账号全面升级',
    summary: '多账号管理 + 报名自动填充 + 兵种阶级同步。多个游戏账号统一管理、报名时一键切换自动填充、等级选择器全站统一，并新增兵种阶级（T11 / T12）的展示与同步；「帮助与反馈」里新增「功能介绍」与「关于」两个入口。',
    content: [
      {
        heading: '多账号管理',
        text: '多个游戏账号统一管理，报名时一键切换，昵称、联盟等信息自动填充，不用每次重新填一遍。'
      },
      {
        heading: '等级与兵种阶级',
        text: '等级选择器在全站统一了样式与交互，并新增兵种阶级（T11 / T12）的展示与同步，报名信息更直观。'
      },
      {
        heading: '帮助与反馈',
        text: '「帮助与反馈」里新增「功能介绍」与「关于」两个入口，版本说明和产品信息都能直接查到。'
      }
    ],
    url: BASE + '/v1-17-0'
  },
  {
    version: '1.7.0',
    date: '2026-09-17',
    title: '联盟活跃',
    summary: '成员周活跃自动登记、区管总览、成员详情与活跃截图',
    content: [
      {
        heading: '周活跃自动登记',
        text: '打开小程序就会自动登记当日活跃，不用再在群里挨个点名。'
      },
      {
        heading: '区管总览与成员详情',
        text: '区管可以查看整个分区的活跃总览，点进联盟还能看每个成员的详情。'
      },
      {
        heading: '活跃截图',
        text: '支持把本周活跃表导出成图片保存到相册，方便直接发群。'
      }
    ],
    url: BASE + '/v1-7-0'
  }
]

// 列表页数据源：只带列表需要的字段，正文 content 不进 setData
function list() {
  return RELEASES.map(function (item) {
    return {
      version: item.version,
      date: item.date || '',
      title: item.title || '',
      summary: item.summary || '',
      hasWebPage: !!item.url
    }
  })
}

// 详情页数据源：按版本号取整条记录（含分段正文与官网链接）
function getByVersion(version) {
  const ver = String(version || '')
  const item = RELEASES.find(function (r) { return r.version === ver })
  if (!item) return null
  return {
    version: item.version,
    date: item.date || '',
    title: item.title || '',
    summary: item.summary || '',
    content: item.content || [],
    url: item.url || '',
    hasWebPage: !!item.url
  }
}

module.exports = {
  BASE: BASE,
  slugOf: slugOf,
  list: list,
  getByVersion: getByVersion
}
