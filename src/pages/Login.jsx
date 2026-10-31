import { useEffect, useState } from 'react';
import { BedDouble, Eye, EyeOff, KeyRound, Lock, Package, PartyPopper, UserRound } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Brand } from '../components/Layout.jsx';
import { Button, Form } from '../components/ui.jsx';
import { Select } from '../components/pickers.jsx';

// Shown only when the server runs with DEMO_MODE=true
const DEMO = { username: 'admin', password: 'admin123' };

const FEATURES = [
  [BedDouble, 'Suite & AC rooms', 'Bookings, check-ins and payments'],
  [PartyPopper, 'Banquet halls', 'Weddings, functions & events calendar'],
  [Package, 'Supplies', 'Stock in / out with low-stock alerts'],
];

export default function Login() {
  const { login } = useAuth();
  const [users, setUsers] = useState([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    api('/auth/users')
      .then(list => {
        setUsers(list);
        setUsername(list[0]?.username ?? '');
      })
      .catch(() => setError('Cannot reach the server. Is it running?'));
    api('/auth/demo').then(d => setDemo(d.demo)).catch(() => {});
  }, []);

  const fillDemo = () => {
    setUsername(DEMO.username);
    setPassword(DEMO.password);
  };

  const submit = async () => {
    setError('');
    setLoading(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Showcase panel */}
      <div className="relative hidden overflow-hidden bg-ink-900 lg:flex lg:flex-col lg:justify-between lg:p-14">
        <Mandala className="absolute -right-40 -bottom-40 h-[640px] w-[640px] text-gold-400/15" />
        <Mandala className="absolute -top-32 -left-32 h-[380px] w-[380px] text-gold-400/10" />
        <div className="relative"><Brand /></div>
        <div className="relative max-w-md">
          <p className="mb-4 text-xs font-semibold tracking-[0.3em] text-gold-300 uppercase">Management Suite</p>
          <h1 className="font-display text-5xl leading-[1.1] font-semibold text-white">
            Every stay, every celebration, <span className="text-gold-300 italic">beautifully</span> managed.
          </h1>
          <div className="mt-10 grid gap-3">
            {FEATURES.map(([Icon, title, sub]) => (
              <div key={title} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-gold-400/15 text-gold-300"><Icon size={19} /></div>
                <div>
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="text-xs text-ink-200">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-ink-300">© {new Date().getFullYear()} Penta Kedarnath</p>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm animate-rise">
          <div className="mb-10 lg:hidden"><Brand light={false} /></div>
          <h2 className="font-display text-3xl font-semibold text-ink-900">Welcome back</h2>
          <p className="mt-2 text-sm text-stone-500">Choose your login and enter your password.</p>

          {demo && (
            <div className="mt-6 flex items-center gap-3 rounded-2xl border border-gold-200 bg-gold-50 p-4">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold-400 text-ink-900"><KeyRound size={18} /></div>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold text-ink-900">Demo access</p>
                <p className="text-stone-600">Administrator · password <b className="font-mono">{DEMO.password}</b></p>
              </div>
              <Button type="button" size="sm" variant="gold" onClick={fillDemo}>Fill in</Button>
            </div>
          )}

          <Form onSubmit={submit} className="mt-8 space-y-4">
            <label className="block">
              <span className="label">Login as</span>
              <Select className="py-3" icon={UserRound} value={username} onChange={setUsername} placeholder="Loading logins…"
                options={users.map(u => ({ value: u.username, label: u.name, hint: u.role === 'admin' ? 'Admin · full access' : 'Staff' }))} />
            </label>
            <label className="block">
              <span className="label">Password</span>
              <div className="relative">
                <Lock size={17} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-stone-400" />
                <input className="input py-3 pr-11 pl-10" type={show ? 'text' : 'password'} autoComplete="current-password" required autoFocus
                  value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter password" />
                <button type="button" onClick={() => setShow(!show)} className="absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer p-1 text-stone-400 hover:text-stone-700">
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>
            {error && <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p>}
            <Button type="submit" loading={loading} disabled={!username} className="h-12 w-full text-[15px]">Sign in</Button>
          </Form>
        </div>
      </div>
    </div>
  );
}

function Mandala({ className }) {
  return (
    <svg viewBox="0 0 400 400" fill="none" stroke="currentColor" strokeWidth="1" className={className}>
      {[190, 160, 130, 100, 70, 40].map(r => <circle key={r} cx="200" cy="200" r={r} />)}
      {Array.from({ length: 24 }, (_, i) => (
        <ellipse key={i} cx="200" cy="200" rx="190" ry="40" transform={`rotate(${i * 7.5} 200 200)`} />
      ))}
    </svg>
  );
}
