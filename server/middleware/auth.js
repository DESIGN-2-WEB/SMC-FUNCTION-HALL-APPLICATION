import jwt from 'jsonwebtoken';
import { get, run, secret } from '../db.js';

export const publicUser = u => ({ id: u.id, username: u.username, name: u.name, role: u.role });
export const signToken = (u, sid = null) => jwt.sign({ id: u.id, sid }, secret, { expiresIn: '7d' });

export function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  try {
    const payload = jwt.verify(token, secret);
    const user = get('SELECT * FROM users WHERE id = ? AND active = 1', payload.id);
    if (!user) throw new Error('inactive');
    req.user = publicUser(user);
    req.sessionId = payload.sid || null;

    // Refresh last active timestamp for current session (at most once a minute, so
    // simply viewing pages doesn't cause a database write on every request)
    if (req.sessionId) {
      try {
        run(`UPDATE user_sessions SET last_active_at = datetime('now', 'localtime')
             WHERE id = ? AND status = 'active' AND last_active_at < datetime('now', 'localtime', '-60 seconds')`,
          req.sessionId);
      } catch {
        // non-blocking
      }
    }

    next();
  } catch {
    res.status(401).json({ error: 'Please sign in again' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Only the admin can do this' });
  next();
}
