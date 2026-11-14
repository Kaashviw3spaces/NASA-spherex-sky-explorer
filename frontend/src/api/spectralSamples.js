const cache = new Map();
const TTL = 10 * 60 * 1000;

export function validateSpectralSamples(result) {
  if (!result || !Array.isArray(result.samples)) throw Error('Invalid measurement response. Please retry.');
  const samples = result.samples.filter(sample =>
    ['wavelength', 'bandwidth', 'flux', 'sigma'].every(key => Number.isFinite(sample[key])) &&
    sample.wavelength >= .75 && sample.wavelength <= 5 && sample.bandwidth > 0 && sample.sigma >= 0 &&
    typeof sample.unit === 'string' && sample.unit.replaceAll(' ', '') === 'MJy/sr');
  return { ...result, samples: samples.sort((a, b) => a.wavelength - b.wavelength), excluded: result.samples.length - samples.length };
}

export async function fetchSpectralSamples(ra, dec, signal, refresh = false) {
  const key = JSON.stringify([ra, dec]);
  signal?.throwIfAborted();
  const hit = cache.get(key);
  if (!refresh && hit && Date.now() - hit.savedAt < TTL) return hit.result;
  const response = await fetch(`/api/spherex/spectral-samples?${new URLSearchParams({ ra, dec })}`, { signal });
  const body = await response.json();
  if (!response.ok) throw Error(typeof body.detail === 'string' ? body.detail : 'SPHEREx measurements are unavailable. Please retry.');
  signal?.throwIfAborted();
  const result = validateSpectralSamples(body);
  cache.delete(key);
  cache.set(key, { savedAt: Date.now(), result });
  while (cache.size > 16) cache.delete(cache.keys().next().value);
  return result;
}
