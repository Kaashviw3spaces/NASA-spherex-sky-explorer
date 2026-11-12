# SPHEREx Sky Explorer: Technical Implementation Plan & Binary Protocol Specification

* **Author:** ashwinanand
* **Date:** 2026-11-12
* **Feature Concept:** High-Performance Binary Protocol & Asynchronous Architecture for SPHEREx/unWISE Astronomical Cutouts, Spectroscopy, and Differencing

---

## 1. Executive Summary & Problem Formulation

The SPHEREx Sky Explorer provides interactive web access to multi-epoch, 102-band near-infrared spectrophotometric sky surveys. Serving multi-epoch hyperspectral astronomical rasters directly from upstream NASA archives (IPAC / IRSA) to consumer browsers presents four fundamental architectural bottlenecks:
1. **Network Bandwidth & Memory Limits:** Full 32-bit FITS cutouts for multi-epoch, multi-band fields exceed browser memory budgets and mobile network constraints.
2. **Upstream Latency & Timeouts:** Uncached upstream archive queries and reprojection operations take 2–8 seconds, triggering HTTP gateway timeouts (e.g., Hugging Face Spaces 30s limits) under concurrent load.
3. **Differencing Compute Discrepancies:** Rigorous astronomical image differencing requires Point Spread Function (PSF) convolution kernel matching, which is too computationally heavy for 60 fps client-side manipulation, while simple subtraction produces false dipole artifacts due to seeing and pixel scale variations.
4. **Coverage Discontinuities & Scientific Truth:** SPHEREx survey coverage is progressive and footprint-bound. Synthesizing or interpolating unobserved coordinates is scientifically unacceptable; yet leaving users with blank screens degrades utility.

To resolve these challenges, this technical plan defines an asynchronous FastAPI proxy paired with a GPU-accelerated client running a phase-locked Web Worker ring buffer, communicating over a compact binary protocol (`application/octet-stream` quantized uint16 rasters with HTTP WCS headers and a 408-byte fast-path 1D spectral vector), backed by MOC-indexed unWISE fallback, dual-mode differencing, and a bounded 500 MB LRU disk cache.

---

## 2. Multi-Lens Architectural Synthesis

### A. Binary Protocol & Quantization (`egm-codebase-details`, `egm-structural`)
* **uint16 Astronomical Raster Framing (`application/octet-stream`):**
  - Pixels are linearly quantized from physical flux units ($F$, in $\text{MJy/sr}$) to 16-bit unsigned integers ($I \in [0, 65535]$):
    $$I = \text{clamp}_{0}^{65535}\left(\left\lfloor \frac{F - \text{BZERO}}{\text{BSCALE}} + 0.5 \right\rfloor\right)$$
  - **Dynamic Range Preservation:** To guarantee that background noise is not quantized away (preserving Gaussian sky variance for photometry and differencing), $\text{BSCALE}$ is computed dynamically per cutout:
    $$\text{BSCALE} = \frac{F_{\text{max}} - F_{\text{min}}}{65535}, \quad \text{BZERO} = F_{\text{min}}$$
    where $F_{\text{min}}$ and $F_{\text{max}}$ are robust percentiles ($p_{0.05}$ and $p_{99.95}$) with outlier preservation, guaranteeing $> 15$ quantization levels across the $1\sigma_{\text{sky}}$ background noise floor.
* **Metadata Transmission via HTTP Headers:**
  - Raster geometry and astrometric World Coordinate System (WCS) parameters are encoded directly in HTTP response headers, avoiding payload serialization overhead:
    ```http
    Content-Type: application/octet-stream
    Content-Length: 524288
    X-Raster-Dimensions: 512,512
    X-Raster-Bitpix: 16
    X-BSCALE: 1.245892e-04
    X-BZERO: -0.158204
    X-BUNIT: MJy/sr
    X-WCS-CRVAL: 133.795123,-7.245102
    X-WCS-CRPIX: 256.5,256.5
    X-WCS-CDELT: -0.0017222,0.0017222
    X-WCS-CTYPE: RA---TAN,DEC--TAN
    X-Observation-Epoch: 2025-05-14T08:22:19Z
    X-Survey-Provenance: SPHEREx-Survey1
    X-Band-Index: 42
    X-Band-Wavelength-Um: 2.152
    ```
* **Client-Side GPU Dequantization:**
  - In the WebGL rendering pipeline, the 16-bit texture (`gl.R16UI`) is sampled in the fragment shader and converted back to physical float values at zero CPU overhead:
    ```glsl
    precision highp float;
    uniform highp usampler2D u_raster;
    uniform float u_bscale;
    uniform float u_bzero;
    uniform float u_vmin;
    uniform float u_vmax;

    void main() {
        uint raw_val = texture(u_raster, v_texCoord).r;
        float phys_flux = float(raw_val) * u_bscale + u_bzero;
        float norm = clamp((phys_flux - u_vmin) / (u_vmax - u_vmin), 0.0, 1.0);
        gl_FragColor = vec4(vec3(norm), 1.0);
    }
    ```
* **408-Byte Fast-Path 1D Spectral Vector:**
  - A point or aperture click immediately requests `/api/spectrum?ra={ra}&dec={dec}&radius_arcsec={r}`.
  - Returns raw little-endian binary: `102 channels x 4-byte IEEE 754 Float32 = 408 bytes`.
  - Transferred directly to `Float32Array(buffer)` in JavaScript without JSON parsing or string allocation, rendering the full SED plot in $< 15\text{ ms}$.

---

### B. Asynchronous Polling Queue & Phase-Locked Ring Buffer (`egm-structural`, `egm-implementation-readiness`)
* **Asynchronous Lifecycle (`202 Accepted`):**
  - Client submits coordinate query: `POST /api/jobs/cutouts` with `{ ra, dec, fov_arcmin, epochs, bands }`.
  - If cutouts exist in the local 500 MB disk cache: Immediate `200 OK` with binary raster URLs.
  - If uncached: Server schedules upstream fetch and regrid jobs, returning `202 Accepted`:
    ```json
    {
      "job_id": "job_9f82c4a1",
      "status": "pending",
      "poll_interval_ms": 350,
      "estimated_wait_ms": 1200,
      "status_url": "/api/jobs/job_9f82c4a1"
    }
    ```
  - Client polls `/api/jobs/{id}` with exponential backoff capped at 1.5s. As individual epoch cutouts complete, the endpoint returns partial completion arrays, enabling progressive ingestion.
* **Phase-Locked Web Worker Ring Buffer:**
  - A dedicated Web Worker manages texture fetching, decoding, and memory buffering off the main thread.
  - Ring buffer capacity: 16 slots ($16 \times 512\text{ KB} = 8\text{ MB}$ total buffer footprint).
  - **Decoupled Frame Clock:** The blink loop runs at the exact target cadence (1–15 Hz) on an internal high-resolution timer.
  - **Dynamic Sub-Cadence Adaptation:** If Epoch 1 and Epoch 2 are ready while Epoch 3 is still streaming, the ring buffer toggles Phase 1 $\leftrightarrow$ Phase 2 without dropping frames or stalling the UI. As soon as Epoch 3 passes checksum validation, it is inserted into the phase ring on the subsequent loop cycle.

---

### C. Bifurcated Image Differencing Architecture (`egm-design`, `egm-codebase-details`)
* **Layer 1: Interactive Client-Side Variance Subtraction (Zero Latency):**
  - Executed instantly in the WebGL fragment shader or Web Worker:
    $$\Delta_{\text{norm}}(x,y) = \frac{I_A(x,y) - \mu_A}{\sigma_A} - \frac{I_B(x,y) - \mu_B}{\sigma_B}$$
  - Allows instantaneous scrubbing between any two epochs at 60 fps to spot obvious transients or high-proper-motion targets.
* **Layer 2: On-Demand Server-Side PSF-Matched Differencing (`POST /api/diff`):**
  - High-proper-motion or seeing variations create dipolar subtraction artifacts (positive/negative adjacent residual lobes) in naive differencing.
  - Clicking **"Confirm Transient (PSF Matched)"** triggers:
    `POST /api/diff` with `{ epoch_a_id, epoch_b_id, kernel: "alard_lupton" }`.
  - Backend derives the spatial convolution kernel $K$ such that $\| I_A * K - I_B \|_2$ is minimized (using `scikit-image` / `astropy.convolution` Gaussian-Hermite basis decomposition).
  - Returns a PSF-matched difference raster over the binary protocol.
  - The client UI cross-fades from the variance preview to the calibrated PSF-matched difference raster, displaying a Dipole Rejection Confidence score.

---

### D. Multi-Order Coverage (MOC) Indexing & Strict Provenance (`egm-zoom-out`, `egm-comprehension`)
* **$O(1)$ Footprint Verification:**
  - Upstream SPHEREx survey footprints are indexed via HEALPix Multi-Order Coverage (MOC) maps (order 10, resolution $\sim 3.4'$).
  - Before initiating any external NASA archive network requests, the proxy checks the coordinate against the in-memory MOC tree in $< 0.2\text{ ms}$.
* **Transparent unWISE Fallback Protocol:**
  - If inside SPHEREx coverage: streams 102-band SPHEREx data.
  - If outside SPHEREx coverage: automatically routes to unWISE / NEOWISE coadds (W1 3.4 µm, W2 4.6 µm).
  - Regrids unWISE (native 2.75″/pixel) to the requested WCS tangent projection grid using `reproject.reproject_interp` with flux conservation.
* **Invariant: Zero Synthetic Observations:**
  - The backend will **never** generate synthetic, mocked, or interpolated flux values for unobserved coordinates.
  - If an observation is missing or corrupted by cosmic rays/detector saturation, the server returns the raw DQ (Data Quality) flag mask.
  - The client UI displays an unambiguous, high-contrast provenance badge:
    - `[SPHEREx Primary Survey: Epoch 2025.5 | 102 Bands]` (Green badge)
    - `[unWISE Multi-Epoch Archive: 2 Bands | SPHEREx Footprint Pending]` (Amber badge)
  - In the SED viewer, unWISE fallback photometric points are explicitly rendered with broad horizontal filter bandpass error bars (W1: 3.0–3.8 µm, W2: 4.1–5.2 µm) to prevent users from mistaking broad-band points for resolved 102-channel spectrophotometry.

---

### E. Bounded 500 MB LRU Disk Cache & Lifecycle Safety (`egm-implementation-readiness`)
* **Hugging Face Spaces Storage Constraints:**
  - Ephemeral container environment with bounded local disk allocation.
  - Cache Directory: `/tmp/spherex_cache` managed by an atomic, thread-safe LRU directory index (`diskcache.Cache`).
* **Eviction Watermarks:**
  - High Watermark: 480 MB (triggers asynchronous pruning of least-recently-used cutouts).
  - Low Watermark: 380 MB (target disk usage after pruning).
  - Single raster cache key: `SHA256(ra_dec_fov_epoch_band_wcs)`.
  - Max retention of completed jobs: 2 hours.
* **Client GPU Texture Eviction:**
  - Textures in WebGL contexts are explicitly tracked in an LRU array. When moving to a new coordinate, non-visible textures invoke `gl.deleteTexture()` to prevent mobile browser tab crashes.

---

## 3. Systematic Inventive Contradictions & Resolutions (`egm-inventive-catalyst`)

| Contradiction | Technical Conflict | TRIZ / Inventive Principle | Architectural Resolution |
| :--- | :--- | :--- | :--- |
| **1. Dynamic Range vs. Network Footprint** | Science requires 32-bit floating point precision; low-power mobile clients choke on heavy FITS payloads. | **Segmentation & Parameter Changes** | Dynamic BSCALE/BZERO uint16 quantization preserving $>15$ levels across background noise $\sigma$, shifting float expansion to WebGL fragment shader. |
| **2. Cadence Phase Lock vs. Upstream Jitter** | Blinking demands strict, flicker-free 1–15 Hz timing; upstream archive fetching exhibits severe network jitter. | **Equipotentiality & Prior Action** | Decoupled Web Worker clock with dynamic sub-cadence phase ring buffer. Blinks verified frames immediately, expanding phase circle seamlessly. |
| **3. Instant Responsiveness vs. PSF Differencing** | Real-time slider subtraction must run at 60 fps; PSF kernel convolution requires matrix inversion and takes seconds. | **Bifurcated Processing & Asynchrony** | Immediate client-side variance difference for interactive exploration; asynchronous background queue for PSF-matched confirmation. |
| **4. Footprint Discontinuity vs. Cohesive Experience** | Strict adherence to raw observation truth clashes with incomplete early SPHEREx survey footprints. | **Transparent Replacement & Optical Indicators** | Automated MOC spatial routing to unWISE coadds with astrometric regridding and strict provenance metadata badges and SED error bars. |

---

## 4. REST & Binary API Specification

### Endpoint Definitions

```yaml
openapi: 3.1.0
info:
  title: SPHEREx Sky Explorer Proxy API
  version: 1.0.0
paths:
  /api/coverage:
    get:
      summary: O(1) MOC Footprint & Survey Availability Check
      parameters:
        - name: ra
          in: query
          required: true
          schema: { type: number, minimum: 0.0, maximum: 360.0 }
        - name: dec
          in: query
          required: true
          schema: { type: number, minimum: -90.0, maximum: 90.0 }
      responses:
        '200':
          content:
            application/json:
              schema:
                type: object
                properties:
                  spherex_covered: { type: boolean }
                  primary_survey_epochs: { type: array, items: { type: string } }
                  unwise_fallback_available: { type: boolean }
                  moc_order: { type: integer, example: 10 }

  /api/jobs/cutouts:
    post:
      summary: Request Multi-Epoch Cutouts (Fast-Path Cache or Async 202 Queue)
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [ra, dec, fov_arcmin]
              properties:
                ra: { type: number }
                dec: { type: number }
                fov_arcmin: { type: number, default: 5.0, maximum: 15.0 }
                bands: { type: array, items: { type: integer }, example: [1, 25, 50, 75, 102] }
      responses:
        '200':
          description: All requested rasters available immediately in LRU cache
          content:
            application/json:
              schema:
                type: object
                properties:
                  status: { type: string, example: "ready" }
                  raster_urls: { type: array, items: { type: string } }
        '202':
          description: Cutouts enqueued for archive retrieval and reprojection
          content:
            application/json:
              schema:
                type: object
                properties:
                  job_id: { type: string }
                  status_url: { type: string }
                  poll_interval_ms: { type: integer, example: 400 }

  /api/data/raster/{cache_key}:
    get:
      summary: Stream Binary Quantized uint16 Astronomical Raster
      responses:
        '200':
          description: Binary uint16 array (512x512 = 524,288 bytes)
          headers:
            X-Raster-Dimensions: { schema: { type: string, example: "512,512" } }
            X-BSCALE: { schema: { type: number } }
            X-BZERO: { schema: { type: number } }
            X-WCS-CRVAL: { schema: { type: string } }
            X-WCS-CRPIX: { schema: { type: string } }
            X-WCS-CDELT: { schema: { type: string } }
          content:
            application/octet-stream:
              schema:
                type: string
                format: binary

  /api/spectrum:
    get:
      summary: Fast-Path 1D Spectrophotometric Vector
      parameters:
        - name: ra
          in: query
          required: true
          schema: { type: number }
        - name: dec
          in: query
          required: true
          schema: { type: number }
        - name: radius_arcsec
          in: query
          schema: { type: number, default: 6.2 }
      responses:
        '200':
          description: 408-byte Float32Array (102 bands x 4 bytes)
          content:
            application/octet-stream:
              schema:
                type: string
                format: binary

  /api/diff:
    post:
      summary: On-Demand Server-Side PSF-Matched Differencing
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [raster_key_a, raster_key_b]
              properties:
                raster_key_a: { type: string }
                raster_key_b: { type: string }
                kernel: { type: string, enum: ["alard_lupton", "gaussian"], default: "alard_lupton" }
      responses:
        '200':
          description: Calibrated PSF-matched difference raster (binary uint16)
          content:
            application/octet-stream:
              schema:
                type: string
                format: binary
```

---

## 5. Goals vs. Non-Goals

### In-Scope Goals
* **Binary Uint16 Protocol:** Quantized rasters with BSCALE/BZERO and HTTP WCS header injection.
* **408-Byte Spectral Fast-Path:** Instant binary 1D spectrophotometric extraction for point/aperture clicks.
* **Asynchronous Polling Queue:** 202 Accepted polling state machine feeding client Web Worker ring buffer.
* **Dual Differencing Engine:** Real-time WebGL normalized variance differencing + on-demand server-side PSF convolution matching (`POST /api/diff`).
* **MOC-Indexed Transparent unWISE Fallback:** O(1) spatial checking with unWISE W1/W2 reprojection and clear provenance badging.
* **Bounded 500 MB LRU Disk Cache:** Thread-safe high/low watermark pruning for Hugging Face Spaces.

### Out-of-Scope Non-Goals
* **Machine Learning / Automated Transient Classification:** No neural network bounding boxes or auto-alerting pipelines.
* **User Accounts / Cloud Database Storage:** Stateless operation without PostgreSQL/MongoDB or user login credentials.
* **Full-Sky FITS Warehouse:** On-demand cutout extraction and proxying only.

---

## 6. Alternatives Weighed

* **JSON Float32 Array Serialization:**
  *Rejected by author:* Over 2.5 MB per frame in JSON strings; unacceptable bandwidth consumption and GC pressure in browser threads.
* **Synchronous Long-Poll Blocking (15s HTTP Requests):**
  *Rejected by author:* Triggers reverse-proxy gateway timeouts and starves connection pools on Hugging Face Spaces.
* **Pure Client-Side PSF Differencing:**
  *Rejected by author:* Matrix inversion for 2D convolution kernels freezes JavaScript UI thread on consumer devices.

---

## 7. Key Decisions & Staging for Next Steps

* **Implementation Path:** Proceed to `/egm:egm-draft` or Phase 1 execution (FastAPI binary proxy scaffold, MOC loader, and Web Worker ring buffer).
