import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { publicSupabase } from '../lib/supabase';
import { supabase } from '../lib/supabase';

const SettingsContext = createContext(null);

const defaultSettings = {
  storeName: 'Smokeyhut Delight',
  email: 'admin@smokeyhut.com',
  phone: '+234 801 234 5678',
  weekdayHours: '8:00am – 6:00pm',
  sundayHours: '10:00am – 4:00pm',
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
};

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

  // Fetch settings from Supabase on mount, but skip if cached data is < 5 minutes old
  useEffect(() => {
    const SETTINGS_TTL_MS = 5 * 60 * 1000; // 5 minutes
    const lastFetched = Number(localStorage.getItem('smokey_settings_fetched_at') || 0);
    const isStale = Date.now() - lastFetched > SETTINGS_TTL_MS;

    if (!isStale) return; // Use cached localStorage data, skip the Supabase request

    Promise.all([
      publicSupabase.from('app_settings').select('value').eq('key', 'delivery_options').single(),
      publicSupabase.from('app_settings').select('value').eq('key', 'ticker_items').single(),
      publicSupabase.from('app_settings').select('value').eq('key', 'bank_details').single(),
    ]).then(([deliveryRes, tickerRes, bankRes]) => {
      localStorage.setItem('smokey_settings_fetched_at', String(Date.now()));
      setSettingsState(prev => ({
        ...prev,
        ...(Array.isArray(deliveryRes.data?.value) && deliveryRes.data.value.length > 0
          ? { deliveryOptions: deliveryRes.data.value } : {}),
        ...(Array.isArray(tickerRes.data?.value) && tickerRes.data.value.length > 0
          ? { tickerItems: tickerRes.data.value } : {}),
        ...(bankRes.data?.value ? bankRes.data.value : {}),
      }));
    });

    // Cross-tab sync via BroadcastChannel — only fires in other tabs, never loops back
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('smokey_settings_bc');
      bc.onmessage = (e) => {
        if (e.data?.type === 'settings_updated') {
          setSettingsState(prev => ({ ...prev, ...e.data.settings }));
        }
      };
      bcRef.current = bc;
      return () => bc.close();
    }
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
    if (newSettings.bankName !== undefined || newSettings.accountName !== undefined || newSettings.accountNumber !== undefined) {
      const bankDetails = { bankName: newSettings.bankName, accountName: newSettings.accountName, accountNumber: newSettings.accountNumber };
      upserts.push(supabase.from('app_settings').upsert({ key: 'bank_details', value: bankDetails, updated_at: new Date().toISOString() }));
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
