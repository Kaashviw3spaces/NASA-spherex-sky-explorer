from urllib.parse import quote
from dataclasses import dataclass
import logging
import math
import re
from typing import Dict, Optional
import httpx
import numpy as np


logger = logging.getLogger(__name__)
UNWISE_RELEASES = ("allwise", "neo2", "neo5", "neo7")


@dataclass
class CutoutProduct:
    pixels: np.ndarray
    data_kind: str
    provenance: str
    release: str
    band: int
    wavelength_um: float
    epoch: str = "unknown"
    bunit: str = "unknown"
    source_url: str = ""
    is_reprojected: bool = False


BENCHMARK_CATALOG: Dict[str, dict] = {
    "barnard's star": {"ra": 269.4521, "dec": 4.6934, "dx": 5.5, "dy": -16.5, "var": 0.04, "stars": 42, "peak": 42.8},
    "wise 0855": {"ra": 133.7951, "dec": -7.2451, "dx": -15.0, "dy": 4.5, "var": 0.08, "stars": 42, "peak": 3.4},
    "epsilon indi b": {"ra": 331.0764, "dec": -56.7831, "dx": 9.0, "dy": -6.5, "var": 0.06, "stars": 42, "peak": 18.6},
    "rw aurigae": {"ra": 76.9565, "dec": 30.4014, "dx": 0.2, "dy": 0.1, "var": -0.52, "stars": 36, "peak": 64.2},
    "r draconis": {"ra": 248.1633, "dec": 66.7519, "dx": 0.0, "dy": 0.0, "var": 0.68, "stars": 38, "peak": 112.5},
    "unwise fallback": {"ra": 266.4168, "dec": -29.0078, "dx": 3.5, "dy": 2.5, "var": 0.18, "stars": 110, "peak": 28.0},
}


def _match_benchmark(ra: float, dec: float) -> dict:
    for item in BENCHMARK_CATALOG.values():
        if abs(item["ra"] - ra) < 0.05 and abs(item["dec"] - dec) < 0.05:
            return item
    # Static background field for arbitrary non-benchmark sky coordinates
    return {"dx": 0.0, "dy": 0.0, "var": 0.0, "stars": 45}


def check_spherex_moc(ra: float, dec: float) -> dict:
    """Legacy endpoint: report latitude only; no SPHEREx coverage map is loaded."""
    ra_rad = math.radians(ra)
    dec_rad = math.radians(dec)
    ngp_ra = math.radians(192.85948)
    ngp_dec = math.radians(27.12825)
    sin_b = (
        math.sin(dec_rad) * math.sin(ngp_dec)
        + math.cos(dec_rad) * math.cos(ngp_dec) * math.cos(ra_rad - ngp_ra)
    )
    gal_b = math.degrees(math.asin(max(-1.0, min(1.0, sin_b))))
    return {
        "spherex_covered": None,
        "coverage_status": "unavailable",
        "message": "No verified SPHEREx footprint is loaded. Latitude is not survey coverage.",
        "primary_survey_epochs": [],
        "unwise_fallback_available": None,
        "moc_order": None,
        "galactic_b_deg": round(gal_b, 3),
    }



async def resolve_target_query(query: str) -> Optional[dict]:
    q = query.strip()
    if not q:
        return None

    lower = q.lower()
    if lower in BENCHMARK_CATALOG:
        item = BENCHMARK_CATALOG[lower]
        cov = check_spherex_moc(item["ra"], item["dec"])
        return {"name": q, "ra": item["ra"], "dec": item["dec"], **cov}

    m = re.match(r"^([+-]?\d+(?:\.\d+)?)[,\s]+([+-]?\d+(?:\.\d+)?)$", q)
    if m:
        ra = float(m.group(1)) % 360.0
        dec = float(m.group(2))
        if not math.isfinite(ra) or not math.isfinite(dec) or abs(dec) > 90:
            return None
        cov = check_spherex_moc(ra, dec)
        return {"name": f"J{ra:.3f}{dec:+.3f}", "ra": ra, "dec": dec, **cov}

    hms = re.match(
        r"^(\d{1,2})[:\s](\d{1,2})[:\s](\d{1,2}(?:\.\d+)?)[,\s]+([+-]?\d{1,2})[:\s](\d{1,2})[:\s](\d{1,2}(?:\.\d+)?)$",
        q,
    )
    if hms:
        ra = ((int(hms.group(1)) + int(hms.group(2)) / 60 + float(hms.group(3)) / 3600) * 15.0) % 360.0
        sign = -1.0 if hms.group(4).startswith("-") else 1.0
        dec = sign * (abs(int(hms.group(4))) + int(hms.group(5)) / 60 + float(hms.group(6)) / 3600)
        if (int(hms.group(1)) > 23 or int(hms.group(2)) > 59 or float(hms.group(3)) >= 60
                or int(hms.group(5)) > 59 or float(hms.group(6)) >= 60 or abs(dec) > 90):
            return None
        cov = check_spherex_moc(ra, dec)
        return {"name": q, "ra": round(ra, 6), "dec": round(dec, 6), **cov}

    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            resp = await client.get(f"https://cds.unistra.fr/cgi-bin/nph-sesame/-oxp/SNV?{quote(q, safe='')}")
            if resp.status_code == 200:
                jra = re.search(r"<jradeg>([0-9.\-]+)</jradeg>", resp.text)
                jdec = re.search(r"<jdedeg>([0-9.\-]+)</jdedeg>", resp.text)
                if jra and jdec:
                    ra = float(jra.group(1)) % 360.0
                    dec = float(jdec.group(1))
                    cov = check_spherex_moc(ra, dec)
                    return {"name": q, "ra": ra, "dec": dec, **cov}
    except Exception:
        return None

    return None


async def query_irsa_tap(
    ra: float,
    dec: float,
    radius_arcsec: float = 12.4,
    table: str = "allwise_p3as_psd",
) -> dict:
    """
    Live NASA/IPAC IRSA TAP query hook for astronomical infrared catalog tables such as AllWISE and 2MASS.
    Dynamically adapts requested columns depending on target catalog table.
    """
    radius_deg = max(0.0001, min(0.1, radius_arcsec / 3600.0))
    table_lower = table.lower()
    if "allwise" in table_lower or "wise" in table_lower:
        columns = "ra, dec, w1mpro, w2mpro"
    else:
        columns = "ra, dec"

    adql = (
        f"SELECT TOP 10 {columns} FROM {table} "
        f"WHERE CONTAINS(POINT('J2000', ra, dec), CIRCLE('J2000', {ra:.5f}, {dec:.5f}, {radius_deg:.6f})) = 1"
    )
    url = "https://irsa.ipac.caltech.edu/TAP/sync"
    params = {
        "REQUEST": "doQuery",
        "LANG": "ADQL",
        "FORMAT": "json",
        "QUERY": adql,
    }

    error_msg = None
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            resp = await client.post(url, data=params)
            if resp.status_code == 200:
                data = resp.json()
                rows = data.get("data", [])
                fields = [f.get("name") for f in data.get("metadata", [])]
                sources = []
                for r in rows:
                    source_dict = dict(zip(fields, r))
                    sources.append(source_dict)
                return {
                    "status": "success",
                    "provenance": "NASA/IPAC-IRSA-TAP",
                    "table": table,
                    "target": {"ra": ra, "dec": dec, "radius_arcsec": radius_arcsec},
                    "count": len(sources),
                    "sources": sources,
                }
            else:
                error_msg = f"IRSA TAP returned HTTP {resp.status_code}"
    except httpx.TimeoutException:
        error_msg = "NASA IRSA TAP request timed out after 8.0s; no catalog results returned."
    except Exception as exc:
        error_msg = f"IRSA TAP query error: {str(exc)}"

    return {
        "status": "unavailable",
        "message": error_msg or "IRSA query unavailable.",
        "provenance": "NASA/IPAC-IRSA-TAP",
        "table": table,
        "target": {"ra": ra, "dec": dec, "radius_arcsec": radius_arcsec},
        "count": 0,
        "sources": [],
    }



def fetch_real_unwise_cutout(
    ra: float,
    dec: float,
    epoch_idx: int = 0,
    epoch_str: Optional[str] = None,
    band_index: int = 1,
    size: int = 512,
    fov_arcmin: float = 5.0,
) -> Optional[CutoutProduct]:
    """
    Fetch genuine NASA unWISE/NEOWISE all-sky infrared FITS cutouts from the unWISE archive.
    Reprojects using Astropy WCS onto standardized 512x512 tangent-plane grid.
    Returns pixels and source metadata separately; unknown units/dates remain unknown.
    """
    import io
    import tarfile
    from astropy.io import fits
    from astropy.wcs import WCS
    from wcs_pipeline import reproject_to_tangent_grid

    # Epochs identify archive releases, never fabricated observation dates.
    version = epoch_str or UNWISE_RELEASES[min(len(UNWISE_RELEASES) - 1, max(0, epoch_idx))]
    if version not in UNWISE_RELEASES:
        return None

    band = "2" if band_index > 50 else "1"

    unwise_px = int(math.ceil((fov_arcmin * 60.0) / 2.75)) + 16
    unwise_px = max(60, min(600, unwise_px))

    url = "https://unwise.me/cutout_fits"
    params = {
        "version": version,
        "ra": round(ra, 5),
        "dec": round(dec, 5),
        "size": unwise_px,
        "bands": band,
    }

    try:
        with httpx.Client(timeout=12.0, follow_redirects=True) as client:
            resp = client.get(url, params=params)
            if resp.status_code != 200 or len(resp.content) < 1000:
                return None

            with tarfile.open(fileobj=io.BytesIO(resp.content), mode="r:gz") as tar:
                for member in tar.getmembers():
                    if member.name.endswith("-img-m.fits"):
                        fits_file = tar.extractfile(member)
                        with fits.open(fits_file) as hdul:
                            raw_data = hdul[0].data
                            src_flux = np.nan_to_num(raw_data.astype(np.float32), nan=0.0, posinf=0.0, neginf=0.0)
                            src_wcs = WCS(hdul[0].header)

                            pix_scale = (fov_arcmin * 60.0) / size
                            regridded, _ = reproject_to_tangent_grid(
                                src_flux,
                                src_wcs,
                                target_ra=ra,
                                target_dec=dec,
                                out_shape=(size, size),
                                pixel_scale_arcsec=pix_scale,
                            )
                            clean_regridded = np.nan_to_num(regridded, nan=0.0, posinf=0.0, neginf=0.0).astype(np.float32)
                            header = hdul[0].header
                            return CutoutProduct(
                                pixels=clean_regridded, data_kind="observed",
                                provenance="unWISE-Archive", release=version, band=int(band),
                                wavelength_um=3.4 if band == "1" else 4.6,
                                epoch=str(header.get("DATE-OBS", "unknown")),
                                bunit=str(header.get("BUNIT", "unknown")),
                                source_url=str(resp.url), is_reprojected=True,
                            )
    except Exception:
        logger.warning("unWISE retrieval failed for release %s, band %s", version, band, exc_info=True)
        return None
    return None


def generate_calibrated_cutout(
    ra: float,
    dec: float,
    epoch_idx: int,
    band_index: int,
    size: int = 512,
    epoch_str: Optional[str] = None,
    fov_arcmin: float = 5.0,
    prefer_real: bool = True,
) -> np.ndarray:
    """
    Generate WCS-aligned 512x512 cutout.
    Attempts live fetch of genuine NASA unWISE/NEOWISE FITS observations first.
    Falls back to a deterministic educational simulation if the archive is unavailable.
    Legacy pixel-only helper; API callers use generate_cutout_product for provenance.
    """
    if prefer_real:
        real_cutout = fetch_real_unwise_cutout(
            ra=ra,
            dec=dec,
            epoch_idx=epoch_idx,
            epoch_str=epoch_str,
            band_index=band_index,
            size=size,
            fov_arcmin=fov_arcmin,
        )
        if real_cutout is not None:
            return real_cutout.pixels

    rng = np.random.default_rng(int((ra * 1000 + abs(dec) * 100) % 2**31))
    sky = (0.11 + rng.normal(0.0, 0.01, size=(size, size))).astype(np.float32)

    # SPHEREx 102 spectrophotometric bands: 0.75 - 5.0 um
    # Handle either 0-based [0..101] or 1-based [1..102] band indices
    b_idx = max(0, min(101, band_index if band_index < 102 else band_index - 1))
    wavelength = 0.75 + (b_idx / 101.0) * (5.0 - 0.75)
    # Diffraction limit PSF width scale: lambda / D
    psf_lambda_scale = 0.8 + 0.4 * (wavelength / 2.5)

    def _splat(cx: float, cy: float, amp: float, sig: float) -> None:
        r = int(math.ceil(sig * 4.2))
        x0, x1 = max(0, int(cx) - r), min(size, int(cx) + r + 1)
        y0, y1 = max(0, int(cy) - r), min(size, int(cy) + r + 1)
        if x1 <= x0 or y1 <= y0:
            return
        yy, xx = np.mgrid[y0:y1, x0:x1]
        sky[y0:y1, x0:x1] += amp * np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2.0 * sig * sig))

    props = _match_benchmark(ra, dec)
    for i in range(props["stars"]):
        star_color = 1.0 + ((i % 3) - 1) * 0.2 * ((wavelength - 2.8) / 2.1)
        _splat(
            rng.uniform(28, size - 28),
            rng.uniform(28, size - 28),
            rng.uniform(0.35, 1.45) * star_color,
            rng.uniform(2.2, 3.8) * psf_lambda_scale,
        )

    cx = size * 0.5 + (epoch_idx - 1) * props["dx"]
    cy = size * 0.5 + (epoch_idx - 1) * props["dy"]
    # Variability: positive var brightens across epochs (Mira peak), negative var dims (T Tauri dip)
    var_factor = max(0.28, 1.0 + (epoch_idx - 1) * (props["var"] * 0.45))
    # Wavelength flux response: peak near 1.65um with molecular absorption features
    sed_mod = max(0.25, 1.0 + 0.35 * math.sin((wavelength - 0.75) / 4.25 * math.pi))
    _splat(cx, cy, 1.85 * var_factor * sed_mod, 5.5 * psf_lambda_scale)
    _splat(cx, cy, 0.65 * var_factor * sed_mod, 14.0 * psf_lambda_scale)

    return sky


def generate_cutout_product(ra, dec, epoch_idx, band_index, size=512, epoch_str=None, fov_arcmin=5.0):
    product = fetch_real_unwise_cutout(ra, dec, epoch_idx, epoch_str, band_index, size, fov_arcmin)
    if product is not None:
        return product
    pixels = generate_calibrated_cutout(
        ra, dec, epoch_idx, band_index, size, epoch_str, fov_arcmin, prefer_real=False
    )
    return CutoutProduct(
        pixels=pixels, data_kind="simulated", provenance="Synthetic-Demo",
        release=epoch_str or UNWISE_RELEASES[min(epoch_idx, len(UNWISE_RELEASES) - 1)],
        band=2 if band_index > 50 else 1,
        wavelength_um=3.4 if band_index <= 50 else 4.6, bunit="arbitrary",
    )


def generate_spectrum_vector(
    ra: float,
    dec: float,
    radius_arcsec: float = 6.2,
    center_ra: Optional[float] = None,
    center_dec: Optional[float] = None,
    fov_arcmin: float = 5.0,
) -> bytes:
    """
    Return 102-band Float32Array (408 bytes) little-endian binary vector
    for an educational simulation, not extracted from observed SPHEREx data.
    """
    channels = 102
    w = np.linspace(0.75, 5.0, channels, dtype=np.float32)
    c_ra = ra if center_ra is None else center_ra
    c_dec = dec if center_dec is None else center_dec

    size = 512
    deg_per_px = (fov_arcmin / 60.0) / size
    cos_dec = max(0.1, math.cos(math.radians(c_dec)))
    dx_px = -((ra - c_ra) * cos_dec) / deg_per_px
    dy_px = (dec - c_dec) / deg_per_px
    px = size * 0.5 + dx_px
    py = size * 0.5 + dy_px

    cutout = generate_calibrated_cutout(
        c_ra, c_dec, epoch_idx=1, band_index=42, size=size, prefer_real=False
    )
    yy, xx = np.mgrid[0:size, 0:size]
    ap_px = max(2.0, (radius_arcsec / 6.2) * 5.0)
    mask = ((xx - px) ** 2 + (yy - py) ** 2) <= (ap_px ** 2)
    if np.any(mask):
        peak_signal = float(np.max(cutout[mask])) - 0.12
        mean_signal = float(np.mean(cutout[mask])) - 0.12
    else:
        peak_signal = 0.0
        mean_signal = 0.0

    dist_center = math.hypot(px - size * 0.5, py - size * 0.5)
    ap_scale = 0.75 + radius_arcsec / 24.0

    if peak_signal < 0.18:
        rng = np.random.default_rng(int((abs(px) * 97 + abs(py) * 31) % 2**31))
        flux = (0.14 + rng.normal(0.0, 0.03, size=channels)).astype("<f4")
        flux = np.maximum(0.04, flux)
        return flux.tobytes()

    if dist_center < 22.0:
        scale = np.float32(18.0 * ap_scale * min(1.3, max(0.3, peak_signal / 2.2)))
        continuum = scale * np.exp(-(((w - 1.65) / 1.95) ** 2))
        h2o = 0.55 * np.exp(-(((w - 3.05) / 0.14) ** 2))
        co2 = 0.35 * np.exp(-(((w - 4.27) / 0.09) ** 2))
        flux = np.maximum(0.05, continuum * (1.0 - h2o - co2)).astype("<f4")
        return flux.tobytes()

    slope = 0.35 if (int(px + py) % 2 == 0) else -0.35
    scale = np.float32(12.0 * ap_scale * min(1.2, max(0.25, (mean_signal + peak_signal) * 0.5)))
    continuum = scale * np.exp(-(((w - (2.1 + slope * 1.4)) / 2.1) ** 2))
    flux = np.maximum(0.06, continuum).astype("<f4")
    return flux.tobytes()
