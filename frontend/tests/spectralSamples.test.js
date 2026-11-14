import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchSpectralSamples, validateSpectralSamples } from '../src/api/spectralSamples.js';

const sample = { wavelength: 3.05, bandwidth: .08, flux: -2, sigma: .2, unit: 'MJy / sr', date: '2025-08-15T20:45:11', source: 'https://irsa.ipac.caltech.edu/example.fits' };
const result = { samples: [sample], attempted: 1, rejected: 0 };

test('measured plots retain negative flux and uncertainty, reject invalid or incompatible units', () => {
  const valid = validateSpectralSamples({ samples: [sample, { ...sample, unit: 'Jy' }, { ...sample, flux: NaN }, { ...sample, sigma: -1 }, { ...sample, bandwidth: 0 }, { ...sample, wavelength: 7 }] });
  assert.deepEqual(valid.samples, [sample]);
  assert.equal(valid.excluded, 5);
  assert.throws(() => validateSpectralSamples({}), /Invalid measurement/);
  assert.deepEqual(validateSpectralSamples({ samples: [] }).samples, []);
});

test('spectral cache uses exact sky positions and forced retry reaches transport', async t => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async url => { requests.push(url); return Response.json(result); });
  const controller = new AbortController();
  await fetchSpectralSamples(18, 20, controller.signal);
  await fetchSpectralSamples(18, 20, controller.signal);
  assert.equal(requests.length, 1);
  await fetchSpectralSamples(18.000001, 20, controller.signal);
  await fetchSpectralSamples(18, 20, controller.signal, true);
  assert.equal(requests.length, 3);
});

test('failed retrieval and cancelled responses are not cached as measurements', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ detail: 'IRSA unavailable' }, { status: 502 }));
  await assert.rejects(fetchSpectralSamples(19, 20), /IRSA unavailable/);
  const controller = new AbortController();
  globalThis.fetch = async () => { controller.abort(); return Response.json(result); };
  await assert.rejects(fetchSpectralSamples(19, 20, controller.signal), { name: 'AbortError' });
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json(result); };
  assert.equal((await fetchSpectralSamples(19, 20)).samples.length, 1);
  assert.equal(calls, 1);
});
