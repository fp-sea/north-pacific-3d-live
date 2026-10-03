// Fill colour scales for the explorer. Each scale is a list of [value, css]
// stops in its display units; `texture()` bakes one into a 256x1 lookup the
// level shader samples, and `cssGradient()` draws the matching legend bar.
import * as THREE from "three";

// ColorBrewer-derived stops (RdYlBu reversed for temperature, BrBG for
// humidity) and a blue-green-yellow-red-purple ramp for wind speed.
const WIND = ["#eef4fa", "#c6dbef", "#9ecae1", "#4292c6", "#41ab5d", "#addd8e", "#fec44f", "#fe9929", "#e31a1c", "#7a0177"];
const TEMP = ["#313695", "#4575b4", "#74add1", "#abd9e9", "#e0f3f8", "#ffffbf", "#fee090", "#fdae61", "#f46d43", "#d73027", "#a50026"];
const RH = ["#8c510a", "#bf812d", "#dfc27d", "#f6e8c3", "#f5f5f5", "#c7eae5", "#80cdc1", "#35978f", "#01665e"];

function spread(colors, min, max) {
  return colors.map((c, i) => [min + (max - min) * (i / (colors.length - 1)), c]);
}

// key -> {label, units, min, max, stops}. Ranges are fixed per quantity and
// level so colours mean the same thing at every forecast step and in both
// models. Temperature ranges follow each level's typical North Pacific span
// (warm-season tropics to cold-season Bering Sea); wind ranges widen with
// height toward the jet stream.
const TEMP_RANGE = { 1000: [-20, 35], 925: [-25, 30], 850: [-30, 25], 700: [-35, 15], 500: [-45, -5], 300: [-60, -30], 250: [-65, -35] };
const HEIGHT = ["#2d1e5c", "#2c5aa0", "#4c9bd1", "#9fd3e0", "#f3efc6", "#f6c26b", "#e8843a", "#b8401f"];
const GH_RANGE = { 1000: [-300, 400], 925: [400, 1000], 850: [1050, 1650], 700: [2650, 3250], 500: [4900, 6000], 300: [8400, 9800], 250: [9600, 11200] };
const WIND_MAX = { 1000: 60, 925: 70, 850: 80, 700: 90, 500: 120, 300: 180, 250: 180 };

export const SCALES = {
  wind10: { label: "10 m wind speed", units: "kt", min: 0, max: 60, stops: spread(WIND, 0, 60) },
  t2m: { label: "2 m temperature", units: "°C", min: -30, max: 35, stops: spread(TEMP, -30, 35) },
  // Sea surface temperature. Land and ice are MISSING in the data; the
  // browser sends them as SEA_MISSING, which lands in the see-through band
  // below -2 C (seawater freezes at about -1.9 C, so no real value is there).
  sst: { label: "sea surface temperature", units: "°C", min: -4, max: 32, ends: [-2, 32],
    stops: [[-4, "#313695", 0], [-2.05, "#313695", 0], ...spread(TEMP, -2, 32)] },
};
export const SEA_MISSING = -1000;
// Section (CT scan) quantities. Wind across the section is diverging: red =
// through it from its left to its right, blue = the other way.
const DIVERGE = ["#053061", "#2166ac", "#4393c3", "#92c5de", "#d1e5f0", "#f7f7f7", "#fddbc7", "#f4a582", "#d6604d", "#b2182b", "#67001f"];
Object.assign(SCALES, {
  sec_speed: { label: "wind speed (slice or plane)", units: "kt", min: 0, max: 180, stops: spread(WIND, 0, 180) },
  sec_across: { label: "wind across the slice (+ from its left)", units: "kt", min: -150, max: 150, stops: spread(DIVERGE, -150, 150) },
  sec_along: { label: "wind along the slice", units: "kt", min: -150, max: 150, stops: spread(DIVERGE, -150, 150) },
  sec_temp: { label: "temperature (slice or plane)", units: "°C", min: -65, max: 35, stops: spread(TEMP, -65, 35) },
  sec_theta: { label: "potential temperature θ (slice or plane)", units: "K", min: 270, max: 370, stops: spread(TEMP, 270, 370) },
  sec_rh: { label: "relative humidity (slice or plane)", units: "%", min: 0, max: 100, stops: spread(RH, 0, 100) },
});
// Context levels as faint sheets: one see-through grey.
SCALES.sheet = { label: "context sheet", units: "", min: 0, max: 1, stops: [[0, "#94a3b8", 0.35], [1, "#94a3b8", 0.35]] };
for (const [lv, [tmin, tmax]] of Object.entries(TEMP_RANGE)) {
  SCALES[`wind${lv}`] = { label: `${lv} mb wind speed`, units: "kt", min: 0, max: WIND_MAX[lv], stops: spread(WIND, 0, WIND_MAX[lv]) };
  SCALES[`t${lv}`] = { label: `${lv} mb temperature`, units: "°C", min: tmin, max: tmax, stops: spread(TEMP, tmin, tmax) };
  SCALES[`rh${lv}`] = { label: `${lv} mb relative humidity`, units: "%", min: 0, max: 100, stops: spread(RH, 0, 100) };
  // Height of the level: low (troughs) blue to high (ridges) orange, the
  // coloured 500 mb chart convention. Ranges span each level's North Pacific
  // extremes (deep Aleutian lows to subtropical ridges).
  SCALES[`gh${lv}`] = { label: `${lv} mb height`, units: "m", min: GH_RANGE[lv][0], max: GH_RANGE[lv][1], stops: spread(HEIGHT, ...GH_RANGE[lv]) };
  // See-through below 70 % RH, so observed satellite cloud shows beside the
  // model's moist air (the "model against the satellite" comparison).
  SCALES[`moist${lv}`] = { label: `${lv} mb moist air (RH ≥ 70 %)`, units: "%", min: 0, max: 100,
    stops: [[0, "#ffffff", 0], [69.9, "#e0f7ff", 0], [70, "#a5f3fc", 0.35], [85, "#22d3ee", 0.65], [100, "#0891b2", 0.9]] };
}

const textures = new Map();

export function texture(key) {
  if (!textures.has(key)) {
    const { stops, min, max } = SCALES[key];
    const data = new Uint8Array(256 * 4);
    const rgb = stops.map(([v, c, a = 1]) => [v, new THREE.Color(c), a]);
    for (let i = 0; i < 256; i++) {
      const v = min + (max - min) * (i / 255);
      let k = 0;
      while (k < rgb.length - 2 && v > rgb[k + 1][0]) k++;
      const [v0, c0, a0] = rgb[k], [v1, c1, a1] = rgb[k + 1];
      const f = Math.min(1, Math.max(0, (v - v0) / (v1 - v0)));
      const c = c0.clone().lerp(c1, f);
      data.set([Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), Math.round((a0 + (a1 - a0) * f) * 255)], i * 4);
    }
    const tex = new THREE.DataTexture(data, 256, 1, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    textures.set(key, tex);
  }
  return textures.get(key);
}

export function cssGradient(key) {
  const { stops, min, max } = SCALES[key];
  const css = (c, a) => (a == null || a >= 1 ? c : `rgba(${[1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)).join(",")},${a})`);
  const parts = stops.map(([v, c, a]) => `${css(c, a)} ${(((v - min) / (max - min)) * 100).toFixed(1)}%`);
  return `linear-gradient(to right, ${parts.join(", ")})`;
}

// Anomalies vs 1991-2020 (anomaly.js): diverging, zero white, blue below
// normal and red above. Fixed symmetric ranges per quantity so a colour means
// the same departure at every step. Sea-temperature anomaly keeps SST's
// see-through band for land and ice (SEA_MISSING lands below `ends[0]`;
// real values are clamped into the scale by the browser).
const GHA_RANGE = { 1000: 200, 925: 200, 850: 200, 700: 250, 500: 300, 300: 400, 250: 400 };
for (const lv of Object.keys(GHA_RANGE)) {
  const r = GHA_RANGE[lv], tr = Number(lv) >= 700 ? 12 : 10;
  SCALES[`gha${lv}`] = { label: `${lv} mb height anomaly vs 1991–2020`, units: "m", min: -r, max: r, stops: spread(DIVERGE, -r, r), anomaly: true };
  SCALES[`ta${lv}`] = { label: `${lv} mb temperature anomaly vs 1991–2020`, units: "°C", min: -tr, max: tr, stops: spread(DIVERGE, -tr, tr), anomaly: true };
}
SCALES.mslpa = { label: "sea-level pressure anomaly vs 1991–2020", units: "hPa", min: -25, max: 25, stops: spread(DIVERGE, -25, 25), anomaly: true };
SCALES.ssta = { label: "model sea temperature anomaly vs 1991–2020", units: "°C", min: -4.4, max: 4, ends: [-4, 4], anomaly: true,
  stops: [[-4.4, "#053061", 0], [-4.02, "#053061", 0], ...spread(DIVERGE, -4, 4)] };
// Significant wave height (the mean of the highest third of waves), 0-12 m;
// land and ice (SEA_MISSING) see-through like sea temperature.
const WAVE = ["#f7fbff", "#c6dbef", "#6baed6", "#2171b5", "#41ab5d", "#fec44f", "#fe9929", "#e31a1c", "#99000d", "#54278f"];
SCALES.hs = { label: "significant wave height", units: "m", min: -0.6, max: 12, ends: [0, 12],
  stops: [[-0.6, "#f7fbff", 0], [-0.05, "#f7fbff", 0], ...spread(WAVE, 0, 12)] };
// Peak / primary wave period, 0-20 s: short wind sea pale, long swell dark
// purple (a 16 s swell is old and has come a long way). Land see-through.
const PERIOD = ["#fff7ec", "#fee8c8", "#fdd49e", "#fdbb84", "#fc8d59", "#ef6548", "#d7301f", "#b30000", "#7f0000", "#49006a"];
SCALES.tp = { label: "wave period", units: "s", min: -1, max: 20, ends: [0, 20],
  stops: [[-1, "#fff7ec", 0], [-0.1, "#fff7ec", 0], ...spread(PERIOD, 0, 20)] };
// Anomaly volumes (volume.js SIGNED): the same diverging colours as the fills.
SCALES.vol_tanom = { label: "temperature anomaly vs 1991–2020", units: "°C", min: -12, max: 12, stops: spread(DIVERGE, -12, 12), anomaly: true };
SCALES.vol_ghanom = { label: "height anomaly vs 1991–2020", units: "m", min: -300, max: 300, stops: spread(DIVERGE, -300, 300), anomaly: true };
// Vertical motion (cm/s, + = rising; from the models' omega): sinking brown,
// rising blue, a see-through band within 0.5 cm/s of still so weak motion
// doesn't smear colour everywhere (user request, 2026-09-28: "I can't see
// air rising or subsiding"). Low levels move less (the ground stops it), so
// their range is narrower.
const VV = ["#7f3b08", "#b35806", "#e08214", "#fdb863", "#fee0b6", "#f7f7f7", "#d1e5f0", "#92c5de", "#4393c3", "#2166ac", "#053061"];
export const W_RANGE = { 1000: 10, 925: 20, 850: 30, 700: 30, 500: 30, 300: 30, 250: 30 };
const vvStops = (r) => spread(VV, -r, r).map(([v, c]) => [v, c, Math.min(1, 0.15 + Math.abs(v) / r)]);
for (const [lv, r] of Object.entries(W_RANGE)) {
  SCALES[`w${lv}`] = { label: `${lv} mb vertical motion (+ rising)`, units: "cm/s", min: -r, max: r, stops: vvStops(r) };
}
SCALES.sec_w = { label: "vertical motion (slice or plane, + rising)", units: "cm/s", min: -30, max: 30, stops: spread(VV, -30, 30) };
SCALES.vol_w = { label: "rising and sinking air", units: "cm/s", min: -50, max: 50, stops: spread(VV, -50, 50) };
// Sea-level pressure as a fill (the Past year mode): deep lows purple-blue,
// strong highs orange-red, 960-1045 hPa.
SCALES.arch_mslp = { label: "sea-level pressure", units: "hPa", min: 960, max: 1045, stops: spread(HEIGHT, 960, 1045) };
// Precipitable water (the Past year mode): all the water vapour above a
// point, in mm if it rained out. Dry air tan, moist green, atmospheric-river
// values (> 40 mm outside the tropics) blue to purple.
SCALES.arch_pwat = { label: "precipitable water", units: "mm", min: 0, max: 70,
  stops: [[0, "#8c6d31"], [10, "#d9c38a"], [20, "#e8efd6"], [30, "#7fc97f"], [40, "#2c7fb8"], [55, "#253494"], [70, "#6a1b9a"]] };
// Sea-ice cover, % of the sea: see-through below 15 % (the usual ice edge) and
// over land (missing -> below the range).
SCALES.arch_ice = { label: "sea-ice cover", units: "%", min: -10, max: 100, ends: [15, 100],
  stops: [[-10, "#ffffff", 0], [14.9, "#ffffff", 0], [15, "#c6dbef", 0.75], [50, "#eff6ff", 0.9], [100, "#ffffff", 0.95]] };
// The forecast's water vapour fill (Stage 4): the same colours as the Past year's.
SCALES.pwat = { ...SCALES.arch_pwat, label: "water vapour (precipitable water)" };
// Derived quantities (derived3d.js), ranges from the real GFS (2026-09-29:
// 1-99 % at 850-250 mb): vorticity +-8..19, divergence +-6..7 (1e-5 /s),
// turbulence index up to ~20 (1e-7 /s^2) near the jet, stability 3-5.5 K/km
// at 500 mb and up to 16 above the tropopause.
const STAB = ["#fde725", "#90d743", "#35b779", "#21918c", "#31688e", "#443983", "#440154"];
Object.assign(SCALES, {
  sec_vort: { label: "vorticity (+ counter-clockwise: cyclonic north of the equator)", units: "×10⁻⁵/s", min: -20, max: 20, stops: spread(DIVERGE, -20, 20) },
  sec_div: { label: "divergence (+ spreading out, − converging)", units: "×10⁻⁵/s", min: -10, max: 10, stops: spread(DIVERGE, -10, 10) },
  sec_ti: { label: "turbulence index (Ellrod; 8 moderate, 12 severe)", units: "×10⁻⁷/s²", min: 0, max: 20, stops: spread(WIND, 0, 20) },
  // Richardson number: red below 0 (convection), orange-yellow to 0.25 (shear turbulence), green to
  // 1 (marginal), blue above (smooth). The scale stops at 3; larger values show as the top colour.
  sec_ri: { label: "Richardson number (below 0.25: turbulent mixing; above 1: smooth)", units: "", min: -1, max: 3,
    stops: [[-1, "#99000d"], [0, "#f16913"], [0.25, "#fed976"], [0.6, "#a1d99b"], [1, "#41ab5d"], [2, "#4292c6"], [3, "#08306b"]] },
  // Boundary-layer depth (GFS HPBL), m; missing (ECMWF, older builds) sent as SEA_MISSING, see-through.
  hpbl: { label: "boundary-layer depth (how deep the air is mixed)", units: "m", min: -100, max: 3000, ends: [0, 3000],
    stops: [[-100, "#fff7ec", 0], [-1, "#fff7ec", 0], [0, "#fff7ec"], [300, "#fee8c8"], [600, "#fdd49e"], [1000, "#fdbb84"], [1500, "#fc8d59"], [2000, "#e34a33"], [3000, "#7f0000"]] },
  sec_stab: { label: "stability dθ/dz (low: can overturn; high: inversion, stratosphere)", units: "K/km", min: 0, max: 16, stops: spread(STAB, 0, 16) },
});
// Front diagnostics (from opc-sa-reconstruct), real GFS 1000-250 mb (1-99 %):
// theta-e 282-358 K; thermal gradient up to 4.5 K/100 km (a front: 1.2, the
// NWS manual's "6 C over 500 km"); frontogenesis about +-1.5-2 K/100 km/3 h.
const GRAD = ["#f7fcf5", "#c7e9c0", "#74c476", "#238b45", "#fdae61", "#d7191c", "#67001f"];
Object.assign(SCALES, {
  sec_thetae: { label: "equivalent potential temperature θe (air masses, moisture counted in)", units: "K", min: 280, max: 360, stops: spread(TEMP, 280, 360) },
  sec_grad: { label: "thermal gradient |∇θ| (a front zone from about 1.2)", units: "K/100 km", min: 0, max: 5, stops: spread(GRAD, 0, 5) },
  sec_fgen: { label: "frontogenesis (+ a front sharpening, − weakening)", units: "K/100 km/3 h", min: -3, max: 3, stops: spread(DIVERGE, -3, 3) },
});
SCALES.vol_fgen = { ...SCALES.sec_fgen };
SCALES.vol_vort = { ...SCALES.sec_vort };
SCALES.vol_div = { ...SCALES.sec_div };
SCALES.ssto = { ...SCALES.sst, label: "observed sea temperature (OISST daily mean)" };
SCALES.sstoa = { ...SCALES.ssta, label: "observed sea temperature anomaly vs 1991–2020 (OISST)" };

// GFS minus ECMWF (user request, 2026-09-29): one model's field minus the
// other's at the same valid time, on a diverging scale centred on zero (red:
// GFS higher, blue: ECMWF higher), symmetric +-range, with SST's see-through
// band below -range for land and ice (the browser clamps real values into
// the scale and sends missing ones as SEA_MISSING). Made on demand per field.
export function diffScale(key, range, { band = true } = {}) {
  const id = `${band ? "diff" : "diffv"}_${key}`;
  if (!SCALES[id] && SCALES[key] && !band) {
    // (for the 3-D fill: plain diverging, no see-through band -- its values are stored clamped to +-range)
    SCALES[id] = { label: `GFS − ECMWF: ${SCALES[key].label}`, units: SCALES[key].units, min: -range, max: range, anomaly: true, stops: spread(DIVERGE, -range, range) };
  }
  if (!SCALES[id] && SCALES[key]) {
    const lo = -range * 1.1;
    SCALES[id] = { label: `GFS − ECMWF: ${SCALES[key].label}`, units: SCALES[key].units, min: lo, max: range, ends: [-range, range], anomaly: true,
      stops: [[lo, "#053061", 0], [-range * 1.005, "#053061", 0], ...spread(DIVERGE, -range, range)] };
  }
  return id;
}
SCALES.sec_rib = { ...SCALES.sec_ri, label: "bulk Richardson number, ground to this level (below 0.25: mixed from the ground)" };
