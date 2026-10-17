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

// UTC as the header's second line when local time leads (user request 2026-10-09): short, with
// the weekday and date because they often differ from the local ones: "Tue 29, 22:40 UTC".
export function fmtUtcShort(ms) {
  const d = new Date(ms), wd = d.toLocaleString("en-US", { timeZone: "UTC", weekday: "short" });
  return `${wd} ${d.getUTCDate()}, ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
}

// The days across the slider (user request 2026-10-09): each midnight between startH and endH (hours
// from the anchor), in the viewer's zone or UTC, and a label for each day ("Tue 30"), centred in the part
// of it that's on the slider. timeZone: an IANA name, "UTC", or undefined for the browser's own.
// Returns {bounds: [h, ...], days: [{h0, h1, label}]}.
export function dayMarks(anchorMs, startH, endH, timeZone = undefined) {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", day: "numeric", year: "numeric", month: "numeric" });
  const key = (h) => { const p = Object.fromEntries(fmt.formatToParts(new Date(anchorMs + h * 3600e3)).map((x) => [x.type, x.value])); return `${p.year}-${p.month}-${p.day}`; };
  const label = (h) => { const p = Object.fromEntries(fmt.formatToParts(new Date(anchorMs + h * 3600e3)).map((x) => [x.type, x.value])); return `${p.weekday} ${p.day}`; };
  const bounds = [];
  let prev = key(startH);
  // step through the span every 15 minutes (zones can be offset by 30 or 45 min), then refine each change
  for (let h = startH + 0.25; h < endH + 0.25 - 1e-9; h += 0.25) {
    const k = key(h);
    if (k !== prev) {
      let lo = h - 0.25, hi = h;
      for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (key(m) === prev) lo = m; else hi = m; }
      const b = Math.round(hi * 60) / 60;
      if (b > startH + 1e-9 && b < endH - 1e-9) bounds.push(b);          // only midnights inside the span
      prev = k;
    }
  }
  const edges = [startH, ...bounds, endH], days = [];
  for (let i = 0; i + 1 < edges.length; i++) days.push({ h0: edges[i], h1: edges[i + 1], label: label((edges[i] + edges[i + 1]) / 2) });
  return { bounds, days };
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

// The Sun's height above the horizon (degrees) at a place and moment, by the NOAA solar calculator's
// formulas (declination and equation of time from the fractional year; good to a few tenths of a degree).
export function sunElevation(ms, lat, lon) {
  const d = new Date(ms), y0 = Date.UTC(d.getUTCFullYear(), 0, 1);
  const g = (2 * Math.PI / 365) * ((ms - y0) / 86400e3);           // fractional year, radians
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
    - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
  const tst = minutes + eqt + 4 * (((lon + 540) % 360) - 180);       // true solar time, minutes
  const ha = ((tst / 4 - 180) * Math.PI) / 180, phi = (lat * Math.PI) / 180;
  const cosz = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
  return 90 - (Math.acos(Math.max(-1, Math.min(1, cosz))) * 180) / Math.PI;
}

// The nights at a place within the span (hours from anchorMs): [[h0, h1], ...], night being the Sun's
// centre more than 0.833° below the horizon (sunset and sunrise as almanacs give them). For the day/night
// strip under the time slider (done 2026-10-09). Edges found to the minute.
export function nightSpans(anchorMs, startH, endH, lat, lon) {
  const dark = (h) => sunElevation(anchorMs + h * 3600e3, lat, lon) < -0.833;
  const edge = (lo, hi) => { const a = dark(lo); for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (dark(m) === a) lo = m; else hi = m; } return Math.round(hi * 60) / 60; };
  const out = [];
  let start = dark(startH) ? startH : null, prev = dark(startH);
  for (let h = startH + 0.25; h < endH + 0.25 - 1e-9; h += 0.25) {
    const hh = Math.min(h, endH), now = dark(hh);
    if (now !== prev) { const e = edge(hh - 0.25, hh); if (now) start = e; else { out.push([start, e]); start = null; } prev = now; }
  }
  if (start != null) out.push([start, endH]);
  return out;
}
