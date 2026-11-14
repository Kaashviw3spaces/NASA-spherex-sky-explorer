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
export default function PresetPreloader() {
  const [index, setIndex] = useState(-1);
  useEffect(() => { const timer = setTimeout(() => setIndex(0), 3000); return () => clearTimeout(timer); }, []);
  return index >= 0 && index < 5 ? <WarmTarget key={index} target={BENCHMARK_TARGETS[index]} onDone={() => setIndex(index + 1)} /> : null;
}
