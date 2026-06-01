import { useState, useRef, useEffect, useMemo } from 'react';
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

export default function DashCalendar({ value, onChange, placeholder = 'Filter by date', range = false, style, wrapperStyle }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const parseSingle = (v) => {
    if (!v || typeof v !== 'string') return null;
    const d = new Date(v + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  };

  const selectedStart = range ? (value?.start ? parseSingle(value.start) : null) : parseSingle(value);
  const selectedEnd = range ? (value?.end ? parseSingle(value.end) : null) : null;

  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [openLeft, setOpenLeft] = useState(false);
  const [viewYear, setViewYear] = useState(selectedStart?.getFullYear() ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedStart?.getMonth() ?? today.getMonth());
  const [hoveredDate, setHoveredDate] = useState(null); // Date object for live range hover preview
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
    const sel = selectedStart;
    if (sel) {
      setViewYear(sel.getFullYear());
      setViewMonth(sel.getMonth());
    }
  }, [value]);

  const handleToggle = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setOpenUpward(window.innerHeight - rect.bottom < 320);
      setOpenLeft(rect.left + 282 > window.innerWidth);
      setHoveredDate(null);
    }
    setOpen(o => !o);
  };

  const handleSelect = (day) => {
    const d = new Date(viewYear, viewMonth, day);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    if (range) {
      if (!value?.start || (value?.start && value?.end)) {
        onChange({ start: dateStr, end: null });
        setHoveredDate(null);
      } else {
        const startD = parseSingle(value.start);
        if (startD && d < startD) {
          onChange({ start: dateStr, end: null });
          setHoveredDate(null);
        } else {
          onChange({ start: value.start, end: dateStr });
          setHoveredDate(null);
          setOpen(false);
        }
      }
    } else {
      onChange(dateStr);
      setOpen(false);
    }
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

  const displayValue = useMemo(() => {
    if (range) {
      if (!selectedStart) return '';
      const startStr = selectedStart.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
      if (!selectedEnd) return `${startStr} - …`;
      const endStr = selectedEnd.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
      return `${startStr} - ${endStr}`;
    }
    return selectedStart
      ? selectedStart.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : '';
  }, [range, selectedStart, selectedEnd]);

  const hasValue = range ? (value?.start || value?.end) : value;

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
          border: `1px solid ${hasValue ? 'var(--red)' : 'var(--border-subtle)'}`,
          background: hasValue ? 'rgba(192,32,31,0.04)' : 'var(--black2)',
          color: hasValue ? 'var(--red)' : 'var(--text-muted)',
          fontWeight: hasValue ? 700 : 400,
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
        {hasValue && (
          <span
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(range ? { start: null, end: null } : '');
              setHoveredDate(null);
            }}
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
        <div className="dash-calendar-panel" style={{...dropdownPos, zIndex: 10, background: 'var(--white, #fff)', padding: '16px', borderRadius: 12, border: '1px solid var(--border-subtle)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
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
          <div
            style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px 0' }}
            onMouseLeave={() => setHoveredDate(null)}
          >
            {Array.from({ length: totalCells }, (_, i) => {
              const day = i - offset + 1;
              const inMonth = day >= 1 && day <= daysInMonth;
              const cellDate = inMonth ? new Date(viewYear, viewMonth, day) : null;
              const isToday = cellDate?.getTime() === today.getTime();

              let isSelStart = false;
              let isSelEnd = false;
              let isSel = false;
              let isRangeMiddle = false;

              if (inMonth && cellDate) {
                const t = cellDate.getTime();
                if (range) {
                  const startT = selectedStart?.getTime();
                  const endT = selectedEnd?.getTime();

                  isSelStart = !!(startT && t === startT);
                  isSelEnd = !!(endT && t === endT);
                  isSel = isSelStart || isSelEnd;

                  if (startT && endT) {
                    isRangeMiddle = t > startT && t < endT;
                  } else if (startT && hoveredDate && !endT) {
                    const hoverT = hoveredDate.getTime();
                    if (hoverT >= startT) {
                      isRangeMiddle = t > startT && t < hoverT;
                      if (t === hoverT) {
                        isSelEnd = true;
                      }
                    }
                  }
                } else {
                  isSel = !!(selectedStart && t === selectedStart.getTime());
                }
              }

              // Continuous Capsule Radius Styling
              let cellBorderRadius = '7px';
              if (inMonth) {
                if (range) {
                  if (isSelStart) {
                    cellBorderRadius = (selectedEnd || (hoveredDate && hoveredDate.getTime() > (selectedStart?.getTime() ?? 0))) ? '50% 0 0 50%' : '50%';
                  } else if (isSelEnd) {
                    cellBorderRadius = '0 50% 50% 0';
                  } else if (isRangeMiddle) {
                    cellBorderRadius = '0';
                  } else {
                    cellBorderRadius = '7px';
                  }
                } else if (isSel) {
                  cellBorderRadius = '50%';
                }
              }

              const handleMouseEnter = () => {
                if (inMonth && range && value?.start && !value?.end && cellDate) {
                  setHoveredDate(cellDate);
                }
              };

              return (
                <button
                  key={i}
                  type="button"
                  disabled={!inMonth}
                  onMouseEnter={handleMouseEnter}
                  onClick={() => inMonth && handleSelect(day)}
                  style={{
                    width: '100%',
                    aspectRatio: '1',
                    border: 'none',
                    borderRadius: cellBorderRadius,
                    fontSize: '0.8rem',
                    fontWeight: isSel || isSelStart || isSelEnd || isToday || isRangeMiddle ? 800 : 500,
                    cursor: inMonth ? 'pointer' : 'default',
                    color: (isSel || isSelStart || isSelEnd) ? '#fff' : isToday ? 'var(--red)' : isRangeMiddle ? 'var(--red)' : inMonth ? 'var(--text)' : 'transparent',
                    background: (isSel || isSelStart || isSelEnd) ? 'var(--red)' : isRangeMiddle ? 'rgba(192,32,31,0.06)' : isToday ? 'rgba(192,32,31,0.06)' : 'transparent',
                    outline: isToday && !isSel && !isSelStart && !isSelEnd && !isRangeMiddle ? '1px solid rgba(192,32,31,0.25)' : 'none',
                    transition: 'background 0.1s, border-radius 0.1s',
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
              onClick={() => {
                onChange(range ? { start: null, end: null } : '');
                setHoveredDate(null);
                setOpen(false);
              }}
              style={{ ...footBtn, color: 'var(--text-muted)' }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                const dd = String(today.getDate()).padStart(2, '0');
                const dateStr = `${today.getFullYear()}-${mm}-${dd}`;
                onChange(range ? { start: dateStr, end: dateStr } : dateStr);
                setHoveredDate(null);
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
