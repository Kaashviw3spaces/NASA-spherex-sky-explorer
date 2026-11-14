import Explanation from './Explanation';
import GlossaryTerm from './GlossaryTerm';
export default function WhatAmISeeing({ frames = [], spectrum = false, difference = false }) {
  const observed = frames.filter(frame => frame.meta?.dataKind === 'observed').length;
  return <details className="seeing-panel"><summary>What am I seeing?<span>QUICK GUIDE +</span></summary><Explanation title={spectrum ? 'Reading the light' : 'Your patch of sky'}
    understand={<p>{spectrum ? 'A teaching curve, not a measured spectrum. Move along it to inspect wavelength and signal.' : difference ? 'A processed subtraction of two frames, not a validated detection. Check both input sources.' : !frames.length || !observed ? 'A simulated star field. It is a preview, not a telescope observation.' : observed === frames.length ? 'An infrared observation from the archive named under About this data, resampled for display.' : 'A mixture of archive images and simulated frames. Check each source label.'}</p>}
    explore={<><p>{spectrum ? 'Peaks and dips illustrate spectral shapes. Reference markers do not establish that a molecule was detected.' : 'Bright pixels show stronger displayed signal. Color maps change appearance, not the source data. Blink and swipe compare releases; changes may be noise or processing artifacts.'}</p><div className="term-row"><GlossaryTerm term="spectrum" /><GlossaryTerm term="flux" /><GlossaryTerm term="epoch" /></div></>}
    science={<><p>{spectrum ? 'Signal units are arbitrary. Measurement uncertainties and real SPHEREx spectra are unavailable.' : 'Source units and dates appear under About this data; unknown values stay unknown. Cross-survey comparisons require compatible calibration, bandpasses and resolution.'}</p><div className="term-row"><GlossaryTerm term="band" /><GlossaryTerm term="fits" /><GlossaryTerm term="wcs" /></div></>}
  /></details>;
}
