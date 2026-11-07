import app from './app.js';
import { startKeepAlive } from './supabase.js';

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`SMC Function Hall server running on http://localhost:${PORT}`);
  startKeepAlive();
});
 