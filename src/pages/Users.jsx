import { useState } from 'react';
import { KeyRound, Pencil, Plus, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { useApi, useRemove, useSave } from '../hooks.js';
import { useAuth } from '../auth.jsx';
import { Avatar, Badge, Button, Card, Field, Form, Input, Modal, PageHeader, PageLoader, Segmented, cn } from '../components/ui.jsx';
import { fmtDateTime } from '../utils.js';

export default function Users() {
  const { user: me } = useAuth();
  const { data, reload } = useApi('/users');
  const remove = useRemove();
  const [edit, setEdit] = useState(null);
  const deleteUser = u => remove(`/users/${u.id}`, {
    title: `Delete ${u.name}?`, message: 'This login will stop working immediately. Their past bookings stay on record.', success: 'Login deleted', done: reload,
  });
  if (!data) return <PageLoader />;

  return (
    <>
      <PageHeader title="Staff & Logins" subtitle="Admin has full access. Staff can manage bookings, payments and stock but cannot delete records or change rates."
        actions={<Button variant="gold" icon={Plus} onClick={() => setEdit({})}>Add login</Button>} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.map((u, i) => (
          <Card key={u.id} style={{ animationDelay: `${i * 50}ms` }} className={cn('animate-rise p-5', !u.active && 'opacity-60')}>
            <div className="flex items-start gap-4">
              <Avatar name={u.name} className="h-12 w-12 text-sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink-900">{u.name} {u.id === me.id && <span className="text-xs font-normal text-stone-400">(you)</span>}</p>
                <p className="text-sm text-stone-500">@{u.username}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone={u.role === 'admin' ? 'gold' : 'blue'}>{u.role === 'admin' ? 'Admin · full access' : 'Staff'}</Badge>
                  {!u.active && <Badge tone="rose">Disabled</Badge>}
                </div>
              </div>
              <div className="flex">
                <Button size="icon" variant="ghost" onClick={() => setEdit(u)} title="Edit"><Pencil size={15} /></Button>
                {u.id !== me.id && <Button size="icon" variant="danger-soft" onClick={() => deleteUser(u)} title="Delete"><Trash2 size={15} /></Button>}
              </div>
            </div>
            <p className="mt-4 border-t border-stone-100 pt-3 text-xs text-stone-400">
              Last sign-in: {u.last_login ? fmtDateTime(u.last_login) : 'never'}
            </p>
          </Card>
        ))}
      </div>

      {edit && <UserModal user={edit} me={me} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </>
  );
}

function UserModal({ user, me, onClose, onSaved }) {
  const editing = !!user.id;
  const [f, setF] = useState(() => editing ? { ...user, active: !!user.active, password: '' } : { username: '', name: '', role: 'staff', active: true, password: '' });
  const [saving, save] = useSave('/users', user.id, 'Login', onSaved);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const self = user.id === me.id;

  return (
    <Modal title={editing ? 'Edit login' : 'Add login'} onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button form="user-form" type="submit" loading={saving}>Save</Button></>}>
      <Form id="user-form" onSubmit={() => save(f)} className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name"><Input required value={f.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="Username"><Input required pattern="[A-Za-z0-9._\-]{3,30}" value={f.username} onChange={e => set('username', e.target.value)} /></Field>
        <Field as="div" label="Role" className="sm:col-span-2">
          <Segmented value={f.role} onChange={v => !self && set('role', v)}
            options={[{ value: 'staff', label: 'Staff', icon: UserRound }, { value: 'admin', label: 'Admin', icon: ShieldCheck }]} />
        </Field>
        <Field label={editing ? 'Reset password' : 'Password'} hint={editing ? 'Leave blank to keep the current password' : 'At least 6 characters'} className="sm:col-span-2">
          <div className="relative">
            <KeyRound size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" />
            <Input className="pl-9" type="text" autoComplete="new-password" required={!editing} minLength={6} value={f.password} onChange={e => set('password', e.target.value)} />
          </div>
        </Field>
        {editing && !self && (
          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-stone-200 p-4 sm:col-span-2">
            <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={f.active} onChange={e => set('active', e.target.checked)} />
            <span><span className="block text-sm font-medium">Login enabled</span><span className="text-xs text-stone-500">Untick to block this person from signing in</span></span>
          </label>
        )}
      </Form>
    </Modal>
  );
}
