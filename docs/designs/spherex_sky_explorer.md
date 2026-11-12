# Planet X & SPHEREx Time-Series and Spectral Sky Explorer

* **Author:** ashwinanand
* **Date:** 2026-11-11

## Overview

A public-facing web tool that enables researchers and citizen scientists to explore multi-epoch astronomical sky images and 102-band near-infrared spectra. The system pairs an asynchronous Python backend proxy with a lightweight, GPU-accelerated browser client. Users input celestial coordinates or object names to stream time-series image cutouts for visual motion detection (flipbook blinking, split-curtain swiping, and image differencing) and click any target to inspect its 102-band Spectral Energy Distribution (SED). Where primary SPHEREx survey epochs are unobserved, the backend automatically provides multi-epoch WISE/NEOWISE infrared data to guarantee coverage across any coordinate on the sky.

## Analysis

### 1. Architectural Synthesis Across Review Lenses
* **System Topology & Caching (`egm-design`, `egm-structural`):**
  Direct browser queries to external NASA archives (IPAC / IRSA / CDS) are blocked by CORS and risk IP rate limits under concurrent traffic. The architecture routes all coordinate requests through an asynchronous FastAPI proxy deployed on Hugging Face Spaces. The proxy uses a two-tier cache (in-memory LRU for top targets and bounded 500 MB local disk cache) and checks survey footprints via Multi-Order Coverage (MOC) maps in $O(1)$ time before upstream fetching.
* **Astrometric Precision & Regridding (`egm-codebase-details`):**
  SPHEREx (~6.2″/pixel) and WISE (~2.75″/pixel) have different pixel scales and coordinate orientations. Naive image subtraction causes false-positive dipolar artifacts from slight misalignments. The proxy regrids all cutouts onto a standardized WCS tangent-plane grid using `astropy.wcs` and `reproject` before transmitting data to the client.
* **Client Performance & Memory Protection (`egm-implementation-readiness`):**
  Loading full 32-bit multi-epoch FITS cubes crashes mobile and low-power browser tabs. The client decouples rendering from data ingestion using Web Workers and an OffscreenCanvas WebGL texture ring buffer capped at 512×512 resolution. Non-visible textures are evicted via an LRU cache.
* **Domain Rigor & Transparency (`egm-comprehension`, `egm-zoom-out`):**
  WISE fallback data covers broad mid-IR bands (W1–W4), whereas SPHEREx provides 102 narrow spectrophotometric channels. The UI marks fallback epochs with distinct visual badges and renders WISE points in the SED plot with horizontal filter-width error bars so users do not mistake broad-band photometry for narrow-band spectra. Common astronomical identifiers are resolved via the CDS Sesame API.

### 2. Refined Subsystem Specifications

#### A. User Interface & Blink Controls
* **Three Viewing Modes**:
  1. *Alternating Blink Mode*: The primary discovery mode. Flips sequentially between observation epochs at a user-defined rate (1 Hz to 15 Hz) with Play/Pause, step-forward, step-backward, and epoch timestamps.
  2. *Split-Curtain Swipe Mode*: An interactive vertical divider that users drag horizontally across the viewport to compare Epoch A on the left and Epoch B on the right, isolating morphological shifts without flicker.
  3. *Side-by-Side Synchronized Mode*: Two parallel viewports with locked zoom and pan coordinates for side-by-side epoch comparison.
* **Astronomical Contrast & Stretch Functions**:
  - Implements the **ZScale algorithm** (samples background noise distribution to calculate automatic minimum and maximum display cutoffs, avoiding blown-out star cores or completely dark backgrounds).
  - Manual sliders for **Asinh (arcsine hyperbolic)** and **Logarithmic** stretches.
  - Perceptually uniform colormaps: Inverted Grayscale (`grayscale_r`), `inferno`, and `viridis`.

#### B. Spectroscopy & Point Selection (102 Near-IR Bands)
* **Photometric Extraction**:
  - *Point Click*: Instant sampling of the single pixel under the crosshair.
  - *Circular Aperture (Default)*: User-adjustable radius (1 to 3 pixels / ~6″ to 18″) with background annulus subtraction, summing flux across the Point Spread Function (PSF) for calibrated spectral extraction.
* **Spectral Diagnostic Line Overlays**:
  - Displays molecular absorption markers across 0.75–5.0 µm:
    - Water ice ($H_2O$) at $3.05\ \mu\text{m}$
    - Hydrocarbon / PAH emission at $3.30\ \mu\text{m}$
    - Carbon dioxide ice ($CO_2$) at $4.27\ \mu\text{m}$
    - Carbon monoxide gas/ice ($CO$) at $4.67\ \mu\text{m}$
* **Interactive Wavelength Scrubber**: Hovering or scrubbing across the spectrum dynamically highlights the corresponding bandpass cutout in the image viewport.

#### C. Data Ingestion, Fallback & Quality Masking
* **MOC Spatial Filtering & Fallback Protocol**:
  - Query coordinates are evaluated against the SPHEREx Multi-Order Coverage (MOC) index.
  - Coordinates inside the footprint receive 102-band SPHEREx cutouts.
  - Coordinates outside the footprint receive multi-epoch unWISE / AllWISE coadds (W1: 3.4 µm, W2: 4.6 µm) with a clear UI badge: `"Survey: unWISE Multi-Epoch (SPHEREx footprint unobserved for this coordinate)"`.
* **Data Quality & Cosmic Ray Masking**:
  - SPHEREx Data Quality (DQ) flag arrays mask out saturated pixels, dead pixels, and cosmic ray hits, surfacing an on-screen warning flag when a selected source is contaminated.

#### D. Data Export & Session Sharing
* **Scientific Export Formats**:
  - *FITS Cutout*: Download 32-bit calibrated FITS file with complete WCS headers for analysis in DS9, Astropy, or Topcat.
  - *Spectral Table (CSV / JSON)*: Download the 102-band table with columns: `wavelength_um`, `flux_mjy`, `flux_err_mjy`, `band_id`, `quality_flag`.
  - *Animation Export (Animated GIF / MP4)*: One-click export of the current blink animation loop.
* **Deep Linking**:
  - Serializes complete viewport state into the URL query parameters:
    `?ra=133.7951&dec=-7.2451&fov=5.0&epochA=2025-05&epochB=2025-11&mode=blink&stretch=zscale`

### 3. Inventive Contradictions & Systematic Resolutions (`egm-inventive-catalyst`)
* **Contradiction 1 (High-Dimensional Depth vs. Network Latency):**
  *Resolution (Spectral Skeleton & Progressive Streaming):* The server immediately returns a compact 1D spectral vector ($102 \times \text{Float32} = 408\text{ bytes}$) and a 3-color preview composite ($< 50\text{ KB}$), rendering the SED plot and initial view in $< 300\text{ ms}$. Additional time-series epochs stream progressively into the client's texture buffer.
* **Contradiction 2 (Rigorous Image Differencing vs. Lightweight Client Compute):**
  *Resolution (Dual-Mode Differencing):* The browser executes instant client-side normalized variance differencing ($\Delta = \frac{I_1 - \mu_1}{\sigma_1} - \frac{I_2 - \mu_2}{\sigma_2}$) in a Web Worker for interactive scrubbing, while providing an on-demand server-side PSF-matched subtraction for rigorous transient confirmation.
* **Contradiction 3 (Discontinuous Footprints vs. Cohesive Mental Model):**
  *Resolution (Visual Provenance Bridge & MOC Radar):* An interactive mini-radar indicator shows the exact SPHEREx survey boundary relative to the query coordinate. When outside coverage, fallback WISE data is explicitly highlighted as a comparative baseline.
* **Contradiction 4 (Strict Blink Frequency vs. Network Latency Jitter):**
  *Resolution (Phase-Locked Texture Buffer):* The blink engine runs on an internal timer loop decoupled from network fetches. If an epoch is still loading, it alternates between already-loaded frames and expands the loop as new epochs pass validation.

## Goals vs. Non-Goals

### In-Scope Goals
* **Coordinate & Name Resolution:** Coordinate search (decimal degrees and sexagesimal `hh:mm:ss dd:mm:ss`) and automatic object name resolution via the CDS Sesame API.
* **Time-Series Blink Comparator:** Interactive flipbook player with Play/Pause, adjustable frame rate (1–15 Hz), single-frame stepping, and epoch timestamps.
* **Multi-Mode Viewports:** Alternating blink, split-curtain swipe, and side-by-side synchronized viewports.
* **Image Differencing:** Real-time normalized subtraction between selectable epochs with dipole artifact suppression.
* **102-Band Spectral Profiler:** Interactive line chart showing the 102-band flux distribution across 0.75–5.0 µm with molecular line markers ($H_2O$, $CO_2$, $CO$, PAHs) and aperture photometry.
* **Automated WISE Fallback:** Transparent fallback to multi-epoch AllWISE/NEOWISE data when SPHEREx data is unavailable for the requested coordinates.
* **Benchmark Presets:** Built-in one-click bookmarks for Barnard's Star, WISE 0855, Epsilon Indi B, RW Aurigae, and R Draconis.
* **Scientific Metadata & Deep Linking:** WCS coordinate display, FITS header viewer, raw FITS export, CSV spectral export, and shareable URL query parameters (`?ra=...&dec=...&fov=...`).

### Out-of-Scope Non-Goals
* **Machine Learning / Automated Detection:** Automated candidate identification, computer-vision bounding boxes, or automated transient classification pipelines.
* **User Accounts & Authentication:** User profiles, saved personal collections, or community discussion forums.
* **Full-Sky Raw Data Hosting:** Hosting the complete multi-terabyte raw SPHEREx archive; queries rely on dynamic cutout extraction and caching.

## Alternatives Weighed

* **Pure Client-Side Architecture (JavaScript FITS Parsing in Browser):**
  *Rejected by author:* Fetching 102 raw FITS slices per epoch directly into the browser leads to high bandwidth consumption, browser tab memory exhaustion, and CORS query failures against external NASA archives.
* **Pure Server-Side Video Streaming (Server-Rendered Video Streams):**
  *Rejected by author:* Encoding time-series animations on the server and streaming video to clients creates high server load and introduces network lag into play/pause controls.
* **Static Pre-Cached Prototype Only:**
  *Rejected by author:* Limiting the application to a hardcoded set of 2–3 targets prevents general utility for arbitrary sky exploration.

## Key Decisions & Staging for Next Steps

* **Backend Stack:** Python (FastAPI, Astropy, Reproject, MOCPy, HTTPX) deployed to **Hugging Face Spaces** (2 vCPU, 16 GB RAM, zero sysadmin overhead, HTTPS API out-of-the-box).
* **Frontend Stack:** Modern lightweight web client (React/Vite, HTML5 Canvas/WebGL, Chart.js/Plotly.js for spectroscopy) deployed to Vercel or Netlify.
* **Storage & Caching:** Bounded disk cache within Hugging Face Spaces (capped at 500 MB with LRU eviction) to eliminate external NASA archive rate-limiting without exceeding container limits.
* **Data Flow Contract:** Compact binary/quantized multi-epoch rasters paired with JSON WCS metadata and a 1D 102-band flux vector.
* **Staging:** Proceed to `/egm:egm-draft` to formalize the technical specification, data contracts, and implementation plan.
