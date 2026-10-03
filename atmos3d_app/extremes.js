// Highs and lows: local extremes of a field on the grid (sea-level pressure,
// or a level's height), for the "H" and "L" labels.
//
// A grid point is a LOW if it is the lowest value within `radius` points in
// every direction (a square window) and at least `prominence` below that
// window's mean over valid points; a HIGH likewise. Points within `radius` of
// the domain edge are skipped (an extreme there can't be confirmed), as are
// masked points (a level below ground) and points whose window is less than
// half valid. Ties on a flat plateau go to the first index.
// Computed on one REAL step's field -- never a blend of two.
//
// Pure, no imports: node --test loads it (tests/js/extremes.test.mjs).

// Sliding-window min or max (square, half-width r) by two separable passes,
// each O(n) whatever r (van Herk / Gil-Werman: per block of 2r+1, running
// extremes from the left and from the right; a window then spans at most
// two blocks). Lines are padded with the neutral value so edge windows are
// full length. The plain O(n*r) version took ~50 ms per field and ran when
// playback crossed the middle of each step: a visible hitch (2026-09-28).
function linePass(src, dst, n, start, stride, r, isMin, g, h) {
  const w = 2 * r + 1, N = n + 2 * r, neutral = isMin ? Infinity : -Infinity;
  const at = (q) => (q < r || q >= r + n ? neutral : src[start + (q - r) * stride]);
  for (let b = 0; b < N; b += w) {
    const e = Math.min(b + w, N);
    let v = neutral;
    for (let q = b; q < e; q++) { const x = at(q); v = isMin ? (x < v ? x : v) : (x > v ? x : v); g[q] = v; }
    v = neutral;
    for (let q = e - 1; q >= b; q--) { const x = at(q); v = isMin ? (x < v ? x : v) : (x > v ? x : v); h[q] = v; }
  }
  for (let i = 0; i < n; i++) {
    const lo = i, hi = i + 2 * r;              // padded coordinates of the window around i
    const a = h[lo], c = g[hi];
    dst[start + i * stride] = isMin ? (a < c ? a : c) : (a > c ? a : c);
  }
}
function windowExtreme(a, nlat, nlon, r, isMin) {
  const tmp = new Float32Array(a.length), out = new Float32Array(a.length);
  const m = Math.max(nlat, nlon) + 2 * r, g = new Float32Array(m), h = new Float32Array(m);
  for (let j = 0; j < nlat; j++) linePass(a, tmp, nlon, j * nlon, 1, r, isMin, g, h);
  for (let i = 0; i < nlon; i++) linePass(tmp, out, nlat, i, nlon, r, isMin, g, h);
  return out;
}

// Window sum of `a` by a summed-area table (for means over valid points only).
function windowSum(a, nlat, nlon, r) {
  const W = nlon + 1, S = new Float64Array((nlat + 1) * W);
  for (let j = 0; j < nlat; j++) {
    for (let i = 0; i < nlon; i++) S[(j + 1) * W + i + 1] = a[j * nlon + i] + S[j * W + i + 1] + S[(j + 1) * W + i] - S[j * W + i];
  }
  const out = new Float64Array(a.length);
  for (let j = 0; j < nlat; j++) {
    for (let i = 0; i < nlon; i++) {
      const j0 = Math.max(0, j - r), j1 = Math.min(nlat, j + r + 1), i0 = Math.max(0, i - r), i1 = Math.min(nlon, i + r + 1);
      out[j * nlon + i] = S[j1 * W + i1] - S[j0 * W + i1] - S[j1 * W + i0] + S[j0 * W + i0];
    }
  }
  return out;
}

// field: Float32Array on the grid; mask: optional (1 = use); returns
// [{kind: "H" | "L", k, value}] sorted most prominent first.
// kinds: which to look for ("L", "H"); lows and highs usually need
// different windows (compact lows, broad highs).
export function findExtremes(field, grid, { radius = 8, prominence = 1, mask = null, kinds = ["L", "H"] } = {}) {
  const { nlat, nlon } = grid;
  // NaN / masked points must never win: fill them with the window-neutral value per pass.
  const clean = (fill) => {
    const c = new Float32Array(field.length);
    for (let k = 0; k < field.length; k++) c[k] = Number.isFinite(field[k]) && (!mask || mask[k] > 0.5) ? field[k] : fill;
    return c;
  };
  const forMin = clean(Infinity), forMax = clean(-Infinity);
  const wantL = kinds.includes("L"), wantH = kinds.includes("H");
  const mn = wantL ? windowExtreme(forMin, nlat, nlon, radius, true) : null;
  const mx = wantH ? windowExtreme(forMax, nlat, nlon, radius, false) : null;
  // The window mean counts VALID points only; a point whose window is less than
  // half valid (e.g. a lowland pocket among masked mountains) is not judged.
  // Filling masked points with a domain mean instead once made a flat 997 hPa
  // spot in the BC interior look like a 10 hPa low (real build, 2026-09-28).
  const valid = new Float32Array(field.length), vals = new Float32Array(field.length);
  for (let k = 0; k < field.length; k++) if (forMin[k] !== Infinity) { valid[k] = 1; vals[k] = forMin[k]; }
  const cnt = windowSum(valid, nlat, nlon, radius), tot = windowSum(vals, nlat, nlon, radius);
  const full = (2 * radius + 1) ** 2;
  const out = [];
  for (let j = radius; j < nlat - radius; j++) {
    for (let i = radius; i < nlon - radius; i++) {
      const k = j * nlon + i, v = forMin[k];
      if (v === Infinity || cnt[k] < 0.5 * full) continue;
      const m = tot[k] / cnt[k];
      for (let q = 0; q < 2; q++) {
        const kind = q ? "H" : "L";
        if (q ? !wantH || v !== mx[k] : !wantL || v !== mn[k]) continue;
        const dev = q ? v - m : m - v;
        if (dev < prominence) continue;
        // One label per flat top: a same-kind extreme of the same value within
        // the window is the same feature (seen on the real build at 1 m / 0.1 hPa storage steps).
        if (out.some((o) => o.kind === kind && o.value === v
          && Math.abs(Math.floor(o.k / nlon) - j) <= radius && Math.abs((o.k % nlon) - i) <= radius)) continue;
        out.push({ kind, k, value: v, dev });
      }
    }
  }
  return out.sort((a, b) => b.dev - a.dev);
}
