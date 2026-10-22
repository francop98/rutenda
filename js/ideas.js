/* =========================================================
   Rutenda — ideas de qué hacer en cada destino
   Pide al servidor una lista corta (Wikivoyage + atractivos +
   IA), la guarda en el viaje y deja elegir con un toque.
   Lo elegido se suma al itinerario (sin día) y, si conviene
   reservar antes, como paso en la guía.
   ========================================================= */
window.R = window.R || {};

R.ideas = (function () {
  const U = R.util;
  const { esc } = U;
  const ICONOS = { imperdible: '⭐', naturaleza: '🌲', excursion: '🚌', cultura: '🏛️', gastronomia: '🍽️', aventura: '🧗', compras: '🛍️', noche: '🌙' };
  const cargando = {};

  const destinosDe = v => (v.destinos || []).filter(d => d.nombre && !d.soloDia && !d.dePaso);
  const guardadas = (v, d) => (v.ideas || {})[d.id] || null;

  function mesDe(v, d) {
    const e = R.recorrido.estadias(v).find(x => x.id === d.id);
    const f = (e && e.desde) || v.fechaInicio;
    return f ? Number(f.slice(5, 7)) : 0;
  }

  /** Bloques plegables "Qué hacer en …" (uno por destino). */
  function seccionHTML(v) {
    const ds = destinosDe(v);
    if (!ds.length) return '';
    return ds.map(d => {
      const g = guardadas(v, d);
      const elegidas = g ? g.ideas.filter(i => i.elegida).length : 0;
      return `
      <details class="bloque plegable ideas-bloque" data-ideas="${d.id}">
        <summary><h3 class="bloque-titulo">💡 Qué hacer en ${esc(d.nombre)}</h3>${elegidas ? `<span class="contador">${elegidas}</span>` : ''}</summary>
        <div class="ideas-cuerpo">${g ? listaHTML(v, d, g) : '<p class="texto-suave">Tocá para ver ideas…</p>'}</div>
      </details>`;
    }).join('');
  }

  const claveIdea = (destId, i) => destId + '|' + U.hash(i.titulo);
  /** Quiénes marcaron 👍 una idea (ids de persona). */
  function votantes(v, destId, i) {
    const k = claveIdea(destId, i);
    return Object.keys(v.votos || {}).filter(pid => (v.votos[pid] || {})[k]);
  }
  function votar(v, destId, n) {
    const i = ((v.ideas || {})[destId] || {}).ideas[n];
    if (!i) return false;
    const yo = R.db.yoEn(v);
    const k = claveIdea(destId, i);
    v.votos = v.votos || {};
    const mios = Object.assign({}, v.votos[yo]);
    if (mios[k]) delete mios[k]; else mios[k] = true;
    v.votos[yo] = mios;
    R.db.guardarViaje(v);
    return !!mios[k];
  }

  function listaHTML(v, d, g) {
    const org = R.db.puedeOrganizar(v);
    const grupo = (v.participantes || []).length > 1;
    const yo = R.db.yoEn(v);
    return `
      <p class="texto-suave ideas-intro">${org ? `Marcá lo que te interese: se suma a tu itinerario${g.ideas.some(i => i.reserva) ? ' y, si hay que reservar, a la guía' : ''}.` : 'Tocá 👍 en lo que te guste: quien organiza ve qué quiere el grupo.'}${grupo && org ? ' Con 👍 cada viajero marca lo que le gusta.' : ''}</p>
      <div class="ideas-lista">${g.ideas.map((i, n) => `
        <div class="idea ${i.elegida ? 'elegida' : ''}">
          <label class="idea-check">
            <input type="checkbox" data-idea="${d.id}|${n}" ${i.elegida ? 'checked' : ''} ${org ? '' : 'disabled'}>
            <span class="idea-icono">${ICONOS[i.tipo] || '⭐'}</span>
            <span class="idea-texto">
              <strong>${esc(i.titulo)}</strong>
              <small>${esc(i.descripcion)}</small>
              <span class="idea-chips">${i.reserva ? '<span class="chip chip-sol">🎟️ Conviene reservar</span>' : ''}${i.duracion ? `<span class="chip">⏱ ${esc(i.duracion)}</span>` : ''}</span>
            </span>
          </label>
          ${grupo ? (() => {
            const quienes = votantes(v, d.id, i);
            return `<span class="idea-votos"><button type="button" class="idea-voto ${quienes.includes(yo) ? 'activo' : ''}" data-votar="${d.id}|${n}" aria-pressed="${quienes.includes(yo)}">👍 ${quienes.length || ''}</button>${quienes.map(pid => U.avatar(R.db.persona(pid), 22)).join('')}</span>`;
          })() : ''}
          <span class="idea-enlaces">
            <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(i.lugar || i.titulo)}" target="_blank" rel="noopener">Maps</a>
            <a href="https://www.tripadvisor.com.ar/Search?q=${encodeURIComponent(i.lugar || i.titulo)}" target="_blank" rel="noopener">Tripadvisor</a>
          </span>
        </div>`).join('')}</div>
      <div class="ideas-pie">
        <small class="texto-tenue">Ideas armadas con IA${g.fuentes && g.fuentes.length ? ' a partir de ' + g.fuentes.map(f => `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.nombre)}</a>`).join(' y ') : ''}. Chequeá horarios y precios antes de ir.</small>
        ${org && !v.ejemplo ? `<button type="button" class="btn btn-texto btn-chico" data-otras-ideas="${d.id}">↻ Otras ideas</button>` : ''}
      </div>`;
  }

  async function pedir(v, d, otras) {
    if (R.db.modo() !== 'nube' || !R.nube || !R.nube.auth().currentUser) throw new Error('Las ideas necesitan que entres con tu cuenta en la nube.');
    const token = await R.nube.auth().currentUser.getIdToken();
    const e = R.recorrido.estadias(v).find(x => x.id === d.id);
    const r = await fetch('/api/ideas-destino', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({
        destino: { nombre: d.nombre, region: d.region, pais: d.pais, lat: d.lat, lon: d.lon },
        mes: mesDe(v, d), noches: e && e.noches, menores: !!(v.perfil && v.perfil.menores), otras: !!otras
      })
    });
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(datos.error || 'No pude traer ideas ahora.');
    return datos;
  }

  /** Carga (o trae del viaje) las ideas de un destino y las pinta en su bloque. */
  async function cargar(v, d, caja, otras) {
    if (!otras && guardadas(v, d)) { caja.innerHTML = listaHTML(v, d, guardadas(v, d)); enlazar(v, caja); return; }
    if (!R.db.puedeOrganizar(v)) { caja.innerHTML = '<p class="texto-suave">Cuando quien organiza busque ideas, las vas a ver acá para marcar las que te gusten.</p>'; return; }
    if (cargando[d.id]) return;
    cargando[d.id] = true;
    caja.innerHTML = '<p class="texto-suave ideas-cargando">✨ Buscando ideas para ' + esc(d.nombre) + '…</p>';
    try {
      const datos = await pedir(v, d, otras);
      const previas = guardadas(v, d);
      const elegidas = previas ? previas.ideas.filter(i => i.elegida) : [];
      // Lo que ya elegiste se conserva arriba
      const nuevas = elegidas.concat(datos.ideas.filter(i => !elegidas.some(x => x.titulo.toLowerCase() === i.titulo.toLowerCase())));
      v.ideas = v.ideas || {};
      v.ideas[d.id] = { ideas: nuevas, fuentes: datos.fuentes || [], mes: datos.mes || 0, creado: datos.creado || new Date().toISOString() };
      R.db.guardarViaje(v);
      caja.innerHTML = listaHTML(v, d, v.ideas[d.id]);
      enlazar(v, caja);
    } catch (e) {
      caja.innerHTML = `<p class="texto-suave">${esc(e.message)}</p><button type="button" class="btn btn-suave btn-chico" data-reintentar>Probar de nuevo</button>`;
      const b = caja.querySelector('[data-reintentar]');
      if (b) b.onclick = () => cargar(v, d, caja, otras);
    } finally {
      cargando[d.id] = false;
    }
  }

  /** Elegir o sacar una idea: itinerario (sin día) y, si hay que reservar, un paso en la guía. */
  function elegir(v, destId, n, si) {
    const g = (v.ideas || {})[destId];
    const i = g && g.ideas[n];
    if (!i) return;
    const origen = `idea_${destId}_${U.hash(i.titulo)}`;
    i.elegida = si;
    v.itinerario = (v.itinerario || []).filter(e => e.origen !== origen);
    v.tareasPropias = (v.tareasPropias || []).filter(t => t.origen !== origen);
    if (si) {
      const d = (v.destinos || []).find(x => x.id === destId) || {};
      v.itinerario.push({ id: U.id('evt'), origen, fecha: '', hora: '', tipo: i.tipo === 'gastronomia' ? 'comida' : 'actividad', titulo: i.titulo, lugar: i.lugar || d.nombre || '', confirmacion: '', notas: i.descripcion || '' });
      if (i.reserva) v.tareasPropias.push({ id: U.id('pro'), origen, titulo: `Reservar: ${i.titulo}`, fase: 'experiencias', impacto: 3, desc: `${i.descripcion} Conviene reservarlo antes de viajar.`, dependeDe: [] });
    }
    R.db.guardarViaje(v);
  }

  function enlazar(v, cont) {
    cont.querySelectorAll('[data-idea]').forEach(x => x.onchange = () => {
      const [destId, n] = x.dataset.idea.split('|');
      elegir(v, destId, Number(n), x.checked);
      x.closest('.idea').classList.toggle('elegida', x.checked);
      const i = v.ideas[destId].ideas[Number(n)];
      U.toast(x.checked ? (i.reserva ? 'Sumado al itinerario y a la guía para reservarlo.' : 'Sumado a tu itinerario.') : 'Lo saqué.');
    });
    cont.querySelectorAll('[data-votar]').forEach(b => b.onclick = e => {
      e.preventDefault();
      const [destId, n] = b.dataset.votar.split('|');
      const si = votar(v, destId, Number(n));
      const d = destinosDe(v).find(x => x.id === destId);
      const caja = b.closest('.ideas-cuerpo');
      caja.innerHTML = listaHTML(v, d, v.ideas[destId]);
      enlazar(v, caja);
      U.toast(si ? 'Te gusta 👍' : 'Sacaste tu 👍');
    });
    cont.querySelectorAll('[data-otras-ideas]').forEach(b => b.onclick = () => {
      const d = destinosDe(v).find(x => x.id === b.dataset.otrasIdeas);
      if (d) cargar(v, d, b.closest('.ideas-cuerpo'), true);
    });
  }

  /** Engancha los bloques: las ideas se buscan recién al abrir cada uno. */
  function enlazarSeccion(v, cont) {
    cont.querySelectorAll('details[data-ideas]').forEach(det => {
      const d = destinosDe(v).find(x => x.id === det.dataset.ideas);
      const caja = det.querySelector('.ideas-cuerpo');
      if (guardadas(v, d)) enlazar(v, caja);
      det.addEventListener('toggle', () => { if (det.open && !guardadas(v, d)) cargar(v, d, caja); });
    });
  }

  return { seccionHTML, enlazarSeccion, elegir, votar, votantes, ICONOS };
})();
