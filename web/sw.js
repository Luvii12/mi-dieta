// Service worker: guarda los archivos de la app para que abra sin conexión.
// Al cambiar cualquier archivo de web/, sube VERSION para que el móvil descargue la nueva.
const VERSION = 'dieta-v5';
const FUENTES = 'dieta-fuentes-v1';
const ARCHIVOS = [
  './',
  'index.html',
  'estilos.css',
  'app.js',
  'api.js',
  'comun.js',
  'datos.js',
  'hoy.js',
  'plan.js',
  'receta.js',
  'recetas.js',
  'cambiar.js',
  'ajustes.js',
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
      .then(claves => Promise.all(claves.filter(c => c !== VERSION && c !== FUENTES).map(c => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

// Google Fonts (letra e iconos): primero la copia guardada; si no está, se descarga y se guarda.
// Así la app se ve igual sin conexión.
const esFuente = url => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

// Archivos propios: primero la red (para ver cambios enseguida) y, si no hay conexión, la copia guardada.
// Las peticiones a Apps Script (otro dominio) no se tocan.
self.addEventListener('fetch', evento => {
  const peticion = evento.request;
  if (peticion.method !== 'GET') return;
  const url = new URL(peticion.url);
  if (esFuente(url)) {
    evento.respondWith(caches.open(FUENTES).then(cache => cache.match(peticion).then(guardada => guardada ||
      fetch(peticion).then(respuesta => {
        if (respuesta.ok || respuesta.type === 'opaque') cache.put(peticion, respuesta.clone());
        return respuesta;
      }))));
    return;
  }
  if (url.origin !== self.location.origin) return;
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
