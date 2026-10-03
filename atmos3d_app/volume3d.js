// The volume in the scene: nz horizontal sheets from the surface up, each
// sampling two 3-D textures (the real steps either side of the time shown,
// blended by t) at its own height -- the stacked-sheet approach of Wind Volume
// Explorer's clouds (sheets sort and depth-test with everything else and stay
// light). Byte 0 = nothing; 1..255 = threshold..vmax, coloured through the
// quantity's colour scale, more opaque as the value rises.
//
// Window: optionally only within `halfWidth` km of a line on the Mercator map
// (the slice) -- the slab becomes a window onto the volume.
import * as THREE from "three";
import { texture } from "./colormaps.js?v=20261003090005";
import { GEO_GLSL, mercatorKm } from "./project.js?v=20261003090005";

// Mercator km come from an attribute, for the window test.
const VERT = /* glsl */ `
${GEO_GLSL}
attribute vec2 merc;
uniform float zKm; uniform float vex;
uniform float lat0; uniform float latSpan; uniform float lon0; uniform float lonSpan; uniform float w;
varying vec3 vUVW; varying vec2 vMerc;
void main() {
  float lat = position.y, lon = position.x;
  vUVW = vec3((lon - lon0) / lonSpan, (lat0 - lat) / latSpan, w);
  vMerc = merc;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(geoPosition(lat, lon, zKm * vex, vec2(0.0)), 1.0);
}`;
const FRAG = /* glsl */ `
precision highp float; precision highp sampler3D;
uniform sampler3D volA; uniform sampler3D volB; uniform float t;
uniform sampler2D cmap; uniform float opacity; uniform float perSheet;
uniform float valLo; uniform float valHi; uniform float cMin; uniform float cMax;
uniform bool windowOn; uniform vec2 winP; uniform vec2 winD; uniform float winHalf; uniform float winLen;
uniform bool signedMode; uniform float sVmax; uniform float sThr;   // anomalies (volume.js SIGNED)
uniform bool even;       // a continuous fill (temperature, θ): the same see-through everywhere, not more opaque as the value rises
varying vec3 vUVW; varying vec2 vMerc;
void main() {
  if (windowOn) {
    vec2 d = vMerc - winP;
    if (abs(d.x * winD.y - d.y * winD.x) > winHalf) discard;     // distance from the slice's line
    float s = dot(d, winD);                                         // and along it: a box's west and east ends
    if (s < 0.0 || s > winLen) discard;
  }
  float a = texture(volA, vUVW).r, b = texture(volB, vUVW).r, v = mix(a, b, t);
  if (signedMode) {
    // 128 = zero, 1..255 = -vmax..+vmax; shown where |value| >= the threshold.
    if (a < 0.5 / 255.0 || b < 0.5 / 255.0) discard;              // no data on either side of the blend
    float s = (v * 255.0 - 128.0) / 127.0 * sVmax;
    if (abs(s) < sThr) discard;
    vec3 cs = texture2D(cmap, vec2(clamp((s - cMin) / (cMax - cMin), 0.0, 1.0), 0.5)).rgb;
    float k = clamp((abs(s) - sThr) / max(1e-3, sVmax - sThr), 0.0, 1.0);
    gl_FragColor = vec4(cs, clamp((0.25 + 0.75 * k) * perSheet * opacity, 0.0, 1.0));
    return;
  }
  if (v < 0.5 / 255.0) discard;
  float val = valLo + (v * 255.0 - 1.0) / 254.0 * (valHi - valLo);      // byte back to the value
  vec3 c = texture2D(cmap, vec2(clamp((val - cMin) / (cMax - cMin), 0.0, 1.0), 0.5)).rgb;
  gl_FragColor = vec4(c, clamp((even ? 0.6 : 0.25 + 0.75 * v) * perSheet * opacity, 0.0, 1.0));
}`;

export class VolumeLayer {
  // grid: manifest.grid; nz sheets up to zTopM.
  constructor(grid, geo, { nz = 48, zTopM = 12500, renderOrder = 600 } = {}) {
    this.grid = grid; this.nz = nz; this.zTopM = zTopM;
    const latMin = grid.lat0 + grid.dlat * (grid.nlat - 1), lonMax = grid.lon0 + grid.dlon * (grid.nlon - 1);
    // One sheet geometry (every 1 deg is plenty: the texture interpolates), shared by all sheets.
    const nx = Math.round((lonMax - grid.lon0) / 1) + 1, ny = Math.round((grid.lat0 - latMin) / 1) + 1;
    const pos = [], merc = [], idx = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const lat = grid.lat0 - ((grid.lat0 - latMin) * j) / (ny - 1), lon = grid.lon0 + ((lonMax - grid.lon0) * i) / (nx - 1);
      pos.push(lon, lat, 0); merc.push(...mercatorKm(lat, lon));
    }
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i; idx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1); }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geom.setAttribute("merc", new THREE.Float32BufferAttribute(merc, 2));
    geom.setIndex(idx);
    const empty = () => { const t = new THREE.Data3DTexture(new Uint8Array(grid.nlat * grid.nlon * nz), grid.nlon, grid.nlat, nz);
      t.format = THREE.RedFormat; t.type = THREE.UnsignedByteType; t.minFilter = t.magFilter = THREE.LinearFilter; t.unpackAlignment = 1; t.needsUpdate = true; return t; };
    this.texA = empty(); this.texB = empty();
    this.shared = {
      volA: { value: this.texA }, volB: { value: this.texB }, t: { value: 0 }, vex: { value: 120 },
      cmap: { value: null }, opacity: { value: 0.8 }, perSheet: { value: 0.2 },
      valLo: { value: 0 }, valHi: { value: 1 }, cMin: { value: 0 }, cMax: { value: 1 },
      lat0: { value: grid.lat0 }, latSpan: { value: grid.lat0 - latMin }, lon0: { value: grid.lon0 }, lonSpan: { value: lonMax - grid.lon0 },
      windowOn: { value: false }, winP: { value: new THREE.Vector2() }, winD: { value: new THREE.Vector2(0, 1) }, winHalf: { value: 250 }, winLen: { value: 1e9 },
      signedMode: { value: false }, sVmax: { value: 1 }, sThr: { value: 0 }, even: { value: false },
    };
    this.group = new THREE.Group();
    for (let z = 0; z < nz; z++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { ...geo.uniforms, ...this.shared, zKm: { value: ((z + 0.5) / nz) * (zTopM / 1000) }, w: { value: (z + 0.5) / nz } },
      });
      const m = new THREE.Mesh(geom, mat);
      m.frustumCulled = false;
      m.renderOrder = renderOrder + z;             // bottom first: back to front seen from above
      this.group.add(m);
    }
    this.group.visible = false;
  }

  get object() { return this.group; }

  setSlot(slot, bytes) {
    const tex = slot === "A" ? this.texA : this.texB;
    tex.image.data.set(bytes);
    tex.needsUpdate = true;
  }

  // Only the sheets between loKm and hiKm (the region of interest's height
  // range; 0..zTop = all of them).
  setHeightClip(loKm, hiKm) {
    for (const m of this.group.children) { const z = m.material.uniforms.zKm.value; m.visible = z >= loKm - 1e-6 && z <= hiKm + 1e-6; }
  }

  // Anomaly (signed) volumes: bytes 1..255 = -vmax..+vmax; drawn where |value| >= thr.
  setSigned(on, thr = 0, vmax = 1) {
    this.shared.signedMode.value = on; this.shared.sThr.value = thr; this.shared.sVmax.value = vmax;
  }

  // Colour through the quantity's own scale; bytes encode valLo..valHi.
  setScale(key, scale, valLo, valHi) {
    this.shared.cmap.value = texture(key);
    Object.assign(this.shared.cMin, { value: scale.min }); Object.assign(this.shared.cMax, { value: scale.max });
    this.shared.valLo.value = valLo; this.shared.valHi.value = valHi;
  }
}
