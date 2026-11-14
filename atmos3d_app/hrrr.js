// The 3 km model in a Northwest case step (user request 2026-10-14: higher-resolution data for the cases, shown for
// teaching and exploring). NOAA's High-Resolution Rapid Refresh (HRRR): hourly analyses on a 3 km grid that take in
// radar and surface stations, so they show what a 1° daily map can't: a windstorm's core, a snow band, a
// thunderstorm, the wind in the gaps, fog. The frames are hrrr/<YYYYMMDDHH>.u16.gz with hrrr/index.json (made once by
// tools/fetch_case_hrrr.py on a 0.05° grid over the Northwest). This module lists a step's frames, says what each
// view shows and how to read it, and makes the fill and the readout values. Pure, no imports.

const KT = 1.94384;
// view -> {label, scale (colormaps.js), units, value(fields, k), lines (isobars every 2 hPa), wind (flow lines),
// obs (the station variable to compare, caseobs.js), why (what it shows and why it matters), look (what to look for)}
export const HRRR_VIEWS = {
  gust: { label: "wind gusts", scale: "hr_gust", units: "kt", lines: true, wind: true, obs: "peak",
    value: (f, k) => f.gust[k] * KT,
    why: "The strongest gusts the model expects near the ground. Windstorm damage comes from gusts, not the average wind.",
    look: "where the gusts are strongest: on the low's southern side, in the gaps and down the slopes; compare the stations' gusts on the map with the model's." },
  wind: { label: "10 m wind", scale: "hr_gust", units: "kt", lines: true, wind: true, obs: "ws",
    value: (f, k) => Math.hypot(f.u10[k], f.v10[k]) * KT,
    why: "The steady wind at 10 m, the height wind is measured at. The flow lines show where it blows.",
    look: "the wind turned by the terrain: down the Strait, up Puget Sound, out of the Fraser and the Gorge." },
  mslp: { label: "sea-level pressure", scale: "hr_mslp", units: "hPa", lines: true, wind: true, obs: "p",
    value: (f, k) => f.mslp[k] / 100,
    why: "The isobars every 2 hPa show the lows, highs and troughs that drive the wind; the 3 km grid keeps the small, tight ones a 1° grid smooths away.",
    look: "how tightly the isobars pack (the tighter, the windier) and how a low's centre moves hour by hour." },
  t2m: { label: "2 m temperature", scale: "hr_t2m", units: "°C", lines: false, wind: true, obs: "t",
    value: (f, k) => f.t2m[k] - 273.15,
    why: "Temperature at the height it's measured, shaped by the terrain: cold air pooled in valleys, warm hills, the sea breeze.",
    look: "fronts and sea breezes as sharp edges; cold pools in the valleys under an inversion; the marine air pushing inland." },
  td2m: { label: "dew point (moisture)", scale: "hr_td", units: "°C", lines: false, wind: true, obs: "td",
    value: (f, k) => f.td2m[k] - 273.15,
    why: "How much water vapour is in the air near the ground: where the dew point meets the temperature, fog and low cloud form.",
    look: "moist ocean air (high dew point) coming in with a marine push; dry air coming down from the east." },
  refc: { label: "radar (composite reflectivity)", scale: "hr_refc", units: "dBZ", lines: false, wind: false, obs: null,
    value: (f, k) => f.refc[k],
    why: "What a weather radar would see: rain, snow and hail, strongest at the top of the scale. HRRR takes in the real radar, so this is close to what was observed.",
    look: "bands of rain along a front, cells of a thunderstorm, the snow band on the cold side of a front." },
  vis: { label: "visibility (fog)", scale: "hr_vis", units: "km", lines: false, wind: false, obs: "vis",
    value: (f, k) => f.vis[k] / 1000,
    why: "How far you could see: fog and heavy rain or snow cut it to a few hundred metres. Shown only below 10 km.",
    look: "fog in the valleys and over the water under a ridge; fog arriving with the marine air." },
  tcc: { label: "cloud cover", scale: "hr_cloud", units: "%", lines: false, wind: false, obs: null,
    value: (f, k) => f.tcc[k],
    why: "How much of the sky is covered by cloud at any height.",
    look: "the marine stratus filling in from the coast; clear skies under a ridge; cloud ahead of a front." },
  pwat: { label: "water vapour", scale: "hr_pwat", units: "mm", lines: true, wind: true, obs: null,
    value: (f, k) => f.pwat[k],
    why: "All the water vapour above each point, the measure of an atmospheric river.",
    look: "the river's plume and where it meets the mountains." },
  smoke: { label: "smoke near the ground", scale: "hr_smoke", units: "µg/m³", lines: false, wind: true, obs: null,
    value: (f, k) => f.smoke[k],
    why: "HRRR-Smoke's near-surface smoke from wildfires (fine particles, comparable with PM2.5: 9 is the EPA's daily good limit, 35 unhealthy for sensitive groups, 55 unhealthy).",
    look: "where the wind carries the smoke: over the Cascades on east winds, and cleared away when the marine air returns." },
};

// The source per region (user request 2026-10-14: Hawaiʻi too): HRRR covers the Northwest, NOAA's Real-Time Mesoscale
// Analysis (RTMA) covers Hawaiʻi; each with its own folders of frames and observed images.
export const HIRES = {
  pnw: { dir: "hrrr", img: "obsimg", name: "The 3 km model", short: "3 km model", noun: "model", src: "HRRR", hud: "HRRR 3 km analysis", cell: "3 km",
    blurb: "NOAA's High-Resolution Rapid Refresh: a 3 km grid, a new analysis every hour taking in radar and the stations, so it shows what the 1° daily map can't.",
    cover: "it covers the Northwest box only (to about 49–50°N)" },
  hawaii: { dir: "rtma_hi", img: "obsimg_hi", name: "The 2.5 km analysis", short: "2.5 km analysis", noun: "analysis", src: "RTMA", hud: "RTMA 2.5 km analysis", cell: "2.5 km",
    blurb: "NOAA's Real-Time Mesoscale Analysis for Hawaiʻi: every hour, the stations and satellite blended with a short forecast on a 2.5 km grid. It shows the islands' own winds (the channel jets, the wakes behind the big mountains, sea and land breezes), temperature and moisture, which the 1° daily map can't. It has no pressure or radar: for rain, use the observed radar.",
    cover: "it covers the main islands (18.5–22.5°N)" },
};
// The views a frame can show, from the fields it holds.
const NEEDS = { gust: ["gust"], wind: ["u10", "v10"], mslp: ["mslp"], t2m: ["t2m"], td2m: ["td2m"], refc: ["refc"], vis: ["vis"], tcc: ["tcc"], pwat: ["pwat"], smoke: ["smoke"] };
export function hrrrViews(fieldNames) {
  const has = new Set(fieldNames);
  return Object.keys(HRRR_VIEWS).filter((k) => NEEDS[k].every((f) => has.has(f)));
}

const HOUR = 3600e3;
const keyTime = (key) => Date.UTC(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8), +key.slice(8, 10));
const winTime = (s) => Date.parse(`${s}:00:00Z`);

// The frames a step's window asks for that the index has, in time order: [{key, t, file, fields}].
export function hrrrFrames(index, step) {
  if (!index?.frames || !step?.hrrr) return [];
  const a = winTime(step.hrrr.from), b = winTime(step.hrrr.to), every = step.hrrr.every ?? 1, out = [];
  for (let t = a; t <= b; t += every * HOUR) {
    const key = new Date(t).toISOString().slice(0, 13).replace(/[-T]/g, "");
    const f = index.frames[key];
    if (f) out.push({ key, t: keyTime(key), file: f.file, fields: f.fields });
  }
  return out;
}

// The frame nearest a time (ms), or -1.
export function hrrrNearest(frames, t) {
  let best = -1;
  frames.forEach((f, i) => { if (best < 0 || Math.abs(f.t - t) < Math.abs(frames[best].t - t)) best = i; });
  return best;
}

// The fill for a view: one value per grid point, NaN where there's none (outside HRRR's domain, no radar echo).
export function hrrrFill(view, fields, n) {
  const V = HRRR_VIEWS[view], out = new Float32Array(n);
  for (let k = 0; k < n; k++) out[k] = V.value(fields, k);
  return out;
}

// The grid point nearest a lat/lon (lon east), or -1 outside the grid.
export function hrrrIndex(grid, lat, lon) {
  const lonE = lon < 0 ? lon + 360 : lon;
  const i = Math.round((lonE - grid.lon0) / grid.dlon), j = Math.round((lat - grid.lat0) / grid.dlat);
  return i < 0 || j < 0 || i >= grid.nlon || j >= grid.nlat ? -1 : j * grid.nlon + i;
}

// A smoothed copy of a field for drawing contours (NaN kept out): three passes of a (2r+1)-point box filter each way,
// close to a Gaussian about 2.5 r cells across. The 3 km sea-level pressure is noisy over the mountains (reduced to
// sea level from high ground) and stored in 0.2 hPa steps, so its 2 hPa isobars zig-zagged (user report, 2026-10-14).
export function smoothForContours(a, grid, r = 2, passes = 3) {
  const { nlat, nlon } = grid;
  let src = Float32Array.from(a), tmp = new Float32Array(a.length);
  const pass = (from, to, along) => {
    for (let o = 0; o < (along ? nlat : nlon); o++) {
      const n = along ? nlon : nlat;
      for (let q = 0; q < n; q++) {
        let sum = 0, cnt = 0;
        for (let d = -r; d <= r; d++) {
          const qq = q + d;
          if (qq < 0 || qq >= n) continue;
          const v = from[along ? o * nlon + qq : qq * nlon + o];
          if (Number.isFinite(v)) { sum += v; cnt++; }
        }
        const k = along ? o * nlon + q : q * nlon + o;
        to[k] = Number.isFinite(from[k]) && cnt ? sum / cnt : from[k];
      }
    }
  };
  for (let p = 0; p < passes; p++) { pass(src, tmp, true); pass(tmp, src, false); }
  return src;
}
