// Orientation aids for the 3-D view (docs/interaction_design.md §4.4):
//
// - HeightRuler: a vertical scale standing on the map at a chosen spot, with
//   km ticks every 2 km on one side and the pressure levels on the other, at
//   their REAL heights at that spot (sampled from the data on screen) times
//   the vertical exaggeration -- so a level's surface and its ruler tick line
//   up. Drawn over everything, like the OPC outline.
// - northAngle: which way is north on screen at the view's centre (the
//   compass), correct on the flat map and on the globe.
import * as THREE from "three";
import { FT_PER_M, heightTicks } from "./units.js?v=20261003090005";

export const RULER_TOP_KM = 12;

export class HeightRuler {
  constructor(geo, { color = "#f5f7fa", renderOrder = 950 } = {}) {
    this.geo = geo;
    this.geom = new THREE.BufferGeometry();
    this.geom.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(3 * 2 * 40), 3));
    this.material = new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 });
    this.lines = new THREE.LineSegments(this.geom, this.material);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = renderOrder;
    this.lines.visible = false;
    this.ticks = [];        // [{p: Vector3 (scene), text, side: "km" | "level", cls}]
  }

  get object() { return this.lines; }

  // lat/lon: where it stands. vex: vertical exaggeration. levels: [{text,
  // hM, cls}] pressure levels with their height (m) at this spot. tickKm:
  // tick length on the map (km), so it reads at the current zoom.
  // pxPerKm: on-screen length of 1 km of (exaggerated) height here, which
  // picks the km tick step so the labels don't pile up.
  update(lat, lon, vex, levels, tickKm, pxPerKm = Infinity, unit = "km") {
    const g = this.geo, segs = [];
    Object.assign(this, { lat, lon, vex });
    const at = (hKm, offE = 0) => g.point(lat, lon, hKm * vex, offE, 0);
    // Top: 12 km, or 40,000 ft (12.19 km) when in feet, so the last tick is round.
    const topM = unit === "ft" ? 40000 / FT_PER_M : RULER_TOP_KM * 1000;
    segs.push(at(0), at(topM / 1000));
    this.ticks = [];
    for (const tk of heightTicks(topM, unit, pxPerKm / 1000)) {
      segs.push(at(tk.m / 1000, -tickKm), at(tk.m / 1000));
      this.ticks.push({ p: at(tk.m / 1000, -tickKm * 1.3), text: tk.label, side: "km", cls: "gl-km" });
    }
    for (const lv of levels) {
      const h = lv.hM / 1000;
      if (!(h >= 0 && h <= topM / 1000)) continue;
      segs.push(at(h), at(h, tickKm * 1.6));
      this.ticks.push({ p: at(h, tickKm * 1.9), text: lv.text, side: "level", cls: lv.cls });
    }
    const pos = this.geom.getAttribute("position");
    segs.slice(0, pos.count).forEach((p, k) => pos.setXYZ(k, p.x, p.y, p.z));
    this.geom.setDrawRange(0, Math.min(segs.length, pos.count));
    pos.needsUpdate = true;
  }

  // Label candidates (labels.js), km on the left of the ruler, levels on the right.
  labelItems(camera, width, height) {
    const v = new THREE.Vector3();
    return this.ticks.map((t) => {
      v.copy(t.p).project(camera);
      return { x: (v.x + 1) / 2 * width, y: (1 - v.y) / 2 * height, text: t.text, cls: t.cls,
               align: t.side === "km" ? "right" : "left", dy: -8 };
    });
  }
}

// Screen angle of north (degrees clockwise from straight up) at lat/lon.
export function northAngle(geo, camera, lat, lon, width, height) {
  const a = geo.point(lat, lon, 0).project(camera), b = geo.point(Math.min(lat + 1, 89), lon, 0).project(camera);
  const dx = (b.x - a.x) * width, dy = (b.y - a.y) * height;       // y up in NDC
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}
