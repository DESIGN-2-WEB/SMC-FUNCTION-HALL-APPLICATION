import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { DEMO } from '../config.js';
import { all, get, log, run } from '../db.js';
import { publicUser, requireAuth, signToken } from '../middleware/auth.js';

const r = Router();
export default r;

// Brute-force guard: 10 failed attempts per IP per 15 minutes
const failures = new Map();
const WINDOW = 15 * 60 * 1000;

r.get('/demo', (req, res) => res.json({ demo: DEMO }));

// Names for the login dropdown (no passwords or ids exposed)
r.get('/users', (req, res) =>
  res.json(all("SELECT username, name, role FROM users WHERE active = 1 ORDER BY role = 'admin' DESC, name")));

r.post('/login', (req, res) => {
  const ip = req.ip;
  const f = failures.get(ip);
  if (f && f.count >= 10 && Date.now() - f.first < WINDOW)
    return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });

  const { username = '', password = '' } = req.body || {};
  const user = get('SELECT * FROM users WHERE username = ? AND active = 1', String(username).trim());
  if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
    const cur = f && Date.now() - f.first < WINDOW ? f : { count: 0, first: Date.now() };
    failures.set(ip, { ...cur, count: cur.count + 1 });
    return res.status(401).json({ error: 'Wrong password' });
  }
  failures.delete(ip);
  log(user.id, 'signed in');
  res.json({ token: signToken(user), user: publicUser(user) });
});

r.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

r.post('/password', requireAuth, (req, res) => {
  const { current = '', next = '' } = req.body || {};
  const user = get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!bcrypt.compareSync(String(current), user.password_hash))
    return res.status(400).json({ error: 'Current password is incorrect' });
  if (String(next).length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
  run('UPDATE users SET password_hash = ? WHERE id = ?', bcrypt.hashSync(String(next), 10), user.id);
  log(user.id, 'changed own password');
  res.json({ ok: true });
});
