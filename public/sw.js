const CACHE_NAME = 'bodas-online-v2.0.1';
const urlsToCache = ['/', '/index.html', '/styles.css', '/favicon.svg', '/favicon-ring.svg'];

/**
 * ¿La URL apunta a un chunk de build de Angular/Vite?
 *
 * Los chunks con hash en el nombre son INMUTABLES: si el contenido
 * cambia, cambia el hash. El navegador ya los cachea agresivamente
 * con `Cache-Control: immutable`, así que NO deben pasar por el SW.
 *
 * Si los cacheamos aquí, el SW puede devolver una versión cacheada
 * mientras el HTML declara un preload del chunk nuevo, y el navegador
 * emite este warning:
 *   "A preload for ... is found, but is not used because it is a
 *    cross-world service worker resource mismatch."
 *
 * Devolvemos `false` (no interceptar) para esos recursos.
 */
const isBuildChunk = (url) => {
  if (/\/chunk-[A-Z0-9]+\.js$/i.test(url.pathname)) return true;
  if (/\/(main|polyfills)(-server)?\.mjs$/.test(url.pathname)) return true;
  // CSS extraído por Angular con nombre hasheado
  if (/\/styles[^/]*\.css$/.test(url.pathname)) return true;
  return false;
};

// Instalación del service worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting()),
  );
});

// Activación y limpieza de cachés antiguas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => {
              console.log('Eliminando caché antigua:', cacheName);
              return caches.delete(cacheName);
            }),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Estrategia: Network First, fallback a Cache
// (Solo para recursos "estables". Los chunks de build van directo a la red.)
self.addEventListener('fetch', (event) => {
  // Solo GET; ignorar cualquier otra cosa (POST, PUT, etc.) y peticiones
  // que no sean HTTP/HTTPS (chrome-extension, data:, blob:).
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (!url.protocol.startsWith('http')) return;

  // Las imágenes y peticiones de la API viven en otro origen durante el
  // desarrollo (localhost:3000). El SW solo puede cachear recursos propios:
  // interceptar respuestas cross-origin puede devolver una respuesta opaca o
  // ningún fallback válido y rompe la carga de imágenes.
  if (url.origin !== self.location.origin) return;

  // No interceptar API ni chunks de build: el navegador los maneja
  // directamente con su propia caché, sin warnings de preload cross-world.
  if (url.pathname.startsWith('/api/') || isBuildChunk(url)) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Solo cacheamos respuestas válidas (200) y métodos GET
        if (response && response.status === 200 && event.request.method === 'GET') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(async () => {
        // Si falla la red, intentamos obtener de caché
        return (await caches.match(event.request)) ?? new Response('', { status: 504 });
      }),
  );
});
