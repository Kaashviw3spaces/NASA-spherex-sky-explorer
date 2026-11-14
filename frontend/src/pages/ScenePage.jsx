import { sceneSettings } from '../utils/sceneSettings';
import { observationDate } from '../utils/observationDate';
import { computeCutLevels } from '../utils/displayLevels';
import { displayedFrames, observationSnapshot } from '../utils/observationContext';
import WhatAmISeeing from '../components/learning/WhatAmISeeing';
import { targetFromParams } from '../data/pointing';
import useCutoutFrames from '../hooks/useCutoutFrames';
import DataNotice from '../components/DataNotice';
import { useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
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
import {
  generateStarfieldBuffer,
  applyStretch,
  mapColormap,
  computeDifferenceBuffer
} from '../utils/astronomyRenderer';
import { saveLibraryItem } from '../utils/libraryStorage';

export default function ScenePage() {
  const [params] = useSearchParams();
  let target;
  try { target = targetFromParams(params); } catch (error) {
    return <div className="page-container"><p role="alert">{error.message}</p><Link to="/explorer">Open the default sky view</Link></div>;
  }
  return <SceneSession key={JSON.stringify([target.ra, target.dec, target.fovArcmin, target.name])} />;
}

function SceneSession() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const settings = sceneSettings(searchParams);
  const initialMode = settings.mode, initialStretch = settings.stretch, initialColormap = settings.colormap;
  const initialGain = settings.gain, initialWavelength = settings.wavelength;
  const initialTitle = searchParams.get('title') || '';
  const initialEpochIdx = settings.epoch, initialCurtainPos = settings.curtain;
  const actionParam = searchParams.get('action') || '';
  const isEditMode = actionParam === 'edit' || searchParams.get('edit') === 'true';
  const isFullscreenMode = actionParam === 'fullscreen';

  const target = useMemo(() => targetFromParams(searchParams), [searchParams]);

  const [sceneName, setSceneName] = useState(initialTitle || target.name);
  const [isRenaming, setIsRenaming] = useState(false);
  const [viewMode, setViewMode] = useState(initialMode);
  const [stretch, setStretch] = useState(initialStretch);
  const [colormap, setColormap] = useState(initialColormap);
  const [gain, setGain] = useState(isNaN(initialGain) ? 1.0 : initialGain);
  const [activeWavelength, setActiveWavelength] = useState(initialWavelength);

  // Playback & Frame State
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(settings.fps);
  const [epochIdx, setEpochIdx] = useState(initialEpochIdx >= 0 ? initialEpochIdx : 0);
  const [curtainPos, setCurtainPos] = useState(isNaN(initialCurtainPos) ? 0.5 : initialCurtainPos);
  const [isFullscreenActive, setIsFullscreenActive] = useState(false);

  const { frames: liveFrames, status: imageStatus, error: imageError, retry } = useCutoutFrames(target);


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
    setFps(settings.fps);
    setActiveWavelength(initialWavelength);
    setSceneName(initialTitle || target.name);
    setEpochIdx(initialEpochIdx >= 0 ? initialEpochIdx : 0);
    setIsPlaying(false);
    if (!isNaN(initialCurtainPos)) {
      setCurtainPos(initialCurtainPos);
    }
    if (!isNaN(initialGain)) {
      setGain(initialGain);
    }

  }, [
    initialMode,
    settings.fps,
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

  const frameCount = liveFrames.length > 0 ? liveFrames.length : (target.epochs?.length || 3);
  const lastEpochIdx = Math.max(0, frameCount - 1);
  const safeEpochIdx = epochIdx % Math.max(1, frameCount);

  // Phase-locked blink timer
  useEffect(() => {
    if (viewMode !== 'blink' || !isPlaying || frameCount < 2) return undefined;
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
      epoch: 'unknown',
      provenance: 'Synthetic-Demo'
    };
  }, [liveFrames, safeEpochIdx, target]);

  const activeMetaA = useMemo(() => {
    if (liveFrames.length > 0 && liveFrames[0]?.meta) {
      return liveFrames[0].meta;
    }
    return {
      epoch: 'unknown',
      provenance: 'Synthetic-Demo'
    };
  }, [liveFrames, target]);

  const activeMetaB = useMemo(() => {
    if (liveFrames.length > 0 && liveFrames[lastEpochIdx]?.meta) {
      return liveFrames[lastEpochIdx].meta;
    }
    return {
      epoch: 'unknown',
      provenance: 'Synthetic-Demo'
    };
  }, [liveFrames, lastEpochIdx, target]);

  // Update before paint so a new pointing never displays the preceding pointing.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
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
      const sharedLevels = ['side-by-side','swipe','curtain'].includes(viewMode) ? computeCutLevels(Float32Array.from([...fA, ...fB])) : null;
      const stretched = applyStretch(buffer, stretch, gain, sharedLevels);
      const imgDataRef = isSecondary ? imageDataSecondaryRef : imageDataPrimaryRef;
      if (!imgDataRef.current || imgDataRef.current.width !== size || imgDataRef.current.height !== size) {
        imgDataRef.current = targetCtx.createImageData(size, size);
      }
      const imgData = imgDataRef.current;
      const data = imgData.data;
      for (let i = 0; i < stretched.length; i++) {
        const [r, g, b] = Number.isFinite(buffer[i]) ? mapColormap(stretched[i], colormap) : [27,35,49];
        const p = i * 4;
        data[p] = r;
        data[p + 1] = g;
        data[p + 2] = b;
        data[p + 3] = 255;
      }
      targetCtx.putImageData(imgData, 0, 0);
      targetCtx.fillStyle = '#08101e';
      targetCtx.fillRect(0, size - 28, size, 28);
      targetCtx.fillStyle = '#ffffff';
      targetCtx.font = '12px sans-serif';
      targetCtx.fillText(liveFrames.length && liveFrames.every(f => f.meta?.dataKind === 'observed')
        ? 'Observed unWISE · source details in app' : 'SIMULATED DEMO / mixed sources', 8, size - 10);
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
      ctx.strokeStyle = '#d9b580';
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
    const saved = saveLibraryItem({
      name: sceneName,
      ra: target.ra,
      dec: target.dec,
      fovArcmin: target.fovArcmin,
      mode: viewMode,
      stretch,
      colormap,
      activeWavelength, gain, epoch: safeEpochIdx, curtain: curtainPos, fps,
      observation: observationSnapshot(liveFrames, safeEpochIdx, viewMode)
    });
    if (!saved) { alert('Could not save. Check browser storage.'); return; }
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const isSideBySide = viewMode === 'side-by-side';

  return (
    <div
      ref={containerRef}
      className="scene-page scene-studio"
      style={{
        minHeight: '100vh',
        background: '#060b14',
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
          borderBottom: '1px solid #1c2b3d',
          marginBottom: 16
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={() => navigate(`/explorer?ra=${target.ra}&dec=${target.dec}&fov=${target.fovArcmin}&name=${encodeURIComponent(target.name)}`)}
            className="btn btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              fontSize: 13
            }}
          >
            <ArrowLeft size={14} /> Explore
          </button>

          <div><div className="eyebrow scene-studio-label">SCENE STUDIO</div>
            {isRenaming ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="text"
                  value={sceneName}
                  onChange={(e) => setSceneName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && setIsRenaming(false)}
                  style={{
                    background: '#0c1421',
                    border: '1px solid #d9b580',
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
                <Edit2 size={13} style={{ color: 'var(--text-muted, #9aaabd)' }} />
              </div>
            )}
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: '#8bb8d4', marginTop: 2 }}>
              RA {target.ra.toFixed(4)}° · Dec {target.dec.toFixed(4)}° · FoV {target.fovArcmin}′ · Mode: {viewMode.toUpperCase()}
              {liveFrames.length > 0 ? (
                <span style={{ color: '#8cbaa8', marginLeft: 8 }}>
                  {liveFrames.length} frames loaded
                </span>
              ) : (
                <span style={{ color: '#9aaabd', marginLeft: 8 }}>Loading images</span>
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
            <span>{isFullscreenActive ? 'Exit Fullscreen' : 'Fullscreen'}</span>
          </button>

          <Link
            to="/library"
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 13 }}
          >
            <Bookmark size={14} /> Journal
          </Link>
        </div>
      </header>

      <details className="scene-source-drawer"><summary>About this scene</summary><DataNotice frames={liveFrames} activeIndex={safeEpochIdx} mode={viewMode} target={target} colormap={colormap} stretch={stretch} status={imageStatus} error={imageError} onRetry={retry} /><WhatAmISeeing frames={displayedFrames(liveFrames, safeEpochIdx, viewMode, viewMode === 'diff')} difference={viewMode === 'diff'} /></details>
      {/* Mode / Tabs Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 12,
          background: '#0c1421',
          padding: '8px 12px',
          borderRadius: 6,
          border: '1px solid #25364a'
        }}
      >
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {[
            { id: 'blink', label: 'Blink' },
            { id: 'swipe', label: 'Swipe' },
            { id: 'side-by-side', label: 'Compare' },
            { id: 'static', label: 'Still' },
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
                  background: isActive ? '#d9b580' : 'transparent',
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
            <span style={{ color: 'var(--text-muted, #9aaabd)' }}>Stretch:</span>
            <select
              value={stretch}
              onChange={(e) => setStretch(e.target.value)}
              style={{
                background: '#0d1117',
                border: '1px solid #25364a',
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
            <span style={{ color: 'var(--text-muted, #9aaabd)' }}>Colormap:</span>
            <select
              value={colormap}
              onChange={(e) => setColormap(e.target.value)}
              style={{
                background: '#0d1117',
                border: '1px solid #25364a',
                color: '#fff',
                padding: '3px 8px',
                borderRadius: 4
              }}
            >
              <option value="grayscale">Monochrome</option>
                <option value="inferno">Inferno</option>
              <option value="viridis">Viridis</option>
              <option value="grayscale_r">Inverted B&W</option>
            </select>
          </label>
        </div>
      </div>

      {/* Main Full-Screen Viewport */}
      <div className="scene-stage"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#05070a',
          borderRadius: 8,
          border: '1px solid #25364a',
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
              <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: '#d9b580', marginBottom: 6 }}>
                Epoch A: {observationDate(activeMetaA.epoch)}
              </div>
              <canvas
                ref={canvasRef}
                style={{
                  width: '100%', height: 'auto', objectFit: 'contain',
                  maxWidth: '100%',
                  maxHeight: isFullscreenActive ? '78vh' : '65vh',
                  aspectRatio: '1 / 1',
                  borderRadius: 4,
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)'
                }}
              />
            </div>
            <div style={{ textAlign: 'center', position: 'relative' }}>
              <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: '#8cbaa8', marginBottom: 6 }}>
                Epoch B: {observationDate(activeMetaB.epoch)}
              </div>
              <canvas
                ref={canvasSecondaryRef}
                style={{
                  width: '100%', height: 'auto', objectFit: 'contain',
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
              width: '100%', height: 'auto', objectFit: 'contain',
              maxWidth: '100%',
              maxHeight: isFullscreenActive ? '80vh' : (isFullscreenMode ? '75vh' : '68vh'),
              aspectRatio: '1 / 1',
              borderRadius: 4,
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)'
            }}
          />
        )}

        {/* HUD Overlay */}
        <div className="scene-hud"
          style={{
            position: 'absolute',
            bottom: 24,
            left: 24,
            background: 'rgba(11, 13, 16, 0.88)',
            border: '1px solid #25364a',
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
            Frame:{' '}
            <strong style={{ color: '#d9b580' }}>
              {observationDate(activeMeta.epoch)}
            </strong>{' '}
            ({safeEpochIdx + 1}/{frameCount})
          </span>
          <span>Target: {target.name} ({target.ra.toFixed(4)}°, {target.dec.toFixed(4)}°)</span>
          <span style={{ color: '#8bb8d4' }}>Mode: {viewMode.toUpperCase()}</span>
          {liveFrames.length > 0 ? (
            <span style={{ color: '#8cbaa8' }}>{liveFrames.every(frame=>frame.meta?.dataKind==='observed') ? 'Observed imagery' : 'Simulation / mixed sources'}</span>
          ) : (
            <span style={{ color: '#9aaabd' }}>Preview · images loading</span>
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
            background: '#0c1421',
            borderRadius: 6,
            border: '1px solid #25364a'
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
                    border: isCurrent ? '1px solid #d9b580' : '1px solid #25364a',
                    background: isCurrent ? 'rgba(217, 181, 128, 0.2)' : '#0d1117',
                    color: isCurrent ? '#d9b580' : '#c9d1d9',
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

          <span className="mono" style={{ fontSize: 11, color: '#9aaabd', whiteSpace: 'nowrap' }}>
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
          background: '#0c1421',
          border: '1px solid #25364a',
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
              <span style={{ color: 'var(--text-muted, #9aaabd)' }}>Speed:</span>
              <input
                type="range"
                min="1"
                max="12"
                value={fps}
                aria-label="Scene blink speed" onChange={(e) => setFps(Number(e.target.value))}
                style={{ width: 80 }}
              />
              <span style={{ color: '#d9b580' }}>{fps} Hz</span>
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
              <span style={{ color: 'var(--text-muted, #9aaabd)' }}>Curtain Divider:</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={curtainPos}
                aria-label="Scene comparison divider" onChange={(e) => setCurtainPos(Number(e.target.value))}
                style={{ width: 120 }}
              />
              <span style={{ color: '#d9b580' }}>{Math.round(curtainPos * 100)}%</span>
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
              borderColor: isRecording ? '#d9b580' : undefined
            }}
          >
            <Video size={14} style={{ color: isRecording ? '#d9b580' : 'inherit' }} />
            {isRecording ? `Recording (${recordProgress}/5s)...` : 'Clip 5s Video'}
          </button>
        </div>
      </div>

      <form ref={editorRef} className="scene-save-bar" onSubmit={event=>{event.preventDefault();handleSaveToLibrary();}}><label htmlFor="scene-save-name">Scene name<input id="scene-save-name" maxLength={200} required value={sceneName} onChange={event=>setSceneName(event.target.value)} /></label><button className="btn-primary" type="submit">{savedSuccess ? <Check size={14} /> : <Bookmark size={14} />}{savedSuccess ? 'Saved' : 'Save scene'}</button><span className="quiet-note">Saved in this browser</span><span className="scene-save-status" role="status">{savedSuccess ? 'Scene and viewing settings saved.' : ''}</span></form>
    </div>
  );
}
