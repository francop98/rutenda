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

  function consulta(d, radio) {
    const a = `(around:${radio},${d.lat},${d.lon})`;
    return `[out:json][timeout:25];(
      nwr${a}[tourism~"^(attraction|museum|viewpoint|gallery|zoo|theme_park|aquarium)$"][name];
      nwr${a}[historic~"^(monument|castle|fort|ruins|archaeological_site|city_gate|palace|church|cathedral)$"][name][wikidata];
      nwr${a}[building~"^(cathedral|church|basilica)$"][name][wikipedia];
      nwr${a}[leisure~"^(park|garden|nature_reserve)$"][name][wikidata];
      nwr${a}[natural~"^(beach|peak|waterfall|glacier|cave_entrance)$"][name][wikidata];
      nwr${a}[amenity=marketplace][name][wikidata];
    );out center tags 300;`;
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

  async function buscar(d) {
    const cache = leerCache(d);
    if (cache && Date.now() - cache.t < DIAS_CACHE * 864e5) return cache.items;
    let ultimoError = null;
    for (const radio of [12000]) {
      for (const url of SERVIDORES) {
        try {
          const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(consulta(d, radio)), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const items = procesar(await r.json());
          guardarCache(d, items);
          return items;
        } catch (e) { ultimoError = e; }
      }
    }
    if (cache) return cache.items;   // sin conexión: lo último que se buscó
    throw ultimoError || new Error('sin datos');
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
      titulo: '🧭 Qué hacer',
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

  return { abrir, procesar };
})();
