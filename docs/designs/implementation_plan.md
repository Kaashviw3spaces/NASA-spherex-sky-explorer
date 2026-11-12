# SPHEREx Sky Explorer — Technical Implementation Plan

* **Author:** ashwinanand
* **Date:** 2026-11-12
* **Reference Spec:** [`spherex_sky_explorer.md`](./spherex_sky_explorer.md)

## 1. Current Frontend Baseline (Completed)
The multi-page React + Vite frontend in `frontend/` is built and verified (`npm run build`):
* `/` (`HomePage.jsx`): Editorial mission overview, Aitoff MOC schematic, and navigation CTAs.
* `/explorer` (`ExplorerPage.jsx`): 3-mode viewport (Blink 1–15 Hz, Split-Curtain Swipe, Side-by-Side), normalized variance differencing, ZScale / Asinh / Log stretches, Inferno / Viridis / Grayscale_r colormaps, aperture sampling, deep-link URL state, and CSV/JSON/FITS export.
* `/targets` (`TargetsPage.jsx`): Benchmark presets (*Barnard's Star*, *WISE 0855*, *Epsilon Indi B*, *RW Aurigae*, *R Draconis*, *unWISE Fallback*).
* `/architecture` (`ArchitecturePage.jsx`): System topology and URL state contract.
* `SpectrumChart.jsx`: Interactive `0.75–5.0 um` SVG plot with molecular markers (H2O, PAH, CO2, CO), wavelength scrubber, and unWISE W1/W2 horizontal filter-width error bars.

## 2. Phase 1 — FastAPI Binary Proxy (`backend/` — Completed & Verified)
* **`backend/main.py`**: Implements `/api/coverage`, `/api/resolve`, `/api/spectrum` (`408-byte` `Float32Array`), `/api/jobs/cutouts` (`200 OK` cache hit / `202 Accepted` async polling), `/api/data/raster/{cache_key}` (`512x512` `uint16` binary rasters with `X-BSCALE`, `X-BZERO`, `X-WCS-*` headers), `/api/diff` (Alard-Lupton / Gaussian PSF-matched subtraction), and `/api/export/fits` (32-bit FITS download).
* **`backend/cache.py`**: Two-tier in-memory LRU + bounded `500 MB` disk cache (`480 MB` high / `380 MB` low eviction watermarks) and 2-hour `JobStore`.

## 3. Phase 2 — Frontend Live Wiring & RFC Features (`frontend/` — Completed & Verified)
* **Vite Proxy & Binary API Client (`vite.config.js`, `src/api/client.js`)**: Proxies `/api/*` to `127.0.0.1:8000`, decodes `408-byte` `Float32Array` spectra and `512x512` `Uint16Array` rasters, and handles `202 Accepted` job polling.
* **Persistent Web Worker & 60 fps Bandpass Modulation (`src/workers/rasterWorker.js`, `src/utils/astronomyRenderer.js`)**: Offloads stretch/colormap math to a persistent worker and modulates the target PSF, halo, diffraction spikes, and companion stars in real time across `0.75–5.0 um`.
* **Click-to-Sample WCS Spectroscopy, MOC Radar & FITS Header Modal (`ExplorerPage.jsx`, `MocRadar.jsx`, `FitsHeaderModal.jsx`)**: Maps clicked `(x, y)` pixels to sky `(RA, Dec)` coordinates and extracts the 102-band spectrum at that exact sky position.

## 4. Phase 3 — WCS Reprojection, End-to-End Verification & Deployment (Completed & Verified)
* **WCS Tangent-Plane Reprojection (`backend/wcs_pipeline.py`)**: Added `build_tan_wcs` and `reproject_to_tangent_grid` to regrid multi-instrument cutouts (`SPHEREx 6.2"/px` and `unWISE 2.75"/px`) onto a standardized Gnomonic (`TAN`) coordinate grid.
* **End-to-End Test Suite (`backend/tests/test_api.py`)**: Verified MOC footprint routing, benchmark/decimal/HMS-DMS resolution, WCS click-to-sample spectroscopy (target vs. empty sky), TAN reprojection, `202` async polling, PSF-matched differencing, and FITS export.
* **Deployment Configs (`backend/Dockerfile`, `frontend/vercel.json`)**: Packaged the FastAPI proxy for Hugging Face Spaces (`port 7860`) and configured SPA rewrites for Vercel.
