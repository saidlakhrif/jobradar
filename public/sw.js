// Bump this version on every meaningful deploy to invalidate caches.
const SW_VERSION = 'v10-2026-05-30';
const CACHE = 'jobary-' + SW_VERSION;
const PRECACHE_ASSETS = [
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.allSettled(PRECACHE_ASSETS.map(url => c.add(url).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Allow the page to trigger an immediate activation of a newly-installed SW
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// V8: Web Push handlers — show notification when cron finds matching offers
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { body: e.data?.text() || '' }; }
  const title = data.title || 'Jobary';
  const body  = data.body  || 'Nouvelle offre détectée';
  const url   = data.url   || '/';
  const tag   = data.tag   || 'jobary-default';
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag,                          // collapses multiple notifs of same tag
      data: { url, jobUrl: data.jobUrl },
      vibrate: [80, 30, 80],
      actions: data.jobUrl ? [
        { action: 'view', title: 'Voir l\'offre' },
        { action: 'open', title: 'Ouvrir Jobary' },
      ] : [],
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const data = e.notification.data || {};
  const target = e.action === 'view' && data.jobUrl ? data.jobUrl : (data.url || '/');
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // Focus an existing Jobary window if open
      for (const c of list) {
        if (c.url.includes(self.registration.scope) && 'focus' in c) {
          c.postMessage({ type: 'push-click', url: target });
          return c.focus();
        }
      }
      // Otherwise open new tab
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});

// V10: smarter caching strategy — ensure installed PWA picks up new deploys
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // 1. API calls — always network, no cache
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // 2. Same-origin HTML / JS / CSS / template — network-FIRST so new pushes win
  //    Falls back to cache only when offline.
  const isAppCode = url.origin === self.location.origin && /\.(html|js|css|json)$/.test(url.pathname) || url.pathname === '/';
  if (isAppCode) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(e.request, { cache: 'no-store' });
        if (fresh.ok) {
          const clone = fresh.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return fresh;
      } catch {
        const cached = await caches.match(e.request) || await caches.match('/index.html');
        return cached || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // 3. Everything else (images, fonts, etc.) — stale-while-revalidate
  e.respondWith((async () => {
    const cached = await caches.match(e.request);
    const networkPromise = fetch(e.request).then(res => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() => null);
    return cached || networkPromise || new Response('', { status: 503 });
  })());
});
