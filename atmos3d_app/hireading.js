// The numbers Hawaiʻi forecasters read, for a Hawaiʻi case step (user request 2026-10-14: the same pattern framing as
// the Northwest). Read from the step's day on the archive grid:
//   north − south pressure difference across the islands (23°N − 17°N at 156°W): how strong the trades are;
//   the 10 m wind at Oʻahu: trades, light winds, kona (from the south) or the north-westerlies behind a front;
//   water vapour over Honolulu: dry under the inversion, or moist enough for heavy rain (NWS Honolulu talks in inches);
//   the 500 mb height against normal over Honolulu: an upper trough or low overhead lifts the inversion;
//   the swell north and south of Oʻahu: height, period and direction (long periods from far-off storms).
// Thresholds are from this grid's own readings in the cases (e.g. +5.0 to +5.4 hPa in the strong trades of Oct 2025 and
// Feb 2026) and NWS Honolulu's usual language. Pure, no imports: readHi takes a function giving a field at a lat/lon.

const KT = 1.94384;
const compass = (d) => ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][Math.round(d / 22.5) % 16];

export const HI_POINTS = { ns: [[23, 204], [17, 204]], oahu: [21.3, 202.1], north: [23, 202], south: [19, 202] };

// readHi(at) -> [{id, label, shown, value, text, rank (2 strong, 1 notable, 0 quiet), and for the pressure row normal, far, near
// as in pnwreading.js}]; at(field, lat, lon) gives the archive field there (NaN if none).
export function readHi(at) {
  const out = [], [[an, ao], [bn, bo]] = HI_POINTS.ns, [ol, oo] = HI_POINTS.oahu;
  const ns = Math.round((at("mslp", an, ao) - at("mslp", bn, bo)) / 10) / 10;
  // its normal for the date from the pressure anomaly, and how far from normal against the past year's spread
  // (departure median 1.1 hPa, top 10% 2.8 hPa; measured 2026-10-15)
  const nsDep = (at("mslpa", an, ao) - at("mslpa", bn, bo)) / 100;
  const nsNorm = Number.isFinite(nsDep) ? { normal: Math.round((ns - nsDep) * 10) / 10, far: Math.abs(nsDep) >= 2.8, near: Math.abs(nsDep) < 1.1 } : {};
  if (Number.isFinite(ns)) out.push({ id: "ns", label: "North − south across the islands", value: ns, ...nsNorm, shown: `${ns > 0 ? "+" : ns < 0 ? "−" : ""}${Math.abs(ns).toFixed(1)} hPa`,
    rank: ns >= 4.8 || ns < -0.5 ? 2 : ns >= 3 ? 0 : 1,
    text: ns >= 4.8 ? "a tight gradient: strong trades, with wind advisories and channel gales likely (this grid read +5.0 to +5.4 in the strong trades of Oct 2025 and Feb 2026)"
      : ns >= 3 ? "a moderate gradient: ordinary to breezy trades"
      : ns >= 1.5 ? "a weak gradient: light to moderate winds (a ridge or the high far away)"
      : ns >= -0.5 ? "almost no gradient: the ridge is over the islands, or a front or low is near" : "higher pressure to the south: winds from the south (kona) or ahead of a front" });
  const u = at("u10", ol, oo), v = at("v10", ol, oo);
  if (Number.isFinite(u) && Number.isFinite(v)) {
    const sp = Math.hypot(u, v) * KT, d = (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360;
    const trade = d >= 30 && d < 110;
    out.push({ id: "wind", label: "Wind at Oʻahu (10 m)", value: sp, shown: `${Math.round(sp)} kt from ${compass(d)}`,
      rank: sp < 8 ? 1 : trade ? (sp >= 20 ? 2 : 0) : d >= 110 && d < 160 ? 1 : 2,
      text: sp < 8 ? "light winds: sea breezes by day, land breezes at night, showers over the interiors in the afternoon"
        : d >= 30 && d < 110 ? (sp >= 20 ? "strong trade winds" : "trade winds")
        : d >= 110 && d < 160 ? "south-easterly: trades bending round a low or trough to the west"
        : d >= 160 && d < 250 ? "kona winds, from the south: rain and vog on the usually sheltered leeward sides"
        : "north-westerly to northerly: behind a front, or ahead of one coming down the chain" });
  }
  const pw = at("pwat", ol, oo);
  if (Number.isFinite(pw)) out.push({ id: "pw", label: "Water vapour over Honolulu", value: pw, shown: `${Math.round(pw)} mm (${(pw / 25.4).toFixed(1)} in)`,
    rank: pw >= 45 ? 2 : pw < 25 || pw >= 38 ? 1 : 0,
    text: pw < 25 ? "dry: few showers, a low inversion" : pw < 38 ? "typical for trades: windward showers" : pw < 45 ? "moist: more and heavier showers" : "very moist: heavy rain and flooding possible where it's lifted" });
  const za = at("gha500", ol, oo);
  if (Number.isFinite(za)) out.push({ id: "z500", label: "500 mb height vs normal, Honolulu", value: za, shown: `${za > 0 ? "+" : za < 0 ? "−" : ""}${Math.abs(Math.round(za))} m`,
    rank: za <= -60 ? 2 : za <= -25 || za >= 25 ? 1 : 0,
    text: za <= -60 ? "an upper trough or low overhead: cold air aloft lifts the inversion, showers grow tall, thunder possible"
      : za <= -25 ? "a weak trough aloft" : za >= 25 ? "a ridge aloft: sinking air, stable, a low inversion" : "near normal aloft" });
  for (const [id, label, [la, lo]] of [["north", "Swell north of Oʻahu", HI_POINTS.north], ["south", "Swell south of Oʻahu", HI_POINTS.south]]) {
    const hs = at("hs", la, lo), tp = at("tp", la, lo), wd = at("wdir", la, lo);
    if (!Number.isFinite(hs)) continue;
    const nw = tp >= 13 && wd >= 280 && wd <= 360, ss = tp >= 15 && wd >= 150 && wd <= 230;
    out.push({ id, label, value: hs, shown: `${hs.toFixed(1)} m, ${Math.round(tp)} s, from ${compass(wd)}`,
      rank: nw ? (hs >= 3 ? 2 : 1) : ss ? (tp >= 18 ? 2 : 1) : 0,
      text: tp >= 13 && wd >= 280 && wd <= 360 ? "a long-period north-west swell from a distant storm: big surf on north and west shores"
        : tp >= 15 && wd >= 150 && wd <= 230 ? "a long-period south swell from the Southern Hemisphere: surf on south shores"
        : tp < 10 && wd >= 30 && wd <= 130 ? "short trade-wind waves from the east" : "a mix of waves" });
  }
  return out;
}
