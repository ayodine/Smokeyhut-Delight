import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import ProductCard from '../../components/ProductCard';
import PromoProgressBanner from '../../components/PromoProgressBanner';
import { Search, SlidersHorizontal, X } from 'lucide-react';
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

  const activeLabel = categories.find(c => c.id === activeFilter)?.label || 'All Items';

  return (
    <div className="shop-page">
      {/* ── Top Bar ── */}
      <div className="shop-topbar">
        <div className="container shop-topbar-inner">
          <nav className="shop-breadcrumb">
            <Link to="/">Home</Link>
            <span className="shop-breadcrumb-sep">›</span>
            <span>Shop</span>
          </nav>
          <span className="shop-count-badge">
            {loading ? '—' : filtered.length} items
          </span>
        </div>
      </div>

      {/* ── Hero Header ── */}
      <div className="shop-hero">
        <div className="container shop-hero-inner">
          <h1 className="shop-hero-title">The Smokeyhut Menu</h1>
          <p className="shop-hero-sub">
            Firewood-grilled, freshly prepared daily. Order for delivery or pickup.
          </p>

          {/* Search */}
          <div className="shop-search-wrap">
            <Search size={18} className="shop-search-icon" />
            <input
              type="text"
              placeholder="Search guineafowl, rice, drinks…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="shop-search-input"
              id="shop-search"
            />
            {search && (
              <button
                className="shop-search-clear"
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Promo Banner ── */}
      <div className="container shop-promo-wrap">
        <PromoProgressBanner variant="full" />
      </div>

      {/* ── Category Filters ── */}
      <div className="shop-filters-bar">
        <div className="container shop-filters-inner">
          <div className="shop-filters-label">
            <SlidersHorizontal size={14} />
            <span>Filter</span>
          </div>
          <div className="shop-filters-scroll">
            {categories.map(c => (
              <button
                key={c.id}
                onClick={() => setActiveFilter(c.id)}
                className={`shop-filter-pill${activeFilter === c.id ? ' active' : ''}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Active Filter Indicator ── */}
      {activeFilter !== 'all' && (
        <div className="container shop-active-filter">
          <span>Showing: <strong>{activeLabel}</strong></span>
          <button
            className="shop-clear-filter"
            onClick={() => setActiveFilter('all')}
          >
            <X size={12} /> Clear
          </button>
        </div>
      )}

      {/* ── Product Grid ── */}
      <div className="container shop-grid-section">
        <div className="premium-grid">
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="shop-skeleton" />
            ))
          ) : filtered.length > 0 ? (
            filtered.map(p => (
              <ProductCard
                key={p.id}
                product={{ ...p, desc: p.short_desc, category_id: p.category_id, category: p.category_id }}
                variant="shopify"
              />
            ))
          ) : (
            <div className="shop-empty">
              <Search size={44} color="#ccc" />
              <h3>No results for "{debouncedSearch || activeLabel}"</h3>
              <p>Try a different keyword or clear the filter.</p>
              <button
                className="shop-empty-reset"
                onClick={() => { setSearch(''); setActiveFilter('all'); }}
              >
                Show all items
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
