-- ==============================================================================
-- SMC Function Hall: lock the database against the public (publishable/anon) key
-- ==============================================================================
--
-- WHY: the public key was committed to this public GitHub repo. With row-level
-- security (RLS) off, anyone holding it can read and change every table,
-- including login password hashes. After this script the public key can read
-- and write NOTHING. The app's server uses the secret key, which bypasses RLS.
--
-- DO THESE STEPS IN THIS ORDER (otherwise the live app stops loading data):
--
--   1. Supabase dashboard -> Project Settings -> API Keys -> Secret keys:
--      create a secret key (starts with sb_secret_) and copy it.
--   2. Vercel -> Project -> Settings -> Environment Variables: add
--      SUPABASE_SECRET_KEY = <that secret key>, then redeploy.
--      Also add it to the local .env file. Never commit it.
--   3. Open the live site and confirm it still loads and saves.
--   4. Supabase dashboard -> SQL Editor -> New query: paste this whole file -> Run.
--   5. Open the live site again and confirm it still loads and saves.
--   6. Supabase dashboard -> Project Settings -> API Keys: create a new
--      publishable key, then delete the old one (and disable the legacy
--      anon / service_role keys if they are enabled). Put the new publishable
--      key in the GitHub secret SUPABASE_ANON_KEY (used by the keep-alive job)
--      and in SUPABASE_ANON_KEY on Vercel and in .env.
--
-- Safe to run more than once.
-- ==============================================================================

ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms          ENABLE ROW LEVEL SECURITY;
ALTER TABLE halls          ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplies       ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE hall_bookings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_bookings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_moves    ENABLE ROW LEVEL SECURITY;
ALTER TABLE supply_rentals ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity       ENABLE ROW LEVEL SECURITY;

-- No policies are created on purpose: with RLS on and no policy, the public
-- roles (anon, authenticated) see no rows and cannot insert, update or delete.
-- (Their table privileges are left in place so the GitHub keep-alive job can
-- still run its harmless read, which now simply returns no rows.)

-- Check: every table should show rowsecurity = true
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
