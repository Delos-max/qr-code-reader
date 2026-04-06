/* ============================================================
   Service Worker – QR Code Reader PWA
   ============================================================
   Cache bumped to v6. Now uses NETWORK-FIRST strategy:
   always tries the network first, falls back to cache only
   when offline. This means phones always get fresh files
   immediately without cache-busting fights.
   ============================================================ */

var CACHE_NAME = 'qr-reader-v6';

var APP_SHELL = [
    'index.html',
    'css/style.css',
    'js/app.js',
    'js/qr-parser.js',
    'manifest.json',
    'icons/icon-192.png',
    'icons/icon-512.png'
];

/* ---------- Install: pre-cache the app shell ---------- */
self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) {
            return cache.addAll(APP_SHELL);
        })
    );
    self.skipWaiting();
});

/* ---------- Activate: clean up old caches ---------- */
self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (cacheNames) {
            return Promise.all(
                cacheNames.map(function (name) {
                    if (name !== CACHE_NAME) {
                        return caches.delete(name);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

/* ---------- Fetch: network-first, fall back to cache ---------- */
/* Always tries the live network first so updates reach devices  */
/* immediately. Only serves from cache when truly offline.       */
self.addEventListener('fetch', function (event) {
    event.respondWith(
        fetch(event.request).then(function (networkResponse) {
            // Got a fresh response — update the cache and return it
            return caches.open(CACHE_NAME).then(function (cache) {
                cache.put(event.request, networkResponse.clone());
                return networkResponse;
            });
        }).catch(function () {
            // Network failed (offline) — fall back to cache
            return caches.match(event.request).then(function (cachedResponse) {
                if (cachedResponse) {
                    return cachedResponse;
                }
                // Last resort for navigation requests
                if (event.request.mode === 'navigate') {
                    return caches.match('index.html');
                }
            });
        })
    );
});
