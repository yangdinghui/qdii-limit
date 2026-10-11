"use strict"

/**
 * 分类与展示规则：QDII 覆盖范围、地区 / 主题归纳、交易形态、限额等级与格式化。
 * 规则口径对齐 qdii-limit.vercel.app（东方财富公开字段 + 关键词分类）。
 */

const NASDAQ_100_KEYWORDS = [
  "纳斯达克100",
  "纳指100",
  "NASDAQ100",
  "Nasdaq100",
  "NASDAQ 100",
  "Nasdaq 100",
]

const US_KEYWORDS = ["标普500", "S&P 500", "S&P500", "SP500", "道琼斯", "美国", "美股", "纳斯达克", "纳指"]
const GLOBAL_KEYWORDS = ["全球", "境外", "海外"]

// 顺序即优先级：首个命中的规则生效。
const REGION_RULES = [
  ["japan", ["日本", "日经"]],
  ["india", ["印度"]],
  ["vietnam", ["越南"]],
  ["germany", ["德国", "DAX"]],
  ["europe", ["欧洲", "英国", "富时100", "FTSE 100"]],
  ["emerging", ["新兴市场"]],
  ["hongkong", ["恒生", "香港", "港股", "H股"]],
  [
    "china-offshore",
    ["中国互联网", "中概", "中国互联", "大中华", "中国世纪", "中国中小盘", "海外中国", "港美互联"],
  ],
  ["asia-pacific", ["亚太", "亚洲"]],
]

const THEME_RULES = [
  ["sp500", ["标普500", "S&P 500", "S&P500", "SP500"]],
  [
    "bond",
    [
      "美元债",
      "债券",
      "债基",
      "债",
      "高收益",
      "收益债",
      "信用债",
      "国债",
      "政府债",
      "公司债",
      "企业债",
      "投资级",
      "短债",
      "中短债",
      "固收",
      "票据",
      "亚洲债",
      "全球债",
      "海外债",
      "新兴市场债",
    ],
  ],
  ["hangseng-tech", ["恒生科技", "恒科"]],
  ["hangseng", ["恒生指数", "恒生中国企业", "H股", "恒生"]],
  ["hongkong-tech", ["香港科技", "港股科技", "中证香港科技"]],
  [
    "hongkong-biotech",
    [
      "港股创新药",
      "香港创新药",
      "港股医药",
      "香港医药",
      "港股医疗",
      "香港医疗",
      "港股生物",
      "香港生物",
    ],
  ],
  [
    "china-internet",
    [
      "港股互联网",
      "香港互联网",
      "海外中国互联网",
      "中国互联网",
      "中概互联网",
      "中概股",
      "中国互联",
      "中概互联",
    ],
  ],
  ["biotech", ["生物科技", "生物医药", "医疗保健", "医疗健康", "医药", "医疗", "创新药"]],
  ["tech", ["纳斯达克精选", "美国科技", "全球科技", "海外科技", "科技", "半导体", "芯片"]],
  ["commodity", ["黄金", "原油", "石油", "油气", "能源", "天然气", "商品", "有色", "资源"]],
  ["reits", ["REIT", "REITs", "REITS", "房地产信托"]],
]

const REGION_LABELS = {
  us: "美国",
  hongkong: "香港",
  "china-offshore": "中国离岸",
  global: "全球",
  "asia-pacific": "亚太",
  japan: "日本",
  india: "印度",
  vietnam: "越南",
  germany: "德国",
  europe: "欧洲/英国",
  emerging: "新兴市场",
  "other-region": "其他地区",
}

const THEME_LABELS = {
  nasdaq100: "纳指100",
  sp500: "标普500",
  "hangseng-tech": "恒生科技",
  hangseng: "恒生指数",
  tech: "科技主题",
  "hongkong-tech": "港股科技",
  "hongkong-biotech": "港股医药",
  "china-internet": "中国互联网",
  biotech: "生物科技",
  bond: "债券",
  commodity: "商品/能源",
  reits: "REITs",
  "other-qdii": "其他QDII",
}

function includesAnyKeyword(value, keywords) {
  const normalized = String(value ?? "").toLowerCase()
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))
}

function isQdiiLike(name, type) {
  return String(type ?? "").toLowerCase().includes("qdii") || String(name ?? "").toLowerCase().includes("qdii")
}

function isNasdaqLike(name) {
  return includesAnyKeyword(name, NASDAQ_100_KEYWORDS)
}

function getClassificationSources(name, type) {
  const sources = []
  if (String(type ?? "").toLowerCase().includes("qdii")) sources.push("type-qdii")
  if (String(type ?? "").includes("海外")) sources.push("type-overseas")
  if (String(name ?? "").toLowerCase().includes("qdii")) sources.push("name-qdii")
  return sources
}

function isOverseasLike(name, type) {
  return getClassificationSources(name, type).length > 0
}

function getClassificationScope(name, type) {
  if (isNasdaqLike(name)) return "nasdaq"
  return getClassificationSources(name, type).length > 0 ? "strong" : "supplemental"
}

function getRegionCategory(name, type) {
  const text = `${name ?? ""} ${type ?? ""}`

  for (const [region, keywords] of REGION_RULES) {
    if (includesAnyKeyword(text, keywords)) return region
  }
  if (isNasdaqLike(name) || includesAnyKeyword(text, US_KEYWORDS)) return "us"
  if (includesAnyKeyword(text, GLOBAL_KEYWORDS)) return "global"
  return "other-region"
}

function getThemeCategory(name, type) {
  if (isNasdaqLike(name)) return "nasdaq100"

  const text = `${name ?? ""} ${type ?? ""}`
  for (const [theme, keywords] of THEME_RULES) {
    if (includesAnyKeyword(text, keywords)) return theme
  }
  return "other-qdii"
}

function getTradingForm(name) {
  const value = String(name ?? "")
  if (value.includes("ETF联接") || value.includes("联接")) return "etf-link"
  if (value.includes("LOF")) return "lof"
  if (value.includes("ETF")) return "exchange-etf"
  if (value.includes("美元") || value.includes("现汇") || value.includes("现钞")) return "off-exchange"
  return "off-exchange"
}

function isOffExchangeLike(name) {
  return getTradingForm(name) !== "exchange-etf"
}

function detectShareClass(name) {
  const value = String(name ?? "")
  if (value.includes("现汇")) return "现汇"
  if (value.includes("现钞")) return "现钞"
  if (value.includes("美元")) return "美元"
  if (value.includes("人民币")) return "人民币"
  return "其他"
}

function parseAmount(value) {
  if (value == null || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatAmount(value) {
  if (value == null) return "未知"
  if (value === 0) return "0 元限额"
  if (value === 0.01) return "近零限额（0.01 元）"
  if (value >= 100000000) return "无限额/极高"
  if (value >= 10000) {
    const wan = value / 10000
    return `${Number.isInteger(wan) ? wan.toFixed(0) : wan.toFixed(2)} 万元`
  }
  return `${value.toLocaleString("zh-CN")} 元`
}

/** 原始状态归一化：只保留「开放申购 / 暂停申购」两种口径。 */
function normalizeSubscribeStatus(rawStatus, maxAmount, minAmount) {
  const status = String(rawStatus ?? "")
  if (status.includes("暂停")) return "暂停申购"
  if (maxAmount == null) return status === "开放申购" ? "开放申购" : "暂停申购"
  if (maxAmount === 0) return "暂停申购"
  if (minAmount != null && maxAmount < minAmount) return "暂停申购"
  return "开放申购"
}

function formatLimitDisplay(maxAmount, subscribeStatus) {
  if (String(subscribeStatus ?? "").includes("暂停")) return "暂停申购"
  return formatAmount(maxAmount)
}

function getLimitLevel(maxAmount, subscribeStatus) {
  if (String(subscribeStatus ?? "").includes("暂停")) return "paused"
  if (maxAmount == null) return "unknown"
  if (maxAmount <= 1000) return "low"
  if (maxAmount <= 10000) return "medium"
  if (maxAmount < 100000000) return "high"
  return "none"
}

function formatDateTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value ?? "")
  const pad = (input) => String(input).padStart(2, "0")
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

module.exports = {
  REGION_LABELS,
  THEME_LABELS,
  includesAnyKeyword,
  isQdiiLike,
  isNasdaqLike,
  isOverseasLike,
  getClassificationSources,
  getClassificationScope,
  getRegionCategory,
  getThemeCategory,
  getTradingForm,
  isOffExchangeLike,
  detectShareClass,
  parseAmount,
  formatAmount,
  normalizeSubscribeStatus,
  formatLimitDisplay,
  getLimitLevel,
  formatDateTime,
}
