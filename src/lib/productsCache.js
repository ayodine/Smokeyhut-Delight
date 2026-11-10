import { publicSupabase as supabase } from './supabase';
import { groupProductsForStorefront } from './productVariants';

// Bundled static product images mirrored in /public/product-images/ to eliminate Supabase Storage Egress
const BUNDLED_PRODUCT_IMAGES = new Set([
  '1776179169236-n5mzd2qbl3a.jpeg',
  '1793710190069-b3d7qocw5zk.png',
  '1793709912557-poyfvhvpg1a.png',
  '1793709577264-9yz6bfhfsbf.png',
  '1776179186814-74j0lul2jqq.jpeg',
  '1792674740893-y8h30rjsfb.jpeg',
  'HERO.png',
  '1783775498509-smgx4cr1gq8.jpeg',
  '1785772776809-fwjiszyldib.jpeg',
  '1783775472605-mafzo2vvcg.jpeg',
  '1789003617877-fsu59hbev4.jpeg',
  '1793703569570-uclhoxju81a.jpeg',
  '1793709791869-hwuawe7ywz9.png',
  '1776179480835-vp65c5qf5k8.jpeg',
  '1783706122484-t85ywa5lf9.jpeg',
  '1776179295381-ov70sr60tpk.jpeg',
  '1776179277782-m3d223y3j9e.jpeg',
  '1776179408096-oeblpqytno.jpeg',
  '1776179352839-qzfl1hxj0i.jpeg',
  '1776179222910-ycs79bt29dq.jpeg',
  '1776849201672-wtly7fumegc.jpeg',
  '1776179540812-duw4kpyaumj.jpeg',
  '1776179322086-c8l19fpxx8a.jpeg',
  '1776179447534-xqph6alu9d.jpeg',
  '1776179462811-j7zclyamixl.jpeg',
  '1776179512877-ns4jwu6jy8b.jpeg',
  '1776179239912-i0skelo3eg.jpeg',
  '1776179257366-cw5ki72ou6k.jpeg',
  '1787592873199-fjqwyu0koef.jpeg',
  '1789004058190-uy10sqthlzh.jpeg',
  '1793708837623-14gatrss0rpg.jpeg',
  '1787438667355-r18hgzn7ge.jpeg',
]);

export function resolveProductImageUrl(url) {
  if (!url || typeof url !== 'string') return url;
  const marker = '/storage/v1/object/public/product-images/';
  const idx = url.indexOf(marker);
  if (idx !== -1) {
    const filename = url.slice(idx + marker.length).split('?')[0];
    if (BUNDLED_PRODUCT_IMAGES.has(filename)) {
      return `/product-images/${filename}`;
    }
  }
  return url;
}

// Module-level cache — fetched once, shared across all pages
let cache = null;
let promise = null;

export function prefetchProducts() {
  if (cache || promise) return;
  promise = Promise.all([
    supabase.from('products').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
    supabase.from('categories').select('*').order('created_at', { ascending: true }),
    supabase.from('app_settings').select('value').eq('key', 'inventory_sales').maybeSingle(),
  ]).then(([pRes, cRes, sRes]) => {
    const rawProducts = (pRes.data || []).map(p => ({
      ...p,
      image: resolveProductImageUrl(p.image),
    }));
    const salesList = Array.isArray(sRes?.data?.value) ? sRes.data.value : [];
    const salesInventoryMap = new Map();
    salesList.forEach(item => {
      if (item && item.id != null) {
        salesInventoryMap.set(Number(item.id), item);
      }
    });
    cache = {
      products: groupProductsForStorefront(rawProducts, salesInventoryMap),
      rawProducts,
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
