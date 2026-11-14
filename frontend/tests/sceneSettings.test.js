import test from 'node:test';
import assert from 'node:assert/strict';
import { sceneSettings } from '../src/utils/sceneSettings.js';
import { applyStretch } from '../src/utils/astronomyRenderer.js';

test('scene links reject invalid enums and sanitize unsafe numeric settings', () => {
  const settings = sceneSettings(new URLSearchParams('mode=bad&stretch=bad&colormap=bad&gain=Infinity&epoch=-5&curtain=9&wavelength=NaN&fps=100'));
  assert.equal(settings.mode, 'static');
  assert.equal(settings.stretch, 'zscale');
  assert.equal(settings.colormap, 'grayscale');
  assert.equal(settings.gain, 1);
  assert.equal(settings.epoch, 0);
  assert.equal(settings.curtain, 1);
  assert.equal(settings.wavelength, 2.2);
  assert.equal(settings.fps, 15);
});

test('comparison stretches can share a common brightness scale without modifying source pixels', () => {
  const source = new Float32Array([0, 10, NaN]);
  const values = applyStretch(source, 'zscale', 1, { zmin: 0, zmax: 20 });
  assert.equal(values[1], .5);
  assert.equal(source[1], 10);
  assert.ok(Number.isNaN(values[2]));
});
