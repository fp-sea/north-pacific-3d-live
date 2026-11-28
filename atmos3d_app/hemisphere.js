// The Northern Hemisphere view's data (docs/hemisphere_plan.md; user request 2026-10-17): each 6-hourly step's "nh"
// bundle, 1° from 90 N to 20 S and all the way round (0..359 E), with the manifest's optional "hemisphere" block. Pure,
// no imports (node --test loads it).

// The grid with its first column repeated at 360 E, so a mesh, a fill and the contours drawn from it close at the seam
// instead of leaving a gap at Greenwich.
export function nhGrid(hemisphere) {
  const g = hemisphere.grid;
  return { lat0: g.lat0, dlat: g.dlat, nlat: g.nlat, lon0: g.lon0, dlon: g.dlon, nlon: g.nlon + 1, wrap: true };
}

// fields {name: Float32Array(nlat * nlon)} -> the same on nhGrid (nlon + 1 columns, the last a copy of the first).
export function wrapFields(fields, hemisphere) {
  const { nlat, nlon } = hemisphere.grid, out = {};
  for (const [k, a] of Object.entries(fields)) {
    const b = new Float32Array(nlat * (nlon + 1));
    for (let j = 0; j < nlat; j++) {
      b.set(a.subarray(j * nlon, (j + 1) * nlon), j * (nlon + 1));
      b[j * (nlon + 1) + nlon] = a[j * nlon];
    }
    out[k] = b;
  }
  return out;
}

// The steps (hours from the manifest's anchor) that have a hemisphere bundle for a model, ascending.
export function nhSteps(manifest, model) {
  const f = manifest?.files?.[model] ?? {};
  return Object.keys(f).filter((s) => f[s]?.nh).map(Number).sort((a, b) => a - b);
}

// The troughs round a latitude circle (500 mb height on the hemisphere grid, nlon columns all the way round): the
// height along the circle smoothed over `smoothDeg`, then every dip at least `minDepth` m below the highest point
// within `sepDeg` either side, at least `sepDeg` apart. Counts what a reader sees as troughs, not each wiggle
// (panel, 2026-10-17: a single "dominant wavenumber" over the hemisphere is usually 1 or 2 while the eye counts 4-6).
// Returns [{lon, depth}] in increasing longitude.
export function troughsAt(gh, hemisphere, lat, { smoothDeg = 15, minDepth = 30, sepDeg = 25 } = {}) {
  const { lat0, dlat, nlon, dlon } = hemisphere.grid;
  const j = Math.round((lat - lat0) / dlat);
  const row = Array.from({ length: nlon }, (_, i) => gh[j * nlon + i]);
  const half = Math.max(1, Math.round(smoothDeg / dlon / 2)), sep = Math.max(1, Math.round(sepDeg / dlon));
  const at = (i) => row[((i % nlon) + nlon) % nlon];
  const s = row.map((_, i) => { let sum = 0; for (let d = -half; d <= half; d++) sum += at(i + d); return sum / (2 * half + 1); });
  const sa = (i) => s[((i % nlon) + nlon) % nlon];
  const found = [];
  for (let i = 0; i < nlon; i++) {
    let isMin = true, rimL = -Infinity, rimR = -Infinity;
    for (let d = 1; d <= sep; d++) {
      if (sa(i - d) < s[i] || sa(i + d) < s[i]) { isMin = false; break; }
      rimL = Math.max(rimL, sa(i - d)); rimR = Math.max(rimR, sa(i + d));
    }
    const depth = Math.min(rimL, rimR) - s[i];
    if (isMin && depth >= minDepth) found.push({ lon: i * dlon, depth: Math.round(depth) });
  }
  // flat bottoms can mark neighbouring points: keep the deeper of any two closer than sep
  const out = [];
  for (const t of found) {
    const prev = out.at(-1);
    if (prev && t.lon - prev.lon < sepDeg) { if (t.depth > prev.depth) out[out.length - 1] = t; } else out.push(t);
  }
  if (out.length > 1 && out[0].lon + 360 - out.at(-1).lon < sepDeg) {
    if (out[0].depth >= out.at(-1).depth) out.pop(); else out.shift();
  }
  return out;
}

// Follow one trough through the steps (the second question): series [{step, troughs: [{lon, depth}]}] in time order,
// starting from the trough nearest `startLon` at the first step. At each next step the trough taken is the one whose
// eastward move from the last position is likeliest: between 4° back and 8° on per 6 hours, nearest to 3° on per
// 6 hours (the smoothed troughs move up to about 20° a day; panel review 2026-10-17: a 30° window let a filling trough
// hop to the next one, only 25° downstream). It stops where none is in that window (the trough
// has faded, merged or stalled out of reach), so a lost trough is said to be lost, never jumped to another one.
// Returns [{step, lon}].
export function followTrough(series, startLon) {
  if (!series.length || !series[0].troughs.length) return [];
  const east = (a, b) => ((b - a + 540) % 360) - 180;          // b's longitude east of a's, -180..180
  let cur = series[0].troughs.reduce((best, t) => (Math.abs(east(startLon, t.lon)) < Math.abs(east(startLon, best.lon)) ? t : best));
  const out = [{ step: series[0].step, lon: cur.lon }];
  for (let i = 1; i < series.length; i++) {
    const k = (series[i].step - series[i - 1].step) / 6, want = 3 * k;
    const cands = series[i].troughs.filter((t) => { const d = east(cur.lon, t.lon); return d >= -4 * k && d <= 8 * k; });
    if (!cands.length) break;
    cur = cands.reduce((best, t) => (Math.abs(east(cur.lon, t.lon) - want) < Math.abs(east(cur.lon, best.lon) - want) ? t : best));
    out.push({ step: series[i].step, lon: cur.lon });
  }
  return out;
}

// The bold line (the edge of the polar air): of the 60 m contours of 500 mb height, the one whose mean latitude round
// the hemisphere is nearest `lat`. Each meridian's latitude is where the height first reaches the contour coming south
// from the pole (so a cut-off low further south doesn't count), interpolated between grid rows. The plain zonal-mean
// height at 50 N gives a line averaging ~53 N on real days (troughs dip it further than ridges lift it), so it's
// searched for, not guessed. gh on the hemisphere grid (nlon columns, no wrap). Returns {z, meanLat}.
export function boldContour(gh, hemisphere, lat = 50) {
  const { lat0, dlat, nlat, nlon } = hemisphere.grid;
  const meanLat = (z) => {
    let sum = 0;
    for (let i = 0; i < nlon; i++) {
      let la = lat0 + (nlat - 1) * dlat;
      for (let j = 1; j < nlat; j++) {
        const a = gh[(j - 1) * nlon + i], b = gh[j * nlon + i];
        if (a < z && b >= z) { la = lat0 + (j - 1 + (z - a) / (b - a)) * dlat; break; }
      }
      sum += la;
    }
    return sum / nlon;
  };
  const j = Math.round((lat - lat0) / dlat);
  let m = 0;
  for (let i = 0; i < nlon; i++) m += gh[j * nlon + i];
  const start = Math.round(m / nlon / 60) * 60;
  let best = null;
  for (let z = start - 360; z <= start + 360; z += 60) {
    const ml = meanLat(z);
    if (!best || Math.abs(ml - lat) < Math.abs(best.meanLat - lat)) best = { z, meanLat: ml };
  }
  return best;
}

// Where the air arriving at (lat, lon) at hour `h` came from: traced back through windAt(hour, lat, lon) -> [u, v] or
// null (no data then) in steps of `dtH` hours, for at most `hours`; stops where the data end. Midpoint (RK2) steps with
// the wind as a 3-D vector, so the midpoint's wind is applied in the right direction at the start point (with u, v
// reused in the start point's own frame, a steady west wind drifted the air 0.8 deg toward the equator in 48 h).
// Returns [[hour, lat, lon], ...] from the arrival backward.
export function traceBackSphere(windAt, h, lat, lon, hours = 120, dtH = 1) {
  const D = Math.PI / 180;
  const unit = (la, lo) => [Math.cos(la * D) * Math.cos(lo * D), Math.cos(la * D) * Math.sin(lo * D), Math.sin(la * D)];
  const ll = (x) => [Math.asin(Math.max(-1, Math.min(1, x[2]))) / D, ((Math.atan2(x[1], x[0]) / D) % 360 + 360) % 360];
  const vec = (la, lo, u, v) => {
    const p = la * D, l = lo * D;
    return [-u * Math.sin(l) - v * Math.sin(p) * Math.cos(l), u * Math.cos(l) - v * Math.sin(p) * Math.sin(l), v * Math.cos(p)];
  };
  const move = (x, V, sec) => { const k = sec / 6371000, y = [x[0] + k * V[0], x[1] + k * V[1], x[2] + k * V[2]], r = Math.hypot(...y); return y.map((c) => c / r); };
  const out = [[h, lat, lon]];
  let t = h, x = unit(lat, lon);
  for (let n = 0; n < Math.round(hours / dtH); n++) {
    const [la, lo] = ll(x), w1 = windAt(t, la, lo);
    if (!w1 || !windAt(t - dtH, la, lo)) break;
    const xm = move(x, vec(la, lo, w1[0], w1[1]), -dtH * 1800), [lam, lom] = ll(xm), w2 = windAt(t - dtH / 2, lam, lom);
    if (!w2) break;
    x = move(x, vec(lam, lom, w2[0], w2[1]), -dtH * 3600);
    t -= dtH;
    out.push([t, ...ll(x)]);
  }
  return out;
}

// An archive day (2 deg, all the way round, 90 N to 20 S) drawn on the view's 1 deg grid: bilinear in between, across
// the seam, for display only (the readout says the data are 2 deg). NaN (850 mb underground) spreads to its neighbours
// rather than being mixed in. fields {name: Float32Array(src nlat * nlon)} -> {name: Float32Array(dst nlat * nlon)}.
export function upsampleDay(fields, src, dst) {
  const out = {};
  for (const [k, a] of Object.entries(fields)) {
    const b = new Float32Array(dst.nlat * dst.nlon);
    for (let j = 0; j < dst.nlat; j++) {
      const fj = Math.min(src.nlat - 1.000001, Math.max(0, (dst.lat0 + j * dst.dlat - src.lat0) / src.dlat));
      const j0 = Math.floor(fj), y = fj - j0;
      for (let i = 0; i < dst.nlon; i++) {
        const fi = ((dst.lon0 + i * dst.dlon - src.lon0) % 360 + 360) % 360 / src.dlon;
        const i0 = Math.floor(fi) % src.nlon, i1 = (i0 + 1) % src.nlon, x = fi - Math.floor(fi);
        const v = (r, c) => a[r * src.nlon + c];
        b[j * dst.nlon + i] = (v(j0, i0) * (1 - x) + v(j0, i1) * x) * (1 - y) + (v(j0 + 1, i0) * (1 - x) + v(j0 + 1, i1) * x) * y;
      }
    }
    out[k] = b;
  }
  return out;
}

// Blocked flow (panel 2026-10-17; Tibaldi and Molteni 1990): at each longitude the 500 mb height gradient south and
// north of a central latitude near 60 N, tried at 56, 60 and 64 N. Blocked where the height RISES toward the pole on
// the south side (GHGS > 0: the westerlies there have reversed) and falls steeply on the north side (GHGN < -10 m per
// degree of latitude), over 20 degrees each way. An instantaneous flag ("blocked flow now"), not a block: a block is the
// flag lasting days over a span of longitude (blockSpans, and the guide). gh on the hemisphere grid (no wrap column).
// Returns a Uint8Array(nlon), 1 where blocked.
export function blockedLongitudes(gh, hemisphere, { centres = [56, 60, 64], reach = 20, north = -10 } = {}) {
  const { lat0, dlat, nlon } = hemisphere.grid;
  const row = (lat) => Math.round((lat - lat0) / dlat);
  const out = new Uint8Array(nlon);
  for (let i = 0; i < nlon; i++) {
    for (const c of centres) {
      const z0 = gh[row(c) * nlon + i], zs = gh[row(c - reach) * nlon + i], zn = gh[row(c + reach) * nlon + i];
      const ghgs = (z0 - zs) / reach, ghgn = (zn - z0) / reach;
      if (ghgs > 0 && ghgn < north) { out[i] = 1; break; }
    }
  }
  return out;
}

// The blocked longitudes as spans round the circle, at least `minDeg` wide (a span across 0 E is one span):
// [{from, to, width}] in degrees east (to may pass 360).
export function blockSpans(flags, hemisphere, minDeg = 15) {
  const { nlon, dlon } = hemisphere.grid, spans = [];
  if (flags.every((f) => f)) return [{ from: 0, to: 360, width: 360 }];
  const start = flags.findIndex((f) => !f);                      // begin in unblocked air, so a span across 0 E stays whole
  let run = null;
  for (let n = 1; n <= nlon; n++) {
    const i = (start + n) % nlon;
    if (flags[i] && !run) run = { s: start + n };
    if (!flags[i] && run) { spans.push({ from: (run.s * dlon) % 360, to: (run.s * dlon) % 360 + (start + n - run.s) * dlon, width: (start + n - run.s) * dlon }); run = null; }
  }
  return spans.filter((s) => s.width >= minDeg);
}

// Blocks (the panel's distinction, 2026-10-17: "blocked flow at this time" vs "a block"): blocked spans (blockSpans,
// at least 15 deg wide) linked from step to step where they overlap or their centres are within `drift` degrees
// (blocks wander slowly), kept when the chain lasts at least `minHours` (4 days, after Davini et al. 2012's 5-day
// rule relaxed to 4 for a 7-day forecast). series: [{step (hours), spans: [{from, to}]}] in time order.
// Returns [{start, end, hours, from, to}] (from/to: the span at its widest, deg east; to may pass 360).
export function findBlocks(series, { drift = 10, minHours = 96 } = {}) {
  const centre = (s) => (((s.from + s.to) / 2) % 360 + 360) % 360;
  const near = (a, b) => {
    const d = Math.abs(((centre(a) - centre(b) + 540) % 360) - 180);
    const overlap = !(a.to < b.from - 360 || a.from > b.to + 360) && (Math.min(a.to, b.to) >= Math.max(a.from, b.from) || Math.min(a.to + 360, b.to) >= Math.max(a.from + 360, b.from) || Math.min(a.to, b.to + 360) >= Math.max(a.from, b.from + 360));
    return overlap || d <= drift;
  };
  let open = [];                                                   // chains still running: {start, last, span, widest}
  const done = [];
  for (let i = 0; i < series.length; i++) {
    const { step, spans } = series[i], next = [];
    for (const sp of spans) {
      const c = open.find((ch) => near(ch.span, sp));
      if (c) { open = open.filter((x) => x !== c); next.push({ ...c, last: step, span: sp, widest: sp.to - sp.from > c.widest.to - c.widest.from ? sp : c.widest }); }
      else next.push({ start: step, last: step, span: sp, widest: sp });
    }
    done.push(...open);                                            // chains with no span this step have ended
    open = next;
  }
  done.push(...open);
  // each chain's length counts one step's spacing at its end, taken where it ended (6-hourly, or 12-hourly in days 8-10)
  const gapAt = (step) => { const i = series.findIndex((x) => x.step === step); return i > 0 ? step - series[i - 1].step : series.length > 1 ? series[1].step - series[0].step : 0; };
  return done.map((c) => ({ start: c.start, end: c.last, hours: c.last - c.start + gapAt(c.last), from: c.widest.from, to: c.widest.to }))
    .filter((b) => b.hours >= minHours).sort((a, b) => a.start - b.start);
}

// A Hovmoller row: a field (the 250 mb north-south wind) averaged over a latitude band, weighted by cos(latitude),
// at every longitude. field on the hemisphere grid (nlon columns, no wrap). Returns Float32Array(nlon).
export function bandMean(field, hemisphere, latS = 40, latN = 60) {
  const { lat0, dlat, nlat, nlon } = hemisphere.grid, out = new Float32Array(nlon);
  let wsum = 0;
  for (let j = 0; j < nlat; j++) {
    const lat = lat0 + j * dlat;
    if (lat < latS - 1e-6 || lat > latN + 1e-6) continue;
    const w = Math.cos((lat * Math.PI) / 180);
    wsum += w;
    for (let i = 0; i < nlon; i++) out[i] += w * field[j * nlon + i];
  }
  for (let i = 0; i < nlon; i++) out[i] /= wsum || 1;
  return out;
}

// The stratospheric polar vortex at one step (panel 2026-10-17): the zonal-mean westerly wind at 60 N, 10 mb (m/s; it
// turns easterly in a major sudden stratospheric warming, and for good in the spring's final warming), and the
// polar-cap 10 mb height anomaly, cos-weighted over 60-90 N (m; positive: a warm, weak vortex). fields: u10mb and,
// with the climatology, gha10mb, on the hemisphere grid. Returns {u60, cap} (cap null without the anomaly) or null.
export function vortexStats(fields, hemisphere) {
  if (!fields?.u10mb) return null;
  const { lat0, dlat, nlat, nlon } = hemisphere.grid, j60 = Math.round((60 - lat0) / dlat);
  let u = 0;
  for (let i = 0; i < nlon; i++) u += fields.u10mb[j60 * nlon + i];
  let cap = null;
  if (fields.gha10mb) {
    let s = 0, w = 0;
    for (let j = 0; j < nlat; j++) {
      const lat = lat0 + j * dlat;
      if (lat < 60 - 1e-6) continue;
      const c = Math.cos((lat * Math.PI) / 180);
      for (let i = 0; i < nlon; i++) { s += c * fields.gha10mb[j * nlon + i]; w += c; }
    }
    cap = w ? s / w : null;
  }
  return { u60: u / nlon, cap };
}

// How strong each wave is round the hemisphere (panel 2026-10-17: "amplitudes per latitude, then averaged"): the
// Fourier amplitude of the 500 mb height round each latitude circle from latS to latN, wavenumbers 1..kmax, averaged
// over the latitudes (cos-weighted). Amplitude = half the peak-to-trough height of that wave, in m. Waves 1-3 are the
// planetary waves (continents and mountains anchor them), 4-8 the synoptic, travelling ones. gh on the hemisphere
// grid (no wrap). Returns Float32Array(kmax + 1), index = wavenumber (0 unused).
export function waveAmplitudes(gh, hemisphere, latS = 40, latN = 60, kmax = 8) {
  const { lat0, dlat, nlat, nlon } = hemisphere.grid, amp = new Float32Array(kmax + 1);
  let wsum = 0;
  for (let j = 0; j < nlat; j++) {
    const lat = lat0 + j * dlat;
    if (lat < latS - 1e-6 || lat > latN + 1e-6) continue;
    const w = Math.cos((lat * Math.PI) / 180);
    wsum += w;
    for (let k = 1; k <= kmax; k++) {
      let a = 0, b = 0;
      for (let i = 0; i < nlon; i++) { const ph = (2 * Math.PI * k * i) / nlon, z = gh[j * nlon + i]; a += z * Math.cos(ph); b += z * Math.sin(ph); }
      amp[k] += w * (2 / nlon) * Math.hypot(a, b);
    }
  }
  for (let k = 1; k <= kmax; k++) amp[k] /= wsum || 1;
  return amp;
}

// The polar-cap mean of a field (60-90 N, cos-weighted): one number per level for the polar-cap time-height chart.
// field on the hemisphere grid; null if absent.
export function capMean(field, hemisphere, latS = 60) {
  if (!field) return null;
  const { lat0, dlat, nlat, nlon } = hemisphere.grid;
  let s = 0, w = 0;
  for (let j = 0; j < nlat; j++) {
    const lat = lat0 + j * dlat;
    if (lat < latS - 1e-6) continue;
    const c = Math.cos((lat * Math.PI) / 180);
    for (let i = 0; i < nlon; i++) { const v = field[j * nlon + i]; if (Number.isFinite(v)) { s += c * v; w += c; } }
  }
  return w ? s / w : null;
}

// The Hawaii tie-in (panel 2026-10-17): the subtropical high and the pressure difference that drives the trades. The
// trades blow from the high toward lower pressure near the equator, turned to the right; their strength follows the
// north-south squeeze across the islands, here the sea-level pressure at 30 N minus 20 N along 157 W (hPa). mslp in Pa
// on the hemisphere grid (no wrap). Returns {diff, high: {p, lat, lon}} or null.
export function tradesAtHawaii(mslp, hemisphere) {
  if (!mslp) return null;
  const { lat0, dlat, nlat, lon0, dlon, nlon } = hemisphere.grid;
  const at = (lat, lon) => mslp[Math.round((lat - lat0) / dlat) * nlon + Math.round((((lon - lon0) % 360) + 360) % 360 / dlon) % nlon] / 100;
  let high = null;
  for (let j = 0; j < nlat; j++) {
    const lat = lat0 + j * dlat;
    if (lat < 25 || lat > 45) continue;
    for (let i = 0; i < nlon; i++) {
      const lon = lon0 + i * dlon;
      if (lon < 170 || lon > 240) continue;
      const p = mslp[j * nlon + i] / 100;
      if (Number.isFinite(p) && (!high || p > high.p)) high = { p, lat, lon };
    }
  }
  // the east-west difference across the islands at 21 N (152 W minus 162 W): positive means lower pressure to the west,
  // a wind with a southerly (Kona) part; the north-south one alone can't see that (panel review 2026-10-17)
  return { diff: at(30, 203) - at(20, 203), ew: at(21, 208) - at(21, 198), high };
}

// The trades in words, from tradesAtHawaii (panel review 2026-10-17: geostrophically 8 hPa across 10 deg at 25 N is about
// 13-15 kt at the surface: fresh, not strong). Returns a phrase.
export function tradesWords(t) {
  if (t.ew >= 3 && t.diff < 8) return "southerly (Kona) winds likely: lower pressure to the west of the islands";
  return t.diff >= 11 ? "strong trades (stronger still in the channels)" : t.diff >= 8 ? "fresh trades" : t.diff >= 4 ? "moderate trades" : t.diff >= 0 ? "light trades" : "the trades interrupted (a low or a front near the islands)";
}

// A closed (cut-off) low aloft in a box (the Kona-low set-up near Hawaii: a closed 500 mb low south of 35 N between
// 170 E and 140 W; forecaster review 2026-10-17): of the box's local minima (lowest of their 8 neighbours), the one
// most closed, if it is at least `by` m lower than every point on a ring `ringDeg` round it. Not simply the box's
// lowest point: heights fall poleward, so that is nearly always on the box's north edge, on a slope (found on the real
// GFS run 2026-10-17). gh on the hemisphere grid. Returns {lat, lon, z, closedBy} or null.
export function cutoffLow(gh, hemisphere, { latS = 18, latN = 35, lonW = 170, lonE = 220, ringDeg = 6, by = 20 } = {}) {
  if (!gh) return null;
  const { lat0, dlat, nlat, lon0, dlon, nlon } = hemisphere.grid;
  const at = (la, lo) => gh[Math.max(0, Math.min(nlat - 1, Math.round((la - lat0) / dlat))) * nlon + Math.round((((lo - lon0) % 360) + 360) % 360 / dlon) % nlon];
  let best = null;
  for (let j = 1; j < nlat - 1; j++) {
    const lat = lat0 + j * dlat;
    if (lat < latS || lat > latN) continue;
    for (let i = 0; i < nlon; i++) {
      const lon = lon0 + i * dlon;
      if (lon < lonW || lon > lonE) continue;
      const z = gh[j * nlon + i];
      if (!Number.isFinite(z)) continue;
      let min = true;
      for (let dj = -1; dj <= 1 && min; dj++) for (let di = -1; di <= 1; di++) if ((dj || di) && !(z <= gh[(j + dj) * nlon + ((i + di + nlon) % nlon)])) { min = false; break; }
      if (!min) continue;
      let ring = Infinity;
      for (let a = 0; a < 360; a += 15) ring = Math.min(ring, at(lat + ringDeg * Math.sin((a * Math.PI) / 180), lon + (ringDeg * Math.cos((a * Math.PI) / 180)) / Math.cos((lat * Math.PI) / 180)));
      if (z < ring - by && (!best || ring - z > best.closedBy)) best = { lat, lon, z, closedBy: ring - z };
    }
  }
  return best;
}

// What a cut-off low near Hawaii means in the month (1-12): Kona lows are a cool-season thing; from May to September a
// closed low aloft there is usually a tropical upper-tropospheric trough (TUTT) low or a tropical cyclone. On the past
// year's daily maps the detector fired on 4-9 days a month from November to May and 15 a month in August and September.
export function cutoffWords(month) {
  return month >= 5 && month <= 9 ? "in summer usually a tropical upper-level (TUTT) low or a tropical cyclone, not a Kona low" : "a Kona-low set-up";
}

// The polar vortex in words for the season (both reviews 2026-10-17: the 10 mb wind at 60 N is easterly every summer, so
// "easterly" alone isn't a warming). month 1-12; rows [{u60}] through the forecast in time order. Returns {state, words}:
// "summer" (May-Sep, easterlies normal), "forming" (Oct), "ssw" (Nov-Mar easterly: a major sudden warming, after
// Charlton and Polvani 2007), "final-or-late" (a Mar-Apr reversal), "westerly".
export function vortexSeason(month, rows) {
  const u = rows.map((r) => r.u60), east = u.some((x) => x < 0), westFirst = u.length > 0 && u[0] > 0;
  if (month >= 5 && month <= 9) return { state: "summer", words: east ? "summer easterlies: normal, no vortex until autumn" : "a summer vortex still westerly: early or late in the season" };
  if (month === 10) return { state: east ? "forming" : "westerly", words: east ? "the vortex still forming for the winter" : "the vortex spinning up for the winter" };
  if (east && (month === 3 || month === 4)) return { state: "final-or-late", words: "the westerlies reversing in spring: the final warming, or a late sudden warming (hard to tell apart)" };
  if (east && westFirst) return { state: "ssw", words: "a major sudden stratospheric warming: the westerlies round 60°N reverse in midwinter" };
  if (east) return { state: "ssw", words: "easterlies round 60°N in midwinter: the vortex has broken down" };
  return { state: "westerly", words: "a westerly vortex" };
}
