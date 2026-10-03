// SYNC: Wind Volume Explorer web/shell/export.js@d419a0d (itself from radar-explorer web/export.js).
// Adapted: the composite reads this page's own labels, HUD and legend; the
// output keeps the 3-D view's shape (not the window's); colour keys are drawn
// from CSS gradients; the disclaimer is always burnt in with the credits.
//
// Export the visualization as a picture (PNG), an animated GIF or an MP4
// video, made in the browser. Only the visualization goes in -- never the
// controls. Each output frame is composited on a 2-D canvas: the 3-D render,
// the map labels (page text over the 3-D view, redrawn from where they sit),
// the valid time and run, the colour keys, and the data credits and
// disclaimer, which the sources' licences and this project's rules ask for.
//
// GIF: gifenc, one 256-colour palette per frame. MP4: the browser's own
// H.264 encoder (WebCodecs) with mp4-muxer, frame-exact and faster than real
// time; where WebCodecs is missing, MediaRecorder records in real time
// (MP4 if the browser can, else WebM). Both libraries load only when used.

const GIFENC = "https://cdn.jsdelivr.net/npm/gifenc@1.0.3/dist/gifenc.esm.js";
const MP4MUX = "https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.3/build/mp4-muxer.mjs";
export const FPS = 20;

const even = (n) => Math.max(2, Math.round(n / 2) * 2);

// Output size for a width, keeping the view's shape (viewW x viewH, CSS px).
export function outputSize(width, viewW, viewH) {
  const W = even(width);
  return { W, H: even((W * viewH) / viewW) };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

// A CSS "linear-gradient(to right, c p%, ...)" as a canvas gradient over [x0, x1].
function cssGradient(ctx, css, x0, x1) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  const stops = [...css.matchAll(/(rgba?\([^)]*\)|#[0-9a-fA-F]{3,8})\s*([\d.]+%)?/g)];
  stops.forEach((m, i) => {
    const pos = m[2] ? parseFloat(m[2]) / 100 : i / Math.max(1, stops.length - 1);
    try { g.addColorStop(Math.min(1, Math.max(0, pos)), m[1]); } catch { /* skip a bad stop */ }
  });
  return g;
}

// Draw one frame. parts: { gl (canvas), root (the 3-D view's element), labels
// (element holding the map labels), title, time, run, badge, legends:
// [{label, css, lo, hi}], compassDeg, credits }.
export function composite(ctx, parts, W, H) {
  const rb = parts.root.getBoundingClientRect();
  const s = W / rb.width;                               // page px -> output px
  const fs = Math.max(s, W / 1100);                     // text never shrinks past legible
  const font = (px, w = 400) => `${w} ${px * fs}px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`;
  ctx.fillStyle = "#0b0e13";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(parts.gl, 0, 0, W, H);

  // Map labels where the page shows them.
  for (const el of parts.labels.querySelectorAll(".gl")) {
    const r = el.getBoundingClientRect();
    if (!r.width || r.right < rb.left || r.bottom < rb.top || r.left > rb.right || r.top > rb.bottom) continue;
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize) * fs;
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${size}px ${cs.fontFamily}`;
    const text = el.textContent.trim();
    const x = (r.left - rb.left) * s, y = (r.top - rb.top) * s, w = r.width * s, h = r.height * s;
    if (cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)") {
      ctx.fillStyle = cs.backgroundColor;
      roundRect(ctx, x, y, w, h, 3 * fs);
      ctx.fill();
    }
    ctx.fillStyle = cs.color;
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + parseFloat(cs.paddingLeft) * s, y + h / 2);
  }

  // Title, valid time and run across the top.
  const band = ctx.createLinearGradient(0, 0, 0, 64 * fs);
  band.addColorStop(0, "rgba(11,14,19,0.92)");
  band.addColorStop(1, "rgba(11,14,19,0)");
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, W, 64 * fs);
  ctx.textBaseline = "top";
  ctx.font = font(15, 600); ctx.fillStyle = "#dfe6ef";
  ctx.fillText(parts.title, 12 * fs, 8 * fs);
  const tw = ctx.measureText(parts.title).width;
  ctx.font = font(15, 600); ctx.fillStyle = "#ffcc4d";
  ctx.fillText(parts.time, 12 * fs + tw + 14 * fs, 8 * fs);
  ctx.font = font(11.5); ctx.fillStyle = "#c9d1db";
  ctx.fillText(parts.run, 12 * fs, 28 * fs);
  if (parts.badge) { ctx.fillStyle = "#ffe38a"; ctx.fillText(parts.badge, 12 * fs, 44 * fs); }

  // North arrow, top right.
  if (Number.isFinite(parts.compassDeg)) {
    const cx = W - 26 * fs, cy = 28 * fs;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate((parts.compassDeg * Math.PI) / 180);
    ctx.fillStyle = "#e0485f"; ctx.beginPath(); ctx.moveTo(0, -13 * fs); ctx.lineTo(5 * fs, 0); ctx.lineTo(-5 * fs, 0); ctx.fill();
    ctx.fillStyle = "#8a94a3"; ctx.beginPath(); ctx.moveTo(0, 13 * fs); ctx.lineTo(5 * fs, 0); ctx.lineTo(-5 * fs, 0); ctx.fill();
    ctx.restore();
    ctx.font = font(10, 600); ctx.fillStyle = "#dfe6ef"; ctx.textAlign = "center"; ctx.fillText("N", cx, cy - 26 * fs); ctx.textAlign = "left";
  }

  // Colour keys, bottom right, stacked.
  let stackY = H - 34 * fs;
  for (const lg of parts.legends || []) {
    const lw = 270 * fs, lh = 44 * fs, lx = W - lw - 10 * fs, ly = stackY - lh;
    stackY = ly - 6 * fs;
    ctx.fillStyle = "rgba(16,22,32,0.86)";
    roundRect(ctx, lx, ly, lw, lh, 7 * fs);
    ctx.fill();
    ctx.textBaseline = "top"; ctx.font = font(10.5); ctx.fillStyle = "#c9d1db";
    ctx.fillText(lg.label, lx + 9 * fs, ly + 5 * fs, lw - 18 * fs);
    const bx = lx + 9 * fs, bw = lw - 18 * fs, by = ly + 19 * fs;
    ctx.fillStyle = cssGradient(ctx, lg.css, bx, bx + bw);
    ctx.fillRect(bx, by, bw, 9 * fs);
    ctx.fillStyle = "#8b97a8";
    ctx.fillText(String(lg.lo), bx, by + 11 * fs);
    ctx.textAlign = "right"; ctx.fillText(String(lg.hi), bx + bw, by + 11 * fs); ctx.textAlign = "left";
  }

  // Credits and disclaimer, bottom, wrapped.
  ctx.font = font(9); ctx.fillStyle = "rgba(223,230,239,0.8)";
  const maxW = W - 20 * fs, lines = [];
  let line = "";
  for (const word of parts.credits.split(" ")) {
    if (line && ctx.measureText(`${line} ${word}`).width > maxW) { lines.push(line); line = word; } else line = line ? `${line} ${word}` : word;
  }
  lines.push(line);
  ctx.textBaseline = "bottom";
  lines.forEach((l, i) => ctx.fillText(l, 10 * fs, H - 6 * fs - (lines.length - 1 - i) * 11 * fs));
}

// Make the file. drawStep(i, ctx, W, H) renders and composites step i;
// holdMs(i) is how long step i stays on screen.
export async function record({ format, W, H, steps, drawStep, holdMs, onProgress, cancelled = () => false }) {
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: format === "gif" });

  if (format === "png") {
    await drawStep(0, ctx, W, H);
    return await new Promise((r) => canvas.toBlob(r, "image/png"));
  }

  if (format === "gif") {
    const { GIFEncoder, quantize, applyPalette } = await import(GIFENC);
    const gif = GIFEncoder();
    for (let i = 0; i < steps && !cancelled(); i++) {
      await drawStep(i, ctx, W, H);
      const { data } = ctx.getImageData(0, 0, W, H);
      const palette = quantize(data, 256);
      gif.writeFrame(applyPalette(data, palette), W, H, { palette, delay: holdMs(i) });
      onProgress?.(i + 1, steps);
      await new Promise((r) => setTimeout(r, 0));        // let the page breathe
    }
    gif.finish();
    return new Blob([gif.bytes()], { type: "image/gif" });
  }

  if ("VideoEncoder" in window) {
    const codec = await firstSupported(["avc1.640028", "avc1.4d0028", "avc1.42001f"], W, H);
    if (codec) {
      const { Muxer, ArrayBufferTarget } = await import(MP4MUX);
      const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: "avc", width: W, height: H }, fastStart: "in-memory" });
      let failure = null;
      const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { failure = e; } });
      enc.configure({ codec, width: W, height: H, bitrate: Math.round(W * H * 4), framerate: FPS });
      let n = 0;
      for (let i = 0; i < steps && !cancelled(); i++) {
        await drawStep(i, ctx, W, H);
        // A fixed frame rate, holding each step for its time: plays the same everywhere.
        const repeats = Math.max(1, Math.round((holdMs(i) / 1000) * FPS));
        for (let k = 0; k < repeats; k++, n++) {
          const frame = new VideoFrame(canvas, { timestamp: (n * 1e6) / FPS, duration: 1e6 / FPS });
          enc.encode(frame, { keyFrame: n % (FPS * 2) === 0 });
          frame.close();
        }
        if (failure) throw failure;
        onProgress?.(i + 1, steps);
        await new Promise((r) => setTimeout(r, 0));
      }
      await enc.flush();
      muxer.finalize();
      return new Blob([muxer.target.buffer], { type: "video/mp4" });
    }
  }

  // Fallback: record the canvas in real time.
  const type = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t));
  if (!type) throw new Error("this browser can't record video");
  const stream = canvas.captureStream(FPS);
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: W * H * 4 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise((r) => { rec.onstop = r; });
  rec.start();
  for (let i = 0; i < steps && !cancelled(); i++) {
    await drawStep(i, ctx, W, H);
    onProgress?.(i + 1, steps);
    await new Promise((r) => setTimeout(r, holdMs(i)));
  }
  rec.stop();
  await done;
  return new Blob(chunks, { type: type.split(";")[0] });
}

async function firstSupported(codecs, W, H) {
  for (const codec of codecs) {
    try {
      const { supported } = await VideoEncoder.isConfigSupported({ codec, width: W, height: H, bitrate: W * H * 4, framerate: FPS });
      if (supported) return codec;
    } catch { /* try the next */ }
  }
  return null;
}

// Hand the file to the viewer.
export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60e3);
}
