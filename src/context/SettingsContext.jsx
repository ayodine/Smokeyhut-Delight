import React, { createContext, useContext, useState, useEffect } from 'react';

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
  ]
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

  useEffect(() => {
    localStorage.setItem('smokey_settings', JSON.stringify(settings));
  }, [settings]);

  // Merge so we can update only parts of the settings
  const setSettings = (newSettings) => {
    setSettingsState(prev => ({ ...prev, ...newSettings }));
  };

  return (
    <SettingsContext.Provider value={{ settings, setSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
