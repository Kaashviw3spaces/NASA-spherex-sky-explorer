export const clamp01 = value => Math.max(0, Math.min(1, value));
export function storyProgress(top, height, viewport, inset) {
  return clamp01((inset - top) / Math.max(1, height - viewport + inset));
}
export function chapterWeights(progress) {
  const smooth = value => { const t = clamp01(value); return t * t * (3 - 2 * t); };
  const first = smooth((progress - 1 / 3 + .055) / .11);
  const second = smooth((progress - 2 / 3 + .055) / .11);
  return [1 - first, first - second, second];
}
