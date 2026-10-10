// The Simulate mode's 3-D model (stage 4, docs/atmospheric_circulation_reference.md
// section 9.3): a dry global atmosphere on the sphere that makes its own storms.
//
// The idealised setup climate scientists use to compare model cores (Held &
// Suarez 1994, "HS" below): the hydrostatic primitive equations on sigma
// levels (sigma = pressure / surface pressure), no moisture, no land yet,
// forced only by
//   - Newtonian heating and cooling toward a radiative-equilibrium temperature
//     (fast near the tropical ground, slow aloft: 4 to 40 days), and
//   - Rayleigh friction in the boundary layer (sigma > 0.7, 1 day at the ground).
// HS's equilibrium uses a fixed sin^2(lat) heating; here its surface part
// comes from the same sunlight as the 2-D model (sim2d.js insolation and
// albedo, so tilt and season work), lagged by a surface heat-storage time.
//
// Land (optional, stage 4c; off = HS's ocean planet): a land fraction per
// grid box (landmask.js, Natural Earth). Land stores little heat, so its
// surface temperature follows the Sun within landDays; the sea takes
// seaDays (an upper ocean responds over months; the storage time is the
// land-sea blend, as heat capacity adds). Over land the air near the ground
// is tied to the surface at every latitude (HS weakens that coupling toward
// the poles by cos^4 lat, fine for an ocean planet, but land surfaces warm
// and chill the air above them strongly). Land is rougher: boundary-layer
// friction x1.6 over land, x0.8 over sea. There's no moisture, so this is the continents' seasonal heating
// and drag, not their deserts, rain or snow.
//
// Numerics: spectral transform (sht.js), triangular truncation T21 on a 64 x 32
// Gaussian grid by default; vorticity, divergence, temperature per level and
// ln(surface pressure); Wicker-Skamarock RK3 in time (explicit: dt <= ~1200 s
// at T21); del^8 hyperdiffusion applied implicitly each step.
// Vertical: Lorenz grid, simple centred differences (after Hoskins & Simmons
// 1975, without their energy-conserving refinements; ample for a teaching model).
//
// Pure except for its imports: node --test loads it.
import { makeSHT } from "./sht.js?v=20261010090011";
import { albedo, declination, insolation } from "./sim2d.js?v=20261010090011";

const R = 287.04, CP = 1004.6, KAPPA = R / CP, G = 9.80616, P0 = 1e5, DAY = 86400;
export const PE_EARTH = { omega: 7.292e-5 };

export const PE_DEFAULTS = {
  rotation: 1, tilt: 23.44, day: 80, seasons: false, inertiaDays: 30,
  contrastK: 60,        // HS's delta T_y: equator minus pole at the ground in equilibrium (equinox)
  stabilityK: 10,       // HS's delta theta_z
  tauAirDays: 40, tauSfcDays: 4, tauFricDays: 1, sigmaB: 0.7,
  hyperDays: 0.5,       // e-folding time of the smallest scale under del^8
  land: false, landDays: 5, seaDays: 100, landDrag: 1.6, seaDrag: 0.8,
};

// Levels: sigma at full levels (L equally spaced layers).
export function makePE({ nt = 21, nlon = 64, nlat = 32, L = 8, land = null } = {}) {
  const T = makeSHT(nt, nlon, nlat);
  const sh = Float64Array.from({ length: L + 1 }, (_, k) => k / L);            // half levels, top 0 .. bottom 1
  const sf = Float64Array.from({ length: L }, (_, k) => (sh[k] + sh[k + 1]) / 2);
  const ds = Float64Array.from({ length: L }, (_, k) => sh[k + 1] - sh[k]);
  const S = () => T.spec(), Gd = () => T.grid();
  const s = {
    T, L, sh, sf, ds, t: 0, day: 80,
    zeta: Array.from({ length: L }, S), div: Array.from({ length: L }, S), temp: Array.from({ length: L }, S), lnps: S(),
    Ts: new Float64Array(nlat * nlon),                                           // the lagged surface equilibrium temperature per grid box
    land: land ?? new Float64Array(nlat * nlon),                                 // land fraction per grid box (landmask.js); used when params.land
    // grid work arrays (per level)
    g: { U: Array.from({ length: L }, Gd), V: Array.from({ length: L }, Gd), Tg: Array.from({ length: L }, Gd), Z: Array.from({ length: L }, Gd), D: Array.from({ length: L }, Gd),
      FU: Gd(), FV: Gd(), E: Gd(), TU: Gd(), TV: Gd(), X: Gd(), Y: Gd(), q: Gd(), sdot: Array.from({ length: L + 1 }, Gd), vgq: Array.from({ length: L }, Gd), phi: Array.from({ length: L }, Gd), heat: Gd() },
  };
  return s;
}

// The surface equilibrium temperature (K) at each Gaussian latitude for a declination: 315 K at the
// equator at an equinox, minus the contrast times the missing (absorbed) sunlight, as in sim2d.js.
function surfaceEq(s, p, dec, out) {
  const norm = 1 - albedo(0);
  for (let j = 0; j < s.T.nlat; j++) {
    const L = (s.T.lat[j] * 180) / Math.PI, q = (insolation(L, dec) * (1 - albedo(L))) / norm;
    out[j] = 315 - p.contrastK * (1 - q);
  }
  return out;
}

// HS equilibrium temperature at sigma (surface pressure p0), grid box q in row j.
function teq(s, p, j, q, sig) {
  const mu = s.T.mu[j], c2 = 1 - mu * mu;
  return Math.max(200, (s.Ts[q] - p.stabilityK * Math.log(sig) * c2) * Math.pow(sig, KAPPA));
}
// Put land in (a fraction per grid box) or take it out (null).
export function setLand(s, frac) { if (frac) s.land.set(frac); else s.land.fill(0); return s; }

// Start at rest in radiative equilibrium, with a small random temperature disturbance low down
// (the seed the storms grow from: a perfectly symmetric start would stay symmetric).
export function initPE(s, params = {}, seed = 1, noiseK = 0.5) {
  const p = { ...PE_DEFAULTS, ...params }, T = s.T, { nlat, nlon } = T;
  s.day = p.day; s.t = 0;
  const eq = surfaceEq(s, p, declination(p.day, p.tilt), new Float64Array(nlat));
  for (let j = 0; j < nlat; j++) s.Ts.fill(eq[j], j * nlon, (j + 1) * nlon);
  let r = seed;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647 - 0.5);
  const g = T.grid();
  for (let k = 0; k < s.L; k++) {
    for (let j = 0; j < nlat; j++) for (let i = 0; i < nlon; i++) g[j * nlon + i] = teq(s, p, j, j * nlon + i, s.sf[k]) + (s.sf[k] > 0.6 ? noiseK * rnd() : 0);
    T.analyze(g, s.temp[k]);
    for (const a of [s.zeta[k], s.div[k]]) { a.re.fill(0); a.im.fill(0); }
  }
  s.lnps.re.fill(0); s.lnps.im.fill(0);
  s.lnps.re[0] = Math.log(P0) * Math.SQRT2;                  // the n = 0 coefficient of a constant c is c * sqrt(2)
  return s;
}

// Tendencies of every spectral variable (into d*), evaluated from the state (z, dv, tp, lq).
function tendencies(s, p, z, dv, tp, lq, dz, dd, dt_, dq) {
  const T = s.T, { nlat, nlon } = T, L = s.L, n = nlat * nlon, g = s.g, Om = PE_EARTH.omega * p.rotation;
  // grids
  for (let k = 0; k < L; k++) { T.uv(z[k], dv[k], g.U[k], g.V[k]); T.synth(tp[k], g.Tg[k]); T.synth(z[k], g.Z[k]); T.synth(dv[k], g.D[k]); }
  T.grad(lq, g.X, g.Y);
  // v . grad q and the vertical velocity sigma-dot at half levels; d(lnps)/dt on the grid
  const dqg = g.q; dqg.fill(0);
  for (let k = 0; k < L; k++) {
    const U = g.U[k], V = g.V[k], vq = g.vgq[k], D = g.D[k];
    for (let j = 0; j < nlat; j++) { const c = 1 / (1 - T.mu[j] * T.mu[j]); for (let i = 0; i < nlon; i++) { const q = j * nlon + i; vq[q] = (U[q] * g.X[q] + V[q] * g.Y[q]) * c; dqg[q] -= (D[q] + vq[q]) * s.ds[k]; } }
  }
  g.sdot[0].fill(0); g.sdot[L].fill(0);
  for (let k = 1; k < L; k++) {
    const a = g.sdot[k], b = g.sdot[k - 1], D = g.D[k - 1], vq = g.vgq[k - 1];
    for (let q = 0; q < n; q++) a[q] = (k === 1 ? 0 : b[q] + s.sh[k - 1] * dqg[q]) - (D[q] + vq[q]) * s.ds[k - 1] - s.sh[k] * dqg[q];
  }
  // (the recurrence above: sdot_{k+1/2} = -sigma_{k+1/2} dq/dt - sum_{i<=k} (D_i + v_i.grad q) ds_i)
  T.analyze(dqg, dq);
  // hydrostatic geopotential at full levels (no mountains yet)
  for (let k = L - 1; k >= 0; k--) {
    const ph = g.phi[k], Tk = g.Tg[k];
    if (k === L - 1) for (let q = 0; q < n; q++) ph[q] = R * Tk[q] * Math.log(1 / s.sf[k]);
    else { const Tb = g.Tg[k + 1], pb = g.phi[k + 1], lr = Math.log(s.sf[k + 1] / s.sf[k]); for (let q = 0; q < n; q++) ph[q] = pb[q] + 0.5 * R * (Tk[q] + Tb[q]) * lr; }
  }
  const cosLat2 = Float64Array.from(T.mu, (m) => 1 - m * m);
  for (let k = 0; k < L; k++) {
    const U = g.U[k], V = g.V[k], Z = g.Z[k], Tk = g.Tg[k], up = g.sdot[k], dn = g.sdot[k + 1];
    const Ua = k > 0 ? g.U[k - 1] : U, Ub = k < L - 1 ? g.U[k + 1] : U, Va = k > 0 ? g.V[k - 1] : V, Vb = k < L - 1 ? g.V[k + 1] : V;
    const Ta = k > 0 ? g.Tg[k - 1] : Tk, Tb = k < L - 1 ? g.Tg[k + 1] : Tk, h2 = 1 / (2 * s.ds[k]);
    const sig = s.sf[k], kv = Math.max(0, (sig - p.sigmaB) / (1 - p.sigmaB)) / (p.tauFricDays * DAY);
    const heat = g.heat;
    for (let j = 0; j < nlat; j++) {
      const f = 2 * Om * T.mu[j], c2 = cosLat2[j];
      const ka = 1 / (p.tauAirDays * DAY), kbl = (1 / (p.tauSfcDays * DAY) - ka) * Math.max(0, (sig - p.sigmaB) / (1 - p.sigmaB)), kt = ka + kbl * c2 * c2;
      for (let i = 0; i < nlon; i++) {
        const q = j * nlon + i, eta = Z[q] + f, te = teq(s, p, j, q, sig), lf = p.land ? s.land[q] : 0, ktq = kt + lf * kbl * (1 - c2 * c2);
        const kvq = p.land ? kv * (p.seaDrag + (p.landDrag - p.seaDrag) * s.land[q]) : kv;
        const vU = (dn[q] * (Ub[q] - U[q]) + up[q] * (U[q] - Ua[q])) * h2, vV = (dn[q] * (Vb[q] - V[q]) + up[q] * (V[q] - Va[q])) * h2;
        g.FU[q] = eta * V[q] - vU - R * Tk[q] * g.X[q] - kvq * U[q];
        g.FV[q] = -eta * U[q] - vV - R * Tk[q] * g.Y[q] - kvq * V[q];
        g.E[q] = g.phi[k][q] + (U[q] * U[q] + V[q] * V[q]) / (2 * c2);
        g.TU[q] = U[q] * Tk[q]; g.TV[q] = V[q] * Tk[q];
        // omega/p at the full level: v.grad q minus the column's divergence above (to mid-layer), over sigma
        let acc = 0;
        for (let i2 = 0; i2 < k; i2++) acc += (g.D[i2][q] + g.vgq[i2][q]) * s.ds[i2];
        acc += 0.5 * (g.D[k][q] + g.vgq[k][q]) * s.ds[k];
        const omp = g.vgq[k][q] - acc / sig;
        const vT = (dn[q] * (Tb[q] - Tk[q]) + up[q] * (Tk[q] - Ta[q])) * h2;
        heat[q] = Tk[q] * g.D[k][q] - vT + KAPPA * Tk[q] * omp - ktq * (Tk[q] - te);
      }
    }
    const dc = T.divCurl(g.FU, g.FV);
    const Es = T.analyze(g.E);
    for (let c = 0; c < T.ncoef; c++) {
      dz[k].re[c] = dc.curl.re[c]; dz[k].im[c] = dc.curl.im[c];
      const l = T.nn1[c] / (T.a * T.a);
      dd[k].re[c] = dc.div.re[c] + l * Es.re[c]; dd[k].im[c] = dc.div.im[c] + l * Es.im[c];
    }
    const tf = T.divCurl(g.TU, g.TV).div, hs = T.analyze(heat);
    for (let c = 0; c < T.ncoef; c++) { dt_[k].re[c] = hs.re[c] - tf.re[c]; dt_[k].im[c] = hs.im[c] - tf.im[c]; }
  }
}

function copySpec(dst, src) { dst.re.set(src.re); dst.im.set(src.im); }

// Advance by dt seconds (RK3, Wicker-Skamarock), then hyperdiffusion; seasons move the day.
export function stepPE(s, params = {}, dt = 900) {
  const p = { ...PE_DEFAULTS, ...params }, T = s.T, L = s.L;
  if (p.seasons) s.day = ((((s.day ?? p.day) + dt / DAY - 1) % 365) + 365) % 365 + 1; else s.day = p.day;
  const target = surfaceEq(s, p, declination(s.day, p.tilt), new Float64Array(T.nlat)), nlon = T.nlon;
  for (let j = 0; j < T.nlat; j++) for (let i = 0; i < nlon; i++) {
    const q = j * nlon + i, f = p.land ? s.land[q] : 0, tau = (p.land ? f * p.landDays + (1 - f) * p.seaDays : p.inertiaDays) * DAY;
    s.Ts[q] += (target[j] - s.Ts[q]) * Math.min(1, dt / tau);
  }
  const W = s._w ?? (s._w = (() => {
    const mk = () => Array.from({ length: L }, () => T.spec());
    return { z0: mk(), d0: mk(), t0: mk(), q0: T.spec(), z1: mk(), d1: mk(), t1: mk(), q1: T.spec(), dz: mk(), dd: mk(), dt: mk(), dq: T.spec() };
  })());
  for (let k = 0; k < L; k++) { copySpec(W.z0[k], s.zeta[k]); copySpec(W.d0[k], s.div[k]); copySpec(W.t0[k], s.temp[k]); }
  copySpec(W.q0, s.lnps);
  let cz = s.zeta, cd = s.div, ct = s.temp, cq = s.lnps;
  for (const frac of [1 / 3, 1 / 2, 1]) {
    tendencies(s, p, cz, cd, ct, cq, W.dz, W.dd, W.dt, W.dq);
    const h = frac * dt;
    for (let k = 0; k < L; k++) for (const [o, a, d] of [[W.z1[k], W.z0[k], W.dz[k]], [W.d1[k], W.d0[k], W.dd[k]], [W.t1[k], W.t0[k], W.dt[k]]])
      for (let c = 0; c < T.ncoef; c++) { o.re[c] = a.re[c] + h * d.re[c]; o.im[c] = a.im[c] + h * d.im[c]; }
    for (let c = 0; c < T.ncoef; c++) { W.q1.re[c] = W.q0.re[c] + h * W.dq.re[c]; W.q1.im[c] = W.q0.im[c] + h * W.dq.im[c]; }
    cz = W.z1; cd = W.d1; ct = W.t1; cq = W.q1;
  }
  // del^8 hyperdiffusion, implicit: the smallest scale decays in hyperDays
  const nmax = T.nt * (T.nt + 1), kd = 1 / (p.hyperDays * DAY);
  for (let k = 0; k < L; k++) {
    for (let c = 0; c < T.ncoef; c++) {
      const f = 1 / (1 + dt * kd * Math.pow(T.nn1[c] / nmax, 4));
      s.zeta[k].re[c] = W.z1[k].re[c] * f; s.zeta[k].im[c] = W.z1[k].im[c] * f;
      s.div[k].re[c] = W.d1[k].re[c] * f; s.div[k].im[c] = W.d1[k].im[c] * f;
      const ft = c === 0 ? 1 : f;
      s.temp[k].re[c] = W.t1[k].re[c] * ft; s.temp[k].im[c] = W.t1[k].im[c] * ft;
    }
  }
  copySpec(s.lnps, W.q1);
  s.t += dt;
  return s;
}

// Zonal means for the charts and tests: u (m/s) and T (K) per level and latitude, the mean
// meridional mass streamfunction (kg/s) at half levels, surface pressure extremes, eddy KE.
export function peDiagnostics(s) {
  const T = s.T, { nlat, nlon } = T, L = s.L;
  const U = T.grid(), V = T.grid(), Tg = T.grid(), ps = T.synth(s.lnps);
  const ubar = new Float64Array(L * nlat), vbar = new Float64Array(L * nlat), tbar = new Float64Array(L * nlat);
  let eke = 0, pmin = Infinity, pmax = -Infinity, wsum = 0;
  const psbar = new Float64Array(nlat);
  for (let j = 0; j < nlat; j++) for (let i = 0; i < nlon; i++) { const v = Math.exp(ps[j * nlon + i]); ps[j * nlon + i] = v; psbar[j] += v / nlon; pmin = Math.min(pmin, v); pmax = Math.max(pmax, v); }
  for (let k = 0; k < L; k++) {
    T.uv(s.zeta[k], s.div[k], U, V); T.synth(s.temp[k], Tg);
    for (let j = 0; j < nlat; j++) {
      const c = Math.sqrt(1 - T.mu[j] * T.mu[j]);
      let su = 0, sv = 0, st = 0;
      for (let i = 0; i < nlon; i++) { const q = j * nlon + i; su += U[q] / c; sv += V[q] / c; st += Tg[q]; }
      su /= nlon; sv /= nlon; st /= nlon;
      ubar[k * nlat + j] = su; vbar[k * nlat + j] = sv; tbar[k * nlat + j] = st;
      for (let i = 0; i < nlon; i++) { const q = j * nlon + i, du = U[q] / c - su, dv = V[q] / c - sv; eke += 0.5 * (du * du + dv * dv) * T.w[j] * s.ds[k]; }
      if (k === 0) wsum += T.w[j];
    }
  }
  eke /= wsum * nlon;
  // psi at half levels (k = 1..L-1), positive = clockwise looking east (northward flow aloft)... sign: psi_{k+1/2} = 2 pi a cos(lat) / g * sum_{i<=k} [v ps]_bar ds
  const psi = new Float64Array((L + 1) * nlat);
  for (let j = 0; j < nlat; j++) {
    const c = Math.sqrt(1 - T.mu[j] * T.mu[j]);
    let acc = 0;
    for (let k = 0; k < L; k++) { acc += vbar[k * nlat + j] * psbar[j] * s.ds[k]; psi[(k + 1) * nlat + j] = (2 * Math.PI * T.a * c * acc) / G; }
  }
  return { ubar, vbar, tbar, psi, psbar, eke, psMin: pmin, psMax: pmax, lat: T.lat, sf: s.sf, sh: s.sh, days: s.t / DAY, day: s.day };
}

// A compact copy of the state (spectral coefficients to 6 significant figures), and back: the page
// starts from a spun-up state instead of waiting minutes for the storms to grow (pe3d_spinup.js).
export function peState(s, meta = {}) {
  const r = (a) => Array.from(a, (x) => +x.toPrecision(6));
  const sp = (x) => [r(x.re), r(x.im)];
  return { nt: s.T.nt, nlon: s.T.nlon, nlat: s.T.nlat, L: s.L, t: s.t, day: s.day, Ts: r(s.Ts),
    zeta: s.zeta.map(sp), div: s.div.map(sp), temp: s.temp.map(sp), lnps: sp(s.lnps), ...meta };
}
export function loadPEState(s, o) {
  if (o.nt !== s.T.nt || o.L !== s.L || o.nlat !== s.T.nlat || o.nlon !== s.T.nlon) throw new Error("state resolution differs from the model's");
  const put = (dst, [re, im]) => { dst.re.set(re); dst.im.set(im); };
  for (let k = 0; k < s.L; k++) { put(s.zeta[k], o.zeta[k]); put(s.div[k], o.div[k]); put(s.temp[k], o.temp[k]); }
  put(s.lnps, o.lnps); s.t = o.t; s.day = o.day;
  if (o.Ts.length === s.Ts.length) s.Ts.set(o.Ts);                     // a zonal Ts (one per row) from an older state: spread along the rows
  else for (let j = 0; j < s.T.nlat; j++) s.Ts.fill(o.Ts[j], j * s.T.nlon, (j + 1) * s.T.nlon);
  return s;
}
