import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Orbit, MoveUpRight, Waves, Eclipse, Compass, Sparkles } from 'lucide-react';
import { BENCHMARK_TARGETS } from '../data/catalog';

const icons = [MoveUpRight, Eclipse, Orbit, Sparkles, Waves, Compass];
const categories = ['A star on the move', 'A cool brown dwarf', 'A stellar companion', 'A young star system', 'A variable star', 'A crowded field'];

export default function TargetsPage() {
  const [query, setQuery] = useState('');
  const visible = BENCHMARK_TARGETS.map((target, index) => ({ target, index })).filter(({ target }) => `${target.name} ${target.spectralNote}`.toLowerCase().includes(query.toLowerCase().trim()));
  return (
    <div className="page-container">
      <div className="eyebrow">A FEW PLACES TO BEGIN</div>
      <h1 className="display-title">The sky is full of <em>stories.</em></h1>
      <p className="lead-copy">Choose a familiar starting point, or follow a new curiosity. Each target opens at its sky coordinates. Image availability is checked on request; spectra are simulated.</p>
      <label className="target-filter">Find a starting point<input type="search" placeholder="Try a name, brown dwarf, or stellar field…" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <p className="filter-count" role="status">{visible.length} of {BENCHMARK_TARGETS.length} fields</p>
      {!visible.length && <p>No fields match. Try a different name or <button className="btn-compact" onClick={() => setQuery('')}>Clear search</button>.</p>}
      <div className="target-grid">
        {visible.map(({ target, index }) => {
          const Icon = icons[index];
          return <article className="target-card" key={target.id}>
            <div className="target-card-top"><Icon size={30} strokeWidth={1} /><span>FIELD {String(index + 1).padStart(2, '0')}</span></div>
            <h2>{target.name}</h2>
            <div className="eyebrow">{categories[index]}</div>
            <div className="target-position">RA {target.ra.toFixed(4)}° &nbsp; DEC {target.dec.toFixed(4)}°<br />{target.hmsDms}</div>
            <details><summary>About this example</summary><p>{target.spectralNote}</p><p>Motion and chemistry are not measured by this app.</p>{target.sourceUrl && <a className="text-link" href={target.sourceUrl} target="_blank" rel="noreferrer">Read the source <ArrowUpRight size={13} /></a>}</details>
            <Link to={`/explorer?ra=${target.ra}&dec=${target.dec}&fov=${target.fovArcmin}&target=${target.id}`} className="btn-secondary">Explore this field <ArrowUpRight size={16} /></Link>
          </article>;
        })}
      </div>
    </div>
  );
}
