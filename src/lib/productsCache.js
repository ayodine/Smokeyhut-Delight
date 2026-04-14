import { publicSupabase as supabase } from './supabase';

// Module-level cache — fetched once, shared across all pages
let cache = null;
let promise = null;

export function prefetchProducts() {
  if (cache || promise) return;
  promise = Promise.all([
    supabase.from('products').select('id,name,short_desc,price,compare_price,image,badge,stock,category_id,free_shipping,is_active').or('is_active.is.null,is_active.eq.true').order('created_at', { ascending: false }),
    supabase.from('categories').select('*').order('created_at', { ascending: true }),
  ]).then(([pRes, cRes]) => {
    cache = {
      products: pRes.data || [],
      categories: cRes.data || [],
    };
    promise = null;
    return cache;
  });
}

export async function getProducts() {
  if (cache) return cache;
  if (!promise) prefetchProducts();
  return promise;
}

export function invalidateProducts() {
  cache = null;
  promise = null;
}
