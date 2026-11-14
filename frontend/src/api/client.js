// Binary API client for SPHEREx Sky Explorer FastAPI proxy

function parseRasterHeaders(headers) {
  const dims = (headers.get('X-Raster-Dimensions') || '512,512').split(',').map(Number);
  return {
    width: dims[0] || 512,
    height: dims[1] || 512,
    bitpix: Number(headers.get('X-Raster-Bitpix') || 16),
    bscale: parseFloat(headers.get('X-BSCALE') || '1'),
    bzero: parseFloat(headers.get('X-BZERO') || '0'),
    bunit: headers.get('X-BUNIT') || 'unknown',
    dataKind: headers.get('X-Data-Kind') || 'unknown',
    release: headers.get('X-Source-Release') || 'unknown',
    sourceUrl: headers.get('X-Source-URL') || '',
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

export async function fetchBinaryRaster(url, signal) {
  const resp = await fetch(url, { signal });
  if (!resp.ok) throw new Error(`Raster fetch failed: ${resp.status}`);
  const meta = parseRasterHeaders(resp.headers);
  const buf = await resp.arrayBuffer();
  signal?.throwIfAborted();
  if (buf.byteLength !== meta.width * meta.height * 2) throw new Error("Image data is incomplete.");
  const u16 = new Uint16Array(buf);
  const floatData = new Float32Array(u16.length);
  const { bscale, bzero } = meta;
  for (let i = 0; i < u16.length; i++) {
    floatData[i] = u16[i] * bscale + bzero;
  }
  return { buffer: floatData, meta };
}

export async function resolveTargetApi(query, signal) {
  const resp = await fetch(`/api/resolve?q=${encodeURIComponent(query)}`, { signal });
  if (!resp.ok) throw new Error(`Resolve failed: ${resp.status}`);
  return resp.json();
}

export async function fetchSpectrumApi(
  ra,
  dec,
  radiusArcsec = 12.4,
  centerRa = null,
  centerDec = null,
  fovArcmin = 5.0,
  signal
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
  const resp = await fetch(`/api/spectrum?${params.toString()}`, { signal });
  if (!resp.ok) throw new Error(`Spectrum fetch failed: ${resp.status}`);
  const buf = await resp.arrayBuffer();
  const floats = new Float32Array(buf);
  const provenance = resp.headers.get('X-Survey-Provenance') || 'Synthetic-Demo';

  const bands = [];
  for (let i = 0; i < floats.length; i++) {
    const w = 0.75 + (i / Math.max(1, floats.length - 1)) * 4.25;
    const flux = floats[i];
    bands.push({
      bandId: i + 1,
      wavelength: Number(w.toFixed(4)),
      flux: Number(flux.toFixed(3)),
      err: null,
      qualityFlag: null
    });
  }
  return { bands, provenance, dataKind: 'simulated', bunit: 'arbitrary' };
}

// Exact request identity, including ordered bands/releases and product protocol version.
const cutoutsMemoryCache = new Map();
const DEFAULT_EPOCHS = ['allwise', 'neo2', 'neo5'];
const CACHE_LIMIT = 16;
const CACHE_TTL_MS = 5 * 60 * 1000;

function normalizeRequest({ ra, dec, fovArcmin = 5, bands = [42], epochs = null }) {
  const r = Number(ra), d = Number(dec), f = Number(fovArcmin);
  if (ra == null || dec == null || !Number.isFinite(r) || !Number.isFinite(d) ||
      r < 0 || r > 360 || Math.abs(d) > 90 || !Number.isFinite(f) || f <= 0.1 || f > 15) {
    throw new Error('Enter valid sky coordinates and a field of view between 0.1 and 15 arcminutes.');
  }
  const uniqueBands = [...new Set(bands)];
  const releases = [...new Set(epochs?.length ? epochs : DEFAULT_EPOCHS)];
  if (!uniqueBands.length || uniqueBands.some(b => !Number.isInteger(b) || b < 0 || b > 102) ||
      releases.some(e => ![...DEFAULT_EPOCHS, 'neo7'].includes(e))) {
    throw new Error('Unsupported image band or archive release.');
  }
  return { ra: r, dec: d, fovArcmin: f, bands: uniqueBands, epochs: releases };
}

export function getCutoutCacheKey(ra, dec, fovArcmin = 5, options = {}) {
  return JSON.stringify(['unwise-products-v3', normalizeRequest({ ra, dec, fovArcmin, ...options })]);
}

export function getCachedCutouts(ra, dec, fovArcmin = 5, options = {}) {
  const key = getCutoutCacheKey(ra, dec, fovArcmin, options);
  const entry = cutoutsMemoryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.savedAt > CACHE_TTL_MS) {
    cutoutsMemoryCache.delete(key);
    return null;
  }
  cutoutsMemoryCache.delete(key);
  cutoutsMemoryCache.set(key, entry);
  return entry.frames;
}

function cacheCompleteRequest(request, frames) {
  const key = getCutoutCacheKey(request.ra, request.dec, request.fovArcmin, request);
  cutoutsMemoryCache.delete(key);
  cutoutsMemoryCache.set(key, { frames, savedAt: Date.now() });
  while (cutoutsMemoryCache.size > CACHE_LIMIT) cutoutsMemoryCache.delete(cutoutsMemoryCache.keys().next().value);
}

function abortableDelay(ms, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function fetchCutoutsWithPolling(request, onProgress, signal, { timeoutMs = 90000 } = {}) {
  const normalized = normalizeRequest(request);
  const { ra, dec, fovArcmin, bands, epochs } = normalized;
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal?.throwIfAborted();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error('Image loading timed out. Please retry.')), timeoutMs);
  const activeSignal = controller.signal;
  const loaded = new Map();
  const expected = bands.length * epochs.length;
  const publish = (complete) => {
    activeSignal.throwIfAborted();
    const frames = [...loaded.values()];
    if (complete) {
      if (frames.length !== expected) throw new Error('The image job finished with missing images. Please retry.');
      cacheCompleteRequest(normalized, frames);
    }
    onProgress?.(frames, complete);
    return frames;
  };
  const ingest = async (items = []) => {
    for (const item of items) {
      activeSignal.throwIfAborted();
      if (loaded.has(item.cache_key)) continue;
      const decoded = await fetchBinaryRaster(item.raster_url, activeSignal);
      activeSignal.throwIfAborted();
      loaded.set(item.cache_key, { ...item, ...decoded });
      publish(false);
    }
  };
  try {
    const cached = getCachedCutouts(ra, dec, fovArcmin, normalized);
    if (cached) onProgress?.(cached, false); // Complete previous result, being refreshed now.
    const resp = await fetch('/api/jobs/cutouts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ra, dec, fov_arcmin: fovArcmin, bands, epochs }), signal: activeSignal
    });
    activeSignal.throwIfAborted();
    if (!resp.ok) throw new Error(`Image request failed (${resp.status}). Please retry.`);
    const initial = await resp.json();
    activeSignal.throwIfAborted();
    if (resp.status === 200 && initial.status === 'ready') {
      await ingest(initial.rasters);
      return publish(true);
    }
    if (resp.status !== 202 || !initial.status_url) throw new Error('Invalid image job response. Please retry.');
    let waitMs = Math.max(1, Math.min(1500, initial.poll_interval_ms || 350));
    while (true) {
      await abortableDelay(waitMs, activeSignal);
      const poll = await fetch(initial.status_url, { signal: activeSignal });
      if (!poll.ok) throw new Error(`Image job unavailable (${poll.status}). Please retry.`);
      const job = await poll.json();
      activeSignal.throwIfAborted();
      if (job.status === 'failed') throw new Error('The server could not finish loading images. Please retry.');
      if (!['pending', 'partial', 'ready'].includes(job.status)) throw new Error('Invalid image job status. Please retry.');
      await ingest(job.completed_rasters);
      if (job.status === 'ready') return publish(true);
      waitMs = Math.min(1500, Math.round(waitMs * 1.25));
    }
  } catch (error) {
    if (activeSignal.aborted) throw activeSignal.reason;
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

export async function fetchPsfDiffApi(rasterKeyA, rasterKeyB, kernel = 'alard_lupton', signal) {
  const resp = await fetch('/api/diff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      raster_key_a: rasterKeyA,
      raster_key_b: rasterKeyB,
      kernel
    }),
    signal
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
