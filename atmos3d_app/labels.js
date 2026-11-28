// Screen labels over the 3-D view (place names, lat/lon, the height ruler):
// one layout pass, in priority order, so no two overlap and none sits under
// the page's panels. Sizes are estimated from the text (no DOM measuring, so
// it's cheap enough to run on every rendered frame).
//
// No imports, so node --test can load it.

const CHAR_PX = 6.6, LINE_PX = 15, PAD = 3;

// items: [{x, y, text, cls, align: "left" | "center" | "right", dy}] in
// priority order; (x, y) is the anchor point in canvas px. blocked: canvas-
// relative rects where nothing may go. `prev`: keys (labelKey) kept last
// frame -- they're placed first, so labels don't flicker in and out while
// the view moves (user report: "labels are a little jumpy"). Returns the kept
// items with l/t/w/h.
export const labelKey = (it) => `${it.cls ?? ""}|${it.text}`;
export function layoutLabels(items, width, height, blocked = [], margin = 4, prev = null) {
  const kept = [];
  // Priority groups (it.group, lower first) always win; within a group,
  // labels shown last frame go first, then the rest in the given order.
  const rank = (it) => (it.group ?? 0) * 2 + (prev && prev.has(labelKey(it)) ? 0 : 1);
  const order = items.map((it, i) => [it, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([it]) => it);
  for (const it of order) {
    const w = it.text.length * CHAR_PX + 2 * PAD, h = LINE_PX;
    const l = it.align === "left" ? it.x : it.align === "right" ? it.x - w : it.x - w / 2;
    const t = it.y + (it.dy ?? -h / 2);
    if (l < margin || t < margin || l + w > width - margin || t + h > height - margin) continue;
    const hit = (r) => l < r.right && l + w > r.left && t < r.bottom && t + h > r.top;
    if (blocked.some(hit)) continue;
    if (kept.some((k) => l < k.l + k.w + 2 && l + w + 2 > k.l && t < k.t + k.h && t + h > k.t)) continue;
    kept.push({ ...it, l, t, w, h });
  }
  return kept;
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function labelsHtml(kept) {
  return kept.map((k) => `<span class="gl ${k.cls ?? ""}" style="left:${k.l.toFixed(0)}px;top:${k.t.toFixed(0)}px">${esc(k.text)}</span>`).join("");
}
