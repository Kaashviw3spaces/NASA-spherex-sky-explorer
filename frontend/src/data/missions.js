const webb = 'https://science.nasa.gov/asset/webb/cosmic-cliffs-in-the-carina-nebula-nircam-image/';
export const MISSIONS = [
  { id: 'invisible-universe', title: 'The Invisible Universe', level: 'Beginner', minutes: 5,
    question: 'How can an image show light our eyes cannot see?', image: true,
    context: 'Webb’s NIRCam image of NGC 3324 uses visible colors assigned to infrared filters. It is a real processed image, not SPHEREx data.', source: webb,
    steps: ['Inspect the credited Webb image and read its color note.', 'Use the infrared lesson’s wavelength slider.', 'Open a sky field and check whether it is observed or simulated.'],
    links: [['Inspect the infrared lesson', '/learn#first-lesson'], ['Open a sky field', '/explorer?target=barnards-star']],
    check: { question: 'Why can we see colors in the Webb image?', options: ['Our eyes now detect infrared.', 'Infrared data was mapped to visible colors.', 'The image is a SPHEREx spectrum.'], correct: 1, explanation: 'Visible display colors represent infrared observations; they are not naked-eye colors.' },
    prompt: 'What did the source labels tell you about the image you explored?'
  },
  { id: 'stars-secret', title: 'A Star’s Secret', level: 'Beginner', minutes: 7,
    question: 'What does a spectrum add to a photograph?',
    context: 'WISE 0855 is a brown dwarf studied in infrared light. The linked NASA account describes real spectroscopy; this app’s spectrum remains a simulation.', source: 'https://science.nasa.gov/universe/exoplanets/astronomers-find-water-clouds-in-cold-jupiter-like-object/',
    steps: ['Open WISE 0855 and inspect the available image’s data label.', 'Move along the simulated spectrum and compare wavelengths.', 'Read the real spectroscopy account linked below.'],
    links: [['Explore WISE 0855', '/explorer?target=wise-0855#spectrum'], ['Try a teaching spectrum', '/experiments?lab=spectrum']],
    check: { question: 'Can this app’s curve identify molecules in WISE 0855?', options: ['Yes, all displayed curves are measurements.', 'No; it is simulated, and real evidence must come from observations.', 'Yes, a reference marker is a detection.'], correct: 1, explanation: 'A real interpretation needs observed, calibrated spectra and uncertainty estimates.' },
    prompt: 'What would you need before trusting a claim about a star’s atmosphere?'
  },
  { id: 'meet-the-dust', title: 'Dust Between the Stars', level: 'Explore', minutes: 7,
    question: 'Why can infrared reveal a different view through cosmic dust?', image: true,
    context: 'The Webb image shows NGC 3324 in infrared. Use it as context, then test a simplified foreground-screen model; the model is not fitted to this nebula.', source: 'https://science.nasa.gov/mission/webb/science-overview/science-explainers/infrared-astronomy/',
    steps: ['Inspect the credited Webb image.', 'Change attenuation in Meet the Dust.', 'Compare transmission at 0.75 and 5 µm and read the model limitations.'],
    links: [['Open the dust experiment', '/experiments?lab=dust']],
    check: { question: 'Does infrared pass through every cloud unchanged?', options: ['Always.', 'No; wavelength, dust amount and composition matter.', 'Yes, if the picture is colored blue.'], correct: 1, explanation: 'Real dust also scatters and emits light. A smooth transmission curve omits these effects.' },
    prompt: 'Name one thing this dust model leaves out.'
  },
  { id: 'changing-sky', title: 'A Changing Sky', level: 'Explore', minutes: 8,
    question: 'Does a changing pixel prove a changing star?',
    context: 'Barnard’s Star is a red dwarf with apparent motion across the sky. Our unWISE requests may return combined releases, not individual exposures; simulations are not evidence of its motion.', source: 'https://eso.org/public/images/eso1837d/',
    steps: ['Open Barnard’s Star and inspect the first and last source labels.', 'Try swipe or blink to compare available releases.', 'Check the dates and band; list an alternative explanation for a difference.'],
    links: [['Compare the field', '/explorer?target=barnards-star&mode=swipe']],
    check: { question: 'What should you check before interpreting a difference?', options: ['Only whether it looks dramatic.', 'Dates, bandpasses, calibration, resolution, noise and alignment.', 'Whether the colormap is gold.'], correct: 1, explanation: 'Combined releases can overlap in observing time. A difference alone is not a verified transient or proper-motion measurement.' },
    prompt: 'What else could explain a difference besides a real change in the source?'
  },
  { id: 'read-the-light', title: 'Read the Light', level: 'Explore', minutes: 8,
    question: 'Can you tell a shifted feature from a deeper feature?',
    context: 'Compare two demonstrations: wavelength shift and absorption strength. Neither model is an observation of an object.', source: 'https://www.jpl.nasa.gov/edu/resources/lesson-plan/math-of-the-expanding-universe/',
    steps: ['Set z = 1 in Stretch the Light and compare rest and observed wavelengths.', 'Change absorption strength in Read a Spectrum.', 'Notice whether each control moves a feature or changes its depth.'],
    links: [['Stretch the Light', '/experiments?lab=redshift'], ['Read a Spectrum', '/experiments?lab=spectrum']],
    check: { question: 'Which control changes the feature’s position?', options: ['Absorption strength in this model.', 'Redshift.', 'The display colormap.'], correct: 1, explanation: 'Redshift multiplies wavelength by 1 + z. Our absorption-depth control changes strength at a fixed wavelength.' },
    prompt: 'How would you describe the difference between a shifted feature and a deeper dip?'
  }
];
export function canCompleteMission(mission, record) {
  return Boolean(record?.passed && mission.steps.every((_, index) => record.objectives?.[index] === true) && record.reflection?.trim());
}
