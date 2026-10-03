// The Simulate mode's guided lessons and its labels (user request 2026-09-30:
// "annotate ... the various cell areas and the various winds and regions ...
// the highs and lows ... and coriolis effects"). Each lesson walks through
// planets in steps, like the Cases: what to set, what's on the screen and why,
// what to look for, and a live note measured from the running model.
//
// Labels come in two kinds, never mixed up:
//   modelLabels(): placed from the running model's own diagnostics (sim2d.js):
//     its cells, rising and sinking air, trade winds, jets. Only what the
//     model actually makes is labelled.
//   TEXTBOOK: Earth's observed long-term average, the classic three-cell
//     picture (Hadley, Ferrel, polar cells; ITCZ, subtropical highs, subpolar
//     lows, polar highs; trades, westerlies, polar easterlies), drawn as a
//     labelled schematic for comparison. This model can't make the Ferrel and
//     polar cells: they are driven by storms, which need the 3-D stage.
//
// Numbers quoted in the text were measured on this model (2026-09-30, node):
// Earth at the equinox: cells to 26 deg, jet 37 m/s near 23 deg, surface trades
// about 0.7 m/s (Earth's are 5-7), equatorward surface flow about 0.3 m/s.
// No spin: cells to 80 deg, equator-pole difference 22 K (58 with spin).
// Seasons: the ITCZ swings 19N-19S with 10-30 days of heat storage, 15N-15S
// with 90; the winter jet reaches ~100 m/s, the summer one ~20.
// 3-D steps' notes get {pe (the worker's message), cells, belts} instead of the 2-D diagnostics.
// Pure, no imports: node --test loads it.

const f0 = (x) => (Number.isFinite(x) ? Math.round(x) : "—");
const hemi = (lat) => `${Math.abs(Math.round(lat))}°${lat >= 0 ? "N" : "S"}`;

// Where the model's features are, as labels: [{lat, z (m), text, short, kind}], kind "cell" | "up" |
// "down" | "wind" | "jet"; short: the text for the small chart. d: diagnostics(s); s: the model
// state; p: its settings.
export function modelLabels(s, d, p) {
  const out = [];
  const spin = p.rotation !== 0;
  for (const [h, c] of [[1, d.north], [-1, d.south]]) {
    if (!Number.isFinite(c.edge)) continue;
    const name = spin ? "Hadley cell" : "one big cell";
    out.push({ lat: (h * c.edge) / 2, z: 7000, text: name, short: name, kind: "cell" });
    if (c.edge < 75) out.push({ lat: h * c.edge, z: 3000, text: "sinking air: subtropical high", short: "sinking", kind: "down" });
    else out.push({ lat: h * 84, z: 3000, text: "sinking at the pole", short: "sinking", kind: "down" });
  }
  if (d.wItczCmS >= 0.01) out.push({ lat: d.itcz, z: 5000, text: spin ? "rising air: ITCZ" : "rising at the equator", short: spin ? "rising: ITCZ" : "rising", kind: "up" });
  // surface winds: the strongest easterly between the equator and 30 deg in each hemisphere
  const { nlat, nz, lat, u } = s;
  for (const h of [1, -1]) {
    let best = 0, at = NaN;
    for (let j = 0; j < nlat; j++) {
      const L = (lat[j] * 180) / Math.PI;
      if (h > 0 ? L < 2 || L > 30 : L > -2 || L < -30) continue;
      if (u[j * nz] < best) { best = u[j * nz]; at = L; }
    }
    if (best < -0.2) out.push({ lat: at, z: 400, text: `trade winds (from the east${Math.abs(best) < 2 ? ", weak" : ""})`, short: "trades", kind: "wind" });
    else if (!spin && Number.isFinite(d.itcz)) out.push({ lat: h * 40, z: 400, text: "flow toward the equator", short: "→ equator", kind: "wind" });
  }
  if (!spin) for (const h of [1, -1]) out.push({ lat: h * 40, z: 12500, text: "flow toward the pole", short: "→ pole", kind: "wind" });
  for (const jt of [d.jetN, d.jetS]) if (jt.u > 5) out.push({ lat: jt.lat, z: jt.z + 1500, text: "subtropical jet", short: "jet", kind: "jet" });
  return out;
}

// Earth's observed average, the textbook three-cell picture. cells: lat range, and which way the
// air flows high up (+1 toward higher latitude numbers, i.e. north); the flow near the ground is
// the opposite. Hadley and polar cells rise on their equatorward side; Ferrel cells the other way.
export const TEXTBOOK = {
  cells: [
    { from: 0, to: 30, name: "Hadley", aloft: 1 }, { from: 30, to: 60, name: "Ferrel", aloft: -1 }, { from: 60, to: 90, name: "polar", aloft: 1 },
    { from: -30, to: 0, name: "Hadley", aloft: -1 }, { from: -60, to: -30, name: "Ferrel", aloft: 1 }, { from: -90, to: -60, name: "polar", aloft: -1 },
  ],
  belts: [
    { lat: 0, text: "ITCZ (low pressure)" },
    { lat: 30, text: "subtropical highs" }, { lat: -30, text: "subtropical highs" },
    { lat: 60, text: "subpolar lows" }, { lat: -60, text: "subpolar lows" },
    { lat: 88, text: "polar high" }, { lat: -88, text: "polar high" },
  ],
  winds: [
    { lat: 15, text: "NE trades" }, { lat: -15, text: "SE trades" },
    { lat: 45, text: "westerlies" }, { lat: -45, text: "westerlies" },
    { lat: 75, text: "polar easterlies" }, { lat: -75, text: "polar easterlies" },
  ],
};

// A lesson step: model ("2d", the default, or "3d"), set (model settings over Earth's), start
// ("rest": still air, watch it grow; "settle": fast-forward to the balance (2-D); "spunup": the 3-D
// model's spun-up state; "keep": carry on), view (display settings), key (what
// each part of the screen shows), why, lookFor, note(d, p) -> a live sentence or null.
export const SIM_LESSONS = [
  {
    id: "one-cell", title: "1. From sunlight to a circulation",
    steps: [
      {
        title: "Heated, but not yet moving",
        set: { rotation: 0 }, start: "rest",
        view: { slab: true, labels: true, textbook: false, arrows: false, speed: 1, exag: 100, vex: 200 },
        key: { Particles: "in a slab at the globe's edge, seen side-on; pale low, orange high", Chart: "the same slice averaged round the planet: arrows are the overturning", Labels: "placed from the model as it runs" },
        why: "Sunlight heats the tropics far more than the poles. Warm air is lighter, so it rises; cold air sinks. That is all this planet has: no spin, no land, no water vapour.",
        lookFor: "The model starts from still air, and runs at one day a second. Within a few days the particles over the equator start to climb (turning orange) and those near the poles sink. Watch the arrows in the chart appear: up at the equator, across toward the poles high up, down at the poles.",
        note: (d) => (d.wItczCmS >= 0.01 ? `Air is rising fastest at ${hemi(d.itcz)}, at ${(d.wItczCmS * 10).toFixed(1)} mm/s (3 km up).` : "The air is still starting to move."),
      },
      {
        title: "No spin: one big cell each side",
        set: { rotation: 0 }, start: "settle",
        view: { slab: true, labels: true, textbook: false, arrows: false, speed: 5, exag: 100, vex: 200 },
        key: { Particles: "side-on slab: they loop up at the equator, poleward aloft, down near the poles, back along the ground", Chart: "one cell in each hemisphere, no colour (no east–west wind)", Labels: "the cells, the rising and sinking air, the flows" },
        why: "Without spin nothing turns the moving air sideways, so it goes straight from where it's heated to where it's cooled: George Hadley's 1735 picture, one cell from the equator to each pole.",
        lookFor: "One loop each side, reaching almost to the poles. The chart has no red or blue: with no spin there's no east–west wind at all. The loop carries heat poleward so well that the poles end up much less cold than sunlight alone would make them.",
        note: (d) => `The cells reach ${f0(d.north.edge)}°N and ${f0(d.south.edge)}°S; the equator is only ${f0(d.contrastK)} K warmer than the poles at the ground.`,
      },
    ],
  },
  {
    id: "coriolis", title: "2. Add spin: Coriolis, the trades and the jet",
    steps: [
      {
        title: "Earth's spin",
        set: { rotation: 1 }, start: "settle",
        view: { slab: false, labels: true, textbook: false, arrows: true, speed: 5, exag: 30, vex: 100 },
        key: { Particles: "over the whole globe: the east–west wind at true speed", Chart: "red: winds from the west, blue: from the east", Arrows: "grey: where the moving air would go without spin; yellow: where the model's air actually goes", Labels: "the Hadley cells, the ITCZ, the subtropical highs, the trades, the jets" },
        why: "On a spinning planet, air moving north or south is turned sideways: to the right in the northern hemisphere, to the left in the southern (the Coriolis effect). Air near the equator is already moving east with the ground at 465 m/s; carried poleward, where the ground moves slower, it keeps its spin and races ahead of the ground as a westerly wind.",
        lookFor: "The cells now stop far short of the poles. High up, the air flowing poleward is turned east into a jet stream (red in the chart). Near the ground the air returning toward the equator is turned west: the trade winds (blue near the ground). Check the yellow arrows against the grey ones: turned right in the north, left in the south.",
        note: (d) => `Cells end at ${f0(d.north.edge)}°N and ${f0(d.south.edge)}°S (Earth's: about 30°); jets ${f0(d.jetN.u)} m/s at ${hemi(d.jetN.lat)}; trades ${d.tradesN < 0 ? `${(-d.tradesN).toFixed(1)} m/s` : "none yet"} (Earth's are 5–7 m/s: without moisture this model's overturning is weak).`,
      },
      {
        title: "Why the cell stops: the jet gets too fast",
        set: { rotation: 1 }, start: "keep",
        view: { slab: true, labels: true, textbook: false, arrows: true, speed: 5, exag: 100, vex: 200 },
        key: { Particles: "side-on slab: the loop of the Hadley cell", Chart: "the jet's core (dot) sits at the cell's poleward edge", Arrows: "grey without spin, yellow with" },
        why: "Air carried poleward aloft keeps its spin about the axis, so it speeds up eastward the further it goes: at 30° it would be moving 130 m/s faster than the ground. Long before that it becomes unstable and breaks into eddies (on Earth, storms). So the cell can't reach far: it stops in the subtropics, and the air sinks there.",
        lookFor: "The loop is short: up at the ITCZ, over the top, down in the subtropics. The jet sits right where the air sinks. Compare the no-spin loop of lesson 1.",
        note: (d) => `The northern cell's air sinks near ${f0(d.north.edge)}°N, under the jet at ${hemi(d.jetN.lat)}.`,
      },
      {
        title: "Spin faster, spin slower",
        set: { rotation: 4 }, start: "settle",
        view: { slab: false, labels: true, textbook: false, arrows: true, speed: 5, exag: 30, vex: 100 },
        key: { Particles: "whole globe", Chart: "narrower cells, weaker jet", Labels: "from the model" },
        why: "The faster the spin, the sooner the poleward air is turned and the shorter the cell. Try the spin slider: 0.5× widens the cells to about 34° with a jet of about 84 m/s; 2× narrows them to about 20°; 4× to about 14°. Fast spinners like Jupiter have many narrow bands.",
        lookFor: "At 4× (a 6-hour day) the cells hug the equator and the jet is weak. Then drag the spin slider and watch the cells widen as it slows.",
        note: (d, p) => `At ${p.rotation}× spin the cells end at ${f0(d.north.edge)}°; the jet is ${f0(d.jetN.u)} m/s.`,
      },
    ],
  },
  {
    id: "seasons", title: "3. Tilt and the seasons",
    steps: [
      {
        title: "June: the Sun over the northern tropics",
        set: { day: 172 }, start: "settle",
        view: { slab: true, labels: true, textbook: false, arrows: false, speed: 5, exag: 100, vex: 200, sun: true },
        key: { Sun: "yellow ring: where it's overhead today; blue rings: the edges of 24-hour daylight and polar night", Chart: "the Sun's latitude marked on top", Labels: "from the model" },
        why: "Earth's axis is tilted 23.4°, so in June the Sun is overhead at 23.4°N and the northern hemisphere gets the most sunlight. The rising air follows the heating.",
        lookFor: "The ITCZ has moved north, into the summer hemisphere. The winter (southern) cell is now huge and crosses the equator; the summer one is small. The winter jet is several times the summer one.",
        note: (d) => `ITCZ at ${hemi(d.itcz)}; the winter (southern) jet ${f0(d.jetS.u)} m/s, the summer one ${f0(d.jetN.u)} m/s.`,
      },
      {
        title: "December: the other way round",
        set: { day: 355 }, start: "settle",
        view: { slab: true, labels: true, textbook: false, arrows: false, speed: 5, exag: 100, vex: 200, sun: true },
        key: { Sun: "overhead at 23.4°S", Chart: "the mirror image of June" },
        why: "Six months on, the Sun is overhead at 23.4°S and everything mirrors.",
        lookFor: "ITCZ south of the equator, the northern (winter) cell and jet strongest. This is why the North Pacific's jet and storms are strongest in winter.",
        note: (d) => `ITCZ at ${hemi(d.itcz)}; northern (winter) jet ${f0(d.jetN.u)} m/s.`,
      },
      {
        title: "Run the seasons",
        set: { seasons: true, day: 80 }, start: "settle",
        view: { slab: true, labels: true, textbook: false, arrows: false, speed: 15, exag: 100, vex: 200, sun: true },
        key: { Sun: "moves north and south through the year", Chart: "the cells and jets shifting with it" },
        why: "With the days running, the heating's centre travels between the tropics and the circulation chases it. In this model the ITCZ swings between about 19°N and 19°S, lagging the Sun by a week or more because the surface takes time to warm.",
        lookFor: "Watch the yellow Sun marker on the chart and the ITCZ label following it, a little behind. The jets take turns: strong in winter, weak in summer.",
        note: (d) => `Today: Sun and ITCZ at ${hemi(d.itcz)}; jets ${f0(d.jetN.u)} m/s north, ${f0(d.jetS.u)} m/s south.`,
      },
      {
        title: "No tilt: no seasons",
        set: { tilt: 0, day: 172 }, start: "settle",
        view: { slab: true, labels: true, textbook: false, arrows: false, speed: 5, exag: 100, vex: 200, sun: true },
        key: { Sun: "always over the equator", Chart: "both hemispheres the same all year" },
        why: "With no tilt the Sun stays over the equator every day, so there are no seasons: the circulation is the same in June as in March.",
        lookFor: "Two matching cells and jets, even on 21 June. Try the tilt slider up to 90° (Uranus): the poles take turns facing the Sun.",
        note: (d) => `Cells ${f0(d.north.edge)}°N and ${f0(d.south.edge)}°S, jets ${f0(d.jetN.u)} and ${f0(d.jetS.u)} m/s.`,
      },
    ],
  },
  {
    id: "storage", title: "4. Land and ocean: heat storage",
    steps: [
      {
        title: "A land-like surface: quick to warm and cool",
        set: { seasons: true, inertiaDays: 10, day: 80 }, start: "settle",
        view: { slab: true, labels: true, textbook: false, arrows: false, speed: 15, exag: 100, vex: 200, sun: true },
        key: { Chart: "the ITCZ and jets through the year", Sun: "the date's overhead point" },
        why: "Land holds little heat, so it warms and cools quickly: its seasons are big and come soon after the Sun's. In this model with 10 days of storage the ITCZ swings to 19° and turns back about 9 days after the solstice.",
        lookFor: "The ITCZ keeps close behind the Sun marker. The winter jet reaches about 100 m/s.",
        note: (d) => `ITCZ at ${hemi(d.itcz)}; jets ${f0(d.jetN.u)} / ${f0(d.jetS.u)} m/s.`,
      },
      {
        title: "An ocean-like surface: slow and steady",
        set: { seasons: true, inertiaDays: 90, day: 80 }, start: "settle",
        view: { slab: true, labels: true, textbook: false, arrows: false, speed: 15, exag: 100, vex: 200, sun: true },
        key: { Chart: "a smaller, later swing" },
        why: "The ocean stores far more heat, so it responds slowly: smaller seasons, a month or more late. With 90 days of storage the ITCZ only reaches about 15°, and the winter jet peaks near 77 m/s instead of 100.",
        lookFor: "The ITCZ lags well behind the Sun and doesn't go as far. This is why ocean climates like Hawaiʻi's and the Pacific Northwest coast's have mild seasons, and why the ocean's warmest month comes in August or September.",
        note: (d) => `ITCZ at ${hemi(d.itcz)}; jets ${f0(d.jetN.u)} / ${f0(d.jetS.u)} m/s.`,
      },
    ],
  },
  {
    id: "three-cells", title: "5. Earth's three cells, and what's still missing",
    steps: [
      {
        title: "The textbook picture beside the model",
        set: {}, start: "settle",
        view: { slab: true, labels: true, textbook: true, arrows: false, speed: 5, exag: 100, vex: 200 },
        key: { Chart: "grey dashed: Earth's observed average, the textbook three cells; colour and arrows: this model", Globe: "grey labels: Earth's surface belts and winds; white: the model's" },
        why: "Earth's long-term average has three cells in each hemisphere: the Hadley cell (0–30°), the Ferrel cell (30–60°) and the polar cell (60–90°), with the subtropical highs at 30°, the subpolar lows and polar front at 60°, and three wind belts at the ground: trades, westerlies and polar easterlies.",
        lookFor: "The model makes the Hadley cell, the ITCZ, the subtropical highs, the trades and the subtropical jet, but not the Ferrel and polar cells, the westerlies at the ground or the subpolar lows. Those are made by storms: the jet becomes unstable and breaks into the travelling highs and lows that carry heat poleward. This model averages round the planet, so it has no storms. Lesson 6 switches to the 3-D model, which makes them.",
        note: (d) => `Model: Hadley cells to ${f0(d.north.edge)}°N and ${f0(d.south.edge)}°S (textbook: 30°). Beyond them the model has no cells at all.`,
      },
    ],
  },
  {
    id: "storms", title: "6. Storms make the Ferrel cell (the 3-D model)",
    steps: [
      {
        title: "A symmetric start: the storms grow by themselves",
        model: "3d", set: {}, start: "rest",
        view: { labels: true, textbook: false, speed: 1, exag: 30, vex: 100, fill: "tlow", mean: false, sun: false },
        key: { Model: "3-D: a global model on a 64 × 32 grid and 6 levels, dry, no land", Colour: "temperature near the ground", Chart: "right now, averaged round the planet", Particles: "the winds at true speed; rising and sinking ×30" },
        why: "The 3-D model starts from air at rest, heated by the Sun, the same all round each latitude except for a tiny random ripple (a few tenths of a degree). The equator-to-pole temperature difference is unstable: any ripple in the jet grows, feeding on it (baroclinic instability).",
        lookFor: "For the first week or two it looks like the 2-D model: a Hadley cell and a smooth jet. Then waves appear in the temperature near 40–50° and grow into swirling storms, with lows and highs labelled. That's the jet breaking up, just as lesson 2 said it must.",
        note: ({ pe }) => `Day ${Math.round(pe.t / 86400)}: eddy energy ${pe.eke.toFixed(1)} m²/s², surface pressure ${pe.psMin.toFixed(0)}–${pe.psMax.toFixed(0)} hPa${pe.eke > 5 ? ": the storms are here." : "."}`,
      },
      {
        title: "A world of storms",
        model: "3d", set: {}, start: "spunup",
        view: { labels: true, textbook: false, speed: 1, exag: 30, vex: 100, fill: "ps", mean: true, sun: false },
        key: { Colour: "surface pressure: blue low, red high", Labels: "the lows (L) and highs (H), from the model", Particles: "the winds swirling round them", Chart: "the last 30 days, averaged round the planet" },
        why: "After a year of model time the storms never stop: lows form on the jet, deepen, carry warm air poleward and cold air equatorward, and fill, while new ones form. Air turns counter-clockwise round lows in the north, clockwise in the south (the Coriolis effect again).",
        lookFor: "Lows and highs travelling east in the mid-latitudes, the wind circling them. Compare the calm, even tropics with the busy mid-latitudes. Switch the colour to temperature near the ground and see the warm and cold air being wrapped round the lows: fronts.",
        note: ({ pe }) => `Surface pressure right now: ${pe.psMin.toFixed(0)} to ${pe.psMax.toFixed(0)} hPa.`,
      },
      {
        title: "Averaged: three belts and the Ferrel cell",
        model: "3d", set: {}, start: "keep",
        view: { labels: false, textbook: true, speed: 1, exag: 30, vex: 100, fill: "none", mean: true, sun: false },
        key: { Chart: "the last 30 days averaged round the planet: colour the east–west wind, lines the overturning (solid and dashed turn opposite ways); grey dashed: the textbook cells", Labels: "grey: Earth's textbook belts" },
        why: "Average the storms over a month and round the planet and the picture from lesson 5 appears, made by the model itself: a Hadley cell, then a Ferrel cell turning the other way. Nothing drives the Ferrel cell directly: it's what the storms' heat and momentum transport look like when averaged.",
        lookFor: "In the chart: the Hadley cells either side of the equator, and the Ferrel cells beyond them turning the opposite way, lining up with the textbook's grey loops. Near the ground: easterly trades in the tropics and westerlies in mid-latitudes (see Surface winds under Now). The polar cell is weak here, as it is in the standard benchmark this model follows.",
        note: ({ cells, belts }) => { const c = (n) => cells.filter((x) => x.name === n).map((x) => `${Math.abs(x.lat).toFixed(0)}°${x.lat >= 0 ? "N" : "S"}`).join(" and ") || "none"; return `Hadley cells at ${c("Hadley")}, Ferrel cells at ${c("Ferrel")}; surface westerlies ${belts.westN.toFixed(1)} m/s (north), trades ${belts.tradesN.toFixed(1)} m/s.`; },
      },
    ],
  },
  {
    id: "continents", title: "7. Continents and the seasons (the 3-D model)",
    steps: [
      {
        title: "July: hot continents, thermal lows",
        model: "3d", set: { land: true, seasons: true, day: 197 }, start: "spunup", from: "jul",
        view: { labels: true, textbook: false, speed: 1, exag: 30, vex: 100, fill: "tlow", mean: true, sun: true, flow: false, band: "all" },
        key: { Model: "3-D with Earth's continents (outlined), seasons running", Colour: "temperature near the ground", Labels: "lows (L) and highs (H)" },
        why: "Land holds little heat: under the summer Sun it heats within days, while the ocean, stirring its heat down through tens of metres of water, warms slowly and lags by months. So in July the northern continents are much hotter than the oceans at the same latitude.",
        lookFor: "Asia and North America glowing warmer than the Pacific and Atlantic beside them, and lows sitting over the hot land: air over it is light and rises, pressure falls. The biggest is over Asia, reaching down to South Asia: the dry skeleton of the monsoon low.",
        note: ({ pe }) => `30°–60°N now: Asia ${f0(boxMean(pe, "t", 40, 60, 70, 120))} °C, North Pacific ${f0(boxMean(pe, "t", 40, 60, 160, 220))} °C at the lowest level; surface pressure Asia ${f0(boxMean(pe, "ps", 40, 60, 70, 120))} hPa, North Pacific ${f0(boxMean(pe, "ps", 40, 60, 160, 220))}.`,
      },
      {
        title: "July: the winds round the lows",
        model: "3d", set: { land: true, seasons: true, day: 197 }, start: "keep",
        view: { labels: true, fill: "ps", flow: true, band: "low", mean: true },
        key: { Colour: "surface pressure: blue low, red high", Lines: "flow lines of the wind near the ground", Particles: "near the ground only" },
        why: "Air flows toward low pressure, turned by the Coriolis effect into a counter-clockwise spiral in the north. Over a summer continent that means sea air drawn in over the land: in Asia, the summer monsoon's inflow.",
        lookFor: "Flow lines spiralling into the Asian low and curving in from the oceans. Real monsoons are much stronger, because the moist air rains and its condensation heats the land's air further; this model is dry.",
        note: ({ pe }) => `Surface pressure: South Asia ${f0(boxMean(pe, "ps", 20, 35, 60, 100))} hPa, subtropical Pacific ${f0(boxMean(pe, "ps", 25, 40, 180, 230))} hPa.`,
      },
      {
        title: "January: cold continents, the Siberian high",
        model: "3d", set: { land: true, seasons: true, day: 15 }, start: "spunup", from: "jan",
        view: { labels: true, fill: "ps", flow: true, band: "low", mean: true },
        key: { Colour: "surface pressure", Lines: "flow lines near the ground", Labels: "lows and highs" },
        why: "In winter it's the other way round: the continents lose their heat within days and the air over them chills, grows dense and piles up into high pressure, while the oceans, still holding summer's heat, keep lower pressure.",
        lookFor: "High pressure over Asia (the Siberian high) with air flowing out of it, and lows over the northern oceans, where storms keep forming: the Aleutian low in the North Pacific and the Icelandic low in the North Atlantic, the North Pacific's winter storm factory.",
        note: ({ pe }) => `Surface pressure: Asia 40°–60°N ${f0(boxMean(pe, "ps", 40, 60, 70, 120))} hPa, North Pacific ${f0(boxMean(pe, "ps", 40, 60, 160, 220))}, North Atlantic 50°–65°N ${f0(boxMean(pe, "ps", 50, 65, 300, 340))}.`,
      },
      {
        title: "January: how cold the land gets",
        model: "3d", set: { land: true, seasons: true, day: 15 }, start: "keep",
        view: { labels: true, fill: "tlow", flow: false, band: "all", mean: true },
        key: { Colour: "temperature near the ground" },
        why: "The same heat storage as in lesson 4, now side by side on one planet: the land's winter is far colder than the ocean's at the same latitude.",
        lookFor: "Asia and North America colder than the oceans beside them. On Earth the contrast is much larger (Siberia at −30 °C against about +5 °C over the North Pacific): snow reflecting sunlight, and dry clear air losing heat to space, both missing from this dry model, make it stronger.",
        note: ({ pe }) => `Lowest level, 40°–60°N: Asia ${f0(boxMean(pe, "t", 40, 60, 70, 120))} °C, North Pacific ${f0(boxMean(pe, "t", 40, 60, 160, 220))} °C.`,
      },
    ],
  },
];

// The mean of the 3-D model's surface pressure ("ps", hPa) or lowest-level temperature ("t", deg C)
// over a lat-lon box (lon 0-360), from the worker's message.
export function boxMean(pe, what, la0, la1, lo0, lo1) {
  const { nlat, nlon, lat, L } = pe, n = nlat * nlon, off = what === "t" ? (L - 1) * n : 0, arr = what === "t" ? pe.temp : pe.ps;
  let s = 0, c = 0;
  for (let j = 0; j < nlat; j++) {
    if (lat[j] < la0 || lat[j] > la1) continue;
    for (let i = 0; i < nlon; i++) { const lo = (i * 360) / nlon; if (lo < lo0 || lo > lo1) continue; s += arr[off + j * nlon + i]; c++; }
  }
  return c ? s / c - (what === "t" ? 273.15 : 0) : NaN;
}

// Coriolis arrows from the running model: in each hemisphere, near the ground at 12 deg (air
// returning toward the equator) and high up at 15 deg (air heading poleward), a grey arrow where
// the air would go without spin and a yellow one along the model's own wind there, both 6 deg
// long. field: centredField(s); lons: where to draw them. [{lat, lon, z, dlat, dlon, kind}]
export function coriolisArrows(field, lons, { len = 6 } = {}) {
  const { nlat, nz, H, u, vc } = field, out = [];
  const kTop = Math.min(nz - 1, Math.round((11500 / H) * nz - 0.5));
  for (const h of [1, -1]) for (const [lat, k, towardPole] of [[12 * h, 0, false], [15 * h, kTop, true]]) {
    const j = Math.max(0, Math.min(nlat - 1, Math.round((lat + 90) / (180 / nlat) - 0.5))), uu = u[j * nz + k], vv = vc[j * nz + k];
    const sp = Math.hypot(uu, vv), z = ((k + 0.5) * H) / nz, cos = Math.cos((lat * Math.PI) / 180);
    for (const lon of lons) {
      out.push({ lat, lon, z, dlat: (towardPole ? 1 : -1) * h * len, dlon: 0, kind: "without" });
      if (sp > 1e-3) out.push({ lat, lon, z, dlat: (vv / sp) * len, dlon: ((uu / sp) * len) / cos, kind: "with" });
    }
  }
  return out;
}
