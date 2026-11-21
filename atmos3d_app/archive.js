// The past-year archive ("Past year" mode, user request 2026-09-28): one real
// GFS 00Z analysis per day for the last 365 days (export_archive.py), on its
// own 1-degree grid. What to show, in which units, and a point's year.
//
// Days are never blended: the slider and Play step from one real analysis to
// the next. Pure, no imports: node --test loads it.

const KT = 1.943844;

// view -> label; the actual and (when the climatology exists) anomaly fill:
// [scale key in colormaps.js, field ("wind:<level>" = speed in kt), convert(value)
// -> scale units]; default lines; the wind level drawn when wind is "usual".
const same = (v) => v;
export const ARCHIVE_VIEWS = {
  mslp: { label: "sea-level pressure", actual: ["arch_mslp", "mslp", (v) => v / 100], anomaly: ["mslpa", "mslpa", (v) => v / 100], lines: "isobars", wind: "10" },
  wind10: { label: "10 m wind", actual: ["wind10", "wind:10", same], anomaly: null, lines: "isobars", wind: "10" },
  gh500: { label: "500 mb height", actual: ["gh500", "gh500", same], anomaly: ["gha500", "gha500", same], lines: "heights", wind: "500" },
  wind500: { label: "500 mb wind (the steering level)", actual: ["wind500", "wind:500", same], anomaly: null, lines: "heights", wind: "500" },
  jet: { label: "250 mb wind (the jet)", actual: ["wind250", "wind:250", same], anomaly: null, lines: "heights", wind: "250" },
  w500: { label: "rising / sinking air at 500 mb", actual: ["w500", "w500", same], anomaly: null, lines: "heights", wind: null },
  t850: { label: "850 mb temperature", actual: ["t850", "t850", (v) => v - 273.15], anomaly: ["ta850", "ta850", same], lines: "isobars", wind: null },
  pwat: { label: "water vapour (atmospheric rivers)", actual: ["arch_pwat", "pwat", same], anomaly: null, lines: "isobars", wind: "10" },
  t2m: { label: "2 m temperature", actual: ["t2m", "t2m", (v) => v - 273.15], anomaly: null, lines: "isobars", wind: null },
  sst: { label: "sea temperature (the model's)", actual: ["sst", "sst", (v) => v - 273.15], anomaly: ["ssta", "ssta", same], lines: "isobars", wind: null },
  // obs: from the day's OISST file (a day behind the models, so the newest day has none).
  ssto: { label: "sea temperature (observed, OISST)", actual: ["ssto", "ssto", (v) => v - 273.15], anomaly: ["sstoa", "sstoa", same], lines: "isobars", wind: null, obs: true },
  ice: { label: "sea ice", actual: ["arch_ice", "ice", (v) => v * 100], anomaly: null, lines: "none", wind: null },
  hs: { label: "wave height (GFS-Wave)", actual: ["hs", "hs", same], anomaly: null, lines: "isobars", wind: "10" },
  tp: { label: "wave period (long = swell)", actual: ["tp", "tp", same], anomaly: null, lines: "none", wind: null },
};
// Scales whose missing points (land, ice) are drawn see-through.
export const ARCHIVE_SEA = new Set(["sst", "ssta", "ssto", "sstoa", "hs", "tp", "arch_ice"]);
export const ARCHIVE_WIND_LEVELS = { 10: "10 m", 500: "500 mb", 250: "250 mb" };

// Wind components (m/s) at "10" | "500" | "250", or null.
export function archiveWind(level, fields) {
  const u = fields[`u${level}`], v = fields[`v${level}`];
  return u && v ? { u, v } : null;
}
export const ARCHIVE_LINES = { isobars: ["mslp", (v) => v / 100, 4], heights: ["gh500", (v) => v, 60], none: null };

// Units of each scale, for readouts.
const UNITS = { arch_mslp: "hPa", mslpa: "hPa", gh500: "m", gha500: "m", wind10: "kt", wind500: "kt", wind250: "kt", t850: "°C", ta850: "°C",
  sst: "°C", ssta: "°C", ssto: "°C", sstoa: "°C", t2m: "°C", arch_pwat: "mm", arch_ice: "%", w500: "cm/s", hs: "m", tp: "s" };

// The fill for a day: {scaleKey, units, f: Float32Array in the scale's units
// (NaN stays NaN; the caller maps sea-missing)}; null if the view has no
// such mode (e.g. no anomaly for the jet).
export function archiveFill(view, mode, fields) {
  const v = ARCHIVE_VIEWS[view];
  const spec = mode === "anomaly" ? v?.anomaly : v?.actual;
  if (!spec) return null;
  const [scaleKey, field, conv] = spec;
  let src = fields[field];
  if (field.startsWith("wind:")) {
    const w = archiveWind(field.slice(5), fields);
    if (!w) return null;
    src = new Float32Array(w.u.length);
    for (let k = 0; k < src.length; k++) src[k] = Math.hypot(w.u[k], w.v[k]) * KT;
    return { scaleKey, units: UNITS[scaleKey], f: src };
  }
  if (!src) return null;
  const f = new Float32Array(src.length);
  for (let k = 0; k < src.length; k++) f[k] = conv(src[k]);
  return { scaleKey, units: UNITS[scaleKey], f };
}

// Contour values and interval for a lines kind, or null.
export function archiveLines(kind, fields) {
  const spec = ARCHIVE_LINES[kind];
  if (!spec) return null;
  const [field, conv, interval] = spec;
  const src = fields[field], c = new Float32Array(src.length);
  for (let k = 0; k < src.length; k++) c[k] = conv(src[k]);
  return { c, interval };
}

// Flat index of the archive grid point nearest lat/lon (lon any convention),
// or -1 outside the grid.
export function archiveIndex(grid, lat, lon) {
  const j = Math.round((lat - grid.lat0) / grid.dlat);
  let L = ((lon % 360) + 360) % 360;
  if (L < grid.lon0 - grid.dlon / 2) L += 360;
  const i = Math.round((L - grid.lon0) / grid.dlon);
  if (j < 0 || j >= grid.nlat || i < 0 || i >= grid.nlon) return -1;
  return j * grid.nlon + i;
}

// A point's year: [[date, value in the fill's units], ...] for the days
// loaded so far (fieldsByDay: Map date -> fields). Missing values skipped.
export function archiveSeries(days, fieldsByDay, k, view, mode) {
  const out = [];
  for (const d of days) {
    const f = fieldsByDay.get(d.date);
    if (!f) continue;
    const fill = archiveFill(view, mode, f);
    const v = fill ? fill.f[k] : NaN;
    if (Number.isFinite(v)) out.push([d.date, v]);
  }
  return out;
}

// A small SVG chart of a series (dates across, value up), zero line for anomalies.
export function seriesSvg(series, { w = 300, h = 120, units = "", zero = false, mark = null } = {}) {
  if (series.length < 2) return "";
  const L = 34, R = 6, T = 8, B = 16;
  const t = series.map(([d]) => Date.parse(d)), v = series.map(([, x]) => x);
  let lo = Math.min(...v), hi = Math.max(...v);
  if (zero) { const m = Math.max(Math.abs(lo), Math.abs(hi), 1e-6); lo = -m; hi = m; }
  if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
  const x = (ms) => L + ((ms - t[0]) / Math.max(1, t.at(-1) - t[0])) * (w - L - R);
  const y = (val) => T + ((hi - val) / (hi - lo)) * (h - T - B);
  const pts = series.map(([, val], i) => `${x(t[i]).toFixed(1)},${y(val).toFixed(1)}`).join(" ");
  const fmt = (n) => (Math.abs(n) >= 100 ? Math.round(n) : n.toFixed(1));
  const out = [`<svg class="probe-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="The year at this point">`];
  if (zero) out.push(`<line x1="${L}" x2="${w - R}" y1="${y(0)}" y2="${y(0)}" class="grid"/>`);
  out.push(`<text x="${L - 3}" y="${T + 8}" class="ax" text-anchor="end">${fmt(hi)}</text><text x="${L - 3}" y="${h - B}" class="ax" text-anchor="end">${fmt(lo)}</text>`);
  // Month ticks: the 1st of each month.
  const d0 = new Date(t[0]);
  for (let m = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 1)); m.getTime() <= t.at(-1); m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) {
    const xx = x(m.getTime());
    out.push(`<line x1="${xx}" x2="${xx}" y1="${T}" y2="${h - B}" class="grid"/><text x="${xx + 2}" y="${h - 4}" class="ax">${"JFMAMJJASOND"[m.getUTCMonth()]}</text>`);
  }
  out.push(`<polyline points="${pts}" class="m0"/>`);
  if (mark) { const xm = x(Date.parse(mark)); out.push(`<line x1="${xm}" x2="${xm}" y1="${T}" y2="${h - B}" class="shown"/>`); }
  out.push(`<text x="${L + 3}" y="${T + 8}" class="ax lab">${units}</text></svg>`);
  return out.join("");
}

// Questions for the past year (the Explore menu's "The past year" group).
// set: what to show; start: the day it opens on -- "newest", "oldest", or
// {month, day}: the latest such date in the archive (the window rolls, so no
// fixed dates). guide: an anchor in guide.html.
export const ARCHIVE_QUESTIONS = [
  { id: "year-unusual", label: "How unusual was the past year? (500 mb)", guide: "past-year",
    set: { view: "gh500", mode: "anomaly", lines: "auto", wind: "none", windAs: "flow" }, start: "oldest",
    why: "The 500 mb anomaly shows the big pattern of each day against normal; playing a year of real days shows how the patterns move, grow and stick.",
    lookFor: "The 500 mb height against its 1991–2020 normal, one real day at a time, starting a year ago. Press Play: red (higher than normal: warm ridges) and blue (lower: cold troughs) drift east with the westerlies. A blob that stops and sits for a week or more is a block, and the weather under it sticks around. Click a point for its whole year." },
  { id: "year-storms", label: "Storm tracks through the winter", guide: "past-year",
    set: { view: "mslp", mode: "anomaly", lines: "auto", wind: "10", windAs: "flow" }, start: { month: 1, day: 1 },
    why: "Sea-level pressure against normal picks out every storm as a blue blob; the 10 m wind flow lines show the circulation around each.",
    lookFor: "Sea-level pressure against normal with the 10 m wind as flow lines, from 1 January. Press Play: lows (blue) form off Japan and run northeast to the Gulf of Alaska every few days, the winter storm track; the wind circles each one counter-clockwise. Carry on into spring and summer and watch the track weaken and move north." },
  { id: "year-rivers", label: "Atmospheric rivers", guide: "past-year",
    set: { view: "pwat", mode: "actual", lines: "auto", wind: "10", windAs: "flow" }, start: { month: 1, day: 15 },
    why: "Water vapour shows the ribbons of moist air; the 10 m wind shows where they point, and the coast is where they turn into rain.",
    lookFor: "Water vapour (all the water in the column, in mm) with the 10 m wind. An atmospheric river is a long, narrow ribbon of moist air (40 mm or more outside the tropics) from the tropics toward the coast, often from near Hawaiʻi to California (the Pineapple Express). Step through the winter to find them; click the California coast to see the year's rivers as spikes." },
  { id: "year-ocean", label: "Warm and cold water through the year (observed)", guide: "past-year",
    set: { view: "ssto", mode: "anomaly", lines: "none", wind: "none", windAs: "flow" }, start: "oldest",
    why: "Observed sea temperature against normal, day by day, shows how slowly the ocean changes compared with the air.",
    lookFor: "Observed sea temperature (NOAA OISST) against its 1991–2020 normal, a year of real days. Press Play (fast): unlike the air, the ocean changes slowly, so warm and cold patches last for weeks or months. A lasting warm patch is a marine heatwave; the tropical band tells El Niño from La Niña. Click a point for its year." },
  { id: "year-ice", label: "The sea-ice season", guide: "past-year",
    set: { view: "ice", mode: "actual", lines: "none", wind: "none", windAs: "flow" }, start: { month: 3, day: 15 },
    why: "Sea-ice cover through the season shows the Bering Sea freezing and melting, which the winter's winds and temperatures control.",
    lookFor: "Sea-ice cover, around its usual peak in mid-March: the ice edge far south in the Bering Sea and the Sea of Okhotsk. Step or play forward and it melts back north through spring; in autumn it returns. Click a point in the Bering Sea to see when it froze and when it cleared." },
  { id: "year-seas", label: "The year's biggest seas", guide: "past-year",
    set: { view: "hs", mode: "actual", lines: "auto", wind: "10", windAs: "flow" }, start: { month: 1, day: 15 },
    why: "Wave height with the 10 m wind shows the year's roughest seas and the storms that raised them.",
    lookFor: "Wave height from the GFS wave model with the 10 m wind, in mid-winter. The biggest seas (8–12 m) sit under the strongest, longest-blowing winds of the winter storms. Click a point near Hawaiʻi's north shore: the chart's spikes are the year's big swell events, often days after a storm far away." },
  { id: "year-jet", label: "The jet through the seasons", guide: "past-year",
    set: { view: "jet", mode: "actual", lines: "auto", wind: "250", windAs: "flow" }, start: "oldest",
    why: "The 250 mb wind day by day shows the jet strengthening and moving south in winter, weakening and retreating north in summer.",
    lookFor: "The 250 mb wind (≈10 km up) with its flow lines, from a year ago. Press Play: the jet strengthens and moves south in winter (often over 150 kt off Japan) and weakens and moves north in summer. Its waves steer the storms below." },
];

// Index of the day a question opens on in `days` ([{date}], ascending).
export function archiveStartDay(days, start) {
  if (!days.length) return -1;
  if (start === "oldest") return 0;
  if (start && typeof start === "object") {
    for (let i = days.length - 1; i >= 0; i--) {
      const [, m, d] = days[i].date.split("-").map(Number);
      if (m === start.month && d <= start.day) return i;
      if (m < start.month && i < days.length - 1) {                   // no exact day: the first after it
        const [, m1] = days[i + 1].date.split("-").map(Number);
        if (m1 === start.month) return i + 1;
      }
    }
  }
  return days.length - 1;
}
