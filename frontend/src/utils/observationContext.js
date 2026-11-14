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
    return { kind: m.dataKind || 'unverified', provenance: m.provenance || 'Unknown', release: m.release || null, epoch: m.epoch || null, band: m.bandIndex || null, wavelengthUm: m.wavelengthUm || null, bunit: m.bunit || 'unknown', sourceUrl: sourceLink(m.sourceUrl) };
  });
  if (!sources.length) sources.push({ kind: 'simulated', provenance: 'Local preview', release: null, epoch: null, band: null, bunit: 'arbitrary', sourceUrl: null });
  return { kind: sources.every(s => s.kind === sources[0].kind) ? sources[0].kind : 'mixed', provenance: sources.map(s => s.provenance).join(' / '), release: sources.map(s => s.release || 'unknown').join(' / '), epoch: sources.map(s => s.epoch || 'unknown').join(' / '), bunit: sources.every(s => s.bunit === sources[0].bunit) ? sources[0].bunit : 'mixed', sources, mode: difference ? 'difference' : mode, savedAs: 'metadata-only' };
}
