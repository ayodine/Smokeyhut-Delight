import React from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import ProductCard from '../../components/ProductCard';
import { supabase } from '../../lib/supabase';
import { ShoppingCart, Trash2 } from 'lucide-react';

export default function Cart() {
  const { items, updateQty, removeItem, total, itemCount } = useCart();
  const { showToast } = useToast();
  const fmt = (n) => '₦' + n.toLocaleString();

  const [products, setProducts] = React.useState([]);

  React.useEffect(() => {
    const fetchProducts = async () => {
      const { data } = await supabase.from('products').select('*').or('is_active.is.null,is_active.eq.true');
      if (data) setProducts(data);
    };
    fetchProducts();
  }, []);

  // Upsell: products not in cart
  const cartIds = items.map(i => i.id);
  const upsell = products.filter(p => !cartIds.includes(p.id)).slice(0, 3);

  if (items.length === 0) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <ShoppingCart size={64} color="var(--text-muted)" />
          </div>
          <h2 className="section-title">Your Cart is <span>Empty</span></h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>Add some smoky goodness to get started!</p>
          <Link to="/shop" className="btn-primary">Browse Menu →</Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="breadcrumb container">
        <Link to="/">Home</Link><span style={{ margin: '0 8px', color: 'var(--gray-light)' }}>›</span>
        <Link to="/shop">Shop</Link><span style={{ margin: '0 8px', color: 'var(--gray-light)' }}>›</span> Cart
      </div>
      <section className="cart-page">
        <div className="container">
          <div className="section-header">
            <div className="section-tag">Your Cart</div>
            <h2 className="section-title">Review Your <span>Order</span></h2>
          </div>
          <div className="cart-page-grid">
            <div>
              {items.map(item => {
                const hasImage = item.image && item.image.length > 5 && !item.image.startsWith('data:') && item.image.startsWith('http') || item.image?.startsWith('data:');
                const isEmojiStr = item.image && item.image.length <= 4 && !item.image.startsWith('data:');

                return (
                  <div key={item.id} className="cart-detail-item">
                    <div className="cart-detail-emoji" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {hasImage ? (
                         <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : isEmojiStr || item.emoji ? (
                         <div>{item.image || item.emoji}</div>
                      ) : (
                         <div style={{ width: '100%', height: '100%', background: 'var(--black3)' }} />
                      )}
                    </div>
                    <div className="cart-detail-info">
                      <div className="cart-detail-name">{item.name}</div>
                      <div className="cart-detail-desc">{item.desc}</div>
                      <div className="cart-detail-bottom">
                        <div className="cart-detail-price">{fmt(item.price * item.qty)}</div>
                        <div className="cart-detail-qty">
                          <button className="qty-btn" onClick={() => updateQty(item.id, item.qty - 1)}>−</button>
                          <span className="qty-num">{item.qty}</span>
                          <button className="qty-btn" onClick={() => updateQty(item.id, item.qty + 1)}>+</button>
                          <button className="cart-remove" onClick={() => { removeItem(item.id); showToast('Item removed', '', 'info'); }} style={{ marginLeft: 8, display: 'flex', alignItems: 'center', border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={16} /></button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div>
              <div className="cart-summary-card">
                <h3 style={{ fontFamily: "'Mona Sans', 'Mona-Sans', 'Helvetica Neue', sans-serif", fontSize: '1.2rem', marginBottom: 20 }}>Order Summary</h3>
                {items.map(item => (
                  <div key={item.id} className="order-line">
                    <span>{item.name} × {item.qty}</span>
                    <span style={{ fontWeight: 700 }}>{fmt(item.price * item.qty)}</span>
                  </div>
                ))}
                <div className="order-line" style={{ borderBottom: 'none', marginTop: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: '1rem' }}>Subtotal</span>
                  <span className="order-total">{fmt(total)}</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.55 }}>
                  Delivery fee calculated at checkout
                </div>
                <Link to="/checkout" className="checkout-btn" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                  Proceed to Checkout →
                </Link>
                <Link to="/shop" style={{ display: 'block', textAlign: 'center', marginTop: 12, fontSize: '0.85rem', color: 'var(--red)', fontWeight: 700 }}>
                  ← Continue Shopping
                </Link>
              </div>
            </div>
          </div>

          {upsell.length > 0 && (
            <div className="upsell-section">
              <div className="section-header">
                <div className="section-tag">You May Also Like</div>
                <h2 className="section-title" style={{ fontSize: '1.5rem' }}>Add More <span>Smoky Goodness</span></h2>
              </div>
              <div className="upsell-grid">
                {upsell.map(p => <ProductCard key={p.id} product={{...p, desc: p.short_desc, category: p.category_id}} />)}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
