import { useEffect, useState } from 'react';
import { fetchCutoutsWithPolling, getCachedCutouts, getCutoutCacheKey } from '../api/client';

// State is tagged with the request: a target change cannot expose the previous target's frames.
export default function useCutoutFrames(target, {enabled = true} = {}) {
  const key = getCutoutCacheKey(target.ra, target.dec, target.fovArcmin);
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const cached = getCachedCutouts(target.ra, target.dec, target.fovArcmin);
  const current = result?.key === key ? result : { frames: cached || [], status: 'loading', error: '' };

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const frames = getCachedCutouts(target.ra, target.dec, target.fovArcmin) || [];
    if (frames.length && attempt === 0) { setResult({ key, frames, status: 'ready', error: '' }); return () => controller.abort(); }
    setResult({ key, frames, status: 'loading', error: '' });
    fetchCutoutsWithPolling({ ra: target.ra, dec: target.dec, fovArcmin: target.fovArcmin },
      (next, complete) => {
        if (!controller.signal.aborted) setResult({ key, frames: next, status: complete ? 'ready' : 'loading', error: '' });
      }, controller.signal).catch(error => {
      if (!controller.signal.aborted) setResult(previous => ({
        key, frames: previous?.key === key ? previous.frames : [], status: 'error', error: error.message
      }));
    });
    return () => controller.abort();
  }, [key, attempt, enabled]);

  return { ...current, requestKey: key, retry: () => setAttempt(value => value + 1) };
}
