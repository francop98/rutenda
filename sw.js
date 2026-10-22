/* =========================================================
   Rutenda — service worker
   Hace que la app se pueda instalar, abrir sin conexión y
   recibir recordatorios. Al cambiar archivos, subir el número
   de VERSION para que los celulares descarguen la versión nueva.
   ========================================================= */
const VERSION = 'rutenda-20';
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
  './js/ideas.js',
  './js/salida.js',
  './js/resumen.js',
  './js/tour.js',
  './js/menu.js',
  './js/cargar.js',
  './js/compartido.js',
  './js/bandeja.js',
  './js/preguntar.js',
  './js/quehacersi.js',
  './js/anio.js',
  './js/cierre.js',
  './js/familia.js',
  './js/costumbres.js',
  './js/emergencias.js',
  './js/feriados.js',
  './js/itinerariopdf.js',
  './js/lugares.js',
  './js/mapa.js',
  './js/gmaps.js',
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
      .then(claves => Promise.all(claves.filter(k => k !== VERSION && k !== 'rutenda-compartido').map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* ---------- Compartir hacia Rutenda (desde Gmail, WhatsApp, Archivos…) ---------- */
const CACHE_COMPARTIDO = 'rutenda-compartido';
async function recibirCompartido(req) {
  try {
    const form = await req.formData();
    const c = await caches.open(CACHE_COMPARTIDO);
    for (const k of await c.keys()) await c.delete(k);   // solo lo último que compartiste
    const archivos = form.getAll('archivos').filter(f => f && f.size);
    let i = 0;
    for (const f of archivos.slice(0, 5)) {
      await c.put(new Request(`./compartido/${i++}`), new Response(f, { headers: { 'Content-Type': f.type || 'application/octet-stream', 'X-Nombre': encodeURIComponent(f.name || 'archivo') } }));
    }
    const texto = [form.get('title'), form.get('text'), form.get('url')].filter(Boolean).join('\n').slice(0, 20000);
    if (texto) await c.put(new Request('./compartido/texto'), new Response(texto, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
  } catch (err) { /* si falla, la app abre igual */ }
  return Response.redirect('./index.html#compartido', 303);
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.origin === self.location.origin && url.pathname.endsWith('/compartir')) {
    e.respondWith(recibirCompartido(e.request));
    return;
  }
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
