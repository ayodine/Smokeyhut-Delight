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
    <div>
      <div className="breadcrumb container">
        <Link to="/">Home</Link><span style={{ margin: '0 8px', color: 'var(--gray-light)' }}>›</span> Shop
      </div>
      <section className="products-section" style={{ paddingTop: 30 }}>
        <div className="container">
          <div className="section-header">
            <div className="section-tag">Full Menu</div>
            <h2 className="section-title">The Smokeyhut <span>Menu</span></h2>
            <p className="section-sub">Every item freshly prepared. Order before 10am for same-day delivery.</p>
          </div>
          <div style={{ marginBottom: 30 }}>
            <input
              type="text"
              className="product-search"
              placeholder="Search menu..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', maxWidth: 400, display: 'block', marginBottom: 16, background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '12px 18px', fontSize: '0.9rem', outline: 'none', fontFamily: "'Nunito', sans-serif", boxShadow: 'var(--shadow)', color: 'var(--text)' }}
            />
            <div className="product-filters">
              {categories.map(c => (
                <button
                  key={c.id}
                  className={`filter-btn${activeFilter === c.id ? ' active' : ''}`}
                  onClick={() => setActiveFilter(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="products-grid">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ background: 'var(--card-bg)', borderRadius: 16, height: 320, animation: 'pulse 1.5s ease-in-out infinite', opacity: 0.6 }} />
              ))
            ) : filtered.length > 0 ? filtered.map(p => (
              <ProductCard key={p.id} product={{ ...p, desc: p.short_desc, category: p.category_id }} />
            )) : (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                  <Search size={48} color="var(--border-subtle)" />
                </div>
                <p style={{ fontWeight: 700 }}>No items found</p>
                <p style={{ fontSize: '0.88rem', marginTop: 6 }}>Try a different search or category</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
