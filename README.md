# SPHEREx Sky Explorer: All-Sky Hyperspectral Telemetry & Multi-Epoch Imagery

[![Python Tests](https://img.shields.io/badge/pytest-10%20passed-brightgreen.svg)](#verification--test-suite)
[![Vite Build](https://img.shields.io/badge/vite-built%20in%20285ms-blue.svg)](#frontend-client)
[![SPHEREx Survey](https://img.shields.io/badge/SPHEREx-0.75--5.0%20%C2%B5m-orange.svg)](#102-band-spectrophotometry)
[![unWISE Multi-Epoch](https://img.shields.io/badge/NASA%20unWISE-All--Sky%20FITS-blueviolet.svg)](#multi-order-coverage-moc-indexing--unwise-fallback)

The **SPHEREx Sky Explorer** is a high-performance astronomical web application designed to explore NASA's SPHEREx (*Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer*) 102-band near-infrared all-sky survey (0.75–5.0 µm) alongside NASA unWISE/NEOWISE multi-epoch time-series cutouts.

---

## 🌟 Key Features

### 1. Multi-Epoch Cutout Viewport
* **Four Independent Viewport Modes:**
  * **Blink (1–15 Hz):** Phase-locked progressive time-series blink loop across survey epochs with adjustable cadence.
  * **Split-Curtain (Swipe):** Interactive split-curtain comparison slider with sub-pixel alignment.
  * **Side-by-Side:** Synchronized dual-canvas comparative inspection.
  * **Static Pictures:** Step manually through individual survey epochs using Left/Right navigation arrows without automatic playback.
* **One-Click Video Clip Export:** Capture high-cadence time-series animations directly from the canvas via `captureStream` + `MediaRecorder` into `.webm` or `.mp4` video files.
* **Full-Screen Scene View & Editor (`/scene`):** Expand any coordinate pointing to full screen with custom instant naming, 5-second video recording, and direct saving to your Personal Sky Library.

### 2. 102-Band Spectrophotometry & Click-to-Sample WCS Extraction
* **WCS Click-to-Sample Extraction:** Clicking any star or sky coordinate in the 512×512 cutout automatically unprojects pixel `(x, y)` to celestial `(RA, Dec)` via tangent-plane WCS and streams the exact 102-band spectrum at that spot.
* **Molecular Absorption Overlays:** Pre-calibrated rest-frame bandheads for interstellar and planetary ices:
  * $\text{H}_2\text{O}$ Ice (3.05 µm)
  * $\text{PAH}$ Polycyclic Aromatic Hydrocarbons (3.30 µm)
  * $\text{CO}_2$ Ice (4.27 µm)
  * $\text{CO}$ Carbon Monoxide (4.67 µm)
* **Variable Aperture Radius:** Dynamically adjust synthetic photometric apertures (1 px / ~6″, 2 px / ~12″, 3 px / ~18″) to analyze point-source stellar cores versus extended circumstellar disks.

### 3. Dual-Engine Astronomical Differencing
* **Fast WebGL Normalized Variance Differencing:** Real-time 60 fps client-side image subtraction:
  $$\Delta_{\text{norm}}(x,y) = \frac{I_A(x,y) - \mu_A}{\sigma_A} - \frac{I_B(x,y) - \mu_B}{\sigma_B}$$
* **Server-Side PSF-Matched Convolution (`POST /api/diff`):** Eliminates seeing and pixel scale variations using Alard-Lupton multi-Gaussian kernel matching to verify true astrophysical transients and proper motion dipoles.

### 4. Interactive All-Sky MOC Footprint Radar (`MocRadar`)
* **Inverse Aitoff Projection:** Click anywhere on the full-sky celestial globe to unproject screen coordinates into `(RA, Dec)` and immediately stream cutouts and spectra.
* **$O(1)$ Spatial Footprint Routing:** Automatic HEALPix Multi-Order Coverage verification checks whether a target lies inside the primary survey or falls outside (Galactic plane $|b| < 6^\circ$).
* **Transparent NASA unWISE Fallback:** Coordinates outside early SPHEREx coverage automatically route to multi-epoch NASA unWISE/NEOWISE FITS cutouts (`allwise`, `neo2`, `neo5`, `neo7`) reprojected with Astropy WCS.

### 5. Personal Sky Library & Cross-Browser JSON Sync (`/library`)
* Store interesting coordinates, observation configurations, and transient candidates directly in local browser storage.
* One-click **Export JSON** and **Import JSON** to back up and share saved target lists across machines.

### 6. Live NASA/IPAC IRSA TAP Query Hook (`/api/tap/query`)
* Direct Table Access Protocol (TAP) integration with NASA/IPAC IRSA (`https://irsa.ipac.caltech.edu/TAP/sync`).
* Query public all-sky infrared source catalogs (e.g., `allwise_p3as_psd`, `fp_psc`) and SPHEREx DR1 survey tiles with ADQL cone searches.

---

## ⚡ Architecture & Binary Protocol

```
Browser Client (Vite + React)
  ├── Web Worker Ring Buffer (Off-Main-Thread Decoupled Clock)
  ├── 16-Slot Texture LRU (gl.R16UI Fragment Shader Expansion)
  └── WCS Click-to-Sample Coordinate Unprojector
          │
          ▼  Compact Binary Wire Protocol
FastAPI Proxy Daemon (Python 3.14 + Uvicorn)
  ├── /api/jobs/cutouts ───► 202 Accepted Async Ingestion Queue
  ├── /api/data/raster/{key} ───► 524 KB uint16 Binary Raster (WCS Headers)
  ├── /api/spectrum ────────► 408-Byte Float32 Fast-Path Spectral Vector
  ├── /api/diff ────────────► Alard-Lupton PSF Convolution Engine
  ├── /api/tap/query ───────► Live NASA/IPAC IRSA TAP Hook
  └── 500 MB Bounded LRU Disk Cache (High: 480 MB, Low: 380 MB)
```

### uint16 Astronomical Raster Specification
* **Binary Payload:** $512 \times 512 \times 2\text{ bytes} = 524,288\text{ bytes}$ (`application/octet-stream`).
* **Linear Quantization:**
  $$I = \text{clamp}_{0}^{65535}\left(\left\lfloor \frac{F - \text{BZERO}}{\text{BSCALE}} + 0.5 \right\rfloor\right)$$
* **Dynamic Range Preservation:** $\text{BSCALE}$ and $\text{BZERO}$ derived from $p_{0.05}$ and $p_{99.95}$ percentiles, preserving $> 15$ quantization levels across the $1\sigma_{\text{sky}}$ background noise floor.
* **HTTP Metadata Headers:**
  ```http
  X-Raster-Dimensions: 512,512
  X-Raster-Bitpix: 16
  X-BSCALE: 1.113424e+00
  X-BZERO: -1.043962e+01
  X-BUNIT: MJy/sr
  X-WCS-CRVAL: 269.452100,4.693400
  X-WCS-CRPIX: 256.5,256.5
  X-WCS-CDELT: -0.0001628,0.0001628
  X-WCS-CTYPE: RA---TAN,DEC--TAN
  X-Observation-Epoch: 2025-05-14T08:22:19Z
  X-Survey-Provenance: SPHEREx-Survey1
  X-Band-Index: 42
  X-Band-Wavelength-Um: 2.475
  ```

---

## 🚀 Quickstart & One-Command Launcher

### One-Command Launch
To boot both the backend FastAPI proxy and frontend Vite dev server simultaneously:

```bash
cd spherex_sky_explorer_NASA
./start.sh
```

Both services will start automatically:
- **Frontend Web Client:** [http://127.0.0.1:5173](http://127.0.0.1:5173/)
- **Backend FastAPI API:** [http://127.0.0.1:8000](http://127.0.0.1:8000/)
- **Interactive OpenAPI Docs:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

*(Press `Ctrl+C` to cleanly shut down both servers.)*

---

### Manual Setup

#### Backend Setup
```bash
cd spherex_sky_explorer_NASA/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000
```

#### Frontend Setup
```bash
cd spherex_sky_explorer_NASA/frontend
npm install
npm run dev
```

---

## 🧪 Verification & Test Suite

### Run Backend Pytest Suite (10 Tests)
```bash
cd spherex_sky_explorer_NASA/backend
.venv/bin/pytest -v
```
*Coverage includes MOC spatial indexing, CDS Sesame 302 redirection, 408-byte spectral fast-path, tangent-plane WCS reprojection, 202 polling queues, uint16 raster streaming, PSF-matched differencing, and NASA/IPAC IRSA TAP query hooks.*

### Run Frontend Production Build
```bash
cd spherex_sky_explorer_NASA/frontend
npm run build
```

---

## 🔭 Benchmark Targets

| Target Name | RA (deg) | Dec (deg) | Survey / Footprint | Science Features |
| :--- | :--- | :--- | :--- | :--- |
| **Barnard's Star** | `269.4521` | `+4.6934` | SPHEREx Primary (MOC IN) | High proper motion ($10.37''/\text{yr}$), strong $\text{H}_2\text{O}$ and $\text{CO}$ ice bandheads |
| **WISE 0855** | `133.7951` | `-7.2451` | SPHEREx Primary (MOC IN) | Coldest known brown dwarf ($250\text{ K}$), deep methane & $\text{CO}_2$ absorption |
| **Epsilon Indi B** | `331.0764` | `-56.7865` | SPHEREx Primary (MOC IN) | Binary T-dwarf benchmark, silicate cloud absorption |
| **RW Aurigae** | `76.9538` | `+30.4014` | SPHEREx Primary (MOC IN) | Classical T Tauri star with high circumstellar variability |
| **North Ecliptic Pole** | `270.0000` | `+66.5600` | SPHEREx Deep Field (NEP) | Maximum observational redundancy, deep cosmological field |
| **Galactic Center (Sgr A\*)** | `266.4168` | `-29.0078` | unWISE Fallback (MOC OUT) | Dense stellar field ($|b| < 6^\circ$), multi-epoch NEOWISE FITS coadds |
