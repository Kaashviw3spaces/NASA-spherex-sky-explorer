import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowUp } from 'lucide-react';

export default function Experience() {
  const { pathname, hash } = useLocation();
  const progressRef = useRef(null);
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      let target;
      try { target = hash && document.getElementById(decodeURIComponent(hash.slice(1))); } catch { target = null; }
      if (target) target.scrollIntoView({ block: 'start' });
      else window.scrollTo({ top: 0, behavior: 'instant' });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, hash]);

  useEffect(() => {
    let frame;
    const update = () => {
      const distance = document.documentElement.scrollHeight - innerHeight;
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${distance > 0 ? scrollY / distance : 0})`;
      setShowTop(scrollY > 650);
    };
    const onScroll = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
  }, [pathname]);

  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const learn = pathname === '/learn';
    let scrollStarted = !learn || Boolean(hash);
    const elements = [...document.querySelectorAll('[data-reveal], [data-scroll-reveal]')].filter(element => !learn || element.closest('.learn-chapter') || element.matches('.chapter-nav'));
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting && (scrollStarted || media.matches)) { entry.target.dataset.revealState = 'visible'; observer.unobserve(entry.target); }
    }), { threshold: 0, rootMargin: '0px 0px -35px 0px' });
    const setup = () => {
      observer.disconnect();
      elements.forEach(element => {
        element.dataset.revealState = media.matches || (scrollStarted && element.getBoundingClientRect().top < innerHeight * .95) ? 'visible' : 'pending';
        if (!media.matches) observer.observe(element);
      });
    };
    const scrolled = () => {
      if (scrollStarted || window.scrollY <= 1) return;
      scrollStarted = true;
      elements.forEach(element => { const rect = element.getBoundingClientRect(); if (rect.top < innerHeight - 35 && rect.bottom > 0) { element.dataset.revealState = 'visible'; observer.unobserve(element); } });
    };
    setup(); media.addEventListener('change', setup);
    window.addEventListener('scroll', scrolled, { passive: true });
    return () => { observer.disconnect(); media.removeEventListener('change', setup); window.removeEventListener('scroll', scrolled); elements.forEach(e => delete e.dataset.revealState); };
  }, [pathname]);
  return <><div className="reading-progress" aria-hidden="true"><div ref={progressRef} /></div>{showTop && <button className="back-to-top" aria-label="Back to top" onClick={() => { window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); document.getElementById('main-content')?.focus({ preventScroll: true }); }}><ArrowUp size={17} /></button>}</>;
}
