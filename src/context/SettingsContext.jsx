import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { publicSupabase } from '../lib/supabase';
import { supabase } from '../lib/supabase';

const SettingsContext = createContext(null);

const defaultSettings = {
  storeName: 'Smokeyhut Delight',
  email: 'admin@smokeyhut.com',
  phone: '+234 801 234 5678',
  weekdayHours: '8:00am – 6:00pm',
  sundayHours: '10:00am – 5:00pm',
  notifyOrders: true,
  notifyDelivery: true,
  notifyPayments: false,
  deliveryOptions: [
    { id: '1', name: 'Mainland Delivery', fee: 3000 },
    { id: '2', name: 'Island Delivery', fee: 4000 },
    { id: '3', name: 'Extended Area', fee: 5000 },
    { id: '4', name: 'Store Pickup', fee: 0 }
  ],
  tickerItems: [
    '🔥 BEST GUINEAFOWL IN LAGOS | Firewood-grilled daily — Order now!',
    '📍 13 McNeil St, Yaba, Lagos | Open Mon–Sat 8am–6pm',
    '🍗 Combo Deal: 2 Guineafowls + 2 Drinks = ₦22,000',
    '🚚 SAME-DAY DELIVERY | Order before 10am for first-batch dispatch!',
    '🌿 FRESH DAILY: Guineafowl • Rice • Palm Wine • Zobo',
  ],
  bankName: '',
  accountName: '',
  accountNumber: '',
  deliveryPromo: { enabled: false, product_ids: [], area_fees: {} },
};

// Map an app_settings (key, value) row to the partial context-settings shape.
// Shared by the initial fetch and the realtime handler so they stay in sync.
function applyRow(key, value) {
  if (key === 'delivery_options') return Array.isArray(value) && value.length > 0 ? { deliveryOptions: value } : {};
  if (key === 'ticker_items')     return Array.isArray(value) && value.length > 0 ? { tickerItems: value } : {};
  if (key === 'bank_details')     return value ? { ...value } : {};
  if (key === 'general_settings') return value ? { ...value } : {};
  if (key === 'delivery_promo')   return value ? { deliveryPromo: value } : {};
  return {};
}

export function SettingsProvider({ children }) {
  const [settings, setSettingsState] = useState(() => {
    const saved = localStorage.getItem('smokey_settings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return defaultSettings;
      }
    }
    return defaultSettings;
  });

  const bcRef = useRef(null);

  useEffect(() => {
    // 1. Initial fetch — gated by a 5-min TTL so we don't refetch on every mount.
    //    (Realtime below keeps already-open pages fresh in between.)
    const SETTINGS_TTL_MS = 5 * 60 * 1000;
    const lastFetched = Number(localStorage.getItem('smokey_settings_fetched_at') || 0);
    const isStale = Date.now() - lastFetched > SETTINGS_TTL_MS;

    if (isStale) {
      Promise.all([
        publicSupabase.from('app_settings').select('key,value').eq('key', 'delivery_options').single(),
        publicSupabase.from('app_settings').select('key,value').eq('key', 'ticker_items').single(),
        publicSupabase.from('app_settings').select('key,value').eq('key', 'bank_details').single(),
        publicSupabase.from('app_settings').select('key,value').eq('key', 'general_settings').single(),
        publicSupabase.from('app_settings').select('key,value').eq('key', 'delivery_promo').single(),
      ]).then((results) => {
        localStorage.setItem('smokey_settings_fetched_at', String(Date.now()));
        setSettingsState(prev => {
          let next = { ...prev };
          for (const res of results) {
            if (res.data) next = { ...next, ...applyRow(res.data.key, res.data.value) };
          }
          return next;
        });
      });
    }

    // 2. Cross-tab sync (same browser) — ALWAYS set up, even on a warm cache, so a
    //    save in the dashboard tab instantly updates an open storefront tab. (This
    //    was previously skipped whenever the cache was fresh, silently breaking it.)
    let bc;
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel('smokey_settings_bc');
      bc.onmessage = (e) => {
        if (e.data?.type === 'settings_updated') {
          setSettingsState(prev => ({ ...prev, ...e.data.settings }));
        }
      };
      bcRef.current = bc;
    }

    // 3. Realtime — pushes setting changes live to every open store/dashboard,
    //    across devices, without waiting out the cache or reloading.
    const channel = publicSupabase
      .channel('app_settings_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, (payload) => {
        const row = payload.new;
        if (row?.key) setSettingsState(prev => ({ ...prev, ...applyRow(row.key, row.value) }));
      })
      .subscribe();

    return () => {
      bc?.close();
      publicSupabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('smokey_settings', JSON.stringify(settings));
  }, [settings]);

  const setSettings = async (newSettings) => {
    setSettingsState(prev => ({ ...prev, ...newSettings }));

    // Broadcast update to all other open tabs immediately
    bcRef.current?.postMessage({ type: 'settings_updated', settings: newSettings });

    const upserts = [];
    if (newSettings.deliveryOptions) {
      upserts.push(supabase.from('app_settings').upsert({ key: 'delivery_options', value: newSettings.deliveryOptions, updated_at: new Date().toISOString() }));
    }
    if (newSettings.tickerItems) {
      upserts.push(supabase.from('app_settings').upsert({ key: 'ticker_items', value: newSettings.tickerItems, updated_at: new Date().toISOString() }));
    }
    if (newSettings.deliveryPromo) {
      upserts.push(supabase.from('app_settings').upsert({ key: 'delivery_promo', value: newSettings.deliveryPromo, updated_at: new Date().toISOString() }));
    }
    if (newSettings.bankName !== undefined || newSettings.accountName !== undefined || newSettings.accountNumber !== undefined) {
      const bankDetails = { bankName: newSettings.bankName, accountName: newSettings.accountName, accountNumber: newSettings.accountNumber };
      upserts.push(supabase.from('app_settings').upsert({ key: 'bank_details', value: bankDetails, updated_at: new Date().toISOString() }));
    }
    if (newSettings.storeName !== undefined || newSettings.email !== undefined || newSettings.phone !== undefined || newSettings.weekdayHours !== undefined || newSettings.sundayHours !== undefined) {
      const generalSettings = {
        storeName: newSettings.storeName !== undefined ? newSettings.storeName : settings.storeName,
        email: newSettings.email !== undefined ? newSettings.email : settings.email,
        phone: newSettings.phone !== undefined ? newSettings.phone : settings.phone,
        weekdayHours: newSettings.weekdayHours !== undefined ? newSettings.weekdayHours : settings.weekdayHours,
        sundayHours: newSettings.sundayHours !== undefined ? newSettings.sundayHours : settings.sundayHours
      };
      upserts.push(supabase.from('app_settings').upsert({ key: 'general_settings', value: generalSettings, updated_at: new Date().toISOString() }));
    }
    if (upserts.length > 0) {
      const results = await Promise.all(upserts);
      const err = results.find(r => r.error);
      if (err) return { error: err.error };
      // Bust TTL so next load re-fetches the new values
      localStorage.removeItem('smokey_settings_fetched_at');
    }
    return { error: null };
  };

  return (
    <SettingsContext.Provider value={{ settings, setSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
