import { useState } from 'react';
import { updateLibraryItem } from '../../utils/libraryStorage';
export default function SceneNotes({ item, onSaved }) {
  const [note, setNote] = useState(item.notes || '');
  const [message, setMessage] = useState('');
  return <details className="scene-notes"><summary>Notes &amp; observation source</summary>
    {item.observation ? <p>{String(item.observation.kind || 'unknown')} · {String(item.observation.provenance || 'unknown')} · {String(item.observation.release || 'release unknown')} · {String(item.observation.epoch || 'date unknown')} · {String(item.observation.bunit || 'units unknown')}. Saved metadata, not an archived pixel snapshot.</p> : <p>Coordinates and viewing settings only; no observation snapshot was stored.</p>}
    {item.observation?.sources?.map((source,index) => <p key={index}>Input {index+1}: {source.epoch || 'Date unavailable'} · {source.spectralRange || (source.wavelengthUm ? `${source.wavelengthUm} µm` : 'Band unavailable')} {source.sourceUrl && <a className="text-link" href={source.sourceUrl} target="_blank" rel="noreferrer">Source FITS ↗</a>}</p>)}
    <form onSubmit={event => { event.preventDefault(); const saved = updateLibraryItem(item.id, { notes: note }); setMessage(saved ? 'Note saved.' : 'Could not save. Check browser storage.'); if (saved) onSaved(); }}><label className="reflection-field">Your note<textarea maxLength={3000} rows={3} value={note} onChange={event => setNote(event.target.value)} /></label><button className="btn-compact" type="submit">Save note</button><p role="status">{message}</p></form>
  </details>;
}
