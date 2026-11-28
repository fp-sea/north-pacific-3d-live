// Words a student trips on, defined where they appear (expert panel review 2026-10-14: "a glossary is the biggest
// remaining blocker for students"). glossify(html) marks the first appearance of each term in a step's text as a
// focusable term the page shows the definition of on tap, click or hover (title tooltips don't work on phones). The
// same list is printed in the guide. Pure, no imports.

// [pattern source (case-insensitive, whole words), the term as listed, definition]
export const GLOSSARY = [
  ["850 mb", "850 mb", "The level in the atmosphere where the pressure is 850 mb, about 1.5 km up. Its temperature shows how warm or cold an air mass is, away from the ground's daily ups and downs."],
  ["500 mb", "500 mb", "The level where the pressure is 500 mb, about 5.5 km up and halfway through the atmosphere by weight. It sits lower over cold air (troughs) and higher over warm air (ridges); storms are steered along it."],
  ["hPa", "hPa", "Hectopascal, the unit of air pressure, the same as a millibar (mb). Sea-level pressure averages about 1013 hPa; lows are lower, highs higher."],
  ["isobars?", "isobar", "A line joining places with the same sea-level pressure. The wind blows roughly along the isobars, faster where they are close together."],
  ["kt", "kt (knot)", "A knot is one nautical mile an hour: about 1.15 mph or 1.85 km/h. Sailors and forecasters measure wind in knots."],
  ["UTC", "UTC", "Coordinated Universal Time, the clock forecasters use everywhere. Pacific daylight time is UTC − 7 hours, Pacific standard time UTC − 8, Hawaiʻi UTC − 10."],
  ["analys[ie]s", "analysis", "A model's best picture of the weather at one moment, built from all the observations it can get: not a forecast."],
  ["anomal(?:y|ies)", "anomaly", "The difference from normal: the value minus its 1991–2020 average for that place and date."],
  ["cut-off low", "cut-off low", "A low in the upper air that has broken away from the westerlies: with nothing to steer it, it drifts slowly and is hard to forecast."],
  ["troughs?", "trough", "A dip of lower pressure or lower heights, usually with cooler air, cloud and showers. On the 500 mb map, the contours dip toward the equator."],
  ["ridges?", "ridge", "A bulge of higher pressure or heights, usually with sinking air and dry, settled weather."],
  ["inversions?", "inversion", "A layer where the temperature rises with height instead of falling. It works as a lid: cloud, smoke and cold air stay trapped beneath it."],
  ["atmospheric rivers?", "atmospheric river", "A long, narrow band of very moist air moving fast toward a coast. Where mountains lift it, it can rain hard for days."],
  ["water vapour", "water vapour (on the map)", "All the water vapour above a place, given as the depth of water you'd get if it all rained out (mm or inches): also called precipitable water."],
  ["marine push", "marine push", "Cool, moist ocean air flowing inland when the interior heats up and its pressure falls: the Northwest's natural air conditioner."],
  ["convergence zone", "convergence zone", "A line where winds coming from different directions meet near the ground. The air has nowhere to go but up, so a narrow band of cloud and rain or snow forms along it. Puget Sound's forms north of Seattle when wind splits round the Olympics and meets again."],
  ["windward", "windward", "The side of a mountain or island facing the wind, where air is pushed up and rain falls."],
  ["leeward", "leeward", "The sheltered side of a mountain or island, away from the wind: usually drier and sunnier."],
  ["trade winds?", "trade winds", "The steady north-easterly to easterly winds of the tropics, blowing from the subtropical high toward the equator."],
  ["kona", "kona", "Hawaiian for leeward. Kona winds blow from the south or south-west, the opposite of the usual trades, bringing rain to the normally dry sides."],
  ["swell", "swell", "Waves that have travelled away from the storm that raised them: smooth, regular and long. The longer the period, the farther they've come."],
  ["dBZ", "dBZ", "The unit of radar reflectivity: how strongly rain, snow or hail reflect the radar beam. About 20 is light rain, 40 heavy rain, 55 and above hail."],
  ["jet stream", "jet stream", "A narrow river of strong wind about 10 km up, steering storms along its path."],
  ["gradient", "gradient", "How quickly something changes with distance. A tight pressure gradient (isobars close together) means strong wind."],
  ["HRRR", "HRRR", "NOAA's High-Resolution Rapid Refresh: a weather model with a 3 km grid, run every hour over the US."],
  ["RTMA", "RTMA", "NOAA's Real-Time Mesoscale Analysis: an hourly 2.5 km map of the weather at the surface, blending the stations and satellite with a short forecast."],
  ["MRMS", "MRMS", "NOAA's Multi-Radar Multi-Sensor system: the network of radars merged into one map."],
  ["GFS", "GFS", "NOAA's Global Forecast System, the global weather model behind this site's daily maps."],
];

const escape = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// Mark the first appearance of each term in html's text (never inside a tag, a link or an existing term).
// seen: a Set of terms already marked in this step, shared across the step's texts.
export function glossify(html, seen = new Set()) {
  const parts = html.split(/(<[^>]+>)/);
  let inLink = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.startsWith("<")) { if (/^<a[\s>]/i.test(p)) inLink++; else if (/^<\/a>/i.test(p)) inLink = Math.max(0, inLink - 1); continue; }
    if (inLink || !p.trim()) continue;
    let text = p;
    for (const [src, term, def] of GLOSSARY) {
      if (seen.has(term)) continue;
      const re = new RegExp(`(^|[^\\w-])(${src})(?![\\w-])`, "i");
      const m = text.match(re);
      if (!m) continue;
      seen.add(term);
      const at = m.index + m[1].length;
      // a placeholder keeps later terms from matching inside this one's markup
      const mark = `\u0000${seen.size}\u0000`;
      text = text.slice(0, at) + mark + text.slice(at + m[2].length);
      parts[i] = text;
      (parts.marks ??= []).push([mark, `<dfn class="gloss" tabindex="0" role="button" data-def="${escape(def)}" title="${escape(def)}">${m[2]}</dfn>`]);
    }
    parts[i] = text;
  }
  let out = parts.join("");
  for (const [mark, rep] of parts.marks ?? []) out = out.replace(mark, rep);
  return out;
}
