try {
  process.loadEnvFile?.();
} catch {}

// The hall is in India: keep dates and "now" timestamps in IST everywhere, whatever time
// zone the hosting server runs in (otherwise bookings saved before 5:30 AM IST can land on
// the previous day)
process.env.TZ ||= 'Asia/Kolkata';

export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
