"use strict"

/**
 * 生成静态数据快照 public/data/funds.json。
 *
 * 用途：
 * - GitHub Pages 等静态托管没有服务端，前端回退读取该快照（结构同 /api/funds）。
 * - CI 构建时若上游抓取失败而仓库已有快照，则保留旧快照继续部署，避免整站构建失败。
 *
 * 默认每次都写入最新抓取结果（「最后更新」即本次构建时间）；
 * 设 KEEP_IF_UNCHANGED=1 时，若基金数据与已有快照完全一致则不改写文件，
 * 便于定时任务按需提交、不产生无意义 diff。
 * 运行：node scripts/build-static.js
 */

const fs = require("node:fs")
const path = require("node:path")

const { fetchEastmoneyFunds, buildFundsResponse } = require("../lib/eastmoney")

const OUTPUT = path.join(__dirname, "..", "public", "data", "funds.json")

function readSnapshot() {
  try {
    const parsed = JSON.parse(fs.readFileSync(OUTPUT, "utf8"))
    return parsed && Array.isArray(parsed.funds) ? parsed : null
  } catch (error) {
    return null
  }
}

function sameFunds(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

async function main() {
  const snapshot = readSnapshot()

  let payload
  try {
    const startedAt = Date.now()
    const { raw, funds, overseasFunds } = await fetchEastmoneyFunds()
    payload = buildFundsResponse({ raw, funds, overseasFunds })
    console.log(`已抓取上游数据：${payload.total} 只基金 → QDII/海外 ${payload.filteredTotal} 只 · ${Date.now() - startedAt}ms`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (snapshot) {
      console.warn(`上游抓取失败（${message}），保留仓库中已有的数据快照继续构建。`)
      console.warn(`快照时间：${snapshot.fetchedAt} · ${snapshot.funds.length} 只`)
      return
    }
    throw new Error(`上游抓取失败且没有可用的数据快照：${message}`)
  }

  if (process.env.KEEP_IF_UNCHANGED === "1" && snapshot && sameFunds(snapshot.funds, payload.funds)) {
    console.log(`数据无变化，保留原快照（${snapshot.funds.length} 只 · 快照时间 ${snapshot.fetchedAt}）`)
    return
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true })
  fs.writeFileSync(OUTPUT, JSON.stringify(payload))

  const open = payload.funds.filter((fund) => fund.subscribeStatus === "开放申购").length
  const size = (fs.statSync(OUTPUT).size / 1024).toFixed(0)
  console.log(`已写入 ${path.relative(process.cwd(), OUTPUT)}（${size} KB）`)
  console.log(`  快照时间 ${payload.fetchedAt} · 开放申购 ${open} 只 · 暂停申购 ${payload.funds.length - open} 只`)
  console.log(`  交易日 ${(payload.showday ?? []).join(", ")}`)
}

main().catch((error) => {
  console.error(`静态快照构建失败：${error.message}`)
  process.exit(1)
})
