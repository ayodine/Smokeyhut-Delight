import React, { useState, useMemo } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Check } from 'lucide-react';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function StorefrontCalendar({
  value,
  onChange,
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
      d.setDate(d.getDate() + 30);
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
  // Convert Sunday (0) to index 6, Monday (1) to index 0
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

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e5e5', padding: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
      {/* Month Navigation Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button
          type="button"
          onClick={handlePrev}
          disabled={!canGoPrev}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: '1px solid #e5e5e5',
            background: canGoPrev ? '#fff' : '#f5f5f7',
            cursor: canGoPrev ? 'pointer' : 'not-allowed',
            color: canGoPrev ? '#111' : '#bbb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s'
          }}
        >
          <ChevronLeft size={16} />
        </button>

        <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#111' }}>
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>

        <button
          type="button"
          onClick={handleNext}
          disabled={!canGoNext}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: '1px solid #e5e5e5',
            background: canGoNext ? '#fff' : '#f5f5f7',
            cursor: canGoNext ? 'pointer' : 'not-allowed',
            color: canGoNext ? '#111' : '#bbb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s'
          }}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Weekday Labels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6, textAlign: 'center' }}>
        {WEEKDAYS.map((wd) => (
          <div key={wd} style={{ fontSize: '0.72rem', fontWeight: 800, color: '#888', textTransform: 'uppercase' }}>
            {wd}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {Array.from({ length: totalSlots }, (_, i) => {
          const dayNum = i - startOffset + 1;
          const inMonth = dayNum >= 1 && dayNum <= daysInMonth;

          if (!inMonth) {
            return <div key={`empty-${i}`} style={{ height: 36 }} />;
          }

          const cellDate = new Date(viewYear, viewMonth, dayNum);
          cellDate.setHours(0, 0, 0, 0);

          const isPast = cellDate < minD;
          const isTooFar = maxD ? cellDate > maxD : false;
          const isDisabled = isPast || isTooFar;
          const isSelected = selectedD && cellDate.getTime() === selectedD.getTime();
          const isCurrentToday = cellDate.getTime() === today.getTime();

          return (
            <button
              key={`day-${dayNum}`}
              type="button"
              disabled={isDisabled}
              onClick={() => handleDaySelect(dayNum)}
              style={{
                height: 36,
                borderRadius: 8,
                border: isSelected ? 'none' : (isCurrentToday ? '1.5px solid rgba(192,32,31,0.3)' : '1px solid transparent'),
                background: isSelected ? '#c0201f' : (isCurrentToday ? 'rgba(192,32,31,0.04)' : 'transparent'),
                color: isSelected ? '#fff' : (isDisabled ? '#d1d5db' : '#111'),
                fontWeight: isSelected ? 800 : (isCurrentToday ? 700 : 500),
                fontSize: '0.82rem',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s'
              }}
            >
              {dayNum}
            </button>
          );
        })}
      </div>

      {/* Selected Date Indicator Banner */}
      {selectedD && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <CalendarIcon size={14} color="#c0201f" />
            <span style={{ fontSize: '0.78rem', color: '#111', fontWeight: 700 }}>
              {selectedD.toLocaleDateString('en-NG', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
          <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '2px 8px', borderRadius: 12, background: 'rgba(34,197,94,0.1)', color: '#16a34a' }}>
            Selected
          </span>
        </div>
      )}
    </div>
  );
}

