import { CheckCircle2, X } from 'lucide-react';

export default function SuccessModal({ 
  isOpen, 
  onClose, 
  title = "Success!", 
  message = "Action completed successfully.", 
  actionText = "Continue",
  onAction = null
}) {
  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div 
        className="custom-modal-content"
        style={{ 
          background: 'var(--black)', 
          borderRadius: 20, 
          padding: '40px 30px', 
          width: '100%', 
          maxWidth: 420, 
          border: '1px solid rgba(34, 197, 94, 0.2)', 
          boxShadow: '0 20px 60px rgba(0,0,0,0.5), inset 0 0 80px rgba(34, 197, 94, 0.05)',
          position: 'relative',
          textAlign: 'center'
        }}
      >
        <button 
          onClick={onClose} 
          style={{ position: 'absolute', top: 20, right: 20, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          <X size={20} />
        </button>

        <div style={{ 
          background: 'rgba(34, 197, 94, 0.1)', 
          color: '#22c55e', 
          width: 72,
          height: 72,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px',
          animation: 'popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
        }}>
          <CheckCircle2 size={36} />
        </div>

        <h3 style={{ margin: '0 0 12px 0', fontSize: '1.4rem', fontWeight: 900 }}>{title}</h3>
        <div style={{ margin: '0 0 32px 0', fontSize: '0.95rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          {message}
        </div>

        <button 
          onClick={onAction || onClose}
          style={{ 
            width: '100%',
            padding: '14px', 
            borderRadius: 10, 
            border: 'none', 
            background: '#22c55e', 
            color: '#fff', 
            fontWeight: 800, 
            fontSize: '1rem',
            cursor: 'pointer', 
            fontFamily: "'DM Sans',sans-serif",
            transition: 'transform 0.1s, opacity 0.2s'
          }}
          onMouseOver={(e) => e.target.style.opacity = 0.9}
          onMouseOut={(e) => e.target.style.opacity = 1}
          onMouseDown={(e) => e.target.style.transform = 'scale(0.98)'}
          onMouseUp={(e) => e.target.style.transform = 'scale(1)'}
        >
          {actionText}
        </button>

        <style>{`
          @keyframes popIn {
            0% { transform: scale(0.5); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
          }
          .custom-modal-content {
            animation: modalFadeIn 0.2s ease-out;
          }
          @keyframes modalFadeIn {
            0% { transform: translateY(10px); opacity: 0; }
            100% { transform: translateY(0); opacity: 1; }
          }
        `}</style>
      </div>
    </div>
  );
}
