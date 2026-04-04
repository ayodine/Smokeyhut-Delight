import React from 'react';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { Drumstick, Plus } from 'lucide-react';

export default function ProductCard({ product }) {
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

  return (
    <div className="product-card">
      {product.badge && (
        <div className={`product-badge ${product.badge}`}>{product.badge}</div>
      )}
      <div className="product-img" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {hasImage ? (
           <img src={product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
          <div className="product-price">
            {fmt(product.price)}
            {product.category === 'combo' && <small>combo deal</small>}
          </div>
          <button className="add-cart-btn" onClick={handleAdd} aria-label={`Add ${product.name} to cart`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={16} /></button>
        </div>
      </div>
    </div>
  );
}
