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
  Sparkles,
  Maximize2,
  Video,
  Bookmark
} from 'lucide-react';
import { BENCHMARK_TARGETS } from '../data/catalog';
import { generateSpectrum } from '../data/sed';
import { resolveQueryToTarget } from '../data/resolver';
import {
  fetchCutoutsWithPolling,
  getCachedCutouts,
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
    return BENCHMARK_TARGETS[0];
  }, []);

  const [target, setTarget] = useState(initialTarget);
  const [queryInput, setQueryInput] = useState(initialTarget.name);
  const [viewMode, setViewMode] = useState(searchParams.get('mode') || 'blink');
  const [stretch, setStretch] = useState(searchParams.get('stretch') || 'zscale');
  const [colormap, setColormap] = useState(searchParams.get('colormap') || 'inferno');
  const [gain, setGain] = useState(1.0);
  const [diffMode, setDiffMode] = useState(searchParams.get('diff') === 'true' || searchParams.get('mode') === 'diff');

  // Blink & progressive ring buffer state
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(3);
  const [epochIdx, setEpochIdx] = useState(parseInt(searchParams.get('epoch') || '0', 10) || 0);
  const [curtainPos, setCurtainPos] = useState(parseFloat(searchParams.get('curtain') || '0.5') || 0.5);
  const [liveFrames, setLiveFrames] = useState(() => getCachedCutouts(initialTarget.ra, initialTarget.dec, initialTarget.fovArcmin) || []);
  const [backendStatus, setBackendStatus] = useState(
    getCachedCutouts(initialTarget.ra, initialTarget.dec, initialTarget.fovArcmin)?.length > 0 ? 'live' : 'connecting'
  );
  const [psfDiffResult, setPsfDiffResult] = useState(null);
  const [psfLoading, setPsfLoading] = useState(false);

  // Update target when searchParams change (e.g. from TargetsPage, Back, or deep links)
  useEffect(() => {
    const tId = searchParams.get('target');
    const ra = searchParams.get('ra');
    const dec = searchParams.get('dec');
    if (tId) {
      const found = BENCHMARK_TARGETS.find((t) => t.id === tId);
      if (found && found.id !== target.id) {
        setTarget(found);
        setQueryInput(found.name);
        setSampleCoords({ ra: found.ra, dec: found.dec });
        setEpochIdx(0);
        return;
      }
    }
    if (ra && dec) {
      const r = parseFloat(ra);
      const d = parseFloat(dec);
      if (!isNaN(r) && !isNaN(d) && (Math.abs(r - target.ra) > 0.0001 || Math.abs(d - target.dec) > 0.0001)) {
        const resolved = resolveQueryToTarget(`${r}, ${d}`, BENCHMARK_TARGETS);
        setTarget(resolved);
        setQueryInput(resolved.name);
        setSampleCoords({ ra: resolved.ra, dec: resolved.dec });
        setEpochIdx(0);
      }
    }
  }, [searchParams]);

  const buildSceneUrl = (action = 'view') => {
    const params = new URLSearchParams({
      ra: target.ra.toFixed(4),
      dec: target.dec.toFixed(4),
      fov: (target.fovArcmin || 5.0).toFixed(1),
      mode: diffMode ? 'diff' : viewMode,
      stretch,
      colormap,
      gain: String(gain),
      wavelength: activeWavelength.toFixed(2),
      epoch: String(epochIdx),
      title: target.name,
      target: target.id || '',
      diff: diffMode ? 'true' : 'false',
      curtain: curtainPos.toFixed(2),
      action
    });
    return `/scene?${params.toString()}`;
  };

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
  const [isRecordingBlink, setIsRecordingBlink] = useState(false);
  const [blinkRecordProgress, setBlinkRecordProgress] = useState(0);
  const blinkMediaRecorderRef = useRef(null);
  const blinkChunksRef = useRef([]);
  const blinkTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (blinkTimerRef.current) {
        clearInterval(blinkTimerRef.current);
        blinkTimerRef.current = null;
      }
      if (blinkMediaRecorderRef.current && blinkMediaRecorderRef.current.state !== 'inactive') {
        try {
          blinkMediaRecorderRef.current.stop();
        } catch (_) {}
      }
    };
  }, []);

  const handleRecordBlinkVideo = () => {
    const canvas = canvasPrimaryRef.current;
    if (!canvas || isRecordingBlink) return;

    try {
      if (!isPlaying) {
        setIsPlaying(true);
      }

      const stream = canvas.captureStream(30);
      let mimeType = 'video/webm';
      if (typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
          mimeType = 'video/webm;codecs=vp9';
        } else if (MediaRecorder.isTypeSupported('video/webm')) {
          mimeType = 'video/webm';
        } else if (MediaRecorder.isTypeSupported('video/mp4')) {
          mimeType = 'video/mp4';
        } else {
          mimeType = '';
        }
      }

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      blinkMediaRecorderRef.current = recorder;
      blinkChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          blinkChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const actualType = recorder.mimeType || mimeType || 'video/mp4';
        const blob = new Blob(blinkChunksRef.current, { type: actualType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const ext = actualType.includes('webm') ? 'webm' : 'mp4';
        const targetClean = (target.name || 'target').toLowerCase().replace(/[^a-z0-9]+/g, '_');
        a.download = `spherex_${targetClean}_blink.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
        setIsRecordingBlink(false);
        setBlinkRecordProgress(0);
      };

      recorder.start();
      setIsRecordingBlink(true);
      setBlinkRecordProgress(1);

      if (blinkTimerRef.current) clearInterval(blinkTimerRef.current);
      let sec = 1;
      blinkTimerRef.current = setInterval(() => {
        sec += 1;
        setBlinkRecordProgress(sec);
        if (sec >= 5) {
          if (blinkTimerRef.current) {
            clearInterval(blinkTimerRef.current);
            blinkTimerRef.current = null;
          }
          recorder.stop();
        }
      }, 1000);
    } catch (err) {
      console.error('Failed to capture blink video:', err);
      alert('Blink video recording is not supported in this browser.');
      setIsRecordingBlink(false);
    }
  };

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
        fov: (target.fovArcmin || 5.0).toFixed(1),
        epochA: target.epochs[0],
        epochB: target.epochs[target.epochs.length - 1],
        mode: viewMode,
        stretch,
        colormap,
        diff: diffMode ? 'true' : 'false',
        epoch: String(epochIdx),
        curtain: curtainPos.toFixed(2),
        target: target.id
      },
      { replace: true }
    );
  }, [target, viewMode, stretch, colormap, diffMode, epochIdx, curtainPos, setSearchParams]);

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
        if (!controller.signal.aborted && frames.length > 0) {
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

    const bufA = useLive ? rawA : applyBandpassModulation(rawA, size, target, 0, activeWavelength, sedRatio);
    const bufB = useLive ? rawB : applyBandpassModulation(rawB, size, target, lastIdx, activeWavelength, sedRatio);
    const curBuf = useLive ? rawCur : applyBandpassModulation(rawCur, size, target, safeIdx, activeWavelength, sedRatio);

    const dispatch = (id, buf) => {
      const copy = new Float32Array(buf);
      workerRef.current.postMessage(
        { id, buffer: copy, width: size, height: size, stretch, colormap, gain },
        [copy.buffer]
      );
    };

    if (diffMode) {
      if (psfDiffResult) {
        const copy = new Float32Array(psfDiffResult.buffer.slice(0));
        dispatch('primary', copy);
      } else {
        dispatch('primary', computeDifferenceBuffer(bufA, bufB));
      }
      return;
    }

    if (viewMode === 'blink' || viewMode === 'static') {
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
        id: `api-${resolved.ra.toFixed(2)}-${resolved.dec.toFixed(2)}`,
        name: resolved.name,
        ra: resolved.ra,
        dec: resolved.dec,
        hmsDms: `${resolved.ra.toFixed(4)} deg, ${resolved.dec.toFixed(4)} deg`,
        fovArcmin: 5.0,
        inSpherexFootprint: resolved.spherex_covered,
        survey: resolved.spherex_covered ? 'SPHEREx 102-Band' : 'unWISE Fallback',
        properMotion: '0.00 arcsec/yr (Resolved Celestial Object)',
        spectralNote: resolved.spherex_covered ? 'SPHEREx 0.75–5.0 µm survey field' : 'unWISE multi-epoch fallback field',
        dqFlag: 'NOMINAL',
        motionDxPerEpoch: 0.0,
        motionDyPerEpoch: 0.0,
        variabilityAmp: 0.0,
        iceDepth: { h2o: 0.05, pah: 0.0, co2: 0.02, co: 0.05 },
        peakFluxMjy: 15.0,
        epochs:
          resolved.primary_survey_epochs?.length > 0
            ? resolved.primary_survey_epochs.map((s) => s.slice(0, 7))
            : (resolved.spherex_covered ? ['2025-05', '2025-11', '2026-05', '2026-10'] : ['2014-03', '2019-09', '2023-09'])
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
    const clickDec = Math.max(-90, Math.min(90, target.dec - (y - canvas.height / 2) * degPerPx));
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
          <Link to="/library" className="btn-compact" title="Open Personal Library">
            <Bookmark size={13} /> Library
          </Link>
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
              <button
                type="button"
                className={viewMode === 'static' ? 'active' : ''}
                onClick={() => {
                  setViewMode('static');
                  setIsPlaying(false);
                }}
              >
                Static Pictures
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

            {viewMode === 'static' && !diffMode && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  className="btn-compact"
                  onClick={() => setEpochIdx((i) => (i - 1 + frameCount) % frameCount)}
                  aria-label="Previous epoch"
                >
                  <SkipBack size={13} />
                  <span>Prev</span>
                </button>
                <span className="mono" style={{ fontSize: 11, color: '#e88d3a', padding: '0 6px', whiteSpace: 'nowrap' }}>
                  {epochIdx + 1} / {frameCount} · {target.epochs?.[epochIdx] || `Epoch ${epochIdx + 1}`}
                </span>
                <button
                  type="button"
                  className="btn-compact"
                  onClick={() => setEpochIdx((i) => (i + 1) % frameCount)}
                  aria-label="Next epoch"
                >
                  <span>Next</span>
                  <SkipForward size={13} />
                </button>
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
              <button
                type="button"
                className={`btn-compact ${isRecordingBlink ? 'active' : ''}`}
                onClick={handleRecordBlinkVideo}
                disabled={isRecordingBlink}
                title="Record a 5-second animated blink video clip (.webm / .mp4)"
              >
                <Video size={12} style={{ color: isRecordingBlink ? '#e88d3a' : 'inherit' }} />
                <span>{isRecordingBlink ? `Recording (${blinkRecordProgress}/5s)...` : 'Blink Video'}</span>
              </button>
              <button type="button" className="btn-compact" onClick={() => setShowHeaderModal(true)}>
                <FileCode2 size={12} /> FITS Header
              </button>
              <Link
                to={buildSceneUrl('view')}
                className="btn-compact"
                title="Inspect in full screen or record 5s clip in Scene View"
              >
                <Maximize2 size={12} /> Scene View
              </Link>
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

          {/* Two Equal-Width Scene Action Buttons */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
              marginTop: 12
            }}
          >
            <Link
              to={buildSceneUrl('fullscreen')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '12px 16px',
                borderRadius: 8,
                background: 'var(--card-bg, #161b22)',
                border: '1px solid var(--border, #30363d)',
                color: '#e6edf3',
                fontSize: 13,
                fontWeight: 600,
                textDecoration: 'none'
              }}
            >
              <Maximize2 size={16} />
              <span>View in Full Screen</span>
            </Link>
            <Link
              to={buildSceneUrl('edit')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '12px 16px',
                borderRadius: 8,
                background: 'rgba(232, 141, 58, 0.12)',
                border: '1px solid #e88d3a',
                color: '#e88d3a',
                fontSize: 13,
                fontWeight: 600,
                textDecoration: 'none'
              }}
            >
              <Sparkles size={16} />
              <span>Edit / Save the Scene</span>
            </Link>
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
            currentRa={target.ra}
            currentDec={target.dec}
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
            onSelectCoordinate={(coord) => {
              const newT = {
                id: `coord-${coord.ra.toFixed(2)}-${coord.dec.toFixed(2)}`,
                name: coord.name,
                ra: coord.ra,
                dec: coord.dec,
                hmsDms: `${coord.ra.toFixed(4)} deg, ${coord.dec.toFixed(4)} deg`,
                fovArcmin: 5.0,
                inSpherexFootprint: coord.inSpherexFootprint ?? coord.inMoc,
                survey: (coord.inSpherexFootprint ?? coord.inMoc) ? 'SPHEREx 102-Band' : 'unWISE Fallback',
                properMotion: '0.00 arcsec/yr (Coordinate Selection)',
                spectralNote: 'Field sampled via Aitoff MOC Radar',
                dqFlag: 'NOMINAL',
                motionDxPerEpoch: 0.0,
                motionDyPerEpoch: 0.0,
                variabilityAmp: 0.0,
                iceDepth: { h2o: 0.05, pah: 0.0, co2: 0.02, co: 0.05 },
                peakFluxMjy: 12.0,
                epochs: (coord.inSpherexFootprint ?? coord.inMoc)
                  ? ['2025-05', '2025-11', '2026-05', '2026-10']
                  : ['2014-03', '2019-09', '2023-09']
              };
              setTarget(newT);
              setQueryInput(newT.name);
              setSampleCoords({ ra: coord.ra, dec: coord.dec });
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
