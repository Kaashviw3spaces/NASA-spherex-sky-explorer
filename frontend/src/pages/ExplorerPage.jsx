import { gridToSky } from '../utils/skyCoordinates';
import { wavelengthAtPixel } from '../utils/imageWavelength';
import useSpherexFrames from '../hooks/useSpherexFrames';
import { observationDate } from '../utils/observationDate';
import { computeCutLevels } from '../utils/displayLevels';
import { comparisonIssue, comparisonPair, displayedFrames, observationSnapshot } from '../utils/observationContext';
import { saveLibraryItem } from '../utils/libraryStorage';
import WhatAmISeeing from '../components/learning/WhatAmISeeing';
import { targetFromParams } from '../data/pointing';
import useCutoutFrames from '../hooks/useCutoutFrames';
import DataNotice from '../components/DataNotice';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import MeasuredSpectrum from '../components/MeasuredSpectrum';
import MocRadar from '../components/MocRadar';
import PresetPreloader from '../components/PresetPreloader';
import FitsHeaderModal from '../components/FitsHeaderModal';
import ExposureStrip from '../components/ExposureStrip';
import { INVESTIGATION_LINK, investigationAtPointing } from '../data/investigation';
import investigationEvidenceUrl from '../data/investigation.json?url';

export default function ExplorerPage({ spherex = false }) {
  const [params] = useSearchParams();
  const [mapOpen, setMapOpen] = useState(true);
  const [foregroundReady, setForegroundReady] = useState(false);
  const mapPosition = useRef(null);
  const keepMapPosition = () => {
    mapPosition.current = document.getElementById('explore-sky-map')?.getBoundingClientRect().top;
    setMapOpen(true);
  };
  useLayoutEffect(() => {
    if (mapPosition.current == null) return;
    const map = document.getElementById('explore-sky-map');
    if (map) window.scrollBy({ top: map.getBoundingClientRect().top - mapPosition.current, behavior: 'instant' });
    mapPosition.current = null;
  }, [params]);
  // A navigation to another pointing starts a fresh viewer session, including playback and samples.
  let pointing;
  try { pointing = targetFromParams(params); } catch (error) {
    return <div className="page-container"><p role="alert">{error.message}</p><Link to="/explorer">Open the default sky view</Link></div>;
  }
  const key = JSON.stringify([pointing.ra, pointing.dec, pointing.fovArcmin, pointing.name, params.get('investigation')]);
  return <><ExplorerSession key={key} spherex={spherex} mapOpen={mapOpen} onMapOpenChange={setMapOpen} onMapSelect={keepMapPosition} onImagesReady={setForegroundReady} /><PresetPreloader enabled={foregroundReady} /></>;
}

function ExplorerSession({ spherex, mapOpen, onMapOpenChange, onMapSelect, onImagesReady }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTarget = useMemo(() => targetFromParams(searchParams), []);

  const [target, setTargetState] = useState(initialTarget);
  const setTarget = (next) => {
    searchControllerRef.current?.abort();
    diffControllerRef.current?.abort();
    setSearching(false);
    setTargetState(next);
  };
  const [initialQuery] = useState(() => searchParams.get('q') || '');
  const [queryInput, setQueryInput] = useState(initialQuery || initialTarget.name);
  const [viewMode, setViewMode] = useState(searchParams.get('mode') || 'static');
  const [stretch, setStretch] = useState(searchParams.get('stretch') || (searchParams.has('investigation') ? 'asinh' : 'zscale'));
  const [colormap, setColormap] = useState(searchParams.get('colormap') || 'grayscale');
  const [gain, setGain] = useState(1.0);
  const [diffMode, setDiffMode] = useState(searchParams.get('diff') === 'true' || searchParams.get('mode') === 'diff');

  // Blink & progressive ring buffer state
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(3);
  const [epochIdx, setEpochIdx] = useState(Math.max(0, parseInt(searchParams.get('epoch') || '0', 10) || 0));
  const [curtainPos, setCurtainPos] = useState(Math.min(1, Math.max(0, Number(searchParams.get('curtain') ?? 0.5) || 0)));
  const [imageSource, setImageSource] = useState(spherex && searchParams.get('source') !== 'unwise' ? 'spherex' : 'unwise');
  const isSpherexImage = spherex && imageSource === 'spherex';
  const investigation = investigationAtPointing(searchParams.get('investigation'), target);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [spectrumOpen, setSpectrumOpen] = useState(searchParams.get('panel') === 'spectrum');
  const [channelPosition, setChannelPosition] = useState({ra: initialTarget.ra, dec: initialTarget.dec});
  const context = useCutoutFrames(target, {enabled: !isSpherexImage});
  const science = (spherex ? useSpherexFrames : useCutoutFrames)(target, { metadataOnly: !isSpherexImage, investigation });
  const selectedImages = isSpherexImage ? science : context;
  const { frames: liveFrames, status: imageStatus, error: imageError, retry } = selectedImages;
  const requestKey = imageSource + ':' + selectedImages.requestKey;
  useEffect(() => { onImagesReady(imageStatus === 'ready' && !(isSpherexImage && channelsLoading)); return () => onImagesReady(false); }, [imageStatus, isSpherexImage, channelsLoading, onImagesReady]);
  const [pairSelection, setPairSelection] = useState({});
  const pairFrames = useMemo(() => comparisonPair(liveFrames, pairSelection.a, pairSelection.b), [liveFrames, pairSelection]);
  const comparing = diffMode || ['side-by-side', 'swipe'].includes(viewMode);
  const visibleFrames = comparing ? pairFrames : liveFrames;
  useEffect(() => {
    if (spherex && liveFrames.length < 2 && imageStatus !== 'loading') { setViewMode('static'); setIsPlaying(false); }
  }, [spherex, liveFrames.length, imageStatus]);
  const [psfState, setPsfDiffResult] = useState(null);
  const pairKey = JSON.stringify(pairFrames.map(frame => frame.cache_key));
  const subtractionIssue = comparisonIssue(pairFrames);
  const psfDiffResult = psfState?.requestKey === requestKey && psfState?.pairKey === pairKey ? psfState : null;
  const [psfLoading, setPsfLoading] = useState(false);
  const [diffError, setDiffError] = useState('');
  const [bookmarkStatus, setBookmarkStatus] = useState('');
  const [finding, setFinding] = useState('');
  const [alternatives, setAlternatives] = useState('');
  const [searchError, setSearchError] = useState('');
  const [searching, setSearching] = useState(false);
  const searchControllerRef = useRef(null);
  const diffControllerRef = useRef(null);

  useEffect(() => {
    searchControllerRef.current?.abort();
    diffControllerRef.current?.abort();
    setPsfLoading(false);
    setDiffError('');
    setBookmarkStatus('');
    return () => {
      searchControllerRef.current?.abort();
      diffControllerRef.current?.abort();
    };
  }, [requestKey]);

  const buildSceneUrl = (action = 'view') => {
    const params = new URLSearchParams({
      ra: String(target.ra),
      dec: String(target.dec),
      fov: String(target.fovArcmin || 5),
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
  const [spectrumState, setLiveSpectrumBands] = useState(null);
  const [crosshair, setCrosshair] = useState({ x: 256, y: 256 });
  const [sampleCoords, setSampleCoords] = useState({
    ra: initialTarget.ra,
    dec: initialTarget.dec
  });
  const spectrumKey = JSON.stringify([requestKey, sampleCoords.ra, sampleCoords.dec, apertureRadius]);
  const liveSpectrumBands = spectrumState?.key === spectrumKey ? spectrumState.bands : null;
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
      setViewMode('blink');
      setDiffMode(false);
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
  const currentRequestRef = useRef(requestKey);
  const renderVersions = useRef({});
  useLayoutEffect(() => {
    currentRequestRef.current = requestKey;
    renderVersions.current = {};
    for (const canvas of [canvasPrimaryRef.current, canvasSecondaryRef.current]) {
      if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [requestKey]);
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
      if (e.data.requestKey !== currentRequestRef.current || e.data.version !== renderVersions.current[id]) return;
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
      ctx.fillStyle = '#08101e';
      ctx.fillRect(0, height - 28, width, 28);
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px sans-serif';
      ctx.fillText(e.data.label || 'SIMULATED DEMO', 8, height - 10);

      const { crosshair: ch, apertureRadius: ap, curtainPos: cp } = overlayRef.current;
      const scaleFactor = width / 512;
      const cx = ch.x;
      const cy = ch.y;

      ctx.strokeStyle = 'rgba(217, 181, 128, 0.9)';
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
        ctx.strokeStyle = '#f0f2f5';
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
        ra: String(target.ra),
        dec: String(target.dec),
        fov: String(target.fovArcmin || 5),
        ...(!spherex ? { epochA: target.epochs[0], epochB: target.epochs[target.epochs.length - 1] } : {}),
        mode: viewMode,
        ...(spherex ? { source: imageSource } : {}),
        ...(investigation ? { investigation: investigation.id } : {}),
        ...(spectrumOpen ? { panel: 'spectrum' } : {}),
        stretch,
        colormap,
        diff: diffMode ? 'true' : 'false',
        epoch: String(epochIdx),
        curtain: curtainPos.toFixed(2),
        target: target.id,
        name: target.name
      },
      { replace: true }
    );
  }, [target, viewMode, stretch, colormap, diffMode, epochIdx, curtainPos, imageSource, investigation, spectrumOpen, setSearchParams]);

  const hoverTime = useRef(0);
  // Shared teaching-spectrum path for Explore and the legacy viewer; values are simulated.
  useEffect(() => {
    const controller = new AbortController();
    if (spherex) return () => controller.abort();
    fetchSpectrumApi(
      sampleCoords.ra,
      sampleCoords.dec,
      apertureRadius * 6.2,
      target.ra,
      target.dec,
      target.fovArcmin,
      controller.signal
    )
      .then((res) => {
        if (!controller.signal.aborted) {
          setLiveSpectrumBands({ key: spectrumKey, bands: res.bands });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLiveSpectrumBands(null);
        }
      });
    return () => controller.abort();
  }, [spherex, target, sampleCoords, apertureRadius]);

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
    if (spherex) return [new Float32Array(512 * 512)];
    return target.epochs.map((_, idx) => generateStarfieldBuffer(target, idx, 512).buffer);
  }, [target]);

  const frameCount = liveFrames.length > 0 ? liveFrames.length : fallbackEpochs.length;
  const imageLevels = useMemo(() => {
    if (!liveFrames.length) return undefined;
    const inputs = comparing || viewMode === 'blink' ? pairFrames : [liveFrames[epochIdx % liveFrames.length]];
    const joined = new Float32Array(inputs.reduce((n, frame) => n + frame.buffer.length, 0));
    let offset = 0;
    for (const frame of inputs) { joined.set(frame.buffer, offset); offset += frame.buffer.length; }
    return computeCutLevels(joined);
  }, [liveFrames, pairFrames, comparing, viewMode, epochIdx]);

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
    if (comparing && pairFrames.length < 2) return;

    const useLive = liveFrames.length > 0;
    const size = 512;
    const lastIdx = (useLive ? liveFrames.length : fallbackEpochs.length) - 1;
    const safeIdx = epochIdx % Math.max(1, useLive ? liveFrames.length : fallbackEpochs.length);

    const rawA = useLive ? (pairFrames[0] || liveFrames[0]).buffer : fallbackEpochs[0];
    const rawB = useLive ? (pairFrames[1] || liveFrames[0]).buffer : fallbackEpochs[lastIdx];
    const rawCur = useLive ? liveFrames[safeIdx].buffer : fallbackEpochs[safeIdx];

    const bufA = useLive ? rawA : applyBandpassModulation(rawA, size, target, 0, activeWavelength, sedRatio);
    const bufB = useLive ? rawB : applyBandpassModulation(rawB, size, target, lastIdx, activeWavelength, sedRatio);
    const curBuf = useLive ? rawCur : applyBandpassModulation(rawCur, size, target, safeIdx, activeWavelength, sedRatio);

    const levels = imageLevels;
    const dispatch = (id, buf, label) => {
      const copy = new Float32Array(buf);
      const version = (renderVersions.current[id] || 0) + 1;
      renderVersions.current[id] = version;
      workerRef.current.postMessage(
        { id, version, requestKey, levels: diffMode ? computeCutLevels(buf) : levels, buffer: copy, width: size, height: size, stretch, colormap, gain,
          label: label || (liveFrames.length && liveFrames.every(f => f.meta?.dataKind === 'observed')
            ? spherex ? `${isSpherexImage ? "SPHEREx DR1" : "unWISE context"} · ${observationDate(liveFrames[safeIdx]?.meta.epoch)}` : `Observed unWISE · ${liveFrames.map(f => observationDate(f.meta.epoch)).join(" / ")}`
            : spherex ? (liveFrames.length ? 'SIMULATED DEMO / mixed context sources — see source details' : (isSpherexImage ? 'SPHEREx · loading observation' : 'Context archive · loading image')) : 'SIMULATED DEMO / mixed sources — see source details') },
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
      dispatch('swipe', combined, 'Image A ← | → Image B · see dates above');
    } else if (viewMode === 'side-by-side') {
      dispatch('primary', bufA, `Image A · ${observationDate(pairFrames[0]?.meta.epoch)} · ${pairFrames[0]?.meta.release || 'unavailable'}`);
      dispatch('secondary', bufB, `Image B · ${observationDate(pairFrames[1]?.meta.epoch)} · ${pairFrames[1]?.meta.release || 'unavailable'}`);
    }
  }, [
    liveFrames,
    pairFrames,
    comparing,
    imageLevels,
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
    isSpherexImage,
    psfDiffResult,
    crosshair,
    apertureRadius
  ]);

  const handleSearch = async (e) => {
    e.preventDefault();
    searchControllerRef.current?.abort();
    const controller = new AbortController();
    searchControllerRef.current = controller;
    setSearchError('');
    setSearching(true);
    try {
      const query = queryInput.trim();
      if (!query) throw new Error('Enter an object name or sky coordinates.');
      let nextTarget = resolveQueryToTarget(query, BENCHMARK_TARGETS);
      if (!nextTarget) {
        const resolved = await resolveTargetApi(query, controller.signal);
        controller.signal.throwIfAborted();
        nextTarget = resolveQueryToTarget(`${resolved.ra}, ${resolved.dec}`, BENCHMARK_TARGETS);
        if (!nextTarget) throw new Error('The resolver returned invalid coordinates.');
        nextTarget = { ...nextTarget, name: resolved.name || query };
      }
      controller.signal.throwIfAborted();
      setTarget(nextTarget);
      setQueryInput(nextTarget.name);
      setSampleCoords({ ra: nextTarget.ra, dec: nextTarget.dec });
      setCrosshair({ x: 256, y: 256 });
      setEpochIdx(0);
      setSampleOffset(0);
    } catch (error) {
      if (!controller.signal.aborted) setSearchError(error.message.startsWith('Resolve failed')
        ? 'Could not resolve this object. Check the name, enter coordinates, or try again.' : error.message);
    } finally {
      if (searchControllerRef.current === controller) setSearching(false);
    }
  };

  useEffect(() => {
    if (initialQuery) void handleSearch({ preventDefault() {} });
  }, []);

  const selectImageMode = mode => {
    diffControllerRef.current?.abort(); setPsfLoading(false); setDiffMode(false); setIsPlaying(false); setViewMode(mode);
  };

  const handlePsfConfirm = async () => {
    if (subtractionIssue || psfLoading) return;
    diffControllerRef.current?.abort();
    const controller = new AbortController();
    diffControllerRef.current = controller;
    setPsfLoading(true);
    setDiffError('');
    try {
      const res = await fetchPsfDiffApi(pairFrames[0].cache_key, pairFrames[1].cache_key, 'alard_lupton', controller.signal);
      if (!controller.signal.aborted) {
        for (let i = 0; i < res.buffer.length; i++) {
          if (!Number.isFinite(pairFrames[0].buffer[i]) || !Number.isFinite(pairFrames[1].buffer[i])) res.buffer[i] = NaN;
        }
        setPsfDiffResult({ ...res, requestKey, pairKey });
        setDiffMode(true);
      }
    } catch (error) {
      if (!controller.signal.aborted) setDiffError('Could not compare these images. They must share a band, units and data kind. Please retry.');
    } finally {
      if (!controller.signal.aborted) setPsfLoading(false);
    }
  };

  const handleCanvasClick = (e) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(511, Math.round(((e.clientX - rect.left) / rect.width) * canvas.width)));
    const y = Math.max(0, Math.min(511, Math.round(((e.clientY - rect.top) / rect.height) * canvas.height)));
    setCrosshair({ x, y });
    setSampleOffset((x - canvas.width / 2) * 0.02 + (y - canvas.height / 2) * 0.02);

    const imageFov = isSpherexImage ? Math.min(10,Math.max(1,target.fovArcmin || 5)) : target.fovArcmin || 5;
    const sky = gridToSky(x, y, target.ra, target.dec, imageFov, canvas.width);
    setSampleCoords(sky);
    const frame = comparing ? pairFrames[canvas === canvasSecondaryRef.current || (viewMode === 'swipe' && x >= curtainPos*512) ? 1 : 0] : liveFrames[epochIdx % Math.max(1,liveFrames.length)];
    setChannelPosition({...sky, wavelength:wavelengthAtPixel(frame,x,y), delay:e.type === 'pointermove' ? 280 : 0});
  };

  const handleExportCsv = () => {
    const header = 'data_kind,source,band_id,wavelength_um,flux_arbitrary,uncertainty,quality_flag\n';
    const rows = activeBands
      .map((b) => `simulated,Synthetic-Demo,${b.bandId},${b.wavelength},${b.flux},,`)
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${target.id}_SIMULATED_sed.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJson = () => {
    const payload = {
      target: target.name,
      ra: target.ra,
      dec: target.dec,
      data_kind: 'simulated',
      source: 'Synthetic-Demo',
      units: 'arbitrary',
      observation_date: null,
      aperture_px: apertureRadius,
      bands: activeBands
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${target.id}_SIMULATED_sed.json`;
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
    epoch: 'unknown',
    provenance: isSpherexImage ? 'SPHEREx / IRSA' : 'Synthetic-Demo',
    dataKind: isSpherexImage ? 'unavailable' : 'simulated',
    bunit: 'arbitrary'
  };
  const activeCacheKey = liveFrames[epochIdx % Math.max(1, liveFrames.length)]?.cache_key;

  return (
    <div className="explorer-shell mission-console">
      <div className="spherex-masthead">
      <div className="workspace-heading"><div><div className="eyebrow">SPHEREx / SKY EXPLORER</div><h1>Explore the infrared sky<span className="title-dot">.</span></h1></div><div className="console-status" role="status"><span className={`console-light ${imageStatus === 'ready' ? 'ready' : ''}`} aria-hidden="true" /><span>{imageStatus === 'ready' ? `${liveFrames.length} frames ready` : imageStatus === 'error' ? 'Image unavailable' : 'Loading images'}</span><span className="console-status-divider">/</span><span>RA {target.ra.toFixed(4)}° · DEC {target.dec.toFixed(4)}°</span></div></div>
      <figure className="spherex-mission-image"><img src="/images/spherex-survey.jpg" alt="NASA artist’s concept of SPHEREx building a multiwavelength all-sky map from orbit" width="1400" height="787" /><figcaption><span>ALL-SKY SURVEY</span><a href="https://www.jpl.nasa.gov/images/pia26533-building-an-all-sky-map-with-spherex-artists-concept/" target="_blank" rel="noreferrer">NASA/JPL-Caltech ↗</a></figcaption></figure>
      <div className="spherex-mission-strip" aria-label="Mission context, not local data coverage"><span>ALL-SKY SPECTROSCOPY</span><span><strong>102</strong> spectral bands</span><span><strong>0.75–5 µm</strong> near-infrared</span><span className="mission-strip-note">MISSION CONTEXT · COVERAGE VARIES</span></div>
      </div>
      {searchError && <p className="inline-error" role="alert">{searchError}</p>}
      {diffError && <p className="inline-error" role="alert">{diffError}</p>}
      {/* Top Query & Provenance Toolbar */}
      <div className="explorer-toolbar">
        <form id="choose-field" className="search-group" onSubmit={handleSearch} role="search">
          <Search size={17} aria-hidden="true" />
          <input
            className="coord-input"
            value={queryInput}
            onChange={(e) => {
              searchControllerRef.current?.abort();
              setSearching(false);
              setSearchError('');
              setQueryInput(e.target.value);
            }}
            placeholder="Find an object or enter sky coordinates"
            aria-label="Coordinate or target search"
          />
          <button type="submit" className="btn-compact">
            {searching ? 'Searching…' : 'Search'} <Search size={13} />
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn-compact" onClick={handleCopyDeepLink}>
            {copiedLink ? <Check size={13} /> : <Share2 size={13} />}
            {copiedLink ? 'Copied' : 'Share'}
          </button>
          <button type="button" className="btn-compact" onClick={() => {
            const saved = saveLibraryItem({ name: target.name, ra: target.ra, dec: target.dec, fovArcmin: target.fovArcmin, mode: diffMode ? 'diff' : viewMode, stretch, colormap, activeWavelength,
              notes: finding || alternatives ? `What I noticed: ${finding}\nOther explanations: ${alternatives}\nConclusion: tentative; no confirmed motion or chemical detection.` : '',
              observation: observationSnapshot(visibleFrames, epochIdx, viewMode, diffMode)
            });
            setBookmarkStatus(saved ? 'Saved to your journal with source metadata.' : 'Could not save. Check browser storage.');
          }}><Bookmark size={13} /> Save</button>
          <Link to="/targets" className="btn-compact">Targets</Link>
          {spherex && !investigation && <Link to={INVESTIGATION_LINK} className="btn-compact">Try a real investigation ↗</Link>}
        </div>
      </div>


      {spherex && <nav className="explore-workflow" aria-label="Investigation steps"><a href="#choose-field">01 Choose field</a><a href="#choose-dates">02 Choose dates</a><a href="#compare-images">03 Compare</a><a href="#record-finding">04 Record finding</a></nav>}
      {spherex && <div id="choose-dates" className="console-observation-row">
        <div className="segmented" role="group" aria-label="Image source">
          {['unwise', 'spherex'].map(source => <button type="button" key={source} aria-pressed={imageSource === source} className={imageSource === source ? 'active' : ''} onClick={() => {
            diffControllerRef.current?.abort(); setPsfLoading(false); setDiffMode(false); setIsPlaying(false); setViewMode('static'); setEpochIdx(0); setImageSource(source);
          }}>{source === 'spherex' ? 'SPHEREx' : 'unWISE'}</button>)}
        </div>
        <label className="mono">{isSpherexImage ? 'Exposure' : 'Image release'} <select aria-label="Displayed image observation" value={epochIdx % Math.max(1, liveFrames.length)} disabled={!liveFrames.length} onChange={event => { selectImageMode('static'); setEpochIdx(Number(event.target.value)); }}>
          {liveFrames.length ? liveFrames.map((frame, index) => <option key={frame.cache_key || frame.meta.sourceUrl || index} value={index}>{isSpherexImage ? observationDate(frame.meta.epoch) : frame.meta.release || 'Demo'}{frame.meta.spectralRange ? ` · ${frame.meta.spectralRange}` : ''}</option>) : <option value={0}>{imageStatus === 'loading' ? 'Loading…' : 'No image available'}</option>}
        </select></label>
      </div>}
      {isSpherexImage && investigation && <a className="text-link" href="#field-explanation">Read the image explanation &amp; motion walkthrough ↓</a>}
      {isSpherexImage && <ExposureStrip frames={liveFrames} levels={imageLevels} activeIndex={viewMode === 'static' && !diffMode ? epochIdx : -1} onSelect={index => { selectImageMode('static'); setEpochIdx(index); }} />}
      <DataNotice spherex={isSpherexImage} spectrumKind={spherex ? (isSpherexImage ? 'measured' : 'unavailable') : 'simulated'} frames={visibleFrames} activeIndex={epochIdx} mode={viewMode} difference={diffMode} target={target} colormap={colormap} stretch={stretch} status={imageStatus} error={imageError} onRetry={retry} />
      <p className="bookmark-status" role="status">{bookmarkStatus}</p>
      {/* Main 2-Column Instrument Grid */}
      <div className="explorer-grid">
        {/* Left: 3-Mode Cutout Viewport */}
        <section id="compare-images" className="viewport-pane" aria-label="Observation viewer">
          <div className="viewer-heading"><div><span className="eyebrow">01 / SKY VIEW</span><h2>{target.name}</h2></div><span className="field-coordinate">RA {target.ra.toFixed(4)}°<br />DEC {target.dec.toFixed(4)}°</span></div>
          {comparing && pairFrames.length === 2 && <div className="comparison-inputs" aria-label="Comparison inputs">
            {pairFrames.map((frame, index) => <div key={index}><label>Image {index ? 'B' : 'A'} <select aria-label={`Image ${index ? 'B' : 'A'} exposure`} value={frame.meta.sourceUrl || frame.cache_key} onChange={event => { diffControllerRef.current?.abort(); setPsfLoading(false); setPsfDiffResult(null); setPairSelection(value => ({...value, [index ? 'b' : 'a']: event.target.value})); }}>{liveFrames.map((option,i) => <option key={option.meta.sourceUrl || option.cache_key || i} value={option.meta.sourceUrl || option.cache_key} disabled={(option.meta.sourceUrl || option.cache_key) === (pairFrames[1-index].meta.sourceUrl || pairFrames[1-index].cache_key)}>{observationDate(option.meta.epoch)} · {option.meta.release}</option>)}</select></label><span>{frame.meta.spectralRange ? `${frame.meta.spectralRange} · detector range` : frame.meta.wavelengthUm ? `W${frame.meta.bandIndex} · ${frame.meta.wavelengthUm} µm` : 'Band unavailable'}</span><small>{frame.meta.dataKind}</small></div>)}
          </div>}
          {comparing && pairFrames.length < 2 && <p role="status">Waiting for two distinct exposures. No duplicate comparison is shown.</p>}
          {diffMode && <p className="quiet-note" role="status">{psfDiffResult ? 'PSF-fit difference' : 'Normalized difference'} · selected A and B · not a confirmed detection.</p>}
          {diffMode && isSpherexImage && <p className="quiet-note">Preview comparison: wavelength response and PSF vary across exposures. Residuals are not proof of motion.</p>}
          {subtractionIssue && <p className="quiet-note">{subtractionIssue}</p>}
          <WhatAmISeeing frames={displayedFrames(visibleFrames, epochIdx, viewMode, diffMode)} difference={diffMode} />
          <div className="control-strip">
            <div className="segmented" role="group" aria-label="Viewport Mode">
              <button
                type="button"
                disabled={pairFrames.length < 2}
                title={spherex && liveFrames.length < 2 ? 'Two loaded exposures are needed' : undefined}
                className={viewMode === 'blink' ? 'active' : ''}
                aria-pressed={viewMode === 'blink'}
                onClick={() => selectImageMode('blink')}
              >
                Blink
              </button>
              <button
                type="button"
                disabled={pairFrames.length < 2}
                title={spherex && liveFrames.length < 2 ? 'Two loaded exposures are needed' : undefined}
                className={viewMode === 'swipe' ? 'active' : ''}
                aria-pressed={viewMode === 'swipe'}
                onClick={() => selectImageMode('swipe')}
              >
                Swipe
              </button>
              <button
                type="button"
                disabled={pairFrames.length < 2}
                title={spherex && liveFrames.length < 2 ? 'Two loaded exposures are needed' : undefined}
                className={viewMode === 'side-by-side' ? 'active' : ''}
                aria-pressed={viewMode === 'side-by-side'}
                onClick={() => selectImageMode('side-by-side')}
              >
                Side-by-Side
              </button>
              <button
                type="button"
                className={viewMode === 'static' ? 'active' : ''}
                aria-pressed={viewMode === 'static'}
                onClick={() => {
                  selectImageMode('static');
                }}
              >
                Still image
              </button>
            </div>

            <div className="difference-controls" role="group" aria-label="Image subtraction">
              <button type="button" className={`btn-compact ${diffMode && !psfDiffResult ? 'active' : ''}`} aria-pressed={diffMode && !psfDiffResult} disabled={Boolean(subtractionIssue)} title={subtractionIssue || 'Normalized difference of first and last frames'} onClick={() => {
                diffControllerRef.current?.abort(); setPsfLoading(false); setIsPlaying(false);
                setDiffMode(!diffMode || Boolean(psfDiffResult)); setPsfDiffResult(null);
              }}>Δ Difference</button>
              <button type="button" className={`btn-compact ${diffMode && psfDiffResult ? 'active' : ''}`} aria-pressed={Boolean(diffMode && psfDiffResult)} disabled={Boolean(subtractionIssue) || psfLoading} title={subtractionIssue || 'Fit image blur and brightness before subtraction'} onClick={handlePsfConfirm}>
                <Sparkles size={12} /> {psfLoading ? 'Matching…' : 'PSF difference'}
              </button>
            </div>
            <details className="advanced-image-tools"><summary>Image tools <SlidersHorizontal size={14} /></summary><div className="advanced-tools-content">
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
                <option value="grayscale">Monochrome</option>
                <option value="inferno">Map: Inferno</option>
                <option value="viridis">Map: Viridis</option>
                <option value="grayscale_r">Map: Grayscale_r</option>
              </select>
            </div></details>
          </div>

          <div
            className="canvas-stage"
            data-view={viewMode}
            style={
              viewMode === 'side-by-side' && !diffMode
                ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: 8 }
                : undefined
            }
          >
            <div className="canvas-hud">
              <span className="hud-pill">
                {target.name} · {String(target.ra)}°, {String(target.dec)}°
              </span>
              <span className="hud-pill">
                {comparing ? `${isSpherexImage ? 'SPHEREx' : 'unWISE'} · selected Image A / Image B` : spherex ? `${isSpherexImage ? "SPHEREx" : "unWISE"}: ${activeFrameMeta.release || activeFrameMeta.provenance} · ${observationDate(activeFrameMeta.epoch)}` : diffMode
                  ? psfDiffResult
                    ? `Fitted difference · heuristic score ${psfDiffResult.meta.diffConfidence.toFixed(2)} (not a probability)`
                    : `Local Variance Δ (${target.epochs[0]} − ${target.epochs[target.epochs.length - 1]})`
                  : viewMode === 'swipe'
                    ? spherex ? "Context image comparison" : `${target.epochs[0]} | ${target.epochs[target.epochs.length - 1]}`
                    : `Image date: ${observationDate(activeFrameMeta.epoch)} · ${activeFrameMeta.provenance}`}
              </span>
            </div>

            {isSpherexImage && !liveFrames.length && <div className="image-load-state" role="status"><strong>{imageStatus === 'error' ? 'No usable SPHEREx image loaded' : 'Retrieving SPHEREx observations…'}</strong><span>{imageStatus === 'error' ? 'Use Retry images above to try the archive again.' : 'The first valid exposure will appear as soon as it arrives.'}</span></div>}

            <canvas
              ref={canvasPrimaryRef}
              width={512}
              height={512}
              onClick={handleCanvasClick}
              onPointerMove={event => { if (event.buttons !== 1) return; const now = performance.now(); if (now - hoverTime.current < 60) return; hoverTime.current = now; handleCanvasClick(event); }}
              onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); handleCanvasClick(event); }}
              onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
              style={{
                width: '100%',
                aspectRatio: '1 / 1',
                cursor: 'crosshair', touchAction: 'pan-y'
              }}
            />

            {viewMode === 'side-by-side' && !diffMode && (
              <canvas
                ref={canvasSecondaryRef}
                width={512}
                height={512}
                onClick={handleCanvasClick}
              onPointerMove={event => { if (event.buttons !== 1) return; const now = performance.now(); if (now - hoverTime.current < 60) return; hoverTime.current = now; handleCanvasClick(event); }}
              onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); handleCanvasClick(event); }}
              onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
                style={{
                  width: '100%',
                  aspectRatio: '1 / 1',
                  cursor: 'crosshair', touchAction: 'pan-y'
                }}
              />
            )}
          </div>

          {/* Transport / Curtain / Gain / FITS Controls */}
          <div
            className="panel-box transport-panel"
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
                <label className="mono" style={{ fontSize: 11, color: '#a7b5c6', marginLeft: 6 }}>
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
                <span className="mono" style={{ fontSize: 11, color: '#d9b580', padding: '0 6px', whiteSpace: 'nowrap' }}>
                  {epochIdx + 1} / {frameCount} · {spherex ? `${isSpherexImage ? "SPHEREx exposure" : "Context"}: ${observationDate(activeFrameMeta.epoch)}` : target.epochs?.[epochIdx] || `Epoch ${epochIdx + 1}`}
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
                  color: '#a7b5c6',
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
                style={{ fontSize: 11, color: '#a7b5c6', display: 'flex', alignItems: 'center', gap: 6 }}
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
                <Video size={12} style={{ color: isRecordingBlink ? '#d9b580' : 'inherit' }} />
                <span>{isRecordingBlink ? `Recording (${blinkRecordProgress}/5s)...` : 'Blink Video'}</span>
              </button>
              <button type="button" className="btn-compact" onClick={() => setShowHeaderModal(true)}>
                <FileCode2 size={12} /> FITS Header
              </button>
              <Link
                to={buildSceneUrl('view')}
                className="btn-compact"
                style={spherex ? { display: "none" } : undefined}
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

          {/* Scene actions */}
          <div
            hidden={isSpherexImage}
            style={{
              display: isSpherexImage ? 'none' : 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              marginTop: 0
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
                background: 'var(--card-bg, #0c1421)',
                border: '1px solid var(--border, #25364a)',
                color: '#e6edf3',
                fontSize: 13,
                fontWeight: 600,
                textDecoration: 'none'
              }}
            >
              <Maximize2 size={16} />
              <span>Full screen</span>
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
                background: 'rgba(217, 181, 128, 0.12)',
                border: '1px solid #d9b580',
                color: '#d9b580',
                fontSize: 13,
                fontWeight: 600,
                textDecoration: 'none'
              }}
            >
              <Sparkles size={16} />
              <span>Scene settings</span>
            </Link>
          </div>
          <div className="explorer-details-grid" aria-label="Notes and image information">
            {isSpherexImage && investigation && <section id="field-explanation" className="science-details investigation-brief"><h2>Did the field fade?</h2>
              <p className="quiet-note">19 Mar → 4 May 2026 · same infrared field</p>
              {liveFrames.length === 2 && imageStatus === 'ready' && !subtractionIssue ? <>
                <p>Median field brightness fell from <strong>{investigation.inputs[0].field_median_mjy_sr.toFixed(3)} to {investigation.inputs[1].field_median_mjy_sr.toFixed(3)} MJy/sr</strong>. Most of the difference is consistent with changing zodiacal light—sunlight scattered by Solar System dust—rather than evidence that stars faded.</p>
              </> : <p role="status">Load both exact exposures before drawing a conclusion. The recorded verification is available below.</p>}
              <section aria-label="Motion walkthrough"><h3>Check for motion</h3><ul>
                <li><strong>Blink:</strong> look for a point shifting relative to nearby sources.</li>
                <li><strong>Swipe:</strong> check whether the same point lines up across the divider.</li>
                <li><strong>Difference:</strong> inspect bright/dark pairs; alignment and PSF changes can mimic motion.</li>
              </ul></section>
              <p className="quiet-note">No motion established. Save what you noticed and another possible explanation.</p>
              <a className="text-link" href={investigationEvidenceUrl} download="spherex-investigation.json">Download recorded evidence ↗</a>
            </section>}
            <details id="record-finding" className="science-details"><summary>Record a conclusion<span>JOURNAL</span></summary><label className="reflection-field">What did you notice?<textarea rows={2} maxLength={1200} value={finding} onChange={event => setFinding(event.target.value)} /></label><label className="reflection-field">What else could explain it?<textarea rows={2} maxLength={1200} placeholder="Noise, wavelength response, processing, missing coverage…" value={alternatives} onChange={event => setAlternatives(event.target.value)} /></label><p className="quiet-note">Use Save above to keep your conclusion and the displayed inputs. Evidence may be inconclusive.</p></details>
            {spherex && <details className="console-data-guide"><summary>Data sources & interpretation</summary><p className="quiet-note">Images and metadata follow the selected survey at the same sky coordinates. Survey dates, resolution and bands differ; do not treat switching surveys as a time comparison. The SPHEREx graph shows measured native-pixel channels with statistical errors. No chemical fit is performed. <a href="https://irsa.ipac.caltech.edu/Missions/spherex.html" target="_blank" rel="noreferrer">SPHEREx archive ↗</a></p></details>}
            {spherex && <details className="science-details"><summary>Image source</summary><DataNotice spherex={isSpherexImage} spectrumKind={isSpherexImage ? 'measured' : 'unavailable'} frames={visibleFrames} activeIndex={epochIdx} mode={viewMode} difference={diffMode} target={target} colormap={colormap} stretch={stretch} status={imageStatus} error={imageError} onRetry={retry} /></details>}
            <details className="science-details"><summary>Technical details<span>COORDINATES &amp; METADATA</span></summary><dl className="metadata-grid"><dt>Position</dt><dd>{sampleCoords.ra.toFixed(4)}°, {sampleCoords.dec.toFixed(4)}°</dd><dt>Observed</dt><dd>{observationDate(activeFrameMeta.epoch)}</dd><dt>Source</dt><dd>{activeFrameMeta.provenance || 'Not loaded'}</dd><dt>Release</dt><dd>{activeFrameMeta.release || 'Not loaded'}</dd><dt>Band</dt><dd>{activeFrameMeta.spectralRange || (activeFrameMeta.wavelengthUm ? `${activeFrameMeta.wavelengthUm} µm` : 'Unavailable')}</dd><dt>Units</dt><dd>{activeFrameMeta.bunit || 'Unavailable'}</dd><dt>Display grid</dt><dd>{activeFrameMeta.gridWidth || activeFrameMeta.width} × {activeFrameMeta.gridHeight || activeFrameMeta.height}</dd></dl></details>
          </div>
        </section>

        {/* Right: Simulated spectrum Profiler & Metadata */}
        <section className="sed-pane">
          <details id="explore-sky-map" className="science-details" open={mapOpen} onToggle={event => onMapOpenChange(event.currentTarget.open)}><summary>Sky map<span>SELECT POSITION</span></summary>
          {<MocRadar
            currentRa={target.ra}
            currentDec={target.dec}
            ra={target.ra}
            dec={target.dec}
            inFootprint={target.inSpherexFootprint}
            targetName={target.name}
            onSelectTarget={(bt) => {
              onMapSelect();
              setTarget(bt);
              setQueryInput(bt.name);
              setSampleCoords({ ra: bt.ra, dec: bt.dec });
              setCrosshair({ x: 256, y: 256 });
              setEpochIdx(0);
            }}
            onSelectCoordinate={(coord) => {
              onMapSelect();
              const newT = {
                id: `coord-${coord.ra.toFixed(2)}-${coord.dec.toFixed(2)}`,
                name: coord.name,
                ra: coord.ra,
                dec: coord.dec,
                hmsDms: `${coord.ra.toFixed(4)} deg, ${coord.dec.toFixed(4)} deg`,
                fovArcmin: 5.0,
                inSpherexFootprint: coord.inSpherexFootprint ?? coord.inMoc,
                survey: spherex ? 'SPHEREx DR1 archive request' : 'unWISE request / simulation',
                properMotion: 'Not measured by this app',
                spectralNote: 'Sky-coordinate selection; coverage is established by archive results',
                dqFlag: 'UNAVAILABLE',
                motionDxPerEpoch: 0.0,
                motionDyPerEpoch: 0.0,
                variabilityAmp: 0.0,
                iceDepth: { h2o: 0.05, pah: 0.0, co2: 0.02, co: 0.05 },
                peakFluxMjy: 12.0,
                epochs: (coord.inSpherexFootprint ?? coord.inMoc)
                  ? ['allwise', 'neo2', 'neo5']
                  : ['allwise', 'neo2', 'neo5']
              };
              setTarget(newT);
              setQueryInput(newT.name);
              setSampleCoords({ ra: coord.ra, dec: coord.dec });
              setCrosshair({ x: 256, y: 256 });
              setEpochIdx(0);
            }}
          />}
          </details>

          <details className="science-details" id="spectrum" open={spectrumOpen} onToggle={event => { setSpectrumOpen(event.currentTarget.open); if (!event.currentTarget.open) setChannelsLoading(false); }}><summary>Inspect infrared channels<span>OPTIONAL</span></summary>
          {(!spherex || spectrumOpen) && <div className="panel-box spectrum-panel">
            {spherex ? isSpherexImage ? <MeasuredSpectrum embedded ra={channelPosition.ra} dec={channelPosition.dec} imageWavelength={channelPosition.wavelength} requestDelay={channelPosition.delay || 0} onMeasureCursor={() => setChannelPosition({...sampleCoords})} onLoadingChange={setChannelsLoading} /> : <div className="inspect-channels-callout"><h2>Measured infrared channels</h2><p className="quiet-note">Select SPHEREx to study real measurements at these coordinates.</p><button type="button" className="inspect-channels-button" onClick={() => setImageSource('spherex')}>View SPHEREx channels ↗</button></div> : <>
              <div className="panel-header"><span className="panel-title">Simulated spectrum · arbitrary units</span><div style={{display:'flex',gap:6}}><button type="button" className={`btn-compact ${showLines ? 'active' : ''}`} onClick={() => setShowLines(value => !value)}>Markers</button><button type="button" className="btn-compact" onClick={handleExportCsv}><Download size={12} /> CSV</button><button type="button" className="btn-compact" onClick={handleExportJson}><Download size={12} /> JSON</button></div></div>
              <p className="quiet-note">Teaching model · markers are references, not detections.</p>
              <SpectrumChart bands={activeBands} wiseBands={fallbackSpectrum.wiseBands} inSpherexFootprint activeWavelength={activeWavelength} onSelectWavelength={setActiveWavelength} showLines={showLines} />
            </>}
          </div>}
          </details>


          {!spherex && <details className="science-details"><summary>Spectrum controls<span>APERTURE &amp; WAVELENGTH</span></summary><div className="panel-box">
            <div className="panel-header">
              <span className="panel-title">Aperture &amp; Wavelength Controls</span>
              <span className="mono" style={{ fontSize: 11, color: '#8698ad' }}>
                DQ: unavailable
              </span>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              <label
                className="mono"
                style={{
                  fontSize: 11.5,
                  color: '#a7b5c6',
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
                  color: '#a7b5c6',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span>
                  Teaching wavelength: {activeWavelength.toFixed(2)} µm ({Math.round(sedRatio * 100)}% peak)
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

          </details>}
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
