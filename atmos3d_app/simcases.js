// Bridges between the Simulate lessons and the case studies (backlog, pattern library phase B): a lesson step
// that builds an idea on the model planet links to the real days that show it, and a case links back to the
// steps that explain it. Each link names a weather pattern (cases.js PATTERNS: every case with that pattern) or
// particular cases (the North Pacific ones have no patterns), with a line on what to compare. Only links a case's own
// text supports: "The North Pacific in an El Niño winter" has none yet, as the 2026 El Niño's first winter is still to
// come. Pure, no imports.

// Simulate step id (simlessons.js; ids are unique across lessons) -> {patterns, cases, compare}
export const SIM_CASE_LINKS = {
  "coriolis": { patterns: ["windstorm"], compare: "a real storm's wind blowing round its low, not straight into it" },
  "lows-highs": { patterns: ["windstorm", "ridge"], compare: "a real deep low and a real stuck high: which way the wind goes round each" },
  "growth": { patterns: ["windstorm"], compare: "a real storm growing out of a wave on the jet in a day or two" },
  "fronts": { patterns: ["front", "arctic"], compare: "real cold air pushing in behind a front" },
  "trades": { patterns: ["trades", "strongtrades"], compare: "the real trade winds over Hawaiʻi, and what squeezes them stronger" },
  "edge": { patterns: ["trades"], compare: "the sinking air at the cell's edge: the real trade-wind inversion over Hawaiʻi" },
  "land-swing": { patterns: ["heat"], compare: "how far a real heat wave pushes the land's temperature, and how little the sea's" },
  "monsoon": { patterns: ["marine"], compare: "a real thermal low inland drawing cool sea air in: the Northwest's marine push" },
  "siberian-high": { patterns: ["arctic"], cases: ["alaska-cold-2026"], compare: "real Arctic air pouring out of a cold winter high" },
  "aleutian": { cases: ["bering-jan-2026", "alaska-cold-2026"], compare: "a real stormy winter in the Bering Sea (a parade of deep lows), and a winter when a block took their place" },
  "east-asian-jet": { cases: ["halong-2025", "dujuan-2026"], compare: "real typhoons caught by the westerlies and carried north-east" },
  "rain": { patterns: ["ar", "hiflood"], compare: "real rain where moist air is lifted: up the coast's mountains, up Hawaiʻi's slopes" },
  "warm-pool": { cases: ["enso-2026"], compare: "the real equator: La Niña's cold tongue in the east, then the warm water spreading east" },
  "walker": { cases: ["enso-2026"], compare: "the real trade winds along the equator, through La Niña and into El Niño" },
  "el-nino": { cases: ["enso-2026"], compare: "the real El Niño of 2026: the warm water moving east" },
  "la-nina": { cases: ["enso-2026"], compare: "the La Niña winter that came before it" },
};

// The cases a Simulate step links to, in the order of CASES: [{case, compare}]. cases: cases.js CASES.
export function simCaseLinks(stepId, cases) {
  const L = SIM_CASE_LINKS[stepId];
  if (!L) return [];
  return cases.filter((c) => (L.cases ?? []).includes(c.id) || (c.patterns ?? []).some((p) => (L.patterns ?? []).includes(p)))
    .map((c) => ({ case: c, compare: L.compare }));
}
