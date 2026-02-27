/**
 * Portfolio Tracker — Backend API Server
 * v3.0 — Multi-User / Multi-Portfolio Edition
 *
 * New in v3:
 *  - users table: username + PIN (bcrypt)
 *  - portfolios now belong to a user (user_id FK)
 *  - user auth routes: /api/users/login, /api/users/register
 *  - portfolio routes scoped under authenticated user
 *  - historical price lookup: /api/quotes/lookup/:symbol/:date
 *  - all v2 features preserved (Yahoo/AV quotes, FX, AV usage)
 */

const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const compression = require('compression');
const rateLimit   = require('express-rate-limit');
const Database    = require('better-sqlite3');
const bcrypt      = require('bcrypt');
const fetch       = require('node-fetch');
const path        = require('path');
const fs          = require('fs');
const ExcelJS     = require('exceljs');

// ─── Config ──────────────────────────────────────────────────────────────────
const app           = express();
const PORT          = process.env.PORT          || 3001;
const DB_PATH       = process.env.DATABASE_PATH || path.join(__dirname, 'data', 'portfolio.db');
const QUOTE_TTL_MIN = parseInt(process.env.QUOTE_TTL_MIN || '5',  10);
const FX_TTL_MIN    = parseInt(process.env.FX_TTL_MIN    || '60', 10);
const LOG_LEVEL     = process.env.LOG_LEVEL || 'info';
const BCRYPT_ROUNDS = 10;

// ─── Logger ──────────────────────────────────────────────────────────────────
const log = {
  info:  (...a) => ['info','debug'].includes(LOG_LEVEL) && console.log('[INFO]',  ...a),
  warn:  (...a) => ['info','debug','warn'].includes(LOG_LEVEL) && console.warn('[WARN]', ...a),
  error: (...a) => console.error('[ERROR]', ...a),
  debug: (...a) => LOG_LEVEL === 'debug' && console.log('[DEBUG]', ...a),
};

// ─── DB Setup ────────────────────────────────────────────────────────────────
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema v3 ────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    pin_hash    TEXT    NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS portfolios (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER,
    name        TEXT    NOT NULL,
    color       TEXT    DEFAULT '#3b82f6',
    deleted_at  DATETIME,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio_id INTEGER NOT NULL,
    symbol       TEXT    NOT NULL,
    name         TEXT,
    quantity     REAL    NOT NULL,
    price        REAL    NOT NULL,
    price_usd    REAL    NOT NULL DEFAULT 0,
    date         TEXT    NOT NULL,
    type         TEXT    NOT NULL CHECK(type IN ('BUY','SELL')),
    currency     TEXT    DEFAULT 'USD',
    notes        TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL UNIQUE,
    data_source  TEXT    DEFAULT 'yahoo',
    api_keys     TEXT    DEFAULT '{}',
    display_ccy  TEXT    DEFAULT 'USD',
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS quotes_cache (
    symbol     TEXT    PRIMARY KEY,
    data       TEXT    NOT NULL,
    source     TEXT    DEFAULT 'yahoo',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS fx_cache (
    pair       TEXT    PRIMARY KEY,
    rate       REAL    NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS av_usage (
    date        TEXT    PRIMARY KEY,
    calls       INTEGER NOT NULL DEFAULT 0,
    updated_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_etfs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    ticker     TEXT    NOT NULL,
    name       TEXT,
    provider   TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, ticker),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_tx_portfolio ON transactions(portfolio_id);
  CREATE INDEX IF NOT EXISTS idx_tx_symbol    ON transactions(symbol);
  CREATE INDEX IF NOT EXISTS idx_tx_date      ON transactions(date);
  CREATE INDEX IF NOT EXISTS idx_portfolios_user ON portfolios(user_id);
`);

// ── Migrations from v2 ───────────────────────────────────────────────────────
// Add user_id to portfolios if upgrading from v2
try { db.exec(`ALTER TABLE portfolios ADD COLUMN user_id INTEGER`); log.info('Migration: portfolios.user_id added'); } catch {}
// Add color to portfolios
try { db.exec(`ALTER TABLE portfolios ADD COLUMN color TEXT DEFAULT '#3b82f6'`); log.info('Migration: portfolios.color added'); } catch {}
// Add name to transactions
try { db.exec(`ALTER TABLE transactions ADD COLUMN name TEXT`); log.info('Migration: transactions.name added'); } catch {}
// Settings: migrate from portfolio_id to user_id scope (keep old column for compat)
try { db.exec(`ALTER TABLE settings ADD COLUMN user_id INTEGER`); log.info('Migration: settings.user_id added'); } catch {}

log.info('Database ready:', DB_PATH);

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '200', 10),
  standardHeaders: true, legacyHeaders: false,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────
const err = (res, status, msg, detail) =>
  res.status(status).json({ error: msg, ...(detail ? { detail } : {}) });

let cacheHits = 0, cacheMisses = 0;

// AV usage helpers
function avCountToday() {
  const today = new Date().toISOString().slice(0, 10);
  return db.prepare('SELECT calls FROM av_usage WHERE date = ?').get(today)?.calls ?? 0;
}
function avCountIncrement(n = 1) {
  const today = new Date().toISOString().slice(0, 10);
  db.prepare(`
    INSERT INTO av_usage (date, calls, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(date) DO UPDATE SET calls = calls + ?, updated_at = CURRENT_TIMESTAMP
  `).run(today, n, n);
}

// ════════════════════════════════════════════════════════════════════════════
// USER ROUTES
// ════════════════════════════════════════════════════════════════════════════

// POST /api/users/register  — create new user
app.post('/api/users/register', async (req, res) => {
  const { username, pin } = req.body;
  if (!username?.trim() || !pin) return err(res, 400, 'username and pin required');
  const uname = username.trim();
  if (uname.length < 2 || uname.length > 32) return err(res, 400, 'username must be 2–32 chars');
  if (String(pin).length < 4) return err(res, 400, 'PIN must be at least 4 digits');

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(uname);
  if (existing) return err(res, 409, 'Username already taken');

  try {
    const pin_hash = await bcrypt.hash(String(pin), BCRYPT_ROUNDS);
    const result   = db.prepare(
      'INSERT INTO users (username, pin_hash) VALUES (?, ?)'
    ).run(uname, pin_hash);
    const userId = result.lastInsertRowid;
    log.info('New user registered:', uname);
    res.status(201).json({ id: userId, username: uname });
  } catch(e) {
    log.error('Register error:', e.message);
    err(res, 500, 'Registration failed');
  }
});

// POST /api/users/login  — verify username + PIN, return user + portfolios
app.post('/api/users/login', async (req, res) => {
  const { username, pin } = req.body;
  if (!username?.trim() || !pin) return err(res, 400, 'username and pin required');

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
  if (!user) return err(res, 401, 'Invalid username or PIN');

  const ok = await bcrypt.compare(String(pin), user.pin_hash);
  if (!ok) return err(res, 401, 'Invalid username or PIN');

  // Return user + their portfolios
  const portfolios = db.prepare(`
    SELECT id, name, color, created_at FROM portfolios
    WHERE user_id = ? AND deleted_at IS NULL
    ORDER BY created_at ASC
  `).all(user.id);

  // Load user settings
  const settings = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(user.id);

  log.info('User logged in:', user.username, `(${portfolios.length} portfolios)`);
  res.json({
    id: user.id,
    username: user.username,
    portfolios,
    settings: settings ? JSON.parse(settings.data_source ? JSON.stringify({
      data_source: settings.data_source,
      api_keys: settings.api_keys ? JSON.parse(settings.api_keys) : {},
      display_ccy: settings.display_ccy,
    }) : '{}') : { data_source: 'yahoo', api_keys: {}, display_ccy: 'USD' },
  });
});

// GET /api/users/:userId/portfolios  — list portfolios for a user
app.get('/api/users/:userId/portfolios', (req, res) => {
  const rows = db.prepare(`
    SELECT id, name, color, created_at FROM portfolios
    WHERE user_id = ? AND deleted_at IS NULL
    ORDER BY created_at ASC
  `).all(req.params.userId);
  res.json(rows);
});

// POST /api/users/:userId/portfolios  — create portfolio for user
app.post('/api/users/:userId/portfolios', (req, res) => {
  const { name, color } = req.body;
  if (!name?.trim()) return err(res, 400, 'name required');
  const result = db.prepare(
    'INSERT INTO portfolios (user_id, name, color) VALUES (?, ?, ?)'
  ).run(req.params.userId, name.trim(), color || '#3b82f6');
  res.status(201).json({ id: result.lastInsertRowid, name: name.trim(), color: color || '#3b82f6' });
});

// PUT /api/portfolios/:id  — rename or recolor portfolio
app.put('/api/portfolios/:id', (req, res) => {
  const { name, color } = req.body;
  if (name) db.prepare('UPDATE portfolios SET name=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(name, req.params.id);
  if (color) db.prepare('UPDATE portfolios SET color=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(color, req.params.id);
  res.json({ ok: true });
});

// DELETE /api/portfolios/:id
app.delete('/api/portfolios/:id', (req, res) => {
  db.prepare('UPDATE portfolios SET deleted_at=CURRENT_TIMESTAMP WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════════════════
// TRANSACTION ROUTES  (unchanged from v2)
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/portfolios/:id/transactions', (req, res) => {
  const rows = db.prepare(`
    SELECT id, portfolio_id, symbol, name, quantity, price, price_usd, date, type, currency, notes, created_at
    FROM transactions WHERE portfolio_id = ? ORDER BY date DESC, created_at DESC
  `).all(req.params.id);
  res.json(rows);
});

app.post('/api/portfolios/:id/transactions', async (req, res) => {
  const { symbol, name, quantity, price, price_usd, date, type, currency, notes } = req.body;
  if (!symbol||!quantity||!price||!date||!type) return err(res, 400, 'symbol, quantity, price, date, type required');

  // Compute price_usd server-side when currency is not USD and frontend didn't provide it (or sent 0)
  let finalPriceUSD = price_usd && price_usd > 0 ? price_usd : price;
  const ccy = (currency || 'USD').toUpperCase();
  if (ccy !== 'USD' && !(price_usd > 0)) {
    try {
      // Use historical FX rate for the transaction date
      const fxDate = date; // YYYY-MM-DD
      const cacheKey = `hist_${fxDate}_${ccy}_USD`;
      const cached = db.prepare('SELECT rate FROM fx_cache WHERE pair=?').get(cacheKey);
      if (cached) {
        finalPriceUSD = price * cached.rate;
      } else {
        const url = `https://api.frankfurter.app/${fxDate}?from=${ccy}&to=USD`;
        const resp = await fetch(url);
        if (resp.ok) {
          const data = await resp.json();
          const rate = data.rates?.USD;
          if (rate) {
            finalPriceUSD = price * rate;
            db.prepare('INSERT OR REPLACE INTO fx_cache (pair, rate, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
              .run(cacheKey, rate);
            log.info(`FX ${ccy}→USD on ${fxDate}: ${rate} (server-side)`);
          }
        }
      }
    } catch(e) {
      log.warn('Server-side FX lookup failed, using frontend value or fallback:', e.message);
      // Fallback: use live rates from fx_cache
      const liveRate = db.prepare('SELECT rate FROM fx_cache WHERE pair=?').get(ccy);
      if (liveRate?.rate) finalPriceUSD = price / liveRate.rate;
    }
  }

  const result = db.prepare(`
    INSERT INTO transactions (portfolio_id, symbol, name, quantity, price, price_usd, date, type, currency, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.id, symbol.toUpperCase(), name||null, quantity, price, finalPriceUSD, date, type.toUpperCase(), ccy, notes||null);
  const tx = db.prepare('SELECT * FROM transactions WHERE id=?').get(result.lastInsertRowid);
  log.info(`TX saved: ${symbol} price=${price} ${ccy} → price_usd=${finalPriceUSD.toFixed(4)}`);
  res.status(201).json(tx);
});

app.put('/api/transactions/:id', async (req, res) => {
  const { symbol, name, quantity, price, price_usd, date, type, currency, notes } = req.body;
  let finalPriceUSD = price_usd && price_usd > 0 ? price_usd : price;
  const ccy = (currency || 'USD').toUpperCase();
  if (ccy !== 'USD' && !(price_usd > 0)) {
    try {
      const cacheKey = `hist_${date}_${ccy}_USD`;
      const cached = db.prepare('SELECT rate FROM fx_cache WHERE pair=?').get(cacheKey);
      if (cached) {
        finalPriceUSD = price * cached.rate;
      } else {
        const url = `https://api.frankfurter.app/${date}?from=${ccy}&to=USD`;
        const resp = await fetch(url);
        if (resp.ok) {
          const data = await resp.json();
          const rate = data.rates?.USD;
          if (rate) {
            finalPriceUSD = price * rate;
            db.prepare('INSERT OR REPLACE INTO fx_cache (pair, rate, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
              .run(cacheKey, rate);
          }
        }
      }
    } catch(e) {
      log.warn('Server-side FX lookup (PUT) failed:', e.message);
      const liveRate = db.prepare('SELECT rate FROM fx_cache WHERE pair=?').get(ccy);
      if (liveRate?.rate) finalPriceUSD = price / liveRate.rate;
    }
  }
  db.prepare(`
    UPDATE transactions SET symbol=?, name=?, quantity=?, price=?, price_usd=?, date=?, type=?, currency=?, notes=?
    WHERE id=?
  `).run(symbol?.toUpperCase(), name||null, quantity, price, finalPriceUSD, date, type?.toUpperCase(), ccy, notes||null, req.params.id);
  res.json(db.prepare('SELECT * FROM transactions WHERE id=?').get(req.params.id));
});

app.delete('/api/transactions/:id', (req, res) => {
  db.prepare('DELETE FROM transactions WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// POST /api/transactions/recalculate-fx
// Recalculates price_usd for all transactions where currency != 'USD' and price_usd = price
// (meaning it was saved without proper FX conversion).
// This can be called once to fix existing data.
app.post('/api/transactions/recalculate-fx', async (req, res) => {
  const txs = db.prepare(
    `SELECT id, price, price_usd, currency, date FROM transactions
     WHERE currency IS NOT NULL AND currency != 'USD'`
  ).all();

  let fixed = 0, skipped = 0, failed = 0;
  for (const tx of txs) {
    // If price_usd == price or price_usd is 0, it was saved without conversion
    if (Math.abs(tx.price_usd - tx.price) < 0.001 || tx.price_usd === 0) {
      try {
        const ccy = tx.currency.toUpperCase();
        const cacheKey = `hist_${tx.date}_${ccy}_USD`;
        let rate = null;
        const cached = db.prepare('SELECT rate FROM fx_cache WHERE pair=?').get(cacheKey);
        if (cached) {
          rate = cached.rate;
        } else {
          const url = `https://api.frankfurter.app/${tx.date}?from=${ccy}&to=USD`;
          const resp = await fetch(url);
          if (resp.ok) {
            const data = await resp.json();
            rate = data.rates?.USD;
            if (rate) {
              db.prepare('INSERT OR REPLACE INTO fx_cache (pair, rate, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
                .run(cacheKey, rate);
            }
          }
          // Throttle to avoid rate limits
          await new Promise(r => setTimeout(r, 300));
        }
        if (rate) {
          const newPriceUSD = tx.price * rate;
          db.prepare('UPDATE transactions SET price_usd=? WHERE id=?').run(newPriceUSD, tx.id);
          log.info(`Recalc TX ${tx.id}: ${tx.price} ${ccy} → $${newPriceUSD.toFixed(4)} (rate ${rate})`);
          fixed++;
        } else {
          skipped++;
        }
      } catch(e) {
        log.warn(`Recalc TX ${tx.id} failed:`, e.message);
        failed++;
      }
    } else {
      skipped++; // already has correct conversion
    }
  }
  res.json({ total: txs.length, fixed, skipped, failed });
});

// ════════════════════════════════════════════════════════════════════════════
// SETTINGS ROUTES  (now user-scoped)
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/users/:userId/settings', (req, res) => {
  const row = db.prepare('SELECT * FROM settings WHERE user_id=?').get(req.params.userId);
  if (!row) return res.json({ data_source:'yahoo', api_keys:{}, display_ccy:'USD' });
  res.json({ data_source: row.data_source, api_keys: JSON.parse(row.api_keys||'{}'), display_ccy: row.display_ccy });
});

app.put('/api/users/:userId/settings', (req, res) => {
  const { data_source, api_keys, display_ccy } = req.body;
  db.prepare(`
    INSERT INTO settings (user_id, data_source, api_keys, display_ccy, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      data_source=excluded.data_source,
      api_keys=excluded.api_keys,
      display_ccy=excluded.display_ccy,
      updated_at=CURRENT_TIMESTAMP
  `).run(req.params.userId, data_source||'yahoo', JSON.stringify(api_keys||{}), display_ccy||'USD');
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════════════════
// QUOTE ROUTES  (unchanged from v2)
// ════════════════════════════════════════════════════════════════════════════

// User-Agent rotation for Yahoo
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15',
];
let uaIndex = 0;
const nextUA = () => USER_AGENTS[uaIndex++ % USER_AGENTS.length];

async function fetchYahoo(symbol, range = '2y', interval = '1d') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
              `?interval=${interval}&range=${range}&includePrePost=false`;
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 10000);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': nextUA(), 'Accept': 'application/json',
                 'Accept-Language': 'en-US,en;q=0.9', 'Referer': 'https://finance.yahoo.com' },
    });
    clearTimeout(timeout);
    if (resp.status === 429) throw new Error('Yahoo Finance rate limit — try again in a minute');
    if (resp.status === 404) throw new Error(`Symbol "${symbol}" not found on Yahoo Finance`);
    if (!resp.ok) throw new Error(`Yahoo Finance HTTP ${resp.status}`);
    return await resp.json();
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') throw new Error('Yahoo Finance request timed out (10s)');
    throw e;
  }
}

// GET /api/quotes/yahoo/:symbol
app.get('/api/quotes/yahoo/:symbol', async (req, res) => {
  const symbol       = req.params.symbol.toUpperCase();
  const forceRefresh = req.query.refresh === '1';
  const range        = req.query.range    || '2y';
  const interval     = req.query.interval || '1d';
  const isIntraday   = interval !== '1d';
  const cacheKey     = isIntraday ? `${symbol}_intraday` : symbol;
  const ttl          = isIntraday ? 5 : QUOTE_TTL_MIN;

  try {
    if (!forceRefresh) {
      const cached = db.prepare(`
        SELECT data, updated_at FROM quotes_cache
        WHERE symbol=? AND datetime(updated_at) > datetime('now', '-${ttl} minutes')
      `).get(cacheKey);
      if (cached) { cacheHits++; return res.json({ ...JSON.parse(cached.data), _cached:true }); }
    }
    cacheMisses++;
    const data = await fetchYahoo(symbol, range, interval);
    if (data.chart?.error) throw new Error(data.chart.error.description ?? 'Yahoo error');
    const result = data.chart?.result?.[0];
    if (!result) throw new Error('No data returned from Yahoo Finance');
    db.prepare("INSERT OR REPLACE INTO quotes_cache (symbol, data, source, updated_at) VALUES (?, ?, 'yahoo', CURRENT_TIMESTAMP)")
      .run(cacheKey, JSON.stringify(data));
    res.json(data);
  } catch(e) {
    log.warn('Yahoo error:', symbol, e.message);
    err(res, 502, e.message);
  }
});

// GET /api/quotes/lookup/:symbol/:date  — historical close + company name
// Uses 10y range to handle older purchase dates; caches the raw data for 60min
app.get('/api/quotes/lookup/:symbol/:date', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const date   = req.params.date;
  try {
    // Determine how far back we need: use 10y so purchases up to 10 years old work
    const cacheKey = `${symbol}_hist10y`;
    let data;
    const cached = db.prepare(
      `SELECT data, updated_at FROM quotes_cache
       WHERE symbol=? AND datetime(updated_at) > datetime('now', '-60 minutes')`
    ).get(cacheKey);
    if (cached) {
      data = JSON.parse(cached.data);
    } else {
      data = await fetchYahoo(symbol, '10y', '1d');
      if (data.chart?.error) throw new Error(data.chart.error.description ?? 'Yahoo error');
      db.prepare("INSERT OR REPLACE INTO quotes_cache (symbol, data, source, updated_at) VALUES (?, ?, 'yahoo', CURRENT_TIMESTAMP)")
        .run(cacheKey, JSON.stringify(data));
    }

    const result = data.chart?.result?.[0];
    if (!result) throw new Error('No data returned');
    const meta        = result.meta ?? {};
    const timestamps  = result.timestamp ?? [];
    const closes      = result.indicators?.quote?.[0]?.close ?? [];
    const companyName = meta.longName ?? meta.shortName ?? symbol;

    // Find the last trading day on or before the requested date
    const targetTs = Math.floor(new Date(date + 'T18:00:00Z').getTime() / 1000);
    let bestIdx = -1;
    for (let i = timestamps.length - 1; i >= 0; i--) {
      if (timestamps[i] <= targetTs && closes[i] != null) { bestIdx = i; break; }
    }
    // Fallback: first available data point (for very old dates before 10y range)
    if (bestIdx === -1) {
      for (let i = 0; i < timestamps.length; i++) {
        if (closes[i] != null) { bestIdx = i; break; }
      }
    }
    if (bestIdx === -1) throw new Error('No price data found for this date');

    const actualDate    = new Date(timestamps[bestIdx] * 1000).toISOString().slice(0, 10);
    const isToday       = actualDate === new Date().toISOString().slice(0, 10);
    const daysOff       = Math.round(Math.abs(new Date(actualDate) - new Date(date)) / 86400000);
    const isHistorical  = !isToday && daysOff < 5; // within a week = normal (weekends/holidays)

    res.json({
      symbol, companyName,
      price:         closes[bestIdx],
      date:          actualDate,      // actual trading day used
      requestedDate: date,            // what the user asked for
      daysOff,                        // how many days off from requested date
      isHistorical:  !isToday,        // true = historical price, false = today's price
      currency:      meta.currency ?? 'USD',
    });
  } catch(e) {
    log.warn('lookup error:', symbol, date, e.message);
    err(res, 502, e.message);
  }
});

// Alpha Vantage fetch helper
async function fetchAlphaVantage(symbol, apiKey) {
  if (!apiKey) throw new Error('No Alpha Vantage API key configured');
  const quoteUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
  const histUrl  = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&outputsize=full&apikey=${apiKey}`;
  const [quoteResp, histResp] = await Promise.all([fetch(quoteUrl), fetch(histUrl)]);
  const [quoteData, histData] = await Promise.all([quoteResp.json(), histResp.json()]);
  avCountIncrement(2);
  const q = quoteData['Global Quote'];
  if (!q || !q['05. price']) throw new Error(quoteData.Note || quoteData.Information || `No quote data for ${symbol}`);
  const price    = parseFloat(q['05. price']);
  const prevClose = parseFloat(q['08. previous close'] || price);
  const change   = parseFloat(q['09. change'] || 0);
  const changePct = parseFloat((q['10. change percent'] || '0%').replace('%',''));
  const timeSeries = histData['Time Series (Daily)'] ?? {};
  const dates  = Object.keys(timeSeries).sort().reverse();
  const refs   = {};
  const periodDays = { '1W':7, '1M':30, 'YTD':null, '1Y':365, '2Y':730 };
  for (const [label, days] of Object.entries(periodDays)) {
    if (label === 'YTD') {
      const jan1 = `${new Date().getFullYear()}-01-01`;
      const d = dates.find(d => d <= jan1);
      if (d) refs[label] = parseFloat(timeSeries[d]['4. close']);
    } else {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
      const cutStr = cutoff.toISOString().slice(0,10);
      const d = dates.find(d => d <= cutStr);
      if (d) refs[label] = parseFloat(timeSeries[d]['4. close']);
    }
  }
  let name = symbol;
  try {
    const ovUrl  = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
    const ovData = await (await fetch(ovUrl)).json();
    avCountIncrement(1);
    if (ovData.Name) name = ovData.Name;
  } catch {}
  return { price, prevClose, open:price, change, changePct, name, refs, fetchedAt:Date.now(), source:'alphavantage' };
}

app.get('/api/quotes/alphavantage/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const apiKey = req.query.apikey || process.env.AV_API_KEY || '';
  try {
    const result = await fetchAlphaVantage(symbol, apiKey);
    db.prepare("INSERT OR REPLACE INTO quotes_cache (symbol, data, source, updated_at) VALUES (?, ?, 'alphavantage', CURRENT_TIMESTAMP)")
      .run(symbol, JSON.stringify(result));
    res.json(result);
  } catch(e) {
    log.warn('Alpha Vantage error:', symbol, e.message);
    err(res, 502, 'Failed to fetch quote from Alpha Vantage', e.message);
  }
});

// POST /api/quotes/batch
app.post('/api/quotes/batch', async (req, res) => {
  const { symbols, source, apiKey } = req.body;
  if (!Array.isArray(symbols) || !symbols.length) return err(res, 400, 'symbols array required');
  const results = {};
  const errors  = {};
  const PERIODS = ['1W','1M','YTD','1Y','2Y'];

  const parseYahooQuote = (sym, data) => {
    const r        = data.chart?.result?.[0];
    if (!r) return null;
    const meta     = r.meta ?? {};
    const timestamps = r.timestamp ?? [];
    const closes   = r.indicators?.quote?.[0]?.close ?? [];
    const opens    = r.indicators?.quote?.[0]?.open  ?? [];
    const validCloses = closes.filter(v => v != null);
    const lastClose = validCloses[validCloses.length - 2] ?? null;
    const price    = meta.regularMarketPrice ?? closes[closes.length-1] ?? 0;
    const prevClose = lastClose ?? meta.previousClose ?? price;
    const change   = price - prevClose;
    const changePct = prevClose > 0 ? (change/prevClose)*100 : 0;
    const refs     = {};
    for (const period of PERIODS) {
      const days = period==='1W'?7:period==='1M'?30:period==='YTD'?null:period==='1Y'?365:730;
      let cutoffTs;
      if (period === 'YTD') { const jan1 = new Date(new Date().getFullYear(),0,1); cutoffTs = jan1.getTime()/1000; }
      else { const d = new Date(); d.setDate(d.getDate()-days); cutoffTs = d.getTime()/1000; }
      let bestIdx=-1, bestDiff=Infinity;
      for (let i=0;i<timestamps.length;i++) {
        if (closes[i]==null) continue;
        const diff = Math.abs(timestamps[i]-cutoffTs);
        if (diff < bestDiff) { bestDiff=diff; bestIdx=i; }
      }
      if (bestIdx>=0) refs[period] = closes[bestIdx];
    }
    return {
      price, prevClose, open: opens[opens.length-1]??price,
      change, changePct, refs,
      shortName: meta.shortName ?? sym,
      name: meta.shortName ?? meta.longName ?? sym,
      longName: meta.longName ?? null,
      currency: meta.currency ?? 'USD',
      fetchedAt: Date.now(), source: 'yahoo',
    };
  };

  for (const sym of symbols) {
    try {
      if (source === 'alphavantage') {
        const cached = db.prepare(`SELECT data, updated_at FROM quotes_cache WHERE symbol=? AND source='alphavantage' AND datetime(updated_at) > datetime('now', '-${QUOTE_TTL_MIN} minutes')`).get(sym);
        if (cached) { cacheHits++; results[sym] = JSON.parse(cached.data); continue; }
        cacheMisses++;
        const result = await fetchAlphaVantage(sym, apiKey || process.env.AV_API_KEY || '');
        db.prepare("INSERT OR REPLACE INTO quotes_cache (symbol, data, source, updated_at) VALUES (?, ?, 'alphavantage', CURRENT_TIMESTAMP)").run(sym, JSON.stringify(result));
        results[sym] = result;
      } else {
        const cached = db.prepare(`SELECT data, updated_at FROM quotes_cache WHERE symbol=? AND datetime(updated_at) > datetime('now', '-${QUOTE_TTL_MIN} minutes')`).get(sym);
        if (cached) { cacheHits++; const parsed=JSON.parse(cached.data); results[sym]=parseYahooQuote(sym,parsed)??parsed; continue; }
        cacheMisses++;
        const chartData = await fetchYahoo(sym);
        db.prepare("INSERT OR REPLACE INTO quotes_cache (symbol, data, source, updated_at) VALUES (?, ?, 'yahoo', CURRENT_TIMESTAMP)").run(sym, JSON.stringify(chartData));
        const parsed = parseYahooQuote(sym, chartData);
        if (parsed) results[sym] = parsed;
        else errors[sym] = 'Parse error';
      }
    } catch(e) {
      log.warn('batch quote error:', sym, e.message);
      errors[sym] = e.message;
    }
  }
  res.json({ results, errors });
});

// ════════════════════════════════════════════════════════════════════════════
// FX ROUTES  (unchanged from v2)
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/fx/historical/:date/:from/:to', async (req, res) => {
  const { date, from, to } = req.params;
  try {
    const cacheKey = `hist_${date}_${from}_${to}`;
    const cached = db.prepare('SELECT rate FROM fx_cache WHERE pair=?').get(cacheKey);
    if (cached) return res.json({ rate: cached.rate, date, from, to, cached: true });
    const url = `https://api.frankfurter.app/${date}?from=${from}&to=${to}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Frankfurter HTTP ${resp.status}`);
    const data = await resp.json();
    const rate = data.rates?.[to];
    if (!rate) throw new Error(`No rate for ${from}→${to} on ${date}`);
    db.prepare('INSERT OR REPLACE INTO fx_cache (pair, rate, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)').run(cacheKey, rate);
    res.json({ rate, date, from, to });
  } catch(e) {
    err(res, 502, 'FX historical fetch failed', e.message);
  }
});

app.get('/api/fx/all', async (_req, res) => {
  try {
    const ttl = FX_TTL_MIN;
    const pairs = ['EUR','GBP','CHF','JPY','CAD','AUD'];
    const result = { USD: 1 };
    const toFetch = [];
    for (const ccy of pairs) {
      const cached = db.prepare(`SELECT rate, updated_at FROM fx_cache WHERE pair=? AND datetime(updated_at) > datetime('now', '-${ttl} minutes')`).get(ccy);
      if (cached) result[ccy] = cached.rate;
      else toFetch.push(ccy);
    }
    if (toFetch.length) {
      const url  = `https://api.frankfurter.app/latest?from=USD&to=${toFetch.join(',')}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Frankfurter HTTP ${resp.status}`);
      const data = await resp.json();
      for (const [k,v] of Object.entries(data.rates ?? {})) {
        result[k] = v;
        db.prepare('INSERT OR REPLACE INTO fx_cache (pair, rate, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)').run(k, v);
      }
    }
    res.json(result);
  } catch(e) {
    log.warn('FX all error:', e.message);
    const fallback = db.prepare('SELECT pair, rate FROM fx_cache WHERE pair IN (?,?,?,?,?,?)').all('EUR','GBP','CHF','JPY','CAD','AUD');
    const fb = { USD:1 };
    for (const r of fallback) fb[r.pair] = r.rate;
    res.json({ ...fb, _fallback: true });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// AV USAGE / HEALTH / STATS
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/av/usage', (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const todayRow = db.prepare('SELECT calls FROM av_usage WHERE date = ?').get(today);
  const history  = db.prepare("SELECT date, calls FROM av_usage WHERE date >= date('now', '-7 days') ORDER BY date ASC").all();
  const used      = todayRow?.calls ?? 0;
  const limit     = 25;
  res.json({ date: today, today: used, limit, remaining: Math.max(0, limit - used), history });
});

app.get('/api/health', (_req, res) => {
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const portCount = db.prepare('SELECT COUNT(*) as c FROM portfolios WHERE deleted_at IS NULL').get().c;
  const txCount   = db.prepare('SELECT COUNT(*) as c FROM transactions').get().c;
  res.json({ status:'ok', version:'3.0', users: userCount, portfolios: portCount,
             transactions: txCount, cacheHits, cacheMisses, uptime: process.uptime() });
});

app.get('/api/stats', (_req, res) => {
  const users = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const portfolios = db.prepare('SELECT COUNT(*) as c FROM portfolios WHERE deleted_at IS NULL').get().c;
  const transactions = db.prepare('SELECT COUNT(*) as c FROM transactions').get().c;
  const cacheSize = db.prepare('SELECT COUNT(*) as c FROM quotes_cache').get().c;
  res.json({ users, portfolios, transactions, cacheSize, cacheHits, cacheMisses });
});

app.get('/', (_req, res) => res.json({ name:'Portfolio Tracker API', version:'3.0', status:'ok' }));

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  log.info(`Portfolio Tracker v3.0 backend listening on port ${PORT}`);
});

process.on('SIGTERM', () => { db.close(); process.exit(0); });
process.on('SIGINT',  () => { db.close(); process.exit(0); });

// ════════════════════════════════════════════════════════════════════════════
// ETF EXPLORER ROUTES  — no auth required, public endpoints
// ════════════════════════════════════════════════════════════════════════════

// ── DB table for ETF holdings cache ─────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS etf_holdings_cache (
    ticker     TEXT    PRIMARY KEY,
    holdings   TEXT    NOT NULL,
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── Predefined ETF list ──────────────────────────────────────────────────────
const PREDEFINED_ETFS = [
  { ticker:"ARKK",    name:"ARK Innovation ETF",          provider:"ARK Invest",  source:"av"     },
  { ticker:"SCHD",    name:"Schwab US Dividend Equity",   provider:"Schwab",      source:"av"     },
  { ticker:"MLPA",    name:"Invesco US Energy MLP",       provider:"Invesco",     source:"av"     },
  { ticker:"VGT",     name:"Vanguard IT Sector",          provider:"Vanguard",    source:"av"     },
  { ticker:"SOXL",    name:"Direxion Semiconductors 3x",  provider:"Direxion",    source:"av"     },
  { ticker:"DIA",     name:"iShares DJIA ETF",            provider:"iShares",     source:"av"     },
  { ticker:"TQQQ",    name:"ProShares UltraPro QQQ",      provider:"ProShares",   source:"av"     },
  { ticker:"CHSLI",   name:"UBS SLI ETF",                 provider:"UBS",         source:"static" },
  { ticker:"EXS1.DE", name:"iShares Core DAX",            provider:"iShares",     source:"static" },
];

// ── Static holdings for European ETFs (no free API coverage) ─────────────────
const STATIC_HOLDINGS = {
  "CHSLI": [
    { symbol:"SLHN.SW",  name:"Swiss Life Holding",       weight:9.2  },
    { symbol:"SCMN.SW",  name:"Swisscom",                 weight:8.1  },
    { symbol:"SREN.SW",  name:"Swiss Re",                 weight:7.8  },
    { symbol:"UBSG.SW",  name:"UBS Group",                weight:7.4  },
    { symbol:"BAER.SW",  name:"Julius Baer Group",        weight:6.9  },
    { symbol:"ABBN.SW",  name:"ABB Ltd",                  weight:5.4  },
    { symbol:"GIVN.SW",  name:"Givaudan",                 weight:4.9  },
    { symbol:"KNIN.SW",  name:"Kuehne + Nagel",           weight:4.6  },
    { symbol:"SGSN.SW",  name:"SGS SA",                   weight:4.2  },
    { symbol:"GEBN.SW",  name:"Geberit",                  weight:3.5  },
    { symbol:"STMN.SW",  name:"Straumann Holding",        weight:3.2  },
    { symbol:"LONN.SW",  name:"Lonza Group",              weight:2.7  },
    { symbol:"BUCN.SW",  name:"Bucher Industries",        weight:2.1  },
    { symbol:"HELN.SW",  name:"Helvetia Holding",         weight:1.9  },
    { symbol:"PGHN.SW",  name:"Partners Group",           weight:1.8  },
    { symbol:"EMMN.SW",  name:"Emmi AG",                  weight:1.6  },
    { symbol:"SRAIL.SW", name:"SBB CFF FFS",              weight:1.4  },
    { symbol:"BALN.SW",  name:"Baloise Holding",          weight:1.2  },
    { symbol:"LISP.SW",  name:"Liechtensteinische LB",    weight:1.0  },
    { symbol:"HIAG.SW",  name:"HIAG Immobilien",          weight:0.9  },
  ],
  "EXS1.DE": [
    { symbol:"SAP",      name:"SAP SE",                   weight:14.2 },
    { symbol:"SIE.DE",   name:"Siemens AG",               weight:9.8  },
    { symbol:"ALV.DE",   name:"Allianz SE",               weight:8.6  },
    { symbol:"DTE.DE",   name:"Deutsche Telekom",         weight:7.4  },
    { symbol:"MBG.DE",   name:"Mercedes-Benz Group",      weight:5.9  },
    { symbol:"MUV2.DE",  name:"Munich Re",                weight:5.4  },
    { symbol:"BAYN.DE",  name:"Bayer AG",                 weight:4.8  },
    { symbol:"BMW.DE",   name:"Bayerische Motoren Werke", weight:4.3  },
    { symbol:"DBK.DE",   name:"Deutsche Bank",            weight:3.9  },
    { symbol:"EOAN.DE",  name:"E.ON SE",                  weight:3.4  },
    { symbol:"BAS.DE",   name:"BASF SE",                  weight:3.1  },
    { symbol:"RWE.DE",   name:"RWE AG",                   weight:2.8  },
    { symbol:"CON.DE",   name:"Continental AG",           weight:2.2  },
    { symbol:"HNR1.DE",  name:"Hannover Re",              weight:2.0  },
    { symbol:"ZAL.DE",   name:"Zalando SE",               weight:1.8  },
    { symbol:"HEI.DE",   name:"HeidelbergCement",         weight:1.6  },
    { symbol:"FRE.DE",   name:"Fresenius SE",             weight:1.4  },
    { symbol:"MRK.DE",   name:"Merck KGaA",               weight:1.3  },
    { symbol:"VNA.DE",   name:"Vonovia SE",               weight:1.1  },
    { symbol:"PUMA.DE",  name:"Puma SE",                  weight:1.0  },
    { symbol:"DPW.DE",   name:"Deutsche Post",            weight:0.9  },
    { symbol:"IFX.DE",   name:"Infineon Technologies",    weight:0.8  },
    { symbol:"ENR.DE",   name:"Siemens Energy",           weight:0.7  },
    { symbol:"BEI.DE",   name:"Beiersdorf AG",            weight:0.6  },
    { symbol:"ADS.DE",   name:"Adidas AG",                weight:0.5  },
  ],
};

// ── Alpha Vantage ETF holdings fetch ─────────────────────────────────────────
async function fetchAvEtfHoldings(ticker) {
  const AV_KEY = process.env.AV_API_KEY || process.env.ALPHAVANTAGE_API_KEY || '';
  if (!AV_KEY) {
    log.warn('No Alpha Vantage API key set (AV_API_KEY). Cannot fetch ETF holdings.');
    return null;
  }
  try {
    const url = `https://www.alphavantage.co/query?function=ETF_PROFILE&symbol=${encodeURIComponent(ticker)}&apikey=${AV_KEY}`;
    const res  = await fetch(url, { timeout: 12000 });
    if (!res.ok) throw new Error(`AV HTTP ${res.status}`);
    const data = await res.json();
    if (data['Information']) {
      log.warn(`AV rate limit hit for ${ticker}:`, data['Information']);
      return null;
    }
    const raw = data.holdings;
    if (!Array.isArray(raw) || !raw.length) return null;
    return raw
      .map(h => ({
        symbol: h.symbol,
        name:   h.description || h.symbol,
        weight: Math.round(parseFloat(h.weight || 0) * 10000) / 100, // convert 0.1105 → 11.05%
      }))
      .filter(h => h.symbol && h.weight > 0)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 50);
  } catch(e) {
    log.warn(`AV ETF_PROFILE failed for ${ticker}:`, e.message);
    return null;
  }
}

// ── GET /api/etf/list ─────────────────────────────────────────────────────────
app.get('/api/etf/list', (_req, res) => {
  res.json({ etfs: PREDEFINED_ETFS });
});

// ── GET /api/etf/search?q= — live Yahoo + AV fallback ────────────────────────
app.get('/api/etf/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ results: PREDEFINED_ETFS });

  const qUpper = q.toUpperCase();

  // 1) Always include matching presets first
  const presets = PREDEFINED_ETFS.filter(e =>
    e.ticker.toUpperCase().includes(qUpper) || e.name.toUpperCase().includes(qUpper)
  );
  const seen = new Set(presets.map(e => e.ticker.toUpperCase()));

  // 2) Live Yahoo Finance autocomplete
  let liveResults = [];
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=15&newsCount=0&listsCount=0&enableFuzzyQuery=false&enableEnhancedTrivialQuery=true`;
    const r = await fetch(url, {
      timeout: 6000,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    });
    if (r.ok) {
      const data = await r.json();
      liveResults = (data.quotes || [])
        .filter(q => q.quoteType === 'ETF' && q.symbol)
        .map(q => ({
          ticker:   q.symbol,
          name:     q.shortname || q.longname || q.symbol,
          provider: q.exchDisp  || q.exchange  || '',
          source:   'yahoo_search',
          isPreset: false,
        }))
        .filter(r => !seen.has(r.ticker.toUpperCase()))
        .slice(0, 12);
    }
  } catch(e) {
    log.warn('Yahoo ETF search failed:', e.message);
  }

  // 3) AV fallback if Yahoo returned nothing
  if (!liveResults.length) {
    try {
      const AV_KEY = process.env.AV_API_KEY || process.env.ALPHAVANTAGE_API_KEY || '';
      if (AV_KEY) {
        const url = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(q)}&apikey=${AV_KEY}`;
        const r = await fetch(url, { timeout: 6000 });
        if (r.ok) {
          const data = await r.json();
          liveResults = (data.bestMatches || [])
            .filter(m => m['3. type'] === 'ETF')
            .map(m => ({
              ticker:   m['1. symbol'],
              name:     m['2. name'],
              provider: m['4. region'] || '',
              source:   'av_search',
              isPreset: false,
            }))
            .filter(r => !seen.has(r.ticker.toUpperCase()))
            .slice(0, 10);
        }
      }
    } catch(e) {
      log.warn('AV ETF search failed:', e.message);
    }
  }

  // Mark presets
  const presetsMarked = presets.map(p => ({ ...p, isPreset: true }));

  res.json({ results: [...presetsMarked, ...liveResults] });
});


// ── GET /api/etf/:ticker/holdings ────────────────────────────────────────────
app.get('/api/etf/:ticker/holdings', async (req, res) => {
  const raw    = req.params.ticker.replace('_', '.');
  const ticker = raw.toUpperCase();
  const CACHE_TTL_HOURS = 24;

  // Check DB cache first
  const cached = db.prepare('SELECT holdings, fetched_at FROM etf_holdings_cache WHERE ticker = ?').get(ticker);
  if (cached) {
    const ageH = (Date.now() - new Date(cached.fetched_at).getTime()) / 3600000;
    if (ageH < CACHE_TTL_HOURS) {
      return res.json({
        ticker, holdings: JSON.parse(cached.holdings),
        fetched_at: cached.fetched_at, from_cache: true,
      });
    }
  }

  const etfMeta = PREDEFINED_ETFS.find(e => e.ticker === ticker);
  const source  = etfMeta?.source || 'av';
  let holdings  = null;

  if (source === 'static') {
    // European ETFs — use static data (no free API)
    const key = ticker.replace('.DE','').replace('.SW','');
    holdings = STATIC_HOLDINGS[key] || STATIC_HOLDINGS[ticker] || null;
  } else {
    // US ETFs — Alpha Vantage ETF_PROFILE
    holdings = await fetchAvEtfHoldings(ticker);
    avCountIncrement(1); // track AV usage
  }

  if (!holdings || !holdings.length) {
    if (cached) {
      return res.json({
        ticker, holdings: JSON.parse(cached.holdings),
        fetched_at: cached.fetched_at, from_cache: true, stale: true,
        warning: 'Could not refresh, showing cached data',
      });
    }
    return res.status(404).json({
      error: 'Holdings not available for this ETF',
      hint:  source === 'av' ? 'Check AV_API_KEY environment variable' : 'Static data missing',
      ticker,
    });
  }

  // Save to cache
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR REPLACE INTO etf_holdings_cache (ticker, holdings, fetched_at)
    VALUES (?, ?, ?)
  `).run(ticker, JSON.stringify(holdings), now);

  res.json({ ticker, holdings, fetched_at: now, from_cache: false });
});

// ════════════════════════════════════════════════════════════════════════════
// USER SAVED ETFs
// ════════════════════════════════════════════════════════════════════════════

// Simple user-id header auth (same pattern as rest of app — stateless, no JWT)
function getUserId(req) {
  const uid = req.headers['x-user-id'];
  return uid ? parseInt(uid, 10) : null;
}

// GET /api/user/etfs  — list saved ETFs for a user
app.get('/api/user/etfs', (req, res) => {
  const userId = getUserId(req);
  if (!userId) return err(res, 401, 'x-user-id header required');
  const rows = db.prepare(
    'SELECT ticker, name, provider, created_at FROM user_etfs WHERE user_id=? ORDER BY created_at ASC'
  ).all(userId);
  res.json({ etfs: rows });
});

// POST /api/user/etfs  — save an ETF for a user
app.post('/api/user/etfs', (req, res) => {
  const userId = getUserId(req);
  if (!userId) return err(res, 401, 'x-user-id header required');
  const { ticker, name, provider } = req.body;
  if (!ticker) return err(res, 400, 'ticker required');
  try {
    db.prepare(
      'INSERT OR IGNORE INTO user_etfs (user_id, ticker, name, provider) VALUES (?, ?, ?, ?)'
    ).run(userId, ticker.toUpperCase(), name||null, provider||null);
    const etfs = db.prepare(
      'SELECT ticker, name, provider, created_at FROM user_etfs WHERE user_id=? ORDER BY created_at ASC'
    ).all(userId);
    res.json({ ok: true, etfs });
  } catch(e) {
    err(res, 500, e.message);
  }
});

// DELETE /api/user/etfs/:ticker  — remove a saved ETF
app.delete('/api/user/etfs/:ticker', (req, res) => {
  const userId = getUserId(req);
  if (!userId) return err(res, 401, 'x-user-id header required');
  db.prepare('DELETE FROM user_etfs WHERE user_id=? AND ticker=?')
    .run(userId, req.params.ticker.toUpperCase());
  const etfs = db.prepare(
    'SELECT ticker, name, provider, created_at FROM user_etfs WHERE user_id=? ORDER BY created_at ASC'
  ).all(userId);
  res.json({ ok: true, etfs });
});

// ════════════════════════════════════════════════════════════════════════════
// EXCEL EXPORT / IMPORT / TEMPLATE  — auth required
// ════════════════════════════════════════════════════════════════════════════

// ── GET /api/portfolios/import/template  — download blank import template ─────
app.get('/api/portfolios/import/template', (req, res) => {
  const tplPath = path.join(__dirname, 'static', 'import_template.xlsx');
  if (!fs.existsSync(tplPath)) return err(res, 404, 'Template not found');
  res.setHeader('Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition',
    'attachment; filename="portfolio_import_template.xlsx"');
  res.sendFile(tplPath);
});


// ── GET /api/portfolios/:id/export  — download transactions as CSV ───────────
app.get('/api/portfolios/:id/export', async (req, res) => {
  if (!getUserId(req)) return err(res, 401, 'x-user-id header required');
  const pid  = req.params.id;
  const port = db.prepare('SELECT * FROM portfolios WHERE id=? AND user_id=?')
                  .get(pid, getUserId(req));
  if (!port) return err(res, 404, 'Portfolio not found');

  const txs = db.prepare(`
    SELECT date, type, symbol, name, quantity, price, currency, price_usd, notes
    FROM transactions WHERE portfolio_id=? AND deleted_at IS NULL
    ORDER BY date ASC, id ASC
  `).all(pid);

  // Build CSV (RFC 4180)
  const COLS = ['date','type','symbol','name','quantity','price','currency','price_usd','notes','portfolio'];
  const esc  = v => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? '"' + s.replace(/"/g, '""') + '"'
      : s;
  };

  const lines = [COLS.join(',')];
  for (const t of txs) {
    lines.push([
      t.date, t.type, t.symbol,
      esc(t.name),
      t.quantity, t.price, t.currency,
      t.price_usd ?? '', esc(t.notes),
      esc(port.name),  // portfolio name for multi-portfolio import
    ].join(','));
  }
  const csv = lines.join('\r\n');

  const safe     = port.name.replace(/[^a-z0-9_-]/gi, '_');
  const dateStr  = new Date().toISOString().slice(0,10);
  const filename = `${safe}_${dateStr}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('\uFEFF' + csv);  // BOM for Excel auto-detection of UTF-8
});

// ── POST /api/portfolios/:id/import  — import transactions from .xlsx ─────────
const multer = require('multer');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype.includes('spreadsheet') ||
               file.mimetype.includes('excel') ||
               file.mimetype === 'text/csv' ||
               file.mimetype === 'application/csv' ||
               file.originalname.endsWith('.xlsx') ||
               file.originalname.endsWith('.csv');
    ok ? cb(null, true) : cb(new Error('Only .xlsx or .csv files are supported'));
  }
});

// Helper: look up historical close price + currency for a symbol on a given date
async function lookupPriceForImport(symbol, date) {
  try {
    const cacheKey = `${symbol.toUpperCase()}_hist10y_splits`;
    let data;
    const cached = db.prepare(
      `SELECT data FROM quotes_cache WHERE symbol=? AND datetime(updated_at) > datetime('now', '-60 minutes')`
    ).get(cacheKey);
    if (cached) {
      data = JSON.parse(cached.data);
    } else {
      // Request split events explicitly so we can un-adjust the close prices
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
                  `?range=15y&interval=1d&events=splits%7Cdividends`;
      const r = await fetch(url, { headers:{ 'User-Agent':'Mozilla/5.0' }, timeout:10000 });
      if (!r.ok) return null;
      data = await r.json();
      db.prepare("INSERT OR REPLACE INTO quotes_cache (symbol, data, source, updated_at) VALUES (?, ?, 'yahoo', CURRENT_TIMESTAMP)")
        .run(cacheKey, JSON.stringify(data));
    }

    const result = data.chart?.result?.[0];
    if (!result) return null;

    const meta       = result.meta ?? {};
    const timestamps = result.timestamp ?? [];
    const closes     = result.indicators?.quote?.[0]?.close ?? [];
    const currency   = meta.currency ?? 'USD';
    const targetTs   = Math.floor(new Date(date + 'T18:00:00Z').getTime() / 1000);

    // Collect all splits that occurred AFTER the target date.
    // Yahoo always returns split-adjusted closes, so to get the real
    // historical price we multiply back by every split ratio that
    // happened after the transaction date.
    const splitEvents = Object.values(result.events?.splits ?? {});
    let splitMultiplier = 1;
    for (const s of splitEvents) {
      if (s.date > targetTs) {
        // e.g. 10:1 split → numerator=10, denominator=1 → multiply by 10
        splitMultiplier *= (s.numerator / s.denominator);
      }
    }

    // Find closest trading day on or before target date
    let bestIdx = -1, bestDiff = Infinity;
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] == null) continue;
      if (timestamps[i] > targetTs + 86400 * 3) continue;
      const diff = targetTs - timestamps[i];
      if (diff >= 0 && diff < bestDiff) { bestDiff = diff; bestIdx = i; }
    }
    if (bestIdx === -1) return null;

    const adjustedClose   = closes[bestIdx];
    const unadjustedClose = adjustedClose * splitMultiplier;

    if (splitMultiplier !== 1) {
      log.info(`Split-adjust ${symbol} on ${date}: close=${adjustedClose.toFixed(4)} × ${splitMultiplier} = ${unadjustedClose.toFixed(4)} (${splitEvents.length} split event(s))`);
    }

    return { price: unadjustedClose, currency, splitMultiplier };
  } catch(e) {
    log.warn('lookupPriceForImport failed:', symbol, date, e.message);
    return null;
  }
}

app.post('/api/portfolios/:id/import', upload.single('file'), async (req, res) => {
  if (!getUserId(req)) return err(res, 401, 'x-user-id header required');
  const pid = req.params.id;
  const port = db.prepare('SELECT * FROM portfolios WHERE id=? AND user_id=?')
                  .get(pid, getUserId(req));
  if (!port) return err(res, 404, 'Portfolio not found');
  if (!req.file) return err(res, 400, 'No file uploaded');

  const isCSV = req.file.originalname.toLowerCase().endsWith('.csv') ||
                req.file.mimetype === 'text/csv' ||
                req.file.mimetype === 'application/csv';

  // ── Parse input into uniform { col, rows_raw } structure ─────────────────
  let col = {};      // column name → 0-based index
  let rawRows = [];  // array of string arrays (one per data row)

  if (isCSV) {
    // Parse CSV (RFC 4180, UTF-8 with optional BOM)
    let text = req.file.buffer.toString('utf-8').replace(/^\uFEFF/, ''); // strip BOM
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return err(res, 400, 'CSV file is empty');

    // Parse one CSV line handling quoted fields
    const parseCSVLine = (line) => {
      const fields = [];
      let cur = '', inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQ) {
          if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; }
          else if (ch === '"') inQ = false;
          else cur += ch;
        } else {
          if (ch === '"') inQ = true;
          else if (ch === ',') { fields.push(cur); cur = ''; }
          else cur += ch;
        }
      }
      fields.push(cur);
      return fields.map(f => f.trim());
    };

    // Find header row
    let headerIdx = -1;
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
      const f = parseCSVLine(lines[i]).map(v => v.toLowerCase());
      if (f.includes('date') && f.includes('symbol') && f.includes('type')) {
        headerIdx = i;
        f.forEach((h, idx) => { if (h) col[h] = idx; });
        break;
      }
    }
    if (headerIdx === -1) return err(res, 400, 'Could not find header row in CSV (needs: date, symbol, type, quantity)');

    for (let i = headerIdx + 1; i < lines.length; i++) {
      rawRows.push(parseCSVLine(lines[i]));
    }
  } else {
    // Parse XLSX
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(req.file.buffer);
    } catch(e) {
      return err(res, 400, 'Could not read Excel file: ' + e.message);
    }

    const ws = wb.getWorksheet('Transactions') || wb.worksheets[0];
    if (!ws) return err(res, 400, 'No worksheet found in file');

    let headerRowNum = 0;
    let headerArr = null;
    ws.eachRow((row, rowNum) => {
      if (headerArr) return;
      const vals = row.values.map(v => String(v||'').toLowerCase().trim());
      if (vals.includes('date') && vals.includes('symbol') && vals.includes('type')) {
        headerArr = vals; headerRowNum = rowNum;
      }
    });
    if (!headerArr) return err(res, 400, 'Could not find header row (needs: date, symbol, type, quantity)');
    headerArr.forEach((h, i) => { if (h) col[h] = i; });

    ws.eachRow((row, rowNum) => {
      if (rowNum <= headerRowNum) return;
      // Convert XLSX row to string array (1-based to 0-based)
      const maxIdx = Math.max(...Object.values(col));
      const arr = [];
      for (let i = 0; i <= maxIdx + 1; i++) {
        const v = row.getCell(i+1).value;
        if (v instanceof Date) arr.push(v.toISOString().slice(0,10));
        else arr.push(v === null || v === undefined ? '' : String(v).trim());
      }
      rawRows.push(arr);
    });
  }

  // ── Unified row processing ────────────────────────────────────────────────
  const getField = (arr, field) => {
    const idx = col[field];
    if (idx === undefined || idx >= arr.length) return '';
    return (arr[idx] || '').trim();
  };

  // price and currency are now OPTIONAL — looked up from Yahoo if missing
  const REQUIRED = ['date','type','symbol','quantity'];
  const missing = REQUIRED.filter(f => col[f] === undefined);
  if (missing.length) return err(res, 400, `Missing required columns: ${missing.join(', ')}`);

  const VALID_TYPES = new Set(['BUY','SELL']);
  const VALID_CCY   = new Set(['USD','EUR','CHF','GBP']);
  const DATE_RE     = /^\d{4}-\d{2}-\d{2}$/;
  const EXAMPLE_DATES = new Set(['2024-01-15','2024-02-20','2024-03-10']);
  const EXAMPLE_SYMS  = new Set(['AAPL','SAP.DE']);

  const rows = [], skipped = [];

  rawRows.forEach((arr, idx) => {
    const rowNum = idx + 1;
    const date     = getField(arr, 'date');
    const type     = getField(arr, 'type').toUpperCase();
    const symbol   = getField(arr, 'symbol').toUpperCase();
    const quantity = parseFloat(getField(arr, 'quantity'));
    const priceRaw = getField(arr, 'price');
    const ccy      = getField(arr, 'currency').toUpperCase();
    const name     = getField(arr, 'name') || null;
    const priceUsd = parseFloat(getField(arr, 'price_usd')) || 0;
    const notes    = getField(arr, 'notes') || null;

    if (!date && !symbol) return; // blank row

    // Skip example rows
    if (EXAMPLE_SYMS.has(symbol) && EXAMPLE_DATES.has(date)) {
      skipped.push({ row:rowNum, reason:'example row skipped' }); return;
    }

    const errors = [];
    if (!DATE_RE.test(date))              errors.push(`invalid date "${date}" — use YYYY-MM-DD`);
    if (!VALID_TYPES.has(type))           errors.push(`type must be BUY or SELL`);
    if (!symbol)                          errors.push('symbol is empty');
    if (isNaN(quantity) || quantity <= 0) errors.push(`quantity must be > 0`);
    if (ccy && !VALID_CCY.has(ccy))       errors.push(`currency must be USD/EUR/CHF/GBP, got "${ccy}"`);

    if (errors.length) { skipped.push({ row:rowNum, symbol, reason: errors.join('; ') }); return; }

    const price = priceRaw ? parseFloat(priceRaw) : null;
    rows.push({
      date, type, symbol, name, quantity,
      price:    (price > 0) ? price : null,    // null = needs Yahoo lookup
      currency: ccy || null,                    // null = needs Yahoo lookup
      price_usd: priceUsd,
      notes,
      _row: rowNum,
    });
  });

  if (!rows.length) {
    return res.status(400).json({
      error: 'No valid rows found',
      skipped,
      hint: skipped.length ? 'Check the skipped rows for validation errors' : 'File appears empty',
    });
  }
  if (rows.length > 500) return err(res, 400, `Too many rows (${rows.length}). Maximum is 500.`);

  // ── Phase 1: Yahoo price lookup for rows missing price or currency ────────
  const needLookup = rows.filter(r => !r.price || !r.currency);
  const lookupCache = {}; // "SYMBOL|date" → { price, currency }
  const lookupFailed = [];

  for (const r of needLookup) {
    const k = `${r.symbol}|${r.date}`;
    if (!lookupCache[k]) {
      const result = await lookupPriceForImport(r.symbol, r.date);
      lookupCache[k] = result; // may be null
    }
    const lu = lookupCache[k];
    if (lu) {
      if (!r.price)    r.price    = lu.price;
      if (!r.currency) r.currency = lu.currency;
      if (lu.splitMultiplier && lu.splitMultiplier !== 1) {
        r._splitMultiplier = lu.splitMultiplier;
      }
    } else {
      lookupFailed.push({ row: r._row, symbol: r.symbol,
        reason: `Could not look up price for ${r.symbol} on ${r.date}` });
    }
  }

  // Remove rows where lookup failed
  const validRows = rows.filter(r => r.price > 0 && r.currency);
  lookupFailed.forEach(f => skipped.push(f));

  if (!validRows.length) {
    return res.status(400).json({
      error: 'No rows could be imported — price lookup failed for all rows',
      skipped: [...skipped, ...lookupFailed],
    });
  }

  // ── Phase 2: FX conversion to USD for non-USD rows ───────────────────────
  const fxCache = {};
  for (const r of validRows) {
    if (r.currency === 'USD') { if (!r.price_usd) r.price_usd = r.price; continue; }
    if (r.price_usd > 0) continue;
    const cacheKey = `hist_${r.date}_${r.currency}_USD`;
    const tryCache = fxCache[cacheKey] ?? db.prepare('SELECT rate FROM fx_cache WHERE pair=?').get(cacheKey)?.rate;
    if (tryCache) { r.price_usd = r.price * tryCache; fxCache[cacheKey] = tryCache; continue; }
    try {
      const fxRes = await fetch(`https://api.frankfurter.app/${r.date}?from=${r.currency}&to=USD`);
      if (fxRes.ok) {
        const fxData = await fxRes.json();
        const rate = fxData.rates?.USD;
        if (rate) {
          r.price_usd = r.price * rate;
          fxCache[cacheKey] = rate;
          db.prepare('INSERT OR REPLACE INTO fx_cache (pair, rate, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
            .run(cacheKey, rate);
        }
      }
    } catch(e) { log.warn('FX lookup failed during import:', r.date, r.currency); }
    if (!r.price_usd) r.price_usd = r.price; // fallback: use local price
  }

  // ── Phase 3: Insert ───────────────────────────────────────────────────────
  const inserted = [];
  const insertTx = db.prepare(`
    INSERT INTO transactions (portfolio_id, symbol, name, quantity, price, price_usd, date, type, currency, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMany = db.transaction((rows) => {
    for (const r of rows) {
      const result = insertTx.run(pid, r.symbol, r.name, r.quantity, r.price,
        r.price_usd || r.price, r.date, r.type, r.currency, r.notes);
      inserted.push({ id: result.lastInsertRowid, symbol: r.symbol, date: r.date });
    }
  });

  try {
    insertMany(validRows);
  } catch(e) {
    return err(res, 500, 'Database error during import: ' + e.message);
  }

  const priceLookedUp  = needLookup.filter(r => validRows.includes(r)).length;
  const splitAdjusted  = validRows.filter(r => r._splitMultiplier && r._splitMultiplier !== 1).length;
  log.info(`Import: ${inserted.length} rows into portfolio ${pid} (${port.name}), ${priceLookedUp} prices from Yahoo, ${splitAdjusted} split-adjusted`);
  res.json({
    imported: inserted.length,
    skipped:  skipped.length,
    skippedRows: skipped,
    priceLookedUp,
    splitAdjusted,
    portfolio: { id: port.id, name: port.name },
  });
});
