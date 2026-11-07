import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AuthProvider, useAuth } from './auth.jsx';
import { SettingsProvider } from './settings.jsx';
import { PageLoader, UIProvider } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Rooms from './pages/Rooms.jsx';
import Halls from './pages/Halls.jsx';
import Supplies from './pages/Supplies.jsx';
import Payments from './pages/Payments.jsx';
import Users from './pages/Users.jsx';
import Activity from './pages/Activity.jsx';
import Settings from './pages/Settings.jsx';

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
  if (!user) return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
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
