import { observationDate } from '../utils/observationDate';
import { ChevronDown, Info } from 'lucide-react';
import { displayedFrames, sourceLink } from '../utils/observationContext';

export default function DataNotice({ frames = [], activeIndex = 0, mode = 'static', difference = false, target, colormap, stretch, status, error, onRetry, spherex = false, scienceOnly = false, spectrumKind = 'simulated' }) {
  const selected = displayedFrames(frames, activeIndex, mode, difference);
  const observed = selected.filter(frame => frame.meta?.dataKind === 'observed').length;
  const source = !selected.length ? (spherex ? 'No observation loaded' : 'Simulated preview') : observed === selected.length ? 'Observed imagery' : selected.every(frame => frame.meta?.dataKind === 'simulated') ? 'Simulated imagery' : 'Mixed or unverified sources';
  return <aside className="data-notice" aria-label={scienceOnly ? "SPHEREx science observations at requested coordinates" : "Data for the displayed image"}>
    <div className="data-status-line">
      <span className={`source-indicator ${observed === selected.length && observed ? 'observed' : ''}`}><span className="status-dot" />{scienceOnly && observed ? "SPHEREx archive records" : source}</span>
      <span className="spectrum-disclosure">Spectrum: {spectrumKind === "measured" ? "SPHEREx samples" : "simulation"}</span>
      <span className="request-status" role="status" aria-live="polite">{status === 'loading' ? (scienceOnly ? 'Loading dates…' : 'Loading images…') : status === 'ready' ? (scienceOnly ? 'Dates ready' : 'Images ready') : ''}</span>
      <details className="source-details"><summary><Info size={13} /> {scienceOnly ? "SPHEREx dates & data" : "About this data"} <ChevronDown size={12} /></summary><div className="source-details-body">
        <h3>{target?.name || 'Current view'}{selected.length > 1 ? ' · comparison inputs' : ''}</h3>
        <p>{difference || mode === 'diff' ? 'A processed difference of the first and last available frames; not a validated detection.' : selected.length > 1 ? 'First and last available frames, shown together.' : scienceOnly ? 'SPHEREx observation metadata at the requested coordinates; these dates do not describe the separate context image.' : 'Metadata for the currently displayed frame.'}</p>
        {target && <p className="mono">Center requested: {target.ra.toFixed(5)}°, {target.dec.toFixed(5)}° · field of view {target.fovArcmin} arcmin</p>}
        {!selected.length ? <p>{spherex ? "No SPHEREx observation loaded. No synthetic image is substituted." : "No archive image loaded. This preview is generated locally: arbitrary signal, no observation date or telescope measurement."}</p> : selected.map((frame, index) => {
          const meta = frame.meta || {};
          const url = sourceLink(meta.sourceUrl);
          return <section className="image-provenance" key={frame.cache_key || index}><h4>{selected.length > 1 ? `Input ${index + 1} · ` : ''}{meta.provenance || 'Source unknown'}</h4><dl className="metadata-grid">
            <dt>Data type</dt><dd>{meta.dataKind || 'Unverified'}</dd>
            <dt>Archive release</dt><dd>{meta.release || 'Unknown'}</dd>
            <dt>Observation date</dt><dd>{meta.epoch && meta.epoch !== 'unknown' ? observationDate(meta.epoch) : 'Not supplied'}</dd>
            <dt>Band / wavelength</dt><dd>{meta.spectralRange ? `${meta.spectralRange} (detector range; varies across image)` : meta.dataKind === 'observed' && [1, 2].includes(meta.bandIndex) ? `WISE W${meta.bandIndex} · ${meta.wavelengthUm} µm` : meta.dataKind === 'simulated' ? 'Illustrative signal; no observed band' : 'Unknown'}</dd>
            <dt>Pixel units</dt><dd>{meta.bunit || 'Unknown'}</dd>
            <dt>Raster</dt><dd>{meta.width && meta.height ? `${meta.gridWidth || meta.width} × ${meta.gridHeight || meta.height} ${meta.gridWidth ? "sky-grid pixels; enlarged to 512 × 512 for display" : "pixels"}` : 'Unknown'}</dd>
            <dt>Sky reference</dt><dd>{meta.crval || 'Unknown'}</dd>
            <dt>Uncertainty</dt><dd>Not supplied by this app</dd>
          </dl>{url && <a className="text-link" href={url} target="_blank" rel="noreferrer">Open original archive request ↗</a>}</section>;
        })}
        {!scienceOnly && <p>Display: {colormap || 'color map not supplied'} · {stretch || 'stretch not supplied'}. Assigned display colors are not naked-eye colors. Brightness stretch changes appearance, not source measurements.</p>}
        <p>{scienceOnly ? "SPHEREx dates describe separate exposures at the requested coordinates. Native-pixel measurements load independently in the graph; these dates do not describe the context image." : spherex ? "Real SPHEREx DR1 spectral images, resampled to a common sky grid. Dates refer to SPHEREx exposures, not the separate context image. The graph requests native-pixel SPHEREx samples independently." : "Archive rasters are resampled and quantized display products. Release names are not exact observing dates. This legacy viewer uses unWISE; the separate spectrum is simulated."}</p>
      </div></details>
    </div>
    {error && <div className="request-error" role="alert"><p>{error} {frames.length ? 'Showing available images.' : spherex ? 'No synthetic replacement is shown.' : 'Showing a simulated preview.'}</p><button type="button" className="btn-compact" onClick={onRetry}>Retry images</button></div>}
  </aside>;
}
