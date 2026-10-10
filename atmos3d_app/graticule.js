// Latitude/longitude lines for orientation: every 10 degrees, the equator
// drawn strongest, the Tropic of Cancer and the dateline dashed. They ride on
// the TOP visible layer's surface -- the one the map imprint is printed on --
// so in an oblique view they sit where that surface is, not down on the
// ground showing through it; on the globe they bend with it.
//
// Lines are screen-space ribbons a fixed number of pixels wide (a GL line is
// always 1 px): each instance is one 1-degree segment; the shader projects
// both ends and widens sideways, as the wind particles do (winds.js).
// Heights come from the same two real steps as the layer (slots A/B, blended
// by t), sampled bilinearly at each vertex.
//
// Labels (HTML) sit at the edge of the view: each parallel at its leftmost
// visible point, each meridian at its lowest, skipping anything under the
// page's panels.
import * as THREE from "three";
import { GEO_GLSL } from "./project.js?v=20261010090011";

const VERT = /* glsl */ `
${GEO_GLSL}
attribute vec2 iA; attribute vec2 iB;          // segment ends: lon, lat
attribute vec2 hA; attribute vec2 hB;          // heights (m) at each end: slot A, slot B
attribute vec2 dist;                           // distance along the line (deg) at each end
uniform float t; uniform float vex; uniform float lift; uniform float width; uniform vec2 resolution;
varying float vDist;
void main() {
  float za = mix(hA.x, hA.y, t) * 0.001 * vex + lift, zb = mix(hB.x, hB.y, t) * 0.001 * vex + lift;
  vec4 a = projectionMatrix * modelViewMatrix * vec4(geoPosition(iA.y, iA.x, za, vec2(0.0)), 1.0);
  vec4 b = projectionMatrix * modelViewMatrix * vec4(geoPosition(iB.y, iB.x, zb, vec2(0.0)), 1.0);
  if (a.w <= 0.0 || b.w <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vDist = 0.0; return; }
  vec2 sa = a.xy / a.w * resolution * 0.5, sb = b.xy / b.w * resolution * 0.5;
  vec2 d = sb - sa;
  float len = length(d);
  vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  vec4 c = position.x < 0.5 ? a : b;
  vec2 px = nrm * position.y * width * 0.5 + dir * (position.x - 0.5) * width * 0.5;
  c.xy += px / (resolution * 0.5) * c.w;
  gl_Position = c;
  vDist = position.x < 0.5 ? dist.x : dist.y;
}`;
const FRAG = /* glsl */ `
uniform vec3 color; uniform float opacity; uniform float dash;   // dash period (deg); 0 = solid
varying float vDist;
void main() {
  if (dash > 0.0 && fract(vDist / dash) > 0.55) discard;
  gl_FragColor = vec4(color, opacity);
}`;

export const TROPIC_DEG = 23.44;

// The lines over the grid's box: [{kind, label, pts: [[lon, lat], ...]}].
// kind: "lat" | "lon" | "equator" | "tropic" | "dateline".
export function graticuleLines(grid, stepDeg = 10) {
  const latN = grid.lat0, latS = grid.lat0 + grid.dlat * (grid.nlat - 1);
  const lonW = grid.lon0, lonE = grid.lon0 + grid.dlon * (grid.nlon - 1);
  const inside = (v, lo, hi) => v > lo + 1e-6 && v < hi - 1e-6;       // skip the box's own edges
  const lines = [];
  const parallel = (lat, kind, label) => {
    const pts = [];
    for (let lon = lonW; lon < lonE; lon += 1) pts.push([lon, lat]);
    pts.push([lonE, lat]);
    lines.push({ kind, label, pts });
  };
  const meridian = (lon, kind, label) => {
    const pts = [];
    for (let lat = latS; lat < latN; lat += 1) pts.push([lon, lat]);
    pts.push([lon, latN]);
    lines.push({ kind, label, pts });
  };
  for (let lat = Math.ceil(latS / stepDeg) * stepDeg; lat <= latN; lat += stepDeg) {
    if (!inside(lat, latS, latN)) continue;
    if (lat === 0) parallel(0, "equator", "Equator");
    else parallel(lat, "lat", `${Math.abs(lat)}°${lat > 0 ? "N" : "S"}`);
  }
  for (const lat of [TROPIC_DEG, -TROPIC_DEG]) {
    if (inside(lat, latS, latN)) parallel(lat, "tropic", lat > 0 ? "Tropic of Cancer" : "Tropic of Capricorn");
  }
  for (let lon = Math.ceil(lonW / stepDeg) * stepDeg; lon <= lonE; lon += stepDeg) {
    if (!inside(lon, lonW, lonE)) continue;
    const e = ((lon % 360) + 360) % 360;
    if (e === 180) meridian(lon, "dateline", "180°");
    else meridian(lon, "lon", e < 180 ? `${e}°E` : `${360 - e}°W`);
  }
  return lines;
}

// Look per kind: width (px), colour, opacity, dash period (deg of line).
export const GRATICULE_STYLE = {
  lat: { width: 1.5, color: "#1f2937", opacity: 0.55, dash: 0 },
  lon: { width: 1.5, color: "#1f2937", opacity: 0.55, dash: 0 },
  equator: { width: 3.5, color: "#be123c", opacity: 0.95, dash: 0 },
  tropic: { width: 2, color: "#be123c", opacity: 0.8, dash: 2.5 },
  dateline: { width: 2, color: "#1f2937", opacity: 0.8, dash: 2.5 },
};

export class Graticule {
  // grid: manifest.grid (the box and the height fields' layout); geo: project.js
  constructor(grid, geo, resolution, { renderOrder = 880 } = {}) {
    this.grid = grid;
    this.geo = geo;
    this.lines = graticuleLines(grid);
    this.group = new THREE.Group();
    this.meshes = [];
    this.uniforms = { t: { value: 0 }, vex: { value: 120 }, lift: { value: 1 } };
    const quad = new THREE.BufferGeometry();
    quad.setAttribute("position", new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, -1, 0, 1, 1, 0, 0, 1, 0], 3));
    for (const kind of Object.keys(GRATICULE_STYLE)) {
      const lines = this.lines.filter((l) => l.kind === kind);
      if (!lines.length) continue;
      const segs = [];
      for (const l of lines) for (let k = 0; k < l.pts.length - 1; k++) segs.push([l.pts[k], l.pts[k + 1], k]);
      const n = segs.length;
      const g = new THREE.InstancedBufferGeometry();
      g.setAttribute("position", quad.getAttribute("position"));
      const iA = new Float32Array(n * 2), iB = new Float32Array(n * 2), dist = new Float32Array(n * 2);
      segs.forEach(([p, q, k], s) => { iA.set(p, s * 2); iB.set(q, s * 2); dist.set([k, k + 1], s * 2); });
      g.setAttribute("iA", new THREE.InstancedBufferAttribute(iA, 2));
      g.setAttribute("iB", new THREE.InstancedBufferAttribute(iB, 2));
      g.setAttribute("dist", new THREE.InstancedBufferAttribute(dist, 2));
      for (const name of ["hA", "hB"]) g.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2).setUsage(THREE.DynamicDrawUsage));
      g.instanceCount = n;
      const st = GRATICULE_STYLE[kind];
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
        uniforms: {
          ...geo.uniforms, ...this.uniforms, resolution,
          width: { value: st.width }, color: { value: new THREE.Color(st.color) }, opacity: { value: st.opacity }, dash: { value: st.dash },
        },
      });
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = renderOrder + (kind === "equator" ? 2 : kind === "lat" || kind === "lon" ? 0 : 1);
      this.group.add(mesh);
      this.meshes.push({ mesh, segs });
    }
    this.slotKey = { A: undefined, B: undefined };
    this.fields = { A: null, B: null };
  }

  get object() { return this.group; }

  // Bilinear sample of a height field (m) at lon/lat; 0 without a field.
  sample(h, lon, lat) {
    if (!h) return 0;
    const { nlat, nlon, lat0, dlat, lon0, dlon } = this.grid;
    const fi = Math.min(nlon - 1.0001, Math.max(0, (lon - lon0) / dlon));
    const fj = Math.min(nlat - 1.0001, Math.max(0, (lat - lat0) / dlat));
    const i = Math.floor(fi), j = Math.floor(fj), a = fi - i, b = fj - j, k = j * nlon + i;
    return h[k] * (1 - a) * (1 - b) + h[k + 1] * a * (1 - b) + h[k + nlon] * (1 - a) * b + h[k + nlon + 1] * a * b;
  }

  // h: the surface's height field (m) for one step, or null (flat, at lift).
  setSlot(slot, key, h) {
    if (this.slotKey[slot] === key) return;
    this.slotKey[slot] = key;
    this.fields[slot] = h;
    const c = slot === "A" ? 0 : 1;
    for (const { mesh, segs } of this.meshes) {
      const ha = mesh.geometry.getAttribute("hA"), hb = mesh.geometry.getAttribute("hB");
      segs.forEach(([p, q], s) => { ha.array[s * 2 + c] = this.sample(h, p[0], p[1]); hb.array[s * 2 + c] = this.sample(h, q[0], q[1]); });
      ha.needsUpdate = hb.needsUpdate = true;
    }
  }

  // Scene height (km, exaggerated + lift) at lon/lat, as the shader places it.
  heightKm(lon, lat) {
    const t = this.uniforms.t.value;
    const h = this.sample(this.fields.A, lon, lat) * (1 - t) + this.sample(this.fields.B, lon, lat) * t;
    return h * 0.001 * this.uniforms.vex.value + this.uniforms.lift.value;
  }

  // Label candidates for layoutLabels (labels.js): each parallel at its
  // leftmost visible point, each meridian at its lowest. `free(x, y)` says
  // whether a canvas point is clear of the page's panels. Where a line
  // enters the visible area between two of its 1-degree points, the entry
  // point is found by bisection, so labels slide smoothly as the view moves
  // instead of jumping a degree at a time.
  labelItems(camera, width, height, free) {
    const v = new THREE.Vector3(), out = [];
    const screen = (lon, lat) => {
      v.copy(this.geo.point(lat, lon, this.heightKm(lon, lat))).project(camera);
      if (v.z > 1 || v.z < -1) return null;
      const x = (v.x + 1) / 2 * width, y = (1 - v.y) / 2 * height;
      return x < 6 || y < 6 || x > width - 6 || y > height - 6 || !free(x, y) ? null : { x, y };
    };
    for (const line of this.lines) {
      const isLat = line.kind !== "lon" && line.kind !== "dateline";
      let best = null, prevPt = null, prevOk = false;
      for (const pt of line.pts) {
        let s = screen(pt[0], pt[1]);
        if (s && prevPt && !prevOk) {
          // Bisect between the last hidden point and this visible one.
          let lo = 0, hi = 1;
          for (let it = 0; it < 7; it++) {
            const m = (lo + hi) / 2, q = screen(prevPt[0] + (pt[0] - prevPt[0]) * m, prevPt[1] + (pt[1] - prevPt[1]) * m);
            if (q) { hi = m; s = q; } else lo = m;
          }
        }
        if (s && (!best || (isLat ? s.x < best.x : s.y > best.y))) best = s;
        prevOk = !!screen(pt[0], pt[1]);
        prevPt = pt;
      }
      if (best) out.push(isLat
        ? { x: best.x + 3, y: best.y, dy: -16, text: line.label, cls: `gl-${line.kind}`, align: "left" }
        : { x: best.x, y: best.y, dy: -20, text: line.label, cls: `gl-${line.kind}`, align: "center" });
    }
    return out;
  }
}
