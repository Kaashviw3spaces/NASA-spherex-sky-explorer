export function generateSpectrum(target, apertureRadius = 2, seedOffset = 0) {
  const bands = [];
  const scale = target.peakFluxMjy * (0.78 + apertureRadius * 0.11);
  for (let i = 0; i < 102; i++) {
    const w = 0.75 + (i / 101) * 4.25;
    const flux = Math.max(0.1, scale * Math.exp(-Math.pow((w - 1.65) / 1.95, 2)) * (0.7 + 0.3 * Math.sin(w + seedOffset)));
    bands.push({
      bandId: i + 1,
      wavelength: Number(w.toFixed(4)),
      flux: Number(flux.toFixed(3)),
      err: Number((flux * 0.045).toFixed(3)),
      qualityFlag: 0
    });
  }
  return {
    bands,
    wiseBands: [
      { name: 'WISE W1', wavelength: 3.4, halfWidth: 0.33, flux: Number((scale * 0.48).toFixed(3)) },
      { name: 'WISE W2', wavelength: 4.6, halfWidth: 0.52, flux: Number((scale * 0.31).toFixed(3)) }
    ]
  };
}
