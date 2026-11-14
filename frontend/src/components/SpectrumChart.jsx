import { useRef } from 'react';
import { MOLECULAR_MARKERS } from '../data/catalog';

export default function SpectrumChart({
  bands,
  wiseBands,
  inSpherexFootprint,
  activeWavelength,
  onSelectWavelength,
  showLines,
  measured = false,
  markers = MOLECULAR_MARKERS,
  hoverSelect = false,
  referenceBands = []
}) {
  const svgRef = useRef(null);
  const W = 520;
  const H = 236;
  const pad = { top: 20, right: 28, bottom: 34, left: 46 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const minW = 0.75;
  const maxW = 5.0;

  const safeBands = Array.isArray(bands) ? bands : [];
  const safeWiseBands = Array.isArray(wiseBands) ? wiseBands : [];

  const maxFlux = Math.max(
    ...(measured && safeBands.length ? [] : [1]),
    ...(inSpherexFootprint
      ? safeBands.map((b) => (b && typeof b.flux === 'number' ? b.flux + (b.err || 0) : 1))
      : safeWiseBands.map((w) => (w && typeof w.flux === 'number' ? w.flux * 1.35 : 1)))
  );

  const xOf = (w) => pad.left + ((w - minW) / (maxW - minW)) * plotW;
  const minFlux = measured ? Math.min(0, ...safeBands.map(b => b.flux - (b.err || 0))) : 0;
  const fluxSpan = maxFlux - minFlux || 1;
  const yOf = (f) => pad.top + plotH - ((f - minFlux) / fluxSpan) * plotH;

  const linePath = safeBands
    .map((b, i) => `${i === 0 ? 'M' : 'L'} ${xOf(b.wavelength).toFixed(1)} ${yOf(b.flux).toFixed(1)}`)
    .join(' ');
  const referenceMax = Math.max(1e-12, ...referenceBands.map(b => b.flux));
  const referencePath = referenceBands.map((b,i) => `${i ? 'L' : 'M'} ${xOf(b.wavelength)} ${pad.top+plotH-(b.flux/referenceMax)*plotH}`).join(' ');

  const handlePointer = (e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    const clamped = Math.max(pad.left, Math.min(W - pad.right, relX));
    const w = minW + ((clamped - pad.left) / plotW) * (maxW - minW);
    onSelectWavelength(Number(w.toFixed(2)));
  };

  const activePoint =
    safeBands.length > 0
      ? safeBands.reduce(
          (best, cur) =>
            Math.abs(cur.wavelength - activeWavelength) < Math.abs(best.wavelength - activeWavelength)
              ? cur
              : best,
          safeBands[0]
        )
      : null;

  return (
    <div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="slider"
        tabIndex={0}
        aria-label={measured ? "Measured SPHEREx samples wavelength" : "Simulated spectrum wavelength"}
        aria-valuemin={minW}
        aria-valuemax={maxW}
        aria-valuenow={activeWavelength}
        aria-valuetext={`${activeWavelength.toFixed(2)} micrometers; ${measured ? "measured SPHEREx samples" : "simulated spectrum"}`}
        onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? minW : event.key === 'End' ? maxW : activeWavelength + (event.key === 'ArrowRight' ? .02 : -.02);
          onSelectWavelength(Number(Math.min(maxW, Math.max(minW, next)).toFixed(2)));
        }}
        onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); handlePointer(event); }}
        onPointerMove={(e) => {
          if (hoverSelect || e.buttons === 1) handlePointer(e);
        }}
        style={{
          width: '100%',
          height: 'auto',
          display: 'block',
          cursor: 'crosshair',
          background: '#060b14',
          border: '1px solid #1c2b3d'
        }}
      >
        {/* Horizontal grid lines */}
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

        {/* Wavelength ticks */}
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
              fill="#8698ad"
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
          fill="#8698ad"
          fontSize="10"
          fontFamily="IBM Plex Mono, monospace"
        >
          {measured ? maxFlux.toPrecision(3) : maxFlux.toFixed(1)}
        </text>
        <text
          x={pad.left - 8}
          y={H - pad.bottom}
          textAnchor="end"
          fill="#8698ad"
          fontSize="10"
          fontFamily="IBM Plex Mono, monospace"
        >
          {minFlux.toPrecision(3)}
        </text>

        {/* Molecular diagnostic markers with staggered non-overlapping badges */}
        {showLines &&
          markers.map((m, idx) => {
            const mx = xOf(m.wavelength);
            const alignLeftOfLine = idx % 2 === 0;
            const rowY = idx % 2 === 0 ? pad.top + 13 : pad.top + 28;
            const textX = alignLeftOfLine ? mx - 5 : mx + 5;
            const anchor = alignLeftOfLine ? 'end' : 'start';
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
                  opacity="0.75"
                />
                <text
                  x={textX}
                  y={rowY}
                  textAnchor={anchor}
                  fill={m.color}
                  stroke="#060b14"
                  strokeWidth="3"
                  paintOrder="stroke"
                  fontSize="9.5"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {m.label}
                </text>
              </g>
            );
          })}

        {measured && referencePath && <path data-reference-continuum d={referencePath} fill="none" stroke="#b9a6cf" strokeWidth="1.5" strokeDasharray="5 5" opacity=".8"><title>Illustrative continuum, independently normalized from zero to one. Not fitted to measurements.</title></path>}
        {/* Spectrum trace or WISE broad-band fallback */}
        {measured ? safeBands.map((b, index) => <g key={index}>
          <line data-measurement-error x1={xOf(b.wavelength)} x2={xOf(b.wavelength)} y1={yOf(b.flux - (b.err || 0))} y2={yOf(b.flux + (b.err || 0))} stroke="#98cbd7" strokeWidth="1.5" />
          {[-1,1].map(sign => <line key={sign} x1={xOf(b.wavelength)-3} x2={xOf(b.wavelength)+3} y1={yOf(b.flux+sign*(b.err||0))} y2={yOf(b.flux+sign*(b.err||0))} stroke="#98cbd7" />)}
          <line x1={xOf(Math.max(minW, b.wavelength - (b.bandwidth || 0) / 2))} x2={xOf(Math.min(maxW, b.wavelength + (b.bandwidth || 0) / 2))} y1={yOf(b.flux)} y2={yOf(b.flux)} stroke="#98cbd7" />
          <circle data-measured-channel cx={xOf(b.wavelength)} cy={yOf(b.flux)} r="4" fill="#98cbd7"><title>{`${b.wavelength.toFixed(4)} µm: ${b.flux.toPrecision(4)} ± ${(b.err||0).toPrecision(3)} MJy/sr`}</title></circle>
        </g>) : inSpherexFootprint ? (
          <path d={linePath} fill="none" stroke="#f0f2f5" strokeWidth="1.6" />
        ) : (
          safeWiseBands.map((wb) => {
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
                  stroke="#d9b580"
                  strokeWidth="2.5"
                />
                <line x1={xLeft} y1={cy - 4} x2={xLeft} y2={cy + 4} stroke="#d9b580" strokeWidth="1.5" />
                <line x1={xRight} y1={cy - 4} x2={xRight} y2={cy + 4} stroke="#d9b580" strokeWidth="1.5" />
                <circle cx={cx} cy={cy} r="4.5" fill="#d9b580" />
                <text
                  x={cx}
                  y={cy - 10}
                  textAnchor="middle"
                  fill="#d9b580"
                  fontSize="10"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {wb.name}
                </text>
              </g>
            );
          })
        )}

        {measured && <text x={pad.left} y="12" fill="#98cbd7" fontSize="10">Surface brightness (MJy/sr) · ±1σ</text>}
        {measured && referencePath && <g fill="#b9a6cf" fontSize="9" fontFamily="monospace"><text x={W-5} y={pad.top+8} textAnchor="end">1</text><text x={W-5} y={H-pad.bottom} textAnchor="end">0</text><title>Right scale: reference continuum normalized to peak one</title></g>}
        {/* Active wavelength scrubber */}
        <line
          data-wavelength-cursor
          x1={xOf(activeWavelength)}
          y1={pad.top}
          x2={xOf(activeWavelength)}
          y2={H - pad.bottom}
          stroke="#d9b580"
          strokeWidth="2"
        />
        <path data-wavelength-wedge d={`M ${xOf(activeWavelength)-5} ${pad.top} L ${xOf(activeWavelength)+5} ${pad.top} L ${xOf(activeWavelength)} ${pad.top+7} Z`} fill="#d9b580" />
        {inSpherexFootprint && activePoint && (
          <circle
            cx={xOf(activePoint.wavelength)}
            cy={yOf(activePoint.flux)}
            r="3.5"
            fill="#d9b580"
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
          color: '#a7b5c6'
        }}
      >
        <span>
          Wavelength: <strong style={{ color: '#d9b580' }}>{activeWavelength.toFixed(2)} µm</strong>
          {inSpherexFootprint && activePoint ? ` · Sample #${activePoint.bandId} (${activePoint.flux} ${measured ? "MJy/sr" : "arbitrary units"})` : ''}
        </span>
        <span>Hover, drag, or use arrow keys</span>
      </div>
    </div>
  );
}
