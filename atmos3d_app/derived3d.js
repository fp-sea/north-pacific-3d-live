// Quantities derived from the model's levels for the 3-D tab's region (user
// request, 2026-09-29: "vorticity, turbulence, lift..."), computed on the
// grid at every level from its wind, temperature and height, then filled
// between the levels like every other quantity (section.js, volume.js):
//
//   vort  relative vorticity, 1e-5 /s: dv/dx - du/dy + (u/R) tan(lat)
//         (+ = cyclonic, counter-clockwise in the northern hemisphere)
//   div   divergence, 1e-5 /s: du/dx + dv/dy - (v/R) tan(lat)
//         (+ = air spreading out; - = converging)
//   ti    turbulence index, 1e-7 /s^2: Ellrod's TI1 = vertical wind shear x
//         deformation (the clear-air-turbulence index aviation forecasters
//         use; about 4 light-moderate, 8 moderate, 12+ severe)
//   stab  static stability, K per km: d(theta)/dz (about 3-5 in the
//         troposphere, 10+ above the tropopause, near 0 where air can overturn)
//   ri    Richardson number of the layer (user request 2026-09-30, vertical
//         mixing): (g/theta) dtheta/dz / |dV/dz|^2, stability against shear.
//         Below about 0.25 shear wins and the layer can overturn into
//         turbulence (Kelvin-Helmholtz waves, clear-air turbulence, mixing);
//         above about 1 it stays smooth; negative where theta falls with
//         height (convection). Clamped to -5..20 (calm layers go to infinity).
// From the sibling opc-sa-reconstruct project's front diagnostics (user
// request, 2026-09-29), here at every level rather than only 850 mb:
//   thetae  equivalent potential temperature, K (Bolton 1980): air masses
//           with their moisture counted in
//   grad    |grad theta|, K per 100 km: the thermal gradient that defines a
//           front zone (NWS Unified Surface Analysis Manual)
//   fgen    kinematic frontogenesis, K per 100 km per 3 h:
//           -(1/|grad th|)[th_x (u_x th_x + v_x th_y) + th_y (u_y th_x + v_y th_y)]
//           (+ the gradient is being sharpened -- a front forming)
//
// Horizontal derivatives: centred differences on the grid (one-sided at its
// edges), x east and y north on the sphere (R cos(lat) dlon, R dlat). Vertical
// ones: between the neighbouring levels above and below (one-sided at the
// ends), by their real heights. Pure, no imports: node --test loads it.

const R = 6371000, DEG = Math.PI / 180, KAPPA = 0.2857, G = 9.80665, RD = 287.05;
const clampRi = (x) => (Number.isFinite(x) ? Math.max(-5, Math.min(20, x)) : NaN);

// Richardson number from two layers' potential temperatures (K), their height apart (m, up) and
// wind difference (m/s). A floor of 0.5 m/s on the shear keeps calm layers finite.
export function richardson(thLow, thHigh, dz, du, dv) {
  if (!(dz > 0)) return NaN;
  return clampRi((G * (thHigh - thLow) * dz) / (0.5 * (thLow + thHigh) * Math.max(0.25, du * du + dv * dv)));
}

// The bulk Richardson number from the ground up to pressure level p (hPa): the ground's air from
// the 2 m temperature (K), surface pressure (Pa) and 10 m wind; the level's temperature (K) and
// wind; the depth between them from the hypsometric equation (mean temperature of the two). NaN
// where the level is below the ground. Weather models find the top of the mixed boundary layer
// roughly where this climbs past a critical value of about 0.25.
export function bulkRichardson(t2m, psfc, u10, v10, t, u, v, p) {
  const pa = p * 100;
  if (!(psfc > pa)) return NaN;
  const dz = ((RD * 0.5 * (t2m + t)) / G) * Math.log(psfc / pa);
  return richardson(t2m * Math.pow(1e5 / psfc, KAPPA), t * Math.pow(1000 / p, KAPPA), dz, u - u10, v - v10);
}

// f(j, i) derivative along x (east) and y (north) of a row-major field.
function grads(a, grid) {
  const { nlat, nlon, lat0, dlat, dlon } = grid, n = nlat * nlon;
  const dx = new Float32Array(n), dy = new Float32Array(n);
  for (let j = 0; j < nlat; j++) {
    const lat = (lat0 + j * dlat) * DEG, mx = R * Math.cos(lat) * dlon * DEG, my = R * dlat * DEG;
    for (let i = 0; i < nlon; i++) {
      const k = j * nlon + i;
      const i0 = i > 0 ? i - 1 : i, i1 = i < nlon - 1 ? i + 1 : i;
      const j0 = j > 0 ? j - 1 : j, j1 = j < nlat - 1 ? j + 1 : j;
      dx[k] = (a[j * nlon + i1] - a[j * nlon + i0]) / ((i1 - i0) * mx);
      dy[k] = (a[j1 * nlon + i] - a[j0 * nlon + i]) / ((j1 - j0) * my);
    }
  }
  return { dx, dy };
}

// Bolton's (1980) equivalent potential temperature, K: t in K, rh in %, p in hPa.
export function thetaE(t, rh, p) {
  const tc = t - 273.15, es = 6.112 * Math.exp((17.67 * tc) / (tc + 243.5)), e = Math.max(1e-6, (rh / 100) * es);
  const r = (0.622 * e) / (p - e), tl = 1 / (1 / (t - 55) - Math.log(Math.max(1e-6, rh / 100)) / 2840) + 55;
  return t * Math.pow(1000 / p, 0.2854 * (1 - 0.28 * r)) * Math.exp((3.376 / tl - 0.00254) * r * 1000 * (1 + 0.81e-3 * r * 1000));
}

// Thermal gradient (K / 100 km) and frontogenesis (K / 100 km / 3 h) of theta under the wind.
export function frontal(theta, u, v, grid) {
  const n = theta.length, T = grads(theta, grid), U = grads(u, grid), V = grads(v, grid);
  const grad = new Float32Array(n), fgen = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const tx = T.dx[k], ty = T.dy[k], g = Math.hypot(tx, ty);
    grad[k] = g * 1e5;
    const f = g > 1e-12 ? -(tx * (U.dx[k] * tx + V.dx[k] * ty) + ty * (U.dy[k] * tx + V.dy[k] * ty)) / g : 0;   // K/m/s
    fgen[k] = f * 1e5 * 10800;
  }
  return { grad, fgen };
}

// One level's horizontal quantities: {vort, div, def} (vort, div in 1e-5 /s; def in /s).
export function horizontal(u, v, grid) {
  const { nlat, nlon, lat0, dlat } = grid, n = nlat * nlon;
  const U = grads(u, grid), V = grads(v, grid);
  const vort = new Float32Array(n), div = new Float32Array(n), def = new Float32Array(n);
  for (let j = 0; j < nlat; j++) {
    const t = Math.tan((lat0 + j * dlat) * DEG) / R;
    for (let i = 0; i < nlon; i++) {
      const k = j * nlon + i;
      vort[k] = (V.dx[k] - U.dy[k] + u[k] * t) * 1e5;
      div[k] = (U.dx[k] + V.dy[k] - v[k] * t) * 1e5;
      def[k] = Math.hypot(U.dx[k] - V.dy[k], V.dx[k] + U.dy[k]);
    }
  }
  return { vort, div, def };
}

// A step's levels with the derived quantities added (new objects; the input
// is not changed). data: {levels: {p: {gh, t, u, v, ...}}}.
export function withDerived(data, grid) {
  const ps = Object.keys(data.levels).map(Number).sort((a, b) => b - a);      // bottom (high p) first
  const n = grid.nlat * grid.nlon, out = {}, H = {};
  for (const p of ps) H[p] = horizontal(data.levels[p].u, data.levels[p].v, grid);
  ps.forEach((p, i) => {
    const L = data.levels[p], a = data.levels[ps[Math.max(0, i - 1)]], b = data.levels[ps[Math.min(ps.length - 1, i + 1)]];
    const pa = ps[Math.max(0, i - 1)], pb = ps[Math.min(ps.length - 1, i + 1)];
    const ti = new Float32Array(n), stab = new Float32Array(n), ri = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const dz = b.gh[k] - a.gh[k];                                      // metres, upward
      const vws = Math.hypot(b.u[k] - a.u[k], b.v[k] - a.v[k]) / dz;      // /s
      ti[k] = vws * H[p].def[k] * 1e7;
      const thA = a.t[k] * Math.pow(1000 / pa, KAPPA), thB = b.t[k] * Math.pow(1000 / pb, KAPPA);
      stab[k] = ((thB - thA) / dz) * 1000;                               // K per km
    }
    // Ri over the thinner layer from this level to the next one up (the top level: to the one below):
    // across two layers, as for stab and ti, the shear is diluted and Ri reads even higher.
    const [lo, hi, plo, phi] = i < ps.length - 1 ? [L, b, p, pb] : [a, L, pa, p];
    for (let k = 0; k < n; k++)
      ri[k] = richardson(lo.t[k] * Math.pow(1000 / plo, KAPPA), hi.t[k] * Math.pow(1000 / phi, KAPPA), hi.gh[k] - lo.gh[k], hi.u[k] - lo.u[k], hi.v[k] - lo.v[k]);
    const theta = new Float32Array(n), thetae = new Float32Array(n);
    for (let k = 0; k < n; k++) { theta[k] = L.t[k] * Math.pow(1000 / p, KAPPA); thetae[k] = L.r ? thetaE(L.t[k], L.r[k], p) : NaN; }
    const F = frontal(theta, L.u, L.v, grid);
    out[p] = { ...L, vort: H[p].vort, div: H[p].div, ti, stab, ri, thetae, grad: F.grad, fgen: F.fgen };
  });
  return { ...data, levels: out };
}
