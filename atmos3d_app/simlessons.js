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

// A lesson step (docs/sim_lesson_design.md section 2, 2026-10-10):
//   id, title; model "2d" (default) | "3d"; set: settings over Earth's;
//   start: "held" (at rest in radiative equilibrium, paused until "Let it move"), "rest" (from rest, running),
//     "settled" (fast-forward to the balance), "spunup" (the 3-D model's saved state `from`: aqua | jan | jul,
//     then settling into any real sea or mountains), "keep" (carry on; if the planet differs, `fallback`);
//   camera: cutaway | globe-tilted | npac-globe | pac-map | world-map | equator-map (main.js SIM_CAMERAS);
//   view: what's drawn (slab, labels, textbook, arrows, speed, exag, vex, fill, mean, sun, flow, band, chart);
//   predict: a question asked before a held step moves; lookFor: 1-2 things to see;
//   basic (everyone), deeper and expert (opened on request); onWater: what it means at sea;
//   tryIt: [{param, label, min, max, step, expect} | {param, label, options: [[value, text]], expect}];
//   metric: {id (main.js SIM_METRICS), label?, unit?, target: [lo, hi], tol}: the strip's live number;
//   note(d, p) (2-D) or note({pe, cells, belts, mt}) (3-D): a live sentence, optional.
// Numbers quoted were measured on these models (2-D: 2026-09-30; 3-D with the real sea and mountains:
// 2026-10-09/10, 60-day means; see the commit records).
const ON_OFF = [[true, "on"], [false, "off"]];
// The name of the saved settled 3-D state for a step's settings (tools/make_pe3d_states.mjs makes them; the worker
// fetches pe3d_states/<name>.json), or null: only steps with the real sea, mountains, water or El Nino and a fixed date.
export function savedStateName(set) {
  if (!set || set.seasons || !(set.sst || set.mountains || set.moist || set.enso)) return null;
  return [set.land ? "land" : "aqua", set.sst && "sst", set.mountains && "mtn", set.moist && "moist", set.enso, set.tauAirDays && `tau${set.tauAirDays}`, `d${set.day}`].filter(Boolean).join("-");
}
export const SIM_LESSONS = [
  {
    id: "sunlight", title: "0. Sunlight alone",
    recap: "uneven heating (60 K from equator to pole, by this model's sunlight alone) and the pressure push it makes high up.",
    quiz: [{ q: "Why is the equator warmer than the poles in this model before anything moves?", options: ["The Sun is closer to the equator", "Each square metre of the tropics gets more sunlight, and less is reflected", "Warm air flows to the equator"], correct: 1, why: "Sunlight arrives more directly near the equator (and the poles reflect more of it). The Earth–Sun distance is the same for both." }, { q: "High up, which way does the pressure push the air at first?", options: ["Toward the poles", "Toward the equator", "Nowhere: pressure is equal"], correct: 0, why: "The warm tropical columns are taller, so high up the pressure is higher over the equator: the push is poleward." }],
    steps: [
      {
        id: "orient", core: true, title: "How to use the simulator",
        set: { rotation: 1, day: 80 }, start: "held", hold: true, camera: "cutaway",
        view: { slab: true, labels: false, textbook: false, arrows: false, speed: 1, exag: 100, vex: 200, sun: true, chart: "T" },
        tour: [{"el": "simCard", "label": "The step card", "text": "This panel. Each step's idea in plain words, what to look for, controls to try, and deeper layers (Go deeper, Expert) for when you want the numbers and equations. ◀ ▶ (or the arrow keys) move between steps; Contents lists them all; ★ marks a one-hour core path."}, {"el": "simStrip", "label": "The strip", "text": "The model's clock: days since the step began, the date and the speed. The model's sunlight is a daily average, so there's no day and night."}, {"el": "simPill", "label": "What the model is doing", "text": "HELD (paused at its starting state), SPINNING UP (growing from still air), FAST-FORWARD (racing to the balance after a change: numbers wait), AVERAGING (collecting a fresh 30-day mean), CYCLING (seasons running), SETTLED (the step's number has stopped changing)."}, {"el": "simMetric", "label": "The step's number", "text": "One measurement from the running model that captures the step's idea, with its last 60 days as a sparkline. The green band is the range this model is expected to reach; a dashed line, Earth's value; ≈ means it hasn't settled yet."}, {"el": "simChart", "label": "The chart", "text": "A slice through the atmosphere: usually north–south and averaged all the way round the planet, height up to 16 km. The 'What am I looking at?' key says how to read whichever chart is showing."}, {"el": "simKeyBtn", "label": "What am I looking at?", "text": "Opens a key (or press K) that explains every colour, particle, line and number on the screen right now, and says what's the model and what's observed data."}, {"el": "simAll", "label": "All settings", "text": "Every control, for free play: the planet (spin, tilt, date, heating, heat storage), the model (2-D or 3-D, continents, the real sea, mountains, water vapour), the view and the running speed, each explained."}],
        lookFor: ["Press each \"Show me\" below: the part of the screen it describes lights up.", "Drag the globe to turn it, scroll to zoom; Re-centre (top right) puts the step's view back."],
        basic: "This is a model planet that runs live in your browser: it works out, step by step, how air is pushed, turned, heated and carried, and the circulation comes out by itself. The lessons build Earth's winds one ingredient at a time. Here's the screen.",
        deeper: "There are two models. The 2-D one (lessons 0–4) averages everything round the planet, so it has only latitude and height: quick and clear, but no storms. The 3-D one (lessons 5–11) is a real, coarse global atmosphere that makes its own storms and can sit on the real continents, sea and mountains. The particles on the globe ride the model's winds: east–west at true speed, while the slow up–down and north–south motion is sped up (×100 here) and heights are stretched (×200) so you can see them. Pale cyan particles are low, orange ones high. After you change the planet, the model fast-forwards to its new balance, because the atmosphere takes weeks to settle.",
        expert: "Every number on screen is computed from the model's own fields (see the key for definitions). The guide's \"How the Simulate models work\" gives the equations, the real data used (NOAA ERSST v5, ETOPO1, Natural Earth) and a table of the model against Earth.",
        metric: { id: "contrast", target: [55, 65], tol: 1 },
      },
      {
        id: "uneven-sun", core: true, title: "Uneven sunlight",
        set: { rotation: 1, day: 80 }, start: "held", hold: true, camera: "cutaway",
        view: { slab: true, labels: false, textbook: false, arrows: false, speed: 1, exag: 100, vex: 200, sun: true, chart: "T" },
        lookFor: ["In the chart: warm air (red) near the ground at the equator, cold (blue) at the poles and everywhere high up.", "Nothing is moving yet: the model is held."],
        basic: "The Sun is overhead near the equator and low in the sky near the poles, so each square metre of the tropics gets far more sunlight. If the air couldn't move, each latitude would warm until it lost heat as fast as it gained it. That is what the chart shows: hot tropics, frozen poles, and still air.",
        deeper: "Averaged over a day at the equinox, sunlight at the top of the atmosphere is about 435 W/m² at the equator and falls off toward the poles, where low sun and ice also reflect more of it (this model's albedo rises from 0.25 to 0.60). The model pulls each latitude toward a \"sunlight alone\" temperature: 315 K (42 °C) at the equator and 60 K colder at the poles. That target is the standard benchmark's (Held & Suarez 1994), chosen to give an Earth-like climate; a true radiative equilibrium, with no heat carried at all, would be far more extreme. Earth's actual annual-mean surface difference is about 45 K to the Arctic (more to the high Antarctic plateau), because winds and ocean currents carry heat poleward: that is what the rest of these lessons are about. The sunlight here is a daily average: there's no day and night.",
        expert: "Daily-mean insolation Q(φ, δ) ∝ h₀ sinφ sinδ + cosφ cosδ sin h₀, with cos h₀ = −tanφ tanδ. The model relaxes θ toward θ_eq(φ, z) over τ_rad = 10 days; the surface target follows the insolation through a slab with a response time (inertiaDays). Equator–pole contrast of θ_eq at the ground: contrastK = 60 K at the equinox.",
        tryIt: [{ param: "contrastK", label: "Sunlight's equator–pole contrast", min: 20, max: 100, step: 5, unit: " K", expect: "More contrast: a redder equator, bluer poles. Still nothing moves: the model is held." }],
        metric: { id: "contrast", target: [55, 65], tol: 1 },
      },
      {
        id: "pressure-aloft", core: true, title: "Warm air is taller: a push aloft",
        set: { rotation: 1, day: 80 }, start: "held", hold: true, camera: "cutaway",
        view: { slab: true, labels: false, arrows: false, speed: 1, exag: 100, vex: 200, sun: true, chart: "pSurf" },
        predict: "If the air were let go, which way would the air about 5–6 km up (the 500 hPa level) move first: toward the poles, or toward the equator? (The next step lets it go.)",
        predictOptions: ["Toward the poles", "Toward the equator", "Nowhere: the pressure is the same everywhere"], predictAnswer: 0,
        lookFor: ["In the chart, the lines of equal pressure (850, 700, 500, 300, 200 hPa) bulge upward over the warm equator, more and more with height.", "The number: how much higher the 500 hPa surface sits over the equator than over the poles."],
        basic: "Warm air expands. The warm column over the equator is taller than the cold columns over the poles, so 5 km up at the equator there's still more air above you than at the same height over a pole: higher pressure. Air is pushed from high pressure toward low, so high up it's pushed toward the poles.",
        deeper: "The thickness of a layer between two pressures is proportional to its average temperature (the hypsometric equation), so the pressure surfaces bulge up over the warm tropics, more and more with height. At the ground the pressure starts out the same everywhere, so there's no push near the ground yet: that develops once air has been moved aloft (next step). On real weather maps the 500 hPa surface is about 5.9 km up in the tropics and about 5.0 km near the pole in winter.",
        expert: "Hydrostatic balance ∂Φ/∂z = g θ/θ₀ (Boussinesq), with the geopotential Φ equal at the ground everywhere at t = 0; the pressure-gradient force is −(1/a) ∂Φ/∂φ, φ the latitude. Hypsometric: Δz = (R T̄ / g) ln(p₁/p₂). The number is the height of the 500 hPa surface over the equator minus its mean at 88°N and 88°S, from the hydrostatic integration of the model's temperature (the lines on the chart): about 980 m here, close to Earth's roughly 900 m in winter.",
        tryIt: [{ param: "contrastK", label: "Sunlight's equator–pole contrast", min: 20, max: 100, step: 5, unit: " K", expect: "The bulge, and the push, grow with the contrast." }],
        metric: { id: "push500", target: [300, 1500], tol: 5 },
      },
      {
        id: "release", core: true, title: "Let it move",
        set: { rotation: 0, day: 80 }, start: "held", camera: "cutaway", slowmo: { speed: 0.25, seconds: 16 },
        view: { slab: true, labels: true, arrows: false, speed: 1, exag: 100, vex: 200, sun: false, chart: "uPsi" },
        predict: "This planet doesn't spin (one idea at a time). Let it go: where will the air rise, and which way will it go high up?",
        predictOptions: ["It rises over the equator, flows poleward high up and sinks near the poles", "It rises at the poles and flows toward the equator high up", "Hardly anything happens"], predictAnswer: 0,
        reveal: "Up over the equator, poleward high up (the arrows and the orange particles), sinking near the poles and back along the ground. If you said the air would rise where it's warm and flow poleward aloft, you were right; the surprise is how fast it surges at first.",
        lookFor: ["Within the first days the particles over the equator climb (turning orange) and those near the poles sink.", "Arrows appear in the chart: up at the equator, poleward aloft, down near the poles, back along the ground."],
        basic: "Now the air is free to move, and it goes where the push sends it: toward the poles high up. That piles air up over the poles and thins it over the equator, so near the ground the push reverses and air flows back toward the equator. Warm air rises at the equator; cold air sinks near the poles. A loop has formed.",
        deeper: "It starts in slow motion (a quarter of a day each second) so you can see the first moments, then runs at a day a second. Watch the number: at first nothing opposes the push, so the air surges poleward fast, tens of metres a second within the first day. As the loop carries heat poleward and piles air up over the poles, the push weakens, and within about two weeks the flow settles to a steady loop of about 7 m/s high up. Vertical speeds are only millimetres a second: the particles' climbing is drawn 100 times faster so it shows.",
        expert: "Released from rest, the meridional pressure gradient accelerates v unopposed (no Coriolis term with Ω = 0) until the overturning's heat transport flattens θ and the gradient; the overshoot decays as the flow comes into balance with friction near the ground (τ_f = 1 day) and radiative relaxation (10 days). Measured: 47 m/s aloft on day 1, 10 by day 8, 7.4 from day 15 on.",
        metric: { id: "vmax", target: [5, 10], tol: 0.3 },
      },
    ],
  },
  {
    id: "one-cell", title: "1. A planet that doesn't spin",
    recap: "a circulation: one overturning cell each side, which carries heat poleward and cuts the contrast to about 22 K. Earth's isn't like this, because Earth spins.",
    quiz: [{ q: "On a planet that doesn't spin, how far does the overturning cell reach?", options: ["About 30°", "Almost to the pole", "Only to 10°"], correct: 1, why: "With nothing turning the air aside it flows straight to where it's cooled: about 80° in this model." }, { q: "What does the loop do to the equator–pole temperature difference?", options: ["Makes it bigger", "Makes it much smaller", "Nothing"], correct: 1, why: "It carries heat poleward: 60 K by sunlight alone becomes about 22 K." }],
    steps: [
      {
        id: "one-cell", core: true, title: "One big cell each side",
        set: { rotation: 0 }, start: "settled", camera: "cutaway",
        view: { slab: true, labels: true, textbook: false, arrows: false, speed: 5, exag: 100, vex: 200, sun: false, chart: "uPsi" },
        lookFor: ["One loop in each hemisphere, reaching almost to the pole.", "The chart has no orange or purple: with no spin there's no east–west wind at all."],
        basic: "With nothing turning the moving air aside, it goes straight from where it's heated to where it's cooled. George Hadley pictured exactly this in 1735: one loop from the equator to each pole, rising in the tropics, sinking at the poles.",
        deeper: "Measured: the cells reach about 80°. A real planet that didn't spin would also have a permanent day side and night side; this model averages the sunlight round each latitude, so it shows only the equator-to-pole part. Venus, which turns once in 243 days, does have very wide overturning cells.",
        expert: "With Ω = 0 the zonal momentum equation has no f·v term, so u stays zero and nothing limits the cell's width except geometry and friction.",
        tryIt: [{ param: "contrastK", label: "Sunlight's equator–pole contrast", min: 20, max: 100, step: 5, unit: " K", expect: "Stronger contrast, a stronger loop: but it still reaches the poles." }],
        metric: { id: "hadleyN", label: "Cell reaches", target: [70, 85], tol: 2 },
      },
      {
        id: "heat-transport", core: true, title: "The loop carries heat to the poles",
        set: { rotation: 0 }, start: "keep", fallback: "settled", camera: "cutaway",
        view: { slab: true, labels: true, arrows: false, speed: 5, exag: 100, vex: 200, chart: "Tanom" },
        lookFor: ["The number: the equator is now only about 22 K warmer than the poles, not 60.", "In the chart, what the circulation did to the temperature: red (warmer than sunlight alone) toward the poles, blue (cooler) in the tropics."],
        basic: "The rising warm air at the equator is carried poleward and sinks there, bringing its heat with it. So the equator ends up only about 22 K warmer than the poles instead of 60 K. Moving heat from the tropics toward the poles is the whole job of the atmosphere's circulation.",
        deeper: "With Earth's spin the same model keeps a 58 K difference: spin makes the overturning far less effective at carrying heat (lesson 2 shows why), until storms take over the job in lesson 5. On Earth, the atmosphere and oceans together carry about 5 petawatts (5 × 10¹⁵ W) poleward across 35° latitude.",
        expert: "In the steady state the radiative heating (θ_eq − θ)/τ_rad balances advection −v ∂θ/∂y − w ∂θ/∂z. A longer τ_rad lets the circulation win, so the contrast shrinks.",
        tryIt: [{ param: "tauRadDays", label: "Radiation's response time", min: 5, max: 40, step: 5, unit: " days", expect: "Slower radiation gives the circulation longer to even things out: the difference shrinks." }],
        metric: { id: "contrast", target: [15, 30], tol: 1 },
      },
    ],
  },
  {
    id: "spin", title: "2. Add spin: Coriolis, the jet and the trades",
    recap: "the Coriolis turning, the subtropical jet (angular momentum), the Hadley cell's edge near 26° (Earth's about 30°) and the trade winds (weak here: under 1 m/s, Earth's 5–7).",
    quiz: [{ q: "In the northern hemisphere, moving air is turned…", options: ["to its left", "to its right", "toward the pole"], correct: 1, why: "To the right in the north, to the left in the south. Coriolis turns motion; it doesn't push toward anything." }, { q: "Why is there a jet stream at the top of the Hadley cell?", options: ["The Coriolis effect pushes air east", "Air moving poleward keeps its spin and speeds up as it gets nearer the axis", "The Sun heats the air there"], correct: 1, why: "Angular momentum: like a skater pulling in their arms." }, { q: "Why are the trade winds from the east?", options: ["Air flowing back toward the equator near the ground is turned west", "The Earth spins westward", "Storms push them"], correct: 0, why: "Turned right (north) or left (south) as it heads for the equator, the returning air comes from the north-east and south-east." }],
    steps: [
      {
        id: "coriolis", core: true, title: "Moving air turns aside",
        set: { rotation: 0 }, start: "settled", camera: "globe-tilted",
        view: { slab: false, labels: false, arrows: true, speed: 1, exag: 30, vex: 100, chart: "uPsi" },
        predict: "This is the no-spin planet, its air heading poleward high up. Use the slider below to switch on Earth's spin: which way will that air turn in the northern hemisphere?",
        predictOptions: ["To the right of its path (so high up it turns east)", "To the left of its path (west)", "Straight on: the spin doesn't matter"], predictAnswer: 0,
        reveal: "To the right of its path in the north, to the left in the south: the yellow arrows swing away from the grey ones within about a day. Moving poleward high up, that turns it east: a wind from the west.",
        lookFor: ["Drag the spin to 1: within a day the yellow arrows (the model's air) swing away from the grey ones (no spin): to the right in the north, to the left in the south.", "Orange (wind from the west) appears high up in the chart."],
        basic: "Moving air keeps its own spin about Earth's axis. Heading poleward, it's spinning faster than the ground it reaches, so it swerves east; heading east, it's spinning faster than the ground and is flung slightly outward, which on a round Earth means toward the equator. Seen from the ground, both are a turn to the right in the north, left in the south: the Coriolis effect.",
        deeper: "The turning is strongest near the poles and zero at the equator (it grows with the sine of the latitude). Left to itself, moving air turns about 8° every hour at 15° latitude and about 21° an hour at 45°, whatever its speed. It turns east–west motion too, not only north–south: air moving east is turned toward the equator. Spinning backwards turns it the other way. A common mistake: the Coriolis effect doesn't push air toward anything; it only turns moving air sideways, and does nothing to air at rest.",
        expert: "Coriolis acceleration −f k̂ × v, f = 2Ω sinφ: 3.8 × 10⁻⁵ s⁻¹ at 15°, 1.03 × 10⁻⁴ at 45°. An inertial circle takes 2π/f: 12 hours at the pole, 46 at 15°.",
        onWater: "Buys Ballot's law: in the northern hemisphere, stand with your back to the wind and the low pressure is on your left.",
        tryIt: [{ param: "rotation", label: "Spin (× Earth's)", min: -1, max: 2, step: 0.5, unit: "×", settle: false, expect: "0: no turning. 1: Earth. −1: backwards, everything turns the other way." }],
        metric: { id: "jetN", label: "Wind from the west aloft", target: [20, 45], tol: 1 },
      },
      {
        id: "jet", core: true, title: "Spin makes a jet stream",
        forecast: "jet",
        set: { rotation: 1 }, start: "settled", camera: "cutaway",
        view: { slab: true, labels: true, arrows: false, speed: 5, exag: 100, vex: 200, chart: "uPsi" },
        lookFor: ["The jet's core (the dot in the chart) sits where the cell's poleward flow ends.", "The cells now stop far short of the poles."],
        basic: "At the equator the ground and the air move east at 465 m/s with the Earth's spin. Carry that air toward a pole and it keeps its spin (angular momentum): like a skater pulling in their arms, it speeds up nearer the axis, while the ground beneath moves slower. So it races ahead of the ground as a wind from the west: the jet stream.",
        deeper: "If the air kept all its spin it would be a 77 m/s westerly by 23° and 134 m/s by 30°. Measured: this model's jet is about 37 m/s near 23°, roughly half, because friction and mixing take some away. And the wind increases with height wherever the temperature changes with latitude (thermal wind), so the jet tops the region of strongest equator–pole contrast.",
        expert: "Angular momentum per unit mass M = a cosφ (Ωa cosφ + u); conserving M from the equator gives u_M = Ωa sin²φ / cosφ. Thermal wind: f ∂u/∂z = −(g / θ₀ a) ∂θ/∂φ.",
        tryIt: [{ param: "rotation", label: "Spin (× Earth's)", min: 0.5, max: 2, step: 0.25, unit: "×", expect: "Slower spin: a wider cell and a faster jet (at 0.5× about 84 m/s)." }],
        metric: { id: "jetN", target: [30, 45], tol: 1 },
      },
      {
        id: "edge", core: true, title: "Why the cell stops in the subtropics",
        set: { rotation: 1 }, start: "keep", fallback: "settled", camera: "cutaway",
        view: { slab: true, labels: true, textbook: false, arrows: false, speed: 5, exag: 100, vex: 200, chart: "uPsi" },
        lookFor: ["The loop is short: up at the ITCZ, over the top, down by about 26°.", "Poleward of the edge this model has no circulation at all."],
        basic: "The poleward-moving air speeds up eastward the further it goes; long before reaching the pole it would be impossibly fast and unstable. So the cell stops in the subtropics and the air sinks there, making a belt of high pressure and dry, clear weather: the subtropical highs, where the world's great deserts are.",
        deeper: "Measured: the cells end at 26°N and 26°S at the equinox (Earth's: about 30°). Beyond the edge there's no circulation, so the temperatures stay near what sunlight alone sets: 58 K of the 60 K difference remains, fuel for the storms of lesson 5. Why there: the west wind the poleward air would need doesn't fit the temperatures the Sun sets (thermal wind), so the cell ends where the two stop matching (Held–Hou).",
        expert: "Held & Hou (1980): φ_H ≈ (5 g H Δ_H / 3 Ω² a²)^½. With H = 11 km and Δ_H = 60/300, φ_H ≈ 23°, close to the model's 26°.",
        onWater: "The subtropical highs: light, variable winds near 30°, the old \"horse latitudes\".",
        tryIt: [{ param: "contrastK", label: "Sunlight's equator–pole contrast", min: 20, max: 100, step: 5, unit: " K", expect: "Stronger heating, a wider cell (Held–Hou: it grows with the square root of the contrast)." }],
        metric: { id: "hadleyN", target: [22, 30], tol: 1 },
      },
      {
        id: "trades", core: true, title: "The trade winds",
        forecast: "trades",
        set: { rotation: 1 }, start: "keep", fallback: "settled", camera: "globe-tilted",
        view: { slab: false, labels: true, arrows: true, speed: 5, exag: 30, vex: 100, band: "low", chart: "uSfc", umax: 3 },
        lookFor: ["Low particles drifting west and toward the equator in both hemispheres.", "In the chart (the wind near the ground along latitude): the line dips below zero, from the east, between about 5° and 25° each side."],
        basic: "Near the ground the air flows back toward the equator, and the Coriolis effect turns it west: from the north-east in the northern hemisphere, from the south-east in the southern. These are the trade winds, the steadiest winds on Earth. Where they meet near the equator the air rises: the ITCZ.",
        deeper: "Honest numbers: this model's trades are under 1 m/s, while Earth's are 5–7 m/s (10–15 kt). A circulation averaged round the planet, without storms or moisture, is weak. In the 3-D model, storms carry westerly momentum out of the tropics and the trades reach 2–5 m/s (4–10 kt; lesson 5).",
        expert: "Surface easterlies are required by angular momentum balance: friction at the ground must give back the westerly momentum the Hadley cell exports aloft. In an axisymmetric model only the mean cell carries it, hence weakly.",
        onWater: "A passage to Hawaiʻi: the NE trades from about 25°N, and the doldrums near the ITCZ.",
        tryIt: [{ param: "tauFricDays", label: "Friction's time", min: 0.5, max: 3, step: 0.5, unit: " days", expect: "Less friction (a longer time): stronger trades, settling more slowly." }],
        metric: { id: "tradesN", target: [0.3, 1.5], tol: 0.1, earth: 6 },
      },
      {
        id: "spin-rate", title: "Faster spin, narrower cells (explore)",
        set: { rotation: 2 }, start: "settled", camera: "cutaway",
        view: { slab: true, labels: true, arrows: false, speed: 5, exag: 100, vex: 200, chart: "uPsi" },
        lookFor: ["At 2× the cells end near 20°.", "Move the slider and watch the edge (the number) settle at each spin."],
        basic: "The faster the spin, the sooner the moving air is turned aside, and the shorter the cell. Try the slider and watch the edge move. Fast-spinning Jupiter, with a 10-hour day, has many narrow bands.",
        deeper: "Measured: 0.5×: 34° (and a jet of 84 m/s); 1×: 26°; 2×: 20°; 4×: 14°. The cells shrink more slowly than Held and Hou's theory says (in proportion to 1/spin), because the theory assumes small angles and no friction.",
        expert: "φ_H ∝ Ω⁻¹ (Held–Hou); this model gives roughly Ω^−0.4. In turbulent 3-D flow the Rhines scale sets how far apart the jets are: a wavelength of about 2π √(2U/β).",
        tryIt: [{ param: "rotation", label: "Spin (× Earth's)", min: 0, max: 4, step: 0.25, unit: "×", expect: "Each spin settles in a few seconds: note the edge each time." }],
        metric: { id: "hadleyN", target: [17, 23], tol: 1 },
      },
    ],
  },
  {
    id: "textbook", title: "3. What averaging can't make",
    recap: "what a model averaged round the planet can't make: the Ferrel cell and westerlies at the ground, which need storms.",
    quiz: [{ q: "Which of the textbook's three cells does a model averaged round the planet make?", options: ["All three", "Only the Hadley cell", "Only the Ferrel cell"], correct: 1, why: "The Ferrel cell needs storms, which can't exist when every longitude is forced to be the same." }],
    steps: [
      {
        id: "textbook", core: true, title: "The textbook's three cells beside this model",
        set: {}, start: "settled", camera: "cutaway",
        view: { slab: true, labels: true, textbook: true, arrows: false, speed: 5, exag: 100, vex: 200, chart: "uPsi" },
        lookFor: ["The grey dashed Ferrel and polar loops with nothing of the model's under them.", "No westerlies at the ground near 45° in the chart."],
        basic: "The textbook picture has three cells in each hemisphere: Hadley (0–30°), Ferrel (30–60°) and polar (60–90°), with the trades, westerlies and polar easterlies at the ground. This model makes only the first. The Ferrel cell is made by storms, which a model averaged round the planet can't have; the polar cell is a weak, direct loop that this kind of model barely forms.",
        deeper: "Measured: Hadley cells to 26°; beyond them, nothing. The jet becomes unstable and should break into the travelling highs and lows that carry heat poleward. Lesson 5 switches to the 3-D model, which makes them.",
        expert: "The Ferrel cell is the residual of the eddies' heat and momentum fluxes in the Eulerian mean (Kuo–Eliassen). In an axisymmetric model there are no eddy fluxes, so no Ferrel cell.",
        tryIt: [{ param: "contrastK", label: "Sunlight's equator–pole contrast", min: 20, max: 100, step: 5, unit: " K", expect: "However hard you heat it, no second cell appears." }],
        metric: { id: "hadleyN", target: [22, 30], tol: 1 },
      },
    ],
  },
  {
    id: "seasons", title: "4. Tilt, the seasons and heat storage",
    recap: "the ITCZ following the Sun (late, and less far over a slow ocean) and the winter cell and jet taking over: why the North Pacific's storms peak in winter.",
    quiz: [{ q: "In June, where is the ITCZ?", options: ["On the equator", "North of the equator", "South of the equator"], correct: 1, why: "It follows the Sun into the summer hemisphere, a little behind." }, { q: "Which has the bigger, earlier seasons?", options: ["A land-like surface (little heat storage)", "An ocean-like surface (lots of storage)", "Neither"], correct: 0, why: "Land warms and cools quickly; the ocean responds slowly and late." }],
    steps: [
      {
        id: "solstice", core: true, title: "June: the winter cell takes over",
        set: { day: 172 }, start: "settled", camera: "cutaway",
        view: { slab: true, labels: true, arrows: false, speed: 5, exag: 100, vex: 200, sun: true, chart: "uPsi", umax: 100 },
        lookFor: ["The ITCZ has moved north of the equator, following the Sun.", "The southern (winter) cell is huge and crosses the equator; its jet is several times the summer one."],
        basic: "Earth's axis is tilted 23.4°, so in June the Sun is overhead at 23.4°N. The rising air follows the heating north. The winter hemisphere's cell grows and reaches right across the equator, and its jet becomes very strong. December is the mirror image: try the date below.",
        deeper: "Measured: at the solstice this model's winter jet reaches about 100 m/s and the summer one about 20. Earth's zonal-mean winter jet is only about 40 m/s: storms (which this 2-D model can't have) keep it far weaker. The pattern is right, though: it's why the North Pacific jet and its storms are strongest in winter. The real ITCZ moves less far than this model's over the open ocean, because the sea warms slowly (the heat-storage step below).",
        expert: "Lindzen & Hou (1988): moving the heating's peak a few degrees off the equator makes the winter cell dominant, nonlinearly. The cross-equatorial cell carries angular momentum from the summer to the winter hemisphere.",
        tryIt: [{ param: "day", label: "Date", options: [[172, "21 June"], [355, "21 December"], [80, "21 March"]], expect: "December mirrors June; March is even." }],
        metric: { id: "itcz", label: "ITCZ", unit: "°", target: [8, 22], tol: 1 },
      },
      {
        id: "year", title: "Run the year: the ITCZ follows the Sun, late",
        set: { seasons: true, day: 80 }, start: "settled", camera: "cutaway",
        view: { slab: true, labels: true, arrows: false, speed: 15, exag: 100, vex: 200, sun: true, chart: "uPsi", side: "hov" },
        lookFor: ["The yellow Sun marker on the chart, and the ITCZ label following it a little behind.", "The jets taking turns: strong in winter, weak in summer."],
        basic: "With the date running, the heating's centre travels between the tropics and the circulation follows, a week or more behind, because the surface takes time to warm up and cool down.",
        deeper: "Measured: with 30 days of surface heat storage the ITCZ swings between about 19°N and 19°S. Over the real Pacific it stays mostly north of the equator all year (lesson 7 shows why: the sea's warmest water is there).",
        expert: "For a slab of response time τ forced at the annual frequency ω, the lag is arctan(ωτ)/ω: about 28 days for τ = 30 days.",
        tryIt: [{ param: "inertiaDays", label: "Surface heat storage", min: 5, max: 120, step: 5, unit: " days", expect: "More storage: a smaller, later swing." }],
        metric: { id: "itcz", label: "ITCZ today", unit: "°", target: [-22, 22], tol: 50 },
      },
      {
        id: "tilt", title: "No tilt, big tilt (explore)",
        set: { seasons: true, tilt: 0, day: 80 }, start: "settled", camera: "cutaway",
        view: { slab: true, labels: true, arrows: false, speed: 15, exag: 100, vex: 200, sun: true, chart: "uPsi", side: "hov" },
        lookFor: ["With no tilt the ITCZ stays on the equator all year.", "Tilt it to 45° or more: huge seasons, the ITCZ swinging far."],
        basic: "No tilt, no seasons: the Sun stays over the equator every day. Tilt the axis more and the seasons get bigger; past about 54° the poles get more sunlight over a year than the equator does.",
        deeper: "Uranus is tilted 98°: each pole has 42 years of daylight then 42 of darkness. Earth's tilt wobbles between 22.1° and 24.5° over 41,000 years, one of the pacemakers of the ice ages.",
        expert: "Annual-mean insolation at the poles grows with sin(obliquity); the equator's falls. They cross near 54°.",
        tryIt: [{ param: "tilt", label: "Axis tilt", min: 0, max: 90, step: 5, unit: "°", expect: "0°: no seasons; 23°: Earth; 90°: the poles take turns facing the Sun." }],
        metric: { id: "itcz", label: "ITCZ today", unit: "°", target: [-3, 3], tol: 50 },
      },
      {
        id: "storage", core: true, title: "Heat storage sets the size and lag of the seasons",
        set: { seasons: true, inertiaDays: 10, day: 80 }, start: "settled", camera: "cutaway",
        view: { slab: true, labels: true, arrows: false, speed: 15, exag: 100, vex: 200, sun: true, chart: "uPsi", side: "hov" },
        lookFor: ["With 10 days of storage (land-like) the ITCZ keeps close behind the Sun.", "Switch to 90 days (ocean-like): a smaller swing, well behind the Sun."],
        basic: "Land holds little heat, so it warms and cools quickly. The ocean stirs heat down through tens of metres of water and responds slowly. So land climates have big seasons soon after the Sun's, and ocean climates have mild seasons that come late.",
        deeper: "Measured: 10 days of storage swings the ITCZ to 19° and turns it back about 9 days after the solstice; 90 days only to about 15°, and the winter jet peaks near 77 m/s instead of 100.",
        expert: "A mixed layer 50 m deep holds C = ρ c h ≈ 2 × 10⁸ J m⁻² K⁻¹; with a radiative and turbulent damping of about 20 W m⁻² K⁻¹ that's a response time of about 120 days.",
        onWater: "Why the North Pacific is warmest in August and September, a month or two after the longest day, and why Hawaiʻi's seasons are so mild.",
        tryIt: [{ param: "inertiaDays", label: "Surface heat storage", options: [[10, "land-like (10 days)"], [30, "between (30 days)"], [90, "ocean-like (90 days)"]], expect: "More storage: a smaller, later swing." }],
        metric: { id: "itcz", label: "ITCZ today", unit: "°", target: [-22, 22], tol: 50 },
      },
    ],
  },
  {
    id: "storms", title: "5. Storms make the rest (the 3-D model)",
    recap: "storms that grow by themselves, the wind round highs and lows, the storms' heat transport (about 17 K m/s, Earth's 15–20), the Ferrel cell and westerlies at the ground.",
    quiz: [{ q: "Where does the Ferrel cell come from?", options: ["The Sun heats 60° latitude", "It's what the storms' heat and momentum transport look like when averaged", "Mountains"], correct: 1, why: "Nothing drives it directly: it's the average of the storms." }, { q: "In the northern hemisphere, which way does the wind circle a low?", options: ["Clockwise", "Counter-clockwise", "Straight into it"], correct: 1, why: "Counter-clockwise, nearly along the isobars, crossing them slightly toward the low near the ground. With your back to the wind, the low is on your left." }],
    steps: [
      {
        id: "meet-3d", core: true, title: "Meet the 3-D model",
        model: "3d", set: {}, start: "spunup", from: "aqua", camera: "globe-tilted",
        view: { labels: true, textbook: false, speed: 1, exag: 30, vex: 100, fill: "tlow", mean: false, sun: false, flow: false, band: "low", chart: "uPsi" },
        lookFor: ["Colour on the globe: the temperature near the ground, now varying with longitude: waves and swirls along 40–60°.", "H and L labels on the highs and lows, which the 2-D model could never have."],
        basic: "Everything so far was averaged round the planet: every longitude the same. This model lets every longitude differ. It's a real (if coarse) global atmosphere: the same equations weather models solve, on a grid of 64 × 32 points and 6 levels, heated by the same sunlight. With that freedom, the jet can break into storms.",
        deeper: "What's new on the screen: a colour on the globe (temperature near the ground, temperature higher up, or sea-level pressure, chosen below or under All settings); H and L labels found from the model's pressure; optional flow lines of the wind near the ground; and a chart that can show the circulation right now or averaged over the last 30 days (the cells only show in the average: any one day is mostly storms). It starts from a state saved after a year of model time, so the storms are already going. It's dry, with no land, as an ocean planet: the next lessons add the continents, the real sea, mountains and water one at a time.",
        expert: "Spectral primitive equations in σ coordinates (vorticity, divergence, temperature, ln p_s), truncated at total wavenumber 21 (T21) on a 64 × 32 Gaussian grid, 6 equally spaced σ levels; semi-implicit time stepping (1-hour steps); ∇⁸ hyperdiffusion; forcing after Held & Suarez (1994): Newtonian relaxation toward a zonally symmetric equilibrium temperature (40 days aloft, 4 at the surface in the tropics) and Rayleigh friction below σ = 0.7 (1 day at the surface).",
        tryIt: [{ view: "fill", label: "Colour on the globe", options: [["tlow", "temperature near the ground"], ["tmid", "temperature at about 4 km"], ["ps", "sea-level pressure"]], expect: "Pressure shows the highs and lows; temperature, the warm and cold air they swap." }],
        metric: { id: "eke", target: [20, 120], tol: 10 },
      },
      {
        id: "growth", core: true, title: "The jet breaks into storms",
        forecast: "weather-now",
        model: "3d", set: {}, start: "held", camera: "npac-globe",
        view: { labels: true, textbook: false, speed: 1, exag: 30, vex: 100, fill: "tlow", mean: false, sun: false, flow: false, band: "low", chart: "uPsi", side: "eke" },
        predict: "The 3-D model starts like the 2-D one: still air and a smooth temperature change from equator to pole, plus a ripple of a few tenths of a degree. Will it stay smooth?",
        predictOptions: ["It stays smooth", "The ripple grows into storms within weeks", "It slowly calms down"], predictAnswer: 1,
        reveal: "No: the storm energy (right-hand panel, log scale) creeps, then climbs in a straight line, doubling every day or two, then levels off; the smooth temperature edge breaks into waves and swirls.",
        lookFor: ["The number (storm energy) creeping up, then shooting up, then levelling off.", "The temperature edge near 45° wobbling into waves, then curling into swirls with highs and lows."],
        basic: "The 3-D model starts like the 2-D one: still air, then a Hadley cell and a smooth jet. But a tiny ripple grows, doubling every day or two, until the jet breaks into the swirling highs and lows of mid-latitude weather. The 2-D model couldn't do this; that's why it had no Ferrel cell.",
        deeper: "The storms grow by feeding on the energy stored in the equator–pole temperature difference (baroclinic instability): warm air rises and slides poleward, cold air sinks and slides equatorward. Their size, about 4,000 km from one low to the next, is set by Earth's spin and how stable the air is. Watch the chart's storm-energy panel: on its logarithmic scale, steady doubling is a straight line.",
        expert: "Eady growth rate σ ≈ 0.31 f Λ / N: with f = 10⁻⁴ s⁻¹, shear Λ = 3 × 10⁻³ s⁻¹, N = 0.012 s⁻¹, an e-folding time of about 1.5 days and a fastest-growing wavelength near 4,500 km (zonal wavenumber about 6 at 45°). Rossby radius NH/f ≈ 1,200 km. The model: T21 spectral, 6 σ levels, Held–Suarez forcing.",
        metric: { id: "eke", target: [5, 400], tol: 5 },
      },
      {
        id: "lows-highs", core: true, title: "Highs, lows and the wind round them",
        forecast: "lows-jet",
        model: "3d", set: {}, start: "spunup", from: "aqua", camera: "pac-map",
        view: { labels: true, speed: 1, exag: 30, vex: 100, fill: "ps", mean: true, flow: true, band: "low" },
        lookFor: ["Flow lines circling each L counter-clockwise and each H clockwise in the north.", "In the southern hemisphere, the other way round."],
        basic: "Air heads for low pressure, but the Coriolis effect turns it until it flows almost along the isobars, round the low: counter-clockwise round lows and clockwise round highs in the north. The closer the isobars, the stronger the wind.",
        deeper: "A 4 hPa change across 300 km at 45° gives a wind of about 11 m/s (21 kt). Near the ground friction slows the wind and lets it cross the isobars a little toward the low, which is how lows fill and highs spread out.",
        expert: "Geostrophic wind V_g = (1/ρf) ∂p/∂n. With linear drag k the wind crosses the isobars at α = arctan(k/f). The number is the measured mean crossing angle of the lowest level's wind, 30–60°N: about 6° here; real surface winds cross at 10–20° over the sea and 20–40° over land (this model's lowest level is about 700 m up, above most of the friction layer).",
        onWater: "Tightly packed isobars mean a gale. With your back to the wind in the northern hemisphere, the low is on your left.",
        tryIt: [{ view: "fill", label: "Colour on the globe", options: [["ps", "sea-level pressure"], ["tlow", "temperature near the ground"]], expect: "The lows sit where warm and cold air meet." }, { param: "rotation", label: "Spin (× Earth's)", min: 0.5, max: 2, step: 0.5, unit: "×", expect: "Faster spin: smaller, more numerous storms." }],
        metric: { id: "crossAngle", target: [3, 25], tol: 1, earth: 15 },
      },
      {
        id: "fronts", title: "Storms swap warm and cold air",
        forecast: "fronts",
        model: "3d", set: {}, start: "keep", fallback: "spunup", from: "aqua", camera: "pac-map",
        view: { labels: true, fill: "tlow", flow: true, band: "low", mean: true },
        lookFor: ["A tongue of warm air carried poleward east of each low, and cold air carried equatorward west of it.", "The sharp edges between them: fronts."],
        basic: "Look east of a low: warm air carried north. West of it: cold air carried south. Every storm swaps them, and together the storms carry most of the heat poleward in the mid-latitudes. The sharp edges between the air masses are fronts.",
        deeper: "In the mid-latitudes the storms (eddies) carry far more heat than the averaged cells do. The number is the storms' poleward heat flux near the ground, the average of (northward wind × temperature departure) round each latitude: about 17 K m/s here, close to Earth's 15–20.",
        expert: "Poleward eddy heat flux [v′T′]: Earth's peaks at about 15–20 K m/s near 850 hPa and 40–50° in northern winter (less in summer).",
        onWater: "A cold front passing: the wind veers (shifts clockwise), the temperature drops, squalls.",
        tryIt: [{ view: "fill", label: "Colour on the globe", options: [["tlow", "temperature near the ground"], ["ps", "sea-level pressure"]], expect: "Warm air east of each low, cold air west of it." }],
        metric: { id: "heatFlux", target: [3, 30], tol: 1, earth: 15 },
      },
      {
        id: "ferrel", core: true, title: "Averaged: the Ferrel cell and three belts appear",
        forecast: "lows-jet",
        model: "3d", set: {}, start: "keep", fallback: "spunup", from: "aqua", camera: "globe-tilted",
        view: { labels: false, textbook: true, fill: "none", mean: true, flow: false, band: "low", chart: "uPsi" },
        lookFor: ["In the chart: the Hadley cells either side of the equator, and beyond them Ferrel cells turning the other way, near the grey textbook loops.", "Westerlies at the ground at 40–55°."],
        basic: "Average a month of storms, all the way round the planet, and the textbook picture appears, made by the model itself: Hadley cells, then Ferrel cells turning the other way, and westerly winds at the ground in the mid-latitudes.",
        deeper: "Nothing drives the Ferrel cell directly: it's what the storms' heat and momentum transport look like when averaged. The polar cell is weak here, as in the standard benchmark (Held & Suarez 1994) this model follows.",
        expert: "In the transformed Eulerian mean (residual circulation) the Ferrel cell nearly vanishes: it's an artefact of averaging on fixed pressure (here σ) levels. Averaged along the air's own (isentropic) paths, each hemisphere has a single direct cell reaching toward the pole. A common mistake: the Ferrel cell isn't a loop that a parcel of air actually travels round.",
        metric: { id: "westN", target: [3, 12], tol: 0.5 },
        note: ({ cells }) => { const c = (n) => cells.filter((x) => x.name === n).map((x) => `${Math.abs(x.lat).toFixed(0)}°${x.lat >= 0 ? "N" : "S"}`).join(" and ") || "none yet"; return `Hadley cells at ${c("Hadley")}; Ferrel cells at ${c("Ferrel")}.`; },
      },
      {
        id: "westerlies", title: "The roaring forties",
        model: "3d", set: {}, start: "keep", fallback: "spunup", from: "aqua", camera: "world-map",
        view: { labels: false, fill: "none", mean: true, flow: false, band: "low", chart: "uPsi" },
        lookFor: ["The low particles moving east poleward of about 35°, and west (the trades) nearer the equator.", "In the chart, the jet now reaches down to the ground."],
        basic: "The 2-D model had no wind from the west at the ground in the mid-latitudes. With storms there is: the westerlies. On this ocean planet both hemispheres are alike; on Earth they're strongest in the Southern Ocean, the roaring forties, where no continents get in the way.",
        deeper: "The storms carry westerly momentum toward their jet high up and down to the ground, where friction balances it. This is the eddy-driven jet, separate from the subtropical jet at the Hadley cell's edge (on Earth they are often merged over the Pacific in winter).",
        expert: "Convergence of the eddy momentum flux [u′v′] in the upper troposphere, balanced by surface drag on the westerlies below.",
        onWater: "The clipper route: why the westerlies south of 40°S rarely let up.",
        tryIt: [{ param: "rotation", label: "Spin (× Earth's)", min: 0.5, max: 2, step: 0.5, unit: "×", expect: "Faster spin: smaller storms, and the westerlies may split into two jets." }],
        metric: { id: "westN", target: [3, 12], tol: 0.5 },
      },
    ],
  },
  {
    id: "continents", title: "6. Continents (the 3-D model)",
    recap: "land that swings hot and cold beside a steady sea: summer thermal lows and the winter Siberian high (both weaker than Earth's in this dry model).",
    quiz: [{ q: "Why is there high pressure over Siberia in winter?", options: ["Warm air rises there", "Cold, dense air piles up over the cold continent", "The Sun is overhead"], correct: 1, why: "Land loses its heat within days; the chilled air is dense, and the pressure at the ground rises." }],
    steps: [
      {
        id: "land-swing", title: "Land swings, the sea stays steady",
        model: "3d", set: { land: true, seasons: true, day: 197 }, start: "spunup", from: "jul", camera: "npac-globe",
        view: { labels: true, speed: 1, exag: 30, vex: 100, fill: "tlow", mean: true, sun: true, flow: false, band: "all", chart: "uPsi" },
        lookFor: ["Asia and North America warmer than the Pacific and Atlantic at the same latitude.", "The number: Asia minus the North Pacific near the ground, 40–60°N."],
        basic: "Land holds little heat: under the summer Sun it heats within days, while the ocean, stirring its heat down through tens of metres of water, warms slowly and lags by months. So in July the northern continents are much hotter than the oceans beside them, and in January much colder.",
        deeper: "On Earth the winter contrast is far larger than here: Siberia at −30 °C against about +5 °C over the North Pacific. Snow reflecting sunlight and dry, clear air losing heat to space make it stronger; this dry model has neither. Lesson 6's last step shows January.",
        expert: "The model's land relaxes to its surface target in 5 days, the sea in 100 (landDays, seaDays); land also has twice the friction.",
        metric: { id: "asiaPacT", target: [3, 25], tol: 1 },
      },
      {
        id: "monsoon", title: "Summer: thermal lows draw the sea air in",
        model: "3d", set: { land: true, seasons: true, day: 197 }, start: "keep", fallback: "spunup", from: "jul", camera: "pac-map",
        view: { labels: true, fill: "ps", flow: true, band: "low", mean: true },
        lookFor: ["A low over hot South Asia with flow lines spiralling into it.", "Higher pressure over the cooler subtropical Pacific."],
        basic: "Air over hot land is light and rises, so the pressure falls: a thermal low. Air flows toward it, turned counter-clockwise by the Coriolis effect, so sea air is drawn in over the land: in Asia, the summer monsoon's inflow.",
        deeper: "Real monsoons are much stronger because the moist sea air rains as it rises over the land, and the heat released by the condensing water heats the air further. This model is dry, so it shows only the skeleton of the monsoon.",
        expert: "The thermal low's depth scales with the land–sea heating contrast. On Earth, latent heating greatly strengthens the monsoon circulation; this dry step can't show that (lesson 9's \"Where it rains\" has a July option: this model's monsoon rain stays weak).",
        metric: { id: "monsoonPs", target: [-15, -2], tol: 1 },
      },
      {
        id: "siberian-high", core: true, title: "Winter: the Siberian high and the ocean lows",
        forecast: "big-picture",
        model: "3d", set: { land: true, seasons: true, day: 15 }, start: "spunup", from: "jan", camera: "npac-globe",
        view: { labels: true, fill: "ps", flow: true, band: "low", mean: true },
        lookFor: ["High pressure over Asia with air flowing out of it.", "Lows over the northern oceans: the Aleutian low here, and the Icelandic low in the Atlantic (turn the globe)."],
        basic: "In winter it's the other way round: the continents lose their heat within days, and the air over them chills, grows dense and piles up into high pressure, while the oceans, still holding summer's heat, keep lower pressure. Storms keep forming over the oceans: the North Pacific's winter storm factory.",
        deeper: "The real Siberian high reaches about 1035 hPa in January and the Aleutian low about 1000; this dry model's are weaker. Lessons 7 and 8 add the real sea temperatures and mountains.",
        expert: "The winter highs are shallow, cold-core features (a few km deep); aloft there's a trough over East Asia instead.",
        onWater: "Winter northwesterlies blowing cold air off Asia across the Sea of Japan; the Aleutian low steering the storms toward the Gulf of Alaska.",
        metric: { id: "asiaPacPs", target: [3, 30], tol: 1 },
      },
    ],
  },
  {
    id: "ocean", title: "7. The real ocean surface (the 3-D model)",
    recap: "the real sea: the warm pool, the cold tongue and the Walker circulation along the equator (a 2.2 hPa pressure see-saw, Earth's about 2–3).",
    quiz: [{ q: "Along the equator, where does the air rise in the Walker circulation?", options: ["Over the cold east Pacific", "Over the warm western Pacific", "Evenly everywhere"], correct: 1, why: "Over the warm pool; it sinks over the cool east and flows back west near the sea as the trades." }, { q: "In this model, is the sea temperature computed or observed?", options: ["Computed by the model", "Observed (NOAA), and fixed", "Random"], correct: 1, why: "It's the observed average for the month; the sea doesn't move or respond. Its east–west pattern is doubled in the heating (labelled)." }],
    steps: [
      {
        id: "whats-real", core: true, title: "What's real here, and what's the model",
        forecast: "ocean-anomaly",
        model: "3d", set: { land: true, sst: true, seasons: false, day: 263 }, start: "spunup", from: "jul", camera: "world-map",
        view: { labels: false, speed: 1, exag: 30, vex: 100, fill: "sst", mean: true, flow: false, band: "low", chart: "uPsi" },
        lookFor: ["The colour now is observed data: NOAA's average sea temperature for September (the key says OBSERVED DATA).", "The continents are the real coastlines on the model's grid."],
        basic: "From here on, the model sits on the real Earth's surface: observed sea temperatures, real continents and, later, real mountains and real El Niño years. The weather above them is still all the model's own. The key (ⓘ What am I looking at?) always says which is which.",
        deeper: "Real data: the sea-surface temperature (NOAA ERSST v5, the 1991–2020 average for each month), the sea in December 1997 and December 2010 (for El Niño and La Niña), mountain heights (NOAA ETOPO1) and coastlines (Natural Earth), all averaged onto the model's 5.6° grid. Invented or simplified: the \"radiation\" (a pull toward a set temperature, not real sunlight and infrared), no clouds, a sea that doesn't move or respond to the winds, no day and night. Two labelled boosts, in the dry lessons only: the sea's east–west pattern is doubled in the heating, and a stand-in heating over warm water replaces the heat of rain. Lesson 9 replaces both with real (model) rain and counts the pattern once.",
        expert: "The sea enters through the surface target temperature: T_s* = T_HS(φ) + G·(SST − ⟨SST⟩_sea(φ)) over the sea, G = 2 when dry and 1 with water vapour (whose rain the doubling stood in for), relaxed with a 100-day time scale (land 5 days). The stand-in (deepHeat): 0.4 K/day per K of that anomaly, × sin(π(1−σ)), tapered to zero by 30° latitude.",
        tryIt: [{ param: "day", label: "Month", options: [[263, "September"], [15, "January"], [197, "July"]], expect: "The warm water follows the Sun a little; the cold tongue is coldest in September." }],
        metric: { id: "sea", target: [2, 6.5], tol: 0.1 },
      },
      {
        id: "warm-pool", title: "Warm in the west, cool in the east",
        forecast: "ocean-anomaly",
        model: "3d", set: { land: true, sst: true, seasons: false, day: 263 }, start: "spunup", from: "jul", camera: "equator-map",
        view: { labels: false, speed: 1, exag: 30, vex: 100, fill: "sst", mean: true, flow: false, band: "low", chart: "eqSlice" },
        lookFor: ["Water of 29–30 °C west of the date line: the warm pool.", "The cooler strip along the equator east of about 150°W: the cold tongue, and the cold water off Peru."],
        basic: "Look at the colours along the equator: the real sea, NOAA's 1991–2020 average for September. The trade winds push warm surface water west and draw cold water up from below in the east. So the western Pacific is the warmest large stretch of ocean on Earth, and the equator in the east is cool. (This dry lesson doubles the pattern in the heating, a labelled boost for the missing heat of rain.)",
        deeper: "Along the equator the warm pool (130–160°E) is about 29.4 °C in September and the east Pacific (90–130°W) about 24.1 °C, a 5 K difference; in March only about 2 K, when the cold tongue is weakest. This model doesn't move the ocean: the sea's temperatures are fixed at the observed average for the month, and the air above feels them.",
        expert: "Bjerknes feedback: stronger trades → a deeper thermocline in the west and a shallower one, with more upwelling, in the east → a colder east → a stronger east–west pressure difference → stronger trades. The model has only the atmospheric half: the sea is prescribed (ERSST v5 on the model's grid, minus each latitude's mean over the sea, times a gain of 2).",
        tryIt: [{ param: "day", label: "Month", options: [[263, "September"], [80, "March"], [349, "December"]], expect: "The cold tongue is coldest in September, weakest in March." }],
        metric: { id: "sea", target: [2, 6.5], tol: 0.1 },
      },
      {
        id: "walker", core: true, title: "The Walker circulation",
        forecast: "rising",
        model: "3d", set: { land: true, sst: true, seasons: false, day: 263 }, start: "keep", fallback: "spunup", from: "jul", camera: "equator-map",
        view: { labels: false, fill: "rise", mean: true, flow: false, band: "low", chart: "eqSlice" },
        predictFill: "sst",
        predict: "Where along the equator will the air rise: over the warm west, or the cool east? And which way will the wind blow near the sea?",
        predictOptions: ["Over the warm west, with trade winds blowing toward it", "Over the cool east", "Evenly all along the equator"], predictAnswer: 0,
        reveal: "Over the warm west: the arrows rise west of the date line, flow east high up, sink over the cool east and return west near the sea, the trade winds.",
        lookFor: ["In the chart: arrows rising over the warm pool, flowing east high up (orange), sinking over the cool east, and back west near the sea (purple).", "On the map: green (rising) in the west, brown (sinking) in the east."],
        basic: "The same rule as lesson 0, turned sideways: warm sea heats the air and it rises; over cool water the air sinks. Along the equator that makes a loop: up over the warm pool, east high up, down over the cold east, and back west near the sea as the trade winds. Gilbert Walker found its pressure see-saw in the 1920s.",
        deeper: "Measured (September, 30-day mean): the pressure is 2.2 hPa higher over the east Pacific than over Indonesia (Earth's: about 2–3), the equatorial trades about 4 m/s (8 kt), and the wind high up over the east Pacific blows from the west at about 15 m/s. Switch the sea's pattern off (same month) and the see-saw vanishes, the trades drop to about 1 m/s and the westerlies aloft to about 1. An honest note: on Earth the rising air is driven by thunderstorms releasing heat as their water condenses. This lesson's model is dry, so it uses a labelled stand-in: heating through the lower and middle atmosphere over warm water, in proportion to how much warmer the sea is than its latitude's average (tropics only). Lesson 9 replaces it with water vapour and real (model) rain.",
        expert: "Gill (1980): an equatorial heat source drives a Kelvin-wave response to the east (easterlies at the surface) and Rossby gyres to the west. The stand-in: 0.4 K/day per K of the sea's anomaly, with a sin(π(1−σ)) profile peaking at mid-levels, tapered to zero by 30° (deepHeat). The pressure see-saw here is ps(80–130°W) − ps(90–140°E), 5°S–5°N.",
        onWater: "Steady trades across the central Pacific; light winds and squalls over the warm pool, where the air rises. This model can't make tropical cyclones (its grid is far too coarse): on Earth they form near the ITCZ and over warm water, in the eastern North Pacific from May to November.",
        tryIt: [{ param: "sst", label: "The real sea's pattern", options: ON_OFF, expect: "Off: the loop fades and the westerlies aloft disappear (it fast-forwards 40 days)." }],
        metric: { id: "soi", target: [0.5, 5], tol: 0.3 },
      },
      {
        id: "itcz-north", title: "Where the rising air sits",
        forecast: "trades",
        model: "3d", set: { land: true, sst: true, seasons: false, day: 263 }, start: "keep", fallback: "spunup", from: "jul", camera: "pac-map",
        view: { labels: false, fill: "rise", mean: true, flow: true, band: "low", chart: "eqSlice" },
        lookFor: ["Green bands of rising air over the warmest water: the western Pacific and a band north of the equator in the east.", "Flow lines near the sea converging into them."],
        basic: "The trades from both hemispheres meet where the sea is warmest, and that's where the air rises. Across the east Pacific the warmest water lies a few degrees north of the equator, so that is where the ITCZ sits for most of the year, while the cold equator under it stays clear.",
        deeper: "In this model the east Pacific's rising air sits at about 9°N in September (30-day mean), close to Earth's 8–10°N. Sailors crossing to the Marquesas meet the doldrums north of the line. The model's coarse grid (each box is 5.6° across) blurs it.",
        expert: "The sea's north–south asymmetry is made by ocean and atmosphere together: the wind–evaporation–SST feedback (Xie & Philander 1994), the tilt of the American coast and the low cloud off Peru. This model has the coastlines but no moving ocean or clouds, so it only feels the observed sea.",
        onWater: "Sailing advice, not model output: on a Hawaiʻi–Tahiti passage, make your easting in the NE trades before the doldrums, so the SE trades beyond don't set you west of Tahiti; the band moves from week to week, so check the forecast. Squalls cluster in the ITCZ, and tropical cyclones form near it over warm water (eastern North Pacific, May–November): this model can't make them.",
        tryIt: [{ param: "day", label: "Month", options: [[263, "September"], [80, "March"]], expect: "In March the band weakens and a second one may hint south of the equator." }],
        metric: { id: "itczEP", target: [2, 12], tol: 1, earth: 8 },
      },
    ],
  },
  {
    id: "mountains", title: "8. Mountains and the Pacific pattern (the 3-D model)",
    recap: "Tibet and the Rockies bending the westerlies: the jet off Japan (50 m/s here at the 40-day radiation, Earth's 70) and the winter pressure pattern of the North Pacific.",
    quiz: [{ q: "Where is the strongest jet on Earth in winter?", options: ["Over the Atlantic", "Just east of Japan", "Over the equator"], correct: 1, why: "Cold Asia beside the warm Pacific, with the mountains' fixed waves, puts the jet core off Japan." }],
    steps: [
      {
        id: "east-asian-jet", title: "Mountains bend the jet: the strongest jet on Earth",
        model: "3d", set: { land: true, sst: true, mountains: true, seasons: false, day: 15 }, start: "spunup", from: "jan", camera: "npac-globe",
        view: { labels: false, speed: 1, exag: 30, vex: 100, fill: "jet", mean: true, flow: false, band: "jet", chart: "uPsi" },
        lookFor: ["The jet strongest just off Japan (dark orange-brown), weakening toward North America.", "The jet-level particles dipping south over East Asia and riding north over western North America."],
        basic: "The westerlies can't flow straight through mountain ranges 3–5 km high. Flowing over Tibet and the Rockies they bend, and because the Earth spins, the bend becomes a wave that stays in place. Together with the cold continent beside the warm ocean, that puts the strongest jet on Earth just east of Japan in winter.",
        deeper: "Measured, January 30-day mean: the jet core off East Asia is about 51 m/s with the mountains and 40 without; on Earth it's about 70 m/s near 32°N, 140°E. At this resolution Tibet is smoothed to about 4–5 km in its highest grid box. The fixed waves also come from the land–sea heating of lesson 6; switching the mountains off shows how much is due to each.",
        expert: "Stationary Rossby waves: K_s = √(β/U); for U = 15 m/s at 45° the wavelength is about 6,000 km (zonal wavenumbers 4–5). Topographic forcing ∝ f₀ U·∇h / H. The model's mountains are ETOPO1 box means, spectrally smoothed; the σ coordinate follows them.",
        tryIt: [{ param: "mountains", label: "Mountains", options: ON_OFF, expect: "Off: the jet off Japan weakens (it fast-forwards 40 days)." }],
        metric: { id: "eaJet", target: [40, 75], tol: 1 },
      },
      {
        id: "aleutian", core: true, title: "The Aleutian low, the Siberian high and the Pacific high",
        forecast: "big-picture",
        model: "3d", set: { land: true, sst: true, mountains: true, seasons: false, day: 15 }, start: "keep", fallback: "spunup", from: "jan", camera: "pac-map",
        view: { labels: true, fill: "psMean", mean: true, flow: true, band: "low", chart: "uPsi" },
        lookFor: ["January: high pressure over Asia (the Siberian high) and a big low near the Aleutians.", "Switch to July: the Siberian high goes, the Aleutian low fills."],
        basic: "Winter storms keep forming where the jet leaves Asia, and they slow and deepen toward the Gulf of Alaska, so the month's average has a big low there: the Aleutian low. Cold, dense air piles up over Siberia. In summer both fade and the high over the cool eastern Pacific takes over.",
        deeper: "Measured, January (sea-level pressure, 30-day mean): Aleutian low about 988 hPa, Siberian high about 1025 (Earth: about 1000 and 1035; without the mountains the Siberian high is only about 1010). An honest miss: this model's July Pacific high is weak (about 1005 hPa, measured dry, against Earth's 1025). On Earth it's strengthened by air sinking west of the monsoons' rain, which a dry model can't make.",
        expert: "The Aleutian low is the storm track's exit plus the stationary-wave trough; the summer subtropical highs are reinforced by monsoon-driven descent (Rodwell & Hoskins 2001). Pressure is reduced to sea level over the mountains with the lowest level's temperature.",
        onWater: "Routing a Hawaiʻi–mainland passage around the Pacific High in summer; the Aleutian low's gales and long swells in winter.",
        tryIt: [{ param: "day", label: "Month", options: [[15, "January"], [197, "July"]], expect: "July: the Siberian high and the Aleutian low fade (40 days to the new balance)." }],
        metric: { id: "aleutian", target: [980, 1002], tol: 1 },
      },
    ],
  },
  {
    id: "moisture", title: "9. Water vapour and rain (the 3-D model)",
    recap: "water: rain that narrows the ITCZ and strengthens the Hadley cell (+30 %), heavy rain over the warm pool and a dry cold tongue, and a slightly stronger Siberian high. Misses: weak trades and a weak Asian monsoon.",
    quiz: [{ q: "Where does most rain fall?", options: ["Where air sinks, under the subtropical highs", "Where air rises: the ITCZ, storm tracks and monsoons", "Evenly everywhere"], correct: 1, why: "Rising air cools; its vapour condenses into cloud and rain." }, { q: "When this model's water vapour is switched on, what else changes?", options: ["Nothing else", "Its radiation relaxes faster (15 days instead of 40)", "The sea warms"], correct: 1, why: "The rain's heat must be radiated away. That's why the lessons here compare dry and moist at the same 15 days." }],
    steps: [
      {
        id: "moist-itcz", core: true, title: "Rain makes the ITCZ narrow and the Hadley cell strong",
        model: "3d", set: { moist: true, tauAirDays: 15, seasons: false, day: 80 }, start: "spunup", from: "aqua", camera: "globe-tilted",
        view: { labels: false, speed: 1, exag: 30, vex: 100, fill: "rain", mean: true, flow: false, band: "low", chart: "uPsi" },
        predictFill: "tlow",
        predict: "Back to the ocean planet, now with water. Switch water vapour off and on (below, at the same radiation): will the Hadley cell get stronger or weaker with rain, and will the rising air spread out or squeeze together?",
        predictOptions: ["Stronger, with the rising air squeezed into a narrow band", "Weaker and broader", "No change"], predictAnswer: 0,
        reveal: "Stronger and narrower: the rain falls in a thin band at the equator and its heat drives the cell about 30 % harder. (The trade winds, though, don't strengthen here: a miss.)",
        lookFor: ["A thin band of heavy rain right at the equator, dry belts either side, and rain again along the storm tracks.", "The number: the Hadley cell's strength, with water vapour and without."],
        basic: "Warm sea evaporates water; the trade winds carry the moist air to the equator; there it rises, cools and rains, releasing the heat the sea put in. That heat makes the rising air rise harder, but only where it rains, so the rising branch squeezes into a narrow band of towering clouds: the ITCZ. The stronger heating drives a stronger Hadley cell.",
        deeper: "Measured on the ocean planet at the equinox, 60-day means, both with the same 15-day radiation: the Hadley cell 9.2 × 10¹⁰ kg of air a second with water vapour against 7.1 dry (+30 %); rain about 6 mm/day within 3° of the equator and 0.4 in the subtropics (10–20°). An honest miss: the trades come out weaker with water (4.7 against 6.0 m/s), where on Earth the moist Hadley cell's trades are the strong ones; this model has no clouds and only 6 levels.",
        expert: "Latent heating concentrates ascent where boundary-layer moist static energy is highest; the gross moist stability of the tropical atmosphere (small and positive) sets how much circulation a given heating drives. Clausius–Clapeyron: saturation humidity rises about 7 % per kelvin, so the ITCZ's rain is very sensitive to the sea's temperature. The number is the strongest 30-day mean overturning within 35° at mid-levels.",
        tryIt: [{ param: "moist", label: "Water vapour and rain", options: ON_OFF, expect: "Off, at the same radiation: a weaker, broader cell and no rain (40 days to settle)." }, { view: "fill", label: "Colour on the globe", options: [["rain", "rain"], ["pwat", "water vapour in the column"], ["rise", "rising and sinking air"]], expect: "Water vapour is highest over the warm tropics; rain only where air rises." }],
        metric: { id: "hadleyPsi", target: [6, 14], tol: 0.3, earth: 9 },
      },
      {
        id: "rain", core: true, title: "Where it rains",
        forecast: "moisture",
        model: "3d", set: { land: true, sst: true, mountains: true, moist: true, tauAirDays: 15, seasons: false, day: 263 }, start: "spunup", from: "jul", camera: "world-map",
        view: { labels: false, speed: 1, exag: 30, vex: 100, fill: "rain", mean: true, flow: false, band: "low", chart: "uPsi" },
        lookFor: ["Heavy rain (blue to purple) over the warm western Pacific and the Maritime Continent, and along a band near the equator: the ITCZ.", "Dry belts (pale) under the subtropical highs and over the cold east Pacific; steadier rain along the mid-latitude storm tracks."],
        basic: "Now the model carries water. The warm sea evaporates water into the air; the winds carry it; where air rises it cools, the vapour condenses into cloud and rain, and that releases the heat the sea put in. So rain falls where air rises (the ITCZ, the storm tracks) and hardly at all where it sinks (the subtropical highs).",
        deeper: "Measured, September, 30-day mean: about 2.6 mm of rain a day averaged over the whole Earth (Earth's is about 2.7–3), 7.4 mm/day over the warm pool and 0.5 over the cold east Pacific equator. With water vapour on, the sea's pattern counts once (the dry lessons' doubling stood in for this rain). The model evaporates from the observed sea (it doesn't move), makes rain when a lifted parcel of air would be buoyant (convection, which dries the air to 70 % humidity over 2 hours) or when air is saturated, and drops it at once: no clouds, no drizzle evaporating on the way down. With water vapour on, the model's \"radiation\" works faster (15 days instead of 40), because the rain's heat has to go somewhere: on Earth the air sheds it by radiating to space, mostly from water vapour and clouds; this model mimics that by relaxing faster. In this lesson the dry comparisons use the same 15 days, so only the water differs.",
        expert: "Simplified moist physics after Frierson, Held & Zurita-Gotor (2006) and Frierson (2007), with Held–Suarez Newtonian cooling kept: specific humidity on the grid, semi-Lagrangian across and upwind in σ (never negative); bulk evaporation C_E = 1.3 × 10⁻³ (land a quarter as wet); simplified Betts–Miller convection relaxing T toward the parcel's moist ascent and q toward 70 % of its saturation over τ = 2 h, its heating set to the latent heat of its rain; large-scale condensation with no re-evaporation. Clausius–Clapeyron: saturation humidity rises about 7 % per kelvin.",
        tryIt: [{ view: "fill", label: "Colour on the globe", options: [["rain", "rain"], ["pwat", "water vapour in the column"], ["rise", "rising and sinking air"]], expect: "Water vapour is highest over the warm tropics; rain falls where the air rises." }, { param: "day", label: "Month", options: [[263, "September"], [15, "January"], [197, "July"]], expect: "The rain band follows the Sun a little. An honest miss: this model's Asian summer monsoon rain is weak (about 2.5 mm/day over South Asia in July, against Earth's 8–10)." }],
        metric: { id: "rainGlobal", target: [2, 4.5], tol: 0.1 },
      },
      {
        id: "rain-walker", title: "Rain drives the Walker circulation",
        forecast: "rising",
        model: "3d", set: { land: true, sst: true, mountains: true, moist: true, tauAirDays: 15, seasons: false, day: 263 }, start: "keep", fallback: "spunup", from: "jul", camera: "equator-map",
        view: { labels: false, fill: "rain", mean: true, flow: false, band: "low", chart: "eqSlice" },
        predictFill: "sst",
        predict: "Lesson 7 used a stand-in for the heat thunderstorms release. Now the heat comes from real (model) rain. Will the Walker circulation still appear?",
        predictOptions: ["Yes: the rain's heat drives the same loop", "No: it needs the stand-in", "It reverses, rising in the east"], predictAnswer: 0,
        reveal: "Yes: the rain piles up over the warm pool and its heat drives the same loop, rising in the west and sinking over the dry east, with no stand-in.",
        lookFor: ["Rain piled over the warm west, and the cold east dry.", "In the chart: rising arrows over the rain, the strong westerly (orange) high up over the east Pacific."],
        basic: "The warm pool evaporates the most water, so the most rain falls there, and its released heat lifts the whole column: the Walker loop's rising branch. Over the cold east Pacific little water evaporates, the air sinks and it hardly rains. The stand-in of lesson 7 has been replaced by the real mechanism.",
        deeper: "Measured, September: the westerly wind high up over the east Pacific about 23 m/s with the sea's pattern and 13 without, so the Walker loop's own share is about 10 m/s (reanalyses put Earth's total there at roughly 5–15 m/s, so the model's background westerly is too strong); rain over the warm pool 7.4 mm/day and 0.5 over the cold tongue (without the pattern the rain sits evenly along the equator, about 4 mm/day). An honest miss: with rain on, the equatorial trades stay weak here (under 1 m/s in September, about 1–3 in winter, against Earth's 5–7 all year): the model has no clouds, and its rain falls in single grid boxes about 600 km across.",
        expert: "The Walker circulation as the large-scale response to convective heating over the warm pool (Gill 1980); the SST pattern sets where boundary-layer moist static energy is high enough for convection (the weak-temperature-gradient view: in the tropics the free troposphere's temperature is nearly flat, so convection goes where the boundary layer is warmest and moistest).",
        tryIt: [{ param: "sst", label: "The real sea's pattern", options: ON_OFF, expect: "Off: the rain spreads along the whole equator and the westerlies aloft weaken." }],
        metric: { id: "upperEast", target: [12, 30], tol: 1, earth: 10 },
      },
      {
        id: "moist-winter", title: "Winter with water: the Siberian high",
        model: "3d", set: { land: true, sst: true, mountains: true, moist: true, tauAirDays: 15, seasons: false, day: 349 }, start: "spunup", from: "jan", camera: "npac-globe",
        view: { labels: true, fill: "psMean", mean: true, flow: true, band: "low", chart: "uPsi" },
        lookFor: ["A strong high over Siberia with air flowing out of it, and a deep low near the Aleutians.", "Switch water vapour off (the same radiation): the Siberian high weakens."],
        basic: "Rain matters even in winter. The storms crossing the oceans pick up water and rain it out, warming the air over the sea; the continent stays cold and dry. That sharpens the contrast, and the cold air over Asia piles up into a stronger high.",
        deeper: "Measured, December, 30-day means, both with the same 15-day radiation: the Siberian high about 1031 hPa with water vapour and 1026 without (Earth's about 1035). The jet off Japan is about 70 m/s either way (Earth's about 70): that came from the faster radiation, not the rain (at the 40-day radiation of the earlier lessons it's about 52). An honest miss: the Aleutian low comes out too deep, about 974 hPa against Earth's 1000; dry at the same radiation it's about 978, so that's mostly the faster radiation, not the water.",
        expert: "Latent heat release in the warm conveyor belts of extratropical cyclones adds to their growth (diabatic generation of low-level potential vorticity). The Siberian high is a shallow, cold-core feature; its strength depends on how cold the continental boundary layer gets relative to the ocean's.",
        tryIt: [{ view: "fill", label: "Colour on the globe", options: [["psMean", "sea-level pressure"], ["jet", "the jet's wind"], ["rain", "rain"]], expect: "The storm tracks' rain lies along the jet." }, { param: "moist", label: "Water vapour and rain", options: ON_OFF, expect: "Off, at the same radiation: a weaker Siberian high (40 days to settle)." }],
        metric: { id: "siberian", target: [1015, 1045], tol: 1, earth: 1035 },
      },
    ],
  },
  {
    id: "enso", title: "10. El Niño and La Niña (the 3-D model, with rain)",
    recap: "El Niño and La Niña: the rain and rising air shift with the warm water (less far than on Earth), the Walker loop weakens or strengthens. The North Pacific's response is too small to see in this model.",
    quiz: [{ q: "In an El Niño, where does the rain go?", options: ["Further west, to Indonesia", "East, following the warm water", "To the poles"], correct: 1, why: "The rain and its rising air follow the warm water east; the Walker loop weakens." }, { q: "La Niña's trade winds are…", options: ["weaker than normal", "stronger than normal", "from the west"], correct: 1, why: "Stronger trades, more upwelling of cold water in the east, rain piled in the far west." }],
    steps: [
      {
        id: "el-nino", core: true, title: "El Niño: the warm water moves east",
        forecast: "ocean-anomaly",
        model: "3d", set: { land: true, sst: true, mountains: true, moist: true, tauAirDays: 15, enso: "elnino1997", seasons: false, day: 349 }, start: "spunup", from: "jan", camera: "equator-map",
        view: { labels: false, speed: 1, exag: 30, vex: 100, fill: "sstAnom", mean: true, flow: false, band: "low", chart: "eqSlice" },
        lookFor: ["The observed warm water (red) along the central and east Pacific: December 1997.", "In the chart: the rising arrows moved east, and the westerly (orange) high up over the east Pacific weakened. Switch the colour to rain: it has followed the warm water."],
        basic: "Every few years the trades weaken, warm water sloshes east, and the east Pacific warms by a few degrees. The rain and its rising air follow the warm water east, and the Walker loop weakens. December 1997 was one of the strongest El Niños on record.",
        deeper: "The sea here is real (with water vapour on it counts once in the heating): December 1997 minus the 1991–2020 December average, +2.2 °C in the Niño 3.4 region (NOAA's index for that month was about +2.3). Measured, with water vapour on: the centre of the Pacific's rising air shifts east from about 171°E to 185°E (175°W), rain over the east Pacific equator rises by more than half (1.9 to 3.1 mm/day), and the westerly wind high up over the east Pacific drops from about 19 m/s to 15. The shift is smaller than Earth's, where in a strong El Niño the rain moves to the date line and beyond. To see the change as a map: choose \"a normal December\" in Try it, wait for AVERAGING to finish, press 📌 Pin as reference (top strip), switch back to El Niño, and colour the globe by \"rain minus the pinned reference\". An honest miss: on Earth the central Pacific trades weaken; here they don't (1.6 to 2.2 m/s). Atmosphere-only models given this sea do weaken them, so this is a shortcoming of this model's coarse grid and simple convection.",
        expert: "Bjerknes feedback with the ocean's half removed: only the atmosphere's response to a fixed SST anomaly. Convection shifts east because SST over the central Pacific crosses the ~27–28 °C threshold for deep convection. The rising-air longitude here is the ascent-weighted mean over 120°E–100°W at mid-levels, 5°S–5°N. Without water vapour (the dry stand-in) the shift is only 151°E → 166°E.",
        tryIt: [{ view: "fill", label: "Colour on the globe", options: [["sstAnom", "the sea vs normal (data)"], ["rain", "rain"], ["rise", "rising and sinking air"], ["diffRain", "rain minus the pinned reference"]], expect: "Rain and rising air follow the warm water east." }, { param: "enso", label: "The sea", options: [["elnino1997", "El Niño, Dec 1997"], [null, "a normal December"], ["lanina2010", "La Niña, Dec 2010"]], expect: "Each takes 40 days to settle; compare the number." }],
        metric: { id: "riseLon", target: [180, 215], tol: 3 },
      },
      {
        id: "la-nina", core: true, title: "La Niña: the opposite",
        model: "3d", set: { land: true, sst: true, mountains: true, moist: true, tauAirDays: 15, enso: "lanina2010", seasons: false, day: 349 }, start: "spunup", from: "jan", camera: "equator-map",
        view: { labels: false, speed: 1, exag: 30, vex: 100, fill: "sstAnom", mean: true, flow: false, band: "low", chart: "eqSlice" },
        lookFor: ["Cold water (blue) along the equator in the central and east Pacific: December 2010.", "The number: the equatorial trades, stronger than in a normal December."],
        basic: "In a La Niña the trades are stronger than usual, more cold water wells up in the east, and the warm water and its rain stay piled up in the far west. The Walker loop is at least as strong as normal.",
        deeper: "December 2010: −1.6 °C in Niño 3.4. Measured, with water vapour: equatorial trades about 3.8 m/s against 1.6 in a normal December (both weaker than Earth's); the rising air shifts west (about 161°E against 171°E) and the east Pacific equator stays dry (0.5 mm/day). La Niña winters tend to bring the Pacific Northwest a cold, wet, snowy winter and the US Southwest a dry one.",
        expert: "La Niña isn't a simple mirror of El Niño: its SST anomalies are smaller and sit further west, and the atmosphere responds less, because convection needs warm water (above about 27–28 °C) to switch on and the warm pool is already that warm.",
        tryIt: [{ param: "enso", label: "The sea", options: [["lanina2010", "La Niña, Dec 2010"], [null, "a normal December"], ["elnino1997", "El Niño, Dec 1997"]], expect: "Compare the trades." }],
        metric: { id: "eqTrades", target: [2.5, 8], tol: 0.3, earth: 7 },
      },
      {
        id: "teleconnection", title: "The North Pacific in an El Niño winter",
        model: "3d", set: { land: true, sst: true, mountains: true, moist: true, tauAirDays: 15, enso: "elnino1997", seasons: false, day: 349 }, start: "keep", fallback: "spunup", from: "jan", camera: "pac-map",
        view: { labels: true, fill: "psMean", mean: true, flow: false, band: "jet", chart: "uPsi" },
        lookFor: ["The Aleutian low's depth (the number), then switch to a normal December and compare.", "For a map of the change: pin the normal December (📌), switch back to El Niño, and colour the globe by \"sea-level pressure minus the pinned reference\"."],
        basic: "On Earth, moving the tropical rain east sends waves through the atmosphere that deepen the Aleutian low and stretch the jet toward California: El Niño winters often bring more storms to California and a milder, drier winter to the Pacific Northwest. In this model one month's weather swamps the effect: compare the number with a normal December, and see Go deeper for why that's not enough.",
        deeper: "Measured on single 30-day means, with water vapour: the Aleutian low about 957 hPa in the El Niño December against 974 in a normal one, deeper as on Earth. But this model's Aleutian low wanders by 20 hPa or more from one month to the next even with nothing changed (974 in December, 952 in January), so one month can't tell the signal from the noise, and its Aleutian low is too deep anyway (Earth's is about 1000 hPa). An honest result: it needs many winters, or a better model, to say. On Earth the signal shows clearly only when many winters are averaged.",
        expert: "The Pacific–North American (PNA) pattern: a Rossby wave train from the upper-level divergence over the shifted heating, along a great circle (Hoskins & Karoly 1981). A clean test needs 90-day means over several runs with different random ripples (backlog).",
        onWater: "A stormier California coast and bigger winter swells reaching Hawaiʻi's north shores in strong El Niño winters.",
        tryIt: [{ param: "enso", label: "The sea", options: [["elnino1997", "El Niño, Dec 1997"], [null, "a normal December"], ["lanina2010", "La Niña, Dec 2010"]], expect: "Compare the Aleutian low's depth; remember the noise." }],
        metric: { id: "aleutian", target: [945, 975], tol: 1, earth: 1000 },
      },
    ],
  },
  {
    id: "home", title: "11. Bring it home",
    recap: "everything together, and where to look for it in today's real forecast.",
    quiz: [{ q: "Which of these does this model get closest to Earth?", options: ["The jet off Japan in winter (about 70 m/s)", "The winter Aleutian low", "The summer Pacific High"], correct: 0, why: "The jet matches Earth's; the Aleutian low is far too deep (about 950–975 hPa against 1000) and the July Pacific High far too weak (about 1005 against 1025). For those, use the Forecast mode." }],
    steps: [
      {
        id: "home", core: true, title: "The full model's Pacific, and the real one",
        forecast: "big-picture",
        model: "3d", set: { land: true, sst: true, mountains: true, moist: true, tauAirDays: 15, seasons: false, day: 15 }, start: "spunup", from: "jan", camera: "pac-map",
        view: { labels: true, fill: "psMean", mean: true, flow: true, band: "low", chart: "uPsi" },
        lookFor: ["Everything together in January's 30-day mean pressure: the Siberian high over Asia, the Aleutian low (too deep here), the subtropical high to the south, and flow lines spiralling round them.", "Then press \"See it in today's real forecast\" and find the same features in today's real weather."],
        basic: "This is the whole model: sunlight, spin, tilt, continents, the real sea, the mountains and water, in January. Each piece you added put something on the map. Now open the Forecast mode and look for them in today's real Pacific: the Pacific High, the Aleutian low (in winter), the trades around Hawaiʻi and the jet coming off Japan.",
        deeper: "Measured, January: Siberian high about 1029 hPa (Earth about 1035), the jet off Japan about 70 m/s (Earth about 70), rain about 2.9 mm/day over the whole Earth (Earth about 2.7–3). Its biggest errors: the Aleutian low (the number here) is about 952 hPa, far deeper than Earth's 1000, and the summer Pacific High is far too weak. What the model lacks: clouds and real radiation, an ocean that moves, and resolution (each grid box is about 600 km across). That's why its numbers are only roughly Earth's, and why forecasters use models with grid boxes of about 9–13 km (ECMWF, GFS) and full physics.",
        expert: "The model: T21 spectral primitive equations, 6 σ levels, Held–Suarez forcing with a seasonal, land–sea surface, the ERSST v5 sea and ETOPO1 mountains, simplified Frierson moist physics, semi-implicit 1-hour steps. GFS runs at about 13 km with 127 levels and full physics.",
        metric: { id: "aleutian", target: [950, 980], tol: 1, earth: 1000 },
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

// The principles behind the lessons (panel review round 2: "a principles glossary"): each rule in one plain sentence,
// its equation, and the steps where it's seen ([lesson id, step id]).
export const SIM_PRINCIPLES = [
  { name: "Warm air is taller (hydrostatic balance)", plain: "Pressure falls with height more slowly in warm air than in cold, so a warm column of air is taller, and high up its pressure is higher than over cold air at the same height.", eq: "∂p/∂z = −ρg; the thickness between two pressures Δz = (R T̄ / g) ln(p₁/p₂)", seen: [["sunlight", "pressure-aloft"]] },
  { name: "Pressure pushes", plain: "Air is pushed from high pressure toward low; the steeper the change, the harder the push.", eq: "acceleration = −(1/ρ) ∇p", seen: [["sunlight", "release"]] },
  { name: "Earth's spin turns moving air (Coriolis)", plain: "On a spinning planet, moving air is turned to the right of its path in the northern hemisphere and to the left in the southern; it doesn't push air at rest, and it's zero at the equator.", eq: "−f k̂ × v, with f = 2Ω sin(latitude)", seen: [["spin", "coriolis"]] },
  { name: "Spin is kept (angular momentum)", plain: "Air carried toward the pole keeps its spin about Earth's axis, so it speeds up eastward, like a skater pulling in their arms: the source of the subtropical jet.", eq: "M = a cos φ (Ω a cos φ + u) conserved → u = Ω a sin²φ / cos φ from the equator", seen: [["spin", "jet"], ["spin", "edge"]] },
  { name: "Thermal wind", plain: "Wherever temperature changes with latitude, the west wind increases with height: jets sit above the strongest temperature contrasts.", eq: "f ∂u/∂z = −(g / T) ∂T/∂y", seen: [["spin", "jet"], ["seasons", "solstice"]] },
  { name: "Wind along the isobars (geostrophic balance), crossing them near the ground", plain: "Away from the ground the pressure push and the Coriolis turning balance, so the wind blows along the isobars, round lows and highs; friction near the ground tilts it a little toward low pressure.", eq: "V_g = (1/ρf) ∂p/∂n; crossing angle ≈ arctan(friction / f)", seen: [["storms", "lows-highs"]] },
  { name: "The jet is unstable (baroclinic instability)", plain: "A strong equator–pole temperature contrast stores energy; small ripples in it grow, by warm air rising poleward and cold air sinking equatorward, into the storms that carry heat poleward.", eq: "Eady growth rate ≈ 0.31 f (∂u/∂z) / N", seen: [["storms", "growth"], ["storms", "fronts"], ["storms", "ferrel"]] },
  { name: "Heat storage sets the seasons' size and lag", plain: "Land stores little heat and follows the Sun within days; the ocean stores a lot and responds slowly and late.", eq: "C dT/dt = forcing − λ(T − T_eq); response time C/λ; lag ≈ arctan(ωτ)/ω", seen: [["seasons", "storage"], ["continents", "land-swing"]] },
  { name: "Rain heats the air (latent heat)", plain: "Water evaporated from the sea carries the sea's heat; when rising air cools and the vapour condenses into rain, that heat is released, driving the rising air harder where it rains.", eq: "heating = L × condensation; saturation humidity rises about 7 % per kelvin (Clausius–Clapeyron)", seen: [["moisture", "moist-itcz"], ["moisture", "rain-walker"]] },
  { name: "Obstacles and heating sources make standing waves (Rossby waves)", plain: "Because the Coriolis effect grows toward the poles, air displaced north or south is pushed back, so mountains and warm or cold patches set up waves in the westerlies that stay in place or travel far.", eq: "stationary wavenumber K_s = √(β / U), β = df/dy", seen: [["mountains", "east-asian-jet"], ["enso", "teleconnection"]] },
];
