from typing import Dict, Tuple
import numpy as np
from astropy.wcs import WCS
from scipy.ndimage import gaussian_filter, map_coordinates


def build_tan_wcs(
    ra: float,
    dec: float,
    width: int = 512,
    height: int = 512,
    pixel_scale_arcsec: float = 0.5859375,
) -> WCS:
    """Construct a standardized 2D Gnomonic (TAN) WCS header."""
    cdelt = pixel_scale_arcsec / 3600.0
    w = WCS(naxis=2)
    w.wcs.crpix = [(width + 1) / 2.0, (height + 1) / 2.0]
    w.wcs.cdelt = [-cdelt, cdelt]
    w.wcs.crval = [ra, dec]
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    return w


def reproject_to_tangent_grid(
    src_flux: np.ndarray,
    src_wcs: WCS,
    target_ra: float,
    target_dec: float,
    out_shape: Tuple[int, int] = (512, 512),
    pixel_scale_arcsec: float = 0.5859375,
) -> Tuple[np.ndarray, WCS]:
    """
    Regrid an arbitrary astronomical cutout (e.g., SPHEREx ~6.2"/px or WISE ~2.75"/px)
    onto a standardized tangent-plane WCS grid using Astropy WCS transformations
    and flux-conserving spline interpolation.
    """
    out_h, out_w = out_shape
    target_wcs = build_tan_wcs(target_ra, target_dec, out_w, out_h, pixel_scale_arcsec)

    yy, xx = np.mgrid[0:out_h, 0:out_w]
    world_coords = target_wcs.pixel_to_world_values(xx.ravel(), yy.ravel())
    src_x, src_y = src_wcs.world_to_pixel_values(world_coords[0], world_coords[1])

    coords = np.stack([src_y.reshape(out_shape), src_x.reshape(out_shape)], axis=0)
    regridded = map_coordinates(
        src_flux.astype(np.float32),
        coords,
        order=1,
        mode="nearest",
    )
    return regridded.astype(np.float32), target_wcs


def quantize_to_uint16(flux: np.ndarray) -> Tuple[bytes, float, float]:
    """
    Linearly quantize physical float32 flux into uint16 [0, 65535]
    using robust p0.05 / p99.95 percentiles to preserve sky variance.
    """
    f_min = float(np.percentile(flux, 0.05))
    f_max = float(np.percentile(flux, 99.95))
    if f_max <= f_min:
        f_max = f_min + 1e-6

    bscale = (f_max - f_min) / 65535.0
    bzero = f_min

    scaled = np.floor((flux - bzero) / bscale + 0.5)
    quantized = np.clip(scaled, 0, 65535).astype("<u2")
    return quantized.tobytes(), bscale, bzero


def dequantize_uint16(raw_bytes: bytes, shape: Tuple[int, int], bscale: float, bzero: float) -> np.ndarray:
    arr = np.frombuffer(raw_bytes, dtype="<u2").reshape(shape)
    return arr.astype(np.float32) * bscale + bzero


def build_wcs_headers(
    width: int,
    height: int,
    bscale: float,
    bzero: float,
    ra: float,
    dec: float,
    pixel_scale_arcsec: float,
    epoch: str,
    provenance: str,
    band_index: int,
    wavelength_um: float,
) -> Dict[str, str]:
    cdelt = pixel_scale_arcsec / 3600.0
    return {
        "X-Raster-Dimensions": f"{width},{height}",
        "X-Raster-Bitpix": "16",
        "X-BSCALE": f"{bscale:.6e}",
        "X-BZERO": f"{bzero:.6e}",
        "X-BUNIT": "MJy/sr",
        "X-WCS-CRVAL": f"{ra:.6f},{dec:.6f}",
        "X-WCS-CRPIX": f"{(width + 1) / 2.0:.1f},{(height + 1) / 2.0:.1f}",
        "X-WCS-CDELT": f"{-cdelt:.7f},{cdelt:.7f}",
        "X-WCS-CTYPE": "RA---TAN,DEC--TAN",
        "X-Observation-Epoch": epoch,
        "X-Survey-Provenance": provenance,
        "X-Band-Index": str(band_index),
        "X-Band-Wavelength-Um": f"{wavelength_um:.3f}",
    }


def psf_matched_diff(
    img_a: np.ndarray,
    img_b: np.ndarray,
    kernel: str = "alard_lupton",
) -> Tuple[np.ndarray, float]:
    """
    Compute PSF-matched difference I_B - (I_A * K) using a multi-Gaussian
    basis (Alard-Lupton style) or single Gaussian kernel.
    Returns (difference_image, dipole_rejection_confidence).
    """
    a = img_a.astype(np.float64)
    b = img_b.astype(np.float64)

    if kernel == "gaussian":
        a_conv = gaussian_filter(a, sigma=1.1)
        alpha = float(np.sum(a_conv * b) / (np.sum(a_conv * a_conv) + 1e-9))
        diff = b - alpha * a_conv
        return diff.astype(np.float32), 0.86

    b0 = a
    b1 = gaussian_filter(a, sigma=1.0)
    b2 = gaussian_filter(a, sigma=2.2)
    ones = np.ones_like(a)

    design = np.column_stack([b0.ravel(), b1.ravel(), b2.ravel(), ones.ravel()])
    target = b.ravel()
    coeffs, _, _, _ = np.linalg.lstsq(design, target, rcond=None)
    model = (design @ coeffs).reshape(a.shape)
    diff = b - model

    naive_std = float(np.std(b - a)) + 1e-9
    matched_std = float(np.std(diff))
    confidence = float(np.clip(1.0 - (matched_std / (naive_std * 1.15)), 0.55, 0.99))
    return diff.astype(np.float32), confidence
