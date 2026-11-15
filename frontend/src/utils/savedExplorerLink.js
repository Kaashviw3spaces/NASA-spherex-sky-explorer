import { INVESTIGATION_LINK, SPHEREX_INVESTIGATION as evidence } from '../data/investigation.js';

export function savedExplorerLink(item) {
  const sources = item.observation?.sources || [];
  const ids = sources.map(source => source.sourceUrl);
  const documentedPair = item.ra === evidence.ra && item.dec === evidence.dec
    && item.fovArcmin === evidence.fov_arcmin && ids.length === 2
    && new Set(ids).size === 2 && evidence.inputs.every(input => ids.includes(input.url));
  const url = new URL(documentedPair ? INVESTIGATION_LINK : '/explorer', 'https://local.invalid');
  const params = url.searchParams;
  for (const [key, value] of Object.entries({ ra: item.ra, dec: item.dec, fov: item.fovArcmin,
    mode: item.mode, stretch: item.stretch, colormap: item.colormap, name: item.name })) {
    if (value != null) params.set(key, String(value));
  }
  const spherex = sources.length > 0 && sources.every(source => source.sourceUrl?.startsWith('https://irsa.ipac.caltech.edu/ibe/data/spherex/'));
  params.set('source', documentedPair || spherex ? 'spherex' : 'unwise');
  return url.pathname + '?' + params.toString();
}
