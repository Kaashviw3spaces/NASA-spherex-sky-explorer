import { BENCHMARK_TARGETS } from '../data/catalog';

function projectSkyToAitoff(raDeg, decDeg, W = 480, H = 176) {
  const cx = W / 2;
  const cy = H / 2;
  const rx = W * 0.44;
  const ry = H * 0.41;

  // Center at RA = 180 deg, East to the left (astronomical convention)
  const normRa = (180 - (((raDeg % 360) + 360) % 360)) / 180;
  const normDec = Math.max(-90, Math.min(90, decDeg)) / 90;

  const latFactor = Math.sqrt(Math.max(0.05, 1 - normDec * normDec * 0.72));
  const x = cx + normRa * rx * latFactor;
  const y = cy - normDec * ry;
  return { x, y };
}

export default function MocRadar({ ra, dec, inFootprint, targetName, onSelectTarget }) {
  const W = 480;
  const H = 176;
  const activePos = projectSkyToAitoff(ra, dec, W, H);
  const nepPos = projectSkyToAitoff(270, 66.56, W, H);
  const sepPos = projectSkyToAitoff(90, -66.56, W, H);

  return (
    <div className="panel-box">
      <div className="panel-header" style={{ marginBottom: 8 }}>
        <span className="panel-title">All-Sky MOC Footprint Radar (HEALPix Order 10)</span>
        <span
          className="mono"
          style={{
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 2,
            border: `1px solid ${inFootprint ? 'rgba(82,183,136,0.45)' : 'rgba(232,141,58,0.45)'}`,
            background: inFootprint ? 'rgba(82,183,136,0.1)' : 'rgba(232,141,58,0.12)',
            color: inFootprint ? '#52b788' : '#e88d3a'
          }}
        >
          {inFootprint ? '● MOC IN · SPHEREx Primary' : '▲ MOC OUT · unWISE Fallback'}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{
          width: '100%',
          height: 'auto',
          display: 'block',
          background: '#0b0d10',
          border: '1px solid #232832'
        }}
      >
        {/* Outer Aitoff boundary & longitude/latitude graticules */}
        <ellipse cx={W / 2} cy={H / 2} rx={W * 0.44} ry={H * 0.41} fill="#0e1218" stroke="#2d3442" strokeWidth="1.2" />
        <ellipse cx={W / 2} cy={H / 2} rx={W * 0.29} ry={H * 0.41} fill="none" stroke="#1b2029" strokeWidth="1" strokeDasharray="2 3" />
        <ellipse cx={W / 2} cy={H / 2} rx={W * 0.14} ry={H * 0.41} fill="none" stroke="#1b2029" strokeWidth="1" strokeDasharray="2 3" />

        {/* Declination parallels */}
        <line x1={W * 0.06} y1={H / 2} x2={W * 0.94} y2={H / 2} stroke="#1f2530" strokeWidth="1" />
        <line x1={W * 0.12} y1={H * 0.29} x2={W * 0.88} y2={H * 0.29} stroke="#181d26" strokeWidth="1" strokeDasharray="2 3" />
        <line x1={W * 0.12} y1={H * 0.71} x2={W * 0.88} y2={H * 0.71} stroke="#181d26" strokeWidth="1" strokeDasharray="2 3" />
        <line x1={W / 2} y1={H * 0.09} x2={W / 2} y2={H * 0.91} stroke="#1f2530" strokeWidth="1" />

        {/* Galactic Plane exclusion zone (|b| < 6 deg -> unWISE fallback) */}
        <path
          d={`M ${W * 0.09} ${H * 0.62} Q ${W * 0.36} ${H * 0.82}, ${W * 0.56} ${H * 0.46} T ${W * 0.91} ${H * 0.34}`}
          fill="none"
          stroke="rgba(232, 141, 58, 0.18)"
          strokeWidth="16"
          strokeLinecap="round"
        />
        <path
          d={`M ${W * 0.09} ${H * 0.62} Q ${W * 0.36} ${H * 0.82}, ${W * 0.56} ${H * 0.46} T ${W * 0.91} ${H * 0.34}`}
          fill="none"
          stroke="rgba(232, 141, 58, 0.55)"
          strokeWidth="1.2"
          strokeDasharray="4 3"
        />

        {/* SPHEREx Deep Fields at North & South Ecliptic Poles */}
        <g>
          <circle
            cx={nepPos.x}
            cy={nepPos.y}
            r="11"
            fill="rgba(78, 168, 222, 0.12)"
            stroke="#4ea8de"
            strokeWidth="1"
            strokeDasharray="2 2"
          />
          <text
            x={nepPos.x + 14}
            y={nepPos.y + 3}
            fill="#4ea8de"
            fontSize="8.5"
            fontFamily="IBM Plex Mono, monospace"
          >
            NEP Deep
          </text>

          <circle
            cx={sepPos.x}
            cy={sepPos.y}
            r="11"
            fill="rgba(78, 168, 222, 0.12)"
            stroke="#4ea8de"
            strokeWidth="1"
            strokeDasharray="2 2"
          />
          <text
            x={sepPos.x + 14}
            y={sepPos.y + 3}
            fill="#4ea8de"
            fontSize="8.5"
            fontFamily="IBM Plex Mono, monospace"
          >
            SEP Deep
          </text>
        </g>

        {/* Benchmark preset targets plotted on the sky */}
        {BENCHMARK_TARGETS.map((bt) => {
          const p = projectSkyToAitoff(bt.ra, bt.dec, W, H);
          const isCurrent = Math.abs(bt.ra - ra) < 0.2 && Math.abs(bt.dec - dec) < 0.2;
          return (
            <g
              key={bt.id}
              onClick={() => onSelectTarget && onSelectTarget(bt)}
              style={{ cursor: onSelectTarget ? 'pointer' : 'default' }}
            >
              <circle
                cx={p.x}
                cy={p.y}
                r={isCurrent ? 4.5 : 3}
                fill={bt.inSpherexFootprint ? '#656d7a' : '#e88d3a'}
                opacity={isCurrent ? 0 : 0.75}
              />
            </g>
          );
        })}

        {/* Active Target Reticle */}
        <g>
          <circle
            cx={activePos.x}
            cy={activePos.y}
            r="9"
            fill="none"
            stroke={inFootprint ? '#52b788' : '#e88d3a'}
            strokeWidth="1.2"
          />
          <line
            x1={activePos.x - 13}
            y1={activePos.y}
            x2={activePos.x - 5}
            y2={activePos.y}
            stroke={inFootprint ? '#52b788' : '#e88d3a'}
            strokeWidth="1.2"
          />
          <line
            x1={activePos.x + 5}
            y1={activePos.y}
            x2={activePos.x + 13}
            y2={activePos.y}
            stroke={inFootprint ? '#52b788' : '#e88d3a'}
            strokeWidth="1.2"
          />
          <circle
            cx={activePos.x}
            cy={activePos.y}
            r="3.2"
            fill={inFootprint ? '#52b788' : '#e88d3a'}
          />
          <text
            x={activePos.x > W * 0.68 ? activePos.x - 12 : activePos.x + 12}
            y={activePos.y - 6}
            textAnchor={activePos.x > W * 0.68 ? 'end' : 'start'}
            fill="#eceae4"
            stroke="#0b0d10"
            strokeWidth="3"
            paintOrder="stroke"
            fontSize="9.5"
            fontFamily="IBM Plex Mono, monospace"
          >
            {targetName || `${ra.toFixed(1)}°, ${dec.toFixed(1)}°`}
          </text>
        </g>

        {/* Coordinate labels */}
        <text x={W * 0.07} y={H / 2 - 4} fill="#656d7a" fontSize="8.5" fontFamily="IBM Plex Mono, monospace">
          360°
        </text>
        <text x={W / 2 + 4} y={H / 2 - 4} fill="#656d7a" fontSize="8.5" fontFamily="IBM Plex Mono, monospace">
          180°
        </text>
        <text x={W * 0.9} y={H / 2 - 4} fill="#656d7a" fontSize="8.5" fontFamily="IBM Plex Mono, monospace">
          0°
        </text>
      </svg>

      <div
        className="mono"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
          marginTop: 8,
          fontSize: 11,
          color: '#98a0ad'
        }}
      >
        <span>
          Pointing: <strong style={{ color: '#eceae4' }}>RA {ra.toFixed(3)}°, Dec {dec.toFixed(3)}°</strong>
        </span>
        <span>Amber band: Galactic Plane (|b| &lt; 6° unWISE fallback) · Click any dot to jump</span>
      </div>
    </div>
  );
}
