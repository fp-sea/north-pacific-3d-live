// 3-D flow lines for the 3-D tab's region (user request, 2026-09-29: "how
// displayed -- particles, stream lines, colour layer..."): lines that follow
// the wind through the atmosphere from seed points in the region, at ONE real
// model step (like the 2-D flow lines and barbs: a snapshot, never a blend).
// Each point carries the region's quantity (windAt's q) and its height, to
// colour by. With `vertical` > 0 the lines also climb and sink with the
// model's vertical motion (1 = true speed, 5 = x5), as the particles do.
//
// Pure, no imports but the wind sampler: node --test loads it.
import { windAt } from "./particles3d_math.js?v=20261003090005";

const M_PER_DEG = 111_320;

// Deterministic pseudo-random numbers in [0, 1) (mulberry32), so the same
// region gives the same lines each time it is rebuilt.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// field: windAt's (one step: t = 0). grid: {nlat, nlon, lat0, dlat, dlon}.
// seeds: [[fi, fj, zM], ...]. Options: dt (s per step), steps, vertical,
// inside(fi, fj, zM) -> bool (the region; the heights are checked here too).
// Returns [[[fi, fj, zM, q], ...], ...]: lines of at least 3 points.
export function traceFlow(field, grid, seeds, { dt = 1800, steps = 24, vertical = 0, inside = null, loKm = 0, hiKm = 12.5 } = {}) {
  const { nlat, nlon, lat0, dlat, dlon } = grid;
  const ok = (fi, fj, z) => fi >= 0 && fj >= 0 && fi <= nlon - 1.001 && fj <= nlat - 1.001
    && z >= loKm * 1000 - 1 && z <= hiKm * 1000 + 1 && (!inside || inside(fi, fj, z));
  // Grid cells (and metres) moved in `h` seconds by wind w at row fj.
  const move = (fi, fj, z, w, h) => {
    const lat = lat0 + fj * dlat;
    return [fi + (w.u * h) / (M_PER_DEG * Math.cos((lat * Math.PI) / 180)) / dlon, fj + (w.v * h) / M_PER_DEG / dlat, z + (w.w / 100) * h * vertical];
  };
  const out = [];
  for (const [si, sj, sz] of seeds) {
    if (!ok(si, sj, sz)) continue;
    let fi = si, fj = sj, z = sz;
    const w0 = windAt(field, nlon, fi, fj, z);
    if (!w0) continue;
    const pts = [[fi, fj, z, w0.q]];
    for (let s = 0; s < steps; s++) {
      const w1 = windAt(field, nlon, fi, fj, z);
      if (!w1) break;
      const [mi, mj, mz] = move(fi, fj, z, w1, dt / 2);             // RK2 midpoint
      if (!ok(mi, mj, mz)) break;
      const w2 = windAt(field, nlon, mi, mj, mz);
      if (!w2) break;
      const [ni, nj, nz] = move(fi, fj, z, w2, dt);
      if (!ok(ni, nj, nz)) break;
      fi = ni; fj = nj; z = nz;
      pts.push([fi, fj, z, w2.q]);
    }
    if (pts.length >= 3) out.push(pts);
  }
  return out;
}
