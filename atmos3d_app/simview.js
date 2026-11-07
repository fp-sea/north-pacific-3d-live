// The Simulate mode's latitude-height chart (docs/atmospheric_circulation_
// reference.md section 9.5: "a latitude-altitude cross-section showing the
// cells, tropopause height, and jets"): the model's zonal wind as colour
// (westerly red, easterly blue), arrows along the overturning circulation
// (direction and a sense of strength; stretched the same way as the chart,
// so they follow the cells), the tropopause, and the diagnostics marked: each
// hemisphere's Hadley cell edge, the jets, the ITCZ.
//
// Pure (canvas 2-D only), no imports: node --test loads it.

// Wind in purple and orange (PuOr; 2026-10-10 panel review: red-blue meant westerly, warm, high pressure and the
// jet on different screens at once): orange from the west, purple from the east. Red-blue is kept for temperature.
const ORANGE = [200, 95, 10], PURPLE = [84, 39, 136], WHITE = [247, 247, 247];
const mix = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
// Colour of a zonal wind (m/s) on a symmetric scale +-umax.
export function windColor(u, umax) {
  const t = Math.max(-1, Math.min(1, u / umax));
  return t >= 0 ? mix(WHITE, ORANGE, t) : mix(WHITE, PURPLE, -t);
}
const WARM = [178, 24, 43], COOL = [33, 102, 172];
// Temperature difference (K) on +-dmax: red warmer, blue cooler.
export function anomColor(d, dmax) { const t = Math.max(-1, Math.min(1, d / dmax)); return t >= 0 ? mix(WHITE, WARM, t) : mix(WHITE, COOL, -t); }
// Heights (m) of pressure surfaces at each latitude, from the model's potential temperature: dp/dz = -p g / (R T),
// T = theta (p / 1000 hPa)^kappa, the pressure at the ground taken as 1000 hPa everywhere (where the model starts).
export function pressureHeights(s, levels = [850, 700, 500, 300, 200]) {
  const { nlat, nz, zc, th, dz } = s, out = levels.map(() => new Float64Array(nlat));
  for (let j = 0; j < nlat; j++) {
    let p = 1000, z = 0, li = 0;
    for (let k = 0; k < nz && li < levels.length; k++) {
      const T = th[j * nz + k] * Math.pow(p / 1000, 0.2857), pn = p * Math.exp((-9.81 * dz) / (287 * T));
      while (li < levels.length && pn <= levels[li]) { out[li][j] = z + (dz * Math.log(p / levels[li])) / Math.log(p / pn); li++; }
      p = pn; z += dz;
    }
  }
  return out;
}

// s: the model state (sim2d.js); d: its diagnostics; opts: {tropopauseKm, sunLat, title, labels, textbook}.
// labels: [{lat, z (m), text, kind}] placed from the model (simlessons.js modelLabels); textbook:
// {cells: [{from, to, name, aloft}]}, Earth's observed three cells drawn as grey dashed loops.
// sunLat: where the Sun is overhead (the declination), marked with a sun above the plot.
// Returns the plot rectangle, for hover lookups.
// opts.field "T" (2026-10-10, the held first steps): colour the temperature (°C) instead of the wind, from the
// model's potential temperature at a standard-atmosphere pressure (p = 1000 hPa e^(-z/7.5 km)).
const T_STOPS = [[-60, [49, 54, 149]], [-40, [69, 117, 180]], [-20, [116, 173, 209]], [-5, [171, 217, 233]], [5, [255, 255, 191]], [15, [253, 174, 97]], [25, [244, 109, 67]], [35, [165, 0, 38]]];
export function tempColor(c) {
  if (c <= T_STOPS[0][0]) return T_STOPS[0][1];
  for (let i = 1; i < T_STOPS.length; i++) if (c <= T_STOPS[i][0]) { const [a, A] = T_STOPS[i - 1], [b, B] = T_STOPS[i]; return mix(A, B, (c - a) / (b - a)); }
  return T_STOPS[T_STOPS.length - 1][1];
}
// opts.field: "u" wind (default), "T" temperature, "pSurf" temperature with the pressure surfaces drawn as lines,
// "Tanom" temperature minus the sunlight-alone target (what the circulation did). opts.umax: a fixed wind scale
// (default 60 m/s; the panel found the self-scaling made weak and strong planets look alike).
export function drawSimSection(ctx, W, H, s, d, opts = {}) {
  const P = { x: 44, y: 22, w: W - 44 - 58, h: H - 22 - 26 };
  ctx.clearRect(0, 0, W, H);
  ctx.font = "11px system-ui, sans-serif";
  const { nlat, nz, u, v, w, lat, zc, H: top } = s, N = nz + 1, D2R = Math.PI / 180;
  const X = (latDeg) => P.x + ((latDeg + 90) / 180) * P.w, Y = (zM) => P.y + P.h - (zM / top) * P.h;
  const umax = opts.umax ?? 60, dmax = opts.dmax ?? 30;
  const cw = P.w / nlat + 0.6, ch = P.h / nz + 0.6, isT = opts.field === "T" || opts.field === "pSurf", isA = opts.field === "Tanom";
  const tC = (j, k) => s.th[j * nz + k] * Math.exp((-0.2857 * zc[k]) / 7500) - 273.15;
  for (let j = 0; j < nlat; j++) for (let k = 0; k < nz; k++) {
    const [r, g, b] = isT ? tempColor(tC(j, k)) : isA ? anomColor(s.th[j * nz + k] - s.thEq[j * nz + k], dmax) : windColor(u[j * nz + k], umax);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(X(lat[j] / D2R) - cw / 2, Y(zc[k]) - ch / 2, cw, ch);
  }
  // the pressure surfaces (pSurf): lines of constant pressure, labelled
  if (opts.field === "pSurf") {
    const lv = [850, 700, 500, 300, 200], hts = pressureHeights(s, lv);
    ctx.strokeStyle = "rgba(15,20,28,0.9)"; ctx.lineWidth = 1.6;
    hts.forEach((h, li) => {
      ctx.beginPath();
      for (let j = 0; j < nlat; j++) { const x = X(lat[j] / D2R), y = Y(h[j]); if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke();
      const t = `${lv[li]} hPa`, y = Y(h[Math.floor(nlat / 2)]) - 4;
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(245,247,250,0.85)"; ctx.strokeText(t, X(0) + 6, y); ctx.fillStyle = "#11161d"; ctx.fillText(t, X(0) + 6, y);
      ctx.strokeStyle = "rgba(15,20,28,0.9)"; ctx.lineWidth = 1.6;
    });
  }
  // the overturning as arrows: v and w at cell centres, stretched to the chart's aspect (a chart 180 deg wide and
  // 16 km tall). A fixed scale (panel review: arrows rescaled every frame hid growth and differences): an arrow's
  // length grows with the square root of its speed against 5 mm/s of rising, capped; the key shows the reference.
  const SREF = 5e-3, arrows = [];
  const stretch = (P.w / (Math.PI * 6.371e6)) / (P.h / top);      // chart px per m across, over px per m up
  for (let j = 1; j < nlat; j += 3) for (let k = 1; k < nz; k += 2) {
    const vc = 0.5 * (v[j * nz + k] + v[(j + 1) * nz + k]), wc = 0.5 * (w[j * N + k] + w[j * N + k + 1]);
    const ax = vc * stretch, ay = wc, sp = Math.hypot(ax, ay);
    arrows.push([X(lat[j] / D2R), Y(zc[k]), ax, ay, sp]);
  }
  ctx.strokeStyle = "rgba(20,24,30,0.75)"; ctx.fillStyle = "rgba(20,24,30,0.75)"; ctx.lineWidth = 1.2;
  for (const [x, y, ax, ay, sp] of arrows) {
    if (sp < SREF * 0.004) continue;
    const L = 3 + 13 * Math.sqrt(Math.min(sp / SREF, 3)), dx = (ax / sp) * L, dy = -(ay / sp) * L;
    ctx.beginPath(); ctx.moveTo(x - dx / 2, y - dy / 2); ctx.lineTo(x + dx / 2, y + dy / 2); ctx.stroke();
    const hx = x + dx / 2, hy = y + dy / 2, a = Math.atan2(dy, dx);
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - 4 * Math.cos(a - 0.5), hy - 4 * Math.sin(a - 0.5)); ctx.lineTo(hx - 4 * Math.cos(a + 0.5), hy - 4 * Math.sin(a + 0.5)); ctx.closePath(); ctx.fill();
  }
  // tropopause
  if (opts.tropopauseKm) {
    ctx.setLineDash([5, 4]); ctx.strokeStyle = opts.field === "T" || opts.field === "pSurf" ? "rgba(235,240,245,0.75)" : "rgba(60,60,60,0.8)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(P.x, Y(opts.tropopauseKm * 1000)); ctx.lineTo(P.x + P.w, Y(opts.tropopauseKm * 1000)); ctx.stroke(); ctx.setLineDash([]);
    // a light label with a dark halo: readable on the pale wind colours and on the temperature chart's dark blue
    const ty = Y(opts.tropopauseKm * 1000) - 4;
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(15,20,28,0.85)"; ctx.strokeText(`tropopause (set at ${opts.tropopauseKm} km)`, P.x + 4, ty);
    ctx.fillStyle = "#f2f5f8"; ctx.fillText(`tropopause (set at ${opts.tropopauseKm} km)`, P.x + 4, ty);
  }
  // markers: Hadley edges, jets, ITCZ
  ctx.lineWidth = 1.5; ctx.strokeStyle = "#111"; ctx.fillStyle = "#111";
  for (const e of [d.north.edge, -d.south.edge]) if (Number.isFinite(e)) {
    ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(X(e), P.y); ctx.lineTo(X(e), P.y + P.h); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillText("cell edge", X(e) + (e > 0 ? 3 : -52), P.y + 11);
  }
  for (const jt of [d.jetN, d.jetS]) if (Number.isFinite(jt.lat) && jt.u > 5) {
    ctx.beginPath(); ctx.arc(X(jt.lat), Y(jt.z), 4, 0, 2 * Math.PI); ctx.fill();
    ctx.fillText(`jet ${Math.round(jt.u)} m/s`, X(jt.lat) - 26, Y(jt.z) - 7);
  }
  if (Number.isFinite(d.itcz) && !(d.wItczCmS < 0.01)) {     // not while the air is still at rest
    ctx.fillText("▲ ITCZ", X(d.itcz) - 18, P.y + P.h - 4); }
  if (Number.isFinite(opts.sunLat)) {
    ctx.fillStyle = "#f5c518"; ctx.beginPath(); ctx.arc(X(opts.sunLat), P.y - 5, 4, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = "rgba(245,197,24,0.8)"; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(X(opts.sunLat), P.y); ctx.lineTo(X(opts.sunLat), P.y + P.h); ctx.stroke(); ctx.setLineDash([]);
  }
  if (opts.textbook) drawTextbook(ctx, opts.textbook, X, Y, P);
  if (opts.labels) drawLabels(ctx, opts.labels, X, Y, P);
  // axes
  ctx.strokeStyle = "#999"; ctx.lineWidth = 1; ctx.strokeRect(P.x, P.y, P.w, P.h);
  ctx.fillStyle = "#cfd6de";
  for (const L of [-90, -60, -30, 0, 30, 60, 90]) ctx.fillText(L === 0 ? "0°" : `${Math.abs(L)}°${L > 0 ? "N" : "S"}`, X(L) - 10, P.y + P.h + 14);
  for (const km of [0, 4, 8, 12, 16]) ctx.fillText(`${km} km`, 4, Y(km * 1000) + 4);
  // the arrows' reference: 5 mm/s up (or the same length sideways: SREF / stretch m/s north-south)
  // (top right, above the plot, clear of the axis labels)
  { const t = `arrow of this length ⟶ 5 mm/s up or ${(SREF / stretch).toFixed(1)} m/s across`; ctx.font = "10px system-ui, sans-serif"; ctx.fillStyle = "#cfd6de";
    const tw = ctx.measureText(t).width; ctx.font = "11px system-ui, sans-serif";
    const titleW = opts.title ? ctx.measureText(opts.title).width : 0;
    if (P.x + titleW + tw + 16 < P.x + P.w + 50) { ctx.font = "10px system-ui, sans-serif"; ctx.fillText(t, P.x + P.w + 50 - tw, 13); ctx.font = "11px system-ui, sans-serif"; } }
  // colour key
  const kx = P.x + P.w + 12, ky = P.y, kh = P.h;
  if (isA) {
    for (let i = 0; i < kh; i++) { const [r, g, b] = anomColor(dmax * (1 - (2 * i) / kh), dmax); ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fillRect(kx, ky + i, 12, 1); }
    ctx.fillStyle = "#cfd6de";
    ctx.fillText(`+${dmax}`, kx + 15, ky + 8); ctx.fillText("0", kx + 15, ky + kh / 2 + 4); ctx.fillText(`−${dmax}`, kx + 15, ky + kh); ctx.fillText("K", kx + 15, ky + kh / 2 - 12);
  } else if (isT) {
    for (let i = 0; i < kh; i++) { const [r, g, b] = tempColor(35 - (95 * i) / kh); ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fillRect(kx, ky + i, 12, 1); }
    ctx.fillStyle = "#cfd6de";
    ctx.fillText("+35", kx + 15, ky + 8); ctx.fillText("0", kx + 15, ky + (35 / 95) * kh + 4); ctx.fillText("−60", kx + 15, ky + kh); ctx.fillText("°C", kx + 15, ky + kh / 2 + 16);
  } else {
    for (let i = 0; i < kh; i++) { const [r, g, b] = windColor(umax * (1 - (2 * i) / kh), umax); ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fillRect(kx, ky + i, 12, 1); }
    ctx.fillStyle = "#cfd6de";
    ctx.fillText(`+${umax}`, kx + 15, ky + 8); ctx.fillText("0", kx + 15, ky + kh / 2 + 4); ctx.fillText(`−${umax}`, kx + 15, ky + kh);
    ctx.fillText("m/s", kx + 15, ky + kh / 2 - 12);
  }
  if (opts.title) { ctx.fillStyle = "#cfd6de"; ctx.fillText(opts.title, P.x, 13); }
  return P;
}

// Earth's observed average cells: a dashed loop per cell, arrowheads showing the way round
// (aloft one way, near the ground the other), and the cell's name. Tropical cells reach higher.
export function drawTextbook(ctx, tb, X, Y, P) {
  ctx.save();
  ctx.strokeStyle = "rgba(40,40,40,0.75)"; ctx.fillStyle = "rgba(40,40,40,0.9)"; ctx.lineWidth = 1.4; ctx.setLineDash([5, 4]);
  for (const c of tb.cells) {
    const top = Math.abs(c.from) < 1 || Math.abs(c.to) < 1 ? 14000 : Math.max(Math.abs(c.from), Math.abs(c.to)) > 80 ? 8000 : 10500;
    const x0 = X(Math.min(c.from, c.to)) + 4, x1 = X(Math.max(c.from, c.to)) - 4, y0 = Y(top), y1 = Y(600);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI); ctx.stroke();
    // arrowheads: top of the loop pointing the way the air goes aloft (+1: toward the north, right), bottom the other way
    for (const [y, dir] of [[y0, c.aloft], [y1, -c.aloft]]) {
      ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(cx + dir * 6, y); ctx.lineTo(cx - dir * 2, y - 4); ctx.lineTo(cx - dir * 2, y + 4); ctx.closePath(); ctx.fill(); ctx.setLineDash([5, 4]);
    }
    ctx.setLineDash([]);
    ctx.font = "italic 10px system-ui, sans-serif";
    const w = ctx.measureText(c.name).width;
    ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.fillRect(cx - w / 2 - 2, cy - 8, w + 4, 12);
    ctx.fillStyle = "rgba(40,40,40,0.95)"; ctx.fillText(c.name, cx - w / 2, cy + 2);
    ctx.setLineDash([5, 4]);
  }
  ctx.restore();
}

// The model's own features: small dark tags (their short text) at their places, kept inside the
// plot; a tag that would overlap one already drawn is left out (the globe has the full set).
function drawLabels(ctx, labels, X, Y, P) {
  ctx.save();
  ctx.font = "10px system-ui, sans-serif";
  const drawn = [];
  for (const l of labels) {
    if (l.kind === "jet") continue;                         // the jet already has its dot and speed
    const t = l.short ?? l.text, w = ctx.measureText(t).width;
    const x = Math.max(P.x + 2, Math.min(P.x + P.w - w - 6, X(l.lat) - w / 2)), y = Math.max(P.y + 12, Math.min(P.y + P.h - 3, Y(l.z)));
    const r = [x - 3, y - 10, x + w + 3, y + 3];
    if (drawn.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) continue;
    drawn.push(r);
    ctx.fillStyle = "rgba(18,22,28,0.78)"; ctx.fillRect(r[0], r[1], w + 6, 13);
    ctx.fillStyle = l.kind === "up" ? "#ffb070" : l.kind === "down" ? "#9fd4ff" : "#f5f7fa";
    ctx.fillText(t, x, y);
  }
  ctx.restore();
  return drawn.length;
}

// The surface wind along latitude (2026-10-10, the trades step: a 0.7 m/s easterly is invisible on a +-60 m/s
// colour scale): the lowest level's east-west wind as a line, +-umax, with knots on the right.
// series: [{lat (deg), u (m/s)}], a second optional series ref drawn dashed (e.g. Earth's).
export function drawSurfaceWind(ctx, W, H, series, opts = {}) {
  const P = { x: 44, y: 22, w: W - 44 - 58, h: H - 22 - 26 }, umax = opts.umax ?? 6;
  ctx.clearRect(0, 0, W, H);
  ctx.font = "11px system-ui, sans-serif";
  const X = (la) => P.x + ((la + 90) / 180) * P.w, Y = (u) => P.y + P.h / 2 - (Math.max(-umax, Math.min(umax, u)) / umax) * (P.h / 2);
  ctx.fillStyle = "rgba(200,95,10,0.10)"; ctx.fillRect(P.x, P.y, P.w, P.h / 2);
  ctx.fillStyle = "rgba(84,39,136,0.12)"; ctx.fillRect(P.x, P.y + P.h / 2, P.w, P.h / 2);
  ctx.strokeStyle = "#999"; ctx.lineWidth = 1; ctx.strokeRect(P.x, P.y, P.w, P.h);
  ctx.beginPath(); ctx.moveTo(P.x, Y(0)); ctx.lineTo(P.x + P.w, Y(0)); ctx.stroke();
  for (const [ser, dash, col] of [[opts.ref, [5, 4], "#9aa6b2"], [series, [], "#f0a830"]]) {
    if (!ser) continue;
    ctx.setLineDash(dash); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath();
    ser.forEach((p, i) => (i ? ctx.lineTo(X(p.lat), Y(p.u)) : ctx.moveTo(X(p.lat), Y(p.u)))); ctx.stroke();
  }
  ctx.setLineDash([]); ctx.fillStyle = "#cfd6de";
  for (const l of [-90, -60, -30, 0, 30, 60, 90]) ctx.fillText(l === 0 ? "0°" : `${Math.abs(l)}°${l > 0 ? "N" : "S"}`, X(l) - 10, P.y + P.h + 14);
  for (const u of [umax, umax / 2, 0, -umax / 2, -umax]) { ctx.fillText(`${u > 0 ? "+" : ""}${u}`, 8, Y(u) + 4); ctx.fillText(`${Math.round(u * 1.944)} kt`, P.x + P.w + 6, Y(u) + 4); }
  ctx.fillStyle = "#e9b47a"; ctx.fillText("from the west", P.x + 6, P.y + 13);
  ctx.fillStyle = "#b9a3e0"; ctx.fillText("from the east (trade winds)", P.x + 6, P.y + P.h - 5);
  ctx.fillStyle = "#cfd6de"; if (opts.title) ctx.fillText(opts.title, P.x, 13);
  return P;
}
