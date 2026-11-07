// The parcel chart for "lift" (user pick 2026-10-09): a simple sounding, temperature across and height
// up (not a skew-T: easier to read the first time). The air around (red) and its dew point (green),
// and the lifted parcel (white): shaded orange where it's warmer than the air around it (buoyant, it
// rises by itself) and blue where it's colder (it has to be pushed). Marks: the cloud base, the top it
// reaches, and the lid (an inversion or very stable layer). Pure (canvas 2-D only), no imports.

// res: liftParcel's result; env: the column it lifted through. Returns {zMax, tMin, tMax} for tests.
export function drawParcel(ctx, W, H, res, env) {
  ctx.clearRect(0, 0, W, H);
  ctx.font = "9px system-ui, sans-serif";
  if (!res) return null;
  const ground = res.path[0].z;
  const zMax = Math.min(res.path[res.path.length - 1].z, Math.max(ground + 4000, (res.top ?? res.lcl?.z ?? 0) + 2000, (res.inversion?.top ?? 0) + 1500));
  const pts = res.path.filter((q) => q.z <= zMax);
  const envPts = env.filter((e) => e.z <= zMax + 1);
  const tds = envPts.filter((e) => Number.isFinite(e.RH)).map((e) => ({ z: e.z, Td: dew(e.T, e.RH) }));
  const ts = [...pts.map((q) => q.T), ...pts.map((q) => q.Te), ...tds.map((d) => d.Td), res.start.Td];
  const tMin = Math.floor(Math.min(...ts) / 5) * 5, tMax = Math.ceil(Math.max(...ts) / 5) * 5;
  const L = 26, R = 6, T = 6, B = 16, X = (t) => L + ((t - tMin) / (tMax - tMin)) * (W - L - R), Y = (z) => T + (1 - (z - ground) / (zMax - ground)) * (H - T - B);
  // the lid
  if (res.inversion && res.inversion.base < zMax) {
    ctx.fillStyle = "rgba(170,120,255,0.18)";
    ctx.fillRect(L, Y(Math.min(res.inversion.top, zMax)), W - L - R, Y(res.inversion.base) - Y(Math.min(res.inversion.top, zMax)));
    ctx.fillStyle = "#c9b3ff"; ctx.fillText(res.inversion.lapse < 0 ? "inversion" : "very stable layer", W - R - 82, Y(res.inversion.base) - 3);
  }
  // buoyancy shading between parcel and air
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    ctx.fillStyle = a.buoy + b.buoy > 0 ? "rgba(255,150,40,0.45)" : "rgba(80,150,255,0.30)";
    ctx.beginPath(); ctx.moveTo(X(a.T), Y(a.z)); ctx.lineTo(X(b.T), Y(b.z)); ctx.lineTo(X(b.Te), Y(b.z)); ctx.lineTo(X(a.Te), Y(a.z)); ctx.closePath(); ctx.fill();
  }
  // axes
  ctx.strokeStyle = "rgba(160,160,160,0.6)"; ctx.lineWidth = 1; ctx.strokeRect(L, T, W - L - R, H - T - B);
  ctx.fillStyle = "#cfd6de";
  for (let t = tMin; t <= tMax; t += (tMax - tMin > 40 ? 20 : 10)) ctx.fillText(`${t}°`, X(t) - 6, H - 4);
  const km = Math.ceil((zMax - ground) / 4000) || 1;
  for (let z = 0; z <= zMax - ground; z += 1000 * km) ctx.fillText(`${(z + ground) / 1000 | 0} km`, 1, Y(z + ground) + 3);
  const line = (arr, color, width, dash = []) => {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.beginPath();
    arr.forEach(([t, z], i) => (i ? ctx.lineTo(X(t), Y(z)) : ctx.moveTo(X(t), Y(z)))); ctx.stroke(); ctx.setLineDash([]);
  };
  line(envPts.map((e) => [e.T, e.z]), "#ff6b6b", 2);
  line(tds.map((d) => [d.Td, d.z]), "#51cf66", 1.6);
  line(pts.map((q) => [q.T, q.z]), "#ffffff", 1.8, [5, 3]);
  // cloud base and top
  const mark = (z, text) => { if (z == null || z > zMax) return; ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.beginPath(); ctx.moveTo(L, Y(z)); ctx.lineTo(L + 14, Y(z)); ctx.stroke(); ctx.fillStyle = "#fff"; ctx.fillText(text, L + 16, Y(z) + 3); };
  mark(res.lcl?.z, `cloud base ${fmtKm(res.lcl?.z)}`);
  if (res.top != null && res.top <= zMax) mark(res.top, `top ${fmtKm(res.top)}`);
  return { zMax, tMin, tMax };
}
const dew = (tc, rh) => { const g = Math.log(Math.max(rh, 0.1) / 100) + (17.67 * tc) / (tc + 243.5); return (243.5 * g) / (17.67 - g); };
const fmtKm = (z) => (z == null ? "" : z < 1000 ? `${Math.round(z / 10) * 10} m` : `${(z / 1000).toFixed(1)} km`);
