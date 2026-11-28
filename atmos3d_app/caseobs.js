// What the stations and buoys measured through a Northwest case step, hour by hour (user request 2026-10-14:
// detail packs). The data are caseobs/<case id>.json, made once by tools/fetch_case_obs.py from the Iowa
// Environmental Mesonet's ASOS archive and NOAA's buoy centre, and served as-is. This module picks a step's
// hours and builds the series for one kind of chart; caseobschart.js draws it. Pure, no imports.

// The kinds of chart. Each series: a station and variable, or a difference of two stations' pressure.
export const OBS_KINDS = {
  gradients: { label: "Pressure differences", unit: "hPa", zero: true, series: [
    { diff: ["PDX", "BLI"], name: "Portland − Bellingham", id: "sn" }, { diff: ["HQM", "SEA"], name: "Hoquiam − Seattle", id: "push" },
    { diff: ["UIL", "BLI"], name: "Quillayute − Bellingham", id: "strait" }, { diff: ["SEA", "YKM"], name: "Seattle − Yakima", id: "cascades" },
    { diff: ["BLI", "CYWL"], name: "Bellingham − Williams Lake", id: "fraser" }] },
  wind: { label: "Wind: the strongest gust in the hour, or the steady wind when there was none", unit: "kt", series: [
    { st: "SEA", v: "peak" }, { st: "PDX", v: "peak" }, { st: "BLI", v: "peak" }, { st: "HQM", v: "peak" }, { st: "SISW1", v: "peak" }] },
  temp: { label: "Temperature", unit: "°C", series: [
    { st: "SEA", v: "t" }, { st: "PDX", v: "t" }, { st: "BLI", v: "t" }, { st: "HQM", v: "t" }, { st: "YKM", v: "t" }] },
  pressure: { label: "Sea-level pressure", unit: "hPa", series: [
    { st: "46005", v: "p" }, { st: "HQM", v: "p" }, { st: "SEA", v: "p" }, { st: "BLI", v: "p" }, { st: "PDX", v: "p" }] },
  rain: { label: "Rain since the chart's start", unit: "mm", series: [
    { st: "SEA", v: "pr", cum: true }, { st: "OLM", v: "pr", cum: true }, { st: "HQM", v: "pr", cum: true }, { st: "PDX", v: "pr", cum: true }, { st: "BLI", v: "pr", cum: true }] },
  waves: { label: "Wave height", unit: "m", series: [
    { st: "46005", v: "hs" }, { st: "46041", v: "hs" }, { st: "46029", v: "hs" }, { st: "46087", v: "hs" }] },
  gorge: { label: "The Columbia Gorge: Troutdale − The Dalles", unit: "hPa", zero: true, series: [
    { diff: ["TTD", "DLS"], name: "Troutdale − The Dalles" }] },
};

// Hawaiʻi's kinds (user request 2026-10-14): its airports and wave buoys. A station given as a list is the first of them
// with data (buoy 51101 replaced 51001 at the same spot).
export const OBS_KINDS_HI = {
  wind: { label: "Wind: the strongest gust in the hour, or the steady wind when there was none", unit: "kt", series: [
    { st: "PHLI", v: "peak" }, { st: "PHNL", v: "peak" }, { st: "PHOG", v: "peak" }, { st: "PHTO", v: "peak" }, { st: "PHKO", v: "peak" }] },
  rain: { label: "Rain since the chart's start", unit: "mm", series: [
    { st: "PHNG", v: "pr", cum: true }, { st: "PHNL", v: "pr", cum: true }, { st: "PHLI", v: "pr", cum: true }, { st: "PHOG", v: "pr", cum: true }, { st: "PHTO", v: "pr", cum: true }] },
  temp: { label: "Temperature", unit: "°C", series: [
    { st: "PHLI", v: "t" }, { st: "PHNL", v: "t" }, { st: "PHOG", v: "t" }, { st: "PHTO", v: "t" }, { st: "PHKO", v: "t" }] },
  dew: { label: "Dew point (the moisture in the air)", unit: "°C", series: [
    { st: "PHLI", v: "td" }, { st: "PHNL", v: "td" }, { st: "PHOG", v: "td" }, { st: "PHTO", v: "td" }, { st: "PHKO", v: "td" }] },
  pressure: { label: "Sea-level pressure", unit: "hPa", series: [
    { st: "PHLI", v: "p" }, { st: "PHNL", v: "p" }, { st: "PHOG", v: "p" }, { st: "PHTO", v: "p" }, { st: "PHKO", v: "p" }] },
  waves: { label: "Wave height", unit: "m", series: [
    { st: ["51101", "51001"], v: "hs", id: "nw" }, { st: "51201", v: "hs" }, { st: "51202", v: "hs" }, { st: "51212", v: "hs" }, { st: "51002", v: "hs" }] },
  period: { label: "Wave period (long periods are swell from far away)", menu: "Wave period", unit: "s", series: [
    { st: ["51101", "51001"], v: "tp", id: "nw" }, { st: "51201", v: "tp" }, { st: "51212", v: "tp" }, { st: "51002", v: "tp" }, { st: "51206", v: "tp" }] },
};
export const obsKindsFor = (region) => (region === "hawaii" ? OBS_KINDS_HI : OBS_KINDS);

// Which chart a case opens with, by its first pattern that has a natural one.
const DEFAULT_KIND = { windstorm: "wind", ar: "rain", cutoff: "rain", pscz: "rain", arctic: "gradients", eastwind: "gradients", heat: "temp", marine: "temp",
  ridge: "temp", snow: "temp", trough: "temp", smoke: "temp", tropical: "temp",
  trades: "wind", strongtrades: "wind", hiflood: "rain", front: "dew", kona: "rain", lightwinds: "wind", upperlow: "rain", hurricane: "wind",
  nwswell: "waves", southswell: "period", fire: "dew" };
export function defaultObsKind(patterns = [], region = "pnw") {
  for (const p of patterns) if (DEFAULT_KIND[p] && obsKindsFor(region)[DEFAULT_KIND[p]]) return DEFAULT_KIND[p];
  return region === "hawaii" ? "wind" : "gradients";
}

const HOUR = 3600e3;
const t0Of = (seg) => Date.parse(seg.t0.replace(/T(\d\d)Z$/, "T$1:00:00Z"));

// stepObs(doc, step, kind) -> {t: [ms], series: [{name, values}], unit, label, marks: [ms of 00 UTC analyses], stepMark} | null
// The step's hours: from 24 h before its first day (or play day) to 24 h after its last, inside one segment.
export function stepObs(doc, step, kind) {
  const K = obsKindsFor(doc?.region)[kind];
  if (!doc || !K) return null;
  const days = [step.day, ...(step.play ?? [])].map((d) => Date.parse(`${d}T00:00:00Z`));
  const a = Math.min(...days) - 24 * HOUR, b = Math.max(...days) + 24 * HOUR;
  const seg = doc.segments.find((s) => t0Of(s) <= a + 12 * HOUR && t0Of(s) + (s.n - 1) * HOUR >= b - 12 * HOUR);
  if (!seg) return null;
  const s0 = t0Of(seg), i0 = Math.max(0, Math.round((a - s0) / HOUR)), i1 = Math.min(seg.n - 1, Math.round((b - s0) / HOUR));
  const t = [];
  for (let i = i0; i <= i1; i++) t.push(s0 + i * HOUR);
  const col = (st, v) => {
    const d = seg.data[st];
    if (!d) return null;
    if (v === "peak") return t.map((_, k) => {
      const g = d.wg?.[i0 + k], pk = d.pk?.[i0 + k];
      return g != null || pk != null ? Math.max(g ?? 0, pk ?? 0) : d.ws?.[i0 + k] ?? null;
    });
    return d[v] ? d[v].slice(i0, i1 + 1) : null;
  };
  const series = [];
  for (const sp of K.series) {
    let values, name;
    if (sp.diff) {
      const A = col(sp.diff[0], "p"), B = col(sp.diff[1], "p");
      if (!A || !B) continue;
      values = A.map((x, k) => (x == null || B[k] == null ? null : Math.round((x - B[k]) * 10) / 10));
      name = sp.name;
    } else {
      const st = [sp.st].flat().find((x) => col(x, sp.v)?.some((v) => v != null)) ?? [sp.st].flat()[0];
      values = col(st, sp.v);
      if (!values) continue;
      if (sp.cum) { let c = 0; values = values.map((x) => (c += x ?? 0, Math.round(c * 10) / 10)); }
      name = doc.stations[st]?.name ?? st;
    }
    if (values.some((x) => x != null)) series.push({ name, id: sp.id ?? sp.st, values });
  }
  if (!series.length) return null;
  const marks = [];
  for (let m = Math.ceil(t[0] / (24 * HOUR)) * 24 * HOUR; m <= t[t.length - 1]; m += 24 * HOUR) marks.push(m);
  return { t, series, unit: K.unit, label: K.label, zero: !!K.zero, marks, stepMark: Date.parse(`${step.day}T00:00:00Z`) };
}

// The extreme of each series, for the text under the chart: the lowest sea-level pressure, the largest
// difference either way, otherwise the highest value.
export function obsPeaks(o) {
  const score = o.zero ? Math.abs : o.unit === "hPa" ? (v) => -v : (v) => v;
  return o.series.map((s) => {
    let k = -1;
    for (let i = 0; i < s.values.length; i++) if (s.values[i] != null && (k < 0 || score(s.values[i]) > score(s.values[k]))) k = i;
    return { name: s.name, value: k >= 0 ? s.values[k] : null, t: k >= 0 ? o.t[k] : null };
  });
}
