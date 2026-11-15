import test from 'node:test';
import assert from 'node:assert/strict';
import { INVESTIGATION_LINK, SPHEREX_INVESTIGATION, investigationAtPointing } from '../src/data/investigation.js';
import { targetFromParams } from '../src/data/pointing.js';
import { MISSIONS } from '../src/data/missions.js';
import { savedExplorerLink } from '../src/utils/savedExplorerLink.js';

test('investigation links pin exact field and distinct dated archive inputs', () => {
  const params = new URL(INVESTIGATION_LINK, 'https://example.org').searchParams;
  const target = targetFromParams(params);
  const evidence = investigationAtPointing(params.get('investigation'), target);
  assert.equal(evidence, SPHEREX_INVESTIGATION);
  assert.notEqual(evidence.inputs[0].url, evidence.inputs[1].url);
  assert.notEqual(evidence.inputs[0].date, evidence.inputs[1].date);
  assert.ok(evidence.inputs.every(input => input.url.startsWith('https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/')));
  assert.equal(investigationAtPointing(evidence.id, {...target, ra: 10}), null);
  assert.equal(investigationAtPointing(evidence.id, {...target, fovArcmin: 1}), null);
  assert.equal(investigationAtPointing(null, target), null);
  assert.equal(MISSIONS.find(mission => mission.id === 'changing-sky').links[0][1], INVESTIGATION_LINK);
});

test('journal reopens the documented pair only when field and actual source URLs match', () => {
  const evidence = SPHEREX_INVESTIGATION;
  const item = {ra:evidence.ra, dec:evidence.dec, fovArcmin:evidence.fov_arcmin, mode:'side-by-side', stretch:'asinh', name:'My comparison', observation:{sources:evidence.inputs.map(input => ({sourceUrl:input.url}))}};
  const params = value => new URL(savedExplorerLink(value), 'https://example.org').searchParams;
  assert.equal(params(item).get('investigation'), evidence.id);
  assert.equal(params(item).get('source'), 'spherex');
  assert.equal(params(item).get('name'), 'My comparison');
  assert.equal(params({...item, fovArcmin:1}).get('investigation'), null);
  assert.equal(params({...item, observation:{sources:[item.observation.sources[0],item.observation.sources[0]]}}).get('investigation'), null);
  assert.equal(params({...item, observation:{sources:[{sourceUrl:'https://unwise.me/cutout_fits'}]}}).get('source'), 'unwise');
});
