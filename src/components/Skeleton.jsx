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

// Page header skeleton — title block + optional action button on the right
export function SkelDashHeader({ hasButton = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Skel style={{ width: 180, height: 22, borderRadius: 6 }} />
        <Skel style={{ width: 120, height: 13, borderRadius: 4 }} />
      </div>
      {hasButton && <Skel style={{ width: 140, height: 36, borderRadius: 8 }} />}
    </div>
  );
}

// Period / filter pill row skeleton
export function SkelFilterPills({ count = 5 }) {
  const widths = [52, 72, 80, 70, 60];
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
      {Array.from({ length: count }).map((_, i) => (
        <Skel key={i} style={{ width: widths[i % widths.length], height: 30, borderRadius: 20 }} />
      ))}
    </div>
  );
}

// KPI card skeleton — matches .kpi-card layout (icon, value, label, change row)
export function SkelKpi() {
  return (
    <div style={{
      background: 'var(--card-bg)', border: '1px solid var(--border-subtle)',
      borderRadius: 14, padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 10,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* top accent bar */}
      <Skel style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, borderRadius: 0 }} />
      <Skel style={{ width: 36, height: 36, borderRadius: 8 }} />
      <Skel style={{ width: '65%', height: 28, borderRadius: 5 }} />
      <Skel style={{ width: '42%', height: 11, borderRadius: 4 }} />
      <Skel style={{ width: '35%', height: 10, borderRadius: 4 }} />
    </div>
  );
}

// Chart skeleton — wrapped in a dash-card with a header line
export function SkelChart({ height = 170 }) {
  return (
    <div style={{
      background: 'var(--card-bg)', border: '1px solid var(--border-subtle)',
      borderRadius: 14, padding: 24, marginBottom: 24,
    }}>
      <Skel style={{ width: 160, height: 14, borderRadius: 4, marginBottom: 20 }} />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height }}>
        {[55, 80, 40, 90, 65, 75, 50].map((h, i) => (
          <div key={i} className="skel" style={{ flex: 1, height: `${h}%`, borderRadius: '4px 4px 0 0' }} />
        ))}
      </div>
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

// Full KPI grid — used standalone when you just need cards
export function SkelKpiGrid({ count = 4 }) {
  return (
    <div className="kpi-grid" style={{ marginBottom: 24 }}>
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
