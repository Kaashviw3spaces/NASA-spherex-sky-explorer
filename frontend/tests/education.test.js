import test from 'node:test';
import assert from 'node:assert/strict';
import { shiftedWavelength, dustTransmission, teachingSpectrum } from '../src/data/scienceModels.js';
import { MISSIONS, canCompleteMission } from '../src/data/missions.js';
import { readLearning, saveMission, saveReflection, deleteReflection, LEARNING_KEY } from '../src/utils/learningStorage.js';
import { getLibraryItems, saveLibraryItem, updateLibraryItem, importLibraryItems } from '../src/utils/libraryStorage.js';
import { displayedFrames, observationSnapshot, sourceLink } from '../src/utils/observationContext.js';

function storage(t, initial = {}) {
  const values = new Map(Object.entries(initial));
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage; });
  return values;
}

test('redshift follows rest × (1 + z), including identity and invalid inputs', () => {
  assert.equal(shiftedWavelength(1, 0), 1);
  assert.equal(shiftedWavelength(1, 1), 2);
  assert.equal(shiftedWavelength(1.5, 3), 6);
  for (const pair of [[0, 1], [1, -1], [NaN, 1], [1, Infinity]]) assert.throws(() => shiftedWavelength(...pair));
});

test('dust screen is transparent at zero, bounded, monotonic and more transparent at longer wavelengths', () => {
  assert.equal(dustTransmission(.75, 0), 1);
  assert.equal(dustTransmission(5, 0), 1);
  assert.ok(dustTransmission(5, 2) > dustTransmission(.75, 2));
  assert.ok(dustTransmission(1, 3) < dustTransmission(1, 1));
  for (const av of [0, 1, 5]) for (const w of [.75, 1, 2, 5]) assert.ok(dustTransmission(w, av) > 0 && dustTransmission(w, av) <= 1);
  assert.throws(() => dustTransmission(.3, 1));
  assert.throws(() => dustTransmission(1, -1));
});

test('teaching spectrum changes depth at fixed wavelength without assigning measurement uncertainties', () => {
  const original = teachingSpectrum(0), absorbed = teachingSpectrum(.8);
  assert.deepEqual(original.map(item => item.wavelength), absorbed.map(item => item.wavelength));
  const center = original.reduce((best, item, index) => Math.abs(item.wavelength - 3.05) < Math.abs(original[best].wavelength - 3.05) ? index : best, 0);
  assert.ok(absorbed[center].flux < original[center].flux * .3);
  assert.ok(absorbed.every(item => item.flux >= 0 && item.err === null && item.qualityFlag === null));
});

test('current-frame metadata and comparison snapshots use the frames actually displayed', () => {
  const frames = [{ meta: { dataKind: 'observed', provenance: 'unWISE', release: 'first', bunit: 'native' } }, { meta: { dataKind: 'simulated', provenance: 'Synthetic-Demo', release: 'second', bunit: 'arbitrary' } }, { meta: { dataKind: 'observed', provenance: 'unWISE', release: 'last', bunit: 'native' } }];
  assert.deepEqual(displayedFrames(frames, 1), [frames[1]]);
  assert.deepEqual(displayedFrames(frames, 1, 'swipe'), [frames[0], frames[2]]);
  assert.deepEqual(displayedFrames(frames, 1, 'static', true), [frames[0], frames[2]]);
  assert.equal(observationSnapshot(frames, 1, 'static').kind, 'simulated');
  assert.equal(observationSnapshot(frames, 1, 'swipe').sources.length, 2);
  assert.equal(observationSnapshot([], 0, 'static').kind, 'simulated');
  assert.equal(sourceLink('javascript:alert(1)'), null);
});

test('missions require objectives, a passed check and reflection before completion', t => {
  storage(t);
  const mission = MISSIONS[0];
  assert.equal(canCompleteMission(mission, { passed: true, reflection: 'I noticed source labels.' }), false);
  assert.ok(saveMission(mission.id, { objectives: [], passed: false }, true).error);
  const record = { objectives: mission.steps.map(() => true), passed: true, reflection: 'The Webb image uses assigned colors.' };
  const saved = saveMission(mission.id, record, true);
  assert.equal(saved.error, '');
  assert.ok(readLearning().data.missions[mission.id].completedAt);
  assert.equal(readLearning().data.missions[mission.id].reflection, record.reflection);
  saveMission(mission.id, { ...record, objectives: [] });
  assert.equal(readLearning().data.missions[mission.id].completedAt, null);
});

test('reflections persist, edit in place and delete without touching missions', t => {
  storage(t);
  const first = saveReflection({ title: 'First thought', note: 'What evidence would I need?' });
  assert.equal(first.error, '');
  const id = first.data.entries[0].id;
  const edited = saveReflection({ id, title: 'Revised', note: 'Check calibration first.' });
  assert.equal(edited.data.entries.length, 1);
  assert.equal(readLearning().data.entries[0].note, 'Check calibration first.');
  assert.equal(deleteReflection(id).data.entries.length, 0);
});

test('corrupt or denied learning storage fails clearly and is never overwritten', t => {
  const values = storage(t, { [LEARNING_KEY]: '{not json' });
  assert.ok(readLearning().error);
  assert.ok(saveReflection({ note: 'A note' }).error);
  assert.equal(values.get(LEARNING_KEY), '{not json');
  values.delete(LEARNING_KEY);
  globalThis.localStorage.setItem = () => { throw new Error('Quota exceeded'); };
  assert.match(saveReflection({ note: 'A note' }).error, /Quota/);
});

test('legacy saved skies keep settings while notes and observation metadata survive edits', t => {
  storage(t, { spherex_saved_scenes_v1: JSON.stringify([{ id: 'old', name: 'Old sky', ra: 10, dec: 20, mode: 'blink', notes: 'Original' }]) });
  assert.equal(getLibraryItems()[0].mode, 'blink');
  const saved = saveLibraryItem({ ra: 11, dec: 21, fovArcmin: 5.01, name: 'Observation', observation: { kind: 'observed', provenance: 'unWISE' } });
  assert.ok(saved);
  assert.equal(updateLibraryItem(saved.id, { notes: 'A new observation note.' }), true);
  const reopened = getLibraryItems().find(item => item.id === saved.id);
  assert.equal(reopened.observation.provenance, 'unWISE');
  assert.equal(reopened.notes, 'A new observation note.');
  assert.equal(reopened.fovArcmin, 5.01);
  assert.equal(getLibraryItems().find(item => item.id === 'old').notes, 'Original');
});

test('invalid saved-sky imports and corrupt existing libraries are not overwritten', t => {
  const values = storage(t, { spherex_saved_scenes_v1: 'corrupt' });
  assert.equal(saveLibraryItem({ ra: 10, dec: 20 }), null);
  assert.equal(values.get('spherex_saved_scenes_v1'), 'corrupt');
  values.set('spherex_saved_scenes_v1', '[]');
  assert.throws(() => importLibraryItems(JSON.stringify([{ id: 'bad', ra: 10, dec: 100 }])));
  assert.equal(values.get('spherex_saved_scenes_v1'), '[]');
});
