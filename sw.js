/* ============================================================
   Service Worker – QR Code Reader PWA
   ============================================================
   Cache bumped to v4 — forces all devices including iPhones
   to discard old cached files and fetch fresh copies.
   ============================================================ */

var CACHE_NAME = 'qr-reader-v4';

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

/* ---------- Fetch: cache-first, fall back to network ---------- */
self.addEventListener('fetch', function (event) {
    event.respondWith(
        caches.match(event.request).then(function (cachedResponse) {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).then(function (networkResponse) {
                return networkResponse;
            });
        }).catch(function () {
            if (event.request.mode === 'navigate') {
                return caches.match('index.html');
            }
        })
    );
});
