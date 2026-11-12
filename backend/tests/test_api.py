import sys
from pathlib import Path
import time

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from main import app  # noqa: E402


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


def test_spectrum_408_byte_fast_path():
    with TestClient(app) as tc:
        resp = tc.get("/api/spectrum?ra=133.7951&dec=-7.2451&radius_arcsec=6.2")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/octet-stream"
        assert len(resp.content) == 408


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
            for _ in range(60):
                poll = tc.get(job_url)
                assert poll.status_code == 200
                data = poll.json()
                if data["status"] == "ready":
                    rasters = data["completed_rasters"]
                    break
                time.sleep(0.05)
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
