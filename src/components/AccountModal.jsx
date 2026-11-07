import { useState } from 'react';
import { Check, KeyRound, Lock, Shield, UserRound } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, Button, Field, Form, Input, Modal, cn, useUI } from './ui.jsx';

export default function AccountModal({ onClose }) {
  const { user, updateUser } = useAuth();
  const { toast } = useUI();

  // Profile Edit State
  const [profile, setProfile] = useState({
    name: user?.name || '',
    username: user?.username || '',
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // Password Change State
  const [showPassword, setShowPassword] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [savingPw, setSavingPw] = useState(false);

  const handleProfileSubmit = async e => {
    e?.preventDefault?.();
    if (!profile.name.trim()) return toast('Name is required', 'error');
    setSavingProfile(true);
    try {
      const res = await api('/auth/profile', { method: 'PUT', body: profile });
      updateUser(res.user);
      toast('Account profile updated successfully');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async e => {
    e?.preventDefault?.();
    if (pw.next !== pw.confirm) return toast('New passwords do not match', 'error');
    if (pw.next.length < 6) return toast('New password must be at least 6 characters', 'error');
    setSavingPw(true);
    try {
      await api('/auth/password', { method: 'POST', body: pw });
      toast('Password changed successfully');
      setPw({ current: '', next: '', confirm: '' });
      setShowPassword(false);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <Modal
      title="My Account"
      subtitle="View and edit your profile details and security"
      size="md"
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-between">
          <span className="text-xs text-stone-400">Signed in as @{user?.username}</span>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Account Header Badge Card */}
        <div className="flex items-center gap-4 rounded-2xl border border-stone-200 bg-stone-50/80 p-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gold-400 text-lg font-bold text-ink-900 shadow-sm">
            {(user?.name || 'U').slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-display text-lg font-bold text-ink-900">{user?.name}</h3>
              <Badge tone={user?.role === 'admin' ? 'gold' : 'blue'}>
                {user?.role === 'admin' ? 'Administrator' : 'Staff'}
              </Badge>
            </div>
            <p className="text-xs text-stone-500 mt-0.5">@{user?.username} · Active account</p>
          </div>
        </div>

        {/* Section 1: Edit Account Details */}
        <div className="rounded-2xl border border-stone-200 bg-white p-4 space-y-4">
          <div className="flex items-center gap-2 text-ink-900 font-semibold text-sm border-b border-stone-100 pb-2">
            <UserRound size={16} className="text-gold-600" />
            <span>Edit Account Details</span>
          </div>

          <Form onSubmit={handleProfileSubmit} className="space-y-3">
            <Field label="Full Name">
              <Input
                value={profile.name}
                onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
                placeholder="Full Name"
                required
              />
            </Field>

            <Field label="Username" hint="3–30 lowercase letters or numbers">
              <Input
                value={profile.username}
                onChange={e => setProfile(p => ({ ...p, username: e.target.value.toLowerCase().replace(/\s+/g, '') }))}
                placeholder="username"
                required
              />
            </Field>

            <div className="flex justify-end pt-1">
              <Button
                type="submit"
                variant="gold"
                size="sm"
                icon={Check}
                loading={savingProfile}
              >
                Save profile
              </Button>
            </div>
          </Form>
        </div>

        {/* Section 2: Password Change (inside Account) */}
        <div className="rounded-2xl border border-stone-200 bg-stone-50/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-ink-900 font-semibold text-sm">
              <KeyRound size={16} className="text-gold-600" />
              <span>Password & Security</span>
            </div>
            <Button
              type="button"
              variant={showPassword ? 'outline' : 'gold'}
              size="sm"
              icon={KeyRound}
              onClick={() => setShowPassword(p => !p)}
              className="text-xs"
            >
              {showPassword ? 'Hide password form' : 'Change password'}
            </Button>
          </div>

          {showPassword ? (
            <Form onSubmit={handlePasswordSubmit} className="mt-3 space-y-3 border-t border-stone-200 pt-3">
              <Field label="Current Password">
                <Input
                  type="password"
                  required
                  placeholder="Enter current password"
                  value={pw.current}
                  onChange={e => setPw(p => ({ ...p, current: e.target.value }))}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="New Password" hint="At least 6 characters">
                  <Input
                    type="password"
                    required
                    minLength={6}
                    placeholder="New password"
                    value={pw.next}
                    onChange={e => setPw(p => ({ ...p, next: e.target.value }))}
                  />
                </Field>
                <Field label="Confirm New Password">
                  <Input
                    type="password"
                    required
                    placeholder="Repeat new password"
                    value={pw.confirm}
                    onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))}
                  />
                </Field>
              </div>

              <div className="flex justify-end pt-1">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  icon={Lock}
                  loading={savingPw}
                >
                  Update password
                </Button>
              </div>
            </Form>
          ) : (
            <p className="text-xs text-stone-500">
              Keep your account secure by using a strong password. Click "Change password" above to update it.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
