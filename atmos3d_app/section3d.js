// The section's curtain in the 3-D scene: a vertical sheet along the path,
// from 0 to zTop at real heights x the vertical exaggeration, coloured by the
// section quantity and lined with a second one (θ or wind contours). Values
// sit at cell centres; slots A and B hold the two real steps either side of
// the time shown, blended by t like every other layer. Cells with no data
// (below the lowest level above ground, above the top level) are not drawn.
import * as THREE from "three";
import { texture } from "./colormaps.js?v=20261010090011";
import { GEO_GLSL } from "./project.js?v=20261010090011";

const VERT = /* glsl */ `
${GEO_GLSL}
attribute float vA; attribute float vB; attribute float lA; attribute float lB; attribute float mA; attribute float mB;
uniform float t; uniform float vex;
varying float vV; varying float vL; varying float vM;
void main() {
  vV = mix(vA, vB, t); vL = mix(lA, lB, t); vM = min(mA, mB);
  vec3 p = geoPosition(position.y, position.x, position.z * 0.001 * vex, vec2(0.0));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const FRAG = /* glsl */ `
uniform sampler2D cmap; uniform float fMin; uniform float fMax; uniform float opacity;
uniform float lInterval; uniform bool showLines;
varying float vV; varying float vL; varying float vM;
void main() {
  if (vM < 0.5) discard;
  vec4 c = texture2D(cmap, vec2(clamp((vV - fMin) / (fMax - fMin), 0.0, 1.0), 0.5));
  vec4 col = vec4(c.rgb, opacity);
  if (showLines) {
    float v = vL / lInterval;
    float d = abs(fract(v - 0.5) - 0.5) / max(fwidth(v), 1e-6);
    float a = 1.0 - clamp(d - 0.6 + 0.5, 0.0, 1.0);
    col.rgb = mix(col.rgb, vec3(0.08, 0.1, 0.13), a * 0.85);
  }
  gl_FragColor = col;
}`;

export class SectionCurtain {
  constructor(geo, { renderOrder = 700 } = {}) {
    this.geo = geo;
    this.uniforms = {
      ...geo.uniforms, t: { value: 0 }, vex: { value: 120 },
      cmap: { value: null }, fMin: { value: 0 }, fMax: { value: 1 }, opacity: { value: 0.92 },
      lInterval: { value: 4 }, showLines: { value: true },
    };
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms,
      transparent: true, depthWrite: true, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.visible = false;
    this.shape = null;
  }

  get object() { return this.mesh; }

  // New path or vertical sampling: rebuild the sheet's vertices.
  setShape(pts, nz, zTopM) {
    const key = `${pts.length}:${pts[0]?.lat},${pts[0]?.lon}:${pts.at(-1)?.lat},${pts.at(-1)?.lon}:${nz}:${zTopM}`;
    if (key === this.shape) return;
    this.shape = key;
    const nx = pts.length, pos = new Float32Array(nx * nz * 3), idx = [];
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      pos.set([pts[ix].lon, pts[ix].lat, ((iz + 0.5) / nz) * zTopM], (iz * nx + ix) * 3);
    }
    for (let iz = 0; iz < nz - 1; iz++) for (let ix = 0; ix < nx - 1; ix++) {
      const a = iz * nx + ix, b = a + 1, c = a + nx, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    for (const name of ["vA", "vB", "lA", "lB", "mA", "mB"]) g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(nx * nz), 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
  }

  // One step's values (colour) and lines, both nz rows of nx (NaN = no data).
  setSlot(slot, values, lines) {
    const g = this.mesh.geometry, v = g.getAttribute("v" + slot), l = g.getAttribute("l" + slot), m = g.getAttribute("m" + slot);
    for (let k = 0; k < values.length; k++) {
      const ok = Number.isFinite(values[k]);
      v.array[k] = ok ? values[k] : 0;
      l.array[k] = lines && Number.isFinite(lines[k]) ? lines[k] : 0;
      m.array[k] = ok ? 1 : 0;
    }
    v.needsUpdate = l.needsUpdate = m.needsUpdate = true;
  }

  setScale(key, scale) {
    this.uniforms.cmap.value = texture(key);
    this.uniforms.fMin.value = scale.min;
    this.uniforms.fMax.value = scale.max;
  }
}

// The pressure levels on the curtain (user request, 2026-09-29): each level
// as a line at its real height along the slice, in the level's colour, the
// focus level heavier, broken where it's below ground -- as on the flat
// chart. Heights blend between the two real steps by t like the curtain.
// Strokes a set number of pixels wide with a dark halo (the barbs' method,
// winds.js), nudged toward the camera so they don't fight the sheet.
const LINE_VERT = /* glsl */ `
${GEO_GLSL}
attribute vec2 a; attribute vec2 b; attribute vec2 za; attribute vec2 zb;   // (lon, lat) ends; heights m in steps A, B
attribute vec2 corner; attribute vec3 color; attribute float wpx;
uniform float t; uniform float vex; uniform vec2 viewport; uniform float extra;
varying vec3 vColor;
void main() {
  vColor = color;
  vec4 pa = projectionMatrix * modelViewMatrix * vec4(geoPosition(a.y, a.x, mix(za.x, za.y, t) * 0.001 * vex, vec2(0.0)), 1.0);
  vec4 pb = projectionMatrix * modelViewMatrix * vec4(geoPosition(b.y, b.x, mix(zb.x, zb.y, t) * 0.001 * vex, vec2(0.0)), 1.0);
  vec2 sa = pa.xy / pa.w * viewport, sb = pb.xy / pb.w * viewport;
  vec2 dir = normalize(sb - sa + vec2(1e-6, 0.0)), nrm = vec2(-dir.y, dir.x);
  vec4 p = corner.x < 0.5 ? pa : pb;
  p.xy += (nrm * corner.y + dir * (corner.x < 0.5 ? -0.5 : 0.5)) * (wpx + extra) / viewport * p.w;
  p.z -= 0.002 * p.w;            // just in front of the sheet
  gl_Position = p;
}`;
const LINE_FRAG = /* glsl */ `
uniform bool halo; varying vec3 vColor;
void main() { gl_FragColor = halo ? vec4(0.04, 0.05, 0.07, 0.75) : vec4(vColor, 1.0); }`;

export class SectionLevelLines {
  constructor(geo, { renderOrder = 702 } = {}) {
    const mat = (halo, extra) => new THREE.ShaderMaterial({
      vertexShader: LINE_VERT, fragmentShader: LINE_FRAG, transparent: true, depthWrite: false,
      uniforms: { ...geo.uniforms, t: { value: 0 }, vex: { value: 120 }, viewport: { value: new THREE.Vector2(400, 300) },
        extra: { value: extra }, halo: { value: halo } },
    });
    this.halo = new THREE.Mesh(new THREE.BufferGeometry(), mat(true, 2));
    this.ink = new THREE.Mesh(this.halo.geometry, mat(false, 0));
    this.group = new THREE.Group();
    for (const [m, r] of [[this.halo, renderOrder], [this.ink, renderOrder + 1]]) { m.frustumCulled = false; m.renderOrder = r; this.group.add(m); }
    this.group.visible = false;
    this.key = null;
  }

  get object() { return this.group; }
  setT(t) { for (const m of [this.halo, this.ink]) m.material.uniforms.t.value = t; }
  setVex(v) { for (const m of [this.halo, this.ink]) m.material.uniforms.vex.value = v; }
  setViewport(w, h) { for (const m of [this.halo, this.ink]) m.material.uniforms.viewport.value.set(w / 2, h / 2); }

  // pts: the path; lines: [{color: "#rrggbb", width: px, hA, hB: heights per point (NaN = below ground)}].
  // A segment is drawn where both ends have a height in both steps.
  build(key, pts, lines) {
    if (key === this.key) return;
    this.key = key;
    const A = [], B = [], ZA = [], ZB = [], C = [], COL = [], W = [], idx = [];
    let n = 0;
    for (const L of lines) {
      const c = new THREE.Color(L.color);
      for (let i = 0; i + 1 < pts.length; i++) {
        const z = [L.hA[i], L.hB[i], L.hA[i + 1], L.hB[i + 1]];
        if (!z.every(Number.isFinite)) continue;
        for (const cr of [[0, -1], [0, 1], [1, -1], [1, 1]]) {
          A.push(pts[i].lon, pts[i].lat); B.push(pts[i + 1].lon, pts[i + 1].lat);
          ZA.push(z[0], z[1]); ZB.push(z[2], z[3]); C.push(...cr); COL.push(c.r, c.g, c.b); W.push(L.width);
        }
        idx.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
        n += 4;
      }
    }
    const g = new THREE.BufferGeometry();
    for (const [name, arr, size] of [["a", A, 2], ["b", B, 2], ["za", ZA, 2], ["zb", ZB, 2], ["corner", C, 2], ["color", COL, 3], ["wpx", W, 1]]) {
      g.setAttribute(name, new THREE.Float32BufferAttribute(arr, size));
    }
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(A.length / 2 * 3), 3));   // unused; three wants one
    g.setIndex(idx);
    this.halo.geometry.dispose();
    this.halo.geometry = g;
    this.ink.geometry = g;
    this.segments = n / 4;
  }
}
