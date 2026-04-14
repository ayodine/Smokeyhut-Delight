function buildPageList(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, '…', total];
  if (current >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '…', current - 1, current, current + 1, '…', total];
}

export default function Pagination({ page, total, perPage, onChange }) {
  const totalPages = Math.ceil(total / perPage);
  if (totalPages <= 1) return null;

  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  const pages = buildPageList(page, totalPages);

  const btnStyle = (active, disabled) => ({
    minWidth: 34, height: 32, padding: '0 10px',
    borderRadius: 6, border: '1px solid var(--border-subtle)',
    background: active ? 'var(--red)' : 'var(--white)',
    color: active ? '#fff' : disabled ? 'var(--border-subtle)' : 'var(--text)',
    fontWeight: 700, fontSize: '0.8rem',
    cursor: disabled ? 'default' : 'pointer',
    fontFamily: "'DM Sans', sans-serif",
    transition: 'all 0.12s',
    lineHeight: 1,
  });

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 4px 2px', flexWrap: 'wrap', gap: 10,
    }}>
      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        Showing <strong style={{ color: 'var(--text)' }}>{from}–{to}</strong> of <strong style={{ color: 'var(--text)' }}>{total}</strong>
      </span>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          style={btnStyle(false, page === 1)}
        >← Prev</button>

        {pages.map((p, i) =>
          p === '…'
            ? <span key={`dots-${i}`} style={{ padding: '0 4px', color: 'var(--text-muted)', fontSize: '0.85rem', userSelect: 'none' }}>…</span>
            : <button
                key={p}
                onClick={() => onChange(p)}
                style={btnStyle(p === page, false)}
              >{p}</button>
        )}

        <button
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          style={btnStyle(false, page === totalPages)}
        >Next →</button>
      </div>
    </div>
  );
}
