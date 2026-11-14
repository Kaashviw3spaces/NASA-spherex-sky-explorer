import { useEffect, useRef } from 'react';
import { clamp01 } from '../utils/scrollChoreography';

export default function useHomeChoreography() {
  const root = useRef(null);
  useEffect(() => {
    const page = root.current;
    if (!page) return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const hero = page.querySelector('.cosmic-hero'), image = page.querySelector('.hero-image');
    const reticle = page.querySelector('.hero-coordinate'), cue = page.querySelector('.scroll-cue');
    const cards = [...page.querySelectorAll('.discovery-card')];
    const learn = [...page.querySelectorAll('.home-learn h2, .home-learn > a')];
    const animations = new Map(), completed = new Set();
    let frame, observer;
    const render = () => {
      frame = null;
      if (media.matches || hero.classList.contains('scroll-opening')) return;
      const rect = hero.getBoundingClientRect(), p = clamp01(-rect.top / rect.height);
      image.style.transform = `translate3d(0,${p * rect.height * .035}px,0) scale(${1 + p * .08})`;
      reticle.style.transform = `translate3d(0,${p * -rect.height * .055}px,0)`;
      cue.style.opacity = String(1 - clamp01(p * 6));
    };
    const update = () => { if (!frame) frame = requestAnimationFrame(render); };
    const reveal = (element, delay = 0) => {
      if (completed.has(element)) return;
      completed.add(element);
      element.style.opacity = '';
      if (!media.matches && element.animate) {
        const animation = element.animate([
          { opacity: 0, transform: `translate3d(0,${cards.includes(element) ? 24 : 16}px,0) scale(${cards.includes(element) ? 1 : .985})` },
          { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' }
        ], { duration: 720, delay, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' });
        animations.set(element, animation);
      }
    };
    const setup = () => {
      observer?.disconnect();
      animations.forEach(animation => animation.cancel()); animations.clear();
      image.style.transform = ''; reticle.style.transform = ''; cue.style.opacity = '';
      [...cards, ...learn].forEach(element => { element.style.opacity = ''; });
      if (media.matches || !('IntersectionObserver' in window)) { [...cards, ...learn].forEach(element => completed.add(element)); return; }
      [...cards, ...learn].forEach(element => { if (!completed.has(element)) element.style.opacity = '0'; });
      observer = new IntersectionObserver(entries => entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        if (entry.target.classList.contains('discovery-grid')) cards.forEach((card, i) => reveal(card, i * 110));
        else learn.forEach((element, i) => reveal(element, i * 100));
        observer.unobserve(entry.target);
      }), { threshold: .12 });
      observer.observe(page.querySelector('.discovery-grid')); observer.observe(page.querySelector('.home-learn'));
      update();
    };
    const focus = event => { const element = [...cards, ...learn].find(node => node.contains(event.target)); if (element) { reveal(element); animations.get(element)?.finish(); } };
    setup();
    window.addEventListener('scroll', update, { passive: true }); window.addEventListener('resize', update);
    media.addEventListener('change', setup); page.addEventListener('focusin', focus);
    return () => {
      cancelAnimationFrame(frame); observer?.disconnect(); animations.forEach(animation => animation.cancel());
      window.removeEventListener('scroll', update); window.removeEventListener('resize', update);
      media.removeEventListener('change', setup); page.removeEventListener('focusin', focus);
      [...cards, ...learn].forEach(element => { element.style.opacity = ''; });
      image.style.transform = ''; reticle.style.transform = ''; cue.style.opacity = '';
    };
  }, []);
  return root;
}
