// A forecasters' chart (OPC or HFO), draped over its box on the ground. The
// image is the office's own pixels, unchanged; `rect` (from the export) says
// where the box lies in it, and both it and the flat map are Mercator, so the
// box maps linearly onto that rectangle. Nothing is resampled before the GPU,
// whose mipmaps shrink the charts' one-pixel dotted grids smoothly (a Python
// resample to a fixed width made bands of faint dots: "white blotches",
// user report 2026-09-28). The sheet is a lat/lon mesh through
// GEO_GLSL, so on the globe it bends with the Earth like everything else.
import * as THREE from "three";
import { GEO_GLSL, mercatorKm } from "./project.js?v=20261003090005";

const VERT = /* glsl */ `
${GEO_GLSL}
attribute vec2 uv0;
uniform float lift;
varying vec2 vUv; varying float vFacing;
void main() {
  vUv = uv0;
  vec3 p = geoPosition(position.y, position.x, lift, vec2(0.0));
  // Drawn without depth testing (see the class), so the far side of the
  // globe is culled here instead: facing = local up . direction to camera.
  vec3 wp = (modelMatrix * vec4(p, 1.0)).xyz;
  vec3 up = normalize(mix(vec3(0.0, 0.0, 1.0), normalize(wp - vec3(0.0, 0.0, -6371.0)), morph));
  vFacing = dot(up, normalize(cameraPosition - wp));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
// See-through paper (paperKey 1): "colour to alpha" against white, as image
// editors remove paper -- each pixel's opacity is how far it is from white
// (1 - its lowest channel) and its colour the ink that, laid over white at
// that opacity, gives the pixel. White paper vanishes; black and coloured
// ink stay fully opaque in their own colour (so fronts and isobars still show
// over the dark satellite); a light grey grid dot becomes a faint dark dot,
// exactly as faint as printed. History (user reports, 2026-09-28): 85 %
// opacity ghosted our lines through ("strange lines"); opaque paper hid the
// map ("white-out"); a threshold key dropped some of OPC's dotted 1-degree
// grid (the downscaled image blurs it to 240-250/255) and broke the grid.
// Paper printed (paperKey 0, the default): the chart as published. Output is
// premultiplied; `opacity` fades either mode.
const FRAG = /* glsl */ `
uniform sampler2D map; uniform float opacity; uniform float paperKey;
uniform vec4 uvRect;                       // the box in the image: left, top, width, height (fractions)
varying vec2 vUv; varying float vFacing;
void main() {
  if (vFacing < 0.0) discard;                // far side of the globe
  // vUv: east fraction, north fraction (v = 1 north); the image's y runs down.
  vec2 img = vec2(uvRect.x + vUv.x * uvRect.z, uvRect.y + (1.0 - vUv.y) * uvRect.w);
  if (img.x < 0.0 || img.x > 1.0 || img.y < 0.0 || img.y > 1.0) discard;   // box edge past the chart's canvas: left empty
  vec4 c = texture2D(map, vec2(img.x, 1.0 - img.y));
  float ink = paperKey > 0.5 ? 1.0 - min(c.r, min(c.g, c.b)) : 1.0;
  float a = ink * c.a * opacity;
  if (a < 0.003) discard;
  vec3 pre = paperKey > 0.5 ? (c.rgb - (1.0 - ink)) : c.rgb * ink;   // ink colour x its opacity
  gl_FragColor = vec4(pre * c.a * opacity, a);
}`;

// A 1-degree lat/lon mesh over `box` whose uv0 maps the Mercator box to the
// image (v = 1 north), so the image -- itself Mercator, cropped to the box --
// lies exactly and bends onto the globe with GEO_GLSL.
function boxGeometry(box) {
    const lonMin = ((box.lon_min % 360) + 360) % 360, lonMax = lonMin + ((((box.lon_max - box.lon_min) % 360) + 360) % 360);
    const [xw, ys] = mercatorKm(box.lat_min, lonMin), [xe0, yn] = mercatorKm(box.lat_max, lonMax);
    const xe = xe0 < xw ? xe0 + 2 * Math.PI * 6378.137 : xe0;
    const nx = Math.round(lonMax - lonMin) + 1, ny = Math.round(box.lat_max - box.lat_min) + 1;
    const pos = [], uv = [], idx = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const lat = box.lat_min + ((box.lat_max - box.lat_min) * j) / (ny - 1), lon = lonMin + ((lonMax - lonMin) * i) / (nx - 1);
      let [x, y] = mercatorKm(lat, lon);
      if (x < xw - 1) x += 2 * Math.PI * 6378.137;
      pos.push(lon, lat, 0);
      uv.push((x - xw) / (xe - xw), (y - ys) / (yn - ys));        // image top (north) at v = 1
    }
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i; idx.push(a, a + 1, a + nx, a + 1, a + nx + 1, a + nx); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv0", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
}

export class OpcChartLayer {
  // box: the default chart box {lat_min, lat_max, lon_min, lon_max} (lon_max
  // may be west of 180); each chart can bring its own (HFO's differ).
  constructor(box, geo, { renderOrder = 6, lift = 1.5 } = {}) {
    this.boxes = new Map();
    this.box = box;
    this.uniforms = { ...geo.uniforms, map: { value: null }, opacity: { value: 1 }, paperKey: { value: 1 }, uvRect: { value: new THREE.Vector4(0, 0, 1, 1) }, lift: { value: lift } };
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      premultipliedAlpha: true,
      // No depth test: the chart lies 1.5 km over the ground, and in the chart view (camera ~44,000 km away, narrow
      // lens) the depth buffer resolves only ~5 km there, so ground and chart z-fought in horizontal bands where the
      // satellite showed through (user report, 2026-09-28; the globe, closer, was fine). Drawn right after the
      // ground (renderOrder) and before the levels, like the map's other overlays; the globe's far side is culled.
      depthTest: false,
    });
    this.mesh = new THREE.Mesh(this.geometryFor(box), this.material);
    // Default: the chart exactly as published. See-through paper fades pale ink
    // (measured: 36 % of the surface chart's and 58 % of the 500 mb chart's
    // non-white pixels drop below half opacity) -- opt-in only (user report,
    // 2026-09-28: "missing ink").
    this.setPaper(false);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.visible = false;
    this.textures = new Map();
    this.loader = new THREE.TextureLoader();
  }

  get object() { return this.mesh; }

  geometryFor(box) {
    const key = JSON.stringify(box);
    if (!this.boxes.has(key)) this.boxes.set(key, boxGeometry(box));
    return this.boxes.get(key);
  }

  // true: see-through paper (only the ink shows); false: printed paper.
  setPaper(seeThrough) { this.uniforms.paperKey.value = seeThrough ? 1 : 0; }

  // Show the chart at url (loaded once, cached); onReady when it's on screen.
  // rect: [left, top, width, height] of the box in the image (px), size [w, h];
  // without them the image is taken to be exactly the box (older builds).
  show(url, onReady, box = this.box, rect = null, size = null) {
    this.mesh.geometry = this.geometryFor(box);
    this.uniforms.uvRect.value.set(...(rect && size ? [rect[0] / size[0], rect[1] / size[1], rect[2] / size[0], rect[3] / size[1]] : [0, 0, 1, 1]));
    let tex = this.textures.get(url);
    if (!tex) {
      tex = this.loader.load(url, () => { tex.userData.ready = true; onReady?.(); });
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      this.textures.set(url, tex);
    }
    this.uniforms.map.value = tex;
    this.mesh.visible = !!tex.userData.ready;
  }

  hide() { this.mesh.visible = false; }
}
