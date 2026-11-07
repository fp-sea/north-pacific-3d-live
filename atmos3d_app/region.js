// The region of interest (user request, 2026-09-29: the slice, the volume and
// the 3-D particles were separate tools with their own "where"): one region
// that everything in the 3-D tab follows.
//   shape "whole": the whole atmosphere, surface to the top;
//   shape "wall":  a vertical band along the slice's line (its run, position
//                  and turn), `width` km across, between two heights;
//   shape "layer": a horizontal layer between two heights, the whole map wide;
//   shape "box":   a lat/lon box between two heights (user request,
//                  2026-09-29). On the Mercator map it's a rectangle, so it is
//                  the same frame as a wall: a west-to-east line through its
//                  middle, as wide as the box is tall. Everything that keeps
//                  inside a wall (fade, particles, flow lines, volume) keeps
//                  inside a box with no changes.
// Heights: bottom zLo and thickness (km), the thickness first as the user
// prefers; the top never goes past TOP_KM.
//
// Pure, no imports: node --test loads it. Positions are Mercator km (the same
// map the slice path is laid on, project.js mercatorKm).

export const TOP_KM = 12.5;
export const THIN_WALL_KM = 300;        // a thin slice's band for the volume and particles

// [bottom, top] km of the region.
export function regionHeights(roi) {
  if (roi.shape === "whole") return [0, TOP_KM];
  const lo = Math.max(0, Math.min(TOP_KM - 0.25, roi.zLo));
  return [lo, Math.min(TOP_KM, lo + Math.max(0.25, roi.thick))];
}

// The wall's frame from its line's two ends (Mercator km) and its width (0 =
// a thin slice, drawn THIN_WALL_KM wide for the volume and particles).
export function wallFrame(p0, p1, widthKm) {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dx, dy) || 1;
  return { p0, d: [dx / len, dy / len], n: [dy / len, -dx / len], len, half: (widthKm || THIN_WALL_KM) / 2 };
}

// Along (0..len) and across (+ = to the right of the line's direction), km.
export function wallCoords(f, x, y) {
  const rx = x - f.p0[0], ry = y - f.p0[1];
  return [rx * f.d[0] + ry * f.d[1], rx * f.n[0] + ry * f.n[1]];
}

export function inWall(f, x, y) {
  const [s, o] = wallCoords(f, x, y);
  return s >= 0 && s <= f.len && Math.abs(o) <= f.half;
}

// A random point in the band (u, v in 0..1; Math.random by default).
export function wallSeed(f, u = Math.random(), v = Math.random()) {
  const s = u * f.len, o = (v - 0.5) * 2 * f.half;
  return [f.p0[0] + f.d[0] * s + f.n[0] * o, f.p0[1] + f.d[1] * s + f.n[1] * o];
}

// A box's frame from its south-west and north-east corners (Mercator km).
export function boxFrame(sw, ne) {
  const yMid = (sw[1] + ne[1]) / 2;
  return { ...wallFrame([sw[0], yMid], [ne[0], yMid], 1), half: Math.abs(ne[1] - sw[1]) / 2 };
}

// A box kept on the map (bounds {latMin, latMax, lonMin, lonMax}) and at least
// minDeg across each way, edges on the half degree. Returns a new box.
export function clampBox(b, bounds, minDeg = 2) {
  const r = (x) => Math.round(x * 2) / 2;
  let { latS, latN, lonW, lonE } = b;
  if (latS > latN) [latS, latN] = [latN, latS];
  if (lonW > lonE) [lonW, lonE] = [lonE, lonW];
  latS = r(Math.max(bounds.latMin, Math.min(bounds.latMax - minDeg, latS)));
  latN = r(Math.min(bounds.latMax, Math.max(latS + minDeg, latN)));
  lonW = r(Math.max(bounds.lonMin, Math.min(bounds.lonMax - minDeg, lonW)));
  lonE = r(Math.min(bounds.lonMax, Math.max(lonW + minDeg, lonE)));
  return { latS, latN, lonW, lonE };
}
