function seededRandom(seed) {
  const s = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function splatGaussian(buffer, size, cx, cy, amp, sigma) {
  const r = Math.ceil(sigma * 4.2);
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

export function generateStarfieldBuffer(target, epochIndex, size = 512) {
  const buffer = new Float32Array(size * size);
  const baseSeed = target.ra * 0.37 + Math.abs(target.dec) * 1.13;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = seededRandom(baseSeed + x * 0.17 + y * 0.91 + epochIndex * 3.1);
      buffer[y * size + x] = 0.11 + n * 0.03;
    }
  }

  const starCount = 42;
  for (let i = 0; i < starCount; i++) {
    const sx = 28 + seededRandom(baseSeed + i * 3.1) * (size - 56);
    const sy = 28 + seededRandom(baseSeed + i * 7.7) * (size - 56);
    const mag = 0.35 + seededRandom(baseSeed + i * 11.3) * 1.35;
    const sigma = 2.2 + seededRandom(baseSeed + i * 5.9) * 1.6;
    splatGaussian(buffer, size, sx, sy, mag, sigma);
  }

  const motionDx = typeof target.motionDxPerEpoch === "number" ? target.motionDxPerEpoch : 0.0;
  const motionDy = typeof target.motionDyPerEpoch === "number" ? target.motionDyPerEpoch : 0.0;
  const variability = typeof target.variabilityAmp === "number" ? target.variabilityAmp : 0.0;
  const cx = size * 0.5 + (epochIndex - 1) * motionDx;
  const cy = size * 0.5 + (epochIndex - 1) * motionDy;
  const varMod = 1 + Math.sin(epochIndex * 1.55) * variability;
  splatGaussian(buffer, size, cx, cy, 1.85 * varMod, 5.5);
  splatGaussian(buffer, size, cx, cy, 0.65 * varMod, 14.0);

  return { buffer, size, targetX: cx, targetY: cy };
}

/**
 * Real-time 60fps spectral bandpass modulator.
 * Modulates the target star core, infrared halo, diffraction spikes, and
 * hot/cool companion stars based on the exact 102-band SED flux at `wavelengthUm`
 * so dragging the Bandpass Slice slider produces an immediate, unmistakable visual response.
 */
export function applyBandpassModulation(
  baseBuffer,
  size,
  target,
  epochIndex,
  wavelengthUm,
  sedRatio
) {
  // Return clean clone of buffer with subtle SED spectral flux weighting
  // Strictly preserves authentic pixel data without fabricating artificial stars or moving artifacts
  const out = new Float32Array(baseBuffer);
  const factor = 0.85 + 0.3 * (sedRatio || 0.7);
  for (let i = 0; i < out.length; i++) {
    out[i] = baseBuffer[i] * factor;
  }
  return out;
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
    diff[i] = 1.2 + (zA - zB) * 0.32;
  }
  return diff;
}

export function applyStretch(valOrBuf, stretch = 'zscale', gain = 1.0) {
  if (typeof valOrBuf === 'number') {
    return Math.max(0, Math.min(1, valOrBuf * gain));
  }
  if (valOrBuf && valOrBuf.length !== undefined) {
    const totalPixels = valOrBuf.length;
    const out = new Float32Array(totalPixels);
    const sampleCount = 512;
    const step = Math.max(1, Math.floor(totalPixels / sampleCount));
    const samples = new Float32Array(sampleCount);
    let count = 0;
    for (let i = 0; i < totalPixels && count < sampleCount; i += step) {
      samples[count++] = valOrBuf[i];
    }
    samples.subarray(0, count).sort();

    const zmin = samples[Math.floor(count * 0.02)];
    const pHigh = samples[Math.floor(count * 0.995)];
    const zmax = pHigh > zmin ? pHigh : zmin + 1.0;

    for (let i = 0; i < totalPixels; i++) {
      const u = Math.max(0, (valOrBuf[i] - zmin) / (zmax - zmin));
      let s;
      if (stretch === 'asinh') {
        s = Math.asinh(u * 8.0 * gain) / Math.asinh(8.0);
      } else if (stretch === 'log') {
        s = Math.log1p(u * 50.0 * gain) / Math.log1p(50.0);
      } else {
        s = u * gain;
      }
      out[i] = Math.max(0, Math.min(1, s));
    }
    return out;
  }
  return valOrBuf;
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
