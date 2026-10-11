"use strict"

const vm = require("node:vm")

const rules = require("./fund-rules")

const EASTMONEY_URL = "https://fund.eastmoney.com/Data/Fund_JJJZ_Data.aspx"

// 东方财富 t=8 全量申购状态数据超过 4MB，一次拉齐后在服务端本地筛选。
const PAGE_SIZE = 50000

function buildUrl(sort = "fcode,asc") {
  const url = new URL(EASTMONEY_URL)
  url.searchParams.set("t", "8")
  url.searchParams.set("page", `1,${PAGE_SIZE}`)
  url.searchParams.set("js", "reData")
  url.searchParams.set("sort", sort)
  return url.toString()
}

/**
 * 上游返回的是 JS 对象字面量（`var reData={datas:[...]}`，键名无引号），JSON.parse 无法直接解析。
 * 放到 vm 的空白上下文里求值：不暴露 require / process，并带超时与结果校验。
 */
function parseEastmoneyText(text) {
  const objectText = String(text)
    .replace(/^\uFEFF/, "")
    .replace(/^\s*(?:var\s+)?reData\s*=\s*/, "")
    .replace(/\s*;\s*$/, "")
    .trim()

  if (!objectText.startsWith("{")) {
    throw new Error("东方财富返回结构异常：响应不是对象字面量")
  }

  let data
  try {
    data = vm.runInNewContext(`(${objectText})`, Object.create(null), { timeout: 5000 })
  } catch (error) {
    throw new Error(`东方财富响应解析失败：${error instanceof Error ? error.message : String(error)}`)
  }

  if (!data || !Array.isArray(data.datas)) {
    throw new Error("东方财富返回结构异常：缺少 datas 数组")
  }

  return data
}

function normalizeFund(row) {
  const code = row[0] ?? ""
  const name = row[1] ?? ""
  const type = row[2] ?? ""
  const rawSubscribeStatus = row[5] ?? ""
  const minSubscribeAmount = rules.parseAmount(row[8])
  const maxSubscribeAmount = rules.parseAmount(row[9])
  const subscribeStatus = rules.normalizeSubscribeStatus(rawSubscribeStatus, maxSubscribeAmount, minSubscribeAmount)

  return {
    code,
    name,
    type,
    nav: row[3] ?? "",
    date: row[4] ?? "",
    subscribeStatus,
    redeemStatus: row[6] ?? "",
    nextOpenDate: row[7] ?? "",
    minSubscribeAmount,
    maxSubscribeAmount,
    rawFee: row[10] ?? "",
    buyStatusCode: row[11] ?? "",
    feeText: row[12] ?? "",
    isQdiiLike: rules.isQdiiLike(name, type),
    isOverseasLike: rules.isOverseasLike(name, type),
    isNasdaqLike: rules.isNasdaqLike(name),
    isOffExchangeLike: rules.isOffExchangeLike(name),
    classificationScope: rules.getClassificationScope(name, type),
    regionCategory: rules.getRegionCategory(name, type),
    themeCategory: rules.getThemeCategory(name, type),
    tradingForm: rules.getTradingForm(name),
    classificationSources: rules.getClassificationSources(name, type),
    shareClass: rules.detectShareClass(name),
    limitLevel: rules.getLimitLevel(maxSubscribeAmount, subscribeStatus),
    formattedLimit: rules.formatLimitDisplay(maxSubscribeAmount, subscribeStatus),
  }
}

function normalizeFunds(rows) {
  return rows.map(normalizeFund).filter((fund) => fund.code && fund.name)
}

async function fetchEastmoneyFunds(options = {}) {
  const response = await fetch(buildUrl(options.sort ?? "fcode,asc"), {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      Referer: "https://fund.eastmoney.com/",
    },
    signal: AbortSignal.timeout(30000),
  })

  if (!response.ok) {
    throw new Error(`东方财富接口请求失败：${response.status}`)
  }

  const raw = parseEastmoneyText(await response.text())
  const funds = normalizeFunds(raw.datas)
  const overseasFunds = funds.filter((fund) => fund.isOverseasLike)

  return { raw, funds, overseasFunds }
}

function buildFundsResponse(params) {
  return {
    ok: true,
    source: "eastmoney",
    fetchedAt: params.fetchedAt ?? new Date().toISOString(),
    total: params.funds.length,
    filteredTotal: params.overseasFunds.length,
    record: Number(params.raw.record) || params.funds.length,
    pages: Number(params.raw.pages) || 0,
    showday: params.raw.showday ?? [],
    funds: params.overseasFunds,
  }
}

module.exports = {
  EASTMONEY_URL,
  buildUrl,
  parseEastmoneyText,
  normalizeFund,
  normalizeFunds,
  fetchEastmoneyFunds,
  buildFundsResponse,
}
