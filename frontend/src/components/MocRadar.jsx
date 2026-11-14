import { useRef, useEffect, useState } from 'react';
import { BENCHMARK_TARGETS } from '../data/catalog';
import { globeProject, globeUnproject } from '../utils/celestialGlobe';

// Decorative stars provide depth; only the coordinate grid and named targets encode sky positions.
const stars = Array.from({ length: 740 }, (_, i) => {
  const random = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  return { ra: random(i+1)*360, dec: Math.asin(2*random(i+2000)-1)*180/Math.PI, size: .35+random(i+4000)*1.05, alpha: .25+random(i+6000)*.7 };
});
const W = 480, H = 380, R = 152, CX = W/2, CY = 178;

export default function MocRadar({ currentRa, currentDec, ra, dec, onSelectCoordinate, onSelectTarget, targetName }) {
  const targetRa = currentRa ?? ra ?? 0, targetDec = currentDec ?? dec ?? 0;
  const [view, setView] = useState({ ra: targetRa, dec: targetDec });
  const [hover, setHover] = useState(null);
  const canvasRef = useRef(null), drag = useRef(null);
  useEffect(() => { setView({ ra: targetRa, dec: targetDec }); setHover(null); }, [targetRa, targetDec]);
  const select = coord => {
    if (!coord) return;
    const target = { ...coord, name: `Field (${coord.ra.toFixed(2)}°, ${coord.dec.toFixed(2)}°)`, inMoc: null, inSpherexFootprint: null, fovArcmin: 5, epochs: ['allwise', 'neo2', 'neo5'] };
    (onSelectCoordinate || onSelectTarget)?.(target);
  };
  const pointAt = event => {
    const rect = canvasRef.current.getBoundingClientRect();
    return globeUnproject((event.clientX-rect.left)*W/rect.width/R-CX/R, (CY-(event.clientY-rect.top)*H/rect.height)/R, view.ra, view.dec);
  };
  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas.getContext('2d');
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W*ratio; canvas.height = H*ratio; ctx.scale(ratio, ratio);
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = '#070b13'; ctx.fillRect(0,0,W,H);
    const halo = ctx.createRadialGradient(CX,CY,R*.6,CX,CY,R*1.2);
    halo.addColorStop(0,'#162a42'); halo.addColorStop(.8,'#101c2c'); halo.addColorStop(1,'#070b13');
    ctx.fillStyle = halo; ctx.fillRect(0,0,W,H);
    // Sparse starlight beyond the globe, with no implied survey coverage.
    for (let i=0;i<75;i++) { ctx.fillStyle=`rgba(170,190,214,${.15+(i%4)*.06})`; ctx.fillRect((i*167.37)%W,(i*93.19)%H,.8,.8); }
    ctx.save(); ctx.beginPath(); ctx.arc(CX,CY,R,0,Math.PI*2); ctx.clip();
    const space = ctx.createRadialGradient(CX-50,CY-60,5,CX,CY,R);
    space.addColorStop(0,'#1b2a40'); space.addColorStop(.55,'#101a2b'); space.addColorStop(1,'#050912');
    ctx.fillStyle=space;ctx.fillRect(0,0,W,H);
    // Subtle violet / cyan dust glow: illustrative, not a measured Galactic map.
    ctx.save(); ctx.translate(CX,CY); ctx.rotate(-.48); ctx.scale(1,.34);
    for (const [x,y,color] of [[-65,-12,'rgba(116,75,164,.24)'],[35,8,'rgba(49,131,166,.24)'],[100,-3,'rgba(183,114,108,.13)']]) {
      const cloud=ctx.createRadialGradient(x,y,0,x,y,140);cloud.addColorStop(0,color);cloud.addColorStop(1,'rgba(10,15,28,0)');ctx.fillStyle=cloud;ctx.fillRect(-360,-360,720,720);
    }
    ctx.restore();
    const project = (a,d) => { const p=globeProject(a,d,view.ra,view.dec);return {...p,px:CX+p.x*R,py:CY-p.y*R}; };
    ctx.strokeStyle='rgba(143,173,202,.17)';ctx.lineWidth=.6;
    const curve = points => { ctx.beginPath();let pen=false;for(const [a,d] of points){const p=project(a,d);if(p.z<0){pen=false;continue;}if(pen)ctx.lineTo(p.px,p.py);else ctx.moveTo(p.px,p.py);pen=true;}ctx.stroke(); };
    for(let d=-60;d<=60;d+=30)curve(Array.from({length:181},(_,i)=>[i*2,d]));
    for(let a=0;a<360;a+=30)curve(Array.from({length:91},(_,i)=>[a,-90+i*2]));
    for(const star of stars){ const p=project(star.ra,star.dec);if(p.z<=0)continue;const tint=star.ra%3<1?'180,211,255':star.ra%3<2?'239,209,185':'213,194,245';ctx.fillStyle=`rgba(${tint},${star.alpha*(.35+.65*p.z)})`;ctx.beginPath();ctx.arc(p.px,p.py,star.size,0,Math.PI*2);ctx.fill(); }
    for(const target of BENCHMARK_TARGETS){const p=project(target.ra,target.dec);if(p.z<=0)continue;ctx.shadowBlur=8;ctx.shadowColor='#8bb8d4';ctx.fillStyle='#a5c9e4';ctx.beginPath();ctx.arc(p.px,p.py,2.6,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}
    const reticle = (coord,color) => {const p=project(coord.ra,coord.dec);if(p.z<0)return;ctx.strokeStyle=color;ctx.lineWidth=1;ctx.beginPath();ctx.arc(p.px,p.py,7,0,Math.PI*2);ctx.moveTo(p.px-12,p.py);ctx.lineTo(p.px+12,p.py);ctx.moveTo(p.px,p.py-12);ctx.lineTo(p.px,p.py+12);ctx.stroke();};
    reticle({ra:targetRa,dec:targetDec},'#d8b26e');if(hover)reticle(hover,'#edf2fa');
    ctx.restore();ctx.strokeStyle='rgba(161,189,217,.35)';ctx.lineWidth=.8;ctx.beginPath();ctx.arc(CX,CY,R,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle='#8194ab';ctx.font='9px monospace';ctx.textAlign='center';ctx.fillText('ICRS  /  RA + DEC',CX,H-23);
  }, [view,hover,targetRa,targetDec]);
  return <div className="celestial-globe">
    <div className="celestial-globe-heading"><span className="eyebrow">Celestial sphere</span><button type="button" className="btn-compact" onClick={()=>setView({ra:targetRa,dec:targetDec})}>Center target</button></div>
    <canvas ref={canvasRef} role="application" tabIndex={0} aria-label="Interactive celestial sphere. Drag to rotate, click to select. Arrow keys rotate; Enter selects the center." style={{width:'100%',aspectRatio:`${W}/${H}`,display:'block',touchAction:'pan-y'}}
      onPointerDown={event=>{drag.current={x:event.clientX,y:event.clientY,view:{...view},moved:false};event.currentTarget.setPointerCapture(event.pointerId);}}
      onPointerMove={event=>{const start=drag.current;if(start){const dx=event.clientX-start.x,dy=event.clientY-start.y;if(Math.hypot(dx,dy)>5)start.moved=true;if(start.moved)setView({ra:(start.view.ra+dx*.5+360)%360,dec:Math.max(-89,Math.min(89,start.view.dec+dy*.4))});}else setHover(pointAt(event));}}
      onPointerUp={event=>{if(drag.current&&!drag.current.moved)select(pointAt(event));drag.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
      onPointerCancel={()=>{drag.current=null;setHover(null);}} onPointerLeave={()=>setHover(null)}
      onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();select(view);return;}if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();setHover(null);setView(v=>({ra:(v.ra+(event.key==='ArrowRight'?5:event.key==='ArrowLeft'?-5:0)+360)%360,dec:Math.max(-89,Math.min(89,v.dec+(event.key==='ArrowUp'?5:event.key==='ArrowDown'?-5:0)))}));}} />
    <p className="globe-readout">RA {(hover?.ra??view.ra).toFixed(2)}° · Dec {(hover?.dec??view.dec).toFixed(2)}°</p>
    <p className="quiet-note">Drag to rotate · click to explore.</p>
    <div className="globe-targets">{BENCHMARK_TARGETS.slice(0,5).map(target=><button type="button" className="btn-compact" key={target.id} aria-pressed={target.name===targetName} onClick={()=>{setView({ra:target.ra,dec:target.dec});(onSelectTarget || onSelectCoordinate)?.(target);}}>{target.name}</button>)}</div>
    <p className="quiet-note">Illustrated stars · ICRS coordinate grid.</p>
  </div>;
}
