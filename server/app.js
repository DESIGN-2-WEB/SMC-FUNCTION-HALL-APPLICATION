import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ON_VERCEL } from './config.js';
import { ROOT } from './db.js';
import { migrate, seed } from './schema.js';
import api from './routes/index.js';

try {
  migrate();
  seed();
} catch (err) {
  console.error('Database migration/seed error:', err);
}

const app = express();
// Behind Vercel's proxy every request comes through it; locally only loopback proxies are trusted
app.set('trust proxy', ON_VERCEL ? true : 'loopback');
app.use(express.json({ limit: '1mb' }));
app.use('/api', api);

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
