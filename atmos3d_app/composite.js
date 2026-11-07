// Composite maps of a weather pattern (backlog, pattern library phase B): the average of the archive's real GFS
// analyses on the days its cases show it at its height, one day per separate event, so the pattern's usual shape
// stands out from any one day's details. Only patterns with at least three separate events get one; storms in
// different places average away, so the hurricanes have none. Every day listed is a case step's own day (tested).
// The average is a real calculation on real analyses, but it's not a day that happened: the page labels it so.
// Pure, no imports.

// pattern key (cases.js PATTERNS) -> {days: [[date, case id]], view, mode: "anomaly" | "actual", camera: {lat, lon (0–360), span,
// tilt} as a case step's look, look: what to see (each figure measured on the composite itself, 2026-10-15)}
export const COMPOSITES = {
  ar: { camera: { lat: 38, lon: 212, span: 46, tilt: 10 }, view: "pwat", mode: "actual", days: [["2025-12-09", "pnw-ar-2025"], ["2025-12-19", "pnw-ar-2025"], ["2021-10-24", "bomb-2021"], ["2021-11-15", "bc-rivers-2021"], ["2026-03-18", "snow-mar-2026"]],
    look: "a band of moist air from the subtropics to the coast, broader and fainter than any one river because each aimed at a slightly different place" },
  windstorm: { camera: { lat: 47, lon: 228, span: 30, tilt: 10 }, view: "mslp", mode: "anomaly", days: [["2021-10-25", "bomb-2021"], ["2022-12-28", "ice-wind-dec-2022"], ["2024-11-20", "bomb-2024"], ["2024-12-27", "bomb-dec-2024"], ["2025-10-26", "pnw-windstorms"], ["2026-03-12", "pnw-windstorms"], ["2026-09-25", "pnw-windstorms"]],
    look: "pressure far below normal just off the Washington coast (about 24 hPa on average); weaker than any one storm, since the lows were in different places at 00 UTC" },
  arctic: { camera: { lat: 50, lon: 236, span: 26, tilt: 10 }, view: "t850", mode: "anomaly", days: [["2021-12-27", "arctic-dec-2021"], ["2022-12-22", "ice-wind-dec-2022"], ["2024-01-13", "arctic-ice-jan-2024"]],
    look: "cold air at 1.5 km pouring down from British Columbia, colder east of the Cascades than west (about 16 °C below normal at Spokane, 10 at Seattle)" },
  snow: { camera: { lat: 49, lon: 236, span: 24, tilt: 10 }, view: "t850", mode: "anomaly", days: [["2021-12-27", "arctic-dec-2021"], ["2022-12-24", "ice-wind-dec-2022"], ["2024-01-17", "arctic-ice-jan-2024"], ["2026-03-14", "snow-mar-2026"]],
    look: "cold air pooled in British Columbia and east of the Cascades, but near normal at 1.5 km over Puget Sound: the cold that makes lowland snow and ice is a shallow layer at the ground, fed through the gaps, too thin for this level to show" },
  ridge: { camera: { lat: 47, lon: 228, span: 34, tilt: 10 }, view: "gh500", mode: "anomaly", days: [["2021-06-27", "heatdome-2021"], ["2025-11-10", "nov-2025-inversion"], ["2026-01-18", "jan-ridge-2026"], ["2026-02-05", "feb-2026"], ["2026-06-15", "pnw-heat-2026"]],
    look: "500 mb heights over 200 m above normal over the coast, in summer and in winter alike" },
  trough: { camera: { lat: 47, lon: 230, span: 30, tilt: 10 }, view: "gh500", mode: "anomaly", days: [["2026-02-18", "feb-2026"], ["2026-04-16", "spring-lows-2026"], ["2026-05-16", "spring-lows-2026"]],
    look: "500 mb heights over 200 m below normal over the coast, deepest just off Washington: cold air aloft, the showery pattern of late winter and spring" },
  eastwind: { camera: { lat: 47, lon: 237, span: 18, tilt: 10 }, view: "mslp", mode: "actual", days: [["2024-01-16", "arctic-ice-jan-2024"], ["2026-02-22", "feb-2026"], ["2025-11-09", "nov-2025-inversion"], ["2025-11-20", "nov-2025-inversion"]],
    look: "high pressure east of the Cascades and lower pressure offshore: the push that sends air west through the gaps" },
  heat: { camera: { lat: 48, lon: 232, span: 28, tilt: 10 }, view: "t850", mode: "anomaly", days: [["2021-06-29", "heatdome-2021"], ["2026-06-15", "pnw-heat-2026"], ["2026-07-23", "summer-2026"]],
    look: "air at 1.5 km far warmer than normal over the Northwest" },
  marine: { camera: { lat: 46, lon: 235, span: 20, tilt: 10 }, view: "mslp", mode: "actual", days: [["2021-06-30", "heatdome-2021"], ["2026-06-17", "pnw-heat-2026"], ["2026-07-24", "summer-2026"], ["2026-08-08", "summer-2026"]],
    look: "higher pressure at the coast than inland: the onshore push of cool sea air" },
  strongtrades: { camera: { lat: 27, lon: 202, span: 30, tilt: 10 }, view: "mslp", mode: "actual", days: [["2023-08-09", "lahaina-2023"], ["2023-12-21", "alenuihaha-dec-2023"], ["2025-10-25", "hi-oct-2025"], ["2026-05-22", "hi-may-jul-2026"], ["2026-01-06", "channel-jan-2026"], ["2026-02-17", "hi-feb-2026"]],
    look: "a strong high (about 1030 hPa on average) north of the islands, and pressure falling about 10 hPa from 30°N down to Oʻahu" },
  trades: { camera: { lat: 27, lon: 205, span: 30, tilt: 10 }, view: "mslp", mode: "actual", days: [["2026-06-07", "hi-trades-2026"], ["2026-06-27", "hi-jun-2026"], ["2026-07-24", "hi-trades-2026"]],
    look: "a high of about 1030 hPa far to the north (38°N) and pressure falling about 9 hPa from 30°N down to Oʻahu: the steady slope that drives the trades" },
  front: { camera: { lat: 25, lon: 200, span: 30, tilt: 10 }, view: "mslp", mode: "actual", days: [["2025-12-18", "hi-fronts-2025-26"], ["2026-01-17", "channel-jan-2026"], ["2026-02-08", "hi-fronts-2025-26"]],
    look: "not much near the islands: the fronts stood in different places, so their wind shifts average away. What remains is the low far to the north-west (about 996 hPa near 52°N 162°E) whose fronts they were" },
  lightwinds: { camera: { lat: 25, lon: 200, span: 30, tilt: 10 }, view: "mslp", mode: "actual", days: [["2025-11-30", "hi-ridge-2025"], ["2026-01-11", "channel-jan-2026"], ["2026-01-28", "vog-jan-2026"]],
    look: "the trade-wind slope gone, even reversed: pressure about 3 hPa higher over Oʻahu than at 30°N, with a deep low (about 978 hPa at 47°N 168°W) where the high usually sits" },
  fire: { camera: { lat: 25, lon: 203, span: 30, tilt: 10 }, view: "mslp", mode: "actual", days: [["2023-08-09", "lahaina-2023"], ["2025-10-25", "hi-oct-2025"], ["2026-09-27", "olowalu-2026"]],
    look: "a strong high (about 1027 hPa at 34°N) and pressure falling about 10 hPa to Oʻahu: the same machine as strong trades. What made these fire days was dry fuel and downslope wind, not a different pattern" },
  smoke: { camera: { lat: 46, lon: 236, span: 18, tilt: 10 }, view: "mslp", mode: "actual", days: [["2022-09-10", "smoke-sep-2022"], ["2022-10-20", "smoke-oct-2022"], ["2026-08-05", "summer-2026"]],
    look: "almost no pressure difference near the coast (about 1016 hPa from Spokane to the ocean) and a hot inland low over northern California (about 1004 hPa): the smoke came on different winds each time, but what the days share is weak, stagnant flow that lets smoke linger" },
  cutoff: { camera: { lat: 43, lon: 232, span: 28, tilt: 10 }, view: "gh500", mode: "anomaly", days: [["2024-08-18", "low-aug-2024"], ["2026-04-20", "spring-lows-2026"], ["2026-09-04", "cutoff-sep-2026"]],
    look: "heights far below normal off northern California (about 189 m at 40°N 130°W, 130 m over Medford): these lows tend to stall south of the westerlies, off California and Oregon" },
  southswell: { camera: { lat: 5, lon: 200, span: 50, tilt: 10 }, view: "tp", mode: "actual", days: [["2022-07-17", "hi-swell-jul-2022"], ["2026-06-14", "hi-jun-2026"], ["2026-07-24", "hi-trades-2026"]],
    look: "long periods south of the islands (about 20 seconds south of Oʻahu on average): swell from Southern Hemisphere storms, far longer than the local trade-wind chop" },
  pscz: { camera: { lat: 47, lon: 233, span: 24, tilt: 10 }, view: "gh500", mode: "anomaly", days: [["2023-03-01", "pscz-feb-2023"], ["2025-03-18", "pscz-mar-2025"], ["2025-12-27", "pscz-dec-2025"]],
    look: "a cold trough over Washington (about 200 m below normal), onshore west-north-west wind at the coast (about 11 kt on average) and air near −5 °C at 850 mb over Seattle: the setup. The band itself is far too narrow for a 1° map" },
  hiflood: { camera: { lat: 23, lon: 200, span: 28, tilt: 10 }, view: "pwat", mode: "actual", days: [["2021-12-06", "kona-dec-2021"], ["2024-08-25", "hone-2024"], ["2026-02-22", "hi-feb-2026"], ["2026-04-10", "kauai-apr-2026"], ["2026-06-03", "hi-may-jul-2026"], ["2026-03-14", "kona-2026"]],
    look: "deep moisture over the islands; the causes differ (Kona lows, a hurricane, troughs, a plume), the moisture is the common thread" },
  kona: { camera: { lat: 26, lon: 195, span: 34, tilt: 10 }, view: "gh500", mode: "anomaly", days: [["2021-12-06", "kona-dec-2021"], ["2026-01-04", "channel-jan-2026"], ["2026-04-10", "kauai-apr-2026"], ["2026-03-14", "kona-2026"]],
    look: "low heights aloft west or north-west of the islands: the cut-off low that turns the wind to the south" },
  upperlow: { camera: { lat: 26, lon: 198, span: 36, tilt: 10 }, view: "gh500", mode: "anomaly", days: [["2025-10-17", "hi-oct-2025"], ["2026-02-22", "hi-feb-2026"], ["2026-05-16", "hi-may-jul-2026"], ["2026-08-06", "hi-summer-2026"], ["2026-09-17", "hi-summer-2026"]],
    look: "heights only a little below normal over and west of the islands (about 30 m): the upper lows sat in different places, so they mostly average away. Each case shows its own low far more clearly; an honest lesson about composites" },
  nwswell: { camera: { lat: 34, lon: 190, span: 44, tilt: 10 }, view: "hs", mode: "actual", days: [["2023-01-23", "eddie-2023"], ["2025-12-01", "hi-ridge-2025"], ["2026-01-13", "channel-jan-2026"], ["2026-02-03", "hi-swell-2026"]],
    look: "the biggest seas (about 6 m on average) far north-west of Hawaiʻi, where the storms were" },
};

// Fields averaged point by point: fieldsList is [{name: Float32Array}], one per day. A NaN (land for the sea fields)
// is left out of that point's mean; a point NaN on every day stays NaN. wdir (a direction) is skipped: its average
// means nothing. Returns {name: Float32Array} with only the fields every day has.
export function compositeFields(fieldsList) {
  const days = fieldsList.filter(Boolean);
  if (!days.length) return null;
  const out = {};
  for (const name of Object.keys(days[0])) {
    if (name === "wdir" || !days.every((f) => f[name])) continue;
    const n = days[0][name].length, sum = new Float64Array(n), cnt = new Uint16Array(n);
    for (const f of days) { const a = f[name]; for (let k = 0; k < n; k++) if (Number.isFinite(a[k])) { sum[k] += a[k]; cnt[k]++; } }
    const m = new Float32Array(n);
    for (let k = 0; k < n; k++) m[k] = cnt[k] ? sum[k] / cnt[k] : NaN;
    out[name] = m;
  }
  return out;
}
