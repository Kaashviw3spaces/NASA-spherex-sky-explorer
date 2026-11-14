export function sceneSettings(params) {
  const number = (key, fallback, min, max) => {
    const value = Number(params.get(key));
    return params.get(key)?.trim() && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  };
  const choice = (key, allowed, fallback) => allowed.includes(params.get(key)) ? params.get(key) : fallback;
  return {
    mode: choice('mode', ['static','blink','swipe','curtain','side-by-side','diff'], 'static'),
    stretch: choice('stretch', ['zscale','asinh','log'], 'zscale'),
    colormap: choice('colormap', ['grayscale','grayscale_r','inferno','viridis'], 'grayscale'),
    gain: number('gain', 1, .5, 2.5), wavelength: number('wavelength', 2.2, .75, 5),
    epoch: Math.floor(number('epoch', 0, 0, 10000)), fps: number('fps', 3, 1, 15), curtain: number('curtain', .5, 0, 1)
  };
}
