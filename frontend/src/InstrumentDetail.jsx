// ════════════════════════════════════════════════════════════════════════════
// INSTRUMENT DETAIL — one page per instrument, built like Trade-Pal's detail
// view: serif title on top, panels on a draggable/resizable grid, and saved
// views (layouts) that apply to every instrument.
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import ReactGridLayout, { verticalCompactor } from "react-grid-layout";
import { createScaledStrategy, transformStrategy } from "react-grid-layout/core";
import "react-grid-layout/css/styles.css";
import { ChevronLeft, X, Plus, RefreshCw } from "./icons.jsx";

const T = {
  bg:"var(--bg)", surface:"var(--surface)", surface2:"var(--surface-2)",
  border:"var(--border)", border2:"var(--border-2)",
  text1:"var(--fg-1)", text2:"var(--fg-2)", text3:"var(--fg-3)",
  green:"var(--green)", red:"var(--red)", mono:"var(--font-mono)", serif:"var(--font-serif)",
};
const LS_KEY = "pp-detail-views";
const COLS = 12, ROW_H = 36;

// ── Panels ───────────────────────────────────────────────────────────────────
const PANEL_IDS = ["chart","position","perf","treemap","bars","tx","history","divs","short","stats","analysts","profile","news"];
const MIN = { chart:[4,5], treemap:[4,5], bars:[4,5], news:[3,5], profile:[3,4] };   // [minW, minH], default [3,3]

// ── Presets: fixed views, the same for every instrument ─────────────────────
const PRESETS = {
  snapshot: [
    { i:"chart", x:0, y:0, w:8, h:8 }, { i:"perf", x:8, y:0, w:4, h:4 }, { i:"position", x:8, y:4, w:4, h:4 },
    { i:"stats", x:0, y:8, w:4, h:7 }, { i:"short", x:4, y:8, w:4, h:7 }, { i:"news", x:8, y:8, w:4, h:7 },
  ],
  longterm: [
    { i:"chart", x:0, y:0, w:12, h:9 }, { i:"position", x:0, y:9, w:4, h:6 }, { i:"tx", x:4, y:9, w:8, h:6 },
    { i:"divs", x:0, y:15, w:6, h:7 }, { i:"history", x:6, y:15, w:6, h:7 },
    { i:"analysts", x:0, y:22, w:6, h:6 }, { i:"profile", x:6, y:22, w:6, h:6 },
  ],
  market: [
    { i:"chart", x:0, y:0, w:8, h:8 }, { i:"analysts", x:8, y:0, w:4, h:8 },
    { i:"stats", x:0, y:8, w:4, h:7 }, { i:"short", x:4, y:8, w:4, h:7 }, { i:"perf", x:8, y:8, w:4, h:7 },
    { i:"treemap", x:0, y:15, w:12, h:8 },
  ],
  news: [
    { i:"news", x:0, y:0, w:7, h:12 }, { i:"chart", x:7, y:0, w:5, h:6 }, { i:"analysts", x:7, y:6, w:5, h:6 },
    { i:"profile", x:0, y:12, w:12, h:5 },
  ],
};
const DEFAULT_KEY = "preset:snapshot";
const cleanLayout = l => (l || []).filter(it => PANEL_IDS.includes(it.i))
  .map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
const sameLayout = (a, b) => JSON.stringify(cleanLayout(a).sort((p,q)=>p.i.localeCompare(q.i)))
                          === JSON.stringify(cleanLayout(b).sort((p,q)=>p.i.localeCompare(q.i)));

// ── Saved views: server for logged-in users, localStorage otherwise ─────────
// Shape { views: { name: layout }, presets: { presetKey: layout }, active: "preset:x" | name, current: layout }
// `presets` holds the user's edits of the built-in presets; deleting an entry restores the default.
function useDetailViews(user) {
  const [state, setState] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
  });
  const loaded = useRef(!user);
  useEffect(() => {
    if (!user?.token) return;
    fetch(`/api/users/${user.id}/detail-views`, { headers:{ Authorization:`Bearer ${user.token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && Object.keys(d).length) setState(d); })
      .catch(() => {})
      .finally(() => { loaded.current = true; });
  }, [user?.id, user?.token]);
  // Persist (debounced) — only after the server copy has been read, so it is never overwritten by defaults
  useEffect(() => {
    if (!loaded.current) return;
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {}
    if (!user?.token) return;
    const id = setTimeout(() => {
      fetch(`/api/users/${user.id}/detail-views`, {
        method:"PUT", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${user.token}` },
        body: JSON.stringify(state),
      }).catch(() => {});
    }, 800);
    return () => clearTimeout(id);
  }, [state, user?.id, user?.token]);
  return [state, setState];
}

// ── Small helpers ────────────────────────────────────────────────────────────
function useWidth(ref) {
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}
const fmtNum = (v, dec, loc) => v == null ? "—"
  : v.toLocaleString(loc, { minimumFractionDigits:dec, maximumFractionDigits:dec });
const fmtMoney = (v, ccy, loc, dec=2) => {
  if (v == null) return "—";
  try { return v.toLocaleString(loc, { style:"currency", currency:ccy, minimumFractionDigits:dec, maximumFractionDigits:dec }); }
  catch { return `${fmtNum(v, dec, loc)} ${ccy ?? ""}`; }   // e.g. GBp (pence) is no ISO code
};
const fmtBig = (v, loc) => {
  if (v == null) return "—";
  const a = Math.abs(v);
  if (a >= 1e12) return `${fmtNum(v/1e12, 2, loc)} T`;
  if (a >= 1e9)  return `${fmtNum(v/1e9, 2, loc)} B`;
  if (a >= 1e6)  return `${fmtNum(v/1e6, 2, loc)} M`;
  return fmtNum(v, 0, loc);
};
const fmtPct = (v, loc, dec=2) => v == null ? "—" : `${v >= 0 ? "+" : ""}${fmtNum(v, dec, loc)} %`;
const signColor = v => v == null ? T.text3 : v >= 0 ? T.green : T.red;
const fmtDay = (iso, loc) => iso ? new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString(loc) : "—";

// Raw Yahoo chart → [{ t: Date, v: close }]
async function loadSeries(symbol, range, interval) {
  const r = await fetch(`/api/quotes/yahoo/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const res = (await r.json())?.chart?.result?.[0];
  const ts = res?.timestamp ?? [], cl = res?.indicators?.quote?.[0]?.close ?? [];
  return ts.map((t, k) => ({ t:new Date(t*1000), v:cl[k] })).filter(p => p.v != null);
}

// ── Building blocks ──────────────────────────────────────────────────────────
const Kpi = ({ label, value, color, sub }) => (
  <div style={{ padding:"10px 12px", borderRight:`1px solid ${T.border2}`, borderBottom:`1px solid ${T.border2}` }}>
    <div className="label" style={{ marginBottom:5 }}>{label}</div>
    <div className="num" style={{ fontSize:15, color: color ?? T.text1 }}>{value}</div>
    {sub && <div style={{ fontSize:10, color:T.text3, marginTop:3 }}>{sub}</div>}
  </div>
);
const KpiGrid = ({ children, min=130 }) => (
  <div style={{ display:"grid", gridTemplateColumns:`repeat(auto-fill, minmax(${min}px, 1fr))` }}>{children}</div>
);
const Empty = ({ children }) => (
  <div style={{ padding:16, fontSize:12, color:T.text3, lineHeight:1.6 }}>{children}</div>
);
const Row = ({ cells, head }) => (
  <tr style={{ borderBottom:`1px solid ${T.border2}` }}>
    {cells.map((c, k) => {
      const [content, align="left", color] = Array.isArray(c) ? c : [c];
      const Tag = head ? "th" : "td";
      return <Tag key={k} className={head ? "label" : (align === "right" ? "num" : undefined)} style={{
        padding: head ? "7px 10px" : "6px 10px", textAlign:align, fontWeight: head ? 600 : 400,
        fontSize: head ? 9 : 12, color: head ? T.text3 : (color ?? T.text1), whiteSpace:"nowrap",
        position: head ? "sticky" : undefined, top:0, background: head ? T.surface : undefined,
      }}>{content}</Tag>;
    })}
  </tr>
);
// Range bar: low ── marker ── high
const RangeBar = ({ low, high, value, mid, loc, ccy }) => {
  if (low == null || high == null || high <= low) return null;
  const pos = v => `${Math.max(0, Math.min(100, (v - low) / (high - low) * 100))}%`;
  return (
    <div style={{ padding:"10px 12px 14px" }}>
      <div style={{ position:"relative", height:2, background:T.border, margin:"10px 0 8px" }}>
        {mid != null && <div style={{ position:"absolute", left:pos(mid), top:-4, width:1, height:10, background:T.text3 }}/>}
        {value != null && <div style={{ position:"absolute", left:pos(value), top:-5, width:10, height:10,
          marginLeft:-5, background:T.text1, borderRadius:"50%" }}/>}
      </div>
      <div className="num" style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:T.text3 }}>
        <span>{fmtMoney(low, ccy, loc)}</span><span>{fmtMoney(high, ccy, loc)}</span>
      </div>
    </div>
  );
};

// ── Panel: price chart with buy/sell markers and average cost ───────────────
const CHART_RANGES = [["1M","1mo","1d"],["6M","6mo","1d"],["YTD","ytd","1d"],["1Y","1y","1d"],["5Y","5y","1wk"],["Max","max","1mo"]];
function PriceChart({ symbol, ccy, transactions, avgCostNative, loc }) {
  const { t } = useTranslation();
  const ref = useRef(null);
  const w = useWidth(ref);
  const [h, setH] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setH(Math.floor(e.contentRect.height)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const [range, setRange] = useState("1Y");
  const [series, setSeries] = useState(null);
  const [error, setError] = useState(null);
  const [hover, setHover] = useState(null);
  useEffect(() => {
    const [, r, iv] = CHART_RANGES.find(x => x[0] === range);
    let alive = true;
    setSeries(null); setError(null);
    loadSeries(symbol, r, iv).then(s => alive && setSeries(s)).catch(e => alive && setError(e.message));
    return () => { alive = false; };
  }, [symbol, range]);

  const PAD = { l:8, r:56, t:10, b:22 };
  const geo = useMemo(() => {
    if (!series?.length || w < 50 || h < 50) return null;
    const t0 = series[0].t.getTime(), t1 = series[series.length-1].t.getTime();
    let lo = Math.min(...series.map(p => p.v)), hi = Math.max(...series.map(p => p.v));
    if (avgCostNative) { lo = Math.min(lo, avgCostNative); hi = Math.max(hi, avgCostNative); }
    const padY = (hi - lo) * 0.06 || 1;
    lo -= padY; hi += padY;
    const W = w - PAD.l - PAD.r, H = h - PAD.t - PAD.b;
    const x = tm => PAD.l + (t1 > t0 ? (tm - t0) / (t1 - t0) : 0) * W;
    const y = v => PAD.t + (1 - (v - lo) / (hi - lo)) * H;
    const path = series.map((p, k) => `${k ? "L" : "M"}${x(p.t.getTime()).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
    const area = `${path}L${x(t1).toFixed(1)},${PAD.t+H}L${x(t0).toFixed(1)},${PAD.t+H}Z`;
    const ticks = Array.from({ length:4 }, (_, k) => lo + (hi - lo) * (k + 0.5) / 4);
    // Markers sit on the line at the closest point in time
    const markers = transactions.map(tx => {
      const tm = new Date(tx.date + "T12:00:00").getTime();
      if (tm < t0 || tm > t1 + 86400000) return null;
      let best = series[0];
      for (const p of series) if (Math.abs(p.t.getTime() - tm) < Math.abs(best.t.getTime() - tm)) best = p;
      return { tx, cx:x(tm), cy:y(best.v) };
    }).filter(Boolean);
    const first = series[0].v, last = series[series.length-1].v;
    return { x, y, path, area, ticks, markers, t0, t1, W, H, change:(last-first)/first*100 };
  }, [series, w, h, transactions, avgCostNative]);

  const onMove = e => {
    if (!geo) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (w / rect.width);   // tolerate CSS zoom (comfort mode)
    const tm = geo.t0 + (px - PAD.l) / geo.W * (geo.t1 - geo.t0);
    let best = series[0];
    for (const p of series) if (Math.abs(p.t.getTime() - tm) < Math.abs(best.t.getTime() - tm)) best = p;
    setHover(best);
  };
  const up = geo ? geo.change >= 0 : true;
  const line = up ? "var(--green)" : "var(--red)";

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px" }}>
        <div className="rail-density-row">
          {CHART_RANGES.map(([k]) => (
            <button key={k} className={"rail-density-btn" + (range === k ? " active" : "")}
              onClick={() => setRange(k)} style={{ padding:"3px 9px", fontFamily:T.mono }}>{k}</button>
          ))}
        </div>
        {geo && <span className="num" style={{ fontSize:12, color:signColor(geo.change) }}>{fmtPct(geo.change, loc)}</span>}
        {hover && <span className="num" style={{ marginLeft:"auto", fontSize:11, color:T.text2 }}>
          {hover.t.toLocaleDateString(loc)} · {fmtMoney(hover.v, ccy, loc)}</span>}
      </div>
      <div ref={ref} style={{ flex:1, minHeight:0, position:"relative" }}>
        {error && <Empty>{t("detail.loadError")}: {error}</Empty>}
        {!error && !series && <Empty>{t("detail.loading")}</Empty>}
        {geo && (
          <svg width={w} height={h} onMouseMove={onMove} onMouseLeave={() => setHover(null)} style={{ display:"block" }}>
            {geo.ticks.map(v => (
              <g key={v}>
                <line x1={PAD.l} x2={w - PAD.r} y1={geo.y(v)} y2={geo.y(v)} style={{ stroke:"var(--border)" }} strokeDasharray="3 5"/>
                <text x={w - PAD.r + 6} y={geo.y(v) + 3} style={{ fill:"var(--fg-3)", fontFamily:"var(--font-mono)" }} fontSize={9}>
                  {fmtNum(v, v >= 100 ? 0 : 2, loc)}
                </text>
              </g>
            ))}
            <path d={geo.area} style={{ fill:line, opacity:0.08 }}/>
            <path d={geo.path} fill="none" style={{ stroke:line }} strokeWidth={1.5}/>
            {avgCostNative && (
              <g>
                <line x1={PAD.l} x2={w - PAD.r} y1={geo.y(avgCostNative)} y2={geo.y(avgCostNative)}
                  style={{ stroke:"var(--fg-2)" }} strokeDasharray="6 4"/>
                <text x={PAD.l + 4} y={geo.y(avgCostNative) - 4} style={{ fill:"var(--fg-2)" }} fontSize={9}>{t("detail.avgCost")}</text>
              </g>
            )}
            {geo.markers.map(({ tx, cx, cy }, k) => (
              <g key={k}>
                <title>{`${tx.type} ${fmtNum(tx.quantity, 4, loc)} @ ${fmtMoney(tx.price, tx.currency || ccy, loc)} · ${fmtDay(tx.date, loc)}`}</title>
                <path d={tx.type === "BUY" ? `M${cx},${cy-9} l-5,-8 h10 z` : `M${cx},${cy+9} l-5,8 h10 z`}
                  style={{ fill: tx.type === "BUY" ? "var(--green)" : "var(--red)" }}/>
              </g>
            ))}
            {hover && (
              <g>
                <line x1={geo.x(hover.t.getTime())} x2={geo.x(hover.t.getTime())} y1={PAD.t} y2={PAD.t + geo.H} style={{ stroke:"var(--fg-3)" }}/>
                <circle cx={geo.x(hover.t.getTime())} cy={geo.y(hover.v)} r={3} style={{ fill:"var(--fg-1)" }}/>
              </g>
            )}
            <text x={PAD.l} y={h - 6} style={{ fill:"var(--fg-3)", fontFamily:"var(--font-mono)" }} fontSize={9}>
              {series[0].t.toLocaleDateString(loc)}</text>
            <text x={w - PAD.r} y={h - 6} textAnchor="end" style={{ fill:"var(--fg-3)", fontFamily:"var(--font-mono)" }} fontSize={9}>
              {series[series.length-1].t.toLocaleDateString(loc)}</text>
          </svg>
        )}
      </div>
    </div>
  );
}

// ── Panel: monthly closes (historic prices) ──────────────────────────────────
function HistoryTable({ symbol, ccy, loc }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let alive = true;
    // Yahoo appends the live quote as an extra point in the current month — keep one row per month (the latest)
    const perMonth = s => s.reverse().filter((p, k, a) =>
      k === 0 || `${p.t.getFullYear()}-${p.t.getMonth()}` !== `${a[k-1].t.getFullYear()}-${a[k-1].t.getMonth()}`);
    loadSeries(symbol, "5y", "1mo").then(s => alive && setRows(perMonth(s))).catch(() => alive && setRows([]));
    return () => { alive = false; };
  }, [symbol]);
  if (!rows) return <Empty>{t("detail.loading")}</Empty>;
  if (!rows.length) return <Empty>{t("detail.noData")}</Empty>;
  return (
    <table style={{ width:"100%", borderCollapse:"collapse" }}>
      <thead><Row head cells={[t("detail.month"), [t("detail.close"), "right"], [t("detail.change"), "right"]]}/></thead>
      <tbody>
        {rows.map((p, k) => {
          const prev = rows[k+1]?.v;
          const ch = prev ? (p.v - prev) / prev * 100 : null;
          return <Row key={k} cells={[
            p.t.toLocaleDateString(loc, { month:"short", year:"numeric" }),
            [fmtMoney(p.v, ccy, loc), "right"],
            [fmtPct(ch, loc, 1), "right", signColor(ch)],
          ]}/>;
        })}
      </tbody>
    </table>
  );
}

// ── Panel: the portfolio/ETF bar chart, with its Performance / weight switch ──
function BarsPanel({ symbol, render }) {
  const { t } = useTranslation();
  const [sub, setSub] = useState("perf");
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
      <div style={{ padding:"8px 12px", flexShrink:0 }}>
        <div className="rail-density-row" style={{ display:"inline-flex" }}>
          {[["perf", t("nav.performance")], ["size", t("chart.byWeight")]].map(([k, label]) => (
            <button key={k} className={"rail-density-btn" + (sub === k ? " active" : "")}
              onClick={() => setSub(k)} style={{ padding:"3px 10px" }}>{label}</button>
          ))}
        </div>
      </div>
      <div style={{ flex:1, minHeight:0 }}>{render(symbol, sub)}</div>
    </div>
  );
}

// ── Grid panel chrome ────────────────────────────────────────────────────────
const Panel = ({ title, sub, onRemove, children, scroll=true }) => (
  <div style={{ height:"100%", display:"flex", flexDirection:"column", background:T.surface, overflow:"hidden" }}>
    <div className="detail-drag" style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px 8px 12px",
      borderBottom:`1px solid ${T.border2}`, cursor:"move", userSelect:"none", flexShrink:0 }}>
      <span style={{ width:14, height:8, flexShrink:0, backgroundImage:"radial-gradient(var(--fg-3) 1.1px, transparent 1.1px)",
        backgroundSize:"4.5px 4.5px" }}/>
      <span style={{ fontSize:16, fontWeight:200, textTransform:"lowercase", color:T.text1, whiteSpace:"nowrap" }}>{title}</span>
      {sub && <span style={{ fontSize:10, color:T.text3, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{sub}</span>}
      <button className="detail-nodrag" onClick={onRemove} title="×" style={{ marginLeft:"auto", background:"none", border:"none",
        color:T.text3, cursor:"pointer", display:"flex", padding:2 }}><X size={14}/></button>
    </div>
    <div style={{ flex:1, minHeight:0, overflow: scroll ? "auto" : "hidden" }}>{children}</div>
  </div>
);

// ════════════════════════════════════════════════════════════════════════════
export default function InstrumentDetail({
  symbol, user, quote, positions = [], transactions = [], portfolios = [],
  currency = "USD", rates = {}, perfColor, renderTreemap, renderBars, contextTitle, extraKpis, onClose,
}) {
  const { t, i18n } = useTranslation();
  const loc = i18n.language?.startsWith("de") ? "de-DE" : "en-US";
  const [info, setInfo] = useState(null);
  const [infoErr, setInfoErr] = useState(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let alive = true;
    setInfo(null); setInfoErr(null);
    fetch(`/api/instrument/${encodeURIComponent(symbol)}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`); return d; })
      .then(d => alive && setInfo(d))
      .catch(e => alive && setInfoErr(e.message));
    return () => { alive = false; };
  }, [symbol, reload]);
  useEffect(() => {
    const onKey = e => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ── Views ──
  const [vs, setVs] = useDetailViews(user);
  const views  = vs.views ?? {};
  const active = vs.active ?? DEFAULT_KEY;
  const presetEdits = vs.presets ?? {};
  const viewLayout = key => key?.startsWith("preset:")
    ? (presetEdits[key.slice(7)] ?? PRESETS[key.slice(7)]) : views[key];
  const layout = cleanLayout(vs.current ?? viewLayout(active) ?? PRESETS.snapshot);
  const modified = !sameLayout(layout, viewLayout(active) ?? []);
  const setLayout = l => setVs(s => ({ ...s, current: cleanLayout(l) }));
  const selectView = key => setVs(s => ({ ...s, active:key, current: cleanLayout(viewLayout(key)) }));
  const saveView = name => {
    name = name.trim();
    if (!name) return;
    setVs(s => ({ ...s, views:{ ...(s.views ?? {}), [name]: layout }, active:name, current:layout }));
  };
  // Save the current arrangement into the active view — presets included (as an edit)
  const saveActive = () => setVs(s => active.startsWith("preset:")
    ? { ...s, presets:{ ...(s.presets ?? {}), [active.slice(7)]: layout } }
    : { ...s, views:{ ...(s.views ?? {}), [active]: layout } });
  const resetPreset = k => setVs(s => {
    const p = { ...(s.presets ?? {}) }; delete p[k];
    return { ...s, presets:p, ...(s.active === `preset:${k}` ? { current: cleanLayout(PRESETS[k]) } : {}) };
  });
  const deleteView = name => setVs(s => {
    const v = { ...(s.views ?? {}) }; delete v[name];
    return { ...s, views:v, ...(s.active === name ? { active:DEFAULT_KEY } : {}) };
  });
  const renameView = (oldName, newName) => {
    newName = newName.trim();
    if (!newName || newName === oldName) return;
    setVs(s => {
      const v = {};
      for (const [k, l] of Object.entries(s.views ?? {})) v[k === oldName ? newName : k] = l;
      return { ...s, views:v, active: s.active === oldName ? newName : s.active };
    });
  };
  const removePanel = id => setLayout(layout.filter(it => it.i !== id));
  const addPanel = id => {
    const [mw, mh] = MIN[id] ?? [3,3];
    const bottom = layout.reduce((m, it) => Math.max(m, it.y + it.h), 0);
    setLayout([...layout, { i:id, x:0, y:bottom, w:Math.max(mw, 6), h:Math.max(mh, 6) }]);
  };
  const [menu, setMenu] = useState(null);   // "views" | "panels" | null
  const [saveName, setSaveName] = useState("");
  const [renaming, setRenaming] = useState(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => { setMenu(null); setRenaming(null); };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menu]);
  const viewLabel = key => key.startsWith("preset:") ? t(`detail.preset_${key.slice(7)}`) : key;

  // ── Grid width / comfort zoom ──
  const gridRef = useRef(null);
  const gridW = useWidth(gridRef);
  const zoom = typeof document !== "undefined" && document.body.getAttribute("data-mode") === "comfort" ? 1.18 : 1;
  const strategy = useMemo(() => zoom !== 1 ? createScaledStrategy(zoom) : transformStrategy, [zoom]);

  // ── Derived data ──
  const ccy = info?.currency || quote?.currency || "USD";
  const price = quote?.price ?? null;
  const prevClose = quote?.prevClose ?? null;
  const dayChange = price != null && prevClose ? (price - prevClose) / prevClose * 100 : null;
  const rate = rates[currency] ?? 1;
  const nativeRate = rates[ccy] ?? 1;   // 1 USD = nativeRate units of ccy
  const held = positions.reduce((a, p) => ({
    qty: a.qty + (p.qty ?? 0), costUSD: a.costUSD + (p.costUSD ?? 0),
    valueUSD: a.valueUSD + (p.valueUSD ?? 0), glUSD: a.glUSD + (p.gainLossUSD ?? 0),
  }), { qty:0, costUSD:0, valueUSD:0, glUSD:0 });
  const avgCostNative = held.qty > 0 ? held.costUSD / held.qty * nativeRate : null;
  const txSorted = useMemo(() => [...transactions].sort((a, b) => b.date.localeCompare(a.date)), [transactions]);
  const qtyOn = useCallback(day => transactions.reduce((s, tx) =>
    tx.date <= day ? s + (tx.type === "BUY" ? tx.quantity : -tx.quantity) : s, 0), [transactions]);
  const portName = id => portfolios.find(p => p.id === id);
  const money = usd => fmtMoney(usd * rate, currency, loc);
  const name = info?.name || quote?.longName || quote?.shortName || symbol;

  // ── Panel registry ──
  const panels = {
    chart: { sub:t("detail.sub_chart"), scroll:false,
      body: () => <PriceChart symbol={symbol} ccy={ccy} transactions={transactions} avgCostNative={avgCostNative} loc={loc}/> },
    position: { sub: positions.length > 1 ? t("detail.sub_positionMulti", { n:positions.length }) : null,
      body: () => held.qty > 0 ? (
        <KpiGrid>
          <Kpi label={t("detail.qty")} value={fmtNum(held.qty, held.qty % 1 ? 4 : 0, loc)}/>
          <Kpi label={t("detail.value")} value={money(held.valueUSD)}/>
          <Kpi label={t("detail.cost")} value={money(held.costUSD)}/>
          <Kpi label={t("detail.avgCost")} value={fmtMoney(avgCostNative, ccy, loc)}/>
          <Kpi label={t("detail.gainLoss")} value={money(held.glUSD)} color={signColor(held.glUSD)}
            sub={fmtPct(held.costUSD ? held.glUSD / held.costUSD * 100 : null, loc)}/>
          {positions.map(p => (
            <Kpi key={p.portfolioId} label={`${t("detail.weightIn")} ${portName(p.portfolioId)?.name ?? ""}`}
              value={`${fmtNum(p.weight, 1, loc)} %`}/>
          ))}
        </KpiGrid>
      ) : (extraKpis ? <KpiGrid>{extraKpis.map(k => <Kpi key={k.label} {...k}/>)}</KpiGrid>
         : <Empty>{t("detail.notHeld")}</Empty>) },
    perf: { sub:t("detail.sub_perf"),
      body: () => {
        const ref = k => quote?.refs?.[k];
        const tiles = [["1D", dayChange], ...["1W","1M","YTD","1Y","2Y"].map(k => [k, ref(k) && price ? (price - ref(k)) / ref(k) * 100 : null])];
        if (held.costUSD > 0) tiles.push([t("detail.sinceBuy"), held.glUSD / held.costUSD * 100]);
        return (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(90px, 1fr))", gap:1, background:T.bg, height:"100%" }}>
            {tiles.map(([k, v]) => (
              <div key={k} style={{ background: v == null ? T.surface2 : perfColor(v), padding:"10px 12px",
                display:"flex", flexDirection:"column", justifyContent:"flex-end", minHeight:56 }}>
                <div style={{ fontSize:9, fontWeight:600, letterSpacing:".14em", textTransform:"uppercase",
                  color: v == null ? T.text3 : "rgba(255,255,255,0.7)" }}>{k}</div>
                <div className="num" style={{ fontSize:15, color: v == null ? T.text3 : "#fff" }}>{fmtPct(v, loc, 1)}</div>
              </div>
            ))}
          </div>
        );
      } },
    treemap: { sub:t("detail.sub_treemap"), scroll:false,
      body: () => renderTreemap ? renderTreemap(symbol) : <Empty>{t("detail.notHeld")}</Empty> },
    bars: { sub:t("detail.sub_treemap"), scroll:false,
      body: () => renderBars ? <BarsPanel symbol={symbol} render={renderBars}/> : <Empty>{t("detail.notHeld")}</Empty> },
    tx: { sub: transactions.length ? t("detail.sub_tx", { n:transactions.length }) : null,
      body: () => txSorted.length ? (
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead><Row head cells={[t("detail.date"), t("detail.type"), [t("detail.qty"), "right"], [t("detail.price"), "right"],
            [t("detail.amount"), "right"], t("detail.portfolio")]}/></thead>
          <tbody>
            {txSorted.map(tx => {
              const p = portName(tx.portfolioId);
              return <Row key={`${tx.portfolioId}-${tx.id}`} cells={[
                fmtDay(tx.date, loc),
                [tx.type === "BUY" ? t("detail.buy") : t("detail.sell"), "left", tx.type === "BUY" ? T.green : T.red],
                [fmtNum(tx.quantity, tx.quantity % 1 ? 4 : 0, loc), "right"],
                [fmtMoney(tx.price, tx.currency || ccy, loc), "right"],
                [fmtMoney(tx.price * tx.quantity, tx.currency || ccy, loc), "right"],
                <span style={{ display:"inline-flex", alignItems:"center", gap:6 }}>
                  <span style={{ width:7, height:7, borderRadius:"50%", background:p?.color ?? T.text3 }}/>{p?.name ?? "—"}
                </span>,
              ]}/>;
            })}
          </tbody>
        </table>
      ) : <Empty>{t("detail.noTx")}</Empty> },
    history: { sub:t("detail.sub_history"), body: () => <HistoryTable symbol={symbol} ccy={ccy} loc={loc}/> },
    divs: { sub:t("detail.sub_divs"),
      body: () => {
        if (!info) return <Empty>{infoErr ? `${t("detail.loadError")}: ${infoErr}` : t("detail.loading")}</Empty>;
        const c = info.calendar, today = new Date().toISOString().slice(0, 10);
        const upcomingEx  = c.exDividendDate && c.exDividendDate >= today ? c.exDividendDate : null;
        const upcomingPay = c.dividendDate && c.dividendDate >= today ? c.dividendDate : null;
        const perShare = info.dividends[0]?.amount ?? null;
        return (
          <>
            <KpiGrid>
              <Kpi label={t("detail.divYield")} value={c.dividendYield != null ? `${fmtNum(c.dividendYield * 100, 2, loc)} %` : "—"}/>
              <Kpi label={t("detail.divRate")} value={fmtMoney(c.dividendRate, ccy, loc)}/>
              <Kpi label={t("detail.nextEx")} value={upcomingEx ? fmtDay(upcomingEx, loc) : "—"}
                sub={!upcomingEx && c.exDividendDate ? `${t("detail.lastEx")} ${fmtDay(c.exDividendDate, loc)}` : null}/>
              <Kpi label={t("detail.nextPay")} value={upcomingPay ? fmtDay(upcomingPay, loc) : "—"}/>
              {held.qty > 0 && c.dividendRate != null && (
                <Kpi label={t("detail.yourAnnual")} value={fmtMoney(c.dividendRate * held.qty, ccy, loc)} color={T.green}
                  sub={perShare != null ? `${t("detail.nextPayment")} ≈ ${fmtMoney(perShare * held.qty, ccy, loc)}` : null}/>
              )}
            </KpiGrid>
            {info.dividends.length ? (
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead><Row head cells={[t("detail.exDate"), [t("detail.perShare"), "right"],
                  ...(transactions.length ? [[t("detail.qtyThen"), "right"], [t("detail.received"), "right"]] : [])]}/></thead>
                <tbody>
                  {info.dividends.map(d => {
                    const q = transactions.length ? qtyOn(d.date) : 0;
                    return <Row key={d.date} cells={[fmtDay(d.date, loc), [fmtMoney(d.amount, ccy, loc, 4), "right"],
                      ...(transactions.length ? [[q > 0 ? fmtNum(q, q % 1 ? 4 : 0, loc) : "—", "right"],
                        [q > 0 ? fmtMoney(d.amount * q, ccy, loc) : "—", "right", q > 0 ? T.green : T.text3]] : [])]}/>;
                  })}
                </tbody>
              </table>
            ) : <Empty>{t("detail.noDivs")}</Empty>}
          </>
        );
      } },
    short: { sub: info?.short?.date ? t("detail.sub_short", { date:fmtDay(info.short.date, loc) }) : null,
      body: () => {
        if (!info) return <Empty>{infoErr ? `${t("detail.loadError")}: ${infoErr}` : t("detail.loading")}</Empty>;
        const s = info.short;
        if (s.pctFloat == null && s.sharesShort == null) return <Empty>{t("detail.noShort")}</Empty>;
        const pct = s.pctFloat != null ? s.pctFloat * 100 : null;
        const level = pct == null ? null : pct >= 20 ? "high" : pct >= 10 ? "elevated" : pct >= 5 ? "moderate" : "low";
        return (
          <>
            <KpiGrid>
              <Kpi label={t("detail.shortFloat")} value={pct != null ? `${fmtNum(pct, 2, loc)} %` : "—"}
                color={pct >= 10 ? T.red : undefined} sub={level && t(`detail.shortLevel_${level}`)}/>
              <Kpi label={t("detail.daysToCover")} value={fmtNum(s.daysToCover, 1, loc)}/>
              <Kpi label={t("detail.sharesShort")} value={fmtBig(s.sharesShort, loc)}/>
              <Kpi label={t("detail.vsPriorMonth")} value={fmtPct(s.changePct, loc, 1)} color={s.changePct > 0 ? T.red : s.changePct < 0 ? T.green : undefined}/>
            </KpiGrid>
            {pct != null && (
              <div style={{ padding:"12px" }}>
                <div style={{ position:"relative", height:6, background:T.surface2 }}>
                  <div style={{ position:"absolute", left:0, top:0, bottom:0, width:`${Math.min(100, pct / 30 * 100)}%`,
                    background: pct >= 10 ? "var(--red)" : "var(--fg-2)" }}/>
                </div>
                <div className="num" style={{ display:"flex", justifyContent:"space-between", fontSize:9, color:T.text3, marginTop:4 }}>
                  <span>0 %</span><span>10 %</span><span>20 %</span><span>30 %+</span>
                </div>
                <div style={{ fontSize:10, color:T.text3, marginTop:10, lineHeight:1.5 }}>{t("detail.shortHint")}</div>
              </div>
            )}
          </>
        );
      } },
    stats: { sub:info?.exchange ?? null,
      body: () => {
        if (!info) return <Empty>{infoErr ? `${t("detail.loadError")}: ${infoErr}` : t("detail.loading")}</Empty>;
        const s = info.stats, c = info.calendar;
        return (
          <>
            <KpiGrid min={120}>
              <Kpi label={t("detail.marketCap")} value={fmtBig(s.marketCap, loc)}/>
              <Kpi label={t("detail.pe")} value={fmtNum(s.trailingPE, 1, loc)}/>
              <Kpi label={t("detail.fpe")} value={fmtNum(s.forwardPE, 1, loc)}/>
              <Kpi label={t("detail.pb")} value={fmtNum(s.priceToBook, 1, loc)}/>
              <Kpi label={t("detail.beta")} value={fmtNum(s.beta, 2, loc)}/>
              <Kpi label={t("detail.avgVolume")} value={fmtBig(s.avgVolume, loc)}/>
              <Kpi label={t("detail.margin")} value={s.profitMargin != null ? `${fmtNum(s.profitMargin*100, 1, loc)} %` : "—"}/>
              <Kpi label={t("detail.revGrowth")} value={fmtPct(s.revenueGrowth != null ? s.revenueGrowth*100 : null, loc, 1)}
                color={signColor(s.revenueGrowth)}/>
              <Kpi label={t("detail.earnings")} value={fmtDay(c.earningsDate, loc)}
                sub={c.epsEstimate != null ? `${t("detail.epsEst")} ${fmtNum(c.epsEstimate, 2, loc)}` : null}/>
            </KpiGrid>
            <div className="label" style={{ padding:"10px 12px 0" }}>{t("detail.range52")}</div>
            <RangeBar low={s.low52} high={s.high52} value={price} loc={loc} ccy={ccy}/>
          </>
        );
      } },
    analysts: { sub: info?.analysts?.count ? t("detail.sub_analysts", { n:info.analysts.count }) : null,
      body: () => {
        if (!info) return <Empty>{infoErr ? `${t("detail.loadError")}: ${infoErr}` : t("detail.loading")}</Empty>;
        const a = info.analysts;
        if (a.targetMean == null && !a.trend) return <Empty>{t("detail.noAnalysts")}</Empty>;
        const up = a.targetMean != null && price ? (a.targetMean - price) / price * 100 : null;
        const tr = a.trend, total = tr ? tr.strongBuy + tr.buy + tr.hold + tr.sell + tr.strongSell : 0;
        const seg = [["strongBuy","var(--green)",1],["buy","var(--green)",0.55],["hold","var(--fg-3)",0.6],["sell","var(--red)",0.55],["strongSell","var(--red)",1]];
        return (
          <>
            <KpiGrid>
              <Kpi label={t("detail.recommendation")} value={a.recommendation ? t(`detail.rec_${a.recommendation}`, a.recommendation) : "—"}/>
              <Kpi label={t("detail.target")} value={fmtMoney(a.targetMean, ccy, loc)} sub={up != null ? fmtPct(up, loc, 1) : null}/>
            </KpiGrid>
            <div className="label" style={{ padding:"10px 12px 0" }}>{t("detail.targetRange")}</div>
            <RangeBar low={a.targetLow != null && price ? Math.min(a.targetLow, price) : a.targetLow}
              high={a.targetHigh != null && price ? Math.max(a.targetHigh, price) : a.targetHigh}
              value={price} mid={a.targetMean} loc={loc} ccy={ccy}/>
            {total > 0 && (
              <div style={{ padding:"0 12px 12px" }}>
                <div style={{ display:"flex", height:8, gap:1 }}>
                  {seg.map(([k, col, op]) => tr[k] > 0 && (
                    <div key={k} title={`${t(`detail.rec_${k}`)}: ${tr[k]}`}
                      style={{ flex:tr[k], background:col, opacity:op }}/>
                  ))}
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:9, color:T.text3, marginTop:4 }}>
                  <span>{t("detail.rec_buy")} {tr.strongBuy + tr.buy}</span><span>{t("detail.rec_hold")} {tr.hold}</span>
                  <span>{t("detail.rec_sell")} {tr.sell + tr.strongSell}</span>
                </div>
              </div>
            )}
          </>
        );
      } },
    profile: { sub: info ? [info.profile.sector, info.profile.industry].filter(Boolean).join(" · ") : null,
      body: () => {
        if (!info) return <Empty>{infoErr ? `${t("detail.loadError")}: ${infoErr}` : t("detail.loading")}</Empty>;
        const p = info.profile;
        return (
          <>
            <KpiGrid>
              <Kpi label={t("detail.country")} value={<span style={{ fontFamily:"var(--font-sans)" }}>{p.country ?? "—"}</span>}/>
              <Kpi label={t("detail.employees")} value={fmtNum(p.employees, 0, loc)}/>
              <Kpi label={t("detail.type")} value={<span style={{ fontFamily:"var(--font-sans)" }}>{info.quoteType ?? "—"}</span>}/>
            </KpiGrid>
            {p.summary && <p style={{ margin:0, padding:"12px", fontSize:12, lineHeight:1.65, color:T.text2 }}>{p.summary}</p>}
            {p.website && /^https?:\/\//.test(p.website) && (
              <a href={p.website} target="_blank" rel="noopener noreferrer"
                style={{ display:"block", padding:"0 12px 12px", fontSize:12, color:"var(--accent)" }}>{p.website}</a>
            )}
          </>
        );
      } },
    news: { sub:t("detail.sub_news"),
      body: () => {
        if (!info) return <Empty>{infoErr ? `${t("detail.loadError")}: ${infoErr}` : t("detail.loading")}</Empty>;
        if (!info.news.length) return <Empty>{t("detail.noNews")}</Empty>;
        return info.news.map((n, k) => (
          <a key={k} href={n.link} target="_blank" rel="noopener noreferrer" className="detail-news"
            style={{ display:"block", padding:"9px 12px", borderBottom:`1px solid ${T.border2}`, textDecoration:"none" }}>
            <div style={{ fontSize:12.5, color:T.text1, lineHeight:1.4 }}>{n.title}</div>
            <div style={{ fontSize:10, color:T.text3, marginTop:3 }}>
              {n.publisher}{n.time ? ` · ${new Date(n.time).toLocaleString(loc, { dateStyle:"short", timeStyle:"short" })}` : ""}
            </div>
          </a>
        ));
      } },
  };
  const hidden = PANEL_IDS.filter(id => !layout.some(it => it.i === id));

  return (
    <div style={{ height:"100%", display:"flex", flexDirection:"column", background:T.bg, minWidth:0 }}>
      {/* ── Title bar (Trade-Pal detail head) ── */}
      <div style={{ display:"flex", alignItems:"center", gap:20, flexWrap:"wrap", padding:"16px 16px 14px",
        background:T.surface, borderBottom:"2px solid var(--fg-1)", flexShrink:0 }}>
        <button className="btn" onClick={onClose} title="Esc" style={{ padding:"5px 8px" }}>
          <ChevronLeft size={14}/>{t("detail.back")}
        </button>
        <div style={{ minWidth:0 }}>
          <div style={{ fontFamily:T.serif, fontSize:34, lineHeight:1.05, color:T.text1, letterSpacing:".01em" }}>
            {name}
            <span style={{ fontFamily:T.mono, fontSize:13, fontWeight:500, color:T.text2, letterSpacing:".06em", marginLeft:10 }}>{symbol}</span>
          </div>
          <div className="label" style={{ marginTop:5, fontSize:10 }}>
            {[info?.exchange, info?.profile?.sector, ccy].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div style={{ marginLeft:"auto", textAlign:"right" }}>
          <div style={{ fontFamily:T.serif, fontSize:32, color:T.text1, lineHeight:1 }}>{fmtMoney(price, ccy, loc)}</div>
          <div className="num" style={{ fontSize:12, color:signColor(dayChange), marginTop:4 }}>
            {fmtPct(dayChange, loc)} {t("detail.today")}
          </div>
        </div>
      </div>

      {/* ── Toolbar: views + panels ── */}
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 16px", background:T.surface,
        borderBottom:`1px solid ${T.border}`, flexShrink:0, position:"relative", zIndex:20 }}>
        <span className="label">{t("detail.view")}</span>
        <div style={{ position:"relative" }} onClick={e => e.stopPropagation()}>
          <button className="btn" onClick={() => setMenu(m => m === "views" ? null : "views")} style={{ minWidth:150, justifyContent:"space-between" }}>
            <span>{viewLabel(active)}{modified ? " •" : ""}</span><span style={{ color:T.text3 }}>▾</span>
          </button>
          {menu === "views" && (
            <div className="overlay-card" style={{ position:"absolute", top:"calc(100% + 4px)", left:0, width:260, zIndex:50, padding:"6px 0" }}>
              <div className="label" style={{ padding:"6px 12px 4px" }}>{t("detail.presets")}</div>
              {Object.keys(PRESETS).map(k => (
                <div key={k} style={{ display:"flex", alignItems:"center" }}>
                  <button className="menu-row" onClick={() => { selectView(`preset:${k}`); setMenu(null); }}
                    style={{ flex:1, fontWeight: active === `preset:${k}` ? 600 : 400 }}>
                    {t(`detail.preset_${k}`)}
                    {presetEdits[k] && <span style={{ fontSize:10, fontWeight:400, color:T.text3 }}>{t("detail.edited")}</span>}
                  </button>
                  {presetEdits[k] && (
                    <button className="menu-row" title={t("detail.resetPreset")} onClick={() => resetPreset(k)}
                      style={{ width:"auto", padding:"6px 10px" }}><RefreshCw size={12}/></button>
                  )}
                </div>
              ))}
              {Object.keys(views).length > 0 && <div className="label" style={{ padding:"10px 12px 4px" }}>{t("detail.ownViews")}</div>}
              {Object.keys(views).map(n => renaming === n ? (
                <input key={n} className="field" autoFocus defaultValue={n} style={{ margin:"2px 12px", width:"calc(100% - 24px)" }}
                  onKeyDown={e => { if (e.key === "Enter") { renameView(n, e.target.value); setRenaming(null); }
                                    if (e.key === "Escape") setRenaming(null); }}
                  onBlur={e => { renameView(n, e.target.value); setRenaming(null); }}/>
              ) : (
                <div key={n} style={{ display:"flex", alignItems:"center" }}>
                  <button className="menu-row" onClick={() => { selectView(n); setMenu(null); }}
                    style={{ flex:1, fontWeight: active === n ? 600 : 400 }}>{n}</button>
                  <button className="menu-row" title={t("detail.rename")} onClick={() => setRenaming(n)} style={{ width:"auto", padding:"6px 8px" }}>✎</button>
                  <button className="menu-row danger" title={t("detail.delete")} onClick={() => deleteView(n)} style={{ width:"auto", padding:"6px 10px" }}><X size={12}/></button>
                </div>
              ))}
              <div style={{ display:"flex", gap:0, padding:"8px 12px 4px", borderTop:`1px solid ${T.border2}`, marginTop:6 }}>
                <input className="field" placeholder={t("detail.saveAsPh")} value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { saveView(saveName); setSaveName(""); setMenu(null); } }}
                  style={{ flex:1, minWidth:0 }}/>
                <button className="btn primary" onClick={() => { saveView(saveName); setSaveName(""); setMenu(null); }}
                  style={{ marginLeft:-1 }}>{t("detail.save")}</button>
              </div>
            </div>
          )}
        </div>
        {modified && (
          <div className="btn-row">
            <button className="btn primary" onClick={saveActive} title={t("detail.saveActiveTitle", { name:viewLabel(active) })}>
              {t("detail.save")}
            </button>
            <button className="btn" onClick={() => selectView(active)} title={t("detail.resetTitle")} style={{ padding:"5px 8px" }}>
              <RefreshCw size={12}/>
            </button>
          </div>
        )}
        <div style={{ position:"relative" }} onClick={e => e.stopPropagation()}>
          <button className="btn" onClick={() => setMenu(m => m === "panels" ? null : "panels")} disabled={!hidden.length}>
            <Plus size={12}/>{t("detail.addPanel")}
          </button>
          {menu === "panels" && (
            <div className="overlay-card" style={{ position:"absolute", top:"calc(100% + 4px)", left:0, width:220, zIndex:50, padding:"6px 0" }}>
              {hidden.map(id => (
                <button key={id} className="menu-row" onClick={() => { addPanel(id); setMenu(null); }}>{t(`detail.p_${id}`)}</button>
              ))}
            </div>
          )}
        </div>
        <span style={{ marginLeft:"auto", fontSize:10, color:T.text3 }}>{t("detail.viewsHint")}</span>
        <button className="btn" onClick={() => setReload(r => r + 1)} title={t("detail.reload")} style={{ padding:"5px 8px" }}>
          <RefreshCw size={12}/>
        </button>
      </div>

      {/* ── Grid ── */}
      <div ref={gridRef} style={{ flex:1, overflow:"auto", minHeight:0 }}>
        {gridW > 0 && (
          <ReactGridLayout
            width={gridW}
            layout={layout.map(it => ({ ...it, minW:(MIN[it.i] ?? [3,3])[0], minH:(MIN[it.i] ?? [3,3])[1] }))}
            gridConfig={{ cols:COLS, rowHeight:ROW_H, margin:[1,1], containerPadding:[0,0] }}
            dragConfig={{ enabled:true, handle:".detail-drag", cancel:".detail-nodrag" }}
            resizeConfig={{ enabled:true, handles:["se"] }}
            compactor={verticalCompactor}
            positionStrategy={strategy}
            onLayoutChange={l => { if (!sameLayout(l, layout)) setLayout(l); }}
            className="detail-grid">
            {layout.map(it => (
              <div key={it.i}>
                <Panel title={it.i === "treemap" ? (contextTitle ?? t("detail.p_treemap"))
                  : it.i === "bars" ? `${contextTitle ?? t("detail.p_treemap")} · ${t("detail.barsSuffix")}`
                  : t(`detail.p_${it.i}`)} sub={panels[it.i].sub} scroll={panels[it.i].scroll !== false}
                  onRemove={() => removePanel(it.i)}>
                  {panels[it.i].body()}
                </Panel>
              </div>
            ))}
          </ReactGridLayout>
        )}
        {!layout.length && <Empty>{t("detail.emptyLayout")}</Empty>}
      </div>
    </div>
  );
}
