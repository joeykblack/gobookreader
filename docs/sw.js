const CACHE_NAME = 'gobooks-reader-v108';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './sw.js',
  './js/app.js',
  './js/db.js',
  './js/epub.js',
  './js/pdf.js',
  './js/opfs.js',
  './js/reader.js',
  './js/enhance.js',
  './js/srs.js',
  './js/fsrs.js',
  './js/sync.js',
  './icons/icon-192.svg',
  './icons/icon-512.svg'
]

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)
  // Never intercept cross-origin requests (e.g. Google Drive API). Caching those
  // can serve stale sync payloads and hide newer remote updates.
  if (url.origin !== self.location.origin) return

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached

      return fetch(event.request)
        .then(response => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy))
          return response
        })
        .catch(() => caches.match('./index.html'))
    })
  )
})
