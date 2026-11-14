import test from 'node:test';
import assert from 'node:assert/strict';
import { wavelengthAtPixel } from '../src/utils/imageWavelength.js';
test('image wavelength uses bilinear interpolation on the displayed sky grid',()=>{
  const frame={spectral:[[[1,.1],[2,.1]],[[3,.1],[4,.1]]]};
  assert.equal(wavelengthAtPixel(frame,0,0),1);
  assert.equal(wavelengthAtPixel(frame,511,511),4);
  assert.equal(wavelengthAtPixel(frame,255.5,255.5),2.5);
  assert.equal(wavelengthAtPixel({},0,0),undefined);
  frame.spectral[0][0][0]=null;
  assert.equal(wavelengthAtPixel(frame,20,20),undefined);
});
