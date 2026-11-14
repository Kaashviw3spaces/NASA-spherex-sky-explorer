import { Link } from 'react-router-dom';
import { GLOSSARY } from '../../data/glossary';
export default function GlossaryTerm({ term, children }) {
  const entry = GLOSSARY[term];
  if (!entry) return children || term;
  return <details className="glossary-term"><summary>{children || entry.name}</summary><div className="glossary-definition"><strong>{entry.name}</strong><p>{entry.short}</p>{entry.analogy && <p>{entry.analogy}</p>}<details><summary>Go deeper</summary><p>{entry.detail}</p><a href={entry.source} target="_blank" rel="noreferrer">Scientific reference ↗</a></details>{entry.link && <Link to={entry.link}>Explore this idea ↗</Link>}</div></details>;
}
