import EditorialCover from '../components/learning/EditorialCover';
import JournalLearning from '../components/learning/JournalLearning';
import SceneNotes from '../components/learning/SceneNotes';
import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bookmark,
  ExternalLink,
  Maximize2,
  Trash2,
  Download,
  Upload,
  Calendar,
  Layers,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import {
  getLibraryItems,
  deleteLibraryItem,
  updateLibraryItem,
  exportLibraryItems,
  importLibraryItems
} from '../utils/libraryStorage';

export default function LibraryPage() {
  const [items, setItems] = useState([]);
  const [section, setSection] = useState('notes');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [statusMsg, setStatusMsg] = useState(null);
  const [libraryError, setLibraryError] = useState('');
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const loadItems = () => {
    try { setItems(getLibraryItems(true)); setLibraryError(''); } catch (error) { setLibraryError(error.message); }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const handleDelete = (id, name) => {
    if (window.confirm(`Delete "${name}" from your personal library?`)) {
      if (!deleteLibraryItem(id)) { setLibraryError('Could not delete this sky. Check browser storage.'); return; }
      loadItems();
      showStatus('Scene deleted.');
    }
  };

  const handleStartEdit = (item) => {
    setEditingId(item.id);
    setEditName(item.name);
  };

  const handleSaveEdit = (id) => {
    if (!editName.trim()) return;
    if (!updateLibraryItem(id, { name: editName.trim() })) { setLibraryError('Could not rename this sky. Check browser storage.'); return; }
    setEditingId(null);
    loadItems();
    showStatus('Scene renamed.');
  };

  const showStatus = (msg) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const count = importLibraryItems(event.target.result);
        loadItems();
        showStatus(`Successfully imported library (${count} total items).`);
      } catch (err) {
        alert('Invalid library JSON file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="library-page" style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
      <EditorialCover image="rho" eyebrow="YOUR PERSONAL OBSERVING NOTEBOOK" title="My cosmic journal">Keep the questions. Collect the moments.</EditorialCover>
      <div className="journal-tabs" role="group" aria-label="Journal sections">{[['notes', 'Field notes'], ['missions', 'Mission log'], ['skies', `Saved skies · ${items.length}`]].map(([id, label]) => <button key={id} aria-pressed={section === id} onClick={() => setSection(id)}>{label}</button>)}</div>
      {libraryError && <p className="inline-error" role="alert">{libraryError}</p>}
      {section !== 'skies' && <JournalLearning view={section} />}
      {section === 'skies' && <>
      <div className="saved-sky-tools btn-row"><button className="btn-compact" disabled={!items.length} onClick={() => { try { exportLibraryItems(); } catch (error) { setLibraryError(error.message); } }}>Export saved skies</button><button className="btn-compact" onClick={() => fileInputRef.current?.click()}>Import saved skies</button><input ref={fileInputRef} type="file" accept="application/json" hidden onChange={handleImportFile} /></div>
      <h2 className="saved-skies-heading">Saved skies</h2>
      {statusMsg && (
        <div
          style={{
            background: 'rgba(78, 168, 222, 0.15)',
            border: '1px solid #8bb8d4',
            color: '#8bb8d4',
            padding: '10px 16px',
            borderRadius: 6,
            marginBottom: 20,
            fontSize: 13,
            fontFamily: 'IBM Plex Mono, monospace'
          }}
        >
          {statusMsg}
        </div>
      )}

      {items.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '64px 20px',
            background: 'var(--card-bg, #0c1421)',
            borderRadius: 8,
            border: '1px dashed var(--border, #25364a)'
          }}
        >
          <Sparkles size={40} style={{ color: '#d9b580', marginBottom: 16 }} />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 500, margin: '0 0 8px 0' }}>Every discovery starts somewhere.</h2>
          <p style={{ color: 'var(--text-muted, #9aaabd)', maxWidth: 440, margin: '0 auto 24px auto', fontSize: 14 }}>
            Explore any celestial coordinate in the Sky Explorer and click{' '}
            <strong>Edit / Save the Scene</strong> to save your coordinates and viewing settings. Video clips download separately.
          </p>
          <Link
            to="/explorer"
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px' }}
          >
            Start exploring
          </Link>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))',
            gap: 20
          }}
        >
          {items.map((item) => {
            const isEditing = editingId === item.id;
            return (
              <div
                key={item.id}
                style={{
                  background: 'var(--card-bg, #0c1421)',
                  border: '1px solid var(--border, #25364a)',
                  borderRadius: 8,
                  padding: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 16
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 12,
                      marginBottom: 10
                    }}
                  >
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(item.id)}
                          style={{
                            background: '#0d1117',
                            border: '1px solid #d9b580',
                            color: '#fff',
                            padding: '4px 8px',
                            borderRadius: 4,
                            fontSize: 14,
                            flex: 1
                          }}
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveEdit(item.id)}
                          className="btn btn-primary"
                          style={{ padding: '4px 10px', fontSize: 12 }}
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <h3
                        onClick={() => handleStartEdit(item)}
                        title="Click to rename"
                        style={{
                          margin: 0,
                          fontSize: '1.1rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          color: '#f0f6fc'
                        }}
                      >
                        {item.name}
                      </h3>
                    )}
                    <button
                      onClick={() => handleDelete(item.id, item.name)}
                      title="Delete scene"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted, #9aaabd)',
                        cursor: 'pointer',
                        padding: 4
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div
                    style={{
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: 12,
                      color: '#8bb8d4',
                      marginBottom: 12
                    }}
                  >
                    RA {item.ra.toFixed(4)}° · Dec {item.dec.toFixed(4)}°
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 8,
                      fontSize: 11,
                      fontFamily: 'IBM Plex Mono, monospace',
                      color: 'var(--text-muted, #9aaabd)'
                    }}
                  >
                    <span style={{ background: '#1c2b3d', padding: '2px 6px', borderRadius: 4 }}>
                      FoV: {item.fovArcmin} arcmin
                    </span>
                    <span style={{ background: '#1c2b3d', padding: '2px 6px', borderRadius: 4 }}>
                      Mode: {item.mode}
                    </span>
                    <span style={{ background: '#1c2b3d', padding: '2px 6px', borderRadius: 4 }}>
                      λ: {item.activeWavelength} µm
                    </span>
                    <span style={{ background: '#1c2b3d', padding: '2px 6px', borderRadius: 4 }}>
                      Stretch: {item.stretch}
                    </span>
                  </div>
                </div>

                <SceneNotes item={item} onSaved={loadItems} />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: 14,
                    borderTop: '1px solid var(--border, #1c2b3d)',
                    gap: 10
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--text-muted, #9aaabd)',
                      fontFamily: 'IBM Plex Mono, monospace'
                    }}
                  >
                    {new Date(item.savedAt).toLocaleDateString()}
                  </span>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() =>
                        navigate(
                          `/explorer?ra=${item.ra}&dec=${item.dec}&fov=${item.fovArcmin}&mode=${item.mode}&stretch=${item.stretch}`
                        )
                      }
                      className="btn btn-secondary"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 12px',
                        fontSize: 12
                      }}
                    >
                      <ExternalLink size={13} /> Explorer
                    </button>

                    <button
                      onClick={() =>
                        navigate(
                          `/scene?ra=${item.ra}&dec=${item.dec}&fov=${item.fovArcmin}&mode=${item.mode}&stretch=${item.stretch}&colormap=${item.colormap}&wavelength=${item.activeWavelength}&gain=${item.gain}&epoch=${item.epoch}&curtain=${item.curtain}&fps=${item.fps}&title=${encodeURIComponent(
                            item.name
                          )}`
                        )
                      }
                      className="btn btn-primary"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 12px',
                        fontSize: 12
                      }}
                    >
                      <Maximize2 size={13} /> Full Screen
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>}
    </div>
  );
}
