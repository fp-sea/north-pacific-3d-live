// The slice as a flat chart: the classic cross-section plot, height up, the
// position along the slice across. Faced square-on in 3-D the slice is only
// ~1:8 tall across the whole domain; the chart has its own aspect.
//
// It shows the NEARER real model step (a chart is a figure, not a blend) and
// says which. Colour from the slice quantity's scale; contour lines by
// marching squares on the same grid.
//
// Motion arrows (o.arrows): the air's motion IN the slice's plane, the wind
// along the slice and the vertical motion, drawn at the chart's own
// stretch: a chart 3,000 km wide and 12 km tall stretches height ~100x, and
// the arrows are stretched the same, so they slope exactly as the air would
// move across this picture (arrowSlope). Fixed length: they show direction,
// the colour shows strength.
//
// lut / contourSegments / arrowSlope are pure; drawSliceChart draws on a
// 2-D canvas.
// No imports, so node --test loads it.

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

// 256-entry RGBA lookup for a scale's stops ([value, css, alpha?]).
export function lut(stops, min, max) {
  const out = new Uint8ClampedArray(256 * 4);
  const s = stops.map(([v, c, a = 1]) => [v, hex(c), a]);
  for (let i = 0; i < 256; i++) {
    const v = min + ((max - min) * i) / 255;
    let k = 0;
    while (k < s.length - 2 && v > s[k + 1][0]) k++;
    const [v0, c0, a0] = s[k], [v1, c1, a1] = s[k + 1];
    const f = Math.min(1, Math.max(0, (v - v0) / (v1 - v0 || 1)));
    for (let ch = 0; ch < 3; ch++) out[i * 4 + ch] = Math.round(c0[ch] + (c1[ch] - c0[ch]) * f);
    out[i * 4 + 3] = Math.round((a0 + (a1 - a0) * f) * 255);
  }
  return out;
}

// Contour segments of a field on an nx x nz grid (row 0 at the bottom), at
// every multiple of `interval`: [[x0, z0, x1, z1], ...] in grid units.
// Cells with any NaN corner are skipped (no lines through missing data).
export function contourSegments(values, nx, nz, interval) {
  const segs = [];
  const at = (x, z) => values[z * nx + x];
  for (let z = 0; z < nz - 1; z++) {
    for (let x = 0; x < nx - 1; x++) {
      const c = [at(x, z), at(x + 1, z), at(x + 1, z + 1), at(x, z + 1)];
      if (c.some((v) => !Number.isFinite(v))) continue;
      const lo = Math.ceil(Math.min(...c) / interval), hi = Math.floor(Math.max(...c) / interval);
      for (let n = lo; n <= hi; n++) {
        const L = n * interval, pts = [];
        // Edges: bottom (0-1), right (1-2), top (2-3), left (3-0).
        const corners = [[x, z], [x + 1, z], [x + 1, z + 1], [x, z + 1]];
        for (let e = 0; e < 4; e++) {
          const a = c[e], b = c[(e + 1) % 4];
          if ((a < L) !== (b < L) && a !== b) {
            const f = (L - a) / (b - a), [ax, az] = corners[e], [bx, bz] = corners[(e + 1) % 4];
            pts.push([ax + (bx - ax) * f, az + (bz - az) * f]);
          }
        }
        if (pts.length === 2) segs.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1]]);
        else if (pts.length === 4) { segs.push([...pts[0], ...pts[1]]); segs.push([...pts[2], ...pts[3]]); }
      }
    }
  }
  return segs;
}

// Direction of an in-plane arrow on the chart, in pixels (y up): along
// (m/s along the slice), w (cm/s up), kmPerPx across, mPerPx up. Returns a
// unit [dx, dy], or null for (near) still air.
export function arrowSlope(along, w, kmPerPx, mPerPx) {
  const dx = along / (kmPerPx * 1000), dy = (w / 100) / mPerPx;
  const m = Math.hypot(dx, dy);
  return m > 1e-9 && Number.isFinite(m) ? [dx / m, dy / m] : null;
}

// Draw the chart. o: {values, lines, nx, nz, zTopM, lineInterval, lut,
// xLabel(ix) -> string | null (tick label at that column), yTicks [{m,
// label}], levels [{name, m}], title}. Plot area inside margins.
export function drawSliceChart(ctx, W, H, o) {
  const M = { l: 44, r: 44, t: 18, b: 22 }, pw = W - M.l - M.r, ph = H - M.t - M.b;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#12161c"; ctx.fillRect(0, 0, W, H);
  // Colour image: one cell per grid value, scaled by the canvas.
  const img = ctx.createImageData(o.nx, o.nz);
  for (let iz = 0; iz < o.nz; iz++) for (let ix = 0; ix < o.nx; ix++) {
    const v = o.values[iz * o.nx + ix], d = ((o.nz - 1 - iz) * o.nx + ix) * 4;
    if (!Number.isFinite(v)) { img.data.set([42, 50, 63, 255], d); continue; }       // no data: dark grey
    const i = Math.max(0, Math.min(255, Math.round(((v - o.min) / (o.max - o.min)) * 255)));
    img.data.set([o.lut[i * 4], o.lut[i * 4 + 1], o.lut[i * 4 + 2], 255], d);
  }
  const tmp = new OffscreenCanvas(o.nx, o.nz);
  tmp.getContext("2d").putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(tmp, M.l, M.t, pw, ph);
  const X = (gx) => M.l + ((gx + 0.5) / o.nx) * pw, Y = (gz) => M.t + ph - ((gz + 0.5) / o.nz) * ph;
  // Contours.
  if (o.lines) {
    ctx.strokeStyle = "rgba(15,18,24,0.85)"; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const [x0, z0, x1, z1] of contourSegments(o.lines, o.nx, o.nz, o.lineInterval)) { ctx.moveTo(X(x0), Y(z0)); ctx.lineTo(X(x1), Y(z1)); }
    ctx.stroke();
  }
  // Motion arrows in the slice's plane (see the header), on a ~30 px lattice.
  if (o.arrows) {
    const { along, w, stepKm } = o.arrows, kmPerPx = (o.nx * stepKm) / pw, mPerPx = o.zTopM / ph;
    const gap = 30, nxA = Math.max(1, Math.floor(pw / gap)), nzA = Math.max(1, Math.floor(ph / gap)), len = 11;
    ctx.lineCap = "round";
    for (const pass of ["halo", "ink"]) {
      // Dark ink, light outline: the vertical-motion colours are white near
      // still air, where white arrows vanished (checked on real data).
      ctx.strokeStyle = pass === "halo" ? "rgba(248,250,252,0.85)" : "#0b0f14";
      ctx.lineWidth = pass === "halo" ? 3.4 : 1.5;
      ctx.beginPath();
      for (let a = 0; a < nxA; a++) for (let b = 0; b < nzA; b++) {
        const ix = Math.floor(((a + 0.5) / nxA) * o.nx), iz = Math.floor(((b + 0.5) / nzA) * o.nz), k = iz * o.nx + ix;
        const d = arrowSlope(along[k], w[k], kmPerPx, mPerPx);
        if (!d) continue;
        const cx = X(ix), cy = Y(iz), ex = cx + d[0] * len / 2, ey = cy - d[1] * len / 2;
        ctx.moveTo(cx - d[0] * len / 2, cy + d[1] * len / 2); ctx.lineTo(ex, ey);
        for (const s of [1, -1]) ctx.lineTo(ex - 4 * (d[0] * 0.87 - s * d[1] * 0.5), ey + 4 * (d[1] * 0.87 + s * d[0] * 0.5)), ctx.moveTo(ex, ey);
      }
      ctx.stroke();
    }
  }
  // Pressure levels: each level's height along the slice (o.levels[].h, m per
  // column), in its colour, the focus level heavier, with a dark halo so it
  // reads over any fill. Gaps where the level is below ground.
  const Yz = (zm) => M.t + ph - (zm / o.zTopM) * ph;
  for (const pass of ["halo", "line"]) {
    for (const L of o.levels) {
      if (!L.h) continue;
      ctx.beginPath();
      let pen = false;
      for (let ix = 0; ix < L.h.length; ix++) {
        const z = L.h[ix];
        if (!Number.isFinite(z) || z > o.zTopM) { pen = false; continue; }
        const x = M.l + ((ix + 0.5) / L.h.length) * pw, y = Yz(z);
        if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        pen = true;
      }
      ctx.lineJoin = "round";
      if (pass === "halo") { ctx.strokeStyle = "rgba(10,12,16,0.75)"; ctx.lineWidth = (L.focus ? 2.6 : 1.4) + 2; }
      else { ctx.strokeStyle = L.color ?? "#d7dce2"; ctx.lineWidth = L.focus ? 2.6 : 1.4; }
      ctx.stroke();
    }
  }
  // Axes.
  ctx.fillStyle = "#c9d1db"; ctx.strokeStyle = "#8a94a3"; ctx.font = "10px -apple-system, Helvetica, Arial, sans-serif";
  ctx.textAlign = "right"; ctx.textBaseline = "middle";
  for (const t of o.yTicks) {
    const y = M.t + ph - (t.m / o.zTopM) * ph;
    if (y < M.t - 1) continue;
    ctx.fillText(t.label, M.l - 4, y); ctx.beginPath(); ctx.moveTo(M.l - 2, y); ctx.lineTo(M.l, y); ctx.stroke();
  }
  ctx.textAlign = "left";
  for (const L of o.levels) {
    const y = M.t + ph - (L.m / o.zTopM) * ph;
    if (y < M.t || y > M.t + ph) continue;
    ctx.fillStyle = L.color ?? "#c9d1db"; ctx.font = `${L.focus ? "700 " : ""}10px -apple-system, Helvetica, Arial, sans-serif`;
    ctx.fillText(L.name, W - M.r + 4, y); ctx.beginPath(); ctx.moveTo(W - M.r, y); ctx.lineTo(W - M.r + 2, y); ctx.stroke();
  }
  ctx.fillStyle = "#c9d1db"; ctx.font = "10px -apple-system, Helvetica, Arial, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  for (let ix = 0; ix < o.nx; ix++) {
    const lab = o.xLabel(ix);
    if (lab) { const x = X(ix); ctx.fillText(lab, x, M.t + ph + 4); ctx.beginPath(); ctx.moveTo(x, M.t + ph); ctx.lineTo(x, M.t + ph + 3); ctx.stroke(); }
  }
  ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillStyle = "#d7dce2";
  ctx.fillText(o.title, M.l, 3);
  ctx.strokeStyle = "#2a323f"; ctx.strokeRect(M.l, M.t, pw, ph);
  return { plot: { x: M.l, y: M.t, w: pw, h: ph }, stretch: o.arrows ? ((o.nx * o.arrows.stepKm * 1000) / pw) / (o.zTopM / ph) : null };
}

// The horizontal plane as a flat map chart (user request, 2026-09-29): the
// quantity at one height, lat/lon (plate carrée: the grid as it is), contour
// lines, coastlines and a 10-degree graticule. o: {values, lines, nlat, nlon,
// lat0, dlat, lon0, dlon, lineInterval, lut, min, max, coast ([[lon, lat]...]
// polylines, or null), title}. Returns the plot box, as drawSliceChart does.
export function drawMapChart(ctx, W, H, o) {
  // The map keeps its shape: degrees of longitude shortened by cos(mid-latitude),
  // fitted into the space and centred.
  const latS = o.lat0 + o.dlat * (o.nlat - 1), lonE = o.lon0 + o.dlon * (o.nlon - 1);
  const aspect = ((lonE - o.lon0) * Math.cos((((o.lat0 + latS) / 2) * Math.PI) / 180)) / (o.lat0 - latS);
  const aw = W - 44, ah = H - 38;
  const pw = Math.min(aw, ah * aspect), ph = pw / aspect;
  const M = { l: 34 + (aw - pw) / 2, r: 10, t: 18, b: 20 };
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#12161c"; ctx.fillRect(0, 0, W, H);
  const img = ctx.createImageData(o.nlon, o.nlat);
  for (let j = 0; j < o.nlat; j++) for (let i = 0; i < o.nlon; i++) {
    const v = o.values[j * o.nlon + i], d = (j * o.nlon + i) * 4;
    if (!Number.isFinite(v)) { img.data.set([42, 50, 63, 255], d); continue; }            // below ground / no data
    const k = Math.max(0, Math.min(255, Math.round(((v - o.min) / (o.max - o.min)) * 255))) * 4;
    img.data.set([o.lut[k], o.lut[k + 1], o.lut[k + 2], 255], d);
  }
  const tmp = new OffscreenCanvas(o.nlon, o.nlat);
  tmp.getContext("2d").putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(tmp, M.l, M.t, pw, ph);
  const X = (gi) => M.l + (gi / (o.nlon - 1)) * pw, Y = (gj) => M.t + (gj / (o.nlat - 1)) * ph;
  const lonX = (lon) => { let L = lon; while (L < o.lon0 - 1e-6) L += 360; return X((L - o.lon0) / o.dlon); };
  const latY = (lat) => Y((lat - o.lat0) / o.dlat);
  // Coastlines (breaking where a line jumps across the map's edge).
  if (o.coast) {
    ctx.strokeStyle = "rgba(20,24,30,0.9)"; ctx.lineWidth = 1; ctx.beginPath();
    for (const line of o.coast) {
      let px = null;
      for (const [lon, lat] of line) {
        const x = lonX(lon), y = latY(lat);
        if (px != null && Math.abs(x - px) < pw / 2) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        px = x;
      }
    }
    ctx.stroke();
  }
  // Contours: contourSegments counts rows upward; our rows run north to south, so y is the row itself.
  if (o.lines) {
    ctx.strokeStyle = "rgba(15,18,24,0.85)"; ctx.lineWidth = 1; ctx.beginPath();
    for (const [x0, z0, x1, z1] of contourSegments(o.lines, o.nlon, o.nlat, o.lineInterval)) { ctx.moveTo(X(x0), Y(z0)); ctx.lineTo(X(x1), Y(z1)); }
    ctx.stroke();
  }
  // Graticule and labels every 10 degrees.
  ctx.strokeStyle = "rgba(200,210,220,0.18)"; ctx.fillStyle = "#c9d1db"; ctx.font = "10px -apple-system, Helvetica, Arial, sans-serif";
  ctx.textAlign = "right"; ctx.textBaseline = "middle";
  for (let lat = Math.ceil(latS / 10) * 10; lat <= o.lat0; lat += 10) {
    const y = latY(lat); ctx.beginPath(); ctx.moveTo(M.l, y); ctx.lineTo(M.l + pw, y); ctx.stroke();
    ctx.fillText(lat === 0 ? "0°" : `${Math.abs(lat)}°${lat > 0 ? "N" : "S"}`, M.l - 3, y);
  }
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  for (let lon = Math.ceil(o.lon0 / 10) * 10; lon <= lonE; lon += 10) {
    const x = lonX(lon); ctx.beginPath(); ctx.moveTo(x, M.t); ctx.lineTo(x, M.t + ph); ctx.stroke();
    if (lon % 20 === 0) { const L = ((lon + 180) % 360) - 180; ctx.fillText(L === -180 || L === 180 ? "180°" : `${Math.abs(L)}°${L > 0 ? "E" : "W"}`, x, M.t + ph + 4); }
  }
  ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillStyle = "#d7dce2";
  ctx.fillText(o.title, M.l, 3);
  ctx.strokeStyle = "#2a323f"; ctx.strokeRect(M.l, M.t, pw, ph);
  return { plot: { x: M.l, y: M.t, w: pw, h: ph } };
}
