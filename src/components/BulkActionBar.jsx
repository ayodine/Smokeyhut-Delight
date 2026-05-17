import React from 'react';
import { Trash2, X, RotateCcw } from 'lucide-react';

export default function BulkActionBar({ 
  selectedCount, 
  onDeselectAll, 
  actions, 
  isTrashView = false 
}) {
  if (selectedCount === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '32px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(10, 10, 10, 0.85)',
      backdropFilter: 'blur(32px) saturate(180%)',
      WebkitBackdropFilter: 'blur(32px) saturate(180%)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '100px',
      padding: '8px 12px 8px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      boxShadow: '0 20px 40px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05) inset',
      zIndex: 1000,
      animation: 'slideUpBar 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      flexWrap: 'wrap',
      justifyContent: 'center',
    }}>
      <style>{`
        @keyframes slideUpBar {
          from { opacity: 0; transform: translate(-50%, 20px) scale(0.95); }
          to { opacity: 1; transform: translate(-50%, 0) scale(1); }
        }
      `}</style>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          background: isTrashView ? 'rgba(255, 255, 255, 0.2)' : 'var(--red)',
          color: '#fff',
          fontSize: '0.75rem',
          fontWeight: 800,
          padding: '2px 8px',
          borderRadius: '20px',
          minWidth: '22px',
          textAlign: 'center',
        }}>{selectedCount}</span>
        <span style={{ fontWeight: 600, fontSize: '0.82rem', color: '#ffffff' }}>
          Selected {isTrashView ? '(Trash)' : ''}
        </span>
      </div>
      
      <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }}></div>
      
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {actions.map((action, idx) => {
          if (action.type === 'delete') {
            return (
              <button
                key={idx}
                onClick={action.onClick}
                title={action.label || 'Delete'}
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  color: '#f87171',
                  border: 'none',
                  borderRadius: '100px',
                  padding: '6px 14px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.2s ease',
                  fontFamily: "'DM Sans', sans-serif",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)'; e.currentTarget.style.color = '#fca5a5'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'; e.currentTarget.style.color = '#f87171'; }}
              >
                <Trash2 size={13} /> {action.label || 'Delete'}
              </button>
            );
          }
          if (action.type === 'recover') {
            return (
              <button
                key={idx}
                onClick={action.onClick}
                title={action.label || 'Recover'}
                style={{
                  background: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid transparent',
                  color: '#4ade80',
                  borderRadius: '100px',
                  padding: '6px 14px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.2s ease',
                  fontFamily: "'DM Sans', sans-serif",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(34, 197, 94, 0.2)'; e.currentTarget.style.color = '#86efac'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(34, 197, 94, 0.1)'; e.currentTarget.style.color = '#4ade80'; }}
              >
                <RotateCcw size={13} /> {action.label || 'Recover'}
              </button>
            );
          }
          if (action.type === 'status') {
            return (
              <button
                key={idx}
                onClick={action.onClick}
                title={action.label}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid transparent',
                  color: 'rgba(255,255,255,0.8)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  padding: '6px 14px',
                  borderRadius: '100px',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  transition: 'all 0.2s ease',
                  fontFamily: "'DM Sans', sans-serif",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; }}
              >
                {action.label}
              </button>
            );
          }
          return null;
        })}
      </div>
      
      <button
        onClick={onDeselectAll}
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: 'none',
          borderRadius: '50%',
          width: '28px',
          height: '28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255, 255, 255, 0.6)',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          marginLeft: -4
        }}
        title="Deselect All"
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = '#ffffff'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)'; }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
