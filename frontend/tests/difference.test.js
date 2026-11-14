import test from 'node:test';
import assert from 'node:assert/strict';
import { comparisonIssue, comparisonPair } from '../src/utils/observationContext.js';
import { computeDifferenceBuffer } from '../src/utils/astronomyRenderer.js';
const frame = (key, changes={}) => ({cache_key:key,meta:{dataKind:'observed',bandIndex:1,bunit:'unknown',width:512,height:512,...changes}});
test('comparison pair is distinct and explicit selections select the actual input buffers', () => {
  const a=frame('a'),b=frame('b'),c=frame('c');
  assert.deepEqual(comparisonPair([a,a]),[a]);
  assert.deepEqual(comparisonPair([a,b,c]),[a,c]);
  assert.deepEqual(comparisonPair([a,b,c],'b','a'),[b,a]);
  assert.deepEqual(comparisonPair([a,b],'a','a'),[a,b]);
});
test('subtraction requires two compatible cached frames', () => {
  assert.ok(comparisonIssue([]));
  assert.ok(comparisonIssue([frame('a')]));
  assert.equal(comparisonIssue([frame('a'),frame('b')]),'');
  for (const changes of [{bandIndex:2},{bunit:'arbitrary'},{dataKind:'simulated'},{width:128}]) assert.ok(comparisonIssue([frame('a'),frame('b',changes)]));
});
test('difference preserves missing coverage without poisoning valid residuals', () => {
  const diff=computeDifferenceBuffer([1,2,3,NaN],[1,3,2,4]);
  assert.ok([...diff.slice(0,3)].every(Number.isFinite));
  assert.ok(Number.isNaN(diff[3]));
  assert.ok(diff[1]<diff[2]);
  assert.ok(Number.isNaN(computeDifferenceBuffer([NaN],[1])[0]));
  assert.throws(()=>computeDifferenceBuffer([1],[1,2]),/dimensions/);
});
test('SPHEREx subtraction rejects unverified quality and mismatched pixel bandpasses', () => {
  const a=frame('a',{spectralRange:'1.63–2.43 µm'}),b=frame('b',{spectralRange:'1.63–2.43 µm'});
  assert.match(comparisonIssue([a,b]),/could not be verified/);
  for(const f of [a,b]) Object.assign(f,{qualityApplied:true,nativePixels:Array.from({length:8},()=>Array(8).fill(1)),spectral:Array.from({length:8},()=>Array.from({length:8},()=>[2,.05]))});
  assert.equal(comparisonIssue([a,b]),'');
  b.spectral[0][0]=[2.2,.05];
  assert.match(comparisonIssue([a,b]),/bandpasses differ/);
});
