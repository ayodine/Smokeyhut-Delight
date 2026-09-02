import React from 'react';
import { useCart } from '../context/CartContext';
import { Gift, CheckCircle2, Flame, Truck } from 'lucide-react';

export default function PromoProgressBanner({ variant = 'full', style = {} }) {
  const { promoOffer, promoEvaluation, promoRewardItem } = useCart();

  if (!promoOffer || !promoEvaluation) return null;

  const {
    qualifies,
    currentQty,
    requiredQty,
    remainingQtyNeeded,
    progressPercent,
    isQuotaExhausted,
    remainingToday,
  } = promoEvaluation;

  const isMinAmount = promoOffer.qualifying_type === 'min_amount';
  const isBirdCount = promoOffer.qualifying_type === 'guinea_fowl_birds';
  const isFreeDelivery = promoOffer.reward_type === 'free_delivery';
  const rewardName = promoOffer.reward_product_name || (isFreeDelivery ? 'Free Delivery' : 'Free Guinea Fowl');
  const rewardQty = Number(promoOffer.reward_qty) || 1;

  // Human-friendly reward label: "Free Delivery" vs "1× Free Guinea Fowl"
  const rewardLabel = isFreeDelivery ? rewardName : `${rewardQty}× ${rewardName}`;
  // Chip label (top-right): "Free Delivery" vs "1× FREE Guinea Fowl"
  const chipLabel = isFreeDelivery ? rewardName : `${rewardQty}× FREE ${rewardName}`;

  const progressText = isMinAmount
    ? `₦${Number(currentQty || 0).toLocaleString()} / ₦${Number(requiredQty || 0).toLocaleString()}`
    : `${currentQty} / ${requiredQty} ${isBirdCount ? 'Guinea Fowls' : 'items'}`;

  const RewardIcon = isFreeDelivery ? Truck : Gift;

  // ── Quota Exhausted ──────────────────────────────────────────
  if (isQuotaExhausted && !qualifies) {
    if (variant === 'compact') return null;
    return (
      <div className="promo-banner promo-banner--exhausted" style={style}>
        <div className="promo-banner__icon promo-banner__icon--red">
          <Flame size={16} />
        </div>
        <span className="promo-banner__exhausted-text">
          Today's <strong>{promoOffer.title}</strong> slots are all claimed. Check back tomorrow!
        </span>
      </div>
    );
  }

  // ── Unlocked ─────────────────────────────────────────────────
  if (qualifies && promoRewardItem) {
    if (variant === 'compact') {
      return (
        <div className="promo-banner promo-banner--unlocked-compact" style={style}>
          <RewardIcon size={14} color="#16a34a" />
          <span>{isFreeDelivery ? `${rewardName} unlocked!` : `${rewardQty}× ${rewardName} unlocked!`}</span>
          <span className="promo-badge promo-badge--green">FREE</span>
        </div>
      );
    }

    return (
      <div className="promo-banner promo-banner--unlocked" style={style}>
        <div className="promo-banner__unlocked-left">
          <div className="promo-banner__icon promo-banner__icon--green">
            <RewardIcon size={20} />
          </div>
          <div>
            <div className="promo-banner__title promo-banner__title--green">
              Daily Reward Unlocked
              <span className="promo-badge promo-badge--green">FREE</span>
            </div>
            <p className="promo-banner__sub promo-banner__sub--green">
              {isFreeDelivery
                ? <><strong>{rewardName}</strong> applied to your order!</>
                : <><strong>{rewardQty}× {rewardName}</strong> automatically added to your order!</>
              }
            </p>
          </div>
        </div>
        <CheckCircle2 size={24} color="#16a34a" style={{ flexShrink: 0 }} />
      </div>
    );
  }

  // ── In Progress: compact ─────────────────────────────────────
  if (variant === 'compact') {
    return (
      <div className="promo-banner promo-banner--progress-compact" style={style}>
        <div className="promo-banner__compact-row">
          <span className="promo-banner__compact-label">
            <Flame size={12} color="#ea580c" />
            {progressText}
          </span>
          <span className="promo-banner__compact-cta">
            {isMinAmount
              ? `₦${remainingQtyNeeded.toLocaleString()} more → ${isFreeDelivery ? rewardName : `FREE ${rewardName}`}`
              : `${remainingQtyNeeded} more ${isBirdCount ? 'bird' : 'item'}${remainingQtyNeeded > 1 ? 's' : ''} → ${isFreeDelivery ? rewardName : `FREE ${rewardName}`}`
            }
          </span>
        </div>
        <div className="promo-progress-track">
          <div className="promo-progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>
    );
  }

  // ── In Progress: full ────────────────────────────────────────
  const needMore = remainingQtyNeeded === 0 ? 1 : remainingQtyNeeded;

  return (
    <div className="promo-banner promo-banner--full" style={style}>
      {/* Header row */}
      <div className="promo-banner__header">
        <div className="promo-banner__header-left">
          <div className="promo-banner__icon promo-banner__icon--orange">
            <Flame size={16} />
          </div>
          <div>
            <span className="promo-banner__title">
              {promoOffer.title || 'Daily Early Bird Special'}
            </span>
            {remainingToday < 999 && (
              <span className="promo-badge promo-badge--orange">
                {remainingToday} slots left
              </span>
            )}
          </div>
        </div>
        <div className="promo-banner__reward-chip">
          <RewardIcon size={13} />
          <span>{chipLabel}</span>
        </div>
      </div>

      {/* Description */}
      <p className="promo-banner__desc">
        {currentQty === 0
          ? (isMinAmount
              ? `Spend ₦${requiredQty.toLocaleString()}+ and get ${rewardLabel}!`
              : `Order ${requiredQty}+ ${isBirdCount ? 'Guinea Fowls' : 'qualifying items'} → Get ${rewardLabel}!`
            )
          : (isMinAmount
              ? `Spend ₦${needMore.toLocaleString()} more to unlock your free reward!`
              : `${needMore} more ${isBirdCount ? 'Guinea Fowl' : 'item'}${needMore > 1 ? 's' : ''} away from ${isFreeDelivery ? rewardName : `a FREE ${rewardName}`}!`
            )
        }
      </p>

      {/* Progress bar */}
      <div className="promo-progress-track">
        <div className="promo-progress-fill" style={{ width: `${progressPercent}%` }} />
      </div>

      {/* Footer */}
      <div className="promo-banner__footer">
        <span>{progressText}</span>
        <span>
          {progressPercent >= 100 ? (
            <span style={{ color: '#16a34a', fontWeight: 800 }}>Complete!</span>
          ) : (
            `${progressPercent}%`
          )}
        </span>
      </div>
    </div>
  );
}
