import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';

interface PortalModalProps {
  title: string;
  size?: 'sm' | 'lg';
  onClose: () => void;
  actions: React.ReactNode;
  children: React.ReactNode;
}

const PortalModal: React.FC<PortalModalProps> = ({ title, size = 'lg', onClose, actions, children }) => {
  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const maxW = size === 'sm' ? 500 : 920;

  return ReactDOM.createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0,
          backgroundColor: 'rgba(3,3,3,0.62)',
        }}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'relative',
          width: `min(${maxW}px, 96vw)`,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#fff',
          borderRadius: 6,
          boxShadow: '0 8px 32px rgba(0,0,0,0.38)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 24px',
          borderBottom: '1px solid #d2d2d2',
          flexShrink: 0,
          background: '#f5f5f5',
        }}>
          <span style={{ fontSize: 17, fontWeight: 600, color: '#151515' }}>{title}</span>
          <button
            aria-label="Close"
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 22, lineHeight: 1, color: '#151515', padding: '2px 6px',
              borderRadius: 3,
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {children}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', gap: 8, padding: '14px 24px',
          borderTop: '1px solid #d2d2d2', flexShrink: 0,
          background: '#fafafa',
        }}>
          {actions}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default PortalModal;
