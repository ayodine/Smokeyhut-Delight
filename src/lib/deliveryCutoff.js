// Single source of truth for per-product same-day delivery cutoffs.
// A product may carry `same_day_cutoff` — a "HH:MM" / "HH:MM:SS" time string.
// If set and the current time in Lagos is at/after it, the product can only be
// delivered (or picked up) the next day. All time logic is in Africa/Lagos.

const LAGOS_TZ = 'Africa/Lagos';

// Wall-clock minutes-since-midnight in Lagos for a given instant, independent of
// the device timezone.
function lagosMinutesNow(now) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LAGOS_TZ, hour12: false, hour: '2-digit', minute: '2-digit',
  }).formatToParts(now);
  const h = Number(parts.find(p => p.type === 'hour').value) % 24;
  const m = Number(parts.find(p => p.type === 'minute').value);
  return h * 60 + m;
}

// "HH:MM" / "HH:MM:SS" -> minutes since midnight, or null if invalid.
function parseCutoffMinutes(cutoff) {
  if (!cutoff || typeof cutoff !== 'string') return null;
  const m = cutoff.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// minutes-since-midnight -> "1:05 PM"
function formatLabel(minutes) {
  let h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function getCutoffState(product, now = new Date()) {
  const cutoffMin = parseCutoffMinutes(product?.same_day_cutoff);
  if (cutoffMin == null) {
    return { hasCutoff: false, cutoffLabel: '', isPastCutoff: false };
  }
  return {
    hasCutoff: true,
    cutoffLabel: formatLabel(cutoffMin),
    isPastCutoff: lagosMinutesNow(now) >= cutoffMin,
  };
}

export function anyItemPastCutoff(items, now = new Date()) {
  return (items || []).some(it => getCutoffState(it, now).isPastCutoff);
}
