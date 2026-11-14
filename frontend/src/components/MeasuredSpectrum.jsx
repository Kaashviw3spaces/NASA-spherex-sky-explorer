import { useEffect, useState } from 'react';
import SpectrumChart from './SpectrumChart';
import { MOLECULAR_MARKERS } from '../data/catalog';
import { observationDate } from '../utils/observationDate';
import { fetchSpectralSamples } from '../api/spectralSamples';

export default function MeasuredSpectrum({ ra, dec, onMeasureCursor }) {
  const key = JSON.stringify([ra, dec]);
  const [state, setState] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [wavelength, setWavelength] = useState(3.05);
  const [showMarkers, setShowMarkers] = useState(false);
  const current = state?.key === key ? state : { status: 'loading' };
  const result = current.result;
  const samples = result?.samples || [];
  const selected = samples.length ? samples.reduce((best, sample) => Math.abs(sample.wavelength - wavelength) < Math.abs(best.wavelength - wavelength) ? sample : best) : null;

  useEffect(() => {
    const controller = new AbortController();
    setState({ key, status: 'loading' });
    const deadline = setTimeout(() => controller.abort(new Error('Archive request timed out. Please retry.')), 150000);
    fetchSpectralSamples(ra, dec, controller.signal, attempt > 0)
      .then(result => { if (!controller.signal.aborted) setState({ key, status: 'ready', result }); })
      .catch(error => { if (error.name !== 'AbortError') setState({ key, status: 'error', error: error.message }); })
      .finally(() => clearTimeout(deadline));
    return () => { clearTimeout(deadline); controller.abort(); };
  }, [key, attempt]);

  const download = () => {
    const columns = ['wavelength', 'bandwidth', 'flux', 'sigma', 'unit', 'date', 'source', 'flags'];
    const rows = [['wavelength_um', 'bandwidth_um', 'surface_brightness', 'sigma_1', 'unit', 'date_utc', 'source_url', 'flags'], ...samples.map(sample => columns.map(column => sample[column]))];
    const csv = rows.map(row => row.map(value => '"' + String(value ?? '').replaceAll('"', '""') + '"').join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `spherex_${ra.toFixed(5)}_${dec.toFixed(5)}_samples.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <section className="panel-box spectrum-panel" id="spectrum" aria-busy={current.status === 'loading'}>
    <div className="panel-header"><span className="panel-title">SPHEREx · measured samples</span><button className="btn-compact" disabled={!samples.length} onClick={download}>CSV</button></div>
    <p className="quiet-note">Real brightness samples at a sky position, not chemical identifications. Click the context image to select a position.</p>
    <div className="spectral-reference-controls"><button className="btn-compact" onClick={onMeasureCursor}>Measure at cursor</button><button className={`btn-compact ${showMarkers ? 'active' : ''}`} aria-pressed={showMarkers} onClick={() => setShowMarkers(value => !value)}>Reference markers</button></div>
    <p className="mono" style={{ fontSize: 11 }}>Sample position · RA {ra.toFixed(5)}° · Dec {dec.toFixed(5)}°</p>
    <SpectrumChart measured hoverSelect bands={samples.map((sample, index) => ({ ...sample, bandId: index + 1, err: sample.sigma }))} inSpherexFootprint activeWavelength={wavelength} onSelectWavelength={setWavelength} showLines={showMarkers} markers={MOLECULAR_MARKERS} />
    {current.status === 'loading' && <p role="status">Reading calibrated SPHEREx data from IRSA… First retrieval may take a minute.</p>}
    {current.status === 'error' && <div role="alert"><p>{current.error}</p><button className="btn-compact" onClick={() => setAttempt(value => value + 1)}>Retry measurements</button></div>}
    {result && !samples.length && <p role="status">No usable samples returned at this position. Try another position. No curve has been invented.</p>}
    {selected && <p role="status">{selected.wavelength.toFixed(4)} µm · {selected.flux.toPrecision(4)} ± {selected.sigma.toPrecision(3)} MJy/sr · {observationDate(selected.date)}</p>}
    <p className="quiet-note">Horizontal bars: passband width. Vertical bars: ±1σ statistical uncertainty. Missing wavelengths stay empty; exposures may have different dates.</p>
    {showMarkers && <p className="quiet-note">H₂O ice, PAH, CO₂ ice and CO mark approximate reference wavelengths, not detections in this object.</p>}
    {result && <details><summary>Measurements & method · {samples.length} usable samples</summary>
      <p>{result.attempted} exposures attempted · {result.rejected} rejected or unavailable{result.excluded ? ` · ${result.excluded} unsupported samples excluded` : ''}.</p>
      <div style={{ overflowX: 'auto' }}><table className="data-table"><caption>SPHEREx native-pixel surface brightness</caption><thead><tr><th>λ (µm)</th><th>MJy/sr</th><th>±1σ</th><th>Observed (UTC)</th><th>Source</th></tr></thead><tbody>{samples.map((sample, index) => <tr key={index}><td>{sample.wavelength.toFixed(4)}</td><td>{sample.flux.toPrecision(4)}</td><td>{sample.sigma.toPrecision(3)}</td><td>{observationDate(sample.date)}</td><td><a className="text-link" href={sample.source} target="_blank" rel="noreferrer">FITS ↗</a></td></tr>)}</tbody></table></div>
      <p>{result.method}</p><p>No background subtraction or source photometry. Wavelengths use the archive’s visualization lookup; this is an exploratory plot, not a fitted object spectrum or chemical abundance analysis.</p>
      <a className="text-link" href="https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products/" target="_blank" rel="noreferrer">IRSA data products & limitations ↗</a>
    </details>}
  </section>;
}
