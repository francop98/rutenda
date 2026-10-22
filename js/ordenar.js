/* =========================================================
   Rutenda — ordenar mi día por cercanía
   Con un toque, busca dónde queda cada lugar del día
   (OpenStreetMap, gratis) y propone el orden más corto:
   arrancás en el alojamiento, vas al más cercano, después al
   siguiente… y volvés. Se abre en Google Maps en ese orden.
   Solo consulta cuando lo tocás; lo encontrado queda guardado.
   ========================================================= */
window.R = window.R || {};

R.ordenar = (function () {
  const U = R.util;
  const { esc } = U;
  const CLAVE = 'rutenda_geo_v1';
  const espera = ms => new Promise(r => setTimeout(r, ms));

  function leer() { try { return JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch (e) { return {}; } }
  function guardar(c) { try { localStorage.setItem(CLAVE, JSON.stringify(c)); } catch (e) { /* lleno */ } }

  /** Distancia en km entre dos puntos. */
  function km(a, b) {
    const rad = x => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  }

  /** ¿Dónde queda? (cerca de la ciudad del día si la sabemos) */
  async function ubicar(q, cerca) {
    const cache = leer();
    if (q in cache) return cache[q];
    const base = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=es&q=' + encodeURIComponent(q);
    const caja = cerca && cerca.lat != null ? `&viewbox=${cerca.lon - 0.6},${cerca.lat + 0.6},${cerca.lon + 0.6},${cerca.lat - 0.6}&bounded=1` : '';
    let r = null;
    try {
      let lista = await (await fetch(base + caja)).json();
      if ((!lista || !lista.length) && caja) { await espera(1100); lista = await (await fetch(base)).json(); }
      if (lista && lista[0]) r = { lat: Number(lista[0].lat), lon: Number(lista[0].lon) };
    } catch (e) { return undefined; }   // sin conexión: no se guarda
    cache[q] = r;
    guardar(cache);
    return r;
  }

  /** Vecino más cercano: desde el inicio, siempre al lugar más cerca que falte.
      Sin alojamiento, prueba arrancar desde cada lugar y se queda con el recorrido más corto. */
  function ordenCorto(inicio, puntos, fin) {
    if (!inicio && puntos.length > 1) {
      let mejor = null;
      puntos.forEach((p, i) => {
        const r = [p, ...vecinos(p, puntos.filter((_, j) => j !== i))];
        if (!mejor || largo(null, r, fin) < largo(null, mejor, fin)) mejor = r;
      });
      return mejor;
    }
    return vecinos(inicio, puntos);
  }
  function vecinos(inicio, puntos) {
    const quedan = puntos.slice();
    const r = [];
    let actual = inicio;
    while (quedan.length) {
      let mejor = 0;
      quedan.forEach((p, i) => { if (km(actual.pos, p.pos) < km(actual.pos, quedan[mejor].pos)) mejor = i; });
      actual = quedan.splice(mejor, 1)[0];
      r.push(actual);
    }
    return r;
  }
  function largo(inicio, lista, fin) {
    const t = [inicio, ...lista, fin].filter(Boolean);
    let s = 0;
    for (let i = 1; i < t.length; i++) s += km(t[i - 1].pos, t[i].pos);
    return s;
  }

  /** ¿Tiene sentido ofrecerlo en este día? */
  function aplica(d) {
    const conLugar = (d.items || []).filter(i => i.lugar && !/^Check-(in|out)/.test(i.titulo));
    return conLugar.length >= 3 || (conLugar.length >= 2 && (d.inicioLugar || d.finLugar));
  }
  function botonHTML(d) {
    return aplica(d) ? `<button type="button" class="btn-texto-mini dia-ordenar" data-ordenar-dia="${d.fecha}">🧭 Ordenar por cercanía</button>` : '';
  }

  async function abrir(v, fecha) {
    const d = R.itinerario.diaDe(v, fecha);
    const lugares = (d.items || []).filter(i => i.lugar && !/^Check-(in|out)/.test(i.titulo));
    const { el } = U.modal({ titulo: '🧭 Ordenar el día por cercanía', subtitulo: `Día ${d.numero}${d.lugarNombre ? ' · ' + d.lugarNombre : ''}`, cuerpo: '<div class="ordenar"><p class="texto-suave">Buscando dónde queda cada lugar…</p><div class="barra-progreso"><span style="width:5%"></span></div></div>' });
    const caja = el.querySelector('.ordenar');
    const cerca = d.lugar;
    const total = lugares.length + (d.inicioLugar ? 1 : 0) + (d.finLugar && d.finLugar !== d.inicioLugar ? 1 : 0);
    let hechos = 0;
    const avanzar = () => { hechos++; const b = caja.querySelector('.barra-progreso span'); if (b) b.style.width = Math.round(hechos / total * 100) + '%'; };
    const cache = leer();
    const buscar = async q => { const enCache = q in cache; const r = await ubicar(q, cerca); avanzar(); if (!enCache) await espera(1100); return r; };
    const puntos = [], noEncontrados = [];
    let inicio = null, fin = null;
    if (d.inicioLugar) { const p = await buscar(d.inicioLugar); if (p) inicio = { titulo: 'Alojamiento', lugar: d.inicioLugar, pos: p, casa: true }; }
    for (const it of lugares) {
      if (!caja.isConnected) return;
      const p = await buscar(it.lugar);
      if (p) puntos.push({ titulo: it.titulo, lugar: it.lugar, hora: it.hora, pos: p });
      else noEncontrados.push(it.titulo);
    }
    if (d.finLugar) {
      if (d.finLugar === d.inicioLugar && inicio) fin = inicio;
      else { const p = await buscar(d.finLugar); if (p) fin = { titulo: 'Alojamiento', lugar: d.finLugar, pos: p, casa: true }; }
    }
    if (!caja.isConnected) return;
    if (puntos.length < 2) {
      caja.innerHTML = `<p>No pude ubicar suficientes lugares para ordenarlos${noEncontrados.length ? ` (no encontré: ${esc(noEncontrados.join(', '))})` : ''}.</p><p class="texto-suave">Probá cargando la dirección en cada actividad.</p>`;
      return;
    }
    const orden = ordenCorto(inicio, puntos, fin);
    const antes = largo(inicio, puntos, fin), despues = largo(inicio, orden, fin);
    const conHora = orden.filter(p => p.hora);
    const url = R.gmaps.ruta([inicio && inicio.lugar, ...orden.map(p => p.lugar), fin && fin.lugar].filter(Boolean));
    caja.innerHTML = `
      <ol class="ordenar-lista">
        ${inicio ? `<li class="ol-casa">🏨 Salís del alojamiento</li>` : ''}
        ${orden.map((p, i) => { const prev = i === 0 ? inicio : orden[i - 1]; return `<li><strong>${esc(p.titulo)}</strong>${p.hora ? ` <small>(lo tenías a las ${esc(p.hora)})</small>` : ''}${prev ? `<small class="ol-dist">${km(prev.pos, p.pos) < 1 ? Math.round(km(prev.pos, p.pos) * 1000) + ' m' : km(prev.pos, p.pos).toFixed(1) + ' km'}</small>` : ''}</li>`; }).join('')}
        ${fin ? `<li class="ol-casa">🏨 Volvés al alojamiento</li>` : ''}
      </ol>
      <p class="ordenar-resumen">${antes - despues > 0.3 ? `En este orden recorrés <strong>${despues.toFixed(1)} km</strong> en vez de ${antes.toFixed(1)} km.` : `Tu orden ya es bastante corto (${despues.toFixed(1)} km).`}</p>
      ${conHora.length ? '<p class="ayuda">Ojo con lo que tiene horario fijo (reservas, excursiones): acomodá el resto alrededor.</p>' : ''}
      ${noEncontrados.length ? `<p class="ayuda">No encontré: ${esc(noEncontrados.join(', '))}. Si les cargás la dirección, los sumo.</p>` : ''}
      <a class="btn btn-primario btn-bloque" href="${esc(url)}" target="_blank" rel="noopener">🗺️ Abrir en Google Maps en este orden</a>`;
  }

  function enlazar(cont, v) {
    cont.querySelectorAll('[data-ordenar-dia]').forEach(b => b.onclick = e => { e.stopPropagation(); abrir(v, b.dataset.ordenarDia); });
  }

  return { aplica, botonHTML, abrir, enlazar, ordenCorto, km };
})();
