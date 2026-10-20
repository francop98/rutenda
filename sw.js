/* =========================================================
   Tripbox — service worker
   Hace que la app se pueda instalar y abrir sin conexión.
   Al cambiar archivos, subir el número de VERSION para que
   los celulares descarguen la versión nueva.
   ========================================================= */
const VERSION = 'tripbox-v6';
const ARCHIVOS = [
  './',
  './index.html',
  './styles.css',
  './main.js',
  './manifest.webmanifest',
  './iconos/icono-192.png',
  './iconos/icono-512.png',
  './iconos/icono-maskable-512.png',
  './iconos/apple-touch-icon.png',
  './iconos/icono-maskable-192.png',
  './iconos/favicon-32.png',
  './apple-touch-icon.png',
  './js/recorrido.js',
  "./js/aeropuertos.js",
  "./js/aeropuertosdatos.js",
  "./js/almacenamiento.js",
  "./js/autenticacion.js",
  "./js/documentos.js",
  "./js/formulariospasos.js",
  "./js/gastos.js",
  "./js/itinerario.js",
  "./js/lugares.js",
  "./js/motorprioridad.js",
  "./js/paisajeviaje.js",
  "./js/participantes.js",
  "./js/plantillaguia.js",
  "./js/requisitosviaje.js",
  "./js/utilidades.js",
  "./js/valija.js",
  "./js/viajes.js",
  "./js/vistaguia.js"
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(claves => Promise.all(claves.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Archivos propios: primero la caché (abre al instante y sin conexión), y se actualiza en segundo plano
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request, { ignoreSearch: true }).then(guardado => {
        const red = fetch(e.request).then(r => {
          if (r && r.ok) { const copia = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copia)); }
          return r;
        }).catch(() => guardado || caches.match('./index.html'));
        return guardado || red;
      })
    );
    return;
  }
  // Tipografías: caché para usarlas sin conexión
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    e.respondWith(caches.open(VERSION).then(c => c.match(e.request).then(g => g || fetch(e.request).then(r => { const copia = r.clone(); c.put(e.request, copia); return r; }))));
  }
  // El resto (buscador de lugares) va directo a la red
});
