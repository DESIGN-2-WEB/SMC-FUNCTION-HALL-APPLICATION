import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { all, get, log, pruneActivity, run } from '../db.js';
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

r.get('/sessions', (req, res) => {
  // Auto-close stale sessions inactive for > 30 minutes
  run(`
    UPDATE user_sessions
    SET status = 'timed_out',
        logout_time = last_active_at,
        duration_seconds = MAX(0, CAST((strftime('%s', last_active_at) - strftime('%s', login_time)) AS INTEGER))
    WHERE status = 'active'
      AND last_active_at < datetime('now', 'localtime', '-30 minutes')
  `);

  const userId = req.query.user_id ? Number(req.query.user_id) : null;
  const status = str(req.query.status);
  const period = str(req.query.period) || 'all';
  const q = str(req.query.q);

  const where = [];
  const args = [];

  if (userId) {
    where.push('s.user_id = ?');
    args.push(userId);
  }

  if (status && status !== 'all') {
    where.push('s.status = ?');
    args.push(status);
  }

  if (period === 'today') {
    where.push("s.login_time >= date('now', 'localtime')");
  } else if (period === 'yesterday') {
    where.push("s.login_time >= date('now', 'localtime', '-1 day') AND s.login_time < date('now', 'localtime')");
  } else if (period === 'week') {
    where.push("s.login_time >= date('now', 'localtime', '-7 days')");
  }

  if (q) {
    where.push('(u.name LIKE ? OR u.username LIKE ? OR s.ip_address LIKE ? OR s.device_info LIKE ?)');
    args.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const sessions = all(`
    SELECT s.*,
           u.name AS user_name,
           u.username,
           u.role,
           CASE
             WHEN s.status = 'active' THEN MAX(0, CAST((strftime('%s', 'now', 'localtime') - strftime('%s', s.login_time)) AS INTEGER))
             ELSE s.duration_seconds
           END AS duration_seconds_calc
    FROM user_sessions s
    JOIN users u ON u.id = s.user_id
    ${whereClause}
    ORDER BY (s.status = 'active') DESC, s.id DESC
    LIMIT 500
  `, ...args);

  // Overall metrics for owner
  const activeNowList = all(`
    SELECT s.id, s.user_id, u.name AS user_name, u.role, s.login_time, s.device_info, s.ip_address,
           MAX(0, CAST((strftime('%s', 'now', 'localtime') - strftime('%s', s.login_time)) AS INTEGER)) AS duration_seconds
    FROM user_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.status = 'active'
    ORDER BY s.id DESC
  `);

  const todayStats = get(`
    SELECT COUNT(*) AS count,
           COALESCE(SUM(
             CASE
               WHEN status = 'active' THEN MAX(0, CAST((strftime('%s', 'now', 'localtime') - strftime('%s', login_time)) AS INTEGER))
               ELSE duration_seconds
             END
           ), 0) AS total_duration_seconds,
           COUNT(DISTINCT user_id) AS unique_staff
    FROM user_sessions
    WHERE login_time >= date('now', 'localtime')
  `) || { count: 0, total_duration_seconds: 0, unique_staff: 0 };

  res.json({
    sessions,
    metrics: {
      active_now_count: activeNowList.length,
      active_now_staff: activeNowList,
      today_sessions_count: todayStats.count,
      today_duration_seconds: todayStats.total_duration_seconds,
      today_unique_staff: todayStats.unique_staff,
    },
  });
});

// Force sign-out / end active session (Admin only)
r.post('/sessions/:id/terminate', (req, res) => {
  const session = found(get('SELECT * FROM user_sessions WHERE id = ?', req.params.id), 'Session');
  if (session.status !== 'active') fail('This session is not currently active');

  run(`
    UPDATE user_sessions
    SET status = 'logged_out',
        logout_time = datetime('now', 'localtime'),
        last_active_at = datetime('now', 'localtime'),
        duration_seconds = MAX(0, CAST((strftime('%s', 'now', 'localtime') - strftime('%s', login_time)) AS INTEGER))
    WHERE id = ?
  `, session.id);

  const u = get('SELECT name FROM users WHERE id = ?', session.user_id);
  log(req.user.id, 'terminated staff session', `${u?.name || 'User'} (Session #${session.id})`);
  res.json({ ok: true });
});

activity.get('/', (req, res) => {
  pruneActivity();
  res.json(all("SELECT a.*, u.name AS user_name, u.role FROM activity a LEFT JOIN users u ON u.id = a.user_id WHERE a.created_at >= datetime('now', 'localtime', '-7 days') ORDER BY a.id DESC"));
});
