/* Charts — TradingView Lightweight Charts via CDN with canvas fallback sparklines.
   Loads lazily so the shell paints before the chart engine. */
let libPromise = null;

function loadLightweightCharts() {
  if (window.LightweightCharts) return Promise.resolve(window.LightweightCharts);
  if (libPromise) return libPromise;
  libPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://unpkg.com/lightweight-charts@4.2.2/dist/lightweight-charts.standalone.production.js";
    s.async = true;
    s.onload = () => resolve(window.LightweightCharts);
    s.onerror = () => reject(new Error("chart-lib-load-failed"));
    document.head.appendChild(s);
  });
  return libPromise;
}

const chartColors = {
  upColor: "#22c55e",
  downColor: "#ef4444",
  borderUp: "#16a34a",
  borderDown: "#dc2626",
  wickUp: "rgba(34,197,94,0.75)",
  wickDown: "rgba(239,68,68,0.75)",
  grid: "rgba(148,163,184,0.08)",
  text: "#94a3b8",
  bg: "transparent",
};

const instances = new WeakMap();

export async function renderCandles(container, candles, opts = {}) {
  if (!container || !candles?.length) return null;
  let LWC;
  try {
    LWC = await loadLightweightCharts();
  } catch {
    container.innerHTML = `<div class="state">${iconFallback()}<p>Chart library unavailable — rendering fallback table.</p>
      <div class="table-wrap" style="max-height:280px;width:100%"><table class="data"><thead><tr><th>Time</th><th class="num">O</th><th class="num">H</th><th class="num">L</th><th class="num">C</th></tr></thead><tbody>
      ${candles.slice(-40).map((c) => `<tr><td>${new Date(c.time).toISOString().slice(5, 16).replace("T", " ")}</td><td class="num">${c.open}</td><td class="num">${c.high}</td><td class="num">${c.low}</td><td class="num">${c.close}</td></tr>`).join("")}
      </tbody></table></div>`;
    return null;
  }

  const old = instances.get(container);
  if (old) { try { old.remove(); } catch { /* noop */ } }

  const chart = LWC.createChart(container, {
    autoSize: true,
    layout: { background: { color: chartColors.bg }, textColor: chartColors.text, fontFamily: "Inter, system-ui, sans-serif", fontSize: 11 },
    grid: { vertLines: { color: chartColors.grid }, horzLines: { color: chartColors.grid } },
    crosshair: {
      mode: 0,
      vertLine: { color: "rgba(148,163,184,0.35)", width: 1, style: 3, labelBackgroundColor: "#2878ff" },
      horzLine: { color: "rgba(148,163,184,0.35)", width: 1, style: 3, labelBackgroundColor: "#2878ff" },
    },
    rightPriceScale: { borderColor: "rgba(38,52,73,0.9)", scaleMargins: { top: 0.08, bottom: 0.22 } },
    timeScale: { borderColor: "rgba(38,52,73,0.9)", timeVisible: true, secondsVisible: false, rightOffset: 4 },
    handleScale: { axisPressedMouseMove: true },
    localization: { priceFormatter: opts.priceFormatter },
  });

  const series = chart.addCandlestickSeries({
    upColor: chartColors.upColor,
    downColor: chartColors.downColor,
    borderUpColor: chartColors.borderUp,
    borderDownColor: chartColors.borderDown,
    wickUpColor: chartColors.wickUp,
    wickDownColor: chartColors.wickDown,
    priceLineColor: "#2878ff",
    priceLineStyle: 2,
  });
  series.setData(candles.map((c) => ({ time: c.time / 1000, open: c.open, high: c.high, low: c.low, close: c.close })));

  if (opts.volume && candles.some((c) => c.volume)) {
    const vol = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    vol.setData(
      candles.map((c) => ({
        time: c.time / 1000,
        value: c.volume || 0,
        color: c.close >= c.open ? "rgba(34,197,94,0.28)" : "rgba(239,68,68,0.28)",
      }))
    );
  }

  /* Markers: e.g. historical signals [{time, direction, text}] */
  if (opts.markers?.length) {
    series.setMarkers(
      opts.markers.map((m) => ({
        time: m.time / 1000,
        position: m.direction === "LONG" ? "belowBar" : "aboveBar",
        color: m.direction === "LONG" ? "#22c55e" : "#ef4444",
        shape: m.direction === "LONG" ? "arrowUp" : "arrowDown",
        text: m.text || m.direction,
      }))
    );
  }

  /* Entry / SL / TP price lines */
  (opts.priceLines || []).forEach((pl) => {
    series.createPriceLine({
      price: pl.price,
      color: pl.color || "#2878ff",
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: pl.title || "",
    });
  });

  /* EMA overlay */
  if (opts.ema) {
    opts.ema.forEach((period) => {
      const data = ema(candles.map((c) => c.close), period);
      const line = chart.addLineSeries({
        color: period >= 50 ? "rgba(40,120,255,0.85)" : "rgba(245,158,11,0.8)",
        lineWidth: 1.5,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      line.setData(candles.map((c, i) => ({ time: c.time / 1000, value: data[i] })).filter((p) => p.value != null));
    });
  }

  if (opts.fitContent !== false) chart.timeScale().fitContent();
  instances.set(container, chart);
  return chart;
}

export function ema(values, period) {
  const out = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/* Lightweight inline sparkline (no dependency) for metric cards */
export function sparkline(container, values, { color = "#2878ff", fill = true } = {}) {
  if (!container || !values?.length) return;
  const dpr = window.devicePixelRatio || 1;
  const w = container.clientWidth || 160;
  const h = container.clientHeight || 30;
  const c = document.createElement("canvas");
  c.width = w * dpr; c.height = h * dpr;
  c.style.width = w + "px"; c.style.height = h + "px";
  container.innerHTML = "";
  container.appendChild(c);
  const ctx = c.getContext("2d");
  ctx.scale(dpr, dpr);
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const px = (i) => (i / (values.length - 1)) * w;
  const py = (v) => h - 3 - ((v - min) / span) * (h - 6);
  ctx.beginPath();
  values.forEach((v, i) => (i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v))));
  if (fill) {
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, color + "40"); g.addColorStop(1, color + "00");
    ctx.fillStyle = g; ctx.fill();
    ctx.beginPath();
    values.forEach((v, i) => (i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v))));
  }
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.lineJoin = "round"; ctx.stroke();
}

/* SVG line chart for equity/drawdown without external deps */
export function lineChart(container, series, { height = 260, yFormat = (v) => v } = {}) {
  if (!container) return;
  const w = container.clientWidth || 600;
  const h = height;
  const pad = { t: 14, r: 56, b: 26, l: 12 };
  const all = series.flatMap((s) => s.data.map((p) => p.value));
  const min = Math.min(...all), max = Math.max(...all);
  const span = max - min || 1;
  const n = Math.max(...series.map((s) => s.data.length));
  const x = (i, len) => pad.l + (i / Math.max(1, len - 1)) * (w - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - min) / span) * (h - pad.t - pad.b);

  const gridLines = 4;
  let grid = "";
  for (let i = 0; i <= gridLines; i++) {
    const v = min + (span * i) / gridLines;
    const yy = y(v);
    grid += `<line x1="${pad.l}" y1="${yy}" x2="${w - pad.r}" y2="${yy}" stroke="rgba(148,163,184,0.09)" />
             <text x="${w - pad.r + 8}" y="${yy + 3.5}" fill="#64748b" font-size="10" font-family="JetBrains Mono, monospace">${yFormat(v)}</text>`;
  }

  const paths = series
    .map((s) => {
      const pts = s.data.map((p, i) => `${i ? "L" : "M"}${x(i, s.data.length).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
      const area = s.fill
        ? `<path d="${pts} L${x(s.data.length - 1, s.data.length).toFixed(1)},${h - pad.b} L${pad.l},${h - pad.b} Z" fill="url(#grad-${s.key})" />`
        : "";
      return `${area}<path d="${pts}" fill="none" stroke="${s.color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" />`;
    })
    .join("");

  const defs = series
    .filter((s) => s.fill)
    .map((s) => `<linearGradient id="grad-${s.key}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${s.color}" stop-opacity="0.28"/><stop offset="100%" stop-color="${s.color}" stop-opacity="0"/></linearGradient>`)
    .join("");

  const legend = series
    .map((s) => `<span><i style="background:${s.color}"></i>${s.label}</span>`)
    .join("");

  container.innerHTML = `
    <div class="chart-legend">${legend}</div>
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" aria-label="chart">
      <defs>${defs}</defs>
      ${grid}${paths}
      <line x1="${pad.l}" y1="${h - pad.b}" x2="${w - pad.r}" y2="${h - pad.b}" stroke="rgba(38,52,73,0.9)" />
    </svg>`;
  void n;
}

function iconFallback() {
  return '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M3 3v18h18"/><path d="m7 14 4-4 4 3 5-6"/></svg>';
}
