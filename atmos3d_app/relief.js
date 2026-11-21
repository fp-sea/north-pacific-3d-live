// Relief: stretch a level's troughs and ridges so its shape can be seen.
//
// The ×120 vertical exaggeration separates the levels, but a level's own
// bumps are only a few hundred metres (500 mb spans ~5,300-5,940 m, 0.6 % of
// the map's width at ×120), so every level looks flat. Relief R multiplies
// each point's departure from the level's MEAN height:
//     drawn = mean + (h - mean) x R
// The mean stays at its true height, so the level keeps its place in the
// stack; only the shape is stretched. This is a DRAWN height for the sheet
// and everything riding on it -- readouts, H and L, the probe and the
// contours all use the real heights. The page says so whenever R != 1.
//
// Pure, no imports: node --test loads it.

export const RELIEF_MAX = 10;

// Mean height (m) over the points where the level is above ground.
export function levelMean(h, o = null) {
  let s = 0, n = 0;
  for (let k = 0; k < h.length; k++) {
    if ((o && o[k] < 0.5) || !Number.isFinite(h[k])) continue;
    s += h[k]; n++;
  }
  return n ? s / n : NaN;
}

// Drawn heights for relief R around `mean`.
export function reliefHeights(h, mean, R) {
  const out = new Float32Array(h.length);
  for (let k = 0; k < h.length; k++) out[k] = mean + (h[k] - mean) * R;
  return out;
}
