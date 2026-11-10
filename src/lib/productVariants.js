/**
 * Shared Parent-Product & Variant Grouping Configuration for Storefront & Order Lifecycle.
 * Maps existing database product records into consolidated parent products with selectable variants
 * while preserving each variant's unique database ID, SKU, price, and inventory record.
 */

export const PARENT_PRODUCT_GROUPS = [
  {
    parent_group_key: 'smokey-guinea-fowl',
    parent_id: 'parent-smokey-guinea-fowl',
    parent_name: 'Smokey Guinea Fowl',
    category_id: 'guineafowl',
    short_desc: 'Authentic firewood-grilled smokey guinea fowl — select your preferred preparation format.',
    description:
      'Signature firewood-grilled smokey guinea fowl seasoned with our rich house pepper blend. Select Whole, Chopped, or Extra Dry.',
    variants: [
      {
        product_id: 7,
        sku: 'WEB-PROD-7',
        variant_label: 'Whole',
        match_names: ['full smokey guineafowl', 'full smokey guinea fowl', 'whole', 'whole / standard'],
        sort_order: 1,
      },
      {
        product_id: 10,
        sku: 'WEB-PROD-10',
        variant_label: 'Chopped',
        match_names: ['full smokey guineafowl (chopped)', 'guinea fowl chopped', 'chopped guineafowl'],
        sort_order: 2,
      },
      {
        product_id: 5,
        sku: 'WEB-PROD-5',
        variant_label: 'Extra Dry',
        match_names: ['travel standard dry guineafowl', 'guinea fowl extra dry', 'extra dry guineafowl'],
        sort_order: 3,
      },
    ],
  },
  {
    parent_group_key: 'king-size-smokey-guinea-fowl',
    parent_id: 'parent-king-size-smokey-guinea-fowl',
    parent_name: 'King Size Smokey Guinea Fowl',
    category_id: 'guineafowl',
    short_desc: 'King-size firewood-grilled smokey guinea fowl with gizzard — select your preferred variant.',
    description:
      'Jumbo king-size firewood-smoked guinea fowl paired with spicy gizzard. Choose Standard, King Size Extra, or Extra Dry King Size.',
    variants: [
      {
        product_id: 24,
        sku: 'WEB-PROD-24',
        variant_label: 'Standard',
        match_names: ['king size smokey guineafowl + gizzard'],
        sort_order: 1,
      },
      {
        product_id: 30,
        sku: 'WEB-PROD-30',
        variant_label: 'King Size Extra',
        match_names: ['king size extra + gizzard'],
        sort_order: 2,
      },
      {
        product_id: 28,
        sku: 'WEB-PROD-28',
        variant_label: 'Extra Dry King Size',
        match_names: ['extra dry king size guineafowl + gizzard'],
        sort_order: 3,
      },
    ],
  },
  {
    parent_group_key: 'smokey-chicken',
    parent_id: 'parent-smokey-chicken',
    parent_name: 'Smokey Chicken',
    category_id: 'chicken',
    short_desc: 'Tender firewood-grilled smokey chicken — select Full Chicken or Chopped Chicken.',
    description:
      'Juicy, deeply smoked whole firewood chicken infused with our signature spice rub. Available as Full Chicken or Chopped Chicken.',
    variants: [
      {
        product_id: 9,
        sku: 'WEB-PROD-9',
        variant_label: 'Full Chicken',
        match_names: ['full smokey chicken', 'full chicken'],
        sort_order: 1,
      },
      {
        product_id: 8,
        sku: 'WEB-PROD-8',
        variant_label: 'Chopped Chicken',
        match_names: ['full smokey chicken (chopped)', 'chopped chicken'],
        sort_order: 2,
      },
    ],
  },
];

/**
 * Look up whether a raw database product belongs to one of the parent groups.
 */
export function resolveProductVariantMeta(product) {
  if (!product) return null;
  const pid = Number(product.id ?? product.product_id);
  const normName = String(product.name || '').toLowerCase().trim();

  if (product.parent_group_key && product.variant_label) {
    const explicitGroup = PARENT_PRODUCT_GROUPS.find(
      g => g.parent_group_key === product.parent_group_key
    );
    return {
      parent_group_key: product.parent_group_key,
      parent_name: explicitGroup?.parent_name || product.parent_name || product.name,
      category_id: explicitGroup?.category_id || product.category_id,
      variant_label: product.variant_label,
      sort_order: Number(product.variant_sort_order || 99),
    };
  }

  for (const group of PARENT_PRODUCT_GROUPS) {
    for (const v of group.variants) {
      if (pid === v.product_id || v.match_names.includes(normName)) {
        return {
          parent_group_key: group.parent_group_key,
          parent_id: group.parent_id,
          parent_name: group.parent_name,
          category_id: group.category_id,
          short_desc: group.short_desc,
          description: group.description,
          variant_label: v.variant_label,
          sort_order: v.sort_order,
          sku: v.sku,
        };
      }
    }
  }

  return null;
}

/**
 * Format a cart/order item's display name so both parent and selected variant are unmistakable.
 */
export function formatVariantOrderItemName(parentName, variantLabel, fallbackName) {
  if (parentName && variantLabel) {
    return `${parentName} — ${variantLabel}`;
  }
  return fallbackName || parentName || '';
}

/**
 * Groups raw products into storefront catalogue items:
 * - Products belonging to a parent group are consolidated into a single parent product card
 *   with `is_parent_group: true` and `variants: [...]`.
 * - Standalone products remain individual product cards (filtered by `is_active !== false`).
 */
export function groupProductsForStorefront(rawProducts = [], salesInventoryMap = null) {
  if (!Array.isArray(rawProducts) || rawProducts.length === 0) return [];

  const groupedByKey = new Map();
  const standaloneProducts = [];

  for (const raw of rawProducts) {
    if (!raw || raw.deleted_at) continue;
    const meta = resolveProductVariantMeta(raw);
    const salesRecord = salesInventoryMap ? salesInventoryMap.get(Number(raw.id)) : null;

    // Determine variant availability:
    // If Sales Inventory explicitly tracks stock_qty/sellable_qty or active state, attach it.
    const opsSellable = salesRecord
      ? Math.max(
          0,
          Number(salesRecord.stock_qty || 0) +
            Number(salesRecord.estimated_incoming_qty || 0) -
            Number(salesRecord.qty_allocated || 0)
        )
      : null;

    if (meta) {
      if (!groupedByKey.has(meta.parent_group_key)) {
        groupedByKey.set(meta.parent_group_key, []);
      }
      groupedByKey.get(meta.parent_group_key).push({
        ...raw,
        id: raw.id,
        variant_id: raw.id,
        sku: raw.sku || meta.sku || `SMK-${String(raw.id).padStart(4, '0')}`,
        original_name: raw.name,
        parent_group_key: meta.parent_group_key,
        parent_name: meta.parent_name,
        variant_label: meta.variant_label,
        variant_sort_order: meta.sort_order,
        category_id: meta.category_id || raw.category_id,
        ops_stock_qty: salesRecord ? Number(salesRecord.stock_qty || 0) : null,
        ops_sellable_qty: opsSellable,
        is_active: raw.is_active !== false,
      });
    } else {
      // Standalone item: only display on storefront when active
      if (raw.is_active === false) continue;
      standaloneProducts.push({
        ...raw,
        is_parent_group: false,
        variants: [],
        ops_stock_qty: salesRecord ? Number(salesRecord.stock_qty || 0) : null,
        ops_sellable_qty: opsSellable,
      });
    }
  }

  const parentCards = [];

  for (const groupConfig of PARENT_PRODUCT_GROUPS) {
    const members = groupedByKey.get(groupConfig.parent_group_key);
    if (!members || members.length === 0) continue;

    members.sort((a, b) => (a.variant_sort_order || 99) - (b.variant_sort_order || 99));

    // Representative variant for default card thumbnail/price preview (prefer first active variant)
    const primaryVariant = members.find(m => m.is_active !== false) || members[0];
    const anyVariantActive = members.some(m => m.is_active !== false);
    const prices = members.map(m => Number(m.price || 0)).filter(p => p > 0);
    const minPrice = prices.length > 0 ? Math.min(...prices) : Number(primaryVariant.price || 0);
    const maxPrice = prices.length > 0 ? Math.max(...prices) : Number(primaryVariant.price || 0);

    parentCards.push({
      ...primaryVariant,
      id: primaryVariant.id,
      parent_id: groupConfig.parent_id,
      is_parent_group: true,
      parent_group_key: groupConfig.parent_group_key,
      parent_name: groupConfig.parent_name,
      name: groupConfig.parent_name,
      category_id: groupConfig.category_id,
      short_desc: groupConfig.short_desc,
      description: groupConfig.description,
      price: minPrice,
      min_price: minPrice,
      max_price: maxPrice,
      has_price_range: minPrice !== maxPrice,
      is_active: anyVariantActive,
      variants: members,
    });
  }

  return [...parentCards, ...standaloneProducts];
}

