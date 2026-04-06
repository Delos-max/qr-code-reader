/* ============================================================
   Service Worker – QR Code Reader PWA
   Cache bumped to v5 — forces fresh file delivery.
   ============================================================ */

var CACHE_NAME = 'qr-reader-v5';

var APP_SHELL = [
    'index.html',
    'css/style.css',
    'js/app.js',
    'js/qr-parser.js',
    'manifest.json',
    'icons/icon-192.png',
    'icons/icon-512.png'
];

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) {
            return cache.addAll(APP_SHELL);
        })
    );
    self.skipWaiting();
});

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

self.addEventListener('fetch', function (event) {
    event.respondWith(
        caches.match(event.request).then(function (cachedResponse) {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request);
        }).catch(function () {
            if (event.request.mode === 'navigate') {
                return caches.match('index.html');
            }
        })
    );
});
