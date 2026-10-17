// Share a view as a link (user request, 2026-09-28): the settings, camera
// and time packed into the URL's #fragment (never sent to a server), and
// read back on load. Pure, no imports: node --test loads it.
//
// Format: "#v=1&k=value&..." -- short keys, numbers rounded, lists joined by
// ".". Unknown keys are ignored and bad values dropped, so an old or edited
// link degrades to "whatever could be read" rather than failing.

const NUM = (x, d = 1) => Number.isFinite(x) ? String(Math.round(x * 10 ** d) / 10 ** d) : null;
// Drawings on the map (user pick 2026-10-09): {type: "arrow" | "circle" | "text", color (0-4), lat, lon,
// lat2/lon2 (arrow tip) | rKm (circle) | text}. One per "~", fields by ",", the text itself URI-encoded
// (and its own "~" too, which encodeURIComponent leaves alone).
const NOTE_TYPES = { arrow: "a", circle: "c", text: "t" };
const encNote = (n) => [NOTE_TYPES[n.type], n.color ?? 0, NUM(n.lat, 2), NUM(n.lon, 2),
  ...(n.type === "arrow" ? [NUM(n.lat2, 2), NUM(n.lon2, 2)] : n.type === "circle" ? [NUM(n.rKm, 0)] : [encodeURIComponent(String(n.text ?? "").slice(0, 80)).replace(/~/g, "%7E")])].join(",");
export const MAX_NOTES = 30;
const LIST = (a) => (a && a.length ? a.join(".") : null);

// state -> "v=1&..." (without the #).
export function encodeState(s) {
  const kv = {
    v: "1", q: s.question, m: s.model, t: s.time ? s.time.replace(/[-:]/g, "").slice(0, 13) : null,
    c: s.camera ? s.camera.map((x) => NUM(x, 1)).join(",") : null, g: s.globe ? "1" : null,
    f: s.focus, x: LIST(s.context), fi: s.fill, p: s.particles ? "1" : "0", sp: s.surfaceParticles !== "wind" ? s.surfaceParticles : null,
    fl: s.flow ? "1" : null, df: s.diff ? "1" : null, rd: s.regionDiff ? "1" : null, fln: s.focusLines === false ? "0" : null,
    b: s.barbs ? "1" : null, hl: LIST(s.hl), r: s.relief && s.relief !== 1 ? NUM(s.relief, 1) : null, vx: NUM(s.vex, 0),
    s: s.satellite ? "1" : "0", se: s.satEnhance ? "1" : null, o: s.chart || null, oo: s.chartOpacity < 1 ? NUM(s.chartOpacity, 2) : null,
    sl: s.slice ? [s.slice.mode, NUM(s.slice.pos, 1), NUM(s.slice.turn, 0), NUM(s.slice.thick, 0), s.slice.qty, s.slice.lines, ...(s.slice.arrows ? ["a"] : [])].join(",") : null,
    vo: s.volume ? [s.volume.qty, NUM(s.volume.thr, 1), s.volume.window ? "w" : "", ...(s.volume.mode === "all" ? ["a"] : [])].join(",") : null,
    // The 3-D tab's region quantity (what the fill, particles and plane show).
    rq: s.regionQty && s.regionQty !== "speed" ? s.regionQty : null,
    u: s.hUnit === "ft" ? "ft" : null, wu: s.waveUnit === "ft" ? "ft" : null,
    // Map and lat/lon lines on the surface (default: the top level); the background, only when it isn't the
    // automatic one (light grey with the colour fill on, dark otherwise; the caller passes null then).
    mp: s.mapAt === "sfc" ? "sfc" : null, bg: ["space", "light", "white"].includes(s.background) ? s.background : null,
    // The region of interest: shape, bottom, thickness (+ a wall's line and width).
    rg: s.region && s.region.shape !== "whole" ? [s.region.shape, NUM(s.region.zLo, 2), NUM(s.region.thick, 2),
      ...(s.region.wall ? [s.region.wall.mode, NUM(s.region.wall.pos, 1), NUM(s.region.wall.turn, 0), NUM(s.region.wall.thick, 0)] : []),
      ...(s.region.box ? [NUM(s.region.box.latS, 1), NUM(s.region.box.latN, 1), NUM(s.region.box.lonW, 1), NUM(s.region.box.lonE, 1)] : [])].join(",") : null,
    // The horizontal plane: height (km), quantity, lines.
    hp: s.hplane ? [NUM(s.hplane.zKm, 2), s.hplane.qty, s.hplane.lines].join(",") : null,
    // The 3-D flow lines: count, hours, rise and sink, colour.
    f3: s.flow3d ? [s.flow3d.count, s.flow3d.hours, s.flow3d.vertical, s.flow3d.colorBy].join(",") : null,
    // The Past year view: day, map, value/anomaly, lines, wind level and how it's drawn.
    y: s.year ? [s.year.date.replace(/-/g, ""), s.year.view, s.year.mode, s.year.lines, s.year.wind, s.year.windAs].join(",") : null,
    // A case study and its step (cases.js).
    cs: s.case ? `${s.case.id}.${s.case.step}` : null,
    an: s.notes && s.notes.length ? s.notes.slice(0, MAX_NOTES).map(encNote).join("~") : null,
    sc: s.satChannel === "wv" ? "wv" : null,
    p3: s.p3 ? [NUM(s.p3.zKm, 2), NUM(s.p3.thickKm, 1), s.p3.colorBy, NUM(s.p3.density, 2), ...(s.p3.vertical ? [NUM(s.p3.vertical, 0)] : [])].join(",") : null,
  };
  return Object.entries(kv).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
}

const ISO = (t) => (/^\d{8}T\d{4}$/.test(t) ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(9, 11)}:${t.slice(11, 13)}:00Z` : null);
const num = (x) => (x != null && x !== "" && Number.isFinite(Number(x)) ? Number(x) : null);

// "#v=1&..." or "v=1&..." -> state (only the fields that read cleanly), or
// null if it isn't a share link.
export function decodeState(hash) {
  const q = new URLSearchParams(String(hash || "").replace(/^#/, ""));
  if (q.get("v") !== "1") return null;
  const s = {};
  const str = (k, re) => { const v = q.get(k); return v != null && re.test(v) ? v : null; };
  s.question = str("q", /^[a-z0-9-]{1,40}$/);
  s.model = str("m", /^[a-z]{2,10}$/);
  s.time = ISO(q.get("t") ?? "");
  const cam = (q.get("c") ?? "").split(",").map(num);
  s.camera = cam.length === 7 && cam.every((x) => x != null) ? cam : null;
  s.globe = q.get("g") === "1";
  s.focus = str("f", /^(sfc|p\d{3,4})$/);
  s.context = (q.get("x") ?? "").split(".").filter((k) => /^(sfc|p\d{3,4})$/.test(k));
  s.fill = str("fi", /^[a-z_]{1,20}$/);
  s.particles = q.has("p") ? q.get("p") === "1" : null;
  // sp: the Surface section's particles (off / wind / waves). Older links
  // said pw=waves for wave-energy particles.
  const sp = q.get("sp") ?? (q.get("pw") === "waves" ? "waves" : null);
  s.surfaceParticles = ["off", "wind", "waves"].includes(sp) ? sp : "wind";
  s.flow = q.get("fl") === "1";
  s.diff = q.get("df") === "1";
  s.regionDiff = q.get("rd") === "1";
  s.focusLines = q.get("fln") !== "0";
  s.barbs = q.get("b") === "1";
  s.hl = (q.get("hl") ?? "").split(".").filter((k) => /^(sfc|p\d{3,4})$/.test(k));
  s.relief = num(q.get("r")) ?? 1;
  s.vex = num(q.get("vx"));
  s.satellite = q.has("s") ? q.get("s") === "1" : null;
  s.satEnhance = q.get("se") === "1";
  s.chart = str("o", /^[a-z0-9_]{1,40}$/);
  s.chartOpacity = num(q.get("oo")) ?? 1;
  const sl = (q.get("sl") ?? "").split(",");
  s.slice = (sl.length === 6 || sl.length === 7) && ["ns", "ew"].includes(sl[0]) && num(sl[1]) != null
    ? { mode: sl[0], pos: num(sl[1]), turn: num(sl[2]) ?? 0, thick: num(sl[3]) ?? 0, qty: sl[4], lines: sl[5], arrows: sl[6] === "a" } : null;
  const vo = (q.get("vo") ?? "").split(",");
  s.volume = (vo.length === 3 || vo.length === 4) && ["speed", "rh", "tanom", "ghanom", "w", "temp", "theta", "vort", "div", "ti", "stab", "ri", "thetae", "grad", "fgen"].includes(vo[0]) && num(vo[1]) != null ? { qty: vo[0], thr: num(vo[1]), window: vo[2] === "w", mode: vo[3] === "a" ? "all" : "shape" } : null;
  const rqv = q.get("rq");
  s.regionQty = rqv && [...["speed", "rh", "tanom", "ghanom", "w", "temp", "theta", "vort", "div", "ti", "stab", "ri", "thetae", "grad", "fgen"], "across", "along"].includes(rqv) ? rqv : null;
  s.hUnit = q.get("u") === "ft" ? "ft" : "km";
  // The region; links from before it existed have none (the page derives it from sl / vo / p3).
  const rg = (q.get("rg") ?? "").split(",");
  // (a box: its south, north, west and east edges after the heights)
  const boxOk = rg[0] === "box" && [3, 4, 5, 6].every((i) => num(rg[i]) != null);
  s.region = (["wall", "layer"].includes(rg[0]) || boxOk) && num(rg[1]) != null && num(rg[2]) != null
    ? { shape: rg[0], zLo: num(rg[1]), thick: num(rg[2]),
        wall: rg[0] === "wall" && ["ns", "ew"].includes(rg[3]) && num(rg[4]) != null ? { mode: rg[3], pos: num(rg[4]), turn: num(rg[5]) ?? 0, thick: num(rg[6]) ?? 0 } : null,
        ...(boxOk ? { box: { latS: num(rg[3]), latN: num(rg[4]), lonW: num(rg[5]), lonE: num(rg[6]) } } : {}) }
    : q.has("rg") ? null : undefined;
  if (s.region === undefined) delete s.region;
  const hpv = (q.get("hp") ?? "").split(",");
  s.hplane = hpv.length === 3 && num(hpv[0]) != null && ["speed", "temp", "theta", "rh", "w", "vort", "div", "ti", "stab", "ri", "thetae", "grad", "fgen"].includes(hpv[1]) && ["pressure", "theta", "speed", "none"].includes(hpv[2])
    ? { zKm: num(hpv[0]), qty: hpv[1], lines: hpv[2] } : null;
  const f3 = (q.get("f3") ?? "").split(",");
  s.flow3d = f3.length === 4 && num(f3[0]) != null && num(f3[1]) != null && [0, 1, 5].includes(num(f3[2])) && ["q", "height"].includes(f3[3])
    ? { count: Math.max(50, Math.min(800, num(f3[0]))), hours: num(f3[1]), vertical: num(f3[2]), colorBy: f3[3] } : null;
  const y = (q.get("y") ?? "").split(",");
  s.year = y.length === 6 && /^\d{8}$/.test(y[0]) && /^[a-z0-9]{2,12}$/.test(y[1]) && ["anomaly", "actual"].includes(y[2])
    && ["auto", "isobars", "heights", "none"].includes(y[3]) && ["auto", "none", "10", "500", "250"].includes(y[4]) && ["flow", "barbs", "particles"].includes(y[5])
    ? { date: `${y[0].slice(0, 4)}-${y[0].slice(4, 6)}-${y[0].slice(6, 8)}`, view: y[1], mode: y[2], lines: y[3], wind: y[4], windAs: y[5] } : null;
  s.waveUnit = q.get("wu") === "ft" ? "ft" : "m";
  const cs = str("cs", /^[a-z0-9-]{1,40}\.\d{1,2}$/);
  s.case = cs ? { id: cs.split(".")[0], step: Number(cs.split(".")[1]) } : null;
  s.mapAt = q.get("mp") === "sfc" ? "sfc" : "top";
  s.background = ["space", "light", "white"].includes(q.get("bg")) ? q.get("bg") : null;
  s.notes = (q.get("an") ?? "").split("~").map((t) => {
    const f = t.split(","), [type] = Object.entries(NOTE_TYPES).find(([, k]) => k === f[0]) ?? [];
    const color = num(f[1]), lat = num(f[2]), lon = num(f[3]);
    if (!type || color == null || lat == null || lon == null || Math.abs(lat) > 90) return null;
    const n = { type, color: Math.max(0, Math.min(4, color)), lat, lon };
    if (type === "arrow") { n.lat2 = num(f[4]); n.lon2 = num(f[5]); return n.lat2 != null && n.lon2 != null ? n : null; }
    if (type === "circle") { n.rKm = num(f[4]); return n.rKm > 0 ? n : null; }
    try { n.text = decodeURIComponent(f.slice(4).join(",")).slice(0, 80); } catch { return null; }
    return n.text ? n : null;
  }).filter(Boolean).slice(0, MAX_NOTES);
  s.satChannel = q.get("sc") === "wv" ? "wv" : "ir";
  const p3 = (q.get("p3") ?? "").split(",");
  s.p3 = (p3.length === 4 || p3.length === 5) && num(p3[0]) != null && num(p3[1]) != null && ["height", "speed", "w", "q"].includes(p3[2])
    ? { zKm: num(p3[0]), thickKm: num(p3[1]), colorBy: p3[2], density: num(p3[3]) ?? 1, vertical: [0, 1, 5].includes(num(p3[4])) ? num(p3[4]) : 0 } : null;
  return s;
}
