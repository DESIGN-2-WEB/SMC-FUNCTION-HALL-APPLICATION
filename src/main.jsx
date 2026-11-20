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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
