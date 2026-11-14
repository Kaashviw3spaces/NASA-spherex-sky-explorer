// Educational models only. These functions do not operate on telescope observations.
export function shiftedWavelength(rest, redshift) {
  if (!Number.isFinite(rest) || rest <= 0 || !Number.isFinite(redshift) || redshift < 0) throw new Error('Use a positive wavelength and nonnegative redshift.');
  return rest * (1 + redshift);
}

export function dustTransmission(wavelength, av) {
  if (!Number.isFinite(wavelength) || wavelength < .75 || wavelength > 5 || !Number.isFinite(av) || av < 0) throw new Error('Model range: 0.75–5 µm, nonnegative attenuation.');
  // Foreground screen. Illustrative smooth power law, not an empirical fit for a particular cloud.
  const extinction = av * (wavelength / .55) ** -1.7;
  return 10 ** (-.4 * extinction);
}

export const SAMPLE_WAVELENGTHS = Array.from({ length: 256 }, (_, index) => .75 + index / 255 * 4.25);
export function teachingSpectrum(depth = .5) {
  if (!Number.isFinite(depth) || depth < 0 || depth > .8) throw new Error('Depth must be between 0 and 0.8.');
  return SAMPLE_WAVELENGTHS.map((wavelength, index) => {
    const continuum = .35 + .65 * Math.exp(-(((wavelength - 2) / 1.7) ** 2));
    const absorption = depth * Math.exp(-(((wavelength - 3.05) / .14) ** 2));
    return { bandId: index + 1, wavelength, flux: continuum * (1 - absorption), err: null, qualityFlag: null };
  });
}
