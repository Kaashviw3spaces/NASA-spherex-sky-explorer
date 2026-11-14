import { useEffect, useRef } from 'react';
import { observationDate } from '../utils/observationDate';

function Thumbnail({ frame, levels }) {
  const canvas = useRef(null);
  useEffect(() => {
    if (!frame.buffer || !levels) return;
    const context = canvas.current.getContext('2d');
    if (!context) return;
    const image = context.createImageData(64, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const value = frame.buffer[Math.round(y*511/63)*512+Math.round(x*511/63)];
      const signal = Math.max(0, (value-levels.zmin)/(levels.zmax-levels.zmin || 1));
      const gray = Math.round(255*Math.min(1, Math.asinh(signal*8)/Math.asinh(8)));
      image.data.set(Number.isFinite(value) ? [gray, gray, gray, 255] : [27, 35, 49, 255], (y*64+x)*4);
    }
    context.putImageData(image, 0, 0);
  }, [frame, levels]);
  return <canvas ref={canvas} width="64" height="64" aria-hidden="true" />;
}

export default function ExposureStrip({ frames, levels, activeIndex, onSelect }) {
  if (!frames.length) return null;
  return <div className="exposure-strip" role="group" aria-label="Dated exposure previews">
    {frames.map((frame, index) => <button type="button" key={frame.meta.sourceUrl || frame.cache_key}
      aria-pressed={index === activeIndex} onClick={() => onSelect(index)}>
      <Thumbnail frame={frame} levels={levels} />
      <span><strong>{observationDate(frame.meta.epoch)}</strong><small>{frame.meta.spectralRange || frame.meta.release}</small></span>
    </button>)}
  </div>;
}
