import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import ProductCard from '../../components/ProductCard';
import { Search } from 'lucide-react';
import { getProducts } from '../../lib/productsCache';
import { useSEO } from '../../hooks/useSEO';

export default function Shop() {
  useSEO({
    title: 'Order Online – Guineafowl, Rice & More',
    description: 'Browse and order from our full menu — firewood-grilled guineafowl, rice, palm wine, zobo & more. Same-day delivery across Lagos.',
    path: '/shop',
  });
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([{ id: 'all', label: 'All Items' }]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    getProducts().then(({ products: p, categories: c }) => {
      setProducts(p);
      setCategories([{ id: 'all', label: 'All Items' }, ...c]);
      setLoading(false);
      if (typeof window !== 'undefined' && window.fbq) {
        window.fbq('track', 'ViewContent', {
          content_type: 'product_group',
          content_name: 'Shop Catalog'
        });
      }
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    return products.filter(p => {
      const matchCat = activeFilter === 'all' || p.category_id === activeFilter;
      const matchSearch = !q || String(p.name).toLowerCase().includes(q) || String(p.short_desc || '').toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [products, debouncedSearch, activeFilter]);

  return (
    <div style={{ background: '#f5f5f7', minHeight: '100vh', color: '#111' }}>
      <div style={{ padding: '14px 16px', background: '#fff', borderBottom: '1px solid #e5e5e5' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: '#888' }}>
          <Link to="/" style={{ color: '#888', textDecoration: 'none' }}>Home</Link>
          <span>›</span>
          <span style={{ color: '#111', fontWeight: 700 }}>Shop</span>
        </div>
      </div>
      <section style={{ padding: 'clamp(32px, 8vw, 60px) 0', maxWidth: 1200, margin: '0 auto' }}>
        <div className="container">
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h1 style={{ fontWeight: 900, fontSize: 'clamp(2rem, 5vw, 3rem)', color: '#111', marginBottom: 16, letterSpacing: '-0.02em' }}>The Smokeyhut Menu</h1>
          <p style={{ color: '#666', fontSize: '1.05rem', maxWidth: 600, margin: '0 auto', lineHeight: 1.6 }}>Every item freshly prepared with premium ingredients. Order now for delivery or pickup.</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 48, gap: 24 }}>
          {/* Search */}
          <div style={{ position: 'relative', width: '100%', maxWidth: 480 }}>
            <Search size={18} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#aaa' }} />
            <input
              type="text"
              placeholder="Search our menu..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '16px 20px 16px 44px', borderRadius: 12,
                border: '1px solid #e5e5e5', background: '#fff', fontSize: '1rem',
                outline: 'none', color: '#111', boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                transition: 'all 0.2s'
              }}
              onFocus={e => { e.target.style.borderColor = '#c0201f'; e.target.style.boxShadow = '0 4px 12px rgba(192,32,31,0.08)'; }}
              onBlur={e => { e.target.style.borderColor = '#e5e5e5'; e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.02)'; }}
            />
          </div>

          {/* Filters */}
          <div className="premium-filters-scroll" style={{ display: 'flex', overflowX: 'auto', gap: 10, padding: '4px 20px 24px', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none', width: '100%' }}>
            <style>{`.premium-filters-scroll::-webkit-scrollbar { display: none; }`}</style>
            {categories.map(c => (
              <button
                key={c.id}
                onClick={() => setActiveFilter(c.id)}
                style={{
                  flexShrink: 0,
                  padding: '10px 20px', borderRadius: 30, fontSize: '0.88rem', fontWeight: 700,
                  cursor: 'pointer', transition: 'all 0.2s',
                  background: activeFilter === c.id ? 'var(--red)' : '#fff',
                  color: activeFilter === c.id ? '#fff' : '#555',
                  border: `1px solid ${activeFilter === c.id ? 'var(--red)' : '#e5e5e5'}`,
                  boxShadow: activeFilter === c.id ? '0 4px 12px rgba(192,32,31,0.2)' : 'none'
                }}
                onMouseEnter={e => { if (activeFilter !== c.id) { e.target.style.borderColor = 'var(--red)'; e.target.style.color = 'var(--red)'; } }}
                onMouseLeave={e => { if (activeFilter !== c.id) { e.target.style.borderColor = '#e5e5e5'; e.target.style.color = '#555'; } }}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

          <div className="premium-grid">
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <div key={i} style={{ background: '#f5f5f7', borderRadius: 12, height: 380, animation: 'pulse 1.5s ease-in-out infinite' }} />
              ))
            ) : filtered.length > 0 ? filtered.map(p => (
              <ProductCard key={p.id} product={{ ...p, desc: p.short_desc, category: p.category_id }} variant="shopify" />
            )) : (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '80px 20px', color: '#888' }}>
                <Search size={48} color="#ddd" style={{ marginBottom: 16 }} />
                <h3 style={{ fontWeight: 800, fontSize: '1.2rem', color: '#111', marginBottom: 8 }}>No items found</h3>
                <p style={{ fontSize: '0.95rem' }}>We couldn't find anything matching your search.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
