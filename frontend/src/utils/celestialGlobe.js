const radians = Math.PI / 180;
export function globeProject(ra, dec, centerRa, centerDec) {
  const a = (ra - centerRa) * radians, d = dec * radians, c = centerDec * radians;
  return { x: -Math.cos(d) * Math.sin(a), y: Math.sin(d) * Math.cos(c) - Math.cos(d) * Math.sin(c) * Math.cos(a), z: Math.sin(d) * Math.sin(c) + Math.cos(d) * Math.cos(c) * Math.cos(a) };
}
export function globeUnproject(x, y, centerRa, centerDec) {
  if (x*x + y*y > 1) return null;
  const z = Math.sqrt(Math.max(0, 1-x*x-y*y));
  const a = centerRa*radians, d = centerDec*radians;
  const vx = z*Math.cos(d)*Math.cos(a) + x*Math.sin(a) - y*Math.sin(d)*Math.cos(a);
  const vy = z*Math.cos(d)*Math.sin(a) - x*Math.cos(a) - y*Math.sin(d)*Math.sin(a);
  const vz = z*Math.sin(d) + y*Math.cos(d);
  return { ra: (Math.atan2(vy,vx)/radians + 360)%360, dec: Math.asin(Math.max(-1,Math.min(1,vz)))/radians };
}
