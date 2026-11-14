import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MISSIONS } from '../../data/missions';
import { readLearning, saveReflection, deleteReflection, exportLearning, LEARNING_KEY } from '../../utils/learningStorage';

export default function JournalLearning({ view = 'notes' }) {
  const [learning, setLearning] = useState({ missions: {}, entries: [] });
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [draft, setDraft] = useState({ title: '', note: '' });
  const [writing, setWriting] = useState(false);
  const refresh = () => { const result = readLearning(); setLearning(result.data); setError(result.error); };
  useEffect(() => { refresh(); const changed = event => { if (event.key === LEARNING_KEY || event.key === null) refresh(); }; window.addEventListener('storage', changed); return () => window.removeEventListener('storage', changed); }, []);
  const result = (response, message) => { setError(response.error); if (!response.error) { setLearning(response.data); setStatus(message); return true; } return false; };
  const started = MISSIONS.filter(m => learning.missions[m.id]);
  return <section className="journal-learning notebook" aria-labelledby="journal-heading">
    <div className="section-heading"><div><div className="eyebrow">PERSONAL FIELD NOTES</div><h2 id="journal-heading">{view === 'missions' ? 'Your mission log' : 'Your field notes'}</h2></div><div className="btn-row">{view === 'notes' && <button className="btn-primary" onClick={() => setWriting(true)}>Write an entry +</button>}<button className="btn-compact" onClick={() => result(exportLearning(), 'Learning journal exported.')}>Export learning journal</button></div></div>
    <p className="quiet-note">Saved in this browser. Export a backup to keep a copy.</p>
    {error && <p className="inline-error" role="alert">{error}</p>}<p role="status">{status}</p>
    {view === 'missions' ? <div className="notebook-log">{!started.length ? <div className="journal-empty"><span className="margin-label">YOUR NEXT QUESTION</span><h3>Every investigation starts with curiosity.</h3><p>Follow a mission and keep your thinking here.</p><Link className="btn-secondary" to="/missions">Find your first mission ↗</Link></div> : started.map(mission => <article key={mission.id}><span className="margin-label">{learning.missions[mission.id].completedAt ? 'COMPLETED' : 'IN PROGRESS'}</span><h3>{mission.title}</h3>{learning.missions[mission.id].reflection && <p className="written-note">{learning.missions[mission.id].reflection}</p>}<Link className="text-link" to={`/missions/${mission.id}`}>{learning.missions[mission.id].completedAt ? 'Review your investigation' : 'Continue investigating'} ↗</Link></article>)}</div> : <>
      {writing && <form className="notebook-editor" onSubmit={event => { event.preventDefault(); if (result(saveReflection(draft), 'Reflection saved.')) { setDraft({ title: '', note: '' }); setWriting(false); } }}>
        <div className="section-heading"><span className="margin-label">{draft.id ? 'EDIT YOUR ENTRY' : 'A NEW PAGE'}</span><button className="btn-compact" type="button" onClick={() => setWriting(false)}>Close writing area</button></div>
        <label className="reflection-field">Title<input maxLength={120} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="Give your thought a name" /></label>
        <div className="writing-prompts" role="group" aria-label="Writing prompts">{['I noticed…', 'I wonder…', 'Next I’ll check…'].map(prompt => <button type="button" key={prompt} className="btn-compact" onClick={() => setDraft({ ...draft, note: `${draft.note}${draft.note ? '\n' : ''}${prompt} ` })}>{prompt}</button>)}</div>
        <label className="reflection-field">Your reflection<textarea required maxLength={3000} rows={6} value={draft.note} onChange={event => setDraft({ ...draft, note: event.target.value })} placeholder="A detail, a question, or something that surprised you…" /></label><button className="btn-primary" type="submit">Save reflection</button>
      </form>}
      <div className="journal-entries">{!learning.entries.length ? !writing && <div className="journal-empty"><span className="notebook-mark" aria-hidden="true">✦</span><h3>Leave a little room for wonder.</h3><p>A detail you noticed. A question you’re keeping.<br />Your first entry can be a single sentence.</p><button className="text-link" onClick={() => setWriting(true)}>Open a fresh page ↗</button></div> : learning.entries.map((entry, index) => <article className="notebook-entry" key={entry.id}><div className="entry-dateline"><span>ENTRY {String(learning.entries.length - index).padStart(2, '0')}</span><time dateTime={entry.savedAt}>{new Date(entry.savedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</time></div><h3>{entry.title}</h3><p className="written-note">{entry.note}</p>{entry.context?.url && <Link className="text-link" to={entry.context.url}>{entry.context.label} ↗</Link>}<div className="btn-row"><button className="btn-compact" onClick={() => { setDraft({ id: entry.id, title: entry.title, note: entry.note, context: entry.context }); setWriting(true); }}>Edit reflection</button><button className="btn-compact" onClick={() => { if (window.confirm('Delete this reflection?')) result(deleteReflection(entry.id), 'Reflection deleted.'); }}>Delete reflection</button></div></article>)}</div>
    </>}
  </section>;
}
