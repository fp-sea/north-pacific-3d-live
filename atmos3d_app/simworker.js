// The Simulate mode's model, run in a Web Worker so the page stays responsive:
// the model steps here (sim2d.js) and sends its state back ~30 times a second;
// the page only draws. After a settings change it runs flat out until the new
// balance is reached ("fast-forward", a second or two), then at the chosen
// speed. Messages in: {type: "init" | "params" | "reset" | "load" | "speed" | "pause" | "stop", ...};
// out: {type: "state", t, day, fast, u, th, psi, v, w, Ts}.
import { DEFAULTS, initSim, makeSim, stepSim } from "./sim2d.js?v=20261031090012";

// Fast-forward with 20-minute steps (the balance is the same as with 10: Hadley edge 24-26°, jet 37 m/s, measured over
// 200 days at 0.5x, 1x and 4x spin), posting only a few times a second: twice as fast to the new balance.
const DT = 600, DT_FAST = 1200;
let lastPost = 0;
let s = null, p = { ...DEFAULTS }, speed = 5, paused = false, fastUntil = 0, owed = 0, last = performance.now();

onmessage = (e) => {
  const m = e.data;
  if (m.type === "init" || m.type === "reset") { p = { ...DEFAULTS, ...m.p }; s = initSim(makeSim(), p); fastUntil = 0; owed = 0; }
  // a settled state for a lesson step (sim2d_states.js): Float32 arrays as base64
  else if (m.type === "load") {
    p = { ...DEFAULTS, ...m.p }; s = initSim(makeSim(), p);
    const f = (b) => { const bin = atob(b), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new Float32Array(u8.buffer); };
    for (const k of ["u", "th", "q", "Ts"]) s[k].set(f(m.state[k]));
    s.day = m.state.day; s.t = 0; fastUntil = 0; owed = 0;
  }
  else if (m.type === "params") {
    p = { ...DEFAULTS, ...m.p };
    if (!p.seasons) s.day = p.day;
    // with the seasons running, fast-forwarding would race through them, so a settings change doesn't; a lesson step
    // that asks to start settled (m.settle) still does, so its year starts from a balanced circulation
    fastUntil = p.seasons && !m.settle ? 0 : s.t / 86400 + (m.settleDays ?? 50);
  } else if (m.type === "speed") speed = m.speed;
  else if (m.type === "pause") paused = m.paused;
  else if (m.type === "stop") { running = false; return; }
  if (!running) { running = true; loop(); }
};

let running = false;
function loop() {
  if (!running) return;
  const now = performance.now(), dtReal = Math.min(0.25, (now - last) / 1000);
  last = now;
  const fast = s.t / 86400 < fastUntil;
  if (fast) while (performance.now() - now < 45 && s.t / 86400 < fastUntil) stepSim(s, p, DT_FAST);
  else if (!paused) {
    owed = Math.min(owed + (speed * 86400 * dtReal) / DT, 200);
    while (owed >= 1 && performance.now() - now < 25) { stepSim(s, p, DT); owed -= 1; }
  }
  if (!fast || now - lastPost > 200) { postMessage({ type: "state", t: s.t, day: s.day, fast, u: s.u, th: s.th, psi: s.psi, v: s.v, w: s.w, Ts: s.Ts }); lastPost = now; }
  setTimeout(loop, fast ? 0 : 30);
}
