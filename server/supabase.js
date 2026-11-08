import './config.js'; // loads .env before the Supabase settings are read
import { createClient } from '@supabase/supabase-js';

const getUrl = () => process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

// The server should use the SECRET key (sb_secret_... or the legacy service_role key). It bypasses
// row-level security, so the tables can be locked against the public/publishable key.
// It is only ever read on the server; never give it a VITE_ or NEXT_PUBLIC_ name.
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const getKey = () =>
  SECRET_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY;

/** True when the server is using the secret key (required once row-level security is on). */
export const USING_SECRET_KEY = !!SECRET_KEY;
if (getUrl() && getKey() && !USING_SECRET_KEY) {
  console.warn('[Supabase] Using the public key. Set SUPABASE_SECRET_KEY before turning on row-level security.');
}

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
    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    // A real database read is what counts as activity; the auth health check is a second signal
    const [db, auth] = await Promise.all([
      fetch(`${base}/rest/v1/settings?select=key&limit=1`, { headers }),
      fetch(`${base}/auth/v1/health`, { headers }),
    ]);
    const ok = db.ok && auth.ok;

    console.log(`[Supabase Keep-Alive] ${new Date().toISOString()} database HTTP ${db.status}, auth HTTP ${auth.status}${ok ? '' : ' (FAILED)'}`);
    return { ok, database: db.status, auth: auth.status, timestamp: new Date().toISOString() };
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
