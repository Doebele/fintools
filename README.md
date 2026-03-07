# 📊 Portfolio Tracker — Synology NAS Edition v2.0

Self-hosted portfolio tracker with a Node.js/Express backend, SQLite database, Yahoo Finance proxy, and a React treemap frontend. Runs entirely on your Synology NAS via Docker.

## ✨ What's new in v2.0

| Area | Improvement |
|---|---|
| **Backend** | Yahoo Finance proxy with user-agent rotation & retry logic |
| **Backend** | Batch quote endpoint `/api/quotes/batch` — one call for all positions |
| **Backend** | Separate FX cache table (`fx_cache`) with configurable TTL |
| **Backend** | Soft-delete for portfolios (`deleted_at` column) |
| **Backend** | Cache hit/miss counters exposed on `/api/stats` |
| **Backend** | Graceful DB migration (adds `price_usd` column on first boot) |
| **Frontend** | **All localStorage removed** — 100% API-backed |
| **Frontend** | Login screen talks directly to the DB (portfolio list, PIN verify) |
| **Frontend** | `AddTxModal` saves directly to the backend (with error handling) |
| **Frontend** | Tooltip chart uses raw Yahoo chart data fetched via proxy |
| **Frontend** | Backend-unreachable screen with troubleshooting hints |
| **Docker** | `service_healthy` condition — frontend waits for backend health check |
| **Docker** | Port overridable via `FRONTEND_PORT` / `BACKEND_PORT` env vars |
| **Security** | Backend container runs as non-root user |

## 🌟 Features

✅ **Own database** (SQLite) — all portfolios & transactions persist across reboots  
✅ **Multi-portfolio** — each with PIN-protection, verified server-side with bcrypt  
✅ **Yahoo Finance proxy** — no CORS issues, server-side caching, user-agent rotation  
✅ **FX rates** via Frankfurter API (cached 60 min)  
✅ **Interactive Treemap** — colour by market % or gain/loss %  
✅ **Period performance** — 1D · 1W · 1M · YTD · 1Y · 2Y · Max  
✅ **Multi-currency** — USD · EUR · GBP · CHF  
✅ **Docker Compose** — one command install on Synology  
✅ **Auto-backups** — via included script + cron  

## 📦 Project structure

```
portfolio-nas/
├── .env.example            → copy to .env, edit ports / TTLs
├── docker-compose.yml      → orchestrates backend + frontend
├── backup.sh               → SQLite backup + compression
├── Makefile                → handy shortcuts
│
├── backend/
│   ├── Dockerfile          → node:18-alpine, non-root user
│   ├── package.json
│   └── server.js           → Express + better-sqlite3 + Yahoo proxy
│
├── frontend/
│   ├── Dockerfile          → nginx:alpine
│   ├── nginx.conf          → SPA + /api/ reverse-proxy
│   ├── index.html
│   └── app.jsx             → React app (API-backed, no localStorage)
│
└── data/                   → SQLite DB (created on first boot, gitignored)
```

## 🚀 Installation

### Prerequisites

1. Synology NAS with DSM 7.0+
2. **Docker** installed (Package Center → search "Docker")
3. SSH access enabled (Control Panel → Terminal & SNMP)

### Step 1 — Transfer files to NAS

**Option A — via SSH (recommended):**
```bash
# On your computer — zip the project
zip -r portfolio-nas.zip portfolio-nas/

# Copy to NAS
scp portfolio-nas.zip admin@YOUR-NAS-IP:/volume1/docker/

# On NAS via SSH
ssh admin@YOUR-NAS-IP
cd /volume1/docker
unzip portfolio-nas.zip
cd portfolio-nas
```

**Option B — via File Station:**
1. Open File Station → create folder `/docker/portfolio-nas`
2. Upload all files (preserve folder structure)

### Step 2 — Configure

```bash
cp .env.example .env
# Edit .env if you need different ports
```

### Step 3 — Start

```bash
sudo docker-compose up -d

# Check status
sudo docker-compose ps

# Follow logs
sudo docker-compose logs -f
```

### Step 4 — Open

```
http://YOUR-NAS-IP:3000
```

Backend health check: `http://YOUR-NAS-IP:3001/api/health`

## 🔧 Configuration

### Change ports

Edit `.env`:
```bash
FRONTEND_PORT=8080
BACKEND_PORT=8081
```
Then `sudo docker-compose up -d`.

### Quote cache TTL

```bash
QUOTE_TTL_MIN=10   # cache quotes for 10 minutes (default: 5)
FX_TTL_MIN=120     # cache FX rates for 2 hours  (default: 60)
```

### Reverse proxy (optional — for HTTPS)

1. Control Panel → Login Portal → Advanced → Reverse Proxy → Create
2. Source: `https://portfolio.your-nas.synology.me` (port 443)
3. Destination: `http://localhost:3000`
4. Enable HSTS + HTTP/2

## 💾 Backups

```bash
# Manual backup
chmod +x backup.sh
./backup.sh

# Automated via cron (daily at 2 AM)
sudo crontab -e
# Add: 0 2 * * * /volume1/docker/portfolio-nas/backup.sh

# Restore last backup
make restore
```

## 📡 API Reference

### Portfolios
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/portfolios` | List all portfolios |
| POST | `/api/portfolios` | Create portfolio `{name, pin}` |
| DELETE | `/api/portfolios/:id` | Soft-delete portfolio |
| POST | `/api/portfolios/:id/verify` | Verify PIN `{pin}` |

### Transactions
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/portfolios/:id/transactions` | List transactions |
| POST | `/api/portfolios/:id/transactions` | Add transaction |
| PUT | `/api/transactions/:id` | Update transaction |
| DELETE | `/api/transactions/:id` | Delete transaction |

### Quotes (Yahoo Finance proxy)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/quotes/yahoo/:symbol` | Raw chart data (cached) |
| POST | `/api/quotes/batch` | Batch parsed quotes `{symbols:[]}` |

### FX
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/fx/all` | All rates vs USD |
| GET | `/api/fx/:from/:to` | Single pair |

### System
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/stats` | DB stats + cache hit rate |
| POST | `/api/admin/clean-cache` | Remove stale cache entries |

## 🛠 Useful commands

```bash
make start       # docker-compose up -d
make stop        # docker-compose down
make restart     # docker-compose restart
make logs        # docker-compose logs -f
make build       # rebuild & restart
make backup      # create DB backup
make restore     # restore last backup
make stats       # show /api/stats
make clean       # ⚠ delete all containers + data
```

## 🔍 Troubleshooting

**Backend won't start:**
```bash
sudo docker-compose logs portfolio-backend
```

**Frontend shows "Backend unreachable":**
```bash
curl http://YOUR-NAS-IP:3001/api/health
sudo docker network inspect portfolio-network
```

**Yahoo Finance returns 429 (rate limited):**
The backend automatically rotates user-agents and caches results. If you still hit limits, increase `QUOTE_TTL_MIN` to 15 or 30.

**DB integrity check:**
```bash
sudo docker exec portfolio-backend sh -c 'sqlite3 /app/data/portfolio.db "PRAGMA integrity_check;"'
```

## 🔒 Security notes

- PINs are hashed with bcrypt (cost factor 10) — never stored in plain text
- Backend container runs as non-root (`appuser`)
- Rate limiting: 200 requests / 15 min per IP (configurable)
- For internet exposure: use Reverse Proxy + HTTPS + Synology Firewall

## 📄 Licence

Personal use. Not for redistribution.

---

**Version:** 2.0.0 · **Updated:** February 2026 · **Built with:** Claude + Claus 🚀
