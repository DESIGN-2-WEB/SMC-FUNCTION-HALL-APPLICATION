import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ON_VERCEL } from './config.js';
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
      console.log('[sync] Loaded data from Supabase');
    } catch (err) {
      console.error('[sync] Could not load from Supabase yet, will retry on the next request:', err.message);
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
// Behind Vercel's proxy every request comes through it; locally only loopback proxies are trusted
app.set('trust proxy', ON_VERCEL ? true : 'loopback');
app.use(express.json({ limit: '1mb' }));
app.use('/api', syncMiddleware, api);

// Locally the built React app is served from /dist (on Vercel, its CDN serves it)
const dist = join(ROOT, 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get('/{*path}', (req, res) => res.sendFile(join(dist, 'index.html')));
}

app.use((err, req, res, next) => {
  if (/UNIQUE constraint failed/.test(err.message))
    return res.status(409).json({ error: 'That name or number already exists' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.expose ? err.message : 'Something went wrong on the server' });
});

export default app;
