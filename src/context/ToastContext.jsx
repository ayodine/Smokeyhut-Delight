import React, { createContext, useContext, useState } from 'react';
import { CheckCircle, XCircle, Info } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);

  const showToast = (title, subtitle = '', type = 'success') => {
    setToast({ title, subtitle, type });
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && <ToastUI {...toast} onClose={() => setToast(null)} />}
    </ToastContext.Provider>
  );
}

function ToastUI({ title, subtitle, type, onClose }) {
  const icons = { 
    success: <CheckCircle size={20} color="#22c55e" />, 
    error: <XCircle size={20} color="#ef4444" />, 
    info: <Info size={20} color="#F5C518" /> 
  };
  return (
    <div className={`toast toast-${type} show`} role="alert">
      <span className="toast-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icons[type] || <Info size={20} color="#F5C518" />}
      </span>
      <div>
        <div className="toast-text">{title}</div>
        {subtitle && <div className="toast-sub">{subtitle}</div>}
      </div>
      <button className="toast-close" onClick={onClose}>✕</button>
    </div>
  );
}

export const useToast = () => useContext(ToastContext);
