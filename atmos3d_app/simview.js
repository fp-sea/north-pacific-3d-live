// The Simulate mode's latitude-height chart (docs/atmospheric_circulation_
// reference.md section 9.5: "a latitude-altitude cross-section showing the
// cells, tropopause height, and jets"): the model's zonal wind as colour
// (westerly red, easterly blue), arrows along the overturning circulation
// (direction and a sense of strength; stretched the same way as the chart,
// so they follow the cells), the tropopause, and the diagnostics marked: each
// hemisphere's Hadley cell edge, the jets, the ITCZ.
//
// Pure (canvas 2-D only), no imports: node --test loads it.

const RED = [214, 96, 77], BLUE = [67, 147, 195], WHITE = [247, 247, 247];
const mix = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
// Colour of a zonal wind (m/s) on a symmetric scale +-umax.
export function windColor(u, umax) {
  const t = Math.max(-1, Math.min(1, u / umax));
  return t >= 0 ? mix(WHITE, RED, t) : mix(WHITE, BLUE, -t);
}

// s: the model state (sim2d.js); d: its diagnostics; opts: {tropopauseKm, sunLat, title, labels, textbook}.
// labels: [{lat, z (m), text, kind}] placed from the model (simlessons.js modelLabels); textbook:
// {cells: [{from, to, name, aloft}]}, Earth's observed three cells drawn as grey dashed loops.
// sunLat: where the Sun is overhead (the declination), marked with a sun above the plot.
// Returns the plot rectangle, for hover lookups.
export function drawSimSection(ctx, W, H, s, d, opts = {}) {
  const P = { x: 44, y: 22, w: W - 44 - 58, h: H - 22 - 26 };
  ctx.clearRect(0, 0, W, H);
  ctx.font = "11px system-ui, sans-serif";
  const { nlat, nz, u, v, w, lat, zc, H: top } = s, N = nz + 1, D2R = Math.PI / 180;
  const X = (latDeg) => P.x + ((latDeg + 90) / 180) * P.w, Y = (zM) => P.y + P.h - (zM / top) * P.h;
  // zonal wind, cell by cell
  let umax = 20;
  for (let i = 0; i < u.length; i++) umax = Math.max(umax, Math.abs(u[i]));
  umax = Math.ceil(umax / 10) * 10;
  const cw = P.w / nlat + 0.6, ch = P.h / nz + 0.6;
  for (let j = 0; j < nlat; j++) for (let k = 0; k < nz; k++) {
    const [r, g, b] = windColor(u[j * nz + k], umax);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(X(lat[j] / D2R) - cw / 2, Y(zc[k]) - ch / 2, cw, ch);
  }
  // the overturning as arrows: v and w at cell centres, stretched to the chart's aspect
  // (a chart 180 deg wide and 16 km tall), each as long as the square root of its speed
  let smax = 1e-12;
  const arrows = [];
  const stretch = (P.w / (Math.PI * 6.371e6)) / (P.h / top);      // chart px per m across, over px per m up
  for (let j = 1; j < nlat; j += 3) for (let k = 1; k < nz; k += 2) {
    const vc = 0.5 * (v[j * nz + k] + v[(j + 1) * nz + k]), wc = 0.5 * (w[j * N + k] + w[j * N + k + 1]);
    const ax = vc * stretch, ay = wc, sp = Math.hypot(ax, ay);
    smax = Math.max(smax, sp);
    arrows.push([X(lat[j] / D2R), Y(zc[k]), ax, ay, sp]);
  }
  ctx.strokeStyle = "rgba(20,24,30,0.75)"; ctx.fillStyle = "rgba(20,24,30,0.75)"; ctx.lineWidth = 1.2;
  for (const [x, y, ax, ay, sp] of arrows) {
    if (sp < smax * 0.03) continue;
    const L = 5 + 13 * Math.sqrt(sp / smax), dx = (ax / sp) * L, dy = -(ay / sp) * L;
    ctx.beginPath(); ctx.moveTo(x - dx / 2, y - dy / 2); ctx.lineTo(x + dx / 2, y + dy / 2); ctx.stroke();
    const hx = x + dx / 2, hy = y + dy / 2, a = Math.atan2(dy, dx);
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - 4 * Math.cos(a - 0.5), hy - 4 * Math.sin(a - 0.5)); ctx.lineTo(hx - 4 * Math.cos(a + 0.5), hy - 4 * Math.sin(a + 0.5)); ctx.closePath(); ctx.fill();
  }
  // tropopause
  if (opts.tropopauseKm) {
    ctx.setLineDash([5, 4]); ctx.strokeStyle = "rgba(60,60,60,0.8)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(P.x, Y(opts.tropopauseKm * 1000)); ctx.lineTo(P.x + P.w, Y(opts.tropopauseKm * 1000)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "#333"; ctx.fillText("tropopause", P.x + 4, Y(opts.tropopauseKm * 1000) - 3);
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
  // colour key
  const kx = P.x + P.w + 12, ky = P.y, kh = P.h;
  for (let i = 0; i < kh; i++) { const [r, g, b] = windColor(umax * (1 - (2 * i) / kh), umax); ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fillRect(kx, ky + i, 12, 1); }
  ctx.fillStyle = "#cfd6de";
  ctx.fillText(`+${umax}`, kx + 15, ky + 8); ctx.fillText("0", kx + 15, ky + kh / 2 + 4); ctx.fillText(`−${umax}`, kx + 15, ky + kh);
  ctx.fillText("m/s", kx + 15, ky + kh / 2 - 12);
  if (opts.title) { ctx.fillStyle = "#cfd6de"; ctx.fillText(opts.title, P.x, 13); }
  return P;
}

// Earth's observed average cells: a dashed loop per cell, arrowheads showing the way round
// (aloft one way, near the ground the other), and the cell's name. Tropical cells reach higher.
function drawTextbook(ctx, tb, X, Y, P) {
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
