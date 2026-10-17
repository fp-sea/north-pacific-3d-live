// The wind at a height, for the 3-D particles (particles3d.js). Pure, no
// imports: node --test loads it.
//
// Hot path (thousands of particles every frame): the bilinear weights are
// computed once per call and reused for every field -- the first version
// recomputed them 24 times per particle and allocated closures, 20 ms a
// frame for 12,000 particles.

// Height of the ground (m) from surface pressure (Pa), by the standard
// atmosphere: z = 44330.8 (1 - (p / 101325)^0.190263). The files carry no
// terrain height; over the sea this is ~0, over land within a few tens of m
// on a normal day (the weather's pressure swings move it ~8 m per hPa).
export function groundHeight(psfcPa) {
  return 44330.8 * (1 - Math.pow(psfcPa / 101325, 0.190263));
}

// Wind at height zM above sea level at grid position
// (fi, fj), blended between steps A and B by t; null below the lowest level
// that is above ground there, above the top level, or with missing data.
// Returns {u, v} m/s and w, the vertical motion in cm/s (+ up; 0 where a
// level has none: the 10 m level, whose air the ground holds down, and
// builds before vertical motion was exported).
// q: any other quantity the levels carry (qA, qB: the 3-D tab's region
// quantity, to colour by), filled the same way; where one side has none, the
// other's value; NaN if neither.
// field: {t, psfcA, psfcB, levels: [{p, ghA, ghB, uA, uB, vA, vB, wA?, wB?, qA?, qB?}]} (any order).
// A level with p = 0 is always above ground (the 10 m wind, whose "gh" is
// the ground's height + 10 m: see groundHeight).
export function windAt(field, n, fi, fj, zM) {
  const i = Math.floor(fi), j = Math.floor(fj), x = fi - i, y = fj - j, k = j * n + i;
  const w00 = (1 - x) * (1 - y), w01 = x * (1 - y), w10 = (1 - x) * y, w11 = x * y;
  const t = field.t > 0 ? field.t : 0;
  const s = (a) => a[k] * w00 + a[k + 1] * w01 + a[k + n] * w10 + a[k + n + 1] * w11;
  const m = (a, b) => (t && b ? s(a) * (1 - t) + s(b) * t : s(a));
  const ps = m(field.psfcA, field.psfcB);
  let lo = null, hi = null, hLo = -Infinity, hHi = Infinity;
  const L = field.levels;
  for (let q = 0; q < L.length; q++) {
    const lv = L[q];
    if (!(ps >= lv.p * 100)) continue;                 // this level is below ground here
    const h = m(lv.ghA, lv.ghB);
    if (!(h === h)) continue;                          // NaN
    if (h <= zM && h > hLo) { lo = lv; hLo = h; }
    if (h >= zM && h < hHi) { hi = lv; hHi = h; }
  }
  if (!lo || !hi) return null;
  const w = hHi > hLo ? (zM - hLo) / (hHi - hLo) : 0;
  const u = m(lo.uA, lo.uB) * (1 - w) + m(hi.uA, hi.uB) * w;
  const v = m(lo.vA, lo.vB) * (1 - w) + m(hi.vA, hi.vB) * w;
  const up = (lv) => (lv.wA ? m(lv.wA, lv.wB) : 0);
  let wz = up(lo) * (1 - w) + up(hi) * w;
  if (!Number.isFinite(wz)) wz = 0;
  const qa = lo.qA ? m(lo.qA, lo.qB) : NaN, qb = hi.qA ? m(hi.qA, hi.qB) : NaN;
  const q = Number.isFinite(qa) && Number.isFinite(qb) ? qa * (1 - w) + qb * w : Number.isFinite(qa) ? qa : qb;
  return Number.isFinite(u + v) ? { u, v, w: wz, q } : null;
}
