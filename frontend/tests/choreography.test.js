import test from 'node:test';
import assert from 'node:assert/strict';
import { chapterWeights, storyProgress } from '../src/utils/scrollChoreography.js';

test('pinned scroll runway maps to bounded continuous progress and exact chapter destinations', () => {
  const height = 3000, viewport = 1000, inset = 90;
  assert.equal(storyProgress(800, height, viewport, inset), 0);
  for (const progress of [0, .5, 1]) {
    const top = inset - progress * (height - viewport + inset);
    assert.equal(storyProgress(top, height, viewport, inset), progress);
  }
  assert.equal(storyProgress(-5000, height, viewport, inset), 1);
  assert.ok(Number.isFinite(storyProgress(0, 0, 1000, 90)));
});

test('chapter fades conserve opacity and blend across both transitions', () => {
  assert.deepEqual(chapterWeights(0), [1, 0, 0]);
  assert.deepEqual(chapterWeights(.5), [0, 1, 0]);
  assert.deepEqual(chapterWeights(1), [0, 0, 1]);
  for (let i = 0; i <= 100; i++) {
    const weights = chapterWeights(i / 100);
    assert.ok(weights.every(weight => weight >= 0 && weight <= 1));
    assert.ok(Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 1) < 1e-10);
  }
  for (const boundary of [1/3, 2/3]) {
    const weights = chapterWeights(boundary);
    assert.equal(weights.filter(weight => weight > .4 && weight < .6).length, 2);
  }
});
