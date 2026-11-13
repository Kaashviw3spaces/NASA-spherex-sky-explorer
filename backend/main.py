import asyncio
import io
import re
import uuid
from typing import List, Optional

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

from cache import BoundedLRUCache, JobStore
from moc_index import (
    check_spherex_moc,
    generate_calibrated_cutout,
    generate_spectrum_vector,
    query_irsa_tap,
    resolve_target_query,
)
from wcs_pipeline import (
    build_wcs_headers,
    dequantize_uint16,
    psf_matched_diff,
    quantize_to_uint16,
)

CACHE_KEY_RE = re.compile(r"^[a-f0-9]{24}$")


def validate_cache_key(key: str) -> str:
    if not CACHE_KEY_RE.match(key):
        raise HTTPException(status_code=400, detail="Invalid cache key format.")
    return key


app = FastAPI(title="SPHEREx Sky Explorer Proxy API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "X-Raster-Dimensions",
        "X-Raster-Bitpix",
        "X-BSCALE",
        "X-BZERO",
        "X-BUNIT",
        "X-WCS-CRVAL",
        "X-WCS-CRPIX",
        "X-WCS-CDELT",
        "X-WCS-CTYPE",
        "X-Observation-Epoch",
        "X-Survey-Provenance",
        "X-Band-Index",
        "X-Band-Wavelength-Um",
        "X-Channel-Count",
        "X-Diff-Confidence",
        "X-WCS-Reprojected",
    ],
)

raster_cache = BoundedLRUCache()
job_store = JobStore()


class CutoutJobRequest(BaseModel):
    ra: float = Field(..., ge=0.0, le=360.0)
    dec: float = Field(..., ge=-90.0, le=90.0)
    fov_arcmin: float = Field(5.0, gt=0.1, le=15.0)
    bands: List[int] = Field(default_factory=lambda: [1, 42, 102])
    epochs: Optional[List[str]] = None

    @field_validator("bands")
    @classmethod
    def validate_bands(cls, v: List[int]) -> List[int]:
        if not v:
            raise ValueError("bands list cannot be empty")
        for b in v:
            if not (0 <= b <= 102):
                raise ValueError(f"band index {b} out of range [0, 102]")
        return v


class DiffRequest(BaseModel):
    raster_key_a: str = Field(..., pattern="^[a-f0-9]{24}$")
    raster_key_b: str = Field(..., pattern="^[a-f0-9]{24}$")
    kernel: str = Field("alard_lupton", pattern="^(alard_lupton|gaussian)$")


@app.get("/api/health")
async def health():
    return {"status": "ok", "cache_items": len(raster_cache._disk_index)}


@app.get("/api/coverage")
async def coverage(ra: float = Query(..., ge=0.0, le=360.0), dec: float = Query(..., ge=-90.0, le=90.0)):
    return check_spherex_moc(ra, dec)


@app.get("/api/resolve")
async def resolve(q: str = Query(..., min_length=1)):
    result = await resolve_target_query(q)
    if not result:
        raise HTTPException(status_code=404, detail="Target or coordinates could not be resolved.")
    return result


@app.get("/api/spectrum")
async def spectrum(
    ra: float = Query(..., ge=0.0, le=360.0),
    dec: float = Query(..., ge=-90.0, le=90.0),
    radius_arcsec: float = Query(6.2, gt=0.5, le=60.0),
    center_ra: Optional[float] = Query(None, ge=0.0, le=360.0),
    center_dec: Optional[float] = Query(None, ge=-90.0, le=90.0),
    fov_arcmin: float = Query(5.0, gt=0.1, le=15.0),
):
    raw_bytes = generate_spectrum_vector(
        ra, dec, radius_arcsec, center_ra=center_ra, center_dec=center_dec, fov_arcmin=fov_arcmin
    )
    cov = check_spherex_moc(ra, dec)
    return Response(
        content=raw_bytes,
        media_type="application/octet-stream",
        headers={
            "X-Survey-Provenance": "SPHEREx-Survey1" if cov["spherex_covered"] else "unWISE-Fallback",
            "X-Channel-Count": "102",
        },
    )


@app.get("/api/tap/query")
async def tap_query(
    ra: float = Query(..., ge=0.0, le=360.0),
    dec: float = Query(..., ge=-90.0, le=90.0),
    radius_arcsec: float = Query(12.4, gt=0.5, le=360.0),
    table: str = Query("allwise_p3as_psd", pattern="^[a-zA-Z0-9_]+$"),
):
    """
    Live NASA/IPAC IRSA TAP Query Hook for cross-matching infrared catalog sources and SPHEREx survey tiles.
    """
    return await query_irsa_tap(ra=ra, dec=dec, radius_arcsec=radius_arcsec, table=table)


async def _process_cutout_job(
    job_id: str,
    ra: float,
    dec: float,
    fov_arcmin: float,
    bands: List[int],
    epochs: List[str],
    provenance: str,
) -> None:
    completed = []
    size = 512
    pixel_scale = (fov_arcmin * 60.0) / size

    try:
        for e_idx, epoch in enumerate(epochs):
            for band_idx in bands:
                cache_key = BoundedLRUCache.make_key(
                    round(ra, 5), round(dec, 5), round(fov_arcmin, 2), epoch, band_idx, provenance
                )
                if not raster_cache.has(cache_key):
                    flux = await asyncio.to_thread(
                        generate_calibrated_cutout,
                        ra,
                        dec,
                        e_idx,
                        band_idx,
                        size,
                        epoch,
                        fov_arcmin,
                        True,
                    )
                    is_reproj = bool(getattr(flux, "is_reprojected", False))
                    clean_flux = np.nan_to_num(flux, nan=0.0).astype(np.float32)
                    raw_u16, bscale, bzero = await asyncio.to_thread(quantize_to_uint16, clean_flux)
                    wavelength_um = 0.75 + (max(1, min(102, band_idx)) - 1) / 101.0 * 4.25
                    headers = build_wcs_headers(
                        width=size,
                        height=size,
                        bscale=bscale,
                        bzero=bzero,
                        ra=ra,
                        dec=dec,
                        pixel_scale_arcsec=pixel_scale,
                        epoch=epoch,
                        provenance=provenance,
                        band_index=band_idx,
                        wavelength_um=wavelength_um,
                        is_reprojected=is_reproj,
                    )
                    raster_cache.put(cache_key, raw_u16, headers)

                completed.append(
                    {
                        "cache_key": cache_key,
                        "epoch": epoch,
                        "band_index": band_idx,
                        "raster_url": f"/api/data/raster/{cache_key}",
                    }
                )
                job_store.update(job_id, status="partial", completed_rasters=list(completed))

        job_store.update(job_id, status="ready", completed_rasters=completed)
    except Exception as exc:
        job_store.update(job_id, status="failed", error=str(exc))


@app.post("/api/jobs/cutouts")
async def create_cutout_job(req: CutoutJobRequest):
    cov = check_spherex_moc(req.ra, req.dec)
    provenance = "SPHEREx-Survey1" if cov["spherex_covered"] else "unWISE-Fallback"
    epochs = req.epochs or (
        cov["primary_survey_epochs"]
        if cov["spherex_covered"]
        else ["2014-03-01T00:00:00Z", "2019-09-01T00:00:00Z", "2023-09-01T00:00:00Z"]
    )

    all_cached = []
    missing = False
    for epoch in epochs:
        for band_idx in req.bands:
            cache_key = BoundedLRUCache.make_key(
                round(req.ra, 5), round(req.dec, 5), round(req.fov_arcmin, 2), epoch, band_idx, provenance
            )
            if raster_cache.has(cache_key):
                all_cached.append(
                    {
                        "cache_key": cache_key,
                        "epoch": epoch,
                        "band_index": band_idx,
                        "raster_url": f"/api/data/raster/{cache_key}",
                    }
                )
            else:
                missing = True

    if not missing:
        return JSONResponse(
            status_code=200,
            content={
                "status": "ready",
                "provenance": provenance,
                "raster_urls": [item["raster_url"] for item in all_cached],
                "rasters": all_cached,
            },
        )

    job_id = f"job_{uuid.uuid4().hex[:8]}"
    job_store.create(job_id, {"total_requested": len(epochs) * len(req.bands)})
    asyncio.create_task(
        _process_cutout_job(job_id, req.ra, req.dec, req.fov_arcmin, req.bands, epochs, provenance)
    )
    return JSONResponse(
        status_code=202,
        content={
            "job_id": job_id,
            "status": "pending",
            "poll_interval_ms": 350,
            "estimated_wait_ms": 1200,
            "status_url": f"/api/jobs/{job_id}",
        },
    )


@app.get("/api/jobs/{job_id}")
async def get_job_status(job_id: str):
    job = job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or expired.")
    return job


@app.get("/api/data/raster/{cache_key}")
async def get_raster(cache_key: str):
    validate_cache_key(cache_key)
    entry = raster_cache.get(cache_key)
    if not entry:
        raise HTTPException(status_code=404, detail="Raster not found in cache.")
    raw_bytes, headers = entry
    return Response(content=raw_bytes, media_type="application/octet-stream", headers=headers)


@app.post("/api/diff")
async def compute_diff(req: DiffRequest):
    validate_cache_key(req.raster_key_a)
    validate_cache_key(req.raster_key_b)
    entry_a = raster_cache.get(req.raster_key_a)
    entry_b = raster_cache.get(req.raster_key_b)
    if not entry_a or not entry_b:
        raise HTTPException(status_code=404, detail="One or both rasters not found in cache.")

    bytes_a, hdr_a = entry_a
    bytes_b, hdr_b = entry_b
    w_a, h_a = (int(x) for x in hdr_a["X-Raster-Dimensions"].split(","))
    w_b, h_b = (int(x) for x in hdr_b["X-Raster-Dimensions"].split(","))
    if (w_a, h_a) != (w_b, h_b):
        raise HTTPException(status_code=400, detail="Raster dimensions must match for differencing.")

    w, h = w_a, h_a
    img_a = dequantize_uint16(bytes_a, (h, w), float(hdr_a["X-BSCALE"]), float(hdr_a["X-BZERO"]))
    img_b = dequantize_uint16(bytes_b, (h, w), float(hdr_b["X-BSCALE"]), float(hdr_b["X-BZERO"]))
    img_a = np.nan_to_num(img_a, nan=0.0)
    img_b = np.nan_to_num(img_b, nan=0.0)

    diff_img, confidence = await asyncio.to_thread(psf_matched_diff, img_a, img_b, req.kernel)
    diff_img = np.nan_to_num(diff_img, nan=0.0)
    raw_u16, bscale, bzero = await asyncio.to_thread(quantize_to_uint16, diff_img)

    ra, dec = (float(x) for x in hdr_a["X-WCS-CRVAL"].split(","))
    cdelt = abs(float(hdr_a["X-WCS-CDELT"].split(",")[0])) * 3600.0
    is_reproj = (
        hdr_a.get("X-WCS-Reprojected") == "true"
        or "reproject" in hdr_a.get("X-Survey-Provenance", "").lower()
        or "unwise" in hdr_a.get("X-Survey-Provenance", "").lower()
    )
    headers = build_wcs_headers(
        width=w,
        height=h,
        bscale=bscale,
        bzero=bzero,
        ra=ra,
        dec=dec,
        pixel_scale_arcsec=cdelt,
        epoch=f"{hdr_a['X-Observation-Epoch']}..{hdr_b['X-Observation-Epoch']}",
        provenance=f"{hdr_a['X-Survey-Provenance']}-PSF-Diff",
        band_index=int(hdr_a["X-Band-Index"]),
        wavelength_um=float(hdr_a["X-Band-Wavelength-Um"]),
        is_reprojected=is_reproj,
    )
    headers["X-Diff-Confidence"] = f"{confidence:.4f}"
    return Response(content=raw_u16, media_type="application/octet-stream", headers=headers)


@app.get("/api/export/fits")
async def export_fits(cache_key: str):
    validate_cache_key(cache_key)
    entry = raster_cache.get(cache_key)
    if not entry:
        raise HTTPException(status_code=404, detail="Raster not found in cache.")
    raw_bytes, hdr = entry
    w, h = (int(x) for x in hdr["X-Raster-Dimensions"].split(","))
    flux = dequantize_uint16(raw_bytes, (h, w), float(hdr["X-BSCALE"]), float(hdr["X-BZERO"]))
    flux = np.nan_to_num(flux, nan=0.0)

    # Do not flip WCS-reprojected data that is already in standard FITS row-major orientation
    is_reprojected = (
        hdr.get("X-WCS-Reprojected") == "true"
        or "reproject" in hdr.get("X-Survey-Provenance", "").lower()
        or "unwise" in hdr.get("X-Survey-Provenance", "").lower()
    )
    flux_fits = flux if is_reprojected else np.flipud(flux)

    ra, dec = (float(x) for x in hdr["X-WCS-CRVAL"].split(","))
    cdelt_x, cdelt_y = (float(x) for x in hdr["X-WCS-CDELT"].split(","))

    wcs = WCS(naxis=2)
    wcs.wcs.crpix = [w / 2.0 + 0.5, h / 2.0 + 0.5]
    wcs.wcs.cdelt = [cdelt_x, cdelt_y]
    wcs.wcs.crval = [ra, dec]
    wcs.wcs.ctype = ["RA---TAN", "DEC--TAN"]

    hdu = fits.PrimaryHDU(data=flux_fits.astype(np.float32), header=wcs.to_header())
    hdu.header["SURVEY"] = hdr["X-Survey-Provenance"]
    hdu.header["EPOCH"] = hdr["X-Observation-Epoch"]
    hdu.header["BANDIDX"] = int(hdr["X-Band-Index"])
    hdu.header["WAVELEN"] = float(hdr["X-Band-Wavelength-Um"])
    hdu.header["BUNIT"] = "MJy/sr"

    buf = io.BytesIO()
    hdu.writeto(buf)
    return Response(
        content=buf.getvalue(),
        media_type="application/fits",
        headers={"Content-Disposition": f'attachment; filename="spherex_{cache_key}.fits"'},
    )
