import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { INVESTIGATION_LINK, SPHEREX_INVESTIGATION as evidence } from '../../data/investigation';

export function RealImageLesson() {
  const [index, setIndex] = useState(0), [failed, setFailed] = useState(false);
  const id = useId();
  const dates = ['19 March 2026', '4 May 2026'];
  return <figure className="observation-lesson real-image-lesson">
    <div className="eyebrow">SPHEREx DR1 / REAL OBSERVATIONS</div>
    <div className="lesson-sky-frame">{failed ? <p role="status">Preview unavailable. Open the live investigation below.</p> : <img src={`/images/learning/spherex-${index ? 'may' : 'march'}.png`} width="128" height="128" alt={`Real SPHEREx reference field on ${dates[index]}, displayed with a shared grayscale stretch`} onError={() => setFailed(true)} />}
      <span className="lesson-orientation" aria-hidden="true">N ↑ · E ←</span>
    </div>
    <div className="btn-row" role="group" aria-label="Choose a real exposure">{dates.map((date, i) => <button className="btn-compact" key={date} aria-pressed={index === i} aria-controls={id} onClick={() => {setIndex(i);setFailed(false);}}>{i ? 'B' : 'A'} · {date}</button>)}</div>
    <figcaption id={id}><strong>{dates[index]} · near {evidence.inputs[index].center_wavelength_um.toFixed(3)} µm at field centre</strong><p>Real telescope data of the same sky patch with identical contrast—zooming in only enlarges the pixels, not the detail.</p><a href={evidence.inputs[index].url} target="_blank" rel="noreferrer">NASA/IPAC IRSA · source FITS ↗</a><Link className="text-link" to={INVESTIGATION_LINK}>Compare the full field ↗</Link></figcaption>
  </figure>;
}

const scenarios = {
  motion: {name:'One point moves', text:'One point shifts relative to its neighbours. Follow the same source across both dates; its apparent displacement is a candidate, not a confirmed discovery.'},
  brightness: {name:'One point brightens', text:'The point stays in place but its signal grows. Check wavelength, calibration, background and measurement uncertainty before calling it variable.'},
  alignment: {name:'The whole field shifts', text:'All points shift together. Suspect image alignment before interpreting any individual bright/dark pair as motion.'}
};

export function MotionLesson() {
  const [scenario, setScenario] = useState('motion');
  const id = useId();
  const points = [[40,55],[95,110],[160,50],[210,100]];
  return <figure className="observation-lesson">
    <div className="eyebrow">ILLUSTRATION / NOT TELESCOPE DATA</div>
    <svg className="motion-lesson-svg" viewBox="0 0 540 180" role="img" aria-label={`Illustrated date A and date B: ${scenarios[scenario].name}`}>
      {[0,1].map(epoch => <g key={epoch} transform={`translate(${epoch*280} 0)`}><rect x="1" y="1" width="258" height="162" rx="4" fill="#07090e" stroke="#34404d"/><text x="14" y="24" fill="#a7b5c6">{epoch ? 'B / LATER' : 'A / EARLIER'}</text>{points.map(([x,y],i) => <g key={i}>
        {epoch===1 && (scenario==='alignment' || (scenario==='motion' && i===2)) && <circle cx={x} cy={y} r="7" fill="none" stroke="#a7b5c6" strokeDasharray="2 3"/>}
        <circle cx={x+(epoch && (scenario==='alignment' || (scenario==='motion' && i===2)) ? 17 : 0)} cy={y} r={epoch && scenario==='brightness' && i===2 ? 9 : 4} fill={i===2 ? '#d8b26e' : '#b7d2e8'}/>
      </g>)}</g>)}
    </svg>
    <div className="btn-row" role="group" aria-label="Compare possible changes">{Object.entries(scenarios).map(([key,item]) => <button className="btn-compact" key={key} aria-pressed={scenario===key} aria-controls={id} onClick={() => setScenario(key)}>{item.name}</button>)}</div>
    <figcaption id={id} aria-live="polite">{scenarios[scenario].text}</figcaption>
  </figure>;
}

export function EvidenceLesson() {
  return <figure className="observation-lesson evidence-lesson">
    <div className="eyebrow">FROM OBSERVATION TO EXPLANATION</div>
    <ol><li><span>01 / NOTICE</span><strong>The field looks dimmer.</strong><p>Describe the signal; do not name a cause yet.</p></li><li><span>02 / CHECK</span><strong>Could the foreground change?</strong><p>Compare the archive’s zodiacal-light model and both dates.</p></li><li><span>03 / CONCLUDE</span><strong>A foreground explanation is plausible.</strong><p>Keep alignment, noise and calibration as alternatives. No motion is established.</p></li></ol>
    <figcaption>The zodiacal model is evidence to assess, not independent proof that every source stayed constant.</figcaption>
  </figure>;
}
