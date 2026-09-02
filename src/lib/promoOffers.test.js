import { describe, it, expect } from 'vitest';
import {
  getPromoBirdCount,
  getCartQualifyingQty,
  evaluateCartPromo,
  findBestCartPromo,
} from './promoOffers';

describe('promoOffers - getPromoBirdCount', () => {
  it('returns 1 for standard whole guinea fowl items', () => {
    expect(getPromoBirdCount({ name: 'Full Smokey Guineafowl' })).toBe(1);
    expect(getPromoBirdCount({ name: 'King Size Guinea Fowl' })).toBe(1);
    expect(getPromoBirdCount({ name: 'Extra Dry Guinea Fowl' })).toBe(1);
    expect(getPromoBirdCount({ name: 'Travel Standard Guineafowl' })).toBe(1);
    expect(getPromoBirdCount({ name: 'GUINEAFOWL', category_id: 'guineafowl' })).toBe(1);
  });

  it('returns correct multiplier for multi-bird packs', () => {
    expect(getPromoBirdCount({ name: 'Triple Delight Combo' })).toBe(3);
    expect(getPromoBirdCount({ name: 'Hangout Pack' })).toBe(3);
    expect(getPromoBirdCount({ name: 'Stock Up 5-Pack' })).toBe(5);
    expect(getPromoBirdCount({ name: 'Party Pack (10 Birds)' })).toBe(10);
  });

  it('returns 0 for non-bird items even if name contains guinea fowl', () => {
    expect(getPromoBirdCount({ name: 'Smokey Guinea Fowl Jollof Rice' })).toBe(0);
    expect(getPromoBirdCount({ name: 'Guinea Fowl Rice Bowl' })).toBe(0);
    expect(getPromoBirdCount({ name: 'Guineafowl Egg(4pcs)' })).toBe(0);
    expect(getPromoBirdCount({ name: 'Zobo Drink' })).toBe(0);
    expect(getPromoBirdCount({ name: 'Fresh Palm Wine' })).toBe(0);
  });
});

describe('promoOffers - getCartQualifyingQty', () => {
  const birdPromo = {
    qualifying_type: 'guinea_fowl_birds',
    min_qualifying_qty: 2,
  };

  it('calculates total bird count accurately with quantities', () => {
    const cart = [
      { name: 'GUINEAFOWL', qty: 2 },
      { name: 'Smokey Guinea Fowl Jollof Rice', qty: 3 },
      { name: 'Zobo Drink', qty: 2 },
    ];
    expect(getCartQualifyingQty(cart, birdPromo)).toBe(2);
  });

  it('handles multi-pack items correctly in cart total', () => {
    const cart = [
      { name: 'Triple Delight Combo', qty: 1 },
      { name: 'Extra Dry Guinea Fowl', qty: 1 },
    ];
    expect(getCartQualifyingQty(cart, birdPromo)).toBe(4);
  });

  it('handles minimum amount triggers correctly', () => {
    const minAmountPromo = {
      qualifying_type: 'min_amount',
      min_order_amount: 20000,
    };
    const cart = [
      { name: 'GUINEAFOWL', price: 16000, qty: 1 },
      { name: 'Smokey Gizzard', price: 3000, qty: 2 },
    ];
    expect(getCartQualifyingQty(cart, minAmountPromo)).toBe(22000);
  });
});

describe('promoOffers - evaluateCartPromo', () => {
  const promo = {
    id: 'promo-123',
    title: 'Daily Early Bird: Free Guinea Fowl',
    qualifying_type: 'guinea_fowl_birds',
    min_qualifying_qty: 2,
    reward_type: 'free_product',
    reward_product_id: 'prod-gf-01',
    reward_product_name: 'Free Guinea Fowl',
    reward_qty: 1,
    daily_quota: 20,
    remaining_today: 15,
  };

  it('calculates progress when cart has fewer than required items (1 of 2)', () => {
    const cart = [{ name: 'GUINEAFOWL', qty: 1 }];
    const evalResult = evaluateCartPromo(promo, cart);

    expect(evalResult.qualifies).toBe(false);
    expect(evalResult.currentQty).toBe(1);
    expect(evalResult.requiredQty).toBe(2);
    expect(evalResult.remainingQtyNeeded).toBe(1);
    expect(evalResult.progressPercent).toBe(50);
    expect(evalResult.rewardItem).toBeNull();
    expect(evalResult.statusMessage).toContain('Add 1 more Guinea Fowl');
  });

  it('unlocks promo reward when cart reaches 2 birds', () => {
    const cart = [{ name: 'GUINEAFOWL', qty: 2 }];
    const evalResult = evaluateCartPromo(promo, cart);

    expect(evalResult.qualifies).toBe(true);
    expect(evalResult.currentQty).toBe(2);
    expect(evalResult.remainingQtyNeeded).toBe(0);
    expect(evalResult.progressPercent).toBe(100);
    expect(evalResult.rewardItem).toEqual({
      id: 'promo-prod-gf-01',
      productId: 'prod-gf-01',
      name: 'Free Guinea Fowl',
      price: 0,
      qty: 1,
      is_promo_reward: true,
      is_free_delivery: false,
      promo_id: 'promo-123',
    });
    expect(evalResult.statusMessage).toContain('Promo Unlocked');
  });

  it('evaluates min_amount promo properly', () => {
    const minPromo = {
      id: 'promo-min',
      title: 'Spend 20k',
      qualifying_type: 'min_amount',
      min_order_amount: 20000,
      reward_type: 'free_product',
      reward_product_name: 'Free Kilishi',
      reward_qty: 1,
      daily_quota: 20,
      remaining_today: 10,
    };
    const cart = [{ name: 'GUINEAFOWL', price: 16000, qty: 1 }];
    const evalResult = evaluateCartPromo(minPromo, cart);

    expect(evalResult.qualifies).toBe(false);
    expect(evalResult.currentQty).toBe(16000);
    expect(evalResult.requiredQty).toBe(20000);
    expect(evalResult.remainingQtyNeeded).toBe(4000);
  });

  it('evaluates free_delivery reward promo properly when qualified', () => {
    const deliveryPromo = {
      id: 'promo-delivery-1',
      title: 'Free Delivery Special',
      qualifying_type: 'guinea_fowl_birds',
      min_qualifying_qty: 3,
      reward_type: 'free_delivery',
      reward_product_name: 'Free Delivery',
      reward_qty: 1,
      daily_quota: 25,
      remaining_today: 20,
    };
    const cart = [{ name: 'Triple Delight Combo', qty: 1 }]; // 3 birds
    const evalResult = evaluateCartPromo(deliveryPromo, cart);

    expect(evalResult.qualifies).toBe(true);
    expect(evalResult.rewardItem).toEqual({
      id: 'promo-free-delivery-promo-delivery-1',
      productId: null,
      name: 'Free Delivery',
      price: 0,
      qty: 1,
      is_promo_reward: true,
      is_free_delivery: true,
      promo_id: 'promo-delivery-1',
    });
    expect(evalResult.statusMessage).toContain('FREE DELIVERY');
  });

  it('does not qualify when daily quota is exhausted', () => {
    const exhaustedPromo = { ...promo, remaining_today: 0 };
    const cart = [{ name: 'Triple Delight Combo', qty: 1 }];
    const evalResult = evaluateCartPromo(exhaustedPromo, cart);

    expect(evalResult.qualifies).toBe(false);
    expect(evalResult.isQuotaExhausted).toBe(true);
    expect(evalResult.rewardItem).toBeNull();
    expect(evalResult.statusMessage).toContain('daily promo limit has been reached');
  });
});

describe('promoOffers - findBestCartPromo', () => {
  const promos = [
    {
      id: 'promo-1',
      title: 'Promo 1',
      qualifying_type: 'guinea_fowl_birds',
      min_qualifying_qty: 2,
      reward_type: 'free_product',
      reward_product_name: 'Free Bird',
      reward_qty: 1,
      is_active: true,
      auto_apply: true,
      remaining_today: 10,
    },
  ];

  it('selects qualifying promo for cart', () => {
    const cart = [{ name: 'GUINEAFOWL', qty: 2 }];
    const match = findBestCartPromo(promos, cart);
    expect(match).not.toBeNull();
    expect(match.promo.id).toBe('promo-1');
    expect(match.evaluation.qualifies).toBe(true);
  });
});
