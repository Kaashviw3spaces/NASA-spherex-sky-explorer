import test from 'node:test';
import assert from 'node:assert/strict';
import { modelFeatures, snapToFeature } from '../src/utils/spectralFeatures.js';
import { teachingSpectrum } from '../src/data/scienceModels.js';

test('magnetic selection finds local model extrema without inventing distant features', () => {
  const bands=[0,1,0,.5,0].map((flux,index)=>({flux,wavelength:1+index*.1}));
  const features=modelFeatures(bands);
  assert.deepEqual(features.map(feature=>feature.kind),['peak','trough','peak']);
  assert.equal(snapToFeature(1.21,features).kind,'trough');
  assert.equal(snapToFeature(4,features),null);
  assert.equal(snapToFeature(3,[]),null);
});

test('absorption snapping disappears when model absorption is removed', () => {
  assert.equal(snapToFeature(3.05,modelFeatures(teachingSpectrum(.5))).kind,'trough');
  assert.equal(snapToFeature(3.05,modelFeatures(teachingSpectrum(0))),null);
});
