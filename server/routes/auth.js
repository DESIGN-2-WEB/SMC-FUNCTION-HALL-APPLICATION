import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { all, get, log, run } from '../db.js';
import { endSessions, publicUser, requireAuth, signToken } from '../middleware/auth.js';

const r = Router();
export default r;

// Brute-force guard (15-minute window) that a stranger can't use to lock the real user out:
// - one login name from one address: blocked after 10 wrong passwords;
// - one address overall: blocked after 30 (higher: an office can share one address);
// - one login name from anywhere: after 20 wrong passwords it is slowed to one try every
//   10 seconds instead of blocked, so the real user waits a few seconds at most while
//   guessing becomes far too slow to work.
// Only real login names are tracked, and old entries are cleared, so the list stays small.
const failures = new Map();
const WINDOW = 15 * 60 * 1000;
const PAIR_LIMIT = 10;
const IP_LIMIT = 30;
const NAME_SLOW_AFTER = 20;
const NAME_SLOW_GAP = 10 * 1000;

const fresh = (k, now) => {
  const f = failures.get(k);
  return f && now - f.first < WINDOW ? f : null;
};
const recordFailure = (k, now) => {
  const f = fresh(k, now);
  failures.set(k, f ? { ...f, count: f.count + 1, last: now } : { count: 1, first: now, last: now });
};
const pruneFailures = now => {
  if (failures.size < 500) return;
  for (const [k, f] of failures) if (now - f.first >= WINDOW) failures.delete(k);
};


// Names for the login dropdown (no passwords or ids exposed)
r.get('/users', (req, res) =>
  res.json(all("SELECT username, name, role FROM users WHERE active = 1 ORDER BY role = 'admin' DESC, name")));

// Device / browser parser for staff login logs
export function parseDevice(ua = '') {
  if (!ua) return 'Web Browser';
  let os = 'Desktop';
  if (/windows nt 10/i.test(ua)) os = 'Windows 10/11';
  else if (/windows/i.test(ua)) os = 'Windows PC';
  else if (/android/i.test(ua)) os = 'Android Mobile';
  else if (/iphone/i.test(ua)) os = 'iPhone';
  else if (/ipad/i.test(ua)) os = 'iPad';
  else if (/macintosh|mac os x/i.test(ua)) os = 'Mac OS';
  else if (/linux/i.test(ua)) os = 'Linux';

  let browser = 'Browser';
  if (/edg/i.test(ua)) browser = 'Edge';
  else if (/chrome|crios/i.test(ua)) browser = 'Chrome';
  else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
  else if (/safari/i.test(ua)) browser = 'Safari';

  return `${os} · ${browser}`;
}

r.post('/login', (req, res) => {
  // req.ip follows the server's "trust proxy" setting, so a client can't fake it with a header
  const ip = String(req.ip || req.socket?.remoteAddress || '').replace('::ffff:', '').trim();
  const { username = '', password = '' } = req.body || {};
  const name = String(username).trim().toLowerCase();
  const now = Date.now();
  pruneFailures(now);
  const ipKey = `ip:${ip}`;
  const pairKey = `pair:${name}|${ip}`;
  const nameKey = `name:${name}`;
  const ipF = fresh(ipKey, now);
  const pairF = fresh(pairKey, now);
  if ((ipF && ipF.count >= IP_LIMIT) || (pairF && pairF.count >= PAIR_LIMIT))
    return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  const nameF = fresh(nameKey, now);
  if (nameF && nameF.count >= NAME_SLOW_AFTER && now - nameF.last < NAME_SLOW_GAP)
    return res.status(429).json({ error: 'Too many attempts on this login. Wait 10 seconds and try again.' });

  const user = get('SELECT * FROM users WHERE username = ? AND active = 1', String(username).trim());
  if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
    recordFailure(ipKey, now);
    if (user) {
      recordFailure(pairKey, now);
      recordFailure(nameKey, now);
    }
    return res.status(401).json({ error: 'Wrong password' });
  }
  failures.delete(pairKey);
  failures.delete(nameKey);

  const ua = req.headers['user-agent'] || '';
  const deviceInfo = parseDevice(ua);

  // Auto-close any prior unclosed session for this user
  run(`
    UPDATE user_sessions
    SET status = 'timed_out',
        logout_time = last_active_at,
        duration_seconds = MAX(0, CAST((strftime('%s', last_active_at) - strftime('%s', login_time)) AS INTEGER))
    WHERE user_id = ? AND status = 'active'
  `, user.id);

  // Create new active session record
  const { id: sessionId } = run(`
    INSERT INTO user_sessions (user_id, login_time, last_active_at, ip_address, user_agent, device_info, status)
    VALUES (?, datetime('now', 'localtime'), datetime('now', 'localtime'), ?, ?, ?, 'active')
  `, user.id, ip || 'Localhost', ua, deviceInfo);

  log(user.id, 'signed in', `${deviceInfo}${ip ? ' (' + ip + ')' : ''}`);
  res.json({ token: signToken(user, sessionId), user: publicUser(user), sessionId });
});

r.post('/logout', requireAuth, (req, res) => {
  const sid = req.sessionId;
  if (sid) {
    run(`
      UPDATE user_sessions
      SET logout_time = datetime('now', 'localtime'),
          last_active_at = datetime('now', 'localtime'),
          status = 'logged_out',
          duration_seconds = MAX(0, CAST((strftime('%s', 'now', 'localtime') - strftime('%s', login_time)) AS INTEGER))
      WHERE id = ? AND status = 'active'
    `, sid);
    // Already auto-closed as timed_out (e.g. signed in again on another device): it must
    // still end now, or this device's sign-in would keep working
    run("UPDATE user_sessions SET status = 'logged_out' WHERE id = ? AND status = 'timed_out'", sid);
  } else {
    run(`
      UPDATE user_sessions
      SET logout_time = datetime('now', 'localtime'),
          last_active_at = datetime('now', 'localtime'),
          status = 'logged_out',
          duration_seconds = MAX(0, CAST((strftime('%s', 'now', 'localtime') - strftime('%s', login_time)) AS INTEGER))
      WHERE user_id = ? AND status = 'active'
    `, req.user.id);
  }
  log(req.user.id, 'signed out');
  res.json({ ok: true });
});

r.post('/ping', requireAuth, (req, res) => {
  const sid = req.sessionId;
  if (sid) {
    run("UPDATE user_sessions SET last_active_at = datetime('now', 'localtime') WHERE id = ? AND status = 'active'", sid);
  }
  res.json({ ok: true });
});

r.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

r.put('/profile', requireAuth, (req, res) => {
  const name = String(req.body.name || '').trim();
  const username = String(req.body.username || '').toLowerCase().trim();
  if (!name) return res.status(400).json({ error: 'Name is required' });
  if (username && !/^[a-z0-9._-]{3,30}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 3–30 letters/numbers (no spaces)' });
  }
  const targetUsername = username || req.user.username;
  const existing = get('SELECT id FROM users WHERE username = ? AND id <> ?', targetUsername, req.user.id);
  if (existing) return res.status(409).json({ error: 'That username is already taken' });

  run('UPDATE users SET name = ?, username = ? WHERE id = ?', name, targetUsername, req.user.id);
  const updatedUser = get('SELECT id, username, name, role FROM users WHERE id = ?', req.user.id);
  log(req.user.id, 'updated own account profile', `${targetUsername} (${name})`);
  res.json({ user: publicUser(updatedUser) });
});

r.post('/password', requireAuth, (req, res) => {
  const { current = '', next = '' } = req.body || {};
  const user = get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!bcrypt.compareSync(String(current), user.password_hash))
    return res.status(400).json({ error: 'Current password is incorrect' });
  if (String(next).length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
  run('UPDATE users SET password_hash = ? WHERE id = ?', bcrypt.hashSync(String(next), 10), user.id);
  endSessions(user.id, req.sessionId); // sign out every other device; this one stays signed in
  log(user.id, 'changed own password');
  res.json({ ok: true });
});
