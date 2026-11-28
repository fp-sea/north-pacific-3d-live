// Finding today's teachable weather in the live forecast (user pick 2026-10-09, "Today's lessons"): the
// week's deepest low (and whether it's a "bomb"), the strongest jet core, the biggest moisture plume,
// the windiest day in the Alenuihāhā Channel and the biggest waves. main.js turns each into a short
// guided lesson. Pure, no imports: node --test loads it.
//
// grid: {nlat, nlon, lat0, dlat, lon0, dlon}; fields are row-major Float32Arrays on it.

const D2R = Math.PI / 180;
const latOf = (g, j) => g.lat0 + j * g.dlat, lonOf = (g, i) => g.lon0 + i * g.dlon;
const kmBetween = (la1, lo1, la2, lo2) => Math.hypot((((lo2 - lo1 + 540) % 360) - 180) * 111.195 * Math.cos(((la1 + la2) / 2) * D2R), (la2 - la1) * 111.195);

// The lowest value of f inside a lat band (skipping `edge` cells at the borders, where a low may just be
// leaving the map) and optionally within rKm of a point: {k, lat, lon, v} or null.
function minIn(f, g, { latMin = -90, latMax = 90, edge = 3, near = null } = {}) {
  let best = null;
  for (let j = edge; j < g.nlat - edge; j++) {
    const lat = latOf(g, j);
    if (lat < latMin || lat > latMax) continue;
    for (let i = edge; i < g.nlon - edge; i++) {
      const v = f[j * g.nlon + i];
      if (!Number.isFinite(v) || (best && v >= best.v)) continue;
      if (near && kmBetween(near.lat, near.lon, lat, lonOf(g, i)) > near.rKm) continue;
      best = { k: j * g.nlon + i, lat, lon: lonOf(g, i), v };
    }
  }
  return best;
}
function maxIn(f, g, opts) {
  const neg = Float32Array.from(f, (v) => -v), m = minIn(neg, g, opts);
  return m && { ...m, v: -m.v };
}

// steps: [{h, mslp (Pa)}] in time order. The deepest low 30-62°N (the mid-latitude storms; tropical
// cyclones are tropicalCyclone's) over the steps, with how much it
// deepened in the 24 h before (the lowest pressure within 1,200 km of it a day earlier), and whether that
// makes it a "bomb": a fall of at least 24 hPa in 24 h at 60° latitude, scaled by sin(lat)/sin(60°)
// (Sanders and Gyakum 1980). Returns {h, lat, lon, hPa, fall24, bombAt, bomb} or null.
export function weekDeepestLow(steps, g, { latMin = 30, latMax = 62 } = {}) {
  let best = null;
  for (const s of steps) {
    const m = minIn(s.mslp, g, { latMin, latMax });
    if (m && (!best || m.v < best.v)) best = { ...m, h: s.h };
  }
  if (!best) return null;
  const before = steps.reduce((b, s) => (Math.abs(s.h - (best.h - 24)) < Math.abs(b.h - (best.h - 24)) ? s : b), steps[0]);
  let fall24 = null;
  if (Math.abs(before.h - (best.h - 24)) < 3.01) {
    const m = minIn(before.mslp, g, { latMin: 10, latMax: 70, edge: 0, near: { lat: best.lat, lon: best.lon, rKm: 1200 } });
    if (m) fall24 = (m.v - best.v) / 100;
  }
  const bombAt = (24 * Math.sin(best.lat * D2R)) / Math.sin(60 * D2R);
  return { h: best.h, lat: best.lat, lon: best.lon, hPa: best.v / 100, fall24, bombAt, bomb: fall24 != null && fall24 >= bombAt };
}

// The deepest tropical cyclone: the lowest pressure 5-30°N below 1000 hPa over the steps (a typhoon or
// hurricane; first found 2026-10-09 when a 923 mb typhoon passed for "the week's deepest low"):
// {h, lat, lon, hPa} or null.
export function tropicalCyclone(steps, g) {
  let best = null;
  for (const s of steps) {
    const m = minIn(s.mslp, g, { latMin: 5, latMax: 30 });
    if (m && m.v < 100000 && (!best || m.v < best.v)) best = { ...m, h: s.h };
  }
  return best && { h: best.h, lat: best.lat, lon: best.lon, hPa: best.v / 100 };
}

// Every tropical low below `below` Pa between 5 and 35°N (each the lowest point within 5 cells around it):
// [{lat, lon, hPa}], deepest first. For keeping tropical cyclones' own moisture out of the plume search
// (there may be more than one: 2026-10-09's build had two typhoons).
export function tropicalLows(mslp, g, below = 100000) {
  const out = [], R = 5;
  for (let j = R; j < g.nlat - R; j++) {
    const lat = latOf(g, j);
    if (lat < 5 || lat > 35) continue;
    for (let i = R; i < g.nlon - R; i++) {
      const v = mslp[j * g.nlon + i];
      if (!(v < below)) continue;
      let lowest = true;
      for (let dj = -R; dj <= R && lowest; dj++) for (let di = -R; di <= R; di++) if (mslp[(j + dj) * g.nlon + i + di] < v) { lowest = false; break; }
      if (lowest) out.push({ lat, lon: lonOf(g, i), hPa: v / 100 });
    }
  }
  return out.sort((a, b) => a.hPa - b.hPa);
}

// The strongest wind (u, v in m/s) 15-62°N: {lat, lon, kt, u, v}.
export function jetCore(u, v, g) {
  const sp = Float32Array.from(u, (x, k) => Math.hypot(x, v[k]));
  const m = maxIn(sp, g, { latMin: 15, latMax: 62 });
  return m && { lat: m.lat, lon: m.lon, kt: m.v * 1.943844, u: u[m.k], v: v[m.k] };
}

// The most precipitable water north of 35°N (a moisture plume reaching the mid-latitudes; 30 mm or more
// there usually means an atmospheric river): {lat, lon, mm, river}. 35°N, not 30: on 2026-10-09's build a
// typhoon's moisture still reached 30°N 1,000 km north of its centre and passed for a river.
// avoid: [{lat, lon, rKm}] areas to leave out (a tropical cyclone's own moisture isn't a plume).
export function moisturePlume(pwat, g, { avoid = [] } = {}) {
  const f = avoid.length ? Float32Array.from(pwat, (v, k) => {
    const lat = latOf(g, Math.floor(k / g.nlon)), lon = lonOf(g, k % g.nlon);
    return avoid.some((a) => kmBetween(a.lat, a.lon, lat, lon) < a.rKm) ? NaN : v;
  }) : pwat;
  const m = maxIn(f, g, { latMin: 35, latMax: 62 });
  return m && { lat: m.lat, lon: m.lon, mm: m.v, river: m.v >= 30 };
}

// steps: [{h, u10, v10}]. The strongest 10 m wind in a box (default the Alenuihāhā Channel and its exits,
// 19.5-21°N, 155.5-157.5°W) over the steps: {h, lat, lon, kt}.
export function windiestInBox(steps, g, box = { latMin: 19.5, latMax: 21, lonMin: 202.5, lonMax: 204.5 }) {
  let best = null;
  for (const s of steps) for (let j = 0; j < g.nlat; j++) {
    const lat = latOf(g, j);
    if (lat < box.latMin || lat > box.latMax) continue;
    for (let i = 0; i < g.nlon; i++) {
      const lon = lonOf(g, i);
      if (lon < box.lonMin || lon > box.lonMax) continue;
      const k = j * g.nlon + i, kt = Math.hypot(s.u10[k], s.v10[k]) * 1.943844;
      if (Number.isFinite(kt) && (!best || kt > best.kt)) best = { h: s.h, lat, lon, kt };
    }
  }
  return best;
}

// steps: [{h, hs (m)}]. The biggest significant wave height over the steps: {h, lat, lon, m}.
export function biggestWaves(steps, g) {
  let best = null;
  for (const s of steps) {
    const m = maxIn(s.hs, g, { latMin: -20, latMax: 62, edge: 2 });
    if (m && (!best || m.v > best.m)) best = { h: s.h, lat: m.lat, lon: m.lon, m: m.v };
  }
  return best;
}
