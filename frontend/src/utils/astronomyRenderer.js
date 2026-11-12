function seededRandom(seed) {
  const s = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function splatGaussian(buffer, size, cx, cy, amp, sigma) {
  const r = Math.ceil(sigma * 4.5);
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(size - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(size - 1, Math.ceil(cy + r));
  const inv2s2 = 1 / (2 * sigma * sigma);

  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      buffer[y * size + x] += amp * Math.exp(-(dx * dx + dy * dy) * inv2s2);
    }
  }
}

export function generateStarfieldBuffer(target, epochIndex, wavelengthUm = 2.2, size = 256) {
  const buffer = new Float32Array(size * size);
  const baseSeed = target.ra * 0.37 + Math.abs(target.dec) * 1.13;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = seededRandom(baseSeed + x * 0.17 + y * 0.91 + epochIndex * 3.1);
      const grad = (y / size) * 0.05;
      buffer[y * size + x] = 0.08 + grad + n * 0.045;
    }
  }

  const starCount = 38;
  for (let i = 0; i < starCount; i++) {
    const sx = 18 + seededRandom(baseSeed + i * 3.1) * (size - 36);
    const sy = 18 + seededRandom(baseSeed + i * 7.7) * (size - 36);
    const mag = 0.35 + seededRandom(baseSeed + i * 11.3) * 1.6;
    const sigma = 1.4 + seededRandom(baseSeed + i * 5.9) * 1.3;
    const bandMod = 0.8 + 0.35 * Math.cos((wavelengthUm - 1.5) * 0.8 + i);
    splatGaussian(buffer, size, sx, sy, mag * bandMod, sigma);
  }

  const cx = size * 0.5 + (epochIndex - 1.5) * target.motionDxPerEpoch;
  const cy = size * 0.5 + (epochIndex - 1.5) * target.motionDyPerEpoch;
  const varMod = 1 + Math.sin(epochIndex * 1.55) * target.variabilityAmp;
  const iceAtten =
    1 - target.iceDepth.h2o * 0.45 * Math.exp(-Math.pow((wavelengthUm - 3.05) / 0.25, 2));
  const targetFlux = 2.6 * varMod * Math.max(0.35, iceAtten);
  splatGaussian(buffer, size, cx, cy, targetFlux, 2.2);

  return { buffer, size, targetX: cx, targetY: cy };
}

export function computeDifferenceBuffer(bufA, bufB) {
  const n = bufA.length;
  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < n; i++) {
    meanA += bufA[i];
    meanB += bufB[i];
  }
  meanA /= n;
  meanB /= n;

  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    varA += (bufA[i] - meanA) ** 2;
    varB += (bufB[i] - meanB) ** 2;
  }
  const stdA = Math.sqrt(varA / n) || 1;
  const stdB = Math.sqrt(varB / n) || 1;

  const diff = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const zA = (bufA[i] - meanA) / stdA;
    const zB = (bufB[i] - meanB) / stdB;
    diff[i] = 0.5 + (zA - zB) * 0.14;
  }
  return diff;
}

export function applyStretch(val, stretch = 'zscale', gain = 1.0) {
  const v = Math.max(0, val);
  if (stretch === 'log') {
    return Math.min(1, Math.log1p(v * 6 * gain) / Math.log1p(12));
  }
  if (stretch === 'asinh') {
    return Math.min(1, Math.asinh(v * 3.5 * gain) / Math.asinh(9));
  }
  const zmin = 0.085;
  const zmax = 1.45 / Math.max(0.4, gain);
  return Math.max(0, Math.min(1, (v - zmin) / (zmax - zmin)));
}

export function mapColormap(t, colormap = 'inferno') {
  const u = Math.max(0, Math.min(1, t));
  if (colormap === 'grayscale_r') {
    const c = Math.round((1 - u) * 242);
    return [c, c, c];
  }
  if (colormap === 'viridis') {
    const r = Math.round(255 * Math.min(1, Math.max(0, -0.35 + 1.4 * u * u)));
    const g = Math.round(255 * Math.min(1, Math.max(0, 0.12 + 0.85 * u)));
    const b = Math.round(255 * Math.min(1, Math.max(0, 0.34 + 0.55 * Math.sin(u * Math.PI))));
    return [r, g, b];
  }
  const r = Math.round(255 * Math.min(1, Math.pow(u, 0.55) * 1.15));
  const g = Math.round(255 * Math.min(1, Math.pow(u, 1.35) * 0.95));
  const b = Math.round(
    255 * Math.min(1, 0.08 + Math.sin(u * Math.PI * 0.9) * 0.42 + Math.pow(u, 3.2) * 0.6)
  );
  return [r, g, b];
}
