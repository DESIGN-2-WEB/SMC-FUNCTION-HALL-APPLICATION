try {
  process.loadEnvFile?.();
} catch {}

export const ON_VERCEL = !!process.env.VERCEL;

// Demo deployments show the demo sign-in on the login page. On by default on Vercel
// (its data is temporary anyway); DEMO_MODE=true/false overrides.
export const DEMO = process.env.DEMO_MODE ? process.env.DEMO_MODE === 'true' : ON_VERCEL;
