import { useId, useState } from 'react';
export default function KnowledgeCheck({ question, options, correct, explanation, onPassed, onChecked }) {
  const id = useId();
  const [answer, setAnswer] = useState(null);
  const [checked, setChecked] = useState(false);
  return <form className="knowledge-check" onSubmit={event => { event.preventDefault(); setChecked(true); onChecked?.({ correct: answer === correct }); if (answer === correct) onPassed?.(); }}>
    <fieldset><legend>{question}</legend>{options.map((option, index) => <label key={option}><input type="radio" name={id} checked={answer === index} onChange={() => { setAnswer(index); setChecked(false); }} />{option}</label>)}</fieldset>
    <button className="btn-secondary" type="submit" disabled={answer === null}>Check my thinking</button>
    {checked && <p className={answer === correct ? 'check-feedback correct' : 'check-feedback retry'} role="status">{answer === correct ? 'That’s right. ' : 'Try again. '}{explanation}</p>}
  </form>;
}
