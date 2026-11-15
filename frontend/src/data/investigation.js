import evidence from './investigation.json' with { type: 'json' };

export const SPHEREX_INVESTIGATION = evidence;
export const INVESTIGATION_LINK = `/explorer?source=spherex&ra=${evidence.ra}&dec=${evidence.dec}&fov=${evidence.fov_arcmin}&mode=side-by-side&name=Matched%20infrared%20field&investigation=${evidence.id}`;

export function investigationAtPointing(id, target) {
  return id === evidence.id && target.ra === evidence.ra && target.dec === evidence.dec
    && target.fovArcmin === evidence.fov_arcmin ? evidence : null;
}
