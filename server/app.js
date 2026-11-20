import express from 'express';
import compression from 'compression';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { IS_PRODUCTION } from './config.js';
import { ROOT } from './db.js';
import { applyDefaults, migrate, seed } from './schema.js';
import { SYNC_ON, commit, installSyncTriggers, isStale, lastSeq, pullAll, syncMiddleware } from './sync.js';
import api from './routes/index.js';

try {
  migrate();
  installSyncTriggers();
  if (SYNC_ON) {
    try {
      await pullAll();
      console.log('[sync] Loaded data from MySQL');
    } catch (err) {
      console.error('[sync] Could not load from MySQL yet, will retry on the next request:', err.message);
    }
  }
  // Defaults and first-run data only once we know what the real database holds
  if (!SYNC_ON || !isStale()) {
    applyDefaults();
    seed();
    if (SYNC_ON) await commit(0, lastSeq()).catch(err => console.error('[sync] Saving defaults failed:', err.message));
  }
} catch (err) {
  console.error('Database migration/seed error:', err);
}

const app = express();
// Which proxies may report the visitor's address (used for login limits and the session log).
// TRUST_PROXY = number of proxy hops in front of the app (e.g. 1 or 2 on a hosted platform);
// without it only local proxies are trusted, so a visitor can't fake their address.
const hops = Number(process.env.TRUST_PROXY);
app.set('trust proxy', Number.isInteger(hops) && hops > 0 ? hops : 'loopback');
app.disable('x-powered-by');
// Gzip pages, scripts and API replies: the app's main script shrinks to about a third
app.use(compression());

// Browser security headers for every response
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff', // never guess file types
    'X-Frame-Options': 'DENY', // the app can't be shown inside another site (clickjacking)
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups', // receipts open in a popup
    // Only this site's own scripts may run; styles and fonts also from Google Fonts.
    // 'unsafe-inline' styles are needed by animation libraries and the printed receipts.
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '),
    ...(req.secure ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
  });
  next();
});

app.use(express.json({ limit: '1mb' }));

// A hosted copy without a database would keep data only until it restarts. Refuse to run
// rather than lose bookings (e.g. an old Vercel deployment left online after the move).
const NO_DATABASE = !SYNC_ON && (IS_PRODUCTION || !!process.env.VERCEL);
if (NO_DATABASE) console.error('[mysql] No MySQL database configured: the API is disabled on this server.');
app.use('/api', (req, res, next) =>
  NO_DATABASE
    ? res.status(503).json({ error: 'This copy of the app is not connected to a database. Please use the main website.' })
    : next());

app.use('/api', syncMiddleware, api);

// The built React app is served from /dist
const dist = join(ROOT, 'dist');
if (existsSync(dist)) {
  // Built scripts and styles have a content hash in their names, so browsers may keep them
  // for a year; index.html is always re-checked so a new deploy is picked up at once
  app.use(express.static(dist, {
    setHeaders(res, path) {
      res.setHeader('Cache-Control', /[\\/]assets[\\/]/.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  }));
  app.get('/{*path}', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(join(dist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  if (/UNIQUE constraint failed/.test(err.message))
    return res.status(409).json({ error: 'That name or number already exists' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.expose ? err.message : 'Something went wrong on the server' });
});

export default app;
