/**
 * Portfolio Tracker v3 — Multi-User / Multi-Portfolio
 * React + D3 + Lucide Icons
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import * as d3 from "d3";
import {
  PanelLeft, LayoutDashboard, BarChart2, List, Layers, GitMerge,
  RefreshCw, Settings, LogOut, Plus, CheckSquare, Square, Pencil,
  User, Lock, Eye, EyeOff, Trash2, Edit2, X, AlertCircle,
  ChevronLeft, Search, TrendingUp, FileDown, Upload, FileUp,
  GitFork, Sigma, CalendarDays, Target, PieChart, ArrowLeftRight,
  Gauge, Armchair, Info,
} from "lucide-react";
import { CircleFlag } from "react-circle-flags";
import { CorrelationMatrix, MonteCarlo, RebalancingAssistant, DividendCalendar } from "./Analytics.jsx";


// ─── Theme ───────────────────────────────────────────────────────────────────
const THEME = {
  bg:       "#0d0e12",
  surface:  "#13141a",
  surface2: "#1a1b23",
  border:   "rgba(255,255,255,0.10)",
  border2:  "rgba(255,255,255,0.06)",
  text1:    "#f0f1f5",
  text2:    "#b4bfcc",
  text3:    "#8896a8",
  accent:   "#3b82f6",
  green:    "#4ade80",
  red:      "#f87171",
  yellow:   "#fbbf24",
  font:     "'Syne', sans-serif",
  mono:     "'JetBrains Mono', monospace",
  serif:    "'DM Serif Display', Georgia, serif",
};

const RAIL_COLLAPSED = 52;
const RAIL_EXPANDED  = 224;

const PORTFOLIO_COLORS = [
  "#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444",
  "#06b6d4","#f97316","#84cc16","#ec4899","#6366f1",
];

const CCY_SYM   = { USD:"$", EUR:"€", CHF:"Fr", GBP:"£" };
const CCY_FLAG  = { USD:"us", EUR:"eu", CHF:"ch", GBP:"gb" };
const CCY_NAME  = { USD:"US Dollar", EUR:"Euro", CHF:"Swiss Franc", GBP:"Pound Sterling" };

// ─── Global Styles (injected once at mount) ──────────────────────────────────
function useGlobalStyles() {
  useEffect(() => {
    if (document.getElementById("ptv3-global")) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@400;600;700&family=DM+Serif+Display:ital@0;1&display=swap";
    document.head.appendChild(link);
    const s = document.createElement("style");
    s.id = "ptv3-global";
    s.textContent = `
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      html { height: 100%; }
      body { height: 100%; overflow: hidden; }
      
      /* ── Pro mode (default): compact information density ── */
      :root { --fs-base: 13px; --fs-scale: 1; }
      body {
        background: #0d0e12; color: #f0f1f5; font-family: 'Syne', sans-serif;
        font-size: var(--fs-base); -webkit-font-smoothing: antialiased;
        transition: font-size 0.25s ease;
      }
      
      /* ── Comfort mode: WCAG AA compliant scaling ── */
      /* Zoom applied to body so ALL content scales uniformly:
         - ETF Explorer, Portfolio View, Login, Modals — everything
         - CSS zoom scales all px dimensions (inline styles, SVG, D3, etc.)
         - width/height compensation prevents scrollbars from appearing */
      body[data-mode="comfort"] {
        --fs-base: 16px;
        zoom: 1.18;
        width: calc(100vw / 1.18);
        height: calc(100vh / 1.18);
        overflow: hidden;
      }
      
      button { font-family: inherit; }
      .mono { font-family: 'JetBrains Mono', monospace; }
      .spin { display: inline-block; animation: ptv3spin 0.9s linear infinite; }
      @keyframes ptv3spin { to { transform: rotate(360deg); } }
      @keyframes ptv3pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
      .pulse { animation: ptv3pulse 1.4s ease-in-out infinite; }
      ::-webkit-scrollbar { width: 4px; height: 4px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }
      input[type=number]::-webkit-inner-spin-button { opacity: 0.4; }
      /* Rail button hover */
      .rail-btn:hover { background: rgba(59,130,246,0.08) !important; color: #3b82f6 !important; }
      .rail-btn:hover .rail-icon { color: #3b82f6 !important; }
      /* Currency button hover */
      .ccy-btn:hover { background: rgba(59,130,246,0.08) !important; }
      .ccy-btn:hover .ccy-flag { opacity: 1 !important; }
      .ccy-btn:hover .ccy-label { color: #3b82f6 !important; }
      .ccy-btn:hover .ccy-name  { color: #3b82f6 !important; }
      /* Global smooth transitions for all interactive elements */
      button { transition: background 0.3s ease, color 0.3s ease, border-color 0.3s ease, opacity 0.3s ease, transform 0.3s ease; }
      /* Tab active indicator slide animation */
      .tab-pill { transition: background 0.3s ease, color 0.3s ease, font-weight 0.15s; }
    `;
    document.head.appendChild(s);
  }, []);
}

// ── Display mode hook: "pro" (compact) | "comfort" (A11Y-friendly) ──────────
function useDisplayMode() {
  const [mode, setModeState] = useState(() => {
    // Apply synchronously on init to avoid flash of wrong mode
    const saved = localStorage.getItem("ptv3-display-mode") || "pro";
    // Set on BOTH html and body — html for zoom scope, body as fallback
    document.documentElement.setAttribute("data-mode", saved);
    document.body.setAttribute("data-mode", saved);
    return saved;
  });

  // Keep attributes in sync with state
  useEffect(() => {
    document.documentElement.setAttribute("data-mode", mode);
    document.body.setAttribute("data-mode", mode);
    localStorage.setItem("ptv3-display-mode", mode);
  }, [mode]);

  const setMode = (m) => setModeState(m);
  const toggle  = () => setModeState(m => m === "pro" ? "comfort" : "pro");

  return { mode, setMode, toggle };
}


// ─── API Helpers ─────────────────────────────────────────────────────────────
const BASE = "/api";
async function apiFetch(path, opts = {}) {
  const { isForm, headers: extraHeaders, ...fetchOpts } = opts;
  const headers = isForm
    ? (extraHeaders || {})  // let browser set multipart boundary
    : { "Content-Type": "application/json", ...(extraHeaders || {}) };
  const res = await fetch(BASE + path, { headers, ...fetchOpts });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

const etfApi = {
  list:   (userId)           => apiFetch(`/user/etfs?uid=${userId}`, { headers:{ 'x-user-id': String(userId) } }),
  save:   (userId, etf)      => apiFetch(`/user/etfs?uid=${userId}`, {
                                  method:"POST",
                                  body: JSON.stringify({ ticker: etf.ticker, name: etf.name||null, provider: etf.provider||null }),
                                  headers:{ 'x-user-id': String(userId), 'Content-Type': 'application/json' },
                                }),
  remove: (userId, ticker)   => apiFetch(`/user/etfs/${encodeURIComponent(ticker)}?uid=${userId}`,
                                  { method:"DELETE", headers:{ 'x-user-id': String(userId) } }),
};

const userApi = {
  register: (username, pin)   => apiFetch("/users/register",   { method:"POST", body: JSON.stringify({ username, pin }) }),
  login:    (username, pin)   => apiFetch("/users/login",       { method:"POST", body: JSON.stringify({ username, pin }) }),
  portfolios: (uid)           => apiFetch(`/users/${uid}/portfolios`),
  createPortfolio: (uid, name, color) => apiFetch(`/users/${uid}/portfolios`, { method:"POST", body: JSON.stringify({ name, color }) }),
  renamePortfolio: (pid, name) => apiFetch(`/portfolios/${pid}`, { method:"PUT", body: JSON.stringify({ name }) }),
  settings: (uid)             => apiFetch(`/users/${uid}/settings`),
  saveSettings: (uid, s)      => apiFetch(`/users/${uid}/settings`, { method:"PUT", body: JSON.stringify(s) }),
};
const txApi = {
  list:      (pid)     => apiFetch(`/portfolios/${pid}/transactions`),
  add:       (pid, tx) => apiFetch(`/portfolios/${pid}/transactions`, { method:"POST", body: JSON.stringify(tx) }),
  update:    (id, tx)  => apiFetch(`/transactions/${id}`,            { method:"PUT",  body: JSON.stringify(tx) }),
  delete:    (id)      => apiFetch(`/transactions/${id}`,            { method:"DELETE" }),
  recalcFX:  ()        => apiFetch(`/transactions/recalculate-fx`,   { method:"POST" }),
  exportCsv:   async (pid, userId) => {
    const res = await fetch(`/api/portfolios/${pid}/export?uid=${userId}`,
      { headers: { 'x-user-id': String(userId) } });
    if (!res.ok) {
      const ct = res.headers.get('content-type') || '';
      const b  = ct.includes('json') ? await res.json().catch(()=>({})) : {};
      throw new Error(b.error || `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const cd   = res.headers.get('content-disposition') || '';
    const name = cd.match(/filename="([^"]+)"/)?.[1] || 'export.csv';
    return { blob, name };
  },
  importXlsx:  (pid, file, userId)  => {
    const fd = new FormData(); fd.append("file", file);
    return apiFetch(`/portfolios/${pid}/import`, { method:"POST", body:fd, isForm:true,
      headers:{ "x-user-id": String(userId) } });
  },
  importTemplate: () => `/api/portfolios/import/template`,
  importPreview: (pid, file, userId) => {
    const fd = new FormData(); fd.append("file", file);
    return apiFetch(`/portfolios/${pid}/import/preview`, { method:"POST", body:fd, isForm:true,
      headers:{ "x-user-id": String(userId) } });
  },
  importSelective: (pid, rows, userId) =>
    apiFetch(`/portfolios/${pid}/import/selective`, { method:"POST", body: JSON.stringify({ rows }),
      headers:{ "x-user-id": String(userId) } }),
};
const plansApi = {
  list:   (pid)          => apiFetch(`/portfolios/${pid}/plans`),
  create: (pid, data)    => apiFetch(`/portfolios/${pid}/plans`,  { method:"POST",   body: JSON.stringify(data) }),
  update: (planId, data) => apiFetch(`/plans/${planId}`,          { method:"PUT",    body: JSON.stringify(data) }),
  delete: (planId)       => apiFetch(`/plans/${planId}`,          { method:"DELETE" }),
};
const quotesApi = {
  batch: (symbols, source, apiKey, force=false) => apiFetch("/quotes/batch", {
    method: "POST",
    body: JSON.stringify({ symbols, source, apiKey, force }),
  }),
  raw: (symbol, refresh=false, range="2y", interval="1d") =>
    apiFetch(`/quotes/yahoo/${symbol}${refresh?"?refresh=1":""}${range!=="2y"?`${refresh?"&":"?"}range=${range}`:""}${interval!=="1d"?`&interval=${interval}`:""}`),
  lookup:       (symbol, date)         => apiFetch(`/quotes/lookup/${symbol}/${date}`),
  historyMulti:        (symbols, range="2y") => apiFetch("/quotes/history-multi",         { method:"POST", body: JSON.stringify({ symbols, range }) }),
  historyMultiIntraday:(symbols)            => apiFetch("/quotes/history-multi-intraday", { method:"POST", body: JSON.stringify({ symbols }) }),
  dividendsMulti: (symbols, range="2y") => apiFetch("/quotes/dividends-multi", { method:"POST", body: JSON.stringify({ symbols, range }) }),
};
const fxApi = {
  all:        ()               => apiFetch("/fx/all"),
  historical: (date, from, to) => apiFetch(`/fx/historical/${date}/${from}/${to}`),
};
const avApi = { usage: () => apiFetch("/av/usage") };

// ─── Global Dividend Cache ────────────────────────────────────────────────────
// Singleton shared between Portfolio and ETF Explorer — avoids duplicate fetches.
// sessionStorage-backed: survives tab switches/re-renders, cleared on page reload.
const _divMem   = {};         // in-memory: { symbol → data }
const _divPend  = new Set();  // in-flight symbols
const DIV_SESSION_PREFIX = 'div_';

// Restore from sessionStorage on first load
try {
  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith(DIV_SESSION_PREFIX)) {
      const sym = key.slice(DIV_SESSION_PREFIX.length);
      _divMem[sym] = JSON.parse(sessionStorage.getItem(key));
    }
  }
} catch {}

// globalDivCache implemented as plain functions (avoids self-reference TDZ in minified builds)
function _divGet(sym)  { return _divMem[sym]; }
function _divHas(sym)  { return sym in _divMem; }
function _divFetch(sym) {
  if (_divMem[sym] !== undefined) return Promise.resolve(_divMem[sym]);
  if (_divPend.has(sym)) {
    return new Promise(resolve => {
      const poll = setInterval(() => {
        if (_divMem[sym] !== undefined) { clearInterval(poll); resolve(_divMem[sym]); }
      }, 50);
    });
  }
  _divPend.add(sym);
  return fetch(`/api/quotes/dividend/${encodeURIComponent(sym)}`)
    .then(r => r.json())
    .then(d => {
      _divMem[sym] = d;
      try { sessionStorage.setItem(DIV_SESSION_PREFIX + sym, JSON.stringify(d)); } catch {}
      return d;
    })
    .catch(() => { _divMem[sym] = null; return null; })
    .finally(() => _divPend.delete(sym));
}
function _divPrefetch(symbols) {
  const missing = symbols.filter(s => !_divHas(s));
  if (!missing.length) return;
  missing.forEach(s => _divPend.add(s));
  fetch('/api/quotes/dividend/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbols: missing }),
  })
    .then(r => r.json())
    .then(({ results = {} }) => {
      for (const [sym, data] of Object.entries(results)) {
        _divMem[sym] = data;
        try { sessionStorage.setItem(DIV_SESSION_PREFIX + sym, JSON.stringify(data)); } catch {}
        _divPend.delete(sym);
      }
    })
    .catch(() => {
      missing.forEach(s => { _divPend.delete(s); _divFetch(s); });
    });
}
const globalDivCache = { get: _divGet, has: _divHas, fetch: _divFetch, prefetch: _divPrefetch };

// ─── useDivCache hook — React-reactive wrapper around globalDivCache ────────────
// Returns a {symbol: data} object that triggers re-renders as div data arrives.
function useDivCache(symbols) {
  const [cache, setCache] = useState(() => {
    // Initialize from already-loaded globalDivCache entries
    const init = {};
    for (const s of (symbols ?? [])) {
      if (globalDivCache.has(s)) init[s] = globalDivCache.get(s);
    }
    return init;
  });

  useEffect(() => {
    if (!symbols?.length) return;
    let cancelled = false;
    const missing = symbols.filter(s => !globalDivCache.has(s));
    // Immediately populate from cache for already-loaded
    setCache(prev => {
      const next = { ...prev };
      for (const s of symbols) {
        if (globalDivCache.has(s) && !(s in next)) next[s] = globalDivCache.get(s);
      }
      return next;
    });
    // Fetch missing ones and update state when they arrive
    Promise.all(missing.map(s =>
      globalDivCache.fetch(s).then(d => {
        if (!cancelled) setCache(prev => ({ ...prev, [s]: d }));
      })
    ));
    return () => { cancelled = true; };
  }, [symbols?.join(',')]); // eslint-disable-line

  return cache;
}

// ─── Global Chart Data Cache ──────────────────────────────────────────────────
// Shared chartDataMap ref — ETF Explorer and Portfolio share the same cache.
// Raw Yahoo chart JSON is large (2y daily ~50KB per symbol) so we store in memory
// only (not sessionStorage). Survives within a session without re-fetching.
const _chartMem   = {};   // { symbol → raw Yahoo JSON, symbol_1d → intraday }
const _chartPend  = new Set();

function _chartGet(key)        { return _chartMem[key]; }
function _chartHas(key)        { return key in _chartMem; }
function _chartSet(key, data)  { _chartMem[key] = data; }
function _chartPrefetch(sym) {
  const dailyKey = sym, intradayKey = `${sym}_1d`;
  if (_chartMem[dailyKey] && _chartMem[intradayKey]) return;
  if (_chartPend.has(sym)) return;
  _chartPend.add(sym);
  Promise.all([
    _chartMem[dailyKey]    ? null : quotesApi.raw(sym).catch(() => null),
    _chartMem[intradayKey] ? null : quotesApi.raw(sym, false, '2d', '5m').catch(() => null),
  ]).then(([daily, intraday]) => {
    if (daily)    _chartMem[dailyKey]    = daily;
    if (intraday) _chartMem[intradayKey] = intraday;
  }).finally(() => _chartPend.delete(sym));
}
const globalChartCache = { get: _chartGet, has: _chartHas, set: _chartSet, prefetch: _chartPrefetch };

// ─── Utilities ────────────────────────────────────────────────────────────────
function fmtPct(v, dec=2) {
  if (v == null || isNaN(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(dec)}%`;
}
function fmtVal(usd, ccy, rates, compact=false) {
  const rate = rates[ccy] ?? 1;
  const sym  = CCY_SYM[ccy] ?? "$";
  const val  = usd * rate;
  if (compact) {
    if (Math.abs(val) >= 1e6) return `${sym}${(val/1e6).toFixed(2)}M`;
    if (Math.abs(val) >= 1e3) return `${sym}${(val/1e3).toFixed(1)}K`;
  }
  return `${sym}${val.toLocaleString("en-US", { minimumFractionDigits:2, maximumFractionDigits:2 })}`;
}

const PERF_COLORS = [
  { t:  5.0, c: [  8, 112,  60] },
  { t:  2.0, c: [ 12,  90,  48] },
  { t:  0.5, c: [ 16,  72,  38] },
  { t:  0.0, c: [ 20,  55,  30] },
  { t: -0.5, c: [ 90,  22,  22] },
  { t: -2.0, c: [115,  15,  15] },
  { t: -5.0, c: [140,   8,   8] },
];
function getPerfColor(perf) {
  if (perf == null) return "rgba(40,42,54,0.95)";
  const sorted = [...PERF_COLORS].sort((a,b) => b.t - a.t);
  for (let i = 0; i < sorted.length - 1; i++) {
    const hi = sorted[i], lo = sorted[i+1];
    if (perf >= lo.t) {
      const t = (perf - lo.t) / (hi.t - lo.t);
      const r = Math.round(lo.c[0] + (hi.c[0]-lo.c[0])*t);
      const g = Math.round(lo.c[1] + (hi.c[1]-lo.c[1])*t);
      const b = Math.round(lo.c[2] + (hi.c[2]-lo.c[2])*t);
      return `rgba(${r},${g},${b},0.92)`;
    }
  }
  return `rgba(${sorted[sorted.length-1].c.join(",")},0.92)`;
}

function useSize(ref) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

const PERIODS = [
  { key:"Intraday", label:"1D"  },
  { key:"1W",       label:"1W"  },
  { key:"1M",       label:"1M"  },
  { key:"6M",       label:"6M"  },
  { key:"YTD",      label:"YTD" },
  { key:"1Y",       label:"1Y"  },
  { key:"2Y",       label:"2Y"  },
  { key:"Max",      label:"Max" },
];
// Map PERIODS keys → Yahoo Finance range strings used by history-multi / dividends-multi
const PERIOD_TO_RANGE = {
  "Intraday": "5d",
  "1W":       "5d",
  "1M":       "1mo",
  "6M":       "6mo",
  "YTD":      "ytd",
  "1Y":       "1y",
  "2Y":       "2y",
  "Max":      "max",
};

// ─── Small UI Helpers ─────────────────────────────────────────────────────────
function RefreshIconButton({ onClick, loading }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      disabled={loading}
      title="Refresh Quotes"
      style={{
        display:"flex", alignItems:"center", gap:5,
        padding: hov ? "4px 10px" : "4px 7px",
        borderRadius:8, border:`1px solid ${hov ? THEME.accent+"66" : THEME.border}`,
        background: hov ? "rgba(59,130,246,0.12)" : "transparent",
        color: loading ? THEME.text3 : hov ? THEME.accent : THEME.text3,
        cursor: loading ? "not-allowed" : "pointer",
        fontSize:11, fontFamily:"inherit", fontWeight:600,
        transition:"all 0.15s", whiteSpace:"nowrap", overflow:"hidden",
        maxWidth: hov ? 100 : 28,
      }}>
      {loading
        ? <span className="spin" style={{display:"flex"}}><RefreshCw size={13}/></span>
        : <RefreshCw size={13}/>}
      <span style={{
        maxWidth: hov ? 60 : 0, opacity: hov ? 1 : 0,
        overflow:"hidden", transition:"max-width 0.18s, opacity 0.15s", whiteSpace:"nowrap",
      }}>Refresh</span>
    </button>
  );
}

const FLabel = ({ children }) => (
  <div style={{ fontSize:10, fontWeight:700, color:THEME.text3, textTransform:"uppercase",
                letterSpacing:"0.08em", marginBottom:5 }}>{children}</div>
);
const FInput = ({ style, ...props }) => (
  <input {...props} style={{
    width:"100%", padding:"10px 12px", borderRadius:10,
    border:`1px solid ${THEME.border}`, background:THEME.surface2,
    color:THEME.text1, fontSize:13, outline:"none", fontFamily:THEME.font,
    transition:"border-color 0.15s",
    ...style,
  }}
  onFocus={e => e.target.style.borderColor = THEME.accent}
  onBlur={e  => e.target.style.borderColor = THEME.border}
  />
);
const FSelect = ({ children, ...props }) => (
  <select {...props} style={{
    width:"100%", padding:"10px 12px", borderRadius:10,
    border:`1px solid ${THEME.border}`, background:THEME.surface2,
    color:THEME.text1, fontSize:13, outline:"none", fontFamily:THEME.font,
  }}>{children}</select>
);

// ─── Modal ────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, width=460 }) {
  useEffect(() => {
    const handler = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,0.65)", backdropFilter:"blur(4px)",
      display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        width, maxWidth:"95vw", maxHeight:"90vh", overflow:"auto",
        background:THEME.surface, borderRadius:18,
        border:`1px solid ${THEME.border}`,
        boxShadow:"0 32px 80px rgba(0,0,0,0.60)",
        padding:28,
      }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:22 }}>
          <div style={{ fontSize:16, fontWeight:700, color:THEME.text1 }}>{title}</div>
          <button onClick={onClose} style={{
            background:"transparent", border:"none", color:THEME.text3,
            cursor:"pointer", padding:4, borderRadius:6, display:"flex",
          }}><X size={18}/></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// LOGIN SCREEN
// ════════════════════════════════════════════════════════════════════════════
function LoginScreen({ onLogin, onEtfMode }) {
  useGlobalStyles();
  const [mode,        setMode]        = useState("login"); // "login" | "register"
  const [username,    setUsername]    = useState("");
  const [pin,         setPin]         = useState("");
  const [showPin,     setShowPin]     = useState(false);
  const [busy,        setBusy]        = useState(false);
  const [error,       setError]       = useState("");
  const [disclaimerOk, setDisclaimerOk] = useState(false);

  // Reset disclaimer when switching modes
  const switchMode = (m) => { setMode(m); setDisclaimerOk(false); setError(""); };

  const canSubmit = username.trim() && pin && !busy && (mode === "login" || disclaimerOk);

  const handle = async () => {
    if (!canSubmit) return;
    setBusy(true); setError("");
    try {
      if (mode === "register") {
        await userApi.register(username.trim(), pin);
        // Auto-login after register
      }
      const data = await userApi.login(username.trim(), pin);
      onLogin(data);
    } catch(e) { setError(e.message); }
    setBusy(false);
  };

  return (
    <div style={{
      height:"100%", display:"flex", alignItems:"center", justifyContent:"center",
      background:THEME.bg, fontFamily:THEME.font,
    }}>
      <div style={{
        width:380, padding:40, borderRadius:20,
        background:THEME.surface, border:`1px solid ${THEME.border}`,
        boxShadow:"0 32px 80px rgba(0,0,0,0.6)",
      }}>
        {/* Brand */}
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ fontFamily:THEME.serif, fontSize:28, fontWeight:400, letterSpacing:"-0.02em" }}>
            Portfolio<span style={{ color:THEME.accent, fontStyle:"italic" }}>.</span>
          </div>
          <div style={{ fontSize:11, color:THEME.text3, marginTop:4, letterSpacing:"0.06em", textTransform:"uppercase" }}>
            {mode === "login" ? "Sign in to your account" : "Create new account"}
          </div>
        </div>

        {/* Fields */}
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div>
            <FLabel>Username</FLabel>
            <div style={{ position:"relative" }}>
              <User size={14} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:THEME.text3 }}/>
              <FInput placeholder="Enter username" value={username}
                style={{ paddingLeft:34 }}
                onChange={e => { setUsername(e.target.value); setError(""); }}
                onKeyDown={e => e.key === "Enter" && handle()}/>
            </div>
          </div>
          <div>
            <FLabel>PIN</FLabel>
            <div style={{ position:"relative" }}>
              <Lock size={14} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:THEME.text3 }}/>
              <FInput type={showPin ? "text" : "password"} placeholder="Enter PIN"
                value={pin} style={{ paddingLeft:34, paddingRight:40, letterSpacing:"0.2em" }}
                onChange={e => { setPin(e.target.value); setError(""); }}
                onKeyDown={e => e.key === "Enter" && handle()}
                autoComplete={mode==="login" ? "current-password" : "new-password"}/>
              <button onClick={() => setShowPin(v => !v)} style={{
                position:"absolute", right:12, top:"50%", transform:"translateY(-50%)",
                background:"none", border:"none", cursor:"pointer", color:THEME.text3,
                display:"flex", padding:0,
              }}>{showPin ? <EyeOff size={14}/> : <Eye size={14}/>}</button>
            </div>
          </div>
        </div>

        {error && (
          <div style={{ marginTop:12, display:"flex", alignItems:"center", gap:6,
            fontSize:12, color:THEME.red }}>
            <AlertCircle size={13}/> {error}
          </div>
        )}

        {/* Disclaimer — only in register mode */}
        {mode === "register" && (
          <div onClick={() => setDisclaimerOk(v => !v)}
            style={{
              marginTop:16, display:"flex", alignItems:"flex-start", gap:10,
              padding:"10px 12px", borderRadius:10, cursor:"pointer",
              background: disclaimerOk ? "rgba(74,222,128,0.07)" : "rgba(255,255,255,0.03)",
              border:`1px solid ${disclaimerOk ? "rgba(74,222,128,0.3)" : THEME.border}`,
              transition:"background 0.3s ease, border-color 0.3s ease",
            }}>
            <div style={{
              flexShrink:0, width:16, height:16, borderRadius:4, marginTop:1,
              border:`2px solid ${disclaimerOk ? THEME.green : "rgba(255,255,255,0.25)"}`,
              background: disclaimerOk ? THEME.green : "transparent",
              display:"flex", alignItems:"center", justifyContent:"center",
              transition:"all 0.2s ease",
            }}>
              {disclaimerOk && (
                <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                  <path d="M1 3.5L3.5 6L8 1" stroke="#0d0e12" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <span style={{ fontSize:11, color: disclaimerOk ? THEME.text2 : THEME.text3, lineHeight:1.5, userSelect:"none" }}>
              For demonstration purposes only. Please do not enter personal or private data!
            </span>
          </div>
        )}

        <button onClick={handle} disabled={!canSubmit}
          style={{
            width:"100%", marginTop:16, padding:"13px 0", borderRadius:12,
            border:"none", background:THEME.accent, color:"#fff",
            fontSize:13, fontWeight:700, cursor:canSubmit ? "pointer" : "not-allowed",
            fontFamily:"inherit",
            opacity: canSubmit ? 1 : 0.4,
            boxShadow: canSubmit ? "0 4px 20px rgba(59,130,246,0.35)" : "none",
            transition:"opacity 0.3s ease, box-shadow 0.3s ease",
          }}>
          {busy ? <span className="spin">⟳</span> : mode === "login" ? "Sign In" : "Create Account & Sign In"}
        </button>

        {/* ETF Explorer — no login required */}
        <div style={{ margin:"20px 0 4px", display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ flex:1, height:1, background:THEME.border2 }}/>
          <span style={{ fontSize:10, color:THEME.text3, whiteSpace:"nowrap",
            textTransform:"uppercase", letterSpacing:"0.08em" }}>or</span>
          <div style={{ flex:1, height:1, background:THEME.border2 }}/>
        </div>
        <button onClick={onEtfMode}
          style={{
            width:"100%", marginTop:8, padding:"12px 0", borderRadius:12,
            border:`1px dashed rgba(59,130,246,0.45)`,
            background:"rgba(59,130,246,0.07)", color:THEME.accent,
            fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit",
            transition:"all 0.15s",
            display:"flex", alignItems:"center", justifyContent:"center", gap:8,
          }}>
          <span style={{ fontSize:16 }}>📊</span>
          ETF Screener <span style={{ fontSize:10, opacity:0.7 }}>— no login</span>
        </button>

        <div style={{ textAlign:"center", marginTop:16, fontSize:12, color:THEME.text3 }}>
          {mode === "login" ? (
            <>No account?{" "}
              <button onClick={() => switchMode("register")}
                style={{ background:"none", border:"none", color:THEME.accent, cursor:"pointer",
                  fontSize:12, fontFamily:"inherit", fontWeight:600 }}>Create one</button>
            </>
          ) : (
            <>Already have an account?{" "}
              <button onClick={() => switchMode("login")}
                style={{ background:"none", border:"none", color:THEME.accent, cursor:"pointer",
                  fontSize:12, fontFamily:"inherit", fontWeight:600 }}>Sign in</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// RENAME PORTFOLIO MODAL
// ════════════════════════════════════════════════════════════════════════════
function RenamePortfolioModal({ portfolio, onClose, onRename }) {
  const [name, setName] = useState(portfolio.name);
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState(null);

  const handleSave = async () => {
    if (!name.trim() || name.trim() === portfolio.name) { onClose(); return; }
    setBusy(true); setErr(null);
    try {
      await onRename(portfolio.id, name.trim());
      onClose();
    } catch(e) { setErr(e.message || "Fehler beim Umbenennen"); }
    setBusy(false);
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:THEME.surface, border:`1px solid ${THEME.border}`,
        borderRadius:16, padding:24, width:340, fontFamily:THEME.font }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
          <span style={{ fontSize:15, fontWeight:700, color:THEME.text1 }}>Portfolio umbenennen</span>
          <button onClick={onClose} style={{ background:"none", border:"none", color:THEME.text3, cursor:"pointer" }}>
            <X size={18}/>
          </button>
        </div>
        <input
          value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSave()}
          autoFocus
          style={{ width:"100%", padding:"9px 12px", borderRadius:9,
            border:`1px solid ${THEME.accent}66`, background:THEME.bg,
            color:THEME.text1, fontSize:13, fontFamily:THEME.font, outline:"none",
            boxSizing:"border-box" }}/>
        {err && <div style={{ color:THEME.red, fontSize:12, marginTop:8 }}>{err}</div>}
        <div style={{ display:"flex", gap:8, marginTop:16 }}>
          <button onClick={onClose}
            style={{ flex:1, padding:"9px 0", borderRadius:9, border:`1px solid ${THEME.border}`,
              background:"transparent", color:THEME.text2, fontSize:13, fontFamily:THEME.font, cursor:"pointer" }}>
            Abbrechen
          </button>
          <button onClick={handleSave} disabled={!name.trim() || busy}
            style={{ flex:1, padding:"9px 0", borderRadius:9, border:"none",
              background:THEME.accent, color:"#fff", fontSize:13, fontWeight:600,
              fontFamily:THEME.font, cursor: name.trim() ? "pointer" : "not-allowed",
              opacity: name.trim() ? 1 : 0.5 }}>
            {busy ? "…" : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// IMPORT / EXPORT MODAL  — with conflict resolution preview
// ════════════════════════════════════════════════════════════════════════════
const RESOLUTION_LABELS = {
  import:        { label:"Import",          color:"#3b82f6", desc:"Add as new transaction" },
  keep_existing: { label:"Behalten",        color:"#8896a8", desc:"Keep existing, skip this row" },
  overwrite:     { label:"Überschreiben",   color:"#f87171", desc:"Replace existing with imported" },
  add_new:       { label:"Als Neu",         color:"#4ade80", desc:"Add alongside existing (both kept)" },
};

function ImportExportModal({ portfolios, activePortfolioIds, user, onClose, onImportDone, onCreatePortfolio }) {
  const [tab,         setTab]         = useState("export");
  const [selPort,     setSelPort]     = useState(() => activePortfolioIds[0] ?? portfolios[0]?.id ?? "");
  const [file,        setFile]        = useState(null);
  const [importing,   setImporting]   = useState(false);
  const [previewing,  setPreviewing]  = useState(false);
  const [result,      setResult]      = useState(null);
  const [importErr,   setImportErr]   = useState(null);
  const [previewData, setPreviewData] = useState(null);  // { preview, skipped, conflictCount, newCount }
  const [resolutions, setResolutions] = useState({});    // { rowIndex: resolution }
  const [filterMode,  setFilterMode]  = useState("all"); // all|conflicts|new
  const [newPortName, setNewPortName] = useState("");     // for "new portfolio" option
  const [creatingPort, setCreatingPort] = useState(false);
  const fileRef = useRef(null);

  // Resolve selPort: could be an id (number) or "new" sentinel
  const isNewPort = selPort === "new";
  const effectivePort = isNewPort ? null : selPort;
  const selectedPort = portfolios.find(p => p.id === Number(selPort) || p.id === selPort);

  // ── Export ────────────────────────────────────────────────────────────────
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState(null);

  const handleExport = async () => {
    if (!selPort || !user) return;
    setExporting(true); setExportErr(null);
    try {
      const { blob, name } = await txApi.exportCsv(selPort, user.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch(e) { setExportErr(e.message || "Export failed"); }
    setExporting(false);
  };

  // ── Preview / Import flow ─────────────────────────────────────────────────
  const handlePreview = async () => {
    if (!file || !effectivePort) return;
    setPreviewing(true); setPreviewData(null); setImportErr(null); setResult(null);
    try {
      const data = await txApi.importPreview(effectivePort, file, user?.id);
      setPreviewData(data);
      // Set default resolutions
      const defaults = {};
      data.preview.forEach((row, i) => {
        defaults[i] = row.conflict ? "keep_existing" : "import";
      });
      setResolutions(defaults);
    } catch(e) { setImportErr(e.message || "Preview failed"); }
    setPreviewing(false);
  };

  const handleConfirmImport = async () => {
    if (!previewData || !effectivePort) return;
    setImporting(true); setImportErr(null);
    try {
      const rows = previewData.preview.map((row, i) => ({
        ...row,
        resolution: resolutions[i] ?? (row.conflict ? "keep_existing" : "import"),
      }));
      const data = await txApi.importSelective(effectivePort, rows, user?.id);
      setResult(data);
      setPreviewData(null);
      if (data.imported > 0) onImportDone(effectivePort);
    } catch(e) { setImportErr(e.message || "Import failed"); }
    setImporting(false);
  };

  const setAllConflicts = (resolution) => {
    if (!previewData) return;
    setResolutions(prev => {
      const next = { ...prev };
      previewData.preview.forEach((row, i) => { if (row.conflict) next[i] = resolution; });
      return next;
    });
  };

  const isValidFile = (f) => f && (f.name.endsWith('.xlsx') || f.name.endsWith('.csv'));
  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (isValidFile(f)) { setFile(f); setPreviewData(null); setResult(null); setImportErr(null); }
  };

  const btnStyle = (active) => ({
    flex:1, padding:"8px 0", border:"none", cursor:"pointer",
    borderRadius:8, fontSize:12, fontWeight:700, fontFamily:"inherit",
    background: active ? THEME.accent : "rgba(255,255,255,0.05)",
    color: active ? "#fff" : THEME.text3, transition:"all 0.15s",
  });

  const handleCreatePort = async () => {
    if (!newPortName.trim() || !user) return;
    setCreatingPort(true);
    try {
      const port = await userApi.createPortfolio(user.id, newPortName.trim(), '#3b82f6');
      if (onCreatePortfolio) onCreatePortfolio(port);
      setSelPort(port.id);
      setNewPortName("");
    } catch(e) { setImportErr(e.message || "Portfolio konnte nicht erstellt werden"); }
    setCreatingPort(false);
  };

  // PortSelect rendered as JSX variable (NOT a sub-component) to avoid focus loss on re-render
  const portSelectJsx = (
    <div style={{ marginBottom:16 }}>
      <label style={{ fontSize:11, color:THEME.text3, display:"block", marginBottom:5 }}>Portfolio</label>
      <select value={selPort} onChange={e => { setSelPort(e.target.value); setPreviewData(null); setResult(null); setNewPortName(""); }}
        style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:`1px solid ${THEME.border}`,
          background:THEME.bg, color:THEME.text1, fontSize:12, fontFamily:"inherit", outline:"none" }}>
        {portfolios.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        <option value="new">＋ Neues Portfolio anlegen…</option>
      </select>
      {isNewPort && (
        <div style={{ display:"flex", gap:8, marginTop:8 }}>
          <input
            autoFocus
            value={newPortName} onChange={e => setNewPortName(e.target.value)}
            placeholder="Name des neuen Portfolios"
            onKeyDown={e => e.key === "Enter" && handleCreatePort()}
            style={{ flex:1, padding:"7px 10px", borderRadius:8, border:`1px solid ${THEME.accent}66`,
              background:THEME.bg, color:THEME.text1, fontSize:12, fontFamily:"inherit", outline:"none" }}/>
          <button onClick={handleCreatePort} disabled={!newPortName.trim() || creatingPort}
            style={{ padding:"7px 14px", borderRadius:8, border:"none",
              background:THEME.accent, color:"#fff", fontSize:12, fontWeight:600,
              cursor: newPortName.trim() ? "pointer" : "not-allowed", fontFamily:"inherit",
              opacity: newPortName.trim() ? 1 : 0.5 }}>
            {creatingPort ? "…" : "Anlegen"}
          </button>
        </div>
      )}
    </div>
  );

  // Filtered preview rows
  const filteredRows = previewData?.preview.filter((row, i) => {
    if (filterMode === "conflicts") return row.conflict;
    if (filterMode === "new") return !row.conflict;
    return true;
  }) ?? [];

  const filteredIndices = previewData?.preview.reduce((acc, row, i) => {
    if (filterMode === "all") acc.push(i);
    else if (filterMode === "conflicts" && row.conflict) acc.push(i);
    else if (filterMode === "new" && !row.conflict) acc.push(i);
    return acc;
  }, []) ?? [];

  // Summary of what will happen
  const willImport    = previewData?.preview.filter((r,i) => ["import","add_new","overwrite"].includes(resolutions[i])).length ?? 0;
  const willSkip      = previewData?.preview.filter((r,i) => ["keep_existing","skip"].includes(resolutions[i])).length ?? 0;
  const willOverwrite = previewData?.preview.filter((r,i) => resolutions[i]==="overwrite").length ?? 0;

  const ResolutionPill = ({ value, onChange }) => (
    <div style={{ display:"flex", gap:3 }}>
      {Object.entries(RESOLUTION_LABELS).map(([key, { label, color }]) => (
        <button key={key} onClick={() => onChange(key)} style={{
          padding:"2px 7px", borderRadius:5, border:`1px solid ${value===key?color:THEME.border}`,
          background:value===key?`${color}22`:"transparent",
          color:value===key?color:THEME.text3,
          fontSize:9, fontWeight:700, cursor:"pointer", fontFamily:"inherit",
          textTransform:"uppercase", letterSpacing:"0.04em", whiteSpace:"nowrap",
          transition:"all 0.1s",
        }}>{label}</button>
      ))}
    </div>
  );

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.72)",
      backdropFilter:"blur(6px)", display:"flex", alignItems:"center",
      justifyContent:"center", zIndex:2000 }}
      onClick={e => { if (e.target===e.currentTarget) onClose(); }}>

      {/* Modal — wider when showing preview */}
      <div style={{
        width: previewData ? Math.min(900, window.innerWidth-40) : 440,
        maxHeight: "90vh", background:THEME.surface, borderRadius:18,
        border:`1px solid ${THEME.border}`, boxShadow:"0 32px 80px rgba(0,0,0,0.7)",
        display:"flex", flexDirection:"column", overflow:"hidden",
        transition:"width 0.3s ease",
      }}>
        {/* Header */}
        <div style={{ padding:"20px 24px 0", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
            <div style={{ fontSize:15, fontWeight:700, color:THEME.text1 }}>Import / Export</div>
            <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer",
              color:THEME.text3, display:"flex", padding:4, borderRadius:7 }}>
              <X size={16}/>
            </button>
          </div>
          <div style={{ display:"flex", gap:6, padding:4, background:"rgba(0,0,0,0.3)", borderRadius:10, marginBottom:16 }}>
            <button style={btnStyle(tab==="export")} onClick={()=>{ setTab("export"); setPreviewData(null); setResult(null); }}>
              <FileDown size={13} style={{marginRight:5,verticalAlign:"middle"}}/> Export Excel
            </button>
            <button style={btnStyle(tab==="import")} onClick={()=>{ setTab("import"); setPreviewData(null); setResult(null); }}>
              <Upload size={13} style={{marginRight:5,verticalAlign:"middle"}}/> Import Excel
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:"auto", padding:"0 24px 20px" }}>

          {/* ── EXPORT TAB ─────────────────────────────────────────────────── */}
          {tab === "export" && (
            <div>
              {portSelectJsx}
              <p style={{ fontSize:11, color:THEME.text3, margin:"0 0 16px", lineHeight:1.5 }}>
                Downloads alle Transaktionen des gewählten Portfolios als Excel-Datei. Kann in ein anderes Portfolio re-importiert werden.
              </p>
              {exportErr && (
                <div style={{ padding:"8px 10px", borderRadius:8, marginBottom:10,
                  background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)",
                  fontSize:11, color:THEME.red }}><AlertCircle size={12}/> {exportErr}</div>
              )}
              <button onClick={handleExport} disabled={!selPort||exporting}
                style={{ width:"100%", padding:"11px 0", borderRadius:10, border:"none",
                  background:THEME.accent, color:"#fff", fontSize:13, fontWeight:700,
                  cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center",
                  justifyContent:"center", gap:8, opacity:(!selPort||exporting)?0.4:1 }}>
                {exporting
                  ? <><span className="spin" style={{display:"flex"}}><RefreshCw size={15}/></span> Exportiere…</>
                  : <><FileDown size={15}/> {selectedPort ? `"${selectedPort.name}" als CSV laden` : "Portfolio wählen"}</>}
              </button>
            </div>
          )}

          {/* ── IMPORT TAB ─────────────────────────────────────────────────── */}
          {tab === "import" && !previewData && !result && (
            <div>
              {portSelectJsx}
              {/* Template */}}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                padding:"8px 12px", borderRadius:8, background:"rgba(59,130,246,0.08)",
                border:`1px solid rgba(59,130,246,0.2)`, marginBottom:14 }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:600, color:THEME.accent }}>Import-Vorlage</div>
                  <div style={{ fontSize:10, color:THEME.text3, marginTop:1 }}>Excel mit Anleitung und Dropdown-Validierung</div>
                </div>
                <a href={txApi.importTemplate()} download
                  style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 12px",
                    borderRadius:8, border:`1px solid ${THEME.accent}`,
                    color:THEME.accent, fontSize:11, fontWeight:600,
                    textDecoration:"none", background:"transparent", whiteSpace:"nowrap" }}>
                  <FileDown size={12}/> Vorlage
                </a>
              </div>
              {/* Drop zone */}
              <div onDragOver={e=>e.preventDefault()} onDrop={handleDrop}
                onClick={()=>fileRef.current?.click()}
                style={{ border:`2px dashed ${file ? THEME.accent : THEME.border}`,
                  borderRadius:10, padding:"20px 16px", textAlign:"center",
                  cursor:"pointer", background: file?"rgba(59,130,246,0.06)":"transparent",
                  transition:"all 0.15s", marginBottom:14 }}>
                <input ref={fileRef} type="file" accept=".xlsx,.csv" style={{ display:"none" }}
                  onChange={e=>{ const f=e.target.files[0]; if(isValidFile(f)){setFile(f);setPreviewData(null);setResult(null);setImportErr(null);}}}/>
                {file ? (
                  <div>
                    <FileUp size={20} style={{ color:THEME.accent, marginBottom:4 }}/>
                    <div style={{ fontSize:12, fontWeight:600, color:THEME.text1 }}>{file.name}</div>
                    <div style={{ fontSize:10, color:THEME.text3, marginTop:2 }}>{(file.size/1024).toFixed(1)} KB — klicken zum Ändern</div>
                  </div>
                ) : (
                  <div>
                    <Upload size={20} style={{ color:THEME.text3, marginBottom:6 }}/>
                    <div style={{ fontSize:12, color:THEME.text2 }}>xlsx/csv hier ablegen oder klicken</div>
                    <div style={{ fontSize:10, color:THEME.text3, marginTop:4 }}>Importvorlage und exportierte Dateien werden unterstützt</div>
                  </div>
                )}
              </div>
              {importErr && (
                <div style={{ padding:"8px 10px", borderRadius:8, marginBottom:12,
                  background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)",
                  fontSize:11, color:THEME.red, display:"flex", gap:7 }}>
                  <AlertCircle size={13} style={{flexShrink:0,marginTop:1}}/> {importErr}
                </div>
              )}
              <button onClick={handlePreview} disabled={!file || !selPort || previewing}
                style={{ width:"100%", padding:"11px 0", borderRadius:10, border:"none",
                  background: file&&selPort ? THEME.accent : "rgba(255,255,255,0.05)",
                  color: file&&selPort ? "#fff" : THEME.text3, fontSize:13, fontWeight:700,
                  cursor: file&&selPort ? "pointer" : "default", fontFamily:"inherit",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                  transition:"all 0.15s" }}>
                {previewing
                  ? <><span className="spin" style={{display:"flex"}}><RefreshCw size={14}/></span> Analysiere…</>
                  : <><Search size={14}/> Prüfen &amp; Vorschau</>}
              </button>
            </div>
          )}

          {/* ── PREVIEW / CONFLICT RESOLUTION ──────────────────────────────── */}
          {tab === "import" && previewData && !result && (
            <div>
              {/* Summary bar */}
              <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
                <div style={{ padding:"8px 12px", borderRadius:8, background:"rgba(59,130,246,0.1)",
                  border:"1px solid rgba(59,130,246,0.2)", flex:"1 1 0", minWidth:100 }}>
                  <div style={{ fontSize:9, color:THEME.text3, textTransform:"uppercase",
                    letterSpacing:"0.07em" }}>Gesamt</div>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:16,
                    fontWeight:700, color:THEME.text1 }}>{previewData.preview.length}</div>
                </div>
                <div style={{ padding:"8px 12px", borderRadius:8, background:"rgba(74,222,128,0.08)",
                  border:"1px solid rgba(74,222,128,0.2)", flex:"1 1 0", minWidth:100 }}>
                  <div style={{ fontSize:9, color:THEME.text3, textTransform:"uppercase",
                    letterSpacing:"0.07em" }}>Neu</div>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:16,
                    fontWeight:700, color:THEME.green }}>{previewData.newCount}</div>
                </div>
                <div style={{ padding:"8px 12px", borderRadius:8,
                  background:previewData.conflictCount>0?"rgba(248,113,113,0.08)":"rgba(255,255,255,0.03)",
                  border:previewData.conflictCount>0?"1px solid rgba(248,113,113,0.25)":"1px solid rgba(255,255,255,0.06)",
                  flex:"1 1 0", minWidth:100 }}>
                  <div style={{ fontSize:9, color:THEME.text3, textTransform:"uppercase",
                    letterSpacing:"0.07em" }}>Konflikte</div>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:16,
                    fontWeight:700, color:previewData.conflictCount>0?THEME.red:THEME.text3 }}>
                    {previewData.conflictCount}
                  </div>
                </div>
                {previewData.skipped.length > 0 && (
                  <div style={{ padding:"8px 12px", borderRadius:8, background:"rgba(251,191,36,0.08)",
                    border:"1px solid rgba(251,191,36,0.2)", flex:"1 1 0", minWidth:100 }}>
                    <div style={{ fontSize:9, color:THEME.text3, textTransform:"uppercase",
                      letterSpacing:"0.07em" }}>Übersprungen</div>
                    <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:16,
                      fontWeight:700, color:THEME.yellow }}>{previewData.skipped.length}</div>
                  </div>
                )}
              </div>

              {/* Conflict bulk actions */}
              {previewData.conflictCount > 0 && (
                <div style={{ padding:"10px 12px", borderRadius:9, background:"rgba(248,113,113,0.06)",
                  border:"1px solid rgba(248,113,113,0.2)", marginBottom:12 }}>
                  <div style={{ fontSize:11, color:THEME.text2, marginBottom:8 }}>
                    ⚠ <strong>{previewData.conflictCount} Zeilen</strong> haben dieselbe Symbol+Datum+Typ Kombination wie bestehende Transaktionen.
                  </div>
                  <div style={{ fontSize:10, color:THEME.text3, marginBottom:8 }}>
                    Alle Konflikte auf einmal lösen:
                  </div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    {Object.entries(RESOLUTION_LABELS).map(([key, { label, color, desc }]) => (
                      <button key={key} onClick={() => setAllConflicts(key)} style={{
                        padding:"5px 12px", borderRadius:7, border:`1px solid ${color}40`,
                        background:`${color}12`, color, fontSize:10, fontWeight:700,
                        cursor:"pointer", fontFamily:"inherit", display:"flex",
                        flexDirection:"column", alignItems:"flex-start", gap:1,
                      }}>
                        <span>{label}</span>
                        <span style={{ fontSize:8, fontWeight:400, color:`${color}cc` }}>{desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Filter tabs */}
              <div style={{ display:"flex", gap:4, marginBottom:10 }}>
                {[
                  { key:"all",       label:`Alle (${previewData.preview.length})` },
                  { key:"conflicts", label:`Konflikte (${previewData.conflictCount})` },
                  { key:"new",       label:`Neu (${previewData.newCount})` },
                ].map(f => (
                  <button key={f.key} onClick={()=>setFilterMode(f.key)} style={{
                    padding:"4px 10px", borderRadius:6,
                    border:`1px solid ${filterMode===f.key?THEME.accent:THEME.border}`,
                    background:filterMode===f.key?"rgba(59,130,246,0.15)":"transparent",
                    color:filterMode===f.key?THEME.accent:THEME.text3,
                    fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"inherit",
                  }}>{f.label}</button>
                ))}
              </div>

              {/* Row table */}
              <div style={{ border:`1px solid ${THEME.border}`, borderRadius:10, overflow:"hidden", marginBottom:14 }}>
                <div style={{ maxHeight:360, overflowY:"auto" }}>
                  {/* Header */}
                  <div style={{ display:"grid", gridTemplateColumns:"80px 80px 60px 70px 70px 1fr",
                    padding:"7px 10px", background:THEME.surface2, borderBottom:`1px solid ${THEME.border2}`,
                    position:"sticky", top:0, zIndex:1 }}>
                    {["Symbol","Datum","Typ","Menge","Preis","Aktion"].map(h => (
                      <div key={h} style={{ fontSize:9, color:THEME.text3, fontWeight:700,
                        textTransform:"uppercase", letterSpacing:"0.07em" }}>{h}</div>
                    ))}
                  </div>
                  {filteredRows.length === 0 && (
                    <div style={{ padding:"16px", textAlign:"center", color:THEME.text3, fontSize:12 }}>
                      Keine Zeilen in diesem Filter.
                    </div>
                  )}
                  {filteredRows.map((row, fi) => {
                    const realIdx = filteredIndices[fi];
                    const res = resolutions[realIdx] ?? (row.conflict ? "keep_existing" : "import");
                    const resInfo = RESOLUTION_LABELS[res];
                    return (
                      <div key={realIdx} style={{
                        borderBottom:`1px solid ${THEME.border2}`,
                        background:row.conflict?"rgba(248,113,113,0.04)":"transparent",
                      }}>
                        {/* Import row */}
                        <div style={{ display:"grid", gridTemplateColumns:"80px 80px 60px 70px 70px 1fr",
                          padding:"7px 10px", alignItems:"start" }}>
                          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11,
                            fontWeight:700, color:THEME.accent }}>{row.symbol}</div>
                          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:THEME.text2 }}>{row.date}</div>
                          <div style={{ fontSize:10, color:row.type==="BUY"?THEME.green:THEME.red, fontWeight:700 }}>{row.type}</div>
                          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:THEME.text1 }}>{row.quantity}</div>
                          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:THEME.text2 }}>
                            {row.price ? row.price.toFixed(2) : "—"} {row.currency||""}
                          </div>
                          <div>
                            <ResolutionPill
                              value={res}
                              onChange={r => setResolutions(prev => ({...prev, [realIdx]: r}))}
                            />
                          </div>
                        </div>
                        {/* Existing rows (conflict) */}
                        {row.conflict && row.conflictRows.map(ex => (
                          <div key={ex.id} style={{ display:"grid",
                            gridTemplateColumns:"80px 80px 60px 70px 70px 1fr",
                            padding:"4px 10px 6px", alignItems:"center",
                            background:"rgba(0,0,0,0.2)", borderTop:`1px solid ${THEME.border2}` }}>
                            <div style={{ fontSize:8, color:THEME.text3, fontStyle:"italic", gridColumn:"1/3" }}>
                              ↳ Bestehend (ID {ex.id})
                            </div>
                            <div/>
                            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9,
                              color:THEME.text3 }}>{ex.quantity}</div>
                            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:THEME.text3 }}>
                              {ex.price?.toFixed(2)} {ex.currency||""}
                            </div>
                            <div style={{ fontSize:9, color:THEME.text3 }}>
                              {resInfo && (
                                <span style={{ color:resInfo.color }}>{resInfo.desc}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action summary + buttons */}
              <div style={{ padding:"10px 12px", borderRadius:9, background:THEME.surface2,
                border:`1px solid ${THEME.border}`, marginBottom:12,
                display:"flex", gap:16, alignItems:"center" }}>
                <span style={{ fontSize:11, color:THEME.green }}>✓ {willImport} importieren</span>
                {willOverwrite > 0 && <span style={{ fontSize:11, color:THEME.red }}>⚡ {willOverwrite} überschreiben</span>}
                <span style={{ fontSize:11, color:THEME.text3 }}>∅ {willSkip} überspringen</span>
              </div>

              {importErr && (
                <div style={{ padding:"8px 10px", borderRadius:8, marginBottom:12,
                  background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)",
                  fontSize:11, color:THEME.red }}><AlertCircle size={13}/> {importErr}</div>
              )}

              <div style={{ display:"flex", gap:8 }}>
                <button onClick={() => { setPreviewData(null); setImportErr(null); }}
                  style={{ flex:1, padding:"10px 0", borderRadius:10, border:`1px solid ${THEME.border}`,
                    background:"transparent", color:THEME.text2, fontSize:12, fontWeight:600,
                    cursor:"pointer", fontFamily:"inherit" }}>
                  ← Zurück
                </button>
                <button onClick={handleConfirmImport} disabled={importing || willImport === 0}
                  style={{ flex:2, padding:"10px 0", borderRadius:10, border:"none",
                    background: willImport > 0 ? THEME.accent : "rgba(255,255,255,0.05)",
                    color: willImport > 0 ? "#fff" : THEME.text3, fontSize:13, fontWeight:700,
                    cursor: willImport > 0 ? "pointer" : "default", fontFamily:"inherit",
                    display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                  {importing
                    ? <><span className="spin" style={{display:"flex"}}><RefreshCw size={14}/></span> Importiere…</>
                    : <><Upload size={14}/> {willImport} Transaktionen importieren{willOverwrite>0?` (${willOverwrite} ersetzen)`:""}</>}
                </button>
              </div>
            </div>
          )}

          {/* ── RESULT ─────────────────────────────────────────────────────── */}
          {tab === "import" && result && (
            <div>
              <div style={{ padding:"16px", borderRadius:12, marginBottom:16,
                background:"rgba(74,222,128,0.08)", border:"1px solid rgba(74,222,128,0.25)",
                textAlign:"center" }}>
                <div style={{ fontSize:32, marginBottom:8 }}>✓</div>
                <div style={{ fontSize:15, fontWeight:700, color:THEME.green, marginBottom:4 }}>
                  {result.imported} Transaktion{result.imported!==1?"en":""} importiert
                </div>
                {result.overwritten > 0 && (
                  <div style={{ fontSize:12, color:THEME.red, marginBottom:2 }}>
                    {result.overwritten} überschrieben
                  </div>
                )}
                <div style={{ fontSize:11, color:THEME.text3 }}>
                  {result.skipped} übersprungen
                </div>
              </div>
              <button onClick={() => { setResult(null); setFile(null); setPreviewData(null); }}
                style={{ width:"100%", padding:"10px 0", borderRadius:10, border:`1px solid ${THEME.border}`,
                  background:"transparent", color:THEME.text2, fontSize:12, fontWeight:600,
                  cursor:"pointer", fontFamily:"inherit" }}>
                Weiteren Import
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
// ════════════════════════════════════════════════════════════════════════════
// RAIL NAVIGATION
// ════════════════════════════════════════════════════════════════════════════
// ─── Delayed tooltip for collapsed sidebar icons ──────────────────────────
// ─── Inline info tooltip (? icon with popover) ───────────────────────────────
const InfoTip = ({ text, title, width=220, side="top" }) => {
  const [vis, setVis] = useState(false);
  const posStyle = side === "bottom"
    ? { top:"calc(100% + 6px)", bottom:"auto" }
    : { bottom:"calc(100% + 6px)", top:"auto" };
  return (
    <span style={{ position:"relative", display:"inline-flex", alignItems:"center", marginLeft:3 }}
      onMouseEnter={() => setVis(true)}
      onMouseLeave={() => setVis(false)}>
      <Info size={11} style={{ color:"rgba(255,255,255,0.28)", cursor:"help", flexShrink:0 }}/>
      {vis && (
        <div style={{
          position:"absolute", left:"50%", ...posStyle,
          transform:"translateX(-50%)", width, zIndex:200,
          background:"#1a1d2e", border:`1px solid ${THEME.border}`,
          borderRadius:8, padding:"8px 10px", pointerEvents:"none",
          boxShadow:"0 6px 24px rgba(0,0,0,0.6)",
          transition:"opacity 0.15s",
        }}>
          {title && <div style={{ fontSize:10, color:THEME.text1, fontWeight:700, marginBottom:4 }}>{title}</div>}
          <div style={{ fontSize:10, color:THEME.text2, lineHeight:1.55 }}>{text}</div>
        </div>
      )}
    </span>
  );
};

const SidebarTip = ({ children, label, open }) => {
  const [tip, setTip]       = useState(false);
  const [pos, setPos]       = useState({ x:0, y:0 });
  const timerRef            = useRef(null);
  if (open) return children;
  return (
    <div style={{ position:"relative" }}
      onMouseEnter={e => {
        const rect = e.currentTarget.getBoundingClientRect();
        setPos({ x: rect.right + 8, y: rect.top + rect.height / 2 });
        timerRef.current = setTimeout(() => setTip(true), 1200);
      }}
      onMouseLeave={() => { clearTimeout(timerRef.current); setTip(false); }}>
      {children}
      {tip && (
        <div style={{
          position:"fixed", left:pos.x, top:pos.y,
          transform:"translateY(-50%)",
          background:"#1e2030", border:`1px solid ${THEME.border}`,
          borderRadius:6, padding:"5px 10px", fontSize:11, fontWeight:600,
          color:THEME.text1, whiteSpace:"nowrap", zIndex:9999,
          boxShadow:"0 4px 16px rgba(0,0,0,0.5)", pointerEvents:"none",
        }}>{label}</div>
      )}
    </div>
  );
};

const RailBtn = ({ icon, label, active, onClick, color, badge, open=true }) => {
  const [tip, setTip]       = useState(false);
  const [tipPos, setTipPos] = useState({ x:0, y:0 });
  const timerRef            = useRef(null);

  const showTip = (e) => {
    if (open) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setTipPos({ x: rect.right + 8, y: rect.top + rect.height / 2 });
    timerRef.current = setTimeout(() => setTip(true), 1200);
  };
  const hideTip = () => {
    clearTimeout(timerRef.current);
    setTip(false);
  };

  return (
    <>
      <button onClick={onClick}
        onMouseEnter={showTip}
        onMouseLeave={hideTip}
        className={active ? undefined : "rail-btn"}
        style={{
          display:"flex", alignItems:"center", gap:10,
          width:"100%", padding: open ? "9px 12px" : "9px 0",
          justifyContent: open ? "flex-start" : "center",
          borderRadius:9, border:"none", cursor:"pointer",
          background: active ? "rgba(59,130,246,0.15)" : "transparent",
          color: active ? THEME.accent : (color || THEME.text3),
          fontSize:12, fontWeight: active ? 700 : 500,
          fontFamily:THEME.font, transition:"background 0.12s, color 0.12s",
          position:"relative",
        }}>
        <span className="rail-icon" style={{ flexShrink:0, display:"flex" }}>{icon}</span>
        {open && <span style={{ whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{label}</span>}
        {badge && (
          <span style={{
            marginLeft:"auto", flexShrink:0,
            background:"rgba(59,130,246,0.2)", color:THEME.accent,
            fontSize:9, fontWeight:700, borderRadius:4, padding:"2px 5px",
          }}>{badge}</span>
        )}
      </button>
      {tip && !open && (
        <div style={{
          position:"fixed", left:tipPos.x, top:tipPos.y,
          transform:"translateY(-50%)",
          background:"#1e2030", border:`1px solid ${THEME.border}`,
          borderRadius:6, padding:"5px 10px", fontSize:11, fontWeight:600,
          color:THEME.text1, whiteSpace:"nowrap", zIndex:9999,
          boxShadow:"0 4px 16px rgba(0,0,0,0.5)",
          pointerEvents:"none",
        }}>{label}</div>
      )}
    </>
  );
};

const RailSection = ({ label, open=true }) => open && (
  <div style={{ fontSize:9, fontWeight:700, color:THEME.text3, textTransform:"uppercase",
    letterSpacing:"0.10em", padding:"12px 12px 4px", opacity:0.7 }}>{label}</div>
);

const Divider = () => (
  <div style={{ height:1, background:THEME.border2, margin:"6px 8px" }}/>
);

function Rail({
  open, onToggle,
  user, portfolios, activePortfolioIds, onTogglePortfolio,
  viewMode, onViewMode,
  activeTab, onTab,
  period, onPeriod,
  onRefresh, fetching,
  onAddPortfolio, onRenamePortfolio, onSettings, onLogout,
  dataSource,
  currency, onCurrency,
  onRecalcFX,
  onImportExport,
  onEtfExplorer,
  displayMode, onToggleDisplayMode,
}) {
  const w = open ? RAIL_EXPANDED : RAIL_COLLAPSED;



  return (
    <div style={{
      width:w, flexShrink:0,
      height:"100%",
      background:THEME.surface,
      borderRight:`1px solid ${THEME.border}`,
      display:"flex", flexDirection:"column",
      overflow:"hidden",
      transition:"width 0.22s cubic-bezier(0.4,0,0.2,1)",
    }}>
      {/* Top: brand + ETF toggle + collapse */}
      <div style={{
        height:60, display:"flex", alignItems:"center",
        borderBottom:`1px solid ${THEME.border}`,
        padding: open ? "0 10px 0 14px" : "0",
        justifyContent: open ? "flex-start" : "center",
        gap:6, flexShrink:0,
      }}>
        {open && (
          <div style={{ flex:1, fontFamily:THEME.serif, userSelect:"none" }}>
            <div style={{ fontSize:18, fontWeight:400, letterSpacing:"-0.01em", lineHeight:1.1 }}>
              Portfolio<span style={{ color:THEME.accent, fontStyle:"italic" }}>.</span>
            </div>
            <div style={{ fontSize:8, color:THEME.text3, textTransform:"uppercase",
              letterSpacing:"0.10em", marginTop:1 }}>Explorer</div>
          </div>
        )}
        <button onClick={onToggle}
          style={{ background:"transparent", border:"none", cursor:"pointer",
            color:THEME.text3, display:"flex", padding:6, borderRadius:7,
            transition:"color 0.15s", flexShrink:0,
            marginLeft: open ? 0 : "auto", marginRight: open ? 0 : "auto" }}
          title={open ? "Collapse sidebar" : "Expand sidebar"}>
          <PanelLeft size={18} style={{ transform: open ? "none" : "scaleX(-1)" }}/>
        </button>
      </div>

      {/* Scrollable body */}
      <div style={{ flex:1, overflowY:"auto", overflowX:"hidden", padding:"8px 6px" }}>

        {/* Portfolios */}
        <RailSection open={open} label="Portfolios"/>
        {portfolios.map(p => {
          const isActive = activePortfolioIds.includes(p.id);
          return (
            <SidebarTip key={p.id} label={p.name} open={open}>
            <button onClick={() => onTogglePortfolio(p.id)}
              style={{
                display:"flex", alignItems:"center", gap:8,
                width:"100%", padding: open ? "7px 12px" : "7px 0",
                justifyContent: open ? "flex-start" : "center",
                borderRadius:9, border:"none", cursor:"pointer",
                background: isActive ? "rgba(255,255,255,0.05)" : "transparent",
                color: isActive ? THEME.text1 : THEME.text3,
                fontSize:12, fontFamily:THEME.font,
                transition:"background 0.12s",
              }}>
              {/* Color dot */}
              <span style={{
                width:10, height:10, borderRadius:"50%", flexShrink:0,
                background: isActive ? p.color : "rgba(255,255,255,0.2)",
                border: isActive ? "none" : "1.5px solid rgba(255,255,255,0.2)",
                transition:"background 0.15s",
              }}/>
              {open && (
                <>
                  <span style={{ flex:1, textAlign:"left", whiteSpace:"nowrap",
                    overflow:"hidden", textOverflow:"ellipsis", fontWeight: isActive?600:400 }}>
                    {p.name}
                  </span>
                  <span
                    title="Umbenennen"
                    onClick={e => { e.stopPropagation(); onRenamePortfolio(p); }}
                    style={{ color:THEME.text3, flexShrink:0, display:"flex", opacity:0.5,
                      padding:"2px 3px", borderRadius:4,
                      cursor:"pointer", transition:"opacity 0.15s" }}
                    onMouseEnter={e=>e.currentTarget.style.opacity=1}
                    onMouseLeave={e=>e.currentTarget.style.opacity=0.5}>
                    <Pencil size={11}/>
                  </span>
                  <span style={{ color: isActive ? THEME.accent : THEME.text3, flexShrink:0, display:"flex" }}>
                    {isActive ? <CheckSquare size={13}/> : <Square size={13}/>}
                  </span>
                </>
              )}
            </button>
            </SidebarTip>
          );
        })}
        {open && (
          <button onClick={onAddPortfolio}
            style={{
              display:"flex", alignItems:"center", gap:8, width:"100%",
              padding:"7px 12px", borderRadius:9, border:`1px dashed ${THEME.border}`,
              background:"transparent", color:THEME.text3, fontSize:12,
              fontFamily:THEME.font, cursor:"pointer", marginTop:4,
            }}>
            <Plus size={13}/> New Portfolio
          </button>
        )}

        <Divider/>

        {/* Actions */}
        <RailSection open={open} label="Actions"/>
        {/* Add Transaction — dashed pill, same style as New Portfolio but blue */}
        {open ? (
          <button onClick={() => onTab("_addtx")}
            style={{
              display:"flex", alignItems:"center", gap:8, width:"100%",
              padding:"7px 12px", borderRadius:9,
              border:`1px dashed ${THEME.accent}`,
              background:"rgba(59,130,246,0.06)", color:THEME.accent,
              fontSize:12, fontWeight:600,
              fontFamily:THEME.font, cursor:"pointer", marginBottom:2,
              transition:"background 0.12s",
            }}>
            <Plus size={13}/> Add Transaction
          </button>
        ) : (
          <RailBtn open={open} icon={<Plus size={16}/>} label="Add Transaction"
            color={THEME.accent} onClick={() => onTab("_addtx")}/>
        )}
        <RailBtn open={open} icon={fetching ? <span className="spin" style={{display:"flex"}}><RefreshCw size={16}/></span> : <RefreshCw size={16}/>}
          label="Refresh Quotes" onClick={onRefresh}/>
        {onRecalcFX && (
          <RailBtn open={open} icon={<span style={{fontSize:12}}>⟳$</span>} label="Recalc FX Costs"
            onClick={onRecalcFX}
            color={THEME.yellow ?? "#fbbf24"}/>
        )}
        <RailBtn open={open} icon={<FileDown size={16}/>} label="Import / Export"
          onClick={onImportExport}/>



      </div>  {/* end scrollable body */}

      {/* ─── Bottom: Currency + Account (pinned) ──────────────── */}
      <div style={{ borderTop:`1px solid ${THEME.border}`, padding:"4px 6px 8px", flexShrink:0 }}>
          {/* Currency */}
          {open && <div style={{ fontSize:9, fontWeight:700, color:THEME.text3,
            textTransform:"uppercase", letterSpacing:"0.10em",
            padding:"6px 6px 4px", opacity:0.7 }}>Currency</div>}
          <div style={{
            padding: open ? "2px 4px" : "2px 0",
            display:"flex", flexDirection:"column",
            gap:2, alignItems: open ? "stretch" : "center",
          }}>
            {Object.keys(CCY_SYM).map(c => {
              const isActive = currency === c;
              const code = CCY_FLAG[c];
              const SIZE = open ? 22 : 16;
              return (
                <SidebarTip key={c} label={`${c} — ${CCY_NAME[c]}`} open={open}>
                <button onClick={() => onCurrency(c)}
                  className={isActive ? undefined : "ccy-btn"}
                  style={{
                    display:"flex", alignItems:"center",
                    gap: open ? 8 : 0,
                    padding: open ? "5px 8px" : "5px 0",
                    border:"none", borderRadius:8,
                    background: isActive ? "rgba(59,130,246,0.15)" : "transparent",
                    cursor:"pointer", fontFamily:THEME.font,
                    transition:"background 0.12s",
                    width:"100%",
                    justifyContent: open ? "flex-start" : "center",
                  }}>
                  <div className="ccy-flag" style={{
                    width:SIZE, height:SIZE, borderRadius:"50%",
                    overflow:"hidden", flexShrink:0,
                    opacity: isActive ? 1 : 0.4, transition:"opacity 0.12s",
                    display:"flex", alignItems:"center", justifyContent:"center",
                  }}>
                    {code
                      ? <CircleFlag countryCode={code} width={SIZE} height={SIZE}/>
                      : <span style={{ fontSize:SIZE*0.6, lineHeight:1 }}>🌐</span>}
                  </div>
                  {open && (
                    <div style={{ display:"flex", alignItems:"baseline", gap:5 }}>
                      <span className="ccy-label" style={{
                        fontSize:11, fontWeight: isActive ? 700 : 500,
                        color: isActive ? THEME.accent : THEME.text3,
                      }}>{c}</span>
                      <span className="ccy-name" style={{
                        fontSize:9, color: isActive ? THEME.accent : THEME.text3,
                      }}>{CCY_NAME[c]}</span>
                    </div>
                  )}
                </button>
                </SidebarTip>
              );
            })}
          </div>

        {/* Separator */}
        <div style={{ height:1, background:THEME.border2, margin:"4px 0" }}/>

        {open && <div style={{ fontSize:9, fontWeight:700, color:THEME.text3,
          textTransform:"uppercase", letterSpacing:"0.10em",
          padding:"6px 6px 4px", opacity:0.7 }}>Account</div>}
        {open && user && (
          <div style={{ padding:"2px 6px 6px", display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:26, height:26, borderRadius:"50%",
              background:"rgba(59,130,246,0.2)", display:"flex",
              alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <User size={12} style={{ color:THEME.accent }}/>
            </div>
            <div>
              <div style={{ fontSize:12, fontWeight:600, color:THEME.text1 }}>{user.username}</div>
              <div style={{ fontSize:9, color:THEME.text3 }}>
                {portfolios.length} portfolio{portfolios.length!==1?"s":""}
              </div>
            </div>
          </div>
        )}
        {/* Data source settings (small, collapsed-friendly) */}
        <RailBtn open={open} icon={<Settings size={14}/>} label={`Source: ${dataSource==="alphavantage"?"AV":"Yahoo"}`}
          onClick={onSettings}/>

        {/* ── ETF Screener link ── */}
        {onEtfExplorer && (
          open ? (
            <button onClick={onEtfExplorer} style={{
              display:"flex", alignItems:"center", gap:10,
              width:"100%", padding:"9px 12px", borderRadius:9,
              border:"none", cursor:"pointer", background:"transparent",
              color:THEME.accent, fontFamily:THEME.font,
              transition:"background 0.12s, color 0.12s",
            }}
            className="rail-btn">
              <span style={{ flexShrink:0, display:"flex" }}><TrendingUp size={16}/></span>
              <span style={{ fontSize:12, fontWeight:600, lineHeight:1.2 }}>ETF Screener</span>
            </button>
          ) : (
            <SidebarTip label="ETF Screener" open={open}>
              <button onClick={onEtfExplorer} style={{
                display:"flex", alignItems:"center", justifyContent:"center",
                width:"100%", padding:"9px 0", borderRadius:9,
                border:"none", cursor:"pointer", background:"transparent",
                color:THEME.accent, transition:"background 0.12s",
              }} className="rail-btn">
                <TrendingUp size={16}/>
              </button>
            </SidebarTip>
          )
        )}

        {/* ── Display mode toggle ── */}
        {onToggleDisplayMode && (
          <div style={{ padding: open ? "6px 10px" : "6px 4px" }}>
            {open ? (
              <div style={{ display:"flex", alignItems:"center", gap:8,
                padding:"6px 10px", borderRadius:8,
                background:"rgba(255,255,255,0.04)",
                border:`1px solid ${THEME.border}` }}>
                <span style={{ fontSize:10, color:THEME.text3, flex:1, whiteSpace:"nowrap" }}>View mode</span>
                <div style={{ display:"flex", gap:2, padding:"2px",
                  borderRadius:6, background:"rgba(0,0,0,0.25)",
                  border:`1px solid ${THEME.border}` }}>
                  {[["pro",<Gauge size={13}/>, "Pro mode"],["comfort",<Armchair size={13}/>, "Comfort mode"]].map(([m, lbl]) => (
                    <button key={m} onClick={() => onToggleDisplayMode(m)}
                      title={m==="pro" ? "Compact — maximum information density" : "Comfort — larger text (WCAG AA)"}
                      style={{
                        padding:"3px 8px", borderRadius:5, border:"none",
                        background: displayMode===m
                          ? (m==="comfort" ? "rgba(59,130,246,0.35)" : "rgba(255,255,255,0.12)")
                          : "transparent",
                        color: displayMode===m ? THEME.text1 : THEME.text3,
                        fontSize:9, fontWeight:700, cursor:"pointer",
                        fontFamily:"inherit", transition:"all 0.15s", letterSpacing:"0.04em",
                      }}>{lbl}</button>
                  ))}
                </div>
              </div>
            ) : (
              <button onClick={onToggleDisplayMode}
                title={displayMode==="pro" ? "Switch to Comfort mode (A11Y)" : "Switch to Pro mode"}
                style={{
                  width:"100%", padding:"6px 0", border:"none", cursor:"pointer",
                  background: displayMode==="comfort" ? "rgba(59,130,246,0.18)" : "transparent",
                  borderRadius:7, display:"flex", justifyContent:"center",
                  alignItems:"center", transition:"all 0.15s",
                  color: THEME.text3,
                }}>
                <span style={{ lineHeight:1, color:"inherit" }}>{displayMode==="comfort" ? <Armchair size={16} aria-label="Comfort Mode" /> : <Gauge size={16} aria-label="Pro Mode aktiv" />}</span>
              </button>
            )}
          </div>
        )}

        <RailBtn open={open} icon={<LogOut size={16}/>} label="Sign Out" onClick={onLogout} color={THEME.text3}/>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TREEMAP COMPONENTS  (single portfolio view)
// ════════════════════════════════════════════════════════════════════════════
function TreeMapView({ nodes, onCellHover, onCellLeave, currency, rates, colorMode }) {
  const ref = useRef(null);
  const { w, h } = useSize(ref);
  const [cells, setCells] = useState([]);

  useEffect(() => {
    const valid = nodes.filter(n => (n.valueUSD ?? 0) > 0);
    if (!valid.length || w < 20 || h < 20) { setCells([]); return; }
    const root = d3.hierarchy({ name:"root", children:valid })
      .sum(d => Math.max(1, d.valueUSD ?? 0))
      .sort((a,b) => b.value - a.value);
    d3.treemap().size([w,h]).paddingInner(2).paddingOuter(3).round(true)(root);
    setCells(root.leaves().map(l => ({ ...l.data, x:l.x0, y:l.y0, cw:l.x1-l.x0, ch:l.y1-l.y0 })));
  }, [nodes, w, h]);

  return (
    <div ref={ref} style={{ width:"100%", height:"100%", background:THEME.bg,
      borderRadius:12, position:"relative", overflow:"hidden" }}>
      {cells.map(cell => (
        <TreeMapCell key={cell.symbol+cell.portfolioId} cell={cell}
          currency={currency} rates={rates} colorMode={colorMode}
          onMouseEnter={e => onCellHover(e, cell)}
          onMouseLeave={onCellLeave}/>
      ))}
      {!nodes.length && (
        <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column",
          alignItems:"center", justifyContent:"center", gap:12 }}>
          <div style={{ fontSize:48, opacity:0.15 }}>⬛</div>
          <div style={{ fontSize:15, fontWeight:700, color:THEME.text3, letterSpacing:"0.05em" }}>NO POSITIONS</div>
          <div style={{ fontSize:12, color:THEME.text3 }}>Add transactions to build your portfolio</div>
        </div>
      )}
    </div>
  );
}

function TreeMapCell({ cell, currency, rates, colorMode, onMouseEnter, onMouseLeave }) {
  const { cw, ch, perf, glPerf, symbol, currentPriceUSD, valueUSD, shortName } = cell;
  const activePerf = colorMode === "gainloss" ? glPerf : perf;
  const bg   = getPerfColor(activePerf);
  const rate = rates[currency] ?? 1;
  const cSym = CCY_SYM[currency] ?? "$";
  const small = Math.min(cw, ch);
  const price = (currentPriceUSD ?? 0) * rate;
  const changePct = activePerf;
  const change = activePerf != null && currentPriceUSD
    ? currentPriceUSD * activePerf / (100 + activePerf) * rate
    : null;

  return (
    <div onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
      style={{
        position:"absolute", left:cell.x, top:cell.y, width:cw, height:ch,
        background:bg, borderRadius:5,
        border:"1px solid rgba(0,0,0,0.3)", outline:"1px solid rgba(255,255,255,0.04)",
        overflow:"hidden", cursor:"pointer", display:"flex", flexDirection:"column",
        justifyContent:"flex-end", padding: small > 60 ? "8px 10px" : "4px 6px",
        transition:"filter 0.1s",
      }}>
      {small > 28 && (
        <div style={{ fontFamily:THEME.mono, fontWeight:700, lineHeight:1.05,
          fontSize: Math.min(Math.max(10, small*0.22), 28),
          color:"rgba(255,255,255,0.95)" }}>{symbol}</div>
      )}
      {small > 48 && shortName && (
        <div style={{ fontSize: Math.max(8, Math.min(10, small*0.10)),
          color:"rgba(255,255,255,0.50)", lineHeight:1.1, marginTop:1,
          whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{shortName}</div>
      )}
      {small > 55 && (
        <div style={{ fontFamily:THEME.mono, fontWeight:700,
          fontSize: Math.max(9, Math.min(11, small*0.12)),
          color:"rgba(255,255,255,0.88)", marginTop:3 }}>
          {cSym}{price.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}
        </div>
      )}
      {small > 55 && changePct != null && (
        <div style={{ fontFamily:THEME.mono, fontWeight:600,
          fontSize: Math.max(9, Math.min(11, small*0.11)),
          color: changePct >= 0 ? "rgba(144,255,180,0.9)" : "rgba(255,140,140,0.9)", marginTop:1 }}>
          {fmtPct(changePct)}
          {change != null && ` (${change >= 0 ? "+" : ""}${cSym}${Math.abs(change).toFixed(2)})`}
        </div>
      )}
      {small > 70 && (
        <div style={{ fontFamily:THEME.mono, fontSize:Math.max(8,Math.min(10,small*0.10)),
          color:"rgba(255,255,255,0.45)", marginTop:1 }}>
          {cSym}{((valueUSD??0)*rate).toLocaleString("en-US",{maximumFractionDigits:0})}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// CONSOLIDATED TREEMAP  — groups by portfolio (like S&P 500 sectors)
// ════════════════════════════════════════════════════════════════════════════
function ConsolidatedTreeMap({ portfolioNodes, portfolios, onCellHover, onCellLeave, currency, rates, colorMode }) {
  const ref = useRef(null);
  const { w, h } = useSize(ref);
  const [groups, setGroups] = useState([]);

  const LABEL_H = 20;
  const PAD_OUTER = 4;
  const PAD_INNER = 2;

  useEffect(() => {
    if (w < 20 || h < 20) return;
    const children = portfolios
      .filter(p => (portfolioNodes[p.id]?.length ?? 0) > 0)
      .map(p => ({
        name: p.name, color: p.color, portfolioId: p.id,
        children: portfolioNodes[p.id].filter(n => (n.valueUSD??0) > 0),
      }))
      .filter(g => g.children.length > 0);

    if (!children.length) { setGroups([]); return; }

    const root = d3.hierarchy({ name:"root", children })
      .sum(d => d.valueUSD ?? 0)
      .sort((a,b) => b.value - a.value);

    d3.treemap()
      .size([w, h])
      .paddingOuter(PAD_OUTER)
      .paddingTop(LABEL_H + PAD_INNER)   // exact space for label + gap
      .paddingInner(PAD_INNER)
      .round(true)(root);

    const result = root.children?.map(groupNode => {
      const gx = groupNode.x0;
      const gy = groupNode.y0;
      const gw = groupNode.x1 - groupNode.x0;
      const gh = groupNode.y1 - groupNode.y0;
      return {
        name:        groupNode.data.name,
        color:       groupNode.data.color,
        portfolioId: groupNode.data.portfolioId,
        x: gx, y: gy, gw, gh,
        // Cell coords are absolute in the [w,h] space — subtract group origin for relative positioning
        cells: groupNode.leaves?.().map(l => ({
          ...l.data,
          x: l.x0 - gx,
          y: l.y0 - gy,
          cw: l.x1 - l.x0,
          ch: l.y1 - l.y0,
        })) ?? [],
      };
    }) ?? [];

    setGroups(result);
  }, [portfolioNodes, portfolios, w, h]);

  return (
    <div ref={ref} style={{ width:"100%", height:"100%", background:THEME.bg,
      borderRadius:12, position:"relative", overflow:"hidden" }}>
      {groups.map(group => (
        <div key={group.portfolioId} style={{
          position:"absolute",
          left: group.x, top: group.y,
          width: group.gw, height: group.gh,
          borderRadius:6,
          border:`1px solid ${group.color}55`,
          background:`${group.color}09`,
          overflow:"hidden",
        }}>
          {/* Portfolio label */}
          <div style={{
            position:"absolute", top:3, left:6, zIndex:10,
            height: LABEL_H - 4,
            display:"flex", alignItems:"center",
            fontSize:9, fontWeight:700, color:group.color,
            textTransform:"uppercase", letterSpacing:"0.09em",
            whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
            maxWidth: group.gw - 12,
            textShadow:"0 1px 4px rgba(0,0,0,0.9)",
          }}>
            <span style={{ marginRight:5, fontSize:8, opacity:0.7 }}>■</span>
            {group.name}
          </div>

          {/* Cells — positioned relative to this group div */}
          {group.cells.map((cell, ci) => (
            <TreeMapCell key={cell.symbol + "_" + ci} cell={cell}
              currency={currency} rates={rates} colorMode={colorMode}
              onMouseEnter={e => onCellHover(e, cell)}
              onMouseLeave={onCellLeave}/>
          ))}
        </div>
      ))}
      {!groups.length && (
        <div style={{ position:"absolute", inset:0, display:"flex",
          alignItems:"center", justifyContent:"center", color:THEME.text3, fontSize:13 }}>
          No positions in selected portfolios
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// BAR CHART VIEW  (ported from v2, now multi-portfolio aware)
// ════════════════════════════════════════════════════════════════════════════
function BarChartView({ nodes, currency, rates, colorMode, period, onCellHover, onCellLeave, subView="perf" }) {
  const ref   = useRef(null);
  const { w, h } = useSize(ref);
  const cSym  = CCY_SYM[currency] ?? "$";
  const rate  = rates[currency] ?? 1;
  // subView now controlled by parent via prop

  const ease = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;

  const animRef  = useRef(null);
  const animBars = useRef({});
  const [, forceRender] = useState(0);

  const valid = useMemo(() => nodes.filter(n => n.currentPriceUSD > 0), [nodes]);
  const sortedPerf = useMemo(() => [...valid].sort((a,b) => {
    const pa = colorMode==="gainloss" ? (a.glPerf??-Infinity) : (a.perf??-Infinity);
    const pb = colorMode==="gainloss" ? (b.glPerf??-Infinity) : (b.perf??-Infinity);
    return pb - pa;
  }), [valid, colorMode]);
  const sortedSize = useMemo(() => [...valid].sort((a,b) => (b.valueUSD??0)-(a.valueUSD??0)), [valid]);
  const totalValue = useMemo(() => valid.reduce((s,n) => s+(n.valueUSD??0), 0), [valid]);

  const AXIS_W  = 44;
  const CHART_H = Math.max(1, h - 2);  // no internal header, use full height
  const CHART_W = Math.max(1, w - AXIS_W);
  const MID_Y   = CHART_H / 2;

  const maxAbsPerf = useMemo(() => {
    let m = 0;
    for (const n of valid) {
      const p = colorMode==="gainloss" ? n.glPerf : n.perf;
      if (p != null) m = Math.max(m, Math.abs(p));
    }
    const nice = [1,2,3,5,7,10,15,20,25,30,40,50,75,100,150,200];
    return nice.find(v => v >= m*1.15) ?? Math.ceil(m*1.15/10)*10;
  }, [valid, colorMode]);

  const pxPerPct = (CHART_H/2) / Math.max(1, maxAbsPerf);

  const yTicks = useMemo(() => {
    const step = maxAbsPerf<=5?1:maxAbsPerf<=15?2:maxAbsPerf<=30?5:maxAbsPerf<=60?10:20;
    const t = [];
    for (let v=step; v<=maxAbsPerf; v+=step) t.push(v);
    return t;
  }, [maxAbsPerf]);

  const computeTargets = useCallback((sv) => {
    const order = sv==="size" ? sortedSize : sortedPerf;
    const targets = new Map();
    let xc = AXIS_W;
    order.forEach(node => {
      const perf  = colorMode==="gainloss" ? node.glPerf : node.perf;
      const bw    = Math.max(1, ((node.valueUSD??0)/Math.max(1,totalValue))*CHART_W);
      const bh    = perf != null ? Math.abs(perf)*pxPerPct : 0;
      const isPos = (perf??0) >= 0;
      targets.set(node.symbol+node.portfolioId, { x:xc, bw, barY: isPos?MID_Y-bh:MID_Y, barH:Math.max(0,bh), perf, node });
      xc += bw;
    });
    return targets;
  }, [sortedPerf, sortedSize, colorMode, totalValue, CHART_W, MID_Y, pxPerPct, AXIS_W]);

  const prevSubView = useRef(subView);
  useEffect(() => {
    if (w<=0||h<=0||!valid.length) return;
    const fromT = computeTargets(prevSubView.current);
    const toT   = computeTargets(subView);
    prevSubView.current = subView;
    toT.forEach((to,k) => { if (!animBars.current[k]) { const f=fromT.get(k)??to; animBars.current[k]={x:f.x,bw:f.bw,barY:f.barY,barH:f.barH}; } });
    const start=performance.now();
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const tick = now => {
      const t=Math.min(1,(now-start)/800), et=ease(t);
      toT.forEach((to,k) => { const f=fromT.get(k)??animBars.current[k]??to; animBars.current[k]={x:f.x+(to.x-f.x)*et,bw:f.bw+(to.bw-f.bw)*et,barY:f.barY+(to.barY-f.barY)*et,barH:f.barH+(to.barH-f.barH)*et}; });
      forceRender(n=>n+1);
      if (t<1) animRef.current=requestAnimationFrame(tick);
    };
    animRef.current=requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subView, w, h, computeTargets]);

  useEffect(() => {
    if (w<=0||h<=0||!valid.length) return;
    const toT=computeTargets(subView);
    const start=performance.now();
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const tick = now => {
      const t=Math.min(1,(now-start)/500),et=ease(t);
      toT.forEach((to,k) => { const cur=animBars.current[k]??to; animBars.current[k]={x:cur.x+(to.x-cur.x)*et,bw:cur.bw+(to.bw-cur.bw)*et,barY:cur.barY+(to.barY-cur.barY)*et,barH:cur.barH+(to.barH-cur.barH)*et}; });
      forceRender(n=>n+1);
      if (t<1) animRef.current=requestAnimationFrame(tick);
    };
    animRef.current=requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, colorMode, period, w, h]);

  if (!valid.length) return (
    <div ref={ref} style={{width:"100%",height:"100%",display:"flex",alignItems:"center",
      justifyContent:"center",color:THEME.text3}}>No positions</div>
  );

  const renderOrder = subView==="size" ? sortedSize : sortedPerf;
  const toTargets   = computeTargets(subView);

  return (
    <div ref={ref} style={{width:"100%",height:"100%",background:THEME.bg,
      borderRadius:12,position:"relative",overflow:"hidden",userSelect:"none"}}>

      {w>0&&h>0&&(
        <svg width={w} height={h} style={{position:"absolute",inset:0}}>
          {yTicks.map(tick=>[tick,-tick]).flat().map(tick=>{
            const y=MID_Y-tick*pxPerPct;
            if (y<0||y>CHART_H) return null;
            return (
              <g key={tick}>
                <line x1={AXIS_W} y1={y} x2={w} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} strokeDasharray="4,6"/>
                <text x={AXIS_W-6} y={y+4} textAnchor="end"
                  fill={tick>0?"rgba(74,222,128,0.55)":"rgba(248,113,113,0.55)"}
                  fontSize={9} fontFamily="'JetBrains Mono',monospace">
                  {tick>0?`+${tick}`:tick} %
                </text>
              </g>
            );
          })}
          <line x1={AXIS_W} y1={MID_Y} x2={w} y2={MID_Y} stroke="rgba(255,255,255,0.20)" strokeWidth={1.5}/>
          <text x={AXIS_W-6} y={MID_Y+4} textAnchor="end" fill={THEME.text3} fontSize={9} fontFamily="'JetBrains Mono',monospace">0 %</text>
          {renderOrder.map(node=>{
            const key=node.symbol+node.portfolioId;
            const anim=animBars.current[key]??toTargets.get(key);
            if (!anim) return null;
            const {x,bw,barY,barH}=anim;
            const perf=colorMode==="gainloss"?node.glPerf:node.perf;
            const isPos=(perf??0)>=0;
            const bg=colorMode==="gainloss"?(isPos?"rgba(20,100,55,0.92)":"rgba(140,10,10,0.92)"):getPerfColor(perf);
            const GAP=2,rx=Math.min(4,bw*0.15);
            const showPerf=barH>18&&bw>24, showSym=bw>26, showVal=bw>60;
            return (
              <g key={key} onMouseEnter={e=>onCellHover(e,node)} onMouseLeave={onCellLeave} style={{cursor:"pointer"}}>
                <rect x={x+GAP/2} y={barY} width={Math.max(0,bw-GAP)} height={Math.max(0,barH)} fill={bg} rx={rx}/>
                {showPerf&&perf!=null&&(
                  <text x={x+bw/2} y={isPos?barY+13:barY+barH-5} textAnchor="middle"
                    fill={isPos?"rgba(144,255,180,0.95)":"rgba(255,160,160,0.95)"}
                    fontSize={Math.min(10,bw*0.18)} fontWeight="700" fontFamily="'JetBrains Mono',monospace">
                    {perf>=0?"+":""}{perf.toFixed(1)}%
                  </text>
                )}
                {showSym&&(
                  <text x={x+bw/2} y={isPos?MID_Y+16:MID_Y-5} textAnchor="middle"
                    fill={THEME.text2} fontSize={Math.min(11,Math.max(8,bw*0.16))} fontWeight="700" fontFamily="'Syne',sans-serif">
                    {node.symbol.length>8?node.symbol.slice(0,7)+"…":node.symbol}
                  </text>
                )}
                {showVal&&(
                  <text x={x+bw/2} y={isPos?MID_Y+27:MID_Y+16} textAnchor="middle"
                    fill={THEME.text3} fontSize={8} fontFamily="'JetBrains Mono',monospace">
                    {cSym}{((node.valueUSD??0)*rate/1000).toFixed(0)}K
                  </text>
                )}
              </g>
            );
          })}
          <text x={w-8} y={16} textAnchor="end" fill="rgba(255,255,255,0.12)" fontSize={10} fontWeight="700" fontFamily="'Syne',sans-serif" letterSpacing="0.08em">
            {colorMode==="gainloss"?"G&L vs. Cost":period==="Intraday"?"1D vs Prev Close":`${period} Performance`}
            {subView==="size"?"  ·  sorted by size":""}
          </text>
        </svg>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SPLIT BAR CHART  — one BarChartView per portfolio stacked vertically
// ════════════════════════════════════════════════════════════════════════════
function SplitBarChartView({ portfolios, treeNodesByPortfolio, currency, rates, colorMode, period, onCellHover, onCellLeave, subView="perf" }) {
  const entries = portfolios
    .map(p => ({ portfolio: p, nodes: treeNodesByPortfolio[p.id] ?? [] }))
    .filter(e => e.nodes.length > 0);

  if (!entries.length) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
      height:"100%", color:THEME.text3, fontSize:13 }}>No positions</div>
  );

  // ── Dividend prefetch — uses globalDivCache (shared, sessionStorage-backed) ──
  useEffect(() => {
    const symbols = entries.flatMap(e => e.nodes.map(n => n.symbol));
    if (symbols.length) globalDivCache.prefetch(symbols);
  }, [entries]); // eslint-disable-line


  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      {entries.map(({ portfolio, nodes }, idx) => (
        <div key={portfolio.id} style={{
          flex:1, display:"flex", flexDirection:"column", minHeight:0,
          borderTop: idx > 0 ? `1px solid ${THEME.border2}` : "none",
        }}>
          {/* Portfolio header — compact, sits above the chart */}
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 8px 2px",
            flexShrink:0 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:portfolio.color, flexShrink:0 }}/>
            <span style={{ fontSize:11, fontWeight:700, color:portfolio.color,
              textTransform:"uppercase", letterSpacing:"0.07em" }}>{portfolio.name}</span>
            <span style={{ fontSize:10, color:THEME.text3, marginLeft:4 }}>
              · {nodes.length} position{nodes.length!==1?"s":""}
            </span>
          </div>
          {/* Chart fills remaining flex space */}
          <div style={{ flex:1, minHeight:0 }}>
            <BarChartView
              nodes={nodes} currency={currency} rates={rates}
              colorMode={colorMode} period={period}
              subView={subView}
              onCellHover={onCellHover} onCellLeave={onCellLeave}/>
          </div>
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TOOLTIP  (same as v2)
// ════════════════════════════════════════════════════════════════════════════
function Tooltip({ data, x, y, currency, rates, period, chartData, chartDataIntraday, divData: divDataProp }) {
  const rate  = rates[currency] ?? 1;
  const cSym  = CCY_SYM[currency] ?? "$";
  // divData: use passed-in prop if available, otherwise fetch lazily via globalDivCache
  const [divDataLocal, setDivDataLocal] = useState(() => globalDivCache.get(data?.symbol) ?? null);
  const divData = divDataProp ?? divDataLocal;

  useEffect(() => {
    if (!data?.symbol) return;
    // If already in global cache, use it immediately
    if (globalDivCache.has(data.symbol)) {
      setDivDataLocal(globalDivCache.get(data.symbol));
      return;
    }
    let cancelled = false;
    globalDivCache.fetch(data.symbol).then(d => {
      if (!cancelled) setDivDataLocal(d);
    });
    return () => { cancelled = true; };
  }, [data?.symbol]);
  const perf  = data.perf;
  const glPerf = data.glPerf;
  const isPos = (perf ?? 0) >= 0;
  const perfColor = isPos ? THEME.green : THEME.red;
  const bg    = getPerfColor(perf);

  // Smart tooltip positioning — constrain to viewport
  // In Comfort Mode the body has CSS zoom:1.18, which shrinks the effective
  // coordinate space. Divide window dimensions by the body zoom factor so
  // edge-detection works correctly at any zoom level.
  const TW = 320;
  const MARGIN = 16;
  const bodyZoom    = parseFloat(getComputedStyle(document.body).zoom) || 1;
  const viewW       = window.innerWidth  / bodyZoom;
  const viewH       = window.innerHeight / bodyZoom;
  const cx          = x / bodyZoom;
  const cy          = y / bodyZoom;
  // Prefer right of cursor, flip left when too close to right edge
  const left = (cx + 20 + TW + MARGIN > viewW)
    ? Math.max(MARGIN, cx - TW - 16)
    : cx + 20;
  // Anchor near cursor; prevent running off the bottom
  const MAX_TIP_H = viewH - MARGIN * 2;
  const top = Math.min(Math.max(MARGIN, cy - 20), viewH - Math.min(480, MAX_TIP_H) - MARGIN);

  // Pick chart data
  const chartSrc = (period === "Intraday" && chartDataIntraday) ? chartDataIntraday : chartData;
  const chartPoints = useMemo(() => {
    if (!chartSrc) return null;
    const r = chartSrc.chart?.result?.[0];
    if (!r) return null;
    const ts = r.timestamp ?? [];
    const cls = r.indicators?.quote?.[0]?.close ?? [];
    const pts = ts.map((t,i) => ({ t, v: cls[i] })).filter(p => p.v != null);
    if (pts.length < 2) return null;
    return pts;
  }, [chartSrc]);

  const miniChart = useMemo(() => {
    if (!chartPoints) return null;
    const W = 282, H = 76;
    const xs = chartPoints.map(p => p.t);
    const ys = chartPoints.map(p => p.v);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const rangeY = maxY - minY || 1;
    const scaleX = (t) => ((t - xs[0]) / (xs[xs.length-1] - xs[0])) * W;
    const scaleY = (v) => H - ((v - minY) / rangeY) * (H - 8) - 4;
    const pts = chartPoints.map(p => `${scaleX(p.t).toFixed(1)},${scaleY(p.v).toFixed(1)}`).join(" ");
    const lastX = scaleX(xs[xs.length-1]);
    const lastY = scaleY(ys[ys.length-1]);
    const lineColor = isPos ? "#4ade80" : "#f87171";
    return { pts, lastX, lastY, lineColor, W, H };
  }, [chartPoints, isPos]);

  const price    = (data.currentPriceUSD ?? 0) * rate;
  const value    = (data.valueUSD ?? 0) * rate;
  const cost     = (data.costUSD ?? 0) * rate;
  const gainLoss = (data.gainLossUSD ?? 0) * rate;

  return (
    <div style={{
      position:"fixed", left, top, width:TW, zIndex:500,
      background:THEME.surface, borderRadius:16,
      border:`1px solid ${THEME.border}`,
      boxShadow:"0 20px 60px rgba(0,0,0,0.6)",
      maxHeight:`calc(${viewH - MARGIN * 2}px)`, overflowY:"auto", overflowX:"hidden",
      pointerEvents:"none",
    }}>
      <div style={{ background:bg, padding:"10px 14px 12px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end" }}>
          <div>
            <div style={{ fontFamily:THEME.mono, fontSize:20, fontWeight:700, color:"#fff" }}>{data.symbol}</div>
            {(data.longName || data.name) && (
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.65)", marginTop:2, maxWidth:190,
                whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                {data.longName || data.name}
              </div>
            )}
          </div>
          <div style={{ fontSize:15, fontWeight:700, color:perfColor }}>{fmtPct(perf)}</div>
        </div>
      </div>

      {miniChart && (
        <div style={{ height:76, background:"rgba(0,0,0,0.2)", position:"relative" }}>
          <svg width={miniChart.W} height={miniChart.H} style={{ position:"absolute", inset:0 }}>
            <defs>
              <linearGradient id={`tg-${data.symbol}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={miniChart.lineColor} stopOpacity="0.25"/>
                <stop offset="100%" stopColor={miniChart.lineColor} stopOpacity="0"/>
              </linearGradient>
            </defs>
            <polyline points={miniChart.pts + ` ${miniChart.W},${miniChart.H} 0,${miniChart.H}`}
              fill={`url(#tg-${data.symbol})`}/>
            <polyline points={miniChart.pts} fill="none"
              stroke={miniChart.lineColor} strokeWidth="1.5"/>
            <circle cx={miniChart.lastX} cy={miniChart.lastY} r="3" fill={miniChart.lineColor}/>
          </svg>
        </div>
      )}

      <div style={{ padding:"10px 14px" }}>
        {[
          ["Price",       `${cSym}${price.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`],
          ...(data.valueUSD != null ? [
            ["Market Value",`${cSym}${value.toLocaleString("en-US",{maximumFractionDigits:0})}`],
            ["Cost Basis",  `${cSym}${cost.toLocaleString("en-US",{maximumFractionDigits:0})}`],
            ["Avg Cost/Share", data.qty > 0 ? `${cSym}${(cost/data.qty).toFixed(2)}` : "—"],
            ["Shares",         data.qty > 0 ? data.qty.toLocaleString("en-US",{maximumFractionDigits:4}) : "—"],
            [null],
            ["Net G/L",     `${gainLoss>=0?"+":""}${cSym}${Math.abs(gainLoss).toLocaleString("en-US",{maximumFractionDigits:0})} (${fmtPct(glPerf)})`, gainLoss>=0?THEME.green:THEME.red],
            ["Portfolio Weight", data.weight ? `${data.weight.toFixed(1)}%` : "—"],
          ...(data.trailingPE != null || data.forwardPE != null ? [
            [null],
            ...(data.trailingPE != null ? [["P/E (trailing)", data.trailingPE.toFixed(1), THEME.accent]] : []),
            ...(data.forwardPE  != null ? [["P/E (forward)",  data.forwardPE.toFixed(1),  THEME.accent]] : []),
          ] : []),
          ] : [
            // ETF holding — show weight only
            ...(data.weight ? [["ETF Weight", `${data.weight.toFixed(2)}%`]] : []),
          ]),
          // Dividend data rows (only if available)
          ...(divData && divData.yieldPct != null ? [
            [null],
            ["Div. Yield",   `${divData.yieldPct.toFixed(2)}%`, "#fbbf24"],
            ["Annual Rate",  divData.annualRate != null ? `${cSym}${(divData.annualRate * rate).toFixed(3)}` : "—"],
            ["Last Ex-Date", divData.exDate ?? "—"],
            ...(divData.nextExDate ? [["Est. Next Ex-Date", divData.nextExDate, "#60a5fa"]] : []),
          ] : divData && divData.annualRate == null ? [] : [
            [null],
            ["Dividends", divData ? "Loading…" : "…"],
          ]),
        ].map((row, i) => {
          if (!row[0]) return <div key={i} style={{ height:1, background:THEME.border2, margin:"5px 0" }}/>;
          return (
            <div key={i} style={{ display:"flex", justifyContent:"space-between",
              alignItems:"baseline", gap:8, padding:"2px 0" }}>
              <span style={{ fontSize:11, color:THEME.text3, flexShrink:0 }}>{row[0]}</span>
              <span style={{ fontFamily:THEME.mono, fontSize:11, fontWeight:600,
                color:row[2]||THEME.text1, textAlign:"right", wordBreak:"break-all" }}>{row[1]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TRANSACTION LIST  (grouped by portfolio)
// ════════════════════════════════════════════════════════════════════════════
// ─── Delete Confirm Overlay ───────────────────────────────────────────────────
function DeleteConfirmOverlay({ tx, portfolio, onConfirm, onCancel }) {
  const isBuy = tx.type === "BUY";
  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,0.72)", backdropFilter:"blur(6px)",
      display:"flex", alignItems:"center", justifyContent:"center", zIndex:2000,
    }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{
        width:380, background:THEME.surface, borderRadius:18,
        border:`1px solid rgba(248,113,113,0.35)`,
        boxShadow:"0 32px 80px rgba(0,0,0,0.7)",
        padding:"28px 28px 24px",
      }}>
        {/* Icon */}
        <div style={{ display:"flex", justifyContent:"center", marginBottom:18 }}>
          <div style={{ width:52, height:52, borderRadius:"50%",
            background:"rgba(248,113,113,0.12)", border:"1px solid rgba(248,113,113,0.25)",
            display:"flex", alignItems:"center", justifyContent:"center" }}>
            <Trash2 size={22} color={THEME.red}/>
          </div>
        </div>
        <div style={{ textAlign:"center", marginBottom:20 }}>
          <div style={{ fontSize:16, fontWeight:700, color:THEME.text1, marginBottom:8 }}>
            Delete Transaction
          </div>
          <div style={{ fontSize:12, color:THEME.text2, lineHeight:1.6 }}>
            Are you sure you want to delete this transaction?
            <br/>This action cannot be undone.
          </div>
        </div>
        {/* Transaction summary */}
        <div style={{
          padding:"10px 14px", borderRadius:10, marginBottom:20,
          background:"rgba(255,255,255,0.04)", border:`1px solid ${THEME.border}`,
          display:"flex", alignItems:"center", gap:10,
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:portfolio.color }}/>
            <span style={{ fontSize:11, color:THEME.text3 }}>{portfolio.name}</span>
          </div>
          <div style={{ width:1, height:12, background:THEME.border }}/>
          <span style={{
            padding:"2px 7px", borderRadius:5, fontSize:9, fontWeight:700,
            background:isBuy?"rgba(74,222,128,0.12)":"rgba(248,113,113,0.12)",
            color:isBuy?THEME.green:THEME.red,
            border:`1px solid ${isBuy?"rgba(74,222,128,0.2)":"rgba(248,113,113,0.2)"}`,
          }}>{tx.type}</span>
          <span style={{ fontFamily:THEME.mono, fontWeight:700, fontSize:12, color:THEME.text1 }}>{tx.symbol}</span>
          <span style={{ fontSize:11, color:THEME.text2, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{tx.name || ""}</span>
          <span style={{ fontFamily:THEME.mono, fontSize:11, color:THEME.text3, flexShrink:0 }}>
            {tx.quantity} × ${parseFloat(tx.price).toFixed(2)}
          </span>
        </div>
        {/* Buttons */}
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onCancel} style={{
            flex:1, padding:"11px 0", borderRadius:10,
            border:`1px solid ${THEME.border}`, background:"transparent",
            color:THEME.text2, fontSize:12, fontWeight:600, cursor:"pointer",
            fontFamily:THEME.font, transition:"background 0.12s",
          }}
          onMouseEnter={e=>e.target.style.background="rgba(255,255,255,0.05)"}
          onMouseLeave={e=>e.target.style.background="transparent"}>
            Cancel
          </button>
          <button onClick={onConfirm} style={{
            flex:1, padding:"11px 0", borderRadius:10,
            border:"none", background:"rgba(248,113,113,0.18)",
            color:THEME.red, fontSize:12, fontWeight:700, cursor:"pointer",
            fontFamily:THEME.font, transition:"background 0.12s",
          }}
          onMouseEnter={e=>e.target.style.background="rgba(248,113,113,0.28)"}
          onMouseLeave={e=>e.target.style.background="rgba(248,113,113,0.18)"}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TransactionList ──────────────────────────────────────────────────────────
const TX_COLS_DEFAULT = [
  { key:"type",         label:"Type",          width:64,  sortable:true  },
  { key:"symbol",       label:"Symbol",        width:80,  sortable:true  },
  { key:"name",         label:"Name",          width:180, sortable:true  },
  { key:"date",         label:"Date",          width:100, sortable:true  },
  { key:"quantity",     label:"Qty",           width:72,  sortable:true  },
  { key:"price",        label:"Buy Price",     width:90,  sortable:true,  tip:"The price per share at the time of purchase, in the original transaction currency." },
  { key:"cost",         label:"Cost Basis",    width:100, sortable:true,  tip:"Total amount invested (quantity × buy price), converted to USD at the purchase-date exchange rate. This is your baseline for calculating gains and losses." },
  { key:"curPrice",     label:"Cur. Price",    width:90,  sortable:true  },
  { key:"curValue",     label:"Cur. Value",    width:100, sortable:true,  tip:"Current market value of your position (quantity × current price in USD)." },
  { key:"glPct",        label:"G/L %",         width:82,  sortable:true,  tip:"Net Gain / Loss percentage: (current value − cost basis) ÷ cost basis. Unrealised — reflects what you'd make if you sold today." },
  { key:"glAbs",        label:"Net G/L",       width:96,  sortable:true,  tip:"Net Gain / Loss in your display currency: current value minus cost basis. Unrealised — no taxes or fees deducted." },
  { key:"prdPct",       label:"Period %",      width:82,  sortable:true,  tip:"Price change % over the selected period (Intraday, 1W, 1M, 3M, 1Y, 2Y, 5Y). Calculated from the period's reference price, not your cost basis." },
  { key:"prdAbs",       label:"Period",        width:96,  sortable:true,  tip:"Absolute gain/loss for the selected period, based on the reference price at the start of the period × your quantity." },
  { key:"pe",           label:"P/E",           width:64,  sortable:true,  tip:"Price-to-Earnings ratio (trailing 12 months). Measures how much investors pay per dollar of earnings. High P/E can indicate growth expectations or overvaluation." },
  { key:"divYield",     label:"Div. Yield",    width:80,  sortable:true,  tip:"Annual dividend yield: total annual dividends per share ÷ current price. Shows income return as a percentage of your investment." },
  { key:"exDate",       label:"Ex-Date",       width:90,  sortable:false, tip:"Ex-Dividend Date: you must own the stock before this date to receive the next dividend payment." },
  { key:"links",        label:"Links",         width:68,  sortable:false },
  { key:"actions",      label:"",              width:56,  sortable:false },
];

// ════════════════════════════════════════════════════════════════════════════
// SPLIT TRANSACTION VIEW  — one table per portfolio, stacked
// ════════════════════════════════════════════════════════════════════════════
function SplitTransactionList({ portfolios, allTransactions, rates, quotes, onDelete, onEdit, onRefreshSymbol, period="Intraday", divCache={}, currency="USD" }) {
  const active = portfolios.filter(p => (allTransactions[p.id]?.length ?? 0) > 0);
  if (!active.length) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
      height:"100%", color:THEME.text3, fontSize:13 }}>No transactions</div>
  );
  // ── Dividend prefetch — uses globalDivCache (shared, sessionStorage-backed) ──
  useEffect(() => {
    const symbols = Object.keys(quotes);
    if (symbols.length) globalDivCache.prefetch(symbols);
  }, [quotes]); // eslint-disable-line


  return (
    <div style={{ display:"flex", flexDirection:"column", gap:0, flex:1, overflowY:"auto", minHeight:0 }}>
      {active.map(p => (
        <div key={p.id} style={{ flexShrink:0 }}>
          {/* Portfolio header row */}
          <div style={{ display:"flex", alignItems:"center", gap:8,
            padding:"10px 22px 6px", borderBottom:`1px solid ${THEME.border2}`,
            background:`${p.color}09`, position:"sticky", top:0, zIndex:5 }}>
            <div style={{ width:10, height:10, borderRadius:"50%", background:p.color }}/>
            <span style={{ fontSize:12, fontWeight:700, color:p.color,
              textTransform:"uppercase", letterSpacing:"0.07em" }}>{p.name}</span>
            <span style={{ fontSize:10, color:THEME.text3 }}>
              · {(allTransactions[p.id]?.length ?? 0)} transaction{(allTransactions[p.id]?.length??0)!==1?"s":""}
            </span>
          </div>
          {/* Single-portfolio transaction list */}
          <TransactionList
            portfolios={[p]}
            allTransactions={{ [p.id]: allTransactions[p.id] ?? [] }}
            rates={rates} quotes={quotes}
            onDelete={onDelete} onEdit={onEdit} onRefreshSymbol={onRefreshSymbol}
            period={period} divCache={divCache}
            currency={currency}
            compact/>
        </div>
      ))}
    </div>
  );
}

// ── PerformanceView ───────────────────────────────────────────────────────────
function niceStep(rough) {
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(rough, 1e-9))));
  const n   = rough / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}

// Popular benchmark ETFs / indices for comparison overlay
const BENCHMARKS = [
  { sym:"SPY",    label:"S&P 500"          },
  { sym:"QQQ",    label:"NASDAQ 100"       },
  { sym:"URTH",   label:"MSCI World"       },
  { sym:"EEM",    label:"MSCI EM"          },
  { sym:"GLD",    label:"Gold"             },
  { sym:"TLT",    label:"US Bonds 20Y"     },
  { sym:"EWG",    label:"DAX (EWG)"        },
  { sym:"FEZ",    label:"Euro Stoxx 50"    },
  { sym:"MCHI",   label:"MSCI China"       },
  { sym:"VNQ",    label:"US Real Estate"   },
];

function PerformanceView({ portfolios, allTransactions, currency, rates, quotes,
                           period = "1Y", viewMode: portViewMode = "consolidated",
                           ansicht = "portfolio",
                           benchSymbols = [], setBenchSymbols,
                           instrOverlays = [], setInstrOverlays,
                           onSymbolsChange, onSeriesColorsChange }) {
  // ── Range derived from the global period toolbar ────────────────────────────
  const range       = PERIOD_TO_RANGE[period] ?? "1y";
  const periodLabel = period === "Intraday" ? "1D" : period;

  // ── Ansicht: Portfolio view vs. per-Instrument view ─────────────────────────
  // Combined with portViewMode (consolidated/aggregated) this drives the 4 modes:
  //   consolidated + portfolio   → total (1 line)
  //   aggregated   + portfolio   → portfolios (1 line per portfolio)
  //   consolidated + instruments → instruments (1 line per symbol)
  //   aggregated   + instruments → inst_by_portfolio (1 line per symbol×portfolio)
  const ANSICHT_MODES = [
    { label:"Portfolio",   value:"portfolio",   tip:"Portfoliowert (gesamt oder je Portfolio)" },
    { label:"Instrumente", value:"instruments", tip:"Je Instrument eine Linie"                 },
  ];
  const LINE_COLORS = [
    "#3b82f6","#34d399","#f59e0b","#ec4899","#8b5cf6",
    "#06b6d4","#f97316","#a78bfa","#10b981","#fb923c",
  ];
  const BENCH_COLORS = [
    "#94a3b8","#cbd5e1","#e2e8f0","#f1f5f9","#64748b",
    "#475569","#334155","#1e293b","#0f172a","#c0c8d0",
  ];

  // Resolution is always "day" — controlled externally via period buttons
  const resolution = "day";

  const PAD = { top:24, right:20, bottom:64, left:72 };

  // ── State ──────────────────────────────────────────────────────────────────
  const [hiddenKeys,  setHiddenKeys]  = useState(new Set());
  const [showCost,    setShowCost]    = useState(true);
  const [showDivs,    setShowDivs]    = useState(true);
  const [yMode,       setYMode]       = useState("abs"); // "abs" | "rel" | "pct"
  const [histData,        setHistData]        = useState(null);
  const [divData,         setDivData]         = useState(null);
  const [loading,         setLoading]         = useState(false);
  const [intradayHistData,setIntradayHistData] = useState(null);
  const [intradayLoading, setIntradayLoading] = useState(false);
  const [hoverIdx,       setHoverIdx]       = useState(null);
  const [txPopover,      setTxPopover]      = useState(null);
  const [divPopover,     setDivPopover]     = useState(null);
  const [instrTxPopover, setInstrTxPopover] = useState(null); // { marker, clientX, clientY }
  const svgRef       = useRef(null);
  const containerRef = useRef(null);
  const { w, h }     = useSize(containerRef);

  // ── Flatten transactions ────────────────────────────────────────────────────
  const allTxFlat = useMemo(() => {
    const rows = [];
    for (const p of portfolios) {
      for (const tx of (allTransactions[p.id] ?? [])) {
        rows.push({ ...tx, portfolioId:p.id, portfolioColor:p.color, portfolioName:p.name });
      }
    }
    return rows.sort((a, b) => a.date.localeCompare(b.date));
  }, [portfolios, allTransactions]);

  const allSymbols = useMemo(() => [...new Set(allTxFlat.map(t => t.symbol))], [allTxFlat]);

  // All symbols to fetch: portfolio symbols + active benchmarks + instrument overlays
  const fetchSymbols = useMemo(() =>
    [...new Set([...allSymbols, ...benchSymbols, ...instrOverlays])],
  [allSymbols, benchSymbols, instrOverlays]);

  // Reset hidden series whenever the portfolio view mode or ansicht changes
  useEffect(() => { setHiddenKeys(new Set()); }, [portViewMode, ansicht]);

  // Report allSymbols up so App can build the picker
  useEffect(() => { onSymbolsChange?.(allSymbols); }, [allSymbols, onSymbolsChange]);

  // Report series colors up so picker pills can match chart line colors
  useEffect(() => {
    const map = {};
    for (const s of allSeries) { if (s.sym) map[s.sym] = s.color; }
    onSeriesColorsChange?.(map);
  }, [allSeries, onSeriesColorsChange]);

  // ── Fetch historical prices ─────────────────────────────────────────────────
  useEffect(() => {
    if (!fetchSymbols.length) return;
    setLoading(true);
    setHistData(null);
    setHoverIdx(null);
    quotesApi.historyMulti(fetchSymbols, range)
      .then(res => setHistData(res.results ?? {}))
      .catch(() => setHistData({}))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchSymbols.join(","), range]);

  useEffect(() => {
    if (period !== "Intraday" || !fetchSymbols.length) { setIntradayHistData(null); return; }
    setIntradayLoading(true);
    setIntradayHistData(null);
    quotesApi.historyMultiIntraday(fetchSymbols)
      .then(res => setIntradayHistData(res.results ?? {}))
      .catch(() => setIntradayHistData({}))
      .finally(() => setIntradayLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchSymbols.join(","), period]);

  // ── Fetch dividends (portfolio symbols only) ────────────────────────────────
  useEffect(() => {
    if (!allSymbols.length) return;
    quotesApi.dividendsMulti(allSymbols, range)
      .then(res => setDivData(res.results ?? {}))
      .catch(() => setDivData({}));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSymbols.join(","), range]);

  // ── Price maps ─────────────────────────────────────────────────────────────
  const priceMaps = useMemo(() => {
    if (!histData) return {};
    const out = {};
    for (const [sym, series] of Object.entries(histData)) {
      if (!series?.length) continue;
      out[sym] = new Map(series.map(([d, p]) => [d, p]));
    }
    return out;
  }, [histData]);

  const intradayPriceMaps = useMemo(() => {
    if (!intradayHistData) return null;
    const out = {};
    for (const [sym, series] of Object.entries(intradayHistData)) {
      if (!series?.length) continue;
      out[sym] = new Map(series.map(([dt, p]) => [dt, p]));
    }
    return out;
  }, [intradayHistData]);

  const intradayDates = useMemo(() => {
    if (!intradayHistData) return null;
    const s = new Set();
    for (const series of Object.values(intradayHistData)) {
      if (series) for (const [dt] of series) s.add(dt);
    }
    return [...s].sort();
  }, [intradayHistData]);

  // ── FX ──────────────────────────────────────────────────────────────────────
  const toUSD = useCallback((price, sym) => {
    const q = quotes[sym];
    if (!q?.currency || q.currency === "USD") return price;
    return (rates[q.currency] ?? 1) > 0 ? price / (rates[q.currency] ?? 1) : price;
  }, [quotes, rates]);

  // ── Resolution helper: bucket key for a date ────────────────────────────────
  const resKey = useCallback((dateStr) => {
    if (resolution === "day") return dateStr;
    if (resolution === "week") {
      // ISO week number based on Thursday rule
      const d   = new Date(dateStr + "T00:00:00Z");
      const thu = new Date(d); thu.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
      const jan4 = new Date(Date.UTC(thu.getUTCFullYear(), 0, 4));
      const wk   = Math.round((thu - jan4) / 6.048e8) + 1;
      return `${thu.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
    }
    if (resolution === "month")   return dateStr.slice(0, 7);
    if (resolution === "quarter") {
      const m = parseInt(dateStr.slice(5, 7));
      return `${dateStr.slice(0, 4)}-Q${Math.ceil(m / 3)}`;
    }
    return dateStr;
  }, [resolution]);

  // All trading dates from histData (sorted)
  const allDailyDates = useMemo(() => {
    if (!histData) return [];
    const s = new Set();
    for (const series of Object.values(histData)) {
      if (series) for (const [d] of series) s.add(d);
    }
    return [...s].sort();
  }, [histData]);

  // Resolved dates = last trading day of each resolution bucket
  const resolvedDates = useMemo(() => {
    if (!allDailyDates.length) return [];
    const buckets = new Map();
    for (const d of allDailyDates) buckets.set(resKey(d), d); // last date per period wins
    return [...buckets.values()].sort();
  }, [allDailyDates, resKey]);

  const resolvedSet = useMemo(() => new Set(resolvedDates), [resolvedDates]);

  // ── Core series computation ─────────────────────────────────────────────────
  // Runs over ALL daily dates (for price carry-forward accuracy),
  // but only records a data-point at resolved dates.
  const computeSeriesForTxList = useCallback((txList) => {
    if (!allDailyDates.length || !Object.keys(priceMaps).length) return { vs:[], cs:[] };
    const usdToDisp = currency === "USD" ? 1 : (rates[currency] ?? 1);
    const sorted    = [...txList].sort((a, b) => a.date.localeCompare(b.date));
    const qtyState  = {}, symCost = {}, lastPrice = {};
    let txCursor = 0;
    const vs = [], cs = [];
    for (const date of allDailyDates) {
      while (txCursor < sorted.length && sorted[txCursor].date <= date) {
        const tx = sorted[txCursor++];
        const sym = tx.symbol;
        if (!qtyState[sym]) { qtyState[sym] = 0; symCost[sym] = 0; }
        if (tx.type === "BUY") {
          qtyState[sym] += tx.quantity;
          symCost[sym]  += tx.quantity * (tx.price_usd || tx.price);
        } else {
          const avg = qtyState[sym] > 0 ? symCost[sym] / qtyState[sym] : 0;
          qtyState[sym] = Math.max(0, qtyState[sym] - tx.quantity);
          symCost[sym]  = Math.max(0, symCost[sym] - tx.quantity * avg);
        }
      }
      for (const sym of Object.keys(qtyState)) {
        const pm = priceMaps[sym];
        if (pm) { const p = pm.get(date); if (p != null && p > 0) lastPrice[sym] = toUSD(p, sym); }
      }
      if (!resolvedSet.has(date)) continue;
      let value = 0, runCost = 0;
      for (const [sym, qty] of Object.entries(qtyState)) {
        if (qty <= 0) continue;
        if ((lastPrice[sym] ?? 0) > 0) value += qty * lastPrice[sym];
        runCost += symCost[sym] ?? 0;
      }
      if (value <= 0 && vs.length === 0) continue;
      vs.push({ date, value: value   * usdToDisp });
      cs.push({ date, cost:  runCost * usdToDisp });
    }
    return { vs, cs };
  }, [allDailyDates, resolvedSet, priceMaps, toUSD, currency, rates]);

  // Per-symbol series (instruments mode) — shows full period even before first buy
  const computeSymbolSeries = useCallback((sym, txList) => {
    if (!allDailyDates.length) return [];
    const usdToDisp  = currency === "USD" ? 1 : (rates[currency] ?? 1);
    const symTx      = txList.filter(t => t.symbol === sym)
      .sort((a, b) => a.date.localeCompare(b.date));

    // Pass 1: find the reference point (first date the symbol is owned)
    // so we can normalize the unowned segments to the same scale.
    let refValue = null, refPriceUSD = null;
    { let qty2 = 0, lastP = null, cur = 0;
      for (const date of allDailyDates) {
        while (cur < symTx.length && symTx[cur].date <= date) {
          const tx = symTx[cur++];
          qty2 = tx.type === "BUY" ? qty2 + tx.quantity : Math.max(0, qty2 - tx.quantity);
        }
        const pm = priceMaps[sym];
        if (pm) { const p = pm.get(date); if (p != null && p > 0) lastP = toUSD(p, sym); }
        if (!resolvedSet.has(date) || !lastP || qty2 <= 0) continue;
        refValue = qty2 * lastP; refPriceUSD = lastP; break;
      }
    }

    // Pass 2: build series with owned/unowned flag
    let qty = 0, cost = 0, lastPriceUSD = null, txCursor = 0;
    const series = [];
    for (const date of allDailyDates) {
      while (txCursor < symTx.length && symTx[txCursor].date <= date) {
        const tx = symTx[txCursor++];
        if (tx.type === "BUY") {
          qty  += tx.quantity;
          cost += tx.quantity * (tx.price_usd || tx.price);
        } else {
          const avg = qty > 0 ? cost / qty : 0;
          qty  = Math.max(0, qty  - tx.quantity);
          cost = Math.max(0, cost - tx.quantity * avg);
        }
      }
      const pm = priceMaps[sym];
      if (pm) { const p = pm.get(date); if (p != null && p > 0) lastPriceUSD = toUSD(p, sym); }
      if (!resolvedSet.has(date) || !lastPriceUSD) continue;
      if (qty > 0) {
        const value = qty * lastPriceUSD;
        series.push({ date, value: value * usdToDisp, cost: cost * usdToDisp, owned: true });
      } else if (refValue != null && refPriceUSD != null) {
        // Outside ownership: normalize price relative to first-owned reference
        const normValue = refValue * (lastPriceUSD / refPriceUSD);
        series.push({ date, value: normValue * usdToDisp, cost: 0, owned: false });
      }
    }
    return series;
  }, [allDailyDates, resolvedSet, priceMaps, toUSD, currency, rates]);

  // ── Intraday series (minute-level, portfolio) ───────────────────────────────
  const computeIntradaySeries = useCallback((txList) => {
    if (!intradayDates?.length || !intradayPriceMaps) return { vs: [], cs: [] };
    const usdToDisp = currency === "USD" ? 1 : (rates[currency] ?? 1);
    const qtyState = {}, symCost = {};
    for (const tx of [...txList].sort((a, b) => a.date.localeCompare(b.date))) {
      const sym = tx.symbol;
      if (!qtyState[sym]) { qtyState[sym] = 0; symCost[sym] = 0; }
      if (tx.type === "BUY") {
        qtyState[sym] += tx.quantity;
        symCost[sym]  += tx.quantity * (tx.price_usd || tx.price);
      } else {
        const avg = qtyState[sym] > 0 ? symCost[sym] / qtyState[sym] : 0;
        qtyState[sym] = Math.max(0, qtyState[sym] - tx.quantity);
        symCost[sym]  = Math.max(0, symCost[sym] - tx.quantity * avg);
      }
    }
    const totalCost = Object.values(symCost).reduce((a, b) => a + b, 0);
    const lastPriceUSD = {};
    const vs = [], cs = [];
    for (const dt of intradayDates) {
      for (const sym of Object.keys(qtyState)) {
        const pm = intradayPriceMaps[sym];
        if (pm) { const p = pm.get(dt); if (p != null && p > 0) lastPriceUSD[sym] = toUSD(p, sym); }
      }
      let value = 0;
      for (const [sym, qty] of Object.entries(qtyState)) {
        if (qty <= 0) continue;
        if ((lastPriceUSD[sym] ?? 0) > 0) value += qty * lastPriceUSD[sym];
      }
      if (value <= 0 && vs.length === 0) continue;
      vs.push({ date: dt, value: value * usdToDisp });
      cs.push({ date: dt, cost: totalCost * usdToDisp });
    }
    return { vs, cs };
  }, [intradayDates, intradayPriceMaps, toUSD, currency, rates]);

  const computeIntradaySymbolSeries = useCallback((sym, txList) => {
    if (!intradayDates?.length || !intradayPriceMaps) return [];
    const usdToDisp = currency === "USD" ? 1 : (rates[currency] ?? 1);
    const symTx = txList.filter(t => t.symbol === sym).sort((a, b) => a.date.localeCompare(b.date));
    let qty = 0, cost = 0;
    for (const tx of symTx) {
      if (tx.type === "BUY") { qty += tx.quantity; cost += tx.quantity * (tx.price_usd || tx.price); }
      else { const avg = qty > 0 ? cost / qty : 0; qty = Math.max(0, qty - tx.quantity); cost = Math.max(0, cost - tx.quantity * avg); }
    }
    if (qty <= 0) return [];
    const pm = intradayPriceMaps[sym];
    if (!pm) return [];
    let lastPriceUSD = null;
    const series = [];
    for (const dt of intradayDates) {
      const p = pm.get(dt);
      if (p != null && p > 0) lastPriceUSD = toUSD(p, sym);
      if (lastPriceUSD == null) continue;
      series.push({ date: dt, value: qty * lastPriceUSD * usdToDisp, cost: cost * usdToDisp });
    }
    return series;
  }, [intradayDates, intradayPriceMaps, toUSD, currency, rates]);

  // ── Build allSeries based on portViewMode × ansicht ────────────────────────
  const allSeries = useMemo(() => {
    // ── Intraday branch: use minute-level data ─────────────────────────────
    if (period === "Intraday" && intradayHistData && intradayDates?.length) {
      const usdToDisp = currency === "USD" ? 1 : (rates[currency] ?? 1);
      const isSplit       = portViewMode === "consolidated";
      const isInstruments = ansicht === "instruments";
      let baseSeries = [];
      if (!isInstruments) {
        if (isSplit) {
          baseSeries = portfolios.map((p, i) => {
            const txs = (allTransactions[p.id] ?? []).map(tx => ({ ...tx, portfolioId:p.id }));
            const { vs, cs } = computeIntradaySeries(txs);
            return { key:`port_${p.id}`, label:p.name, color: p.color || LINE_COLORS[i % LINE_COLORS.length], vs, cs, isPortfolio:true };
          }).filter(s => s.vs.length > 0);
        } else {
          const { vs, cs } = computeIntradaySeries(allTxFlat);
          const up = vs.length < 2 || vs[vs.length - 1].value >= vs[0].value;
          baseSeries = [{ key:"total", label:"Gesamt", color: up ? "#34d399" : "#f87171", vs, cs, isPortfolio:true }];
        }
      } else {
        if (isSplit) {
          let colorIdx = 0;
          for (const p of portfolios) {
            const portTxs = (allTransactions[p.id] ?? []).map(tx => ({ ...tx, portfolioId:p.id }));
            for (const sym of [...new Set(portTxs.map(t => t.symbol))]) {
              const vs = computeIntradaySymbolSeries(sym, portTxs);
              if (!vs.length) continue;
              baseSeries.push({ key:`${p.id}_${sym}`, label:`${sym} · ${p.name}`, color: LINE_COLORS[colorIdx++ % LINE_COLORS.length], vs, cs: null, isPortfolio:true });
            }
          }
        } else {
          baseSeries = allSymbols.map((sym, i) => {
            const vs   = computeIntradaySymbolSeries(sym, allTxFlat);
            const name = allTxFlat.find(t => t.symbol === sym)?.name ?? sym;
            return { key:sym, label:`${sym} · ${name}`, color: LINE_COLORS[i % LINE_COLORS.length], vs, cs: null, isPortfolio:true };
          }).filter(s => s.vs.length > 0);
        }
      }
      const primaryFirst = baseSeries[0]?.vs[0]?.value ?? 0;
      const benchSeries = benchSymbols.map((sym, i) => {
        const pm = intradayPriceMaps?.[sym];
        if (!pm || !intradayDates.length) return null;
        let normPrice = null;
        const pts = [];
        for (const dt of intradayDates) {
          const p = pm.get(dt);
          if (normPrice == null && p != null && p > 0 && primaryFirst > 0) normPrice = toUSD(p, sym);
          if (normPrice != null && normPrice > 0 && p != null && p > 0) {
            pts.push({ date: dt, value: primaryFirst * (toUSD(p, sym) / normPrice) * usdToDisp });
          }
        }
        if (pts.length < 2) return null;
        const bLabel = BENCHMARKS.find(b => b.sym === sym)?.label ?? sym;
        return { key:`bench_${sym}`, label:`${bLabel} (${sym})`, color: BENCH_COLORS[i % BENCH_COLORS.length], vs: pts, cs: null, isBenchmark:true };
      }).filter(Boolean);
      return [...baseSeries, ...benchSeries];
    }

    if (!histData || !resolvedDates.length) return [];
    const usdToDisp = currency === "USD" ? 1 : (rates[currency] ?? 1);

    // ── Portfolio / instrument series ────────────────────────────────────────
    let baseSeries = [];
    // Consolidated = separate line per portfolio (or per symbol×portfolio)
    // Aggregated   = one combined line (all portfolios merged)
    const isSplit       = portViewMode === "consolidated";
    const isInstruments = ansicht === "instruments";

    if (!isInstruments) {
      // Portfolio value lines
      if (isSplit) {
        // Consolidated → one line per portfolio
        baseSeries = portfolios.map((p, i) => {
          const txs = (allTransactions[p.id] ?? []).map(tx => ({
            ...tx, portfolioId:p.id, portfolioColor:p.color, portfolioName:p.name,
          }));
          const { vs, cs } = computeSeriesForTxList(txs);
          return { key:`port_${p.id}`, label:p.name,
            color: p.color || LINE_COLORS[i % LINE_COLORS.length], vs, cs, isPortfolio:true };
        }).filter(s => s.vs.length > 0);
      } else {
        // Aggregated → single combined line
        const { vs, cs } = computeSeriesForTxList(allTxFlat);
        const up = vs.length < 2 || vs[vs.length - 1].value >= vs[0].value;
        baseSeries = [{ key:"total", label:"Gesamt", color: up ? "#34d399" : "#f87171", vs, cs, isPortfolio:true }];
      }
    } else {
      // Instrument value lines
      if (isSplit) {
        // Consolidated → one line per symbol×portfolio
        let colorIdx = 0;
        for (const p of portfolios) {
          const portTxs = (allTransactions[p.id] ?? []).map(tx => ({
            ...tx, portfolioId:p.id, portfolioColor:p.color, portfolioName:p.name,
          }));
          for (const sym of [...new Set(portTxs.map(t => t.symbol))]) {
            const vs = computeSymbolSeries(sym, portTxs);
            if (!vs.length) continue;
            baseSeries.push({ key:`${p.id}_${sym}`, sym, label:`${sym} · ${p.name}`,
              color: LINE_COLORS[colorIdx++ % LINE_COLORS.length], vs, cs: null, isPortfolio:true });
          }
        }
      } else {
        // Aggregated → one line per symbol (across all portfolios)
        baseSeries = allSymbols.map((sym, i) => {
          const vs   = computeSymbolSeries(sym, allTxFlat);
          const name = allTxFlat.find(t => t.symbol === sym)?.name ?? sym;
          return { key:sym, sym, label:`${sym} · ${name}`,
            color: LINE_COLORS[i % LINE_COLORS.length], vs, cs: null, isPortfolio:true };
        }).filter(s => s.vs.length > 0);
      }
    }

    // ── Benchmark overlay series (normalized to primary series' first value) ─
    const primaryFirst = baseSeries[0]?.vs[0]?.value ?? 0;
    const benchSeries = benchSymbols.map((sym, i) => {
      const pm = priceMaps[sym];
      if (!pm || !resolvedDates.length) return null;
      // Find first resolved date where both portfolio and benchmark have data
      let normPrice = null;
      const pts = [];
      for (const date of resolvedDates) {
        const p = pm.get(date);
        if (normPrice == null && p != null && p > 0 && primaryFirst > 0) {
          // First available benchmark price in the resolved date range
          normPrice = toUSD(p, sym);
        }
        if (normPrice != null && normPrice > 0 && p != null && p > 0) {
          const val = primaryFirst * (toUSD(p, sym) / normPrice);
          pts.push({ date, value: val * usdToDisp });
        }
      }
      if (pts.length < 2) return null;
      const bLabel = BENCHMARKS.find(b => b.sym === sym)?.label ?? sym;
      return { key:`bench_${sym}`, label:`${bLabel} (${sym})`,
        color: BENCH_COLORS[i % BENCH_COLORS.length],
        vs: pts, cs: null, isBenchmark:true };
    }).filter(Boolean);

    // ── Individual instrument overlay series ─────────────────────────────────
    const instrSeries = instrOverlays.map((sym, i) => {
      // If already in baseSeries, skip
      if (baseSeries.some(s => s.key === sym || s.key.endsWith(`_${sym}`))) return null;
      const vs   = computeSymbolSeries(sym, allTxFlat);
      if (!vs.length) return null;
      const name = allTxFlat.find(t => t.symbol === sym)?.name ?? sym;
      return { key:`instr_${sym}`, sym, label:`${sym} · ${name}`,
        color: LINE_COLORS[(baseSeries.length + i) % LINE_COLORS.length],
        vs, cs: null, isInstrOverlay:true };
    }).filter(Boolean);

    return [...baseSeries, ...benchSeries, ...instrSeries];
  }, [portViewMode, ansicht, histData, resolvedDates, allTxFlat, portfolios, allTransactions,
      allSymbols, benchSymbols, instrOverlays, priceMaps, toUSD, computeSeriesForTxList,
      computeSymbolSeries, currency, rates,
      period, intradayHistData, intradayDates, intradayPriceMaps,
      computeIntradaySeries, computeIntradaySymbolSeries]);

  // ── Visible series ──────────────────────────────────────────────────────────
  const visibleSeries = useMemo(() =>
    allSeries.filter(s => !hiddenKeys.has(s.key)),
  [allSeries, hiddenKeys]);

  // ── Display series: values transformed by yMode ──────────────────────────
  const displaySeries = useMemo(() => {
    if (yMode === "abs") return visibleSeries;
    return visibleSeries.map(s => {
      const base = s.vs.find(p => p.value > 0)?.value ?? 0;
      if (!base) return s;
      return {
        ...s,
        vs: s.vs.map(p => ({
          ...p,
          value: yMode === "rel"
            ? p.value - base
            : ((p.value - base) / base) * 100,
        })),
        cs: null,
      };
    });
  }, [visibleSeries, yMode]);

  const toggleKey = useCallback((key) =>
    setHiddenKeys(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; }),
  []);

  // Primary series used for stats only — x-axis always uses the full fetched date range
  const primarySeries = visibleSeries[0];
  // chartDates = full resolvedDates range; for intraday use minute-level datetime strings.
  const chartDates = (period === "Intraday" && intradayDates?.length) ? intradayDates : resolvedDates;
  const nPts       = chartDates.length;

  // ── Dividend markers ────────────────────────────────────────────────────────
  const divMarkers = useMemo(() => {
    if (!showDivs || !divData || !chartDates.length) return [];
    const grouped = {};
    for (const [sym, divs] of Object.entries(divData)) {
      if (!divs?.length) continue;
      if (!allSymbols.includes(sym)) continue;
      if (ansicht === "instruments" && hiddenKeys.has(sym)) continue;
      for (const div of divs) {
        let nearestIdx = null;
        for (let i = 0; i < chartDates.length; i++) {
          if (chartDates[i] >= div.date) { nearestIdx = i; break; }
        }
        if (nearestIdx == null) continue;
        const k = nearestIdx;
        if (!grouped[k]) grouped[k] = [];
        grouped[k].push({ sym, date:div.date, amount:div.amount });
      }
    }
    return Object.entries(grouped).map(([idx, items]) => ({ idx:parseInt(idx), items }));
  }, [showDivs, divData, chartDates, allSymbols, ansicht, hiddenKeys]);

  // ── Transaction markers ─────────────────────────────────────────────────────
  const txMarkers = useMemo(() => {
    if (!chartDates.length) return [];
    const visKeys = new Set(visibleSeries.map(s => s.key));
    const relevant = allTxFlat.filter(tx => {
      if (portViewMode === "aggregated" && ansicht === "portfolio") return visKeys.has(`port_${tx.portfolioId}`);
      if (ansicht === "instruments") return visKeys.has(tx.symbol);
      return true;
    });
    const grouped = {};
    for (const tx of relevant) {
      let nearestIdx = null;
      for (let i = 0; i < chartDates.length; i++) {
        if (chartDates[i] >= tx.date) { nearestIdx = i; break; }
      }
      if (nearestIdx == null) nearestIdx = chartDates.length - 1;
      const d = chartDates[nearestIdx];
      if (!grouped[d]) grouped[d] = { date:d, idx:nearestIdx, txs:[] };
      grouped[d].txs.push(tx);
    }
    return Object.values(grouped).map(g => ({
      ...g, hasBuy: g.txs.some(t => t.type === "BUY"), hasSell: g.txs.some(t => t.type === "SELL"),
    }));
  }, [allTxFlat, chartDates, portViewMode, ansicht, visibleSeries]);

  // ── Per-instrument on-line transaction markers (instruments mode only) ───────
  const instrTxMarkers = useMemo(() => {
    if (ansicht !== "instruments" || !chartDates.length) return [];
    const markers = [];
    for (const s of displaySeries) {
      if (s.isBenchmark) continue;
      const sym = s.sym;
      if (!sym) continue;
      const symTxs = allTxFlat.filter(t => t.symbol === sym);
      for (const tx of symTxs) {
        let idx = chartDates.findIndex(d => d >= tx.date);
        if (idx < 0) idx = chartDates.length - 1;
        const d   = chartDates[idx];
        const pt  = s.vs.find(p => p.date === d);
        if (!pt) continue;
        markers.push({ seriesKey:s.key, sym, color:s.color, idx, date:d, displayValue:pt.value, tx });
      }
    }
    return markers;
  }, [ansicht, displaySeries, allTxFlat, chartDates]);

  // ── Chart geometry ──────────────────────────────────────────────────────────
  const CW = Math.max(1, w - PAD.left - PAD.right);
  const CH = Math.max(1, h - 96 - PAD.top - PAD.bottom); // 96 = 1 control row + stats

  const { minV, maxV, yTicks } = useMemo(() => {
    const vals = [];
    for (const s of displaySeries) {
      for (const pt of s.vs) vals.push(pt.value);
      if (showCost && s.cs) for (const pt of s.cs) if (pt.cost > 0) vals.push(pt.cost);
    }
    if (!vals.length) return { minV:0, maxV:1, yTicks:[] };
    const mn = Math.min(...vals) * 0.97;
    const mx = Math.max(...vals) * 1.03;
    const step  = niceStep((mx - mn) / 5);
    const start = Math.floor(mn / step) * step;
    const ticks = [];
    for (let v = start; v <= mx + step * 0.5; v += step) ticks.push(v);
    return { minV:mn, maxV:mx, yTicks: ticks.filter(t => t >= mn && t <= mx + step) };
  }, [displaySeries, showCost]);

  const xS = useCallback((i) => nPts < 2 ? 0 : (i / (nPts - 1)) * CW, [nPts, CW]);
  const yS = useCallback((v)  => CH - ((v - minV) / Math.max(1, maxV - minV)) * CH, [CH, minV, maxV]);

  // SVG paths per series — splits owned vs unowned segments for instrument lines
  const seriesPaths = useMemo(() =>
    displaySeries.map(s => {
      const ptMap = new Map(s.vs.map(pt => [pt.date, { v:pt.value, owned: pt.owned !== false }]));
      const pts   = chartDates.map((d, i) => {
        const info = ptMap.get(d);
        return info ? { i, v:info.v, owned:info.owned } : null;
      }).filter(Boolean);
      if (pts.length < 2) return { key:s.key, color:s.color, isBenchmark:s.isBenchmark, line:"", ghostLine:"", area:"" };

      // Build SVG path string for a filtered subset of pts (owned or unowned)
      const ptsToPath = (filtered) => {
        if (filtered.length < 2) return "";
        return filtered
          .map((p, j) => `${j === 0 ? "M" : "L"}${xS(p.i).toFixed(1)},${yS(p.v).toFixed(1)}`)
          .join(" ");
      };

      const ownedPts   = pts.filter(p => p.owned);
      const unownedPts = pts.filter(p => !p.owned);
      const linePath   = ptsToPath(ownedPts);
      const ghostPath  = ptsToPath(unownedPts);

      // Area only under the owned segment (falls back to full line if nothing unowned)
      const areaSrc  = ownedPts.length >= 2 ? ownedPts : (pts.length >= 2 ? pts : []);
      const areaD    = areaSrc.length >= 2
        ? areaSrc.map((p,j) => `${j===0?"M":"L"}${xS(p.i).toFixed(1)},${yS(p.v).toFixed(1)}`).join(" ")
          + ` L${xS(areaSrc[areaSrc.length-1].i).toFixed(1)},${CH} L${xS(areaSrc[0].i).toFixed(1)},${CH} Z`
        : "";

      return { key:s.key, color:s.color, isBenchmark:s.isBenchmark,
               line:linePath, ghostLine:ghostPath, area:areaD };
    }),
  [displaySeries, chartDates, xS, yS, CH]);

  const costPaths = useMemo(() => {
    if (!showCost) return [];
    return displaySeries.filter(s => s.cs).map(s => {
      const ptMap = new Map(s.cs.map(pt => [pt.date, pt.cost]));
      const pts   = chartDates.map((d, i) => ({ i, v:ptMap.get(d) })).filter(p => p.v != null && p.v > 0);
      if (pts.length < 2) return null;
      const pathD = pts.map((p, j) => `${j===0?"M":"L"}${xS(p.i).toFixed(1)},${yS(p.v).toFixed(1)}`).join(" ");
      return { key:s.key, color:s.color, path:pathD };
    }).filter(Boolean);
  }, [displaySeries, showCost, chartDates, xS, yS]);

  const xTicks = useMemo(() => {
    if (nPts < 2) return [];
    const target = Math.max(3, Math.min(8, Math.floor(CW / 80)));
    const step = Math.ceil(nPts / target);
    const ticks = [];
    for (let i = 0; i < nPts; i += step) ticks.push(i);
    if (ticks[ticks.length - 1] !== nPts - 1) ticks.push(nPts - 1);
    return ticks;
  }, [nPts, CW]);

  // ── Stats (from primary series) ─────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!primarySeries || primarySeries.vs.length < 2) return null;
    const vs   = primarySeries.vs;
    const cs   = primarySeries.cs;
    const first = vs[0].value, last = vs[vs.length - 1].value;
    const cost  = cs?.length ? cs[cs.length - 1].cost : 0;
    const periodChange    = last - first;
    const periodChangePct = first >= 100 ? (periodChange / first) * 100 : null;
    const glAbs = cost > 0 ? last - cost : null;
    const glPct = cost > 0 ? ((last - cost) / cost) * 100 : null;
    const txDateSet = new Set(allTxFlat.map(t => t.date));
    let bestDay = null, worstDay = null;
    for (let i = 1; i < vs.length; i++) {
      const d = vs[i].date;
      if (txDateSet.has(d)) continue;
      const prev = vs[i - 1].value;
      if (prev <= 0) continue;
      const pct = ((vs[i].value - prev) / prev) * 100;
      if (bestDay  == null || pct > bestDay.pct)  bestDay  = { date:d, pct };
      if (worstDay == null || pct < worstDay.pct) worstDay = { date:d, pct };
    }
    return { first, last, cost, periodChange, periodChangePct, glAbs, glPct, bestDay, worstDay };
  }, [primarySeries, allTxFlat]);

  // ── Interaction ─────────────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e) => {
    if (!svgRef.current || nPts < 2) return;
    const rect     = svgRef.current.getBoundingClientRect();
    const bodyZoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
    const mx       = (e.clientX - rect.left) / bodyZoom - PAD.left;
    if (mx < 0 || mx > CW) { setHoverIdx(null); return; }
    setHoverIdx(Math.max(0, Math.min(nPts - 1, Math.round((mx / CW) * (nPts - 1)))));
  }, [nPts, CW]);

  // ── Format helpers ───────────────────────────────────────────────────────────
  const CCY_SYM = { USD:"$", EUR:"€", GBP:"£", CHF:"Fr", JPY:"¥" };
  const cSym    = CCY_SYM[currency] ?? currency + " ";
  const fmtV    = (v) => {
    if (v == null || isNaN(v)) return "—";
    const abs = Math.abs(v);
    if (abs >= 1e6) return `${cSym}${(v/1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${cSym}${(v/1e3).toFixed(1)}K`;
    return `${cSym}${v.toFixed(0)}`;
  };
  const fmtDisplay = (v) => {
    if (v == null || isNaN(v)) return "—";
    if (yMode === "pct") return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
    if (yMode === "rel") {
      const sign = v >= 0 ? "+" : "−";
      const absV = Math.abs(v);
      if (absV >= 1e6) return `${sign}${cSym}${(absV/1e6).toFixed(2)}M`;
      if (absV >= 1e3) return `${sign}${cSym}${(absV/1e3).toFixed(1)}K`;
      return `${sign}${cSym}${absV.toFixed(0)}`;
    }
    return fmtV(v);
  };
  const fmtDate = (d) => {
    if (!d) return "";
    if (d.includes("T")) return d.slice(11, 16); // intraday: show HH:MM
    return new Date(d + "T00:00:00Z").toLocaleDateString("de-DE",
      { day:"2-digit", month:"short", year:"2-digit", timeZone:"UTC" });
  };
  const fmtPct = (v) => v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

  const hoverDate  = hoverIdx != null ? chartDates[hoverIdx] : null;
  const isPositive = stats ? stats.periodChange >= 0 : true;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden",
      background:THEME.bg, fontFamily:THEME.font }}>

      {/* ── Controls: only stats (loading indicator lives in toolbar) ──── */}
      <div style={{ padding:"8px 20px 6px", flexShrink:0 }}>
        {(loading || intradayLoading) && (
          <div style={{ fontSize:10, color:THEME.text3, marginBottom:4 }}>⟳ Laden…</div>
        )}

        {/* Stats */}
        {stats && (
          <div style={{ display:"flex", gap:20, flexWrap:"wrap", marginBottom:4 }}>
            {[
              { label:"Aktueller Wert", val: fmtV(stats.last),  color:THEME.text1 },
              { label:"Investiert",      val: fmtV(stats.cost),  color:THEME.text2 },
              ...(stats.glAbs != null ? [{ label:"G/L gesamt",
                val:`${fmtV(stats.glAbs)} (${fmtPct(stats.glPct)})`,
                color: stats.glAbs >= 0 ? THEME.green : THEME.red }] : []),
              { label:`Periode (${periodLabel})`,
                val: stats.periodChangePct != null
                  ? `${fmtV(stats.periodChange)} (${fmtPct(stats.periodChangePct)})`
                  : fmtV(stats.periodChange),
                color: stats.periodChange >= 0 ? THEME.green : THEME.red },
              ...(stats.bestDay  ? [{ label:"Bester Tag",    val:`${fmtPct(stats.bestDay.pct)} · ${fmtDate(stats.bestDay.date)}`,  color:THEME.green }] : []),
              ...(stats.worstDay ? [{ label:"Schlechtester", val:`${fmtPct(stats.worstDay.pct)} · ${fmtDate(stats.worstDay.date)}`, color:THEME.red   }] : []),
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize:9, color:THEME.text3, letterSpacing:"0.05em", textTransform:"uppercase" }}>{s.label}</div>
                <div style={{ fontSize:13, fontWeight:700, color:s.color, fontFamily:THEME.mono, marginTop:1 }}>{s.val}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Chart area ───────────────────────────────────────────────────── */}
      <div ref={containerRef} style={{ flex:1, position:"relative", overflow:"hidden" }}>

        {(loading || intradayLoading) && (
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center",
            justifyContent:"center", color:THEME.text3, fontSize:13 }}>
            Historische Daten werden geladen…
          </div>
        )}
        {!(loading || intradayLoading) && !visibleSeries.length &&
            (period === "Intraday" ? intradayHistData != null : histData != null) && (
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center",
            justifyContent:"center", color:THEME.text3, fontSize:13 }}>
            Keine Daten für den gewählten Zeitraum
          </div>
        )}

        {w > 0 && h > 0 && visibleSeries.length > 0 && nPts >= 2 && (
          <svg ref={svgRef} width={w} height={h - 96}
            style={{ overflow:"visible", cursor:"crosshair", userSelect:"none" }}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => { setHoverIdx(null); setTxPopover(null); setDivPopover(null); setInstrTxPopover(null); }}>

            <defs>
              {visibleSeries.map(s => {
                const gid = `grad_${s.key.replace(/[^a-z0-9]/gi, "_")}`;
                return (
                  <linearGradient key={gid} id={gid} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={s.color} stopOpacity="0.22"/>
                    <stop offset="100%" stopColor={s.color} stopOpacity="0.02"/>
                  </linearGradient>
                );
              })}
              <clipPath id="perfClip">
                <rect x={PAD.left} y={PAD.top} width={CW} height={CH}/>
              </clipPath>
            </defs>

            {/* Y-axis grid + labels */}
            {yTicks.map(v => {
              const y = yS(v) + PAD.top;
              if (y < PAD.top - 4 || y > PAD.top + CH + 4) return null;
              return (
                <g key={v}>
                  <line x1={PAD.left} y1={y} x2={PAD.left + CW} y2={y}
                    stroke="rgba(255,255,255,0.05)" strokeWidth={1}/>
                  <text x={PAD.left - 6} y={y + 4} textAnchor="end"
                    fill={THEME.text3} fontSize={9} fontFamily={THEME.mono}>{fmtDisplay(v)}</text>
                </g>
              );
            })}

            {/* X-axis labels */}
            {xTicks.map(i => (
              <text key={i} x={xS(i) + PAD.left} y={PAD.top + CH + 16} textAnchor="middle"
                fill={THEME.text3} fontSize={9} fontFamily={THEME.mono}>
                {fmtDate(chartDates[i])}
              </text>
            ))}

            {/* Chart clip group */}
            <g clipPath="url(#perfClip)" transform={`translate(${PAD.left},${PAD.top})`}>
              {/* Area fill — only if single series */}
              {displaySeries.length === 1 && seriesPaths.map(p => p.area && (
                <path key={p.key + "_a"} d={p.area}
                  fill={`url(#grad_${p.key.replace(/[^a-z0-9]/gi, "_")})`} opacity={0.9}/>
              ))}
              {/* Cost-basis dashed lines */}
              {costPaths.map(cp => (
                <path key={cp.key + "_c"} d={cp.path} fill="none"
                  stroke={visibleSeries.length === 1 ? "rgba(148,163,184,0.45)" : cp.color}
                  strokeWidth={1.5} strokeDasharray="5 4" strokeOpacity={0.55}/>
              ))}
              {/* Ghost lines — price history outside ownership window */}
              {seriesPaths.map(p => p.ghostLine && (
                <path key={p.key + "_g"} d={p.ghostLine} fill="none" stroke={p.color}
                  strokeWidth={1.5} strokeDasharray="3 4" strokeOpacity={0.35}
                  strokeLinejoin="round"/>
              ))}
              {/* Value lines */}
              {seriesPaths.map(p => p.line && (
                <path key={p.key + "_l"} d={p.line} fill="none" stroke={p.color}
                  strokeWidth={p.isBenchmark ? 1.5 : displaySeries.length === 1 ? 2.5 : 2}
                  strokeDasharray={p.isBenchmark ? "4 3" : undefined}
                  strokeOpacity={p.isBenchmark ? 0.75 : 1}
                  strokeLinejoin="round"/>
              ))}
              {/* Hover crosshair + dots */}
              {hoverIdx != null && (
                <>
                  <line x1={xS(hoverIdx)} y1={0} x2={xS(hoverIdx)} y2={CH}
                    stroke="rgba(255,255,255,0.18)" strokeWidth={1} strokeDasharray="3 3"/>
                  {displaySeries.map(s => {
                    const pt = s.vs.find(p => p.date === chartDates[hoverIdx]);
                    if (!pt) return null;
                    return <circle key={s.key} cx={xS(hoverIdx)} cy={yS(pt.value)} r={4}
                      fill={s.color} stroke={THEME.bg} strokeWidth={2}/>;
                  })}
                </>
              )}
            </g>

            {/* Per-instrument BUY/SELL markers ON the line (instruments mode) */}
            {instrTxMarkers.map((m, mi) => {
              const mx  = xS(m.idx) + PAD.left;
              const my  = PAD.top + yS(m.displayValue);
              const isBuy = m.tx.type === "BUY";
              const col   = isBuy ? THEME.green : THEME.red;
              return (
                <g key={`itx_${m.seriesKey}_${mi}`} style={{ cursor:"pointer" }}
                  onMouseEnter={e => setInstrTxPopover({ marker:m, clientX:e.clientX, clientY:e.clientY })}
                  onMouseLeave={() => setInstrTxPopover(null)}>
                  {/* vertical tick from the line */}
                  <line x1={mx} y1={my} x2={mx} y2={my + (isBuy ? -14 : 14)}
                    stroke={col} strokeWidth={1} strokeOpacity={0.5}/>
                  {/* diamond marker */}
                  <polygon
                    points={`${mx},${my + (isBuy?-20:8)} ${mx+5},${my+(isBuy?-14:14)} ${mx},${my+(isBuy?-8:20)} ${mx-5},${my+(isBuy?-14:14)}`}
                    fill={col} opacity={0.9} stroke={THEME.bg} strokeWidth={1.5}/>
                </g>
              );
            })}

            {/* Transaction markers */}
            {txMarkers.map(m => {
              const mx = xS(m.idx) + PAD.left;
              const my = PAD.top + CH + 28;
              const color = m.hasSell && !m.hasBuy ? THEME.red
                          : m.hasBuy && m.hasSell  ? "#f59e0b" : THEME.green;
              return (
                <g key={`tx_${m.date}`} style={{ cursor:"pointer" }}
                  onMouseEnter={e => setTxPopover({ marker:m, clientX:e.clientX, clientY:e.clientY })}
                  onMouseLeave={() => setTxPopover(null)}>
                  <line x1={mx} y1={PAD.top + CH + 6} x2={mx} y2={my - 7}
                    stroke={color} strokeWidth={1} strokeOpacity={0.4}/>
                  <circle cx={mx} cy={my} r={5} fill={color} opacity={0.85}
                    stroke={THEME.bg} strokeWidth={1.5}/>
                  {m.txs.length > 1 && (
                    <text x={mx} y={my + 3.5} textAnchor="middle"
                      fill={THEME.bg} fontSize={6} fontWeight="700">{m.txs.length}</text>
                  )}
                </g>
              );
            })}

            {/* Dividend markers (diamonds, second row) */}
            {divMarkers.map(dm => {
              const mx = xS(dm.idx) + PAD.left;
              const my = PAD.top + CH + 48;
              return (
                <g key={`div_${dm.idx}`} style={{ cursor:"pointer" }}
                  onMouseEnter={e => setDivPopover({ dm, clientX:e.clientX, clientY:e.clientY })}
                  onMouseLeave={() => setDivPopover(null)}>
                  <line x1={mx} y1={PAD.top + CH + 6} x2={mx} y2={my - 7}
                    stroke="#facc15" strokeWidth={1} strokeOpacity={0.3}/>
                  <polygon
                    points={`${mx},${my - 5} ${mx + 5},${my} ${mx},${my + 5} ${mx - 5},${my}`}
                    fill="#facc15" opacity={0.85} stroke={THEME.bg} strokeWidth={1.5}/>
                  {dm.items.length > 1 && (
                    <text x={mx} y={my + 3.5} textAnchor="middle"
                      fill={THEME.bg} fontSize={6} fontWeight="700">{dm.items.length}</text>
                  )}
                </g>
              );
            })}

            {/* Axes border */}
            <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + CH}
              stroke="rgba(255,255,255,0.08)" strokeWidth={1}/>
            <line x1={PAD.left} y1={PAD.top + CH} x2={PAD.left + CW} y2={PAD.top + CH}
              stroke="rgba(255,255,255,0.08)" strokeWidth={1}/>
          </svg>
        )}

        {/* ── Hover tooltip ──────────────────────────────────────────────── */}
        {hoverIdx != null && hoverDate && w > 0 && (
          <div style={{ position:"absolute", pointerEvents:"none",
            left: Math.min(xS(hoverIdx) + PAD.left + 14, w - 200),
            top:  Math.max(4, PAD.top + 4),
            background:THEME.surface, border:`1px solid ${THEME.border}`,
            borderRadius:10, padding:"8px 12px", minWidth:170 }}>
            <div style={{ fontSize:9, color:THEME.text3, marginBottom:6 }}>{fmtDate(hoverDate)}</div>
            {displaySeries.map(s => {
              const pt   = s.vs.find(p => p.date === hoverDate);
              if (!pt) return null;
              const rawS = visibleSeries.find(r => r.key === s.key);
              const rawPt = rawS?.vs.find(p => p.date === hoverDate);
              const csPt = rawS?.cs?.find(p => p.date === hoverDate);
              const gl   = yMode === "abs" && csPt?.cost > 0 ? rawPt.value - csPt.cost : null;
              return (
                <div key={s.key} style={{ marginBottom:5 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                    <span style={{ width:8, height:8, borderRadius:2, background:s.color,
                      display:"inline-block", flexShrink:0 }}/>
                    <span style={{ fontSize:9, color:THEME.text3, flex:1,
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                      maxWidth:90 }}>{s.label}</span>
                    <span style={{ fontFamily:THEME.mono, fontSize:13, fontWeight:700,
                      color:s.color }}>{fmtDisplay(pt.value)}</span>
                  </div>
                  {gl != null && (
                    <div style={{ fontSize:10, color:gl >= 0 ? THEME.green : THEME.red,
                      fontFamily:THEME.mono, marginLeft:13, marginTop:1 }}>
                      G/L: {fmtV(gl)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Transaction popover ────────────────────────────────────────── */}
        {txPopover && (() => {
          const { marker, clientX, clientY } = txPopover;
          const bodyZoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
          const rect = containerRef.current?.getBoundingClientRect() ?? { left:0, top:0 };
          const px = (clientX - rect.left) / bodyZoom;
          const py = (clientY - rect.top)  / bodyZoom;
          const popW = 264;
          const left = px + popW + 16 > w / bodyZoom ? px - popW - 8 : px + 12;
          return (
            <div style={{ position:"absolute", left, top:Math.max(8, py - 20), width:popW,
              pointerEvents:"none", background:THEME.surface, border:`1px solid ${THEME.border}`,
              borderRadius:12, padding:"10px 12px", zIndex:200,
              boxShadow:"0 12px 40px rgba(0,0,0,0.55)" }}>
              <div style={{ fontSize:10, color:THEME.text3, marginBottom:8, fontWeight:700,
                letterSpacing:"0.05em" }}>
                {marker.txs.length} TRANSAKTION{marker.txs.length > 1 ? "EN" : ""} · {fmtDate(marker.date)}
              </div>
              {marker.txs.map((tx, i) => {
                const isBuy = tx.type === "BUY";
                const total = tx.quantity * (tx.price_usd || tx.price);
                return (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0",
                    borderBottom: i < marker.txs.length - 1 ? `1px solid ${THEME.border2}` : "none" }}>
                    <span style={{ padding:"2px 5px", borderRadius:4, fontSize:9, fontWeight:700,
                      background: isBuy ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
                      color: isBuy ? THEME.green : THEME.red,
                      border:`1px solid ${isBuy ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"}`,
                      flexShrink:0 }}>{tx.type}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontFamily:THEME.mono, fontWeight:700, fontSize:12, color:THEME.text1 }}>{tx.symbol}</div>
                      <div style={{ fontSize:10, color:THEME.text2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{tx.name}</div>
                    </div>
                    <div style={{ textAlign:"right", flexShrink:0 }}>
                      <div style={{ fontFamily:THEME.mono, fontSize:11, color:THEME.text1 }}>
                        {tx.quantity.toLocaleString("en-US", { maximumFractionDigits:4 })} × ${parseFloat(tx.price).toFixed(2)}
                      </div>
                      <div style={{ fontFamily:THEME.mono, fontSize:10, color:THEME.text3, marginTop:1 }}>
                        = ${total.toLocaleString("en-US", { maximumFractionDigits:0 })}
                      </div>
                      {tx.portfolioName && (
                        <div style={{ fontSize:9, color:THEME.text3, marginTop:1, display:"flex",
                          alignItems:"center", gap:3, justifyContent:"flex-end" }}>
                          <span style={{ width:5, height:5, borderRadius:"50%",
                            background:tx.portfolioColor, display:"inline-block" }}/>
                          {tx.portfolioName}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* ── Instrument-level BUY/SELL popover ─────────────────────────── */}
        {instrTxPopover && (() => {
          const { marker: m, clientX, clientY } = instrTxPopover;
          const tx = m.tx;
          const bodyZoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
          const rect = containerRef.current?.getBoundingClientRect() ?? { left:0, top:0 };
          const px = (clientX - rect.left) / bodyZoom;
          const py = (clientY - rect.top)  / bodyZoom;
          const popW = 240;
          const left = px + popW + 16 > w / bodyZoom ? px - popW - 8 : px + 12;
          const isBuy  = tx.type === "BUY";
          const total  = tx.quantity * (tx.price_usd || tx.price);
          return (
            <div style={{ position:"absolute", left, top:Math.max(8, py - 20), width:popW,
              pointerEvents:"none", background:THEME.surface, border:`1px solid ${m.color}44`,
              borderRadius:12, padding:"10px 12px", zIndex:201,
              boxShadow:"0 12px 40px rgba(0,0,0,0.55)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                <span style={{ width:8, height:8, borderRadius:2, background:m.color, flexShrink:0 }}/>
                <span style={{ fontFamily:THEME.mono, fontWeight:700, fontSize:11, color:m.color }}>{m.sym}</span>
                <span style={{ padding:"1px 6px", borderRadius:4, fontSize:9, fontWeight:700, marginLeft:"auto",
                  background: isBuy ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
                  color: isBuy ? THEME.green : THEME.red,
                  border:`1px solid ${isBuy?"rgba(74,222,128,0.25)":"rgba(248,113,113,0.25)"}` }}>{tx.type}</span>
              </div>
              <div style={{ fontSize:10, color:THEME.text3, marginBottom:6 }}>{fmtDate(m.date)}</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"4px 8px" }}>
                {[
                  ["Menge",    tx.quantity.toLocaleString("en-US", { maximumFractionDigits:4 })],
                  ["Preis",   `$${parseFloat(tx.price).toFixed(2)}`],
                  ["Gesamt",  `$${total.toLocaleString("en-US", { maximumFractionDigits:0 })}`],
                  ...(tx.portfolioName ? [["Portfolio", tx.portfolioName]] : []),
                ].map(([l, v]) => (
                  <div key={l} style={{ display:"contents" }}>
                    <span style={{ fontSize:9, color:THEME.text3 }}>{l}</span>
                    <span style={{ fontFamily:THEME.mono, fontSize:10, color:THEME.text1, textAlign:"right" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ── Dividend popover ───────────────────────────────────────────── */}
        {divPopover && (() => {
          const { dm, clientX, clientY } = divPopover;
          const bodyZoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
          const rect = containerRef.current?.getBoundingClientRect() ?? { left:0, top:0 };
          const px = (clientX - rect.left) / bodyZoom;
          const py = (clientY - rect.top)  / bodyZoom;
          const popW = 230;
          const left = px + popW + 16 > w / bodyZoom ? px - popW - 8 : px + 12;
          return (
            <div style={{ position:"absolute", left, top:Math.max(8, py - 20), width:popW,
              pointerEvents:"none", background:THEME.surface, border:`1px solid ${THEME.border}`,
              borderRadius:12, padding:"10px 12px", zIndex:200,
              boxShadow:"0 12px 40px rgba(0,0,0,0.55)" }}>
              <div style={{ fontSize:10, color:"#facc15", marginBottom:8, fontWeight:700,
                letterSpacing:"0.05em" }}>💰 DIVIDENDEN</div>
              {dm.items.map((item, i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"4px 0",
                  borderBottom: i < dm.items.length - 1 ? `1px solid ${THEME.border2}` : "none" }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:THEME.mono, fontWeight:700, fontSize:12, color:THEME.text1 }}>{item.sym}</div>
                    <div style={{ fontSize:10, color:THEME.text3 }}>Ex-Datum: {fmtDate(item.date)}</div>
                  </div>
                  <div style={{ fontFamily:THEME.mono, fontSize:12, color:"#facc15", fontWeight:700 }}>
                    ${item.amount.toFixed(4)}/Aktie
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

      </div>

      {/* ── Legend row — below the chart ─────────────────────────────────── */}
      {allSeries.length > 0 && (
        <div style={{ flexShrink:0, padding:"6px 20px 8px", display:"flex",
          alignItems:"center", flexWrap:"wrap", gap:4,
          borderTop:`1px solid ${THEME.border2}` }}>

          {/* Y-axis mode toggle */}
          {[["abs","Abs"],["rel","±$"],["pct","±%"]].map(([m, label]) => (
            <button key={m} onClick={() => setYMode(m)}
              style={{ padding:"3px 9px", borderRadius:20, cursor:"pointer", fontSize:10,
                fontFamily:THEME.mono, transition:"all 0.15s",
                border: `1px solid ${yMode === m ? "rgba(99,179,237,0.5)" : "rgba(255,255,255,0.08)"}`,
                background: yMode === m ? "rgba(99,179,237,0.12)" : "rgba(255,255,255,0.04)",
                color: yMode === m ? "#93c5fd" : THEME.text3 }}>
              {label}
            </button>
          ))}

          <div style={{ width:1, height:16, background:"rgba(255,255,255,0.1)", margin:"0 4px" }}/>

          {/* Series toggle chips */}
          {allSeries.map(s => {
            const hidden = hiddenKeys.has(s.key);
            return (
              <button key={s.key} onClick={() => toggleKey(s.key)} title={s.label}
                style={{ display:"flex", alignItems:"center", gap:5, padding:"3px 9px",
                  borderRadius:20, cursor:"pointer", transition:"all 0.15s",
                  border: `1px solid ${hidden ? "rgba(255,255,255,0.08)" : s.color + "88"}`,
                  background: hidden ? "rgba(255,255,255,0.04)" : s.color + "18",
                  opacity: hidden ? 0.35 : 1 }}>
                {s.isBenchmark ? (
                  <svg width={14} height={8} style={{ flexShrink:0 }}>
                    <line x1={0} y1={4} x2={14} y2={4}
                      stroke={hidden ? "rgba(255,255,255,0.2)" : s.color}
                      strokeWidth={1.5} strokeDasharray="3 2"/>
                  </svg>
                ) : (
                  <span style={{ width:8, height:8, borderRadius:2, flexShrink:0,
                    background: hidden ? "rgba(255,255,255,0.2)" : s.color }}/>
                )}
                <span style={{ fontSize:10, color: hidden ? THEME.text3 : THEME.text2,
                  fontFamily:THEME.font, maxWidth:160,
                  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {s.label}
                </span>
              </button>
            );
          })}

          {/* Separator */}
          {allSeries.length > 0 && (
            <div style={{ width:1, height:16, background:"rgba(255,255,255,0.1)", margin:"0 4px" }}/>
          )}

          {/* Einstand toggle */}
          <button onClick={() => setShowCost(v => !v)}
            style={{ display:"flex", alignItems:"center", gap:5, padding:"3px 9px",
              borderRadius:20, cursor:"pointer", transition:"all 0.15s",
              border: `1px solid ${showCost ? "rgba(148,163,184,0.4)" : "rgba(255,255,255,0.08)"}`,
              background: showCost ? "rgba(148,163,184,0.1)" : "rgba(255,255,255,0.04)",
              opacity: showCost ? 1 : 0.35 }}>
            <svg width={14} height={8} style={{ flexShrink:0 }}>
              <line x1={0} y1={4} x2={14} y2={4} stroke="rgba(148,163,184,0.8)"
                strokeWidth={1.5} strokeDasharray="3 2"/>
            </svg>
            <span style={{ fontSize:10, color:THEME.text3 }}>Einstand</span>
          </button>

          {/* Dividenden toggle */}
          <button onClick={() => setShowDivs(v => !v)}
            style={{ display:"flex", alignItems:"center", gap:5, padding:"3px 9px",
              borderRadius:20, cursor:"pointer", transition:"all 0.15s",
              border: `1px solid ${showDivs ? "rgba(250,204,21,0.4)" : "rgba(255,255,255,0.08)"}`,
              background: showDivs ? "rgba(250,204,21,0.08)" : "rgba(255,255,255,0.04)",
              opacity: showDivs ? 1 : 0.35 }}>
            <span style={{ fontSize:11, lineHeight:1 }}>◇</span>
            <span style={{ fontSize:10, color:THEME.text3 }}>Dividenden</span>
          </button>

        </div>
      )}
    </div>
  );
}

// ── EditPlanModal ─────────────────────────────────────────────────────────────
function EditPlanModal({ plan, portfolios, rates, onClose, onAdd, onUpdatePlan }) {
  const portfolio = portfolios.find(p => p.id === plan.portfolio_id);
  const [endDate,      setEndDate]      = useState(plan.end_date);
  const [periodicity,  setPeriodicity]  = useState(plan.periodicity);
  const [budget,       setBudget]       = useState(String(plan.budget_per_period));
  const [price,        setPrice]        = useState("");
  const [currency,     setCurrency]     = useState(plan.currency || "USD");
  const [busy,         setBusy]         = useState(false);
  const [lookupBusy,   setLookupBusy]   = useState(false);
  const [error,        setError]        = useState("");

  const todayStr    = useMemo(() => new Date().toISOString().slice(0,10), []);

  // All dates from plan.start_date → endDate using selected periodicity
  const allDates    = useMemo(() => generatePeriodDates(plan.start_date, endDate, periodicity), [plan.start_date, endDate, periodicity]);
  // New bookable: past dates that come AFTER last_booked_date
  const newPastDates = useMemo(() =>
    allDates.filter(d => d <= todayStr && (!plan.last_booked_date || d > plan.last_booked_date)),
  [allDates, todayStr, plan.last_booked_date]);
  const futureDates = useMemo(() => allDates.filter(d => d > todayStr), [allDates, todayStr]);

  const fracQty = useMemo(() => {
    const b = parseFloat(budget), p = parseFloat(price);
    return (!isNaN(b) && b > 0 && !isNaN(p) && p > 0) ? b / p : null;
  }, [budget, price]);

  // Auto-lookup current price
  const priceEditedRef = useRef(false);
  const currencyRef    = useRef(currency);
  useEffect(() => { currencyRef.current = currency; }, [currency]);

  useEffect(() => {
    if (!plan.symbol || priceEditedRef.current) return;
    setLookupBusy(true);
    quotesApi.lookup(plan.symbol, todayStr)
      .then(res => {
        if (res.price != null && !priceEditedRef.current) {
          setPrice(res.price.toFixed(2));
          if (res.currency && res.currency !== currencyRef.current) setCurrency(res.currency);
        }
      })
      .catch(() => {})
      .finally(() => setLookupBusy(false));
  }, [plan.symbol, todayStr]);

  const handleSave = async () => {
    const priceN  = parseFloat(price);
    const budgetN = parseFloat(budget);
    if (!endDate) { setError("Enddatum erforderlich"); return; }
    if (isNaN(budgetN) || budgetN <= 0) { setError("Budget muss eine positive Zahl sein"); return; }
    if (newPastDates.length > 0 && (isNaN(priceN) || priceN <= 0)) {
      setError("Preis für neue Käufe erforderlich"); return;
    }
    setBusy(true);
    try {
      // Book any new past dates
      if (newPastDates.length > 0) {
        let price_usd = priceN;
        if (currency !== "USD") {
          try { const hist = await fxApi.historical(newPastDates[0], currency, "USD"); price_usd = priceN * (hist?.rate ?? (1/(rates[currency]??1))); }
          catch { price_usd = priceN / (rates[currency]??1); }
        }
        const qtyN = budgetN / priceN;
        for (const d of newPastDates) {
          await onAdd(plan.portfolio_id, { symbol:plan.symbol, name:plan.name||plan.symbol, quantity:qtyN, price:priceN, price_usd, date:d, type:"BUY", currency });
        }
      }
      // Update plan in DB
      const newLastBooked = newPastDates.length > 0
        ? newPastDates[newPastDates.length - 1]
        : plan.last_booked_date;
      await onUpdatePlan(plan.portfolio_id, plan.id, {
        end_date: endDate, periodicity, budget_per_period: budgetN,
        last_booked_date: newLastBooked,
      });
      onClose();
    } catch(e) { setError(e.message); }
    setBusy(false);
  };

  const CCY_SYM = { USD:"$", EUR:"€", GBP:"£", CHF:"Fr", JPY:"¥" };
  const cSym = CCY_SYM[currency] ?? (currency + " ");

  return (
    <Modal title="Sparplan bearbeiten" onClose={onClose}>
      {/* Plan summary */}
      <div style={{ display:"flex", gap:8, marginBottom:16, padding:"10px 12px",
        background:"rgba(59,130,246,0.07)", borderRadius:10, border:"1px solid rgba(59,130,246,0.18)",
        alignItems:"center", flexWrap:"wrap" }}>
        <span style={{ fontFamily:THEME.mono, fontWeight:700, fontSize:13, color:THEME.accent }}>{plan.symbol}</span>
        <span style={{ fontSize:11, color:THEME.text2 }}>{plan.name}</span>
        {portfolio && (
          <span style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:5, fontSize:11, color:THEME.text3 }}>
            <span style={{ width:7, height:7, borderRadius:"50%", background:portfolio.color, display:"inline-block" }}/>
            {portfolio.name}
          </span>
        )}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
        <div>
          <div style={{ fontSize:10, color:THEME.text3, marginBottom:4 }}>START DATUM</div>
          <div style={{ fontFamily:THEME.mono, fontSize:12, color:THEME.text2 }}>{plan.start_date}</div>
        </div>
        <div>
          <div style={{ fontSize:10, color:THEME.text3, marginBottom:4 }}>ZULETZT GEBUCHT</div>
          <div style={{ fontFamily:THEME.mono, fontSize:12, color:plan.last_booked_date ? THEME.text2 : THEME.text3 }}>
            {plan.last_booked_date || "—"}
          </div>
        </div>
      </div>
      {/* Editable fields */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
        <div>
          <label style={{ fontSize:10, color:THEME.text3, display:"block", marginBottom:4 }}>ENDDATUM</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:`1px solid ${THEME.border}`,
              background:THEME.surface, color:THEME.text1, fontSize:12, fontFamily:THEME.mono, boxSizing:"border-box" }}/>
        </div>
        <div>
          <label style={{ fontSize:10, color:THEME.text3, display:"block", marginBottom:4 }}>RHYTHMUS</label>
          <select value={periodicity} onChange={e => setPeriodicity(e.target.value)}
            style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:`1px solid ${THEME.border}`,
              background:THEME.surface, color:THEME.text1, fontSize:11, boxSizing:"border-box" }}>
            {PERIODICITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label} — {o.description}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
        <div>
          <label style={{ fontSize:10, color:THEME.text3, display:"block", marginBottom:4 }}>
            BUDGET / PERIODE ({currency})
          </label>
          <input type="number" min="0.01" step="0.01" value={budget}
            onChange={e => setBudget(e.target.value)}
            style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:`1px solid ${THEME.border}`,
              background:THEME.surface, color:THEME.text1, fontSize:12, fontFamily:THEME.mono, boxSizing:"border-box" }}/>
        </div>
        <div>
          <label style={{ fontSize:10, color:THEME.text3, display:"block", marginBottom:4 }}>
            KURS {lookupBusy && <span style={{ opacity:0.5 }}>⟳</span>}
          </label>
          <div style={{ display:"flex", gap:6 }}>
            <input type="number" min="0" step="0.01" value={price}
              onChange={e => { priceEditedRef.current = true; setPrice(e.target.value); }}
              placeholder="aktueller Kurs"
              style={{ flex:1, padding:"8px 10px", borderRadius:8, border:`1px solid ${THEME.border}`,
                background:THEME.surface, color:THEME.text1, fontSize:12, fontFamily:THEME.mono, boxSizing:"border-box" }}/>
            <select value={currency} onChange={e => setCurrency(e.target.value)}
              style={{ width:70, padding:"8px 6px", borderRadius:8, border:`1px solid ${THEME.border}`,
                background:THEME.surface, color:THEME.text1, fontSize:11, boxSizing:"border-box" }}>
              {["USD","EUR","GBP","CHF","JPY","CAD","AUD","SEK","NOK","DKK"].map(c =>
                <option key={c} value={c}>{c}</option>
              )}
            </select>
          </div>
          {fracQty != null && (
            <div style={{ fontSize:9, color:THEME.text3, marginTop:3, fontFamily:THEME.mono }}>
              = {fracQty.toFixed(6)} Anteile/Periode
            </div>
          )}
        </div>
      </div>

      {/* Preview card */}
      {(newPastDates.length > 0 || futureDates.length > 0) && (
        <div style={{ borderRadius:10, border:`1px solid ${THEME.border}`, overflow:"hidden", marginBottom:12 }}>
          <div style={{ padding:"8px 12px", background:"rgba(255,255,255,0.04)",
            borderBottom:`1px solid ${THEME.border}`, display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ fontSize:11, color:THEME.text2, fontWeight:700 }}>Sparplan-Vorschau</span>
            <span style={{ marginLeft:"auto", fontSize:10, fontFamily:THEME.mono, color:THEME.text3 }}>
              {allDates.length} Termine gesamt
            </span>
          </div>

          {newPastDates.length > 0 && (
            <div style={{ padding:"10px 12px", borderBottom: futureDates.length > 0 ? `1px solid ${THEME.border}` : "none" }}>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
                <span style={{ fontSize:10, fontWeight:700, color:THEME.green }}>✓ NEU ZU BUCHEN ({newPastDates.length})</span>
                <span style={{ marginLeft:"auto", fontSize:10, fontFamily:THEME.mono, color:THEME.text3 }}>
                  {cSym}{(parseFloat(budget||0) * newPastDates.length).toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})}
                </span>
              </div>
              {fracQty != null && (
                <div style={{ fontSize:9, color:THEME.text3, marginBottom:5, fontFamily:THEME.mono }}>
                  {fracQty.toFixed(6)} Anteile × {newPastDates.length} = {(fracQty * newPastDates.length).toFixed(4)} Anteile
                </div>
              )}
              <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                {newPastDates.slice(0,8).map(d => (
                  <span key={d} style={{ fontSize:9, fontFamily:THEME.mono, padding:"2px 6px",
                    background:"rgba(74,222,128,0.1)", color:THEME.green,
                    borderRadius:4, border:"1px solid rgba(74,222,128,0.2)" }}>{d}</span>
                ))}
                {newPastDates.length > 8 && (
                  <span style={{ fontSize:9, color:THEME.text3 }}>+{newPastDates.length-8} weitere</span>
                )}
              </div>
            </div>
          )}

          {futureDates.length > 0 && (
            <div style={{ padding:"10px 12px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
                <span style={{ fontSize:10, fontWeight:700, color:THEME.text3 }}>↻ GEPLANT ({futureDates.length})</span>
                <span style={{ marginLeft:"auto", fontSize:10, fontFamily:THEME.mono, color:THEME.text3 }}>
                  {cSym}{(parseFloat(budget||0) * futureDates.length).toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})}
                </span>
              </div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                {futureDates.slice(0,5).map(d => (
                  <span key={d} style={{ fontSize:9, fontFamily:THEME.mono, padding:"2px 6px",
                    background:"rgba(148,163,184,0.08)", color:THEME.text3,
                    borderRadius:4, border:`1px solid ${THEME.border}` }}>{d}</span>
                ))}
                {futureDates.length > 5 && (
                  <span style={{ fontSize:9, color:THEME.text3 }}>+{futureDates.length-5} weitere</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {error && <div style={{ color:THEME.red, fontSize:11, marginBottom:10 }}>{error}</div>}
      <div style={{ display:"flex", gap:8 }}>
        <button onClick={onClose}
          style={{ flex:1, padding:"10px 0", borderRadius:10, border:`1px solid ${THEME.border}`,
            background:"transparent", color:THEME.text2, cursor:"pointer", fontSize:12 }}>
          Abbrechen
        </button>
        <button onClick={handleSave}
          disabled={busy || !endDate || !budget}
          style={{ flex:2, padding:"10px 0", borderRadius:10, border:"none",
            background: newPastDates.length > 0 ? THEME.accent : "rgba(59,130,246,0.4)",
            color:"#fff", cursor:"pointer", fontSize:13, fontWeight:700,
            opacity: (busy || !endDate || !budget) ? 0.5 : 1 }}>
          {busy ? "Speichern…"
            : newPastDates.length > 0
              ? `✓ ${newPastDates.length} Kauf${newPastDates.length!==1?"käufe":""} + Plan speichern`
              : "Plan speichern"}
        </button>
      </div>
    </Modal>
  );
}

// ── SavingsPlansSection ───────────────────────────────────────────────────────
function SavingsPlansSection({ plans, portfolios, rates, onEdit, onDelete }) {
  const [collapsed, setCollapsed] = useState(false);
  const todayStr = useMemo(() => new Date().toISOString().slice(0,10), []);

  if (!plans || plans.length === 0) return null;

  const PERIOD_SHORT = { daily:"tägl.", weekly:"wöch.", monthly:"mtl.", quarterly:"viertelj.", "semi-annually":"halbj.", annually:"jährl." };

  const getNextDate = (plan) => {
    const all  = generatePeriodDates(plan.start_date, plan.end_date, plan.periodicity);
    const future = all.filter(d => d > todayStr);
    return future[0] ?? null;
  };

  const getPendingCount = (plan) => {
    const all = generatePeriodDates(plan.start_date, plan.end_date, plan.periodicity);
    return all.filter(d => d <= todayStr && (!plan.last_booked_date || d > plan.last_booked_date)).length;
  };

  const isExpired = (plan) => plan.end_date < todayStr;

  const CCY_SYM = { USD:"$", EUR:"€", GBP:"£", CHF:"Fr", JPY:"¥" };

  return (
    <div style={{ borderRadius:12, border:`1px solid ${THEME.border}`, overflow:"hidden",
      background:"rgba(255,255,255,0.02)", marginBottom:12 }}>
      {/* Header */}
      <div style={{ padding:"8px 14px", borderBottom: collapsed ? "none" : `1px solid ${THEME.border2}`,
        display:"flex", alignItems:"center", gap:8, cursor:"pointer", userSelect:"none" }}
        onClick={() => setCollapsed(c => !c)}>
        <span style={{ fontSize:11, fontWeight:700, color:THEME.text2 }}>
          ↻ Sparpläne
        </span>
        <span style={{ fontSize:10, color:THEME.text3, fontFamily:THEME.mono }}>
          {plans.length} aktiv
        </span>
        <span style={{ marginLeft:"auto", fontSize:11, color:THEME.text3 }}>
          {collapsed ? "▶" : "▼"}
        </span>
      </div>
      {!collapsed && (
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
            <thead>
              <tr style={{ borderBottom:`1px solid ${THEME.border2}` }}>
                {["Symbol","Name","Rhythmus","Budget/Periode","Zeitraum","Nächstes Datum","Status",""].map((h, i) => (
                  <th key={i} style={{ padding:"6px 10px", textAlign:"left", fontSize:9,
                    color:THEME.text3, fontWeight:600, letterSpacing:"0.05em",
                    whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plans.map(plan => {
                const port     = portfolios.find(p => p.id === plan.portfolio_id);
                const nextDate = getNextDate(plan);
                const pending  = getPendingCount(plan);
                const expired  = isExpired(plan);
                const cSym     = CCY_SYM[plan.currency] ?? (plan.currency + " ");
                return (
                  <tr key={plan.id}
                    style={{ borderBottom:`1px solid ${THEME.border2}`, transition:"background 0.1s" }}
                    onMouseEnter={e => e.currentTarget.style.background="rgba(59,130,246,0.05)"}
                    onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                    <td style={{ padding:"7px 10px", whiteSpace:"nowrap" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                        {port && <span style={{ width:6, height:6, borderRadius:"50%", background:port.color, display:"inline-block", flexShrink:0 }}/>}
                        <span style={{ fontFamily:THEME.mono, fontWeight:700, color:THEME.accent }}>{plan.symbol}</span>
                      </div>
                    </td>
                    <td style={{ padding:"7px 10px", color:THEME.text2, maxWidth:120, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {plan.name}
                    </td>
                    <td style={{ padding:"7px 10px", color:THEME.text3, whiteSpace:"nowrap" }}>
                      {PERIOD_SHORT[plan.periodicity] ?? plan.periodicity}
                    </td>
                    <td style={{ padding:"7px 10px", fontFamily:THEME.mono, color:THEME.text1, whiteSpace:"nowrap" }}>
                      {cSym}{parseFloat(plan.budget_per_period).toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})}
                    </td>
                    <td style={{ padding:"7px 10px", fontFamily:THEME.mono, fontSize:10, color:THEME.text3, whiteSpace:"nowrap" }}>
                      {plan.start_date} → {plan.end_date}
                    </td>
                    <td style={{ padding:"7px 10px", fontFamily:THEME.mono, fontSize:10, whiteSpace:"nowrap",
                      color: expired ? THEME.text3 : THEME.text2 }}>
                      {expired ? <span style={{ color:THEME.text3 }}>abgelaufen</span> : (nextDate ?? "—")}
                    </td>
                    <td style={{ padding:"7px 10px", whiteSpace:"nowrap" }}>
                      {pending > 0 ? (
                        <span style={{ fontSize:9, fontWeight:700, padding:"2px 6px", borderRadius:5,
                          background:"rgba(251,191,36,0.15)", color:"#f59e0b",
                          border:"1px solid rgba(251,191,36,0.3)" }}>
                          {pending} offen
                        </span>
                      ) : expired ? (
                        <span style={{ fontSize:9, color:THEME.text3 }}>—</span>
                      ) : (
                        <span style={{ fontSize:9, padding:"2px 6px", borderRadius:5,
                          background:"rgba(74,222,128,0.1)", color:THEME.green,
                          border:"1px solid rgba(74,222,128,0.2)" }}>aktiv</span>
                      )}
                    </td>
                    <td style={{ padding:"7px 10px", whiteSpace:"nowrap" }}>
                      <div style={{ display:"flex", gap:4 }}>
                        <button onClick={() => onEdit(plan)}
                          style={{ padding:"3px 8px", borderRadius:6, border:`1px solid ${THEME.border}`,
                            background:"transparent", color:THEME.accent, cursor:"pointer", fontSize:10, fontWeight:700 }}>
                          ✎ Edit
                        </button>
                        <button onClick={() => onDelete(plan.portfolio_id, plan.id)}
                          style={{ padding:"3px 8px", borderRadius:6, border:"1px solid rgba(248,113,113,0.3)",
                            background:"transparent", color:THEME.red, cursor:"pointer", fontSize:10 }}>
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TransactionList({ portfolios, allTransactions, rates, quotes, onDelete, onEdit, onRefreshSymbol, compact=false, period="Intraday", divCache={}, currency="USD" }) {
  const [sortKey,    setSortKey]    = useState("date");
  const [sortDir,    setSortDir]    = useState("desc");
  const [colWidths,  setColWidths]  = useState(() => Object.fromEntries(TX_COLS_DEFAULT.map(c=>[c.key,c.width])));
  const [deletePending, setDeletePending] = useState(null); // { portfolioId, tx, portfolio }
  const dragging = useRef(null);
  const [groupingMode,   setGroupingMode]   = useState(true);
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());
  const toggleGroup = useCallback(key => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  // Flatten all transactions with portfolio info
  const allTxFlat = useMemo(() => {
    const rows = [];
    for (const p of portfolios) {
      for (const tx of (allTransactions[p.id] ?? [])) {
        const q = quotes[tx.symbol];
        // curPriceUSD: convert quote price (in instrument's trading currency) to USD
        const qCcy = q?.currency;
        const qRate = (qCcy && qCcy !== "USD") ? (rates[qCcy] ?? 1) : 1;
        const curPriceUSD = q ? (qRate > 0 ? q.price / qRate : q.price) : null;
        // cost is the true USD cost basis (price_usd was saved at purchase-date FX rate)
        const cost     = tx.quantity * (tx.price_usd || tx.price);
        const curValue = curPriceUSD != null ? tx.quantity * curPriceUSD : null;
        const glAbs    = curValue != null ? curValue - cost : null;
        const glPct    = cost > 0 && curValue != null ? (curValue - cost) / cost * 100 : null;
        // Period-based G/L — reference price from selected period
        let prdAbs = null, prdPct = null;
        if (curPriceUSD != null && q) {
          let refPriceUSD = null;
          if (period === "Intraday") {
            const prevUSD = q.prevClose != null ? (qRate > 0 ? q.prevClose / qRate : q.prevClose) : null;
            refPriceUSD = prevUSD;
          } else {
            const refKey = period === "Max" ? (q.refs?.["5Y"] ? "5Y" : "2Y") : period;
            const ref = q.refs?.[refKey];
            refPriceUSD = ref != null ? (qRate > 0 ? ref / qRate : ref) : null;
          }
          if (refPriceUSD != null) {
            const refValue = tx.quantity * refPriceUSD;
            prdAbs = (tx.quantity * curPriceUSD) - refValue;
            prdPct = refValue > 0 ? (prdAbs / refValue) * 100 : null;
          }
        }
        // Dividend data from cache
        const div = divCache[tx.symbol];
        rows.push({ ...tx, portfolioId:p.id, portfolioName:p.name, portfolioColor:p.color,
          _cost:cost, _curPriceUSD:curPriceUSD, _curValue:curValue, _glAbs:glAbs, _glPct:glPct,
          _prdAbs:prdAbs, _prdPct:prdPct, _div:div,
          _quoteCcy:qCcy ?? "USD" });
      }
    }
    return rows;
  }, [portfolios, allTransactions, quotes, rates, period, divCache]);

  const groupedData = useMemo(() => {
    const map = {};
    for (const tx of allTxFlat) {
      const key    = `${tx.symbol}||${tx.name ?? ""}`;
      const isSell = tx.type === "SELL";
      if (map[key]) {
        const g = map[key];
        g._txs.push(tx);
        if (!isSell) {
          // BUY: accumulate buy cost and qty for avg-cost basis
          g._buyCost += tx._cost;
          g._buyQty  += tx.quantity;
        } else {
          // SELL: reduces net position; do not add to cost basis
          g._sellQty += tx.quantity;
        }
        // Period absolute: subtract sold shares' contribution
        if (tx._prdAbs != null) g._prdAbs = (g._prdAbs ?? 0) + (isSell ? -tx._prdAbs : tx._prdAbs);
        if (tx.date > g.date) g.date = tx.date;
        if (g.type !== tx.type) g.type = "MIX";
      } else {
        const isSellFirst = tx.type === "SELL";
        map[key] = {
          ...tx, _isGroup:true, _key:key, _txs:[tx],
          _buyCost: isSellFirst ? 0        : tx._cost,
          _buyQty:  isSellFirst ? 0        : tx.quantity,
          _sellQty: isSellFirst ? tx.quantity : 0,
          _prdAbs:  isSellFirst ? (tx._prdAbs != null ? -tx._prdAbs : null) : tx._prdAbs,
        };
      }
    }
    return Object.values(map).map(g => {
      const netQty         = g._buyQty - g._sellQty;
      const avgBuyPriceUSD = g._buyQty > 0 ? g._buyCost / g._buyQty : null;
      // Cost basis of remaining shares only
      const _cost          = avgBuyPriceUSD != null ? avgBuyPriceUSD * netQty : 0;
      // Current value of remaining shares only
      const _curValue      = g._curPriceUSD != null ? netQty * g._curPriceUSD : null;
      const _glAbs         = _curValue != null ? _curValue - _cost : null;
      const _glPct         = _cost > 0 && _glAbs != null ? (_glAbs / _cost) * 100 : null;
      const _refVal        = _curValue != null && g._prdAbs != null ? _curValue - g._prdAbs : null;
      const _prdPct        = g._prdAbs != null && _refVal != null && _refVal > 0
                             ? (g._prdAbs / _refVal) * 100 : null;
      return { ...g, quantity: netQty, _cost, _curValue, _glAbs, _glPct, _prdPct, _avgBuyPriceUSD: avgBuyPriceUSD };
    }).filter(g => g.quantity > 0.0001); // hide fully-closed positions
  }, [allTxFlat]);

  const sorted = useMemo(() => {
    const data = (groupingMode && !compact) ? groupedData : allTxFlat;
    return [...data].sort((a,b) => {
      let va, vb;
      switch(sortKey) {
        case "type":     va=a.type;     vb=b.type;     break;
        case "symbol":   va=a.symbol;   vb=b.symbol;   break;
        case "name":     va=a.name||""; vb=b.name||""; break;
        case "date":     va=a.date;     vb=b.date;     break;
        case "quantity": va=a.quantity; vb=b.quantity; break;
        case "price":    va=(a._isGroup?a._avgBuyPriceUSD:a.price)??-Infinity;
                         vb=(b._isGroup?b._avgBuyPriceUSD:b.price)??-Infinity; break;
        case "cost":     va=a._cost;    vb=b._cost;    break;
        case "curPrice": va=a._curPriceUSD??-Infinity; vb=b._curPriceUSD??-Infinity; break;
        case "curValue": va=a._curValue??-Infinity;    vb=b._curValue??-Infinity;    break;
        case "glPct":    va=a._glPct??-Infinity;       vb=b._glPct??-Infinity;       break;
        case "glAbs":    va=a._glAbs??-Infinity;       vb=b._glAbs??-Infinity;       break;
        case "prdPct":   va=a._prdPct??-Infinity;      vb=b._prdPct??-Infinity;      break;
        case "prdAbs":   va=a._prdAbs??-Infinity;      vb=b._prdAbs??-Infinity;      break;
        case "divYield": va=a._div?.yieldPct??-Infinity; vb=b._div?.yieldPct??-Infinity; break;
        default: va=a.date; vb=b.date;
      }
      if (va < vb) return sortDir==="asc"?-1:1;
      if (va > vb) return sortDir==="asc"?1:-1;
      return 0;
    });
  }, [allTxFlat, groupedData, groupingMode, compact, sortKey, sortDir]);

  const handleSort = key => {
    if (sortKey===key) setSortDir(d=>d==="asc"?"desc":"asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const displayRows = useMemo(() => {
    if (!groupingMode || compact) return sorted.map(r => ({ ...r, _rowType:"flat" }));
    const out = [];
    for (const group of sorted) {
      out.push({ ...group, _rowType:"group" });
      if (expandedGroups.has(group._key)) {
        const subs = [...group._txs].sort((a,b) => b.date.localeCompare(a.date));
        for (const tx of subs) out.push({ ...tx, _rowType:"subrow", _groupKey:group._key });
      }
    }
    return out;
  }, [sorted, groupingMode, compact, expandedGroups]);

  // Column resize drag
  const startResize = (e, key) => {
    e.preventDefault();
    dragging.current = { key, startX:e.clientX, startW:colWidths[key] };
    const onMove = ev => {
      const delta = ev.clientX - dragging.current.startX;
      setColWidths(prev => ({ ...prev, [dragging.current.key]: Math.max(40, dragging.current.startW + delta) }));
    };
    const onUp = () => { dragging.current=null; window.removeEventListener("mousemove",onMove); window.removeEventListener("mouseup",onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Totals always based on net positions (groupedData) to avoid double-counting SELLs
  const totalCost    = groupedData.reduce((s,r)=>s+r._cost,0);
  const totalValue   = groupedData.reduce((s,r)=>s+(r._curValue??0),0);
  const totalGL      = groupedData.reduce((s,r)=>s+(r._glAbs??0),0);
  const totalPrdGL   = groupedData.reduce((s,r)=>s+(r._prdAbs??0),0);
  const hasPrdGL     = groupedData.some(r=>r._prdAbs!=null);

  const SortIcon = ({ col }) => {
    if (!col.sortable) return null;
    const active = sortKey===col.key;
    return (
      <span style={{ marginLeft:4, opacity:active?1:0.3, fontSize:8, display:"inline-flex", flexDirection:"column", gap:0, lineHeight:1 }}>
        <span style={{ color:active&&sortDir==="asc"?THEME.accent:THEME.text3 }}>▲</span>
        <span style={{ color:active&&sortDir==="desc"?THEME.accent:THEME.text3 }}>▼</span>
      </span>
    );
  };

  if (!allTxFlat.length) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:200, color:THEME.text3, fontSize:13 }}>
      No transactions in the selected portfolios.
    </div>
  );

  const thStyle = (col) => ({
    padding:"0 10px", textAlign:"left", fontWeight:700, fontSize:10,
    color:THEME.text3, textTransform:"uppercase", letterSpacing:"0.07em",
    whiteSpace:"nowrap", userSelect:"none", cursor:col.sortable?"pointer":"default",
    width:colWidths[col.key], minWidth:colWidths[col.key], maxWidth:colWidths[col.key],
    position:"relative", overflow:"hidden",
    borderRight:`1px solid ${THEME.border2}`,
    background: sortKey===col.key?"rgba(59,130,246,0.06)":"transparent",
  });

  const tdStyle = (col, extra={}) => ({
    padding:"0 10px", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
    width:colWidths[col.key], minWidth:colWidths[col.key], maxWidth:colWidths[col.key],
    borderRight:`1px solid ${THEME.border2}`,
    background: sortKey===col.key?"rgba(59,130,246,0.03)":"transparent",
    ...extra,
  });

  const rate   = rates[currency] ?? 1;
  const cSym   = { USD:"$", EUR:"€", CHF:"Fr.", GBP:"£" }[currency] ?? "$";
  const fmtUSD = (v, dec=2) => v==null
    ? <span style={{color:THEME.text3}}>—</span>
    : `${cSym}${Math.abs(v*rate).toLocaleString("en-US",{minimumFractionDigits:dec,maximumFractionDigits:dec})}`;
  // G/L label adapts to currency
  const glLabel = currency !== "USD" ? `G/L ${cSym}` : "G/L $";

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", minHeight:0 }}>
      {/* Summary row — hidden in compact (per-portfolio split) mode */}
      {!compact && (
      <div style={{
        display:"flex", alignItems:"center", gap:24, padding:"8px 14px 12px",
        borderBottom:`1px solid ${THEME.border2}`, flexShrink:0,
      }}>
        {[
          [groupingMode ? "Positions" : "Transactions", groupingMode ? groupedData.length : allTxFlat.length, null, null],
          ["Total Cost",    `$${(totalCost/1000).toFixed(1)}K`, null, "Total cost basis across all positions in USD at purchase-date FX rates."],
          ["Current Value", `$${(totalValue/1000).toFixed(1)}K`, null, "Current market value of all positions in USD."],
          ["Total G/L",     `${totalGL>=0?"+":"−"}$${(Math.abs(totalGL)/1000).toFixed(1)}K (${totalCost>0?((totalGL/totalCost)*100).toFixed(1):0}%)`, totalGL>=0?THEME.green:THEME.red, "Net unrealised Gain / Loss: current value minus total cost basis. Does not account for taxes or transaction fees."],
          ...(hasPrdGL?[[`${period==="Intraday"?"1D":period} G/L`, `${totalPrdGL>=0?"+":"−"}$${(Math.abs(totalPrdGL)/1000).toFixed(1)}K`, totalPrdGL>=0?THEME.green:THEME.red, `Gain/Loss over the selected ${period} period, based on period-start reference prices.`]]:[]),
        ].map(([l,v,c,tip])=>(
          <div key={l}>
            <div style={{fontSize:9,color:THEME.text3,textTransform:"uppercase",letterSpacing:".07em",marginBottom:2,display:"flex",alignItems:"center",gap:2}}>
              {l}{tip && <InfoTip text={tip} side="bottom" width={220}/>}
            </div>
            <div style={{fontFamily:THEME.mono,fontSize:12,fontWeight:700,color:c||THEME.text1}}>{v}</div>
          </div>
        ))}
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:10}}>
          <button
            onClick={() => setGroupingMode(m => !m)}
            style={{
              display:"flex", alignItems:"center", gap:5,
              padding:"3px 8px", borderRadius:5, fontSize:10, fontWeight:600,
              background: groupingMode ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${groupingMode ? "rgba(59,130,246,0.35)" : THEME.border2}`,
              color: groupingMode ? THEME.accent : THEME.text3,
              cursor:"pointer", fontFamily:THEME.font, transition:"all 0.15s",
            }}
          >{groupingMode ? "⊕ Grouped" : "≡ Flat"}</button>
          <span style={{fontSize:10,color:THEME.text3}}>Drag column edges to resize · Click headers to sort</span>
        </div>
      </div>
      )}

      {/* Table wrapper */}
      <div style={{ flex:1, overflow:"auto", position:"relative" }}>
        <table style={{ borderCollapse:"collapse", width:"max-content", minWidth:"100%", tableLayout:"fixed" }}>
          <colgroup>
            {TX_COLS_DEFAULT.map(col=><col key={col.key} style={{width:colWidths[col.key]}}/>)}
          </colgroup>
          {/* Header */}
          <thead>
            <tr style={{ height:34, background:THEME.surface, position:"sticky", top:0, zIndex:10 }}>
              {TX_COLS_DEFAULT.map(col=>(
                <th key={col.key} style={thStyle(col)} onClick={()=>col.sortable&&handleSort(col.key)}>
                  <span style={{ display:"inline-flex", alignItems:"center", gap:3 }}>
                    {col.key==="prdPct" ? `${period==="Intraday"?"1D":period} %`
                     : col.key==="prdAbs" ? `${period==="Intraday"?"1D":period} $`
                     : col.label}
                    {col.tip && <InfoTip text={col.tip} side="bottom" width={240}/>}
                  </span>
                  <SortIcon col={col}/>
                  {/* Resize handle */}
                  <div onMouseDown={e=>startResize(e,col.key)}
                    style={{ position:"absolute", right:0, top:0, bottom:0, width:5,
                      cursor:"col-resize", background:"transparent",
                      borderRight:`2px solid transparent`,
                    }}
                    onMouseEnter={e=>e.currentTarget.style.borderRightColor=THEME.accent}
                    onMouseLeave={e=>e.currentTarget.style.borderRightColor="transparent"}
                  />
                </th>
              ))}
            </tr>
          </thead>
          {/* Body */}
          <tbody>
            {displayRows.map((row, i) => {
              const isGroup  = row._rowType === "group";
              const isSubrow = row._rowType === "subrow";

              // ── GROUP ROW ──────────────────────────────────────────────────
              if (isGroup) {
                const grp = row;
                const isExpanded = expandedGroups.has(grp._key);
                const isBuy = grp.type === "BUY";
                const rowBg = i%2===0?"transparent":"rgba(255,255,255,0.015)";
                return (
                  <tr key={grp._key}
                    style={{ height:36, background:rowBg, borderBottom:`1px solid ${THEME.border2}`, transition:"background 0.08s" }}
                    onMouseEnter={e=>e.currentTarget.style.background="rgba(59,130,246,0.06)"}
                    onMouseLeave={e=>e.currentTarget.style.background=rowBg}
                  >
                    <td style={tdStyle(TX_COLS_DEFAULT[0])}>
                      <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                        <button onClick={()=>toggleGroup(grp._key)}
                          style={{ background:"none", border:"none", cursor:"pointer", color:THEME.text3,
                            padding:"1px 3px", display:"flex", borderRadius:3, transition:"color 0.12s",
                            fontSize:9, lineHeight:1 }}
                          onMouseEnter={e=>e.currentTarget.style.color=THEME.accent}
                          onMouseLeave={e=>e.currentTarget.style.color=THEME.text3}
                          title={isExpanded ? "Collapse" : "Expand transactions"}
                        >{isExpanded ? "▼" : "▶"}</button>
                        <span style={{
                          padding:"2px 5px", borderRadius:4, fontSize:9, fontWeight:700,
                          background: grp.type==="MIX" ? "rgba(148,163,184,0.12)"
                                     : isBuy ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
                          color: grp.type==="MIX" ? THEME.text3 : isBuy ? THEME.green : THEME.red,
                          border:`1px solid ${grp.type==="MIX" ? "rgba(148,163,184,0.2)"
                                           : isBuy ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"}`,
                        }}>{grp.type==="MIX" ? "MIX" : grp.type}</span>
                      </div>
                    </td>
                    <td style={tdStyle(TX_COLS_DEFAULT[1])}>
                      <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                        <div style={{ width:6, height:6, borderRadius:"50%", background:grp.portfolioColor, flexShrink:0 }}/>
                        <span style={{ fontFamily:THEME.mono, fontWeight:700, fontSize:12, color:THEME.text1 }}>{grp.symbol}</span>
                      </div>
                    </td>
                    <td style={tdStyle(TX_COLS_DEFAULT[2])}>
                      <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                        <span style={{ fontSize:11, color:THEME.text2 }}>{grp.name || ""}</span>
                        {grp._txs.length > 1 && (
                          <span style={{ fontSize:9, color:THEME.text3, background:"rgba(255,255,255,0.06)",
                            border:`1px solid ${THEME.border2}`, borderRadius:3, padding:"1px 4px", fontFamily:THEME.mono }}>
                            ×{grp._txs.length}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={tdStyle(TX_COLS_DEFAULT[3])}>
                      <span style={{ fontFamily:THEME.mono, fontSize:11, color:THEME.text3 }}>{grp.date}</span>
                    </td>
                    <td style={tdStyle(TX_COLS_DEFAULT[4])}>
                      <span style={{ fontFamily:THEME.mono, fontSize:11, color:THEME.text2, fontWeight:600 }}>{grp.quantity}</span>
                    </td>
                    <td style={tdStyle(TX_COLS_DEFAULT[5])}>
                      {grp._avgBuyPriceUSD != null ? (
                        <span style={{ fontFamily:THEME.mono, fontSize:11, color:THEME.text2 }}>
                          <span style={{ fontSize:9, color:THEME.text3, marginRight:2 }}>avg</span>
                          ${grp._avgBuyPriceUSD.toFixed(2)}
                        </span>
                      ) : <span style={{color:THEME.text3}}>—</span>}
                    </td>
                    <td style={tdStyle(TX_COLS_DEFAULT[6])}>
                      <span style={{ fontFamily:THEME.mono, fontSize:11, color:THEME.text2, fontWeight:600 }}>{fmtUSD(grp._cost)}</span>
                    </td>
                    <td style={tdStyle(TX_COLS_DEFAULT[7])}>
                      <span style={{ fontFamily:THEME.mono, fontSize:11, color:THEME.text2 }}>{fmtUSD(grp._curPriceUSD)}</span>
                    </td>
                    <td style={tdStyle(TX_COLS_DEFAULT[8])}>
                      <span style={{ fontFamily:THEME.mono, fontSize:11, color:THEME.text2, fontWeight:600 }}>{fmtUSD(grp._curValue)}</span>
                    </td>
                    <td style={tdStyle(TX_COLS_DEFAULT[9])}>
                      {grp._glPct != null
                        ? <span style={{ fontFamily:THEME.mono, fontSize:11, fontWeight:600, color:grp._glPct>=0?THEME.green:THEME.red }}>
                            {grp._glPct>=0?"+":""}{grp._glPct.toFixed(1)}%
                          </span>
                        : <span style={{color:THEME.text3}}>—</span>}
                    </td>
                    <td style={tdStyle(TX_COLS_DEFAULT[10])}>
                      {grp._glAbs != null
                        ? <span style={{ fontFamily:THEME.mono, fontSize:11, fontWeight:600, color:grp._glAbs>=0?THEME.green:THEME.red }}>
                            {grp._glAbs>=0?"+":"−"}{fmtUSD(Math.abs(grp._glAbs))}
                          </span>
                        : <span style={{color:THEME.text3}}>—</span>}
                    </td>
                    <td style={tdStyle(TX_COLS_DEFAULT[11])}>
                      {grp._prdPct != null
                        ? <span style={{ fontFamily:THEME.mono, fontSize:11, fontWeight:600, color:grp._prdPct>=0?THEME.green:THEME.red }}>
                            {grp._prdPct>=0?"+":""}{grp._prdPct.toFixed(1)}%
                          </span>
                        : <span style={{color:THEME.text3}}>—</span>}
                    </td>
                    <td style={tdStyle(TX_COLS_DEFAULT[12])}>
                      {grp._prdAbs != null
                        ? <span style={{ fontFamily:THEME.mono, fontSize:11, fontWeight:600, color:grp._prdAbs>=0?THEME.green:THEME.red }}>
                            {grp._prdAbs>=0?"+":"−"}{fmtUSD(Math.abs(grp._prdAbs))}
                          </span>
                        : <span style={{color:THEME.text3}}>—</span>}
                    </td>
                    <td style={tdStyle(TX_COLS_DEFAULT[13])}>
                      {(() => {
                        const q = quotes[grp.symbol];
                        const pe = q?.trailingPE ?? q?.forwardPE ?? null;
                        return pe != null
                          ? <span style={{ fontFamily:THEME.mono, fontSize:11, color:THEME.accent }}>{pe.toFixed(1)}</span>
                          : <span style={{color:THEME.text3}}>—</span>;
                      })()}
                    </td>
                    <td style={tdStyle(TX_COLS_DEFAULT[14])}>
                      {grp._div === undefined
                        ? <span style={{color:THEME.text3,fontSize:10}}>…</span>
                        : grp._div?.yieldPct != null
                          ? <span style={{ fontFamily:THEME.mono, fontSize:11, fontWeight:600, color:"#fbbf24" }}>{grp._div.yieldPct.toFixed(2)}%</span>
                          : <span style={{color:THEME.text3}}>—</span>}
                    </td>
                    <td style={tdStyle(TX_COLS_DEFAULT[15])}>
                      {grp._div === undefined ? (
                        <span style={{color:THEME.text3,fontSize:10}}>…</span>
                      ) : grp._div?.exDate ? (
                        <div>
                          <span style={{ fontFamily:THEME.mono, fontSize:10, color:THEME.text2 }}>{grp._div.exDate}</span>
                          {grp._div.nextExDate && (
                            <div style={{ fontSize:9, color:"#60a5fa", marginTop:1 }}>→ {grp._div.nextExDate}</div>
                          )}
                        </div>
                      ) : <span style={{color:THEME.text3}}>—</span>}
                    </td>
                    <td style={tdStyle(TX_COLS_DEFAULT[16])}>
                      <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                        <a href={`https://finance.yahoo.com/quote/${grp.symbol}`} target="_blank" rel="noopener noreferrer" title="Yahoo Finance"
                          style={{ display:"flex",alignItems:"center",justifyContent:"center",width:22,height:22,borderRadius:5,
                            background:"rgba(100,160,255,0.08)",border:`1px solid rgba(100,160,255,0.18)`,
                            color:"#6ca0ff",fontSize:9,fontWeight:800,textDecoration:"none",fontFamily:THEME.mono,transition:"background 0.12s" }}
                          onMouseEnter={e=>e.currentTarget.style.background="rgba(100,160,255,0.22)"}
                          onMouseLeave={e=>e.currentTarget.style.background="rgba(100,160,255,0.08)"}
                        >Y!</a>
                        <a href={`https://www.perplexity.ai/finance/${grp.symbol}`} target="_blank" rel="noopener noreferrer" title="Perplexity Finance"
                          style={{ display:"flex",alignItems:"center",justifyContent:"center",width:22,height:22,borderRadius:5,
                            background:"rgba(168,120,255,0.08)",border:`1px solid rgba(168,120,255,0.18)`,
                            color:"#a878ff",fontSize:8,fontWeight:800,textDecoration:"none",fontFamily:THEME.mono,transition:"background 0.12s" }}
                          onMouseEnter={e=>e.currentTarget.style.background="rgba(168,120,255,0.22)"}
                          onMouseLeave={e=>e.currentTarget.style.background="rgba(168,120,255,0.08)"}
                        >Px</a>
                      </div>
                    </td>
                    <td style={tdStyle(TX_COLS_DEFAULT[16])}>
                      <button onClick={()=>onRefreshSymbol && onRefreshSymbol(grp.symbol)}
                        title={`Refresh ${grp.symbol}`}
                        style={{ background:"none",border:"none",cursor:"pointer",color:THEME.text3,
                          padding:4,display:"flex",borderRadius:5,transition:"color 0.12s" }}
                        onMouseEnter={e=>e.currentTarget.style.color=THEME.accent}
                        onMouseLeave={e=>e.currentTarget.style.color=THEME.text3}
                      ><RefreshCw size={12}/></button>
                    </td>
                  </tr>
                );
              }

              // ── FLAT or SUB-ROW ────────────────────────────────────────────
              const tx = row;
              const isBuy = tx.type === "BUY";
              const rowBg = isSubrow
                ? "rgba(59,130,246,0.04)"
                : i%2===0?"transparent":"rgba(255,255,255,0.015)";
              return (
                <tr key={isSubrow ? `sub-${tx.id}` : tx.id}
                  style={{ height:36, background:rowBg, borderBottom:`1px solid ${THEME.border2}`,
                    transition:"background 0.08s" }}
                  onMouseEnter={e=>{
                    e.currentTarget.style.background="rgba(59,130,246,0.06)";
                    Array.from(e.currentTarget.cells).forEach(c=>{
                      if(c.style.background.includes("rgba(59,130,246,0.03)"))
                        c.style.background="rgba(59,130,246,0.09)";
                    });
                  }}
                  onMouseLeave={e=>{
                    e.currentTarget.style.background=rowBg;
                    Array.from(e.currentTarget.cells).forEach((c,ci)=>{
                      if(TX_COLS_DEFAULT[ci]&&sortKey===TX_COLS_DEFAULT[ci].key)
                        c.style.background="rgba(59,130,246,0.03)";
                      else c.style.background="transparent";
                    });
                  }}
                >
                  {/* Type — click to refresh this symbol's quote */}
                  <td style={{ ...tdStyle(TX_COLS_DEFAULT[0]), ...(isSubrow ? { borderLeft:`2px solid rgba(59,130,246,0.3)`, paddingLeft:8, opacity:0.85 } : {}) }}>
                    <button
                      onClick={() => onRefreshSymbol && onRefreshSymbol(tx.symbol)}
                      title={`Refresh ${tx.symbol} quote`}
                      style={{
                        padding:"2px 7px", borderRadius:5, fontSize:9, fontWeight:700,
                        background:isBuy?"rgba(74,222,128,0.12)":"rgba(248,113,113,0.12)",
                        color:isBuy?THEME.green:THEME.red,
                        border:`1px solid ${isBuy?"rgba(74,222,128,0.2)":"rgba(248,113,113,0.2)"}`,
                        cursor:"pointer", fontFamily:THEME.font,
                        transition:"background 0.3s ease, color 0.3s ease, font-weight 0.15s",
                        display:"flex", alignItems:"center", gap:4,
                      }}
                      onMouseEnter={e=>{
                        e.currentTarget.style.background=isBuy?"rgba(74,222,128,0.25)":"rgba(248,113,113,0.25)";
                        e.currentTarget.style.boxShadow=`0 0 0 2px ${isBuy?"rgba(74,222,128,0.3)":"rgba(248,113,113,0.3)"}`;
                      }}
                      onMouseLeave={e=>{
                        e.currentTarget.style.background=isBuy?"rgba(74,222,128,0.12)":"rgba(248,113,113,0.12)";
                        e.currentTarget.style.boxShadow="none";
                      }}
                    >
                      {tx.type}
                      <span style={{ fontSize:8, opacity:0.6 }}>⟳</span>
                    </button>
                  </td>
                  {/* Symbol */}
                  <td style={tdStyle(TX_COLS_DEFAULT[1])}>
                    <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                      <div style={{ width:6, height:6, borderRadius:"50%", background:tx.portfolioColor, flexShrink:0 }}/>
                      <span style={{ fontFamily:THEME.mono, fontWeight:700, fontSize:12, color:THEME.text1 }}>{tx.symbol}</span>
                    </div>
                  </td>
                  {/* Name */}
                  <td style={tdStyle(TX_COLS_DEFAULT[2])}>
                    <span style={{ fontSize:11, color:THEME.text2 }}>{tx.name || ""}</span>
                  </td>
                  {/* Date */}
                  <td style={tdStyle(TX_COLS_DEFAULT[3])}>
                    <span style={{ fontFamily:THEME.mono, fontSize:11, color:THEME.text3 }}>{tx.date}</span>
                  </td>
                  {/* Qty */}
                  <td style={tdStyle(TX_COLS_DEFAULT[4])}>
                    <span style={{ fontFamily:THEME.mono, fontSize:11, color:THEME.text2 }}>{tx.quantity}</span>
                  </td>
                  {/* Buy Price — show in original transaction currency */}
                  <td style={tdStyle(TX_COLS_DEFAULT[5])}>
                    <span style={{ fontFamily:THEME.mono, fontSize:11, color:THEME.text2 }}>
                      {CCY_SYM[tx.currency] ?? (tx.currency + " ")}{parseFloat(tx.price).toFixed(2)}
                    </span>
                    {tx.currency && tx.currency !== "USD" && tx.price_usd > 0 && (
                      <span style={{ fontSize:9, color:THEME.text3, marginLeft:4 }}>
                        (${parseFloat(tx.price_usd).toFixed(2)})
                      </span>
                    )}
                  </td>
                  {/* Cost */}
                  <td style={tdStyle(TX_COLS_DEFAULT[6])}>
                    <span style={{ fontFamily:THEME.mono, fontSize:11, color:THEME.text2 }}>{fmtUSD(tx._cost)}</span>
                  </td>
                  {/* Cur. Price (in USD) */}
                  <td style={tdStyle(TX_COLS_DEFAULT[7])}>
                    <span style={{ fontFamily:THEME.mono, fontSize:11, color:THEME.text2 }}>{fmtUSD(tx._curPriceUSD)}</span>
                  </td>
                  {/* Cur. Value */}
                  <td style={tdStyle(TX_COLS_DEFAULT[8])}>
                    <span style={{ fontFamily:THEME.mono, fontSize:11, color:THEME.text2 }}>{fmtUSD(tx._curValue)}</span>
                  </td>
                  {/* G/L % */}
                  <td style={tdStyle(TX_COLS_DEFAULT[9])}>
                    {tx._glPct != null
                      ? <span style={{ fontFamily:THEME.mono, fontSize:11, fontWeight:600, color:tx._glPct>=0?THEME.green:THEME.red }}>
                          {tx._glPct>=0?"+":""}{tx._glPct.toFixed(1)}%
                        </span>
                      : <span style={{color:THEME.text3}}>—</span>
                    }
                  </td>
                  {/* G/L $ */}
                  <td style={tdStyle(TX_COLS_DEFAULT[10])}>
                    {tx._glAbs != null
                      ? <span style={{ fontFamily:THEME.mono, fontSize:11, fontWeight:600, color:tx._glAbs>=0?THEME.green:THEME.red }}>
                          {tx._glAbs>=0?"+":"−"}{fmtUSD(Math.abs(tx._glAbs))}
                        </span>
                      : <span style={{color:THEME.text3}}>—</span>
                    }
                  </td>
                  {/* Period G/L % */}
                  <td style={tdStyle(TX_COLS_DEFAULT[11])}>
                    {tx._prdPct != null
                      ? <span style={{ fontFamily:THEME.mono, fontSize:11, fontWeight:600,
                          color:tx._prdPct>=0?THEME.green:THEME.red }}>
                          {tx._prdPct>=0?"+":""}{tx._prdPct.toFixed(1)}%
                        </span>
                      : <span style={{color:THEME.text3}}>—</span>
                    }
                  </td>
                  {/* Period G/L $ */}
                  <td style={tdStyle(TX_COLS_DEFAULT[12])}>
                    {tx._prdAbs != null
                      ? <span style={{ fontFamily:THEME.mono, fontSize:11, fontWeight:600,
                          color:tx._prdAbs>=0?THEME.green:THEME.red }}>
                          {tx._prdAbs>=0?"+":"−"}{fmtUSD(Math.abs(tx._prdAbs))}
                        </span>
                      : <span style={{color:THEME.text3}}>—</span>
                    }
                  </td>
                  {/* P/E Ratio */}
                  <td style={tdStyle(TX_COLS_DEFAULT[13])}>
                    {(() => {
                      const q = quotes[tx.symbol];
                      const pe = q?.trailingPE ?? q?.forwardPE ?? null;
                      return pe != null
                        ? <span style={{ fontFamily:THEME.mono, fontSize:11,
                            color:THEME.accent }}>{pe.toFixed(1)}</span>
                        : <span style={{color:THEME.text3}}>—</span>;
                    })()}
                  </td>
                  {/* Div. Yield */}
                  <td style={tdStyle(TX_COLS_DEFAULT[14])}>
                    {tx._div === undefined
                      ? <span style={{color:THEME.text3,fontSize:10}}>…</span>
                      : tx._div?.yieldPct != null
                        ? <span style={{ fontFamily:THEME.mono, fontSize:11, fontWeight:600,
                            color:"#fbbf24" }}>{tx._div.yieldPct.toFixed(2)}%</span>
                        : <span style={{color:THEME.text3}}>—</span>}
                  </td>
                  {/* Ex-Date */}
                  <td style={tdStyle(TX_COLS_DEFAULT[15])}>
                    {tx._div === undefined ? (
                      <span style={{color:THEME.text3,fontSize:10}}>…</span>
                    ) : tx._div?.exDate ? (
                      <div>
                        <span style={{ fontFamily:THEME.mono, fontSize:10, color:THEME.text2 }}>
                          {tx._div.exDate}
                        </span>
                        {tx._div.nextExDate && (
                          <div style={{ fontSize:9, color:"#60a5fa", marginTop:1 }}>
                            → {tx._div.nextExDate}
                          </div>
                        )}
                      </div>
                    ) : <span style={{color:THEME.text3}}>—</span>}
                  </td>
                  {/* Links */}
                  <td style={tdStyle(TX_COLS_DEFAULT[16])}>
                    <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                      <a href={`https://finance.yahoo.com/quote/${tx.symbol}`}
                        target="_blank" rel="noopener noreferrer"
                        title="Yahoo Finance"
                        style={{
                          display:"flex", alignItems:"center", justifyContent:"center",
                          width:22, height:22, borderRadius:5,
                          background:"rgba(100,160,255,0.08)",
                          border:`1px solid rgba(100,160,255,0.18)`,
                          color:"#6ca0ff", fontSize:9, fontWeight:800,
                          textDecoration:"none", fontFamily:THEME.mono,
                          transition:"background 0.12s",
                        }}
                        onMouseEnter={e=>e.currentTarget.style.background="rgba(100,160,255,0.22)"}
                        onMouseLeave={e=>e.currentTarget.style.background="rgba(100,160,255,0.08)"}
                      >Y!</a>
                      <a href={`https://www.perplexity.ai/finance/${tx.symbol}`}
                        target="_blank" rel="noopener noreferrer"
                        title="Perplexity Finance"
                        style={{
                          display:"flex", alignItems:"center", justifyContent:"center",
                          width:22, height:22, borderRadius:5,
                          background:"rgba(168,120,255,0.08)",
                          border:`1px solid rgba(168,120,255,0.18)`,
                          color:"#a878ff", fontSize:8, fontWeight:800,
                          textDecoration:"none", fontFamily:THEME.mono,
                          transition:"background 0.12s",
                        }}
                        onMouseEnter={e=>e.currentTarget.style.background="rgba(168,120,255,0.22)"}
                        onMouseLeave={e=>e.currentTarget.style.background="rgba(168,120,255,0.08)"}
                      >Px</a>
                    </div>
                  </td>
                  {/* Actions */}
                  <td style={tdStyle(TX_COLS_DEFAULT[16])}>
                    <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                      <button onClick={()=>onEdit(tx.portfolioId, tx)}
                        style={{ background:"none", border:"none", cursor:"pointer", color:THEME.text3,
                          padding:4, display:"flex", borderRadius:5, transition:"color 0.12s" }}
                        onMouseEnter={e=>e.currentTarget.style.color=THEME.accent}
                        onMouseLeave={e=>e.currentTarget.style.color=THEME.text3}
                      ><Edit2 size={12}/></button>
                      <button onClick={()=>setDeletePending({
                          portfolioId:tx.portfolioId, tx,
                          portfolio: portfolios.find(p=>p.id===tx.portfolioId),
                        })}
                        style={{ background:"none", border:"none", cursor:"pointer", color:THEME.text3,
                          padding:4, display:"flex", borderRadius:5, transition:"color 0.12s" }}
                        onMouseEnter={e=>e.currentTarget.style.color=THEME.red}
                        onMouseLeave={e=>e.currentTarget.style.color=THEME.text3}
                      ><Trash2 size={12}/></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {/* Footer totals */}
          <tfoot>
            <tr style={{ height:36, background:THEME.surface, borderTop:`2px solid ${THEME.border}` }}>
              {TX_COLS_DEFAULT.map((col,ci)=>(
                <td key={col.key} style={{ ...tdStyle(col), fontFamily:THEME.mono, fontSize:11, fontWeight:700, color:THEME.text2 }}>
                  {ci===0&&<span style={{color:THEME.text3,fontFamily:THEME.font,fontSize:10}}>TOTAL</span>}
                  {col.key==="cost"    && `$${totalCost.toLocaleString("en-US",{maximumFractionDigits:0})}`}
                  {col.key==="curValue"&& (totalValue>0?`$${totalValue.toLocaleString("en-US",{maximumFractionDigits:0})}`:"")}
                  {col.key==="prdAbs" && hasPrdGL&&totalPrdGL!==0&&(
                    <span style={{color:totalPrdGL>=0?THEME.green:THEME.red}}>
                      {totalPrdGL>=0?"+":"−"}${Math.abs(totalPrdGL).toLocaleString("en-US",{maximumFractionDigits:0})}
                    </span>
                  )}
                  {col.key==="prdPct" && hasPrdGL&&totalPrdGL!==0&&totalValue>0&&(
                    <span style={{color:totalPrdGL>=0?THEME.green:THEME.red}}>
                      {totalPrdGL>=0?"+":""}{(totalPrdGL/totalValue*100).toFixed(1)}%
                    </span>
                  )}
                  {col.key==="glAbs"  && totalGL!==0&&(
                    <span style={{color:totalGL>=0?THEME.green:THEME.red}}>
                      {totalGL>=0?"+":"−"}${Math.abs(totalGL).toLocaleString("en-US",{maximumFractionDigits:0})}
                    </span>
                  )}
                  {col.key==="glPct"  && totalCost>0&&totalGL!==0&&(
                    <span style={{color:totalGL>=0?THEME.green:THEME.red}}>
                      {totalGL>=0?"+":""}{(totalGL/totalCost*100).toFixed(1)}%
                    </span>
                  )}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Delete confirmation overlay */}
      {deletePending && (
        <DeleteConfirmOverlay
          tx={deletePending.tx}
          portfolio={deletePending.portfolio}
          onConfirm={async () => {
            await onDelete(deletePending.portfolioId, deletePending.tx.id);
            setDeletePending(null);
          }}
          onCancel={()=>setDeletePending(null)}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ADD TRANSACTION MODAL  (with auto-lookup)
// ════════════════════════════════════════════════════════════════════════════

const PERIODICITY_OPTIONS = [
  { value: "daily",         label: "Täglich",         description: "Jeden Tag"      },
  { value: "weekly",        label: "Wöchentlich",     description: "Alle 7 Tage"    },
  { value: "monthly",       label: "Monatlich",       description: "Jeden Monat"    },
  { value: "quarterly",     label: "Vierteljährlich", description: "Alle 3 Monate"  },
  { value: "semi-annually", label: "Halbjährlich",    description: "Alle 6 Monate"  },
  { value: "annually",      label: "Jährlich",        description: "Einmal pro Jahr" },
];

function generatePeriodDates(startDate, endDate, periodicity) {
  if (!startDate || !endDate) return [];
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  const endMs = Date.UTC(ey, em - 1, ed);
  const dates = [];
  let y = sy, mo = sm - 1, d = sd;
  for (let i = 0; i < 1000; i++) { // safety cap
    const cur = Date.UTC(y, mo, d);
    if (cur > endMs) break;
    dates.push(`${y}-${String(mo+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`);
    switch (periodicity) {
      case "daily":         d  += 1;  break;
      case "weekly":        d  += 7;  break;
      case "monthly":       mo += 1;  break;
      case "quarterly":     mo += 3;  break;
      case "semi-annually": mo += 6;  break;
      case "annually":      y  += 1;  break;
    }
    // Normalize overflow (e.g. Jan 31 + 1 month → Feb 28)
    const norm = new Date(Date.UTC(y, mo, d));
    y = norm.getUTCFullYear(); mo = norm.getUTCMonth(); d = norm.getUTCDate();
  }
  return dates;
}

function AddTxModal({ onClose, onAdd, rates, portfolios, defaultPortfolioId, initialTx, editMode, onSavePlan }) {
  const [portfolioId, setPortfolioId] = useState(initialTx?.portfolio_id ?? defaultPortfolioId ?? portfolios[0]?.id);
  const [type,        setType]        = useState(initialTx?.type?.toLowerCase() || "buy");
  const [symbol,      setSymbol]      = useState(initialTx?.symbol || "");
  const [date,        setDate]        = useState(initialTx?.date || new Date().toISOString().slice(0,10));
  const [name,        setName]        = useState(initialTx?.name || "");
  const [qty,         setQty]         = useState(initialTx?.quantity ?? "");
  const [price,       setPrice]       = useState(initialTx?.price ?? "");
  const [currency,    setCurrency]    = useState(initialTx?.currency || "USD");
  const [busy,        setBusy]        = useState(false);
  const [lookupBusy,  setLookupBusy]  = useState(false);
  const [lookupMsg,   setLookupMsg]   = useState("");
  const [priceEdited, setPriceEdited] = useState(!!initialTx?.price);
  const [error,       setError]       = useState("");
  const lookupTimer = useRef(null);

  // Recurring purchase state
  const [purchaseMode, setPurchaseMode] = useState("single"); // "single" | "recurring"
  const [budget,       setBudget]       = useState("");
  const [periodicity,  setPeriodicity]  = useState("monthly");
  const [endDate,      setEndDate]      = useState(() => new Date().toISOString().slice(0,10));

  // Use refs so the async callback always sees the latest values without stale closures
  const priceEditedRef = useRef(priceEdited);
  useEffect(() => { priceEditedRef.current = priceEdited; }, [priceEdited]);
  const currencyRef = useRef(currency);
  useEffect(() => { currencyRef.current = currency; }, [currency]);

  const doLookup = useCallback(async (sym, dt) => {
    sym = sym.trim().toUpperCase();
    if (!sym || !dt) return;
    setLookupBusy(true); setLookupMsg("");
    try {
      const res = await quotesApi.lookup(sym, dt);
      if (res.companyName && res.companyName !== sym)
        setName(prev => (!prev || prev === sym) ? res.companyName : prev);
      // Always set price if not manually edited — uses ref so never stale
      if (!priceEditedRef.current && res.price != null) {
        setPrice(res.price.toFixed(2));
        if (res.currency && res.currency !== currencyRef.current) setCurrency(res.currency);
      }
      // Show status regardless — encode: ok:<actualDate>:<isHistorical 1/0>:<daysOff>
      if (res.price != null) {
        setLookupMsg(`ok:${res.date}:${res.isHistorical ? 1 : 0}:${res.daysOff ?? 0}`);
      }
    } catch(e) { setLookupMsg(`err:${e.message}`); }
    setLookupBusy(false);
  }, []); // stable — uses refs internally

  useEffect(() => {
    if (editMode) return;
    clearTimeout(lookupTimer.current);
    // Only auto-lookup when symbol looks complete (≥2 chars) and date is set
    const sym = symbol.trim();
    if (sym.length >= 2 && date) {
      lookupTimer.current = setTimeout(() => doLookup(sym, date), 800);
    }
    return () => clearTimeout(lookupTimer.current);
  }, [symbol, date, doLookup]);

  const handleAdd = async () => {
    const sym    = symbol.trim().toUpperCase();
    const priceN = parseFloat(price);
    if (!sym || !portfolioId || isNaN(priceN) || priceN <= 0) {
      setError("Symbol and a valid price are required"); return;
    }

    if (purchaseMode === "recurring") {
      const budgetN = parseFloat(budget);
      if (isNaN(budgetN) || budgetN <= 0) { setError("Budget must be a positive number"); return; }
      if (pastRecurDates.length === 0) { setError("Keine vergangenen Kauftermine — Start Date in der Vergangenheit setzen"); return; }
      setBusy(true);
      try {
        // Use start-date FX rate for all transactions (one API call instead of N)
        let price_usd = priceN;
        if (currency !== "USD") {
          try { const hist = await fxApi.historical(date, currency, "USD"); price_usd = priceN * (hist?.rate ?? (1/(rates[currency]??1))); }
          catch { price_usd = priceN / (rates[currency]??1); }
        }
        const qtyN = budgetN / priceN;
        for (const d of pastRecurDates) {
          await onAdd(portfolioId, { symbol:sym, name:name||sym, quantity:qtyN, price:priceN, price_usd, date:d, type, currency });
        }
        // Persist the savings plan (rule) if we have a callback
        if (onSavePlan) {
          const lastBooked = pastRecurDates.length > 0 ? pastRecurDates[pastRecurDates.length - 1] : null;
          await onSavePlan(portfolioId, {
            symbol: sym, name: name||sym, currency,
            start_date: date, end_date: endDate,
            periodicity, budget_per_period: budgetN,
            last_booked_date: lastBooked,
          });
        }
        onClose();
      } catch(e) { setError(e.message); }
      setBusy(false);
    } else {
      if (!qty) return;
      const qtyN = parseFloat(qty);
      if (isNaN(qtyN) || qtyN <= 0) { setError("Quantity and price must be positive"); return; }
      setBusy(true);
      try {
        let price_usd = priceN;
        if (currency !== "USD") {
          try { const hist = await fxApi.historical(date, currency, "USD"); price_usd = priceN * (hist?.rate ?? (1/(rates[currency]??1))); }
          catch { price_usd = priceN / (rates[currency]??1); }
        }
        await onAdd(portfolioId, { symbol:sym, name:name||sym, quantity:qtyN, price:priceN, price_usd, date, type, currency });
        onClose();
      } catch(e) { setError(e.message); }
      setBusy(false);
    }
  };

  const lookupOk  = lookupMsg.startsWith("ok:");
  const lookupErr = lookupMsg.startsWith("err:");
  const lookupParts = lookupOk ? lookupMsg.slice(3).split(":") : null;
  const lookupDate       = lookupParts ? lookupParts[0] : null;
  const lookupHistorical = lookupParts ? lookupParts[1] === "1" : false;
  const lookupDaysOff    = lookupParts ? parseInt(lookupParts[2] ?? "0") : 0;

  // Recurring computed
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const recurDates = useMemo(() => {
    if (purchaseMode !== "recurring") return [];
    return generatePeriodDates(date, endDate, periodicity);
  }, [purchaseMode, date, endDate, periodicity]);

  // Only past dates get booked as actual transactions
  const pastRecurDates   = useMemo(() => recurDates.filter(d => d <= todayStr), [recurDates, todayStr]);
  const futureRecurDates = useMemo(() => recurDates.filter(d => d >  todayStr), [recurDates, todayStr]);

  const fracQty = useMemo(() => {
    const b = parseFloat(budget), p = parseFloat(price);
    return (!isNaN(b) && b > 0 && !isNaN(p) && p > 0) ? b / p : null;
  }, [budget, price]);

  return (
    <Modal title={editMode?"Edit Transaction":"Add Transaction"} onClose={onClose}>
      {/* Portfolio selector — only in add mode with multiple portfolios */}
      {!editMode && portfolios.length > 1 && (
        <div style={{ marginBottom:16 }}>
          <FLabel>Portfolio</FLabel>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {portfolios.map(p => (
              <button key={p.id} onClick={() => setPortfolioId(p.id)} style={{
                padding:"5px 12px", borderRadius:8, fontSize:11, fontWeight:600,
                border:`1.5px solid ${portfolioId===p.id ? p.color : THEME.border}`,
                background: portfolioId===p.id ? p.color+"22" : "transparent",
                color: portfolioId===p.id ? p.color : THEME.text3,
                cursor:"pointer", display:"flex", alignItems:"center", gap:6,
              }}>
                <span style={{ width:7, height:7, borderRadius:"50%", background:p.color, display:"inline-block" }}/>
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Buy/Sell toggle */}
      <div style={{ display:"flex", gap:8, marginBottom:12 }}>
        {["buy","sell"].map(t => (
          <button key={t} onClick={() => setType(t)} style={{
            flex:1, padding:"9px 0", borderRadius:10, fontSize:12, fontWeight:700,
            border:`1.5px solid ${type===t?THEME.accent:THEME.border}`,
            background:type===t?"rgba(59,130,246,0.15)":"transparent",
            color:type===t?THEME.accent:THEME.text3, cursor:"pointer",
            textTransform:"uppercase", letterSpacing:"0.06em",
          }}>{t==="buy"?"▲ Buy":"▼ Sell"}</button>
        ))}
      </div>

      {/* Purchase mode toggle — only in add mode */}
      {!editMode && (
        <div style={{ display:"flex", marginBottom:16, borderRadius:9, overflow:"hidden",
          border:`1px solid ${THEME.border}`, background:THEME.surface }}>
          {[["single","☐ Einmaliger Kauf"],["recurring","↻ Wiederkehrend"]].map(([m, label]) => (
            <button key={m} onClick={() => setPurchaseMode(m)} style={{
              flex:1, padding:"7px 0", fontSize:11, fontWeight:700, border:"none",
              cursor:"pointer", transition:"all 0.15s", fontFamily:THEME.font,
              background: purchaseMode===m ? "rgba(59,130,246,0.18)" : "transparent",
              color:       purchaseMode===m ? THEME.accent : THEME.text3,
              letterSpacing:"0.03em",
            }}>{label}</button>
          ))}
        </div>
      )}

      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        {/* Row 1: Date | Symbol  — date first so lookup fires with correct date */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <div>
            <FLabel>{purchaseMode==="recurring" ? "Start Date" : "Purchase Date"}</FLabel>
            <FInput type="date" value={date}
              onChange={e => { setDate(e.target.value); setLookupMsg(""); setPriceEdited(false); }}/>
          </div>
          <div>
            <FLabel>Symbol</FLabel>
            <FInput placeholder="AAPL, NESN.SW…" value={symbol}
              style={{ textTransform:"uppercase", fontFamily:THEME.mono, fontWeight:700 }}
              onChange={e => { setSymbol(e.target.value.toUpperCase()); setError(""); setLookupMsg(""); }}/>
          </div>
        </div>

        {/* Row 1b: End Date + Periodicity — recurring only */}
        {purchaseMode === "recurring" && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div>
              <FLabel>End Date</FLabel>
              <FInput type="date" value={endDate} onChange={e => setEndDate(e.target.value)}/>
            </div>
            <div>
              <FLabel>Periodicity</FLabel>
              <FSelect value={periodicity} onChange={e => setPeriodicity(e.target.value)}>
                {PERIODICITY_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label} — {o.description}</option>
                ))}
              </FSelect>
            </div>
          </div>
        )}
        {/* Row 2: Company name + lookup status */}
        <div>
          <FLabel>
            Company Name <span style={{ fontWeight:400, opacity:0.5 }}>(optional)</span>
            {lookupBusy && (
              <span className="spin" style={{ marginLeft:8, fontSize:10, color:THEME.accent }}>⟳</span>
            )}
            {lookupOk && !lookupBusy && (
              <span style={{ marginLeft:8, fontSize:9,
                color: lookupHistorical ? THEME.green : THEME.yellow,
                background: lookupHistorical ? "rgba(74,222,128,0.10)" : "rgba(251,191,36,0.10)",
                border: `1px solid ${lookupHistorical ? "rgba(74,222,128,0.25)" : "rgba(251,191,36,0.25)"}`,
                borderRadius:4, padding:"1px 5px",
              }}>
                {lookupHistorical ? "📅 hist." : "⚡ live"} {lookupDate}
              </span>
            )}
            {lookupErr && !lookupBusy && (
              <span style={{ marginLeft:8, fontSize:9, color:THEME.red }}>⚠ not found</span>
            )}
          </FLabel>
          <FInput placeholder="Auto-filled from symbol…" value={name} onChange={e => setName(e.target.value)}/>
        </div>
        {/* Row 3: Quantity (single) OR Budget per period (recurring) */}
        {purchaseMode === "single" ? (
          <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:12, alignItems:"flex-end" }}>
            <div>
              <FLabel>Quantity</FLabel>
              <FInput type="number" min="0" step="any" placeholder="0" value={qty} onChange={e => setQty(e.target.value)}/>
            </div>
            <button onClick={() => { setPriceEdited(false); doLookup(symbol, date); }}
              disabled={!symbol||!date||lookupBusy}
              style={{
                height:42, padding:"0 16px", borderRadius:10, cursor:"pointer",
                border:`1.5px solid ${THEME.accent}`, background:"rgba(59,130,246,0.12)",
                color:lookupBusy?THEME.text3:THEME.accent, fontSize:11, fontWeight:700,
                fontFamily:"inherit", whiteSpace:"nowrap",
                opacity:(!symbol||!date)?0.45:1,
              }}>
              {lookupBusy ? <span className="spin">⟳</span> : "⬇ Get Price"}
            </button>
          </div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:12, alignItems:"flex-end" }}>
            <div>
              <FLabel>Budget per Period</FLabel>
              <FInput type="number" min="0" step="any" placeholder="100.00"
                value={budget} onChange={e => setBudget(e.target.value)}/>
            </div>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4, paddingBottom:2 }}>
              <button onClick={() => { setPriceEdited(false); doLookup(symbol, date); }}
                disabled={!symbol||!date||lookupBusy}
                style={{
                  height:42, padding:"0 14px", borderRadius:10, cursor:"pointer",
                  border:`1.5px solid ${THEME.accent}`, background:"rgba(59,130,246,0.12)",
                  color:lookupBusy?THEME.text3:THEME.accent, fontSize:11, fontWeight:700,
                  fontFamily:"inherit", whiteSpace:"nowrap",
                  opacity:(!symbol||!date)?0.45:1,
                }}>
                {lookupBusy ? <span className="spin">⟳</span> : "⬇ Get Price"}
              </button>
              {fracQty != null && (
                <span style={{ fontSize:10, fontFamily:THEME.mono, color:THEME.text3, whiteSpace:"nowrap" }}>
                  ≈ {fracQty.toFixed(6)} shares
                </span>
              )}
            </div>
          </div>
        )}
        {/* Row 4: Price | Currency */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <div style={{ position:"relative" }}>
            <FLabel>Price per Share</FLabel>
            <FInput type="number" min="0" step="any" placeholder="0.00" value={price}
              onChange={e => { setPrice(e.target.value); setPriceEdited(true); }}/>
            {lookupOk && !priceEdited && !lookupBusy && (
              <span style={{ position:"absolute", right:12, bottom:11, fontSize:9,
                color: lookupHistorical ? THEME.green : THEME.yellow,
                pointerEvents:"none" }}>
                {lookupHistorical ? "📅 hist." : "⚡ live"}
              </span>
            )}
          </div>
          <div>
            <FLabel>Currency</FLabel>
            <FSelect value={currency} onChange={e => setCurrency(e.target.value)}>
              {Object.keys(CCY_SYM).map(c => <option key={c} value={c}>{c}</option>)}
            </FSelect>
          </div>
        </div>
      </div>

      {/* Recurring preview card */}
      {purchaseMode === "recurring" && recurDates.length > 0 && budget && price && (
        <div style={{ marginTop:14, border:`1px solid ${THEME.border}`, borderRadius:10, overflow:"hidden" }}>
          {/* Header */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
            padding:"9px 14px", background:THEME.surface }}>
            <span style={{ fontSize:11, fontWeight:700, color:THEME.text2 }}>
              Sparplan-Vorschau
            </span>
            <span style={{ fontSize:10, fontFamily:THEME.mono, color:THEME.text3 }}>
              {recurDates.length} Termin{recurDates.length!==1?"e":""}
            </span>
          </div>
          {/* Past — will be booked */}
          {pastRecurDates.length > 0 && (
            <div style={{ padding:"8px 14px", borderTop:`1px solid ${THEME.border}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                <span style={{ fontSize:10, fontWeight:700, color:THEME.green, letterSpacing:"0.05em" }}>
                  ✓ WIRD GEBUCHT ({pastRecurDates.length})
                </span>
                <span style={{ fontSize:10, fontFamily:THEME.mono, color:THEME.green }}>
                  {((parseFloat(budget)||0) * pastRecurDates.length).toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})} {currency}
                </span>
              </div>
              {fracQty != null && (
                <div style={{ fontSize:10, color:THEME.text3, marginBottom:6, fontFamily:THEME.mono }}>
                  {fracQty.toFixed(6)} Anteile × {pastRecurDates.length} = {(fracQty * pastRecurDates.length).toFixed(4)} Anteile
                </div>
              )}
              <div style={{ display:"flex", flexWrap:"wrap", gap:3 }}>
                {pastRecurDates.slice(0,8).map(d => (
                  <span key={d} style={{ fontSize:9, fontFamily:THEME.mono, color:THEME.green,
                    background:"rgba(74,222,128,0.08)", border:`1px solid rgba(74,222,128,0.2)`,
                    borderRadius:4, padding:"2px 5px" }}>{d}</span>
                ))}
                {pastRecurDates.length > 8 && (
                  <span style={{ fontSize:9, color:THEME.text3, padding:"2px 4px" }}>
                    +{pastRecurDates.length - 8} weitere
                  </span>
                )}
              </div>
            </div>
          )}
          {/* Future — planned rule, not booked */}
          {futureRecurDates.length > 0 && (
            <div style={{ padding:"8px 14px", borderTop:`1px solid ${THEME.border}`,
              background:"rgba(255,255,255,0.02)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                <span style={{ fontSize:10, fontWeight:700, color:THEME.text3, letterSpacing:"0.05em" }}>
                  ↻ GEPLANT, NOCH NICHT FÄLLIG ({futureRecurDates.length})
                </span>
                <span style={{ fontSize:10, fontFamily:THEME.mono, color:THEME.text3 }}>
                  {((parseFloat(budget)||0) * futureRecurDates.length).toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})} {currency}
                </span>
              </div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:3 }}>
                {futureRecurDates.slice(0,5).map(d => (
                  <span key={d} style={{ fontSize:9, fontFamily:THEME.mono, color:THEME.text3,
                    background:THEME.surface2, border:`1px solid ${THEME.border2}`,
                    borderRadius:4, padding:"2px 5px", opacity:0.7 }}>{d}</span>
                ))}
                {futureRecurDates.length > 5 && (
                  <span style={{ fontSize:9, color:THEME.text3, padding:"2px 4px", opacity:0.6 }}>
                    +{futureRecurDates.length - 5} weitere…
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      {purchaseMode === "recurring" && date && endDate && date > endDate && (
        <div style={{ fontSize:11, color:THEME.red, marginTop:10 }}>
          ⚠ Start Date muss vor End Date liegen
        </div>
      )}
      {purchaseMode === "recurring" && recurDates.length > 0 && pastRecurDates.length === 0 && (
        <div style={{ fontSize:11, color:"#f59e0b", marginTop:10 }}>
          ⚠ Alle Termine liegen in der Zukunft — noch keine Käufe zum Buchen
        </div>
      )}

      {error && <div style={{ fontSize:12, color:THEME.red, marginTop:10 }}>{error}</div>}
      <div style={{ display:"flex", gap:10, marginTop:20 }}>
        <button onClick={onClose} style={{ flex:1, padding:"11px 0", borderRadius:10,
          border:`1px solid ${THEME.border}`, background:"transparent",
          color:THEME.text3, cursor:"pointer", fontSize:13, fontWeight:600 }}>Cancel</button>
        <button onClick={handleAdd}
          disabled={purchaseMode==="single"
            ? (!symbol||!qty||!price||busy)
            : (!symbol||!budget||!price||pastRecurDates.length===0||busy)}
          style={{ flex:2, padding:"11px 0", borderRadius:10, border:"none",
            background:type==="buy"?THEME.accent:THEME.red, color:"#fff",
            cursor:"pointer", fontSize:13, fontWeight:700,
            opacity:(purchaseMode==="single"
              ? (!symbol||!qty||!price||busy)
              : (!symbol||!budget||!price||pastRecurDates.length===0||busy)
            ) ? 0.5 : 1 }}>
          {busy
            ? `Saving…`
            : purchaseMode==="recurring"
              ? `✓ ${pastRecurDates.length} Kauf${pastRecurDates.length!==1?"käufe":""} buchen`
              : editMode ? "Save Changes" : `Add ${type==="buy"?"Buy":"Sell"}`}
        </button>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ADD PORTFOLIO MODAL
// ════════════════════════════════════════════════════════════════════════════
function AddPortfolioModal({ onClose, onAdd }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PORTFOLIO_COLORS[0]);
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try { await onAdd(name.trim(), color); onClose(); }
    catch(e) { setBusy(false); }
  };

  return (
    <Modal title="New Portfolio" onClose={onClose} width={360}>
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        <div>
          <FLabel>Portfolio Name</FLabel>
          <FInput placeholder="e.g. Tech Growth, ETF Core…" value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key==="Enter" && handle()}/>
        </div>
        <div>
          <FLabel>Color</FLabel>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {PORTFOLIO_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)} style={{
                width:28, height:28, borderRadius:"50%", border:"none",
                background:c, cursor:"pointer",
                outline: color===c ? `2px solid ${THEME.text1}` : "none",
                outlineOffset:2,
              }}/>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display:"flex", gap:10, marginTop:20 }}>
        <button onClick={onClose} style={{ flex:1, padding:"10px 0", borderRadius:10,
          border:`1px solid ${THEME.border}`, background:"transparent",
          color:THEME.text3, cursor:"pointer", fontSize:13, fontWeight:600 }}>Cancel</button>
        <button onClick={handle} disabled={!name.trim()||busy}
          style={{ flex:2, padding:"10px 0", borderRadius:10, border:"none",
            background:color, color:"#fff", cursor:"pointer", fontSize:13, fontWeight:700,
            opacity:!name.trim()?0.5:1 }}>
          {busy?"Creating…":"Create Portfolio"}
        </button>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SETTINGS MODAL
// ════════════════════════════════════════════════════════════════════════════
function SettingsModal({ onClose, dataSource, setDataSource, avApiKey, setAvApiKey, onSave, avUsage }) {
  const used = avUsage?.today ?? 0;
  const limit = 25;
  const pct   = Math.min(100, (used/limit)*100);
  const barColor = pct>=90?"#ef4444":pct>=70?"#f59e0b":"#22c55e";

  return (
    <Modal title="Data Source Settings" onClose={onClose}>
      <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
        <div>
          <FLabel>Quote Data Source</FLabel>
          <div style={{ display:"flex", gap:8, marginTop:6 }}>
            {[["yahoo","Yahoo Finance"],["alphavantage","Alpha Vantage"]].map(([val,label]) => (
              <button key={val} onClick={() => setDataSource(val)} style={{
                flex:1, padding:"10px 0", borderRadius:10, fontSize:12, fontWeight:700,
                border:`1.5px solid ${dataSource===val?THEME.accent:THEME.border}`,
                background:dataSource===val?"rgba(59,130,246,0.15)":"transparent",
                color:dataSource===val?THEME.accent:THEME.text3,
                cursor:"pointer", letterSpacing:"0.04em",
              }}>{label}</button>
            ))}
          </div>
        </div>
        {dataSource==="alphavantage" && (
          <div>
            <FLabel>Alpha Vantage API Key</FLabel>
            <FInput placeholder="Free key at alphavantage.co"
              value={avApiKey} onChange={e => setAvApiKey(e.target.value)}
              style={{ fontFamily:THEME.mono, fontSize:12 }}/>
            <div style={{ marginTop:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:11,
                color:THEME.text2, marginBottom:5 }}>
                <span>Today's usage</span>
                <span className="mono" style={{ color:barColor }}>{used} / {limit}</span>
              </div>
              <div style={{ height:5, borderRadius:3, background:"rgba(255,255,255,0.08)" }}>
                <div style={{ height:"100%", borderRadius:3, background:barColor,
                  width:`${pct}%`, transition:"width 0.3s" }}/>
              </div>
            </div>
          </div>
        )}
        <button onClick={onSave} style={{ padding:"11px 0", borderRadius:10, border:"none",
          background:THEME.accent, color:"#fff", cursor:"pointer",
          fontSize:13, fontWeight:700 }}>Save Settings</button>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// VIEW MODE TOGGLE  (inline on main screen)
// ════════════════════════════════════════════════════════════════════════════
function ViewModeToggle({ viewMode, onViewMode, activeTab, portfolioCount=1 }) {
  // With only 1 portfolio, none of the split/consolidated modes add value
  if (portfolioCount <= 1) return null;

  // Holdings: no "single" — aggregated IS the single-portfolio merged view
  if (activeTab === "holdings") {
    var modes = [
      { key:"consolidated", label:"Consolidated", icon:"⊞" },
      { key:"aggregated",   label:"Aggregated",   icon:"⊕" },
    ];
  } else if (activeTab === "chart" || activeTab === "transactions") {
    var modes = [
      { key:"single", label:"Combined",      icon:"□" },
      { key:"split",  label:"Per Portfolio", icon:"⊞" },
    ];
  } else if (activeTab === "performance") {
    var modes = [
      { key:"consolidated", label:"Consolidated", icon:"⊞" },
      { key:"aggregated",   label:"Aggregated",   icon:"⊕" },
    ];
  } else {
    return null;
  }

  return (
    <div style={{
      display:"flex", alignItems:"center", gap:2,
      background:"rgba(0,0,0,0.25)", borderRadius:9,
      padding:3, border:`1px solid ${THEME.border}`,
    }}>
      {modes.map(m => (
        <button key={m.key} onClick={() => onViewMode(m.key)} style={{
          display:"flex", alignItems:"center", gap:5,
          padding:"4px 12px", borderRadius:7, border:"none", cursor:"pointer",
          fontSize:10, fontWeight:700, fontFamily:"inherit",
          transition:"all 0.15s",
          background: viewMode === m.key ? "rgba(59,130,246,0.22)" : "transparent",
          color:       viewMode === m.key ? THEME.accent : THEME.text3,
          letterSpacing:"0.04em",
        }}>
          <span style={{ fontSize:12, lineHeight:1 }}>{m.icon}</span>
          {m.label}
        </button>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SUMMARY BAR
// ════════════════════════════════════════════════════════════════════════════
function SummaryBar({ nodes, totalValueUSD, totalCostUSD, portfolioPerf, period, currency, rates, colorMode, onColorMode }) {
  const totalNetGain = totalValueUSD - totalCostUSD;
  return (
    <div style={{ padding:"10px 22px", borderBottom:`1px solid ${THEME.border2}`,
      background:THEME.surface, display:"flex", alignItems:"center", gap:24, flexShrink:0 }}>
      {[
        ["Total Value",   fmtVal(totalValueUSD, currency, rates), null, "Current market value of all positions across all portfolios."],
        ["Total Cost",    fmtVal(totalCostUSD,  currency, rates), null, "Total cost basis: sum of all purchases at their original prices converted to USD."],
        ["Net G/L",       `${totalNetGain>=0?"+":""}${fmtVal(Math.abs(totalNetGain),currency,rates)} (${fmtPct(totalCostUSD>0?(totalNetGain/totalCostUSD)*100:null)})`,
                          totalNetGain>=0?THEME.green:THEME.red, "Net unrealised Gain / Loss across all portfolios. No taxes or fees deducted."],
        [`${period==="Intraday"?"1D":period} Return`, fmtPct(portfolioPerf),
                          portfolioPerf!=null?(portfolioPerf>=0?THEME.green:THEME.red):THEME.text3, `Weighted price change over the selected period (${period}).`],
      ].map(([lbl,val,color,tip]) => (
        <div key={lbl}>
          <div style={{ fontSize:9, color:THEME.text3, textTransform:"uppercase",
            letterSpacing:"0.08em", marginBottom:2, display:"flex", alignItems:"center", gap:2 }}>
            {lbl}{tip && <InfoTip text={tip} width={210} side="bottom"/>}
          </div>
          <div className="mono" style={{ fontSize:13, fontWeight:700, color:color??THEME.text1 }}>{val}</div>
        </div>
      ))}

      <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:10 }}>
        {/* Color mode toggle */}
        <div style={{ display:"flex", background:THEME.bg, border:`1px solid ${THEME.border}`,
          borderRadius:8, padding:2, gap:2 }}>
          {[["market","Mkt %"],["gainloss","G&L"]].map(([mode,label]) => (
            <button key={mode} onClick={() => onColorMode(mode)} style={{
              padding:"3px 10px", border:"none", cursor:"pointer", borderRadius:6,
              fontSize:10, fontWeight:700, fontFamily:"inherit", transition:"all 0.15s",
              background:colorMode===mode?(mode==="gainloss"?"rgba(251,191,36,0.18)":"rgba(59,130,246,0.18)"):"transparent",
              color:colorMode===mode?(mode==="gainloss"?"#fbbf24":THEME.accent):THEME.text3,
            }}>{label}</button>
          ))}
        </div>
        {/* Legend */}
        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:3 }}>
          <div style={{ fontSize:7, color:THEME.text3, textTransform:"uppercase", letterSpacing:"0.08em" }}>
            {colorMode==="gainloss"?"G&L %":"Mkt %"}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:2 }}>
            <span style={{ fontSize:7, color:THEME.text3 }}>−5%</span>
            {[-5,-2,-0.5,0,0.5,2,5].map(v => (
              <div key={v} style={{ width:14, height:14, borderRadius:3, background:getPerfColor(v),
                border:"1px solid rgba(255,255,255,0.06)" }}/>
            ))}
            <span style={{ fontSize:7, color:THEME.text3 }}>+5%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PERIOD TOOLBAR
// ════════════════════════════════════════════════════════════════════════════
function PeriodToolbar({ period, onPeriod, viewMode, onViewMode, activeTab, portfolioCount, subView, onSubView, ansicht, onAnsicht, extraRight }) {
  const hasSubView   = activeTab === "chart" && onSubView;
  const hasViewMode  = portfolioCount > 1;
  const hasAnsicht   = activeTab === "performance" && onAnsicht;
  const showSep1     = hasSubView;
  const showSep2     = hasSubView && hasViewMode;
  const showSepOnly  = !hasSubView && (hasViewMode || hasAnsicht);

  return (
    <div style={{ padding:"0 16px 0 22px", display:"flex", alignItems:"center",
      borderBottom:`1px solid ${THEME.border}`, height:46,
      background:THEME.surface, flexShrink:0 }}>

      {/* Period buttons */}
      {PERIODS.map(p => (
        <button key={p.key} onClick={() => onPeriod(p.key)} style={{
          padding:"5px 12px", border:"none", cursor:"pointer",
          background:period===p.key?"rgba(59,130,246,0.15)":"transparent",
          color:period===p.key?THEME.accent:THEME.text3,
          fontSize:11, fontWeight:700, fontFamily:"inherit",
          borderBottom:period===p.key?`2px solid ${THEME.accent}`:"2px solid transparent",
          borderRadius:"7px 7px 0 0",
        }}>{p.label}</button>
      ))}

      {/* Separator */}
      {(showSep1 || showSepOnly) && (
        <div style={{ width:1, height:20, background:THEME.border, margin:"0 12px", flexShrink:0 }}/>
      )}

      {/* Bar Chart sort mode */}
      {hasSubView && (
        <div style={{
          display:"flex", alignItems:"center", gap:2,
          background:"rgba(0,0,0,0.25)", borderRadius:9, padding:3,
          border:`1px solid ${THEME.border}`, flexShrink:0,
        }}>
          {[["perf","Performance"],["size","By Size"]].map(([key, label]) => (
            <button key={key} onClick={() => onSubView(key)} style={{
              padding:"4px 11px", border:"none", cursor:"pointer", borderRadius:7,
              fontSize:10, fontWeight:700, fontFamily:"inherit", transition:"all 0.15s",
              background: subView===key ? "rgba(59,130,246,0.22)" : "transparent",
              color:       subView===key ? THEME.accent : THEME.text3,
              letterSpacing:"0.04em",
            }}>{label}</button>
          ))}
        </div>
      )}

      {showSep2 && (
        <div style={{ width:1, height:20, background:THEME.border, margin:"0 12px", flexShrink:0 }}/>
      )}

      {/* View mode toggle (Consolidated / Aggregated) */}
      <ViewModeToggle viewMode={viewMode} onViewMode={onViewMode} activeTab={activeTab} portfolioCount={portfolioCount}/>

      {/* Performance: Portfolio / Instrumente ansicht toggle */}
      {hasAnsicht && (
        <>
          {hasViewMode && <div style={{ width:1, height:20, background:THEME.border, margin:"0 10px", flexShrink:0 }}/>}
          <div style={{
            display:"flex", alignItems:"center", gap:2,
            background:"rgba(0,0,0,0.25)", borderRadius:9, padding:3,
            border:`1px solid ${THEME.border}`, flexShrink:0,
          }}>
            {[["portfolio","Portfolio"],["instruments","Instrumente"]].map(([key, label]) => (
              <button key={key} onClick={() => onAnsicht(key)} style={{
                padding:"4px 11px", border:"none", cursor:"pointer", borderRadius:7,
                fontSize:10, fontWeight:700, fontFamily:"inherit", transition:"all 0.15s",
                background: ansicht===key ? "rgba(249,115,22,0.22)" : "transparent",
                color:       ansicht===key ? "#fb923c" : THEME.text3,
                letterSpacing:"0.04em",
              }}>{label}</button>
            ))}
          </div>
        </>
      )}

      {/* Extra right-side content (e.g. Vergleich picker) */}
      {extraRight && (
        <>
          <div style={{ width:1, height:20, background:THEME.border, margin:"0 10px", flexShrink:0 }}/>
          {extraRight}
        </>
      )}
    </div>
  );
}


// ════════════════════════════════════════════════════════════════════════════
// ETF EXPLORER  — no login required, demo mode
// ════════════════════════════════════════════════════════════════════════════

const ETF_BASE = "/api";
const ETF_LS_KEY = "ptv3_etf_last";
const ETF_PERIODS = [
  { key:"Intraday", label:"1D" }, { key:"1W", label:"1W" },
  { key:"1M", label:"1M" }, { key:"YTD", label:"YTD" },
  { key:"1Y", label:"1Y" }, { key:"2Y", label:"2Y" },
  { key:"Max", label:"Max" },
];

const PREDEFINED_ETFS_CLIENT = [
  { ticker:"ARKK",    name:"ARK Innovation ETF",         provider:"ARK Invest"  },
  { ticker:"SCHD",    name:"Schwab US Dividend Equity",  provider:"Schwab"      },
  { ticker:"MLPA",    name:"Invesco US Energy MLP",      provider:"Invesco"     },
  { ticker:"VGT",     name:"Vanguard IT Sector",         provider:"Vanguard"    },
  { ticker:"SOXL",    name:"Direxion Semiconductors 3x", provider:"Direxion"    },
  { ticker:"DIA",     name:"iShares DJIA ETF",           provider:"iShares"     },
  { ticker:"TQQQ",    name:"ProShares UltraPro QQQ",     provider:"ProShares"   },
  { ticker:"CHSLI",   name:"UBS SLI ETF",                provider:"UBS"         },
  { ticker:"EXS1.DE", name:"iShares Core DAX",           provider:"iShares"     },
];

function buildEtfNodes(holdings, quotes, period) {
  return holdings.map(h => {
    const q   = quotes[h.symbol];
    const perf = (() => {
      if (!q) return null;
      // Batch endpoint returns: changePct (intraday), refs = { '1W', '1M', 'YTD', '1Y', '2Y' }
      if (period === "Intraday") {
        return q.changePct ?? null;
      }
      // For Max we use the earliest available ref (5Y if available, else 2Y)
      const refKey = period === "Max" ? (q.refs?.["5Y"] ? "5Y" : "2Y") : period;
      const refClose = q.refs?.[refKey];
      if (refClose != null && q.price > 0) {
        return ((q.price - refClose) / refClose) * 100;
      }
      return q.changePct ?? null;
    })();
    return {
      symbol:          h.symbol,
      name:            q?.name || h.name || h.symbol,
      weight:          h.weight,
      currentPriceUSD: q?.price ?? 0,
      valueUSD:        h.weight * 10,
      costUSD:         h.weight * 10,
      gainLossUSD:     0,
      perf,
      glPerf:          null,
      quantity:        h.weight,
      currency:        q?.currency ?? "USD",
    };
  });
}

// ── Save ETF Modal — login prompt or direct save ─────────────────────────────
function SaveEtfModal({ etf, onClose, user, onLogin, onSaved }) {
  const [mode,    setMode]    = useState(user ? "save" : "choose"); // choose|login|register|save
  const [uname,   setUname]   = useState("");
  const [pin,     setPin]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [showPin, setShowPin] = useState(false);

  // If user already logged in, save immediately on mount
  useEffect(() => {
    if (user && mode === "save") {
      setLoading(true); setError(null);
      doSave(user).catch(e => { setError(e.message); setLoading(false); });
    }
  }, []); // eslint-disable-line

  const doSave = async (u) => {
    // Note: caller (handleAuth or useEffect) manages loading/error state
    const res = await etfApi.save(u.id, { ticker: etf.ticker, name: etf.name, provider: etf.provider });
    onSaved(u, res.etfs || []);
  };

  const handleAuth = async () => {
    setLoading(true); setError(null);
    try {
      const loggedIn = mode === "register"
        ? await userApi.register(uname, pin)
        : await userApi.login(uname, pin);
      // Save FIRST so modal can close cleanly, then update App auth state.
      await doSave(loggedIn);
      // Notify parent last — this triggers App re-render/portfolio load.
      onLogin(loggedIn);
    } catch(e) {
      setError(e.message);
      setLoading(false);
    }
  };

  const overlay = {
    position:"fixed", inset:0, background:"rgba(0,0,0,0.75)",
    backdropFilter:"blur(6px)", display:"flex", alignItems:"center",
    justifyContent:"center", zIndex:3000,
  };
  const card = {
    width:340, background:THEME.surface, borderRadius:16,
    border:`1px solid ${THEME.border}`,
    boxShadow:"0 32px 80px rgba(0,0,0,0.7)",
    padding:"22px 22px 18px", position:"relative",
  };
  const inp = {
    width:"100%", padding:"9px 12px", borderRadius:9,
    border:`1px solid ${THEME.border}`, background:"rgba(255,255,255,0.05)",
    color:THEME.text1, fontSize:12, fontFamily:"inherit",
    outline:"none", boxSizing:"border-box", marginBottom:10,
  };
  const btn = (primary) => ({
    width:"100%", padding:"10px 0", borderRadius:9, border:"none",
    background: primary ? THEME.accent : "rgba(255,255,255,0.06)",
    color: primary ? "#fff" : THEME.text3,
    fontSize:12, fontWeight:700, cursor:"pointer",
    fontFamily:"inherit", marginTop:4, transition:"all 0.12s",
  });

  // ETF pill header
  const EtfPill = () => (
    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16,
      padding:"8px 12px", borderRadius:10,
      background:"rgba(59,130,246,0.08)", border:`1px solid rgba(59,130,246,0.2)` }}>
      <div style={{ width:32, height:32, borderRadius:7, background:"rgba(59,130,246,0.15)",
        display:"flex", alignItems:"center", justifyContent:"center",
        fontFamily:"'JetBrains Mono',monospace", fontSize:8, fontWeight:800,
        color:THEME.accent, flexShrink:0 }}>
        {etf.ticker.slice(0,5).replace(/\.(DE|SW|L|PA)$/,'')}
      </div>
      <div>
        <div style={{ fontSize:12, fontWeight:700, color:THEME.text1 }}>{etf.name || etf.ticker}</div>
        {etf.provider && <div style={{ fontSize:10, color:THEME.text3 }}>{etf.provider}</div>}
      </div>
    </div>
  );

  return (
    <div style={overlay} onClick={e => { if(e.target===e.currentTarget) onClose(); }}>
      <div style={card}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <div style={{ fontSize:14, fontWeight:700, color:THEME.text1 }}>
            {user || mode==="save" ? "Save ETF" : "Save to My Account"}
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none",
            cursor:"pointer", color:THEME.text3, display:"flex", padding:4 }}>
            <X size={15}/>
          </button>
        </div>

        <EtfPill/>

        {/* Saving spinner */}
        {loading && (
          <div style={{ textAlign:"center", padding:"16px 0", color:THEME.text3, fontSize:12 }}>
            <span className="spin" style={{ display:"inline-flex", marginRight:6 }}><RefreshCw size={14}/></span>
            {mode==="save" ? "Saving…" : "Signing in…"}
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div style={{ padding:"7px 10px", borderRadius:8, marginBottom:10,
            background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)",
            fontSize:11, color:THEME.red, display:"flex", gap:6 }}>
            <AlertCircle size={12} style={{flexShrink:0,marginTop:1}}/> {error}
          </div>
        )}

        {/* Choose: login or register */}
        {mode === "choose" && !loading && (
          <div>
            <p style={{ fontSize:11, color:THEME.text3, margin:"0 0 14px", lineHeight:1.5 }}>
              To save this ETF to your watchlist, sign in or create a free account.
            </p>
            <button style={btn(true)} onClick={()=>setMode("login")}>
              <User size={12} style={{marginRight:6,verticalAlign:"middle"}}/>
              Sign in to existing account
            </button>
            <button style={btn(false)} onClick={()=>setMode("register")}>
              <Plus size={12} style={{marginRight:6,verticalAlign:"middle"}}/>
              Create new account
            </button>
          </div>
        )}

        {/* Login / Register form */}
        {(mode === "login" || mode === "register") && !loading && (
          <div>
            <p style={{ fontSize:11, color:THEME.text3, margin:"0 0 12px" }}>
              {mode==="register" ? "Create a new account" : "Sign in to your account"}
            </p>
            <input value={uname} onChange={e=>setUname(e.target.value)}
              placeholder="Username" style={inp}/>
            <div style={{ position:"relative" }}>
              <input value={pin} onChange={e=>setPin(e.target.value)}
                type={showPin?"text":"password"} placeholder="PIN (4+ digits)"
                onKeyDown={e=>e.key==="Enter"&&handleAuth()}
                style={{...inp, paddingRight:36}}/>
              <button onClick={()=>setShowPin(v=>!v)}
                style={{ position:"absolute", right:10, top:"50%",
                  transform:"translateY(-65%)", background:"none",
                  border:"none", cursor:"pointer", color:THEME.text3, display:"flex" }}>
                {showPin ? <EyeOff size={13}/> : <Eye size={13}/>}
              </button>
            </div>
            <button style={btn(true)} onClick={handleAuth}
              disabled={!uname.trim()||!pin}>
              {mode==="register" ? "Create account & save" : "Sign in & save"}
            </button>
            <button style={{...btn(false), marginTop:6}} onClick={()=>setMode("choose")}>
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Delete Confirm Modal ─────────────────────────────────────────────────────
function DeleteEtfModal({ etf, onConfirm, onCancel }) {
  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,0.75)",
      backdropFilter:"blur(6px)", display:"flex", alignItems:"center",
      justifyContent:"center", zIndex:4000,
    }} onClick={e => { if(e.target===e.currentTarget) onCancel(); }}>
      <div style={{
        width:320, background:"#1a1d23", borderRadius:16,
        border:"1px solid rgba(239,68,68,0.3)",
        boxShadow:"0 32px 80px rgba(0,0,0,0.7)",
        padding:"22px 22px 18px",
      }}>
        {/* Icon */}
        <div style={{ width:40, height:40, borderRadius:10, marginBottom:14,
          background:"rgba(239,68,68,0.12)", display:"flex",
          alignItems:"center", justifyContent:"center" }}>
          <Trash2 size={18} style={{ color:"#ef4444" }}/>
        </div>
        <div style={{ fontSize:15, fontWeight:700, color:"#f1f5f9", marginBottom:6 }}>
          Remove ETF?
        </div>
        {/* ETF pill */}
        <div style={{ display:"flex", alignItems:"center", gap:10, margin:"12px 0 16px",
          padding:"8px 12px", borderRadius:10,
          background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ width:36, height:36, borderRadius:8, flexShrink:0,
            background:"rgba(59,130,246,0.12)", display:"flex",
            alignItems:"center", justifyContent:"center" }}>
            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:7,
              fontWeight:800, color:"#60a5fa", textAlign:"center", lineHeight:1.1 }}>
              {etf.ticker.replace(/\.(DE|SW|L|PA)$/,"").slice(0,5)}
            </span>
          </div>
          <div>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11,
              fontWeight:700, color:"#60a5fa", letterSpacing:"0.05em" }}>{etf.ticker}</div>
            <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>
              {etf.name || etf.ticker}
            </div>
          </div>
        </div>
        <p style={{ fontSize:11, color:"#64748b", margin:"0 0 18px", lineHeight:1.5 }}>
          This will remove the ETF from your custom list. This action cannot be undone.
        </p>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={onCancel} style={{
            flex:1, padding:"9px 0", borderRadius:9, border:"1px solid rgba(255,255,255,0.1)",
            background:"rgba(255,255,255,0.05)", color:"#94a3b8",
            fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit",
          }}>Cancel</button>
          <button onClick={onConfirm} style={{
            flex:1, padding:"9px 0", borderRadius:9, border:"none",
            background:"rgba(239,68,68,0.15)", color:"#ef4444",
            fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit",
            transition:"background 0.12s",
          }}
          onMouseEnter={e=>e.currentTarget.style.background="rgba(239,68,68,0.25)"}
          onMouseLeave={e=>e.currentTarget.style.background="rgba(239,68,68,0.15)"}>
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ETF Rail ─────────────────────────────────────────────────────────────────
function EtfRail({ open, onToggle, selectedTicker, onSelect, currency, onCurrency,
                   fetching, onRefreshQuotes,
                   user, savedEtfs, onSaveEtf, onRemoveEtf, onSwitchToPortfolio,
                   onBack, onSignOut,
                   displayMode, onToggleDisplayMode }) {
  const [search,      setSearch]      = useState("");
  const [searching,   setSearching]   = useState(false);
  const [results,     setResults]     = useState([]);
  const [searchErr,   setSearchErr]   = useState(null);
  // Custom ETFs: found via search, staged locally until saved to profile
  const [customEtfs,  setCustomEtfs]  = useState([]);
  // Delete confirmation: { etf, from } where from = 'custom' | 'saved'
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [savingCustom,  setSavingCustom]  = useState(false);
  const searchTimer = useRef(null);
  const inputRef    = useRef(null);
  const w = open ? 220 : 52;

  // Live search with debounce
  useEffect(() => {
    clearTimeout(searchTimer.current);
    const q = search.trim();
    if (!q) { setResults([]); setSearchErr(null); return; }
    setSearching(true); setSearchErr(null);
    searchTimer.current = setTimeout(async () => {
      try {
        const d = await fetch(`${ETF_BASE}/etf/search?q=${encodeURIComponent(q)}`).then(r=>r.json());
        setResults(d.results || []);
      } catch(e) {
        setResults([]);
        setSearchErr("Search failed");
      }
      setSearching(false);
    }, 350);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  const inSearch   = !!search.trim();
  const displayList = inSearch ? results : PREDEFINED_ETFS_CLIENT;

  // Split results into presets vs live when searching
  const presetResults = inSearch ? results.filter(r => r.isPreset) : [];
  const liveResults   = inSearch ? results.filter(r => !r.isPreset) : [];

  const handleSelect = (ticker) => {
    onSelect(ticker);
    setSearch("");
    setResults([]);
  };

  const EtfItem = ({ etf, isActive }) => (
    <button onClick={() => handleSelect(etf.ticker)}
      className={isActive ? undefined : "rail-btn"}
      style={{
        width:"100%", display:"flex", alignItems:"center",
        gap: open?9:0, padding: open?"7px 10px":"8px 0",
        justifyContent: open?"flex-start":"center",
        borderRadius:9, border:"none", cursor:"pointer",
        background: isActive?"rgba(59,130,246,0.15)":"transparent",
        color: isActive?THEME.accent:THEME.text3,
        fontFamily:THEME.font, transition:"background 0.12s",
        fontWeight: isActive?700:500, textAlign:"left",
      }}>
      {/* Ticker badge */}
      <div style={{
        flexShrink:0, width:36, height:36,
        background: isActive?"rgba(59,130,246,0.2)":"rgba(255,255,255,0.06)",
        borderRadius:8, display:"flex", alignItems:"center",
        justifyContent:"center", padding:"0 2px",
      }}>
        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:7,
          lineHeight:1.1, textAlign:"center", fontWeight:800,
          color: isActive?THEME.accent:THEME.text2 }}>
          {etf.ticker.length <= 5
            ? etf.ticker.replace('.DE','').replace('.SW','').replace('.LON','')
            : etf.ticker.slice(0,5)}
        </span>
      </div>
      {open && (
        <div style={{ overflow:"hidden", flex:1 }}>
          <div style={{ fontSize:11, fontWeight:700,
            color: isActive?THEME.accent:THEME.text1,
            whiteSpace:"nowrap", overflow:"hidden",
            textOverflow:"ellipsis" }}>
            {etf.name}
          </div>
          <div style={{ fontSize:9, color: isActive?THEME.accent:THEME.text3, marginTop:1,
            display:"flex", alignItems:"center", gap:4 }}>
            <span style={{ whiteSpace:"nowrap", overflow:"hidden",
              textOverflow:"ellipsis", maxWidth:120 }}>
              {etf.provider || etf.ticker}
            </span>
            {etf.isPreset && (
              <span style={{ fontSize:7, padding:"1px 4px", borderRadius:3,
                background:"rgba(59,130,246,0.15)", color:THEME.accent,
                fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em",
                flexShrink:0 }}>preset</span>
            )}
          </div>
        </div>
      )}
    </button>
  );

  // EtfItem row with hover-visible trash button and confirmation
  const EtfItemWithTrash = ({ etf, isActive, onDelete }) => {
    const [hovered, setHovered] = useState(false);
    return (
      <div style={{ display:"flex", alignItems:"center", gap:2, position:"relative" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}>
        <div style={{ flex:1, minWidth:0 }}>
          <EtfItem etf={etf} isActive={isActive}/>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          title="Remove ETF"
          style={{
            flexShrink:0, background:"none", border:"none",
            cursor:"pointer", color: THEME.red ?? "#ef4444",
            padding:"5px 4px", borderRadius:5, display:"flex",
            opacity: hovered ? 1 : 0,
            transform: hovered ? "scale(1)" : "scale(0.7)",
            transition:"opacity 0.15s, transform 0.15s",
            pointerEvents: hovered ? "auto" : "none",
          }}>
          <Trash2 size={13}/>
        </button>
      </div>
    );
  };

  return (
    <>
    <div style={{
      width:w, minWidth:w, height:"100%",
      background:THEME.surface, borderRight:`1px solid ${THEME.border}`,
      display:"flex", flexDirection:"column",
      transition:"width 0.22s cubic-bezier(.4,0,.2,1)",
      overflow:"hidden", flexShrink:0, zIndex:10,
    }}>
      {/* Header */}
      <div style={{ padding:"0 10px", height:52, display:"flex", alignItems:"center",
        gap:6, borderBottom:`1px solid ${THEME.border}`, flexShrink:0 }}>
        {open && (
          <div style={{ flex:1 }}>
            <div style={{ fontFamily:THEME.serif, fontSize:20, fontWeight:400,
              letterSpacing:"-0.02em" }}>
              ETF<span style={{ color:THEME.accent, fontStyle:"italic" }}>.</span>
            </div>
            <div style={{ fontSize:8, color:THEME.text3, textTransform:"uppercase",
              letterSpacing:"0.10em", marginTop:-2 }}>Screener</div>
          </div>
        )}
        {/* Mode switcher — removed, navigation via sidebar bottom */}
        <button onClick={onToggle} style={{
          background:"none", border:"none", cursor:"pointer",
          color:THEME.text3, display:"flex", padding:4, borderRadius:7,
          marginLeft: open ? 0 : "auto", marginRight: open ? 0 : "auto",
        }}><PanelLeft size={16}/></button>
      </div>

      {/* Search input */}
      <div style={{ padding: open?"8px 10px 4px":"8px 6px 4px", flexShrink:0 }}>
        {open ? (
          <div style={{ position:"relative" }}>
            {searching
              ? <span className="spin" style={{ position:"absolute", left:9, top:"50%",
                  transform:"translateY(-50%)", display:"flex",
                  color:THEME.accent, pointerEvents:"none" }}>
                  <RefreshCw size={12}/>
                </span>
              : <Search size={12} style={{ position:"absolute", left:9, top:"50%",
                  transform:"translateY(-50%)", color:THEME.text3, pointerEvents:"none" }}/>
            }
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Ticker or name…"
              style={{
                width:"100%", padding:"7px 28px 7px 28px",
                background:"rgba(255,255,255,0.05)", border:`1px solid ${inSearch ? THEME.accent+"44" : THEME.border}`,
                borderRadius:8, color:THEME.text1, fontSize:11,
                fontFamily:"inherit", outline:"none", boxSizing:"border-box",
                transition:"border-color 0.15s",
              }}/>
            {search && (
              <button onClick={() => { setSearch(""); setResults([]); inputRef.current?.focus(); }}
                style={{ position:"absolute", right:7, top:"50%",
                  transform:"translateY(-50%)", background:"none",
                  border:"none", cursor:"pointer", color:THEME.text3,
                  display:"flex", padding:0 }}>
                <X size={11}/>
              </button>
            )}
          </div>
        ) : (
          <button onClick={onToggle} style={{ width:"100%", background:"none",
            border:"none", cursor:"pointer", color:THEME.text3,
            display:"flex", justifyContent:"center", padding:"4px 0" }}>
            <Search size={14}/>
          </button>
        )}
      </div>

      {/* Results list — two separate scrollable containers: expanded vs collapsed */}
      {open ? (
      <div style={{ flex:1, overflowY:"auto", padding:"2px 8px" }}>

        {/* ── Searching state ── */}
        {open && inSearch && searching && (
          <div style={{ padding:"12px 8px", display:"flex", alignItems:"center",
            gap:8, color:THEME.text3, fontSize:11 }}>
            <span className="spin" style={{ display:"flex" }}><RefreshCw size={12}/></span>
            Searching Yahoo Finance…
          </div>
        )}
        {/* ── Error ── */}
        {open && searchErr && (
          <div style={{ padding:"10px 8px", fontSize:11, color:THEME.red,
            display:"flex", alignItems:"center", gap:6 }}>
            <AlertCircle size={12}/> {searchErr}
          </div>
        )}
        {/* ── No results ── */}
        {open && inSearch && !searching && !searchErr && results.length === 0 && (
          <div style={{ padding:"14px 8px", textAlign:"center", color:THEME.text3,
            fontSize:11, lineHeight:1.5 }}>
            No ETFs found for<br/>
            <span style={{ fontFamily:"'JetBrains Mono',monospace",
              color:THEME.text2 }}>"{search}"</span>
          </div>
        )}

        {/* ── PRESETS (expanded only — collapsed version below) ── */}
        {open && (
          <>
            <div style={{ fontSize:9, color:THEME.text3, textTransform:"uppercase",
              letterSpacing:"0.08em", padding:"4px 4px 6px" }}>Presets</div>
            {(inSearch ? presetResults : PREDEFINED_ETFS_CLIENT).map(etf => (
              <EtfItem key={etf.ticker} etf={etf} isActive={selectedTicker===etf.ticker}/>
            ))}
          </>
        )}

        {/* ── SAVED ETFs (server-persisted) — always visible, not searching ── */}
        {open && !inSearch && savedEtfs && savedEtfs.length > 0 && (
          <>
            <div style={{ display:"flex", alignItems:"center", gap:6, padding:"10px 4px 4px" }}>
              <div style={{ fontSize:9, color:THEME.text3, textTransform:"uppercase",
                letterSpacing:"0.08em" }}>Saved</div>
              <div style={{ flex:1, height:1, background:THEME.border }}/>
              <div style={{ fontSize:9, color:THEME.text3 }}>{savedEtfs.length}</div>
            </div>
            {savedEtfs.map(etf => (
              <EtfItemWithTrash key={etf.ticker} etf={etf}
                isActive={selectedTicker===etf.ticker}
                onDelete={() => setDeleteConfirm({ etf, from:"saved" })}/>
            ))}
          </>
        )}

        {/* ── CUSTOM ETFs — locally staged, shown always below presets ── */}
        {open && !inSearch && customEtfs.length > 0 && (
          <>
            <div style={{ display:"flex", alignItems:"center", gap:6, padding:"10px 4px 4px" }}>
              <div style={{ fontSize:9, color:THEME.text3, textTransform:"uppercase",
                letterSpacing:"0.08em" }}>Custom</div>
              <div style={{ flex:1, height:1, background:THEME.border }}/>
              <div style={{ fontSize:9, color:THEME.text3 }}>{customEtfs.length}</div>
            </div>
            {customEtfs.map(etf => (
              <EtfItemWithTrash key={etf.ticker} etf={etf}
                isActive={selectedTicker===etf.ticker}
                onDelete={() => setDeleteConfirm({ etf, from:"custom" })}/>
            ))}
            {/* Save button — only if not all are already in savedEtfs */}
            {(() => {
              const unsaved = customEtfs.filter(
                e => !savedEtfs?.some(s => s.ticker === e.ticker)
              );
              if (!unsaved.length) return null;
              return (
                <button
                  onClick={async () => {
                    setSavingCustom(true);
                    if (!user) {
                      // trigger login modal via onSaveEtf with first unsaved
                      onSaveEtf && onSaveEtf(unsaved[0]);
                      setSavingCustom(false);
                      return;
                    }
                    // save all unsaved
                    let lastEtfs = savedEtfs || [];
                    for (const etf of unsaved) {
                      try {
                        const r = await etfApi.save(user.id, etf);
                        lastEtfs = r.etfs || lastEtfs;
                      } catch(e) { console.error("Save failed:", e); }
                    }
                    onSaveEtf && onSaveEtf(null, lastEtfs); // signal saved
                    setSavingCustom(false);
                  }}
                  disabled={savingCustom}
                  style={{
                    width:"100%", marginTop:8, padding:"7px 0",
                    borderRadius:9, border:"1px dashed rgba(59,130,246,0.4)",
                    background:"rgba(59,130,246,0.06)",
                    color: savingCustom ? THEME.text3 : THEME.accent,
                    fontSize:11, fontWeight:600, cursor:"pointer",
                    fontFamily:"inherit", display:"flex",
                    alignItems:"center", justifyContent:"center", gap:6,
                    transition:"all 0.15s",
                  }}>
                  {savingCustom
                    ? <><span className="spin" style={{display:"flex"}}><RefreshCw size={12}/></span> Saving…</>
                    : <><span style={{fontSize:14}}>☁</span> Save {unsaved.length === 1 ? "to" : `${unsaved.length} to`} profile</>}
                </button>
              );
            })()}
          </>
        )}

        {/* ── LIVE SEARCH RESULTS (non-preset) ── */}
        {open && inSearch && !searching && liveResults.length > 0 && (
          <>
            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 4px 4px" }}>
              <div style={{ fontSize:9, color:THEME.text3, textTransform:"uppercase",
                letterSpacing:"0.08em" }}>Search results</div>
              <div style={{ flex:1, height:1, background:THEME.border }}/>
              <div style={{ fontSize:9, color:THEME.text3 }}>{liveResults.length}</div>
            </div>
            {liveResults.map(etf => {
              const inCustom = customEtfs.some(c => c.ticker === etf.ticker);
              const inSaved  = savedEtfs?.some(s => s.ticker === etf.ticker);
              const added    = inCustom || inSaved;
              return (
                <div key={etf.ticker} style={{ display:"flex", alignItems:"center", gap:2 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <EtfItem etf={etf} isActive={selectedTicker===etf.ticker}/>
                  </div>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      if (added) return;
                      // Add to local custom list, then select it
                      setCustomEtfs(prev =>
                        prev.some(c => c.ticker === etf.ticker) ? prev : [...prev, etf]
                      );
                      handleSelect(etf.ticker);
                    }}
                    title={added ? "Added to list" : "Add to Custom list"}
                    style={{
                      flexShrink:0, background:"none", border:"none",
                      cursor: added ? "default" : "pointer",
                      color: added ? THEME.accent : THEME.text3,
                      padding:"4px 5px", borderRadius:5, display:"flex",
                      fontSize:15, lineHeight:1,
                      opacity: added ? 1 : 0.5, transition:"all 0.12s",
                    }}
                    onMouseEnter={e=>{ if(!added) e.currentTarget.style.opacity=1; }}
                    onMouseLeave={e=>{ if(!added) e.currentTarget.style.opacity=0.5; }}>
                    {added ? "★" : "☆"}
                  </button>
                </div>
              );
            })}
          </>
        )}

      </div>
      ) : (
      <div style={{ flex:1, overflowY:"auto", padding:"2px 4px" }}>
        {/* Closed-rail: compact badges */}
            {PREDEFINED_ETFS_CLIENT.map(etf => (
              <button key={etf.ticker} onClick={() => handleSelect(etf.ticker)}
                title={etf.name}
                style={{
                  width:"100%", background:selectedTicker===etf.ticker
                    ?"rgba(59,130,246,0.18)":"none",
                  border:"none", cursor:"pointer",
                  display:"flex", justifyContent:"center",
                  alignItems:"center", padding:"5px 0",
                  borderRadius:7, transition:"background 0.1s",
                }}>
                <div style={{
                  width:34, height:34, borderRadius:8,
                  background:selectedTicker===etf.ticker
                    ?"rgba(59,130,246,0.25)":"rgba(255,255,255,0.06)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>
                  <span style={{ fontFamily:"'JetBrains Mono',monospace",
                    fontSize:6.5, fontWeight:800, textAlign:"center", lineHeight:1.1,
                    color:selectedTicker===etf.ticker?THEME.accent:THEME.text2 }}>
                    {etf.ticker.replace(".DE","").replace(".SW","").replace(".LON","").slice(0,5)}
                  </span>
                </div>
              </button>
            ))}
            {/* Divider before saved */}
            {savedEtfs && savedEtfs.length > 0 && (
              <div style={{ height:1, background:THEME.border2, margin:"4px 6px" }}/>
            )}
            {/* Saved ETFs */}
            {savedEtfs && savedEtfs.map(etf => (
              <button key={etf.ticker} onClick={() => handleSelect(etf.ticker)}
                title={`★ ${etf.name || etf.ticker}`}
                style={{
                  width:"100%", background:selectedTicker===etf.ticker
                    ?"rgba(59,130,246,0.18)":"none",
                  border:"none", cursor:"pointer",
                  display:"flex", justifyContent:"center",
                  alignItems:"center", padding:"5px 0",
                  borderRadius:7, transition:"background 0.1s",
                }}>
                <div style={{ position:"relative" }}>
                  <div style={{
                    width:34, height:34, borderRadius:8,
                    background:selectedTicker===etf.ticker
                      ?"rgba(59,130,246,0.25)":"rgba(255,255,255,0.06)",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    border:selectedTicker===etf.ticker
                      ?"1px solid rgba(59,130,246,0.4)":"1px solid rgba(255,255,255,0.08)",
                  }}>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace",
                      fontSize:6.5, fontWeight:800, textAlign:"center", lineHeight:1.1,
                      color:selectedTicker===etf.ticker?THEME.accent:THEME.text2 }}>
                      {(etf.ticker||"").replace(".DE","").replace(".SW","").replace(".LON","").slice(0,5)}
                    </span>
                  </div>
                  {/* Star badge */}
                  <div style={{ position:"absolute", top:-3, right:-3,
                    width:10, height:10, borderRadius:"50%",
                    background:"rgba(251,191,36,0.9)",
                    fontSize:6, display:"flex", alignItems:"center",
                    justifyContent:"center", color:"#000", fontWeight:900 }}>★</div>
                </div>
              </button>
            ))}
      </div>
      )}{/* end open/closed ternary */}

      {/* Divider */}
      <div style={{ height:1, background:THEME.border2, margin:"6px 8px", flexShrink:0 }}/>

      {/* Currency */}
      {open && <div style={{ fontSize:9, fontWeight:700, color:THEME.text3,
        textTransform:"uppercase", letterSpacing:"0.10em",
        padding:"6px 12px 4px", opacity:0.7, flexShrink:0 }}>Currency</div>}
      <div style={{ padding: open?"2px 8px 6px":"2px 4px 6px", display:"flex",
        flexDirection:"column", gap:2, flexShrink:0 }}>
        {Object.keys(CCY_SYM).map(c => {
          const isActive = currency === c;
          const code = CCY_FLAG[c];
          const SIZE = open ? 24 : 20;
          return (
            <button key={c} onClick={() => onCurrency(c)} title={c}
              className={isActive?undefined:"ccy-btn"}
              style={{ display:"flex", alignItems:"center", gap:open?10:0,
                padding:open?"6px 10px":"6px 0", border:"none", borderRadius:9,
                background:isActive?"rgba(59,130,246,0.15)":"transparent",
                cursor:"pointer", fontFamily:THEME.font, transition:"background 0.12s",
                width:"100%", justifyContent:open?"flex-start":"center",
                color:isActive?THEME.accent:THEME.text3 }}>
              <div className="ccy-flag" style={{ width:SIZE, height:SIZE,
                borderRadius:"50%", overflow:"hidden", flexShrink:0,
                opacity:isActive?1:0.4, transition:"opacity 0.12s",
                display:"flex", alignItems:"center", justifyContent:"center",
                lineHeight:0, fontSize:0 }}>
                {code ? <CircleFlag countryCode={code} width={SIZE} height={SIZE}/>
                      : <span style={{ fontSize:SIZE*0.6 }}>🌐</span>}
              </div>
              {open && (
                <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
                  <span className="ccy-label" style={{ fontSize:12,
                    fontWeight:isActive?700:500,
                    color:isActive?THEME.accent:THEME.text3 }}>{c}</span>
                  <span className="ccy-name" style={{ fontSize:10,
                    color:isActive?THEME.accent:THEME.text3 }}>{CCY_NAME[c]}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* ─── Bottom: Account (pinned) ────────────────────────────── */}
      <div style={{ borderTop:`1px solid ${THEME.border}`, padding:"4px 6px 8px", flexShrink:0 }}>
        {/* Refresh row */}
        <RailBtn open={open} icon={fetching ? <span className="spin" style={{display:'flex'}}><RefreshCw size={15}/></span> : <RefreshCw size={15}/>}
          label="Refresh Quotes" onClick={onRefreshQuotes}/>
        <div style={{ height:1, background:THEME.border, margin:"4px 0" }}/>
        {open && <div style={{ fontSize:9, fontWeight:700, color:THEME.text3,
          textTransform:"uppercase", letterSpacing:"0.10em",
          padding:"4px 6px 4px", opacity:0.7 }}>Account</div>}
        {user ? (
          <>
            {open && (
              <div style={{ padding:"2px 6px 6px", display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ width:26, height:26, borderRadius:"50%",
                  background:"rgba(59,130,246,0.2)", display:"flex",
                  alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <User size={12} style={{ color:THEME.accent }}/>
                </div>
                <div>
                  <div style={{ fontSize:12, fontWeight:600, color:THEME.text1 }}>{user.username}</div>
                  <div style={{ fontSize:9, color:THEME.text3 }}>ETF Screener</div>
                </div>
              </div>
            )}
            {user && onSwitchToPortfolio && (
              open ? (
                <button onClick={onSwitchToPortfolio} style={{
                  display:"flex", alignItems:"center", gap:10,
                  width:"100%", padding:"9px 12px", borderRadius:9,
                  border:"none", cursor:"pointer", background:"transparent",
                  color:THEME.text2, fontFamily:THEME.font,
                  transition:"background 0.12s",
                }} className="rail-btn">
                  <span style={{ flexShrink:0, display:"flex" }}><LayoutDashboard size={16}/></span>
                  <span style={{ fontSize:12, fontWeight:600, lineHeight:1.2 }}>Portfolio Explorer</span>
                </button>
              ) : (
                <SidebarTip label="Portfolio Explorer" open={open}>
                  <button onClick={onSwitchToPortfolio} style={{
                    display:"flex", alignItems:"center", justifyContent:"center",
                    width:"100%", padding:"9px 0", borderRadius:9,
                    border:"none", cursor:"pointer", background:"transparent",
                    color:THEME.text2, transition:"background 0.12s",
                  }} className="rail-btn">
                    <LayoutDashboard size={16}/>
                  </button>
                </SidebarTip>
              )
            )}
            {/* Sign Out removed here — rendered once at bottom after View Mode */}
          </>
        ) : (
          onBack && (
            <RailBtn open={open} icon={<User size={16}/>} label="Sign In"
              onClick={onBack} color={THEME.accent}/>
          )
        )}

        {/* ── Display mode toggle (shared with portfolio rail) ── */}
        {onToggleDisplayMode && (
          <div style={{ padding: open ? "6px 10px" : "6px 4px" }}>
            {open ? (
              <div style={{ display:"flex", alignItems:"center", gap:8,
                padding:"6px 10px", borderRadius:8,
                background:"rgba(255,255,255,0.04)",
                border:`1px solid ${THEME.border}` }}>
                <span style={{ fontSize:10, color:THEME.text3, flex:1, whiteSpace:"nowrap" }}>View mode</span>
                <div style={{ display:"flex", gap:2, padding:"2px",
                  borderRadius:6, background:"rgba(0,0,0,0.25)",
                  border:`1px solid ${THEME.border}` }}>
                  {[["pro",<Gauge size={13}/>, "Pro mode"],["comfort",<Armchair size={13}/>, "Comfort mode"]].map(([m, lbl]) => (
                    <button key={m} onClick={() => onToggleDisplayMode(m)}
                      title={m==="pro" ? "Compact — maximum information density" : "Comfort — larger text (WCAG AA)"}
                      style={{
                        padding:"3px 8px", borderRadius:5, border:"none",
                        background: displayMode===m
                          ? (m==="comfort" ? "rgba(59,130,246,0.35)" : "rgba(255,255,255,0.12)")
                          : "transparent",
                        color: displayMode===m ? THEME.text1 : THEME.text3,
                        fontSize:9, fontWeight:700, cursor:"pointer",
                        fontFamily:"inherit", transition:"all 0.15s", letterSpacing:"0.04em",
                      }}>{lbl}</button>
                  ))}
                </div>
              </div>
            ) : (
              <button onClick={onToggleDisplayMode}
                title={displayMode==="pro" ? "Switch to Comfort mode (A11Y)" : "Switch to Pro mode"}
                style={{
                  width:"100%", padding:"6px 0", border:"none", cursor:"pointer",
                  background: displayMode==="comfort" ? "rgba(59,130,246,0.18)" : "transparent",
                  borderRadius:7, display:"flex", justifyContent:"center",
                  alignItems:"center", transition:"all 0.15s",
                  color: THEME.text3,
                }}>
                <span style={{ lineHeight:1, color:"inherit" }}>{displayMode==="comfort" ? <Armchair size={16} aria-label="Comfort Mode" /> : <Gauge size={16} aria-label="Pro Mode aktiv" />}</span>
              </button>
            )}
          </div>
        )}
        {/* Sign Out — always last */}
        {onSignOut && user && (
          <RailBtn open={open} icon={<LogOut size={16}/>} label="Sign Out"
            onClick={onSignOut} color={THEME.text3}/>
        )}
      </div>
    </div>

    {/* Delete confirmation modal */}
    {deleteConfirm && (
      <DeleteEtfModal
        etf={deleteConfirm.etf}
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={() => {
          const { etf, from } = deleteConfirm;
          setDeleteConfirm(null);
          if (from === "custom") {
            setCustomEtfs(prev => prev.filter(e => e.ticker !== etf.ticker));
          } else {
            onRemoveEtf && onRemoveEtf(etf.ticker);
          }
        }}
      />
    )}
    </>
  );
}

// ── ETF Summary Bar ───────────────────────────────────────────────────────────
function EtfSummaryBar({ etfMeta, nodes, fetchErrors }) {
  const valid   = nodes.filter(n => n.perf != null);
  const totalW  = valid.reduce((s,n) => s+n.weight, 0) || 1;
  const avgPerf = valid.length
    ? valid.reduce((s,n) => s + n.perf * n.weight, 0) / totalW
    : null;
  const gainers = valid.filter(n => n.perf > 0).length;
  const losers  = valid.filter(n => n.perf < 0).length;
  const errList = Object.entries(fetchErrors||{}).filter(([,v])=>v).map(([k])=>k).slice(0,3);

  return (
    <div style={{ padding:"10px 22px", borderBottom:`1px solid ${THEME.border2}`,
      background:THEME.surface, display:"flex", alignItems:"center",
      gap:24, flexShrink:0, flexWrap:"wrap" }}>
      <div>
        <div style={{ fontSize:9, color:THEME.text3, textTransform:"uppercase",
          letterSpacing:"0.08em", marginBottom:2 }}>ETF</div>
        <div style={{ fontSize:13, fontWeight:700, color:THEME.text1 }}>
          {etfMeta?.name ?? "—"}
        </div>
      </div>
      <div>
        <div style={{ fontSize:9, color:THEME.text3, textTransform:"uppercase",
          letterSpacing:"0.08em", marginBottom:2 }}>Avg Perf (weighted)</div>
        <div className="mono" style={{ fontSize:13, fontWeight:700,
          color: avgPerf==null?THEME.text3:avgPerf>=0?THEME.green:THEME.red }}>
          {avgPerf!=null ? `${avgPerf>=0?"+":""}${avgPerf.toFixed(2)}%` : "—"}
        </div>
      </div>
      <div>
        <div style={{ fontSize:9, color:THEME.text3, textTransform:"uppercase",
          letterSpacing:"0.08em", marginBottom:2 }}>Gainers / Losers</div>
        <div className="mono" style={{ fontSize:13, fontWeight:700 }}>
          <span style={{ color:THEME.green }}>{gainers}↑</span>
          <span style={{ color:THEME.text3, margin:"0 4px" }}>/</span>
          <span style={{ color:THEME.red }}>{losers}↓</span>
        </div>
      </div>
      <div>
        <div style={{ fontSize:9, color:THEME.text3, textTransform:"uppercase",
          letterSpacing:"0.08em", marginBottom:2 }}>Holdings</div>
        <div className="mono" style={{ fontSize:13, fontWeight:700, color:THEME.text1 }}>
          Top {nodes.length}
        </div>
      </div>
      {errList.length > 0 && (
        <div style={{ display:"flex", alignItems:"center", gap:5,
          fontSize:11, color:"#f59e0b" }}>
          <AlertCircle size={13}/>
          Failed: {errList.join(", ")}
        </div>
      )}
      {/* Color legend — right aligned */}
      <div style={{ marginLeft:"auto", display:"flex", flexDirection:"column",
        alignItems:"flex-end", gap:3 }}>
        <div style={{ fontSize:7, color:THEME.text3, textTransform:"uppercase",
          letterSpacing:"0.08em" }}>Mkt %</div>
        <div style={{ display:"flex", alignItems:"center", gap:2 }}>
          <span style={{ fontSize:7, color:THEME.text3 }}>−5%</span>
          {[-5,-2,-0.5,0,0.5,2,5].map(v => (
            <div key={v} style={{ width:14, height:14, borderRadius:3,
              background:getPerfColor(v), border:"1px solid rgba(255,255,255,0.06)" }}/>
          ))}
          <span style={{ fontSize:7, color:THEME.text3 }}>+5%</span>
        </div>
      </div>
    </div>
  );
}

// ── Inline Sparkline for holdings table ──────────────────────────────────────
function HoldingSparkline({ chartData, period, isPos, W=80, H=28 }) {
  const pts = useMemo(() => {
    if (!chartData) return null;
    const r = chartData.chart?.result?.[0];
    if (!r) return null;
    const ts  = r.timestamp ?? [];
    const cls = r.indicators?.quote?.[0]?.close ?? [];
    // For non-intraday periods, restrict range
    let startTs = 0;
    if (period !== "Intraday" && period !== "Max") {
      const now = Date.now() / 1000;
      const days = period==="1W"?7:period==="1M"?30:period==="YTD"?null:period==="1Y"?365:730;
      if (days) startTs = now - days*86400;
      else { const jan1 = new Date(new Date().getFullYear(),0,1); startTs=jan1.getTime()/1000; }
    }
    const filtered = ts.map((t,i)=>({t,v:cls[i]}))
      .filter(p=>p.v!=null && p.t>=startTs);
    if (filtered.length < 2) return null;
    return filtered;
  }, [chartData, period]);

  if (!pts) return <div style={{ width:W, height:H }}/>;

  const xs = pts.map(p=>p.t), ys = pts.map(p=>p.v);
  const minY=Math.min(...ys), maxY=Math.max(...ys), rangeY=maxY-minY||1;
  const sx = t=>((t-xs[0])/(xs[xs.length-1]-xs[0]))*(W-2)+1;
  const sy = v=>H-((v-minY)/rangeY)*(H-4)-2;
  const polyPts = pts.map(p=>`${sx(p.t).toFixed(1)},${sy(p.v).toFixed(1)}`).join(" ");
  const lx=sx(xs[xs.length-1]), ly=sy(ys[ys.length-1]);
  const col = isPos ? "#4ade80" : "#f87171";

  return (
    <svg width={W} height={H} style={{ display:"block" }}>
      <defs>
        <linearGradient id={`sg-${xs[0]}-${isPos}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={col} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polyline
        points={polyPts + ` ${W},${H} 0,${H}`}
        fill={`url(#sg-${xs[0]}-${isPos})`}/>
      <polyline points={polyPts} fill="none" stroke={col} strokeWidth="1.2"/>
      <circle cx={lx} cy={ly} r="2" fill={col}/>
    </svg>
  );
}

// ── ETF Holdings Table ────────────────────────────────────────────────────────
function EtfHoldingsTable({ holdings, quotes, currency, rates,
                            onRefreshHoldings, refreshing, fetchedAt, period, onPeriod,
                            divCache, onFetchDiv }) {
  const rate = rates[currency] ?? 1;
  const cSym = CCY_SYM[currency] ?? "$";

  const rows = useMemo(() =>
    [...holdings]
      .sort((a,b) => b.weight - a.weight)
      .map(h => {
        const q = quotes[h.symbol];
        // Compute perf for selected period
        const perf = (() => {
          if (!q) return null;
          if (period === "Intraday") return q.changePct ?? null;
          const refKey = period === "Max" ? (q.refs?.["5Y"] ? "5Y" : "2Y") : period;
          const ref = q.refs?.[refKey];
          if (ref != null && q.price > 0) return ((q.price - ref) / ref) * 100;
          return q.changePct ?? null;
        })();
        const div = divCache?.[h.symbol];
        return { ...h, price:q?.price??null, perf, shortName:q?.shortName||q?.name||null, div };
      }),
    [holdings, quotes, period, divCache]
  );

  // Fetch missing div data lazily
  useEffect(() => {
    if (!onFetchDiv) return;
    const missing = rows.filter(r => r.div === undefined).map(r => r.symbol);
    if (missing.length > 0) {
      // Fetch in small batches to avoid hammering the API
      const batch = missing.slice(0, 5);
      batch.forEach(sym => onFetchDiv(sym));
    }
  }, [rows, onFetchDiv, divCache]);

  const lastUpdated = fetchedAt
    ? new Date(fetchedAt).toLocaleString("de-CH", {
        day:"2-digit", month:"2-digit", year:"numeric",
        hour:"2-digit", minute:"2-digit" })
    : null;

  const periodLabel = period === "Intraday" ? "1D" : period;

  // ── Dividend prefetch — uses globalDivCache (shared, sessionStorage-backed) ──
  useEffect(() => {
    const symbols = Object.keys(quotes);
    if (symbols.length) globalDivCache.prefetch(symbols);
  }, [quotes]); // eslint-disable-line


  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      {/* Toolbar: period selector + refresh */}
      <div style={{ padding:"0 16px 0 16px", borderBottom:`1px solid ${THEME.border2}`,
        display:"flex", alignItems:"center", gap:4, flexShrink:0, height:44 }}>
        {/* Period buttons */}
        {ETF_PERIODS.map(p => (
          <button key={p.key} onClick={()=>onPeriod(p.key)} style={{
            padding:"4px 10px", border:"none", cursor:"pointer",
            background:period===p.key?"rgba(59,130,246,0.15)":"transparent",
            color:period===p.key?THEME.accent:THEME.text3,
            fontSize:11, fontWeight:700, fontFamily:"inherit",
            borderBottom:period===p.key?`2px solid ${THEME.accent}`:"2px solid transparent",
            borderRadius:"6px 6px 0 0", transition:"all 0.12s" }}>{p.label}</button>
        ))}
        <div style={{ flex:1 }}/>
        {/* Holdings count + last update */}
        <div style={{ fontSize:10, color:THEME.text3, marginRight:8, textAlign:"right" }}>
          {holdings.length} holdings
          {lastUpdated && <span style={{ marginLeft:8 }}>· Updated {lastUpdated}</span>}
        </div>
        {/* Refresh Holdings */}
        <button onClick={onRefreshHoldings}
          style={{ display:"flex", alignItems:"center", gap:5,
            padding:"5px 12px", borderRadius:8, border:`1px solid ${THEME.border}`,
            background:"transparent", color:THEME.text2, fontSize:11,
            fontWeight:600, cursor:"pointer", fontFamily:"inherit", flexShrink:0 }}>
          <span style={{ display:"flex" }}>
            {refreshing
              ? <span className="spin" style={{ display:"flex" }}><RefreshCw size={12}/></span>
              : <RefreshCw size={12}/>}
          </span>
          Refresh Holdings
        </button>
      </div>

      {/* Table */}
      <div style={{ flex:1, overflowY:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead>
            <tr style={{ borderBottom:`1px solid ${THEME.border2}` }}>
              {["#","Symbol","Name","Weight","Trend","Price",periodLabel,"Div. Yield","Ex-Date"].map(h => (
                <th key={h} style={{ padding:"7px 12px",
                  textAlign:["#","Weight","Price",periodLabel].includes(h)?"right":"left",
                  fontSize:9, fontWeight:700, color:THEME.text3,
                  textTransform:"uppercase", letterSpacing:"0.07em",
                  position:"sticky", top:0, background:THEME.bg,
                  whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((h, i) => {
              const isPos = (h.perf ?? 0) >= 0;
              const pColor = h.perf==null ? THEME.text3
                : isPos ? THEME.green : THEME.red;
              const chartData = globalChartCache.get(h.symbol) ?? null;
              return (
                <tr key={h.symbol}
                  style={{ borderBottom:`1px solid rgba(255,255,255,0.03)`, cursor:"default" }}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.03)"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>

                  {/* # */}
                  <td style={{ padding:"6px 12px", textAlign:"right",
                    color:THEME.text3, fontSize:10,
                    fontFamily:"'JetBrains Mono',monospace" }}>{i+1}</td>

                  {/* Symbol + shortName */}
                  <td style={{ padding:"6px 12px", whiteSpace:"nowrap" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                      <div style={{ width:6, height:6, borderRadius:"50%", flexShrink:0,
                        background:getPerfColor(h.perf??0) }}/>
                      <div>
                        <div style={{ fontWeight:700, color:THEME.text1,
                          fontFamily:"'JetBrains Mono',monospace",
                          fontSize:11, lineHeight:1.2 }}>{h.symbol}</div>
                        {h.shortName && (
                          <div style={{ fontSize:9, color:THEME.text3, lineHeight:1.2,
                            maxWidth:120, overflow:"hidden", textOverflow:"ellipsis",
                            whiteSpace:"nowrap" }}>{h.shortName}</div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Name */}
                  <td style={{ padding:"6px 12px", color:THEME.text2, maxWidth:180,
                    whiteSpace:"nowrap", overflow:"hidden",
                    textOverflow:"ellipsis" }}>{h.name}</td>

                  {/* Weight bar */}
                  <td style={{ padding:"6px 12px", textAlign:"right" }}>
                    <div style={{ display:"flex", alignItems:"center",
                      justifyContent:"flex-end", gap:6 }}>
                      <div style={{ height:4, borderRadius:2, flexShrink:0,
                        width:Math.max(4, Math.round(h.weight*8)),
                        background:`rgba(59,130,246,${0.3+h.weight/20})` }}/>
                      <span style={{ fontFamily:"'JetBrains Mono',monospace",
                        color:THEME.text1, fontSize:11, minWidth:44, textAlign:"right" }}>
                        {h.weight.toFixed(2)}%
                      </span>
                    </div>
                  </td>

                  {/* Sparkline */}
                  <td style={{ padding:"3px 12px", textAlign:"left" }}>
                    <HoldingSparkline
                      chartData={chartData}
                      period={period}
                      isPos={isPos}
                      W={80} H={26}/>
                  </td>

                  {/* Price */}
                  <td style={{ padding:"6px 12px", textAlign:"right",
                    fontFamily:"'JetBrains Mono',monospace",
                    color:h.price?THEME.text1:THEME.text3 }}>
                    {h.price ? `${cSym}${(h.price*rate).toFixed(2)}` : "—"}
                  </td>

                  {/* Period perf */}
                  <td style={{ padding:"6px 12px", textAlign:"right",
                    fontFamily:"'JetBrains Mono',monospace", color:pColor,
                    fontWeight:600 }}>
                    {h.perf!=null
                      ? `${h.perf>=0?"+":""}${h.perf.toFixed(2)}%`
                      : "—"}
                  </td>

                  {/* Div. Yield */}
                  <td style={{ padding:"6px 12px", textAlign:"right",
                    fontFamily:"'JetBrains Mono',monospace" }}>
                    {h.div === undefined
                      ? <span style={{color:THEME.text3,fontSize:10}}>…</span>
                      : h.div?.yieldPct != null
                        ? <span style={{ color:"#fbbf24", fontWeight:600 }}>
                            {h.div.yieldPct.toFixed(2)}%
                          </span>
                        : <span style={{color:THEME.text3}}>—</span>}
                  </td>

                  {/* Ex-Date */}
                  <td style={{ padding:"6px 12px", textAlign:"right",
                    fontFamily:"'JetBrains Mono',monospace", fontSize:10,
                    color:THEME.text3 }}>
                    {h.div === undefined ? "" :
                      h.div?.exDate
                        ? <span title={h.div.nextExDate ? `Est. next: ${h.div.nextExDate}` : undefined}>
                            {h.div.exDate}
                            {h.div.nextExDate && (
                              <div style={{fontSize:9, color:"#60a5fa", marginTop:1}}>
                                → {h.div.nextExDate}
                              </div>
                            )}
                          </span>
                        : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── ETF Explorer main component ───────────────────────────────────────────────
function EtfExplorer({ onBack, user, savedEtfs: initialSavedEtfs, onLogin, onSwitchToPortfolio, onSignOut,
                       displayMode, onToggleDisplayMode,
                       railOpen, onToggleRail }) {
  useGlobalStyles();

  const [selectedTicker,    setSelectedTicker]    = useState(() => {
    try { return localStorage.getItem(ETF_LS_KEY) || "ARKK"; } catch { return "ARKK"; }
  });
  const [holdings,          setHoldings]          = useState([]);
  // divCache via useDivCache hook — React-reactive, backed by globalDivCache (sessionStorage)
  const holdingSymbols = useMemo(() => holdings.map(h => h.symbol), [holdings]);
  const divCache = useDivCache(holdingSymbols);
  const [fetchedAt,         setFetchedAt]         = useState(null);
  const [loadingHoldings,   setLoadingHoldings]   = useState(false);
  const [holdingsError,     setHoldingsError]     = useState(null);
  const [activeTab,         setActiveTab]         = useState("holdings");
  const [period,            setPeriod]            = useState("Intraday");
  const [barSubView,        setBarSubView]        = useState("perf");
  const [currency,          setCurrency]          = useState("USD");
  const [tooltip,           setTooltip]           = useState(null);
  const [fetchErrors,       setFetchErrors]       = useState({});
  const [quotes,            setQuotes]            = useState({});
  const [rates,             setRates]             = useState({ USD:1 });
  const [fetching,          setFetching]          = useState(false);
  // chartDataMap + pendingHover replaced by globalChartCache
  const tooltipTimer = useRef(null);
  const [savedEtfs,   setSavedEtfs]   = useState(initialSavedEtfs || []);
  const [saveModal,   setSaveModal]   = useState(null); // etf object to save, or null

  // FX rates
  useEffect(() => {
    fetch(`${ETF_BASE}/fx/all`).then(r=>r.json())
      .then(d=>setRates(d)).catch(()=>{});
  }, []);

  // Load holdings
  const [dynamicName, setDynamicName] = useState(null); // name from API for non-preset ETFs

  const loadHoldings = useCallback(async (ticker, force=false) => {
    setLoadingHoldings(true); setHoldingsError(null); setDynamicName(null);
    try {
      const url = `${ETF_BASE}/etf/${encodeURIComponent(ticker.replace(".","_"))}/holdings`;
      const data = await fetch(url).then(r=>r.json());
      if (data.error) throw new Error(data.error);
      setHoldings(data.holdings||[]);
      setFetchedAt(data.fetched_at||null);
      // Store any name returned from the API (useful for non-preset ETFs)
      if (data.name) setDynamicName(data.name);
      try { localStorage.setItem(ETF_LS_KEY, ticker); } catch {}
    } catch(e) { setHoldingsError(e.message); setHoldings([]); }
    setLoadingHoldings(false);
  }, []);

  // fetchDiv delegates to globalDivCache — shared across ETF + Portfolio, sessionStorage-backed
  const fetchDiv = useCallback((symbol) => globalDivCache.fetch(symbol), []);

  useEffect(() => {
    if (selectedTicker) {
        setHoldings([]);             // clear old holdings immediately
      loadHoldings(selectedTicker);
    }
  }, [selectedTicker, loadHoldings]);

  // Fetch quotes — use batch endpoint (returns parsed price/changePct/refs like portfolio mode)
  const fetchQuotes = useCallback(async () => {
    if (!holdings.length) return;
    setFetching(true); setFetchErrors({});
    try {
      const symbols = holdings.map(h => h.symbol);
      const res = await fetch(`${ETF_BASE}/quotes/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols, source: "yahoo", force: !!force }),
      }).then(r => r.json());
      setQuotes(prev => ({ ...prev, ...(res.results || {}) }));
      setFetchErrors(res.errors || {});
    } catch(e) {
      setFetchErrors({ _global: e.message });
    }
    setFetching(false);
  }, [holdings]);

  // Fetch div data whenever tab changes to calendar AND we have holdings
  useEffect(() => {
    if (activeTab === "calendar" && holdings.length > 0) {
      // Re-trigger any symbols not yet in divCache
      holdings.forEach(h => {
        if (divCache[h.symbol] === undefined) {
          fetchDiv(h.symbol);
        }
      });
    }
  }, [activeTab, holdings]); // eslint-disable-line

  useEffect(() => {
    if (!holdings.length) return;
    fetchQuotes();
    // Preload dividend data — useDivCache hook handles this automatically
    // Preload chart data for holdings — staggered to avoid flooding Yahoo/rate-limit.
    // Only fetch symbols not already cached. Max 3 concurrent, 300ms between batches.
    const toFetch = holdings.filter(h => !globalChartCache.has(h.symbol));
    const CONCURRENCY = 3;
    const fetchBatch = async (items) => {
      for (let i = 0; i < items.length; i += CONCURRENCY) {
        const batch = items.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(h =>
          quotesApi.raw(h.symbol)
            .then(d => { if (d) globalChartCache.set(h.symbol, d); })
            .catch(()=>{})
        ));
        if (i + CONCURRENCY < items.length) {
          await new Promise(r => setTimeout(r, 300)); // 300ms pause between batches
        }
      }
    };
    fetchBatch(toFetch);
  }, [holdings]); // eslint-disable-line

  // Nodes
  const nodes = useMemo(()=>buildEtfNodes(holdings,quotes,period),
    [holdings,quotes,period]);

  // etfMeta: look up from presets first, then savedEtfs, then construct minimal from ticker
  const etfMeta = useMemo(() => {
    const preset = PREDEFINED_ETFS_CLIENT.find(e => e.ticker === selectedTicker);
    if (preset) return preset;
    const saved  = savedEtfs.find(e => e.ticker === selectedTicker);
    if (saved)  return saved;
    // For live-searched ETFs we may have name in holdings response meta
    if (selectedTicker) return { ticker: selectedTicker, name: null, provider: null };
    return null;
  }, [selectedTicker, savedEtfs]);

  // Tooltip
  const handleCellHover = useCallback((e,cell) => {
    clearTimeout(tooltipTimer.current);
    // globalChartCache + globalDivCache handle dedup and caching
    globalChartCache.prefetch(cell.symbol);
    globalDivCache.fetch(cell.symbol);
    tooltipTimer.current = setTimeout(()=>
      setTooltip({x:e.clientX,y:e.clientY,data:cell}), 120);
  }, []);
  const handleCellLeave = useCallback(()=>{
    clearTimeout(tooltipTimer.current); setTooltip(null);
  }, []);

  return (
    <div style={{ height:"100%", display:"flex", background:THEME.bg,
      fontFamily:THEME.font, overflow:"hidden" }}>

      <EtfRail
        open={railOpen} onToggle={onToggleRail}
        selectedTicker={selectedTicker} onSelect={setSelectedTicker}
        currency={currency} onCurrency={setCurrency}
        fetching={fetching} onRefreshQuotes={fetchQuotes}
        user={user}
        savedEtfs={savedEtfs}
        onSaveEtf={(etf, directList) => {
          if (directList) {
            // All custom ETFs saved in bulk — update savedEtfs directly
            setSavedEtfs(directList);
          } else if (etf) {
            // Single ETF save — open auth modal
            setSaveModal(etf);
          }
        }}
        onRemoveEtf={async (ticker) => {
          if (!user) return;
          try {
            const res = await etfApi.remove(user.id, ticker);
            setSavedEtfs(res.etfs || []);
          } catch(e) { console.error("Remove ETF failed", e); }
        }}
        onSwitchToPortfolio={onSwitchToPortfolio}
        onBack={onBack}
        onSignOut={onSignOut || (onSwitchToPortfolio ? () => { onBack(); } : null)}
        displayMode={displayMode}
        onToggleDisplayMode={onToggleDisplayMode}
      />

      <div style={{ flex:1, display:"flex", flexDirection:"column",
        overflow:"hidden", minWidth:0 }}>

        {/* Top tab bar */}
        <div style={{ height:52, background:THEME.surface,
          borderBottom:`1px solid ${THEME.border}`,
          display:"flex", alignItems:"center", padding:"0 16px",
          gap:2, flexShrink:0 }}>

          {[
            { key:"holdings",     icon:<LayoutDashboard size={14}/>, label:"TreeMap"   },
            { key:"chart",        icon:<BarChart2 size={14}/>,       label:"Bar Chart" },
            { key:"transactions", icon:<List size={14}/>,            label:"Holdings"  },
            { key:"calendar",     icon:<CalendarDays size={14}/>,    label:"Dividends" },
          ].map(t => (
            <button key={t.key} onClick={()=>setActiveTab(t.key)}
              style={{
                display:"flex", alignItems:"center", gap:7,
                padding:"7px 14px", border:"none", cursor:"pointer",
                background:activeTab===t.key?"rgba(59,130,246,0.15)":"transparent",
                color:activeTab===t.key?THEME.accent:THEME.text3,
                borderRadius:9, fontSize:12,
                fontWeight:activeTab===t.key?700:500,
                fontFamily:"inherit", transition:"background 0.3s ease, color 0.3s ease, font-weight 0.15s" }}>
              {t.icon}{t.label}
            </button>
          ))}
          {/* ETF badge */}
          <div style={{ marginLeft:"auto", display:"flex",
            alignItems:"center", gap:8 }}>
            {loadingHoldings && (
              <span className="spin" style={{ display:"flex",color:THEME.text3 }}>
                <RefreshCw size={13}/>
              </span>
            )}
            {selectedTicker && (
              <div style={{ fontSize:11, color:THEME.text3 }}>
                <span style={{ fontWeight:700, color:THEME.accent,
                  fontFamily:"'JetBrains Mono',monospace" }}>
                  {selectedTicker}
                </span>
                {(etfMeta?.name || dynamicName) && (
                  <><span style={{ margin:"0 6px" }}>·</span>
                  {etfMeta?.name || dynamicName}</>
                )}
              </div>
            )}
            {holdingsError && (
              <div style={{ display:"flex", alignItems:"center", gap:5,
                fontSize:11, color:THEME.red }}>
                <AlertCircle size={12}/> {holdingsError}
              </div>
            )}
          </div>
        </div>

        {/* Summary bar */}
        <EtfSummaryBar etfMeta={etfMeta} nodes={nodes} fetchErrors={fetchErrors}/>

        {/* Period toolbar — shown for TreeMap and BarChart tabs */}
        {activeTab !== "transactions" && (
          <div style={{ padding:"0 16px 0 22px", display:"flex", alignItems:"center",
            borderBottom:`1px solid ${THEME.border}`, height:46,
            background:THEME.surface, flexShrink:0 }}>
            {ETF_PERIODS.map(p => (
              <button key={p.key} onClick={()=>setPeriod(p.key)} style={{
                padding:"5px 12px", border:"none", cursor:"pointer",
                background:period===p.key?"rgba(59,130,246,0.15)":"transparent",
                color:period===p.key?THEME.accent:THEME.text3,
                fontSize:11, fontWeight:700, fontFamily:"inherit",
                borderBottom:period===p.key?`2px solid ${THEME.accent}`:"2px solid transparent",
                borderRadius:"7px 7px 0 0" }}>{p.label}</button>
            ))}
            {activeTab==="chart" && (
              <>
                <div style={{ width:1, height:20, background:THEME.border, margin:"0 12px" }}/>
                <div style={{ display:"flex", gap:2, background:"rgba(0,0,0,0.25)",
                  borderRadius:9, padding:3, border:`1px solid ${THEME.border}` }}>
                  {[["perf","Performance"],["size","By Weight"]].map(([key,label])=>(
                    <button key={key} onClick={()=>setBarSubView(key)} style={{
                      padding:"4px 11px", border:"none", cursor:"pointer",
                      borderRadius:7, fontSize:10, fontWeight:700,
                      fontFamily:"inherit", transition:"all 0.15s",
                      background:barSubView===key?"rgba(59,130,246,0.22)":"transparent",
                      color:barSubView===key?THEME.accent:THEME.text3 }}>{label}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Content */}
        <div style={{ flex:1, overflow:"hidden", minHeight:0 }}>
          {loadingHoldings ? (
            <div style={{ display:"flex", alignItems:"center",
              justifyContent:"center", height:"100%",
              flexDirection:"column", gap:12 }}>
              <span className="spin" style={{ display:"flex", color:THEME.accent }}>
                <RefreshCw size={24}/>
              </span>
              <div style={{ color:THEME.text3, fontSize:13 }}>
                Loading {selectedTicker} holdings…
              </div>
            </div>
          ) : activeTab==="holdings" ? (
            <div style={{ padding:16, height:"100%", overflow:"hidden" }}>
              {holdingsError ? (
                <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
                  height:"100%", flexDirection:"column", gap:12 }}>
                  <AlertCircle size={32} style={{ color:THEME.red, opacity:0.7 }}/>
                  <div style={{ color:THEME.text2, fontSize:13, textAlign:"center",
                    maxWidth:320, lineHeight:1.6 }}>
                    {holdingsError}
                  </div>
                  <button onClick={()=>loadHoldings(selectedTicker,true)}
                    style={{ padding:"7px 18px", borderRadius:8, border:`1px solid ${THEME.border}`,
                      background:"transparent", color:THEME.text3, fontSize:11,
                      cursor:"pointer", fontFamily:"inherit", display:"flex",
                      alignItems:"center", gap:6 }}>
                    <RefreshCw size={12}/> Retry
                  </button>
                </div>
              ) : nodes.length === 0 ? (
                <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
                  height:"100%", flexDirection:"column", gap:16 }}>
                  <div style={{ fontSize:36, opacity:0.25 }}>📊</div>
                  <div style={{ color:THEME.text2, fontSize:14, fontWeight:600 }}>
                    No Holdings Data for {selectedTicker}
                  </div>
                  <div style={{ fontSize:11, color:THEME.text3, maxWidth:300,
                    textAlign:"center", lineHeight:1.7 }}>
                    Holdings data is not available for this ETF via Alpha Vantage.
                    Try switching to the <strong style={{color:THEME.text2}}>Holdings</strong> tab
                    for more detail, or select a different ETF.
                  </div>
                  <button onClick={()=>loadHoldings(selectedTicker,true)}
                    style={{ marginTop:4, padding:"7px 18px", borderRadius:8,
                      border:`1px solid ${THEME.border}`, background:"transparent",
                      color:THEME.text3, fontSize:11, cursor:"pointer",
                      fontFamily:"inherit", display:"flex", alignItems:"center", gap:6 }}>
                    <RefreshCw size={12}/> Retry
                  </button>
                </div>
              ) : (
                <TreeMapView nodes={nodes}
                  onCellHover={handleCellHover} onCellLeave={handleCellLeave}
                  currency={currency} rates={rates} colorMode="market"/>
              )}
            </div>
          ) : activeTab==="chart" ? (
            <div style={{ height:"100%", overflow:"hidden" }}>
              <BarChartView nodes={nodes} currency={currency} rates={rates}
                colorMode="market" period={period} subView={barSubView}
                onCellHover={handleCellHover} onCellLeave={handleCellLeave}/>
            </div>
          ) : activeTab==="calendar" ? (
            <div style={{ height:"100%", overflow:"hidden" }}>
              <DividendCalendar
                allNodes={nodes}
                divCache={divCache}
                etfHoldings={holdings}
                isEtfMode={true}
                currency={currency}
                rates={rates}
                onCellHover={handleCellHover}
                onCellLeave={handleCellLeave}
                onRefreshDivs={() => {
                  holdings.forEach(h => fetchDiv(h.symbol));
                }}/>
            </div>
          ) : (
            <EtfHoldingsTable
              holdings={holdings} quotes={quotes}
              currency={currency} rates={rates}
              fetchedAt={fetchedAt}
              period={period} onPeriod={setPeriod}
              onRefreshHoldings={()=>loadHoldings(selectedTicker,true)}
              refreshing={loadingHoldings}
              divCache={divCache} onFetchDiv={fetchDiv}/>
          )}
        </div>
      </div>

      {tooltip && (
        <Tooltip
          data={tooltip.data} x={tooltip.x} y={tooltip.y}
          currency={currency} rates={rates} period={period}
          chartData={globalChartCache.get(tooltip.data.symbol)}
          chartDataIntraday={globalChartCache.get(`${tooltip.data.symbol}_1d`)}/>
      )}
    {/* Save ETF modal */}
    {saveModal && (
      <SaveEtfModal
        etf={saveModal}
        user={user}
        onClose={() => setSaveModal(null)}
        onLogin={(loggedIn) => { onLogin && onLogin(loggedIn); }}
        onSaved={(u, etfs) => { setSavedEtfs(etfs); setSaveModal(null); }}
      />
    )}
    </div>
  );
}


// ════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ════════════════════════════════════════════════════════════════════════════
export default function App() {
  useGlobalStyles();
  const { mode: displayMode, setMode: setDisplayMode, toggle: toggleDisplayMode } = useDisplayMode();
  // ── Auth state ────────────────────────────────────────────────────────────
  const [user,       setUser]       = useState(null);
  const [portfolios, setPortfolios] = useState([]);  // all user's portfolios
  const [etfMode,    setEtfMode]    = useState(false); // ETF Explorer mode

  // ── Rail state ────────────────────────────────────────────────────────────
  const [railOpen,          setRailOpen]          = useState(false);
  const [activePortfolioIds,setActivePortfolioIds] = useState([]);  // checked portfolios
  const [viewMode,          setViewMode]           = useState("aggregated"); // aggregated|consolidated|split
  const [barSubView,        setBarSubView]         = useState("perf"); // perf|size — shared across all bar charts
  const [ansicht,           setAnsicht]            = useState("portfolio"); // portfolio|instruments — performance tab
  // Performance: benchmark / instrument overlay state (lifted so PeriodToolbar can show the picker)
  const [benchSymbols,      setBenchSymbols]       = useState([]);
  const [instrOverlays,     setInstrOverlays]      = useState([]);
  const [showVergleich,     setShowVergleich]      = useState(false);
  const [perfSymbols,       setPerfSymbols]        = useState([]); // allSymbols from PerformanceView
  const [perfSeriesColors,  setPerfSeriesColors]   = useState({}); // { sym → color } from allSeries
  const vergleichRef = useRef(null);
  const [activeTab,         setActiveTab]          = useState("holdings");

  // ── UI state ──────────────────────────────────────────────────────────────
  const [period,     setPeriod]     = useState("Intraday");
  const [currency,   setCurrency]   = useState("USD");
  const [colorMode,  setColorMode]  = useState("market");
  const [showAddTx,  setShowAddTx]  = useState(false);
  const [editTx,     setEditTx]     = useState(null); // {portfolioId, tx}
  const [editPlan,   setEditPlan]   = useState(null); // plan object
  const [showAddPort,setShowAddPort]= useState(false);
  const [showImportExport, setShowImportExport] = useState(false);
  const [savedEtfs,       setSavedEtfs]        = useState([]);
  // portfolioDivCache → replaced by useDivCache hook below (shares globalDivCache with ETF Explorer)
  const [showSettings,setShowSettings]=useState(false);
  const [renamePort, setRenamePort] = useState(null); // portfolio object to rename
  const [tooltip,    setTooltip]    = useState(null);

  // ── Data state ────────────────────────────────────────────────────────────
  const [allTransactions,  setAllTransactions]  = useState({});  // { [portfolioId]: tx[] }
  const [allSavingsPlans,  setAllSavingsPlans]  = useState({});  // { [portfolioId]: plan[] }
  const [quotes,          setQuotes]          = useState({});
  const [rates,           setRates]           = useState({ USD:1 });
  const [ratesSource,     setRatesSource]     = useState("live");
  const [dataSource,      setDataSource]      = useState("yahoo");
  const [avApiKey,        setAvApiKey]        = useState("");
  const [avUsage,         setAvUsage]         = useState(null);
  const [fetchStatus,     setFetchStatus]     = useState("");
  const [fetchErrors,     setFetchErrors]     = useState({});
  const [apiStatus,       setApiStatus]       = useState(null);
  const [lastUpdated,     setLastUpdated]     = useState(null);  // Date of last successful quote fetch
  const [initialized,     setInitialized]     = useState(false);
  // chartDataMap removed — globalChartCache handles this now (shared with ETF)

  const tooltipTimer = useRef(null);

  // ── Login handler ─────────────────────────────────────────────────────────
  const handleLogin = useCallback(async (userData) => {
    setUser(userData);
    etfApi.list(userData.id).then(res => setSavedEtfs(res.etfs || [])).catch(()=>{});
    const ports = userData.portfolios ?? [];
    setPortfolios(ports);
    setActivePortfolioIds(ports.map(p => p.id)); // all active by default
    if (userData.settings) {
      setDataSource(userData.settings.data_source ?? "yahoo");
      setAvApiKey(userData.settings.api_keys?.alphavantage ?? "");
      setCurrency(userData.settings.display_ccy ?? "USD");
    }
    // Load FX
    try {
      const fx = await fxApi.all();
      setRates(fx);
      setRatesSource(fx._fallback ? "fallback" : "live");
    } catch { setRatesSource("fallback"); }
    // Load transactions + savings plans for all portfolios
    const txMap = {}, plansMap = {};
    await Promise.all(ports.map(async p => {
      try { txMap[p.id]    = await txApi.list(p.id);    } catch { txMap[p.id]    = []; }
      try { plansMap[p.id] = await plansApi.list(p.id); } catch { plansMap[p.id] = []; }
    }));
    setAllTransactions(txMap);
    setAllSavingsPlans(plansMap);
    setInitialized(true);
    // AV usage
    avApi.usage().then(setAvUsage).catch(() => {});
  }, []);

  const handleLogout = () => {
    setUser(null); setPortfolios([]); setInitialized(false);
    setAllTransactions({}); setAllSavingsPlans({}); setQuotes({});
    setActivePortfolioIds([]);
  };

  // ── Active portfolios (checked in rail) ───────────────────────────────────
  const activePortfolios = useMemo(() =>
    portfolios.filter(p => activePortfolioIds.includes(p.id))
  , [portfolios, activePortfolioIds]);

  const togglePortfolio = useCallback((id) => {
    setActivePortfolioIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }, []);

  // ── Positions derived from transactions ───────────────────────────────────
  // Returns positions per portfolio
  const positionsByPortfolio = useMemo(() => {
    const result = {};
    for (const pid of activePortfolioIds) {
      const txs = allTransactions[pid] ?? [];
      const map = {};
      for (const tx of txs) {
        const sym = tx.symbol;
        if (!map[sym]) map[sym] = { symbol:sym, name:tx.name, qty:0, costUSD:0, portfolioId:pid };
        const qty = tx.type==="BUY" ? tx.quantity : -tx.quantity;
        map[sym].qty     += qty;
        map[sym].costUSD += tx.type==="BUY" ? tx.quantity * (tx.price_usd||tx.price) : 0;
      }
      result[pid] = Object.values(map).filter(p => p.qty > 0.0001);
    }
    return result;
  }, [allTransactions, activePortfolioIds]);

  // All unique symbols across active portfolios
  const allSymbols = useMemo(() => {
    const syms = new Set();
    for (const pid of activePortfolioIds) {
      for (const p of (positionsByPortfolio[pid] ?? [])) syms.add(p.symbol);
    }
    return [...syms];
  }, [positionsByPortfolio, activePortfolioIds]);

  // portfolioDivCache: React-reactive, shared with ETF Explorer via globalDivCache + sessionStorage
  const portfolioDivCache = useDivCache(allSymbols);

  // ── getPosPerf: period-aware performance for a position ───────────────────
  // All comparisons in the instrument's native price currency (refs are also in that currency).
  // For "Max" we compare USD avg cost vs current price — both converted to USD.
  const getPosPerf = useCallback((p) => {
    const q = quotes[p.symbol];
    if (!q?.price) return null;
    if (period === "Intraday") {
      const base = q.prevClose > 0 ? q.prevClose : q.open;
      return base > 0 ? ((q.price - base)/base)*100 : null;
    }
    if (period === "Max") {
      // costUSD is the true USD cost basis. Convert current price to USD for fair comparison.
      const r = (q.currency && q.currency !== "USD") ? (rates[q.currency] ?? 1) : 1;
      const currentUSD = r > 0 ? q.price / r : q.price;
      const avgCostUSD = p.qty > 0 ? p.costUSD / p.qty : 0;
      return avgCostUSD > 0 ? ((currentUSD - avgCostUSD)/avgCostUSD)*100 : null;
    }
    // For period refs (1W, 1M, YTD, 1Y, 2Y): refs are in the instrument's own currency,
    // so we can compare q.price vs ref directly (same currency, no conversion needed).
    const ref = q.refs?.[period];
    if (ref && +ref > 0) return ((q.price - +ref)/+ref)*100;
    return null;
  }, [quotes, period, rates]);

  // ── Helper: convert a quote price to USD using live rates ──────────────────
  // rates = { USD:1, EUR:0.92, CHF:0.90, ... } meaning 1 USD = X foreignCcy
  // so foreignCcy → USD: divide by rate.  E.g. CHF price / 0.90 = USD price
  const toUSD = useCallback((price, quoteCurrency) => {
    if (!quoteCurrency || quoteCurrency === "USD") return price;
    const r = rates[quoteCurrency] ?? 1;
    return r > 0 ? price / r : price;
  }, [rates]);

  // ── Tree nodes per portfolio ───────────────────────────────────────────────
  const treeNodesByPortfolio = useMemo(() => {
    const result = {};
    for (const pid of activePortfolioIds) {
      const positions = positionsByPortfolio[pid] ?? [];
      const totalUSD  = positions.reduce((s,p) => {
        const q = quotes[p.symbol];
        const priceUSD = q ? toUSD(q.price, q.currency) : p.costUSD/Math.max(p.qty,1);
        return s + priceUSD * p.qty;
      }, 0);
      result[pid] = positions.map(p => {
        const q               = quotes[p.symbol];
        // Convert quote price (in instrument's trading currency) to USD
        const currentPriceUSD = q ? toUSD(q.price, q.currency) : p.costUSD/Math.max(p.qty,1);
        const valueUSD        = currentPriceUSD * p.qty;
        const perf            = getPosPerf(p);
        const gainLossUSD     = valueUSD - p.costUSD;
        const glPerf          = p.costUSD > 0 ? (gainLossUSD/p.costUSD)*100 : null;
        return { ...p, portfolioId:pid, currentPriceUSD, valueUSD, perf, glPerf, gainLossUSD,
                 weight: totalUSD > 0 ? (valueUSD/totalUSD)*100 : 0,
                 quote:q, shortName:q?.shortName??null, longName:q?.longName??null };
      });
    }
    return result;
  }, [positionsByPortfolio, quotes, getPosPerf, activePortfolioIds]);

  // ── Aggregated nodes (merge same symbol across portfolios) ────────────────
  const aggregatedNodes = useMemo(() => {
    const map = {};
    for (const pid of activePortfolioIds) {
      for (const node of (treeNodesByPortfolio[pid] ?? [])) {
        if (!map[node.symbol]) {
          map[node.symbol] = { ...node, portfolioId:"aggregated" };
        } else {
          map[node.symbol].qty      += node.qty;
          map[node.symbol].costUSD  += node.costUSD;
          map[node.symbol].valueUSD += node.valueUSD;
          map[node.symbol].gainLossUSD += node.gainLossUSD;
        }
      }
    }
    // Recalculate perf and weight on merged nodes
    const totalUSD = Object.values(map).reduce((s,n) => s + n.valueUSD, 0);
    return Object.values(map).map(n => ({
      ...n,
      perf:   getPosPerf({ ...n, symbol:n.symbol }),
      glPerf: n.costUSD > 0 ? (n.gainLossUSD/n.costUSD)*100 : null,
      weight: totalUSD > 0 ? (n.valueUSD/totalUSD)*100 : 0,
      trailingPE: quotes[n.symbol]?.trailingPE ?? null,
      forwardPE:  quotes[n.symbol]?.forwardPE  ?? null,
    }));
  }, [treeNodesByPortfolio, activePortfolioIds, getPosPerf]);

  // ── All nodes flat (for bar chart etc) ───────────────────────────────────
  const allNodes = useMemo(() => {
    if (viewMode === "aggregated") return aggregatedNodes;
    return activePortfolioIds.flatMap(pid => treeNodesByPortfolio[pid] ?? []);
  }, [viewMode, aggregatedNodes, treeNodesByPortfolio, activePortfolioIds]);

  // ── Portfolio performance summary ─────────────────────────────────────────
  const { totalValueUSD, totalCostUSD, portfolioPerf } = useMemo(() => {
    // allNodes.valueUSD and costUSD are already in true USD — use them directly
    const tvUSD = allNodes.reduce((s,n) => s + (n.valueUSD??0), 0);
    const tcUSD = allNodes.reduce((s,n) => s + n.costUSD, 0);
    let sv=0, cv=0;
    for (const n of allNodes) {
      const q = n.quote;
      if (!q?.price) continue;
      // Convert quote prices to USD using the instrument's trading currency
      const r = (q.currency && q.currency !== "USD") ? (rates[q.currency] ?? 1) : 1;
      const priceUSD   = r > 0 ? q.price / r : q.price;
      if (period==="Max") {
        const avgCostUSD = n.qty > 0 ? n.costUSD / n.qty : 0;
        if (avgCostUSD > 0) { sv += avgCostUSD * n.qty; cv += priceUSD * n.qty; }
        continue;
      }
      const refNative = period==="Intraday"
        ? (q.prevClose>0 ? q.prevClose : q.open)
        : (q.refs?.[period] ? +q.refs[period] : null);
      if (!refNative) continue;
      const refUSD = r > 0 ? refNative / r : refNative;
      sv += refUSD   * n.qty;
      cv += priceUSD * n.qty;
    }
    return { totalValueUSD:tvUSD, totalCostUSD:tcUSD,
             portfolioPerf: sv>0?((cv-sv)/sv)*100:null };
  }, [allNodes, period, rates]);

  // ── Quote fetching ────────────────────────────────────────────────────────
  const fetchQuotes = useCallback(async (syms, force=false) => {
    if (!syms.length) return;
    setFetchStatus(`Fetching ${syms.length} symbols…`);
    setApiStatus("testing");
    try {
      const result = await quotesApi.batch(syms, dataSource, avApiKey, force);
      setQuotes(prev => ({ ...prev, ...result.results }));
      setFetchErrors(result.errors ?? {});
      const hasErrors = Object.keys(result.errors??{}).length > 0;
      const hasStale  = Object.values(result.results).some(q => q._stale);
      setApiStatus(hasErrors ? "error" : hasStale ? "stale" : "ok");
      if (!hasErrors || Object.keys(result.results).length > 0) setLastUpdated(new Date());
      if (dataSource==="alphavantage") avApi.usage().then(setAvUsage).catch(()=>{});
    } catch(e) { setApiStatus("error"); }
    setFetchStatus("");
  }, [dataSource, avApiKey]);

  // Initial fetch when initialized
  useEffect(() => {
    if (initialized && allSymbols.length) fetchQuotes(allSymbols);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized]);

  // Fetch new symbols when portfolios change
  useEffect(() => {
    if (!initialized) return;
    const missing = allSymbols.filter(s => !quotes[s]);
    if (missing.length) fetchQuotes(missing);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSymbols, initialized]);

  const handleRefresh = useCallback(() => fetchQuotes(allSymbols, true), [allSymbols, fetchQuotes]);

  const reloadTransactions = useCallback(async (portList) => {
    const updated = {};
    await Promise.all((portList ?? portfolios).map(async p => {
      try { updated[p.id] = await txApi.list(p.id); }
      catch { updated[p.id] = []; }
    }));
    setAllTransactions(prev => ({ ...prev, ...updated }));
  }, [portfolios]);

  const handleRecalcFX = useCallback(async () => {
    if (!confirm("This will recalculate price_usd for all non-USD transactions using historical FX rates. Continue?")) return;
    try {
      const result = await txApi.recalcFX();
      alert(`FX Recalculation complete:\nFixed: ${result.fixed}\nSkipped (already correct): ${result.skipped}\nFailed: ${result.failed}`);
      // Reload all transactions
      const updated = {};
      for (const p of portfolios) {
        updated[p.id] = await txApi.list(p.id);
      }
      setAllTransactions(updated);
    } catch(e) {
      alert("Recalculation failed: " + e.message);
    }
  }, [portfolios]);

  // ── Add Transaction handler ───────────────────────────────────────────────
  const handleAddTx = useCallback(async (portfolioId, txData) => {
    const saved = await txApi.add(portfolioId, txData);
    setAllTransactions(prev => ({
      ...prev, [portfolioId]: [saved, ...(prev[portfolioId]??[])],
    }));
    // Fetch quote for new symbol if needed
    if (!quotes[txData.symbol.toUpperCase()]) fetchQuotes([txData.symbol.toUpperCase()]);
  }, [quotes, fetchQuotes]);

  const handleDeleteTx = useCallback(async (portfolioId, txId) => {
    await txApi.delete(txId);
    setAllTransactions(prev => ({
      ...prev, [portfolioId]: (prev[portfolioId]??[]).filter(t => t.id !== txId),
    }));
  }, []);

  const handleUpdateTx = useCallback(async (portfolioId, txId, data) => {
    const updated = await txApi.update(txId, data);
    setAllTransactions(prev => ({
      ...prev, [portfolioId]: (prev[portfolioId]??[]).map(t => t.id===txId ? updated : t),
    }));
  }, []);

  const handleSavePlan = useCallback(async (portfolioId, planData) => {
    const saved = await plansApi.create(portfolioId, planData);
    setAllSavingsPlans(prev => ({
      ...prev, [portfolioId]: [saved, ...(prev[portfolioId] ?? [])],
    }));
  }, []);

  const handleUpdatePlan = useCallback(async (portfolioId, planId, data) => {
    const updated = await plansApi.update(planId, data);
    setAllSavingsPlans(prev => ({
      ...prev, [portfolioId]: (prev[portfolioId] ?? []).map(p => p.id === planId ? updated : p),
    }));
  }, []);

  const handleDeletePlan = useCallback(async (portfolioId, planId) => {
    await plansApi.delete(planId);
    setAllSavingsPlans(prev => ({
      ...prev, [portfolioId]: (prev[portfolioId] ?? []).filter(p => p.id !== planId),
    }));
  }, []);

  const handleRenamePortfolio = useCallback(async (pid, name) => {
    await userApi.renamePortfolio(pid, name);
    setPortfolios(prev => prev.map(p => p.id === pid ? { ...p, name } : p));
  }, []);

  const handleAddPortfolio = useCallback(async (name, color) => {
    const newPort = await userApi.createPortfolio(user.id, name, color);
    setPortfolios(prev => [...prev, newPort]);
    setActivePortfolioIds(prev => [...prev, newPort.id]);
    setAllTransactions(prev => ({ ...prev, [newPort.id]: [] }));
  }, [user]);

  const handleSaveSettings = useCallback(async () => {
    try {
      await userApi.saveSettings(user.id, {
        data_source: dataSource,
        api_keys: { alphavantage: avApiKey },
        display_ccy: currency,
      });
      setShowSettings(false);
      fetchQuotes(allSymbols, true);
    } catch(e) {}
  }, [user, dataSource, avApiKey, currency, allSymbols, fetchQuotes]);

  // ── Tooltip hover handlers ────────────────────────────────────────────────
  const handleCellHover = useCallback((e, cell) => {
    clearTimeout(tooltipTimer.current);
    // Preload chart + div data via global caches (deduped, sessionStorage-backed for divs)
    globalChartCache.prefetch(cell.symbol);
    globalDivCache.fetch(cell.symbol);   // warms div cache so Tooltip renders instantly
    tooltipTimer.current = setTimeout(() => setTooltip({ x:e.clientX, y:e.clientY, data:cell }), 120);
  }, []);

  const handleCellLeave = useCallback(() => {
    clearTimeout(tooltipTimer.current);
    setTooltip(null);
  }, []);

  // Close Vergleich picker when clicking outside
  useEffect(() => {
    if (!showVergleich) return;
    const handler = (e) => {
      if (vergleichRef.current && !vergleichRef.current.contains(e.target)) setShowVergleich(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showVergleich]);

  // ── Tab handler — also normalises viewMode when switching tabs ─────────────
  const handleTab = useCallback((tab) => {
    if (tab === "_addtx") { setShowAddTx(true); return; }
    setActiveTab(tab);
    // Analytics tabs don't use viewMode
    if (["correlation","montecarlo","rebalance","calendar"].includes(tab)) return;
    setViewMode(prev => {
      const usesConsolidated = tab === "holdings" || tab === "performance";
      if (usesConsolidated) {
        // holdings + performance use consolidated|aggregated
        // map single|split → consolidated|aggregated
        if (prev === "split")   return "aggregated";
        if (prev === "single")  return "consolidated";
        return prev; // consolidated or aggregated stay as-is
      } else {
        // chart + transactions use single|split
        // map consolidated|aggregated → single
        if (prev === "consolidated" || prev === "aggregated") return "single";
        return prev;
      }
    });
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (etfMode) return (
    <EtfExplorer
      onBack={() => setEtfMode(false)}
      user={user}
      savedEtfs={savedEtfs}
      onLogin={(loggedIn) => {
        // Use the full handleLogin flow so Portfolio view works immediately after switch
        handleLogin(loggedIn);
      }}
      onSwitchToPortfolio={() => setEtfMode(false)}
      onSignOut={user ? () => { setUser(null); setPortfolios([]); setSavedEtfs([]); setEtfMode(false); } : null}
      displayMode={displayMode}
      onToggleDisplayMode={(m) => typeof m==="string" ? setDisplayMode(m) : toggleDisplayMode()}
      railOpen={railOpen}
      onToggleRail={() => setRailOpen(v => !v)}
    />
  );
  if (!user) return <LoginScreen onLogin={handleLogin} onEtfMode={() => setEtfMode(true)}/>;

  if (!initialized) return (
    <div style={{ height:"100%", background:THEME.bg, display:"flex",
      alignItems:"center", justifyContent:"center" }}>
      <div style={{ color:THEME.text3, fontSize:14 }}>
        <span className="spin">⟳</span> Loading {user.username}…
      </div>
    </div>
  );

  return (
    <>
      <div id="ptv3-root" style={{ height:"100%", display:"flex", background:THEME.bg, fontFamily:THEME.font, overflow:"hidden" }}>

        {/* ── LEFT RAIL ──────────────────────────────────────────────── */}
        <Rail
          open={railOpen} onToggle={() => setRailOpen(v => !v)}
          user={user}
          portfolios={portfolios}
          activePortfolioIds={activePortfolioIds}
          onTogglePortfolio={togglePortfolio}
          viewMode={viewMode} onViewMode={setViewMode}
          activeTab={activeTab} onTab={handleTab}
          period={period} onPeriod={setPeriod}
          onRefresh={handleRefresh} fetching={!!fetchStatus}
          onAddPortfolio={() => setShowAddPort(true)}
          onRenamePortfolio={(p) => setRenamePort(p)}
          onSettings={() => setShowSettings(true)}
          onLogout={handleLogout}
          dataSource={dataSource}
          currency={currency} onCurrency={setCurrency}
          onRecalcFX={handleRecalcFX}
          onImportExport={() => setShowImportExport(true)}
          onEtfExplorer={() => setEtfMode(true)}
          displayMode={displayMode}
          onToggleDisplayMode={(m) => typeof m==="string" ? setDisplayMode(m) : toggleDisplayMode()}
        />

        {/* ── MAIN CONTENT ───────────────────────────────────────────── */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>

          {/* ── Top tab bar — Views + Analytics (same style as ETF view) ── */}
          <div style={{ height:52, background:THEME.surface,
            borderBottom:`1px solid ${THEME.border}`,
            display:"flex", alignItems:"center", padding:"0 16px",
            gap:2, flexShrink:0, zIndex:5 }}>

            {/* View tabs */}
            {[
              { key:"holdings",     icon:<LayoutDashboard size={14}/>, label:"TreeMap"    },
              { key:"chart",        icon:<BarChart2 size={14}/>,       label:"Bar Chart"  },
              { key:"performance",  icon:<TrendingUp  size={14}/>,     label:"Performance"},
              { key:"transactions", icon:<List size={14}/>,            label:"Holdings"   },
              { key:"calendar",     icon:<CalendarDays size={14}/>,    label:"Dividends"  },
            ].map(t => (
              <button key={t.key} onClick={() => handleTab(t.key)}
                style={{
                  display:"flex", alignItems:"center", gap:7,
                  padding:"7px 14px", border:"none", cursor:"pointer",
                  background: activeTab===t.key ? "rgba(59,130,246,0.15)" : "transparent",
                  color: activeTab===t.key ? THEME.accent : THEME.text3,
                  borderRadius:9, fontSize:12,
                  fontWeight: activeTab===t.key ? 700 : 500,
                  fontFamily:"inherit", transition:"background 0.3s ease, color 0.3s ease, font-weight 0.15s" }}>
                {t.icon}{t.label}
              </button>
            ))}

            {/* Separator */}
            <div style={{ width:1, height:20, background:THEME.border, margin:"0 6px", flexShrink:0 }}/>

            {/* Analytics tabs */}
            {[
              { key:"correlation", icon:<GitFork size={14}/>, label:"Correlation" },
              { key:"montecarlo",  icon:<Sigma size={14}/>,   label:"Monte Carlo" },
              { key:"rebalance",   icon:<Target size={14}/>,  label:"Rebalance"   },
            ].map(t => (
              <button key={t.key} onClick={() => handleTab(t.key)}
                style={{
                  display:"flex", alignItems:"center", gap:7,
                  padding:"7px 14px", border:"none", cursor:"pointer",
                  background: activeTab===t.key ? "rgba(59,130,246,0.15)" : "transparent",
                  color: activeTab===t.key ? THEME.accent : THEME.text3,
                  borderRadius:9, fontSize:12,
                  fontWeight: activeTab===t.key ? 700 : 500,
                  fontFamily:"inherit", transition:"background 0.3s ease, color 0.3s ease, font-weight 0.15s" }}>
                {t.icon}{t.label}
              </button>
            ))}

            {/* Spacer + Last Update + Refresh button */}
            <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:6 }}>
              {/* Status pill */}
              {apiStatus && apiStatus !== "ok" && (
                <div style={{ display:"flex", alignItems:"center", gap:5,
                  padding:"2px 8px", borderRadius:12, fontSize:9, fontWeight:700,
                  border:"1px solid",
                  ...(apiStatus==="stale"
                    ? { background:"rgba(251,191,36,0.1)", borderColor:"rgba(251,191,36,0.3)", color:"#fbbf24" }
                    : apiStatus==="testing"
                      ? { background:"rgba(59,130,246,0.12)", borderColor:"rgba(59,130,246,0.3)", color:THEME.accent }
                      : { background:"rgba(248,113,113,0.1)", borderColor:"rgba(248,113,113,0.25)", color:THEME.red })
                }}>
                  <span style={{ fontSize:6 }}>●</span>
                  {apiStatus==="testing" ? "Fetching…" : apiStatus==="stale" ? "⚠ Stale" : "Error"}
                </div>
              )}
              {/* Last Update timestamp */}
              {lastUpdated && apiStatus !== "testing" && (
                <div style={{ fontSize:9, color:THEME.text3,
                  display:"flex", alignItems:"center", gap:4 }}>
                  <span style={{ opacity:0.5 }}>Updated</span>
                  <span style={{ fontFamily:THEME.mono, color:THEME.text2, fontWeight:600 }}>
                    {lastUpdated.toLocaleString("de-CH", {
                      day:"2-digit", month:"2-digit", year:"numeric",
                      hour:"2-digit", minute:"2-digit"
                    })}
                  </span>
                </div>
              )}
              {/* Refresh button — icon only, shows label on hover */}
              <RefreshIconButton onClick={handleRefresh} loading={!!fetchStatus} />
            </div>
          </div>

          {/* Period toolbar — hide for analytics tabs */}
          {!["correlation","montecarlo","rebalance","calendar"].includes(activeTab) && (
            <PeriodToolbar period={period} onPeriod={setPeriod} viewMode={viewMode} onViewMode={setViewMode} activeTab={activeTab} portfolioCount={activePortfolios.length} subView={barSubView} onSubView={setBarSubView} ansicht={ansicht} onAnsicht={setAnsicht}
              extraRight={activeTab === "performance" ? (
                <div style={{ position:"relative" }} ref={vergleichRef}>
                  <button onClick={() => setShowVergleich(v => !v)}
                    style={{ padding:"4px 11px", borderRadius:7, cursor:"pointer", fontSize:10,
                      fontWeight:700, fontFamily:"inherit", letterSpacing:"0.04em",
                      border: (benchSymbols.length + instrOverlays.length) > 0
                        ? "1px solid rgba(99,102,241,0.45)" : "1px solid rgba(255,255,255,0.12)",
                      background: (benchSymbols.length + instrOverlays.length) > 0
                        ? "rgba(99,102,241,0.18)" : "rgba(255,255,255,0.04)",
                      color: (benchSymbols.length + instrOverlays.length) > 0 ? "#818cf8" : THEME.text2,
                      transition:"all 0.15s" }}>
                    + Vergleich{(benchSymbols.length + instrOverlays.length) > 0
                      ? ` (${benchSymbols.length + instrOverlays.length})` : ""}
                  </button>
                  {showVergleich && (
                    <div style={{ position:"fixed",
                      top: (vergleichRef.current?.getBoundingClientRect().bottom ?? 46) + 4,
                      left: vergleichRef.current?.getBoundingClientRect().left ?? 0,
                      zIndex:500, background:THEME.surface, border:`1px solid ${THEME.border}`,
                      borderRadius:12, padding:"12px 14px", minWidth:280, maxWidth:340,
                      boxShadow:"0 12px 40px rgba(0,0,0,0.7)" }}
                      onMouseDown={e => e.stopPropagation()}>
                      <div style={{ fontSize:9, color:THEME.text3, letterSpacing:"0.08em",
                        textTransform:"uppercase", marginBottom:8, fontWeight:700 }}>Benchmarks</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:14 }}>
                        {BENCHMARKS.map((b, i) => {
                          const active = benchSymbols.includes(b.sym);
                          const col = ["#94a3b8","#64748b","#475569","#6366f1","#818cf8","#a5b4fc","#c7d2fe","#e0e7ff","#cbd5e1","#e2e8f0"][i % 10];
                          return (
                            <button key={b.sym} onClick={() => setBenchSymbols(prev =>
                              prev.includes(b.sym) ? prev.filter(s => s !== b.sym) : [...prev, b.sym])}
                              style={{ padding:"3px 9px", borderRadius:20, cursor:"pointer",
                                fontSize:10, fontFamily:"inherit", transition:"all 0.15s",
                                border: active ? `1px solid ${col}88` : "1px solid rgba(255,255,255,0.08)",
                                background: active ? `${col}22` : "rgba(255,255,255,0.03)",
                                color: active ? col : THEME.text3 }}>
                              {b.label}
                            </button>
                          );
                        })}
                      </div>
                      {perfSymbols.length > 0 && (
                        <>
                          <div style={{ fontSize:9, color:THEME.text3, letterSpacing:"0.08em",
                            textTransform:"uppercase", marginBottom:8, fontWeight:700 }}>Instrumente</div>
                          <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                            {perfSymbols.map((sym, i) => {
                              const active = instrOverlays.includes(sym);
                              const FALLBACK = ["#3b82f6","#34d399","#f59e0b","#ec4899","#8b5cf6","#06b6d4","#f97316","#a78bfa","#10b981","#fb923c"];
                              const col = perfSeriesColors[sym] || FALLBACK[i % FALLBACK.length];
                              return (
                                <button key={sym} onClick={() => setInstrOverlays(prev =>
                                  prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym])}
                                  style={{ padding:"3px 9px", borderRadius:20, cursor:"pointer",
                                    fontSize:10, fontFamily:"inherit", transition:"all 0.15s",
                                    border: active ? `1px solid ${col}88` : "1px solid rgba(255,255,255,0.08)",
                                    background: active ? `${col}22` : "rgba(255,255,255,0.03)",
                                    color: active ? col : THEME.text3 }}>
                                  {sym}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                      {(benchSymbols.length + instrOverlays.length) > 0 && (
                        <button onClick={() => { setBenchSymbols([]); setInstrOverlays([]); }}
                          style={{ marginTop:12, padding:"4px 10px", borderRadius:6, cursor:"pointer",
                            fontSize:10, border:"1px solid rgba(248,113,113,0.3)",
                            background:"rgba(248,113,113,0.08)", color:THEME.red,
                            fontFamily:"inherit", width:"100%" }}>
                          Alle entfernen
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : null}/>
          )}

          {/* Summary bar */}
          {allNodes.length > 0 && !["correlation","montecarlo","rebalance","calendar"].includes(activeTab) && (
            <SummaryBar
              nodes={allNodes}
              totalValueUSD={totalValueUSD} totalCostUSD={totalCostUSD}
              portfolioPerf={portfolioPerf} period={period}
              currency={currency} rates={rates}
              colorMode={colorMode} onColorMode={setColorMode}/>
          )}

          {/* Fetch errors */}
          {Object.keys(fetchErrors).length > 0 && (
            <div style={{ padding:"5px 22px", background:"rgba(248,113,113,0.06)",
              borderBottom:"1px solid rgba(248,113,113,0.15)", flexShrink:0 }}>
              <span style={{ fontSize:10, color:THEME.red }}>
                ⚠ Failed: {Object.entries(fetchErrors).slice(0,3).map(([k,v])=>`${k}: ${v}`).join(" · ")}
              </span>
            </div>
          )}

          {/* API status bar — inline in flow, right-aligned in the period toolbar row */}
          {/* CONTENT AREA */}
          <div style={{ flex:1, overflow:"hidden", minHeight:0 }}>

            {activeTab === "holdings" && viewMode === "consolidated" && (
              <div style={{ padding:16, height:"100%", overflowY:"auto" }}>
                <ConsolidatedTreeMap
                  portfolioNodes={treeNodesByPortfolio}
                  portfolios={activePortfolios}
                  onCellHover={handleCellHover} onCellLeave={handleCellLeave}
                  currency={currency} rates={rates} colorMode={colorMode}/>
              </div>
            )}
            {activeTab === "holdings" && viewMode === "aggregated" && (
              <div style={{ padding:16, height:"100%", overflowY:"auto" }}>
                <TreeMapView
                  nodes={aggregatedNodes}
                  onCellHover={handleCellHover} onCellLeave={handleCellLeave}
                  currency={currency} rates={rates} colorMode={colorMode}/>
              </div>
            )}
            {activeTab === "chart" && viewMode !== "split" && (
              <div style={{ padding:"0 0 0 0", height:"100%", overflow:"hidden" }}>
                <BarChartView
                  nodes={allNodes}
                  currency={currency} rates={rates}
                  colorMode={colorMode} period={period}
                  subView={barSubView}
                  onCellHover={handleCellHover} onCellLeave={handleCellLeave}/>
              </div>
            )}
            {activeTab === "chart" && viewMode === "split" && (
              <div style={{ padding:0, height:"100%", overflow:"hidden" }}>
                <SplitBarChartView
                  portfolios={activePortfolios}
                  treeNodesByPortfolio={treeNodesByPortfolio}
                  currency={currency} rates={rates}
                  colorMode={colorMode} period={period}
                  subView={barSubView}
                  onCellHover={handleCellHover} onCellLeave={handleCellLeave}/>
              </div>
            )}
            {activeTab === "performance" && (
              <div style={{ height:"100%", overflow:"hidden" }}>
                <PerformanceView
                  portfolios={activePortfolios}
                  allTransactions={allTransactions}
                  currency={currency}
                  rates={rates}
                  quotes={quotes}
                  period={period}
                  viewMode={viewMode}
                  ansicht={ansicht}
                  benchSymbols={benchSymbols}
                  setBenchSymbols={setBenchSymbols}
                  instrOverlays={instrOverlays}
                  setInstrOverlays={setInstrOverlays}
                  onSymbolsChange={setPerfSymbols}
                  onSeriesColorsChange={setPerfSeriesColors}/>
              </div>
            )}
            {activeTab === "transactions" && viewMode !== "split" && (
              <div style={{ height:"100%", display:"flex", flexDirection:"column", overflow:"hidden", padding:"12px 0 0" }}>
                {/* Savings plans banner — shown above holdings table */}
                {(() => {
                  const allPlans = activePortfolioIds.flatMap(pid => allSavingsPlans[pid] ?? []);
                  if (allPlans.length === 0) return null;
                  return (
                    <div style={{ paddingLeft:16, paddingRight:16, flexShrink:0 }}>
                      <SavingsPlansSection
                        plans={allPlans}
                        portfolios={activePortfolios}
                        rates={rates}
                        onEdit={plan => setEditPlan(plan)}
                        onDelete={handleDeletePlan}/>
                    </div>
                  );
                })()}
                <TransactionList
                  portfolios={activePortfolios}
                  allTransactions={allTransactions}
                  rates={rates} quotes={quotes}
                  onDelete={handleDeleteTx}
                  onRefreshSymbol={sym => fetchQuotes([sym], true)}
                  onEdit={(pid, tx) => setEditTx({ portfolioId:pid, tx })}
                  period={period} divCache={portfolioDivCache}
                  currency={currency}/>
              </div>
            )}
            {activeTab === "transactions" && viewMode === "split" && (
              <div style={{ height:"100%", display:"flex", flexDirection:"column", overflow:"hidden" }}>
                <SplitTransactionList
                  portfolios={activePortfolios}
                  allTransactions={allTransactions}
                  rates={rates} quotes={quotes}
                  onDelete={handleDeleteTx}
                  onRefreshSymbol={sym => fetchQuotes([sym], true)}
                  onEdit={(pid, tx) => setEditTx({ portfolioId:pid, tx })}
                  period={period} divCache={portfolioDivCache}
                  currency={currency}/>
              </div>
            )}
            {activeTab === "correlation" && (
              <div style={{ flex:1, height:"100%", overflow:"hidden" }}>
                <CorrelationMatrix
                  allNodes={allNodes}
                  quotes={quotes}
                  currency={currency}
                  rates={rates}/>
              </div>
            )}
            {activeTab === "montecarlo" && (
              <div style={{ flex:1, height:"100%", overflow:"hidden" }}>
                <MonteCarlo
                  allNodes={allNodes}
                  quotes={quotes}
                  rates={rates}
                  currency={currency}
                  divCache={portfolioDivCache}/>
              </div>
            )}
            {activeTab === "rebalance" && (
              <div style={{ height:"100%", overflow:"hidden" }}>
                <RebalancingAssistant
                  allNodes={allNodes}
                  quotes={quotes}
                  rates={rates}
                  currency={currency}
                  user={user}/>
              </div>
            )}
            {activeTab === "calendar" && (
              <div style={{ flex:1, height:"100%", overflow:"hidden" }}>
                <DividendCalendar
                  allNodes={allNodes}
                  divCache={portfolioDivCache}
                  isEtfMode={false}
                  currency={currency}
                  rates={rates}
                  onCellHover={handleCellHover}
                  onCellLeave={handleCellLeave}/>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding:"4px 22px", borderTop:`1px solid ${THEME.border2}`,
            display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
            <span style={{ fontSize:9, color:"rgba(59,130,246,0.4)" }}>
              v3 · {user.username} · {activePortfolios.length}/{portfolios.length} portfolios active · {allNodes.length} positions
            </span>
            <span style={{ marginLeft:"auto", fontSize:9, color:THEME.text3 }}>
              {ratesSource==="fallback" && "⚠ FX fallback · "}
              {fetchStatus}
            </span>
          </div>
        </div>

        {/* ── TOOLTIP ──────────────────────────────────────────────────── */}
        {tooltip && (
          <Tooltip data={tooltip.data} x={tooltip.x} y={tooltip.y}
            currency={currency} rates={rates} period={period}
            chartData={globalChartCache.get(tooltip.data.symbol)}
            chartDataIntraday={globalChartCache.get(`${tooltip.data.symbol}_1d`)}
            divData={portfolioDivCache[tooltip.data.symbol] ?? globalDivCache.get(tooltip.data.symbol)}/>
        )}

        {/* ── MODALS ───────────────────────────────────────────────────── */}
        {showAddTx && (
          <AddTxModal onClose={() => setShowAddTx(false)} onAdd={handleAddTx}
            rates={rates} portfolios={activePortfolios}
            defaultPortfolioId={activePortfolioIds[0]}
            onSavePlan={handleSavePlan}/>
        )}
        {editTx && (
          <AddTxModal onClose={() => setEditTx(null)}
            onAdd={(pid, data) => handleUpdateTx(pid, editTx.tx.id, data)}
            rates={rates} portfolios={activePortfolios}
            defaultPortfolioId={editTx.portfolioId}
            initialTx={{ ...editTx.tx, portfolio_id:editTx.portfolioId }}
            editMode/>
        )}
        {editPlan && (
          <EditPlanModal
            plan={editPlan}
            portfolios={activePortfolios}
            rates={rates}
            onClose={() => setEditPlan(null)}
            onAdd={handleAddTx}
            onUpdatePlan={handleUpdatePlan}/>
        )}
        {showImportExport && (
          <ImportExportModal
            portfolios={portfolios}
            activePortfolioIds={activePortfolioIds}
            user={user}
            onClose={() => setShowImportExport(false)}
            onImportDone={async (newPortId) => {
              setShowImportExport(false);
              // Reload transactions for all portfolios (new data was imported)
              const allPorts = portfolios;
              const updated = {};
              await Promise.all(allPorts.map(async p => {
                try { updated[p.id] = await txApi.list(p.id); }
                catch { updated[p.id] = []; }
              }));
              setAllTransactions(prev => ({ ...prev, ...updated }));
              handleRefresh();
            }}
          onCreatePortfolio={(port) => {
            setPortfolios(prev => [...prev, port]);
            setActivePortfolioIds(prev => [...prev, port.id]);
            setAllTransactions(prev => ({ ...prev, [port.id]: [] }));
          }}/>
        )}
        {showAddPort && (
          <AddPortfolioModal onClose={() => setShowAddPort(false)} onAdd={handleAddPortfolio}/>
        )}
        {renamePort && (
          <RenamePortfolioModal
            portfolio={renamePort}
            onClose={() => setRenamePort(null)}
            onRename={handleRenamePortfolio}/>
        )}
        {showSettings && (
          <SettingsModal onClose={() => setShowSettings(false)}
            dataSource={dataSource} setDataSource={setDataSource}
            avApiKey={avApiKey} setAvApiKey={setAvApiKey}
            onSave={handleSaveSettings} avUsage={avUsage}/>
        )}
      </div>
    </>
  );
}
