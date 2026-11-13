import { Link, useLocation } from 'react-router-dom';
import { Telescope, Compass, Bookmark, Target, Cpu, Sparkles } from 'lucide-react';

export default function Navbar() {
  const location = useLocation();

  const navItems = [
    { to: '/', label: 'Overview', icon: Telescope },
    { to: '/explorer', label: 'Sky Explorer', icon: Compass },
    { to: '/scene', label: 'Scene View', icon: Sparkles },
    { to: '/library', label: 'Library', icon: Bookmark },
    { to: '/targets', label: 'Benchmark Targets', icon: Target },
    { to: '/architecture', label: 'Architecture', icon: Cpu }
  ];

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link to="/" className="brand-lockup">
          <span className="brand-dot" />
          <span className="brand-title">SPHEREx Sky Explorer</span>
          <span className="brand-sub">0.75–5.0 µm All-Sky Telemetry</span>
        </Link>

        <nav className="nav-links">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.to;
            return (
              <Link key={item.to} to={item.to} className={`nav-link ${active ? 'active' : ''}`}>
                <Icon size={14} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
