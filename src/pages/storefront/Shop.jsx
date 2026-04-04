import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import ProductCard from '../../components/ProductCard';
import { Search, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function Shop() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([{ id: 'all', label: 'All Items' }]);
  const [loading, setLoading] = useState(true);
  
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [pRes, cRes] = await Promise.all([
      supabase.from('products').select('*').or('is_active.is.null,is_active.eq.true').order('created_at', { ascending: false }),
      supabase.from('categories').select('*').order('created_at', { ascending: true })
    ]);
    
    if (pRes.data) setProducts(pRes.data);
    if (cRes.data) setCategories([{ id: 'all', label: 'All Items' }, ...cRes.data]);
    setLoading(false);
  };

  const filtered = products.filter(p => {
    const matchCat = activeFilter === 'all' || p.category_id === activeFilter;
    const matchSearch = String(p.name).toLowerCase().includes(search.toLowerCase()) ||
                        String(p.description || '').toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  if (loading) return <div style={{ padding: 100, textAlign: 'center' }}><Loader2 className="spin" size={40} color="var(--red)" /></div>;

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
            {filtered.length > 0 ? filtered.map(p => (
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
