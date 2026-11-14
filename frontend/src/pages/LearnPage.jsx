import WaveLab from '../components/learning/WaveLab';
import SpectrumLab from '../components/learning/SpectrumLab';
import ForensicLens from '../components/learning/ForensicLens';
import { useLabSteps, useLearningTelemetry } from '../hooks/useLabScroll';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import LearningCycle from '../components/learning/LearningCycle';
import Explanation from '../components/learning/Explanation';
import GlossaryTerm from '../components/learning/GlossaryTerm';
import WebbImageStudy from '../components/learning/WebbImageStudy';
import { GLOSSARY } from '../data/glossary';

export default function LearnPage() {
  const [wavelength, setWavelength] = useState(2.5);
  const [activeStep, setActiveStep] = useState(0);
  const waveSteps = useLabSteps(setActiveStep);
  const telemetry = useLearningTelemetry();
  return <div className="page-container learn-page story-learn interactive-field-guide" ref={telemetry}>
    <div className="learn-intro" data-initial-content><div><div className="eyebrow">A FIELD GUIDE TO THE INVISIBLE</div><h1 className="display-title">One question<br /><em>at a time.</em></h1><p className="lead-copy">Scroll, try something, and see what changes.</p><a className="btn-secondary" href="#first-lesson">Begin with light ↓</a></div><WebbImageStudy /></div>
    <hr className="learn-intro-divider" />
    <nav className="learning-nav chapter-nav" data-scroll-reveal aria-label="Learning navigation"><a href="#first-lesson">01 Light<span className="chapter-progress" aria-hidden="true" /></a><a href="#read-light">02 Spectra<span className="chapter-progress" aria-hidden="true" /></a><a href="#compare-sky">03 Comparison<span className="chapter-progress" aria-hidden="true" /></a><a href="#glossary">04 Glossary<span className="chapter-progress" aria-hidden="true" /></a><a href="#learning-questions">Questions<span className="chapter-progress" aria-hidden="true" /></a></nav>

    <section id="first-lesson" className="learn-chapter"><header className="chapter-heading" data-scroll-reveal><span>01 / LIGHT</span><h2>Start with what you can’t see.</h2><p>Infrared light has longer wavelengths than visible light.</p></header>
      <div className="lab-scroll-grid wave-scroll-grid" ref={waveSteps}><WaveLab wavelength={wavelength} onChange={setWavelength} highlight={activeStep===2 || activeStep===3} /><LearningCycle reveal title="Investigate wavelength"
        ask={<p className="learning-question">What changes when a light wave gets longer?</p>}
        explore={<p>Move the wavelength slider. Watch the crest spacing and the λ bracket change together.</p>}
        observe={<p role="status">At <strong>{wavelength.toFixed(2)} µm</strong>, the peaks are {wavelength === 2.5 ? 'at their starting spacing' : wavelength > 2.5 ? 'farther apart' : 'closer together'}.</p>}
        explain={<Explanation title="Why it changes" understand={<p>Longer wavelength means wider peak spacing.</p>} explore={<><p>The distance between peaks changes; the illustrated wave height stays fixed.</p><div className="term-row"><GlossaryTerm term="wavelength" /><GlossaryTerm term="infrared" /></div></>} science={<><p>This slider does not change a telescope observation or demonstrate redshift. SPHEREx samples approximately 0.75–5 µm across 102 bands; complete coverage is not assumed here.</p><a className="text-link" href="https://www.jpl.nasa.gov/press-kits/spherex/mission-overview/science/" target="_blank" rel="noreferrer">NASA / JPL · SPHEREx science ↗</a></>} />}
        reflect={<><p>Wider peak spacing: longer or shorter wavelength?</p><details className="reflection-answer"><summary>Compare your thinking</summary><p>Longer. Wavelength is the distance between neighboring peaks.</p></details></>}
      /></div>
    </section>

    <section id="read-light" className="learn-chapter"><header className="chapter-heading" data-scroll-reveal><span>02 / READ THE LIGHT</span><h2>A picture shows where. A spectrum adds wavelength.</h2><p>Move along the teaching curve. Which part changes most?</p></header><SpectrumLab /></section>

    <section id="compare-sky" className="learn-chapter"><header className="chapter-heading" data-scroll-reveal><span>03 / COMPARE CAREFULLY</span><h2>Different pictures. Better questions.</h2><p>First ask how each image was made.</p></header><ForensicLens /></section>

    <section id="glossary" className="learn-chapter" data-scroll-reveal><header className="chapter-heading"><span>04 / WORDS YOU’LL MEET</span><h2>The language of light.</h2><p>Keep this nearby. Open only the term you need.</p></header><details className="glossary-drawer"><summary>Open the field glossary <span>12 TERMS +</span></summary><div className="glossary-grid">{Object.keys(GLOSSARY).map(term => <GlossaryTerm key={term} term={term} />)}</div></details></section>
    <section id="learning-questions" className="learn-faq learn-chapter" data-scroll-reveal><header className="chapter-heading"><span>BEFORE YOU EXPLORE</span><h2>A few good questions.</h2></header>{[
      ['Are infrared colors what my eyes would see?', 'No. Visible colors are assigned to infrared measurements. Changing the explorer’s colormap changes the display, not the source data.'],
      ['What is real in this app?', 'Observed labels identify resampled unWISE images. If retrieval fails, a labeled simulation appears. The dedicated SPHEREx viewer retrieves real DR1 spectral images from IRSA. All plotted spectra here are simulations.'],
      ['Does a reference marker mean a molecule was found?', 'No. A marker is a wavelength reference. A dip in a generated curve is not an astronomical detection.'],
      ['What can I save?', 'Your journal stores coordinates, settings, source metadata, notes, and learning progress in this browser. It does not archive image pixels.']
    ].map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}<Link className="btn-primary" to="/missions/invisible-universe">Put it into practice ↗</Link></section>
  </div>;
}
