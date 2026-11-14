import SpectrumChart from './SpectrumChart';
import { MOLECULAR_MARKERS } from '../data/catalog';
import { observationDate } from '../utils/observationDate';
import { useEffect, useState } from 'react';
const references = [['H₂O ice', 3.05], ['PAH emission', 3.3], ['CO₂ ice', 4.27], ['CO', 4.67]];
export default function MeasuredSpectrum({ ra, dec }) {
  const [wavelength, setWavelength] = useState(3.05);
  const [chemical, setChemical] = useState('All');
  const [requested, setRequested] = useState(true), [result, setResult] = useState(null), [error, setError] = useState(''), [selected, setSelected] = useState(null);
  useEffect(() => { setResult(null); setRequested(true); setError(''); setSelected(null); }, [ra, dec]);
  useEffect(() => {
    if (!requested) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
    fetch(`/api/spherex/spectral-samples?ra=${ra}&dec=${dec}`, { signal: controller.signal }).then(async response => { const body = await response.json(); if (!response.ok) throw Error(body.detail); return body; }).then(setResult).catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    }, 1200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [requested, ra, dec]);
  const samples = result?.samples || [];
  const download = () => {
    const rows = [['wavelength_um', 'bandwidth_um', 'surface_brightness', 'sigma', 'unit', 'date_utc', 'source_url'], ...samples.map(s => [s.wavelength, s.bandwidth, s.flux, s.sigma, s.unit, s.date, s.source])];
    const blob = new Blob([rows.map(row => row.map(value => '"' + String(value).replaceAll('"', '""') + '"').join(',')).join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'spherex-measured-samples.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="panel-box spectrum-panel"><div className="panel-header"><span className="panel-title">SPHEREx spectrum · measured samples</span><span className="mono" style={{ fontSize: 10 }}>MJy/sr · ±1σ</span></div><p>Left to right: infrared wavelength. Higher dots: brighter surface brightness. Each dot is a real observation at the selected image position; bars show its uncertainty.</p>{!requested && <button className="btn-primary" onClick={() => setRequested(true)}>Load measured samples</button>}{error && <button className="btn-compact" onClick={() => { setError(''); setRequested(false); setTimeout(() => setRequested(true), 0); }}>Retry measurements</button>}{requested && !result && !error && <p role="status">Pause over a position to load its SPHEREx samples. Reading calibrated data from IRSA…</p>}{error && <p role="alert">{error}</p>}
    {samples.length > 0 && <div className="observation-date"><strong>SPHEREx observation dates</strong><p>{observationDate(samples.reduce((a,b) => a.date < b.date ? a : b).date)} — {observationDate(samples.reduce((a,b) => a.date > b.date ? a : b).date)}</p><small>{samples.length} measured samples · RA {ra.toFixed(4)}° · Dec {dec.toFixed(4)}°</small></div>}
    <p className="mono" style={{ fontSize: 11 }}>Linked to image cursor · RA {ra.toFixed(5)}° · Dec {dec.toFixed(5)}°</p>
    <div className="spectral-reference-controls"><label>Chemical reference <select value={chemical} onChange={event => setChemical(event.target.value)}><option>All</option>{references.map(([name]) => <option key={name}>{name}</option>)}</select></label><span>Gold: reference positions · Blue: measurements</span></div>
    <SpectrumChart measured hoverSelect bands={samples.map((sample, index) => ({ ...sample, bandId: index + 1, err: sample.sigma }))} inSpherexFootprint activeWavelength={wavelength} onSelectWavelength={value => { setWavelength(value); if (samples.length) setSelected(samples.reduce((best, sample) => Math.abs(sample.wavelength-value) < Math.abs(best.wavelength-value) ? sample : best)); }} showLines markers={MOLECULAR_MARKERS.filter(marker => chemical === 'All' || marker.wavelength === references.find(([name]) => name === chemical)?.[1])} />
    {!samples.length && <p role="status">{requested && !result && !error ? 'Retrieving real measurements…' : 'No measured samples plotted'}</p>}
    <p className="quiet-note">Study tip: select a dot to read its date and brightness. Compare nearby wavelengths cautiously—these exposures were taken at different times.</p><p className="quiet-note">Horizontal bars: passband width. Vertical bars: ±1σ statistical uncertainty. Dots are not connected across missing wavelengths.</p>
    {result && <><p role="status">{selected ? `${selected.wavelength.toFixed(4)} µm · ${selected.flux.toPrecision(5)} ± ${selected.sigma.toPrecision(3)} ${selected.unit} (1σ) · ${observationDate(selected.date)}` : 'Hover, tap, or focus a dot for its measurement.'}</p>{!samples.length && <p>No samples passed the quality checks. No curve has been invented.</p>}<p className="quiet-note">{result.samples.length} measured points at cursor position ({ra.toFixed(4)}°, {dec.toFixed(4)}°) /  {result.attempted} attempted exposures. {result.rejected} unavailable or rejected. Gaps are not interpolated. Chemical labels are reference positions, not detections.</p><button className="btn-compact" disabled={!samples.length} onClick={download}>Download measurements CSV</button><details><summary>Study the measurement table</summary><div style={{ overflowX: "auto" }}><table className="data-table"><thead><tr><th>Wavelength (µm)</th><th>Brightness (MJy/sr)</th><th>±1σ</th><th>Observed (UTC)</th></tr></thead><tbody>{samples.map((s,i) => <tr key={i} onClick={() => setSelected(s)}><td>{s.wavelength.toFixed(4)}</td><td>{s.flux.toPrecision(5)}</td><td>{s.sigma.toPrecision(3)}</td><td>{observationDate(s.date)}</td></tr>)}</tbody></table></div></details><details><summary>Method and limitations</summary><p>{result.method}</p>{samples.map((s,i) => <p key={i}><a className="text-link" href={s.source}>{s.wavelength.toFixed(3)} µm · source FITS ↗</a></p>)}</details></>}
    <details className="chemical-reference-guide"><summary>What could these features mean?</summary><p>H₂O ice near 3.05 µm and CO₂ ice near 4.27 µm can produce absorption; CO near 4.67 µm can appear in absorption or emission depending on physical conditions. The 3.3 µm feature is associated with aromatic C–H emission, commonly attributed to PAHs, a family of molecules.</p><p>These are approximate reference positions. No chemical identification is assigned to the displayed samples.</p><a className="text-link" href="https://www.jpl.nasa.gov/press-kits/spherex/mission-overview/science/" target="_blank" rel="noreferrer">SPHEREx science background · NASA/JPL ↗</a></details>
    <p className="quiet-note">A dip alone cannot establish H₂O, CO₂ or CO. Reliable composition analysis needs continuum fitting, calibrated spectral response, background/source separation and sufficient wavelength coverage.</p>
  </section>;
}
