// Anomalies: a field minus its 1991-2020 climatology (export_climatology).
// Pure functions, no imports, so node --test can load them.
//
// The reanalysis climatology exists at 00/06/12/18Z on a 2.5 deg grid.
// For any step it is interpolated here: bilinear onto the export grid, and
// linearly in time between the 6-hourly slots either side (at 03/09/15/21Z
// that misses part of the daily pressure tide -- up to ~1 hPa in the
// tropics; see the guide). The sea-temperature climatology is daily.

// The 6-hourly climatology slots around step `lead` (hours from the anchor,
// which is itself 00/06/12/18Z): {s0, s1, w} with clim = (1-w) s0 + w s1.
export function climSlots(lead) {
  const s0 = Math.floor(lead / 6) * 6;
  const w = (lead - s0) / 6;
  return w < 1e-9 ? { s0, s1: s0, w: 0 } : { s0, s1: s0 + 6, w };
}

// "YYYY-MM-DD" (UTC) of the step's valid time.
export const validDate = (anchorIso, lead) => new Date(Date.parse(anchorIso) + lead * 3600e3).toISOString().slice(0, 10);

// Bilinear resample of `src` on grid `sg` ({lat0, dlat, nlat, lon0, dlon, nlon},
// row-major, lat0 first) onto grid `dg`. NaN outside `sg`.
export function upsample(src, sg, dg) {
  const out = new Float32Array(dg.nlat * dg.nlon);
  for (let j = 0; j < dg.nlat; j++) {
    const fj = (dg.lat0 + dg.dlat * j - sg.lat0) / sg.dlat;
    const j0 = Math.floor(fj), tj = fj - j0;
    for (let i = 0; i < dg.nlon; i++) {
      const lon = (((dg.lon0 + dg.dlon * i - sg.lon0) % 360) + 360) % 360;
      const fi = lon / sg.dlon, i0 = Math.floor(fi), ti = fi - i0;
      const k = j * dg.nlon + i;
      if (j0 < 0 || i0 < 0 || j0 + (tj > 1e-9 ? 1 : 0) >= sg.nlat || i0 + (ti > 1e-9 ? 1 : 0) >= sg.nlon) { out[k] = NaN; continue; }
      const j1 = Math.min(j0 + 1, sg.nlat - 1), i1 = Math.min(i0 + 1, sg.nlon - 1);
      const a = src[j0 * sg.nlon + i0], b = src[j0 * sg.nlon + i1], c = src[j1 * sg.nlon + i0], d = src[j1 * sg.nlon + i1];
      out[k] = (1 - tj) * ((1 - ti) * a + ti * b) + tj * ((1 - ti) * c + ti * d);
    }
  }
  return out;
}

// field - ((1-w) climA + w climB), times `scale` (unit conversion, e.g.
// Pa -> hPa). Missing anywhere -> `missing`.
export function anomaly(field, climA, climB, w, { scale = 1, missing = NaN } = {}) {
  const n = field.length, out = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const c = w ? (1 - w) * climA[k] + w * climB[k] : climA[k];
    const v = (field[k] - c) * scale;
    out[k] = Number.isFinite(v) ? v : missing;
  }
  return out;
}
