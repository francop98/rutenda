/* =========================================================
   Rutenda — Qué hacer en cada destino
   Lo más conocido de cada lugar (museos, lugares para ver,
   parques, playas…) desde OpenStreetMap, gratis y sin IA.
   Los lugares más famosos son los que tienen página en Wikipedia
   y nombre traducido a más idiomas: así se ordena la lista.
   Se guarda en el celular, así se ve también sin señal.
   ========================================================= */
window.R = window.R || {};

R.queHacer = (function () {
  const U = R.util;
  const { esc } = U;
  const A = () => R.agenda;
  const SERVIDORES = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  const DIAS_CACHE = 30;
  const CATEGORIAS = [
    ['todo', '✨', 'Todo'], ['ver', '📸', 'Para ver'], ['museo', '🏛️', 'Museos'], ['naturaleza', '🌳', 'Naturaleza'], ['paseo', '🎡', 'Paseos']
  ];
  const ICONO = { ver: '📸', museo: '🏛️', naturaleza: '🌳', paseo: '🎡' };

  const claveCache = d => `rutenda_quehacer_${Number(d.lat).toFixed(2)}_${Number(d.lon).toFixed(2)}`;
  function leerCache(d) {
    try { const c = JSON.parse(localStorage.getItem(claveCache(d)) || 'null'); return c && c.items ? c : null; } catch (e) { return null; }
  }
  function guardarCache(d, items) { try { localStorage.setItem(claveCache(d), JSON.stringify({ t: Date.now(), items })); } catch (e) { /* sin lugar: no pasa nada */ } }

  /*
   * Consulta rápida: un recuadro alrededor del destino (mucho más rápido que buscar "a tantos metros")
   * y solo lugares con ficha en Wikidata, que son los conocidos.
   */
  function consulta(d, km) {
    const dLat = km / 111, dLon = km / (111 * Math.max(0.2, Math.cos(d.lat * Math.PI / 180)));
    const caja = [d.lat - dLat, d.lon - dLon, d.lat + dLat, d.lon + dLon].map(n => n.toFixed(4)).join(',');
    return `[out:json][timeout:12][bbox:${caja}];(
      nwr[tourism~"^(attraction|museum|viewpoint|gallery|zoo|theme_park|aquarium)$"][wikidata];
      nwr[historic~"^(monument|castle|fort|ruins|archaeological_site|city_gate|palace)$"][wikidata];
      nwr[building~"^(cathedral|basilica)$"][wikidata];
      nwr[leisure~"^(park|garden|nature_reserve)$"][wikipedia];
      nwr[natural~"^(beach|peak|waterfall|glacier)$"][wikidata];
      nwr[amenity=marketplace][wikidata];
    );out center tags qt 250;`;
  }

  function categoria(t) {
    if (t.tourism === 'museum' || t.tourism === 'gallery') return 'museo';
    if (t.tourism === 'theme_park' || t.amenity === 'marketplace') return 'paseo';
    if (t.leisure || t.natural || t.tourism === 'zoo' || t.tourism === 'aquarium') return 'naturaleza';
    return 'ver';
  }
  const TIPO_TEXTO = {
    museum: 'Museo', gallery: 'Galería de arte', viewpoint: 'Mirador', zoo: 'Zoológico', theme_park: 'Parque de diversiones', aquarium: 'Acuario',
    monument: 'Monumento', castle: 'Castillo', fort: 'Fuerte', ruins: 'Ruinas', archaeological_site: 'Sitio arqueológico', city_gate: 'Puerta antigua',
    palace: 'Palacio', church: 'Iglesia', cathedral: 'Catedral', basilica: 'Basílica', park: 'Parque', garden: 'Jardín', nature_reserve: 'Reserva natural',
    beach: 'Playa', peak: 'Cerro', waterfall: 'Cascada', glacier: 'Glaciar', cave_entrance: 'Cueva', marketplace: 'Mercado'
  };
  const tipoTexto = t => TIPO_TEXTO[t.tourism] || TIPO_TEXTO[t.historic] || TIPO_TEXTO[t.building] || TIPO_TEXTO[t.leisure] || TIPO_TEXTO[t.natural] || TIPO_TEXTO[t.amenity] || 'Atracción';

  /** Ordena por fama: Wikipedia, Wikidata y en cuántos idiomas tiene nombre. */
  function procesar(json) {
    const vistos = new Set();
    return (json.elements || []).map(e => {
      const t = e.tags || {};
      const nombre = t['name:es'] || t.name;
      const lat = e.lat != null ? e.lat : e.center && e.center.lat, lon = e.lon != null ? e.lon : e.center && e.center.lon;
      const idiomas = Object.keys(t).filter(k => k.startsWith('name:')).length;
      const puntos = (t.wikipedia ? 30 : 0) + (t.wikidata ? 15 : 0) + Math.min(idiomas, 60) + (t.tourism === 'attraction' || t.tourism === 'museum' ? 5 : 0);
      return { nombre, lat, lon, cat: categoria(t), tipo: tipoTexto(t), puntos };
    }).filter(x => x.nombre && x.lat != null && x.puntos >= 5)
      .sort((a, b) => b.puntos - a.puntos)
      .filter(x => { const k = x.nombre.toLowerCase(); if (vistos.has(k)) return false; vistos.add(k); return true; })
      .slice(0, 40)
      .map(({ puntos, ...x }) => x);
  }

  /** Pregunta a los dos servidores a la vez y se queda con el primero que responde. */
  async function pedir(d, km) {
    const cuerpo = 'data=' + encodeURIComponent(consulta(d, km));
    const cortes = SERVIDORES.map(() => (typeof AbortController !== 'undefined' ? new AbortController() : null));
    const intentos = SERVIDORES.map((url, i) => fetch(url, { method: 'POST', body: cuerpo, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: cortes[i] ? cortes[i].signal : undefined })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(j => { cortes.forEach((c, k) => { if (c && k !== i) c.abort(); }); return j; }));
    const espera = new Promise((_, no) => setTimeout(() => no(new Error('tardó demasiado')), 15000));
    return Promise.race([primero(intentos), espera]);
  }
  /** Como Promise.any (el primero que sale bien). */
  function primero(ps) {
    return new Promise((si, no) => { let fallas = 0; ps.forEach(p => p.then(si, e => { if (++fallas === ps.length) no(e); })); });
  }

  const enCurso = {};
  async function buscar(d) {
    const cache = leerCache(d);
    if (cache && Date.now() - cache.t < DIAS_CACHE * 864e5) return cache.items;
    const k = claveCache(d);
    if (!enCurso[k]) enCurso[k] = pedir(d, 10).then(j => { const items = procesar(j); guardarCache(d, items); return items; }).finally(() => { delete enCurso[k]; });
    try { return await enCurso[k]; } catch (e) {
      if (cache) return cache.items;   // sin conexión: lo último que se buscó
      throw e;
    }
  }

  /** Se busca de antemano (al abrir el itinerario), así al tocar el botón ya está. */
  function precargar(v) {
    if (navigator.onLine === false) return;
    const hacer = () => destinos(v).filter(d => d.lat != null && d.lon != null && !leerCache(d)).slice(0, 3)
      .reduce((p, d) => p.then(() => buscar(d).catch(() => {})), Promise.resolve());
    if (window.requestIdleCallback) requestIdleCallback(hacer, { timeout: 4000 }); else setTimeout(hacer, 1500);
  }

  /** Los destinos donde tiene sentido buscar (los de pasada no). */
  const destinos = v => (v.destinos || []).filter(d => d.nombre && !d.paso);

  function abrir(v, alTerminar) {
    const ds = destinos(v);
    if (!ds.length) { U.toast('Primero cargá a dónde vas.'); return; }
    let actual = ds[0], filtro = 'todo', items = null, error = '';
    const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
    const yaEsta = it => A().items(v).some(i => norm(i.titulo) === norm(it.nombre));
    const diasDe = d => {
      const todos = A().dias(v);
      const ahi = R.itinerario && R.itinerario.ciudadDe ? todos.filter(f => norm(R.itinerario.ciudadDe(v, f)) === norm(d.nombre)) : [];
      return ahi.length ? ahi : todos;
    };
    const { el } = U.modal({
      titulo: '📍 Lugares para conocer',
      subtitulo: 'Lo más conocido de cada lugar, para sumar a tu itinerario',
      cuerpo: '<div class="qh"></div>',
      acciones: [{ texto: 'Listo', clase: 'btn-primario' }]
    });
    const caja = el.querySelector('.qh');

    function pintar() {
      const lista = (items || []).filter(x => filtro === 'todo' || x.cat === filtro);
      const hay = new Set((items || []).map(x => x.cat));
      caja.innerHTML = `
        ${ds.length > 1 ? `<div class="chips-elegir qh-destinos">${ds.map((d, i) => `<button type="button" class="chip-op ${d === actual ? 'activo' : ''}" data-destino="${i}">${esc(d.nombre)}</button>`).join('')}</div>` : `<p class="qh-lugar">En <strong>${esc(actual.nombre)}</strong></p>`}
        ${items && items.length ? `<div class="chips-elegir chips-chicos qh-filtros">${CATEGORIAS.filter(([k]) => k === 'todo' || hay.has(k)).map(([k, ic, n]) => `<button type="button" class="chip-op ${filtro === k ? 'activo' : ''}" data-filtro="${k}">${ic} ${n}</button>`).join('')}</div>` : ''}
        ${items === null && !error ? '<p class="texto-suave qh-cargando">Buscando lo más conocido… 🔎</p>' : ''}
        ${error ? `<p class="texto-suave">${esc(error)}</p>` : ''}
        ${items && !items.length && !error ? '<p class="texto-suave">No encontré lugares conocidos acá. Probá con la ciudad más cercana.</p>' : ''}
        <ul class="qh-lista">${lista.map(x => {
          const n = items.indexOf(x);
          const esta = yaEsta(x);
          return `<li class="qh-item" data-i="${n}">
            <span class="qh-icono" aria-hidden="true">${ICONO[x.cat]}</span>
            <span class="qh-texto"><strong>${esc(x.nombre)}</strong><small>${esc(x.tipo)} · <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(x.nombre + ' ' + actual.nombre)}" target="_blank" rel="noopener">Ver en el mapa</a></small></span>
            ${esta ? '<span class="qh-ok">✓ En tu viaje</span>' : `<button type="button" class="btn btn-suave btn-chico" data-agregar="${n}">+ Agregar</button>`}
            <div class="qh-dias" data-dias="${n}" hidden>
              <small>¿Qué día?</small>
              <div class="chips-dias">${diasDe(actual).map(f => `<button type="button" class="chip-dia" data-dia="${f}">${esc(U.fmtFecha(f, 'dia'))}</button>`).join('')}</div>
              <button type="button" class="btn btn-texto btn-chico" data-dia="">💡 Sin día, a "Quiero hacer"</button>
            </div>
          </li>`;
        }).join('')}</ul>
        ${items && items.length ? '<p class="qh-fuente">Datos de © OpenStreetMap</p>' : ''}`;
      caja.querySelectorAll('[data-destino]').forEach(b => b.onclick = () => { actual = ds[Number(b.dataset.destino)]; cargar(); });
      caja.querySelectorAll('[data-filtro]').forEach(b => b.onclick = () => { filtro = b.dataset.filtro; pintar(); });
      caja.querySelectorAll('[data-agregar]').forEach(b => b.onclick = () => {
        caja.querySelectorAll('.qh-dias').forEach(x => { x.hidden = x.dataset.dias !== b.dataset.agregar || !x.hidden; });
      });
      caja.querySelectorAll('[data-dia]').forEach(b => b.onclick = () => {
        const x = items[Number(b.closest('.qh-item').dataset.i)];
        const fecha = b.dataset.dia;
        A().guardarItem(v, A().nuevoItem({ titulo: x.nombre, tipo: x.cat === 'museo' ? 'entrada' : 'paseo', lugar: actual.nombre, lat: x.lat, lon: x.lon, fecha }));
        R.db.guardarViaje(v);
        U.toast(fecha ? `"${x.nombre}" quedó el ${U.fmtFecha(fecha, 'dia')}.` : `"${x.nombre}" quedó en "Quiero hacer".`);
        pintar();
        if (alTerminar) alTerminar();
      });
    }

    async function cargar() {
      items = null; error = ''; filtro = 'todo';
      pintar();
      const d = actual;
      if (d.lat == null || d.lon == null) { error = `No sé dónde queda ${d.nombre}. Elegilo de la lista de sugerencias al editar el viaje.`; items = []; pintar(); return; }
      try {
        const r = await buscar(d);
        if (d !== actual) return;
        items = r;
      } catch (e) {
        if (d !== actual) return;
        error = navigator.onLine === false ? 'Sin conexión: probá de nuevo cuando tengas señal.' : 'No pude buscar ahora. Probá de nuevo en un rato.';
        items = [];
      }
      pintar();
    }
    cargar();
  }

  return { abrir, procesar, precargar };
})();
