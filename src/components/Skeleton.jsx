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
        <Skel style={{ width: 200, height: 24, borderRadius: 6 }} />
        <Skel style={{ width: 130, height: 13, borderRadius: 4 }} />
      </div>
      {hasButton && (
        <div style={{ display: 'flex', gap: 8 }}>
          <Skel style={{ width: 120, height: 38, borderRadius: 8 }} />
          <Skel style={{ width: 120, height: 38, borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}

// Period / filter pill row skeleton
export function SkelFilterPills({ count = 5 }) {
  const widths = [56, 76, 84, 72, 64, 52];
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
      {Array.from({ length: count }).map((_, i) => (
        <Skel key={i} style={{ width: widths[i % widths.length], height: 32, borderRadius: 20 }} />
      ))}
    </div>
  );
}

// KPI card skeleton — exactly matches .kpi-card layout
export function SkelKpi() {
  return (
    <div style={{
      background: 'var(--white)',
      border: '1px solid rgba(0,0,0,0.04)',
      borderRadius: 20,
      padding: 24,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      boxShadow: '0 2px 10px rgba(0,0,0,0.02)',
    }}>
      <Skel style={{ width: 48, height: 48, borderRadius: 14, marginBottom: 20 }} />
      <Skel style={{ width: '60%', height: 32, borderRadius: 5, marginBottom: 6 }} />
      <Skel style={{ width: '45%', height: 12, borderRadius: 4 }} />
      <Skel style={{ width: '38%', height: 24, borderRadius: 20, marginTop: 14 }} />
    </div>
  );
}

// Chart skeleton — wrapped in a dash-card with a header line
export function SkelChart({ height = 170 }) {
  return (
    <div style={{
      background: 'var(--card-bg)', border: '1px solid rgba(0,0,0,0.05)',
      borderRadius: 18, padding: 28, marginBottom: 24,
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

// Card skeleton (generic filler block)
export function SkelCard({ height = 120 }) {
  return <Skel className="skel-card" style={{ height, width: '100%' }} />;
}

// Full KPI grid — used standalone when you just need cards
export function SkelKpiGrid({ count = 4, style = {} }) {
  return (
    <div className="kpi-grid" style={{ marginBottom: 24, ...style }}>
      {Array.from({ length: count }).map((_, i) => <SkelKpi key={i} />)}
    </div>
  );
}

// Table inside a dash-card
export function SkelTable({ rows = 6, cols = 4 }) {
  return (
    <div style={{ background: 'var(--card-bg)', border: '1px solid rgba(0,0,0,0.05)', borderRadius: 18, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
      {/* header row */}
      <div style={{ display: 'flex', gap: 16, padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--black2)' }}>
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

// Store card skeleton — matches .store-card layout
export function SkelStoreCard() {
  return (
    <div style={{
      background: 'var(--card-bg)',
      border: '1px solid rgba(0,0,0,0.05)',
      borderRadius: 18,
      padding: 28,
      boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <Skel style={{ width: 150, height: 22, borderRadius: 5 }} />
        <Skel style={{ width: 64, height: 26, borderRadius: 20 }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        <Skel style={{ width: '80%', height: 12, borderRadius: 4 }} />
        <Skel style={{ width: '55%', height: 12, borderRadius: 4 }} />
        <Skel style={{ width: '65%', height: 12, borderRadius: 4 }} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <Skel style={{ flex: 1, height: 36, borderRadius: 8 }} />
        <Skel style={{ flex: 1, height: 36, borderRadius: 8 }} />
      </div>
    </div>
  );
}

// TopList card skeleton — matches ProductStats TopList panel
export function SkelTopListCard() {
  const nameWidths = ['72%', '58%', '65%', '48%', '60%'];
  return (
    <div style={{
      background: 'var(--card-bg)',
      border: '1px solid rgba(0,0,0,0.05)',
      borderRadius: 18,
      padding: 28,
      boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <Skel style={{ width: 160, height: 14, borderRadius: 4 }} />
        <Skel style={{ width: 68, height: 26, borderRadius: 6 }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {nameWidths.map((nameW, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: i === 0 ? 'rgba(0,0,0,0.02)' : 'transparent' }}>
            <Skel style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0 }} />
            <Skel style={{ width: nameW, height: 11, borderRadius: 4 }} />
            <Skel style={{ width: 52, height: 11, borderRadius: 4, flexShrink: 0 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// List of card rows (coupons, staff, zones — inline usage)
export function SkelList({ rows = 5, height = 68 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkelCard key={i} height={height} />
      ))}
    </div>
  );
}
