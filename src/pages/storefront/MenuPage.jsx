import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import ProductCard from '../../components/ProductCard';
import { getProducts } from '../../lib/productsCache';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import { useSettings } from '../../context/SettingsContext';
import { publicSupabase } from '../../lib/supabase';
import { fetchDeliveryZones, matchDeliveryZone } from '../../lib/deliveryMatcher';
import {
  ShoppingCart, X, Truck, Store as StoreIcon, Loader2, MapPin,
  MessageCircle, Banknote, Plus, Minus, Trash2, Tag, Copy, CheckCircle,
} from 'lucide-react';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const WA_NUMBER         = '2348141748281';
const VAT               = 100;
const fmt = (n) => '₦' + Number(n).toLocaleString();

async function notify(type, order) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ type, order }),
    });
  } catch { /* silent */ }
}

export default function MenuPage() {
  const { items, addItem, removeItem, updateQty, clearCart, total, itemCount } = useCart();
  const { showToast } = useToast();
  const { settings } = useSettings();

  // Product grid state
  const [products, setProducts]     = useState([]);
  const [categories, setCategories] = useState([{ id: 'all', label: 'All Items' }]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch]         = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Drawer state
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [successData, setSuccessData]   = useState(null); // { orderId, method }

  useEffect(() => {
    getProducts().then(({ products: p, categories: c }) => {
      setProducts(p);
      setCategories([{ id: 'all', label: 'All Items' }, ...c]);
      setLoadingProducts(false);
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    return products.filter(p => {
      const matchCat    = activeFilter === 'all' || p.category_id === activeFilter;
      const matchSearch = !q || p.name?.toLowerCase().includes(q) || p.short_desc?.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [products, debouncedSearch, activeFilter]);

  return (
    <>
      <Navbar onCartOpen={() => setCheckoutOpen(true)} />

      {/* Breadcrumb */}
      <div className="breadcrumb container">
        <a href="/">Home</a>
        <span style={{ margin: '0 8px', color: 'var(--gray-light)' }}>›</span>
        Menu
      </div>

      {/* Product grid */}
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
              style={{
                width: '100%', maxWidth: 400, display: 'block', marginBottom: 16,
                background: 'var(--card-bg)', border: '1px solid var(--border-subtle)',
                borderRadius: 8, padding: '12px 18px', fontSize: '0.9rem', outline: 'none',
                fontFamily: "'Nunito', sans-serif", boxShadow: 'var(--shadow)', color: 'var(--text)',
              }}
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
            {loadingProducts
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} style={{ background: 'var(--card-bg)', borderRadius: 16, height: 320, animation: 'pulse 1.5s ease-in-out infinite', opacity: 0.6 }} />
                ))
              : filtered.map(p => <ProductCard key={p.id} product={p} />)
            }
            {!loadingProducts && filtered.length === 0 && (
              <p style={{ color: 'var(--text-muted)', gridColumn: '1/-1' }}>No items found.</p>
            )}
          </div>
        </div>
      </section>

      {/* WhatsApp bubble */}
      <a href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noopener noreferrer" className="wa-bubble" aria-label="Chat with us on WhatsApp">
        <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28" aria-hidden="true">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.117 1.523 5.847L.057 23.617a.5.5 0 0 0 .612.612l5.808-1.456A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.9 0-3.68-.498-5.22-1.37l-.374-.214-3.878.972.99-3.808-.234-.388A9.956 9.956 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
        </svg>
      </a>

      <Footer />

      {/* Checkout drawer overlay */}
      {checkoutOpen && (
        <div className="cart-overlay open" onClick={() => setCheckoutOpen(false)} />
      )}

      {/* Checkout drawer panel */}
      <div
        className="dash-drawer"
        style={{
          transform: checkoutOpen ? 'translateX(0)' : 'translateX(100%)',
          width: 'min(480px, 100vw)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div className="dash-drawer-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShoppingCart size={18} color="var(--red)" />
            <span style={{ fontWeight: 800, fontSize: '1rem' }}>Your Order ({itemCount})</span>
          </div>
          <button className="dash-drawer-close" onClick={() => setCheckoutOpen(false)}><X size={16} /></button>
        </div>

        {/* Scrollable content */}
        <div className="dash-drawer-content" style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>

          {/* ── Cart items ── */}
          {items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
              <ShoppingCart size={48} style={{ marginBottom: 12, opacity: 0.4 }} />
              <p style={{ fontWeight: 600 }}>Your cart is empty</p>
              <p style={{ fontSize: '0.82rem', marginTop: 4 }}>Add items from the menu above</p>
            </div>
          ) : (
            <div style={{ marginBottom: 20 }}>
              {items.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  {/* Thumbnail */}
                  <div style={{ width: 52, height: 52, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: 'var(--black2)' }}>
                    {item.image
                      ? <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ width: '100%', height: '100%' }} />
                    }
                  </div>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                    <div style={{ color: 'var(--red)', fontWeight: 700, fontSize: '0.85rem', marginTop: 2 }}>{fmt(item.price * item.qty)}</div>
                    {/* Qty controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <button onClick={() => updateQty(item.id, item.qty - 1)} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--black2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={12} /></button>
                      <span style={{ fontWeight: 700, fontSize: '0.88rem', minWidth: 18, textAlign: 'center' }}>{item.qty}</span>
                      <button onClick={() => updateQty(item.id, item.qty + 1)} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--black2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={12} /></button>
                    </div>
                  </div>
                  <button onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, flexShrink: 0 }}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          )}

          {/* form sections added in Task 4 */}

        </div>
      </div>
    </>
  );
}
