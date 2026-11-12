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

  const cx = size * 0.5 + (epochIndex - 1) * (target.motionDxPerEpoch || -8.0);
  const cy = size * 0.5 + (epochIndex - 1) * (target.motionDyPerEpoch || 5.0);
  const varMod = 1 + Math.sin(epochIndex * 1.55) * (target.variabilityAmp || 0.08);
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
  const out = new Float32Array(baseBuffer);
  const scale = size / 512;

  // Target position in this epoch
  const cx = size * 0.5 + (epochIndex - 1) * 10.0 * scale;
  const cy = size * 0.5 + (epochIndex - 1) * -7.5 * scale;

  // sedRatio is in [0.05, 1.0] (1.0 at 1.65 um peak, ~0.18 at 3.05 um H2O dip)
  // Compute delta to add/subtract from the base cutout's central star + halo + spikes
  const deltaCore = (sedRatio - 0.55) * 2.2;
  const deltaHalo = (sedRatio - 0.55) * 0.95;

  splatGaussian(out, size, cx, cy, deltaCore, 6.0 * scale);
  splatGaussian(out, size, cx, cy, deltaHalo, 18.0 * scale);

  // Add subtle diffraction spikes at bright continuum wavelengths (sedRatio > 0.45)
  if (sedRatio > 0.35) {
    const spikeAmp = (sedRatio - 0.35) * 0.85;
    const spikeLen = Math.round(48 * scale * sedRatio);
    for (let d = -spikeLen; d <= spikeLen; d++) {
      const falloff = Math.exp(-Math.abs(d) / (16 * scale));
      const xH = Math.round(cx + d);
      const yH = Math.round(cy);
      if (xH >= 0 && xH < size && yH >= 0 && yH < size) {
        out[yH * size + xH] += spikeAmp * falloff;
        if (yH + 1 < size) out[(yH + 1) * size + xH] += spikeAmp * falloff * 0.45;
        if (yH - 1 >= 0) out[(yH - 1) * size + xH] += spikeAmp * falloff * 0.45;
      }
      const xV = Math.round(cx);
      const yV = Math.round(cy + d);
      if (xV >= 0 && xV < size && yV >= 0 && yV < size) {
        out[yV * size + xV] += spikeAmp * falloff;
        if (xV + 1 < size) out[yV * size + (xV + 1)] += spikeAmp * falloff * 0.45;
        if (xV - 1 >= 0) out[yV * size + (xV - 1)] += spikeAmp * falloff * 0.45;
      }
    }
  }

  // Modulate 12 prominent field stars by color temperature (short-IR blue vs long-IR dusty red)
  const baseSeed = target.ra * 0.37 + Math.abs(target.dec) * 1.13;
  const normWave = (wavelengthUm - 2.8) / 2.1; // [-1, +1] across 0.75..5.0 um
  for (let i = 0; i < 12; i++) {
    const sx = (48 + seededRandom(baseSeed + i * 13.7) * (512 - 96)) * scale;
    const sy = (48 + seededRandom(baseSeed + i * 29.3) * (512 - 96)) * scale;
    const isDustyRed = i % 2 === 0;
    const starDelta = isDustyRed ? normWave * 0.95 : -normWave * 0.95;
    splatGaussian(out, size, sx, sy, starDelta, 4.2 * scale);
    splatGaussian(out, size, sx, sy, starDelta * 0.35, 10.5 * scale);
  }

  // Clamp floor to sky background so negative deltas never create black holes
  for (let i = 0; i < out.length; i++) {
    if (out[i] < 0.08) out[i] = 0.08;
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
