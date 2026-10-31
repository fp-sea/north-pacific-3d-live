// Height units: km or feet (user request: heights in both). The data are in
// metres; this only formats. 1 m = 3.28084 ft (international foot).
// No imports, so node --test loads it.

export const FT_PER_M = 3.28084;

// "5.6 km" or "18,400 ft" (feet rounded to 100 -- the model's heights aren't
// better than that, and it reads like an aviation altitude).
export function fmtHeight(m, unit = "km", kmDigits = 1) {
  if (!Number.isFinite(m)) return "–";
  if (unit === "ft") return `${(Math.round((m * FT_PER_M) / 100) * 100).toLocaleString("en-US")} ft`;
  return `${(m / 1000).toFixed(kmDigits)} km`;
}

// Both, primary first: "5.6 km · 18,400 ft".
export const fmtHeightBoth = (m, unit = "km") => (unit === "ft"
  ? `${fmtHeight(m, "ft")} · ${fmtHeight(m, "km")}`
  : `${fmtHeight(m, "km")} · ${fmtHeight(m, "ft")}`);

// Rough pressure (mb) at height zM by the standard atmosphere, rounded to
// 5 mb: p = 1013.25 (1 - z / 44330.8)^(1 / 0.190263). A guide to "which
// level is this", not the day's value: real pressure levels ride up and down
// by a few hundred metres with the weather (user request, 2026-09-28).
export function stdPressureMb(zM) {
  if (!Number.isFinite(zM)) return NaN;
  return Math.round((1013.25 * Math.pow(Math.max(0, 1 - zM / 44330.8), 1 / 0.190263)) / 5) * 5;
}

// Wave heights in metres or feet (user request, 2026-09-28), primary first:
// "3.2 m (10 ft)" or "10 ft (3.2 m)". Feet to the nearest foot, metres to 0.1.
export function fmtWave(m, unit = "m") {
  if (!Number.isFinite(m)) return "–";
  const M = `${m.toFixed(1)} m`, F = `${Math.round(m * FT_PER_M)} ft`;
  return unit === "ft" ? `${F} (${M})` : `${M} (${F})`;
}

// Ruler / axis ticks in the chosen unit up to topM (m): [{m, label}], the
// step chosen from a fixed list so ticks are >= minPx apart on screen.
export function heightTicks(topM, unit, pxPerM, minPx = 16) {
  const steps = unit === "ft" ? [1000, 2000, 5000, 10000, 20000, 40000].map((f) => f / FT_PER_M) : [1000, 2000, 4000, 6000, 12000];
  const step = steps.find((s) => s * pxPerM >= minPx) ?? steps[steps.length - 1];
  const out = [];
  for (let m = 0; m <= topM + 1e-6; m += step) {
    const label = m === 0 ? "0" : unit === "ft" ? `${Math.round((m * FT_PER_M) / 1000)}k ft` : `${Math.round(m / 1000)} km`;
    out.push({ m, label });
  }
  return out;
}
