import { useEffect, useRef } from 'react';
export default function WaveLab({ wavelength, onChange, highlight }) {
  const svg = useRef(null), wave = useRef(null), bracket = useRef(null), particle = useRef(null), label = useRef(null);
  const wavelengthRef = useRef(wavelength); wavelengthRef.current = wavelength;
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let frame, phase = 0, last = 0, visible = true;
    const draw = time => {
      const period = 38 * wavelengthRef.current;
      if (!media.matches && visible && !document.hidden) phase += Math.min(40, time - (last || time)) * .07;
      last = time;
      const crest = media.matches ? 30 : phase % period;
      wave.current.setAttribute('points', Array.from({ length: 201 }, (_, i) => { const x=i*2; return `${x},${60-24*Math.cos(2*Math.PI*(x-crest)/period)}`; }).join(' '));
      bracket.current.setAttribute('d', `M${crest} 30V18H${crest+period}V30`);
      particle.current.setAttribute('cx', crest);
      label.current.setAttribute('x', crest+period/2);
      if (!media.matches && visible && !document.hidden) frame=requestAnimationFrame(draw);
    };
    const start = () => { cancelAnimationFrame(frame); last=0; draw(performance.now()); };
    const observer = new IntersectionObserver(entries => { visible=entries[0].isIntersecting; start(); }); observer.observe(svg.current);
    media.addEventListener('change', start); document.addEventListener('visibilitychange', start); start();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); media.removeEventListener('change',start); document.removeEventListener('visibilitychange',start); };
  }, []);
  // Redraw a static reduced-motion schematic when the slider changes.
  useEffect(() => { if (matchMedia('(prefers-reduced-motion: reduce)').matches) { const p=38*wavelength; wave.current.setAttribute('points',Array.from({length:201},(_,i)=>`${i*2},${60-24*Math.cos(2*Math.PI*(i*2-30)/p)}`).join(' ')); bracket.current.setAttribute('d',`M30 30V18H${30+p}V30`); label.current.setAttribute('x',30+p/2); } },[wavelength]);
  return <div className="wave-lab sticky-instrument" data-scroll-reveal data-caliper-active={highlight}><div className="eyebrow">TRY IT / WAVELENGTH SCHEMATIC</div><svg ref={svg} viewBox="0 0 400 120" role="img" aria-label={`Traveling wave model at ${wavelength.toFixed(2)} micrometers; bracket spans adjacent crests`}><path d="M0 60H400" stroke="#34465c" strokeDasharray="3 5" /><polyline ref={wave} fill="none" stroke="#D8B26E" strokeWidth="1.5" /><g className="wave-caliper"><path ref={bracket} fill="none" stroke="#98cbd7" /><text ref={label} y="12" fill="#98cbd7" textAnchor="middle" fontSize="10">λ</text></g><circle ref={particle} cy="36" r="4" fill="#D8B26E" className="phase-particle" /></svg><label htmlFor="wave-wavelength">Shorter waves <output>{wavelength.toFixed(2)} µm</output> Longer waves</label><input id="wave-wavelength" type="range" min=".75" max="5" step=".05" value={wavelength} onChange={e=>onChange(Number(e.target.value))} /><button className="btn-compact" onClick={()=>onChange(2.5)}>Reset to 2.50 µm</button><p>Schematic, not a physical scale or measured spectrum.</p><p className="quiet-note">The glowing dot marks a traveling crest, not a photon’s path. Propagation speed stays fixed in this model; longer wavelengths have lower frequency. Real light in vacuum travels at c.</p></div>;
}
