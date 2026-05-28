import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const navBtn = {
  background: 'var(--black2)', border: '1px solid var(--border-subtle)',
  borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center',
  justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)',
  flexShrink: 0, transition: 'all 0.15s',
};

const footBtn = {
  background: 'none', border: 'none', cursor: 'pointer',
  fontSize: '0.82rem', fontFamily: "'DM Sans', sans-serif",
  fontWeight: 700, padding: '4px 10px', borderRadius: 6,
};

export default function DashCalendar({ value, onChange, placeholder = 'Filter by date', style, wrapperStyle }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const parseValue = (v) => {
    if (!v) return null;
    const d = new Date(v + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  };

  const selected = parseValue(value);

  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [openLeft, setOpenLeft] = useState(false);
  const [viewYear, setViewYear] = useState(selected?.getFullYear() ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected?.getMonth() ?? today.getMonth());
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (selected) {
      setViewYear(selected.getFullYear());
      setViewMonth(selected.getMonth());
    }
  }, [value]);

  const handleToggle = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setOpenUpward(window.innerHeight - rect.bottom < 320);
      setOpenLeft(rect.left + 282 > window.innerWidth);
    }
    setOpen(o => !o);
  };

  const handleSelect = (day) => {
    const d = new Date(viewYear, viewMonth, day);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    onChange(`${yyyy}-${mm}-${dd}`);
    setOpen(false);
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const rawOffset = new Date(viewYear, viewMonth, 1).getDay();
  const offset = rawOffset === 0 ? 6 : rawOffset - 1;
  const totalCells = Math.ceil((offset + daysInMonth) / 7) * 7;

  const displayValue = selected
    ? selected.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';

  const dropdownPos = {
    ...(openUpward ? { bottom: 'calc(100% + 8px)', top: 'auto' } : { top: 'calc(100% + 8px)', bottom: 'auto' }),
    ...(openLeft   ? { right: 0, left: 'auto' }                  : { left: 0, right: 'auto' }),
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: wrapperStyle?.width === '100%' ? 'block' : 'inline-block', ...wrapperStyle }}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        className="dash-calendar-trigger"
        style={{
          border: `1px solid ${value ? 'var(--red)' : 'var(--border-subtle)'}`,
          background: value ? 'rgba(192,32,31,0.04)' : 'var(--black2)',
          color: value ? 'var(--red)' : 'var(--text-muted)',
          fontWeight: value ? 700 : 400,
          width: wrapperStyle?.width === '100%' ? '100%' : undefined,
          justifyContent: wrapperStyle?.width === '100%' ? 'flex-start' : undefined,
          display: wrapperStyle?.width === '100%' ? 'flex' : undefined,
          padding: wrapperStyle?.width === '100%' ? '12px 16px' : undefined,
          fontSize: wrapperStyle?.width === '100%' ? '0.9rem' : undefined,
          gap: wrapperStyle?.width === '100%' ? '10px' : undefined,
          ...style,
        }}
      >
        <Calendar size={wrapperStyle?.width === '100%' ? 16 : 14} style={{ flexShrink: 0 }} />
        <span>{displayValue || placeholder}</span>
        {value && (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onChange(''); }}
            style={{
              marginLeft: wrapperStyle?.width === '100%' ? 'auto' : 4,
              display: 'flex',
              alignItems: 'center',
              color: 'var(--text-muted)',
              cursor: 'pointer'
            }}
          >
            <X size={13} />
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="dash-calendar-panel" style={dropdownPos}>
          {/* Month nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <button type="button" onClick={prevMonth} style={navBtn}>
              <ChevronLeft size={15} />
            </button>
            <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text)', fontFamily: "'Mona Sans', sans-serif" }}>
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button type="button" onClick={nextMonth} style={navBtn}>
              <ChevronRight size={15} />
            </button>
          </div>

          {/* Day header row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 6 }}>
            {DAYS.map(d => (
              <div key={d} style={{
                textAlign: 'center', fontSize: '0.65rem', fontWeight: 800,
                color: 'var(--text-muted)', padding: '4px 0',
                textTransform: 'uppercase', letterSpacing: 0.4,
              }}>
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {Array.from({ length: totalCells }, (_, i) => {
              const day = i - offset + 1;
              const inMonth = day >= 1 && day <= daysInMonth;
              const cellDate = inMonth ? new Date(viewYear, viewMonth, day) : null;
              const isToday = cellDate?.getTime() === today.getTime();
              const isSel = cellDate && selected && cellDate.getTime() === selected.getTime();

              return (
                <button
                  key={i}
                  type="button"
                  disabled={!inMonth}
                  onClick={() => inMonth && handleSelect(day)}
                  style={{
                    width: '100%', aspectRatio: '1', border: 'none', borderRadius: 7,
                    fontSize: '0.8rem',
                    fontWeight: isSel || isToday ? 800 : 500,
                    cursor: inMonth ? 'pointer' : 'default',
                    color: isSel ? '#fff' : isToday ? 'var(--red)' : inMonth ? 'var(--text)' : 'transparent',
                    background: isSel ? 'var(--red)' : isToday ? 'rgba(192,32,31,0.06)' : 'transparent',
                    outline: isToday && !isSel ? '1px solid rgba(192,32,31,0.25)' : 'none',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (inMonth && !isSel) e.currentTarget.style.background = 'var(--black2)'; }}
                  onMouseLeave={e => {
                    if (inMonth && !isSel) e.currentTarget.style.background = isToday ? 'rgba(192,32,31,0.06)' : 'transparent';
                  }}
                >
                  {inMonth ? day : ''}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', marginTop: 14,
            paddingTop: 12, borderTop: '1px solid var(--border-subtle)',
          }}>
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              style={{ ...footBtn, color: 'var(--text-muted)' }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                const dd = String(today.getDate()).padStart(2, '0');
                onChange(`${today.getFullYear()}-${mm}-${dd}`);
                setOpen(false);
              }}
              style={{ ...footBtn, color: 'var(--red)' }}
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
