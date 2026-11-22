import jwt from 'jsonwebtoken';
import { get, run, secret } from '../db.js';

export const publicUser = u => ({ id: u.id, username: u.username, name: u.name, role: u.role });
export const signToken = (u, sid = null) => jwt.sign({ id: u.id, sid }, secret, { expiresIn: '7d' });

/**
 * The signed-in user of a request, or null (no token, a bad or expired one, an inactive user,
 * or a session that was signed out). Never answers the request itself.
 */
export function userOf(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  try {
    const payload = jwt.verify(token, secret);
    const user = get('SELECT * FROM users WHERE id = ? AND active = 1', payload.id);
    if (!user) return null;
    // Every sign-in has a session record. Signing out, the admin's "end session", and a
    // password change mark it logged_out, which ends that sign-in everywhere right away.
    // (Sessions only auto-closed as timed_out are tracking, not a sign-out, and stay valid.)
    const session = payload.sid ? get('SELECT user_id, status FROM user_sessions WHERE id = ?', payload.sid) : null;
    if (!session || session.user_id !== user.id || session.status === 'logged_out') return null;
    return { user: publicUser(user), sid: payload.sid };
  } catch {
    return null;
  }
}

export function requireAuth(req, res, next) {
  const who = userOf(req);
  if (!who) return res.status(401).json({ error: 'Please sign in again' });
  req.user = who.user;
  req.sessionId = who.sid;

  // Refresh last active timestamp for current session (at most once a minute, so
  // simply viewing pages doesn't cause a database write on every request)
  try {
    run(`UPDATE user_sessions SET last_active_at = datetime('now', 'localtime')
         WHERE id = ? AND status = 'active' AND last_active_at < datetime('now', 'localtime', '-60 seconds')`,
      req.sessionId);
  } catch {
    // non-blocking
  }
  next();
}

/** Sign a user out everywhere (except, optionally, the session making the change). */
export function endSessions(userId, exceptSid = null) {
  run(`UPDATE user_sessions
       SET status = 'logged_out',
           duration_seconds = CASE WHEN logout_time IS NULL
             THEN MAX(0, CAST((strftime('%s', 'now', 'localtime') - strftime('%s', login_time)) AS INTEGER))
             ELSE duration_seconds END,
           logout_time = COALESCE(logout_time, datetime('now', 'localtime'))
       WHERE user_id = ? AND status <> 'logged_out' AND id IS NOT ?`, userId, exceptSid);
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Only the admin can do this' });
  next();
}
