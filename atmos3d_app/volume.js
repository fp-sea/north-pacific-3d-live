// The atmosphere as a volume: every grid column filled between the real
// pressure levels (as the slice does, section.js), on nz regular heights from
// 0 to zTopM, for one model step. Values between two levels go linearly with
// height between the levels' real heights; below the lowest level above
// ground and above the top level there is nothing (0). Never extrapolated.
//
// Stored as bytes for a 3-D texture: 0 = below the threshold (or no data),
// 1..255 = from the threshold up to vmax.
//
// Anomalies ("tanom", "ghanom": the level's temperature / height minus its
// 1991-2020 average, data.clim[p] = {t, gh} on the grid) and vertical motion
// ("w", cm/s, + rising; the level bundles' w) are SIGNED: every
// value is stored, 128 = zero, 1..255 = -vmax..+vmax (clamped), 0 = no data;
// the threshold is applied when drawing. Storing only the part beyond the
// threshold would break the blend between steps: mixing "nothing" (0) with a
// warm value reads as cold. Layout x (lon) fastest, then y
// (rows from grid.lat0 southward), then z (height): k = (z * nlat + y) * nlon + x.
//
// Pure, no imports: node --test loads it.

const KT = 1.943844;

// quantity: "speed" (kt), "rh" (%), "tanom" (K), "ghanom" (m), "w" (cm/s),
// "temp" (°C), "theta" (potential temperature, K: T (1000/p)^0.2857). thr:
// threshold (ignored when signed); vmax: value at 255 (+-vmax when signed).
// "dq": a precomputed per-level field (levels[p].dq), signed: the GFS - ECMWF difference (main.js).
export const SIGNED = new Set(["tanom", "ghanom", "w", "vort", "div", "fgen", "dq"]);
export const BELOW = new Set(["ri"]);
export function buildVolumeBytes(data, grid, quantity, thr, vmax, { nz = 48, zTopM = 12500 } = {}) {
  const signed = SIGNED.has(quantity);
  const { nlat, nlon } = grid, n = nlat * nlon;
  const out = new Uint8Array(n * nz);
  const ps = Object.keys(data.levels).map(Number).sort((a, b) => b - a);
  const L = ps.map((p) => data.levels[p]);
  const gh = new Float64Array(ps.length), val = new Float64Array(ps.length);
  // Richardson number: the shape is where it's BELOW the threshold (turbulent layers), stronger
  // further below; vmax is then the far (low) end.
  const below = BELOW.has(quantity);
  const dz = zTopM / nz, span = Math.max(1e-6, below ? thr - vmax : vmax - thr);
  for (let k = 0; k < n; k++) {
    const psfc = data.sfc.psfc[k] / 100;
    let m = 0;
    for (let i = 0; i < ps.length; i++) {
      if (ps[i] > psfc) continue;                              // below ground here
      const h = L[i].gh[k];
      if (!Number.isFinite(h)) continue;
      gh[m] = h;
      val[m] = quantity === "rh" ? L[i].r[k]
        : quantity === "tanom" ? L[i].t[k] - data.clim[ps[i]].t[k]
        : quantity === "ghanom" ? L[i].gh[k] - data.clim[ps[i]].gh[k]
        : quantity === "w" ? (L[i].w ? L[i].w[k] : NaN)
        : quantity === "dq" ? (L[i].dq ? L[i].dq[k] : NaN)
        : ["vort", "div", "ti", "stab", "ri", "thetae", "grad", "fgen"].includes(quantity) ? (L[i][quantity] ? L[i][quantity][k] : NaN)
        : quantity === "temp" ? L[i].t[k] - 273.15
        : quantity === "theta" ? L[i].t[k] * Math.pow(1000 / ps[i], 0.2857)
        : Math.hypot(L[i].u[k], L[i].v[k]) * KT;
      if (!Number.isFinite(val[m])) continue;
      m++;
    }
    if (m < 2) continue;
    let li = 0;
    for (let z = 0; z < nz; z++) {
      const zm = (z + 0.5) * dz;
      if (zm < gh[0]) continue;
      while (li < m - 2 && zm > gh[li + 1]) li++;
      if (zm > gh[li + 1]) break;
      const v = val[li] + ((zm - gh[li]) / (gh[li + 1] - gh[li])) * (val[li + 1] - val[li]);
      if (signed) { out[z * n + k] = Math.max(1, Math.min(255, 128 + Math.round((v / vmax) * 127))); continue; }
      if (below ? !(v <= thr) : !(v >= thr)) continue;
      out[z * n + k] = Math.min(255, 1 + Math.round(((below ? thr - v : v - thr) / span) * 254));
    }
  }
  return out;
}

// How much of the volume is filled (voxels above the threshold), for the note.
// Signed volumes: voxels whose |value| >= thr (vmax needed to decode).
export function filledShare(bytes, signed = null) {
  let c = 0;
  if (signed) {
    const cut = (signed.thr / signed.vmax) * 127;
    for (let i = 0; i < bytes.length; i++) if (bytes[i] && Math.abs(bytes[i] - 128) >= cut) c++;
  } else for (let i = 0; i < bytes.length; i++) if (bytes[i]) c++;
  return c / bytes.length;
}
