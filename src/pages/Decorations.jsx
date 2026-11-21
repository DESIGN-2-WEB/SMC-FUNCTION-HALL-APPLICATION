import { useAuth } from '../auth.jsx';
import { useSettings } from '../settings.jsx';
import { useApi } from '../hooks.js';
import { PageHeader } from '../components/ui.jsx';
import DecorationsTab from '../components/Decorations.jsx';

/** Decorations: plan and price the stage, entrance, walkway, photo booths and staircase for an event. */
export default function Decorations() {
  const { isAdmin } = useAuth();
  const { settings, reload: reloadSettings } = useSettings();
  const hallBookings = useApi('/hall-bookings?status=active');

  return (
    <>
      <PageHeader
        title="Decorations"
        subtitle="Plan and price the stage, entrance, walkway, photo booths and staircase for each event"
      />
      <DecorationsTab isAdmin={isAdmin} settings={settings} reloadSettings={reloadSettings} hallBookings={hallBookings.data || []} />
    </>
  );
}
