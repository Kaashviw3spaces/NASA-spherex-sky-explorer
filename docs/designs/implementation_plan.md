# SPHEREx Sky Explorer — Technical Implementation Plan

* **Author:** ashwinanand
* **Date:** 2026-11-12
* **Reference Spec:** [`spherex_sky_explorer.md`](./spherex_sky_explorer.md)

## 1. Current Frontend Baseline (Completed)
The multi-page React + Vite frontend in `frontend/` is built and verified (`npm run build`):
* `/` (`HomePage.jsx`): Editorial mission overview, Aitoff MOC schematic, and navigation CTAs.
* `/explorer` (`ExplorerPage.jsx`): 3-mode viewport (Blink 1–15 Hz, Split-Curtain Swipe, Side-by-Side), normalized variance differencing, ZScale / Asinh / Log stretches, Inferno / Viridis / Grayscale_r colormaps, aperture sampling, deep-link URL state, and CSV export.
* `/targets` (`TargetsPage.jsx`): Benchmark presets (*Barnard's Star*, *WISE 0855*, *Epsilon Indi B*, *RW Aurigae*, *R Draconis*, *unWISE Fallback*).
* `/architecture` (`ArchitecturePage.jsx`): System topology and URL state contract.
* `SpectrumChart.jsx`: Interactive `0.75–5.0 um` SVG plot with molecular markers (H2O, PAH, CO2, CO), wavelength scrubber, and unWISE W1/W2 horizontal filter-width error bars.

## 2. Phase 1 — FastAPI Binary Proxy (`backend/` — Completed & Verified)
Implemented and verified (`pytest -v`: **3 passed in 0.87s**) under `backend/`:
* **`backend/main.py`**:
  * `GET /api/coverage` — $O(1)$ MOC spatial footprint check returning `spherex_covered`, `primary_survey_epochs`, and `unwise_fallback_available`.
  * `GET /api/resolve?q=...` — Resolves decimal, HMS/DMS (`hh:mm:ss dd:mm:ss`), benchmark targets, and external names via CDS Sesame.
  * `GET /api/spectrum` — Streams the fast-path `408-byte` little-endian `Float32Array` 102-band spectral vector.
  * `POST /api/jobs/cutouts` & `GET /api/jobs/{job_id}` — Returns `200 OK` immediately on cache hits or `202 Accepted` with progressive polling on cache misses.
  * `GET /api/data/raster/{cache_key}` — Streams `512x512` `uint16` binary rasters (`524,288` bytes) with `X-BSCALE`, `X-BZERO`, `X-WCS-CRVAL`, `X-WCS-CRPIX`, `X-WCS-CDELT`, `X-Observation-Epoch`, and `X-Survey-Provenance` HTTP headers.
  * `POST /api/diff` — On-demand server-side Alard-Lupton / Gaussian PSF-matched subtraction returning binary `uint16` raster + `X-Diff-Confidence`.
  * `GET /api/export/fits` — Generates and downloads a calibrated 32-bit FITS cutout with full WCS headers.
* **`backend/cache.py`**: Two-tier in-memory LRU + bounded `500 MB` disk cache (`480 MB` high / `380 MB` low eviction watermarks) and 2-hour `JobStore`.
* **`backend/wcs_pipeline.py` & `backend/moc_index.py`**: Robust `p0.05`/`p99.95` `uint16` quantization, multi-Gaussian least-squares PSF matching, $O(1)$ galactic-latitude MOC index, and localized stamp-splatting cutout generation (`< 10 ms` per frame).
* **`backend/tests/test_api.py`**: Automated tests for MOC routing, 408-byte spectrum, `202` async polling, binary raster headers, PSF diff, and FITS export.

## 3. Phase 2 — Frontend Live Wiring & RFC Features (`frontend/` — Next)
* **Vite Proxy & Binary API Client (`frontend/vite.config.js`, `frontend/src/api/client.js`)**:
  * Proxy `/api/*` to `http://127.0.0.1:8000`.
  * Decode `408-byte` `Float32Array` from `/api/spectrum` and `512x512` `Uint16Array` rasters from `/api/data/raster/{cache_key}` using `X-BSCALE` and `X-BZERO` headers (`flux = bzero + bscale * q`), with clear offline/timeout status notices.
* **Async Polling & Phase-Locked Ring Buffer (`frontend/src/workers/rasterWorker.js`)**:
  * Submit `POST /api/jobs/cutouts`, poll `/api/jobs/{job_id}` on `202 Accepted`, and stream completed epochs into a 16-slot texture ring buffer without stalling the 1–15 Hz blink clock.
* **On-Demand PSF-Matched Differencing (`ExplorerPage.jsx`)**:
  * Keep instant client-side normalized variance differencing as the default, and add a **"Confirm Transient (PSF-Matched)"** button calling `POST /api/diff` and displaying `X-Diff-Confidence`.
* **HMS/DMS Input, MOC Radar & Exports (`resolver.js`, `ExplorerPage.jsx`)**:
  * Parse `hh:mm:ss dd:mm:ss` coordinates and call `/api/resolve`.
  * Add a compact MOC coverage indicator, a **FITS Header** viewer modal (`CRVAL`, `CRPIX`, `CDELT`, `EPOCH`), and **JSON / 32-bit FITS** download buttons alongside CSV export.

## 4. Phase 3 — Integration & Deployment
* Verify end-to-end blink, split-curtain swipe, aperture SED extraction, PSF-matched diff, and deep-link sharing across all 6 benchmark targets with both servers running (`localhost:8000` + `localhost:5173`).
* Package deployment configs for Hugging Face Spaces (backend) and Vercel/Netlify (frontend).
