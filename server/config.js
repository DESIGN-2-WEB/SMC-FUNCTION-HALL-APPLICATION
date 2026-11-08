try {
  process.loadEnvFile?.();
} catch {}

// The hall is in India: keep dates and "now" timestamps in IST everywhere (Vercel runs in UTC,
// which made bookings saved before 5:30 AM IST land on the previous day)
process.env.TZ ||= 'Asia/Kolkata';

export const ON_VERCEL = !!process.env.VERCEL;

// Demo deployments show the demo sign-in on the login page. On by default on Vercel
// (its data is temporary anyway); DEMO_MODE=true/false overrides.
export const DEMO = process.env.DEMO_MODE === 'true';
