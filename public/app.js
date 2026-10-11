"use strict"

/* QDII Limit Monitor（仿写版）前端：数据筛选、联动、排序分页与明暗主题 */

const PAGE_SIZE = 50
const THEME_STORAGE_KEY = "qdii-theme"

const REGION_OPTIONS = [
  ["us", "美国"],
  ["hongkong", "香港"],
  ["china-offshore", "中国离岸"],
  ["global", "全球"],
  ["asia-pacific", "亚太"],
  ["japan", "日本"],
  ["india", "印度"],
  ["vietnam", "越南"],
  ["germany", "德国"],
  ["europe", "欧洲/英国"],
  ["emerging", "新兴市场"],
  ["other-region", "其他地区"],
]

const THEME_OPTIONS = [
  ["nasdaq100", "纳指100"],
  ["sp500", "标普500"],
  ["hangseng-tech", "恒生科技"],
  ["hangseng", "恒生指数"],
  ["tech", "科技主题"],
  ["hongkong-tech", "港股科技"],
  ["hongkong-biotech", "港股医药"],
  ["china-internet", "中国互联网"],
  ["biotech", "生物科技"],
  ["bond", "债券"],
  ["commodity", "商品/能源"],
  ["reits", "REITs"],
  ["other-qdii", "其他 QDII"],
]

const STATUS_OPTIONS = [
  ["all", "全部状态"],
  ["open", "开放申购"],
  ["paused", "暂停申购"],
]

const LIMIT_OPTIONS = [
  ["all", "全部限额"],
  ["low", "低限额"],
  ["medium", "中限额"],
  ["high", "高限额"],
  ["none", "无限额"],
]

const THEME_MODE_OPTIONS = [
  { value: "light", label: "明亮", icon: "sun" },
  { value: "dark", label: "暗色", icon: "moon" },
  { value: "system", label: "跟随系统", icon: "laptop" },
]

const COLUMNS = [
  ["code", "代码"],
  ["name", "基金简称"],
  ["type", "基金类型"],
  ["subscribeStatus", "申购状态"],
  ["maxSubscribeAmount", "日累计限额"],
  ["date", "日期"],
]

const ICON_PATHS = {
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  arrowUpDown: '<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>',
  arrowUp: '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
  arrowDown: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  alertTriangle:
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  helpCircle:
    '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  circleAlert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  laptop: '<path d="M18 5a2 2 0 0 1 2 2v8H4V7a2 2 0 0 1 2-2h12Z"/><path d="M2 19h20"/>',
}

const REGION_LABELS = Object.fromEntries(REGION_OPTIONS)
const THEME_LABELS = Object.fromEntries(THEME_OPTIONS)

const state = {
  data: null,
  loading: true,
  refreshing: false,
  error: null,
  query: "",
  regions: ["us"],
  themes: ["nasdaq100"],
  status: "open",
  limit: "all",
  sorting: { id: "maxSubscribeAmount", desc: true },
  page: 0,
  openMenu: null,
  themeMode: readThemeMode(),
}

function $(selector) {
  return document.querySelector(selector)
}

function icon(name, className) {
  const paths = ICON_PATHS[name] ?? ""
  return `<svg class="icon${className ? ` ${className}` : ""}" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function formatDateTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  const pad = (input) => String(input).padStart(2, "0")
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function getFunds() {
  return state.data?.funds ?? []
}

/* ---------- 筛选与排序 ---------- */

function filterFunds(funds) {
  const query = state.query.trim().toLowerCase()

  return funds.filter((fund) => {
    if (query) {
      const haystack = `${fund.code} ${fund.name} ${fund.type}`.toLowerCase()
      if (!haystack.includes(query)) return false
    }

    if (state.status === "open" && fund.subscribeStatus !== "开放申购") return false
    if (state.status === "paused" && fund.subscribeStatus !== "暂停申购") return false

    if (state.regions.length > 0 && !state.regions.includes(fund.regionCategory)) return false
    if (state.themes.length > 0 && !state.themes.includes(fund.themeCategory)) return false
    if (state.limit !== "all" && fund.limitLevel !== state.limit) return false

    return true
  })
}

function getAvailableThemes(funds, regions) {
  const regionMatched = regions.length > 0 ? funds.filter((fund) => regions.includes(fund.regionCategory)) : funds
  return Array.from(new Set(regionMatched.map((fund) => fund.themeCategory)))
}

/** 地区变化后剔除不可用的主题；全部不可用时回到「全部主题」。 */
function reconcileThemes(themes, availableThemes) {
  if (themes.length === 0) return []
  const available = new Set(availableThemes)
  const next = themes.filter((theme) => available.has(theme))
  return next.length > 0 ? next : []
}

function compareValues(a, b) {
  if (a === b) return 0
  return a < b ? -1 : 1
}

function sortValue(fund, id) {
  if (id === "maxSubscribeAmount") {
    return fund.subscribeStatus === "暂停申购" ? -1 : fund.maxSubscribeAmount ?? -1
  }
  const value = fund[id]
  return value == null ? "" : String(value)
}

function sortFunds(funds) {
  const { id, desc } = state.sorting
  const sorted = [...funds].sort((a, b) => compareValues(sortValue(a, id), sortValue(b, id)))
  return desc ? sorted.reverse() : sorted
}

/* ---------- 数据加载 ---------- */

/**
 * 两种运行模式共用同一套前端：
 * - 本地 / 自建服务：优先请求 /api/funds（服务端实时拉取 + 缓存）。
 * - 静态托管（GitHub Pages 等）：没有 /api，回退读取构建产物 data/funds.json 快照。
 */
async function requestFunds(refresh) {
  const apiUrl = new URL(refresh ? "api/funds?refresh=1" : "api/funds", document.baseURI)
  let apiError = null

  try {
    const response = await fetch(apiUrl)
    if (response.ok) {
      const payload = await response.json()
      if (payload.ok) return { payload, source: "api" }
      apiError = new Error(`接口返回异常：${payload.error || "未知错误"}`)
    } else {
      apiError = new Error(`接口返回 ${response.status}`)
    }
  } catch (error) {
    apiError = error instanceof Error ? error : new Error(String(error))
  }

  const snapshotUrl = new URL("data/funds.json", document.baseURI)
  if (refresh) snapshotUrl.searchParams.set("t", String(Date.now()))

  try {
    const response = await fetch(snapshotUrl, { cache: "no-store" })
    if (!response.ok) throw new Error(`快照返回 ${response.status}`)
    const payload = await response.json()
    if (!payload.ok) throw new Error(payload.error || "数据快照不可用")
    return { payload, source: "snapshot" }
  } catch (snapshotError) {
    const apiMessage = apiError instanceof Error ? apiError.message : String(apiError)
    const snapshotMessage = snapshotError instanceof Error ? snapshotError.message : String(snapshotError)
    throw new Error(`数据加载失败：接口 ${apiMessage}；静态快照 ${snapshotMessage}`)
  }
}

async function fetchFunds(refresh) {
  if (refresh) state.refreshing = true
  else state.loading = true
  state.error = null
  render()

  try {
    const { payload, source } = await requestFunds(refresh)
    state.data = payload
    if (refresh) toast(source === "api" ? "数据已重新加载" : "已重新加载站点数据快照", "success")
  } catch (error) {
    const message = error instanceof Error ? error.message : "数据加载失败"
    state.error = message
    toast(message, "error")
  } finally {
    state.loading = false
    state.refreshing = false
    render()
  }
}

/* ---------- 提示 ---------- */

function toast(message, type) {
  const root = $("#toast-root")
  const element = document.createElement("div")
  element.className = `toast toast-${type}`
  element.innerHTML = `${icon(type === "error" ? "circleAlert" : "checkCircle")}<span>${escapeHtml(message)}</span>`
  root.appendChild(element)
  window.setTimeout(() => element.remove(), 3200)
}

/* ---------- 主题 ---------- */

function readThemeMode() {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("theme")
    if (["light", "dark", "system"].includes(fromUrl)) return fromUrl
    return localStorage.getItem(THEME_STORAGE_KEY) || "system"
  } catch (error) {
    return "system"
  }
}

function applyThemeMode(mode) {
  state.themeMode = mode
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch (error) {
    /* 忽略写入失败 */
  }
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
  document.documentElement.classList.toggle("dark", mode === "dark" || (mode === "system" && prefersDark))
}

function getThemeModeOption() {
  return THEME_MODE_OPTIONS.find((option) => option.value === state.themeMode) ?? THEME_MODE_OPTIONS[2]
}

/* ---------- 下拉控件 ---------- */

function buildControl({ key, iconName, summary, items, end, triggerClass, closeOnPick, ariaLabel }) {
  const wrapper = document.createElement("div")
  wrapper.className = "dropdown"

  const trigger = document.createElement("button")
  trigger.type = "button"
  trigger.className = triggerClass ?? "btn filter-trigger"
  trigger.setAttribute("aria-haspopup", "listbox")
  trigger.setAttribute("aria-expanded", String(state.openMenu === key))
  if (ariaLabel) trigger.setAttribute("aria-label", ariaLabel)
  trigger.innerHTML = `<span class="trigger-label">${iconName ? icon(iconName) : ""}<span>${escapeHtml(summary)}</span></span>${icon("chevronDown", "chevron")}`
  trigger.addEventListener("click", (event) => {
    event.stopPropagation()
    state.openMenu = state.openMenu === key ? null : key
    render()
  })
  wrapper.appendChild(trigger)

  if (state.openMenu === key) {
    const menu = document.createElement("div")
    menu.className = end ? "menu menu-end" : "menu"
    menu.setAttribute("role", "listbox")
    menu.addEventListener("click", (event) => event.stopPropagation())

    const scroll = document.createElement("div")
    scroll.className = "menu-scroll"

    items.forEach((item) => {
      if (item.separatorBefore) scroll.appendChild(Object.assign(document.createElement("div"), { className: "menu-sep" }))
      const button = document.createElement("button")
      button.type = "button"
      button.className = "menu-item"
      button.setAttribute("role", "option")
      button.setAttribute("aria-selected", String(Boolean(item.selected)))
      button.innerHTML = `<span class="menu-check">${item.selected ? icon("check") : ""}</span>${escapeHtml(item.label)}`
      button.addEventListener("click", () => {
        if (closeOnPick && state.openMenu === key) state.openMenu = null
        item.onPick()
      })
      scroll.appendChild(button)
    })

    menu.appendChild(scroll)
    wrapper.appendChild(menu)
  }

  return wrapper
}

function toggleIn(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

function getMultiSummary(list, options, allLabel) {
  if (list.length === 0) return allLabel
  const label = options.find(([value]) => value === list[0])?.[1] ?? "已选"
  return list.length === 1 ? label : `${label} + ${list.length - 1}`
}

/** 主题选项只列出当前地区真实存在的主题。 */
function getVisibleThemeOptions(funds) {
  const available = new Set(getAvailableThemes(funds, state.regions))
  return THEME_OPTIONS.filter(([value]) => available.has(value))
}

function updateToolbar(patch) {
  Object.assign(state, patch)
  if (patch.regions || patch.themes) {
    state.themes = reconcileThemes(state.themes, getAvailableThemes(getFunds(), state.regions))
  }
  state.page = 0
  render()
}

/* ---------- 渲染 ---------- */

function render() {
  renderUpdated()
  renderError()
  renderThemeToggle()

  const loading = state.loading
  $("#skeleton").hidden = !loading
  $("#dashboard").hidden = loading

  if (!loading) {
    renderFilters()
    renderRefreshButton()
    renderTable()
  }
}

function renderUpdated() {
  $("#updated-at").textContent = `最后更新：${state.data ? formatDateTime(state.data.fetchedAt) : "-"}`
}

function renderError() {
  const root = $("#error-root")
  if (!state.error) {
    root.innerHTML = ""
    return
  }

  root.innerHTML = `
    <div class="alert-destructive">
      <div class="alert-title">${icon("circleAlert")}<span>数据加载失败</span></div>
      <div class="alert-body">
        <span>${escapeHtml(state.error)}</span>
        <button type="button" class="btn btn-sm" id="retry-button">${icon("refresh")}<span>重试</span></button>
      </div>
    </div>`
  $("#retry-button").addEventListener("click", () => fetchFunds(true))
}

function renderThemeToggle() {
  const current = getThemeModeOption()
  $("#theme-toggle-root").replaceChildren(
    buildControl({
      key: "theme-mode",
      iconName: current.icon,
      summary: current.label,
      end: true,
      triggerClass: "btn btn-compact",
      closeOnPick: true,
      ariaLabel: `切换主题（当前：${current.label}）`,
      items: THEME_MODE_OPTIONS.map((option) => ({
        label: option.label,
        selected: state.themeMode === option.value,
        onPick: () => {
          applyThemeMode(option.value)
          render()
        },
      })),
    }),
  )
}

function renderRefreshButton() {
  const slot = $("#refresh-icon")
  slot.innerHTML = state.refreshing ? icon("refresh", "icon-spin") : icon("filter")
  $("#refresh-button").disabled = state.refreshing
}

function renderFilters() {
  const funds = getFunds()

  const regionItems = [
    { label: "全部地区", selected: state.regions.length === 0, onPick: () => updateToolbar({ regions: [] }) },
    ...REGION_OPTIONS.map(([value, label], index) => ({
      label,
      separatorBefore: index === 0,
      selected: state.regions.includes(value),
      onPick: () => updateToolbar({ regions: toggleIn(state.regions, value) }),
    })),
  ]

  const themeItems = [
    { label: "全部主题", selected: state.themes.length === 0, onPick: () => updateToolbar({ themes: [] }) },
    ...getVisibleThemeOptions(funds).map(([value, label], index) => ({
      label,
      separatorBefore: index === 0,
      selected: state.themes.includes(value),
      onPick: () => updateToolbar({ themes: toggleIn(state.themes, value) }),
    })),
  ]

  $("#region-filter").replaceChildren(
    buildControl({
      key: "region",
      iconName: "globe",
      summary: getMultiSummary(state.regions, REGION_OPTIONS, "全部地区"),
      ariaLabel: "按国家/地区筛选",
      items: regionItems,
    }),
  )

  $("#theme-filter").replaceChildren(
    buildControl({
      key: "theme",
      iconName: "layers",
      summary: getMultiSummary(state.themes, THEME_OPTIONS, "全部主题"),
      ariaLabel: "按主题筛选",
      items: themeItems,
    }),
  )

  $("#status-filter").replaceChildren(
    buildControl({
      key: "status",
      summary: STATUS_OPTIONS.find(([value]) => value === state.status)?.[1] ?? "全部状态",
      ariaLabel: "按申购状态筛选",
      closeOnPick: true,
      items: STATUS_OPTIONS.map(([value, label]) => ({
        label,
        selected: state.status === value,
        onPick: () => updateToolbar({ status: value }),
      })),
    }),
  )

  $("#limit-filter").replaceChildren(
    buildControl({
      key: "limit",
      summary: LIMIT_OPTIONS.find(([value]) => value === state.limit)?.[1] ?? "全部限额",
      ariaLabel: "按限额等级筛选",
      closeOnPick: true,
      items: LIMIT_OPTIONS.map(([value, label]) => ({
        label,
        selected: state.limit === value,
        onPick: () => updateToolbar({ limit: value }),
      })),
    }),
  )
}

function getFundDetailUrl(code) {
  return `https://fund.eastmoney.com/${encodeURIComponent(code)}.html`
}

function renderStatusBadge(fund) {
  if (fund.subscribeStatus.includes("暂停")) {
    return `<span class="badge badge-secondary">${icon("ban")}${escapeHtml(fund.subscribeStatus)}</span>`
  }
  return `<span class="badge badge-success">${icon("checkCircle")}${escapeHtml(fund.subscribeStatus || "未知")}</span>`
}

function renderLimitBadge(fund) {
  const variants = {
    low: ["badge-destructive", "alertTriangle"],
    medium: ["badge-warning", "gauge"],
    high: ["badge-info", "gauge"],
    none: ["badge-success", "checkCircle"],
  }
  const [className, iconName] = variants[fund.limitLevel] ?? ["badge-secondary", "helpCircle"]
  return `<span class="badge ${className}">${icon(iconName)}${escapeHtml(fund.formattedLimit)}</span>`
}

function renderTableCell(fund, columnId) {
  switch (columnId) {
    case "code":
      return `<a class="code-chip link" href="${getFundDetailUrl(fund.code)}" target="_blank" rel="noopener noreferrer">${escapeHtml(fund.code)}</a>`
    case "name":
      return `<div class="cell-name"><div class="name-line">
        <a class="link link-name" href="${getFundDetailUrl(fund.code)}" target="_blank" rel="noopener noreferrer">${escapeHtml(fund.name)}</a>
        <span class="badge badge-secondary">${escapeHtml(REGION_LABELS[fund.regionCategory] ?? "其他地区")}</span>
        <span class="badge badge-outline">${escapeHtml(THEME_LABELS[fund.themeCategory] ?? "其他QDII")}</span>
      </div></div>`
    case "type":
      return `<span class="type-text">${escapeHtml(fund.type)}</span>`
    case "subscribeStatus":
      return renderStatusBadge(fund)
    case "maxSubscribeAmount":
      return renderLimitBadge(fund)
    case "date":
      return `<span>${escapeHtml(fund.date)}</span>`
    default:
      return ""
  }
}

function renderTable() {
  const filtered = sortFunds(filterFunds(getFunds()))
  const pageCount = filtered.length > 0 ? Math.ceil(filtered.length / PAGE_SIZE) : 1
  state.page = Math.min(state.page, pageCount - 1)

  const head = $("#table-head-row")
  head.innerHTML = COLUMNS.map(([id, label]) => {
    const active = state.sorting.id === id
    const sortIcon = active ? (state.sorting.desc ? "arrowDown" : "arrowUp") : "arrowUpDown"
    const ariaSort = active ? ` aria-sort="${state.sorting.desc ? "descending" : "ascending"}"` : ""
    return `<th${ariaSort}><button type="button" class="th-button${active ? " is-sorted" : ""}" data-sort="${id}">${escapeHtml(label)}${icon(sortIcon)}</button></th>`
  }).join("")
  head.querySelectorAll("[data-sort]").forEach((button) => {
    button.addEventListener("click", () => toggleSort(button.dataset.sort))
  })

  const pageRows = filtered.slice(state.page * PAGE_SIZE, state.page * PAGE_SIZE + PAGE_SIZE)
  const body = $("#table-body")
  body.innerHTML = pageRows.length
    ? pageRows
        .map(
          (fund) =>
            `<tr>${COLUMNS.map(([id]) => `<td>${renderTableCell(fund, id)}</td>`).join("")}</tr>`,
        )
        .join("")
    : `<tr><td colspan="${COLUMNS.length}"><div class="empty-state">
        <div class="empty-title">没有匹配的基金</div>
        <div class="empty-hint">尝试清空主题、切换地区或查看全部状态。</div>
      </div></td></tr>`

  $("#filtered-count").textContent = `当前筛选 ${filtered.length.toLocaleString("zh-CN")} 条`
  $("#page-info").textContent = `第 ${state.page + 1} / ${pageCount} 页 · 共 ${filtered.length.toLocaleString("zh-CN")} 条`
  $("#prev-page").disabled = state.page <= 0
  $("#next-page").disabled = state.page >= pageCount - 1
}

function toggleSort(id) {
  state.sorting = state.sorting.id === id ? { id, desc: !state.sorting.desc } : { id, desc: false }
  state.page = 0
  render()
}

/* ---------- 启动 ---------- */

// 纯逻辑出口：供 Node 侧自测（scripts/self-test.js）复用同一套筛选/排序规则。
if (typeof window !== "undefined") {
  window.QDII_DASHBOARD = {
    state,
    filterFunds,
    getAvailableThemes,
    reconcileThemes,
    sortFunds,
    getMultiSummary,
    toggleIn,
    formatDateTime,
    escapeHtml,
    PAGE_SIZE,
    REGION_OPTIONS,
    THEME_OPTIONS,
  }
}

function init() {
  applyThemeMode(state.themeMode)

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (state.themeMode === "system") applyThemeMode("system")
  })

  $("#search-input").addEventListener("input", (event) => {
    state.query = event.target.value
    state.page = 0
    render()
  })

  $("#refresh-button").addEventListener("click", () => fetchFunds(true))
  $("#prev-page").addEventListener("click", () => {
    state.page = Math.max(0, state.page - 1)
    render()
  })
  $("#next-page").addEventListener("click", () => {
    state.page += 1
    render()
  })

  document.addEventListener("click", () => {
    if (state.openMenu) {
      state.openMenu = null
      render()
    }
  })
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.openMenu) {
      state.openMenu = null
      render()
    }
  })

  void fetchFunds(false)
}

// 仅在浏览器环境启动；Node 侧引用（自测）时跳过。
if (typeof document !== "undefined") init()
