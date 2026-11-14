import { useLayoutEffect } from 'react';
import { clamp01 } from '../utils/scrollChoreography';

export default function useHeroAcquisition(root) {
  useLayoutEffect(() => {
    const hero = root.current?.querySelector('.scroll-opening');
    if (!hero) return;
    const runway = hero.parentElement, optics = hero.querySelector('.hero-optics');
    const heading = hero.querySelector('.hero-heading-group'), subtitle = hero.querySelector('.hero-description');
    const search = hero.querySelector('.hero-search-stage'), eyebrow = hero.querySelector('.hero-heading-group .eyebrow');
    const shade = hero.querySelector('.hero-shade');
    const reticle = hero.querySelector('.hero-coordinate'), bottom = hero.querySelector('.hero-bottom'), cue = hero.querySelector('.scroll-cue');
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const smooth = value => { const t=clamp01(value); return t*t*(3-2*t); };
    let frame;
    const reset = () => { [optics,shade,heading,subtitle,search,eyebrow,reticle,bottom,cue].forEach(element => { element.style.opacity=''; element.style.transform=''; }); search.inert=false; search.removeAttribute('aria-hidden'); delete hero.dataset.searchReady; };
    const render = () => {
      frame = null;
      if (media.matches) { reset(); return; }
      const inset = parseFloat(getComputedStyle(hero).top) || 0;
      const box = runway.getBoundingClientRect();
      const p = clamp01((inset-box.top)/Math.max(1,box.height-hero.offsetHeight));
      const light = smooth(p/.6), arrival = smooth((p-.6)/.25);
      optics.style.opacity=String(light); shade.style.opacity=String(light);
      optics.style.transform=`scale(${1.12-.12*light})`;
      const copyExit = smooth((p-.46)/.2);
      heading.style.opacity=String(1-copyExit);
      heading.style.transform=`translate3d(0,calc(-50% - ${p*65}px),0) scale(${1-.07*light})`;
      eyebrow.style.opacity=String(smooth((p-.025)/.10));
      subtitle.style.opacity=String(smooth((p-.055)/.12));
      search.style.opacity=String(arrival);
      search.style.transform=`translate3d(-50%,calc(-50% + ${(1-arrival)*24}px),0)`;
      search.inert=false; search.removeAttribute('aria-hidden');
      hero.dataset.searchReady=String(arrival>.5);
      reticle.style.opacity=String(light*(1-arrival));
      reticle.style.transform=`translate3d(0,${p*-24}px,0)`;
      bottom.style.opacity=String(light);
      cue.style.opacity=String(smooth(p/.12)*(1-arrival));
    };
    const update=()=>{ if (!frame) frame=requestAnimationFrame(render); };
    const focusSearch = () => {
      if (media.matches || Number(search.style.opacity) > .9) return;
      const box=runway.getBoundingClientRect(), inset=parseFloat(getComputedStyle(hero).top)||0;
      window.scrollTo({top:scrollY+box.top-inset+(box.height-hero.offsetHeight)*.9,behavior:'instant'});
      render();
    };
    render(); window.addEventListener('scroll',update,{passive:true});window.addEventListener('resize',update);media.addEventListener('change',update);search.addEventListener('focusin',focusSearch);
    return()=>{ cancelAnimationFrame(frame);window.removeEventListener('scroll',update);window.removeEventListener('resize',update);media.removeEventListener('change',update);search.removeEventListener('focusin',focusSearch);reset(); };
  },[root]);
}
