import React from 'react';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { Drumstick, Plus, ShoppingBag } from 'lucide-react';

const fmt = (n) => '₦' + Number(n).toLocaleString();

/** variant="shopify" → clean white Shopify-style card (used on /shop)
 *  variant="menu"    → compact 2-col card (used on WhatsApp /menu)
 *  default           → original themed dark card (home bestsellers etc.)
 */
function ProductCard({ product, variant }) {
  const { addItem } = useCart();
  const { showToast } = useToast();

  const handleAdd = (e) => {
    e.stopPropagation();
    addItem(product);
    showToast(`${product.name} added!`, 'Check your cart', 'success');
  };

  const hasImage = product.image && product.image.length > 5 &&
    (product.image.startsWith('http') || product.image.startsWith('data:'));
  const isEmojiStr = product.image && product.image.length <= 4 && !product.image.startsWith('data:');
  const hasDiscount = product.compare_price && Number(product.compare_price) > Number(product.price);
  const discountPct = hasDiscount
    ? Math.round((1 - Number(product.price) / Number(product.compare_price)) * 100)
    : 0;
  const isOutOfStock = Number(product.stock) === 0;

  /* ── Shopify-style white card (matches reference UI) ── */
  if (variant === 'shopify') {
    return (
      <div style={{
        background: 'transparent',
        borderRadius: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        opacity: isOutOfStock ? 0.7 : 1,
      }}>
        {/* Image */}
        <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', background: '#f0f0f0', overflow: 'hidden', borderRadius: 6 }}>
          {hasImage
            ? <img src={product.image} alt={product.name} loading="lazy" decoding="async"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            : isEmojiStr || product.emoji
              ? <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3.5rem' }}>{product.image || product.emoji}</div>
              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Drumstick size={52} color="#fca5a5" /></div>
          }
          {/* Badges overlay */}
          <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {isOutOfStock && (
              <span style={{ background: '#111', color: '#fff', fontSize: '0.65rem', fontWeight: 800, padding: '3px 8px', borderRadius: 3, textTransform: 'uppercase' }}>Sold Out</span>
            )}
            {hasDiscount && !isOutOfStock && (
              <span style={{ background: '#c0201f', color: '#fff', fontSize: '0.65rem', fontWeight: 800, padding: '3px 8px', borderRadius: 3 }}>{discountPct}% OFF</span>
            )}
            {product.badge && !isOutOfStock && !hasDiscount && (
              <span style={{ background: '#c0201f', color: '#fff', fontSize: '0.65rem', fontWeight: 800, padding: '3px 8px', borderRadius: 3, textTransform: 'capitalize' }}>{product.badge}</span>
            )}
          </div>
        </div>

        {/* Info */}
        <div style={{ padding: '10px 4px 14px', display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={{ fontWeight: 500, fontSize: '0.92rem', color: '#111', marginBottom: 4, lineHeight: 1.35 }}>{product.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontWeight: 700, fontSize: '1rem', color: '#111' }}>{fmt(product.price)}</span>
            {hasDiscount && (
              <span style={{ textDecoration: 'line-through', color: '#aaa', fontSize: '0.82rem' }}>{fmt(product.compare_price)}</span>
            )}
          </div>
          {/* Full-width Add to Cart button */}
          <button
            onClick={isOutOfStock ? undefined : handleAdd}
            disabled={isOutOfStock}
            aria-label={isOutOfStock ? `${product.name} is out of stock` : `Add ${product.name} to cart`}
            style={{
              width: '100%',
              padding: '11px 0',
              borderRadius: 6,
              background: isOutOfStock ? '#ccc' : '#c0201f',
              color: '#fff',
              border: 'none',
              fontWeight: 700,
              fontSize: '0.88rem',
              cursor: isOutOfStock ? 'not-allowed' : 'pointer',
              letterSpacing: '0.01em',
              transition: 'background 0.15s',
              marginTop: 'auto'
            }}
            onMouseEnter={e => { if (!isOutOfStock) e.currentTarget.style.background = '#a01818'; }}
            onMouseLeave={e => { if (!isOutOfStock) e.currentTarget.style.background = '#c0201f'; }}
          >
            {isOutOfStock ? 'Out of Stock' : 'Add to Cart'}
          </button>
        </div>
      </div>
    );
  }

  /* ── Compact 2-col menu card (WhatsApp /menu) ── */
  if (variant === 'menu') {
    return (
      <div className="product-card" style={isOutOfStock ? { opacity: 0.65, filter: 'grayscale(0.3)' } : {}}>
        {(product.badge || hasDiscount || isOutOfStock) && (
          <div className="product-badges">
            {isOutOfStock && <div className="product-badge out-of-stock">Out of Stock</div>}
            {product.badge && !isOutOfStock && <div className={`product-badge ${product.badge}`}>{product.badge}</div>}
            {hasDiscount && <div className="product-badge off">{discountPct}% OFF</div>}
          </div>
        )}
        <div className="product-img" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {hasImage ? <img src={product.image} alt={product.name} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : isEmojiStr || product.emoji ? <div>{product.image || product.emoji}</div>
            : <Drumstick size={48} color="#fca5a5" />}
        </div>
        <div className="product-info">
          <div className="product-name">{product.name}</div>
          <div className="product-desc-text">{product.shortDesc || product.desc}</div>
          <div className="product-footer">
            <div>
              {hasDiscount ? (
                <>
                  <span className="product-price">{fmt(product.price)}</span>
                  <div style={{ textDecoration: 'line-through', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 500, marginTop: 1 }}>{fmt(product.compare_price)}</div>
                </>
              ) : (
                <div className="product-price">{fmt(product.price)}{product.category === 'combo' && <small>combo deal</small>}</div>
              )}
            </div>
            <button className="add-cart-btn" onClick={isOutOfStock ? undefined : handleAdd} disabled={isOutOfStock}
              aria-label={isOutOfStock ? `${product.name} is out of stock` : `Add ${product.name} to cart`}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isOutOfStock ? 0.4 : 1, cursor: isOutOfStock ? 'not-allowed' : 'pointer' }}>
              <Plus size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Default themed card (home, etc.) ── */
  return (
    <div className="product-card" style={isOutOfStock ? { opacity: 0.65, filter: 'grayscale(0.3)' } : {}}>
      {(product.badge || hasDiscount || isOutOfStock) && (
        <div className="product-badges">
          {isOutOfStock && <div className="product-badge out-of-stock">Out of Stock</div>}
          {product.badge && !isOutOfStock && <div className={`product-badge ${product.badge}`}>{product.badge}</div>}
          {hasDiscount && <div className="product-badge off">{discountPct}% OFF</div>}
        </div>
      )}
      <div className="product-img" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {hasImage ? <img src={product.image} alt={product.name} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : isEmojiStr || product.emoji ? <div>{product.image || product.emoji}</div>
          : <Drumstick size={64} color="#fca5a5" />}
      </div>
      <div className="product-info">
        <div className="product-name">{product.name}</div>
        <div className="product-desc-text">{product.shortDesc || product.desc}</div>
        <div className="product-footer">
          <div>
            {hasDiscount ? (
              <>
                <span className="product-price">{fmt(product.price)}</span>
                <div style={{ textDecoration: 'line-through', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 500, marginTop: 1 }}>{fmt(product.compare_price)}</div>
              </>
            ) : (
              <div className="product-price">{fmt(product.price)}{product.category === 'combo' && <small>combo deal</small>}</div>
            )}
          </div>
          <button className="add-cart-btn" onClick={isOutOfStock ? undefined : handleAdd} disabled={isOutOfStock}
            aria-label={isOutOfStock ? `${product.name} is out of stock` : `Add ${product.name} to cart`}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isOutOfStock ? 0.4 : 1, cursor: isOutOfStock ? 'not-allowed' : 'pointer' }}>
            <Plus size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default React.memo(ProductCard);
