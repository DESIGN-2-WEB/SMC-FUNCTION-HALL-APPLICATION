import { useEffect, useState } from 'react';

// "Install app": the browser offers its install box only after the page has loaded, often
// before the login page is on screen, so the offer is kept here as soon as it comes.
let offer = null;
const listeners = new Set();
const notify = () => listeners.forEach(fn => fn());

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

export function setUpInstall() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); // show our own button instead of the browser's banner
    offer = e;
    notify();
  });
  window.addEventListener('appinstalled', () => { offer = null; notify(); });
  // The small background script that makes the app installable (built site only)
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
}

export function useInstall() {
  const [, redraw] = useState(0);
  useEffect(() => {
    const fn = () => redraw(n => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);
  return {
    installed: isStandalone(),
    canPrompt: !!offer,
    async install() {
      if (!offer) return false;
      const e = offer;
      offer = null;
      e.prompt();
      const { outcome } = await e.userChoice;
      notify();
      return outcome === 'accepted';
    },
  };
}

// What to tap when the browser has no install box (iPhone Safari, Firefox and others)
export function installSteps() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
    return 'In Safari, tap the Share button, then "Add to Home Screen".';
  }
  if (/Android/.test(ua)) return 'Open the browser menu (⋮), then tap "Install app" or "Add to Home screen".';
  return 'Open this site in Chrome or Edge, then click the install icon at the right end of the address bar.';
}
