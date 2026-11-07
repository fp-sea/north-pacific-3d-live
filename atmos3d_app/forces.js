// The forces on a parcel of air (user pick 2026-10-09), from the focus level at a point: the pressure
// push (from high toward low pressure, harder where the isobars or height lines are closer), Earth's
// spin (the Coriolis effect: to the right of the wind in the northern hemisphere, stronger the faster
// the wind and the nearer the pole), and what's left over. If the air isn't speeding up, slowing or
// turning much, the three add to zero, so what's left is friction at the surface (the ground dragging
// the wind back, which is why surface wind crosses the isobars toward the low); aloft, where there's
// little friction, it's mostly the wind curving round a trough or ridge, or speeding up. The
// geostrophic wind is the wind at which the push and the spin balance exactly: along the lines.
// Pure, no imports: node --test loads it.

const OMEGA = 7.2921e-5, G = 9.80665;
export const KT_PER_HOUR = 3600 / 0.514444;     // 1 m/s^2 = 6998 kt per hour

// gx, gy: the field's slope per km, east and north (hPa/km at the surface, m/km of height aloft);
// u, v: the wind (m/s); surface: true for sea-level pressure (rho: the air's density, kg/m^3).
// Returns accelerations in m/s^2 as [east, north]: push, spin, rest; vg: the geostrophic wind (m/s),
// null within 5° of the equator; cross: the angle (degrees) the wind crosses the lines toward the low
// (negative: away from it), null where vg is.
export function forcesAt({ gx, gy, u, v, lat, surface = false, rho = 1.2 }) {
  const k = surface ? 0.1 / rho : G / 1000;       // hPa/km -> Pa/m is x0.1; height m/km -> m/m is /1000
  const push = [-k * gx, -k * gy];
  const f = 2 * OMEGA * Math.sin((lat * Math.PI) / 180);
  const spin = [f * v, -f * u];
  const rest = [-(push[0] + spin[0]), -(push[1] + spin[1])];
  let vg = null, cross = null;
  if (Math.abs(lat) >= 5) {
    vg = [push[1] / f, -push[0] / f];
    const sp = Math.hypot(u, v), sg = Math.hypot(vg[0], vg[1]);
    if (sp > 0.5 && sg > 0.5) {
      // the angle from the geostrophic wind to the wind, positive toward the low (to the left of vg in the north, the right in the south)
      const a = Math.atan2(vg[0] * v - vg[1] * u, vg[0] * u + vg[1] * v) * (180 / Math.PI);
      cross = f > 0 ? a : -a;
    }
  }
  return { push, spin, rest, vg, cross, f };
}
