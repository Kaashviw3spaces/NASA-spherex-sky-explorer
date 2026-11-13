import { useEffect, useRef, useState, useMemo } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Maximize,
  Minimize,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Video,
  Bookmark,
  Check,
  Edit2,
  Sliders,
  Sparkles,
  Layers,
  Image as ImageIcon
} from 'lucide-react';
import { BENCHMARK_TARGETS } from '../data/catalog';
import {
  fetchCutoutsWithPolling,
  getCachedCutouts,
  setCachedCutouts
} from '../api/client';
import {
  generateStarfieldBuffer,
  applyStretch,
  mapColormap,
  computeDifferenceBuffer
} from '../utils/astronomyRenderer';
import { saveLibraryItem } from '../utils/libraryStorage';

export default function ScenePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const raParam = parseFloat(searchParams.get('ra') || '');
  const decParam = parseFloat(searchParams.get('dec') || '');
  const fovParam = parseFloat(searchParams.get('fov') || '5.0');
  const targetIdParam = searchParams.get('target') || '';
  const initialMode = searchParams.get('mode') || 'blink';
  const initialStretch = searchParams.get('stretch') || 'zscale';
  const initialColormap = searchParams.get('colormap') || 'inferno';
  const initialGain = parseFloat(searchParams.get('gain') || '1.0');
  const initialWavelength = parseFloat(searchParams.get('wavelength') || '2.2');
  const initialTitle = searchParams.get('title') || '';
  const initialEpochIdx = parseInt(searchParams.get('epoch') || '0', 10);
  const initialCurtainPos = parseFloat(searchParams.get('curtain') || '0.5');
  const actionParam = searchParams.get('action') || '';
  const isEditMode = actionParam === 'edit' || searchParams.get('edit') === 'true';
  const isFullscreenMode = actionParam === 'fullscreen';

  // Target resolution synced with ExplorerPage
  const target = useMemo(() => {
    if (targetIdParam) {
      const found = BENCHMARK_TARGETS.find((b) => b.id === targetIdParam);
      if (found) return found;
    }
    if (!isNaN(raParam) && !isNaN(decParam)) {
      const match = BENCHMARK_TARGETS.find(
        (b) => Math.abs(b.ra - raParam) < 0.005 && Math.abs(b.dec - decParam) < 0.005
      );
      if (match) return match;
      return {
        id: targetIdParam || `coord-${raParam.toFixed(4)}-${decParam.toFixed(4)}`,
        name: initialTitle || `J${raParam.toFixed(3)}${decParam >= 0 ? '+' : ''}${decParam.toFixed(3)}`,
        ra: raParam,
        dec: decParam,
        hmsDms: `${raParam.toFixed(4)}°, ${decParam.toFixed(4)}°`,
        fovArcmin: fovParam,
        inSpherexFootprint: true,
        survey: 'SPHEREx 102-Band / unWISE',
        epochs: ['2025-05', '2025-11', '2026-05', '2026-10']
      };
    }
    return BENCHMARK_TARGETS[0];
  }, [targetIdParam, raParam, decParam, fovParam, initialTitle]);

  const [sceneName, setSceneName] = useState(initialTitle || target.name);
  const [isRenaming, setIsRenaming] = useState(false);
  const [viewMode, setViewMode] = useState(initialMode);
  const [stretch, setStretch] = useState(initialStretch);
  const [colormap, setColormap] = useState(initialColormap);
  const [gain, setGain] = useState(isNaN(initialGain) ? 1.0 : initialGain);
  const [activeWavelength, setActiveWavelength] = useState(initialWavelength);

  // Playback & Frame State
  const [isPlaying, setIsPlaying] = useState(initialMode === 'blink');
  const [fps, setFps] = useState(3);
  const [epochIdx, setEpochIdx] = useState(initialEpochIdx >= 0 ? initialEpochIdx : 0);
  const [curtainPos, setCurtainPos] = useState(isNaN(initialCurtainPos) ? 0.5 : initialCurtainPos);
  const [isFullscreenActive, setIsFullscreenActive] = useState(false);

  // Live NASA unWISE cutouts - initialize instantly from memory cache if available
  const [liveFrames, setLiveFrames] = useState(() => {
    return getCachedCutouts(target.ra, target.dec, target.fovArcmin) || [];
  });
  const [loadingFrames, setLoadingFrames] = useState(() => {
    return !getCachedCutouts(target.ra, target.dec, target.fovArcmin);
  });

  // Recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const canvasRef = useRef(null);
  const canvasSecondaryRef = useRef(null);
  const containerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const editorRef = useRef(null);
  const recordTimerRef = useRef(null);
  const compositeTimerRef = useRef(null);
  const imageDataPrimaryRef = useRef(null);
  const imageDataSecondaryRef = useRef(null);

  // Clean up any active recording timers or streams on unmount
  useEffect(() => {
    return () => {
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
      if (compositeTimerRef.current) {
        clearInterval(compositeTimerRef.current);
        compositeTimerRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch (_) {}
      }
    };
  }, []);

  // Synchronize state when query parameters change (e.g., navigating from ExplorerPage with new target or epoch)
  useEffect(() => {
    setViewMode(initialMode);
    setStretch(initialStretch);
    setColormap(initialColormap);
    setActiveWavelength(initialWavelength);
    setSceneName(initialTitle || target.name);
    setEpochIdx(initialEpochIdx >= 0 ? initialEpochIdx : 0);
    setIsPlaying(initialMode === 'blink');
    if (!isNaN(initialCurtainPos)) {
      setCurtainPos(initialCurtainPos);
    }
    if (!isNaN(initialGain)) {
      setGain(initialGain);
    }

    const cached = getCachedCutouts(target.ra, target.dec, target.fovArcmin);
    if (cached && cached.length > 0) {
      setLiveFrames(cached);
      setLoadingFrames(false);
    }
  }, [
    initialMode,
    initialStretch,
    initialColormap,
    initialGain,
    initialWavelength,
    initialTitle,
    initialEpochIdx,
    initialCurtainPos,
    target.ra,
    target.dec,
    target.fovArcmin,
    target.name
  ]);

  // Auto-scroll to scene editor if opened with edit action
  useEffect(() => {
    if (isEditMode && editorRef.current) {
      setTimeout(() => {
        editorRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 250);
    }
  }, [isEditMode]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreenActive(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  // Fetch real NASA cutouts synced with backend
  useEffect(() => {
    const controller = new AbortController();

    const cached = getCachedCutouts(target.ra, target.dec, target.fovArcmin);
    if (cached && cached.length > 0) {
      setLiveFrames(cached);
      setLoadingFrames(false);
    } else {
      setLoadingFrames(true);
    }

    fetchCutoutsWithPolling(
      {
        ra: target.ra,
        dec: target.dec,
        fovArcmin: target.fovArcmin || 5.0,
        bands: [42]
      },
      (frames) => {
        if (!controller.signal.aborted && frames.length > 0) {
          setLiveFrames(frames.slice(0, 16));
          setCachedCutouts(target.ra, target.dec, target.fovArcmin, frames.slice(0, 16));
          setLoadingFrames(false);
        }
      },
      controller.signal
    )
      .then((frames) => {
        if (!controller.signal.aborted && frames?.length > 0) {
          setLiveFrames(frames.slice(0, 16));
          setCachedCutouts(target.ra, target.dec, target.fovArcmin, frames.slice(0, 16));
          setLoadingFrames(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLoadingFrames(false);
        }
      });

    return () => controller.abort();
  }, [target.ra, target.dec, target.fovArcmin]);

  const frameCount = liveFrames.length > 0 ? liveFrames.length : (target.epochs?.length || 3);
  const lastEpochIdx = Math.max(0, frameCount - 1);
  const safeEpochIdx = epochIdx % Math.max(1, frameCount);

  // Phase-locked blink timer
  useEffect(() => {
    if (viewMode !== 'blink' || !isPlaying) return undefined;
    const interval = setInterval(() => {
      setEpochIdx((prev) => (prev + 1) % Math.max(1, frameCount));
    }, 1000 / fps);
    return () => clearInterval(interval);
  }, [viewMode, isPlaying, fps, frameCount]);

  const getFrameBuffer = (idx) => {
    const safeI = idx % Math.max(1, frameCount);
    if (liveFrames.length > 0 && liveFrames[safeI]?.buffer) {
      return liveFrames[safeI].buffer;
    }
    const starfield = generateStarfieldBuffer(target, safeI, 512);
    return starfield && starfield.buffer ? starfield.buffer : starfield;
  };

  const activeMeta = useMemo(() => {
    if (liveFrames.length > 0 && liveFrames[safeEpochIdx]?.meta) {
      return liveFrames[safeEpochIdx].meta;
    }
    return {
      epoch: target.epochs?.[safeEpochIdx] || `Epoch ${safeEpochIdx + 1}`,
      provenance: target.survey || 'SPHEREx-Survey1'
    };
  }, [liveFrames, safeEpochIdx, target]);

  const activeMetaA = useMemo(() => {
    if (liveFrames.length > 0 && liveFrames[0]?.meta) {
      return liveFrames[0].meta;
    }
    return {
      epoch: target.epochs?.[0] || 'Epoch 1',
      provenance: target.survey || 'SPHEREx-Survey1'
    };
  }, [liveFrames, target]);

  const activeMetaB = useMemo(() => {
    if (liveFrames.length > 0 && liveFrames[lastEpochIdx]?.meta) {
      return liveFrames[lastEpochIdx].meta;
    }
    return {
      epoch: target.epochs?.[lastEpochIdx] || `Epoch ${lastEpochIdx + 1}`,
      provenance: target.survey || 'SPHEREx-Survey1'
    };
  }, [liveFrames, lastEpochIdx, target]);

  // Render canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = 512;
    if (canvas.width !== size) {
      canvas.width = size;
      canvas.height = size;
    }

    const isCurtain = viewMode === 'swipe' || viewMode === 'curtain';
    const isSideBySide = viewMode === 'side-by-side';
    const isDiff = viewMode === 'diff';

    const fA = getFrameBuffer(0);
    const fB = getFrameBuffer(lastEpochIdx);

    const renderToCanvas = (targetCtx, buffer, isSecondary = false) => {
      const stretched = applyStretch(buffer, stretch, gain);
      const imgDataRef = isSecondary ? imageDataSecondaryRef : imageDataPrimaryRef;
      if (!imgDataRef.current || imgDataRef.current.width !== size || imgDataRef.current.height !== size) {
        imgDataRef.current = targetCtx.createImageData(size, size);
      }
      const imgData = imgDataRef.current;
      const data = imgData.data;
      for (let i = 0; i < stretched.length; i++) {
        const [r, g, b] = mapColormap(stretched[i], colormap);
        const p = i * 4;
        data[p] = r;
        data[p + 1] = g;
        data[p + 2] = b;
        data[p + 3] = 255;
      }
      targetCtx.putImageData(imgData, 0, 0);
    };

    if (isSideBySide) {
      renderToCanvas(ctx, fA, false);
      const canvasB = canvasSecondaryRef.current;
      if (canvasB) {
        if (canvasB.width !== size) {
          canvasB.width = size;
          canvasB.height = size;
        }
        const ctxB = canvasB.getContext('2d');
        renderToCanvas(ctxB, fB, true);
      }
      return;
    }

    let buf;
    if (isDiff) {
      buf = computeDifferenceBuffer(fA, fB);
    } else if (isCurtain) {
      buf = new Float32Array(size * size);
      const splitX = Math.floor(size * curtainPos);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const idx = y * size + x;
          buf[idx] = x < splitX ? fA[idx] : fB[idx];
        }
      }
    } else {
      // Blink or static pictures
      buf = getFrameBuffer(safeEpochIdx);
    }

    renderToCanvas(ctx, buf);

    // Curtain line overlay
    if (isCurtain) {
      ctx.strokeStyle = '#e88d3a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(size * curtainPos, 0);
      ctx.lineTo(size * curtainPos, size);
      ctx.stroke();
    }
  }, [
    liveFrames,
    target,
    epochIdx,
    viewMode,
    stretch,
    colormap,
    gain,
    activeWavelength,
    curtainPos,
    frameCount,
    lastEpochIdx,
    safeEpochIdx
  ]);

  // 5-second WebM/MP4 clip recording
  const handleRecordClip = () => {
    const canvas = canvasRef.current;
    if (!canvas || isRecording) return;

    try {
      if (viewMode === 'blink' && !isPlaying) {
        setIsPlaying(true);
      }

      let recordCanvas = canvas;
      if (viewMode === 'side-by-side' && canvasSecondaryRef.current) {
        const compositeCanvas = document.createElement('canvas');
        compositeCanvas.width = 1024;
        compositeCanvas.height = 512;
        const compCtx = compositeCanvas.getContext('2d');

        const drawComposite = () => {
          if (canvasRef.current) {
            compCtx.drawImage(canvasRef.current, 0, 0, 512, 512);
          }
          if (canvasSecondaryRef.current) {
            compCtx.drawImage(canvasSecondaryRef.current, 512, 0, 512, 512);
          }
        };
        drawComposite();
        if (compositeTimerRef.current) clearInterval(compositeTimerRef.current);
        compositeTimerRef.current = setInterval(drawComposite, 1000 / 30);
        recordCanvas = compositeCanvas;
      }

      const stream = recordCanvas.captureStream(30);
      let mimeType = 'video/webm';
      let fileExt = 'webm';
      if (typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
          mimeType = 'video/webm;codecs=vp9';
          fileExt = 'webm';
        } else if (MediaRecorder.isTypeSupported('video/webm')) {
          mimeType = 'video/webm';
          fileExt = 'webm';
        } else if (MediaRecorder.isTypeSupported('video/mp4')) {
          mimeType = 'video/mp4';
          fileExt = 'mp4';
        } else {
          mimeType = '';
          fileExt = 'mp4';
        }
      }

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        if (compositeTimerRef.current) {
          clearInterval(compositeTimerRef.current);
          compositeTimerRef.current = null;
        }
        if (recordTimerRef.current) {
          clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        const actualType = recorder.mimeType || mimeType || 'video/mp4';
        const blob = new Blob(recordedChunksRef.current, { type: actualType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const ext = actualType.includes('webm') ? 'webm' : 'mp4';
        a.download = `${sceneName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_clip_5s.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
        setIsRecording(false);
        setRecordProgress(0);
      };

      recorder.start();
      setIsRecording(true);
      setRecordProgress(1);

      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      let count = 1;
      recordTimerRef.current = setInterval(() => {
        count += 1;
        setRecordProgress(count);
        if (count >= 5) {
          if (recordTimerRef.current) {
            clearInterval(recordTimerRef.current);
            recordTimerRef.current = null;
          }
          recorder.stop();
        }
      }, 1000);
    } catch (err) {
      if (compositeTimerRef.current) {
        clearInterval(compositeTimerRef.current);
        compositeTimerRef.current = null;
      }
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
      console.error('Failed to capture canvas clip:', err);
      alert('Video clip recording is not supported in this browser.');
      setIsRecording(false);
    }
  };

  const handleSaveToLibrary = () => {
    saveLibraryItem({
      name: sceneName,
      ra: target.ra,
      dec: target.dec,
      fovArcmin: parseFloat(fovParam) || 5.0,
      mode: viewMode,
      stretch,
      colormap,
      activeWavelength
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const isSideBySide = viewMode === 'side-by-side';

  return (
    <div
      ref={containerRef}
      className="scene-page"
      style={{
        minHeight: '100vh',
        background: '#0b0d10',
        color: '#f0f6fc',
        display: 'flex',
        flexDirection: 'column',
        padding: isFullscreenActive ? '8px 16px' : '16px 24px 32px 24px'
      }}
    >
      {/* Top Header */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          paddingBottom: 14,
          borderBottom: '1px solid #21262d',
          marginBottom: 16
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={() => navigate(-1)}
            className="btn btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              fontSize: 13
            }}
          >
            <ArrowLeft size={14} /> Back to Explorer
          </button>

          <div>
            {isRenaming ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="text"
                  value={sceneName}
                  onChange={(e) => setSceneName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && setIsRenaming(false)}
                  style={{
                    background: '#161b22',
                    border: '1px solid #e88d3a',
                    color: '#fff',
                    padding: '4px 8px',
                    borderRadius: 4,
                    fontSize: 16,
                    fontWeight: 600
                  }}
                  autoFocus
                />
                <button
                  onClick={() => setIsRenaming(false)}
                  className="btn btn-primary"
                  style={{ padding: '4px 10px', fontSize: 12 }}
                >
                  Done
                </button>
              </div>
            ) : (
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                onClick={() => setIsRenaming(true)}
                title="Click to rename scene"
              >
                <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>{sceneName}</h1>
                <Edit2 size={13} style={{ color: 'var(--text-muted, #8b949e)' }} />
              </div>
            )}
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: '#4ea8de', marginTop: 2 }}>
              RA {target.ra.toFixed(4)}° · Dec {target.dec.toFixed(4)}° · FoV {fovParam}° · Mode: {viewMode.toUpperCase()}
              {liveFrames.length > 0 ? (
                <span style={{ color: '#52b788', marginLeft: 8 }}>
                  ● NASA unWISE / NEOWISE FITS ({liveFrames.length} epochs)
                </span>
              ) : (
                <span style={{ color: '#8b949e', marginLeft: 8 }}>○ Connecting to Archive</span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={handleToggleFullscreen}
            className="btn btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              fontSize: 13
            }}
            title={isFullscreenActive ? 'Exit browser fullscreen' : 'Expand to browser fullscreen'}
          >
            {isFullscreenActive ? <Minimize size={14} /> : <Maximize size={14} />}
            <span>{isFullscreenActive ? 'Exit Fullscreen' : 'Fullscreen View'}</span>
          </button>

          <Link
            to="/library"
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 13 }}
          >
            <Bookmark size={14} /> View Library
          </Link>
        </div>
      </header>

      {/* Mode / Tabs Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 12,
          background: '#161b22',
          padding: '8px 12px',
          borderRadius: 6,
          border: '1px solid #30363d'
        }}
      >
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {[
            { id: 'blink', label: 'Blink' },
            { id: 'swipe', label: 'Split-Curtain' },
            { id: 'side-by-side', label: 'Side-by-Side' },
            { id: 'static', label: 'Static Pictures' },
            { id: 'diff', label: 'Δ Difference' }
          ].map((m) => {
            const isActive = viewMode === m.id || (m.id === 'swipe' && viewMode === 'curtain');
            return (
              <button
                key={m.id}
                onClick={() => {
                  setViewMode(m.id);
                  if (m.id === 'blink') setIsPlaying(true);
                  else setIsPlaying(false);
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: 4,
                  border: 'none',
                  background: isActive ? '#e88d3a' : 'transparent',
                  color: isActive ? '#000' : '#c9d1d9',
                  fontWeight: isActive ? 600 : 400,
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: 'IBM Plex Sans, sans-serif'
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--text-muted, #8b949e)' }}>Stretch:</span>
            <select
              value={stretch}
              onChange={(e) => setStretch(e.target.value)}
              style={{
                background: '#0d1117',
                border: '1px solid #30363d',
                color: '#fff',
                padding: '3px 8px',
                borderRadius: 4
              }}
            >
              <option value="zscale">ZScale</option>
              <option value="asinh">Asinh</option>
              <option value="log">Log</option>
              <option value="linear">Linear</option>
            </select>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--text-muted, #8b949e)' }}>Colormap:</span>
            <select
              value={colormap}
              onChange={(e) => setColormap(e.target.value)}
              style={{
                background: '#0d1117',
                border: '1px solid #30363d',
                color: '#fff',
                padding: '3px 8px',
                borderRadius: 4
              }}
            >
              <option value="inferno">Inferno</option>
              <option value="viridis">Viridis</option>
              <option value="grayscale_r">Inverted B&W</option>
            </select>
          </label>
        </div>
      </div>

      {/* Main Full-Screen Viewport */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#05070a',
          borderRadius: 8,
          border: '1px solid #30363d',
          padding: 16,
          position: 'relative',
          minHeight: isFullscreenMode ? '70vh' : 480
        }}
      >
        {isSideBySide ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 16,
              width: '100%',
              maxWidth: '92vw',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <div style={{ textAlign: 'center', position: 'relative' }}>
              <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: '#e88d3a', marginBottom: 6 }}>
                Epoch A: {activeMetaA.epoch ? activeMetaA.epoch.slice(0, 10) : target.epochs?.[0] || 'Initial'}
              </div>
              <canvas
                ref={canvasRef}
                style={{
                  maxWidth: '100%',
                  maxHeight: isFullscreenActive ? '78vh' : '65vh',
                  aspectRatio: '1 / 1',
                  borderRadius: 4,
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)'
                }}
              />
            </div>
            <div style={{ textAlign: 'center', position: 'relative' }}>
              <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: '#52b788', marginBottom: 6 }}>
                Epoch B: {activeMetaB.epoch ? activeMetaB.epoch.slice(0, 10) : target.epochs?.[lastEpochIdx] || 'Final'}
              </div>
              <canvas
                ref={canvasSecondaryRef}
                style={{
                  maxWidth: '100%',
                  maxHeight: isFullscreenActive ? '78vh' : '65vh',
                  aspectRatio: '1 / 1',
                  borderRadius: 4,
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)'
                }}
              />
            </div>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            style={{
              maxWidth: '100%',
              maxHeight: isFullscreenActive ? '80vh' : (isFullscreenMode ? '75vh' : '68vh'),
              aspectRatio: '1 / 1',
              borderRadius: 4,
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)'
            }}
          />
        )}

        {/* HUD Overlay */}
        <div
          style={{
            position: 'absolute',
            bottom: 24,
            left: 24,
            background: 'rgba(11, 13, 16, 0.88)',
            border: '1px solid #30363d',
            padding: '6px 14px',
            borderRadius: 6,
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 11,
            color: '#c9d1d9',
            display: 'flex',
            gap: 14,
            alignItems: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            pointerEvents: 'none'
          }}
        >
          <span>
            Epoch:{' '}
            <strong style={{ color: '#e88d3a' }}>
              {activeMeta.epoch ? activeMeta.epoch.slice(0, 10) : target.epochs?.[safeEpochIdx] || `Epoch ${safeEpochIdx + 1}`}
            </strong>{' '}
            ({safeEpochIdx + 1}/{frameCount})
          </span>
          <span>Target: {target.name} ({target.ra.toFixed(4)}°, {target.dec.toFixed(4)}°)</span>
          <span style={{ color: '#4ea8de' }}>Mode: {viewMode.toUpperCase()}</span>
          {liveFrames.length > 0 ? (
            <span style={{ color: '#52b788' }}>● NASA unWISE / NEOWISE FITS</span>
          ) : (
            <span style={{ color: '#8b949e' }}>● Calibrated Pipeline</span>
          )}
        </div>
      </div>

      {/* Multi-Epoch Selection Pill Bar for Static Pictures */}
      {viewMode === 'static' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            marginTop: 10,
            padding: '10px 14px',
            background: '#161b22',
            borderRadius: 6,
            border: '1px solid #30363d'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={() => setEpochIdx((prev) => (prev - 1 + frameCount) % frameCount)}
              className="btn btn-secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 12px',
                fontSize: 12
              }}
              title="Previous Epoch"
            >
              <ChevronLeft size={14} /> Prev Epoch
            </button>
            <button
              onClick={() => setEpochIdx((prev) => (prev + 1) % frameCount)}
              className="btn btn-secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 12px',
                fontSize: 12
              }}
              title="Next Epoch"
            >
              Next Epoch <ChevronRight size={14} />
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1, alignItems: 'center' }}>
            {Array.from({ length: frameCount }).map((_, idx) => {
              const meta = liveFrames[idx]?.meta;
              const label = meta?.epoch
                ? meta.epoch.slice(0, 10)
                : (target.epochs?.[idx] || `Epoch ${idx + 1}`);
              const isCurrent = safeEpochIdx === idx;
              return (
                <button
                  key={idx}
                  onClick={() => setEpochIdx(idx)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 4,
                    border: isCurrent ? '1px solid #e88d3a' : '1px solid #30363d',
                    background: isCurrent ? 'rgba(232, 141, 58, 0.2)' : '#0d1117',
                    color: isCurrent ? '#e88d3a' : '#c9d1d9',
                    fontSize: 12,
                    fontWeight: isCurrent ? 600 : 400,
                    cursor: 'pointer',
                    fontFamily: 'IBM Plex Mono, monospace'
                  }}
                >
                  {idx + 1}. {label}
                </button>
              );
            })}
          </div>

          <span className="mono" style={{ fontSize: 11, color: '#8b949e', whiteSpace: 'nowrap' }}>
            Showing Frame {safeEpochIdx + 1} of {frameCount}
          </span>
        </div>
      )}

      {/* Transport Controls Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          padding: '12px 16px',
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: 6,
          marginTop: 10
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setEpochIdx((prev) => (prev - 1 + frameCount) % frameCount)}
            className="btn btn-secondary"
            style={{ padding: '6px 10px' }}
            title="Previous Frame"
          >
            <SkipBack size={14} />
          </button>

          {viewMode === 'blink' && (
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="btn btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                fontSize: 13
              }}
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              {isPlaying ? 'Pause' : 'Play'}
            </button>
          )}

          <button
            onClick={() => setEpochIdx((prev) => (prev + 1) % frameCount)}
            className="btn btn-secondary"
            style={{ padding: '6px 10px' }}
            title="Next Frame"
          >
            <SkipForward size={14} />
          </button>

          {viewMode === 'blink' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginLeft: 12,
                fontSize: 12,
                fontFamily: 'IBM Plex Mono, monospace'
              }}
            >
              <span style={{ color: 'var(--text-muted, #8b949e)' }}>Speed:</span>
              <input
                type="range"
                min="1"
                max="12"
                value={fps}
                onChange={(e) => setFps(Number(e.target.value))}
                style={{ width: 80 }}
              />
              <span style={{ color: '#e88d3a' }}>{fps} Hz</span>
            </div>
          )}

          {(viewMode === 'swipe' || viewMode === 'curtain') && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginLeft: 12,
                fontSize: 12,
                fontFamily: 'IBM Plex Mono, monospace'
              }}
            >
              <span style={{ color: 'var(--text-muted, #8b949e)' }}>Curtain Divider:</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={curtainPos}
                onChange={(e) => setCurtainPos(Number(e.target.value))}
                style={{ width: 120 }}
              />
              <span style={{ color: '#e88d3a' }}>{Math.round(curtainPos * 100)}%</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={handleRecordClip}
            disabled={isRecording}
            className="btn btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              fontSize: 13,
              borderColor: isRecording ? '#e88d3a' : undefined
            }}
          >
            <Video size={14} style={{ color: isRecording ? '#e88d3a' : 'inherit' }} />
            {isRecording ? `Recording (${recordProgress}/5s)...` : 'Clip 5s Video'}
          </button>
        </div>
      </div>

      {/* Edit / Save Options Panel (Present when opened via Edit/Save or customized) */}
      <div
        ref={editorRef}
        style={{
          marginTop: 16,
          background: '#161b22',
          border: isEditMode ? '1px solid #e88d3a' : '1px solid #30363d',
          borderRadius: 8,
          padding: 20
        }}
      >
        <h3
          style={{
            margin: '0 0 14px 0',
            fontSize: '1rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <Sliders size={16} style={{ color: '#e88d3a' }} /> Scene Capture &amp; Library Options
        </h3>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
            alignItems: 'center'
          }}
        >
          {/* Action 1: Clip 5 Seconds */}
          <div
            style={{
              padding: 14,
              background: '#0d1117',
              borderRadius: 6,
              border: '1px solid #21262d',
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}
          >
            <div style={{ fontWeight: 500, fontSize: 13 }}>Record 5-Second Video Clip</div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted, #8b949e)' }}>
              Capture the active time-series animation as a downloadable .webm video clip.
            </p>
            <button
              onClick={handleRecordClip}
              disabled={isRecording}
              className="btn btn-secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginTop: 4,
                padding: '8px 12px',
                fontSize: 13,
                borderColor: isRecording ? '#e88d3a' : undefined
              }}
            >
              <Video size={14} style={{ color: isRecording ? '#e88d3a' : 'inherit' }} />
              {isRecording ? `Recording (${recordProgress}/5s)...` : 'Clip for 5 Seconds'}
            </button>
          </div>

          {/* Action 2: Rename Scene */}
          <div
            style={{
              padding: 14,
              background: '#0d1117',
              borderRadius: 6,
              border: '1px solid #21262d',
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}
          >
            <div style={{ fontWeight: 500, fontSize: 13 }}>Edit Instant Name</div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted, #8b949e)' }}>
              Change the title tag for this instant snapshot before storing.
            </p>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <input
                type="text"
                value={sceneName}
                onChange={(e) => setSceneName(e.target.value)}
                style={{
                  background: '#161b22',
                  border: '1px solid #30363d',
                  color: '#fff',
                  padding: '6px 10px',
                  borderRadius: 4,
                  fontSize: 13,
                  flex: 1
                }}
              />
            </div>
          </div>

          {/* Action 3: Save to Library */}
          <div
            style={{
              padding: 14,
              background: '#0d1117',
              borderRadius: 6,
              border: '1px solid #21262d',
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}
          >
            <div style={{ fontWeight: 500, fontSize: 13 }}>Save to Personal Library</div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted, #8b949e)' }}>
              Store this coordinate and viewport configuration in your browser's library.
            </p>
            <button
              onClick={handleSaveToLibrary}
              className="btn btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginTop: 4,
                padding: '8px 12px',
                fontSize: 13
              }}
            >
              {savedSuccess ? <Check size={14} /> : <Bookmark size={14} />}
              {savedSuccess ? 'Saved to Library!' : 'Save Coordinate to Library'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
