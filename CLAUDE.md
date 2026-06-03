# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Self-hosted portfolio tracker. Node 18 + Express + better-sqlite3 backend talking to a Vite-built React 18 SPA, both packaged as Docker containers and orchestrated via `docker-compose`. Designed to run on a Synology NAS but works anywhere Docker does.

There are **no tests, no linter, no TypeScript, no CI pipeline**. The repo is two large files (`backend/server.js` ~2,600 lines, `frontend/src/App.jsx` ~9,200 lines) plus Docker plumbing.

The active feature branch is **`feat/portfolio-pal-ui`** — this adds i18n (DE/EN), light/dark theming, and the ETF Screener view.

## Common commands

```bash
make start          # docker-compose up -d
make stop           # docker-compose down
make restart        # restart containers in place
make build          # docker-compose build --no-cache && up -d   (use after server.js / App.jsx changes)
make logs           # tail logs from both containers
make backup         # SQLite dump → backups/*.db.gz (also wired to cron)
make restore        # restore newest backup, recreates containers
make stats          # curl /api/stats for cache + uptime numbers
```

NPM scripts inside each subproject (rarely run directly — Docker drives everything):

```bash
# backend/
npm run start       # node server.js
npm run dev         # nodemon (only useful outside Docker)
npm run health      # curl + pretty-print /api/health
npm run stats       # curl + pretty-print /api/stats

# frontend/
npm run dev         # vite dev server (port 5173) — only used for local debugging
npm run build       # vite build → dist/   (the Dockerfile does this internally)
```

### Iterating on code

- **Backend code change** → `make build` (or, faster when npm registry flakes during the Docker build: `docker cp backend/server.js portfolio-backend-v3:/app/server.js && docker restart portfolio-backend-v3`).
- **Frontend code change** → `docker compose build portfolio-frontend-v3 && docker compose up -d`. Vite is invoked inside the Dockerfile's builder stage; no local install needed unless you want `npm run dev`.
- **After deploy**, do a hard reload in the browser — the bundle filename is hashed (`index-XXXXX.js`) but cached resources around it sometimes need cache-bypass.

## Architecture

### Two-container layout

```
browser  ─►  :3002  nginx (frontend)  ─►  proxy /api/  ─►  :3001 express (backend)
                                                              │
                                                              ├─► SQLite at /app/data/portfolio.db
                                                              ├─► yahoo-finance2 ─► Yahoo Finance
                                                              ├─► Frankfurter API (FX rates)
                                                              └─► Alpha Vantage (optional fallback, AV_API_KEY)
```

Ports are overridable: `FRONTEND_PORT` (default 3002) and `BACKEND_PORT` (default 3003 → container's 3001). Inside the docker network nginx talks to `portfolio-backend-v3:3001` directly.

### Backend (`backend/server.js`)

Single-file Express app organised by big ASCII-banner sections — search for `// ════` to navigate. Major sections in order:

1. **Config / Logger / DB Setup** — env-var driven; SQLite is opened with `journal_mode = WAL` and foreign keys on
2. **Schema v3 + Migrations** — `db.exec(\`CREATE TABLE IF NOT EXISTS …\`)` runs every boot; columns/tables that were added later are also patched in with conditional `ALTER TABLE` blocks below
3. **Middleware** — helmet, compression, cors, express-rate-limit (`RATE_LIMIT_MAX_REQUESTS`), JSON parser
4. **USERS / PORTFOLIOS** routes — bcrypt PIN auth, soft-deletes via `deleted_at`
5. **TRANSACTIONS / Savings Plans** — BUY/SELL records, `price_usd` is denormalised at insert time using the FX rate of the trade date
6. **SETTINGS** — per-user JSON KV
7. **QUOTES** — Yahoo proxy + Alpha Vantage fallback + batch endpoint + intraday endpoint
8. **FX ROUTES** — Frankfurter API proxy
9. **ANALYTICS ENDPOINTS** — `history-multi`, `dividends-multi`, `history-multi-intraday` for the performance/correlation views
10. **Health/Stats** — `/api/health`, `/api/stats`

#### Yahoo proxy specifics (read this before touching `fetchYahoo`)

Yahoo's `/v8/finance/chart` API now requires crumb+cookie+session auth. The naive "rotate User-Agent and pray" approach fails ~60–100% of the time. The code uses **`yahoo-finance2` v3** (note: v2 is deprecated and returns HTML auth walls).

Key conventions:

- Use the **constructor pattern**: `const yahooFinance = new YahooFinance()`. v3 throws if you call methods on the default export.
- `fetchYahoo(symbol, range, interval, events?)` is the entry point. It calls `yahooFinance.chart()` and then `ynt2RawChart()` to **convert back to Yahoo's raw `{ chart: { result: [...] } }` shape** because the rest of the server and frontend expect that shape. Don't change the shape — change `ynt2RawChart()` instead.
- `rangeToPeriod1()` translates Yahoo's "2y"/"1mo"/"ytd"/"max" range strings into the `Date` objects v3 needs.
- Pass `{ validateResult: false }` as the module-options arg to tolerate Yahoo schema drift.
- yahoo-finance2 v3 logs `Requires Node >= 22.0.0, found 18.20.8` — harmless warning, library works fine on Node 18. If you bump the Dockerfile to `node:22-alpine` later, the warning goes away.

Errors are normalised back to three user-visible messages: `"Yahoo Finance rate limit — try again in a minute"`, `"Symbol "X" not found on Yahoo Finance"`, `"Yahoo Finance request timed out"`. Anything else surfaces raw.

#### Caching layers

- `quotes_cache` — raw Yahoo JSON blobs, TTL via `QUOTE_TTL_MIN` (default 5 min for daily, 15 min for intraday). Cache key: `symbol` for default 2y range, `symbol_r{range}` for other ranges, `symbol_{interval}` for intraday.
- `parsed_quotes` — compact per-symbol row used by the batch endpoint
- `fx_cache` — FX rates, TTL `FX_TTL_MIN` (default 60 min)
- `etf_holdings_cache` — ETF holdings JSON, 24h TTL
- `etf_quote_summary_cache` — compact `{price, changePct, currency}` per symbol; smart TTL (60 min market hours, 24h off-hours). Written by both the summary batch endpoint and the raw quote endpoint.
- `etf_search_cache` — ETF search results keyed by normalised query, 60 min TTL
- `dedupFetch(key, fn)` — in-flight request coalescing so a burst of concurrent calls for the same symbol only triggers one upstream fetch

`POST /api/etf/quotes/summary` — batch endpoint replacing per-symbol quote fetching in the ETF Screener. Reads from `etf_quote_summary_cache` → `quotes_cache` → Yahoo (three-level hierarchy). `extractSummaryFromRaw(raw)` on the backend mirrors the frontend's `extractQuoteFromRaw`.

When debugging "stale data" issues, first check `/api/stats` for `cacheHits`/`cacheMisses`, then look at `updated_at` in the relevant `*_cache` table.

### Frontend (`frontend/src/App.jsx`)

Single-file React 18 app, ~9,200 lines. Navigation:

- Search for `// ════` banners — top-level components (`LoginScreen`, `Rail`, `EtfRail`, `EtfExplorer`, `TreeMapView`, `BarChartView`, `Tooltip`, `PerformanceView`, etc.)
- The router-equivalent is `activeTab` (`"holdings" | "chart" | "performance" | "transactions" | "correlation" | "montecarlo" | "rebalance" | "calendar" | "dividends"`) — search `activeTab === "X"` to find each tab's render
- When `etfMode === true` (set at App root), the entire view switches to `EtfExplorer` instead of the portfolio views
- Global state lives in the top-level `App` function; props are drilled (no Redux/Zustand/Context)

#### i18n

`react-i18next` with `i18next-browser-languagedetector`. Translation files at `frontend/src/i18n/{en,de}/common.json`. Initialised in `frontend/src/i18n/index.js`. Language preference stored in `localStorage` key `pp-lang` **and** server-side in the `settings` table JSON blob as `ui_language`.

Usage: `const { t } = useTranslation(); t("section.key")`. All user-visible strings must go through `t()`.

#### Theming

CSS custom properties on `:root` / `[data-theme="dark"]` / `[data-theme="light"]`, injected by `useGlobalStyles()`. Theme toggled by setting `document.body.setAttribute("data-theme", ...)` and stored in `localStorage` key `pp-theme`. The `THEME` object holds only `var(--*)` references — changing the `data-theme` attribute is the only required action to switch themes.

Light theme uses Application-Pal surface colours; chart/semantic colours (green/red/yellow/accent) are identical in both themes.

#### CSS design system — official UI patterns

Two classes defined in `useGlobalStyles()` must be used consistently across the entire app:

- **`rail-density-row` + `rail-density-btn[.active]`** — Segmented control for 2–4 equal-width toggle options (e.g. Export/Import, Portfolio/ETF switcher, Compact/Relaxed, DE/EN, Light/Dark). Do **not** use custom inline styles for new toggles.
- **`app-nav-tab[.active]`** — Navigation tab for horizontal tab bars (top nav bar, ETF inner nav). Transparent background, accent colour on active.

#### ETF Screener

`EtfExplorer` → `EtfRail` + `EtfHoldingsTable`. Lives entirely in `App.jsx`. `EtfRail` accepts the same `uiTheme`/`onToggleTheme`/`uiLanguage`/`onChangeLanguage`/`displayMode`/`onToggleDisplayMode` props as `Rail` so both sidebars stay in sync. `UserModal` is reused in `EtfRail` with `subtitle="ETF Screener"` and a `switchLabel` override. `SettingsModal` is rendered from the App root when `etfMode=true` (not inside `EtfExplorer`) so it can access all required state.

#### Two in-memory caches at module scope

- `_chartMem` — raw Yahoo chart JSON keyed by `SYM` for daily data, `SYM_1d` for intraday. Survives across remounts but not page reload. Used by the tooltip sparkline + holdings view.
- `_divMem` — dividend events per symbol

Both are wrapped behind `globalChartCache` and `globalDivCache` accessors, with `_chartPrefetch(sym)` / `_divPrefetch(symbols)` for batched warmup.

#### PerformanceView — the chart hot spot

This is where most of the chart-related work lives and where most of the bugs hide. Key contracts:

- The y-axis has three display modes (`yMode = "abs" | "rel" | "pct"`), controlled by a tristate toggle in the legend row. `displaySeries` is derived from `visibleSeries` and applies the chosen transformation.
- The 1D period is special-cased: it fetches `POST /api/quotes/history-multi-intraday` separately and renders minute-level data. The x-axis formatter checks for an ISO-datetime `T` to switch from date → `HH:MM`.
- Instrument series carry an `owned: true|false` flag per point. Owned segments render as solid lines; unowned segments (price history before the first buy or after a full sell) render as dashed ghost lines using `seriesPaths[i].ghostLine`. The path builder `_mkPath` is a top-level `useCallback` — **don't inline it inside the `displaySeries.map()` body** (see the esbuild TDZ note below).
- Per-instrument BUY/SELL markers are placed directly on the line at the correct y-coordinate, via the `instrTxMarkers` memo. They open `instrTxPopover` on hover.
- Series colour assignments propagate up via `onSeriesColorsChange` so the Vergleich-picker pills in the parent can render with the **exact same colour** as the line.

### esbuild TDZ trap (real footgun, learned the hard way)

Vite's production minifier (esbuild) preserves the original `const` ordering of the React component scope. If you write a `useEffect` or `useMemo` whose **dependency array references a `const` declared later in the same component**, the bundle will throw `ReferenceError: Cannot access 'X' before initialization` at runtime (in the minified bundle the variable looks like `Ke` / `qe`). The dev mode does not catch this — only the production build crashes.

Rule of thumb:

- Effects that depend on a memo/state must be declared **after** the thing they depend on.
- Helper functions used inside `displaySeries.map(s => …)` callbacks that capture `xS` / `yS` should be hoisted to top-level `useCallback`s, not defined inline in nested closures — nested closures over component-scope `const`s can also produce TDZ in the minified output.

If you ever see a `Cannot access 'X' before initialization` in the deployed bundle, the fix is structural (re-order declarations), not logical. Grep the unminified bundle around the reported offset to identify which symbol the minified name maps to — that's the fastest way to locate the offending file.

## Database

SQLite v3 schema in `data/portfolio.db` (gitignored). Schema is declared inline in `server.js` and re-applied on every boot via `CREATE TABLE IF NOT EXISTS`. New columns are added with conditional `ALTER TABLE` in the migrations block — follow that pattern when adding columns, do not write external migration files.

Key tables:

- `users`, `portfolios` (soft-deleted), `transactions` (with `price_usd` denormalised)
- `savings_plans` (recurring buys)
- `quotes_cache`, `parsed_quotes`, `fx_cache`, `av_usage` (rate-limit tracking for Alpha Vantage)
- `etf_holdings_cache`, `etf_quote_summary_cache`, `etf_search_cache` (ETF Screener caches — see Caching layers above)
- `user_kv` (per-user JSON KV), `user_etfs` (saved ETF screener picks), `settings` (display currency, API keys, **and `ui_language`**)

`make backup` produces gzipped SQL dumps in `backups/`. `make restore` recreates the DB from the newest dump.

## Environment variables

Set in `docker-compose.yml` or via a real `.env` (the file `env.txt` in the repo is a stub holding only `AV_API_KEY`):

| Var | Default | What it does |
|---|---|---|
| `BACKEND_PORT` | 3003 | Host port for backend |
| `FRONTEND_PORT` | 3002 | Host port for frontend nginx |
| `QUOTE_TTL_MIN` | 5 | Daily quote cache TTL |
| `FX_TTL_MIN` | 60 | FX rate cache TTL |
| `RATE_LIMIT_MAX_REQUESTS` | 200 | Express rate-limiter, per IP per 15 min |
| `LOG_LEVEL` | info | error / warn / info / debug |
| `AV_API_KEY` | (empty) | Optional Alpha Vantage key for fallback quotes |

## Commit conventions

History uses Conventional Commits (`feat:` / `fix:` / `chore:` / `feat(performance):` / `fix(backend):`). Commit bodies are paragraph-style with a wrapped explanation of the *why*, sometimes followed by `Co-Authored-By: Claude …`. Match this style for new commits.

Commit directly to `main` for tactical fixes; for non-trivial feature work the convention has been one feature branch + PR (see PR #1 for an example).

## Things that don't exist

So you don't go looking for them:

- No tests (`*.test.js`, `*.spec.js`), no Jest/Vitest/Playwright config
- No ESLint / Prettier config
- No TypeScript — both backend and frontend are plain JS
- No CI/CD (no `.github/workflows/`, no fly/render/vercel config)
- No `.env` file is committed — secrets live in `docker-compose.yml` shell expansion or are passed at `make` time
- No `.cursor/rules/`, no `.github/copilot-instructions.md`, no Cursor/Copilot configuration
