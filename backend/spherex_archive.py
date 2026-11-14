import asyncio
import time
from collections import OrderedDict
from functools import wraps
from contextlib import AsyncExitStack


def cached_archive(limit, ttl):
    """Bound successful results and coalesce concurrent identical archive requests."""
    def decorate(function):
        results, pending = OrderedDict(), {}
        @wraps(function)
        async def wrapped(*args):
            now = time.monotonic()
            if args in results:
                saved, value = results[args]
                if now - saved < ttl:
                    results.move_to_end(args)
                    return value
                del results[args]
            if args not in pending:
                async def work():
                    try:
                        value = await function(*args)
                        results[args] = (time.monotonic(), value)
                        while len(results) > limit:
                            results.popitem(last=False)
                        return value
                    finally:
                        pending.pop(args, None)
                pending[args] = asyncio.create_task(work())
            return await asyncio.shield(pending[args])
        return wrapped
    return decorate

"""IRSA SIA2 discovery and native spectral image cutouts. No simulated fallback."""
import io
from urllib.parse import urlparse
import httpx
import numpy as np
from astropy.io import fits
from astropy.io.votable import parse_single_table
from astropy.time import Time
from astropy.wcs import WCS
from scipy.ndimage import map_coordinates
from wcs_pipeline import build_tan_wcs

SIA = 'https://irsa.ipac.caltech.edu/SIA'


def fill_isolated_nans(arr):
    nan_mask = ~np.isfinite(arr)
    if not nan_mask.any():
        return arr
    from scipy.ndimage import generic_filter
    finite_count = generic_filter(np.isfinite(arr).astype(float), np.sum, size=3, mode='constant', cval=0)
    sum_neighbors = generic_filter(np.nan_to_num(arr), np.sum, size=3, mode='constant', cval=0)
    fill_mask = nan_mask & (finite_count >= 3)
    if not fill_mask.any():
        return arr
    out = arr.copy()
    out[fill_mask] = sum_neighbors[fill_mask] / np.maximum(finite_count[fill_mask], 1)
    return out


@cached_archive(64, 600)
async def discover(ra, dec):
    last_error = None
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=45) as client:
                response = await client.get(SIA, params={'COLLECTION': 'spherex_dr1', 'POS': f'circle {ra} {dec} 0.001'})
                if response.status_code in (502, 503, 504) and attempt < 2:
                    await asyncio.sleep(1.0 * (attempt + 1))
                    continue
                response.raise_for_status()
            table = parse_single_table(io.BytesIO(response.content)).to_table(use_names_over_ids=True)
            records = []
            for row in table:
                url = str(row['access_url'])
                if not valid_url(url):
                    continue
                records.append({'url': url, 'id': str(row['obs_id']), 'mjd': float(row['t_min']), 'date': Time(float(row['t_min']), format='mjd').isot, 'endDate': Time(float(row['t_max']), format='mjd').isot, 'minUm': float(row['em_min']) * 1e6, 'maxUm': float(row['em_max']) * 1e6})
            return sorted(records, key=lambda item: (item['mjd'], item['url']))[:300]
        except (httpx.HTTPStatusError, httpx.RequestError) as err:
            last_error = err
            if attempt < 2:
                await asyncio.sleep(1.0 * (attempt + 1))
                continue
            raise
    if last_error:
        raise last_error


def valid_url(url):
    parsed = urlparse(url)
    return parsed.scheme == 'https' and parsed.netloc == 'irsa.ipac.caltech.edu' and parsed.path.startswith('/ibe/data/spherex/dr1/level2/') and parsed.path.endswith('.fits') and not parsed.query and not parsed.fragment and '..' not in parsed.path


def decode_image(content, ra=None, dec=None, fov=5):
    with fits.open(io.BytesIO(content), memmap=False) as hdus:
        image = hdus['IMAGE']
        data = np.asarray(image.data, dtype=float)
        if data.ndim != 2 or data.size > 1_000_000:
            raise ValueError('Unexpected spectral image dimensions.')
        quality_applied = 'FLAGS' in hdus and 'VARIANCE' in hdus
        if quality_applied:
            flags = np.asarray(hdus['FLAGS'].data, dtype=np.int64)
            variance = np.asarray(hdus['VARIANCE'].data, dtype=float)
            valid = ((flags & ~((1 << 21) | (1 << 12))) == 0) & np.isfinite(variance) & (variance >= 0)
            data = np.where(valid, data, np.nan)
        spectral = None
        processing = 'Native cutout; not aligned.'
        if ra is not None and dec is not None:
            source_wcs = WCS(image.header).celestial
            target = build_tan_wcs(ra, dec, 128, 128, fov * 60 / 128)
            yy, xx = np.mgrid[:128, :128]
            sky = target.pixel_to_world_values(xx, yy)
            sx, sy = source_wcs.world_to_pixel_values(*sky)
            # Missing/invalid support stays missing; no zero-filled sky outside coverage.
            coords = np.array([sy, sx])
            support = map_coordinates(np.isfinite(data).astype(float), coords, order=1, mode='constant', cval=0)
            sampled = map_coordinates(np.nan_to_num(data), coords, order=1, mode='constant', cval=0)
            valid_support = support > 0.05
            data = np.where(valid_support, sampled / np.maximum(support, 1e-6), np.nan)
            data = fill_isolated_nans(data)
            try:
                wave = WCS(image.header, hdus, key='W')
                wave.sip = None
                values = wave.all_pix2world(np.column_stack([sx.ravel(), sy.ravel()]), 0).reshape(128, 128, 2)
                spectral = np.where(np.isfinite(values), values, None).tolist()
            except (KeyError, ValueError, TypeError):
                spectral = None
            processing = '128 × 128 common north-up TAN grid; bilinear interpolation, not integrated-flux conserving. Shared display stretch for comparisons. Statistical uncertainties are not propagated through resampling.'
        finite = np.isfinite(data)
        # Preserve invalid pixels as null, not a fabricated zero measurement.
        pixels = np.where(finite, data, None).tolist()
        return {'pixels': pixels, 'spectral': spectral, 'qualityApplied': quality_applied, 'width': data.shape[1], 'height': data.shape[0], 'unit': str(image.header.get('BUNIT', 'unknown')), 'wcs': image.header.tostring(sep='\n'), 'extensions': [h.name for h in hdus], 'uncertainty': 'Statistical errors are not propagated through preview interpolation', 'processing': processing + (' Quality flags and invalid variances masked.' if quality_applied else ' Quality assessment unavailable.')}

@cached_archive(32, 3600)
async def cutout(url, ra, dec, fov):
    if not valid_url(url):
        raise ValueError('Only SPHEREx DR1 spectral image URLs from IRSA are accepted.')
    content = await download_fits(url, ra, dec, (fov * 1.45) / 60)
    return await asyncio.to_thread(decode_image, content, ra, dec, fov)


async def download_fits(url, ra, dec, size, shared_client=None):
    if not valid_url(url):
        raise ValueError('Only SPHEREx DR1 spectral image URLs from IRSA are accepted.')
    last_error = None
    for attempt in range(3):
        try:
            async with AsyncExitStack() as stack:
                client = shared_client or await stack.enter_async_context(httpx.AsyncClient(timeout=30))
                async with client.stream('GET', url, params={'center': f'{ra},{dec}', 'size': size}) as response:
                    if response.status_code in (502, 503, 504) and attempt < 2:
                        await asyncio.sleep(1.0 * (attempt + 1))
                        continue
                    response.raise_for_status()
                    content = bytearray()
                    async for chunk in response.aiter_bytes():
                        content.extend(chunk)
                        if len(content) > 32_000_000:
                            raise ValueError('Archive cutout exceeds the 32 MB limit.')
                    return bytes(content)
        except (httpx.HTTPStatusError, httpx.RequestError) as err:
            last_error = err
            if attempt < 2:
                await asyncio.sleep(1.0 * (attempt + 1))
                continue
            raise
    if last_error:
        raise last_error


def extract_sample(content, ra, dec):
    """Nearest native pixel: no aperture/PSF photometry or abundance inference."""
    with fits.open(io.BytesIO(content), memmap=False) as hdus:
        image = hdus['IMAGE']
        x, y = WCS(image.header).celestial.world_to_pixel_values(ra, dec)
        if not np.all(np.isfinite([x, y])):
            return None
        ix, iy = int(np.rint(x)), int(np.rint(y))
        if not (0 <= iy < image.data.shape[0] and 0 <= ix < image.data.shape[1]):
            return None
        flux = float(image.data[iy, ix])
        variance = float(hdus['VARIANCE'].data[iy, ix])
        flag = int(hdus['FLAGS'].data[iy, ix])
        if (flag & ~((1 << 21) | (1 << 12))) != 0 or not np.isfinite(flux) or not np.isfinite(variance) or variance < 0:
            return None
        wave_wcs = WCS(image.header, hdus, key='W')
        wave_wcs.sip = None  # SIP belongs to celestial WCS, not spectral lookup coordinates.
        wavelength, bandwidth = wave_wcs.all_pix2world([[ix, iy]], 0)[0]
        if (flag & ~((1 << 21) | (1 << 12))) != 0 or not np.all(np.isfinite([flux, variance, wavelength, bandwidth])) or variance < 0:
            return None
        if not (.75 <= wavelength <= 5) or bandwidth <= 0:
            return None
        unit = str(image.header.get('BUNIT', 'unknown'))
        if unit.replace(' ', '') != 'MJy/sr':
            return None
        return {'wavelength': float(wavelength), 'bandwidth': float(bandwidth), 'flux': flux, 'sigma': float(np.sqrt(variance)), 'unit': unit, 'flags': flag}


@cached_archive(32, 600)
async def spectral_samples(ra, dec):
    async for update in spectral_sample_updates(ra, dec):
        result = update
    return result


_sample_results = OrderedDict()


async def spectral_sample_updates(ra, dec):
    key = (ra, dec)
    hit = _sample_results.get(key)
    if hit and time.monotonic() - hit[0] < 600:
        yield hit[1]
        return
    records = await discover(ra, dec)
    # Bounded exploratory sampling, not a complete 102-channel reconstructed spectrum.
    ordered = sorted(records, key=lambda r: (r['minUm'], r['mjd']))
    indices = np.linspace(0, len(ordered) - 1, min(12, len(ordered)), dtype=int) if ordered else []
    chosen = [ordered[int(i)] for i in indices]
    semaphore = asyncio.Semaphore(6)
    failures = []
    async def sample(record):
        try:
            async with semaphore:
                # Tiny (18 arcsec) cutouts intermittently fail in IRSA's service.
                # A 1.2 arcmin stamp is more reliable; only the same nearest native pixel is measured.
                content = await download_fits(record['url'], ra, dec, .02, client)
                value = await asyncio.to_thread(extract_sample, content, ra, dec)
                return dict(value, date=record['date'], source=record['url']) if value else None
        except Exception:
            failures.append(record['url'])
            return None
    values = []
    def snapshot(complete):
        return {'samples': sorted([v for v in values if v], key=lambda v: v['wavelength']), 'attempted': len(chosen), 'processed': len(values), 'unavailable': len(failures), 'rejected': sum(v is None for v in values), 'complete': complete, 'method': 'Nearest quality-checked native pixel. Statistical uncertainty is sqrt(VARIANCE). Background is not subtracted. Visualization wavelength lookup; no source photometry or chemical fit. Up to 12 exposures.'}
    async with httpx.AsyncClient(timeout=20) as client:
        tasks = [asyncio.create_task(sample(record)) for record in chosen]
        try:
            yield snapshot(False)
            for task in asyncio.as_completed(tasks):
                values.append(await task)
                if len(values) < len(chosen):
                    yield snapshot(False)
            if chosen and len(failures) == len(chosen):
                raise RuntimeError('SPHEREx cutout requests failed. Retry shortly.')
            result = snapshot(True)
            _sample_results[key] = (time.monotonic(), result)
            _sample_results.move_to_end(key)
            while len(_sample_results) > 32:
                _sample_results.popitem(last=False)
            yield result
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
