// Drawing a case step's station and buoy chart (caseobs.js stepObs) on a canvas: one line per station or pair,
// named in the legend under it, the 00 UTC analysis times as faint lines (the step's own day solid and
// labelled "the map"), the grid's own values at that time as white dots ringed in their line's colour when given (the forecasters' numbers
// read from the archive), and a crosshair readout on hover. Times in the case's own zone (Pacific, or Hawaiʻi time). Colours: the dataviz
// categorical slots for a dark surface (validated against the panel colour #1a1f28: adjacent CVD ΔE 8.4,
// normal-vision 19.3, all ≥ 3:1), with the legend, the hover readout and the table as the second encoding.
export const OBS_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"];
export const OBS_DASHES = [[], [7, 3], [2, 3], [9, 3, 2, 3], [4, 4]];

// Times in the case's own zone: Pacific for the Northwest, Hawaiʻi time for Hawaiʻi (tzOf).
export const tzOf = (region) => (region === "hawaii" ? "Pacific/Honolulu" : "America/Los_Angeles");
const fmts = new Map();
const fmt = (tz, kind) => {
  const k = `${tz}:${kind}`;
  if (!fmts.has(k)) fmts.set(k, new Intl.DateTimeFormat("en-US", kind === "day" ? { timeZone: tz, weekday: "short", month: "short", day: "numeric" }
    : kind === "hour" ? { timeZone: tz, hour: "numeric", hourCycle: "h23" }
    : { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", timeZoneName: "short" }));
  return fmts.get(k);
};
export const fmtObsTime = (ms, tz = "America/Los_Angeles") => fmt(tz, "full").format(ms);
const localHour = (ms, tz) => Number(fmt(tz, "hour").format(ms));

// drawObsChart(canvas, o, {gridDots: [{id, value}], hidden: Set of series ids, hoverIndex, cursorT: ms of the 3 km map's hour}) -> layout {X, P}
export function drawObsChart(cv, o, { gridDots = [], hidden = new Set(), hoverIndex = -1, cursorT = null, tz = "America/Los_Angeles" } = {}) {
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1), W = cv.clientWidth || 300, H = 190;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const P = { x: 34, y: 8, w: W - 34 - 8, h: H - 8 - 34 };
  const shown = o.series.filter((s) => !hidden.has(s.id));
  let lo = Infinity, hi = -Infinity;
  for (const s of shown) for (const v of s.values) if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  for (const d of gridDots) if (Number.isFinite(d.value) && shown.some((s) => s.id === d.id)) { lo = Math.min(lo, d.value); hi = Math.max(hi, d.value); }
  if (o.zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
  if (hi - lo < 2) { const m = (hi + lo) / 2; lo = m - 1; hi = m + 1; }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const t0 = o.t[0], t1 = o.t[o.t.length - 1];
  const X = (ms) => P.x + ((ms - t0) / (t1 - t0 || 1)) * P.w, Y = (v) => P.y + (1 - (v - lo) / (hi - lo)) * P.h;
  // grid: recessive
  ctx.font = "10px system-ui, sans-serif"; ctx.textBaseline = "middle";
  const step = niceStep((hi - lo) / 4);
  ctx.strokeStyle = "#2a3240"; ctx.fillStyle = "#8a96a6"; ctx.lineWidth = 1;
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
    ctx.beginPath(); ctx.moveTo(P.x, Y(v)); ctx.lineTo(P.x + P.w, Y(v)); ctx.stroke();
    ctx.textAlign = "right"; ctx.fillText(fmtNum(v, step), P.x - 4, Y(v));
  }
  if (o.zero && lo < 0 && hi > 0) { ctx.strokeStyle = "#5b6676"; ctx.beginPath(); ctx.moveTo(P.x, Y(0)); ctx.lineTo(P.x + P.w, Y(0)); ctx.stroke(); }
  // time axis: local midnights labelled with the day, noons ticked
  ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillStyle = "#8a96a6";
  let lastLabel = -1e9;
  for (const ms of o.t) {
    const h = localHour(ms, tz);
    if (h === 0 && X(ms) - lastLabel > 46) {
      ctx.strokeStyle = "#2a3240"; ctx.beginPath(); ctx.moveTo(X(ms), P.y); ctx.lineTo(X(ms), P.y + P.h); ctx.stroke();
      ctx.fillText(fmt(tz, "day").format(ms), X(ms), P.y + P.h + 4); lastLabel = X(ms);
    } else if (h === 12) { ctx.strokeStyle = "#3a4352"; ctx.beginPath(); ctx.moveTo(X(ms), P.y + P.h); ctx.lineTo(X(ms), P.y + P.h + 3); ctx.stroke(); }
  }
  // the daily analyses (00 UTC = 5 pm PDT / 4 pm PST): the step's own day solid and labelled
  for (const m of o.marks) {
    const own = m === o.stepMark;
    ctx.strokeStyle = own ? "#e6ebf0" : "#4a5466"; ctx.setLineDash(own ? [] : [3, 3]); ctx.lineWidth = own ? 1.2 : 1;
    ctx.beginPath(); ctx.moveTo(X(m), P.y); ctx.lineTo(X(m), P.y + P.h); ctx.stroke();
    if (own) { ctx.setLineDash([]); ctx.fillStyle = "#e6ebf0"; ctx.textAlign = X(m) > P.x + P.w - 40 ? "right" : "left"; ctx.textBaseline = "top"; ctx.fillText("the map", X(m) + (ctx.textAlign === "left" ? 3 : -3), P.y + 1); }
  }
  ctx.setLineDash([]);
  // the lines, 2 px, broken where a station has no report
  o.series.forEach((s, k) => {
    if (hidden.has(s.id)) return;
    // a dash pattern per line as well as a colour, so the lines can be told apart without colour (WCAG 1.4.1)
    ctx.strokeStyle = OBS_COLORS[k % OBS_COLORS.length]; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.setLineDash(OBS_DASHES[k % OBS_DASHES.length]);
    ctx.beginPath(); let pen = false;
    s.values.forEach((v, i) => { if (v == null) { pen = false; return; } const x = X(o.t[i]), y = Y(v); if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y); pen = true; });
    ctx.stroke();
  });
  ctx.setLineDash([]);
  // the grid's value at the step's analysis, a white dot with a dark ring, on the same scale
  for (const d of gridDots) {
    const k = o.series.findIndex((s) => s.id === d.id);
    if (k < 0 || hidden.has(d.id) || !Number.isFinite(d.value)) continue;
    ctx.fillStyle = "#ffffff"; ctx.strokeStyle = OBS_COLORS[k % OBS_COLORS.length]; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(X(o.stepMark), Y(d.value), 4.5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  }
  // the 3 km model's hour (hrrr.js), amber, when it's on the map
  if (cursorT != null && cursorT >= t0 && cursorT <= t1) {
    const x = X(cursorT);
    ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, P.y); ctx.lineTo(x, P.y + P.h); ctx.stroke();
    ctx.fillStyle = "#fbbf24"; ctx.textBaseline = "bottom"; ctx.textAlign = x > P.x + P.w - 60 ? "right" : "left";
    ctx.fillText("3 km map", x + (ctx.textAlign === "left" ? 3 : -3), P.y + P.h - 2);
  }
  // crosshair
  if (hoverIndex >= 0 && hoverIndex < o.t.length) {
    const x = X(o.t[hoverIndex]);
    ctx.strokeStyle = "#cfd6de"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, P.y); ctx.lineTo(x, P.y + P.h); ctx.stroke();
    o.series.forEach((s, k) => {
      const v = s.values[hoverIndex];
      if (v == null || hidden.has(s.id)) return;
      ctx.fillStyle = OBS_COLORS[k % OBS_COLORS.length]; ctx.strokeStyle = "#1a1f28"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, Y(v), 4, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    });
  }
  return { X, P, t0, t1 };
}

// The hour under a pointer x (canvas CSS pixels).
export function obsIndexAt(o, layout, x) {
  const f = (x - layout.P.x) / layout.P.w;
  if (f < -0.02 || f > 1.02) return -1;
  return Math.max(0, Math.min(o.t.length - 1, Math.round(f * (o.t.length - 1))));
}

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}
function fmtNum(v, step) { const d = step < 1 ? 1 : 0; const s = Math.abs(v) < 1e-9 ? "0" : v.toFixed(d); return s.replace("-", "−"); }
