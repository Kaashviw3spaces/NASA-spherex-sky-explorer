"""Fetch real observations and export reproducible evidence; never substitutes simulations."""
import argparse
import asyncio
import hashlib
import json
from pathlib import Path
import numpy as np
from spherex_archive import discover, cutout


async def verify(ra, dec):
    records = await discover(ra, dec)
    if not records:
        raise ValueError('No archive observations returned.')
    first = records[0]
    matching = [r for r in records if (r['minUm'], r['maxUm']) == (first['minUm'], first['maxUm'])]
    pair = [matching[0], matching[-1]]
    if pair[0]['url'] == pair[1]['url'] or pair[0]['date'] == pair[1]['date']:
        raise ValueError('Two distinct dated exposures are unavailable.')
    evidence = {'ra': ra, 'dec': dec, 'fov_arcmin': 5, 'inputs': [], 'conclusion': 'No motion established. Different wavelength responses, PSFs, backgrounds and processing can explain differences.'}
    images = []
    for record in pair:
        item = dict(record)
        try:
            image = await cutout(record['url'], ra, dec, 5)
            data = np.asarray(image['pixels'], dtype=float)
            item.update(unit=image['unit'], quality_applied=image['qualityApplied'], valid_pixels=int(np.isfinite(data).sum()), total_pixels=int(data.size), image_sha256=hashlib.sha256(data.tobytes()).hexdigest(), processing=image['processing'])
            images.append(image)
        except Exception as error:
            item['error'] = str(error)
        evidence['inputs'].append(item)
    evidence['two_usable_exposures'] = len(images) == 2 and all(i.get('valid_pixels', 0) >= 64 and i.get('quality_applied') for i in evidence['inputs'])
    if len(images) == 2 and all(image.get('spectral') for image in images):
        a, b = [np.asarray(image['spectral'], dtype=float) for image in images]
        overlap = np.isfinite(np.asarray(images[0]['pixels'], dtype=float)) & np.isfinite(np.asarray(images[1]['pixels'], dtype=float))
        tolerance = .1*np.minimum(a[...,1],b[...,1])
        valid = np.isfinite(a).all(axis=-1) & np.isfinite(b).all(axis=-1) & (tolerance>0) & (np.abs(a[...,0]-b[...,0])<=tolerance) & (np.abs(a[...,1]-b[...,1])<=tolerance)
        evidence['shared_valid_pixels'] = int(overlap.sum())
        evidence['bandpass_compatible_fraction'] = float(valid[overlap].mean()) if overlap.any() else 0
        evidence['subtraction_gate_passes'] = bool(overlap.sum() >= 64 and valid[overlap].all())
        evidence['median_wavelength_difference_um'] = float(np.nanmedian(np.abs(a[...,0]-b[...,0])[overlap])) if overlap.any() else None
    return evidence


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--ra', type=float, default=269.4521)
    parser.add_argument('--dec', type=float, default=4.6934)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    result = asyncio.run(verify(args.ra, args.dec))
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2, allow_nan=False)+'\n')
    print(json.dumps({k: v for k, v in result.items() if k != 'inputs'}, indent=2))
    for item in result['inputs']:
        print(item['date'], item.get('valid_pixels'), item.get('error', 'downloaded'))
