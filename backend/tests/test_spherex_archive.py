import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import io
import numpy as np
import pytest
from astropy.io import fits
from spherex_archive import valid_url, decode_image


def test_only_irsa_spherex_dr1_fits_urls():
    assert valid_url('https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/example.fits')
    for url in ['http://localhost/a.fits', 'https://irsa.ipac.caltech.edu.evil.com/ibe/data/spherex/dr1/level2/a.fits', 'https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/../a.fits', 'https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/a.fits?x=1']:
        assert not valid_url(url)


def test_native_pixels_units_and_missing_values_preserved():
    image = fits.ImageHDU(np.array([[1., np.nan], [-2., 4.]]), name='IMAGE')
    image.header['BUNIT'] = 'MJy / sr'
    stream = io.BytesIO()
    fits.HDUList([fits.PrimaryHDU(), image]).writeto(stream)
    result = decode_image(stream.getvalue())
    assert result['pixels'] == [[1., None], [-2., 4.]]
    assert result['unit'] == 'MJy / sr'
    assert result['width'] == result['height'] == 2


def test_missing_science_extension_rejected():
    stream = io.BytesIO()
    fits.PrimaryHDU(np.zeros((2, 2))).writeto(stream)
    with pytest.raises(KeyError):
        decode_image(stream.getvalue())


def test_common_grid_preserves_empty_coverage_and_sky_center():
    from wcs_pipeline import build_tan_wcs
    image = fits.ImageHDU(np.ones((9, 9)), header=build_tan_wcs(10, 20, 9, 9, 6).to_header(), name='IMAGE')
    stream = io.BytesIO()
    fits.HDUList([fits.PrimaryHDU(), image]).writeto(stream)
    aligned = decode_image(stream.getvalue(), 10, 20, 5)
    assert aligned['width'] == aligned['height'] == 128
    assert aligned['pixels'][64][64] == pytest.approx(1)
    assert aligned['pixels'][0][0] is None
    assert 'bilinear' in aligned['processing']


def test_archive_cache_coalesces_requests_and_does_not_cache_failures():
    import asyncio
    from spherex_archive import cached_archive
    async def scenario():
        calls = []
        @cached_archive(2, 60)
        async def fetch(key):
            calls.append(key)
            await asyncio.sleep(.001)
            if key == 'bad':
                raise ValueError('unavailable')
            return {'key': key}
        results = await asyncio.gather(fetch('a'), fetch('a'))
        assert results == [{'key': 'a'}, {'key': 'a'}]
        assert calls == ['a']
        assert await fetch('a') == {'key': 'a'}
        assert calls == ['a']
        for _ in range(2):
            with pytest.raises(ValueError):
                await fetch('bad')
        assert calls == ['a', 'bad', 'bad']
        await fetch('b')
        await fetch('c')
        await fetch('a')
        assert calls.count('a') == 2
    asyncio.run(scenario())


def test_native_spectral_sample_rejects_flagged_pixel():
    from spherex_archive import extract_sample
    from wcs_pipeline import build_tan_wcs
    header = build_tan_wcs(10, 20, 3, 3, 6).to_header()
    image = fits.ImageHDU(np.ones((3, 3)), header=header, name='IMAGE')
    stream = io.BytesIO()
    fits.HDUList([fits.PrimaryHDU(), image, fits.ImageHDU(np.ones((3, 3), dtype=np.int32), name='FLAGS'), fits.ImageHDU(np.ones((3, 3)), name='VARIANCE')]).writeto(stream)
    # Reject quality flags before attempting to interpret a spectral WCS.
    assert extract_sample(stream.getvalue(), 10, 20) is None


def test_source_flag_is_informational_and_variance_is_preserved(monkeypatch):
    import spherex_archive
    from types import SimpleNamespace
    from wcs_pipeline import build_tan_wcs
    real_wcs = spherex_archive.WCS
    def wcs(header, *args, **kwargs):
        if kwargs.get('key') == 'W':
            return SimpleNamespace(sip=None, all_pix2world=lambda pixels, origin: np.array([[3.05, .08]]))
        return real_wcs(header)
    monkeypatch.setattr(spherex_archive, 'WCS', wcs)
    image = fits.ImageHDU(np.full((3, 3), 4.), header=build_tan_wcs(10, 20, 3, 3, 6).to_header(), name='IMAGE')
    image.header['BUNIT'] = 'MJy / sr'
    stream = io.BytesIO()
    fits.HDUList([fits.PrimaryHDU(), image, fits.ImageHDU(np.full((3, 3), 1 << 21, dtype=np.int32), name='FLAGS'), fits.ImageHDU(np.full((3, 3), .25), name='VARIANCE')]).writeto(stream)
    sample = spherex_archive.extract_sample(stream.getvalue(), 10, 20)
    assert sample['flux'] == 4
    assert sample['sigma'] == .5
    assert sample['wavelength'] == 3.05
    assert sample['flags'] == 1 << 21
