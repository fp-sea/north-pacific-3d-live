// Honest time labels (BUILD_SPEC §2 invariant 5, §4 "In the browser"): where
// the page opens, what each moment on the timeline is (which real run, how
// far from now), and the markers under the slider. Pure functions of the
// manifest and the browser clock -- no imports, so node --test can load them.
//
// Hours are counted from manifest.anchor (the GFS init), as on the timeline.

export const STALE_AFTER_H = 30;

export const hoursFrom = (anchorIso, iso) => (Date.parse(iso) - Date.parse(anchorIso)) / 3600e3;

// "28/00Z" for an ISO time on the hour.
export const runTag = (iso) => `${iso.slice(8, 10)}/${iso.slice(11, 13)}Z`;

export const fmtUtc = (ms) => new Date(ms).toLocaleString("en-US", {
  timeZone: "UTC", weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
}) + " UTC";

// The same moment in the viewer's own time zone (user request, 2026-09-29:
// UTC and local time both at the top): "Mon, Sep 28, 3:40 PM PDT". null when
// the zone is UTC itself (nothing to add). timeZone: for tests; the page
// passes nothing and gets the browser's zone.
export function fmtLocal(ms, timeZone = undefined) {
  const tz = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!tz || /^(UTC|Etc\/UTC|Etc\/GMT|GMT)$/.test(tz)) return null;
  return new Date(ms).toLocaleString("en-US", {
    timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
}

// Displayed time relative to now: "now", "now −5h 20m", "now +2d 3h".
export function relNow(h, nowH) {
  const mins = Math.round((h - nowH) * 60);
  if (Math.abs(mins) < 10) return "now";
  const sign = mins < 0 ? "−" : "+", m = Math.abs(mins);
  const d = Math.floor(m / 1440), hh = Math.floor((m % 1440) / 60), mm = m % 60;
  if (d) return `now ${sign}${d}d${hh ? ` ${hh}h` : ""}`;
  return `now ${sign}${hh}h${mm ? ` ${String(mm).padStart(2, "0")}m` : ""}`;
}

// Where the page opens: now, clamped to the timeline, with a note when clamped.
export function openAt(nowH, start, end) {
  if (nowH > end) return { pos: end, note: "Now is past the end of this build's forecast — showing its last step." };
  if (nowH < start) return { pos: start, note: "Now is before the start of this build's timeline — showing its first step." };
  return { pos: nowH, note: null };
}

// How old the build is (hours) and whether to say so.
export function staleness(generatedIso, nowMs) {
  const age = (nowMs - Date.parse(generatedIso)) / 3600e3;
  return { ageH: age, stale: age > STALE_AFTER_H, text: `Last build is ${Math.round(age)} h old` };
}

// The run behind one model step: {text: "GFS 27/18Z run +3h", earlier}.
// `earlier` = an older run than the model's newest (a past valid time).
export function stepSource(manifest, model, stepH, label = model.toUpperCase()) {
  const src = manifest.sources?.[model]?.[String(stepH)];
  if (!src) return { text: `${label} (no source recorded)`, earlier: false };
  const earlier = src.cycle !== manifest.inits?.[model];
  return { text: `${label} ${runTag(src.cycle)} run +${src.lead_h}h`, earlier };
}

// Markers under the slider: [{h, kind, label, title}], in time order.
export function markers(manifest, nowH, labels = {}) {
  const out = [];
  const frames = manifest.satellite?.frames;
  if (frames?.length) {
    const t = frames[frames.length - 1].time;
    out.push({ h: hoursFrom(manifest.anchor, t), kind: "sat", label: "satellite ends",
      title: `Last satellite frame: ${t.slice(11, 16)} UTC ${t.slice(8, 10)}th. Later than this there are no observations, only models.` });
  }
  for (const [m, init] of Object.entries(manifest.inits ?? {})) {
    if (!init) continue;
    const name = labels[m] ?? m.toUpperCase();
    out.push({ h: hoursFrom(manifest.anchor, init), kind: "init", model: m, label: `${name} init`,
      title: `${name} ${runTag(init)} run starts here: the newest complete run at build time. `
        + "Between this point and now, the view is that run's short forecast — there is no newer run in this build." });
  }
  out.push({ h: nowH, kind: "now", label: "now", title: "Now, by this device's clock (when the page was opened)." });
  return out.sort((a, b) => a.h - b.h);
}

// OPC charts (manifest.opc.charts): the one of `product` valid within tolH of
// time h (hours from the anchor), nearest first; null if none. A chart is a
// picture of one moment, so it's shown only near its valid time.
export function opcChartAt(charts, product, h, anchorIso, tolH = 1.5) {
  let best = null, bd = Infinity;
  for (const c of charts ?? []) {
    if (c.product !== product) continue;
    const d = Math.abs(hoursFrom(anchorIso, c.valid) - h);
    if (d <= tolH + 1e-9 && d < bd) { best = c; bd = d; }
  }
  return best;
}

// The valid time (hours from the anchor) of the next (dir > 0) or previous
// chart of `product` from h; null at the ends.
export function opcNeighbour(charts, product, h, anchorIso, dir) {
  const hs = (charts ?? []).filter((c) => c.product === product).map((c) => hoursFrom(anchorIso, c.valid)).sort((a, b) => a - b);
  return dir > 0 ? hs.find((x) => x > h + 1e-6) ?? null : [...hs].reverse().find((x) => x < h - 1e-6) ?? null;
}
