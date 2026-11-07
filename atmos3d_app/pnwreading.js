// The pressure differences Northwest forecasters read (user request, 2026-10-14: every Northwest case framed by
// its weather pattern). Five station pairs, each first minus second, in hPa, and what each value means:
//   Portland − Bellingham: south–north along Puget Sound (positive: southerlies; windstorms and rivers);
//   Hoquiam − Seattle: the marine push (positive: cool ocean air pushed inland; below −1, offshore flow and heat);
//   Quillayute − Bellingham: the Strait of Juan de Fuca (positive: westerlies down the Strait);
//   Seattle − Yakima: across the Cascades (negative: east wind through the passes; positive: air pushed east);
//   Bellingham − Williams Lake BC: the Fraser outflow (strongly negative: Arctic air out of the Fraser valley).
// The thresholds are station values from NWS Seattle and Portland forecast discussions and a common local rule
// of thumb (Hoquiam − Seattle). The grid smooths the gaps and usually reads smaller, so the texts say where
// it does. Each row also gets its normal for the date, from the archive's sea-level pressure anomaly (value minus the
// pair's anomaly difference), and how far from normal it is against that pair's own spread: the departure's median
// (p50) and top-10% (p90) over the past year's 365 analyses, measured 2026-10-15 (pairs differ a lot: a 2 hPa
// departure is ordinary across the Fraser, rare for the marine push). Pure, no imports: readPnw takes a function
// that gives sea-level pressure (Pa) at a lat/lon, and optionally one that gives its anomaly (Pa).

export const PNW_PAIRS = [
  { id: "sn", label: "Portland − Bellingham", a: [45.6, 237.4], b: [48.8, 237.5], p50: 1.8, p90: 4.1 },
  { id: "push", label: "Hoquiam − Seattle", a: [46.97, 236.1], b: [47.45, 237.7], p50: 0.6, p90: 1.5 },
  { id: "strait", label: "Quillayute − Bellingham", a: [47.9, 235.4], b: [48.8, 237.5], p50: 0.8, p90: 2.3 },
  { id: "cascades", label: "Seattle − Yakima", a: [47.45, 237.7], b: [46.57, 239.47], p50: 2.7, p90: 5.3 },
  { id: "fraser", label: "Bellingham − Williams Lake", a: [48.8, 237.5], b: [52.2, 237.9], p50: 4.2, p90: 9.5 },
];

// Each meaning: [text, rank] -- rank 2 strong, 1 notable, 0 quiet (muted in the table; the strongest row heads it).
const MEANING = {
  sn: (x) => (x >= 9 ? ["windstorm-sized: gale to storm-force southerlies up Puget Sound (this grid read +11 in the December 2022 windstorm; NWS model values were +14 to +16)", 2]
    : x >= 3 ? ["higher pressure to the south: southerlies up Puget Sound", 1]
    : x <= -2 ? ["higher pressure to the north: northerlies down Puget Sound", 1]
    : ["little south–north push: light winds in Puget Sound", 0]),
  push: (x) => (x > 3.5 ? ["strong onshore flow (in summer, a strong marine push: low cloud and fog well inland)", 2]
    : x >= 2 ? ["moderate onshore flow (in summer, a moderate marine push)", 1]
    : x >= 1 ? ["light onshore flow (in summer, a light marine push)", 1]
    : x <= -1 ? ["offshore flow: the ocean air held back (in summer, the heat-wave sign)", 2]
    : ["neither onshore nor offshore flow", 0]),
  strait: (x) => (x >= 4 ? ["strong westerlies down the Strait of Juan de Fuca (NWS: +5 to +7 at the stations with gales)", 2]
    : x >= 2 ? ["a westerly push down the Strait", 1]
    : x <= -3 ? ["easterlies out of the Strait", 1]
    : ["light winds in the Strait", 0]),
  cascades: (x) => (x <= -4 ? ["higher pressure east of the Cascades: east wind through the passes, gusty in the foothills", 2]
    : x <= -1.5 ? ["a little higher pressure east of the Cascades: a weak push of air westward through the passes", 1]
    : x >= 4 ? ["higher pressure west of the Cascades: air pushed east through the passes, gusty on the eastern slopes", 2]
    : x >= 1.5 ? ["a little higher pressure west of the Cascades: a weak push of air eastward through the passes", 1]
    : ["about the same pressure on both sides of the Cascades", 0]),
  fraser: (x) => (x <= -12 ? ["Fraser outflow: cold north-easterlies through Bellingham and the San Juans (NWS: −15 or lower at the stations; this grid read −24 at Christmas 2021)", 2]
    : x <= -8 ? ["higher pressure in the BC interior: some outflow through the Fraser valley", 1]
    : ["no Fraser outflow", 0]),
};

// readPnw(mslpAt, anomAt?) -> [{id, label, value (hPa, 0.1), text, rank, normal?, far?, near?}], or [] if the pressure
// isn't there. normal: the pair's normal for the date (hPa); far: the departure is in the top 10% of days; near: below
// the median.
export function readPnw(mslpAt, anomAt = null) {
  const out = [];
  for (const p of PNW_PAIRS) {
    const v = Math.round((mslpAt(...p.a) - mslpAt(...p.b)) / 10) / 10;
    if (!Number.isFinite(v)) continue;
    const [text, rank] = MEANING[p.id](v), row = { id: p.id, label: p.label, value: v, text, rank };
    const dep = anomAt ? (anomAt(...p.a) - anomAt(...p.b)) / 100 : NaN;
    if (Number.isFinite(dep)) Object.assign(row, { normal: Math.round((v - dep) * 10) / 10, far: Math.abs(dep) >= p.p90, near: Math.abs(dep) < p.p50 });
    out.push(row);
  }
  return out;
}
