import { useMemo, useState } from 'react';
import {
  Clock,
  History,
  KeyRound,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserCheck,
  UserRound,
  Users as UsersIcon,
  Wifi,
} from 'lucide-react';
import { api } from '../api.js';
import { useApi, useRemove, useSave } from '../hooks.js';
import { useAuth } from '../auth.jsx';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Form,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  Segmented,
  StatCard,
  cn,
  useUI,
} from '../components/ui.jsx';
import { fmtDateTime, fmtDurationWords, fmtTime, relDay } from '../utils.js';
import { Select } from '../components/pickers.jsx';

export default function Users() {
  const { user: me } = useAuth();
  const { data: users, reload: reloadUsers } = useApi('/users');
  const { toast } = useUI();
  const remove = useRemove();

  const [tab, setTab] = useState('accounts'); // 'accounts' | 'sessions'
  const [edit, setEdit] = useState(null);

  // Sessions filter state
  const [selectedUser, setSelectedUser] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedPeriod, setSelectedPeriod] = useState('all'); // 'all' | 'today' | 'yesterday' | 'week'
  const [searchQuery, setSearchQuery] = useState('');
  const [terminatingId, setTerminatingId] = useState(null);

  // Build sessions query
  const sessionsQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedUser !== 'all') params.set('user_id', selectedUser);
    if (selectedStatus !== 'all') params.set('status', selectedStatus);
    if (selectedPeriod !== 'all') params.set('period', selectedPeriod);
    if (searchQuery.trim()) params.set('q', searchQuery.trim());
    return params.toString();
  }, [selectedUser, selectedStatus, selectedPeriod, searchQuery]);

  const { data: sessionsData, reload: reloadSessions } = useApi(
    `/users/sessions${sessionsQuery ? `?${sessionsQuery}` : ''}`
  );

  const deleteUser = u =>
    remove(`/users/${u.id}`, {
      title: `Delete ${u.name}?`,
      message: 'This login will stop working immediately. Their past bookings and login logs stay on record.',
      success: 'Login deleted',
      done: () => {
        reloadUsers();
        reloadSessions();
      },
    });

  const handleTerminateSession = async session => {
    if (!window.confirm(`Force sign out ${session.user_name} and end this active session?`)) return;
    setTerminatingId(session.id);
    try {
      await api(`/users/sessions/${session.id}/terminate`, { method: 'POST' });
      toast(`Ended session for ${session.user_name}`);
      reloadSessions();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setTerminatingId(null);
    }
  };

  if (!users) return <PageLoader />;

  const activeStaffList = sessionsData?.metrics?.active_now_staff || [];
  const activeStaffIds = new Set(activeStaffList.map(s => s.user_id));
  const metrics = sessionsData?.metrics || {
    active_now_count: 0,
    today_sessions_count: 0,
    today_duration_seconds: 0,
    today_unique_staff: 0,
  };

  const sessions = sessionsData?.sessions || [];

  return (
    <>
      <PageHeader
        title="Staff & Login Attendance"
        subtitle="Manage login credentials, monitor staff logins, logout times, and total work stay duration"
        actions={
          <div className="flex items-center gap-2">
            {tab === 'sessions' && (
              <Button
                variant="outline"
                icon={RefreshCw}
                onClick={reloadSessions}
                title="Refresh live session logs"
              >
                Refresh Logs
              </Button>
            )}
            <Button variant="gold" icon={Plus} onClick={() => setEdit({})}>
              Add Login
            </Button>
          </div>
        }
      />

      {/* Main Tabs */}
      <Segmented
        className="mb-6"
        value={tab}
        onChange={setTab}
        options={[
          {
            value: 'accounts',
            label: `Staff Accounts (${users.length})`,
            icon: UsersIcon,
          },
          {
            value: 'sessions',
            label: `Login & Stay Duration Logs ${metrics.active_now_count > 0 ? `(${metrics.active_now_count} online)` : ''}`,
            icon: Clock,
          },
        ]}
      />

      {/* TAB 1: STAFF ACCOUNTS */}
      {tab === 'accounts' && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {users.map((u, i) => {
            const isOnline = activeStaffIds.has(u.id);
            return (
              <Card
                key={u.id}
                style={{ animationDelay: `${i * 50}ms` }}
                className={cn('animate-rise p-5', !u.active && 'opacity-60')}
              >
                <div className="flex items-start gap-4">
                  <div className="relative">
                    <Avatar name={u.name} className="h-12 w-12 text-sm" />
                    {isOnline && (
                      <span
                        className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500"
                        title="Currently logged in"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="truncate font-semibold text-ink-900">
                        {u.name}{' '}
                        {u.id === me.id && (
                          <span className="text-xs font-normal text-stone-400">(you)</span>
                        )}
                      </p>
                    </div>
                    <p className="text-sm text-stone-500">@{u.username}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge tone={u.role === 'admin' ? 'gold' : 'blue'}>
                        {u.role === 'admin' ? 'Admin · full access' : 'Staff'}
                      </Badge>
                      {isOnline ? (
                        <Badge tone="green" dot>
                          Online now
                        </Badge>
                      ) : (
                        <Badge tone="stone">Offline</Badge>
                      )}
                      {!u.active && <Badge tone="rose">Disabled</Badge>}
                    </div>
                  </div>
                  <div className="flex">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setEdit(u)}
                      title="Edit Account"
                    >
                      <Pencil size={15} />
                    </Button>
                    {u.id !== me.id && (
                      <Button
                        size="icon"
                        variant="danger-soft"
                        onClick={() => deleteUser(u)}
                        title="Delete Account"
                      >
                        <Trash2 size={15} />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="mt-4 border-t border-stone-100 pt-3 flex items-center justify-between text-xs text-stone-400">
                  <span>Last sign-in:</span>
                  <span className="font-medium text-stone-600">
                    {u.last_login ? fmtDateTime(u.last_login) : 'Never'}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* TAB 2: LOGIN & STAY DURATION LOGS */}
      {tab === 'sessions' && (
        <div className="space-y-6">
          {/* Summary Stat Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={Wifi}
              label="Currently Online"
              value={`${metrics.active_now_count} active`}
              sub={metrics.active_now_count > 0 ? 'Staff on system right now' : 'No staff currently online'}
              accent={metrics.active_now_count > 0 ? 'green' : 'ink'}
            />
            <StatCard
              icon={LogIn}
              label="Today's Logins"
              value={metrics.today_sessions_count}
              sub={`${metrics.today_unique_staff} staff members on duty today`}
              accent="ink"
            />
            <StatCard
              icon={Clock}
              label="Today's Stay Duration"
              value={fmtDurationWords(metrics.today_duration_seconds)}
              sub="Cumulative staff hours today"
              accent="gold"
            />
            <StatCard
              icon={UserCheck}
              label="Staff Accounts"
              value={users.length}
              sub={`${users.filter(u => u.active).length} enabled accounts`}
              accent="blue"
            />
          </div>

          {/* Live Online Staff Highlight Box (if staff are online) */}
          {activeStaffList.length > 0 && (
            <Card className="border border-emerald-200 bg-gradient-to-r from-emerald-50/70 to-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                  </span>
                  <div>
                    <h3 className="font-semibold text-sm text-ink-900">
                      Live Active Sessions ({activeStaffList.length} staff currently logged in)
                    </h3>
                    <p className="text-xs text-stone-500">
                      Real-time tracker of staff logged into the SMC Function Hall portal
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {activeStaffList.map(s => (
                    <div
                      key={s.id}
                      className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-1.5 shadow-xs"
                    >
                      <Avatar name={s.user_name} className="h-6 w-6 text-[10px]" />
                      <div className="leading-tight">
                        <p className="text-xs font-semibold text-ink-900">{s.user_name}</p>
                        <p className="text-[11px] text-emerald-700 font-medium">
                          Online for {fmtDurationWords(s.duration_seconds)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTerminateSession(s)}
                        disabled={terminatingId === s.id}
                        title="Force sign out this staff"
                        className="ml-1 cursor-pointer rounded p-1 text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition"
                      >
                        <LogOut size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* Filters and Log Table */}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 p-4">
              <div className="flex flex-wrap items-center gap-2">
                {/* Staff Member Filter */}
                <div className="w-48">
                  <Select
                    value={selectedUser}
                    onChange={v => setSelectedUser(v)}
                    className="bg-white text-xs py-1.5 h-9"
                    options={[
                      { value: 'all', label: 'All Staff Members' },
                      ...users.map(u => ({ value: String(u.id), label: `${u.name} (@${u.username})` })),
                    ]}
                  />
                </div>

                {/* Status Filter */}
                <div className="w-52">
                  <Select
                    value={selectedStatus}
                    onChange={v => setSelectedStatus(v)}
                    className="bg-white text-xs py-1.5 h-9"
                    options={[
                      { value: 'all', label: 'All Session Statuses' },
                      { value: 'active', label: '🟢 Active Now' },
                      { value: 'logged_out', label: 'Logged Out' },
                      { value: 'timed_out', label: 'Auto-Closed / Timed Out' },
                    ]}
                  />
                </div>

                {/* Period Filter */}
                <div className="flex items-center gap-1">
                  {[
                    { key: 'all', label: 'All Time' },
                    { key: 'today', label: 'Today' },
                    { key: 'yesterday', label: 'Yesterday' },
                    { key: 'week', label: 'Last 7 Days' },
                  ].map(p => (
                    <button
                      key={p.key}
                      onClick={() => setSelectedPeriod(p.key)}
                      className={cn(
                        'cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition',
                        selectedPeriod === p.key
                          ? 'bg-ink-900 text-white'
                          : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search Box */}
              <div className="relative w-full sm:w-60">
                <Search
                  size={16}
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-400"
                />
                <Input
                  className="pl-9 text-xs h-9"
                  placeholder="Search staff, IP, device…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {sessions.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-stone-100 bg-stone-50/60">
                    <tr>
                      <th className="th">Staff Member</th>
                      <th className="th">Login Time</th>
                      <th className="th">Logout Time</th>
                      <th className="th min-w-36">Total Stay Duration</th>
                      <th className="th">Device & IP</th>
                      <th className="th">Status</th>
                      <th className="th text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {sessions.map(s => {
                      const isActive = s.status === 'active';
                      return (
                        <tr
                          key={s.id}
                          className={cn(
                            'transition hover:bg-stone-50/60',
                            isActive && 'bg-emerald-50/30'
                          )}
                        >
                          <td className="td">
                            <div className="flex items-center gap-3">
                              <Avatar name={s.user_name} className="h-8 w-8 text-xs shrink-0" />
                              <div className="min-w-0">
                                <p className="font-semibold text-ink-900">{s.user_name}</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className="text-xs text-stone-400">@{s.username}</span>
                                  <Badge tone={s.role === 'admin' ? 'gold' : 'blue'} className="text-[10px] py-0">
                                    {s.role === 'admin' ? 'Admin' : 'Staff'}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="td whitespace-nowrap">
                            <p className="font-medium text-ink-900">{fmtDateTime(s.login_time)}</p>
                            <p className="text-[11px] text-stone-400">
                              {relDay(s.login_time?.slice(0, 10))}
                            </p>
                          </td>
                          <td className="td whitespace-nowrap">
                            {isActive ? (
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200/60">
                                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                Active Now
                              </span>
                            ) : s.logout_time ? (
                              <div>
                                <p className="font-medium text-stone-700">
                                  {fmtDateTime(s.logout_time)}
                                </p>
                                {s.status === 'timed_out' && (
                                  <p className="text-[11px] text-amber-600">
                                    Inactivity timeout
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="text-stone-400">—</span>
                            )}
                          </td>
                          <td className="td">
                            {isActive ? (
                              <div>
                                <p className="font-bold text-emerald-700 text-sm">
                                  {fmtDurationWords(s.duration_seconds_calc)}
                                </p>
                                <p className="text-[11px] text-emerald-600 font-medium">
                                  Stayed so far
                                </p>
                              </div>
                            ) : (
                              <div>
                                <p className="font-semibold text-ink-900 text-sm">
                                  {fmtDurationWords(s.duration_seconds_calc)}
                                </p>
                                <p className="text-[11px] text-stone-400">Total duration</p>
                              </div>
                            )}
                          </td>
                          <td className="td text-xs">
                            <p className="font-medium text-stone-700 truncate max-w-48" title={s.device_info}>
                              {s.device_info || 'Browser'}
                            </p>
                            <p className="font-mono text-stone-400 text-[11px]">
                              {s.ip_address || 'Localhost'}
                            </p>
                          </td>
                          <td className="td">
                            {isActive ? (
                              <Badge tone="green" dot>
                                Active Now
                              </Badge>
                            ) : s.status === 'logged_out' ? (
                              <Badge tone="stone">Logged Out</Badge>
                            ) : (
                              <Badge tone="amber">Auto-Closed</Badge>
                            )}
                          </td>
                          <td className="td text-right">
                            {isActive ? (
                              <Button
                                size="sm"
                                variant="outline"
                                icon={LogOut}
                                loading={terminatingId === s.id}
                                onClick={() => handleTerminateSession(s)}
                                className="text-rose-600 hover:bg-rose-50 hover:border-rose-200"
                                title="Force log out this staff member"
                              >
                                Sign Out
                              </Button>
                            ) : (
                              <span className="text-xs text-stone-400 font-mono">
                                #{s.id}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={History}
                title="No session logs found"
                text="No staff login sessions match the selected filters."
              />
            )}
          </Card>
        </div>
      )}

      {/* EDIT / ADD USER MODAL */}
      {edit && (
        <UserModal
          user={edit}
          me={me}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            reloadUsers();
            reloadSessions();
          }}
        />
      )}
    </>
  );
}

function UserModal({ user, me, onClose, onSaved }) {
  const editing = !!user.id;
  const [f, setF] = useState(() =>
    editing
      ? { ...user, active: !!user.active, password: '' }
      : { username: '', name: '', role: 'staff', active: true, password: '' }
  );
  const [saving, save] = useSave('/users', user.id, 'Login', onSaved);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const self = user.id === me.id;

  return (
    <Modal
      title={editing ? 'Edit Login' : 'Add Login'}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button form="user-form" type="submit" loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <Form id="user-form" onSubmit={() => save(f)} className="grid gap-4 sm:grid-cols-2">
        <Field label="Full Name">
          <Input required value={f.name} onChange={e => set('name', e.target.value)} />
        </Field>
        <Field label="Username">
          <Input
            required
            pattern="[A-Za-z0-9._\-]{3,30}"
            value={f.username}
            onChange={e => set('username', e.target.value)}
          />
        </Field>
        <Field as="div" label="Role" className="sm:col-span-2">
          <Segmented
            value={f.role}
            onChange={v => !self && set('role', v)}
            options={[
              { value: 'staff', label: 'Staff', icon: UserRound },
              { value: 'admin', label: 'Admin', icon: ShieldCheck },
            ]}
          />
        </Field>
        <Field
          label={editing ? 'Reset Password' : 'Password'}
          hint={editing ? 'Leave blank to keep the current password' : 'At least 6 characters'}
          className="sm:col-span-2"
        >
          <div className="relative">
            <KeyRound
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-400"
            />
            <Input
              className="pl-9"
              type="text"
              autoComplete="new-password"
              required={!editing}
              minLength={6}
              value={f.password}
              onChange={e => set('password', e.target.value)}
            />
          </div>
        </Field>
        {editing && !self && (
          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-stone-200 p-4 sm:col-span-2">
            <input
              type="checkbox"
              className="h-4 w-4 accent-emerald-600"
              checked={f.active}
              onChange={e => set('active', e.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium">Login enabled</span>
              <span className="text-xs text-stone-500">
                Untick to block this person from signing in
              </span>
            </span>
          </label>
        )}
      </Form>
    </Modal>
  );
}
