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
  ChevronLeft, Search, TrendingUp,
} from "lucide-react";
import { CircleFlag } from "react-circle-flags";


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
      html, body { height: 100%; overflow: hidden; }
      body { background: #0d0e12; color: #f0f1f5; font-family: 'Syne', sans-serif;
             font-size: 13px; -webkit-font-smoothing: antialiased; }
      button { font-family: inherit; }
      .mono { font-family: 'JetBrains Mono', monospace; }
      .spin { display: inline-block; animation: ptv3spin 0.9s linear infinite; }
      @keyframes ptv3spin { to { transform: rotate(360deg); } }
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

// ─── API Helpers ─────────────────────────────────────────────────────────────
const BASE = "/api";
async function apiFetch(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

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
};
const quotesApi = {
  batch: (symbols, source, apiKey) => apiFetch("/quotes/batch", {
    method: "POST",
    body: JSON.stringify({ symbols, source, apiKey }),
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
      height:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
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
// RAIL NAVIGATION
// ════════════════════════════════════════════════════════════════════════════
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
}) {
  const w = open ? RAIL_EXPANDED : RAIL_COLLAPSED;

  const RailBtn = ({ icon, label, active, onClick, color, badge }) => (
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

  const RailSection = ({ label }) => open && (
    <div style={{ fontSize:9, fontWeight:700, color:THEME.text3, textTransform:"uppercase",
      letterSpacing:"0.10em", padding:"12px 12px 4px", opacity:0.7 }}>{label}</div>
  );

  const Divider = () => (
    <div style={{ height:1, background:THEME.border2, margin:"6px 8px" }}/>
  );

  return (
    <div style={{
      width:w, flexShrink:0,
      background:THEME.surface,
      borderRight:`1px solid ${THEME.border}`,
      display:"flex", flexDirection:"column",
      overflow:"hidden",
      transition:"width 0.22s cubic-bezier(0.4,0,0.2,1)",
    }}>
      {/* Top: brand + toggle */}
      <div style={{
        height:60, display:"flex", alignItems:"center",
        borderBottom:`1px solid ${THEME.border}`,
        padding: open ? "0 14px" : "0",
        justifyContent: open ? "space-between" : "center",
        flexShrink:0,
      }}>
        {open && (
          <div style={{ fontFamily:THEME.serif, fontSize:18, fontWeight:400,
            letterSpacing:"-0.01em", userSelect:"none" }}>
            Portfolio<span style={{ color:THEME.accent, fontStyle:"italic" }}>.</span>
          </div>
        )}
        <button onClick={onToggle}
          style={{ background:"transparent", border:"none", cursor:"pointer",
            color:THEME.text3, display:"flex", padding:6, borderRadius:7,
            transition:"color 0.15s" }}
          title={open ? "Collapse sidebar" : "Expand sidebar"}>
          <PanelLeft size={18} style={{ transform: open ? "none" : "scaleX(-1)" }}/>
        </button>
      </div>

      {/* Scrollable body */}
      <div style={{ flex:1, overflowY:"auto", overflowX:"hidden", padding:"8px 6px" }}>

        {/* Views */}
        <RailSection label="Views"/>
        <RailBtn icon={<LayoutDashboard size={16}/>} label="TreeMap"
          active={activeTab==="holdings"}
          onClick={() => onTab("holdings")}/>
        <RailBtn icon={<BarChart2 size={16}/>} label="Bar Chart"
          active={activeTab==="chart"}
          onClick={() => onTab("chart")}/>
        <RailBtn icon={<List size={16}/>} label="Transactions"
          active={activeTab==="transactions"}
          onClick={() => onTab("transactions")}/>

        <Divider/>

        {/* Portfolios */}
        <RailSection label="Portfolios"/>
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
        <RailSection label="Actions"/>
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
          <RailBtn icon={<Plus size={16}/>} label="Add Transaction"
            color={THEME.accent} onClick={() => onTab("_addtx")}/>
        )}
        <RailBtn icon={fetching ? <span className="spin" style={{display:"flex"}}><RefreshCw size={16}/></span> : <RefreshCw size={16}/>}
          label="Refresh Quotes" onClick={onRefresh}/>
        {onRecalcFX && (
          <RailBtn icon={<span style={{fontSize:12}}>⟳$</span>} label="Recalc FX Costs"
            onClick={onRecalcFX}
            color={THEME.yellow ?? "#fbbf24"}/>
        )}

        <Divider/>

        {/* Currency */}
        <RailSection label="Currency"/>
        <div style={{
          padding: open ? "2px 8px" : "2px 0",
          display:"flex", flexDirection:"column",
          gap:2, alignItems: open ? "stretch" : "center",
        }}>
          {Object.keys(CCY_SYM).map(c => {
            const isActive = currency === c;
            const code = CCY_FLAG[c];
            // collapsed: 16px icon circle; expanded: 24px icon circle + label
            const SIZE = open ? 24 : 16;
            // pill radius = half the icon height so text never distorts the shape
            const BR = SIZE / 2;
            return (
              <button key={c} onClick={() => onCurrency(c)} title={c}
                className={isActive ? undefined : "ccy-btn"}
                style={{
                  display:"flex", alignItems:"center",
                  gap: open ? 10 : 0,
                  padding: open ? "7px 12px" : "7px 0",
                  border:"none",
                  borderRadius:9,
                  background: isActive ? "rgba(59,130,246,0.15)" : "transparent",
                  cursor:"pointer", fontFamily:THEME.font,
                  transition:"background 0.12s, color 0.12s",
                  width:"100%",
                  justifyContent: open ? "flex-start" : "center",
                  color: isActive ? THEME.accent : THEME.text3,
                  fontWeight: isActive ? 700 : 500,
                  fontSize:12,
                }}>
                {/* Circle flag */}
                <div className="ccy-flag" style={{
                  width:SIZE, height:SIZE, borderRadius:"50%",
                  overflow:"hidden", flexShrink:0,
                  opacity: isActive ? 1 : 0.4,
                  transition:"opacity 0.12s",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  lineHeight:0, fontSize:0,
                }}>
                  {code
                    ? <CircleFlag countryCode={code} width={SIZE} height={SIZE}/>
                    : <span style={{ fontSize:SIZE*0.6, lineHeight:1 }}>🌐</span>
                  }
                </div>
                {open && (
                  <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
                    <span className="ccy-label" style={{
                      fontSize:12, fontWeight: isActive ? 700 : 500,
                      color: isActive ? THEME.accent : THEME.text3,
                      letterSpacing:"0.03em", lineHeight:1,
                    }}>{c}</span>
                    <span className="ccy-name" style={{
                      fontSize:10, fontWeight:400,
                      color: isActive ? THEME.accent : THEME.text3,
                      letterSpacing:"0.02em",
                    }}>{CCY_NAME[c]}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <Divider/>

        {/* Account */}
        <RailSection label="Account"/>
        {open && user && (
          <div style={{ padding:"6px 12px 8px", display:"flex", alignItems:"center", gap:8 }}>
            <div style={{
              width:26, height:26, borderRadius:"50%",
              background:"rgba(59,130,246,0.2)", display:"flex",
              alignItems:"center", justifyContent:"center", flexShrink:0,
            }}>
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
        <RailBtn icon={<Settings size={16}/>} label={`Source: ${dataSource==="alphavantage"?"AV":"Yahoo"}`}
          onClick={onSettings}/>
        <RailBtn icon={<LogOut size={16}/>} label="Sign Out" onClick={onLogout} color={THEME.text3}/>
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
function Tooltip({ data, x, y, currency, rates, period, chartData, chartDataIntraday }) {
  const rate  = rates[currency] ?? 1;
  const cSym  = CCY_SYM[currency] ?? "$";
  const perf  = data.perf;
  const glPerf = data.glPerf;
  const isPos = (perf ?? 0) >= 0;
  const perfColor = isPos ? THEME.green : THEME.red;
  const bg    = getPerfColor(perf);

  // Position tooltip so it stays on screen
  const TW = 282, TH = 360;
  const left = x + 16 + TW > window.innerWidth  ? x - TW - 16 : x + 16;
  const top  = y + TH     > window.innerHeight  ? window.innerHeight - TH - 8 : Math.max(8, y - 20);

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
            {data.longName && <div style={{ fontSize:11, color:"rgba(255,255,255,0.65)", marginTop:2, maxWidth:190,
              whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{data.longName}</div>}
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
          ["Market Value",`${cSym}${value.toLocaleString("en-US",{maximumFractionDigits:0})}`],
          ["Cost Basis",  `${cSym}${cost.toLocaleString("en-US",{maximumFractionDigits:0})}`],
          ["Avg Cost/Share", data.qty > 0 ? `${cSym}${(cost/data.qty).toFixed(2)}` : "—"],
          [null],
          ["Net G/L",     `${gainLoss>=0?"+":""}${cSym}${Math.abs(gainLoss).toLocaleString("en-US",{maximumFractionDigits:0})} (${fmtPct(glPerf)})`, gainLoss>=0?THEME.green:THEME.red],
          ["Portfolio Weight", data.weight ? `${data.weight.toFixed(1)}%` : "—"],
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
  { key:"glAbs",        label:"G/L $",         width:96,  sortable:true  },
  { key:"links",        label:"Links",         width:68,  sortable:false },
  { key:"actions",      label:"",              width:56,  sortable:false },
];

// ════════════════════════════════════════════════════════════════════════════
// SPLIT TRANSACTION VIEW  — one table per portfolio, stacked
// ════════════════════════════════════════════════════════════════════════════
function SplitTransactionList({ portfolios, allTransactions, rates, quotes, onDelete, onEdit, onRefreshSymbol }) {
  const active = portfolios.filter(p => (allTransactions[p.id]?.length ?? 0) > 0);
  if (!active.length) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
      height:"100%", color:THEME.text3, fontSize:13 }}>No transactions</div>
  );
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
            compact/>
        </div>
      ))}
    </div>
  );
}

function TransactionList({ portfolios, allTransactions, rates, quotes, onDelete, onEdit, onRefreshSymbol, compact=false }) {
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
        rows.push({ ...tx, portfolioId:p.id, portfolioName:p.name, portfolioColor:p.color,
          _cost:cost, _curPriceUSD:curPriceUSD, _curValue:curValue, _glAbs:glAbs, _glPct:glPct,
          _quoteCcy:qCcy ?? "USD" });
      }
    }
    return rows;
  }, [portfolios, allTransactions, quotes, rates]);

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

  const totalCost  = allTxFlat.reduce((s,r)=>s+r._cost,0);
  const totalValue = allTxFlat.reduce((s,r)=>s+(r._curValue??0),0);
  const totalGL    = allTxFlat.reduce((s,r)=>s+(r._glAbs??0),0);

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

  const fmtUSD = (v) => v==null ? <span style={{color:THEME.text3}}>—</span> : `$${Math.abs(v).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

  return (
    <>
      {/* Summary row — hidden in compact (per-portfolio split) mode */}
      {!compact && (
      <div style={{
        display:"flex", alignItems:"center", gap:24, padding:"8px 14px 12px",
        borderBottom:`1px solid ${THEME.border2}`, flexShrink:0,
      }}>
        {[
          ["Transactions", allTxFlat.length, null],
          ["Total Cost",   `$${(totalCost/1000).toFixed(1)}K`, null],
          ["Current Value",`$${(totalValue/1000).toFixed(1)}K`, null],
          ["Total G/L",    `${totalGL>=0?"+":"−"}$${(Math.abs(totalGL)/1000).toFixed(1)}K (${totalCost>0?((totalGL/totalCost)*100).toFixed(1):0}%)`, totalGL>=0?THEME.green:THEME.red],
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
                  {col.label}<SortIcon col={col}/>
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
                  {/* Links */}
                  <td style={tdStyle(TX_COLS_DEFAULT[11])}>
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
                  <td style={tdStyle(TX_COLS_DEFAULT[12])}>
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
      const refClose = q.refs?.[period];
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

// ── ETF Rail ─────────────────────────────────────────────────────────────────
function EtfRail({ open, onToggle, selectedTicker, onSelect, currency, onCurrency,
                   fetching, onRefreshQuotes }) {
  const [search,    setSearch]    = useState("");
  const [searching, setSearching] = useState(false);
  const [results,   setResults]   = useState([]);
  const searchTimer = useRef(null);
  const w = open ? 220 : 52;

  useEffect(() => {
    clearTimeout(searchTimer.current);
    if (!search.trim()) { setResults([]); return; }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const d = await fetch(`${ETF_BASE}/etf/search?q=${encodeURIComponent(search)}`).then(r=>r.json());
        setResults(d.results || []);
      } catch { setResults([]); }
      setSearching(false);
    }, 400);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  const displayList = search.trim() ? results : PREDEFINED_ETFS_CLIENT;

  return (
    <div style={{
      width:w, minWidth:w, height:"100vh",
      background:THEME.surface, borderRight:`1px solid ${THEME.border}`,
      display:"flex", flexDirection:"column",
      transition:"width 0.22s cubic-bezier(.4,0,.2,1)",
      overflow:"hidden", flexShrink:0, zIndex:10,
    }}>
      {/* Header */}
      <div style={{ padding:"0 12px", height:52, display:"flex", alignItems:"center",
        gap:10, borderBottom:`1px solid ${THEME.border}`, flexShrink:0 }}>
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
        <button onClick={onToggle} style={{
          background:"none", border:"none", cursor:"pointer",
          color:THEME.text3, display:"flex", padding:4, borderRadius:7,
          marginLeft:open?0:"auto", marginRight:open?0:"auto",
        }}><PanelLeft size={16}/></button>
      </div>

      {/* Search */}
      <div style={{ padding: open?"8px 10px 4px":"8px 6px 4px", flexShrink:0 }}>
        {open ? (
          <div style={{ position:"relative" }}>
            <Search size={12} style={{ position:"absolute", left:9, top:"50%",
              transform:"translateY(-50%)", color:THEME.text3, pointerEvents:"none" }}/>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Ticker or name…"
              style={{ width:"100%", padding:"6px 28px 6px 28px",
                background:"rgba(255,255,255,0.05)", border:`1px solid ${THEME.border}`,
                borderRadius:8, color:THEME.text1, fontSize:11,
                fontFamily:"inherit", outline:"none", boxSizing:"border-box" }}/>
            {search && (
              <button onClick={() => { setSearch(""); setResults([]); }} style={{
                position:"absolute", right:7, top:"50%", transform:"translateY(-50%)",
                background:"none", border:"none", cursor:"pointer",
                color:THEME.text3, display:"flex", padding:0 }}><X size={11}/></button>
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

      {/* ETF list */}
      <div style={{ flex:1, overflowY:"auto", padding: open?"2px 8px":"2px 4px" }}>
        {open && (
          <div style={{ fontSize:9, color:THEME.text3, textTransform:"uppercase",
            letterSpacing:"0.08em", padding:"4px 4px 6px" }}>
            {search.trim()
              ? (searching ? "Searching…" : `${results.length} results`)
              : "Presets"}
          </div>
        )}
        {displayList.map(etf => {
          const isActive = selectedTicker === etf.ticker;
          return (
            <button key={etf.ticker} onClick={() => onSelect(etf.ticker)}
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
              <div style={{
                flexShrink:0, width:36, height:36,
                background: isActive?"rgba(59,130,246,0.2)":"rgba(255,255,255,0.06)",
                borderRadius:8, display:"flex", alignItems:"center",
                justifyContent:"center", fontSize:8, fontWeight:800,
                color: isActive?THEME.accent:THEME.text2, letterSpacing:"0.04em",
                padding:"0 2px",
              }}>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:7,
                  lineHeight:1, textAlign:"center" }}>
                  {etf.ticker.length <= 5
                    ? etf.ticker.replace('.DE','').replace('.SW','')
                    : etf.ticker.slice(0,4)}
                </span>
              </div>
              {open && (
                <div style={{ overflow:"hidden", flex:1 }}>
                  <div style={{ fontSize:11, fontWeight:700,
                    color: isActive?THEME.accent:THEME.text1,
                    whiteSpace:"nowrap", overflow:"hidden",
                    textOverflow:"ellipsis" }}>{etf.name}</div>
                  <div style={{ fontSize:9, color: isActive?THEME.accent:THEME.text3,
                    marginTop:1 }}>{etf.provider || etf.ticker}</div>
                </div>
              )}
            </button>
          );
        })}
      </div>

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

      {/* Divider + Refresh */}
      <div style={{ height:1, background:THEME.border2, margin:"0 8px 4px", flexShrink:0 }}/>
      <div style={{ padding: open?"2px 8px 10px":"2px 4px 10px", flexShrink:0 }}>
        <button onClick={onRefreshQuotes} className="rail-btn"
          style={{ display:"flex", alignItems:"center", gap:open?10:0,
            padding:open?"7px 10px":"7px 0", width:"100%",
            justifyContent:open?"flex-start":"center",
            border:"none", borderRadius:9, background:"transparent",
            cursor:"pointer", color:THEME.text3, fontFamily:THEME.font,
            fontSize:12, fontWeight:500, transition:"background 0.12s" }}>
          <span className="rail-icon" style={{ display:"flex", flexShrink:0 }}>
            {fetching
              ? <span className="spin" style={{ display:"flex" }}><RefreshCw size={15}/></span>
              : <RefreshCw size={15}/>}
          </span>
          {open && "Refresh Quotes"}
        </button>
      </div>
    </div>
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

// ── ETF Holdings Table ────────────────────────────────────────────────────────
function EtfHoldingsTable({ holdings, quotes, currency, rates, onRefreshHoldings,
                            refreshing, fetchedAt }) {
  const rate = rates[currency] ?? 1;
  const cSym = CCY_SYM[currency] ?? "$";

  const rows = useMemo(() =>
    [...holdings]
      .sort((a,b) => b.weight - a.weight)
      .map(h => {
        const q = quotes[h.symbol];
        return { ...h, price:q?.price??null, changePercent:q?.changePct??null };
      }),
    [holdings, quotes]
  );

  const lastUpdated = fetchedAt
    ? new Date(fetchedAt).toLocaleString("de-CH", {
        day:"2-digit", month:"2-digit", year:"numeric",
        hour:"2-digit", minute:"2-digit" })
    : null;

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      {/* Toolbar */}
      <div style={{ padding:"8px 16px", borderBottom:`1px solid ${THEME.border2}`,
        display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
        <div style={{ flex:1 }}>
          <span style={{ fontSize:12, fontWeight:600, color:THEME.text1 }}>
            {holdings.length} Holdings
          </span>
          {lastUpdated && (
            <span style={{ fontSize:10, color:THEME.text3, marginLeft:10 }}>
              · Updated {lastUpdated}
            </span>
          )}
        </div>
        <button onClick={onRefreshHoldings}
          style={{ display:"flex", alignItems:"center", gap:6,
            padding:"5px 12px", borderRadius:8, border:`1px solid ${THEME.border}`,
            background:"transparent", color:THEME.text2, fontSize:11,
            fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
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
              {["#","Symbol","Name","Weight","Price","1D"].map(h => (
                <th key={h} style={{ padding:"8px 12px",
                  textAlign:["#","Weight","Price","1D"].includes(h)?"right":"left",
                  fontSize:9, fontWeight:700, color:THEME.text3,
                  textTransform:"uppercase", letterSpacing:"0.07em",
                  position:"sticky", top:0, background:THEME.bg }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((h, i) => {
              const pColor = h.changePercent==null ? THEME.text3
                : h.changePercent>=0 ? THEME.green : THEME.red;
              return (
                <tr key={h.symbol}
                  style={{ borderBottom:`1px solid rgba(255,255,255,0.03)`, cursor:"default" }}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.03)"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <td style={{ padding:"7px 12px", textAlign:"right",
                    color:THEME.text3, fontSize:10,
                    fontFamily:"'JetBrains Mono',monospace" }}>{i+1}</td>
                  <td style={{ padding:"7px 12px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                      <div style={{ width:6, height:6, borderRadius:"50%", flexShrink:0,
                        background:getPerfColor(h.changePercent??0) }}/>
                      <span style={{ fontWeight:700, color:THEME.text1,
                        fontFamily:"'JetBrains Mono',monospace",
                        fontSize:11 }}>{h.symbol}</span>
                    </div>
                  </td>
                  <td style={{ padding:"7px 12px", color:THEME.text2, maxWidth:200,
                    whiteSpace:"nowrap", overflow:"hidden",
                    textOverflow:"ellipsis" }}>{h.name}</td>
                  <td style={{ padding:"7px 12px", textAlign:"right" }}>
                    <div style={{ display:"flex", alignItems:"center",
                      justifyContent:"flex-end", gap:6 }}>
                      <div style={{ height:4, borderRadius:2, flexShrink:0,
                        width:Math.max(4, Math.round(h.weight*8)),
                        background:`rgba(59,130,246,${0.3+h.weight/20})` }}/>
                      <span style={{ fontFamily:"'JetBrains Mono',monospace",
                        color:THEME.text1, fontSize:11 }}>
                        {h.weight.toFixed(2)}%
                      </span>
                    </div>
                  </td>
                  <td style={{ padding:"7px 12px", textAlign:"right",
                    fontFamily:"'JetBrains Mono',monospace",
                    color:h.price?THEME.text1:THEME.text3 }}>
                    {h.price ? `${cSym}${(h.price*rate).toFixed(2)}` : "—"}
                  </td>
                  <td style={{ padding:"7px 12px", textAlign:"right",
                    fontFamily:"'JetBrains Mono',monospace", color:pColor }}>
                    {h.changePercent!=null
                      ? `${h.changePercent>=0?"+":""}${h.changePercent.toFixed(2)}%`
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
function EtfExplorer({ onBack }) {
  useGlobalStyles();

  const [selectedTicker,    setSelectedTicker]    = useState(() => {
    try { return localStorage.getItem(ETF_LS_KEY) || "ARKK"; } catch { return "ARKK"; }
  });
  const [holdings,          setHoldings]          = useState([]);
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
  const chartDataMap = useRef({});
  const tooltipTimer = useRef(null);

  // FX rates
  useEffect(() => {
    fetch(`${ETF_BASE}/fx/all`).then(r=>r.json())
      .then(d=>setRates(d)).catch(()=>{});
  }, []);

  // Load holdings
  const loadHoldings = useCallback(async (ticker, force=false) => {
    setLoadingHoldings(true); setHoldingsError(null);
    try {
      const url = `${ETF_BASE}/etf/${encodeURIComponent(ticker.replace(".","_"))}/holdings`;
      const data = await fetch(url).then(r=>r.json());
      if (data.error) throw new Error(data.error);
      setHoldings(data.holdings||[]);
      setFetchedAt(data.fetched_at||null);
      try { localStorage.setItem(ETF_LS_KEY, ticker); } catch {}
    } catch(e) { setHoldingsError(e.message); setHoldings([]); }
    setLoadingHoldings(false);
  }, []);

  useEffect(() => { if (selectedTicker) loadHoldings(selectedTicker); },
    [selectedTicker, loadHoldings]);

  // Fetch quotes — use batch endpoint (returns parsed price/changePct/refs like portfolio mode)
  const fetchQuotes = useCallback(async () => {
    if (!holdings.length) return;
    setFetching(true); setFetchErrors({});
    try {
      const symbols = holdings.map(h => h.symbol);
      const res = await fetch(`${ETF_BASE}/quotes/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols, source: "yahoo" }),
      }).then(r => r.json());
      setQuotes(prev => ({ ...prev, ...(res.results || {}) }));
      setFetchErrors(res.errors || {});
    } catch(e) {
      setFetchErrors({ _global: e.message });
    }
    setFetching(false);
  }, [holdings]);

  useEffect(() => { if (holdings.length>0) fetchQuotes(); },
    [holdings]); // eslint-disable-line

  // Nodes
  const nodes = useMemo(()=>buildEtfNodes(holdings,quotes,period),
    [holdings,quotes,period]);

  const etfMeta = PREDEFINED_ETFS_CLIENT.find(e=>e.ticker===selectedTicker);

  // Tooltip
  const handleCellHover = useCallback((e,cell) => {
    clearTimeout(tooltipTimer.current);
    // Preload chart data
    if (!chartDataMap.current[cell.symbol]) {
      Promise.all([
        quotesApi.raw(cell.symbol).catch(()=>null),
        quotesApi.raw(cell.symbol,false,"2d","5m").catch(()=>null),
      ]).then(([daily,intraday]) => {
        if (daily)   chartDataMap.current[cell.symbol]         = daily;
        if (intraday) chartDataMap.current[`${cell.symbol}_1d`] = intraday;
      });
    }
    tooltipTimer.current = setTimeout(()=>
      setTooltip({x:e.clientX,y:e.clientY,data:cell}), 120);
  }, []);
  const handleCellLeave = useCallback(()=>{
    clearTimeout(tooltipTimer.current); setTooltip(null);
  }, []);

  return (
    <div style={{ height:"100vh", display:"flex", background:THEME.bg,
      fontFamily:THEME.font, overflow:"hidden" }}>

      <EtfRail
        open={railOpen} onToggle={()=>setRailOpen(v=>!v)}
        selectedTicker={selectedTicker} onSelect={setSelectedTicker}
        currency={currency} onCurrency={setCurrency}
        fetching={fetching} onRefreshQuotes={fetchQuotes}
      />

      <div style={{ flex:1, display:"flex", flexDirection:"column",
        overflow:"hidden", minWidth:0 }}>

        {/* Top tab bar */}
        <div style={{ height:52, background:THEME.surface,
          borderBottom:`1px solid ${THEME.border}`,
          display:"flex", alignItems:"center", padding:"0 16px",
          gap:2, flexShrink:0 }}>
          {/* Back */}
          <button onClick={onBack} style={{
            display:"flex", alignItems:"center", gap:6,
            padding:"5px 10px", borderRadius:8, border:"none",
            background:"rgba(255,255,255,0.05)", color:THEME.text3,
            cursor:"pointer", fontSize:11, fontFamily:"inherit",
            marginRight:8, transition:"all 0.12s" }}>
            <ChevronLeft size={13}/> Sign In
          </button>
          <div style={{ width:1, height:20, background:THEME.border, marginRight:8 }}/>
          {[
            { key:"holdings",     icon:<LayoutDashboard size={14}/>, label:"TreeMap"  },
            { key:"chart",        icon:<BarChart2 size={14}/>,       label:"Bar Chart" },
            { key:"transactions", icon:<List size={14}/>,            label:"Holdings"  },
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
            {etfMeta && (
              <div style={{ fontSize:11, color:THEME.text3 }}>
                <span style={{ fontWeight:700, color:THEME.accent,
                  fontFamily:"'JetBrains Mono',monospace" }}>
                  {selectedTicker}
                </span>
                <span style={{ margin:"0 6px" }}>·</span>
                {etfMeta.name}
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

        {/* Period toolbar */}
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
              <TreeMapView nodes={nodes}
                onCellHover={handleCellHover} onCellLeave={handleCellLeave}
                currency={currency} rates={rates} colorMode="market"/>
            </div>
          ) : activeTab==="chart" ? (
            <div style={{ height:"100%", overflow:"hidden" }}>
              <BarChartView nodes={nodes} currency={currency} rates={rates}
                colorMode="market" period={period} subView={barSubView}
                onCellHover={handleCellHover} onCellLeave={handleCellLeave}/>
            </div>
          ) : (
            <EtfHoldingsTable
              holdings={holdings} quotes={quotes}
              currency={currency} rates={rates}
              fetchedAt={fetchedAt}
              onRefreshHoldings={()=>loadHoldings(selectedTicker,true)}
              refreshing={loadingHoldings}/>
          )}
        </div>
      </div>

      {tooltip && (
        <Tooltip
          data={tooltip.data} x={tooltip.x} y={tooltip.y}
          currency={currency} rates={rates} period={period}
          chartData={chartDataMap.current[tooltip.data.symbol]}
          chartDataIntraday={chartDataMap.current[`${tooltip.data.symbol}_1d`]}/>
      )}
    </div>
  );
}


// ════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ════════════════════════════════════════════════════════════════════════════
export default function App() {
  useGlobalStyles();
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
  const [initialized,     setInitialized]     = useState(false);
  const [chartDataMap,    setChartDataMap]    = useState({});

  const tooltipTimer = useRef(null);
  const pendingFetch = useRef(new Set());

  // ── Login handler ─────────────────────────────────────────────────────────
  const handleLogin = useCallback(async (userData) => {
    setUser(userData);
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
    setAllTransactions({}); setQuotes({}); setChartDataMap({});
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
      const result = await quotesApi.batch(syms, dataSource, avApiKey);
      setQuotes(prev => ({ ...prev, ...result.results }));
      setFetchErrors(result.errors ?? {});
      setApiStatus(Object.keys(result.errors??{}).length ? "error" : "ok");
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
    // Preload chart
    if (!chartDataMap[cell.symbol]) {
      pendingFetch.current.add(cell.symbol);
      Promise.all([
        quotesApi.raw(cell.symbol).catch(()=>null),
        quotesApi.raw(cell.symbol, false, "2d", "5m").catch(()=>null),
      ]).then(([daily, intraday]) => {
        pendingFetch.current.delete(cell.symbol);
        setChartDataMap(prev => ({
          ...prev,
          ...(daily    ? { [cell.symbol]:           daily    } : {}),
          ...(intraday ? { [`${cell.symbol}_1d`]:   intraday } : {}),
        }));
      });
    }
    tooltipTimer.current = setTimeout(() => setTooltip({ x:e.clientX, y:e.clientY, data:cell }), 120);
  }, [chartDataMap]);

  const handleCellLeave = useCallback(() => {
    clearTimeout(tooltipTimer.current);
    setTooltip(null);
  }, []);

  // ── Tab handler — also normalises viewMode when switching tabs ─────────────
  const handleTab = useCallback((tab) => {
    if (tab === "_addtx") { setShowAddTx(true); return; }
    setActiveTab(tab);
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
  if (etfMode) return <EtfExplorer onBack={() => setEtfMode(false)}/>;
  if (!user) return <LoginScreen onLogin={handleLogin} onEtfMode={() => setEtfMode(true)}/>;

  if (!initialized) return (
    <div style={{ height:"100vh", background:THEME.bg, display:"flex",
      alignItems:"center", justifyContent:"center" }}>
      <div style={{ color:THEME.text3, fontSize:14 }}>
        <span className="spin">⟳</span> Loading {user.username}…
      </div>
    </div>
  );

  return (
    <>
      <div style={{ height:"100vh", display:"flex", background:THEME.bg, fontFamily:THEME.font, overflow:"hidden" }}>

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
        />

        {/* ── MAIN CONTENT ───────────────────────────────────────────── */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>

          {/* Period toolbar */}
          <PeriodToolbar period={period} onPeriod={setPeriod} viewMode={viewMode} onViewMode={setViewMode} activeTab={activeTab} portfolioCount={activePortfolios.length} subView={barSubView} onSubView={setBarSubView}/>

          {/* Summary bar */}
          {allNodes.length > 0 && (
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
          {apiStatus && (
            <div style={{ position:"absolute", top:9, right:18, zIndex:200,
              display:"flex", alignItems:"center", gap:6,
              padding:"3px 10px", borderRadius:20, fontSize:10, fontWeight:700,
              border:"1px solid", pointerEvents:"none",
              ...(apiStatus==="ok"
                ? { background:"rgba(74,222,128,0.1)", borderColor:"rgba(74,222,128,0.25)", color:THEME.green }
                : apiStatus==="testing"
                  ? { background:"rgba(59,130,246,0.12)", borderColor:"rgba(59,130,246,0.3)", color:THEME.accent }
                  : { background:"rgba(248,113,113,0.1)", borderColor:"rgba(248,113,113,0.25)", color:THEME.red })
            }}>
              <span style={{ fontSize:7 }}>●</span>
              {apiStatus==="testing" ? "Fetching…"
                : apiStatus==="ok"   ? (dataSource==="alphavantage" ? "Alpha Vantage ✓" : "Yahoo Finance ✓")
                : "Fetch Error"}
            </div>
          )}

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
                  onEdit={(pid, tx) => setEditTx({ portfolioId:pid, tx })}/>
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
                  onEdit={(pid, tx) => setEditTx({ portfolioId:pid, tx })}/>
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
            chartData={chartDataMap[tooltip.data.symbol]}
            chartDataIntraday={chartDataMap[`${tooltip.data.symbol}_1d`]}/>
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
