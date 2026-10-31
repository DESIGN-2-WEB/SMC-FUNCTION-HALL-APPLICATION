import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { all, get, log, run } from '../db.js';
import { fail, found, str } from '../lib/http.js';

// Both routers are mounted behind requireAdmin
const r = Router();
export default r;
export const activity = Router();

const USERNAME = /^[a-z0-9._-]{3,30}$/;
const adminCount = () => get("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1").n;

r.get('/', (req, res) =>
  res.json(all(`SELECT u.id, u.username, u.name, u.role, u.active, u.created_at,
                (SELECT MAX(created_at) FROM activity a WHERE a.user_id = u.id AND a.action = 'signed in') AS last_login
                FROM users u ORDER BY u.role, u.id`)));

r.post('/', (req, res) => {
  const username = str(req.body.username).toLowerCase(), name = str(req.body.name), password = String(req.body.password || '');
  const role = req.body.role === 'admin' ? 'admin' : 'staff';
  if (!USERNAME.test(username)) fail('Username must be 3–30 letters/numbers (no spaces)');
  if (!name) fail('Name is required');
  if (password.length < 6) fail('Password must be at least 6 characters');
  const { id } = run('INSERT INTO users (username, name, password_hash, role) VALUES (?, ?, ?, ?)',
    username, name, bcrypt.hashSync(password, 10), role);
  log(req.user.id, 'login created', `${username} (${role})`);
  res.status(201).json({ id });
});

r.put('/:id', (req, res) => {
  const u = found(get('SELECT * FROM users WHERE id = ?', req.params.id), 'User');
  const username = str(req.body.username).toLowerCase() || u.username, name = str(req.body.name) || u.name;
  const role = req.body.role === 'admin' ? 'admin' : 'staff';
  const active = req.body.active === false || req.body.active === 0 ? 0 : 1;
  const password = String(req.body.password || '');
  if (!USERNAME.test(username)) fail('Username must be 3–30 letters/numbers (no spaces)');
  if (u.id === req.user.id && (role !== 'admin' || !active)) fail('You cannot remove your own admin access');
  if (u.role === 'admin' && u.active && (role !== 'admin' || !active) && adminCount() <= 1) fail('At least one active admin is required');
  if (password && password.length < 6) fail('Password must be at least 6 characters');
  run('UPDATE users SET username = ?, name = ?, role = ?, active = ? WHERE id = ?', username, name, role, active, u.id);
  if (password) run('UPDATE users SET password_hash = ? WHERE id = ?', bcrypt.hashSync(password, 10), u.id);
  log(req.user.id, 'login updated', `${username}${password ? ' · password reset' : ''}${active ? '' : ' · disabled'}`);
  res.json({ ok: true });
});

r.delete('/:id', (req, res) => {
  const u = found(get('SELECT * FROM users WHERE id = ?', req.params.id), 'User');
  if (u.id === req.user.id) fail('You cannot delete your own login');
  if (u.role === 'admin' && adminCount() <= 1) fail('At least one active admin is required');
  run('DELETE FROM users WHERE id = ?', u.id);
  log(req.user.id, 'login deleted', u.username);
  res.json({ ok: true });
});

activity.get('/', (req, res) =>
  res.json(all('SELECT a.*, u.name AS user_name, u.role FROM activity a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 300')));
