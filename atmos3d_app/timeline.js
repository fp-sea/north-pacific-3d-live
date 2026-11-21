// Time for the explorer, in hours from manifest.anchor (the GFS init).
// `leads` are one model's real steps (hours, may be negative: past valid
// times come from earlier runs), 3-hourly then 6-hourly at the end.
// `observed` are real satellite frame times (hours), which run up to the
// build time. Anything between two model steps is a display-only blend of
// its neighbours; observations are never blended.
//
// No imports, so node --test can load it directly (tests/js/).
export const BASE_STEP_H = 3;   // playback speed unit: "steps per second" means 3 h steps

export class Timeline {
  // leads: real model steps (h); observed: real observation times (h)
  constructor(leads, observed = []) {
    this.playing = false;
    this.stepsPerSecond = 1.6;       // 3 h steps per second of playback
    this.repeat = true;              // at the end: loop back to the start (false: stop there)
    this.setTimes(leads, observed);
    this.pos = this.start;
  }

  setTimes(leads, observed = this.observed ?? []) {
    this.leads = leads;
    this.observed = [...observed].sort((a, b) => a - b);
    this.start = Math.min(leads[0], this.observed.length ? this.observed[0] : Infinity);
    this.end = Math.max(leads[leads.length - 1], this.observed.length ? this.observed[this.observed.length - 1] : -Infinity);
    // Every real time you can step to: observation frames and model steps.
    this.real = [...new Set([...this.observed, ...leads])].sort((a, b) => a - b);
    this.pos = this.clamp(this.pos ?? this.start);
  }

  clamp(h) { return Math.min(Math.max(h, this.start), this.end); }

  get last() { return this.leads.length - 1; }
  // True where this model has no data (before its first step or after its last).
  get beforeModel() { return this.pos < this.leads[0] - 1e-6; }
  get afterModel() { return this.pos > this.leads[this.last] + 1e-6; }

  // {i0, i1, t}: the two real model steps around `hours` and the blend
  // weight (0 = i0). Outside the model's range this is its first/last step, t = 0.
  segment(hours = this.pos) {
    const h = Math.min(Math.max(hours, this.leads[0]), this.leads[this.last]);
    let i0 = 0;
    while (i0 < this.last && this.leads[i0 + 1] <= h) i0++;
    if (i0 >= this.last) return { i0: this.last, i1: this.last, t: 0 };
    return { i0, i1: i0 + 1, t: (h - this.leads[i0]) / (this.leads[i0 + 1] - this.leads[i0]) };
  }

  isInterpolated() {
    if (this.beforeModel || this.afterModel) return false;
    const { t } = this.segment();
    return t > 1e-3 && t < 1 - 1e-3;
  }

  // Advance while playing at a constant rate in HOURS (stepsPerSecond x 3 h),
  // so motion keeps its true speed through the 6-hourly tail -- those steps
  // simply take twice as long. `isReady(i)` says whether model step i is
  // loaded; playback holds rather than showing a step it doesn't have yet.
  // The end rests one base step's time before looping to the start.
  // `loop` ({start, end} in hours, or null) narrows the playback to that span, e.g. the satellite's
  // hours (user request 2026-10-09); outside it, playback jumps to its start.
  // `repeat` false (user request 2026-10-09: "play either stops at end or loops"): at the end playback
  // stops (playing becomes false) instead of looping.
  span() {
    return this.loop ? { s: Math.max(this.start, this.loop.start), e: Math.min(this.end, this.loop.end) } : { s: this.start, e: this.end };
  }
  atEnd() { return this.pos >= this.span().e - 1e-9; }
  tick(dtSeconds, isReady) {
    if (!this.playing) return false;
    const dh = dtSeconds * this.stepsPerSecond * BASE_STEP_H;
    const { s, e } = this.span();
    if (this.pos < s - 1e-9 || this.pos > e + 1e-9) { this.pos = s; this.rest = 0; return true; }
    if (this.pos >= e - 1e-9) {
      if (!this.repeat) { this.playing = false; this.rest = 0; return true; }
      this.rest = (this.rest ?? 0) + dh;       // hold on the last frame, then loop
      if (this.rest < BASE_STEP_H) return false;
      this.rest = 0;
      this.pos = s;
      return true;
    }
    const next = Math.min(this.pos + dh, e);
    if (next >= this.leads[0] && next <= this.leads[this.last]) {
      const { i0, i1 } = this.segment(next);
      if (!isReady(i0) || !isReady(i1)) return false;
    }
    this.pos = next;
    return true;
  }

  // Jump to the previous/next real time (observation frame or model step).
  step(delta) {
    const eps = 1e-6;
    if (delta > 0) this.pos = this.real.find((h) => h > this.pos + eps) ?? this.pos;
    else this.pos = [...this.real].reverse().find((h) => h < this.pos - eps) ?? this.pos;
  }

  // Nearest real time to the current position (used when pausing).
  snap() {
    let best = this.real[0];
    for (const h of this.real) if (Math.abs(h - this.pos) < Math.abs(best - this.pos)) best = h;
    this.pos = best ?? this.start;
  }
}
