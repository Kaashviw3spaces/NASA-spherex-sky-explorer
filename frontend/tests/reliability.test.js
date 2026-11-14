import test from 'node:test';
import assert from 'node:assert/strict';
import { getCutoutCacheKey, getCachedCutouts, fetchCutoutsWithPolling, fetchSpectrumApi } from '../src/api/client.js';
import { resolveQueryToTarget, parseCoordinateInput } from '../src/data/resolver.js';
import { BENCHMARK_TARGETS } from '../src/data/catalog.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const request = (ra, options = {}) => ({ ra, dec: 20, bands: [42], epochs: ['allwise'], ...options });
const item = (id = 'one') => ({ cache_key: id, raster_url: `/raster/${id}` });
const raster = () => new Response(new Uint16Array([1, 2, 3, 4]), { headers: {
  'X-Raster-Dimensions': '2,2', 'X-BSCALE': '2', 'X-BZERO': '10', 'X-Data-Kind': 'observed'
} });
const ready = (items) => json({ status: 'ready', rasters: items });
const pending = () => json({ status_url: '/job/1', poll_interval_ms: 1 }, 202);

// These tests stub only transport, exercising the production polling/cache/decoder logic.
test('unknown or ambiguous names do not silently select a different target', () => {
  for (const name of ['', 'not-a-real-object', 'star', 'WISE']) assert.equal(resolveQueryToTarget(name, BENCHMARK_TARGETS), null);
  assert.equal(resolveQueryToTarget("Barnard's Star", BENCHMARK_TARGETS).id, 'barnards-star');
  assert.equal(resolveQueryToTarget('wise-0855', BENCHMARK_TARGETS).id, 'wise-0855');
  assert.equal(resolveQueryToTarget('Epsilon Indi B', BENCHMARK_TARGETS).id, 'epsilon-indi-b');
  assert.equal(resolveQueryToTarget('RW Aurigae', BENCHMARK_TARGETS).id, 'rw-aurigae');
  assert.equal(resolveQueryToTarget('R Draconis', BENCHMARK_TARGETS).id, 'r-draconis');
  assert.equal(resolveQueryToTarget('Galactic Plane Field', BENCHMARK_TARGETS).id, 'unwise-fallback');
});

test('coordinate parsing accepts signed/zero values and rejects invalid angles', () => {
  assert.deepEqual(parseCoordinateInput('0, +0'), { ra: 0, dec: 0 });
  assert.equal(parseCoordinateInput('10, 91'), null);
  assert.equal(parseCoordinateInput('24:00:00 -07:00:00'), null);
  assert.equal(parseCoordinateInput('08:60:00 -07:00:00'), null);
  assert.equal(parseCoordinateInput('08:00:00 -90:01:00'), null);
  assert.ok(Math.abs(parseCoordinateInput('08:55:10.8 -07:14:42').ra - 133.795) < 0.001);
});

test('cache identity includes exact coordinates, FOV, bands, and ordered releases', () => {
  const key = getCutoutCacheKey(10, 20, 5);
  for (const other of [getCutoutCacheKey(10.000001, 20, 5), getCutoutCacheKey(10, 20, 5.01),
    getCutoutCacheKey(10, 20, 5, { bands: [102] }),
    getCutoutCacheKey(10, 20, 5, { epochs: ['neo2', 'allwise'] }),
    getCutoutCacheKey(10, 20, 5, { epochs: ['allwise', 'neo2'] })]) assert.notEqual(key, other);
});

test('complete images decode, cache only their requested bands/releases, and report completion once', async t => {
  t.mock.method(globalThis, 'fetch', async url => url === '/api/jobs/cutouts' ? ready([item()]) : raster());
  const updates = [];
  const frames = await fetchCutoutsWithPolling(request(11), (list, complete) => updates.push(complete));
  assert.deepEqual([...frames[0].buffer], [12, 14, 16, 18]);
  assert.deepEqual(updates, [false, true]);
  assert.equal(getCachedCutouts(11, 20, 5, { bands: [42], epochs: ['allwise'] }), frames);
  assert.equal(getCachedCutouts(11, 20, 5, { bands: [102], epochs: ['allwise'] }), null);
  assert.equal(getCachedCutouts(11, 20, 5), null);
});

test('partial frames remain visible but failed jobs reject and are never cached as complete', async t => {
  let polls = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    if (url === '/api/jobs/cutouts') return pending();
    if (url.startsWith('/raster')) return raster();
    return json(++polls === 1 ? { status: 'partial', completed_rasters: [item()] } : { status: 'failed', error: 'upstream broke' });
  });
  const updates = [];
  await assert.rejects(fetchCutoutsWithPolling(request(12, { epochs: ['allwise', 'neo2'] }), (f, done) => updates.push([f.length, done])), /could not finish/);
  assert.deepEqual(updates, [[1, false]]);
  assert.equal(getCachedCutouts(12, 20, 5, { epochs: ['allwise', 'neo2'] }), null);
});

test('ready with missing images is an error, not successful empty or partial completion', async t => {
  t.mock.method(globalThis, 'fetch', async () => ready([]));
  await assert.rejects(fetchCutoutsWithPolling(request(13)), /missing images/);
});

test('cached frames do not conceal a failed refresh', async t => {
  t.mock.method(globalThis, 'fetch', async url => url === '/api/jobs/cutouts' ? ready([item()]) : raster());
  await fetchCutoutsWithPolling(request(14));
  globalThis.fetch = async () => json({}, 503);
  const updates = [];
  await assert.rejects(fetchCutoutsWithPolling(request(14), (f, done) => updates.push(done)), /503/);
  assert.deepEqual(updates, [false]);
});

test('abort during polling delay stops before another network request or completion', async t => {
  const controller = new AbortController();
  const calls = [];
  t.mock.method(globalThis, 'fetch', async url => { calls.push(url); return json({ status_url: '/job', poll_interval_ms: 1000 }, 202); });
  const work = fetchCutoutsWithPolling(request(15), () => assert.fail('No progress expected'), controller.signal);
  setTimeout(() => controller.abort(), 5);
  await assert.rejects(work, { name: 'AbortError' });
  assert.deepEqual(calls, ['/api/jobs/cutouts']);
});

test('abort propagates to a raster fetch and prevents late cache/progress writes', async t => {
  const controller = new AbortController();
  let rasterSignal;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url === '/api/jobs/cutouts') return ready([item()]);
    rasterSignal = options.signal;
    controller.abort();
    return raster(); // Even a transport ignoring cancellation must not publish its response.
  });
  await assert.rejects(fetchCutoutsWithPolling(request(16), () => assert.fail('Late update'), controller.signal), { name: 'AbortError' });
  assert.equal(rasterSignal.aborted, true);
  assert.equal(getCachedCutouts(16, 20, 5, { epochs: ['allwise'] }), null);
});

test('stalled jobs have a deadline and never return a successful partial result', async t => {
  t.mock.method(globalThis, 'fetch', async url => url === '/api/jobs/cutouts' ? pending() : json({ status: 'pending' }));
  await assert.rejects(fetchCutoutsWithPolling(request(17), undefined, undefined, { timeoutMs: 15 }), /timed out/);
});

test('truncated binary rasters are rejected', async t => {
  t.mock.method(globalThis, 'fetch', async url => url === '/api/jobs/cutouts' ? ready([item()]) : new Response(new Uint16Array([1]), { headers: { 'X-Raster-Dimensions': '2,2' } }));
  await assert.rejects(fetchCutoutsWithPolling(request(18)), /incomplete/);
});

test('spectrum transport receives the caller cancellation signal', async t => {
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.signal, controller.signal);
    return new Response(new Float32Array([1, 2]));
  });
  assert.equal((await fetchSpectrumApi(10, 20, 6.2, 10, 20, 5, controller.signal)).bands.length, 2);
});

test('deep links preserve exact coordinates/FOV and reject invalid pointings', async () => {
  const { targetFromParams } = await import('../src/data/pointing.js');
  const target = targetFromParams(new URLSearchParams('target=barnards-star&ra=10.000001&dec=0&fov=5.01&name=Chosen'));
  assert.equal(target.ra, 10.000001);
  assert.equal(target.dec, 0);
  assert.equal(target.fovArcmin, 5.01);
  assert.equal(target.name, 'Chosen');
  for (const query of ['ra=10', 'ra=10&dec=91', 'ra=&dec=0', 'fov=99', 'target=unknown']) {
    assert.throws(() => targetFromParams(new URLSearchParams(query)), /invalid|unknown/);
  }
});

test('display contrast samples the field rather than only the left pixel column', async () => {
  const { computeCutLevels } = await import('../src/utils/displayLevels.js');
  const { applyStretch, mapColormap } = await import('../src/utils/astronomyRenderer.js');
  const pixels = new Float32Array(512 * 512).fill(.12);
  for (let y = 0; y < 512; y++) pixels[y * 512] = .1;
  for (let y = 224; y < 288; y++) for (let x = 224; x < 288; x++) pixels[y * 512 + x] = 1;
  const { zmax } = computeCutLevels(pixels);
  assert.ok(zmax > .9, 'Interior sources must contribute to contrast levels');
  const displayed = applyStretch(pixels);
  assert.ok(displayed[256 * 512 + 256] > .99);
  assert.ok(displayed[100 * 512 + 100] < .1, 'Background should not be saturated');
  assert.deepEqual(mapColormap(0, 'grayscale'), [0, 0, 0]);
  assert.deepEqual(mapColormap(1, 'grayscale'), [255, 255, 255]);
  assert.equal(pixels[100 * 512 + 100], Math.fround(.12));
});

test('contrast ignores missing sky coverage and handles all-missing images', async () => {
  const { computeCutLevels } = await import('../src/utils/displayLevels.js');
  const values = Float32Array.from({ length: 4096 }, (_, i) => i % 2 ? NaN : i);
  const levels = computeCutLevels(values);
  assert.ok(Number.isFinite(levels.zmin));
  assert.ok(levels.zmax > levels.zmin);
  assert.deepEqual(computeCutLevels(new Float32Array(100).fill(NaN)), { zmin: 0, zmax: 1 });
});

test('cursor TAN sky coordinates match the common grid orientation', async () => {
  const { gridToSky } = await import('../src/utils/skyCoordinates.js');
  const center = gridToSky(255.5, 255.5, 269, 4, 5);
  assert.ok(Math.abs(center.ra - 269) < 1e-9);
  assert.ok(Math.abs(center.dec - 4) < 1e-9);
  assert.ok(gridToSky(300, 255.5, 269, 4, 5).ra < 269);
  assert.ok(gridToSky(255.5, 300, 269, 4, 5).dec > 4);
  const pole = gridToSky(511, 511, 359.999, 89.99, 5);
  assert.ok(pole.ra >= 0 && pole.ra < 360 && Number.isFinite(pole.dec));
});
