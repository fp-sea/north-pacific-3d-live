// Questions: ways into the data for someone learning (or teaching) the
// Pacific atmosphere. Each is one question plus the settings that answer it
// and a card: what to look for, a live note computed from the step on
// screen, and a link to the guide. Picking one sets everything at once; any
// change afterwards turns the picker to "Custom" (the idea comes from Wind
// Volume Explorer's presets). See docs/interaction_design.md §4.1.
//
// spec: focus (layer key), context (layer keys shown as contours only),
//   fill (height | wind | temp | rh | moist | none, on the focus level), relief
//   (optional, focus level's relief stretch; default 1), particles, barbs,
//   flow (the focus level's wind; at the surface "particles" means the 10 m
//   wind's), surfaceParticles (optional: "off" | "wind" | "waves", the
//   Surface section; see surfaceParticlesOf), satellite (bool), view (opc | domain | oblique | globe |
//   storm), opc (optional: "surface_analysis" | "500mb", OPC's chart shown),
//   time ("now" | "past" = a real step 12 h into the satellite's
//   day | "obs" = the last satellite image, where model and observation meet).
//
// No imports: node --test loads this (tests/js/questions.test.mjs).

import { bulkRichardson } from "./derived3d.js?v=20261010090011";

const KT = 1.943844;

// The Surface section's particles for a spec: given, or else the 10 m wind
// when the surface is the focus with particles on, otherwise off.
export function surfaceParticlesOf(spec) {
  if (["off", "wind", "waves"].includes(spec.surfaceParticles)) return spec.surfaceParticles;
  return spec.focus === "sfc" && spec.particles ? "wind" : "off";
}

// ---- live-note helpers: plain functions of real fields on manifest.grid ----

// lat/lon of flat index k on the grid.
export function latLonAt(grid, k) {
  const j = Math.floor(k / grid.nlon), i = k % grid.nlon;
  return [grid.lat0 + j * grid.dlat, (grid.lon0 + i * grid.dlon) % 360];
}

export function fmtLatLon(lat, lon) {
  const la = `${Math.round(Math.abs(lat))}°${lat < 0 ? "S" : "N"}`;   // magnitude first: Math.round(-17.5) is -17
  const e = ((Math.round(lon) % 360) + 360) % 360;
  return `${la} ${e <= 180 ? `${e}°E` : `${360 - e}°W`}`;
}

// Index of the smallest / largest finite value (optionally only where keep(k)).
// A field's value at a place (bilinear between the four grid points around
// it; lon in either convention), or NaN outside the grid. For the gradient
// questions: sea-level pressure at a pair of stations.
export function valueAt(a, grid, lat, lon) {
  const lonE = lon < grid.lon0 ? lon + 360 : lon;
  const fi = (lonE - grid.lon0) / grid.dlon, fj = (lat - grid.lat0) / grid.dlat;
  if (!(fi >= 0 && fj >= 0 && fi <= grid.nlon - 1 && fj <= grid.nlat - 1)) return NaN;
  const i = Math.min(grid.nlon - 2, Math.floor(fi)), j = Math.min(grid.nlat - 2, Math.floor(fj)), x = fi - i, y = fj - j, k = j * grid.nlon + i;
  return a[k] * (1 - x) * (1 - y) + a[k + 1] * x * (1 - y) + a[k + grid.nlon] * (1 - x) * y + a[k + grid.nlon + 1] * x * y;
}

// Sea-level pressure difference A minus B, hPa (mslp in Pa), rounded to 0.1.
export function pressureDiff(mslpPa, grid, a, b) {
  return Math.round((valueAt(mslpPa, grid, a[0], a[1]) - valueAt(mslpPa, grid, b[0], b[1])) / 10) / 10;
}

// ---- the large-scale setup at a place (the gradient-wind questions) -----------
// user request, 2026-09-29: read the pattern, not just a station pair --
// where the highs and lows are, how the isobars run and curve here, and
// what 500 mb is doing overhead. All from one model step on its grid.
const R_EARTH = 6371000, OMEGA = 7.292e-5, RHO = 1.225;
const D2R = Math.PI / 180;
export function compass16(deg) {
  return ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}
// Great-circle distance (km) and bearing (deg from north) from a to b ([lat, lon]).
export function distBearing(a, b) {
  const [p1, l1, p2, l2] = [a[0] * D2R, a[1] * D2R, b[0] * D2R, b[1] * D2R];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2)) * R_EARTH / 1000;
  const brg = (Math.atan2(Math.sin(l2 - l1) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(l2 - l1)) / D2R + 360) % 360;
  return [d, brg];
}
// The pressure pattern at a place: the geostrophic wind the isobars drive
// (from their spacing and orientation: direction it blows FROM, speed kt;
// the real surface wind is weaker and turned toward low pressure), and the
// isobars' curvature (the pressure's Laplacian over +-stepDeg: > 0 a trough
// or low, cyclonic; < 0 a ridge or high, anticyclonic), hPa per (100 km)^2.
export function isobarsAt(mslpPa, grid, lat, lon, stepDeg = 1) {
  const P = (la, lo) => valueAt(mslpPa, grid, la, lo);
  const dy = stepDeg * 111195, dx = dy * Math.cos(lat * D2R);
  const pn = P(lat + stepDeg, lon), ps = P(lat - stepDeg, lon), pe = P(lat, lon + stepDeg), pw = P(lat, lon - stepDeg), p0 = P(lat, lon);
  const dpdx = (pe - pw) / (2 * dx), dpdy = (pn - ps) / (2 * dy), f = 2 * OMEGA * Math.sin(lat * D2R);
  const ug = -dpdy / (RHO * f), vg = dpdx / (RHO * f);
  const lap = ((pe + pw - 2 * p0) / dx ** 2 + (pn + ps - 2 * p0) / dy ** 2) * 1e10 / 100;     // hPa per (100 km)^2
  return { from: (Math.atan2(-ug, -vg) / D2R + 360) % 360, speedKt: Math.hypot(ug, vg) * 1.943844, gradHpa100km: Math.hypot(dpdx, dpdy) * 1e5 / 100, curvature: lap };
}
// Curvature of any field at a place (its Laplacian over +-stepDeg, per
// (100 km)^2): for 500 mb heights, > 0 a trough overhead, < 0 a ridge.
export function curvatureAt(field, grid, lat, lon, stepDeg = 2) {
  const P = (la, lo) => valueAt(field, grid, la, lo);
  const dy = stepDeg * 111195, dx = dy * Math.cos(lat * D2R), p0 = P(lat, lon);
  return ((P(lat, lon + stepDeg) + P(lat, lon - stepDeg) - 2 * p0) / dx ** 2 + (P(lat + stepDeg, lon) + P(lat - stepDeg, lon) - 2 * p0) / dy ** 2) * 1e10;
}
// Highs and lows within radiusKm of a place: local extremes over a
// +-winDeg window that stand out from the window's mean by >= minHpa.
// [{kind: "H" | "L", hPa, lat, lon, km, bearing}], nearest first.
// psfc (optional, Pa): skip points on high ground (surface pressure < 970 hPa),
// where sea-level pressure is an extrapolation and makes false highs and lows
// (Mauna Kea and Mauna Loa did, 2026-09-29).
export function centresNear(mslpPa, grid, lat, lon, radiusKm = 2500, winDeg = 5, minHpa = 2, psfc = null) {
  const out = [], w = Math.round(winDeg / Math.abs(grid.dlat));
  for (let j = w; j < grid.nlat - w; j++) for (let i = w; i < grid.nlon - w; i++) {
    const la = grid.lat0 + j * grid.dlat, lo = grid.lon0 + i * grid.dlon, [km, brg] = distBearing([lat, lon], [la, lo]);
    if (km > radiusKm) continue;
    const v = mslpPa[j * grid.nlon + i];
    if (psfc && psfc[j * grid.nlon + i] < 97000) continue;
    let mn = Infinity, mx = -Infinity, sum = 0, n = 0;
    for (let jj = j - w; jj <= j + w; jj += 1) for (let ii = i - w; ii <= i + w; ii += 1) { const x = mslpPa[jj * grid.nlon + ii]; mn = Math.min(mn, x); mx = Math.max(mx, x); sum += x; n++; }
    const mean = sum / n;
    if (v === mn && mean - v >= minHpa * 100) out.push({ kind: "L", hPa: v / 100, lat: la, lon: lo, km, bearing: brg });
    if (v === mx && v - mean >= minHpa * 100) out.push({ kind: "H", hPa: v / 100, lat: la, lon: lo, km, bearing: brg });
  }
  return out.sort((a, b) => a.km - b.km);
}

export function argExtreme(a, sign = -1, keep = null) {
  let best = -1;
  for (let k = 0; k < a.length; k++) {
    if (!Number.isFinite(a[k]) || (keep && !keep(k))) continue;
    if (best < 0 || sign * (a[k] - a[best]) > 0) best = k;
  }
  return best;
}

// Mean wind speed (kt) over a latitude band.
export function bandMeanSpeed(u, v, grid, latLo, latHi) {
  let s = 0, n = 0;
  for (let j = 0; j < grid.nlat; j++) {
    const lat = grid.lat0 + j * grid.dlat;
    if (lat < latLo || lat > latHi) continue;
    for (let i = 0; i < grid.nlon; i++) {
      const k = j * grid.nlon + i;
      if (Number.isFinite(u[k]) && Number.isFinite(v[k])) { s += Math.hypot(u[k], v[k]); n++; }
    }
  }
  return n ? (s / n) * KT : NaN;
}

// Deepest sea-level low: {hPa, lat, lon}.
export function deepestLow(mslpPa, grid) {
  const k = argExtreme(mslpPa, -1);
  if (k < 0) return null;
  const [lat, lon] = latLonAt(grid, k);
  return { hPa: mslpPa[k] / 100, lat, lon, k };
}

// Fastest wind (kt): {kt, lat, lon}.
export function fastestWind(u, v, grid) {
  const sp = new Float32Array(u.length);
  for (let k = 0; k < u.length; k++) sp[k] = Math.hypot(u[k], v[k]);
  const k = argExtreme(sp, 1);
  if (k < 0) return null;
  const [lat, lon] = latLonAt(grid, k);
  return { kt: sp[k] * KT, lat, lon, k };
}

// Model vs satellite at each grid point with satellite data: "cold" = cloud
// top colder than coldK (default 248 K = -25 C, mid/high cloud), "moist" =
// model RH >= rhMin at the level (where the level is above ground). Returns
// {n, cold, moist, both}: of the cold points, `both` are moist in the model,
// and so on. Pure counts; the note turns them into percentages.
export function coldMoistAgreement(bt, rh, above, { coldK = 248, rhMin = 70 } = {}) {
  let n = 0, cold = 0, moist = 0, both = 0;
  for (let k = 0; k < rh.length; k++) {
    if (bt[k] == null || !Number.isFinite(bt[k]) || !(above ? above[k] > 0.5 : true) || !Number.isFinite(rh[k])) continue;
    n++;
    const c = bt[k] < coldK, m = rh[k] >= rhMin;
    if (c) cold++;
    if (m) moist++;
    if (c && m) both++;
  }
  return { n, cold, moist, both };
}

// ---- the questions ----
// note(ctx) gets {grid, sfc(model?), level(lv, model?), models, model, label(m)}
// returning the fields of the REAL step nearest the time on screen, or null
// while loading; it returns a sentence, or null.


// ---- the gradient-wind questions' live note -------------------------------------
// The large-scale setup around a place, in words, from the step on screen:
// the nearest high and low, the isobars here (their push and curvature;
// skipped over mountains, where sea-level pressure is an extrapolation),
// 500 mb overhead, and the forecasters' station-pair differences.
const fmtKm = (km) => `${Math.round(km / 50) * 50} km`;
const curveWord = (c, big) => (c > big ? "curved cyclonically (a trough or low)" : c < -big ? "curved anticyclonically (a ridge or high)" : "nearly straight");
export function setupNote(ctx, place) {
  const s = ctx.sfc(); if (!s) return null;
  const g = ctx.grid, [lat, lon] = place.at, parts = [];
  const cs = centresNear(s.mslp, g, lat, lon, place.radiusKm ?? 2500, 5, 2, s.psfc ?? null);
  const H = cs.find((c) => c.kind === "H"), L = cs.find((c) => c.kind === "L");
  parts.push([H && `high ${Math.round(H.hPa)} hPa ${fmtKm(H.km)} to the ${compass16(H.bearing)}`, L && `low ${Math.round(L.hPa)} hPa ${fmtKm(L.km)} to the ${compass16(L.bearing)}`].filter(Boolean).join(", ") || "no closed high or low within 2,500 km");
  let iso = null;
  if (place.geo !== false) {
    iso = isobarsAt(s.mslp, g, lat, lon, place.stepDeg ?? 1);
    parts.push(iso.speedKt < 6 ? `isobars here far apart (${iso.gradHpa100km.toFixed(1)} hPa per 100 km): almost no push`
      : `isobars here ${iso.gradHpa100km.toFixed(1)} hPa per 100 km apart and ${curveWord(iso.curvature, 1)}, pushing air from the ${compass16(iso.from)} at about ${Math.round(iso.speedKt)} kt (the surface wind is weaker, and turned toward low pressure)`);
  }
  const pairs = place.pairs.map(([name, a, b]) => [name, pressureDiff(s.mslp, g, a, b)]);
  parts.push(pairs.map(([name, d]) => `${name} ${d > 0 ? "+" : ""}${d.toFixed(1)} hPa`).join(", "));
  const up = ctx.level(500);
  if (up?.gh && up.u && up.v) {
    const c5 = curvatureAt(up.gh, g, lat, lon), u = valueAt(up.u, g, lat, lon), v = valueAt(up.v, g, lat, lon);
    parts.push(`500 mb: ${c5 > 0.3 ? "a trough" : c5 < -0.3 ? "a ridge" : "neither trough nor ridge"} overhead, flow from the ${compass16((Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360)} at ${Math.round(Math.hypot(u, v) * KT)} kt`);
  }
  return `${parts.join("; ")}. Reading: ${place.read(iso, Object.fromEntries(pairs), { H, L })}${place.pairs.length ? " Grid differences read smaller than stations', often by a third to a half, because the grid smooths the gaps; the readings allow for that." : ""}`;
}

export const QUESTIONS = [
  {
    // The opening view (user request 2026-10-09): the forecaster's workhorse pair, the surface and 500 mb.
    id: "big-picture", label: "The big picture: the surface and 500 mb",
    spec: { focus: "p500", context: ["sfc"], fill: "wind", relief: 4, opacity: 0.45, particles: false, surfaceParticles: "wind", barbs: false, satellite: false, view: "oblique", time: "now", hl: ["sfc", "p500"] },
    why: "Forecasters read the weather from two maps together: the surface, where the highs, lows and fronts are and the wind is felt, and 500 mb (about 5.5 km), where the troughs and ridges of the westerlies steer those storms and decide whether they grow or fade.",
    lookFor: "Below, the sea-level isobars with their highs and lows and the 10 m wind as moving particles. Above, see-through, the 500 mb heights with their relief stretched ×4, so troughs dip as valleys and ridges rise as crests, coloured by wind speed: the jet stream's fast cores glow green to red. The two sets of labels measure different things. At the surface, H and L are sea-level pressure in hPa (the same as millibars, mb), and the lines are isobars, lines of equal pressure. At 500 mb the map is drawn the other way round: everywhere is at the same pressure, 500 mb, so it shows how HIGH that pressure is found, in decametres (tens of metres): \"L 531·500\" means the 500 mb surface is only 531 dam (5,310 m) up at that low; the lines are height contours (isohypses), every 6 dam. Cold air is dense and shrinks the column under it, so the 500 mb surface sits low over cold air: low heights are troughs of cold air. Warm air expands, lifting it: high heights are ridges of warm air. Storms grow under the downwind side of a trough (where the air aloft rises and spreads); highs settle under ridges. Air at 500 mb follows the height lines, so they show the steering flow; drag to look along a trough, and press Play to watch the waves move east.",
    guide: "troughs-lows",
    note(ctx) {
      const s = ctx.sfc(), l = ctx.level(500); if (!s || !l) return null;
      const lo = deepestLow(s.mslp, ctx.grid);
      let k = 0, v = -1;
      for (let i = 0; i < l.u.length; i++) { const w = Math.hypot(l.u[i], l.v[i]); if (w > v) { v = w; k = i; } }
      if (!lo) return null;
      const [lat, lon] = latLonAt(ctx.grid, k);
      return `Deepest low: ${Math.round(lo.hPa)} hPa near ${fmtLatLon(lo.lat, lo.lon)}. Fastest wind at 500 mb: ${Math.round(v * 1.943844)} kt near ${fmtLatLon(lat, lon)}.`;
    },
  },
  {
    id: "weather-now", label: "Where's the weather now?",
    spec: { focus: "sfc", context: [], fill: "none", particles: true, barbs: false, satellite: true, view: "opc", time: "obs" },
    why: "The satellite shows the real clouds; the isobars show the model's pressure pattern. Together they say where the weather is and whether the model agrees with what's actually there.",
    lookFor: "Sea-level pressure (isobars) over the observed satellite infrared, at the newest satellite image. Lows sit under the swirls of cold (white) cloud; highs under clear skies. The OPC chart area is the orange box: compare it with OPC's own surface analysis.",
    guide: "weather-now",
    note(ctx) {
      const s = ctx.sfc(); if (!s) return null;
      const lo = deepestLow(s.mslp, ctx.grid);
      return lo && `Deepest low in the data area: ${Math.round(lo.hPa)} hPa near ${fmtLatLon(lo.lat, lo.lon)}.`;
    },
  },
  {
    id: "lows-jet", label: "Lows, highs and the jet above them",
    spec: { focus: "p250", context: ["sfc", "p500"], fill: "wind", particles: true, barbs: false, satellite: false, view: "oblique", time: "now" },
    why: "Storms are 3-D: the surface low, the trough aloft and the jet above work together. Stacking the three levels at their real heights shows how they line up.",
    lookFor: "Three layers at once: isobars at the surface, 500 mb heights (≈5.5 km) and the 250 mb jet (≈10 km) coloured by speed. Surface lows tend to sit east of the 500 mb troughs, under the jet's left exit; that's where air is pulled away aloft and the low deepens.",
    guide: "troughs-lows",
    note(ctx) {
      const s = ctx.sfc(), j = ctx.level(250); if (!s || !j) return null;
      const lo = deepestLow(s.mslp, ctx.grid), w = fastestWind(j.u, j.v, ctx.grid);
      return `Deepest low ${Math.round(lo.hPa)} hPa near ${fmtLatLon(lo.lat, lo.lon)} · fastest 250 mb wind ${Math.round(w.kt)} kt near ${fmtLatLon(w.lat, w.lon)}.`;
    },
  },
  {
    id: "jet", label: "The jet stream",
    spec: { focus: "p250", context: [], fill: "wind", particles: true, barbs: false, satellite: false, view: "domain", time: "now" },
    why: "At 250 mb (about 10 km) the wind is fastest, so the jet stands out on its own; particles show its flow and the colour its speed.",
    lookFor: "The 250 mb wind (≈10 km up), where the jet is strongest. A river of fast air from Asia across the Pacific, fastest in its cores (jet streaks). It bends north around ridges and south around troughs. Play the timeline: the pattern moves east and changes over days.",
    guide: "jet",
    note(ctx) {
      const j = ctx.level(250); if (!j) return null;
      const w = fastestWind(j.u, j.v, ctx.grid);
      return w && `Fastest 250 mb wind in the data area: ${Math.round(w.kt)} kt near ${fmtLatLon(w.lat, w.lon)}.`;
    },
  },
  {
    id: "steering", label: "What steers the storms",
    spec: { focus: "p500", context: ["sfc"], fill: "height", relief: 5, particles: true, barbs: false, satellite: false, view: "oblique", time: "now" },
    why: "Storms move roughly with the wind at 500 mb, the middle of the atmosphere. Colouring that level by height, stretched, shows the troughs and ridges that steer them.",
    lookFor: "The 500 mb surface (≈5.5 km) coloured by height, with its troughs (blue valleys) and ridges (orange hills) stretched 5× so they show, its wind as particles, over the surface isobars. Press Play: surface lows travel roughly with the 500 mb flow above them, at about half its speed, and the troughs and ridges move east too.",
    guide: "troughs-lows",
    note: null,
  },
  {
    id: "unusual", label: "How unusual is it? (500 mb anomaly)", needs: "clim",
    spec: { focus: "p500", context: ["sfc"], fill: "height_anom", particles: false, barbs: false, satellite: false, view: "opc", time: "now" },
    why: "An anomaly subtracts the normal for the date, so what's left is only what's unusual this week. 500 mb shows the big patterns (ridges, troughs, blocks) best.",
    lookFor: "The 500 mb height minus its 1991–2020 average for this date and hour: red where the level stands higher than normal (warm, ridgy air), blue where lower (cold troughs). Big, slow blobs are the pattern of the week; a blue blob sitting still for days is a stuck trough, a red one a blocking ridge. Surface isobars on top show where the storms are.",
    guide: "anomalies",
    note: null,
  },
  {
    id: "ocean-anomaly", label: "Warm and cold water (observed)", needs: "oisst",
    spec: { focus: "sfc", context: [], fill: "sst_obs_anom", particles: false, barbs: false, satellite: false, view: "domain", time: "now" },
    why: "The ocean changes slowly and drives the weather above it. Observed sea temperature against normal shows marine heatwaves and El Niño or La Niña at a glance.",
    lookFor: "Yesterday's observed sea surface temperature (NOAA OISST, from satellites, ships and buoys) minus its 1991–2020 average for the date. Marine heatwaves show as broad red patches; the tropical Pacific band tells El Niño (warm east) from La Niña (cool east). It's one real day, the same at every time on the slider.",
    guide: "anomalies",
    note: null,
  },
  {
    id: "big-waves", label: "Where are the big waves?", needs: "waves",
    spec: { focus: "sfc", context: [], fill: "waves", particles: true, barbs: false, satellite: false, view: "domain", time: "now" },
    why: "Wave height shows the sea state; the 10 m wind particles show the wind that raised it, so you can see the two together.",
    lookFor: "Significant wave height from the model's own wave model, with the 10 m wind as particles. The biggest seas sit under and just behind each storm's strongest, longest-blowing winds: speed, duration and fetch (the distance the wind blows over) build them. Hover for height, period and direction. Flip M to compare GFS-Wave with ECMWF's wave model.",
    guide: "waves-sea",
    note: null,
  },
  {
    id: "swell", label: "Follow the swell", needs: "waves",
    spec: { focus: "sfc", context: [], fill: "wave_period", particles: true, surfaceParticles: "waves", barbs: false, satellite: false, view: "domain", time: "now" },
    why: "Wave period tells swell (long, from far away) from local wind-sea (short). Particles moving at the swell's speed show where the energy is going.",
    lookFor: "Wave period (long = dark) with particles carrying wave energy (teal) the way it travels, at the deep-water group speed g·T/4π. Press Play: long-period swell streams away from each storm faster than the storm moves and fans out across the ocean for thousands of km, reaching Hawaiʻi or the coasts days later under a calm sky. A long period far from any storm is the signature of old, distant swell.",
    guide: "waves-sea",
    note: null,
  },
  {
    id: "trades", label: "Trade winds and the ITCZ",
    spec: { focus: "sfc", context: [], fill: "wind", particles: true, barbs: false, satellite: true, view: "domain", time: "now" },
    why: "The 10 m wind over the whole area shows the big, steady circulation of the tropics; the satellite shows the ITCZ's clouds where the trade winds meet.",
    lookFor: "10 m wind over the whole domain. North-east trades south of the subtropical high, south-east trades in the southern hemisphere, meeting near 5–10°N in the Intertropical Convergence Zone (ITCZ): a line of tall, cold cloud in the infrared, with light winds under it.",
    guide: "trades-itcz",
    note(ctx) {
      const s = ctx.sfc(); if (!s) return null;
      const nh = bandMeanSpeed(s.u10, s.v10, ctx.grid, 12, 22), eq = bandMeanSpeed(s.u10, s.v10, ctx.grid, -3, 3);
      return `Mean 10 m wind: ${Math.round(nh)} kt in the northern trades (12–22°N) vs ${Math.round(eq)} kt at the equator (3°S–3°N).`;
    },
  },
  {
    id: "rising", label: "Where is the air rising?", needs: "w",
    spec: { focus: "p500", context: ["sfc"], fill: "vertical", particles: false, barbs: false, satellite: false, view: "domain", time: "now" },
    why: "Rising air makes cloud and rain, but it's slow (centimetres a second) and invisible in the wind; the model's vertical motion shows it directly.",
    lookFor: "Vertical motion at 500 mb (≈5.5 km): blue where air rises, brown where it sinks, with the surface isobars. Rising air cools and makes cloud and rain, so the blue sits over the storms: ahead of (east of) each low and along its fronts, and in the ITCZ near 5–10°N. Brown fills the highs and the air behind cold fronts. Hover for the speed; turn on the satellite to see the cloud the rising air makes.",
    guide: "vertical",
    note(ctx) {
      const L = ctx.level(500); if (!L || !L.w) return null;
      const up = argExtreme(L.w, 1), down = argExtreme(L.w, -1);
      if (up < 0 || down < 0) return null;
      const at = (k) => fmtLatLon(...latLonAt(ctx.grid, k));
      return `Fastest rising at 500 mb: ${Math.round(L.w[up])} cm/s near ${at(up)} · fastest sinking ${Math.round(-L.w[down])} cm/s near ${at(down)}.`;
    },
  },
  {
    id: "fronts", label: "Warm and cold air: fronts",
    spec: { focus: "p850", context: ["sfc"], fill: "temp", particles: false, barbs: true, satellite: false, view: "opc", time: "now" },
    why: "850 mb (about 1.5 km) is above the ground's daily heating and cooling, so its temperature shows the air masses and the sharp zones between them: fronts.",
    lookFor: "Temperature at 850 mb (≈1.5 km, above the sea's daily influence), with wind barbs and surface isobars. Fronts are where the colours crowd together: cold air behind (west of) a cold front, warm air ahead. The barbs turn as you cross one.",
    guide: "fronts",
    note: null,
  },
  {
    id: "moisture", label: "Moisture and atmospheric rivers", needs: "pwat",
    spec: { focus: "sfc", context: [], fill: "water_vapour", particles: true, barbs: false, satellite: false, view: "domain", time: "now" },
    why: "Water vapour is the fuel for rain; atmospheric rivers show as long, narrow ribbons of it, and the 10 m wind shows where they're headed.",
    lookFor: "Water vapour: all the water in the air above each point, in mm if it rained out, with the 10 m wind. An atmospheric river is a long, narrow ribbon of moist air (40 mm or more outside the tropics) reaching from the subtropics toward the coast, usually just ahead of a cold front. Press Play: see whether one lines up on the West Coast or BC in the next week, and where it comes ashore.",
    guide: "rivers",
    note(ctx) {
      const s = ctx.sfc(); if (!s || !s.pwat) return null;
      // North of 35N: at 30N the maximum sat on the edge of the tropical moisture (seen on real data).
      const g = ctx.grid, k = argExtreme(s.pwat, 1, (i) => latLonAt(g, i)[0] >= 35);
      if (k < 0) return null;
      const [lat, lon] = latLonAt(g, k), v = s.pwat[k];
      return `Most water vapour north of 35°N: ${Math.round(v)} mm near ${fmtLatLon(lat, lon)}${v >= 40 ? " (enough for an atmospheric river, if it's a long, narrow plume)" : ""}.`;
    },
  },
  {
    id: "mixing", label: "How deep is the air mixed? (smoke, haze, gusts)", needs: "hpbl",
    spec: { focus: "sfc", context: [], fill: "pbl", particles: true, barbs: false, satellite: false, view: "domain", time: "now" },
    why: "The boundary layer is the air the ground stirs: smoke, haze and moisture from the surface spread through it and stay under its lid, and strong wind above mixes down to the ground as gusts only as deep as it reaches.",
    lookFor: "The colour is GFS's boundary-layer depth: how deep the air near the ground is being mixed, from pale (a few hundred metres: a lid close to the ground, where smoke and pollution collect) to dark red (2–3 km: strong afternoon heating over land, or cold air pouring over warmer sea behind a front). Over the ocean it changes slowly, set by the sea; over land it swells every afternoon and collapses at night. Press Play and watch the land pulse through the days. It is GFS only (ECMWF's open data doesn't include it).",
    guide: "mixing",
    note(ctx) {
      const s = ctx.sfc(); if (!s || !s.hpbl) return null;
      const at = (lat, lon) => { const v = valueAt(s.hpbl, ctx.grid, lat, lon); return Number.isFinite(v) && v >= 0 ? `${Math.round(v / 10) * 10} m` : "—"; };
      return `Mixed-layer depth now: Seattle ${at(47.45, -122.3)}, Portland ${at(45.6, -122.6)}, off the California coast (35°N 125°W) ${at(35, -125)}, Honolulu ${at(21.3, -157.9)}.`;
    },
  },
  {
    id: "mixing-850", label: "Can the ground's air mix up to 850 mb?",
    spec: { focus: "p850", context: ["sfc"], fill: "rib", particles: false, barbs: true, satellite: false, view: "domain", time: "now" },
    why: "The Richardson number weighs a layer's stability against its wind shear. From the ground up to 850 mb (about 1.5 km) it says whether surface air can be stirred that high: where it can, wind at 850 mb can reach the ground as gusts and surface smoke spreads upward; where it can't, an inversion caps the surface air.",
    lookFor: "The colour is the bulk Richardson number from the ground to 850 mb (about 1.5 km), with wind barbs at 850 mb and surface isobars. Yellow and orange (below 0.25): shear and heating win, the layer mixes, and the barbs' wind can gust down to the ground. Blue (above 1): too stable, an inversion caps the surface air (marine layers, cold air in basins, calm clear nights). Red (below 0): the air near the ground is warmer, in θ, than the air above it and overturns by itself. Compare the land at night and in the afternoon with Play, and the sea behind a cold front.",
    guide: "mixing",
    note(ctx) {
      const s = ctx.sfc(), l = ctx.level(850); if (!s || !l) return null;
      const g = ctx.grid, n = s.psfc.length;
      let mixed = 0, all = 0;
      for (let k = 0; k < n; k++) {
        const r = bulkRichardson(s.t2m[k], s.psfc[k], s.u10[k], s.v10[k], l.t[k], l.u[k], l.v[k], 850);
        if (!Number.isFinite(r)) continue;
        all++; if (r < 0.25) mixed++;
      }
      const at = (lat, lon) => { const [i, j] = [Math.round(((lon < g.lon0 ? lon + 360 : lon) - g.lon0) / g.dlon), Math.round((lat - g.lat0) / g.dlat)]; const k = j * g.nlon + i;
        const r = bulkRichardson(s.t2m[k], s.psfc[k], s.u10[k], s.v10[k], l.t[k], l.u[k], l.v[k], 850); return Number.isFinite(r) ? r.toFixed(2) : "—"; };
      return all ? `Mixed from the ground to 850 mb (Ri below 0.25): ${Math.round((100 * mixed) / all)} % of the map now. Seattle ${at(47.5, -122.5)}, Honolulu ${at(21.5, -158)}.` : null;
    },
  },
  {
    id: "storm-3d", label: "A storm in 3-D",
    spec: { focus: "p850", context: ["sfc", "p500", "p250"], fill: "none", particles: true, barbs: false, satellite: false, view: "storm", time: "now" },
    why: "Seen from the side, the levels show a storm's 3-D shape: whether it leans west with height (still deepening) or stands straight (mature).",
    lookFor: "The camera flies to the deepest low. Isobars at the surface, then 850, 500 and 250 mb heights stacked above it. In a developing storm the low centres shift west (upstream) with height: the storm leans. As it matures and stops deepening, it stands up straight.",
    guide: "troughs-lows",
    note(ctx) {
      const s = ctx.sfc(); if (!s) return null;
      const lo = deepestLow(s.mslp, ctx.grid);
      return lo && `Flying to the deepest low: ${Math.round(lo.hPa)} hPa near ${fmtLatLon(lo.lat, lo.lon)}.`;
    },
  },
  {
    id: "model-vs-sat", label: "The model against the satellite",
    spec: { focus: "p500", context: ["sfc"], fill: "moist", particles: false, barbs: false, satellite: true, view: "opc", time: "past" },
    why: "The satellite is an observation; the model's moist air is a calculation. Laying one over the other shows where the model's clouds are right, and where not.",
    lookFor: "In the past 24 hours: the observed infrared on the ground (white = cold, high cloud tops) and, in cyan above it, only where the model's air at 500 mb (≈5.5 km) is moist (RH ≥ 70 %); drier air is see-through. Mid and high cloud should sit under the cyan. Press B to blink the model on and off; step through the day with ← →. Past hours come from the models' analyses and short forecasts.",
    guide: "satellite",
    note(ctx) {
      const l = ctx.level(500), s = ctx.sfc(), bt = ctx.satBT?.(); if (!l || !s || !bt) return null;
      const above = s.psfc.map((p) => (p >= 50000 ? 1 : 0));        // 500 mb above ground
      const a = coldMoistAgreement(bt, l.r, above);
      if (!a.cold || !a.moist) return null;
      const pc = (x, y) => Math.round((100 * x) / y);
      return `At this hour, of the points where the satellite sees cold cloud tops (below −25 °C), the model's 500 mb air is moist at ${pc(a.both, a.cold)} %; of the points it has moist, cold cloud is seen at ${pc(a.both, a.moist)} %.`;
    },
  },
  {
    id: "model-vs-opc", label: "The model against OPC's chart", needs: "opc",
    spec: { focus: "sfc", context: [], fill: "none", particles: false, barbs: false, satellite: false, view: "opc", time: "opc", opc: "surface_analysis" },
    why: "OPC's forecasters draw their chart from observations and several models; comparing it with one model's raw isobars shows what the forecasters added or changed.",
    lookFor: "OPC's own surface analysis -- drawn by forecasters from observations and models -- on the map, with the model's isobars on top, at the analysis time. Do the lows and highs sit in the same places, at the same pressures? Fronts are only on OPC's chart. Step ▶ by the timeline to OPC's 24 and 48 h forecasts and compare again; switch to OPC 500 mb there too.",
    guide: "opc",
    note: null,
  },
  {
    id: "compare", label: "GFS vs ECMWF",
    spec: { focus: "p500", context: ["sfc"], fill: "none", particles: false, barbs: false, satellite: false, view: "oblique", time: "now" },
    why: "Two independent forecasts of the same time: where they agree, confidence is higher; where they differ, the forecast is uncertain.",
    lookFor: "The two models at the same valid time. Press M to flip between them. Play forward: they agree closely for a day or two and drift apart by days 5–7. Where they differ, the forecast is less certain.",
    guide: "models",
    note(ctx) {
      const parts = [];
      for (const m of ctx.models) {
        const s = ctx.sfc(m); if (!s) continue;
        const lo = deepestLow(s.mslp, ctx.grid);
        parts.push(`${ctx.label(m)} ${Math.round(lo.hPa)} hPa near ${fmtLatLon(lo.lat, lo.lon)}`);
      }
      return parts.length ? `Deepest low — ${parts.join(" · ")}.` : null;
    },
  },
  {
    id: "alenuihaha", label: "Winds in the Alenuihāhā Channel (Hawaiʻi)",
    spec: { focus: "sfc", context: ["p500"], fill: "wind", particles: false, flow: true, barbs: false, satellite: false, view: "domain", time: "now",
      look: { lat: 22, lon: 200, span: 22, tilt: 10, name: "the Hawaiian Islands and the pattern around them" }, hl: ["sfc", "p500"] },
    why: "Channel winds are the trade winds squeezed between the islands' mountains, and how strong the trades are is set by the large-scale pattern: the subtropical high to the north, and any low, trough or front to the west. The isobars show that pattern and the 10 m wind what it drives; 500 mb shows what's coming (a Kona low starts aloft).",
    lookFor: "Where the high and the lows sit, and how the isobars run past the islands. Isobars packed together and running roughly east–west mean strong trades, and the Alenuihāhā (between Haleakalā and the Big Island) funnels them stronger still: it's about 50 km wide, too narrow for this grid, so expect more wind there than the map shows. Isobars spread far apart, or a ridge line lying over the islands, mean light winds and sea breezes. A low or trough to the west turns the wind south (kona). At 500 mb a closed low or deep trough west of the islands often comes before the surface pattern changes. Play the week and watch the gradient build and relax; see the case on January 2026.",
    guide: "gradient-winds",
    note(ctx) {
      return setupNote(ctx, {
        at: [20.3, 204], stepDeg: 2,          // samples 2° away: open ocean, clear of the islands' mountains
        pairs: [["north minus south (23°N − 17°N)", [23, 204], [17, 204]], ["east minus west (150°W − 165°W)", [21, 210], [21, 195]]],
        read(iso, d) {
          if (iso.speedKt < 8) return "a weak gradient over the islands (\"flat\", as Honolulu forecasters say; often a ridge just north of the islands or over them): light winds, sea breezes by day and land breezes at night; the channel goes calm.";
          const f = iso.from;
          if (f > 135 && f <= 200) return "south-easterly winds, between the trades and kona: usually a low or trough to the west drawing the flow round; the islands' south-east-facing coasts and channels take the brunt.";
          if (f >= 20 && f <= 135) return iso.speedKt < 20 ? "moderate trade winds; the channel runs stronger than the open sea." : iso.speedKt < 35 ? "strong trade winds, squeezed between the high to the north and lower pressure to the south or west: a rough channel, likely advisory winds." : "very strong trades from a tight gradient: expect gale-force winds and gusts in the channels.";
          if (f > 200 && f <= 270) return "kona (southerly to westerly) winds: a low or trough to the west. Rain and wind on the usually sheltered leeward sides.";
          return "northerly winds: a front or trough passing, or the high to the west.";
        },
      });
    },
  },
  {
    id: "salish", label: "Winds on the Salish Sea (Washington and BC)",
    spec: { focus: "sfc", context: ["p500"], fill: "wind", particles: false, flow: true, barbs: false, satellite: false, view: "domain", time: "now",
      look: { lat: 48, lon: 232, span: 18, tilt: 10, name: "the Pacific Northwest and the pattern offshore" }, hl: ["sfc", "p500"] },
    why: "The Salish Sea (Puget Sound, the Strait of Juan de Fuca, the Strait of Georgia) sits between mountains, so its winds are channelled along the water: south or north in Puget Sound, west or east in the Strait, out of the Fraser valley in winter. Which one blows depends on where the highs and lows are: the large-scale pattern sets the pressure differences the channels respond to.",
    lookFor: "A low approaching from the south-west or west, with isobars packed and running north–south along the coast: strong southerlies up Puget Sound and the Strait of Georgia (the storm and atmospheric-river pattern; see the December 2025 and November 2024 cases). A high building over BC with Arctic air: northerlies and the Fraser outflow through Bellingham and the San Juans (Christmas 2021). High pressure offshore and heat inland in summer: westerlies surging down the Strait of Juan de Fuca (the marine push; the end of the June 2021 heat dome). Isobars far apart: light, local winds. The channels are narrower than the grid: the pressure differences are what drive them.",
    guide: "gradient-winds",
    note(ctx) {
      return setupNote(ctx, {
        at: [48.5, 232], radiusKm: 2000,
        // The pairs NWS Seattle uses, in its sign convention (first minus second, hPa); the values
        // in the readings are ones its forecast discussions gave with those winds (station values: a
        // 0.5° grid smooths the gaps and reads smaller).
        pairs: [["Portland − Bellingham (KPDX−KBLI)", [45.6, 237.4], [48.8, 237.5]], ["Quillayute − Bellingham (UIL−KBLI)", [47.9, 235.4], [48.8, 237.5]], ["Bellingham − Williams Lake BC (KBLI−CYWL)", [48.8, 237.5], [52.2, 237.9]]],
        read(iso, d) {
          const sn = d["Portland − Bellingham (KPDX−KBLI)"], st = d["Quillayute − Bellingham (UIL−KBLI)"], fr = d["Bellingham − Williams Lake BC (KBLI−CYWL)"], out = [];
          if (sn >= 9) out.push("a windstorm-sized south-to-north difference: gale to storm-force southerlies in Puget Sound and the northern inland waters (this grid read +11 hPa in the December 2022 windstorm, when NWS model values were +14 to +16)");
          else if (sn >= 3) out.push("higher pressure to the south: southerlies up Puget Sound");
          else if (sn <= -2) out.push("higher pressure to the north: northerlies down Puget Sound");
          if (st >= 4) out.push("strong westerlies down the Strait of Juan de Fuca (NWS: +5 to +7 hPa at the stations with gales in the Strait)");
          else if (st >= 2) out.push("a westerly push down the Strait of Juan de Fuca (the marine push)");
          else if (st <= -3) out.push("easterlies out the Strait of Juan de Fuca");
          if (fr <= -12) out.push("Fraser outflow: cold north-easterlies through Bellingham and the San Juans (NWS: −15 hPa or lower at the stations with gusts to about 45 mph; this grid read −24 hPa at Christmas 2021)");
          else if (fr <= -8) out.push("higher pressure in the BC interior: some outflow through the Fraser valley");
          return out.length ? out.join("; ") + "." : "small pressure differences across the region: light, local winds (below about 3 hPa, local sea and land breezes take over in Puget Sound).";
        },
      });
    },
  },
  {
    id: "gorge", label: "The Columbia Gorge east wind (Oregon)",
    spec: { focus: "sfc", context: ["p500"], fill: "temp", particles: false, flow: true, barbs: false, satellite: false, view: "domain", time: "now",
      look: { lat: 46.5, lon: 236, span: 14, tilt: 10, name: "Oregon, Washington and the Columbia Gorge" }, hl: ["sfc", "p500"] },
    why: "The Columbia Gorge is the only sea-level gap through the Cascades. When pressure east of the mountains is higher than at Portland, cold air pours west through it; when it's lower (summer heat inland), marine air pours east. The pattern that sets that pressure difference is large: a high over the interior, or a low offshore.",
    lookFor: "A high over the interior (Idaho, eastern Washington and Oregon, BC) with lower pressure offshore: the isobars pack across the Cascades and the wind at Portland turns east, cold in winter (the ice storms of December 2022 and January 2024 are cases). In summer the reverse: heat lowers the pressure east of the mountains and the Gorge blows from the west. The 2 m temperature shows the cold or warm air on each side. The gap itself is far too small for the grid: the pressure difference is what drives it.",
    guide: "gradient-winds",
    note(ctx) {
      return setupNote(ctx, {
        at: [45.7, 238.2], geo: false,
        // NWS Portland uses Troutdale − The Dalles (KTTD−KDLS, first minus second); Troutdale is
        // at the Gorge's west end, 20 km east of Portland airport. Values from its forecast discussions.
        pairs: [["Troutdale − The Dalles (KTTD−KDLS)", [45.55, 237.6], [45.6, 238.8]]],
        read(iso, d) {
          const x = d["Troutdale − The Dalles (KTTD−KDLS)"];
          if (x <= -5) return "much higher pressure east of the Cascades: a strong east wind through the Gorge, gusty at Crown Point and Corbett; in winter, cold air into Portland (this grid read −6 to −7 hPa in the January 2024 ice storm, when the stations measured −13 to −18; NWS: −8 to −9 at the stations typically gives gusts to about 60 mph in the Gorge).";
          if (x <= -3) return "higher pressure to the east: an east wind through the Gorge (NWS: about −4 hPa at the stations keeps 20–25 kt at Troutdale).";
          if (x <= -1.5) return "a little higher pressure to the east: a light east wind through the Gorge.";
          if (x >= 2) return "lower pressure to the east: a west wind through the Gorge (the summer pattern, marine air pulled inland).";
          return "little pressure difference across the Cascades: light winds in the Gorge.";
        },
      });
    },
  },
];
