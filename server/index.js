import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './db.js';
import { migrate, seed } from './schema.js';
import api from './routes/index.js';

migrate();
seed();

const app = express();
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '1mb' }));
app.use('/api', api);

// In production the built React app is served from /dist
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

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => console.log(`Penta Kedarnath server running on http://localhost:${PORT}`));
