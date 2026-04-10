// Reusable skeleton primitives — import what you need per page.

// Raw shimmer block — pass className for shape, style for dimensions
export function Skel({ className = '', style = {} }) {
  return <div className={`skel ${className}`} style={style} />;
}

// Single text line
export function SkelLine({ sm, xs, lg, style = {} }) {
  const cls = sm ? 'sm' : xs ? 'xs' : lg ? 'lg' : '';
  return <div className={`skel skel-line ${cls}`} style={style} />;
}

// KPI card skeleton — matches .kpi-card height
export function SkelKpi() {
  return (
    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Skel style={{ width: 40, height: 40, borderRadius: 10 }} />
      <Skel className="skel-line lg" style={{ width: '60%' }} />
      <Skel className="skel-line sm" style={{ width: '40%' }} />
    </div>
  );
}

// Table row skeleton
export function SkelRow({ cols = 4 }) {
  const widths = ['30%', '20%', '25%', '15%', '10%'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} style={{ flex: i === 0 ? 2 : 1 }}>
          <Skel className="skel-line" style={{ width: widths[i] || '100%', height: 12 }} />
        </div>
      ))}
    </div>
  );
}

// Card skeleton (stores, coupons, etc.)
export function SkelCard({ height = 120 }) {
  return <Skel className="skel-card" style={{ height, width: '100%' }} />;
}

// Full KPI grid + table — used by Overview, Payments, etc.
export function SkelKpiGrid({ count = 4 }) {
  return (
    <div className="kpi-grid">
      {Array.from({ length: count }).map((_, i) => <SkelKpi key={i} />)}
    </div>
  );
}

export function SkelTable({ rows = 6, cols = 4 }) {
  return (
    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', borderRadius: 16, overflow: 'hidden' }}>
      {/* header */}
      <div style={{ display: 'flex', gap: 16, padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} style={{ flex: i === 0 ? 2 : 1 }}>
            <Skel style={{ height: 10, width: '50%', borderRadius: 4 }} />
          </div>
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => <SkelRow key={i} cols={cols} />)}
    </div>
  );
}

// List of card rows (coupons, staff, zones)
export function SkelList({ rows = 5, height = 68 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkelCard key={i} height={height} />
      ))}
    </div>
  );
}
