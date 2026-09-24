# Portfolio Tracker

A self-hosted, privacy-first portfolio tracker for stocks, ETFs and other securities. Runs as two Docker containers — a Node.js/Express backend with a SQLite database, and a React SPA served by nginx. Designed for Synology NAS but works on any Docker host.

Live quotes via Yahoo Finance (no API key needed). FX rates via Frankfurter API. Optional Alpha Vantage fallback. Full multi-currency support including HKD, CNY, SGD, JPY and more.

---

## Screenshots

### Portfolio Overview — TreeMap
Positions sized by market value, coloured by today's gain/loss or absolute market move. Switch between Consolidated (all portfolios merged) and Aggregated (side-by-side) view.

![TreeMap](docs/screenshots/01_treemap.png)

### Performance Chart
Compare instruments over 1D · 1W · 1M · 6M · YTD · 1Y · 2Y · Max. Three y-axis modes: absolute value, ± dollar delta, ± percent. Intraday view uses minute-level data with exchange-timezone timestamps. BUY/SELL markers sit directly on the line.

![Performance](docs/screenshots/02_performance.png)

### Holdings Table
Full position list with current price, quantity, book value, unrealised P/L, weight, and daily change — sortable by any column.

![Holdings](docs/screenshots/03_holdings.png)

### Transaction Log
Every buy and sell with original price, quantity, currency and portfolio. Import directly from a broker PDF (Comdirect, Flatex, and others).

![Transactions](docs/screenshots/04_transactions.png)

### Analytics — Correlation, Monte Carlo, Rebalancing
Correlation heatmap, Monte Carlo simulation and portfolio rebalancing assistant available from the top navigation bar.

![Analytics](docs/screenshots/05_analytics.png)

> **Adding your own screenshots:** navigate to each view in the browser, press `Cmd/Ctrl+Shift+4` to capture, and save the file into `docs/screenshots/` with the matching filename.

---

## Features

### Portfolio management
- **Multi-portfolio** — any number of named portfolios, each PIN-protected (bcrypt server-side)
- **Multi-currency** — USD, EUR, GBP, CHF, JPY, HKD, CNY, SGD, CAD, AUD, SEK, NOK, DKK — correct FX conversion for all positions
- **Transactions** — BUY and SELL records with quantity, price, date and original currency
- **Savings plans** — recurring buy schedules with budget-per-period
- **Soft-delete** — portfolios can be deleted and restored

### Quotes & data
- **Yahoo Finance proxy** — backed by `yahoo-finance2` v3 with automatic crumb/cookie/session auth; server-side caching with configurable TTL
- **Intraday data** — minute-resolution OHLCV for the current trading day
- **Alpha Vantage fallback** — optional secondary source when Yahoo rate-limits
- **FX rates** — live rates from Frankfurter API (ECB data), cached 60 min; covers all major currencies including Asian pairs
- **Batch quote endpoint** — one round trip for all positions

### Visualisation
- **TreeMap** — position tiles sized by value, coloured by Mkt % change or gain/loss %. Toggle Consolidated vs. Aggregated view across portfolios
- **Bar Chart** — side-by-side value bars with period return overlay
- **Performance chart** — multi-instrument line chart with owned/ghost segments, BUY/SELL markers, and three y-axis modes (Abs / ±$ / ±%)
- **Holdings table** — sortable, with unrealised P/L and weight column
- **Correlation matrix** — Pearson correlation heatmap across selected instruments
- **Monte Carlo simulation** — forward projection with configurable parameters
- **Rebalancing assistant** — target allocation vs. current weight with buy/sell suggestions
- **Dividend calendar** — upcoming and historical dividend events

### Transactions — PDF import
Upload a broker settlement PDF directly in the Add Transaction dialog. The backend extracts text with `pdf-parse` and either:
- Parses it with a **regex fallback** (Comdirect Wertpapierabrechnung format)
- Sends the text to a **configurable AI model** (local or cloud, see below) for structured extraction from any broker format — tested with Comdirect and Revolut trade confirmations

Extracted fields (type, execution date, ISIN, quantity, price, currency) pre-fill the form automatically; the Yahoo symbol is resolved from the ISIN. If the AI call fails, the regex fallback is tried before giving up.

### ISIN → Symbol lookup
Enter an ISIN and click the search button. The backend queries Yahoo Finance and returns up to 10 ticker candidates with exchange, name and current price. If there are multiple matches a pick-list appears; if there is only one it is applied automatically.

### AI model settings
Configure a local or cloud AI model for PDF parsing in the Settings dialog:

| Group | Providers |
|---|---|
| **Local** (no key) | LM Studio (`localhost:1234`), Ollama (`localhost:11434`) — reached from the container via `host.docker.internal` |
| **Cloud** (API key) | Anthropic (Claude), OpenAI, Google Gemini, xAI (Grok), Meta (Muse), Mistral, DeepSeek, Alibaba Qwen, Kimi Platform (API), Kimi Code (coding plan), Z.AI (global), BigModel (China mainland), MiniMax, Xiaomi MiMo, StepFun, OpenRouter |
| **Disabled** | regex-only fallback (Comdirect PDFs) |

- Picking a provider pre-fills its endpoint; a **“Get API key ↗”** link opens that provider's key console.
- **Test Connection** validates the key and loads the provider's **model list** into a dropdown; with a model selected it also pings the model and shows latency.
- Endpoint, key, model and test result are **remembered per provider**, so switching providers never requires re-entering a key. The dropdown tags providers with **✓** (connection tested) or **🔑** (key stored).
- Local reasoning models (e.g. Qwen3) are called with thinking disabled so they return JSON quickly.
- Note: Kimi Code is a coding subscription that Kimi restricts to coding tools; for app integrations Kimi recommends the Kimi Platform API.

### Settings backup
Import / Export → **Settings** tab exports all saved settings — quote source, display currency, Alpha Vantage key and every AI provider profile incl. API keys — as a JSON file, and restores them from it. Useful after a reinstall so no key has to be entered again. **The file contains the keys in plain text** — store it safely and never commit it.

---

## Quick start

### Prerequisites
- Docker + Docker Compose
- A Synology NAS (DSM 7+) or any Linux/macOS host

### Run
```bash
git clone https://github.com/Doebele/fintools.git
cd fintools
make build    # builds both containers
make start    # docker-compose up -d
```

Open **`http://localhost:3002`** (or `http://YOUR-NAS-IP:3002`).

Backend health check: `http://localhost:3003/api/health`

### Ports
| Variable | Default | Description |
|---|---|---|
| `FRONTEND_PORT` | 3002 | nginx (React SPA) |
| `BACKEND_PORT` | 3003 | Express API |

Override in `docker-compose.yml` or a `.env` file.

---

## Configuration

All options are environment variables (set in `docker-compose.yml`):

| Variable | Default | Description |
|---|---|---|
| `QUOTE_TTL_MIN` | 5 | Daily quote cache TTL in minutes |
| `FX_TTL_MIN` | 60 | FX rate cache TTL in minutes |
| `RATE_LIMIT_MAX_REQUESTS` | 200 | Express rate limit per IP per 15 min |
| `LOG_LEVEL` | info | `error` / `warn` / `info` / `debug` |
| `AV_API_KEY` | _(empty)_ | Alpha Vantage key for quote fallback |

### Reverse proxy (HTTPS on Synology)
1. Control Panel → Login Portal → Advanced → Reverse Proxy → Create
2. Source: `https://portfolio.your-nas.synology.me` (port 443)
3. Destination: `http://localhost:3002`

---

## Makefile commands

```bash
make build      # docker-compose build --no-cache && up -d
make start      # docker-compose up -d
make stop       # docker-compose down
make restart    # restart containers in place
make logs       # tail logs from both containers
make backup     # SQLite dump → backups/*.db.gz
make restore    # restore newest backup
make stats      # curl /api/stats  (cache hit rate, uptime)
```

### Deploying to Strato

The production instance runs as a git checkout on a Strato VPS. `./deploy.sh` (or `make deploy`) rolls out `origin/main`:

```bash
cp .env.deploy.example .env.deploy   # once: SSH host/user, REMOTE_DIR, PUBLIC_URL (git-ignored)
./deploy.sh --dry-run                # show incoming commits, change nothing
./deploy.sh                          # deploy
```

It refuses to run with uncommitted or unpushed work on local `main`, then in a single SSH session: aborts if the server checkout has hand-edited tracked files (never stashes automatically), takes a consistent SQLite backup to `backups/pre-deploy_*.db.gz`, fast-forwards to `origin/main`, runs `docker compose up -d --build`, waits until both containers are healthy (prints a rollback command if not), and finally checks `PUBLIC_URL/api/health`.

If the server has local edits, resolve them once by hand: `git diff` to inspect, then `git checkout -- <file>` if the change is already in the repo, or `git stash` / `git pull` / `git stash pop` to keep it.

**Faster backend iteration** (no full rebuild):
```bash
docker cp backend/server.js portfolio-backend-v3:/app/server.js
docker restart portfolio-backend-v3
```

---

## API reference

### Users & auth
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/users` | List users |
| POST | `/api/users` | Create user `{username, pin}` |
| POST | `/api/users/login` | Login `{username, pin}` → user + settings + session `token` |
| POST | `/api/users/logout` | Revoke the session token |
| GET / PUT | `/api/users/:id/settings` | Read / save settings (token required, own user only) |

User-scoped endpoints (settings, tools, saved ETFs, CSV import/export) require `Authorization: Bearer <token>` from login; tokens are valid for 30 days.

### Portfolios
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/portfolios` | List portfolios for user |
| POST | `/api/portfolios` | Create `{name}` |
| DELETE | `/api/portfolios/:id` | Soft-delete |

### Transactions
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/portfolios/:id/transactions` | List |
| POST | `/api/portfolios/:id/transactions` | Add `{type, symbol, quantity, price, date, currency}` |
| PUT | `/api/transactions/:id` | Update |
| DELETE | `/api/transactions/:id` | Delete |

### Quotes
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/quotes/yahoo/:symbol` | Raw chart JSON (cached) |
| POST | `/api/quotes/batch` | Batch quotes `{symbols:[]}` |
| GET | `/api/quotes/symbols-for-isin/:isin` | Ticker candidates for ISIN |

### FX
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/fx/all` | All rates vs USD |
| GET | `/api/fx/:from/:to` | Single pair |

### Tools
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/tools/parse-pdf` | Extract transaction from broker PDF (multipart `file`) |
| POST | `/api/tools/test-ai` | `{provider, endpoint, key, model?}` → available models, and a ping if `model` is set |

### System
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/stats` | DB stats + cache metrics |

---

## Architecture

```
browser  ──►  :3002  nginx (React SPA)
                │
                └──► proxy /api/ ──►  :3001  Express
                                         │
                                         ├── SQLite  /app/data/portfolio.db
                                         ├── yahoo-finance2 v3  ──► Yahoo Finance
                                         ├── Frankfurter API    ──► ECB FX rates
                                         └── Alpha Vantage      ──► (optional fallback)
```

- **Backend** — single-file `backend/server.js` (~2,400 lines), organised in clearly labelled sections
- **Frontend** — single-file `frontend/src/App.jsx` (~8,200 lines), React 18 with no router, no global state library
- **Database** — SQLite via `better-sqlite3`; schema applied at boot, migrations via conditional `ALTER TABLE`
- **Caching** — in-database quote cache + in-flight request coalescing (`dedupFetch`)

---

## Security

- PINs hashed with bcrypt (cost 10) — never stored in plain text
- Login issues a random session token (30-day TTL); settings (incl. stored API keys), AI tools, saved ETFs and CSV import/export require it. Portfolio/transaction routes are not yet token-protected — don't expose the app to the internet without a reverse proxy with its own authentication
- AI/Alpha Vantage API keys are stored in the local SQLite database (plain text) and never in the repository; `data/`, `backups/*` and `.env` are git-ignored
- Backend container runs as non-root user
- Helmet + rate limiting (200 req / 15 min / IP) on all routes
- PDF parsing runs server-side; uploaded files are never written to disk (memory storage)

---

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18 |
| API | Express 4 |
| Database | SQLite via better-sqlite3 |
| Quotes | yahoo-finance2 v3 |
| FX | Frankfurter API |
| PDF parsing | pdf-parse |
| Frontend | React 18, Vite 5, Recharts, D3, lucide-react |
| Containers | Docker Compose, nginx:alpine + node:18-alpine |

---

**Version:** 3.x · **Updated:** June 2026 · **Built with:** Claude + Claus
