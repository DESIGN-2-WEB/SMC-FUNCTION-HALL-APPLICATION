// Lets the app be installed on a phone or desktop. Everything still comes from the server
// (bookings are never kept on the device); only the page shell is kept, so the installed app
// opens with a clear message instead of a browser error when there is no internet.
const SHELL = 'smc-shell-v1';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(c => c.add('/')).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return; // API calls and files go straight to the server
  event.respondWith(
    fetch(event.request)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(SHELL).then(c => c.put('/', copy));
        }
        return res;
      })
      .catch(() => caches.match('/').then(r => r || new Response(
        '<meta name="viewport" content="width=device-width"><p style="font:16px sans-serif;padding:24px">No internet connection. Please connect and try again.</p>',
        { headers: { 'Content-Type': 'text/html' } },
      ))),
  );
});
