// From today's lessons (todayfind.js: the features found in this week's forecast) to the past year's case studies of
// the same kind (backlog, pattern library phase B): the week's deepest low to the bombs and windstorms, a tropical
// cyclone to the hurricanes and the typhoons that reached the Bering Sea, the moisture plume to the atmospheric rivers,
// the trades to Hawaiʻi's trade-wind cases, the biggest seas to the swell cases. No link for the jet: no case is about
// one. Pure, no imports.

// today's lesson id -> {patterns, cases, compare}
export const TODAY_CASE_LINKS = {
  low: { patterns: ["windstorm"], cases: ["bering-jan-2026"], compare: "how deep it got and how fast it fell" },
  tc: { patterns: ["hurricane"], cases: ["halong-2025", "dujuan-2026"], compare: "its track, and whether the westerlies catch it" },
  moisture: { patterns: ["ar"], compare: "how much water vapour, how long it aims at one coast" },
  trades: { patterns: ["strongtrades", "trades"], compare: "the high to the north and the squeeze in the channels" },
  waves: { patterns: ["nwswell", "southswell"], cases: ["bering-jan-2026"], compare: "where the storm was, and how far its swell travelled" },
};

// The cases a today lesson links to, in the order of CASES: [{case, compare}]. cases: cases.js CASES.
export function todayCaseLinks(lessonId, cases) {
  const L = TODAY_CASE_LINKS[lessonId];
  if (!L) return [];
  return cases.filter((c) => (L.cases ?? []).includes(c.id) || (c.patterns ?? []).some((p) => (L.patterns ?? []).includes(p)))
    .map((c) => ({ case: c, compare: L.compare }));
}
