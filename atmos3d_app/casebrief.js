// A case's briefing: what a sailor could read before going (user request
// 2026-10-09: "reproduce the data available leading into the crossing"),
// from casebriefs.js. A step names a briefing and a moment:
//   briefHtml(brief, "day-before" | "morning-of")  the NWS products as issued
//     by then -- the zone forecast, any advisory or warning, the forecast
//     discussion's marine paragraph -- verbatim, with their issue times;
//   briefHtml(brief, "compare")  the comparison maps (the blend against the
//     satellite);
//   chartsHtml(brief, sel)  the forecasters' own charts (OPC's surface and 500 mb analyses and
//     forecasts, Honolulu's streamlines and wind/wave charts, from NCEI's archive): a menu of the
//     kinds, ◀ ▶ through their times, and the chart; chartFrame picks a step's starting chart;
//   drawMeteogram(ctx, W, H, brief, runInit)  a small chart: the National
//     Blend of Models' wind and gust in mid-channel and its strongest in the
//     channel, hour by hour through the crossing window, against the zone
//     forecast's "to 30", the satellite's 33 kt and the observed 40-45.
// Pure (strings and canvas 2-D only), no imports: node --test loads it.

const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

// "315 PM HST Tue Dec 19 2023" -> "Tue 19 Dec, 3:15 pm HST"
export function fmtIssued(s) {
  const m = /^(\d{1,2})(\d\d) ([AP])M HST (\w{3}) (\w{3}) (\d+) \d{4}$/.exec(s);
  return m ? `${m[4]} ${m[6]} ${m[5]}, ${m[1]}:${m[2]} ${m[3].toLowerCase()}m HST` : s;
}

// The NWS products as issued by a moment, or the comparison maps. assetUrl maps a file to its URL.
export function briefHtml(brief, as, assetUrl = (f) => f) {
  if (as === "compare") {
    return `<div class="brief">${brief.figs.map((f) => `<figure><a class="zoom" href="${assetUrl(f.file)}" target="_blank" rel="noopener" title="Open full size"><img src="${assetUrl(f.file)}" alt="${esc(f.caption)}"></a><figcaption>${esc(f.caption)}</figcaption></figure>`).join("")}</div>`;
  }
  const a = brief.asOf[as];
  const box = (title, p) => `<div class="brief-prod"><div class="brief-h"><b>${title}</b> · issued ${esc(fmtIssued(p.issued))}</div><pre>${esc(p.text)}</pre></div>`;
  return `<div class="brief"><p class="brief-label">${esc(a.label)}</p>`
    + box(`Coastal waters forecast: ${esc(brief.zone)}`, a.cwf)
    + box("Marine weather message (advisories and warnings)", a.mww)
    + box("Forecast discussion: marine", a.afd)
    + `<p class="brief-label">The National Blend of Models (2.5 km), run ${esc(a.nbm.replace("T", " ").replace("Z", " UTC"))}: wind through the crossing window</p>`
    + `<canvas class="brief-chart" data-run="${esc(a.nbm)}" width="280" height="150"></canvas>`
    + `<p class="brief-note">Sources: ${esc(brief.sources.products)}; ${esc(brief.sources.nbm)}.</p></div>`;
}

const parseValid = (v) => Date.parse(/^\d{4}-\d\d-\d\dT\d\dZ$/.test(v) ? v.replace("Z", ":00:00Z") : v);

// The chart for one run. Returns {x0, x1, ymax} for tests.
export function drawMeteogram(ctx, W, H, brief, runInit) {
  const r = brief.nbm.runs.find((x) => x.init === runInit);
  const P = { x: 30, y: 10, w: W - 38, h: H - 34 }, ymax = 50;
  ctx.clearRect(0, 0, W, H);
  ctx.font = "9px system-ui, sans-serif";
  if (!r) return null;
  const t = r.valid.map(parseValid), t0 = t[0], t1 = t[t.length - 1];
  const X = (ms) => P.x + ((ms - t0) / (t1 - t0)) * P.w, Y = (kt) => P.y + P.h - (Math.min(kt, ymax) / ymax) * P.h;
  // observed band, the satellite, the forecast
  ctx.fillStyle = "rgba(227,26,28,0.16)"; ctx.fillRect(P.x, Y(brief.observed.sustained[1]), P.w, Y(brief.observed.sustained[0]) - Y(brief.observed.sustained[1]));
  ctx.fillStyle = "#c81e1e"; ctx.fillText(`observed ${brief.observed.sustained[0]}–${brief.observed.sustained[1]} kt sustained`, P.x + 3, Y(brief.observed.sustained[1]) - 2);
  ctx.strokeStyle = "#f08c00"; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(P.x, Y(brief.forecast.kt)); ctx.lineTo(P.x + P.w, Y(brief.forecast.kt)); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = "#f08c00"; ctx.fillText("forecast \"to 30\"", P.x + P.w - 74, Y(brief.forecast.kt) - 2);
  const ta = parseValid(brief.ascat.valid);
  if (ta >= t0 && ta <= t1) { ctx.fillStyle = "#1b7f3b"; ctx.beginPath(); ctx.arc(X(ta), Y(brief.ascat.kt), 3.5, 0, 2 * Math.PI); ctx.fill(); ctx.fillText("satellite 33", X(ta) + 5, Y(brief.ascat.kt) + 3); }
  // the blend: mid-channel wind (solid), gust (dashed), the channel's strongest (thin)
  const line = (arr, color, dash, width) => {
    ctx.strokeStyle = color; ctx.setLineDash(dash); ctx.lineWidth = width; ctx.beginPath();
    let pen = false;
    arr.forEach((v, i) => { if (v == null) { pen = false; return; } const x = X(t[i]), y = Y(v); if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y); pen = true; });
    ctx.stroke(); ctx.setLineDash([]);
  };
  line(r.channel_max.wind, "#7a8fa3", [], 1);
  line(r.points.mid.gust, "#2b6cb0", [3, 2], 1.3);
  line(r.points.mid.wind, "#2b6cb0", [], 2);
  // axes: knots, and days in HST
  ctx.strokeStyle = "#999"; ctx.lineWidth = 1; ctx.strokeRect(P.x, P.y, P.w, P.h);
  ctx.fillStyle = "#cfd6de";
  for (const k of [0, 10, 20, 30, 40, 50]) ctx.fillText(String(k), 4, Y(k) + 3);
  ctx.fillText("kt", 4, P.y + 7);
  // midnights in Hawaiʻi (UTC-10): local time = UTC - 10 h, so local midnight is 10:00 UTC
  for (let ms = Math.ceil((t0 - 10 * 3600e3) / 86400e3) * 86400e3 + 10 * 3600e3; ms <= t1; ms += 86400e3) {
    const d = new Date(ms - 10 * 3600e3);
    ctx.fillText(`${d.getUTCDate()} Dec`, X(ms) + 2, P.y + P.h + 11);
    ctx.strokeStyle = "rgba(160,160,160,0.4)"; ctx.beginPath(); ctx.moveTo(X(ms), P.y); ctx.lineTo(X(ms), P.y + P.h); ctx.stroke();
  }
  ctx.fillStyle = "#cfd6de";
  ctx.fillText("blend mid-channel: wind ―, gust ┄; channel max: thin", P.x, H - 3);
  return { x0: t0, x1: t1, ymax };
}

// "2023-12-20T18Z" -> "18Z Wed 20 Dec (8 am Wed in Hawaiʻi)": the charts' UTC with the islands' time (UTC-10).
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtChartTime(iso) {
  const ms = parseValid(iso);
  if (!Number.isFinite(ms)) return iso;
  const u = new Date(ms), h = new Date(ms - 10 * 3600e3), hh = h.getUTCHours();
  const local = `${hh % 12 || 12} ${hh < 12 ? "am" : "pm"} ${DOW[h.getUTCDay()]}`;
  return `${String(u.getUTCHours()).padStart(2, "0")}Z ${DOW[u.getUTCDay()]} ${u.getUTCDate()} ${MON[u.getUTCMonth()]} (${local} in Hawaiʻi)`;
}

// The chart a step starts on: {series, valid, cycle?} -> {series, i}: that exact chart, or the one of
// that kind nearest the valid time (the latest cycle among equals).
export function chartFrame(brief, want) {
  const S = brief.charts.series, s = S.find((x) => x.id === want.series) ?? S[0];
  let best = 0, bd = Infinity;
  const t = parseValid(want.valid ?? s.frames[0].valid);
  s.frames.forEach((f, i) => {
    if (want.cycle && f.valid === want.valid && f.cycle === want.cycle) { best = i; bd = -1; return; }
    const d = Math.abs(parseValid(f.valid) - t);
    if (bd >= 0 && (d < bd || (d === bd && f.cycle > s.frames[best].cycle))) { best = i; bd = d; }
  });
  return { series: s.id, i: best };
}

// The chart viewer: sel {series, i}. Buttons and menu carry classes main.js listens for.
export function chartsHtml(brief, sel, assetUrl = (f) => f) {
  const S = brief.charts.series, s = S.find((x) => x.id === sel.series) ?? S[0], i = Math.max(0, Math.min(s.frames.length - 1, sel.i)), f = s.frames[i];
  const group = (office, label) => `<optgroup label="${label}">${S.filter((x) => x.office === office && x.frames.length)
    .map((x) => `<option value="${x.id}"${x.id === s.id ? " selected" : ""}>${esc(x.title.replace(/^(OPC|Honolulu) /, ""))}</option>`).join("")}</optgroup>`;
  const when = s.lead ? `valid ${fmtChartTime(f.valid)}; made from the ${fmtChartTime(f.cycle).split(" (")[0]} data, ${s.lead} h before` : `${fmtChartTime(f.valid)}`;
  return `<div class="brief-charts" data-series="${s.id}" data-i="${i}">`
    + `<div class="bc-bar"><select class="bc-series" title="Which chart">${group("OPC", "Ocean Prediction Center")}${group("HFO", "Honolulu forecast office")}</select>`
    + `<button class="mini bc-prev" title="The previous chart of this kind"${i ? "" : " disabled"}>◀</button>`
    + `<span class="bc-n">${i + 1}/${s.frames.length}</span>`
    + `<button class="mini bc-next" title="The next chart of this kind"${i < s.frames.length - 1 ? "" : " disabled"}>▶</button></div>`
    + (f.rect ? `<div class="bc-bar"><label title="Lay this chart over the 3-D map, in place (it's Mercator, like the map), to compare the forecasters' analysis with the model's"><input type="checkbox" class="bc-onmap"${sel.onMap ? " checked" : ""}> on the map</label>`
      + `<input type="range" class="bc-opacity" min="0.2" max="1" step="0.05" value="${sel.opacity ?? 0.85}" title="The chart's opacity on the map"></div>`
      : `<p class="brief-note">(This chart's projection doesn't match the map's, so it's shown here only.)</p>`)
    + `<p class="brief-label">${esc(s.title)}: ${esc(when)}</p>`
    + `<a class="zoom" href="${assetUrl(f.file)}" target="_blank" rel="noopener" title="Open full size"><img class="bc-img" src="${assetUrl(f.file)}" alt="${esc(s.title)}, ${esc(when)}"></a>`
    + `<p class="brief-note">As broadcast by radiofax, from NCEI's archive of NCEP charts (the colour web versions of those days weren't archived). Click to open full size.</p></div>`;
}
