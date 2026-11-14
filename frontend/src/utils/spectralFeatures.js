// Local extrema of a labeled teaching curve, not molecular identification.
export function modelFeatures(bands) {
  return bands.filter((point, i) => i > 0 && i < bands.length - 1 && ((point.flux > bands[i-1].flux && point.flux >= bands[i+1].flux) || (point.flux < bands[i-1].flux && point.flux <= bands[i+1].flux))).map(point => ({ ...point, kind: point.flux > bands[bands.indexOf(point)-1].flux ? 'peak' : 'trough' }));
}
export function snapToFeature(wavelength, features, threshold = .065) {
  const nearest = features.reduce((best, point) => !best || Math.abs(point.wavelength-wavelength)<Math.abs(best.wavelength-wavelength) ? point : best, null);
  return nearest && Math.abs(nearest.wavelength-wavelength)<=threshold ? nearest : null;
}
