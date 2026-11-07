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
  // One RK2 step of length h from (fi, fj): the new point and its direction of travel, or null.
  const rk2 = (fi, fj, sign, h) => {
    const d1 = dir(fi, fj);
    if (!d1) return null;
    const mi = fi + sign * d1[0] * h * 0.5, mj = fj + sign * d1[1] * h * 0.5;           // RK2 midpoint
    if (!inside(mi, mj)) return null;
    const d2 = dir(mi, mj);
    if (!d2) return null;
    const ni = fi + sign * d2[0] * h, nj = fj + sign * d2[1] * h;
    if (!inside(ni, nj)) return null;
    // the direction of travel on the map (east and north in km, a degree of longitude shortened by cos(lat)), so the turn
    // checks below measure the angles a reader sees, not grid-index angles (at 45° N those differ by up to ~15°)
    const c = Math.cos(((lat0 + mj * dlat) * Math.PI) / 180), ex = sign * d2[0] * dlon * c, ny = sign * d2[1] * dlat, m = Math.hypot(ex, ny) || 1;
    return [ni, nj, ex / m, ny / m];
  };
  // Adaptive steps (user report 2026-10-15, "stream lines still a little jagged"): where the wind turns fast (round a low's
  // centre, near calm) a full step swung up to 136° and drew a kink. A step that turns the line more than TURN is
  // retried at half and a quarter length; if even a quarter step turns it more than STOP, the line ends there (a calm
  // point or a low's very centre, where a line drawn through would zigzag).
  const TURN = Math.cos((20 * Math.PI) / 180), STOP = Math.cos((60 * Math.PI) / 180);
  const trace = (fi, fj, sign, id) => {
    const pts = [];
    let prev = null, travelled = 0;
    while (travelled < maxSteps * step) {
      let h = step, r = rk2(fi, fj, sign, h);
      while (r && prev && r[2] * prev[0] + r[3] * prev[1] < TURN && h > step / 4) { h /= 2; r = rk2(fi, fj, sign, h); }
      if (!r || (prev && r[2] * prev[0] + r[3] * prev[1] < STOP)) break;
      const o = occ[oi(r[0], r[1])];
      if (o !== -1 && o !== id) break;                          // another line is already here
      fi = r[0]; fj = r[1]; prev = [r[2], r[3]]; travelled += h;
      pts.push([fi, fj]);
    }
    return pts;
  };
  for (let sj = spacing / 2; sj < nlat - 1; sj += spacing) {
    for (let si = spacing / 2; si < nlon - 1; si += spacing) {
      if (occ[oi(si, sj)] !== -1 || !dir(si, sj)) continue;
      const id = lines.length;
      const back = trace(si, sj, -1, id).reverse(), fwd = trace(si, sj, 1, id);
      // any joint still sharper than STOP on the map (where the two halves meet at the seed, or a step at a line's very
      // start, which has no previous direction to check): split the line there and keep its longest piece
      let pts = [...back, [si, sj], ...fwd];
      const km = pts.map(([i, j]) => [i * dlon * Math.cos(((lat0 + j * dlat) * Math.PI) / 180), j * dlat]);
      let best = [0, 0], from = 0;
      for (let q = 1; q < pts.length; q++) {
        let cut = q === pts.length - 1;
        if (!cut) {
          const A = [km[q][0] - km[q - 1][0], km[q][1] - km[q - 1][1]], B = [km[q + 1][0] - km[q][0], km[q + 1][1] - km[q][1]];
          cut = (A[0] * B[0] + A[1] * B[1]) / (Math.hypot(...A) * Math.hypot(...B) || 1) < STOP;
        }
        if (cut) { const to = q === pts.length - 1 ? pts.length : q + 1; if (to - from > best[1] - best[0]) best = [from, to]; from = q; }
      }
      pts = pts.slice(best[0], best[1]);
      if (pts.length < minPoints) continue;
      for (const [fi, fj] of pts) occ[oi(fi, fj)] = id;
      lines.push(pts);
    }
  }
  return lines;
}
