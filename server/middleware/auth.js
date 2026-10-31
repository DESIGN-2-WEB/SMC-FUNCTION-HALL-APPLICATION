import jwt from 'jsonwebtoken';
import { get, secret } from '../db.js';

export const publicUser = u => ({ id: u.id, username: u.username, name: u.name, role: u.role });
export const signToken = u => jwt.sign({ id: u.id }, secret, { expiresIn: '7d' });

export function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  try {
    const { id } = jwt.verify(token, secret);
    const user = get('SELECT * FROM users WHERE id = ? AND active = 1', id);
    if (!user) throw new Error('inactive');
    req.user = publicUser(user);
    next();
  } catch {
    res.status(401).json({ error: 'Please sign in again' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Only the admin can do this' });
  next();
}
