// The Simulate mode's first model (user request, 2026-09-30; docs/
// atmospheric_circulation_reference.md sections 10 and 12, option B): the
// atmosphere averaged round each latitude circle, on a latitude-height grid,
// driven by sunlight and nothing else. It is enough to show, from physics
// rather than drawings, why air moves at all (stage 0), the single overturning
// cell of a non-rotating planet (stage 1), how rotation turns it into a
// Hadley cell with easterly trades below and a westerly jet above (stage 2),
// and how tilt and the seasons move it all (stage 3). Storms, the Ferrel cell,
// land and the Walker circulation need the 3-D model that comes later.
//
// Equations (zonally symmetric, hydrostatic, Boussinesq, on the sphere):
//   du/dt  = (f + u tan(lat)/a) v - u/tau_f(z) + diffusion
//   the meridional circulation through a streamfunction psi (mass conserved
//   exactly: v cos(lat) = dpsi/dz, w cos(lat) = -(1/a) dpsi/dlat, psi = 0 at
//   the ground, the lid and the poles), predicted through q = dv/dz:
//   dq/dt  = -(1/a) db/dlat - d/dz[(f + u tan(lat)/a) u] - d/dz(v/tau_f) + diffusion
//   dth/dt = -(th - th_eq)/tau_rad + diffusion, advected by (v, w)
// with b = g (th - th0)/th0 the buoyancy. th_eq comes from the day's mean
// sunlight at each latitude (the reference's formula), through a surface
// layer whose heat capacity sets the seasonal lag (thermal inertia), plus a
// fixed static stability. Grid: 2 deg x 1 km, 0-16 km; RK3 time stepping.
//
// Pure, no imports: node --test loads it.

export const EARTH = { a: 6.371e6, g: 9.81, omega: 7.292e-5, th0: 300 };
const D2R = Math.PI / 180;

// Default settings (reference section 12: Held-Hou / Held-Suarez-like values).
export const DEFAULTS = {
  rotation: 1,          // x Earth's rotation rate (0: none; negative: backwards)
  tilt: 23.44,          // axial tilt, degrees
  day: 80,              // day of the year (80: March equinox)
  seasons: false,       // true: the day advances with the model's time
  contrastK: 60,        // equator-to-pole contrast of the equilibrium temperature at an equinox, K
  stabilityK: 45,       // equilibrium potential-temperature increase from the ground to 16 km, K
  inertiaDays: 30,      // surface layer's response time (thermal inertia; ~a mixed-layer ocean)
  tauRadDays: 10,       // radiative relaxation time (10 days: a clearer circulation than Held-Hou's 20; dry models run weak)
  tauFricDays: 1,       // surface friction time (lowest 1.5 km)
  tropopauseKm: 11,     // above it the equator-to-pole contrast fades (a stratosphere; Held-Suarez does the same with pressure)
  kh: 2e4, kz: 0.5,     // smoothing (horizontal, vertical diffusion, m^2/s): numerical, kept small
};

// Declination of the Sun (degrees) on a day of the year for a tilt (reference section 1).
export function declination(day, tilt) {
  return tilt * Math.sin((2 * Math.PI * (day - 80)) / 365);
}

// Daily-mean top-of-atmosphere sunlight at a latitude and declination (degrees),
// relative to the equator at an equinox (= 1): h0 sin(lat) sin(dec) + cos(lat) cos(dec) sin(h0),
// cos(h0) = -tan(lat) tan(dec), clamped for polar day and night (reference section 10, stage 0).
export function insolation(latDeg, decDeg) {
  const p = latDeg * D2R, d = decDeg * D2R, c = -Math.tan(p) * Math.tan(d);
  const h0 = c >= 1 ? 0 : c <= -1 ? Math.PI : Math.acos(c);
  return Math.max(0, h0 * Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.sin(h0));
}

export function makeSim({ nlat = 90, nz = 16, H = 16000 } = {}) {
  const dphi = Math.PI / nlat, dz = H / nz;
  const lat = Float64Array.from({ length: nlat }, (_, j) => -Math.PI / 2 + (j + 0.5) * dphi);
  const latE = Float64Array.from({ length: nlat + 1 }, (_, j) => -Math.PI / 2 + j * dphi);
  const zc = Float64Array.from({ length: nz }, (_, k) => (k + 0.5) * dz);
  const C = nlat * nz, E = (nlat + 1) * (nz + 1);
  const s = {
    nlat, nz, H, dphi, dz, lat, latE, zc, t: 0,
    u: new Float64Array(C), th: new Float64Array(C), q: new Float64Array(E),
    psi: new Float64Array(E), v: new Float64Array((nlat + 1) * nz), w: new Float64Array(nlat * (nz + 1)),
    Ts: new Float64Array(nlat), thEq: new Float64Array(C),
  };
  return s;
}

// The surface layer's target temperature (K) at each latitude for a declination:
// th0 + contrast x (sunlight relative to the equinox equator, minus its area mean).
// The share of sunlight reflected (albedo): about 0.25 in the tropics rising to 0.6 at the
// poles (ice, snow, cloud; reference section 1). Without it the June pole, which gets more
// daily sunlight than the equator, became the model's hottest place.
export function albedo(latDeg) { return 0.25 + 0.35 * Math.pow(Math.abs(Math.sin(latDeg * D2R)), 3); }
function surfaceTarget(s, p, dec, out) {
  let sum = 0, wsum = 0;
  const norm = 1 - albedo(0);            // so the equator at an equinox still reads 1
  for (let j = 0; j < s.nlat; j++) { const L = s.lat[j] / D2R, q = insolation(L, dec) * (1 - albedo(L)) / norm, c = Math.cos(s.lat[j]); out[j] = q; sum += q * c; wsum += c; }
  const mean = sum / wsum;
  for (let j = 0; j < s.nlat; j++) out[j] = EARTH.th0 + p.contrastK * (out[j] - mean);
  return out;
}

function setThEq(s, p) {
  // The contrast (Ts's departure from th0) is full up to the tropopause and fades to zero 4 km above it.
  for (let k = 0; k < s.nz; k++) {
    // (reversing it above, for a warmer polar stratosphere, made a layer the model couldn't hold
    // stable; the sponge below keeps the jet off the lid instead)
    const zk = s.zc[k] / 1000, fade = zk <= p.tropopauseKm ? 1 : Math.max(0, 1 - (zk - p.tropopauseKm) / 3);
    for (let j = 0; j < s.nlat; j++)
      s.thEq[j * s.nz + k] = EARTH.th0 + (s.Ts[j] - EARTH.th0) * fade + p.stabilityK * (s.zc[k] / s.H - 0.5);
  }
}

// Start from rest at radiative equilibrium for the settings' day.
export function initSim(s, params = {}) {
  const p = { ...DEFAULTS, ...params };
  surfaceTarget(s, p, declination(p.day, p.tilt), s.Ts);
  setThEq(s, p);
  s.th.set(s.thEq); s.u.fill(0); s.q.fill(0); s.psi.fill(0); s.v.fill(0); s.w.fill(0);
  s.t = 0; s.day = p.day;
  return s;
}

// psi, v, w from q (a tridiagonal solve up each interior edge column).
function invert(s, q) {
  const { nlat, nz, dz, latE, lat, dphi, psi, v, w } = s, a = EARTH.a, N = nz + 1;
  const cp = new Float64Array(nz), dp = new Float64Array(nz);
  psi.fill(0);
  for (let j = 1; j < nlat; j++) {
    const c = Math.cos(latE[j]), base = j * N;
    // (psi[k+1] - 2 psi[k] + psi[k-1]) / dz^2 = c q[k], k = 1..nz-1, psi[0] = psi[nz] = 0
    for (let k = 1; k < nz; k++) {
      const rhs = c * q[base + k] * dz * dz, b = -2, lo = k === 1 ? 0 : 1;
      const m = b - lo * cp[k - 1];
      cp[k] = 1 / m;
      dp[k] = (rhs - lo * dp[k - 1]) / m;
    }
    psi[base + nz - 1] = dp[nz - 1];
    for (let k = nz - 2; k >= 1; k--) psi[base + k] = dp[k] - cp[k] * psi[base + k + 1];
  }
  for (let j = 0; j <= nlat; j++) {
    const c = Math.cos(latE[j]);
    for (let k = 0; k < nz; k++) v[j * nz + k] = j === 0 || j === nlat ? 0 : (psi[j * N + k + 1] - psi[j * N + k]) / dz / c;
  }
  for (let j = 0; j < nlat; j++) {
    const c = Math.cos(lat[j]);
    for (let k = 0; k <= nz; k++) w[j * N + k] = -(psi[(j + 1) * N + k] - psi[j * N + k]) / (a * dphi * c);
  }
}

// Tendencies of (u, th, q) at state (u, th, q), with v, w from q. (Per-row and per-level
// quantities are precomputed once per call: the same arithmetic, several times faster.)
function tendencies(s, p, u, th, q, du, dth, dq) {
  invert(s, q);
  const { nlat, nz, dz, dphi, lat, latE, v, w, thEq } = s, a = EARTH.a, g = EARTH.g, th0 = EARTH.th0, N = nz + 1;
  const om = EARTH.omega * p.rotation, tauR = p.tauRadDays * 86400, dy = a * dphi;
  const Kz = p.kz, Kh = p.kh, kzz = Kz / (dz * dz), khy = Kh / (dy * dy);
  const G = s._g ?? (s._g = {});
  if (!G.cos) {
    G.cos = lat.map(Math.cos); G.sin = lat.map(Math.sin); G.tan = lat.map(Math.tan);
    G.sinE = latE.map(Math.sin); G.tanE = latE.map(Math.tan);
    G.polar = lat.map((L) => Math.abs(L) > 60 * D2R);    // plain wind form poleward of 60 deg (the pole problem)
    G.M = new Float64Array(nlat * nz); G.b = new Float64Array(nlat * nz); G.C = new Float64Array(nz);
  }
  // friction (the ground's, lowest 1.5 km) and the sponge (north-south wind only, from 1 km above
  // the tropopause to once a day at the lid, so disturbances die out instead of reflecting off it)
  const zS = (p.tropopauseKm + 1) * 1000, rateU = new Float64Array(nz), rateV = new Float64Array(nz);
  for (let k = 0; k < nz; k++) {
    rateU[k] = s.zc[k] < 1500 ? 1 / (p.tauFricDays * 86400) : 0;        // (no sponge on u: braking the jet aloft drove a spurious overturning)
    rateV[k] = rateU[k] + (s.zc[k] <= zS ? 0 : ((s.zc[k] - zS) / (s.H - zS)) / 86400);
  }
  const { M, b, C } = G;
  for (let j = 0; j < nlat; j++) {
    const c = G.cos[j], base = a * c, rot = om * a * c;
    for (let k = 0; k < nz; k++) { const i = j * nz + k; M[i] = base * (rot + u[i]); b[i] = (g * (th[i] - th0)) / th0; }
  }
  for (let j = 0; j < nlat; j++) {
    const aC = a * G.cos[j], polar = G.polar[j], f = 2 * om * G.sin[j], tn = G.tan[j] / a;
    for (let k = 0; k < nz; k++) {
      const i = j * nz + k;
      const vc = 0.5 * (v[j * nz + k] + v[(j + 1) * nz + k]), wc = 0.5 * (w[j * N + k] + w[j * N + k + 1]);
      // potential temperature: upwind advection, relaxation to equilibrium, smoothing
      let x = th[i];
      let xs = j > 0 ? th[i - nz] : x, xn = j < nlat - 1 ? th[i + nz] : x, xd = k > 0 ? th[i - 1] : x, xu = k < nz - 1 ? th[i + 1] : x;
      dth[i] = -(vc > 0 ? vc * (x - xs) : vc * (xn - x)) / dy - (wc > 0 ? wc * (x - xd) : wc * (xu - x)) / dz
        + kzz * (xu - 2 * x + xd) + khy * (xn - 2 * x + xs) - (x - thEq[i]) / tauR;
      // zonal wind through absolute angular momentum M = a cos(lat) (Omega a cos(lat) + u), moved by the
      // circulation with an upwind (monotone) scheme: it can never make a new maximum, so no spurious
      // super-rotation (Hide's theorem holds), and the Coriolis and curvature terms come out exactly
      x = u[i]; xs = j > 0 ? u[i - nz] : x; xn = j < nlat - 1 ? u[i + nz] : x; xd = k > 0 ? u[i - 1] : x; xu = k < nz - 1 ? u[i + 1] : x;
      let adv;
      if (polar) {
        adv = -(vc > 0 ? vc * (x - xs) : vc * (xn - x)) / dy - (wc > 0 ? wc * (x - xd) : wc * (xu - x)) / dz + (f + x * tn) * vc;
      } else {
        const m = M[i], ms = j > 0 ? M[i - nz] : m, mn = j < nlat - 1 ? M[i + nz] : m, md = k > 0 ? M[i - 1] : m, mu = k < nz - 1 ? M[i + 1] : m;
        adv = (-(vc > 0 ? vc * (m - ms) : vc * (mn - m)) / dy - (wc > 0 ? wc * (m - md) : wc * (mu - m)) / dz) / aC;
      }
      du[i] = adv + kzz * (xu - 2 * x + xd) + khy * (xn - 2 * x + xs) - x * rateU[k];
    }
  }
  dq.fill(0);
  for (let j = 1; j < nlat; j++) {
    const fe = 2 * om * G.sinE[j], tn = G.tanE[j] / a;
    for (let k = 0; k < nz; k++) { const ue = 0.5 * (u[(j - 1) * nz + k] + u[j * nz + k]); C[k] = (fe + ue * tn) * ue; }
    for (let k = 1; k < nz; k++) {
      const i = j * N + k;
      const bfN = 0.5 * (b[j * nz + k - 1] + b[j * nz + k]), bfS = 0.5 * (b[(j - 1) * nz + k - 1] + b[(j - 1) * nz + k]);
      const fr = (v[j * nz + k] * rateV[k] - v[j * nz + k - 1] * rateV[k - 1]) / dz;
      const qd = k > 1 ? q[i - 1] : q[i], qu = k < nz - 1 ? q[i + 1] : q[i], qs = j > 1 ? q[i - N] : q[i], qn = j < nlat - 1 ? q[i + N] : q[i];
      // (the circulation's grid-scale noise is damped harder: 10x the horizontal smoothing)
      dq[i] = -(bfN - bfS) / dy - (C[k] - C[k - 1]) / dz - fr + kzz * (qu - 2 * q[i] + qd) + 10 * khy * (qn - 2 * q[i] + qs);
    }
  }
}

// Advance the model by dt seconds (RK3, Wicker-Skamarock), updating the
// surface layer and, with seasons on, the day of the year.
export function stepSim(s, params = {}, dt = 900) {
  const p = { ...DEFAULTS, ...params };
  if (p.seasons) s.day = (((s.day ?? p.day) + dt / 86400 - 1) % 365 + 365) % 365 + 1; else s.day = p.day;
  const target = surfaceTarget(s, p, declination(s.day, p.tilt), new Float64Array(s.nlat));
  const r = dt / (p.inertiaDays * 86400);
  for (let j = 0; j < s.nlat; j++) s.Ts[j] += (target[j] - s.Ts[j]) * Math.min(1, r);
  setThEq(s, p);
  const n = s.u.length, m = s.q.length;
  const W = s._w ?? (s._w = { u0: new Float64Array(n), t0: new Float64Array(n), q0: new Float64Array(m), du: new Float64Array(n), dth: new Float64Array(n),
    dq: new Float64Array(m), u1: new Float64Array(n), t1: new Float64Array(n), q1: new Float64Array(m) });
  const { u0, t0, q0, du, dth, dq, u1, t1, q1 } = W;
  u0.set(s.u); t0.set(s.th); q0.set(s.q);
  for (const frac of [1 / 3, 1 / 2, 1]) {
    tendencies(s, p, s.u, s.th, s.q, du, dth, dq);
    for (let i = 0; i < n; i++) { u1[i] = u0[i] + frac * dt * du[i]; t1[i] = t0[i] + frac * dt * dth[i]; }
    for (let i = 0; i < m; i++) q1[i] = q0[i] + frac * dt * dq[i];
    s.u.set(u1); s.th.set(t1); s.q.set(q1);
  }
  // A light 1-2-1 (Shapiro) filter in latitude each step, on the circulation (q) harder than on u:
  // it removes the two-grid-box wiggle that inertial instability grows aloft at fast rotation
  // (psi flipped +-20000 between neighbouring boxes at 12 km at 2x rotation) and leaves the
  // resolved circulation alone.
  shapiro(s.q, s.nlat + 1, s.nz + 1, 0.5, 1);
  // (not on u: smoothing u mixes angular momentum and undoes the monotone advection above)
  invert(s, s.q);
  s.t += dt;
  return s;
}
function shapiro(a, nj, nk, eps, edgeSkip) {
  const tmp = new Float64Array(nj);
  for (let k = 0; k < nk; k++) {
    for (let j = 0; j < nj; j++) tmp[j] = a[j * nk + k];
    for (let j = 1 + edgeSkip; j < nj - 1 - edgeSkip; j++) a[j * nk + k] = tmp[j] + (eps / 4) * (tmp[j + 1] - 2 * tmp[j] + tmp[j - 1]);
  }
}

export function runSim(s, params, days, dt = 900) {
  const n = Math.round((days * 86400) / dt);
  for (let i = 0; i < n; i++) stepSim(s, params, dt);
  return s;
}

// Numbers that make the settings' effects measurable (reference section 12).
export function diagnostics(s) {
  const { nlat, nz, lat, latE, psi, u, th, w, zc } = s, N = nz + 1, mid = Math.round(nz / 2), deg = (r) => r / D2R;
  // Overturning at mid-height; each hemisphere's tropical cell and where it ends.
  const col = Array.from({ length: nlat + 1 }, (_, j) => psi[j * N + mid]);
  // Each hemisphere's thermally direct (Hadley) cell: rising nearer the equator, sinking poleward,
  // which here is psi < 0 in the north and > 0 in the south. Its strongest point within 50 deg
  // (it may sit across the equator at the solstices), and its poleward edge: where psi changes
  // sign or falls below a tenth of that. (Friction also drives weak reverse cells beside it.)
  const cell = (hemi) => {
    const sgn = hemi > 0 ? -1 : 1;
    let best = -1, bestV = 0;
    for (let j = 1; j < nlat; j++) {
      const L = deg(latE[j]);
      if (hemi > 0 ? L < -15 || L > 50 : L > 15 || L < -50) continue;
      if (col[j] * sgn > bestV) { bestV = col[j] * sgn; best = j; }
    }
    if (best < 0) return { edge: NaN, strength: 0, at: NaN };
    let j = best;
    while (j > 0 && j < nlat && col[j] * sgn > 0.1 * bestV) j += hemi > 0 ? 1 : -1;
    return { edge: Math.abs(deg(latE[j])), strength: bestV * sgn, at: deg(latE[best]) };
  };
  const jet = (hemi) => {
    let best = { u: -Infinity, lat: NaN, z: NaN };
    for (let j = 0; j < nlat; j++) {
      if (hemi > 0 ? lat[j] < 0 : lat[j] > 0) continue;
      for (let k = 0; k < nz; k++) if (zc[k] > 5000 && zc[k] <= 13000 && u[j * nz + k] > best.u) best = { u: u[j * nz + k], lat: deg(lat[j]), z: zc[k] };
    }
    return best;
  };
  let itcz = NaN, wmax = -Infinity;
  const k3 = Math.round(3000 / s.dz);
  for (let j = 0; j < nlat; j++) if (Math.abs(deg(lat[j])) <= 30 && w[j * N + k3] > wmax) { wmax = w[j * N + k3]; itcz = deg(lat[j]); }
  const at = (L, k, arr) => { const j = Math.max(0, Math.min(nlat - 1, Math.round((L + 90) / (180 / nlat) - 0.5))); return arr[j * nz + k]; };
  return {
    north: cell(1), south: cell(-1), jetN: jet(1), jetS: jet(-1), itcz, wItczCmS: wmax * 100,
    // the strongest surface easterly (most negative u, m/s) between the equator and 30 deg
    tradesN: Math.min(...Array.from({ length: 15 }, (_, i) => at(1 + 2 * i, 0, u))), tradesS: Math.min(...Array.from({ length: 15 }, (_, i) => at(-1 - 2 * i, 0, u))),
    contrastK: at(0, 0, th) - 0.5 * (at(88, 0, th) + at(-88, 0, th)),
    day: s.day, days: s.t / 86400,
  };
}

// The winds at cell centres (m/s; w up), for particles and charts: {nlat, nz, H, lat, zc, u, vc, wc}.
export function centredField(s, out = null) {
  const { nlat, nz } = s, N = nz + 1, n = nlat * nz;
  const o = out ?? { nlat, nz, H: s.H, lat: s.lat, zc: s.zc, u: s.u, vc: new Float64Array(n), wc: new Float64Array(n) };
  for (let j = 0; j < nlat; j++) for (let k = 0; k < nz; k++) {
    o.vc[j * nz + k] = 0.5 * (s.v[j * nz + k] + s.v[(j + 1) * nz + k]);
    o.wc[j * nz + k] = 0.5 * (s.w[j * N + k] + s.w[j * N + k + 1]);
  }
  o.u = s.u;
  return o;
}
