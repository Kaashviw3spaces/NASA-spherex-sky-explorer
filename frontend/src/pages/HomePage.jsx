import { Link } from 'react-router-dom';
import { ArrowRight, Compass, Layers } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="page-container">
      <section className="home-hero">
        <div>
          <div className="eyebrow">NASA SPHEREx · Multi-Epoch &amp; Spectral Survey</div>
          <h1 className="display-title">
            Inspect the infrared sky across <em>time</em> and <em>102 spectral bands</em>.
          </h1>
          <p className="lead-copy">
            SPHEREx Sky Explorer is a browser workstation for visual motion detection and
            near-infrared spectroscopy. Query any celestial coordinate or object name to blink
            WCS-aligned epochs, swipe split-curtain cutouts, and extract calibrated 0.75–5.0 µm
            spectral energy distributions—with automatic unWISE fallback outside the SPHEREx
            footprint.
          </p>
          <div className="btn-row">
            <Link to="/explorer" className="btn-primary">
              Launch Sky Explorer <ArrowRight size={15} />
            </Link>
            <Link to="/targets" className="btn-secondary">
              <Compass size={15} /> Benchmark Targets
            </Link>
            <Link to="/architecture" className="btn-secondary">
              <Layers size={15} /> System Architecture
            </Link>
          </div>
        </div>

        <aside className="plate-frame" aria-label="Survey Schematic">
          <svg viewBox="0 0 360 240" style={{ width: '100%', display: 'block', background: '#0b0d10' }}>
            {/* Subtle coordinate graticule */}
            <ellipse cx="180" cy="120" rx="150" ry="88" fill="none" stroke="#232832" strokeWidth="1" />
            <ellipse cx="180" cy="120" rx="100" ry="88" fill="none" stroke="#1b2029" strokeWidth="1" />
            <ellipse cx="180" cy="120" rx="50" ry="88" fill="none" stroke="#1b2029" strokeWidth="1" />
            <line x1="30" y1="120" x2="330" y2="120" stroke="#1b2029" strokeWidth="1" />
            <line x1="180" y1="32" x2="180" y2="208" stroke="#1b2029" strokeWidth="1" />

            {/* Deep fields at ecliptic poles */}
            <circle cx="180" cy="38" r="10" fill="rgba(232,141,58,0.18)" stroke="#e88d3a" strokeWidth="1.2" />
            <circle cx="180" cy="202" r="10" fill="rgba(232,141,58,0.18)" stroke="#e88d3a" strokeWidth="1.2" />

            {/* Sample proper-motion vector */}
            <circle cx="132" cy="134" r="3" fill="#4ea8de" />
            <circle cx="144" cy="126" r="3" fill="#98a0ad" />
            <circle cx="156" cy="118" r="3.5" fill="#e88d3a" />
            <line x1="132" y1="134" x2="156" y2="118" stroke="#e88d3a" strokeWidth="1" strokeDasharray="3 2" />
            <text x="164" y="114" fill="#eceae4" fontSize="9.5" fontFamily="IBM Plex Mono, monospace">
              WISE 0855
            </text>
            <text x="195" y="42" fill="#e88d3a" fontSize="8.5" fontFamily="IBM Plex Mono, monospace">
              NEP Deep Field
            </text>
          </svg>
          <div className="plate-meta">
            <span>PLATE 01 · AITOFF MOC PROJECTION</span>
            <span>6.2″/PX TAN GRID</span>
          </div>
        </aside>
      </section>

      <section className="telemetry-strip" aria-label="Mission Parameters">
        <div className="telemetry-cell">
          <div className="telemetry-val">0.75 – 5.0 µm</div>
          <div className="telemetry-label">102 narrow spectrophotometric channels</div>
        </div>
        <div className="telemetry-cell">
          <div className="telemetry-val">3 Viewports</div>
          <div className="telemetry-label">Alternating blink, split-curtain swipe, and synchronized dual</div>
        </div>
        <div className="telemetry-cell">
          <div className="telemetry-val">100% Sky</div>
          <div className="telemetry-label">Automatic unWISE W1/W2 fallback outside SPHEREx MOC</div>
        </div>
      </section>

      <section className="home-pillars">
        <div>
          <div className="pillar-num">01 / MOTION DETECTION</div>
          <h2 className="pillar-title">Blink, Swipe &amp; Difference</h2>
          <p className="pillar-desc">
            Flip between observation epochs at 1–15 Hz, drag a split-curtain divider, or run
            normalized variance differencing to isolate high-proper-motion brown dwarfs and transients.
          </p>
        </div>
        <div>
          <div className="pillar-num">02 / SPECTROSCOPY</div>
          <h2 className="pillar-title">102-Band SED Profiler</h2>
          <p className="pillar-desc">
            Click any target with an adjustable 1–3 px circular aperture to inspect molecular ice
            bands (H₂O, PAH, CO₂, CO) and scrub wavelengths in real time.
          </p>
        </div>
        <div>
          <div className="pillar-num">03 / RIGOR &amp; EXPORT</div>
          <h2 className="pillar-title">WCS Precision &amp; Deep Links</h2>
          <p className="pillar-desc">
            Regridded tangent-plane cutouts, Data Quality masking, CSV/FITS metadata export, and
            shareable URL query states for reproducible analysis.
          </p>
        </div>
      </section>
    </main>
  );
}
