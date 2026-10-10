// 3-D wind particles (user request, 2026-09-28): particles at many heights
// at once, inside a horizontal slab you move up and down through the
// atmosphere ("like CT scans") and make thicker or thinner, up to the
// whole depth. Each particle keeps its own altitude and drifts with the
// HORIZONTAL wind at that altitude: the models' levels are filled linearly
// in height between the two levels around it (as the slice and volume do),
// blended between the two real steps around the time shown.
//
// Rise and sink (user request, 2026-09-28): with `vertical` > 0 each particle
// also climbs or sinks with the model's vertical motion there. 1 = true
// speed: in the same flow time as the horizontal drift, so the slope of a
// path is the air's real slope (then stretched by the page's vertical
// exaggeration, like everything else). > 1 exaggerates the climb itself,
// and the page says so. A particle that reaches the ground or the top
// respawns.
//
// Rendering, trails, fade and speed scale come from ParticleSystem; only the
// motion (a height per particle) and the colour (by height or by speed) are
// new here.
import { PARTICLE_STYLE, ParticleSystem } from "./winds.js?v=20261010090011";
import { windAt } from "./particles3d_math.js?v=20261010090011";

const M_PER_DEG = 111_320;

export class ParticleVolume extends ParticleSystem {
  // colorAt(zM, speed) -> [r, g, b] (0..1).
  constructor(grid, geo, { count = 8000, colorAt, renderOrder = 700 } = {}) {
    super(grid, geo, { count, lift: 0, renderOrder });
    // Their own opacity and fade (not the levels' shared style): the region's particles stay bright while the rest fades.
    this.material.uniforms.opacity = { value: 0.9 };
    this.material.uniforms.fade = { value: 1 };
    this.z = new Float32Array(count);
    this.colorAt = colorAt;
    this.slab = { lo: 0, hi: 12500 };
    this.vertical = 0;
    // Optional horizontal region (a vertical wall's band, main.js):
    // {seed() -> [fi, fj] or null, inside(fi, fj) -> bool}. Particles start
    // in it and start again when they drift out.
    this.region = null;
  }

  setRegion(region, key) {
    if (key === this.regionKey) return;
    this.region = region; this.regionKey = key;
    this.seeded = false;
  }

  setSlab(loM, hiM) {
    if (loM === this.slab.lo && hiM === this.slab.hi) return;
    this.slab = { lo: loM, hi: hiM };
    this.seeded = false;                              // re-seed inside the new slab
  }

  _respawn(p, field) {
    const { nlat, nlon } = this.grid;
    for (let tries = 0; tries < 12; tries++) {
      const s = this.region ? this.region.seed() : null;
      this.fi[p] = s ? s[0] : Math.random() * (nlon - 1.001);
      this.fj[p] = s ? s[1] : Math.random() * (nlat - 1.001);
      this.z[p] = this.slab.lo + Math.random() * (this.slab.hi - this.slab.lo);
      if (!field || windAt(field, nlon, this.fi[p], this.fj[p], this.z[p])) break;
    }
    this.age[p] = 0;
    this.life[p] = this.lifetime[0] + Math.random() * (this.lifetime[1] - this.lifetime[0]);
    const [lon, lat] = this._lonlat(p);
    for (let k = 0; k < this.trail; k++) this.hist.set([lon, lat, this.z[p]], (p * this.trail + k) * 3);
  }

  // field: as windAt's; dt: real seconds.
  update(dt, field) {
    const { nlat, nlon, lat0, dlat, dlon } = this.grid;
    const T = this.trail, segs = T - 1;
    if (!this.seeded) {
      for (let p = 0; p < this.maxCount; p++) { this._respawn(p, field); this.age[p] = Math.random() * this.life[p]; }
      this.seeded = true;
    }
    const sim = dt * this.flowSeconds * PARTICLE_STYLE.speed;
    for (let p = 0; p < this.count; p++) {
      this.age[p] += dt;
      const w = windAt(field, nlon, this.fi[p], this.fj[p], this.z[p]);
      if (w) {
        const lat = lat0 + this.fj[p] * dlat;
        this.fi[p] += (w.u * sim) / (M_PER_DEG * Math.cos((lat * Math.PI) / 180)) / dlon;
        this.fj[p] += (w.v * sim) / M_PER_DEG / dlat;
        if (this.vertical) this.z[p] += (w.w / 100) * sim * this.vertical;
      }
      const out = this.fi[p] < 0 || this.fi[p] > nlon - 1.001 || this.fj[p] < 0 || this.fj[p] > nlat - 1.001
        || (this.region && !this.region.inside(this.fi[p], this.fj[p]));
      if (!w || out || this.age[p] > this.life[p]) { this._respawn(p, field); continue; }
      const base = p * T * 3;
      this.hist.copyWithin(base + 3, base, base + (T - 1) * 3);
      const [lon, la] = this._lonlat(p);
      this.hist[base] = lon; this.hist[base + 1] = la; this.hist[base + 2] = this.z[p];
      const speed = Math.hypot(w.u, w.v);
      const [r, g, b] = this.colorAt(this.z[p], speed, w.w, w.q);
      const lifeFrac = this.age[p] / this.life[p];
      const fade = Math.max(0, Math.min(1, lifeFrac * 5, (1 - lifeFrac) * 4));
      const strength = fade * (0.45 + 0.55 * Math.min(1, speed / 25));
      for (let k = 0; k < segs; k++) {
        const s = p * segs + k, h0 = (p * T + k) * 3;
        const i3 = s * 3, c4 = s * 4, H = this.hist;
        this.iA[i3] = H[h0]; this.iA[i3 + 1] = H[h0 + 1]; this.iA[i3 + 2] = H[h0 + 2];
        this.iB[i3] = H[h0 + 3]; this.iB[i3 + 1] = H[h0 + 4]; this.iB[i3 + 2] = H[h0 + 5];
        this.cA[c4] = r; this.cA[c4 + 1] = g; this.cA[c4 + 2] = b; this.cA[c4 + 3] = strength * (1 - k / segs);
        this.cB[c4] = r; this.cB[c4 + 1] = g; this.cB[c4 + 2] = b; this.cB[c4 + 3] = strength * (1 - (k + 1) / segs);
      }
    }
    for (const name of ["iA", "iB", "cA", "cB"]) this.geom.attributes[name].needsUpdate = true;
  }
}
