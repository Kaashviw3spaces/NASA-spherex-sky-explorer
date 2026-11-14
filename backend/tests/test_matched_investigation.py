import sys
from pathlib import Path
from types import SimpleNamespace

import numpy as np
from astropy.io import fits
from astropy.wcs import Sip

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from verify_matched_investigation import quality_mask, compatible, calibrated_values
from wcs_pipeline import build_tan_wcs


def test_field_statistics_reject_bad_flags_and_invalid_variance():
    image = np.ones(6)
    flags = np.array([0, 1 << 21, 1 << 12, 1, 0, 0])
    variance = np.array([1, 1, 1, 1, -1, np.nan])
    assert quality_mask(image, flags, variance).tolist() == [True, True, True, False, False, False]


def test_compatibility_requires_bandwidth_as_well_as_wavelength():
    a = np.array([2., 2., 2., np.nan])
    assert compatible(a, .05, np.array([2.001, 2.01, 2., 2.]),
                      np.array([.05, .05, .08, .05])).tolist() == [True, False, False, False]


def test_calibration_detector_coordinates_do_not_apply_celestial_sip():
    wcs = build_tan_wcs(10, 20, 4, 4, 6)
    a = np.zeros((3, 3)); a[2, 0] = .2
    b = np.zeros((3, 3)); b[0, 2] = .2
    wcs.sip = Sip(a, b, None, None, wcs.wcs.crpix)
    header = wcs.to_header(relax=True)
    for axis in (1, 2):
        header[f'CTYPE{axis}A'] = 'LINEAR'
        header[f'CRPIX{axis}A'] = 1.
        header[f'CRVAL{axis}A'] = 0.
        header[f'CDELT{axis}A'] = 1.
    grid = np.arange(16, dtype=float).reshape(4, 4)
    calibration = {'CWAVE': SimpleNamespace(data=grid), 'CBAND': SimpleNamespace(data=grid/100)}
    wave, band = calibrated_values(header, np.array([1.]), np.array([1.]), calibration)
    assert wave[0] == 5.
    assert band[0] == .05
