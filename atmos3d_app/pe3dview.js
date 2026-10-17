// What the Simulate mode draws from its 3-D model (pe3d.js, via pe3dworker.js):
//   fillTexture  a colour map of a grid field (temperature, surface pressure)
//                as an equirectangular RGBA texture for the globe
//   highsLows    the travelling highs and lows: local extremes of surface pressure
//   cellLabels   the cells in the running-mean overturning, found in the model's
//                own numbers (Hadley, Ferrel, polar), with their strengths
//   drawPESection the latitude-height chart: zonal-mean wind in colour, the
//                mean overturning as contours, the cells labelled
//   drawEqSlice  the equator's longitude-height chart (the Walker circulation): east-west wind in
//                colour, the 30-day mean motion as arrows, the sea's temperature in a strip under it
// Heights: sigma levels shown at z = -7.5 km ln(sigma).
// Pure (canvas 2-D only), no imports: node --test loads it.

export const HS_M = 7500;
export const PE_FILLS = {
  tlow: { label: "temperature near the ground (σ 0.92, about 0.7 km)", units: "°C", level: "bottom", min: -45, max: 35,
    stops: [[-45, "#313695"], [-30, "#4575b4"], [-15, "#74add1"], [-5, "#abd9e9"], [0, "#e0f3f8"], [8, "#ffffbf"], [16, "#fee090"], [22, "#fdae61"], [28, "#f46d43"], [35, "#a50026"]] },
  tmid: { label: "temperature at mid-levels (σ 0.58, about 4 km)", units: "°C", level: "mid", min: -50, max: 10,
    stops: [[-50, "#313695"], [-40, "#4575b4"], [-30, "#74add1"], [-22, "#abd9e9"], [-15, "#e0f3f8"], [-8, "#ffffbf"], [-3, "#fee090"], [2, "#fdae61"], [6, "#f46d43"], [10, "#a50026"]] },
  ps: { label: "sea-level pressure, lines every 4 hPa", units: "hPa", contour: 4, min: 970, max: 1035,
    stops: [[970, "#1b2a78"], [985, "#2f5bd0"], [998, "#7fa6ec"], [1008, "#d7e3f8"], [1013, "#f7f7f7"], [1018, "#f7d2c2"], [1024, "#e8745a"], [1035, "#8e1616"]] },
  // 2026-10-10, for the ocean, mountain and El Nino lessons. src says where the field comes from: "mean"
  // fields are the worker's 30-day means; "data" ones are the observed sea itself (simsurface.js), not the model.
  psMean: { label: "sea-level pressure, 30-day mean, lines every 4 hPa", units: "hPa", contour: 4, src: "meanPs", min: 970, max: 1035, stops: [[970, "#1b2a78"], [985, "#2f5bd0"], [998, "#7fa6ec"], [1008, "#d7e3f8"], [1013, "#f7f7f7"], [1018, "#f7d2c2"], [1024, "#e8745a"], [1035, "#8e1616"]] },
  rise: { label: "rising (green) and sinking (brown) air at mid-levels, 30-day mean", units: "mm/s", src: "meanW", min: -6, max: 6,
    stops: [[-6, "#8c510a"], [-3, "#d8b365"], [-1, "#f6e8c3"], [0, "#f5f5f5"], [1, "#c7eae5"], [3, "#5ab4ac"], [6, "#01665e"]] },
  jet: { label: "east–west wind at the jet's level (σ 0.25, about 10 km), 30-day mean", units: "m/s", src: "meanUj", min: -20, max: 70,
    stops: [[-20, "#542788"], [-5, "#b2abd2"], [0, "#f7f7f7"], [15, "#fee0b6"], [30, "#fdb863"], [45, "#e08214"], [60, "#b35806"], [70, "#7f3b08"]] },
  sst: { label: "sea-surface temperature, observed 1991–2020 average for the month (data, not the model)", units: "°C", src: "sst", min: -2, max: 31,
    stops: [[-2, "#313695"], [5, "#4575b4"], [12, "#74add1"], [18, "#abd9e9"], [22, "#ffffbf"], [26, "#fdae61"], [28, "#f46d43"], [30, "#d73027"], [31, "#a50026"]] },
  rain: { label: "rain, 30-day mean (with water vapour on)", units: "mm/day", src: "meanRain", min: 0, max: 20,
    stops: [[0, "#f4f1ea"], [0.5, "#dfe8ef"], [2, "#9ecae1"], [5, "#4292c6"], [10, "#2171b5"], [15, "#6a51a3"], [20, "#3f007d"]] },
  pwat: { label: "water vapour in the whole column, 30-day mean", units: "mm", src: "meanPwat", min: 0, max: 70,
    stops: [[0, "#ffffd9"], [10, "#c7e9b4"], [25, "#7fcdbb"], [40, "#41b6c4"], [55, "#225ea8"], [70, "#081d58"]] },
  // differences from a pinned reference run's 30-day means (main.js simPin), fixed symmetric scales
  diffPs: { label: "sea-level pressure minus the pinned reference (30-day means)", units: "hPa", src: "diffPs", min: -10, max: 10, diff: true,
    stops: [[-10, "#2166ac"], [-5, "#67a9cf"], [-1.5, "#d1e5f0"], [0, "#f7f7f7"], [1.5, "#fddbc7"], [5, "#ef8a62"], [10, "#b2182b"]] },
  diffRain: { label: "rain minus the pinned reference (30-day means)", units: "mm/day", src: "diffRain", min: -6, max: 6, diff: true,
    stops: [[-6, "#8c510a"], [-3, "#d8b365"], [-0.75, "#f6e8c3"], [0, "#f5f5f5"], [0.75, "#c7eae5"], [3, "#5ab4ac"], [6, "#01665e"]] },
  diffJet: { label: "jet-level east–west wind minus the pinned reference (30-day means)", units: "m/s", src: "diffJet", min: -15, max: 15, diff: true,
    stops: [[-15, "#542788"], [-7, "#b2abd2"], [-2, "#e8e4f0"], [0, "#f7f7f7"], [2, "#fee0b6"], [7, "#fdb863"], [15, "#b35806"]] },
  sstAnom: { label: "sea-surface temperature minus the month's normal, observed (data, not the model)", units: "°C", src: "sstAnom", min: -3, max: 3,
    stops: [[-3, "#2166ac"], [-1.5, "#67a9cf"], [-0.5, "#d1e5f0"], [0, "#f7f7f7"], [0.5, "#fddbc7"], [1.5, "#ef8a62"], [3, "#b2182b"]] },
};

// Wind colours: orange from the west, purple from the east (the 2-D chart's PuOr; red-blue is kept for
// temperature and pressure).
export function windCol(v, umax) {
  const t = Math.max(-1, Math.min(1, v / umax)), a = [247, 247, 247], b = t >= 0 ? [200, 95, 10] : [84, 39, 136];
  return a.map((x, i) => Math.round(x + (b[i] - x) * Math.abs(t)));
}
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export function colourAt(stops, v) {
  if (!(v > stops[0][0])) return hex(stops[0][1]);
  for (let i = 1; i < stops.length; i++) if (v <= stops[i][0]) {
    const [a, ca] = stops[i - 1], [b, cb] = stops[i], t = (v - a) / (b - a), A = hex(ca), B = hex(cb);
    return A.map((x, c) => Math.round(x + (B[c] - x) * t));
  }
  return hex(stops[stops.length - 1][1]);
}

// field: nlat x nlon (Gaussian rows ascending in lat), lat in degrees; returns W x H RGBA, row 0 at
// the south pole, column 0 at longitude 0 (the globe's texture layout).
export function fillTexture(field, nlat, nlon, lat, stops, W = 256, H = 128, alpha = 235, { contour = 0, mask = null } = {}) {
  // Catmull-Rom across the grid (smooth, as the model's own spectral fields are: the panel found the bilinear
  // 128 x 64 map blocky), periodic in longitude, clamped at the poles; values with no number stay grey.
  const out = new Uint8Array(W * H * 4), vals = new Float32Array(W * H);
  const cr = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
  const at = (j, i) => field[Math.max(0, Math.min(nlat - 1, j)) * nlon + (((i % nlon) + nlon) % nlon)];
  for (let r = 0; r < H; r++) {
    const la = -90 + ((r + 0.5) * 180) / H;
    let j1 = 1; while (j1 < nlat - 1 && lat[j1] < la) j1++;
    const j0 = j1 - 1, y = Math.max(0, Math.min(1, (la - lat[j0]) / (lat[j1] - lat[j0])));
    for (let c = 0; c < W; c++) {
      const fx = ((c + 0.5) / W) * nlon - 0.5, i0 = Math.floor(fx), x = fx - i0;
      const row = (j) => cr(at(j, i0 - 1), at(j, i0), at(j, i0 + 1), at(j, i0 + 2), x);
      let v = cr(row(j0 - 1), row(j0), row(j1), row(j1 + 1), y);
      if (!Number.isFinite(v)) {                        // next to a gap (land in the sea's fills): bilinear from what there is
        const q = [[j0, i0, (1 - x) * (1 - y)], [j0, i0 + 1, x * (1 - y)], [j1, i0, (1 - x) * y], [j1, i0 + 1, x * y]].filter(([a, b]) => Number.isFinite(at(a, b)));
        const ws = q.reduce((t, e) => t + e[2], 0);
        v = ws > 0.3 ? q.reduce((t, [a, b, w]) => t + at(a, b) * w, 0) / ws : NaN;
      }
      if (mask && mask[r * W + c]) v = NaN;
      vals[r * W + c] = v;
    }
  }
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const k = r * W + c, v = vals[k], o = k * 4;
    let [R, G, B] = Number.isFinite(v) ? colourAt(stops, v) : [107, 98, 84];      // no value (land, for the sea's fills): grey-brown
    // isobars (or other contours) every `contour`: where the band changes between this pixel and the next across or up
    if (contour && Number.isFinite(v)) {
      const band = Math.floor(v / contour), e = vals[r * W + ((c + 1) % W)], n = r + 1 < H ? vals[(r + 1) * W + c] : v;
      if ((Number.isFinite(e) && Math.floor(e / contour) !== band) || (Number.isFinite(n) && Math.floor(n / contour) !== band)) { R = 25; G = 30; B = 38; }
    }
    out[o] = R; out[o + 1] = G; out[o + 2] = B; out[o + 3] = alpha;
  }
  return out;
}

// Local minima (lows) and maxima (highs) of surface pressure, each the extreme within `rad` grid
// points around it, deep enough (a low under lowMax, a high over highMin) and standing out at least
// `prominence` hPa from every point of the ring `rad` away (so a trough or ridge, whose own line
// stays nearly as low or high, isn't a row of lows),
// polewards of 10 deg (in the tropics pressure barely varies). [{lat, lon, kind, hPa}], deepest first.
export function highsLows(ps, nlat, nlon, lat, { rad = 3, lowMax = 1008, highMin = 1018, prominence = 2 } = {}) {
  const out = [];
  for (let j = rad; j < nlat - rad; j++) {
    if (Math.abs(lat[j]) < 10) continue;
    for (let i = 0; i < nlon; i++) {
      const v = ps[j * nlon + i];
      let isMin = v < lowMax, isMax = v > highMin;
      for (let dj = -rad; dj <= rad && (isMin || isMax); dj++) for (let di = -rad; di <= rad; di++) {
        if (!dj && !di) continue;
        const w = ps[(j + dj) * nlon + ((i + di + nlon) % nlon)];
        if (w < v) isMin = false;
        if (w > v) isMax = false;
      }
      if (!(isMin || isMax)) continue;
      let gap = Infinity;
      for (let dj = -rad; dj <= rad; dj++) for (let di = -rad; di <= rad; di++) {
        if (Math.max(Math.abs(dj), Math.abs(di)) !== rad) continue;          // the ring only
        gap = Math.min(gap, Math.abs(ps[(j + dj) * nlon + ((i + di + nlon) % nlon)] - v));
      }
      if (gap < prominence) continue;
      out.push({ lat: lat[j], lon: (i * 360) / nlon, kind: isMin ? "L" : "H", hPa: v });
    }
  }
  return out.sort((a, b) => Math.abs(b.hPa - 1013) - Math.abs(a.hPa - 1013));
}

// The cells in a mean streamfunction psi ((L+1) x nlat at half levels, kg/s; > 0 = northward flow
// aloft): in each hemisphere the strongest direct (Hadley) cell within 35 deg, the strongest cell
// of the opposite sign at 30-65 deg (Ferrel) and a direct one poleward of 60 deg (polar), if at
// least `min` kg/s. [{name, lat, k (half level), psi}]
export function cellLabels(psi, nlat, L, lat, { min = 3e9 } = {}) {
  const out = [];
  const find = (sgn, lo, hi, h) => {
    let best = null;
    for (let k = 1; k < L; k++) for (let j = 0; j < nlat; j++) {
      const a = Math.abs(lat[j]);
      if (Math.sign(lat[j]) !== h || a < lo || a > hi) continue;
      const v = psi[k * nlat + j] * sgn;
      if (v > min && (!best || v > best.v)) best = { v, j, k };
    }
    return best;
  };
  for (const h of [1, -1]) {
    // direct cells turn with northward flow aloft in the north (psi > 0), southward in the south (< 0)
    for (const [name, sgn, lo, hi] of [["Hadley", h, 0, 35], ["Ferrel", -h, 30, 65], ["polar", h, 60, 90]]) {
      const b = find(sgn, lo, hi, h);
      if (b) out.push({ name, lat: lat[b.j], k: b.k, psi: b.v * sgn });
    }
  }
  return out;
}

// The chart. d: {L, nlat, lat, sf, sh, u (L x nlat zonal-mean wind), psi ((L+1) x nlat)}.
export function drawPESection(ctx, W, H, d, opts = {}) {
  const P = { x: 44, y: 22, w: W - 44 - 58, h: H - 22 - 26 }, top = opts.topM ?? 16000;
  ctx.clearRect(0, 0, W, H);
  ctx.font = "11px system-ui, sans-serif";
  const { L, nlat, lat, sf, sh, u, psi } = d;
  const zOf = (sg) => -HS_M * Math.log(Math.max(sg, 1e-6));
  const X = (la) => P.x + ((la + 90) / 180) * P.w, Y = (z) => P.y + P.h - (Math.min(z, top) / top) * P.h;
  // a fixed scale (default 40 m/s: comparable between steps), purple-orange as in the 2-D chart
  const umax = opts.umax ?? 40, col = (v) => windCol(v, umax);
  // wind colour: each level fills from its lower half-level to its upper one; each latitude halfway to its neighbours
  for (let k = 0; k < L; k++) {
    const y0 = Y(zOf(sh[k])), y1 = Y(zOf(sh[k + 1]));
    for (let j = 0; j < nlat; j++) {
      const xa = X(j ? (lat[j - 1] + lat[j]) / 2 : -90), xb = X(j < nlat - 1 ? (lat[j] + lat[j + 1]) / 2 : 90);
      const [r, g, b] = col(u[k * nlat + j]);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(xa, Math.min(y0, y1), xb - xa + 0.5, Math.abs(y1 - y0) + 0.5);
    }
  }
  // overturning contours every 2e10 kg/s (solid: clockwise looking east, i.e. psi > 0; dashed: < 0)
  const step = opts.psiStep ?? 2e10;
  ctx.lineWidth = 1.2;
  for (let lv = -10; lv <= 10; lv++) {
    if (!lv) continue;
    const c = lv * step;
    ctx.strokeStyle = lv > 0 ? "rgba(20,20,20,0.85)" : "rgba(20,20,20,0.85)"; ctx.setLineDash(lv > 0 ? [] : [4, 3]);
    ctx.beginPath();
    for (let k = 0; k < L; k++) for (let j = 0; j < nlat - 1; j++) {
      // marching squares on the (half-level, latitude) grid
      const v = [psi[k * nlat + j], psi[k * nlat + j + 1], psi[(k + 1) * nlat + j + 1], psi[(k + 1) * nlat + j]];
      const px = [X(lat[j]), X(lat[j + 1]), X(lat[j + 1]), X(lat[j])], py = [Y(zOf(sh[k])), Y(zOf(sh[k])), Y(zOf(sh[k + 1])), Y(zOf(sh[k + 1]))];
      const pts = [];
      for (let e = 0; e < 4; e++) {
        const a = v[e], b = v[(e + 1) % 4];
        if ((a - c) * (b - c) < 0) { const t = (c - a) / (b - a); pts.push([px[e] + (px[(e + 1) % 4] - px[e]) * t, py[e] + (py[(e + 1) % 4] - py[e]) * t]); }
      }
      if (pts.length >= 2) { ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[1][0], pts[1][1]); if (pts.length === 4) { ctx.moveTo(pts[2][0], pts[2][1]); ctx.lineTo(pts[3][0], pts[3][1]); } }
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // the cells, labelled from the model
  const cells = cellLabels(psi, nlat, L, lat);
  ctx.font = "10px system-ui, sans-serif";
  for (const c of cells) {
    const v = Math.abs(c.psi) / 1e10, t = `${c.name} ${v.toFixed(v < 1 ? 1 : 0)}`, w = ctx.measureText(t).width, x = X(c.lat) - w / 2, y = Y(zOf(sh[c.k]));
    ctx.fillStyle = "rgba(18,22,28,0.8)"; ctx.fillRect(x - 3, y - 10, w + 6, 13);
    ctx.fillStyle = c.name === "Ferrel" ? "#9fd4ff" : "#ffb070"; ctx.fillText(t, x, y);
  }
  // axes and key
  ctx.strokeStyle = "#999"; ctx.lineWidth = 1; ctx.strokeRect(P.x, P.y, P.w, P.h);
  ctx.fillStyle = "#cfd6de";
  for (const l of [-90, -60, -30, 0, 30, 60, 90]) ctx.fillText(l === 0 ? "0°" : `${Math.abs(l)}°${l > 0 ? "N" : "S"}`, X(l) - 10, P.y + P.h + 14);
  for (const km of [0, 4, 8, 12, 16]) ctx.fillText(`${km} km`, 4, Y(km * 1000) + 4);
  const kx = P.x + P.w + 12, ky = P.y, kh = P.h;
  for (let i = 0; i < kh; i++) { const [r, g, b] = col(umax * (1 - (2 * i) / kh)); ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fillRect(kx, ky + i, 12, 1); }
  ctx.fillStyle = "#cfd6de";
  ctx.fillText(`+${umax}`, kx + 15, ky + 8); ctx.fillText("0", kx + 15, ky + kh / 2 + 4); ctx.fillText(`−${umax}`, kx + 15, ky + kh); ctx.fillText("m/s", kx + 15, ky + kh / 2 - 12);
  if (opts.title) ctx.fillText(opts.title, P.x, 13);
  return { P, cells };
}

// Mean surface wind (lowest level) in the three textbook belts of each hemisphere, m/s (+ from the west).
export function surfaceBelts(u, L, nlat, lat) {
  const band = (h, a, b) => { let s = 0, n = 0; for (let j = 0; j < nlat; j++) { const x = lat[j] * h; if (x >= a && x <= b) { s += u[(L - 1) * nlat + j]; n++; } } return n ? s / n : NaN; };
  return { tradesN: band(1, 5, 25), westN: band(1, 40, 60), polarN: band(1, 68, 88), tradesS: band(-1, 5, 25), westS: band(-1, 40, 60), polarS: band(-1, 68, 88) };
}

// Flow lines of a wind field (u, v: one level, nlat x nlon, m/s): from seeds every `spacing` deg
// (fewer toward the poles), traced downstream along the wind's direction in steps of stepKm
// (midpoint rule), `steps` long; each point carries the wind speed. A line stops near the poles
// or in calm air, and is split where it crosses longitude 0/360 (the flat map's seam).
// [[{lat, lon, spd}, ...], ...]
export function flowLines(u, v, nlat, nlon, lat, { spacing = 9, steps = 22, stepKm = 90, calm = 0.5 } = {}) {
  const R = 6371, D = Math.PI / 180, out = [];
  const at = (la, lo) => {
    let j1 = 1; while (j1 < nlat - 1 && lat[j1] < la) j1++;
    const j0 = j1 - 1, y = Math.max(0, Math.min(1, (la - lat[j0]) / (lat[j1] - lat[j0])));
    const fx = ((((lo % 360) + 360) % 360) / 360) * nlon, i0 = Math.floor(fx) % nlon, i1 = (i0 + 1) % nlon, x = fx - Math.floor(fx);
    const b = (f) => (f[j0 * nlon + i0] * (1 - x) + f[j0 * nlon + i1] * x) * (1 - y) + (f[j1 * nlon + i0] * (1 - x) + f[j1 * nlon + i1] * x) * y;
    return [b(u), b(v)];
  };
  const move = (la, lo, uu, vv, km) => { const s = Math.hypot(uu, vv) || 1; return [la + ((vv / s) * km) / R / D, lo + ((uu / s) * km) / (R * Math.max(0.05, Math.cos(la * D))) / D]; };
  for (let la0 = -78; la0 <= 78; la0 += spacing) {
    const dlon = spacing / Math.max(0.25, Math.cos(la0 * D));
    for (let lo0 = (la0 / spacing) % 2 ? dlon / 2 : 0; lo0 < 360; lo0 += dlon) {
      let la = la0, lo = lo0, line = [];
      for (let s = 0; s <= steps; s++) {
        const [uu, vv] = at(la, lo), spd = Math.hypot(uu, vv);
        if (spd < calm || Math.abs(la) > 85) break;
        line.push({ lat: la, lon: lo, spd });
        const [lm, om] = move(la, lo, uu, vv, stepKm / 2), [um, vm] = at(lm, om);
        let [ln, on] = move(la, lo, um, vm, stepKm);
        if (on >= 360 || on < 0) { if (line.length > 1) out.push(line); on = ((on % 360) + 360) % 360; line = []; }
        la = ln; lo = on;
      }
      if (line.length > 1) out.push(line);
    }
  }
  return out;
}

// The equator's section, 5°S–5°N, 30-day mean (2026-10-10, the Walker circulation). d: {L, nlon, sf, sh,
// eqU (L x nlon, m/s), eqW (L x nlon, sigma-dot 1/s), sst (nlon, °C or null over land), sstAnom (optional)}.
// Arrows: the east-west wind and the vertical motion, the vertical stretched so both show (as the particles).
export function drawEqSlice(ctx, W, H, d, opts = {}) {
  const strip = 16, P = { x: 44, y: 22, w: W - 44 - 58, h: H - 22 - 30 - strip }, top = 16000;
  ctx.clearRect(0, 0, W, H);
  ctx.font = "11px system-ui, sans-serif";
  const { L, nlon, sh, sf, eqU, eqW } = d, lon0 = opts.lon0 ?? 30;           // the chart runs from 30°E right round to 30°E
  const zOf = (sg) => -HS_M * Math.log(Math.max(sg, 1e-6));
  const X = (lo) => P.x + ((((lo - lon0) % 360) + 360) % 360 / 360) * P.w, Y = (z) => P.y + P.h - (Math.min(z, top) / top) * P.h;
  const umax = opts.umax ?? 30, dl = 360 / nlon, col = (v) => windCol(v, umax);
  for (let k = 0; k < L; k++) {
    const y0 = Y(zOf(sh[k])), y1 = Y(zOf(sh[k + 1]));
    for (let i = 0; i < nlon; i++) {
      const xa = X(i * dl - dl / 2), [r, g, b] = col(eqU[k * nlon + i]);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      const w = (dl / 360) * P.w;
      if (xa + w > P.x + P.w + 0.5) { ctx.fillRect(xa, Math.min(y0, y1), P.x + P.w - xa, Math.abs(y1 - y0) + 0.5); ctx.fillRect(P.x, Math.min(y0, y1), xa + w - P.x - P.w, Math.abs(y1 - y0) + 0.5); }
      else ctx.fillRect(xa, Math.min(y0, y1), w + 0.5, Math.abs(y1 - y0) + 0.5);
    }
  }
  // arrows every other column: horizontal from u (8 m/s = one column spacing), vertical from sigma-dot
  // (w = -H sigma-dot / sigma, 1 mm/s = a quarter of the plot's height)
  // a fixed vertical scale (panel review: rescaling each frame hid El Nino vs normal): 1 mm/s up = a tenth of the plot
  const vs = (0.1 * P.h) / 1e-3;
  ctx.strokeStyle = "rgba(15,15,15,0.85)"; ctx.fillStyle = "rgba(15,15,15,0.85)"; ctx.lineWidth = 1.3;
  for (let k = 1; k < L; k++) for (let i = 0; i < nlon; i += 2) {
    const x = X(i * dl), y = Y(zOf(sf[k])), u = eqU[k * nlon + i], wz = (-HS_M * eqW[k * nlon + i]) / sf[k];
    const dx = (u / 8) * ((2 * dl) / 360) * P.w * 0.5, dy = -wz * vs * 0.5, len = Math.hypot(dx, dy);
    if (len < 2) continue;
    ctx.beginPath(); ctx.moveTo(x - dx, y - dy); ctx.lineTo(x + dx, y + dy); ctx.stroke();
    const a = Math.atan2(dy, dx); ctx.beginPath(); ctx.moveTo(x + dx, y + dy);
    ctx.lineTo(x + dx - 5 * Math.cos(a - 0.45), y + dy - 5 * Math.sin(a - 0.45)); ctx.lineTo(x + dx - 5 * Math.cos(a + 0.45), y + dy - 5 * Math.sin(a + 0.45)); ctx.fill();
  }
  // the sea under it
  if (d.sst) {
    const stops = d.sstAnom ? PE_FILLS.sstAnom.stops : PE_FILLS.sst.stops, src = d.sstAnom ?? d.sst;
    for (let i = 0; i < nlon; i++) {
      const v = src[i], xa = X(i * dl - dl / 2), w = (dl / 360) * P.w;
      if (v == null || !Number.isFinite(v)) { ctx.fillStyle = "#6b5a3e"; } else { const [r, g, b] = colourAt(stops, v); ctx.fillStyle = `rgb(${r},${g},${b})`; }
      if (xa + w > P.x + P.w + 0.5) { ctx.fillRect(xa, P.y + P.h + 2, P.x + P.w - xa, strip); ctx.fillRect(P.x, P.y + P.h + 2, xa + w - P.x - P.w, strip); }
      else ctx.fillRect(xa, P.y + P.h + 2, w + 0.5, strip);
    }
    ctx.fillStyle = "#cfd6de"; ctx.fillText(d.sstAnom ? "sea vs normal" : "sea °C", 2, P.y + P.h + 14);
  }
  ctx.strokeStyle = "#999"; ctx.lineWidth = 1; ctx.strokeRect(P.x, P.y, P.w, P.h);
  ctx.fillStyle = "#cfd6de";
  for (const lo of [60, 120, 180, 240, 300]) ctx.fillText(lo === 180 ? "180°" : lo < 180 ? `${lo}°E` : `${360 - lo}°W`, X(lo) - 12, P.y + P.h + strip + 15);
  for (const km of [0, 4, 8, 12]) ctx.fillText(`${km} km`, 4, Y(km * 1000) + 4);
  const kx = P.x + P.w + 12, ky = P.y, kh = P.h;
  for (let i = 0; i < kh; i++) { const [r, g, b] = col(umax * (1 - (2 * i) / kh)); ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fillRect(kx, ky + i, 12, 1); }
  ctx.fillStyle = "#cfd6de";
  ctx.fillText(`+${umax}`, kx + 15, ky + 8); ctx.fillText("0", kx + 15, ky + kh / 2 + 4); ctx.fillText(`−${umax}`, kx + 15, ky + kh); ctx.fillText("m/s", kx + 15, ky + kh / 2 - 12);
  if (opts.title) ctx.fillText(opts.title, P.x, 13);
  ctx.textAlign = "right"; ctx.fillText("arrows: 1 mm/s up = ⅒ of the height; 8 m/s across = 2 columns", P.x + P.w + 50, P.y + P.h + strip + 27); ctx.textAlign = "left";
  return { P, X };
}
