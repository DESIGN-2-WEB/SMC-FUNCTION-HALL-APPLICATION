import { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronsUpDown,
  FoldVertical,
  KeyRound,
  Landmark,
  Lock,
  Plus,
  Save,
  Shield,
  Trash2,
  UnfoldVertical,
  UserRound,
  Zap,
} from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useSettings } from '../settings.jsx';
import { Button, Card, Field, Form, Input, PageHeader, Textarea, cn, useUI } from '../components/ui.jsx';
import { Select } from '../components/pickers.jsx';
import AccountModal from '../components/AccountModal.jsx';
import { WhatsAppIcon } from '../components/WhatsAppModal.jsx';

function parseGenerators(raw, fallback120, fallback30) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((g, i) => ({
        id: g.id || `gen_${i}_${Date.now()}`,
        name: g.name || '',
        rate: g.rate !== undefined ? g.rate : 0,
      }));
    }
  } catch {}
  return [
    { id: 'gen_1', name: '120 kVA', rate: Number(fallback120) || 1500 },
    { id: 'gen_2', name: '30 kVA', rate: Number(fallback30) || 450 },
  ];
}

function CollapsibleCard({ id, icon: Icon, title, subtitle, badge, isOpen, onToggle, children }) {
  return (
    <Card className="overflow-hidden transition-all duration-200">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="flex w-full cursor-pointer items-center justify-between gap-4 p-5 text-left transition hover:bg-stone-50/80 select-none"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div className={cn(
            'grid h-10 w-10 shrink-0 place-items-center rounded-xl transition',
            isOpen ? 'bg-gold-100 text-gold-800' : 'bg-stone-100 text-stone-600'
          )}>
            <Icon size={19} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-ink-900 text-base">{title}</h3>
              {badge && (
                <span className="hidden sm:inline-flex items-center rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-600 truncate max-w-xs">
                  {badge}
                </span>
              )}
            </div>
            {subtitle && <p className="text-xs text-stone-500 mt-0.5 truncate">{subtitle}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-medium text-stone-400 hidden sm:inline">
            {isOpen ? 'Collapse' : 'Expand'}
          </span>
          <div className={cn(
            'grid h-7 w-7 place-items-center rounded-lg border border-stone-200 text-stone-500 transition duration-200',
            isOpen && 'bg-gold-50 border-gold-300 text-gold-800 rotate-180'
          )}>
            <ChevronDown size={15} />
          </div>
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-stone-100 p-5 animate-in fade-in duration-200 bg-white">
          {children}
        </div>
      )}
    </Card>
  );
}

export default function Settings() {
  const { user, isAdmin, updateUser } = useAuth();
  const { settings, reload } = useSettings();
  const { toast } = useUI();
  const [f, setF] = useState(settings);
  const [generators, setGenerators] = useState(() =>
    parseGenerators(settings.generators, settings.gen_120kva_rate, settings.gen_30kva_rate)
  );
  const [saving, setSaving] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  // All sections collapsed by default for admin; staff has their account open by default
  const [openSections, setOpenSections] = useState({
    profile: false,
    tariffs: false,
    whatsapp: false,
    account: !isAdmin,
  });

  const [testPhone, setTestPhone] = useState('');
  const [testingWa, setTestingWa] = useState(false);

  // Inline Account Edit State for the Account Collapsible Card
  const [accProfile, setAccProfile] = useState({ name: user?.name || '', username: user?.username || '' });
  const [savingAcc, setSavingAcc] = useState(false);
  const [accPw, setAccPw] = useState({ current: '', next: '', confirm: '' });
  const [savingAccPw, setSavingAccPw] = useState(false);
  const [showInlinePw, setShowInlinePw] = useState(false);

  useEffect(() => {
    setF(settings);
    setGenerators(parseGenerators(settings.generators, settings.gen_120kva_rate, settings.gen_30kva_rate));
  }, [settings]);

  useEffect(() => {
    if (user) setAccProfile({ name: user.name || '', username: user.username || '' });
  }, [user]);

  useEffect(() => {
    if (!isAdmin) {
      setOpenSections(prev => ({ ...prev, account: true }));
    }
  }, [isAdmin]);

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  const toggleSection = key => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const allOpen = Object.values(openSections).every(Boolean);
  const toggleAll = () => {
    const nextState = !allOpen;
    setOpenSections({
      profile: nextState,
      tariffs: nextState,
      events: nextState,
      whatsapp: nextState,
      account: nextState,
    });
  };

  const handleTestWhatsApp = async () => {
    if (!testPhone.trim()) return toast('Please enter a mobile number for testing', 'error');
    setTestingWa(true);
    try {
      const res = await api('/whatsapp/test', { method: 'POST', body: { phone: testPhone } });
      if (res.direct) {
        window.open(res.wa_link, '_blank');
        toast('Opened test message in WhatsApp');
      } else {
        toast('Test WhatsApp message delivered via Bot API!');
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setTestingWa(false);
    }
  };

  const addGenerator = () => {
    setGenerators(prev => [
      ...prev,
      { id: `gen_${Date.now()}`, name: '', rate: '' },
    ]);
  };

  const updateGenerator = (id, field, val) => {
    setGenerators(prev => prev.map(g => (g.id === id ? { ...g, [field]: val } : g)));
  };

  const removeGenerator = id => {
    setGenerators(prev => prev.filter(g => g.id !== id));
  };

  const submit = async e => {
    e?.preventDefault?.();
    setSaving(true);
    try {
      const cleanGens = generators
        .map(g => ({ name: String(g.name || '').trim(), rate: Number(g.rate) || 0 }))
        .filter(g => g.name);

      const payload = {
        ...f,
        generators: JSON.stringify(cleanGens),
      };

      const g120 = cleanGens.find(g => g.name.toLowerCase().includes('120'));
      const g30 = cleanGens.find(g => g.name.toLowerCase().includes('30'));
      if (g120) payload.gen_120kva_rate = String(g120.rate);
      if (g30) payload.gen_30kva_rate = String(g30.rate);

      await api('/settings', { method: 'PUT', body: payload });
      toast('Settings saved successfully');
      await reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleInlineProfileSave = async e => {
    e?.preventDefault?.();
    if (!accProfile.name.trim()) return toast('Name is required', 'error');
    setSavingAcc(true);
    try {
      const res = await api('/auth/profile', { method: 'PUT', body: accProfile });
      updateUser(res.user);
      toast('Account details updated successfully');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSavingAcc(false);
    }
  };

  const handleInlinePwSave = async e => {
    e?.preventDefault?.();
    if (accPw.next !== accPw.confirm) return toast('New passwords do not match', 'error');
    if (accPw.next.length < 6) return toast('New password must be at least 6 characters', 'error');
    setSavingAccPw(true);
    try {
      await api('/auth/password', { method: 'POST', body: accPw });
      toast('Password changed successfully');
      setAccPw({ current: '', next: '', confirm: '' });
      setShowInlinePw(false);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSavingAccPw(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isAdmin ? 'Settings & Tariffs' : 'Account Settings'}
        subtitle={
          isAdmin
            ? 'Manage business profile, proprietor name, contact info, extra charges and account security'
            : 'Manage your profile name, username, and account password'
        }
        actions={
          isAdmin ? (
            <div className="flex flex-wrap items-center gap-2.5">
              <Button
                type="button"
                variant="outline"
                icon={allOpen ? FoldVertical : UnfoldVertical}
                onClick={toggleAll}
                title={allOpen ? 'Collapse all sections' : 'Expand all sections'}
              >
                {allOpen ? 'Collapse all' : 'Expand all'}
              </Button>
              <Button variant="gold" icon={Save} loading={saving} onClick={submit}>
                Save all changes
              </Button>
            </div>
          ) : null
        }
      />

      {/* Collapsible Accordion Sections */}
      <Form onSubmit={isAdmin ? submit : e => e.preventDefault()} className="space-y-4">
        {/* 1. My Account & Security (Available to both Admin and Staff) */}
        <CollapsibleCard
          id="account"
          icon={UserRound}
          title="My Account & Security"
          subtitle="Edit your name, username, and change account password"
          badge={`@${user?.username || 'admin'} · ${user?.role === 'admin' ? 'Administrator' : 'Staff'}`}
          isOpen={openSections.account}
          onToggle={toggleSection}
        >
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-stone-50 p-3.5 border border-stone-200">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-gold-400 text-sm font-bold text-ink-900">
                  {(user?.name || 'U').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-ink-900 text-sm">{user?.name}</p>
                  <p className="text-xs text-stone-500">@{user?.username} · {user?.role === 'admin' ? 'Administrator' : 'Staff'}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={UserRound}
                onClick={() => setAccountOpen(true)}
              >
                Open account modal
              </Button>
            </div>

            {/* Inline Account Edit */}
            <div className="rounded-xl border border-stone-200 p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                <h4 className="font-semibold text-sm text-ink-900 flex items-center gap-1.5">
                  <UserRound size={15} className="text-gold-600" />
                  Edit Account Details
                </h4>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Full Name">
                  <Input
                    value={accProfile.name}
                    onChange={e => setAccProfile(p => ({ ...p, name: e.target.value }))}
                    placeholder="Full name"
                  />
                </Field>
                <Field label="Username">
                  <Input
                    value={accProfile.username}
                    onChange={e => setAccProfile(p => ({ ...p, username: e.target.value.toLowerCase().replace(/\s+/g, '') }))}
                    placeholder="username"
                  />
                </Field>
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="gold"
                  size="sm"
                  loading={savingAcc}
                  onClick={handleInlineProfileSave}
                >
                  Save profile changes
                </Button>
              </div>
            </div>

            {/* Password Change inside Account */}
            <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-sm text-ink-900 flex items-center gap-1.5">
                    <KeyRound size={15} className="text-gold-600" />
                    Change Password
                  </h4>
                  <p className="text-xs text-stone-500">Update your account login password</p>
                </div>
                <Button
                  type="button"
                  variant={showInlinePw ? 'outline' : 'gold'}
                  size="sm"
                  icon={KeyRound}
                  onClick={() => setShowInlinePw(p => !p)}
                >
                  {showInlinePw ? 'Cancel' : 'Change password'}
                </Button>
              </div>

              {showInlinePw && (
                <div className="space-y-3 pt-3 border-t border-stone-200">
                  <Field label="Current Password">
                    <Input
                      type="password"
                      placeholder="Enter current password"
                      value={accPw.current}
                      onChange={e => setAccPw(p => ({ ...p, current: e.target.value }))}
                    />
                  </Field>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Field label="New Password" hint="At least 6 characters">
                      <Input
                        type="password"
                        placeholder="New password"
                        value={accPw.next}
                        onChange={e => setAccPw(p => ({ ...p, next: e.target.value }))}
                      />
                    </Field>
                    <Field label="Confirm New Password">
                      <Input
                        type="password"
                        placeholder="Repeat new password"
                        value={accPw.confirm}
                        onChange={e => setAccPw(p => ({ ...p, confirm: e.target.value }))}
                      />
                    </Field>
                  </div>
                  <div className="flex justify-end pt-1">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      icon={Lock}
                      loading={savingAccPw}
                      onClick={handleInlinePwSave}
                    >
                      Update password
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CollapsibleCard>

        {/* Business Settings & Tariffs - Administrator Only */}
        {isAdmin && (
          <>
            {/* 2. Property Profile */}
            <CollapsibleCard
          id="profile"
          icon={Landmark}
          title="Property Profile"
          subtitle="Displayed on bills, receipts, login, and sidebar brand"
          badge={`${f.property_short || f.property_name || 'SMC Function Hall'} · ${f.address ? f.address.split(',')[0] : 'Palasa'}`}
          isOpen={openSections.profile}
          onToggle={toggleSection}
        >
          <div className="space-y-4">
            <Field label="Full Property Name">
              <Input value={f.property_name || ''} onChange={e => set('property_name', e.target.value)} required />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Short Name / Brand (Sidebar)">
                <Input value={f.property_short || ''} onChange={e => set('property_short', e.target.value)} required />
              </Field>
              <Field label="Proprietor Name">
                <Input value={f.banner_name || ''} onChange={e => set('banner_name', e.target.value)} placeholder="e.g. Penta Jayashankararao" />
              </Field>
            </div>

            <Field label="Tagline / Hall Type">
              <Input value={f.property_tagline || ''} onChange={e => set('property_tagline', e.target.value)} placeholder="e.g. Kalyana Mandapam & Function Hall" />
            </Field>

            <Field label="Address">
              <Input value={f.address || ''} onChange={e => set('address', e.target.value)} placeholder="Next to BOI, K.T. Road, Palasa – Kasibugga" />
            </Field>

            <Field label="Contact Phone Numbers">
              <Input value={f.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="94411 17278 / 94410 89616" />
            </Field>

            <Field label="Facilities Available">
              <Input value={f.facilities || ''} onChange={e => set('facilities', e.target.value)} placeholder="A/C halls, parking, rooms and lift available" />
            </Field>
          </div>
        </CollapsibleCard>

        {/* 2. Extra Charges Tariffs */}
        <CollapsibleCard
          id="tariffs"
          icon={Zap}
          title="Extra Charges Tariffs"
          subtitle="Electricity meter unit rate and generator hourly rates"
          badge={`₹${f.power_rate || 15}/unit · ${generators.length} Generators`}
          isOpen={openSections.tariffs}
          onToggle={toggleSection}
        >
          <div className="space-y-4">
            <Field label="Electricity Rate (₹ per unit)" hint="Units = Ending reading − Starting reading">
              <Input type="number" min="0" step="any" value={f.power_rate || ''} onChange={e => set('power_rate', e.target.value)} required />
            </Field>

            {/* Dynamic Generators List */}
            <div className="space-y-3 pt-3 border-t border-stone-200">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-700">
                    Generators (Charged per hr)
                  </h4>
                  <p className="text-[11px] text-stone-500">
                    Add, edit, or delete generator options used in bookings
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  icon={Plus}
                  onClick={addGenerator}
                  className="text-xs py-1 px-2.5"
                >
                  Add generator
                </Button>
              </div>

              {generators.length === 0 ? (
                <div className="rounded-xl border border-dashed border-stone-300 p-4 text-center text-xs text-stone-500">
                  No generators configured. Click "Add generator" to add one.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {generators.map((gen, idx) => (
                    <div
                      key={gen.id || idx}
                      className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50/70 p-2.5 transition hover:border-stone-300"
                    >
                      <div className="flex-1 min-w-0">
                        <label className="block text-[10px] font-medium uppercase text-stone-500 mb-1">
                          Generator Name / Spec
                        </label>
                        <Input
                          placeholder="e.g. 120 kVA, 30 kVA, 62.5 kVA"
                          value={gen.name}
                          onChange={e => updateGenerator(gen.id, 'name', e.target.value)}
                          required
                          className="bg-white"
                        />
                      </div>
                      <div className="w-36">
                        <label className="block text-[10px] font-medium uppercase text-stone-500 mb-1">
                          Rate (₹ / hr)
                        </label>
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          placeholder="1500"
                          value={gen.rate}
                          onChange={e => updateGenerator(gen.id, 'rate', e.target.value)}
                          required
                          className="bg-white font-medium"
                        />
                      </div>
                      <div className="pt-5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          icon={Trash2}
                          onClick={() => removeGenerator(gen.id)}
                          className="text-red-500 hover:bg-red-50 hover:text-red-700 p-2"
                          title="Delete generator"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600">
              <p className="font-semibold text-ink-900">Billing Formula:</p>
              <p className="mt-0.5">Final bill = Hall rent + (Units × ₹{f.power_rate || 15}) + (Generator hrs × Rate/hr)</p>
            </div>
          </div>
        </CollapsibleCard>

        {/* 3. WhatsApp Bot & Customer Messaging */}
        <CollapsibleCard
          id="whatsapp"
          icon={WhatsAppIcon}
          title="WhatsApp Bot & Customer Messaging"
          subtitle="Send automated receipts, booking confirmations, check-in, check-out and advance receipts"
          badge={f.whatsapp_enabled === '1' ? `${f.whatsapp_provider === 'meta' ? 'Meta Cloud API' : f.whatsapp_provider === 'twilio' ? 'Twilio' : 'Direct wa.me'} Active` : 'Disabled'}
          isOpen={openSections.whatsapp}
          onToggle={toggleSection}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50/70 p-3.5">
              <div>
                <p className="font-semibold text-ink-900 text-sm">Enable WhatsApp Customer Messaging</p>
                <p className="text-xs text-stone-500">Allow staff to send receipts and alerts directly to customer WhatsApp</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={f.whatsapp_enabled === '1'}
                  onChange={e => set('whatsapp_enabled', e.target.checked ? '1' : '0')}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-stone-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Messaging Provider Mode" hint="Direct links require no API key or Meta approval">
                <Select
                  value={f.whatsapp_provider || 'direct'}
                  onChange={v => set('whatsapp_provider', v)}
                  className="font-medium"
                  options={[
                    { value: 'direct', label: 'Direct WhatsApp Web/App (wa.me) — Recommended (Free, Instant)' },
                    { value: 'meta', label: 'Meta WhatsApp Business Cloud API (Automated Background Bot)' },
                    { value: 'twilio', label: 'Twilio WhatsApp API (Automated Background Bot)' },
                    { value: 'webhook', label: 'Custom Webhook / UltraMsg / Green API' },
                  ]}
                />
              </Field>

              {f.whatsapp_provider === 'meta' && (
                <>
                  <Field label="Meta Phone Number ID" hint="From Meta Developer App Dashboard">
                    <Input
                      value={f.whatsapp_phone_number_id || ''}
                      onChange={e => set('whatsapp_phone_number_id', e.target.value)}
                      placeholder="e.g. 100609349921234"
                    />
                  </Field>
                  <Field label="Meta System User Access Token" className="sm:col-span-2">
                    <Input
                      type="password"
                      value={f.whatsapp_api_token || ''}
                      onChange={e => set('whatsapp_api_token', e.target.value)}
                      placeholder="EAA..."
                    />
                  </Field>
                </>
              )}

              {f.whatsapp_provider === 'twilio' && (
                <>
                  <Field label="Twilio Account SID">
                    <Input
                      value={f.whatsapp_twilio_sid || ''}
                      onChange={e => set('whatsapp_twilio_sid', e.target.value)}
                      placeholder="AC..."
                    />
                  </Field>
                  <Field label="Twilio From WhatsApp Number" hint="e.g. +14155238886">
                    <Input
                      value={f.whatsapp_twilio_from || ''}
                      onChange={e => set('whatsapp_twilio_from', e.target.value)}
                      placeholder="+14155238886"
                    />
                  </Field>
                  <Field label="Twilio Auth Token" className="sm:col-span-2">
                    <Input
                      type="password"
                      value={f.whatsapp_twilio_token || ''}
                      onChange={e => set('whatsapp_twilio_token', e.target.value)}
                      placeholder="Auth Token"
                    />
                  </Field>
                </>
              )}

              {f.whatsapp_provider === 'webhook' && (
                <Field label="Custom Webhook / API URL" className="sm:col-span-2">
                  <Input
                    value={f.whatsapp_webhook_url || ''}
                    onChange={e => set('whatsapp_webhook_url', e.target.value)}
                    placeholder="https://api.ultramsg.com/instance.../messages/chat"
                  />
                </Field>
              )}
            </div>

            {/* Test WhatsApp Message Sender */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
              <div>
                <h4 className="font-semibold text-xs uppercase tracking-wider text-emerald-950 flex items-center gap-1.5">
                  <WhatsAppIcon size={14} className="text-emerald-700" />
                  Test WhatsApp Message Sender
                </h4>
                <p className="text-xs text-stone-500">Send a test message to your mobile number to verify delivery</p>
              </div>

              <div className="flex gap-2 max-w-md">
                <Input
                  type="tel"
                  placeholder="e.g. 9441117278"
                  value={testPhone}
                  onChange={e => setTestPhone(e.target.value)}
                  className="bg-white"
                />
                <Button
                  type="button"
                  variant="success"
                  size="sm"
                  loading={testingWa}
                  onClick={handleTestWhatsApp}
                  className="bg-[#25D366] text-white hover:bg-[#20ba59] shrink-0 font-semibold"
                >
                  Send test message
                </Button>
              </div>
            </div>
          </div>
        </CollapsibleCard>

        {/* Bottom Save Action */}
        <div className="flex justify-end pt-3">
          <Button variant="gold" icon={Save} loading={saving} onClick={submit}>
            Save all changes
          </Button>
        </div>
      </>
    )}
  </Form>

      {/* Account Modal */}
      {accountOpen && <AccountModal onClose={() => setAccountOpen(false)} />}
    </div>
  );
}
