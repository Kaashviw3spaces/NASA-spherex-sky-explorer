import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Download,
  Share2,
  Search,
  SlidersHorizontal,
  Check,
  FileCode2,
  Sparkles
} from 'lucide-react';
import { BENCHMARK_TARGETS } from '../data/catalog';
import { generateSpectrum } from '../data/sed';
import { resolveQueryToTarget } from '../data/resolver';
import {
  fetchCutoutsWithPolling,
  fetchPsfDiffApi,
  fetchSpectrumApi,
  resolveTargetApi
} from '../api/client';
import {
  applyBandpassModulation,
  computeDifferenceBuffer,
  generateStarfieldBuffer
} from '../utils/astronomyRenderer';
import SpectrumChart from '../components/SpectrumChart';
import MocRadar from '../components/MocRadar';
import FitsHeaderModal from '../components/FitsHeaderModal';

export default function ExplorerPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTarget = useMemo(() => {
    const tId = searchParams.get('target');
    const ra = searchParams.get('ra');
    const dec = searchParams.get('dec');
    if (tId) {
      const found = BENCHMARK_TARGETS.find((t) => t.id === tId);
      if (found) return found;
    }
    if (ra && dec) return resolveQueryToTarget(`${ra}, ${dec}`, BENCHMARK_TARGETS);
    return BENCHMARK_TARGETS[1];
  }, []);

  const [target, setTarget] = useState(initialTarget);
  const [queryInput, setQueryInput] = useState(initialTarget.name);
  const [viewMode, setViewMode] = useState(searchParams.get('mode') || 'blink');
  const [stretch, setStretch] = useState(searchParams.get('stretch') || 'zscale');
  const [colormap, setColormap] = useState('inferno');
  const [gain, setGain] = useState(1.0);
  const [diffMode, setDiffMode] = useState(false);

  // Blink & progressive ring buffer state
  const [isPlaying, setIsPlaying] = useState(true);
  const [fps, setFps] = useState(3);
  const [epochIdx, setEpochIdx] = useState(0);
  const [curtainPos, setCurtainPos] = useState(0.5);
  const [liveFrames, setLiveFrames] = useState([]);
  const [backendStatus, setBackendStatus] = useState('connecting');
  const [psfDiffResult, setPsfDiffResult] = useState(null);
  const [psfLoading, setPsfLoading] = useState(false);

  // Spectroscopy & aperture state
  const [activeWavelength, setActiveWavelength] = useState(1.65);
  const [apertureRadius, setApertureRadius] = useState(2);
  const [showLines, setShowLines] = useState(true);
  const [sampleOffset, setSampleOffset] = useState(0);
  const [liveSpectrumBands, setLiveSpectrumBands] = useState(null);
  const [crosshair, setCrosshair] = useState({ x: 256, y: 256 });
  const [sampleCoords, setSampleCoords] = useState({
    ra: initialTarget.ra,
    dec: initialTarget.dec
  });
  const [copiedLink, setCopiedLink] = useState(false);
  const [showHeaderModal, setShowHeaderModal] = useState(false);

  const canvasPrimaryRef = useRef(null);
  const canvasSecondaryRef = useRef(null);
  const workerRef = useRef(null);
  const overlayRef = useRef({ crosshair, apertureRadius, curtainPos });

  useEffect(() => {
    overlayRef.current = { crosshair, apertureRadius, curtainPos };
  }, [crosshair, apertureRadius, curtainPos]);

  // Persistent Web Worker created ONCE (never terminated on slider drag)
  useEffect(() => {
    const worker = new Worker(new URL('../workers/rasterWorker.js', import.meta.url), {
      type: 'module'
    });
    worker.onmessage = (e) => {
      const { id, rgba, width, height } = e.data;
      const targetCanvas =
        id === 'secondary' ? canvasSecondaryRef.current : canvasPrimaryRef.current;
      if (!targetCanvas) return;
      if (targetCanvas.width !== width || targetCanvas.height !== height) {
        targetCanvas.width = width;
        targetCanvas.height = height;
      }
      const ctx = targetCanvas.getContext('2d');
      const imgData = new ImageData(rgba, width, height);
      ctx.putImageData(imgData, 0, 0);

      const { crosshair: ch, apertureRadius: ap, curtainPos: cp } = overlayRef.current;
      const scaleFactor = width / 512;
      const cx = ch.x;
      const cy = ch.y;

      ctx.strokeStyle = 'rgba(232, 141, 58, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, (ap * 9 + 6) * scaleFactor, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 16, cy);
      ctx.lineTo(cx - 6, cy);
      ctx.moveTo(cx + 6, cy);
      ctx.lineTo(cx + 16, cy);
      ctx.moveTo(cx, cy - 16);
      ctx.lineTo(cx, cy - 6);
      ctx.moveTo(cx, cy + 6);
      ctx.lineTo(cx, cy + 16);
      ctx.stroke();

      if (id === 'swipe') {
        const splitX = Math.floor(cp * width);
        ctx.strokeStyle = '#eceae4';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(splitX, 0);
        ctx.lineTo(splitX, height);
        ctx.stroke();
      }
    };
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  // Sync URL query params (Deep Linking)
  useEffect(() => {
    setSearchParams(
      {
        ra: target.ra.toFixed(4),
        dec: target.dec.toFixed(4),
        fov: target.fovArcmin.toFixed(1),
        epochA: target.epochs[0],
        epochB: target.epochs[target.epochs.length - 1],
        mode: viewMode,
        stretch,
        target: target.id
      },
      { replace: true }
    );
  }, [target, viewMode, stretch, setSearchParams]);

  // Fetch base multi-epoch cutouts ONLY when target changes (never clear/flash during slider scrub)
  useEffect(() => {
    const controller = new AbortController();
    setPsfDiffResult(null);

    fetchCutoutsWithPolling(
      {
        ra: target.ra,
        dec: target.dec,
        fovArcmin: target.fovArcmin,
        bands: [42]
      },
      (frames, isComplete) => {
        if (!controller.signal.aborted && (isComplete || frames.length >= 3)) {
          setLiveFrames(frames.slice(0, 16));
          setBackendStatus('live');
        }
      },
      controller.signal
    ).catch(() => {
      if (!controller.signal.aborted) {
        setBackendStatus('offline');
      }
    });

    return () => controller.abort();
  }, [target]);

  // Fetch 408-byte spectrum at clicked WCS coordinate (sampleCoords)
  useEffect(() => {
    const controller = new AbortController();
    fetchSpectrumApi(
      sampleCoords.ra,
      sampleCoords.dec,
      apertureRadius * 6.2,
      target.ra,
      target.dec,
      target.fovArcmin
    )
      .then((res) => {
        if (!controller.signal.aborted) {
          setLiveSpectrumBands(res.bands);
          setBackendStatus('live');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLiveSpectrumBands(null);
        }
      });
    return () => controller.abort();
  }, [target, sampleCoords, apertureRadius]);

  const fallbackSpectrum = useMemo(
    () => generateSpectrum(target, apertureRadius, sampleOffset),
    [target, apertureRadius, sampleOffset]
  );

  const activeBands = liveSpectrumBands || fallbackSpectrum.bands;

  // Compute normalized SED flux ratio [0.08, 1.0] at activeWavelength
  const sedRatio = useMemo(() => {
    if (!activeBands || activeBands.length === 0) return 0.7;
    let maxF = 0.001;
    let closest = activeBands[0];
    for (const b of activeBands) {
      if (b.flux > maxF) maxF = b.flux;
      if (Math.abs(b.wavelength - activeWavelength) < Math.abs(closest.wavelength - activeWavelength)) {
        closest = b;
      }
    }
    return Math.max(0.08, Math.min(1.0, closest.flux / maxF));
  }, [activeBands, activeWavelength]);

  // Pre-build offline fallback buffers per target so they never flicker
  const fallbackEpochs = useMemo(() => {
    return target.epochs.map((_, idx) => generateStarfieldBuffer(target, idx, 512).buffer);
  }, [target]);

  const frameCount = liveFrames.length > 0 ? liveFrames.length : fallbackEpochs.length;

  // Phase-locked blink timer
  useEffect(() => {
    if (viewMode !== 'blink' || !isPlaying || diffMode) return undefined;
    const interval = setInterval(() => {
      setEpochIdx((prev) => (prev + 1) % Math.max(1, frameCount));
    }, 1000 / fps);
    return () => clearInterval(interval);
  }, [viewMode, isPlaying, fps, frameCount, diffMode]);

  // Dispatch active raster (modulated in real time by activeWavelength & sedRatio) to Web Worker
  useEffect(() => {
    if (!workerRef.current) return;

    const useLive = liveFrames.length > 0;
    const size = 512;
    const lastIdx = (useLive ? liveFrames.length : fallbackEpochs.length) - 1;
    const safeIdx = epochIdx % Math.max(1, useLive ? liveFrames.length : fallbackEpochs.length);

    const rawA = useLive ? liveFrames[0].buffer : fallbackEpochs[0];
    const rawB = useLive ? liveFrames[lastIdx].buffer : fallbackEpochs[lastIdx];
    const rawCur = useLive ? liveFrames[safeIdx].buffer : fallbackEpochs[safeIdx];

    const bufA = applyBandpassModulation(rawA, size, target, 0, activeWavelength, sedRatio);
    const bufB = applyBandpassModulation(rawB, size, target, lastIdx, activeWavelength, sedRatio);
    const curBuf = applyBandpassModulation(rawCur, size, target, safeIdx, activeWavelength, sedRatio);

    const dispatch = (id, buf) => {
      workerRef.current.postMessage(
        { id, buffer: buf, width: size, height: size, stretch, colormap, gain },
        [buf.buffer]
      );
    };

    if (diffMode) {
      if (psfDiffResult) {
        const copy = new Float32Array(psfDiffResult.buffer);
        dispatch('primary', copy);
      } else {
        dispatch('primary', computeDifferenceBuffer(bufA, bufB));
      }
      return;
    }

    if (viewMode === 'blink') {
      dispatch('primary', curBuf);
    } else if (viewMode === 'swipe') {
      const combined = new Float32Array(size * size);
      const splitX = Math.floor(curtainPos * size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const idx = y * size + x;
          combined[idx] = x < splitX ? bufA[idx] : bufB[idx];
        }
      }
      dispatch('swipe', combined);
    } else if (viewMode === 'side-by-side') {
      dispatch('primary', bufA);
      dispatch('secondary', bufB);
    }
  }, [
    liveFrames,
    fallbackEpochs,
    target,
    epochIdx,
    activeWavelength,
    sedRatio,
    stretch,
    colormap,
    gain,
    viewMode,
    curtainPos,
    diffMode,
    psfDiffResult,
    crosshair,
    apertureRadius
  ]);

  const handleSearch = async (e) => {
    e.preventDefault();
    try {
      const resolved = await resolveTargetApi(queryInput);
      const nextTarget = {
        ...BENCHMARK_TARGETS[1],
        id: `api-${resolved.ra.toFixed(2)}-${resolved.dec.toFixed(2)}`,
        name: resolved.name,
        ra: resolved.ra,
        dec: resolved.dec,
        hmsDms: `${resolved.ra.toFixed(4)} deg, ${resolved.dec.toFixed(4)} deg`,
        inSpherexFootprint: resolved.spherex_covered,
        survey: resolved.spherex_covered ? 'SPHEREx 102-Band' : 'unWISE Multi-Epoch',
        epochs:
          resolved.primary_survey_epochs?.length > 0
            ? resolved.primary_survey_epochs.map((s) => s.slice(0, 7))
            : ['2014-03', '2019-09', '2023-09']
      };
      setTarget(nextTarget);
      setQueryInput(nextTarget.name);
      setSampleCoords({ ra: nextTarget.ra, dec: nextTarget.dec });
      setCrosshair({ x: 256, y: 256 });
    } catch {
      const local = resolveQueryToTarget(queryInput, BENCHMARK_TARGETS);
      setTarget(local);
      setQueryInput(local.name);
      setSampleCoords({ ra: local.ra, dec: local.dec });
      setCrosshair({ x: 256, y: 256 });
    }
    setEpochIdx(0);
    setSampleOffset(0);
  };

  const handlePsfConfirm = async () => {
    if (liveFrames.length < 2) return;
    setPsfLoading(true);
    try {
      const firstKey = liveFrames[0].cache_key;
      const lastKey = liveFrames[liveFrames.length - 1].cache_key;
      const res = await fetchPsfDiffApi(firstKey, lastKey, 'alard_lupton');
      setPsfDiffResult(res);
      setDiffMode(true);
    } finally {
      setPsfLoading(false);
    }
  };

  const handleCanvasClick = (e) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * canvas.width);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * canvas.height);
    setCrosshair({ x, y });
    setSampleOffset((x - canvas.width / 2) * 0.02 + (y - canvas.height / 2) * 0.02);

    // Convert clicked (x, y) on 512x512 cutout to WCS (RA, Dec)
    const degPerPx = (target.fovArcmin / 60) / canvas.width;
    const cosDec = Math.max(0.1, Math.cos((target.dec * Math.PI) / 180));
    const clickRa = ((target.ra - ((x - canvas.width / 2) * degPerPx) / cosDec) % 360 + 360) % 360;
    const clickDec = Math.max(-90, Math.min(90, target.dec + (y - canvas.height / 2) * degPerPx));
    setSampleCoords({ ra: clickRa, dec: clickDec });
  };

  const handleExportCsv = () => {
    const header = 'band_id,wavelength_um,flux_mjy,flux_err_mjy,quality_flag\n';
    const rows = activeBands
      .map((b) => `${b.bandId},${b.wavelength},${b.flux},${b.err},${b.qualityFlag}`)
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${target.id}_102band_sed.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJson = () => {
    const payload = {
      target: target.name,
      ra: target.ra,
      dec: target.dec,
      survey: target.survey,
      aperture_px: apertureRadius,
      bands: activeBands
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${target.id}_sed.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyDeepLink = () => {
    navigator.clipboard?.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 1800);
  };

  const activeFrameMeta = liveFrames[epochIdx % Math.max(1, liveFrames.length)]?.meta || {
    width: 512,
    height: 512,
    bitpix: 16,
    bscale: 1,
    bzero: 0,
    epoch: target.epochs[epochIdx % target.epochs.length],
    provenance: target.survey
  };
  const activeCacheKey = liveFrames[epochIdx % Math.max(1, liveFrames.length)]?.cache_key;

  return (
    <div className="explorer-shell">
      {/* Top Query & Provenance Toolbar */}
      <div className="explorer-toolbar">
        <form className="search-group" onSubmit={handleSearch}>
          <input
            className="coord-input"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Name, decimal (133.79, -7.24), or HMS/DMS (08:55:10 -07:14:42)"
            aria-label="Coordinate or target search"
          />
          <button type="submit" className="btn-compact">
            <Search size={13} /> Resolve
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className={`provenance-badge ${target.inSpherexFootprint ? 'spherex' : 'unwise'}`}>
            {target.inSpherexFootprint
              ? 'SPHEREx 102-Band'
              : 'unWISE Multi-Epoch (SPHEREx Unobserved)'}
          </span>
          <span
            className="mono"
            style={{
              fontSize: 11,
              color: backendStatus === 'live' ? '#52b788' : '#98a0ad'
            }}
          >
            {backendStatus === 'live' ? '● API Live' : '○ Offline Preview'}
          </span>
          <button type="button" className="btn-compact" onClick={handleCopyDeepLink}>
            {copiedLink ? <Check size={13} /> : <Share2 size={13} />}
            {copiedLink ? 'Copied' : 'Share'}
          </button>
          <Link to="/targets" className="btn-compact">
            Presets
          </Link>
        </div>
      </div>

      {/* Main 2-Column Instrument Grid */}
      <div className="explorer-grid">
        {/* Left: 3-Mode Cutout Viewport */}
        <section className="viewport-pane">
          <div className="control-strip">
            <div className="segmented" role="tablist" aria-label="Viewport Mode">
              <button
                type="button"
                className={viewMode === 'blink' ? 'active' : ''}
                onClick={() => setViewMode('blink')}
              >
                Blink
              </button>
              <button
                type="button"
                className={viewMode === 'swipe' ? 'active' : ''}
                onClick={() => setViewMode('swipe')}
              >
                Split-Curtain
              </button>
              <button
                type="button"
                className={viewMode === 'side-by-side' ? 'active' : ''}
                onClick={() => setViewMode('side-by-side')}
              >
                Side-by-Side
              </button>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`btn-compact ${diffMode ? 'active' : ''}`}
                onClick={() => {
                  setDiffMode((d) => !d);
                  setPsfDiffResult(null);
                }}
              >
                Δ Difference
              </button>
              {liveFrames.length >= 2 && (
                <button
                  type="button"
                  className={`btn-compact ${psfDiffResult ? 'active' : ''}`}
                  onClick={handlePsfConfirm}
                  disabled={psfLoading}
                >
                  <Sparkles size={12} />
                  {psfLoading ? 'Matching…' : 'Confirm PSF-Match'}
                </button>
              )}
              <select
                className="btn-compact"
                value={stretch}
                onChange={(e) => setStretch(e.target.value)}
                aria-label="Stretch function"
              >
                <option value="zscale">Stretch: ZScale</option>
                <option value="asinh">Stretch: Asinh</option>
                <option value="log">Stretch: Log</option>
              </select>
              <select
                className="btn-compact"
                value={colormap}
                onChange={(e) => setColormap(e.target.value)}
                aria-label="Colormap"
              >
                <option value="inferno">Map: Inferno</option>
                <option value="viridis">Map: Viridis</option>
                <option value="grayscale_r">Map: Grayscale_r</option>
              </select>
            </div>
          </div>

          <div
            className="canvas-stage"
            style={
              viewMode === 'side-by-side' && !diffMode
                ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: 8 }
                : undefined
            }
          >
            <div className="canvas-hud">
              <span className="hud-pill">
                {target.name} · {target.ra.toFixed(4)}°, {target.dec.toFixed(4)}°
              </span>
              <span className="hud-pill">
                {diffMode
                  ? psfDiffResult
                    ? `PSF-Matched Δ · Conf ${(psfDiffResult.meta.diffConfidence * 100).toFixed(0)}%`
                    : `Local Variance Δ (${target.epochs[0]} − ${target.epochs[target.epochs.length - 1]})`
                  : viewMode === 'swipe'
                    ? `${target.epochs[0]} | ${target.epochs[target.epochs.length - 1]}`
                    : `Epoch: ${activeFrameMeta.epoch?.slice(0, 10) || target.epochs[0]} · λ=${activeWavelength.toFixed(2)} µm (${Math.round(sedRatio * 100)}% flux)`}
              </span>
            </div>

            <canvas
              ref={canvasPrimaryRef}
              width={512}
              height={512}
              onClick={handleCanvasClick}
              style={{
                width: viewMode === 'side-by-side' && !diffMode ? '100%' : 'min(100%, 420px)',
                aspectRatio: '1 / 1',
                cursor: 'crosshair'
              }}
            />

            {viewMode === 'side-by-side' && !diffMode && (
              <canvas
                ref={canvasSecondaryRef}
                width={512}
                height={512}
                onClick={handleCanvasClick}
                style={{
                  width: '100%',
                  aspectRatio: '1 / 1',
                  cursor: 'crosshair'
                }}
              />
            )}
          </div>

          {/* Transport / Curtain / Gain / FITS Controls */}
          <div
            className="panel-box"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            {viewMode === 'blink' && !diffMode && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  className="btn-compact"
                  onClick={() => {
                    setIsPlaying(false);
                    setEpochIdx((i) => (i - 1 + frameCount) % frameCount);
                  }}
                  aria-label="Previous epoch"
                >
                  <SkipBack size={13} />
                </button>
                <button
                  type="button"
                  className="btn-compact active"
                  onClick={() => setIsPlaying((p) => !p)}
                >
                  {isPlaying ? <Pause size={13} /> : <Play size={13} />}
                  {isPlaying ? 'Pause' : 'Blink'}
                </button>
                <button
                  type="button"
                  className="btn-compact"
                  onClick={() => {
                    setIsPlaying(false);
                    setEpochIdx((i) => (i + 1) % frameCount);
                  }}
                  aria-label="Next epoch"
                >
                  <SkipForward size={13} />
                </button>
                <label className="mono" style={{ fontSize: 11, color: '#98a0ad', marginLeft: 6 }}>
                  {fps} Hz
                  <input
                    type="range"
                    min="1"
                    max="15"
                    value={fps}
                    onChange={(e) => setFps(Number(e.target.value))}
                    style={{ width: 76, marginLeft: 8, verticalAlign: 'middle' }}
                  />
                </label>
              </div>
            )}

            {viewMode === 'swipe' && !diffMode && (
              <label
                className="mono"
                style={{
                  fontSize: 11,
                  color: '#98a0ad',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flex: 1
                }}
              >
                Curtain ({Math.round(curtainPos * 100)}%)
                <input
                  type="range"
                  min="0.05"
                  max="0.95"
                  step="0.01"
                  value={curtainPos}
                  onChange={(e) => setCurtainPos(Number(e.target.value))}
                  style={{ flex: 1 }}
                />
              </label>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <label
                className="mono"
                style={{ fontSize: 11, color: '#98a0ad', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <SlidersHorizontal size={12} /> Gain {gain.toFixed(1)}×
                <input
                  type="range"
                  min="0.5"
                  max="2.5"
                  step="0.1"
                  value={gain}
                  onChange={(e) => setGain(Number(e.target.value))}
                  style={{ width: 74 }}
                />
              </label>
              <button type="button" className="btn-compact" onClick={() => setShowHeaderModal(true)}>
                <FileCode2 size={12} /> FITS Header
              </button>
              {activeCacheKey && (
                <a
                  href={`/api/export/fits?cache_key=${encodeURIComponent(activeCacheKey)}`}
                  className="btn-compact"
                >
                  <Download size={12} /> FITS
                </a>
              )}
            </div>
          </div>
        </section>

        {/* Right: 102-Band SED Profiler & Metadata */}
        <section className="sed-pane">
          <div className="panel-box">
            <div className="panel-header">
              <span className="panel-title">102-Band Spectral Energy Distribution</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className={`btn-compact ${showLines ? 'active' : ''}`}
                  onClick={() => setShowLines((s) => !s)}
                >
                  Ice Lines
                </button>
                <button type="button" className="btn-compact" onClick={handleExportCsv}>
                  <Download size={12} /> CSV
                </button>
                <button type="button" className="btn-compact" onClick={handleExportJson}>
                  <Download size={12} /> JSON
                </button>
              </div>
            </div>

            <SpectrumChart
              bands={activeBands}
              wiseBands={fallbackSpectrum.wiseBands}
              inSpherexFootprint={target.inSpherexFootprint}
              activeWavelength={activeWavelength}
              onSelectWavelength={setActiveWavelength}
              showLines={showLines}
            />
          </div>

          <MocRadar
            ra={target.ra}
            dec={target.dec}
            inFootprint={target.inSpherexFootprint}
            targetName={target.name}
            onSelectTarget={(bt) => {
              setTarget(bt);
              setQueryInput(bt.name);
              setSampleCoords({ ra: bt.ra, dec: bt.dec });
              setCrosshair({ x: 256, y: 256 });
              setEpochIdx(0);
            }}
          />

          <div className="panel-box">
            <div className="panel-header">
              <span className="panel-title">Aperture &amp; Wavelength Controls</span>
              <span className="mono" style={{ fontSize: 11, color: '#656d7a' }}>
                DQ: {target.dqFlag}
              </span>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              <label
                className="mono"
                style={{
                  fontSize: 11.5,
                  color: '#98a0ad',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span>Aperture Radius: {apertureRadius} px (~{apertureRadius * 6}″)</span>
                <input
                  type="range"
                  min="1"
                  max="3"
                  step="1"
                  value={apertureRadius}
                  onChange={(e) => setApertureRadius(Number(e.target.value))}
                  style={{ width: 140 }}
                />
              </label>

              <label
                className="mono"
                style={{
                  fontSize: 11.5,
                  color: '#98a0ad',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span>
                  Bandpass Slice: {activeWavelength.toFixed(2)} µm ({Math.round(sedRatio * 100)}% peak)
                </span>
                <input
                  type="range"
                  min="0.75"
                  max="5.0"
                  step="0.02"
                  value={activeWavelength}
                  onChange={(e) => setActiveWavelength(Number(e.target.value))}
                  style={{ width: 140 }}
                />
              </label>
            </div>
          </div>

          <div className="panel-box">
            <div className="panel-header">
              <span className="panel-title">WCS &amp; Target Telemetry</span>
              <span className="mono" style={{ fontSize: 11, color: '#52b788' }}>
                {liveFrames.length > 0 ? `${activeFrameMeta.width}×${activeFrameMeta.height} uint16` : '512×512 TAN'}
              </span>
            </div>
            <div className="mono" style={{ fontSize: 12, display: 'grid', gap: 6, color: '#98a0ad' }}>
              <div>ICRS: {target.hmsDms}</div>
              <div>Sampled: {sampleCoords.ra.toFixed(4)}°, {sampleCoords.dec.toFixed(4)}°</div>
              <div>Motion: {target.properMotion}</div>
              <div>Notes: {target.spectralNote}</div>
            </div>
          </div>
        </section>
      </div>

      {showHeaderModal && (
        <FitsHeaderModal
          meta={activeFrameMeta}
          target={target}
          onClose={() => setShowHeaderModal(false)}
        />
      )}
    </div>
  );
}
