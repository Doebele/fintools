/**
 * Portfolio Analytics — Correlation · Monte Carlo · Rebalancing · Dividend Calendar
 */
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import * as d3 from "d3";

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

export function MonteCarlo({ allNodes, quotes, rates, divCache }) {
  const rate = rates["USD"] ?? 1;

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
                {fmt$(totalValueUSD)}
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
                          color:C.text1, marginTop:3 }}>{fmt$(v)}</div>
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
// 3. REBALANCING ASSISTANT
// ══════════════════════════════════════════════════════════════════════════════
export function RebalancingAssistant({ allNodes, quotes, rates, currency, user }) {
  const rate = rates[currency] ?? 1;
  const cSym = { USD:"$", EUR:"€", CHF:"Fr.", GBP:"£" }[currency] ?? "$";

  // Build unique positions with current value
  const positions = useMemo(() => {
    const map = {};
    for (const n of allNodes) {
      if (!n.symbol) continue;
      if (!map[n.symbol]) map[n.symbol] = {
        symbol:n.symbol, name:n.name||n.symbol,
        valueUSD:0, sector:"Other",
      };
      map[n.symbol].valueUSD += n.valueUSD ?? 0;
    }
    return Object.values(map).sort((a,b)=>b.valueUSD-a.valueUSD);
  }, [allNodes]);

  const totalValueUSD = positions.reduce((s,p)=>s+p.valueUSD,0);

  // Target weights — loaded from server, stored locally as { ticker: %, sector: label }
  const [targets,     setTargets]    = useState({}); // { "AAPL": { tickerPct:25, sector:"Tech" } }
  const [cashAdd,     setCashAdd]    = useState(0);   // additional cash to invest
  const [saving,      setSaving]     = useState(false);
  const [saved,       setSaved]      = useState(false);
  const [threshold,   setThreshold]  = useState(5);  // % drift threshold to flag
  const [mode,        setMode]       = useState("both"); // buy|sell|both
  const [editSector,  setEditSector] = useState(null);

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

  const setTarget = (sym, pct) => {
    setTargets(prev => ({ ...prev, [sym]: { ...(prev[sym]||{}), tickerPct:pct } }));
  };
  const setSector = (sym, sector) => {
    setTargets(prev => ({ ...prev, [sym]: { ...(prev[sym]||{}), sector } }));
  };

  const totalTarget = Object.values(targets).reduce((s,t)=>s+(t.tickerPct||0),0);

  // Compute rebalancing actions
  const actions = useMemo(() => {
    const total = totalValueUSD + cashAdd;
    if (total <= 0) return [];
    return positions.map(pos => {
      const t   = targets[pos.symbol];
      const tgt = (t?.tickerPct || 0) / 100;
      const cur = totalValueUSD > 0 ? pos.valueUSD / totalValueUSD : 0;
      const targetValueUSD  = total * tgt;
      const currentValueUSD = pos.valueUSD;
      const diffUSD  = targetValueUSD - currentValueUSD;
      const driftPct = cur > 0 ? ((cur - tgt) / tgt) * 100 : tgt > 0 ? -100 : 0;
      const q        = quotes[pos.symbol];
      const qCcy     = q?.currency;
      const qRate    = (qCcy && qCcy!=="USD") ? (rates[qCcy]??1) : 1;
      const priceUSD = q ? (qRate>0 ? q.price/qRate : q.price) : null;
      const shares   = priceUSD && priceUSD > 0 ? Math.round(Math.abs(diffUSD)/priceUSD * 10)/10 : null;
      return {
        ...pos, tgtPct:tgt*100, curPct:cur*100, diffUSD, driftPct,
        priceUSD, shares, action: diffUSD > 0 ? "BUY" : diffUSD < 0 ? "SELL" : "OK",
        sector: t?.sector || "Other",
      };
    });
  }, [positions, targets, totalValueUSD, cashAdd, quotes, rates]);

  const sectorGroups = useMemo(() => {
    const map = {};
    for (const a of actions) {
      if (!map[a.sector]) map[a.sector] = { sector:a.sector, tgtPct:0, curPct:0, valueUSD:0 };
      map[a.sector].tgtPct  += a.tgtPct;
      map[a.sector].curPct  += a.curPct;
      map[a.sector].valueUSD+= a.valueUSD;
    }
    return Object.values(map).sort((a,b)=>b.valueUSD-a.valueUSD);
  }, [actions]);

  const flagged = actions.filter(a =>
    Math.abs(a.driftPct) > threshold &&
    (mode==="both" || (mode==="buy"&&a.action==="BUY") || (mode==="sell"&&a.action==="SELL"))
  );

  const SECTORS = ["Tech","Healthcare","Finance","Energy","Consumer","Industrials","Materials","Utilities","Real Estate","ETF","Bonds","Other"];

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      <SectionHeader
        title="Rebalancing Assistant"
        subtitle="Set target weights per position and sector — get concrete buy/sell suggestions"
        action={
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {!user && <Pill label="Sign in to save targets" color={C.yellow}/>}
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

      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>
        {/* Left: target editor */}
        <div style={{ width:340, flexShrink:0, overflowY:"auto",
          borderRight:`1px solid ${C.border2}`, padding:"0 0 16px" }}>

          {/* Cash addition input */}
          <div style={{ padding:"8px 16px 12px", borderBottom:`1px solid ${C.border2}` }}>
            <div style={{ fontSize:10, color:C.text3, fontWeight:700, textTransform:"uppercase",
              letterSpacing:"0.08em", marginBottom:8 }}>Settings</div>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
              <label style={{ fontSize:11, color:C.text2, whiteSpace:"nowrap" }}>Cash to invest:</label>
              <input type="number" value={cashAdd} min={0} step={100}
                onChange={e=>setCashAdd(+e.target.value)}
                style={{ background:"rgba(255,255,255,0.05)", border:`1px solid ${C.border}`,
                  borderRadius:6, color:C.text1, padding:"4px 8px", fontSize:12,
                  fontFamily:C.mono, width:100, outline:"none" }}/>
              <span style={{ fontSize:11, color:C.text3 }}>{currency}</span>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <label style={{ fontSize:11, color:C.text2, whiteSpace:"nowrap" }}>Drift threshold:</label>
              <input type="number" value={threshold} min={1} max={30} step={1}
                onChange={e=>setThreshold(+e.target.value)}
                style={{ background:"rgba(255,255,255,0.05)", border:`1px solid ${C.border}`,
                  borderRadius:6, color:C.text1, padding:"4px 8px", fontSize:12,
                  fontFamily:C.mono, width:60, outline:"none" }}/>
              <span style={{ fontSize:11, color:C.text3 }}>%</span>
              <div style={{ marginLeft:"auto", display:"flex", gap:4 }}>
                {["buy","both","sell"].map(m => (
                  <button key={m} onClick={()=>setMode(m)} style={{
                    padding:"3px 8px", borderRadius:5, border:`1px solid ${mode===m?
                      (m==="buy"?C.green:m==="sell"?C.red:C.accent):C.border}`,
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

          {/* Position targets */}
          <div style={{ padding:"8px 0" }}>
            <div style={{ padding:"4px 16px 6px", fontSize:10, color:C.text3, fontWeight:700,
              textTransform:"uppercase", letterSpacing:"0.08em" }}>Position Targets</div>
            {positions.map(pos => {
              const t   = targets[pos.symbol] || {};
              const cur = totalValueUSD>0 ? (pos.valueUSD/totalValueUSD*100).toFixed(1) : "0";
              return (
                <div key={pos.symbol} style={{ padding:"6px 16px",
                  borderBottom:`1px solid ${C.border2}` }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontFamily:C.mono, fontSize:11, fontWeight:700,
                      color:C.accent, width:70, flexShrink:0 }}>{pos.symbol}</span>
                    <div style={{ flex:1 }}>
                      <input type="range" min={0} max={100} step={1}
                        value={t.tickerPct||0}
                        onChange={e=>setTarget(pos.symbol, +e.target.value)}
                        style={{ width:"100%", accentColor:C.accent }}/>
                    </div>
                    <input type="number" min={0} max={100} step={0.5}
                      value={t.tickerPct||""}
                      placeholder="0"
                      onChange={e=>setTarget(pos.symbol, +e.target.value)}
                      style={{ width:42, background:"rgba(255,255,255,0.05)",
                        border:`1px solid ${C.border}`, borderRadius:5, color:C.text1,
                        padding:"2px 5px", fontSize:11, fontFamily:C.mono, outline:"none",
                        textAlign:"right" }}/>
                    <span style={{ fontSize:10, color:C.text3, width:14 }}>%</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:2 }}>
                    <span style={{ fontSize:9, color:C.text3 }}>Now {cur}%</span>
                    <select value={t.sector||"Other"}
                      onChange={e=>setSector(pos.symbol, e.target.value)}
                      style={{ marginLeft:"auto", background:"rgba(255,255,255,0.05)",
                        border:`1px solid ${C.border}`, borderRadius:5, color:C.text3,
                        padding:"1px 4px", fontSize:9, fontFamily:"inherit", outline:"none",
                        cursor:"pointer" }}>
                      {SECTORS.map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: actions + sector view */}
        <div style={{ flex:1, overflowY:"auto", padding:"0 0 16px" }}>
          {/* Sector summary */}
          <div style={{ padding:"8px 20px 12px", borderBottom:`1px solid ${C.border2}` }}>
            <div style={{ fontSize:10, color:C.text3, fontWeight:700, textTransform:"uppercase",
              letterSpacing:"0.08em", marginBottom:8 }}>Sector Allocation</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {sectorGroups.map(sg => {
                const drift = sg.tgtPct>0 ? (sg.curPct-sg.tgtPct) : 0;
                return (
                  <div key={sg.sector} style={{ padding:"6px 10px", borderRadius:8,
                    background:C.surface2, border:`1px solid ${Math.abs(drift)>threshold?"rgba(248,113,113,0.3)":C.border}` }}>
                    <div style={{ fontSize:9, color:C.text3, marginBottom:2 }}>{sg.sector}</div>
                    <div style={{ display:"flex", gap:6, alignItems:"baseline" }}>
                      <span style={{ fontFamily:C.mono, fontSize:12, fontWeight:700, color:C.text1 }}>
                        {sg.curPct.toFixed(1)}%
                      </span>
                      {sg.tgtPct>0 && (
                        <span style={{ fontSize:9, color:Math.abs(drift)>threshold?C.red:C.text3 }}>
                          tgt {sg.tgtPct.toFixed(1)}%
                          {drift!==0 && ` (${drift>0?"+":""}${drift.toFixed(1)}%)`}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action table */}
          <div style={{ padding:"10px 20px 0" }}>
            <div style={{ fontSize:10, color:C.text3, fontWeight:700, textTransform:"uppercase",
              letterSpacing:"0.08em", marginBottom:8 }}>
              {flagged.length ? `${flagged.length} actions needed (>${threshold}% drift)` : "All positions within threshold ✓"}
            </div>

            {actions
              .filter(a => mode==="both" || a.action===mode.toUpperCase() || a.action==="OK")
              .map(a => {
                const isFlag = Math.abs(a.driftPct) > threshold && a.action!=="OK";
                const aColor = a.action==="BUY"?C.green:a.action==="SELL"?C.red:C.text3;
                return (
                  <div key={a.symbol} style={{
                    display:"flex", alignItems:"center", gap:12, padding:"8px 12px",
                    borderRadius:8, marginBottom:4,
                    background:isFlag?`${aColor}08`:"transparent",
                    border:`1px solid ${isFlag?`${aColor}20`:C.border2}`,
                    transition:"background 0.1s",
                  }}>
                    <div style={{ width:70, flexShrink:0 }}>
                      <div style={{ fontFamily:C.mono, fontSize:11, fontWeight:700, color:C.accent }}>
                        {a.symbol}
                      </div>
                      <div style={{ fontSize:9, color:C.text3, marginTop:1 }}>{a.sector}</div>
                    </div>

                    {/* Progress bars */}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:4, marginBottom:3 }}>
                        <div style={{ flex:1, height:5, background:"rgba(255,255,255,0.08)", borderRadius:3, overflow:"hidden" }}>
                          <div style={{ height:"100%", borderRadius:3, transition:"width 0.3s",
                            background:C.accent, width:`${Math.min(100,a.curPct)}%` }}/>
                        </div>
                        <span style={{ fontFamily:C.mono, fontSize:9, color:C.text2, width:38, textAlign:"right" }}>
                          {a.curPct.toFixed(1)}%
                        </span>
                      </div>
                      {a.tgtPct > 0 && (
                        <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                          <div style={{ flex:1, height:5, background:"rgba(255,255,255,0.04)", borderRadius:3, overflow:"hidden",
                            border:`1px dashed ${C.border}` }}>
                            <div style={{ height:"100%", borderRadius:3,
                              background:"rgba(255,255,255,0.2)", width:`${Math.min(100,a.tgtPct)}%` }}/>
                          </div>
                          <span style={{ fontFamily:C.mono, fontSize:9, color:C.text3, width:38, textAlign:"right" }}>
                            {a.tgtPct.toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Value */}
                    <div style={{ textAlign:"right", width:80, flexShrink:0 }}>
                      <div style={{ fontFamily:C.mono, fontSize:11, color:C.text2 }}>
                        {fmt$(a.valueUSD * (rates[currency]??1))}
                      </div>
                    </div>

                    {/* Action */}
                    {a.tgtPct > 0 && a.action !== "OK" && (
                      <div style={{ textAlign:"right", flexShrink:0, minWidth:110 }}>
                        <div style={{ padding:"3px 8px", borderRadius:6, display:"inline-flex",
                          alignItems:"center", gap:5,
                          background:`${aColor}15`, border:`1px solid ${aColor}30` }}>
                          <span style={{ fontSize:9, fontWeight:700, color:aColor, textTransform:"uppercase" }}>
                            {a.action}
                          </span>
                          <span style={{ fontFamily:C.mono, fontSize:10, color:aColor, fontWeight:700 }}>
                            {fmt$(Math.abs(a.diffUSD) * (rates[currency]??1))}
                          </span>
                        </div>
                        {a.shares && a.priceUSD && (
                          <div style={{ fontSize:9, color:C.text3, marginTop:2 }}>
                            ≈ {a.shares} shares @ {fmt$(a.priceUSD*(rates[currency]??1), 2)}
                          </div>
                        )}
                        {isFlag && (
                          <div style={{ fontSize:9, color:aColor, opacity:0.8 }}>
                            {a.driftPct>0?"+":""}{a.driftPct.toFixed(1)}% drift
                          </div>
                        )}
                      </div>
                    )}
                    {a.tgtPct > 0 && a.action === "OK" && (
                      <div style={{ width:110, textAlign:"right", flexShrink:0 }}>
                        <span style={{ fontSize:10, color:C.green }}>✓ On target</span>
                      </div>
                    )}
                    {a.tgtPct === 0 && (
                      <div style={{ width:110, textAlign:"right", flexShrink:0 }}>
                        <span style={{ fontSize:9, color:C.text3 }}>No target set</span>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. DIVIDEND CALENDAR
// ══════════════════════════════════════════════════════════════════════════════
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function estimateDates(divData, symbol) {
  // Returns array of { date, amount, symbol, isEstimate }
  if (!divData) return [];
  const result = [];

  if (divData.exDate) {
    result.push({ date:divData.exDate, amount:divData.lastAmt, symbol, isEstimate:false });
  }
  if (divData.nextExDate) {
    result.push({ date:divData.nextExDate, amount:divData.lastAmt, symbol, isEstimate:true });
    // Project 3 more quarters forward if quarterly
    const freq = divData.payments >= 4 ? 3 : divData.payments >= 2 ? 6 : 12; // months between payments
    if (freq <= 6) {
      const d = new Date(divData.nextExDate);
      for (let i = 1; i <= 3; i++) {
        d.setMonth(d.getMonth() + freq);
        const dateStr = d.toISOString().slice(0,10);
        const now = new Date();
        if (d > now) {
          result.push({ date:dateStr, amount:divData.lastAmt, symbol, isEstimate:true });
        }
      }
    }
  }
  return result;
}

export function DividendCalendar({ allNodes, divCache, etfHoldings, isEtfMode, currency, rates }) {
  const rate = rates[currency] ?? 1;
  const cSym = { USD:"$", EUR:"€", CHF:"Fr.", GBP:"£" }[currency] ?? "$";
  const now  = new Date();
  const [viewYear,     setViewYear]     = useState(now.getFullYear());
  const [selected,     setSelected]     = useState(null); // selected month index
  const [fictValue,    setFictValue]    = useState(10000); // ETF mode: fictitious portfolio value

  // Build positions with quantities
  const positions = useMemo(() => {
    if (isEtfMode) {
      // ETF mode: simulate quantities based on fictitious portfolio value + weight
      return (etfHoldings || []).map(h => {
        const q = divCache?.[h.symbol];
        const price = q?.yieldPct != null ? null : null; // price from divCache not available here
        // Estimate shares: fictValue * weight% / price (price not available here → use weight for payout)
        const allocatedUSD = fictValue * (h.weight / 100);
        return {
          symbol:h.symbol, name:h.name,
          qty:null, // qty unknown without price — use allocatedUSD for payout
          valueUSD: allocatedUSD,
          isEtfFict: true,
          fictAllocated: allocatedUSD,
        };
      });
    }
    // Portfolio mode: aggregate from nodes
    const map = {};
    for (const n of allNodes) {
      if (!n.symbol) continue;
      if (!map[n.symbol]) map[n.symbol] = { symbol:n.symbol, name:n.name||n.symbol, qty:0, valueUSD:0 };
      map[n.symbol].qty      += n.qty ?? 0;
      map[n.symbol].valueUSD += n.valueUSD ?? 0;
    }
    return Object.values(map);
  }, [allNodes, etfHoldings, isEtfMode, fictValue]);

  // Build calendar events
  const events = useMemo(() => {
    const result = [];
    for (const pos of positions) {
      const div = divCache?.[pos.symbol];
      if (!div || (!div.exDate && !div.nextExDate)) continue;
      const dates = estimateDates(div, pos.symbol);
      for (const ev of dates) {
        const d = new Date(ev.date);
        if (d.getFullYear() !== viewYear) continue;
        const m = d.getMonth();
        // Expected payout (2 weeks after ex-date typically)
        const payDate = new Date(d);
        payDate.setDate(payDate.getDate() + 14);
        // Amount per position
        const perShare  = ev.amount ?? div.annualRate / (div.payments || 4);
        // For ETF mode: estimate income from allocated value × div yield / payments
        let totalUSD = null;
        if (pos.qty) {
          totalUSD = perShare * pos.qty;
        } else if (pos.fictAllocated && div.yieldPct) {
          // annual yield / payments per year
          const paymentsPerYear = div.payments || 4;
          totalUSD = pos.fictAllocated * (div.yieldPct / 100) / paymentsPerYear;
        }
        result.push({
          month: m,
          exDate: ev.date,
          payDate: payDate.toISOString().slice(0,10),
          symbol: pos.symbol,
          name: pos.name,
          isEstimate: ev.isEstimate,
          perShare, totalUSD,
          qty: pos.qty,
        });
      }
    }
    return result.sort((a,b) => a.exDate.localeCompare(b.exDate));
  }, [positions, divCache, viewYear]);

  // Monthly summary
  const monthly = useMemo(() => {
    const arr = Array.from({length:12}, (_,i) => ({ month:i, events:[], totalUSD:0 }));
    for (const ev of events) {
      arr[ev.month].events.push(ev);
      arr[ev.month].totalUSD += ev.totalUSD ?? 0;
    }
    return arr;
  }, [events]);

  const annualTotal = monthly.reduce((s,m)=>s+m.totalUSD,0);
  const symColors   = useMemo(() => {
    const syms  = [...new Set(events.map(e=>e.symbol))];
    const palette = ["#60a5fa","#4ade80","#fbbf24","#f87171","#a78bfa","#34d399","#fb923c","#e879f9"];
    return Object.fromEntries(syms.map((s,i)=>[s, palette[i % palette.length]]));
  }, [events]);

  const selEvents = selected != null ? monthly[selected].events : events;

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      <SectionHeader
        title="Dividend Calendar"
        subtitle={isEtfMode ? "Estimated ex-dividend dates for ETF holdings" : "Expected dividend payments for your positions"}
        action={
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <button onClick={()=>setViewYear(y=>y-1)} style={{
              padding:"3px 10px", borderRadius:6, border:`1px solid ${C.border}`,
              background:"transparent", color:C.text2, cursor:"pointer",fontFamily:"inherit",fontSize:12,
            }}>‹ {viewYear-1}</button>
            <span style={{ fontFamily:C.mono, fontSize:14, fontWeight:700, color:C.text1 }}>{viewYear}</span>
            <button onClick={()=>setViewYear(y=>y+1)} style={{
              padding:"3px 10px", borderRadius:6, border:`1px solid ${C.border}`,
              background:"transparent", color:C.text2, cursor:"pointer",fontFamily:"inherit",fontSize:12,
            }}>{viewYear+1} ›</button>
          </div>
        }
      />

      {/* ETF mode: fictitious portfolio size selector */}
      {isEtfMode && (
        <div style={{ padding:"0 22px 10px", display:"flex", alignItems:"center", gap:12,
          borderBottom:`1px solid ${C.border2}`, flexShrink:0 }}>
          <span style={{ fontSize:11, color:C.text3 }}>Simulated portfolio:</span>
          {[10000, 20000, 50000, 100000].map(v => (
            <button key={v} onClick={()=>setFictValue(v)} style={{
              padding:"4px 12px", borderRadius:7,
              border:`1px solid ${fictValue===v?C.accent:C.border}`,
              background:fictValue===v?"rgba(59,130,246,0.15)":"transparent",
              color:fictValue===v?C.accent:C.text3,
              fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit",
            }}>
              {v >= 1000 ? `${v/1000}K` : v} {currency}
            </button>
          ))}
          {annualTotal > 0 && (
            <div style={{ marginLeft:"auto", fontFamily:C.mono }}>
              <span style={{ fontSize:10, color:C.text3 }}>Est. annual income: </span>
              <span style={{ fontSize:13, fontWeight:700, color:"#fbbf24" }}>
                {cSym}{(annualTotal * rate).toFixed(2)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Annual summary */}
      {!isEtfMode && annualTotal > 0 && (
        <div style={{ padding:"0 22px 10px", display:"flex", alignItems:"center", gap:16,
          borderBottom:`1px solid ${C.border2}`, flexShrink:0 }}>
          <div>
            <div style={{ fontSize:9, color:C.text3, textTransform:"uppercase", letterSpacing:"0.07em" }}>
              Est. Annual Income {viewYear}
            </div>
            <div style={{ fontFamily:C.mono, fontSize:18, fontWeight:700, color:"#fbbf24", marginTop:1 }}>
              {cSym}{(annualTotal * rate).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}
            </div>
          </div>
          <div style={{ fontSize:10, color:C.text3 }}>
            Includes estimates (dashed). Actual amounts may vary.
          </div>
          {selected != null && (
            <button onClick={()=>setSelected(null)} style={{
              marginLeft:"auto", padding:"3px 10px", borderRadius:6,
              border:`1px solid ${C.border}`, background:"transparent",
              color:C.text2, cursor:"pointer", fontSize:11,
            }}>Show all months</button>
          )}
        </div>
      )}

      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>
        {/* Month grid */}
        <div style={{ width:420, flexShrink:0, padding:"12px 16px",
          overflowY:"auto", borderRight:`1px solid ${C.border2}` }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
            {monthly.map((m, mi) => {
              const isNow   = mi === now.getMonth() && viewYear === now.getFullYear();
              const isSel   = selected === mi;
              const hasEvts = m.events.length > 0;
              return (
                <div key={mi}
                  onClick={()=>setSelected(isSel?null:mi)}
                  style={{
                    borderRadius:10, padding:"10px 12px", cursor:hasEvts?"pointer":"default",
                    border:`1px solid ${isSel?C.accent:isNow?"rgba(59,130,246,0.3)":C.border2}`,
                    background:isSel?"rgba(59,130,246,0.12)":isNow?"rgba(59,130,246,0.04)":"transparent",
                    transition:"all 0.12s",
                  }}>
                  <div style={{ fontSize:11, fontWeight:700, color:isSel?C.accent:isNow?C.accent:C.text2,
                    marginBottom:4 }}>
                    {MONTH_NAMES[mi]}
                    {isNow && <span style={{ marginLeft:5, fontSize:8, color:C.accent }}>●</span>}
                  </div>

                  {/* Symbols in this month */}
                  <div style={{ display:"flex", flexWrap:"wrap", gap:3, marginBottom:4 }}>
                    {m.events.map(ev => (
                      <span key={ev.symbol+ev.exDate} style={{
                        fontFamily:C.mono, fontSize:7, fontWeight:700,
                        padding:"1px 4px", borderRadius:3,
                        background:`${symColors[ev.symbol]}20`,
                        color:symColors[ev.symbol],
                        border:`1px solid ${symColors[ev.symbol]}30`,
                        opacity:ev.isEstimate?0.7:1,
                        textDecoration:ev.isEstimate?"none":undefined,
                      }}>{ev.symbol}</span>
                    ))}
                  </div>

                  {/* Monthly total */}
                  {!isEtfMode && m.totalUSD > 0 && (
                    <div style={{ fontFamily:C.mono, fontSize:11, fontWeight:700, color:"#fbbf24" }}>
                      {cSym}{(m.totalUSD * rate).toFixed(2)}
                    </div>
                  )}
                  {isEtfMode && m.events.length > 0 && (
                    <div style={{ fontSize:9, color:C.text3 }}>
                      {m.events.length} ex-date{m.events.length>1?"s":""}
                    </div>
                  )}
                  {m.events.length === 0 && (
                    <div style={{ fontSize:9, color:"rgba(255,255,255,0.1)" }}>—</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bar chart of monthly income */}
          {!isEtfMode && annualTotal > 0 && (
            <div style={{ marginTop:16 }}>
              <div style={{ fontSize:9, color:C.text3, marginBottom:8, textTransform:"uppercase",
                letterSpacing:"0.07em" }}>Monthly Income Distribution</div>
              <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:48 }}>
                {monthly.map((m,mi) => {
                  const maxMo = Math.max(...monthly.map(x=>x.totalUSD));
                  const h = maxMo > 0 ? (m.totalUSD/maxMo)*44 : 0;
                  return (
                    <div key={mi} style={{ flex:1, display:"flex", flexDirection:"column",
                      alignItems:"center", gap:2 }}>
                      <div style={{ width:"100%", height:h, background:selected===mi?"#fbbf24":"rgba(251,191,36,0.5)",
                        borderRadius:"3px 3px 0 0", transition:"height 0.3s", cursor:"pointer",
                        minHeight: m.totalUSD>0?2:0 }}
                        onClick={()=>setSelected(selected===mi?null:mi)}/>
                      <span style={{ fontSize:7, color:C.text3 }}>{MONTH_NAMES[mi][0]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Event detail list */}
        <div style={{ flex:1, overflowY:"auto", padding:"8px 20px" }}>
          <div style={{ fontSize:10, color:C.text3, textTransform:"uppercase", letterSpacing:"0.07em",
            fontWeight:700, marginBottom:10 }}>
            {selected != null ? MONTH_NAMES[selected] : "All"} — {selEvents.length} event{selEvents.length!==1?"s":""}
          </div>

          {selEvents.length === 0 && (
            <div style={{ color:C.text3, fontSize:13, padding:"20px 0", textAlign:"center" }}>
              No dividend events{selected!=null?" in "+MONTH_NAMES[selected]:""}.<br/>
              <span style={{ fontSize:11 }}>Dividend data loads automatically for each position.</span>
            </div>
          )}

          {selEvents.map((ev, i) => {
            const color = symColors[ev.symbol] ?? C.accent;
            return (
              <div key={ev.symbol+ev.exDate+i} style={{
                padding:"10px 14px", borderRadius:10, marginBottom:6,
                background:ev.isEstimate?"rgba(255,255,255,0.02)":C.surface2,
                border:`1px solid ${ev.isEstimate?C.border2:color+"30"}`,
              }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:6, height:6, borderRadius:"50%", background:color, flexShrink:0 }}/>
                  <span style={{ fontFamily:C.mono, fontSize:12, fontWeight:700, color }}>
                    {ev.symbol}
                  </span>
                  <span style={{ fontSize:11, color:C.text2, flex:1, overflow:"hidden",
                    textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{ev.name}</span>
                  {ev.isEstimate && (
                    <span style={{ fontSize:8, padding:"1px 5px", borderRadius:3,
                      background:"rgba(255,255,255,0.05)", color:C.text3,
                      border:`1px solid ${C.border2}` }}>estimated</span>
                  )}
                </div>
                <div style={{ display:"flex", gap:16, marginTop:6, paddingLeft:16 }}>
                  <div>
                    <div style={{ fontSize:9, color:C.text3 }}>Ex-Div Date</div>
                    <div style={{ fontFamily:C.mono, fontSize:11, color:C.text2, marginTop:1 }}>{ev.exDate}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:9, color:C.text3 }}>Est. Pay Date</div>
                    <div style={{ fontFamily:C.mono, fontSize:11, color:C.text2, marginTop:1 }}>{ev.payDate}</div>
                  </div>
                  {ev.perShare != null && (
                    <div>
                      <div style={{ fontSize:9, color:C.text3 }}>Per Share</div>
                      <div style={{ fontFamily:C.mono, fontSize:11, color:"#fbbf24", marginTop:1 }}>
                        {cSym}{(ev.perShare * rate).toFixed(4)}
                      </div>
                    </div>
                  )}
                  {ev.qty != null && ev.totalUSD != null && (
                    <div>
                      <div style={{ fontSize:9, color:C.text3 }}>Your Income ({ev.qty} shares)</div>
                      <div style={{ fontFamily:C.mono, fontSize:12, fontWeight:700,
                        color:"#fbbf24", marginTop:1 }}>
                        {cSym}{(ev.totalUSD * rate).toFixed(2)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
