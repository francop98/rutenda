/* =========================================================
   Rutenda — service worker
   Hace que la app se pueda instalar, abrir sin conexión y
   recibir recordatorios. Al cambiar archivos, subir el número
   de VERSION para que los celulares descarguen la versión nueva.
   ========================================================= */
const VERSION = 'rutenda-13';
const ARCHIVOS = [
  './',
  './index.html',
  './styles.css',
  './main.js',
  './manifest.webmanifest',
  './assets/icono-192.png',
  './assets/icono-512.png',
  './assets/icono-maskable-192.png',
  './assets/icono-maskable-512.png',
  './assets/apple-touch-icon.png',
  './assets/favicon-32.png',
  './assets/favicon.svg',
  './assets/simbolo-claro.svg',
  './assets/simbolo-oscuro.svg',
  './assets/logo-pdf.png',
  './js/aeropuertos.js',
  './js/aeropuertosdatos.js',
  './js/almacenamiento.js',
  './js/autenticacion.js',
  './js/clima.js',
  './js/cotizacion.js',
  './js/cronogramaeditor.js',
  './js/documentos.js',
  './js/escaneo.js',
  './js/firebaseconfig.js',
  './js/formulariospasos.js',
  './js/gastos.js',
  './js/itinerario.js',
  './js/itinerariopdf.js',
  './js/lugares.js',
  './js/mapa.js',
  './js/migracion.js',
  './js/motorprioridad.js',
  './js/paisajeviaje.js',
  './js/participantes.js',
  './js/plantillaguia.js',
  './js/recordatorios.js',
  './js/recorrido.js',
  './js/requisitosviaje.js',
  './js/sincronizacion.js',
  './js/utilidades.js',
  './js/valija.js',
  './js/viajes.js',
  './js/vistaguia.js'
];
// Librerías externas que conviene tener sin conexión
const EXTERNOS = ['www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];

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
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api/')) return; // funciones del servidor: siempre a la red
    // Archivos propios: primero la caché (abre al instante y sin conexión), y se actualiza en segundo plano
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
  // Firebase SDK, Leaflet, lector de PDF y tipografías: caché (son versiones fijas)
  if (EXTERNOS.includes(url.hostname) && !url.pathname.includes('/v0/')) {
    e.respondWith(caches.open(VERSION).then(c => c.match(e.request).then(g => g || fetch(e.request).then(r => {
      if (r && (r.ok || r.type === 'opaque')) { const copia = r.clone(); c.put(e.request, copia); }
      return r;
    }))));
  }
  // El resto (Firestore, clima, cotizaciones, buscador de lugares, mapas) va directo a la red
});

/* ---------- Recordatorios ---------- */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { cuerpo: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Rutenda', {
    body: d.cuerpo || '',
    icon: './assets/icono-192.png',
    badge: './assets/favicon-32.png',
    tag: d.id || undefined,
    data: { url: d.url || '#inicio' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const destino = new URL('./index.html' + (e.notification.data && e.notification.data.url || '#inicio'), self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(lista => {
    const abierta = lista.find(c => c.url.startsWith(self.registration.scope));
    if (abierta) { abierta.navigate(destino).catch(() => {}); return abierta.focus(); }
    return self.clients.openWindow(destino);
  }));
});
