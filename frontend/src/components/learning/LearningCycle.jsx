import { useId } from 'react';

// Slots accept existing visualizations and explanations; the layout owns no lesson data or progress.
export default function LearningCycle({ title, ask, explore, observe, explain, reflect, reveal = false, sticky = false }) {
  const id = useId();
  return (
    <section className={`learning-cycle ${sticky ? "workbench-cycle" : ""}`} aria-label={title}>
      {sticky && <aside className="workbench-instrument" aria-label="Interactive model"><h3 className="learning-step-label"><span>02</span>Explore</h3><div className="learning-step-content">{explore}</div></aside>}
      <div className={sticky ? "workbench-notes" : undefined}>
      {[
        ['ask', 'Ask', ask],
        ['explore', 'Explore', explore],
        ['observe', 'Observe', observe],
        ['explain', 'Explain', explain],
        ['reflect', 'Reflect', reflect]
      ].filter(([key]) => !sticky || key !== 'explore').map(([key, label, content], index) => (
        <section data-scroll-reveal={reveal || undefined} data-lab-step={['ask','explore','observe','explain','reflect'].indexOf(key)} className={`learning-step learning-step-${key}`} key={key} aria-labelledby={`${id}-${key}`}>
          <h3 id={`${id}-${key}`} className="learning-step-label"><span>0{['ask','explore','observe','explain','reflect'].indexOf(key) + 1}</span>{label}</h3>
          <div className="learning-step-content">{content}</div>
        </section>
      ))}
      </div>
    </section>
  );
}
