import { useEffect, useRef, useState } from 'react';

export default function SpherexComparison({ first, second, firstRecord, secondRecord }) {
  const canvas = useRef(null);
  const [mode, setMode] = useState('side'), [phase, setPhase] = useState(0);
  useEffect(() => {
    setPhase(0);
    if (mode !== 'blink' || !second || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setPhase(p => 1 - p), 1000);
    return () => clearInterval(timer);
  }, [mode, second]);
  useEffect(() => {
    if (!first || !canvas.current) return;
    const node = canvas.current, context = node.getContext('2d'); if (!context) return;
    const both = second && mode === 'side';
    node.width = first.width * (both ? 2 : 1); node.height = first.height;
    const values = [first, second].filter(Boolean).flatMap(im => im.pixels.flat()).filter(v => v !== null && Number.isFinite(v)).sort((a, b) => a - b);
    const low = values[Math.floor(values.length * .02)] ?? 0, high = values[Math.floor(values.length * .98)] ?? 1;
    const draw = (image, offset) => {
      const pixels = context.createImageData(image.width, image.height);
      const w = image.width, h = image.height;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let val = image.pixels[y]?.[x];
          if (val === null || !Number.isFinite(val)) {
            let nSum = 0, nCount = 0;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dy === 0 && dx === 0) continue;
                const nv = image.pixels[y + dy]?.[x + dx];
                if (nv !== null && nv !== undefined && Number.isFinite(nv)) {
                  nSum += nv;
                  nCount++;
                }
              }
            }
            if (nCount >= 3) {
              val = nSum / nCount;
            }
          }
          const gray = (val === null || !Number.isFinite(val)) ? null : Math.round(255 * Math.asinh(10 * Math.max(0, Math.min(1, (val - low) / (high - low || 1)))) / Math.asinh(10));
          const idx = (y * w + x) * 4;
          pixels.data.set(gray === null ? [27, 35, 49, 255] : [gray, gray, gray, 255], idx);
        }
      }
      context.putImageData(pixels, offset, 0);
    };
    draw(phase && second && mode === 'blink' ? second : first, 0);
    if (both) draw(second, first.width);
  }, [first, second, phase, mode]);
  return <section><div className="btn-row" role="group" aria-label="Comparison display"><button className="btn-compact" aria-pressed={mode === 'side'} onClick={() => setMode('side')}>Side by side</button><button className="btn-compact" disabled={!second} aria-pressed={mode === 'blink'} onClick={() => setMode('blink')}>Blink · 1 second</button>{mode === 'blink' && <button className="btn-compact" onClick={() => { setMode('manual'); setPhase(0); }}>Stop animation</button>}</div><figure className="spherex-observation"><figcaption><strong>SPHEREx DR1 · OBSERVED</strong><span>A: {firstRecord.date} UTC</span>{secondRecord && <span>B: {secondRecord.date} UTC</span>}{mode === 'blink' && <span role="status">Showing {phase ? 'B' : 'A'}</span>}</figcaption><canvas ref={canvas} style={{ width: '100%', imageRendering: 'pixelated' }} role="img" aria-label="Real SPHEREx observations on a shared sky grid; A left, B right in side-by-side mode" /></figure><p className="quiet-note">Shared grayscale/asinh stretch. Blue-gray pixels have no valid coverage. Grid alignment uses archive WCS, not fitted star registration. Different local wavelengths, PSFs, flags, and noise can mimic changes; this is visual inspection, not a detection test.</p></section>;
}
