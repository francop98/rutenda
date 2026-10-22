/* =========================================================
   Rutenda — Google Maps
   Enlaces gratuitos (sin clave) para abrir Google Maps:
   - "Cómo llegar" a un lugar desde donde estés.
   - El recorrido de un día, en orden (alojamiento → lo que
     hacés → alojamiento).
   - La ruta del viaje completo, destino por destino.
   En el celular se abre la app de Google Maps si la tenés.
   ========================================================= */
window.R = window.R || {};

R.gmaps = (function () {
  const U = R.util;
  const { esc } = U;
  const BASE = 'https://www.google.com/maps';
  const MAX_PARADAS = 9;   // Google Maps acepta hasta 9 paradas intermedias en un enlace

  const enc = x => encodeURIComponent(String(x || '').trim());

  /** Buscar un lugar. */
  function buscar(q) { return `${BASE}/search/?api=1&query=${enc(q)}`; }
  /** Cómo llegar a un lugar desde donde estás ahora. */
  function comoLlegar(q, modo) { return `${BASE}/dir/?api=1&destination=${enc(q)}${modo ? '&travelmode=' + modo : ''}`; }

  /** Ruta con varias paradas, en orden. paradas: textos (o "lat,lon"). */
  function ruta(paradas, modo) {
    const p = paradas.filter(Boolean).filter((x, i, a) => i === 0 || normal(x) !== normal(a[i - 1]));
    if (!p.length) return '';
    if (p.length === 1) return comoLlegar(p[0], modo);
    let medio = p.slice(1, -1);
    if (medio.length > MAX_PARADAS) {
      // Si hay muchas, tomamos paradas repartidas a lo largo del camino
      const paso = medio.length / MAX_PARADAS;
      medio = Array.from({ length: MAX_PARADAS }, (_, i) => medio[Math.floor(i * paso)]);
    }
    return `${BASE}/dir/?api=1&origin=${enc(p[0])}&destination=${enc(p[p.length - 1])}`
      + (medio.length ? `&waypoints=${medio.map(enc).join('%7C')}` : '')
      + (modo ? `&travelmode=${modo}` : '');
  }
  function normal(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }

  /** "Puerto Iguazú, Misiones, Argentina" */
  function textoLugar(l) {
    if (!l) return '';
    return [l.nombre, l.region && l.region !== l.nombre ? l.region : '', l.pais].filter(Boolean).join(', ');
  }

  /* ---------- Viaje completo ---------- */
  /** Las ciudades del viaje en el orden en que las recorrés (incluye la vuelta a casa). */
  function paradasViaje(v) {
    const segs = R.recorrido.todosLosSegmentos(v.recorrido || []).map(x => x.seg).filter(s => s.desde && s.hasta);
    if (!segs.length) {
      const ds = (v.destinos || []).filter(d => d.nombre);
      return [v.origen].concat(ds).filter(x => x && x.nombre);
    }
    const r = [segs[0].desde];
    segs.forEach(s => r.push(s.hasta));
    return r.filter((x, i) => x && x.nombre && (i === 0 || normal(x.nombre) !== normal(r[i - 1].nombre)));
  }
  /** Modo para Google Maps: en auto, "manejando"; si no, que Google elija. */
  function modoViaje(v) {
    const segs = R.recorrido.todosLosSegmentos(v.recorrido || []).map(x => x.seg);
    return segs.length && segs.every(s => s.medio === 'auto') ? 'driving' : '';
  }
  function rutaViaje(v) { return ruta(paradasViaje(v).map(textoLugar), modoViaje(v)); }

  /** Cartel con la ruta completa y cada tramo por separado. */
  function abrirRutaViaje(v) {
    const paradas = paradasViaje(v);
    if (paradas.length < 2) { U.toast('Cargá los destinos del viaje para ver la ruta.'); return; }
    const segs = R.recorrido.todosLosSegmentos(v.recorrido || []).map(x => x.seg).filter(s => s.desde && s.hasta && s.desde.nombre && s.hasta.nombre);
    const hayVuelos = segs.some(s => s.medio === 'avion' || s.medio === 'barco');
    U.modal({
      titulo: '🗺️ La ruta en Google Maps',
      subtitulo: paradas.map(p => p.nombre).join(' → '),
      cuerpo: `
        <a class="btn btn-primario btn-bloque" href="${esc(rutaViaje(v))}" target="_blank" rel="noopener">Abrir la ruta completa, en orden</a>
        ${hayVuelos ? '<p class="ayuda">Google Maps arma la ruta por tierra. Si un tramo es en avión o barco y no hay camino, abrí ese tramo solo.</p>' : ''}
        ${segs.length ? `
          <h4 class="titulo-paso">Cada tramo</h4>
          <ul class="gm-tramos">${segs.map(s => {
            const m = R.recorrido.medio(s.medio);
            const modo = s.medio === 'auto' ? 'driving' : (s.medio === 'micro' || s.medio === 'tren') ? 'transit' : '';
            return `<li><span>${m.icono}</span><span class="gm-texto">${esc(s.desde.nombre)} → ${esc(s.hasta.nombre)}</span>
              <a class="btn-texto-mini" href="${esc(ruta([textoLugar(s.desde), textoLugar(s.hasta)], modo))}" target="_blank" rel="noopener">Ver</a></li>`;
          }).join('')}</ul>` : ''}`,
      acciones: [{ texto: 'Cerrar' }]
    });
  }

  /* ---------- Un día ---------- */
  /** Paradas de un día en orden: alojamiento → actividades con lugar → alojamiento. */
  function paradasDia(d) {
    const medio = (d.items || []).filter(it => it.lugar).map(it => it.lugar);
    const r = [];
    if (d.inicioLugar) r.push(d.inicioLugar);
    r.push(...medio);
    if (d.finLugar) r.push(d.finLugar);
    return r.filter((x, i) => i === 0 || normal(x) !== normal(r[i - 1]));
  }
  /** Enlace al recorrido del día (si hay al menos dos lugares distintos). */
  function rutaDia(d) {
    const p = paradasDia(d);
    return p.length >= 2 && (d.items || []).some(it => it.lugar) ? ruta(p) : '';
  }
  function enlaceDiaHTML(d) {
    const url = rutaDia(d);
    return url ? `<p class="dia-linea dia-ruta"><a href="${esc(url)}" target="_blank" rel="noopener">🗺️ Ver el recorrido del día en Google Maps</a></p>` : '';
  }
  /** Botoncito "Cómo llegar" para un evento del itinerario. */
  function enlaceItemHTML(lugar) {
    return lugar ? `<a class="ev-maps" href="${esc(comoLlegar(lugar))}" target="_blank" rel="noopener" onclick="event.stopPropagation()">📍 Cómo llegar</a>` : '';
  }

  return { buscar, comoLlegar, ruta, textoLugar, paradasViaje, rutaViaje, abrirRutaViaje, paradasDia, rutaDia, enlaceDiaHTML, enlaceItemHTML };
})();
