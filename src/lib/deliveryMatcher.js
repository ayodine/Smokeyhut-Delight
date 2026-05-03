/**
 * Fetch all active delivery zones with their areas from Supabase.
 */
export async function fetchDeliveryZones(supabaseClient) {
  const { data, error } = await supabaseClient
    .from('delivery_zones')
    .select('id, name, slug, price, is_active, delivery_areas(id, name, aliases)')
    .eq('is_active', true)
    .order('name');
  if (error) return [];
  return data || [];
}

/**
 * Fetch a flat sorted list of all delivery areas with their zone price attached.
 * Used by the Orders form and DeliveryZones admin page.
 */
export async function fetchFlatAreas(supabaseClient) {
  const zones = await fetchDeliveryZones(supabaseClient);
  const areas = [];
  for (const zone of zones) {
    if (zone.slug === 'store-pickup' || zone.name.toLowerCase().includes('pickup')) continue;
    for (const area of (zone.delivery_areas || [])) {
      areas.push({
        id: area.id,
        name: area.name,
        aliases: area.aliases || [],
        price: zone.price,
        zone_id: zone.id,
        zone_name: zone.name,
      });
    }
  }
  return areas.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Find matching zones given a query string.
 * Returns array of { zone, area, matchedOn } sorted by relevance, max 8 results.
 */
export function matchDeliveryZone(query, zones) {
  if (!query || query.trim().length < 2) return [];
  const q = query.toLowerCase().trim();
  const results = [];

  for (const zone of zones) {
    // Skip pickup zone from search results
    if (zone.slug === 'store-pickup' || zone.name.toLowerCase().includes('pickup')) continue;

    // Only match at the area level — never show zone names as results
    for (const area of (zone.delivery_areas || [])) {
      const areaName = area.name.toLowerCase();
      const aliases = (area.aliases || []).map(a => a.toLowerCase());
      let matched = false;

      if (areaName.includes(q)) {
        results.push({ zone, area, matchedOn: area.name, score: areaName.startsWith(q) ? 4 : 3 });
        matched = true;
      }

      if (!matched) {
        for (const alias of aliases) {
          if (alias.includes(q)) {
            results.push({ zone, area, matchedOn: area.name, score: alias.startsWith(q) ? 4 : 3 });
            break;
          }
        }
      }
    }
  }

  // Sort by score desc, deduplicate by zone+area combo
  const seen = new Set();
  return results
    .sort((a, b) => b.score - a.score)
    .filter(r => {
      const key = `${r.zone.id}-${r.area?.id ?? 'zone'}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}
