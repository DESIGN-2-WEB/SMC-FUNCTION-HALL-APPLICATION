import { useAuth } from '../auth.jsx';
import { useApi } from '../hooks.js';
import { PageHeader } from '../components/ui.jsx';
import BandMelamTab from '../components/BandMelam.jsx';

/** Sannai Melam: a performance booked for a function (its own menu item, not a stock item). */
export default function BandMelam() {
  const { isAdmin } = useAuth();
  const hallBookings = useApi('/hall-bookings?status=active');
  return (
    <>
      <PageHeader title="Sannai Melam" subtitle="Book the Sannai Melam performance for a function, collect payments and send the timing to the team" />
      <BandMelamTab isAdmin={isAdmin} hallBookings={hallBookings.data || []} />
    </>
  );
}
