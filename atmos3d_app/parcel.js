// Lift a parcel of surface air (user pick 2026-10-09), the way a forecaster reads a sounding: it
// rises and cools at the dry rate (about 9.8 °C per km) until it's saturated (its cloud base, the
// lifting condensation level), then at the slower moist rate, because condensing water vapour gives up
// its heat. Wherever it's warmer than the air around it, it's buoyant and keeps rising on its own;
// where it's colder, it sinks back. The model's own column is the "air around it": its 2 m
// temperature at the ground, then its pressure levels above (only 7, so a sharp inversion is smeared
// between two levels). Pure, no imports: node --test loads it.
//
// env: the column, ground first: [{p (hPa), z (m above sea level), T (°C), RH (% or null)}].
// The parcel starts at the ground with the ground's temperature (plus dT, e.g. afternoon sun over
// land) and the moisture of the lowest level that has a humidity (its mixing ratio: near the surface
// the air is well mixed, and the files carry no 2 m humidity).

const RD = 287.04, CP = 1005.7, LV = 2.501e6, EPS = 0.622, G = 9.80665, KAPPA = RD / CP;
export const esat = (tc) => 6.112 * Math.exp((17.67 * tc) / (tc + 243.5));          // hPa (Bolton 1980)
const wsat = (tk, p) => { const e = esat(tk - 273.15); return (EPS * e) / Math.max(p - e, 1e-3); };
export function dewpoint(tc, rh) {
  const g = Math.log(Math.max(rh, 0.1) / 100) + (17.67 * tc) / (tc + 243.5);
  return (243.5 * g) / (17.67 - g);
}
// The moist (pseudo-)adiabat's slope, K per hPa.
function moistSlope(tk, p) {
  const ws = wsat(tk, p);
  return ((RD * tk + LV * ws) / (CP + (LV * LV * ws * EPS) / (RD * tk * tk))) / p;
}

// Returns {path: [{p, z, T, Te, buoy}], start: {T, Td, w}, lcl: {p, z, T}|null, lfc, el (each {p, z}|null),
// cape, cin (J/kg), top: the height the parcel's cloud would reach rising by itself (the EL), or null if
// it's never buoyant, stable (true: colder than its surroundings all the way: no cloud from rising alone),
// inversion: {base, top, lapse} the lowest layer above the ground where the air warms with height, or
// the most stable one (lapse rate < 3 °C/km) if none, within 5 km; null if neither}.
export function liftParcel(env, { dT = 0, dp = 2 } = {}) {
  const col = env.filter((e) => Number.isFinite(e.p) && Number.isFinite(e.z) && Number.isFinite(e.T)).sort((a, b) => b.p - a.p);
  if (col.length < 2) return null;
  const lnp = col.map((e) => Math.log(e.p));
  const at = (p, k) => {                                     // the column's value at p, linear in ln p
    const x = Math.log(p);
    let i = 0;
    while (i < col.length - 2 && lnp[i + 1] > x) i++;
    const f = (x - lnp[i]) / (lnp[i + 1] - lnp[i]);
    return col[i][k] + (col[i + 1][k] - col[i][k]) * f;
  };
  const moist = col.slice(1).find((e) => Number.isFinite(e.RH)) ?? col.find((e) => Number.isFinite(e.RH));
  if (!moist) return null;
  const w = wsat(moist.T + 273.15, moist.p) * (moist.RH / 100);
  const p0 = col[0].p, t0 = col[0].T + dT + 273.15, theta = t0 * Math.pow(1000 / p0, KAPPA);
  const e0 = (w * p0) / (EPS + w), td0 = (243.5 * Math.log(e0 / 6.112)) / (17.67 - Math.log(e0 / 6.112));
  const pTop = col[col.length - 1].p;
  let tk = t0, sat = wsat(t0, p0) <= w, lcl = sat ? { p: p0, z: col[0].z, T: t0 - 273.15 } : null;
  const path = [];
  for (let p = p0; p >= pTop - 1e-9; p -= dp) {
    if (p !== p0) {
      if (!sat) {
        tk = theta * Math.pow(p / 1000, KAPPA);
        if (wsat(tk, p) <= w) { sat = true; lcl = { p, z: at(p, "z"), T: tk - 273.15 }; }
      } else {
        const k1 = moistSlope(tk, p + dp), k2 = moistSlope(tk - k1 * dp, p);   // Heun, stepping up (p falls)
        tk -= ((k1 + k2) / 2) * dp;
      }
    }
    const te = at(p, "T");
    path.push({ p, z: at(p, "z"), T: tk - 273.15, Te: te, buoy: tk - 273.15 - te });
  }
  // buoyancy: the free convection level (first buoyant above the cloud base), the equilibrium level (where
  // it turns cold again), and the energy in between (CAPE) and below (CIN)
  let lfc = null, el = null, cape = 0, cin = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dz = b.z - a.z, bm = (a.buoy + b.buoy) / 2, tem = (a.Te + b.Te) / 2 + 273.15;
    const e = (G * bm * dz) / tem;
    if (!lfc && lcl && b.p <= lcl.p && b.buoy > 0) lfc = { p: b.p, z: b.z };
    if (lfc && !el && b.buoy <= 0 && a.buoy > 0) el = { p: b.p, z: b.z };
    if (lfc && !el && e > 0) cape += e;
    if (!lfc && e < 0) cin += e;
  }
  if (lfc && !el) el = { p: path[path.length - 1].p, z: path[path.length - 1].z };
  // the lid: the lowest layer above the ground where the air warms with height (an inversion), else the most stable within 5 km
  let inversion = null, best = null;
  for (let i = 0; i < col.length - 1 && col[i].z < col[0].z + 5000; i++) {
    const lapse = (-(col[i + 1].T - col[i].T) / (col[i + 1].z - col[i].z)) * 1000;
    if (lapse < 0 && !inversion) inversion = { base: col[i].z, top: col[i + 1].z, lapse };
    if (lapse < 3 && (!best || lapse < best.lapse)) best = { base: col[i].z, top: col[i + 1].z, lapse };
  }
  return {
    path, start: { T: t0 - 273.15, Td: td0, w }, lcl, lfc, el, cape: Math.round(cape), cin: Math.round(cin),
    top: el ? el.z : null, stable: !lfc, inversion: inversion ?? best,
  };
}
