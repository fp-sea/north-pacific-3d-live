// Draws the Drop tab's things (tracers.js) in the scene: shaded balls (a white marble, a red balloon, a teal air parcel,
// a blue "where from?" arrival point, a grey smoke source), lines (a balloon's orange trail, the blue
// path the air came along, a ring's yellow outline) and dots (smoke puffs, a ring's balloons), at the
// heights main.js gives. Positions through geo.point, so they sit right on the flat map and the globe.
import * as THREE from "three";
import { Strokes3D } from "./strokes3d.js?v=20261010090011";

function ballTexture(inner, outer) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d"), r = g.createRadialGradient(24, 22, 2, 32, 32, 30);
  r.addColorStop(0, inner); r.addColorStop(0.75, outer); r.addColorStop(0.95, "rgba(20,20,20,0.9)"); r.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = r; g.beginPath(); g.arc(32, 32, 31, 0, 2 * Math.PI); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function discTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d"), r = g.createRadialGradient(16, 16, 0, 16, 16, 15);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.6, "rgba(255,255,255,0.85)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

// Each ball's colours and its size relative to the marble.
const BALLS = { marble: ["#ffffff", "#9aa5b1", 1], balloon: ["#ffb3a7", "#d7261e", 1.15], parcel: ["#c9fff4", "#14b8a6", 1], back: ["#b9ecff", "#1c8fc7", 0.9], smoke: ["#d6d3cc", "#5d5850", 1] };
const MAX_DOTS = 4000;

export class TracerView {
  constructor(geo) {
    this.geo = geo;
    this.group = new THREE.Group();
    // A fixed size on screen (sizeAttenuation off): a size in km grew to fill the view when zoomed in
    // (user report 2026-10-09).
    this.mats = Object.fromEntries(Object.entries(BALLS).map(([k, [a, b]]) => [k, new THREE.SpriteMaterial({ map: ballTexture(a, b), depthTest: false, transparent: true, sizeAttenuation: false })]));
    this.sprites = [];
    this.lines = new Strokes3D(geo, { width: 2.2, renderOrder: 960 });
    this.group.add(this.lines.object);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_DOTS * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(MAX_DOTS * 4), 4).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.dots = new THREE.Points(g, new THREE.PointsMaterial({ size: 6, sizeAttenuation: false, vertexColors: true, map: discTexture(), transparent: true, depthTest: false, alphaTest: 0.05 }));
    this.dots.frustumCulled = false;
    this.dots.renderOrder = 965;
    this.group.add(this.dots);
  }

  get object() { return this.group; }

  // balls: [{kind, lat, lon, zKm}]; lines: [{pts: [[lat, lon, zKm], ...] (oldest first: they fade toward
  // it), rgb: [r, g, b], closed?, fade?}]; dots: [{lat, lon, zKm, rgba: [r, g, b, a]}].
  // px: the marble's size on screen in pixels; fovDeg: the camera's vertical field of view; dpr: device pixels per CSS pixel.
  update({ balls = [], lines = [], dots = [] }, { px = 16, vex = 120, W = 800, H = 600, fovDeg = 45, dpr = 1 } = {}) {
    const scale = (px / H) * 2 * Math.tan((fovDeg * Math.PI) / 360);   // without attenuation, scale is per unit of distance
    while (this.sprites.length < balls.length) { const s = new THREE.Sprite(this.mats.marble); s.renderOrder = 970; this.group.add(s); this.sprites.push(s); }
    this.sprites.forEach((s, i) => {
      const b = balls[i];
      s.visible = !!b;
      if (!b) return;
      s.material = this.mats[b.kind] ?? this.mats.marble;
      s.position.copy(this.geo.point(b.lat, b.lon, b.zKm));
      s.scale.setScalar(scale * (BALLS[b.kind]?.[2] ?? 1));
    });
    this.lines.setVex(vex); this.lines.setViewport(W, H);
    const ls = lines.filter((l) => l.pts.length > 1).map((l) => {
      const pts = l.closed ? [...l.pts, l.pts[0]] : l.pts, [r, g, b] = l.rgb;
      return pts.map(([lat, lon, z], k, a) => ({ lon, lat, z: (z * 1000) / vex, r, g, b, a: l.fade === false ? 0.95 : 0.25 + 0.75 * (k / (a.length - 1)) }));
    });
    this.lines.build(ls.map((l) => `${l.length}:${l[l.length - 1].lat.toFixed(3)}:${l[0].lat.toFixed(3)}:${l[0].z.toFixed(0)}`).join("|"), ls);
    this.lines.object.visible = ls.length > 0;
    const n = Math.min(MAX_DOTS, dots.length), pos = this.dots.geometry.attributes.position, col = this.dots.geometry.attributes.color;
    for (let i = 0; i < n; i++) {
      const d = dots[i], p = this.geo.point(d.lat, d.lon, d.zKm);
      pos.array[i * 3] = p.x; pos.array[i * 3 + 1] = p.y; pos.array[i * 3 + 2] = p.z;
      col.array.set(d.rgba, i * 4);
    }
    pos.needsUpdate = col.needsUpdate = true;
    this.dots.geometry.setDrawRange(0, n);
    this.dots.material.size = 6 * dpr;
    this.dots.visible = n > 0;
  }
}
