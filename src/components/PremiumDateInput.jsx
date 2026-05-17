import React, { useRef } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';

export default function PremiumDateInput({ 
  value, 
  onChange, 
  max, 
  min, 
  placeholder = "Select Date",
  style = {}
}) {
  const inputRef = useRef(null);

  // Format date for display
  let displayValue = '';
  if (value) {
    try {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        displayValue = d.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
      }
    } catch (e) {
      displayValue = value;
    }
  }

  return (
    <div 
      className="premium-date-wrapper"
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        background: 'var(--black2)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '8px',
        padding: '10px 14px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        width: '100%',
        ...style
      }}
      onClick={() => inputRef.current?.showPicker ? inputRef.current.showPicker() : inputRef.current?.focus()}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border-subtle)';
        e.currentTarget.style.background = 'var(--black2)';
      }}
    >
      <CalendarIcon size={16} color={value ? "var(--text)" : "var(--text-muted)"} style={{ marginRight: 10, flexShrink: 0 }} />
      <span style={{ 
        flex: 1, 
        color: value ? 'var(--text)' : 'var(--text-muted)', 
        fontSize: '0.9rem',
        fontWeight: value ? 600 : 400,
        fontFamily: "'DM Sans', sans-serif"
      }}>
        {displayValue || placeholder}
      </span>
      
      {/* Hidden native input */}
      <input 
        ref={inputRef}
        type="date"
        value={value}
        onChange={onChange}
        max={max}
        min={min}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          cursor: 'pointer',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}
