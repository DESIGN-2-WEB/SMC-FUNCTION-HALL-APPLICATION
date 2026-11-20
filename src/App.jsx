import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AuthProvider, useAuth } from './auth.jsx';
import { SettingsProvider } from './settings.jsx';
import { PageLoader, UIProvider } from './components/ui.jsx';
import Layout from './components/Layout.jsx';

// Each page is downloaded only when it is first opened, so the first load stays small.
// Once signed in, the rest are fetched quietly in idle time so moving between pages is instant.
const pages = {
  Dashboard: () => import('./pages/Dashboard.jsx'),
  Combos: () => import('./pages/Combos.jsx'),
  Rooms: () => import('./pages/Rooms.jsx'),
  Halls: () => import('./pages/Halls.jsx'),
  Supplies: () => import('./pages/Supplies.jsx'),
  Payments: () => import('./pages/Payments.jsx'),
  Users: () => import('./pages/Users.jsx'),
  Activity: () => import('./pages/Activity.jsx'),
  Settings: () => import('./pages/Settings.jsx'),
};
const Login = lazy(() => import('./pages/Login.jsx'));
const Dashboard = lazy(pages.Dashboard);
const Combos = lazy(pages.Combos);
const Rooms = lazy(pages.Rooms);
const Halls = lazy(pages.Halls);
const Supplies = lazy(pages.Supplies);
const Payments = lazy(pages.Payments);
const Users = lazy(pages.Users);
const Activity = lazy(pages.Activity);
const Settings = lazy(pages.Settings);

function usePrefetchPages(enabled) {
  useEffect(() => {
    if (!enabled) return undefined;
    const idle = window.requestIdleCallback || (fn => setTimeout(fn, 1500));
    const cancel = window.cancelIdleCallback || clearTimeout;
    const handle = idle(() => Object.values(pages).forEach(load => load().catch(() => {})));
    return () => cancel(handle);
  }, [enabled]);
}

export default function App() {
  return (
    <SettingsProvider>
      <AuthProvider>
        <UIProvider>
          <BrowserRouter>
            <Shell />
          </BrowserRouter>
        </UIProvider>
      </AuthProvider>
    </SettingsProvider>
  );
}

function Shell() {
  const { user, ready, isAdmin } = useAuth();
  usePrefetchPages(!!user);
  if (!ready) return <PageLoader />;
  if (!user) return <Suspense fallback={<PageLoader />}><Login /></Suspense>;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="combos" element={<Combos />} />
        <Route path="rooms" element={<Rooms />} />
        <Route path="halls" element={<Halls />} />
        <Route path="supplies" element={<Supplies />} />
        <Route path="payments" element={<Payments />} />
        {isAdmin && <Route path="users" element={<Users />} />}
        {isAdmin && <Route path="activity" element={<Activity />} />}
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
