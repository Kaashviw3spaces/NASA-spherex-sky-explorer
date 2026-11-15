import numpy as np
from wcs_pipeline import psf_matched_diff


def test_psf_fit_excludes_missing_pixels_and_recovers_scaled_background():
    rng = np.random.default_rng(4)
    a = rng.normal(2, .2, (32, 32))
    b = 1.3*a + .7
    a[:6] = np.nan
    b[:, :4] = np.nan
    diff, _ = psf_matched_diff(a, b)
    valid = np.isfinite(a) & np.isfinite(b)
    assert np.isnan(diff[~valid]).all()
    assert np.max(np.abs(diff[valid])) < 1e-5
