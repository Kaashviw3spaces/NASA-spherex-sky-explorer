import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { BENCHMARK_TARGETS } from '../data/catalog';

export default function TargetsPage() {
  return (
    <main className="page-container">
      <div className="eyebrow">Catalog · RFC Benchmark Presets</div>
      <h1 className="display-title" style={{ fontSize: '2.8rem', marginBottom: 12 }}>
        Benchmark <em>Targets</em>
      </h1>
      <p className="lead-copy" style={{ marginBottom: 28 }}>
        Select a calibrated benchmark source to open it directly in the Sky Explorer with its
        deep-linked coordinates, epochs, and spectral profile.
      </p>

      <table className="data-table">
        <thead>
          <tr>
            <th>Target</th>
            <th>RA / Dec (ICRS)</th>
            <th>Survey Coverage</th>
            <th>Scientific Signature</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {BENCHMARK_TARGETS.map((t) => (
            <tr key={t.id}>
              <td>
                <strong>{t.name}</strong>
                <div className="mono" style={{ fontSize: 11, color: '#656d7a', marginTop: 2 }}>
                  {t.properMotion}
                </div>
              </td>
              <td className="mono" style={{ fontSize: 12 }}>
                {t.ra.toFixed(4)}°, {t.dec.toFixed(4)}°
                <div style={{ fontSize: 11, color: '#656d7a', marginTop: 2 }}>{t.hmsDms}</div>
              </td>
              <td>
                <span className={`provenance-badge ${t.inSpherexFootprint ? 'spherex' : 'unwise'}`}>
                  {t.survey}
                </span>
              </td>
              <td style={{ color: '#98a0ad', maxWidth: 320 }}>{t.spectralNote}</td>
              <td>
                <Link
                  to={`/explorer?ra=${t.ra}&dec=${t.dec}&fov=${t.fovArcmin}&target=${t.id}`}
                  className="btn-compact"
                >
                  Load in Explorer <ArrowRight size={13} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
