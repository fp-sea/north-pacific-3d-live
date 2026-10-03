// The Simulate mode's particles (reference section 9.5): tracers anywhere on
// the globe, carried by the latitude-height model's winds (sim2d.js). The
// model is the same all round each latitude circle, so a particle's wind
// depends only on its latitude and height: u (east-west) at its true speed,
// the overturning (v north-south, w up-down) sped up by `exag` -- the same
// factor for both, so particles still follow the cells' streamlines -- and
// labelled as such on the page. They're coloured by height (low: pale
// cyan, high: orange; both show on the plain dark-blue globe), so rising and
// sinking read at a glance, and restart at a random place when they leave the
// model's depth or age out. Each has a short tail pointing back along its
// path (where it was a fraction of a second ago), so direction shows in a
// still picture.
//
// A slab (user request 2026-09-30): all the particles in one band of
// longitudes, so the overturning can be watched side-on. The model is the
// same at every longitude, so a particle carried out of one side of the slab
// by the east-west wind re-enters the other side at the same latitude and
// height: exactly what a neighbour would do, not an approximation.
//
// With the 3-D model (pe3d.js, update3d): the winds come from its grid at the
// particle's latitude, longitude and height (sigma levels mapped to height
// with a 7.5 km scale height, z = -H ln sigma). There the north-south wind is
// the storms' real wind, so only the vertical motion is sped up by exag.
//
// Rendering: THREE.Points (heads) and THREE.LineSegments (tails) with the
// shared globe projection (GEO_GLSL); positions are updated on the CPU each
// frame. Buffers hold MAX_PARTICLES; `n` of them are moved and drawn.
import * as THREE from "three";
import { GEO_GLSL } from "./project.js?v=20261003090005";

const VERT = /* glsl */ `
${GEO_GLSL}
attribute vec3 pos;                 // lat, lon, height m
attribute float fade;
uniform float vex; uniform float size;
varying vec3 vCol; varying float vFade;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(geoPosition(pos.x, pos.y, pos.z * 0.001 * vex, vec2(0.0)), 1.0);
  gl_PointSize = size;
  float t = clamp(pos.z / 14000.0, 0.0, 1.0);
  vCol = mix(vec3(0.55, 0.9, 1.0), vec3(1.0, 0.5, 0.1), t);
  vFade = fade;
}`;
const FRAG_POINT = /* glsl */ `
varying vec3 vCol; varying float vFade;
uniform float opacity;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  if (dot(c, c) > 0.25) discard;
  gl_FragColor = vec4(vCol, opacity * vFade);
}`;
const FRAG_LINE = /* glsl */ `
varying vec3 vCol; varying float vFade;
uniform float opacity;
void main() { gl_FragColor = vec4(vCol, opacity * vFade); }`;

const A = 6.371e6, D2R = Math.PI / 180;
export const MAX_PARTICLES = 40000;
// A tail shows where the particle was this many seconds of screen time ago (settable: tailS).

export class SimParticles {
  constructor(geo, { count = 12000, vex = 40 } = {}) {
    const M = MAX_PARTICLES;
    this.pos = new Float32Array(M * 3);
    this.age = new Float32Array(M);
    this.life = new Float32Array(M);
    this.fade = new Float32Array(M);
    this.seg = new Float32Array(M * 6);          // tails: head then tail, per particle
    this.segFade = new Float32Array(M * 2);
    this.slab = null;
    this.band = null;                            // null: any height; {lo, hi} (m): only there (near the ground, the jet level)
    this.tailS = 0.35;
    const attr = (a, n) => new THREE.BufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage);
    const g = new THREE.BufferGeometry();
    g.setAttribute("pos", attr(this.pos, 3)); g.setAttribute("fade", attr(this.fade, 1));
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(M * 3), 3));
    const gl = new THREE.BufferGeometry();
    gl.setAttribute("pos", attr(this.seg, 3)); gl.setAttribute("fade", attr(this.segFade, 1));
    gl.setAttribute("position", new THREE.BufferAttribute(new Float32Array(M * 6), 3));
    const uniforms = { ...geo.uniforms, vex: { value: vex }, size: { value: 3.0 }, opacity: { value: 0.9 } };
    const mat = (frag) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, transparent: true, depthWrite: false, uniforms });
    this.uniforms = uniforms;
    this.points = new THREE.Points(g, mat(FRAG_POINT));
    this.tails = new THREE.LineSegments(gl, mat(FRAG_LINE));
    for (const [o, r] of [[this.tails, 799], [this.points, 800]]) { o.frustumCulled = false; o.renderOrder = r; }
    this.group = new THREE.Group();
    this.group.add(this.tails, this.points);
    this.geom = g; this.lineGeom = gl;
    for (let i = 0; i < M; i++) this.respawn(i, Math.random());
    this.setCount(count);
  }

  get object() { return this.group; }
  set vex(v) { this.uniforms.vex.value = v; }
  set tailsOn(on) { this.tails.visible = on; }
  set size(px) { this.uniforms.size.value = px; }
  set opacity(o) { this.uniforms.opacity.value = o; }
  set tail(sec) { this.tailS = sec; this.tails.visible = sec > 0; }
  // Only particles between lo and hi metres (null: all heights); they're re-placed at once.
  setBand(band) { this.band = band; for (let i = 0; i < MAX_PARTICLES; i++) this.respawn(i, Math.random()); this.segFade.fill(0); }
  setCount(n) {
    this.n = Math.max(100, Math.min(MAX_PARTICLES, Math.round(n)));
    this.geom.setDrawRange(0, this.n);
    this.lineGeom.setDrawRange(0, this.n * 2);
  }
  // null (the whole globe) or {lon0, width} in degrees; particles are re-placed at once.
  setSlab(slab) {
    this.slab = slab;
    for (let i = 0; i < MAX_PARTICLES; i++) this.respawn(i, Math.random());
    this.seg.fill(0); this.segFade.fill(0);
  }

  // A random place: uniform over the sphere's area (or the slab's), any height in the model's depth.
  respawn(i, ageFrac = 0) {
    this.pos[i * 3] = Math.asin(2 * Math.random() - 1) / D2R;
    this.pos[i * 3 + 1] = this.slab ? this.slab.lon0 + (Math.random() - 0.5) * this.slab.width : Math.random() * 360;
    this.pos[i * 3 + 2] = this.band ? this.band.lo + Math.random() * (this.band.hi - this.band.lo) : 300 + Math.random() * 14000;
    this.life[i] = 8 + Math.random() * 8;             // seconds on screen
    this.age[i] = ageFrac * this.life[i];
    this.fade[i] = 0;
  }

  // Advance by dtReal seconds of screen time, `daysPerSec` model days per second, with the
  // overturning sped up by exag. field: {nlat, nz, H, lat (rad, centres), zc, u, vc, wc} at cell centres.
  update(dtReal, field, { daysPerSec = 0.5, exag = 30 } = {}) {
    const { nlat, nz, H, u, vc, wc } = field, dlat = 180 / nlat, dzm = H / nz, sPer = daysPerSec * 86400, dt = dtReal * sPer;
    const P = this.pos, S = this.seg, F = this.segFade, back = this.tailS * sPer;
    for (let i = 0; i < this.n; i++) {
      let la = P[i * 3], lo = P[i * 3 + 1], z = P[i * 3 + 2];
      // bilinear at cell centres (clamped to the grid)
      const fj = Math.max(0, Math.min(nlat - 1.0001, (la + 90) / dlat - 0.5)), fk = Math.max(0, Math.min(nz - 1.0001, z / dzm - 0.5));
      const j = Math.floor(fj), k = Math.floor(fk), x = fj - j, y = fk - k, c = j * nz + k;
      const bl = (f) => f[c] * (1 - x) * (1 - y) + f[c + nz] * x * (1 - y) + f[c + 1] * (1 - x) * y + f[c + nz + 1] * x * y;
      const uu = bl(u), vv = bl(vc) * exag, ww = bl(wc) * exag;
      const dLa = vv / A / D2R, dLo = uu / (A * Math.max(0.05, Math.cos(la * D2R))) / D2R;   // degrees per model second
      la += dLa * dt; lo += dLo * dt; z += ww * dt;
      this.age[i] += dtReal;
      if (z < (this.band?.lo ?? 0) || z > (this.band?.hi ?? H) || Math.abs(la) > 89.5 || this.age[i] > this.life[i]) { this.respawn(i); F[i * 2] = F[i * 2 + 1] = 0; continue; }
      if (this.slab) { const w = this.slab.width, w0 = this.slab.lon0 - w / 2; lo = w0 + ((((lo - w0) % w) + w) % w); }
      else lo = ((lo % 360) + 360) % 360;
      P[i * 3] = la; P[i * 3 + 1] = lo; P[i * 3 + 2] = z;
      const a = this.age[i] / this.life[i];
      this.fade[i] = Math.min(1, a * 5, (1 - a) * 5);           // fade in and out
      // the tail: back along the current motion (not across the slab's wrap)
      let tLo = lo - dLo * back;
      if ((this.slab && Math.abs(tLo - lo) > this.slab.width / 2) || (!this.slab && (tLo < 0 || tLo >= 360))) tLo = lo;   // never across the slab's wrap or the flat map's seam
      S[i * 6] = la; S[i * 6 + 1] = lo; S[i * 6 + 2] = z;
      S[i * 6 + 3] = la - dLa * back; S[i * 6 + 4] = tLo; S[i * 6 + 5] = Math.max(0, Math.min(H, z - ww * back));
      F[i * 2] = this.fade[i] * 0.8; F[i * 2 + 1] = 0;
    }
    for (const g of [this.geom, this.lineGeom]) { g.getAttribute("pos").needsUpdate = true; g.getAttribute("fade").needsUpdate = true; }
  }

  // The same with the 3-D model's grids. f: {nlat, nlon, lat (deg, ascending), L, sf (sigma, top
  // first), u, v, sdot (per level, row-major lat x lon)}; H (m) the display depth.
  update3d(dtReal, f, { daysPerSec = 0.5, exag = 30, H = 16000 } = {}) {
    const { nlat, nlon, lat, L, sf, u, v, sdot } = f, n = nlat * nlon, HS = 7500, sPer = daysPerSec * 86400, dt = dtReal * sPer, back = this.tailS * sPer;
    const P = this.pos, S = this.seg, F = this.segFade;
    const sample = (arr, k, j0, j1, y, i0, i1, x) => {
      const o = k * n;
      return (arr[o + j0 * nlon + i0] * (1 - x) + arr[o + j0 * nlon + i1] * x) * (1 - y) + (arr[o + j1 * nlon + i0] * (1 - x) + arr[o + j1 * nlon + i1] * x) * y;
    };
    for (let i = 0; i < this.n; i++) {
      let la = P[i * 3], lo = P[i * 3 + 1], z = P[i * 3 + 2];
      // latitude: the Gaussian rows bracketing it (clamped at the outermost rows)
      let j1 = 1; while (j1 < nlat - 1 && lat[j1] < la) j1++;
      const j0 = j1 - 1, y = Math.max(0, Math.min(1, (la - lat[j0]) / (lat[j1] - lat[j0])));
      const fx = ((((lo % 360) + 360) % 360) / 360) * nlon, i0 = Math.floor(fx) % nlon, i1 = (i0 + 1) % nlon, x = fx - Math.floor(fx);
      // height -> sigma -> the two levels around it
      const sg = Math.exp(-z / HS);
      let k1 = 1; while (k1 < L - 1 && sf[k1] < sg) k1++;
      const k0 = k1 - 1, t = Math.max(0, Math.min(1, (sg - sf[k0]) / (sf[k1] - sf[k0])));
      const at = (arr) => sample(arr, k0, j0, j1, y, i0, i1, x) * (1 - t) + sample(arr, k1, j0, j1, y, i0, i1, x) * t;
      const uu = at(u), vv = at(v), ww = (-HS * at(sdot) / sg) * exag;       // dz/dt = -H sigma-dot / sigma
      const dLa = vv / A / D2R, dLo = uu / (A * Math.max(0.05, Math.cos(la * D2R))) / D2R;
      la += dLa * dt; lo += dLo * dt; z += ww * dt;
      this.age[i] += dtReal;
      if (z < (this.band?.lo ?? 0) || z > (this.band?.hi ?? H) || Math.abs(la) > 89.5 || this.age[i] > this.life[i]) { this.respawn(i); F[i * 2] = F[i * 2 + 1] = 0; continue; }
      if (this.slab) { const w = this.slab.width, w0 = this.slab.lon0 - w / 2; lo = w0 + ((((lo - w0) % w) + w) % w); }
      else lo = ((lo % 360) + 360) % 360;
      P[i * 3] = la; P[i * 3 + 1] = lo; P[i * 3 + 2] = z;
      const a = this.age[i] / this.life[i];
      this.fade[i] = Math.min(1, a * 5, (1 - a) * 5);
      let tLo = lo - dLo * back;
      if ((this.slab && Math.abs(tLo - lo) > this.slab.width / 2) || (!this.slab && (tLo < 0 || tLo >= 360))) tLo = lo;   // never across the slab's wrap or the flat map's seam
      S[i * 6] = la; S[i * 6 + 1] = lo; S[i * 6 + 2] = z;
      S[i * 6 + 3] = la - dLa * back; S[i * 6 + 4] = tLo; S[i * 6 + 5] = Math.max(0, Math.min(H, z - ww * back));
      F[i * 2] = this.fade[i] * 0.8; F[i * 2 + 1] = 0;
    }
    for (const g of [this.geom, this.lineGeom]) { g.getAttribute("pos").needsUpdate = true; g.getAttribute("fade").needsUpdate = true; }
  }
}
