// The Northern Hemisphere view (docs/hemisphere_plan.md; user request 2026-10-17): the forecast's 6-hourly "nh"
// bundles (1°, 90 N to 20 S, all the way round) on the globe seen from above the pole, the Pacific at the bottom.
//
// It is its own THREE scene, drawn instead of the Pacific's while it's on, so nothing of the Pacific view is touched
// and coming back finds it exactly as it was. It shares the projection (geo, at morph 1) and the camera with the page.
// Layers, at most three at once (panel, round 2):
//   fill   one colour fill: 500 mb height anomaly (default), the 250 mb jet, 850 mb temperature anomaly, or none
//   z500   500 mb height contours every 60 m
//   mslp   sea-level isobars every 4 hPa, thin and coloured, hidden over high ground (Greenland, Tibet, the Rockies),
//          where "sea-level" pressure is an extrapolation: there the 850 mb level is underground and t850 is missing
//   jet    250 mb flow lines, from one real step (never a blend), between 15 and 82 N
// Everything fades out south of 15 N: seen from the pole the tropics are a thin rim at the globe's edge.
import * as THREE from "three";
import { GridLayer } from "./levelMesh.js?v=20261031090012";
import { FlowLayer, ParticleSystem } from "./winds.js?v=20261031090012";
import { SCALES } from "./colormaps.js?v=20261031090012";
import { BundleLoader, dequantize, fetchU16 } from "./loader.js?v=20261031090012";
import { blockSpans, blockedLongitudes, boldContour, findBlocks, nhGrid, nhSteps, upsampleDay, wrapFields } from "./hemisphere.js?v=20261031090012";
import { GEO_GLSL, R_KM } from "./project.js?v=20261031090012";

const KT = 1.943844;
export const NH_FILLS = {
  gha500: { label: "500 mb height anomaly", scale: "gha500", needs: "gha500" },
  jet: { label: "250 mb jet speed", scale: "nh_jet", needs: "u250" },
  ta850: { label: "850 mb temperature anomaly", scale: "ta850", needs: "ta850" },
  v250: { label: "250 mb north–south wind (wave packets)", scale: "nh_v", needs: "v250" },
  pwat: { label: "water vapour (atmospheric rivers)", scale: "pwat", needs: "pwat" },
  dgh500: { label: "500 mb: how much the model changed its mind", scale: "nh_dgh", needs: "dgh500" },
  gha10mb: { label: "10 mb height anomaly: the polar vortex", scale: "nh_gha10", needs: "gha10mb" },
  none: { label: "no fill", scale: null, needs: null },
};
// Places for orientation, and the two the project is about.
const PLACES = [
  { name: "Seattle", lat: 47.6, lon: 237.7, home: true }, { name: "Honolulu", lat: 21.3, lon: 202.1, home: true },
  { name: "Japan", lat: 37, lon: 138 }, { name: "Kamchatka", lat: 57, lon: 160, minor: true }, { name: "Alaska", lat: 64, lon: 210 },
  { name: "Siberia", lat: 63, lon: 100, minor: true }, { name: "Greenland", lat: 72, lon: 318, minor: true }, { name: "Europe", lat: 50, lon: 12, minor: true },
  { name: "Hudson Bay", lat: 60, lon: 275, minor: true }, { name: "North Pole", lat: 90, lon: 0 },
];

// Where the view's fields come from. Each source: {id, kind, steps (hours, ascending), isReady(step), load(step) ->
// Promise, ready(step) -> raw fields on the 1 deg hemisphere grid (111 x 360) or null, entry(step), bytes}.
// The forecast: each 6-hourly step's "nh" bundle.
// Steps past the Pacific's last (the hemisphere's days 8-10, GFS, 12-hourly) only while `extended` is set.
export function forecastSource(loader, manifest, model = "gfs") {
  const all = nhSteps(manifest, model), last = Math.max(...(manifest.steps_h ?? [Infinity]));
  return {
    id: model, model, kind: "forecast", allSteps: all, lastPacific: last, extended: false,
    get steps() { return this.extended ? all : all.filter((s) => s <= last + 1e-6); },
    isReady: (s) => loader.isReady(model, s, "nh"), load: (s) => loader.load(model, s, "nh"), ready: (s) => loader.ready(model, s, "nh"),
    entry: (s) => loader.entry(model, s, "nh"), get bytes() { return loader.bytes; },
  };
}
// The past year (export_archive's "hemisphere" part): one 00Z analysis a day at 2 deg, drawn on the 1 deg grid
// (upsampleDay). days: [{date, file, fields}] (the archive_nh index's days, or an event window's); a day's step is
// its index x 24 h, so the view's time is the day number.
export function archiveSource(days, nhIndex, dataBase, version, H) {
  const cache = new Map(), decoded = new Map();
  let bytes = 0;
  const src = nhIndex.grid;
  return {
    id: `arch:${days[0]?.date ?? ""}:${days.length}`, kind: "archive", days, steps: days.map((_, i) => i * 24),
    isReady: (s) => decoded.has(s),
    load(s) {
      const d = days[Math.round(s / 24)];
      if (!d) return Promise.resolve(null);
      if (!cache.has(s)) cache.set(s, fetchU16(`${dataBase}/${d.file}${version}`).then((codes) => {
        bytes += codes.byteLength;
        const f = upsampleDay(dequantize(codes, d.fields, src.nlat * src.nlon), src, H.grid);
        decoded.set(s, f);
        if (decoded.size > 40) decoded.delete(decoded.keys().next().value);    // a phone keeps ~40 days (~50 MB)
        return f;
      }).catch((e) => { cache.delete(s); throw e; }));
      return cache.get(s);
    },
    ready: (s) => decoded.get(s) ?? null,
    entry: () => null, get bytes() { return bytes; },
  };
}

export class HemisphereView {
  // manifest: the page's (with its optional "hemisphere" block); dataBase: where the bundles are; geo: the page's
  // projection; backdrop: the page's whole-Earth sphere (its geometry and material are shared); background: a Color.
  constructor({ manifest, dataBase, geo, backdrop, background, lite = false, onLoad = () => {} }) {
    this.H = manifest.hemisphere;
    this.manifest = manifest;
    this.geo = geo;
    this.onLoad = onLoad;
    this.grid = nhGrid(this.H);
    // a phone keeps ~70 MB of decoded steps (~1.6 MB each with 10 fields; at 50 MB the 32nd step pushed out the next one)
    this.loader = new BundleLoader(dataBase, { ...manifest, grid: this.H.grid }, 4, lite ? 70e6 : Infinity);
    this.on = false;
    // one source per model with hemisphere steps (GFS; ECMWF too since 2026-10-17)
    this.forecasts = Object.fromEntries((manifest.hemisphere?.models ?? ["gfs"]).map((m) => [m, forecastSource(this.loader, manifest, m)]).filter(([, s]) => s.allSteps.length));
    this.forecast = this.forecasts.gfs ?? Object.values(this.forecasts)[0] ?? forecastSource(this.loader, manifest);
    this.src = this.forecast;
    // relief off for a first look (forecaster review 2026-10-17); the defaults are restored on every exit
    this.defaults = { fill: this.H.anomalies ? "gha500" : "jet", z500: true, mslp: false, jet: false, particles: true, relief: false, block: false, storms: true, polar: false };
    this.show = { ...this.defaults };
    this.wrapped = new Map();              // step -> wrapped fields (+ jet speed), the few most recently used
    this.scene = new THREE.Scene();
    this.scene.background = background;
    const earth = new THREE.Mesh(backdrop.geometry, backdrop.material);
    earth.position.copy(backdrop.position);
    earth.renderOrder = -1;
    this.scene.add(earth);
    this.earth = earth;
    this.backdropMat = backdrop.material;
    // the flat polar map's basemap (setPolar): the world map on a lat/lon mesh from 90 N to 20 S, placed by GEO_GLSL so it
    // follows the projection; it fades in as the globe fades out
    const pos = [], idx = [], NR = 111, NC = 181;
    for (let j = 0; j < NR; j++) for (let i = 0; i < NC; i++) pos.push(i * 2, 90 - j, 0);
    for (let j = 0; j < NR - 1; j++) for (let i = 0; i < NC - 1; i++) { const a = j * NC + i; idx.push(a, a + NC, a + 1, a + 1, a + NC, a + NC + 1); }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    dg.setIndex(idx);
    const map = backdrop.material.uniforms.map;
    if (map.value) { map.value.wrapS = THREE.RepeatWrapping; map.value.needsUpdate = true; }
    this.disc = new THREE.Mesh(dg, new THREE.ShaderMaterial({
      uniforms: { ...geo.uniforms, map, hasMap: backdrop.material.uniforms.hasMap, opacity: { value: 0 } },
      vertexShader: `${GEO_GLSL}
        varying vec2 vLL;
        void main() { vLL = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(geoPosition(position.y, position.x, -2.0, vec2(0.0)), 1.0); }`,
      fragmentShader: `uniform sampler2D map; uniform float hasMap; uniform float opacity; varying vec2 vLL;
        void main() {
          // u runs 0.5..1.5 across the mesh's 0..360 (repeat wrapping): no jump through the Pacific at 180 (review: fract()
          // jumped there, a possible seam with mipmaps)
          vec2 uv = vec2(vLL.x / 360.0 + 0.5, vLL.y / 180.0 + 0.5);
          vec3 c = hasMap > 0.5 ? texture2D(map, uv).rgb * 0.8 : vec3(0.11, 0.17, 0.23);
          gl_FragColor = vec4(c, opacity);
        }`,
      transparent: true, side: THREE.DoubleSide,
    }));
    this.disc.frustumCulled = false;
    this.disc.renderOrder = -1;
    this.disc.visible = false;
    this.scene.add(this.disc);
    // fills fade out over 10..0 N, lines over 5..-5 N: Honolulu (21 N), the subtropical high and the start of the
    // atmospheric rivers stay clear (panel 2026-10-17; it had been 15..5 N)
    const own = (L, fade = 10) => { L.uniforms.roiMode = { value: 0 }; L.uniforms.fadeLat.value = fade; L.material.uniforms = L.uniforms; return L; };
    this.fill = own(new GridLayer(this.grid, geo, { lift: 30, renderOrder: 2 }));
    this.fill.uniforms.showLines.value = false;
    this.fill.uniforms.fillOpacity.value = 0.62;
    this.z500 = own(new GridLayer(this.grid, geo, { lift: 34, lineColor: "#16202b", lineWidth: 1.4, renderOrder: 3 }), 5);
    this.z500.uniforms.cInterval.value = 60;
    this.mslp = own(new GridLayer(this.grid, geo, { lift: 20, lineColor: "#b4471b", lineWidth: 1.0, renderOrder: 3 }), 5);
    this.mslp.uniforms.cInterval.value = 4;
    this.mslp.uniforms.lineOpacity.value = 0.85;
    // the bold line (panel 2026-10-17, "the edge of the polar air"): the 500 mb height that averages 50 N round the
    // hemisphere at this step, rounded to a 60 m contour; its bulges and dips are the ridges and troughs the first
    // question counts. One line, at c = 0: c = height - that value, and the interval (1e6 m) is far beyond any other
    // multiple, so no second line appears. (A first try offset c by half an interval, which the shader draws as the
    // point farthest from a line: no line at all; user report 2026-10-17.)
    this.bold = own(new GridLayer(this.grid, geo, { lift: 35, lineColor: "#0b1018", lineWidth: 3.2, renderOrder: 4 }), 5);
    this.bold.uniforms.cInterval.value = 1e6;
    for (const L of [this.fill, this.z500, this.mslp, this.bold]) this.scene.add(L.mesh);
    // Flow lines are traced on a grid padded 40 deg past the 0/360 seam each side, so a line crosses Greenwich instead
    // of stopping there (backlog, 2026-10-17); of the two copies of a line near the seam, the one whose mean longitude
    // falls in 0..360 is kept.
    const P = 40;
    this.flowGrid = { lat0: this.grid.lat0, dlat: this.grid.dlat, nlat: this.grid.nlat, lon0: -P, dlon: 1, nlon: 360 + 2 * P + 1 };
    this.flow = new FlowLayer(this.flowGrid, geo, { lift: 40, renderOrder: 6, color: "#3b1f6e", width: 1.5 });
    this.flow.gapCells = 6;
    this.flow.arrowKm = 110;
    this.flow.keepLine = (pts) => { const m = pts.reduce((t, p) => t + p[0], 0) / pts.length - P; return m >= 0 && m < 360; };
    this.scene.add(this.flow.object);
    // only 15..82 N: south of that it's faded out; near the pole a cell is a few km wide and lines would crowd
    const fg = this.flowGrid;
    this.flowMask = new Float32Array(fg.nlat * fg.nlon);
    for (let j = 0; j < fg.nlat; j++) {
      const lat = fg.lat0 + j * fg.dlat;
      if (lat >= 15 && lat <= 82) this.flowMask.fill(1, j * fg.nlon, (j + 1) * fg.nlon);
    }
    this.flowBuf = { u: new Float32Array(fg.nlat * fg.nlon), v: new Float32Array(fg.nlat * fg.nlon) };
    // jet particles (off by default): moved through the wind blended between the two steps, so they glide between them
    // Seeded by area 5..88 N, moved on the sphere (no hole at the pole), shown only where the wind passes 15 m/s and at
    // full strength from 55 m/s, so they draw the jet; near-black, readable on the blue troughs where the jet runs
    // (panel 2026-10-17: at the first settings a particle lapped 50 N in ~3 s and slack air looked as busy as the jet).
    this.particles = new ParticleSystem(this.grid, geo, { count: lite ? 1500 : 4000, trail: lite ? 10 : 16, lift: 42, color: "#0b0b16", renderOrder: 7,
      seedLats: [5, 88], sphere: true, speedRamp: [15, 55], fadeLat: 10 });
    this.particles.flowSeconds = 70000;
    this.partMask = new Float32Array(this.grid.nlat * this.grid.nlon);
    for (let j = 0; j < this.grid.nlat; j++) if (this.grid.lat0 + j * this.grid.dlat >= 0) this.partMask.fill(1, j * this.grid.nlon, (j + 1) * this.grid.nlon);
    this.particles.object.visible = false;
    this.scene.add(this.particles.object);
    this.blend = { u: new Float32Array(this.grid.nlat * this.grid.nlon), v: new Float32Array(this.grid.nlat * this.grid.nlon) };
    this.guides = this.makeGuides();
    this.scene.add(this.guides);
    this.labels = null;                    // HTML labels (attach())
    this.cur = null;                       // {s0, s1, t, a, b}: what's on screen
  }

  // The flat polar map (0 = the globe, 1 = polar stereographic; animated by the page): the projection, the basemaps.
  setPolar(v) {
    this.geo.uniforms.polar.value = v;
    this.disc.visible = v > 0.01;
    this.disc.material.uniforms.opacity.value = v;
    this.earth.visible = v < 0.99;
    this.backdropMat.uniforms.opacity.value = 1 - v;
  }
  // Guides and labels are placed once (geo.point); after the projection changes they're placed again.
  rebuildGuides() {
    const was50 = this.circle50?.visible;
    this.scene.remove(this.guides);
    this.guides.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    this.guides = this.makeGuides();
    this.scene.add(this.guides);
    this.circle50.visible = !!was50;
    this.blockKey = null;
    this.stormKey = null;
    if (this.tracePath) this.setTrace(this.tracePath);
  }
  // The flat map's camera: above the pole, looking straight down, the Pacific at the bottom.
  cameraPresetPolar(aspect, axis) {
    const lat0 = (this.geo.center[0] * Math.PI) / 180, pac = new THREE.Vector3(0, -Math.sin(lat0), Math.cos(lat0));
    const pole = axis.clone().multiplyScalar(R_KM).add(new THREE.Vector3(0, 0, -R_KM));
    const dir = axis.clone().multiplyScalar(Math.cos(0.02)).addScaledVector(pac, Math.sin(0.02)).normalize();
    const D = (1.55 * R_KM) / Math.tan((22.5 * Math.PI) / 180) * Math.max(1, 1.0 / (aspect || 1.6));
    return { pos: pole.clone().addScaledVector(dir, D).toArray(), target: pole.toArray(), fov: 45 };
  }

  get steps() { return this.src.steps; }
  get model() { return this.src.id; }

  // Switch between the forecast and a run of archive days; what's on screen is rebuilt from the new source.
  setSource(src) {
    if (src === this.src) return;
    this.src = src;
    this.wrapped.clear();
    this.cur = null;
    for (const L of [this.fill, this.z500, this.mslp, this.bold]) L.slotLead.A = L.slotLead.B = null;
    this.flow.key = null;
  }

  // The Pacific box (the forecast's own domain), 30 and 60 N, and the 50 N circle the first question counts troughs on.
  makeGuides() {
    // above the 500 mb sheet whether it's in relief or flat (review 2026-10-17: at 45 km under a relief at 90-160 km the
    // 50 N circle sat half a degree off the contours on the tipped globe)
    const g = new THREE.Group(), geo = this.geo, H = this.show.relief ? 165 : 45;
    const line = (pts, color, opacity, dashed = false) => {
      const geom = new THREE.BufferGeometry().setFromPoints(pts.map(([la, lo]) => geo.point(la, lo, H, 0, 0, 1)));
      const mat = dashed ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 120, gapSize: 90 })
        : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
      const l = new THREE.Line(geom, mat);
      if (dashed) l.computeLineDistances();
      l.renderOrder = 8;
      return l;
    };
    const m = this.manifest.grid, la0 = m.lat0 + (m.nlat - 1) * m.dlat, la1 = m.lat0, lo0 = m.lon0, lo1 = m.lon0 + (m.nlon - 1) * m.dlon;
    const [s, n] = [Math.min(la0, la1), Math.max(la0, la1)], box = [];
    for (let lo = lo0; lo <= lo1; lo += 1) box.push([n, lo]);
    for (let la = n; la >= s; la -= 1) box.push([la, lo1]);
    for (let lo = lo1; lo >= lo0; lo -= 1) box.push([s, lo]);
    for (let la = s; la <= n; la += 1) box.push([la, lo0]);
    g.add(line(box, "#f2b134", 0.95));
    const circle = (lat) => Array.from({ length: 361 }, (_, i) => [lat, i]);
    for (const lat of [30, 60]) g.add(line(circle(lat), "#c9d3de", 0.55, true));
    this.circle50 = line(circle(50), "#e8eef5", 0.9);
    this.circle50.visible = false;
    g.add(this.circle50);
    this.marks = new THREE.Group();
    g.add(this.marks);
    this.blockBand = new THREE.Group();          // blocked flow (setBlocks): a yellow band along 60 N over each span
    g.add(this.blockBand);
    return g;
  }

  // Trough marks for the questions: [{lon, color?}] across the 50 N circle (or none).
  setTroughs(list) {
    for (const c of [...this.marks.children]) { this.marks.remove(c); c.geometry.dispose(); c.material.dispose(); }
    for (const t of list ?? []) {
      const pts = [];
      for (let la = 38; la <= 62; la += 1) pts.push(this.geo.point(la, t.lon, this.show.relief ? 170 : 50, 0, 0, 1));
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: t.color ?? "#2b8cff", transparent: true, opacity: 1 }));
      l.renderOrder = 9;
      this.marks.add(l);
    }
  }

  // Blocked flow at the nearer real step (blockedLongitudes, Tibaldi-Molteni at 56-64 N): bright yellow, readable on
  // both the red and the blue of the anomaly fill. spans [{from, to}] or null.
  setBlocks(spans) {
    for (const c of [...this.blockBand.children]) { this.blockBand.remove(c); c.geometry.dispose(); c.material.dispose(); }
    for (const sp of spans ?? []) for (const lat of sp.block ? [58.2, 58.9, 59.6, 60.4, 61.1, 61.8] : [58.6, 59.3, 60, 60.7, 61.4]) {
      const pts = [];
      for (let lo = sp.from; lo <= sp.to + 1e-6; lo += 1) pts.push(this.geo.point(lat, lo, this.show.relief ? 115 : 50, 0, 0, 1));
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: sp.block ? "#ff7a00" : "#ffd400", transparent: true, opacity: 0.95, depthTest: false }));
      l.renderOrder = 11;
      this.blockBand.add(l);
    }
  }

  // The traced air (main.js, traceBackSphere): a path at the jet's height, a dot and a label every 24 h back.
  // path [[hour, lat, lon], ...] from the arrival backward, or null to clear.
  setTrace(path, color = "#e8590c") {
    this.tracePath = path;
    if (this.trace) { this.scene.remove(this.trace); this.trace.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); this.trace = null; }
    this.traceDays = [];
    if (!path || path.length < 2) return;
    const g = new THREE.Group(), lift = this.show.relief ? 112 : 48;
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(path.map(([, la, lo]) => this.geo.point(la, lo, lift, 0, 0, 1))),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, depthTest: false }));
    line.renderOrder = 12;
    g.add(line);
    const h0 = path[0][0], dots = [];
    for (const [h, la, lo] of path) {
      const d = (h0 - h) / 24;
      if (Math.abs(d - Math.round(d)) < 1e-6) { dots.push(this.geo.point(la, lo, lift, 0, 0, 1)); this.traceDays.push({ d: Math.round(d), lat: la, lon: lo }); }
    }
    const pts = new THREE.Points(new THREE.BufferGeometry().setFromPoints(dots), new THREE.PointsMaterial({ color, size: 9, sizeAttenuation: false, depthTest: false }));
    pts.renderOrder = 13;
    g.add(pts);
    this.trace = g;
    this.scene.add(g);
    if (this.labels) {
      for (const el of this.labels.box.querySelectorAll(".nh-label.day")) el.remove();
      this.labels.items = this.labels.items.filter((it) => !it.day);
      for (const t of this.traceDays) {
        if (t.d === 0) continue;
        const el = document.createElement("span");
        el.className = "nh-label day";
        el.textContent = `${t.d} d`;
        this.labels.box.appendChild(el);
        this.labels.items.push({ el, p: { lat: t.lat, lon: t.lon }, day: true });
      }
    }
  }

  // Tropical cyclones from the official advisories (fetch_tropical_cyclones): JMA's analysed and forecast centres (to 120 h,
  // with the 70 % probability circle) and NHC's current positions. toHours: an ISO time -> hours on the timeline.
  setStormData(storms, toHours) {
    this.stormData = (storms ?? []).map((s) => ({ ...s, pts: [{ h: toHours(s.time), lat: s.lat, lon: s.lon, r: null, wind: s.wind_kt, p: s.pressure },
      ...s.forecast.map((f) => ({ h: toHours(f.valid), lat: f.lat, lon: f.lon, r: f.radius_km, wind: f.wind_kt, p: f.pressure }))] }));
    this.stormKey = null;
  }
  // Where each storm is at `hours`: between its advisory points (linear), or within 12 h of an NHC position; else none.
  stormsAt(hours) {
    return (this.stormData ?? []).map((s) => {
      const P = s.pts;
      if (P.length === 1) return Math.abs(hours - P[0].h) <= 12 ? { s, ...P[0], at: "advisory" } : null;
      if (hours < P[0].h - 6 || hours > P.at(-1).h) return null;
      if (hours <= P[0].h) return { s, ...P[0], at: "analysis" };
      const i = P.findIndex((q) => q.h >= hours), a = P[i - 1], b = P[i], w = (hours - a.h) / (b.h - a.h);
      const dl = ((b.lon - a.lon + 540) % 360) - 180;
      return { s, h: hours, lat: a.lat + (b.lat - a.lat) * w, lon: (a.lon + dl * w + 360) % 360, r: (a.r ?? 0) + ((b.r ?? 0) - (a.r ?? 0)) * w,
        wind: a.wind != null && b.wind != null ? a.wind + (b.wind - a.wind) * w : b.wind, p: a.p != null && b.p != null ? a.p + (b.p - a.p) * w : b.p, at: "forecast" };
    }).filter(Boolean);
  }
  placeStorms(hours) {
    // rebuilt only when a storm has moved a quarter of a degree (or the projection, relief or switch changed), not every
    // frame of Play (review 2026-10-17)
    const now = this.show.storms ? this.stormsAt(hours) : [], q = (x) => Math.round(x * 4) / 4;
    const key = `${this.geo.uniforms.polar.value > 0.5}:${this.show.relief}:${now.map((n) => `${n.s.id}:${q(n.lat)},${q(n.lon)}`).join("|")}`;
    if (key === this.stormKey) return;
    this.stormKey = key;
    if (this.stormGroup) { this.scene.remove(this.stormGroup); this.stormGroup.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); }
    const g = new THREE.Group(), H = this.show.relief ? 120 : 55, pt = (la, lo, e = 0, n = 0) => this.geo.point(la, lo, H, e, n);
    const line = (pts, color, dashed = false, opacity = 1) => {
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), dashed ? new THREE.LineDashedMaterial({ color, dashSize: 90, gapSize: 70, transparent: true, opacity, depthTest: false })
        : new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false }));
      if (dashed) l.computeLineDistances();
      l.renderOrder = 14; g.add(l);
    };
    const ring = (la, lo, km) => Array.from({ length: 49 }, (_, k) => { const a = (k / 48) * 2 * Math.PI; return pt(la, lo, km * Math.cos(a), km * Math.sin(a)); });
    for (const s of this.show.storms ? this.stormData ?? [] : []) {
      if (s.track.length > 1) line(s.track.map(([la, lo]) => pt(la, lo)), "#ff4d6d", false, 0.8);
      if (s.pts.length > 1) line(s.pts.map((q) => pt(q.lat, q.lon)), "#ff4d6d", true, 0.9);
    }
    for (const n of now) {
      line(ring(n.lat, n.lon, 130), "#ff4d6d");
      line(ring(n.lat, n.lon, 60), "#ff4d6d");
      if (n.r > 0) line(ring(n.lat, n.lon, n.r), "#ffb3c1", true, 0.9);
    }
    this.stormGroup = g;
    this.scene.add(g);
    this.stormNow = now;
    if (this.labels) {
      for (const el of this.labels.box.querySelectorAll(".nh-label.storm")) el.remove();
      this.labels.items = this.labels.items.filter((it) => !it.storm);
      for (const n of now) {
        const el = document.createElement("span");
        el.className = "nh-label storm";
        el.textContent = `${n.s.name} ${n.wind != null ? Math.round(n.wind) + " kt" : ""}`;
        el.title = `${n.s.name} (${n.s.category ?? "tropical cyclone"}), ${n.s.agency} ${n.at === "forecast" ? "forecast" : "advisory"}: ${n.wind != null ? Math.round(n.wind) + " kt" : ""}${n.p != null ? ", " + Math.round(n.p) + " hPa" : ""}`;
        this.labels.box.appendChild(el);
        this.labels.items.push({ el, p: { lat: n.lat, lon: n.lon }, storm: true });
      }
    }
  }

  // HTML labels over the canvas: places, and the Pacific box's name.
  attach(container) {
    const box = document.createElement("div");
    box.className = "nh-labels";
    box.hidden = true;
    box.innerHTML = [...PLACES, { name: "the forecast's Pacific area", lat: 30, lon: 160, area: true }]
      .map((p) => `<span class="nh-label${p.home ? " home" : ""}${p.area ? " area" : ""}${p.minor ? " minor" : ""}">${p.name}</span>`).join("");
    container.appendChild(box);
    this.labels = { box, items: [...box.children].map((el, i) => ({ el, p: [...PLACES, { lat: 30, lon: 160 }][i] })) };
  }

  placeLabels(camera, width, height) {
    if (!this.labels) return;
    this.labels.box.hidden = !this.on;
    if (!this.on) return;
    const c = new THREE.Vector3(0, 0, -R_KM), eye = camera.position.clone().sub(c);
    for (const { el, p } of this.labels.items) {
      const w = this.geo.point(p.lat, p.lon, this.show.relief ? 175 : 60, 0, 0, 1);
      if (!el.isConnected) continue;
      const facing = this.geo.uniforms.polar.value > 0.5 || w.clone().sub(c).normalize().dot(eye.clone().normalize()) > 0.15;
      const s = w.clone().project(camera);
      const show = facing && Math.abs(s.x) < 1 && Math.abs(s.y) < 1;
      el.style.display = show ? "" : "none";
      if (show) el.style.transform = `translate(${((s.x + 1) / 2) * width}px, ${((1 - s.y) / 2) * height}px)`;
    }
  }

  // The camera above the North Pole, tipped toward the Pacific so it sits at the bottom of the view, nearest the viewer.
  // axis: the Earth's axis in scene coordinates (the page's EARTH_AXIS).
  // tip 0: straight down on the pole, the whole of 50 N in view (the count-the-waves question: tipped, 50 N on the
  // Atlantic side sits 58 degrees out of a 71-degree visible cap, squashed near the edge).
  cameraPreset(aspect, axis, tip = 0.32) {
    const lat0 = (this.geo.center[0] * Math.PI) / 180, pac = new THREE.Vector3(0, -Math.sin(lat0), Math.cos(lat0));
    const widen = Math.max(1, 1.05 / (aspect || 1.6));
    const dir = axis.clone().multiplyScalar(Math.cos(tip)).addScaledVector(pac, Math.sin(tip)).normalize();
    const c = new THREE.Vector3(0, 0, -R_KM);
    return { pos: c.clone().addScaledVector(dir, R_KM * 3.1 * widen).toArray(), target: c.toArray(), fov: 45 };
  }

  // The 6-hourly steps either side of `hours` and the blend weight; clamped to the first and last step.
  segment(hours) {
    const s = this.steps;
    if (!s.length) return null;
    if (hours <= s[0]) return { s0: s[0], s1: s[0], t: 0 };
    if (hours >= s.at(-1)) return { s0: s.at(-1), s1: s.at(-1), t: 0 };
    let i = 0;
    while (s[i + 1] <= hours) i++;
    return { s0: s[i], s1: s[i + 1], t: (hours - s[i]) / (s[i + 1] - s[i]) };
  }

  nearestStep(hours) {
    return this.steps.reduce((b, s) => (Math.abs(s - hours) < Math.abs(b - hours) ? s : b), this.steps[0]);
  }

  isReady(hours) {
    const sg = this.segment(hours);
    // only the steps the moment needs (on a step, just that one), decoded or already in the drawn cache
    const has = (st) => this.src.isReady(st) || this.wrapped.has(st);
    return !!sg && (sg.t > 1 - 1e-6 || has(sg.s0)) && (sg.t < 1e-6 || has(sg.s1));
  }

  // Fetch the steps around `hours` first, then the rest (desktop) or the next few (phones, inside their budget).
  request(hours, ahead = Infinity, behind = ahead === Infinity ? Infinity : 0) {
    const sg = this.segment(hours);
    if (!sg) return;
    const order = [sg.s0, sg.s1, ...this.steps.filter((s) => s > sg.s1).slice(0, ahead), ...this.steps.filter((s) => s < sg.s0).reverse().slice(0, behind)];
    const src = this.src;
    for (const s of order) if (!src.isReady(s)) src.load(s).then(() => { if (this.src === src) this.onLoad(s); }, (e) => console.warn("[atmos3d] hemisphere", e));
  }

  fields(step) {
    if (this.wrapped.has(step)) { const f = this.wrapped.get(step); this.wrapped.delete(step); this.wrapped.set(step, f); return f; }
    const raw = this.src.ready(step);
    if (!raw) return null;
    const f = wrapFields(raw, this.H);
    const n = f.u250.length, jet = new Float32Array(n), oS = new Float32Array(n), oT = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      jet[k] = Math.hypot(f.u250[k], f.v250[k]) * KT;
      oS[k] = Number.isFinite(f.t850[k]) ? 1 : 0;                 // 850 mb above ground: sea-level pressure means something
      oT[k] = f.ta850 && Number.isFinite(f.ta850[k]) ? 1 : 0;
    }
    f.jet = jet; f.oSea = oS; f.oTa = oT;
    f.vkt = f.v250.map((x) => x * KT);
    // relief: the 500 mb height about 5500 m (the sheet's shape, exaggerated in the shader); the bold line's height
    const bc = boldContour(raw.gh500, this.H, 50);
    f.boldZ = bc.z; f.boldLat = bc.meanLat;
    f.rel = f.gh500.map((z) => z - 5500);
    f.boldC = f.gh500.map((z) => z - f.boldZ);
    f.mslpHpa = f.mslp.map((p) => p / 100);
    if (f.mslpa) f.mslpaHpa = f.mslpa.map((p) => p / 100);
    if (f.ta850) f.ta850 = f.ta850.map((x) => (Number.isFinite(x) ? x : 0));
    this.wrapped.set(step, f);
    if (this.wrapped.size > 6) this.wrapped.delete(this.wrapped.keys().next().value);
    return f;
  }

  fillValues(f) {
    const k = this.show.fill;
    if (k === "gha500") return f.gha500 ? { f: f.gha500 } : null;
    if (k === "jet") return { f: f.jet };
    if (k === "ta850") return f.ta850 ? { f: f.ta850, o: f.oTa } : null;
    if (k === "v250") return { f: f.vkt };
    if (k === "pwat") return f.pwat ? { f: f.pwat } : null;
    if (k === "dgh500") return f.dgh500 ? { f: f.dgh500 } : null;
    if (k === "gha10mb") return f.gha10mb ? { f: f.gha10mb } : null;
    return null;
  }

  // The 500 mb sheet's shape (show.relief): heights about 5500 m, exaggerated 150 times (a 400 m trough is a 60 km
  // dent), hillshaded with the slopes steepened 12 times more for the lighting only; the fill, the 500 mb lines and the
  // bold line ride on it, the jet's particles and lines just above. Seen from above the pole the dents themselves
  // hardly show, so the shading carries it (user report 2026-10-17: at x60 and a gain of 4 the relief was invisible).
  setRelief() {
    const on = this.show.relief;
    for (const L of [this.fill, this.z500, this.bold]) { L.uniforms.vex.value = 150; L.uniforms.lift.value = on ? 90 : 30 + (L === this.fill ? 0 : L === this.z500 ? 4 : 5); }
    this.fill.uniforms.shade.value = on;
    this.fill.uniforms.shadeGain.value = 12;
    this.particles.material.uniforms.lift.value = on ? 175 : 42;
    this.flow.setLift(on ? 174 : 40);
  }

  // Put the time `hours` on screen; false if its steps aren't decoded yet (the last frame stays).
  apply(hours, force = false) {
    const sg = this.segment(hours);
    if (!sg) return false;
    const a = this.fields(sg.s0), b = this.fields(sg.s1);
    if (!a || !b) { this.request(hours); return false; }
    const key = (s) => `${this.src.id}:${s}:${this.show.fill}:${this.show.relief ? "r" : ""}`;
    if (!NH_FILLS[this.show.fill]) this.show.fill = "none";        // an unknown colour (an old link): no fill rather than a crash
    const fk = NH_FILLS[this.show.fill];
    this.setRelief();
    const h = (f) => (this.show.relief ? f.rel : null);
    this.fill.setFill(fk.scale && this.fillValues(a) ? fk.scale : null, SCALES[fk.scale]);
    if (fk.scale && this.fillValues(a)) {
      if (force || this.fill.slotLead.A !== key(sg.s0)) this.fill.setSlot("A", key(sg.s0), { ...this.fillValues(a), h: h(a) });
      if (force || this.fill.slotLead.B !== key(sg.s1)) this.fill.setSlot("B", key(sg.s1), { ...this.fillValues(b), h: h(b) });
    }
    this.fill.visible = !!(fk.scale && this.fillValues(a));
    for (const [L, c, o, on, rel] of [[this.z500, "gh500", null, this.show.z500, true], [this.bold, "boldC", null, this.show.z500, true], [this.mslp, "mslpHpa", "oSea", this.show.mslp, false]]) {
      L.visible = on;
      if (!on) continue;
      if (force || L.slotLead.A !== key(sg.s0)) L.setSlot("A", key(sg.s0), { c: a[c], o: o ? a[o] : null, h: rel ? h(a) : null });
      if (force || L.slotLead.B !== key(sg.s1)) L.setSlot("B", key(sg.s1), { c: b[c], o: o ? b[o] : null, h: rel ? h(b) : null });
    }
    for (const L of [this.fill, this.z500, this.mslp, this.bold]) L.uniforms.t.value = sg.t;
    this.flow.object.visible = this.show.jet;
    if (this.show.jet) {
      // At a real step, its own wind; between steps, the wind blended to the hour (user request 2026-10-17: the lines
      // jumped every 6 hours). Display only, like every frame between steps: the time line says "interpolated".
      // rebuilt each model hour when stepping, every 3 while playing (a trace costs ~10 ms; review 2026-10-17)
      const every = this.playing ? 3 : 1, hr = Math.round((sg.t * (sg.s1 - sg.s0)) / every) * every, w = sg.s1 > sg.s0 ? hr / (sg.s1 - sg.s0) : 0;
      const key = w <= 0 || w >= 1 ? `${this.src.id}:${w >= 1 ? sg.s1 : sg.s0}:${this.flow.gapCells}` : `${this.src.id}:${sg.s0}+${hr}:${this.flow.gapCells}`;
      if (key !== this.flow.key) {
        // the (blended) wind on the padded grid: column c is longitude c - 40, taken round the circle
        const fg = this.flowGrid, n1 = this.grid.nlon, { u, v } = this.flowBuf, ww = Math.max(0, Math.min(1, w));
        for (let j = 0; j < fg.nlat; j++) for (let c = 0; c < fg.nlon; c++) {
          const i = ((c + fg.lon0) % 360 + 360) % 360, k = j * n1 + i, o = j * fg.nlon + c;
          u[o] = a.u250[k] + (b.u250[k] - a.u250[k]) * ww; v[o] = a.v250[k] + (b.v250[k] - a.v250[k]) * ww;
        }
        this.flow.build(key, u, v, null, this.flowMask);
      }
    }
    this.particles.setShown(this.show.particles);
    this.cur = { ...sg, a, b };
    const near = sg.t < 0.5 ? sg.s0 : sg.s1, bkey = this.show.block ? `${this.src.id}:${near}:${this.show.relief}` : null;
    // blocks: blocked flow lasting days (findBlocks), from the steps decoded so far around this one (a phone never
    // fetches a whole year for it); a span inside a block is drawn orange and wider
    const chains = this.show.block ? this.blockChains(near) : null, ckey = chains ? chains.map((c) => `${c.start}-${c.end}`).join(",") : "";
    if (bkey !== this.blockKey || ckey !== this.chainKey) {
      this.blockKey = bkey; this.chainKey = ckey;
      this.blocks = bkey ? this.spansAt(near) : null;
      const inBlock = (sp) => (chains ?? []).some((c) => near >= c.start && near <= c.end && this.spansOverlap(sp, c));
      this.setBlocks(this.blocks?.map((sp) => ({ ...sp, block: inBlock(sp) })));
    }
    this.chains = chains;
    return true;
  }

  // The 250 mb wind (m/s) at any hour and point, blended between the two steps around that hour, bilinear in space
  // (all the way round, with the pole row); null where the hour has no decoded step.
  windAt(hour, lat, lon) {
    const sg = this.segment(hour);
    if (!sg || hour < this.steps[0] - 1e-6 || hour > this.steps.at(-1) + 1e-6) return null;
    // the raw (unwrapped) arrays, columns taken round the circle: a trace never churns the drawing cache (review)
    const a = this.src.ready(sg.s0), b = this.src.ready(sg.s1);
    if (!a || !b) return null;
    const { lat0, dlat, lon0, dlon, nlat, nlon } = this.H.grid;
    const fj = Math.min(nlat - 1.001, Math.max(0, (lat - lat0) / dlat)), fi = ((((lon - lon0) % 360) + 360) % 360) / dlon;
    const j = Math.floor(fj), i0 = Math.floor(fi) % nlon, i1 = (i0 + 1) % nlon, y = fj - j, x = fi - Math.floor(fi);
    const bl = (f) => (f[j * nlon + i0] * (1 - x) + f[j * nlon + i1] * x) * (1 - y) + (f[(j + 1) * nlon + i0] * (1 - x) + f[(j + 1) * nlon + i1] * x) * y;
    const t = sg.t;
    return [bl(a.u250) * (1 - t) + bl(b.u250) * t, bl(a.v250) * (1 - t) + bl(b.v250) * t];
  }

  // Values at a point from the nearer real step: {lat, lon, step, gh500, gha500, jet, mslp, mslpa, t850, ta850}.
  valuesAt(lat, lon) {
    if (!this.cur) return null;
    const { lat0, dlat, lon0, dlon, nlon } = this.grid;
    const j = Math.round((lat - lat0) / dlat), i = Math.round((((lon - lon0) % 360) + 360) % 360 / dlon);
    if (j < 0 || j >= this.grid.nlat) return null;
    const step = this.cur.t < 0.5 ? this.cur.s0 : this.cur.s1, f = step === this.cur.s0 ? this.cur.a : this.cur.b, k = j * nlon + i;
    const v = (a) => (a && Number.isFinite(a[k]) ? a[k] : null);
    const blocked = (this.blocks ?? []).some((b) => { const l = ((lon % 360) + 360) % 360; return (l >= b.from && l <= b.to) || (l + 360 >= b.from && l + 360 <= b.to); });
    return { step, blocked, gh500: v(f.gh500), gha500: v(f.gha500), jet: v(f.jet), mslp: f.oSea[k] ? v(f.mslpHpa) : null, mslpa: f.oSea[k] ? v(f.mslpaHpa) : null,
      t850: f.oSea[k] ? v(f.t850) : null, ta850: f.oTa[k] ? v(f.ta850) : null };
  }

  // Every frame while the particles show: move them through the blended 250 mb wind. Returns true if anything moved.
  tickParticles(dt) {
    const fading = this.particles.tickFade(dt);
    if (!this.particles.object.visible || !this.cur) return fading;
    const { a, b, t } = this.cur;
    this.particles.update(dt, { uA: a.u250, vA: a.v250, uB: b.u250, vB: b.v250, oA: this.partMask, oB: this.partMask, t });
    return true;
  }

  // Each step's blocked spans, cached by source and step.
  spansAt(step) {
    this.spanCache ??= new Map();
    const k = `${this.src.id}:${step}`;
    if (!this.spanCache.has(k)) { const raw = this.src.ready(step); if (!raw) return null; this.spanCache.set(k, blockSpans(blockedLongitudes(raw.gh500, this.H), this.H)); }
    return this.spanCache.get(k);
  }
  spansOverlap(a, b) {
    return [0, 360, -360].some((o) => Math.min(a.to + o, b.to) >= Math.max(a.from + o, b.from));
  }
  // Blocks over the run of decoded steps that contains `step` (contiguous, so a gap never joins two events).
  blockChains(step) {
    const st = this.steps, i = st.indexOf(step);
    if (i < 0) return [];
    let a = i, b = i;
    while (a > 0 && this.spansAt(st[a - 1])) a--;
    while (b < st.length - 1 && this.spansAt(st[b + 1])) b++;
    return findBlocks(st.slice(a, b + 1).map((s) => ({ step: s, spans: this.spansAt(s) ?? [] })));
  }

  setViewport(w, h) { this.flow.setViewport(w, h); }
}
