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
import { R_KM, inverseMercatorKm, makeGeo, mercatorKm, selfCheck } from "./project.js?v=20261031090012";
import { SatelliteFrames } from "./satellite.js?v=20261031090012";
import { makeGround } from "./ground.js?v=20261031090012";
import { BundleLoader, buildVersion, dequantize, fetchU16 } from "./loader.js?v=20261031090012";
import { ARCHIVE_QUESTIONS, ARCHIVE_SEA, ARCHIVE_VIEWS, ARCHIVE_WIND_LEVELS, archiveFill, archiveStartDay, archiveIndex, archiveLines, archiveSeries, archiveWind, seriesSvg } from "./archive.js?v=20261031090012";
import { SCALES, SEA_MISSING, cssGradient, diffScale, rangedScale } from "./colormaps.js?v=20261031090012";
import { GridLayer } from "./levelMesh.js?v=20261031090012";
import { Timeline } from "./timeline.js?v=20261031090012";
import { fmtLocal, fmtUtc, hoursFrom, markers, opcChartAt, opcNeighbour, openAt, relNow, runTag, staleness, stepSource, fmtUtcShort, dayMarks, nightSpans } from "./timeinfo.js?v=20261031090012";
import { BarbLayer, FlowLayer, PARTICLE_STYLE, ParticleSystem } from "./winds.js?v=20261031090012";
import { CoastOverlay } from "./overlays.js?v=20261031090012";
import { HemisphereView, NH_FILLS, archiveSource } from "./hemiview.js?v=20261031090012";
import { HEMI_QUESTIONS } from "./hemiquestions.js?v=20261031090012";
import { AFD_OFFICES, afdFeatures, featureCheck } from "./afdsetup.js?v=20261031090012";
import { bandMean, capMean, cutoffLow, cutoffWords, followTrough, tradesAtHawaii, tradesWords, traceBackSphere, troughsAt, vortexSeason, vortexStats, waveAmplitudes } from "./hemisphere.js?v=20261031090012";
import { Graticule } from "./graticule.js?v=20261031090012";
import { QUESTIONS, deepestLow, surfaceParticlesOf, valueAt } from "./questions.js?v=20261031090012";
import { readPnw } from "./pnwreading.js?v=20261031090012";
import { readHi } from "./hireading.js?v=20261031090012";
import { glossify } from "./glossary.js?v=20261031090012";
import { simCaseLinks } from "./simcases.js?v=20261031090012";
import { todayCaseLinks } from "./todaycases.js?v=20261031090012";
import { COMPOSITES, compositeFields } from "./composite.js?v=20261031090012";
import { pairUnits } from "./unitpair.js?v=20261031090012";
import { defaultObsKind, obsKindsFor, obsPeaks, stepObs } from "./caseobs.js?v=20261031090012";
import { OBS_COLORS, OBS_DASHES, drawObsChart, fmtObsTime as fmtObsTimeTz, obsIndexAt, tzOf } from "./caseobschart.js?v=20261031090012";
import { HIRES, HRRR_VIEWS, hrrrFill, hrrrFrames, hrrrIndex, hrrrNearest, hrrrViews, smoothForContours } from "./hrrr.js?v=20261031090012";
import { OBS_IMAGES, obsImage, obsKinds } from "./obsimg.js?v=20261031090012";
import { PLACES } from "./places.js?v=20261031090012";
import { labelKey, labelsHtml, layoutLabels } from "./labels.js?v=20261031090012";
import { HeightRuler, northAngle } from "./orientation.js?v=20261031090012";
import { findExtremes } from "./extremes.js?v=20261031090012";
import { RELIEF_MAX, levelMean, reliefHeights } from "./relief.js?v=20261031090012";
import { FT_PER_M, fmtHeight, fmtHeightBoth, fmtWave, heightTicks, stdPressureMb } from "./units.js?v=20261031090012";
import { buildSection, heightMap, levelField, levelHeights, sectionPath, slabPaths } from "./section.js?v=20261031090012";
import { bulkRichardson, frontal, horizontal, thetaE, withDerived } from "./derived3d.js?v=20261031090012";
import { BELOW } from "./volume.js?v=20261031090012";
import { rng, traceFlow } from "./stream3d.js?v=20261031090012";
import { Strokes3D } from "./strokes3d.js?v=20261031090012";
import { CASES, MONTHS as CASE_MONTHS, PATTERNS, SEASONS, caseStatus, dayIndex } from "./cases.js?v=20261031090012";
import { BRIEFS } from "./casebriefs.js?v=20261031090012";
import { ascend, disperse, gradKm, gridSampleFinite, traceSwell, gridSample, offsetKm, refineRing, ringAreaKm2, ringPoints, stepBalloon, stepBalloon3d, stepMarble, traceBack, waves } from "./tracers.js?v=20261031090012";
import { TracerView } from "./tracerview.js?v=20261031090012";
import { briefHtml, chartFrame, chartsHtml, drawMeteogram } from "./casebrief.js?v=20261031090012";
import { drawJourney } from "./journeychart.js?v=20261031090012";
import { biggestWaves, jetCore, moisturePlume, tropicalCyclone, tropicalLows, weekDeepestLow, windiestInBox } from "./todayfind.js?v=20261031090012";
import { liftParcel } from "./parcel.js?v=20261031090012";
import { forcesAt, KT_PER_HOUR } from "./forces.js?v=20261031090012";
import { drawParcel } from "./parcelchart.js?v=20261031090012";
import { DEFAULTS as SIM_DEFAULTS, centredField, declination, diagnostics as simDiagnostics, initSim, makeSim } from "./sim2d.js?v=20261031090012";
import { SIM_LAYER, SimScene } from "./simscene.js?v=20261031090012";
import { SIM_LESSONS, SIM_PRINCIPLES, TEXTBOOK, coriolisArrows, modelLabels, savedStateName } from "./simlessons.js?v=20261031090012";
import { HS_M, PE_FILLS, drawEqSlice, drawPESection, fillTexture, flowLines, highsLows, surfaceBelts } from "./pe3dview.js?v=20261031090012";
import { makeSheet } from "./sheet.js?v=20261031090012";
import { PE3D_SAVED } from "./pe3d_states.js?v=20261031090012";
import { landFraction } from "./landmask.js?v=20261031090012";
import { drawSimSection, drawSurfaceWind, drawTextbook, pressureHeights } from "./simview.js?v=20261031090012";
import { SimParticles } from "./simparticles.js?v=20261031090012";
import { TOP_KM, boxFrame, clampBox, inWall, regionHeights, wallFrame, wallSeed } from "./region.js?v=20261031090012";
import { SectionCurtain, SectionLevelLines } from "./section3d.js?v=20261031090012";
import { ROI } from "./levelMesh.js?v=20261031090012";
import { SIGNED, buildVolumeBytes, filledShare } from "./volume.js?v=20261031090012";
import { VolumeLayer } from "./volume3d.js?v=20261031090012";
import { OpcChartLayer } from "./opcchart.js?v=20261031090012";
import { ParticleVolume } from "./particles3d.js?v=20261031090012";
import { groundHeight, windAt } from "./particles3d_math.js?v=20261031090012";
import { anomaly, climSlots, upsample, validDate } from "./anomaly.js?v=20261031090012";
import { MAX_NOTES, decodeState, encodeState } from "./share.js?v=20261031090012";
import { drawMapChart, drawSliceChart, lut } from "./slicechart.js?v=20261031090012";
import { FPS, composite, outputSize, record, saveBlob } from "./exporter.js?v=20261031090012";
import { Tour } from "./tour.js?v=20261031090012";
import { bilinear } from "./section.js?v=20261031090012";
import { columnProfile, meteogramHourAt, meteogramSvg, nearestIndex, profileSvg, profileTable } from "./probe.js?v=20261031090012";

const root = document.getElementById("atmos3d");
const DATA = root.dataset.data;
const $ = (id) => document.getElementById(id);
let hemi = null;    // the Northern Hemisphere view (hemiview.js), when the build has one; set up after the views
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
// Marbles and balloons dropped on the map (tracers.js; declared early: the HUD's notes read it).
// The rings and labels a today's-lesson step puts on the map (like a case's marks), shown while the time is
// within 3 h of the step's: {h, marks: [{lat, lon, label, r}]} or null. Declared early: the labels read it.
let lessonMarks = null;
// Drawings on the map (the Share tab; declared early: the frame loop and the labels read it).
const note = { mode: null, pending: null, items: [], color: 0 };
const tracer = { mode: null, items: [], waves: true, onLevel: true, backH: 72, ringKm: 300, backThree: false, spread: true, liftDT: 0, liftFly: false };      // waves: roll on the field with each latitude's average taken out; onLevel: new balloons stay on the focus level (off: they rise and sink with the air)
// The Simulate mode (sim2d.js; user request 2026-09-30): declared here so layer code can check it.
const sim = { on: false, s: null, p: null, worker: null, got: false, fast: false, paused: false, parts: null, scene: null, field: null, lastChart: 0,
  speed: 5, pdays: 0.5, exag: 30, vex: 100, count: 12000, tails: true, slabOn: false, slabW: 30, slabLon: 0, viewLon: null, showMap: false, showSun: true, saved: null,
  lesson: null, step: 0, labels: true, arrows: false, textbook: false,
  model: "2d", pew: null, pe: null, peGot: false, peNew: false, fill: "tlow", chartMean: true, hl: [], fillTex: null,
  size: 3, opacity: 0.9, tailSec: 0.35, band: "all", flow: false };
// The 3 km model's state (hrrr.js; its functions are with the case player, hrrrStep and after). Declared here, before
// anything that draws can read it.
const hr = { index: null, img: null, obs: null, R: {}, region: "pnw", views: [], indexP: {}, imgP: {}, want: false, on: false, view: "gust", frames: [], i: 0, cur: null, step: null, cache: new Map(), timer: null, token: 0 };
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
// HFO publishes its surface analysis and its forecasts as two products over different areas; the
// menu offers them as one "HFO surface analysis", like OPC's, each chart at its own valid time and
// on its own area (user request 2026-10-09). Old links naming the forecast product land on it too.
const CHART_ALIAS = { hfo_surface_forecast: "hfo_surface_analysis" };
if (OPC) {
  for (const c of OPC.charts) if (CHART_ALIAS[c.product]) c.product = CHART_ALIAS[c.product];
  if (OPC.products) for (const k of Object.keys(CHART_ALIAS)) delete OPC.products[k];
}
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
// A phone profile (2026-10-10, iPhone review): a touch screen no wider than 500 px (or ?lite=1). Lower drawing
// resolution and no antialiasing (at 1.5x the edges are smooth enough), fewer particles, a decoded-data budget and a
// window of satellite textures, to stay inside iOS's memory and battery limits.
const REDUCED_MOTION = matchMedia("(prefers-reduced-motion: reduce)").matches;
const LITE = /[?&]lite=1/.test(location.search) || (matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) <= 500);
const renderer = new THREE.WebGLRenderer({ antialias: !LITE });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, LITE ? 1.5 : 2));
if (LITE) sim.count = 5000;
renderer.outputColorSpace = THREE.SRGBColorSpace;
root.appendChild(renderer.domElement);
// A lost WebGL context (iOS evicts it when memory runs short; 2026-10-10 iPhone review): show a note instead of a black
// canvas, and reload with this view kept in the link (the textures can't simply be re-uploaded from here).
renderer.domElement.addEventListener("webglcontextlost", (e) => { e.preventDefault(); $("glLost").hidden = false; });
renderer.domElement.addEventListener("webglcontextrestored", () => { $("glLost").hidden = true; dirty = true; });
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
// Touch (2026-10-10, iPhone review): one finger turns the view, two fingers pinch to zoom and drag to pan.
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

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

const loader = new BundleLoader(DATA, manifest, 6, LITE ? 150e6 : Infinity);
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
// lines a little heavier than they were (user request 2026-10-18: "easier to see"), and heavier again over the
// satellite's dark, busy picture
const levelWidth = (k, focus) => (levelStyle[k]?.width ?? 1.5) * (focus ? 1.4 : 1) * (satShown ? 1.3 : 1);
// A level's contour colour: its own (dark) colour on the light map, the light set over the satellite (where the dark
// lines vanished: user request 2026-10-18), unless chosen by hand in the Style tab.
const onDark = () => particlePalette === "light" || (particlePalette === "auto" && !!satShown);
const lineColorOf = (k) => levelStyle[k]?.color ?? (onDark() ? PARTICLE_COLORS_LIGHT[k] : null) ?? levelColor(k);
let PARTICLE_COLORS = PARTICLE_COLORS_DARK;
function applyParticleColors() {
  const light = particlePalette === "light" || (particlePalette === "auto" && !!satShown);
  const want = light ? PARTICLE_COLORS_LIGHT : Object.fromEntries(Object.keys(PARTICLE_COLORS_DARK).map((k) => [k, levelColor(k)]));
  // Barbs share the level's colour (its identity everywhere), with a halo of
  // the opposite brightness so they read on any background.
  for (const L of Object.values(layers)) for (const g of [L.barbs, L.flow]) g.setColors(want[L.def.key] ?? "#111", light ? "#0b0f14" : "#ffffff");
  p3.stops = null;           // 3-D particles' height colours follow the same palette
  // the contour lines follow too (colour and width), so they read on the satellite
  for (const L of Object.values(layers)) if (L.gl) {
    L.gl.uniforms.lineColor.value.set(opcShown ? OPC_CMP_COLOR : lineColorOf(L.def.key));
    L.gl.uniforms.lineWidth.value = levelWidth(L.def.key, L.def.key === show.focus);
  }
  dirty = true;
  if (JSON.stringify(want) === JSON.stringify(PARTICLE_COLORS)) return;
  PARTICLE_COLORS = want;
  for (const L of Object.values(layers)) if (L.particles) L.particles.color.set(particleColor(L));
  updateParticleKey();
  dirty = true;
}
const PARTICLE_WEIGHT = { sfc: 1.6, p1000: 1.4, p925: 1.4, p850: 1.2, p700: 1.0, p500: 0.8, p300: 0.8, p250: 0.8 };
const PARTICLE_BASE = LITE ? 1800 : 3500, PARTICLE_MAX = LITE ? 5000 : 10000;
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
// Water vapour (mid-level, 6.9 um), when the build made it: the same times and grid as the infrared.
// Loaded the first time it's chosen. satChannel: "ir" or "wv".
const satWV = manifest.satellite?.wv?.frames?.length ? new SatelliteFrames(DATA, manifest.satellite.wv, manifest.anchor, buildVersion(manifest)) : null;
let satChannel = "ir", satWVLoading = false;
const satNow = () => (satChannel === "wv" && satWV ? satWV : sat);
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
// A case's archived charts, draped in place (tools/register_case_charts.py found each one's box): its own
// layer, so it works in the Past year mode cases run in, whatever the live chart is doing.
const caseChartLayer = new OpcChartLayer({ lat_min: 20, lat_max: 60, lon_min: 140, lon_max: -120 }, geo);
caseChartLayer.object.renderOrder = 11;                // over the Past year fill (10), under its wind (13 and 14)
scene.add(caseChartLayer.object);
const caseChartView = { onMap: true, opacity: 0.85 };
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
  const S = satNow(), wv = S === satWV && !!satWV;
  if (wv && !satWVLoading && !LITE) { satWVLoading = true; satWV.loadAll(() => { updateSatellite(); dirty = true; }, timeline.pos); }
  // phones: ask for nearby frames when the frame on screen changes (not on every time step)
  if (LITE && S && satOn && timeline.pos <= SAT_END_H + 3) {
    const fi = S.indexAt(Math.min(timeline.pos, SAT_END_H));
    if (S._near !== fi) { S._near = fi; S.loadNear(Math.min(timeline.pos, SAT_END_H), 6, () => { S._near = null; updateSatellite(); dirty = true; }, () => setTimeout(() => { S._near = null; updateSatellite(); }, 30e3)); }
  }
  const hit = S && satOn ? S.textureAt(Math.min(timeline.pos, SAT_END_H)) : null;
  if (hit) u.satMap.value = hit.tex;
  if (LITE && hit) S.trim(Math.min(timeline.pos, SAT_END_H), 6, 18);     // phones: only nearby frames on the GPU, nearer ones kept
  u.satMode.value = wv ? 1 : 0;
  u.satVmin.value = S?.entry.vmin_k ?? 190; u.satVmax.value = S?.entry.vmax_k ?? 300;
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
// phones load only nearby frames, more as the time moves (updateSatellite); elsewhere all of them in the background
const satLoaded = () => { if (timeline.pos <= SAT_END_H + 3) updateSatellite(); dirty = true; };
if (sat) { if (LITE) sat.loadNear(timeline.pos, 6, satLoaded); else sat.loadAll(satLoaded, timeline.pos); }

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
  if (!loader.has(m, lead, bundle) || loader.isReady(m, lead, bundle)) return;
  const key = `${purpose}|${m}|${lead}|${bundle}`;
  if (waiting.has(key)) return;
  waiting.add(key);
  loader.load(m, lead, bundle).then(() => { waiting.delete(key); fn(); }, (e) => { waiting.delete(key); console.warn("[atmos3d]", e); });
}

function isStepReady(i) {
  const lead = leads[i];
  if (hemi?.on) return hemi.src.kind === "archive" || hemi.isReady(lead);
  return Object.values(layers).every((L) => !L.visible || (bundlesFor(L).every((b) => loader.isReady(model, lead, b))
    && (!diffOn(L) || !loader.has(OTHER_MODEL[model], lead, L.def.bundle) || bundlesFor(L, OTHER_MODEL[model]).every((b) => loader.isReady(OTHER_MODEL[model], lead, b)))
    && climNeeds(L, lead).every(([m, l, b]) => loader.isReady(m, l, b))));
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
  if (hemi?.on) { hemiApply(force); return; }      // the hemisphere view has its own layers; the Pacific's wait as they are
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
    if (L.particles) L.particles.setShown(on);         // fades in or out (winds.js)
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
  if (hemi?.on) { hemi.request(hemiTime(), LITE ? 4 : Infinity); return; }
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
// The time shown: your local time leading, UTC after it, smaller (user request 2026-10-09); UTC alone
// when your zone is UTC.
function setHudTime(ms, utcText = fmtUtc(ms), utcShort = fmtUtcShort(ms)) {
  const local = fmtLocal(ms);
  $("hudValid").innerHTML = local ? `${local}<span class="utc"> · ${utcShort}</span>` : utcText;
}
$("hudInterp").title = "Notes about what's on screen: click to show them all (or fold them back to two lines)";
$("hudInterp").addEventListener("click", () => $("hudInterp").classList.toggle("open"));
function updateHud() {
  if (hemi?.on) { hemiHud(); return; }
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
  if (shown) notes.push(`observed satellite ${satChannel === "wv" && satWV ? "water vapour (mid-level, 6.9 µm)" : "infrared"} ${shown.time.slice(11, 16)} UTC ${shown.time.slice(8, 10)}th`);
  if (opcProduct) notes.push(opcShown
    ? `${OPC_LABEL[opcShown.product]} valid ${opcShown.valid.slice(11, 13)}Z ${opcShown.valid.slice(8, 10)}th (${chartKind(opcShown)}) on the map${Object.values(layers).some((L) => L.visible && L.gl.uniforms.showLines.value && !L.glyphsOnly) ? "; the model's lines in magenta" : ""}`
    : `no ${OPC_LABEL[opcProduct]} at this time — ◀ ▶ by the timeline jump to one`);
  if (p3.on) {
    const lo = Math.max(0, Math.min(12, p3.zKm)), hi = Math.min(12.5, lo + p3.thickKm);
    notes.push(`3-D particles ${fmtHeight(lo * 1000, hUnit)}–${fmtHeight(hi * 1000, hUnit)} (≈${stdPressureMb(lo * 1000)}–${stdPressureMb(hi * 1000)} mb): each drifts with the horizontal wind at its own height, filled between the model's levels${p3.vertical && HAS_W ? `, and climbs or sinks with the model's vertical motion${p3.vertical > 1 ? `, the climb exaggerated ×${p3.vertical}` : " at its true speed"}` : " (level flight: no vertical motion)"}`);
  }
  if (tracer.mode) notes.push(`click the map to drop the ${TOOL_NAME[tracer.mode]}`);
  const how = (it) => (it.z != null ? "in 3-D, rising and sinking with the model's vertical motion" : `on the ${show.focus === "sfc" ? "10 m" : layers[show.focus].def.title} level`);
  const backs = tracer.items.filter((t) => t.kind === "back" && t.path);
  if (backs.length) { const b = backs[backs.length - 1]; notes.push(`where from?: the air arriving at the blue ball${b.three ? " at 500 m, 1.5 km and 5.5 km above the ground" : ""}, traced back ${Math.round(Math.max(...b.tracks.map((t) => t.path.at(-1)[3])))} h through the wind of each earlier hour, ${b.three ? "in 3-D, rising and sinking with the model's vertical motion" : how(b)}; a dot every 24 h; its height, temperature and humidity on the way are charted in the Drop tab${b.hours < b.wantH ? ` (the data starts ${Math.round(b.hours)} h before that time: pick a later time to trace further)` : ""}${b.tracks.some((t) => t.left) ? "; part of it came in from off the map" : ""}`); }
  const smoke = tracer.items.find((t) => t.kind === "smoke");
  if (smoke) notes.push(`smoke: a puff let go every model hour, each carried like a balloon ${how(smoke)}${tracer.spread ? `, plus a random step for turbulence${smoke.z != null ? (model === "gfs" ? ", and stirred through the boundary layer (GFS's depth) under its top" : " (ECMWF has no boundary-layer depth here: no mixed layer)") : ""}` : ""}; older puffs fade (the newest ${PUFF_MAX} kept)`);
  const sw = tracer.items.filter((t) => t.kind === "swell" && t.path).at(-1);
  if (sw) notes.push(`swell: the ${Math.round(sw.T)} s swell arriving at the blue ball, traced back at its group speed (${Math.round(9.80665 * sw.T / (4 * Math.PI) * 1.943844)} kt, ${Math.round(9.80665 * sw.T / (4 * Math.PI) * 86.4)} km a day) along the great circle it came on (deep-water swell keeps to great circles); a dot every 24 h; the red ball is where the seas were biggest on the way${sw.hours < sw.wantH ? ` (the data start ${Math.round(sw.hours)} h before: pick a later time to trace further)` : ""}`);
  if (tracer.items.some((t) => t.kind === "sonde" && t.path)) notes.push(`weather balloon: released at the ground, rising 5 m/s and drifting with the model's wind, reading each level as it crosses it (the sounding and winds are in the Drop tab); the model's data end at ${manifest.levels.at(-1)} mb, so the flight does too (a real sonde goes on to ~30 km)`);
  if (tracer.items.some((t) => t.kind === "forces")) notes.push(`forces: on the air at the white ball, on the ${show.focus === "sfc" ? "surface (sea-level pressure and the 10 m wind)" : `${layers[show.focus].def.title} level`}, at the nearer real step: the pressure push (red), Earth's spin (blue), ${show.focus === "sfc" ? "friction" : "what's left"} (grey), in kt of wind gained per hour; the wind (white) and the geostrophic wind (yellow) to a different scale`);
  if (tracer.items.some((t) => t.kind === "lift")) notes.push(`lift: a parcel of surface air lifted through the model's column at the time on screen (dry rate to its cloud base, moist above), compared with the air around it; the sounding is charted in the Drop tab. The model has only ${manifest.levels.length} levels, so a sharp inversion shows as a very stable layer between two of them`);
  const ring = tracer.items.find((t) => t.kind === "ring");
  if (ring) notes.push(`ring: ${RING_N} balloons ${ring.rKm} km from its centre, ${how(ring)}; where its area shrinks the air is converging, where it grows, spreading out (diverging); stretched long and thin, it's being deformed`);
  if (tracer.items.some((t) => t.kind === "marble")) notes.push(`marble: rolls downhill on ${show.focus === "sfc" ? "sea-level pressure" : `the ${layers[show.focus].def.title} heights`}, ${tracer.waves ? "each latitude's average taken out so it feels the troughs and ridges, not the slope toward the pole" : "the raw field, slope toward the pole and all"} (shape only: air runs along the lines, not down them)`);
  if (tracer.items.some((t) => t.kind === "balloon" && t.z != null)) notes.push(`air parcel: carried by the wind at its own height and rising or sinking with the model's vertical motion${HAS_W ? "" : " (none in this build: it flies level)"}, ${timeline.playing ? "through time as it plays" : "in this moment's air, 2 h of model time a second (press Play to follow the changing air)"}; drawn at its true height, so it can float above or below an exaggerated relief`);
  if (tracer.items.some((t) => t.kind === "balloon" && t.z == null)) notes.push(timeline.playing
    ? `balloon (constant level): following the ${show.focus === "sfc" ? "10 m" : layers[show.focus].def.title} wind through time as it plays: a trajectory on this level (it stays on it; real air also rises and sinks)`
    : `balloon (constant level): drifting in this moment's ${show.focus === "sfc" ? "10 m" : layers[show.focus].def.title} wind, 2 h of model time a second (press Play to follow the changing wind)`);
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
  if (hemi?.on) {
    const have = hemi.steps.filter((st) => hemi.src.isReady(st)).length;
    $("loadStatus").textContent = have < hemi.steps.length ? `loading the hemisphere ${have}/${hemi.steps.length} ${hemi.src.kind === "archive" ? "days" : "steps"}…` : `hemisphere: ${(hemi.src.bytes / 1e6).toFixed(1)} MB loaded`;
    return;
  }
  let total = 0, have = 0;
  for (const L of Object.values(layers)) {
    if (!L.visible) continue;
    for (const h of leads) {
      total++;
      if (bundlesFor(L).every((b) => loader.isReady(model, h, b))) have++;
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
  if (on && !timeline.repeat && timeline.atEnd()) timeline.pos = timeline.span().s;    // loop off: Play at the end starts over
  timeline.playing = on;
  $("playBtn").innerHTML = on ? `<span aria-hidden="true">❚❚</span><span class="pl"> Pause</span>` : `<span aria-hidden="true">▶</span><span class="pl"> Play</span>`;   // phones show the icon only
  $("playBtn").setAttribute("aria-label", on ? "Pause" : "Play");
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
$("timeMore").addEventListener("click", () => { const tb = document.querySelector(".timebar"), on = tb.classList.toggle("more"); $("timeMore").setAttribute("aria-expanded", String(on)); });
$("speedSel").addEventListener("change", (e) => { timeline.stepsPerSecond = Number(e.target.value); });
window.addEventListener("keydown", (e) => {
  if (e.target.closest?.("input, select")) return;
  // Simulate (panel review: Space and the arrows drove the hidden forecast): Space runs or pauses the model, the
  // arrows move between steps, K opens the "What am I looking at?" key, H hides the panel
  if (sim.on) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;            // leave the browser's own shortcuts alone
    if (e.code === "Escape" && !$("simKey").hidden) { $("simKey").hidden = true; $("simKeyBtn").focus(); return; }
    if (e.target.closest?.("button") && e.code === "Space") return;   // a focused button handles its own Space
    if (e.code === "Space") { e.preventDefault(); $("simStripPause").click(); }
    if (e.code === "ArrowRight") $("simNext").click();
    if (e.code === "ArrowLeft") $("simPrev").click();
    if (e.code === "KeyK") $("simKeyBtn")?.click();
    if (e.code === "KeyH") togglePanel();
    return;
  }
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
let sheet = null;                            // the panel as a bottom sheet on phones (made below)
// The simulator's data (the real sea and mountains, the settled 2-D states: ~340 KB) load only when Simulate is first
// opened (iPhone review: everything used to load before the first frame).
let SIM_SURFACE = null, SIM2D_STATES = null;
async function simData() {
  if (!SIM_SURFACE) [{ SIM_SURFACE }, { SIM2D_STATES }] = await Promise.all([import("./simsurface.js?v=20261031090012"), import("./sim2d_states.js?v=20261031090012")]);
}
{ const mqShort = matchMedia("(max-height: 500px)"), f = () => { document.body.classList.toggle("short", mqShort.matches); dirty = true; }; mqShort.addEventListener("change", f); f();
  // a phone on its side: the map fills the screen and the controls wait behind ☰ Controls (user report 2026-10-17);
  // turning to it puts the panel away, turning back brings it (the sheet takes over in portrait)
  const side = () => { if (mqShort.matches && !matchMedia("(max-width: 700px)").matches) togglePanel(false); else if (!mqShort.matches && $("panel").hidden && !sheet?.active()) togglePanel(true); };
  mqShort.addEventListener("change", () => setTimeout(side, 0)); setTimeout(side, 0); }
function togglePanel(on = $("panel").hidden) {
  if (sheet?.active()) { sheet.set(on ? "half" : "peek"); return; }       // phones: the sheet shrinks instead of hiding
  $("panel").hidden = !on;
  $("showPanel").hidden = on;
  document.body.classList.toggle("panel-off", !on);
  // The views stay reachable: in the panel, or beside "Controls" when it's hidden.
  const vb = $("viewbar");
  if (on) $("panel").insertBefore(vb, $("panel").querySelector(".tabs")); else $("showPanel").after(vb);
  vb.classList.toggle("floating", !on);
  dirty = true;
}
// on a phone, upright or on its side, Hide means the full view (user, 2026-10-18: "should work with hide controls in
// portrait too"); on a wider screen it hides just the panel, as before
$("hidePanel").addEventListener("click", () => (sheet?.active() || document.body.classList.contains("short") ? setFullView(true) : togglePanel(false)));
$("phoneKey").addEventListener("click", () => document.body.classList.add("showkey"));
$("legend").addEventListener("click", () => document.body.classList.remove("showkey"));
// Phones: the panel is a bottom sheet (sheet.js). --sheetBase is what sits under it: the timeline bar (Forecast, Past
// year) or nothing (Simulate). The 3-D view's framing and the docked boxes follow --sheetH.
function sheetBase() {
  const bars = [...document.querySelectorAll(".timebar")].filter((el) => !el.hidden && el.offsetParent);
  const h = bars.length ? Math.max(...bars.map((el) => el.offsetHeight)) + 10 : 0;
  document.body.style.setProperty("--sheetBase", `${h}px`);
}
// opens minimised: the map first, the controls a tap away (user report 2026-10-17: "can't see the display of the map")
sheet = makeSheet($("panel"), { half: 0.42, start: /[#&]cs=/.test(location.hash) ? "half" : "peek", peekEl: () => document.body.classList.contains("case-open") ? $("casePlayer").querySelector(".case-nav") : null, onChange: (state) => {
  dirty = true; if (sim.on) sim.offKey = null;
  // leaving the phone layout with the probe in the sheet: back into the dock; entering it with the probe open: into the sheet
  if (!state && $("probe").parentElement === $("panel")) { $("dock").prepend($("probe")); $("probe").classList.remove("in-sheet"); }
  if (state && !$("probe").hidden && $("probe").parentElement !== $("panel")) { $("panel").querySelector(".sheet-handle")?.after($("probe")); $("probe").classList.add("in-sheet"); }
  // entering the phone layout with the panel hidden (Hide on a wider screen, then a rotation): bring it back as the sheet
  if (state && $("panel").hidden) { $("panel").hidden = false; $("showPanel").hidden = true; const vb = $("viewbar"); $("panel").insertBefore(vb, $("panel").querySelector(".tabs")); vb.classList.remove("floating"); }
} });
{ const ro = new ResizeObserver(() => { sheetBase(); sheet.refresh(); }); for (const tb of document.querySelectorAll(".timebar")) ro.observe(tb); }
sheetBase();
$("showPanel").addEventListener("click", () => togglePanel(true));
// Full view (user request 2026-10-18: "a full screen of the visualization even in landscape, and toggle the controls off
// and on easily"): one round button in the corner hides everything but the picture, its labels, the time and the touch
// readout (CSS body.fullview); the same button, or F, brings it all back. Play keeps playing. On phones that allow it
// (Android) the page also goes truly full screen; iPhone Safari keeps its address bar (from the Home Screen there is none).
function setFullView(on = !document.body.classList.contains("fullview")) {
  document.body.classList.toggle("fullview", on);
  const b = $("fullBtn");
  b.textContent = on ? "☰" : "⛶";
  b.setAttribute("aria-pressed", String(on));
  b.setAttribute("aria-label", on ? "Show the controls" : "Full view: hide the controls");
  b.title = on ? "Show the controls (F)" : "Full view: only the picture (F). Tap again for the controls.";
  if (on) document.body.classList.remove("showkey");
  fullFrame(on);
  fcOffKey = null; if (sim.on) sim.offKey = null; dirty = true;
  try {
    if (matchMedia("(pointer: coarse)").matches) {
      if (on && !document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
      else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
  } catch { /* no Fullscreen API: the CSS full view is enough */ }
}
$("fullBtn").addEventListener("click", () => setFullView());
// Upright, the full view re-frames the view tighter (camPreset) and leaving it puts the camera back exactly as it was.
let fullCam = null;
function fullFrame(on) {
  if (sim.on || hemi?.on) return;                  // Simulate and the hemisphere frame themselves
  if (on) {
    fullCam = { pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov };
    const v = document.querySelector("[data-view].on")?.dataset.view;
    setTimeout(() => { if (document.body.classList.contains("fullview") && camera.aspect < 1 && v && v !== "storm") flyTo(v); }, 80);    // after the stage has resized
  } else if (fullCam) {
    flight = { from: { pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov }, to: fullCam, t0: performance.now(), ms: 900 };
    fullCam = null;
  }
}
// leaving the browser's full screen (a swipe, Esc) leaves the full view too, so the controls are never stranded
document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && document.body.classList.contains("fullview") && matchMedia("(pointer: coarse)").matches) setFullView(false); });
window.addEventListener("keydown", (e) => {
  if (e.code !== "KeyF" || e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.("input, select, textarea, [contenteditable]")) return;
  setFullView();
});

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
  if (hemi?.on && hemi.src.kind === "forecast" && hemi.forecasts[m]) { const ext = hemi.src.extended; hemi.setSource(hemi.forecasts[m]); hemi.src.extended = ext; hemi.blockKey = null; }
  for (const r of modelBox.querySelectorAll("input")) r.checked = r.value === m;
  noteKey = null;
  leads = leadsFor(model);
  timeline.setTimes(leads);      // position is in hours, so it carries over
  if (hemi?.on) hemiTimeline();  // days 8-10 stay if the hemisphere has them for this model (review)
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
  const wv = satChannel === "wv" && !!satWV;
  $("satEnhance").disabled = !sat || !satOn || wv;                // the cold-top colours are for infrared
  $("satEnhance").closest("label").classList.toggle("off", !satOn || wv);
  $("satChannel").value = wv ? "wv" : "ir";
}
if (satWV) $("satChannelRow").hidden = false;
$("satChannel").addEventListener("change", (e) => { satChannel = e.target.value; if (!satOn) { satOn = true; $("satToggle").checked = true; } custom(); syncSatControls(); updateSatellite(); updateHud(); updateLegend(); });
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
  const gap = flowGap(), arrow = Math.round(length * 0.28);         // arrowheads a little smaller (user report 2026-10-14: big, heavy flow lines)
  for (const L of Object.values(layers)) {
    L.barbs.every = every; L.barbs.length = length; L.barbs.key = null;
    L.flow.gapCells = gap; L.flow.arrowKm = arrow; L.flow.key = null;
  }
  if (Object.values(layers).some((L) => (L.barbsOn || L.flowOn) && L.visible)) applyTime(true);
  // The Past year's wind is on a 1-degree grid: half as many cells for the same spacing.
  if (arch.barbs) { arch.barbs.every = Math.max(1, Math.round(every / 2)); arch.barbs.length = length; arch.barbs.key = null; }
  if (arch.flow) { arch.flow.gapCells = Math.max(2, Math.round(gap / 2)); arch.flow.arrowKm = arrow; arch.flow.key = null; }
  for (const L of Object.values(hr.R)) if (L.flow) L.flow.arrowKm = arrow;
  if (hr.on && !hr.obs && HRRR_VIEWS[hr.view].wind) hrrrRender();
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
  updateLegendInner();
  phoneKey();
}
// On a phone the key is one line above the sheet (the first row of the full key); tapping it shows the full key
// (iPhone review round 2: below 700 px the key had been hidden altogether).
function phoneKey() {
  const k = $("phoneKey"), row = legend.querySelector(".legend-row");
  if (!row || !$("secChart").hidden) { k.hidden = true; return; }        // a slice chart sits there; its own key is in it
  const lab = row.querySelector(".legend-label")?.textContent ?? "", bar = row.querySelector(".legend-bar")?.style.background ?? "", ends = [...row.querySelectorAll(".legend-ends span")].map((e) => e.textContent);
  k.hidden = false;
  k.setAttribute("aria-label", `Colour key: ${lab}${ends.length ? `, ${ends[0]} to ${ends[ends.length - 1]}` : ""}. Tap for the full key.`);
  k.innerHTML = `<span class="lab">${lab}</span>${bar ? `<span class="bar" style="background:${bar}"></span>` : ""}${ends.length ? `<span>${ends[0]}–${ends[ends.length - 1]}</span>` : ""}<span aria-hidden="true">▴</span>`;
}
function updateLegendInner() {
  legend.innerHTML = "";
  if (sim.on) { simLegend(); return; }
  if (hemi?.on) { hemiLegend(); return; }
  if (satShown && satNow() === satWV && satWV) {
    // water vapour: the same stops as ground.js
    const e = satWV.entry, lo = Math.round(e.vmax_k - 273.15), hi = Math.round(e.vmin_k - 273.15);
    const stops = [[270, "#f2c069"], [265, "#e09a3c"], [256, "#a0703a"], [248, "#6b6b6b"], [240, "#2f6f9f"], [228, "#6fc3e8"], [215, "#d9f2ff"], [200, "#ffffff"]];
    const pct = (k) => (((e.vmax_k - k) / (e.vmax_k - e.vmin_k)) * 100).toFixed(1);
    const row = document.createElement("div");
    row.className = "legend-row";
    row.innerHTML = `<span class="legend-label">Satellite water vapour, mid-level (°C; brown = dry air aloft, blue and white = moist air and high cloud)</span>
      <span class="legend-bar" style="background:linear-gradient(to right,${stops.map(([k, c]) => `${c} ${pct(k)}%`).join(",")})"></span>
      <span class="legend-ends"><span>${lo}</span><span>${hi}</span></span>`;
    legend.appendChild(row);
  } else if (satShown) {
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
  if (arch.on && hr.on && hr.cur && !hr.obs) {
    // the view's colours, labelled with this region's source (HRRR 3 km or RTMA 2.5 km)
    const V = HRRR_VIEWS[hr.view], src = HIRES[hr.region], key = `${V.scale}@${hr.region}`;
    SCALES[key] ??= { ...SCALES[V.scale], label: `${V.label} (${src.short}, ${src.src})` };
    keys.unshift(key);
  }
  if (arch.on && hr.on && hr.cur && hr.obs === "radar") keys.unshift("obs_refc");
  if (arch.on && hr.on && hr.cur && hr.obs && hr.obs !== "radar") {
    // the observed satellite images' own colours (tools/fetch_case_obsimg.py), as the forecast's satellite key
    const row = document.createElement("div");
    row.className = "legend-row";
    if (hr.obs === "true") row.innerHTML = `<span class="legend-label">Satellite true colour, observed (GOES-West; as the eye would see it, daylight only)</span>`;
    else {
      const ir = hr.obs === "ir", st = ir ? [[30, "#000"], [-30, "#b0b0b0"], [-30.01, "#80b3ff"], [-40, "#2e70db"], [-50, "#2eb34a"], [-60, "#f2d13b"], [-70, "#e03a2e"], [-80, "#c25cd6"], [-90, "#fff"]]
        : [[-3, "#f2c069"], [-8, "#e09a3c"], [-17, "#a0703a"], [-25, "#6b6b6b"], [-33, "#2f6f9f"], [-45, "#6fc3e8"], [-58, "#d9f2ff"], [-73, "#fff"]];
      const lo = st[0][0], hi = st.at(-1)[0], pct = (c) => (((lo - c) / (lo - hi)) * 100).toFixed(1);
      row.innerHTML = `<span class="legend-label">${ir ? "Satellite infrared, observed (°C; colours = cold, high cloud tops)" : "Satellite water vapour, observed (°C; brown = dry air aloft, blue and white = moist)"}</span>`
        + `<span class="legend-bar" style="background:linear-gradient(to right,${st.map(([c, col]) => `${col} ${pct(c)}%`).join(",")})"></span><span class="legend-ends"><span>${lo}</span><span>${hi}</span></span>`;
    }
    legend.appendChild(row);
  }
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
    L.gl.uniforms.lineColor.value.set(opcShown ? OPC_CMP_COLOR : lineColorOf(L.def.key));
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
const needOk = (n) => (n === "clim" ? !!CLIM : n === "opc" ? !!OPC?.charts?.some((c) => !c.product.startsWith("hfo")) : n === "hfo" ? !!OPC?.charts?.some((c) => c.product.startsWith("hfo"))
  : n === "sat" ? !!sat : n === "waves" ? hasWaves(model) : n === "w" ? HAS_W : n === "pwat" ? HAS_PWAT : n === "hpbl" ? HAS_HPBL : !!CLIM?.oisst);
const questionOk = (q) => !q.needs || [].concat(q.needs).every(needOk);
// Two groups: the forecast's questions, and the past year's (archive.js) when
// the build has the archive. Picking one switches to its mode.
const ARCH_QS = ARCH?.days?.length ? ARCHIVE_QUESTIONS.filter((q) => !ARCHIVE_VIEWS[q.set.view].obs || ARCH.obs_days) : [];
qSel.innerHTML = `<optgroup label="Now and the forecast">${QUESTIONS.filter(questionOk).map((q) => `<option value="${q.id}">${q.label}</option>`).join("")}</optgroup>`
  + (ARCH_QS.length ? `<optgroup label="The past year">${ARCH_QS.map((q) => `<option value="${q.id}">${q.label}</option>`).join("")}</optgroup>` : "")
  + `<option value="lesson" hidden>Today's lesson</option><option value="custom">Custom (your own settings)</option>`;
qSel.addEventListener("change", (e) => {
  const aq = ARCH_QS.find((x) => x.id === e.target.value);
  if (aq) { applyArchiveQuestion(aq); return; }
  const q = QUESTIONS.find((x) => x.id === e.target.value);
  if (q) { if (arch.on) exitArchive(); applyQuestion(q); } else custom();
});
// "Today's set-up, from the forecasters" (afdsetup.js; user request 2026-10-18): one question per NWS office whose newest
// discussion this build fetched (afd.json), at the top of the forecast's questions. Each lists the weather features the
// discussion names; tapping one sets the view for it, and the live note measures it in the model.
const afdEsc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function afdCard(q) {
  const a = q.afd, o = AFD_OFFICES[a.code];
  const fmt = (ms, opts) => new Intl.DateTimeFormat("en-US", { timeZone: o.tz, ...opts }).format(ms);
  const local = fmt(Date.parse(a.issued), { weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  const f = q.features[q.fi];
  const btns = q.features.map((x, i) => `<button class="mini${i === q.fi ? " on" : ""}" data-afdf="${i}" title="${afdEsc(`"${x.words}" (${x.section})`)}">${afdEsc(x.label)}</button>`).join(" ");
  const syn = a.sections.synopsis || a.sections.discussion || "";
  let now = "";
  if (f) {
    const t = Date.parse(f.at), h = hoursFrom(manifest.anchor, f.at), span = timeline.span();
    const out = h < span.s - 3 ? " (before this build's timeline: shown at its start)" : h > span.e + 3 ? " (beyond this build's forecast: shown at its end)" : "";
    now = `<span class="afd-now"><b>${afdEsc(f.label)}</b>: “${afdEsc(f.sentence)}” (${afdEsc(f.section)}). `
      + `Shown ${f.when.startsWith("at the time") || f.when.startsWith("about") ? afdEsc(f.when) : `for “${afdEsc(f.when)}”`}: ${afdEsc(fmt(t, { weekday: "short", day: "numeric", month: "short", hour: "numeric", timeZoneName: "short" }))}${out}, at the model's nearest real step. `
      + `${afdEsc(f.explain[0].toUpperCase() + f.explain.slice(1))}. The note below says what the model has.</span>`;
  }
  return `<b>${afdEsc(a.name)}</b>, issued ${afdEsc(local)} (${afdEsc(a.issued.slice(11, 16))} UTC), <a href="${afdEsc(a.url)}" target="_blank" rel="noopener">the whole discussion</a>:`
    + `<span class="afd-quote">“${afdEsc(syn)}”</span>`
    + `<span class="afd-feats">What it names (tap one to see it): ${btns}</span>` + now
    + `<span class="muted afd-how">The features are found by matching the forecasters' words, not read by a person or an AI. On a year of discussions some checks track what the forecasters mean well and some barely at all: the guide gives the numbers. Not an official forecast: for that, read the discussion itself.</span>`;
}
function afdApply(q, i) {
  q.fi = i;
  const f = q.features[i];
  q.spec = { ...f.spec, time: "at", at: f.at, look: AFD_OFFICES[q.afd.code].look };
  q.lookFor = afdCard(q);
  applyQuestion(q);
}
// Held back until the checks use each feature's own time and sentence and are measured on a year of discussions (user
// decision 2026-10-18, after asking whether the set-up was accurate); the build still fetches afd.json.
const AFD_QUESTIONS = true;
fetch(`${DATA}/afd.json${buildVersion(manifest)}`).then((r) => (r.ok && AFD_QUESTIONS ? r.json() : null)).catch(() => null).then((afd) => {
  if (!afd?.offices) return;
  const opts = [];
  for (const code of ["SEW", "HFO"]) {
    const a = afd.offices[code];
    if (!a || !AFD_OFFICES[code]) continue;
    const features = afdFeatures(a.sections, a.issued, code).filter((f) => questionOk({ needs: f.needs }));
    if (!features.length) continue;
    const q = { id: `afd-${code.toLowerCase()}`, label: `Today's set-up from the forecasters: ${AFD_OFFICES[code].place} (${a.name})`,
      afd: { ...a, code }, features, fi: 0, guide: "afd",
      why: "Forecasters explain each forecast in a written discussion. Matching their words to the map shows what a trough, a ridge, a front or the trades look like on the day they're talking about, and whether this model agrees.",
      note(ctx) { const f = this.features[this.fi]; return f ? featureCheck(f.key, ctx, code, f.words)?.text ?? null : null; } };
    q.spec = { ...features[0].spec, time: "at", at: features[0].at, look: AFD_OFFICES[code].look };
    q.lookFor = afdCard(q);
    QUESTIONS.unshift(q);
    opts.push(`<option value="${q.id}">${afdEsc(q.label)}</option>`);
  }
  const grp = qSel.querySelector("optgroup");
  if (grp && opts.length) grp.insertAdjacentHTML("afterbegin", opts.join(""));
  // a shared link to one of these opened before afd.json arrived: open it now
  const want = (location.hash.match(/[#&]q=(afd-[a-z]+)/) || [])[1], q = want && QUESTIONS.find((x) => x.id === want);
  if (q && !question) afdApply(q, 0);
});
$("qLook").addEventListener("click", (e) => {
  const b = e.target.closest?.("[data-afdf]");
  if (b && question?.afd) afdApply(question, Number(b.dataset.afdf));
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
  wind: "wind speed (kt): pale blue light, blue and green moderate, orange and red strong, magenta strongest",
  temp: "temperature (°C): blue cold, red warm",
  rh: "relative humidity (%): orange and tan dry, white around 50 %, cyan and teal moist",
  moist: "moist air only (RH ≥ 70 %), cyan; drier air see-through",
  vertical: "vertical motion (cm/s): blue rising (cloud and rain), orange sinking (clearing)",
  height_anom: "height against its 1991–2020 average (m): blue lower than normal (troughs), red higher (ridges, blocks)",
  temp_anom: "temperature against its 1991–2020 average (°C): blue colder than normal, red warmer",
  mslp: "sea-level pressure (hPa): lows dark blue, around 1010 pale green, highs orange and red",
  mslp_anom: "sea-level pressure against its 1991–2020 average (hPa): blue lower than normal, red higher",
  water_vapour: "water vapour, all the water in the air above each point (mm): orange and tan dry, green moist, blue and purple very moist (atmospheric rivers)",
  waves: "significant wave height (m): pale small, blue and green moderate, orange to purple big",
  wave_period: "wave period (s): pale short (local wind-sea), dark red long (swell from far away)",
  sst: "sea temperature, the model's (°C): blue cold, red warm",
  sst_anom: "sea temperature against its 1991–2020 average (°C): blue colder than normal, red warmer",
  sst_obs: "observed sea temperature, NOAA OISST (°C): blue cold, red warm",
  sst_obs_anom: "observed sea temperature against its 1991–2020 average (°C): blue colder than normal, red warmer",
  vort: "vorticity, the air's spin: red counter-clockwise (cyclonic north of the equator), blue clockwise",
  div: "divergence: red air spreading out, blue converging", thetae: "θe, air masses with their moisture counted in (K): blue cold and dry, red warm and moist",
  grad: "thermal gradient (K per 100 km): the front zones stand out", fgen: "frontogenesis: red where fronts are forming, blue where they're weakening",
  pbl: "boundary-layer depth (m), GFS: how deep the air near the ground is being stirred; pale shallow (a lid close to the ground: smoke and pollution trapped), dark deep (afternoon heating, cold air over warm sea)",
  rib: "bulk Richardson number from the ground to this level: yellow and orange below 0.25, where the ground's air mixes up this far; green from about 0.6 to 1, marginal; blue toward 2 and above, where the layer is too stable to mix (an inversion caps it); red below 0, where it overturns by itself",
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
// "Look for" first; the map key and the reason for the view fold away (user request 2026-10-15: with the question above
// today's lessons, the full card pushed the lessons a screen down). Open or closed is remembered on this device.
// "Look for" can fold too (user request 2026-10-16), open unless put away; each fold remembers its state on this device.
function questionCard(key, why, lookFor) {
  let more = false, look = true;
  try { more = localStorage.getItem("np3d.qMore") === "1"; look = localStorage.getItem("np3d.qLook") !== "0"; } catch { /* private mode */ }
  return `<details class="q-look"${look ? " open" : ""}><summary>Look for</summary><p>${lookFor}</p></details>`
    + `<details class="q-more"${more ? " open" : ""}><summary>On the map, and why this view</summary>${key}<p><b>Why this view:</b> ${why}</p></details>`;
}
for (const id of ["qLook"]) $(id)?.addEventListener("toggle", (e) => {
  const k = e.target.matches?.("details.q-more") ? "np3d.qMore" : e.target.matches?.("details.q-look") ? "np3d.qLook" : null;
  if (k) try { localStorage.setItem(k, e.target.open ? "1" : "0"); } catch { /* private mode */ }
}, true);
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
  if (!satShown || satNow() !== sat) return null;          // cloud-top temperatures: infrared only
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
let loopBeforeQ = null;          // the loop a question replaced (applyQuestion)
function applyQuestion(q, instant = false) {
  if (q.id !== "lesson") lessonMarks = null;              // another question: the lesson's rings go
  question = q;
  qSel.value = q.id;
  const sp = q.spec;
  hlLevels.clear(); hlByHand.clear();
  if (sp.focusLines !== false) hlLevels.add(sp.focus);       // the chart questions turn the model's lines (and so its H and L) off
  for (const k of sp.hl ?? []) if (layers[k]) { hlLevels.add(k); if (k !== sp.focus) hlByHand.add(k); }   // H and L on other levels too (the gradient-wind questions)
  show.focus = sp.focus; show.context = new Set(sp.context); show.fill = sp.fill; focusWasContext = false;
  show.surfaceParticles = surfaceParticlesOf(sp);
  show.particles = sp.particles; show.barbs = sp.barbs; show.flow = !!sp.flow; show.focusLines = sp.focusLines ?? true;
  relief = sp.relief ?? 1;
  // the focus fill's opacity: a question may lighten it so the levels under it show (default 0.75)
  focusOpacity = sp.opacity ?? 0.75; $("fillOpacity").value = String(focusOpacity);
  if (OPC) setOpcProduct(sp.opc ?? "");
  if (OPC && sp.paper != null && $("opcPaper").checked !== sp.paper) { $("opcPaper").checked = sp.paper; opcLayer?.setPaper(sp.paper); opcCompare(); }
  if (sp.time === "opc-sat" && OPC && sp.opc && sat) {
    // the newest analysis with a satellite image within 30 minutes of it (the analyses are 6-hourly, the images every 20 min)
    const imgs = sat.frames.map((f) => Date.parse(f.time));
    const a = OPC.charts.filter((c) => (CHART_ALIAS[c.product] ?? c.product) === sp.opc && c.lead_h === 0 && imgs.some((t) => Math.abs(t - Date.parse(c.valid)) <= 30 * 60e3))
      .sort((x, y) => Date.parse(y.valid) - Date.parse(x.valid))[0];
    if (a) timeline.pos = timeline.clamp(hoursFrom(manifest.anchor, a.valid));
  }
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
  // a question can loop only the satellite's hours while it's on (user request 2026-10-18: the model against the
  // satellite); the next question puts back the loop that was there before
  if (sp.loop === "sat" && sat) { if (loopBeforeQ == null) loopBeforeQ = $("loopSel").value; setLoop("sat", true, false); }      // and plays it
  else if (loopBeforeQ != null) { setLoop(loopBeforeQ, false, false); loopBeforeQ = null; }
  if (sp.time === "now" || (sp.time !== "now" && sp.time !== "at" && sp.time !== "opc-sat" && !sat)) timeline.pos = opened.pos;
  // a given time (today's set-up from the forecasters: the time the discussion's sentence talks about), at the nearest
  // real model step so nothing shown is interpolated
  if (sp.time === "at" && sp.at) {
    const h = timeline.clamp(hoursFrom(manifest.anchor, sp.at));
    timeline.pos = leads.reduce((b, x) => (Math.abs(x - h) < Math.abs(b - h) ? x : b), leads[0]);
  }
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
// The upright full view's framing (camPreset; user request 2026-10-21), measured at 375x812 by projecting places: frame
// as if the screen were 0.8 wide per 1 tall (TA), aim 0.35 of the box's height south of its centre (TS), look down at
// about 63° (TP: the camera 0.5 box-heights south per 1 up), and 0.13 of its width east (TX), so the box's north edge
// (65°N) is near the top (y 177), 20°S near the bottom (647), Seattle (345) and Honolulu (176) in view; Japan is cropped.
const TA = 0.8, TS = 0.35, TP = 0.5, TX = 0.13;
function camPreset(name) {
  // full view on an upright phone (user request 2026-10-21): frame as if the screen were nearly square, so the map fills
  // the height and its far east and west are cropped (drag to see them) instead of a small map in a tall black screen
  const a0 = camera.aspect || 1.6, tall = document.body.classList.contains("fullview") && a0 < 1, a = tall ? Math.max(a0, TA) : a0;
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
    const d = Math.max(H * 1.12, (W * 1.06) / a) / (2 * t), x = cx + (tall ? TX * W : 0);      // upright full view: toward the Northwest
    return { pos: [x, cy - 1, d], target: [x, cy, 0], fov };
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
  // tall: looking down more steeply and aimed south and east of the centre (TA..TX above), so the map fills the height
  if (tall) return { pos: [cx + TX * W, cy - TS * H - H * TP * widen, H * 1.0 * widen], target: [cx + TX * W, cy - TS * H, 250], fov: 45 };
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

// ---- the Northern Hemisphere view (hemiview.js; docs/hemisphere_plan.md; user request 2026-10-17) ----------------
// Off by default and never remembered between visits (a shared link carries it). The globe from above the North Pole,
// the Pacific at the bottom; its own scene, so the Pacific view waits untouched and comes back exactly as it was.
// The time carries over (arriving paused at the nearest 6-hourly step: the hemisphere has only those); GFS only for now.
let hemiSaved = null;
// The hemisphere's own grid when the forecast has none but the past year does (the archive's days are drawn on it).
const NH_DEFAULT = { models: [], step_hours: 6, grid: { lat0: 90, dlat: -1, nlat: 111, lon0: 0, dlon: 1, nlon: 360, wrap: true }, fields: [], anomalies: false };
const NH_FORECAST = !!(manifest.hemisphere && manifest.files?.gfs && Object.values(manifest.files.gfs).some((f) => f?.nh));
let NH_ARCH = null;                           // the past year's hemisphere index (archive_nh/index.json), fetched when first needed
if (NH_FORECAST || ARCH?.hemisphere?.days) {
  hemi = new HemisphereView({ manifest: NH_FORECAST ? manifest : { ...manifest, hemisphere: NH_DEFAULT }, dataBase: DATA, geo, backdrop, background: BG.space, lite: LITE,
    onLoad: () => { if (hemi.on) { applyTime(); updateLoadStatus(); if (hemi.show.block) updateLegend(); } } });
  hemi.attach(root);
  $("hemiBtn").hidden = false;
}
// The hemisphere's time: the forecast's hours, or in the Past year and cases, the day shown (its index x 24 h).
const hemiTime = () => (hemi.src.kind === "archive" ? arch.i * 24 : timeline.pos);
// A step in words: the forecast's run and lead, or the archive day's date.
function hemiStepText(step) {
  if (hemi.src.kind !== "archive") return sourceText(step);
  const d = hemi.src.days[Math.round(step / 24)];
  return d ? `GFS analysis ${new Date(`${d.date}T00:00:00Z`).toUTCString().slice(5, 16)} 00 UTC` : "no hemisphere map for this day";
}
// The month (1-12) of a step's valid time, for the season-aware notes.
function hemiMonth(step) {
  if (hemi.src.kind === "archive") { const d = hemi.src.days[Math.round(step / 24)]; return d ? Number(d.date.slice(5, 7)) : 1; }
  return new Date(Date.parse(manifest.anchor) + step * 3600e3).getUTCMonth() + 1;
}
// A step's valid time, short: "Sun 18 12Z" (forecast) or "26 Jun 2021" (archive), for lists and chart labels.
function hemiWhen(step) {
  if (hemi.src.kind === "archive") { const d = hemi.src.days[Math.round(step / 24)]; return d ? new Date(`${d.date}T00:00:00Z`).toUTCString().slice(5, 16) : "?"; }
  return fmtUtcShort(Date.parse(manifest.anchor) + step * 3600e3);
}
// The past year's hemisphere for the days the Past year viewer is stepping through (the year, or a case's event window).
let nhArchFor = null;
async function nhArchiveSource() {
  if (!ARCH?.hemisphere) return null;
  NH_ARCH ??= await fetch(`${DATA}/${ARCH.hemisphere.index}${buildVersion(manifest)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!NH_ARCH) return null;
  if (nhArchFor?.list === ARCH_DAYS) return nhArchFor.src;
  const by = new Map([...NH_ARCH.days, ...NH_ARCH.events.flatMap((e) => e.days)].map((d) => [d.date, d]));
  const src = archiveSource(ARCH_DAYS.map((d) => by.get(d.date) ?? null), NH_ARCH, DATA, buildVersion(manifest), hemi.H);
  nhArchFor = { list: ARCH_DAYS, src };
  return src;
}
async function enterHemisphere({ instant = REDUCED_MOTION, show = null, keepTime = false } = {}) {
  if (!hemi || hemi.on) return;
  if (sim.on) exitSim();
  // in the Past year (and cases) the hemisphere shows the day on screen; otherwise the forecast
  const src = arch.on && !arch.comp ? await nhArchiveSource() : NH_FORECAST ? (hemi.forecasts[model] ?? hemi.forecast) : null;
  if (!src || hemi.on) { if (!src) { openNote = arch.on ? "No hemisphere maps in this build's past year yet." : "The forecast has no hemisphere in this build."; updateHud(); } return; }
  hemi.setSource(src);
  hemiSaved = { camera: [...camera.position.toArray(), ...controls.target.toArray(), camera.fov], morph: geo.uniforms.morph.value,
    view: document.querySelector("[data-view].on")?.dataset.view ?? null, model, satOn };
  setPlaying(false);
  const notes = [];
  if (src.kind === "forecast" && src.model !== model) { switchModel(src.model); notes.push(`switched to ${MODEL_LABEL[src.model] ?? src.model}: the hemisphere has no ${MODEL_LABEL[model] ?? model} steps in this build`); }
  if (show) Object.assign(hemi.show, show);
  if (src.kind === "forecast" && !keepTime) {
    const s = hemi.nearestStep(timeline.pos);
    if (Math.abs(s - timeline.pos) > 1e-6) notes.push("moved to the nearest 6-hourly step: the hemisphere has one every 6 hours");
    timeline.pos = timeline.clamp(s);
  }
  hemi.on = true;
  hemiNote = notes.join("; "); hemiNoteAt = hemiTime();
  document.body.classList.add("hemi");
  document.body.classList.toggle("hemi-arch", src.kind === "archive");     // the Past year's and the case's own panels stay
  $("hemiBtn").classList.add("on"); $("hemiBtn").setAttribute("aria-pressed", "true");
  for (const r of modelBox.querySelectorAll("input")) if (src.kind === "forecast" && !hemi.forecasts[r.value]) r.disabled = true;
  morphAnim = null;
  geo.uniforms.morph.value = 1; backdrop.visible = true; backdrop.material.uniforms.opacity.value = 1;
  setControlMode(true);
  const c = hemi.cameraPreset(camera.aspect, EARTH_AXIS);
  const to = { pos: new THREE.Vector3(...c.pos), target: new THREE.Vector3(...c.target), fov: c.fov };
  if (instant) { camera.position.copy(to.pos); controls.target.copy(to.target); camera.fov = to.fov; camera.updateProjectionMatrix(); controls.update(); flight = null; }
  else flight = { from: { pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov }, to, t0: performance.now(), ms: 1600 };
  syncHemiPanel();
  $("hemiLayers").open = !sheet?.active() && !document.body.classList.contains("short");    // phones: the layers folded, the questions first
  hemiIndices();
  hemiStorms().then(syncHemiQuestions);
  syncHemiQuestions();
  if (hemi.show.polar) hemiProjection(true, true);                 // a shared link (or this visit) on the flat map
  hover = null; tip.hidden = true; pin.visible = false;
  requestAround(); applyTime(true); updateLegend(); updateLoadStatus();
  dirty = true;
}
function exitHemisphere(instant = false) {
  if (!hemi?.on) return;
  hemi.on = false;
  hemiProjAnim = null; if (geo.uniforms.polar.value) { hemi.setPolar(0); hemi.rebuildGuides(); }     // the Pacific never sees the polar map
  hemiNote = "";
  document.body.classList.remove("hemi", "hemi-arch");
  $("hemiBtn").classList.remove("on"); $("hemiBtn").setAttribute("aria-pressed", "false");
  for (const r of modelBox.querySelectorAll("input")) r.disabled = !manifest.inits?.[r.value];
  hemi.circle50.visible = false; hemi.setTroughs(null); hq.kind = null; hq.question = null; $("hemiQText").hidden = true;
  hemi.setTrace(null); hemiTrace = null; $("hemiTraceNote").hidden = true;
  hemiTimeline(); timeline.pos = timeline.clamp(timeline.pos);
  // never remembered between visits (plan): the layers back to their defaults, days 8-10 off, the globe
  Object.assign(hemi.show, hemi.defaults);
  for (const f of Object.values(hemi.forecasts)) f.extended = false;
  $("hemiGlobe").classList.add("on"); $("hemiPolar").classList.remove("on");
  const s = hemiSaved;
  // the model it switched away from (after s is set: the line above it threw on every Back, 2026-10-17 to -18, leaving
  // the camera and view unrestored)
  if (s.model && s.model !== model && manifest.inits?.[s.model]) switchModel(s.model);
  morphAnim = null; flight = null;
  setControlMode(s.morph > 0.5);
  geo.uniforms.morph.value = s.morph; backdrop.visible = s.morph > 0.02; backdrop.material.uniforms.opacity.value = s.morph;
  const to = { pos: new THREE.Vector3(s.camera[0], s.camera[1], s.camera[2]), target: new THREE.Vector3(s.camera[3], s.camera[4], s.camera[5]), fov: s.camera[6] };
  if (instant || REDUCED_MOTION) { camera.position.copy(to.pos); controls.target.copy(to.target); camera.fov = to.fov; camera.updateProjectionMatrix(); controls.update(); }
  else flight = { from: { pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov }, to, t0: performance.now(), ms: 1400 };
  if (s.view) for (const b of document.querySelectorAll("[data-view]")) b.classList.toggle("on", b.dataset.view === s.view);
  hover = null; tip.hidden = true;
  requestAround(); applyTime(true); updateLegend(); updateLoadStatus();
  dirty = true;
}
let hemiTrace = null;                      // the traced air on screen: {name, lat, lon, at}
let hemiNote = "", hemiNoteAt = null, hemiFrame = 0;
// The flat polar map: the projection and the camera move together (hemiProjection, ticked in frame()).
let hemiProjAnim = null;
function hemiProjection(polar, instant = REDUCED_MOTION) {
  const from = geo.uniforms.polar.value, to = polar ? 1 : 0;
  hemi.show.polar = !!polar;
  $("hemiGlobe").classList.toggle("on", !polar); $("hemiPolar").classList.toggle("on", !!polar);
  const c = polar ? hemi.cameraPresetPolar(camera.aspect, EARTH_AXIS) : hemi.cameraPreset(camera.aspect, EARTH_AXIS);
  const dest = { pos: new THREE.Vector3(...c.pos), target: new THREE.Vector3(...c.target), fov: c.fov };
  if (instant || from === to) {
    hemi.setPolar(to); hemi.rebuildGuides(); hemiProjAnim = null; flight = null;      // any camera move under way would undo it (review)
    camera.position.copy(dest.pos); controls.target.copy(dest.target); camera.fov = dest.fov; camera.updateProjectionMatrix(); controls.update();
    applyTime(true); return;
  }
  hemiProjAnim = { from, to, t0: performance.now(), ms: 1300 };
  flight = { from: { pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov }, to: dest, t0: performance.now(), ms: 1300 };
}
function tickHemiProjection(now) {
  if (!hemiProjAnim) return false;
  const k = Math.min(1, (now - hemiProjAnim.t0) / hemiProjAnim.ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  hemi.setPolar(hemiProjAnim.from + (hemiProjAnim.to - hemiProjAnim.from) * e);
  if (k >= 1) { hemiProjAnim = null; hemi.rebuildGuides(); applyTime(true); }
  return true;
}      // a note on arriving, shown until the time is moved
function hemiApply(force = false) {
  hemi.playing = timeline.playing;
  const ok = hemi.apply(hemiTime(), force);
  if (hemiTrace && Math.abs(hemiTime() - hemiTrace.at) > 1e-6) { hemi.setTrace(null); hemiTrace = null; $("hemiTraceNote").hidden = true; }   // it belongs to one moment
  if (!ok) hemi.request(hemiTime(), LITE ? 4 : Infinity);
  if (hq.kind) hemiTroughs();
  hemi.placeStorms(hemiTime());
  hemiQuestionNote();
  drawHov();
  drawVortex();
  drawWaves();
  drawHawaii();
  updateHud();
  if (hover) updateReadout();
  dirty = true;
}
// Days 8-10 (the hemisphere only): the shared timeline runs on past the Pacific's last step while they're shown, and
// back to it otherwise.
function hemiTimeline() {
  const src = hemi?.on ? hemi.src : null;
  const ext = src?.kind === "forecast" && src.extended ? src.allSteps.filter((s) => s > leads.at(-1) + 1e-6) : [];
  const want = ext.length ? [...leads, ...ext] : leads;
  if (timeline.leads.length === want.length && timeline.leads.at(-1) === want.at(-1)) return;
  timeline.setTimes(want);
  slider.min = String(timeline.start); slider.max = String(timeline.end);
  drawMarkers();
}
function hemiHud() {
  if (hemi.src.kind === "archive") {
    archHud();
    const st = arch.i * 24, ok = hemi.src.days[arch.i];
    $("hudRun").textContent = `${archEvent ? "GFS analysis · event archive" : "GFS analysis · the past year"} · Northern Hemisphere (2°)`;
    if (!ok) { const b = $("hudInterp"); b.hidden = false; b.textContent = "no hemisphere map for this day in this build"; }
    else if (!hemi.isReady(st)) { const b = $("hudInterp"); b.hidden = false; b.textContent = "loading the hemisphere…"; }
    return;
  }
  const h = timeline.pos, init = manifest.inits?.gfs;
  setHudTime(Date.parse(manifest.anchor) + h * 3600e3);
  $("hudLead").textContent = relNow(h, NOW_H);
  const sg = hemi.segment(h), notes = [];
  if (hemiNote && Math.abs(h - hemiNoteAt) < 1e-6) notes.push(hemiNote);
  if (sg) {
    const near = srcOf(sg.t < 0.5 ? sg.s0 : sg.s1);
    $("hudRun").textContent = `${near.text} · Northern Hemisphere, ${hemi.src.model === "ecmwf" ? "ECMWF 0.25°" : "GFS 0.5°"} shown at 1°`;
    if (sg.t > 1e-3 && sg.t < 1 - 1e-3) notes.push(`interpolated between ${sourceText(sg.s0)} and ${sourceText(sg.s1)} (the hemisphere has a step every 6 hours)`);
    if (h > sg.s1 + 1e-6 || h < sg.s0 - 1e-6) notes.push("outside the hemisphere's steps: the nearest is shown");
    if (h > (hemi.src.lastPacific ?? Infinity) + 1e-6) notes.push("days 8–10: low skill, GFS every 12 hours; the waves' positions are possibilities, not a forecast");
    else if (h - hoursFrom(manifest.anchor, init) > 120) notes.push("beyond day 5: treat the positions of the waves as possibilities");
  } else $("hudRun").textContent = "Northern Hemisphere: no steps in this build";
  if (!hemi.isReady(h)) notes.push("loading the hemisphere…");
  const badge = $("hudInterp");
  badge.hidden = !notes.length; badge.textContent = notes.join(" · "); badge.title = badge.textContent;
  $("timeSlider").value = String(h);           // the thumb follows Play, the steps and Now (user report 2026-10-17)
}
function hemiReadout() {
  const v = hemi.valuesAt(hover.lat, hover.lon);
  if (!v || hover.lat < 10) { tip.hidden = true; return; }
  const lat = hover.lat, lon = hover.lon;
  const lonTxt = lon > 180 ? `${(360 - lon).toFixed(0)}°W` : `${lon.toFixed(0)}°E`;
  const sign = (x, d = 0) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(d)}`;
  const rows = [`<b>${lat.toFixed(0)}°N ${lonTxt}</b> <span class="muted">${hemiStepText(v.step)}${hemi.src.kind === "archive" ? " (2° data)" : ""}</span>`];
  if (v.gh500 != null) rows.push(`500 mb height ${Math.round(v.gh500)} m${v.gha500 != null ? ` (${sign(v.gha500)} m vs 1991–2020: ${v.gha500 < -60 ? "a trough, lower than normal" : v.gha500 > 60 ? "a ridge, higher than normal" : "near normal"})` : ""}`);
  if (v.jet != null) rows.push(`250 mb wind ${Math.round(v.jet)} kt${v.jet >= 60 ? " — in the jet stream" : ""}`);
  if (v.blocked && hemi.show.block) rows.push("<b>blocked flow</b> on this meridian: the westerlies at 60°N have stopped or reversed");
  if (v.mslp != null) rows.push(`sea-level pressure ${v.mslp.toFixed(0)} hPa${v.mslpa != null ? ` (${sign(v.mslpa)} vs 1991–2020)` : ""}`);
  else rows.push(`<span class="muted">high ground: sea-level pressure not shown (850 mb is underground here)</span>`);
  if (v.t850 != null) rows.push(`850 mb temperature ${(v.t850 - 273.15).toFixed(0)} °C${v.ta850 != null ? ` (${sign(v.ta850)} °C vs 1991–2020)` : ""}`);
  tip.innerHTML = rows.join("<br>");
  tip.hidden = false;
  const r = root.getBoundingClientRect();
  tip.style.left = `${Math.min(hover.px + 14, r.width - tip.offsetWidth - 8)}px`;
  tip.style.top = `${Math.min(hover.py + 14, r.height - tip.offsetHeight - 8)}px`;
}
// The panel: one fill, the 500 mb lines, isobars, the jet's flow lines (at most three things at once: the fill counts).
function syncHemiPanel() {
  const sel = $("hemiFill");
  sel.innerHTML = Object.entries(NH_FILLS).filter(([, f]) => !f.needs || ((hemi.src.kind === "archive" ? NH_ARCH?.fields : manifest.hemisphere?.fields) ?? []).includes(f.needs))
    .map(([k, f]) => `<option value="${k}"${hemi.show.fill === k ? " selected" : ""}>${f.label}</option>`).join("");
  $("hemiExtRow").hidden = !(hemi.src.kind === "forecast" && hemi.src.allSteps?.length > hemi.src.steps.length || hemi.src.extended);
  $("hemiExt").checked = !!hemi.src.extended;
  $("hemiZ500").checked = hemi.show.z500; $("hemiMslp").checked = hemi.show.mslp; $("hemiJet").checked = hemi.show.jet; $("hemiParticles").checked = hemi.show.particles; $("hemiRelief").checked = hemi.show.relief; $("hemiBlock").checked = hemi.show.block;
  let seen = false;
  try { seen = localStorage.getItem("np3d.hemiWelcome") === "1"; } catch { /* private window */ }
  $("hemiWelcome").hidden = seen;
}
// The hemisphere's key: its fill, then what the lines are, and the anomaly caveat on the key itself (panel round 2:
// against a coarse 1991-2020 reanalysis, the warming since and the model's own bias make much of the hemisphere look
// "above normal", most at 850 mb).
function hemiLegend() {
  const add = (html) => { const row = document.createElement("div"); row.className = "legend-row"; row.innerHTML = html; legend.appendChild(row); };
  const fk = NH_FILLS[hemi.show.fill];
  if (fk.scale && hemi.fill.visible) {
    const s = SCALES[fk.scale];
    add(`<span class="legend-label">${s.label} (${s.units})</span><span class="legend-bar" style="background:${cssGradient(fk.scale)}"></span>
      <span class="legend-ends"><span>${s.ends?.[0] ?? s.min}</span><span>${s.anomaly ? "+" : ""}${s.max}</span></span>`);
    if (hemi.show.fill === "dgh500") {
      const st = hemi.cur.t < 0.5 ? hemi.cur.s0 : hemi.cur.s1, pc = hemi.src.entry(st)?.prev_cycle;
      add(`<span class="legend-note">${pc ? `${MODEL_LABEL[model] ?? model} ${runTag(manifest.sources[model][String(st)].cycle)} minus ${runTag(pc)} at the same time: red, this run has the 500 mb surface higher than the run before; blue, lower. Big colours where a trough or ridge moved between runs: the model is less sure there. Small colours don't mean it's right, only that it hasn't changed its mind.` : "no earlier run to compare at this time (the run before didn't reach it, or this time comes from the same run)"}</span>`);
    }
    if (hemi.show.fill === "pwat") add(`<span class="legend-note">All the water vapour above each point, in mm if it rained out. A long, narrow plume of high values reaching from the tropics toward the Northwest is an atmospheric river.</span>`);
    if (s.anomaly) add(`<span class="legend-note">Against an approximate 1991–2020 normal from a coarse reanalysis (NCEP/NCAR, 2.5°). The warming since then and the model's own bias make much of the hemisphere look a little above normal${hemi.show.fill === "ta850" ? ", most of all at 850 mb" : ""}: read the big blue and red blobs, not the faint tint.</span>`);
  }
  const lines = [];
  if (hemi.show.z500) {
    const f = hemi.cur && (hemi.cur.t < 0.5 ? hemi.cur.a : hemi.cur.b);
    lines.push("dark lines: 500 mb height every 60 m (the steering level; low heights toward the pole, troughs dip south)");
    if (f) lines.push(`bold line: ${f.boldZ} m, the 500 mb contour whose average latitude round the hemisphere is nearest 50°N now (${f.boldLat.toFixed(1)}°N); poleward of it is the cold air, and its bulges and dips are the ridges and troughs`);
  }
  if (hemi.show.block && hemi.chains?.length) lines.push(`orange: <b>a block</b>, blocked flow lasting 4 days or more (in the steps loaded): ${hemi.chains.map((c) => `${lonName(c.from)} to ${lonName(c.to)}, ${hemiWhen(c.start)} to ${hemiWhen(c.end)} (${(c.hours / 24).toFixed(1)} days)`).join("; ")}`);
  if (hemi.show.block) lines.push(hemi.blocks?.length
    ? `band along 60°N (yellow; orange where it is part of a block): blocked flow now, ${hemi.blocks.map((b) => `${lonName(b.from)} to ${lonName(b.to)}`).join(" and ")} (heights rise toward the pole south of 60°N and fall steeply north of it: the westerlies there have stopped or reversed)`
    : "blocked flow: none at 56–64°N at this time (a ridge further south, however big, isn't counted)");
  if (hemi.show.relief) lines.push("relief: the 500 mb surface's shape ×150 (a 400 m trough is a 60 km dent), shaded as if lit from the north-west");
  if (hemi.show.mslp) lines.push("thin orange lines: sea-level pressure every 4 hPa (hidden over high ground, where it's an extrapolation)");
  if (hemi.show.jet) lines.push("purple flow lines: the 250 mb wind, 15–82°N (the jet stream; between the 6-hourly steps, traced in the blended wind)");
  if (hemi.show.particles) lines.push(`dark particles: the 250 mb wind where it's faster than 30 kt, darker toward 110 kt; 1 second of animation is about ${Math.round((hemi.particles.flowSeconds * PARTICLE_STYLE.speed) / 3600)} hours of drift. Watch the air race through the troughs and ridges, which themselves move far more slowly`);
  if (lines.length) add(`<span class="legend-note">${lines.join("<br>")}</span>`);
  add(`<span class="legend-note">Faded toward the equator (fills from 10°N). The gold box is the Pacific forecast's area.</span>`);
}
// The two questions (plan, round 2): count the troughs round 50 N (the count shown only after the Ask), and follow
// one trough from near Japan east across the Pacific. Troughs are found in the real step nearer the time on screen.
const hq = { kind: null, revealed: false, path: null, question: null };
// Explore the hemisphere (hemiquestions.js): the menu offers the questions this build's data can answer.
function hemiQuestionOk(q) {
  if (q.tool || !q.needs) return true;
  if (q.needs === "storms") return hemi.src.kind === "forecast" && !!STORMS?.storms?.length;
  return ((hemi.src.kind === "archive" ? NH_ARCH?.fields : manifest.hemisphere?.fields) ?? []).includes(q.needs);
}
function syncHemiQuestions() {
  const sel = $("hemiQSel"), cur = hq.question?.id ?? (hq.kind ?? "");
  sel.innerHTML = `<option value="">Choose a question…</option>` + HEMI_QUESTIONS.filter(hemiQuestionOk).map((q) => `<option value="${q.id}"${q.id === cur ? " selected" : ""}>${q.label}</option>`).join("");
}
function applyHemiQuestion(id) {
  const q = HEMI_QUESTIONS.find((x) => x.id === id);
  if (!q) return;
  if (q.tool) { hq.question = null; startHemiQuestion(q.tool); return; }
  hq.kind = null; hq.question = q; hemi.circle50.visible = false; hemi.setTroughs(null);
  Object.assign(hemi.show, q.show);
  syncHemiPanel();
  for (const b of ["hemiHovBox", "hemiVortexBox", "hemiWaveBox", "hemiIdxBox"]) $(b).open = (q.open ?? []).includes(b);
  const c = hemi.show.polar ? hemi.cameraPresetPolar(camera.aspect, EARTH_AXIS) : hemi.cameraPreset(camera.aspect, EARTH_AXIS);
  flight = { from: { pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov }, to: { pos: new THREE.Vector3(...c.pos), target: new THREE.Vector3(...c.target), fov: c.fov }, t0: performance.now(), ms: REDUCED_MOTION ? 1 : 1200 };
  const box = $("hemiQText");
  box.hidden = false;
  box.innerHTML = `<p><b>${q.label}</b></p><p class="q-look"><b>Look for:</b> ${q.lookFor}</p><p class="live" id="hemiQNote"></p>
    <p class="idx-what"><b>Why:</b> ${q.why}</p>
    <p><b>Ask:</b> ${q.ask[0]} <button class="mini" id="hemiQShow">Show the answer</button></p><p id="hemiQAns" hidden>${q.ask[1]}.</p>`;
  $("hemiQShow").addEventListener("click", () => { $("hemiQAns").hidden = false; $("hemiQShow").hidden = true; });
  applyTime(true); updateLegend();
  for (const b of ["hemiHovBox", "hemiVortexBox", "hemiWaveBox"]) if ($(b).open) $(b).dispatchEvent(new Event("toggle"));
}
// The open question's live note, from the nearer real step.
function hemiQuestionNote() {
  const q = hq.question, el = $("hemiQNote");
  if (!q || !el || !hemi.cur) return;
  const st = hemi.cur.t < 0.5 ? hemi.cur.s0 : hemi.cur.s1;
  const month = hemiMonth(st), lead = hemi.src.kind === "forecast" ? st - hoursFrom(manifest.anchor, manifest.inits?.[hemi.src.model] ?? manifest.anchor) : 0;
  const vortexRows = hemi.src.kind === "forecast" ? hemi.steps.map((s) => vortexStats(hemi.src.ready(s), hemi.H)).filter(Boolean) : null;
  const t = q.note({ f: hemi.src.ready(st), H: hemi.H, chains: hemi.chains, spans: hemi.blocks, storms: hemi.stormNow, lonName, when: hemiWhen(st), month, lead, vortexRows });
  if (t) el.textContent = `${t} (${hemiStepText(st)})`;
  else if (hemi.src.ready(st)) el.textContent = `This build has no data for it at ${hemiWhen(st)}.`;      // loaded, but not this field
}
const lonName = (lon) => { const l = ((Math.round(lon) % 360) + 360) % 360; return l === 180 ? "180°" : l > 180 ? `${360 - l}°W` : `${l}°E`; };
const nhTroughsAt = (step) => {
  const raw = hemi.src.ready(step);
  return raw ? troughsAt(raw.gh500, hemi.H, 50) : null;
};
// CPC's teleconnection indices (fetch_cpc_indices; panel 2026-10-17): observed days, then GEFS's ensemble forecast,
// drawn apart (solid, then a dashed mean in its 10-90 % band) and named apart. What each sign means, in a line.
const IDX_WHAT = {
  ao: ["Arctic Oscillation", "positive: the cold air held near the pole by strong westerlies round it; negative: a weaker, wavier vortex, cold air spilling south, more blocks"],
  pna: ["Pacific–North American", "positive: a deep Aleutian low and a ridge over western North America (often mild and dry for the Northwest); negative: the reverse, troughs into the Northwest"],
  nao: ["North Atlantic Oscillation", "mostly an Atlantic pattern: positive, strong westerlies into Europe; negative, a blocked Atlantic"],
};
let IDX = undefined, STORMS = undefined;
// The official tropical cyclones (storms.json), forecast only: their positions are for now and the next 5 days.
async function hemiStorms() {
  if (STORMS === undefined) STORMS = await fetch(`${DATA}/storms.json${buildVersion(manifest)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const list = hemi.src.kind === "forecast" ? STORMS?.storms ?? [] : [];
  $("hemiStormRow").hidden = !list.length;
  hemi.setStormData(list, (iso) => hoursFrom(manifest.anchor, iso));
  applyTime(true);
}
async function hemiIndices() {
  if (IDX === undefined) IDX = await fetch(`${DATA}/indices.json${buildVersion(manifest)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const box = $("hemiIdxBox");
  if (!IDX || hemi.src.kind === "archive") { box.hidden = true; return; }      // today's indices don't belong beside a past day's map
  box.hidden = false;
  const W = 220, Hh = 34, sx = (i, n) => (i / Math.max(1, n - 1)) * W;
  $("hemiIdx").innerHTML = ["ao", "pna", "nao"].filter((k) => IDX[k]).map((k) => {
    const o = IDX[k].observed.slice(-30), f = IDX[k].forecast?.leads ?? [], n = o.length + f.length;
    const all = [...o.map((x) => x[1]), ...f.flatMap((l) => [l.p10, l.p90])], lim = Math.max(1.5, ...all.map(Math.abs));
    const y = (v) => (Hh / 2 - (v / lim) * (Hh / 2 - 2)).toFixed(1);
    const obsPath = o.map((x, i) => `${i ? "L" : "M"}${sx(i, n).toFixed(1)},${y(x[1])}`).join("");
    const fx = (j) => sx(o.length - 1 + j + (f[0]?.lead === 0 ? 0 : 1), n);
    const band = f.length ? `M${f.map((l, j) => `${fx(j).toFixed(1)},${y(l.p90)}`).join("L")}L${f.map((l, j) => `${fx(j).toFixed(1)},${y(l.p10)}`).reverse().join("L")}Z` : "";
    const mean = f.map((l, j) => `${j ? "L" : "M"}${fx(j).toFixed(1)},${y(l.mean)}`).join("");
    const last = o.at(-1), v = last?.[1] ?? 0, col = v > 0.5 ? "#e8590c" : v < -0.5 ? "#3d8bfd" : "var(--text)";
    const end = f.at(-1);
    return `<div class="idx-row" title="${IDX_WHAT[k][0]}: observed ${o[0]?.[0]} to ${last?.[0]}${f.length ? `; GEFS ensemble forecast from ${IDX[k].forecast.init} to ${end.valid} (mean, and the middle 80 % of ${end.members} members)` : ""}">
      <b>${k.toUpperCase()}</b><span class="v" style="color:${col}">${v > 0 ? "+" : ""}${v.toFixed(1)}</span>
      <svg viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="${W}" y1="${Hh / 2}" y2="${Hh / 2}" stroke="#5a6575" stroke-width="0.6"/>
      ${band ? `<path d="${band}" fill="rgba(160,170,190,0.28)"/>` : ""}<path d="${obsPath}" fill="none" stroke="#e5e7eb" stroke-width="1.4"/>
      ${mean ? `<path d="${mean}" fill="none" stroke="#e5e7eb" stroke-width="1.2" stroke-dasharray="3 2"/>` : ""}</svg></div>
      <p class="idx-what">${IDX_WHAT[k][0]}, ${last?.[0]}${f.length ? `; ensemble forecast to ${end.valid}: ${end.mean > 0 ? "+" : ""}${end.mean.toFixed(1)} (${end.p10.toFixed(1)} to ${end.p90.toFixed(1)})` : ""}. ${IDX_WHAT[k][1][0].toUpperCase()}${IDX_WHAT[k][1].slice(1)}.</p>`;
  }).join("") + `<p class="idx-what">Solid: observed (CPC, from the CDAS reanalysis); dashed in grey: CPC's GEFS ensemble forecast, mean and the middle 80 %. Above +0.5 orange, below −0.5 blue.${IDX.stale ? ` <b>Not updated today</b>: these are from ${IDX.made.slice(0, 10)}.` : ""}</p>`;
}
// The Hovmoller (panel 2026-10-17: "the best tool for teaching Rossby waves"): longitude across (90 E at the left, the
// Pacific in the middle), time down, the 250 mb north-south wind averaged over 40-60 N. Troughs and ridges are the
// stripes, tilting as they move east; a packet is a group of stripes whose leading edge runs east faster than the
// stripes themselves. Rows: the forecast's steps, or in the past year the days within 15 of the one shown.
const HOV_X0 = 90;                       // degrees east at the left edge
function hemiHovRows() {
  const st = hemi.steps;
  const rows = hemi.src.kind === "archive" ? st.filter((s) => Math.abs(s / 24 - arch.i) <= 15) : st;
  return rows.map((s) => ({ step: s, raw: hemi.src.ready(s) })).filter((r) => r.raw);
}
// The polar vortex through the forecast (vortexStats per step): the westerly wind round 60 N at 10 mb and the polar-cap
// height anomaly, with a flag when the wind turns easterly: a sudden stratospheric warming in winter, the final warming
// in spring (from late March the vortex breaks down for the summer and doesn't come back).
// The polar-cap time-height chart: the 60-90 N height anomaly at 10, 50, 100 and 500 mb (rows, top = highest) through
// the forecast (columns), ±300 m. In a sudden warming the red starts at the top and "drips" down over days to weeks.
function capChart(rows) {
  const levels = [["gha10mb", "10"], ["gha50mb", "50"], ["gha100mb", "100"], ["gha500", "500"]];
  const have = levels.filter(([k]) => rows.some((r) => hemi.src.ready(r.step)?.[k]));
  if (have.length < 2) return "";
  // a scale per level (review 2026-10-17: one ±300 m saturates 10 mb and leaves 500 mb pale; winter's 10 mb cap swings
  // by 400-600 m). Not standardised by day of year: a rough guide to where the colour is unusual for that level
  const LIM = { gha10mb: 600, gha50mb: 400, gha100mb: 300, gha500: 150 };
  const W = 220, rh = 12, Hh = have.length * rh, cw = W / rows.length, L = lut(SCALES.nh_dgh.stops, -1, 1);
  const cells = have.map(([k], li) => rows.map((r, ci) => {
    const v = capMean(hemi.src.ready(r.step)?.[k], hemi.H);
    if (v == null) return "";
    const c = Math.round(((Math.max(-1, Math.min(1, v / LIM[k])) + 1) / 2) * 255) * 4;
    return `<rect x="${(ci * cw).toFixed(1)}" y="${li * rh}" width="${(cw + 0.5).toFixed(1)}" height="${rh}" fill="rgb(${L[c]},${L[c + 1]},${L[c + 2]})"><title>${have[li][1]} mb, ${hemiWhen(r.step)}: ${v > 0 ? "+" : ""}${Math.round(v)} m</title></rect>`;
  }).join("")).join("");
  const labels = have.map(([, lv], li) => `<text x="2" y="${li * rh + 9}" font-size="8" fill="#11161d">${lv}</text>`).join("");
  return `<svg viewBox="0 0 ${W} ${Hh}" width="100%" preserveAspectRatio="none" style="margin-top:0.3rem" aria-label="Polar-cap height anomaly by level and time">${cells}${labels}</svg>
    <p class="idx-what">The polar cap (60–90°N) height against 1991–2020 at ${have.map(([, lv]) => lv).join(", ")} mb (rows, the top highest, about 30 km down to 5.5 km), through this forecast (across, about ten days), each row on its own scale (±600, 400, 300 and 150 m): red a warm, high cap (a weak vortex), blue a cold, strong one. After a sudden warming the red starts at the top and can work down over the following weeks, longer than this chart covers, so it shows only the start; about two warmings in three reach the surface.</p>`;
}
function drawVortex() {
  const box = $("hemiVortexBox");
  // shown when the build has the 10 mb wind (GFS's forecast only: ECMWF's open data has no 10 mb, and the fold sat on
  // "Loading" under ECMWF); drawn only open, and only when its key changes
  box.hidden = !(hemi.src.kind === "forecast" && hemi.src === hemi.forecasts.gfs && (manifest.hemisphere?.fields ?? []).includes("u10mb"));
  if (box.hidden || !box.open || hemiPanelKey() === drawVortex.pk) return;
  drawVortex.pk = hemiPanelKey();
  const rows = hemi.steps.map((s) => ({ step: s, v: vortexStats(hemi.src.ready(s), hemi.H) })).filter((r) => r.v);
  if (!rows.length) { $("hemiVortex").innerHTML = `<p class="idx-what">Loading the 10 mb fields…</p>`; return; }
  const W = 220, Hh = 40, lim = Math.max(30, ...rows.map((r) => Math.abs(r.v.u60)));
  const x = (i) => (i / Math.max(1, rows.length - 1)) * W, y = (u) => (Hh / 2 - (u / lim) * (Hh / 2 - 2)).toFixed(1);
  const path = rows.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(r.v.u60)}`).join("");
  const now = rows.reduce((b, r) => (Math.abs(r.step - hemiTime()) < Math.abs(b.step - hemiTime()) ? r : b), rows[0]);
  const ni = rows.indexOf(now), u = now.v.u60, cap = now.v.cap;
  // the season decides what an easterly means (both reviews 2026-10-17): normal all summer, a major warming only in
  // midwinter after westerlies, ambiguous in March-April
  const easterly = rows.filter((r) => r.v.u60 < 0), month = hemiMonth(now.step), season = vortexSeason(month, rows.map((r) => r.v));
  const flag = !easterly.length || season.state === "summer" || season.state === "forming" ? ""
    : season.state === "final-or-late"
    ? `<p class="idx-what"><b>The westerlies reversing in spring</b> by ${hemiWhen(easterly[0].step)}: the final warming that ends the vortex for the summer, or a late sudden warming (they're hard to tell apart).</p>`
    : `<p class="idx-what"><b>A sudden stratospheric warming:</b> the 10 mb wind round 60°N turns easterly by ${hemiWhen(easterly[0].step)} in this run, in midwinter. The vortex is breaking down; over the following weeks about two warmings in three work down to the surface, the AO turning negative and cold air spilling south (not always, and the timing varies).</p>`;
  $("hemiVortex").innerHTML = `<div class="idx-row" title="The zonal-mean 10 mb wind at 60°N, each step of the forecast (${hemiWhen(rows[0].step)} to ${hemiWhen(rows.at(-1).step)})"><b>U60</b>
    <span class="v" style="color:${u < 0 ? "#3d8bfd" : "var(--text)"}">${u > 0 ? "+" : ""}${u.toFixed(0)}</span>
    <svg viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="${W}" y1="${Hh / 2}" y2="${Hh / 2}" stroke="#5a6575" stroke-width="0.6"/>
    <path d="${path}" fill="none" stroke="#e5e7eb" stroke-width="1.4"/><circle cx="${x(ni).toFixed(1)}" cy="${y(u)}" r="3" fill="#ffffff"/></svg></div>
    ${capChart(rows)}
    <p class="idx-what">The westerly wind round the pole 30 km up, averaged round 60°N: ${u.toFixed(0)} m/s at ${hemiWhen(now.step)}. It strengthens through autumn into winter (a strong, cold vortex keeps the Arctic air bottled up) and is easterly every summer (${season.words}).${cap != null ? ` The polar cap (60–90°N) stands ${cap > 0 ? "+" : ""}${cap.toFixed(0)} m against 1991–2020 at 10 mb: ${cap > (month >= 11 || month <= 3 ? 400 : 150) ? "a warm, weakened vortex" : cap < -(month >= 11 || month <= 3 ? 400 : 150) ? "a cold, strong vortex" : "unremarkable for the season"}.` : ""} Choose <i>10 mb height anomaly</i> in the colour menu to see it.</p>${flag}`;
}
// Waves by number (waveAmplitudes): the strength of waves 1-8 round 40-60 N at the nearer real step, as bars; 1-3 the
// planetary waves (grey), 4-8 the travelling ones (blue). Half the peak-to-trough height of each wave, in m.
function drawWaves() {
  const box = $("hemiWaveBox");
  if (!box.open || !hemi.cur) return;
  if (hemiPanelKey() === drawWaves.pk) return;
  drawWaves.pk = hemiPanelKey();
  const st = hemi.cur.t < 0.5 ? hemi.cur.s0 : hemi.cur.s1, raw = hemi.src.ready(st);
  if (!raw) return;
  const a = waveAmplitudes(raw.gh500, hemi.H), mx = Math.max(60, ...a.slice(1)), W = 220, Hh = 70, bw = W / 8;
  const top = [...a.keys()].slice(1).sort((x, y) => a[y] - a[x])[0];
  const bars = [...a].slice(1).map((v, i) => { const h = (v / mx) * (Hh - 16); return `<rect x="${(i * bw + 3).toFixed(1)}" y="${(Hh - 12 - h).toFixed(1)}" width="${(bw - 6).toFixed(1)}" height="${h.toFixed(1)}" fill="${i < 3 ? "#8b95a5" : "#3d8bfd"}"/><text x="${(i * bw + bw / 2).toFixed(1)}" y="${Hh - 1}" text-anchor="middle" font-size="9" fill="#c9d1db">${i + 1}</text>`; }).join("");
  $("hemiWaves").innerHTML = `<svg viewBox="0 0 ${W} ${Hh}" width="100%" aria-label="Wave amplitudes 1 to 8">${bars}</svg>
    <p class="idx-what">How strong each wave round the hemisphere is at ${hemiWhen(st)}: wave 1 is one ridge and one trough round the circle, wave 5 five of each. The bar is half the peak-to-trough height of that wave in the 500 mb surface, averaged over 40–60°N (strongest now: wave ${top}, ${Math.round(a[top])} m). Grey, 1–3: the planetary waves, anchored by continents, oceans and mountains, slow to change. Blue, 4–8: the travelling waves that bring the storms. Winter waves are about twice summer's.</p>`;
}
// The Hawaii line: the subtropical high and the 30-20 N pressure difference along 157 W, in words. Checked on the
// archive: the June 2026 strong trades +9 to +10 hPa, August 2026 +10.8; Kona-low days negative (-2.9 to -7.6).
function drawHawaii() {
  if (hemiPanelKey() === drawHawaii.pk) return;
  drawHawaii.pk = hemiPanelKey();
  const el = $("hemiHawaii"), st = hemi.cur && (hemi.cur.t < 0.5 ? hemi.cur.s0 : hemi.cur.s1), raw = st != null && hemi.src.ready(st);
  const t = raw && tradesAtHawaii(raw.mslp, hemi.H);
  el.hidden = !t;
  if (!t) return;
  const d = t.diff, cut = cutoffLow(raw.gh500, hemi.H);
  el.innerHTML = `<b>Hawaiʻi</b>, ${hemiWhen(st)}: the subtropical high ${Math.round(t.high.p)} hPa at ${t.high.lat}°N ${lonName(t.high.lon)}; pressure 30°N minus 20°N along 157°W ${signed(d)} hPa, east minus west along 21°N ${signed(t.ew)} hPa: ${tradesWords(t)}.${cut ? ` <b>A cut-off low aloft</b> at ${cut.lat}°N ${lonName(cut.lon)}: ${cutoffWords(hemiMonth(st))}.` : ""} A rough guide from the pattern, not a forecast.`;
  drawNorthwest(raw, st);
}
// The Northwest line (forecaster review 2026-10-17: Lesson D asks for a Seattle outlook with no Seattle number): the
// 500 mb anomaly off the coast, the flow over 130-150 W (west-east or north-south), and the nearest trough upstream.
function signed(x) { const r = Math.round(x) || 0; return `${r > 0 ? "+" : ""}${r}`; }   // no "-0"
function drawNorthwest(raw, st) {
  const el = $("hemiNorthwest");
  if (!raw?.gha500 || !raw.u250) { el.hidden = true; return; }
  const { lat0, dlat, nlon } = hemi.H.grid, k = (la, lo) => Math.round((la - lat0) / dlat) * nlon + lo;
  const a = raw.gha500[k(47, 235)];
  let su = 0, sv = 0;
  for (let la = 40; la <= 55; la += 1) for (let lo = 210; lo <= 230; lo += 1) { su += Math.abs(raw.u250[k(la, lo)]); sv += Math.abs(raw.v250[k(la, lo)]); }
  const flow = sv > 0.8 * su ? "wavy: the flow off the coast runs north–south (a ridge or a trough nearby)" : "west–east: storms coming straight off the ocean";
  const t = troughsAt(raw.gh500, hemi.H, 50).filter((x) => x.lon >= 150 && x.lon < 235).sort((p, q) => q.lon - p.lon)[0];
  el.hidden = false;
  el.innerHTML = `<b>The Northwest</b>, ${hemiWhen(st)}: 500 mb ${a > 0 ? "+" : ""}${Math.round(a)} m against normal off the coast (${a > 60 ? "a ridge: drier, settled" : a < -60 ? "a trough: cooler, showery" : "near normal"}); the jet over 130–150°W ${flow}${t ? `; the nearest trough upstream about ${lonName(t.lon)}, ${235 - t.lon}° west of the coast` : ""}. A rough guide from the pattern, not a forecast.`;
}
// what a card panel shows: the source, the nearer real step, how many steps are loaded (the panels redraw only when it
// changes, not every frame of Play; review 2026-10-17)
function hemiPanelKey(extra = "") {
  const st = hemi.cur ? (hemi.cur.t < 0.5 ? hemi.cur.s0 : hemi.cur.s1) : null;
  return `${hemi.src.id}:${st}:${hemi.steps.filter((s) => hemi.src.isReady(s)).length}:${extra}`;
}
function drawHov() {
  const box = $("hemiHovBox");
  if (!box.open || !hemi.on) return;
  const pk = hemiPanelKey(`${hemiTime().toFixed(2)}`);
  if (pk === drawHov.pk) return;
  drawHov.pk = pk;
  const cv = $("hemiHov"), ctx = cv.getContext("2d"), W = cv.width, Hh = cv.height, pad = 22;
  const want = hemi.src.kind === "archive" ? hemi.steps.filter((s) => Math.abs(s / 24 - arch.i) <= 15) : hemi.steps;
  const rows = hemiHovRows();
  if (rows.length < want.length) hemi.request(hemiTime(), hemi.src.kind === "archive" || LITE ? 15 : Infinity, hemi.src.kind === "archive" || LITE ? 15 : Infinity);
  ctx.fillStyle = "#11161d"; ctx.fillRect(0, 0, W, Hh);
  if (!rows.length) return;
  const s = SCALES.nh_v, L = lut(s.stops, -60, 60), nlon = hemi.H.grid.nlon, h = (Hh - pad) / rows.length;
  // the image only changes with the rows (cached); the "now" line and labels are drawn over it each time
  const key = `${hemi.src.id}:${rows.map((r) => r.step).join(",")}`;
  if (drawHov.key !== key) {
  const img = ctx.createImageData(W, Math.ceil(Hh - pad));
  rows.forEach((r, ri) => {
    const m = bandMean(r.raw.v250, hemi.H);
    const y0 = Math.floor(ri * h), y1 = Math.floor((ri + 1) * h);
    for (let x = 0; x < W; x++) {
      const lon = (HOV_X0 + (x / W) * 360) % 360, i = Math.round(lon / hemi.H.grid.dlon) % nlon;
      const kt = Math.max(-60, Math.min(60, m[i] * 1.943844)), c = Math.round(((kt + 60) / 120) * 255) * 4;
      for (let y = y0; y < y1; y++) { const o = (y * W + x) * 4; img.data[o] = L[c]; img.data[o + 1] = L[c + 1]; img.data[o + 2] = L[c + 2]; img.data[o + 3] = 255; }
    }
  });
  drawHov.key = key; drawHov.img = img;
  }
  ctx.putImageData(drawHov.img, 0, 0);
  const xOf = (lon) => ((((lon - HOV_X0) % 360) + 360) % 360) / 360 * W;
  ctx.strokeStyle = "#f2b134"; ctx.lineWidth = 2;
  for (const lon of [manifest.grid.lon0, manifest.grid.lon0 + (manifest.grid.nlon - 1) * manifest.grid.dlon]) { ctx.beginPath(); ctx.moveTo(xOf(lon), 0); ctx.lineTo(xOf(lon), Hh - pad); ctx.stroke(); }
  const now = hemiTime(), ri = rows.findIndex((r) => r.step >= now - 1e-6);
  if (ri >= 0) { ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; const y = (ri + 0.5) * h; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.fillStyle = "#c9d1db"; ctx.font = "20px system-ui, sans-serif"; ctx.textAlign = "center";
  for (const lon of [90, 180, 270, 0]) ctx.fillText(lon === 180 ? "180°" : lon === 0 ? "0°" : lon > 180 ? `${360 - lon}°W` : `${lon}°E`, Math.min(W - 30, Math.max(30, xOf(lon))), Hh - 3);
  // the days down the left: a label wherever the date changes (forecast: each 00 UTC; archive: every 5th day)
  ctx.textAlign = "left"; ctx.font = "17px system-ui, sans-serif";
  let lastDay = null;
  rows.forEach((r, ri) => {
    const t = new Date(hemi.src.kind === "archive" ? `${hemi.src.days[Math.round(r.step / 24)]?.date}T00:00:00Z` : Date.parse(manifest.anchor) + r.step * 3600e3);
    const day = t.toISOString().slice(0, 10), y = (ri + 0.5) * h + 6;
    if (day === lastDay || (hemi.src.kind === "archive" && ri % 5)) return;
    lastDay = day;
    const txt = t.toUTCString().slice(0, 11).replace(",", "");
    ctx.fillStyle = "rgba(17,22,29,0.75)"; ctx.fillRect(2, y - 15, ctx.measureText(txt).width + 8, 19);
    ctx.fillStyle = "#e5e7eb"; ctx.fillText(txt, 6, y);
  });
  cv.dataset.rows = JSON.stringify(rows.map((r) => r.step));
  $("hemiHovNote").textContent = `Down: time, from ${hemiWhen(rows[0].step)} to ${hemiWhen(rows.at(-1).step)} (${rows.length} ${hemi.src.kind === "archive" ? "days" : "steps"}; the white line is now on the map). Across: longitude, the gold lines the Pacific forecast's edges. Red: wind blowing north, blue: south (±60 kt). Stripes tilting right are troughs and ridges moving east; a patch of strong stripes whose edge spreads east faster than they move is a wave packet. Tap a row to go there.`;
}
function hemiTroughs() {
  if (!hemi.cur || !hq.kind) { hemi.setTroughs(null); return; }
  const step = hemi.cur.t < 0.5 ? hemi.cur.s0 : hemi.cur.s1, list = nhTroughsAt(step) ?? [];
  if (hq.kind === "count") {
    hemi.setTroughs(hq.revealed ? list : null);
    if (hq.revealed) $("hemiQAns").innerHTML = countAnswer(list, step);
  } else if (hq.path) {
    const at = hq.path.find((p) => p.step === step);
    hemi.setTroughs(at ? [{ lon: at.lon, color: "#ff8c1a" }] : null);
    $("hemiQWhere").textContent = at ? `The orange mark: the trough at ${lonName(at.lon)}, ${hemiStepText(step)}.`
      : step < hq.path[0].step ? "Before the trough was picked out: step forward." : "The page lost the trough here (it faded, merged or stalled): step back to find it.";
  }
}
function countAnswer(list, step) {
  const n = list.length;
  return `<b>${n} trough${n === 1 ? "" : "s"}</b> at 50°N (${hemiStepText(step)}), marked in blue: ${list.map((t) => lonName(t.lon)).join(", ")}.
    ${n >= 4 && n <= 6 ? "Four to six is the usual number of long waves at this latitude." : n < 4 ? "Fewer than usual: big, slow waves, a pattern that tends to stick." : "More than usual: shorter waves, a fast-changing pattern."}
    The page counts a dip only if it's at least 30 m deep and 25° from the next, so a small ripple doesn't count; you may have seen one more or one fewer, and that's a judgement, not a mistake.
    Press Play: the long waves drift east a few degrees a day, while smaller troughs run through them faster.`;
}
function startHemiQuestion(kind) {
  hq.kind = kind; hq.revealed = false; hq.path = null; hq.question = null;
  if ($("hemiQSel").value !== kind) $("hemiQSel").value = kind;
  Object.assign(hemi.show, { fill: hemi.H.anomalies ? "gha500" : "jet", z500: true, jet: false, particles: true, mslp: false });
  syncHemiPanel();
  hemi.circle50.visible = true;
  setPlaying(false);
  const box = $("hemiQText");
  box.hidden = false;
  if (kind === "count") {
    // straight down on the pole, so the whole 50 N circle is in view
    const c = hemi.show.polar ? hemi.cameraPresetPolar(camera.aspect, EARTH_AXIS) : hemi.cameraPreset(camera.aspect, EARTH_AXIS, 0.02);
    flight = { from: { pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov }, to: { pos: new THREE.Vector3(...c.pos), target: new THREE.Vector3(...c.target), fov: c.fov }, t0: performance.now(), ms: REDUCED_MOTION ? 1 : 1200 };
    box.innerHTML = `<p><b>The jet goes all the way round: count the waves.</b> The white circle is 50°N. Follow it round and count the
      <b>troughs</b>: where the dark 500 mb lines dip toward the equator, usually blue in the colour, with the purple jet lines bending south through them.
      Between them are the ridges, bulging toward the pole.</p>
      <p><b>Ask:</b> How many troughs cross 50°N right now? <button class="mini" id="hemiQShow">Show the answer</button></p><p id="hemiQAns"></p>`;
    $("hemiQShow").addEventListener("click", () => { hq.revealed = true; $("hemiQShow").hidden = true; hemiTroughs(); dirty = true; });
  } else {
    const step = hemi.cur ? (hemi.cur.t < 0.5 ? hemi.cur.s0 : hemi.cur.s1) : hemi.nearestStep(hemiTime());
    const list = nhTroughsAt(step) ?? [];
    // the trough upstream of the Pacific: nearest Japan (140 E) between 90 E and 175 E, else the nearest to it anywhere west of the box
    const near = list.filter((t) => t.lon >= 90 && t.lon <= 175).sort((a, b) => Math.abs(a.lon - 140) - Math.abs(b.lon - 140))[0];
    // a tap on the 50 N circle chooses another trough (or the first, when none is near Japan: backlog "tap a trough")
    const pick = hq.tapLon != null ? list.reduce((b, t) => (Math.abs(((t.lon - hq.tapLon + 540) % 360) - 180) < Math.abs(((b.lon - hq.tapLon + 540) % 360) - 180) ? t : b), list[0]) : near;
    hq.tapLon = null;
    hq.awaitTap = true;
    if (!pick) { box.innerHTML = `<p>No trough near Japan at 50°N at this time. <b>Tap a trough</b> on the white 50°N circle (where the lines dip toward the equator) to follow that one.</p>`; return; }
    hemi.request(hemiTime(), LITE ? 20 : Infinity);
    const steps = hemi.steps.filter((s) => s >= step);
    const series = () => steps.map((s) => ({ step: s, troughs: nhTroughsAt(s) })).filter((x, i, a) => x.troughs && a.slice(0, i).every((y) => y.troughs));
    hq.path = followTrough(series(), pick.lon);
    box.innerHTML = `<p><b>Follow a trough from Asia toward the Northwest.</b> The orange mark is a 500 mb trough near Japan. Press <b>Play</b>
      (or step ▶) and follow it east across the Pacific; the mark moves with it as long as the page can still pick it out. <i>Tap another trough on the
      50°N circle to follow that one instead.</i></p>
      <p id="hemiQWhere"></p>
      <p><b>Ask:</b> When does it reach the Northwest coast, about 125°W? <button class="mini" id="hemiQShow">Show the answer</button></p><p id="hemiQAns"></p>`;
    $("hemiQShow").addEventListener("click", () => {
      hq.path = followTrough(series(), pick.lon);              // again, with every step loaded since
      const all = series().length === steps.length, hit = hq.path.find((p) => p.lon >= 232 && p.lon <= 260);
      const d = hit ? (hit.step - hq.path[0].step) / 24 : null;
      $("hemiQAns").innerHTML = hit
        ? `In this run it reaches about ${lonName(hit.lon)} <b>${d.toFixed(1)} days</b> later, ${hemiStepText(hit.step)}. Four to six days is typical if the pattern holds; beyond day 5 treat the timing as a possibility, not a promise.`
        : !all ? "Still loading the later steps: try again in a moment."
        : `In this run the page loses it before 125°W (at ${lonName(hq.path.at(-1).lon)}, ${hemiStepText(hq.path.at(-1).step)}): it fades, merges with another trough, or the forecast ends first. That happens: not every trough makes it across, and a block can stop them for days.`;
      hemiTroughs(); dirty = true;
    });
  }
  hemiTroughs();
  dirty = true;
}
if (hemi) {
  $("hemiBtn").addEventListener("click", () => (hemi.on ? exitHemisphere() : enterHemisphere()));
  $("hemiBack").addEventListener("click", () => exitHemisphere());
  $("hemiFill").addEventListener("change", (e) => { if (!NH_FILLS[e.target.value]) return; hemi.show.fill = e.target.value; applyTime(true); updateLegend(); });
  for (const [id, k] of [["hemiZ500", "z500"], ["hemiMslp", "mslp"], ["hemiJet", "jet"], ["hemiParticles", "particles"], ["hemiRelief", "relief"], ["hemiBlock", "block"], ["hemiStorms", "storms"]]) $(id).addEventListener("change", (e) => {
    hemi.show[k] = e.target.checked;
    if (k === "block" && hemi.show.block && hemi.src.kind === "archive") hemi.request(hemiTime(), 7, 7);     // a week either side: does it last?
    if (k === "relief") hemi.rebuildGuides();                         // the guides and marks sit just above the sheet
    applyTime(true); updateLegend();
  });
  // the Share tab is put away here, so the card has its own link (it also goes in the address bar)
  $("hemiShare").addEventListener("click", async () => {
    const url = `${location.origin}${location.pathname}#${encodeState(captureState())}`;
    try { history.replaceState(null, "", url); } catch { /* ignore */ }
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch { /* no clipboard permission: the address bar has it */ }
    $("hemiShareNote").textContent = ok ? "Link copied." : "The link is in the address bar.";
  });
  // Where the air over Seattle or Honolulu came from (panel 2026-10-17: "the most direct 'this drives our weather'
  // moment"): traced back from the time on screen through the 250 mb wind, up to 5 days, as far as the steps reach.
  const traceTo = (name, lat, lon) => {
    if (hemi.src.kind === "archive") {        // one analysis a day is too coarse in time to follow the air
      const note = $("hemiTraceNote"); note.hidden = false;
      note.textContent = "Tracing the air needs the wind every few hours; the past year keeps one analysis a day, so it's offered in the forecast only.";
      return;
    }
    hemi.request(timeline.pos, 0, LITE ? 20 : Infinity);           // the steps before (a phone only as many as it keeps)
    const path = traceBackSphere((h, la, lo) => hemi.windAt(h, la, lo), timeline.pos, lat, lon, 120, 1);
    hemi.setTrace(path);
    hemiTrace = { name, lat, lon, at: timeline.pos };
    const back = path.at(-1), hours = Math.round(path[0][0] - back[0]), note = $("hemiTraceNote");
    note.hidden = false;
    const latTxt = (la) => `${Math.round(la)}°N`;
    note.innerHTML = hours < 6 ? `Not enough earlier steps loaded yet to trace ${name}'s air: try again in a moment, or move later in the forecast.`
      : `The air about 10 km up over <b>${name}</b> at ${fmtLocal(Date.parse(manifest.anchor) + timeline.pos * 3600e3) || fmtUtc(Date.parse(manifest.anchor) + timeline.pos * 3600e3)} came from about <b>${latTxt(back[1])} ${lonName(back[2])}</b> ${(hours / 24).toFixed(1)} days earlier (orange: a dot each day back). Traced through the 250 mb wind of the model's steps, blended between them: approximate, and real air also rises and sinks.${hours < 96 ? ` The data start ${hours} h before this time: move later in the forecast to trace further back.` : ""}`;
    dirty = true;
  };
  $("hemiTraceSea").addEventListener("click", () => traceTo("Seattle", 47.6, 237.7));
  $("hemiTraceHnl").addEventListener("click", () => traceTo("Honolulu", 21.3, 202.1));
  $("hemiGlobe").addEventListener("click", () => hemiProjection(false));
  $("hemiPolar").addEventListener("click", () => hemiProjection(true));
  $("hemiExt").addEventListener("change", (e) => {
    for (const s of Object.values(hemi.forecasts)) s.extended = e.target.checked;
    hemiTimeline(); requestAround(); applyTime(true);
  });
  $("hemiHovBox").addEventListener("toggle", () => { drawHov.pk = null; drawHov(); });
  $("hemiVortexBox").addEventListener("toggle", () => { drawVortex.pk = null; drawVortex(); });
  $("hemiWaveBox").addEventListener("toggle", () => { drawWaves.pk = null; drawWaves(); });
  $("hemiHov").addEventListener("click", (e) => {
    const cv = $("hemiHov"), r = cv.getBoundingClientRect(), rows = JSON.parse(cv.dataset.rows || "[]");
    const ri = Math.floor(((e.clientY - r.top) / r.height) * cv.height / ((cv.height - 22) / rows.length));
    const st = rows[Math.max(0, Math.min(rows.length - 1, ri))];
    if (st == null) return;
    if (hemi.src.kind === "archive") { arch.i = Math.round(st / 24); archShow(); } else { openNote = null; setPlaying(false); timeline.pos = timeline.clamp(st); requestAround(); applyTime(); }
  });
  $("hemiQSel").addEventListener("change", (e) => applyHemiQuestion(e.target.value));
  $("hemiEntry").hidden = false;
  $("hemiEntry").addEventListener("click", () => enterHemisphere().then(() => { if (hemi.on) startHemiQuestion("count"); }));
  $("hemiWelcomeOk").addEventListener("click", () => { $("hemiWelcome").hidden = true; try { localStorage.setItem("np3d.hemiWelcome", "1"); } catch { /* ignore */ } });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && hemi.on && !e.target.closest?.("input, select, textarea")) exitHemisphere(); });
}

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
  if (hemi?.on) { hemiReadout(); return; }
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
    const S = satNow(), wv = S === satWV && !!satWV;
    const kelvin = S.valueAt(satShown.i, (mx - b.x_west) / (b.x_east - b.x_west), (my - b.y_south) / (b.y_north - b.y_south));
    const at = satShown.frame.time.slice(11, 16);
    rows.push(kelvin == null ? `Satellite ${wv ? "water vapour" : "IR"} ${at} UTC: no data`
      : wv ? `Satellite water vapour ${at} UTC: ${(kelvin - 273.15).toFixed(0)}°C <span class="muted">(${kelvin < 230 ? "moist air or cloud aloft" : kelvin < 248 ? "some moisture aloft" : "dry air aloft"})</span>`
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
  if (hover.touch) {
    // a long press: above the finger, centred, kept on screen (iPhone review round 2: it used to open under the thumb)
    tip.style.left = `${Math.max(8, Math.min(hover.px - tip.offsetWidth / 2, W - tip.offsetWidth - 8))}px`;
    tip.style.top = `${Math.max(8, hover.py - tip.offsetHeight - 36)}px`;
  } else {
    tip.style.left = `${Math.min(hover.px + 14, W - tip.offsetWidth - 8)}px`;
    tip.style.top = `${Math.min(hover.py + 14, H - tip.offsetHeight - 8)}px`;
  }
  const vex = Math.pow(10, Number($("vexSlider").value));
  const pos = pin.geometry.attributes.position;
  const p0 = geo.point(lat, lon, 0), p1 = geo.point(lat, lon, Math.max(top * 0.001 * vex, 40) + 30);
  pos.setXYZ(0, p0.x, p0.y, p0.z);
  pos.setXYZ(1, p1.x, p1.y, p1.z);
  pos.needsUpdate = true;
  pin.visible = true;
}

// The readout under the pointer; on a touch screen there's no hover, so a long press (half a second, still) shows it,
// lifted above the finger so the finger doesn't hide it, until the next touch (iPhone review).
function hoverAt(clientX, clientY, lift = 0) {
  const r = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = geo.pick(raycaster.ray);
  hover = hit ? { lat: hit.latlon[0], lon: hit.latlon[1], px: clientX - r.left, py: clientY - r.top, touch: lift > 0 } : null;
  updateReadout();
  dirty = true;
}
let press = null, touches = 0;
renderer.domElement.addEventListener("pointermove", (e) => {
  if (e.pointerType === "touch") {
    if (press?.fired) { hoverAt(e.clientX, e.clientY, 60); return; }          // after a long press, slide to read along the way
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) { clearTimeout(press.timer); press = null; }
    return;
  }
  hoverAt(e.clientX, e.clientY);
});
renderer.domElement.addEventListener("pointerleave", (e) => { if (e.pointerType === "touch") return; hover = null; updateReadout(); dirty = true; });
renderer.domElement.addEventListener("pointerdown", (e) => {
  if (e.pointerType !== "touch") return;
  touches++;
  if (hover) { hover = null; updateReadout(); dirty = true; }
  clearTimeout(press?.timer);
  press = touches > 1 ? null : { x: e.clientX, y: e.clientY, fired: false };
  if (press) press.timer = setTimeout(() => { if (press) { press.fired = true; controls.enabled = false; hoverAt(press.x, press.y, 60); } }, 500);
});
for (const ev of ["pointerup", "pointercancel"]) renderer.domElement.addEventListener(ev, (e) => { if (e.pointerType === "touch") { touches = Math.max(0, touches - 1); if (press && !press.fired) clearTimeout(press.timer); controls.enabled = true; } });

// ---- the Drop tab: marbles, balloons, where from?, smoke, rings (tracers.js, tracerview.js) -------
// A marble rolls downhill on the focus level's surface (heights, or sea-level pressure at the surface);
// a balloon drifts with its wind (user ideas 2026-10-09). "Where from?" traces the air arriving at a
// point backward in time; smoke is a source letting go of a puff every model hour; a ring is 24
// balloons in a circle (user picks, 2026-10-09). Balloons, puffs, rings and paths stay on the focus
// level or, with "stay on level" off, move in 3-D. Pick a tool in the Drop tab, then click the map.
const tracerView = new TracerView(geo);
scene.add(tracerView.object);
const TRACER_MAX = 8, PUFF_MAX = 240, RING_N = 24;
const TOOLS = { marble: "dropMarble", balloon: "dropBalloon", parcel: "dropParcelBtn", back: "dropBack", smoke: "dropSmoke", ring: "dropRing", lift: "dropLift", forces: "dropForces", swell: "dropSwell" };
const TOOL_NAME = { marble: "marble", balloon: "constant-level balloon", parcel: "air parcel", back: "point to trace the air back from", smoke: "smoke source", ring: "ring of balloons", lift: "column to lift a parcel of surface air in", forces: "point to show the forces on the air at", sonde: "place to launch a weather balloon from", swell: "spot at sea to trace its swell back from" };
function setTracerMode(m) {
  tracer.mode = tracer.mode === m ? null : m;
  for (const [k, id] of Object.entries(TOOLS)) $(id).classList.toggle("on", tracer.mode === k);
  if (tracer.mode) showDropInfo(tracer.mode);
  renderer.domElement.style.cursor = tracer.mode ? "crosshair" : "";
  updateHud();
}
function showDropInfo(kind) { for (const el of document.querySelectorAll("#dropCard [data-tool]")) el.hidden = el.dataset.tool !== kind; }
// Where a 3-D thing starts: the focus level's real height there (the ground at the surface); undefined on a
// level. always: in 3-D whatever "stay on the focus level" says (the air parcel).
function startZ(lat, lonE, always = false) {
  if (tracer.onLevel && !always) return undefined;
  const f = tracerField(), h = f && f.L.def.key !== "sfc" && f.d.h ? gridSample(f.d.h, manifest.grid, lat, lonE) : NaN;
  return Number.isFinite(h) ? h : 10;
}
function dropTracer(kind, lat, lon) {
  const g = manifest.grid, lonE = lon < g.lon0 ? lon + 360 : lon;
  const latA = g.lat0, latB = g.lat0 + g.dlat * (g.nlat - 1);
  if (lat < Math.min(latA, latB) || lat > Math.max(latA, latB) || lonE > g.lon0 + g.dlon * (g.nlon - 1)) { setTracerMode(null); return; }   // off the data
  const z = startZ(lat, lonE);
  const air = (la, lo) => ({ lat: la, lon: lo, hours: 0, trail: [], ...(z != null ? { z } : {}) });
  let it;
  if (kind === "marble") it = { kind, lat, lon: lonE, vx: 0, vy: 0 };
  // The balloon is a constant-level balloon (like the ones scientists fly for weeks at one pressure level):
  // always on the focus level. The air parcel is the air itself, always in 3-D (renamed 2026-10-09: a real
  // party balloon rises, so "balloon" for the 3-D one misled). Both are "balloon" items inside; z marks the parcel.
  else if (kind === "balloon") it = { kind, lat, lon: lonE, hours: 0, trail: [] };
  else if (kind === "parcel") it = { kind: "balloon", lat, lon: lonE, hours: 0, trail: [], z: startZ(lat, lonE, true) };
  else if (kind === "smoke") it = { kind, lat, lon: lonE, z, hours: 0, emitH: 1, puffs: [] };
  // Lift, or with "fly it as a weather balloon" the balloon (folded into lift 2026-10-09: the probe, lift and a
  // separate balloon tool all showed the same sounding; the balloon adds its drift and the winds).
  else if (kind === "lift" && tracer.liftFly) { it = { kind: "sonde", lat, lon: lonE, t0: timeline.pos, model, path: null }; launchSonde(it); }
  else if (kind === "lift" || kind === "forces") it = { kind, lat, lon: lonE };
  else if (kind === "sonde") { it = { kind, lat, lon: lonE, t0: timeline.pos, model, path: null }; launchSonde(it); }
  else if (kind === "swell") { it = { kind, lat, lon: lonE, t0: timeline.pos, wantH: tracer.backH, model, path: null }; traceSwellFrom(it); }
  else if (kind === "ring") {
    const members = ringPoints(lat, lonE, tracer.ringKm, RING_N).map((q) => ({ ...air(q.lat, q.lon), orig: true }));
    it = { kind, lat, lon: lonE, z, hours: 0, members, area0: ringAreaKm2(members), rKm: tracer.ringKm };
  } else if (kind === "back") {
    it = { kind, lat, lon: lonE, z: tracer.backThree ? undefined : z, three: tracer.backThree, t0: timeline.pos, wantH: tracer.backH, model, focus: show.focus, path: null };
    traceBackFrom(it);
  }
  tracer.items.push(it);
  if (tracer.items.length > TRACER_MAX) tracer.items.shift();
  setTracerMode(null);
  dirty = true;
}
// "Where did this air come from?": load the real steps the path needs, then trace it backward
// (traceBack) through the wind of each earlier hour, from the time on screen as far back as asked or
// the data goes (24 h before "now"; from a forecast time the earlier forecast hours count too).
// Arrival heights for "three heights": above the ground, HYSPLIT's usual trio (near the surface, about
// 850 mb, about 500 mb), each path in its own colour.
const BACK_HEIGHTS = [[500, "500 m", [0.3, 0.8, 1]], [1500, "1.5 km", [0.45, 0.95, 0.45]], [5500, "5.5 km", [0.85, 0.55, 1]]];
async function traceBackFrom(it) {
  const m = it.model, ld = leads, t0 = Math.min(Math.max(it.t0, ld[0]), ld[ld.length - 1]);
  const hours = Math.max(0, Math.min(it.wantH, t0 - ld[0]));
  it.t0 = t0; it.hours = hours;
  const s0 = timeline.segment(t0 - hours), s1 = timeline.segment(t0), idx = [];
  for (let i = s0.i0; i <= s1.i1; i++) idx.push(i);
  const L = layers[it.focus], threeD = it.three || it.z != null;
  const bundles = threeD ? ["sfc", ...manifest.levels.map((p) => `p${p}`)] : [L.def.bundle, "sfc"];
  try { await Promise.all(idx.flatMap((i) => bundles.map((b) => loader.load(m, ld[i], b)))); } catch { it.failed = true; dirty = true; return; }
  const g = manifest.grid, caches = { wind: new Map(), temp: new Map(), rh: new Map() };
  const raw = (i) => ({ sfc: loader.ready(m, ld[i], "sfc"), levels: Object.fromEntries(manifest.levels.map((p) => [p, loader.ready(m, ld[i], `p${p}`)])) });
  // the air at every height at time t (wind, or the temperature or humidity to sample along the path)
  const air = (t, what) => {
    const { i0, i1, t: w } = timeline.segment(t), k = `${i0}:${i1}`, c = caches[what];
    if (!c.has(k)) c.set(k, buildWindField(raw(i0), raw(i1), what === "wind" ? null : what));
    const F = c.get(k);
    F.t = w;
    return F;
  };
  const blend = (t, get) => {                         // a field on one level, blended between the steps around t
    const { i0, i1, t: w } = timeline.segment(t), a = get(ld[i0]), b = get(ld[i1]);
    return (lat, lon) => { if (!a || !b) return NaN; const x = gridSample(a, g, lat, lon); return x + (gridSample(b, g, lat, lon) - x) * w; };
  };
  const sample3 = (t, lat, lon, z) => tracerSample3d(air(t, "wind"), lat, lon, z);
  const sampleLevel = (t, lat, lon) => {
    const { i0, i1, t: w } = timeline.segment(t), a = derivedFor(L, ld[i0], m), b = derivedFor(L, ld[i1], m);
    if (!a || !b) return null;
    const ua = gridSample(a.u, g, lat, lon), va = gridSample(a.v, g, lat, lon);
    const u = ua + (gridSample(b.u, g, lat, lon) - ua) * w, v = va + (gridSample(b.v, g, lat, lon) - va) * w;
    return Number.isFinite(u + v) ? { u, v, w: 0, zMin: 0, zMax: 0 } : null;
  };
  // what the air was like along the way: its height, temperature and humidity (journeychart.js)
  const p = it.focus.startsWith("p") ? Number(it.focus.slice(1)) : null;
  const along = (t, lat, lon, z) => {
    if (z != null) return { z, T: tracerSample3d(air(t, "temp"), lat, lon, z)?.q, RH: tracerSample3d(air(t, "rh"), lat, lon, z)?.q };
    if (p == null) return { z: null, T: blend(t, (l) => loader.ready(m, l, "sfc")?.t2m)(lat, lon) - 273.15, RH: null };
    const f = (k) => blend(t, (l) => loader.ready(m, l, `p${p}`)?.[k])(lat, lon);
    return { z: f("gh"), T: f("t") - 273.15, RH: f("r") };
  };
  if (it.three) {
    const s = sample3(t0, it.lat, it.lon, 0);
    if (!s) { it.failed = true; dirty = true; return; }
    it.tracks = BACK_HEIGHTS.map(([agl, label, rgb]) => ({ z: s.ground + agl, label, rgb }));
  } else it.tracks = [{ z: it.z, label: "", rgb: [0.3, 0.8, 1] }];
  for (const tr of it.tracks) {
    const r = traceBack({ lat: it.lat, lon: it.lon, z: tr.z }, tr.z != null ? sample3 : sampleLevel, t0, hours, 1);
    tr.path = r.path; tr.left = r.left;
    tr.journey = r.path.map(([la, lo, z, ago]) => ({ ago, ...along(t0 - ago, la, lo, z) }));
  }
  it.path = it.tracks[0].path;                        // traced (the labels and the HUD wait for this)
  updateHud(); drawDropJourney(); dirty = true;
}
// The journey chart in the Drop tab: the latest traced "where from?", one line per path.
function drawDropJourney() {
  const it = [...tracer.items].reverse().find((t) => t.kind === "back" && t.path), box = $("dropJourney");
  box.hidden = !it;
  if (!it) return;
  const cv = box.querySelector("canvas"), dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth || 280, H = 240;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawJourney(ctx, W, H, it.tracks.map((t) => ({ rgb: t.rgb, label: t.label, pts: t.journey })));
  const css = (rgb) => `rgb(${rgb.map((c) => Math.round(c * 255)).join(",")})`;
  $("dropJourneyKey").innerHTML = it.tracks.map((t) => `<span style="color:${css(t.rgb)}">━ ${t.label || (t.z != null ? "3-D path" : `on the ${it.focus === "sfc" ? "10 m" : layers[it.focus].def.title} level`)}</span>`).join(" ");
}
// The focus level at the nearer real step: its surface (what the marble rolls on), wind, drawn heights.
function tracerField() {
  const L = layers[show.focus];
  if (!L?.visible) return null;
  const d = derivedFor(L, nearerLead());
  if (!d) return null;
  if (!d._waves) d._waves = waves(d.c, manifest.grid);                 // what the marble rolls on (tracers.js)
  return { L, d, hd: hOf(L, d), surface: tracer.waves ? d._waves : d.c };
}
function tracerZ(f, lat, lon) {
  const vex = Math.pow(10, Number($("vexSlider").value)), lift = f.L.def.options.lift ?? 0;
  const h = f.hd ? gridSample(f.hd, manifest.grid, lat, lon) : 0;
  return (Number.isFinite(h) ? h : 0) * 0.001 * vex + lift + 30;
}
// Where a thing is drawn: a 3-D one (z, m) at its true height, one on a level on the drawn level.
function tracerDrawZ(f) {
  const vex = Math.pow(10, Number($("vexSlider").value));
  return (lat, lon, z) => (z != null ? z * 0.001 * vex + 30 : tracerZ(f, lat, lon));
}
const PUFF = { maxTrail: 1, trailEveryH: 1e9 };          // puffs and ring balloons keep no trail
function tracerTick(dt) {
  const on = !arch.on && !sim.on && tracer.items.length > 0;
  tracerView.object.visible = on;
  if (!on) return;
  const f = tracerField();
  if (!f) return;
  const step = Math.min(dt, 0.05), unit = f.L.def.interval || 60, g = manifest.grid;
  // Everything that flies keeps the atmosphere's clock while it plays: it moves exactly the model hours
  // the timeline moved this frame, in the wind AT that time (blended between the two real steps around
  // it, like everything else), so its track is a real trajectory. Paused, it drifts in the frozen wind
  // at 2 h a second, for exploring. A backward jump (a loop, Now, scrubbing) moves nothing.
  const dh = timeline.pos - (tracer.lastPos ?? timeline.pos);
  tracer.lastPos = timeline.pos;
  const playing = timeline.playing && dh > 0 && dh < 12 && !timeline.beforeModel && !timeline.afterModel;
  tracer.playingNow = playing;
  const w = playing ? tracerWind(f.L) : { u: f.d.u, v: f.d.v };
  const H = playing ? dh : timeline.playing ? 0 : step * 2;
  const F3 = tracer.items.some((it) => it.z != null && it.kind !== "back") ? tracerAir() : null;
  const fly = (b, opts) => {
    if (b.z != null) return step3d(b, F3, H, opts);
    for (let left = H; left > 1e-9; left -= 1) if (!stepBalloon(b, w.u, w.v, g, Math.min(1, left), { hoursPerSecond: 1, ...opts })) return false;
    return true;
  };
  tracer.items = tracer.items.filter((it) => {
    if (it.kind === "marble") return stepMarble(it, f.surface, g, unit, step);
    if (it.kind === "balloon") return fly(it);
    if (it.kind === "smoke") {
      it.puffs = it.puffs.filter((p) => {
        if (!fly(p, PUFF)) return false;
        if (tracer.spread && H > 0) {                   // turbulence: a random step, and mixing in the boundary layer
          const s = p.z != null && F3 ? tracerSample3d(F3, p.lat, p.lon, p.z) : null;
          disperse(p, H, { ground: s ? s.ground : 0, top: s ? s.pbl : NaN });
          if (s) p.z = Math.min(s.zMax, p.z);
        }
        return true;
      });
      it.hours += H; it.emitH += H;
      for (; it.emitH >= 1; it.emitH -= 1) it.puffs.push({ lat: it.lat, lon: it.lon, hours: 0, trail: [], ...(it.z != null ? { z: it.z } : {}) });
      if (it.puffs.length > PUFF_MAX) it.puffs.splice(0, it.puffs.length - PUFF_MAX);
      return true;
    }
    if (it.kind === "ring") {
      const n = it.members.length;
      it.members = it.members.filter((p) => fly(p, PUFF));
      if (it.members.length < n) it.broken = true;        // part of it left the map: no longer a closed ring
      else it.members = refineRing(it.members, (2 * Math.PI * it.rKm) / RING_N * 1.5);
      it.hours += H;
      return it.members.length >= 3;
    }
    return true;                                          // "where from?": a path, traced once
  });
  for (const it of tracer.items) if (it.kind === "lift") updateLift(it);
  const zOf = tracerDrawZ(f), balls = [], lines = [], dots = [];
  for (const it of tracer.items) {
    if (it.kind !== "ring" && it.kind !== "lift" && it.kind !== "forces" && it.kind !== "sonde" && it.kind !== "swell" && !(it.kind === "back" && it.three)) balls.push({ kind: it.kind === "balloon" && it.z != null ? "parcel" : it.kind, lat: it.lat, lon: it.lon, zKm: zOf(it.lat, it.lon, it.z) });
    if (it.kind === "balloon" && it.trail.length > 1) lines.push({ rgb: it.z != null ? [0.2, 0.85, 0.75] : [1, 0.55, 0.15], pts: it.trail.map(([la, lo, z]) => [la, lo, zOf(la, lo, z)]) });
    if (it.kind === "back" && it.path) for (const tr of it.tracks) {
      if (it.three) balls.push({ kind: "back", lat: it.lat, lon: it.lon, zKm: zOf(it.lat, it.lon, tr.z) });
      if (tr.path.length < 2) continue;
      lines.push({ rgb: tr.rgb, pts: [...tr.path].reverse().map(([la, lo, z]) => [la, lo, zOf(la, lo, z)]) });
      for (const [la, lo, z, ago] of tr.path) if (ago > 0 && ago % 24 === 0) dots.push({ lat: la, lon: lo, zKm: zOf(la, lo, z), rgba: [...tr.rgb, 1] });
    }
    if (it.kind === "swell" && it.path?.length) {       // the swell's path back, on the sea, a dot every day, the storm marked
      const z0 = zOf(it.lat, it.lon);
      lines.push({ rgb: [0.55, 0.75, 1], pts: [...it.path].reverse().map(([la, lo]) => [la, lo, z0]) });
      for (const [la, lo, ago] of it.path) if (ago > 0 && ago % 24 === 0) dots.push({ lat: la, lon: lo, zKm: z0, rgba: [0.7, 0.85, 1, 1] });
      balls.push({ kind: "back", lat: it.lat, lon: it.lon, zKm: z0 });
      if (it.peak && it.peak.ago > 0) balls.push({ kind: "balloon", lat: it.peak.lat, lon: it.peak.lon, zKm: z0 });
    }
    if (it.kind === "sonde" && it.path) {               // the weather balloon's flight, at true height
      const z3 = (z) => z * 0.001 * Math.pow(10, Number($("vexSlider").value)) + 30;
      lines.push({ rgb: [1, 0.45, 0.45], pts: it.path.map(([la, lo, z]) => [la, lo, z3(z)]) });
      const [la, lo, z] = it.path.at(-1);
      balls.push({ kind: "balloon", lat: la, lon: lo, zKm: z3(z) });
    }
    if (it.kind === "lift" && it.res) {                 // the column: dry rise to the cloud base, then the cloud to its top
      const r = it.res, base = r.lcl?.z ?? r.path[r.path.length - 1].z, g0 = r.path[0].z, z3 = (z) => z * 0.001 * Math.pow(10, Number($("vexSlider").value)) + 30;
      lines.push({ rgb: [0.6, 0.8, 1], fade: false, pts: [[it.lat, it.lon, z3(g0)], [it.lat, it.lon, z3(base)]] });
      if (r.top != null && r.top > base) lines.push({ rgb: [1, 1, 1], fade: false, pts: [[it.lat, it.lon, z3(base)], [it.lat + 0.01, it.lon, z3(r.top)]] });
      balls.push({ kind: "marble", lat: it.lat, lon: it.lon, zKm: z3(r.top ?? base) });
    }
    if (it.kind === "forces") {                         // arrows on the focus level: push, spin, what's left, the wind and the geostrophic wind
      it.fr = forcesHere(f, it.lat, it.lon);
      it.arrows = it.fr ? screenArrows(it, forceArrows(it, it.fr), zOf(it.lat, it.lon)) : [];
      for (const a of it.arrows) {
        const z = zOf(it.lat, it.lon), tip = offsetKm(it.lat, it.lon, a.x, a.y), len = Math.hypot(a.x, a.y);
        if (len < 1) continue;
        const back = (deg) => { const t = Math.atan2(a.y, a.x) + Math.PI + (deg * Math.PI) / 180, h = len * 0.22; return offsetKm(tip.lat, tip.lon, h * Math.cos(t), h * Math.sin(t)); };
        const h1 = back(28), h2 = back(-28);
        lines.push({ rgb: a.rgb, fade: false, pts: [[it.lat, it.lon, z], [tip.lat, tip.lon, z]] });
        lines.push({ rgb: a.rgb, fade: false, pts: [[h1.lat, h1.lon, z], [tip.lat, tip.lon, z], [h2.lat, h2.lon, z]] });
      }
      balls.push({ kind: "marble", lat: it.lat, lon: it.lon, zKm: zOf(it.lat, it.lon) });
    }
    if (it.kind === "smoke") for (const p of it.puffs) dots.push({ lat: p.lat, lon: p.lon, zKm: zOf(p.lat, p.lon, p.z), rgba: [0.93, 0.9, 0.84, Math.max(0.2, 1 - p.hours / 150)] });
    if (it.kind === "ring") {
      lines.push({ rgb: [1, 0.85, 0.2], closed: !it.broken, fade: false, pts: it.members.map((p) => [p.lat, p.lon, zOf(p.lat, p.lon, p.z)]) });
      for (const p of it.members) if (p.orig) dots.push({ lat: p.lat, lon: p.lon, zKm: zOf(p.lat, p.lon, p.z), rgba: [1, 0.85, 0.2, 1] });
    }
  }
  if (tracer.items.some((t) => t.kind === "forces")) drawDropForces();
  tracerView.update({ balls, lines, dots }, { vex: Math.pow(10, Number($("vexSlider").value)), W: root.clientWidth, H: root.clientHeight, fovDeg: camera.fov, dpr: renderer.getPixelRatio() });
  dirty = true;
}
// The forces on the air at a point on the focus level (forces.js), at the nearer real step.
function forcesHere(f, lat, lon) {
  const g = manifest.grid, [gx, gy] = gradKm(f.d.c, g, lat, lon), u = gridSample(f.d.u, g, lat, lon), v = gridSample(f.d.v, g, lat, lon);
  if (![gx, gy, u, v].every(Number.isFinite)) return null;
  return { ...forcesAt({ gx, gy, u, v, lat, surface: f.L.def.key === "sfc" }), u, v, surface: f.L.def.key === "sfc" };
}
// The arrows, in km on the map: forces at 400 km per 1e-3 m/s^2 (7 kt per hour), winds at 25 km per m/s;
// then screenArrows sizes each group to the screen, so they read at any zoom (the labels give the values).
const FORCE_KM = 4e5, WIND_KM = 25, ARROW_PX = 110;
function screenArrows(it, arrows, zKm) {
  const v0 = geo.point(it.lat, it.lon, zKm).clone().project(camera), e = offsetKm(it.lat, it.lon, 100, 0);
  const v1 = geo.point(e.lat, e.lon, zKm).clone().project(camera), W = root.clientWidth, H = root.clientHeight;
  const pxPerKm = Math.hypot((v1.x - v0.x) * W / 2, (v1.y - v0.y) * H / 2) / 100;
  if (!(pxPerKm > 0)) return arrows;
  const isWind = (a) => a.label === "wind" || a.label === "geostrophic";
  const fit = (group) => { const m = Math.max(...group.map((a) => Math.hypot(a.x, a.y)), 1e-9); return ARROW_PX / (m * pxPerKm); };
  const kf = fit(arrows.filter((a) => !isWind(a))), kw = fit(arrows.filter(isWind));
  return arrows.map((a) => ({ ...a, x: a.x * (isWind(a) ? kw : kf), y: a.y * (isWind(a) ? kw : kf) }));
}
function forceArrows(it, r) {
  const A = (vec, k, rgb, label) => ({ x: vec[0] * k, y: vec[1] * k, rgb, label });
  const out = [A(r.push, FORCE_KM, [1, 0.35, 0.3], "push"), A(r.spin, FORCE_KM, [0.35, 0.6, 1], "spin"),
    A(r.rest, FORCE_KM, [0.75, 0.75, 0.75], r.surface ? "friction" : "rest"), A([r.u, r.v], WIND_KM, [1, 1, 1], "wind")];
  if (r.vg && Math.hypot(...r.vg) < 120) out.push(A(r.vg, WIND_KM, [1, 0.85, 0.2], "geostrophic"));
  return out;
}
const ktH = (a) => (Math.hypot(...a) * KT_PER_HOUR).toFixed(1);
// In words: the forces at the latest "forces" point.
function forcesSummary(r) {
  if (!r) return "";
  const sp = Math.hypot(r.u, r.v) / 0.514444;
  let t = `<span style="color:#ff5a4d">Pressure push</span> ${ktH(r.push)} kt per hour, toward the ${r.surface ? "low pressure" : "low heights"}; `
    + `<span style="color:#5a99ff">Earth's spin</span> ${ktH(r.spin)} kt per hour, at right angles to the wind (to its ${r.f > 0 ? "right" : "left"}); `
    + `<span style="color:#bbb">${r.surface ? "friction (what's left)" : "what's left (curving, speeding up)"}</span> ${ktH(r.rest)} kt per hour. `
    + `The <b>wind</b> is ${Math.round(sp)} kt.`;
  if (!r.vg) return `${t} Near the equator Earth's spin is too weak to balance the push, so there's no geostrophic wind: the air flows more directly from high to low.`;
  const g = Math.hypot(...r.vg) / 0.514444;
  t += ` In balance (push = spin) it would be the <span style="color:#ffd633">geostrophic wind</span>, ${Math.round(g)} kt along the ${r.surface ? "isobars" : "height lines"}.`;
  if (r.cross != null) t += r.surface && sp > g * 1.05
    ? ` Here the wind is faster than that (${Math.round((100 * sp) / g)} %) and crosses the isobars at ${Math.round(Math.abs(r.cross))}°: it isn't in balance. It's curving (round a high, the wind can outrun the geostrophic) or speeding up, so the grey arrow is more than friction.`
    : r.surface
    ? ` Friction holds it to ${Math.round((100 * sp) / g)} % of that and turns it ${Math.round(Math.abs(r.cross))}° ${r.cross > 0 ? "across the isobars toward the low" : "away from the low (unusual: the air is speeding up or curving)"}.`
    : ` Up here it runs within ${Math.round(Math.abs(r.cross))}° of the lines at ${Math.round((100 * sp) / g)} % of that speed${Math.abs(sp - g) / g > 0.25 ? ": well off balance, so it's curving round a trough or ridge, or speeding up or slowing" : ""}.`;
  return t;
}
function drawDropForces() {
  const it = [...tracer.items].reverse().find((t) => t.kind === "forces" && t.fr), box = $("dropForcesBox");
  box.hidden = !it;
  if (it) $("dropForcesText").innerHTML = forcesSummary(it.fr);
}
// "Where's this swell from?" (traceSwell): load the wave steps the trace needs (as far back as asked or the
// data go), then follow the swell backward through the wave field of each earlier hour.
async function traceSwellFrom(it) {
  const m = it.model, ld = leads, g = manifest.grid;
  if (!hasWaves(m)) { it.failed = "no waves in this build"; dirty = true; return; }
  const t0 = Math.min(Math.max(it.t0, ld[0]), ld[ld.length - 1]), hours = Math.max(0, Math.min(it.wantH, t0 - ld[0]));
  it.t0 = t0; it.hours = hours;
  const s0 = timeline.segment(t0 - hours), s1 = timeline.segment(t0), idx = [];
  for (let i = s0.i0; i <= s1.i1; i++) idx.push(i);
  try { await Promise.all(idx.map((i) => loader.load(m, ld[i], "wave"))); } catch { it.failed = "couldn't load the waves"; dirty = true; return; }
  const sample = (t, lat, lon) => {
    if (t < ld[0] - 1e-6) return undefined;
    const { i0, i1, t: w } = timeline.segment(t), a = loader.ready(m, ld[i0], "wave"), b = loader.ready(m, ld[i1], "wave");
    if (!a || !b) return undefined;
    const v = (f) => gridSampleFinite(f, g, lat, lon), mix = (x, y) => x + (y - x) * w;      // at the coast too
    const hs = mix(v(a.hs), v(b.hs)), tp = mix(v(a.tp), v(b.tp));
    const da = v(a.dir) * Math.PI / 180, db = v(b.dir) * Math.PI / 180;
    const dir = (Math.atan2(mix(Math.sin(da), Math.sin(db)), mix(Math.cos(da), Math.cos(db))) * 180 / Math.PI + 360) % 360;
    return [hs, tp, dir].every(Number.isFinite) ? { hs, tp, dir } : null;
  };
  const r = traceSwell({ lat: it.lat, lon: it.lon }, sample, t0, hours);
  if (!r.path.length) { it.failed = "that's land or ice: pick a spot at sea"; dirty = true; return; }
  it.path = r.path; it.T = r.T; it.peak = r.peak; it.end = r.end;
  const a = sample(t0, it.lat, it.lon); it.arrive = a;
  updateHud(); dirty = true;
}
// A weather balloon (radiosonde; user request 2026-10-09): released at the ground at the time on screen,
// rising 5 m/s and drifting with the model's wind at its height and time (ascend), it reads each pressure
// level -- temperature, humidity, wind -- where it crosses it, like a real sonde; the sounding is then
// read the forecaster's way (the surface parcel lifted through it: parcel.js). The data stop at the top
// level (250 mb, ~10.5 km), so the flight ends there; a real sonde climbs on to ~30 km.
async function launchSonde(it) {
  const m = it.model, ld = leads, t0 = Math.min(Math.max(it.t0, ld[0]), ld[ld.length - 1]), g = manifest.grid;
  const s0 = timeline.segment(t0), s1 = timeline.segment(Math.min(ld[ld.length - 1], t0 + 1)), idx = [];
  for (let i = s0.i0; i <= s1.i1; i++) idx.push(i);
  const bundles = ["sfc", ...manifest.levels.map((p) => `p${p}`)];
  try { await Promise.all(idx.flatMap((i) => bundles.map((b) => loader.load(m, ld[i], b)))); } catch { it.failed = true; dirty = true; return; }
  const raw = (i) => ({ sfc: loader.ready(m, ld[i], "sfc"), levels: Object.fromEntries(manifest.levels.map((p) => [p, loader.ready(m, ld[i], `p${p}`)])) });
  const fields = new Map();
  const air = (t) => { const { i0, i1, t: w } = timeline.segment(t), k = `${i0}:${i1}`; if (!fields.has(k)) fields.set(k, buildWindField(raw(i0), raw(i1), null)); const F = fields.get(k); F.t = w; return F; };
  const at = (t, get) => { const { i0, i1, t: w } = timeline.segment(t), a = get(ld[i0]), b = get(ld[i1]); return (lat, lon) => { const x = gridSample(a, g, lat, lon); return x + (gridSample(b, g, lat, lon) - x) * w; }; };
  const start = tracerSample3d(air(t0), it.lat, it.lon, 0);
  if (!start) { it.failed = true; dirty = true; return; }
  it.path = ascend({ lat: it.lat, lon: it.lon, z: start.ground + 10 }, (t, la, lo, z) => tracerSample3d(air(t), la, lo, z), t0);
  // the sounding: the ground at the launch, then each level where the balloon crossed it
  const ps = at(t0, (l) => loader.ready(m, l, "sfc").psfc)(it.lat, it.lon);
  const env = [{ p: ps / 100, z: start.ground, T: at(t0, (l) => loader.ready(m, l, "sfc").t2m)(it.lat, it.lon) - 273.15, RH: null,
    u: at(t0, (l) => loader.ready(m, l, "sfc").u10)(it.lat, it.lon), v: at(t0, (l) => loader.ready(m, l, "sfc").v10)(it.lat, it.lon) }];
  for (const p of [...manifest.levels].sort((a, b) => b - a)) {
    if (p * 100 >= ps) continue;                       // below the ground here
    const lv = (k) => (l) => loader.ready(m, l, `p${p}`)[k];
    const hit = it.path.find(([la, lo, z, min]) => z >= at(t0 + min / 60, lv("gh"))(la, lo) - 5);   // the flight ends 1 m under the top level
    if (!hit) continue;
    const [la, lo, , min] = hit, t = t0 + min / 60;
    env.push({ p, z: at(t, lv("gh"))(la, lo), T: at(t, lv("t"))(la, lo) - 273.15, RH: at(t, lv("r"))(la, lo), u: at(t, lv("u"))(la, lo), v: at(t, lv("v"))(la, lo), min });
  }
  it.env = env; it.res = liftParcel(env);
  updateHud(); drawDropSonde(); dirty = true;
}
function drawDropSonde() {
  const it = [...tracer.items].reverse().find((t) => t.kind === "sonde" && t.res), box = $("dropSondeBox");
  box.hidden = !it;
  if (!it) return;
  const cv = box.querySelector("canvas"), dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth || 280, H = 220;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawParcel(ctx, W, H, it.res, it.env);
  const [la, lo, z, min] = it.path.at(-1), d = Math.hypot((lo - it.lon) * 111.195 * Math.cos((it.lat * Math.PI) / 180), (la - it.lat) * 111.195);
  const toDeg = (Math.atan2((lo - it.lon) * Math.cos((it.lat * Math.PI) / 180), la - it.lat) * 180) / Math.PI;
  const ms = Date.parse(manifest.anchor) + it.t0 * 3600e3;
  const wind = (e) => { const sp = Math.hypot(e.u, e.v) / 0.514444, from = (Math.atan2(-e.u, -e.v) * 180 / Math.PI + 360) % 360; return `${Math.round(sp)} kt from ${COMPASS[Math.round(from / 22.5) % 16]}`; };
  $("dropSondeText").innerHTML = `Launched ${fmtLocal(ms) ?? fmtUtcShort(ms)}; it reached ${fmtZ(z)}, the top of the model's data, after ${Math.round(min)} minutes, `
    + `${Math.round(d)} km to the ${COMPASS[Math.round(((toDeg + 360) % 360) / 22.5) % 16]}.<br><b>Winds:</b> `
    + it.env.map((e, k) => `${k ? `${e.p} mb` : "surface"} ${wind(e)}`).join(" · ")
    + `<br><b>Read like a forecaster:</b> ${liftSummary(it.res)}`;
}
// The model's column at a point at the time on screen (the two real steps around it, blended): the
// ground (its 2 m temperature) and the pressure levels above it, for the parcel (parcel.js). Starts
// loading what's missing and returns null until it's there.
function columnAt(lat, lon) {
  const { i0, i1, t } = timeline.segment(), g = manifest.grid;
  const get = (lead, b) => { const f = loader.ready(model, lead, b); if (!f) loader.load(model, lead, b).then(() => { dirty = true; }).catch(() => {}); return f; };
  const step = (lead) => ({ sfc: get(lead, "sfc"), lv: manifest.levels.map((p) => get(lead, `p${p}`)) });
  const A = step(leads[i0]), B = step(leads[i1]);
  if (!A.sfc || !B.sfc || A.lv.some((x) => !x) || B.lv.some((x) => !x)) return null;
  const at = (a, b) => { const x = gridSample(a, g, lat, lon); return x + (gridSample(b, g, lat, lon) - x) * t; };
  const ps = at(A.sfc.psfc, B.sfc.psfc), ground = groundHeight(ps);
  const env = [{ p: ps / 100, z: ground, T: at(A.sfc.t2m, B.sfc.t2m) - 273.15, RH: null }];
  manifest.levels.forEach((p, k) => {
    const z = at(A.lv[k].gh, B.lv[k].gh);
    if (p * 100 < ps && z > ground + 20) env.push({ p, z, T: at(A.lv[k].t, B.lv[k].t) - 273.15, RH: at(A.lv[k].r, B.lv[k].r) });
  });
  return env.every((e) => Number.isFinite(e.T) && Number.isFinite(e.z)) ? env : null;
}
// Lift the parcel again when the time, the model or the warming changes; redraw the chart.
function updateLift(it) {
  const key = `${model}:${timeline.pos.toFixed(3)}:${tracer.liftDT}`;
  if (it.key === key && it.res) return;
  const env = columnAt(it.lat, it.lon);
  if (!env) return;
  it.key = key; it.env = env; it.res = liftParcel(env, { dT: tracer.liftDT });
  drawDropParcel();
}
const fmtAgo = (h) => (h < 48 ? `${Math.round(h)} h` : `${(h / 24).toFixed(1)} days`);
const fmtZ = (z) => (z < 1000 ? `${Math.round(z / 10) * 10} m` : `${(z / 1000).toFixed(1)} km`);
// In words: what the parcel does.
function liftSummary(r) {
  if (!r) return "";
  const lid = r.inversion ? `${r.inversion.lapse < 0 ? "an inversion" : "a very stable layer"} at ${fmtZ(r.inversion.base)}–${fmtZ(r.inversion.top)}` : null;
  const start = `Surface air: ${r.start.T.toFixed(1)} °C${tracer.liftDT ? ` (warmed ${tracer.liftDT} °C)` : ""}, dew point ${r.start.Td.toFixed(1)} °C. Lifted, it cools 9.8 °C per km and its cloud forms at <b>${r.lcl ? fmtZ(r.lcl.z) : "—"}</b>.`;
  if (r.stable) return `${start} It is never warmer than the air around it: <b>stable</b>, no cloud from rising by itself. Pushed up (a mountain, a front) it would still make cloud from that base${lid ? `; ${lid} would cap it` : ""}.`;
  const capped = lid && r.top < r.inversion.top + 300;
  const push = r.lcl && r.lfc.z - r.lcl.z > 300 ? ` It has to be pushed from there up to ${fmtZ(r.lfc.z)} (CIN ${r.cin} J/kg: a front, a mountain or a sea breeze can do it);` : "";
  return `${start}${push} It is buoyant from ${fmtZ(r.lfc.z)} and rises by itself to about <b>${fmtZ(r.top)}</b>${capped ? `, where ${lid} stops it: a shallow, capped cloud (the way the trade inversion caps trade cumulus)` : r.top > 8000 ? ": a deep cloud, a shower or thunderstorm" : ""}. CAPE ${r.cape} J/kg${r.cape > 1000 ? " (plenty of energy for storms)" : r.cape < 100 ? " (very little)" : ""}.`;
}
// The parcel chart in the Drop tab: the latest lifted column.
function drawDropParcel() {
  const it = [...tracer.items].reverse().find((t) => t.kind === "lift" && t.res), box = $("dropParcel");
  box.hidden = !it;
  if (!it) return;
  const cv = box.querySelector("canvas"), dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth || 280, H = 220;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawParcel(ctx, W, H, it.res, it.env);
  $("dropParcelText").innerHTML = liftSummary(it.res);
}
// A 3-D step. Hours that pass while the levels are still loading are kept and flown once they arrive
// (in steps of an hour at most), so its clock never falls behind the timeline's.
function step3d(it, F, hours, opts) {
  if (!F) { it.owedH = (it.owedH ?? 0) + hours; return true; }
  let left = hours + (it.owedH ?? 0);
  it.owedH = 0;
  while (left > 1e-9) {
    const h = Math.min(1, left);
    if (!stepBalloon3d(it, (la, lo, z) => tracerSample3d(F, la, lo, z), h, opts)) return false;
    left -= h;
  }
  return true;
}
// The air at every height at the time on screen, for 3-D balloons: all levels of the two real steps around
// it (sectionData, as the 3-D particles use), blended by windAt; null while they load.
function tracerAir() {
  const { i0, i1, t } = timeline.segment(), key = `${model}:${leads[i0]}:${leads[i1]}`;
  if (tracer._airKey !== key) {
    const A = sectionData(model, leads[i0]), B = sectionData(model, leads[i1]);
    if (!A || !B) return null;
    tracer._airKey = key; tracer._air = buildWindField(A, B, null);
    tracer._air.pblA = A.sfc.hpbl ?? null; tracer._air.pblB = B.sfc.hpbl ?? null;     // for the smoke's mixing
  }
  tracer._air.t = t;
  return tracer._air;
}
// The air at a point and height, the height kept between the ground (+10 m) and the top level.
function tracerSample3d(F, lat, lon, z) {
  const g = manifest.grid, lonE = lon < g.lon0 ? lon + 360 : lon, fi = (lonE - g.lon0) / g.dlon, fj = (lat - g.lat0) / g.dlat;
  if (!(fi >= 0 && fj >= 0 && fi < g.nlon - 1 && fj < g.nlat - 1)) return null;
  const at = (a, b) => { const x = gridSample(a, g, lat, lonE); return b && F.t ? x + (gridSample(b, g, lat, lonE) - x) * F.t : x; };
  // The floor is the 10 m level's own height, interpolated the way windAt does: from the ground height
  // of the interpolated pressure instead, it sat tens of m under it over mountains (ground height isn't
  // linear in pressure), windAt found no level below and the balloon vanished (user report 2026-10-09).
  const bottom = F.levels.find((lv) => lv.p === 0), top = F.levels.reduce((m, lv) => (lv.p > 0 && (!m || lv.p < m.p) ? lv : m), null);
  const zMin = at(bottom.ghA, bottom.ghB) + 0.5, zMax = at(top.ghA, top.ghB) - 1;
  const w = windAt(F, g.nlon, fi, fj, Math.min(zMax, Math.max(zMin, z)));
  // ground: the 10 m level less 10 m; pbl: the boundary layer's depth (GFS; NaN where there's none)
  return w ? { u: w.u, v: w.v, w: w.w, q: w.q, zMin, zMax, ground: zMin - 10.5, pbl: F.pblA ? at(F.pblA, F.pblB) : NaN } : null;
}
// The focus level's wind at the time on screen: the two real steps around it, blended (cached per frame time).
function tracerWind(L) {
  const { i0, i1, t } = timeline.segment(), key = `${L.def.key}:${leads[i0]}:${leads[i1]}:${t.toFixed(3)}`;
  if (tracer._windKey === key) return tracer._wind;
  const a = derivedFor(L, leads[i0]), b = derivedFor(L, leads[i1]);
  if (!a || !b) return { u: (a ?? b).u, v: (a ?? b).v };
  const n = a.u.length, u = new Float32Array(n), v = new Float32Array(n);
  for (let k = 0; k < n; k++) { u[k] = a.u[k] + (b.u[k] - a.u[k]) * t; v[k] = a.v[k] + (b.v[k] - a.v[k]) * t; }
  tracer._windKey = key; tracer._wind = { u, v };
  return tracer._wind;
}
// The labels: a balloon's wind and flying time; where the air came from and when; a plume's age; a
// ring's area against its first.
function tracerItems(W, H) {
  if (arch.on || sim.on) return [];
  const f = tracerField(), v = new THREE.Vector3(), out = [];
  if (!f) return out;
  const zOf = tracerDrawZ(f), hgt = (z) => (z != null ? ` · ${fmtHeight(z, hUnit)}` : "");
  const put = (lat, lon, z, text, cls, dy = -24) => {
    v.copy(geo.point(lat, lon, zOf(lat, lon, z))).project(camera);
    if (v.z <= 1) out.push({ x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, dy, text, cls, align: "center" });
  };
  for (const it of tracer.items) {
    if (it.kind === "balloon" && it.speedKt != null) put(it.lat, it.lon, it.z, `${Math.round(it.speedKt)} kt from ${COMPASS[Math.round(it.fromDeg / 22.5) % 16]} · ${Math.round(it.hours)} h${it.z != null ? `${hgt(it.z)} ${it.wCms > 0.5 ? "↑" : it.wCms < -0.5 ? "↓" : "→"}` : ""}`, it.z != null ? "gl-parcel" : "gl-balloon");
    if (it.kind === "back") {
      if (!it.path) { put(it.lat, it.lon, it.z, it.failed ? "couldn't load the winds" : "tracing back…", "gl-back"); continue; }
      const ms = Date.parse(manifest.anchor) + it.t0 * 3600e3, top = it.tracks[it.tracks.length - 1];
      put(it.lat, it.lon, top.z, `arriving ${fmtLocal(ms) ?? fmtUtcShort(ms)}${it.three ? "" : hgt(it.z)}`, "gl-back");
      for (const tr of it.tracks) {
        const [la, lo, z, ago] = tr.path.at(-1);
        if (ago > 0) put(la, lo, z, `${tr.label ? `${tr.label}: ` : ""}${Math.round(ago)} h earlier${hgt(z)}${tr.left ? ", from off the map" : ""}`, "gl-back");
      }
    }
    if (it.kind === "smoke") put(it.lat, it.lon, it.z, `smoke · ${Math.round(it.hours)} h${hgt(it.z)}`, "gl-smoke");
    if (it.kind === "forces" && it.fr) for (const a of it.arrows ?? []) {
      if (Math.hypot(a.x, a.y) < 15) continue;
      const tip = offsetKm(it.lat, it.lon, a.x * 1.08, a.y * 1.08), r = it.fr;
      const txt = { push: `push ${ktH(r.push)}`, spin: `spin ${ktH(r.spin)}`, friction: `friction ${ktH(r.rest)}`, rest: `rest ${ktH(r.rest)}`,
        wind: `wind ${Math.round(Math.hypot(r.u, r.v) / 0.514444)} kt${r.vg ? ` (geostrophic ${Math.round(Math.hypot(...r.vg) / 0.514444)})` : ""}` }[a.label];
      if (!txt) continue;                                 // the geostrophic arrow is named in the wind's label: they point nearly the same way
      put(tip.lat, tip.lon, undefined, txt, `gl-force gl-force-${a.label}`, 0);
    }
    if (it.kind === "swell") {
      if (!it.path) { put(it.lat, it.lon, undefined, it.failed ?? "tracing the swell…", "gl-back"); continue; }
      const a = it.arrive, from = COMPASS[Math.round(a.dir / 22.5) % 16];
      put(it.lat, it.lon, undefined, `swell ${a.hs.toFixed(1)} m, ${Math.round(it.T)} s from ${from}`, "gl-back");
      if (it.peak?.ago > 0) put(it.peak.lat, it.peak.lon, undefined, `its storm? ${it.peak.hs.toFixed(1)} m seas, ${fmtAgo(it.peak.ago)} earlier`, "gl-balloon");
      const [la, lo, ago] = it.path.at(-1);
      if (ago > 0 && (!it.peak || ago !== it.peak.ago)) put(la, lo, undefined, `${fmtAgo(ago)} earlier${it.end === "land" ? ": reached land or ice" : it.end === "data" ? ": the data end here" : ""}`, "gl-back");
    }
    if (it.kind === "sonde") {
      if (!it.path) { put(it.lat, it.lon, undefined, it.failed ? "couldn't load the column" : "launching…", "gl-balloon"); continue; }
      const [la, lo, z, min] = it.path.at(-1);
      put(la, lo, z, `weather balloon · ${fmtZ(z)} after ${Math.round(min)} min`, "gl-balloon");
    }
    if (it.kind === "lift" && it.res) {
      const r = it.res;
      if (r.lcl) put(it.lat, it.lon, r.lcl.z, `cloud base ${fmtZ(r.lcl.z)}`, "gl-lift", 8);
      put(it.lat, it.lon, r.top ?? r.lcl?.z ?? r.path[0].z, r.stable ? "stable: no cloud by itself" : `tops ${fmtZ(r.top)}${r.inversion && r.top < r.inversion.top + 300 ? " · capped" : ""}`, "gl-lift");
    }
    if (it.kind === "ring" && it.members.length) {
      const m = it.members, lon0 = m[0].lon, lat = m.reduce((s, p) => s + p.lat, 0) / m.length;
      const lon = lon0 + m.reduce((s, p) => s + ((((p.lon - lon0) % 360) + 540) % 360) - 180, 0) / m.length;
      const zs = m.map((p) => p.z).filter((z) => z != null), z = zs.length ? zs.reduce((s, x) => s + x, 0) / zs.length : undefined;
      put(lat, lon, z, `${it.broken ? "part of it left the map" : `area ${Math.round((100 * ringAreaKm2(m)) / it.area0)} %`} · ${Math.round(it.hours)} h`, "gl-ring", 0);
    }
  }
  return out;
}
for (const [k, id] of Object.entries(TOOLS)) $(id).addEventListener("click", () => setTracerMode(k));
$("dropWaves").addEventListener("change", (e) => { tracer.waves = e.target.checked; for (const t of tracer.items) if (t.kind === "marble") { t.vx = 0; t.vy = 0; } updateHud(); dirty = true; });
$("dropLevel").addEventListener("change", (e) => { tracer.onLevel = e.target.checked; updateHud(); });
$("dropBackH").addEventListener("change", (e) => { tracer.backH = Number(e.target.value); });
$("dropBackMode").addEventListener("change", (e) => { tracer.backThree = e.target.value === "three"; });
$("dropLiftFly").addEventListener("change", (e) => { tracer.liftFly = e.target.checked; });
$("dropLiftDT").addEventListener("change", (e) => { tracer.liftDT = Number(e.target.value); dirty = true; });
$("dropSpread").addEventListener("change", (e) => { tracer.spread = e.target.checked; updateHud(); });
$("dropRingKm").addEventListener("change", (e) => { tracer.ringKm = Number(e.target.value); });
$("dropClear").addEventListener("click", () => { tracer.items = []; setTracerMode(null); tracerView.object.visible = false; drawDropJourney(); drawDropParcel(); drawDropForces(); drawDropSonde(); updateHud(); dirty = true; });

// ---- Drawing on the map (user pick 2026-10-09) ---------------------------------------------------
// Arrows, circles and text labels pinned to latitude and longitude, drawn at the focus level's height
// like the Drop tools, on top of everything; they ride in the share link (share.js "an") and in saved
// pictures (lines through WebGL, labels through the label layer). For teaching: mark the trough, send
// the link.
const NOTE_COLORS = ["#f0a830", "#e5484d", "#4da3ff", "#ffffff", "#111827"];
const noteLines = new Strokes3D(geo, { width: 3, renderOrder: 975 });
noteLines.object.visible = false;
scene.add(noteLines.object);
function setNoteMode(m) {
  note.mode = note.mode === m ? null : m; note.pending = null;
  for (const [k, id] of [["arrow", "noteArrow"], ["circle", "noteCircle"], ["text", "noteText"]]) $(id).classList.toggle("on", note.mode === k);
  if (note.mode) setTracerMode(null);
  renderer.domElement.style.cursor = note.mode ? "crosshair" : "";
  $("noteHint").textContent = note.mode === "arrow" ? "Click where the arrow starts, then where it points." : note.mode === "circle" ? "Click the centre, then the edge." : note.mode === "text" ? "Type the label above, then click where it goes." : "";
}
function noteClick(lat, lon) {
  const g = manifest.grid, lonE = lon < g.lon0 ? lon + 360 : lon;
  if (note.mode === "text") {
    const text = $("noteInput").value.trim();
    if (!text) { $("noteHint").textContent = "Type the label first."; return; }
    addNote({ type: "text", color: note.color, lat, lon: lonE, text: text.slice(0, 80) });
    return;
  }
  if (!note.pending) { note.pending = { lat, lon: lonE }; $("noteHint").textContent = note.mode === "arrow" ? "Now click where it points." : "Now click the edge."; return; }
  const p = note.pending;
  addNote(note.mode === "arrow" ? { type: "arrow", color: note.color, lat: p.lat, lon: p.lon, lat2: lat, lon2: lonE }
    : { type: "circle", color: note.color, lat: p.lat, lon: p.lon, rKm: Math.max(20, Math.round(Math.hypot((((lonE - p.lon + 540) % 360) - 180) * 111.195 * Math.cos(((lat + p.lat) / 2) * Math.PI / 180), (lat - p.lat) * 111.195))) });
}
function addNote(n) {
  note.items.push(n);
  if (note.items.length > MAX_NOTES) note.items.shift();
  note.pending = null;
  const m = note.mode; note.mode = null; setNoteMode(m);       // stay in the same tool for the next one
  drawNotes(); custom(); dirty = true;
}
// The lines, rebuilt when the drawings, the focus level or the stretch change.
function drawNotes() {
  const f = tracerField(), vex = Math.pow(10, Number($("vexSlider").value));
  const zOf = (lat, lon) => (f ? tracerZ(f, lat, lon) : 30) + 6;
  const rgb = (c) => { const h = NOTE_COLORS[c] ?? NOTE_COLORS[0]; return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); };
  const lines = [];
  for (const n of note.items) {
    const [r, g, b] = rgb(n.color), P = (lat, lon) => ({ lat, lon, z: (zOf(lat, lon) * 1000) / vex, r, g, b, a: 1 });
    if (n.type === "arrow") {
      const dx = (((n.lon2 - n.lon + 540) % 360) - 180) * 111.195 * Math.cos(((n.lat + n.lat2) / 2) * Math.PI / 180), dy = (n.lat2 - n.lat) * 111.195;
      const len = Math.hypot(dx, dy), h = Math.min(400, len * 0.25), t = Math.atan2(dy, dx) + Math.PI;
      const head = (s) => offsetKm(n.lat2, n.lon2, h * Math.cos(t + s), h * Math.sin(t + s));
      const h1 = head(0.45), h2 = head(-0.45);
      const shaft = Array.from({ length: 13 }, (_, k) => { const q = offsetKm(n.lat, n.lon, (dx * k) / 12, (dy * k) / 12); return P(q.lat, q.lon); });
      lines.push(shaft, [P(h1.lat, h1.lon), P(n.lat2, n.lon2), P(h2.lat, h2.lon)]);
    } else if (n.type === "circle") {
      lines.push(Array.from({ length: 49 }, (_, k) => { const a = (k / 48) * 2 * Math.PI, q = offsetKm(n.lat, n.lon, n.rKm * Math.cos(a), n.rKm * Math.sin(a)); return P(q.lat, q.lon); }));
    }
  }
  noteLines.setVex(vex); noteLines.setViewport(root.clientWidth, root.clientHeight);
  noteLines.build(`${note.items.length}:${JSON.stringify(note.items).length}:${f?.L.def.key}:${vex}`, lines);
  noteLines.object.visible = lines.length > 0 && !sim.on;
  $("noteCount").textContent = note.items.length ? `${note.items.length} drawn` : "";
}
// Text labels (and a small dot for an unfinished arrow or circle), through the label layer.
function noteItems(W, H) {
  if (sim.on || !note.items.length && !note.pending) return [];
  const f = tracerField(), v = new THREE.Vector3(), out = [];
  const put = (lat, lon, text, cls) => { v.copy(geo.point(lat, lon, (f ? tracerZ(f, lat, lon) : 30) + 6)).project(camera); if (v.z <= 1) out.push({ x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, dy: -8, text, cls, align: "center" }); };
  for (const n of note.items) if (n.type === "text") put(n.lat, n.lon, n.text, `gl-note gl-note-${n.color}`);
  if (note.pending) put(note.pending.lat, note.pending.lon, "•", "gl-note gl-note-0");
  return out;
}
$("noteArrow").addEventListener("click", () => setNoteMode("arrow"));
$("noteCircle").addEventListener("click", () => setNoteMode("circle"));
$("noteText").addEventListener("click", () => setNoteMode("text"));
$("noteColor").addEventListener("change", (e) => { note.color = Number(e.target.value); });
$("noteUndo").addEventListener("click", () => { note.items.pop(); drawNotes(); dirty = true; });
$("noteClear").addEventListener("click", () => { note.items = []; setNoteMode(null); drawNotes(); dirty = true; });

// ---- probe: click (not drag) to pin a column ---------------------------------------------
// Profile at the nearer real step, meteogram over every real step (probe.js).
let downAt = null;
let multi = 0;
renderer.domElement.addEventListener("pointerdown", (e) => { multi = e.isPrimary ? 0 : multi + 1; downAt = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now(), touch: e.pointerType === "touch" } : null; });
renderer.domElement.addEventListener("pointerup", (e) => {
  // a tap, not a drag or a pinch: a finger may move 10 px; a long press is the readout, not a tap
  const slop = downAt?.touch ? 10 : 5, maxMs = downAt?.touch ? 450 : 500;
  if (!downAt || !e.isPrimary || multi > 0 || press?.fired || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > slop || performance.now() - downAt.t > maxMs) return;
  const r = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  const hit = geo.pick(raycaster.ray);
  if (!hit) return;
  if (hemi?.on) {                       // no probe on the hemisphere: the readout gives its values; a tap near 50 N picks a trough to follow
    if (hq.kind === "follow" && hq.awaitTap && Math.abs(hit.latlon[0] - 50) < 15) { hq.tapLon = hit.latlon[1]; startHemiQuestion("follow"); }
    return;
  }
  if (note.mode) { noteClick(hit.latlon[0], hit.latlon[1]); dirty = true; return; }     // drawing on the map
  if (tracer.mode) { dropTracer(tracer.mode, hit.latlon[0], hit.latlon[1]); return; }      // a marble or balloon, not the probe
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
// Phones: the probe is the top page of the sheet (half height, the map above), not a box over the map (iPhone review
// round 2); it goes back into the dock when closed or on a wider screen.
function probeHome(inSheet) {
  const panel = $("panel"), handle = panel.querySelector(".sheet-handle");
  if (inSheet && probeBox.parentElement !== panel) handle.after(probeBox);
  if (!inSheet && probeBox.parentElement === panel) $("dock").prepend(probeBox);
  probeBox.classList.toggle("in-sheet", inSheet);
  sheet?.refresh();
}
function setProbe(k) {
  if (k == null) { probeAt = null; probeBox.hidden = true; probePin.visible = false; probeHome(false); dirty = true; return; }
  const g = manifest.grid, j = Math.floor(k / g.nlon), i = k % g.nlon;
  probeAt = { k, lat: g.lat0 + j * g.dlat, lon: g.lon0 + i * g.dlon };
  probeBox.hidden = false;
  // Narrow screens: fold the panel to its tabs so the probe has room (a tab tap opens it again).
  if (sheet?.active()) { probeHome(true); sheet.set("half"); panelScrollTop(); }      // phones: the probe opens in the sheet
  else if (matchMedia("(max-width: 700px)").matches) $("panel").classList.add("folded");
  probeKey = null;
  updateProbe();
}
$("probeClose").addEventListener("click", () => setProbe(null));
function panelScrollTop() { $("panel").scrollTop = 0; }
$("probeFold").addEventListener("click", () => {
  const f = probeBox.classList.toggle("folded");
  $("probeFold").textContent = f ? "▸" : "▾";
});
$("probeBoth").addEventListener("change", () => { probeKey = null; updateProbe(); });
// phones: both models' meteograms need more model data than the phone's budget holds (it would fetch, drop and fetch again)
if (LITE) { $("probeBoth").disabled = true; $("probeBoth").closest("label").title = "Not on a phone: both models' meteograms need more memory than a phone allows"; }
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
  hemi?.setViewport(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  dirty = true;
}
new ResizeObserver(resize).observe(root);
// The timebar's height varies (marker rows, narrow layouts): whatever sits
// above it (HUD, probe, slice chart) is placed from this.
// Set once now as well: a ResizeObserver only reports when the page renders
// (a background tab never does), and the fallback is shorter than the bar.
// Whichever bar is showing: the forecast's, or the Past year's (the Cases) -- measuring only the
// first one put the colour key behind the Past year bar, where it is hidden (0 px) (fixed 2026-10-09).
const setTb = () => document.documentElement.style.setProperty("--tb", `${Math.max(...[...document.querySelectorAll(".timebar")].map((el) => el.offsetHeight))}px`);
setTb();
{ const ro = new ResizeObserver(setTb); for (const el of document.querySelectorAll(".timebar")) ro.observe(el); }
// On narrow screens the probe fits between the panel and the HUD (both vary):
// their measured bottom / height place it (template CSS, max-width 700px).
const cssVar = (k, px) => document.documentElement.style.setProperty(k, `${Math.round(px)}px`);
new ResizeObserver(() => cssVar("--hud", document.querySelector(".hud").offsetHeight)).observe(document.querySelector(".hud"));
new ResizeObserver(() => { const p = $("panel"); cssVar("--panelb", p.hidden ? 40 : p.offsetTop + p.offsetHeight); }).observe($("panel"));

let last = performance.now();
const fps = { frames: 0, t0: performance.now(), value: 0 };
// Phones, Forecast and Past year: aim the view at the space above the sheet, not the stage's centre behind it (iPhone
// review round 2: "Show me" put features under the sheet). A view offset, like Simulate's, so orbiting still turns
// round the target.
let fcOffKey = null;
function forecastViewOffset() {
  const W = root.clientWidth, H = root.clientHeight;
  if (sim.on) { fcOffKey = null; return; }                       // Simulate frames its own view
  // full view: nothing covers the picture, so no offset
  if (document.body.classList.contains("fullview")) { if (fcOffKey !== "full") { camera.clearViewOffset(); fcOffKey = "full"; dirty = true; } return; }
  // a phone on its side: the side panel covers the right; centre the view in what's left
  if (!sheet?.active() && document.body.classList.contains("short") && $("panel").offsetParent) {
    const dx = Math.round(($("panel").getBoundingClientRect().left - root.getBoundingClientRect().left) / 2 - W / 2), key = `s${W}x${H}:${dx}`;
    if (key !== fcOffKey) { fcOffKey = key; camera.setViewOffset(W, H, -dx, 0, W, H); dirty = true; }
    return;
  }
  if (!sheet?.active()) { if (fcOffKey) { camera.clearViewOffset(); fcOffKey = null; } return; }
  const st = root.getBoundingClientRect(), top = Math.min(...[$("panel"), $("phoneKey")].filter((e) => e.offsetParent && !e.hidden).map((e) => e.getBoundingClientRect().top)) - st.top;
  const hud = document.querySelector(".hud"), y0 = hud?.offsetParent ? hud.getBoundingClientRect().bottom - st.top : 0;
  const dy = Math.round((y0 + top) / 2 - H / 2), key = `${W}x${H}:${dy}`;
  if (key === fcOffKey) return;
  fcOffKey = key; camera.setViewOffset(W, H, 0, -dy, W, H); dirty = true;
}
function frame(now) {
  requestAnimationFrame(frame);
  if (!hemi?.on) derivedAhead();                       // the hidden Pacific view does no work under the hemisphere (review)
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  forecastViewOffset();
  if (flight) {
    // reduced motion (a system setting): camera moves are instant (iPhone review, accessibility)
    const k = REDUCED_MOTION ? 1 : Math.min(1, (now - flight.t0) / flight.ms);
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
  if (timeline.tick(dt, isStepReady)) { if (!timeline.playing) setPlaying(false); applyTime(); }     // loop off: it stopped at the end
  if (controls.update()) dirty = true;
  if (roiLookUp && geo.uniforms.morph.value < 0.5 && camera.position.z < 8) { camera.position.z = 8; dirty = true; }   // never under the ground
  if (!hemi?.on && (Object.values(layers).some((L) => (L.barbsOn || L.flowOn) && L.visible) || (arch.on && arch.windAs !== "particles"))) applyBarbStyle();   // re-space barbs as the zoom changes
  drawFrame(dt, now);
}
// Particles, overlays and the render: everything a frame draws after the
// time is set (also timed directly by __atmos3d.frameCost).
function drawFrame(dt, now = performance.now()) {
  tracerTick(dt);
  if (note.items.length) drawNotes();                  // cheap: rebuilt only when its key changes
  if (sim.on) { simTick(dt, now); dirty = true; }
  // phones move the hemisphere's particles every other frame (review: ~1.3 MB re-uploaded a frame)
  if (hemi?.on && (!LITE || (hemiFrame = (hemiFrame + 1) % 2) === 0) && hemi.tickParticles(LITE ? dt * 2 : dt)) dirty = true;
  if (hemi?.on && tickHemiProjection(now)) dirty = true;
  if (p3.on && pvol) { const f = p3Field(); if (f) { pvol.update(dt, f); dirty = true; } }
  if (arch.particles?.tickFade(dt)) dirty = true;
  for (const L of Object.values(layers)) if (L.particles?.tickFade(dt)) dirty = true;
  if (!hemi?.on && arch.on && arch.particles?.object.visible && arch.windField) { arch.particles.update(dt, arch.windField); dirty = true; }
  for (const L of Object.values(layers)) {
    if (hemi?.on || !L.particles || !L.particles.object.visible || !L.current) continue;
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
  if (hemi) hemi.placeLabels(camera, root.clientWidth, root.clientHeight);
  renderer.render(hemi?.on ? hemi.scene : scene, camera);
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
    if (!r.width) continue;                                  // hidden (phones keep only "now")
    let row = 0;
    while ((rows[row] ?? []).some(([l, rr]) => r.left < rr + 4 && r.right > l - 4)) row++;
    (rows[row] ??= []).push([r.left, r.right]);
    b.style.top = `${row * 0.8}rem`;
  }
  const n = Math.max(1, rows.length);
  $("timeMarks").parentElement.style.paddingTop = `${0.25 + n * 0.8}rem`;
  for (const i of box.querySelectorAll(".mark i")) i.style.top = `${0.05 + n * 0.8}rem`;
  drawDays();
}
// The days under the slider, in your time zone or UTC (the button beside the speed menu switches; kept on
// this device). timeinfo.js dayMarks finds each midnight.
let dayZone = "local";
try { if (localStorage.getItem("np3d.tz") === "utc") dayZone = "utc"; } catch { /* ignore */ }
function drawDays() {
  const box = $("timeDays"), span = timeline.end - timeline.start, pct = (h) => `${((h - timeline.start) / span) * 100}%`;
  const { bounds, days } = dayMarks(Date.parse(manifest.anchor), timeline.start, timeline.end, dayZone === "utc" ? "UTC" : undefined);
  box.innerHTML = bounds.map((h) => `<span class="dayline" style="left:${pct(h)}"></span>`).join("")
    + days.map((d) => `<span class="day" style="left:${pct((d.h0 + d.h1) / 2)}" data-full="${d.label}">${d.label}</span>`).join("");
  // As much of each name as fits, judged from where the labels really land: "Tue 29", then "29", then every other one.
  const labels = [...box.querySelectorAll(".day")];
  const clash = () => labels.some((el, i) => i && !el.hidden && !labels[i - 1].hidden && el.getBoundingClientRect().left < labels[i - 1].getBoundingClientRect().right + 3);
  if (clash()) for (const el of labels) el.textContent = el.dataset.full.split(" ")[1];
  if (clash()) labels.forEach((el, i) => { el.hidden = i % 2 === 1; });
  $("tzBtn").textContent = dayZone === "utc" ? "UTC" : "local";
}
new ResizeObserver(() => { drawDays(); drawNights(null, null, true); }).observe($("timeDays"));
// The day/night strip (BUILD_SPEC §7; done 2026-10-09): night at the centre of the view, shaded just
// under the slider; redrawn when the centre moves 2° or more.
let nightAt = null;
function drawNights(lat, lon, force = false) {
  if (lat == null) { if (!nightAt) return; [lat, lon] = nightAt; }
  const lonE = ((lon % 360) + 360) % 360;
  if (!force && nightAt && Math.abs(nightAt[0] - lat) < 2 && Math.abs((((nightAt[1] - lonE) % 360) + 540) % 360 - 180) < 2) return;
  nightAt = [lat, lonE];
  const box = $("timeNights"), span = timeline.end - timeline.start, sl = $("timeSlider");
  box.style.top = `${sl.offsetTop + sl.offsetHeight - 1}px`;
  const where = `${Math.abs(lat).toFixed(0)}°${lat >= 0 ? "N" : "S"} ${(lonE > 180 ? 360 - lonE : lonE).toFixed(0)}°${lonE > 180 ? "W" : "E"}`;
  box.title = `Night (the Sun below the horizon) at ${where}, the centre of the view`;
  box.innerHTML = nightSpans(Date.parse(manifest.anchor), timeline.start, timeline.end, lat, lonE)
    .map(([a, b]) => `<span style="left:${((a - timeline.start) / span) * 100}%;width:${((b - a) / span) * 100}%"></span>`).join("");
}
$("tzBtn").addEventListener("click", () => {
  dayZone = dayZone === "utc" ? "local" : "utc";
  try { localStorage.setItem("np3d.tz", dayZone); } catch { /* ignore */ }
  drawDays();
});
drawMarkers();
// What Play does at the end (user requests 2026-10-09): loop the whole timeline (the default), loop only
// the satellite's hours, or stop. Remembered on this device (satellite hours apart: a question can set it for a while).
function satHours() { return sat ? sat.frames.map((f) => hoursFrom(manifest.anchor, f.time)) : []; }
function setLoop(v, start, remember = true) {
  const satH = satHours();
  if (v === "sat" && !satH.length) v = "all";
  $("loopSel").value = v;
  timeline.repeat = v !== "off";
  timeline.loop = v === "sat" ? { start: Math.min(...satH), end: Math.max(...satH) } : null;
  if (v === "sat" && start) { openNote = null; if (!timeline.playing) setPlaying(true); }
  if (remember) try { localStorage.setItem("np3d.loop", v); } catch { /* ignore */ }
  dirty = true;
}
{
  if (satHours().length) $("loopSatOpt").hidden = false;
  let saved = "all";
  try { saved = localStorage.getItem("np3d.loop") ?? "all"; } catch { /* ignore */ }
  setLoop(saved === "sat" ? "all" : saved, false);        // satellite hours isn't restored: it would hide the forecast on opening
  $("loopSel").addEventListener("change", (e) => { loopBeforeQ = null; setLoop(e.target.value, true); });
}
{
  // Local time first, UTC in brackets (user request 2026-10-09); model runs keep their UTC names (18Z).
  const both = (ms) => { const l = fmtLocal(ms); return l ? `${l} (${fmtUtcShort(ms)})` : fmtUtc(ms); };
  const parts = [`Built ${both(Date.parse(manifest.generated_at))}`];
  for (const m of manifest.models) {
    const i = manifest.inits?.[m];
    parts.push(`${MODEL_LABEL[m] ?? m} run ${i ? runTag(i) : "unavailable"}`);
  }
  if (sat) { const t = Date.parse(sat.frames[sat.frames.length - 1].time), l = fmtLocal(t); parts.push(`satellite to ${l ? `${l.split(", ").pop()} (${fmtUtcShort(t).split(", ").pop()})` : `${sat.frames[sat.frames.length - 1].time.slice(11, 16)} UTC`}`); }
  parts.push(`now ${fmtLocal(NOW_MS) ?? fmtUtc(NOW_MS)} (this device's clock)`);
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
    // a step being worked on ahead (derivedAhead) is finished now; otherwise done all at once
    const job = derivedJobs.get(key);
    let r; if (job) { do r = job.next(); while (!r.done); derivedJobs.delete(key); }
    derivedCache.set(key, job ? r.value : withDerived(data, manifest.grid));
    if (derivedCache.size > 8) derivedCache.delete(derivedCache.keys().next().value);
  }
  return derivedCache.get(key);
}
const derivedCache = new Map(), derivedJobs = new Map();
// Working ahead (user report 2026-10-15: "3d play is a little jumpy"): while a 3-D view is on, the next two model steps'
// derived quantities are computed a level at a time, a few milliseconds per frame, so Play reaching a new step finds
// them ready instead of stalling a frame for 47–67 ms.
function derivedAhead(budgetMs = 6) {
  if (!(sec.on || vol.on || p3.on || hp.on || fl3.on) || arch.on || sim.on || timeline.beforeModel || timeline.afterModel) return;
  const t0 = performance.now(), { i1 } = timeline.segment();
  for (const lead of [leads[i1], leads[i1 + 1], leads[i1 + 2]]) {
    if (lead == null) continue;
    const key = `${model}:${lead}`;
    if (derivedCache.has(key)) continue;
    let job = derivedJobs.get(key);
    if (!job) {
      const data = { sfc: loader.ready(model, lead, "sfc"), levels: {} };
      const missing = ["sfc", ...manifest.levels.map((p) => `p${p}`)].filter((bn) => !loader.ready(model, lead, bn));
      if (missing.length) { for (const bn of missing) whenLoaded(model, lead, bn, "ahead", () => {}); continue; }   // fetch it; work on it once here
      for (const p of manifest.levels) data.levels[p] = loader.ready(model, lead, `p${p}`);
      job = withDerived(data, manifest.grid, { steps: true }); derivedJobs.set(key, job);
    }
    while (performance.now() - t0 < budgetMs) {
      const r = job.next();
      if (r.done) { derivedJobs.delete(key); derivedCache.set(key, r.value); if (derivedCache.size > 8) derivedCache.delete(derivedCache.keys().next().value); break; }
    }
    if (performance.now() - t0 >= budgetMs) return;
  }
  // with the volume on, the next step's block too (about 20 ms, once per step, on a frame with time to spare)
  if (vol.on && performance.now() - t0 < 1 && leads[i1 + 1] != null && derivedCache.has(`${model}:${leads[i1 + 1]}`)) volumeBytes(leads[i1 + 1]);
}
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
    volume.setPair(a, b);
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
  for (const L of Object.values(layers)) L.gl.uniforms.lineColor.value.set(opcShown ? OPC_CMP_COLOR : lineColorOf(L.def.key));     // light over the satellite
  dirty = true;
}
function setOpcProduct(p) {
  opcProduct = CHART_ALIAS[p] ?? p;
  $("opcSel").value = p;
  $("chartsBtn").classList.toggle("on", !!p);
  // on a phone, a chart switched on (by a question or the menu) brings its row up, so ◀ ▶ are at hand
  // (and a row it opened by itself goes again when the next question has no chart)
  if (p && (sheet?.active() || document.body.classList.contains("short")) && !$("chartsBtn").closest(".timebar").classList.contains("charts")) { chartsRow(true); chartsAuto = true; }
  else if (!p && chartsAuto) { chartsRow(false); chartsAuto = false; }
  drawMarkers(); updateOpc(); updateHud();
}
function opcJump(dir) {
  if (!opcProduct) setOpcProduct("surface_analysis");
  const h = opcNeighbour(OPC.charts, opcProduct, timeline.pos, manifest.anchor, dir);
  if (h == null) return;
  openNote = null; setPlaying(false);
  timeline.pos = timeline.clamp(h); requestAround(); applyTime();
}
let chartsAuto = false;           // the chart row was opened by a question, not by the 📋 button
function chartsRow(on) {
  const tb = $("chartsBtn").closest(".timebar");
  tb.classList.toggle("charts", on);
  $("chartsBtn").setAttribute("aria-expanded", String(on));
}
if (OPC) {
  $("opcNav").hidden = false; $("opcGroup").hidden = false; $("chartsBtn").hidden = false;
  $("chartsBtn").addEventListener("click", () => { chartsAuto = false; chartsRow(!$("chartsBtn").closest(".timebar").classList.contains("charts")); });
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
  cv.onpointermove = cv.onpointerdown = (e) => {
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
  // phones keep only nearby satellite frames: wait for the one this frame shows, not all of them (they never all load)
  if (LITE) { const hs = Math.min(pos, SAT_END_H); if (sat && satOn && pos <= SAT_END_H + 3) { sat.loadNear(hs, 1, () => {}); for (let n = 0; !sat.textureAt(hs) && n < 50; n++) await new Promise((r) => setTimeout(r, 100)); } }
  else for (let n = 0; sat && satOn && sat.loaded < sat.frames.length && n < 100; n++) await new Promise((r) => setTimeout(r, 100));
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
  if (fcOffKey) { camera.clearViewOffset(); fcOffKey = null; }       // pictures and films framed on the whole view, not the phone's sheet offset
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
    else { const how = await saveBlob(blob, name); note(`${how === "shared" ? "Shared" : "Saved"} ${name} (${(blob.size / 1e6).toFixed(1)} MB, ${W} × ${H}).`); }
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
// the tab row's right-edge fade (phones): on while tabs are hidden past its right edge
function tabsFade() {
  const t = document.querySelector(".tabs");
  if (t) t.classList.toggle("more-right", t.scrollWidth - t.clientWidth - t.scrollLeft > 4);
}
document.querySelector(".tabs")?.addEventListener("scroll", tabsFade, { passive: true });
addEventListener("resize", tabsFade);
setTimeout(tabsFade, 0);
function showTab(name) {
  for (const b of document.querySelectorAll(".tabs button")) { b.classList.toggle("on", b.dataset.tab === name); b.setAttribute("role", "tab"); b.setAttribute("aria-selected", String(b.dataset.tab === name)); }
  for (const s of document.querySelectorAll("section.tab")) s.hidden = s.dataset.tab !== name;
  tabsFade();
  try { localStorage.setItem("np3d.tab", name); } catch { /* private mode etc. */ }
  dirty = true;
}
// Tapping the open tab again folds the panel to just its tabs (so the map
// shows on a small screen); any tab opens it again.
for (const b of document.querySelectorAll(".tabs button")) b.addEventListener("click", () => {
  const panel = $("panel");
  // phones: the open tab again lowers the sheet; another tab raises it if it's down
  if (sheet?.active()) { if (b.classList.contains("on")) { sheet.set(sheet.get() === "peek" ? "half" : "peek"); return; } if (sheet.get() === "peek") sheet.set("half"); }
  else if (b.classList.contains("on") && !panel.classList.contains("folded")) { panel.classList.add("folded"); dirty = true; return; }
  panel.classList.remove("folded");
  showTab(b.dataset.tab);
});
{
  let saved = null;
  try { saved = localStorage.getItem("np3d.tab"); } catch { /* ignore */ }
  // A plain visit (the site's address, no view in the link) opens on Explore (user request 2026-10-16); a link or a reload
  // that carries a view keeps the tab last used. Only a tab the page opens with (not a mode's own tab: the Past year's
  // or Simulate's, which open in their mode).
  const plain = location.hash.length <= 1;
  showTab(!plain && document.querySelector(`.tabs button[data-tab="${saved}"]:not([hidden])`) ? saved : "explore");
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
  if (!arch.on && lessonMarks) return Math.abs(timeline.pos - lessonMarks.h) <= 3 ? lessonMarks.marks : [];
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
  // the hemisphere has its own labels (hemiview.js): the Pacific map's cities, grid lines and highs and lows stay off it
  const items = hemi?.on ? [] : sim.on ? group(3, sim.scene.labelItems(camera, W, H, free, simViewLon())) : [
    ...group(-1, noteItems(W, H)),
    ...group(-1, tracerItems(W, H)),        // what you dropped first: H/L labels shown last frame otherwise kept the far end of a traced path off (2026-10-09)
    ...group(-1, caseMarkItems(W, H)),     // a case's or lesson's marks: what the text is about, ahead of the map's own labels
    ...group(-1, hrrrStationItems(W, H)),  // the stations' measurements at the 3 km model's hour
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
  if (c) drawNights(c.latlon[0], c.latlon[1]);
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
  if (hemi?.on && hemi.src.kind === "archive") nhArchiveSource().then((src) => { if (src && hemi.on) { hemi.setSource(src); hemiApply(true); } });
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
// A pattern's composite (composite.js): the mean of its days' fields, each day fetched like any other. Shown in place
// of a day until the day changes.
function archDayByDate(date) {
  const d = [...YEAR_DAYS, ...ARCH_EVENTS.flatMap((e) => e.days)].find((x) => x.date === date);
  if (!d) return Promise.resolve(null);
  const n = ARCH.grid.nlat * ARCH.grid.nlon, v = buildVersion(manifest);
  return fetchU16(`${DATA}/${d.file}${v}`).then((codes) => dequantize(codes, d.fields, n)).catch(() => null);
}
function showComposite(key) {
  const C = COMPOSITES[key];
  const dates = C.days.map(([date]) => date).filter((date) => ALL_ARCH_DATES.includes(date));
  if (dates.length < 3) return;
  if (caseState.c) closeCase();
  if (!arch.on) enterArchive();
  else if (archEvent) { setArchDays(null); archGo(ARCH_DAYS.length - 1); }
  archPlay(false);
  $("yearView").value = C.view; $("yearMode").value = ARCH.anomalies ? C.mode : "actual";
  arch.view = C.view; arch.mode = $("yearMode").value;
  arch.comp = { key, n: dates.length, p: Promise.all(dates.map(archDayByDate)).then(compositeFields) };
  caseLook(C.camera);
  archShow(); if (probeAt) archProbe();
}
const archMode = () => (arch.mode === "anomaly" && ARCH.anomalies && ARCHIVE_VIEWS[arch.view].anomaly ? "anomaly" : "actual");
const archLinesKind = () => (arch.lines === "auto" ? ARCHIVE_VIEWS[arch.view].lines : arch.lines);
async function archShow() {
  if (hemi?.on && hemi.src.kind === "archive") hemiApply();           // the hemisphere follows the day
  const i = arch.i, comp = arch.comp, f = comp ? await comp.p : await archDay(i);
  if (!arch.on || i !== arch.i || comp !== arch.comp) return;
  const d = comp ? { date: `composite:${comp.key}` } : ARCH_DAYS[i];
  $("yearSlider").value = String(i);
  $("yearDate").classList.toggle("comp", !!comp);
  $("yearDate").textContent = comp ? `Composite: ${PATTERNS[comp.key].label}, the average of ${comp.n} real days (not a day that happened; move the slider to leave it)`
    : `${new Date(`${d.date}T00:00:00Z`).toUTCString().slice(0, 16)} · ${archEvent ? `event archive, day ${i + 1} of ${ARCH_DAYS.length}` : `day ${i + 1} of ${ARCH_DAYS.length}`}`;
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
  // a case step may stretch the colours over its own range (only for the view it set, and not for anomalies)
  const sk = arch.range && arch.rangeView === arch.view && archMode() === "actual" ? rangedScale(fill.scaleKey, ...arch.range) : fill.scaleKey;
  gl.setFill(sk, SCALES[sk]);
  gl.visible = true;
  if (arch.scaleKey !== sk) { arch.scaleKey = sk; updateLegend(); }
  arch.cur = { fill, lines, date: d.date, fields: f };
  archWind();
  if (!comp) for (const j of [i + 1, i + 2, i + 3]) archDay(j);           // read ahead for Play
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
    if (!arch.flow) { arch.flow = new FlowLayer(ARCH.grid, geo, { lift: 19, renderOrder: 14, width: 1.1 }); arch.flow.setViewport(W, H); scene.add(arch.flow.object); arch.flow.gapCells = Math.max(2, Math.round(flowGap() / 2)); }
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
  if (arch.particles) arch.particles.setShown(!!w && arch.windAs === "particles");
  dirty = true;
}
function archHud() {
  const d = ARCH_DAYS[arch.i];
  if (!d) return;
  // Calendar days between the build's date and the analysis's (not hours: a
  // 00 UTC analysis is "today" all day).
  const ago = Math.round((Date.parse(`${String(manifest.generated_at ?? manifest.anchor).slice(0, 10)}T00:00:00Z`) - Date.parse(`${d.date}T00:00:00Z`)) / 86400e3);
  { const u = `${d.date.slice(8, 10)} ${new Date(`${d.date}T00:00:00Z`).toUTCString().slice(8, 16)} 00:00 UTC`; setHudTime(Date.parse(`${d.date}T00:00:00Z`), u, u); }
  $("hudLead").textContent = ago <= 0 ? "today" : ago === 1 ? "yesterday" : `${ago} days ago`;
  $("hudRun").textContent = archEvent ? "GFS analysis · event archive" : "GFS analysis · the past year";
  const m = archMode(), v = ARCHIVE_VIEWS[arch.view];
  const notes = [...(openNote ? [openNote] : []), archEvent
    ? `event archive: one real GFS 00 UTC analysis per day, ${archEvent.from} to ${archEvent.to}, kept for a case study; days are never blended`
    : `past year: one real GFS 00 UTC analysis per day (${ARCH_DAYS.length} of ${ARCH_DAYS.length + (ARCH.missing ?? 0)} days); days are never blended`];
  const lv = archWindLevel();
  if (lv) notes.push(arch.comp ? `${ARCHIVE_WIND_LEVELS[lv]} wind averaged over the days (gusty, opposite winds cancel: the average is calmer than any day)`
    : `${ARCHIVE_WIND_LEVELS[lv]} wind as ${arch.windAs === "flow" ? "flow lines" : arch.windAs === "barbs" ? "barbs" : "particles drifting through that moment's wind"} (00 UTC, one moment of the day)`);
  if (m === "anomaly") notes.push(`${v.label} minus its 1991–2020 average for the date (${arch.view === "ssto" ? "OISST's own 1991–2020 climatology: observed minus observed" : arch.view === "sst" ? "NOAA OISST climatology" : "NCEP/NCAR reanalysis, 00 UTC"})`);
  else if (arch.mode === "anomaly") notes.push(`no anomaly for ${v.label}: showing the value`);
  if (v.obs && !d.obs) notes.push("no observed sea temperature for this day yet: OISST is published about a day after the models");
  else if (v.obs && !d.obs.final) notes.push("observed sea temperature: NOAA's preliminary version for this day (the final one replaces it about three weeks on)");
  if (hr.on && hr.cur) {
    setHudTime(hr.cur.t);
    $("hudRun").textContent = hr.obs ? `${hr.obs === "radar" ? "MRMS radar mosaic" : "GOES-West satellite"} · observed · over the GFS map of ${d.date}` : `${HIRES[hr.region].hud} · over the GFS map of ${d.date}`;
    notes.unshift(`${HIRES[hr.region].short} (${HIRES[hr.region].src}): one real hourly analysis, ${hr.i + 1} of ${hr.frames.length} hours in this step, shown over the 1° daily map; hours are never blended`);
  }
  // a composite is no day: say what it is, and which days made it, instead of the slider's date
  if (arch.comp) {
    const C = COMPOSITES[arch.comp.key];
    $("hudValid").textContent = `Composite: ${PATTERNS[arch.comp.key].label}`;
    $("hudLead").textContent = `average of ${arch.comp.n} days`;
    $("hudRun").textContent = "GFS analyses, averaged · not a day that happened";
    notes.splice(0, notes.length, `composite: the mean of ${arch.comp.n} real GFS 00 UTC analyses, one per event (${C.days.map(([date]) => date).filter((date) => ALL_ARCH_DATES.includes(date)).join(", ")}), point by point`,
      ...notes.filter((x) => !x.startsWith("past year:") && !x.startsWith("event archive:") && !x.startsWith("no observed") && !x.startsWith("observed sea")));
  }
  const badge = $("hudInterp");
  badge.hidden = false; badge.textContent = notes.join(" · "); badge.title = badge.textContent;
}
function archReadout() {
  const { lat, lon } = hover, k = archiveIndex(ARCH.grid, lat, lon);
  const latTxt = lat < 0 ? `${(-lat).toFixed(1)}°S` : `${lat.toFixed(1)}°N`, lonTxt = lon > 180 ? `${(360 - lon).toFixed(1)}°W` : `${lon.toFixed(1)}°E`;
  if (k < 0 || !arch.cur) { tip.hidden = true; return; }
  const { fill, lines, date } = arch.cur, v = fill.f[k], s = SCALES[fill.scaleKey];
  const rows = [`<b>${latTxt} ${lonTxt}</b> <span class="muted">${arch.comp ? `composite of ${arch.comp.n} GFS analyses (an average)` : `GFS analysis ${date} 00 UTC`}</span>`];
  const signed = archMode() === "anomaly";
  const txt = fill.scaleKey === "hs" ? fmtWave(v, waveUnit) : `${signed && v > 0 ? "+" : ""}${v.toFixed(Math.abs(v) >= 100 ? 0 : 1)} ${s.units}`;
  rows.push(Number.isFinite(v) && v > SEA_MISSING + 1 ? `${s.label}: ${txt}` : `${s.label}: none here`);
  if (lines) rows.push(`<span class="muted">${archLinesKind() === "isobars" ? `sea-level pressure ${lines.c[k].toFixed(1)} hPa` : `500 mb height ${Math.round(lines.c[k])} m`}</span>`);
  const lv = archWindLevel(), w = lv ? archiveWind(lv, arch.cur.fields) : null;
  if (w) rows.push(`${ARCHIVE_WIND_LEVELS[lv]} wind: ${windText(w.u[k], w.v[k])}`);
  const hk = hr.on && hr.cur ? hrrrIndex(hr.index.grid, lat, lon) : -1;
  if (hk >= 0 && Number.isFinite(hr.cur.fields.u10?.[hk])) {
    const f = hr.cur.fields, V = HRRR_VIEWS[hr.view], hv = V.value(f, hk), src = HIRES[hr.region];
    rows.unshift(`<b>${src.short[0].toUpperCase() + src.short.slice(1)}</b> <span class="muted">${src.src} ${fmtObsTime(hr.cur.t)}</span><br>${V.label}: ${Number.isFinite(hv) ? `${hv.toFixed(V.units === "hPa" || Math.abs(hv) >= 100 ? 0 : 1)} ${V.units}` : "none"}`
      + ` · wind ${windText(f.u10[hk], f.v10[hk])}, gusts ${Math.round(f.gust[hk] * 1.94384)} kt · ${(f.t2m[hk] - 273.15).toFixed(1)}°C${f.mslp ? ` · ${(f.mslp[hk] / 100).toFixed(1)} hPa` : ""}`);
  }
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
  const days = ARCH_DAYS;            // a case step can swap in an event's days mid-load: then this load is stale
  for (let j = 0; j < days.length; j++) {
    if (token !== arch.seriesToken || !arch.on || ARCH_DAYS !== days) return;
    const f = await archDay(j, !!ARCHIVE_VIEWS[view].obs);
    if (ARCH_DAYS !== days) return;
    if (f) { const one = {}; for (const [name, a] of Object.entries(f)) one[name] = a.subarray(k, k + 1); got.set(days[j].date, one); }
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
function archGo(i) { openNote = null; arch.comp = null; arch.i = Math.max(0, Math.min(ARCH_DAYS.length - 1, i)); archShow(); }
function archStep(d) { archPlay(false); archGo(arch.i + d); }
function archPlay(on) {
  if (arch.playing) { clearTimeout(arch.playing); arch.playing = null; }
  $("yearPlay").innerHTML = on ? `<span aria-hidden="true">❚❚</span><span class="pl"> Pause</span>` : `<span aria-hidden="true">▶</span><span class="pl"> Play</span>`;
  $("yearPlay").setAttribute("aria-label", on ? "Pause" : "Play");
  if (!on) return;
  const tick = async () => {
    if (arch.i >= ARCH_DAYS.length - 1) { archPlay(false); return; }
    arch.i++;
    await archShow();
    if (arch.playing) arch.playing = setTimeout(tick, 1000 / Number($("yearSpeed").value));
  };
  if (arch.i >= ARCH_DAYS.length - 1) arch.i = -1;
  arch.comp = null;
  arch.playing = setTimeout(tick, 0);
}
function enterArchive() {
  if (hemi?.on) exitHemisphere(true);
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
  arch.i = ARCH_DAYS.length - 1; arch.comp = null;
  archShow();
}
// The panel in each mode: the forecast-only tabs (levels, slice, map,
// share) and the model choice step aside in the Past year; its "Show" tab
// takes their place (user request, 2026-09-29: the archive was hidden
// behind a button).
const FORECAST_TABS = ["drop", "layers", "slice", "map"];
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
  arch.i = Math.max(0, archiveStartDay(ARCH_DAYS, q.start)); arch.comp = null;
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
  if (hemi?.on && hemi.src.kind === "archive") exitHemisphere(true);
  if (hr.on) hrrrOff();
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
  else if (b.dataset.mode === "sim") simData().then(() => { b.textContent = "Simulate"; enterSim(); }, () => { b.title = "Couldn't load the simulator (offline?). Try again."; b.textContent = "Simulate (retry)"; });
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
  if (hemi?.on) exitHemisphere();
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
  document.body.classList.add("simmode"); $("simStrip").hidden = false;
  setTimeout(() => { sheetBase(); sheet?.refresh(); }, 0);
  // the disclaimer for this mode (panel review: the forecast's disclaimers are hidden here)
  const sub = document.querySelector(".masthead h1 .sub"); if (sub) { sub.dataset.forecast ??= sub.textContent; sub.textContent = "Simulate: a model planet for learning, not the real weather"; }
  syncSimControls(); updateLegend(); drawSimChart(); simHud(); simStrip();
  dirty = true;
}
function exitSim() {
  if (!sim.on) return;
  sim.on = false;
  sim.worker?.postMessage({ type: "stop" }); sim.pew?.postMessage({ type: "stop" });
  camera.layers.set(0);
  camera.clearViewOffset(); sim.offKey = null;
  $("simChart").hidden = true;
  document.body.classList.remove("simmode"); $("simStrip").hidden = true; $("simKey").hidden = true;
  setTimeout(() => { sheetBase(); sheet?.refresh(); }, 0);
  { const sub = document.querySelector(".masthead h1 .sub"); if (sub?.dataset.forecast) sub.textContent = sub.dataset.forecast; }
  try { if (/[#&]sim=/.test(location.hash)) history.replaceState(null, "", location.pathname); } catch { /* ignore */ }
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
// ---- the Simulate page (docs/sim_lesson_design.md G2, G3, G6; 2026-10-10) ------------------------
// The free rectangle the 3-D view has (between the panel, the strip and the docked chart), stage px.
function simFree() {
  const st = root.getBoundingClientRect(), W = root.clientWidth, H = root.clientHeight, narrow = W <= 860;
  const chartH = Math.round(document.body.classList.contains("short") ? Math.max(110, Math.min(170, H * 0.36)) : narrow ? Math.max(140, Math.min(220, H * 0.28)) : Math.max(170, Math.min(320, H * (sim.model === "3d" ? 0.32 : 0.45))));
  if (sim.chartH !== chartH) { sim.chartH = chartH; root.parentElement.style.setProperty("--simChartH", `${chartH}px`); }
  const panel = $("panel"), strip = $("simStrip");
  const sb = strip.offsetParent ? Math.round(strip.getBoundingClientRect().bottom - st.top) : 0;
  if (sim.stripB !== sb) { sim.stripB = sb; root.parentElement.style.setProperty("--simStripB", `${sb}px`); }
  if (document.body.classList.contains("fullview")) return { x: 0, y: 0, w: W, h: H };     // full view: all of it
  // phone: the globe sits between the strip and whichever is higher, the docked chart or the sheet
  if (sheet?.active()) {
    const chart = $("simChart"), tops = [panel.getBoundingClientRect().top];
    if (!chart.hidden && chart.offsetParent) tops.push(chart.getBoundingClientRect().top);
    const bottom = Math.min(...tops) - st.top - 6;
    return { x: 0, y: sb + 6, w: W, h: Math.max(80, bottom - sb - 6) };
  }
  // short (a phone on its side): the panel is a side sheet on the right
  if (document.body.classList.contains("short") && panel.offsetParent) {
    const right = panel.getBoundingClientRect().left - st.left - 6, chart = $("simChart");
    const bottom = !chart.hidden && chart.offsetParent ? chart.getBoundingClientRect().top - st.top - 6 : H;
    return { x: 0, y: sb + 6, w: Math.max(80, right), h: Math.max(60, bottom - sb - 6) };
  }
  // narrow: the panel is above the globe (full width), not beside it
  const left = narrow || !panel.offsetParent ? 0 : panel.getBoundingClientRect().right - st.left + 8;
  const top = narrow && panel.offsetParent ? panel.getBoundingClientRect().bottom - st.top + 6 : strip.offsetParent ? sb + 6 : 0;
  const bottom = $("simChart").hidden ? H : H - chartH - 18;
  return { x: left, y: top, w: Math.max(80, W - left - 8), h: Math.max(80, bottom - top) };
}
// The globe centred in the free rectangle (a view offset, so the controls still orbit the Earth's centre).
function simViewOffset() {
  const W = root.clientWidth, H = root.clientHeight, f = simFree();
  const dx = Math.round(f.x + f.w / 2 - W / 2), dy = Math.round(f.y + f.h / 2 - H / 2), key = `${W}x${H}:${dx},${dy}`;
  if (key === sim.offKey) return;
  sim.offKey = key;
  camera.setViewOffset(W, H, -dx, -dy, W, H);
}
// Camera presets (G3): a lat/lon to look at, the globe or the flat map, and how much to show. On the globe
// the distance makes the planet with its stretched air fill 0.44 of the free rectangle's shorter side.
const SIM_CAMERAS = {
  cutaway: { lat: 0, lonOff: 0, globe: true, fill: 0.44 },
  "globe-tilted": { lat: 25, lon: 190, globe: true, fill: 0.44 },
  "npac-globe": { lat: 40, lon: 185, globe: true, fill: 0.52 },
  "pac-map": { lat: 17, lon: 190, globe: false, span: 95 },
  "world-map": { lat: 2, lon: 180, globe: false, span: 145 },
  "equator-map": { lat: 0, lon: 170, globe: false, span: 60 },
  "asia-map": { lat: 20, lon: 110, globe: false, span: 85 },
};
function simCamera(name) {
  const c = SIM_CAMERAS[name] ?? SIM_CAMERAS["globe-tilted"], f = simFree(), H = root.clientHeight;
  sim.cameraName = name;
  if (!c.globe) { setView("domain"); caseLook({ lat: c.lat, lon: c.lon, span: c.span, tilt: 0 }); return; }
  if (geo.uniforms.morph.value < 0.99) setView("globe");
  const Rg = R_KM * (1 + (16 * sim.vex) / R_KM), k = (c.fill * Math.min(f.w, f.h)) / (H / 2) * Math.tan((22.5 * Math.PI) / 180);
  const dist = Rg * Math.sqrt(1 + 1 / (k * k));
  const lon = c.lonOff != null ? geo.center[1] + c.lonOff : c.lon;
  const C = new THREE.Vector3(0, 0, -R_KM), dir = geo.point(c.lat, lon, 0).sub(C).normalize();
  flight = { from: { pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov }, to: { pos: C.clone().addScaledVector(dir, dist), target: C, fov: 45 }, t0: performance.now(), ms: 800 };
  dirty = true;
}
// Live numbers for the strip (G6): each step names one. ctx: the 2-D diagnostics (d) or the 3-D state (m, with its belts and cells).
const SIM_METRICS = {
  contrast: { label: "Equator − pole", unit: "K", get: (c) => c.d?.contrastK },
  hadleyN: { label: "Hadley edge", unit: "°N", get: (c) => (c.d ? c.d.north.edge : c.cells?.hadleyN) },
  jetN: { label: "Jet", unit: "m/s", get: (c) => (c.d ? c.d.jetN.u : c.cells?.jetN) },
  jetLatN: { label: "Jet at", unit: "°N", get: (c) => (c.d ? c.d.jetN.lat : c.cells?.jetLatN) },
  tradesN: { label: "Trades", unit: "m/s", get: (c) => (c.d ? -c.d.tradesN : c.belts ? -c.belts.tradesN : NaN) },
  itcz: { label: "ITCZ", unit: "°", get: (c) => c.d?.itcz },
  vmax: { label: "Poleward wind aloft", unit: "m/s", get: (c) => c.vmax },
  push500: { label: "500 hPa surface, equator − pole", unit: "m", get: (c) => c.push500 },
  eke: { label: "Storm energy", unit: "m²/s²", get: (c) => c.m?.eke },
  westN: { label: "Surface westerlies", unit: "m/s", get: (c) => c.belts?.westN },
  psRange: { label: "Pressure range", unit: "hPa", get: (c) => (c.m ? c.m.psMax - c.m.psMin : NaN) },
  sea: { label: "Sea: warm pool − east Pacific", unit: "K", get: (c) => c.sea },
  soi: { label: "Pressure: east Pacific − Indonesia", unit: "hPa", get: (c) => c.soi },
  riseLon: { label: "Pacific rising air centred at", unit: "°E", get: (c) => c.riseLon },
  eqTrades: { label: "Equatorial trades", unit: "m/s", get: (c) => c.eqTrades },
  upperEast: { label: "Wind from the west aloft, east Pacific", unit: "m/s", get: (c) => c.upperEast },
  aleutian: { label: "Aleutian low", unit: "hPa", get: (c) => c.aleutian },
  siberian: { label: "Siberian high", unit: "hPa", get: (c) => c.siberian },
  pacHigh: { label: "Pacific high", unit: "hPa", get: (c) => c.pacHigh },
  eaJet: { label: "Jet core, 30-day mean", unit: "m/s", get: (c) => c.eaJet },
  asiaPacT: { label: "Asia − N Pacific, near the ground", unit: "K", get: (c) => c.asiaPacT },
  asiaPacPs: { label: "Pressure: Asia − N Pacific", unit: "hPa", get: (c) => c.asiaPacPs },
  monsoonPs: { label: "Pressure: S Asia − Pacific", unit: "hPa", get: (c) => c.monsoonPs },
  rainGlobal: { label: "Rain, whole Earth", unit: "mm/day", get: (c) => c.rainGlobal },
  itczEP: { label: "East Pacific ITCZ at", unit: "°N", get: (c) => c.itczEP },
  hadleyPsi: { label: "Hadley cell strength", unit: "×10¹⁰ kg/s", get: (c) => c.hadleyPsi },
  heatFlux: { label: "Storms' heat flux poleward", unit: "K m/s", get: (c) => c.heatFlux },
  crossAngle: { label: "Wind crosses the isobars by", unit: "°", get: (c) => c.crossAngle },
  rainSAsia: { label: "Rain, South and Southeast Asia", unit: "mm/day", get: (c) => c.rainSAsia },
  rainWarmPool: { label: "Rain over the warm pool", unit: "mm/day", get: (c) => c.rainWarmPool },
  rainColdTongue: { label: "Rain over the east Pacific equator", unit: "mm/day", get: (c) => c.rainColdTongue },
};
// The 3-D model's cells and jet from its 30-day means (meanPsi at mid-level, meanU at the second level).
function peCells(m) {
  const { L, nlat, lat } = m, k = Math.floor(L / 2), psi = m.meanPsi, u = m.meanU;
  let hm = 0, hl = 0;
  for (let j = 0; j < nlat; j++) { const v = psi[k * nlat + j]; if (lat[j] > 0 && lat[j] < 40 && Math.abs(v) > Math.abs(hm)) { hm = v; hl = lat[j]; } }
  let edge = NaN;
  for (let j = 0; j < nlat; j++) if (lat[j] > hl && Math.sign(psi[k * nlat + j]) !== Math.sign(hm)) { const a = psi[k * nlat + j - 1], b = psi[k * nlat + j]; edge = lat[j - 1] + (lat[j] - lat[j - 1]) * (a / (a - b)); break; }
  let jm = 0, jl = NaN;
  for (let j = 0; j < nlat; j++) if (lat[j] > 0 && u[1 * nlat + j] > jm) { jm = u[1 * nlat + j]; jl = lat[j]; }
  return { hadleyN: edge, jetN: jm, jetLatN: jl };
}
// A statistic of a 3-D map (nlat x nlon) over a lat-lon box (lon 0-360, the box may wrap): "mean", "min" or "max".
function boxStat(m, f, la0, la1, lo0, lo1, how = "mean") {
  let s = 0, c = 0, best = how === "min" ? Infinity : -Infinity;
  for (let j = 0; j < m.nlat; j++) {
    if (m.lat[j] < la0 || m.lat[j] > la1) continue;
    for (let i = 0; i < m.nlon; i++) {
      const lo = (i * 360) / m.nlon, inBox = lo0 <= lo1 ? lo >= lo0 && lo <= lo1 : lo >= lo0 || lo <= lo1, v = f[j * m.nlon + i];
      if (!inBox || !Number.isFinite(v)) continue;
      s += v; c++; best = how === "min" ? Math.min(best, v) : Math.max(best, v);
    }
  }
  return !c ? NaN : how === "mean" ? s / c : best;
}
// The ocean, mountain and El Nino numbers (2026-10-10), all from the worker's 30-day means.
function peMapStats(m) {
  if (!m.meanPs) return {};
  const nl = m.nlon, kb = m.L - 1;
  let riseLon = NaN, tr = 0, tc = 0, ue = 0, uc = 0;
  // where the Pacific's rising air is centred: the longitude 120°E-100°W weighted by the mean ascent (the single
  // strongest point jumped between grid boxes from one month to the next; Africa, the Amazon and the Andes
  // coast have their own: with rain, ascent near Ecuador pulled it to 84°W)
  let sw = 0, swl = 0;
  for (let i = 0; i < nl; i++) {
    const w = -m.eqW[m.kMid * nl + i], lo = (i * 360) / nl;
    if (lo >= 120 && lo <= 260 && w > 0) { sw += w; swl += w * lo; }
    if (lo >= 160 && lo <= 240) { tr += m.eqU[kb * nl + i]; tc++; }
    if (lo >= 200 && lo <= 260) { ue += m.eqU[m.kJet * nl + i]; uc++; }
  }
  riseLon = sw > 0 ? swl / sw : NaN;
  // the east Pacific ITCZ: at each longitude 140-90°W the latitude (15°S-20°N) of the strongest mean rising air, averaged
  let il = 0, ic = 0;
  for (let i = 0; i < nl; i++) {
    const lo = (i * 360) / nl; if (lo < 220 || lo > 270) continue;
    let b = Infinity, bl = NaN;
    for (let j = 0; j < m.nlat; j++) if (m.lat[j] > -15 && m.lat[j] < 20 && m.meanW[j * nl + i] < b) { b = m.meanW[j * nl + i]; bl = m.lat[j]; }
    il += bl; ic++;
  }
  const n = m.nlat * nl, tlow = m.temp.subarray(kb * n, (kb + 1) * n);
  return {
    soi: boxStat(m, m.meanPs, -5, 5, 230, 280) - boxStat(m, m.meanPs, -5, 5, 90, 140), riseLon, itczEP: il / ic, eqTrades: -tr / tc, upperEast: ue / uc,
    aleutian: boxStat(m, m.meanPs, 40, 65, 150, 220, "min"), siberian: boxStat(m, m.meanPs, 40, 60, 80, 120, "max"), pacHigh: boxStat(m, m.meanPs, 25, 45, 190, 240, "max"),
    eaJet: boxStat(m, m.meanUj, 20, 50, 100, 240, "max"), asiaPacT: boxStat(m, tlow, 40, 60, 70, 120) - boxStat(m, tlow, 40, 60, 160, 220),
    ...(m.meanRain ? (() => {
      let g = 0, gw = 0;
      for (let j = 0; j < m.nlat; j++) { const w = Math.cos((m.lat[j] * Math.PI) / 180); for (let i = 0; i < nl; i++) { g += m.meanRain[j * nl + i] * w; gw += w; } }
      return { rainGlobal: g / gw, rainSAsia: boxStat(m, m.meanRain, 10, 30, 70, 110), rainWarmPool: boxStat(m, m.meanRain, -10, 10, 120, 160), rainColdTongue: boxStat(m, m.meanRain, -5, 5, 230, 270) };
    })() : {}),
    asiaPacPs: boxStat(m, m.meanPs, 40, 60, 70, 120) - boxStat(m, m.meanPs, 40, 60, 160, 220), monsoonPs: boxStat(m, m.meanPs, 20, 35, 60, 100) - boxStat(m, m.meanPs, 25, 40, 180, 230),
  };
}
// Storm diagnostics from the instantaneous fields (2026-10-10, panel review: the "pressure range" said nothing about
// the steps' ideas), averaged over about 10 model days so one storm doesn't swing them:
//   heatFlux: the storms' poleward heat flux, zonal-mean v'T' over the lowest two levels, its largest value 30-60°N (K m/s);
//   crossAngle: the mean angle (°) by which the lowest level's wind crosses the isobars toward low pressure, 30-60°N,
//     weighted by wind speed (winds over 3 m/s only).
function peStormStats(m) {
  const { nlat, nlon, lat, L } = m, n = nlat * nlon, a = 6.371e6, D = Math.PI / 180;
  let best = -Infinity;
  for (let j = 0; j < nlat; j++) {
    if (lat[j] < 30 || lat[j] > 60) continue;
    let f = 0;
    for (const k of [L - 1, L - 2]) {
      let sv = 0, st = 0, svt = 0;
      for (let i = 0; i < nlon; i++) { const x = k * n + j * nlon + i; sv += m.v[x]; st += m.temp[x]; svt += m.v[x] * m.temp[x]; }
      f += (svt / nlon - (sv / nlon) * (st / nlon)) / 2;
    }
    best = Math.max(best, f);
  }
  let sa = 0, sw = 0;
  for (let j = 1; j < nlat - 1; j++) {
    if (lat[j] < 30 || lat[j] > 60) continue;
    const dy = (lat[j + 1] - lat[j - 1]) * D * a, dx = ((2 * 360) / nlon) * D * a * Math.cos(lat[j] * D);
    for (let i = 0; i < nlon; i++) {
      const x = j * nlon + i, px = (m.ps[j * nlon + ((i + 1) % nlon)] - m.ps[j * nlon + ((i - 1 + nlon) % nlon)]) / dx, py = (m.ps[x + nlon] - m.ps[x - nlon]) / dy;
      const u = m.u[(L - 1) * n + x], v = m.v[(L - 1) * n + x], sp = Math.hypot(u, v), gp = Math.hypot(px, py);
      if (sp < 3 || gp < 1e-6) continue;
      const gu = -py / gp, gv = px / gp;                                        // along the isobars, low pressure on the left (north)
      const ang = Math.atan2(gu * v - gv * u, gu * u + gv * v) * (180 / Math.PI); // + when turned to the left of it: toward the low
      sa += ang * sp; sw += sp;
    }
  }
  return { heatFlux: best, crossAngle: sw ? sa / sw : NaN };
}
function emaStat(key, v, tDays, days = 10) {
  const e = (sim.ema ??= {}), o = e[key];
  if (!Number.isFinite(v)) return o?.v ?? NaN;
  if (!o || tDays < o.t || tDays - o.t > 60) { e[key] = { v, t: tDays }; return v; }
  const w = Math.min(1, (tDays - o.t) / days); o.v += (v - o.v) * w; o.t = tDays; return o.v;
}
// The observed sea's west-east contrast along the equator (warm pool 130-160E minus 90-130W), this month: data, not the model.
function seaContrast() {
  const sea = simSeaNow(sim.p, simDay()).sst, L = SIM_SURFACE.grid.lat, nl = SIM_SURFACE.grid.nlon;
  const box = (lo0, lo1) => { let s = 0, c = 0; L.forEach((la, j) => { if (Math.abs(la) > 5) return; for (let i = 0; i < nl; i++) { const lo = i * 5.625, v = sea[j * nl + i]; if (lo >= lo0 && lo <= lo1 && v != null) { s += v; c++; } } }); return s / c; };
  return box(130, 160) - box(230, 270);
}
function simMetricCtx() {
  if (sim.model === "3d") {
    const m = sim.pe;
    if (!m) return {};
    const ss = peStormStats(m), td = m.t / 86400;
    let hp = 0; const kq = Math.floor(m.L / 2);
    for (let j = 0; j < m.nlat; j++) if (Math.abs(m.lat[j]) < 35) hp = Math.max(hp, Math.abs(m.meanPsi[kq * m.nlat + j]) / 1e10);
    return { m, belts: surfaceBelts(m.meanU, m.L, m.nlat, m.lat), cells: peCells(m), ...peMapStats(m), sea: seaContrast(), heatFlux: emaStat("hf", ss.heatFlux, td), crossAngle: emaStat("ca", ss.crossAngle, td), hadleyPsi: hp };
  }
  if (!sim.s) return {};
  // 2-D extras: the strongest poleward wind high up (m/s, above 8 km), and how much higher the 500 mb surface sits
  // over the equator than the poles (m): the integral up to 5.5 km of (θ_equator − θ_pole) / θ0
  const s = sim.s, { nlat, nz, zc, lat, v, th } = s, D = 180 / Math.PI;
  let vmax = 0;
  for (let j = 0; j <= nlat; j++) for (let k = 0; k < nz; k++) if (zc[k] > 8000) vmax = Math.max(vmax, Math.abs(v[j * nz + k]));
  const row = (L) => Math.max(0, Math.min(nlat - 1, Math.round((L + 90) / (180 / nlat) - 0.5)));
  // from the same pressure surfaces the chart draws (panel review round 2), equator minus the mean of the two polar rows
  const [h500] = pressureHeights(s, [500]), push500 = h500[row(0)] - 0.5 * (h500[row(88)] + h500[row(-88)]);
  return { d: simDiagnostics(s), vmax, push500 };
}
// The strip: the clock, the state pill, the step's number with its sparkline (the last 60 model days).
function simStrip() {
  const st = simStepNow(), is3 = sim.model === "3d", m = sim.pe, s = sim.s;
  const tDays = is3 ? (m?.t ?? 0) / 86400 : (s?.t ?? 0) / 86400;
  const spd = sim.held ? "held" : sim.paused ? "paused" : `${sim.speed} day${sim.speed === 1 ? "" : "s"}/s`;
  $("simClock").textContent = `Day ${Math.max(0, Math.round(tDays - (sim.t0Days ?? 0)))} · ${dayLabel(simDay())} · ${spd}`;
  $("simStripPause").textContent = sim.paused || sim.held ? "▶" : "❚❚";
  // the state
  let cls = "run", text = "running";
  const sinceStart = tDays - (sim.t0Days ?? 0);
  if (sim.held) { cls = "held"; text = "HELD: not yet moving"; }
  else if (is3 && m?.settle != null) { cls = "fast"; text = `FAST-FORWARD ${Math.round(m.settle * m.settleDays)}/${m.settleDays} days`; }
  else if (!is3 && sim.fast) { cls = "fast"; text = sim.ffEnd ? `FAST-FORWARD ${Math.max(0, Math.round(SIM2D_SETTLE - (sim.ffEnd - tDays)))}/${SIM2D_SETTLE} days` : "FAST-FORWARD to the new balance"; }
  else if (sim.fromRest && sinceStart < 25) { cls = "spin"; text = `SPINNING UP: day ${Math.round(sinceStart)}`; }
  else if (is3 && sim.chartMean && m && m.meanDays < 29.5) { cls = "avg"; text = `AVERAGING ${Math.round(m.meanDays)}/30 days`; }
  else if (sim.p.seasons) { cls = "avg"; text = "CYCLING through the year"; }
  else if (sim.settled) { cls = "settled"; text = "SETTLED"; }
  const pill = $("simPill"); pill.className = `pill ${cls}`; pill.textContent = text;
  // the number
  const mt = st?.metric, def = mt && SIM_METRICS[mt.id];
  $("simMetric").hidden = !def;
  if (!def) return;
  $("simMetricLabel").textContent = mt.label ?? def.label;
  if (cls === "fast") { $("simMetricVal").textContent = "settling…"; $("simMetricVal").classList.add("unsettled"); sim.mHist = []; return; }   // mid fast-forward the averages mean nothing yet
  const v = def.get(simMetricCtx());
  const hist = sim.mHist ?? (sim.mHist = []);
  if (Number.isFinite(v) && (!hist.length || tDays - hist[hist.length - 1][0] >= 0.5)) { hist.push([tDays, v]); while (hist.length && hist[0][0] < tDays - 60) hist.shift(); }
  const recent = hist.filter(([t]) => t >= tDays - 10);
  sim.settled = sim.held || recent.length >= 8 && tDays - recent[0][0] >= 9 && Math.max(...recent.map((r) => r[1])) - Math.min(...recent.map((r) => r[1])) <= (mt.tol ?? 1);
  const el = $("simMetricVal");
  el.textContent = !Number.isFinite(v) ? "—" : mt.id === "riseLon" ? `${sim.settled ? "" : "≈"}${lonText(v)}`
    : `${sim.settled ? "" : "≈"}${Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(Math.abs(v) >= 10 ? 0 : 1)} ${mt.unit ?? def.unit}${(mt.unit ?? def.unit) === "m/s" ? ` (${Math.round(v * 1.944)} kt)` : ""}${mt.earth != null ? ` · Earth ≈ ${mt.earth}` : ""}`;
  el.classList.toggle("unsettled", !sim.settled);
  const cv = $("simSpark"), ctx = cv.getContext("2d"), w = cv.width, h = cv.height;
  ctx.clearRect(0, 0, w, h);
  if (hist.length > 1) {
    const vals = hist.map((r) => r[1]), [tlo, thi] = mt.target ?? [NaN, NaN];
    const ex = [Number.isFinite(tlo) ? tlo : null, Number.isFinite(thi) ? thi : null, mt.earth ?? null].filter((x) => x != null);
    const lo = Math.min(...vals, ...ex), hi = Math.max(...vals, ...ex), span = hi - lo || 1;
    const X = (t) => ((t - (tDays - 60)) / 60) * w, Y = (x) => h - 2 - ((x - lo) / span) * (h - 4);
    if (Number.isFinite(tlo)) { ctx.fillStyle = "rgba(80,200,120,0.25)"; ctx.fillRect(0, Y(thi), w, Y(tlo) - Y(thi)); }
    // Earth's value, dashed, when it's in range (the green band is what this model is expected to reach)
    if (mt.earth != null && mt.earth >= lo && mt.earth <= hi) { ctx.strokeStyle = "rgba(220,230,240,0.8)"; ctx.setLineDash([3, 2]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, Y(mt.earth)); ctx.lineTo(w, Y(mt.earth)); ctx.stroke(); ctx.setLineDash([]); }
    ctx.strokeStyle = "#f0a830"; ctx.lineWidth = 1.5; ctx.beginPath();
    hist.forEach(([t, x], i) => (i ? ctx.lineTo(X(t), Y(x)) : ctx.moveTo(X(t), Y(x)))); ctx.stroke();
  }
}
// "What am I looking at?" (2026-10-10, panel review D1): every element on the screen explained from the live state.
const SIM_METRIC_ABOUT = {
  contrast: "the temperature at the ground on the equator minus the average of the two poles. Sunlight alone sets 60 K here; any circulation that carries heat poleward makes it smaller.",
  push500: "how much higher the 500 hPa pressure surface sits over the equator than over the poles, worked out from the temperature below it (warm columns are taller). This difference is what pushes the air poleward high up.",
  vmax: "the strongest north–south wind above 8 km, anywhere: how hard the overturning loop is running.",
  hadleyN: "the latitude where the northern Hadley cell ends: where its overturning falls to a tenth of its strongest (2-D), or where the 30-day mean overturning at mid-levels changes sign (3-D).",
  jetN: "the strongest wind from the west in the northern hemisphere between 5 and 13 km (2-D), or at the second level up, about 10 km (3-D, 30-day mean).",
  jetLatN: "the latitude of the northern jet's core.",
  tradesN: "the strongest wind from the east at the ground between the equator and 30°N (2-D), or the 30-day mean surface wind 5–25°N (3-D); shown positive when it blows from the east.",
  itcz: "the latitude of the strongest rising air 3 km up, within 30° of the equator: the Intertropical Convergence Zone.",
  eke: "the storms' kinetic energy: the energy of the winds' departures from their average round each latitude, averaged over the globe. Near zero means smooth flow; tens means a world of storms.",
  westN: "the 30-day mean wind at the lowest level between 40 and 60°N (positive from the west).",
  psRange: "the lowest and highest sea-level pressure anywhere right now.",
  sea: "observed data, not the model: the sea along the equator (5°S–5°N) in the warm pool (130–160°E) minus the east Pacific (90–130°W), for the date.",
  soi: "the 30-day mean sea-level pressure over the east Pacific (80–130°W) minus over Indonesia (90–140°E), 5°S–5°N: the Walker circulation's pressure see-saw (positive: higher in the east, as on Earth).",
  riseLon: "where the Pacific's rising air is centred: the longitude 120°E–100°W weighted by the 30-day mean rising motion at mid-levels, 5°S–5°N.",
  eqTrades: "the 30-day mean wind at the lowest level along the equator (5°S–5°N), 160°E–120°W, shown positive from the east.",
  upperEast: "the 30-day mean east–west wind at about 10 km over the east Pacific equator (160–100°W): the Walker loop's eastward-flowing top (with a background westerly).",
  aleutian: "the lowest 30-day mean sea-level pressure in the North Pacific, 40–65°N, 150°E–140°W.",
  siberian: "the highest 30-day mean sea-level pressure over Siberia, 40–60°N, 80–120°E.",
  pacHigh: "the highest 30-day mean sea-level pressure in the subtropical North Pacific, 25–45°N, 120–170°W.",
  eaJet: "the strongest 30-day mean wind from the west at about 10 km between 20 and 50°N, 100°E–120°W: the jet off East Asia.",
  asiaPacT: "the temperature at the lowest level, 40–60°N, averaged over Asia (70–120°E) minus over the North Pacific (160°E–140°W), right now.",
  asiaPacPs: "the 30-day mean sea-level pressure over Asia minus the North Pacific, 40–60°N.",
  monsoonPs: "the 30-day mean sea-level pressure over South Asia (20–35°N, 60–100°E) minus the subtropical Pacific (25–40°N, 180–130°W): negative is a monsoon low.",
  rainGlobal: "the 30-day mean rain averaged over the whole Earth (area-weighted).",
  rainSAsia: "the 30-day mean rain over South and Southeast Asia, 10–30°N, 70–110°E.",
  rainWarmPool: "the 30-day mean rain over the warm pool, 10°S–10°N, 120–160°E.",
  rainColdTongue: "the 30-day mean rain over the east Pacific equator, 5°S–5°N, 130–90°W.",
  hadleyPsi: "the strongest 30-day mean overturning (the mass of air carried round the loop each second, in 10¹⁰ kg/s) at mid-levels within 35° of the equator: how hard the Hadley cell is running. Earth's annual mean is about 8–10.",
  itczEP: "at each longitude 140–90°W, the latitude of the strongest 30-day mean rising air between 15°S and 20°N, averaged: where the east Pacific's ITCZ sits.",
  heatFlux: "how much heat the storms carry poleward near the ground: round each latitude, the average of (northward wind × temperature departure), over the lowest two levels; its largest value 30–60°N, smoothed over about 10 days.",
  crossAngle: "how far the wind near the ground (about 0.7 km up) is turned across the isobars toward low pressure, 30–60°N, weighted by wind speed, smoothed over about 10 days. Zero would be flow exactly along the isobars.",
};
const SIM_CHART_HOW = {
  u: "A north–south slice through the atmosphere, averaged all the way round the planet: latitude across (south pole left), height up to 16 km. Colour: the east–west wind (orange from the west, purple from the east, on a fixed scale). Arrows: the overturning, the slow north–south and up–down motion, drawn with the up–down stretched so it shows (the arrow scale is at the top right when there's room). Dotted lines: where the Hadley cells end; dots: the jets; ▲ the ITCZ; dashed: the tropopause, which this 2-D model sets at 11 km (above it the sunlight's equator–pole contrast fades).",
  T: "The same slice, coloured by temperature (°C, at standard-atmosphere pressure for each height): warm low down in the tropics, cold aloft and at the poles.",
  pSurf: "The temperature slice with the heights of the pressure surfaces drawn as lines (850 to 200 hPa). Warm columns are taller, so the surfaces bulge up over the equator: that slope is the push on the air high up.",
  Tanom: "What the circulation did to the temperature: the model's temperature minus the sunlight-alone target. Red: warmer than sunlight alone would make it (heat brought in); blue: cooler (heat carried away).",
  uSfc: "The east–west wind near the ground along latitude, as a line (m/s on the left, knots on the right): above the middle line it blows from the west, below from the east (the trade winds).",
  uPsi: "A north–south slice averaged round the planet (3-D model): latitude across, height up. Colour: the east–west wind (orange from the west, purple from the east). Lines: the overturning, every 2 × 10¹⁰ kg of air a second; solid lines turn clockwise as drawn (south on the left: in the north, poleward high up and back near the ground), dashed the other way. Cells are labelled with their strength. With \"30-day mean\" on, the storms average out and the cells show.",
  eqSlice: "A west–east slice along the equator (5°S–5°N), the last 30 days: longitude across (30°E right round to 30°E), height up. Colour: the east–west wind; arrows: the air's motion (up–down stretched: the scale is under the chart). The strip underneath is the observed sea (or, in an El Niño or La Niña, its difference from normal).",
};
const SIM_PILL_HOW = "The state label: HELD, the model is paused at its starting state; SPINNING UP, it started from still air and the circulation is growing; FAST-FORWARD, it's racing to the balance for the new settings (numbers wait until it's done); AVERAGING, it's collecting a fresh 30-day mean; CYCLING, the seasons are running, so the numbers keep changing; SETTLED, the step's number has stopped changing.";
function renderSimKey() {
  const st = simStepNow(), is3 = sim.model === "3d", parts = [];
  if (is3 && sim.fill !== "none" && PE_FILLS[sim.fill]) {
    const f = PE_FILLS[sim.fill], span = f.max - f.min, data = f.src === "sst" || f.src === "sstAnom", mean = f.src?.startsWith("mean");
    const grad = `linear-gradient(to right,${f.stops.map(([v, c]) => `${c} ${(((v - f.min) / span) * 100).toFixed(1)}%`).join(",")})`;
    const badge = data ? `<span class="badge data">OBSERVED DATA</span>${sim.p.sst && !sim.p.moist ? '<span class="badge boost">its pattern ×2 in the model\'s heating</span>' : ""}` : f.diff ? `<span class="badge model">MODEL − PINNED REFERENCE</span>` : `<span class="badge model">MODEL${mean ? ", 30-DAY MEAN" : ", RIGHT NOW"}</span>`;
    if (f.diff) parts.push(`<p>${sim.ref ? `The reference: ${simEsc(sim.ref.label)} (a ${sim.ref.meanDays}-day mean). Differences of a few hPa or mm/day can be just one month's weather: treat small ones as noise.` : "Nothing pinned yet: set up a run, wait for AVERAGING to finish, press 📌 Pin as reference, change something, and choose this colour again."}</p>`);
    parts.push(`<h5>Globe colour${badge}</h5><p>${f.label} (${f.units}).${f.contour ? ` Dark lines: isobars every ${f.contour} hPa (H and L mark highs and lows).` : ""} Smoothed for display from the model's grid (5.6° boxes, about 600 km).</p><span class="bar" style="background:${grad}"></span><span class="ends"><span>${f.min}</span><span>${f.max} ${f.units}</span></span>`);
  } else if (!is3) parts.push(`<h5>Globe</h5><p>A plain planet: the 2-D model is the same at every longitude, so the globe shows only where the particles are. The yellow circle is where the Sun is overhead today; blue circles, the edges of 24-hour daylight and polar night.</p>`);
  parts.push(`<h5>Particles</h5><p>Thousands of markers carried by the model's winds. Sideways (east–west) they move at the true wind speed; the slow north–south and up–down motion is sped up ×${sim.exag} so it shows, and heights are stretched ×${sim.vex}. Pale cyan near the ground, orange high up, so rising air turns orange and sinking air pale. Tails trace the last moment of travel.${!is3 && sim.slabOn ? " They're in a north–south slab seen side-on at the globe's edge, so the rising and sinking show." : ""}</p>`);
  const cm = sim.chart === "eqSlice" ? "eqSlice" : sim.chart === "uSfc" ? "uSfc" : is3 ? "uPsi" : ["T", "pSurf", "Tanom"].includes(sim.chart) ? sim.chart : "u";
  parts.push(`<h5>The chart (bottom)</h5><p>${SIM_CHART_HOW[cm]}</p>`);
  const mt = st?.metric, def = mt && SIM_METRICS[mt.id];
  if (def) parts.push(`<h5>The number: ${simEsc(mt.label ?? def.label)}</h5><p>${SIM_METRIC_ABOUT[mt.id] ?? ""} The sparkline shows the last 60 model days; the green band is the range this model is expected to reach in this step${mt.earth != null ? `, and the dashed line Earth's value (about ${mt.earth} ${mt.unit ?? def.unit})` : ""}.</p>`);
  parts.push(`<h5>The strip</h5><p>Day: model days since the step began, then the date (the model's sunlight is a daily average: no day and night) and the speed. ${SIM_PILL_HOW}</p>`);
  parts.push(`<h5>Keys</h5><p>Space: run or pause · ← →: previous or next step · K: this key · H: hide the panel. Drag to turn the globe, scroll to zoom; Re-centre goes back to the step's view.</p>`);
  parts.push(`<p><a href="guide.html#sim-model" target="_blank" rel="noopener">How the models work, and their limits ↗</a></p>`);
  $("simKeyBody").innerHTML = parts.join("");
}
// Pin as reference (panel review round 2: every on/off comparison relied on remembering one number): keep this run's
// 30-day means and its settings; the "minus the pinned reference" colours then show the difference, on fixed scales.
function simPin() {
  const m = sim.pe;
  if (sim.model !== "3d" || !m?.meanPs) return;
  const p = sim.p, desc = [p.land ? "continents" : "ocean planet", p.sst && "real sea", p.mountains && "mountains", p.moist && "water vapour", p.enso && SIM_SURFACE.events[p.enso]?.label, dayLabel(simDay()), `${p.tauAirDays ?? (p.moist ? 15 : 40)}-day radiation`].filter(Boolean).join(", ");
  sim.ref = { label: desc, meanDays: Math.round(m.meanDays), meanPs: Float32Array.from(m.meanPs), meanRain: m.meanRain ? Float32Array.from(m.meanRain) : null, meanUj: Float32Array.from(m.meanUj) };
  $("simPinBtn").textContent = "📌 Pinned"; $("simPinBtn").title = `Reference: ${desc} (${sim.ref.meanDays}-day mean). Click to pin the current run instead.`;
  setTimeout(() => { $("simPinBtn").textContent = "📌 Pin as reference"; }, 2500);
  if (!$("simKey").hidden) renderSimKey();
}
$("simPinBtn").addEventListener("click", simPin);
$("simKeyBtn").addEventListener("click", () => { const k = $("simKey"); k.hidden = !k.hidden; if (!k.hidden) { renderSimKey(); $("simKeyClose").focus(); } });
$("simKeyClose").addEventListener("click", () => { $("simKey").hidden = true; });
$("simStripPause").addEventListener("click", () => { if (sim.held) { simRelease(); return; } sim.paused = !sim.paused; simPost({ type: "pause", paused: sim.paused }); syncSimControls(); simStrip(); });
$("simStripStep").addEventListener("click", () => {
  if (sim.held) sim.held = false;
  sim.paused = false; simPost({ type: "pause", paused: false });
  const ms = 1000 / Math.max(0.25, sim.speed);
  setTimeout(() => { sim.paused = true; simPost({ type: "pause", paused: true }); syncSimControls(); simStrip(); }, ms);
});
$("simRecentre").addEventListener("click", () => simCamera(simStepNow()?.camera ?? sim.cameraName ?? "globe-tilted"));
// Held start (G10): the model initialised at radiative equilibrium and paused at t = 0 until released.
function simRelease() {
  sim.held = false; sim.paused = false; simPost({ type: "pause", paused: false });
  // phones: drop the sheet so the globe shows the model moving; it comes back up with "What happened" a few seconds on
  if (sheet?.active()) { sheet.set("peek"); setTimeout(() => { if (sheet.get() === "peek") sheet.set("half"); }, 6000); }
  sim.fromRest = true; sim.mHist = []; sim.settled = false;
  const st = simStepNow();
  if (st?.slowmo) { sim.speed = st.slowmo.speed; simPost({ type: "speed", speed: sim.speed }); setTimeout(() => { if (simStepNow() === st) { sim.speed = st.view?.speed ?? 1; simPost({ type: "speed", speed: sim.speed }); } }, st.slowmo.seconds * 1000); }
  renderSimCard(); simStrip();
}
// Two models behind one set of controls: the 2-D one (sim2d.js in simworker.js) and the 3-D one
// with storms (pe3d.js in pe3dworker.js). Only the running one's worker steps.
function simWorkerFor(kind) {
  const url = new URL(kind === "3d" ? "./pe3dworker.js" : "./simworker.js", import.meta.url);
  url.search = new URL(import.meta.url).search;                   // this build's version stamp, like every module
  return new Worker(url, { type: "module" });
}
// The 3-D model takes only the planet's settings (its own stability and timescales are Held & Suarez's).
const peParams = (p) => ({ rotation: p.rotation, tilt: p.tilt, day: p.day, seasons: p.seasons, inertiaDays: p.inertiaDays, contrastK: p.contrastK, land: !!p.land,
  sst: !!p.sst, enso: p.enso || null, mountains: !!p.mountains, deepHeat: p.deepHeat ?? 0.4, moist: !!p.moist,
  ...(p.tauAirDays != null ? { tauAirDays: p.tauAirDays } : {}), ...(p.moistTauAirDays !== undefined ? { moistTauAirDays: p.moistTauAirDays } : {}) });
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
    sim.speed = Math.min(sim.speed, 3);
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
// The fills that aren't the instantaneous model: its 30-day means (rising air converted from sigma-dot to mm/s
// with w = -H sigma-dot / sigma, H = 7.5 km) and the observed sea (this month's, with the event's anomaly).
function peFillField(src, m) {
  const n = m.nlat * m.nlon;
  if (src === "meanW") return Float32Array.from(m.meanW, (x) => (-HS_M * x * 1000) / m.sf[m.kMid]);
  if (src === "meanPs" || src === "meanUj") return m[src];
  if (src === "meanRain" || src === "meanPwat") return m[src] ?? new Float32Array(n).fill(NaN);     // no water vapour: grey
  if (src.startsWith("diff")) {
    const k = { diffPs: "meanPs", diffRain: "meanRain", diffJet: "meanUj" }[src], a = m[k], b = sim.ref?.[k];
    return a && b ? Float32Array.from(a, (x, i) => x - b[i]) : new Float32Array(n).fill(NaN);
  }
  const sst = simSeaNow(sim.p, simDay()), out = new Float32Array(n);
  for (let q = 0; q < n; q++) out[q] = src === "sst" ? sst.sst[q] ?? NaN : sst.anom ? sst.anom[q] ?? NaN : 0;
  return out;
}
// The observed sea for a date: the 1991-2020 climatology interpolated between mid-months (as pe3d.js does) and
// the chosen event's anomaly. null over land.
function simSeaNow(p, day) {
  const x = ((((day - 15.2) / 30.44) % 12) + 12) % 12, m0 = Math.floor(x), m1 = (m0 + 1) % 12, w = x - m0, a = SIM_SURFACE.sst[m0], b = SIM_SURFACE.sst[m1];
  const ev = p.enso ? SIM_SURFACE.events[p.enso]?.anom : null;
  return { sst: a.map((v, q) => (v == null || b[q] == null ? null : v + (b[q] - v) * w + (ev?.[q] ?? 0))), anom: ev };
}
// The Simulate mode's key (2026-10-10; the panel found the map colours had none): the globe's colour, with its
// units and whether it's the model or observed data, and what the particles' colours mean.
function simLegend() {
  if (!$("simKey").hidden) renderSimKey();
  const row = (label, grad, lo, hi) => { const r = document.createElement("div"); r.className = "legend-row"; r.innerHTML = `<span class="legend-label">${label}</span>${grad ? `<span class="legend-bar" style="background:${grad}"></span><span class="legend-ends"><span>${lo}</span><span>${hi}</span></span>` : ""}`; legend.appendChild(r); };
  if (sim.model === "3d" && sim.fill !== "none" && PE_FILLS[sim.fill]) {
    const f = PE_FILLS[sim.fill], span = f.max - f.min;
    const grad = `linear-gradient(to right,${f.stops.map(([v, c]) => `${c} ${(((v - f.min) / span) * 100).toFixed(1)}%`).join(",")})`;
    row(`Colour: ${f.label} (${f.units})`, grad, f.min, f.max);
  }
  row("Particles: pale cyan near the ground, orange high up (east–west at true speed; up–down and north–south sped up)", "linear-gradient(to right,rgb(140,230,255),rgb(255,128,26))", "ground", "top");
}
// The 3-D model's colour fill: a 128 x 64 texture remade whenever the worker reports.
function updatePEFill() {
  if (sim.model !== "3d" || sim.fill === "none" || !sim.pe) { sim.fillOn = false; simSurface(); return; }
  const f = PE_FILLS[sim.fill], m = sim.pe, n = m.nlat * m.nlon;
  let field = m.ps;
  if (f.src) field = peFillField(f.src, m);
  else if (sim.fill !== "ps") { const k = f.level === "bottom" ? m.L - 1 : m.sf.findIndex((x) => x >= 0.55); field = m.temp.subarray(k * n, (k + 1) * n).map((x) => x - 273.15); }
  // the sea's own fills (data) masked by the 1° coastline, not the model's 5.6° boxes
  const sea = f.src === "sst" || f.src === "sstAnom";
  if (sea && !sim.coastMask) { const lats = Array.from({ length: 128 }, (_, r) => -90 + ((r + 0.5) * 180) / 128); sim.coastMask = Uint8Array.from(landFraction(lats, 256), (x) => (x > 0.5 ? 1 : 0)); }
  const data = fillTexture(field, m.nlat, m.nlon, m.lat, f.stops, 256, 128, 235, { contour: f.contour ?? 0, mask: sea ? sim.coastMask : null });
  if (!sim.fillTex) {
    sim.fillTex = new THREE.DataTexture(data, 256, 128, THREE.RGBAFormat);
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
  if (now - sim.lastChart > 300) { drawSimChart(); simHud(); simStrip(); if (sim.p.seasons) syncSimControls(); sim.lastChart = now; }
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
  if (now - sim.lastChart > 300) { drawSimChart(); simHud(); simStrip(); if (sim.p.seasons) syncSimControls(); sim.lastChart = now; }
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
  if (sim.chart === "eqSlice" && m.eqU) { drawEqChart(ctx, W, H, m); return; }
  if (sim.chart === "uSfc") {
    const ser = Array.from({ length: m.nlat }, (_, j) => ({ lat: m.lat[j], u: m.meanU[(m.L - 1) * m.nlat + j] }));
    drawSurfaceWind(ctx, W, H, ser, { umax: sim.umax ?? 10, title: "The wind near the ground (lowest level, about 0.7 km), 30-day mean round the planet (m/s; knots on the right)" });
    $("simChartInfo").textContent = `Averaged round the globe and over the last 30 days · ${dayLabel(m.day)}`;
    return;
  }
  simRecord();
  const split = sim.side === "eke" && W > 520, Ws = split ? Math.round(W * 0.6) : W;
  ctx.clearRect(0, 0, W, H);
  if (split) drawTimeChart(ctx, Ws, 0, W - Ws, H, "eke");
  const mean = sim.chartMean, u = mean ? m.meanU : m.ubar, psi = mean ? m.meanPsi : m.psi;
  const r = drawPESection(ctx, Ws, H, { L: m.L, nlat: m.nlat, lat: m.lat, sf: m.sf, sh: m.sh, u, psi },
    { umax: sim.umax, title: `${mean ? "Last 30 days" : "Right now"}: east–west wind (orange from the west, purple from the east) · overturning (lines every 2×10¹⁰ kg/s; solid clockwise as drawn, dashed the other way)` });
  if (sim.textbook) drawTextbook(ctx, TEXTBOOK, (la) => r.P.x + ((la + 90) / 180) * r.P.w, (z) => r.P.y + r.P.h - (Math.min(z, 16000) / 16000) * r.P.h, r.P);
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
// Time charts (2026-10-10, panel review): the storms' energy on a log axis (steady doubling is a straight line, so
// its slope gives the doubling time) and the ITCZ against the Sun's latitude through the year (a time-latitude strip).
function drawTimeChart(ctx, x0, y0, W, H, kind) {
  const P = { x: x0 + 40, y: y0 + 22, w: W - 52, h: H - 48 };
  ctx.save(); ctx.font = "11px system-ui, sans-serif";
  ctx.fillStyle = "rgba(14,18,24,0.6)"; ctx.fillRect(x0, y0, W, H);
  ctx.strokeStyle = "#999"; ctx.lineWidth = 1; ctx.strokeRect(P.x, P.y, P.w, P.h); ctx.fillStyle = "#cfd6de";
  if (kind === "eke") {
    const h = sim.ekeHist ?? [], t1 = h.length ? h[h.length - 1][0] : 0, t0 = Math.max(0, t1 - 60), X = (t) => P.x + ((t - t0) / Math.max(1, t1 - t0)) * P.w;
    const lo = -2, hi = 3, Y = (e) => P.y + P.h - ((Math.log10(Math.max(e, 0.01)) - lo) / (hi - lo)) * P.h;
    for (const e of [0.01, 0.1, 1, 10, 100, 1000]) { ctx.fillText(String(e), x0 + 4, Y(e) + 4); ctx.strokeStyle = "rgba(160,170,180,0.25)"; ctx.beginPath(); ctx.moveTo(P.x, Y(e)); ctx.lineTo(P.x + P.w, Y(e)); ctx.stroke(); }
    ctx.strokeStyle = "#f0a830"; ctx.lineWidth = 2; ctx.beginPath(); h.filter(([t]) => t >= t0).forEach(([t, e], i) => (i ? ctx.lineTo(X(t), Y(e)) : ctx.moveTo(X(t), Y(e)))); ctx.stroke();
    // the doubling time over the steepest 5 days so far
    let best = 0; for (let i = 0; i < h.length; i++) for (let k = i + 1; k < h.length; k++) if (h[k][0] - h[i][0] >= 4 && h[k][0] - h[i][0] <= 6 && h[i][1] > 0.005) { const r = Math.log(h[k][1] / h[i][1]) / (h[k][0] - h[i][0]); if (r > best) best = r; }
    ctx.fillStyle = "#cfd6de";
    ctx.fillText(`Storm energy (m²/s², log scale) · last ${Math.round(t1 - t0)} days${best > 0.05 ? ` · fastest doubling every ${(Math.LN2 / best).toFixed(1)} days` : ""}`, P.x, y0 + 13);
    ctx.fillText("days →", P.x + P.w - 40, P.y + P.h + 14);
  } else {
    const h = sim.hovHist ?? [], t1 = h.length ? h[h.length - 1][0] : 0, t0 = t1 - 365, X = (t) => P.x + ((t - t0) / 365) * P.w, Y = (la) => P.y + P.h / 2 - (la / 30) * (P.h / 2);
    for (const la of [-30, -15, 0, 15, 30]) { ctx.fillText(la === 0 ? "0°" : `${Math.abs(la)}°${la > 0 ? "N" : "S"}`, x0 + 4, Y(la) + 4); ctx.strokeStyle = "rgba(160,170,180,0.25)"; ctx.beginPath(); ctx.moveTo(P.x, Y(la)); ctx.lineTo(P.x + P.w, Y(la)); ctx.stroke(); }
    ctx.strokeStyle = "#f5c518"; ctx.lineWidth = 2; ctx.beginPath(); h.forEach(([t, , sun], i) => (i ? ctx.lineTo(X(t), Y(sun)) : ctx.moveTo(X(t), Y(sun)))); ctx.stroke();
    ctx.fillStyle = "#f08a24"; for (const [tt, itcz] of h) if (Number.isFinite(itcz)) ctx.fillRect(X(tt) - 1, Y(itcz) - 1, 3, 3);
    ctx.fillStyle = "#cfd6de"; ctx.fillText("The last year: the Sun overhead (yellow line) and the ITCZ (orange dots)", P.x, y0 + 13);
    ctx.fillText("← a year ago                 now", P.x + P.w - 190, P.y + P.h + 14);
  }
  ctx.restore();
}
// Record the histories the time charts draw: one point per half model day.
function simRecord() {
  const is3 = sim.model === "3d", t = is3 ? (sim.pe?.t ?? 0) / 86400 : (sim.s?.t ?? 0) / 86400;
  if (is3 && sim.pe) { const h = (sim.ekeHist ??= []); if (h.length && t < h[h.length - 1][0]) h.length = 0; if (!h.length || t - h[h.length - 1][0] >= 0.5) { h.push([t, sim.pe.eke]); if (h.length > 400) h.shift(); } }
  if (!is3 && sim.s) {
    const h = (sim.hovHist ??= []); if (h.length && t < h[h.length - 1][0]) h.length = 0;
    if (!h.length || t - h[h.length - 1][0] >= 1) { const d = simDiagnostics(sim.s); h.push([t, d.wItczCmS >= 0.01 ? d.itcz : NaN, declination(sim.s.day, sim.p.tilt)]); while (h.length && h[0][0] < t - 365) h.shift(); }
  }
}
// The equator's slice (the Walker circulation): the 30-day mean along 5°S–5°N, with the observed sea under it.
function drawEqChart(ctx, W, H, m) {
  const sea = simSeaNow(sim.p, m.day), { nlat, nlon, lat } = m, rows = [];
  for (let j = 0; j < nlat; j++) if (Math.abs(lat[j]) < 6) rows.push(j);
  const along = (f) => Array.from({ length: nlon }, (_, i) => { const v = rows.map((j) => f?.[j * nlon + i]).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; });
  drawEqSlice(ctx, W, H, { L: m.L, nlon, sh: m.sh, sf: m.sf, eqU: m.eqU, eqW: m.eqW, sst: along(sea.sst), sstAnom: sim.p.enso ? along(sea.anom) : null },
    { title: "Along the equator (5°S–5°N), last 30 days: east–west wind (colour) · the air's motion (arrows; up and down stretched)" });
  $("simChartInfo").textContent = `A west–east slice along the equator, 30°E right round to 30°E · ${dayLabel(m.day)} · the strip under it is the observed sea`;
  const mt = simMetricCtx(), f1 = (x, u) => (Number.isFinite(x) ? `${x.toFixed(1)} ${u}` : "—");
  $("simDiag").innerHTML = [`<b>Rising air</b> over the Pacific centred at ${Number.isFinite(mt.riseLon) ? lonText(mt.riseLon) : "—"} (30-day mean, mid-levels).`, `<b>Wind from the west aloft</b> over the east Pacific: ${f1(mt.upperEast, "m/s")}.`,
    `<b>Pressure see-saw</b> (east Pacific minus Indonesia, 5°S–5°N): ${f1(mt.soi, "hPa")}.`, `<b>Equatorial trades</b> (160°E–120°W, near the sea): ${f1(mt.eqTrades, "m/s")} from the east.`].join("<br>");
  const st = simStepNow();
  if (st?.note && st.model === "3d" && $("simNote")) $("simNote").textContent = st.note({ pe: m, cells: [], belts: surfaceBelts(m.meanU, m.L, m.nlat, m.lat), mt }) ?? "";
}
const lonText = (lo) => { const x = ((lo % 360) + 360) % 360; return x === 180 ? "180°" : x < 180 ? `${Math.round(x)}°E` : `${Math.round(360 - x)}°W`; };
function drawSimChart() {
  if (sim.model === "3d") { drawPEChart(); return; }
  const cv = $("simChartCanvas"), dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth || 600, H = cv.clientHeight || 240;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const d = simDiagnostics(sim.s), dec = declination(sim.s.day, sim.p.tilt);
  const mode = ["T", "pSurf", "Tanom", "uSfc"].includes(sim.chart) ? sim.chart : "u";
  const titles = { u: "East–west wind (colour: orange from the west, purple from the east) · the overturning (arrows)", T: "Temperature (colour) · the overturning (arrows, once the air moves)",
    pSurf: "Temperature (colour) · lines: the heights of the pressure surfaces", Tanom: "What the circulation did: temperature minus the sunlight-alone target (red warmer, blue cooler)" };
  if (mode === "uSfc") {
    const s = sim.s, D = 180 / Math.PI, ser = Array.from({ length: s.nlat }, (_, j) => ({ lat: s.lat[j] * D, u: s.u[j * s.nz] }));
    drawSurfaceWind(ctx, W, H, ser, { umax: sim.umax ?? 6, title: "The wind near the ground (lowest 1 km), averaged round the planet (m/s; knots on the right)" });
    $("simChartInfo").textContent = `Averaged round the globe · ${dayLabel(sim.s.day)} · above the line: from the west; below: from the east`;
    const st = simStepNow(); if (st?.note && $("simNote")) $("simNote").textContent = st.note(d, sim.p) ?? "";
    return;
  }
  simRecord();
  const split = sim.side === "hov" && W > 520, Ws = split ? Math.round(W * 0.6) : W;
  ctx.clearRect(0, 0, W, H);
  if (split) drawTimeChart(ctx, Ws, 0, W - Ws, H, "hov");
  drawSimSection(ctx, Ws, H, sim.s, d, { field: mode, umax: sim.umax, tropopauseKm: sim.p.tropopauseKm, sunLat: sim.showSun ? dec : null, title: titles[mode],
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
    $("hudLead").textContent = !m ? "starting…" : m.settle != null
      ? `settling after your change: day ${Math.round(m.settle * m.settleDays)} of ${m.settleDays} (fast-forward)`
      : `${Math.round(m.t / 86400)} model days${m.meanDays < 29.5 ? ` · the averaged chart has ${Math.round(m.meanDays)} of 30 days` : ""}${sim.paused ? " · paused" : ""}`;
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
  const spd = is3 ? [[0.25, "¼ day a second"], [0.5, "½ day a second"], [1, "1 day a second"], [3, "3 days a second (about as fast as it can)"]] : [[1, "1 day a second"], [5, "5 days a second"], [15, "15 days a second (as fast as your computer allows)"]];
  if ($("simSpeed").dataset.model !== sim.model) { $("simSpeed").innerHTML = spd.map(([v, t]) => `<option value="${v}">${t}</option>`).join(""); $("simSpeed").dataset.model = sim.model; }
  for (const id of ["simFillRow", "simMeanRow", "simLandRow", "simRealRow"]) $(id).hidden = !is3;
  $("sim2dOnly").hidden = is3; $("simPinBtn").hidden = !is3;
  // every chart either model can draw (panel review round 2: the 2-D ones weren't reachable in free play)
  const modes = is3 ? [["uPsi", "north–south slice, averaged round the planet"], ["eqSlice", "west–east slice along the equator (the Walker circulation)"], ["uSfc", "the wind near the ground along latitude"]]
    : [["uPsi", "north–south slice: the east–west wind and the overturning"], ["T", "north–south slice: temperature"], ["pSurf", "temperature with the pressure surfaces"], ["Tanom", "what the circulation did to the temperature"], ["uSfc", "the wind near the ground along latitude"]];
  if ($("simChartMode").dataset.model !== sim.model) { $("simChartMode").innerHTML = modes.map(([v, l]) => `<option value="${v}">${l}</option>`).join(""); $("simChartMode").dataset.model = sim.model; }
  $("simChartMode").value = modes.some(([v]) => v === sim.chart) ? sim.chart : "uPsi";
  // with water vapour on the model uses its own 15-day radiation (moistTauAirDays) unless a step set it: say so, and
  // the slider does nothing then (panel review round 3)
  const tauNow = p.moist ? (p.tauAirDays ?? 15) : (p.tauAirDays ?? 40);
  $("simTauAir").value = String(tauNow); $("simTauAir").disabled = !!p.moist && p.tauAirDays == null;
  $("simTauAirVal").textContent = `${tauNow} days${p.moist && p.tauAirDays == null ? " (set by water vapour)" : tauNow === 40 ? " (Held & Suarez)" : ""}`;
  $("simTauRad").value = String(p.tauRadDays); $("simTauRadVal").textContent = `${p.tauRadDays} days`;
  $("simTauFric").value = String(p.tauFricDays); $("simTauFricVal").textContent = `${p.tauFricDays} day${p.tauFricDays === 1 ? "" : "s"}`;
  $("simLand").checked = !!p.land; $("simSst").checked = !!p.sst; $("simMountains").checked = !!p.mountains; $("simMoist").checked = !!p.moist; $("simEnso").value = p.enso || "";
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
// The 2-D model's fast-forward: 200 model days (2026-10-10: at the old 50 its Hadley edge still read 36° against a
// settled 26°, and easterlies covered every latitude near the ground; 200 days gives 25° and trades of 0.7 m/s, in
// about 6 seconds). The 3-D worker settles 40 days with 2-hour steps on its own.
const SIM2D_SETTLE = 200;
function simSettle2d() { if (sim.model !== "3d") sim.ffEnd = (sim.s?.t ?? 0) / 86400 + SIM2D_SETTLE; return SIM2D_SETTLE; }
function simChanged() { sim.lastPlanet = null; simPost({ type: "params", p: sim.p, settleDays: simSettle2d() }); syncSimControls(); simHud(); }
for (const [id, key] of [["simRot", "rotation"], ["simTilt", "tilt"], ["simContrast", "contrastK"], ["simInertia", "inertiaDays"]])
  $(id).addEventListener("input", (e) => { sim.p[key] = Number(e.target.value); simChanged(); });
$("simDay").addEventListener("input", (e) => { sim.p.day = Number(e.target.value); sim.s.day = sim.p.day; simChanged(); });
$("simSeasons").addEventListener("change", (e) => { sim.p.seasons = e.target.checked; if (!sim.p.seasons) sim.p.day = Math.round(simDay()); simChanged(); });
$("simSpeed").addEventListener("change", (e) => { sim.speed = Number(e.target.value); simPost({ type: "speed", speed: sim.speed }); });
$("simModel").addEventListener("change", (e) => setSimModel(e.target.value));
$("simLand").addEventListener("change", (e) => { sim.p.land = e.target.checked; simChanged(); simSurface(); });
$("simChartMode").addEventListener("change", (e) => { sim.chart = e.target.value; drawSimChart(); });
$("simSst").addEventListener("change", (e) => { sim.p.sst = e.target.checked; if (!sim.p.sst) sim.p.enso = null; simChanged(); });
$("simMountains").addEventListener("change", (e) => { sim.p.mountains = e.target.checked; simChanged(); });
$("simMoist").addEventListener("change", (e) => { sim.p.moist = e.target.checked; simChanged(); });
$("simTauAir").addEventListener("change", (e) => { sim.p.tauAirDays = Number(e.target.value); simChanged(); });
$("simTauRad").addEventListener("change", (e) => { sim.p.tauRadDays = Number(e.target.value); simChanged(); });
$("simTauFric").addEventListener("change", (e) => { sim.p.tauFricDays = Number(e.target.value); simChanged(); });
$("simEnso").addEventListener("change", (e) => { sim.p.enso = e.target.value || null; if (sim.p.enso) sim.p.sst = true; simChanged(); });
$("simFill").addEventListener("change", (e) => { sim.fill = e.target.value; updatePEFill(); simHud(); updateLegend(); dirty = true; });
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
// ---- lessons (simlessons.js): guided steps (docs/sim_lesson_design.md G9, G10) ----------------------
// Each step sets the planet, how it starts (held at rest, from rest, settled, from a saved spun-up state, or
// keep the running model), the camera, what's drawn, its text (basic, then "go deeper" and "expert" for
// those who want them), 1-3 "try it" controls and the one number the strip shows. Every step can be opened
// directly (#sim=<lesson>/<step>) and reset.
const simStepNow = () => (sim.lesson ? sim.lesson.steps[sim.step] : null);
$("simLesson").innerHTML += SIM_LESSONS.map((l) => `<option value="${l.id}">${l.title}</option>`).join("");
const simEsc = (t) => String(t ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
function applySimStep({ reset = false } = {}) {
  const st = simStepNow();
  $("simPlayer").hidden = !st;
  $("simAll").open = !st;
  document.body.classList.toggle("simlesson", !!st);
  if (!st) { sim.held = false; simStrip(); return; }
  const v = st.view ?? {}, start = st.start === "settle" ? "settled" : st.start ?? "keep";
  // keep only if the previous step left this planet settled (on a fresh page the defaults matched, and a "keep" step
  // showed an unsettled model: 2026-10-10)
  const sig = `${st.model ?? "2d"}:${JSON.stringify({ ...SIM_DEFAULTS, ...st.set })}`;
  const mode = start === "keep" && sim.lastPlanet !== sig ? st.fallback ?? "settled" : start;
  sim.lastPlanet = mode === "held" || mode === "rest" ? `${sig}:unsettled` : sig;
  sim.p = { ...SIM_DEFAULTS, ...st.set };
  setSimModel(st.model ?? "2d");
  sim.held = false; sim.fromRest = false; sim.mHist = []; sim.settled = false; sim.changed = false; sim.guessed = false; sim.guess = null; sim.ema = {};
  const tNow = sim.model === "3d" ? (sim.pe?.t ?? 0) / 86400 : (sim.s?.t ?? 0) / 86400;
  if (mode === "held" || mode === "rest") {
    simPost({ type: "reset", p: sim.p });
    sim.t0Days = 0; sim.fromRest = mode === "rest"; sim.held = mode === "held";
    sim.paused = sim.held; simPost({ type: "pause", paused: sim.paused });
  } else if (mode === "spunup" && sim.model === "3d") {
    // a saved settled state for this planet, when there is one (pe3d_states/): opens settled and averaged
    const saved = savedStateName(st.set);
    simPost({ type: "restart", fromRest: false, p: sim.p, from: st.from ?? "aqua", saved: PE3D_SAVED[saved] ? saved : undefined }); sim.t0Days = 0;
  }
  else if (sim.model !== "3d" && (mode === "settled" || mode === "spunup") && SIM2D_STATES[sig]) { sim.worker?.postMessage({ type: "load", p: sim.p, state: SIM2D_STATES[sig] }); sim.t0Days = 0; sim.ffEnd = null; }
  else if (mode === "spunup" || mode === "settled") { simPost({ type: "params", p: sim.p, settle: true, settleDays: simSettle2d() }); sim.t0Days = tNow; }
  else sim.t0Days = sim.t0Days ?? 0;
  if (!sim.held && sim.paused) { sim.paused = false; simPost({ type: "pause", paused: false }); }
  sim.s.day = sim.p.day;
  if (v.fill) sim.fill = v.fill;
  if (v.flow != null) { sim.flow = v.flow; sim.lastFlow = 0; }
  if (v.band && v.band !== sim.band) { sim.band = v.band; sim.parts.setBand(SIM_BANDS[sim.band]); }
  simSurface();
  if (v.mean != null) sim.chartMean = v.mean;
  sim.chart = v.chart ?? "uPsi"; sim.umax = v.umax; sim.side = v.side ?? null;
  if (v.speed) { sim.speed = v.speed; simPost({ type: "speed", speed: sim.speed }); }
  for (const k of ["exag", "vex"]) if (v[k]) sim[k] = v[k];
  for (const k of ["labels", "arrows", "textbook"]) if (v[k] != null) sim[k] = v[k];
  if (v.sun != null) sim.showSun = v.sun;
  if (v.slab != null && v.slab !== sim.slabOn && sim.model !== "3d") { sim.slabOn = v.slab; sim.slabLon = simViewLon() + 90; }
  sim.parts.setSlab(sim.slabOn ? { lon0: sim.slabLon, width: sim.slabW } : null);
  simCamera(st.camera ?? (sim.model === "3d" ? "globe-tilted" : "cutaway"));
  const n = sim.lesson.steps.length;
  $("simStepNo").textContent = ` step ${sim.step + 1} of ${n} `;
  applySimNav();
  try { history.replaceState(null, "", `${location.pathname}#sim=${sim.lesson.id}/${st.id ?? sim.step + 1}`); } catch { /* ignore */ }
  renderSimCard(); renderSimContents(); simBlind();
  if (sheet?.active() && sheet.get() === "peek") sheet.set("half");                // phones: the step card in view
  syncSimControls(); simHud(); drawSimChart(); simStrip(); updateLegend(); if (!$("simKey").hidden) renderSimKey(); dirty = true;
}
// The step's card: Predict (held steps), the basic text, what to look for, the try-it controls, the deeper layers.
function renderSimCard() {
  const st = simStepNow();
  if (!st) return;
  let open = {};
  try { open = JSON.parse(localStorage.getItem("np3d.simLayers") ?? "{}"); } catch { /* ignore */ }
  const look = Array.isArray(st.lookFor) ? st.lookFor : st.lookFor ? [st.lookFor] : [];
  const basic = st.basic ?? st.why;
  const tries = (st.tryIt ?? []).map((t, i) => {
    const cur = t.view ? sim[t.view] : sim.p[t.param] ?? null;
    const ctl = t.options
      ? `<select data-try="${i}">${t.options.map(([v, txt]) => `<option value='${JSON.stringify(v)}'${JSON.stringify(cur) === JSON.stringify(v) ? " selected" : ""}>${simEsc(txt)}</option>`).join("")}</select>`
      : `<input type="range" data-try="${i}" min="${t.min}" max="${t.max}" step="${t.step}" value="${sim.p[t.param] ?? t.min}"><span class="simval" id="simTryVal${i}"></span>`;
    return `<label>${simEsc(t.label)} ${ctl}<span class="simhint">${simEsc(t.expect ?? "")}</span></label>`;
  }).join("");
  const key = st.key && !st.basic ? `<table>${Object.entries(st.key).map(([k, t]) => `<tr><td>${simEsc(k)}</td><td>${simEsc(t)}</td></tr>`).join("")}</table>` : "";
  $("simCard").innerHTML = `<h4>${simEsc(st.title)}</h4>` + simNewHere(st)
    // hold: a step that stays still (sunlight alone): its prediction is answered by the next step, not by releasing it
    // Predict on every step that has one (panel review: it showed only while held, so three never appeared): held steps
    // release on "Show me"; others reveal the step after "I've made my guess"; the step's reveal text then says what to check
    // committed predictions (panel review round 2): pick an answer; it's recorded and the reveal speaks to it
    + (st.predict && !sim.guessed ? `<div class="sim-predict"><b>Predict:</b> ${simEsc(st.predict)}<div class="opts">${(st.predictOptions ?? []).map((o, k) => `<button class="mini" data-guess="${k}">${simEsc(o)}</button>`).join("")}</div>${st.predictOptions ? "" : st.hold ? '<button class="mini" id="simNextStep">Find out: next step ▶</button>' : sim.held ? '<button class="mini" id="simShowMe">Show me ▶</button>' : '<button class="mini" id="simGuessed">I\'ve made my guess: show me ▶</button>'}</div>`
      : st.predict && st.hold ? `<div class="sim-predict"><b>Your guess:</b> ${simEsc(st.predictOptions?.[sim.guess] ?? "made")}. <button class="mini" id="simNextStep">Find out: next step ▶</button></div>`
      : st.predict && (st.reveal || st.predictOptions) ? `<div class="sim-predict sim-reveal">${st.predictOptions && sim.guess != null ? `<b>You predicted:</b> ${simEsc(st.predictOptions[sim.guess])} ${sim.guess === st.predictAnswer ? "✓" : `✗ (the model: ${simEsc(st.predictOptions[st.predictAnswer])})`}<br>` : ""}${st.reveal ? `<b>What happened:</b> ${st.reveal}` : ""}</div>`
      : sim.held && !st.hold ? `<p><button class="mini" id="simShowMe">Let it move ▶</button></p>` : "")
    + key
    + `<p class="sim-basic">${basic ?? ""}</p>`
    + (st.tour ? `<ol class="sim-tour">${st.tour.map((x, i) => `<li><b>${simEsc(x.label)}</b> <button class="mini" data-flash="${x.el}">Show me</button><br>${simEsc(x.text)}</li>`).join("")}</ol>` : "")
    + (look.length ? `<p><b>Look for:</b></p><ul class="sim-look">${look.map((x) => `<li>${x}</li>`).join("")}</ul>` : "")
    + `<p class="simnote" id="simNote"></p>`
    + (tries ? `<div class="sim-try"><b>Try it</b>${tries}<p class="sim-changed" id="simChanged" hidden>You've changed this step.</p><button class="mini" id="simResetStep">Reset this step</button></div>` : "")
    + (st.deeper ? `<details data-layer="deeper"${open.deeper ? " open" : ""}><summary>Go deeper ▸</summary><p>${st.deeper}</p></details>` : "")
    + (st.expert ? `<details data-layer="expert"${open.expert ? " open" : ""}><summary>Expert ▸</summary><p>${st.expert}</p></details>` : "")
    + (st.onWater ? `<p class="sim-water"><b>On the water:</b> ${st.onWater}</p>` : "")
    // the bridge to the real atmosphere (panel review round 2): the Forecast mode's matching question
    + (st.forecast && QUESTIONS.find((q) => q.id === st.forecast && questionOk(q)) ? `<p><button class="mini" id="simToForecast">See it in today's real forecast →</button> <span class="simhint">${simEsc(QUESTIONS.find((q) => q.id === st.forecast).label)}</span></p>` : "")
    + (SIM_HEMI[st.id] && hemi && NH_FORECAST ? `<p><button class="mini" id="simToHemi">🌐 See it in today's real hemisphere →</button> <span class="simhint">${simEsc(HEMI_QUESTIONS.find((q) => q.id === SIM_HEMI[st.id]).label)}</span></p>` : "")
    + simRealDays(st)
    + simQuizHtml(st);
  for (const a of $("simCard").querySelectorAll("a[data-simcase]")) a.addEventListener("click", (e) => { e.preventDefault(); exitSim(); if (openCase(a.dataset.simcase, 0)) showTab("cases"); });
  $("simToHemi")?.addEventListener("click", () => { const qid = SIM_HEMI[st.id]; exitSim(); zoomOutTo(qid); });
  $("simShowMe")?.addEventListener("click", () => { sim.guessed = true; simRelease(); });
  for (const b of $("simCard").querySelectorAll("button[data-q]")) b.addEventListener("click", () => simAnswer(Number(b.dataset.q), Number(b.dataset.o)));
  for (const b of $("simCard").querySelectorAll("button[data-retry]")) b.addEventListener("click", () => { delete sim.quizAns[sim.lesson.id][Number(b.dataset.retry)]; renderSimCard(); });
  $("simGuessed")?.addEventListener("click", () => { sim.guessed = true; simBlind(); renderSimCard(); });
  for (const b of $("simCard").querySelectorAll("button[data-guess]")) b.addEventListener("click", () => {
    sim.guess = Number(b.dataset.guess); sim.guessed = true; simBlind();
    try { const g = JSON.parse(localStorage.getItem("np3d.simGuesses") ?? "{}"); g[st.id] = sim.guess; localStorage.setItem("np3d.simGuesses", JSON.stringify(g)); } catch { /* ignore */ }
    if (sim.held && !st.hold) simRelease(); else renderSimCard();
  });
  $("simNextStep")?.addEventListener("click", () => $("simNext").click());
  $("simToForecast")?.addEventListener("click", () => { exitSim(); qSel.value = st.forecast; qSel.dispatchEvent(new Event("change")); });
  for (const b of $("simCard").querySelectorAll("button[data-flash]")) b.addEventListener("click", () => {
    const el = $(b.dataset.flash); if (!el) return;
    if (b.dataset.flash === "simAll") el.open = true;
    el.scrollIntoView?.({ block: "nearest" }); el.classList.remove("sim-flash"); void el.offsetWidth; el.classList.add("sim-flash");
    setTimeout(() => el.classList.remove("sim-flash"), 2600);
  });
  $("simResetStep")?.addEventListener("click", () => applySimStep({ reset: true }));
  for (const d of $("simCard").querySelectorAll("details[data-layer]")) d.addEventListener("toggle", () => {
    try { const o = JSON.parse(localStorage.getItem("np3d.simLayers") ?? "{}"); o[d.dataset.layer] = d.open; localStorage.setItem("np3d.simLayers", JSON.stringify(o)); } catch { /* ignore */ }
  });
  for (const inp of $("simCard").querySelectorAll("[data-try]")) {
    const t = st.tryIt[Number(inp.dataset.try)], val = $(`simTryVal${inp.dataset.try}`), show = () => { if (val) val.textContent = `${sim.p[t.param]}${t.unit ?? ""}`; };
    show();
    // a view control (t.view: "fill" or "chart"): changes what's drawn, not the planet
    if (t.view) { inp.addEventListener("change", () => { sim[t.view] = JSON.parse(inp.value); if (t.view === "fill") updatePEFill(); drawSimChart(); updateLegend(); simHud(); dirty = true; }); continue; }
    inp.addEventListener(t.options ? "change" : "input", () => {
      sim.p[t.param] = t.options ? JSON.parse(inp.value) : Number(inp.value);
      if (t.param === "enso" && sim.p.enso) sim.p.sst = true;
      show(); sim.changed = true; $("simChanged").hidden = false; sim.mHist = []; sim.settled = false;
      // settle: false (the Coriolis step) lets the change play out at the step's speed instead of fast-forwarding
      sim.lastPlanet = null;
      if (sim.held) { simPost({ type: "reset", p: sim.p }); simPost({ type: "pause", paused: true }); syncSimControls(); simHud(); }      // still held: a new equilibrium
      else if (t.settle === false) { simPost({ type: "params", p: sim.p, settleDays: 0 }); syncSimControls(); simHud(); } else simChanged();
      if (sim.model === "3d") updatePEFill();
    });
  }
}
// Checks for understanding (panel review D4): on a lesson's last step, its questions, answered from the screen, with
// an explanation either way; a lesson whose questions are all answered right gets a tick in Contents (this browser only).
const simQuizDone = () => { try { return JSON.parse(localStorage.getItem("np3d.simQuiz") ?? "{}"); } catch { return {}; } };
function simQuizHtml(st) {
  const l = sim.lesson;
  const lastCore = [...l.steps].reverse().find((x) => x.core);
  if (!l?.quiz || (st !== l.steps[l.steps.length - 1] && !(sim.coreOnly && st === lastCore))) return "";
  const a = (sim.quizAns ??= {})[l.id] ?? {};
  return `<div class="sim-quiz"><b>Check yourself</b>${l.quiz.map((q, i) => `<p class="q">${i + 1}. ${simEsc(q.q)}</p><div class="opts">${q.options.map((o, k) => {
    const chosen = a[i] === k, cls = chosen ? (k === q.correct ? "right" : "wrong") : a[i] != null && k === q.correct ? "right" : "";
    return `<button class="mini ${cls}" data-q="${i}" data-o="${k}">${simEsc(o)}</button>`; }).join("")}</div>${a[i] != null ? `<p class="why">${a[i] === q.correct ? "Right. " : "Not quite. "}${simEsc(q.why)}</p>${a[i] !== q.correct ? `<button class="mini" data-retry="${i}">Try again</button>` : ""}` : ""}`).join("")}${l.recap ? `<p class="recap"><b>What this lesson added:</b> ${l.recap}</p>` : ""}</div>`;
}
function simAnswer(i, k) {
  const l = sim.lesson, a = ((sim.quizAns ??= {})[l.id] ??= {});
  if (a[i] != null) return;
  a[i] = k;
  if (l.quiz.every((q, j) => a[j] === q.correct)) { try { const d = simQuizDone(); d[l.id] = true; localStorage.setItem("np3d.simQuiz", JSON.stringify(d)); } catch { /* ignore */ } }
  renderSimCard(); renderSimContents();
}
// On a step that asks for a prediction while the model is already running, cover the chart and the number until the
// guess is in (otherwise the answer is on screen before the question: panel review round 2).
function simBlind() {
  const st = simStepNow(), blind = !!(st?.predict && !st.hold && !sim.held && !sim.guessed);
  document.body.classList.toggle("sim-blind", blind);
  // the globe's colour can give the answer away too (panel review round 3: green rising air in the west, the rain
  // band): until the guess it shows a neutral colour (st.predictFill), then the step's own
  if (st?.predictFill && sim.model === "3d") {
    const want = blind ? st.predictFill : st.view?.fill ?? sim.fill;
    if (sim.fill !== want) { sim.fill = want; updatePEFill(); updateLegend(); }
  }
}
// "New in this step": what the step changed against the previous one, so each switch of the set-up is explicit
// (panel review round 3).
const SIM_SET_WORDS = {
  rotation: (v) => (v === 0 ? "no spin" : `spin ${v}× Earth's`), tilt: (v) => `tilt ${v}°`, day: (v) => `date ${dayLabel(v)}`, seasons: (v) => (v ? "seasons running" : "date held fixed"),
  land: (v) => (v ? "+ Earth's continents" : "− continents"), sst: (v) => (v ? "+ the real sea (observed)" : "− the real sea's pattern"), mountains: (v) => (v ? "+ real mountains" : "− mountains"),
  moist: (v) => (v ? "+ water vapour and rain (sea counted once, 15-day radiation)" : "− water vapour"), enso: (v) => (v ? `sea: ${SIM_SURFACE.events[v]?.label ?? v}` : "a normal sea"),
  tauAirDays: (v) => `radiation ${v} days`, inertiaDays: (v) => `surface heat storage ${v} days`, contrastK: (v) => `sunlight contrast ${v} K`, tauRadDays: (v) => `radiation ${v} days`, tauFricDays: (v) => `friction ${v} days`,
};
function simNewHere(st) {
  const f = simFlat(), i = f.findIndex((x) => x.l === sim.lesson && x.k === sim.step), prev = i > 0 ? f[i - 1] : null;
  const ps = prev ? prev.l.steps[prev.k] : null, out = [];
  const m0 = ps?.model ?? "2d", m1 = st.model ?? "2d";
  if (!ps || m0 !== m1) out.push(m1 === "3d" ? "the 3-D model (storms possible)" : "the 2-D model (averaged round the planet)");
  const a = { ...SIM_DEFAULTS, ...(ps?.set ?? {}) }, b = { ...SIM_DEFAULTS, ...st.set };
  for (const k of Object.keys(SIM_SET_WORDS)) if (ps && JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)) out.push(SIM_SET_WORDS[k](b[k]));
  return out.length ? `<p class="sim-new"><b>New here:</b> ${out.map(simEsc).join(" · ")}</p>` : "";
}
// Every step of every lesson, clickable; ★ the core path (about an hour), ✓ lessons whose check you've passed.
function renderSimContents() {
  const done = simQuizDone(), coreOnly = !!sim.coreOnly;
  $("simContents").innerHTML = `<label class="sim-core"><input type="checkbox" id="simCoreOnly"${coreOnly ? " checked" : ""}> core path only (★, about an hour)</label>`
    + SIM_LESSONS.map((l) => `<div class="sim-cl">${simEsc(l.title)}${done[l.id] ? " ✓" : ""}</div>`
    + l.steps.map((s, k) => (coreOnly && !s.core ? "" : `<a href="#" data-l="${l.id}" data-k="${k}" class="${l === sim.lesson && k === sim.step ? "on" : ""}">${s.core ? "★ " : ""}${k + 1}. ${simEsc(s.title)}</a>`)).join("")).join("");
  $("simCoreOnly").addEventListener("change", (e) => { sim.coreOnly = e.target.checked; renderSimContents(); applySimNav(); });
  for (const a of $("simContents").querySelectorAll("a")) a.addEventListener("click", (e) => { e.preventDefault(); simGo(a.dataset.l, Number(a.dataset.k)); $("simContents").hidden = true; });
}
// Simulate steps whose idea shows in today's real hemisphere, and the hemisphere question that shows it (2026-10-17).
const SIM_HEMI = { jet: "jet", westerlies: "jet", "east-asian-jet": "jet", teleconnection: "jet", growth: "count", "lows-highs": "coming",
  "siberian-high": "cold", fronts: "cold", aleutian: "trades", trades: "trades" };
// Open the hemisphere (the forecast, at the time on screen) with one of its guided questions.
async function zoomOutTo(qid) {
  if (!hemi) return;
  if (arch.on) exitArchive();
  await enterHemisphere();
  if (hemi.on && hemi.src.kind === "forecast") { syncHemiQuestions(); $("hemiQSel").value = qid; applyHemiQuestion(qid); }
}
// the bridge to the case studies (simcases.js): real days that show this step's idea, the ones still in the archive
function simRealDays(st) {
  const links = simCaseLinks(st.id, CASES).filter((x) => caseStatus(x.case, ALL_ARCH_DATES).ok);
  if (!links.length) return "";
  return `<details class="sim-real"><summary>On a real day (${links.length} case${links.length === 1 ? "" : "s"}) ▸</summary><p class="simhint">Compare ${simEsc(links[0].compare)}.</p><ul>${
    links.map((x) => `<li><a href="#" data-simcase="${x.case.id}">${simEsc(x.case.title)}</a></li>`).join("")}</ul></details>`;
}
function simGo(lessonId, k) {
  sim.lesson = SIM_LESSONS.find((l) => l.id === lessonId) ?? null; sim.step = Math.max(0, Math.min(k, (sim.lesson?.steps.length ?? 1) - 1));
  $("simLesson").value = sim.lesson?.id ?? "";
  applySimStep();
}
$("simLesson").addEventListener("change", (e) => simGo(e.target.value, 0));
// The principles (simlessons.js SIM_PRINCIPLES): each with the steps where it's seen, as links.
$("simPrinciplesBody").innerHTML = `<p class="simhint">The few rules the models obey; everything on the screen comes out of them.</p><dl>${SIM_PRINCIPLES.map((pr) => `<dt>${simEsc(pr.name)}</dt><dd>${simEsc(pr.plain)}<span class="eq">${simEsc(pr.eq)}</span>Seen in: ${pr.seen.map(([l, sid]) => { const L = SIM_LESSONS.find((x) => x.id === l), k = L?.steps.findIndex((x) => x.id === sid) ?? -1; return k < 0 ? "" : `<a href="#" data-pl="${l}" data-pk="${k}">${simEsc(L.steps[k].title)}</a>`; }).filter(Boolean).join(", ")}</dd>`).join("")}</dl>`;
for (const a of $("simPrinciplesBody").querySelectorAll("a[data-pl]")) a.addEventListener("click", (e) => { e.preventDefault(); simGo(a.dataset.pl, Number(a.dataset.pk)); $("simPlayer")?.scrollIntoView?.({ block: "start" }); });
// ◀ ▶ walk every step, or only the ★ core path when Contents' "core path only" is ticked (panel review round 2)
const simFlat = () => SIM_LESSONS.flatMap((l) => l.steps.map((st, k) => ({ l, k, core: !!st.core }))).filter((x) => !sim.coreOnly || x.core || (x.l === sim.lesson && x.k === sim.step));
function applySimNav() {
  const f = simFlat(), i = f.findIndex((x) => x.l === sim.lesson && x.k === sim.step);
  $("simPrev").disabled = i <= 0; $("simNext").disabled = i >= f.length - 1;
}
function simWalk(d) {
  if (!sim.lesson) return;
  const f = simFlat(), i = f.findIndex((x) => x.l === sim.lesson && x.k === sim.step), n = f[i + d];
  if (n) simGo(n.l.id, n.k);
}
$("simPrev").addEventListener("click", () => simWalk(-1));
$("simNext").addEventListener("click", () => simWalk(1));
$("simContentsBtn").addEventListener("click", () => { $("simContents").hidden = !$("simContents").hidden; });
// A step link (#sim=<lesson>/<step id or number>) opens the Simulate mode at that step.
async function simFromHash() {
  const m = /[#&]sim=([a-z0-9-]+)\/([a-z0-9-]+)/.exec(location.hash);
  if (!m) return false;
  const l = SIM_LESSONS.find((x) => x.id === m[1]);
  if (!l) return false;
  const k = /^\d+$/.test(m[2]) ? Number(m[2]) - 1 : Math.max(0, l.steps.findIndex((s) => s.id === m[2]));
  await simData(); enterSim(); simGo(l.id, k);
  return true;
}
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
// opens on "The big picture" by name: today's set-up questions are put at the top of the list when afd.json arrives
// (after this line today, but not something to rely on)
applyQuestion(QUESTIONS.find((q) => q.id === "big-picture") ?? QUESTIONS[0], true);

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
    pvol = new ParticleVolume(manifest.grid, geo, { count: LITE ? 4000 : 12000, colorAt: p3Color });
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
  cv.onpointermove = cv.onpointerdown = (e) => {
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
    return { ...(arch.saved ?? captureForecastState()), camera: hemi?.on && hemiSaved ? hemiSaved.camera : [...camera.position.toArray(), ...controls.target.toArray(), camera.fov],
      ...(hemi?.on ? { scope: "nh", nh: { ...hemi.show } } : {}),
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
    barbs: show.barbs, hl: [...hlLevels], relief, vex: Math.pow(10, Number(vexSlider.value)), satellite: satOn, satEnhance, satChannel, notes: note.items,
    chart: opcProduct || null, chartOpacity: opcLayer ? opcLayer.uniforms.opacity.value : 1,
    slice: sec.on ? { mode: sec.mode, pos: sec.pos, turn: sec.turn, thick: sec.thick, qty: sec.qty, lines: sec.lines, arrows: sec.arrows } : null,
    volume: vol.on ? { qty: vol.qty, thr: vol.thr, window: false, mode: vol.mode } : null, hUnit, regionQty: roi.qty,
    region: { shape: roi.shape, zLo: roi.zLo, thick: roi.thick, wall: roi.shape === "wall" ? { mode: sec.mode, pos: sec.pos, turn: sec.turn, thick: sec.thick } : null,
      box: roi.shape === "box" ? { ...roi.box } : null },
    hplane: hp.on ? { zKm: hp.zKm, qty: hp.qty, lines: hp.lines } : null, regionDiff: roi.diff,
    flow3d: fl3.on ? { count: fl3.count, hours: fl3.hours, vertical: fl3.vertical, colorBy: fl3.colorBy } : null,
    p3: p3.on ? { zKm: p3.zKm, thickKm: p3.thickKm, colorBy: p3.colorBy, density: p3.density, vertical: p3.vertical } : null,
    // the hemisphere: its scope and layers; the camera saved is the Pacific one it returns to
    ...(hemi?.on ? { scope: "nh", nh: { ...hemi.show }, camera: hemiSaved.camera, globe: hemiSaved.morph > 0.5 } : {}),
  };
}
function applyState(st) {
  const notes = [];
  if (hemi?.on) exitHemisphere(true);      // the Pacific part first; a shared hemisphere view goes on top below
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
  if (sat && st.satellite != null) { satOn = st.satellite; $("satToggle").checked = satOn; satEnhance = st.satEnhance; $("satEnhance").checked = satEnhance; satChannel = st.satChannel === "wv" && satWV ? "wv" : "ir"; syncSatControls(); }
  if (Array.isArray(st.notes)) { note.items = st.notes.slice(0, MAX_NOTES); drawNotes(); }
  if (OPC) {
    { const ch = CHART_ALIAS[st.chart] ?? st.chart; setOpcProduct(ch && OPC_PRODUCTS[ch] ? ch : ""); }
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
  if (st.scope === "nh") { if (hemi) enterHemisphere({ instant: true, show: st.nh, keepTime: true }); else notes.push("its Northern Hemisphere view isn't in this build"); }
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
  arch.i = best; arch.comp = null;
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
// The Northwest pattern library (user request 2026-10-14): filter the list by weather pattern and season;
// a pattern's card (cases.js PATTERNS) heads its cases.
const caseFilter = { pattern: "", season: "", view: "list" };
function casePatternCard(t) {
  const p = PATTERNS[t];
  return `<div class="pattern-card"><p><b>${p.label}</b> · <span class="when">${p.when}</span></p><p><b>Aloft:</b> ${p.aloft}. <b>At the surface:</b> ${p.surface}.</p>`
    + `<p><b>The numbers:</b> ${p.numbers}. <b>Maps:</b> ${p.maps}.</p><p>${p.note}</p>`
    + compositeHtml(t) + patternZoomHtml(t) + `</div>`;
}
// The pattern seen from the pole (2026-10-17): its cases' Zoom out steps, where the archive has their day.
function patternZoomHtml(t) {
  if (!hemi || !ARCH?.hemisphere) return "";
  const z = CASES.filter((c) => c.patterns?.includes(t) && caseStatus(c, ALL_ARCH_DATES).ok)
    .map((c) => ({ c, k: c.steps.findIndex((st) => st.nh) })).filter((x) => x.k >= 0);
  if (!z.length) return "";
  return `<p class="note">🌐 From the pole: ${z.map((x) => `<a href="#" data-zoomcase="${x.c.id}.${x.k}">${x.c.title}</a>`).join(" · ")}. Each opens the case at its Zoom out step: the hemisphere's waves behind this pattern.</p>`;
}
function compositeHtml(t) {
  const C = COMPOSITES[t];
  const WHY_NONE = { hurricane: "No composite map: hurricanes in different places would average away to nothing.",
    tropical: "No composite map: the remnants' moisture came in on different paths each time (Baja to Idaho, the subtropics to Washington), so the average shows only the usual moisture, not a plume. We checked." };
  if (!C) return `<p class="note">${WHY_NONE[t] ?? "No composite map yet: it needs at least three separate events of this pattern."}</p>`;
  const n = C.days.filter(([date]) => ALL_ARCH_DATES.includes(date)).length;
  if (n < 3) return "";
  return `<p><button class="mini" data-composite="${t}">Composite map: the average of ${n} days ▸</button> <span class="note">Look for ${C.look}. One day from each case's event, averaged: the shape they share stands out, each day's details fade.</span></p>`;
}
function renderCaseList() {
  const dates = ALL_ARCH_DATES;
  const REGIONS = { pnw: "Pacific Northwest", hawaii: "Hawaiʻi", pacific: "Around the North Pacific" };
  let last = null;
  const { pattern, season } = caseFilter, filtering = !!(pattern || season);
  const shown = CASES.filter((c) => !filtering || (c.patterns && (!pattern || c.patterns.includes(pattern)) && (!season || c.season === season || c.season === "several")));
  const SEASON_NAMES = { winter: "Winter (Dec–Feb)", spring: "Spring (Mar–May)", summer: "Summer (Jun–Aug)", fall: "Fall (Sep–Nov)" };
  const group = (r, name) => `<optgroup label="${name}">${Object.entries(PATTERNS).filter(([, p]) => p.region === r).map(([k, p]) => `<option value="${k}"${k === pattern ? " selected" : ""}>${p.label}</option>`).join("")}</optgroup>`;
  const filterHtml = `<div class="case-filter"><label>Weather pattern <select id="casePattern"><option value="">All cases</option>${group("pnw", "Pacific Northwest")}${group("hawaii", "Hawaiʻi")}</select></label>`
    + `<label>Season <select id="caseSeason"><option value="">Any</option>${SEASONS.filter((x) => x !== "several").map((x) => `<option value="${x}"${x === season ? " selected" : ""}>${SEASON_NAMES[x]}</option>`).join("")}</select></label></div>`
    + (pattern ? casePatternCard(pattern) : "")
    + (filtering ? `<p class="note">${shown.length} case${shown.length === 1 ? "" : "s"}${shown.length ? "" : ": none yet for this pattern in this season"}.</p>` : "");
  const viewHtml = `<div class="case-view" role="radiogroup" aria-label="Show the cases as"><button class="mini" role="radio" data-listview="list" aria-checked="${caseFilter.view === "list"}">List</button><button class="mini" role="radio" data-listview="calendar" aria-checked="${caseFilter.view === "calendar"}">Calendar</button></div>`;
  if (caseFilter.view === "calendar" && CASES.length && YEAR_DAYS.length) {
    // the cases by month of the year, whatever the year: what each month usually brings, and a real example of it
    const MN = Array.from({ length: 12 });
    const monthsOf = (c) => [...new Set(c.steps.map((x) => +x.day.slice(5, 7) - 1))];
    const chip = (c) => { const st = caseStatus(c, dates); return `<button class="case-chip" data-case="${c.id}"${st.ok ? "" : " disabled"} title="${c.title.replace(/"/g, "&quot;")}">${c.title.includes(":") ? c.title.slice(c.title.indexOf(":") + 1).trim() : c.title}</button>`; };
    const chips = (m, r) => shown.filter((c) => c.region === r && monthsOf(c).includes(m)).map(chip).join("");
    const now = new Date().getMonth();
    caseFilter.open ??= new Set([now]);
    const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const row = (m, r, name, typ) => { const c = chips(m, r); return typ || c ? `<div class="cal-row"><span class="cal-reg">${name}</span>${typ ? `<span class="typ">${typ}</span>` : ""}${c ? `<span class="cal-chips">${c}</span>` : ""}</div>` : ""; };
    $("caseList").innerHTML = viewHtml + filterHtml + `<p class="note">Each month: what it usually brings, and the cases that happened then, whatever the year.</p><div class="case-cal">${
      MN.map((n, m) => { const k = (r) => shown.filter((c) => c.region === r && monthsOf(c).includes(m)).length;
        const count = [["NW", k("pnw")], ["HI", k("hawaii")], ["Pacific", k("pacific")]].filter(([, x]) => x).map(([r, x]) => `${r} ${x}`).join(" · ") || "no cases yet";
        return `<details class="cal-month${m === now ? " now" : ""}"${caseFilter.open.has(m) ? " open" : ""} data-month="${m}"><summary><b>${MONTH_NAMES[m]}</b>${m === now ? " <small>(this month)</small>" : ""}<span class="cal-count">${count}</span></summary>${
        row(m, "pnw", "Northwest", CASE_MONTHS[m].pnw)}${row(m, "hawaii", "Hawaiʻi", CASE_MONTHS[m].hawaii)}${row(m, "pacific", "North Pacific", "")}</details>`; }).join("")}</div>`;
  } else
  $("caseList").innerHTML = CASES.length && YEAR_DAYS.length ? viewHtml + filterHtml + shown.map((c) => {
    const st = caseStatus(c, dates), head = c.region !== last ? `<p class="case-region">${REGIONS[c.region] ?? ""}</p>` : "";
    last = c.region;
    return `${head}<button class="case-item" data-case="${c.id}"${st.ok ? "" : " disabled"}><b>${c.title}</b><span class="when">${c.when} · ${c.where}</span><span>${c.summary}</span>${c.patterns ? `<span class="case-tags">${c.patterns.map((t) => PATTERNS[t].label).join(" · ")}</span>` : ""}${st.ok ? "" : `<span class="when">Its days aren't in this build's archive yet.</span>`}</button>`;
  }).join("") : `<p class="note">No cases: this build has no past-year archive.</p>`;
  for (const b of $("caseList").querySelectorAll("[data-case]")) b.addEventListener("click", () => openCase(b.dataset.case, 0));
  for (const [id, k] of [["casePattern", "pattern"], ["caseSeason", "season"]]) $(id)?.addEventListener("change", (e) => { caseFilter[k] = e.target.value; renderCaseList(); });
  for (const b of $("caseList").querySelectorAll("[data-composite]")) b.addEventListener("click", () => showComposite(b.dataset.composite));
  for (const a of $("caseList").querySelectorAll("a[data-zoomcase]")) a.addEventListener("click", (e) => { e.preventDefault(); const [id, k] = a.dataset.zoomcase.split("."); openCase(id, Number(k)); });
  // data-listview, not data-view: that names the camera's views (setView), and every [data-view] is theirs
  for (const v of $("caseList").querySelectorAll("[data-listview]")) v.addEventListener("click", () => { caseFilter.view = v.dataset.listview; renderCaseList(); });
  // the months opened stay open across re-renders (a filter change, coming back from a case)
  for (const d of $("caseList").querySelectorAll(".cal-month")) d.addEventListener("toggle", () => { caseFilter.open[d.open ? "add" : "delete"](+d.dataset.month); });
}
function openCase(id, k = 0) {
  const c = CASES.find((x) => x.id === id);
  if (!c || !caseStatus(c, ALL_ARCH_DATES).ok) return false;
  if (hemi?.on) exitHemisphere(true);   // a case starts on the Pacific; a hemisphere step zooms out itself
  caseState.c = c; caseState.obsKind = null; caseState.obsHidden = null; caseState.obsChosen = false;
  $("caseList").hidden = true; $("casePlayer").hidden = false; $("caseIntro").hidden = true;     // room for the step
  document.body.classList.add("case-open"); sheet?.refresh();
  { let seen = false; try { seen = localStorage.getItem("np3d.caseHelpSeen") === "1"; } catch { /* private mode */ } caseHelpSet(!seen); }
  $("caseTitle").textContent = c.title; $("caseWhen").textContent = `${c.when} · ${c.where}`;
  // its patterns, each a link back to the list filtered to that pattern, with its card
  if (c.patterns) {
    const tg = document.createElement("span");
    tg.className = "case-tags"; tg.style.display = "block";
    tg.innerHTML = "Patterns: " + c.patterns.map((t) => `<a href="#" data-pat="${t}">${PATTERNS[t].label}</a>`).join(" · ");
    for (const a of tg.querySelectorAll("a")) a.addEventListener("click", (e) => { e.preventDefault(); closeCase(); caseFilter.pattern = a.dataset.pat; caseFilter.season = ""; renderCaseList(); });
    $("caseWhen").append(tg);
  }
  // the Simulate steps that explain it (simcases.js), each a link into the simulator
  const simSteps = SIM_LESSONS.flatMap((l) => l.steps.map((st, k) => ({ l, k, st }))).filter((x) => simCaseLinks(x.st.id, [c]).length);
  if (simSteps.length) {
    const sl = document.createElement("span");
    sl.className = "case-tags"; sl.style.display = "block";
    sl.innerHTML = "In the simulator: " + simSteps.map((x) => `<a href="#" data-sl="${x.l.id}" data-sk="${x.k}" title="${x.l.title.replace(/"/g, "&quot;")}">${x.st.title}</a>`).join(" · ");
    for (const a of sl.querySelectorAll("a")) a.addEventListener("click", (e) => {
      e.preventDefault();
      simData().then(() => { closeCase(); enterSim(); simGo(a.dataset.sl, Number(a.dataset.sk)); });
    });
    $("caseWhen").append(sl);
  }
  $("caseSources").innerHTML = c.sources.map((s) => `<a href="${s.url}" target="_blank" rel="noopener">${s.label}</a>`).join(" · ");
  showCaseStep(Math.max(0, Math.min(c.steps.length - 1, k)));
  return true;
}
function closeCase() {
  caseChartLayer.hide(); dirty = true;
  hr.step = null; if (hr.on) hrrrOff();
  casePlay(false);
  caseState.c = null;
  dirty = true;
  if (archEvent) { setArchDays(null); if (arch.on) archGo(ARCH_DAYS.length - 1); }     // back to the year
  $("caseList").hidden = false; $("casePlayer").hidden = true; $("caseIntro").hidden = false;
  document.body.classList.remove("case-open"); sheet?.refresh();
}
// The forecasters' own charts in a case step (casebrief.js chartsHtml; user request 2026-10-09):
// a menu of kinds, and ◀ ▶ through each kind's times. Switching kind keeps the time as near as it can.
function showCaseCharts(br, sel) {
  const box = $("caseText").querySelector(".case-charts");
  if (!box || !br) { caseChartLayer.hide(); dirty = true; return; }
  box.innerHTML = chartsHtml(br, { ...sel, ...caseChartView }, (f) => new URL(f, import.meta.url).href);
  const S = br.charts.series, cur = S.find((x) => x.id === sel.series), f = cur.frames[Math.min(sel.i, cur.frames.length - 1)];
  // on the map: the chart in place over the 3-D view
  caseChartLayer.uniforms.opacity.value = caseChartView.opacity;
  if (f.rect && caseChartView.onMap) {
    const want = f.file;
    caseChartView.file = want;
    caseChartLayer.show(new URL(f.file, import.meta.url).href, () => { caseChartLayer.mesh.visible = caseChartView.onMap && caseChartView.file === want; dirty = true; }, f.box, f.rect, f.size);
  }
  else caseChartLayer.hide();
  dirty = true;
  box.querySelector(".bc-onmap")?.addEventListener("change", (e) => { caseChartView.onMap = e.target.checked; showCaseCharts(br, sel); });
  box.querySelector(".bc-opacity")?.addEventListener("input", (e) => { caseChartView.opacity = Number(e.target.value); caseChartLayer.uniforms.opacity.value = caseChartView.opacity; dirty = true; });
  box.querySelector(".bc-series").addEventListener("change", (e) => showCaseCharts(br, chartFrame(br, { series: e.target.value, valid: f.valid })));
  box.querySelector(".bc-prev").addEventListener("click", () => showCaseCharts(br, { series: sel.series, i: sel.i - 1 }));
  box.querySelector(".bc-next").addEventListener("click", () => showCaseCharts(br, { series: sel.series, i: sel.i + 1 }));
}
// Full size, on top of the page (user report 2026-10-09: opening a chart in a new tab took some
// browsers -- the app's pane, phones -- away from the case, and back lost the place). Click the image
// to switch between fitting the window and its own pixels (scroll to pan there); ✕, Esc or a click
// outside closes it. The link stays as a fallback without the page's script.
function openZoom(src, caption) {
  const box = $("zoomBox"), img = $("zoomImg");
  img.src = src; img.alt = caption; $("zoomCaption").textContent = caption;
  box.classList.remove("actual");
  box.hidden = false;
}
$("caseText").addEventListener("click", (e) => {
  const a = e.target.closest("a.zoom");
  if (!a) return;
  e.preventDefault();
  openZoom(a.href, a.querySelector("img")?.alt ?? "");
});
$("zoomImg").addEventListener("click", (e) => { e.stopPropagation(); $("zoomBox").classList.toggle("actual"); });
$("zoomClose").addEventListener("click", () => { $("zoomBox").hidden = true; });
$("zoomBox").addEventListener("click", (e) => { if (e.target === $("zoomBox") || e.target.id === "zoomFrame") $("zoomBox").hidden = true; });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("zoomBox").hidden) { $("zoomBox").hidden = true; e.stopPropagation(); } }, true);
// The step card as a lesson (expert panel review, 2026-10-14): the story first, its question (the answer hidden in
// "quiz me" mode, shown in "just teach"), what to look for; then folded sections: the map key, the high-resolution
// hours, what the stations measured and the forecasters' numbers, each with a one-line teaser and remembered open or
// closed for the session. A sticky header keeps ◀ ▶ in reach; a button at the end names the next step.
const CASE_SEC_KEY = "np3d.caseSec.";
// remembered per case (panel round 2: a section opened in one case shouldn't open in an unrelated one)
const secKey = (x) => `${CASE_SEC_KEY}${caseState.c?.id}.${x}`;
const secOpen = (x) => { try { return sessionStorage.getItem(secKey(x)) === "1"; } catch { return false; } };
const secRemember = (x, open) => { try { sessionStorage.setItem(secKey(x), open ? "1" : "0"); } catch { /* private mode: fine */ } };
let caseQuiz = (() => { try { return localStorage.getItem("np3d.caseQuiz") !== "0"; } catch { return true; } })();
const caseSec = (x, title, teaser, inner, act = "") => `<details class="case-sec" data-x="${x}"${secOpen(x) ? " open" : ""}><summary><b>${title}</b>`
  + `<span class="teaser" data-teaser="${x}">${teaser}</span>${act ? `<span class="teaser do">${act}</span>` : ""}</summary>${inner}</details>`;
// "<p><b>Ask:</b> question? (answer)</p>": the answer behind a button in quiz mode, in place when teaching
// The case's check-your-understanding question (cases.js check), on its last step under the recap: one question
// across the steps, shown or hidden by Quiz | Teach like the steps' own.
const caseCheckHtml = (c) => (c.check ? `<div class="case-check"><p class="case-check-h"><b>Check your understanding</b></p>${glossify(askify(pairUnits(`<p><b>Ask:</b> ${c.check}</p>`)))}</div>` : "");
function askify(html) {
  return html.replace(/<p><b>Ask:<\/b>\s*([\s\S]*?)<\/p>/g, (m, inner) => {
    const q = inner.match(/^([\s\S]*?\?)\s*\(([\s\S]*)\)\s*$/);
    if (!q) return m;
    return `<div class="case-ask"><p><b>Ask:</b> ${q[1]}</p>${caseQuiz
      ? `<details><summary>Think, then show the answer</summary><p class="answer">${q[2]}</p></details>`
      : `<p class="answer"><b>Answer:</b> ${q[2]}</p>`}</div>`;
  });
}
// When the step's map is, in the case's own time and in UTC ("5 pm PDT Wed 11 Mar (00 UTC 12 Mar)")
function caseMapTime(c, s) {
  const t = Date.parse(`${s.day}T00:00:00Z`), utc = `00 UTC ${new Date(t).toUTCString().slice(5, 11)}`;
  if (c.region !== "pnw" && c.region !== "hawaii") return utc;
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tzOf(c.region), weekday: "short", day: "numeric", month: "short", hour: "numeric", timeZoneName: "short" }).formatToParts(t);
  const g = (k) => f.find((x) => x.type === k)?.value ?? "";
  return `${g("hour")} ${g("dayPeriod").toLowerCase()} ${g("timeZoneName")} ${g("weekday")} ${g("day")} ${g("month")} (${utc})`;
}
function showCaseStep(k, { focus = false } = {}) {
  const c = caseState.c, s = c.steps[k];
  glossHide();
  caseState.k = k;
  const when = caseMapTime(c, s);
  $("caseCount").textContent = `Step ${k + 1} of ${c.steps.length}`;
  $("caseMapTime").textContent = `The map: ${when}`;
  $("caseStepTitle").textContent = s.title;
  const br = s.brief && BRIEFS[s.brief.id];
  const local = c.region === "pnw" || c.region === "hawaii";
  const src = HIRES[c.region === "hawaii" ? "hawaii" : "pnw"];
  // the story with its units paired, its question, what to look for and the takeaway; jargon marked on first use
  const seen = new Set();
  $("caseText").innerHTML = glossify(askify(pairUnits(s.text)), seen)
    + glossify(`<p><b>Look for:</b> ${pairUnits(s.lookFor)}</p>`, seen)
    + (s.takeaway ? glossify(`<p class="case-takeaway"><b>Takeaway:</b> ${pairUnits(s.takeaway)}</p>`, seen) : "")
    // the last step closes with the whole case in a few lines (its steps' takeaways), to review or discuss
    + (k === c.steps.length - 1 && c.steps.filter((x) => x.takeaway).length > 1
      ? `<div class="case-recap"><p><b>This case in ${c.steps.length} lines</b></p><ol>${c.steps.map((x, i) => `<li><a href="#" data-step="${i}">${x.title}</a>: ${pairUnits(x.takeaway ?? "")}</li>`).join("")}</ol>${caseCheckHtml(c)}</div>` : "")
    + (br ? briefHtml(br, s.brief.as, (f) => new URL(f, import.meta.url).href) : "")
    + (s.charts ? '<div class="case-charts"></div>' : "")
    + caseSec("key", "Map key: what the map shows, and why this view", "colours, lines, wind and markers",
      `${caseShows(s.show, when, !!s.marks?.length, s.range)}<p><b>Why this view:</b> ${s.why}</p>`)
    + (local && s.hrrr ? (() => {
      const ev = s.hrrr.every ?? 1, n = Math.round((Date.parse(`${s.hrrr.to}:00:00Z`) - Date.parse(`${s.hrrr.from}:00:00Z`)) / 3600e3 / ev) + 1;
      // the step's main action as one button (panel round 2): opens the section, sets the step's view, shows it and plays
      const what = (s.hrrr.view ?? "").startsWith("o_") ? (s.hrrr.view === "o_radar" ? "the radar" : "the satellite") : `the ${src.short}`;
      return `<div class="case-try"><button class="mini case-try-go">▶ Play ${what} (${n} ${ev === 1 ? "hours" : "maps"})</button>`
        + `<button class="mini case-try-off" hidden>Hide the ${src.cell} map</button>${s.hrrr.hint ? `<p class="note">${s.hrrr.hint}</p>` : ""}</div>`
        + caseSec("hr", `Hour by hour: ${src.name.toLowerCase()} (${src.src})`, `${n} maps, ${ev === 1 ? "one an hour" : `one every ${ev} hours`}; opening puts them on the map`, '<div class="case-hrrr"></div>');
    })() : "")
    + (local ? caseSec("obs", "What the stations measured, hour by hour", "airports and buoys around this day", '<div class="case-obs"></div>') : "")
    + (local ? caseSec("num", "The forecasters' numbers", "the pressure differences and readings forecasters check", '<div class="case-numbers"></div>') : "");
  for (const a of $("caseText").querySelectorAll(".case-recap a[data-step]")) a.addEventListener("click", (e) => { e.preventDefault(); showCaseStep(+a.dataset.step, { focus: true }); });
  for (const d of $("caseText").querySelectorAll("details.case-sec")) d.addEventListener("toggle", () => {
    secRemember(d.dataset.x, d.open);
    // opening puts the hours on the map (said in its teaser); closing leaves the map alone (panel round 2)
    if (d.dataset.x === "hr" && d.open && !hr.want && hr.frames.length && hr.step === s) {
      hr.want = true; const t = d.querySelector(".hr-toggle"); if (t) t.checked = true; hrrrRender();
    }
  });
  $("caseText").querySelector(".case-try-go")?.addEventListener("click", () => {
    const d = $("caseText").querySelector('details[data-x="hr"]');
    if (d && !d.open) d.open = true;
    caseState.tryPlay = s;                                    // hrrrStep may still be loading: it starts the play
    if (hr.step === s && hr.frames.length) { hrrrStartStep(s); }
  });
  $("caseText").querySelector(".case-try-off")?.addEventListener("click", () => {
    hr.want = false; hrrrOff(); hrrrPanel(); caseState.obsRedraw?.();
    const t = $("caseText").querySelector(".hr-toggle"); if (t) t.checked = false;
  });
  if (s.charts) showCaseCharts(BRIEFS[s.charts.id], chartFrame(BRIEFS[s.charts.id], s.charts));
  else { caseChartLayer.hide(); dirty = true; }
  // the briefing's forecast charts (casebrief.js), drawn at the screen's pixel density
  for (const cv of $("caseText").querySelectorAll("canvas.brief-chart")) {
    const dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth || 280, H = 150;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawMeteogram(ctx, W, H, br, cv.dataset.run);
  }
  const last = k === c.steps.length - 1;
  $("casePrev").disabled = k === 0;
  $("caseNext").setAttribute("aria-label", last ? "Finish: back to all cases" : `Next step: ${c.steps[k + 1].title}`);
  $("caseNext").textContent = last ? "✓ Finish" : "▶";
  const end = $("caseNextEnd");
  end.hidden = false;
  end.textContent = last ? "✓ Finish: back to all cases" : `Next: ${c.steps[k + 1].title} →`;
  $("casePlay").hidden = !s.play;
  applyCaseStep(s);
  if (local) caseNumbers(s);
  if (focus) { $("caseStepTitle").focus({ preventScroll: true }); $("caseStepTitle").scrollIntoView({ block: "nearest" }); }
  // on a phone the step's header goes to the top of the sheet, so the smallest sheet shows ◀ Step n of N ▶
  if (document.body.classList.contains("phone")) requestAnimationFrame(() => $("caseStepTitle").scrollIntoView({ block: "start" }));
}
function caseQuizSet(on) {
  caseQuiz = on;
  try { localStorage.setItem("np3d.caseQuiz", on ? "1" : "0"); } catch { /* fine */ }
  $("caseQuiz").setAttribute("aria-checked", String(on)); $("caseTeach").setAttribute("aria-checked", String(!on));
  // re-render the questions in place (the rest of the step, and its map, stay as they are)
  const c = caseState.c, st = c?.steps[caseState.k];
  if (!st) return;
  const asks = [...$("caseText").querySelectorAll(".case-ask")], fresh = document.createElement("div");
  fresh.innerHTML = glossify(askify(pairUnits(st.text))) + (caseState.k === c.steps.length - 1 ? caseCheckHtml(c) : "");
  const nw = [...fresh.querySelectorAll(".case-ask")];
  asks.forEach((a, i) => nw[i] && a.replaceWith(nw[i]));
}
// Present mode (panel review: "a teacher/projector mode"): larger text, the story, question and takeaway only, the
// step's Play button kept; ← → move between steps and A shows the answer. Remembered on the device.
let casePresent = (() => { try { return localStorage.getItem("np3d.casePresent") === "1"; } catch { return false; } })();
function casePresentSet(on) {
  casePresent = on;
  try { localStorage.setItem("np3d.casePresent", on ? "1" : "0"); } catch { /* fine */ }
  document.body.classList.toggle("case-present", on);
  $("casePresent").setAttribute("aria-pressed", String(on));
  $("casePresent").textContent = on ? "✕ Leave present mode" : "⛶ Present";
}
$("casePresent").addEventListener("click", () => casePresentSet(!casePresent));
// How to read a case (polish 2026-10-15): opens by itself the first time a case is opened on this device, then from its button.
function caseHelpSet(on) {
  $("caseHelp").hidden = !on; $("caseHelpBtn").setAttribute("aria-expanded", String(on));
  if (!on) try { localStorage.setItem("np3d.caseHelpSeen", "1"); } catch { /* private mode */ }
}
$("caseHelpBtn").addEventListener("click", () => caseHelpSet($("caseHelp").hidden));
$("caseHelpClose").addEventListener("click", () => { caseHelpSet(false); $("caseHelpBtn").focus(); });
casePresentSet(casePresent);
document.addEventListener("keydown", (e) => {
  if (!casePresent || !caseState.c || $("casePlayer").hidden || e.target.closest?.("input, select, textarea")) return;
  if (e.key === "ArrowRight") { e.preventDefault(); $("caseNext").click(); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); $("casePrev").click(); }
  else if (e.key === "a" || e.key === "A") { const d = $("caseText").querySelector(".case-ask details"); if (d) d.open = !d.open; }
});
$("caseQuiz").addEventListener("click", () => caseQuizSet(true));
$("caseTeach").addEventListener("click", () => caseQuizSet(false));
$("caseNextEnd").addEventListener("click", () => $("caseNext").click());
caseQuizSet(caseQuiz);
// A glossary term's definition (glossary.js): tap, click or Enter shows it beside the word; Escape, a tap elsewhere or
// the next step closes it. Hover still shows the title tooltip on a desktop.
const glossPop = document.createElement("div");
glossPop.className = "gloss-pop"; glossPop.setAttribute("role", "tooltip"); glossPop.id = "glossPop"; glossPop.hidden = true;
document.body.append(glossPop);
function glossShow(el) {
  glossPop.textContent = el.dataset.def; glossPop.hidden = false;
  const r = el.getBoundingClientRect(), w = Math.min(300, innerWidth - 16);
  glossPop.style.width = `${w}px`;
  glossPop.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left))}px`;
  const below = r.bottom + 6, h = glossPop.offsetHeight;
  glossPop.style.top = `${below + h > innerHeight - 8 ? Math.max(8, r.top - h - 6) : below}px`;
  el.setAttribute("aria-describedby", "glossPop");
}
const glossHide = () => { glossPop.hidden = true; document.querySelectorAll("dfn.gloss[aria-describedby]").forEach((e) => e.removeAttribute("aria-describedby")); };
document.addEventListener("click", (e) => { const d = e.target.closest?.("dfn.gloss"); if (d) { e.preventDefault(); glossPop.hidden || d.getAttribute("aria-describedby") !== "glossPop" ? glossShow(d) : glossHide(); } else if (!e.target.closest?.(".gloss-pop")) glossHide(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") glossHide();
  const d = e.target.closest?.("dfn.gloss");
  if (d && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); glossShow(d); }
});
// a folded section's teaser, once its content knows what to say
function caseTeaser(x, html) { const t = $("caseText").querySelector(`[data-teaser="${x}"]`); if (t) t.innerHTML = html; }
// A Northwest step's forecasters' numbers (pnwreading.js), read from the step's own day on the archive grid.
async function caseNumbers(s) {
  const i = dayIndex(ARCH_DAYS, s.day), f = i >= 0 ? await archDay(i) : null, box = $("caseText").querySelector(".case-numbers");
  if (!box || caseState.c?.steps[caseState.k] !== s) return;
  const hi = caseState.c?.region === "hawaii";
  const rows = !f?.mslp ? [] : hi ? readHi((name, lat, lon) => (f[name] ? valueAt(f[name], ARCH.grid, lat, lon) : NaN))
    : readPnw((lat, lon) => valueAt(f.mslp, ARCH.grid, lat, lon), f.mslpa ? (lat, lon) => valueAt(f.mslpa, ARCH.grid, lat, lon) : null);
  const sgn = (x) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(1)}`;
  const shown = (r) => r.shown ?? sgn(r.value);
  // muted: a quiet meaning and close to normal for the date; marked: far from normal (the top tenth of days for that
  // reading), whatever its meaning (panel review: "mute by departure from typical, not by row type")
  const quiet = (r) => r.rank === 0 && r.near !== false && !r.far;
  box.innerHTML = rows.length ? `<table class="case-num"><caption>${hi ? "Read from this day's grid around Oʻahu." : "Sea-level pressure differences on this day's grid, first place minus second, hPa."} Muted: quiet and close to normal for the date. ◆ far from normal: in the top tenth of days for that reading.</caption>`
    + `<tr><th scope="col">Reading</th><th scope="col">Value</th><th scope="col">What it usually means</th></tr>${
    rows.map((r) => `<tr class="${quiet(r) ? "quiet" : ""}${r.far ? " far" : ""}"><th scope="row">${r.far ? '<span class="far-mark" aria-label="far from normal">◆</span> ' : ""}${r.label}</th><td class="v">${shown(r)}${r.normal != null ? `<span class="norm">normal ${sgn(r.normal)}</span>` : ""}</td><td>${r.text}</td></tr>`).join("")}</table>` : "";
  // the teaser: a reading far from normal first, then the strongest by meaning, or "nothing unusual"
  const top = rows.find((r) => r.far && r.rank > 0) ?? rows.reduce((b, r) => ((r.rank ?? 0) > (b?.rank ?? 0) ? r : b), null);
  const plain = (r) => {
    const m = r.label.match(/^(.+) − (.+)$/);
    if (!m || typeof r.value !== "number" || r.shown) return `${r.label} ${shown(r)}`;
    return r.value === 0 ? `the same pressure at ${m[1]} and ${m[2]}` : `pressure ${Math.abs(r.value).toFixed(1)} hPa higher at ${r.value > 0 ? m[1] : m[2]} than ${r.value > 0 ? m[2] : m[1]}`;
  };
  caseTeaser("num", top ? `${plain(top)}: ${top.text.split(/[:(]/)[0].trim()}` : "nothing unusual in these numbers today");
  caseObsShow(s, hi ? {} : Object.fromEntries(rows.map((r) => [r.id, r.value])));
  hrrrStep(s);
}
// The 3 km model (hrrr.js; user request 2026-10-14): in a Northwest step with an hrrr window, its hourly HRRR
// analyses drawn over the 1° daily map in the Northwest box, with a menu of views, an hour slider and Play, the
// stations' own measurements at that hour on the map and in a table beside the model's, and the station chart's
// cursor tied to the hour (click the chart to go there). The choice to show it carries from step to step.
function hrrrIndexDoc(region) {
  hr.indexP[region] ??= fetch(new URL(`./${HIRES[region].dir}/index.json${buildVersion(manifest)}`, import.meta.url)).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return hr.indexP[region];
}
function obsImgDoc(region) {
  hr.imgP[region] ??= fetch(new URL(`./${HIRES[region].img}/index.json${buildVersion(manifest)}`, import.meta.url)).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return hr.imgP[region];
}
// The observed image (obsimg.js) that pairs with the model's view, or the model's view that pairs with an image
// (whichever the region's source has: Hawaiʻi's analysis has no radar, so radar pairs with its cloud cover).
const obsPairOf = (view) => ({ refc: "radar", pwat: "wv", tcc: "ir" })[view] ?? null;
const viewPairOf = (kind) => [OBS_IMAGES[kind].pair, "tcc"].find((v) => hr.views.includes(v)) ?? null;
// This region's layers (each its own grid and box), made when first needed.
const hrR = () => (hr.R[hr.region] ??= {});
function hrrrFrameFields(fr) {
  const key = `${hr.region}:${fr.key}`;
  if (!hr.cache.has(key)) {
    const n = hr.index.grid.nlat * hr.index.grid.nlon;
    hr.cache.set(key, fetchU16(new URL(`./${HIRES[hr.region].dir}/${fr.file}${buildVersion(manifest)}`, import.meta.url).href).then((c) => dequantize(c, fr.fields, n)).catch(() => null));
    if (hr.cache.size > 40) hr.cache.delete(hr.cache.keys().next().value);
  }
  return hr.cache.get(key);
}
// the step's time line and the "Hide" button follow the hours (panel round 2: "The map: 5 pm" was wrong at 10 pm)
function hrrrHeader() {
  const c = caseState.c, s = c?.steps[caseState.k], el = $("caseMapTime"), off = $("caseText").querySelector(".case-try-off");
  if (off) off.hidden = !hr.on;
  if (!s || !el) return;
  el.textContent = hr.on && hr.cur && hr.step === s
    ? `The map: ${HIRES[hr.region].short}, ${fmtObsTime(hr.cur.t)} (hour ${hr.i + 1} of ${hr.frames.length}) · daily map ${caseMapTime(c, s)}`
    : `The map: ${caseMapTime(c, s)}`;
}
function hrrrOff() {
  hr.on = false; hr.cur = null;
  hrrrPlay(false);
  for (const L of Object.values(hr.R)) { if (L.layer) L.layer.visible = false; if (L.flow) L.flow.object.visible = false; L.imgLayer?.hide(); }
  if (arch.layer) arch.layer.uniforms.fillOpacity.value = 0.8;
  if (arch.flow) arch.flow.object.visible = arch.windAs === "flow" && !!archWindLevel();
  updateLegend(); archHud(); hrrrHeader(); dirty = true;
}
async function hrrrStep(s) {
  const box = $("caseText").querySelector(".case-hrrr");
  hr.step = s;
  const region = caseState.c?.region === "hawaii" ? "hawaii" : "pnw", src = HIRES[region];
  if (!box) { if (hr.on) hrrrOff(); return; }
  const [index, img] = await Promise.all([hrrrIndexDoc(region), obsImgDoc(region)]);
  if (hr.step !== s) return;
  if (hr.on && hr.region !== region) hrrrOff();                 // the other region's layers off before this one's go on
  hr.region = region; hr.index = index; hr.img = img;
  hr.frames = hrrrFrames(hr.index, s);
  if (!hr.frames.length) { box.innerHTML = ""; if (hr.on) hrrrOff(); return; }
  hr.views = hrrrViews(hr.frames[0].fields.map((m) => m.name));
  hr.i = Math.max(0, hrrrNearest(hr.frames, Date.parse(`${s.day}T00:00:00Z`)));
  // each step opens on the view that shows its point: a model view, or an observation ("o_radar")
  const sv = s.hrrr.view ?? "";
  hr.obs = sv.startsWith("o_") ? sv.slice(2) : null;
  if (hr.views.includes(sv)) hr.view = sv; else if (!hr.views.includes(hr.view)) hr.view = hr.views[0];
  const kinds = obsKinds(hr.img, hr.frames.map((f) => f.key));
  if (hr.obs && !kinds.includes(hr.obs)) hr.obs = null;
  const every = s.hrrr.every ?? 1;
  // opening the section is the switch (panel review round 2); the box below hides it again while reading
  if ($("caseText").querySelector('details[data-x="hr"]')?.open) hr.want = true;
  box.innerHTML = `<p class="obs-head"><label class="hr-on"><input type="checkbox" class="hr-toggle"${hr.want ? " checked" : ""}> show on the map</label></p>`
    + `<p class="note">${src.blurb} `
    + `${hr.frames.length} ${every === 1 ? "hourly" : `${every}-hourly`} analyses here, ${fmtObsTime(hr.frames[0].t)} to ${fmtObsTime(hr.frames.at(-1).t)}; ${src.cover}.</p>`
    // the views as buttons (panel review): a region's main model views and the observations one tap away; the menu
    // keeps every view, for the rest
    + (() => {
      const main = (region === "hawaii" ? ["gust", "wind", "td2m", "tcc"] : ["gust", "mslp", "t2m", "refc"]).filter((k) => hr.views.includes(k));
      const short = { gust: "Gusts", wind: "Wind", mslp: "Pressure", t2m: "Temperature", td2m: "Dew point", tcc: "Cloud", refc: "Radar (model)" };
      const oshort = { radar: "Radar", ir: "Infrared", true: "True colour", wv: "Water vapour" };
      return `<div class="hr-chips"><span class="hr-group" role="radiogroup" aria-label="${src.short}"><span class="hr-glabel">${src.src}:</span>${
        main.map((k) => `<button class="mini hr-chip" role="radio" data-v="${k}">${short[k]}</button>`).join("")}</span>`
        + (kinds.length ? `<span class="hr-group obs" role="radiogroup" aria-label="Observed"><span class="hr-glabel">Observed:</span>${
          kinds.map((k) => `<button class="mini hr-chip" role="radio" data-v="o_${k}">${oshort[k]}</button>`).join("")}</span>` : "") + `</div>`;
    })()
    + `<div class="hr-controls"><select class="hr-view" aria-label="More views: the ${src.short}, or what radar and satellite observed">`
    + `<optgroup label="${src.name} (${src.src})">${hr.views.map((k) => `<option value="${k}"${k === hr.view ? " selected" : ""}>${HRRR_VIEWS[k].label}</option>`).join("")}</optgroup>`
    + (kinds.length ? `<optgroup label="Observed">${kinds.map((k) => `<option value="o_${k}">${OBS_IMAGES[k].label}</option>`).join("")}</optgroup>` : "")
    + `</select><button class="mini hr-flip" hidden title="Switch between the model and what was observed, at the same hour">⇄ model / observed</button>`
    + `<button class="mini hr-prev" aria-label="Previous hour">◀</button><button class="mini hr-play" aria-label="Play the hours">▶ Play hours</button><button class="mini hr-next" aria-label="Next hour">▶</button></div>`
    + `<input type="range" class="hr-slider" min="0" max="${hr.frames.length - 1}" step="1" value="${hr.i}" aria-label="Hour of the ${src.short}">`
    + `<p class="hr-time" aria-live="polite" aria-atomic="true"></p><p class="note hr-why"></p><div class="hr-stations"></div>`;
  box.querySelector(".hr-toggle").addEventListener("change", (e) => { hr.want = e.target.checked; hr.want ? hrrrRender() : hrrrOff(); hrrrPanel(); caseState.obsRedraw?.(); });
  const pick = (v) => {
    if (v.startsWith("o_")) hr.obs = v.slice(2); else { hr.obs = null; hr.view = v; }
    if (!hr.want) { hr.want = true; box.querySelector(".hr-toggle").checked = true; }
    hrrrRender();
  };
  box.querySelector(".hr-view").addEventListener("change", (e) => pick(e.target.value));
  for (const c of box.querySelectorAll(".hr-chip")) c.addEventListener("click", () => pick(c.dataset.v));
  box.querySelector(".hr-flip").addEventListener("click", () => {
    const sel = box.querySelector(".hr-view"), to = hr.obs ? viewPairOf(hr.obs) : `o_${obsPairOf(hr.view)}`;
    sel.value = to; pick(to);
  });
  box.querySelector(".hr-slider").addEventListener("input", (e) => hrrrGo(+e.target.value, true));
  box.querySelector(".hr-prev").addEventListener("click", () => hrrrGo((hr.i - 1 + hr.frames.length) % hr.frames.length, true));
  box.querySelector(".hr-next").addEventListener("click", () => hrrrGo((hr.i + 1) % hr.frames.length, true));
  box.querySelector(".hr-play").addEventListener("click", () => hrrrPlay(!hr.timer));
  if (caseState.tryPlay === s) hrrrStartStep(s);
  else if (hr.want) hrrrRender(); else { if (hr.on) hrrrOff(); hrrrPanel(); }
}
// "▶ Play …": the step's own view from its first hour, on the map, playing
function hrrrStartStep(s) {
  caseState.tryPlay = null;
  const sv = s.hrrr.view ?? "";
  if (sv.startsWith("o_")) hr.obs = sv.slice(2); else { hr.obs = null; if (hr.views.includes(sv)) hr.view = sv; }
  hr.i = 0; hr.want = true;
  const t = $("caseText").querySelector(".hr-toggle"); if (t) t.checked = true;
  hrrrRender(); hrrrPlay(true);
}
function hrrrGo(i, user = false) {
  if (i < 0 || i >= hr.frames.length) return;
  if (user) hrrrPlay(false);
  hr.i = i;
  if (!hr.want) { hr.want = true; const t = $("caseText").querySelector(".hr-toggle"); if (t) t.checked = true; }
  hrrrRender();
}
function hrrrPlay(on) {
  clearInterval(hr.timer); hr.timer = null;
  const b = $("caseText").querySelector(".hr-play");
  if (on && hr.frames.length > 1) {
    if (!hr.want) { hr.want = true; const t = $("caseText").querySelector(".hr-toggle"); if (t) t.checked = true; }
    hr.timer = setInterval(() => { hr.i = (hr.i + 1) % hr.frames.length; hrrrRender(); }, REDUCED_MOTION ? 2000 : 900);
    for (let j = 0; j < hr.frames.length; j++) hrrrFrameFields(hr.frames[j]);      // fetch them all for a smooth play
  }
  if (b) { b.textContent = hr.timer ? "❚❚ Pause" : "▶ Play hours"; b.setAttribute("aria-label", hr.timer ? "Pause the hours" : "Play the hours"); }
  // the hour isn't read out every step while playing, only where it stops
  const ht = $("caseText").querySelector(".hr-time");
  if (ht) ht.setAttribute("aria-live", hr.timer ? "off" : "polite");
}
async function hrrrRender() {
  const s = hr.step, fr = hr.frames[hr.i], token = ++hr.token;
  if (!fr) return;
  const f = await hrrrFrameFields(fr);
  if (token !== hr.token || hr.step !== s || !hr.want || !arch.on) return;
  if (!f) { hrrrPanel("This hour couldn't be loaded."); return; }
  const g = hr.index.grid, n = g.nlat * g.nlon, V = HRRR_VIEWS[hr.view];
  if (hr.obs) {
    // what radar or satellite observed: the image draped over the box, the model hidden (its readout stays on hover)
    const L = hrR();
    if (L.layer) L.layer.visible = false;
    if (L.flow) L.flow.object.visible = false;
    if (arch.layer) arch.layer.uniforms.fillOpacity.value = 0.3;
    if (arch.flow) arch.flow.object.visible = false;
    const im = obsImage(hr.img, fr.key, hr.obs);
    if (!L.imgLayer) { L.imgLayer = new OpcChartLayer(hr.img.box, geo, { renderOrder: 12, lift: 16 }); scene.add(L.imgLayer.mesh); }
    // shown once its image has loaded (the layer only shows a ready one), unless the view or hour moved on meanwhile
    if (im) L.imgLayer.show(new URL(`./${HIRES[hr.region].img}/${im.file}${buildVersion(manifest)}`, import.meta.url).href, () => {
      if (hr.on && hr.obs && hr.cur?.im === im) L.imgLayer.mesh.visible = true;
      dirty = true;
    }, hr.img.box);
    else L.imgLayer.hide();
    const was = hr.on;
    hr.on = true; hr.cur = { t: fr.t, key: fr.key, fields: f, im };
    if (!was || hr.legendKey !== `o_${hr.obs}`) { hr.legendKey = `o_${hr.obs}`; updateLegend(); }
    archHud(); hrrrPanel(); hrrrHeader(); caseState.obsRedraw?.(); if (hover) updateReadout();
    dirty = true;
    return;
  }
  const L = hrR();
  L.imgLayer?.hide();
  if (!L.layer) {
    L.layer = new GridLayer(g, geo, { lift: 15, lineColor: "#1f2733", lineWidth: 1.1, renderOrder: 11 });
    L.layer.uniforms.mapTex.value = ground.texture; L.layer.uniforms.mapMix.value = 0.25;
    L.layer.uniforms.fillOpacity.value = 0.85; L.layer.uniforms.shade.value = false;
    scene.add(L.layer.mesh);
  }
  const fill = hrrrFill(hr.view, f, n);
  for (let k = 0; k < n; k++) if (!Number.isFinite(fill[k])) fill[k] = SEA_MISSING;
  // isobars every 2 hPa (the 3 km grid keeps the tight ones); none where the domain ends
  if (V.lines && f.mslp && !f.mslpSmooth) f.mslpSmooth = smoothForContours(Float32Array.from(f.mslp, (p) => (Number.isFinite(p) ? p / 100 : NaN)), g);
  const c = V.lines && f.mslp ? f.mslpSmooth : null;
  const vals = { h: null, c, f: fill };
  L.layer.setSlot("A", fr.key, vals); L.layer.setSlot("B", fr.key, vals);
  L.layer.uniforms.t.value = 0;
  L.layer.uniforms.showLines.value = !!c;
  if (c) L.layer.uniforms.cInterval.value = 2;
  L.layer.setFill(V.scale, SCALES[V.scale]);
  L.layer.visible = true;
  // the 1° map stays underneath, faded, for the pattern around the box; its flow lines give way to the model's
  if (arch.layer) arch.layer.uniforms.fillOpacity.value = 0.3;
  if (arch.flow) arch.flow.object.visible = false;
  if (V.wind) {
    const W = root.clientWidth, H = root.clientHeight;
    if (!L.flow) { L.flow = new FlowLayer(g, geo, { lift: 20, renderOrder: 15, width: 0.9 }); L.flow.setViewport(W, H); scene.add(L.flow.object); }
    L.flow.gapCells = Math.max(8, Math.round((flowGap() * 0.5) / Math.abs(g.dlon)));   // the same spacing on the screen as the 1° map's lines (flowGap counts 0.5° cells)
    L.flow.setColors(levelColor("sfc"), "#ffffff");           // dark ink in a thin white halo, like the 1° map's lines
    // the flow lines follow a lightly smoothed copy of the wind (about 10–15 km; user report 2026-10-15, "stream lines still
    // a little jagged"): the raw 3 km wind wiggles round every ridge and valley, and lines traced through it turned
    // 36–44° at 1 joint in 100; smoothed, about 19°. The colours and the readouts keep the raw wind.
    if (!f.uvSmooth) {
      const fill0 = (a) => Float32Array.from(a, (x) => (Number.isFinite(x) ? x : 0));
      f.uvSmooth = [smoothForContours(fill0(f.u10), g, 1, 2), smoothForContours(fill0(f.v10), g, 1, 2)];
    }
    const [u, v] = f.uvSmooth;
    L.flow.build(`${hr.region}:${fr.key}:${L.flow.gapCells}`, u, v, null, null);
    L.flow.object.visible = true;
  } else if (L.flow) L.flow.object.visible = false;
  const was = hr.on;
  hr.on = true; hr.cur = { t: fr.t, key: fr.key, fields: f };
  if (!was || hr.legendKey !== hr.view) { hr.legendKey = hr.view; updateLegend(); }
  archHud();
  hrrrPanel();
  hrrrHeader();
  caseState.obsRedraw?.();
  if (hover) updateReadout();
  dirty = true;
}
// The station value for a view at an hour, from the case's observations (caseobs.js), or null.
function obsAt(st, v, t) {
  const doc = caseState.obsDoc;
  if (!doc || !v) return null;
  for (const seg of doc.segments) {
    const t0 = Date.parse(seg.t0.replace(/T(\d\d)Z$/, "T$1:00:00Z")), i = Math.round((t - t0) / 3600e3);
    if (i < 0 || i >= seg.n) continue;
    const d = seg.data[st];
    if (!d) return null;
    if (v === "peak") { const g = d.wg?.[i], pk = d.pk?.[i]; return g != null || pk != null ? Math.max(g ?? 0, pk ?? 0) : d.ws?.[i] ?? null; }
    return d[v]?.[i] ?? null;
  }
  return null;
}
// The model's value at a station for the same view, in the station's units (kt, hPa, °C, km).
function modelAt(st, view) {
  const S = caseState.obsDoc?.stations[st], k = S && hr.cur ? hrrrIndex(hr.index.grid, S.lat, S.lon) : -1;
  if (k < 0) return null;
  const v = HRRR_VIEWS[view].value(hr.cur.fields, k);
  return Number.isFinite(v) ? v : null;
}
const OBS_SCALE = { vis: (x) => x * 1.609 };          // the METARs' miles to km
function hrrrPanel(msg) {
  const box = $("caseText").querySelector(".case-hrrr");
  if (!box) return;
  const V = HRRR_VIEWS[hr.view], fr = hr.frames[hr.i];
  const sl = box.querySelector(".hr-slider");
  sl.value = String(hr.i);
  if (fr) sl.setAttribute("aria-valuetext", `${fmtObsTime(fr.t)}, hour ${hr.i + 1} of ${hr.frames.length}`);
  const flip = box.querySelector(".hr-flip"), kinds = obsKinds(hr.img, hr.frames.map((x) => x.key));
  const to = hr.obs ? viewPairOf(hr.obs) : kinds.includes(obsPairOf(hr.view)) ? obsPairOf(hr.view) : null;
  flip.hidden = !to;
  // named for what it switches to (Hawaiʻi's analysis has no radar: its radar pairs with cloud cover)
  if (to) { const lab = hr.obs ? `${HIRES[hr.region].noun} ${HRRR_VIEWS[to].label}` : `observed ${OBS_IMAGES[to].label.replace(/ \(.*$/, "").replace(/^satellite: /, "")}`; flip.textContent = `⇄ Compare: ${lab}`; flip.setAttribute("aria-label", `Compare with the ${lab} at this hour`); }
  const cur = hr.obs ? `o_${hr.obs}` : hr.view;
  box.querySelector(".hr-view").value = cur;
  for (const c of box.querySelectorAll(".hr-chip")) c.setAttribute("aria-checked", String(hr.on && c.dataset.v === cur));
  if (hr.obs) {
    const O = OBS_IMAGES[hr.obs], im = fr && obsImage(hr.img, fr.key, hr.obs);
    box.querySelector(".hr-time").innerHTML = msg ?? (fr ? `<b>${fmtObsTime(fr.t)}</b> · hour ${hr.i + 1} of ${hr.frames.length} · ${im ? `<b>observed</b> ${fmtObsShort(Date.parse(im.time.replace(/Z$/, ":00Z")))}${im.sat ? ` by ${im.sat.replace("GOES", "GOES-")}` : ""}` : hr.obs === "true" ? "no true colour at night: try infrared" : "no image for this hour"}` : "");
    box.querySelector(".hr-why").innerHTML = `<b>${O.label[0].toUpperCase() + O.label.slice(1)}:</b> ${O.why} <b>Look for</b> ${O.look}`;
    box.querySelector(".hr-stations").innerHTML = "";
    return;
  }
  box.querySelector(".hr-time").innerHTML = msg ?? (fr ? `<b>${fmtObsTime(fr.t)}</b> · hour ${hr.i + 1} of ${hr.frames.length}${hr.on ? "" : " · tick <i>show on the map</i>"}` : "");
  box.querySelector(".hr-why").innerHTML = `<b>${V.label[0].toUpperCase() + V.label.slice(1)}:</b> ${V.why} <b>Look for</b> ${V.look}`;
  const st = box.querySelector(".hr-stations");
  if (!hr.on || !V.obs || !caseState.obsDoc) { st.innerHTML = hr.on && !V.obs ? '<p class="note">The stations don\'t measure this one; the stations on the map show nothing for it.</p>' : ""; return; }
  const ids = Object.keys(caseState.obsDoc.stations).filter((id) => modelAt(id, hr.view) != null);
  const rows = ids.map((id) => {
    let o = obsAt(id, V.obs, fr.t);
    if (o != null && OBS_SCALE[V.obs]) o = OBS_SCALE[V.obs](o);
    const m = modelAt(id, hr.view), d = V.units === "kt" || V.units === "hPa" ? 0 : 1;
    const diff = +(m - o).toFixed(d);
    return o == null ? null : `<tr><td>${caseState.obsDoc.stations[id].name}</td><td class="v">${o.toFixed(d)}</td><td class="v">${m.toFixed(d)}</td><td class="v">${(diff > 0 ? "+" : diff < 0 ? "−" : "") + Math.abs(diff).toFixed(d)}</td></tr>`;
  }).filter(Boolean);
  st.innerHTML = rows.length ? `<details class="obs-table"${hr.view === "gust" || hr.view === "t2m" ? " open" : ""}><summary>The stations and the ${HIRES[hr.region].short} at this hour (${V.units})</summary><table class="case-num"><tr><td></td><td>measured</td><td>${HIRES[hr.region].noun}</td><td>${HIRES[hr.region].noun} − measured</td></tr>${rows.join("")}</table></details>`
    + (() => {
      const miss = ids.map((id) => { let o = obsAt(id, V.obs, fr.t); if (o != null && OBS_SCALE[V.obs]) o = OBS_SCALE[V.obs](o); const m = modelAt(id, hr.view); return o == null || m == null ? null : { id, o, m }; })
        .filter(Boolean).reduce((b, x) => (!b || Math.abs(x.m - x.o) > Math.abs(b.m - b.o) ? x : b), null);
      const d = V.units === "kt" || V.units === "hPa" ? 0 : 1;
      return miss ? `<p class="note"><b>Biggest difference this hour:</b> ${caseState.obsDoc.stations[miss.id].name}, ${HIRES[hr.region].noun} ${miss.m.toFixed(d)} against ${miss.o.toFixed(d)} ${V.units} measured. Why might a sheltered airport, or an exposed buoy, differ from a ${HIRES[hr.region].cell} box?</p>` : "";
    })()
    + `<p class="note">On the map, each station shows what it measured this hour. The ${HIRES[hr.region].noun}'s value is for its ${HIRES[hr.region].cell} box around the station, so a gusty gap or a sheltered airport can differ.</p>` : "";
}
function hrrrStationItems(W, H) {
  if (!hr.on || !hr.cur || hr.obs || !caseState.obsDoc || !$("caseMarks").checked) return [];
  const V = HRRR_VIEWS[hr.view];
  if (!V.obs) return [];
  const v3 = new THREE.Vector3(), out = [];
  for (const [id, S] of Object.entries(caseState.obsDoc.stations)) {
    if (hrrrIndex(hr.index.grid, S.lat, S.lon) < 0) continue;
    let o = obsAt(id, V.obs, hr.cur.t);
    if (o == null) continue;
    if (OBS_SCALE[V.obs]) o = OBS_SCALE[V.obs](o);
    v3.copy(geo.point(S.lat, S.lon, MARK_KM)).project(camera);
    if (v3.z > 1 || v3.z < -1) continue;
    const short = S.name.replace(/ \(.*\)| buoy$|, BC$/g, "");
    out.push({ x: (v3.x + 1) / 2 * W, y: (1 - v3.y) / 2 * H, dy: 0, text: `● ${short} ${o.toFixed(V.units === "kt" || V.units === "hPa" ? 0 : 1)}`, cls: "obs-mark", align: "center" });
  }
  return out;
}
// Times in the open case's zone (Pacific for the Northwest, Hawaiʻi time for Hawaiʻi).
const caseTz = () => tzOf(caseState.c?.region);
const fmtObsTime = (ms) => fmtObsTimeTz(ms, caseTz());
const fmtObsShort = (ms) => new Intl.DateTimeFormat("en-US", { timeZone: caseTz(), weekday: "short", hour: "numeric" }).format(ms).replace(/^(\w+) (.*)$/, "$2 $1");
// What the stations and buoys measured through the step, hour by hour (caseobs.js, caseobschart.js): a chart
// with a menu of kinds, a legend that hides and shows lines, a hover readout, the extremes and a table.
const caseObsDocs = new Map();
function caseObsDoc(id) {
  if (!caseObsDocs.has(id)) caseObsDocs.set(id, fetch(new URL(`./caseobs/${id}.json${buildVersion(manifest)}`, import.meta.url)).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  return caseObsDocs.get(id);
}
const OBS_TEASE = { wind: "Strongest gust", rain: "Most rain", temp: "Warmest", dew: "Most humid", pressure: "Lowest pressure", waves: "Biggest waves", period: "Longest swell", gradients: "Biggest pressure difference", gorge: "Biggest Gorge difference" };
const fmtSigned = (v, unit) => `${v > 0 && unit === "hPa" ? "+" : ""}${v.toFixed(unit === "kt" ? 0 : 1)}`.replace("-", "−");
async function caseObsShow(s, grid) {
  const c = caseState.c, doc = await caseObsDoc(c.id), box = $("caseText").querySelector(".case-obs");
  if (!box || caseState.c !== c || c.steps[caseState.k] !== s) return;
  if (!doc) { box.innerHTML = ""; return; }
  // a step may name its chart (a flood step: rain); otherwise the case's pattern decides, and the reader's choice sticks
  if (s.obsKind && !caseState.obsChosen) caseState.obsKind = s.obsKind;
  caseState.obsKind ??= defaultObsKind(c.patterns, c.region);
  caseState.obsHidden ??= {};
  const kinds = Object.entries(obsKindsFor(doc.region)).filter(([k]) => stepObs(doc, s, k));
  if (!kinds.length) { box.innerHTML = ""; return; }
  if (!kinds.some(([k]) => k === caseState.obsKind)) caseState.obsKind = kinds[0][0];
  const kind = caseState.obsKind, o = stepObs(doc, s, kind), hidden = (caseState.obsHidden[kind] ??= new Set());
  const dots = kind === "gradients" ? Object.entries(grid).map(([id, value]) => ({ id, value })) : [];
  const peaks = obsPeaks(o).filter((p) => p.value != null);
  const peakWord = o.zero ? "Largest" : o.unit === "hPa" ? "Lowest" : "Highest";
  const rows3 = o.t.map((t, i) => [t, i]).filter(([, i]) => i % 3 === 0);
  box.innerHTML = `<p class="obs-head">Show: <select class="obs-kind" aria-label="Which measurements">${
    kinds.map(([k, K]) => `<option value="${k}"${k === kind ? " selected" : ""}>${K.menu ?? K.label.split(":")[0]}</option>`).join("")}</select></p>`
    + `<p class="note">${o.label} (${o.unit}), ${caseState.c?.region === "hawaii" ? "Hawaiʻi" : "Pacific"} time.${kind === "gradients" ? " White dots, ringed in their line's colour: this day's grid at the map's time, from the table above." : ""} Hover or drag across the chart to read it${s.hrrr ? `; with the ${HIRES[c.region === "hawaii" ? "hawaii" : "pnw"].short} on the map, click it to take the map to that hour` : ""}.</p>`
    + `<canvas class="obs-chart" role="img" aria-label="${o.label} at the stations through this step" aria-describedby="obsPeaks"></canvas>`
    + `<div class="obs-legend">${o.series.map((x, k) => `<button class="obs-key${hidden.has(x.id) ? " off" : ""}" data-id="${x.id}" aria-pressed="${!hidden.has(x.id)}"><svg width="18" height="6" aria-hidden="true"><line x1="0" y1="3" x2="18" y2="3" stroke="${OBS_COLORS[k]}" stroke-width="2.5" stroke-dasharray="${OBS_DASHES[k].join(" ")}"/></svg> ${x.name}</button>`).join("")}</div>`
    + `<p class="obs-read note">&nbsp;</p>`
    + `<p class="note" id="obsPeaks">${peakWord} at each station: ${peaks.map((p) => `${p.name.replace(/ \(.*\)|, .*$| buoy$/g, "")} ${fmtSigned(p.value, o.unit)} ${o.unit} (${fmtObsShort(p.t)})`).join(" · ")}</p>`
    + `<details class="obs-table"><summary>As a table (every 3 hours)</summary><table class="case-num"><caption>${o.label} (${o.unit})</caption><tr><th scope="col">Time</th>${o.series.map((x) => `<th scope="col">${x.name}</th>`).join("")}</tr>${
      rows3.map(([t, i]) => `<tr><th scope="row">${fmtObsTime(t)}</th>${o.series.map((x) => `<td class="v">${x.values[i] == null ? "–" : fmtSigned(x.values[i], o.unit)}</td>`).join("")}</tr>`).join("")}</table></details>`
    + `<p class="note">Sources: ${doc.sources.asos}; ${doc.sources.buoy}. Each value is the report nearest the hour.</p>`;
  // the folded section's teaser: the window's most striking value
  const best = peaks.reduce((b, p) => (b == null || (o.unit === "hPa" && !o.zero ? p.value < b.value : Math.abs(p.value) > Math.abs(b.value)) ? p : b), null);
  if (s.obsTeaser) caseTeaser("obs", s.obsTeaser);
  else if (kind === "temp" || kind === "dew" || kind === "rain") {
    // temperature and dew point: the range is the story (a cold step's "warmest" misleads)
    const all = o.series.flatMap((x) => x.values).filter((v) => v != null);
    const ends = kind === "rain" ? o.series.map((x) => x.values.filter((v) => v != null).at(-1)).filter((v) => v != null) : all;
    if (ends.length) caseTeaser("obs", `${kind === "temp" ? "Temperature" : kind === "dew" ? "Dew point" : "Rain"} at the stations: ${fmtSigned(Math.min(...ends), o.unit)} to ${fmtSigned(Math.max(...ends), o.unit)} ${o.unit}${kind === "rain" ? " in these days" : ""}`);
  } else if (best) caseTeaser("obs", `${(OBS_TEASE[kind] ?? peakWord)}: ${best.name} ${fmtSigned(best.value, o.unit)} ${o.unit}, ${fmtObsTime(best.t)}`);
  const cv = box.querySelector("canvas"), read = box.querySelector(".obs-read");
  const cursorT = () => (hr.on && hr.cur && hr.step === s ? hr.cur.t : null);
  let lay = drawObsChart(cv, o, { gridDots: dots, hidden, cursorT: cursorT(), tz: caseTz() });
  caseState.obsRedraw = () => { lay = drawObsChart(cv, o, { gridDots: dots, hidden, cursorT: cursorT(), tz: caseTz() }); };
  caseState.obsDoc = doc;
  // with the 3 km model on, a click on the chart takes the map to that hour
  cv.addEventListener("click", (e) => {
    if (hr.step !== s || !hr.frames.length) return;            // a click turns the hours on if they're off
    const r = cv.getBoundingClientRect(), i = obsIndexAt(o, lay, e.clientX - r.left);
    if (i >= 0) hrrrGo(hrrrNearest(hr.frames, o.t[i]));
  });
  const at = (e) => {
    const r = cv.getBoundingClientRect(), i = obsIndexAt(o, lay, e.clientX - r.left);
    lay = drawObsChart(cv, o, { gridDots: dots, hidden, hoverIndex: i, cursorT: cursorT(), tz: caseTz() });
    read.textContent = i < 0 ? "\u00a0" : `${fmtObsTime(o.t[i])}: ` + o.series.filter((x) => !hidden.has(x.id)).map((x) => `${x.name} ${x.values[i] == null ? "–" : fmtSigned(x.values[i], o.unit)}`).join(" · ") + ` ${o.unit}`;
  };
  cv.addEventListener("pointermove", at);
  cv.addEventListener("pointerdown", at);
  cv.addEventListener("pointerleave", () => { lay = drawObsChart(cv, o, { gridDots: dots, hidden, cursorT: cursorT(), tz: caseTz() }); read.textContent = "\u00a0"; });
  box.querySelector(".obs-kind").addEventListener("change", (e) => { caseState.obsKind = e.target.value; caseState.obsChosen = true; caseObsShow(s, grid); });
  for (const b of box.querySelectorAll(".obs-key")) b.addEventListener("click", () => { hidden.has(b.dataset.id) ? hidden.delete(b.dataset.id) : hidden.add(b.dataset.id); caseObsShow(s, grid); });
}
function applyCaseStep(s) {
  casePlay(false);
  hrrrPlay(false);
  if (hr.on && !s.hrrr) hrrrOff();
  if (!arch.on) enterArchive();
  archPlay(false);
  const v = s.show;
  Object.assign(arch, v);
  arch.range = s.range ?? null; arch.rangeView = v.view;
  for (const [id, x] of [["yearView", v.view], ["yearMode", v.mode], ["yearLines", v.lines], ["yearWind", v.wind], ["yearWindAs", v.windAs]]) $(id).value = x;
  arch.question = null; qSel.value = "custom"; archCard();
  setArchDays(eventOf(s.day));                // an older event: its own window of days
  arch.i = Math.max(0, dayIndex(ARCH_DAYS, s.day)); arch.comp = null;
  openNote = null;
  archShow();
  // a hemisphere step (s.nh: its layers): zoom out to the hemisphere on this day; any other step comes back
  if (s.nh && hemi && ARCH?.hemisphere) { if (hemi.on) { const rel = hemi.show.relief; Object.assign(hemi.show, s.nh); if (rel !== hemi.show.relief) hemi.rebuildGuides(); syncHemiPanel(); hemiApply(true); updateLegend(); } else enterHemisphere({ show: s.nh }); }
  else if (hemi?.on) exitHemisphere(true);
  if (s.look && !s.nh) caseLook(s.look);
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
  mslp: { actual: "sea-level pressure (hPa): deep lows dark blue, around 1010 pale green, strong highs orange and red",
    anomaly: "sea-level pressure against its 1991–2020 average for the date (hPa): blue lower than normal (storms), red higher" },
  wind10: { actual: "wind speed 10 m above the sea (kt): pale blue light, cyan and green moderate (20–30), tan to red strong (40–50), magenta strongest" },
  gh500: { actual: "height of the 500 mb surface, about 5.5 km up (m): troughs blue, ridges orange",
    anomaly: "height of the 500 mb surface against its 1991–2020 average (m): blue lower than normal (troughs, cold lows aloft), red higher (ridges, blocks)" },
  wind500: { actual: "wind speed at 500 mb, the steering level (kt): pale blue light, cyan and green moderate, tan to red strong, magenta strongest" },
  jet: { actual: "wind speed at 250 mb, about 10 km up, the jet stream (kt): the tan, red and magenta ribbon (over about 110 kt) is the jet" },
  w500: { actual: "vertical motion at 500 mb (cm/s): blue rising (cloud and rain), orange sinking (clearing)" },
  t850: { actual: "temperature at 850 mb, about 1.5 km up (°C): blue cold, red warm",
    anomaly: "temperature at 850 mb against its 1991–2020 average (°C): blue colder than normal, red warmer" },
  pwat: { actual: "water vapour, all the water in the air above each point (mm): orange and tan dry, green moist, blue and purple very moist (atmospheric rivers, over 40 mm outside the tropics)" },
  t2m: { actual: "air temperature 2 m above the ground (°C): blue cold, red warm" },
  sst: { actual: "sea-surface temperature, the model's (°C): blue cold, red warm",
    anomaly: "sea-surface temperature against its 1991–2020 average (°C): blue colder than normal, red warmer" },
  ssto: { actual: "observed sea-surface temperature, NOAA OISST daily mean (°C): blue cold, red warm",
    anomaly: "observed sea-surface temperature against its 1991–2020 average (°C): blue colder than normal, red warmer" },
  ice: { actual: "sea-ice cover (%): white where the sea is frozen, see-through below 15 % (the ice edge)" },
  hs: { actual: "significant wave height, GFS-Wave (m): pale small, blue and green moderate, orange to purple big" },
  tp: { actual: "wave period (s): pale short (local wind-sea), dark red long (swell from far away)" },
};
function caseShows(v, when = "", marked = true, range = null) {
  const V = ARCHIVE_VIEWS[v.view];
  const lines = v.lines === "auto" ? V.lines : v.lines;
  const wind = v.wind === "auto" ? V.wind : v.wind === "none" ? null : v.wind;
  const mode = v.mode === "anomaly" && V.anomaly ? "anomaly" : "actual";
  const rows = [["Colour fill", CASE_FILL[v.view]?.[mode] ?? V.label]];
  // a step that stretches the colours over its own range (main.js rangedScale): the usual numbers don't apply
  if (range && mode === "actual") rows[0][1] += `. <i>On this step the colours are stretched over ${range[0]}–${range[1]} ${SCALES[V.actual[0]]?.units ?? ""}: the top colour means ${range[1]}, and the values above shift down to match</i>`;
  if (lines && lines !== "none") rows.push(["Lines", lines === "isobars"
    ? "isobars, sea-level pressure every 4 hPa: the closer together, the stronger the wind"
    : "height of the 500 mb surface every 60 m: the wind aloft blows along them, faster where they're closer"]);
  if (wind) rows.push([`Wind (${ARCHIVE_WIND_LEVELS[wind]})`, {
    flow: "flow lines along the wind, arrowheads pointing downwind: direction only, not speed",
    barbs: "barbs: each points into the wind, one full feather 10 kt, a pennant 50 kt",
    particles: "particles drifting through that moment's wind: faster streaks, faster wind" }[v.windAs]]);
  if (marked) rows.push(["Markers", "amber rings and labels: the features the text names, on this day"]);
  return `<ul class="case-key">${rows.map(([k, t]) => `<li><b>${k}:</b> ${t}</li>`).join("")}</ul>`
    + `<p class="when">One snapshot from the GFS model${when ? `, ${when}` : ", 00 UTC"}. Each grid square is about 100 km across, so small, fast storms are smoothed out. ${document.body.classList.contains("phone") ? "The colour key is the bar just above this panel." : "The colour key is bottom right."}</p>`;
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
  $("casePlay").textContent = on ? "■ Stop" : "▶ Play the days";
  const s = caseState.c?.steps[caseState.k];
  if (!on || !s?.play) return;
  const from = ARCH_DAYS.findIndex((d) => d.date >= s.play[0]);
  let i = from;
  const go = () => {
    if (i < 0 || i >= ARCH_DAYS.length || ARCH_DAYS[i].date > s.play[1]) { casePlay(false); return; }
    archGo(i); i++;
  };
  go();
  caseState.timer = setInterval(go, REDUCED_MOTION ? 2000 : 700);     // slower when the device asks for reduced motion
}
$("casePrev").addEventListener("click", () => { if (caseState.c && caseState.k > 0) showCaseStep(caseState.k - 1, { focus: true }); });
$("caseNext").addEventListener("click", () => {
  if (!caseState.c) return;
  if (caseState.k < caseState.c.steps.length - 1) showCaseStep(caseState.k + 1, { focus: true }); else closeCase();
});
$("casePlay").addEventListener("click", () => casePlay(!caseState.timer));
$("caseAll").addEventListener("click", (e) => { e.preventDefault(); closeCase(); });
$("caseBack").addEventListener("click", () => { closeCase(); $("caseList").scrollIntoView?.({ block: "nearest" }); });
$("caseMarks").addEventListener("change", () => { dirty = true; });
if (!YEAR_DAYS.length || !CASES.length) document.querySelector('.tabs button[data-tab="cases"]').hidden = true;
renderCaseList();
$("shareCopy").addEventListener("click", async () => {
  const url = `${location.origin}${location.pathname}#${encodeState(captureState())}`;
  const box = $("shareLink");
  box.hidden = false; box.value = url; box.select();
  let copied = false;
  // a phone's share sheet (Messages, Mail, AirDrop…) when there is one (iPhone review round 2)
  if (TOUCH && navigator.share) {
    try { await navigator.share({ title: "North Pacific 3D", url }); $("shareNote").textContent = "Shared."; history.replaceState(null, "", url); return; }
    catch (err) { if (err?.name === "AbortError") { $("shareNote").textContent = ""; return; } }       // cancelled: nothing to do
  }
  try { await navigator.clipboard.writeText(url); copied = true; } catch { /* the box is selected: copy by hand */ }
  $("shareNote").textContent = copied ? (arch.on
    ? "Copied. Anyone opening it sees this day of the past year with these settings and this view; if the day has rolled out of their year, they get the nearest day."
    : "Copied. Anyone opening it sees these settings and this view; if their build doesn't have this time, they get the same view at their 'now'.")
    : "Select the link above and copy it.";
  history.replaceState(null, "", url);
});
// ---- Today's lessons (todayfind.js; user pick 2026-10-09) ------------------------------------------
// The cases teach the past; these teach today. A few seconds after the page opens, the forecast is
// scanned (every 12 h of the surface bundle, about 6 MB, plus 250 mb now) for the week's deepest low,
// the strongest jet, the biggest moisture plume, the windiest hours in the Alenuihāhā and the biggest
// waves, and each becomes a short guided lesson in the Explore tab: steps that set the map, the time and
// the camera (through applyQuestion, so the "On the map" key is the usual one), with buttons that drop
// the right Drop tool at the feature. Every number comes from this build's own model data.
const today = { lessons: null, failed: false, lesson: null, k: 0 };
const llTxt = (lat, lon) => { const e = ((lon % 360) + 360) % 360; return `${Math.abs(lat).toFixed(0)}°${lat >= 0 ? "N" : "S"} ${(e > 180 ? 360 - e : e).toFixed(0)}°${e > 180 ? "W" : "E"}`; };
const whenTxt = (h) => { const ms = Date.parse(manifest.anchor) + h * 3600e3; return `${fmtLocal(ms) ?? fmtUtcShort(ms)} (${relNow(h, NOW_H)})`; };
const dayTxt = (h) => new Date(Date.parse(manifest.anchor) + h * 3600e3).toLocaleDateString("en-US", { weekday: "short" });
const LESSON_BASE = { focus: "sfc", context: [], fill: "none", particles: false, barbs: false, satellite: false, relief: 1, opacity: 0.75, hl: [] };
async function findToday() {
  const m = model, g = manifest.grid, nowLead = leads.reduce((b, h) => (Math.abs(h - NOW_H) < Math.abs(b - NOW_H) ? h : b), leads[0]);
  const picks = leads.filter((h) => h >= nowLead - 24 && ((h - nowLead) % 12 + 12) % 12 === 0);
  const waves = hasWaves(model);
  try {
    await Promise.all([...picks.flatMap((h) => [loader.load(m, h, "sfc"), ...(waves ? [loader.load(m, h, "wave")] : [])]), loader.load(m, nowLead, "p250")]);
  } catch { today.failed = true; renderToday(); return; }
  const sfc = picks.map((h) => ({ h, f: loader.ready(m, h, "sfc") })).filter((s) => s.f);
  const ahead = sfc.filter((s) => s.h >= nowLead), now = sfc.find((s) => s.h === nowLead)?.f, up = loader.ready(m, nowLead, "p250");
  const low = weekDeepestLow(sfc.map((s) => ({ h: s.h, mslp: s.f.mslp })), g);
  const jet = up ? jetCore(up.u, up.v, g) : null;
  const tc = tropicalCyclone(ahead.map((s) => ({ h: s.h, mslp: s.f.mslp })), g);
  const tcsNow = now ? tropicalLows(now.mslp, g) : [];
  const plume = now?.pwat ? moisturePlume(now.pwat, g, { avoid: tcsNow.map((t) => ({ lat: t.lat, lon: t.lon, rKm: 1200 })) }) : null;
  const trades = windiestInBox(ahead.map((s) => ({ h: s.h, u10: s.f.u10, v10: s.f.v10 })), g);
  const big = waves ? biggestWaves(picks.filter((h) => h >= nowLead).map((h) => ({ h, hs: loader.ready(m, h, "wave")?.hs })).filter((s) => s.hs), g) : null;
  today.lessons = buildLessons({ low, tc, jet, plume, trades, big, nowLead });
  // each lesson ends with a way out to the whole hemisphere at its time, with the guided question that gives the
  // big-picture context (its live note) (2026-10-17)
  if (hemi && NH_FORECAST) {
    const Q = { low: "coming", waves: "coming", jet: "jet", moisture: "rivers", trades: "trades", tc: "typhoons" };
    for (const L of today.lessons) {
      const qid = Q[L.id];
      if (!qid) continue;
      const last = L.steps.at(-1);
      (last.actions ??= []).push({ label: "🌐 See it from the pole", run: () => zoomOutTo(qid === "typhoons" && !STORMS?.storms?.length ? "jet" : qid) });
    }
  }
  renderToday();
}
function buildLessons({ low, tc, jet, plume, trades, big, nowLead }) {
  const out = [], first = leads[0];
  const go = (h) => () => { setPlaying(false); timeline.pos = timeline.clamp(h); requestAround(); applyTime(); };
  const drop = (kind, lat, lon, setup) => () => {
    const keep = { backThree: tracer.backThree, onLevel: tracer.onLevel };
    setup?.();
    dropTracer(kind, lat, lon);
    Object.assign(tracer, keep);
    $("todayHint").textContent = "Dropped: its chart and numbers are in the Drop tab; clear it there.";
  };
  if (low) {
    const h0 = Math.max(first, low.h - 36), fall = low.fall24 != null ? Math.round(low.fall24) : null;
    out.push({ id: "low", title: `The week's deepest low: ${Math.round(low.hPa)} mb, ${dayTxt(low.h)}`,
      teaser: `${Math.round(low.hPa)} mb near ${llTxt(low.lat, low.lon)}${low.bomb ? ", a \"bomb\"" : ""}: watch it grow, and find what drives it.`,
      steps: [
        { title: "Before: the low forming", h: h0, marks: [{ lat: low.lat, lon: low.lon, label: `deepest here, ${Math.round(low.h - h0)} h later: ${Math.round(low.hPa)} mb`, r: 300 }], look: { lat: low.lat - 3, lon: low.lon - 8, span: 42, tilt: 35 },
          spec: { focus: "p500", context: ["sfc"], fill: "wind", relief: 4, opacity: 0.45, surfaceParticles: "wind", hl: ["sfc", "p500"] },
          why: "The surface pressure and the 500 mb heights together: lows are made by the pattern above them.",
          lookFor: "the L at the surface and, west of it, the dip (trough) in the 500 mb height surface.",
          text: `<p>This is ${whenTxt(h0)}, about ${Math.round(low.h - h0)} hours before the week's deepest low reaches <b>${Math.round(low.hPa)} mb</b> near ${llTxt(low.lat, low.lon)}. Find its surface L and, upstream (west) of it, the 500 mb trough: the dip in the height surface. Press <b>Play</b>, or the button, and watch the two together.</p>`,
          actions: [{ label: "▶ Play toward its deepest", run: () => { go(h0)(); setPlaying(true); } }, { label: "Jump to its deepest", run: go(low.h) }] },
        { title: "At its deepest", h: low.h, marks: [{ lat: low.lat, lon: low.lon, label: `${Math.round(low.hPa)} mb${low.bomb ? ", a bomb" : ""}`, r: 250 }, { lat: low.lat - 6, lon: low.lon, label: "strong wind on its south side", r: 200 }], look: { lat: low.lat, lon: low.lon, span: 30, tilt: 20 },
          spec: { focus: "sfc", context: [], fill: "wind", particles: true, hl: ["sfc"] },
          why: "The surface wind and its speed: the tighter the isobars, the stronger the wind.",
          lookFor: "the ring of strong wind around the low, strongest where the isobars crowd together.",
          text: `<p>${whenTxt(low.h)}: <b>${Math.round(low.hPa)} mb</b>.${fall != null ? ` In the 24 hours before, its pressure fell <b>${fall} hPa</b>.` : ""} ${low.bomb ? `That makes it a <b>bomb</b>: at ${Math.round(low.lat)}° latitude a fall of ${Math.round(low.bombAt)} hPa in 24 h counts (24 hPa at 60°, less nearer the equator, where the same squeeze of isobars makes more wind).` : fall != null ? `A "bomb" needs a fall of ${Math.round(low.bombAt)} hPa at this latitude (24 hPa at 60°, scaled down nearer the equator): this one is ${fall >= low.bombAt * 0.7 ? "close, but not quite" : "a strong low, but not a bomb"}.` : ""} The wind spirals in toward the low, across the isobars at the surface, and the air that converges there has to rise: cloud and rain.</p>`,
          actions: [{ label: "Forces on the air south of it", run: drop("forces", low.lat - 6, low.lon) },
            { label: "Where did its air come from? (three heights)", run: drop("back", low.lat, low.lon + 2, () => { tracer.backThree = true; }) }] },
        { title: "Aloft: what drives it", h: low.h, marks: [{ lat: low.lat, lon: low.lon, label: "the surface low", r: 250 }], look: { lat: low.lat - 2, lon: low.lon - 6, span: 40, tilt: 30 },
          spec: { focus: "p500", context: ["sfc"], fill: "height", relief: 5, hl: ["sfc", "p500"] },
          why: "The 500 mb height surface, stretched to show its troughs and ridges, over the surface isobars.",
          lookFor: "where the surface low sits against the 500 mb trough: ahead (east) of it while deepening, under it once it's mature.",
          text: `<p>A low deepens when the air above it is carried away faster than it converges below, and that happens just ahead (east) of a 500 mb trough, where the upper flow spreads out. So a deepening low sits east of the trough; once the trough catches up and the low lies right under it ("stacked"), it stops deepening and slowly fills. Step the time back and forth to see which stage this is. Drop an air parcel ahead of the trough and watch it rise.</p>`,
          actions: [{ label: "Drop an air parcel ahead of the trough", run: drop("parcel", low.lat - 2, low.lon + 4) }] },
      ] });
  }
  if (tc) {
    const hPa = Math.round(tc.hPa), h0 = Math.max(leads[0], tc.h - 48);
    out.push({ id: "tc", title: `A tropical cyclone: ${hPa} mb, ${dayTxt(tc.h)}`, teaser: `The model's deepest tropical storm this week, near ${llTxt(tc.lat, tc.lon)}: a different machine from the mid-latitude lows.`,
      steps: [
        { title: "The storm", h: tc.h, marks: [{ lat: tc.lat, lon: tc.lon, label: `${hPa} mb (model)`, r: 150 }], look: { lat: tc.lat, lon: tc.lon, span: 16, tilt: 20 },
          spec: { focus: "sfc", context: [], fill: "wind", particles: true, hl: ["sfc"] },
          why: "The surface wind and isobars around the storm.",
          lookFor: "the tight ring of isobars and strongest wind around the centre, and the calm at the middle.",
          text: `<p>${whenTxt(tc.h)}: <b>${hPa} mb</b> near ${llTxt(tc.lat, tc.lon)}, in the model. A tropical cyclone (typhoon, hurricane) runs on a different engine from the mid-latitude lows: no fronts and no trough driving it, but heat from a warm ocean (26 °C or more), released in the thunderstorms around its eye, and a warm core all the way up. The global model's half-degree grid is too coarse for its small core, so the real storm is probably deeper and its winds stronger than shown here; the official advisories (JTWC in the western Pacific, CPHC near Hawaiʻi) are the reference.</p>`,
          actions: [{ label: "Lift a parcel beside it", run: drop("lift", tc.lat + 3, tc.lon) }, { label: "Launch a weather balloon in it", run: drop("sonde", tc.lat + 1, tc.lon) },
            { label: "Forces on the air near it", run: drop("forces", tc.lat + 2.5, tc.lon) }] },
        { title: "In 3-D", h: tc.h, marks: [{ lat: tc.lat, lon: tc.lon, label: "the storm's core", r: 150 }], look: { lat: tc.lat - 4, lon: tc.lon, span: 18, tilt: 55 },
          spec: { focus: "p850", context: ["sfc", "p500", "p250"], fill: "wind", particles: true, hl: ["sfc"] },
          why: "The wind at 850 mb with the other levels above and below: the storm's whole depth.",
          lookFor: "the circulation reaching up through the levels, strongest low down, and the wind spreading out at the top.",
          text: `<p>Seen side-on the storm is tall: the spin reaches up through every level, strongest near the surface and fading upward, and at the top (250 mb) the air rushes outward (the outflow), which is what lets it keep pumping air up through its core. Strong wind changing with height (shear) would tilt it and tear it apart: these storms need light shear.</p>`,
          actions: [] },
        { title: "Where it's going", h: h0, marks: [{ lat: tc.lat, lon: tc.lon, label: `${hPa} mb here, ${Math.round(tc.h - h0)} h later`, r: 200 }], look: { lat: tc.lat + 6, lon: tc.lon, span: 40, tilt: 20 },
          spec: { focus: "sfc", context: ["p500"], fill: "wind", particles: true, hl: ["sfc", "p500"] },
          why: "The surface wind with the 500 mb heights: what steers the storm.",
          lookFor: "the storm moving around the edge of the subtropical high, and turning north and east if a trough reaches it.",
          text: `<p>Tropical cyclones are steered by the winds around them, mostly the flow around the edge of the subtropical high: westward in the trades, then curving north and, if a mid-latitude trough picks them up, east ("recurving"), often becoming a mid-latitude storm. Play from here and watch its track against the 500 mb heights.</p>`,
          actions: [{ label: "▶ Play", run: () => { go(h0)(); setPlaying(true); } }] },
      ] });
  }
  if (jet) {
    const kt = Math.round(jet.kt);
    out.push({ id: "jet", title: `The fastest wind: a ${kt} kt jet`, teaser: `${kt} kt at 250 mb (about 10 km up) near ${llTxt(jet.lat, jet.lon)}, now.`,
      steps: [
        { title: "The jet stream now", h: nowLead, marks: [{ lat: jet.lat, lon: jet.lon, label: `${kt} kt jet core`, r: 300 }], look: { lat: jet.lat, lon: jet.lon, span: 45, tilt: 30 },
          spec: { focus: "p250", context: [], fill: "wind", particles: true },
          why: "The wind at 250 mb, near the top of the weather, where the jet streams are strongest.",
          lookFor: "the narrow ribbon of fastest wind, and where it speeds up and slows down along its length.",
          text: `<p>The fastest wind on the map now is <b>${kt} kt</b> at 250 mb, near ${llTxt(jet.lat, jet.lon)}. Jet streams sit above the boundary between cold polar air and warm subtropical air: the bigger the temperature contrast below, the faster the wind gets with height. Up here there's almost no friction, so the pressure push and Earth's spin nearly balance: see it with the forces. A weather balloon launched under the jet shows the wind growing with height.</p>`,
          actions: [{ label: "Forces at the core", run: drop("forces", jet.lat, jet.lon) },
            { label: "Launch a weather balloon under it", run: drop("sonde", jet.lat, jet.lon) },
            { label: "Balloons either side", run: () => { drop("balloon", jet.lat + 4, jet.lon - 10)(); drop("balloon", jet.lat - 4, jet.lon - 10)(); } }] },
        { title: "What the jet does to the weather below", h: nowLead, marks: [{ lat: jet.lat, lon: jet.lon, label: "the jet core, 10 km up", r: 300 }], look: { lat: jet.lat, lon: jet.lon, span: 50, tilt: 25 },
          spec: { focus: "sfc", context: ["p250"], fill: "none", particles: true, hl: ["sfc"] },
          why: "The surface isobars and wind, with the 250 mb level above them.",
          lookFor: "lows lined up under the jet, especially where it slows down (its exit) on the poleward side.",
          text: `<p>Storms form and travel under the jet. Where the jet speeds up (its entrance) and slows down (its exit), air aloft is forced to converge or spread out; on the poleward side of the exit and the equatorward side of the entrance it spreads, the air beneath rises, and surface lows deepen. Press Play and watch the lows ride along beneath it.</p>`,
          actions: [{ label: "▶ Play", run: () => setPlaying(true) }] },
      ] });
  }
  if (plume) {
    const mm = Math.round(plume.mm);
    out.push({ id: "moisture", title: plume.river ? `An atmospheric river: ${mm} mm of water vapour` : `The moistest air north of 35°N: ${mm} mm`,
      teaser: `${mm} mm of water vapour in the column near ${llTxt(plume.lat, plume.lon)}, now.`,
      steps: [{ title: plume.river ? "An atmospheric river" : "A moisture plume", h: nowLead, marks: [{ lat: plume.lat, lon: plume.lon, label: `${mm} mm of water vapour`, r: 300 }], look: { lat: plume.lat, lon: plume.lon, span: 40, tilt: 25 },
        spec: { focus: "sfc", context: [], fill: "water_vapour", particles: true, hl: ["sfc"] },
        why: "All the water vapour in the column (precipitable water): how much rain the air could give if it all fell.",
        lookFor: "a long, narrow band of moist air reaching out of the tropics toward the coast.",
        text: `<p>Near ${llTxt(plume.lat, plume.lon)} the air holds <b>${mm} mm</b> of water vapour (all of it, rained out, would be ${mm} mm of rain). ${plume.river ? "North of 35°N that much usually means an <b>atmospheric river</b>: a narrow plume carrying tropical moisture poleward, often more water than the Mississippi. Where it meets mountains it's lifted and rains hard." : "Not quite an atmospheric river (30 mm or more north of 35°N usually is), but moist air feeding the storms."} Where did this moisture come from, and how much would it take to make cloud?</p>`,
        actions: [{ label: "Where did it come from? (three heights)", run: drop("back", plume.lat, plume.lon, () => { tracer.backThree = true; }) },
          { label: "Lift a parcel there", run: drop("lift", plume.lat, plume.lon) }] }] });
  }
  if (trades) {
    const kt = Math.round(trades.kt);
    out.push({ id: "trades", title: `Hawaiʻi's trades this week: ${kt} kt near the Alenuihāhā`, teaser: `The model's strongest wind by the Alenuihāhā Channel this week: ${kt} kt, ${dayTxt(trades.h)}.`,
      steps: [{ title: "The channel winds", h: trades.h, marks: [{ lat: 20.3, lon: 203.9, label: "Alenuihāhā Channel", r: 50 }, { lat: trades.lat, lon: trades.lon, label: `${kt} kt (model's strongest here)`, r: 30 }], look: { lat: 20.5, lon: 203.5, span: 8, tilt: 20 },
        spec: { focus: "sfc", context: ["p500"], fill: "wind", particles: false, flow: true, hl: ["sfc"] },
        why: "The 10 m wind around the islands, with flow lines, and the 500 mb level above.",
        lookFor: "the wind speeding up between the islands, and how coarse the model's half-degree grid is compared with them.",
        text: `<p>The strongest 10 m wind the model has by the Alenuihāhā Channel this week is <b>${kt} kt</b>, ${whenTxt(trades.h)}. Remember the case: the global model's grid is about 55 km, wider than the channel, so it can't resolve the full speed-up between the mountains (on 20 December 2023 it had about 20 kt where 40–45 kt was observed). Read it as a floor, and look at what sets the trades: the high to the north and the inversion that squeezes the wind under it.</p>`,
        actions: [{ label: "Forces in the channel", run: drop("forces", 20.3, 203.9) },
          { label: "Lift a parcel north of the islands (the inversion)", run: drop("lift", 22.5, 202) },
          { label: "Open the Alenuihāhā case", run: () => { showTab("cases"); document.querySelector('#caseList [data-case="alenuihaha-dec-2023"]')?.click(); } }] }] });
  }
  if (big) {
    out.push({ id: "waves", title: `The biggest seas: ${big.m.toFixed(1)} m`, teaser: `${big.m.toFixed(1)} m significant waves near ${llTxt(big.lat, big.lon)}, ${dayTxt(big.h)}.`,
      steps: [{ title: "The biggest waves", h: big.h, marks: [{ lat: big.lat, lon: big.lon, label: `${big.m.toFixed(1)} m seas`, r: 300 }], look: { lat: big.lat, lon: big.lon, span: 40, tilt: 20 },
        spec: { focus: "sfc", context: [], fill: "waves", particles: true, surfaceParticles: "waves", hl: ["sfc"] },
        why: "Significant wave height from the model's own wave model, with particles moving the way the wave energy travels.",
        lookFor: "the biggest seas under the strongest, longest-blowing wind, and swell spreading out from them.",
        text: `<p><b>${big.m.toFixed(1)} m</b> significant wave height near ${llTxt(big.lat, big.lon)}, ${whenTxt(big.h)}. Significant height is the average of the highest third of the waves: about 1 in 10 is 30 % bigger, and over a few hours the biggest can be twice it. Waves grow with the wind's speed, how long it blows and over how much sea (the fetch). From here the energy travels on as swell, for days and thousands of kilometres: watch the particles, and trace a swell back to see where it was made.</p>`,
        actions: [{ label: "▶ Play", run: () => setPlaying(true) }, { label: "Where's the swell at Oʻahu's north shore from?", run: drop("swell", 21.9, 201.9) }] }] });
  }
  return out;
}
function renderToday() {
  const box = $("todayList");
  if (today.lesson) { box.hidden = true; $("todayLesson").hidden = false; return; }
  $("todayLesson").hidden = true; box.hidden = false;
  if (today.failed) { box.innerHTML = `<p class="note">Couldn't load the forecast to find today's lessons.</p>`; return; }
  if (!today.lessons) { box.innerHTML = `<p class="note">Finding today's lessons in the forecast…</p>`; return; }
  box.innerHTML = today.lessons.map((L, i) => `<button class="today-item" data-i="${i}"><b>${L.title}</b><span>${L.teaser}</span></button>`).join("")
    || `<p class="note">Nothing found in this build.</p>`;
  for (const b of box.querySelectorAll(".today-item")) b.addEventListener("click", () => openLesson(today.lessons[Number(b.dataset.i)], 0));
}
function openLesson(L, k) {
  today.lesson = L; today.k = k;
  const st = L.steps[k];
  $("todayStepCount").textContent = `${L.title} · step ${k + 1} of ${L.steps.length}`;
  $("todayStepTitle").textContent = st.title;
  // the last step: past cases of the same kind (todaycases.js), the ones still in the archive
  const past = k === L.steps.length - 1 ? todayCaseLinks(L.id, CASES).filter((x) => caseStatus(x.case, ALL_ARCH_DATES).ok) : [];
  $("todayText").innerHTML = st.text + (past.length ? `<p class="today-cases"><b>On a past day:</b> compare ${past[0].compare}. ${
    past.map((x) => `<a href="#" data-tcase="${x.case.id}">${x.case.title}</a>`).join(" · ")}</p>` : "");
  for (const a of $("todayText").querySelectorAll("a[data-tcase]")) a.addEventListener("click", (e) => { e.preventDefault(); if (openCase(a.dataset.tcase, 0)) showTab("cases"); });
  $("todayHint").textContent = "";
  const acts = $("todayActions");
  acts.innerHTML = (st.actions ?? []).map((a, i) => `<button class="mini" data-a="${i}">${a.label}</button>`).join("");
  for (const b of acts.querySelectorAll("button")) b.addEventListener("click", () => st.actions[Number(b.dataset.a)].run());
  $("todayPrev").disabled = k === 0;
  $("todayNext").textContent = k === L.steps.length - 1 ? "Done" : "Next ▶";
  if (arch.on) exitArchive();
  applyQuestion({ id: "lesson", label: st.title, guide: "today", why: st.why, lookFor: st.lookFor, spec: { ...LESSON_BASE, ...st.spec, time: "now", look: st.look } });
  lessonMarks = st.marks?.length ? { h: st.h, marks: st.marks } : null;
  setPlaying(false); timeline.pos = timeline.clamp(st.h); requestAround(); applyTime();
  renderToday();
}
$("todayPrev").addEventListener("click", () => today.lesson && openLesson(today.lesson, Math.max(0, today.k - 1)));
$("todayNext").addEventListener("click", () => {
  if (!today.lesson) return;
  if (today.k < today.lesson.steps.length - 1) openLesson(today.lesson, today.k + 1);
  else { today.lesson = null; lessonMarks = null; renderToday(); dirty = true; }
});
$("todayAll").addEventListener("click", () => { today.lesson = null; lessonMarks = null; renderToday(); dirty = true; });
renderToday();
setTimeout(() => { findToday(); }, 3000);
// Start here (user pick 2026-10-09): a first visit gets a short walk round the page, one part at a time
// (the time, the time bar, the tabs, today's lessons, the colours); "Start here" by the Guide link
// replays it. Remembered on this device.
if (matchMedia("(pointer: coarse)").matches) {
  // hints written for a mouse and keyboard, reworded for touch
  for (const el of document.querySelectorAll(".hint")) if (el.querySelector("kbd")) {
    // drop each "<kbd>key</kbd> what it does" phrase, keeping the rest of the sentence
    el.innerHTML = el.innerHTML.replace(/Click the map/g, "Tap the map").split("·")
      .map((part) => part.replace(/(<kbd>[^<]*<\/kbd>)+[^.<·]*\.?/g, "")).filter((part) => part.trim()).join("·").replace(/\s*·\s*(?=<a\b|$)/g, " ");
  }
  const sc = $("secChartHover"); if (sc) sc.textContent = "Touch the chart for values.";
}
// The home-screen app: guide links open in the app, not out to Safari (iPhone review round 3)
if (matchMedia("(display-mode: standalone)").matches || navigator.standalone) for (const a of document.querySelectorAll('a[target="_blank"][href^="guide.html"]')) a.removeAttribute("target");
// Touch screens get touch words (iPhone review: no hover, no keys).
const TOUCH = matchMedia("(pointer: coarse)").matches;
const COACH = [
  ...(TOUCH ? [[".stage", "Drag with one finger to turn the view; pinch to zoom; drag with two fingers to move. Tap the map for the column of air there; press and hold for a quick reading."]] : []),
  [".hud", "The time on screen, in your own time zone (and UTC), and which model run it comes from."],
  [".timebar", "Move through time: the last 24 hours (with the satellite) to 7 days ahead. ▶ plays it; the dark blue band marks the nights."],
  [".tabs", "Explore: guided questions and today's lessons. Cases: real events, step by step. Drop: hands-on tools (balloons, parcels, smoke…). Layers, 3-D, Map and Style: build your own view."],
  ["#questionSel", "Start here: pick a question (it opens on the big picture, the surface and 500 mb) and the map sets itself up to answer it, with a card saying what to look for."],
  ["#todayBox", "Or try today's lessons, found in this forecast: each walks you through one feature of today's weather."],
  ["#legend", TOUCH ? "What the colours on the map mean. Press and hold the map to read values; tap it for the column of air there (the probe)." : "What the colours on the map mean. Hover over the map to read values; click it to pin a column (the probe)."],
  ...(TOUCH ? [["#panel", () => (sheet?.active() ? "The controls live in this sheet: drag its handle (or tap it) to make it smaller or bigger." : "The controls live in this panel; turn the phone upright for a sheet you can pull up and down.")]] : []),
];
function coach(k, measured = false) {
  const box = $("coach"), hole = $("coachHole");
  if (k >= COACH.length || k < 0) { box.hidden = true; if (sheet?.active()) sheet.set("peek"); /* the tour ends with the map in view */ try { localStorage.setItem("np3d.welcomed", "1"); } catch { /* ignore */ } return; }
  let [sel, text] = COACH[k];
  box.dataset.k = String(k);                            // before any wait for the sheet, so Next counts from here
  if (typeof text === "function") text = text();
  if (sel === "#todayBox" || sel === "#questionSel") showTab("explore");
  // phones (iPhone review round 2): the colour key is the one-line key; things in the sheet need the sheet open and
  // scrolled to before they're measured
  if (sheet?.active() && sel === "#legend") sel = "#phoneKey";
  const target = document.querySelector(sel);
  if (sheet?.active() && target && $("panel").contains(target) && target !== $("panel") && !measured) {
    if (sheet.get() !== "full") sheet.set("full");
    target.scrollIntoView?.({ block: "nearest" });
    requestAnimationFrame(() => coach(k, true));
    return;
  }
  if (sheet?.active() && target && !$("panel").contains(target) && sheet.get() === "full" && !measured) {
    sheet.set("half"); requestAnimationFrame(() => coach(k, true)); return;           // things on the map need the sheet down
  }
  const el = target, r = el?.getBoundingClientRect();
  if (!r || !r.width) { coach(k + 1); return; }
  box.hidden = false;
  Object.assign(hole.style, { left: `${r.left - 4}px`, top: `${r.top - 4}px`, width: `${r.width + 8}px`, height: `${r.height + 8}px` });
  $("coachText").textContent = text;
  $("coachStep").textContent = `${k + 1} of ${COACH.length}`;
  $("coachNext").textContent = k === COACH.length - 1 ? "Done" : "Next";
  const tip = $("coachTip"), W = innerWidth, H = innerHeight, tw = Math.min(300, W - 20);
  tip.style.width = `${tw}px`;
  const below = r.bottom + 12 + 120 < H, above = r.top - 12 - 120 > 0;
  tip.style.left = `${Math.max(10, Math.min(W - tw - 10, r.left + r.width / 2 - tw / 2))}px`;
  if (below || !above) {
    // below it, or, for a big area (the whole view on a phone) with no room either side, inside it near the top
    tip.style.top = below ? `${r.bottom + 12}px` : `${Math.max(10, r.top + 16)}px`; tip.style.bottom = "";
  } else { tip.style.top = ""; tip.style.bottom = `${H - r.top + 12}px`; }
  box.dataset.k = String(k);
}
$("coachNext").addEventListener("click", () => coach(Number($("coach").dataset.k) + 1));
// re-place the tour's spotlight when the sheet moves or the screen turns
const recoach = () => { if (!$("coach").hidden) coach(Number($("coach").dataset.k), true); };
document.addEventListener("sheetchange", () => requestAnimationFrame(recoach));
window.addEventListener("resize", recoach);
$("coachSkip").addEventListener("click", () => coach(COACH.length));
$("startHere").addEventListener("click", (e) => { e.preventDefault(); coach(0); });
{
  let seen = false;
  try { seen = !!localStorage.getItem("np3d.welcomed"); } catch { /* ignore */ }
  if (!seen && !location.hash) setTimeout(() => coach(0), 1500);
}
// A newer build (BUILD_SPEC §7; done 2026-10-09): every 10 minutes, and when the tab comes back into
// view, read the manifest's build time again; if a newer build is published, offer a reload (keeping the
// view, through the same link as Share). Never switches by itself: someone may be mid-lesson.
{
  const built = Date.parse(manifest.generated_at);
  let offered = false, dismissed = false;
  const check = async () => {
    if (offered || dismissed) return;
    try {
      const m = await (await fetch(`${DATA}/manifest.json`, { cache: "no-store" })).json();
      const t = Date.parse(m.generated_at);
      if (!(t > built)) return;
      offered = true;
      const l = fmtLocal(t);
      $("newBuildText").textContent = `A newer forecast is published (built ${l ? `${l}, ${fmtUtcShort(t)}` : fmtUtc(t)}).`;
      $("newBuild").hidden = false;
    } catch { /* offline, or mid-publish: try again later */ }
  };
  setInterval(check, 10 * 60e3);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
  $("newBuildReload").addEventListener("click", () => { history.replaceState(null, "", `${location.pathname}#${encodeState(captureState())}`); location.reload(); });
  $("newBuildClose").addEventListener("click", () => { dismissed = true; $("newBuild").hidden = true; });
}
// Hidden page (another app, a locked phone): pause what's running and resume it on return, to save battery and keep
// the workers quiet (2026-10-10 iPhone review). Only what was running is resumed.
{
  let resume = null;
  const hide = () => {
    if (resume) return;
    resume = { play: timeline.playing, arch: arch.on && arch.playing, sim: sim.on && !sim.paused && !sim.held };
    if (resume.play) setPlaying(false);
    if (resume.arch) archPlay(false);
    if (resume.sim) { sim.paused = true; simPost({ type: "pause", paused: true }); }
  };
  const show = () => {
    if (!resume) return;
    const r = resume; resume = null;
    if (r.play) setPlaying(true);
    if (r.arch) archPlay(true);
    if (r.sim) { sim.paused = false; simPost({ type: "pause", paused: false }); }
    dirty = true;
  };
  document.addEventListener("visibilitychange", () => (document.visibilityState === "hidden" ? hide() : show()));
  window.addEventListener("pagehide", hide);
  // iOS may throw a backgrounded page away: keep this view (or the Simulate step) for half an hour in this tab's session
  // storage, so a reload soon after comes back to it, while a visit the next day still opens at "now" (panel round 3:
  // writing it into the link froze the time).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;
    try {
      const st = simStepNow(), hash = sim.on ? (st ? `sim=${sim.lesson.id}/${st.id}` : "") : encodeState(captureState());
      sessionStorage.setItem("np3d.resume", JSON.stringify({ hash, at: Date.now() }));
    } catch { /* ignore */ }
  });
  window.addEventListener("pageshow", show);
}
$("glRestore").addEventListener("click", () => {
  try { history.replaceState(null, "", sim.on && simStepNow() ? location.hash : `${location.pathname}#${encodeState(captureState())}`); } catch { /* ignore */ }
  location.reload();
});
// a reload within half an hour of the page being hidden comes back to where it was (see the hide handler)
try {
  const r = JSON.parse(sessionStorage.getItem("np3d.resume") ?? "null");
  if (!location.hash && r?.hash && Date.now() - r.at < 30 * 60e3) history.replaceState(null, "", `${location.pathname}#${r.hash}`);
  sessionStorage.removeItem("np3d.resume");
} catch { /* ignore */ }
{
  const shared = /[#&]sim=/.test(location.hash) ? null : decodeState(location.hash);
  if (shared) applyState(shared);
}
requestAround();
applyTime();
updateLoadStatus();
setTimeout(simFromHash, 0);
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
window.__atmos3d = { get hemi() { return hemi; }, LITE, derivedAhead, sim, tracer, note, get lessonMarks() { return lessonMarks; }, caseMarks, derivedFor, nearerLead, roiOutline, finishFlight, sectionData, handles, roi, get hp() { return hp; }, get pvol() { return pvol; }, p3, arch, levelLines, get secLevelH() { return secLevelH; }, drawFrame, captureState, applyState, frameCost, manifest, geo, ground, sat, opcOutline, graticule, ruler, placeOverlays, setProbe, hlCache, curtain, sec, sliceChanged, showTab, tour, renderInto, frameParts, exportTimes, applyTime, flyTo, setView, applyQuestion, QUESTIONS, show, NOW_H, loader, timeline, layers, renderer, camera, controls, projErrKm, fps, get leads() { return leads; }, get model() { return model; }, setPlaying };
