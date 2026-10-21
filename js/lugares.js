/* =========================================================
   Rutenda — buscador de lugares
   Autocompleta ciudades y completa país, provincia/estado,
   código de país y coordenadas automáticamente.
   Usa el geocodificador gratuito de Open-Meteo (sin clave).
   Si no hay conexión, el campo sigue funcionando a mano.
   ========================================================= */
window.R = window.R || {};

R.lugares = (function () {
  const U = R.util;
  const { esc } = U;
  const URL_BASE = 'https://geocoding-api.open-meteo.com/v1/search';
  const cache = {};

  function bandera(codigo) {
    if (!codigo || codigo.length !== 2) return '';
    return String.fromCodePoint(...codigo.toUpperCase().split('').map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
  }

  async function buscar(texto) {
    const q = texto.trim();
    if (q.length < 2) return [];
    const clave = q.toLowerCase();
    if (cache[clave]) return cache[clave];
    const r = await fetch(`${URL_BASE}?name=${encodeURIComponent(q)}&count=7&language=es&format=json`);
    if (!r.ok) throw new Error('Sin respuesta del buscador');
    const json = await r.json();
    const lista = (json.results || []).map(x => ({
      nombre: x.name,
      region: x.admin1 || '',
      pais: x.country || '',
      codigoPais: (x.country_code || '').toUpperCase(),
      lat: x.latitude, lon: x.longitude, zona: x.timezone || '',
      elevacion: x.elevation != null ? x.elevation : null, poblacion: x.population || 0, tipoLugar: x.feature_code || ''
    }));
    cache[clave] = lista;
    return lista;
  }

  const clave = l => String((l && l.nombre) || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  /** Ciudades de tus viajes anteriores (las más recientes primero), sin repetir. */
  function recientes(excluir) {
    const fuera = new Set((excluir || []).map(clave));
    const vistos = new Set();
    const r = [];
    const sumar = l => {
      if (!l || !l.nombre) return;
      const k = clave(l);
      if (!k || vistos.has(k) || fuera.has(k)) return;
      vistos.add(k);
      r.push({ nombre: l.nombre, region: l.region || '', pais: l.pais || '', codigoPais: l.codigoPais || '', lat: l.lat, lon: l.lon, zona: l.zona || '', elevacion: l.elevacion, poblacion: l.poblacion, tipoLugar: l.tipoLugar });
    };
    const viajes = (R.db && R.db.viajes ? R.db.viajes() : []).slice().sort((a, b) => String(b.creado || '').localeCompare(String(a.creado || '')));
    const pref = R.db && R.db.prefs ? R.db.prefs().ciudadOrigen : null;
    sumar(pref);
    viajes.forEach(v => {
      sumar(v.origen);
      (v.destinos || []).forEach(sumar);
      (v.recorrido || []).forEach(t => (t.segmentos || []).forEach(s => { sumar(s.desde); sumar(s.hasta); }));
    });
    return r;
  }

  function etiqueta(l) {
    if (!l || !l.nombre) return '';
    return [l.nombre, l.region, l.pais].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(', ');
  }

  /**
   * Convierte un contenedor en un campo de lugar.
   * opciones: { valor, placeholder, alCambiar(lugar) }
   * Devuelve { obtener() } con el lugar actual { nombre, region, pais, codigoPais, lat, lon }.
   */
  function campo(cont, opciones) {
    const op = opciones || {};
    let lugar = Object.assign({ nombre: '', region: '', pais: '', codigoPais: '' }, op.valor || {});
    let resultados = [];
    let indice = -1;
    let temporizador = null;
    let ultimaBusqueda = 0;

    cont.classList.add('lugar');
    cont.innerHTML = `
      <div class="lugar-caja">
        <input type="text" class="lugar-input" autocomplete="off" placeholder="${esc(op.placeholder || 'Ciudad o lugar')}" value="${esc(lugar.nombre)}">
        <ul class="lugar-lista oculto" role="listbox"></ul>
      </div>
      <div class="lugar-info"></div>
      <div class="lugar-sugeridos"></div>`;
    const input = cont.querySelector('.lugar-input');
    const sugeridos = cont.querySelector('.lugar-sugeridos');
    /** Ciudades que ya usaste: un toque y listo, sin volver a escribirlas. */
    function pintarSugeridos() {
      const lista = (op.sugeridos || []).filter(s => s && s.nombre && clave(s) !== clave(lugar)).slice(0, 6);
      if (!lista.length || (lugar.nombre && lugar.codigoPais)) { sugeridos.innerHTML = ''; return; }
      sugeridos.innerHTML = `<small>Usadas antes:</small>${lista.map((s, i) => `<button type="button" class="chip-lugar" data-sug="${i}">${bandera(s.codigoPais) || '📍'} ${esc(s.nombre)}</button>`).join('')}`;
      sugeridos.querySelectorAll('[data-sug]').forEach(bt => bt.addEventListener('click', () => {
        lugar = Object.assign({}, lista[Number(bt.dataset.sug)]);
        input.value = lugar.nombre;
        cerrar(); pintarInfo(); avisar();
      }));
    }
    const lista = cont.querySelector('.lugar-lista');
    const info = cont.querySelector('.lugar-info');

    function pintarInfo() {
      pintarSugeridos();
      if (!lugar.nombre) { info.innerHTML = ''; return; }
      if (lugar.pais && lugar.codigoPais) {
        info.innerHTML = `<span class="lugar-detectado">${bandera(lugar.codigoPais)} ${esc([lugar.region, lugar.pais].filter(Boolean).join(', '))}</span>`;
      } else {
        info.innerHTML = `<label class="lugar-pais-manual">País: <input type="text" value="${esc(lugar.pais)}" placeholder="Escribilo o elegí una sugerencia"></label>`;
        info.querySelector('input').oninput = e => { lugar.pais = e.target.value.trim(); lugar.codigoPais = ''; avisar(); };
      }
    }
    function avisar() { if (op.alCambiar) op.alCambiar(obtener()); }
    function cerrar() { lista.classList.add('oculto'); indice = -1; }
    function pintarLista() {
      if (!resultados.length) { cerrar(); return; }
      lista.innerHTML = resultados.map((r, i) => `
        <li role="option" data-i="${i}" class="${i === indice ? 'activo' : ''}">
          <span class="ll-bandera">${bandera(r.codigoPais) || '📍'}</span>
          <span><strong>${esc(r.nombre)}</strong><small>${esc([r.region, r.pais].filter(Boolean).join(', '))}</small></span>
        </li>`).join('');
      lista.classList.remove('oculto');
      lista.querySelectorAll('li').forEach(li => li.addEventListener('mousedown', e => { e.preventDefault(); elegir(Number(li.dataset.i)); }));
    }
    function elegir(i) {
      const r = resultados[i];
      if (!r) return;
      lugar = Object.assign({}, r);
      input.value = r.nombre;
      cerrar();
      pintarInfo();
      avisar();
    }

    input.addEventListener('input', () => {
      const texto = input.value;
      lugar = { nombre: texto.trim(), region: '', pais: lugar.pais && !lugar.codigoPais ? lugar.pais : '', codigoPais: '' };
      pintarInfo();
      avisar();
      clearTimeout(temporizador);
      if (texto.trim().length < 2) { resultados = []; cerrar(); return; }
      temporizador = setTimeout(async () => {
        const n = ++ultimaBusqueda;
        try {
          const r = await buscar(texto);
          if (n !== ultimaBusqueda) return;
          resultados = r;
          indice = -1;
          pintarLista();
        } catch (e) {
          resultados = [];
          cerrar();
        }
      }, 280);
    });
    input.addEventListener('keydown', e => {
      if (lista.classList.contains('oculto')) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); indice = Math.min(resultados.length - 1, indice + 1); pintarLista(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); indice = Math.max(0, indice - 1); pintarLista(); }
      else if (e.key === 'Enter') { e.preventDefault(); elegir(indice < 0 ? 0 : indice); }
      else if (e.key === 'Escape') { e.stopPropagation(); cerrar(); }
    });
    input.addEventListener('blur', () => setTimeout(cerrar, 120));
    pintarInfo();

    function obtener() { return Object.assign({}, lugar, { nombre: input.value.trim() }); }
    return { obtener, input };
  }

  return { buscar, campo, bandera, etiqueta, recientes };
})();
