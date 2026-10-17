// The probe: click the map to pin a column and see
//   - its PROFILE at the real model step nearest the time on screen:
//     temperature and dewpoint by level (a simple sounding), wind and RH;
//   - its METEOGRAM: sea-level pressure and 10 m wind at every real step
//     of the run(s), with now and the time on screen marked.
// Values come from the nearest grid point (no spatial interpolation) and
// from real steps only (no time blending); lines between meteogram points
// are just lines between real values.
//
// Pure functions producing data and SVG strings -- no imports, so
// node --test loads them (tests/js/probe.test.mjs).

const KT = 1.943844;

// Nearest grid index to lat/lon (lon in either convention), or -1 outside.
export function nearestIndex(grid, lat, lon) {
  let x = lon;
  while (x < grid.lon0 - 1e-9) x += 360;
  const i = Math.round((x - grid.lon0) / grid.dlon), j = Math.round((lat - grid.lat0) / grid.dlat);
  if (i < 0 || j < 0 || i >= grid.nlon || j >= grid.nlat) return -1;
  return j * grid.nlon + i;
}

// Dewpoint (°C) from temperature (°C) and relative humidity (%), Magnus
// formula (a = 17.625, b = 243.04 °C; Alduchov & Eskridge 1996), good to
// ~0.1 °C over -40..+50 °C.
export function dewpoint(tC, rh) {
  if (!(rh > 0)) return NaN;
  const a = 17.625, b = 243.04, g = Math.log(Math.min(rh, 100) / 100) + (a * tC) / (b + tC);
  return (b * g) / (a - g);
}

export function windFrom(u, v) {
  const kt = Math.hypot(u, v) * KT;
  const from = ((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360;
  return { kt, from };
}

// One column at one step. sfc: {mslp, t2m, u10, v10, psfc}; levels:
// [{p (hPa), f: {gh, t, u, v, r}}] (any order). Levels below the ground
// (psfc < p) are flagged, not dropped.
export function columnProfile(k, sfc, levels) {
  const psfcHpa = sfc.psfc[k] / 100;
  const w10 = windFrom(sfc.u10[k], sfc.v10[k]);
  const surface = { mslp: sfc.mslp[k] / 100, psfc: psfcHpa, t: sfc.t2m[k] - 273.15, wind: w10 };
  const rows = levels.map(({ p, f }) => {
    const t = f.t[k] - 273.15, rh = f.r[k];
    return { p, gh: f.gh[k], t, rh, td: dewpoint(t, rh), wind: windFrom(f.u[k], f.v[k]), w: f.w ? f.w[k] : NaN, below: psfcHpa < p };
  }).sort((a, b) => b.p - a.p);
  return { surface, rows };
}

const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : "–");
const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export const compass = (deg) => COMPASS[Math.round(deg / 22.5) % 16];

// Sounding: T (red) and dewpoint (green) against log-pressure, 1050-200 hPa.
export function profileSvg(prof, { w = 300, h = 210 } = {}) {
  const L = 34, R = 8, T = 8, B = 22;
  const lp = (p) => Math.log(p), y = (p) => T + ((lp(1050) - lp(p)) / (lp(1050) - lp(200))) * (h - T - B);
  const pts = prof.rows.filter((r) => !r.below);
  const temps = [...pts.flatMap((r) => [r.t, r.td]), prof.surface.t].filter(Number.isFinite);
  const lo = Math.floor((Math.min(...temps) - 3) / 10) * 10, hi = Math.ceil((Math.max(...temps) + 3) / 10) * 10;
  const x = (t) => L + ((t - lo) / (hi - lo)) * (w - L - R);
  const out = [`<svg class="probe-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Temperature and dewpoint profile">`];
  for (let t = lo; t <= hi; t += 10) out.push(`<line x1="${x(t)}" y1="${T}" x2="${x(t)}" y2="${h - B}" class="grid"/><text x="${x(t)}" y="${h - 8}" class="ax" text-anchor="middle">${t}</text>`);
  for (const r of prof.rows) out.push(`<line x1="${L}" y1="${y(r.p)}" x2="${w - R}" y2="${y(r.p)}" class="grid"/><text x="${L - 3}" y="${y(r.p) + 3}" class="ax" text-anchor="end">${r.p}</text>`);
  out.push(`<text x="${w - R}" y="${h - 8}" class="ax" text-anchor="end">°C</text>`);
  // Surface point at the surface pressure (2 m temperature; no 2 m dewpoint in the data).
  const line = (key, cls) => {
    const p = pts.map((r) => [x(r[key]), y(r.p)]).filter(([a]) => Number.isFinite(a));
    if (key === "t" && Number.isFinite(prof.surface.t) && prof.surface.psfc <= 1050) p.unshift([x(prof.surface.t), y(prof.surface.psfc)]);
    return `<polyline points="${p.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" ")}" class="${cls}"/>`
      + p.map(([a, b]) => `<circle cx="${a.toFixed(1)}" cy="${b.toFixed(1)}" r="2" class="${cls}"/>`).join("");
  };
  out.push(line("td", "td"), line("t", "t"), "</svg>");
  return out.join("");
}

// unit: "km" or "ft" for the height column. A "w" column (vertical motion,
// cm/s, + rising) when the build has it.
export function profileTable(prof, unit = "km") {
  const s = prof.surface, hasW = prof.rows.some((r) => Number.isFinite(r.w));
  const wCell = (r) => (hasW ? `<td class="${r.w > 0.5 ? "up" : r.w < -0.5 ? "down" : ""}">${Number.isFinite(r.w) ? (r.w > 0 ? "+" : "") + fmt(r.w, Math.abs(r.w) < 10 ? 1 : 0) : "–"}</td>` : "");
  const rows = prof.rows.map((r) => r.below
    ? `<tr class="below"><td>${r.p}</td><td colspan="${hasW ? 6 : 5}">below ground here</td></tr>`
    : `<tr><td>${r.p}</td><td>${unit === "ft" ? Math.round((r.gh * 3.28084) / 100) * 100 : fmt(r.gh / 1000, 2)}</td><td>${fmt(r.t, 1)}</td><td>${fmt(r.td, 1)}</td><td>${fmt(r.rh)}</td><td>${compass(r.wind.from)} ${fmt(r.wind.kt)}</td>${wCell(r)}</tr>`);
  return `<table class="probe-tab"><tr><th>mb</th><th>${unit}</th><th>T °C</th><th>Td °C</th><th>RH %</th><th>wind kt</th>${hasW ? `<th title="Vertical motion, cm/s: + rising, − sinking">w cm/s</th>` : ""}</tr>${rows.join("")}
    <tr class="sfc"><td>sfc</td><td>0</td><td>${fmt(s.t, 1)}</td><td>–</td><td>–</td><td>${compass(s.wind.from)} ${fmt(s.wind.kt)}</td>${hasW ? "<td>0</td>" : ""}</tr></table>
    <p class="probe-sfc">Sea-level pressure ${fmt(s.mslp, 1)} hPa · surface pressure ${fmt(s.psfc, 0)} hPa</p>`;
}

// Meteogram. series: [{label, cls, pts: [[h, mslp_hPa, wind10_kt, hs_m?], ...]}]
// (real steps only); markH: {now, shown} hours; dayTicks: [[h, label]].
// A third panel, significant wave height, appears when any point has one
// (over land, or a build without waves, it's left out). waveUnit "ft"
// draws it in feet (the data stay metres).
export function meteogramSvg(series, { now, shown, dayTicks = [] }, { w = 300, h = null, waveUnit = "m" } = {}) {
  if (waveUnit === "ft") series = series.map((s) => ({ ...s, pts: s.pts.map((p) => (p.length > 3 ? [p[0], p[1], p[2], p[3] * 3.28084] : p)) }));
  const all = series.flatMap((s) => s.pts);
  if (!all.length) return "";
  const waves = all.some((p) => Number.isFinite(p[3]));
  const panels = waves ? 3 : 2, H = h ?? (waves ? 270 : 190);
  const L = 34, R = 8, T = 6, gap = 16, B = 16, ph = (H - T - B - gap * (panels - 1)) / panels;
  const h0 = Math.min(...all.map((p) => p[0])), h1 = Math.max(...all.map((p) => p[0]));
  const x = (v) => L + ((v - h0) / Math.max(1e-6, h1 - h0)) * (w - L - R);
  const rng = (i, pad) => {
    const v = all.map((p) => p[i]).filter(Number.isFinite);
    return [Math.floor(Math.min(...v) - pad), Math.ceil(Math.max(...v) + pad)];
  };
  const top = (n) => T + n * (ph + gap);                       // top of panel n
  const [p0, p1] = rng(1, 2), [w0, w1] = [0, Math.max(10, rng(2, 3)[1])];
  const [s0, s1] = waves ? [0, Math.max(2, Math.ceil(rng(3, 0.5)[1]))] : [0, 1];
  const yP = (v) => top(0) + ph - ((v - p0) / Math.max(1, p1 - p0)) * ph;
  const yW = (v) => top(1) + ph - ((v - w0) / (w1 - w0)) * ph;
  const yS = (v) => top(2) + ph - ((v - s0) / (s1 - s0)) * ph;
  const out = [`<svg class="probe-svg" viewBox="0 0 ${w} ${H}" width="${w}" height="${H}" role="img" aria-label="Meteogram">`];
  for (const [hh, lab] of dayTicks) {
    if (hh < h0 || hh > h1) continue;
    out.push(`<line x1="${x(hh)}" y1="${T}" x2="${x(hh)}" y2="${H - B}" class="grid"/><text x="${x(hh) + 2}" y="${H - 4}" class="ax">${lab}</text>`);
  }
  const axis = (n, hi, lo, label) => out.push(
    `<text x="${L - 3}" y="${top(n) + 8}" class="ax" text-anchor="end">${hi}</text><text x="${L - 3}" y="${top(n) + ph}" class="ax" text-anchor="end">${lo}</text>`,
    `<text x="${L + 3}" y="${top(n) + 9}" class="ax lab">${label}</text>`);
  axis(0, p1, p0, "sea-level pressure, hPa");
  axis(1, w1, 0, "10 m wind, kt");
  if (waves) axis(2, s1, 0, `significant wave height, ${waveUnit === "ft" ? "ft" : "m"}`);
  const line = (pts, i, y) => pts.filter((p) => Number.isFinite(p[i])).map((p) => `${x(p[0]).toFixed(1)},${y(p[i]).toFixed(1)}`).join(" ");
  for (const s of series) {
    out.push(`<polyline points="${line(s.pts, 1, yP)}" class="${s.cls}"/><polyline points="${line(s.pts, 2, yW)}" class="${s.cls}"/>`);
    if (waves) out.push(`<polyline points="${line(s.pts, 3, yS)}" class="${s.cls}"/>`);
  }
  for (const [v, cls] of [[now, "now"], [shown, "shown"]]) {
    if (Number.isFinite(v) && v >= h0 && v <= h1) out.push(`<line x1="${x(v)}" y1="${T}" x2="${x(v)}" y2="${H - B}" class="${cls}"/>`);
  }
  out.push("</svg>");
  return out.join("");
}

// Hours on the timeline -> meteogram x position fraction (for click-to-set-time).
export function meteogramHourAt(fraction, series, { w = 300 } = {}) {
  const all = series.flatMap((s) => s.pts.map((p) => p[0]));
  const h0 = Math.min(...all), h1 = Math.max(...all), L = 34, R = 8;
  const px = fraction * w;
  return h0 + ((px - L) / (w - L - R)) * (h1 - h0);
}
