import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ChevronDown, X } from 'lucide-react';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Generate 48 half-hour slots across the day (00:00 to 23:30)
const TIME_SLOTS = Array.from({ length: 48 }, (_, idx) => {
  const totalMins = idx * 30;
  const h24 = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const value = `${String(h24).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  const label = `${h12}:${String(mins).padStart(2, '0')} ${period}`;
  return { value, label };
});

function parseInputValue(rawValue, includeTime) {
  if (!rawValue || typeof rawValue !== 'string') return null;
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  if (!includeTime) {
    const datePart = trimmed.slice(0, 10);
    const [y, m, d] = datePart.split('-').map(Number);
    if (!y || !m || !d) return null;
    const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
    return isNaN(dt.getTime()) ? null : { date: dt, time: '12:00' };
  }

  // Supports YYYY-MM-DDTHH:mm or ISO string
  const localMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
  if (localMatch) {
    const y = Number(localMatch[1]);
    const m = Number(localMatch[2]);
    const d = Number(localMatch[3]);
    const hh = localMatch[4] !== undefined ? Number(localMatch[4]) : 12;
    const mm = localMatch[5] !== undefined ? Number(localMatch[5]) : 0;
    const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
    if (!isNaN(dt.getTime())) {
      const snappedMin = mm >= 15 && mm < 45 ? '30' : '00';
      const snappedHour = mm >= 45 ? (hh + 1) % 24 : hh;
      const timeStr = `${String(snappedHour).padStart(2, '0')}:${snappedMin}`;
      return { date: dt, time: timeStr };
    }
  }

  const fallback = new Date(trimmed);
  if (isNaN(fallback.getTime())) return null;
  const hh = fallback.getHours();
  const mm = fallback.getMinutes();
  const snappedMin = mm >= 15 && mm < 45 ? '30' : '00';
  const timeStr = `${String(hh).padStart(2, '0')}:${snappedMin}`;
  return { date: fallback, time: timeStr };
}

function formatTime12h(time24) {
  if (!time24) return '12:00 PM';
  const [hStr, mStr] = time24.split(':');
  const h24 = Number(hStr);
  const mins = Number(mStr || 0);
  if (isNaN(h24)) return '12:00 PM';
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(mins).padStart(2, '0')} ${period}`;
}

function toDateString(dateObj) {
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function DashDateTimePicker({
  value,
  onChange,
  includeTime = false,
  placeholder,
  allowClear = true,
  minDate,
  disabled = false,
  id,
}) {
  const parsed = useMemo(() => parseInputValue(value, includeTime), [value, includeTime]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [open, setOpen] = useState(false);
  const [showMonthYearMenu, setShowMonthYearMenu] = useState(false);

  // Draft state inside popover before user clicks "Continue" (also updates live onChange for seamless UX)
  const [draftDate, setDraftDate] = useState(() => parsed?.date || today);
  const [draftTime, setDraftTime] = useState(() => parsed?.time || '12:00');
  const [viewYear, setViewYear] = useState(() => (parsed?.date || today).getFullYear());
  const [viewMonth, setViewMonth] = useState(() => (parsed?.date || today).getMonth());

  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const timeListRef = useRef(null);
  const activeTimeBtnRef = useRef(null);

  const [popoverCoords, setPopoverCoords] = useState({ top: 0, left: 0, width: includeTime ? 520 : 350 });

  // Sync draft state when value prop changes externally
  useEffect(() => {
    if (parsed) {
      setDraftDate(parsed.date);
      setDraftTime(parsed.time);
      setViewYear(parsed.date.getFullYear());
      setViewMonth(parsed.date.getMonth());
    }
  }, [value, includeTime]);

  const emitValue = (nextDate, nextTime) => {
    if (!nextDate || !onChange) return;
    const datePart = toDateString(nextDate);
    const formatted = includeTime ? `${datePart}T${nextTime || '12:00'}` : datePart;
    // Support both standard event-style `onChange(e)` and direct `onChange(val)`
    onChange({ target: { value: formatted }, currentTarget: { value: formatted } });
  };

  const computePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const desiredWidth = includeTime ? Math.min(520, window.innerWidth - 24) : Math.min(360, window.innerWidth - 24);
    const estimatedHeight = 430;

    let left = rect.left;
    if (left + desiredWidth > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - desiredWidth - 12);
    }

    const spaceBelow = window.innerHeight - rect.bottom;
    let top = rect.bottom + 8;
    if (spaceBelow < estimatedHeight && rect.top > estimatedHeight) {
      top = Math.max(12, rect.top - estimatedHeight - 8);
    } else if (top + estimatedHeight > window.innerHeight - 12) {
      top = Math.max(12, window.innerHeight - estimatedHeight - 12);
    }

    setPopoverCoords({ top, left, width: desiredWidth });
  };

  const handleOpenToggle = () => {
    if (disabled) return;
    if (!open) {
      const initialDate = parsed?.date || today;
      const initialTime = parsed?.time || '12:00';
      setDraftDate(initialDate);
      setDraftTime(initialTime);
      setViewYear(initialDate.getFullYear());
      setViewMonth(initialDate.getMonth());
      setShowMonthYearMenu(false);
      computePosition();
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  // Scroll the selected time slot into view when popover opens
  useEffect(() => {
    if (open && includeTime) {
      const timer = setTimeout(() => {
        if (activeTimeBtnRef.current && timeListRef.current) {
          const container = timeListRef.current;
          const btn = activeTimeBtnRef.current;
          const scrollTarget = btn.offsetTop - container.clientHeight / 2 + btn.clientHeight / 2;
          container.scrollTop = Math.max(0, scrollTarget);
        }
      }, 20);
      return () => clearTimeout(timer);
    }
  }, [open, includeTime]);

  // Reposition on window resize/scroll & close on outside click or Escape
  useEffect(() => {
    if (!open) return;

    const handleOutside = (e) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target) &&
        triggerRef.current && !triggerRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };

    const handleKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };

    const handleReposition = () => computePosition();

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open, includeTime]);

  // Build 42-cell (6 weeks × 7 days, Sunday-start) calendar grid
  const calendarCells = useMemo(() => {
    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0 (Sun) .. 6 (Sat)
    const daysInCurrMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const cells = [];
    // Leading days from previous month
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const cellDate = new Date(viewYear, viewMonth - 1, dayNum, 12, 0, 0, 0);
      cells.push({ day: dayNum, inMonth: false, date: cellDate });
    }
    // Current month days
    for (let d = 1; d <= daysInCurrMonth; d++) {
      const cellDate = new Date(viewYear, viewMonth, d, 12, 0, 0, 0);
      cells.push({ day: d, inMonth: true, date: cellDate });
    }
    // Trailing days from next month to complete the last week row (matches Reference Image 2)
    const totalCells = Math.ceil((firstDayOfWeek + daysInCurrMonth) / 7) * 7;
    const remaining = totalCells - cells.length;
    for (let d = 1; d <= remaining; d++) {
      const cellDate = new Date(viewYear, viewMonth + 1, d, 12, 0, 0, 0);
      cells.push({ day: d, inMonth: false, date: cellDate });
    }
    return cells;
  }, [viewYear, viewMonth]);

  const minDateObj = useMemo(() => {
    if (!minDate) return null;
    const [y, m, d] = String(minDate).slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }, [minDate]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear(y => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear(y => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  const handleSelectDay = (cell) => {
    const chosen = cell.date;
    setDraftDate(chosen);
    setViewYear(chosen.getFullYear());
    setViewMonth(chosen.getMonth());
    emitValue(chosen, draftTime);
  };

  const handleSelectTime = (slotValue) => {
    setDraftTime(slotValue);
    emitValue(draftDate, slotValue);
  };

  const handleConfirmContinue = () => {
    emitValue(draftDate, draftTime);
    setOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    if (onChange) {
      onChange({ target: { value: '' }, currentTarget: { value: '' } });
    }
    setOpen(false);
  };

  // Trigger display string
  const triggerDisplay = useMemo(() => {
    if (!parsed?.date) return '';
    const dateFormatted = parsed.date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    if (!includeTime) return dateFormatted;
    return `${dateFormatted} at ${formatTime12h(parsed.time)}`;
  }, [parsed, includeTime]);

  // Footer summary text matching Reference Image 2: "Selected for Wednesday, November 4 at 12:00 PM"
  const footerSummaryBold = useMemo(() => {
    if (!draftDate) return '';
    const dayMonth = draftDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
    if (!includeTime) {
      return `${dayMonth}, ${draftDate.getFullYear()}`;
    }
    return `${dayMonth} at ${formatTime12h(draftTime)}`;
  }, [draftDate, draftTime, includeTime]);

  const resolvedPlaceholder = placeholder || (includeTime ? 'Select date & time' : 'Select date');

  return (
    <>
      <div
        ref={triggerRef}
        id={id}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={handleOpenToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleOpenToggle();
          }
        }}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: '11px 14px',
          borderRadius: 10,
          background: 'var(--white, #ffffff)',
          border: open
            ? '1.5px solid var(--red, #c0201f)'
            : '1px solid var(--border-subtle, #e2e2e2)',
          boxShadow: open ? '0 0 0 3px rgba(192, 32, 31, 0.08)' : 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          transition: 'all 0.15s ease',
          boxSizing: 'border-box',
          userSelect: 'none',
        }}
      >
        <span
          style={{
            fontSize: '0.9rem',
            fontWeight: triggerDisplay ? 600 : 400,
            color: triggerDisplay ? 'var(--text, #111)' : 'var(--text-muted, #888)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {triggerDisplay || resolvedPlaceholder}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {allowClear && triggerDisplay && !disabled && (
            <span
              role="button"
              title="Clear date"
              onClick={handleClear}
              style={{
                width: 20,
                height: 20,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted, #777)',
                background: 'var(--black2, #f4f3ef)',
                cursor: 'pointer',
              }}
            >
              <X size={12} />
            </span>
          )}
          <CalendarIcon size={16} color={open || triggerDisplay ? 'var(--red, #c0201f)' : 'var(--text-muted, #666)'} />
        </div>
      </div>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: popoverCoords.top,
              left: popoverCoords.left,
              width: popoverCoords.width,
              zIndex: 10000,
              background: '#ffffff',
              borderRadius: 16,
              border: '1px solid #e5e5e5',
              boxShadow: '0 20px 45px rgba(0, 0, 0, 0.14), 0 4px 12px rgba(0, 0, 0, 0.06)',
              fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
              overflow: 'hidden',
              userSelect: 'none',
            }}
          >
            {/* Top Split Body: Calendar (Left) + Time Slots (Right when includeTime) */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: includeTime ? '1fr 168px' : '1fr',
              }}
            >
              {/* LEFT COLUMN: Calendar */}
              <div style={{ padding: '20px 20px 16px' }}>
                {/* Month & Year Navigation Header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 18,
                    padding: '0 4px',
                    position: 'relative',
                  }}
                >
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    aria-label="Previous month"
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      border: 'none',
                      background: 'transparent',
                      color: '#6b7280',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <ChevronLeft size={18} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowMonthYearMenu(v => !v)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      border: 'none',
                      background: 'transparent',
                      fontWeight: 700,
                      fontSize: '1.02rem',
                      color: '#111111',
                      cursor: 'pointer',
                      padding: '4px 8px',
                      borderRadius: 8,
                    }}
                  >
                    <span>{MONTHS[viewMonth]} {viewYear}</span>
                    <ChevronDown size={15} color="#6b7280" />
                  </button>

                  <button
                    type="button"
                    onClick={handleNextMonth}
                    aria-label="Next month"
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      border: 'none',
                      background: 'transparent',
                      color: '#6b7280',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <ChevronRight size={18} />
                  </button>

                  {/* Quick Month/Year Jump Popover */}
                  {showMonthYearMenu && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 36,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: '#ffffff',
                        border: '1px solid #e5e5e5',
                        borderRadius: 12,
                        boxShadow: '0 10px 25px rgba(0,0,0,0.12)',
                        padding: 12,
                        zIndex: 20,
                        width: 230,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <button
                          type="button"
                          onClick={() => setViewYear(y => y - 1)}
                          style={{ border: '1px solid #e5e5e5', background: '#fff', borderRadius: 6, width: 26, height: 26, cursor: 'pointer' }}
                        >
                          ‹
                        </button>
                        <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#111' }}>{viewYear}</span>
                        <button
                          type="button"
                          onClick={() => setViewYear(y => y + 1)}
                          style={{ border: '1px solid #e5e5e5', background: '#fff', borderRadius: 6, width: 26, height: 26, cursor: 'pointer' }}
                        >
                          ›
                        </button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                        {MONTHS.map((mName, mIdx) => (
                          <button
                            key={mName}
                            type="button"
                            onClick={() => {
                              setViewMonth(mIdx);
                              setShowMonthYearMenu(false);
                            }}
                            style={{
                              padding: '6px 4px',
                              borderRadius: 6,
                              border: 'none',
                              fontSize: '0.76rem',
                              fontWeight: mIdx === viewMonth ? 700 : 500,
                              background: mIdx === viewMonth ? '#c0201f' : 'transparent',
                              color: mIdx === viewMonth ? '#fff' : '#222',
                              cursor: 'pointer',
                            }}
                          >
                            {mName.slice(0, 3)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Weekday Row: Sun Mon Tue Wed Thu Fri Sat */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, 1fr)',
                    textAlign: 'center',
                    marginBottom: 10,
                  }}
                >
                  {WEEKDAYS.map((dayLabel) => (
                    <div
                      key={dayLabel}
                      style={{
                        fontSize: '0.82rem',
                        fontWeight: 500,
                        color: '#8c8c8c',
                        padding: '4px 0',
                      }}
                    >
                      {dayLabel}
                    </div>
                  ))}
                </div>

                {/* Days Grid (6 rows × 7 cols) */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, 1fr)',
                    rowGap: 6,
                    columnGap: 2,
                    justifyItems: 'center',
                  }}
                >
                  {calendarCells.map((cell, idx) => {
                    const isSelected =
                      draftDate &&
                      cell.date.getFullYear() === draftDate.getFullYear() &&
                      cell.date.getMonth() === draftDate.getMonth() &&
                      cell.date.getDate() === draftDate.getDate();

                    const isBeforeMin =
                      minDateObj &&
                      new Date(cell.date.getFullYear(), cell.date.getMonth(), cell.date.getDate()) < minDateObj;

                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={isBeforeMin}
                        onClick={() => handleSelectDay(cell)}
                        style={{
                          width: 40,
                          height: 36,
                          borderRadius: 10,
                          border: 'none',
                          background: isSelected ? '#c0201f' : 'transparent',
                          color: isSelected
                            ? '#ffffff'
                            : isBeforeMin
                            ? '#d6d6d6'
                            : cell.inMonth
                            ? '#111111'
                            : '#c8c8c8',
                          fontWeight: isSelected ? 700 : 500,
                          fontSize: '0.92rem',
                          cursor: isBeforeMin ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'background 0.12s ease, color 0.12s ease',
                        }}
                      >
                        {cell.day}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* RIGHT COLUMN: Scrollable 30-Min Time Slot Pill List */}
              {includeTime && (
                <div
                  ref={timeListRef}
                  className="no-scrollbar"
                  style={{
                    borderLeft: '1px solid #eaeaea',
                    padding: '12px 12px',
                    maxHeight: 342,
                    overflowY: 'auto',
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  {TIME_SLOTS.map((slot) => {
                    const isSelectedTime = draftTime === slot.value;
                    return (
                      <button
                        key={slot.value}
                        ref={isSelectedTime ? activeTimeBtnRef : null}
                        type="button"
                        onClick={() => handleSelectTime(slot.value)}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: 10,
                          border: isSelectedTime ? '1px solid #c0201f' : '1px solid #e2e2e2',
                          background: isSelectedTime ? '#c0201f' : '#ffffff',
                          color: isSelectedTime ? '#ffffff' : '#111111',
                          fontWeight: isSelectedTime ? 600 : 500,
                          fontSize: '0.9rem',
                          textAlign: 'center',
                          cursor: 'pointer',
                          flexShrink: 0,
                          transition: 'all 0.12s ease',
                        }}
                      >
                        {slot.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* BOTTOM FOOTER BAR: "Selected for Wednesday, November 4 at 12:00 PM" + "Continue" */}
            <div
              style={{
                borderTop: '1px solid #eaeaea',
                padding: '14px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                background: '#ffffff',
              }}
            >
              <div style={{ fontSize: '0.9rem', color: '#6b7280', lineHeight: 1.35 }}>
                Selected for{' '}
                <strong style={{ color: '#111111', fontWeight: 700 }}>
                  {footerSummaryBold}
                </strong>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {allowClear && value && (
                  <button
                    type="button"
                    onClick={handleClear}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#6b7280',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: '6px 8px',
                    }}
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleConfirmContinue}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #dcdcdc',
                    borderRadius: 10,
                    padding: '9px 20px',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    color: '#111111',
                    cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  Continue
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
