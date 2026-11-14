import EditorialCover from '../components/learning/EditorialCover';
import LearningNav from '../components/learning/LearningNav';
import { useEffect, useRef, useState } from 'react';
import DustColumn from '../components/learning/DustColumn';
import { modelFeatures, snapToFeature } from '../utils/spectralFeatures';
import { Link, useSearchParams } from 'react-router-dom';
import LearningCycle from '../components/learning/LearningCycle';
import Explanation from '../components/learning/Explanation';
import KnowledgeCheck from '../components/learning/KnowledgeCheck';
import SciencePlot from '../components/learning/SciencePlot';
import SpectrumChart from '../components/SpectrumChart';
import { shiftedWavelength, dustTransmission, teachingSpectrum, SAMPLE_WAVELENGTHS } from '../data/scienceModels';

const tabs = [['redshift', 'Stretch the Light'], ['dust', 'Meet the Dust'], ['spectrum', 'Read a Spectrum']];
export default function ExperimentsPage() {
  const [params, setParams] = useSearchParams();
  const selected = tabs.some(([id]) => id === params.get('lab')) ? params.get('lab') : 'redshift';
  return <div className="page-container experiments-page physics-workbench"><EditorialCover image="carina" eyebrow="EXPERIMENTS / YOUR SCIENCE WORKBENCH" title="What happens if…">Make a prediction. Change one thing. Look again.</EditorialCover>
    <LearningNav />
    <div className="lesson-switcher physics-mode-switcher" role="group" aria-label="Choose an experiment"><span className="physics-mode-pill" aria-hidden="true" style={{transform:`translateX(${tabs.findIndex(([id])=>id===selected)*100}%)`}} />{tabs.map(([id, name]) => <button key={id} aria-pressed={id === selected} onClick={() => setParams({ lab: id })}>{name}</button>)}</div>
    <div key={selected} className="physics-model-transition"><Experiment kind={selected} /></div>
  </div>;
}
function Experiment({ kind }) {
  const [z, setZ] = useState(0);
  const [av, setAv] = useState(1);
  const [depth, setDepth] = useState(.5);
  const [wavelength, setWavelength] = useState(3.05);
  const [stage,setStage] = useState(0), [fingerprint,setFingerprint] = useState(null);
  const confirmation = useRef(null), zRef = useRef(z); zRef.current=z;
  useEffect(()=>()=>cancelAnimationFrame(confirmation.current),[]);
  const interacted=()=>setStage(previous=>Math.max(1,previous));
  const changeZ=value=>{cancelAnimationFrame(confirmation.current);setZ(value);interacted();};
  const confirm=({correct})=>{
    setStage(correct?2:1);
    if(kind!=='redshift')return;
    cancelAnimationFrame(confirmation.current);
    const motion=matchMedia('(prefers-reduced-motion: reduce)');
    if(motion.matches){setZ(1);return;}
    const start=performance.now(), from=zRef.current;
    const animate=time=>{if(motion.matches){setZ(1);return;}const t=Math.min(1,(time-start)/900);setZ(from+(1-from)*(1-(1-t)**3));if(t<1)confirmation.current=requestAnimationFrame(animate);};
    confirmation.current=requestAnimationFrame(animate);
  };
  const rest = 1, observed = shiftedWavelength(rest, z);
  const bands = teachingSpectrum(depth);
  const active = bands.reduce((best, item) => Math.abs(item.wavelength - wavelength) < Math.abs(best.wavelength - wavelength) ? item : best, bands[0]);
  const reference = kind === 'dust' ? 'https://science.nasa.gov/mission/webb/science-overview/science-explainers/infrared-astronomy/' : kind === 'redshift' ? 'https://www.jpl.nasa.gov/edu/resources/lesson-plan/math-of-the-expanding-universe/' : 'https://www.jpl.nasa.gov/press-kits/spherex/mission-overview/spacecraft/';
  const question = kind === 'redshift' ? 'Where does a feature go as redshift increases?' : kind === 'dust' ? 'Which wavelengths pass through this model dust more easily?' : 'How does an absorption dip change a spectrum?';
  return <><nav className="lab-route live-lab-route" aria-label="Learning progress">{['01 Predict','02 Adjust the model','03 Explain what changed'].map((label,index)=><span key={label} data-reached={stage>=index} aria-current={stage===index?'step':undefined}>{label}</span>)}</nav><div className="model-label"><span className="model-key" /> EDUCATIONAL MODEL · NOT TELESCOPE DATA</div><LearningCycle sticky title={question}
    ask={<p className="learning-question">{question}</p>}
    explore={kind === 'redshift' ? <><SciencePlot gridStretch={1+z} vector={{rest,observed,delta:observed-rest,color:`hsl(${205-Math.min(z/2,1)*170} 60% 65%)`}} minX={.5} maxX={4.5} yLabel="Relative line profile (arbitrary)" description={`Model feature moves from 1 to ${observed.toFixed(2)} micrometers`} series={[
      { name: 'Rest feature · 1.00 µm', color: '#8bb8d4', dashed: true, points: Array.from({ length: 401 }, (_, i) => { const w = .5 + i / 100; return [w, Math.exp(-(((w - rest) / .06) ** 2))]; }) },
      { name: 'Shifted feature · illustrative', color: `hsl(${205-Math.min(z/2,1)*170} 60% 65%)`, points: Array.from({ length: 401 }, (_, i) => { const w = .5 + i / 100; return [w, Math.exp(-(((w - observed) / (.06 * (1 + z))) ** 2))]; }) }
    ]} /><label className="lab-slider">Redshift z <output>{z.toFixed(2)}</output><input aria-label="Redshift z" type="range" min="0" max="3" step=".05" value={z} onChange={e => changeZ(Number(e.target.value))} /></label><button className="btn-compact" onClick={() => changeZ(0)}>Reset redshift</button><p className="quiet-note">Grid stretching is a visual analogy, not a spacetime simulation. Colors are assigned to illustrate the shift.</p></> : kind === 'dust' ? <><DustColumn attenuation={av} onChange={value=>{setAv(value);interacted();}} /><SciencePlot yLabel="Transmitted fraction" description={`Foreground screen model with A V ${av.toFixed(1)} magnitudes; longer wavelengths transmit more light`} series={[{ name: 'No dust', color: '#8bb8d4', dashed: true, points: [[.75, 1], [5, 1]] }, { name: 'Through model dust', color: '#d9b580', points: SAMPLE_WAVELENGTHS.map(w => [w, dustTransmission(w, av)]) }]} /><label className="lab-slider">Attenuation Aᵥ (magnitudes)<output>{av.toFixed(1)}</output><input aria-label="Dust attenuation A V" type="range" min="0" max="5" step=".1" value={av} onChange={e => {setAv(Number(e.target.value));interacted();}} /></label><button className="btn-compact" onClick={() => {setAv(0);interacted();}}>Remove dust</button></> : <><SpectrumChart hoverSelect bands={bands} inSpherexFootprint activeWavelength={wavelength} onSelectWavelength={value=>{const feature=snapToFeature(value,modelFeatures(bands));setWavelength(feature?.wavelength ?? value);setFingerprint(feature);interacted();}} showLines={false} /><p className="lab-hint">Hover, drag, or use the arrow keys on the curve.</p>{fingerprint && <p className="spectral-fingerprint" role="status">MODEL {fingerprint.kind.toUpperCase()} · {fingerprint.wavelength.toFixed(3)} µm · {fingerprint.flux.toFixed(3)} arbitrary signal. Not a molecular fingerprint or detection.</p>}<label className="lab-slider">Illustrative absorption strength<output>{depth.toFixed(2)}</output><input aria-label="Absorption strength" type="range" min="0" max=".8" step=".05" value={depth} onChange={e => {setDepth(Number(e.target.value));interacted();setFingerprint(null);}} /></label><button className="btn-compact" onClick={() => { setDepth(.5); setWavelength(3.05); }}>Reset spectrum</button></>}
    observe={<p role="status"><span className="live-formula" key={kind==='redshift'?z:kind==='dust'?av:depth}>{kind === 'redshift' ? `1.00 µm × (1 + ${z.toFixed(2)}) = ${observed.toFixed(2)} µm. The feature moves to longer wavelengths, not a different object.` : kind === 'dust' ? `At Aᵥ = ${av.toFixed(1)}, ${(100 * dustTransmission(.75, av)).toFixed(1)}% passes at 0.75 µm and ${(100 * dustTransmission(5, av)).toFixed(1)}% at 5.00 µm.` : `${active.wavelength.toFixed(3)} µm · ${active.flux.toFixed(3)} arbitrary signal. The imposed dip is centered at 3.05 µm; it is not a molecular detection.`}</span></p>}
    explain={<Explanation title="What drives the change?" understand={<p>{kind === 'redshift' ? 'Redshift stretches a feature to a longer wavelength.' : kind === 'dust' ? 'In this model, dust removes more light at shorter wavelengths.' : 'An absorption feature is a decrease relative to the surrounding continuum.'}</p>}
      explore={<p>{kind === 'redshift' ? 'Compare the dashed rest profile with the shifted profile. The rest wavelength is a chosen example, not a specific measured atomic line.' : kind === 'dust' ? 'A foreground dust screen attenuates a source. Real dust can also scatter and emit light; this experiment only calculates transmission.' : 'Changing depth lowers the curve near the chosen feature without moving its wavelength. Real interpretation requires calibration, uncertainty and a physical model.'}</p>}
      science={<p>{kind === 'redshift' ? 'λ observed = λ rest × (1 + z). We stretch the width too, but hold the peak fixed for clarity. No distance, velocity, luminosity or cosmological flux model is calculated.' : kind === 'dust' ? 'T = 10^(−0.4 Aλ); Aλ = Aᵥ(λ / 0.55 µm)^(−1.7). This illustrative smooth power law is shown only over 0.75–5 µm. It is not a fitted universal extinction law; composition, geometry, scattering, emission and dust features are omitted.' : 'A smooth invented continuum is multiplied by a Gaussian dip. All values are arbitrary and generated locally; no uncertainty estimates or SPHEREx channel measurements are available.'}</p>} />}
    reflect={<KnowledgeCheck onChecked={confirm} question={kind === 'redshift' ? 'At z = 1, a rest feature at 1 µm appears at…' : kind === 'dust' ? 'Which conclusion is supported by this model?' : 'Does this curve establish water in a real star?'} options={kind === 'redshift' ? ['0.5 µm', '2 µm', '1 µm'] : kind === 'dust' ? ['All infrared light always passes through dust.', 'Transmission depends on wavelength and attenuation.', 'The graph measures the Carina Nebula.'] : ['Yes, any dip proves water.', 'No, this is a generated teaching curve.', 'Yes, the slider is calibrated.']} correct={1} explanation={kind === 'redshift' ? 'Multiply the rest wavelength by 1 + z.' : kind === 'dust' ? 'This screen model has assumptions; real clouds are more complex.' : 'A feature in a simulation is not an astronomical measurement.'} />}
  /><a className="text-link" href={reference} target="_blank" rel="noreferrer">Scientific background · NASA / JPL ↗</a></>;
}
