import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

const SUBSYSTEMS = [
  {
    layer: '01 · FastAPI Proxy & Two-Tier Cache',
    spec: 'FastAPI, in-memory LRU and bounded disk raster cache',
    detail:
      'Proxies unWISE image requests and CDS name resolution. Explore retrieves SPHEREx metadata and previews for the requested coordinates, discovering DR1 observations through IRSA SIA2 and retrieves native spectral FITS cutouts. No global coverage map is loaded.'
  },
  {
    layer: '02 · WCS Tangent-Plane Reprojection',
    spec: 'Astropy WCS + SciPy interpolation',
    detail:
      'Resamples unWISE pixels to a tangent-plane grid. Interpolation and percentile quantization alter pixels; artifacts remain possible.'
  },
  {
    layer: '03 · Progressive Client Ring Buffer',
    spec: '512×512 Canvas 2D + worker display processing',
    detail:
      'Polls image jobs and decodes binary rasters. The 408-byte spectrum is generated for education, not measured from these images.'
  },
  {
    layer: '04 · Dual-Mode Image Differencing',
    spec: 'Δ = (I₁ - μ₁)/σ₁ - (I₂ - μ₂)/σ₂',
    detail:
      'Runs real-time normalized variance differencing in the browser for interactive scrubbing, paired with on-demand server-side fitted subtraction. The fit score is a heuristic, not a detection probability.'
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

      <div className="table-scroll"><table className="data-table" style={{ marginBottom: 28 }}>
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
              <td className="mono" style={{ fontSize: 12.5, color: '#d9b580', whiteSpace: 'nowrap' }}>
                {s.layer}
              </td>
              <td className="mono" style={{ fontSize: 12, color: '#f0f2f5' }}>
                {s.spec}
              </td>
              <td style={{ color: '#a7b5c6' }}>{s.detail}</td>
            </tr>
          ))}
        </tbody>
      </table></div>

      <div className="panel-box" style={{ marginBottom: 28 }}>
        <div className="panel-header">
          <span className="panel-title">Deep-Link URL State Contract</span>
          <span className="mono" style={{ fontSize: 11, color: '#8698ad' }}>
            RFC §2.D
          </span>
        </div>
        <code className="mono" style={{ fontSize: 12.5, color: '#8bb8d4', wordBreak: 'break-all' }}>
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
