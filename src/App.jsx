import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AuthProvider, useAuth } from './auth.jsx';
import { SettingsProvider } from './settings.jsx';
import { PageLoader, UIProvider } from './components/ui.jsx';
import Layout from './components/Layout.jsx';

// Each page is downloaded only when it is first opened, so the first load stays small
const Login = lazy(() => import('./pages/Login.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Combos = lazy(() => import('./pages/Combos.jsx'));
const Rooms = lazy(() => import('./pages/Rooms.jsx'));
const Halls = lazy(() => import('./pages/Halls.jsx'));
const Supplies = lazy(() => import('./pages/Supplies.jsx'));
const Payments = lazy(() => import('./pages/Payments.jsx'));
const Users = lazy(() => import('./pages/Users.jsx'));
const Activity = lazy(() => import('./pages/Activity.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));

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
