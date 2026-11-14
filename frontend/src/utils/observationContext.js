export function displayedFrames(frames, activeIndex = 0, mode = 'static', difference = false) {
  if (!frames.length) return [];
  if (difference || ['swipe', 'curtain', 'side-by-side', 'diff'].includes(mode)) {
    return frames.length > 1 ? [frames[0], frames.at(-1)] : [frames[0]];
  }
  const index = ((activeIndex % frames.length) + frames.length) % frames.length;
  return [frames[index]];
}

export function sourceLink(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}

export function observationSnapshot(frames, activeIndex, mode, difference = false) {
  const chosen = displayedFrames(frames, activeIndex, mode, difference);
  const sources = chosen.map(frame => {
    const m = frame.meta || {};
    return { kind: m.dataKind || 'unverified', provenance: m.provenance || 'Unknown', release: m.release || null, epoch: m.epoch || null, band: m.bandIndex ?? null, wavelengthUm: m.wavelengthUm || null, spectralRange: m.spectralRange || null, processing: m.processing || null, bunit: m.bunit || 'unknown', sourceUrl: sourceLink(m.sourceUrl) };
  });
  if (!sources.length) sources.push({ kind: 'simulated', provenance: 'Local preview', release: null, epoch: null, band: null, bunit: 'arbitrary', sourceUrl: null });
  return { kind: sources.every(s => s.kind === sources[0].kind) ? sources[0].kind : 'mixed', provenance: sources.map(s => s.provenance).join(' / '), release: sources.map(s => s.release || 'unknown').join(' / '), epoch: sources.map(s => s.epoch || 'unknown').join(' / '), bunit: sources.every(s => s.bunit === sources[0].bunit) ? sources[0].bunit : 'mixed', sources, mode: difference ? 'difference' : mode, savedAs: 'metadata-only' };
}

// Compare only loaded context frames with compatible display metadata.
export function comparisonIssue(frames) {
  if (frames.length < 2) return 'Load two images to compare.';
  const [a, b] = [frames[0], frames.at(-1)];
  if (!a.cache_key || !b.cache_key) return 'Image comparison requires cached archive products.';
  for (const field of ['dataKind', 'bandIndex', 'bunit', 'width', 'height']) {
    if (a.meta?.[field] == null || a.meta[field] !== b.meta?.[field]) return 'Comparison needs matching band, units, dimensions and data type.';
  }
  if (a.meta.spectralRange !== b.meta.spectralRange) return 'Comparison requires the same detector wavelength range.';
  if (a.meta.spectralRange) {
    if (!a.qualityApplied || !b.qualityApplied || !a.spectral || !b.spectral) return 'Subtraction unavailable: pixel wavelengths or image quality could not be verified. Blink and side-by-side remain available.';
    let overlap = 0;
    for (let y = 0; y < a.spectral.length; y++) for (let x = 0; x < a.spectral[y].length; x++) {
      if (!Number.isFinite(a.nativePixels?.[y]?.[x]) || !Number.isFinite(b.nativePixels?.[y]?.[x])) continue;
      const [wa, ba] = a.spectral[y][x], [wb, bb] = b.spectral?.[y]?.[x] || [];
      if (![wa, ba, wb, bb].every(Number.isFinite) || ba <= 0 || bb <= 0 || Math.abs(wa-wb) > .1*Math.min(ba,bb) || Math.abs(ba-bb) > .1*Math.min(ba,bb)) return 'Pixel bandpasses differ: use Blink or Side-by-Side. Subtraction could confuse wavelength differences with changes.';
      overlap++;
    }
    if (overlap < 64) return 'Too little quality-checked overlap for subtraction.';
  }
  return '';
}
