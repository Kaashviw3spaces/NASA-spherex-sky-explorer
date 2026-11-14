import WaveLab from '../components/learning/WaveLab';
import SpectrumLab from '../components/learning/SpectrumLab';
import { useLabSteps, useLearningTelemetry } from '../hooks/useLabScroll';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import LearningCycle from '../components/learning/LearningCycle';
import Explanation from '../components/learning/Explanation';
import GlossaryTerm from '../components/learning/GlossaryTerm';
import WebbImageStudy from '../components/learning/WebbImageStudy';
import { GLOSSARY } from '../data/glossary';
import { INVESTIGATION_LINK } from '../data/investigation';
import { RealImageLesson, MotionLesson, EvidenceLesson } from '../components/learning/ObservationLessons';
import ExploreVisual from '../components/learning/ExploreVisual';

export default function LearnPage() {
  const [wavelength, setWavelength] = useState(2.5);
  const [activeStep, setActiveStep] = useState(0);
  const waveSteps = useLabSteps(setActiveStep);
  const telemetry = useLearningTelemetry();
  useEffect(() => {
    const revealLinkedLesson = () => {
      const id = window.location.hash.slice(1);
      if (!['first-lesson', 'read-light'].includes(id)) return;
      const section = document.getElementById(id);
      const drawer = section?.closest('details');
      if (drawer) { drawer.open = true; section.scrollIntoView(); }
    };
    revealLinkedLesson();
    window.addEventListener('hashchange', revealLinkedLesson);
    return () => window.removeEventListener('hashchange', revealLinkedLesson);
  }, []);
  return <div className="page-container learn-page story-learn interactive-field-guide" ref={telemetry}>
    <div className="learn-intro" data-initial-content><div><div className="eyebrow">A FIELD GUIDE TO THE INVISIBLE</div><h1 className="display-title">One question<br /><em>at a time.</em></h1><p className="lead-copy">Read an image. Compare dates. Explain what changed.</p><a className="btn-secondary" href="#read-image">Begin with an image ↓</a></div><WebbImageStudy /></div>
    <hr className="learn-intro-divider" />
    <nav className="learning-nav chapter-nav" data-scroll-reveal aria-label="Learning navigation"><a href="#read-image">01 Read an image<span className="chapter-progress" aria-hidden="true" /></a><a href="#compare-sky">02 Compare fairly<span className="chapter-progress" aria-hidden="true" /></a><a href="#conclude">03 Explain a change<span className="chapter-progress" aria-hidden="true" /></a><a href="#glossary">04 Glossary<span className="chapter-progress" aria-hidden="true" /></a><a href="#learning-questions">Questions<span className="chapter-progress" aria-hidden="true" /></a></nav>

    <section id="read-image" className="learn-chapter"><header className="chapter-heading" data-scroll-reveal><span>01 / READ AN IMAGE</span><h2>Know what you’re looking at.</h2><p>A sky image records brightness at a place, time and wavelength.</p></header>
      <RealImageLesson />
      <LearningCycle reveal title="Read a real observation"
        ask={<><p className="learning-question">What does this picture actually measure?</p><p>A telescope collects light, not object names. Each pixel combines light from a small area of sky: sources, foreground glow and measurement noise. A bright dot is something to investigate, not automatically a planet.</p></>}
        explore={<><p>Choose SPHEREx in Explore. Read the observation date, detector range and sky coordinates before comparing anything.</p><ExploreVisual kind="labels" /><Link className="text-link" to={INVESTIGATION_LINK}>Open the real investigation ↗</Link></>}
        observe={<><p>Bright pixels show stronger measured signals. Dark pixels can be faint sky; blue-gray gaps mean no usable coverage, not empty space.</p><p>RA and Dec are sky addresses, like longitude and latitude. A date identifies when the exposure was taken; a wavelength identifies which light it sampled. Keep all three with your finding.</p></>}
        explain={<Explanation title="Light, pixels and color" understand={<p>Infrared is invisible to our eyes. Grayscale or assigned colors make its measured brightness visible. An amber display does not mean the object itself looks amber.</p>} explore={<><p>Display contrast can reveal faint structure without adding detail. Enlarging a pixel does not improve the telescope’s resolution.</p><p>Fun fact: one SPHEREx detector image can sample different wavelengths at different positions. Matching detector names alone is not enough for a fair comparison.</p></>} science={<><p>SPHEREx samples approximately 0.75–5 µm across 102 bands over repeated exposures. A single image does not give every object all 102 channels; wavelength varies across its detector.</p><p>The IMAGE layer measures surface brightness in MJy/sr. VARIANCE describes statistical uncertainty, FLAGS marks pixel conditions, and ZODI supplies a foreground model that has not been subtracted from IMAGE.</p></>} />}
        reflect={<p>Can you name the source, date and sampled wavelengths without guessing from the image’s color?</p>}
      />
    </section>

    <section id="compare-sky" className="learn-chapter"><header className="chapter-heading" data-scroll-reveal><span>02 / COMPARE FAIRLY</span><h2>Same field. Two dates.</h2><p>Make the inputs comparable before interpreting the difference.</p></header>
      <MotionLesson />
      <LearningCycle reveal title="Compare dated sky images"
        ask={<p className="learning-question">Is the sky changing, or are the pictures different?</p>}
        explore={<><p>Select two distinct SPHEREx exposures. Read Image A and Image B, then try Side-by-Side, Swipe and Blink. Use Difference only when the wavelength and coverage checks allow it.</p><ExploreVisual kind="comparison" /><p>Start with several nearby points as references. Blink alternates dates; Swipe uncovers one image over the other. Keep the same field and shared contrast so display changes do not masquerade as sky changes.</p></>}
        observe={<><p>A moving source changes position relative to nearby sources. A brightness change stays at roughly the same position. A bright/dark pair can also come from misalignment.</p><p>Slow apparent motion may be smaller than the image resolution. Fast Solar System objects may leave the field between dates. Not seeing a change does not prove that nothing moved.</p></>}
        explain={<Explanation title="Why subtraction needs care" understand={<p>Different dates alone do not make a fair comparison.</p>} explore={<p>Different wavelengths can show different structures. Blur, noise, foreground glow and missing pixels can also change an image. Shared contrast helps compare displays fairly.</p>} science={<p>The app checks detector range, units, usable overlap and local wavelength centres and widths. These checks do not guarantee identical full bandpasses or accurate star registration. PSF differences can leave residuals around stars.</p>} />}
        reflect={<><p>If subtraction is blocked, use visual comparison and record the reason. “Not enough compatible evidence” is a valid result.</p><details className="reflection-answer"><summary>Quick check: every point jumps in the same direction. What first?</summary><p>Check alignment. A single candidate moving relative to its neighbours is more interesting than the whole frame shifting, but it still needs independent checks and more observations.</p></details></>}
      />
    </section>

    <section id="conclude" className="learn-chapter"><header className="chapter-heading" data-scroll-reveal><span>03 / EXPLAIN A POSSIBLE CHANGE</span><h2>A difference is a question.</h2><p>Describe what you noticed before deciding what caused it.</p></header>
      <EvidenceLesson />
      <LearningCycle reveal title="Record a cautious conclusion"
        ask={<p className="learning-question">What else could explain what you see?</p>}
        explore={<><p>In “Did the field fade?”, compare the March and May images, then read the recorded field-brightness measurements.</p><ExploreVisual kind="foreground" /></>}
        observe={<p>The later field is dimmer. Much of the difference is consistent with the supplied zodiacal-light model: foreground sunlight scattered by dust in our Solar System.</p>}
        explain={<><p>That supports a foreground explanation to investigate. It does not prove that a star faded or moved. The foreground is a model, and source brightness, noise, alignment and image processing still need checks.</p><p>A field median describes the middle brightness value across usable pixels. It is not the brightness of one star. To study a star’s variability, astronomers must separate its light from the background and account for the instrument and uncertainty.</p></>}
        reflect={<><p>Use Record a conclusion: “I noticed … I compared … Another explanation is … I would need …” Save the actual inputs with your note.</p><Link className="text-link" to="/missions/changing-sky">Start A Changing Sky ↗</Link></>}
      />
    </section>

    <p className="learning-source-note">Scientific reference: <a href="https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products/" target="_blank" rel="noreferrer">NASA/IPAC IRSA · SPHEREx images, quality flags, variance and wavelength calibration ↗</a></p>

    <details className="science-details learn-deeper"><summary>Optional: the science of infrared<span>LIGHT &amp; SPECTRA</span></summary>

    <section id="first-lesson" className="learn-chapter"><header className="chapter-heading" data-scroll-reveal><span>LIGHT / OPTIONAL</span><h2>Start with what you can’t see.</h2><p>Infrared light has longer wavelengths than visible light.</p></header>
      <div className="lab-scroll-grid wave-scroll-grid" ref={waveSteps}><WaveLab wavelength={wavelength} onChange={setWavelength} highlight={activeStep===2 || activeStep===3} /><LearningCycle reveal title="Investigate wavelength"
        ask={<><p className="learning-question">What changes when a light wave gets longer?</p><p>Your eyes see only part of the light arriving from space. SPHEREx measures infrared wavelengths that our eyes cannot see, helping astronomers study stars, galaxies and cosmic dust.</p><p>Fun fact: a micrometre (µm) is one millionth of a metre. The slider measures wave spacing, not the size of an object.</p></>}
        explore={<><p>Move the wavelength slider. Watch the crest spacing and the λ bracket change together.</p><p>The bracket measures one complete cycle. Moving two peaks farther apart increases wavelength, even when the illustrated wave height stays the same.</p></>}
        observe={<><p role="status">At <strong>{wavelength.toFixed(2)} µm</strong>, the peaks are {wavelength === 2.5 ? 'at their starting spacing' : wavelength > 2.5 ? 'farther apart' : 'closer together'}.</p><p>At a fixed speed, longer waves have fewer cycles passing a point each second. That means a lower frequency. Changing wavelength does not mean that light travels faster through empty space.</p></>}
        explain={<Explanation title="Why it changes" understand={<p>Longer wavelength means wider peak spacing.</p>} explore={<><p>The distance between peaks changes; the illustrated wave height stays fixed.</p><div className="term-row"><GlossaryTerm term="wavelength" /><GlossaryTerm term="infrared" /></div></>} science={<><p>This slider does not change a telescope observation or demonstrate redshift. SPHEREx samples approximately 0.75–5 µm across 102 bands; complete coverage is not assumed here.</p><a className="text-link" href="https://www.jpl.nasa.gov/press-kits/spherex/mission-overview/science/" target="_blank" rel="noreferrer">NASA / JPL · SPHEREx science ↗</a></>} />}
        reflect={<><p>Wider peak spacing: longer or shorter wavelength?</p><details className="reflection-answer"><summary>Compare your thinking</summary><p>Longer. Wavelength is the distance between neighboring peaks.</p><p>In Explore, look for the µm label on a SPHEREx image or measured channel. It tells you which part of infrared light was sampled.</p></details></>}
      /></div>
    </section>

    <section id="read-light" className="learn-chapter"><header className="chapter-heading" data-scroll-reveal><span>02 / READ THE LIGHT</span><h2>A picture shows where. A spectrum adds wavelength.</h2><p>Move along the teaching curve. Which part changes most?</p></header><SpectrumLab /></section>

    </details>

    <section id="glossary" className="learn-chapter" data-scroll-reveal><header className="chapter-heading"><span>04 / WORDS YOU’LL MEET</span><h2>The language of light.</h2><p>Keep this nearby. Open only the term you need.</p><p>A useful habit is to separate a measurement from an interpretation. “This pixel is brighter in Image B” describes an observation. “The star became brighter” is an explanation that still needs checks for wavelength, background and processing differences.</p><p>Units tell you what a number means. A wavelength in µm is a length; brightness in MJy/sr is a measurement per area on the sky. They answer different questions and should not be compared as if they were the same quantity.</p></header><details className="glossary-drawer"><summary>Open the field glossary <span>12 TERMS +</span></summary><div className="glossary-grid">{Object.keys(GLOSSARY).map(term => <GlossaryTerm key={term} term={term} />)}</div></details></section>
    <section id="learning-questions" className="learn-faq learn-chapter" data-scroll-reveal><header className="chapter-heading"><span>BEFORE YOU EXPLORE</span><h2>A few good questions.</h2></header>{[
      ['Are infrared colors what my eyes would see?', 'No. Visible colors are assigned to infrared measurements. Changing the explorer’s colormap changes the display, not the source data.'],
      ['What is real in this app?', 'Explore lets you choose real SPHEREx images or separate unWISE context images at the same sky coordinates. Its SPHEREx graph reads real native-pixel channels from IRSA. The interactive labs on this Learn page use clearly labelled teaching models. Any simulated image fallback is labelled.'],
      ['Does a reference marker mean a molecule was found?', 'No. A marker is a wavelength reference. A dip in a generated curve is not an astronomical detection.'],
      ['What can I save?', 'Your journal stores coordinates, settings, source metadata, notes, and learning progress in this browser. It does not archive image pixels.'],
      ['Why are some wavelengths or pixels missing?', 'An exposure may not cover the requested position, an archive request may fail, or a quality check may reject a pixel. A gap means the app has no usable measurement there; it is not a measurement of zero brightness.'],
      ['Does a bigger error bar mean the object is changing?', 'No. An error bar describes uncertainty in a measurement. To argue that a source changed, compare compatible observations and assess whether the difference can be explained by measurement errors or other effects.'],
      ['What should I write in a scientific conclusion?', 'State what you observed, name the inputs you compared, and give at least one alternative explanation. “The evidence is inconclusive” is a useful result when the available data cannot separate those explanations.']
    ].map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}<Link className="btn-primary" to="/missions/changing-sky">Put it into practice ↗</Link></section>
  </div>;
}
