/* =========================================================
   Rutenda — direcciones con desplegable
   Mientras escribís el hotel, la dirección o el lugar, aparece
   una lista de lugares reales (OpenStreetMap, gratis y sin clave)
   cerca del destino. Al elegir uno queda la dirección completa,
   así Google Maps lo ubica exacto.
   ========================================================= */
window.R = window.R || {};

R.direcciones = (function () {
  const U = R.util;
  const { esc } = U;
  const API = 'https://photon.komoot.io/api/';
  const memoria = {};

  /** "Hotel Patagonia, Av. Bustillo 1234, San Carlos de Bariloche" */
  function texto(p) {
    const calle = [p.street, p.housenumber].filter(Boolean).join(' ');
    const ciudad = p.city || p.town || p.village || p.county || '';
    const partes = [p.name, calle, p.name !== ciudad ? ciudad : '', !ciudad ? p.state : ''].filter(Boolean);
    return Array.from(new Set(partes)).join(', ');
  }
  function detalle(p) {
    return [p.city || p.town || p.village || '', p.state, p.country].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(', ');
  }

  async function buscar(q, cerca) {
    const clave = q.toLowerCase() + '|' + (cerca ? cerca.lat.toFixed(1) + ',' + cerca.lon.toFixed(1) : '');
    if (memoria[clave]) return memoria[clave];
    const url = `${API}?q=${encodeURIComponent(q)}&limit=6${cerca ? `&lat=${cerca.lat}&lon=${cerca.lon}&location_bias_scale=0.5` : ''}`;
    const r = await fetch(url);
    if (!r.ok) return [];
    const d = await r.json();
    const lista = (d.features || []).map(f => ({ texto: texto(f.properties || {}), detalle: detalle(f.properties || {}), lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] }))
      .filter(x => x.texto).filter((x, i, a) => a.findIndex(y => y.texto === x.texto) === i);
    memoria[clave] = lista;
    return lista;
  }

  /** Coordenadas del destino para buscar cerca (un destino del viaje, o el lugar que pases). */
  function cercaDe(v, lugar) {
    const l = lugar && lugar.lat != null ? lugar : ((v && v.destinos) || []).find(d => d.lat != null);
    return l ? { lat: Number(l.lat), lon: Number(l.lon) } : null;
  }

  /**
   * Agrega el desplegable a un input. op: { cerca: {lat, lon} }
   * Al elegir, completa el texto y dispara "input" y "change".
   */
  function enlazar(input, op) {
    if (!input || input.dataset.dirListo) return;
    input.dataset.dirListo = '1';
    input.setAttribute('autocomplete', 'off');
    const o = op || {};
    const caja = document.createElement('div');
    caja.className = 'dir-lista';
    caja.hidden = true;
    input.insertAdjacentElement('afterend', caja);
    let reloj = null, pedido = 0, opciones = [], eligiendo = false;
    const cerrar = () => { caja.hidden = true; caja.innerHTML = ''; };
    const elegir = x => {
      input.value = x.texto;
      input.dataset.lat = x.lat; input.dataset.lon = x.lon;
      cerrar();
      eligiendo = true;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      eligiendo = false;
    };
    input.addEventListener('input', e => {
      if (eligiendo) return;
      clearTimeout(reloj);
      const q = input.value.trim();
      delete input.dataset.lat; delete input.dataset.lon;
      if (q.length < 3) { cerrar(); return; }
      reloj = setTimeout(async () => {
        const n = ++pedido;
        try { opciones = await buscar(q, o.cerca); } catch (err) { opciones = []; }
        if (n !== pedido || !input.isConnected) return;
        if (!opciones.length) { cerrar(); return; }
        caja.innerHTML = opciones.map((x, i) => `<button type="button" data-dir="${i}"><strong>📍 ${esc(x.texto)}</strong>${x.detalle ? `<small>${esc(x.detalle)}</small>` : ''}</button>`).join('')
          + '<p class="dir-pie">Elegí uno para que Google Maps lo ubique exacto · © OpenStreetMap</p>';
        caja.hidden = false;
        caja.querySelectorAll('[data-dir]').forEach(b => b.addEventListener('mousedown', ev => { ev.preventDefault(); elegir(opciones[Number(b.dataset.dir)]); }));
      }, 380);
    });
    input.addEventListener('blur', () => setTimeout(cerrar, 150));
    input.addEventListener('keydown', e => { if (e.key === 'Escape') cerrar(); });
  }

  /** Enlaza todos los inputs con data-direccion dentro de un contenedor. */
  function enlazarTodos(cont, cerca) {
    cont.querySelectorAll('input[data-direccion]').forEach(x => enlazar(x, { cerca }));
  }

  return { buscar, enlazar, enlazarTodos, cercaDe, texto };
})();
