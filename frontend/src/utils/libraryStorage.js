const STORAGE_KEY = 'spherex_saved_scenes_v1';

export function getLibraryItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to read library from localStorage:', err);
    return [];
  }
}

export function saveLibraryItem(item) {
  try {
    const items = getLibraryItems();
    const newItem = {
      id: item.id || `scene_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: item.name || 'Untitled Scene',
      savedAt: item.savedAt || new Date().toISOString(),
      ra: Number(item.ra),
      dec: Number(item.dec),
      fovArcmin: Number(item.fovArcmin || 5.0),
      mode: item.mode || 'blink',
      stretch: item.stretch || 'zscale',
      colormap: item.colormap || 'inferno',
      activeWavelength: Number(item.activeWavelength || 2.2),
      notes: item.notes || ''
    };
    const updated = [newItem, ...items.filter((i) => i.id !== newItem.id)];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return newItem;
  } catch (err) {
    console.error('Failed to save scene to library:', err);
    return null;
  }
}

export function updateLibraryItem(id, updates) {
  try {
    const items = getLibraryItems();
    const updated = items.map((i) => (i.id === id ? { ...i, ...updates } : i));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return true;
  } catch (err) {
    console.error('Failed to update library item:', err);
    return false;
  }
}

export function deleteLibraryItem(id) {
  try {
    const items = getLibraryItems();
    const filtered = items.filter((i) => i.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return true;
  } catch (err) {
    console.error('Failed to delete library item:', err);
    return false;
  }
}

export function exportLibraryItems() {
  const items = getLibraryItems();
  const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `spherex_library_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importLibraryItems(jsonString) {
  try {
    const parsed = JSON.parse(jsonString);
    if (!Array.isArray(parsed)) throw new Error('Root must be an array of scenes');
    const existing = getLibraryItems();
    const mergedMap = new Map();
    for (const item of [...existing, ...parsed]) {
      if (item && item.id) mergedMap.set(item.id, item);
    }
    const merged = Array.from(mergedMap.values());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return merged.length;
  } catch (err) {
    console.error('Failed to import library items:', err);
    throw err;
  }
}
