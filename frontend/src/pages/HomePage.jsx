import useHeroAcquisition from '../hooks/useHeroAcquisition';
import useHomeChoreography from '../hooks/useHomeChoreography';
import { BENCHMARK_TARGETS } from '../data/catalog';
import SkyScrollStory from '../components/SkyScrollStory';
import { INVESTIGATION_LINK } from '../data/investigation';
import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, useMemo } from 'react';
import { ArrowRight, ArrowUpRight, Search, Telescope, Layers, Waves } from 'lucide-react';

const IMAGE_SOURCE = 'https://svs.gsfc.nasa.gov/14966/';

const ACCESSIBLE_TARGETS = [
  {
    id: 'barnards-star',
    name: "Barnard’s Star",
    tag: 'Red dwarf',
    desc: 'High proper motion star on the move',
    coords: '17h 57m 48.5s +04° 41′ 36″'
  },
  {
    id: 'wise-0855',
    name: 'WISE 0855',
    tag: 'Brown dwarf',
    desc: 'Sub-zero brown dwarf with water ice clouds',
    coords: '08h 55m 10.8s −07° 14′ 42″'
  },
  {
    id: 'epsilon-indi-b',
    name: 'Epsilon Indi B',
    tag: 'Stellar companion',
    desc: 'Benchmark cool brown dwarf companion',
    coords: '22h 04m 18.3s −56° 46′ 59″'
  },
  {
    id: 'rw-aurigae',
    name: 'RW Aurigae',
    tag: 'Young system',
    desc: 'Young star system with dimming disk',
    coords: '05h 07m 49.6s +30° 24′ 05″'
  },
  {
    id: 'r-draconis',
    name: 'R Draconis',
    tag: 'Variable star',
    desc: 'Pulsating Mira variable star field',
    coords: '16h 32m 39.2s +66° 45′ 07″'
  },
  {
    id: 'unwise-fallback',
    name: 'Galactic Plane Field',
    tag: 'Crowded field',
    desc: 'Dense stellar Milky Way coordinate preset',
    coords: '17h 45m 40.0s −29° 00′ 28″'
  }
];

const SEARCH_PROMPTS = [
  "Barnard’s Star",
  "WISE 0855",
  "Epsilon Indi B",
  "RW Aurigae",
  "R Draconis",
  "Galactic Plane Field",
  "17h 57m 48.5s +04d 41m 36s",
  "269.45, 4.69"
];

export default function HomePage() {
  const motionRoot = useHomeChoreography();
  useHeroAcquisition(motionRoot);
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [promptIdx, setPromptIdx] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const containerRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setPromptIdx(prev => (prev + 1) % SEARCH_PROMPTS.length);
    }, 2800);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleOutsideClick = event => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsFocused(false);
        setHighlightedIdx(-1);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ACCESSIBLE_TARGETS;
    return ACCESSIBLE_TARGETS.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.desc.toLowerCase().includes(q) ||
      t.tag.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q)
    );
  }, [query]);

  const selectTarget = target => {
    setIsFocused(false);
    const pointing = BENCHMARK_TARGETS.find(item => item.id === target.id);
    navigate(pointing ? `/explorer?ra=${pointing.ra}&dec=${pointing.dec}` : '/explorer');
  };

  const startSearch = event => {
    event?.preventDefault();
    if (highlightedIdx >= 0 && filtered[highlightedIdx]) {
      selectTarget(filtered[highlightedIdx]);
      return;
    }
    setIsFocused(false);
    navigate(query.trim() ? `/explorer?q=${encodeURIComponent(query.trim())}` : '/explorer');
  };

  const handleKeyDown = event => {
    if (!isFocused && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      setIsFocused(true);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIdx(prev => (prev + 1) % Math.max(1, filtered.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIdx(prev => (prev <= 0 ? filtered.length - 1 : prev - 1));
    } else if (event.key === 'Enter') {
      if (highlightedIdx >= 0 && filtered[highlightedIdx]) {
        event.preventDefault();
        selectTarget(filtered[highlightedIdx]);
      }
    } else if (event.key === 'Escape') {
      setIsFocused(false);
      setHighlightedIdx(-1);
    }
  };

  return (
    <div className="home-page" ref={motionRoot}>
      <div className="hero-scroll-runway">
      <section className="cosmic-hero scroll-opening" aria-labelledby="hero-title">
        <div className="hero-optics"><img className="hero-image" src="/images/spherex-space-enhanced.jpg" srcSet="/images/spherex-space-enhanced.jpg 1920w, /images/spherex-space-enhanced-4k.jpg 3840w" sizes="100vw" alt="AI-assisted artist’s concept based on NASA’s SPHEREx reference: bright white telescope shields, gold instrument details and a vivid blue Earth limb" fetchPriority="high" width="3840" height="2160" /></div>
        <div className="hero-shade" />
        <div className="hero-content">
          <div className="hero-heading-group"><div className="eyebrow"><span className="tiny-cross">+</span> THE UNIVERSE, IN A DIFFERENT LIGHT</div>
          <h1 id="hero-title">There’s more<br />to the sky<br />than <em className="hero-focus-words">meets the eye.<span className="hero-focus-glint" aria-hidden="true" /></em></h1>
          <p className="hero-description">Look beyond visible light. Explore infrared images,<br className="desktop-break" /> compare the sky across time, and follow your curiosity.</p></div>
          <div className="hero-search-stage"><div className="hero-search-wrap" ref={containerRef}>
            <form className="hero-search" onSubmit={startSearch} role="search">
              <Search size={18} aria-hidden="true" />
              <input
                aria-label="Find an object or coordinates"
                aria-autocomplete="list"
                aria-expanded={isFocused}
                aria-controls="hero-search-suggestions"
                value={query}
                onChange={event => {
                  setQuery(event.target.value);
                  setHighlightedIdx(-1);
                  setIsFocused(true);
                }}
                onFocus={() => setIsFocused(true)}
                onKeyDown={handleKeyDown}
                placeholder={`An object name or sky coordinates (e.g. ${SEARCH_PROMPTS[promptIdx]})`}
              />
              <button type="submit" aria-label="Explore this search"><ArrowRight size={20} /></button>
            </form>

            {isFocused && (
              <div
                id="hero-search-suggestions"
                className="hero-search-dropdown"
                role="listbox"
                aria-label="Accessible target suggestions"
              >
                <div className="dropdown-header">
                  <span>ACCESSIBLE TARGETS</span>
                  <span>{filtered.length} AVAILABLE</span>
                </div>
                <div className="dropdown-list">
                  {filtered.map((target, idx) => (
                    <button
                      type="button"
                      key={target.id}
                      role="option"
                      aria-selected={highlightedIdx === idx}
                      className={`hero-search-item ${highlightedIdx === idx ? 'highlighted' : ''}`}
                      onMouseDown={e => {
                        e.preventDefault();
                        selectTarget(target);
                      }}
                      onMouseEnter={() => setHighlightedIdx(idx)}
                    >
                      <div className="hero-search-item-info">
                        <div className="hero-search-item-title">
                          <span>{target.name}</span>
                          <span className="hero-search-item-badge">{target.tag}</span>
                        </div>
                        <span className="hero-search-item-desc">{target.desc}</span>
                      </div>
                      <div className="hero-search-item-meta">
                        <span className="hero-search-item-coords">{target.coords}</span>
                        <ArrowUpRight size={14} className="hero-search-item-icon" />
                      </div>
                    </button>
                  ))}
                  {filtered.length === 0 && (
                    <div className="hero-search-empty">
                      <span>No matching preset found.</span>
                      <small>Press Enter to search via resolver or jump to coordinates.</small>
                    </div>
                  )}
                </div>
                <div className="dropdown-footer">
                  <span>TIP: Coordinates (RA, Dec or HMS/DMS) can also be entered directly.</span>
                </div>
              </div>
            )}
          </div>
          <Link className="first-mission-link" to="/missions/changing-sky">New here? Start an eight-minute investigation <ArrowRight size={14} /></Link></div>
        </div>
        <div className="hero-coordinate" aria-hidden="true"><span>SPHEREx</span><div className="coordinate-cross" /><span>LOW EARTH ORBIT</span></div>
        <a className="scroll-cue" href="#discover">SCROLL TO DISCOVER <ArrowRight size={13} /></a>
        <div className="hero-bottom">
          <div><span className="hero-overline">AN INFRARED PERSPECTIVE</span><span>See the familiar. Discover the unseen.</span></div>
          <a href={IMAGE_SOURCE} target="_blank" rel="noreferrer" className="image-credit">SPHEREx · ABOVE EARTH <ArrowUpRight size={13} /><small>Mission illustration · Not telescope data</small></a>
        </div>
      </section>
      </div>

      <section id="discover" className="discovery-section" aria-labelledby="discovery-title">
        <div className="section-heading"><div><div className="eyebrow">CHOOSE YOUR FIRST QUESTION</div><h2 id="discovery-title">Three ways to investigate.</h2></div><Link className="text-link" to="/targets">Find your first target <ArrowUpRight size={16} /></Link></div>
        <div className="discovery-grid">
          {[
            { icon: Telescope, number: '01', title: 'Find your patch of sky', text: 'Start with a star, an object name, or a set of coordinates. Browse real SPHEREx DR1 observations from IRSA.', link: '/explorer', cta: 'Explore the sky' },
            { icon: Layers, number: '02', title: 'Let time tell a story', text: 'Compare two real SPHEREx exposures from March and May. Investigate what could explain the difference.', link: INVESTIGATION_LINK, cta: 'Compare real images' },
            { icon: Waves, number: '03', title: 'Question the difference', text: 'Learn to read an image, compare fairly and record a conclusion supported by the available evidence.', link: '/learn#read-image', cta: 'Read the field guide' }
          ].map(({ icon: Icon, number, title, text, link, cta }) => <Link className="discovery-card" key={number} to={link}><div className="card-top"><Icon size={25} strokeWidth={1} /><span>{number} /</span></div><h3>{title}</h3><p>{text}</p><span className="card-cta">{cta}<ArrowUpRight size={16} /></span></Link>)}
        </div>
      </section>
      <SkyScrollStory />
      <section className="learning-invitations" aria-label="Discover by doing"><Link to="/missions/changing-sky"><span className="eyebrow">FOLLOW A QUESTION</span><strong>A Changing Sky</strong><span>Start with two real exposures ↗</span></Link><Link to="/library"><span className="eyebrow">KEEP THE EVIDENCE</span><strong>Your observation journal</strong><span>Review your findings and inputs ↗</span></Link></section>
      <section className="home-learn"><div><div className="eyebrow">BEFORE YOU COMPARE</div><h2>What does infrared reveal?</h2><p>Read a real image. Check dates and wavelengths. Learn what a difference can—and cannot—tell you.</p></div><Link className="btn-secondary" to="/learn">Meet the invisible universe <ArrowUpRight size={16} /></Link></section>
      <section className="mission-note" data-reveal><span className="mission-mark">OPEN<br />EXPLORATION</span><p>An independent educational project inspired by NASA’s SPHEREx mission. Explore real SPHEREx images and measured channels, with unWISE available as a separate context view. Apparent differences require further checks; the app does not establish planet detections.</p><Link to="/architecture">About the data <ArrowUpRight size={15} /></Link></section>
    </div>
  );
}
