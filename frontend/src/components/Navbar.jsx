import { useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowUpRight, ChevronDown } from 'lucide-react';

export default function Navbar() {
  const { pathname } = useLocation();
  const moreRef = useRef(null);
  const closeMenu = () => { if (moreRef.current) moreRef.current.open = false; };
  return (
    <header className="site-header">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <div className="header-inner">
        <Link to="/" className="brand-lockup" aria-label="SPHEREx Sky Explorer home">
          <img className="brand-logo" src="/images/spherex-logo.png" alt="" width="1950" height="1950" />
          <span className="brand-wordmark"><span className="brand-title">SPHEREx<span className="brand-period">.</span></span><span className="brand-sub">SKY EXPLORER</span></span>
        </Link>
        <nav className="nav-links" aria-label="Main navigation">
          {[['/', 'Home'], ['/explorer', 'Explore'], ['/learn', 'Learn'], ['/library', 'Journal']].map(([to, label]) => (
            <Link key={to} to={to} className={`nav-link ${pathname === to ? 'active' : ''}`} aria-current={pathname === to ? 'page' : undefined}>{label}</Link>
          ))}
          <details ref={moreRef} className="nav-more" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) closeMenu(); }} onKeyDown={event => { if (event.key === 'Escape') { closeMenu(); moreRef.current.querySelector('summary').focus(); } }}>
            <summary className={`nav-link ${['/targets', '/scene', '/architecture', '/experiments'].includes(pathname) || pathname.startsWith('/missions') ? 'active' : ''}`}>Discover <ChevronDown size={13} /></summary>
            <div className="nav-menu">
              <Link to="/missions" onClick={closeMenu}>Discovery missions <ArrowUpRight size={14} /></Link>
              <Link to="/experiments" onClick={closeMenu}>Science experiments <ArrowUpRight size={14} /></Link>
              <Link to="/targets" onClick={closeMenu}>Suggested targets <ArrowUpRight size={14} /></Link>
              <Link to="/legacy-explorer" onClick={closeMenu}>unWISE / demo explorer <ArrowUpRight size={14} /></Link>
              <Link to="/scene" onClick={closeMenu}>Scene studio <ArrowUpRight size={14} /></Link>
              <Link to="/architecture" onClick={closeMenu}>How it works <ArrowUpRight size={14} /></Link>
            </div>
          </details>
        </nav>
        <span className="header-caption"><span className="status-dot" /> A different view of the universe</span>
      </div>
    </header>
  );
}
