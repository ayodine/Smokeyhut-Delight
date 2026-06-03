import { Loader2, AlertTriangle, Info, X } from 'lucide-react';

export default function ConfirmModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title = "Are you sure?", 
  message = "This action cannot be undone.", 
  confirmText = "Confirm", 
  cancelText = "Cancel", 
  isDestructive = true,
  isLoading = false
}) {
  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div 
        className="custom-modal-content"
        style={{ 
          background: 'var(--black)', 
          borderRadius: 16, 
          padding: 28, 
          width: '100%', 
          maxWidth: 400, 
          border: '1px solid var(--border-subtle)', 
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          position: 'relative'
        }}
      >
        <button 
          onClick={onClose} 
          disabled={isLoading}
          style={{ position: 'absolute', top: 20, right: 20, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          <X size={20} />
        </button>

        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ 
            background: isDestructive ? 'rgba(220, 38, 38, 0.1)' : 'rgba(192, 32, 31, 0.1)', 
            color: isDestructive ? '#ef4444' : 'var(--red)', 
            padding: 12, 
            borderRadius: '50%',
            flexShrink: 0
          }}>
            {isDestructive ? <AlertTriangle size={24} /> : <Info size={24} />}
          </div>
          <div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.15rem', fontWeight: 800 }}>{title}</h3>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {message}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 28, justifyContent: 'flex-end' }}>
          <button 
            onClick={onClose}
            disabled={isLoading}
            onMouseEnter={e => { if (!isLoading) { e.currentTarget.style.background = 'var(--black2)'; e.currentTarget.style.borderColor = '#d1d5db'; } }}
            onMouseLeave={e => { if (!isLoading) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--border-subtle)'; } }}
            style={{ 
              padding: '10px 20px', 
              borderRadius: 8, 
              border: '1px solid var(--border-subtle)', 
              background: 'transparent', 
              color: 'var(--text)', 
              fontWeight: 700, 
              cursor: 'pointer', 
              fontFamily: "'DM Sans',sans-serif",
              transition: 'all 0.2s ease'
            }}
          >
            {cancelText}
          </button>
          <button 
            onClick={onConfirm}
            disabled={isLoading}
            onMouseEnter={e => { if (!isLoading) e.currentTarget.style.background = 'var(--red-light)'; }}
            onMouseLeave={e => { if (!isLoading) e.currentTarget.style.background = 'var(--red)'; }}
            style={{ 
              padding: '10px 20px', 
              borderRadius: 8, 
              border: 'none', 
              background: 'var(--red)', 
              color: '#fff', 
              fontWeight: 700, 
              cursor: isLoading ? 'not-allowed' : 'pointer', 
              fontFamily: "'DM Sans',sans-serif",
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'background 0.2s ease'
            }}
          >
            {isLoading && <Loader2 size={16} className="spin" />}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
