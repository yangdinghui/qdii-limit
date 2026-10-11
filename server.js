"use strict"

const http = require("node:http")
const fs = require("node:fs")
const path = require("node:path")

const { buildFundsResponse, fetchEastmoneyFunds } = require("./lib/eastmoney")

const PORT = Number(process.env.PORT || 3000)
const HOST = process.env.HOST || "127.0.0.1"
const PUBLIC_DIR = path.join(__dirname, "public")

// 与上游 /api/funds 一致的缓存语义：CDN/浏览器可缓存 6 小时，过期后 12 小时内先用旧数据并后台刷新。
const FRESH_MS = 6 * 60 * 60 * 1000
const STALE_WINDOW_MS = 12 * 60 * 60 * 1000
const CACHE_CONTROL = "public, s-maxage=21600, stale-while-revalidate=43200"

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
}

/** sort 参数 -> { payload, fetchedAt, body, refreshing } */
const cache = new Map()

function getCacheEntry(sort) {
  let entry = cache.get(sort)
  if (!entry) {
    entry = { payload: null, fetchedAt: 0, body: null, inFlight: null }
    cache.set(sort, entry)
  }
  return entry
}

async function refresh(sort) {
  const entry = getCacheEntry(sort)
  if (entry.inFlight) return entry.inFlight

  entry.inFlight = (async () => {
    const fetchedAt = new Date().toISOString()
    const { raw, funds, overseasFunds } = await fetchEastmoneyFunds({ sort })
    const payload = buildFundsResponse({ raw, funds, overseasFunds, fetchedAt })
    entry.payload = payload
    entry.fetchedAt = Date.now()
    entry.body = JSON.stringify(payload)
    return payload
  })()

  try {
    return await entry.inFlight
  } finally {
    entry.inFlight = null
  }
}

/**
 * 返回 { payload, cacheState }：
 * - 数据新鲜：直接命中。
 * - 数据过期但仍在 stale 窗口：先返回旧数据，同时后台刷新。
 * - 数据过期且超出窗口（或首次请求）：等待刷新；刷新失败时若有旧数据则兜底。
 * - force（点「刷新数据」）：跳过新鲜缓存直接回源，失败时同样兜底旧数据。
 */
async function getFundsPayload(sort, options = {}) {
  const entry = getCacheEntry(sort)
  const age = Date.now() - entry.fetchedAt

  if (!options.force && entry.payload && age <= FRESH_MS) {
    return { payload: entry.payload, cacheState: "HIT" }
  }

  if (!options.force && entry.payload && age <= FRESH_MS + STALE_WINDOW_MS) {
    refresh(sort).catch((error) => {
      console.error(`[refresh] 后台刷新失败：${error.message}`)
    })
    return { payload: entry.payload, cacheState: "STALE" }
  }

  try {
    const payload = await refresh(sort)
    return { payload, cacheState: options.force ? "REFRESHED" : "MISS" }
  } catch (error) {
    if (entry.payload) {
      return { payload: entry.payload, cacheState: "STALE" }
    }
    throw error
  }
}

function sendJson(response, status, body, extraHeaders = {}) {
  const text = JSON.stringify(body)
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
    ...extraHeaders,
  })
  response.end(text)
}

async function handleFunds(request, response, url) {
  const sort = url.searchParams.get("sort") || "fcode,asc"
  const force = url.searchParams.get("refresh") === "1"
  const startedAt = Date.now()

  try {
    const { payload, cacheState } = await getFundsPayload(sort, { force })
    sendJson(response, 200, payload, {
      "Cache-Control": CACHE_CONTROL,
      "X-Cache-State": cacheState,
    })
    console.log(`[api] /api/funds 200 (${cacheState}) ${payload.filteredTotal} 只 QDII · ${Date.now() - startedAt}ms`)
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误"
    sendJson(
      response,
      502,
      {
        ok: false,
        source: "eastmoney",
        fetchedAt: new Date().toISOString(),
        total: 0,
        filteredTotal: 0,
        record: 0,
        pages: 0,
        showday: [],
        funds: [],
        error: message,
      },
      { "Cache-Control": "no-store" },
    )
    console.error(`[api] /api/funds 502 ${message}`)
  }
}

function serveStatic(request, response, url) {
  const pathname = decodeURIComponent(url.pathname)
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "")
  const filePath = path.resolve(PUBLIC_DIR, relative)

  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    response.writeHead(403).end("Forbidden")
    return
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("404 Not Found")
      return
    }

    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath)] ?? "application/octet-stream",
      "Content-Length": content.length,
      "Cache-Control": "no-cache",
    })
    response.end(content)
  })
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host ?? `${HOST}:${PORT}`}`)

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end("Method Not Allowed")
    return
  }

  if (url.pathname === "/api/funds") {
    void handleFunds(request, response, url)
    return
  }

  serveStatic(request, response, url)
})

server.listen(PORT, HOST, () => {
  console.log("QDII Limit Monitor（仿写版）已启动")
  console.log(`  本机访问：http://${HOST}:${PORT}`)
  console.log(`  数据接口：http://${HOST}:${PORT}/api/funds （缓存 6h + stale 12h）`)
  console.log("  按 Ctrl+C 停止")
})
