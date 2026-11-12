import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

const SUBSYSTEMS = [
  {
    layer: '01 · FastAPI Proxy & Two-Tier Cache',
    spec: 'Hugging Face Spaces (2 vCPU / 16 GB RAM), in-memory LRU + bounded 500 MB disk cache',
    detail:
      'Eliminates browser CORS blocks and IP rate-limiting against IPAC/IRSA/CDS. Evaluates SPHEREx Multi-Order Coverage (MOC) maps in O(1) time before upstream cutout fetching.'
  },
  {
    layer: '02 · WCS Tangent-Plane Reprojection',
    spec: 'astropy.wcs + reproject (SPHEREx 6.2″/px & WISE 2.75″/px)',
    detail:
      'Regrids multi-instrument cutouts onto a common tangent-plane grid before transmission so image subtraction does not produce false dipolar artifacts.'
  },
  {
    layer: '03 · Progressive Client Ring Buffer',
    spec: '512×512 capped Canvas/WebGL buffer + ZScale / Asinh / Log stretches',
    detail:
      'Streams a compact 408-byte 1D spectral vector and < 50 KB preview first (< 300 ms time-to-interactive), then loads multi-epoch frames into a phase-locked blink loop.'
  },
  {
    layer: '04 · Dual-Mode Image Differencing',
    spec: 'Δ = (I₁ - μ₁)/σ₁ - (I₂ - μ₂)/σ₂',
    detail:
      'Runs real-time normalized variance differencing in the browser for interactive scrubbing, paired with on-demand server-side PSF-matched subtraction.'
  }
];

export default function ArchitecturePage() {
  return (
    <main className="page-container">
      <div className="eyebrow">RFC Specification · System Topology</div>
      <h1 className="display-title" style={{ fontSize: '2.8rem', marginBottom: 12 }}>
        System <em>Architecture</em>
      </h1>
      <p className="lead-copy" style={{ marginBottom: 28 }}>
        Designed for low-latency astronomical exploration without crashing browser tabs or
        overloading upstream NASA archive endpoints.
      </p>

      <table className="data-table" style={{ marginBottom: 28 }}>
        <thead>
          <tr>
            <th>Subsystem</th>
            <th>Technical Stack</th>
            <th>Design Rationale</th>
          </tr>
        </thead>
        <tbody>
          {SUBSYSTEMS.map((s) => (
            <tr key={s.layer}>
              <td className="mono" style={{ fontSize: 12.5, color: '#e88d3a', whiteSpace: 'nowrap' }}>
                {s.layer}
              </td>
              <td className="mono" style={{ fontSize: 12, color: '#eceae4' }}>
                {s.spec}
              </td>
              <td style={{ color: '#98a0ad' }}>{s.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="panel-box" style={{ marginBottom: 28 }}>
        <div className="panel-header">
          <span className="panel-title">Deep-Link URL State Contract</span>
          <span className="mono" style={{ fontSize: 11, color: '#656d7a' }}>
            RFC §2.D
          </span>
        </div>
        <code className="mono" style={{ fontSize: 12.5, color: '#4ea8de', wordBreak: 'break-all' }}>
          /explorer?ra=133.7951&amp;dec=-7.2451&amp;fov=5.0&amp;epochA=2025-05&amp;epochB=2025-11&amp;mode=blink&amp;stretch=zscale
        </code>
      </div>

      <div className="btn-row">
        <Link to="/explorer" className="btn-primary">
          Open Sky Explorer <ArrowRight size={15} />
        </Link>
        <Link to="/targets" className="btn-secondary">
          Browse Benchmark Targets
        </Link>
      </div>
    </main>
  );
}
