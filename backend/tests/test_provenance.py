"""Data truthfulness tests: real FITS transport, offline paths and exports."""
import asyncio
import io
import sys
import tarfile
from pathlib import Path

import httpx
import numpy as np
import pytest
from astropy.io import fits
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main
import moc_index
from cache import BoundedLRUCache, JobStore
from wcs_pipeline import build_tan_wcs


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "raster_cache", BoundedLRUCache(cache_dir=str(tmp_path)))
    monkeypatch.setattr(main, "job_store", JobStore())
    with TestClient(main.app) as tc:
        yield tc


def mock_archive(monkeypatch, status=200, units=True):
    header = build_tan_wcs(10, 20, 64, 64, 4.6875).to_header()
    if units:
        header["BUNIT"] = "native-test-unit"
        header["DATE-OBS"] = "2015-06-01T12:34:56"
    file = io.BytesIO()
    fits.PrimaryHDU(np.ones((64, 64), dtype=np.float32), header).writeto(file)
    archive = io.BytesIO()
    with tarfile.open(fileobj=archive, mode="w:gz") as tar:
        info = tarfile.TarInfo("tile-w1-img-m.fits")
        info.size = len(file.getvalue())
        tar.addfile(info, io.BytesIO(file.getvalue()))
    # Include padding so tiny test archive passes the download sanity check.
    payload = archive.getvalue() + b'\0' * 1000
    original = httpx.Client
    def handler(request):
        assert request.url.params["version"] == "neo2"
        assert request.url.params["bands"] == "1"
        return httpx.Response(status, content=payload)
    monkeypatch.setattr(moc_index.httpx, "Client", lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))


def run_job(client, monkeypatch, observed):
    main.job_store.create("test", {"total_requested": 1})
    asyncio.run(main._process_cutout_job("test", 10, 20, 5, [42], ["neo2"], "unwise-products-v2"))
    job = main.job_store.get("test")
    assert job["status"] == "ready", job
    item = job["completed_rasters"][0]
    response = client.get(item["raster_url"])
    assert response.headers["x-data-kind"] == ("observed" if observed else "simulated")
    exported = client.get("/api/export/fits", params={"cache_key": item["cache_key"]})
    with fits.open(io.BytesIO(exported.content)) as hdul:
        hdr = hdul[0].header
        assert hdr["DATKIND"] == response.headers["x-data-kind"]
        assert hdr["BUNIT"] == response.headers["x-bunit"]
        assert hdr["RELEASE"] == "neo2"
        assert "SPHEREx" not in hdr["SURVEY"]
    return response


def test_real_fits_survives_reprojection_and_export(client, monkeypatch):
    mock_archive(monkeypatch)
    r = run_job(client, monkeypatch, True)
    assert r.headers["x-bunit"] == "native-test-unit"
    assert r.headers["x-observation-epoch"] == "2015-06-01T12:34:56"
    assert r.headers["x-band-index"] == "1"
    assert float(r.headers["x-band-wavelength-um"]) == 3.4
    assert r.headers["x-wcs-reprojected"] == "true"
    assert "version=neo2" in r.headers["x-source-url"]


def test_missing_source_metadata_stays_unknown(client, monkeypatch):
    mock_archive(monkeypatch, units=False)
    r = run_job(client, monkeypatch, True)
    assert r.headers["x-bunit"] == "unknown"
    assert r.headers["x-observation-epoch"] == "unknown"


def test_archive_failure_is_labeled_simulation(client, monkeypatch):
    mock_archive(monkeypatch, status=503)
    r = run_job(client, monkeypatch, False)
    assert r.headers["x-survey-provenance"] == "Synthetic-Demo"
    assert r.headers["x-bunit"] == "arbitrary"
    assert r.headers["x-observation-epoch"] == "unknown"


def test_spectrum_never_claims_observation(client):
    r = client.get("/api/spectrum?ra=10&dec=20")
    assert len(r.content) == 408
    assert r.headers["x-data-kind"] == "simulated"
    assert r.headers["x-bunit"] == "arbitrary"
    assert r.headers["x-survey-provenance"] == "Synthetic-Demo"


def test_catalog_failure_returns_no_invented_sources(monkeypatch):
    original = httpx.AsyncClient
    monkeypatch.setattr(moc_index.httpx, "AsyncClient", lambda **kwargs: original(
        transport=httpx.MockTransport(lambda request: httpx.Response(503)), **kwargs))
    result = asyncio.run(moc_index.query_irsa_tap(10, 20))
    assert result["status"] == "unavailable"
    assert result["sources"] == [] and result["count"] == 0


def test_unsupported_dates_are_not_relabelled_as_archive_observations(client):
    r = client.post("/api/jobs/cutouts", json={"ra": 10, "dec": 20, "epochs": ["2025-05"]})
    assert r.status_code == 422


def test_synthetic_cache_is_retried_and_observed_cache_is_reused(client, monkeypatch):
    monkeypatch.setattr(moc_index, "fetch_real_unwise_cutout", lambda *args, **kwargs: None)
    run_job(client, monkeypatch, False)
    # A demo is a cached display frame, never evidence that the archive succeeded.
    calls = []
    def observed(*args, **kwargs):
        calls.append(True)
        return moc_index.CutoutProduct(np.ones((512, 512), dtype=np.float32),
            "observed", "unWISE-Archive", "neo2", 1, 3.4)
    monkeypatch.setattr(moc_index, "fetch_real_unwise_cutout", observed)
    run_job(client, monkeypatch, True)
    run_job(client, monkeypatch, True)
    assert len(calls) == 1


@pytest.mark.parametrize("query", ["10,91", "10,-91", "24:00:00 -07:00:00", "08:60:00 -07:00:00", "08:00:60 -07:00:00", "08:00:00 -90:01:00"])
def test_resolver_rejects_invalid_coordinates_without_remote_lookup(client, monkeypatch, query):
    def unexpected(**kwargs):
        pytest.fail("Invalid coordinates must not be sent to a name resolver")
    monkeypatch.setattr(moc_index.httpx, "AsyncClient", unexpected)
    assert client.get('/api/resolve', params={'q': query}).status_code == 404


def test_unknown_object_returns_not_found(client, monkeypatch):
    original = httpx.AsyncClient
    monkeypatch.setattr(moc_index.httpx, "AsyncClient", lambda **kwargs: original(
        transport=httpx.MockTransport(lambda request: httpx.Response(200, text='<Sesame/>')), **kwargs))
    assert client.get('/api/resolve', params={'q': 'unknown object'}).status_code == 404


def test_successful_retry_does_not_overwrite_a_demo_download(client, monkeypatch):
    monkeypatch.setattr(moc_index, "fetch_real_unwise_cutout", lambda *args, **kwargs: None)
    main.job_store.create('demo', {'total_requested': 1})
    asyncio.run(main._process_cutout_job('demo', 10, 20, 5, [42], ['neo2'], 'unwise-products-v3'))
    demo = main.job_store.get('demo')['completed_rasters'][0]
    before = client.get(demo['raster_url']).content
    monkeypatch.setattr(moc_index, "fetch_real_unwise_cutout", lambda *args, **kwargs:
        moc_index.CutoutProduct(np.ones((512, 512), dtype=np.float32), 'observed', 'unWISE-Archive', 'neo2', 1, 3.4))
    main.job_store.create('observed', {'total_requested': 1})
    asyncio.run(main._process_cutout_job('observed', 10, 20, 5, [42], ['neo2'], 'unwise-products-v3'))
    observed = main.job_store.get('observed')['completed_rasters'][0]
    assert observed['cache_key'] != demo['cache_key']
    assert client.get(demo['raster_url']).content == before
    assert client.get(demo['raster_url']).headers['x-data-kind'] == 'simulated'
    assert client.get(observed['raster_url']).headers['x-data-kind'] == 'observed'


def test_backend_cache_does_not_merge_distinct_coordinates_or_fields(client, monkeypatch):
    monkeypatch.setattr(moc_index, "fetch_real_unwise_cutout", lambda *args, **kwargs:
        moc_index.CutoutProduct(np.ones((512, 512), dtype=np.float32), 'observed', 'unWISE-Archive', 'neo2', 1, 3.4))
    keys = []
    for index, (ra, fov) in enumerate([(10, 5), (10.000001, 5), (10, 5.001)]):
        job_id = str(index)
        main.job_store.create(job_id, {'total_requested': 1})
        asyncio.run(main._process_cutout_job(job_id, ra, 20, fov, [42], ['neo2'], 'unwise-products-v3'))
        keys.append(main.job_store.get(job_id)['completed_rasters'][0]['cache_key'])
    assert len(set(keys)) == 3


def test_release_order_does_not_change_simulation_or_cache_identity(client, monkeypatch):
    calls = []
    def simulated(ra, dec, epoch_idx, band_index, size, epoch, fov):
        calls.append((epoch, epoch_idx))
        return moc_index.CutoutProduct(np.ones((size, size), dtype=np.float32), 'simulated', 'Synthetic-Demo', epoch, 1, 3.4)
    monkeypatch.setattr(main, 'generate_cutout_product', simulated)
    main.job_store.create('first', {'total_requested': 1})
    asyncio.run(main._process_cutout_job('first', 10, 20, 5, [42], ['neo2'], 'unwise-products-v3'))
    first = main.job_store.get('first')['completed_rasters'][0]['cache_key']
    main.job_store.create('second', {'total_requested': 2})
    asyncio.run(main._process_cutout_job('second', 10, 20, 5, [42], ['allwise', 'neo2'], 'unwise-products-v3'))
    second = main.job_store.get('second')['completed_rasters'][1]['cache_key']
    assert first == second
    assert [index for release, index in calls if release == 'neo2'] == [1, 1]
