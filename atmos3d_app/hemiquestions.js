// Explore the hemisphere (user request 2026-10-17: "explore question options for the polar view"): guided presets
// for the Northern Hemisphere view, like the Pacific's questions (questions.js). Each sets the view's layers and
// folds, says what to look for and why, gives a live note computed from the step on screen, and an Ask whose answer
// stays hidden until asked. "count" and "follow" are the two question tools main.js runs itself.
// Pure, no three.js (node --test loads it).
//
// spec: show (hemiview.js show keys), open (the card's folds to open), needs (a field or "storms" or "forecast"),
// note(ctx) -> a sentence, or null while the data isn't there. ctx: {f (raw fields, 1 deg, no wrap), H, chains, spans,
// storms, lonName, when}.

import { blockSpans, blockedLongitudes, boldContour, cutoffLow, cutoffWords, tradesAtHawaii, tradesWords, troughsAt, vortexSeason, vortexStats } from "./hemisphere.js?v=20261024090011";

const KT = 1.943844;
// relief off for a first look (forecaster review 2026-10-17: one field drawn three ways); the block and trough questions turn it on
const BASE = { fill: "gha500", z500: true, jet: false, mslp: false, particles: true, relief: false, block: false, storms: true };

// The largest (sign +1) or smallest (-1) finite value of a field inside a box: {v, lat, lon} or null.
export function extremeIn(field, H, sign, { latS = -90, latN = 90, lonW = 0, lonE = 360 } = {}) {
  if (!field) return null;
  const { lat0, dlat, nlat, lon0, dlon, nlon } = H.grid;
  let best = null;
  for (let j = 0; j < nlat; j++) {
    const lat = lat0 + j * dlat;
    if (lat < latS || lat > latN) continue;
    for (let i = 0; i < nlon; i++) {
      const lon = lon0 + i * dlon;
      if (lon < lonW || lon > lonE) continue;
      const v = field[j * nlon + i];
      if (Number.isFinite(v) && (!best || sign * v > sign * best.v)) best = { v, lat, lon };
    }
  }
  return best;
}

const latName = (lat) => `${Math.round(Math.abs(lat))}°${lat < 0 ? "S" : "N"}`;

const sgn = (x) => { const r = Math.round(x) || 0; return `${r > 0 ? "+" : ""}${r}`; };   // no "-0"

export const HEMI_QUESTIONS = [
  {
    id: "jet", label: "The jet stream all the way round",
    show: { ...BASE, fill: "jet", z500: true, particles: true },
    why: "The jet is the polar front's river of fast air, about 10 km up; its strength and shape steer the storms.",
    lookFor: "The coloured band of fast wind circling the hemisphere, fastest off Japan in winter. The particles race through the troughs and ridges, which themselves barely move. Over the Pacific, is the fast core stretched out across the ocean (a stormy, zonal pattern for the Northwest) or pulled back toward Asia (a wavier one, with ridges and blocks more likely)?",
    ask: ["Why is the jet strongest off Japan in winter?", "Two jets meet there: the subtropical jet, made by the Hadley cell carrying spin poleward, near 30–35°N and 200 mb, and the jet driven by the storms above the polar front, fed by cold air off Asia meeting the warm Kuroshio; together they make the fastest wind on Earth"],
    note(c) {
      if (!c.f?.u250) return null;
      const sp = c.f.u250.map((u, k) => Math.hypot(u, c.f.v250[k]) * KT);
      const top = extremeIn(sp, c.H, 1, { latS: 15, latN: 75 });
      // the Pacific jet's fast core: the furthest east (140 E to 120 W) that 110 kt or more reaches between 25 and 55 N
      let reach = null;
      const { lat0, dlat, nlat, nlon } = c.H.grid;
      for (let i = 140; i <= 240; i++) for (let j = 0; j < nlat; j++) { const lat = lat0 + j * dlat; if (lat >= 25 && lat <= 55 && sp[j * nlon + i] >= 110) reach = i; }
      const summer = c.month >= 6 && c.month <= 9;
      return `Fastest jet now: ${Math.round(top.v)} kt near ${latName(top.lat)} ${c.lonName(top.lon)}. Over the Pacific the core of 110 kt or more ${reach == null ? "isn't there at all" : `reaches about ${c.lonName(reach)}`}: ${reach == null ? (summer ? "a weaker jet is normal in summer" : "a weak, broken jet") : reach >= 180 ? "stretched out past the dateline" : "pulled back toward Asia"}.`;
    },
  },
  { id: "count", label: "Count the waves", tool: "count" },
  { id: "follow", label: "Follow a trough toward the Northwest", tool: "follow" },
  {
    id: "block", label: "Is there a block?",
    show: { ...BASE, block: true, relief: true },
    why: "A block stops the westerlies for days; the weather under it and beside it stays put.",
    lookFor: "A big red area (heights far above normal) that doesn't move while blue troughs pass round it, and the band along 60°N: yellow where the westerlies have stopped at this time, orange where that has lasted four days or more. Step the timeline and see whether it stays.",
    ask: ["Why does a block make weather last?", "Storms are steered round it instead of through it, so whatever is under it, heat and drought or a stalled cold low, stays for days"],
    note(c) {
      if (!c.f?.gh500) return null;
      const spans = c.spans ?? blockSpans(blockedLongitudes(c.f.gh500, c.H), c.H);
      const lasting = (c.chains ?? []).length;
      const summer = c.month >= 6 && c.month <= 8 ? " (the test was made for winter; in summer its flags mean less)" : "";
      if (!spans.length && !lasting) return `No blocked flow at 56–64°N at ${c.when}${summer}.`;
      return `${spans.length ? `Blocked flow at ${c.when}: ${spans.map((s) => `${c.lonName(s.from)} to ${c.lonName(s.to)}`).join(" and ")}` : `No blocked flow at ${c.when}`}. ${lasting ? `Blocks lasting four days or more in these steps: ${lasting} (listed in the key).` : "None lasts four days in these steps yet."}${summer}`;
    },
  },
  {
    id: "cold", label: "Where's the cold air?",
    show: { ...BASE, fill: "ta850", z500: true },
    why: "The 850 mb temperature, about 1.5 km up, shows the air masses without the ground's daily swing; the bold line is the edge of the cold air aloft.",
    lookFor: "The blue pools of air colder than normal and where they spill south along the troughs, and the bold line: poleward of it is the cold air, and its deepest dips toward the equator are where the cold is escaping.",
    ask: ["Why does cold air spill south down the east side of a big ridge?", "The flow goes north up the ridge's west side and comes south down its east side, so on that side air from the Arctic is carried toward the equator"],
    note(c) {
      if (!c.f?.ta850 || !c.f?.gh500) return null;
      const cold = extremeIn(c.f.ta850, c.H, -1, { latS: 30, latN: 65 });
      // where the bold line dips furthest south: each meridian's first reach of the contour coming south from the pole
      const { lat0, dlat, nlat, nlon } = c.H.grid, z = boldContour(c.f.gh500, c.H, 50).z;
      let dip = null;
      for (let i = 0; i < nlon; i++) for (let j = 1; j < nlat; j++) {
        if (c.f.gh500[(j - 1) * nlon + i] < z && c.f.gh500[j * nlon + i] >= z) { const lat = lat0 + j * dlat; if (!dip || lat < dip.lat) dip = { lat, lon: i }; break; }
      }
      return `Coldest air against normal between 30 and 65°N at ${c.when}: ${Math.abs(Math.round(cold.v))} °C ${cold.v < 0 ? "colder" : "warmer"} than normal at 850 mb near ${latName(cold.lat)} ${c.lonName(cold.lon)}. The bold line (${z} m) dips furthest south to about ${latName(dip.lat)} at ${c.lonName(dip.lon)}.`;
    },
  },
  {
    id: "coming", label: "What's coming to the Northwest?",
    show: { ...BASE, fill: "v250", particles: true },
    open: ["hemiHovBox"],
    why: "Waves and their energy travel east across the Pacific; what's upstream now reaches the coast in days.",
    lookFor: "In the wave-packet colours, the red (blowing north) and blue (south) pairs upstream of the Northwest: each pair is a wave, a trough between blue on its west and red on its east. In Waves over time, follow the stripes heading for the gold line at the Pacific's east edge.",
    ask: ["A trough is 40° of longitude west of the coast. Roughly when might it arrive?", "In two to four days if it's one of the travelling troughs (10–20° a day); much later, or never, if it's a long wave, which can crawl, stall or even drift west. The fronts ride the faster, smaller waves through the long ones"],
    note(c) {
      if (!c.f?.gh500) return null;
      const t = troughsAt(c.f.gh500, c.H, 50).filter((x) => x.lon >= 150 && x.lon < 235).sort((a, b) => b.lon - a.lon)[0];
      if (!t) return `No trough between 150°E and the Northwest coast at 50°N at ${c.when}: a ridge or flat flow over the eastern Pacific.`;
      const d = 235 - t.lon;
      return `Nearest trough upstream at 50°N at ${c.when} (the page smooths over 15°, so this is one of the larger waves): about ${c.lonName(t.lon)}, ${d}° of longitude west of the coast (125°W). At 10–20° a day it would arrive in roughly ${(d / 20).toFixed(1)}–${(d / 10).toFixed(1)} days, but larger waves can crawl or stall; the fronts ride faster, smaller waves through it. Play the timeline to see.`;
    },
  },
  {
    id: "rivers", label: "Moist air and atmospheric rivers",
    show: { ...BASE, fill: "pwat", z500: true },
    needs: "pwat",
    why: "Long, narrow plumes of tropical water vapour carry the Northwest's heaviest rain; from the pole you see where they start.",
    lookFor: "A long, narrow ribbon of high water vapour (green to blue) reaching from the tropics toward the coast, usually ahead of a trough where the flow turns north. Moist air alone isn't a river: it takes a strong wind carrying it, in a narrow band. Follow it back to see where it starts: sometimes near Hawaiʻi (the Pineapple Express), sometimes much further west.",
    ask: ["Why do atmospheric rivers line up ahead of a trough?", "Ahead of a trough the wind turns to blow from the south-west, drawing moist tropical air poleward in a narrow band along the cold front"],
    note(c) {
      if (!c.f?.pwat) return null;
      const winter = c.month <= 4 || c.month >= 10, lim = winter ? 25 : 35;
      const m = extremeIn(c.f.pwat, c.H, 1, { latS: 38, latN: 55, lonW: 170, lonE: 240 });
      return `The moistest air between 38 and 55°N in the eastern Pacific at ${c.when}: ${Math.round(m.v)} mm near ${latName(m.lat)} ${c.lonName(m.lon)}, ${m.v >= lim ? `unusually moist for this latitude in ${winter ? "the cool season" : "the warm season"}` : "nothing unusual this far north"}. Whether it's an atmospheric river depends on how much moisture the wind carries (over 250 kg per metre per second) and on its shape, more than 2,000 km long and under 1,000 km wide: look for a long, narrow plume.`;
    },
  },
  {
    id: "vortex", label: "The polar vortex",
    show: { ...BASE, fill: "gha10mb", z500: false, particles: false },
    open: ["hemiVortexBox"],
    needs: "gha10mb",
    why: "The stratosphere's polar vortex, 30 km up, is the one in the news; when it breaks down, cold air can spill south weeks later.",
    lookFor: "At 10 mb, blue over the pole is a deep, strong vortex and red a warm, weak or displaced one. In the Polar vortex fold, the wind round 60°N through the forecast and the time–height chart: a warming starts at the top row and works down.",
    ask: ["If the stratosphere's vortex breaks down today, when might the weather feel it?", "Often over the next two to six weeks, as the change works down and the Arctic Oscillation turns negative; but not every warming does it"],
    note(c) {
      const v = vortexStats(c.f, c.H);
      if (!v) return null;
      const s = vortexSeason(c.month, c.vortexRows ?? [{ u60: v.u60 }]), winter = c.month >= 11 || c.month <= 3, big = winter ? 400 : 150;
      const capTxt = v.cap == null ? "" : ` and the polar cap stands ${v.cap > 0 ? "+" : ""}${v.cap.toFixed(0)} m against 1991–2020 (${v.cap > big ? "a warm, weakened vortex" : v.cap < -big ? "a cold, strong vortex" : `within ±${big} m: unremarkable for the season`})`;
      return `At ${c.when} the 10 mb wind round 60°N is ${v.u60 > 0 ? "a westerly" : "an easterly"} ${Math.abs(v.u60).toFixed(0)} m/s${capTxt}: ${s.words}.`;
    },
  },
  {
    id: "sure", label: "How sure is the model?",
    show: { ...BASE, fill: "dgh500" },
    needs: "dgh500",
    why: "With no ensemble here, the change between one run and the next is a rough clue to how sure the forecast is (CPC's ensemble spread for the AO, PNA and NAO, in the card, is a better one).",
    lookFor: "Big red or blue patches where this run has moved a trough or ridge since the run before; pale where it hasn't changed its mind. Step later in the forecast: the patches usually grow.",
    ask: ["The newest run moved a trough 500 km. Is the newest run more likely to be right?", "A little more often, since it started from newer observations, but a big jump mostly says the forecast is uncertain there: the next run may move it again"],
    note(c) {
      if (!c.f?.dgh500) return `No earlier run to compare at ${c.when}.`;
      const hi = extremeIn(c.f.dgh500, c.H, 1, { latS: 30, latN: 75 }), lo = extremeIn(c.f.dgh500, c.H, -1, { latS: 30, latN: 75 });
      const big = Math.abs(hi.v) > Math.abs(lo.v) ? hi : lo;
      // what counts as big grows with the lead: run-to-run differences pass 60 m almost everywhere by days 5-7 (review)
      const lim = Math.round(30 + 90 * Math.min(1, Math.max(0, c.lead ?? 0) / 168));
      return `Biggest change since the run before at ${c.when}: ${big.v > 0 ? "+" : ""}${Math.round(big.v)} m at 500 mb near ${latName(big.lat)} ${c.lonName(big.lon)} (${Math.abs(big.v) >= lim ? `more than the ${lim} m usual at this lead: the pattern there is in doubt` : `under the ${lim} m usual at this lead: the runs broadly agree`}).`;
    },
  },
  {
    id: "typhoons", label: "Typhoons and the jet",
    show: { ...BASE, fill: "v250", storms: true },
    needs: "storms",
    why: "A tropical cyclone swept into the westerlies becomes part of the jet's waves and can change the weather downstream for days.",
    lookFor: "The storm's official track and probability circle, and whether it's heading for the jet (the red and blue cells): a storm curving north-east into the westerlies (recurving) speeds up and often builds a ridge downstream, a few days later.",
    ask: ["What happens to a typhoon that recurves into the jet stream?", "It speeds up, loses its warm core and can grow again as a huge mid-latitude storm; its energy also pumps up the waves downstream"],
    note(c) {
      if (!c.storms?.length) return `No tropical cyclones on the map at ${c.when}.`;
      return `${c.storms.map((n) => `${n.s.name} (${n.s.agency}) near ${latName(n.lat)} ${c.lonName(n.lon)}${n.wind != null ? `, ${Math.round(n.wind)} kt` : ""}`).join("; ")}, at ${c.when}.`;
    },
  },
  {
    id: "trades", label: "Hawaiʻi's trade winds",
    show: { ...BASE, fill: "none", z500: false, mslp: true, particles: false },
    why: "The trades blow out of the subtropical high toward the equator; where the high sits, and how strong it is, sets Hawaiʻi's weather.",
    lookFor: "The subtropical high in the isobars north-east of Hawaiʻi, and the line in the card: the pressure difference across the islands. A front or low pushing south into the high weakens the trades; when it reaches the islands they can stop or turn.",
    ask: ["Why do the trades weaken when a front approaches Hawaiʻi from the north-west?", "The front pushes the subtropical high away east and lowers the pressure north of the islands, so the north–south squeeze that drives the trades eases"],
    note(c) {
      const t = c.f?.mslp && tradesAtHawaii(c.f.mslp, c.H);
      if (!t) return null;
      const cut = cutoffLow(c.f.gh500, c.H);
      return `At ${c.when} the subtropical high is ${Math.round(t.high.p)} hPa at ${latName(t.high.lat)} ${c.lonName(t.high.lon)}; across the islands the pressure at 30°N minus 20°N along 157°W is ${sgn(t.diff)} hPa and east minus west along 21°N ${sgn(t.ew)} hPa: ${tradesWords(t)}.${cut ? ` A cut-off low aloft at ${latName(cut.lat)} ${c.lonName(cut.lon)} (closed by ${Math.round(cut.closedBy)} m): ${cutoffWords(c.month)}.` : ""}`;
    },
  },
];
