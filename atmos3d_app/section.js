// Vertical sections ("CT scan" slices) through the atmosphere, from the real
// pressure levels of one model step.
//
// Path: a straight line on the Mercator map -- north-south (at a longitude)
// or east-west (at a latitude), turned about its middle -- clipped to the data
// box and sampled every `stepKm`. Thickness averages `nSlab` parallel lines
// spread across `thicknessKm` (like a slab in a CT scan); 0 = a thin slice.
//
// Column values: bilinear between the four surrounding grid points (the
// section runs between them), then VERTICALLY between the real levels,
// linearly in log-pressure against the levels' own heights -- the standard
// way to fill between pressure levels. Nothing is extrapolated: below the
// lowest level that is above ground, and above the top level, the section is
// empty (NaN). Within a layer ln(p) is taken as linear in height (as for an
// isothermal layer), so "linear in ln p" is the same as linear in height
// between the two levels' real heights. The page labels it "between levels:
// interpolated".
//
// Quantities: speed, across (wind through the section, + = from its left to
// right looking along it), along, temp (°C), theta (potential temperature, K:
// θ = T (1000/p)^0.2857), rh (%), w (vertical motion, cm/s, + rising; NaN
// where a build has none).
//
// Pure, no imports: node --test loads it. The projection is passed in:
// proj = {fwd(lat, lon) -> [xKm, yKm], inv(xKm, yKm) -> [lat, lon]}.

const KT = 1.943844, KAPPA = 0.2857;

// Points of the path in lat/lon. spec: {mode: "ns" | "ew", pos (lon or lat,
// deg), turn (deg, clockwise), stepKm}; box: {latMin, latMax, lonMin, lonMax}
// (lon 0..360, may exceed 360 east of the dateline).
export function sectionPath(spec, box, proj, offsetKm = 0) {
  const step = spec.stepKm ?? 40;
  const [xw] = proj.fwd((box.latMin + box.latMax) / 2, box.lonMin), [xe] = proj.fwd((box.latMin + box.latMax) / 2, box.lonMax);
  const [, ys] = proj.fwd(box.latMin, box.lonMin), [, yn] = proj.fwd(box.latMax, box.lonMin);
  let cx, cy, base;
  if (spec.mode === "ew") { [, cy] = proj.fwd(spec.pos, box.lonMin); cx = (xw + xe) / 2; base = 90; }
  else { [cx] = proj.fwd(0, spec.pos); cy = (ys + yn) / 2; base = 0; }
  const ang = ((base + (spec.turn ?? 0)) * Math.PI) / 180;
  const dx = Math.sin(ang), dy = Math.cos(ang);
  // Perpendicular offset for slab lines (to the right of the direction).
  cx += dy * offsetKm; cy -= dx * offsetKm;
  const inside = (x, y) => x >= xw - 1e-6 && x <= xe + 1e-6 && y >= ys - 1e-6 && y <= yn + 1e-6;
  const span = Math.hypot(xe - xw, yn - ys);
  const pts = [];
  for (let s = -span; s <= span; s += step) {
    const x = cx + dx * s, y = cy + dy * s;
    if (!inside(x, y)) continue;
    const [lat, lon] = proj.inv(x, y);
    pts.push({ lat, lon: lon < box.lonMin - 1e-6 ? lon + 360 : lon, s });
  }
  return { pts, dir: [dx, dy] };
}

// Bilinear sample of a grid field at lat/lon (lon in the grid's convention).
export function bilinear(a, grid, lat, lon) {
  const fi = (lon - grid.lon0) / grid.dlon, fj = (lat - grid.lat0) / grid.dlat;
  if (fi < 0 || fj < 0 || fi > grid.nlon - 1 || fj > grid.nlat - 1) return NaN;
  const i = Math.min(Math.floor(fi), grid.nlon - 2), j = Math.min(Math.floor(fj), grid.nlat - 2), x = fi - i, y = fj - j;
  const k = j * grid.nlon + i, n = grid.nlon;
  return a[k] * (1 - x) * (1 - y) + a[k + 1] * x * (1 - y) + a[k + n] * (1 - x) * y + a[k + n + 1] * x * y;
}

// One column's value at height zM (m), interpolated linearly in ln(p)
// between the two levels whose heights bracket it. levels: [{p, gh, v}]
// sorted by p descending (bottom first), only those above ground.
export function interpColumn(levels, zM) {
  for (let i = 0; i < levels.length - 1; i++) {
    const a = levels[i], b = levels[i + 1];
    if (zM >= a.gh && zM <= b.gh) {
      const f = (zM - a.gh) / (b.gh - a.gh);
      const lnp = Math.log(a.p) + f * (Math.log(b.p) - Math.log(a.p));
      const w = (lnp - Math.log(a.p)) / (Math.log(b.p) - Math.log(a.p));
      return { p: Math.exp(lnp), v: a.v + w * (b.v - a.v) };
    }
  }
  return null;
}

function quantityAt(q, f, k, p, dir) {
  const t = f.t, u = f.u, v = f.v;
  if (q === "dq") return f.dq;             // a precomputed per-level field (the GFS - ECMWF difference, main.js)
  if (q === "temp") return t - 273.15;
  if (q === "theta") return t * Math.pow(1000 / p, KAPPA);
  if (q === "rh") return f.r;
  if (q === "w") return f.w;
  if (["vort", "div", "ti", "stab", "ri", "thetae", "grad", "fgen"].includes(q)) return f[q];   // derived3d.js
  if (q === "speed") return Math.hypot(u, v) * KT;
  // dir: unit vector along the section on the map (east, north).
  if (q === "along") return (u * dir[0] + v * dir[1]) * KT;
  if (q === "across") return (u * dir[1] - v * dir[0]) * KT;     // + = blowing from the section's left to its right
  return NaN;
}

// The section grid: nx path points x nz heights (0..zTopM). data: {sfc:
// {psfc}, levels: {p: {gh, t, u, v, r}}}. Returns {values (nz rows of nx,
// row 0 at the bottom), nx, nz, zTopM, pts}. `quantity` as above.
export function buildSection(path, data, grid, quantity, { nz = 64, zTopM = 12000, slabPaths = null } = {}) {
  const paths = slabPaths && slabPaths.length ? slabPaths : [path];
  const nx = path.pts.length;
  const values = new Float32Array(nx * nz).fill(NaN);
  const ps = Object.keys(data.levels).map(Number).sort((a, b) => b - a);
  // Slab lines share the along-line distance grid, so points pair by distance s.
  const bySDist = paths.map((P) => new Map(P.pts.map((q) => [Math.round(q.s), q])));
  for (let ix = 0; ix < nx; ix++) {
    const acc = new Float64Array(nz), cnt = new Uint16Array(nz);
    for (const M of bySDist) {
      const pt = M.get(Math.round(path.pts[ix].s));
      if (!pt) continue;
      const psfc = bilinear(data.sfc.psfc, grid, pt.lat, pt.lon) / 100;
      const cols = {};
      for (const p of ps) {
        const L = data.levels[p];
        cols[p] = { gh: bilinear(L.gh, grid, pt.lat, pt.lon), t: bilinear(L.t, grid, pt.lat, pt.lon), u: bilinear(L.u, grid, pt.lat, pt.lon),
          v: bilinear(L.v, grid, pt.lat, pt.lon), r: bilinear(L.r, grid, pt.lat, pt.lon), w: L.w ? bilinear(L.w, grid, pt.lat, pt.lon) : NaN };
        for (const x of ["vort", "div", "ti", "stab", "ri", "thetae", "grad", "fgen", "dq"]) if (L[x]) cols[p][x] = bilinear(L[x], grid, pt.lat, pt.lon);
      }
      const above = ps.filter((p) => p <= psfc && Number.isFinite(cols[p].gh));
      if (above.length < 2) continue;
      // The column's levels once (not once per height: that made a 500 km slab
      // take 1.3 s), then walk up the heights with one pointer.
      const col = above.map((p) => ({ p, gh: cols[p].gh, v: quantityAt(quantity, cols[p], 0, p, path.dir) }));
      let li = 0;
      for (let iz = 0; iz < nz; iz++) {
        const z = ((iz + 0.5) / nz) * zTopM;
        if (z < col[0].gh) continue;
        while (li < col.length - 2 && z > col[li + 1].gh) li++;
        const a = col[li], b = col[li + 1];
        if (z > b.gh) break;
        const v = a.v + ((z - a.gh) / (b.gh - a.gh)) * (b.v - a.v);
        if (!Number.isFinite(v)) continue;
        acc[iz] += v; cnt[iz]++;
      }
    }
    for (let iz = 0; iz < nz; iz++) if (cnt[iz]) values[iz * nx + ix] = acc[iz] / cnt[iz];
  }
  return { values, nx, nz, zTopM, pts: path.pts };
}

// Parallel paths for a slab of the given thickness (km), n lines across it.
export function slabPaths(spec, box, proj, thicknessKm, n = 5) {
  if (!(thicknessKm > 0)) return null;
  const out = [];
  for (let i = 0; i < n; i++) out.push(sectionPath(spec, box, proj, (i / (n - 1) - 0.5) * thicknessKm));
  return out;
}

// Each pressure level's real height (m) at every point of the path, NaN where
// the level is below the ground there (surface pressure lower than the level):
// the level lines drawn on the slice, flat chart and 3-D alike (user request,
// 2026-09-28/29). data: as buildSection's. Returns {p: Float32Array(n)}.
export function levelHeights(path, data, grid) {
  const out = {};
  for (const p of Object.keys(data.levels).map(Number)) {
    const L = data.levels[p], h = new Float32Array(path.pts.length);
    path.pts.forEach((pt, i) => {
      const z = bilinear(L.gh, grid, pt.lat, pt.lon), ps = bilinear(data.sfc.psfc, grid, pt.lat, pt.lon);
      h[i] = Number.isFinite(z) && ps >= p * 100 ? z : NaN;
    });
    out[p] = h;
  }
  return out;
}

// A horizontal plane: `quantity` at height zM (m) at every grid point (user
// request, 2026-09-29: the region as a plane, vertical or horizontal).
// Filled between the two levels whose real heights bracket zM, linearly in
// height like the slice (so linearly in ln p); "pressure" (hPa) is filled in
// ln p. NaN below the lowest level above ground and above the top level.
// quantity: speed | temp | theta | rh | w | pressure. data: as buildSection's.
export function heightMap(data, grid, quantity, zM) {
  const n = grid.nlat * grid.nlon, out = new Float32Array(n).fill(NaN);
  const ps = Object.keys(data.levels).map(Number).sort((a, b) => b - a), L = ps.map((p) => data.levels[p]);
  for (let k = 0; k < n; k++) {
    const psfc = data.sfc.psfc[k] / 100;
    let lo = -1, hi = -1;
    for (let i = 0; i < ps.length; i++) {
      if (ps[i] > psfc || !Number.isFinite(L[i].gh[k])) continue;                  // below ground here
      if (L[i].gh[k] <= zM && (lo < 0 || L[i].gh[k] > L[lo].gh[k])) lo = i;
      if (L[i].gh[k] >= zM && (hi < 0 || L[i].gh[k] < L[hi].gh[k])) hi = i;
    }
    if (lo < 0 || hi < 0) continue;
    const za = L[lo].gh[k], zb = L[hi].gh[k], w = zb > za ? (zM - za) / (zb - za) : 0;
    if (quantity === "pressure") { out[k] = Math.exp(Math.log(ps[lo]) + w * (Math.log(ps[hi]) - Math.log(ps[lo]))); continue; }
    const at = (i) => {
      const f = L[i], t = f.t[k];
      if (quantity === "temp") return t - 273.15;
      if (quantity === "theta") return t * Math.pow(1000 / ps[i], KAPPA);
      if (quantity === "rh") return f.r[k];
      if (quantity === "w") return f.w ? f.w[k] : NaN;
      if (["vort", "div", "ti", "stab", "ri", "thetae", "grad", "fgen", "dq"].includes(quantity)) return f[quantity] ? f[quantity][k] : NaN;
      return Math.hypot(f.u[k], f.v[k]) * KT;                                       // speed, kt
    };
    out[k] = at(lo) + w * (at(hi) - at(lo));
  }
  return out;
}

// One level's quantity at every grid point (the same formulas as a slice's),
// for per-level arithmetic such as the GFS - ECMWF difference. f: a level
// {gh, t, u, v, r, w?, derived...}; p: its pressure (mb).
export function levelField(f, p, quantity) {
  const n = f.gh.length, out = new Float32Array(n), dir = [0, 1];
  for (let k = 0; k < n; k++) {
    const col = { t: f.t[k], u: f.u[k], v: f.v[k], r: f.r[k], w: f.w ? f.w[k] : NaN };
    for (const x of ["vort", "div", "ti", "stab", "ri", "thetae", "grad", "fgen"]) if (f[x]) col[x] = f[x][k];
    out[k] = quantityAt(quantity, col, 0, p, dir);
  }
  return out;
}
