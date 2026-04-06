/* ============================================================
   Service Worker – QR Code Reader PWA
   ============================================================
   Cache version bumped to v2 to force all devices (including
   iPhones) to discard any previously cached files and fetch
   fresh copies from the server.
   ============================================================ */

var CACHE_NAME = 'qr-reader-v2';

// List of files that make up the "app shell"
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
    // Activate immediately without waiting for old SW to stop
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
    // Take control of all clients immediately
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
            // If both cache and network fail, return the cached index page
            if (event.request.mode === 'navigate') {
                return caches.match('index.html');
            }
        })
    );
});
