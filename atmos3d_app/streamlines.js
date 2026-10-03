// Flow lines (streamlines) of a level's wind (user request, 2026-09-28:
// "wind as particles, barbs or flow lines"). Evenly spaced: seeds on a
// regular grid, each traced both ways along the wind, stopping where it
// would crowd a line already drawn (a coarse occupancy grid), leaves the
// grid or the level (below ground), or calms. Lines too short to read are
// dropped. Always from ONE real model step (like barbs), never a blend.
//
// Pure, no imports: node --test loads it. Coordinates are fractional grid
// indices (fi along lon, fj along rows from grid.lat0).

const M_PER_DEG = 111_320;

function bil(a, n, fi, fj) {
  const i = Math.floor(fi), j = Math.floor(fj), x = fi - i, y = fj - j, k = j * n + i;
  return (a[k] * (1 - x) + a[k + 1] * x) * (1 - y) + (a[k + n] * (1 - x) + a[k + n + 1] * x) * y;
}

// u, v: m/s on the grid; mask: 0/1 above ground (or null).
// spacing: seed / separation distance in grid cells; step: integration step
// in cells; maxSteps per direction; minPoints to keep a line.
// Returns [[[fi, fj], ...], ...].
export function streamlines(u, v, grid, { spacing = 6, step = 0.5, maxSteps = 150, minPoints = 10, mask = null, minSpeed = 0.5 } = {}) {
  const { nlat, nlon, lat0, dlat, dlon } = grid;
  const cell = Math.max(1, spacing / 2);                       // occupancy resolution (cells)
  const ow = Math.ceil(nlon / cell), oh = Math.ceil(nlat / cell);
  const occ = new Int32Array(ow * oh).fill(-1);                 // which line owns each occupancy cell
  const oi = (fi, fj) => Math.floor(fj / cell) * ow + Math.floor(fi / cell);
  const inside = (fi, fj) => fi >= 0 && fj >= 0 && fi <= nlon - 1.001 && fj <= nlat - 1.001;
  // Unit direction in grid-index space (east/north speeds turned into cells).
  const dir = (fi, fj) => {
    if (mask && bil(mask, nlon, fi, fj) < 0.5) return null;
    const uu = bil(u, nlon, fi, fj), vv = bil(v, nlon, fi, fj);
    if (!(Math.hypot(uu, vv) >= minSpeed)) return null;
    const lat = lat0 + fj * dlat;
    const di = uu / (M_PER_DEG * Math.cos((lat * Math.PI) / 180) * dlon), dj = vv / (M_PER_DEG * dlat);
    const m = Math.hypot(di, dj);
    return m > 0 ? [di / m, dj / m] : null;
  };
  const lines = [];
  const trace = (fi, fj, sign, id) => {
    const pts = [];
    for (let s = 0; s < maxSteps; s++) {
      const d1 = dir(fi, fj);
      if (!d1) break;
      const mi = fi + sign * d1[0] * step * 0.5, mj = fj + sign * d1[1] * step * 0.5;   // RK2 midpoint
      if (!inside(mi, mj)) break;
      const d2 = dir(mi, mj);
      if (!d2) break;
      const ni = fi + sign * d2[0] * step, nj = fj + sign * d2[1] * step;
      if (!inside(ni, nj)) break;
      const o = occ[oi(ni, nj)];
      if (o !== -1 && o !== id) break;                          // another line is already here
      fi = ni; fj = nj;
      pts.push([fi, fj]);
    }
    return pts;
  };
  for (let sj = spacing / 2; sj < nlat - 1; sj += spacing) {
    for (let si = spacing / 2; si < nlon - 1; si += spacing) {
      if (occ[oi(si, sj)] !== -1 || !dir(si, sj)) continue;
      const id = lines.length;
      const back = trace(si, sj, -1, id).reverse(), fwd = trace(si, sj, 1, id);
      const pts = [...back, [si, sj], ...fwd];
      if (pts.length < minPoints) continue;
      for (const [fi, fj] of pts) occ[oi(fi, fj)] = id;
      lines.push(pts);
    }
  }
  return lines;
}
