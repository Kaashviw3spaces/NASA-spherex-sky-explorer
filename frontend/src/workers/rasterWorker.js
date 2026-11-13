// Web Worker for off-main-thread astronomical stretch, colormap, and variance diff

const LUT_SIZE = 1024;
const LUTS = {
  inferno: new Uint8ClampedArray(LUT_SIZE * 3),
  viridis: new Uint8ClampedArray(LUT_SIZE * 3),
  grayscale_r: new Uint8ClampedArray(LUT_SIZE * 3),
};

(function buildLUTs() {
  for (let i = 0; i < LUT_SIZE; i++) {
    const u = i / (LUT_SIZE - 1);
    const offset = i * 3;

    // grayscale_r
    const c = Math.round((1 - u) * 242);
    LUTS.grayscale_r[offset] = c;
    LUTS.grayscale_r[offset + 1] = c;
    LUTS.grayscale_r[offset + 2] = c;

    // viridis
    LUTS.viridis[offset] = Math.round(255 * Math.min(1, Math.max(0, -0.35 + 1.4 * u * u)));
    LUTS.viridis[offset + 1] = Math.round(255 * Math.min(1, Math.max(0, 0.12 + 0.85 * u)));
    LUTS.viridis[offset + 2] = Math.round(255 * Math.min(1, Math.max(0, 0.34 + 0.55 * Math.sin(u * Math.PI))));

    // inferno
    LUTS.inferno[offset] = Math.round(255 * Math.min(1, Math.pow(u, 0.55) * 1.15));
    LUTS.inferno[offset + 1] = Math.round(255 * Math.min(1, Math.pow(u, 1.35) * 0.95));
    LUTS.inferno[offset + 2] = Math.round(
      255 * Math.min(1, 0.08 + Math.sin(u * Math.PI * 0.9) * 0.42 + Math.pow(u, 3.2) * 0.6)
    );
  }
})();

function computeCutLevels(buffer, totalPixels) {
  const sampleCount = 512;
  const step = Math.max(1, Math.floor(totalPixels / sampleCount));
  const samples = new Float32Array(sampleCount);
  let count = 0;
  for (let i = 0; i < totalPixels && count < sampleCount; i += step) {
    samples[count++] = buffer[i];
  }
  samples.subarray(0, count).sort();

  const pLow = samples[Math.floor(count * 0.02)];
  const pHigh = samples[Math.floor(count * 0.995)];
  const zmin = pLow;
  const zmax = pHigh > pLow ? pHigh : pLow + 1.0;
  return { zmin, zmax };
}

function applyStretch(val, zmin, zmax, stretch, gain) {
  const norm = (val - zmin) / (zmax - zmin);
  const u = Math.max(0, norm);
  let s;
  if (stretch === 'log') {
    s = Math.log1p(u * 50.0 * gain) / Math.log1p(50.0);
  } else if (stretch === 'asinh') {
    s = Math.asinh(u * 8.0 * gain) / Math.asinh(8.0);
  } else {
    // zscale / linear
    s = u * gain;
  }
  return Math.max(0, Math.min(1, s));
}

self.onmessage = (e) => {
  const { id, buffer, width, height, stretch, colormap, gain } = e.data;
  const totalPixels = width * height;
  const rgba = new Uint8ClampedArray(totalPixels * 4);
  const lut = LUTS[colormap] || LUTS.inferno;
  const maxLutIndex = LUT_SIZE - 1;

  const { zmin, zmax } = computeCutLevels(buffer, totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    const s = applyStretch(buffer[i], zmin, zmax, stretch, gain);
    const lutIdx = ((s * maxLutIndex + 0.5) | 0) * 3;
    const p = i << 2;
    rgba[p] = lut[lutIdx];
    rgba[p + 1] = lut[lutIdx + 1];
    rgba[p + 2] = lut[lutIdx + 2];
    rgba[p + 3] = 255;
  }
  self.postMessage({ id, rgba, width, height }, [rgba.buffer]);
};
