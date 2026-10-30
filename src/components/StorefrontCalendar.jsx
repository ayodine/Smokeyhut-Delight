import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function StorefrontCalendar({
  value,
  onChange,
  onClose,
  minDate,
  maxDate
}) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const minD = useMemo(() => {
    if (!minDate) return today;
    const d = new Date(`${minDate}T00:00:00`);
    return isNaN(d.getTime()) ? today : d;
  }, [minDate, today]);

  const maxD = useMemo(() => {
    if (!maxDate) {
      const d = new Date(today);
      d.setDate(d.getDate() + 90);
      return d;
    }
    const d = new Date(`${maxDate}T00:00:00`);
    return isNaN(d.getTime()) ? null : d;
  }, [maxDate, today]);

  const selectedD = useMemo(() => {
    if (!value) return null;
    const d = new Date(`${value}T00:00:00`);
    return isNaN(d.getTime()) ? null : d;
  }, [value]);

  const [viewYear, setViewYear] = useState(selectedD ? selectedD.getFullYear() : today.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedD ? selectedD.getMonth() : today.getMonth());

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const rawFirstDay = new Date(viewYear, viewMonth, 1).getDay();
  // Monday is 0, Sunday is 6
  const startOffset = rawFirstDay === 0 ? 6 : rawFirstDay - 1;
  const totalSlots = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  const canGoPrev = useMemo(() => {
    const firstOfCurrentView = new Date(viewYear, viewMonth, 1);
    const firstOfMin = new Date(minD.getFullYear(), minD.getMonth(), 1);
    return firstOfCurrentView > firstOfMin;
  }, [viewYear, viewMonth, minD]);

  const canGoNext = useMemo(() => {
    if (!maxD) return true;
    const lastOfCurrentView = new Date(viewYear, viewMonth, daysInMonth);
    return lastOfCurrentView < maxD;
  }, [viewYear, viewMonth, daysInMonth, maxD]);

  const handlePrev = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canGoPrev) return;
    if (viewMonth === 0) {
      setViewYear(y => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const handleNext = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canGoNext) return;
    if (viewMonth === 11) {
      setViewYear(y => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  const handleDaySelect = (dayNum) => {
    const d = new Date(viewYear, viewMonth, dayNum);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    onChange(`${yyyy}-${mm}-${dd}`);
  };

  const handleClear = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onChange('');
    if (onClose) onClose();
  };

  const handleToday = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    onChange(`${yyyy}-${mm}-${dd}`);
    setViewYear(yyyy);
    setViewMonth(today.getMonth());
    if (onClose) onClose();
  };

  return (
    <div
      style={{
        background: '#ffffff',
        borderRadius: 22,
        border: '1.5px solid #ebebeb',
        boxShadow: '0 18px 45px rgba(0, 0, 0, 0.1), 0 4px 12px rgba(0, 0, 0, 0.05)',
        padding: '24px 22px 20px',
        width: 320,
        maxWidth: '100%',
        boxSizing: 'border-box',
        fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
        userSelect: 'none'
      }}
    >
      {/* Month Navigation Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, padding: '0 2px' }}>
        <button
          type="button"
          onClick={handlePrev}
          disabled={!canGoPrev}
          style={{
            width: 40,
            height: 40,
            borderRadius: 14,
            border: 'none',
            background: '#f2f0eb',
            cursor: canGoPrev ? 'pointer' : 'not-allowed',
            color: canGoPrev ? '#2b2a27' : '#c4c2be',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease'
          }}
        >
          <ChevronLeft size={20} strokeWidth={2.4} />
        </button>

        <span style={{ fontWeight: 800, fontSize: '1.18rem', color: '#111', letterSpacing: '-0.02em' }}>
          {MONTHS[viewMonth]} {viewYear}
        </span>

        <button
          type="button"
          onClick={handleNext}
          disabled={!canGoNext}
          style={{
            width: 40,
            height: 40,
            borderRadius: 14,
            border: 'none',
            background: '#f2f0eb',
            cursor: canGoNext ? 'pointer' : 'not-allowed',
            color: canGoNext ? '#2b2a27' : '#c4c2be',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease'
          }}
        >
          <ChevronRight size={20} strokeWidth={2.4} />
        </button>
      </div>

      {/* Weekday Labels (MO, TU, WE, TH, FR, SA, SU) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0, marginBottom: 18, textAlign: 'center' }}>
        {DAYS.map((d) => (
          <div
            key={d}
            style={{
              fontSize: '0.85rem',
              fontWeight: 800,
              color: '#554f48',
              letterSpacing: '0.03em'
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '14px 0', textAlign: 'center' }}>
        {Array.from({ length: totalSlots }, (_, i) => {
          const dayNum = i - startOffset + 1;
          const inMonth = dayNum >= 1 && dayNum <= daysInMonth;

          if (!inMonth) {
            return <div key={`empty-${i}`} style={{ height: 42 }} />;
          }

          const cellDate = new Date(viewYear, viewMonth, dayNum);
          cellDate.setHours(0, 0, 0, 0);

          const isPast = cellDate < minD;
          const isTooFar = maxD ? cellDate > maxD : false;
          const isDisabled = isPast || isTooFar;
          const isSelected = selectedD && cellDate.getTime() === selectedD.getTime();

          return (
            <div key={`day-${dayNum}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <button
                type="button"
                disabled={isDisabled}
                onClick={() => {
                  handleDaySelect(dayNum);
                  if (onClose) onClose();
                }}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  border: isSelected
                    ? '1.5px solid #fecaca'
                    : 'none',
                  background: isSelected
                    ? '#fff1f2'
                    : 'transparent',
                  color: isSelected
                    ? '#c0201f'
                    : (isDisabled ? '#c2beb8' : '#1a1918'),
                  fontWeight: isSelected ? 800 : 600,
                  fontSize: '1rem',
                  cursor: isDisabled ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease',
                  padding: 0
                }}
              >
                {dayNum}
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer: Clear (left) and Today (right) */}
      <div
        style={{
          marginTop: 24,
          paddingTop: 16,
          borderTop: '1px solid #eeeeee',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <button
          type="button"
          onClick={handleClear}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '1.02rem',
            fontWeight: 800,
            color: '#4e4c48',
            padding: '4px 6px',
            fontFamily: 'inherit'
          }}
        >
          Clear
        </button>

        <button
          type="button"
          onClick={handleToday}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '1.02rem',
            fontWeight: 800,
            color: '#b91c1c',
            padding: '4px 6px',
            fontFamily: 'inherit'
          }}
        >
          Today
        </button>
      </div>
    </div>
  );
}
