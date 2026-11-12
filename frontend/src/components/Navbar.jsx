import { NavLink } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';

export default function Navbar() {
  return (
    <header className="topbar">
      <NavLink to="/" className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-title">SPHEREx Sky Explorer</span>
        <span className="brand-sub">0.75–5.0 µm · WCS Workbench</span>
      </NavLink>

      <nav className="nav-links" aria-label="Primary Navigation">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          Overview
        </NavLink>
        <NavLink
          to="/targets"
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          Benchmark Targets
        </NavLink>
        <NavLink
          to="/architecture"
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          Architecture
        </NavLink>
        <NavLink to="/explorer" className="nav-cta">
          Open Explorer <ArrowUpRight size={14} />
        </NavLink>
      </nav>
    </header>
  );
}
