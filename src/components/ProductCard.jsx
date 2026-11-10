import React, { useState } from 'react';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { Drumstick, Plus, Clock, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { getCutoffState } from '../lib/deliveryCutoff';
import { getPreorderState } from '../lib/preorderUtils';
import { formatVariantOrderItemName } from '../lib/productVariants';
import SameDayCutoffModal from './SameDayCutoffModal';

const fmt = (n) => '₦' + Number(n).toLocaleString();

/** variant="shopify" → clean white Shopify-style card (used on /shop and /menu)
 *  variant="menu"    → compact 2-col card
 *  default           → original themed dark card (home bestsellers etc.)
 */
function ProductCard({ product, variant }) {
  const { addItem } = useCart();
  const { showToast } = useToast();
  const [showCutoffModal, setShowCutoffModal] = useState(false);

  const hasVariants = Boolean(
    product.is_parent_group && Array.isArray(product.variants) && product.variants.length > 0
  );
  const [selectedVariantId, setSelectedVariantId] = useState(() => {
    if (!hasVariants) return null;
    return product.variants.length === 1 ? product.variants[0].id : null;
  });
  const [showVariantSwatches, setShowVariantSwatches] = useState(false);
  const [variantError, setVariantError] = useState(false);

  const selectedVariant = hasVariants
    ? product.variants.find((v) => String(v.id) === String(selectedVariantId)) || null
    : null;

  const activeProduct = selectedVariant || product;

  const cutoff = getCutoffState(activeProduct);
  const preorder = getPreorderState(activeProduct);

  const allVariantsInactive = hasVariants
    ? product.variants.every((v) => v.is_active === false)
    : false;

  const isSelectedVariantOutOfStock = selectedVariant
    ? selectedVariant.is_active === false
    : false;

  const isOutOfStock =
    allVariantsInactive ||
    isSelectedVariantOutOfStock ||
    (!hasVariants && product.is_active === false) ||
    (preorder.isPreorderEnabled && !preorder.isPreorderActive);

  const buildCartPayload = (extra = {}) => {
    if (hasVariants && selectedVariant) {
      return {
        ...selectedVariant,
        id: selectedVariant.id,
        product_id: selectedVariant.id,
        variant_id: selectedVariant.id,
        sku: selectedVariant.sku,
        parent_group_key: product.parent_group_key,
        parent_name: product.parent_name || product.name,
        variant_label: selectedVariant.variant_label,
        original_name: selectedVariant.original_name || selectedVariant.name,
        name: formatVariantOrderItemName(
          product.parent_name || product.name,
          selectedVariant.variant_label,
          selectedVariant.name
        ),
        price: Number(selectedVariant.price),
        ...extra,
      };
    }
    return { ...product, ...extra };
  };

  const handleSelectVariant = (e, v) => {
    if (e && e.stopPropagation) e.stopPropagation();
    setSelectedVariantId(v.id);
    setVariantError(false);
  };

  const handleAdd = (e) => {
    if (e && e.stopPropagation) e.stopPropagation();

    // Step 1: If product has variants and options are currently collapsed, expand them and select the 1st variant!
    if (hasVariants && !showVariantSwatches) {
      setShowVariantSwatches(true);
      if (!selectedVariantId && product.variants.length > 0) {
        setSelectedVariantId(product.variants[0].id);
      }
      return;
    }

    // Step 2: If options are expanded but user hasn't selected an option yet, prompt them
    if (hasVariants && !selectedVariant) {
      setVariantError(true);
      showToast(
        'Select an option',
        `Please select a ${product.name} option before adding to cart.`,
        'error'
      );
      return;
    }
    if (isOutOfStock) return;
    const itemToAdd = buildCartPayload();
    if (preorder.isPreorderEnabled) {
      if (!preorder.isPreorderActive) return;
      addItem({ ...itemToAdd, is_preorder: true });
      showToast(
        `${itemToAdd.name} pre-ordered!`,
        preorder.formattedReleaseDate ? `Available from ${preorder.formattedReleaseDate}` : 'Check your cart',
        'success'
      );
      return;
    }
    if (cutoff.hasCutoff) {
      setShowCutoffModal(true);
      return;
    }
    addItem(itemToAdd);
    showToast(`${itemToAdd.name} added!`, 'Check your cart', 'success');
  };

  const handleOpenDetails = (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    setShowCutoffModal(true);
  };

  const handleConfirmCutoff = () => {
    setShowCutoffModal(false);
    if (hasVariants && !selectedVariant) {
      setVariantError(true);
      return;
    }
    const itemToAdd = buildCartPayload();
    if (preorder.isPreorderEnabled) {
      if (!preorder.isPreorderActive) return;
      addItem({ ...itemToAdd, is_preorder: true });
      showToast(
        `${itemToAdd.name} pre-ordered!`,
        preorder.formattedReleaseDate ? `Available from ${preorder.formattedReleaseDate}` : 'Check your cart',
        'success'
      );
      return;
    }
    addItem(itemToAdd);
    showToast(`${itemToAdd.name} added!`, 'Check your cart', 'success');
  };

  const displayImage = activeProduct.image || product.image;
  const hasImage =
    displayImage &&
    displayImage.length > 5 &&
    (displayImage.startsWith('http') || displayImage.startsWith('data:') || displayImage.startsWith('/'));
  const isEmojiStr = displayImage && displayImage.length <= 4 && !displayImage.startsWith('data:') && !displayImage.startsWith('/');
  const hasDiscount =
    activeProduct.compare_price && Number(activeProduct.compare_price) > Number(activeProduct.price);
  const discountPct = hasDiscount
    ? Math.round((1 - Number(activeProduct.price) / Number(activeProduct.compare_price)) * 100)
    : 0;

  const displayPriceText = (() => {
    if (hasVariants && !selectedVariant && product.has_price_range) {
      return `${fmt(product.min_price)} – ${fmt(product.max_price)}`;
    }
    return fmt(activeProduct.price);
  })();

  const ctaText = isOutOfStock
    ? 'Out of Stock'
    : preorder.isPreorderEnabled
      ? preorder.ctaLabel
      : hasVariants && showVariantSwatches && !selectedVariant
        ? 'Select an Option'
        : 'Add to Cart';

  const renderVariantCountPill = () => {
    if (!hasVariants) return null;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShowVariantSwatches((prev) => {
            const next = !prev;
            if (next && !selectedVariantId && product.variants.length > 0) {
              setSelectedVariantId(product.variants[0].id);
            }
            return next;
          });
        }}
        aria-label={`Toggle ${product.variants.length} options for ${product.name}`}
        style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          zIndex: 2,
          background: '#ffffff',
          color: '#18181b',
          borderRadius: 999,
          padding: '6px 13px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: '0.86rem',
          fontWeight: 700,
          border: 'none',
          boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
          cursor: 'pointer',
          lineHeight: 1,
        }}
      >
        <ChevronDown size={14} strokeWidth={2.6} color="#18181b" />
        <span>{product.variants.length}</span>
      </button>
    );
  };

  const renderVariantSelector = (theme = 'light') => {
    if (!hasVariants || !showVariantSwatches) return null;
    const isDark = theme === 'dark';
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          marginTop: 6,
          marginBottom: 8,
          transition: 'all 0.15s ease',
        }}
      >
        <div
          role="radiogroup"
          aria-label={`${product.name} options`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            overflowX: 'auto',
            paddingBottom: 2,
          }}
        >
          {product.variants.map((v) => {
            const isSelected = String(selectedVariantId) === String(v.id);
            const vOut = v.is_active === false;
            const vImg = v.image || product.image;
            const vHasImg =
              vImg &&
              vImg.length > 5 &&
              (vImg.startsWith('http') || vImg.startsWith('data:') || vImg.startsWith('/'));

            return (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                title={`${v.variant_label} — ${fmt(v.price)}`}
                onClick={(e) => handleSelectVariant(e, v)}
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: 14,
                  padding: 2,
                  border: isSelected
                    ? '2px solid #c0201f'
                    : isDark
                      ? '1.5px solid rgba(255,255,255,0.25)'
                      : '1.5px solid #e4e4e7',
                  background: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  opacity: vOut && !isSelected ? 0.55 : 1,
                  transition: 'all 0.15s ease',
                  flexShrink: 0,
                  outline: 'none',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: 10,
                    overflow: 'hidden',
                    background: '#f4f4f5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {vHasImg ? (
                    <img
                      src={vImg}
                      alt={v.variant_label}
                      loading="lazy"
                      decoding="async"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                      }}
                    />
                  ) : (
                    <Drumstick size={24} color="#fca5a5" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  /* ── Shopify-style white card (matches reference UI) ── */
  if (variant === 'shopify') {
    return (
      <>
        <div
          style={{
            background: 'transparent',
            borderRadius: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            opacity: isOutOfStock ? 0.72 : 1,
          }}
        >
          {/* Image */}
          <div
            onClick={preorder.isPreorderEnabled ? handleOpenDetails : undefined}
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '1 / 1',
              background: '#f0f0f0',
              overflow: 'hidden',
              borderRadius: 24,
              cursor: preorder.isPreorderEnabled ? 'pointer' : 'default',
              border: preorder.isPreorderActive ? '2px solid #f59e0b' : 'none',
            }}
          >
            {hasImage ? (
              <img
                src={displayImage}
                alt={activeProduct.name}
                loading="lazy"
                decoding="async"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            ) : isEmojiStr || activeProduct.emoji ? (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '3.5rem',
                }}
              >
                {displayImage || activeProduct.emoji}
              </div>
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Drumstick size={52} color="#fca5a5" />
              </div>
            )}
            {renderVariantCountPill()}
            {/* Badges overlay */}
            <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {isOutOfStock && (
                <span
                  style={{
                    background: '#111',
                    color: '#fff',
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    padding: '3px 8px',
                    borderRadius: 3,
                    textTransform: 'uppercase',
                  }}
                >
                  Sold Out
                </span>
              )}
              {preorder.isPreorderEnabled && !isOutOfStock && (
                <span
                  style={{
                    background: preorder.isPreorderActive ? '#b45309' : '#374151',
                    color: '#fff',
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    padding: '3px 8px',
                    borderRadius: 3,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  {preorder.badgeLabel || 'PRE-ORDER'}
                </span>
              )}
              {hasDiscount && !isOutOfStock && (
                <span
                  style={{
                    background: '#c0201f',
                    color: '#fff',
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    padding: '3px 8px',
                    borderRadius: 3,
                  }}
                >
                  {discountPct}% OFF
                </span>
              )}
              {activeProduct.badge && !isOutOfStock && !hasDiscount && !preorder.isPreorderEnabled && (
                <span
                  style={{
                    background: '#c0201f',
                    color: '#fff',
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    padding: '3px 8px',
                    borderRadius: 3,
                    textTransform: 'capitalize',
                  }}
                >
                  {activeProduct.badge}
                </span>
              )}
            </div>
          </div>

          {/* Info */}
          <div style={{ padding: '8px 2px 14px', display: 'flex', flexDirection: 'column', flex: 1 }}>
            {hasVariants ? (
              <>
                {renderVariantSelector('light')}
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: showVariantSwatches && selectedVariant ? '0.94rem' : '1.05rem',
                    color: showVariantSwatches && selectedVariant ? '#c0201f' : '#27272a',
                    marginTop: showVariantSwatches ? 2 : 6,
                    lineHeight: 1.3,
                  }}
                >
                  {showVariantSwatches && selectedVariant ? selectedVariant.variant_label : product.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 12 }}>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: showVariantSwatches && selectedVariant ? '1.42rem' : '1.25rem',
                      color: '#18181b',
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {displayPriceText}
                  </span>
                  {hasDiscount && (
                    <span style={{ textDecoration: 'line-through', color: '#a1a1aa', fontSize: '0.85rem' }}>
                      {fmt(activeProduct.compare_price)}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 600, fontSize: '1.05rem', color: '#27272a', marginTop: 6, marginBottom: 4, lineHeight: 1.35 }}>
                  {product.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ fontWeight: 700, fontSize: '1.25rem', color: '#18181b', letterSpacing: '-0.02em' }}>
                    {displayPriceText}
                  </span>
                  {hasDiscount && (
                    <span style={{ textDecoration: 'line-through', color: '#a1a1aa', fontSize: '0.85rem' }}>
                      {fmt(activeProduct.compare_price)}
                    </span>
                  )}
                </div>
              </>
            )}

            {preorder.isPreorderEnabled && (
              <div
                onClick={handleOpenDetails}
                style={{
                  fontSize: '0.73rem',
                  color: '#78350f',
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: 6,
                  padding: '6px 8px',
                  marginBottom: 10,
                  lineHeight: 1.35,
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Calendar size={12} color="#b45309" style={{ flexShrink: 0 }} />
                  <span>Available from {preorder.formattedReleaseDate || preorder.releaseDate}</span>
                </div>
                {preorder.customerMessage && (
                  <div style={{ marginTop: 3, color: '#92400e', fontWeight: 500 }}>{preorder.customerMessage}</div>
                )}
                <div
                  style={{
                    marginTop: 3,
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    color: '#b45309',
                    textDecoration: 'underline',
                  }}
                >
                  Pre-order & delivery details →
                </div>
              </div>
            )}
            {/* Full-width CTA button */}
            <button
              type="button"
              onClick={isOutOfStock ? undefined : handleAdd}
              disabled={isOutOfStock}
              aria-label={
                isOutOfStock
                  ? `${activeProduct.name} is unavailable`
                  : `Add to Cart ${activeProduct.name}`
              }
              style={{
                width: '100%',
                padding: '13px 0',
                borderRadius: 14,
                background: isOutOfStock
                  ? '#ccc'
                  : preorder.isPreorderActive
                    ? '#b45309'
                    : '#c0201f',
                color: '#fff',
                border: 'none',
                fontWeight: 600,
                fontSize: '0.96rem',
                cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                letterSpacing: '0.01em',
                transition: 'background 0.15s',
                marginTop: 'auto',
              }}
            >
              {isOutOfStock ? 'Out of Stock' : preorder.isPreorderEnabled ? preorder.ctaLabel : 'Add to Cart'}
            </button>
          </div>
        </div>
        <SameDayCutoffModal
          isOpen={showCutoffModal}
          product={activeProduct}
          mode={preorder.isPreorderEnabled ? 'preorder' : undefined}
          onConfirm={handleConfirmCutoff}
          onClose={() => setShowCutoffModal(false)}
        />
      </>
    );
  }

  /* ── Compact 2-col menu card (WhatsApp /menu) ── */
  if (variant === 'menu') {
    return (
      <>
        <div
          className="product-card"
          style={{
            ...(isOutOfStock ? { opacity: 0.65, filter: 'grayscale(0.3)' } : {}),
            ...(preorder.isPreorderActive ? { border: '1.5px solid #f59e0b' } : {}),
          }}
        >
          {(activeProduct.badge || hasDiscount || isOutOfStock || preorder.isPreorderEnabled) && (
            <div className="product-badges">
              {isOutOfStock && <div className="product-badge out-of-stock">Out of Stock</div>}
              {preorder.isPreorderEnabled && !isOutOfStock && (
                <div
                  className="product-badge"
                  style={{ background: preorder.isPreorderActive ? '#b45309' : '#374151', color: '#fff' }}
                >
                  {preorder.badgeLabel || 'PRE-ORDER'}
                </div>
              )}
              {activeProduct.badge && !isOutOfStock && !preorder.isPreorderEnabled && (
                <div className={`product-badge ${activeProduct.badge}`}>{activeProduct.badge}</div>
              )}
              {hasDiscount && <div className="product-badge off">{discountPct}% OFF</div>}
            </div>
          )}
          <div
            className="product-img"
            onClick={preorder.isPreorderEnabled ? handleOpenDetails : undefined}
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              cursor: preorder.isPreorderEnabled ? 'pointer' : 'default',
            }}
          >
            {hasImage ? (
              <img
                src={displayImage}
                alt={activeProduct.name}
                loading="lazy"
                decoding="async"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : isEmojiStr || activeProduct.emoji ? (
              <div>{displayImage || activeProduct.emoji}</div>
            ) : (
              <Drumstick size={48} color="#fca5a5" />
            )}
            {renderVariantCountPill()}
          </div>
          <div className="product-info">
            {hasVariants ? (
              <>
                {renderVariantSelector('dark')}
                <div
                  className="product-name"
                  style={{
                    marginTop: showVariantSwatches ? 2 : 4,
                    color: showVariantSwatches && selectedVariant ? '#ef4444' : undefined,
                    fontWeight: 600,
                  }}
                >
                  {showVariantSwatches && selectedVariant ? selectedVariant.variant_label : product.name}
                </div>
                <div className="product-price" style={{ marginTop: 2, marginBottom: 6 }}>
                  {displayPriceText}
                </div>
              </>
            ) : (
              <>
                <div className="product-name">{product.name}</div>
                <div className="product-desc-text">{product.shortDesc || product.short_desc || product.desc}</div>
              </>
            )}
            {preorder.isPreorderEnabled && (
              <div
                onClick={handleOpenDetails}
                style={{
                  fontSize: '0.7rem',
                  color: '#92400e',
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: 6,
                  padding: '4px 6px',
                  fontWeight: 700,
                  marginTop: 4,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Calendar size={11} color="#b45309" style={{ flexShrink: 0 }} />
                  <span>Available from {preorder.formattedReleaseDate || preorder.releaseDate}</span>
                </div>
                {preorder.customerMessage && (
                  <div style={{ fontWeight: 500, marginTop: 2 }}>{preorder.customerMessage}</div>
                )}
              </div>
            )}
            {!preorder.isPreorderEnabled && cutoff.hasCutoff && (
              <div
                style={{
                  fontSize: '0.7rem',
                  color: '#92400e',
                  fontWeight: 600,
                  marginTop: 4,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Clock size={12} color="#92400e" style={{ flexShrink: 0 }} /> Orders for this product stop by{' '}
                {cutoff.cutoffLabel} for same day delivery
              </div>
            )}
            {hasVariants ? (
              <button
                type="button"
                onClick={isOutOfStock ? undefined : handleAdd}
                disabled={isOutOfStock}
                aria-label={`Add to Cart ${activeProduct.name}`}
                style={{
                  width: '100%',
                  padding: '11px 0',
                  borderRadius: 12,
                  background: isOutOfStock
                    ? '#9ca3af'
                    : preorder.isPreorderActive
                      ? '#b45309'
                      : '#c0201f',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                  marginTop: 'auto',
                }}
              >
                {isOutOfStock ? 'Out of Stock' : preorder.isPreorderEnabled ? preorder.ctaLabel : 'Add to Cart'}
              </button>
            ) : (
              <div className="product-footer">
                <div>
                  {hasDiscount ? (
                    <>
                      <span className="product-price">{displayPriceText}</span>
                      <div
                        style={{
                          textDecoration: 'line-through',
                          color: 'var(--text-muted)',
                          fontSize: '0.8rem',
                          fontWeight: 500,
                          marginTop: 1,
                        }}
                      >
                        {fmt(activeProduct.compare_price)}
                      </div>
                    </>
                  ) : (
                    <div className="product-price">
                      {displayPriceText}
                      {product.category === 'combo' && <small>combo deal</small>}
                    </div>
                  )}
                </div>
                {preorder.isPreorderEnabled ? (
                  <button
                    type="button"
                    onClick={isOutOfStock ? undefined : handleAdd}
                    disabled={isOutOfStock}
                    aria-label={`${ctaText} ${activeProduct.name}`}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 8,
                      background: isOutOfStock ? '#9ca3af' : '#b45309',
                      color: '#fff',
                      border: 'none',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {ctaText}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="add-cart-btn"
                    onClick={isOutOfStock ? undefined : handleAdd}
                    disabled={isOutOfStock}
                    aria-label={isOutOfStock ? `${activeProduct.name} is out of stock` : `Add ${activeProduct.name} to cart`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: isOutOfStock ? 0.4 : 1,
                      cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <Plus size={16} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <SameDayCutoffModal
          isOpen={showCutoffModal}
          product={activeProduct}
          mode={preorder.isPreorderEnabled ? 'preorder' : undefined}
          onConfirm={handleConfirmCutoff}
          onClose={() => setShowCutoffModal(false)}
        />
      </>
    );
  }

  /* ── Default themed card (home, etc.) ── */
  return (
    <>
      <div
        className="product-card"
        style={{
          ...(isOutOfStock ? { opacity: 0.65, filter: 'grayscale(0.3)' } : {}),
          ...(preorder.isPreorderActive ? { border: '1.5px solid #f59e0b' } : {}),
        }}
      >
        {(activeProduct.badge || hasDiscount || isOutOfStock || preorder.isPreorderEnabled) && (
          <div className="product-badges">
            {isOutOfStock && <div className="product-badge out-of-stock">Out of Stock</div>}
            {preorder.isPreorderEnabled && !isOutOfStock && (
              <div
                className="product-badge"
                style={{ background: preorder.isPreorderActive ? '#b45309' : '#374151', color: '#fff' }}
              >
                {preorder.badgeLabel || 'PRE-ORDER'}
              </div>
            )}
            {activeProduct.badge && !isOutOfStock && !preorder.isPreorderEnabled && (
              <div className={`product-badge ${activeProduct.badge}`}>{activeProduct.badge}</div>
            )}
            {hasDiscount && <div className="product-badge off">{discountPct}% OFF</div>}
          </div>
        )}
        <div
          className="product-img"
          onClick={preorder.isPreorderEnabled ? handleOpenDetails : undefined}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            cursor: preorder.isPreorderEnabled ? 'pointer' : 'default',
          }}
        >
          {hasImage ? (
            <img
              src={displayImage}
              alt={activeProduct.name}
              loading="lazy"
              decoding="async"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : isEmojiStr || activeProduct.emoji ? (
            <div>{displayImage || activeProduct.emoji}</div>
          ) : (
            <Drumstick size={64} color="#fca5a5" />
          )}
          {renderVariantCountPill()}
        </div>
        <div className="product-info">
          {hasVariants ? (
            <>
              {renderVariantSelector('dark')}
              <div
                className="product-name"
                style={{
                  marginTop: showVariantSwatches ? 2 : 4,
                  color: showVariantSwatches && selectedVariant ? '#ef4444' : undefined,
                  fontWeight: 600,
                }}
              >
                {showVariantSwatches && selectedVariant ? selectedVariant.variant_label : product.name}
              </div>
              <div className="product-price" style={{ marginTop: 2, marginBottom: 6 }}>
                {displayPriceText}
              </div>
            </>
          ) : (
            <>
              <div className="product-name">{product.name}</div>
              <div className="product-desc-text">{product.shortDesc || product.short_desc || product.desc}</div>
            </>
          )}
          {preorder.isPreorderEnabled && (
            <div
              onClick={handleOpenDetails}
              style={{
                fontSize: '0.72rem',
                color: '#92400e',
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: 6,
                padding: '5px 8px',
                fontWeight: 700,
                marginTop: 6,
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Calendar size={12} color="#b45309" style={{ flexShrink: 0 }} />
                <span>Available from {preorder.formattedReleaseDate || preorder.releaseDate}</span>
              </div>
              {preorder.customerMessage && (
                <div style={{ fontWeight: 500, marginTop: 2 }}>{preorder.customerMessage}</div>
              )}
            </div>
          )}
          {!preorder.isPreorderEnabled && cutoff.hasCutoff && (
            <div
              style={{
                fontSize: '0.7rem',
                color: '#92400e',
                fontWeight: 600,
                marginTop: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Clock size={12} color="#92400e" style={{ flexShrink: 0 }} /> Orders for this product stop by{' '}
              {cutoff.cutoffLabel} for same day delivery
            </div>
          )}
          {hasVariants ? (
            <button
              type="button"
              onClick={isOutOfStock ? undefined : handleAdd}
              disabled={isOutOfStock}
              aria-label={`Add to Cart ${activeProduct.name}`}
              style={{
                width: '100%',
                padding: '11px 0',
                borderRadius: 12,
                background: isOutOfStock
                  ? '#9ca3af'
                  : preorder.isPreorderActive
                    ? '#b45309'
                    : '#c0201f',
                color: '#fff',
                border: 'none',
                fontWeight: 600,
                fontSize: '0.88rem',
                cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                marginTop: 'auto',
              }}
            >
              {isOutOfStock ? 'Out of Stock' : preorder.isPreorderEnabled ? preorder.ctaLabel : 'Add to Cart'}
            </button>
          ) : (
            <div className="product-footer">
              <div>
                {hasDiscount ? (
                  <>
                    <span className="product-price">{displayPriceText}</span>
                    <div
                      style={{
                        textDecoration: 'line-through',
                        color: 'var(--text-muted)',
                        fontSize: '0.8rem',
                        fontWeight: 500,
                        marginTop: 1,
                      }}
                    >
                      {fmt(activeProduct.compare_price)}
                    </div>
                  </>
                ) : (
                  <div className="product-price">
                    {displayPriceText}
                    {product.category === 'combo' && <small>combo deal</small>}
                  </div>
                )}
              </div>
              {preorder.isPreorderEnabled ? (
                <button
                  type="button"
                  onClick={isOutOfStock ? undefined : handleAdd}
                  disabled={isOutOfStock}
                  aria-label={`${ctaText} ${activeProduct.name}`}
                  style={{
                    padding: '7px 12px',
                    borderRadius: 8,
                    background: isOutOfStock ? '#9ca3af' : '#b45309',
                    color: '#fff',
                    border: 'none',
                    fontSize: '0.76rem',
                    fontWeight: 800,
                    cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {ctaText}
                </button>
              ) : (
                <button
                  type="button"
                  className="add-cart-btn"
                  onClick={isOutOfStock ? undefined : handleAdd}
                  disabled={isOutOfStock}
                  aria-label={isOutOfStock ? `${activeProduct.name} is out of stock` : `Add ${activeProduct.name} to cart`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: isOutOfStock ? 0.4 : 1,
                    cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                  }}
                >
                  <Plus size={16} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <SameDayCutoffModal
        isOpen={showCutoffModal}
        product={activeProduct}
        mode={preorder.isPreorderEnabled ? 'preorder' : undefined}
        onConfirm={handleConfirmCutoff}
        onClose={() => setShowCutoffModal(false)}
      />
    </>
  );
}

export default React.memo(ProductCard);
