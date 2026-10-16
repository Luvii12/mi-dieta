// Service worker: guarda los archivos de la app para que abra sin conexión.
// Al cambiar cualquier archivo de web/, sube VERSION para que el móvil descargue la nueva.
const VERSION = 'dieta-v2';
const ARCHIVOS = [
  './',
  'index.html',
  'estilos.css',
  'app.js',
  'api.js',
  'manifest.json',
  'iconos/icono.svg',
  'iconos/icono-192.png',
  'iconos/icono-512.png',
  'iconos/icono-maskable-512.png',
];

self.addEventListener('install', evento => {
  evento.waitUntil(caches.open(VERSION).then(cache => cache.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', evento => {
  evento.waitUntil(
    caches.keys()
      .then(claves => Promise.all(claves.filter(c => c !== VERSION).map(c => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

// Archivos propios: primero la red (para ver cambios enseguida) y, si no hay conexión, la copia guardada.
// Las peticiones a Apps Script (otro dominio) no se tocan.
self.addEventListener('fetch', evento => {
  const peticion = evento.request;
  if (peticion.method !== 'GET' || new URL(peticion.url).origin !== self.location.origin) return;
  evento.respondWith(
    fetch(peticion)
      .then(respuesta => {
        const copia = respuesta.clone();
        caches.open(VERSION).then(cache => cache.put(peticion, copia));
        return respuesta;
      })
      .catch(() => caches.match(peticion, { ignoreSearch: true }))
  );
});
