import EditorialCover from '../components/learning/EditorialCover';
import LearningNav from '../components/learning/LearningNav';
import WebbImageStudy from '../components/learning/WebbImageStudy';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import KnowledgeCheck from '../components/learning/KnowledgeCheck';
import { MISSIONS, canCompleteMission } from '../data/missions';
import { readLearning, saveMission } from '../utils/learningStorage';

export default function MissionsPage() {
  const { missionId } = useParams();
  const [progress, setProgress] = useState({});
  useEffect(() => {
    const refresh = () => setProgress(readLearning().data.missions);
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener('focus', refresh); window.removeEventListener('storage', refresh); };
  }, [missionId]);
  return missionId ? <Mission key={missionId} id={missionId} /> : <div className="page-container missions-page"><EditorialCover image="pillars" eyebrow="GUIDED DISCOVERY / FIVE INVESTIGATIONS" title="Follow a question.">Choose a trail. Look closely. Keep what you learn.</EditorialCover><LearningNav /><ol className="mission-list">{MISSIONS.map((mission, index) => <li key={mission.id} data-scroll-reveal><span className="mission-number">0{index + 1}</span><div><span className="eyebrow">{mission.level} · {mission.minutes} MIN</span>{progress[mission.id] && <span className="mission-state">{progress[mission.id].completedAt ? 'Completed' : 'In progress'}</span>}<h2><Link to={`/missions/${mission.id}`}>{mission.title}</Link></h2><p>{mission.question}</p></div><Link className="text-link" to={`/missions/${mission.id}`}>{progress[mission.id]?.completedAt ? 'Review' : progress[mission.id] ? 'Resume' : 'Begin'} ↗</Link></li>)}</ol></div>;
}
function Mission({ id }) {
  const mission = MISSIONS.find(item => item.id === id);
  const [record, setRecord] = useState({ objectives: [], passed: false, reflection: '' });
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => { const result = readLearning(); setError(result.error); if (result.data.missions[id]) setRecord(result.data.missions[id]); }, [id]);
  if (!mission) return <div className="page-container"><h1>Mission not found</h1><Link className="text-link" to="/missions">Choose a mission ↗</Link></div>;
  const persist = (next, complete = false) => {
    setRecord(next);
    const result = saveMission(id, next, complete);
    setError(result.error);
    if (!result.error) { setRecord(result.data.missions[id]); setStatus(complete ? 'Mission complete. Saved to your journal.' : 'Progress saved in this browser.'); }
  };
  return <div className="page-container mission-detail"><Link className="text-link" to="/missions">← All missions</Link><div className="eyebrow">{mission.level} · ABOUT {mission.minutes} MINUTES</div><h1 className="display-title">{mission.title}</h1><p className="learning-question">{mission.question}</p>
    {error && <p className="inline-error" role="alert">{error} Progress can still be explored in this session.</p>}
    <nav className="mission-section-nav" aria-label="Mission sections"><a href="#mission-evidence">01 Evidence</a><a href="#mission-objectives">02 Investigate</a><a href="#mission-reflect">03 Reflect</a></nav>
    <section id="mission-evidence" className="mission-context"><h2>Ask / Look at the evidence</h2><p>{mission.context}</p>{mission.image && <WebbImageStudy />}<a className="text-link" href={mission.source} target="_blank" rel="noreferrer">Read the scientific source ↗</a></section>
    <section id="mission-objectives" className="mission-objectives"><h2>Explore / Observe</h2><p>Try each objective, then mark it yourself. The app does not verify telescope access.</p><div className="btn-row">{mission.links.map(([label, url]) => <Link key={url} className="btn-secondary" to={url} target="_blank" rel="noreferrer">{label} ↗</Link>)}</div><fieldset><legend>Your exploration objectives</legend>{mission.steps.map((step, index) => <label key={step}><input type="checkbox" checked={record.objectives[index] === true} onChange={event => { const objectives = [...record.objectives]; objectives[index] = event.target.checked; persist({ ...record, objectives }); }} />{step}</label>)}</fieldset></section>
    <section id="mission-reflect" className="mission-reflect"><h2>Explain / Reflect</h2><KnowledgeCheck {...mission.check} onPassed={() => persist({ ...record, passed: true })} />{record.passed && <p className="model-label">Knowledge check passed in this browser.</p>}<label className="reflection-field">{mission.prompt}<textarea maxLength={2000} rows={3} value={record.reflection} onChange={event => { setRecord({ ...record, reflection: event.target.value }); setStatus('Unsaved reflection'); }} /></label><div className="btn-row"><button className="btn-secondary" onClick={() => persist(record)}>Save reflection</button><button className="btn-primary" disabled={!canCompleteMission(mission, record)} onClick={() => persist(record, true)}>Complete mission</button></div><p role="status">{status}</p></section>
    {record.completedAt && <section className="completion-summary"><div className="eyebrow">MISSION SUMMARY</div><h2>Investigation complete.</h2><p>{mission.question}</p><p>Your reflection: {record.reflection}</p><p>Completed {new Date(record.completedAt).toLocaleDateString()}. This records learning, not a verified astronomical discovery.</p><Link className="text-link" to="/library">Open my journal ↗</Link></section>}
  </div>;
}
