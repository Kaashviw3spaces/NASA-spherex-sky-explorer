import { useRef } from 'react';
import { MOLECULAR_MARKERS } from '../data/catalog';

export default function SpectrumChart({
  bands,
  wiseBands,
  inSpherexFootprint,
  activeWavelength,
  onSelectWavelength,
  showLines
}) {
  const svgRef = useRef(null);
  const W = 520;
  const H = 230;
  const pad = { top: 18, right: 16, bottom: 32, left: 46 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const minW = 0.75;
  const maxW = 5.0;

  const maxFlux = Math.max(
    1,
    ...(inSpherexFootprint ? bands.map((b) => b.flux + b.err) : wiseBands.map((w) => w.flux * 1.35))
  );

  const xOf = (w) => pad.left + ((w - minW) / (maxW - minW)) * plotW;
  const yOf = (f) => pad.top + plotH - (f / maxFlux) * plotH;

  const linePath = bands
    .map((b, i) => `${i === 0 ? 'M' : 'L'} ${xOf(b.wavelength).toFixed(1)} ${yOf(b.flux).toFixed(1)}`)
    .join(' ');

  const handlePointer = (e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    const clamped = Math.max(pad.left, Math.min(W - pad.right, relX));
    const w = minW + ((clamped - pad.left) / plotW) * (maxW - minW);
    onSelectWavelength(Number(w.toFixed(2)));
  };

  const activePoint =
    bands.reduce((best, cur) =>
      Math.abs(cur.wavelength - activeWavelength) < Math.abs(best.wavelength - activeWavelength)
        ? cur
        : best
    ) || bands[0];

  return (
    <div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        onClick={handlePointer}
        onMouseMove={(e) => {
          if (e.buttons === 1) handlePointer(e);
        }}
        style={{
          width: '100%',
          height: 'auto',
          display: 'block',
          cursor: 'crosshair',
          background: '#0b0d10',
          border: '1px solid #232832'
        }}
      >
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((frac) => {
          const y = pad.top + plotH * frac;
          return (
            <line
              key={frac}
              x1={pad.left}
              y1={y}
              x2={W - pad.right}
              y2={y}
              stroke="#1b2029"
              strokeWidth="1"
            />
          );
        })}

        {[1.0, 2.0, 3.0, 4.0, 5.0].map((wTick) => (
          <g key={wTick}>
            <line
              x1={xOf(wTick)}
              y1={pad.top}
              x2={xOf(wTick)}
              y2={H - pad.bottom}
              stroke="#1b2029"
              strokeWidth="1"
            />
            <text
              x={xOf(wTick)}
              y={H - 12}
              textAnchor="middle"
              fill="#656d7a"
              fontSize="10"
              fontFamily="IBM Plex Mono, monospace"
            >
              {wTick.toFixed(1)} µm
            </text>
          </g>
        ))}

        {/* Y axis labels */}
        <text
          x={pad.left - 8}
          y={pad.top + 8}
          textAnchor="end"
          fill="#656d7a"
          fontSize="10"
          fontFamily="IBM Plex Mono, monospace"
        >
          {maxFlux.toFixed(1)}
        </text>
        <text
          x={pad.left - 8}
          y={H - pad.bottom}
          textAnchor="end"
          fill="#656d7a"
          fontSize="10"
          fontFamily="IBM Plex Mono, monospace"
        >
          0.0
        </text>

        {/* Molecular diagnostic markers */}
        {showLines &&
          MOLECULAR_MARKERS.map((m) => {
            const mx = xOf(m.wavelength);
            return (
              <g key={m.id}>
                <line
                  x1={mx}
                  y1={pad.top}
                  x2={mx}
                  y2={H - pad.bottom}
                  stroke={m.color}
                  strokeWidth="1"
                  strokeDasharray="3 3"
                  opacity="0.7"
                />
                <text
                  x={mx + 3}
                  y={pad.top + 10}
                  fill={m.color}
                  fontSize="9.5"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {m.label}
                </text>
              </g>
            );
          })}

        {/* Spectrum trace or WISE broad-band fallback */}
        {inSpherexFootprint ? (
          <path d={linePath} fill="none" stroke="#eceae4" strokeWidth="1.6" />
        ) : (
          wiseBands.map((wb) => {
            const cx = xOf(wb.wavelength);
            const cy = yOf(wb.flux);
            const xLeft = xOf(wb.wavelength - wb.halfWidth);
            const xRight = xOf(wb.wavelength + wb.halfWidth);
            return (
              <g key={wb.name}>
                <line
                  x1={xLeft}
                  y1={cy}
                  x2={xRight}
                  y2={cy}
                  stroke="#e88d3a"
                  strokeWidth="2.5"
                />
                <line x1={xLeft} y1={cy - 4} x2={xLeft} y2={cy + 4} stroke="#e88d3a" strokeWidth="1.5" />
                <line x1={xRight} y1={cy - 4} x2={xRight} y2={cy + 4} stroke="#e88d3a" strokeWidth="1.5" />
                <circle cx={cx} cy={cy} r="4.5" fill="#e88d3a" />
                <text
                  x={cx}
                  y={cy - 10}
                  textAnchor="middle"
                  fill="#e88d3a"
                  fontSize="10"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {wb.name}
                </text>
              </g>
            );
          })
        )}

        {/* Active wavelength scrubber */}
        <line
          x1={xOf(activeWavelength)}
          y1={pad.top}
          x2={xOf(activeWavelength)}
          y2={H - pad.bottom}
          stroke="#e88d3a"
          strokeWidth="1.2"
        />
        {inSpherexFootprint && activePoint && (
          <circle
            cx={xOf(activePoint.wavelength)}
            cy={yOf(activePoint.flux)}
            r="3.5"
            fill="#e88d3a"
          />
        )}
      </svg>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 8,
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 11,
          color: '#98a0ad'
        }}
      >
        <span>
          Scrubber: <strong style={{ color: '#e88d3a' }}>{activeWavelength.toFixed(2)} µm</strong>
          {inSpherexFootprint && activePoint ? ` · Band #${activePoint.bandId} (${activePoint.flux} mJy)` : ''}
        </span>
        <span>Click or drag across plot to scrub bandpass</span>
      </div>
    </div>
  );
}
