import { INVESTIGATION_LINK } from './investigation.js';
const webb = 'https://science.nasa.gov/asset/webb/cosmic-cliffs-in-the-carina-nebula-nircam-image/';
export const MISSIONS = [
  { id: 'invisible-universe', title: 'The Invisible Universe', level: 'Beginner', minutes: 5,
    question: 'How can an image show light our eyes cannot see?', image: true,
    context: 'Webb’s NIRCam image of NGC 3324 uses visible colors assigned to infrared filters. It is a real processed image, not SPHEREx data.', source: webb,
    fact: 'Fun fact: an infrared image can be real even though its display colors were chosen by people. Those colors help us compare light our eyes cannot see.',
    connection: 'SPHEREx link: choose SPHEREx in Explore and read its image date and detector range. The mission samples approximately 0.75–5 µm across 102 bands, with coverage that varies by position.',
    steps: ['Inspect the credited Webb image and read its color note.', 'Use the infrared lesson’s wavelength slider.', 'Open a sky field and check whether it is observed or simulated.'],
    links: [['Inspect the infrared lesson', '/learn#first-lesson'], ['Open a sky field', '/explorer?target=barnards-star&source=spherex']],
    check: { question: 'Why can we see colors in the Webb image?', options: ['Our eyes now detect infrared.', 'Infrared data was mapped to visible colors.', 'The image is a SPHEREx spectrum.'], correct: 1, explanation: 'Visible display colors represent infrared observations; they are not naked-eye colors.' },
    prompt: 'What did the source labels tell you about the image you explored?'
  },
  { id: 'stars-secret', title: 'A Star’s Secret', level: 'Beginner', minutes: 7,
    question: 'What does a spectrum add to a photograph?',
    context: 'WISE 0855 is a brown dwarf studied in infrared light. The linked NASA account describes real spectroscopy. Explore shows available SPHEREx measurements, while Experiments uses a clearly labelled model.', source: 'https://science.nasa.gov/universe/exoplanets/astronomers-find-water-clouds-in-cold-jupiter-like-object/',
    fact: 'Fun fact: 1 µm is 1,000 nanometres. A spectrum gives light an address along the wavelength axis, so features can be compared in the same units.',
    connection: 'SPHEREx link: each graph point is a native-pixel measurement with its own date and uncertainty. There may be no usable samples at a chosen position. Record what is available rather than filling the gaps.',
    steps: ['Open WISE 0855 and inspect the available image’s data label.', 'Inspect available SPHEREx channels and their uncertainties; note any gaps or unavailable measurements.', 'Read the real spectroscopy account linked below.'],
    links: [['Explore WISE 0855', '/explorer?target=wise-0855&source=spherex&panel=spectrum#spectrum'], ['Try a teaching spectrum', '/experiments?lab=spectrum']],
    check: { question: 'Does a chemical reference marker identify a molecule in WISE 0855?', options: ['Yes, every marker is a detection.', 'No; chemical identification needs calibrated observations and supporting evidence.', 'Yes, if the marker matches the image color.'], correct: 1, explanation: 'Check the measured features, uncertainties, background and instrument response. A reference wavelength alone cannot establish a molecule.' },
    prompt: 'What would you need before trusting a claim about a star’s atmosphere?'
  },
  { id: 'meet-the-dust', title: 'Dust Between the Stars', level: 'Explore', minutes: 7,
    question: 'Why can infrared reveal a different view through cosmic dust?', image: true,
    context: 'The Webb image shows NGC 3324 in infrared. Use it as context, then test a simplified foreground-screen model; the model is not fitted to this nebula.', source: 'https://science.nasa.gov/mission/webb/science-overview/science-explainers/infrared-astronomy/',
    fact: 'Fun fact: dust does more than hide stars. It can scatter light and emit infrared radiation of its own.',
    connection: 'SPHEREx link: its infrared channels help astronomers study signatures of material such as water ice and carbon dioxide ice. Detecting them requires more evidence than a dip in this model.',
    steps: ['Inspect the credited Webb image.', 'Change attenuation in Meet the Dust.', 'Compare transmission at 0.75 and 5 µm and read the model limitations.'],
    links: [['Open the dust experiment', '/experiments?lab=dust']],
    check: { question: 'Does infrared pass through every cloud unchanged?', options: ['Always.', 'No; wavelength, dust amount and composition matter.', 'Yes, if the picture is colored blue.'], correct: 1, explanation: 'Real dust also scatters and emits light. A smooth transmission curve omits these effects.' },
    prompt: 'Name one thing this dust model leaves out.'
  },
  { id: 'changing-sky', title: 'A Changing Sky', level: 'Explore', minutes: 8,
    question: 'Does a changing pixel prove a changing star?',
    context: 'Investigate a fixed sky field using two real SPHEREx exposures, taken 46 days apart. The field looks dimmer in May. Did a source change, or did the foreground light change?', source: 'https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products/',
    fact: 'Fun fact: two pictures of the same sky position can sample different wavelengths even when they came from the same SPHEREx detector.',
    connection: 'SPHEREx link: this pair passes the calibrated wavelength check. Most of the field-median difference is consistent with the archive’s zodiacal-light model. That is evidence to investigate foreground glow, not proof of a fading or moving star.',
    steps: ['Open the documented comparison and read the March and May dates for Image A and Image B.', 'Try Swipe, Side-by-Side and Difference with the exact two exposures.', 'Read “Did the field fade?” and save what the foreground model explains, plus one remaining uncertainty.'],
    links: [['Investigate the real pair', INVESTIGATION_LINK]],
    check: { question: 'What should you check before interpreting a difference?', options: ['Only whether it looks dramatic.', 'Dates, bandpasses, calibration, resolution, noise and alignment.', 'Whether the colormap is gold.'], correct: 1, explanation: 'Foreground light can change too. Compatible wavelengths help, but a difference alone is not a verified transient or proper-motion measurement.' },
    prompt: 'What else could explain a difference besides a real change in the source?'
  },
  { id: 'read-the-light', title: 'Read the Light', level: 'Explore', minutes: 8,
    question: 'Can you tell a shifted feature from a deeper feature?',
    context: 'Compare two demonstrations: wavelength shift and absorption strength. Neither model is an observation of an object.', source: 'https://www.jpl.nasa.gov/edu/resources/lesson-plan/math-of-the-expanding-universe/',
    fact: 'Fun fact: redshift moves a pattern of features together. A deeper absorption dip changes a feature’s strength, so these two effects answer different questions.',
    connection: 'SPHEREx link: galaxy redshifts and molecular signatures are part of the mission’s science. Multiple measured channels, calibration and uncertainties help astronomers test an interpretation.',
    steps: ['Set z = 1 in Stretch the Light and compare rest and observed wavelengths.', 'Change absorption strength in Read a Spectrum.', 'Notice whether each control moves a feature or changes its depth.'],
    links: [['Stretch the Light', '/experiments?lab=redshift'], ['Read a Spectrum', '/experiments?lab=spectrum']],
    check: { question: 'Which control changes the feature’s position?', options: ['Absorption strength in this model.', 'Redshift.', 'The display colormap.'], correct: 1, explanation: 'Redshift multiplies wavelength by 1 + z. Our absorption-depth control changes strength at a fixed wavelength.' },
    prompt: 'How would you describe the difference between a shifted feature and a deeper dip?'
  }
];
export function canCompleteMission(mission, record) {
  return Boolean(record?.passed && mission.steps.every((_, index) => record.objectives?.[index] === true) && record.reflection?.trim());
}
