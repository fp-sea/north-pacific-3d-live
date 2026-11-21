// SYNC: Wind Volume Explorer web/shell/tour.js@d419a0d (itself from radar-explorer web/app.js).
// Adapted: stops also keep the view shape (flat or globe) and field of view;
// the flights are driven by the page (fly), so a recording can step them.
//
// A tour: camera stops you add, flown between in order -- 2.5 s eased
// flight, then a 1.2 s hold. Kept on this device only (localStorage, a
// convenience). Stops store the vertical stretch they were taken at, and
// heights are rescaled to the one in use now.

export const LEG_MS = 2500, HOLD_MS = 1200;

export const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

export class Tour {
  constructor(key) { this.key = key; this.stops = []; this.playing = false; this.load(); }
  load() { try { this.stops = JSON.parse(localStorage.getItem(this.key)) || []; } catch { this.stops = []; } }
  save() { try { localStorage.setItem(this.key, JSON.stringify(this.stops)); } catch { /* not kept: private window etc. */ } }
  add(stop) {
    if (![...stop.pos, ...stop.target].every(Number.isFinite)) return;
    this.stops.push(stop); this.save();
  }
  clear() { this.stops = []; this.save(); }

  // A stop's camera with heights rescaled to the stretch in use now.
  scaled(st, vexNow) {
    const k = vexNow / (st.vex || vexNow);
    return { ...st, pos: [st.pos[0], st.pos[1], st.pos[2] * k], target: [st.target[0], st.target[1], st.target[2] * k] };
  }

  // Frames for a recording at `fps`: [{a, b, k}] where k eases a -> b; holds repeat b at k = 1.
  frames(fps) {
    const out = [], legN = Math.round((LEG_MS / 1000) * fps), holdN = Math.round((HOLD_MS / 1000) * fps);
    for (let i = 0; i < this.stops.length; i++) {
      if (i > 0) for (let f = 1; f <= legN; f++) out.push({ a: i - 1, b: i, k: ease(f / legN) });
      for (let f = 0; f < holdN; f++) out.push({ a: i, b: i, k: 1 });
    }
    return out;
  }
}
