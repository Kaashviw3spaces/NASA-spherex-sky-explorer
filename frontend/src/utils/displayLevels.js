// A deterministic, spatially distributed sample avoids repeatedly selecting one image column.
// These levels affect display contrast only; source pixels and exports are unchanged.
export function computeCutLevels(buffer, totalPixels = buffer.length) {
  const count = Math.min(4096, totalPixels);
  if (!count) return { zmin: 0, zmax: 1 };
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const fraction = (Math.imul(i + 1, 0x9e3779b1) >>> 0) / 4294967296;
    samples[i] = buffer[Math.floor(fraction * totalPixels)];
  }
  const finite = Array.from(samples).filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length) return { zmin: 0, zmax: 1 };
  const zmin = finite[Math.floor(finite.length * .02)];
  const high = finite[Math.floor(finite.length * .995)];
  return { zmin, zmax: high > zmin ? high : zmin + 1 };
}
