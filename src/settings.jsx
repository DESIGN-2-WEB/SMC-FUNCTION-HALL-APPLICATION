import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

export const DEFAULT_GENERATORS = [
  { name: '120 kVA', rate: 1500 },
  { name: '30 kVA', rate: 450 },
];

export const defaultSettings = {
  property_name: 'SMC Function Hall (A/C)',
  property_short: 'SMC Function Hall',
  property_tagline: 'Kalyana Mandapam & Function Hall',
  banner_name: 'Penta Jayashankararao',
  address: 'Next to BOI (Bank of India), K.T. Road, Palasa – Kasibugga',
  phone: '94411 17278 / 94410 89616',
  facilities: 'A/C halls, parking, rooms and lift available',
  power_rate: '15',
  gen_120kva_rate: '1500',
  gen_30kva_rate: '450',
  generators: JSON.stringify(DEFAULT_GENERATORS),
  event_types: 'Wedding, Engagement, Half Saree, Birthday, Meetings, Reception, Corporate, Other',
  supply_categories: 'Cooking Vessels, Kitchen Utensils & Accessories, Serving & Tableware, Stoves & Fuel, Furniture & Tents, Containers & Water',
};

const SettingsContext = createContext({
  settings: defaultSettings,
  reload: async () => {},
  loading: false,
});

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    try {
      const data = await api('/settings');
      if (data && typeof data === 'object') {
        setSettings(data);
      }
    } catch {
      // Keep defaults if unreachable
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, reload, loading }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
