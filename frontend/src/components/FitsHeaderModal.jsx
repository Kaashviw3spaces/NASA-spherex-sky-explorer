import { X } from 'lucide-react';

export default function FitsHeaderModal({ meta, target, onClose }) {
  if (!meta) return null;

  const cards = [
    ['SIMPLE', 'T', 'Standard FITS format'],
    ['BITPIX', String(meta.bitpix || -32), 'Bits per pixel'],
    ['NAXIS', '2', '2D WCS tangent-plane cutout'],
    ['NAXIS1', String(meta.width || 512), 'Pixels along RA axis'],
    ['NAXIS2', String(meta.height || 512), 'Pixels along Dec axis'],
    ['CTYPE1', "'RA---TAN'", 'Gnomonic projection'],
    ['CTYPE2', "'DEC--TAN'", 'Gnomonic projection'],
    ['CRVAL1', String(target.ra.toFixed(6)), 'Reference RA (deg)'],
    ['CRVAL2', String(target.dec.toFixed(6)), 'Reference Dec (deg)'],
    ['CRPIX', meta.crpix || '256.5,256.5', 'Reference pixel'],
    ['CDELT', meta.cdelt || '-0.0017222,0.0017222', 'Pixel scale (deg/px)'],
    ['BSCALE', String(meta.bscale || 1.0), 'Linear quantization scale'],
    ['BZERO', String(meta.bzero || 0.0), 'Linear quantization offset'],
    ['BUNIT', `'${meta.bunit || 'MJy/sr'}'`, 'Physical flux units'],
    ['EPOCH', `'${meta.epoch || target.epochs[0]}'`, 'Observation timestamp'],
    ['SURVEY', `'${meta.provenance || target.survey}'`, 'Data provenance']
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="FITS Header Inspector"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(6, 7, 9, 0.78)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 20
      }}
      onClick={onClose}
    >
      <div
        className="panel-box"
        style={{ width: 'min(620px, 100%)', maxHeight: '80vh', overflow: 'auto', background: '#12151a' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-header">
          <span className="panel-title">FITS Header Inspector · {target.name}</span>
          <button type="button" className="btn-compact" onClick={onClose} aria-label="Close modal">
            <X size={13} /> Close
          </button>
        </div>

        <div className="mono" style={{ fontSize: 12, display: 'grid', gap: 4 }}>
          {cards.map(([k, v, c]) => (
            <div
              key={k}
              style={{
                display: 'grid',
                gridTemplateColumns: '95px 1fr 1.1fr',
                gap: 8,
                padding: '4px 0',
                borderBottom: '1px solid #1d222b'
              }}
            >
              <span style={{ color: '#e88d3a' }}>{k}</span>
              <span style={{ color: '#eceae4' }}>{v}</span>
              <span style={{ color: '#656d7a' }}>/ {c}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
