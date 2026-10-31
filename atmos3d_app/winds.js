// Wind glyphs for one explorer layer: animated flow particles and wind barbs.
//
// Both draw at the layer's own height. Vertices carry (lon, lat, height m)
// plus a local east/north offset in km (barb shapes; zero for particles);
// the shader projects them (flat map or globe, project.js GEO_GLSL) and
// applies the vertical exaggeration and a small lift so the glyphs sit just
// above their level's fill -- so the vex slider and the globe toggle move
// them with the level without rebuilding anything.
//
// Particles: each drifts through the wind field blended between the two
// real steps around the current time (the same A/B/t blend as the level
// mesh), in "flow time" -- a visual speed-up of real time, not a forecast --
// and leaves a short fading trail a few pixels wide. They restart at a
// random spot when they age out, leave the domain, or wander below ground.
//
// Flow lines: streamlines of the nearer real step (streamlines.js), drawn with
// the barbs' screen-width strokes and halo, with arrowheads pointing
// downwind. Like barbs, a reading of one step, never a blend.
//
// Barbs: standard meteorological barbs (staff toward where the wind comes
// from, 5 kt half / 10 kt full / 50 kt pennant), drawn from the nearer real
// step only -- a barb is a reading, so it is never interpolated.
import * as THREE from "three";
import { GEO_GLSL } from "./project.js?v=20261031090012";
import { streamlines } from "./streamlines.js?v=20261031090012";

const VERT = /* glsl */ `
${GEO_GLSL}
attribute vec4 rgba;
attribute vec2 offset;
uniform float vex; uniform float lift;
varying vec4 vCol;
void main() {
  vCol = rgba;
  vec3 p = geoPosition(position.y, position.x, position.z * 0.001 * vex + lift, offset);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const FRAG = /* glsl */ `
varying vec4 vCol;
void main() {
  if (vCol.a < 0.01) discard;
  gl_FragColor = vCol;
}`;

function lineMaterial(lift, geo) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: { ...geo.uniforms, vex: { value: 120 }, lift: { value: lift } },
    transparent: true, depthWrite: false,
  });
}

// Bilinear sample of a row-major (lat j, lon i) field at fractional (fi, fj).
function bilinear(a, nlon, fi, fj) {
  const i = Math.floor(fi), j = Math.floor(fj), x = fi - i, y = fj - j;
  const k = j * nlon + i;
  return (a[k] * (1 - x) + a[k + 1] * x) * (1 - y) + (a[k + nlon] * (1 - x) + a[k + nlon + 1] * x) * y;
}

const M_PER_DEG = 111320;

// Particle streaks are drawn as instanced ribbons a fixed number of PIXELS
// wide (a GL line is always 1 px, too faint at basin scale): each instance
// is one trail segment; the shader projects both ends (flat or globe), then
// widens the segment sideways in screen space. Idea and look (pixel-width
// streaks, colour per level, brighter with speed) from the sibling Radar
// Volume Explorer's web/particles.js; normal alpha blending here rather than
// its additive glow, because this basemap is light and additive light
// washes out to white on it.
const RIBBON_VERT = /* glsl */ `
${GEO_GLSL}
attribute vec3 iA; attribute vec3 iB;      // segment ends: lon, lat, height (m)
attribute vec4 cA; attribute vec4 cB;      // colour + alpha at each end
uniform float vex; uniform float lift; uniform float width; uniform vec2 resolution;
varying vec4 vCol;
void main() {
  vec4 a = projectionMatrix * modelViewMatrix * vec4(geoPosition(iA.y, iA.x, iA.z * 0.001 * vex + lift, vec2(0.0)), 1.0);
  vec4 b = projectionMatrix * modelViewMatrix * vec4(geoPosition(iB.y, iB.x, iB.z * 0.001 * vex + lift, vec2(0.0)), 1.0);
  if (a.w <= 0.0 || b.w <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vCol = vec4(0.0); return; }
  vec2 sa = a.xy / a.w * resolution * 0.5, sb = b.xy / b.w * resolution * 0.5;   // pixels
  vec2 d = sb - sa;
  float len = length(d);
  vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  vec4 c = position.x < 0.5 ? a : b;
  // Sideways by half the width, and a little along the segment so joints overlap.
  vec2 px = nrm * position.y * width * 0.5 + dir * (position.x - 0.5) * width * 0.5;
  c.xy += px / (resolution * 0.5) * c.w;
  gl_Position = c;
  vCol = position.x < 0.5 ? cA : cB;
}`;
const RIBBON_FRAG = /* glsl */ `
uniform float opacity; uniform float fade; uniform float shown;
varying vec4 vCol;
void main() {
  float a = vCol.a * opacity * fade * shown;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol.rgb, a);
}`;

// Shared by every layer's particles, so one set of controls styles them all.
export const PARTICLE_STYLE = {
  width: { value: 2.2 },                     // px
  opacity: { value: 0.9 },
  // The levels' particles fade while the 3-D tab's region is shown (main.js);
  // the region's own 3-D particles get their own fade and opacity.
  fade: { value: 1 },
  resolution: { value: new THREE.Vector2(1, 1) },
  speed: 1,                                  // x the base flow time
};

const FADE_S = 0.4;
export class ParticleSystem {
  // grid: manifest.grid; geo: project.js makeGeo(); color: css
  // seedLats: [south, north] to seed only between those latitudes, weighted by area (cos latitude), for a grid that
  // reaches the pole (the hemisphere view), where seeding evenly in grid cells would crowd particles round the pole.
  // A grid with `wrap` (all the way round, its last column repeating the first) lets particles cross the seam.
  // sphere: step on the sphere as 3-D unit vectors instead of in grid index space, where dividing by cos(latitude)
  // blows up near the pole (the hemisphere view; panel 2026-10-17). speedRamp: [lo, hi] m/s, the particle invisible
  // below lo and at full strength from hi, and seeded mostly where the wind passes lo (so they draw the jet, not every
  // slack breeze). fadeLat: fade out over the 10 degrees south of it.
  constructor(grid, geo, { count = 3000, trail = 12, lift = 6, color = "#0d2233", renderOrder = 20, seedLats = null, sphere = false, speedRamp = null, fadeLat = null } = {}) {
    this.grid = grid;
    this.seedLats = seedLats;
    this.sphere = sphere; this.speedRamp = speedRamp; this.fadeLat = fadeLat;
    this.trail = trail;
    this.color = new THREE.Color(color);
    // Model seconds of drift per real second (x PARTICLE_STYLE.speed). Sized
    // for a basin-wide view: at 60 fps a 10 m/s wind moves ~15 km a frame, so
    // a 12-point trail is ~165 km long -- visible motion without particles
    // racing across the map.
    this.flowSeconds = 90000;
    this.lifetime = [3, 7];            // real seconds a particle lives
    const segs = trail - 1;
    this.maxCount = count;
    this.iA = new Float32Array(count * segs * 3);
    this.iB = new Float32Array(count * segs * 3);
    this.cA = new Float32Array(count * segs * 4);
    this.cB = new Float32Array(count * segs * 4);
    const geom = new THREE.InstancedBufferGeometry();
    // One quad per segment: x = 0 at end A, 1 at end B; y = -1/+1 across.
    geom.setAttribute("position", new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, -1, 0, 1, 1, 0, 0, 1, 0], 3));
    for (const [name, arr, size] of [["iA", this.iA, 3], ["iB", this.iB, 3], ["cA", this.cA, 4], ["cB", this.cB, 4]]) {
      geom.setAttribute(name, new THREE.InstancedBufferAttribute(arr, size).setUsage(THREE.DynamicDrawUsage));
    }
    this.geom = geom;
    this.material = new THREE.ShaderMaterial({
      vertexShader: RIBBON_VERT, fragmentShader: RIBBON_FRAG,
      uniforms: {
        ...geo.uniforms, vex: { value: 120 }, lift: { value: lift },
        width: PARTICLE_STYLE.width, opacity: PARTICLE_STYLE.opacity, fade: PARTICLE_STYLE.fade, resolution: PARTICLE_STYLE.resolution,
        shown: { value: 1 },                     // this system's own fade in and out (setShown)
      },
      transparent: true, depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geom, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.fi = new Float32Array(count);
    this.fj = new Float32Array(count);
    this.age = new Float32Array(count);
    this.life = new Float32Array(count);
    this.hist = new Float32Array(count * trail * 3);   // lon, lat, h per trail point, head first
    this.count = count;
    this.setCount(count);
    this.seeded = false;
  }

  get object() { return this.mesh; }

  // Fade in or out over FADE_S instead of appearing and vanishing (BUILD_SPEC §7; done 2026-10-09):
  // setShown says which way; tickFade(dt), every frame, moves the fade and hides the mesh once it's out.
  // Returns true while it's still moving (the page then keeps drawing).
  setShown(on) {
    this.target = on ? 1 : 0;
    if (on && !this.mesh.visible) { this.mesh.visible = true; this.material.uniforms.shown.value = 0; }
  }
  tickFade(dt) {
    const u = this.material.uniforms.shown, target = this.target ?? (this.mesh.visible ? 1 : 0);
    if (u.value === target) return false;
    const step = Math.min(dt, 0.1) / FADE_S;
    u.value = target > u.value ? Math.min(target, u.value + step) : Math.max(target, u.value - step);
    if (u.value === 0 && target === 0) this.mesh.visible = false;
    return true;
  }

  setCount(n) {
    this.count = Math.max(0, Math.min(this.maxCount, Math.round(n)));
    this.geom.instanceCount = this.count * (this.trail - 1);
  }

  _respawn(p, field) {
    const { nlat, nlon } = this.grid;
    for (let tries = 0; tries < 8; tries++) {
      this.fi[p] = Math.random() * (nlon - 1.001);
      this.fj[p] = Math.random() * (nlat - 1.001);
      if (this.seedLats) {
        // uniform in sin(latitude) between the two: equal numbers per unit area
        const D = Math.PI / 180, [a, b] = this.seedLats, lat = Math.asin(Math.sin(a * D) + Math.random() * (Math.sin(b * D) - Math.sin(a * D))) / D;
        this.fj[p] = Math.min(nlat - 1.001, Math.max(0, (lat - this.grid.lat0) / this.grid.dlat));
      }
      if (field && !this._above(field, p)) continue;
      if (field && this.speedRamp && tries < 7) {
        // keep this spot with a chance that grows with the wind's speed there (1 in 20 in calm air)
        const sp = Math.hypot(this._blend(field.uA, field.uB, field, p), this._blend(field.vA, field.vB, field, p));
        if (Math.random() > 0.05 + Math.max(0, Math.min(1, (sp - this.speedRamp[0]) / (this.speedRamp[1] - this.speedRamp[0])))) continue;
      }
      break;
    }
    this.age[p] = 0;
    this.life[p] = this.lifetime[0] + Math.random() * (this.lifetime[1] - this.lifetime[0]);
    const [lon, lat] = this._lonlat(p);
    const h = field ? this._h(field, p) : 0;
    for (let k = 0; k < this.trail; k++) this.hist.set([lon, lat, h], (p * this.trail + k) * 3);
  }

  _lonlat(p) {
    const g = this.grid;
    return [g.lon0 + this.fi[p] * g.dlon, g.lat0 + this.fj[p] * g.dlat];
  }

  _blend(aA, aB, field, p) {
    const n = this.grid.nlon, fi = this.fi[p], fj = this.fj[p];
    const a = bilinear(aA, n, fi, fj);
    return field.t > 0 ? a + (bilinear(aB, n, fi, fj) - a) * field.t : a;
  }

  _h(field, p) { return field.hA ? this._blend(field.hA, field.hB, field, p) : 0; }

  _above(field, p) { return !field.oA || this._blend(field.oA, field.oB, field, p) >= 0.5; }

  // field: {uA, vA, uB, vB, hA?, hB?, oA?, oB?, t} (m/s, m, 0/1); dt: real s.
  update(dt, field) {
    const { nlat, nlon, lat0, dlat, dlon } = this.grid;
    const T = this.trail, segs = T - 1;
    if (!this.seeded) {
      for (let p = 0; p < this.maxCount; p++) { this._respawn(p, field); this.age[p] = Math.random() * this.life[p]; }
      this.seeded = true;
    }
    const sim = dt * this.flowSeconds * PARTICLE_STYLE.speed;
    const { r, g, b } = this.color;
    for (let p = 0; p < this.count; p++) {
      this.age[p] += dt;
      const u = this._blend(field.uA, field.uB, field, p);
      const v = this._blend(field.vA, field.vB, field, p);
      const lat = lat0 + this.fj[p] * dlat;
      if (this.sphere) {
        // the point as a unit vector, moved along the local east and north by the wind, then back to lat/lon
        const D = Math.PI / 180, ph = lat * D, la = (this.grid.lon0 + this.fi[p] * dlon) * D;
        const cp = Math.cos(ph), sp = Math.sin(ph), cl = Math.cos(la), sl = Math.sin(la), k = sim / 6371000;
        const x = cp * cl + k * (-u * sl - v * sp * cl), y = cp * sl + k * (u * cl - v * sp * sl), z = sp + k * v * cp;
        const r = Math.hypot(x, y, z);
        const nlat = Math.asin(Math.max(-1, Math.min(1, z / r))) / D, nlon = ((Math.atan2(y, x) / D) % 360 + 360) % 360;
        this.fj[p] = (nlat - lat0) / dlat;
        this.fi[p] = (nlon - this.grid.lon0) / dlon;
      } else {
        this.fi[p] += (u * sim) / (M_PER_DEG * Math.cos((lat * Math.PI) / 180)) / dlon;
        this.fj[p] += (v * sim) / M_PER_DEG / dlat;
      }
      if (this.grid.wrap) this.fi[p] = ((this.fi[p] % (nlon - 1)) + (nlon - 1)) % (nlon - 1);   // round past the seam
      const out = this.fi[p] < 0 || this.fi[p] > nlon - 1.001 || this.fj[p] < 0 || this.fj[p] > nlat - 1.001;
      if (out || this.age[p] > this.life[p] || !this._above(field, p) || !Number.isFinite(u + v)) {
        this._respawn(p, field);
      } else {
        const base = p * T * 3;
        this.hist.copyWithin(base + 3, base, base + (T - 1) * 3);   // shift trail back one slot
        const [lon, la] = this._lonlat(p);
        this.hist[base] = lon; this.hist[base + 1] = la; this.hist[base + 2] = this._h(field, p);
      }
      // Fade in/out over the lifetime; stronger with speed (full from ~25 m/s);
      // fading toward the tail.
      const lifeFrac = this.age[p] / this.life[p];
      const fade = Math.max(0, Math.min(1, lifeFrac * 5, (1 - lifeFrac) * 4));
      let strength = fade * (0.45 + 0.55 * Math.min(1, Math.hypot(u, v) / 25));
      if (this.speedRamp) strength = fade * Math.max(0, Math.min(1, (Math.hypot(u, v) - this.speedRamp[0]) / (this.speedRamp[1] - this.speedRamp[0])));
      if (this.fadeLat != null) strength *= Math.max(0, Math.min(1, (lat0 + this.fj[p] * dlat - this.fadeLat + 10) / 10));
      for (let k = 0; k < segs; k++) {
        const s = p * segs + k, h0 = (p * T + k) * 3;
        this.iA[s * 3] = this.hist[h0]; this.iA[s * 3 + 1] = this.hist[h0 + 1]; this.iA[s * 3 + 2] = this.hist[h0 + 2];
        this.iB[s * 3] = this.hist[h0 + 3]; this.iB[s * 3 + 1] = this.hist[h0 + 4]; this.iB[s * 3 + 2] = this.hist[h0 + 5];
        const a0 = strength * (1 - k / segs), a1 = strength * (1 - (k + 1) / segs);
        this.cA[s * 4] = r; this.cA[s * 4 + 1] = g; this.cA[s * 4 + 2] = b; this.cA[s * 4 + 3] = a0;
        this.cB[s * 4] = r; this.cB[s * 4 + 1] = g; this.cB[s * 4 + 2] = b; this.cB[s * 4 + 3] = a1;
      }
    }
    for (const name of ["iA", "iB", "cA", "cB"]) this.geom.attributes[name].needsUpdate = true;
  }
}

// Barb segments for one station, in scene km (x east, y north; Mercator is
// conformal, so compass directions carry over unchanged). u, v in knots;
// L = staff length. Ported from the Radar Volume Explorer project
// (web/sounding.js barbSegments), which drew them in the same frame.
export function barbSegments(x, y, u, v, L) {
  const kt = Math.hypot(u, v), out = [];
  if (kt < 2.5) {                                       // calm: a small circle
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * 2 * Math.PI, b = ((k + 1) / 12) * 2 * Math.PI, r = L * 0.12;
      out.push([x + r * Math.cos(a), y + r * Math.sin(a)], [x + r * Math.cos(b), y + r * Math.sin(b)]);
    }
    return out;
  }
  const s = [-u / kt, -v / kt], side = [s[1], -s[0]];   // toward the source; barbs clockwise
  const tip = [x + s[0] * L, y + s[1] * L];
  out.push([x, y], tip);
  let left = Math.round(kt / 5) * 5, pos = 0;
  const step = L * 0.13, flen = L * 0.4;
  const at = (d) => [tip[0] - s[0] * d, tip[1] - s[1] * d];
  while (left >= 50) {                                   // pennant: a triangle
    const a = at(pos), b = at(pos + step), p = [a[0] + side[0] * flen, a[1] + side[1] * flen];
    out.push(a, p, p, b);
    pos += step * 1.2; left -= 50;
  }
  while (left >= 10) {
    const a = at(pos), p = [a[0] + side[0] * flen + s[0] * step * 0.6, a[1] + side[1] * flen + s[1] * step * 0.6];
    out.push(a, p);
    pos += step; left -= 10;
  }
  if (left >= 5) {
    if (pos === 0) pos = step;                           // a lone half barb sits in from the tip
    const a = at(pos), p = [a[0] + side[0] * flen / 2 + s[0] * step * 0.3, a[1] + side[1] * flen / 2 + s[1] * step * 0.3];
    out.push(a, p);
  }
  return out;
}

// Barbs as screen-space strokes: each segment is a quad widened to `width`
// pixels in the vertex shader (WebGL ignores line widths, so 1 px barbs were
// all it could draw -- invisible over the dark satellite, user report
// 2026-09-28). Drawn twice from one geometry: a halo of the opposite
// brightness a little wider, then the ink in the level's own colour, so
// they read on white charts, grey satellite and colour fills alike.
const BARB_VERT = /* glsl */ `
${GEO_GLSL}
attribute vec2 offA; attribute vec2 offB; attribute vec2 corner;   // corner: (0 = A / 1 = B, side -1 / +1)
uniform float vex; uniform float lift; uniform float width; uniform vec2 viewport;
void main() {
  float z = position.z * 0.001 * vex + lift;
  vec4 a = projectionMatrix * modelViewMatrix * vec4(geoPosition(position.y, position.x, z, offA), 1.0);
  vec4 b = projectionMatrix * modelViewMatrix * vec4(geoPosition(position.y, position.x, z, offB), 1.0);
  vec2 sa = a.xy / a.w * viewport, sb = b.xy / b.w * viewport;     // in pixels (x2: NDC spans 2)
  vec2 dir = normalize(sb - sa + vec2(1e-6, 0.0)), nrm = vec2(-dir.y, dir.x);
  vec4 p = corner.x < 0.5 ? a : b;
  // caps reach most of a half-width (+0.5 px) past each end, so a line's pieces overlap at every joint: at 0.5 x width
  // the halo showed through the joints as white ticks across flow lines (user report, 2026-10-14)
  vec2 ext = nrm * corner.y * width + dir * (corner.x < 0.5 ? -1.0 : 1.0) * (0.75 * width + 0.5);
  p.xy += ext / viewport * p.w;
  gl_Position = p;
}`;
const BARB_FRAG = /* glsl */ `
uniform vec3 color; uniform float alpha;
void main() { gl_FragColor = vec4(color, alpha); }`;

// A flow line drawn as one continuous ribbon (user report 2026-10-15: "stream lines still a little jagged"): each point
// gets two vertices pushed out along the mitre of its two neighbouring pieces, measured on the screen, so the edges run
// smoothly round a curve. Drawn as separate rectangles with square ends, the outer corners at every joint stuck out
// past the curve and the halo showed them as a fine sawtooth. offPrev / offNext: the neighbouring points, in km from this
// one ((0, 0) at a line's ends); side: -1 / +1.
const FLOW_VERT = /* glsl */ `
${GEO_GLSL}
attribute vec2 offPrev; attribute vec2 offNext; attribute float side;
uniform float vex; uniform float lift; uniform float width; uniform vec2 viewport;
void main() {
  float z = position.z * 0.001 * vex + lift;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(geoPosition(position.y, position.x, z, vec2(0.0)), 1.0);
  bool hasPrev = dot(offPrev, offPrev) > 0.0, hasNext = dot(offNext, offNext) > 0.0;
  vec4 pp = projectionMatrix * modelViewMatrix * vec4(geoPosition(position.y, position.x, z, offPrev), 1.0);
  vec4 pn = projectionMatrix * modelViewMatrix * vec4(geoPosition(position.y, position.x, z, offNext), 1.0);
  vec2 s = p.xy / p.w * viewport, sp = pp.xy / pp.w * viewport, sn = pn.xy / pn.w * viewport;
  vec2 d1 = hasPrev ? normalize(s - sp + vec2(1e-6, 0.0)) : normalize(sn - s + vec2(1e-6, 0.0));
  vec2 d2 = hasNext ? normalize(sn - s + vec2(1e-6, 0.0)) : d1;
  vec2 t = normalize(d1 + d2 + vec2(1e-6, 0.0)), n = vec2(-t.y, t.x), n1 = vec2(-d1.y, d1.x);
  float miter = width / max(dot(n, n1), 0.5);          // capped, so a sharp bend can't throw a spike
  vec2 ext = n * side * miter;
  if (!hasPrev) ext -= d1 * (0.5 * width + 0.5);        // a short cap past each end of the line
  if (!hasNext) ext += d2 * (0.5 * width + 0.5);
  p.xy += ext / viewport * p.w;
  gl_Position = p;
}`;
function flowMaterial(lift, geo, width, color, alpha) {
  return new THREE.ShaderMaterial({
    vertexShader: FLOW_VERT, fragmentShader: BARB_FRAG, transparent: true, depthWrite: false,
    uniforms: { ...geo.uniforms, vex: { value: 120 }, lift: { value: lift }, width: { value: width },
      viewport: { value: new THREE.Vector2(800, 600) }, color: { value: new THREE.Color(color) }, alpha: { value: alpha } },
  });
}

const HALO_PX = 1.5;       // the halo's extra width: 0.75 px each side

function barbMaterial(lift, geo, width, color, alpha) {
  return new THREE.ShaderMaterial({
    vertexShader: BARB_VERT, fragmentShader: BARB_FRAG, transparent: true, depthWrite: false,
    uniforms: { ...geo.uniforms, vex: { value: 120 }, lift: { value: lift }, width: { value: width },
      viewport: { value: new THREE.Vector2(800, 600) }, color: { value: new THREE.Color(color) }, alpha: { value: alpha } },
  });
}

export class BarbLayer {
  constructor(grid, geo, { every = 6, length = 190, lift = 8, color = "#111", renderOrder = 21, width = 1.2 } = {}) {
    this.grid = grid;
    this.every = every;
    this.length = length;
    // Thin strokes and a thin halo: at 1.8 + 2.5 px the feathers ran together
    // into a block (user report, 2026-09-28).
    // the halo opaque: where pieces overlap at their joints, a see-through halo doubled up into white blobs
    // (the stroke shader's width is a half-width, so the halo adds HALO_PX / 2 a side: 0.75 px, as intended; it had
    // been adding 1.5 px a side, which made flow lines read as thick white bands, user report 2026-10-14)
    this.halo = new THREE.Mesh(new THREE.BufferGeometry(), barbMaterial(lift, geo, width + HALO_PX / 2, "#ffffff", 1));
    this.ink = new THREE.Mesh(this.halo.geometry, barbMaterial(lift, geo, width, color, 1));
    this.group = new THREE.Group();
    for (const [m, r] of [[this.halo, renderOrder], [this.ink, renderOrder + 1]]) { m.frustumCulled = false; m.renderOrder = r; this.group.add(m); }
    this.material = this.ink.material;        // vex/lift are kept in step on both (setVex, setLift)
    this.key = null;
  }

  get object() { return this.group; }

  // Ink in the level's colour; halo of the opposite brightness.
  setColors(ink, halo) { this.ink.material.uniforms.color.value.set(ink); this.halo.material.uniforms.color.value.set(halo); }
  setWidth(px) { this.ink.material.uniforms.width.value = px; this.halo.material.uniforms.width.value = px + HALO_PX / 2; }
  // Fade (0..1) while the 3-D tab's region is shown.
  setFade(f) { this.ink.material.uniforms.alpha.value = f; this.halo.material.uniforms.alpha.value = f; }
  setVex(v) { this.ink.material.uniforms.vex.value = v; this.halo.material.uniforms.vex.value = v; }
  setLift(v) { this.ink.material.uniforms.lift.value = v; this.halo.material.uniforms.lift.value = v; }
  // Half the drawing buffer's size in pixels (clip space spans 2).
  setViewport(w, h) { for (const m of [this.ink, this.halo]) m.material.uniforms.viewport.value.set(w / 2, h / 2); }

  // u, v in m/s; h in m (or null); o: 0/1 above-ground mask (or null).
  build(key, u, v, h, o) {
    if (key === this.key) return;
    this.key = key;
    const { nlat, nlon, lat0, dlat, lon0, dlon } = this.grid;
    const pos = [], offA = [], offB = [], corner = [], idx = [];
    const KT = 1.943844;
    let n = 0;
    for (let j = Math.floor(this.every / 2); j < nlat; j += this.every) {
      for (let i = Math.floor(this.every / 2); i < nlon; i += this.every) {
        const k = j * nlon + i;
        if (o && o[k] < 0.5) continue;
        const lat = lat0 + j * dlat, lon = lon0 + i * dlon, z = h ? h[k] : 0;
        const seg = barbSegments(0, 0, u[k] * KT, v[k] * KT, this.length);
        for (let s = 0; s + 1 < seg.length; s += 2) {           // pairs: segment ends
          for (const c of [[0, -1], [0, 1], [1, -1], [1, 1]]) {
            pos.push(lon, lat, z); offA.push(...seg[s]); offB.push(...seg[s + 1]); corner.push(...c);
          }
          idx.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
          n += 4;
        }
      }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geom.setAttribute("offA", new THREE.Float32BufferAttribute(offA, 2));
    geom.setAttribute("offB", new THREE.Float32BufferAttribute(offB, 2));
    geom.setAttribute("corner", new THREE.Float32BufferAttribute(corner, 2));
    geom.setIndex(idx);
    this.halo.geometry.dispose();
    this.halo.geometry = geom;
    this.ink.geometry = geom;
  }
}

// Flow lines (user request, 2026-09-28: the wind "as particles, barbs or flow
// lines"). Same strokes and halo as the barbs. gapCells: line spacing in grid
// cells (set by zoom, like barb spacing); arrowKm: arrowhead size.
export class FlowLayer extends BarbLayer {
  constructor(grid, geo, opts = {}) {
    super(grid, geo, opts);
    this.gapCells = 8;
    this.arrowKm = 60;
    const width = opts.width ?? 1.2, lift = opts.lift ?? 8, renderOrder = opts.renderOrder ?? 21;
    // the lines as ribbons (FLOW_VERT); the inherited halo/ink meshes draw only the arrowheads
    this.lineHalo = new THREE.Mesh(new THREE.BufferGeometry(), flowMaterial(lift, geo, width + HALO_PX / 2, "#ffffff", 1));
    this.lineInk = new THREE.Mesh(this.lineHalo.geometry, flowMaterial(lift, geo, width, opts.color ?? "#111", 1));
    // halos under all the inks: line halo, arrow halo, line ink, arrow ink
    this.lineHalo.renderOrder = renderOrder; this.halo.renderOrder = renderOrder; this.lineInk.renderOrder = renderOrder + 1; this.ink.renderOrder = renderOrder + 1;
    for (const m of [this.lineHalo, this.lineInk]) { m.frustumCulled = false; this.group.add(m); }
  }
  get meshes() { return [this.halo, this.ink, this.lineHalo, this.lineInk]; }
  setColors(ink, halo) { for (const m of [this.ink, this.lineInk]) m.material.uniforms.color.value.set(ink); for (const m of [this.halo, this.lineHalo]) m.material.uniforms.color.value.set(halo); }
  setWidth(px) { for (const m of [this.ink, this.lineInk]) m.material.uniforms.width.value = px; for (const m of [this.halo, this.lineHalo]) m.material.uniforms.width.value = px + HALO_PX / 2; }
  setFade(f) { for (const m of this.meshes) m.material.uniforms.alpha.value = f; }
  setVex(v) { for (const m of this.meshes) m.material.uniforms.vex.value = v; }
  setLift(v) { for (const m of this.meshes) m.material.uniforms.lift.value = v; }
  setViewport(w, h) { for (const m of this.meshes) m.material.uniforms.viewport.value.set(w / 2, h / 2); }

  build(key, u, v, h, o) {
    if (key === this.key) return;
    this.key = key;
    const { nlon, lat0, dlat, lon0, dlon } = this.grid;
    // step: how far each piece reaches, in cells. Zoomed in on a coarse grid (few cells between lines) pieces of half a
    // cell are long on screen and the curves turn angular, so they get shorter there (user report, 2026-10-14).
    // About eight pieces per gap between lines, whatever the grid: on a 1° grid zoomed in that's a fifth of a cell (smooth
    // curves), on the 3 km grid a few cells.
    const step = Math.min(3, Math.max(0.2, this.gapCells / 8)), k = 0.5 / step;
    // keepLine (optional): which traced lines to draw (the hemisphere traces on a grid padded past the seam and keeps
    // one copy of each line)
    const lines = streamlines(u, v, this.grid, { spacing: this.gapCells, step, maxSteps: Math.round(this.gapCells * 12 * k), minPoints: Math.max(6, Math.round(this.gapCells * 1.5 * k)), mask: o })
      .filter(this.keepLine ?? (() => true));
    const KM = M_PER_DEG / 1000;
    // the ribbons
    const lp = [], lPrev = [], lNext = [], lSide = [], lIdx = [];
    let ln = 0;
    // the arrowheads (BARB_VERT quads)
    const pos = [], offA = [], offB = [], corner = [], idx = [];
    let n = 0;
    const quad = (lon, lat, z, a, b) => {
      for (const c of [[0, -1], [0, 1], [1, -1], [1, 1]]) { pos.push(lon, lat, z); offA.push(...a); offB.push(...b); corner.push(...c); }
      idx.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
      n += 4;
    };
    const arrowEvery = 2 * Math.max(8, Math.round(this.gapCells * 3 * k));  // points between arrowheads (about 1.5 line gaps; Chaikin doubles the points)
    // one pass of Chaikin's corner cutting (each corner replaced by points a quarter of the way along its two pieces), ends
    // kept: rounds off what's left of the small angles between pieces without moving the line
    const chaikin = (pts) => {
      if (pts.length < 3) return pts;
      const out = [pts[0]];
      for (let q = 0; q + 1 < pts.length; q++) {
        const [ai, aj] = pts[q], [bi, bj] = pts[q + 1];
        out.push([0.75 * ai + 0.25 * bi, 0.75 * aj + 0.25 * bj], [0.25 * ai + 0.75 * bi, 0.25 * aj + 0.75 * bj]);
      }
      out.push(pts.at(-1));
      return out;
    };
    for (const raw of lines) {
      const pts = chaikin(raw);
      const geo = pts.map(([fi, fj]) => ({ lat: lat0 + fj * dlat, lon: lon0 + fi * dlon, z: h ? bilinear(h, nlon, Math.min(fi, nlon - 1.001), fj) : 0 }));
      const km = (A, B) => { const c = Math.cos((A.lat * Math.PI) / 180); return [(B.lon - A.lon) * KM * c, (B.lat - A.lat) * KM]; };
      const base = ln;
      geo.forEach((P, q) => {
        const prev = q > 0 ? km(P, geo[q - 1]) : [0, 0], next = q + 1 < geo.length ? km(P, geo[q + 1]) : [0, 0];
        for (const sd of [-1, 1]) { lp.push(P.lon, P.lat, P.z); lPrev.push(...prev); lNext.push(...next); lSide.push(sd); }
        ln += 2;
        if (q + 1 < geo.length) { const a = base + 2 * q; lIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        if (q + 1 < geo.length && (q + 1) % arrowEvery === Math.floor(arrowEvery / 2)) {        // arrowhead at the piece's end
          const [dx, dy] = next, m = Math.hypot(dx, dy) || 1, ex = dx / m, ey = dy / m, A = this.arrowKm;
          for (const s of [1, -1]) quad(P.lon, P.lat, P.z, [dx, dy], [dx - A * (ex * 0.87 - s * ey * 0.5), dy - A * (ey * 0.87 + s * ex * 0.5)]);
        }
      });
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.Float32BufferAttribute(lp, 3));
    lg.setAttribute("offPrev", new THREE.Float32BufferAttribute(lPrev, 2));
    lg.setAttribute("offNext", new THREE.Float32BufferAttribute(lNext, 2));
    lg.setAttribute("side", new THREE.Float32BufferAttribute(lSide, 1));
    lg.setIndex(lIdx);
    this.lineHalo.geometry.dispose();
    this.lineHalo.geometry = lg; this.lineInk.geometry = lg;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geom.setAttribute("offA", new THREE.Float32BufferAttribute(offA, 2));
    geom.setAttribute("offB", new THREE.Float32BufferAttribute(offB, 2));
    geom.setAttribute("corner", new THREE.Float32BufferAttribute(corner, 2));
    geom.setIndex(idx);
    this.halo.geometry.dispose();
    this.halo.geometry = geom;
    this.ink.geometry = geom;
    this.lineCount = lines.length;
  }
}
