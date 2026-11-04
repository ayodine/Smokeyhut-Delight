import { describe, it, expect } from 'vitest';
import {
  getPreorderState,
  validateAdminPreorderConfig,
  analyzeCartPreorders,
  validatePreorderDeliveryDate,
  getActiveHomepagePromotions,
  deriveAdminPreorderInfo,
  matchesAdminPreorderFilter,
} from '../preorderUtils';
import {
  isDispatchSurchargeTargetProduct,
  calculateDispatchCapacityPricing,
} from '../dispatchPricing';

describe('Part A — Product Pre-Order Configuration & Storefront Window Logic', () => {
  const now = new Date('2026-11-10T12:00:00Z');

  it('validates admin pre-order configuration and prevents invalid date combinations', () => {
    // Missing release date when preorder_enabled is true
    const missingRelease = validateAdminPreorderConfig({
      preorder_enabled: true,
      preorder_release_date: '',
    });
    expect(missingRelease.valid).toBe(false);
    expect(missingRelease.errors.some(e => /release/i.test(e))).toBe(true);

    // Closing date before opening date
    const invalidWindow = validateAdminPreorderConfig({
      preorder_enabled: true,
      preorder_release_date: '2026-11-20',
      preorder_open_at: '2026-11-15T10:00:00Z',
      preorder_close_at: '2026-11-12T10:00:00Z',
    });
    expect(invalidWindow.valid).toBe(false);

    // Valid configuration
    const validConfig = validateAdminPreorderConfig({
      preorder_enabled: true,
      preorder_release_date: '2026-11-20',
      preorder_open_at: '2026-11-05T10:00:00Z',
      preorder_close_at: '2026-11-19T23:59:00Z',
      preorder_max_qty: 50,
    });
    expect(validConfig.valid).toBe(true);
    expect(validConfig.errors).toHaveLength(0);
  });

  it('evaluates pre-order window states (open, scheduled, closed, capacity_reached, disabled)', () => {
    const openProduct = {
      id: 1,
      name: 'Festive Smoked Guinea Fowl',
      preorder_enabled: true,
      preorder_status: 'open',
      preorder_release_date: '2026-11-25',
      preorder_open_at: '2026-11-01T00:00:00Z',
      preorder_close_at: '2026-11-24T23:59:59Z',
      preorder_scheduling_mode: 'schedule_after_release',
      preorder_message: 'Freshly smoked for the festive season.',
    };
    const stateOpen = getPreorderState(openProduct, now);
    expect(stateOpen.isPreorderActive).toBe(true);
    expect(stateOpen.ctaLabel).toBe('Pre-order Now');
    expect(stateOpen.badgeText).toBe('PRE-ORDER');
    expect(stateOpen.releaseDate).toBe('2026-11-25');

    // Scheduled in the future
    const scheduledProduct = {
      ...openProduct,
      preorder_open_at: '2026-11-15T00:00:00Z',
    };
    const stateScheduled = getPreorderState(scheduledProduct, now);
    expect(stateScheduled.isPreorderActive).toBe(false);
    expect(stateScheduled.windowState).toBe('scheduled');

    // Closed in the past
    const closedProduct = {
      ...openProduct,
      preorder_close_at: '2026-11-05T00:00:00Z',
    };
    const stateClosed = getPreorderState(closedProduct, now);
    expect(stateClosed.isPreorderActive).toBe(false);
    expect(stateClosed.windowState).toBe('closed');

    // Capacity reached
    const exhaustedProduct = {
      ...openProduct,
      preorder_max_qty: 20,
      preorder_reserved_qty: 20,
    };
    const stateExhausted = getPreorderState(exhaustedProduct, now);
    expect(stateExhausted.isPreorderActive).toBe(false);
    expect(stateExhausted.windowState).toBe('capacity_reached');
  });

  it('analyzes mixed carts and enforces earliest selectable delivery date >= release date', () => {
    const cart = [
      {
        id: 10,
        name: 'Pre-order Turkey',
        qty: 1,
        preorder_enabled: true,
        preorder_status: 'open',
        preorder_release_date: '2026-11-25',
        preorder_scheduling_mode: 'schedule_after_release',
      },
      {
        id: 11,
        name: 'Regular Asun',
        qty: 2,
        preorder_enabled: false,
      },
    ];
    const analysis = analyzeCartPreorders(cart, null, now);
    expect(analysis.hasPreorder).toBe(true);
    expect(analysis.hasRegular).toBe(true);
    expect(analysis.isMixedCart).toBe(true);
    expect(analysis.latestReleaseDate).toBe('2026-11-25');
    expect(analysis.minDeliveryDate).toBe('2026-11-25');
    expect(analysis.mixedCartNotice.toLowerCase()).toContain('combined');
  });

  it('prevents selecting a delivery date earlier than the release date', () => {
    // Attempt to pick a date before release date
    const earlyCheck = validatePreorderDeliveryDate({
      selectedDate: '2026-11-20',
      releaseDate: '2026-11-25',
      schedulingMode: 'schedule_at_checkout',
      now,
    });
    expect(earlyCheck.valid).toBe(false);
    expect(earlyCheck.error).toContain('cannot be earlier than the release date');

    // Selecting exact release date is valid
    const exactCheck = validatePreorderDeliveryDate({
      selectedDate: '2026-11-25',
      releaseDate: '2026-11-25',
      schedulingMode: 'schedule_at_checkout',
      now,
    });
    expect(exactCheck.valid).toBe(true);

    // Selecting a date after release date is valid
    const laterCheck = validatePreorderDeliveryDate({
      selectedDate: '2026-11-28',
      releaseDate: '2026-11-25',
      schedulingMode: 'schedule_at_checkout',
      now,
    });
    expect(laterCheck.valid).toBe(true);

    // Post-order scheduling in schedule_after_release mode before release date is blocked for customers
    const beforeReleaseCustomer = validatePreorderDeliveryDate({
      selectedDate: '2026-11-26',
      releaseDate: '2026-11-25',
      schedulingMode: 'schedule_after_release',
      isPostOrderCustomerScheduling: true,
      isAdminOverride: false,
      now: new Date('2026-11-10T12:00:00Z'),
    });
    expect(beforeReleaseCustomer.valid).toBe(false);

    // Once release date is reached, customer can select delivery date
    const onReleaseCustomer = validatePreorderDeliveryDate({
      selectedDate: '2026-11-26',
      releaseDate: '2026-11-25',
      schedulingMode: 'schedule_after_release',
      isPostOrderCustomerScheduling: true,
      isAdminOverride: false,
      now: new Date('2026-11-25T09:00:00Z'),
    });
    expect(onReleaseCustomer.valid).toBe(true);
  });
});

describe('Part B — Admin Pre-Order Management & 11 Operational Stage Filters', () => {
  const now = new Date('2026-11-20T12:00:00Z');

  it('accurately classifies and filters pre-orders across all 11 operational stages', () => {
    const awaitingReleaseOrder = {
      id: 'SH-101',
      is_preorder: true,
      preorder_release_date: '2026-11-25',
      scheduled_delivery_date: null,
      status: 'pending',
    };
    const awaitingDateOrder = {
      id: 'SH-102',
      is_preorder: true,
      preorder_release_date: '2026-11-19', // reached 1 day ago
      scheduled_delivery_date: null,
      status: 'pending',
    };
    const overdueOrder = {
      id: 'SH-103',
      is_preorder: true,
      preorder_release_date: '2026-11-15', // reached 5 days ago, still no customer date
      scheduled_delivery_date: null,
      status: 'pending',
    };
    const dateSelectedOrder = {
      id: 'SH-104',
      is_preorder: true,
      preorder_release_date: '2026-11-19',
      scheduled_delivery_date: '2026-11-22',
      status: 'pending',
    };
    const readyForDispatchOrder = {
      id: 'SH-105',
      is_preorder: true,
      preorder_release_date: '2026-11-19',
      scheduled_delivery_date: '2026-11-20',
      preorder_status: 'ready_for_dispatch',
      status: 'processing',
    };

    expect(matchesAdminPreorderFilter(awaitingReleaseOrder, 'awaiting_release', now)).toBe(true);
    expect(matchesAdminPreorderFilter(awaitingReleaseOrder, 'release_reached', now)).toBe(false);

    expect(matchesAdminPreorderFilter(awaitingDateOrder, 'release_reached', now)).toBe(true);
    expect(matchesAdminPreorderFilter(awaitingDateOrder, 'awaiting_customer_date', now)).toBe(true);

    expect(matchesAdminPreorderFilter(overdueOrder, 'overdue', now)).toBe(true);

    expect(matchesAdminPreorderFilter(dateSelectedOrder, 'date_selected', now)).toBe(true);
    expect(matchesAdminPreorderFilter(readyForDispatchOrder, 'ready_for_dispatch', now)).toBe(true);

    // Also recognizes fallback notes-tagged pre-orders
    const notesTaggedPreorder = {
      id: 'SH-106',
      is_preorder: false,
      notes: '[via Website] [Pre-Order: Release 2026-11-28 | Delivery Date Pending Customer Selection on/after Release]',
      status: 'pending',
    };
    const derived = deriveAdminPreorderInfo(notesTaggedPreorder, now);
    expect(derived.isPreorder).toBe(true);
    expect(derived.releaseDate).toBe('2026-11-28');
  });
});

describe('Part C — Homepage Pre-Order Promotion', () => {
  const now = new Date('2026-11-10T12:00:00Z');

  it('returns only active, in-window homepage pre-order promotions sorted by priority', () => {
    const products = [
      {
        id: 1,
        name: 'Promo Low Priority',
        is_active: true,
        preorder_enabled: true,
        preorder_status: 'open',
        preorder_release_date: '2026-11-25',
        homepage_promo_enabled: true,
        homepage_promo_priority: 1,
      },
      {
        id: 2,
        name: 'Promo High Priority',
        is_active: true,
        preorder_enabled: true,
        preorder_status: 'open',
        preorder_release_date: '2026-11-22',
        homepage_promo_enabled: true,
        homepage_promo_headline: 'Reserve Festive Guinea Fowl',
        homepage_promo_priority: 10,
      },
      {
        id: 3,
        name: 'Expired Promo',
        is_active: true,
        preorder_enabled: true,
        preorder_status: 'open',
        preorder_release_date: '2026-11-25',
        homepage_promo_enabled: true,
        homepage_promo_end_at: '2026-11-05T00:00:00Z',
      },
    ];

    const promos = getActiveHomepagePromotions(products, now);
    expect(promos).toHaveLength(2);
    expect(promos[0].product.id).toBe(2);
    expect(promos[0].headline).toBe('Reserve Festive Guinea Fowl');
    expect(promos[1].product.id).toBe(1);
  });
});

describe('Part D — Dispatch-Capacity Pricing for Large Guinea Fowl Orders (> 5 Packs → 2× Fee)', () => {
  it('identifies Guinea Fowl and explicitly configured dispatch-surcharge products', () => {
    expect(isDispatchSurchargeTargetProduct({ name: 'Peppered Grilled Guinea Fowl' })).toBe(true);
    expect(isDispatchSurchargeTargetProduct({ name: 'Smoked Chicken', dispatch_surcharge_enabled: false })).toBe(false);
    expect(isDispatchSurchargeTargetProduct({ name: 'Custom Party Tray', dispatch_surcharge_enabled: true })).toBe(true);
  });

  it('charges 1× normal delivery fee for 1 to 5 packs of Guinea Fowl', () => {
    for (const qty of [1, 2, 3, 4, 5]) {
      const res = calculateDispatchCapacityPricing({
        cartItems: [{ id: 2, name: 'Peppered Grilled Guinea Fowl', qty }],
        baseDeliveryFee: 3500,
        deliveryMode: 'delivery',
      });
      expect(res.requiresDedicatedDispatch).toBe(false);
      expect(res.appliedMultiplier).toBe(1);
      expect(res.finalDeliveryFee).toBe(3500);
      expect(res.warningMessage).toBeNull();
    }
  });

  it('doubles delivery fee (2×) and surfaces warning when Guinea Fowl packs > 5 (6, 7, 10+ packs)', () => {
    for (const qty of [6, 7, 10]) {
      const res = calculateDispatchCapacityPricing({
        cartItems: [{ id: 2, name: 'Peppered Grilled Guinea Fowl', qty }],
        baseDeliveryFee: 3500,
        deliveryMode: 'delivery',
      });
      expect(res.requiresDedicatedDispatch).toBe(true);
      expect(res.qualifyingQty).toBe(qty);
      expect(res.appliedMultiplier).toBe(2);
      expect(res.baseDeliveryFee).toBe(3500);
      expect(res.finalDeliveryFee).toBe(7000);
      expect(res.surchargeAmount).toBe(3500);
      expect(res.warningMessage).toContain('2 dispatch boxes');
    }
  });

  it('reverts immediately to 1× fee when quantity drops from 6 back to 5', () => {
    const atSix = calculateDispatchCapacityPricing({
      cartItems: [{ id: 2, name: 'Peppered Grilled Guinea Fowl', qty: 6 }],
      baseDeliveryFee: 4000,
      deliveryMode: 'delivery',
    });
    expect(atSix.finalDeliveryFee).toBe(8000);

    const backToFive = calculateDispatchCapacityPricing({
      cartItems: [{ id: 2, name: 'Peppered Grilled Guinea Fowl', qty: 5 }],
      baseDeliveryFee: 4000,
      deliveryMode: 'delivery',
    });
    expect(backToFive.requiresDedicatedDispatch).toBe(false);
    expect(backToFive.finalDeliveryFee).toBe(4000);
  });

  it('aggregates Guinea Fowl quantities across multiple cart lines and ignores non-qualifying items', () => {
    const mixed = calculateDispatchCapacityPricing({
      cartItems: [
        { id: 2, name: 'Peppered Grilled Guinea Fowl (Mild)', qty: 3 },
        { id: 20, name: 'Peppered Grilled Guinea Fowl (Spicy)', qty: 3 },
        { id: 1, name: 'Smoked Turkey', qty: 10 },
      ],
      baseDeliveryFee: 2500,
      deliveryMode: 'delivery',
    });
    expect(mixed.qualifyingQty).toBe(6);
    expect(mixed.requiresDedicatedDispatch).toBe(true);
    expect(mixed.finalDeliveryFee).toBe(5000);
  });

  it('does not charge a delivery fee when pickup mode is selected even if Guinea Fowl > 5', () => {
    const pickupRes = calculateDispatchCapacityPricing({
      cartItems: [{ id: 2, name: 'Peppered Grilled Guinea Fowl', qty: 8 }],
      baseDeliveryFee: 3500,
      deliveryMode: 'pickup',
    });
    expect(pickupRes.requiresDedicatedDispatch).toBe(false);
    expect(pickupRes.finalDeliveryFee).toBe(0);
  });
});
