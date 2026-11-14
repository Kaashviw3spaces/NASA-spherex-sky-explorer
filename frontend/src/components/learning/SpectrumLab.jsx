import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import SpectrumChart from '../SpectrumChart';
import GlossaryTerm from './GlossaryTerm';
import { teachingSpectrum } from '../../data/scienceModels';
import { useLabSteps } from '../../hooks/useLabScroll';
const curve=teachingSpectrum();
export default function SpectrumLab() {
  const [sample,setSample]=useState(3.05), [target,setTarget]=useState(false);
  const current=useRef(sample), frame=useRef(null); current.current=sample;
  const focusDip=useCallback(()=>{cancelAnimationFrame(frame.current);setTarget(true);if(matchMedia('(prefers-reduced-motion: reduce)').matches){setSample(3.05);return;}const start=performance.now(),from=current.current;const draw=time=>{const t=Math.min(1,(time-start)/750);setSample(from+(3.05-from)*(1-(1-t)**3));if(t<1)frame.current=requestAnimationFrame(draw);};frame.current=requestAnimationFrame(draw);},[]);
  const onStep=useCallback(index=>{if(index===2)focusDip();else setTarget(false);},[focusDip]);
  const root=useLabSteps(onStep);
  useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const changed=()=>{if(media.matches){cancelAnimationFrame(frame.current);setSample(3.05);}};media.addEventListener('change',changed);return()=>{cancelAnimationFrame(frame.current);media.removeEventListener('change',changed);};},[]);
  const select=value=>{cancelAnimationFrame(frame.current);setSample(value);setTarget(false);};
  const trough=curve.reduce((a,b)=>Math.abs(b.wavelength-3.05)<Math.abs(a.wavelength-3.05)?b:a);
  const spectrumFact = 'SPHEREx fact: repeated exposures sample different infrared wavelengths. Together they help build a spectrum; one snapshot does not give every object all 102 channels.';
  const absorptionFact = 'Water ice can absorb near 3.05 µm. Astronomers check the feature’s shape, other features and measurement errors before identifying it. This model is an illustration, not a detection.';
  return <div className="chapter-spread lab-scroll-grid" ref={root}>
    <div className="topic-lab sticky-instrument" data-scroll-reveal>
      <div className="eyebrow">SIMULATED SPECTRUM · ARBITRARY UNITS</div>
      <div className="spectrum-lab-chart"><SpectrumChart hoverSelect bands={curve} inSpherexFootprint activeWavelength={sample} onSelectWavelength={select} showLines={false} />{target&&<svg className="spectrum-target" viewBox="0 0 520 236" aria-hidden="true"><circle className="trough-ring" cx={46+(3.05-.75)/4.25*446} cy={20+182-trough.flux*182} r="10" stroke="#D8B26E" fill="none" /></svg>}</div>
      <div className="false-color-strip" role="img" aria-label={`Assigned teaching color at ${sample.toFixed(2)} micrometers, not a visible infrared color`}><span style={{left:`${(sample-.75)/4.25*100}%`,backgroundColor:`hsl(${220-(sample-.75)/4.25*180} 55% 65%)`}} /></div>
      <p className="quiet-note">Assigned false-color scale · infrared has no visible hue. Not a physical dispersion prism.</p><p>A generated curve, not a measurement of a star.</p>
    </div>
    <div className="chapter-note lab-notebook"><span className="margin-label">IN YOUR NOTEBOOK</span>
      <article data-scroll-reveal data-lab-step="0"><h3>Peaks, dips, and questions.</h3><p>Wavelength runs left to right. Signal runs bottom to top. Move along the curve to inspect it.</p><p>First describe the shape: where is it high, low or changing quickly? An explanation comes after that observation.</p></article>
      <article data-scroll-reveal data-lab-step="1"><h3>Spectrum</h3><p>A spectrum separates a signal by wavelength. Here every point was generated for teaching.</p><p>{spectrumFact}</p><p>In Explore, real channels appear as measured points with uncertainty bars. Empty gaps mean missing measurements, not zero light.</p><GlossaryTerm term="spectrum" /></article>
      <article data-scroll-reveal data-lab-step="2"><details onToggle={event=>{if(event.currentTarget.open)focusDip();}}><summary>Absorption</summary><p>A dip is a decrease relative to the surrounding continuum. This dip was placed in the model; it does not identify a molecule in space.</p><p>{absorptionFact}</p><GlossaryTerm term="absorption" /></details><button className="btn-compact" onClick={focusDip}>Inspect the model dip</button></article>
      <Link className="text-link" to="/experiments?lab=spectrum">Try changing the feature ↗</Link>
    </div>
  </div>;
}
