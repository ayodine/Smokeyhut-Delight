import React from 'react';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { Drumstick, Plus } from 'lucide-react';

function ProductCard({ product }) {
  const { addItem } = useCart();
  const { showToast } = useToast();

  const fmt = (n) => '₦' + n.toLocaleString();

  const handleAdd = (e) => {
    e.stopPropagation();
    addItem(product);
    showToast(`${product.name} added!`, 'Check your cart', 'success');
  };

  const hasImage = product.image && product.image.length > 5 && !product.image.startsWith('data:') && product.image.startsWith('http') || product.image?.startsWith('data:');
  const isEmojiStr = product.image && product.image.length <= 4 && !product.image.startsWith('data:');

  const hasDiscount = product.compare_price && Number(product.compare_price) > Number(product.price);
  const discountPct = hasDiscount
    ? Math.round((1 - Number(product.price) / Number(product.compare_price)) * 100)
    : 0;

  return (
    <div className="product-card">
      {(product.badge || hasDiscount || Number(product.stock) === 0) && (
        <div className="product-badges">
          {Number(product.stock) === 0 && <div className="product-badge out-of-stock">Out of Stock</div>}
          {product.badge && Number(product.stock) !== 0 && <div className={`product-badge ${product.badge}`}>{product.badge}</div>}
          {hasDiscount && <div className="product-badge off">{discountPct}% OFF</div>}
        </div>
      )}
      <div className="product-img" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {hasImage ? (
           <img src={product.image} alt={product.name} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : isEmojiStr || product.emoji ? (
           <div>{product.image || product.emoji}</div>
        ) : (
           <Drumstick size={64} color="#fca5a5" />
        )}
      </div>
      <div className="product-info">
        <div className="product-name">{product.name}</div>
        <div className="product-desc-text">{product.shortDesc || product.desc}</div>
        <div className="product-footer">
          <div>
            {hasDiscount ? (
              <>
                <span className="product-price">{fmt(product.price)}</span>
                <div style={{ textDecoration: 'line-through', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 500, marginTop: 1 }}>
                  {fmt(product.compare_price)}
                </div>
              </>
            ) : (
              <div className="product-price">
                {fmt(product.price)}
                {product.category === 'combo' && <small>combo deal</small>}
              </div>
            )}
          </div>
          <button className="add-cart-btn" onClick={handleAdd} aria-label={`Add ${product.name} to cart`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={16} /></button>
        </div>
      </div>
    </div>
  );
}

export default React.memo(ProductCard);
