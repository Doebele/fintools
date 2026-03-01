/**
 * Portfolio Tracker v3 — Multi-User / Multi-Portfolio
 * React + D3 + Lucide Icons
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import * as d3 from "d3";
import {
  PanelLeft, LayoutDashboard, BarChart2, List, Layers, GitMerge,
  RefreshCw, Settings, LogOut, Plus, CheckSquare, Square,
  User, Lock, Eye, EyeOff, Trash2, Edit2, X, AlertCircle,
  ChevronLeft, Search, TrendingUp, FileDown, Upload, FileUp,
  GitFork, Sigma, CalendarDays, Target,
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
  const { isForm, ...fetchOpts } = opts;
  const headers = isForm
    ? (opts.headers || {})  // let browser set multipart boundary
    : { "Content-Type": "application/json", ...(opts.headers || {}) };
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
const quotesApi = {
  batch: (symbols, source, apiKey, force=false) => apiFetch("/quotes/batch", {
    method: "POST",
    body: JSON.stringify({ symbols, source, apiKey, force }),
  }),
  raw: (symbol, refresh=false, range="2y", interval="1d") =>
    apiFetch(`/quotes/yahoo/${symbol}${refresh?"?refresh=1":""}${range!=="2y"?`${refresh?"&":"?"}range=${range}`:""}${interval!=="1d"?`&interval=${interval}`:""}`),
  lookup: (symbol, date) => apiFetch(`/quotes/lookup/${symbol}/${date}`),
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
  { key:"Intraday", label:"1D" },
  { key:"1W",       label:"1W" },
  { key:"1M",       label:"1M" },
  { key:"YTD",      label:"YTD" },
  { key:"1Y",       label:"1Y" },
  { key:"2Y",       label:"2Y" },
  { key:"Max",      label:"Max" },
];

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
  const [mode,     setMode]     = useState("login"); // "login" | "register"
  const [username, setUsername] = useState("");
  const [pin,      setPin]      = useState("");
  const [showPin,  setShowPin]  = useState(false);
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState("");

  const handle = async () => {
    if (!username.trim() || !pin) return;
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

        <button onClick={handle} disabled={!username.trim()||!pin||busy}
          style={{
            width:"100%", marginTop:22, padding:"13px 0", borderRadius:12,
            border:"none", background:THEME.accent, color:"#fff",
            fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit",
            opacity:(!username.trim()||!pin||busy)?0.5:1,
            boxShadow:"0 4px 20px rgba(59,130,246,0.35)",
            transition:"opacity 0.15s",
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
          ETF Explorer <span style={{ fontSize:10, opacity:0.7 }}>— no login</span>
        </button>

        <div style={{ textAlign:"center", marginTop:16, fontSize:12, color:THEME.text3 }}>
          {mode === "login" ? (
            <>No account?{" "}
              <button onClick={() => { setMode("register"); setError(""); }}
                style={{ background:"none", border:"none", color:THEME.accent, cursor:"pointer",
                  fontSize:12, fontFamily:"inherit", fontWeight:600 }}>Create one</button>
            </>
          ) : (
            <>Already have an account?{" "}
              <button onClick={() => { setMode("login"); setError(""); }}
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
// IMPORT / EXPORT MODAL  — with conflict resolution preview
// ════════════════════════════════════════════════════════════════════════════
const RESOLUTION_LABELS = {
  import:        { label:"Import",          color:"#3b82f6", desc:"Add as new transaction" },
  keep_existing: { label:"Behalten",        color:"#8896a8", desc:"Keep existing, skip this row" },
  overwrite:     { label:"Überschreiben",   color:"#f87171", desc:"Replace existing with imported" },
  add_new:       { label:"Als Neu",         color:"#4ade80", desc:"Add alongside existing (both kept)" },
};

function ImportExportModal({ portfolios, activePortfolioIds, user, onClose, onImportDone }) {
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
  const fileRef = useRef(null);

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
    if (!file || !selPort) return;
    setPreviewing(true); setPreviewData(null); setImportErr(null); setResult(null);
    try {
      const data = await txApi.importPreview(selPort, file, user?.id);
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
    if (!previewData || !selPort) return;
    setImporting(true); setImportErr(null);
    try {
      const rows = previewData.preview.map((row, i) => ({
        ...row,
        resolution: resolutions[i] ?? (row.conflict ? "keep_existing" : "import"),
      }));
      const data = await txApi.importSelective(selPort, rows, user?.id);
      setResult(data);
      setPreviewData(null);
      if (data.imported > 0) onImportDone();
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

  const PortSelect = () => (
    <div style={{ marginBottom:16 }}>
      <label style={{ fontSize:11, color:THEME.text3, display:"block", marginBottom:5 }}>Portfolio</label>
      <select value={selPort} onChange={e => { setSelPort(e.target.value); setPreviewData(null); setResult(null); }}
        style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:`1px solid ${THEME.border}`,
          background:THEME.bg, color:THEME.text1, fontSize:12, fontFamily:"inherit", outline:"none" }}>
        {portfolios.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
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
              <PortSelect/>
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
              <PortSelect/>
              {/* Template */}
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
const RailBtn = ({ icon, label, active, onClick, color, badge, open=true }) => (
  <button onClick={onClick} title={!open ? label : undefined}
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
);

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
  onAddPortfolio, onSettings, onLogout,
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
          <div style={{ flex:1, fontFamily:THEME.serif, fontSize:18, fontWeight:400,
            letterSpacing:"-0.01em", userSelect:"none" }}>
            Portfolio<span style={{ color:THEME.accent, fontStyle:"italic" }}>.</span>
          </div>
        )}
        {/* ETF Explorer quick-switch */}
        {open && onEtfExplorer && (
          <button onClick={onEtfExplorer}
            title="Open ETF Explorer"
            style={{ display:"flex", alignItems:"center", gap:4, padding:"4px 9px",
              borderRadius:7, border:`1px solid ${THEME.border}`,
              background:"rgba(255,255,255,0.04)", color:THEME.accent,
              fontSize:10, fontWeight:600, cursor:"pointer",
              fontFamily:"inherit", whiteSpace:"nowrap", transition:"all 0.12s",
              flexShrink:0 }}>
            <TrendingUp size={11}/> ETF
          </button>
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
            <button key={p.id} onClick={() => onTogglePortfolio(p.id)}
              title={!open ? p.name : undefined}
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
                  <span style={{ color: isActive ? THEME.accent : THEME.text3, flexShrink:0, display:"flex" }}>
                    {isActive ? <CheckSquare size={13}/> : <Square size={13}/>}
                  </span>
                </>
              )}
            </button>
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
                <button key={c} onClick={() => onCurrency(c)} title={c}
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

        {/* ── ETF Explorer link — mirrors "Portfolio View" in EtfRail ── */}
        {onEtfExplorer && (
          <RailBtn open={open} icon={<TrendingUp size={16}/>} label="ETF Explorer"
            onClick={onEtfExplorer} color={THEME.accent}/>
        )}

        {/* ── Display mode toggle — same as EtfRail ── */}
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
                  {[["pro","Pro"],["comfort","A11Y"]].map(([m, lbl]) => (
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
                }}>
                <span style={{ fontSize:14, lineHeight:1 }}>{displayMode==="comfort" ? "👁" : "🔬"}</span>
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
    const symbols = Object.keys(quotes);
    if (symbols.length) globalDivCache.prefetch(symbols);
  }, [quotes]); // eslint-disable-line


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

  // Smart tooltip positioning: prefer right-of-cursor, flip left if too close to edge
  const TW = 290;
  const MARGIN = 12;
  const left = (x + 16 + TW + MARGIN > window.innerWidth)
    ? Math.max(MARGIN, x - TW - 16)
    : x + 16;
  // For top: anchor near cursor, but clamp so bottom doesn't overflow
  // Use a generous estimated height; the div auto-sizes
  const estimatedH = 380 + (divData?.yieldPct != null ? 80 : 0);
  const top = Math.min(
    Math.max(MARGIN, y - 20),
    window.innerHeight - estimatedH - MARGIN
  );

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
      overflow:"hidden", pointerEvents:"none",
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
              alignItems:"center", padding:"2px 0" }}>
              <span style={{ fontSize:11, color:THEME.text3 }}>{row[0]}</span>
              <span style={{ fontFamily:THEME.mono, fontSize:12, fontWeight:600, color:row[2]||THEME.text1 }}>{row[1]}</span>
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
  { key:"price",        label:"Buy Price",     width:90,  sortable:true  },
  { key:"cost",         label:"Cost",          width:100, sortable:true  },
  { key:"curPrice",     label:"Cur. Price",    width:90,  sortable:true  },
  { key:"curValue",     label:"Cur. Value",    width:100, sortable:true  },
  { key:"glPct",        label:"G/L %",         width:82,  sortable:true  },
  { key:"glAbs",        label:"G/L",           width:96,  sortable:true  },
  { key:"prdPct",       label:"Period %",      width:82,  sortable:true  },
  { key:"prdAbs",       label:"Period",        width:96,  sortable:true  },
  { key:"pe",           label:"P/E",           width:64,  sortable:true  },
  { key:"divYield",     label:"Div. Yield",    width:80,  sortable:true  },
  { key:"exDate",       label:"Ex-Date",       width:90,  sortable:false },
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

function TransactionList({ portfolios, allTransactions, rates, quotes, onDelete, onEdit, onRefreshSymbol, compact=false, period="Intraday", divCache={}, currency="USD" }) {
  const [sortKey,    setSortKey]    = useState("date");
  const [sortDir,    setSortDir]    = useState("desc");
  const [colWidths,  setColWidths]  = useState(() => Object.fromEntries(TX_COLS_DEFAULT.map(c=>[c.key,c.width])));
  const [deletePending, setDeletePending] = useState(null); // { portfolioId, tx, portfolio }
  const dragging = useRef(null);

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

  const sorted = useMemo(() => {
    return [...allTxFlat].sort((a,b) => {
      let va, vb;
      switch(sortKey) {
        case "type":     va=a.type;     vb=b.type;     break;
        case "symbol":   va=a.symbol;   vb=b.symbol;   break;
        case "name":     va=a.name||""; vb=b.name||""; break;
        case "date":     va=a.date;     vb=b.date;     break;
        case "quantity": va=a.quantity; vb=b.quantity; break;
        case "price":    va=a.price;    vb=b.price;    break;
        case "cost":     va=a._cost;    vb=b._cost;    break;
        case "curPrice": va=a._curPrice??-Infinity; vb=b._curPrice??-Infinity; break;
        case "curValue": va=a._curValue??-Infinity; vb=b._curValue??-Infinity; break;
        case "glPct":    va=a._glPct??-Infinity;   vb=b._glPct??-Infinity;    break;
        case "glAbs":    va=a._glAbs??-Infinity;   vb=b._glAbs??-Infinity;    break;
        case "prdPct":   va=a._prdPct??-Infinity;  vb=b._prdPct??-Infinity;   break;
        case "prdAbs":   va=a._prdAbs??-Infinity;  vb=b._prdAbs??-Infinity;   break;
        case "divYield": va=a._div?.yieldPct??-Infinity; vb=b._div?.yieldPct??-Infinity; break;
        default: va=a.date; vb=b.date;
      }
      if (va < vb) return sortDir==="asc"?-1:1;
      if (va > vb) return sortDir==="asc"?1:-1;
      return 0;
    });
  }, [allTxFlat, sortKey, sortDir]);

  const handleSort = key => {
    if (sortKey===key) setSortDir(d=>d==="asc"?"desc":"asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

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

  const totalCost    = allTxFlat.reduce((s,r)=>s+r._cost,0);
  const totalValue   = allTxFlat.reduce((s,r)=>s+(r._curValue??0),0);
  const totalGL      = allTxFlat.reduce((s,r)=>s+(r._glAbs??0),0);
  const totalPrdGL   = allTxFlat.reduce((s,r)=>s+(r._prdAbs??0),0);
  const hasPrdGL     = allTxFlat.some(r=>r._prdAbs!=null);

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
    <>
      {/* Summary row — hidden in compact (per-portfolio split) mode */}
      {!compact && (
      <div style={{
        display:"flex", alignItems:"center", gap:24, padding:"8px 14px 12px",
        borderBottom:`1px solid ${THEME.border2}`, flexShrink:0,
      }}>
        {[
          ["Transactions",  allTxFlat.length, null],
          ["Total Cost",    `$${(totalCost/1000).toFixed(1)}K`, null],
          ["Current Value", `$${(totalValue/1000).toFixed(1)}K`, null],
          ["Total G/L",     `${totalGL>=0?"+":"−"}$${(Math.abs(totalGL)/1000).toFixed(1)}K (${totalCost>0?((totalGL/totalCost)*100).toFixed(1):0}%)`, totalGL>=0?THEME.green:THEME.red],
          ...(hasPrdGL?[[`${period==="Intraday"?"1D":period} G/L`, `${totalPrdGL>=0?"+":"−"}$${(Math.abs(totalPrdGL)/1000).toFixed(1)}K`, totalPrdGL>=0?THEME.green:THEME.red]]:[]),
        ].map(([l,v,c])=>(
          <div key={l}>
            <div style={{fontSize:9,color:THEME.text3,textTransform:"uppercase",letterSpacing:".07em",marginBottom:2}}>{l}</div>
            <div style={{fontFamily:THEME.mono,fontSize:12,fontWeight:700,color:c||THEME.text1}}>{v}</div>
          </div>
        ))}
        <div style={{marginLeft:"auto",fontSize:10,color:THEME.text3}}>
          Drag column edges to resize · Click headers to sort
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
                  {col.key==="prdPct" ? `${period==="Intraday"?"1D":period} %`
                   : col.key==="prdAbs" ? `${period==="Intraday"?"1D":period} $`
                   : col.label}<SortIcon col={col}/>
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
            {sorted.map((tx, i) => {
              const isBuy = tx.type === "BUY";
              const rowBg = i%2===0?"transparent":"rgba(255,255,255,0.015)";
              return (
                <tr key={tx.id}
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
                  <td style={tdStyle(TX_COLS_DEFAULT[0])}>
                    <button
                      onClick={() => onRefreshSymbol && onRefreshSymbol(tx.symbol)}
                      title={`Refresh ${tx.symbol} quote`}
                      style={{
                        padding:"2px 7px", borderRadius:5, fontSize:9, fontWeight:700,
                        background:isBuy?"rgba(74,222,128,0.12)":"rgba(248,113,113,0.12)",
                        color:isBuy?THEME.green:THEME.red,
                        border:`1px solid ${isBuy?"rgba(74,222,128,0.2)":"rgba(248,113,113,0.2)"}`,
                        cursor:"pointer", fontFamily:THEME.font,
                        transition:"all 0.12s",
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
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ADD TRANSACTION MODAL  (with auto-lookup)
// ════════════════════════════════════════════════════════════════════════════
function AddTxModal({ onClose, onAdd, rates, portfolios, defaultPortfolioId, initialTx, editMode }) {
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
    const sym = symbol.trim().toUpperCase();
    if (!sym||!qty||!price||!portfolioId) return;
    const qtyN = parseFloat(qty), priceN = parseFloat(price);
    if (isNaN(qtyN)||qtyN<=0||isNaN(priceN)||priceN<=0) { setError("Quantity and price must be positive"); return; }
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
  };

  const lookupOk  = lookupMsg.startsWith("ok:");
  const lookupErr = lookupMsg.startsWith("err:");
  const lookupParts = lookupOk ? lookupMsg.slice(3).split(":") : null;
  const lookupDate       = lookupParts ? lookupParts[0] : null;
  const lookupHistorical = lookupParts ? lookupParts[1] === "1" : false;
  const lookupDaysOff    = lookupParts ? parseInt(lookupParts[2] ?? "0") : 0;

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
      <div style={{ display:"flex", gap:8, marginBottom:16 }}>
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

      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        {/* Row 1: Date | Symbol  — date first so lookup fires with correct date */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <div>
            <FLabel>Purchase Date</FLabel>
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
        {/* Row 3: Quantity | Get Price */}
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

      {error && <div style={{ fontSize:12, color:THEME.red, marginTop:10 }}>{error}</div>}
      <div style={{ display:"flex", gap:10, marginTop:20 }}>
        <button onClick={onClose} style={{ flex:1, padding:"11px 0", borderRadius:10,
          border:`1px solid ${THEME.border}`, background:"transparent",
          color:THEME.text3, cursor:"pointer", fontSize:13, fontWeight:600 }}>Cancel</button>
        <button onClick={handleAdd} disabled={!symbol||!qty||!price||busy}
          style={{ flex:2, padding:"11px 0", borderRadius:10, border:"none",
            background:type==="buy"?THEME.accent:THEME.red, color:"#fff",
            cursor:"pointer", fontSize:13, fontWeight:700,
            opacity:(!symbol||!qty||!price||busy)?0.5:1 }}>
          {busy?"Saving…":editMode?"Save Changes":`Add ${type==="buy"?"Buy":"Sell"}`}
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
        ["Total Value",   fmtVal(totalValueUSD, currency, rates)],
        ["Total Cost",    fmtVal(totalCostUSD,  currency, rates)],
        ["Net G/L",       `${totalNetGain>=0?"+":""}${fmtVal(Math.abs(totalNetGain),currency,rates)} (${fmtPct(totalCostUSD>0?(totalNetGain/totalCostUSD)*100:null)})`,
                          totalNetGain>=0?THEME.green:THEME.red],
        [`${period==="Intraday"?"1D":period} Return`, fmtPct(portfolioPerf),
                          portfolioPerf!=null?(portfolioPerf>=0?THEME.green:THEME.red):THEME.text3],
      ].map(([lbl,val,color]) => (
        <div key={lbl}>
          <div style={{ fontSize:9, color:THEME.text3, textTransform:"uppercase",
            letterSpacing:"0.08em", marginBottom:2 }}>{lbl}</div>
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
function PeriodToolbar({ period, onPeriod, viewMode, onViewMode, activeTab, portfolioCount, subView, onSubView }) {
  const hasSubView   = activeTab === "chart" && onSubView;
  const hasViewMode  = portfolioCount > 1; // ViewModeToggle only renders when >1 portfolio
  const showSep1     = hasSubView;                          // sep between periods and subView
  const showSep2     = hasSubView && hasViewMode;           // sep between subView and viewMode
  const showSepOnly  = !hasSubView && hasViewMode;          // sep between periods and viewMode when no subView

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

      {/* Separator between periods and first toggle group */}
      {(showSep1 || showSepOnly) && (
        <div style={{ width:1, height:20, background:THEME.border, margin:"0 12px", flexShrink:0 }}/>
      )}

      {/* Bar Chart sort mode — directly after period buttons */}
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

      {/* Separator between subView and viewMode */}
      {showSep2 && (
        <div style={{ width:1, height:20, background:THEME.border, margin:"0 12px", flexShrink:0 }}/>
      )}

      {/* View mode toggle (Consolidated / Aggregated / Per Portfolio…) */}
      <ViewModeToggle viewMode={viewMode} onViewMode={onViewMode} activeTab={activeTab} portfolioCount={portfolioCount}/>

      {/* Flexible spacer — pushes nothing, but allows API badge to be positioned absolute */}
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
              letterSpacing:"0.10em", marginTop:-2 }}>Explorer</div>
          </div>
        )}
        {/* Mode switcher — only shown when logged in */}
        {open && user && onSwitchToPortfolio && (
          <button onClick={onSwitchToPortfolio}
            title="Switch to Portfolio View"
            style={{ display:"flex", alignItems:"center", gap:4, padding:"4px 8px",
              borderRadius:7, border:`1px solid ${THEME.border}`,
              background:"rgba(255,255,255,0.04)", color:THEME.text3,
              fontSize:10, fontWeight:600, cursor:"pointer",
              fontFamily:"inherit", whiteSpace:"nowrap", transition:"all 0.12s" }}>
            <LayoutDashboard size={11}/> Portfolio
          </button>
        )}
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
                  <div style={{ fontSize:9, color:THEME.text3 }}>ETF Explorer</div>
                </div>
              </div>
            )}
            {user && onSwitchToPortfolio && (
              <RailBtn open={open} icon={<LayoutDashboard size={16}/>} label="Portfolio View"
                onClick={onSwitchToPortfolio}/>
            )}
            {onSignOut && (
              <RailBtn open={open} icon={<LogOut size={16}/>} label="Sign Out"
                onClick={onSignOut} color={THEME.text3}/>
            )}
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
                  {[["pro","Pro"],["comfort","A11Y"]].map(([m, lbl]) => (
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
                }}>
                <span style={{ fontSize:14, lineHeight:1 }}>{displayMode==="comfort" ? "👁" : "🔬"}</span>
              </button>
            )}
          </div>
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
                       displayMode, onToggleDisplayMode }) {
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
  const [railOpen,          setRailOpen]          = useState(true);
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
        open={railOpen} onToggle={()=>setRailOpen(v=>!v)}
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
                fontFamily:"inherit", transition:"all 0.12s" }}>
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
  const [activeTab,         setActiveTab]          = useState("holdings");

  // ── UI state ──────────────────────────────────────────────────────────────
  const [period,     setPeriod]     = useState("Intraday");
  const [currency,   setCurrency]   = useState("USD");
  const [colorMode,  setColorMode]  = useState("market");
  const [showAddTx,  setShowAddTx]  = useState(false);
  const [editTx,     setEditTx]     = useState(null); // {portfolioId, tx}
  const [showAddPort,setShowAddPort]= useState(false);
  const [showImportExport, setShowImportExport] = useState(false);
  const [savedEtfs,       setSavedEtfs]        = useState([]);
  // portfolioDivCache → replaced by useDivCache hook below (shares globalDivCache with ETF Explorer)
  const [showSettings,setShowSettings]=useState(false);
  const [tooltip,    setTooltip]    = useState(null);

  // ── Data state ────────────────────────────────────────────────────────────
  const [allTransactions, setAllTransactions] = useState({});  // { [portfolioId]: tx[] }
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
    // Load transactions for all portfolios
    const txMap = {};
    await Promise.all(ports.map(async p => {
      try { txMap[p.id] = await txApi.list(p.id); }
      catch { txMap[p.id] = []; }
    }));
    setAllTransactions(txMap);
    setInitialized(true);
    // AV usage
    avApi.usage().then(setAvUsage).catch(() => {});
  }, []);

  const handleLogout = () => {
    setUser(null); setPortfolios([]); setInitialized(false);
    setAllTransactions({}); setQuotes({});
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

  // ── Tab handler — also normalises viewMode when switching tabs ─────────────
  const handleTab = useCallback((tab) => {
    if (tab === "_addtx") { setShowAddTx(true); return; }
    setActiveTab(tab);
    // Analytics tabs don't use viewMode
    if (["correlation","montecarlo","rebalance","calendar"].includes(tab)) return;
    setViewMode(prev => {
      if (tab === "holdings") {
        // chart/tx use single|split — map "split" to "consolidated", keep aggregated
        if (prev === "split") return "consolidated";
        if (prev === "single") return "aggregated";
        return prev; // consolidated or aggregated stay
      } else {
        // chart/tx use single|split — map holdings-only modes to single
        if (prev === "aggregated" || prev === "consolidated") return "single";
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
              { key:"holdings",     icon:<LayoutDashboard size={14}/>, label:"TreeMap"   },
              { key:"chart",        icon:<BarChart2 size={14}/>,       label:"Bar Chart" },
              { key:"transactions", icon:<List size={14}/>,            label:"Holdings"  },
              { key:"calendar",     icon:<CalendarDays size={14}/>,    label:"Dividends" },
            ].map(t => (
              <button key={t.key} onClick={() => handleTab(t.key)}
                style={{
                  display:"flex", alignItems:"center", gap:7,
                  padding:"7px 14px", border:"none", cursor:"pointer",
                  background: activeTab===t.key ? "rgba(59,130,246,0.15)" : "transparent",
                  color: activeTab===t.key ? THEME.accent : THEME.text3,
                  borderRadius:9, fontSize:12,
                  fontWeight: activeTab===t.key ? 700 : 500,
                  fontFamily:"inherit", transition:"all 0.12s" }}>
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
                  fontFamily:"inherit", transition:"all 0.12s" }}>
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
            <PeriodToolbar period={period} onPeriod={setPeriod} viewMode={viewMode} onViewMode={setViewMode} activeTab={activeTab} portfolioCount={activePortfolios.length} subView={barSubView} onSubView={setBarSubView}/>
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
              <div style={{ padding:16, height:"100%", overflow:"hidden" }}>
                <ConsolidatedTreeMap
                  portfolioNodes={treeNodesByPortfolio}
                  portfolios={activePortfolios}
                  onCellHover={handleCellHover} onCellLeave={handleCellLeave}
                  currency={currency} rates={rates} colorMode={colorMode}/>
              </div>
            )}
            {activeTab === "holdings" && viewMode === "aggregated" && (
              <div style={{ padding:16, height:"100%", overflow:"hidden" }}>
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
            {activeTab === "transactions" && viewMode !== "split" && (
              <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", padding:"12px 0 0", minHeight:0 }}>
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
              <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minHeight:0 }}>
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
              <div style={{ flex:1, height:"100%", overflow:"hidden" }}>
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
            defaultPortfolioId={activePortfolioIds[0]}/>
        )}
        {editTx && (
          <AddTxModal onClose={() => setEditTx(null)}
            onAdd={(pid, data) => handleUpdateTx(pid, editTx.tx.id, data)}
            rates={rates} portfolios={activePortfolios}
            defaultPortfolioId={editTx.portfolioId}
            initialTx={{ ...editTx.tx, portfolio_id:editTx.portfolioId }}
            editMode/>
        )}
        {showImportExport && (
          <ImportExportModal
            portfolios={portfolios}
            activePortfolioIds={activePortfolioIds}
            user={user}
            onClose={() => setShowImportExport(false)}
            onImportDone={() => {
              setShowImportExport(false);
              handleRefresh();
            }}/>
        )}
        {showAddPort && (
          <AddPortfolioModal onClose={() => setShowAddPort(false)} onAdd={handleAddPortfolio}/>
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
