/* =========================================================
   Rutenda — mapa del recorrido
   Leaflet + OpenStreetMap (gratis). Se carga solo cuando
   abrís el mapa, para no hacer más pesada la app.
   ========================================================= */
window.R = window.R || {};

R.mapa = (function () {
  const LEAFLET_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
  const LEAFLET_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
  let cargando = null;

  function cargarLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (cargando) return cargando;
    cargando = new Promise((resolver, rechazar) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = LEAFLET_CSS;
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = LEAFLET_JS;
      js.onload = () => resolver(window.L);
      js.onerror = () => { cargando = null; rechazar(new Error('No se pudo cargar el mapa')); };
      document.head.appendChild(js);
    });
    return cargando;
  }

  /** Puntos del viaje en orden: origen, paradas, destinos y escapadas. */
  function puntos(v) {
    const r = [];
    const agregar = (l, tipo, etiqueta) => {
      if (!l || l.lat == null || l.lon == null) return;
      if (r.some(p => Math.abs(p.lat - l.lat) < 0.01 && Math.abs(p.lon - l.lon) < 0.01 && p.tipo === tipo)) return;
      r.push({ lat: l.lat, lon: l.lon, tipo, etiqueta: etiqueta || l.nombre });
    };
    agregar(v.origen, 'origen', `🏠 ${v.origen && v.origen.nombre}`);
    (v.destinos || []).forEach(d => agregar(d, d.soloDia ? 'escapada' : 'destino', `${d.soloDia ? '☀️' : '🏡'} ${d.nombre}`));
    R.recorrido.todosLosSegmentos(v.recorrido).forEach(x => agregar(x.seg.hasta, 'parada', `📍 ${x.seg.hasta.nombre}`));
    return r;
  }

  async function mostrar(cont, v) {
    cont.innerHTML = '<div class="mapa-cargando">Cargando mapa…</div>';
    let L;
    try { L = await cargarLeaflet(); } catch (e) {
      cont.innerHTML = '<p class="texto-suave">No se pudo cargar el mapa (¿sin conexión?).</p>';
      return;
    }
    const pts = puntos(v);
    if (!pts.length) { cont.innerHTML = '<p class="texto-suave">Elegí los lugares desde las sugerencias para poder ubicarlos en el mapa.</p>'; return; }
    cont.innerHTML = '<div class="mapa-lienzo"></div>';
    const lienzo = cont.querySelector('.mapa-lienzo');
    const mapa = L.map(lienzo, { scrollWheelZoom: false, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(mapa);
    const colores = { origen: '#142824', destino: '#1F3A36', escapada: '#d9825b', parada: '#8e9896' };
    pts.forEach(p => {
      L.circleMarker([p.lat, p.lon], { radius: p.tipo === 'parada' ? 6 : 9, color: '#fff', weight: 2, fillColor: colores[p.tipo], fillOpacity: 1 })
        .addTo(mapa).bindPopup(p.etiqueta);
    });
    // Líneas de cada traslado (punteadas si es en avión)
    R.recorrido.todosLosSegmentos(v.recorrido).forEach(x => {
      const a = x.seg.desde, b = x.seg.hasta;
      if (a.lat == null || b.lat == null) return;
      L.polyline([[a.lat, a.lon], [b.lat, b.lon]], {
        color: x.seg.medio === 'avion' ? '#466a8f' : '#d9825b', weight: 3, opacity: 0.85, dashArray: x.seg.medio === 'avion' ? '6 8' : null
      }).addTo(mapa).bindPopup(R.recorrido.etiquetaSegmento(x.seg));
    });
    // Escapadas: línea fina desde su base
    (v.destinos || []).filter(d => d.soloDia && d.lat != null).forEach(d => {
      const base = (v.destinos || []).find(x => x.id === d.base);
      if (base && base.lat != null) L.polyline([[base.lat, base.lon], [d.lat, d.lon]], { color: '#d9825b', weight: 2, dashArray: '2 6' }).addTo(mapa);
    });
    mapa.fitBounds(L.latLngBounds(pts.map(p => [p.lat, p.lon])), { padding: [30, 30], maxZoom: 9 });
    setTimeout(() => mapa.invalidateSize(), 200);
  }

  return { mostrar, puntos };
})();
