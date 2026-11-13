import { useRef, useEffect, useState } from 'react';
import { BENCHMARK_TARGETS } from '../data/catalog';

// Inverse Aitoff projection: (x, y) normalized [-2, 2]x[-1, 1] -> (l, b) in radians
function inverseAitoff(x, y) {
  // x in [-2, 2], y in [-1, 1]
  // Standard approximation / Newton solver for Aitoff
  // Aitoff equations:
  // sinc(alpha) = sin(alpha) / alpha where cos(alpha) = cos(b)*cos(l/2)
  // x = 2 * cos(b) * sin(l/2) / sinc(alpha)
  // y = sin(b) / sinc(alpha)
  let l = (x / 2) * Math.PI;
  let b = y * (Math.PI / 2);

  for (let iter = 0; iter < 6; iter++) {
    const cosB = Math.cos(b);
    const sinB = Math.sin(b);
    const cosHalfL = Math.cos(l / 2);
    const sinHalfL = Math.sin(l / 2);

    const cosAlpha = Math.max(-1, Math.min(1, cosB * cosHalfL));
    const alpha = Math.acos(cosAlpha);
    const sinc = alpha === 0 ? 1 : Math.sin(alpha) / alpha;

    const fx = (2 * cosB * sinHalfL) / sinc - x;
    const fy = sinB / sinc - y;

    if (Math.abs(fx) < 1e-4 && Math.abs(fy) < 1e-4) break;

    // Approximate Jacobian steps
    l -= fx * 0.5;
    b -= fy * 0.5;
  }

  // Constrain
  b = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, b));
  while (l > Math.PI) l -= 2 * Math.PI;
  while (l < -Math.PI) l += 2 * Math.PI;

  return { l, b };
}

// Convert Galactic (l, b) to Equatorial (RA, Dec) in degrees
function galacticToEquatorial(lDeg, bDeg) {
  const d2r = Math.PI / 180;
  const r2d = 180 / Math.PI;

  const l = lDeg * d2r;
  const b = bDeg * d2r;

  // North Galactic Pole (J2000): RA_G = 192.85948°, Dec_G = 27.12825°, l_omega = 32.93192°
  const alphaG = 192.85948 * d2r;
  const deltaG = 27.12825 * d2r;
  const lOmega = 32.93192 * d2r;

  const sinDec = Math.sin(deltaG) * Math.sin(b) + Math.cos(deltaG) * Math.cos(b) * Math.cos(l - lOmega);
  const dec = Math.asin(Math.max(-1, Math.min(1, sinDec)));

  const y = Math.cos(b) * Math.sin(l - lOmega);
  const x = Math.cos(deltaG) * Math.sin(b) - Math.sin(deltaG) * Math.cos(b) * Math.cos(l - lOmega);
  let ra = Math.atan2(y, x) + alphaG;
  while (ra < 0) ra += 2 * Math.PI;
  while (ra >= 2 * Math.PI) ra -= 2 * Math.PI;

  return {
    ra: Number((ra * r2d).toFixed(4)),
    dec: Number((dec * r2d).toFixed(4))
  };
}

export default function MocRadar({
  currentRa,
  currentDec,
  onSelectCoordinate,
  ra,
  dec,
  onSelectTarget,
  targetName
}) {
  const effectiveRa = typeof currentRa === 'number' ? currentRa : (typeof ra === 'number' ? ra : undefined);
  const effectiveDec = typeof currentDec === 'number' ? currentDec : (typeof dec === 'number' ? dec : undefined);
  const handleSelect = onSelectCoordinate || onSelectTarget;

  const canvasRef = useRef(null);
  const [hoveredCoord, setHoveredCoord] = useState(null);

  const W = 480;
  const H = 220;
  const cx = W / 2;
  const cy = H / 2;
  const rx = 210;
  const ry = 100;

  // Convert (RA, Dec) -> Galactic (l, b) in degrees
  const getGalactic = (raDeg, decDeg) => {
    const d2r = Math.PI / 180;
    const r2d = 180 / Math.PI;
    const alphaG = 192.85948 * d2r;
    const deltaG = 27.12825 * d2r;
    const lOmega = 32.93192 * d2r;

    const ra = raDeg * d2r;
    const dec = decDeg * d2r;

    const sinB = Math.sin(deltaG) * Math.sin(dec) + Math.cos(deltaG) * Math.cos(dec) * Math.cos(ra - alphaG);
    const b = Math.asin(Math.max(-1, Math.min(1, sinB)));

    const y = Math.cos(dec) * Math.sin(ra - alphaG);
    const x = Math.cos(deltaG) * Math.sin(dec) - Math.sin(deltaG) * Math.cos(dec) * Math.cos(ra - alphaG);
    let l = Math.atan2(y, x) + lOmega;
    while (l < 0) l += 2 * Math.PI;
    while (l >= 2 * Math.PI) l -= 2 * Math.PI;

    return { l: l * r2d, b: b * r2d };
  };

  // Aitoff forward projection
  const projectAitoff = (lDeg, bDeg) => {
    const d2r = Math.PI / 180;
    let l = (lDeg > 180 ? lDeg - 360 : lDeg) * d2r;
    let b = bDeg * d2r;

    const cosB = Math.cos(b);
    const cosHalfL = Math.cos(l / 2);
    const alpha = Math.acos(Math.max(-1, Math.min(1, cosB * cosHalfL)));
    const sinc = alpha === 0 ? 1 : Math.sin(alpha) / alpha;

    const x = (2 * cosB * Math.sin(l / 2)) / sinc;
    const y = Math.sin(b) / sinc;

    return {
      px: cx - (x / 2) * rx,
      py: cy - y * ry
    };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, W, H);

    // 1. Boundary Ellipse
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Fill background inside ellipse
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = '#05070a';
    ctx.fill();

    // 2. SPHEREx Primary MOC coverage area (green glow at high galactic latitudes)
    ctx.fillStyle = 'rgba(46, 160, 67, 0.12)';
    ctx.fillRect(0, 0, W, H);

    // 3. Galactic Plane Avoidance Zone (|b| < 6° - amber unWISE fallback)
    ctx.fillStyle = 'rgba(232, 141, 58, 0.2)';
    ctx.beginPath();
    const planePointsTop = [];
    const planePointsBottom = [];
    for (let l = -180; l <= 180; l += 5) {
      const top = projectAitoff(l, 6);
      const bot = projectAitoff(l, -6);
      planePointsTop.push(top);
      planePointsBottom.unshift(bot);
    }
    if (planePointsTop.length > 0) {
      ctx.moveTo(planePointsTop[0].px, planePointsTop[0].py);
      for (const pt of planePointsTop) ctx.lineTo(pt.px, pt.py);
      for (const pt of planePointsBottom) ctx.lineTo(pt.px, pt.py);
      ctx.closePath();
      ctx.fill();
    }

    // Grid lines
    ctx.strokeStyle = 'rgba(48, 54, 61, 0.4)';
    ctx.lineWidth = 0.8;
    // Parallels b = ±30, ±60
    for (const b of [-60, -30, 0, 30, 60]) {
      ctx.beginPath();
      for (let l = -180; l <= 180; l += 10) {
        const pt = projectAitoff(l, b);
        if (l === -180) ctx.moveTo(pt.px, pt.py);
        else ctx.lineTo(pt.px, pt.py);
      }
      ctx.stroke();
    }
    // Meridians
    for (const l of [-120, -60, 0, 60, 120]) {
      ctx.beginPath();
      for (let b = -90; b <= 90; b += 5) {
        const pt = projectAitoff(l, b);
        if (b === -90) ctx.moveTo(pt.px, pt.py);
        else ctx.lineTo(pt.px, pt.py);
      }
      ctx.stroke();
    }

    // Benchmark targets dots
    BENCHMARK_TARGETS.forEach((bm) => {
      const g = getGalactic(bm.ra, bm.dec);
      const pt = projectAitoff(g.l, g.b);
      ctx.fillStyle = '#4ea8de';
      ctx.beginPath();
      ctx.arc(pt.px, pt.py, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Current Target Crosshair
    if (typeof effectiveRa === 'number' && typeof effectiveDec === 'number') {
      const g = getGalactic(effectiveRa, effectiveDec);
      const pt = projectAitoff(g.l, g.b);

      ctx.strokeStyle = '#e88d3a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(pt.px, pt.py, 6, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(pt.px - 9, pt.py);
      ctx.lineTo(pt.px + 9, pt.py);
      ctx.moveTo(pt.px, pt.py - 9);
      ctx.lineTo(pt.px, pt.py + 9);
      ctx.stroke();
    }

    // Hover Crosshair
    if (hoveredCoord) {
      const pt = projectAitoff(hoveredCoord.lDeg, hoveredCoord.bDeg);
      ctx.strokeStyle = '#f0f6fc';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.arc(pt.px, pt.py, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }, [effectiveRa, effectiveDec, hoveredCoord]);

  const handlePointerMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * W;
    const mouseY = ((e.clientY - rect.top) / rect.height) * H;

    // Check if within ellipse: (dx/rx)^2 + (dy/ry)^2 <= 1
    const dx = mouseX - cx;
    const dy = mouseY - cy;
    const distSq = (dx / rx) ** 2 + (dy / ry) ** 2;

    if (distSq > 1.0) {
      setHoveredCoord(null);
      return;
    }

    // Normalized Aitoff coords: x in [-2, 2], y in [-1, 1]
    const normX = -(dx / rx) * 2;
    const normY = -(dy / ry);

    const { l, b } = inverseAitoff(normX, normY);
    const lDeg = ((l * 180) / Math.PI + 360) % 360;
    const bDeg = (b * 180) / Math.PI;

    const eq = galacticToEquatorial(lDeg, bDeg);
    const inMoc = Math.abs(bDeg) >= 6;

    setHoveredCoord({
      lDeg,
      bDeg,
      ra: eq.ra,
      dec: eq.dec,
      inMoc
    });
  };

  const handlePointerClick = () => {
    if (!hoveredCoord || !handleSelect) return;
    handleSelect({
      ra: hoveredCoord.ra,
      dec: hoveredCoord.dec,
      name: `Field (${hoveredCoord.ra.toFixed(2)}°, ${hoveredCoord.dec.toFixed(2)}°)`,
      inMoc: hoveredCoord.inMoc,
      inSpherexFootprint: hoveredCoord.inMoc,
      fovArcmin: 5.0,
      survey: hoveredCoord.inMoc ? 'SPHEREx 102-Band' : 'unWISE Fallback',
      epochs: hoveredCoord.inMoc
        ? ['2025-05', '2025-11', '2026-05', '2026-10']
        : ['2014-03', '2019-09', '2023-09'],
      motionDxPerEpoch: 0.0,
      motionDyPerEpoch: 0.0,
      variabilityAmp: 0.0,
      dqFlag: 'NOMINAL'
    });
  };

  const currentG =
    typeof effectiveRa === 'number' && typeof effectiveDec === 'number' ? getGalactic(effectiveRa, effectiveDec) : null;
  const isCurrentInMoc = currentG ? Math.abs(currentG.b) >= 6 : true;

  return (
    <div
      style={{
        background: '#161b22',
        border: '1px solid #30363d',
        borderRadius: 8,
        padding: '16px 20px',
        marginTop: 20
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 12
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontFamily: 'IBM Plex Mono, monospace',
              color: '#8b949e',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}
          >
            All-Sky Footprint & MOC Radar
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#f0f6fc', marginTop: 2 }}>
            Aitoff Galactic Projection · Click any point on the globe to explore
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2ea043' }} />
            SPHEREx Primary (|b| ≥ 6°)
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#e88d3a' }} />
            unWISE Fallback (|b| &lt; 6°)
          </span>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          background: '#0d1117',
          padding: 12,
          borderRadius: 6,
          border: '1px solid #21262d',
          position: 'relative',
          cursor: hoveredCoord ? 'crosshair' : 'default'
        }}
      >
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onMouseMove={handlePointerMove}
          onMouseLeave={() => setHoveredCoord(null)}
          onClick={handlePointerClick}
          style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
        />

        {/* Live Hover Reticle Info */}
        <div
          style={{
            marginTop: 8,
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 11,
            color: '#8b949e',
            display: 'flex',
            justifyContent: 'space-between',
            width: '100%',
            maxWidth: W
          }}
        >
          <span>
            {hoveredCoord ? (
              <>
                Cursor:{' '}
                <strong style={{ color: '#fff' }}>
                  RA {hoveredCoord.ra.toFixed(2)}°, Dec {hoveredCoord.dec.toFixed(2)}°
                </strong>{' '}
                · (l {hoveredCoord.lDeg.toFixed(1)}°, b {hoveredCoord.bDeg.toFixed(1)}°) ·{' '}
                <span style={{ color: hoveredCoord.inMoc ? '#2ea043' : '#e88d3a', fontWeight: 600 }}>
                  {hoveredCoord.inMoc ? '● MOC IN' : '▲ unWISE FALLBACK'}
                </span>
              </>
            ) : (
              'Hover over celestial map to preview coordinates'
            )}
          </span>

          <span>
            Target:{' '}
            <strong style={{ color: isCurrentInMoc ? '#2ea043' : '#e88d3a' }}>
              {isCurrentInMoc ? 'SPHEREx Active' : 'unWISE Fallback'}
            </strong>
          </span>
        </div>
      </div>
    </div>
  );
}
