// Inverse TAN projection for the common grid built by backend/build_tan_wcs.
// The grid uses CDELT1 < 0 and CDELT2 > 0; canvas row zero is displayed at the top.
export function gridToSky(x, y, ra, dec, fovArcmin, size = 512) {
  const radians = Math.PI / 180;
  const scale = fovArcmin / 60 / size * radians;
  const xi = -(x - (size - 1) / 2) * scale;
  const eta = (y - (size - 1) / 2) * scale;
  const d = dec * radians;
  const denominator = Math.cos(d) - eta * Math.sin(d);
  return {
    ra: ((ra + Math.atan2(xi, denominator) / radians) % 360 + 360) % 360,
    dec: Math.atan2(Math.sin(d) + eta * Math.cos(d), Math.hypot(denominator, xi)) / radians
  };
}
