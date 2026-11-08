import './config.js'; // loads .env before the Supabase settings are read
import { createClient } from '@supabase/supabase-js';

const getUrl = () => process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const getKey = () =>
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY;

export const supabase = (getUrl() && getKey())
  ? createClient(getUrl(), getKey(), {
      auth: { persistSession: false },
    })
  : null;

/** Supabase is the database whenever it is configured (SUPABASE_SYNC=off forces the local file). */
export const SYNC_ON = !!supabase && process.env.SUPABASE_SYNC !== 'off';

/**
 * Pings Supabase to prevent the Free Tier from automatically pausing after 7 days of inactivity.
 */
export async function pingSupabase() {
  const url = getUrl();
  const key = getKey();

  if (!url || !key) {
    return { ok: false, message: 'Supabase URL or API key not set' };
  }

  try {
    const base = url.replace(/\/$/, '');
    // Ping Auth service health endpoint (works with publishable, anon, or service role keys)
    const endpoint = `${base}/auth/v1/health`;
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });

    console.log(`[Supabase Keep-Alive] Pinged Supabase at ${new Date().toISOString()} (HTTP ${res.status}). Inactivity timer reset!`);
    return { ok: true, status: res.status, service: 'auth-health', timestamp: new Date().toISOString() };
  } catch (err) {
    console.error('[Supabase Keep-Alive] Ping failed:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Starts automatic keep-alive timer that pings Supabase once every 24 hours.
 */
export function startKeepAlive() {
  const url = getUrl();
  const key = getKey();

  if (!url || !key) {
    console.log('[Supabase Keep-Alive] Credentials not configured in .env yet. Auto-ping will activate once SUPABASE_URL and SUPABASE_ANON_KEY are set.');
    return;
  }

  // Ping immediately on start
  pingSupabase();

  // Then ping once every 24 hours (86,400,000 ms)
  const INTERVAL_24H = 24 * 60 * 60 * 1000;
  const timer = setInterval(() => {
    pingSupabase();
  }, INTERVAL_24H);

  if (timer.unref) timer.unref();
}
