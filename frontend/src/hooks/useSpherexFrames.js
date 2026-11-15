import { useEffect, useState } from 'react';

const previewCache = new Map();
const TTL = 10 * 60 * 1000;

// Adapt real archive previews to the existing 512px worker/viewer contract.
export default function useSpherexFrames(target, { metadataOnly = false, investigation = null } = {}) {
  const key = JSON.stringify([target.ra, target.dec, target.fovArcmin, metadataOnly, investigation?.id]);
  const [state, setState] = useState(null), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const cached = previewCache.get(key);
    if (cached && Date.now() - cached.savedAt < TTL && attempt === 0) { setState({ key, frames: cached.frames, status: 'ready', error: '' }); return () => controller.abort(); }
    setState({ key, frames: cached?.frames || [], status: 'loading', error: '' });
    const json = async url => {
      for (let retry = 0; retry < 3; retry++) {
        const response = await fetch(url, { signal: controller.signal });
        const body = await response.json().catch(() => ({detail:'Archive response unavailable. Please retry.'}));
        if (response.ok) return body;
        if (retry < 2 && [502,503,504].includes(response.status)) {
          await new Promise(r => setTimeout(r, 1000 * (retry + 1)));
          continue;
        }
        throw Error(body.detail || 'Archive request failed.');
      }
    };
    (async () => {
      const result = investigation ? { images: investigation.inputs } : await json(`/api/spherex/images?ra=${target.ra}&dec=${target.dec}`);
      const first = result.images[0];
      if (!first) throw Error('No SPHEREx DR1 observations returned at this position. No simulation is substituted.');
      const matching = result.images.filter(item => item.minUm === first.minUm && item.maxUm === first.maxUm);
      const chosen = investigation ? investigation.inputs : [...new Map([matching[0], matching[Math.floor(matching.length / 2)], matching.at(-1)].map(item => [item.url, item])).values()];
      if (metadataOnly) {
        const frames = chosen.map(record => ({ meta: { dataKind: 'observed', provenance: 'SPHEREx / NASA-IPAC IRSA', release: 'DR1', epoch: record.date + ' UTC', sourceUrl: record.url, spectralRange: `${record.minUm}–${record.maxUm} µm` } }));
        previewCache.delete(key); previewCache.set(key, { frames, savedAt: Date.now() });
        while (previewCache.size > 12) previewCache.delete(previewCache.keys().next().value);
        if (!controller.signal.aborted) setState({ key, frames, status: 'ready', error: '' });
        return;
      }
      const loaded = new Map();
      const reserved = new Set(chosen.map(record => record.url));
      const fetchExposure = async record => {
        const image = await json(`/api/spherex/cutout?ra=${target.ra}&dec=${target.dec}&fov=${Math.min(10, Math.max(1, target.fovArcmin || 5))}&url=${encodeURIComponent(record.url)}`);
        if (!image.pixels?.some(row => row.some(Number.isFinite))) throw Error('No quality-checked coverage in this exposure.');
        return image;
      };
      const outcomes = await Promise.allSettled(chosen.map(async (record, index) => {
        let image;
        try { image = await fetchExposure(record); }
        catch (error) {
          controller.signal.throwIfAborted();
          // A documented investigation must keep its exact inputs. Never replace
          // an unavailable exposure while retaining the recorded conclusion.
          if (investigation) throw error;
          const originalIndex = matching.indexOf(record);
          const alternate = matching.map((candidate,i) => ({candidate,distance:Math.abs(i-originalIndex)})).filter(({candidate}) => !reserved.has(candidate.url)).sort((a,b) => a.distance-b.distance)[0]?.candidate;
          if (!alternate) throw error;
          reserved.add(alternate.url);
          record = alternate;
          image = await fetchExposure(record);
        }
        const buffer = new Float32Array(512 * 512);
        // Bilinear display enlargement reduces stair steps without claiming extra resolution.
        for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
          const sx = x * (image.width - 1) / 511, sy = y * (image.height - 1) / 511;
          const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(x0 + 1, image.width - 1), y1 = Math.min(y0 + 1, image.height - 1);
          const corners = [image.pixels[y0][x0], image.pixels[y0][x1], image.pixels[y1][x0], image.pixels[y1][x1]];
          const dx = sx - x0, dy = sy - y0;
          const weights = [(1 - dx) * (1 - dy), dx * (1 - dy), (1 - dx) * dy, dx * dy];
          let sumVal = 0, sumWeight = 0;
          for (let c = 0; c < 4; c++) {
            const v = corners[c];
            if (v !== null && Number.isFinite(v)) {
              sumVal += v * weights[c];
              sumWeight += weights[c];
            }
          }
          buffer[y * 512 + x] = sumWeight > 0 ? sumVal / sumWeight : NaN;
        }
        loaded.set(index, { buffer, cache_key: image.cache_key, spectral: image.spectral, qualityApplied: image.qualityApplied, nativePixels: image.pixels, meta: { width: 512, height: 512, gridWidth: image.width, gridHeight: image.height, dataKind: 'observed', provenance: 'SPHEREx / NASA-IPAC IRSA', release: 'DR1', epoch: record.date + ' UTC', bunit: image.unit, sourceUrl: record.url, wavelengthUm: (record.minUm + record.maxUm) / 2, bandIndex: 0, spectralRange: `${record.minUm}–${record.maxUm} µm`, processing: image.processing } });
        const frames = [...loaded.values()].sort((a,b) => a.meta.epoch.localeCompare(b.meta.epoch));
        if (!controller.signal.aborted) setState({ key, frames, status: 'loading', error: '' });
      }));
      controller.signal.throwIfAborted();
      const frames = [...loaded.values()].sort((a,b) => a.meta.epoch.localeCompare(b.meta.epoch));
      if (!frames.length) throw Error('No SPHEREx exposures could be retrieved at this position. Retry to query the archive again.');
      if (investigation && outcomes.some(outcome => outcome.status === 'rejected')) throw Error('The documented pair is incomplete. Retry to retrieve the exact two inputs.');
      previewCache.delete(key); previewCache.set(key, { frames, savedAt: Date.now() });
      while (previewCache.size > 12) previewCache.delete(previewCache.keys().next().value);
      setState({ key, frames, status: 'ready', error: '' });
    })().catch(error => { if (!controller.signal.aborted) setState(previous => ({ key, frames: previous?.key === key ? previous.frames : [], status: 'error', error: previous?.frames?.length ? 'Some additional exposures could not be retrieved. Loaded observations remain available.' : error.message })); });
    return () => controller.abort();
  }, [key, attempt]);
  return { ...(state?.key === key ? state : previewCache.has(key) ? { frames: previewCache.get(key).frames, status: 'loading', error: '' } : { frames: [], status: 'loading', error: '' }), requestKey: key, retry: () => setAttempt(value => value + 1) };
}
