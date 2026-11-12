export default function MocRadar({ ra, dec, inFootprint }) {
  // Simple Aitoff-like mini-projection: RA [0,360] -> x [6,66], Dec [-90,90] -> y [30,4]
  const x = 6 + ((360 - (ra % 360)) / 360) * 60;
  const y = 17 - (dec / 90) * 12;

  return (
    <div
      title={`MOC Footprint Radar: RA ${ra.toFixed(2)}°, Dec ${dec.toFixed(2)}° (${inFootprint ? 'Covered' : 'unWISE Fallback'})`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 8px',
        border: '1px solid #232832',
        borderRadius: 3,
        background: '#0b0d10'
      }}
    >
      <svg width="72" height="34" viewBox="0 0 72 34" aria-hidden="true">
        <ellipse cx="36" cy="17" rx="32" ry="14" fill="none" stroke="#343b48" strokeWidth="1" />
        {/* Approximate Galactic plane exclusion band */}
        <path
          d="M 8 22 Q 36 12 64 12"
          fill="none"
          stroke="rgba(232,141,58,0.35)"
          strokeWidth="3.5"
        />
        <circle
          cx={x}
          cy={y}
          r="2.8"
          fill={inFootprint ? '#52b788' : '#e88d3a'}
          stroke="#0b0d10"
          strokeWidth="0.8"
        />
      </svg>
      <span className="mono" style={{ fontSize: 10.5, color: '#98a0ad' }}>
        MOC {inFootprint ? 'IN' : 'OUT'}
      </span>
    </div>
  );
}
