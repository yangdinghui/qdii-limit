"use strict"

/**
 * 自测脚本：用同一份前端逻辑（public/app.js）对真实上游数据跑筛选、联动、排序与限额口径校验。
 * 运行：node scripts/self-test.js
 */

const fs = require("node:fs")
const path = require("node:path")

const { fetchEastmoneyFunds, buildFundsResponse } = require("../lib/eastmoney")

let failures = 0
let checks = 0

function check(label, condition, detail) {
  checks += 1
  if (condition) {
    console.log(`  ✓ ${label}`)
    return
  }
  failures += 1
  console.log(`  ✗ ${label}${detail === undefined ? "" : ` —— ${detail}`}`)
}

/** 在无 DOM 的 Node 环境里加载浏览器端逻辑，拿到纯函数做校验。 */
function loadDashboardLogic() {
  const source = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8")
  const windowStub = {}
  const factory = new Function(
    "window",
    "document",
    "localStorage",
    "fetch",
    `${source}\n;return window.QDII_DASHBOARD`,
  )
  return factory(windowStub, undefined, undefined, undefined)
}

/** 与前端独立实现的一遍口径，用于交叉验证。 */
function expectedFilterCount(funds, { query = "", regions = [], themes = [], status = "all", limit = "all" }) {
  const needle = query.trim().toLowerCase()
  return funds.filter((fund) => {
    if (needle && !`${fund.code} ${fund.name} ${fund.type}`.toLowerCase().includes(needle)) return false
    if (status === "open" && fund.subscribeStatus !== "开放申购") return false
    if (status === "paused" && fund.subscribeStatus !== "暂停申购") return false
    if (regions.length && !regions.includes(fund.regionCategory)) return false
    if (themes.length && !themes.includes(fund.themeCategory)) return false
    if (limit !== "all" && fund.limitLevel !== limit) return false
    return true
  }).length
}

async function main() {
  console.log("QDII Limit Monitor 自测\n")

  const api = loadDashboardLogic()
  const { raw, funds, overseasFunds } = await fetchEastmoneyFunds()
  const payload = buildFundsResponse({ raw, funds, overseasFunds })

  console.log("【数据概览】")
  console.log(`  全量基金 ${payload.total} 只 · QDII/海外 ${payload.filteredTotal} 只 · 交易日 ${payload.showday.join(", ")}`)

  console.log("\n【服务端响应结构】")
  check("ok 标记为 true", payload.ok === true)
  check("source 为 eastmoney", payload.source === "eastmoney")
  check("funds 与 filteredTotal 一致", payload.funds.length === payload.filteredTotal, `${payload.funds.length} vs ${payload.filteredTotal}`)
  check("QDII 数量在合理区间（>500）", payload.filteredTotal > 500, payload.filteredTotal)

  console.log("\n【申购状态与限额口径】")
  const badStatus = payload.funds.filter((fund) => !["开放申购", "暂停申购"].includes(fund.subscribeStatus))
  check("状态只保留「开放申购 / 暂停申购」", badStatus.length === 0, `${badStatus.length} 条异常`)

  const badLevel = payload.funds.filter((fund) => {
    if (fund.subscribeStatus === "暂停申购") return fund.limitLevel !== "paused"
    if (fund.maxSubscribeAmount == null) return fund.limitLevel !== "unknown"
    const expected =
      fund.maxSubscribeAmount <= 1000
        ? "low"
        : fund.maxSubscribeAmount <= 10000
          ? "medium"
          : fund.maxSubscribeAmount < 100000000
            ? "high"
            : "none"
    return fund.limitLevel !== expected
  })
  check("限额分级（≤1000 低 / ≤1 万 中 / <1 亿 高 / ≥1 亿 无限额）一致", badLevel.length === 0, `${badLevel.length} 条异常`)

  const inconsistent = payload.funds.filter(
    (fund) =>
      fund.maxSubscribeAmount != null &&
      fund.minSubscribeAmount != null &&
      fund.maxSubscribeAmount > 0 &&
      fund.maxSubscribeAmount < fund.minSubscribeAmount &&
      fund.subscribeStatus === "开放申购",
  )
  check("限额低于起购金额时归一化为暂停申购", inconsistent.length === 0, `${inconsistent.length} 条异常`)

  console.log("\n【筛选口径（与独立实现交叉验证）】")
  const scenarios = [
    { label: "默认视图：美国 + 纳指100 + 开放申购", filter: { regions: ["us"], themes: ["nasdaq100"], status: "open" } },
    { label: "香港 + 全部主题 + 全部状态", filter: { regions: ["hongkong"], status: "all" } },
    { label: "关键词「纳指」", filter: { query: "纳指" } },
    { label: "开放申购 + 低限额", filter: { status: "open", limit: "low" } },
    { label: "美国 + 标普500 + 暂停申购", filter: { regions: ["us"], themes: ["sp500"], status: "paused" } },
  ]

  for (const scenario of scenarios) {
    api.state.query = scenario.filter.query ?? ""
    api.state.regions = scenario.filter.regions ?? []
    api.state.themes = scenario.filter.themes ?? []
    api.state.status = scenario.filter.status ?? "all"
    api.state.limit = scenario.filter.limit ?? "all"

    const actual = api.filterFunds(payload.funds).length
    const expected = expectedFilterCount(payload.funds, scenario.filter)
    check(`${scenario.label} → ${actual} 条`, actual === expected, `前端 ${actual} / 独立实现 ${expected}`)
  }

  console.log("\n【地区与主题联动】")
  const usThemes = api.getAvailableThemes(payload.funds, ["us"])
  const hkThemes = api.getAvailableThemes(payload.funds, ["hongkong"])
  check("美国地区可选主题包含纳指100", usThemes.includes("nasdaq100"))
  check("香港地区可选主题不含纳指100", !hkThemes.includes("nasdaq100"), hkThemes.join(", "))
  check("香港已选纳指100 时自动回落为「全部主题」", api.reconcileThemes(["nasdaq100"], hkThemes).length === 0)
  check("部分主题仍可用时只保留可用项", JSON.stringify(api.reconcileThemes(["nasdaq100", "hangseng"], hkThemes)) === JSON.stringify(["hangseng"]))

  console.log("\n【排序】")
  const descValues = api
    .sortFunds(payload.funds)
    .slice(0, 200)
    .map((fund) => (fund.subscribeStatus === "暂停申购" ? -1 : (fund.maxSubscribeAmount ?? -1)))
  check(
    "日累计限额默认降序（暂停申购视为 -1 排在后段）",
    descValues.every((value, index) => index === 0 || descValues[index - 1] >= value),
  )

  api.state.sorting = { id: "maxSubscribeAmount", desc: false }
  const ascValues = api
    .sortFunds(payload.funds)
    .slice(0, 200)
    .map((fund) => (fund.subscribeStatus === "暂停申购" ? -1 : (fund.maxSubscribeAmount ?? -1)))
  check(
    "升序模式排列正确",
    ascValues.every((value, index) => index === 0 || ascValues[index - 1] <= value),
  )

  api.state.sorting = { id: "code", desc: false }
  const codes = api.sortFunds(payload.funds).slice(0, 50).map((fund) => fund.code)
  check("按代码升序可用", codes.every((value, index) => index === 0 || codes[index - 1] <= value))

  console.log("\n【分页与展示】")
  check("每页 50 条", api.PAGE_SIZE === 50)
  const pageCount = Math.ceil(payload.funds.length / api.PAGE_SIZE)
  check(`总页数 ${pageCount} 页（${payload.filteredTotal} 条）`, pageCount === Math.ceil(payload.filteredTotal / 50))
  check("地区 / 主题选项各 12 / 13 项", api.REGION_OPTIONS.length === 12 && api.THEME_OPTIONS.length === 13)
  check("多选摘要显示「美国 + 1」", api.getMultiSummary(["us", "hongkong"], api.REGION_OPTIONS, "全部地区") === "美国 + 1")
  check("多选切换可增可减", JSON.stringify(api.toggleIn(["us"], "hongkong")) === JSON.stringify(["us", "hongkong"]))
  check("HTML 转义生效", api.escapeHtml(`<a href="x">&'`) === "&lt;a href=&quot;x&quot;&gt;&amp;&#39;")
  check("更新时间格式为 MM-DD HH:mm", /^\d{2}-\d{2} \d{2}:\d{2}$/.test(api.formatDateTime(payload.fetchedAt)))

  console.log("\n【数据分布】")
  const byRegion = {}
  const byTheme = {}
  for (const fund of payload.funds) {
    byRegion[fund.regionCategory] = (byRegion[fund.regionCategory] ?? 0) + 1
    byTheme[fund.themeCategory] = (byTheme[fund.themeCategory] ?? 0) + 1
  }
  console.log("  地区：", Object.entries(byRegion).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · "))
  console.log("  主题：", Object.entries(byTheme).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · "))

  console.log(`\n结果：${checks - failures}/${checks} 项通过${failures ? `，${failures} 项失败` : ""}`)
  process.exit(failures ? 1 : 0)
}

main().catch((error) => {
  console.error(`自测执行失败：${error.message}`)
  process.exit(1)
})
