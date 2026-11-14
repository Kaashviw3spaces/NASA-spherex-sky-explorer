const STORAGE_KEY = 'spherex_saved_scenes_v1';

function normalize(item) {
  if (!item || typeof item !== 'object') throw new Error('Invalid saved sky.');
  const ra = Number(item.ra), dec = Number(item.dec), fov = Number(item.fovArcmin ?? 5);
  if (item.ra == null || item.dec == null || !Number.isFinite(ra) || ra < 0 || ra > 360 || !Number.isFinite(dec) || Math.abs(dec) > 90 || !Number.isFinite(fov) || fov <= .1 || fov > 15) throw new Error('Saved sky has invalid coordinates or field of view.');
  return {
    id: String(item.id || `scene_${crypto.randomUUID()}`),
    name: String(item.name || 'Untitled Scene').slice(0, 200),
    savedAt: item.savedAt && !Number.isNaN(Date.parse(item.savedAt)) ? item.savedAt : new Date().toISOString(),
    ra, dec, fovArcmin: fov,
    mode: ['blink', 'static', 'swipe', 'curtain', 'side-by-side', 'diff'].includes(item.mode) ? item.mode : 'static',
    stretch: ['zscale', 'asinh', 'log'].includes(item.stretch) ? item.stretch : 'zscale',
    colormap: ['grayscale', 'grayscale_r', 'inferno', 'viridis'].includes(item.colormap) ? item.colormap : 'grayscale',
    activeWavelength: Number.isFinite(Number(item.activeWavelength)) ? Math.min(5, Math.max(.75, Number(item.activeWavelength))) : 2.2,
    gain: Number.isFinite(Number(item.gain)) ? Math.max(.5, Math.min(2.5, Number(item.gain))) : 1,
    epoch: Number.isFinite(Number(item.epoch)) ? Math.max(0, Math.floor(Number(item.epoch))) : 0,
    curtain: Number.isFinite(Number(item.curtain)) ? Math.max(0, Math.min(1, Number(item.curtain))) : .5,
    fps: Number.isFinite(Number(item.fps)) ? Math.max(1, Math.min(15, Number(item.fps))) : 3,
    notes: String(item.notes || '').slice(0, 3000),
    ...(item.observation && typeof item.observation === 'object' && !Array.isArray(item.observation) ? { observation: item.observation } : {})
  };
}
export function getLibraryItems(strict = false) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Invalid library format.');
    return parsed.map(normalize);
  } catch (error) {
    if (strict) throw new Error('Saved-sky storage is unavailable or unreadable. Existing data has not been replaced.');
    return [];
  }
}
export function saveLibraryItem(item) {
  try {
    const items = getLibraryItems(true);
    const next = normalize(item);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([next, ...items.filter(i => i.id !== next.id)]));
    return next;
  } catch { return null; }
}
export function updateLibraryItem(id, updates) {
  try {
    const items = getLibraryItems(true);
    if (!items.some(item => item.id === id)) return false;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.map(item => item.id === id ? normalize({ ...item, ...updates, id }) : item)));
    return true;
  } catch { return false; }
}
export function deleteLibraryItem(id) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(getLibraryItems(true).filter(item => item.id !== id))); return true; } catch { return false; }
}
export function exportLibraryItems() {
  const items = getLibraryItems(true);
  const url = URL.createObjectURL(new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `spherex_library_${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
}
export function importLibraryItems(jsonString) {
  const parsed = JSON.parse(jsonString);
  if (!Array.isArray(parsed)) throw new Error('Root must be an array of saved skies.');
  // Validate the complete import before writing anything.
  const imported = parsed.map(normalize);
  const merged = new Map(getLibraryItems(true).map(item => [item.id, item]));
  for (const item of imported) merged.set(item.id, item);
  const values = [...merged.values()];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  return values.length;
}
