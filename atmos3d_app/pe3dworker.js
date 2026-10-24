// The Simulate mode's 3-D model (pe3d.js) in a Web Worker, so the page stays
// responsive. It starts from the spun-up state (pe3d_spinup.js), steps at the
// chosen speed (as fast as it can: about 3 model days a second, with the
// semi-implicit hour-long steps; 2026-10-09, it was under 1), and about 8
// times a second sends the page what it draws.
// After a settings change it "settles": runs flat out with 2-hour steps (same climate, measured over 150
// days) for SETTLE_DAYS, posting rarely, and restarts the 30-day mean so the chart shows only the new
// climate; the page is told how far it has got (settle, meanDays). Before this a change took a minute or
// more to show, with nothing saying so (user report: "it doesn't spin up fast enough").
// What it sends:
//   grids at each level (true winds u, v in m/s, temperature T in K, and the
//   vertical velocity as sigma-dot in 1/s), surface pressure (hPa), and the
//   zonal means for the chart -- instantaneous and a running 30-day mean, which
//   is where the cells show (any one day is dominated by storms).
// Messages in: {type: "init" | "params" | "speed" | "pause" | "stop" | "restart", ...}.
import { PE_DEFAULTS, initPE, loadPEState, makePE, peDiagnostics, peState, setLand, setSurface, settleOntoMountains, stepPE } from "./pe3d.js?v=20261024090011";
import { SIM_SURFACE } from "./simsurface.js?v=20261024090011";
import { PE_SPINUP } from "./pe3d_spinup.js?v=20261024090011";
import { PE_SPINUP_LAND } from "./pe3d_spinup_land.js?v=20261024090011";
import { landFraction } from "./landmask.js?v=20261024090011";

const DT = 3600, DT_FAST = 7200, MEAN_DAYS = 30, SETTLE_DAYS = 40;
let s = null, p = { ...PE_DEFAULTS }, speed = 1, paused = false, running = false, owed = 0, last = performance.now(), mean = null, lastPost = 0;
let settleUntil = 0, meanFrom = 0, meanSteps = 0, mapSteps = 0;   // ...and how many model steps the current mean holds          // model time (s) the settling ends; when the current mean began

// Starting states: the ocean planet at the equinox, or Earth's continents with the seasons running
// in mid-January or mid-July (pe3d_spinup_land.js).
let landFrac = null;
function applyLand() {
  if (p.land && !landFrac) landFrac = landFraction(Array.from(s.T.lat, (x) => (x * 180) / Math.PI), s.T.nlon);
  setLand(s, p.land ? landFrac : null);
}
// The real sea and mountains (simsurface.js): sst, enso and mountains read them. The saved states were spun up
// without mountains, so switching them on (or starting with them) lowers the surface pressure onto them.
function start(fromRest, from = "aqua") {
  s = makePE({ L: PE_SPINUP.L });
  setSurface(s, SIM_SURFACE);
  mean = null;
  const st = from === "jan" || from === "jul" ? PE_SPINUP_LAND[from] : PE_SPINUP;
  if (fromRest) initPE(s, p);
  else { loadPEState(s, st); s.t = 0; if (st.meanU) { mean = { ubar: Float64Array.from(st.meanU), psi: Float64Array.from(st.meanPsi) }; meanSteps = MEAN_DAYS * 24; } }
  applyLand();
  if (p.mountains) settleOntoMountains(s, 1);
  settleUntil = 0; meanFrom = st.meanU && !fromRest ? -MEAN_DAYS * 86400 : 0;
  // a saved state with the real sea or mountains added isn't in balance yet: settle into it
  if (!fromRest && !p.seasons && (p.sst || p.mountains || p.enso || p.moist)) { mean = null; meanFrom = 0; settleUntil = SETTLE_DAYS * 86400; }
}

// Saved settled states for the lessons with the real sea, mountains, water or El Nino (pe3d_states/<name>.json, made
// by tools/make_pe3d_states.mjs): the spectral state, the water vapour and the 30-day means, so the step opens settled
// and averaged instead of fast-forwarding 40 days and averaging 30 more (2026-10-10). Fetched only when a step asks.
const f32 = (b) => { const bin = atob(b), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new Float32Array(u8.buffer); };
const b64 = (a) => { const u8 = new Uint8Array(Float32Array.from(a).buffer); let bin = ""; for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(bin); };
const MEAN_KEYS = ["ubar", "psi", "ps", "w", "uj", "eqU", "eqW", "rain", "pwat"];
async function startSaved(name, fromHint = "jan") {
  s = null;
  let st;
  try { st = await (await fetch(new URL(`./pe3d_states/${name}.json`, import.meta.url))).json(); } catch { start(false, fromHint); return; }
  s = makePE({ L: st.L }); setSurface(s, SIM_SURFACE);
  loadPEState(s, st); s.t = 0;
  applyLand();
  if (st.q) s.q = st.q.map((b) => Float64Array.from(f32(b)));
  mean = {};
  for (const k of MEAN_KEYS) if (st.mean?.[k]) mean[k] = Float64Array.from(f32(st.mean[k]));
  settleUntil = 0; meanFrom = -MEAN_DAYS * 86400; meanSteps = mapSteps = MEAN_DAYS * (86400 / DT);
}
function dump() {
  return { ...peState(s), q: s.q ? s.q.map(b64) : null, mean: Object.fromEntries(MEAN_KEYS.filter((k) => mean?.[k]).map((k) => [k, b64(mean[k])])), p };
}

onmessage = async (e) => {
  const m = e.data;
  if (m.type === "init") { p = { ...PE_DEFAULTS, ...m.p }; start(false); }
  else if (m.type === "restart" && m.saved) { p = { ...PE_DEFAULTS, ...m.p }; await startSaved(m.saved, m.from); }
  else if (m.type === "restart") { p = { ...PE_DEFAULTS, ...m.p }; start(!!m.fromRest, m.from); }
  else if (m.type === "dump") { postMessage({ type: "dump", state: dump() }); return; }
  else if (m.type === "params") {
    const was = p;
    p = { ...PE_DEFAULTS, ...m.p };
    if (!s) return;                                         // a saved state is still loading; it has these settings
    if (!p.seasons) s.day = p.day; applyLand();
    if (!!was.mountains !== !!p.mountains) settleOntoMountains(s, p.mountains ? 1 : -1);
    // a change that alters the climate: settle (unless the seasons are running: racing through them would skip them)
    const changed = ["rotation", "tilt", "contrastK", "inertiaDays", "land", "sst", "enso", "mountains", "deepHeat", "moist", "tauAirDays", "moistTauAirDays"].some((k) => was[k] !== p[k]) || (!p.seasons && was.day !== p.day);
    if (changed || m.settle) { mean = null; meanFrom = s.t; settleUntil = p.seasons && !m.settle ? 0 : s.t + SETTLE_DAYS * 86400; }
  }
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
  // with mountains, pressure reduced to sea level, as weather maps show it: p_sea = p_sfc exp(g z / R T̄), T̄ the
  // lowest level's temperature warmed by half a standard lapse (6.5 K/km) over the height below it
  let psMin = Infinity, psMax = -Infinity;
  for (let x = 0; x < n; x++) {
    const ph = p.mountains && s.phis ? s.phis[x] : 0;
    if (ph > 0) ps[x] *= Math.exp(ph / (287.04 * (t[(L - 1) * n + x] + (0.0065 * ph) / 9.80616 / 2)));
    psMin = Math.min(psMin, ps[x]); psMax = Math.max(psMax, ps[x]);
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
  // the maps the lessons average (2026-10-10): surface pressure, rising air at mid-levels (sigma-dot, < 0 up),
  // the east-west wind at the jet's level (sigma 0.25), and the equator's longitude-height section (5S-5N)
  // of the east-west wind and sigma-dot
  const kMid = Math.floor(L / 2), kJet = 1, eqRows = [];
  for (let j = 0; j < nlat; j++) if (Math.abs((T.lat[j] * 180) / Math.PI) < 6) eqRows.push(j);
  const now = { ps, w: sd.slice(kMid * n, (kMid + 1) * n), uj: u.slice(kJet * n, (kJet + 1) * n), eqU: new Float32Array(L * nlon), eqW: new Float32Array(L * nlon) };
  // with water vapour: rain (mm/day, since the last post) and the column's water vapour (kg/m^2 = mm)
  if (p.moist && s.q) {
    now.rain = new Float32Array(n); now.pwat = new Float32Array(n);
    if (rainSum && rainSecs > 0) for (let x = 0; x < n; x++) now.rain[x] = (rainSum[x] * 86400) / rainSecs;
    for (let k = 0; k < L; k++) for (let x = 0; x < n; x++) now.pwat[x] += (s.q[k][x] * s.ds[k] * Math.exp(q[x])) / 9.80616;
    rainSum = null; rainSecs = 0;
  }
  for (let k = 0; k < L; k++) for (let i = 0; i < nlon; i++) {
    let a = 0, b = 0;
    for (const j of eqRows) { a += u[k * n + j * nlon + i]; b += sd[k * n + j * nlon + i]; }
    now.eqU[k * nlon + i] = a / eqRows.length; now.eqW[k * nlon + i] = b / eqRows.length;
  }
  // The weight of this sample: a plain cumulative average until 30 days have been collected, then a running 30-day
  // mean (panel review round 3: the old fixed 1/30-day weight from the first snapshot left that one instant with
  // e^-1 = 37 % of the weight when AVERAGING reached 30 days).
  const MEAN_STEPS = MEAN_DAYS * (86400 / DT), k = Math.max(1, stepsSincePost);
  if (!mean) { mean = { ubar: Float64Array.from(d.ubar), psi: Float64Array.from(d.psi) }; meanSteps = 0; }
  meanSteps += k;
  const w = Math.min(1, k / Math.min(meanSteps, MEAN_STEPS));
  for (const k of ["ubar", "psi"]) for (let i = 0; i < d[k].length; i++) mean[k][i] += (d[k][i] - mean[k][i]) * w;
  // the maps keep their own count: a saved spin-up state brings only the zonal means, so its maps start fresh
  if (!mean.ps) mapSteps = 0;
  mapSteps += k;
  const wm = Math.min(1, k / Math.min(mapSteps, MEAN_STEPS));
  for (const key of ["ps", "w", "uj", "eqU", "eqW", "rain", "pwat"]) {
    if (!now[key]) { delete mean[key]; continue; }
    if (!mean[key]) mean[key] = Float64Array.from(now[key]);
    else for (let i = 0; i < now[key].length; i++) mean[key][i] += (now[key][i] - mean[key][i]) * wm;
  }
  stepsSincePost = 0;
  const settle = settleUntil > s.t ? 1 - (settleUntil - s.t) / (SETTLE_DAYS * 86400) : null;
  postMessage({ type: "state", t: s.t, day: s.day, L, nlat, nlon, settle, settleDays: SETTLE_DAYS, meanDays: Math.min(MEAN_DAYS, (s.t - meanFrom) / 86400, (mapSteps * DT) / 86400), lat: Float32Array.from(T.lat, (x) => (x * 180) / Math.PI), sf: Float32Array.from(s.sf), sh: Float32Array.from(s.sh),
    u, v, temp: t, sdot: sd, ps, ubar: Float32Array.from(d.ubar), psi: Float32Array.from(d.psi), meanU: Float32Array.from(mean.ubar), meanPsi: Float32Array.from(mean.psi),
    meanPs: Float32Array.from(mean.ps), meanW: Float32Array.from(mean.w), meanUj: Float32Array.from(mean.uj), eqU: Float32Array.from(mean.eqU), eqW: Float32Array.from(mean.eqW), kMid, kJet,
    rain: now.rain ?? null, pwat: now.pwat ?? null, meanRain: mean.rain ? Float32Array.from(mean.rain) : null, meanPwat: mean.pwat ? Float32Array.from(mean.pwat) : null,
    eke: d.eke, psMin, psMax, slp: !!p.mountains }, [u.buffer, v.buffer, t.buffer, sd.buffer, ps.buffer]);
}

let stepsSincePost = 0, rainSum = null, rainSecs = 0;
// rain since the last post (moist.js leaves each step's in s.rainStep, kg/m^2 = mm)
function addRain(dt) {
  if (!p.moist || !s.rainStep) return;
  if (!rainSum) rainSum = new Float64Array(s.rainStep.length);
  for (let i = 0; i < rainSum.length; i++) rainSum[i] += s.rainStep[i];
  rainSecs += dt;
}
function loop() {
  if (!running) return;
  if (!s) { setTimeout(loop, 20); return; }                // a saved state still loading
  const now = performance.now(), dtReal = Math.min(0.25, (now - last) / 1000);
  last = now;
  const settling = settleUntil > s.t;
  if (settling) {
    while (performance.now() - now < 45 && settleUntil > s.t) { stepPE(s, p, DT_FAST, { implicit: true }); addRain(DT_FAST); stepsSincePost += DT_FAST / DT; }
    owed = 0;
    if (settleUntil <= s.t) { mean = null; meanFrom = s.t; }      // settled: the 30-day mean starts now, with the new climate only
  } else if (!paused) {
    owed = Math.min(owed + (speed * 86400 * dtReal) / DT, 20);
    while (owed >= 1 && performance.now() - now < 40) { stepPE(s, p, DT, { implicit: true }); addRain(DT); owed -= 1; stepsSincePost++; }
  }
  if (now - lastPost > (settling ? 400 : 120)) { post(); lastPost = now; }
  setTimeout(loop, 5);
}
