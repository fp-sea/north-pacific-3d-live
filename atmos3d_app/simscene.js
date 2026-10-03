// The Simulate mode's globe dressing (user request 2026-09-30: "just want base
// map and lat/lon"): a whole-globe latitude/longitude grid, the north-south
// slab the particles can be confined to (its walls, top and tropopause), and
// the Sun for the chosen date -- the circle where it is overhead some time that
// day (latitude = the declination), the edges of 24-hour daylight and polar
// night (90 deg minus the declination), and the Sun itself with its ray to the
// point below it. The model's sunlight is a daily average, so the Sun's
// longitude isn't modelled: it's drawn off to one side of the view.
//
// Lessons (simlessons.js) add labels -- the model's features, placed from its
// diagnostics, and Earth's textbook belts and winds, in grey -- and Coriolis
// arrows: grey where moving air would go without spin, yellow where the
// model's air actually goes (near the ground, returning to the equator; high
// up, heading poleward).
//
// Everything is on its own three.js layer (1), which the page's camera shows
// alone in this mode, so none of the forecast's labels or overlays interfere.
import * as THREE from "three";
import { GEO_GLSL } from "./project.js?v=20261003090005";
import { Strokes3D } from "./strokes3d.js?v=20261003090005";
import { isLand } from "./landmask.js?v=20261003090005";

// The planet's surface: one mesh over the whole Earth whose vertices go through the shared
// projection, so it is a flat map at morph 0 and the globe at morph 1 (the forecast's ground and
// globe backdrop cover only the data area). Plain ocean colour, or Earth's map for reference, and
// the 3-D model's colour fill on top. Longitudes stop just short of 0/360 so no triangle spans the
// flat map's seam.
const GVERT = /* glsl */ `
${GEO_GLSL}
attribute vec2 ll;
varying vec2 vLL;
void main() { vLL = ll; gl_Position = projectionMatrix * modelViewMatrix * vec4(geoPosition(ll.x, ll.y, 0.0, vec2(0.0)), 1.0); }`;
// The model's own land (landmask.js, when the 3-D model has continents): a tint under the fill
// and a coastline drawn over it where the mask crosses one half.
const GFRAG = /* glsl */ `
uniform sampler2D fillMap; uniform float useFill; uniform sampler2D worldMap; uniform float useWorld; uniform sampler2D landMap; uniform float useLand;
varying vec2 vLL;
void main() {
  vec2 uv = vec2(vLL.y / 360.0, (vLL.x + 90.0) / 180.0);
  vec3 c = vec3(0.13, 0.22, 0.33);
  if (useWorld > 0.5) c = texture2D(worldMap, vec2(fract(vLL.y / 360.0 + 0.5), uv.y)).rgb * 0.8;
  float l = texture2D(landMap, uv).r;
  if (useLand > 0.5) c = mix(c, vec3(0.45, 0.40, 0.31), 0.6 * l);
  if (useFill > 0.5) c = mix(c, texture2D(fillMap, uv).rgb, 0.85);
  if (useLand > 0.5) { float e = abs(l - 0.5) / max(fwidth(l), 1e-4); c = mix(vec3(0.07, 0.07, 0.06), c, 0.25 + 0.75 * smoothstep(0.8, 2.2, e)); }   // a dark coastline, ~2 px
  gl_FragColor = vec4(c, 1.0);
}`;
let LAND_TEX = null;
function landTexture() {
  if (LAND_TEX) return LAND_TEX;
  const d = new Uint8Array(360 * 180 * 4);
  for (let r = 0; r < 180; r++) for (let c = 0; c < 360; c++) { const v = isLand(r - 89.5, c + 0.5) * 255, o = (r * 360 + c) * 4; d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = 255; }
  LAND_TEX = new THREE.DataTexture(d, 360, 180, THREE.RGBAFormat);
  LAND_TEX.magFilter = THREE.LinearFilter; LAND_TEX.minFilter = THREE.LinearFilter; LAND_TEX.wrapS = THREE.RepeatWrapping; LAND_TEX.needsUpdate = true;
  return LAND_TEX;
}
function groundMesh(geo, worldTex) {
  const NX = 180, NY = 90, ll = [], idx = [];
  for (let y = 0; y <= NY; y++) for (let x = 0; x <= NX; x++) ll.push(-89.9 + (179.8 * y) / NY, 0.001 + (359.998 * x) / NX);
  for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) { const a = y * (NX + 1) + x, b = a + 1, c = a + NX + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("ll", new THREE.Float32BufferAttribute(ll, 2));
  g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array((ll.length / 2) * 3), 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: GVERT, fragmentShader: GFRAG, side: THREE.DoubleSide,
    uniforms: { ...geo.uniforms, fillMap: { value: null }, useFill: { value: 0 }, worldMap: { value: worldTex }, useWorld: { value: 0 }, landMap: { value: null }, useLand: { value: 0 } } }));
  m.frustumCulled = false; m.renderOrder = -1;
  return m;
}

export const SIM_LAYER = 1;
const GRID = [0.62, 0.7, 0.78], EQ = [0.95, 0.45, 0.45], SUN = [1.0, 0.82, 0.2], POLAR = [0.55, 0.8, 1.0], SLAB = [0.95, 0.95, 0.95];

function sunTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d"), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,250,220,1)"); r.addColorStop(0.25, "rgba(255,220,90,1)"); r.addColorStop(0.45, "rgba(255,190,40,0.55)"); r.addColorStop(1, "rgba(255,170,0,0)");
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class SimScene {
  constructor(geo, worldTex = null) {
    this.geo = geo;
    this.ground = groundMesh(geo, worldTex);
    this.flow = new Strokes3D(geo, { width: 1.6, renderOrder: 710 });
    this.flowKey = null;
    this.lines = new Strokes3D(geo, { width: 1.3, renderOrder: 720 });
    this.lines.object.visible = true;
    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTexture(), transparent: true, depthWrite: false }));
    this.sun.renderOrder = 900;
    this.group = new THREE.Group();
    this.group.add(this.ground, this.flow.object, this.lines.object, this.sun);
    this.group.traverse((o) => o.layers.set(SIM_LAYER));
    this.state = null;
  }

  get object() { return this.group; }
  // surface colour: Earth's map (for reference) and/or a fill texture (lon 0 at u = 0, south at v = 0)
  setSurface({ world = false, fill = null, land = false } = {}) {
    const u = this.ground.material.uniforms;
    u.useWorld.value = world && u.worldMap.value ? 1 : 0;
    if (land && !u.landMap.value) u.landMap.value = landTexture();
    u.useLand.value = land ? 1 : 0;
    u.fillMap.value = fill; u.useFill.value = fill ? 1 : 0;
  }
  // flow lines: [[{lat, lon, spd}, ...], ...] drawn near the ground, faint at their start and bright
  // where they end (the way the air is going), paler for light wind; key: rebuild only when it changes.
  setFlow(key, lines, { vex = 100, W = 800, Hpx = 600 } = {}) {
    this.flow.setVex(vex); this.flow.setViewport(W, Hpx);
    this.flow.object.visible = !!lines;
    if (!lines || key === this.flowKey) return;
    this.flowKey = key;
    this.flow.build(key, lines.map((pts) => pts.map((p, i) => {
      const t = pts.length > 1 ? i / (pts.length - 1) : 1, s = Math.min(1, p.spd / 15);
      return { lat: p.lat, lon: p.lon, z: 250, r: 0.75 + 0.25 * s, g: 0.85 + 0.1 * s, b: 1 - 0.7 * s, a: 0.15 + 0.85 * t };
    })));
  }

  // o: {dec, sunLon, showSun, slab: null | {lon0, width}, vex, H (m), tropopauseKm, W, Hpx,
  //     labels: [{lat, z, text, kind}] | null, labelLon, textbook: {belts, winds} | null,
  //     arrows: [{lat, lon, z, dlat, dlon, kind: "without" | "with"}] | null}
  update(o) {
    this.state = o;
    this.lines.setVex(o.vex);
    this.lines.setViewport(o.W, o.Hpx);
    const key = [o.dec.toFixed(1), Math.round(o.sunLon), o.showSun, o.slab ? `${Math.round(o.slab.lon0)}/${o.slab.width}` : "-", o.vex,
      (o.arrows ?? []).map((a) => `${Math.round(a.lon)},${a.dlat.toFixed(1)},${a.dlon.toFixed(1)}`).join(";")].join("|");
    this.lines.build(key, this.buildLines(o));
    const R = 6371, far = 1.4 * R;
    this.sun.visible = o.showSun;
    this.sun.position.copy(this.geo.point(o.dec, o.sunLon, far));
    this.sun.scale.setScalar(1500);
  }

  buildLines(o) {
    const L = [], pt = (lat, lon, z, c, a = 0.8) => ({ lat, lon, z, r: c[0], g: c[1], b: c[2], a });
    const parallel = (lat, c, a, z = 60) => { const p = []; for (let lon = 0; lon <= 360; lon += 3) p.push(pt(lat, lon, z, c, a)); L.push(p); };
    const meridian = (lon, c, a, z = 60, top = 88) => { const p = []; for (let lat = -top; lat <= top; lat += 2) p.push(pt(lat, lon, z, c, a)); L.push(p); };
    for (let lat = -60; lat <= 60; lat += 30) if (lat !== 0) parallel(lat, GRID, 0.45);
    parallel(0, EQ, 0.8);
    for (let lon = 0; lon < 360; lon += 30) meridian(lon, GRID, 0.35);
    if (o.showSun) {
      parallel(o.dec, SUN, 0.95, 120);                                 // the Sun is overhead somewhere on this line today
      if (Math.abs(o.dec) > 0.3) { parallel(90 - Math.abs(o.dec), POLAR, 0.7, 120); parallel(-(90 - Math.abs(o.dec)), POLAR, 0.7, 120); }
      // the ray from the Sun to the point under it
      const zFar = (1.4 * 6371 * 1000) / o.vex;
      L.push([pt(o.dec, o.sunLon, zFar, SUN, 0.0), pt(o.dec, o.sunLon, 0, SUN, 0.9)]);
    }
    for (const a of o.arrows ?? []) {
      // a shaft and a two-stroke head, in degrees on the sphere (dlon already divided by cos(lat))
      const c = a.kind === "with" ? SUN : [0.75, 0.78, 0.82], al = a.kind === "with" ? 1 : 0.8;
      const la1 = a.lat + a.dlat, lo1 = a.lon + a.dlon, len = Math.hypot(a.dlat, a.dlon * Math.cos((a.lat * Math.PI) / 180)) || 1;
      const ux = (a.dlon * Math.cos((a.lat * Math.PI) / 180)) / len, uy = a.dlat / len, h = 0.35 * len, cl = Math.cos((la1 * Math.PI) / 180) || 1;
      L.push([pt(a.lat, a.lon, a.z, c, al), pt(la1, lo1, a.z, c, al)]);
      for (const sgn of [1, -1]) {
        const hx = -ux * 0.8 + sgn * -uy * 0.5, hy = -uy * 0.8 + sgn * ux * 0.5;
        L.push([pt(la1, lo1, a.z, c, al), pt(la1 + hy * h, lo1 + (hx * h) / cl, a.z, c, al)]);
      }
    }
    if (o.slab) {
      const w0 = o.slab.lon0 - o.slab.width / 2, w1 = o.slab.lon0 + o.slab.width / 2, top = o.H, tp = o.tropopauseKm * 1000;
      for (const lon of [w0, w1]) { meridian(lon, SLAB, 0.9, 0, 89); meridian(lon, SLAB, 0.9, top, 89); meridian(lon, SLAB, 0.35, tp, 89); }
      for (const lat of [-89, 89]) L.push([pt(lat, w0, top, SLAB, 0.9), pt(lat, w1, top, SLAB, 0.9)]);
      // the slab's corners at the equator, up the walls, so its depth reads
      for (const lon of [w0, w1]) L.push([pt(0, lon, 0, SLAB, 0.9), pt(0, lon, top, SLAB, 0.9)]);
    }
    return L;
  }

  // HTML labels for the page's label layout: parallels at the left of the view, the Sun's lines.
  labelItems(camera, W, H, free, viewLon) {
    const o = this.state;
    if (!o) return [];
    const out = [], v = new THREE.Vector3(), n = new THREE.Vector3(), eye = new THREE.Vector3(), C = new THREE.Vector3(0, 0, -6371);
    const at = (lat, lon, zKm, text, cls, align = "left") => {
      const p = this.geo.point(lat, lon, zKm);
      n.copy(p).sub(C).normalize(); eye.copy(camera.position).sub(p);
      if (n.dot(eye) <= 0) return;                                      // the far side of the globe
      v.copy(p).project(camera);
      const x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H;
      if (x < 6 || y < 6 || x > W - 6 || y > H - 6 || !free(x, y)) return;
      out.push({ x, y, dy: -14, text, cls, align });
    };
    const lonL = viewLon - 40;
    if (!o.textbook) for (const lat of [-60, -30, 0, 30, 60]) at(lat, lonL, 1, lat === 0 ? "Equator" : `${Math.abs(lat)}°${lat > 0 ? "N" : "S"}`, lat === 0 ? "gl-equator" : "gl-lat");
    for (const l of o.labels ?? []) at(l.lat, l.lon ?? o.labelLon ?? viewLon + 60, (l.z * o.vex) / 1000, l.text, `gl-model gl-${l.kind}`, "center");
    if (o.textbook) {
      for (const b of o.textbook.belts) at(b.lat, viewLon - 5, 1, b.text, "gl-tb", "center");
      for (const w of o.textbook.winds) at(w.lat, viewLon + 25, 1, w.text, "gl-tb gl-tbwind", "center");
    }
    if (o.arrows?.length) {
      const a = o.arrows.find((x) => x.kind === "with" && x.z < 2000 && x.lat > 0), b = o.arrows.find((x) => x.kind === "with" && x.z > 2000 && x.lat > 0);
      if (a) at(a.lat + a.dlat, a.lon + a.dlon, (a.z * o.vex) / 1000, "near the ground: turned west", "gl-arrow", "center");
      if (b) at(b.lat + b.dlat, b.lon + b.dlon, (b.z * o.vex) / 1000, "high up: turned east", "gl-arrow", "center");
    }
    if (o.showSun) {
      at(o.dec, o.sunLon, 1, `☀ Sun overhead ${Math.abs(o.dec).toFixed(1)}°${o.dec >= 0 ? "N" : "S"}`, "gl-sun", "center");
      if (Math.abs(o.dec) > 0.3) {
        const pl = 90 - Math.abs(o.dec), north = o.dec > 0;
        at(pl, viewLon + 15, 1, north ? "24-hour daylight" : "polar night", "gl-polar", "center");
        at(-pl, viewLon + 15, 1, north ? "polar night" : "24-hour daylight", "gl-polar", "center");
      }
    }
    return out;
  }
}
