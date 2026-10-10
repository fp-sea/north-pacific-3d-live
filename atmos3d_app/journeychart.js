// The journey chart for "where did this air come from?" (user pick 2026-10-09): the air's height,
// temperature and humidity along each traced path, hour by hour, oldest on the left and its arrival
// on the right. Air that sinks warms and dries (that's why highs are clear and the trade inversion
// forms); air that rises cools and moistens toward cloud. One line per path, in the path's colour.
// Pure (canvas 2-D only), no imports: node --test loads it.

// tracks: [{rgb: [r, g, b] 0-1, label, pts: [{ago (h), z (m, or null), T (°C), RH (%)}]}].
// Returns the panels drawn, [{key, lo, hi}], for tests.
export function drawJourney(ctx, W, H, tracks) {
  ctx.clearRect(0, 0, W, H);
  ctx.font = "9px system-ui, sans-serif";
  const all = tracks.flatMap((t) => t.pts);
  if (!all.length) return [];
  const maxAgo = Math.max(1, ...all.map((p) => p.ago));
  const fin = (k) => all.map((p) => p[k]).filter((v) => v != null && Number.isFinite(v));
  const span = (vals, pad, minW) => {
    if (!vals.length) return null;
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi - lo < minW) { const m = (lo + hi) / 2; lo = m - minW / 2; hi = m + minW / 2; }
    return [lo - pad, hi + pad];
  };
  const panels = [
    { key: "z", title: "height, km", scale: 0.001, r: span(fin("z").map((z) => z / 1000), 0.2, 1) },
    { key: "T", title: "temperature, °C", scale: 1, r: span(fin("T"), 1, 6) },
    { key: "RH", title: "humidity, %", scale: 1, r: span(fin("RH"), 0, 20) },
  ].filter((p) => p.r);
  const L = 30, R = 6, top = 4, gap = 14, bottom = 16;
  const ph = (H - top - bottom - gap * (panels.length - 1)) / panels.length;
  const X = (ago) => L + (1 - ago / maxAgo) * (W - L - R);
  const out = [];
  panels.forEach((pn, k) => {
    if (pn.key === "RH") pn.r = [Math.max(0, pn.r[0]), Math.min(100, pn.r[1])];
    const [lo, hi] = pn.r, y0 = top + k * (ph + gap), Y = (v) => y0 + ph - ((v - lo) / (hi - lo)) * ph;
    ctx.strokeStyle = "rgba(160,160,160,0.6)"; ctx.lineWidth = 1; ctx.strokeRect(L, y0, W - L - R, ph);
    ctx.fillStyle = "#cfd6de";
    ctx.fillText(pn.title, L + 3, y0 + 9);
    ctx.fillText(fmt(hi), 2, y0 + 8); ctx.fillText(fmt(lo), 2, y0 + ph);
    for (let d = 24; d < maxAgo; d += 24) {             // a line each day back
      ctx.strokeStyle = "rgba(160,160,160,0.3)"; ctx.beginPath(); ctx.moveTo(X(d), y0); ctx.lineTo(X(d), y0 + ph); ctx.stroke();
    }
    for (const t of tracks) {
      ctx.strokeStyle = `rgb(${t.rgb.map((c) => Math.round(c * 255)).join(",")})`; ctx.lineWidth = 1.6; ctx.beginPath();
      let pen = false;
      for (const p of t.pts) {
        const v = p[pn.key] == null ? NaN : p[pn.key] * pn.scale;
        if (!Number.isFinite(v)) { pen = false; continue; }
        if (pen) ctx.lineTo(X(p.ago), Y(v)); else ctx.moveTo(X(p.ago), Y(v));
        pen = true;
      }
      ctx.stroke();
    }
    out.push({ key: pn.key, lo, hi });
  });
  ctx.fillStyle = "#cfd6de";
  ctx.fillText(`${Math.round(maxAgo)} h before`, L, H - 4);
  ctx.fillText("arriving", W - R - 38, H - 4);
  return out;
}
const fmt = (v) => (Math.abs(v) >= 10 ? String(Math.round(v)) : v.toFixed(1));
