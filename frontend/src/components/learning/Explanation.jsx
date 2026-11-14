import { useState, useId } from 'react';
export default function Explanation({ title, understand, explore, science }) {
  const [level, setLevel] = useState(0);
  const id = useId();
  const labels = ['Understand', 'Explore', 'Science behind it'];
  return <section className="explanation" aria-label={title}>
    <h3>{title}</h3>
    <div className="explanation-levels" role="group" aria-label="Explanation depth">{labels.map((label, index) => <button key={label} type="button" aria-pressed={level === index} aria-controls={id} onClick={() => setLevel(index)}>{label}</button>)}</div>
    <div id={id} className="explanation-body" aria-live="polite">{[understand, explore, science][level]}</div>
  </section>;
}
