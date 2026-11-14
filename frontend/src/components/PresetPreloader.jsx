import { useEffect, useState } from 'react';
import { BENCHMARK_TARGETS } from '../data/catalog';
import useCutoutFrames from '../hooks/useCutoutFrames';
import useSpherexFrames from '../hooks/useSpherexFrames';

function WarmTarget({ target, onDone }) {
  const context = useCutoutFrames(target);
  const science = useSpherexFrames(target);
  useEffect(() => {
    if (context.status !== 'loading' && science.status !== 'loading') onDone();
  }, [context.status, science.status, onDone]);
  return null;
}
// One target at a time, after the initial viewer has had time to start.
export default function PresetPreloader({enabled = true}) {
  const [index, setIndex] = useState(-1);
  useEffect(() => { if (!enabled || index >= 0) return; const timer = setTimeout(() => setIndex(0), 3000); return () => clearTimeout(timer); }, [enabled, index]);
  return enabled && index >= 0 && index < 5 ? <WarmTarget key={index} target={BENCHMARK_TARGETS[index]} onDone={() => setIndex(index + 1)} /> : null;
}
