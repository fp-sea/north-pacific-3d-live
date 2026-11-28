// Scene projections for the 3D atmosphere explorer.
//
// Flat: WGS84 (ellipsoidal) Mercator with central longitude 180, in km --
// the same projection cartopy uses for every chart on this site
// (ccrs.Mercator(central_longitude=180)) and pyproj uses for the manifest's
// control points and the ground texture's bounds. Ellipsoidal, not
// spherical: the two differ by ~18 km across the domain's latitude span,
// enough to misregister contours against the coast. Shifted so the
// domain's centre is the origin (x east, y north, z up).
//
// Globe: a sphere of the Earth's mean radius, turned so the same centre
// point sits at the origin with its local east/north/up along x/y/z -- the
// flat map is the tangent plane there, so the two views share a centre and
// orientation and can be blended ("morph" 0 = flat, 1 = globe). Heights go
// straight up in both (radially on the globe).
//
// Every mesh stores raw lat/lon and projects on the GPU through GEO_GLSL,
// with the matching JS version (geoPoint) for the few CPU-side needs.
import * as THREE from "three";

const A_KM = 6378.137;
const E = 0.0818191908426215;
const DEG = Math.PI / 180;
export const R_KM = 6371.0;

export function mercatorKm(lat, lon) {
  const lam = ((((lon - 180) % 360) + 540) % 360) - 180;   // longitude relative to 180, -180..180
  const phi = lat * DEG;
  const es = E * Math.sin(phi);
  const x = A_KM * lam * DEG;
  const y = A_KM * Math.log(Math.tan(Math.PI / 4 + phi / 2) * Math.pow((1 - es) / (1 + es), E / 2));
  return [x, y];
}

// Inverse of mercatorKm: (x, y) km -> [lat, lon], lon in 0..360. The
// ellipsoidal latitude has no closed form; a few fixed-point iterations
// converge to well under a metre.
export function inverseMercatorKm(x, y) {
  const lon = (((x / A_KM) / DEG + 180) % 360 + 360) % 360;
  const ts = Math.exp(-y / A_KM);
  let phi = Math.PI / 2 - 2 * Math.atan(ts);
  for (let k = 0; k < 6; k++) {
    const es = E * Math.sin(phi);
    phi = Math.PI / 2 - 2 * Math.atan(ts * Math.pow((1 - es) / (1 + es), E / 2));
  }
  return [phi / DEG, lon];
}

// Largest disagreement (km) between this module and pyproj over the
// manifest's control points [[lat, lon, x_km, y_km], ...].
export function selfCheck(controlPoints) {
  let worst = 0;
  for (const [lat, lon, x, y] of controlPoints) {
    const [px, py] = mercatorKm(lat, lon);
    worst = Math.max(worst, Math.hypot(px - x, py - y));
  }
  return worst;
}

// bounds: the manifest's ground bounds {x_west, x_east, y_south, y_north} (km).
// Returns the shared projection state: sizes, centre, the globe's rotation
// frame, and `uniforms` -- ONE object every material shares, so changing
// `uniforms.morph.value` moves the whole scene at once.
export function makeGeo(bounds) {
  const cx = (bounds.x_west + bounds.x_east) / 2;
  const cy = (bounds.y_south + bounds.y_north) / 2;
  const [lat0, lon0] = inverseMercatorKm(cx, cy);
  const p0 = lat0 * DEG, l0 = lon0 * DEG;
  // Rows of the rotation taking Earth-centred unit vectors to scene axes.
  const east = [-Math.sin(l0), Math.cos(l0), 0];
  const north = [-Math.sin(p0) * Math.cos(l0), -Math.sin(p0) * Math.sin(l0), Math.cos(p0)];
  const up = [Math.cos(p0) * Math.cos(l0), Math.cos(p0) * Math.sin(l0), Math.sin(p0)];
  const rot = new THREE.Matrix3().set(...east, ...north, ...up);
  const geo = {
    bounds,
    width: bounds.x_east - bounds.x_west,
    height: bounds.y_north - bounds.y_south,
    center: [lat0, lon0],
    uniforms: {
      morph: { value: 0 },
      // the hemisphere view's flat polar map (2026-10-17): 0 = the globe (or the flat Mercator map, by morph),
      // 1 = polar stereographic on the plane touching the North Pole; the Pacific view keeps it at 0
      polar: { value: 0 },
      geoCenter: { value: new THREE.Vector2(cx, cy) },
      geoRot: { value: rot },
    },
    // Scene position of (lat, lon) at height hKm (already exaggerated) plus an
    // optional local east/north offset (km), at the current morph.
    point(lat, lon, hKm = 0, offE = 0, offN = 0, morph = geo.uniforms.morph.value, polar = geo.uniforms.polar.value) {
      const [mx, my] = mercatorKm(Math.max(-89.5, Math.min(89.5, lat)), lon);   // the pole has no Mercator point (hemisphere view)
      const flat = new THREE.Vector3(mx - cx, my - cy, 0);
      const f = globeFrame(lat, lon, rot);
      const globe = f.up.clone().multiplyScalar(R_KM).add(new THREE.Vector3(0, 0, -R_KM));
      const up = new THREE.Vector3(0, 0, 1).lerp(f.up, morph).normalize();
      const e = new THREE.Vector3(1, 0, 0).lerp(f.east, morph).normalize();
      const n = new THREE.Vector3(0, 1, 0).lerp(f.north, morph).normalize();
      if (polar > 0) {
        const pf = polarFrame(lat, lon, rot), base = flat.lerp(globe, morph).lerp(pf.base, polar);
        return base.addScaledVector(e.lerp(pf.east, polar).normalize(), offE).addScaledVector(n.lerp(pf.north, polar).normalize(), offN)
          .addScaledVector(up.lerp(pf.up, polar).normalize(), hKm);
      }
      return flat.lerp(globe, morph).addScaledVector(e, offE).addScaledVector(n, offN).addScaledVector(up, hKm);
    },
    // Lat/lon where a ray meets the ground at the current morph (the flat
    // plane below morph 0.5, the sphere above); null when it misses.
    pick(ray, morph = geo.uniforms.morph.value) {
      if (geo.uniforms.polar.value > 0.5) {
        // the polar map: the plane touching the pole, normal along the Earth's axis
        const axis = new THREE.Vector3(0, 0, 1).applyMatrix3(rot), pole = axis.clone().multiplyScalar(R_KM).add(new THREE.Vector3(0, 0, -R_KM));
        const hit = ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(axis, pole), new THREE.Vector3());
        if (!hit) return null;
        const e = hit.clone().add(new THREE.Vector3(0, 0, R_KM)).applyMatrix3(rot.clone().transpose());
        const r = Math.hypot(e.x, e.y), colat = 2 * Math.atan(r / (2 * R_KM)) / DEG;
        return { latlon: [90 - colat, ((Math.atan2(e.y, e.x) / DEG) % 360 + 360) % 360], point: hit };
      }
      if (morph < 0.5) {
        const hit = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), new THREE.Vector3());
        return hit ? { latlon: inverseMercatorKm(hit.x + cx, hit.y + cy), point: hit } : null;
      }
      const hit = ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(0, 0, -R_KM), R_KM), new THREE.Vector3());
      if (!hit) return null;
      const v = hit.clone().add(new THREE.Vector3(0, 0, R_KM)).normalize().applyMatrix3(rot.clone().transpose());
      const lat = Math.asin(Math.max(-1, Math.min(1, v.z))) / DEG;
      const lon = ((Math.atan2(v.y, v.x) / DEG) % 360 + 360) % 360;
      return { latlon: [lat, lon], point: hit };
    },
  };
  return geo;
}

// Polar stereographic on the plane touching the North Pole: r = 2R tan(colatitude / 2), true to scale at the pole and
// 1.5 times at 20 N (the standard Northern Hemisphere chart; CPC's and the forecasters'). Earth-centred x toward 0 E,
// y toward 90 E, z the axis, turned into the scene by rot.
function polarFrame(lat, lon, rot) {
  const colat = Math.min(170, 90 - lat) * DEG, l = lon * DEG, r = 2 * R_KM * Math.tan(colat / 2);
  const t = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix3(rot);
  return {
    base: t(r * Math.cos(l), r * Math.sin(l), R_KM).add(new THREE.Vector3(0, 0, -R_KM)),
    up: t(0, 0, 1), east: t(-Math.sin(l), Math.cos(l), 0), north: t(-Math.cos(l), -Math.sin(l), 0),
  };
}

function globeFrame(lat, lon, rot) {
  const p = lat * DEG, l = lon * DEG;
  const t = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix3(rot);
  return {
    up: t(Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)),
    east: t(-Math.sin(l), Math.cos(l), 0),
    north: t(-Math.sin(p) * Math.cos(l), -Math.sin(p) * Math.sin(l), Math.cos(p)),
  };
}

// GLSL twin of geo.point(): include in a vertex shader and call
// geoPosition(latDeg, lonDeg, heightKm, offsetEastNorthKm). Uses the
// uniforms in geo.uniforms (spread them into the material's uniforms).
export const GEO_GLSL = /* glsl */ `
uniform float morph;
uniform float polar;
uniform vec2 geoCenter;
uniform mat3 geoRot;
const float GEO_A = ${A_KM.toFixed(3)};
const float GEO_E = ${E};
const float GEO_R = ${R_KM.toFixed(1)};
const float GEO_DEG = 0.017453292519943295;
vec3 geoPosition(float lat, float lon, float hKm, vec2 off) {
  float lam = mod(lon - 180.0 + 540.0, 360.0) - 180.0;
  float phi = lat * GEO_DEG;
  // the flat map's latitude stops at 89.5 deg: at the pole Mercator is infinite, and mix(inf, globe, 1.0) is NaN, which
  // would drop the hemisphere view's pole row even on the globe
  float phiM = clamp(phi, -1.5620696, 1.5620696);
  float es = GEO_E * sin(phiM);
  vec2 m = vec2(GEO_A * lam * GEO_DEG,
                GEO_A * log(tan(0.7853981633974483 + phiM * 0.5) * pow((1.0 - es) / (1.0 + es), GEO_E * 0.5))) - geoCenter;
  float l = lon * GEO_DEG;
  vec3 gUp = geoRot * vec3(cos(phi) * cos(l), cos(phi) * sin(l), sin(phi));
  vec3 gEast = geoRot * vec3(-sin(l), cos(l), 0.0);
  vec3 gNorth = geoRot * vec3(-sin(phi) * cos(l), -sin(phi) * sin(l), cos(phi));
  vec3 base = mix(vec3(m, 0.0), gUp * GEO_R - vec3(0.0, 0.0, GEO_R), morph);
  vec3 up = normalize(mix(vec3(0.0, 0.0, 1.0), gUp, morph));
  vec3 east = normalize(mix(vec3(1.0, 0.0, 0.0), gEast, morph));
  vec3 north = normalize(mix(vec3(0.0, 1.0, 0.0), gNorth, morph));
  if (polar > 0.0) {
    // polar stereographic on the plane touching the North Pole (geo.point's polarFrame)
    float colat = min(170.0, 90.0 - lat) * GEO_DEG, rr = 2.0 * GEO_R * tan(colat * 0.5);
    vec3 pBase = geoRot * vec3(rr * cos(l), rr * sin(l), GEO_R) - vec3(0.0, 0.0, GEO_R);
    base = mix(base, pBase, polar);
    up = normalize(mix(up, geoRot * vec3(0.0, 0.0, 1.0), polar));
    east = normalize(mix(east, geoRot * vec3(-sin(l), cos(l), 0.0), polar));
    north = normalize(mix(north, geoRot * vec3(-cos(l), -sin(l), 0.0), polar));
  }
  return base + east * off.x + north * off.y + up * hKm;
}`;
