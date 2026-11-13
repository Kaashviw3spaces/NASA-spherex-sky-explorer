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
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [statusMsg, setStatusMsg] = useState(null);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const loadItems = () => {
    setItems(getLibraryItems());
  };

  useEffect(() => {
    loadItems();
  }, []);

  const handleDelete = (id, name) => {
    if (window.confirm(`Delete "${name}" from your personal library?`)) {
      deleteLibraryItem(id);
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
    updateLibraryItem(id, { name: editName.trim() });
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
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 16,
          marginBottom: 32,
          borderBottom: '1px solid var(--border, #21262d)',
          paddingBottom: 24
        }}
      >
        <div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 10px',
              borderRadius: 20,
              background: 'rgba(232, 141, 58, 0.1)',
              color: '#e88d3a',
              fontSize: 12,
              fontFamily: 'IBM Plex Mono, monospace',
              marginBottom: 12
            }}
          >
            <Bookmark size={14} /> Personal Stored Coordinates
          </div>
          <h1
            style={{
              fontSize: '2rem',
              fontWeight: 600,
              margin: '0 0 8px 0',
              fontFamily: 'Instrument Serif, serif',
              letterSpacing: '-0.02em'
            }}
          >
            Personal Sky Library
          </h1>
          <p style={{ margin: 0, color: 'var(--text-muted, #8b949e)', fontSize: 14 }}>
            Saved sky coordinates, target moments, and custom observation scenes stored locally in your browser.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={exportLibraryItems}
            disabled={items.length === 0}
            className="btn btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              fontSize: 13,
              cursor: items.length === 0 ? 'not-allowed' : 'pointer'
            }}
          >
            <Download size={14} /> Export JSON
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13 }}
          >
            <Upload size={14} /> Import JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
        </div>
      </header>

      {statusMsg && (
        <div
          style={{
            background: 'rgba(78, 168, 222, 0.15)',
            border: '1px solid #4ea8de',
            color: '#4ea8de',
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
            background: 'var(--card-bg, #161b22)',
            borderRadius: 8,
            border: '1px dashed var(--border, #30363d)'
          }}
        >
          <Sparkles size={40} style={{ color: '#e88d3a', marginBottom: 16 }} />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 500, margin: '0 0 8px 0' }}>Your library is currently empty</h2>
          <p style={{ color: 'var(--text-muted, #8b949e)', maxWidth: 440, margin: '0 auto 24px auto', fontSize: 14 }}>
            Explore any celestial coordinate in the Sky Explorer and click{' '}
            <strong>Edit / Save the Scene</strong> to bookmark coordinates, video clips, and instant snapshots.
          </p>
          <Link
            to="/explorer"
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px' }}
          >
            Launch Sky Explorer
          </Link>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: 20
          }}
        >
          {items.map((item) => {
            const isEditing = editingId === item.id;
            return (
              <div
                key={item.id}
                style={{
                  background: 'var(--card-bg, #161b22)',
                  border: '1px solid var(--border, #30363d)',
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
                            border: '1px solid #e88d3a',
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
                        color: 'var(--text-muted, #8b949e)',
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
                      color: '#4ea8de',
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
                      color: 'var(--text-muted, #8b949e)'
                    }}
                  >
                    <span style={{ background: '#21262d', padding: '2px 6px', borderRadius: 4 }}>
                      FoV: {item.fovArcmin}°
                    </span>
                    <span style={{ background: '#21262d', padding: '2px 6px', borderRadius: 4 }}>
                      Mode: {item.mode}
                    </span>
                    <span style={{ background: '#21262d', padding: '2px 6px', borderRadius: 4 }}>
                      λ: {item.activeWavelength} µm
                    </span>
                    <span style={{ background: '#21262d', padding: '2px 6px', borderRadius: 4 }}>
                      Stretch: {item.stretch}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: 14,
                    borderTop: '1px solid var(--border, #21262d)',
                    gap: 10
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--text-muted, #8b949e)',
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
                          `/scene?ra=${item.ra}&dec=${item.dec}&fov=${item.fovArcmin}&mode=${item.mode}&stretch=${item.stretch}&colormap=${item.colormap}&wavelength=${item.activeWavelength}&title=${encodeURIComponent(
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
    </div>
  );
}
