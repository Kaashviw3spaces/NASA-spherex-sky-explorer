// Web Worker for off-main-thread astronomical stretch, colormap, and variance diff

function applyStretch(val, stretch, gain) {
  const v = Math.max(0, val);
  if (stretch === 'log') {
    return Math.min(1, Math.log1p(v * 6 * gain) / Math.log1p(12));
  }
  if (stretch === 'asinh') {
    return Math.min(1, Math.asinh(v * 3.5 * gain) / Math.asinh(9));
  }
  const zmin = 0.085;
  const zmax = 2.85 / Math.max(0.4, gain);
  return Math.max(0, Math.min(1, (v - zmin) / (zmax - zmin)));
}

function mapColormap(t, colormap) {
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

self.onmessage = (e) => {
  const { id, buffer, width, height, stretch, colormap, gain } = e.data;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < buffer.length; i++) {
    const s = applyStretch(buffer[i], stretch, gain);
    const [r, g, b] = mapColormap(s, colormap);
    const p = i * 4;
    rgba[p] = r;
    rgba[p + 1] = g;
    rgba[p + 2] = b;
    rgba[p + 3] = 255;
  }
  self.postMessage({ id, rgba, width, height }, [rgba.buffer]);
};
