// Lines through the 3-D scene a set number of pixels wide (WebGL draws 1 px
// lines only), with a colour and opacity at each end of every segment and a
// dark halo: the 3-D flow lines of the region (stream3d.js). Ends are real
// positions (lon, lat, height m); the vertical exaggeration is applied in the
// shader, like every layer, so the stretch slider moves them without a rebuild.
import * as THREE from "three";
import { GEO_GLSL } from "./project.js?v=20261010090011";

const VERT = /* glsl */ `
${GEO_GLSL}
attribute vec3 a; attribute vec3 b;              // lon, lat, height m
attribute vec4 ca; attribute vec4 cb;            // colour + alpha at each end
attribute vec2 corner;
uniform float vex; uniform vec2 viewport; uniform float width;
varying vec4 vCol;
void main() {
  vec4 pa = projectionMatrix * modelViewMatrix * vec4(geoPosition(a.y, a.x, a.z * 0.001 * vex, vec2(0.0)), 1.0);
  vec4 pb = projectionMatrix * modelViewMatrix * vec4(geoPosition(b.y, b.x, b.z * 0.001 * vex, vec2(0.0)), 1.0);
  if (pa.w <= 0.0 || pb.w <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vCol = vec4(0.0); return; }
  vec2 sa = pa.xy / pa.w * viewport, sb = pb.xy / pb.w * viewport;
  vec2 dir = normalize(sb - sa + vec2(1e-6, 0.0)), nrm = vec2(-dir.y, dir.x);
  vec4 p = corner.x < 0.5 ? pa : pb;
  p.xy += (nrm * corner.y + dir * (corner.x < 0.5 ? -0.5 : 0.5)) * width / viewport * p.w;
  gl_Position = p;
  vCol = corner.x < 0.5 ? ca : cb;
}`;
const FRAG = /* glsl */ `
uniform bool halo; uniform float opacity;
varying vec4 vCol;
void main() {
  float a = vCol.a * opacity * (halo ? 0.55 : 1.0);
  if (a < 0.01) discard;
  gl_FragColor = halo ? vec4(0.04, 0.05, 0.07, a) : vec4(vCol.rgb, a);
}`;

export class Strokes3D {
  constructor(geo, { width = 1.8, renderOrder = 720 } = {}) {
    const mat = (halo, w) => new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      uniforms: { ...geo.uniforms, vex: { value: 120 }, viewport: { value: new THREE.Vector2(400, 300) }, width: { value: w },
        halo: { value: halo }, opacity: { value: 0.9 } },
    });
    this.halo = new THREE.Mesh(new THREE.BufferGeometry(), mat(true, width + 1.6));
    this.ink = new THREE.Mesh(this.halo.geometry, mat(false, width));
    this.group = new THREE.Group();
    for (const [m, r] of [[this.halo, renderOrder], [this.ink, renderOrder + 1]]) { m.frustumCulled = false; m.renderOrder = r; this.group.add(m); }
    this.group.visible = false;
    this.key = null;
    this.segments = 0;
  }

  get object() { return this.group; }
  setVex(v) { for (const m of [this.halo, this.ink]) m.material.uniforms.vex.value = v; }
  setViewport(w, h) { for (const m of [this.halo, this.ink]) m.material.uniforms.viewport.value.set(w / 2, h / 2); }
  setOpacity(o) { for (const m of [this.halo, this.ink]) m.material.uniforms.opacity.value = o; }

  // lines: [[{lon, lat, z, r, g, b, a}, ...], ...]; consecutive points become segments.
  build(key, lines) {
    if (key === this.key) return;
    this.key = key;
    const A = [], B = [], CA = [], CB = [], C = [], idx = [];
    let n = 0;
    for (const pts of lines) {
      for (let i = 0; i + 1 < pts.length; i++) {
        const p = pts[i], q = pts[i + 1];
        for (const cr of [[0, -1], [0, 1], [1, -1], [1, 1]]) {
          A.push(p.lon, p.lat, p.z); B.push(q.lon, q.lat, q.z); CA.push(p.r, p.g, p.b, p.a); CB.push(q.r, q.g, q.b, q.a); C.push(...cr);
        }
        idx.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
        n += 4;
      }
    }
    const g = new THREE.BufferGeometry();
    for (const [name, arr, size] of [["a", A, 3], ["b", B, 3], ["ca", CA, 4], ["cb", CB, 4], ["corner", C, 2]]) g.setAttribute(name, new THREE.Float32BufferAttribute(arr, size));
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array((A.length / 3) * 3), 3));   // unused; three wants one
    g.setIndex(idx);
    this.halo.geometry.dispose();
    this.halo.geometry = g; this.ink.geometry = g;
    this.segments = n / 4;
  }
}
