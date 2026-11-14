import { MISSIONS, canCompleteMission } from '../data/missions.js';
export const LEARNING_KEY = 'spherex_learning_v1';
const empty = () => ({ version: 1, missions: {}, entries: [] });
const valid = value => value?.version === 1 && value.missions && typeof value.missions === 'object' && !Array.isArray(value.missions) && Array.isArray(value.entries)
  && Object.entries(value.missions).every(([id, record]) => MISSIONS.some(m => m.id === id) && record && Array.isArray(record.objectives) && record.objectives.every(item => typeof item === 'boolean') && typeof record.passed === 'boolean' && typeof record.reflection === 'string' && (!record.completedAt || !Number.isNaN(Date.parse(record.completedAt))))
  && value.entries.every(entry => entry && typeof entry.id === 'string' && typeof entry.title === 'string' && typeof entry.note === 'string' && typeof entry.savedAt === 'string' && !Number.isNaN(Date.parse(entry.savedAt)) && (!entry.context || typeof entry.context.label === 'string' && typeof entry.context.url === 'string' && (!entry.context.url || entry.context.url.startsWith('/') && !entry.context.url.startsWith('//'))));
export function readLearning() {
  try {
    const raw = localStorage.getItem(LEARNING_KEY);
    if (!raw) return { data: empty(), error: '' };
    const data = JSON.parse(raw);
    if (!valid(data)) throw new Error('Invalid learning record');
    return { data, error: '' };
  } catch { return { data: empty(), error: 'Learning storage is unavailable or unreadable. Existing data has not been replaced.' }; }
}
function updateLearning(updater) {
  const result = readLearning();
  if (result.error) return result;
  try {
    const data = updater(result.data);
    localStorage.setItem(LEARNING_KEY, JSON.stringify(data));
    return { data, error: '' };
  } catch (error) { return { data: result.data, error: error.message || 'Could not save. Your previous record is unchanged.' }; }
}
export function saveMission(id, record, complete = false) {
  return updateLearning(data => {
    const mission = MISSIONS.find(item => item.id === id);
    if (!mission) throw new Error('Mission not found.');
    const safe = { objectives: mission.steps.map((_, index) => record.objectives?.[index] === true), passed: record.passed === true, reflection: String(record.reflection || '').slice(0, 2000) };
    if (complete && !canCompleteMission(mission, safe)) throw new Error('Finish the objectives, knowledge check and reflection first.');
    const previous = data.missions[id];
    return { ...data, missions: { ...data.missions, [id]: { ...safe, updatedAt: new Date().toISOString(), completedAt: complete ? previous?.completedAt || new Date().toISOString() : canCompleteMission(mission, safe) ? previous?.completedAt || null : null } } };
  });
}
export function saveReflection({ id, title, note, context }) {
  return updateLearning(data => {
    if (!String(note || '').trim()) throw new Error('Write a short note first.');
    const entry = { id: id || crypto.randomUUID(), title: String(title || 'A thought about the sky').slice(0, 120), note: String(note).trim().slice(0, 3000), savedAt: new Date().toISOString(), context: context ? { kind: context.kind, label: String(context.label || '').slice(0, 200), url: String(context.url || '').startsWith('/') && !String(context.url).startsWith('//') ? context.url : '' } : null };
    return { ...data, entries: [entry, ...data.entries.filter(item => item.id !== entry.id)] };
  });
}
export function deleteReflection(id) { return updateLearning(data => ({ ...data, entries: data.entries.filter(item => item.id !== id) })); }
export function exportLearning() {
  const result = readLearning();
  if (result.error) return result;
  const url = URL.createObjectURL(new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'spherex-learning-journal.json'; link.click(); URL.revokeObjectURL(url);
  return result;
}
