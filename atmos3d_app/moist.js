// Water vapour, evaporation, rain and the heat rain releases, for the Simulate mode's 3-D model (pe3d.js)
// (user plan, 2026-10-09: "a simplified moisture scheme"; docs/sim_lesson_design.md F10). Simplified moist
// physics after Frierson, Held & Zurita-Gotor (2006) and Frierson (2007), keeping Held & Suarez's
// relaxation as the radiation:
//   - specific humidity q on the grid at each level, carried by the winds (semi-Lagrangian across, upwind up
//     and down: never negative, unlike spectral q);
//   - evaporation from the surface into the lowest level, bulk formula, C_E = 1.3e-3, from the sea at the
//     observed temperature (with the real sea on) or else the lowest level's potential temperature (a
//     well-mixed boundary layer); land evaporates a quarter as much (drier ground);
//   - convection, simplified Betts-Miller: where a parcel lifted from the lowest level is warmer than its
//     surroundings, relax temperature toward its moist ascent and humidity toward 70 % of saturation over
//     2 hours, the column's heating set equal to the latent heat of the rain it makes (energy conserved);
//   - large-scale condensation: any level above saturation rains out at once, heating the air.
// Rain falls straight out (no re-evaporation, no clouds). One call per model step, after the dynamics.
// Pure, imports nothing: pe3d.js passes the state in.

const R = 287.04, CP = 1004.6, KAPPA = R / CP, G = 9.80616, LV = 2.5e6, RV = 461.5, EPS = R / RV;
const CE = 1.3e-3, GUST = 1, RH_BM = 0.7, TAU_BM = 7200, LAND_WET = 0.25;

// Saturation specific humidity (kg/kg) at T (K) and p (Pa): Bolton's vapour pressure over water.
export function qsat(T, p) {
  const es = 611.2 * Math.exp((17.67 * (T - 273.15)) / (T - 29.65));
  return (EPS * es) / Math.max(p - (1 - EPS) * es, 0.1 * p);
}
// Saturation adjustment at fixed pressure: the temperature at which cp T + L qs(T) equals cp T0 + L q0.
function saturate(T0, q0, p) {
  let T = T0;
  for (let it = 0; it < 4; it++) {
    const qs = qsat(T, p), f = CP * (T - T0) + LV * (qs - q0), df = CP + (LV * LV * qs) / (RV * T * T);
    T -= f / df;
  }
  return T;
}

// One step of the moisture physics on state s (pe3d.js makePE, with s.q set up by initMoist), params p,
// over dt seconds. Grids it needs: U, V (u cos lat, v cos lat), T (K), ps (Pa) per level, sigma-dot at half
// levels; it updates s.q and returns the temperature change per level (K, to add to s.temp) and rain and
// evaporation for this step (kg/m^2 per grid box). seaT: the surface temperature for evaporation over the
// sea (K, per box) or null.
export function stepMoist(s, p, dt, { U, V, Tg, ps, sdot, seaT = null, land = null }) {
  const T = s.T, { nlat, nlon } = T, L = s.L, n = nlat * nlon, a = T.a, sf = s.sf, ds = s.ds;
  const lat = s._lat ?? (s._lat = Float64Array.from(T.mu, (m) => Math.asin(m)));
  const dT = s._mdT ?? (s._mdT = Array.from({ length: L }, () => new Float64Array(n)));
  const rain = s._rain ?? (s._rain = new Float64Array(n)), evap = s._evap ?? (s._evap = new Float64Array(n));
  const qn = s._qn ?? (s._qn = Array.from({ length: L }, () => new Float64Array(n)));
  for (let k = 0; k < L; k++) dT[k].fill(0);
  rain.fill(0); evap.fill(0);
  // 1. across: semi-Lagrangian, the departure point one step upwind, bilinear in lon and Gaussian lat
  const dlon = (2 * Math.PI) / nlon;
  for (let k = 0; k < L; k++) {
    const q = s.q[k], o = qn[k], Uk = U[k], Vk = V[k];
    for (let j = 0; j < nlat; j++) {
      const c = Math.cos(lat[j]);
      for (let i = 0; i < nlon; i++) {
        const x = j * nlon + i, u = Uk[x] / c, v = Vk[x] / c;
        let la = lat[j] - (v * dt) / a;
        la = Math.max(lat[0], Math.min(lat[nlat - 1], la));
        const lo = i * dlon - (u * dt) / (a * Math.max(c, 0.05));
        let j1 = 1; while (j1 < nlat - 1 && lat[j1] < la) j1++;
        const j0 = j1 - 1, wy = (la - lat[j0]) / (lat[j1] - lat[j0]);
        const fx = (((lo / dlon) % nlon) + nlon) % nlon, i0 = Math.floor(fx) % nlon, i1 = (i0 + 1) % nlon, wx = fx - Math.floor(fx);
        o[x] = (q[j0 * nlon + i0] * (1 - wx) + q[j0 * nlon + i1] * wx) * (1 - wy) + (q[j1 * nlon + i0] * (1 - wx) + q[j1 * nlon + i1] * wx) * wy;
      }
    }
  }
  // 2. up and down: upwind with sigma-dot at the level (the mean of its half levels; its Courant number is
  // well under 1 at hour-long steps, so this stays positive)
  for (let k = 0; k < L; k++) {
    const q = s.q[k], up = sdot[k], dn = sdot[k + 1];
    for (let x = 0; x < n; x++) {
      const sd = 0.5 * (up[x] + dn[x]);
      let d = 0;
      if (sd > 0 && k > 0) d = (-sd * (qn[k][x] - qn[k - 1][x])) / (sf[k] - sf[k - 1]);
      else if (sd < 0 && k < L - 1) d = (-sd * (qn[k + 1][x] - qn[k][x])) / (sf[k + 1] - sf[k]);
      q[x] = Math.max(0, qn[k][x] + d * dt);
    }
  }
  // 3. evaporation into the lowest level
  const kb = L - 1;
  for (let x = 0; x < n; x++) {
    const p0 = ps[x], pL = sf[kb] * p0, TL = Tg[kb][x], c = Math.cos(lat[Math.floor(x / nlon)]);
    const wind = Math.hypot(U[kb][x], V[kb][x]) / c + GUST, rho = pL / (R * TL);
    const lf = land ? land[x] : 0, Tsea = seaT && Number.isFinite(seaT[x]) ? seaT[x] : TL * Math.pow(1 / sf[kb], KAPPA), Tland = TL * Math.pow(1 / sf[kb], KAPPA);
    const qsS = qsat(Tsea, p0), qsL = qsat(Tland, p0), qL = s.q[kb][x];
    const E = rho * CE * wind * ((1 - lf) * Math.max(0, qsS - qL) + lf * LAND_WET * Math.max(0, qsL - qL));   // kg/m^2/s
    const dq = (E * dt * G) / (p0 * ds[kb]);
    s.q[kb][x] += dq; evap[x] = E * dt;
  }
  // 4. convection (simplified Betts-Miller) and 5. large-scale condensation, column by column
  const Tc = new Float64Array(L), qc = new Float64Array(L), Tr = new Float64Array(L), dTc = new Float64Array(L), dqc = new Float64Array(L), pk = new Float64Array(L);
  const f = Math.min(1, dt / TAU_BM);
  for (let x = 0; x < n; x++) {
    const p0 = ps[x];
    for (let k = 0; k < L; k++) { Tc[k] = Tg[k][x]; qc[k] = s.q[k][x]; pk[k] = sf[k] * p0; dTc[k] = 0; dqc[k] = 0; }
    // the parcel from the lowest level: dry ascent, then saturated (moist enthalpy kept at each pressure)
    let top = -1;
    Tr[kb] = Tc[kb];
    for (let k = kb - 1; k >= 0; k--) {
      const Td = Tc[kb] * Math.pow(pk[k] / pk[kb], KAPPA);
      Tr[k] = qc[kb] > qsat(Td, pk[k]) ? saturate(Td, qc[kb], pk[k]) : Td;
      if (Tr[k] > Tc[k]) top = k; else if (top >= 0 || k < kb - 1) break;
    }
    let rainC = 0;
    if (top >= 0) {
      let S = 0, Q = 0, W = 0;
      for (let k = top; k <= kb; k++) {
        dTc[k] = k === kb ? 0 : -(Tc[k] - Tr[k]) * f;
        dqc[k] = -(qc[k] - RH_BM * qsat(Tr[k], pk[k])) * f;
        S += dTc[k] * ds[k]; Q -= dqc[k] * ds[k]; W += ds[k];
      }
      if (Q > 0) {
        const cAdj = (LV * Q - CP * S) / (CP * W);        // the column's heating = the rain's latent heat
        for (let k = top; k <= kb; k++) { dTc[k] += cAdj; Tc[k] += dTc[k]; qc[k] = Math.max(0, qc[k] + dqc[k]); }
        rainC = (Q * p0) / G;
      }
    }
    let rainL = 0;
    for (let k = 0; k < L; k++) {
      const qs = qsat(Tc[k], pk[k]);
      if (qc[k] > qs) {
        const d = (qc[k] - qs) / (1 + (LV * LV * qs) / (CP * RV * Tc[k] * Tc[k]));
        qc[k] -= d; Tc[k] += (LV * d) / CP; rainL += (d * ds[k] * p0) / G;
      }
    }
    for (let k = 0; k < L; k++) { dT[k][x] = Tc[k] - Tg[k][x]; s.q[k][x] = qc[k]; }
    rain[x] = rainC + rainL;
  }
  return { dT, rain, evap };
}

// Start the water vapour at a relative humidity (default 60 %, less above the lowest third, nothing at the top).
export function initMoist(s, Tg, ps, rh = 0.6) {
  const T = s.T, n = T.nlat * T.nlon, L = s.L;
  s.q = Array.from({ length: L }, () => new Float64Array(n));
  for (let k = 0; k < L; k++) {
    const r = rh * Math.max(0, (s.sf[k] - 0.15) / 0.85);
    for (let x = 0; x < n; x++) s.q[k][x] = r * qsat(Tg[k][x], s.sf[k] * ps[x]);
  }
  return s;
}
