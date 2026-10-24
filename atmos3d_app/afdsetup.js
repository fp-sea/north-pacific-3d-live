// "Today's set-up, from the forecasters" (user request 2026-10-18): the newest NWS Area Forecast Discussion for the
// Northwest (Seattle) or Hawaiʻi (Honolulu), shown as written (public domain, with the office, time and a link), the
// weather features it names found by keyword, and for each a view that shows it and a line saying what the model on
// the page has there, measured from the grid. No AI: matching words, not understanding them; the local-LLM version
// is in the backlog. Nothing here invents a number: every value in a check comes from the model's fields.
//
// Second pass (user question 2026-10-18, "is it accurate?"): each feature now carries the sentence that names it and
// the time that sentence talks about (its own time words, read in the office's time zone from the issuance), so the
// check measures the model then, not at "now"; mentions that are negated ("no front") are skipped; troughs and ridges
// are searched over a band of latitudes; the front check needs a sharp contrast over the sea AND a pressure trough;
// the instability check is gone (rising air at one point isn't instability). Each check returns whether the model
// shows what the forecasters named, so it can be scored on a year of discussions (tools/score_afd_setup.mjs).
//
// afdFeatures(sections, issued, office) -> [{key, label, words, section, sentence, at (ISO), when (words), explain, spec, needs}]
// featureCheck(key, ctx, office, words) -> {text, agrees: true | false | null} from the model's fields, or null while loading
//
// Pure (node --test loads it: tests/js/afdsetup.test.mjs); helpers from questions.js.

import { centresNear, compass16, curvatureAt, distBearing, fmtLatLon, isobarsAt, valueAt } from "./questions.js?v=20261024090011";

const KT = 1.943844;

export const AFD_OFFICES = {
  SEW: { place: "the Northwest", tz: "America/Los_Angeles", at: [47.6, 237.7], band: [43, 52], west: 12, east: 4, km: 1500,
    look: { lat: 46, lon: 228, span: 30, tilt: 10, name: "the Pacific Northwest and the ocean upstream" } },
  HFO: { place: "Hawaiʻi", tz: "Pacific/Honolulu", at: [21, 202.5], band: [17, 28], west: 12, east: 6, km: 1500,
    look: { lat: 23, lon: 200, span: 30, tilt: 10, name: "the Hawaiian Islands and the pattern around them" } },
};

const BASE = { particles: false, barbs: false, satellite: false, view: "domain", time: "now" };
// [key, label, regular expression, plain explanation, spec, needs]
const DEFS = [
  ["trough", "A trough aloft", /\b(upper[- ]level trough|upper trough|troughing|short ?wave trough|shortwave|upper[- ]level low|upper low|cut[- ]?off low|(?<!(?:thermal|surface|coastal|inverted|induced) )trough(?! of low pressure))\b/i,
    "a dip in the westerlies at 500 mb (about 5.5 km): colder air aloft, rising air and cloud ahead (east) of it, storms growing under its downwind side",
    { focus: "p500", context: ["sfc"], fill: "height", hl: ["sfc", "p500"] }],
  ["ridge", "A ridge aloft", /\b(upper[- ]level ridge|upper ridge|ridging|(?<!(?:surface|pressure|thermal) )ridge)\b/i,
    "a bulge of the westerlies poleward at 500 mb: warmer air below, sinking air, mostly dry and settled weather",
    { focus: "p500", context: ["sfc"], fill: "height", hl: ["sfc", "p500"] }],
  ["zonal", "Zonal (west–east) flow", /\bzonal\b/i,
    "the jet running straight west to east, without big troughs or ridges: systems move through quickly and stay weak",
    { focus: "p250", context: ["sfc"], fill: "wind", particles: true }],
  ["front", "A front", /\b(cold front|warm front|occluded front|frontal (?:boundary|system|band|zone)|(?<!in )front)\b/i,
    "the boundary between two air masses, where the temperature changes sharply: cloud and rain along it, a wind shift as it passes",
    { focus: "p850", context: ["sfc"], fill: "temp", barbs: true }],
  ["low", "A surface low", /\b((?<!upper )(?<!upper-level )(?<!thermal )(?<!thermally[- ]induced )(?<!induced )low pressure|surface low|kona low|(?:a|the) (?:weak |deep |deepening )?low(?= (?:will|is|pressure|system|moving|passing|offshore|cent)))/i,
    "an area of low sea-level pressure: air spirals in, rises, and makes cloud and rain; the wind blows anticlockwise round it",
    { focus: "sfc", context: ["p500"], fill: "none", particles: true, hl: ["sfc"] }],
  ["high", "A surface high", /\b(high pressure|surface high|(?:a|the) high(?= (?:will|is|to|north|northeast|offshore|over|shifts|builds|strengthens|weakens|pressure|cent)))/i,
    "an area of high sea-level pressure: air sinks and spreads out, skies mostly clear; the wind blows clockwise round it",
    { focus: "sfc", context: ["p500"], fill: "none", particles: true, hl: ["sfc"] }],
  ["trades", "The trade winds", /\b(trade winds?|trades)\b/i,
    "the steady north-easterly winds blowing out of the subtropical high toward the equator; their strength is set by how tightly the isobars pack north of the islands",
    { focus: "sfc", context: ["p500"], fill: "wind", flow: true, hl: ["sfc"] }],
  ["onoff", "Onshore or offshore flow", /\b(onshore|offshore) (flow|winds?|push|gradients?)\b|\bweakly offshore\b/i,
    "whether the low-level wind blows in from the ocean (onshore: cool, moist, cloudy) or out from the land (offshore: dry, clear, warmer by day)",
    { focus: "sfc", context: ["p500"], fill: "wind", flow: true, hl: ["sfc"] }],
  ["moisture", "Moisture", /\b(atmospheric river|moisture plume|deep moisture|precipitable water|pwats?|moisture|moist)\b/i,
    "the water vapour in the air, the fuel for rain; a long narrow plume of it is an atmospheric river",
    { focus: "sfc", context: [], fill: "water_vapour", particles: true }, "pwat"],
  ["inversion", "The inversion", /\binversion(?:s| heights?| base)?\b/i,
    "a layer where the temperature rises with height, a lid that stops air (and cloud) rising through it; in Hawaiʻi it caps the trade-wind clouds",
    { focus: "sfc", context: [], fill: "pbl", particles: true }, "hpbl"],
  ["swell", "Swell", /\bswells?\b/i,
    "waves that have travelled out of the storm that made them, long and regular, arriving days later far away",
    { focus: "sfc", context: [], fill: "waves", particles: true }, "waves"],
];

// Where to search, in order: the synopsis first (it names the big picture), then the rest.
const SECTIONS = [["synopsis", "synopsis"], ["short_term", "short term"], ["long_term", "long term"], ["discussion", "discussion"],
  ["prev_discussion", "earlier discussion"], ["marine", "marine"]];

export function sentencesOf(text) {
  return (text ?? "").replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z])/).map((s) => s.trim()).filter(Boolean);
}
// "no front", "not expecting a trough", "without ridging", "lack of moisture": the feature isn't there
const NEG = /\b(no|not|without|lack of|absent|unlikely|won't|isn't|aren't|doesn't|don't)\b[^,;]{0,30}$/i;

// ---- the time a sentence talks about, in the office's time zone ----------------------------------------
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const PART = { morning: 9, afternoon: 15, evening: 19, night: 23 };
function localParts(ms, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", hourCycle: "h23", weekday: "long" })
    .formatToParts(ms).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, wd: DAYS.indexOf(p.weekday.toLowerCase()) };
}
// the UTC time of local (day offset from the issuance's local date, hour) in tz
function localToUtc(issuedMs, tz, dayOff, hour) {
  const l = localParts(issuedMs, tz), offH = Math.round((Date.UTC(l.y, l.m - 1, l.d, l.h) - Math.floor(issuedMs / 3600e3) * 3600e3) / 3600e3);
  return Date.UTC(l.y, l.m - 1, l.d + dayOff, hour) - offH * 3600e3;
}
const ahead = (target, wd) => (target - wd + 7) % 7;
const TIME_RES = [
  [/\btonight\b/i, () => [0, 23]],
  [/\bthis (morning|afternoon|evening)\b/i, (wd, m) => [0, PART[m[1].toLowerCase()]]],
  [/\btoday\b/i, () => [0, 14]],
  [/\btomorrow(?: (morning|afternoon|evening|night))?\b/i, (wd, m) => [1, PART[m[1]?.toLowerCase()] ?? 13]],
  [/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?: (morning|afternoon|evening|night))?\b/i,
    (wd, m) => [ahead(DAYS.indexOf(m[1].toLowerCase()), wd), PART[m[2]?.toLowerCase()] ?? 13]],
  [/\b(mid[- ]?week|middle of the (?:work ?)?week)\b/i, (wd) => [ahead(3, wd), 13]],
  [/\b(second half of the week)\b/i, (wd) => [ahead(4, wd), 13]],
  [/\b(late (?:in the )?week|end of the week|late this week|later this week|later in the week)\b/i, (wd) => [ahead(5, wd), 13]],
  [/\b(early (?:in the |this )?week|first half of the week)\b/i, (wd) => [wd === 0 ? 1 : 0, 13]],
  [/\b(this |the )?weekend\b/i, (wd) => [ahead(6, wd), 13]],
  [/\bnext week\b/i, (wd) => [ahead(1, wd) || 7, 13]],
];
// The time phrase nearest the feature's words: the first after it (within 140 characters), else the last before it.
export function whenOf(sentence, matchAt, issuedMs, tz, fallbackDays = 0) {
  const wd = localParts(issuedMs, tz).wd, hits = [];
  for (const [re, f] of TIME_RES) {
    const g = new RegExp(re.source, "gi");
    let m;
    while ((m = g.exec(sentence))) hits.push({ at: m.index, m, f });
  }
  const after = hits.filter((h) => h.at >= matchAt && h.at - matchAt <= 140).sort((a, b) => a.at - b.at)[0];
  const before = hits.filter((h) => h.at < matchAt).sort((a, b) => b.at - a.at)[0];
  const h = after ?? before;
  if (!h) return { at: new Date(fallbackDays ? localToUtc(issuedMs, tz, fallbackDays, 13) : issuedMs).toISOString(), when: fallbackDays ? `about ${fallbackDays} days on (no time named)` : "at the time of the discussion" };
  const [dayOff, hour] = h.f(wd, h.m);
  return { at: new Date(localToUtc(issuedMs, tz, dayOff, hour)).toISOString(), when: h.m[0] };
}

export function afdFeatures(sections, issued, office) {
  const o = AFD_OFFICES[office], issuedMs = Date.parse(issued), found = [];
  for (const [key, label, re, explain, spec, needs] of DEFS) {
    let hit = null;
    for (const [si, [sec, secName]] of SECTIONS.entries()) {
      for (const [ni, sentence] of sentencesOf(sections?.[sec]).entries()) {
        const m = re.exec(sentence);
        if (!m || NEG.test(sentence.slice(0, m.index))) continue;
        const t = whenOf(sentence, m.index, issuedMs, o.tz, sec === "long_term" ? 4 : 0);
        hit = { key, label, words: m[0], section: secName, sentence, at: t.at, when: t.when, order: si, pos: ni * 1000 + m.index, explain, spec: { ...BASE, ...spec }, needs: needs ?? null };
        break;
      }
      if (hit) break;
    }
    if (hit) found.push(hit);
  }
  return found.sort((a, b) => a.order - b.order || Date.parse(a.at) - Date.parse(b.at) || a.pos - b.pos);   // section, time, then where it's written
}

// ---- checks against the model: plain functions of its fields on the grid ---------------------------
const lonW = (lon) => { const l = ((lon % 360) + 360) % 360; return l > 180 ? `${Math.round(360 - l)}°W` : `${Math.round(l)}°E`; };
const kmRound = (km) => Math.round(km / 10) * 10;
// The strongest 500 mb trough (sign 1) or ridge (-1) over the office's band of latitudes and longitudes.
function bandExtreme(gh, g, o, sign) {
  let best = null;
  for (let la = o.band[0]; la <= o.band[1]; la += 1) for (let lo = o.at[1] - o.west; lo <= o.at[1] + o.east; lo += 1) {
    const c = curvatureAt(gh, g, la, lo);
    if (Number.isFinite(c) && (!best || sign * c > sign * best.c)) best = { c, la, lo };
  }
  return best;
}

export function featureCheck(key, ctx, office, words = "") {
  const o = AFD_OFFICES[office], g = ctx.grid, [lat, lon] = o.at;
  if (key === "trough" || key === "ridge") {
    const up = ctx.level(500); if (!up?.gh) return null;
    // the 500 mb curvature averaged over and just upstream of the place (±3° of latitude, 10° west to 2° east, over ±4°):
    // on a year of discussions this is what separated the days the forecasters named a trough or ridge from the rest
    // (tools/score_afd_setup.mjs); the strongest one anywhere in a wide box was there every day and told nothing
    let sum = 0, k = 0;
    for (let la = lat - 3; la <= lat + 3; la += 1) for (let lo = lon - 10; lo <= lon + 2; lo += 1) { const c = curvatureAt(up.gh, g, la, lo, 4); if (Number.isFinite(c)) { sum += c; k++; } }
    if (!k) return null;
    const c = sum / k, word = c > 0.2 ? "curves like a trough (cyclonically)" : c < -0.2 ? "curves like a ridge (anticyclonically)" : "runs nearly straight";
    const sign = key === "trough" ? 1 : -1, b = bandExtreme(up.gh, g, o, sign);
    const where = b && sign * b.c > 0.3 ? ` The strongest ${key} close by is centred near ${fmtLatLon(b.la, b.lo)}, about ${kmRound(distBearing([lat, lon], [b.la, b.lo])[0])} km to the ${compass16(distBearing([lat, lon], [b.la, b.lo])[1])}.` : "";
    return { text: `Over and just upstream of ${o.place}, the model's 500 mb flow ${word}.${where}`, agrees: key === "trough" ? c > 0.2 : c < -0.2 };
  }
  if (key === "zonal") {
    const up = ctx.level(250); if (!up?.u) return null;
    let su = 0, sv = 0, n = 0;
    for (let la = lat - 6; la <= lat + 6; la += 1) for (let lo = lon - 30; lo <= lon; lo += 1) {
      const u = valueAt(up.u, g, la, lo), v = valueAt(up.v, g, la, lo);
      if (Number.isFinite(u) && Number.isFinite(v)) { su += Math.abs(u); sv += Math.abs(v); n++; }
    }
    if (!n) return null;
    const r = sv / su;
    return { text: `Upstream of ${o.place} the model's 250 mb wind averages ${Math.round((su / n) * KT)} kt west–east and ${Math.round((sv / n) * KT)} kt north–south: ${r < 0.5 ? "west–east (zonal) flow" : r < 0.8 ? "flow with some waviness" : "wavy (meridional) flow, not zonal"}.`, agrees: r < 0.65 };
  }
  if (key === "low" || key === "high") {
    const s = ctx.sfc(); if (!s?.mslp) return null;
    const c = centresNear(s.mslp, g, lat, lon, o.km, 5, 2, s.psfc ?? null).find((x) => x.kind === (key === "low" ? "L" : "H"));
    if (c) return { text: `The model's nearest ${key} is ${Math.round(c.hPa)} hPa near ${fmtLatLon(c.lat, c.lon)}, about ${kmRound(c.km)} km to the ${compass16(c.bearing)} of ${o.place}.`, agrees: true };
    // a broad high (the subtropical high north of Hawaii) stands out from its surroundings by less than the closed-centre
    // test needs (missed on the 2026-10-18 data): then the highest (lowest) pressure within 2,000 km, said as such
    let best = null;
    for (let la = lat - 18; la <= lat + 18; la += 1) for (let lo = lon - 25; lo <= lon + 25; lo += 1) {
      const p = valueAt(s.mslp, g, la, lo), [km] = distBearing([lat, lon], [la, lo]);
      if (!Number.isFinite(p) || km > o.km || (s.psfc && !(valueAt(s.psfc, g, la, lo) >= 97000))) continue;
      if (!best || (key === "high" ? p > best.p : p < best.p)) best = { p, la, lo };
    }
    if (!best) return null;
    const [km, brg] = distBearing([lat, lon], [best.la, best.lo]), hPa = Math.round(best.p / 100);
    return { text: `No closed ${key} near ${o.place} on the model's map; the ${key === "high" ? "highest" : "lowest"} sea-level pressure within ${o.km.toLocaleString("en-US")} km is ${hPa} hPa near ${fmtLatLon(best.la, best.lo)}, about ${kmRound(km)} km to the ${compass16(brg)}${key === "high" ? " (a broad high, or the edge of one further away)" : ""}.`,
      agrees: key === "high" ? hPa >= 1020 : hPa <= 1008 };
  }
  if (key === "front") {
    // not measured: on a year of NWS Seattle discussions a "sharp 850 mb contrast with a pressure trough" was there on
    // 53 % of the days a front was named and 51 % of all days, no better than chance (tools/score_afd_setup.mjs)
    return { text: `Look for where the 850 mb colours crowd together, the barbs turn and the isobars kink: that's a front. This page doesn't find fronts by itself (a test on a year of discussions matched them no better than chance); press Play toward ${o.place} and watch the crowded colours move.`, agrees: null };
  }
  if (key === "trades" || key === "onoff") {
    const s = ctx.sfc(); if (!s?.u10) return null;
    const u = valueAt(s.u10, g, lat, lon), v = valueAt(s.v10, g, lat, lon), from = (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360, kt = Math.hypot(u, v) * KT;
    if (key === "trades") {
      const trades = from >= 20 && from <= 120 && kt >= 8;
      const t = from >= 20 && from <= 120 ? (kt >= 20 ? "strong trades" : kt >= 12 ? "moderate to fresh trades" : kt >= 8 ? "light trades" : "too light for trades") : from > 120 && from <= 200 ? "south-easterly, not trades" : "not trades";
      return { text: `The model's 10 m wind over the open sea near ${o.place} is from the ${compass16(from)} at ${Math.round(kt)} kt: ${t} (the channels and ridges run stronger than this grid shows).`, agrees: trades };
    }
    const iso = s.mslp ? isobarsAt(s.mslp, g, lat, lon, 2) : null, onshore = from >= 180 && from <= 330, said = /onshore/i.test(words) ? "onshore" : "offshore";
    return { text: `The model's 10 m wind near the coast is from the ${compass16(from)} at ${Math.round(kt)} kt${iso ? ` (the isobars push from the ${compass16(iso.from)})` : ""}: ${kt < 5 ? "light, neither clearly on- nor offshore" : onshore ? "onshore, in from the ocean" : "offshore or along the coast"}.`,
      agrees: kt < 5 ? null : (said === "onshore") === onshore };
  }
  if (key === "moisture") {
    const s = ctx.sfc(); if (!s?.pwat) return null;
    const here = valueAt(s.pwat, g, lat, lon);
    let mx = -1, at = null;
    for (let la = lat - 10; la <= lat + 10; la += 1) for (let lo = lon - 25; lo <= lon + 5; lo += 1) { const x = valueAt(s.pwat, g, la, lo); if (x > mx) { mx = x; at = [la, lo]; } }
    return { text: `The model has ${Math.round(here)} mm of water vapour over ${o.place}; the most within about 1,000 km upstream is ${Math.round(mx)} mm near ${fmtLatLon(at[0], at[1])}.`, agrees: null };
  }
  if (key === "inversion") {
    const s = ctx.sfc(); if (!s?.hpbl) return null;
    const h = valueAt(s.hpbl, g, lat, lon);
    return { text: `A stand-in, not the inversion itself: the model's mixed layer over the sea near ${o.place} is about ${Math.round(h / 100) * 100} m deep (${Math.round((h * 3.28084) / 100) * 100} ft). The inversion heights forecasters quote come from the morning weather-balloon soundings.`, agrees: null };
  }
  if (key === "swell") return { text: "The wave model's significant wave height and period are on the map; hover for the values. Swell from a distant storm takes days to arrive: press Play.", agrees: null };
  return null;
}
