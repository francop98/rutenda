/* =========================================================
   Tripbox — buscador de lugares
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
      lat: x.latitude, lon: x.longitude
    }));
    cache[clave] = lista;
    return lista;
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
      <div class="lugar-info"></div>`;
    const input = cont.querySelector('.lugar-input');
    const lista = cont.querySelector('.lugar-lista');
    const info = cont.querySelector('.lugar-info');

    function pintarInfo() {
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

  return { buscar, campo, bandera, etiqueta };
})();
