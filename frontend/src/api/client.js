// Binary API client for SPHEREx Sky Explorer FastAPI proxy

function parseRasterHeaders(headers) {
  const dims = (headers.get('X-Raster-Dimensions') || '512,512').split(',').map(Number);
  return {
    width: dims[0] || 512,
    height: dims[1] || 512,
    bitpix: Number(headers.get('X-Raster-Bitpix') || 16),
    bscale: parseFloat(headers.get('X-BSCALE') || '1'),
    bzero: parseFloat(headers.get('X-BZERO') || '0'),
    bunit: headers.get('X-BUNIT') || 'MJy/sr',
    crval: headers.get('X-WCS-CRVAL') || '',
    crpix: headers.get('X-WCS-CRPIX') || '',
    cdelt: headers.get('X-WCS-CDELT') || '',
    ctype: headers.get('X-WCS-CTYPE') || 'RA---TAN,DEC--TAN',
    epoch: headers.get('X-Observation-Epoch') || '',
    provenance: headers.get('X-Survey-Provenance') || '',
    bandIndex: Number(headers.get('X-Band-Index') || 42),
    wavelengthUm: parseFloat(headers.get('X-Band-Wavelength-Um') || '2.2'),
    diffConfidence: headers.get('X-Diff-Confidence')
      ? parseFloat(headers.get('X-Diff-Confidence'))
      : null
  };
}

export async function fetchBinaryRaster(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Raster fetch failed: ${resp.status}`);
  const meta = parseRasterHeaders(resp.headers);
  const buf = await resp.arrayBuffer();
  const u16 = new Uint16Array(buf);
  const floatData = new Float32Array(u16.length);
  const { bscale, bzero } = meta;
  for (let i = 0; i < u16.length; i++) {
    floatData[i] = u16[i] * bscale + bzero;
  }
  return { buffer: floatData, meta };
}

export async function resolveTargetApi(query) {
  const resp = await fetch(`/api/resolve?q=${encodeURIComponent(query)}`);
  if (!resp.ok) throw new Error(`Resolve failed: ${resp.status}`);
  return resp.json();
}

export async function fetchSpectrumApi(
  ra,
  dec,
  radiusArcsec = 12.4,
  centerRa = null,
  centerDec = null,
  fovArcmin = 5.0
) {
  const params = new URLSearchParams({
    ra: String(ra),
    dec: String(dec),
    radius_arcsec: String(radiusArcsec),
    fov_arcmin: String(fovArcmin)
  });
  if (centerRa !== null && centerDec !== null) {
    params.set('center_ra', String(centerRa));
    params.set('center_dec', String(centerDec));
  }
  const resp = await fetch(`/api/spectrum?${params.toString()}`);
  if (!resp.ok) throw new Error(`Spectrum fetch failed: ${resp.status}`);
  const buf = await resp.arrayBuffer();
  const floats = new Float32Array(buf);
  const provenance = resp.headers.get('X-Survey-Provenance') || 'SPHEREx-Survey1';

  const bands = [];
  for (let i = 0; i < floats.length; i++) {
    const w = 0.75 + (i / Math.max(1, floats.length - 1)) * 4.25;
    const flux = floats[i];
    bands.push({
      bandId: i + 1,
      wavelength: Number(w.toFixed(4)),
      flux: Number(flux.toFixed(3)),
      err: Number((flux * 0.045).toFixed(3)),
      qualityFlag: 0
    });
  }
  return { bands, provenance };
}

// In-memory cutout cache keyed by coordinates to share instantly across pages
const cutoutsMemoryCache = new Map();

export function getCutoutCacheKey(ra, dec, fovArcmin = 5.0) {
  const r = typeof ra === 'number' ? ra : parseFloat(ra);
  const d = typeof dec === 'number' ? dec : parseFloat(dec);
  const f = typeof fovArcmin === 'number' ? fovArcmin : parseFloat(fovArcmin);
  return `${r.toFixed(4)}_${d.toFixed(4)}_${f.toFixed(1)}`;
}

export function getCachedCutouts(ra, dec, fovArcmin = 5.0) {
  if (ra == null || dec == null || isNaN(ra) || isNaN(dec)) return null;
  const key = getCutoutCacheKey(ra, dec, fovArcmin);
  const found = cutoutsMemoryCache.get(key);
  return found && found.length > 0 ? found : null;
}

export function setCachedCutouts(ra, dec, fovArcmin = 5.0, frames) {
  if (ra == null || dec == null || isNaN(ra) || isNaN(dec)) return;
  const key = getCutoutCacheKey(ra, dec, fovArcmin);
  if (Array.isArray(frames) && frames.length > 0) {
    cutoutsMemoryCache.set(key, frames);
  }
}

export async function fetchCutoutsWithPolling(
  { ra, dec, fovArcmin = 5.0, bands = [42], epochs = null },
  onProgress,
  signal
) {
  // If already in memory, serve immediately to eliminate any blank frame or lag
  const cached = getCachedCutouts(ra, dec, fovArcmin);
  if (cached && cached.length > 0) {
    if (onProgress) onProgress(cached, true);
  }

  const resp = await fetch('/api/jobs/cutouts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ra, dec, fov_arcmin: fovArcmin, bands, epochs }),
    signal
  });
  if (!resp.ok) {
    if (cached) return cached;
    throw new Error(`Cutout job failed: ${resp.status}`);
  }

  const initial = await resp.json();
  const loadedMap = new Map();

  const ingestItems = async (items) => {
    for (const item of items) {
      if (loadedMap.has(item.cache_key)) continue;
      const decoded = await fetchBinaryRaster(item.raster_url);
      loadedMap.set(item.cache_key, { ...item, ...decoded });
      const currentList = Array.from(loadedMap.values());
      setCachedCutouts(ra, dec, fovArcmin, currentList);
      if (onProgress) onProgress(currentList, false);
    }
  };

  if (resp.status === 200 && initial.rasters) {
    await ingestItems(initial.rasters);
    const result = Array.from(loadedMap.values());
    setCachedCutouts(ra, dec, fovArcmin, result);
    if (onProgress) onProgress(result, true);
    return result;
  }

  // 202 Accepted async polling loop
  const statusUrl = initial.status_url;
  let waitMs = initial.poll_interval_ms || 350;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (signal?.aborted) break;
    await new Promise((r) => setTimeout(r, waitMs));
    const poll = await fetch(statusUrl, { signal });
    if (!poll.ok) throw new Error(`Job poll failed: ${poll.status}`);
    const job = await poll.json();
    if (job.completed_rasters?.length) {
      await ingestItems(job.completed_rasters);
    }
    if (job.status === 'ready') {
      const result = Array.from(loadedMap.values());
      setCachedCutouts(ra, dec, fovArcmin, result);
      if (onProgress) onProgress(result, true);
      return result;
    }
    waitMs = Math.min(1500, Math.round(waitMs * 1.25));
  }

  const result = Array.from(loadedMap.values());
  if (result.length > 0) {
    setCachedCutouts(ra, dec, fovArcmin, result);
  }
  return result;
}

export async function fetchPsfDiffApi(rasterKeyA, rasterKeyB, kernel = 'alard_lupton') {
  const resp = await fetch('/api/diff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      raster_key_a: rasterKeyA,
      raster_key_b: rasterKeyB,
      kernel
    })
  });
  if (!resp.ok) throw new Error(`PSF diff failed: ${resp.status}`);
  const meta = parseRasterHeaders(resp.headers);
  const buf = await resp.arrayBuffer();
  const u16 = new Uint16Array(buf);
  const floatData = new Float32Array(u16.length);
  for (let i = 0; i < u16.length; i++) {
    floatData[i] = u16[i] * meta.bscale + meta.bzero;
  }
  return { buffer: floatData, meta };
}
