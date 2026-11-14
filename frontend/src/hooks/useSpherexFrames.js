import { useEffect, useState } from 'react';

const previewCache = new Map();
const TTL = 10 * 60 * 1000;

// Adapt real archive previews to the existing 512px worker/viewer contract.
export default function useSpherexFrames(target, { metadataOnly = false } = {}) {
  const key = JSON.stringify([target.ra, target.dec, target.fovArcmin, metadataOnly]);
  const [state, setState] = useState(null), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const cached = previewCache.get(key);
    if (cached && Date.now() - cached.savedAt < TTL && attempt === 0) { setState({ key, frames: cached.frames, status: 'ready', error: '' }); return () => controller.abort(); }
    setState({ key, frames: cached?.frames || [], status: 'loading', error: '' });
    const json = async url => { const response = await fetch(url, { signal: controller.signal }); const body = await response.json(); if (!response.ok) throw Error(body.detail || 'Archive request failed.'); return body; };
    (async () => {
      const result = await json(`/api/spherex/images?ra=${target.ra}&dec=${target.dec}`);
      const first = result.images[0];
      if (!first) throw Error('No SPHEREx DR1 observations returned at this position. No simulation is substituted.');
      const matching = result.images.filter(item => item.minUm === first.minUm && item.maxUm === first.maxUm);
      const chosen = [...new Map([matching[0], matching[Math.floor(matching.length / 2)], matching.at(-1)].map(item => [item.url, item])).values()];
      if (metadataOnly) {
        const frames = chosen.map(record => ({ meta: { dataKind: 'observed', provenance: 'SPHEREx / NASA-IPAC IRSA', release: 'DR1', epoch: record.date + ' UTC', sourceUrl: record.url, spectralRange: `${record.minUm}–${record.maxUm} µm` } }));
        previewCache.delete(key); previewCache.set(key, { frames, savedAt: Date.now() });
        while (previewCache.size > 12) previewCache.delete(previewCache.keys().next().value);
        if (!controller.signal.aborted) setState({ key, frames, status: 'ready', error: '' });
        return;
      }
      const loaded = new Map();
      const outcomes = await Promise.allSettled(chosen.map(async (record, index) => {
        const image = await json(`/api/spherex/cutout?ra=${target.ra}&dec=${target.dec}&fov=${Math.min(10, Math.max(1, target.fovArcmin || 5))}&url=${encodeURIComponent(record.url)}`);
        const buffer = new Float32Array(512 * 512);
        // Bilinear display enlargement reduces stair steps without claiming extra resolution.
        for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
          const sx = x * (image.width - 1) / 511, sy = y * (image.height - 1) / 511;
          const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(x0 + 1, image.width - 1), y1 = Math.min(y0 + 1, image.height - 1);
          const corners = [image.pixels[y0][x0], image.pixels[y0][x1], image.pixels[y1][x0], image.pixels[y1][x1]];
          const dx = sx - x0, dy = sy - y0;
          buffer[y * 512 + x] = corners.every(v => v !== null && Number.isFinite(v)) ? corners[0] * (1-dx) * (1-dy) + corners[1] * dx * (1-dy) + corners[2] * (1-dx) * dy + corners[3] * dx * dy : NaN;
        }
        loaded.set(index, { buffer, cache_key: image.cache_key, spectral: image.spectral, qualityApplied: image.qualityApplied, nativePixels: image.pixels, meta: { width: 512, height: 512, gridWidth: image.width, gridHeight: image.height, dataKind: 'observed', provenance: 'SPHEREx / NASA-IPAC IRSA', release: 'DR1', epoch: record.date + ' UTC', bunit: image.unit, sourceUrl: record.url, wavelengthUm: (record.minUm + record.maxUm) / 2, bandIndex: 0, spectralRange: `${record.minUm}–${record.maxUm} µm`, processing: image.processing } });
        const frames = [...loaded.entries()].sort((a, b) => a[0] - b[0]).map(([, frame]) => frame);
        if (!controller.signal.aborted) setState({ key, frames, status: 'loading', error: '' });
      }));
      controller.signal.throwIfAborted();
      const frames = [...loaded.entries()].sort((a, b) => a[0] - b[0]).map(([, frame]) => frame);
      if (outcomes.some(result => result.status === 'rejected')) throw Error('Some exposures could not be retrieved. Retry to load missing images.');
      previewCache.delete(key); previewCache.set(key, { frames, savedAt: Date.now() });
      while (previewCache.size > 12) previewCache.delete(previewCache.keys().next().value);
      setState({ key, frames, status: 'ready', error: '' });
    })().catch(error => { if (!controller.signal.aborted) setState(previous => ({ key, frames: previous?.key === key ? previous.frames : [], status: 'error', error: previous?.frames?.length ? 'Some additional exposures could not be retrieved. Loaded observations remain available.' : error.message })); });
    return () => controller.abort();
  }, [key, attempt]);
  return { ...(state?.key === key ? state : previewCache.has(key) ? { frames: previewCache.get(key).frames, status: 'loading', error: '' } : { frames: [], status: 'loading', error: '' }), requestKey: key, retry: () => setAttempt(value => value + 1) };
}
