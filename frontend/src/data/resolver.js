export function parseCoordinateInput(rawQuery) {
  const q = rawQuery.trim();
  const decMatch = q.match(/^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/);
  if (decMatch) {
    const ra = ((parseFloat(decMatch[1]) % 360) + 360) % 360;
    const dec = Math.max(-90, Math.min(90, parseFloat(decMatch[2])));
    return { ra, dec };
  }

  const hmsMatch = q.match(
    /^(\d{1,2})[:\s](\d{1,2})[:\s](\d{1,2}(?:\.\d+)?)[,\s]+([+-]?\d{1,2})[:\s](\d{1,2})[:\s](\d{1,2}(?:\.\d+)?)$/
  );
  if (hmsMatch) {
    const h = parseInt(hmsMatch[1], 10);
    const m = parseInt(hmsMatch[2], 10);
    const s = parseFloat(hmsMatch[3]);
    const ra = (((h + m / 60 + s / 3600) * 15) % 360 + 360) % 360;

    const sign = hmsMatch[4].startsWith('-') ? -1 : 1;
    const d = Math.abs(parseInt(hmsMatch[4], 10));
    const am = parseInt(hmsMatch[5], 10);
    const as = parseFloat(hmsMatch[6]);
    const dec = Math.max(-90, Math.min(90, sign * (d + am / 60 + as / 3600)));
    return { ra, dec };
  }

  return null;
}

export function resolveQueryToTarget(rawQuery, targets) {
  const q = rawQuery.trim();
  if (!q) return targets[1];
  const lower = q.toLowerCase();
  const byName = targets.find(
    (t) => t.name.toLowerCase().includes(lower) || t.id.includes(lower)
  );
  if (byName) return byName;

  const parsed = parseCoordinateInput(q);
  if (parsed) {
    const { ra, dec } = parsed;
    const d2r = Math.PI / 180;
    const r2d = 180 / Math.PI;
    const alphaG = 192.85948 * d2r;
    const deltaG = 27.12825 * d2r;
    const raRad = ra * d2r;
    const decRad = dec * d2r;
    const sinB = Math.sin(deltaG) * Math.sin(decRad) + Math.cos(deltaG) * Math.cos(decRad) * Math.cos(raRad - alphaG);
    const galB = Math.asin(Math.max(-1, Math.min(1, sinB))) * r2d;
    const inFootprint = Math.abs(galB) >= 6.0;
    return {
      id: `custom-${ra.toFixed(2)}-${dec.toFixed(2)}`,
      name: `J${ra.toFixed(3)}${dec >= 0 ? '+' : ''}${dec.toFixed(3)}`,
      ra,
      dec,
      hmsDms: `${ra.toFixed(4)} deg, ${dec.toFixed(4)} deg`,
      fovArcmin: 5.0,
      inSpherexFootprint: inFootprint,
      survey: inFootprint ? 'SPHEREx 102-Band' : 'unWISE Multi-Epoch',
      properMotion: 'Custom Coordinate Query',
      spectralNote: inFootprint
        ? 'Regridded onto 6.2 arcsec/px WCS tangent-plane grid'
        : 'Outside SPHEREx MOC; served via unWISE W1/W2 fallback',
      dqFlag: 'NOMINAL',
      epochs: inFootprint
        ? ['2025-05', '2025-11', '2026-05', '2026-10']
        : ['2014-03', '2017-09', '2020-03', '2023-09'],
      motionDxPerEpoch: ((ra * 13) % 7) - 3.5,
      motionDyPerEpoch: ((Math.abs(dec) * 7) % 6) - 3.0,
      variabilityAmp: 0.12,
      iceDepth: { h2o: 0.25, pah: -0.08, co2: 0.18, co: 0.14 },
      peakFluxMjy: 22.4
    };
  }
  return targets[1];
}
