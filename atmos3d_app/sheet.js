// The control panel as a bottom sheet on phones (2026-10-10, iPhone review): a handle to drag, three heights to snap
// to (peek: just the handle and the first row; half; full), the height published as the CSS variable --sheetH on
// <body> and a "sheetchange" event, so the layout and the 3-D view's framing follow it. On wider screens it does
// nothing (the panel stays a floating box). Pure DOM, no imports.
//
// makeSheet(panel, { query, peek, half, full, onChange, peekEl }) -> { set(name), get(), active(), refresh() }
export function makeSheet(panel, { query = "(max-width: 700px)", peek = 64, half = 0.46, full = 0.88, onChange = () => {}, peekEl = () => null } = {}) {
  const mq = matchMedia(query), handle = document.createElement("div");
  handle.className = "sheet-handle";
  handle.setAttribute("role", "button");
  handle.setAttribute("tabindex", "0");
  handle.setAttribute("aria-label", "Drag or tap to resize the controls");
  handle.innerHTML = "<span></span>";
  panel.prepend(handle);
  let state = "half", px = 0, drag = null;
  const room = () => panel.parentElement.clientHeight - (parseFloat(getComputedStyle(document.body).getPropertyValue("--sheetBase")) || 0);
  // peek: the handle and the panel's first row (the mode switch), measured, so nothing is cut in half
  const peekPx = () => {
    // the mode switch when there is one (not whatever happens to be first, e.g. an open probe), else the first row
    // (or what the page names: an open case's step header, so peek shows ◀ Step n of N ▶ over the map)
    const first = peekEl() ?? panel.querySelector(".mode-toggle") ?? [...panel.children].find((c) => c !== handle && c.offsetParent);
    return first?.offsetParent ? Math.max(peek, Math.min(140, handle.offsetHeight + first.offsetHeight + 14)) : peek;
  };
  const heightOf = (name) => (name === "peek" ? peekPx() : Math.round(room() * (name === "full" ? full : half)));
  function apply(h, name) {
    px = Math.max(Math.min(peek, peekPx()), Math.min(room() * full, h));
    document.body.style.setProperty("--sheetH", `${Math.round(px)}px`);
    for (const n of ["peek", "half", "full"]) document.body.classList.toggle(`sheet-${n}`, n === name);
    if (name) { state = name; handle.setAttribute("aria-label", `Controls: ${name === "peek" ? "minimised" : name === "half" ? "half height" : "full height"}. Drag or tap to resize.`); }
    onChange(state, px);
    document.dispatchEvent(new CustomEvent("sheetchange", { detail: { state, px } }));
  }
  function set(name) { if (mq.matches) apply(heightOf(name), name); }
  function snap() {
    const opts = ["peek", "half", "full"].map((n) => [n, heightOf(n)]);
    const [name] = opts.reduce((b, o) => (Math.abs(o[1] - px) < Math.abs(b[1] - px) ? o : b));
    apply(heightOf(name), name);
  }
  handle.addEventListener("pointerdown", (e) => { if (!mq.matches) return; drag = { y: e.clientY, h: px, moved: false }; handle.setPointerCapture(e.pointerId); });
  handle.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dy = drag.y - e.clientY;
    if (Math.abs(dy) > 4) drag.moved = true;
    if (drag.moved) apply(drag.h + dy, null);
  });
  const end = () => {
    if (!drag) return;
    const tapped = !drag.moved;
    drag = null;
    if (tapped) set(state === "peek" ? "half" : state === "half" ? "full" : "peek"); else snap();
  };
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
  handle.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp") { e.preventDefault(); set(state === "peek" ? "half" : "full"); }
    if (e.key === "ArrowDown") { e.preventDefault(); set(state === "full" ? "half" : "peek"); }
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); set(state === "peek" ? "half" : state === "half" ? "full" : "peek"); }
  });
  const sync = () => {
    document.body.classList.toggle("phone", mq.matches);
    if (mq.matches) apply(heightOf(state), state);
    else { document.body.style.removeProperty("--sheetH"); for (const n of ["peek", "half", "full"]) document.body.classList.remove(`sheet-${n}`); onChange(null, 0); }
  };
  mq.addEventListener("change", sync);
  window.addEventListener("resize", () => { if (mq.matches && !drag) apply(heightOf(state), state); });
  sync();
  return { set, get: () => state, active: () => mq.matches, refresh: sync };
}
