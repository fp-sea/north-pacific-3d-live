// Two things to drop on the map (user ideas, 2026-10-09):
//
//   a MARBLE that rolls on the focus level's surface -- the 500 mb heights, or
//   at the surface the sea-level pressure -- downhill, slowed by a little
//   friction. It runs down into troughs, swings along them and settles in
//   the lows, so the shape of the height field (hard to see in contour lines
//   alone) becomes something you watch. It feels the shape only: real air
//   doesn't roll downhill (it runs along the contours, turned by the Earth's
//   spin); the BALLOON shows what the air does.
//
//   a BALLOON that drifts with the focus level's wind, leaving a trail: one
//   clear track that stands out from the particles, barbs and flow lines.
//
// The marble rolls on the waves (troughs and ridges; the UI says so, since "waves" reads as ocean waves), not the whole slope: at 500 mb the heights fall steadily toward the
// pole, and on that slope a marble just runs north. With each latitude's average taken out (waves()),
// what's left is the troughs (valleys) and ridges (hills) it should feel.
//
// Positions in degrees; motion worked out on the local east/north plane in km.
// grid: {nlat, nlon, lat0, dlat, lon0, dlon} (lat0 the first row, dlat may be
// negative; lon east 0-360). Pure, no imports: node --test loads it.

const KM_PER_DEG = 111.195, D2R = Math.PI / 180;

// The field's value at a point (bilinear), or NaN outside the grid.
export function gridSample(f, grid, lat, lon) {
  const { nlat, nlon, lat0, dlat, lon0, dlon } = grid;
  const lonE = lon < lon0 ? lon + 360 : lon;
  const fi = (lonE - lon0) / dlon, fj = (lat - lat0) / dlat;
  if (!(fi >= 0 && fj >= 0 && fi <= nlon - 1 && fj <= nlat - 1)) return NaN;
  const i = Math.min(nlon - 2, Math.floor(fi)), j = Math.min(nlat - 2, Math.floor(fj)), a = fi - i, b = fj - j, k = j * nlon + i;
  return f[k] * (1 - a) * (1 - b) + f[k + 1] * a * (1 - b) + f[k + nlon] * (1 - a) * b + f[k + nlon + 1] * a * b;
}

// Like gridSample, but using whichever of the four corners have values (weights renormalised): a field
// that's missing over land (the wave model) can still be read at the coast. NaN only if all four are.
// For the swell trace: a spot just off Oahu's north shore has a land point among its corners
// (2026-10-09: the first try called it land).
export function gridSampleFinite(f, grid, lat, lon) {
  const { nlat, nlon, lat0, dlat, lon0, dlon } = grid;
  const lonE = lon < lon0 ? lon + 360 : lon;
  const fi = (lonE - lon0) / dlon, fj = (lat - lat0) / dlat;
  if (!(fi >= 0 && fj >= 0 && fi <= nlon - 1 && fj <= nlat - 1)) return NaN;
  const i = Math.min(nlon - 2, Math.floor(fi)), j = Math.min(nlat - 2, Math.floor(fj)), a = fi - i, b = fj - j, k = j * nlon + i;
  let sum = 0, wsum = 0;
  for (const [kk, w] of [[k, (1 - a) * (1 - b)], [k + 1, a * (1 - b)], [k + nlon, (1 - a) * b], [k + nlon + 1, a * b]]) {
    const v = f[kk];
    if (Number.isFinite(v) && w > 0) { sum += v * w; wsum += w; }
  }
  return wsum > 0 ? sum / wsum : NaN;
}

// The field with each row's (latitude's) average taken out: its waves. NaNs are skipped.
export function waves(f, grid) {
  const { nlat, nlon } = grid, out = new Float32Array(f.length);
  for (let j = 0; j < nlat; j++) {
    let s = 0, n = 0;
    for (let i = 0; i < nlon; i++) { const v = f[j * nlon + i]; if (Number.isFinite(v)) { s += v; n++; } }
    const m = n ? s / n : 0;
    for (let i = 0; i < nlon; i++) out[j * nlon + i] = f[j * nlon + i] - m;
  }
  return out;
}

// The field's slope (per km, east and north) by centred differences a quarter of a grid step apart.
export function gradKm(f, grid, lat, lon) {
  const s = Math.abs(grid.dlat) / 4, c = Math.max(0.05, Math.cos(lat * D2R));
  const fe = gridSample(f, grid, lat, lon + s / c), fw = gridSample(f, grid, lat, lon - s / c);
  const fn = gridSample(f, grid, lat + s, lon), fs = gridSample(f, grid, lat - s, lon);
  const km = 2 * s * KM_PER_DEG;
  return [(fe - fw) / km, (fn - fs) / km];
}

function move(p, dxKm, dyKm) {
  p.lat += dyKm / KM_PER_DEG;
  p.lon += dxKm / (KM_PER_DEG * Math.max(0.05, Math.cos(p.lat * D2R)));
  p.lon = ((p.lon % 360) + 360) % 360;
}

// One step of the marble (m: {lat, lon, vx, vy} with v in km/s of screen time). field: the surface
// (e.g. heights in m); unit: one contour interval in the field's units, so 60 m of height and 4 hPa
// of pressure roll alike. G (km^2/s^2 per contour) sets how hard it's pulled; gamma (1/s) the friction.
// Returns false once it has rolled off the grid.
export function stepMarble(m, field, grid, unit, dt, { G = 45000, gamma = 0.6, vmax = 900 } = {}) {
  const [gx, gy] = gradKm(field, grid, m.lat, m.lon);
  if (!Number.isFinite(gx) || !Number.isFinite(gy)) return false;
  m.vx += (-G * (gx / unit) - gamma * m.vx) * dt;
  m.vy += (-G * (gy / unit) - gamma * m.vy) * dt;
  const sp = Math.hypot(m.vx, m.vy);
  if (sp > vmax) { m.vx *= vmax / sp; m.vy *= vmax / sp; }
  move(m, m.vx * dt, m.vy * dt);
  return Number.isFinite(gridSample(field, grid, m.lat, m.lon));
}

// One step of the balloon (b: {lat, lon, hours, trail: [[lat, lon], ...]}): carried by the wind u, v
// (m/s, east and north) for `hoursPerSecond` hours of model time per second of screen time. The trail
// keeps a point every `trailEveryH` hours (at most maxTrail). Returns false once it has left the grid.
export function stepBalloon(b, u, v, grid, dt, { hoursPerSecond = 2, trailEveryH = 0.5, maxTrail = 600 } = {}) {
  const uu = gridSample(u, grid, b.lat, b.lon), vv = gridSample(v, grid, b.lat, b.lon);
  if (!Number.isFinite(uu) || !Number.isFinite(vv)) return false;
  const h = dt * hoursPerSecond, s = h * 3.6;          // m/s for h hours -> km
  move(b, uu * s, vv * s);
  b.hours = (b.hours ?? 0) + h;
  b.speedKt = Math.hypot(uu, vv) * 1.943844;
  b.fromDeg = (Math.atan2(-uu, -vv) / D2R + 360) % 360;
  b.trail ??= [];
  if (!b.trail.length || b.hours - (b._lastTrail ?? 0) >= trailEveryH - 1e-9) { b.trail.push([b.lat, b.lon]); b._lastTrail = b.hours; }
  if (b.trail.length > maxTrail) b.trail.shift();
  return Number.isFinite(gridSample(u, grid, b.lat, b.lon));
}

// The balloon in 3-D (user idea 2026-10-09: "stay on focus level or 3-D movement?"): b also has z, its
// height above sea level in m, and rises and sinks with the model's vertical motion. sample(lat, lon, z)
// gives the air there, {u, v (m/s), w (cm/s, + up), zMin, zMax}: the wind with the height already kept
// between the ground and the top level, or null outside the data. dtH: hours of model time. Its height
// stays inside [zMin, zMax] (the air can't go through the ground). Trail points carry the height.
// Returns false once it has left the data.
export function stepBalloon3d(b, sample, dtH, { trailEveryH = 0.5, maxTrail = 600 } = {}) {
  const s = sample(b.lat, b.lon, b.z);
  if (!s) return false;
  const km = dtH * 3.6;                                // m/s for dtH hours -> km
  move(b, s.u * km, s.v * km);
  b.z = Math.min(s.zMax, Math.max(s.zMin, b.z + (s.w / 100) * dtH * 3600));
  b.hours = (b.hours ?? 0) + dtH;
  b.speedKt = Math.hypot(s.u, s.v) * 1.943844;
  b.fromDeg = (Math.atan2(-s.u, -s.v) / D2R + 360) % 360;
  b.wCms = s.w;
  b.trail ??= [];
  if (!b.trail.length || b.hours - (b._lastTrail ?? 0) >= trailEveryH - 1e-9) { b.trail.push([b.lat, b.lon, b.z]); b._lastTrail = b.hours; }
  if (b.trail.length > maxTrail) b.trail.shift();
  return sample(b.lat, b.lon, b.z) != null;
}

// "Where did this air come from?" (user request 2026-10-09): the path of the air arriving at p
// ({lat, lon, z?}; z, height in m, for 3-D) at time t0 (hours), traced backward `hours` hours.
// sample(t, lat, lon, z) gives the air at time t, {u, v (m/s), w (cm/s), zMin, zMax} or null (z and w
// ignored when p has no z). Each step is a predictor-corrector of dtH hours (Heun's method, as NOAA's
// HYSPLIT trajectories use). Returns {path: [[lat, lon, z, hoursAgo], ...] (arrival first), left:
// true if it ran off the data before `hours`}.
export function traceBack(p, sample, t0, hours, dtH = 1) {
  const has3d = p.z != null, path = [[p.lat, p.lon, has3d ? p.z : null, 0]];
  const pos = { lat: p.lat, lon: p.lon, z: has3d ? p.z : 0 };
  const clampZ = (z, s) => (has3d ? Math.min(s.zMax, Math.max(s.zMin, z)) : 0);
  for (let ago = 0; ago < hours - 1e-9;) {
    const h = Math.min(dtH, hours - ago), t = t0 - ago;
    const s1 = sample(t, pos.lat, pos.lon, has3d ? pos.z : undefined);
    if (!s1) return { path, left: true };
    // predictor: back along this wind; corrector: the average of the wind here and there
    const q = { lat: pos.lat, lon: pos.lon };
    move(q, -s1.u * h * 3.6, -s1.v * h * 3.6);
    const zq = clampZ(pos.z - (has3d ? (s1.w / 100) * h * 3600 : 0), s1);
    const s2 = sample(t - h, q.lat, q.lon, has3d ? zq : undefined);
    if (!s2) return { path, left: true };
    move(pos, -((s1.u + s2.u) / 2) * h * 3.6, -((s1.v + s2.v) / 2) * h * 3.6);
    if (has3d) pos.z = clampZ(pos.z - (((s1.w + s2.w) / 2) / 100) * h * 3600, s2);
    ago += h;
    path.push([pos.lat, pos.lon, has3d ? pos.z : null, ago]);
  }
  return { path, left: false };
}

// A ring of n points rKm from (lat, lon), for the ring of balloons: where the ring stretches, the air
// is being deformed; where its area shrinks, the air converges (and must rise or sink).
export function ringPoints(lat, lon, rKm, n = 24) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = (2 * Math.PI * k) / n, q = { lat, lon };
    move(q, rKm * Math.sin(a), rKm * Math.cos(a));
    out.push(q);
  }
  return out;
}

// The area (km^2) inside a ring of points [{lat, lon}] in order, on a local equal-area plane about
// their mean latitude (fine for rings up to a couple of thousand km).
export function ringAreaKm2(pts) {
  if (pts.length < 3) return 0;
  const lat0 = pts.reduce((s, p) => s + p.lat, 0) / pts.length, c = Math.cos(lat0 * D2R), lon0 = pts[0].lon;
  const xy = pts.map((p) => [((((p.lon - lon0 + 540) % 360) - 180) * c) * KM_PER_DEG, p.lat * KM_PER_DEG]);
  let a = 0;
  for (let i = 0; i < xy.length; i++) { const [x1, y1] = xy[i], [x2, y2] = xy[(i + 1) % xy.length]; a += x1 * y2 - x2 * y1; }
  return Math.abs(a) / 2;
}

// Keep a ring resolved as the flow stretches it (contour advection's usual fix): wherever two
// neighbours are more than maxKm apart, a new balloon goes in halfway between them (z and hours
// averaged), up to maxN in all. Without it the 24 balloons of a ring stretched into a filament were
// joined by straight chords that cut across it, and its area read 233 % one day and 46 % the next.
export function refineRing(members, maxKm, maxN = 600) {
  const out = [];
  for (let i = 0; i < members.length; i++) {
    const a = members[i], b = members[(i + 1) % members.length];
    out.push(a);
    const dLon = ((((b.lon - a.lon) % 360) + 540) % 360) - 180, mlat = (a.lat + b.lat) / 2;
    const km = Math.hypot(dLon * KM_PER_DEG * Math.cos(mlat * D2R), (b.lat - a.lat) * KM_PER_DEG);
    if (km > maxKm && members.length + (out.length - i - 1) < maxN) {
      const m = { lat: mlat, lon: (((a.lon + dLon / 2) % 360) + 360) % 360, hours: a.hours, trail: [] };
      if (a.z != null && b.z != null) m.z = (a.z + b.z) / 2;
      out.push(m);
    }
  }
  return out;
}

// Turbulence for a smoke puff (user pick 2026-10-09): a random step on top of the wind, as dispersion
// models do (HYSPLIT's particles). Sideways, a random walk with eddy diffusivity kh (m^2/s): over dt
// seconds a Gaussian step of sigma = sqrt(2 kh dt) each way, so a plume widens with the square root of
// time. Up and down, inside the boundary layer (p.z below ground + top) a fast walk (kzMixed) that
// stirs the puff through the layer and reflects off the ground and the layer's top, so it stays
// trapped under it (Kilauea's vog under the trade inversion); above, a slow one (kzFree). top: the
// boundary layer's depth, m (NaN or undefined: no mixed layer known, the slow walk everywhere).
// dtH: hours. Changes p in place. rand: () -> [0, 1), Math.random unless a test passes its own.
export function disperse(p, dtH, { kh = 1e4, kzMixed = 50, kzFree = 0.5, ground = 0, top, rand = Math.random } = {}) {
  if (!(dtH > 0)) return p;
  const dt = dtH * 3600;
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const s = Math.sqrt(2 * kh * dt) / 1000;                   // km
  move(p, gauss() * s, gauss() * s);
  if (p.z == null) return p;
  const lo = ground + 10, hi = ground + top;
  if (top > 10 && p.z <= hi) {
    let z = p.z + gauss() * Math.sqrt(2 * kzMixed * dt);
    for (let k = 0; k < 8 && (z < lo || z > hi); k++) z = z < lo ? 2 * lo - z : 2 * hi - z;   // reflect at both walls
    p.z = Math.min(hi, Math.max(lo, z));
  } else {
    p.z = Math.max(lo, p.z + gauss() * Math.sqrt(2 * kzFree * dt));
  }
  return p;
}

// A point dxKm east and dyKm north of (lat, lon): for drawing arrows (forces.js).
export function offsetKm(lat, lon, dxKm, dyKm) {
  const q = { lat, lon };
  move(q, dxKm, dyKm);
  return q;
}

// A weather balloon (radiosonde; user request 2026-10-09): it rises at `rate` m/s (NWS sondes climb about
// 5 m/s) and drifts with the wind at its height. sample(t, lat, lon, z) -> {u, v, zMax} | null, t in hours;
// it's released at p = {lat, lon, z} at time t0 (hours) and flies until it reaches zMax (the top of the
// data) or maxMinutes. Returns [[lat, lon, z, minutes], ...] every dtS seconds, the release first.
export function ascend(p, sample, t0, { rate = 5, dtS = 30, maxMinutes = 150 } = {}) {
  const q = { lat: p.lat, lon: p.lon }, path = [[p.lat, p.lon, p.z, 0]];
  let z = p.z;
  for (let s = dtS; s <= maxMinutes * 60 + 1e-9; s += dtS) {
    const w = sample(t0 + (s - dtS) / 3600, q.lat, q.lon, z);
    if (!w) break;
    move(q, (w.u * dtS) / 1000, (w.v * dtS) / 1000);
    z = Math.min(w.zMax, z + rate * dtS);
    path.push([q.lat, q.lon, z, s / 60]);
    if (z >= w.zMax - 1e-6) break;
  }
  return path;
}

// "Where's this swell from?" (user pick 2026-10-09): the swell arriving at p ({lat, lon}) at time t0
// (hours), traced backward. In deep water swell energy travels on a great circle at the group speed,
// g T / 4 pi (12 s swell: 9.4 m/s, ~800 km a day), each period at its own speed; so from the arriving peak
// period and direction the path back is fixed: the great circle toward where the waves come from, the
// distance growing with the hours. The wave field then gives the seas along it (each point at its own
// earlier time), and the biggest are most likely the storm that made the swell. A first version steered
// by the field's direction wherever the period matched; off Oahu's north shore an 11 s north-west swell
// was captured by trade swell, then drifted round in small turns to the south (2026-10-09), so the
// great circle alone it is, as swell forecasters trace it.
// sample(t, lat, lon) -> {hs (m), tp (s), dir (deg the waves come from)}, null over land or ice,
// undefined outside the data. Returns {path: [[lat, lon, hoursAgo, hs], ...] (arrival first), T, peak:
// the point with the biggest seas, end: "data" | "land" | "time"}.
export function traceSwell(p, sample, t0, hours, { dtH = 1 } = {}) {
  const s0 = sample(t0, p.lat, p.lon);
  if (!s0 || !(s0.tp > 0)) return { path: [], T: null, peak: null, end: "land" };
  const T = s0.tp, cg = (9.80665 * T) / (4 * Math.PI), path = [[p.lat, p.lon, 0, s0.hs]];
  const lat1 = p.lat * D2R, lon1 = p.lon * D2R, brg = s0.dir * D2R;
  let peak = { lat: p.lat, lon: p.lon, ago: 0, hs: s0.hs }, end = "time";
  for (let ago = dtH; ago <= hours + 1e-9; ago += dtH) {
    const d = (cg * ago * 3600) / 6371000;                  // angular distance back along the great circle
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brg));
    const lon2 = lon1 + Math.atan2(Math.sin(brg) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    const la = lat2 / D2R, lo = ((lon2 / D2R) % 360 + 360) % 360, s = sample(t0 - ago, la, lo);
    if (!s) { end = s === undefined ? "data" : "land"; break; }
    path.push([la, lo, ago, s.hs]);
    if (s.hs > peak.hs) peak = { lat: la, lon: lo, ago, hs: s.hs };
  }
  return { path, T, peak, end };
}
