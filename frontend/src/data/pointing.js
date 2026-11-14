import { BENCHMARK_TARGETS } from './catalog.js';
import { resolveQueryToTarget } from './resolver.js';

// One URL pointing contract for both viewers. Coordinates take precedence over an old preset id.
export function targetFromParams(params) {
  const id = params.get('target');
  const preset = BENCHMARK_TARGETS.find(target => target.id === id);
  const hasCoordinates = params.has('ra') || params.has('dec');
  const fov = params.has('fov') ? Number(params.get('fov')) : 5;
  if (!Number.isFinite(fov) || fov <= 0.1 || fov > 15) throw new Error('This link has an invalid field of view.');
  let target;
  if (hasCoordinates) {
    const raText = params.get('ra'), decText = params.get('dec');
    const ra = Number(raText), dec = Number(decText);
    if (!raText?.trim() || !decText?.trim() || !Number.isFinite(ra) || !Number.isFinite(dec) ||
        ra < 0 || ra > 360 || Math.abs(dec) > 90) throw new Error('This link has invalid sky coordinates.');
    target = preset && preset.ra === ra && preset.dec === dec
      ? preset : resolveQueryToTarget(`${ra}, ${dec}`, BENCHMARK_TARGETS);
  } else {
    if (id && !preset) throw new Error('This link names an unknown target.');
    target = preset || BENCHMARK_TARGETS[0];
  }
  return { ...target, fovArcmin: fov, name: params.get('name') || params.get('title') || target.name };
}
