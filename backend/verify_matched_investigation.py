"""Reproduce one real matched-field investigation; no synthetic replacement data.

Native-pixel field medians are descriptive, not source photometry or a variability
test. Preview interpolation is checked separately and never used as extra samples.
"""
import argparse
import asyncio
import hashlib
import io
import json
from datetime import datetime, timezone
from pathlib import Path

import httpx
import numpy as np
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.wcs import WCS
import astropy.units as u
from scipy.ndimage import map_coordinates

from spherex_archive import decode_image, download_fits
from wcs_pipeline import build_tan_wcs

RA, DEC, FOV = 269.4521, 4.6934, 5
BASE = 'https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/'
INPUTS = [
    ('2026W12_1A_0610_4', BASE + '2026W12_1A/l2b-v27-2026-235/3/level2_2026W12_1A_0610_4D3_spx_l2b-v27-2026-235.fits'),
    ('2026W19_1A_0046_1', BASE + '2026W19_1A/l2b-v27-2026-245/3/level2_2026W19_1A_0046_1D3_spx_l2b-v27-2026-245.fits'),
]
CALIBRATION = 'https://nasa-irsa-spherex.s3.us-east-1.amazonaws.com/dr1/spectral_wcs/cal-swcs-v5-2026-191/3/spectral_wcs_D3_spx_cal-swcs-v5-2026-191.fits'


def quality_mask(image, flags, variance):
    allowed = (1 << 21) | (1 << 12)
    return np.isfinite(image) & np.isfinite(variance) & (variance >= 0) & ((flags.astype(np.int64) & ~allowed) == 0)


def compatible(wave_a, band_a, wave_b, band_b):
    tolerance = .1 * np.minimum(band_a, band_b)
    return (np.isfinite(wave_a) & np.isfinite(wave_b) & np.isfinite(tolerance)
            & (tolerance > 0) & (np.abs(wave_a-wave_b) <= tolerance)
            & (np.abs(band_a-band_b) <= tolerance))


def calibrated_values(header, x, y, calibration):
    # The archive's alternate A WCS maps cutout pixels to 0-based full detector
    # coordinates. Do not infer the offset from the celestial WCS reference point.
    detector_wcs = WCS(header, key='A')
    # Astropy attaches the celestial SIP coefficients to alternate WCS too;
    # detector A is LINEAR and must not apply those distortions a second time.
    detector_wcs.sip = None
    ox, oy = detector_wcs.all_pix2world(x, y, 0)
    return [map_coordinates(calibration[name].data, [oy, ox], order=1,
                            mode='constant', cval=np.nan)
            for name in ('CWAVE', 'CBAND')]


def analyse_native(content, calibration):
    with fits.open(io.BytesIO(content), memmap=False) as hdus:
        h = hdus['IMAGE'].header
        if 'TAN-SIP' not in h['CTYPE1'] or 'TAN-SIP' not in h['CTYPE2']:
            raise ValueError('Expected explicit TAN-SIP astrometry for this verified pair.')
        if str(h.get('BUNIT', '')).replace(' ', '').lower() != 'mjy/sr':
            raise ValueError('Unexpected surface-brightness unit.')
        sky_wcs = WCS(h).celestial
        data, variance = hdus['IMAGE'].data, hdus['VARIANCE'].data
        yy, xx = np.indices(data.shape)
        ra, dec = sky_wcs.pixel_to_world_values(xx, yy)
        dx, dy = SkyCoord(RA*u.deg, DEC*u.deg).spherical_offsets_to(SkyCoord(ra*u.deg, dec*u.deg))
        footprint = (np.abs(dx.arcsec) <= FOV*30) & (np.abs(dy.arcsec) <= FOV*30)
        mask = footprint & quality_mask(data, hdus['FLAGS'].data, variance)
        zodi = hdus['ZODI'].data
        mask &= np.isfinite(zodi)
        if mask.sum() < 64:
            raise ValueError('Insufficient native-pixel coverage for the field summary.')
        cx, cy = sky_wcs.world_to_pixel_values(RA, DEC)
        center_wave, center_band = calibrated_values(h, np.array([cx]), np.array([cy]), calibration)
        common = build_tan_wcs(RA, DEC, 128, 128, FOV*60/128)
        gy, gx = np.indices((128, 128))
        sx, sy = sky_wcs.world_to_pixel_values(*common.pixel_to_world_values(gx, gy))
        wave, band = calibrated_values(h, sx, sy, calibration)
        # A geometric round-trip check detects transform failure, not absolute
        # astrometric correctness. No star registration or motion fit is claimed.
        rx, ry = common.world_to_pixel_values(*sky_wcs.pixel_to_world_values(sx, sy))
        summary = {
            'date': h['DATE-OBS'], 'endDate': h['DATE-END'],
            'mjd': float(h['MJD-OBS']), 'unit': str(h['BUNIT']),
            'native_valid_pixels': int(mask.sum()),
            'native_field_pixels': int(footprint.sum()),
            'center_wavelength_um': float(center_wave[0]),
            'center_bandwidth_um': float(center_band[0]),
            'field_median_mjy_sr': float(np.median(data[mask])),
            'zodi_model_median_mjy_sr': float(np.median(zodi[mask])),
            'zodi_subtracted_median_mjy_sr': float(np.median((data-zodi)[mask])),
            'median_pixel_statistical_sigma_mjy_sr': float(np.median(np.sqrt(variance[mask]))),
            'wcs_roundtrip_max_grid_pixels': float(np.max(np.hypot(rx-gx, ry-gy))),
            'celestial_wcs': [h['CTYPE1'], h['CTYPE2']],
            'fits_sha256': hashlib.sha256(content).hexdigest(),
        }
        return summary, wave, band


async def verify(cache_dir):
    cache_dir.mkdir(parents=True, exist_ok=True)
    cal_path = cache_dir / CALIBRATION.rsplit('/', 1)[-1]
    if not cal_path.exists():
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.get(CALIBRATION)
            response.raise_for_status()
            cal_path.write_bytes(response.content)
    raw = []
    for _, url in INPUTS:
        path = cache_dir / f'{FOV}arcmin-{url.rsplit("/", 1)[-1]}'
        if not path.exists():
            path.write_bytes(await download_fits(url, RA, DEC, FOV*1.45/60))
        raw.append(path.read_bytes())
    with fits.open(cal_path, memmap=False) as calibration:
        analysed = [analyse_native(content, calibration) for content in raw]
    previews = [decode_image(content, RA, DEC, FOV) for content in raw]
    pixels = [np.asarray(image['pixels'], dtype=float) for image in previews]
    overlap = np.isfinite(pixels[0]) & np.isfinite(pixels[1])
    _, wa, ba = analysed[0]
    _, wb, bb = analysed[1]
    good = compatible(wa, ba, wb, bb)
    spectral = [np.asarray(image['spectral'], dtype=float) for image in previews]
    preview_good = compatible(spectral[0][..., 0], spectral[0][..., 1],
                              spectral[1][..., 0], spectral[1][..., 1])
    records = [dict(item[0], id=identity, url=url, minUm=1.6301, maxUm=2.4346)
               for item, (identity, url) in zip(analysed, INPUTS)]
    a, b = records
    field_change = b['field_median_mjy_sr']-a['field_median_mjy_sr']
    zodi_change = b['zodi_model_median_mjy_sr']-a['zodi_model_median_mjy_sr']
    corrected_change = b['zodi_subtracted_median_mjy_sr']-a['zodi_subtracted_median_mjy_sr']
    # This descriptive consistency check does not test statistical significance.
    foreground_consistent = field_change < 0 and zodi_change < 0 and abs(corrected_change) < .5*abs(field_change)
    if not foreground_consistent:
        raise ValueError('The downloaded data no longer support the recorded foreground interpretation; review before updating the UI evidence.')
    result = {
        'id': 'matched-infrared-field', 'title': 'Did the field fade?',
        'question': 'Did the field become darker, or did foreground light change?',
        'verified_at': datetime.now(timezone.utc).isoformat(),
        'ra': RA, 'dec': DEC, 'fov_arcmin': FOV, 'inputs': records,
        'calibration_url': CALIBRATION,
        'calibration_sha256': hashlib.sha256(cal_path.read_bytes()).hexdigest(),
        'elapsed_days': b['mjd']-a['mjd'],
        'shared_valid_grid_pixels': int(overlap.sum()),
        'total_grid_pixels': int(overlap.size),
        'calibrated_bandpass_compatible_fraction': float(good[overlap].mean()),
        'calibrated_max_wavelength_difference_um': float(np.max(np.abs(wa-wb)[overlap])),
        'preview_subtraction_gate_passes': bool(overlap.sum() >= 64 and preview_good[overlap].all()),
        'calibrated_bandpass_gate_passes': bool(overlap.sum() >= 64 and good[overlap].all()),
        'field_median_change_mjy_sr': field_change,
        'zodi_model_change_mjy_sr': zodi_change,
        'zodi_subtracted_median_change_mjy_sr': corrected_change,
        'conclusion': 'The later field is dimmer. Most of the field-median difference is consistent with the supplied zodiacal foreground model. This does not establish a fading star or motion.',
        'method': f'Same fixed {FOV}-arcmin sky field. Quality-masked native-pixel medians, separately calculated for IMAGE, ZODI and IMAGE minus ZODI. Calibrated CWAVE/CBAND checked on the common sky grid. Display previews are interpolated separately; 128×128 grid pixels are not independent measurements.',
        'limitations': 'Descriptive field medians, not aperture/PSF photometry. ZODI is a model, not an independent observation. Band-center/width agreement does not establish identical full spectral response. No empirical star registration, PSF matching, calibration-systematic or uncertainty propagation, variability significance or proper-motion fit. WCS round-trip verifies numerical consistency only. Coordinates identify a reference field, not an epoch-corrected position of Barnard’s Star.',
        'reference': 'https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products/',
    }
    if not result['calibrated_bandpass_gate_passes'] or not result['preview_subtraction_gate_passes']:
        raise ValueError('The selected pair no longer passes wavelength compatibility checks.')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache-dir', type=Path, default=Path('backend/cache/investigation'))
    parser.add_argument('--output', type=Path, default=Path('frontend/src/data/investigation.json'))
    args = parser.parse_args()
    evidence = asyncio.run(verify(args.cache_dir))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(evidence, indent=2, allow_nan=False)+'\n')
    print(json.dumps(evidence, indent=2, allow_nan=False))
