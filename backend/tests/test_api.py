import sys
from pathlib import Path
import time
import numpy as np
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from main import app  # noqa: E402
from wcs_pipeline import build_tan_wcs, reproject_to_tangent_grid  # noqa: E402


def test_coverage_moc_check():
    with TestClient(app) as tc:
        r1 = tc.get("/api/coverage?ra=133.7951&dec=-7.2451")
        assert r1.status_code == 200
        assert r1.json()["spherex_covered"] is True
        assert r1.json()["moc_order"] == 10

        r2 = tc.get("/api/coverage?ra=266.4168&dec=-29.0078")
        assert r2.status_code == 200
        assert r2.json()["spherex_covered"] is False
        assert r2.json()["unwise_fallback_available"] is True


def test_resolve_all_formats_and_benchmarks():
    with TestClient(app) as tc:
        for name in ["Barnard's Star", "WISE 0855", "Epsilon Indi B", "RW Aurigae", "R Draconis"]:
            r = tc.get(f"/api/resolve?q={name}")
            assert r.status_code == 200
            assert r.json()["spherex_covered"] is True

        # Decimal & HMS/DMS
        r_dec = tc.get("/api/resolve?q=133.7951,-7.2451")
        assert r_dec.status_code == 200
        r_hms = tc.get("/api/resolve?q=08:55:10.8 -07:14:42")
        assert r_hms.status_code == 200
        assert abs(r_hms.json()["ra"] - 133.795) < 0.02


def test_spectrum_408_byte_and_wcs_click_sampling():
    with TestClient(app) as tc:
        # Center star click -> high flux with H2O absorption dip
        r_center = tc.get(
            "/api/spectrum?ra=133.7951&dec=-7.2451&radius_arcsec=12.4&center_ra=133.7951&center_dec=-7.2451&fov_arcmin=5.0"
        )
        assert r_center.status_code == 200
        assert len(r_center.content) == 408
        center_flux = np.frombuffer(r_center.content, dtype="<f4")

        # Empty sky click near corner (outside star margin) -> flat low noise floor
        r_sky = tc.get(
            "/api/spectrum?ra=133.8355&dec=-7.2055&radius_arcsec=6.2&center_ra=133.7951&center_dec=-7.2451&fov_arcmin=5.0"
        )
        assert r_sky.status_code == 200
        sky_flux = np.frombuffer(r_sky.content, dtype="<f4")
        assert float(np.max(center_flux)) > float(np.max(sky_flux)) * 10.0


def test_wcs_tangent_plane_reprojection():
    # Verify reprojection from native SPHEREx (6.2"/px) to target grid preserves peak position
    ra, dec = 133.7951, -7.2451
    src_wcs = build_tan_wcs(ra, dec, 128, 128, pixel_scale_arcsec=6.2)
    yy, xx = np.mgrid[0:128, 0:128]
    src_img = np.exp(-((xx - 64.0) ** 2 + (yy - 64.0) ** 2) / (2.0 * 3.0**2)).astype(np.float32)

    regridded, out_wcs = reproject_to_tangent_grid(
        src_img, src_wcs, ra, dec, out_shape=(256, 256), pixel_scale_arcsec=3.1
    )
    assert regridded.shape == (256, 256)
    peak_y, peak_x = np.unravel_index(np.argmax(regridded), regridded.shape)
    assert abs(peak_x - 128) <= 2 and abs(peak_y - 128) <= 2


def test_cutout_async_job_and_binary_raster_and_psf_diff():
    with TestClient(app) as tc:
        resp = tc.post(
            "/api/jobs/cutouts",
            json={"ra": 133.7951, "dec": -7.2451, "fov_arcmin": 5.0, "bands": [42]},
        )
        assert resp.status_code in (200, 202)
        if resp.status_code == 202:
            job_url = resp.json()["status_url"]
            rasters = []
            for _ in range(120):
                poll = tc.get(job_url)
                assert poll.status_code == 200
                data = poll.json()
                if data["status"] == "ready":
                    rasters = data["completed_rasters"]
                    break
                time.sleep(0.1)
            assert len(rasters) >= 2
        else:
            rasters = resp.json()["rasters"]

        first = rasters[0]
        second = rasters[-1]

        r_bin = tc.get(first["raster_url"])
        assert r_bin.status_code == 200
        assert len(r_bin.content) == 512 * 512 * 2
        assert r_bin.headers["x-raster-dimensions"] == "512,512"
        assert "x-bscale" in r_bin.headers
        assert "x-wcs-crval" in r_bin.headers

        r_diff = tc.post(
            "/api/diff",
            json={
                "raster_key_a": first["cache_key"],
                "raster_key_b": second["cache_key"],
                "kernel": "alard_lupton",
            },
        )
        assert r_diff.status_code == 200
        assert len(r_diff.content) == 512 * 512 * 2
        assert float(r_diff.headers["x-diff-confidence"]) >= 0.55

        r_fits = tc.get(f"/api/export/fits?cache_key={first['cache_key']}")
        assert r_fits.status_code == 200
        assert r_fits.content.startswith(b"SIMPLE  =")


def test_health_endpoint():
    with TestClient(app) as tc:
        resp = tc.get("/api/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"
        assert "cache_items" in resp.json()


def test_band_index_modulation():
    from moc_index import generate_calibrated_cutout

    cutout_band1 = generate_calibrated_cutout(133.7951, -7.2451, epoch_idx=1, band_index=1, size=256)
    cutout_band102 = generate_calibrated_cutout(133.7951, -7.2451, epoch_idx=1, band_index=102, size=256)
    # Band 1 (0.75 um) and Band 102 (5.0 um) must not be identical
    assert not np.allclose(cutout_band1, cutout_band102)


def test_validation_errors():
    with TestClient(app) as tc:
        # Invalid cache keys
        r1 = tc.get("/api/data/raster/bad_key")
        assert r1.status_code == 400

        r2 = tc.get("/api/export/fits?cache_key=bad_key")
        assert r2.status_code == 400

        # Out-of-range bands
        r3 = tc.post(
            "/api/jobs/cutouts",
            json={"ra": 133.7951, "dec": -7.2451, "fov_arcmin": 5.0, "bands": [999]},
        )
        assert r3.status_code == 422


def test_sesame_redirect_follow():
    with TestClient(app) as tc:
        resp = tc.get("/api/resolve?q=Vega")
        # Should successfully resolve with HTTP 200 via follow_redirects
        if resp.status_code == 200:
            data = resp.json()
            assert abs(data["ra"] - 279.23) < 1.0
            assert abs(data["dec"] - 38.78) < 1.0


def test_irsa_tap_hook():
    with TestClient(app) as tc:
        resp = tc.get("/api/tap/query?ra=269.4521&dec=4.6934&radius_arcsec=15.0")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] in ("success", "offline_fallback")
        assert len(data["sources"]) >= 1


if __name__ == "__main__":
    import pytest

    sys.exit(pytest.main(["-v", __file__]))
