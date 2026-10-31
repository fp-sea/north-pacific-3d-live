// Spherical-harmonic transforms for the Simulate mode's 3-D model (stage 4,
// docs/atmospheric_circulation_reference.md): the spectral transform method
// that global weather and climate models have used since the 1970s. Fields
// live as coefficients of spherical harmonics P_n^m(sin lat) e^{i m lon},
// triangular truncation at total wavenumber nt, and go to and from a Gaussian
// grid for the nonlinear terms. Derivatives and the Laplacian are exact in
// spectral space, and there's no pole problem.
//
// Conventions (as in the NCAR shallow-water model, Hack & Jakob 1992):
//   mu = sin(lat); P_n^m normalised so that the integral of P^2 over mu in
//   [-1, 1] is 1; Gaussian weights sum to 2.
//   grid -> spectral: f_nm = sum_j w_j F_m(mu_j) P_nm(mu_j),
//     F_m = (1/nlon) sum_i f(lon_i) e^{-i m lon_i}
//   spectral -> grid: F_m = sum_n f_nm P_nm; f = F_0 + 2 Re sum_{m>0} F_m e^{i m lon}
//   H_nm = (1 - mu^2) dP_nm/dmu.
//   Winds as U = u cos(lat), V = v cos(lat), which are smooth at the poles.
// Spectral arrays: {re, im} Float64Arrays of length ncoef, m-major (m = 0..nt,
// n = m..nt). Grids: Float64Array nlat * nlon, row j = latitude (south to
// north), column i = longitude 0..360 (east).
//
// Pure, no imports: node --test loads it.

export const A_EARTH = 6.371e6;

// Gaussian latitudes (mu, ascending) and weights for nlat points: the roots of P_nlat.
export function gaussian(nlat) {
  const mu = new Float64Array(nlat), w = new Float64Array(nlat);
  for (let k = 0; k < nlat; k++) {
    let x = Math.cos((Math.PI * (k + 0.75)) / (nlat + 0.5)), dp = 0;
    for (let it = 0; it < 100; it++) {
      let p0 = 1, p1 = x;
      for (let n = 2; n <= nlat; n++) { const p2 = ((2 * n - 1) * x * p1 - (n - 1) * p0) / n; p0 = p1; p1 = p2; }
      dp = (nlat * (x * p1 - p0)) / (x * x - 1);
      const dx = p1 / dp;
      x -= dx;
      if (Math.abs(dx) < 1e-15) break;
    }
    mu[nlat - 1 - k] = x; w[nlat - 1 - k] = 2 / ((1 - x * x) * dp * dp);
  }
  return { mu, w };
}

// In-place radix-2 complex FFT (sign -1 forward, +1 inverse; no scaling).
function fft(re, im, sign) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (sign * 2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

export function makeSHT(nt = 21, nlon = 64, nlat = 32, a = A_EARTH) {
  if (nlon & (nlon - 1)) throw new Error("nlon must be a power of two");
  if (nlon < 3 * nt + 1 || nlat < (3 * nt + 1) / 2) throw new Error("grid too coarse for alias-free products");
  const { mu, w } = gaussian(nlat);
  const lat = Float64Array.from(mu, (m) => Math.asin(m)), lon = Float64Array.from({ length: nlon }, (_, i) => (2 * Math.PI * i) / nlon);
  const idx = (n, m) => m * (nt + 1) - (m * (m - 1)) / 2 + (n - m);
  const ncoef = idx(nt, nt) + 1;
  const eps = (n, m) => (n <= m && n === m ? 0 : Math.sqrt((n * n - m * m) / (4 * n * n - 1)));
  // P and H at every Gaussian latitude, for n = m..nt (P computed to nt+1 for H).
  const P = new Float64Array(nlat * ncoef), H = new Float64Array(nlat * ncoef);
  const tmp = new Float64Array(nt + 3);
  for (let j = 0; j < nlat; j++) {
    const x = mu[j], s = Math.sqrt(1 - x * x);
    let pmm = 1 / Math.SQRT2;
    for (let m = 0; m <= nt; m++) {
      if (m > 0) pmm *= Math.sqrt((2 * m + 1) / (2 * m)) * s;
      tmp.fill(0);
      tmp[0] = pmm;                                             // n = m
      tmp[1] = Math.sqrt(2 * m + 3) * x * pmm;                  // n = m + 1
      for (let n = m + 2; n <= nt + 1; n++) tmp[n - m] = (x * tmp[n - m - 1] - eps(n - 1, m) * tmp[n - m - 2]) / eps(n, m);
      for (let n = m; n <= nt; n++) {
        const k = j * ncoef + idx(n, m), pn = tmp[n - m], pp = tmp[n - m + 1], pm = n > m ? tmp[n - m - 1] : 0;
        P[k] = pn;
        H[k] = -n * eps(n + 1, m) * pp + (n + 1) * eps(n, m) * pm;
      }
    }
  }
  const nn1 = new Float64Array(ncoef), mOf = new Int32Array(ncoef), nOf = new Int32Array(ncoef);
  for (let m = 0; m <= nt; m++) for (let n = m; n <= nt; n++) { const k = idx(n, m); nn1[k] = n * (n + 1); mOf[k] = m; nOf[k] = n; }

  const G = nlat * nlon, fr = new Float64Array(nlon), fi = new Float64Array(nlon);
  const Fr = new Float64Array(nlat * (nt + 1)), Fi = new Float64Array(nlat * (nt + 1));
  const spec = () => ({ re: new Float64Array(ncoef), im: new Float64Array(ncoef) });
  const grid = () => new Float64Array(G);

  // Fourier coefficients of each row (m = 0..nt), into Fr/Fi.
  function toFourier(g, outR = Fr, outI = Fi) {
    for (let j = 0; j < nlat; j++) {
      for (let i = 0; i < nlon; i++) { fr[i] = g[j * nlon + i]; fi[i] = 0; }
      fft(fr, fi, -1);
      for (let m = 0; m <= nt; m++) { outR[j * (nt + 1) + m] = fr[m] / nlon; outI[j * (nt + 1) + m] = fi[m] / nlon; }
    }
  }
  function fromFourier(inR, inI, g) {
    for (let j = 0; j < nlat; j++) {
      fr.fill(0); fi.fill(0);
      fr[0] = inR[j * (nt + 1)];
      for (let m = 1; m <= nt; m++) {
        const r = inR[j * (nt + 1) + m], im_ = inI[j * (nt + 1) + m];
        fr[m] = r; fi[m] = im_; fr[nlon - m] = r; fi[nlon - m] = -im_;
      }
      fft(fr, fi, 1);
      for (let i = 0; i < nlon; i++) g[j * nlon + i] = fr[i];
    }
  }
  // Legendre synthesis: F_m(mu_j) = sum_n c_nm B_nm(mu_j), B = P or H.
  function legendreSynth(s, B, outR, outI) {
    outR.fill(0); outI.fill(0);
    for (let j = 0; j < nlat; j++) {
      const off = j * ncoef, fo = j * (nt + 1);
      for (let k = 0; k < ncoef; k++) { const b = B[off + k], m = mOf[k]; outR[fo + m] += s.re[k] * b; outI[fo + m] += s.im[k] * b; }
    }
  }

  const Ar = new Float64Array(nlat * (nt + 1)), Ai = new Float64Array(nlat * (nt + 1));
  const Br = new Float64Array(nlat * (nt + 1)), Bi = new Float64Array(nlat * (nt + 1));
  const T = {
    nt, nlon, nlat, a, mu, w, lat, lon, ncoef, idx, nn1, mOf, nOf, P, H, spec, grid,
    // grid -> spectral
    analyze(g, out = spec()) {
      toFourier(g);
      out.re.fill(0); out.im.fill(0);
      for (let j = 0; j < nlat; j++) {
        const off = j * ncoef, fo = j * (nt + 1), wj = w[j];
        for (let k = 0; k < ncoef; k++) { const p = P[off + k] * wj, m = mOf[k]; out.re[k] += Fr[fo + m] * p; out.im[k] += Fi[fo + m] * p; }
      }
      return out;
    },
    // spectral -> grid
    synth(s, out = grid()) { legendreSynth(s, P, Ar, Ai); fromFourier(Ar, Ai, out); return out; },
    // U = u cos(lat), V = v cos(lat) from the spectra of vorticity and divergence.
    uv(zeta, div, U = grid(), V = grid()) {
      // psi = -a^2 zeta / n(n+1), chi likewise; U_m = sum[-psi H + i m chi P]/a, V_m = sum[i m psi P + chi H]/a
      Ar.fill(0); Ai.fill(0); Br.fill(0); Bi.fill(0);
      for (let j = 0; j < nlat; j++) {
        const off = j * ncoef, fo = j * (nt + 1);
        for (let k = 1; k < ncoef; k++) {
          const f = -a / nn1[k], pr = zeta.re[k] * f, pi = zeta.im[k] * f, cr = div.re[k] * f, ci = div.im[k] * f;   // psi/a, chi/a
          const p = P[off + k], h = H[off + k], m = mOf[k], fo2 = fo + m;
          Ar[fo2] += -pr * h - m * ci * p; Ai[fo2] += -pi * h + m * cr * p;
          Br[fo2] += -m * pi * p + cr * h; Bi[fo2] += m * pr * p + ci * h;
        }
      }
      fromFourier(Ar, Ai, U); fromFourier(Br, Bi, V);
      return { U, V };
    },
    // Spectra of the divergence and curl of a vector whose cos(lat)-weighted components are A, B
    // (A = a_east cos(lat), B = a_north cos(lat)): div = [dA/dlon + (1-mu^2) dB/dmu] / (a(1-mu^2)),
    // curl = [dB/dlon - (1-mu^2) dA/dmu] / (a(1-mu^2)), integrated by parts in mu.
    divCurl(Ag, Bg, div = spec(), curl = spec()) {
      toFourier(Ag, Ar, Ai); toFourier(Bg, Br, Bi);
      div.re.fill(0); div.im.fill(0); curl.re.fill(0); curl.im.fill(0);
      for (let j = 0; j < nlat; j++) {
        const off = j * ncoef, fo = j * (nt + 1), c = w[j] / (a * (1 - mu[j] * mu[j]));
        for (let k = 0; k < ncoef; k++) {
          const p = P[off + k] * c, h = H[off + k] * c, m = mOf[k], q = fo + m;
          // div: i m A P - B H ; curl: i m B P + A H
          div.re[k] += -m * Ai[q] * p - Br[q] * h; div.im[k] += m * Ar[q] * p - Bi[q] * h;
          curl.re[k] += -m * Bi[q] * p + Ar[q] * h; curl.im[k] += m * Br[q] * p + Ai[q] * h;
        }
      }
      return { div, curl };
    },
    // cos(lat)-weighted gradient of a spectral scalar: X = (1/a) df/dlon, Y = ((1-mu^2)/a) df/dmu.
    grad(s, X = grid(), Y = grid()) {
      Ar.fill(0); Ai.fill(0); Br.fill(0); Bi.fill(0);
      for (let j = 0; j < nlat; j++) {
        const off = j * ncoef, fo = j * (nt + 1);
        for (let k = 0; k < ncoef; k++) {
          const p = P[off + k] / a, h = H[off + k] / a, m = mOf[k], q = fo + m;
          Ar[q] += -m * s.im[k] * p; Ai[q] += m * s.re[k] * p;
          Br[q] += s.re[k] * h; Bi[q] += s.im[k] * h;
        }
      }
      fromFourier(Ar, Ai, X); fromFourier(Br, Bi, Y);
      return { X, Y };
    },
    // Laplacian in place: times -n(n+1)/a^2 (or its inverse, with n = 0 left at 0).
    lap(s, inverse = false) {
      for (let k = 0; k < ncoef; k++) {
        const f = inverse ? (nn1[k] ? -(a * a) / nn1[k] : 0) : -nn1[k] / (a * a);
        s.re[k] *= f; s.im[k] *= f;
      }
      return s;
    },
  };
  return T;
}
