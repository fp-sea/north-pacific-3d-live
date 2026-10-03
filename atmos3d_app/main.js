// North Pacific 3D: GFS and ECMWF fields at their true (exaggerated) height
// over a Mercator basemap -- sea-level pressure with 10 m wind / 2 m
// temperature fills, and pressure levels 1000-250 mb with height contours
// and wind / temperature / humidity fills -- from 24 h ago (earlier runs,
// with observed satellite IR) through now to 7 days ahead, blended between
// the real steps for smooth motion. Opens at "now" (timeinfo.js).
//
// Data: <data>/manifest.json + gzipped uint16 bundles written by
// src/assemble/export_atmos3d.py. Scene approach adapted from the sibling
// Radar Volume Explorer project (three.js, OrbitControls, z-up km scene,
// render-on-demand loop); its radar-centred projection is replaced by the
// Mercator in project.js.
import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";
import { R_KM, inverseMercatorKm, makeGeo, mercatorKm, selfCheck } from "./project.js?v=20261003090005";
import { SatelliteFrames } from "./satellite.js?v=20261003090005";
import { makeGround } from "./ground.js?v=20261003090005";
import { BundleLoader, buildVersion, dequantize, fetchU16 } from "./loader.js?v=20261003090005";
import { ARCHIVE_QUESTIONS, ARCHIVE_SEA, ARCHIVE_VIEWS, ARCHIVE_WIND_LEVELS, archiveFill, archiveStartDay, archiveIndex, archiveLines, archiveSeries, archiveWind, seriesSvg } from "./archive.js?v=20261003090005";
import { SCALES, SEA_MISSING, cssGradient, diffScale } from "./colormaps.js?v=20261003090005";
import { GridLayer } from "./levelMesh.js?v=20261003090005";
import { Timeline } from "./timeline.js?v=20261003090005";
import { fmtLocal, fmtUtc, hoursFrom, markers, opcChartAt, opcNeighbour, openAt, relNow, runTag, staleness, stepSource } from "./timeinfo.js?v=20261003090005";
import { BarbLayer, FlowLayer, PARTICLE_STYLE, ParticleSystem } from "./winds.js?v=20261003090005";
import { CoastOverlay } from "./overlays.js?v=20261003090005";
import { Graticule } from "./graticule.js?v=20261003090005";
import { QUESTIONS, deepestLow, surfaceParticlesOf } from "./questions.js?v=20261003090005";
import { PLACES } from "./places.js?v=20261003090005";
import { labelKey, labelsHtml, layoutLabels } from "./labels.js?v=20261003090005";
import { HeightRuler, northAngle } from "./orientation.js?v=20261003090005";
import { findExtremes } from "./extremes.js?v=20261003090005";
import { RELIEF_MAX, levelMean, reliefHeights } from "./relief.js?v=20261003090005";
import { FT_PER_M, fmtHeight, fmtHeightBoth, fmtWave, heightTicks, stdPressureMb } from "./units.js?v=20261003090005";
import { buildSection, heightMap, levelField, levelHeights, sectionPath, slabPaths } from "./section.js?v=20261003090005";
import { bulkRichardson, frontal, horizontal, thetaE, withDerived } from "./derived3d.js?v=20261003090005";
import { BELOW } from "./volume.js?v=20261003090005";
import { rng, traceFlow } from "./stream3d.js?v=20261003090005";
import { Strokes3D } from "./strokes3d.js?v=20261003090005";
import { CASES, caseStatus, dayIndex } from "./cases.js?v=20261003090005";
import { DEFAULTS as SIM_DEFAULTS, centredField, declination, diagnostics as simDiagnostics, initSim, makeSim } from "./sim2d.js?v=20261003090005";
import { SIM_LAYER, SimScene } from "./simscene.js?v=20261003090005";
import { SIM_LESSONS, TEXTBOOK, coriolisArrows, modelLabels } from "./simlessons.js?v=20261003090005";
import { PE_FILLS, drawPESection, fillTexture, flowLines, highsLows, surfaceBelts } from "./pe3dview.js?v=20261003090005";
import { drawSimSection } from "./simview.js?v=20261003090005";
import { SimParticles } from "./simparticles.js?v=20261003090005";
import { TOP_KM, boxFrame, clampBox, inWall, regionHeights, wallFrame, wallSeed } from "./region.js?v=20261003090005";
import { SectionCurtain, SectionLevelLines } from "./section3d.js?v=20261003090005";
import { ROI } from "./levelMesh.js?v=20261003090005";
import { SIGNED, buildVolumeBytes, filledShare } from "./volume.js?v=20261003090005";
import { VolumeLayer } from "./volume3d.js?v=20261003090005";
import { OpcChartLayer } from "./opcchart.js?v=20261003090005";
import { ParticleVolume } from "./particles3d.js?v=20261003090005";
import { groundHeight } from "./particles3d_math.js?v=20261003090005";
import { anomaly, climSlots, upsample, validDate } from "./anomaly.js?v=20261003090005";
import { decodeState, encodeState } from "./share.js?v=20261003090005";
import { drawMapChart, drawSliceChart, lut } from "./slicechart.js?v=20261003090005";
import { FPS, composite, outputSize, record, saveBlob } from "./exporter.js?v=20261003090005";
import { Tour } from "./tour.js?v=20261003090005";
import { bilinear } from "./section.js?v=20261003090005";
import { columnProfile, meteogramHourAt, meteogramSvg, nearestIndex, profileSvg, profileTable } from "./probe.js?v=20261003090005";

const root = document.getElementById("atmos3d");
const DATA = root.dataset.data;
const $ = (id) => document.getElementById(id);
let dirty = true;   // set whenever something on screen changed; the loop renders only then (or while playing)
let hover = null;   // hover readout target: {lat, lon} + {px, py} canvas px, or null
// What's shown (the panel's state). Declared up here: applyTime reads it, and
// a let used before its line is a temporal-dead-zone error (BUILD_SPEC §12).
// particles / barbs / flow: the focus level's wind (at the surface, its 10 m
// wind); surfaceParticles: the Surface section's own particles, off / the
// 10 m wind / wave energy, shown whatever the focus (user request, 2026-09-28).
// At the surface the focus "particles" box and the Surface section are one
// particle system: ticking it means surfaceParticles = "wind".
// focusLines: the focus level's own contours (isobars at the surface); off
// leaves its fill alone, e.g. wave height without isobars (user request).
const show = { focus: "sfc", context: new Set(), fill: "none", particles: true, barbs: false, flow: false, surfaceParticles: "wind", focusLines: true, diff: false };
let question = null;     // the question picked, or null for Custom
let noteKey = null;      // which step the question's live note was computed for
let focusOpacity = 0.75;
let probeAt = null;      // pinned column {lat, lon, k}, or null
let probeKey = null;     // what the probe panel was last drawn for
// The past-year archive mode (archive.js): on, day index, what's shown.
// The Simulate mode (sim2d.js; user request 2026-09-30): declared here so layer code can check it.
const sim = { on: false, s: null, p: null, worker: null, got: false, fast: false, paused: false, parts: null, scene: null, field: null, lastChart: 0,
  speed: 5, pdays: 0.5, exag: 30, vex: 100, count: 12000, tails: true, slabOn: false, slabW: 30, slabLon: 0, viewLon: null, showMap: false, showSun: true, saved: null,
  lesson: null, step: 0, labels: true, arrows: false, textbook: false,
  model: "2d", pew: null, pe: null, peGot: false, peNew: false, fill: "tlow", chartMean: true, hl: [], fillTex: null,
  size: 3, opacity: 0.9, tailSec: 0.35, band: "all", flow: false };
const arch = { on: false, i: 0, view: "mslp", mode: "anomaly", lines: "auto", wind: "auto", windAs: "flow", playing: null, saved: null, layer: null,
  flow: null, barbs: null, particles: null, windField: null,
  cache: new Map(), scaleKey: null, seriesToken: 0 };
let hlOn = true;         // H and L labels (master switch, Map tab)
// Levels labelled with H and L (the column's H/L boxes). Only the focus by
// default: every level at once was too much (user report, 2026-09-28). A
// level ticked by hand while it ISN'T the focus stays ticked when the focus
// moves; the focus's own tick moves with it.
const hlLevels = new Set(["sfc"]), hlByHand = new Set();
// Changing focus hands everything to the new level -- fill, H/L, wind -- and
// the old one goes back to how it was before it took focus: context lines
// only if it had them (user report, 2026-09-28: the old focus kept its lines
// and labels, which piled up as you stepped through levels).
let focusWasContext = false;
function moveFocus(to) {
  if (to === show.focus) return;
  if (focusWasContext) show.context.add(show.focus); else show.context.delete(show.focus);
  if (!hlByHand.has(show.focus)) hlLevels.delete(show.focus);
  focusWasContext = show.context.has(to);
  show.context.delete(to);
  show.focus = to;
  hlLevels.add(to);
}
let relief = 1;          // focus level's relief (relief.js); 1 = true shape
let shadeOn = true;      // hillshade on filled levels
let contextSheets = false;   // context levels as faint sheets, not just lines
// Height unit for the ruler, slice axis, probe and readout (the column shows
// both). Remembered on this device; U toggles.
let hUnit = "km";
try { if (localStorage.getItem("np3d.hunit") === "ft") hUnit = "ft"; } catch { /* ignore */ }
// Wave heights in m or ft (user request), separate from the km/ft of
// altitudes: sailors often want feet for seas and metres elsewhere.
let waveUnit = "m";
try { if (localStorage.getItem("np3d.waveunit") === "ft") waveUnit = "ft"; } catch { /* ignore */ }
// arrows: the air's motion in the slice's plane on the flat chart (along-slice wind + vertical motion).
// The region of interest (region.js): everything in the 3-D tab follows it --
// the slice plane (a wall's), the volume fill and the 3-D particles.
// shape "whole" | "wall" (the slice's line, width sec.thick) | "layer";
// zLo/thick: its heights (km), thickness first.
// dim: how visible the other layers stay outside it (0..1).
// plane: the plane is shown -- a wall's vertical slice (sec) or, for a layer or the
// whole atmosphere, the horizontal plane (hp).
// qty: what the region shows -- the fill, the particles (coloured by it) and the plane all use it.
// box: the "a box" shape's edges (deg N, deg E 0-360); by default the storm track mid-basin.
const roi = { shape: "whole", zLo: 0, thick: TOP_KM, dim: 0.35, plane: false, qty: "speed", sweep: null, diff: false,
  box: { latS: 35, latN: 50, lonW: 175, lonE: 205 }, outline: true };
// The horizontal plane: a map of qty at height zKm, with lines (Phase 3).
const hp = { on: false, zKm: 5.5, qty: "speed", lines: "pressure", opacity: 0.85, layer: null, key: null, cache: new Map() };
// The 3-D flow lines (updateFlow3d): state here, with the region's, since updateSection reaches it.
const fl3 = { on: false, count: 300, hours: 12, vertical: 0, opacity: 0.9, colorBy: "q", obj: null, key: null, lines: 0 };
// levels: each pressure level's height drawn on the slice (3-D and flat chart).
const sec = { on: false, mode: "ns", pos: 180, turn: 0, thick: 0, qty: "across", lines: "theta", arrows: false, levels: true };   // the slice
let secPath = null, secSlotKey = null, secSweep = null, secLevelH = null;   // secLevelH: the level heights drawn (labels)
let secChartOn = true, secChartKey = null, secState = null;   // the flat chart (slicechart.js)
// mode: "shape" (only beyond thr) or "all" (the region tinted everywhere).
const vol = { on: false, qty: "speed", thr: 70, opacity: 0.8, window: false, mode: "shape" };   // the volume (volume.js)
// 3-D particles; zKm is the slab's BOTTOM (user preference), thickKm reaches up from it.
// vertical: rise and sink with the model's vertical motion, 0 = off, 1 = true speed, 5 = exaggerated x5.
const p3 = { on: false, zKm: 0, thickKm: 2, colorBy: "height", density: 1, vertical: 0, opacity: 0.9, key: null, field: null, stops: null, sweep: null };   // 3-D particles
let pvol = null;
let volKey = null, volShare = null;
const hlCache = new Map();   // layer:model:step -> extremes

const manifest = await (await fetch(`${DATA}/manifest.json`, { cache: "no-cache" })).json();
const KT = 1.943844;
const MODEL_LABEL = { gfs: "GFS", ecmwf: "ECMWF" };
// OPC's own charts (manifest.opc; export_opc_charts), shown near their valid time.
const OPC = manifest.opc?.charts?.length ? manifest.opc : null;
let opcProduct = "", opcShown = null, opcBlink = false;   // C blinks the chart off and on
// Chart products from every office (manifest.opc.products: label, office, box);
// builds before HFO carried no product list.
const OPC_PRODUCTS = OPC?.products && Object.keys(OPC.products).length ? OPC.products
  : { surface_analysis: { label: "OPC surface analysis", office: "OPC" }, "500mb": { label: "OPC 500 mb", office: "OPC" } };
const OPC_LABEL = Object.fromEntries(Object.entries(OPC_PRODUCTS).map(([k, v]) => [k, v.label]));
const chartKind = (c) => `${c.office ?? "OPC"}'s ${c.lead_h ? `${c.lead_h} h forecast` : "analysis"}`;
const OPC_CMP_COLOR = "#d6247a";      // the model's lines while an OPC chart is shown (opcCompare)
let model = manifest.models[0];
// "Now": this device's clock when the page opened, in hours from the anchor.
const NOW_MS = Date.now();
const NOW_H = (NOW_MS - Date.parse(manifest.anchor)) / 3600e3;

// ---- projection + self-check -------------------------------------------------
// geo: flat Mercator <-> globe, blended by geo.uniforms.morph (project.js).
const geo = makeGeo(manifest.ground);
const projErrKm = selfCheck(manifest.projection.control_points);
console.info(`[atmos3d] projection self-check: max ${projErrKm.toFixed(3)} km vs pyproj`);

// ---- scene ------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
root.appendChild(renderer.domElement);
const scene = new THREE.Scene();
// Background (user request, 2026-09-29: the volume was hard to see against
// dark space). Measured on the real build, a see-through fill changes the
// pixels behind it about twice as much on light grey as on dark (RGB change
// 113-146 vs 49-73); a dusk blue tried alongside was the worst (35-38).
// White (user request, 2026-09-29): measured, it shows every fill most
// clearly (mean RGB change over bare background, e.g. humidity >= 80 %: 27
// dark, 75 light grey, 199 white); light grey stays the gentler default.
const BG = { space: new THREE.Color("#0b0e13"), light: new THREE.Color("#d5dbe3"), white: new THREE.Color("#ffffff") };
let bgName = "space";
function setBackground(name) {
  bgName = BG[name] ? name : "space";
  scene.background = BG[bgName];
  $("bgSel").value = bgName; $("bgSel3d").value = bgName;      // the Map tab's menu and its copy under the colour fill
  document.documentElement.dataset.scene = bgName;
  dirty = true;
}
scene.background = BG.space;
// The background follows the region's colour fill (user request, 2026-09-29):
// light grey while the fill is on, dark otherwise. Picking one in the menu
// overrides it for that case (fill on / off), remembered on this device.
const BG_AUTO = { fill: "light", plain: "space" };
const bgPref = { ...BG_AUTO };
try { const s = JSON.parse(localStorage.getItem("np3d.bg") || "{}"); for (const k of ["fill", "plain"]) if (BG[s[k]]) bgPref[k] = s[k]; } catch { /* ignore */ }
let bgState = "plain";
const bgCase = () => (vol.on && !arch.on ? "fill" : "plain");
function syncBackground(force = false) {
  const c = bgCase();
  if (c === bgState && !force) return;
  bgState = c; setBackground(bgPref[c]);
}
const camera = new THREE.PerspectiveCamera(45, 1, 5, 150000);
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI / 2 - 0.02;
controls.screenSpacePanning = true;

// Ground: the gallery's own basemap, rendered by render_ground_texture.py.
const ground = makeGround(DATA, manifest, geo, () => { dirty = true; });
ground.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
scene.add(ground.mesh);

// Globe backdrop: the rest of the Earth just below the ground, with a
// whole-Earth basemap in the same style (render_world_texture.py), slightly
// dimmed so the forecast domain stands out. Texture coordinates come from
// each pixel's own lat/lon (undoing the globe's rotation), so there is no
// seam at the dateline. Fades in with the morph; hidden on the flat map.
const worldTex = manifest.world ? new THREE.TextureLoader().load(`${DATA}/${manifest.world.file}${buildVersion(manifest)}`, () => { dirty = true; }) : null;
if (worldTex) { worldTex.colorSpace = THREE.NoColorSpace; worldTex.generateMipmaps = false; worldTex.minFilter = THREE.LinearFilter; }
const backdrop = new THREE.Mesh(
  new THREE.SphereGeometry(R_KM - 8, 128, 96),
  new THREE.ShaderMaterial({
    uniforms: { geoRot: geo.uniforms.geoRot, map: { value: worldTex }, hasMap: { value: worldTex ? 1 : 0 }, opacity: { value: 0 } },
    vertexShader: `varying vec3 vDir;
      void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform mat3 geoRot; uniform sampler2D map; uniform float hasMap; uniform float opacity;
      varying vec3 vDir;
      void main() {
        vec3 s = normalize(vDir);
        vec3 e = vec3(dot(geoRot[0], s), dot(geoRot[1], s), dot(geoRot[2], s));   // scene -> Earth-centred
        vec2 uv = vec2(atan(e.y, e.x) / 6.283185307 + 0.5, asin(clamp(e.z, -1.0, 1.0)) / 3.141592654 + 0.5);
        vec3 c = hasMap > 0.5 ? texture2D(map, uv).rgb * 0.8 : vec3(0.11, 0.17, 0.23);
        gl_FragColor = vec4(c, opacity);
      }`,
    transparent: true,
  }),
);
backdrop.position.set(0, 0, -R_KM);
backdrop.renderOrder = -1;
backdrop.visible = false;
scene.add(backdrop);

// ---- layer definitions ----------------------------------------------------------
const zeroCache = new Map();
const ZEROS = (n) => { if (!zeroCache.has(n)) zeroCache.set(n, new Float32Array(n)); return zeroCache.get(n); };
// Standard constant-pressure-chart height intervals: 30 m low in the
// atmosphere, 60 m at 500 mb, 120 m near the jet.
const HEIGHT_INTERVAL = { 1000: 30, 925: 30, 850: 30, 700: 30, 500: 60, 300: 120, 250: 120 };

function surfaceDef() {
  return {
    key: "sfc",
    title: "Sea-level pressure",
    bundle: "sfc",
    contourLabel: "isobars every 4 hPa",
    interval: 4,
    fills: { none: null, mslp: "arch_mslp", wind10: "wind10", t2m: "t2m", sst: "sst", pwat: "pwat", hs: "hs", tp: "tp", mslpa: "mslpa", ssta: "ssta", ssto: "ssto", sstoa: "sstoa", sheet: "sheet",
      sec_vort: "sec_vort", sec_div: "sec_div", sec_grad: "sec_grad", sec_fgen: "sec_fgen", hpbl: "hpbl" },
    defaultFill: "none",
    opacity: 0.6,
    options: { lift: 12, lineColor: "#26303c", lineWidth: 1.3, renderOrder: 10 },
    derive(f) {
      const n = f.mslp.length;
      const c = new Float32Array(n), wind10 = new Float32Array(n), t2m = new Float32Array(n), sst = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        c[k] = f.mslp[k] / 100;
        wind10[k] = Math.hypot(f.u10[k], f.v10[k]) * KT;
        t2m[k] = f.t2m[k] - 273.15;
        // Land, ice (and builds before the field existed) -> see-through.
        sst[k] = f.sst && Number.isFinite(f.sst[k]) ? f.sst[k] - 273.15 : SEA_MISSING;
      }
      // Derived (derived3d.js; user request, 2026-09-29): 10 m vorticity and
      // divergence (convergence lines, the ITCZ), and the 2 m temperature's
      // gradient and frontogenesis under the 10 m wind (surface fronts).
      const hz = horizontal(f.u10, f.v10, manifest.grid), th = new Float32Array(n);
      for (let k = 0; k < n; k++) th[k] = f.t2m[k] * Math.pow(100000 / f.psfc[k], 0.2857);
      const fr = frontal(th, f.u10, f.v10, manifest.grid);
      // hpbl: the boundary layer's depth, m (GFS only; ECMWF and older builds: see-through).
      const hpbl = new Float32Array(n);
      for (let k = 0; k < n; k++) hpbl[k] = f.hpbl && Number.isFinite(f.hpbl[k]) ? f.hpbl[k] : SEA_MISSING;
      // pwat: water vapour, mm (Stage 4; builds before it: none).
      return { h: null, c, o: null, u: f.u10, v: f.v10, fills: { arch_mslp: c, wind10, t2m, sst, pwat: f.pwat ?? ZEROS(n), sheet: ZEROS(n),
        sec_vort: hz.vort, sec_div: hz.div, sec_grad: fr.grad, sec_fgen: fr.fgen, hpbl } };
    },
  };
}

function levelDef(lv, order) {
  return {
    key: `p${lv}`,
    level: lv,
    title: `${lv} mb`,
    bundle: `p${lv}`,
    contourLabel: `heights every ${HEIGHT_INTERVAL[lv] ?? 60} m`,
    interval: HEIGHT_INTERVAL[lv] ?? 60,
    fills: { sec_vort: "sec_vort", sec_div: "sec_div", sec_thetae: "sec_thetae", sec_grad: "sec_grad", sec_fgen: "sec_fgen", sec_rib: "sec_rib",
      [`wind${lv}`]: `wind${lv}`, [`t${lv}`]: `t${lv}`, [`rh${lv}`]: `rh${lv}`, [`w${lv}`]: `w${lv}`, [`moist${lv}`]: `moist${lv}`, [`gh${lv}`]: `gh${lv}`, [`gha${lv}`]: `gha${lv}`, [`ta${lv}`]: `ta${lv}`, sheet: "sheet", none: null },
    defaultFill: `wind${lv}`,
    opacity: 0.75,
    options: { lineColor: "#111", lineWidth: 1.2, renderOrder: 20 + 10 * order },
    // sfc: the same step's surface bundle, for the below-ground mask.
    derive(f, sfc) {
      const n = f.gh.length, pa = lv * 100;
      const wind = new Float32Array(n), temp = new Float32Array(n), o = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        wind[k] = Math.hypot(f.u[k], f.v[k]) * KT;
        temp[k] = f.t[k] - 273.15;
        o[k] = sfc.psfc[k] >= pa ? 1 : 0;
      }
      // w: vertical motion, cm/s up (builds before it existed: none, see-through).
      // Derived at this level alone (derived3d.js): vorticity, divergence, theta-e, and theta's gradient and frontogenesis.
      const hz = horizontal(f.u, f.v, manifest.grid), th = new Float32Array(n), te = new Float32Array(n);
      for (let k = 0; k < n; k++) { th[k] = f.t[k] * Math.pow(1000 / lv, 0.2857); te[k] = thetaE(f.t[k], f.r[k], lv); }
      const fr = frontal(th, f.u, f.v, manifest.grid);
      // The bulk Richardson number from the ground up to this level (derived3d.js): can the ground's air mix up this far?
      const rib = new Float32Array(n);
      for (let k = 0; k < n; k++) rib[k] = bulkRichardson(sfc.t2m[k], sfc.psfc[k], sfc.u10[k], sfc.v10[k], f.t[k], f.u[k], f.v[k], lv);
      return { h: f.gh, c: f.gh, o, u: f.u, v: f.v, w: f.w ?? null, fills: { [`wind${lv}`]: wind, [`t${lv}`]: temp, [`rh${lv}`]: f.r, [`moist${lv}`]: f.r, [`gh${lv}`]: f.gh, [`w${lv}`]: f.w ?? ZEROS(n), sheet: ZEROS(n),
        sec_vort: hz.vort, sec_div: hz.div, sec_thetae: te, sec_grad: fr.grad, sec_fgen: fr.fgen, sec_rib: rib } };
    },
  };
}

const loader = new BundleLoader(DATA, manifest);
const defs = [surfaceDef(), ...[...manifest.levels].sort((a, b) => b - a).map((lv, i) => levelDef(lv, i))];
const layers = {};
// Wind particles: a colour per level (so several levels can animate at once
// and stay distinguishable -- darker, saturated tones for this light
// basemap) and more of them low down, where the detail is. Style (width,
// density, speed, opacity) is global: one set of controls for all levels.
const PARTICLE_COLORS_DARK = {
  sfc: "#1d5fa8", p1000: "#0f7c80", p925: "#1b8a3f", p850: "#5f7f00",
  p700: "#b06000", p500: "#c0182f", p300: "#9b1f8f", p250: "#5b2fb0",
};
// Light tones for a dark background (the satellite image): the dark set
// vanished on it (user report, 2026-09-28).
const PARTICLE_COLORS_LIGHT = {
  sfc: "#fde047", p1000: "#67e8f9", p925: "#86efac", p850: "#d9f99d",
  p700: "#fdba74", p500: "#fca5a5", p300: "#f0abfc", p250: "#c4b5fd",
};
let particlePalette = "auto";     // auto | dark | light (Style tab)
// Per-level line colour and width chosen in the Style tab (user request),
// remembered on this device. A level's colour is its identity everywhere:
// its contour lines, its swatch, its particles on the light map.
let levelStyle = {};
try { levelStyle = JSON.parse(localStorage.getItem("np3d.levelStyle") || "{}") || {}; } catch { levelStyle = {}; }
const levelColor = (k) => levelStyle[k]?.color ?? PARTICLE_COLORS_DARK[k] ?? "#111";
const levelWidth = (k, focus) => (levelStyle[k]?.width ?? 1.2) * (focus ? 1.4 : 1);
let PARTICLE_COLORS = PARTICLE_COLORS_DARK;
function applyParticleColors() {
  const light = particlePalette === "light" || (particlePalette === "auto" && !!satShown);
  const want = light ? PARTICLE_COLORS_LIGHT : Object.fromEntries(Object.keys(PARTICLE_COLORS_DARK).map((k) => [k, levelColor(k)]));
  // Barbs share the level's colour (its identity everywhere), with a halo of
  // the opposite brightness so they read on any background.
  for (const L of Object.values(layers)) for (const g of [L.barbs, L.flow]) g.setColors(want[L.def.key] ?? "#111", light ? "#0b0f14" : "#ffffff");
  p3.stops = null;           // 3-D particles' height colours follow the same palette
  if (JSON.stringify(want) === JSON.stringify(PARTICLE_COLORS)) return;
  PARTICLE_COLORS = want;
  for (const L of Object.values(layers)) if (L.particles) L.particles.color.set(particleColor(L));
  updateParticleKey();
  dirty = true;
}
const PARTICLE_WEIGHT = { sfc: 1.6, p1000: 1.4, p925: 1.4, p850: 1.2, p700: 1.0, p500: 0.8, p300: 0.8, p250: 0.8 };
const PARTICLE_BASE = 3500, PARTICLE_MAX = 10000;
let particleDensity = 1;
// Coastlines traced on every visible layer (coast.json from the export).
// The past-year archive's index (export_archive.py); none -> no Past year mode.
// "no-cache": revalidated every load (a few kB), since the archive step can
// add days (event windows) without a new manifest, and a stale cached index
// hid them (2026-09-29).
const ARCH = await fetch(`${DATA}/archive/index.json${buildVersion(manifest)}`, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const coastLines = manifest.coast ? await fetch(`${DATA}/${manifest.coast}${buildVersion(manifest)}`).then((r) => r.json()).catch(() => null) : null;
let coastOn = true;
for (const def of defs) {
  const gl = new GridLayer(manifest.grid, geo, def.options);
  const lift = def.options.lift ?? 0;
  // Draw order runs strictly bottom to top -- each layer's fill, then its
  // coast, particles and barbs, then the next level up. The translucent
  // fills don't write depth, so order is what keeps a lower layer's glyphs
  // from showing on top of a higher fill (the camera never goes below).
  const barbs = new BarbLayer(manifest.grid, geo, { lift: lift + 8, renderOrder: gl.mesh.renderOrder + 3, color: levelColor(def.key) });
  const flow = new FlowLayer(manifest.grid, geo, { lift: lift + 7, renderOrder: gl.mesh.renderOrder + 3, color: levelColor(def.key), width: 1.4 });
  // (No coastlines floating on each level: stacked copies read as clutter.
  // The top visible level gets the map printed on it instead -- see
  // updateMapImprint.)
  const coast = null;
  gl.uniforms.mapTex.value = ground.texture;
  scene.add(gl.mesh, barbs.object, flow.object);
  layers[def.key] = {
    def, gl, particles: null, barbs, flow, coast, fill: def.defaultFill, derived: new Map(), visible: false,
    glyphsOnly: false, particlesOn: def.key === "sfc", barbsOn: false, flowOn: false, current: null,
  };
  gl.uniforms.cInterval.value = def.interval;
  gl.uniforms.fillOpacity.value = def.opacity;
  gl.setFill(def.fills[def.defaultFill], SCALES[def.fills[def.defaultFill]]);
  gl.visible = false;
}

function leadsFor(m) {
  return manifest.steps_h.filter((h) => loader.has(m, h, "sfc"));
}
let leads = leadsFor(model);

// ---- satellite ----------------------------------------------------------------------
// Observed infrared over the 24 h up to the build, draped on the ground (see
// satellite.js). The frame shown is the newest at or before the time on
// screen; after the last frame the image fades out over 3 h (beyond it
// there are no observations, only models).
const sat = manifest.satellite?.frames?.length ? new SatelliteFrames(DATA, manifest.satellite, manifest.anchor, buildVersion(manifest)) : null;
const SAT_END_H = sat ? sat.hours[sat.hours.length - 1] : -Infinity;
let satOn = !!sat, satEnhance = false;
// The IR image covers the basemap's coastlines, so the ground gets its own
// (light, to read on the dark image) whenever the image shows.
const groundCoast = coastLines ? new CoastOverlay(coastLines, manifest.grid, geo, { lift: 1, color: "#e3b84f", opacity: 0.9, renderOrder: 5 }) : null;
if (groundCoast) {
  groundCoast.setSlot("A", "ground", null);
  groundCoast.setSlot("B", "ground", null);
  groundCoast.object.visible = false;
  scene.add(groundCoast.object);
}
// Coastlines on the top level showing, at its height (the map placed on the
// top level): the fill imprint alone shows nothing when that level has only
// lines or particles, which is how the page opens.
let mapAt = "top";
const topCoast = coastLines ? new CoastOverlay(coastLines, manifest.grid, geo, { lift: 5, color: "#e5e7eb", opacity: 0.7 }) : null;
if (topCoast) { topCoast.object.visible = false; scene.add(topCoast.object); }
// The region's outline (updateOutline, with the region's handles).
const roiOutline = new Strokes3D(geo, { width: 1.6, renderOrder: 900 });
scene.add(roiOutline.object);
// ---- lat/lon lines ----------------------------------------------------------------------
// On the top visible layer's surface (graticule.js), updated in applyTime.
const graticule = new Graticule(manifest.grid, geo, PARTICLE_STYLE.resolution);
scene.add(graticule.object);
// The slice's curtain (section3d.js); filled in by updateSection().
const curtain = new SectionCurtain(geo);
scene.add(curtain.object);
// The pressure levels drawn on it, as on the flat chart (section3d.js).
const levelLines = new SectionLevelLines(geo);
scene.add(levelLines.object);
// The volume's stacked sheets (volume3d.js); filled in by updateVolume().
const VOL_NZ = 48, VOL_TOP_M = 12500;
const volume = new VolumeLayer(manifest.grid, geo, { nz: VOL_NZ, zTopM: VOL_TOP_M });
scene.add(volume.object);
const opcLayer = OPC ? new OpcChartLayer(OPC.box, geo) : null;
if (opcLayer) scene.add(opcLayer.object);
let gridOn = true;
$("gridToggle").addEventListener("change", (e) => { gridOn = e.target.checked; graticule.object.visible = gridOn; dirty = true; });
// Height ruler and place names (orientation.js, places.js); placed in placeOverlays().
const ruler = new HeightRuler(geo);
scene.add(ruler.object);
let rulerOn = true, namesOn = true;
$("rulerToggle").addEventListener("change", (e) => { rulerOn = e.target.checked; dirty = true; });
$("hlToggle").addEventListener("change", (e) => { hlOn = e.target.checked; dirty = true; });
$("namesToggle").addEventListener("change", (e) => { namesOn = e.target.checked; dirty = true; });

// ---- OPC chart area ------------------------------------------------------------------
// OPC's North Pacific chart box (manifest.opc_box, pinned from real charts),
// traced on the ground along its parallels and meridians -- densified so it
// bends correctly on the globe. Drawn over the level fills so the chart
// area stays visible from any view.
function opcBoxLine(b) {
  // Longitudes unwrapped eastward (135 -> 245); the projection wraps them.
  const w = ((b.lon_min % 360) + 360) % 360, e = w + ((((b.lon_max - b.lon_min) % 360) + 360) % 360);
  const pts = [];
  for (let lon = w; lon < e; lon += 1) pts.push([lon, b.lat_min]);
  for (let lat = b.lat_min; lat < b.lat_max; lat += 1) pts.push([e, lat]);
  for (let lon = e; lon > w; lon -= 1) pts.push([lon, b.lat_max]);
  for (let lat = b.lat_max; lat > b.lat_min; lat -= 1) pts.push([w, lat]);
  pts.push(pts[0]);
  return pts;
}
const opcOutline = manifest.opc_box
  ? new CoastOverlay([opcBoxLine(manifest.opc_box)], manifest.grid, geo, { lift: 2, color: "#c2410c", opacity: 0.95, renderOrder: 900 })
  : null;
if (opcOutline) {
  opcOutline.setSlot("A", "ground", null);
  opcOutline.setSlot("B", "ground", null);
  opcOutline.material.depthTest = false;
  scene.add(opcOutline.object);
  $("opcToggle").addEventListener("change", (e) => { opcOutline.object.visible = e.target.checked && !opcShown; dirty = true; });
} else $("opcToggle").closest("label").hidden = true;

// (loadAll is started below, once the timeline knows where the page opens.)

function updateSatellite() {
  const u = ground.uniforms;
  const hit = sat && satOn ? sat.textureAt(Math.min(timeline.pos, SAT_END_H)) : null;
  if (hit) u.satMap.value = hit.tex;
  u.satMix.value = hit ? (timeline.pos <= SAT_END_H ? 1 : Math.max(0, 1 - (timeline.pos - SAT_END_H) / 3)) : 0;
  u.satEnhance.value = satEnhance ? 1 : 0;
  if (groundCoast) groundCoast.object.visible = coastOn && u.satMix.value > 0.05;
  const wasShown = !!satShown, wasFrame = satShown?.frame;
  satShown = u.satMix.value > 0 ? hit : null;
  if (wasShown !== !!satShown && typeof updateLegend === "function") updateLegend();
  if (wasFrame !== satShown?.frame) updateHud();      // the HUD names the frame on screen
  if (wasShown !== !!satShown) applyParticleColors();
  dirty = true;
}
let satShown = null;

const timeline = new Timeline(leads, sat ? sat.hours : []);
// Open at now (clamped to the timeline, with a note if it had to be).
const opened = openAt(NOW_H, timeline.start, timeline.end);
timeline.pos = opened.pos;
let openNote = opened.note;     // shown until the time is first moved
if (sat) sat.loadAll(() => { if (timeline.pos <= SAT_END_H + 3) updateSatellite(); dirty = true; }, timeline.pos);

// Bundles a visible layer needs for one step (levels also need the surface
// bundle for their below-ground mask).
function bundlesFor(L, m = model) {
  if (L.def.bundle !== "sfc") return [L.def.bundle, "sfc"];
  return wantsWaves(L) && hasWaves(m) ? ["sfc", "wave"] : ["sfc"];
}

// ---- waves (export_atmos3d "wave" bundle: hs m, tp s, dir deg-from) ----------------
// Each model's own wave model, same run: GFS-Wave (WAVEWATCH III) with GFS,
// ECWAM with ECMWF -- the model switch switches the sea state too.
const WAVE_MODEL = { gfs: "GFS-Wave (WAVEWATCH III)", ecmwf: "ECMWF wave model (ECWAM)" };
const hasWaves = (m) => Object.values(manifest.files?.[m] ?? {}).some((f) => f.wave);
const wantsWaves = (L) => L.def.key === "sfc" && hasWaves(model) && (L.fill === "hs" || L.fill === "tp" || (L.particlesOn && show.surfaceParticles === "waves"));
// The wave fields of step d (the surface's derived step), made once: the
// height fill (land -> SEA_MISSING, see-through) and the flow the particles
// follow -- the direction waves TRAVEL (dir is where they come from) at the
// deep-water group speed c_g = g T / (4 pi) ~ 0.78 T m/s, the speed wave
// energy (swell) actually crosses the ocean.
function wavesOf(d) {
  if (d.waves) return d.waves;
  const w = loader.ready(model, d.lead, "wave");
  if (!w) return null;
  const n = w.hs.length, hs = new Float32Array(n), tp = new Float32Array(n), u = new Float32Array(n), v = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const ok = Number.isFinite(w.hs[k]) && Number.isFinite(w.tp[k]) && Number.isFinite(w.dir[k]);
    hs[k] = Number.isFinite(w.hs[k]) ? w.hs[k] : SEA_MISSING;
    tp[k] = Number.isFinite(w.tp[k]) ? w.tp[k] : SEA_MISSING;
    if (!ok) { u[k] = v[k] = NaN; continue; }
    const cg = (9.81 * w.tp[k]) / (4 * Math.PI), to = ((w.dir[k] + 180) * Math.PI) / 180;
    u[k] = cg * Math.sin(to); v[k] = cg * Math.cos(to);
  }
  d.waves = { hs, tp, u, v, raw: w };
  return d.waves;
}
// What a layer's particles follow: its wind, or (surface, when chosen) wave energy.
function flowOf(L, d) {
  if (L.def.key === "sfc" && show.surfaceParticles === "waves") { const w = wavesOf(d); if (w) return { u: w.u, v: w.v }; }
  return { u: d.u, v: d.v };
}

// ---- anomalies (anomaly.js, export_climatology) ------------------------------------
// Fills computed on demand from a step's own fields and the 1991-2020
// climatology: heights and temperatures on levels, sea-level pressure and
// sea temperature at the surface; plus observed OISST (one real day, the
// same at every time on the slider -- the HUD says which day).
const CLIM = manifest.clim ?? null;
const ANOM_FILLS = new Set(["mslpa", "ssta", "sstoa", "ssto", ...manifest.levels.flatMap((lv) => [`gha${lv}`, `ta${lv}`])]);
const REAN_FILLS = (key) => key === "mslpa" || /^(gha|ta)\d+$/.test(key);
function climNeeds(L, lead) {
  const key = L.def.fills[L.fill];
  if (!CLIM || !ANOM_FILLS.has(key)) return [];
  if (key === "ssto" || key === "sstoa") return CLIM.oisst ? [["clim", 0, "oisst"]] : [];
  if (key === "ssta") return [["clim", validDate(manifest.anchor, lead), "sst"]];
  const { s0, s1 } = climSlots(lead);
  return s0 === s1 ? [["clim", s0, "rean"]] : [["clim", s0, "rean"], ["clim", s1, "rean"]];
}
const climFine = new Map();      // "slot:name" -> Float32Array on the export grid
function reanClim(slot, name) {
  const key = `${slot}:${name}`;
  if (climFine.has(key)) return climFine.get(key);
  const f = loader.ready("clim", slot, "rean");
  if (!f?.[name]) return null;
  const out = upsample(f[name], CLIM.rean_grid, manifest.grid);
  climFine.set(key, out);
  return out;
}
// A fill's values for step d: the derived ones, or an anomaly made now (and
// kept on d) once its climatology is loaded; null until then.
function fillOf(L, d, fillName) {
  const key = L.def.fills[fillName];
  if (d.fills[key]) return d.fills[key];
  if (key === "hs") return wavesOf(d)?.hs ?? null;
  if (key === "tp") return wavesOf(d)?.tp ?? null;
  if (!CLIM || !ANOM_FILLS.has(key)) return null;
  let out = null;
  if (key === "ssto" || key === "sstoa") {
    const o = loader.ready("clim", 0, "oisst");
    if (!o) return null;
    out = new Float32Array(o.sst.length);
    for (let k = 0; k < out.length; k++) {
      const v = key === "ssto" ? o.sst[k] - 273.15 : Math.max(-4, o.anom[k]);
      out[k] = Number.isFinite(v) ? v : SEA_MISSING;
    }
  } else if (key === "ssta") {
    const c = loader.ready("clim", validDate(manifest.anchor, d.lead), "sst");
    if (!c || !d.raw.sst) return null;
    out = anomaly(d.raw.sst, c.sst, null, 0, { missing: SEA_MISSING });
    for (let k = 0; k < out.length; k++) if (out[k] > SEA_MISSING + 1) out[k] = Math.max(-4, out[k]);
  } else if (REAN_FILLS(key)) {
    const { s0, s1, w } = climSlots(d.lead);
    const name = key === "mslpa" ? "mslp" : key.startsWith("gha") ? `gh${key.slice(3)}` : `t${key.slice(2)}`;
    const a = reanClim(s0, name), b = w ? reanClim(s1, name) : a;
    if (!a || !b) return null;
    const field = key === "mslpa" ? d.raw.mslp : key.startsWith("gha") ? d.raw.gh : d.raw.t;
    out = anomaly(field, a, b, w, { scale: key === "mslpa" ? 0.01 : 1 });
  }
  if (out) d.fills[key] = out;
  return out;
}

function derivedFor(L, lead, m = model) {
  const key = `${m}:${lead}`;
  if (L.derived.has(key)) return L.derived.get(key);
  const fields = loader.ready(m, lead, L.def.bundle);
  const sfc = loader.ready(m, lead, "sfc");
  if (!fields || !sfc) return null;
  const d = L.def.derive(fields, sfc);
  d.lead = lead; d.raw = fields;          // for anomalies (fillOf)
  L.derived.set(key, d);
  return d;
}

// Heights the sheet (and whatever rides on it) is DRAWN at: the real heights,
// or for the focus level with relief != 1 the stretched ones (relief.js).
// Readouts, H/L values, contours and the probe always use d.h / d.c.
function meanOf(d) { if (d._mean === undefined) d._mean = d.h ? levelMean(d.h, d.o) : 0; return d._mean; }
function hOf(L, d) {
  if (!d?.h) return null;
  if (L.def.key !== show.focus || relief === 1) return d.h;
  if (d._relief !== relief) { d._hd = reliefHeights(d.h, meanOf(d), relief); d._relief = relief; }
  return d._hd;
}

// Run fn once when a bundle arrives -- at most ONE pending callback per bundle
// and purpose. Re-attaching on every re-run made the callbacks multiply
// (each arrival re-ran the caller, which re-attached to every file still
// pending): turning the slice on froze the page (2026-09-28).
const waiting = new Set();
function whenLoaded(m, lead, bundle, purpose, fn) {
  if (!loader.has(m, lead, bundle) || loader.ready(m, lead, bundle)) return;
  const key = `${purpose}|${m}|${lead}|${bundle}`;
  if (waiting.has(key)) return;
  waiting.add(key);
  loader.load(m, lead, bundle).then(() => { waiting.delete(key); fn(); }, (e) => { waiting.delete(key); console.warn("[atmos3d]", e); });
}

function isStepReady(i) {
  const lead = leads[i];
  return Object.values(layers).every((L) => !L.visible || (bundlesFor(L).every((b) => loader.ready(model, lead, b))
    && (!diffOn(L) || !loader.has(OTHER_MODEL[model], lead, L.def.bundle) || bundlesFor(L, OTHER_MODEL[model]).every((b) => loader.ready(OTHER_MODEL[model], lead, b)))
    && climNeeds(L, lead).every(([m, l, b]) => loader.ready(m, l, b))));
}

function slotValues(L, d) {
  return { h: hOf(L, d), c: d.c, o: d.o, f: L.fill && L.def.fills[L.fill] ? (diffOn(L) ? diffOf(L, d) : fillOf(L, d, L.fill)) : null };
}

// ---- GFS − ECMWF (user request, 2026-09-29) --------------------------------------------
// The focus level's fill as one model's field minus the other's at the same
// valid time, always GFS minus ECMWF whichever model is on screen (its lines,
// wind and labels stay the model's own). Each model's step comes from its
// own run, which may start at a different time; the HUD says which.
const BOTH_MODELS = !!(manifest.inits?.gfs && manifest.inits?.ecmwf);
const OTHER_MODEL = { gfs: "ecmwf", ecmwf: "gfs" };
// Symmetric colour range per quantity: a colour means the same difference at every step.
function diffRange(key) {
  if (/^gh\d/.test(key)) return 60;
  if (/^t\d/.test(key) || key === "t2m" || key === "sst") return 4;
  if (/^wind/.test(key)) return 20;
  if (/^rh\d/.test(key)) return 40;
  if (/^w\d/.test(key)) return HAS_W ? 10 : null;
  if (key === "pwat") return HAS_PWAT ? 10 : null;
  if (key === "hs") return hasWaves("gfs") && hasWaves("ecmwf") ? 2 : null;
  if (key === "tp") return hasWaves("gfs") && hasWaves("ecmwf") ? 4 : null;
  if (key === "arch_mslp") return 8;
  return null;           // anomalies (the difference is the same as the fields'), derived, observed, masks: not offered
}
const diffable = (L) => BOTH_MODELS && L.def.key === show.focus && diffRange(L.def.fills[L.fill]) != null;
const diffOn = (L) => show.diff && diffable(L);
function diffOf(L, d) {
  const key = L.def.fills[L.fill], id = `diff:${key}`;
  if (d.fills[id]) return d.fills[id];
  const other = OTHER_MODEL[model], e = derivedFor(L, d.lead, other);
  if (!e) {
    for (const b of bundlesFor(L, other)) whenLoaded(other, d.lead, b, "diff", () => applyTime(true));
    return null;
  }
  const a = fillOf(L, d, L.fill), b = fillOf(L, e, L.fill);
  if (!a || !b) return null;
  const r = diffRange(key), out = new Float32Array(a.length), sign = model === "gfs" ? 1 : -1;
  for (let k = 0; k < out.length; k++) {
    const ok = a[k] > SEA_MISSING + 1 && b[k] > SEA_MISSING + 1 && Number.isFinite(a[k]) && Number.isFinite(b[k]);
    out[k] = ok ? Math.max(-r, Math.min(r, sign * (a[k] - b[k]))) : SEA_MISSING;
  }
  d.fills[id] = out;
  return out;
}

// Push the two real steps around the current time into every visible layer.
function applyTime(force = false) {
  const { i0, i1, t } = timeline.segment();
  const observed = timeline.beforeModel || timeline.afterModel;   // no data from this model at this time
  for (const L of Object.values(layers)) {
    L.gl.visible = L.visible && !observed && !L.glyphsOnly;     // glyphsOnly: the surface particles alone, no sheet
    if (observed) L.current = null;
    if (!L.visible || observed) continue;
    const a = derivedFor(L, leads[i0]);
    const bReal = derivedFor(L, leads[i1]);
    const b = bReal ?? a;
    if (!a) { L.gl.visible = false; L.current = null; continue; }
    const rk = L.def.key === show.focus && relief !== 1 ? `:r${relief}` : "";
    const keyA = `${model}:${leads[i0]}${rk}`, keyB = `${model}:${leads[i1]}${rk}`;
    L.gl.uniforms.hMean.value = a.h ? meanOf(a) : 0;
    L.gl.uniforms.shade.value = shadeOn;
    if (force || L.gl.slotLead.A !== keyA) L.gl.setSlot("A", keyA, slotValues(L, a));
    if (force || L.gl.slotLead.B !== keyB) L.gl.setSlot("B", keyB, slotValues(L, b));
    const tt = bReal ? t : 0;
    L.gl.uniforms.t.value = tt;
    L.current = { a, b, t: tt };
    if (L.coast) {
      L.coast.setSlot("A", keyA, a.h);
      L.coast.setSlot("B", keyB, b.h);
      L.coast.uniforms.t.value = tt;
    }
    if (L.barbsOn) {
      // Barbs show the nearer real step, never a blend.
      const nearer = tt < 0.5 ? [keyA, a] : [keyB, b];
      if (force) L.barbs.key = null;
      L.barbs.build(nearer[0], nearer[1].u, nearer[1].v, hOf(L, nearer[1]), nearer[1].o);
    }
    if (L.flowOn) {
      // Flow lines too: one real step (tracing them takes ~10-40 ms, done
      // only when the nearer step or the zoom bucket changes).
      const nearer = tt < 0.5 ? [keyA, a] : [keyB, b];
      if (force) L.flow.key = null;
      L.flow.build(nearer[0], nearer[1].u, nearer[1].v, hOf(L, nearer[1]), nearer[1].o);
    }
  }
  updateWindVisibility();
  updateMapImprint();
  updateGraticule();
  updateSatellite();
  updateHud();
  updateQuestionNote();
  updateProbe();
  updateSection();
  updateVolume();
  updateOpc();
  if (hover) updateReadout();
  dirty = true;
}

// The basemap printed on the TOP visible level with a fill (the one you look
// at from above; lower ones are seen through it), so land and coastlines stay
// in view without a coastline floating on every level.
function updateMapImprint() {
  const onTop = coastOn && mapAt === "top";
  const drawn = Object.values(layers).filter((L) => L.gl.visible && L.def.fills[L.fill]);
  const top = drawn.sort((a, b) => b.gl.mesh.renderOrder - a.gl.mesh.renderOrder)[0];
  for (const L of Object.values(layers)) L.gl.uniforms.mapMix.value = onTop && L === top ? 0.6 : 0;
  // and the coastline traced on the top level showing (any, fill or not), over its fill
  if (!topCoast) return;
  const lead = topShowing();
  topCoast.object.visible = onTop && !!lead;
  if (!lead) return;
  topCoast.setSlot("A", `${lead.def.key}:${lead.gl.slotLead.A}`, hOf(lead, lead.current.a));
  topCoast.setSlot("B", `${lead.def.key}:${lead.gl.slotLead.B}`, hOf(lead, lead.current.b));
  topCoast.uniforms.t.value = lead.current.t;
  topCoast.uniforms.lift.value = (lead.def.options.lift ?? 0) + 5;
  topCoast.object.renderOrder = lead.gl.mesh.renderOrder + 1;
}
// The highest level showing (a sheet, or only its particles), or null.
function topShowing() {
  return Object.values(layers).filter((L) => L.visible && L.current)
    .sort((a, b) => b.gl.mesh.renderOrder - a.gl.mesh.renderOrder)[0] ?? null;
}

// Lat/lon lines follow the top visible layer (the highest drawn), blended
// between the same two real steps; with no layer on, they lie on the ground.
function updateGraticule() {
  const top = mapAt === "top" ? topShowing() : null;
  if (!top) {
    graticule.setSlot("A", "ground", null); graticule.setSlot("B", "ground", null);
    graticule.uniforms.t.value = 0; graticule.uniforms.lift.value = 1;
    return;
  }
  graticule.setSlot("A", `${top.def.key}:${top.gl.slotLead.A}`, hOf(top, top.current.a));
  graticule.setSlot("B", `${top.def.key}:${top.gl.slotLead.B}`, hOf(top, top.current.b));
  graticule.uniforms.t.value = top.current.t;
  graticule.uniforms.lift.value = (top.def.options.lift ?? 0) + 4;
}

// Particle systems are made the first time a layer's particles are switched
// on (each holds ~6 MB of buffers).
function particlesFor(L) {
  if (!L.particles) {
    L.particles = new ParticleSystem(manifest.grid, geo, {
      count: PARTICLE_MAX, lift: (L.def.options.lift ?? 0) + 6,
      color: particleColor(L), renderOrder: L.gl.mesh.renderOrder + 2,
    });
    L.particles.material.uniforms.vex.value = L.gl.uniforms.vex.value;
    scene.add(L.particles.object);
  }
  return L.particles;
}

function updateWindVisibility() {
  for (const L of Object.values(layers)) {
    const on = L.visible && L.particlesOn && !!L.current;
    if (on) particlesFor(L).setCount(PARTICLE_BASE * particleDensity * (PARTICLE_WEIGHT[L.def.key] ?? 1));
    if (L.particles) L.particles.object.visible = on;
    L.barbs.object.visible = L.visible && L.barbsOn && !!L.current;
    L.flow.object.visible = L.visible && L.flowOn && !!L.current;
    if (L.coast) L.coast.object.visible = L.visible && coastOn && !!L.current;
  }
  updateParticleKey();
}

// Surface particles showing wave energy get their own colour (teal), so they
// can't be mistaken for the 10 m wind's blue (user request, 2026-09-28).
const WAVE_PARTICLE = { dark: "#0f766e", light: "#5eead4" };
function particleColor(L) {
  if (L.def.key === "sfc" && show.surfaceParticles === "waves" && hasWaves(model)) {
    const light = particlePalette === "light" || (particlePalette === "auto" && !!satShown);
    return light ? WAVE_PARTICLE.light : WAVE_PARTICLE.dark;
  }
  return PARTICLE_COLORS[L.def.key] ?? "#0d2233";
}
function updateParticleKey() {
  const key = $("particleKey");
  if (!key) return;
  const on = Object.values(layers).filter((L) => L.visible && L.particlesOn);
  const name = (L) => (L.def.key !== "sfc" ? L.def.title : show.surfaceParticles === "waves" && hasWaves(model) ? "wave energy" : "10 m wind");
  key.innerHTML = on.map((L) => `<span class="pkey"><i style="background:${particleColor(L)}"></i>${name(L)}</span>`).join("");
}

// Load the neighbours of the current time first, then everything else in order.
function requestAround() {
  const { i0, i1 } = timeline.segment();
  const m = model;
  for (const i of [i0, i1, ...leads.keys()]) {
    for (const L of Object.values(layers)) {
      if (!L.visible) continue;
      const lead = leads[i];
      const onLoad = () => {
        if (m !== model) return;
        const s = timeline.segment();
        if (leads[s.i0] === lead || leads[s.i1] === lead) applyTime(true);
        updateLoadStatus();
      };
      for (const b of bundlesFor(L)) whenLoaded(m, lead, b, "around", onLoad);
      for (const [cm, cl, cb] of climNeeds(L, lead)) whenLoaded(cm, cl, cb, `around:${lead}`, onLoad);
    }
  }
}

// ---- HUD ----------------------------------------------------------------------
// Every label names the real run behind the step on screen (stepSource), and
// the time as a distance from now.
const srcOf = (lead) => stepSource(manifest, model, lead, MODEL_LABEL[model] ?? model);
const sourceText = (lead) => srcOf(lead).text;

// The time on screen in UTC and in the viewer's own zone (user request).
function setHudTime(ms, utcText = fmtUtc(ms)) {
  const local = fmtLocal(ms);
  $("hudValid").innerHTML = local ? `${utcText}<span class="local"> · ${local} <span class="muted">(your time)</span></span>` : utcText;
}
function updateHud() {
  if (arch.on) { archHud(); return; }
  if (sim.on) { simHud(); return; }
  const h = timeline.pos, name = MODEL_LABEL[model] ?? model, init = manifest.inits?.[model];
  const initH = init ? hoursFrom(manifest.anchor, init) : null;
  const badge = $("hudInterp");
  const shown = satShown?.frame;
  setHudTime(Date.parse(manifest.anchor) + h * 3600e3);
  $("hudLead").textContent = relNow(h, NOW_H);
  const notes = [];
  if (openNote) notes.push(openNote);
  if (timeline.beforeModel) {
    $("hudRun").textContent = `${name}: no model data this early (it starts ${fmtUtc(Date.parse(manifest.anchor) + leads[0] * 3600e3)})`;
  } else if (timeline.afterModel) {
    $("hudRun").textContent = `${name}: past the end of its ${runTag(init)} run's 7 days`;
  } else {
    const { i0, i1, t } = timeline.segment();
    const near = srcOf(leads[t < 0.5 ? i0 : i1]);
    $("hudRun").textContent = near.earlier ? `${near.text} · earlier run (past time)` : near.text;
    if (timeline.isInterpolated()) notes.push(`interpolated between ${sourceText(leads[i0])} and ${sourceText(leads[i1])}`);
    if (initH != null && h > initH + 1e-6 && h <= NOW_H + 1e-6) notes.push(`short forecast: ${name}'s newest run in this build is ${runTag(init)}`);
  }
  if (shown) notes.push(`observed satellite infrared ${shown.time.slice(11, 16)} UTC ${shown.time.slice(8, 10)}th`);
  if (opcProduct) notes.push(opcShown
    ? `${OPC_LABEL[opcShown.product]} valid ${opcShown.valid.slice(11, 13)}Z ${opcShown.valid.slice(8, 10)}th (${chartKind(opcShown)}) on the map; the model's lines in magenta`
    : `no ${OPC_LABEL[opcProduct]} at this time — ◀ ▶ by the timeline jump to one`);
  if (p3.on) {
    const lo = Math.max(0, Math.min(12, p3.zKm)), hi = Math.min(12.5, lo + p3.thickKm);
    notes.push(`3-D particles ${fmtHeight(lo * 1000, hUnit)}–${fmtHeight(hi * 1000, hUnit)} (≈${stdPressureMb(lo * 1000)}–${stdPressureMb(hi * 1000)} mb): each drifts with the horizontal wind at its own height, filled between the model's levels${p3.vertical && HAS_W ? `, and climbs or sinks with the model's vertical motion${p3.vertical > 1 ? `, the climb exaggerated ×${p3.vertical}` : " at its true speed"}` : " (level flight: no vertical motion)"}`);
  }
  if (ROI.roiMode.value > 0 && roi.dim < 1) notes.push(`other layers faded to ${Math.round(roi.dim * 100)} % outside the ${roi.shape === "box" ? "box" : roi.shape === "wall" ? "wall" : "layer"} (3-D tab: Other layers, or Turn off all 3-D)`);
  if (vol.on && volume.object.visible) notes.push(`volume: ${volumeLabel()}${roi.shape !== "whole" ? `, inside the ${roi.shape}` : ""} — ${((volShare ?? 0) * 100).toFixed(1)} % of all the air up to 12.5 km over the map; between levels interpolated`);
  if (fl3.on && fl3.obj?.object.visible) notes.push(`3-D flow lines: ${fl3.lines} paths of ${fl3.hours} h of wind through the region at the nearer real step (a snapshot)${fl3.vertical && HAS_W ? `, climbing and sinking with the vertical motion${fl3.vertical > 1 ? " ×" + fl3.vertical : ""}` : ", level"}; faint at the start, bright where they end`);
  if (hp.on && hp.layer?.visible) notes.push(`plane at ${fmtHeight(hp.zKm * 1000, hUnit)} (≈${stdPressureMb(hp.zKm * 1000)} mb): ${HP_LABEL[hp.qty]}, filled between the model's levels at that height`);
  if (sec.on && secPath) notes.push(`slice ${sec.mode === "ns" ? `along ${fmtLon(sec.pos)}` : `along ${fmtLat(sec.pos)}`}${sec.turn ? `, turned ${sec.turn}°` : ""}${sec.thick ? `, ${sec.thick} km slab averaged` : ""}: interpolated between grid points and levels`);
  const fk = layers[show.focus]?.def.fills[layers[show.focus].fill];
  const sfcL = layers.sfc;
  if (sfcL?.visible && (fk === "hs" || fk === "tp" || (sfcL.particlesOn && show.surfaceParticles === "waves"))) notes.push(`waves: ${WAVE_MODEL[model]}, same run${show.surfaceParticles === "waves" && sfcL.particlesOn ? "; particles move with wave energy at deep-water group speed (g·T/4π)" : ""}`);
  if (fk === "hpbl") notes.push(model === "gfs" ? "boundary-layer depth: GFS's own diagnosis of how deep the air near the ground is being mixed (its HPBL)" : `boundary-layer depth: ${MODEL_LABEL[model] ?? model}'s open data doesn't include it, so nothing is coloured; switch to GFS`);
  if (fk === "sec_rib") notes.push("bulk Richardson number from the ground to this level, from the 2 m temperature, 10 m wind and this level's temperature and wind (the depth between them from the pressures); below about 0.25 the ground's air can mix up this far");
  if (fk === "ssto" || fk === "sstoa") notes.push(`observed sea temperature: OISST daily mean for ${CLIM.oisst.date} — one real day, the same at every time on the slider`);
  else if (fk && SCALES[fk]?.anomaly) {
    const odd = !timeline.beforeModel && !timeline.afterModel && climSlots(leads[timeline.segment().t < 0.5 ? timeline.segment().i0 : timeline.segment().i1]).w > 0;
    notes.push(`anomaly = this ${MODEL_LABEL[model] ?? model} step minus the 1991–2020 average for the date and hour (${fk === "ssta" ? "NOAA OISST climatology" : "NCEP/NCAR reanalysis"})${odd ? "; climatology interpolated between 6-hourly times here" : ""}`);
  }
  if (show.flow && layers[show.focus]?.flow.object.visible) notes.push(`flow lines: the ${show.focus === "sfc" ? "10 m" : layers[show.focus].def.title} wind at the nearer real step (not blended), lines parallel to the wind — direction, not speed`);
  if (roi.diff && diff3dOk(roi.qty) && (vol.on || hp.on || sec.on)) notes.push(`3-D tab: ${RQ_SHORT[roi.qty]} as GFS minus ECMWF (fill and plane), taken level by level at the same valid time and drawn on ${MODEL_LABEL[model] ?? model}'s level heights; particles and flow lines are ${MODEL_LABEL[model] ?? model}'s wind`);
  if (show.diff && layers[show.focus] && diffable(layers[show.focus])) {
    const sk = layers[show.focus].def.fills[layers[show.focus].fill];
    const { i0: j0, i1: j1, t: tj } = timeline.segment(), leadNow = leads[tj < 0.5 ? j0 : j1];
    if (!loader.has(OTHER_MODEL[model], leadNow, layers[show.focus].def.bundle)) notes.push(`GFS − ECMWF: no ${MODEL_LABEL[OTHER_MODEL[model]] ?? OTHER_MODEL[model]} step at this time (its run ends earlier), so no colour`);
    notes.push(`colour: GFS minus ECMWF, ${SCALES[sk].label}, same valid time (red: GFS higher, blue: ECMWF higher); each from its own run (newest: GFS ${runTag(manifest.inits.gfs)}, ECMWF ${runTag(manifest.inits.ecmwf)}), so part of any difference is their different start times; lines, wind and labels are ${MODEL_LABEL[model] ?? model}'s`);
  }
  if (relief !== 1 && show.focus !== "sfc") notes.push(`relief ×${relief} on ${layers[show.focus].def.title}: troughs and ridges stretched ${relief}× around its mean height — shape, not true height`);
  badge.hidden = !notes.length;
  badge.textContent = notes.join(" · ");
  badge.title = badge.textContent;      // full text on hover when the line is cut short (small screens)
  $("timeSlider").value = String(h);
}
function updateLoadStatus() {
  let total = 0, have = 0;
  for (const L of Object.values(layers)) {
    if (!L.visible) continue;
    for (const h of leads) {
      total++;
      if (bundlesFor(L).every((b) => loader.ready(model, h, b))) have++;
    }
  }
  $("loadStatus").textContent = have < total ? `loading ${have}/${total} layer-steps…` : `${(loader.bytes / 1e6).toFixed(1)} MB loaded`;
}

// ---- time controls ------------------------------------------------------------
const slider = $("timeSlider");
slider.min = String(timeline.start);
slider.max = String(timeline.end);
slider.addEventListener("input", () => { openNote = null; timeline.pos = Number(slider.value); requestAround(); applyTime(); });
slider.addEventListener("change", () => { timeline.snap(); applyTime(); });

function setPlaying(on) {
  timeline.playing = on;
  $("playBtn").textContent = on ? "❚❚ Pause" : "▶ Play";
  if (!on) { timeline.snap(); applyTime(); }
}
const stepBy = (d) => { openNote = null; setPlaying(false); timeline.step(d); requestAround(); applyTime(); };
$("playBtn").addEventListener("click", () => { openNote = null; setPlaying(!timeline.playing); });
$("nowBtn").addEventListener("click", () => {
  openNote = null; setPlaying(false);
  timeline.pos = timeline.clamp(NOW_H);
  requestAround(); applyTime();
});
$("prevBtn").addEventListener("click", () => stepBy(-1));
$("nextBtn").addEventListener("click", () => stepBy(1));
$("speedSel").addEventListener("change", (e) => { timeline.stepsPerSecond = Number(e.target.value); });
window.addEventListener("keydown", (e) => {
  if (e.target.closest?.("input, select")) return;
  if (arch.on) {
    if (e.code === "Space") { e.preventDefault(); archPlay(!arch.playing); }
    if (e.code === "ArrowRight") archStep(1);
    if (e.code === "ArrowLeft") archStep(-1);
    if (e.code === "KeyH") togglePanel();
    return;
  }
  if (e.code === "Space") { e.preventDefault(); setPlaying(!timeline.playing); }
  if (e.code === "ArrowRight") stepBy(1);
  if (e.code === "ArrowLeft") stepBy(-1);
  if (e.code === "KeyH") togglePanel();
  if (e.code === "KeyB") blinkFill();
  // C: flick the chart off and on -- often easier to compare than a half fade.
  if (e.code === "KeyC" && opcLayer && opcShown) { opcBlink = !opcBlink; opcLayer.mesh.visible = !opcBlink; dirty = true; }
  if (e.code === "KeyU") setHeightUnit(hUnit === "km" ? "ft" : "km");
  if (sec.on && e.code === "BracketLeft") stepSlice(-2);
  if (sec.on && e.code === "BracketRight") stepSlice(2);
  if (e.code === "KeyM") switchModel(manifest.models.find((m) => m !== model && manifest.inits?.[m]) ?? model);
});
// Blink: flip the focus fill off/on to compare it with the satellite (or the
// map) underneath. Not a settings change, so a question stays selected.
function blinkFill() {
  fillBlinkOff = !fillBlinkOff;
  $("blinkBtn").classList.toggle("on", fillBlinkOff);
  $("blinkBtn").textContent = fillBlinkOff ? "Show model fill (B)" : "Blink model fill (B)";
  applyLayers();
}
$("blinkBtn").addEventListener("click", blinkFill);
function togglePanel(on = $("panel").hidden) {
  $("panel").hidden = !on;
  $("showPanel").hidden = on;
  // The views stay reachable: in the panel, or beside "Controls" when it's hidden.
  const vb = $("viewbar");
  if (on) $("panel").insertBefore(vb, $("panel").querySelector(".tabs")); else $("showPanel").after(vb);
  vb.classList.toggle("floating", !on);
  dirty = true;
}
$("hidePanel").addEventListener("click", () => togglePanel(false));
$("showPanel").addEventListener("click", () => togglePanel(true));

// ---- model toggle -----------------------------------------------------------------
const modelBox = $("modelToggle");
modelBox.innerHTML = manifest.models.map((m) => {
  const i = manifest.inits?.[m];
  return `<label><input type="radio" name="model" value="${m}"${m === model ? " checked" : ""}${i ? "" : " disabled"}> ${MODEL_LABEL[m] ?? m} <span class="h">${i ? runTag(i) : "n/a"}</span></label>`;
}).join("");
modelBox.addEventListener("change", (e) => switchModel(e.target.value));
function switchModel(m) {
  if (!manifest.inits?.[m] || m === model) return;
  model = m;
  for (const r of modelBox.querySelectorAll("input")) r.checked = r.value === m;
  noteKey = null;
  leads = leadsFor(model);
  timeline.setTimes(leads);      // position is in hours, so it carries over
  slider.min = String(timeline.start);
  slider.max = String(timeline.end);
  drawMarkers();
  requestAround();
  applyTime(true);
  renderColumn();
  updateLoadStatus();
}

// ---- view controls ----------------------------------------------------------------
// Vertical exaggeration on a log slider, 1x .. 400x.
const vexSlider = $("vexSlider");
function setVex(v) {
  for (const L of Object.values(layers)) {
    L.gl.uniforms.vex.value = v;
    if (L.particles) L.particles.material.uniforms.vex.value = v;
    if (L.coast) L.coast.uniforms.vex.value = v;
    L.barbs.setVex(v);
    L.flow.setVex(v);
    levelLines.setVex(v);
    if (hp.layer) hp.layer.uniforms.vex.value = v;
    if (fl3.obj) fl3.obj.setVex(v);
  }
  if (pvol) pvol.material.uniforms.vex.value = v;
  graticule.uniforms.vex.value = v;
  if (topCoast) topCoast.uniforms.vex.value = v;
  roiOutline.setVex(v);
  curtain.uniforms.vex.value = v;
  volume.shared.vex.value = v;
  $("vexValue").textContent = `×${Math.round(v)}`;
  if (hover) updateReadout();
  dirty = true;
}
vexSlider.addEventListener("input", () => setVex(Math.pow(10, Number(vexSlider.value))));
setVex(Math.pow(10, Number(vexSlider.value)));

$("coastToggle").addEventListener("change", (e) => { coastOn = e.target.checked; updateMapImprint(); updateSatellite(); dirty = true; });
function setMapAt(v) {
  mapAt = v === "sfc" ? "sfc" : "top";
  $("mapAt").value = mapAt;
  updateMapImprint(); updateGraticule(); updateSatellite(); dirty = true;
}
$("mapAt").addEventListener("change", (e) => { setMapAt(e.target.value); custom(); });
for (const id of ["bgSel", "bgSel3d"]) $(id).addEventListener("change", (e) => {
  bgPref[bgCase()] = e.target.value;                       // this case (fill on / off) keeps the choice
  try { localStorage.setItem("np3d.bg", JSON.stringify(bgPref)); } catch { /* ignore */ }
  setBackground(e.target.value); custom();
});
setBackground(bgPref.plain);

// Satellite toggles (disabled when this build has no frames).
if (!sat) { $("satToggle").checked = false; for (const id of ["satToggle", "satEnhance", "satOpacity"]) $(id).disabled = true; }
// Colour-enhanced and opacity only mean something with the image on: they're
// greyed out while it's off, and ticking colour-enhanced turns the image on.
function syncSatControls() {
  for (const id of ["satEnhance", "satOpacity"]) { $(id).disabled = !sat || !satOn; $(id).closest("label").classList.toggle("off", !satOn); }
}
$("satToggle").addEventListener("change", (e) => { satOn = e.target.checked; custom(); syncSatControls(); updateSatellite(); updateHud(); updateLegend(); });
$("satOpacity").addEventListener("input", (e) => { ground.uniforms.satOpacity.value = Number(e.target.value); dirty = true; });
$("satEnhance").addEventListener("change", (e) => { satEnhance = e.target.checked; updateSatellite(); updateLegend(); });
$("satEnhance").closest("label").addEventListener("click", (e) => {
  // Handled here entirely: the browser's own label click would otherwise
  // toggle the box straight back off once it's enabled.
  if (sat && !satOn) { e.preventDefault(); satOn = true; $("satToggle").checked = true; satEnhance = true; $("satEnhance").checked = true; syncSatControls(); updateSatellite(); updateHud(); updateLegend(); }
});
$("pPalette").addEventListener("change", (e) => { particlePalette = e.target.value; PARTICLE_COLORS = null; applyParticleColors(); });
// Level lines table (Style tab): colour and width per level.
function renderLineStyles() {
  $("lineStyles").innerHTML = [...defs].reverse().map((d) => `<tr><td>${d.key === "sfc" ? "surface" : d.title}</td>
    <td><input type="color" data-k="${d.key}" value="${levelColor(d.key)}" title="Line (and particle) colour for ${d.key === "sfc" ? "the surface isobars" : d.title}"></td>
    <td><input type="range" data-w="${d.key}" min="0.6" max="4" step="0.2" value="${levelStyle[d.key]?.width ?? 1.2}" title="Line width (the focus level is drawn 1.4x this)"></td></tr>`).join("");
}
function saveLineStyles() { try { localStorage.setItem("np3d.levelStyle", JSON.stringify(levelStyle)); } catch { /* ignore */ } }
$("lineStyles").addEventListener("input", (e) => {
  const k = e.target.dataset.k ?? e.target.dataset.w;
  if (!k) return;
  levelStyle[k] = { ...levelStyle[k], ...(e.target.dataset.k ? { color: e.target.value } : { width: Number(e.target.value) }) };
  saveLineStyles();
  PARTICLE_COLORS = null; applyParticleColors();
  applyLayers();
});
$("lineStylesReset").addEventListener("click", () => { levelStyle = {}; saveLineStyles(); renderLineStyles(); PARTICLE_COLORS = null; applyParticleColors(); applyLayers(); });
renderLineStyles();

// Global barb style: spacing (grid points between barbs, 0.5 deg each) and size.
// Barbs keep a constant size on screen (sizePx) and, with spacing "auto",
// about 50 px between them at any zoom: fixed 3-degree spacing and km-sized
// glyphs piled into a smear when zoomed out (user report, 2026-09-28).
// Rebuilt only when the zoom changes the bucketed spacing or size.
const BARB_STYLE = { auto: true, every: 6, sizePx: 34, gapPx: 56 };
let barbScaleKey = "";
function barbScale() {
  const dist = camera.position.distanceTo(controls.target);
  const kmPerPx = (2 * dist * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, root.clientHeight);
  const every = BARB_STYLE.auto ? Math.max(2, Math.min(40, Math.round((BARB_STYLE.gapPx * kmPerPx) / 55.6))) : BARB_STYLE.every;
  const length = Math.round(Math.exp(Math.round(Math.log(BARB_STYLE.sizePx * kmPerPx) / 0.08) * 0.08));   // ~8 % steps
  return { every, length };
}
// Flow lines: about FLOW_GAP_PX apart on screen at any zoom, like the barbs.
let FLOW_GAP_PX = 60;
function flowGap() {
  const dist = camera.position.distanceTo(controls.target);
  const kmPerPx = (2 * dist * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, root.clientHeight);
  return Math.max(2, Math.min(40, Math.round((FLOW_GAP_PX * kmPerPx) / 55.6)));
}
function applyBarbStyle(force = false) {
  const { every, length } = barbScale(), key = `${every}:${length}:${flowGap()}`;
  if (!force && key === barbScaleKey) return;
  barbScaleKey = key;
  const gap = flowGap(), arrow = Math.round(length * 0.35);
  for (const L of Object.values(layers)) {
    L.barbs.every = every; L.barbs.length = length; L.barbs.key = null;
    L.flow.gapCells = gap; L.flow.arrowKm = arrow; L.flow.key = null;
  }
  if (Object.values(layers).some((L) => (L.barbsOn || L.flowOn) && L.visible)) applyTime(true);
  // The Past year's wind is on a 1-degree grid: half as many cells for the same spacing.
  if (arch.barbs) { arch.barbs.every = Math.max(1, Math.round(every / 2)); arch.barbs.length = length; arch.barbs.key = null; }
  if (arch.flow) { arch.flow.gapCells = Math.max(2, Math.round(gap / 2)); arch.flow.arrowKm = arrow; arch.flow.key = null; }
  if (arch.on && arch.cur) archWind();
}
$("barbSpacing").addEventListener("change", (e) => {
  BARB_STYLE.auto = e.target.value === "auto";
  if (!BARB_STYLE.auto) BARB_STYLE.every = Number(e.target.value);
  applyBarbStyle(true);
});
$("barbSize").addEventListener("input", (e) => { BARB_STYLE.sizePx = Number(e.target.value); applyBarbStyle(true); });
$("barbWidth").addEventListener("input", (e) => { for (const L of Object.values(layers)) L.barbs.setWidth(Number(e.target.value)); dirty = true; });
$("flowSpacing").addEventListener("change", (e) => { FLOW_GAP_PX = Number(e.target.value); applyBarbStyle(true); });
$("flowWidth").addEventListener("input", (e) => { for (const L of Object.values(layers)) L.flow.setWidth(Number(e.target.value)); dirty = true; });

// Global particle style.
$("pWidth").addEventListener("input", (e) => { PARTICLE_STYLE.width.value = Number(e.target.value); dirty = true; });
$("pOpacity").addEventListener("input", (e) => { PARTICLE_STYLE.opacity.value = Number(e.target.value); dirty = true; });
$("pSpeed").addEventListener("input", (e) => { PARTICLE_STYLE.speed = Number(e.target.value); });
$("pDensity").addEventListener("input", (e) => { particleDensity = Math.pow(10, Number(e.target.value)); updateWindVisibility(); });

// ---- layer panel + legend ------------------------------------------------------------
const legend = $("legend");
function updateLegend() {
  legend.innerHTML = "";
  if (satShown) {
    const e = manifest.satellite;
    const row = document.createElement("div");
    row.className = "legend-row";
    const lo = Math.round(e.vmax_k - 273.15), hi = Math.round(e.vmin_k - 273.15);
    // Enhanced: grey to -30 C, then 10 C colour bands (same as ground.js).
    const pct = (c) => (((lo - c) / (lo - hi)) * 100).toFixed(1);
    const bands = [[-30, "#80b3ff"], [-40, "#2e70db"], [-50, "#2eb34a"], [-60, "#f2d13b"], [-70, "#e03a2e"], [-80, "#c25cd6"]];
    const grad = satEnhance
      ? `linear-gradient(to right,#000 0%,#b0b0b0 ${pct(-30)}%,${bands.map(([c, col], i) => `${col} ${pct(c)}%,${col} ${pct(bands[i + 1]?.[0] ?? hi)}%`).join(",")})`
      : "linear-gradient(to right,#000,#fff)";
    row.innerHTML = `<span class="legend-label">Satellite infrared (°C; ${satEnhance ? "colours = cold, high cloud tops" : "white = cold, high cloud"})</span>
      <span class="legend-bar" style="background:${grad}"></span>
      <span class="legend-ends"><span>${lo}</span><span>${hi}</span></span>`;
    legend.appendChild(row);
  }
  const keys = Object.values(layers).map((L) => L.visible && (diffOn(L) ? diffScale(L.def.fills[L.fill], diffRange(L.def.fills[L.fill])) : L.def.fills[L.fill])).filter((k) => k && k !== "sheet");
  if (arch.on && arch.scaleKey) keys.push(arch.scaleKey);
  if (hp.on && hp.layer?.visible) keys.push(secScale(hp.qty));
  if (fl3.on && fl3.obj?.object.visible && fl3.colorBy === "q" && p3QScale() && !keys.includes(p3QScale())) keys.push(p3QScale());
  if (sec.on && secPath) keys.push(secScale(sec.qty));
  if (vol.on && volume.object.visible) {
    // The volume's key: the part of its scale it shows (threshold and up;
    // anomalies: the whole diverging scale, shown beyond +-threshold).
    const sk = volumeScaleKey(), s = SCALES[sk];
    const row = document.createElement("div");
    row.className = "legend-row";
    if (SIGNED.has(vol.qty)) {
      row.innerHTML = `<span class="legend-label">volume: ${s.label}, shown beyond ±${vol.thr} (${s.units})</span>
        <span class="legend-bar" style="background:${cssGradient(sk)}"></span>
        <span class="legend-ends"><span>${s.min}</span><span>+${s.max}</span></span>`;
      legend.appendChild(row);
    } else {
    // A gradient for exactly threshold..max, sampled from the scale's own colours.
    const L = lut(s.stops, s.min, s.max), hi = VOL_MAX[vol.qty];
    const css = `linear-gradient(to right, ${Array.from({ length: 9 }, (_, i) => {
      const v = vol.thr + ((hi - vol.thr) * i) / 8, j = Math.max(0, Math.min(255, Math.round(((v - s.min) / (s.max - s.min)) * 255))) * 4;
      return `rgb(${L[j]},${L[j + 1]},${L[j + 2]}) ${(i * 12.5).toFixed(1)}%`;
    }).join(", ")})`;
    row.innerHTML = `<span class="legend-label">volume: ${volumeLabel()} (${s.units})</span>
      <span class="legend-bar" style="background:${css}"></span>
      <span class="legend-ends"><span>${vol.thr}</span><span>${VOL_MAX[vol.qty]}</span></span>`;
    legend.appendChild(row);
    }
  }
  if (p3.on) {
    // The 3-D particles' key: height (level colours) or speed.
    const row = document.createElement("div");
    row.className = "legend-row";
    if (p3.colorBy === "q" && p3QScale()) {
      const sk = p3QScale(), sc = SCALES[sk];
      row.innerHTML = `<span class="legend-label">3-D particles: ${sc.label} (${sc.units})</span><span class="legend-bar" style="background:${cssGradient(sk)}"></span>
        <span class="legend-ends"><span>${sc.min}</span><span>${sc.max}</span></span>`;
    } else if (p3.colorBy === "w") {
      row.innerHTML = `<span class="legend-label">3-D particles: vertical motion (cm/s, + rising)</span><span class="legend-bar" style="background:${cssGradient("sec_w")}"></span>
        <span class="legend-ends"><span>${SCALES.sec_w.min}</span><span>+${SCALES.sec_w.max}</span></span>`;
    } else if (p3.colorBy === "speed") {
      row.innerHTML = `<span class="legend-label">3-D particles: wind speed (kt)</span><span class="legend-bar" style="background:${cssGradient("sec_speed")}"></span>
        <span class="legend-ends"><span>${SCALES.sec_speed.min}</span><span>${SCALES.sec_speed.max}</span></span>`;
    } else {
      const st = p3.stops ?? (p3.stops = p3Stops()), top = st[st.length - 1][0];
      const css = `linear-gradient(to right, ${st.map(([m, c]) => `#${c.getHexString()} ${((m / top) * 100).toFixed(1)}%`).join(", ")})`;
      row.innerHTML = `<span class="legend-label">3-D particles: height (level colours)</span><span class="legend-bar" style="background:${css}"></span>
        <span class="legend-ends"><span>0</span><span>${fmtHeight(top, hUnit)}</span></span>`;
    }
    legend.appendChild(row);
  }
  for (const key of keys) {
    const s = SCALES[key];
    const row = document.createElement("div");
    row.className = "legend-row";
    const ft = key === "hs" && waveUnit === "ft";           // same colours, ends in feet
    const lo = (s.ends ?? [s.min])[0], hi = ft ? Math.round(s.max * FT_PER_M) : s.max;
    row.innerHTML = `<span class="legend-label">${s.label}${ft ? " (ft)" : s.units ? ` (${s.units})` : ""}</span>
      <span class="legend-bar" style="background:${cssGradient(key)}"></span>
      <span class="legend-ends"><span>${lo}</span><span>${hi}</span></span>`;
    legend.appendChild(row);
  }
}
// ---- focus level, column, questions --------------------------------------------------
// One FOCUS level gets the fill, particles and barbs; other levels are
// context (contour lines only) or off. See docs/interaction_design.md §4.2.
const STD_KM = { p1000: 0.1, p925: 0.8, p850: 1.5, p700: 3.0, p500: 5.6, p300: 9.2, p250: 10.4 };
const FILL_LABEL = { mslp: "sea-level pressure", wind: "wind speed", temp: "temperature", sst: "sea temperature", height: "height (troughs blue, ridges orange)", rh: "humidity (RH)", moist: "moist air only (RH ≥ 70 %)", none: "nothing (lines only)",
  waves: "wave height (the model's wave model)", wave_period: "wave period (long = swell)", mslp_anom: "pressure anomaly (vs 1991–2020)", sst_anom: "sea temperature anomaly (vs 1991–2020)", sst_obs: "observed sea temperature (OISST)", sst_obs_anom: "observed sea temperature anomaly (OISST)",
  height_anom: "height anomaly (vs 1991–2020)", temp_anom: "temperature anomaly (vs 1991–2020)", vertical: "rising / sinking air (vertical motion)",
  water_vapour: "water vapour (atmospheric rivers)",
  vort: "vorticity (spin)", div: "divergence / convergence", thetae: "θe: air masses with their moisture", grad: "thermal gradient (front zones)", fgen: "frontogenesis (fronts forming)",
  pbl: "boundary-layer depth: how deep the air is mixed (GFS)", rib: "mixing from the ground: bulk Richardson number" };
// Boundary-layer depth is in the GFS surface files from 2026-09-30 on (ECMWF's open data has none).
const HAS_HPBL = (manifest.surface_fields ?? []).includes("hpbl");
// Precipitable water is in the surface files from 2026-09-29 on (Stage 4).
const HAS_PWAT = (manifest.surface_fields ?? []).includes("pwat");
// Vertical motion is in the level bundles from 2026-09-28 on.
const HAS_W = (manifest.level_fields ?? []).includes("w");
for (const el of document.querySelectorAll("[data-needs-w]")) el.hidden = !HAS_W;
let fillBlinkOff = false;    // B: hide the focus fill for a moment, to compare with what's under it
function fillKeyFor(L, kind) {
  if (kind === "none") return "none";
  const derived = { vort: "sec_vort", div: "sec_div", thetae: "sec_thetae", grad: "sec_grad", fgen: "sec_fgen" }[kind];
  if (derived) return L.def.fills[derived] ? derived : "none";
  if (L.def.key === "sfc") return { mslp: "mslp", wind: "wind10", temp: "t2m", sst: "sst", water_vapour: "pwat", pbl: "hpbl", waves: "hs", wave_period: "tp", mslp_anom: "mslpa", sst_anom: "ssta", sst_obs: "ssto", sst_obs_anom: "sstoa" }[kind] ?? "none";
  return { wind: `wind${L.def.level}`, temp: `t${L.def.level}`, rh: `rh${L.def.level}`, moist: `moist${L.def.level}`, height: `gh${L.def.level}`,
    height_anom: `gha${L.def.level}`, temp_anom: `ta${L.def.level}`, vertical: `w${L.def.level}`, rib: "sec_rib" }[kind] ?? "none";
}
function applyLayers() {
  for (const L of Object.values(layers)) {
    const isF = L.def.key === show.focus;
    const sfcP = L.def.key === "sfc" && show.surfaceParticles !== "off";
    L.visible = !arch.on && !sim.on && (isF || show.context.has(L.def.key) || sfcP);
    L.glyphsOnly = !isF && !show.context.has(L.def.key);
    L.fill = isF && !fillBlinkOff ? fillKeyFor(L, show.fill) : (!isF && contextSheets ? "sheet" : "none");
    const sk = diffOn(L) ? diffScale(L.def.fills[L.fill], diffRange(L.def.fills[L.fill])) : L.def.fills[L.fill];
    L.gl.setFill(sk, SCALES[sk]);
    L.gl.uniforms.fillOpacity.value = L.def.opacity * (focusOpacity / 0.75);
    // Each level's contour lines in its own colour -- the same as its particles
    // and its swatch in the column -- so stacked levels can be told apart
    // (user request); the focus level's lines a little heavier.
    L.gl.uniforms.lineColor.value.set(opcShown ? OPC_CMP_COLOR : levelColor(L.def.key));
    L.gl.uniforms.lineWidth.value = levelWidth(L.def.key, isF);
    L.gl.uniforms.showLines.value = !isF || show.focusLines;
    L.particlesOn = L.def.key === "sfc" ? sfcP : isF && show.particles;
    L.barbsOn = isF && show.barbs;
    L.flowOn = isF && show.flow;
    L.barbs.key = null;
    L.flow.key = null;
  }
  renderColumn();
  renderFocusOpts();
  if (layers.sfc.particles) layers.sfc.particles.color.set(particleColor(layers.sfc));   // wind blue or wave teal
  requestAround();
  applyTime(true);
  updateLegend();
  updateLoadStatus();
}

// The column: levels top to bottom as in the atmosphere, with their height
// in the data on screen (the mean over the domain, where above ground).
const colBody = $("column").querySelector("tbody");
function levelKm(L) {
  if (L.def.key === "sfc") return "sea level";
  const d = L.current?.a ?? derivedFor(L, leads[timeline.segment().i0]);
  if (!d?.h) return `≈${fmtHeightBoth(STD_KM[L.def.key] * 1000, hUnit)}`;
  let s = 0, n = 0;
  for (let k = 0; k < d.h.length; k++) if (d.o[k] > 0.5 && Number.isFinite(d.h[k])) { s += d.h[k]; n++; }
  return n ? fmtHeightBoth(s / n, hUnit) : "—";
}
function renderColumn() {
  colBody.innerHTML = [...defs].reverse().map((def) => {
    const k = def.key, f = k === show.focus;
    return `<tr class="${f ? "focus" : ""}"><td><i class="sw" style="background:${levelColor(k)}"></i>${k === "sfc" ? "surface" : def.title}</td><td class="h">${levelKm(layers[k])}</td>
      <td><input type="radio" name="focus" value="${k}"${f ? " checked" : ""} title="Study this level"></td>
      <td><input type="checkbox" data-ctx="${k}"${f ? (show.focusLines ? " checked" : "") : show.context.has(k) ? " checked" : ""}
        title="${k === "sfc" ? "Isobars (sea-level pressure every 4 hPa)" : `${def.contourLabel}`}${f ? " on the focus level: untick for the colour fill alone" : ", as context"}"></td>
      <td><input type="checkbox" data-hl="${k}"${hlLevels.has(k) ? " checked" : ""} title="Label this level's highs and lows (H, L) when it's shown"></td></tr>`;
  }).join("");
}
$("column").addEventListener("change", (e) => {
  const el = e.target;
  if (el.name === "focus") {
    moveFocus(el.value);
    if (el.value === "sfc" && show.fill === "rh") show.fill = "wind";
  } else if (el.dataset.hl) {
    const k = el.dataset.hl, focusTick = k === show.focus;   // the focus's tick is the default one: it moves with focus
    if (el.checked) { hlLevels.add(k); if (!focusTick) hlByHand.add(k); } else { hlLevels.delete(k); hlByHand.delete(k); }
    dirty = true;
    return;
  } else if (el.dataset.ctx === show.focus) {
    show.focusLines = el.checked;
  } else if (el.dataset.ctx) {
    if (el.checked) show.context.add(el.dataset.ctx); else show.context.delete(el.dataset.ctx);
  }
  custom();
  applyLayers();
});
function renderFocusOpts() {
  const kinds = show.focus === "sfc"
    ? ["mslp", "wind", "temp", ...(HAS_PWAT ? ["water_vapour"] : []), "vort", "div", "grad", "fgen", ...(HAS_HPBL ? ["pbl"] : []), "sst", ...(hasWaves(model) ? ["waves", "wave_period"] : []), ...(CLIM ? ["mslp_anom", "sst_anom"] : []), ...(CLIM?.oisst ? ["sst_obs", "sst_obs_anom"] : []), "none"]
    : ["height", "wind", "temp", "rh", "moist", ...(HAS_W ? ["vertical"] : []), "vort", "div", "thetae", "grad", "fgen", "rib", ...(CLIM ? ["height_anom", "temp_anom"] : []), "none"];
  $("focusFill").innerHTML = kinds.map((k) => `<option value="${k}"${k === show.fill ? " selected" : ""}>${FILL_LABEL[k]}</option>`).join("");
  syncDiffControl();
  const sfcF = show.focus === "sfc";
  $("focusParticles").checked = sfcF ? show.surfaceParticles === "wind" : show.particles;
  // Say whose wind: the focus level's (10 m at the surface).
  const at = show.focus === "sfc" ? "at 10 m" : `at ${layers[show.focus].def.level} mb`;
  for (const el of document.querySelectorAll(".windAt")) el.textContent = at;
  $("surfaceParticles").querySelector('option[value="waves"]').hidden = !hasWaves(model);
  if (show.surfaceParticles === "waves" && !hasWaves(model)) show.surfaceParticles = "wind";
  $("surfaceParticles").value = show.surfaceParticles;
  $("waveUnitRow").hidden = !hasWaves(model);
  $("waveUnit").value = waveUnit;
  $("reliefRow").hidden = show.focus === "sfc";      // sea-level pressure is a flat sheet: no heights to stretch
  $("focusBarbs").checked = show.barbs;
  $("focusFlow").checked = show.flow;
}
$("focusFill").addEventListener("change", (e) => { show.fill = e.target.value; custom(); applyLayers(); syncDiffControl(); if (show.diff) applyTime(true); });
// The GFS − ECMWF box: only with both models in the build, and greyed out for
// a fill that has no difference view (anomalies, masks, derived, observed).
function syncDiffControl() {
  $("diffRow").hidden = !BOTH_MODELS;
  const L = layers[show.focus], ok = !!L && diffRange(L.def.fills[fillKeyFor(L, show.fill)]) != null;
  $("diffToggle").disabled = !ok;
  $("diffToggle").checked = show.diff;
  $("diffRow").classList.toggle("muted", !ok);
}
$("diffToggle").addEventListener("change", (e) => { show.diff = e.target.checked; custom(); applyLayers(); applyTime(true); updateLegend(); updateHud(); });
$("focusParticles").addEventListener("change", (e) => {
  // At the surface this box and the Surface section drive the same particles.
  if (show.focus === "sfc") show.surfaceParticles = e.target.checked ? "wind" : "off";
  else show.particles = e.target.checked;
  custom(); applyLayers();
});
$("focusFlow").addEventListener("change", (e) => { show.flow = e.target.checked; custom(); applyLayers(); });
$("focusBarbs").addEventListener("change", (e) => { show.barbs = e.target.checked; custom(); applyLayers(); });
function setWaveUnit(u) {
  waveUnit = u === "ft" ? "ft" : "m";
  try { localStorage.setItem("np3d.waveunit", waveUnit); } catch { /* ignore */ }
  $("waveUnit").value = waveUnit;
  updateLegend(); probeKey = null; updateProbe(); if (hover) updateReadout();
}
$("waveUnit").addEventListener("change", (e) => setWaveUnit(e.target.value));
$("surfaceParticles").addEventListener("change", (e) => {
  show.surfaceParticles = e.target.value; custom(); applyLayers();
  if (layers.sfc.particles) layers.sfc.particles.color.set(particleColor(layers.sfc));
  updateParticleKey();
});
$("fillOpacity").addEventListener("input", (e) => { focusOpacity = Number(e.target.value); applyLayers(); });
$("relief").max = String(RELIEF_MAX);
$("relief").addEventListener("input", (e) => {
  relief = Number(e.target.value);
  custom();
  $("reliefVal").textContent = relief === 1 ? "×1 (true)" : `×${relief}`;
  applyLayers();
});
$("shadeToggle").addEventListener("change", (e) => { shadeOn = e.target.checked; applyTime(true); });
$("contextStyle").addEventListener("change", (e) => { contextSheets = e.target.value === "sheets"; custom(); applyLayers(); });

// Questions: a card with what to look for, a live note from the real step on
// screen, and a link into the guide. Any change afterwards makes it Custom.
const qSel = $("questionSel");
// Questions that need the climatology, observed SST or OPC charts only when this build has them.
const questionOk = (q) => !q.needs || (q.needs === "clim" ? !!CLIM : q.needs === "opc" ? !!OPC : q.needs === "waves" ? hasWaves(model) : q.needs === "w" ? HAS_W : q.needs === "pwat" ? HAS_PWAT : q.needs === "hpbl" ? HAS_HPBL : !!CLIM?.oisst);
// Two groups: the forecast's questions, and the past year's (archive.js) when
// the build has the archive. Picking one switches to its mode.
const ARCH_QS = ARCH?.days?.length ? ARCHIVE_QUESTIONS.filter((q) => !ARCHIVE_VIEWS[q.set.view].obs || ARCH.obs_days) : [];
qSel.innerHTML = `<optgroup label="Now and the forecast">${QUESTIONS.filter(questionOk).map((q) => `<option value="${q.id}">${q.label}</option>`).join("")}</optgroup>`
  + (ARCH_QS.length ? `<optgroup label="The past year">${ARCH_QS.map((q) => `<option value="${q.id}">${q.label}</option>`).join("")}</optgroup>` : "")
  + `<option value="custom">Custom (your own settings)</option>`;
qSel.addEventListener("change", (e) => {
  const aq = ARCH_QS.find((x) => x.id === e.target.value);
  if (aq) { applyArchiveQuestion(aq); return; }
  const q = QUESTIONS.find((x) => x.id === e.target.value);
  if (q) { if (arch.on) exitArchive(); applyQuestion(q); } else custom();
});
function custom() {
  if (arch.on) { if (arch.question) { arch.question = null; qSel.value = "custom"; archCard(); } return; }
  if (!question) return;
  question = null;
  qSel.value = "custom";
  renderCard();
}
// What a forecast question puts on the screen, as a key (user request,
// 2026-09-29: explain the presets like the cases), written from its spec.
const LEVEL_AT = { sfc: "at sea level", p1000: "at 1000 mb (≈0.1 km)", p925: "at 925 mb (≈0.8 km)", p850: "at 850 mb (≈1.5 km)", p700: "at 700 mb (≈3 km)",
  p500: "at 500 mb (≈5.5 km)", p300: "at 300 mb (≈9 km)", p250: "at 250 mb (≈10.4 km)" };
const Q_FILL = {
  height: "height of the level (m): troughs blue (low, cold air below), ridges orange (high, warm air below)",
  wind: "wind speed (kt): pale light, green and yellow moderate, red and purple strongest",
  temp: "temperature (°C): blue cold, red warm",
  rh: "relative humidity (%): brown dry, green and teal moist",
  moist: "moist air only (RH ≥ 70 %), cyan; drier air see-through",
  vertical: "vertical motion (cm/s): blue rising (cloud and rain), brown sinking (clearing)",
  height_anom: "height against its 1991–2020 average (m): blue lower than normal (troughs), red higher (ridges, blocks)",
  temp_anom: "temperature against its 1991–2020 average (°C): blue colder than normal, red warmer",
  mslp: "sea-level pressure (hPa): lows dark purple and blue, highs orange and red",
  mslp_anom: "sea-level pressure against its 1991–2020 average (hPa): blue lower than normal, red higher",
  water_vapour: "water vapour, all the water in the air above each point (mm): tan dry, green moist, blue and purple very moist (atmospheric rivers)",
  waves: "significant wave height (m): pale small, blue and green moderate, yellow to purple big",
  wave_period: "wave period (s): pale short (local wind-sea), dark red long (swell from far away)",
  sst: "sea temperature, the model's (°C): blue cold, red warm",
  sst_anom: "sea temperature against its 1991–2020 average (°C): blue colder than normal, red warmer",
  sst_obs: "observed sea temperature, NOAA OISST (°C): blue cold, red warm",
  sst_obs_anom: "observed sea temperature against its 1991–2020 average (°C): blue colder than normal, red warmer",
  vort: "vorticity, the air's spin: red counter-clockwise (cyclonic north of the equator), blue clockwise",
  div: "divergence: red air spreading out, blue converging", thetae: "θe, air masses with their moisture counted in (K): blue cold and dry, red warm and moist",
  grad: "thermal gradient (K per 100 km): the front zones stand out", fgen: "frontogenesis: red where fronts are forming, blue where they're weakening",
  pbl: "boundary-layer depth (m), GFS: how deep the air near the ground is being stirred; pale shallow (a lid close to the ground: smoke and pollution trapped), dark deep (afternoon heating, cold air over warm sea)",
  rib: "bulk Richardson number from the ground to this level: yellow and orange below 0.25, where the ground's air mixes up this far; green marginal; blue above 1, where the layer is too stable to mix (an inversion caps it); red below 0, where it overturns by itself",
};
const LINES_OF = (k) => (k === "sfc" ? "isobars (sea-level pressure every 4 hPa)" : `height contours ${LEVEL_AT[k]} every ${layers[k]?.def.interval ?? 60} m`);
function questionKey(spec) {
  const rows = [];
  if (spec.fill && spec.fill !== "none") rows.push(["Colour fill", `${Q_FILL[spec.fill] ?? FILL_LABEL[spec.fill]}, ${LEVEL_AT[spec.focus]}`]);
  const lines = [LINES_OF(spec.focus), ...spec.context.map(LINES_OF)];
  rows.push(["Lines", lines.join("; ") + (spec.context.length ? ", each level in its own colour" : "")]);
  if (spec.relief && spec.relief !== 1) rows.push(["Relief", `the ${LEVEL_AT[spec.focus].replace("at ", "")} surface's bumps stretched ×${spec.relief} so troughs and ridges show; readouts stay true`]);
  const wind = [];
  // (at the surface, wave-energy particles take the place of the 10 m wind's)
  if (spec.particles && !(spec.focus === "sfc" && spec.surfaceParticles === "waves")) wind.push(spec.focus === "sfc" ? "the 10 m wind as moving particles" : `the wind ${LEVEL_AT[spec.focus]} as moving particles`);
  if (spec.barbs) wind.push("wind barbs (each points into the wind; a full feather 10 kt, a pennant 50 kt)");
  if (spec.flow) wind.push("flow lines along the wind (direction only)");
  if (spec.surfaceParticles === "waves") wind.push("teal particles carrying wave energy the way it travels");
  if (wind.length) rows.push(["Wind", wind.join("; ")]);
  if (spec.satellite) rows.push(["Satellite", "observed infrared on the ground: white is cold, high cloud tops; dark is warm sea or low cloud"]);
  if (spec.opc) rows.push(["Forecasters' chart", "OPC's own analysis under the model's lines (which turn magenta)"]);
  const view = { opc: "straight down on OPC's chart area", domain: "straight down on the whole area", oblique: "an oblique 3-D view from the south, levels at their real heights (stretched)", globe: "the globe", storm: "flying to the deepest low, levels stacked above it" }[spec.view];
  if (spec.look) rows.push(["Camera", `close up on ${spec.look.name}`]);
  else if (view) rows.push(["Camera", view]);
  return `<ul class="case-key">${rows.map(([k, t]) => `<li><b>${k}:</b> ${t}</li>`).join("")}</ul>`;
}
function questionCard(key, why, lookFor) {
  return `<p class="case-shows"><b>On the map</b></p>${key}<p><b>Why this view:</b> ${why}</p><p><b>Look for:</b> ${lookFor}</p>`;
}
function renderCard() {
  if (question) $("qLook").innerHTML = questionCard(questionKey(question.spec), question.why, question.lookFor);
  else $("qLook").textContent = "Your own settings. Pick a question above for a guided view.";
  $("qWhy").href = question ? `guide.html#${question.guide}` : "guide.html";
  $("qNote").textContent = "";
  // Say when the question looks, if not at now.
  const t = question?.spec.time;
  $("qWhen").textContent = t === "obs" && sat
    ? `Shown at the newest satellite image, ${sat.frames[sat.frames.length - 1].time.slice(11, 16)} UTC (${relNow(SAT_END_H, NOW_H)}). Play or step → toward now; the image fades out 3 h after it.`
    : t === "past" && sat ? `Shown 12 h into the satellite's last 24 h (${relNow(timeline.pos, NOW_H)}).` : "";
  noteKey = null;
  updateQuestionNote();
}
const nearerLead = () => { const { i0, i1, t } = timeline.segment(); return leads[t < 0.5 ? i0 : i1]; };
// Fields of one bundle at the real step nearest the time on screen, loading it if needed.
function fieldsNow(m, bundle) {
  const lead = nearerLead();
  if (!loader.has(m, lead, bundle)) return null;
  const f = loader.ready(m, lead, bundle);
  if (!f) whenLoaded(m, lead, bundle, "note", () => { noteKey = null; updateQuestionNote(); });
  return f;
}
// Brightness temperature (K) of the satellite frame on screen at every grid
// point (null where the frame has no data), or null if none is shown.
const satGridCache = new Map();
function satBTOnGrid() {
  if (!satShown) return null;
  if (satGridCache.has(satShown.i)) return satGridCache.get(satShown.i);
  const g = manifest.grid, b = manifest.ground, out = new Array(g.nlat * g.nlon);
  for (let j = 0; j < g.nlat; j++) for (let i = 0; i < g.nlon; i++) {
    const [mx, my] = mercatorKm(g.lat0 + j * g.dlat, g.lon0 + i * g.dlon);
    out[j * g.nlon + i] = sat.valueAt(satShown.i, (mx - b.x_west) / (b.x_east - b.x_west), (my - b.y_south) / (b.y_north - b.y_south));
  }
  if (satGridCache.size > 4) satGridCache.delete(satGridCache.keys().next().value);
  satGridCache.set(satShown.i, out);
  return out;
}
function updateQuestionNote() {
  if (!question?.note) return;
  const key = `${question.id}:${model}:${nearerLead()}:${satShown?.i ?? "-"}`;
  if (key === noteKey) return;
  const text = question.note({
    grid: manifest.grid, models: manifest.models.filter((m) => manifest.inits?.[m]), model,
    label: (m) => MODEL_LABEL[m] ?? m,
    sfc: (m = model) => fieldsNow(m, "sfc"),
    level: (lv, m = model) => fieldsNow(m, `p${lv}`),
    satBT: satBTOnGrid,
  });
  if (text == null) return;                // still loading: try again when it arrives
  noteKey = key;
  $("qNote").textContent = `${text} (${sourceText(nearerLead())})`;
}
function applyQuestion(q, instant = false) {
  question = q;
  qSel.value = q.id;
  const sp = q.spec;
  hlLevels.clear(); hlByHand.clear(); hlLevels.add(sp.focus);
  for (const k of sp.hl ?? []) if (layers[k]) { hlLevels.add(k); if (k !== sp.focus) hlByHand.add(k); }   // H and L on other levels too (the gradient-wind questions)
  show.focus = sp.focus; show.context = new Set(sp.context); show.fill = sp.fill; focusWasContext = false;
  show.surfaceParticles = surfaceParticlesOf(sp);
  show.particles = sp.particles; show.barbs = sp.barbs; show.flow = !!sp.flow; show.focusLines = sp.focusLines ?? true;
  relief = sp.relief ?? 1;
  if (OPC) setOpcProduct(sp.opc ?? "");
  if (sp.time === "opc" && OPC && sp.opc) {
    // The newest analysis of that product (the past day's analyses come too).
    const mine = OPC.charts.filter((c) => c.product === sp.opc).sort((a, b) => Date.parse(b.valid) - Date.parse(a.valid));
    const a0 = mine.find((c) => c.lead_h === 0) ?? mine[mine.length - 1];
    if (a0) timeline.pos = timeline.clamp(hoursFrom(manifest.anchor, a0.valid));
  }
  if (relief !== 1) $("shapeGroup").open = true;       // show the control the question just set
  $("relief").value = String(relief);
  $("reliefVal").textContent = relief === 1 ? "×1 (true)" : `×${relief}`;
  if (sat) { satOn = sp.satellite; $("satToggle").checked = satOn; syncSatControls(); }
  if (sp.time === "now" || (sp.time !== "now" && !sat)) timeline.pos = opened.pos;
  if (sp.time === "obs" && sat) timeline.pos = SAT_END_H;     // the newest real image; the model is labelled as interpolated if between steps
  if (sp.time === "past" && sat) {
    // A real model step in the middle of the satellite's 24 h, so nothing is interpolated.
    const target = SAT_END_H - 12;
    timeline.pos = leads.reduce((b, h) => (Math.abs(h - target) < Math.abs(b - target) ? h : b), leads[0]);
  }
  applyLayers();
  renderCard();
  if (sp.view === "storm") {
    const s = fieldsNow(model, "sfc");
    if (s) setView("storm", instant);
    else loader.load(model, nearerLead(), "sfc").then(() => { if (question === q) setView("storm", instant); });
  } else if (sp.look) caseLook(sp.look);          // a region close up (the gradient-wind questions)
  else setView(sp.view, instant);
}
updateLegend();

// ---- cameras ------------------------------------------------------------------------
// The top view is a telephoto (narrow field of view, far away) so it reads
// like a flat chart: at 45 degrees a lifted level would look several percent
// larger than the ground beneath it from simple perspective; at 8 degrees
// from far enough away to fit the domain, that parallax drops to ~1%.
// Presets are built for the current window shape: on a narrow window the
// camera backs off (same viewing direction) until the whole domain width fits.
// The flat views frame the OPC chart box (the default view, BUILD_SPEC §3);
// "domain" is the top view of the whole data domain, "globe" the globe.
function frameBox() {
  const b = manifest.opc_box;
  if (!b) return { cx: 0, cy: 0, W: geo.width, H: geo.height };
  const [xw, ys] = mercatorKm(b.lat_min, b.lon_min), [xe0, yn] = mercatorKm(b.lat_max, b.lon_max);
  const xe = xe0 < xw ? xe0 + 2 * Math.PI * 6378.137 : xe0;
  const [gx, gy] = [geo.uniforms.geoCenter.value.x, geo.uniforms.geoCenter.value.y];
  return { cx: (xw + xe) / 2 - gx, cy: (ys + yn) / 2 - gy, W: xe - xw, H: yn - ys };
}
function camPreset(name) {
  const a = camera.aspect || 1.6;
  if (name === "domain" && sim.on) {
    // Simulate's flat map: the whole world (to about 75 deg) from straight above, centred on the equator at the dateline.
    const c = geo.point(0, 180, 0, 0, 0, 0), W = 2 * Math.PI * 6378, H = 2 * 6378 * Math.log(Math.tan((82.5 * Math.PI) / 180));
    const fov = 30, t = Math.tan((fov / 2) * Math.PI / 180), d = Math.max(H * 1.05, (W * 1.03) / a) / (2 * t);
    return { pos: [c.x, c.y - 1, d], target: [c.x, c.y, 0], fov };
  }
  if (name === "storm") {
    // Close oblique view of the deepest low at the real step on screen.
    const s = loader.ready(model, nearerLead(), "sfc"), lo = s && deepestLow(s.mslp, manifest.grid);
    if (lo) {
      const p = geo.point(lo.lat, lo.lon, 0, 0, 0, 0);
      return { pos: [p.x, p.y - 3400, 2800], target: [p.x, p.y + 300, 500], fov: 45 };
    }
    name = "oblique";
  }
  if (name === "opc" || name === "domain") {
    const { cx, cy, W, H } = name === "opc" ? frameBox() : { cx: 0, cy: 0, W: geo.width, H: geo.height };
    const fov = 8, t = Math.tan((fov / 2) * Math.PI / 180);
    const d = Math.max(H * 1.12, (W * 1.06) / a) / (2 * t);
    return { pos: [cx, cy - 1, d], target: [cx, cy, 0], fov };
  }
  const widen = Math.max(1, 2.0 / a);
  if (name === "globe") {
    // Looking at the Earth's centre from above the data, tilted a little south.
    const c = new THREE.Vector3(0, 0, -R_KM), dir = new THREE.Vector3(0, -0.35, 1).normalize();
    const p = c.clone().addScaledVector(dir, R_KM * 3.4 * widen);
    return { pos: p.toArray(), target: c.toArray(), fov: 45 };
  }
  const { cx, cy, W, H } = frameBox();
  if (name === "low") return { pos: [cx - W * 0.2 * widen, cy - H * 0.72 * widen, 900 * widen], target: [cx, cy + 200, 500], fov: 45 };
  return { pos: [cx, cy - H * 1.35 * widen, H * 0.75 * widen], target: [cx, cy, 250], fov: 45 };
}
let flight = null;
function flyTo(name, instant = false) {
  const c = camPreset(name);
  const to = { pos: new THREE.Vector3(...c.pos), target: new THREE.Vector3(...c.target), fov: c.fov };
  if (instant) {
    camera.position.copy(to.pos); controls.target.copy(to.target);
    camera.fov = to.fov; camera.updateProjectionMatrix(); controls.update(); dirty = true; return;
  }
  flight = { from: { pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov }, to, t0: performance.now(), ms: 1400 };
}
// Views: the flat ones morph back from the globe if needed; "globe" drapes
// everything on the curved Earth (the shared morph uniform, 0 flat, 1 globe).
let morphAnim = null;
// Globe mode orbits the Earth's CENTRE with "up" along its axis, so a sideways
// drag spins the Earth about its axis and an up/down drag tilts it. The flat
// map orbits a point on the map with up = the map's vertical, never below it.
// (Orbiting a surface point on the globe felt like grabbing the wrong thing.)
const EARTH_AXIS = new THREE.Vector3(0, Math.cos(geo.center[0] * Math.PI / 180), Math.sin(geo.center[0] * Math.PI / 180));
function setControlMode(globe) {
  const up = globe ? EARTH_AXIS : new THREE.Vector3(0, 0, 1);
  camera.up.copy(up);
  controls._quat.setFromUnitVectors(up, new THREE.Vector3(0, 1, 0));
  controls._quatInverse.copy(controls._quat).invert();
  controls.minPolarAngle = globe ? 0.05 : 0;
  controls.maxPolarAngle = globe ? Math.PI - 0.05 : Math.PI / 2 - 0.02;
  controls.enablePan = !globe;
  controls.minDistance = globe ? R_KM + 600 : 5;
  controls.maxDistance = globe ? R_KM * 8 : Infinity;
  controls.rotateSpeed = globe ? 0.6 : 1;
}
function setView(name, instant = false) {
  roiLookUp = false;
  for (const x of document.querySelectorAll("[data-rview]")) x.classList.remove("on");
  const to = name === "globe" ? 1 : 0;
  setControlMode(to === 1);
  if (instant) {
    geo.uniforms.morph.value = to;
    backdrop.visible = to > 0.02;
    backdrop.material.uniforms.opacity.value = to;
    morphAnim = null;
  } else if (Math.abs(geo.uniforms.morph.value - to) > 1e-3) {
    morphAnim = { from: geo.uniforms.morph.value, to, t0: performance.now(), ms: 1600 };
  }
  flyTo(name, instant);
  for (const b of document.querySelectorAll("[data-view]")) b.classList.toggle("on", b.dataset.view === name);
}
for (const b of document.querySelectorAll("[data-view]")) b.addEventListener("click", () => setView(b.dataset.view));

// ---- hover readout --------------------------------------------------------------
// Values at the ground point under the cursor, for every visible layer, at
// the nearer REAL model step (never a blended value). A vertical pin marks
// the column: in an oblique view a lifted level under the cursor is a
// different spot than the ground under it, so the pin shows which column
// the numbers belong to. The top (chart) view is exact.
const tip = $("readout");
const raycaster = new THREE.Raycaster();
const pin = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
  new THREE.LineBasicMaterial({ color: 0xd99b3f, depthTest: false, transparent: true }),
);
pin.renderOrder = 999;
pin.visible = false;
scene.add(pin);

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
// Vertical motion in words: "rising 12 cm/s (430 m an hour)".
function wText(w) {
  if (Math.abs(w) < 0.5) return "air nearly still vertically";
  return `${w > 0 ? "rising" : "sinking"} ${Math.abs(w) < 10 ? Math.abs(w).toFixed(1) : Math.round(Math.abs(w))} cm/s (${Math.round((Math.abs(w) * 36) / 10) * 10} m an hour)`;
}
function windText(u, v) {
  const kt = Math.hypot(u, v) * KT;
  if (kt < 1) return "calm";
  const from = ((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360;
  return `${COMPASS[Math.round(from / 22.5) % 16]} ${Math.round(kt)} kt`;
}
const compass16 = (deg) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];

function updateReadout() {
  if (!hover) { tip.hidden = true; pin.visible = false; return; }
  if (arch.on) { archReadout(); return; }
  const g = manifest.grid;
  const { lat, lon } = hover;
  const fi = (lon - g.lon0) / g.dlon, fj = (lat - g.lat0) / g.dlat;
  if (fi < 0 || fj < 0 || fi > g.nlon - 1 || fj > g.nlat - 1) { tip.hidden = true; pin.visible = false; return; }
  const k = Math.round(fj) * g.nlon + Math.round(fi);
  const { i0, i1, t } = timeline.segment();
  const lead = leads[t < 0.5 ? i0 : i1];
  const observed = timeline.beforeModel || timeline.afterModel;
  const lonTxt = lon > 180 ? `${(360 - lon).toFixed(1)}°W` : `${lon.toFixed(1)}°E`;
  const when = observed ? "no model data at this time" : sourceText(lead);
  const latTxt = lat < 0 ? `${(-lat).toFixed(1)}°S` : `${lat.toFixed(1)}°N`;
  const rows = [`<b>${latTxt} ${lonTxt}</b> <span class="muted">${when}</span>`];
  if (satShown) {
    const b = manifest.ground, [mx, my] = mercatorKm(lat, lon);
    const kelvin = sat.valueAt(satShown.i, (mx - b.x_west) / (b.x_east - b.x_west), (my - b.y_south) / (b.y_north - b.y_south));
    const at = satShown.frame.time.slice(11, 16);
    rows.push(kelvin == null ? `Satellite IR ${at} UTC: no data`
      : `Satellite IR ${at} UTC: ${(kelvin - 273.15).toFixed(0)}°C <span class="muted">(${kelvin < 253 ? "cloud top" : "cloud top or surface"})</span>`);
  }
  let top = 0;
  for (const L of Object.values(layers)) {
    if (!L.visible || observed) continue;
    const d = derivedFor(L, lead);
    if (!d) continue;
    if (L.def.key === "sfc") {
      const sea = d.fills.sst[k] > SEA_MISSING + 1 ? ` · sea ${d.fills.sst[k].toFixed(1)}°C` : "";
      const pw = HAS_PWAT && Number.isFinite(d.fills.pwat[k]) ? ` · water vapour ${Math.round(d.fills.pwat[k])} mm` : "";
      const bl = d.fills.hpbl[k] > SEA_MISSING + 1 ? ` · mixed ${fmtHeight(d.fills.hpbl[k], hUnit)} deep` : "";
      rows.push(`Sea level: ${d.c[k].toFixed(1)} hPa · 10 m ${windText(d.u[k], d.v[k])} · 2 m ${d.fills.t2m[k].toFixed(1)}°C${sea}${pw}${bl}`);
      const w = hasWaves(model) ? wavesOf(d)?.raw : null;
      if (w && Number.isFinite(w.hs[k])) rows.push(`Waves: ${fmtWave(w.hs[k], waveUnit)} · ${w.tp[k].toFixed(0)} s · from ${compass16(w.dir[k])} <span class="muted">(${WAVE_MODEL[model]})</span>`);
    } else if (d.o[k] < 0.5) {
      rows.push(`${L.def.title}: below ground here`);
    } else {
      const lv = L.def.level;
      top = Math.max(top, d.h[k]);
      rows.push(`${L.def.title}: ${Math.round(d.h[k] / 10)} dam (${fmtHeight(d.h[k], hUnit)}) · ${d.fills[`t${lv}`][k].toFixed(1)}°C · ${windText(d.u[k], d.v[k])} · RH ${Math.round(d.fills[`rh${lv}`][k])}%${d.w && Number.isFinite(d.w[k]) ? ` · ${wText(d.w[k])}` : ""}${L.fill === "sec_rib" && Number.isFinite(d.fills.sec_rib[k]) ? ` · Ri from the ground ${d.fills.sec_rib[k].toFixed(2)}` : ""}`);
    }
    // The two models' difference at this point, with both values.
    if (diffOn(L) && !(L.def.key !== "sfc" && d.o[k] < 0.5)) {
      const e = derivedFor(L, lead, OTHER_MODEL[model]), a = fillOf(L, d, L.fill)?.[k], b = e ? fillOf(L, e, L.fill)?.[k] : null;
      if (a != null && b != null && a > SEA_MISSING + 1 && b > SEA_MISSING + 1) {
        const s = SCALES[L.def.fills[L.fill]], g = model === "gfs" ? a : b, ec = model === "gfs" ? b : a, dv = g - ec, dp = s.units === "m" || s.units === "%" ? 0 : 1;
        rows.push(`&nbsp;&nbsp;<span class="muted">GFS − ECMWF, ${s.label}:</span> <b>${dv > 0 ? "+" : dv < 0 ? "−" : ""}${Math.abs(dv).toFixed(dp)} ${s.units}</b> (GFS ${g.toFixed(dp)}, ECMWF ${ec.toFixed(dp)})`);
      }
    }
    // The anomaly (or observed SST) being shown, at this point.
    const ak = L.def.fills[L.fill];
    if (ak && (SCALES[ak]?.anomaly || ak === "ssto" || ak.startsWith("sec_")) && !(L.def.key !== "sfc" && d.o[k] < 0.5)) {
      const v = fillOf(L, d, L.fill)?.[k];
      if (v != null && Number.isFinite(v) && v > SEA_MISSING + 1) {
        const s = SCALES[ak], clampedLow = (ak === "ssta" || ak === "sstoa") && v <= -4;
        const sgn = s.min < 0 ? (v > 0 ? "+" : v < 0 ? "−" : "") : "";          // a sign only for quantities that can be negative
        const txt = ak === "ssto" ? `${v.toFixed(1)}°C` : `${clampedLow ? "≤ " : ""}${sgn}${(s.min < 0 ? Math.abs(v) : v).toFixed(s.units === "m" ? 0 : 1)} ${s.units}`;
        rows.push(`&nbsp;&nbsp;<span class="muted">${s.label}:</span> ${txt}`);
      }
    }
  }
  tip.innerHTML = rows.join("<br>");
  tip.hidden = false;
  const W = root.clientWidth, H = root.clientHeight;
  tip.style.left = `${Math.min(hover.px + 14, W - tip.offsetWidth - 8)}px`;
  tip.style.top = `${Math.min(hover.py + 14, H - tip.offsetHeight - 8)}px`;
  const vex = Math.pow(10, Number($("vexSlider").value));
  const pos = pin.geometry.attributes.position;
  const p0 = geo.point(lat, lon, 0), p1 = geo.point(lat, lon, Math.max(top * 0.001 * vex, 40) + 30);
  pos.setXYZ(0, p0.x, p0.y, p0.z);
  pos.setXYZ(1, p1.x, p1.y, p1.z);
  pos.needsUpdate = true;
  pin.visible = true;
}

renderer.domElement.addEventListener("pointermove", (e) => {
  const r = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = geo.pick(raycaster.ray);
  hover = hit ? { lat: hit.latlon[0], lon: hit.latlon[1], px: e.clientX - r.left, py: e.clientY - r.top } : null;
  updateReadout();
  dirty = true;
});
renderer.domElement.addEventListener("pointerleave", () => { hover = null; updateReadout(); dirty = true; });

// ---- probe: click (not drag) to pin a column ---------------------------------------------
// Profile at the nearer real step, meteogram over every real step (probe.js).
let downAt = null;
renderer.domElement.addEventListener("pointerdown", (e) => { downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; });
renderer.domElement.addEventListener("pointerup", (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5 || performance.now() - downAt.t > 500) return;
  const r = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  const hit = geo.pick(raycaster.ray);
  if (!hit) return;
  const k = nearestIndex(manifest.grid, hit.latlon[0], hit.latlon[1]);
  if (k < 0) return;
  setProbe(k);
});
const probeBox = $("probe");
const probePin = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
  new THREE.LineBasicMaterial({ color: 0xf97316, depthTest: false, transparent: true, opacity: 0.95 }),
);
probePin.renderOrder = 998;
probePin.visible = false;
scene.add(probePin);
function setProbe(k) {
  if (k == null) { probeAt = null; probeBox.hidden = true; probePin.visible = false; dirty = true; return; }
  const g = manifest.grid, j = Math.floor(k / g.nlon), i = k % g.nlon;
  probeAt = { k, lat: g.lat0 + j * g.dlat, lon: g.lon0 + i * g.dlon };
  probeBox.hidden = false;
  // Narrow screens: fold the panel to its tabs so the probe has room (a tab tap opens it again).
  if (matchMedia("(max-width: 700px)").matches) $("panel").classList.add("folded");
  probeKey = null;
  updateProbe();
}
$("probeClose").addEventListener("click", () => setProbe(null));
$("probeFold").addEventListener("click", () => {
  const f = probeBox.classList.toggle("folded");
  $("probeFold").textContent = f ? "▸" : "▾";
});
$("probeBoth").addEventListener("change", () => { probeKey = null; updateProbe(); });
function probeDayTicks() {
  const out = [], a = Date.parse(manifest.anchor);
  const d0 = new Date(a + timeline.start * 3600e3); d0.setUTCHours(0, 0, 0, 0);
  for (let ms = d0.getTime(); ms <= a + timeline.end * 3600e3; ms += 86400e3) {
    out.push([(ms - a) / 3600e3, new Date(ms).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" })]);
  }
  return out;
}
function updateProbe() {
  if (!probeAt) return;
  if (arch.on) { archProbe(); return; }
  const { k, lat, lon } = probeAt, lead = nearerLead();
  // Profile: the surface and every level at the nearer real step.
  const sfc = loader.ready(model, lead, "sfc");
  const lv = manifest.levels.map((p) => ({ p, f: loader.ready(model, lead, `p${p}`) }));
  let missing = 0;
  for (const b of ["sfc", ...manifest.levels.map((p) => `p${p}`)]) {
    if (!loader.ready(model, lead, b) && loader.has(model, lead, b)) { missing++; whenLoaded(model, lead, b, "probe", () => { probeKey = null; updateProbe(); }); }
  }
  // Meteogram: every real step of this model (and the other, if asked).
  const models = [model, ...($("probeBoth").checked ? manifest.models.filter((m) => m !== model && manifest.inits?.[m]) : [])];
  let have = 0;
  const series = models.map((m, i) => {
    const pts = [];
    for (const h of manifest.steps_h) {
      if (!loader.has(m, h, "sfc")) continue;
      const f = loader.ready(m, h, "sfc");
      if (!f) { whenLoaded(m, h, "sfc", "probe", () => { probeKey = null; updateProbe(); }); continue; }
      have++;
      // Wave height too, where this model's step has waves (NaN over land).
      let hs = NaN;
      if (loader.has(m, h, "wave")) {
        const w = loader.ready(m, h, "wave");
        if (w) hs = w.hs[k]; else whenLoaded(m, h, "wave", "probe", () => { probeKey = null; updateProbe(); });
      }
      pts.push([h, f.mslp[k] / 100, Math.hypot(f.u10[k], f.v10[k]) * KT, hs]);
    }
    return { label: MODEL_LABEL[m] ?? m, cls: `m${i}`, pts };
  });
  const key = `${k}:${model}:${lead}:${timeline.pos.toFixed(2)}:${missing}:${have}:${models.length}`;
  if (key === probeKey) return;
  probeKey = key;
  const latTxt = lat < 0 ? `${(-lat).toFixed(1)}°S` : `${lat.toFixed(1)}°N`;
  const lonE = ((lon % 360) + 360) % 360, lonTxt = lonE > 180 ? `${(360 - lonE).toFixed(1)}°W` : `${lonE.toFixed(1)}°E`;
  $("probeWhere").textContent = `${latTxt} ${lonTxt}`;
  $("probeWhen").textContent = `${sourceText(lead)} · nearest grid point (0.5°)`;
  // The sea state at this point, from the model's own wave model.
  const wv = loader.has(model, lead, "wave") ? loader.ready(model, lead, "wave") : null;
  if (loader.has(model, lead, "wave") && !wv) { missing++; whenLoaded(model, lead, "wave", "probe", () => { probeKey = null; updateProbe(); }); }
  const seaLine = wv && Number.isFinite(wv.hs[k])
    ? `<p class="probe-sfc">Sea state: significant wave height ${fmtWave(wv.hs[k], waveUnit)}, period ${wv.tp[k].toFixed(0)} s, from ${compass16(wv.dir[k])} (${Math.round(wv.dir[k])}°) — ${WAVE_MODEL[model]}</p>`
    : wv ? `<p class="probe-sfc">Sea state: none here (land or sea ice).</p>` : "";
  if (sfc && lv.every((x) => x.f)) {
    const prof = columnProfile(k, sfc, lv);
    $("probeProfile").innerHTML = profileSvg(prof) + profileTable(prof, hUnit) + seaLine;
  } else $("probeProfile").innerHTML = `<p class="muted">loading this step's levels…</p>`;
  $("probeMeteo").innerHTML = meteogramSvg(series, { now: NOW_H, shown: timeline.pos, dayTicks: probeDayTicks() }, { waveUnit })
    + `<p class="probe-key">${series.map((s) => `<span class="${s.cls}">— ${s.label}</span>`).join(" ")} <span class="nowk">| now</span> <span class="shownk">| shown</span> · click to go to a time</p>`;
  $("probeMeteo").onclick = (e) => {
    const svg = $("probeMeteo").querySelector("svg");
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    openNote = null;
    timeline.pos = timeline.clamp(meteogramHourAt((e.clientX - r.left) / r.width, series));
    requestAround(); applyTime();
  };
  // The pin: a vertical line through the column, to the top of the ruler.
  const vex = Math.pow(10, Number($("vexSlider").value));
  const p0 = geo.point(lat, lon, 0), p1 = geo.point(lat, lon, 12 * vex);
  const pos = probePin.geometry.attributes.position;
  pos.setXYZ(0, p0.x, p0.y, p0.z); pos.setXYZ(1, p1.x, p1.y, p1.z); pos.needsUpdate = true;
  probePin.visible = true;
  dirty = true;
}

// ---- render loop --------------------------------------------------------------
controls.addEventListener("change", () => { dirty = true; });
function resize() {
  const w = root.clientWidth, h = root.clientHeight;
  renderer.setSize(w, h);
  PARTICLE_STYLE.resolution.value.set(w, h);
  for (const L of Object.values(layers)) { L.barbs.setViewport(w, h); L.flow.setViewport(w, h); }      // barb stroke widths in CSS px, like particles
  for (const g of [arch.barbs, arch.flow]) g?.setViewport(w, h);
  levelLines.setViewport(w, h);
  if (fl3.obj) fl3.obj.setViewport(w, h);
  roiOutline.setViewport(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  dirty = true;
}
new ResizeObserver(resize).observe(root);
// The timebar's height varies (marker rows, narrow layouts): whatever sits
// above it (HUD, probe, slice chart) is placed from this.
// Set once now as well: a ResizeObserver only reports when the page renders
// (a background tab never does), and the fallback is shorter than the bar.
const setTb = () => document.documentElement.style.setProperty("--tb", `${document.querySelector(".timebar").offsetHeight}px`);
setTb();
new ResizeObserver(setTb).observe(document.querySelector(".timebar"));
// On narrow screens the probe fits between the panel and the HUD (both vary):
// their measured bottom / height place it (template CSS, max-width 700px).
const cssVar = (k, px) => document.documentElement.style.setProperty(k, `${Math.round(px)}px`);
new ResizeObserver(() => cssVar("--hud", document.querySelector(".hud").offsetHeight)).observe(document.querySelector(".hud"));
new ResizeObserver(() => { const p = $("panel"); cssVar("--panelb", p.hidden ? 40 : p.offsetTop + p.offsetHeight); }).observe($("panel"));

let last = performance.now();
const fps = { frames: 0, t0: performance.now(), value: 0 };
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (flight) {
    const k = Math.min(1, (now - flight.t0) / flight.ms);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    camera.position.lerpVectors(flight.from.pos, flight.to.pos, e);
    controls.target.lerpVectors(flight.from.target, flight.to.target, e);
    camera.fov = flight.from.fov + (flight.to.fov - flight.from.fov) * e;
    camera.updateProjectionMatrix();
    if (k >= 1) flight = null;
    dirty = true;
  }
  if (morphAnim) {
    const k = Math.min(1, (now - morphAnim.t0) / morphAnim.ms);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    geo.uniforms.morph.value = morphAnim.from + (morphAnim.to - morphAnim.from) * e;
    backdrop.visible = geo.uniforms.morph.value > 0.02;
    backdrop.material.uniforms.opacity.value = geo.uniforms.morph.value;
    if (k >= 1) morphAnim = null;
    if (hover) updateReadout();
    dirty = true;
  }
  if (timeline.tick(dt, isStepReady)) applyTime();
  if (controls.update()) dirty = true;
  if (roiLookUp && geo.uniforms.morph.value < 0.5 && camera.position.z < 8) { camera.position.z = 8; dirty = true; }   // never under the ground
  if (Object.values(layers).some((L) => (L.barbsOn || L.flowOn) && L.visible) || (arch.on && arch.windAs !== "particles")) applyBarbStyle();   // re-space barbs as the zoom changes
  drawFrame(dt, now);
}
// Particles, overlays and the render: everything a frame draws after the
// time is set (also timed directly by __atmos3d.frameCost).
function drawFrame(dt, now = performance.now()) {
  if (sim.on) { simTick(dt, now); dirty = true; }
  if (p3.on && pvol) { const f = p3Field(); if (f) { pvol.update(dt, f); dirty = true; } }
  if (arch.on && arch.particles?.object.visible && arch.windField) { arch.particles.update(dt, arch.windField); dirty = true; }
  for (const L of Object.values(layers)) {
    if (!L.particles || !L.particles.object.visible || !L.current) continue;
    const { a, b, t } = L.current;
    const fa = flowOf(L, a), fb = flowOf(L, b);
    L.particles.update(dt, { uA: fa.u, vA: fa.v, uB: fb.u, vB: fb.v, hA: hOf(L, a), hB: hOf(L, b), oA: a.o, oB: b.o, t });
    dirty = true;
  }
  if (!dirty && !timeline.playing) return;
  const dist = camera.position.distanceTo(controls.target);
  const near = Math.max(1, dist / 2000);
  camera.far = Math.max(60000, dist * 3);
  if (Math.abs(camera.near - near) / near > 0.2) { camera.near = near; camera.updateProjectionMatrix(); }
  placeOverlays();                 // before rendering: it moves the ruler
  placeHandles();
  renderer.render(scene, camera);
  dirty = false;
  fps.frames++;
  if (now - fps.t0 > 1000) { fps.value = (fps.frames * 1000) / (now - fps.t0); fps.frames = 0; fps.t0 = now; }
}

// ---- timeline markers, times line, staleness ------------------------------------------
// Markers sit over the slider track. The slider thumb is styled to a fixed
// 14 px (template CSS), so the track runs from 7 px to width - 7 px.
function drawMarkers() {
  const box = $("timeMarks"), span = timeline.end - timeline.start;
  box.innerHTML = "";
  const opcMarks = OPC && opcProduct ? OPC.charts.filter((c) => c.product === opcProduct).map((c) => ({
    h: hoursFrom(manifest.anchor, c.valid), kind: "opc", label: "",
    title: `${OPC_LABEL[c.product]}, valid ${fmtUtc(Date.parse(c.valid))} (${chartKind(c)}). ◀ ▶ by the timeline jump between them.`,
  })) : [];
  for (const mk of [...markers(manifest, NOW_H, MODEL_LABEL), ...opcMarks]) {
    if (mk.h < timeline.start - 1e-6 || mk.h > timeline.end + 1e-6) continue;
    const el = document.createElement("span");
    el.className = `mark mark-${mk.kind}${mk.model && mk.model !== model ? " mark-other" : ""}`;
    el.style.left = `${((mk.h - timeline.start) / span) * 100}%`;
    el.dataset.h = String(mk.h);
    el.title = mk.title;
    el.innerHTML = `<i></i><b>${mk.label}</b>`;
    box.appendChild(el);
  }
  // Labels that would overlap move up a row (markers close in time, e.g.
  // "satellite ends" and "now" are usually under an hour apart).
  const rows = [];
  for (const b of box.querySelectorAll(".mark b")) {
    const r = b.getBoundingClientRect();
    let row = 0;
    while ((rows[row] ?? []).some(([l, rr]) => r.left < rr + 4 && r.right > l - 4)) row++;
    (rows[row] ??= []).push([r.left, r.right]);
    b.style.top = `${row * 0.8}rem`;
  }
  const n = Math.max(1, rows.length);
  $("timeMarks").parentElement.style.paddingTop = `${0.25 + n * 0.8}rem`;
  for (const i of box.querySelectorAll(".mark i")) i.style.top = `${0.05 + n * 0.8}rem`;
}
drawMarkers();
{
  const parts = [`Built ${fmtUtc(Date.parse(manifest.generated_at))}`];
  for (const m of manifest.models) {
    const i = manifest.inits?.[m];
    parts.push(`${MODEL_LABEL[m] ?? m} run ${i ? runTag(i) : "unavailable"}`);
  }
  if (sat) parts.push(`satellite to ${sat.frames[sat.frames.length - 1].time.slice(11, 16)} UTC`);
  parts.push(`now ${fmtUtc(NOW_MS)} (this device's clock)`);
  $("timesLine").textContent = parts.join(" · ");
  const st = staleness(manifest.generated_at, NOW_MS);
  $("staleBadge").hidden = !st.stale;
  if (st.stale) $("staleBadge").textContent = `${st.text} — the daily update may have failed; "now" may be past what this build knows.`;
}

// ---- the slice (CT-scan section) --------------------------------------------------------
// A vertical section through the model on screen (section.js): built from
// the two real steps around the time shown, from all levels, and blended
// like everything else. Cached per step, path and quantity.
const G = manifest.grid;
const SEC_BOX = { latMin: G.lat0 + G.dlat * (G.nlat - 1), latMax: G.lat0, lonMin: G.lon0, lonMax: G.lon0 + G.dlon * (G.nlon - 1) };
const SEC_PROJ = { fwd: mercatorKm, inv: inverseMercatorKm };
const SEC_NZ = 64, SEC_TOP_M = 12500, SEC_STEP_KM = 40;
const secCache = new Map();
const secRange = () => (sec.mode === "ns" ? [SEC_BOX.lonMin, SEC_BOX.lonMax] : [SEC_BOX.latMin, SEC_BOX.latMax]);
const fmtLon = (lon) => { const e = ((lon % 360) + 360) % 360; return e > 180 ? `${(360 - e).toFixed(1)}°W` : `${e.toFixed(1)}°E`; };
const fmtLat = (lat) => (lat < 0 ? `${(-lat).toFixed(1)}°S` : `${lat.toFixed(1)}°N`);
function sectionData(m, lead) {
  const data = { sfc: loader.ready(m, lead, "sfc"), levels: {} };
  let missing = !data.sfc;
  if (!data.sfc) whenLoaded(m, lead, "sfc", "slice", updateSection);
  for (const p of manifest.levels) {
    const f = loader.ready(m, lead, `p${p}`);
    if (f) data.levels[p] = f;
    else { missing = true; whenLoaded(m, lead, `p${p}`, "slice", updateSection); }
  }
  if (missing) return null;
  // With the derived quantities (derived3d.js: vorticity, divergence,
  // turbulence index, stability), computed once per step and kept.
  const key = `${m}:${lead}`;
  if (!derivedCache.has(key)) {
    derivedCache.set(key, withDerived(data, manifest.grid));
    if (derivedCache.size > 6) derivedCache.delete(derivedCache.keys().next().value);
  }
  return derivedCache.get(key);
}
const derivedCache = new Map();
// ---- the 3-D tab's GFS − ECMWF (user request, 2026-09-29) --------------------------------
// The region's quantity as GFS minus ECMWF for the colour fill and the plane
// (particles and flow lines stay one model's wind): the difference taken level
// by level at the same valid time, then filled between the levels on the
// on-screen model's level heights, like any quantity. Symmetric ranges per
// quantity, so a colour means the same difference at every step.
const RQ_SHORT = { speed: "wind speed (kt)", temp: "temperature (°C)", theta: "θ (K)", rh: "humidity (%)", w: "vertical motion (cm/s)", vort: "vorticity",
  div: "divergence", ti: "turbulence index", stab: "stability (K/km)", ri: "Richardson number", thetae: "θe (K)", grad: "thermal gradient", fgen: "frontogenesis" };
const D3_RANGE = { speed: 20, temp: 3, theta: 3, rh: 30, w: 10, vort: 10, div: 5, ti: 8, stab: 4, thetae: 6, grad: 1.5, fgen: 1.5 };
const diff3dOk = (q) => BOTH_MODELS && D3_RANGE[q] != null;
const diff3d = (q) => roi.diff && diff3dOk(q);
const diffDataCache = new Map();
function diffData(lead, q) {
  const key = `${model}:${lead}:${q}`;
  if (diffDataCache.has(key)) return diffDataCache.get(key);
  const A = sectionData("gfs", lead), B = sectionData("ecmwf", lead);
  if (!A || !B) return null;                       // loading (sectionData calls back through updateSection)
  const C = model === "gfs" ? A : B, levels = {};
  for (const p of manifest.levels) {
    const a = levelField(A.levels[p], p, q), b = levelField(B.levels[p], p, q), dq = new Float32Array(a.length);
    for (let k = 0; k < dq.length; k++) dq[k] = Number.isFinite(a[k]) && Number.isFinite(b[k]) ? a[k] - b[k] : NaN;
    levels[p] = { ...C.levels[p], dq };
  }
  const out = { sfc: C.sfc, levels };
  diffDataCache.set(key, out);
  if (diffDataCache.size > 8) diffDataCache.delete(diffDataCache.keys().next().value);
  return out;
}
// The colour scale of a slice / plane quantity: its own, or its difference.
const secScale = (q) => (diff3d(q) ? diffScale(`sec_${q}`, D3_RANGE[q]) : `sec_${q}`);
const clampTo = (v, r) => { for (let k = 0; k < v.length; k++) if (Number.isFinite(v[k])) v[k] = Math.max(-r, Math.min(r, v[k])); return v; };
function sectionValues(lead, qty, path, slabs, specKey, fill = false) {
  const dq = fill && diff3d(qty);
  const key = `${model}:${lead}:${specKey}:${qty}${dq ? ":d" : ""}`;
  if (secCache.has(key)) return secCache.get(key);
  const data = dq ? diffData(lead, qty) : sectionData(model, lead);
  if (!data) return null;
  let v = buildSection(path, data, manifest.grid, dq ? "dq" : qty, { nz: SEC_NZ, zTopM: SEC_TOP_M, slabPaths: slabs }).values;
  if (dq) v = clampTo(v, D3_RANGE[qty]);
  secCache.set(key, v);
  if (secCache.size > 48) secCache.delete(secCache.keys().next().value);
  return v;
}
function updateSection() {
  updateHPlane();
  updateFlow3d();
  if (!sec.on || timeline.beforeModel || timeline.afterModel) { curtain.object.visible = levelLines.object.visible = false; secPath = sec.on ? secPath : null; drawChart(); dirty = true; return; }
  const spec = { mode: sec.mode, pos: sec.pos, turn: sec.turn, stepKm: SEC_STEP_KM };
  const path = sectionPath(spec, SEC_BOX, SEC_PROJ);
  if (path.pts.length < 2) { curtain.object.visible = levelLines.object.visible = false; return; }
  const slabs = slabPaths(spec, SEC_BOX, SEC_PROJ, sec.thick, 5);
  const specKey = `${sec.mode}:${sec.pos}:${sec.turn}:${sec.thick}`;
  const { i0, i1, t } = timeline.segment();
  const lq = sec.lines === "none" ? null : sec.lines;
  const vA = sectionValues(leads[i0], sec.qty, path, slabs, specKey, true), vB = sectionValues(leads[i1], sec.qty, path, slabs, specKey, true);
  const lA = lq && sectionValues(leads[i0], lq, path, slabs, specKey), lB = lq && sectionValues(leads[i1], lq, path, slabs, specKey);
  if (!vA || !vB || (lq && (!lA || !lB))) return;          // still loading: updateSection runs again when it arrives
  curtain.setShape(path.pts, SEC_NZ, SEC_TOP_M);
  const slotKey = `${model}:${leads[i0]}:${leads[i1]}:${specKey}:${sec.qty}:${sec.lines}:${curtain.shape}:${diff3d(sec.qty)}`;
  if (slotKey !== secSlotKey) {
    curtain.setSlot("A", vA, lA); curtain.setSlot("B", vB, lB);
    curtain.setScale(secScale(sec.qty), SCALES[secScale(sec.qty)]);
    curtain.uniforms.showLines.value = !!lq;
    curtain.uniforms.lInterval.value = lq === "speed" ? 20 : 4;
    secSlotKey = slotKey;
  }
  curtain.uniforms.t.value = t;
  curtain.object.visible = true;
  // Level lines: rebuilt when the steps, the slice, the focus or a level colour change.
  const lkey = `${slotKey}:${show.focus}:${manifest.levels.map((p) => levelColor(`p${p}`)).join("")}`;
  if (sec.levels && levelLines.key !== lkey) {
    const dA = sectionData(model, leads[i0]), dB = sectionData(model, leads[i1]);
    if (dA && dB) {
      const hA = levelHeights(path, dA, manifest.grid), hB = levelHeights(path, dB, manifest.grid);
      levelLines.build(lkey, path.pts, manifest.levels.map((p) => ({ p, color: levelColor(`p${p}`), width: `p${p}` === show.focus ? 2.6 : 1.4, hA: hA[p], hB: hB[p] })));
      secLevelH = { hA, hB };
    }
  }
  levelLines.setT(t);
  levelLines.object.visible = sec.levels && !!secLevelH;
  secState = { path, slabs, specKey };
  drawChart();
  const had = !!secPath;
  secPath = path;
  if (!had) { updateLegend(); updateHud(); }
  dirty = true;
}
// ---- the volume ---------------------------------------------------------------------------
// Every column filled between the real levels (volume.js) above a threshold,
// for the two real steps around the time shown, blended; optionally only in a
// window around the slice. Cached per step, quantity and threshold.
const VOL_MAX = { speed: 180, rh: 100, tanom: 12, ghanom: 300, w: 50, temp: 40, theta: 370, vort: 20, div: 10, ti: 20, stab: 20, ri: -1, thetae: 365, grad: 5, fgen: 3 };   // ri: the far LOW end (BELOW)
// Anomaly volumes: each level's climatology for the step (reanClim, blended
// between the 6-hourly slots like the fills); null (and loading) until in.
function levelClim(lead) {
  const { s0, s1, w } = climSlots(lead), out = {};
  for (const slot of new Set([s0, s1])) if (!loader.ready("clim", slot, "rean")) { whenLoaded("clim", slot, "rean", "volume", updateVolume); return null; }
  for (const p of manifest.levels) {
    const t0 = reanClim(s0, `t${p}`), t1 = reanClim(s1, `t${p}`), g0 = reanClim(s0, `gh${p}`), g1 = reanClim(s1, `gh${p}`);
    if (!t0 || !t1 || !g0 || !g1) return null;
    const t = new Float32Array(t0.length), gh = new Float32Array(g0.length);
    for (let k = 0; k < t.length; k++) { t[k] = t0[k] + (t1[k] - t0[k]) * w; gh[k] = g0[k] + (g1[k] - g0[k]) * w; }
    out[p] = { t, gh };
  }
  return out;
}
const volCache = new Map();
function volumeBytes(lead) {
  const dq = diff3d(vol.qty), signed = dq || SIGNED.has(vol.qty), vmax = dq ? D3_RANGE[vol.qty] : VOL_MAX[vol.qty];
  const key = `${model}:${lead}:${vol.qty}${dq ? ":d" : ""}${signed ? "" : `:${vol.thr}`}`;     // signed: the threshold is applied when drawing
  if (volCache.has(key)) return volCache.get(key);
  // The step's levels with the derived quantities (vorticity, divergence, turbulence, stability), or their GFS − ECMWF difference.
  const base = dq ? diffData(lead, vol.qty) : sectionData(model, lead);
  if (!base) {
    for (const m of dq ? ["gfs", "ecmwf"] : [model]) for (const b of ["sfc", ...manifest.levels.map((p) => `p${p}`)]) if (!loader.ready(m, lead, b)) whenLoaded(m, lead, b, "volume", updateVolume);
    return null;
  }
  const data = { ...base };
  if (vol.qty === "tanom" || vol.qty === "ghanom") { data.clim = levelClim(lead); if (!data.clim) return null; }
  const b = buildVolumeBytes(data, manifest.grid, dq ? "dq" : vol.qty, vol.thr, vmax, { nz: VOL_NZ, zTopM: VOL_TOP_M });
  volCache.set(key, b);
  if (volCache.size > 8) volCache.delete(volCache.keys().next().value);
  return b;
}
function updateVolume() {
  const was = volume.object.visible;
  if (!vol.on || timeline.beforeModel || timeline.afterModel) { volume.object.visible = false; if (was) { updateLegend(); updateHud(); } dirty = true; return; }
  const { i0, i1, t } = timeline.segment();
  const a = volumeBytes(leads[i0]), b = volumeBytes(leads[i1]);
  if (!a || !b) return;                                   // loading: runs again when the data arrives
  const dq = diff3d(vol.qty), signed = dq || SIGNED.has(vol.qty), vmax = dq ? D3_RANGE[vol.qty] : VOL_MAX[vol.qty];
  const key = `${model}:${leads[i0]}:${leads[i1]}:${vol.qty}:${vol.thr}:${dq}`;
  if (key !== volKey) {
    volume.setSlot("A", a); volume.setSlot("B", b);
    const sk = dq ? diffScale(volumeScaleKey(), vmax, { band: false }) : volumeScaleKey();
    volume.setScale(sk, SCALES[sk], vol.thr, vmax);
    volume.setSigned(signed, vol.thr, vmax);
    volume.shared.even.value = vol.mode === "all" && !signed;      // everywhere: the same see-through throughout
    volShare = filledShare(t < 0.5 ? a : b, signed ? { thr: vol.thr, vmax } : null);
    volKey = key;
  }
  volume.shared.t.value = t;
  volume.shared.opacity.value = vol.opacity;
  // Only inside the region: a wall's band (Mercator km across its line) and its heights.
  const f = roiFrame();
  volume.shared.windowOn.value = !!f;
  if (f) {
    volume.shared.winP.value.set(f.p0[0], f.p0[1]); volume.shared.winD.value.set(f.d[0], f.d[1]);
    volume.shared.winHalf.value = f.half; volume.shared.winLen.value = f.len;
  }
  volume.setHeightClip(...regionHeights(roi));
  volume.object.visible = true;
  if (!was) { updateLegend(); updateHud(); }
  dirty = true;
}
// The fill's settings per quantity: slider [min, max, step], the default
// threshold for a shape, units for the readout. "Everywhere" puts the
// threshold at the slider's minimum (0 for signed quantities: all of it).
const VOL_Q = {
  speed: [0, 150, 5, 70, "kt"], rh: [0, 100, 5, 80, "%"], tanom: [0, 10, 0.5, 3, "°C"], ghanom: [0, 300, 10, 100, "m"],
  w: [0, 40, 1, 8, "cm/s"], temp: [-70, 30, 1, -70, "°C"], theta: [270, 360, 2, 270, "K"],
  vort: [0, 20, 1, 8, "×10⁻⁵/s"], div: [0, 10, 0.5, 4, "×10⁻⁵/s"], ti: [0, 20, 0.5, 8, ""], stab: [0, 20, 0.5, 8, "K/km"], ri: [0, 3, 0.05, 1, ""],
  thetae: [280, 360, 2, 330, "K"], grad: [0, 5, 0.1, 1.2, "K/100 km"], fgen: [0, 3, 0.1, 1, "K/100 km/3 h"],
};
function volumeScaleKey() { return { rh: "sec_rh", speed: "sec_speed", tanom: "vol_tanom", ghanom: "vol_ghanom", w: "vol_w", temp: "sec_temp", theta: "sec_theta", vort: "vol_vort", div: "vol_div", ti: "sec_ti", stab: "sec_stab", ri: "sec_ri", thetae: "sec_thetae", grad: "sec_grad", fgen: "vol_fgen" }[vol.qty]; }
function volumeLabel() {
  const t = vol.thr, all = vol.mode === "all";
  if (diff3d(vol.qty)) return `GFS minus ECMWF, ${(RQ_SHORT[vol.qty] ?? vol.qty).replace(/ \(.*\)$/, "")}${all ? " everywhere" : `, where they differ by ${t} ${VOL_Q[vol.qty][4]} or more`} (red: GFS higher, blue: ECMWF higher)`;
  return { rh: all ? "humidity everywhere" : `moist air, RH ≥ ${t} %`, speed: all ? "wind speed everywhere" : `fast wind, ≥ ${t} kt`,
    tanom: `air ${t} °C or more warmer (red) or colder (blue) than the 1991–2020 normal`,
    ghanom: `levels ${t} m or more higher (red) or lower (blue) than the 1991–2020 normal`,
    w: all ? "rising (blue) and sinking (brown) air everywhere" : `air rising (blue) or sinking (brown) at ${t} cm/s or more (${Math.round(t * 36)} m an hour)`,
    temp: all ? "temperature everywhere (see-through)" : `air ${t} °C or warmer`,
    theta: all ? "potential temperature θ everywhere (see-through)" : `θ ${t} K or more`,
    vort: all ? "vorticity everywhere (red cyclonic, blue anticyclonic)" : `spin beyond ±${t}×10⁻⁵/s (red cyclonic, blue anticyclonic)`,
    div: all ? "divergence everywhere (red spreading, blue converging)" : `spreading (red) or converging (blue) beyond ±${t}×10⁻⁵/s`,
    ti: all ? "turbulence index everywhere" : `turbulence index ≥ ${t} (8 moderate, 12 severe)`,
    stab: all ? "stability everywhere" : `stability ≥ ${t} K/km (stable layers, inversions, the stratosphere)`,
    ri: all ? "Richardson number everywhere (yellow–orange turbulent, blue smooth)" : `layers with a Richardson number ≤ ${t} (the likeliest to be turbulent at the model's level spacing)`,
    thetae: all ? "θe everywhere (see-through)" : `air with θe ≥ ${t} K (warm, moist air)`,
    grad: all ? "thermal gradient everywhere" : `front zones: |∇θ| ≥ ${t} K per 100 km`,
    fgen: all ? "frontogenesis everywhere (red sharpening, blue weakening)" : `fronts sharpening (red) or weakening (blue) beyond ±${t} K/100 km/3 h` }[vol.qty];
}
function syncVolumeControls() {
  const th = $("volThr"), dq = diff3d(vol.qty), r = D3_RANGE[vol.qty];
  // A difference: its own slider, 0 to its range (a shape shows where the models differ by at least this much).
  const R = dq ? [0, r, r / 20, r / 2, VOL_Q[vol.qty][4]] : VOL_Q[vol.qty], signed = dq || SIGNED.has(vol.qty);
  [th.min, th.max, th.step] = R.slice(0, 3).map(String);
  if (vol.mode === "all") vol.thr = signed ? 0 : BELOW.has(vol.qty) && !dq ? R[1] : R[0];
  if (dq && !(vol.thr >= 0 && vol.thr <= r)) vol.thr = vol.mode === "all" ? 0 : R[3];       // e.g. temperature's own default (−70 °C) isn't a difference
  th.value = String(vol.thr);
  th.closest("label").hidden = vol.mode === "all";
  $("volThrVal").textContent = `${signed ? "±" : ""}${vol.thr} ${R[4]}`;
  $("volMode").value = vol.mode;
  $("volBody").hidden = !vol.on;
}
function volumeChanged() { syncBackground(); syncVolumeControls(); volKey = null; updateVolume(); updateLegend(); updateHud(); if (typeof applyRoiFade === "function") applyRoiFade(); }
$("volToggle").addEventListener("change", (e) => { vol.on = e.target.checked; volumeChanged(); });
$("volMode").addEventListener("change", (e) => { vol.mode = e.target.value; if (vol.mode === "shape") vol.thr = diff3d(vol.qty) ? D3_RANGE[vol.qty] / 2 : VOL_Q[vol.qty][3]; volumeChanged(); });
$("volThr").addEventListener("input", (e) => { vol.thr = Number(e.target.value); volumeChanged(); });
$("volOpacity").addEventListener("input", (e) => { vol.opacity = Number(e.target.value); updateVolume(); });
syncVolumeControls();

// ---- OPC charts ----------------------------------------------------------------------------
function updateOpc() {
  if (!opcLayer) return;
  const c = opcProduct ? opcChartAt(OPC.charts, opcProduct, timeline.pos, manifest.anchor) : null;
  if (c !== opcShown) {
    const was = !!opcShown;
    opcShown = c;
    if (was !== !!c) opcCompare();
    updateHud();
  }
  if (!c) { opcLayer.hide(); dirty = true; return; }
  opcLayer.show(`${DATA}/${c.file}${buildVersion(manifest)}`, () => { opcLayer.mesh.visible = !!opcShown && !opcBlink; dirty = true; }, c.box ?? OPC.box, c.rect, c.rect ? [c.width_px, c.height_px] : null);
  if (opcBlink) opcLayer.hide();
  dirty = true;
}
// While an OPC chart is on the map: the OPC box steps aside (the chart has
// its own edges) and the model's contour lines turn magenta, so the model's
// and OPC's isobars don't overlap in the same colour (user report,
// 2026-09-28: "strange lines"). Our lat/lon lines stay: hiding them too left
// only OPC's faint 5-degree grid, and the map lost its bearings (user report,
// same day); they fall on OPC's own lines to within a pixel.
function opcCompare() {
  if (opcOutline) opcOutline.object.visible = $("opcToggle").checked && !opcShown;
  ground.uniforms.seaTint.value = opcShown && $("opcPaper").checked ? 1 : 0;
  document.body.classList.toggle("opc-on", !!opcShown);
  for (const L of Object.values(layers)) L.gl.uniforms.lineColor.value.set(opcShown ? OPC_CMP_COLOR : levelColor(L.def.key));
  dirty = true;
}
function setOpcProduct(p) {
  opcProduct = p;
  $("opcSel").value = p;
  drawMarkers(); updateOpc(); updateHud();
}
function opcJump(dir) {
  if (!opcProduct) setOpcProduct("surface_analysis");
  const h = opcNeighbour(OPC.charts, opcProduct, timeline.pos, manifest.anchor, dir);
  if (h == null) return;
  openNote = null; setPlaying(false);
  timeline.pos = timeline.clamp(h); requestAround(); applyTime();
}
if (OPC) {
  $("opcNav").hidden = false; $("opcGroup").hidden = false;
  // The menu lists every product this build has, office named in each label.
  $("opcSel").innerHTML = `<option value="">Chart: off</option>` + Object.entries(OPC_PRODUCTS)
    .filter(([k]) => OPC.charts.some((c) => c.product === k))
    .map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");
  $("opcSel").addEventListener("change", (e) => setOpcProduct(e.target.value));
  $("opcPrev").addEventListener("click", () => opcJump(-1));
  $("opcNext").addEventListener("click", () => opcJump(1));
  $("opcOpacity").addEventListener("input", (e) => { opcLayer.uniforms.opacity.value = Number(e.target.value); dirty = true; });
  $("opcPaper").addEventListener("change", (e) => { opcLayer.setPaper(e.target.checked); opcCompare(); });
  const tag = (iso) => `${iso.slice(8, 10)}/${iso.slice(11, 13)}Z`;
  const have = Object.entries(OPC_PRODUCTS).map(([k, v]) => {
    const cs = OPC.charts.filter((c) => c.product === k).sort((a, b) => Date.parse(a.valid) - Date.parse(b.valid));
    return cs.length ? `${v.label}: ${cs.map((c) => tag(c.valid)).join(", ")}` : null;
  }).filter(Boolean);
  const miss = OPC.missing.map((m) => `${OPC_LABEL[m.product] ?? m.product} ${m.lead_h != null ? `${m.lead_h} h` : m.file} (${m.reason})`);
  $("opcNote").textContent = `Charts this build (valid times): ${have.join("; ")}.`
    + (miss.length ? ` Not available: ${miss.join("; ")} — they'll appear when published.` : "")
    + " Each is shown within 1.5 h of its valid time (read off the chart itself). C blinks the chart.";
}

// Axis labels on the slice: km up its first column, position along its foot.
function sliceItems(W, H) {
  if (!sec.on || !secPath || !curtain.object.visible) return [];
  const vex = Math.pow(10, Number($("vexSlider").value)), v = new THREE.Vector3(), out = [];
  const at = (pt, zKm) => { v.copy(geo.point(pt.lat, pt.lon, zKm * vex)).project(camera); return v.z > 1 || v.z < -1 ? null : { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H }; };
  const p0 = secPath.pts[0];
  const topM = hUnit === "ft" ? 40000 / FT_PER_M : 12000;
  for (const tk of heightTicks(topM, hUnit, 1e9).filter((tk, i) => i > 0 && i % 2 === 0)) {
    const s = at(p0, tk.m / 1000); if (s) out.push({ x: s.x - 4, y: s.y, text: tk.label, cls: "gl-km", align: "right" });
  }
  let last = null;
  for (const pt of secPath.pts) {
    const val = sec.mode === "ns" ? pt.lat : pt.lon, tick = Math.round(val / 10) * 10;
    if (Math.abs(val - tick) > 0.25 || tick === last) continue;
    last = tick;
    const s = at(pt, 0);
    if (s) out.push({ x: s.x, y: s.y, dy: 4, text: sec.mode === "ns" ? fmtLat(tick).replace(".0", "") : fmtLon(tick).replace(".0", ""), cls: "gl-km", align: "center" });
  }
  // Each level's name at the far end of its line (its last point above ground), as the height blends.
  if (sec.levels && secLevelH && levelLines.object.visible) {
    const t = levelLines.ink.material.uniforms.t.value, n = secPath.pts.length;
    for (const p of manifest.levels) {
      const A = secLevelH.hA[p], B = secLevelH.hB[p];
      if (!A || A.length !== n) continue;
      let i = n - 1;
      while (i >= 0 && !(Number.isFinite(A[i]) && Number.isFinite(B[i]))) i--;
      if (i < 0) continue;
      const s = at(secPath.pts[i], (A[i] + (B[i] - A[i]) * t) / 1000);
      if (s) out.push({ x: s.x + 6, y: s.y, text: `${p} mb`, cls: "gl-km", align: "left" });
    }
  }
  return out;
}
// The flat chart: the NEARER real step (not a blend), height up in the chosen
// unit, the slice's position across, each level's name at its mean height
// along the slice on the right.
const SEC_LABEL = { across: "wind across the slice", speed: "wind speed", theta: "θ", temp: "temperature", rh: "RH", along: "wind along the slice", w: "vertical motion (+ rising)" };
function drawChart() {
  const box = $("secChart");
  setTb();                         // the time bar's height, in case it changed unobserved (see setTb)
  box.classList.toggle("map", hp.on);
  if (hp.on) { drawHChart(); return; }
  box.hidden = !(sec.on && secChartOn && secState && curtain.object.visible);
  if (box.hidden) return;
  const cv = $("secChartCanvas"), dpr = Math.min(2, devicePixelRatio || 1);
  const W = cv.clientWidth, H = cv.clientHeight, lead = nearerLead();
  const key = `${secSlotKey}:${lead}:${hUnit}:${W}x${H}:${sec.arrows}:${sec.levels}:${show.focus}`;
  if (key === secChartKey) return;
  const { path, slabs, specKey } = secState;
  const values = sectionValues(lead, sec.qty, path, slabs, specKey, true);
  const lq = sec.lines === "none" ? null : sec.lines;
  const lines = lq ? sectionValues(lead, lq, path, slabs, specKey) : null;
  if (!values || (lq && !lines)) return;
  // Arrows: along-slice wind (kt -> m/s) and vertical motion, same grid.
  let arrows = null;
  if (sec.arrows && HAS_W) {
    const al = sectionValues(lead, "along", path, slabs, specKey), wv = sectionValues(lead, "w", path, slabs, specKey);
    if (!al || !wv) return;
    arrows = { along: al.map((x) => x / KT), w: wv, stepKm: SEC_STEP_KM };
  }
  secChartKey = key;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sc = SCALES[secScale(sec.qty)];
  const data = sectionData(model, lead);
  // Each pressure level's real height along the slice (user request: "the
  // contour of the atmosphere" on the slice), in its level colour, the focus
  // level bold; broken where the level lies below ground (surface pressure
  // lower than the level's). Labelled at its mean height on the right.
  const heights = data && sec.levels ? levelHeights(path, data, manifest.grid) : null;
  const levels = heights ? manifest.levels.map((p) => {
    const h = [...heights[p]], ok = h.filter(Number.isFinite);
    const key = `p${p}`;
    return { name: `${p} mb`, m: ok.length ? ok.reduce((x, y) => x + y, 0) / ok.length : NaN, h, color: levelColor(key), focus: key === show.focus };
  }) : [];
  let last = null;
  const xLabel = (ix) => {
    const pt = path.pts[ix], val = sec.mode === "ns" ? pt.lat : pt.lon, tick = Math.round(val / 10) * 10;
    if (Math.abs(val - tick) > 0.3 || tick === last) return null;
    last = tick;
    return (sec.mode === "ns" ? fmtLat(tick) : fmtLon(tick)).replace(".0", "");
  };
  const ph = H - 40;
  const title = `${SEC_LABEL[sec.qty]} (${sc.units})${lq ? ` · lines: ${lq === "theta" ? "θ every 4 K" : "wind every 20 kt"}` : ""}${arrows ? " · arrows: air motion in the slice" : ""} · ${sourceText(lead)}, nearest real step`;
  const r = drawSliceChart(ctx, W, H, { values, lines, arrows, nx: path.pts.length, nz: SEC_NZ, zTopM: SEC_TOP_M, lineInterval: lq === "speed" ? 20 : 4,
    lut: lut(sc.stops, sc.min, sc.max), min: sc.min, max: sc.max, xLabel, yTicks: heightTicks(SEC_TOP_M, hUnit, ph / SEC_TOP_M, 18), levels, title });
  $("secChartInfo").textContent = `Slice ${sec.mode === "ns" ? `along ${fmtLon(sec.pos)}` : `along ${fmtLat(sec.pos)}`}${sec.turn ? `, turned ${sec.turn}°` : ""}${sec.thick ? `, ${sec.thick} km slab` : ""} — between grid points and levels interpolated${r.stretch ? `; height stretched ×${Math.round(r.stretch)} here, and the arrows with it, so they slope as the air moves across this picture` : ""}`;
  cv.onmousemove = (e) => {
    const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top, P = r.plot;
    if (x < P.x || x > P.x + P.w || y < P.y || y > P.y + P.h) { $("secChartHover").textContent = ""; return; }
    const ix = Math.min(path.pts.length - 1, Math.floor(((x - P.x) / P.w) * path.pts.length));
    const iz = Math.min(SEC_NZ - 1, Math.floor(((P.y + P.h - y) / P.h) * SEC_NZ));
    const v = values[iz * path.pts.length + ix], pt = path.pts[ix], zm = ((iz + 0.5) / SEC_NZ) * SEC_TOP_M;
    $("secChartHover").textContent = `${fmtLat(pt.lat)} ${fmtLon(pt.lon)} · ${fmtHeight(zm, hUnit)} · ${Number.isFinite(v) ? `${v.toFixed(sec.qty === "theta" || sec.qty === "temp" ? 1 : 0)} ${sc.units}` : "no data here"}`;
  };
}
$("secChartToggle").addEventListener("change", (e) => { secChartOn = e.target.checked; secChartKey = null; drawChart(); });
$("secChartClose").addEventListener("click", () => { secChartOn = false; $("secChartToggle").checked = false; drawChart(); });
new ResizeObserver(() => { secChartKey = null; drawChart(); }).observe($("secChart"));

function syncSliceControls() {
  const [lo, hi] = secRange();
  const pos = $("secPos");
  pos.min = String(lo); pos.max = String(hi);
  sec.pos = Math.min(hi, Math.max(lo, sec.pos));
  pos.value = String(sec.pos);
  $("secPosVal").textContent = sec.mode === "ns" ? fmtLon(sec.pos) : fmtLat(sec.pos);
  $("secTurnVal").textContent = `${sec.turn}°`;
  $("secBody").hidden = !sec.on;
}
function sliceChanged() {
  syncSliceControls(); secSlotKey = null; updateSection();
  if (roi.shape === "wall") { p3Changed(); updateVolume(); $("roiNote").textContent = roiText(); }     // the wall moved: everything in it follows
  applyRoiFade();
  updateHud(); updateLegend();
}
$("secToggle").addEventListener("change", (e) => { roi.plane = e.target.checked; if (!roi.plane) stopSweep(); roiChanged(); });
$("secMode").addEventListener("change", (e) => { sec.mode = e.target.value; sec.pos = sec.mode === "ns" ? 180 : 40; sliceChanged(); });
$("secPos").addEventListener("input", (e) => { sec.pos = Number(e.target.value); sliceChanged(); });
$("secTurn").addEventListener("input", (e) => { sec.turn = Number(e.target.value); sliceChanged(); });
$("secThick").addEventListener("change", (e) => { sec.thick = Number(e.target.value); sliceChanged(); });

$("secLines").addEventListener("change", (e) => { sec.lines = e.target.value; sliceChanged(); });
$("secArrows").addEventListener("change", (e) => { sec.arrows = e.target.checked; secChartKey = null; sliceChanged(); });
$("secLevels").addEventListener("change", (e) => { sec.levels = e.target.checked; levelLines.key = null; secChartKey = null; sliceChanged(); });
const stepSlice = (d) => { sec.pos += d; sliceChanged(); };
$("secPrev").addEventListener("click", () => stepSlice(-2));
$("secNext").addEventListener("click", () => stepSlice(2));
function stopSweep() { if (secSweep) { clearInterval(secSweep); secSweep = null; $("secSweep").textContent = "▶ sweep"; } }
$("secSweep").addEventListener("click", () => {
  if (secSweep) { stopSweep(); return; }
  const [lo, hi] = secRange();
  if (sec.pos >= hi - 0.5) sec.pos = lo;
  $("secSweep").textContent = "❚❚ stop";
  secSweep = setInterval(() => { if (sec.pos >= hi) { stopSweep(); return; } stepSlice(0.5); }, 80);
});
$("secSquare").addEventListener("click", () => { sec.turn = 0; const [lo, hi] = secRange(); sec.pos = (lo + hi) / 2; $("secTurn").value = "0"; sliceChanged(); });
// ---- views of the region (Phase 4) ---------------------------------------------------
// The camera flies to a view of the region on the flat map, then orbits
// around the region's centre: face it, edge-on, orbit it, from the surface
// looking up, or inside it at its middle height. Looking up from below (and
// level from inside) needs the camera below its target, which the map view
// doesn't normally allow; those views lift that limit, and a guard keeps the
// camera above the ground. The map views (View row) put the limit back.
const FLAT_MAX_POLAR = Math.PI / 2 - 0.02;
let roiLookUp = false;
function regionGeometry() {
  const vex = Math.pow(10, Number($("vexSlider").value)), [lo, hi] = regionHeights(roi);
  const zMid = ((lo + hi) / 2) * vex, zLo = lo * vex, zHi = hi * vex;
  if (roi.shape === "wall") {
    const path = sectionPath({ mode: sec.mode, pos: sec.pos, turn: sec.turn, stepKm: SEC_STEP_KM }, SEC_BOX, SEC_PROJ);
    if (path.pts.length >= 2) {
      const a = path.pts[0], b = path.pts.at(-1);
      const pa = geo.point(a.lat, a.lon, 0, 0, 0, 0), pb = geo.point(b.lat, b.lon, 0, 0, 0, 0);
      const along = pb.clone().sub(pa); along.z = 0; const len = along.length(); along.normalize();
      return { wall: true, pa, pb, along, normal: new THREE.Vector3(along.y, -along.x, 0), len, centre: pa.clone().add(pb).multiplyScalar(0.5), zMid, zLo, zHi };
    }
  }
  // A layer spans the map; a box its own edges (centred on its middle on the map).
  const B = roi.shape === "box" ? { latMin: roi.box.latS, latMax: roi.box.latN, lonMin: roi.box.lonW, lonMax: roi.box.lonE } : SEC_BOX;
  const lonC = (B.lonMin + B.lonMax) / 2;
  const sw = geo.point(B.latMin, B.lonMin, 0, 0, 0, 0), ne = geo.point(B.latMax, B.lonMax, 0, 0, 0, 0);
  const centre = sw.clone().add(ne).multiplyScalar(0.5); centre.z = 0;
  const latC = inverseMercatorKm(...mercatorKm(B.latMin, lonC).map((x, i) => (x + mercatorKm(B.latMax, lonC)[i]) / 2))[0];
  const W = geo.point(latC, B.lonMax, 0, 0, 0, 0).distanceTo(geo.point(latC, B.lonMin, 0, 0, 0, 0));
  const H = Math.abs(ne.y - sw.y);
  return { wall: false, box: roi.shape === "box", sw, ne, centre, W, H, zMid, zLo, zHi };
}
const atZ = (v, z) => { const p = v.clone(); p.z = z; return p; };
function regionView(kind) {
  const g = regionGeometry();
  setControlMode(false);
  geo.uniforms.morph.value = 0; backdrop.visible = false; morphAnim = null;
  roiLookUp = kind === "below" || kind === "inside" || kind === "edge";
  controls.maxPolarAngle = roiLookUp ? Math.PI - 0.1 : FLAT_MAX_POLAR;
  const fit = (span) => (span / 2) / Math.tan((22.5 * Math.PI) / 180) * 1.15 / Math.max(0.6, Math.min(1, camera.aspect));
  let pos, target, fov = 45;
  if (g.wall) {
    const mid = atZ(g.centre, g.zMid);
    if (kind === "above") { target = mid; pos = atZ(g.centre.clone().addScaledVector(g.normal, -1), g.zMid + fit(g.len)); }
    else if (kind === "face") { const d = fit(g.len); target = mid; pos = mid.clone().addScaledVector(g.normal, d); pos.z += d * 0.08; }
    else if (kind === "edge") { target = atZ(g.pb, g.zMid); pos = atZ(g.pa, g.zMid).addScaledVector(g.along, -0.2 * g.len); pos.z += 0.02 * g.len; }
    else if (kind === "orbit") { target = mid; pos = mid.clone().add(camera.position.clone().sub(controls.target).normalize().multiplyScalar(fit(g.len) * 0.9)); }
    else if (kind === "below") { target = atZ(g.centre.clone().addScaledVector(g.along, 0.04 * g.len), g.zMid + 0.5 * (g.zHi - g.zMid)); pos = atZ(g.centre.clone().addScaledVector(g.normal, 0.02 * g.len), 20); fov = 70; }
    else { pos = atZ(g.pa.clone().addScaledVector(g.along, 0.08 * g.len), g.zMid); target = atZ(g.pa.clone().addScaledVector(g.along, 0.45 * g.len), g.zMid); fov = 70; }
  } else {
    const mid = atZ(g.centre, g.zMid), north = new THREE.Vector3(0, 1, 0);
    if (kind === "above") {
      // straight down (a hair south of vertical, so north stays up), far enough to fit its width and height
      const t = Math.tan((22.5 * Math.PI) / 180), d = (Math.max(g.H, g.W / Math.max(0.3, camera.aspect)) / 2 / t) * 1.1;
      target = mid; pos = atZ(g.centre.clone().addScaledVector(north, -1), g.zHi + d);
    }
    else if (kind === "face") { target = mid; pos = mid.clone().addScaledVector(north, -0.55 * g.H); pos.z = g.zMid + 0.85 * g.H; }
    else if (kind === "edge") { target = mid; pos = mid.clone().addScaledVector(north, -0.95 * g.H); pos.z = g.zMid + 0.01 * g.H; }
    else if (kind === "orbit") { target = mid; pos = mid.clone().add(camera.position.clone().sub(controls.target).normalize().multiplyScalar(fit(Math.max(g.W, g.H)) * 0.9)); }
    else if (kind === "below") { pos = atZ(g.centre.clone().addScaledVector(north, -0.04 * g.H), 20); target = atZ(g.centre.clone().addScaledVector(north, 0.02 * g.H), g.zMid); fov = 70; }
    else { pos = atZ(g.centre.clone().addScaledVector(north, -0.3 * g.H), g.zMid); target = atZ(g.centre.clone().addScaledVector(north, 0.1 * g.H), g.zMid); fov = 70; }
  }
  if (pos.z < 8) pos.z = 8;
  flight = { from: { pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov }, to: { pos, target, fov }, t0: performance.now(), ms: 1300 };
  for (const x of document.querySelectorAll("[data-view]")) x.classList.remove("on");
  for (const x of document.querySelectorAll("[data-rview]")) x.classList.toggle("on", x.dataset.rview === kind);
  dirty = true;
}
for (const b of document.querySelectorAll("[data-rview]")) b.addEventListener("click", () => regionView(b.dataset.rview));
// Everything in the 3-D tab off at once, through each control's own handler, and the region back to the whole atmosphere.
$("d3Off").addEventListener("click", () => {
  for (const id of ["volToggle", "p3Toggle", "fl3Toggle", "secToggle"]) { const el = $(id); if (el.checked) { el.checked = false; el.dispatchEvent(new Event("change")); } }
  const sh = $("roiShape");
  if (sh.value !== "whole") { sh.value = "whole"; sh.dispatchEvent(new Event("change")); }
  for (const x of document.querySelectorAll("[data-rview]")) x.classList.remove("on");
  dirty = true;
});

// ---- dragging the region in the scene (Phase 5) ---------------------------------------
// Handles on the flat map: move (white, a wall's centre: slides it across the
// map), turn (yellow, a wall's end: rotates it), bottom and top (blue: the
// heights), plane (green: the horizontal plane's height). Spheres a fixed
// number of pixels across, drawn over everything. Grabbing one pauses the
// camera; the panel's sliders follow. Changes are applied once per frame.
const HANDLE_PX = 14;
const handles = {};
{
  const geom = new THREE.SphereGeometry(1, 16, 12);
  for (const [name, color] of [["move", 0xf8fafc], ["turn", 0xfacc15], ["sw", 0xfacc15], ["ne", 0xfacc15], ["bottom", 0x60a5fa], ["top", 0x60a5fa], ["plane", 0x34d399]]) {
    const m = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 }));
    m.renderOrder = 1000; m.visible = false; m.userData.handle = name;
    const ring = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: 0x0b0f14, depthTest: false, transparent: true, opacity: 0.8, side: THREE.BackSide }));
    ring.scale.setScalar(1.35); ring.renderOrder = 999; m.add(ring);
    scene.add(m); handles[name] = m;
  }
}
let roiHandlesOn = true, drag = null;
// Where each handle sits now (scene coordinates), or null when it isn't shown.
function handlePositions() {
  const out = {};
  if (!roiHandlesOn || arch.on || geo.uniforms.morph.value > 0.5) return out;
  const g = regionGeometry();
  if (roi.shape === "wall" && g.wall) {
    out.move = atZ(g.centre, g.zMid); out.turn = atZ(g.pb, g.zMid);
    // bottom and top on either side of the centre, so they don't overlap when seen from above
    out.bottom = atZ(g.centre.clone().addScaledVector(g.along, -0.06 * g.len), g.zLo); out.top = atZ(g.centre.clone().addScaledVector(g.along, 0.06 * g.len), g.zHi);
  } else if (roi.shape === "box") {
    // a box: move from its middle, resize from two opposite corners (south-west, north-east)
    out.move = atZ(g.centre, g.zMid); out.sw = atZ(g.sw, g.zMid); out.ne = atZ(g.ne, g.zMid);
    const off = new THREE.Vector3(0, 0.12 * g.H, 0);
    out.bottom = atZ(g.centre.clone().sub(off), g.zLo); out.top = atZ(g.centre.clone().add(off), g.zHi);
  } else if (roi.shape === "layer") {
    const off = new THREE.Vector3(0, 0.04 * (g.H ?? g.W ?? 1000), 0);
    out.bottom = atZ(g.centre.clone().sub(off), g.zLo); out.top = atZ(g.centre.clone().add(off), g.zHi);
  }
  if (hp.on) out.plane = atZ(g.wall ? g.centre : g.centre.clone().add(new THREE.Vector3(0.08 * (g.W ?? 1000), 0, 0)), hp.zKm * Math.pow(10, Number($("vexSlider").value)));
  return out;
}
// The region's outline (user request, 2026-09-29): its edges drawn in 3-D, a
// few pixels wide with a dark halo so they read on either background -- a
// box's or a wall's band's rectangle at the bottom and the top with the four
// corners joined, or a layer's two rectangles over the map. Edges are cut in
// pieces so they follow the curve on the globe.
function updateOutline() {
  const on = roi.outline && roi.shape !== "whole" && !arch.on;
  roiOutline.object.visible = on;
  if (!on) return;
  const [lo, hi] = regionHeights(roi), f = roiFrame();
  let corners;                                               // four corners in Mercator km, in order round the edge
  if (f) {
    const at = (s, o) => [f.p0[0] + f.d[0] * s + f.n[0] * o, f.p0[1] + f.d[1] * s + f.n[1] * o];
    corners = [at(0, -f.half), at(f.len, -f.half), at(f.len, f.half), at(0, f.half)];
  } else corners = [[SEC_BOX.latMin, SEC_BOX.lonMin], [SEC_BOX.latMin, SEC_BOX.lonMax], [SEC_BOX.latMax, SEC_BOX.lonMax], [SEC_BOX.latMax, SEC_BOX.lonMin]].map(([la, lo2]) => mercatorKm(la, lo2));
  const key = `${roi.shape}:${lo}:${hi}:${corners.flat().map((x) => x.toFixed(1)).join(",")}`;
  if (key !== roiOutline.key) {
    const pt = (xy, zKm) => { const [lat, lon] = inverseMercatorKm(xy[0], xy[1]); return { lon: lonOnMap(lon), lat, z: zKm * 1000, r: 0.96, g: 0.97, b: 0.98, a: 0.9 }; };
    const lines = [];
    for (const zKm of [lo, hi]) {
      const ring = [];
      for (let k = 0; k < 4; k++) {
        const a = corners[k], b = corners[(k + 1) % 4];
        for (let i = 0; i < 24; i++) ring.push(pt([a[0] + ((b[0] - a[0]) * i) / 24, a[1] + ((b[1] - a[1]) * i) / 24], zKm));
      }
      ring.push(ring[0]);
      lines.push(ring);
    }
    for (const c of corners) lines.push([pt(c, lo), pt(c, hi)]);
    roiOutline.build(key, lines);
  }
}
// Each frame: place the handles and keep them HANDLE_PX across on screen.
function placeHandles() {
  updateOutline();
  const pos = handlePositions(), H = root.clientHeight || 1, k = (2 * Math.tan((camera.fov * Math.PI) / 360)) / H;
  for (const [name, m] of Object.entries(handles)) {
    const p = pos[name];
    m.visible = !!p;
    if (!p) continue;
    m.position.copy(p);
    m.scale.setScalar((HANDLE_PX / 2) * k * camera.position.distanceTo(p));
  }
}
// The pointer's ray, and where it meets a horizontal plane at scene height z (lat/lon).
function pointerRay(e) {
  const r = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  return raycaster.ray;
}
function latLonAtHeight(ray, z) {
  const hit = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -z), new THREE.Vector3());
  if (!hit) return null;
  return geo.pick(new THREE.Ray(new THREE.Vector3(hit.x, hit.y, 1), new THREE.Vector3(0, 0, -1)))?.latlon ?? null;
}
// Longitudes on the map's 0-360 scale (the pick gives -180..180).
const lonOnMap = (lon) => (lon < SEC_BOX.lonMin ? lon + 360 : lon);
function applyDrag(e) {
  const ray = pointerRay(e), g = regionGeometry();
  if (roi.shape === "box" && (drag.name === "move" || drag.name === "sw" || drag.name === "ne")) {
    const ll = latLonAtHeight(ray, g.zMid);
    if (!ll) return;
    const lat = ll[0], lon = lonOnMap(ll[1]), b0 = drag.box0;
    if (drag.name === "move") {
      // the whole box by the pointer's shift since the grab, kept on the map at its size
      const h = b0.latN - b0.latS, w = b0.lonE - b0.lonW;
      const latS = Math.max(SEC_BOX.latMin, Math.min(SEC_BOX.latMax - h, b0.latS + lat - drag.ll0[0]));
      const lonW = Math.max(SEC_BOX.lonMin, Math.min(SEC_BOX.lonMax - w, b0.lonW + lon - drag.ll0[1]));
      const r = (x) => Math.round(x * 2) / 2;
      roi.box = { latS: r(latS), latN: r(latS) + h, lonW: r(lonW), lonE: r(lonW) + w };
      roiChanged();
    } else if (drag.name === "sw") setBox({ ...roi.box, latS: Math.min(lat, roi.box.latN - 2), lonW: Math.min(lon, roi.box.lonE - 2) });
    else setBox({ ...roi.box, latN: Math.max(lat, roi.box.latS + 2), lonE: Math.max(lon, roi.box.lonW + 2) });
    return;
  }
  if (drag.name === "move") {
    const ll = latLonAtHeight(ray, g.zMid);
    if (!ll) return;
    const [lo, hi] = secRange();
    let v = sec.mode === "ns" ? ll[1] : ll[0];
    if (sec.mode === "ns" && v < SEC_BOX.lonMin) v += 360;
    sec.pos = Math.round(Math.min(hi, Math.max(lo, v)) * 2) / 2;
    sliceChanged();
  } else if (drag.name === "turn") {
    const hit = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -g.zMid), new THREE.Vector3());
    if (!hit) return;
    const v = hit.sub(g.centre), ang = (Math.atan2(v.x, v.y) * 180) / Math.PI;
    let t = ang - (sec.mode === "ew" ? 90 : 0);
    t = ((t + 90) % 180 + 180) % 180 - 90;                   // a line: +-180 is the same wall
    sec.turn = Math.round(Math.max(-90, Math.min(90, t)));
    $("secTurn").value = String(sec.turn);
    sliceChanged();
  } else {
    // Heights: the pointer's vertical movement, at the pixels a km of height covers at the handle
    // (a fixed 20 px per km when looking straight down, where height has no direction on screen).
    const km = drag.km0 - (e.clientY - drag.y0) / drag.pxPerKm;
    const [lo, hi] = regionHeights(roi);
    if (drag.name === "bottom") { const nlo = Math.max(0, Math.min(hi - 0.25, km)); roi.zLo = Math.round(nlo * 4) / 4; roi.thick = hi - roi.zLo; roiChanged(); }
    else if (drag.name === "top") { roi.thick = Math.round(Math.max(0.25, Math.min(TOP_KM - lo, km - lo)) * 4) / 4; roiChanged(); }
    else { hp.zKm = Math.round(Math.max(lo, Math.min(hi, km)) * 20) / 20; syncHPlaneControls(); updateHPlane(); updateHud(); }
  }
}
// Grab: before the camera's own listeners (capture on the canvas's parent).
root.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || !Object.values(handles).some((m) => m.visible)) return;
  const ray = pointerRay(e);
  const hit = raycaster.intersectObjects(Object.values(handles).filter((m) => m.visible), false)[0];
  if (!hit) return;
  e.stopPropagation(); e.preventDefault();
  drag = { name: hit.object.userData.handle, p: hit.object.position.clone(), pending: null, y0: e.clientY };
  if (roi.shape === "box" && drag.name === "move") {
    const ll = latLonAtHeight(ray, regionGeometry().zMid);
    drag.ll0 = ll ? [ll[0], lonOnMap(ll[1])] : [0, 0]; drag.box0 = { ...roi.box };
  }
  if (["bottom", "top", "plane"].includes(drag.name)) {
    const vex = Math.pow(10, Number($("vexSlider").value)), r = renderer.domElement.getBoundingClientRect();
    const a = drag.p.clone().project(camera), b = drag.p.clone().add(new THREE.Vector3(0, 0, vex)).project(camera);
    drag.pxPerKm = Math.max(20, ((b.y - a.y) / 2) * r.height);
    const [lo, hi] = regionHeights(roi);
    drag.km0 = drag.name === "bottom" ? lo : drag.name === "top" ? hi : hp.zKm;
  }
  controls.enabled = false;
  renderer.domElement.style.cursor = "grabbing";
}, { capture: true });
window.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const first = !drag.pending;
  drag.pending = e;
  if (first) requestAnimationFrame(() => { if (drag?.pending) { applyDrag(drag.pending); drag.pending = null; dirty = true; } });
});
window.addEventListener("pointerup", (e) => {
  if (!drag) return;
  if (drag.pending) applyDrag(drag.pending);
  drag = null; controls.enabled = true; renderer.domElement.style.cursor = "";
  custom(); dirty = true;
  e.stopPropagation();
}, { capture: true });
$("roiHandles").addEventListener("change", (e) => { roiHandlesOn = e.target.checked; dirty = true; });
syncSliceControls();

// Height unit switch (Map tab select, the column's "height" header, key U).
function setHeightUnit(u) {
  hUnit = u;
  $("hUnit").value = u;
  try { localStorage.setItem("np3d.hunit", u); } catch { /* ignore */ }
  renderColumn(); probeKey = null; updateProbe(); if (hover) updateReadout();
  secChartKey = null; drawChart();
  dirty = true;
}
$("hUnit").value = hUnit;
$("hUnit").addEventListener("change", (e) => setHeightUnit(e.target.value));
$("column").querySelector("thead").addEventListener("click", (e) => { if (e.target.closest("th")?.dataset.unit != null) setHeightUnit(hUnit === "km" ? "ft" : "km"); });

// ---- share: tours and export -------------------------------------------------------------
// Tours (tour.js): camera stops flown in order. Export (exporter.js): a
// picture, an animation over time, or a tour flight, composited from the 3-D
// render, the labels, the time/run, the colour keys and the credits -- never
// the controls. Frames are rendered here one by one (not screen-captured), so
// it works with the page in the background too.
const tour = new Tour("np3d.tour");
const vexNow = () => Math.pow(10, Number($("vexSlider").value));
function tourText() { $("tourCount").textContent = tour.stops.length ? `${tour.stops.length} stop(s).` : "No stops yet: set up a view, then + Stop."; }
tourText();
$("tourAdd").addEventListener("click", () => {
  tour.add({ pos: camera.position.toArray(), target: controls.target.toArray(), fov: camera.fov, vex: vexNow(), morph: geo.uniforms.morph.value });
  tourText();
});
$("tourClear").addEventListener("click", () => { tour.clear(); tourText(); });
function setTourCamera(fr) {
  const A = tour.scaled(tour.stops[fr.a], vexNow()), B = tour.scaled(tour.stops[fr.b], vexNow()), k = fr.k;
  const lerp = (x, y) => x.map((v, i) => v + (y[i] - v) * k);
  const morph = (A.morph ?? 0) + ((B.morph ?? 0) - (A.morph ?? 0)) * k;
  setControlMode(morph > 0.5);
  geo.uniforms.morph.value = morph; backdrop.visible = morph > 0.02; backdrop.material.uniforms.opacity.value = morph;
  camera.position.fromArray(lerp(A.pos, B.pos)); controls.target.fromArray(lerp(A.target, B.target));
  camera.fov = (A.fov ?? 45) + ((B.fov ?? 45) - (A.fov ?? 45)) * k; camera.updateProjectionMatrix();
  camera.lookAt(controls.target); dirty = true;
}
$("tourPlay").addEventListener("click", async () => {
  if (tour.playing) { tour.playing = false; return; }
  if (tour.stops.length < 2) { $("tourCount").textContent = "Add at least two stops."; return; }
  tour.playing = true; $("tourPlay").textContent = "❚❚ Stop";
  const frames = tour.frames(30);
  for (const fr of frames) { if (!tour.playing) break; setTourCamera(fr); await new Promise((r) => setTimeout(r, 1000 / 30)); }
  tour.playing = false; $("tourPlay").textContent = "▶ Play"; controls.update();
});

// Everything a frame needs, loaded: the visible layers' bundles at both steps
// around `pos`, the slice's levels, and the satellite frames.
async function ensureLoaded(pos) {
  const { i0, i1 } = timeline.segment(pos), want = [];
  for (const i of [i0, i1]) for (const L of Object.values(layers)) if (L.visible) {
    for (const b of bundlesFor(L)) want.push(loader.load(model, leads[i], b));
    if (diffOn(L)) for (const b of bundlesFor(L, OTHER_MODEL[model])) want.push(loader.load(OTHER_MODEL[model], leads[i], b));
    for (const [m, l, b] of climNeeds(L, leads[i])) want.push(loader.load(m, l, b));
  }
  if (sec.on) for (const i of [i0, i1]) for (const b of ["sfc", ...manifest.levels.map((p) => `p${p}`)]) want.push(loader.load(model, leads[i], b));
  await Promise.allSettled(want);
  for (let n = 0; sat && satOn && sat.loaded < sat.frames.length && n < 100; n++) await new Promise((r) => setTimeout(r, 100));
}
function legendParts() {
  return [...document.querySelectorAll("#legend .legend-row")].map((row) => {
    const ends = row.querySelectorAll(".legend-ends span");
    return { label: row.querySelector(".legend-label")?.textContent ?? "", css: row.querySelector(".legend-bar")?.style.background ?? "", lo: ends[0]?.textContent ?? "", hi: ends[1]?.textContent ?? "" };
  });
}
const CREDITS = `North Pacific 3D — educational visualization of raw model output; not an official product, not for navigation. `
  + `Models: NOAA GFS; ECMWF IFS open data © ECMWF (CC BY 4.0). Satellite: NOAA GOES-18, JMA Himawari-9 via NOAA Open Data. Built ${fmtUtc(Date.parse(manifest.generated_at))}.`;
function frameParts() {
  rulerRay.setFromCamera(new THREE.Vector2(0, 0), camera);
  const c = geo.pick(rulerRay.ray), W = root.clientWidth, H = root.clientHeight;
  return {
    gl: renderer.domElement, root, labels: $("gridLabels"), title: "North Pacific 3D",
    time: $("hudValid").textContent, run: `${$("hudRun").textContent} · ${$("hudLead").textContent}`,
    badge: $("hudInterp").hidden ? "" : $("hudInterp").textContent, legends: legendParts(),
    compassDeg: c ? northAngle(geo, camera, c.latlon[0], c.latlon[1], W, H) : NaN, credits: CREDITS,
  };
}
// Render one frame now (not waiting for the animation loop) and composite it.
function renderInto(ctx, W, H, dt = 1 / FPS) {
  for (const L of Object.values(layers)) {
    if (!L.particles || !L.particles.object.visible || !L.current) continue;
    const { a, b, t } = L.current;
    { const fa = flowOf(L, a), fb = flowOf(L, b); L.particles.update(dt, { uA: fa.u, vA: fa.v, uB: fb.u, vB: fb.v, hA: hOf(L, a), hB: hOf(L, b), oA: a.o, oB: b.o, t }); }
  }
  if (p3.on && pvol) { const f = p3Field(); if (f) pvol.update(dt, f); }
  controls.update();
  const d = camera.position.distanceTo(controls.target);
  camera.far = Math.max(60000, d * 3); camera.near = Math.max(1, d / 2000); camera.updateProjectionMatrix();
  placeOverlays();
  renderer.render(scene, camera);
  composite(ctx, frameParts(), W, H);
}
function exportTimes() {
  const r = $("expRange").value, real = $("expStep").value === "real";
  const now = timeline.clamp(NOW_H), lo = timeline.start, hi = timeline.end;
  const [a, b] = { next24: [now, now + 24], next72: [now, now + 72], forecast: [now, hi], past24: [Math.max(lo, SAT_END_H - 24), SAT_END_H], all: [lo, hi] }[r];
  const from = Math.max(lo, a), to = Math.min(hi, b);
  if (real) return timeline.real.filter((h) => h >= from - 1e-6 && h <= to + 1e-6 && (r === "past24" || leads.includes(h)));
  const out = []; for (let h = Math.ceil(from); h <= to + 1e-6; h += 1) out.push(h); return out;
}
function syncExportControls() {
  const w = $("expWhat").value;
  $("expRangeRow").hidden = $("expStepRow").hidden = w !== "time";
  $("expFormatRow").hidden = w === "png";
}
$("expWhat").addEventListener("change", syncExportControls);
syncExportControls();
let exporting = null;
$("expGo").addEventListener("click", async () => {
  if (exporting) { exporting.cancel = true; return; }
  const what = $("expWhat").value, format = what === "png" ? "png" : $("expFormat").value;
  const { W, H } = outputSize(Number($("expWidth").value), root.clientWidth, root.clientHeight);
  const keep = { pos: timeline.pos, playing: timeline.playing, ratio: renderer.getPixelRatio(), cam: camera.position.clone(), target: controls.target.clone(), fov: camera.fov, morph: geo.uniforms.morph.value };
  exporting = { cancel: false };
  setPlaying(false);
  renderer.setPixelRatio(W / root.clientWidth);          // render at the output size, not stretched
  resize();
  $("expGo").textContent = "Cancel";
  const note = (t) => { $("expNote").textContent = t; };
  try {
    let steps = 1, drawStep, holdMs = () => 250, name;
    if (what === "png") {
      drawStep = async (i, ctx) => { await ensureLoaded(timeline.pos); applyTime(true); renderInto(ctx, W, H, 0); };
      name = `np3d_${new Date(Date.parse(manifest.anchor) + timeline.pos * 3600e3).toISOString().slice(0, 13).replace(/[-T]/g, "")}Z.png`;
    } else if (what === "time") {
      const hs = exportTimes();
      if (hs.length < 2) throw new Error("fewer than two times in that range");
      steps = hs.length;
      holdMs = () => ($("expStep").value === "real" ? (hs.length > 30 ? 250 : 500) : 150);
      drawStep = async (i, ctx) => { openNote = null; timeline.pos = hs[i]; await ensureLoaded(hs[i]); applyTime(true); renderInto(ctx, W, H); };
      name = `np3d_${model}_${$("expRange").value}.${format}`;
    } else {
      if (tour.stops.length < 2) throw new Error("the tour needs at least two stops");
      const frames = tour.frames(FPS);
      steps = frames.length; holdMs = () => 1000 / FPS;
      await ensureLoaded(timeline.pos); applyTime(true);
      drawStep = async (i, ctx) => { setTourCamera(frames[i]); renderInto(ctx, W, H); };
      name = `np3d_tour.${format}`;
    }
    const blob = await record({ format, W, H, steps, drawStep, holdMs, cancelled: () => exporting.cancel,
      onProgress: (i, n) => note(`Making ${format.toUpperCase()}: frame ${i} of ${n}…`) });
    if (exporting.cancel) note("Cancelled.");
    else { saveBlob(blob, name); note(`Saved ${name} (${(blob.size / 1e6).toFixed(1)} MB, ${W} × ${H}).`); }
  } catch (e) {
    note(`Couldn't make it: ${e.message}`);
  } finally {
    renderer.setPixelRatio(keep.ratio); resize();
    timeline.pos = keep.pos;
    camera.position.copy(keep.cam); controls.target.copy(keep.target); camera.fov = keep.fov; camera.updateProjectionMatrix();
    setControlMode(keep.morph > 0.5); geo.uniforms.morph.value = keep.morph; backdrop.visible = keep.morph > 0.02;
    applyTime(true);
    $("expGo").textContent = "Save";
    exporting = null;
  }
});

// ---- tabs ----------------------------------------------------------------------------
// Explore / Layers / Slice / Map / Style. The last one used is remembered on
// this device (a convenience only; the page works without storage).
function showTab(name) {
  for (const b of document.querySelectorAll(".tabs button")) b.classList.toggle("on", b.dataset.tab === name);
  for (const s of document.querySelectorAll("section.tab")) s.hidden = s.dataset.tab !== name;
  try { localStorage.setItem("np3d.tab", name); } catch { /* private mode etc. */ }
  dirty = true;
}
// Tapping the open tab again folds the panel to just its tabs (so the map
// shows on a small screen); any tab opens it again.
for (const b of document.querySelectorAll(".tabs button")) b.addEventListener("click", () => {
  const panel = $("panel");
  if (b.classList.contains("on") && !panel.classList.contains("folded")) { panel.classList.add("folded"); dirty = true; return; }
  panel.classList.remove("folded");
  showTab(b.dataset.tab);
});
{
  let saved = null;
  try { saved = localStorage.getItem("np3d.tab"); } catch { /* ignore */ }
  // Only a tab the page opens with (not a mode's own tab: the Past year's or Simulate's, which open in their mode).
  showTab(document.querySelector(`.tabs button[data-tab="${saved}"]:not([hidden])`) ? saved : "explore");
}

// ---- overlays: height ruler, place names, lat/lon labels, compass ----------------------
// One pass per rendered frame. Labels are laid out together in priority order
// (ruler, main places, lat/lon, lesser places) so none overlap and none sit
// under the page's panels (labels.js).
const rulerRay = new THREE.Raycaster();
function panelRects() {
  const r0 = root.getBoundingClientRect();
  return [".panel", ".hud", ".timebar", ".legend", ".compass", ".show-panel", ".probe", ".viewbar", ".slicechart"].flatMap((sel) => [...document.querySelectorAll(sel)])
    .filter((el) => el.offsetParent && !el.hidden).map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left - r0.left - 4, right: r.right - r0.left + 4, top: r.top - r0.top - 4, bottom: r.bottom - r0.top + 4 };
    });
}
function insideGrid(lat, lon) {
  const g = manifest.grid, lonE = g.lon0 + g.dlon * (g.nlon - 1), latS = g.lat0 + g.dlat * (g.nlat - 1);
  return lat >= latS && lat <= g.lat0 && lon >= g.lon0 && lon <= lonE;
}
// The ruler stands on the map just right of the panel, above the timebar,
// and marks the levels on screen at their real heights at that spot.
function updateRuler(W, H, blocked) {
  ruler.object.visible = false;
  if (!rulerOn) return [];
  const panelR = $("panel").hidden ? 0 : blocked[0]?.right ?? 0;
  const bar = document.querySelector(".timebar").getBoundingClientRect(), r0 = root.getBoundingClientRect();
  const sx = Math.min(W - 80, panelR + 70), sy = Math.max(60, bar.top - r0.top - 60);
  rulerRay.setFromCamera(new THREE.Vector2((sx / W) * 2 - 1, -(sy / H) * 2 + 1), camera);
  const hit = geo.pick(rulerRay.ray);
  if (!hit) return [];
  let [lat, lon] = hit.latlon;
  lon = lon < manifest.grid.lon0 ? lon + 360 : lon;
  if (!insideGrid(lat, lon)) return [];
  // Hidden when looking (nearly) straight down: a vertical ruler would point at you.
  const up = geo.point(lat, lon, 1).sub(geo.point(lat, lon, 0)).normalize();
  const dir = new THREE.Vector3().subVectors(controls.target, camera.position).normalize();
  if (Math.abs(dir.dot(up)) > 0.93) return [];
  const levels = [];
  for (const L of Object.values(layers)) {
    if (L.def.key === "sfc" || !L.gl.visible || !L.current?.a?.h) continue;
    const { a, b, t: tt } = L.current;
    const hM = graticule.sample(a.h, lon, lat) * (1 - tt) + graticule.sample(b.h, lon, lat) * tt;
    levels.push({ text: L.def.title, hM, cls: L.def.key === show.focus ? "gl-focus" : "gl-lvl", focus: L.def.key === show.focus });
  }
  levels.sort((x, y) => y.focus - x.focus);
  const vex = Math.pow(10, Number($("vexSlider").value));
  const p0 = geo.point(lat, lon, 0).project(camera), p1 = geo.point(lat, lon, vex).project(camera);
  const pxPerKm = Math.hypot((p1.x - p0.x) * W / 2, (p1.y - p0.y) * H / 2);
  ruler.update(lat, lon, vex, levels, camera.position.distanceTo(controls.target) * 0.008, pxPerKm, hUnit);
  ruler.object.visible = true;
  const items = ruler.labelItems(camera, W, H);
  // Level labels (and the focus first) before the km ones.
  return [...items.filter((i) => i.cls === "gl-focus"), ...items.filter((i) => i.cls === "gl-lvl"), ...items.filter((i) => i.cls === "gl-km")];
}
// H and L: local extremes of each visible layer's contoured field (sea-level
// pressure, or the level's height) at the NEARER real step (extremes.js).
// Prominence 0.4 x the layer's contour interval; window +-4 deg (lows), +-6 deg (highs). Sea-level
// pressure over ground above ~500 m (surface pressure < 950 hPa) is an
// extrapolation, so surface extremes there are skipped -- on the real
// build they were fake highs on the Alaska Range and New Guinea highlands.
const HL_RADIUS_LOW = 8, HL_RADIUS_HIGH = 12, HL_MAX = 12;
function hlFor(L) {
  const lead = nearerLead(), key = `${L.def.key}:${model}:${lead}`;
  if (hlCache.has(key)) return hlCache.get(key);
  const d = derivedFor(L, lead);
  if (!d) return null;
  let mask = d.o;
  if (L.def.key === "sfc") {
    const s = loader.ready(model, lead, "sfc");
    mask = new Float32Array(d.c.length);
    for (let k = 0; k < mask.length; k++) mask[k] = s.psfc[k] >= 95000 ? 1 : 0;
  }
  // Lows are compact (±4° window), highs broad (±6°): one window missed the
  // North Pacific High on the real build while a wider one blurred lows.
  const prom = 0.4 * L.def.interval;
  const ex = [...findExtremes(d.c, manifest.grid, { radius: HL_RADIUS_LOW, prominence: prom, mask, kinds: ["L"] }),
    ...findExtremes(d.c, manifest.grid, { radius: HL_RADIUS_HIGH, prominence: prom, mask, kinds: ["H"] })]
    .sort((a, b) => b.dev - a.dev).slice(0, HL_MAX);
  const out = { ex, d };
  hlCache.set(key, out);
  return out;
}
function hlItems(W, H) {
  if (!hlOn) return [];
  const v = new THREE.Vector3(), out = [], g = manifest.grid;
  const vex = Math.pow(10, Number($("vexSlider").value));
  const shown = Object.values(layers).filter((L) => L.gl.visible && L.current && hlLevels.has(L.def.key))
    .sort((a, b) => (b.def.key === show.focus) - (a.def.key === show.focus));
  for (const L of shown) {
    const r = hlFor(L);
    if (!r) continue;
    for (const e of r.ex) {
      const j = Math.floor(e.k / g.nlon), i = e.k % g.nlon, lat = g.lat0 + j * g.dlat, lon = g.lon0 + i * g.dlon;
      const hd = hOf(L, r.d);            // label sits on the sheet as drawn
      const hKm = (hd ? hd[e.k] * 0.001 * vex : 0) + (L.def.options.lift ?? 0) + 2;
      v.copy(geo.point(lat, lon, hKm)).project(camera);
      if (v.z > 1 || v.z < -1) continue;
      const text = L.def.key === "sfc" ? `${e.kind} ${Math.round(e.value)}` : `${e.kind} ${Math.round(e.value / 10)}·${L.def.level}`;
      out.push({ x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, text, cls: `gl-${e.kind}`, align: "center" });
    }
  }
  return out;
}
function placeItems(W, H, maxRank, minRank = 1) {
  if (!namesOn) return [];
  const v = new THREE.Vector3(), out = [];
  for (const p of PLACES) {
    if (p.rank > maxRank || p.rank < minRank) continue;
    // Cities stand on a stick: from the ground at the place up to just above
    // the top visible surface, where the label floats.
    const top = graticule.heightKm(p.lon, p.lat) + (p.kind === "city" ? STICK_KM : 0);
    v.copy(geo.point(p.lat, p.lon, top)).project(camera);
    if (v.z > 1 || v.z < -1) continue;
    const x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H;
    out.push(p.kind === "city" ? { x: x - 5, y, text: p.name, cls: "pl-city", align: "left", stick: [p.lat, p.lon, top] }
      : { x, y, text: p.name, cls: "pl-sea", align: "center" });
  }
  return out;
}
// A case step's markers (cases.js marks: [{lat, lon, label, r km}]): a thin
// amber ring round each feature the text names, with a short label above it,
// shown only while the map is on the step's own day (the storm moves on).
const caseRings = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.9, depthTest: false }));
caseRings.geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(3 * 2 * 48 * 12), 3));
caseRings.frustumCulled = false;
caseRings.renderOrder = 895;
scene.add(caseRings);
const RING_SEG = 48, MARK_KM = 14;             // drawn just above the Past year's map
function caseMarks() {
  if (!arch.on || !caseState.c || !$("caseMarks").checked) return [];
  const s = caseState.c.steps[caseState.k];
  return s.marks && ARCH_DAYS[arch.i]?.date === s.day ? s.marks : [];
}
function caseMarkItems(W, H) {
  const v = new THREE.Vector3(), out = [];
  for (const m of caseMarks()) {
    // the label sits just north of the ring
    v.copy(geo.point(m.lat + (m.r ?? 250) / 111.2, m.lon, MARK_KM)).project(camera);
    if (v.z > 1 || v.z < -1) continue;
    out.push({ x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, dy: -18, text: m.label, cls: "case-mark", align: "center" });
  }
  return out;
}
function placeCaseRings() {
  const marks = caseMarks(), pos = caseRings.geometry.getAttribute("position");
  let n = 0;
  for (const m of marks.slice(0, 12)) {
    const r = (m.r ?? 250) / 111.2, cl = Math.cos((m.lat * Math.PI) / 180);
    for (let k = 0; k < RING_SEG; k++) for (const kk of [k, k + 1]) {
      const a = (kk / RING_SEG) * 2 * Math.PI, p = geo.point(m.lat + r * Math.sin(a), m.lon + (r * Math.cos(a)) / cl, MARK_KM);
      pos.setXYZ(n++, p.x, p.y, p.z);
    }
  }
  caseRings.geometry.setDrawRange(0, n);
  pos.needsUpdate = true;
  caseRings.visible = n > 0;
}
const STICK_KM = 250;
const sticks = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x111827, transparent: true, opacity: 0.7, depthTest: false }));
sticks.geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(3 * 2 * 64), 3));
sticks.frustumCulled = false;
sticks.renderOrder = 890;
scene.add(sticks);
let keptLabels = new Set();
function placeOverlays() {
  const W = root.clientWidth, H = root.clientHeight, box = $("gridLabels");
  const blocked = panelRects();
  const free = (x, y) => !blocked.some((r) => x > r.left && x < r.right && y > r.top && y < r.bottom);
  const group = (g, arr) => arr.map((it) => ({ ...it, group: g }));
  const items = sim.on ? group(3, sim.scene.labelItems(camera, W, H, free, simViewLon())) : [
    ...group(0, caseMarkItems(W, H)),
    ...group(0, hlItems(W, H)),
    ...group(1, updateRuler(W, H, blocked)),
    ...group(1, sliceItems(W, H)),
    ...group(2, placeItems(W, H, 1)),
    ...group(3, gridOn ? graticule.labelItems(camera, W, H, free) : []),
    ...group(4, placeItems(W, H, 3, 2)),
  ];
  const kept = layoutLabels(items, W, H, blocked, 4, keptLabels);
  keptLabels = new Set(kept.map(labelKey));
  box.innerHTML = labelsHtml(kept);
  // Sticks for the city labels that were placed.
  const pos = sticks.geometry.getAttribute("position");
  let n = 0;
  for (const k of kept) {
    if (!k.stick || n >= pos.count - 1) continue;
    const [lat, lon, top] = k.stick, a = geo.point(lat, lon, 0), b = geo.point(lat, lon, top);
    pos.setXYZ(n++, a.x, a.y, a.z); pos.setXYZ(n++, b.x, b.y, b.z);
  }
  sticks.geometry.setDrawRange(0, n);
  pos.needsUpdate = true;
  sticks.visible = n > 0;
  placeCaseRings();
  // Compass: north at the view's centre.
  rulerRay.setFromCamera(new THREE.Vector2(0, 0), camera);
  const c = geo.pick(rulerRay.ray);
  if (c) $("compassNeedle").style.transform = `rotate(${northAngle(geo, camera, c.latlon[0], c.latlon[1], W, H).toFixed(1)}deg)`;
}

// ---- the past year (archive.js) ------------------------------------------------------
// One real GFS 00Z analysis per day for the last 365 days, on its own 1°
// grid, drawn flat on the map like the surface: a fill (the value, or its
// anomaly against 1991-2020) and contour lines. The model layers, satellite,
// charts, slice and volume step aside and come back as they were on exit.
// Days are never blended: Play steps from one real analysis to the next.
// The days the Past year viewer steps through: the rolling year, or while a
// case shows one, an event window from the event archive (index "events":
// famous storms of earlier years, kept for the Cases tab).
const YEAR_DAYS = ARCH?.days ?? [];
const ARCH_EVENTS = (ARCH?.events ?? []).filter((e) => e.days?.length);
let ARCH_DAYS = YEAR_DAYS, archEvent = null;
function setArchDays(ev) {
  const list = ev ? ev.days : YEAR_DAYS;
  if (list === ARCH_DAYS) return;
  ARCH_DAYS = list; archEvent = ev;
  $("yearSlider").max = String(Math.max(0, ARCH_DAYS.length - 1));
  arch.seriesToken++;                        // the probe's chart is for the list shown
}
// Where a date is: the rolling year, or an event window.
const eventOf = (date) => (YEAR_DAYS.some((d) => d.date === date) ? null : ARCH_EVENTS.find((e) => e.days.some((d) => d.date === date)) ?? null);
const ALL_ARCH_DATES = [...YEAR_DAYS, ...ARCH_EVENTS.flatMap((e) => e.days)].map((d) => d.date);
$("modeToggle").hidden = false;           // Forecast | Past year | Simulate
if (!YEAR_DAYS.length) document.querySelector('#modeToggle [data-mode="year"]').hidden = true;
if (YEAR_DAYS.length) {
  $("yearView").innerHTML = Object.entries(ARCHIVE_VIEWS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");
  $("yearSlider").max = String(ARCH_DAYS.length - 1);
}
function archLayer() {
  if (!arch.layer) {
    const gl = new GridLayer(ARCH.grid, geo, { lift: 12, lineColor: "#26303c", lineWidth: 1.3, renderOrder: 10 });
    gl.uniforms.mapTex.value = ground.texture;
    gl.uniforms.mapMix.value = 0.6;
    gl.uniforms.fillOpacity.value = 0.8;
    gl.uniforms.shade.value = false;
    scene.add(gl.mesh);
    arch.layer = gl;
  }
  return arch.layer;
}
// A day's fields, fetched once and kept for the last 24 days viewed; with
// its observed SST (the day's OISST file) merged in when the view needs it.
function archDay(i, obs = !!ARCHIVE_VIEWS[arch.view].obs) {
  const d = ARCH_DAYS[i];
  if (!d) return Promise.resolve(null);
  const key = `${d.date}:${obs && d.obs ? "o" : ""}`;
  if (arch.cache.has(key)) return arch.cache.get(key);
  const n = ARCH.grid.nlat * ARCH.grid.nlon, v = buildVersion(manifest);
  const get = (e) => fetchU16(`${DATA}/${e.file}${v}`).then((codes) => dequantize(codes, e.fields, n));
  const p = Promise.all([get(d), obs && d.obs ? get(d.obs) : null]).then(([f, o]) => (o ? { ...f, ...o } : f)).catch(() => null);
  arch.cache.set(key, p);
  if (arch.cache.size > 24) arch.cache.delete(arch.cache.keys().next().value);
  return p;
}
const archMode = () => (arch.mode === "anomaly" && ARCH.anomalies && ARCHIVE_VIEWS[arch.view].anomaly ? "anomaly" : "actual");
const archLinesKind = () => (arch.lines === "auto" ? ARCHIVE_VIEWS[arch.view].lines : arch.lines);
async function archShow() {
  const i = arch.i, f = await archDay(i);
  if (!arch.on || i !== arch.i) return;
  const d = ARCH_DAYS[i];
  $("yearSlider").value = String(i);
  $("yearDate").textContent = `${new Date(`${d.date}T00:00:00Z`).toUTCString().slice(0, 16)} · ${archEvent ? `event archive, day ${i + 1} of ${ARCH_DAYS.length}` : `day ${i + 1} of ${ARCH_DAYS.length}`}`;
  const gl = archLayer();
  if (!f) { gl.visible = false; archHud(); dirty = true; return; }
  const fill = archiveFill(arch.view, archMode(), f), lines = archiveLines(archLinesKind(), f);
  if (!fill) { gl.visible = false; arch.cur = null; archWind(); archHud(); dirty = true; return; }     // a day without this field
  if (ARCHIVE_SEA.has(fill.scaleKey)) for (let k = 0; k < fill.f.length; k++) if (!Number.isFinite(fill.f[k])) fill.f[k] = SEA_MISSING;
  const vals = { h: null, c: lines ? lines.c : null, f: fill.f };
  gl.setSlot("A", d.date, vals); gl.setSlot("B", d.date, vals);
  gl.uniforms.t.value = 0;
  gl.uniforms.showLines.value = !!lines;
  if (lines) gl.uniforms.cInterval.value = lines.interval;
  gl.setFill(fill.scaleKey, SCALES[fill.scaleKey]);
  gl.visible = true;
  if (arch.scaleKey !== fill.scaleKey) { arch.scaleKey = fill.scaleKey; updateLegend(); }
  arch.cur = { fill, lines, date: d.date, fields: f };
  archWind();
  for (const j of [i + 1, i + 2, i + 3]) archDay(j);           // read ahead for Play
  archHud();
  if (hover) updateReadout();
  if (probeAt) archProbeMark();
  dirty = true;
}
// The day's wind at one level as flow lines, barbs or particles (winds.js,
// on the archive grid), in the level's colour. Flow lines and barbs are that
// 00 UTC moment; particles drift through that same moment's wind.
const archWindLevel = () => (arch.wind === "auto" ? ARCHIVE_VIEWS[arch.view].wind : arch.wind === "none" ? null : arch.wind);
function archWind() {
  const lv = archWindLevel(), w = lv && arch.cur ? archiveWind(lv, arch.cur.fields) : null;
  const color = levelColor(lv === "10" ? "sfc" : `p${lv}`);
  const W = root.clientWidth, H = root.clientHeight;
  if (w && arch.windAs === "flow") {
    if (!arch.flow) { arch.flow = new FlowLayer(ARCH.grid, geo, { lift: 19, renderOrder: 14, width: 1.4 }); arch.flow.setViewport(W, H); scene.add(arch.flow.object); arch.flow.gapCells = Math.max(2, Math.round(flowGap() / 2)); }
    arch.flow.setColors(color, "#ffffff");
    arch.flow.build(`${arch.cur.date}:${lv}:${arch.flow.gapCells}`, w.u, w.v, null, null);
  }
  if (w && arch.windAs === "barbs") {
    if (!arch.barbs) { arch.barbs = new BarbLayer(ARCH.grid, geo, { lift: 20, renderOrder: 14, color }); arch.barbs.setViewport(W, H); scene.add(arch.barbs.object); const s = barbScale(); arch.barbs.every = Math.max(1, Math.round(s.every / 2)); arch.barbs.length = s.length; }
    arch.barbs.setColors(color, "#ffffff");
    arch.barbs.build(`${arch.cur.date}:${lv}:${arch.barbs.every}:${arch.barbs.length}`, w.u, w.v, null, null);
  }
  if (w && arch.windAs === "particles") {
    if (!arch.particles) { arch.particles = new ParticleSystem(ARCH.grid, geo, { count: PARTICLE_MAX, lift: 18, color, renderOrder: 13 }); scene.add(arch.particles.object); }
    arch.particles.color.set(color);
    arch.particles.setCount(PARTICLE_BASE * particleDensity * 1.4);
    arch.windField = { uA: w.u, vA: w.v, uB: w.u, vB: w.v, hA: null, hB: null, oA: null, oB: null, t: 0 };
  }
  if (arch.flow) arch.flow.object.visible = !!w && arch.windAs === "flow";
  if (arch.barbs) arch.barbs.object.visible = !!w && arch.windAs === "barbs";
  if (arch.particles) arch.particles.object.visible = !!w && arch.windAs === "particles";
  dirty = true;
}
function archHud() {
  const d = ARCH_DAYS[arch.i];
  if (!d) return;
  // Calendar days between the build's date and the analysis's (not hours: a
  // 00 UTC analysis is "today" all day).
  const ago = Math.round((Date.parse(`${String(manifest.generated_at ?? manifest.anchor).slice(0, 10)}T00:00:00Z`) - Date.parse(`${d.date}T00:00:00Z`)) / 86400e3);
  setHudTime(Date.parse(`${d.date}T00:00:00Z`), `${d.date.slice(8, 10)} ${new Date(`${d.date}T00:00:00Z`).toUTCString().slice(8, 16)} 00:00 UTC`);
  $("hudLead").textContent = ago <= 0 ? "today" : ago === 1 ? "yesterday" : `${ago} days ago`;
  $("hudRun").textContent = archEvent ? "GFS analysis · event archive" : "GFS analysis · the past year";
  const m = archMode(), v = ARCHIVE_VIEWS[arch.view];
  const notes = [...(openNote ? [openNote] : []), archEvent
    ? `event archive: one real GFS 00 UTC analysis per day, ${archEvent.from} to ${archEvent.to}, kept for a case study; days are never blended`
    : `past year: one real GFS 00 UTC analysis per day (${ARCH_DAYS.length} of ${ARCH_DAYS.length + (ARCH.missing ?? 0)} days); days are never blended`];
  const lv = archWindLevel();
  if (lv) notes.push(`${ARCHIVE_WIND_LEVELS[lv]} wind as ${arch.windAs === "flow" ? "flow lines" : arch.windAs === "barbs" ? "barbs" : "particles drifting through that moment's wind"} (00 UTC, one moment of the day)`);
  if (m === "anomaly") notes.push(`${v.label} minus its 1991–2020 average for the date (${arch.view === "ssto" ? "OISST's own 1991–2020 climatology: observed minus observed" : arch.view === "sst" ? "NOAA OISST climatology" : "NCEP/NCAR reanalysis, 00 UTC"})`);
  else if (arch.mode === "anomaly") notes.push(`no anomaly for ${v.label}: showing the value`);
  if (v.obs && !d.obs) notes.push("no observed sea temperature for this day yet: OISST is published about a day after the models");
  else if (v.obs && !d.obs.final) notes.push("observed sea temperature: NOAA's preliminary version for this day (the final one replaces it about three weeks on)");
  const badge = $("hudInterp");
  badge.hidden = false; badge.textContent = notes.join(" · "); badge.title = badge.textContent;
}
function archReadout() {
  const { lat, lon } = hover, k = archiveIndex(ARCH.grid, lat, lon);
  const latTxt = lat < 0 ? `${(-lat).toFixed(1)}°S` : `${lat.toFixed(1)}°N`, lonTxt = lon > 180 ? `${(360 - lon).toFixed(1)}°W` : `${lon.toFixed(1)}°E`;
  if (k < 0 || !arch.cur) { tip.hidden = true; return; }
  const { fill, lines, date } = arch.cur, v = fill.f[k], s = SCALES[fill.scaleKey];
  const rows = [`<b>${latTxt} ${lonTxt}</b> <span class="muted">GFS analysis ${date} 00 UTC</span>`];
  const signed = archMode() === "anomaly";
  const txt = fill.scaleKey === "hs" ? fmtWave(v, waveUnit) : `${signed && v > 0 ? "+" : ""}${v.toFixed(Math.abs(v) >= 100 ? 0 : 1)} ${s.units}`;
  rows.push(Number.isFinite(v) && v > SEA_MISSING + 1 ? `${s.label}: ${txt}` : `${s.label}: none here`);
  if (lines) rows.push(`<span class="muted">${archLinesKind() === "isobars" ? `sea-level pressure ${lines.c[k].toFixed(1)} hPa` : `500 mb height ${Math.round(lines.c[k])} m`}</span>`);
  const lv = archWindLevel(), w = lv ? archiveWind(lv, arch.cur.fields) : null;
  if (w) rows.push(`${ARCHIVE_WIND_LEVELS[lv]} wind: ${windText(w.u[k], w.v[k])}`);
  tip.innerHTML = rows.join("<br>"); tip.hidden = false;
}
// The probe in this mode: the whole year at the point, for what's shown --
// loaded day by day (the page says how far it has got), redrawn as it goes.
async function archProbe() {
  const { lat, lon } = probeAt, k = archiveIndex(ARCH.grid, lat, lon), token = ++arch.seriesToken;
  $("probeWhere").textContent = `${lat < 0 ? `${-lat}°S` : `${lat}°N`} ${lon > 180 ? `${360 - lon}°W` : `${lon}°E`}`;
  $("probeMeteo").innerHTML = "";
  if (k < 0) { $("probeProfile").innerHTML = `<p class="muted">Outside the archive's area.</p>`; return; }
  const view = arch.view, mode = archMode(), got = new Map();
  const draw = (done) => {
    // got holds just this point, so its index is 0.
    const series = archiveSeries(ARCH_DAYS, got, 0, view, mode), s = SCALES[archiveFill(view, mode, [...got.values()][0] ?? {})?.scaleKey ?? ""];
    const vals = series.map(([, v]) => v).filter((v) => v > SEA_MISSING + 1);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN;
    $("probeWhen").textContent = `The past year here: ${ARCHIVE_VIEWS[view].label}${mode === "anomaly" ? " anomaly vs 1991–2020" : ""}, ${ARCHIVE_VIEWS[view].obs ? "the observed daily mean for each day" : "one real 00 UTC analysis a day"}${done ? "" : ` · loading ${got.size}/${ARCH_DAYS.length}`}`;
    $("probeProfile").innerHTML = seriesSvg(series.filter(([, v]) => v > SEA_MISSING + 1), { w: 300, h: 140, units: s?.units ?? "", zero: mode === "anomaly", mark: ARCH_DAYS[arch.i]?.date })
      + (done && vals.length ? `<p class="probe-sfc">${mode === "anomaly" ? `Year average ${Math.abs(avg) < 0.05 ? "0.0" : `${avg > 0 ? "+" : ""}${avg.toFixed(1)}`} ${s.units}: ${Math.abs(avg) < 0.2 * (s.max - s.min) / 10 ? "close to normal" : avg > 0 ? "above normal" : "below normal"} overall` : `Year range ${Math.min(...vals).toFixed(1)} to ${Math.max(...vals).toFixed(1)} ${s.units}, average ${avg.toFixed(1)}`}. Click the chart to go to that day.</p>` : "");
    const svg = $("probeProfile").querySelector("svg");
    if (svg && series.length > 1) svg.onclick = (e) => {
      const b = svg.getBoundingClientRect(), fr = Math.min(1, Math.max(0, (e.clientX - b.left - 34 * b.width / 300) / (b.width * (260 / 300))));
      const t0 = Date.parse(series[0][0]), t1 = Date.parse(series.at(-1)[0]), want = t0 + fr * (t1 - t0);
      let best = 0; ARCH_DAYS.forEach((d, j) => { if (Math.abs(Date.parse(d.date) - want) < Math.abs(Date.parse(ARCH_DAYS[best].date) - want)) best = j; });
      archGo(best);
    };
  };
  for (let j = 0; j < ARCH_DAYS.length; j++) {
    if (token !== arch.seriesToken || !arch.on) return;
    const f = await archDay(j, !!ARCHIVE_VIEWS[view].obs);
    if (f) { const one = {}; for (const [name, a] of Object.entries(f)) one[name] = a.subarray(k, k + 1); got.set(ARCH_DAYS[j].date, one); }
    if (j % 30 === 29) draw(false);
  }
  draw(true);
  arch.series = { k, view, mode, redraw: () => draw(true) };
}
// Day changed with the probe open: move the chart's day mark (no reload).
function archProbeMark() {
  const S = arch.series;
  if (S && S.k === archiveIndex(ARCH.grid, probeAt.lat, probeAt.lon) && S.view === arch.view && S.mode === archMode()) S.redraw();
}
function archGo(i) { openNote = null; arch.i = Math.max(0, Math.min(ARCH_DAYS.length - 1, i)); archShow(); }
function archStep(d) { archPlay(false); archGo(arch.i + d); }
function archPlay(on) {
  if (arch.playing) { clearTimeout(arch.playing); arch.playing = null; }
  $("yearPlay").textContent = on ? "❚❚ Pause" : "▶ Play";
  if (!on) return;
  const tick = async () => {
    if (arch.i >= ARCH_DAYS.length - 1) { archPlay(false); return; }
    arch.i++;
    await archShow();
    if (arch.playing) arch.playing = setTimeout(tick, 1000 / Number($("yearSpeed").value));
  };
  if (arch.i >= ARCH_DAYS.length - 1) arch.i = -1;
  arch.playing = setTimeout(tick, 0);
}
function enterArchive() {
  if (sim.on) exitSim();
  if (!YEAR_DAYS.length || arch.on) return;
  setArchDays(null);
  arch.saved = captureState();
  openNote = null;                    // a forecast note doesn't carry over (a shared view's note is set after this)
  setPlaying(false);
  if (satOn) { satOn = false; $("satToggle").checked = false; syncSatControls(); }
  if (opcProduct) setOpcProduct("");
  if (sec.on) { sec.on = false; $("secToggle").checked = false; secPath = null; sliceChanged(); }
  if (vol.on) { vol.on = false; $("volToggle").checked = false; volumeChanged(); }
  if (p3.on) { p3.on = false; $("p3Toggle").checked = false; p3Changed(); }
  arch.on = true;
  syncBackground();
  applyRoiFade();                     // off in the Past year
  if (probeAt) setProbe(null);
  applyLayers();
  document.querySelector(".timebar:not(.yearbar)").hidden = true;
  $("yearBar").hidden = false;
  archModeUi(true);
  arch.i = ARCH_DAYS.length - 1;
  archShow();
}
// The panel in each mode: the forecast-only tabs (levels, slice, map,
// share) and the model choice step aside in the Past year; its "Show" tab
// takes their place (user request, 2026-09-29: the archive was hidden
// behind a button).
const FORECAST_TABS = ["layers", "slice", "map"];
function archModeUi(on) {
  for (const b of document.querySelectorAll("#modeToggle button")) b.classList.toggle("on", b.dataset.mode === (on ? "year" : "forecast"));
  for (const b of document.querySelectorAll(".tabs button")) {
    if (FORECAST_TABS.includes(b.dataset.tab)) b.hidden = on;
    if (b.dataset.tab === "year") b.hidden = !on;
  }
  $("modelToggle").hidden = on;
  $("yearSrc").hidden = !on;
  const open = document.querySelector(".tabs button.on")?.dataset.tab;
  if (on && FORECAST_TABS.includes(open)) showTab("year");
  if (!on && open === "year") showTab("explore");
  if (on) { question = null; arch.question = null; qSel.value = "custom"; archCard(); }     // the forecast's question is restored on exit
}
// A past-year question: switch mode if needed, set what to show, open its day.
function applyArchiveQuestion(q) {
  if (!arch.on) enterArchive();
  Object.assign(arch, q.set);
  for (const [id, v] of [["yearView", q.set.view], ["yearMode", q.set.mode], ["yearLines", q.set.lines], ["yearWind", q.set.wind], ["yearWindAs", q.set.windAs]]) $(id).value = v;
  archPlay(false);
  arch.i = Math.max(0, archiveStartDay(ARCH_DAYS, q.start));
  arch.question = q; qSel.value = q.id; archCard();
  showTab("explore");
  archShow();
  if (probeAt) archProbe();
}
function archCard() {
  const q = arch.question;
  if (q) $("qLook").innerHTML = questionCard(caseShows(q.set).replace(/<li><b>Markers:<\/b>[^<]*<\/li>/, ""), q.why, q.lookFor);
  else $("qLook").textContent = "The past year, your own settings (Show tab). Pick a question above for a guided view.";
  $("qWhy").href = `guide.html#${q ? q.guide : "past-year"}`;
  $("qWhen").textContent = q && q.start !== "newest" ? `Opens on ${ARCH_DAYS[Math.max(0, archiveStartDay(ARCH_DAYS, q.start))]?.date}; press Play or step with ← →.` : "";
  $("qNote").textContent = "";
}
function exitArchive() {
  if (!arch.on) return;
  archPlay(false);
  arch.on = false; arch.scaleKey = null; arch.seriesToken++;
  if (arch.layer) arch.layer.visible = false;
  for (const g of [arch.flow, arch.barbs, arch.particles]) if (g) g.object.visible = false;
  arch.windField = null;
  $("yearBar").hidden = true;
  document.querySelector(".timebar:not(.yearbar)").hidden = false;
  archModeUi(false);
  if (probeAt) setProbe(null);
  const st = arch.saved;
  if (st) { st.camera = [...camera.position.toArray(), ...controls.target.toArray(), camera.fov]; applyState({ ...st, fromArchiveExit: true, year: null }); }
  else { applyLayers(); updateLegend(); }
}
for (const b of document.querySelectorAll("#modeToggle button")) b.addEventListener("click", () => {
  if (b.dataset.mode === "year") enterArchive();
  else if (b.dataset.mode === "sim") enterSim();
  else { exitSim(); exitArchive(); }
});

// ---- the Simulate mode (sim2d.js, simworker.js, simview.js, simparticles.js, simscene.js) ----
// A simplified model of the whole atmosphere, averaged round each latitude
// circle and driven only by sunlight (docs/atmospheric_circulation_reference.md):
// the controls change the planet, the model runs in a Web Worker (simworker.js)
// so the page stays responsive, particles ride its winds (across the globe or in
// a north-south slab), and the latitude-height chart shows its cells and jets.
// The camera shows only the simulator's own layer (simscene.js: a plain globe,
// its lat/lon lines, the slab and the Sun); the forecast's layers, labels and
// charts step aside and come back on exit.
function enterSim() {
  if (sim.on) return;
  if (arch.on) exitArchive();
  sim.saved = captureState();
  setPlaying(false);
  if (satOn) { satOn = false; $("satToggle").checked = false; syncSatControls(); }
  if (opcProduct) setOpcProduct("");
  if (sec.on) { sec.on = false; $("secToggle").checked = false; secPath = null; sliceChanged(); }
  if (vol.on) { vol.on = false; $("volToggle").checked = false; volumeChanged(); }
  if (p3.on) { p3.on = false; $("p3Toggle").checked = false; p3Changed(); }
  if (!sim.p) sim.p = { ...SIM_DEFAULTS };
  if (!sim.s) sim.s = initSim(makeSim(), sim.p);                 // the page's copy, filled from the worker; before sim.on: the HUD reads it
  startSimModel();
  if (!sim.parts) {
    sim.parts = new SimParticles(geo, { count: sim.count }); sim.parts.object.traverse((o) => o.layers.set(SIM_LAYER)); scene.add(sim.parts.object);
    sim.scene = new SimScene(geo, worldTex); scene.add(sim.scene.object);   // its own ground: flat map or globe
    sim.slabLon = geo.center[1] + 90;                             // at the globe's right-hand edge: side-on, so rising and sinking show
    sim.parts.setSlab(sim.slabOn ? { lon0: sim.slabLon, width: sim.slabW } : null);
  }
  sim.on = true;
  applyRoiFade();
  if (probeAt) setProbe(null);
  applyLayers();
  document.querySelector(".timebar:not(.yearbar)").hidden = true;
  camera.layers.set(SIM_LAYER);
  sim.parts.size = sim.size; sim.parts.opacity = sim.opacity; sim.parts.tail = sim.tailSec;
  simSurface();
  simModeUi(true);
  setView("globe");
  // Side-on to the equator, far enough back for the whole globe and its stretched air
  // (the slab shows beyond the right-hand edge), and shifted clear of the panel and chart.
  const C = new THREE.Vector3(0, 0, -R_KM), dir = geo.point(0, geo.center[1], 0).sub(C).normalize();
  flight.to = { pos: C.clone().addScaledVector(dir, 5 * R_KM), target: C, fov: 45 };
  setBackground("space");                                        // the height colours read best on dark
  $("simChart").hidden = false;
  syncSimControls(); updateLegend(); drawSimChart(); simHud();
  dirty = true;
}
function exitSim() {
  if (!sim.on) return;
  sim.on = false;
  sim.worker?.postMessage({ type: "stop" }); sim.pew?.postMessage({ type: "stop" });
  camera.layers.set(0);
  camera.clearViewOffset(); sim.offKey = null;
  $("simChart").hidden = true;
  document.querySelector(".timebar:not(.yearbar)").hidden = false;
  simModeUi(false);
  syncBackground(true);
  if (sim.saved) applyState({ ...sim.saved, fromArchiveExit: true, year: null });
  dirty = true;
}
function simModeUi(on) {
  for (const b of document.querySelectorAll("#modeToggle button")) b.classList.toggle("on", b.dataset.mode === (on ? "sim" : "forecast"));
  for (const b of document.querySelectorAll(".tabs button")) {
    if (b.dataset.tab === "sim") b.hidden = !on;
    else if (b.dataset.tab === "year") b.hidden = true;
    else if (b.dataset.tab === "cases") b.hidden = on || !YEAR_DAYS.length || !CASES.length;
    else b.hidden = on;
  }
  $("modelToggle").hidden = on;
  for (const v of ["opc", "oblique", "low"]) document.querySelector(`[data-view="${v}"]`).hidden = on;   // the forecast area's views
  const whole = document.querySelector('[data-view="domain"]');
  whole.textContent = on ? "Flat map" : "Whole";
  whole.title = on ? "The whole world as a flat map, from straight above" : "The whole data area, 20°S to 65°N, from above";
  showTab(on ? "sim" : "explore");
}
// The longitude at the middle of the view (for the labels and the Sun's place).
function simViewLon() {
  rulerRay.setFromCamera(new THREE.Vector2(0, 0), camera);
  const c = geo.pick(rulerRay.ray);
  if (c) sim.viewLon = c.latlon[1];
  return sim.viewLon ?? geo.center[1];
}
// Each frame: move the particles through the latest winds from the worker, place the Sun
// and the slab, and every 0.3 s redraw the chart and the notes.
// The globe is drawn centred in the space the panel and the chart leave free (a view offset,
// so the controls still orbit the Earth's centre).
function simViewOffset() {
  const W = root.clientWidth, H = root.clientHeight, r0 = root.getBoundingClientRect();
  const panel = $("panel"), cr = $("simChart").getBoundingClientRect();
  const left = panel.offsetParent ? panel.getBoundingClientRect().right - r0.left : 0, bottom = cr.height ? cr.top - r0.top : H;
  const xs = Math.round(left / 2), ys = Math.round((H - bottom) / 3);
  const key = `${W}x${H}:${xs},${ys}`;
  if (key === sim.offKey) return;
  sim.offKey = key;
  camera.setViewOffset(W, H, -xs, ys, W, H);
}
// Two models behind one set of controls: the 2-D one (sim2d.js in simworker.js) and the 3-D one
// with storms (pe3d.js in pe3dworker.js). Only the running one's worker steps.
function simWorkerFor(kind) {
  const url = new URL(kind === "3d" ? "./pe3dworker.js" : "./simworker.js", import.meta.url);
  url.search = new URL(import.meta.url).search;                   // this build's version stamp, like every module
  return new Worker(url, { type: "module" });
}
// The 3-D model takes only the planet's settings (its own stability and timescales are Held & Suarez's).
const peParams = (p) => ({ rotation: p.rotation, tilt: p.tilt, day: p.day, seasons: p.seasons, inertiaDays: p.inertiaDays, contrastK: p.contrastK, land: !!p.land });
function simPost(msg) {
  if (sim.model !== "3d") { sim.worker?.postMessage(msg); return; }
  if (msg.type === "reset") sim.pew?.postMessage({ type: "restart", fromRest: true, p: peParams(msg.p) });
  else sim.pew?.postMessage(msg.p ? { ...msg, p: peParams(msg.p) } : msg);
}
function startSimModel() {
  if (sim.model === "3d") {
    sim.worker?.postMessage({ type: "stop" });
    if (!sim.pew) {
      sim.pew = simWorkerFor("3d");
      sim.pew.onmessage = (e) => { sim.pe = e.data; sim.peGot = true; sim.peNew = true; };
      sim.pew.postMessage({ type: "init", p: peParams(sim.p) });
    } else { sim.pew.postMessage({ type: "params", p: peParams(sim.p) }); sim.pew.postMessage({ type: "pause", paused: sim.paused }); }
    sim.speed = Math.min(sim.speed, 1);
    if (sim.slabOn && sim.parts) { sim.slabOn = false; sim.parts.setSlab(null); }   // the slab's wrap is exact only when every longitude is alike
  } else {
    sim.pew?.postMessage({ type: "stop" });
    sim.fillOn = false; simSurface();
    sim.scene?.setFlow(null, null); sim.hl = [];                   // the 3-D model's flow lines and highs/lows go with it
    if (!sim.worker) {
      sim.worker = simWorkerFor("2d");
      sim.worker.onmessage = (e) => {
        const m = e.data, s = sim.s;
        for (const k of ["u", "th", "psi", "v", "w", "Ts"]) s[k].set(m[k]);
        s.t = m.t; s.day = m.day; sim.fast = m.fast; sim.got = true;
      };
      sim.worker.postMessage({ type: "init", p: sim.p });
    } else sim.worker.postMessage({ type: "pause", paused: sim.paused });
  }
  simPost({ type: "speed", speed: sim.speed });
}
function setSimModel(m) {
  if (m === sim.model) return;
  sim.model = m;
  if (sim.on) startSimModel();
  syncSimControls(); simHud(); drawSimChart(); dirty = true;
}
const simDay = () => (sim.model === "3d" ? sim.pe?.day ?? sim.p.day : sim.s?.day ?? sim.p.day);
// The ground's colour: plain, Earth's map for reference, and the 3-D model's fill.
function simSurface() { sim.scene?.setSurface({ world: sim.showMap, fill: sim.fillOn ? sim.fillTex : null, land: sim.model === "3d" && !!sim.p?.land }); dirty = true; }
// The 3-D model's colour fill: a 128 x 64 texture remade whenever the worker reports.
function updatePEFill() {
  if (sim.model !== "3d" || sim.fill === "none" || !sim.pe) { sim.fillOn = false; simSurface(); return; }
  const f = PE_FILLS[sim.fill], m = sim.pe, n = m.nlat * m.nlon;
  let field = m.ps;
  if (sim.fill !== "ps") { const k = f.level === "bottom" ? m.L - 1 : m.sf.findIndex((x) => x >= 0.55); field = m.temp.subarray(k * n, (k + 1) * n).map((x) => x - 273.15); }
  const data = fillTexture(field, m.nlat, m.nlon, m.lat, f.stops, 128, 64);
  if (!sim.fillTex) {
    sim.fillTex = new THREE.DataTexture(data, 128, 64, THREE.RGBAFormat);
    sim.fillTex.magFilter = THREE.LinearFilter; sim.fillTex.minFilter = THREE.LinearFilter; sim.fillTex.wrapS = THREE.RepeatWrapping;
  } else sim.fillTex.image.data.set(data);
  sim.fillTex.needsUpdate = true;
  if (!sim.fillOn) { sim.fillOn = true; simSurface(); }
}
function peTick(dt, now) {
  if (!sim.peGot) return;
  const m = sim.pe, vl = simViewLon();
  sim.parts.vex = sim.vex;
  sim.parts.update3d(Math.min(dt, 0.1), m, { daysPerSec: sim.pdays, exag: sim.exag });
  if (sim.peNew) {
    sim.peNew = false; updatePEFill();
    if (now - (sim.lastHL ?? 0) > 400) { sim.lastHL = now; sim.hl = highsLows(m.ps, m.nlat, m.nlon, m.lat).slice(0, 16); }
    // flow lines of the wind near the ground (the lowest level), redrawn about once a second
    if (sim.flow && now - (sim.lastFlow ?? 0) > 900) {
      sim.lastFlow = now;
      const n = m.nlat * m.nlon, k = m.L - 1;
      sim.flowLines = flowLines(m.u.subarray(k * n, (k + 1) * n), m.v.subarray(k * n, (k + 1) * n), m.nlat, m.nlon, m.lat);
      sim.flowKey = `${m.t}`;
    }
  }
  sim.scene.setFlow(sim.flowKey, sim.flow ? sim.flowLines : null, { vex: sim.vex, W: root.clientWidth, Hpx: root.clientHeight });
  sim.scene.update({ dec: declination(m.day, sim.p.tilt), sunLon: vl + 60, showSun: sim.showSun, slab: null, vex: sim.vex, H: 16000, tropopauseKm: 11,
    W: root.clientWidth, Hpx: root.clientHeight,
    labels: sim.labels ? sim.hl.map((h) => ({ lat: h.lat, lon: h.lon, z: 0, text: `${h.kind} ${Math.round(h.hPa)}`, kind: h.kind })) : null,
    textbook: sim.textbook ? TEXTBOOK : null, arrows: null });
  if (now - sim.lastChart > 300) { drawSimChart(); simHud(); if (sim.p.seasons) syncSimControls(); sim.lastChart = now; }
}
function simTick(dt, now) {
  simViewOffset();
  if (sim.model === "3d") { peTick(dt, now); return; }
  if (!sim.got) return;
  sim.field = centredField(sim.s, sim.field);
  sim.parts.vex = sim.vex;
  sim.parts.update(Math.min(dt, 0.1), sim.field, { daysPerSec: sim.pdays, exag: sim.exag });
  const vl = simViewLon(), dec = declination(sim.s.day, sim.p.tilt);
  if (now - (sim.lastLabels ?? 0) > 300) {               // labels and arrows follow the model a few times a second
    sim.lastLabels = now;
    sim.modelLabels = sim.labels ? modelLabels(sim.s, simDiagnostics(sim.s), sim.p) : null;
    sim.arrowSet = sim.arrows ? coriolisArrows(sim.field, [vl - 15, vl + 15]) : null;
  }
  sim.scene.update({ dec, sunLon: vl + 60, showSun: sim.showSun, slab: sim.slabOn ? { lon0: sim.slabLon, width: sim.slabW } : null,
    vex: sim.vex, H: sim.s.H, tropopauseKm: sim.p.tropopauseKm, W: root.clientWidth, Hpx: root.clientHeight,
    labels: sim.modelLabels, labelLon: sim.slabOn ? sim.slabLon - sim.slabW / 2 - 4 : vl + 55, textbook: sim.textbook ? TEXTBOOK : null, arrows: sim.arrowSet });
  if (now - sim.lastChart > 300) { drawSimChart(); simHud(); if (sim.p.seasons) syncSimControls(); sim.lastChart = now; }
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dayLabel(day) { const d = new Date(Date.UTC(2025, 0, Math.round(day))); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; }
const latText = (x) => `${Math.abs(x).toFixed(1)}°${x >= 0 ? "N" : "S"}`;
function drawPEChart() {
  const m = sim.pe;
  if (!m) { $("simDiag").textContent = "Starting the 3-D model…"; return; }
  const cv = $("simChartCanvas"), dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth || 600, H = cv.clientHeight || 240;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const mean = sim.chartMean, u = mean ? m.meanU : m.ubar, psi = mean ? m.meanPsi : m.psi;
  const r = drawPESection(ctx, W, H, { L: m.L, nlat: m.nlat, lat: m.lat, sf: m.sf, sh: m.sh, u, psi },
    { title: `${mean ? "Last 30 days" : "Right now"}: east–west wind (colour) · overturning (lines, 10¹⁰ kg/s; dashed the other way)` });
  $("simChartInfo").textContent = `Averaged round the globe${mean ? " and over the last 30 days" : " (right now)"} · ${dayLabel(m.day)} · Sun overhead at ${latText(declination(m.day, sim.p.tilt))}`;
  const b = surfaceBelts(m.meanU, m.L, m.nlat, m.lat), f1 = (x) => (Number.isFinite(x) ? `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(1)}` : "—");
  const cells = r.cells.map((c) => { const v = Math.abs(c.psi) / 1e10; return `${c.name} ${Math.abs(c.lat).toFixed(0)}°${c.lat >= 0 ? "N" : "S"} (${v.toFixed(v < 1 ? 1 : 0)})`; }).join(", ");
  $("simDiag").innerHTML = [
    `<b>Surface winds</b> (30-day mean, + from the west): trades ${f1(b.tradesN)} / ${f1(b.tradesS)} m/s, mid-latitudes ${f1(b.westN)} / ${f1(b.westS)}, polar ${f1(b.polarN)} / ${f1(b.polarS)} (north / south).`,
    `<b>Cells</b> ${mean ? "(30-day mean)" : "(right now)"}: ${cells || "none clear yet"}; strengths in 10¹⁰ kg/s.`,
    `<b>Storms</b>: surface pressure ${m.psMin.toFixed(0)}–${m.psMax.toFixed(0)} hPa; eddy energy ${m.eke.toFixed(0)} m²/s².`,
  ].join("<br>");
  const st = simStepNow();
  if (st?.note && st.model === "3d" && $("simNote")) $("simNote").textContent = st.note({ pe: m, cells: r.cells, belts: b }) ?? "";
}
function drawSimChart() {
  if (sim.model === "3d") { drawPEChart(); return; }
  const cv = $("simChartCanvas"), dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth || 600, H = cv.clientHeight || 240;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const d = simDiagnostics(sim.s), dec = declination(sim.s.day, sim.p.tilt);
  drawSimSection(ctx, W, H, sim.s, d, { tropopauseKm: sim.p.tropopauseKm, sunLat: sim.showSun ? dec : null, title: "East–west wind (colour) · the overturning (arrows)",
    labels: sim.labels ? modelLabels(sim.s, d, sim.p) : null, textbook: sim.textbook ? TEXTBOOK : null });
  const st = simStepNow();
  if (st?.note && $("simNote")) $("simNote").textContent = sim.fast ? "Fast-forwarding to the new balance…" : st.note(d, sim.p) ?? "";
  $("simChartInfo").textContent = `Averaged round the globe: a north–south cross-section · ${dayLabel(sim.s.day)} · Sun overhead at ${latText(dec)}`;
  const f = (x, dp = 0) => (Number.isFinite(x) ? x.toFixed(dp) : "—");
  $("simDiag").innerHTML = [
    Number.isFinite(d.north.edge) || Number.isFinite(d.south.edge)
      ? `<b>Hadley cells</b> reach ${f(d.north.edge)}°N and ${f(d.south.edge)}°S${sim.p.rotation === 0 ? " (no rotation: nearly to the poles)" : ""}.`
      : "<b>Hadley cells</b>: not formed yet; the air is just starting to move.",
    sim.p.rotation < 0
      ? `<b>Jets</b>: spinning backwards, everything mirrors: the jets blow from the east (strongest ${f(Math.min(...sim.s.u))} m/s) and the trades from the west.`
      : `<b>Jets</b>: ${d.jetN.u > 5 ? `${f(d.jetN.u)} m/s at ${f(d.jetN.lat)}°N` : "none north"}, ${d.jetS.u > 5 ? `${f(d.jetS.u)} m/s at ${f(-d.jetS.lat)}°S` : "none south"}.`,
    `<b>Trade winds</b> (strongest easterly at the surface): ${f(-d.tradesN, 1)} m/s north, ${f(-d.tradesS, 1)} m/s south.`,
    d.wItczCmS >= 0.01 ? `<b>ITCZ</b> (strongest rising air): ${f(Math.abs(d.itcz))}°${d.itcz >= 0 ? "N" : "S"}.` : "<b>ITCZ</b>: no rising air yet.",
    `<b>Equator–pole temperature difference</b> at the ground: ${f(d.contrastK)} K.`,
  ].join("<br>");
}
function simHud() {
  if (sim.model === "3d") {
    const m = sim.pe, badge = $("hudInterp");
    $("hudValid").textContent = `Simulation, 3-D · ${dayLabel(simDay())}`;
    $("hudLead").textContent = m ? `${Math.round(m.t / 86400)} model days since the spun-up start${sim.paused ? " · paused" : ""}` : "starting…";
    $("hudRun").textContent = "a simplified model, not the real weather";
    badge.hidden = false;
    badge.textContent = [sim.p.land ? "a dry 3-D model with Earth's continents (outlined): the storms grow by themselves" : "a dry 3-D model of an ocean planet: the storms grow by themselves",
      `particles: winds at true speed, rising and sinking ×${sim.exag}, heights ×${sim.vex}; pale low, orange high`,
      sim.fill !== "none" ? `colour: ${PE_FILLS[sim.fill].label}` : null].filter(Boolean).join(" · ");
    return;
  }
  const s = sim.s, days = s.t / 86400;
  $("hudValid").textContent = `Simulation · ${dayLabel(s.day)}`;
  $("hudLead").textContent = `${Math.round(days)} model days${sim.fast ? " · fast-forwarding to the new balance" : sim.paused ? " · paused" : ""}`;
  $("hudRun").textContent = "a simplified model, not the real weather";
  const badge = $("hudInterp");
  badge.hidden = false;
  badge.textContent = [
    "averaged round each latitude, sunlight only: no land, storms or moisture yet",
    `particles: east–west wind true speed, overturning ×${sim.exag}, heights ×${sim.vex}; pale low, orange high`,
  ].join(" · ");
}
const SPIN_DAY = (r) => (r === 0 ? "no spin: no Coriolis effect" : `a ${+(24 / Math.abs(r)).toFixed(1)}-hour day${r < 0 ? ", spinning backwards" : ""}`);
function syncSimControls() {
  const p = sim.p, day = simDay(), dec = declination(day, p.tilt), is3 = sim.model === "3d";
  $("simModel").value = sim.model;
  const spd = is3 ? [[0.25, "¼ day a second"], [0.5, "½ day a second"], [1, "1 day a second (as fast as it can)"]] : [[1, "1 day a second"], [5, "5 days a second"], [15, "15 days a second (as fast as your computer allows)"]];
  if ($("simSpeed").dataset.model !== sim.model) { $("simSpeed").innerHTML = spd.map(([v, t]) => `<option value="${v}">${t}</option>`).join(""); $("simSpeed").dataset.model = sim.model; }
  for (const id of ["simFillRow", "simMeanRow", "simLandRow"]) $(id).hidden = !is3;
  $("simLand").checked = !!p.land;
  for (const id of ["simSlabWrap", "simArrowsWrap"]) $(id).hidden = is3;
  $("simSlabRow").hidden = is3 || !sim.slabOn;
  $("simLabelsText").textContent = is3 ? "labels: the highs and lows (from the model's surface pressure)" : "labels on the model (its cells, rising and sinking air, winds)";
  $("simFill").value = sim.fill; $("simMean").checked = sim.chartMean;
  $("simRot").value = String(p.rotation); $("simRotVal").textContent = `${p.rotation}× Earth (${SPIN_DAY(p.rotation)})`;
  $("simTilt").value = String(p.tilt); $("simTiltVal").textContent = `${p.tilt}°${p.tilt === SIM_DEFAULTS.tilt ? " (Earth)" : p.tilt === 0 ? " (no seasons)" : ""}`;
  $("simDay").value = String(Math.round(day)); $("simDayVal").textContent = `${dayLabel(day)}: Sun overhead at ${latText(dec)}`;
  $("simDay").disabled = p.seasons;
  $("simSeasons").checked = p.seasons;
  $("simContrast").value = String(p.contrastK); $("simContrastVal").textContent = `${p.contrastK} K${p.contrastK === SIM_DEFAULTS.contrastK ? " (Earth)" : ""}`;
  $("simInertia").value = String(p.inertiaDays);
  $("simInertiaVal").textContent = `${p.inertiaDays} days (${p.inertiaDays <= 15 ? "land-like: quick to warm and cool" : p.inertiaDays >= 60 ? "deep ocean-like: slow, small seasons" : "a mixed ocean surface"})`;
  $("simSpeed").value = String(sim.speed); $("simExag").value = String(sim.exag); $("simVex").value = String(sim.vex);
  $("simSlabOn").checked = sim.slabOn; $("simSlabW").value = String(sim.slabW); $("simSlabWVal").textContent = `${sim.slabW}° of longitude`;
  $("simMap").checked = sim.showMap; $("simSun").checked = sim.showSun;
  $("simCount").value = String(sim.count); $("simCountVal").textContent = sim.count.toLocaleString();
  $("simPdays").value = String(sim.pdays); $("simPdaysVal").textContent = `${sim.pdays} model days a second`;
  $("simSize").value = String(sim.size); $("simSizeVal").textContent = `${sim.size} px`;
  $("simOpacity").value = String(sim.opacity); $("simOpacityVal").textContent = `${Math.round(sim.opacity * 100)} %`;
  $("simTail").value = String(sim.tailSec); $("simTailVal").textContent = sim.tailSec ? `${sim.tailSec} s of travel` : "none";
  $("simBand").value = sim.band; $("simFlow").checked = sim.flow; $("simFlowRow").hidden = !is3;
  $("simPause").textContent = sim.paused ? "▶ Run" : "❚❚ Pause";
  $("simLabels").checked = sim.labels; $("simArrows").checked = sim.arrows; $("simTextbook").checked = sim.textbook;
}
// A settings change: the worker fast-forwards to the new balance (unless the seasons are running).
function simChanged() { simPost({ type: "params", p: sim.p, settleDays: 5 * sim.p.tauRadDays }); syncSimControls(); simHud(); }
for (const [id, key] of [["simRot", "rotation"], ["simTilt", "tilt"], ["simContrast", "contrastK"], ["simInertia", "inertiaDays"]])
  $(id).addEventListener("input", (e) => { sim.p[key] = Number(e.target.value); simChanged(); });
$("simDay").addEventListener("input", (e) => { sim.p.day = Number(e.target.value); sim.s.day = sim.p.day; simChanged(); });
$("simSeasons").addEventListener("change", (e) => { sim.p.seasons = e.target.checked; if (!sim.p.seasons) sim.p.day = Math.round(simDay()); simChanged(); });
$("simSpeed").addEventListener("change", (e) => { sim.speed = Number(e.target.value); simPost({ type: "speed", speed: sim.speed }); });
$("simModel").addEventListener("change", (e) => setSimModel(e.target.value));
$("simLand").addEventListener("change", (e) => { sim.p.land = e.target.checked; simChanged(); simSurface(); });
$("simFill").addEventListener("change", (e) => { sim.fill = e.target.value; updatePEFill(); simHud(); dirty = true; });
$("simMean").addEventListener("change", (e) => { sim.chartMean = e.target.checked; drawSimChart(); });
$("simExag").addEventListener("change", (e) => { sim.exag = Number(e.target.value); simHud(); });
$("simVex").addEventListener("change", (e) => { sim.vex = Number(e.target.value); simHud(); dirty = true; });
$("simSlabOn").addEventListener("change", (e) => { sim.slabOn = e.target.checked; sim.slabLon = simViewLon() + 90; sim.parts.setSlab(sim.slabOn ? { lon0: sim.slabLon, width: sim.slabW } : null); syncSimControls(); });
$("simSlabW").addEventListener("input", (e) => { sim.slabW = Number(e.target.value); sim.parts.setSlab({ lon0: sim.slabLon, width: sim.slabW }); syncSimControls(); });
$("simSlabHere").addEventListener("click", () => { sim.slabLon = simViewLon() + 90; sim.parts.setSlab({ lon0: sim.slabLon, width: sim.slabW }); });
$("simCount").addEventListener("input", (e) => { sim.count = Number(e.target.value); sim.parts.setCount(sim.count); syncSimControls(); });
$("simPdays").addEventListener("input", (e) => { sim.pdays = Number(e.target.value); syncSimControls(); });
$("simSize").addEventListener("input", (e) => { sim.size = Number(e.target.value); sim.parts.size = sim.size; syncSimControls(); dirty = true; });
$("simOpacity").addEventListener("input", (e) => { sim.opacity = Number(e.target.value); sim.parts.opacity = sim.opacity; syncSimControls(); dirty = true; });
$("simTail").addEventListener("input", (e) => { sim.tailSec = Number(e.target.value); sim.parts.tail = sim.tailSec; syncSimControls(); dirty = true; });
const SIM_BANDS = { all: null, low: { lo: 50, hi: 1500 }, jet: { lo: 8000, hi: 12500 } };
$("simBand").addEventListener("change", (e) => { sim.band = e.target.value; sim.parts.setBand(SIM_BANDS[sim.band]); dirty = true; });
$("simFlow").addEventListener("change", (e) => { sim.flow = e.target.checked; sim.lastFlow = 0; dirty = true; });
$("simMap").addEventListener("change", (e) => { sim.showMap = e.target.checked; simSurface(); });
$("simSun").addEventListener("change", (e) => { sim.showSun = e.target.checked; drawSimChart(); });
$("simPause").addEventListener("click", () => { sim.paused = !sim.paused; simPost({ type: "pause", paused: sim.paused }); syncSimControls(); simHud(); });
$("simRest").addEventListener("click", () => { simPost({ type: "reset", p: sim.p }); });
// ---- lessons (simlessons.js): guided steps, each setting the planet and the view ----
const simStepNow = () => (sim.lesson ? sim.lesson.steps[sim.step] : null);
$("simLesson").innerHTML += SIM_LESSONS.map((l) => `<option value="${l.id}">${l.title}</option>`).join("");
function applySimStep() {
  const st = simStepNow();
  $("simPlayer").hidden = !st;
  if (!st) return;
  const v = st.view ?? {};
  if (st.start !== "keep") sim.p = { ...SIM_DEFAULTS, ...st.set };
  setSimModel(st.model ?? "2d");
  if (st.start === "rest") simPost({ type: "reset", p: sim.p });
  else if (st.start === "spunup") simPost({ type: "restart", fromRest: false, p: sim.p, from: st.from ?? "aqua" });
  else if (st.start === "settle") simPost({ type: "params", p: sim.p, settleDays: 60 });
  sim.s.day = sim.p.day;
  if (v.fill) sim.fill = v.fill;
  if (v.flow != null) { sim.flow = v.flow; sim.lastFlow = 0; }
  if (v.band && v.band !== sim.band) { sim.band = v.band; sim.parts.setBand(SIM_BANDS[sim.band]); }
  simSurface();
  if (v.mean != null) sim.chartMean = v.mean;
  if (v.speed) { sim.speed = v.speed; simPost({ type: "speed", speed: sim.speed }); }
  for (const k of ["exag", "vex"]) if (v[k]) sim[k] = v[k];
  for (const [k, key] of [["labels", "labels"], ["arrows", "arrows"], ["textbook", "textbook"]]) if (v[k] != null) sim[key] = v[k];
  if (v.sun != null) sim.showSun = v.sun;
  if (v.slab != null && v.slab !== sim.slabOn && sim.model !== "3d") { sim.slabOn = v.slab; sim.slabLon = simViewLon() + 90; }
  sim.parts.setSlab(sim.slabOn ? { lon0: sim.slabLon, width: sim.slabW } : null);
  if (sim.paused) { sim.paused = false; simPost({ type: "pause", paused: false }); }
  const n = sim.lesson.steps.length;
  $("simStepNo").textContent = ` step ${sim.step + 1} of ${n} `;
  $("simPrev").disabled = sim.step === 0; $("simNext").disabled = sim.step === n - 1;
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  $("simCard").innerHTML = `<h4>${esc(st.title)}</h4>
    <table>${Object.entries(st.key ?? {}).map(([k, t]) => `<tr><td>${esc(k)}</td><td>${esc(t)}</td></tr>`).join("")}</table>
    <p><b>Why:</b> ${esc(st.why)}</p><p><b>Look for:</b> ${esc(st.lookFor)}</p><p class="simnote" id="simNote"></p>`;
  syncSimControls(); simHud(); drawSimChart(); dirty = true;
}
$("simLesson").addEventListener("change", (e) => { sim.lesson = SIM_LESSONS.find((l) => l.id === e.target.value) ?? null; sim.step = 0; applySimStep(); });
$("simPrev").addEventListener("click", () => { if (sim.step > 0) { sim.step--; applySimStep(); } });
$("simNext").addEventListener("click", () => { if (sim.lesson && sim.step < sim.lesson.steps.length - 1) { sim.step++; applySimStep(); } });
$("simLabels").addEventListener("change", (e) => { sim.labels = e.target.checked; sim.lastLabels = 0; drawSimChart(); });
$("simArrows").addEventListener("change", (e) => { sim.arrows = e.target.checked; sim.lastLabels = 0; });
$("simTextbook").addEventListener("change", (e) => { sim.textbook = e.target.checked; drawSimChart(); });
// Quick set-ups: each a planet to compare with Earth (the lessons will walk through them).
const SIM_PRESETS = {
  nospin: { rotation: 0 }, earth: {}, june: { day: 172 }, december: { day: 355 }, fast: { rotation: 4 }, notilt: { tilt: 0, day: 172 },
};
for (const b of document.querySelectorAll("[data-simpreset]")) b.addEventListener("click", () => {
  sim.p = { ...SIM_DEFAULTS, ...SIM_PRESETS[b.dataset.simpreset] };
  sim.s.day = sim.p.day; simChanged();
});
$("yearPrev").addEventListener("click", () => archStep(-1));
$("yearNext").addEventListener("click", () => archStep(1));
$("yearPlay").addEventListener("click", () => archPlay(!arch.playing));
$("yearSlider").addEventListener("input", (e) => { archPlay(false); archGo(Number(e.target.value)); });
for (const id of ["yearView", "yearMode", "yearLines", "yearWind", "yearWindAs"]) $(id).addEventListener("change", () => {
  arch.view = $("yearView").value; arch.mode = $("yearMode").value; arch.lines = $("yearLines").value;
  arch.wind = $("yearWind").value; arch.windAs = $("yearWindAs").value;
  custom();
  archShow(); if (probeAt) archProbe();
});

resize();
applyQuestion(QUESTIONS[0], true);     // opens on "Where's the weather now?"

// ---- 3-D particles (particles3d.js) ----------------------------------------------------
// Particles at every height in a horizontal slab (user request: "all on,
// then a slab you scroll through by altitude and adjust thickness, like CT
// scans"). Winds come from all the levels of the two real steps around the
// time shown (sectionData, like the slice), filled linearly in height.
// The wind (and the region's quantity Q, to colour by; null = none) of steps
// A and B, for windAt: the particles blend the two, the flow lines use one.
// The 10 m wind is the column's bottom, 10 m above the ground (ground height
// from surface pressure, standard atmosphere), so they reach the surface.
function buildWindField(A, B, Q) {
  const sfc10 = (S) => { const g = new Float32Array(S.psfc.length); for (let q = 0; q < g.length; q++) g[q] = groundHeight(S.psfc[q]) + 10; return g; };
  const wind = Q === "speed" || Q === "across" || Q === "along";          // coloured by wind speed, kt
  const lq = (L, p) => {
    if (!Q) return null;
    const n = L.gh.length, o = new Float32Array(n);
    for (let k = 0; k < n; k++) o[k] = wind ? Math.hypot(L.u[k], L.v[k]) * KT : Q === "temp" ? L.t[k] - 273.15 : Q === "theta" ? L.t[k] * Math.pow(1000 / p, 0.2857) : Q === "rh" ? L.r[k] : L[Q] ? L[Q][k] : NaN;
    return o;
  };
  const sq = (S) => {
    if (!wind && Q !== "temp" && Q !== "theta") return null;
    const n = S.t2m.length, o = new Float32Array(n);
    for (let k = 0; k < n; k++) o[k] = wind ? Math.hypot(S.u10[k], S.v10[k]) * KT : Q === "temp" ? S.t2m[k] - 273.15 : S.t2m[k] * Math.pow(100000 / S.psfc[k], 0.2857);
    return o;
  };
  return { t: 0, psfcA: A.sfc.psfc, psfcB: B.sfc.psfc, levels: [
    { p: 0, ghA: sfc10(A.sfc), ghB: sfc10(B.sfc), uA: A.sfc.u10, uB: B.sfc.u10, vA: A.sfc.v10, vB: B.sfc.v10, qA: sq(A.sfc), qB: sq(B.sfc) },
    ...manifest.levels.map((p) => ({
      p, ghA: A.levels[p].gh, ghB: B.levels[p].gh, uA: A.levels[p].u, uB: B.levels[p].u, vA: A.levels[p].v, vB: B.levels[p].v,
      wA: A.levels[p].w ?? null, wB: B.levels[p].w ?? null, qA: lq(A.levels[p], p), qB: lq(B.levels[p], p) }))] };
}
function p3Field() {
  const { i0, i1, t } = timeline.segment();
  const key = `${model}:${leads[i0]}:${leads[i1]}:${p3.colorBy === "q" ? roi.qty : ""}`;
  if (p3.key !== key) {
    const A = sectionData(model, leads[i0]), B = sectionData(model, leads[i1]);
    if (!A || !B) return null;
    p3.key = key;
    p3.field = buildWindField(A, B, p3.colorBy === "q" ? roi.qty : null);
  }
  p3.field.t = t;
  return p3.field;
}
// ---- 3-D flow lines (stream3d.js, strokes3d.js) --------------------------------------
// Lines following the wind through the region from seeds inside it, at the
// NEARER real step (a snapshot), coloured by the region's quantity or by
// height, fading toward their start so the direction of flow reads. Rebuilt
// only when the step, the region or a setting changes.
function updateFlow3d() {
  const was = !!fl3.obj?.object.visible;
  const hide = () => { if (fl3.obj) fl3.obj.object.visible = false; if (was) { updateHud(); updateLegend(); } };
  if (!fl3.on || arch.on || timeline.beforeModel || timeline.afterModel) { hide(); return; }
  const lead = nearerLead(), data = sectionData(model, lead);
  if (!data) return;                                  // loading: sectionData calls back through updateSection
  if (!fl3.obj) {
    fl3.obj = new Strokes3D(geo);
    fl3.obj.setVex(Math.pow(10, Number(vexSlider.value))); fl3.obj.setViewport(root.clientWidth, root.clientHeight);
    scene.add(fl3.obj.object);
  }
  const [lo, hi] = regionHeights(roi), f = roiFrame();
  const byQ = fl3.colorBy === "q" && p3QScale();
  const key = `${model}:${lead}:${roi.shape}:${lo}:${hi}:${roiKey()}:${byQ ? roi.qty : "h"}:${fl3.count}:${fl3.hours}:${fl3.vertical}:${particlePalette}:${!!satShown}`;
  const rebuilt = key !== fl3.key;
  if (rebuilt) {
    const field = buildWindField(data, data, byQ ? roi.qty : null), g = manifest.grid, r = rng(1234567);
    const region = f ? particleRegion(f) : null, seeds = [];
    for (let k = 0; k < fl3.count; k++) {
      let fi, fj;
      if (f) {
        const [lat, lon0] = inverseMercatorKm(...wallSeed(f, r(), r())), lon = lon0 < g.lon0 ? lon0 + 360 : lon0;
        fi = (lon - g.lon0) / g.dlon; fj = (lat - g.lat0) / g.dlat;
      } else { fi = r() * (g.nlon - 1.001); fj = r() * (g.nlat - 1.001); }
      seeds.push([fi, fj, (lo + r() * (hi - lo)) * 1000]);
    }
    const traced = traceFlow(field, g, seeds, { dt: 1800, steps: fl3.hours * 2, vertical: HAS_W ? fl3.vertical : 0,
      inside: region ? (fi, fj) => region.inside(fi, fj) : null, loKm: lo, hiKm: hi });
    const lines = traced.map((pts) => pts.map(([fi, fj, z, q], i) => {
      const [cr, cg, cb] = byQ ? p3QColor(q) : p3Color(z, 0, 0, NaN);
      return { lon: g.lon0 + fi * g.dlon, lat: g.lat0 + fj * g.dlat, z, r: cr, g: cg, b: cb, a: 0.15 + 0.85 * (i / (pts.length - 1)) };
    }));
    fl3.obj.build(key, lines);
    fl3.key = key; fl3.lines = lines.length;
  }
  fl3.obj.setOpacity(fl3.opacity);
  fl3.obj.object.visible = true;
  if (!was || rebuilt) { updateHud(); updateLegend(); }        // its note and key appear (or change) with it
  dirty = true;
}
// Colour by height: the levels' own colours at their typical heights, blended
// between (light versions over the satellite); or by wind speed.
const P3_SPEED_LUT = lut(SCALES.sec_speed.stops, SCALES.sec_speed.min, SCALES.sec_speed.max);
function p3Stops() {
  const light = particlePalette === "light" || (particlePalette === "auto" && !!satShown);
  return [["sfc", 0], ...manifest.levels.map((p) => [`p${p}`, STD_KM[`p${p}`] * 1000])].sort((a, b) => a[1] - b[1])
    .map(([k, m]) => [m, new THREE.Color(light ? PARTICLE_COLORS_LIGHT[k] : levelColor(k))]);
}
const P3_W_LUT = lut(SCALES.sec_w.stops, SCALES.sec_w.min, SCALES.sec_w.max);
// The region's quantity at a particle (particles3d_math windAt's q), through its
// scale; wind across/along a wall colour by speed; anomalies can't (by height).
const p3QScale = () => ({ speed: "sec_speed", across: "sec_speed", along: "sec_speed", w: "sec_w", vort: "sec_vort", div: "sec_div", ti: "sec_ti", ri: "sec_ri",
  temp: "sec_temp", theta: "sec_theta", stab: "sec_stab", rh: "sec_rh", thetae: "sec_thetae", grad: "sec_grad", fgen: "sec_fgen" }[roi.qty] ?? null);
// The region's quantity at a particle (particles3d_math windAt's q), through its scale.
let p3QLut = null, p3QKey = null;
function p3QColor(v) {
  const sk = p3QScale(), sc = SCALES[sk];
  if (p3QKey !== sk) { p3QLut = lut(sc.stops, sc.min, sc.max); p3QKey = sk; }
  if (!Number.isFinite(v)) return [0.55, 0.58, 0.62];              // no value there: grey
  const i = Math.max(0, Math.min(255, Math.round(((v - sc.min) / (sc.max - sc.min)) * 255))) * 4;
  return [p3QLut[i] / 255, p3QLut[i + 1] / 255, p3QLut[i + 2] / 255];
}
function p3Color(zM, speed, w, q) {
  if (p3.colorBy === "q" && p3QScale()) return p3QColor(p3QScale() === "sec_speed" && !Number.isFinite(q) ? speed * KT : q);
  if (p3.colorBy === "w") {
    const i = Math.max(0, Math.min(255, Math.round(((w - SCALES.sec_w.min) / (SCALES.sec_w.max - SCALES.sec_w.min)) * 255))) * 4;
    return [P3_W_LUT[i] / 255, P3_W_LUT[i + 1] / 255, P3_W_LUT[i + 2] / 255];
  }
  if (p3.colorBy === "speed") {
    const i = Math.max(0, Math.min(255, Math.round(((speed * KT - SCALES.sec_speed.min) / (SCALES.sec_speed.max - SCALES.sec_speed.min)) * 255))) * 4;
    return [P3_SPEED_LUT[i] / 255, P3_SPEED_LUT[i + 1] / 255, P3_SPEED_LUT[i + 2] / 255];
  }
  const st = p3.stops ?? (p3.stops = p3Stops());
  let k = 0;
  while (k < st.length - 2 && zM > st[k + 1][0]) k++;
  const [m0, c0] = st[k], [m1, c1] = st[k + 1], f = Math.max(0, Math.min(1, (zM - m0) / (m1 - m0)));
  return [c0.r + (c1.r - c0.r) * f, c0.g + (c1.g - c0.g) * f, c0.b + (c1.b - c0.b) * f];
}
function p3Changed() {
  $("p3Body").hidden = !p3.on;
  // The region's heights (and, for a wall, its band).
  const [lo, hi] = regionHeights(roi);
  p3.zKm = lo; p3.thickKm = hi - lo;
  if (p3.on && !pvol) {
    pvol = new ParticleVolume(manifest.grid, geo, { count: 12000, colorAt: p3Color });
    pvol.material.uniforms.opacity.value = p3.opacity ?? 0.9;
    pvol.material.uniforms.vex.value = Math.pow(10, Number(vexSlider.value));
    scene.add(pvol.object);
  }
  if (pvol) {
    pvol.object.visible = p3.on;
    pvol.vertical = HAS_W ? p3.vertical : 0;
    pvol.setSlab(lo * 1000, hi * 1000);
    const f = roiFrame();
    pvol.setRegion(f ? particleRegion(f) : null, roiKey());
    // More particles for a thicker slab, so each height keeps its density.
    pvol.setCount(Math.min(12000, 1500 + 700 * (hi - lo)) * p3.density);
    if (p3.on) for (const i of [timeline.segment().i0, timeline.segment().i1]) sectionData(model, leads[i]);   // start loading
  }
  updateHud(); updateLegend(); dirty = true;
}
$("p3Toggle").addEventListener("change", (e) => { p3.on = e.target.checked; p3Changed(); applyRoiFade(); });
$("p3Color").addEventListener("change", (e) => { p3.colorBy = e.target.value; p3.key = null; updateLegend(); });
$("p3Vert").addEventListener("change", (e) => { p3.vertical = Number(e.target.value); p3Changed(); });
$("p3Density").addEventListener("input", (e) => { p3.density = Number(e.target.value); p3Changed(); });
// ---- the horizontal plane (Phase 3) --------------------------------------------------
// A map of one quantity at one height (section.js heightMap), drawn as a flat
// sheet at that height (a GridLayer: blended between the two real steps like
// the levels, stretched with them), with contour lines, and as a flat chart.
const HP_LABEL = { speed: "wind speed", temp: "temperature", theta: "potential temperature θ", rh: "humidity", w: "vertical motion (+ rising)" };
const HP_LINES = { pressure: 4, theta: 4, speed: 20 };
function hpMap(lead, qty, fill = false) {
  const dq = fill && diff3d(qty);
  const key = `${model}:${lead}:${hp.zKm}:${qty}${dq ? ":d" : ""}`;
  if (hp.cache.has(key)) return hp.cache.get(key);
  const data = dq ? diffData(lead, qty) : sectionData(model, lead);
  if (!data) return null;
  let v = heightMap(data, manifest.grid, dq ? "dq" : qty, hp.zKm * 1000);
  if (dq) v = clampTo(v, D3_RANGE[qty]);
  hp.cache.set(key, v);
  if (hp.cache.size > 16) hp.cache.delete(hp.cache.keys().next().value);
  return v;
}
function hpSlot(values, lines) {
  const n = values.length, f = new Float32Array(n), o = new Float32Array(n), c = new Float32Array(n), h = new Float32Array(n).fill(hp.zKm * 1000);
  for (let k = 0; k < n; k++) {
    const ok = Number.isFinite(values[k]);
    f[k] = ok ? values[k] : 0; o[k] = ok ? 1 : 0; c[k] = lines && Number.isFinite(lines[k]) ? lines[k] : 0;
  }
  return { h, f, o, c };
}
function updateHPlane() {
  const was = !!hp.layer?.visible;
  if (!hp.on || timeline.beforeModel || timeline.afterModel || arch.on) {
    if (hp.layer) hp.layer.visible = false; hp.key = null;
    if (was) { updateLegend(); updateHud(); drawChart(); }
    return;
  }
  const { i0, i1, t } = timeline.segment();
  const lq = hp.lines === "none" ? null : hp.lines;
  const vA = hpMap(leads[i0], hp.qty, true), vB = hpMap(leads[i1], hp.qty, true);
  const lA = lq && hpMap(leads[i0], lq), lB = lq && hpMap(leads[i1], lq);
  if (!vA || !vB || (lq && (!lA || !lB))) return;          // loading: sectionData calls back through updateSection
  if (!hp.layer) {
    hp.layer = new GridLayer(manifest.grid, geo, { lift: 0, lineColor: "#0b0f14", lineWidth: 1.3, renderOrder: 705 });
    hp.layer.uniforms.vex.value = Math.pow(10, Number(vexSlider.value));
    hp.layer.uniforms.shade.value = false;
    // The plane stops at the region's edge (its own roiDim of 0), where the other levels only fade.
    hp.layer.uniforms.roiDim = { value: 0 };
    scene.add(hp.layer.mesh);
  }
  const key = `${model}:${leads[i0]}:${leads[i1]}:${hp.zKm}:${hp.qty}:${hp.lines}:${diff3d(hp.qty)}`;
  if (key !== hp.key) {
    hp.layer.setSlot("A", key + "A", hpSlot(vA, lA)); hp.layer.setSlot("B", key + "B", hpSlot(vB, lB));
    hp.layer.setFill(secScale(hp.qty), SCALES[secScale(hp.qty)]);
    hp.layer.uniforms.showLines.value = !!lq;
    if (lq) hp.layer.uniforms.cInterval.value = HP_LINES[lq];
    hp.key = key; hpChartKey = null;
  }
  hp.layer.uniforms.t.value = t;
  hp.layer.uniforms.fillOpacity.value = hp.opacity;
  hp.layer.visible = true;
  if (!was) { updateLegend(); updateHud(); }        // its key and note appear with it
  drawChart();
  dirty = true;
}
// The flat chart of the plane: the NEARER real step, like the slice's chart.
let hpChartKey = null;
function drawHChart() {
  const box = $("secChart");
  box.hidden = !(hp.on && secChartOn && hp.layer?.visible);
  if (box.hidden) return;
  const cv = $("secChartCanvas"), dpr = Math.min(2, devicePixelRatio || 1), lead = nearerLead();
  const W = cv.clientWidth, H = cv.clientHeight, lq = hp.lines === "none" ? null : hp.lines;
  const key = `${model}:${lead}:${hp.zKm}:${hp.qty}:${hp.lines}:${W}x${H}:${diff3d(hp.qty)}`;
  if (key === hpChartKey) return;
  const values = hpMap(lead, hp.qty, true), lines = lq ? hpMap(lead, lq) : null;
  if (!values || (lq && !lines)) return;
  hpChartKey = key;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sc = SCALES[secScale(hp.qty)], g = manifest.grid;
  const title = `${diff3d(hp.qty) ? "GFS − ECMWF: " : ""}${HP_LABEL[hp.qty]} (${sc.units}) at ${fmtHeight(hp.zKm * 1000, hUnit)} (≈${stdPressureMb(hp.zKm * 1000)} mb)${lq ? ` · lines: ${lq === "pressure" ? "pressure every 4 hPa" : lq === "theta" ? "θ every 4 K" : "wind every 20 kt"}` : ""} · ${sourceText(lead)}, nearest real step`;
  const r = drawMapChart(ctx, W, H, { values, lines, nlat: g.nlat, nlon: g.nlon, lat0: g.lat0, dlat: g.dlat, lon0: g.lon0, dlon: g.dlon,
    lineInterval: lq ? HP_LINES[lq] : 1, lut: lut(sc.stops, sc.min, sc.max), min: sc.min, max: sc.max, coast: coastLines, title });
  $("secChartInfo").textContent = `Plane at ${fmtHeightBoth(hp.zKm * 1000, hUnit)} (≈${stdPressureMb(hp.zKm * 1000)} mb) — between the model's levels interpolated; dark grey: below ground`;
  cv.onmousemove = (e) => {
    const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top, P = r.plot;
    if (x < P.x || x > P.x + P.w || y < P.y || y > P.y + P.h) { $("secChartHover").textContent = ""; return; }
    const i = Math.round(((x - P.x) / P.w) * (g.nlon - 1)), j = Math.round(((y - P.y) / P.h) * (g.nlat - 1)), k = j * g.nlon + i;
    const v = values[k], pr = hpMap(lead, "pressure")?.[k];
    $("secChartHover").textContent = `${fmtLat(g.lat0 + j * g.dlat)} ${fmtLon(g.lon0 + i * g.dlon)} · ${Number.isFinite(v) ? `${v.toFixed(hp.qty === "temp" || hp.qty === "theta" ? 1 : 0)} ${sc.units}` : "below ground"}${Number.isFinite(pr) ? ` · pressure ${pr.toFixed(1)} hPa` : ""}`;
  };
}
function syncHPlaneControls(lo = regionHeights(roi)[0], hi = regionHeights(roi)[1]) {
  $("hpBody").hidden = !hp.on;
  const z = $("hpZ"); z.min = String(lo); z.max = String(hi); z.value = String(hp.zKm);
  $("hpZVal").textContent = `${fmtHeightBoth(hp.zKm * 1000, hUnit)} (≈${stdPressureMb(hp.zKm * 1000)} mb)`;
  $("hpChartToggle").checked = secChartOn;
}
function flow3dChanged() { $("fl3Body").hidden = !fl3.on; updateFlow3d(); if (!fl3.on && fl3.obj) fl3.obj.object.visible = false; applyRoiFade(); updateHud(); updateLegend(); dirty = true; }
$("fl3Toggle").addEventListener("change", (e) => { fl3.on = e.target.checked; flow3dChanged(); });
$("fl3Color").addEventListener("change", (e) => { fl3.colorBy = e.target.value; flow3dChanged(); });
$("fl3Count").addEventListener("change", (e) => { fl3.count = Number(e.target.value); flow3dChanged(); });
$("fl3Hours").addEventListener("change", (e) => { fl3.hours = Number(e.target.value); flow3dChanged(); });
$("fl3Vert").addEventListener("change", (e) => { fl3.vertical = Number(e.target.value); flow3dChanged(); });
$("fl3Opacity").addEventListener("input", (e) => { fl3.opacity = Number(e.target.value); if (fl3.obj) fl3.obj.setOpacity(fl3.opacity); dirty = true; });
$("hpZ").addEventListener("input", (e) => { hp.zKm = Number(e.target.value); syncHPlaneControls(); updateHPlane(); updateHud(); });

$("hpLines").addEventListener("change", (e) => { hp.lines = e.target.value; updateHPlane(); });
$("hpOpacity").addEventListener("input", (e) => { hp.opacity = Number(e.target.value); if (hp.layer) hp.layer.uniforms.fillOpacity.value = hp.opacity; dirty = true; });
$("hpChartToggle").addEventListener("change", (e) => { secChartOn = e.target.checked; $("secChartToggle").checked = secChartOn; hpChartKey = null; drawChart(); });

// ---- the region of interest (region.js) ------------------------------------------------
// Its shape and heights, and the wall's band from the slice's line; every
// change goes to the slice plane, the volume and the particles together.
function roiFrame() {
  if (roi.shape === "box") { const b = roi.box; return boxFrame(mercatorKm(b.latS, b.lonW), mercatorKm(b.latN, b.lonE)); }
  if (roi.shape !== "wall") return null;
  const path = sectionPath({ mode: sec.mode, pos: sec.pos, turn: sec.turn, stepKm: SEC_STEP_KM }, SEC_BOX, SEC_PROJ);
  if (path.pts.length < 2) return null;
  const a = path.pts[0], b = path.pts.at(-1);
  return wallFrame(mercatorKm(a.lat, a.lon), mercatorKm(b.lat, b.lon), sec.thick);
}
// Where the region is across the map, as a key: what the particles and flow lines rebuild on.
function roiKey() {
  if (roi.shape === "wall") return `${sec.mode}:${sec.pos}:${sec.turn}:${sec.thick}`;
  if (roi.shape === "box") { const b = roi.box; return `box:${b.latS}:${b.latN}:${b.lonW}:${b.lonE}`; }
  return "none";
}
// Seeding and the inside test for the 3-D particles, in grid indices.
function particleRegion(f) {
  const g = manifest.grid;
  return {
    seed() {
      for (let k = 0; k < 8; k++) {
        const [lat, lon0] = inverseMercatorKm(...wallSeed(f));
        const lon = lon0 < g.lon0 ? lon0 + 360 : lon0;
        const fi = (lon - g.lon0) / g.dlon, fj = (lat - g.lat0) / g.dlat;
        if (fi >= 0 && fj >= 0 && fi <= g.nlon - 1.001 && fj <= g.nlat - 1.001) return [fi, fj];
      }
      return null;
    },
    inside(fi, fj) { return inWall(f, ...mercatorKm(g.lat0 + fj * g.dlat, g.lon0 + fi * g.dlon)); },
  };
}
function roiText() {
  const [lo, hi] = regionHeights(roi);
  const at = (km) => `${fmtHeightBoth(km * 1000, hUnit)} (≈${stdPressureMb(km * 1000)} mb)`;
  const heights = `from ${lo === 0 ? "the surface" : at(lo)} to ${at(hi)}`;
  if (roi.shape === "whole") return "The whole atmosphere, surface to 12.5 km. Pick a wall, a layer or a box to narrow it down.";
  if (roi.shape === "layer") return `A horizontal layer ${heights}, the whole map wide.`;
  if (roi.shape === "box") {
    const b = roi.box, f = roiFrame(), wKm = Math.round(f.len * Math.cos((((b.latS + b.latN) / 2) * Math.PI) / 180) / 10) * 10;
    return `A box from ${fmtLat(b.latS)} to ${fmtLat(b.latN)} and ${fmtLon(b.lonW)} to ${fmtLon(b.lonE)} (about ${wKm.toLocaleString()} by ${(Math.round(((b.latN - b.latS) * 111.2) / 10) * 10).toLocaleString()} km), ${heights}.`;
  }
  return `A wall along ${sec.mode === "ns" ? fmtLon(sec.pos) : fmtLat(sec.pos)}${sec.turn ? `, turned ${sec.turn}°` : ""}, ${sec.thick ? `${sec.thick} km wide` : "thin (the volume and particles fill a 300 km band)"}, ${heights}.`;
}
function roiChanged() {
  $("roiWall").hidden = roi.shape !== "wall";
  $("roiBox").hidden = roi.shape !== "box";
  syncBoxControls();
  $("roiHeights").hidden = roi.shape === "whole";
  $("roiWallCams").hidden = roi.shape !== "wall";
  const [lo, hi] = regionHeights(roi);
  // The plane: the wall's slice, or a horizontal plane kept inside the heights (the middle if it fell outside).
  sec.on = roi.plane && roi.shape === "wall";
  hp.on = roi.plane && roi.shape !== "wall";
  if (!sec.on) secPath = null;
  if (hp.zKm < lo || hp.zKm > hi) hp.zKm = Math.round(((lo + hi) / 2) * 20) / 20;
  $("secToggle").checked = roi.plane;
  syncHPlaneControls(lo, hi);
  $("roiThick").value = String(hi - lo); $("roiBottom").value = String(lo);
  $("roiNote").textContent = roiText();
  $("roiNote").title = "mb: the standard atmosphere's pressure at that height, a rough guide; on a given day a pressure level sits a few hundred metres higher (warm air, highs) or lower (cold air, lows)";
  applyRegionQty();
  syncSliceControls(); secSlotKey = null; updateSection();
  p3Changed();
  volumeChanged();
  applyRoiFade();
}
// The region's quantity into each way of showing it. Wind across/along a wall
// only exist for a wall's slice (the fill shows wind speed); anomalies only as
// a fill (the plane and slice show temperature); particles colour by it when
// asked to (anomalies: by height).
const RQ_TEXT = {
  speed: "Wind speed, knots.", across: "Wind blowing through the wall (+ from its left): jet cores show as bullseyes on the slice; the fill shows wind speed.",
  along: "Wind along the wall; the fill shows wind speed.", w: "Rising (blue) and sinking (brown) air, cm/s: cloud and rain where it rises.",
  vort: "Vorticity, the air's spin, ×10⁻⁵ per second: red cyclonic (like a low), blue anticyclonic. Troughs, lows and the jet's flanks light up.",
  div: "Divergence, ×10⁻⁵ per second: red where air spreads out, blue where it converges. Converging low down and spreading aloft means rising air.",
  ti: "Turbulence risk: Ellrod's index (vertical wind shear × deformation, ×10⁻⁷/s²), the one aviation forecasters use: about 4 light–moderate, 8 moderate, 12+ severe.",
  temp: "Temperature, °C.", theta: "Potential temperature θ, K: the temperature air would have brought down to 1000 mb. Air keeps its θ as it moves, so θ surfaces are the paths air follows.",
  stab: "Stability, dθ/dz in K per km: low (yellow) where air can overturn, 3–5 in the ordinary troposphere, high (purple) in inversions and above the tropopause.",
  ri: "Richardson number of each layer between the model's levels: its stability divided by its wind shear squared. Below about 0.25 (yellow, orange) the shear can overturn the layer into turbulence and mix it (clear-air turbulence aloft, gusty mixing near the ground); above 1 (blue) it stays smooth; below 0 (red) it overturns by itself. As a shape, the fill shows the layers at or below the threshold (default 1: the model's levels are 1.5–4 km apart, too far to see the thin layers where Ri really drops below 0.25, so a higher cut finds the likeliest ones).",
  rh: "Relative humidity, %.", tanom: "Temperature against its 1991–2020 normal, °C. A fill only: the plane shows temperature.",
  ghanom: "Height of the levels against normal, m. A fill only: the plane shows temperature.",
  thetae: "Equivalent potential temperature θe, K: θ with the heat the air's water vapour would release counted in. Air masses stand out: warm, moist tropical air high, cold dry polar air low; a front is where θe changes fast.",
  grad: "Thermal gradient |∇θ|, K per 100 km: how fast temperature changes across the map at that height. Fronts are bands above about 1.2 (the NWS definition, 6 °C over 500 km); in 3-D they lean back over the cold air.",
  fgen: "Frontogenesis, K per 100 km per 3 h: whether the wind is sharpening the temperature gradient (red: a front forming or strengthening) or smoothing it (blue: weakening).",
};
function applyRegionQty() {
  for (const o of $("rq").querySelectorAll("[data-wall]")) o.hidden = o.disabled = roi.shape !== "wall";
  for (const o of $("rq").querySelectorAll("[data-clim]")) o.hidden = o.disabled = !CLIM;
  if ((roi.qty === "across" || roi.qty === "along") && roi.shape !== "wall") roi.qty = "speed";
  $("rq").value = roi.qty;
  $("rqNote").textContent = RQ_TEXT[roi.qty] ?? "";
  $("rqDiffRow").hidden = !BOTH_MODELS;
  $("rqDiff").disabled = !diff3dOk(roi.qty);
  $("rqDiff").checked = roi.diff;
  $("rqDiffRow").classList.toggle("muted", !diff3dOk(roi.qty));
  const fillQ = roi.qty === "across" || roi.qty === "along" ? "speed" : roi.qty;
  if (fillQ !== vol.qty) { vol.qty = fillQ; vol.thr = VOL_Q[fillQ][3]; }
  const planeQ = roi.qty === "tanom" || roi.qty === "ghanom" ? "temp" : roi.qty;
  sec.qty = planeQ;
  hp.qty = planeQ === "across" || planeQ === "along" ? "speed" : planeQ;
  hp.key = null; p3.key = null; p3.stops = null;
}
$("rqDiff").addEventListener("change", (e) => { roi.diff = e.target.checked; custom(); roiChanged(); updateLegend(); updateHud(); });
$("rq").addEventListener("change", (e) => { roi.qty = e.target.value; custom(); roiChanged(); updateLegend(); });
// Outside the region the other layers fade (levelMesh.js ROI: by position for
// the level fills and lines; the levels' particles, barbs and flow lines
// evenly). Only while something is shown in the region, and never in the
// Past year.
function applyRoiFade() {
  const shown = sec.on || hp.on || vol.on || p3.on || fl3.on, on = roi.shape !== "whole" && shown && !arch.on;
  $("roiOutside").hidden = roi.shape === "whole";
  $("roiDimVal").textContent = `${Math.round(roi.dim * 100)} %`;
  ROI.roiMode.value = on ? (roi.shape === "wall" || roi.shape === "box" ? 1 : 2) : 0;
  ROI.roiDim.value = roi.dim;
  const [lo, hi] = regionHeights(roi);
  ROI.roiLo.value = lo * 1000; ROI.roiHi.value = hi * 1000;
  const f = roiFrame();
  if (f) { ROI.roiP.value.set(f.p0[0], f.p0[1]); ROI.roiD.value.set(f.d[0], f.d[1]); ROI.roiHalf.value = f.half; ROI.roiLen.value = f.len; }
  const fade = on ? roi.dim : 1;
  PARTICLE_STYLE.fade.value = fade;
  for (const L of Object.values(layers)) { L.barbs.setFade(fade); L.flow.setFade(fade); }
  dirty = true;
}
{ const b = geo.bounds; ROI.roiBounds.value.set(b.x_west, b.x_east, b.y_south, b.y_north); }
$("roiDim").addEventListener("input", (e) => { roi.dim = Number(e.target.value); applyRoiFade(); });
$("secOpacity").addEventListener("input", (e) => { curtain.uniforms.opacity.value = Number(e.target.value); dirty = true; });
$("p3Opacity").addEventListener("input", (e) => { p3.opacity = Number(e.target.value); if (pvol) pvol.material.uniforms.opacity.value = p3.opacity; dirty = true; });
$("roiShape").addEventListener("change", (e) => { roi.shape = e.target.value; stopRoiSweep(); roiChanged(); });
// The box's four edges: sliders over the map's extent, half-degree steps.
const BOX_EDGES = [["boxS", "latS", SEC_BOX.latMin, SEC_BOX.latMax, fmtLat], ["boxN", "latN", SEC_BOX.latMin, SEC_BOX.latMax, fmtLat],
  ["boxW", "lonW", SEC_BOX.lonMin, SEC_BOX.lonMax, fmtLon], ["boxE", "lonE", SEC_BOX.lonMin, SEC_BOX.lonMax, fmtLon]];
function syncBoxControls() {
  for (const [id, k, lo, hi, fmt] of BOX_EDGES) {
    const el = $(id); el.min = String(lo); el.max = String(hi); el.step = "0.5"; el.value = String(roi.box[k]);
    $(id + "Val").textContent = fmt(roi.box[k]);
  }
}
function setBox(b) {
  roi.box = clampBox(b, SEC_BOX);
  roiChanged();
}
for (const [id, k] of BOX_EDGES) $(id).addEventListener("input", (e) => {
  // An edge pushed past the opposite one takes it along (keeping 2 degrees), rather than flipping the box.
  const v = Number(e.target.value), b = { ...roi.box, [k]: v }, far = { latS: "latN", latN: "latS", lonW: "lonE", lonE: "lonW" }[k];
  const low = k === "latS" || k === "lonW";
  if (low ? b[far] < v + 2 : b[far] > v - 2) b[far] = low ? v + 2 : v - 2;
  setBox(b); custom();
});
$("roiOutline").addEventListener("change", (e) => { roi.outline = e.target.checked; dirty = true; });

$("roiThick").addEventListener("input", (e) => { roi.thick = Number(e.target.value); roiChanged(); });
$("roiBottom").addEventListener("input", (e) => { roi.zLo = Number(e.target.value); stopRoiSweep(); roiChanged(); });
$("roiAll").addEventListener("click", () => { stopRoiSweep(); roi.zLo = 0; roi.thick = TOP_KM; roiChanged(); });
// Sweep up: the region rises from the surface to the top in ~12 s; the same
// button stops it (and moving the bottom does too).
function stopRoiSweep() { roi.sweep = null; $("roiSweepUp").textContent = "▶ sweep up"; }
$("roiSweepUp").addEventListener("click", () => {
  if (roi.sweep) { stopRoiSweep(); return; }
  const top = Math.max(0, TOP_KM - roi.thick);
  const from = roi.zLo >= top - 0.05 ? 0 : roi.zLo;
  roi.sweep = { t0: performance.now() - (from / Math.max(0.25, top)) * 12000 };
  $("roiSweepUp").textContent = "■ stop";
  const step = () => {
    if (!roi.sweep) return;
    const k = Math.min(1, (performance.now() - roi.sweep.t0) / 12000);
    roi.zLo = k * top; roiChanged();
    if (k < 1) requestAnimationFrame(step); else stopRoiSweep();
  };
  step();
});
roiChanged();

// ---- share a view as a link (share.js) ------------------------------------------------
// Everything that says what is shown and how: model, time, camera, flat/globe,
// levels and fills, particles/barbs/H-L, relief and stretch, satellite, chart,
// slice, volume, units. Applied through the controls' own functions.
function captureState() {
  // In the Past year: the forecast settings as they were before switching
  // (so the recipient's Forecast button leads somewhere sensible), with this
  // camera, and the Past year view on top.
  if (arch.on) {
    const d = ARCH_DAYS[arch.i];
    return { ...(arch.saved ?? captureForecastState()), camera: [...camera.position.toArray(), ...controls.target.toArray(), camera.fov],
      globe: geo.uniforms.morph.value > 0.5, question: arch.question ? arch.question.id : "custom",
      year: d ? { date: d.date, view: arch.view, mode: arch.mode, lines: arch.lines, wind: arch.wind, windAs: arch.windAs } : null,
      case: caseState.c ? { id: caseState.c.id, step: caseState.k } : null };
  }
  return captureForecastState();
}
function captureForecastState() {
  const iso = new Date(Date.parse(manifest.anchor) + timeline.pos * 3600e3).toISOString();
  return {
    question: question ? question.id : "custom", model, time: iso,
    camera: [...camera.position.toArray(), ...controls.target.toArray(), camera.fov], globe: geo.uniforms.morph.value > 0.5,
    focus: show.focus, context: [...show.context], fill: show.fill, particles: show.particles, surfaceParticles: show.surfaceParticles, flow: show.flow, focusLines: show.focusLines, diff: show.diff, waveUnit, mapAt, background: bgName === BG_AUTO[bgCase()] ? null : bgName,
    barbs: show.barbs, hl: [...hlLevels], relief, vex: Math.pow(10, Number(vexSlider.value)), satellite: satOn, satEnhance,
    chart: opcProduct || null, chartOpacity: opcLayer ? opcLayer.uniforms.opacity.value : 1,
    slice: sec.on ? { mode: sec.mode, pos: sec.pos, turn: sec.turn, thick: sec.thick, qty: sec.qty, lines: sec.lines, arrows: sec.arrows } : null,
    volume: vol.on ? { qty: vol.qty, thr: vol.thr, window: false, mode: vol.mode } : null, hUnit, regionQty: roi.qty,
    region: { shape: roi.shape, zLo: roi.zLo, thick: roi.thick, wall: roi.shape === "wall" ? { mode: sec.mode, pos: sec.pos, turn: sec.turn, thick: sec.thick } : null,
      box: roi.shape === "box" ? { ...roi.box } : null },
    hplane: hp.on ? { zKm: hp.zKm, qty: hp.qty, lines: hp.lines } : null, regionDiff: roi.diff,
    flow3d: fl3.on ? { count: fl3.count, hours: fl3.hours, vertical: fl3.vertical, colorBy: fl3.colorBy } : null,
    p3: p3.on ? { zKm: p3.zKm, thickKm: p3.thickKm, colorBy: p3.colorBy, density: p3.density, vertical: p3.vertical } : null,
  };
}
function applyState(st) {
  const notes = [];
  if (arch.on && !st.fromArchiveExit) exitArchive();          // the forecast part first; the Past year goes on top below
  if (st.model && st.model !== model) { if (manifest.inits?.[st.model]) switchModel(st.model); else notes.push(`${st.model} isn't in this build`); }
  const q = QUESTIONS.find((x) => x.id === st.question);
  question = q ?? null; qSel.value = q ? q.id : "custom"; renderCard();
  if (st.focus && layers[st.focus]) show.focus = st.focus;
  show.context = new Set(st.context.filter((k) => layers[k] && k !== show.focus));
  if (st.fill) show.fill = st.fill;
  if (st.particles != null) show.particles = st.particles;
  show.surfaceParticles = st.surfaceParticles; show.barbs = st.barbs; show.flow = st.flow; show.focusLines = st.focusLines; show.diff = !!st.diff;
  if (st.waveUnit !== waveUnit) setWaveUnit(st.waveUnit);
  setMapAt(st.mapAt);
  hlLevels.clear(); hlByHand.clear();
  for (const k of (st.hl.length ? st.hl : [show.focus])) if (layers[k]) { hlLevels.add(k); if (k !== show.focus) hlByHand.add(k); }
  focusWasContext = false;
  relief = Math.max(1, Math.min(RELIEF_MAX, st.relief)); $("relief").value = String(relief);
  $("reliefVal").textContent = relief === 1 ? "×1 (true)" : `×${relief}`;
  if (st.vex) { vexSlider.value = String(Math.log10(st.vex)); setVex(st.vex); }
  if (sat && st.satellite != null) { satOn = st.satellite; $("satToggle").checked = satOn; satEnhance = st.satEnhance; $("satEnhance").checked = satEnhance; syncSatControls(); }
  if (OPC) {
    setOpcProduct(st.chart && OPC_PRODUCTS[st.chart] ? st.chart : "");
    if (st.chart && !OPC_PRODUCTS[st.chart]) notes.push("its forecasters' chart isn't in this build");
    opcLayer.uniforms.opacity.value = st.chartOpacity; $("opcOpacity").value = String(st.chartOpacity);
  }
  if (st.slice) {
    Object.assign(sec, st.slice, { on: true }); $("secToggle").checked = true;
    for (const [id, v] of [["secMode", sec.mode], ["secThick", String(sec.thick)], ["secLines", sec.lines]]) $(id).value = v;
    $("secTurn").value = String(sec.turn); $("secArrows").checked = !!sec.arrows;
    sliceChanged();
  }
  else if (sec.on) { sec.on = false; $("secToggle").checked = false; secPath = null; sliceChanged(); }
  if (st.volume) { Object.assign(vol, st.volume, { on: true }); $("volToggle").checked = true; }
  else if (vol.on) { vol.on = false; $("volToggle").checked = false; }
  setHeightUnit(st.hUnit);
  if (st.p3) {
    Object.assign(p3, st.p3, { on: true });
    $("p3Toggle").checked = true;
    $("p3Color").value = p3.colorBy; $("p3Density").value = String(p3.density); $("p3Vert").value = String(p3.vertical ?? 0);
  } else if (p3.on) { p3.on = false; $("p3Toggle").checked = false; }
  // The region: as shared, or (links from before it existed) the slice's wall,
  // the volume's old "window around the slice", or the particles' slab.
  const rg = st.region ?? (st.slice || st.volume?.window ? { shape: "wall", zLo: st.p3?.zKm ?? 0, thick: st.p3?.thickKm ?? TOP_KM }
    : st.p3 && st.p3.thickKm < TOP_KM - 0.5 ? { shape: "layer", zLo: st.p3.zKm, thick: st.p3.thickKm } : { shape: "whole" });
  if (rg.wall) {
    Object.assign(sec, rg.wall);
    for (const [id, v] of [["secMode", sec.mode], ["secThick", String(sec.thick)]]) $(id).value = v;
    $("secTurn").value = String(sec.turn);
  }
  if (rg.box) roi.box = clampBox(rg.box, SEC_BOX);
  Object.assign(roi, { shape: rg.shape, zLo: rg.zLo ?? 0, thick: rg.thick ?? TOP_KM, plane: !!(st.slice || st.hplane) });
  if (st.hplane) { Object.assign(hp, st.hplane); $("hpLines").value = hp.lines; }
  fl3.on = !!st.flow3d; $("fl3Toggle").checked = fl3.on;
  if (st.flow3d) { Object.assign(fl3, st.flow3d); for (const [id, v] of [["fl3Count", fl3.count], ["fl3Hours", fl3.hours], ["fl3Vert", fl3.vertical], ["fl3Color", fl3.colorBy]]) $(id).value = String(v); }
  $("fl3Body").hidden = !fl3.on;
  // The region's quantity: as shared, or (older links) the fill's, the slice's or the plane's.
  roi.qty = st.regionQty ?? st.volume?.qty ?? st.slice?.qty ?? st.hplane?.qty ?? "speed";
  roi.diff = !!st.regionDiff;
  if (st.volume) vol.mode = st.volume.mode ?? "shape";
  $("roiShape").value = roi.shape;
  roiChanged();
  // The background: as shared (for this view only; the menu's own choices aren't changed), or automatic.
  if (st.background) { bgState = bgCase(); setBackground(st.background); } else syncBackground(true);
  // Time: the shared moment if this build has it; otherwise now, and say so.
  if (st.time) {
    const h = hoursFrom(manifest.anchor, st.time);
    if (h >= timeline.start - 1e-6 && h <= timeline.end + 1e-6) timeline.pos = h;
    else { timeline.pos = opened.pos; notes.push(`it was shared for ${fmtUtc(Date.parse(st.time))}, which isn't in this build, so it's shown at now`); }
  }
  // Flat or globe, then the exact camera.
  setControlMode(st.globe); morphAnim = null; flight = null;
  geo.uniforms.morph.value = st.globe ? 1 : 0; backdrop.visible = st.globe; backdrop.material.uniforms.opacity.value = st.globe ? 1 : 0;
  for (const b of document.querySelectorAll("[data-view]")) b.classList.remove("on");
  if (st.camera) {
    camera.position.set(st.camera[0], st.camera[1], st.camera[2]); controls.target.set(st.camera[3], st.camera[4], st.camera[5]);
    camera.fov = st.camera[6]; camera.updateProjectionMatrix(); controls.update();
  }
  applyLayers(); applyTime(true); updateHud(); updateLegend(); dirty = true;
  if (st.year) applyYearState(st, notes);
  if (st.case && !openCase(st.case.id, st.case.step)) notes.push("its case study isn't in this build's past year");
  if (notes.length) { openNote = `Shared view: ${notes.join("; ")}.`; updateHud(); }
}
// A shared Past year view: switch mode, set the map, and open the day -- or
// the nearest day still in the rolling year, and say so.
function applyYearState(st, notes) {
  if (!ARCH_DAYS.length) { notes.push("it shows the past year, which this build doesn't have"); return; }
  if (!ARCHIVE_VIEWS[st.year.view]) { notes.push(`its past-year map (${st.year.view}) isn't in this build`); return; }
  enterArchive();
  const y = st.year, want = Date.parse(`${y.date}T00:00:00Z`);
  Object.assign(arch, { view: y.view, mode: y.mode, lines: y.lines, wind: y.wind, windAs: y.windAs });
  for (const [id, v] of [["yearView", y.view], ["yearMode", y.mode], ["yearLines", y.lines], ["yearWind", y.wind], ["yearWindAs", y.windAs]]) $(id).value = v;
  let best = 0;
  ARCH_DAYS.forEach((d, j) => { if (Math.abs(Date.parse(`${d.date}T00:00:00Z`) - want) < Math.abs(Date.parse(`${ARCH_DAYS[best].date}T00:00:00Z`) - want)) best = j; });
  arch.i = best;
  if (ARCH_DAYS[best].date !== y.date) notes.push(`it was shared for ${y.date}, which is no longer in the past year here, so the nearest day (${ARCH_DAYS[best].date}) is shown`);
  const aq = ARCH_QS.find((q) => q.id === st.question);
  arch.question = aq ?? null; qSel.value = aq ? aq.id : "custom"; archCard();
  if (st.camera) {
    camera.position.set(st.camera[0], st.camera[1], st.camera[2]); controls.target.set(st.camera[3], st.camera[4], st.camera[5]);
    camera.fov = st.camera[6]; camera.updateProjectionMatrix(); controls.update();
  }
  archShow();
}
// ---- case studies (cases.js) -----------------------------------------------------------
// Real events of the past year, walked through a step at a time in the Past
// year viewer: each step sets the map, opens its day, points the camera, and
// may pin the probe or offer to play its run of days. The Cases tab lists
// them (a case whose days have rolled out of the archive can't be opened) and
// holds the player: the step's text, Back / Next, and Play.
const caseState = { c: null, k: 0, timer: null };
function renderCaseList() {
  const dates = ALL_ARCH_DATES;
  const REGIONS = { pnw: "Pacific Northwest", hawaii: "Hawaiʻi", pacific: "Around the North Pacific" };
  let last = null;
  $("caseList").innerHTML = CASES.length && YEAR_DAYS.length ? CASES.map((c) => {
    const st = caseStatus(c, dates), head = c.region !== last ? `<p class="case-region">${REGIONS[c.region] ?? ""}</p>` : "";
    last = c.region;
    return `${head}<button class="case-item" data-case="${c.id}"${st.ok ? "" : " disabled"}><b>${c.title}</b><span class="when">${c.when} · ${c.where}</span><span>${c.summary}</span>${st.ok ? "" : `<span class="when">Its days aren't in this build's archive yet.</span>`}</button>`;
  }).join("") : `<p class="note">No cases: this build has no past-year archive.</p>`;
  for (const b of $("caseList").querySelectorAll("[data-case]")) b.addEventListener("click", () => openCase(b.dataset.case, 0));
}
function openCase(id, k = 0) {
  const c = CASES.find((x) => x.id === id);
  if (!c || !caseStatus(c, ALL_ARCH_DATES).ok) return false;
  caseState.c = c;
  $("caseList").hidden = true; $("casePlayer").hidden = false;
  $("caseTitle").textContent = c.title; $("caseWhen").textContent = `${c.when} · ${c.where}`;
  $("caseSources").innerHTML = c.sources.map((s) => `<a href="${s.url}" target="_blank" rel="noopener">${s.label}</a>`).join(" · ");
  showCaseStep(Math.max(0, Math.min(c.steps.length - 1, k)));
  return true;
}
function closeCase() {
  casePlay(false);
  caseState.c = null;
  dirty = true;
  if (archEvent) { setArchDays(null); if (arch.on) archGo(ARCH_DAYS.length - 1); }     // back to the year
  $("caseList").hidden = false; $("casePlayer").hidden = true;
}
function showCaseStep(k) {
  const c = caseState.c, s = c.steps[k];
  caseState.k = k;
  $("caseCount").textContent = `Step ${k + 1} of ${c.steps.length} · ${s.day}`;
  $("caseStepTitle").textContent = s.title;
  $("caseText").innerHTML = `<p class="case-shows"><b>On the map</b></p>${caseShows(s.show)}${s.text}`
    + `<p><b>Why this view:</b> ${s.why}</p><p><b>Look for:</b> ${s.lookFor}</p>`;
  $("casePrev").disabled = k === 0;
  $("caseNext").textContent = k === c.steps.length - 1 ? "Finish" : "Next ▶";
  $("casePlay").hidden = !s.play;
  applyCaseStep(s);
}
function applyCaseStep(s) {
  casePlay(false);
  if (!arch.on) enterArchive();
  archPlay(false);
  const v = s.show;
  Object.assign(arch, v);
  for (const [id, x] of [["yearView", v.view], ["yearMode", v.mode], ["yearLines", v.lines], ["yearWind", v.wind], ["yearWindAs", v.windAs]]) $(id).value = x;
  arch.question = null; qSel.value = "custom"; archCard();
  setArchDays(eventOf(s.day));                // an older event: its own window of days
  arch.i = Math.max(0, dayIndex(ARCH_DAYS, s.day));
  openNote = null;
  archShow();
  if (s.look) caseLook(s.look);
  if (s.probe) {
    const g = manifest.grid, lon = s.probe[1] < g.lon0 ? s.probe[1] + 360 : s.probe[1];
    setProbe(Math.round((s.probe[0] - g.lat0) / g.dlat) * g.nlon + Math.round((lon - g.lon0) / g.dlon));
  } else if (probeAt) setProbe(null);
  showTab("cases");
}
// What a step puts on the map, as a key (user request, 2026-09-29: say what
// the colour fill, the lines, the wind and the markers each show), written
// from the step's settings so it can't disagree with what's drawn.
const CASE_FILL = {
  mslp: { actual: "sea-level pressure (hPa): deep lows dark purple and blue, strong highs orange and red",
    anomaly: "sea-level pressure against its 1991–2020 average for the date (hPa): blue lower than normal (storms), red higher" },
  wind10: { actual: "wind speed 10 m above the sea (kt): pale blue light, green and yellow moderate, red and purple strongest" },
  gh500: { actual: "height of the 500 mb surface, about 5.5 km up (m): troughs blue, ridges orange",
    anomaly: "height of the 500 mb surface against its 1991–2020 average (m): blue lower than normal (troughs, cold lows aloft), red higher (ridges, blocks)" },
  wind500: { actual: "wind speed at 500 mb, the steering level (kt): pale light, green and yellow moderate, red and purple strongest" },
  jet: { actual: "wind speed at 250 mb, about 10 km up, the jet stream (kt): the red and purple ribbon is the jet" },
  w500: { actual: "vertical motion at 500 mb (cm/s): blue rising (cloud and rain), brown sinking (clearing)" },
  t850: { actual: "temperature at 850 mb, about 1.5 km up (°C): blue cold, red warm",
    anomaly: "temperature at 850 mb against its 1991–2020 average (°C): blue colder than normal, red warmer" },
  pwat: { actual: "water vapour, all the water in the air above each point (mm): tan dry, green moist, blue and purple very moist (atmospheric rivers, over 40 mm outside the tropics)" },
  t2m: { actual: "air temperature 2 m above the ground (°C): blue cold, red warm" },
  sst: { actual: "sea-surface temperature, the model's (°C): blue cold, red warm",
    anomaly: "sea-surface temperature against its 1991–2020 average (°C): blue colder than normal, red warmer" },
  ssto: { actual: "observed sea-surface temperature, NOAA OISST daily mean (°C): blue cold, red warm",
    anomaly: "observed sea-surface temperature against its 1991–2020 average (°C): blue colder than normal, red warmer" },
  ice: { actual: "sea-ice cover (%): white where the sea is frozen, see-through below 15 % (the ice edge)" },
  hs: { actual: "significant wave height, GFS-Wave (m): pale small, blue and green moderate, yellow to purple big" },
  tp: { actual: "wave period (s): pale short (local wind-sea), dark red long (swell from far away)" },
};
function caseShows(v) {
  const V = ARCHIVE_VIEWS[v.view];
  const lines = v.lines === "auto" ? V.lines : v.lines;
  const wind = v.wind === "auto" ? V.wind : v.wind === "none" ? null : v.wind;
  const mode = v.mode === "anomaly" && V.anomaly ? "anomaly" : "actual";
  const rows = [["Colour fill", CASE_FILL[v.view]?.[mode] ?? V.label]];
  if (lines && lines !== "none") rows.push(["Lines", lines === "isobars"
    ? "isobars, sea-level pressure every 4 hPa: the closer together, the stronger the wind"
    : "height of the 500 mb surface every 60 m: the wind aloft blows along them, faster where they're closer"]);
  if (wind) rows.push([`Wind (${ARCHIVE_WIND_LEVELS[wind]})`, {
    flow: "flow lines along the wind, arrowheads pointing downwind: direction only, not speed",
    barbs: "barbs: each points into the wind, one full feather 10 kt, a pennant 50 kt",
    particles: "particles drifting through that moment's wind: faster streaks, faster wind" }[v.windAs]]);
  rows.push(["Markers", "amber rings and labels: the features the text names, on this day"]);
  return `<ul class="case-key">${rows.map(([k, t]) => `<li><b>${k}:</b> ${t}</li>`).join("")}</ul>`
    + `<p class="when">One GFS analysis, 00 UTC on this day, 1° grid; the colour key is bottom right.</p>`;
}
// The camera onto a spot of the flat map: `span` degrees of latitude in view,
// tilted `tilt` degrees from straight down (a hair off it at 0, so the view
// keeps north up).
function caseLook({ lat, lon, span = 30, tilt = 0 }) {
  setControlMode(false);
  geo.uniforms.morph.value = 0; backdrop.visible = false; morphAnim = null;
  roiLookUp = false; controls.maxPolarAngle = FLAT_MAX_POLAR;
  const target = geo.point(lat, lon, 0, 0, 0, 0);
  const h = Math.abs(geo.point(lat + span / 2, lon, 0, 0, 0, 0).y - geo.point(lat - span / 2, lon, 0, 0, 0, 0).y);
  const dist = ((h / 2) / Math.tan((22.5 * Math.PI) / 180)) * 1.1 / Math.max(0.6, Math.min(1, camera.aspect));
  const t = (Math.max(0.5, Math.min(60, tilt)) * Math.PI) / 180;
  const pos = target.clone().add(new THREE.Vector3(0, -Math.sin(t) * dist, Math.cos(t) * dist));
  flight = { from: { pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov }, to: { pos, target, fov: 45 }, t0: performance.now(), ms: 1300 };
  for (const x of document.querySelectorAll("[data-view]")) x.classList.remove("on");
  dirty = true;
}
// Play a step's run of days, one real analysis every 0.7 s, from its first day
// to its last (missing days are skipped); again stops it.
function casePlay(on) {
  if (caseState.timer) { clearInterval(caseState.timer); caseState.timer = null; }
  $("casePlay").textContent = on ? "■ Stop" : "▶ Play these days";
  const s = caseState.c?.steps[caseState.k];
  if (!on || !s?.play) return;
  const from = ARCH_DAYS.findIndex((d) => d.date >= s.play[0]);
  let i = from;
  const go = () => {
    if (i < 0 || i >= ARCH_DAYS.length || ARCH_DAYS[i].date > s.play[1]) { casePlay(false); return; }
    archGo(i); i++;
  };
  go();
  caseState.timer = setInterval(go, 700);
}
$("casePrev").addEventListener("click", () => { if (caseState.c && caseState.k > 0) showCaseStep(caseState.k - 1); });
$("caseNext").addEventListener("click", () => {
  if (!caseState.c) return;
  if (caseState.k < caseState.c.steps.length - 1) showCaseStep(caseState.k + 1); else closeCase();
});
$("casePlay").addEventListener("click", () => casePlay(!caseState.timer));
$("caseAll").addEventListener("click", (e) => { e.preventDefault(); closeCase(); });
$("caseMarks").addEventListener("change", () => { dirty = true; });
if (!YEAR_DAYS.length || !CASES.length) document.querySelector('.tabs button[data-tab="cases"]').hidden = true;
renderCaseList();
$("shareCopy").addEventListener("click", async () => {
  const url = `${location.origin}${location.pathname}#${encodeState(captureState())}`;
  const box = $("shareLink");
  box.hidden = false; box.value = url; box.select();
  let copied = false;
  try { await navigator.clipboard.writeText(url); copied = true; } catch { /* the box is selected: copy by hand */ }
  $("shareNote").textContent = copied ? (arch.on
    ? "Copied. Anyone opening it sees this day of the past year with these settings and this view; if the day has rolled out of their year, they get the nearest day."
    : "Copied. Anyone opening it sees these settings and this view; if their build doesn't have this time, they get the same view at their 'now'.")
    : "Select the link above and copy it.";
  history.replaceState(null, "", url);
});
{
  const shared = decodeState(location.hash);
  if (shared) applyState(shared);
}
requestAround();
applyTime();
updateLoadStatus();
{
  // Whole steps missing (the timeline skips them) vs steps missing only their waves.
  const steps = manifest.missing.filter((m) => !m.part).length, waveGaps = manifest.missing.filter((m) => m.part === "wave").length;
  const parts = [steps ? `${steps} model step(s) unavailable this build — the timeline skips them` : "",
    waveGaps ? `waves missing at ${waveGaps} step(s) (the atmosphere is there)` : ""].filter(Boolean);
  if (parts.length) $("missingNote").textContent = parts.join("; ") + ".";
}
requestAnimationFrame(frame);

// Debug/verification handle (read-only use).
// Debug: the cost (ms) of one playback frame at time `pos`: set the time,
// then draw -- what the loop does, without waiting for requestAnimationFrame.
function frameCost(pos, dt = 1 / 60) {
  const t0 = performance.now();
  timeline.pos = pos; applyTime(); dirty = true; drawFrame(dt);
  renderer.getContext().finish();
  return performance.now() - t0;
}
// finishFlight: jump a camera flight to its end, then what the frame loop does (hidden panes run no frames).
function finishFlight() {
  if (!flight) return false;
  camera.position.copy(flight.to.pos); controls.target.copy(flight.to.target); camera.fov = flight.to.fov; camera.updateProjectionMatrix();
  flight = null; controls.update();
  if (roiLookUp && geo.uniforms.morph.value < 0.5 && camera.position.z < 8) camera.position.z = 8;
  drawFrame(1 / 60);
  return true;
}
window.__atmos3d = { sim, roiOutline, finishFlight, sectionData, handles, roi, get hp() { return hp; }, get pvol() { return pvol; }, p3, arch, levelLines, get secLevelH() { return secLevelH; }, drawFrame, captureState, applyState, frameCost, manifest, geo, ground, sat, opcOutline, graticule, ruler, placeOverlays, setProbe, hlCache, curtain, sec, sliceChanged, showTab, tour, renderInto, frameParts, exportTimes, applyTime, flyTo, setView, applyQuestion, QUESTIONS, show, NOW_H, loader, timeline, layers, renderer, camera, controls, projErrKm, fps, get leads() { return leads; }, get model() { return model; }, setPlaying };
