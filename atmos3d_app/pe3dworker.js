// The Simulate mode's 3-D model (pe3d.js) in a Web Worker, so the page stays
// responsive. It starts from the spun-up state (pe3d_spinup.js), steps at the
// chosen speed (as fast as it can: about a model day a second), and about 8
// times a second sends the page what it draws:
//   grids at each level (true winds u, v in m/s, temperature T in K, and the
//   vertical velocity as sigma-dot in 1/s), surface pressure (hPa), and the
//   zonal means for the chart -- instantaneous and a running 30-day mean, which
//   is where the cells show (any one day is dominated by storms).
// Messages in: {type: "init" | "params" | "speed" | "pause" | "stop" | "restart", ...}.
import { PE_DEFAULTS, initPE, loadPEState, makePE, peDiagnostics, setLand, stepPE } from "./pe3d.js?v=20261010090011";
import { PE_SPINUP } from "./pe3d_spinup.js?v=20261010090011";
import { PE_SPINUP_LAND } from "./pe3d_spinup_land.js?v=20261010090011";
import { landFraction } from "./landmask.js?v=20261010090011";

const DT = 1200, MEAN_DAYS = 30;
let s = null, p = { ...PE_DEFAULTS }, speed = 1, paused = false, running = false, owed = 0, last = performance.now(), mean = null, lastPost = 0;

// Starting states: the ocean planet at the equinox, or Earth's continents with the seasons running
// in mid-January or mid-July (pe3d_spinup_land.js).
let landFrac = null;
function applyLand() {
  if (p.land && !landFrac) landFrac = landFraction(Array.from(s.T.lat, (x) => (x * 180) / Math.PI), s.T.nlon);
  setLand(s, p.land ? landFrac : null);
}
function start(fromRest, from = "aqua") {
  s = makePE({ L: PE_SPINUP.L });
  mean = null;
  const st = from === "jan" || from === "jul" ? PE_SPINUP_LAND[from] : PE_SPINUP;
  if (fromRest) initPE(s, p);
  else { loadPEState(s, st); s.t = 0; if (st.meanU) mean = { ubar: Float64Array.from(st.meanU), psi: Float64Array.from(st.meanPsi) }; }
  applyLand();
}

onmessage = (e) => {
  const m = e.data;
  if (m.type === "init") { p = { ...PE_DEFAULTS, ...m.p }; start(false); }
  else if (m.type === "restart") { p = { ...PE_DEFAULTS, ...m.p }; start(!!m.fromRest, m.from); }
  else if (m.type === "params") { p = { ...PE_DEFAULTS, ...m.p }; if (!p.seasons) s.day = p.day; applyLand(); }
  else if (m.type === "speed") speed = m.speed;
  else if (m.type === "pause") paused = m.paused;
  else if (m.type === "stop") { running = false; return; }
  if (!running) { running = true; last = performance.now(); loop(); }
};

function post() {
  const T = s.T, { nlat, nlon } = T, L = s.L, n = nlat * nlon;
  const u = new Float32Array(L * n), v = new Float32Array(L * n), t = new Float32Array(L * n), sd = new Float32Array(L * n), ps = new Float32Array(n);
  const U = T.grid(), V = T.grid(), G = T.grid(), D = T.grid();
  const q = T.synth(s.lnps), X = T.grid(), Y = T.grid();
  T.grad(s.lnps, X, Y);
  for (let i = 0; i < n; i++) ps[i] = Math.exp(q[i]) / 100;
  // sigma-dot at half levels from the column's divergence (as pe3d.js), then averaged to full levels
  const acc = new Float64Array(n), dq = new Float64Array(n), below = new Float64Array(n), vgq = [];
  for (let k = 0; k < L; k++) {
    T.uv(s.zeta[k], s.div[k], U, V); T.synth(s.temp[k], G); T.synth(s.div[k], D);
    const g = new Float64Array(n);
    for (let j = 0; j < nlat; j++) {
      const c2 = 1 - T.mu[j] * T.mu[j], c = Math.sqrt(c2);
      for (let i = 0; i < nlon; i++) {
        const x = j * nlon + i;
        u[k * n + x] = U[x] / c; v[k * n + x] = V[x] / c; t[k * n + x] = G[x];
        g[x] = D[x] + (U[x] * X[x] + V[x] * Y[x]) / c2;
        dq[x] -= g[x] * s.ds[k];
      }
    }
    vgq.push(g);
  }
  for (let k = 0; k < L; k++) {
    for (let x = 0; x < n; x++) {
      const up = k === 0 ? 0 : -s.sh[k] * dq[x] - acc[x];
      acc[x] += vgq[k][x] * s.ds[k];
      const dn = k === L - 1 ? 0 : -s.sh[k + 1] * dq[x] - acc[x];
      sd[k * n + x] = 0.5 * (up + dn);
    }
  }
  const d = peDiagnostics(s);
  const w = mean ? Math.min(1, 1 / (MEAN_DAYS * (86400 / DT) / Math.max(1, stepsSincePost))) : 1;
  if (!mean) mean = { ubar: Float64Array.from(d.ubar), psi: Float64Array.from(d.psi) };
  else for (const k of ["ubar", "psi"]) for (let i = 0; i < d[k].length; i++) mean[k][i] += (d[k][i] - mean[k][i]) * w;
  stepsSincePost = 0;
  postMessage({ type: "state", t: s.t, day: s.day, L, nlat, nlon, lat: Float32Array.from(T.lat, (x) => (x * 180) / Math.PI), sf: Float32Array.from(s.sf), sh: Float32Array.from(s.sh),
    u, v, temp: t, sdot: sd, ps, ubar: Float32Array.from(d.ubar), psi: Float32Array.from(d.psi), meanU: Float32Array.from(mean.ubar), meanPsi: Float32Array.from(mean.psi),
    eke: d.eke, psMin: d.psMin / 100, psMax: d.psMax / 100 }, [u.buffer, v.buffer, t.buffer, sd.buffer, ps.buffer]);
}

let stepsSincePost = 0;
function loop() {
  if (!running) return;
  const now = performance.now(), dtReal = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (!paused) {
    owed = Math.min(owed + (speed * 86400 * dtReal) / DT, 20);
    while (owed >= 1 && performance.now() - now < 40) { stepPE(s, p, DT); owed -= 1; stepsSincePost++; }
  }
  if (now - lastPost > 120) { post(); lastPost = now; }
  setTimeout(loop, 5);
}
