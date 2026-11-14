import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { clamp01, chapterWeights, storyProgress } from '../utils/scrollChoreography';

const chapters = [
  ['Look once.', 'A single image tells you where light was recorded.'],
  ['Look again.', 'Repeated observations can help reveal motion. Compare dates, wavelengths, and alignment first.'],
  ['Question the change.', 'A moving point is a candidate to investigate—not evidence of a new planet by itself.']
];
export default function SkyScrollStory() {
  const section = useRef(null), canvas = useRef(null), pin = useRef(null);
  const titleLayers = useRef([]), copyLayers = useRef([]), indicators = useRef([]);
  const [step, setStep] = useState(0), [manual, setManual] = useState(false), [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const node = canvas.current, ctx = node.getContext('2d');
    const background = document.createElement('canvas'), backdrop = background.getContext('2d');
    let frame, lastWidth = 0, lastHeight = 0, painted = false, lastStep = -1;
    const draw = () => {
      frame = null;
      const box = section.current.getBoundingClientRect();
      if (painted && !media.matches && (box.bottom < 0 || box.top > innerHeight)) return;
      const inset = parseFloat(getComputedStyle(pin.current).top) || 0;
      const p = media.matches ? 0 : storyProgress(box.top, box.height, innerHeight, inset);
      const weights = chapterWeights(p), current = weights.indexOf(Math.max(...weights));
      if (current !== lastStep) { setStep(current); lastStep = current; }
      weights.forEach((weight, i) => {
        titleLayers.current[i].style.opacity = media.matches ? '1' : String(weight);
        copyLayers.current[i].style.opacity = media.matches ? '1' : String(weight);
        titleLayers.current[i].style.transform = media.matches ? '' : `translate3d(0,${(1-weight)*6}px,0)`;
        copyLayers.current[i].style.transform = media.matches ? '' : `translate3d(0,${(1-weight)*8}px,0)`;
        indicators.current[i].style.opacity = media.matches ? '1' : String(weight);
      });
      if (!ctx || !backdrop) return;
      const width = node.clientWidth, height = node.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
      if (node.width !== Math.round(width*dpr) || node.height !== Math.round(height*dpr) || width !== lastWidth || height !== lastHeight) {
        lastWidth = width; lastHeight = height;
        node.width = Math.round(width*dpr); node.height = Math.round(height*dpr);
        background.width = node.width; background.height = node.height;
        backdrop.setTransform(dpr,0,0,dpr,0,0);
        backdrop.fillStyle = '#07111e'; backdrop.fillRect(0,0,width,height);
        backdrop.strokeStyle = '#98cbd714'; backdrop.lineWidth = 1;
        for (let x=0;x<width;x+=50) { backdrop.beginPath(); backdrop.moveTo(x,0); backdrop.lineTo(x,height); backdrop.stroke(); }
        for (let y=0;y<height;y+=50) { backdrop.beginPath(); backdrop.moveTo(0,y); backdrop.lineTo(width,y); backdrop.stroke(); }
        for (let i=0;i<85;i++) { backdrop.fillStyle='#bbcfdf'; backdrop.beginPath(); backdrop.arc(((i*137+41)%997)/997*width,((i*211+89)%991)/991*height,i%5===0?1.8:.8,0,Math.PI*2); backdrop.fill(); }
      }
      ctx.setTransform(1,0,0,1,0,0); ctx.drawImage(background,0,0); ctx.setTransform(dpr,0,0,dpr,0,0);
      // The same illustrative source morphs continuously; a prior-position trace fades in.
      const x=width*(.32+p*.22), y=height*(.6-p*.16);
      ctx.globalAlpha=weights[1]*.35+weights[2]*.55;
      ctx.strokeStyle='#d9b580'; ctx.setLineDash([3,4]); ctx.strokeRect(width*.32-15,height*.6-15,30,30); ctx.setLineDash([]);
      ctx.globalAlpha=1; ctx.strokeRect(x-15,y-15,30,30);
      ctx.fillStyle='#f0cca0'; ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill();
      ctx.font='11px monospace'; ctx.fillText('ILLUSTRATIVE MOTION / NOT OBSERVATIONS',18,height-22);
      painted=true;
    };
    const update = () => { if (!frame) frame=requestAnimationFrame(draw); };
    const changed = () => { setReduced(media.matches); painted=false; update(); };
    changed(); window.addEventListener('scroll',update,{passive:true}); window.addEventListener('resize',update); media.addEventListener('change',changed);
    const resize = 'ResizeObserver' in window ? new ResizeObserver(update) : null; resize?.observe(node);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll',update); window.removeEventListener('resize',update); media.removeEventListener('change',changed); resize?.disconnect(); };
  }, []);
  const goTo = index => {
    setManual(true);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setStep(index); return; }
    const inset = parseFloat(getComputedStyle(pin.current).top) || 0;
    const box = section.current.getBoundingClientRect();
    const runway = Math.max(1,box.height-innerHeight+inset);
    const progress = [0,.5,1][index];
    window.scrollTo({ top: scrollY+box.top-inset+runway*progress, behavior:'smooth' });
  };
  return <section ref={section} className="sky-scroll-story choreographed-story" id="changing-sky" aria-label="How to investigate a changing sky"><div ref={pin} className="sky-story-pin"><div><span className="eyebrow">PLANET X / ASK WHAT MOVED</span><h2 className="story-copy-stack">{chapters.map(([title],i) => <span ref={node => { titleLayers.current[i]=node; }} className="story-copy-layer" key={title} aria-hidden={!reduced && i!==step}>{title}</span>)}</h2><p className="story-copy-stack">{chapters.map(([title,copy],i) => <span ref={node => { copyLayers.current[i]=node; }} className="story-copy-layer" key={title} aria-hidden={!reduced && i!==step}>{copy}</span>)}</p><div className="btn-row" role="group" aria-label="Story chapters">{chapters.map(([title], index) => <button className="btn-compact story-step" key={title} aria-pressed={step===index} onClick={() => goTo(index)}>{index+1}. {title}<span ref={node => { indicators.current[index]=node; }} className="story-step-highlight" aria-hidden="true">{index+1}. {title}</span></button>)}</div>{manual && <button className="btn-compact" onClick={() => setManual(false)}>Follow scrolling</button>}<Link className="btn-secondary" to="/explorer?ra=269.4521&dec=4.6934">Open real SPHEREx observations ↗</Link><p className="quiet-note">Explore combines context imagery with SPHEREx observation metadata. The spectrum is a teaching model.</p><a className="text-link" href="https://irsa.ipac.caltech.edu/Missions/spherex.html" target="_blank" rel="noreferrer">Real SPHEREx observations at IRSA ↗</a></div><canvas ref={canvas} role="img" aria-label="Teaching illustration of a point moving relative to fixed stars; not telescope measurements" /></div></section>;
}
