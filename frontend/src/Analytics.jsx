/**
 * Portfolio Analytics — Correlation · Monte Carlo · Rebalancing · Dividend Calendar
 */
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import * as d3 from "d3";

// Persistent UI settings store (survives ETF switches within session)
const _divCalSettings = { chartView: "calendar", fictValue: 10000, viewYear: new Date().getFullYear() };

const THEME = {
  bg: "#0d0e12", surface: "#13141a", surface2: "#1a1b23",
  border: "rgba(255,255,255,0.10)", border2: "rgba(255,255,255,0.06)",
  text1: "#f0f1f5", text2: "#b4bfcc", text3: "#8896a8",
  accent: "#3b82f6", green: "#4ade80", red: "#f87171", yellow: "#fbbf24",
  mono: "'JetBrains Mono',monospace", font: "'Syne',sans-serif",
};
const C = THEME;

const fmt$ = (v, dec=0) => v==null?"—":`$${Math.abs(v).toLocaleString("en-US",{minimumFractionDigits:dec,maximumFractionDigits:dec})}`;
const fmtPct = (v, dec=1) => v==null?"—":`${v>=0?"+":""}${v.toFixed(dec)}%`;
const BASE = "/api";

// ─────────────────────────────────────────────────────────────────────────────
// Shared section header
// ─────────────────────────────────────────────────────────────────────────────
function SectionHeader({ title, subtitle, action }) {
  return (
    <div style={{ display:"flex", alignItems:"center", padding:"14px 22px 10px", flexShrink:0 }}>
      <div>
        <div style={{ fontSize:15, fontWeight:700, color:C.text1 }}>{title}</div>
        {subtitle && <div style={{ fontSize:11, color:C.text3, marginTop:2 }}>{subtitle}</div>}
      </div>
      {action && <div style={{ marginLeft:"auto" }}>{action}</div>}
    </div>
  );
}

function Pill({ label, color=C.accent }) {
  return (
    <span style={{ padding:"2px 8px", borderRadius:20, fontSize:9, fontWeight:700,
      background:`${color}18`, color, border:`1px solid ${color}30`,
      textTransform:"uppercase", letterSpacing:"0.06em" }}>{label}</span>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. CORRELATION MATRIX
// ══════════════════════════════════════════════════════════════════════════════
function computeCorrelation(seriesA, seriesB) {
  // Align by date
  const mapB = Object.fromEntries(seriesB);
  const pairs = seriesA.filter(([d]) => mapB[d] != null).map(([d,a]) => [a, mapB[d]]);
  if (pairs.length < 10) return null;
  // Daily returns
  const retA = [], retB = [];
  for (let i = 1; i < pairs.length; i++) {
    const ra = (pairs[i][0] - pairs[i-1][0]) / pairs[i-1][0];
    const rb = (pairs[i][1] - pairs[i-1][1]) / pairs[i-1][1];
    if (isFinite(ra) && isFinite(rb)) { retA.push(ra); retB.push(rb); }
  }
  if (retA.length < 5) return null;
  const n = retA.length;
  const meanA = retA.reduce((s,v)=>s+v,0)/n;
  const meanB = retB.reduce((s,v)=>s+v,0)/n;
  let num=0, dA=0, dB=0;
  for (let i=0;i<n;i++) {
    const da=retA[i]-meanA, db=retB[i]-meanB;
    num+=da*db; dA+=da*da; dB+=db*db;
  }
  const denom = Math.sqrt(dA*dB);
  return denom===0 ? 0 : Math.min(1, Math.max(-1, num/denom));
}

function corrColor(r) {
  if (r == null) return "rgba(255,255,255,0.05)";
  if (r >= 0.7) return `rgba(248,113,113,${0.3+r*0.4})`; // red = high corr = bad
  if (r >= 0.3) return `rgba(251,191,36,${0.2+r*0.3})`;  // yellow = medium
  if (r >= 0)   return `rgba(74,222,128,${0.15+r*0.4})`; // green = low corr = good
  return `rgba(100,149,237,${0.15+Math.abs(r)*0.4})`;   // blue = negative
}

export function CorrelationMatrix({ allNodes, quotes, currency, rates }) {
  const [histData, setHistData]   = useState({});
  const [loading,  setLoading]    = useState(false);
  const [range,    setRange]      = useState("2y");
  const [err,      setErr]        = useState(null);
  const [hovered,  setHovered]    = useState(null); // [i, j]

  // Deduplicate symbols from nodes
  const symbols = useMemo(() =>
    [...new Set(allNodes.map(n => n.symbol))].sort().slice(0, 30),
    [allNodes]
  );

  const loadHistory = useCallback(async () => {
    if (!symbols.length) return;
    setLoading(true); setErr(null);
    try {
      const r = await fetch(`${BASE}/quotes/history-multi`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ symbols, range }),
      }).then(r=>r.json());
      setHistData(r.results || {});
    } catch(e) { setErr(e.message); }
    setLoading(false);
  }, [symbols, range]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Build correlation matrix
  const matrix = useMemo(() => {
    if (!Object.keys(histData).length) return null;
    return symbols.map((a,i) =>
      symbols.map((b,j) => {
        if (i === j) return 1;
        const sA = histData[a], sB = histData[b];
        if (!sA || !sB) return null;
        return computeCorrelation(sA, sB);
      })
    );
  }, [histData, symbols]);

  // Summary stats
  const avgCorr = useMemo(() => {
    if (!matrix) return null;
    const vals = [];
    matrix.forEach((row,i) => row.forEach((v,j) => { if (i!==j && v!=null) vals.push(v); }));
    return vals.length ? vals.reduce((s,v)=>s+v,0)/vals.length : null;
  }, [matrix]);

  const cellSize = Math.min(44, Math.floor(560 / Math.max(symbols.length, 1)));
  const labelW   = 70;

  if (!symbols.length) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", color:C.text3 }}>
      No positions to correlate.
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      <SectionHeader
        title="Correlation Matrix"
        subtitle={`Daily returns correlation · ${symbols.length} positions · ${range === "2y" ? "2 years" : "1 year"} of history`}
        action={
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {/* Range toggle */}
            {["1y","2y"].map(r => (
              <button key={r} onClick={()=>setRange(r)} style={{
                padding:"4px 12px", borderRadius:7, border:`1px solid ${range===r?C.accent:C.border}`,
                background:range===r?"rgba(59,130,246,0.15)":"transparent",
                color:range===r?C.accent:C.text3, fontSize:11, fontWeight:700,
                cursor:"pointer", fontFamily:"inherit", transition:"all 0.12s",
              }}>{r === "1y" ? "1 Year" : "2 Years"}</button>
            ))}
            <button onClick={loadHistory} disabled={loading} style={{
              display:"flex", alignItems:"center", gap:5, padding:"4px 12px",
              borderRadius:7, border:`1px solid ${C.border}`, background:"transparent",
              color:C.text2, fontSize:11, cursor:"pointer", fontFamily:"inherit",
            }}>
              {loading ? "⟳" : "↻"} Refresh
            </button>
          </div>
        }
      />

      {/* Legend */}
      <div style={{ display:"flex", alignItems:"center", gap:16, padding:"0 22px 12px", flexShrink:0 }}>
        {[
          { color:"rgba(74,222,128,0.5)",  label:"Low (< 0.3) — diversified" },
          { color:"rgba(251,191,36,0.5)",  label:"Medium (0.3–0.7)" },
          { color:"rgba(248,113,113,0.7)", label:"High (> 0.7) — correlated" },
          { color:"rgba(100,149,237,0.5)", label:"Negative — inverse" },
        ].map(({color,label}) => (
          <div key={label} style={{ display:"flex", alignItems:"center", gap:5 }}>
            <div style={{ width:12, height:12, borderRadius:3, background:color }}/>
            <span style={{ fontSize:10, color:C.text3 }}>{label}</span>
          </div>
        ))}
        {avgCorr != null && (
          <div style={{ marginLeft:"auto", fontSize:11, color:C.text2 }}>
            Avg. correlation: <strong style={{ color:avgCorr > 0.5 ? C.red : avgCorr > 0.3 ? C.yellow : C.green }}>
              {avgCorr.toFixed(2)}
            </strong>
          </div>
        )}
      </div>

      {err && <div style={{ padding:"8px 22px", color:C.red, fontSize:12 }}>⚠ {err}</div>}

      {loading && (
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center",
          color:C.text3, fontSize:13 }}>
          Loading history for {symbols.length} symbols…
        </div>
      )}

      {!loading && matrix && (
        <div style={{ flex:1, overflowAuto:"auto", padding:"0 22px 22px", overflowY:"auto" }}>
          <div style={{ display:"flex" }}>
            {/* Y-axis labels */}
            <div style={{ display:"flex", flexDirection:"column", paddingTop:cellSize }}>
              {symbols.map((sym,i) => (
                <div key={sym} style={{ height:cellSize, display:"flex", alignItems:"center",
                  paddingRight:6, justifyContent:"flex-end", width:labelW }}>
                  <span style={{ fontFamily:C.mono, fontSize:Math.min(11,cellSize*0.4),
                    color:hovered?.[0]===i||hovered?.[1]===i ? C.accent : C.text2,
                    fontWeight:hovered?.[0]===i||hovered?.[1]===i ? 700 : 500,
                    whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
                    maxWidth:labelW-8, transition:"color 0.1s" }}>{sym}</span>
                </div>
              ))}
            </div>
            {/* Grid */}
            <div>
              {/* X-axis labels */}
              <div style={{ display:"flex", height:cellSize, alignItems:"flex-end", paddingBottom:4 }}>
                {symbols.map((sym,j) => (
                  <div key={sym} style={{ width:cellSize, display:"flex", justifyContent:"center" }}>
                    <span style={{
                      fontFamily:C.mono, fontSize:Math.min(10,cellSize*0.35),
                      color:hovered?.[0]===j||hovered?.[1]===j ? C.accent : C.text2,
                      fontWeight:hovered?.[0]===j||hovered?.[1]===j ? 700 : 500,
                      transform:"rotate(-45deg)", transformOrigin:"bottom center",
                      display:"block", whiteSpace:"nowrap", transition:"color 0.1s",
                    }}>{sym}</span>
                  </div>
                ))}
              </div>
              {/* Cells */}
              {matrix.map((row,i) => (
                <div key={i} style={{ display:"flex" }}>
                  {row.map((v,j) => {
                    const isHov = hovered?.[0]===i && hovered?.[1]===j;
                    const isRowCol = hovered && (hovered[0]===i || hovered[1]===i || hovered[0]===j || hovered[1]===j);
                    return (
                      <div key={j}
                        onMouseEnter={()=>setHovered([i,j])}
                        onMouseLeave={()=>setHovered(null)}
                        style={{
                          width:cellSize, height:cellSize,
                          background:i===j?"rgba(255,255,255,0.08)":corrColor(v),
                          border:"1px solid rgba(0,0,0,0.3)",
                          display:"flex", alignItems:"center", justifyContent:"center",
                          cursor:"default", transition:"all 0.08s",
                          outline:isHov?"2px solid rgba(255,255,255,0.5)":undefined,
                          opacity:hovered&&!isRowCol&&!isHov ? 0.4 : 1,
                        }}>
                        {v != null && cellSize >= 30 && (
                          <span style={{ fontFamily:C.mono, fontSize:Math.min(9, cellSize*0.28),
                            color:"rgba(255,255,255,0.9)", fontWeight:700 }}>
                            {i===j ? "1" : v.toFixed(2)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Hover detail */}
          {hovered && hovered[0] !== hovered[1] && (
            <div style={{ marginTop:16, padding:"10px 14px", borderRadius:10,
              background:C.surface2, border:`1px solid ${C.border}`,
              display:"inline-flex", alignItems:"center", gap:12 }}>
              <span style={{ fontFamily:C.mono, fontWeight:700, color:C.accent }}>
                {symbols[hovered[0]]} × {symbols[hovered[1]]}
              </span>
              <span style={{ color:C.text3, fontSize:11 }}>Pearson r =</span>
              <span style={{ fontFamily:C.mono, fontWeight:700, fontSize:15,
                color:matrix[hovered[0]][hovered[1]] > 0.7 ? C.red
                     : matrix[hovered[0]][hovered[1]] > 0.3 ? C.yellow : C.green }}>
                {matrix[hovered[0]][hovered[1]]?.toFixed(3) ?? "—"}
              </span>
              <span style={{ fontSize:10, color:C.text3 }}>
                {matrix[hovered[0]][hovered[1]] > 0.8 ? "Very high — minimal diversification benefit"
                 : matrix[hovered[0]][hovered[1]] > 0.6 ? "High — moderate diversification"
                 : matrix[hovered[0]][hovered[1]] > 0.3 ? "Medium — reasonable diversification"
                 : matrix[hovered[0]][hovered[1]] > 0 ? "Low — good diversification"
                 : "Negative — strong hedge"}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. MONTE CARLO SIMULATION
// ══════════════════════════════════════════════════════════════════════════════
// Uses parametric approach (μ, σ from historical returns) + geometric Brownian motion
// Includes: DRIP, inflation adjustment, capital gains & dividend taxes

function runMonteCarlo({
  initialValue,    // current portfolio value in USD
  annualDivYield,  // weighted average dividend yield (0–1)
  years,           // simulation horizon
  nSims,           // number of simulations
  monthlyAddition, // monthly new investment in USD
  // Parameters estimated from historical data
  annualMu,        // expected annual return (total) e.g. 0.10
  annualSigma,     // annual volatility e.g. 0.20
  // Settings
  drip,            // reinvest dividends
  inflation,       // annual inflation rate e.g. 0.02
  taxRate,         // capital gains + dividend tax rate e.g. 0.25
}) {
  const dt     = 1/12;  // monthly steps
  const steps  = years * 12;
  const muM    = (annualMu  - 0.5 * annualSigma**2) * dt;
  const sigM   = annualSigma * Math.sqrt(dt);
  const divM   = annualDivYield / 12;  // monthly div yield
  const inflM  = inflation / 12;
  const taxDiv = taxRate;
  const taxCG  = taxRate;

  // Box-Muller normal random
  const randn = () => {
    let u=0, v=0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2*Math.log(u)) * Math.cos(2*Math.PI*v);
  };

  const percentiles = [5, 10, 25, 50, 75, 90, 95];
  // Store final values per sim for percentile calc, and track paths for p10/50/90
  const paths = { p10:[], p25:[], p50:[], p75:[], p90:[] };
  const finalVals = [];
  const allPaths  = [];

  for (let s = 0; s < nSims; s++) {
    let V    = initialValue;
    let cost = initialValue; // cost basis for tax calculation
    const path = [V];

    for (let t = 1; t <= steps; t++) {
      // Monthly addition (before-tax, new cost basis)
      V    += monthlyAddition;
      cost += monthlyAddition;

      // Price return
      const r = Math.exp(muM + sigM * randn()) - 1;
      const priceGain = V * r;
      V += priceGain;

      // Dividend income
      const divIncome = V * divM;
      const divAfterTax = divIncome * (1 - taxDiv);

      if (drip) {
        V += divAfterTax; // reinvest net dividend
        cost += divAfterTax; // new cost basis
      } else {
        // Take as cash — subtract from portfolio value but add back after-tax cash
        // (simplified: treat as separate cash flow, not tracked here)
      }
      path.push(V);
    }

    // Apply capital gains tax on final profit above cost basis
    const cgTax = Math.max(0, V - cost) * taxCG;
    const Vnet  = V - cgTax;

    // Inflation-adjust
    const real = Vnet / Math.pow(1 + inflation, years);

    finalVals.push(real);
    allPaths.push(path);
  }

  // Sort for percentiles
  finalVals.sort((a,b) => a-b);
  const pctVal = (p) => finalVals[Math.floor((p/100) * nSims)] ?? finalVals[finalVals.length-1];

  // Extract representative paths
  const sortedIdx = allPaths.map((_,i)=>i).sort((a,b)=>finalVals[a]-finalVals[b]);

  const getPath = (pct) => {
    const idx = sortedIdx[Math.floor((pct/100) * nSims)];
    return allPaths[idx] ?? [];
  };

  // Monthly labels for X axis
  const labels = Array.from({length:steps+1}, (_,i) => {
    const d = new Date();
    d.setMonth(d.getMonth() + i);
    return d.getFullYear() + (i%12===0 ? ` (Y${Math.floor(i/12)})` : "");
  });

  return {
    finalVals,
    percentileValues: Object.fromEntries(percentiles.map(p => [p, pctVal(p)])),
    p10Path: getPath(10),
    p25Path: getPath(25),
    p50Path: getPath(50),
    p75Path: getPath(75),
    p90Path: getPath(90),
    labels,
    nSims,
    steps,
  };
}

// Swiss tax constants
const CH_VERRECHNUNGSSTEUER = 0.35; // 35% withholding on dividends
const CH_EFFECTIVE_DIV_TAX  = 0.00; // Fully refundable if declared in tax return (Privatanleger)
const CH_CG_TAX             = 0.00; // No capital gains tax for private investors
const CH_WEALTH_TAX_RATE    = 0.002; // ~0.2% p.a. on assets (Vermögenssteuer, canton average)

export function MonteCarlo({ allNodes, quotes, rates, divCache, currency = "USD" }) {
  const rate = rates[currency] ?? 1;
  const cSym = { USD:"$", EUR:"€", CHF:"Fr.", GBP:"£" }[currency] ?? "$";
  const fmtC = (v, dec=0) => v==null?"—":`${cSym}${Math.abs(v*rate).toLocaleString("en-US",{minimumFractionDigits:dec,maximumFractionDigits:dec})}`;

  // Derive current portfolio value
  const totalValueUSD = useMemo(() =>
    allNodes.reduce((s,n) => s + (n.valueUSD??0), 0),
    [allNodes]
  );

  // Estimate portfolio mu+sigma from available quote data
  const portfolioStats = useMemo(() => {
    if (!allNodes.length || totalValueUSD <= 0) return { mu:0.09, sigma:0.15 };
    // Weighted average of individual 2Y returns and volatilities
    // Use 2Y change as proxy for annual return; changePct as vol proxy
    let wMu=0, wSig=0, wTot=0;
    for (const n of allNodes) {
      const q = quotes[n.symbol];
      if (!q || !n.valueUSD) continue;
      const w = n.valueUSD / totalValueUSD;
      // Annualised return from 2Y ref
      const ref2y = q.refs?.["2Y"];
      const annRet = ref2y && ref2y>0 ? ((q.price/ref2y)**0.5 - 1) : 0.09;
      // Annualised vol estimate from daily changePct
      const annSig = Math.abs(q.changePct ?? 1) / 100 * Math.sqrt(252) * 0.5 || 0.18;
      wMu  += w * Math.max(-0.3, Math.min(0.5, annRet));
      wSig += w * Math.max(0.05, Math.min(0.8, annSig));
      wTot += w;
    }
    return {
      mu:    wTot > 0 ? wMu/wTot  : 0.09,
      sigma: wTot > 0 ? wSig/wTot : 0.18,
    };
  }, [allNodes, quotes, totalValueUSD]);

  // Weighted average dividend yield
  const divYield = useMemo(() => {
    if (!allNodes.length || totalValueUSD <= 0) return 0.015;
    let wDiv=0, wTot=0;
    for (const n of allNodes) {
      const d = divCache?.[n.symbol];
      if (!n.valueUSD) continue;
      const w = n.valueUSD / totalValueUSD;
      wDiv += w * ((d?.yieldPct ?? 1.5) / 100);
      wTot += w;
    }
    return wTot > 0 ? wDiv/wTot : 0.015;
  }, [allNodes, divCache, totalValueUSD]);

  // Simulation parameters
  const [years,      setYears]      = useState(10);
  const [monthly,    setMonthly]    = useState(500);
  const [inflation,  setInflation]  = useState(2.5);
  const [taxMode,    setTaxMode]    = useState("ch_private"); // ch_private|ch_declared|custom
  const [taxRate,    setTaxRate]    = useState(0); // custom only
  const [drip,       setDrip]       = useState(true);
  const [nSims,      setNSims]      = useState(500);
  const [result,     setResult]     = useState(null);
  const [running,    setRunning]    = useState(false);
  const svgRef = useRef(null);

  const run = useCallback(() => {
    if (!totalValueUSD) return;
    setRunning(true);
    setTimeout(() => {
      // Determine effective tax rates based on mode
      let effectiveDivTax = 0, effectiveCGTax = 0, wealthTaxAnnual = 0;
      if (taxMode === "ch_private") {
        // CH: No CG tax, dividends: 35% Verrechnungssteuer, refundable → effectively 0
        effectiveDivTax = CH_EFFECTIVE_DIV_TAX;
        effectiveCGTax  = CH_CG_TAX;
        wealthTaxAnnual = CH_WEALTH_TAX_RATE;
      } else if (taxMode === "ch_declared") {
        // CH: Dividends taxed as income (~30% marginal + 35% VSt already deducted)
        // Net additional burden ~15% after refund
        effectiveDivTax = 0.15;
        effectiveCGTax  = CH_CG_TAX;
        wealthTaxAnnual = CH_WEALTH_TAX_RATE;
      } else {
        effectiveDivTax = taxRate / 100;
        effectiveCGTax  = taxRate / 100;
      }
      const r = runMonteCarlo({
        initialValue:  totalValueUSD,
        annualDivYield:divYield,
        years,
        nSims,
        monthlyAddition: monthly,
        annualMu:   portfolioStats.mu - wealthTaxAnnual, // wealth tax reduces effective return
        annualSigma:portfolioStats.sigma,
        drip,
        inflation:  inflation / 100,
        taxRate:    effectiveDivTax, // used for div tax; CG applied at end separately
      });
      setResult(r);
      setRunning(false);
    }, 10);
  }, [totalValueUSD, divYield, years, nSims, monthly, portfolioStats, drip, inflation, taxRate]);

  // Draw chart when result changes
  useEffect(() => {
    if (!result || !svgRef.current) return;
    const svg    = d3.select(svgRef.current);
    const { width, height } = svgRef.current.getBoundingClientRect();
    const m      = { top:20, right:60, bottom:36, left:72 };
    const W      = width  - m.left - m.right;
    const H      = height - m.top  - m.bottom;

    svg.selectAll("*").remove();
    const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

    const allVals = [
      ...result.p10Path, ...result.p25Path,
      ...result.p50Path, ...result.p75Path, ...result.p90Path,
    ].filter(v => v != null && isFinite(v));

    const xScale = d3.scaleLinear([0, result.steps], [0, W]);
    const yScale = d3.scaleLinear([
      Math.min(0, d3.min(allVals)),
      d3.max(allVals) * 1.05,
    ], [H, 0]);

    const fmtY = v => v >= 1e6 ? `$${(v/1e6).toFixed(1)}M`
                    : v >= 1e3 ? `$${(v/1e3).toFixed(0)}K` : `$${v.toFixed(0)}`;

    // Grid
    g.append("g")
      .attr("class", "grid")
      .call(d3.axisLeft(yScale).ticks(5).tickFormat("").tickSize(-W))
      .selectAll("line").attr("stroke","rgba(255,255,255,0.05)");
    g.select(".grid .domain").remove();

    // Shaded confidence band (p25–p75)
    const area2575 = d3.area()
      .x((_,i) => xScale(i))
      .y0(d => yScale(result.p25Path[d] ?? 0))
      .y1(d => yScale(result.p75Path[d] ?? 0))
      .defined((_,i) => result.p25Path[i] != null && result.p75Path[i] != null)
      .curve(d3.curveBasis);

    g.append("path")
      .datum(d3.range(result.steps+1))
      .attr("d", area2575)
      .attr("fill", "rgba(59,130,246,0.12)");

    // Shaded p10–p90
    const area1090 = d3.area()
      .x((_,i) => xScale(i))
      .y0(d => yScale(result.p10Path[d] ?? 0))
      .y1(d => yScale(result.p90Path[d] ?? 0))
      .defined((_,i) => result.p10Path[i] != null && result.p90Path[i] != null)
      .curve(d3.curveBasis);

    g.append("path")
      .datum(d3.range(result.steps+1))
      .attr("d", area1090)
      .attr("fill", "rgba(59,130,246,0.06)");

    // Lines
    const lineFn = d3.line()
      .x((_,i) => xScale(i))
      .y(d => yScale(d ?? 0))
      .defined(d => d != null && isFinite(d))
      .curve(d3.curveBasis);

    const lineConfigs = [
      { path:result.p10Path, color:"rgba(248,113,113,0.5)", dash:"4,3", label:"P10" },
      { path:result.p25Path, color:"rgba(251,191,36,0.6)",  dash:"",    label:"P25" },
      { path:result.p50Path, color:"rgba(74,222,128,0.9)",  dash:"",    label:"P50" },
      { path:result.p75Path, color:"rgba(96,165,250,0.6)",  dash:"",    label:"P75" },
      { path:result.p90Path, color:"rgba(167,139,250,0.5)", dash:"4,3", label:"P90" },
    ];

    lineConfigs.forEach(({path,color,dash,label}) => {
      g.append("path")
        .datum(path)
        .attr("d", lineFn)
        .attr("fill","none")
        .attr("stroke", color)
        .attr("stroke-width", label==="P50" ? 2.5 : 1.5)
        .attr("stroke-dasharray", dash);

      // End label
      const lastVal = path[path.length-1];
      if (lastVal != null) {
        g.append("text")
          .attr("x", W+6).attr("y", yScale(lastVal)+4)
          .attr("fill", color).attr("font-size", 9)
          .attr("font-family", "'JetBrains Mono',monospace")
          .text(label);
      }
    });

    // Initial value horizontal line
    g.append("line")
      .attr("x1", 0).attr("x2", W)
      .attr("y1", yScale(totalValueUSD)).attr("y2", yScale(totalValueUSD))
      .attr("stroke","rgba(255,255,255,0.15)").attr("stroke-dasharray","6,4");

    // Axes
    g.append("g").attr("transform",`translate(0,${H})`)
      .call(d3.axisBottom(xScale).ticks(years).tickFormat(i => {
        const yr = Math.round(i/12);
        return yr > 0 && i%(12)===0 ? `Y${yr}` : "";
      }))
      .selectAll("text").attr("fill",C.text3).attr("font-size",9);

    g.append("g")
      .call(d3.axisLeft(yScale).ticks(5).tickFormat(fmtY))
      .selectAll("text").attr("fill",C.text3).attr("font-size",9);

    g.selectAll(".domain").attr("stroke","rgba(255,255,255,0.1)");
    g.selectAll(".tick line").attr("stroke","rgba(255,255,255,0.1)");

  }, [result, totalValueUSD, years]);

  const inp = {
    background:"rgba(255,255,255,0.05)", border:`1px solid ${C.border}`,
    borderRadius:7, color:C.text1, padding:"5px 10px", fontSize:12,
    fontFamily:C.mono, outline:"none", width:"100%",
  };
  const lbl = { fontSize:10, color:C.text3, marginBottom:4, display:"block" };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      <SectionHeader
        title="Monte Carlo Simulation"
        subtitle={`${nSims} scenarios · Real (inflation-adjusted) portfolio value after taxes`}
      />

      <div style={{ display:"flex", flex:1, overflow:"hidden", gap:0 }}>
        {/* Controls panel */}
        <div style={{ width:210, flexShrink:0, padding:"0 16px", overflowY:"auto",
          borderRight:`1px solid ${C.border2}` }}>

          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:10, color:C.text3, fontWeight:700, textTransform:"uppercase",
              letterSpacing:"0.08em", marginBottom:10 }}>Portfolio</div>
            <div style={{ padding:"10px 12px", borderRadius:9, background:C.surface2,
              border:`1px solid ${C.border}` }}>
              <div style={{ fontSize:10, color:C.text3 }}>Starting Value</div>
              <div style={{ fontFamily:C.mono, fontSize:14, fontWeight:700, color:C.text1, marginTop:2 }}>
                {fmtC(totalValueUSD)}
              </div>
              <div style={{ fontSize:10, color:C.text3, marginTop:8 }}>Est. Annual Return (μ)</div>
              <div style={{ fontFamily:C.mono, fontSize:12, color:C.accent, marginTop:1 }}>
                {fmtPct(portfolioStats.mu*100)}
              </div>
              <div style={{ fontSize:10, color:C.text3, marginTop:6 }}>Volatility (σ)</div>
              <div style={{ fontFamily:C.mono, fontSize:12, color:C.yellow, marginTop:1 }}>
                {(portfolioStats.sigma*100).toFixed(1)}%
              </div>
              <div style={{ fontSize:10, color:C.text3, marginTop:6 }}>Avg Div. Yield</div>
              <div style={{ fontFamily:C.mono, fontSize:12, color:"#fbbf24", marginTop:1 }}>
                {(divYield*100).toFixed(2)}%
              </div>
            </div>
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <div>
              <label style={lbl}>Horizon: {years} years</label>
              <input type="range" min={3} max={40} value={years}
                onChange={e=>setYears(+e.target.value)}
                style={{ width:"100%", accentColor:C.accent }}/>
            </div>
            <div>
              <label style={lbl}>Monthly Addition: ${monthly}</label>
              <input type="range" min={0} max={5000} step={100} value={monthly}
                onChange={e=>setMonthly(+e.target.value)}
                style={{ width:"100%", accentColor:C.accent }}/>
            </div>
            <div>
              <label style={lbl}>Inflation: {inflation}%</label>
              <input type="range" min={0} max={8} step={0.5} value={inflation}
                onChange={e=>setInflation(+e.target.value)}
                style={{ width:"100%", accentColor:C.accent }}/>
            </div>
            {/* Swiss tax mode */}
            <div>
              <label style={lbl}>Steuermodell</label>
              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                {[
                  { key:"ch_private",  label:"🇨🇭 CH Privatanleger",   sub:"0% KG-Steuer · Verrechnungssteuer zurückgefordert" },
                  { key:"ch_declared", label:"🇨🇭 CH Einkommenssteuer",  sub:"Dividenden als Einkommen (~15% Netto)" },
                  { key:"custom",      label:"Benutzerdefiniert",        sub:`${taxRate}% auf Gewinne und Dividenden` },
                ].map(m => (
                  <button key={m.key} onClick={()=>setTaxMode(m.key)} style={{
                    padding:"5px 8px", borderRadius:6, border:`1px solid ${taxMode===m.key?C.accent:C.border}`,
                    background:taxMode===m.key?"rgba(59,130,246,0.12)":"rgba(255,255,255,0.02)",
                    color:taxMode===m.key?C.text1:C.text3,
                    fontFamily:"inherit", cursor:"pointer", textAlign:"left",
                  }}>
                    <div style={{ fontSize:10, fontWeight:700, color:taxMode===m.key?C.accent:C.text2 }}>{m.label}</div>
                    <div style={{ fontSize:8, marginTop:2, color:C.text3 }}>{m.sub}</div>
                  </button>
                ))}
              </div>
              {taxMode === "custom" && (
                <div style={{ marginTop:8 }}>
                  <label style={lbl}>Steuersatz: {taxRate}%</label>
                  <input type="range" min={0} max={50} step={1} value={taxRate}
                    onChange={e=>setTaxRate(+e.target.value)}
                    style={{ width:"100%", accentColor:C.accent }}/>
                </div>
              )}
              {taxMode === "ch_private" && (
                <div style={{ marginTop:6, padding:"6px 8px", borderRadius:6,
                  background:"rgba(74,222,128,0.08)", border:"1px solid rgba(74,222,128,0.2)" }}>
                  <div style={{ fontSize:8, color:C.green, lineHeight:1.5 }}>
                    ✓ Keine Kapitalgewinnsteuer (Privatanleger)<br/>
                    ✓ Verrechnungssteuer (35%) via Steuererklärung zurückgefordert<br/>
                    + Vermögenssteuer ~0.2% p.a. eingerechnet
                  </div>
                </div>
              )}
            </div>
            <div>
              <label style={lbl}>Simulations: {nSims}</label>
              <input type="range" min={100} max={2000} step={100} value={nSims}
                onChange={e=>setNSims(+e.target.value)}
                style={{ width:"100%", accentColor:C.accent }}/>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <input type="checkbox" id="drip" checked={drip}
                onChange={e=>setDrip(e.target.checked)}
                style={{ accentColor:C.accent }}/>
              <label htmlFor="drip" style={{ fontSize:11, color:C.text2, cursor:"pointer" }}>
                DRIP (reinvest dividends)
              </label>
            </div>
          </div>

          <button onClick={run} disabled={running || !totalValueUSD} style={{
            width:"100%", marginTop:16, padding:"9px 0", borderRadius:9,
            border:"none", background:running?"rgba(59,130,246,0.3)":"rgba(59,130,246,0.85)",
            color:"#fff", fontSize:12, fontWeight:700, cursor:running?"wait":"pointer",
            fontFamily:"inherit", transition:"all 0.15s",
          }}>
            {running ? "⟳ Running…" : "▶  Run Simulation"}
          </button>
        </div>

        {/* Chart + results */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
          {!result ? (
            <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center",
              flexDirection:"column", gap:10, color:C.text3 }}>
              <div style={{ fontSize:32, opacity:0.3 }}>📈</div>
              <div style={{ fontSize:13 }}>Configure parameters and run the simulation</div>
            </div>
          ) : (
            <>
              {/* Chart */}
              <div style={{ flex:1, minHeight:0, padding:"8px 12px 0" }}>
                <svg ref={svgRef} width="100%" height="100%"/>
              </div>

              {/* Percentile table */}
              <div style={{ padding:"0 20px 16px", flexShrink:0 }}>
                <div style={{ fontSize:10, color:C.text3, textTransform:"uppercase",
                  letterSpacing:"0.07em", marginBottom:8, fontWeight:700 }}>
                  After {years} Years (Real, After-Tax)
                </div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {[
                    { p:10, label:"Bear",    color:C.red    },
                    { p:25, label:"Low",     color:C.yellow },
                    { p:50, label:"Median",  color:C.green  },
                    { p:75, label:"Good",    color:"#60a5fa"},
                    { p:90, label:"Bull",    color:"#a78bfa"},
                  ].map(({p,label,color}) => {
                    const v = result.percentileValues[p];
                    const mult = totalValueUSD > 0 ? v/totalValueUSD : 0;
                    return (
                      <div key={p} style={{ padding:"8px 12px", borderRadius:9,
                        background:`${color}0f`, border:`1px solid ${color}30`,
                        flex:"1 1 0", minWidth:80, textAlign:"center" }}>
                        <div style={{ fontSize:9, color, fontWeight:700, textTransform:"uppercase",
                          letterSpacing:"0.06em" }}>{label} P{p}</div>
                        <div style={{ fontFamily:C.mono, fontSize:13, fontWeight:700,
                          color:C.text1, marginTop:3 }}>{fmtC(v)}</div>
                        <div style={{ fontSize:9, color, marginTop:2 }}>×{mult.toFixed(1)}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop:8, fontSize:10, color:C.text3, lineHeight:1.6 }}>
                  ⚠ Simulation basiert auf historischen Schätzungen und normalverteilten Renditen.
                  Kein Sequenzrisiko, Fat Tails oder Black-Swan-Events berücksichtigt.
                  CH Privatanleger: keine Kapitalgewinnsteuer · Verrechnungssteuer anrechenbar ·
                  Vermögenssteuer ~0.2% p.a. reduziert effektive Rendite.
                  Keine Anlageberatung.
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. REBALANCING ASSISTANT  (with auto-sector, donut charts, drift highlight)
// ══════════════════════════════════════════════════════════════════════════════

// Sector lookup via quote metadata + heuristic fallback
function inferSector(symbol, quoteData) {
  // quoteData may have a sector field from Yahoo (not always available in our batch endpoint)
  // We use a broad symbol-pattern heuristic as fallback
  if (quoteData?.sector) return quoteData.sector;
  const s = symbol.toUpperCase();
  if (/^(AAPL|MSFT|NVDA|AMD|INTC|QCOM|AVGO|TSM|ASML|TXN|AMAT|LRCX|KLAC|MU|STX|WDC|CSCO|ORCL|SAP|CRM|ADBE|NOW|SNOW|DDOG|ZS|CRWD|PANW|S|FTNT|OKTA|PLTR|ANET|NET|VCLT|VGT|SOXX|SMH|XLK|QQQ|ARKK|SOXL|TQQQ)$/.test(s)) return 'Technology';
  if (/^(JNJ|PFE|MRK|ABBV|LLY|BMY|AMGN|GILD|BIIB|REGN|VRTX|ISRG|MDT|SYK|BSX|ABT|ZBH|BDX|EW|IQV|XBI|IBB|ARKG)$/.test(s)) return 'Healthcare';
  if (/^(JPM|BAC|WFC|GS|MS|BLK|AXP|V|MA|PYPL|SQ|SCHW|C|USB|PNC|TFC|COF|DFS|ALLY|SOFI|XLF|KBE|KRE|IYF)$/.test(s)) return 'Finance';
  if (/^(XOM|CVX|COP|EOG|PXD|DVN|MPC|VLO|PSX|OXY|SLB|HAL|BKR|FANG|HES|XLE|AMLP|MLPA|VDE|IYE)$/.test(s)) return 'Energy';
  if (/^(AMZN|TSLA|HD|LOW|TGT|WMT|COST|MCD|SBUX|NKE|LULU|YUM|CMG|DRI|BKNG|MAR|HLT|CCL|RCL|NCLH|XLY|XLP|VCR|VDC)$/.test(s)) return 'Consumer';
  if (/^(GE|HON|MMM|CAT|DE|EMR|ETN|ROK|PH|ITW|IR|XYL|FAST|GWW|VRSK|ROP|CARR|OTIS|LMT|RTX|GD|NOC|BA|XLI|VIS)$/.test(s)) return 'Industrials';
  if (/^(BHP|RIO|FCX|NEM|AA|CLF|NUE|STLD|X|MT|APD|LIN|ECL|SHW|PPG|DD|LYB|XLB|VAW|GDX|GDXJ)$/.test(s)) return 'Materials';
  if (/^(NEE|DUK|SO|D|AEP|EXC|XEL|WEC|ES|PPL|ETR|FE|EIX|PEG|CMS|NRG|AES|PCG|XLU|VPU|ICLN)$/.test(s)) return 'Utilities';
  if (/^(AMT|PLD|CCI|EQIX|PSA|SPG|O|VICI|WY|AVB|EQR|DRE|IRM|VNQ|XLRE|REM|REIT)$/.test(s)) return 'Real Estate';
  if (/^(SPY|IVV|VOO|SCHB|ITOT|VTI|SCHD|SCHY|DGRO|DVY|SDY|HDV|VIG|NOBL|DIA|IJR|IJH|MDY|RSP|EQL)$/.test(s)) return 'ETF';
  if (/^(AGG|BND|TLT|IEF|SHY|LQD|HYG|JNK|MBB|TIP|SCHZ|VCIT|VCLT|EMB|BNDX|IAGG|AGGG)$/.test(s)) return 'Bonds';
  if (/\.(DE|SW|L|PA|AS|MI|BR|LS|VI)$/.test(s)) return 'International';
  return 'Other';
}

// Simple SVG Donut Chart component
function DonutChart({ data, size=90, hole=0.58, title }) {
  // data = [{label, value, color}]
  const total = data.reduce((s,d)=>s+d.value,0);
  if (total <= 0) return null;
  const r = size/2; const cx=r; const cy=r;
  const holeR = r * hole;
  let angle = -Math.PI/2;
  const slices = data.map(d => {
    const frac = d.value / total;
    const start = angle;
    angle += frac * 2 * Math.PI;
    return { ...d, start, end: angle, frac };
  });

  const arc = (cx,cy,r,startA,endA) => {
    const x1=cx+r*Math.cos(startA), y1=cy+r*Math.sin(startA);
    const x2=cx+r*Math.cos(endA),   y2=cy+r*Math.sin(endA);
    const large = endA-startA > Math.PI ? 1:0;
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
  };

  const [hov, setHov] = useState(null);

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
      {title && <div style={{fontSize:9,color:C.text3,textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:700}}>{title}</div>}
      <div style={{position:'relative',width:size,height:size}}>
        <svg width={size} height={size} style={{overflow:'visible'}}>
          {slices.map((s,i) => (
            <path key={i}
              d={arc(cx,cy,r-1,s.start,s.end)}
              fill={s.color}
              opacity={hov===null||hov===i ? 1 : 0.4}
              style={{cursor:'pointer',transition:'opacity 0.15s'}}
              onMouseEnter={()=>setHov(i)}
              onMouseLeave={()=>setHov(null)}
            />
          ))}
          {/* Hole */}
          <circle cx={cx} cy={cy} r={holeR} fill={C.surface2}/>
          {/* Center label */}
          <text x={cx} y={cy-4} textAnchor="middle" fill={C.text1}
            style={{fontSize:11,fontWeight:700,fontFamily:C.mono}}>
            {hov!==null ? `${(slices[hov].frac*100).toFixed(0)}%` : `${data.length}`}
          </text>
          <text x={cx} y={cy+8} textAnchor="middle" fill={C.text3}
            style={{fontSize:7,fontFamily:C.font}}>
            {hov!==null ? slices[hov].label.slice(0,8) : 'items'}
          </text>
        </svg>
      </div>
      {/* Legend */}
      <div style={{display:'flex',flexDirection:'column',gap:2,width:'100%',maxWidth:120}}>
        {slices.slice(0,6).map((s,i) => (
          <div key={i} style={{display:'flex',alignItems:'center',gap:4,
            opacity:hov===null||hov===i?1:0.4,transition:'opacity 0.15s',cursor:'pointer'}}
            onMouseEnter={()=>setHov(i)} onMouseLeave={()=>setHov(null)}>
            <div style={{width:6,height:6,borderRadius:2,background:s.color,flexShrink:0}}/>
            <div style={{fontSize:8,color:C.text2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>
              {s.label}
            </div>
            <div style={{fontSize:8,color:C.text3,fontFamily:C.mono,flexShrink:0}}>
              {(s.frac*100).toFixed(0)}%
            </div>
          </div>
        ))}
        {slices.length > 6 && (
          <div style={{fontSize:8,color:C.text3}}>+{slices.length-6} more</div>
        )}
      </div>
    </div>
  );
}

// Progress bar showing only the drift zone (current vs target)
function DriftBar({ curPct, tgtPct, threshold, aColor }) {
  const max = Math.max(curPct, tgtPct, 5);
  const barW = 100; // percentage width of container
  const scale = barW / (max * 1.15);

  const curX  = Math.min(curPct * scale, 100);
  const tgtX  = Math.min(tgtPct * scale, 100);
  const drift = curPct - tgtPct;
  const driftFrac = tgtPct > 0 ? Math.abs(drift)/tgtPct : 0;
  const overThreshold = driftFrac*100 > threshold;

  // The "drift zone" is the gap between target and current
  const zoneLeft  = Math.min(curX, tgtX);
  const zoneRight = Math.max(curX, tgtX);
  const zoneW     = zoneRight - zoneLeft;

  return (
    <div style={{position:'relative',height:14,width:'100%',display:'flex',alignItems:'center'}}>
      {/* Background track */}
      <div style={{position:'absolute',left:0,top:5,right:0,height:4,
        background:'rgba(255,255,255,0.07)',borderRadius:3}}/>
      {/* Current position bar */}
      <div style={{position:'absolute',left:0,top:5,height:4,borderRadius:3,
        width:`${curX}%`,background:tgtPct>0?C.accent:'rgba(255,255,255,0.25)',
        transition:'width 0.4s'}}/>
      {/* Drift zone highlight — only the gap, not the whole bar */}
      {tgtPct > 0 && zoneW > 0.5 && (
        <div style={{
          position:'absolute',top:3,height:8,borderRadius:2,
          left:`${zoneLeft}%`,width:`${zoneW}%`,
          background:overThreshold ? `${aColor}35` : 'transparent',
          border:overThreshold ? `1px solid ${aColor}60` : 'none',
          transition:'all 0.3s',
        }}/>
      )}
      {/* Target marker */}
      {tgtPct > 0 && (
        <div style={{position:'absolute',top:2,width:2,height:10,borderRadius:1,
          left:`${tgtX}%`,transform:'translateX(-50%)',
          background:overThreshold?aColor:'rgba(255,255,255,0.4)',
          boxShadow:overThreshold?`0 0 4px ${aColor}`:undefined,
          transition:'all 0.3s'}}/>
      )}
    </div>
  );
}

export function RebalancingAssistant({ allNodes, quotes, rates, currency, user }) {
  const rate = rates[currency] ?? 1;
  const cSym = { USD:"$", EUR:"€", CHF:"Fr.", GBP:"£" }[currency] ?? "$";
  // fmtSym: format value with correct currency symbol (rate already applied at call site)
  const fmtSym = (v, dec=0) => v==null?"—":`${cSym}${Math.abs(v).toLocaleString("en-US",{minimumFractionDigits:dec,maximumFractionDigits:dec})}`;

  // Build unique positions with current value + auto-infer sector
  const positions = useMemo(() => {
    const map = {};
    for (const n of allNodes) {
      if (!n.symbol) continue;
      if (!map[n.symbol]) map[n.symbol] = {
        symbol:n.symbol, name:n.name||n.symbol, valueUSD:0,
        autoSector: inferSector(n.symbol, quotes[n.symbol]),
      };
      map[n.symbol].valueUSD += n.valueUSD ?? 0;
    }
    return Object.values(map).sort((a,b)=>b.valueUSD-a.valueUSD);
  }, [allNodes, quotes]);

  const totalValueUSD = positions.reduce((s,p)=>s+p.valueUSD,0);

  const [targets,     setTargets]   = useState({});
  const [cashAdd,     setCashAdd]   = useState(0);
  const [saving,      setSaving]    = useState(false);
  const [saved,       setSaved]     = useState(false);
  const [threshold,   setThreshold] = useState(5);
  const [mode,        setMode]      = useState("both");
  const [showPlan,    setShowPlan]  = useState(false);  // Rebalancing Plan modal
  const [cashExpanded,setCashExpanded] = useState(false); // Cash simulation detail

  // Load saved targets
  useEffect(() => {
    if (!user) return;
    fetch(`${BASE}/users/${user.id}/rebalance-targets`)
      .then(r=>r.json())
      .then(d => { if (d.targets && Object.keys(d.targets).length) setTargets(d.targets); })
      .catch(()=>{});
  }, [user]);

  const saveTargets = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await fetch(`${BASE}/users/${user.id}/rebalance-targets`, {
        method:"PUT", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ targets }),
      });
      setSaved(true); setTimeout(()=>setSaved(false),2000);
    } catch(e){}
    setSaving(false);
  };

  const setTarget = (sym, pct) =>
    setTargets(prev => ({ ...prev, [sym]: { ...(prev[sym]||{}), tickerPct:pct } }));

  const totalTarget = Object.values(targets).reduce((s,t)=>s+(t.tickerPct||0),0);

  // Compute rebalancing actions — sector comes from auto-inference or saved override
  const actions = useMemo(() => {
    const total = totalValueUSD + cashAdd;
    if (total <= 0) return [];
    return positions.map(pos => {
      const t   = targets[pos.symbol];
      const tgt = (t?.tickerPct || 0) / 100;
      const cur = totalValueUSD > 0 ? pos.valueUSD / totalValueUSD : 0;
      const targetValueUSD  = total * tgt;
      const diffUSD  = targetValueUSD - pos.valueUSD;
      const driftPct = cur > 0 ? ((cur - tgt) / tgt) * 100 : tgt > 0 ? -100 : 0;
      const q       = quotes[pos.symbol];
      const qCcy    = q?.currency;
      const qRate   = (qCcy && qCcy!=="USD") ? (rates[qCcy]??1) : 1;
      const priceUSD= q ? (qRate>0 ? q.price/qRate : q.price) : null;
      const shares  = priceUSD && priceUSD>0 ? Math.round(Math.abs(diffUSD)/priceUSD*10)/10 : null;
      // sector: prefer auto-inferred, allow saved override
      const sector  = t?.sectorOverride || pos.autoSector;
      return {
        ...pos, tgtPct:tgt*100, curPct:cur*100, diffUSD, driftPct,
        priceUSD, shares, action: diffUSD>0?"BUY":diffUSD<0?"SELL":"OK",
        sector,
      };
    });
  }, [positions, targets, totalValueUSD, cashAdd, quotes, rates]);

  const sectorGroups = useMemo(() => {
    const map = {};
    for (const a of actions) {
      if (!map[a.sector]) map[a.sector] = { sector:a.sector, tgtPct:0, curPct:0, valueUSD:0 };
      map[a.sector].tgtPct   += a.tgtPct;
      map[a.sector].curPct   += a.curPct;
      map[a.sector].valueUSD += a.valueUSD;
    }
    return Object.values(map).sort((a,b)=>b.valueUSD-a.valueUSD);
  }, [actions]);

  // Region + currency distribution from quotes
  const regionGroups = useMemo(() => {
    const map = {};
    for (const a of actions) {
      const q = quotes[a.symbol];
      const exch = q?.exchange || "";
      let region = "US";
      if (/\.(DE|PA|AS|MI|BR|LS|VI|HE|CO|ST|OL)$/.test(a.symbol)) region="Europe";
      else if (/\.(SW|VX)$/.test(a.symbol)) region="Switzerland";
      else if (/\.(L|IL)$/.test(a.symbol)) region="UK";
      else if (/\.(T|TY)$/.test(a.symbol)) region="Japan";
      else if (/\.(HK)$/.test(a.symbol)) region="HK/Asia";
      else if (exch && /SWX|XVTX/.test(exch)) region="Switzerland";
      else if (exch && /LSE|IOB/.test(exch)) region="UK";
      if (!map[region]) map[region]={region,valueUSD:0};
      map[region].valueUSD += a.valueUSD;
    }
    return Object.values(map).sort((a,b)=>b.valueUSD-a.valueUSD);
  }, [actions, quotes]);

  const cCyGroups = useMemo(() => {
    const map = {};
    for (const a of actions) {
      const ccy = quotes[a.symbol]?.currency || "USD";
      if (!map[ccy]) map[ccy]={ccy,valueUSD:0};
      map[ccy].valueUSD += a.valueUSD;
    }
    return Object.values(map).sort((a,b)=>b.valueUSD-a.valueUSD);
  }, [actions, quotes]);

  const flagged = actions.filter(a =>
    Math.abs(a.driftPct) > threshold &&
    (mode==="both"||(mode==="buy"&&a.action==="BUY")||(mode==="sell"&&a.action==="SELL"))
  );

  // Color palettes for donuts
  const SECTOR_COLORS = ["#3b82f6","#4ade80","#fbbf24","#f87171","#a78bfa","#34d399",
    "#fb923c","#e879f9","#22d3ee","#6ee7b7","#facc15","#f9a8d4"];
  const REGION_COLORS = ["#3b82f6","#fbbf24","#4ade80","#f87171","#a78bfa","#34d399","#fb923c"];
  const CCY_COLORS    = ["#60a5fa","#f87171","#4ade80","#fbbf24","#a78bfa","#34d399"];

  const sectorDonut = sectorGroups.map((sg,i)=>({
    label:sg.sector, value:sg.valueUSD, color:SECTOR_COLORS[i%SECTOR_COLORS.length]
  }));
  const regionDonut = regionGroups.map((rg,i)=>({
    label:rg.region, value:rg.valueUSD, color:REGION_COLORS[i%REGION_COLORS.length]
  }));
  const ccyDonut    = cCyGroups.map((cg,i)=>({
    label:cg.ccy, value:cg.valueUSD, color:CCY_COLORS[i%CCY_COLORS.length]
  }));

  // Map sector to its donut color for row badges
  const sectorColorMap = Object.fromEntries(sectorDonut.map(d=>[d.label,d.color]));

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      <SectionHeader
        title="Rebalancing Assistant"
        subtitle="Target weights, drift zones, and sector distribution"
        action={
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {!user && <Pill label="Sign in to save targets" color={C.yellow}/>}
            {/* Rebalancing Plan button — always visible when targets exist */}
            {actions.some(a=>a.action!=="OK" && a.tgtPct>0) && (
              <button onClick={()=>setShowPlan(v=>!v)} style={{
                padding:"5px 14px", borderRadius:8,
                border:`1px solid ${showPlan?"rgba(251,191,36,0.6)":"rgba(251,191,36,0.3)"}`,
                background:showPlan?"rgba(251,191,36,0.15)":"rgba(251,191,36,0.07)",
                color:"#fbbf24", fontSize:11, fontWeight:700,
                cursor:"pointer", fontFamily:"inherit", display:"flex",
                alignItems:"center", gap:6, transition:"all 0.15s",
              }}>
                <span style={{ fontSize:13 }}>⚖</span>
                {showPlan ? "Hide Plan" : "Rebalancing Plan"}
              </button>
            )}
            {user && (
              <button onClick={saveTargets} disabled={saving} style={{
                padding:"5px 14px", borderRadius:8, border:`1px solid ${C.accent}`,
                background:saved?"rgba(74,222,128,0.15)":"rgba(59,130,246,0.15)",
                color:saved?C.green:C.accent, fontSize:11, fontWeight:700,
                cursor:"pointer", fontFamily:"inherit",
              }}>
                {saving?"Saving…":saved?"✓ Saved":"Save targets"}
              </button>
            )}
          </div>
        }
      />

      {/* ── Rebalancing Plan Panel ── */}
      {showPlan && (() => {
        const buyList  = actions.filter(a=>a.action==="BUY"  && a.tgtPct>0).sort((a,b)=>b.diffUSD-a.diffUSD);
        const sellList = actions.filter(a=>a.action==="SELL" && a.tgtPct>0).sort((a,b)=>a.diffUSD-b.diffUSD);
        const totalBuy  = buyList.reduce((s,a)=>s+a.diffUSD,0);
        const totalSell = Math.abs(sellList.reduce((s,a)=>s+a.diffUSD,0));
        const cashRate  = rates[currency] ?? 1;
        const PlanRow = ({a, type}) => {
          const aColor = type==="BUY" ? C.green : C.red;
          const amt = Math.abs(a.diffUSD) * cashRate;
          const sharesEst = a.priceUSD && a.priceUSD>0
            ? Math.ceil(Math.abs(a.diffUSD) / a.priceUSD * 10)/10 : null;
          return (
            <div style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 0",
              borderBottom:`1px solid ${C.border2}` }}>
              {/* Action badge */}
              <div style={{ width:36, textAlign:"center", flexShrink:0 }}>
                <span style={{ fontSize:9, fontWeight:800, color:aColor,
                  padding:"2px 6px", borderRadius:4,
                  background:`${aColor}15`, border:`1px solid ${aColor}25`,
                  textTransform:"uppercase" }}>{type}</span>
              </div>
              {/* Symbol */}
              <div style={{ width:70, flexShrink:0 }}>
                <div style={{ fontFamily:C.mono, fontSize:11, fontWeight:700, color:C.accent }}>
                  {a.symbol}
                </div>
                <div style={{ fontSize:8, color:C.text3 }}>{a.sector}</div>
              </div>
              {/* Amount bar */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ height:5, borderRadius:3,
                  background:"rgba(255,255,255,0.06)", overflow:"hidden" }}>
                  <div style={{ height:"100%", borderRadius:3, background:aColor, opacity:0.7,
                    width:`${type==="BUY"
                      ? (totalBuy>0?Math.abs(a.diffUSD)/totalBuy*100:0)
                      : (totalSell>0?Math.abs(a.diffUSD)/totalSell*100:0)}%`,
                    transition:"width 0.4s" }}/>
                </div>
              </div>
              {/* Amount */}
              <div style={{ textAlign:"right", flexShrink:0, width:80 }}>
                <div style={{ fontFamily:C.mono, fontSize:12, fontWeight:700, color:aColor }}>
                  {fmtSym(amt,0)}
                </div>
                {sharesEst && a.priceUSD && (
                  <div style={{ fontSize:8, color:C.text3 }}>
                    {sharesEst} sh. @ {fmtSym(a.priceUSD*cashRate,2)}
                  </div>
                )}
              </div>
            </div>
          );
        };

        return (
          <div style={{ flexShrink:0, borderBottom:`2px solid rgba(251,191,36,0.25)`,
            background:"rgba(251,191,36,0.04)", padding:"12px 20px 8px",
            maxHeight:320, overflowY:"auto" }}>
            {/* Plan header */}
            <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:10, flexWrap:"wrap" }}>
              <div style={{ fontSize:10, fontWeight:700, color:"#fbbf24",
                textTransform:"uppercase", letterSpacing:"0.08em" }}>
                Rebalancing Plan
              </div>
              {cashAdd > 0 && (
                <div style={{ fontSize:10, color:C.text3 }}>
                  incl. <span style={{color:C.green,fontWeight:700}}>{fmtSym(cashAdd)} {currency}</span> new cash
                </div>
              )}
              {/* Summary pills */}
              <div style={{ display:"flex", gap:8, marginLeft:"auto" }}>
                {totalBuy > 0 && (
                  <div style={{ padding:"3px 10px", borderRadius:6,
                    background:"rgba(74,222,128,0.12)", border:"1px solid rgba(74,222,128,0.25)",
                    fontSize:10, fontWeight:700, color:C.green, fontFamily:C.mono }}>
                    ↑ BUY {fmtSym(totalBuy*cashRate,0)}
                  </div>
                )}
                {totalSell > 0 && (
                  <div style={{ padding:"3px 10px", borderRadius:6,
                    background:"rgba(248,113,113,0.12)", border:"1px solid rgba(248,113,113,0.25)",
                    fontSize:10, fontWeight:700, color:C.red, fontFamily:C.mono }}>
                    ↓ SELL {fmtSym(totalSell*cashRate,0)}
                  </div>
                )}
                <div style={{ padding:"3px 10px", borderRadius:6,
                  background:"rgba(255,255,255,0.06)", border:`1px solid ${C.border}`,
                  fontSize:10, color:C.text3, fontFamily:C.mono }}>
                  Net {fmtSym((totalBuy-totalSell)*cashRate,0)}
                </div>
              </div>
            </div>

            {/* Two-column: BUY | SELL */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:0 }}>
              <div style={{ paddingRight:16, borderRight:`1px solid ${C.border2}` }}>
                <div style={{ fontSize:9, color:C.green, fontWeight:700, textTransform:"uppercase",
                  letterSpacing:"0.08em", marginBottom:4 }}>Buy orders</div>
                {buyList.length === 0
                  ? <div style={{ fontSize:10, color:C.text3, padding:"8px 0" }}>None</div>
                  : buyList.map(a=><PlanRow key={a.symbol} a={a} type="BUY"/>)
                }
              </div>
              <div style={{ paddingLeft:16 }}>
                <div style={{ fontSize:9, color:C.red, fontWeight:700, textTransform:"uppercase",
                  letterSpacing:"0.08em", marginBottom:4 }}>Sell orders</div>
                {sellList.length === 0
                  ? <div style={{ fontSize:10, color:C.text3, padding:"8px 0" }}>None</div>
                  : sellList.map(a=><PlanRow key={a.symbol} a={a} type="SELL"/>)
                }
              </div>
            </div>
          </div>
        );
      })()}

      <div style={{ display:"flex", flex:1, overflow:"hidden", flexDirection:"column" }}>

        {/* ── Fixed header: Settings (left) + Distribution (right) ── */}
        <div style={{ display:"flex", borderBottom:`1px solid ${C.border2}`, flexShrink:0 }}>

          {/* Left: Settings */}
          <div style={{ width:340, flexShrink:0, padding:"8px 16px 12px",
            borderRight:`1px solid ${C.border2}` }}>
            <div style={{ fontSize:10, color:C.text3, fontWeight:700, textTransform:"uppercase",
              letterSpacing:"0.08em", marginBottom:8 }}>Settings</div>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:cashAdd>0?4:8 }}>
              <label style={{ fontSize:11, color:C.text2, whiteSpace:"nowrap" }}>Cash to invest:</label>
              <input type="number" value={cashAdd} min={0} step={100}
                onChange={e=>{ setCashAdd(+e.target.value); if(+e.target.value>0) setCashExpanded(true); }}
                style={{ background:"rgba(255,255,255,0.05)", border:`1px solid ${C.border}`,
                  borderRadius:6, color:C.text1, padding:"4px 8px", fontSize:12,
                  fontFamily:C.mono, width:80, outline:"none" }}/>
              <select value={currency} onChange={e => {}}
                style={{ background:"rgba(255,255,255,0.05)", border:`1px solid ${C.border}`,
                  borderRadius:6, color:C.text1, padding:"4px 6px", fontSize:11,
                  fontFamily:"inherit", outline:"none", cursor:"pointer" }}>
                {["USD","EUR","CHF","GBP"].map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {(() => {
              // Cash simulation breakdown
              if (cashAdd <= 0) return null;
              const buyActions = actions.filter(a => a.action==="BUY" && a.tgtPct>0);
              const totalBuy   = buyActions.reduce((s,a)=>s+a.diffUSD,0);
              if (!cashAdd || !totalBuy) return null;
              const cashRate   = rates[currency] ?? 1;
              return (
                <div>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
                    <span style={{ fontSize:10, color:C.green, fontWeight:700 }}>
                      Cash Allocation — {fmtSym(cashAdd)} {currency}
                    </span>
                    <button onClick={()=>setCashExpanded(v=>!v)}
                      style={{ fontSize:9, color:C.text3, background:"none", border:"none",
                        cursor:"pointer", padding:"2px 4px" }}>
                      {cashExpanded?"▲ hide":"▼ detail"}
                    </button>
                  </div>
                  {cashExpanded && (
                    <div style={{ borderRadius:8, padding:"6px 10px",
                      background:"rgba(74,222,128,0.06)", border:"1px solid rgba(74,222,128,0.15)" }}>
                      {buyActions.map(a => {
                        const cashShare  = (a.diffUSD / totalBuy) * cashAdd / cashRate;
                        const priceUSD   = quotes[a.symbol]?.price ?? 0;
                        const sharesEst  = priceUSD>0 ? Math.floor((cashShare/(priceUSD*cashRate))*10)/10 : null;
                        const barW       = (a.diffUSD / totalBuy) * 100;
                        return (
                          <div key={a.symbol} style={{ marginBottom:6 }}>
                            <div style={{ display:"flex", justifyContent:"space-between",
                              alignItems:"center", marginBottom:2 }}>
                              <span style={{ fontFamily:C.mono, fontSize:10, fontWeight:700,
                                color:C.accent }}>{a.symbol}</span>
                              <div style={{ textAlign:"right" }}>
                                <span style={{ fontFamily:C.mono, fontSize:10, color:C.green, fontWeight:700 }}>
                                  {fmtSym(cashShare, 0)}
                                </span>
                                {sharesEst && (
                                  <span style={{ fontSize:9, color:C.text3, marginLeft:5 }}>
                                    ≈ {sharesEst} sh.
                                  </span>
                                )}
                              </div>
                            </div>
                            <div style={{ height:3, borderRadius:2,
                              background:"rgba(255,255,255,0.07)", overflow:"hidden" }}>
                              <div style={{ height:"100%", width:`${barW}%`,
                                background:C.green, borderRadius:2, opacity:0.7,
                                transition:"width 0.3s" }}/>
                            </div>
                          </div>
                        );
                      })}
                      {buyActions.length > 0 && (
                        <div style={{ marginTop:4, paddingTop:5,
                          borderTop:"1px solid rgba(74,222,128,0.15)",
                          display:"flex", justifyContent:"space-between", fontSize:9 }}>
                          <span style={{ color:C.text3 }}>Total deployed</span>
                          <span style={{ fontFamily:C.mono, fontWeight:700, color:C.green }}>
                            {fmtSym(cashAdd)} {currency}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <label style={{ fontSize:11, color:C.text2, whiteSpace:"nowrap" }}>Drift threshold:</label>
              <input type="number" value={threshold} min={1} max={30} step={1}
                onChange={e=>setThreshold(+e.target.value)}
                style={{ background:"rgba(255,255,255,0.05)", border:`1px solid ${C.border}`,
                  borderRadius:6, color:C.text1, padding:"4px 8px", fontSize:12,
                  fontFamily:C.mono, width:52, outline:"none" }}/>
              <span style={{ fontSize:11, color:C.text3 }}>%</span>
              <div style={{ marginLeft:"auto", display:"flex", gap:4 }}>
                {["buy","both","sell"].map(m => (
                  <button key={m} onClick={()=>setMode(m)} style={{
                    padding:"3px 8px", borderRadius:5,
                    border:`1px solid ${mode===m?(m==="buy"?C.green:m==="sell"?C.red:C.accent):C.border}`,
                    background:mode===m?"rgba(255,255,255,0.08)":"transparent",
                    color:mode===m?(m==="buy"?C.green:m==="sell"?C.red:C.accent):C.text3,
                    fontSize:9, fontWeight:700, cursor:"pointer", fontFamily:"inherit",
                    textTransform:"uppercase",
                  }}>{m}</button>
                ))}
              </div>
            </div>
            <div style={{ marginTop:6, fontSize:10,
              color:Math.abs(totalTarget-100)>0.5?C.red:C.green }}>
              Total target: {totalTarget.toFixed(1)}%
              {Math.abs(totalTarget-100)>0.5 && " — should sum to 100%"}
            </div>
          </div>

          {/* Right: Distribution donuts */}
          <div style={{ flex:1, padding:"12px 20px", overflowX:"auto" }}>
            <div style={{ fontSize:10, color:C.text3, fontWeight:700, textTransform:"uppercase",
              letterSpacing:"0.08em", marginBottom:12 }}>Portfolio Distribution</div>
            <div style={{ display:"flex", gap:24, flexWrap:"wrap" }}>
              {sectorDonut.length > 0 && (
                <DonutChart data={sectorDonut} size={100} title="Sector"/>
              )}
              {regionDonut.length > 0 && (
                <DonutChart data={regionDonut} size={100} title="Region"/>
              )}
              {ccyDonut.length > 0 && (
                <DonutChart data={ccyDonut} size={100} title="Currency"/>
              )}
              {/* Sector allocation list — compact, next to donuts */}
              <div style={{ flex:1, minWidth:160 }}>
                <div style={{ fontSize:9, color:C.text3, fontWeight:700, textTransform:"uppercase",
                  letterSpacing:"0.08em", marginBottom:8 }}>Sector Allocation</div>
                <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                  {sectorGroups.map(sg => {
                    const drift   = sg.tgtPct > 0 ? sg.curPct - sg.tgtPct : 0;
                    const isOver  = sg.tgtPct > 0 && Math.abs(drift) > threshold;
                    const sc      = sectorColorMap[sg.sector] || C.accent;
                    const driftColor = drift > 0 ? C.red : C.green;
                    return (
                      <div key={sg.sector} style={{ padding:"5px 8px", borderRadius:7,
                        background:C.surface2,
                        border:`1px solid ${isOver?"rgba(248,113,113,0.3)":C.border}` }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <div style={{ width:6, height:6, borderRadius:2, background:sc, flexShrink:0 }}/>
                          <div style={{ fontSize:9, color:C.text2, flex:1 }}>{sg.sector}</div>
                          <span style={{ fontFamily:C.mono, fontSize:11, fontWeight:700, color:C.text1 }}>
                            {sg.curPct.toFixed(1)}%
                          </span>
                          {sg.tgtPct > 0 && (
                            <span style={{ fontSize:9, color:isOver?driftColor:C.text3 }}>
                              {drift > 0 ? "+" : ""}{drift.toFixed(1)}%
                            </span>
                          )}
                        </div>
                        {sg.tgtPct > 0 && (
                          <DriftBar curPct={sg.curPct} tgtPct={sg.tgtPct}
                            threshold={threshold} aColor={isOver?driftColor:C.accent}/>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Unified scrollable rows: one row per position (slider LEFT + bar+action RIGHT) ── */}
        <div style={{ flex:1, overflowY:"auto" }}>
          {/* Column headers */}
          <div style={{ display:"flex", alignItems:"center",
            padding:"6px 16px", borderBottom:`1px solid ${C.border2}`,
            background:C.surface, position:"sticky", top:0, zIndex:5 }}>
            <div style={{ width:340, flexShrink:0, fontSize:9, color:C.text3, fontWeight:700,
              textTransform:"uppercase", letterSpacing:"0.08em" }}>
              Position Targets
            </div>
            <div style={{ flex:1, fontSize:9, color:C.text3, fontWeight:700,
              textTransform:"uppercase", letterSpacing:"0.08em" }}>
              {flagged.length
                ? `${flagged.length} position${flagged.length>1?"s":""} outside threshold (>${threshold}% drift)`
                : "All positions within drift threshold ✓"}
            </div>
          </div>

          {/* Unified rows */}
          {positions.map(pos => {
            const t   = targets[pos.symbol] || {};
            const cur = totalValueUSD>0 ? (pos.valueUSD/totalValueUSD*100).toFixed(1) : "0";
            const sector = t.sectorOverride || pos.autoSector;
            const sc  = sectorColorMap[sector] || C.accent;

            // Find matching action
            const a = actions.find(x => x.symbol === pos.symbol);
            const isFlag = a && Math.abs(a.driftPct) > threshold && a.action !== "OK";
            const aColor = a?.action==="BUY" ? C.green : a?.action==="SELL" ? C.red : C.text3;

            // Cash share for BUY positions
            const buyActions = actions.filter(x => x.action==="BUY" && x.tgtPct>0);
            const totalBuy   = buyActions.reduce((s,x)=>s+x.diffUSD,0);
            const cashRate   = rates[currency] ?? 1;
            const cashShare  = (a?.action==="BUY" && cashAdd>0 && totalBuy>0)
              ? (a.diffUSD / totalBuy) * cashAdd / cashRate
              : null;
            const priceUSD   = quotes[pos.symbol]?.price ?? 0;
            const sharesEst  = a && a.priceUSD>0 && a.diffUSD>0
              ? Math.floor((Math.abs(a.diffUSD)/(a.priceUSD))*10)/10
              : null;

            return (
              <div key={pos.symbol} style={{
                display:"flex", alignItems:"stretch",
                borderBottom:`1px solid ${C.border2}`,
                background: isFlag ? `${aColor}04` : "transparent",
                transition:"background 0.15s",
              }}>
                {/* LEFT: slider + target input */}
                <div style={{ width:340, flexShrink:0, padding:"8px 16px",
                  borderRight:`1px solid ${C.border2}` }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:5, width:90, flexShrink:0 }}>
                      <span style={{ fontFamily:C.mono, fontSize:11, fontWeight:700,
                        color:C.accent }}>{pos.symbol}</span>
                      <span style={{ fontSize:7, padding:"1px 4px", borderRadius:4,
                        background:`${sc}18`, color:sc, border:`1px solid ${sc}30`,
                        fontWeight:700, whiteSpace:"nowrap", overflow:"hidden",
                        maxWidth:48, textOverflow:"ellipsis" }}>
                        {sector.slice(0,5)}
                      </span>
                    </div>
                    <div style={{ flex:1 }}>
                      <input type="range" min={0} max={100} step={0.5}
                        value={t.tickerPct||0}
                        onChange={e=>setTarget(pos.symbol, +e.target.value)}
                        style={{ width:"100%", accentColor:C.accent }}/>
                    </div>
                    <input type="number" min={0} max={100} step={0.5}
                      value={t.tickerPct||""}
                      placeholder="0"
                      onChange={e=>setTarget(pos.symbol, +e.target.value)}
                      style={{ width:38, background:"rgba(255,255,255,0.05)",
                        border:`1px solid ${C.border}`, borderRadius:5, color:C.text1,
                        padding:"2px 5px", fontSize:11, fontFamily:C.mono, outline:"none",
                        textAlign:"right" }}/>
                    <span style={{ fontSize:10, color:C.text3, width:14 }}>%</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:2 }}>
                    <span style={{ fontSize:9, color:C.text3 }}>Now {cur}%</span>
                    <span style={{ fontSize:9, color:C.text3, marginLeft:4 }}>
                      {fmtSym(pos.valueUSD*(rates[currency]??1))}
                    </span>
                  </div>
                </div>

                {/* RIGHT: drift bar + value + action */}
                <div style={{ flex:1, padding:"8px 16px",
                  display:"flex", alignItems:"center", gap:10 }}>

                  {/* Symbol + sector (mirrored for right side orientation) */}
                  <div style={{ width:90, flexShrink:0 }}>
                    <div style={{ fontFamily:C.mono, fontSize:11, fontWeight:700, color:C.accent }}>
                      {a?.symbol || pos.symbol}
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:4, marginTop:2 }}>
                      <div style={{ width:5, height:5, borderRadius:1, background:sc, flexShrink:0 }}/>
                      <span style={{ fontSize:9, color:C.text3 }}>{sector}</span>
                    </div>
                  </div>

                  {/* Drift bar */}
                  <div style={{ flex:1, minWidth:0 }}>
                    {a ? (
                      <>
                        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:1 }}>
                          <span style={{ fontSize:9, color:C.text3, width:26, textAlign:"right",
                            fontFamily:C.mono }}>{a.curPct.toFixed(1)}%</span>
                          <div style={{ flex:1 }}>
                            <DriftBar curPct={a.curPct} tgtPct={a.tgtPct}
                              threshold={threshold} aColor={isFlag?aColor:C.accent}/>
                          </div>
                          {a.tgtPct > 0 && (
                            <span style={{ fontSize:9, color:C.text3, width:26,
                              fontFamily:C.mono }}>{a.tgtPct.toFixed(1)}%</span>
                          )}
                        </div>
                        {isFlag && (
                          <div style={{ fontSize:9, color:aColor, marginLeft:32, opacity:0.85 }}>
                            {a.driftPct > 0 ? "+" : ""}{a.driftPct.toFixed(1)}% drift from target
                          </div>
                        )}
                      </>
                    ) : (
                      <span style={{ fontSize:9, color:C.text3 }}>—</span>
                    )}
                  </div>

                  {/* Value */}
                  <div style={{ textAlign:"right", width:76, flexShrink:0 }}>
                    <div style={{ fontFamily:C.mono, fontSize:11, color:C.text2 }}>
                      {a ? fmtSym(a.valueUSD * (rates[currency]??1)) : "—"}
                    </div>
                  </div>

                  {/* Action chip + shares + cash share */}
                  <div style={{ textAlign:"right", flexShrink:0, minWidth:140 }}>
                    {a && a.tgtPct > 0 && a.action !== "OK" ? (
                      <>
                        <div style={{ padding:"3px 8px", borderRadius:6, display:"inline-flex",
                          alignItems:"center", gap:5,
                          background:`${aColor}15`, border:`1px solid ${aColor}30` }}>
                          <span style={{ fontSize:9, fontWeight:700, color:aColor,
                            textTransform:"uppercase" }}>{a.action}</span>
                          <span style={{ fontFamily:C.mono, fontSize:10, color:aColor, fontWeight:700 }}>
                            {fmtSym(Math.abs(a.diffUSD) * (rates[currency]??1))}
                          </span>
                        </div>
                        {sharesEst && a.priceUSD && (
                          <div style={{ fontSize:9, color:C.text3, marginTop:2 }}>
                            ≈ {sharesEst} sh. @ {fmtSym(a.priceUSD*(rates[currency]??1),2)}
                          </div>
                        )}
                        {cashShare != null && cashShare > 0 && (
                          <div style={{ fontSize:9, color:C.green, marginTop:2, fontWeight:600 }}>
                            + {fmtSym(cashShare,0)} cash
                            {priceUSD>0 && cashShare>0 && (
                              <span style={{ color:C.text3, fontWeight:400 }}>
                                {" "}≈ {Math.floor((cashShare/priceUSD)*10)/10} sh.
                              </span>
                            )}
                          </div>
                        )}
                      </>
                    ) : a && a.tgtPct > 0 ? (
                      <span style={{ fontSize:10, color:C.green }}>✓ On target</span>
                    ) : (
                      <span style={{ fontSize:9, color:C.text3 }}>No target set</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. DIVIDEND CALENDAR  (Calendar view + Bar chart view)
// ══════════════════════════════════════════════════════════════════════════════
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function estimateDates(divData, symbol) {
  if (!divData) return [];
  const result = [];
  if (divData.exDate) {
    result.push({ date:divData.exDate, amount:divData.lastAmt, symbol, isEstimate:false });
  }
  if (divData.nextExDate) {
    result.push({ date:divData.nextExDate, amount:divData.lastAmt, symbol, isEstimate:true });
    const freq = divData.payments >= 4 ? 3 : divData.payments >= 2 ? 6 : 12;
    if (freq <= 6) {
      const d = new Date(divData.nextExDate);
      for (let i = 1; i <= 3; i++) {
        d.setMonth(d.getMonth() + freq);
        if (d > new Date())
          result.push({ date:d.toISOString().slice(0,10), amount:divData.lastAmt, symbol, isEstimate:true });
      }
    }
  }
  return result;
}

// Bar chart sub-component for monthly income
function DivBarChart({ monthly, currency, cSym, rate, symColors, year, onSymbolHover, onSymbolLeave }) {
  const maxVal   = Math.max(...monthly.map(m=>m.totalUSD), 0.01);
  const nowMonth = new Date().getMonth();
  const nowYear  = new Date().getFullYear();
  const [hov, setHov]         = useState(null);
  const [hovSym, setHovSym]   = useState(null);  // symbol under cursor within bar
  const [tipPos, setTipPos]   = useState({ x:0, y:0 });
  const chartRef              = useRef(null);
  const barRefs               = useRef({});  // month index → bar DOM element
  const annualTotal           = monthly.reduce((s,m)=>s+m.totalUSD,0);

  const handleMouseMove = (e, i) => {
    if (i !== hov) { setHov(i); setHovSym(null); }
    const rect = chartRef.current?.getBoundingClientRect();
    if (rect) setTipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });

    // Determine which symbol segment the cursor is over within the stacked bar
    const barEl = barRefs.current[i];
    const m     = monthly[i];
    if (barEl && m?.events?.length > 0 && m.totalUSD > 0) {
      const barRect = barEl.getBoundingClientRect();
      // Segments are stacked column-reverse (first event at bottom)
      // cursor position relative to bar top, as fraction of bar height
      const relY  = (e.clientY - barRect.top) / barRect.height;
      // column-reverse means index 0 is at bottom → invert
      const fromBottom = 1 - relY;
      let cumFrac = 0;
      let found   = null;
      for (const ev of m.events) {
        const frac = ev.totalUSD / m.totalUSD;
        cumFrac += frac;
        if (fromBottom <= cumFrac) { found = ev.symbol; break; }
      }
      if (found !== hovSym) setHovSym(found);
    }
  };

  return (
    <div ref={chartRef} style={{ display:"flex", flexDirection:"column", height:"100%",
      padding:"0 22px 16px", position:"relative" }}>
      <div style={{ display:"flex", alignItems:"baseline", gap:12, marginBottom:16 }}>
        <span style={{ fontSize:11, color:C.text3 }}>
          Monthly dividend income — <strong style={{color:C.text2}}>{year}</strong>
        </span>
        {annualTotal > 0 && (
          <span style={{ fontSize:12, color:C.green, fontFamily:C.mono, fontWeight:700 }}>
            {cSym}{(annualTotal*rate).toFixed(0)} / year
          </span>
        )}
      </div>

      {/* Floating tooltip at chart level */}
      {hov !== null && monthly[hov]?.totalUSD > 0 && (() => {
        const m = monthly[hov];
        const tipW = 160;
        // clamp to chart bounds
        const tipX = Math.min(tipPos.x + 12, (chartRef.current?.offsetWidth||400) - tipW - 8);
        return (
          <div style={{ position:"absolute", zIndex:20, pointerEvents:"none",
            left:tipX, top:Math.max(8, tipPos.y - 100),
            background:C.surface, border:`1px solid ${C.border}`,
            borderRadius:8, padding:"8px 12px",
            boxShadow:"0 8px 32px rgba(0,0,0,0.6)", width:tipW }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.text1, marginBottom:6 }}>
              {MONTH_NAMES[hov]} {year}
            </div>
            {m.events.map(ev => {
              const isActive = hovSym === ev.symbol;
              return (
                <div key={ev.symbol+ev.exDate} style={{
                  display:"flex", justifyContent:"space-between", gap:8,
                  fontSize:10, marginBottom:2,
                  padding:"2px 5px", borderRadius:4, margin:"0 -5px 2px",
                  background: isActive ? `${symColors[ev.symbol]||C.accent}22` : "transparent",
                  transition:"background 0.1s",
                }}>
                  <span
                    onMouseEnter={onSymbolHover ? e => onSymbolHover(e, ev.symbol) : undefined}
                    onMouseLeave={onSymbolLeave}
                    style={{ color:symColors[ev.symbol]||C.accent,
                      fontFamily:C.mono, fontWeight: isActive ? 800 : 700,
                      cursor: onSymbolHover ? "pointer" : "default",
                    }}>{ev.symbol}</span>
                  <span style={{ color: isActive ? C.text1 : C.text2, fontWeight: isActive ? 700 : 400 }}>
                    {ev.totalUSD ? `${cSym}${(ev.totalUSD*rate).toFixed(2)}` : "—"}
                  </span>
                </div>
              );
            })}
            <div style={{ marginTop:6, paddingTop:5, borderTop:`1px solid ${C.border2}`,
              display:"flex", justifyContent:"space-between" }}>
              <span style={{ fontSize:10, color:C.text3 }}>Total</span>
              <span style={{ fontSize:11, color:C.accent, fontFamily:C.mono, fontWeight:700 }}>
                {cSym}{(m.totalUSD*rate).toFixed(2)}
              </span>
            </div>
          </div>
        );
      })()}

      {/* Bar chart */}
      <div style={{ flex:1, display:"flex", alignItems:"flex-end", gap:6, minHeight:0 }}>
        {monthly.map((m, i) => {
          const barH  = maxVal > 0 ? (m.totalUSD / maxVal) * 100 : 0;
          const isCur = i === nowMonth && year === nowYear;
          const isHov = hov === i;
          const hasDivs = m.totalUSD > 0;
          return (
            <div key={i} style={{ flex:1, display:"flex", flexDirection:"column",
              alignItems:"center", gap:4, cursor:hasDivs?"pointer":"default",
              height:"100%", justifyContent:"flex-end" }}
              onMouseMove={e=>handleMouseMove(e, i)}
              onMouseLeave={()=>{ setHov(null); setHovSym(null); }}>

              {/* Amount label on top */}
              {hasDivs && (
                <div style={{ fontSize:9, color:isHov?C.accent:C.text3, fontFamily:C.mono,
                  fontWeight:700, transition:"color 0.15s" }}>
                  {cSym}{(m.totalUSD*rate).toFixed(0)}
                </div>
              )}

              {/* Stacked bar by symbol */}
              <div ref={el => { if (el) barRefs.current[i] = el; }}
                style={{ width:"100%", height:`${barH}%`, minHeight:hasDivs?2:0,
                borderRadius:"4px 4px 0 0", overflow:"hidden", position:"relative",
                display:"flex", flexDirection:"column-reverse",
                transition:"transform 0.2s, filter 0.2s",
                transform:isHov?"scaleY(1.04)":"scaleY(1)",
                transformOrigin:"bottom",
                filter:isHov?"brightness(1.15)":"brightness(1)",
                background:hasDivs?"transparent":"rgba(255,255,255,0.04)" }}>
                {m.events.map(ev => {
                  const evFrac   = ev.totalUSD && m.totalUSD > 0 ? ev.totalUSD / m.totalUSD : 0;
                  const isSegHov = isHov && hovSym === ev.symbol;
                  return (
                    <div key={ev.symbol+ev.exDate} style={{
                      width:"100%",
                      height:`${evFrac*100}%`,
                      background:symColors[ev.symbol] || C.accent,
                      opacity: isSegHov ? 1 : ev.isEstimate ? 0.65 : (isHov && hovSym ? 0.55 : 1),
                      filter: isSegHov ? "brightness(1.35) saturate(1.2)" : "none",
                      transition:"opacity 0.12s, filter 0.12s",
                    }}/>
                  );
                })}
              </div>

              {/* Month label */}
              <div style={{ fontSize:9, color: isCur?C.accent:C.text3, fontWeight:isCur?700:400,
                fontFamily:C.mono }}>
                {MONTH_NAMES[i].slice(0,3)}
              </div>

              {/* Current month indicator */}
              {isCur && (
                <div style={{ width:4, height:4, borderRadius:"50%",
                  background:C.accent, flexShrink:0 }}/>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      {Object.keys(symColors).length > 0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:12 }}>
          {Object.entries(symColors).map(([sym,col]) => (
            <div key={sym} style={{ display:"flex", alignItems:"center", gap:4 }}>
              <div style={{ width:8, height:8, borderRadius:2, background:col }}/>
              <span style={{ fontSize:9, color:C.text2, fontFamily:C.mono }}>{sym}</span>
            </div>
          ))}
          <div style={{ display:"flex", alignItems:"center", gap:4, marginLeft:"auto" }}>
            <div style={{ width:14, height:8, borderRadius:2, background:"rgba(255,255,255,0.2)",
              border:"1px dashed rgba(255,255,255,0.2)" }}/>
            <span style={{ fontSize:9, color:C.text3 }}>Estimated</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function DividendCalendar({ allNodes, divCache, etfHoldings, isEtfMode, currency, rates, onRefreshDivs, onCellHover, onCellLeave }) {
  const rate = rates[currency] ?? 1;
  const cSym = { USD:"$", EUR:"€", CHF:"Fr.", GBP:"£" }[currency] ?? "$";
  const now  = new Date();
  // Use persistent settings store so values survive ETF switches
  const [viewYear,  _setViewYear]  = useState(_divCalSettings.viewYear);
  const [selected,  setSelected]   = useState(null);
  const [fictValue, _setFictValue] = useState(_divCalSettings.fictValue);
  const [chartView, _setChartView] = useState(_divCalSettings.chartView);

  const setViewYear  = v => { _divCalSettings.viewYear  = typeof v==="function"?v(_divCalSettings.viewYear):v; _setViewYear(v); };
  const setFictValue = v => { _divCalSettings.fictValue = v; _setFictValue(v); };
  const setChartView = v => { _divCalSettings.chartView = v; _setChartView(v); };

  const positions = useMemo(() => {
    if (isEtfMode) {
      return (etfHoldings || []).map(h => {
        const allocatedUSD = fictValue * (h.weight / 100);
        return {
          symbol:h.symbol, name:h.name,
          qty:null, valueUSD:allocatedUSD,
          isEtfFict:true, fictAllocated:allocatedUSD,
        };
      });
    }
    const map = {};
    for (const n of allNodes) {
      if (!n.symbol) continue;
      if (!map[n.symbol]) map[n.symbol] = { symbol:n.symbol, name:n.name||n.symbol, qty:0, valueUSD:0 };
      map[n.symbol].qty      += n.qty ?? 0;
      map[n.symbol].valueUSD += n.valueUSD ?? 0;
    }
    return Object.values(map);
  }, [allNodes, etfHoldings, isEtfMode, fictValue]);

  const events = useMemo(() => {
    const result = [];
    for (const pos of positions) {
      const div = divCache?.[pos.symbol];
      if (!div) continue; // null = sentinel (loading) or error — skip
      // If no ex-dates but has annualRate, synthesize quarterly dates from today
      const effectiveDiv = { ...div };
      if (!effectiveDiv.exDate && !effectiveDiv.nextExDate && effectiveDiv.annualRate > 0) {
        // Estimate based on annual rate: place quarterly dates starting next month
        const now = new Date();
        const next = new Date(now.getFullYear(), now.getMonth() + 1, 15);
        effectiveDiv.nextExDate = next.toISOString().slice(0,10);
        if (!effectiveDiv.payments) effectiveDiv.payments = 4;
      }
      if (!effectiveDiv.exDate && !effectiveDiv.nextExDate) continue;
      const dates = estimateDates(effectiveDiv, pos.symbol);
      for (const ev of dates) {
        const d = new Date(ev.date);
        if (d.getFullYear() !== viewYear) continue;
        const m = d.getMonth();
        const payDate = new Date(d);
        payDate.setDate(payDate.getDate() + 14);
        const perShare = ev.amount ?? (div.annualRate / (div.payments || 4));
        let totalUSD = null;
        if (pos.qty) {
          totalUSD = perShare * pos.qty;
        } else if (pos.fictAllocated && div.yieldPct) {
          totalUSD = pos.fictAllocated * (div.yieldPct / 100) / (div.payments || 4);
        }
        result.push({
          month:m, exDate:ev.date,
          payDate:payDate.toISOString().slice(0,10),
          symbol:pos.symbol, name:pos.name,
          isEstimate:ev.isEstimate,
          perShare, totalUSD, qty:pos.qty,
        });
      }
    }
    return result.sort((a,b)=>a.exDate.localeCompare(b.exDate));
  }, [positions, divCache, viewYear]);

  const monthly = useMemo(() => {
    const arr = Array.from({length:12}, (_,i) => ({ month:i, events:[], totalUSD:0 }));
    for (const ev of events) {
      arr[ev.month].events.push(ev);
      arr[ev.month].totalUSD += ev.totalUSD ?? 0;
    }
    return arr;
  }, [events]);

  const annualTotal = monthly.reduce((s,m)=>s+m.totalUSD, 0);

  // Build a lookup map from allNodes for tooltip data (symbol → full node)
  const nodeMap = useMemo(() => {
    const m = {};
    for (const n of (allNodes || [])) m[n.symbol] = n;
    return m;
  }, [allNodes]);

  // Build tooltip cell data for a given symbol
  const makeCellData = (symbol) => {
    const n = nodeMap[symbol];
    if (!n) return { symbol };
    return {
      symbol: n.symbol,
      name: n.name,
      longName: n.longName,
      currentPriceUSD: n.currentPriceUSD,
      valueUSD: n.valueUSD,
      costUSD: n.costUSD,
      gainLossUSD: n.gainLossUSD,
      qty: n.qty,
      perf: n.perf,
      glPerf: n.glPerf,
      weight: n.weight,
      trailingPE: n.trailingPE,
      forwardPE: n.forwardPE,
    };
  };

  const symColors = useMemo(() => {
    const syms    = [...new Set(events.map(e=>e.symbol))];
    const palette = ["#60a5fa","#4ade80","#fbbf24","#f87171","#a78bfa",
                     "#34d399","#fb923c","#e879f9","#22d3ee","#facc15"];
    return Object.fromEntries(syms.map((s,i)=>[s, palette[i%palette.length]]));
  }, [events]);

  const selEvents = selected != null ? monthly[selected].events : events;

  // Loading state: positions present but divCache still loading
  const pendingSymbols = positions.filter(p => divCache?.[p.symbol] === null).length;
  const loadedSymbols  = positions.filter(p => divCache?.[p.symbol] != null &&
    divCache[p.symbol] !== null).length;

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      <SectionHeader
        title="Dividend Calendar"
        subtitle={isEtfMode
          ? "Estimated ex-dividend dates for ETF holdings"
          : "Expected dividend payments for your positions"}
        action={
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {/* View toggle */}
            <div style={{ display:"flex", gap:2, padding:"2px", borderRadius:8,
              background:"rgba(255,255,255,0.05)", border:`1px solid ${C.border}` }}>
              {[["calendar","📅 Calendar"],["barchart","📊 Bar Chart"]].map(([v,label]) => (
                <button key={v} onClick={()=>setChartView(v)} style={{
                  padding:"4px 10px", borderRadius:6, border:"none",
                  background:chartView===v?"rgba(59,130,246,0.25)":"transparent",
                  color:chartView===v?C.accent:C.text3,
                  fontSize:10, fontWeight:chartView===v?700:400,
                  cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s",
                }}>{label}</button>
              ))}
            </div>
            {/* Year nav */}
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <button onClick={()=>setViewYear(v=>v-1)} style={{ background:"none", border:"none",
                cursor:"pointer", color:C.text3, fontSize:14, padding:"0 4px", display:"flex" }}>‹</button>
              <span style={{ fontSize:13, fontWeight:700, color:C.text1, fontFamily:C.mono,
                minWidth:36, textAlign:"center" }}>{viewYear}</span>
              <button onClick={()=>setViewYear(v=>v+1)} style={{ background:"none", border:"none",
                cursor:"pointer", color:C.text3, fontSize:14, padding:"0 4px", display:"flex" }}>›</button>
            </div>
          </div>
        }
      />

      {/* Fictitious portfolio selector (ETF mode) */}
      {isEtfMode && (
        <div style={{ padding:"0 22px 10px", display:"flex", alignItems:"center",
          gap:12, flexShrink:0, flexWrap:"wrap" }}>
          <span style={{ fontSize:11, color:C.text3 }}>Simulated portfolio:</span>
          {[10000,20000,50000,100000].map(v => (
            <button key={v} onClick={()=>setFictValue(v)} style={{
              padding:"4px 10px", borderRadius:7,
              border:`1px solid ${fictValue===v?C.accent:C.border}`,
              background:fictValue===v?"rgba(59,130,246,0.15)":"transparent",
              color:fictValue===v?C.accent:C.text3,
              fontSize:10, fontWeight:fictValue===v?700:400,
              cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s",
            }}>{v>=1000?`${v/1000}K`:v} {currency}</button>
          ))}
          {annualTotal > 0 && (
            <div style={{ marginLeft:"auto", display:"flex", alignItems:"baseline", gap:6 }}>
              <span style={{ fontSize:10, color:C.text3 }}>Est. annual</span>
              <span style={{ fontSize:20, fontFamily:C.mono, fontWeight:700, color:C.green,
                letterSpacing:"-0.03em" }}>
                {cSym}{(annualTotal*rate).toFixed(0)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Loading indicator */}
      {pendingSymbols > 0 && (
        <div style={{ padding:"4px 22px", fontSize:10, color:C.text3, display:"flex",
          alignItems:"center", gap:6, flexShrink:0 }}>
          <span style={{ width:6, height:6, borderRadius:"50%", background:C.accent,
            display:"inline-block", animation:"pulse 1.2s infinite" }}/>
          Loading dividend data… ({loadedSymbols}/{loadedSymbols+pendingSymbols} positions)
        </div>
      )}

      {/* Annual total strip (portfolio mode) — prominent hero display */}
      {!isEtfMode && annualTotal > 0 && (
        <div style={{ padding:"8px 22px 10px", flexShrink:0,
          background:"rgba(74,222,128,0.04)", borderBottom:`1px solid rgba(74,222,128,0.12)` }}>
          <div style={{ display:"flex", alignItems:"baseline", gap:10, flexWrap:"wrap" }}>
            <div style={{ display:"flex", flexDirection:"column" }}>
              <span style={{ fontSize:9, color:C.text3, textTransform:"uppercase",
                letterSpacing:"0.08em", fontWeight:700 }}>Est. Annual Dividends</span>
              <span style={{ fontFamily:C.mono, fontSize:30, fontWeight:700, color:C.green,
                letterSpacing:"-0.04em", lineHeight:1.1 }}>
                {cSym}{(annualTotal*rate).toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0})}
              </span>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
              <span style={{ fontFamily:C.mono, fontSize:13, fontWeight:600,
                color:"rgba(74,222,128,0.7)" }}>
                {cSym}{((annualTotal*rate)/12).toFixed(0)}<span style={{ fontSize:9,
                  color:C.text3, fontWeight:400, marginLeft:3 }}>/mo</span>
              </span>
              <span style={{ fontSize:9, color:C.text3 }}>
                {events.filter(e=>e.isEstimate).length > 0 ? "incl. estimated" : "confirmed dates"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── BAR CHART VIEW ── */}
      {chartView === "barchart" && (
        <div style={{ flex:1, overflow:"auto", position:"relative", minHeight:0 }}>
          {events.length === 0 ? (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
              justifyContent:"center", height:"100%", gap:8, color:C.text3 }}>
              <span style={{ fontSize:32, opacity:0.5 }}>📊</span>
              <div style={{ fontSize:13, color:C.text2, fontWeight:600 }}>No dividend events in {viewYear}</div>
              <div style={{ fontSize:11 }}>Dividend data loads automatically for each position.</div>
              {onRefreshDivs && (
                <button onClick={onRefreshDivs} style={{
                  marginTop:8, padding:"6px 14px", borderRadius:8, border:`1px solid ${C.border}`,
                  background:"transparent", color:C.text3, fontSize:11,
                  cursor:"pointer", fontFamily:"inherit",
                }}>↻ Reload dividend data</button>
              )}
            </div>
          ) : (
            <DivBarChart monthly={monthly} currency={currency} cSym={cSym}
              rate={rate} symColors={symColors} year={viewYear}
              onSymbolHover={onCellHover ? (e, sym) => onCellHover(e, makeCellData(sym)) : undefined}
              onSymbolLeave={onCellLeave}/>
          )}
        </div>
      )}

      {/* ── CALENDAR VIEW ── */}
      {chartView === "calendar" && (
        <div style={{ flex:1, display:"flex", overflow:"hidden" }}>
          {/* Month grid */}
          <div style={{ flex:1, overflowY:"auto", padding:"0 0 8px" }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)" }}>
              {monthly.map((m, i) => {
                const isNow  = i === now.getMonth() && viewYear === now.getFullYear();
                const isSel  = selected === i;
                const hasEvt = m.events.length > 0;
                return (
                  <div key={i}
                    onClick={() => setSelected(isSel ? null : i)}
                    style={{
                      padding:"10px 12px", cursor:"pointer",
                      borderBottom:`1px solid ${C.border2}`,
                      borderRight:`1px solid ${C.border2}`,
                      background: isSel ? "rgba(59,130,246,0.08)"
                        : isNow  ? "rgba(59,130,246,0.04)" : "transparent",
                      transition:"background 0.15s",
                    }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                      marginBottom:6 }}>
                      <span style={{ fontSize:12, fontWeight:700,
                        color:isSel?C.accent:isNow?C.accent:C.text2 }}>
                        {MONTH_NAMES[i]}
                        {isNow && <span style={{ marginLeft:4, width:5, height:5,
                          borderRadius:"50%", background:C.accent,
                          display:"inline-block", verticalAlign:"middle" }}/>}
                      </span>
                      {hasEvt && (
                        <span style={{ fontFamily:C.mono, fontSize:10, fontWeight:700,
                          color:C.green }}>
                          {cSym}{(m.totalUSD*rate).toFixed(0)}
                        </span>
                      )}
                    </div>
                    {/* Event dots */}
                    <div style={{ display:"flex", flexWrap:"wrap", gap:3 }}>
                      {m.events.map(ev => (
                        <div key={ev.symbol+ev.exDate}
                          onMouseEnter={onCellHover ? e => onCellHover(e, makeCellData(ev.symbol)) : undefined}
                          onMouseLeave={onCellLeave}
                          style={{
                            padding:"1px 5px", borderRadius:4, fontSize:8, fontWeight:700,
                            fontFamily:C.mono,
                            background:`${symColors[ev.symbol]||C.accent}22`,
                            color:symColors[ev.symbol]||C.accent,
                            border:`1px solid ${symColors[ev.symbol]||C.accent}33`,
                            opacity:ev.isEstimate?0.7:1,
                            cursor: onCellHover ? "pointer" : "default",
                          }}>
                          {ev.symbol}
                        </div>
                      ))}
                    </div>
                    {/* Mini income bar */}
                    {hasEvt && (
                      <div style={{ marginTop:6, height:2, borderRadius:1,
                        background:"rgba(255,255,255,0.08)", overflow:"hidden" }}>
                        <div style={{ height:"100%", borderRadius:1,
                          width:`${Math.min(100,(m.totalUSD/Math.max(...monthly.map(x=>x.totalUSD),0.01))*100)}%`,
                          background:C.accent, opacity:0.6 }}/>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right panel: selected month events */}
          <div style={{ width:280, flexShrink:0, borderLeft:`1px solid ${C.border2}`,
            overflowY:"auto", padding:"12px 0" }}>
            <div style={{ padding:"0 14px 8px", fontSize:10, color:C.text3, fontWeight:700,
              textTransform:"uppercase", letterSpacing:"0.08em" }}>
              {selected !== null ? MONTH_NAMES[selected] : "All"} — {selEvents.length} event{selEvents.length!==1?"s":""}
            </div>

            {selEvents.length === 0 ? (
              <div style={{ padding:"20px 14px", textAlign:"center", color:C.text3, fontSize:11,
                lineHeight:1.6 }}>
                No dividend events for {selected !== null ? MONTH_NAMES[selected] : "this year"}.
                <br/>Dividend data loads per position automatically.
                {onRefreshDivs && (
                  <div style={{ marginTop:10 }}>
                    <button onClick={onRefreshDivs} style={{
                      padding:"5px 12px", borderRadius:7, border:`1px solid ${C.border}`,
                      background:"transparent", color:C.text3, fontSize:10,
                      cursor:"pointer", fontFamily:"inherit",
                    }}>↻ Reload dividend data</button>
                  </div>
                )}
              </div>
            ) : (
              selEvents.map(ev => (
                <div key={ev.symbol+ev.exDate+ev.month} style={{
                  padding:"8px 14px", borderBottom:`1px solid ${C.border2}`,
                }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                    <div style={{ width:6, height:6, borderRadius:2, flexShrink:0,
                      background:symColors[ev.symbol]||C.accent }}/>
                    <span
                      onMouseEnter={onCellHover ? e => onCellHover(e, makeCellData(ev.symbol)) : undefined}
                      onMouseLeave={onCellLeave}
                      style={{ fontFamily:C.mono, fontSize:11, fontWeight:700,
                        color:symColors[ev.symbol]||C.accent,
                        cursor: onCellHover ? "pointer" : "default",
                        textDecoration: onCellHover ? "underline dotted" : "none",
                        textUnderlineOffset: 2,
                      }}>{ev.symbol}</span>
                    {ev.isEstimate && (
                      <span style={{ fontSize:8, padding:"1px 5px", borderRadius:4,
                        background:"rgba(251,191,36,0.12)", color:C.yellow,
                        border:"1px solid rgba(251,191,36,0.25)" }}>est.</span>
                    )}
                    {ev.totalUSD && (
                      <span style={{ marginLeft:"auto", fontFamily:C.mono, fontSize:11,
                        fontWeight:700, color:C.green }}>
                        {cSym}{(ev.totalUSD*rate).toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div style={{ display:"flex", gap:16, paddingLeft:14 }}>
                    <div>
                      <div style={{ fontSize:8, color:C.text3, marginBottom:1 }}>Ex-Date</div>
                      <div style={{ fontSize:10, color:C.text2, fontFamily:C.mono }}>{ev.exDate}</div>
                    </div>
                    {ev.perShare && (
                      <div>
                        <div style={{ fontSize:8, color:C.text3, marginBottom:1 }}>Per Share</div>
                        <div style={{ fontSize:10, color:C.text2, fontFamily:C.mono }}>
                          {cSym}{(ev.perShare*(rates[currency]??1)).toFixed(3)}
                        </div>
                      </div>
                    )}
                    {ev.qty && (
                      <div>
                        <div style={{ fontSize:8, color:C.text3, marginBottom:1 }}>Shares</div>
                        <div style={{ fontSize:10, color:C.text2, fontFamily:C.mono }}>
                          {ev.qty.toFixed(2)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
