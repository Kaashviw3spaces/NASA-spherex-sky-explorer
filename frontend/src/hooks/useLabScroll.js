import { useEffect, useRef } from 'react';
export function useLabSteps(onStep) {
  const root = useRef(null);
  useEffect(() => {
    const nodes=[...root.current.querySelectorAll('[data-lab-step]')];
    const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting)onStep(Number(entry.target.dataset.labStep));}),{rootMargin:'-25% 0px -40% 0px',threshold:0});
    nodes.forEach(node=>observer.observe(node));return()=>observer.disconnect();
  },[onStep]);
  return root;
}
export function useLearningTelemetry() {
  const root=useRef(null);
  useEffect(()=>{
    const nav=root.current.querySelector('.chapter-nav'), links=[...nav.querySelectorAll('a')];
    const sections=links.map(link=>root.current.querySelector(link.getAttribute('href')));
    let frame;
    const draw=()=>{frame=null;const line=nav.getBoundingClientRect().bottom+18;let active=0; sections.forEach((section,i)=>{if(section.getBoundingClientRect().top<=line)active=i;});links.forEach((link,i)=>{const rect=sections[i].getBoundingClientRect();const p=Math.max(0,Math.min(1,(line-rect.top)/Math.max(1,rect.height)));link.querySelector('.chapter-progress').style.transform=`scaleX(${i===active?p:0})`; if(i===active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});};
    const update=()=>{if(!frame)frame=requestAnimationFrame(draw);};draw();window.addEventListener('scroll',update,{passive:true});window.addEventListener('resize',update);const resize=new ResizeObserver(update);sections.forEach(section=>resize.observe(section));return()=>{cancelAnimationFrame(frame);window.removeEventListener('scroll',update);window.removeEventListener('resize',update);resize.disconnect();};
  },[]);return root;
}
