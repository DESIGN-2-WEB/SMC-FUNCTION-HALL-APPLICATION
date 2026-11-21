import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Scrolling the page with the mouse over a focused amount field would change the number
// (for example a bill total of 4500 becoming 4536). Let go of the field instead, so the
// page scrolls and the amount stays as typed.
document.addEventListener('wheel', e => {
  const el = document.activeElement;
  if (el?.type === 'number' && e.target === el) el.blur();
}, { passive: true });

// After a new version is published, a tab that was already open still asks for the old page
// files, which no longer exist. Reload once to get the new version (at most once a minute, so
// a real network problem can't cause a reload loop).
window.addEventListener('vite:preloadError', event => {
  let last = 0;
  try { last = Number(sessionStorage.getItem('pk_reloaded_at')) || 0; } catch { /* storage blocked */ }
  if (Date.now() - last < 60000) return;
  event.preventDefault();
  try { sessionStorage.setItem('pk_reloaded_at', String(Date.now())); } catch { /* storage blocked */ }
  window.location.reload();
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
