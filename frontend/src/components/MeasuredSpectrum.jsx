import { useEffect, useState } from 'react';
import SpectrumChart from './SpectrumChart';
import { MOLECULAR_MARKERS } from '../data/catalog';
import { observationDate } from '../utils/observationDate';
import { fetchSpectralSamples } from '../api/spectralSamples';

export default function MeasuredSpectrum({ ra, dec, onMeasureCursor, embedded = false, onLoadingChange, imageWavelength, requestDelay = 0 }) {
  const key = JSON.stringify([ra, dec]);
  const [state, setState] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [wavelength, setWavelength] = useState(3.05);
  const [showMarkers, setShowMarkers] = useState(false);
  useEffect(() => { if (Number.isFinite(imageWavelength)) setWavelength(Math.max(.75,Math.min(5,imageWavelength))); }, [imageWavelength, key]);
  const current = state?.key === key ? state : { status: 'loading' };
  const result = current.result;
  useEffect(() => { onLoadingChange?.(current.status === 'loading'); }, [current.status, onLoadingChange]);
  const samples = result?.samples || [];
  const selected = samples.length ? samples.reduce((best, sample) => Math.abs(sample.wavelength - wavelength) < Math.abs(best.wavelength - wavelength) ? sample : best) : null;

  useEffect(() => {
    const controller = new AbortController();
    setState({ key, status: 'loading' });
    const deadline = setTimeout(() => controller.abort(new Error('Archive request timed out. Please retry.')), 150000);
    const timer = setTimeout(() => { fetchSpectralSamples(ra, dec, controller.signal, attempt > 0, result => {
      if (!controller.signal.aborted) setState({key, status:result.complete ? 'ready' : 'loading', result});
    })
      .then(result => { if (!controller.signal.aborted) setState({ key, status: 'ready', result }); })
      .catch(error => { if (error.name !== 'AbortError') setState(previous => ({ key, status: 'error', error: error.message, result:previous?.key === key ? previous.result : null })); })
      .finally(() => clearTimeout(deadline)); }, requestDelay);
    return () => { clearTimeout(timer); clearTimeout(deadline); controller.abort(); };
  }, [key, attempt, requestDelay]);

  const download = () => {
    const columns = ['wavelength', 'bandwidth', 'flux', 'sigma', 'unit', 'date', 'source', 'flags'];
    const rows = [['wavelength_um', 'bandwidth_um', 'surface_brightness', 'sigma_1', 'unit', 'date_utc', 'source_url', 'flags'], ...samples.map(sample => columns.map(column => sample[column]))];
    const csv = rows.map(row => row.map(value => '"' + String(value ?? '').replaceAll('"', '""') + '"').join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `spherex_${ra.toFixed(5)}_${dec.toFixed(5)}_samples.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const Container = embedded ? 'div' : 'section';
  return <Container className={embedded ? 'real-channel-inspector' : 'panel-box spectrum-panel'} id={embedded ? undefined : 'spectrum'} aria-busy={current.status === 'loading'}>
    <div className="panel-header"><span className="panel-title">SPHEREx · measured samples</span><button className="btn-compact" disabled={!samples.length} onClick={download}>CSV</button></div>
    <p className="quiet-note">Real infrared channels at the selected position. Each dot is a separate SPHEREx measurement.</p>
    <div className="channel-legend" aria-label="Graph legend"><span className="channel-measured">● Measured channels · MJy/sr</span><span>↕ ±1σ uncertainty</span></div>
    <div className="spectral-reference-controls"><button className="btn-compact" onClick={onMeasureCursor}>Measure at cursor</button><button className={`btn-compact ${showMarkers ? 'active' : ''}`} aria-pressed={showMarkers} onClick={() => setShowMarkers(value => !value)}>Reference markers</button></div>
    <p className="channel-position">Image selection · RA {ra.toFixed(5)}° <span>Dec {dec.toFixed(5)}°</span></p>
    <SpectrumChart measured hoverSelect bands={samples.map((sample, index) => ({ ...sample, bandId: index + 1, err: sample.sigma }))} inSpherexFootprint activeWavelength={wavelength} onSelectWavelength={setWavelength} showLines={showMarkers} markers={MOLECULAR_MARKERS} />
    {current.status === 'loading' && <p role="status">{samples.length ? `${samples.length} channels loaded · reading more…` : 'Loading measured channels…'}</p>}
    {current.status === 'error' && <div role="alert"><p>{current.error}</p><button className="btn-compact" onClick={() => setAttempt(value => value + 1)}>Retry measurements</button></div>}
    {current.status === 'ready' && !samples.length && <p role="status">No usable samples returned at this position.</p>}
    {selected && <dl className="channel-readout" aria-label="Selected channel measurement"><div><dt>Wavelength</dt><dd>{selected.wavelength.toFixed(4)} <small>µm</small></dd></div><div><dt>Brightness ±1σ</dt><dd>{selected.flux.toPrecision(4)} ± {selected.sigma.toPrecision(3)} <small>MJy/sr</small></dd></div><div className="channel-date"><dt>Observed</dt><dd>{observationDate(selected.date)}</dd></div></dl>}
    <details className="spectrum-explanation">
      <summary>How Real Spectra Are Built</summary>
      <p>Because each position on a SPHEREx detector sees a slightly different wavelength, a single snapshot does not capture a full 102-channel spectrum of a star or galaxy. Instead, as the spacecraft orbits and repoints across the sky, the same astronomical object falls onto different parts of the detectors over multiple exposures.</p>
      <p>Combining calibrated measurements builds its infrared spectrum across the mission’s 102 channels where coverage is sufficient. These spectra help astronomers measure galaxy redshifts and identify features associated with water ice (H₂O), carbon dioxide (CO₂), carbon monoxide (CO), and polycyclic aromatic hydrocarbons (PAHs).</p>
      <p className="quiet-note">This graph shows available samples; coverage varies.</p>
    </details>
    {result && samples.length > 0 && <details className="channel-measurements"><summary>Measurements & method <span>{samples.length} {samples.length === 1 ? 'sample' : 'samples'}</span></summary>
      <p>{result.processed ?? result.attempted} of {result.attempted} exposures checked · {result.rejected} rejected or unavailable{result.excluded ? ` · ${result.excluded} unsupported samples excluded` : ''}.</p>
      <div className="channel-table-wrap" tabIndex={0} role="region" aria-label="SPHEREx measurement table"><table className="data-table"><caption>SPHEREx native-pixel surface brightness</caption><thead><tr><th>λ (µm)</th><th>MJy/sr</th><th>±1σ</th><th>Observed (UTC)</th><th>Source</th></tr></thead><tbody>{samples.map((sample, index) => <tr key={index}><td>{sample.wavelength.toFixed(4)}</td><td>{sample.flux.toPrecision(4)}</td><td>{sample.sigma.toPrecision(3)}</td><td>{observationDate(sample.date)}</td><td><a className="text-link" href={sample.source} target="_blank" rel="noreferrer">FITS ↗</a></td></tr>)}</tbody></table></div>
      <p>{samples.length ? <>These {samples.length} measurements are snapshots of invisible infrared light recorded by SPHEREx at the sky position you selected. Each number comes from a calibrated camera pixel near that position.</> : 'No usable measurements are available at this position yet.'}</p>
      {samples.length > 0 && <p>The measurements still include background space glow and have not been combined into a complete 102-channel spectrum. Think of this as a sneak peek at real telescope data, rather than a finished scientific report about this object.</p>}
      <a className="text-link" href="https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products/" target="_blank" rel="noreferrer">IRSA data products & limitations ↗</a>
    </details>}
  </Container>;
}
