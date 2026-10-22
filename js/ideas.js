/* =========================================================
   Rutenda — "Qué hacer" en cada destino
   Reemplaza las notas sueltas: anotás todo lo que querés hacer
   o visitar, decidís qué va y qué descartás, y lo que va lo
   ponés en un día. Se agrupa por zona para armar cada día por
   ubicación. Las sugerencias con IA se piden solo con un botón.

   Datos en el viaje:
   v.planes[destId] = [{ id, titulo, nota, tipo, zona, costo, duracion, reserva, lugar,
                         estado: 'quiero'|'va'|'descarto', fecha, hora, origen: 'manual'|'ia' }]
   v.sugerencias[destId] = { ideas: [...], fuentes, mes, creado }
   ========================================================= */
window.R = window.R || {};

R.ideas = (function () {
  const U = R.util;
  const { esc } = U;
  const ICONOS = { imperdible: '⭐', naturaleza: '🌲', excursion: '🚌', cultura: '🏛️', gastronomia: '🍽️', aventura: '🧗', compras: '🛍️', noche: '🌙', otro: '📍' };
  const cargando = {};
  const abiertos = {};   // bloques desplegados (para que no se cierren al guardar)
  const verDescartadas = {};

  const destinosDe = v => (v.destinos || []).filter(d => d.nombre && !d.soloDia && !d.dePaso);

  /** Pasa los datos de versiones anteriores (v.ideas + eventos "idea_") al formato nuevo. */
  function migrar(v) {
    v.planes = v.planes || {};
    v.sugerencias = v.sugerencias || {};
    if (!v.ideas) return;
    Object.entries(v.ideas).forEach(([destId, g]) => {
      if (!g || !Array.isArray(g.ideas)) return;
      v.sugerencias[destId] = v.sugerencias[destId] || { ideas: g.ideas.map(i => Object.assign({}, i, { elegida: undefined })), fuentes: g.fuentes || [], mes: g.mes || 0, creado: g.creado };
      g.ideas.filter(i => i.elegida).forEach(i => {
        const origen = `idea_${destId}_${U.hash(i.titulo)}`;
        const ev = (v.itinerario || []).find(e => e.origen === origen) || {};
        const id = U.id('pln');
        (v.planes[destId] = v.planes[destId] || []).push({ id, titulo: i.titulo, nota: i.descripcion || '', tipo: i.tipo || 'otro', zona: '', costo: '', duracion: i.duracion || '', reserva: !!i.reserva, lugar: i.lugar || '', estado: 'va', fecha: ev.fecha || '', hora: ev.hora || '', origen: 'ia' });
        v.itinerario = (v.itinerario || []).filter(e => e.origen !== origen);
        (v.tareasPropias || []).filter(t => t.origen === origen).forEach(t => { t.origen = 'plan_' + id; });
      });
    });
    delete v.ideas;
  }

  const planesDe = (v, destId) => ((v.planes || {})[destId] || []);
  function todos(v) { return Object.entries(v.planes || {}).flatMap(([destId, l]) => l.map(p => Object.assign({ destId }, p))); }
  /** Lo que "va" para un día (lo usa el itinerario). */
  function delDia(v, fecha) { return todos(v).filter(p => p.estado === 'va' && p.fecha === fecha); }
  function sinDia(v) { return todos(v).filter(p => p.estado === 'va' && !p.fecha); }
  function cuenta(v) { return todos(v).filter(p => p.estado !== 'descarto').length; }

  function diasDeEstadia(v, destId) {
    const e = R.recorrido.estadias(v).find(x => x.id === destId);
    const r = [];
    if (e && e.desde && e.hasta) for (let f = e.desde; f <= e.hasta; f = U.sumarDias(f, 1)) r.push(f);
    return r;
  }

  /* ---------------------------------------------------------
     Guardar cambios de un plan (y su paso "Reservar" en la guía)
     --------------------------------------------------------- */
  function sincronizarReserva(v, destId, p) {
    const origen = 'plan_' + p.id;
    v.tareasPropias = (v.tareasPropias || []).filter(t => t.origen !== origen);
    if (p.estado === 'va' && p.reserva) {
      v.tareasPropias.push({ id: U.id('pro'), origen, titulo: `Reservar: ${p.titulo}`, fase: 'experiencias', impacto: 3, desc: `${p.nota || ''} Conviene reservarlo antes.`.trim(), dependeDe: [], fechaManual: p.fecha ? U.sumarDias(p.fecha, -7) : '' });
    }
  }
  function guardarPlan(v, destId, p) {
    v.planes = v.planes || {};
    const lista = v.planes[destId] = v.planes[destId] || [];
    const i = lista.findIndex(x => x.id === p.id);
    if (i >= 0) lista[i] = p; else lista.push(p);
    sincronizarReserva(v, destId, p);
    R.db.guardarViaje(v);
  }
  function quitarPlan(v, destId, id) {
    v.planes[destId] = planesDe(v, destId).filter(x => x.id !== id);
    v.tareasPropias = (v.tareasPropias || []).filter(t => t.origen !== 'plan_' + id);
    R.db.guardarViaje(v);
  }
  function nuevoPlan(datos) {
    return Object.assign({ id: U.id('pln'), titulo: '', nota: '', tipo: 'otro', zona: '', costo: '', duracion: '', reserva: false, lugar: '', estado: 'quiero', fecha: '', hora: '', origen: 'manual' }, datos);
  }

  /* ---------------------------------------------------------
     Votos (si viajan varios)
     --------------------------------------------------------- */
  const claveVoto = id => 'plan_' + id;
  function votantes(v, id) { return Object.keys(v.votos || {}).filter(pid => (v.votos[pid] || {})[claveVoto(id)]); }
  function votar(v, id) {
    const yo = R.db.yoEn(v);
    v.votos = v.votos || {};
    const mios = Object.assign({}, v.votos[yo]);
    if (mios[claveVoto(id)]) delete mios[claveVoto(id)]; else mios[claveVoto(id)] = true;
    v.votos[yo] = mios;
    R.db.guardarViaje(v);
    return !!mios[claveVoto(id)];
  }

  /* ---------------------------------------------------------
     Vista "Qué hacer"
     --------------------------------------------------------- */
  function vistaHTML(v) {
    migrar(v);
    const ds = destinosDe(v);
    if (!ds.length) return '<div class="bloque"><p class="texto-suave">Cargá un destino y acá armás la lista de lo que querés hacer.</p></div>';
    return ds.map(d => bloqueHTML(v, d)).join('');
  }

  function bloqueHTML(v, d) {
    const lista = planesDe(v, d.id);
    const van = lista.filter(p => p.estado === 'va'), quiero = lista.filter(p => p.estado === 'quiero'), fuera = lista.filter(p => p.estado === 'descarto');
    const costoVa = van.reduce((a, p) => a + (U.numero(p.costo) || 0), 0);
    const abierto = abiertos[d.id] !== undefined ? abiertos[d.id] : destinosDe(v).length === 1 || lista.length > 0;
    const sug = (v.sugerencias || {})[d.id];
    const org = R.db.puedeOrganizar(v);
    return `
      <details class="bloque plegable plan-bloque" data-plan-dest="${d.id}" ${abierto ? 'open' : ''}>
        <summary>
          <h3 class="bloque-titulo">📝 ${esc(d.nombre)}</h3>
          ${lista.length ? `<span class="plan-resumen">${van.length ? `✓ ${van.length}` : ''}${quiero.length ? ` · ${quiero.length} por decidir` : ''}</span>` : ''}
        </summary>
        <div class="plegable-cuerpo">
          ${org ? `<form class="fila-agregar plan-agregar" data-plan-agregar="${d.id}">
            <input placeholder="Algo que quieras hacer o visitar" aria-label="Algo que quieras hacer" enterkeyhint="done">
            <button type="submit" class="btn btn-primario">Agregar</button>
          </form>` : ''}
          ${quiero.length || van.length ? `
            ${van.length ? `<h4 class="plan-sub">Va ${costoVa ? `<small>· costo estimado ${U.fmtMoneda(costoVa, v.monedaBase)}</small>` : ''}</h4>
              <div class="plan-lista">${porZona(van).map(g => zonaHTML(v, d, g)).join('')}</div>` : ''}
            ${quiero.length ? `<h4 class="plan-sub">Por decidir</h4>
              <div class="plan-lista">${porZona(quiero).map(g => zonaHTML(v, d, g)).join('')}</div>` : ''}`
            : '<p class="texto-suave plan-vacio">Anotá todo lo que te interese, sin filtro. Después decidís qué va y qué descartás.</p>'}
          ${fuera.length ? `<details class="plan-descartadas" ${verDescartadas[d.id] ? 'open' : ''} data-plan-descartadas="${d.id}"><summary>Descartadas (${fuera.length})</summary>
            <div class="plan-lista">${fuera.map(p => itemHTML(v, d, p)).join('')}</div></details>` : ''}
          ${org ? `<div class="plan-ia">
            ${sug && sug.ideas && sug.ideas.length ? sugerenciasHTML(v, d, sug) : `
              <button type="button" class="btn btn-suave btn-chico" data-plan-ia="${d.id}">✨ Sugerir ideas con IA</button>
              <small class="texto-tenue">Usa una consulta de IA. Solo cuando lo tocás.</small>`}
          </div>` : ''}
        </div>
      </details>`;
  }

  /** Agrupa por zona para armar los días por ubicación. */
  function porZona(lista) {
    const mapa = new Map();
    lista.forEach(p => { const z = (p.zona || '').trim(); if (!mapa.has(z)) mapa.set(z, []); mapa.get(z).push(p); });
    return Array.from(mapa.entries()).sort((a, b) => (a[0] ? 0 : 1) - (b[0] ? 0 : 1) || a[0].localeCompare(b[0])).map(([zona, items]) => ({ zona, items }));
  }
  function zonaHTML(v, d, g) {
    const hayZonas = planesDe(v, d.id).some(p => p.zona);
    return `${hayZonas ? `<div class="plan-zona">${g.zona ? '📍 ' + esc(g.zona) : 'Sin zona'}</div>` : ''}${g.items.map(p => itemHTML(v, d, p)).join('')}`;
  }

  function itemHTML(v, d, p) {
    const org = R.db.puedeOrganizar(v);
    const grupo = (v.participantes || []).length > 1;
    const yo = R.db.yoEn(v);
    const quienes = grupo ? votantes(v, p.id) : [];
    const dias = diasDeEstadia(v, d.id);
    const meta = [p.costo ? U.fmtMoneda(U.numero(p.costo), v.monedaBase) : '', p.duracion ? '⏱ ' + p.duracion : '', p.reserva ? '🎟️ Reservar' : ''].filter(Boolean);
    return `
      <div class="plan plan-${p.estado}">
        <button type="button" class="plan-texto" data-plan-editar="${d.id}|${p.id}">
          <span class="plan-icono">${ICONOS[p.tipo] || '📍'}</span>
          <span><strong>${esc(p.titulo)}</strong>${p.nota ? `<small>${esc(p.nota)}</small>` : ''}${meta.length ? `<small class="plan-meta">${esc(meta.join(' · '))}</small>` : ''}</span>
        </button>
        <div class="plan-acciones">
          ${org ? (p.estado === 'va' ? `
            <select class="plan-dia" data-plan-dia="${d.id}|${p.id}" aria-label="Día">
              <option value="">Sin día</option>
              ${dias.map(f => `<option value="${f}" ${p.fecha === f ? 'selected' : ''}>${U.fmtFecha(f, 'dia')}</option>`).join('')}
            </select>
            <button type="button" class="plan-btn" data-plan-estado="${d.id}|${p.id}|quiero" title="Volver a por decidir">↩︎</button>`
            : p.estado === 'quiero' ? `
            <button type="button" class="plan-btn plan-va" data-plan-estado="${d.id}|${p.id}|va">✓ Va</button>
            <button type="button" class="plan-btn" data-plan-estado="${d.id}|${p.id}|descarto" title="Descartar">✕</button>`
            : `<button type="button" class="plan-btn" data-plan-estado="${d.id}|${p.id}|quiero">Recuperar</button>`) : ''}
          ${grupo ? `<button type="button" class="idea-voto ${quienes.includes(yo) ? 'activo' : ''}" data-plan-votar="${p.id}">👍 ${quienes.length || ''}</button>` : ''}
          <a class="plan-mapa" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.lugar || [p.titulo, d.nombre].join(', '))}" target="_blank" rel="noopener" title="Ver en Maps">🗺️</a>
        </div>
      </div>`;
  }

  function sugerenciasHTML(v, d, sug) {
    const ya = new Set(planesDe(v, d.id).map(p => p.titulo.toLowerCase()));
    const pendientes = sug.ideas.filter(i => !ya.has(String(i.titulo).toLowerCase()));
    return `
      <div class="plan-sugerencias">
        <div class="ps-cab"><strong>✨ Ideas sugeridas</strong>${pendientes.length > 1 ? `<button type="button" class="btn-texto-mini" data-plan-todas="${d.id}">Agregar todas</button>` : ''}</div>
        ${pendientes.length ? pendientes.map(i => `
          <div class="ps-idea">
            <span class="plan-icono">${ICONOS[i.tipo] || '⭐'}</span>
            <span class="ps-texto"><strong>${esc(i.titulo)}</strong><small>${esc(i.descripcion || '')}${i.reserva ? ' · 🎟️ conviene reservar' : ''}</small>
              <span class="ps-enlaces"><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(i.lugar || i.titulo)}" target="_blank" rel="noopener">Maps</a><a href="https://www.tripadvisor.com.ar/Search?q=${encodeURIComponent(i.lugar || i.titulo)}" target="_blank" rel="noopener">Tripadvisor</a></span></span>
            <button type="button" class="btn btn-suave btn-chico" data-plan-sumar="${d.id}|${esc(i.titulo)}">+ Anotar</button>
          </div>`).join('') : '<p class="texto-suave">Ya anotaste todas las sugerencias.</p>'}
        <div class="ideas-pie">
          <small class="texto-tenue">Armadas con IA${sug.fuentes && sug.fuentes.length ? ' a partir de ' + sug.fuentes.map(f => `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.nombre)}</a>`).join(' y ') : ''}. Chequeá horarios y precios.</small>
          <button type="button" class="btn btn-texto btn-chico" data-plan-ia="${d.id}" data-otras="1">↻ Otras ideas (usa IA)</button>
        </div>
      </div>`;
  }

  /* ---------------------------------------------------------
     IA: solo cuando la pedís
     --------------------------------------------------------- */
  function mesDe(v, d) {
    const e = R.recorrido.estadias(v).find(x => x.id === d.id);
    const f = (e && e.desde) || v.fechaInicio;
    return f ? Number(f.slice(5, 7)) : 0;
  }
  async function pedirIA(v, d, otras) {
    if (R.db.modo() !== 'nube' || !R.nube || !R.nube.auth().currentUser) throw new Error('Las sugerencias necesitan que entres con tu cuenta en la nube.');
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

  /* ---------------------------------------------------------
     Editar un plan
     --------------------------------------------------------- */
  function editar(v, destId, id, alGuardar) {
    const p = Object.assign({}, planesDe(v, destId).find(x => x.id === id));
    if (!p.id) return;
    const dias = diasDeEstadia(v, destId);
    const zonas = Array.from(new Set(planesDe(v, destId).map(x => x.zona).filter(Boolean)));
    const org = R.db.puedeOrganizar(v);
    const acciones = [{ texto: 'Cancelar' }];
    if (org) acciones.unshift({ texto: 'Eliminar', clase: 'btn-texto peligro', onClick: () => { quitarPlan(v, destId, id); if (alGuardar) alGuardar(); U.toast('Eliminado.'); } });
    if (org) acciones.push({
      texto: 'Guardar', clase: 'btn-primario', onClick: el => {
        const val = s => el.querySelector(s).value.trim();
        if (!val('#plTitulo')) { U.toast('Poné un nombre.'); return false; }
        Object.assign(p, {
          titulo: val('#plTitulo'), nota: val('#plNota'), zona: val('#plZona'), costo: val('#plCosto'), duracion: val('#plDuracion'),
          lugar: val('#plLugar'), reserva: el.querySelector('#plReserva').checked, tipo: el.querySelector('#plTipo').value,
          fecha: el.querySelector('#plFecha') ? el.querySelector('#plFecha').value : p.fecha, hora: el.querySelector('#plHora') ? el.querySelector('#plHora').value : p.hora
        });
        if (p.fecha && p.estado !== 'va') p.estado = 'va';
        guardarPlan(v, destId, p);
        if (alGuardar) alGuardar();
      }
    });
    U.modal({
      titulo: org ? 'Editar' : p.titulo,
      cuerpo: `
        <label class="campo"><span>Qué</span><input id="plTitulo" value="${esc(p.titulo)}" ${org ? '' : 'disabled'}></label>
        <label class="campo"><span>Notas</span><textarea id="plNota" rows="2" placeholder="Lo que quieras recordar" ${org ? '' : 'disabled'}>${esc(p.nota)}</textarea></label>
        <div class="grilla-2">
          <label class="campo"><span>Zona</span><input id="plZona" list="plZonas" value="${esc(p.zona)}" placeholder="Ej: Centro" ${org ? '' : 'disabled'}><datalist id="plZonas">${zonas.map(z => `<option value="${esc(z)}">`).join('')}</datalist></label>
          <label class="campo"><span>Costo aprox. (${esc(v.monedaBase)})</span><input id="plCosto" inputmode="decimal" value="${esc(p.costo)}" placeholder="0" ${org ? '' : 'disabled'}></label>
        </div>
        <div class="grilla-2">
          <label class="campo"><span>Duración</span><input id="plDuracion" value="${esc(p.duracion)}" placeholder="Ej: medio día" ${org ? '' : 'disabled'}></label>
          <label class="campo"><span>Tipo</span><select id="plTipo" ${org ? '' : 'disabled'}>${Object.entries(ICONOS).map(([k, ic]) => `<option value="${k}" ${p.tipo === k ? 'selected' : ''}>${ic} ${k === 'gastronomia' ? 'gastronomía' : k === 'excursion' ? 'excursión' : k}</option>`).join('')}</select></label>
        </div>
        ${dias.length ? `<div class="grilla-2 grilla-fh">
          <label class="campo"><span>Día</span><select id="plFecha" ${org ? '' : 'disabled'}><option value="">Sin día</option>${dias.map(f => `<option value="${f}" ${p.fecha === f ? 'selected' : ''}>${U.fmtFecha(f, 'dia')}</option>`).join('')}</select></label>
          <label class="campo"><span>Hora</span><input type="time" id="plHora" value="${esc(p.hora)}" ${org ? '' : 'disabled'}></label>
        </div>` : ''}
        <label class="campo"><span>Dirección o lugar (para el mapa)</span><input id="plLugar" value="${esc(p.lugar)}" placeholder="Ej: Cerro Campanario" ${org ? '' : 'disabled'}></label>
        <label class="check"><input type="checkbox" id="plReserva" ${p.reserva ? 'checked' : ''} ${org ? '' : 'disabled'}> Hay que reservar antes (lo sumo a la guía)</label>`,
      acciones
    });
  }

  /* ---------------------------------------------------------
     Enlazar la vista
     --------------------------------------------------------- */
  function enlazar(v, cont, repintar) {
    const pintarDe = destId => {
      const viejo = cont.querySelector(`[data-plan-dest="${destId}"]`);
      const d = destinosDe(v).find(x => x.id === destId);
      if (!viejo || !d) return repintar();
      abiertos[destId] = true;
      const tmp = document.createElement('div');
      tmp.innerHTML = bloqueHTML(v, d);
      const nuevo = tmp.firstElementChild;
      viejo.replaceWith(nuevo);
      enlazarBloque(nuevo);
    };
    function enlazarBloque(raiz) {
      raiz.addEventListener('toggle', () => { if (raiz.matches('details[data-plan-dest]')) abiertos[raiz.dataset.planDest] = raiz.open; });
      raiz.querySelectorAll('[data-plan-descartadas]').forEach(x => x.addEventListener('toggle', () => { verDescartadas[x.dataset.planDescartadas] = x.open; }));
      raiz.querySelectorAll('[data-plan-agregar]').forEach(f => f.onsubmit = e => {
        e.preventDefault();
        const input = f.querySelector('input');
        const t = input.value.trim();
        if (!t) return;
        guardarPlan(v, f.dataset.planAgregar, nuevoPlan({ titulo: t.slice(0, 80) }));
        pintarDe(f.dataset.planAgregar);
        const otro = cont.querySelector(`[data-plan-agregar="${f.dataset.planAgregar}"] input`);
        if (otro) otro.focus();
      });
      raiz.querySelectorAll('[data-plan-estado]').forEach(b => b.onclick = () => {
        const [destId, id, estado] = b.dataset.planEstado.split('|');
        const p = planesDe(v, destId).find(x => x.id === id);
        if (!p) return;
        p.estado = estado;
        if (estado !== 'va') { p.fecha = ''; p.hora = ''; }
        guardarPlan(v, destId, p);
        pintarDe(destId);
        if (estado === 'va' && p.reserva) U.toast('Va. Lo sumé a la guía para reservarlo.');
      });
      raiz.querySelectorAll('[data-plan-dia]').forEach(s => s.onchange = () => {
        const [destId, id] = s.dataset.planDia.split('|');
        const p = planesDe(v, destId).find(x => x.id === id);
        if (!p) return;
        p.fecha = s.value;
        guardarPlan(v, destId, p);
        U.toast(p.fecha ? `Listo: ${U.fmtFecha(p.fecha, 'dia')}.` : 'Quedó sin día.');
      });
      raiz.querySelectorAll('[data-plan-editar]').forEach(b => b.onclick = () => {
        const [destId, id] = b.dataset.planEditar.split('|');
        editar(v, destId, id, () => pintarDe(destId));
      });
      raiz.querySelectorAll('[data-plan-votar]').forEach(b => b.onclick = () => {
        const si = votar(v, b.dataset.planVotar);
        pintarDe(b.closest('[data-plan-dest]').dataset.planDest);
        U.toast(si ? 'Te gusta 👍' : 'Sacaste tu 👍');
      });
      raiz.querySelectorAll('[data-plan-sumar]').forEach(b => b.onclick = () => {
        const [destId, ...resto] = b.dataset.planSumar.split('|');
        const titulo = resto.join('|');
        const i = (v.sugerencias[destId].ideas || []).find(x => x.titulo === titulo);
        if (!i) return;
        guardarPlan(v, destId, nuevoPlan({ titulo: i.titulo, nota: i.descripcion || '', tipo: i.tipo || 'otro', duracion: i.duracion || '', reserva: !!i.reserva, lugar: i.lugar || '', origen: 'ia' }));
        pintarDe(destId);
      });
      raiz.querySelectorAll('[data-plan-todas]').forEach(b => b.onclick = () => {
        const destId = b.dataset.planTodas;
        const ya = new Set(planesDe(v, destId).map(p => p.titulo.toLowerCase()));
        (v.sugerencias[destId].ideas || []).filter(i => !ya.has(String(i.titulo).toLowerCase())).forEach(i => {
          (v.planes[destId] = v.planes[destId] || []).push(nuevoPlan({ titulo: i.titulo, nota: i.descripcion || '', tipo: i.tipo || 'otro', duracion: i.duracion || '', reserva: !!i.reserva, lugar: i.lugar || '', origen: 'ia' }));
        });
        R.db.guardarViaje(v);
        pintarDe(destId);
        U.toast('Anoté todas. Ahora decidí qué va.');
      });
      raiz.querySelectorAll('[data-plan-ia]').forEach(b => b.onclick = async () => {
        const destId = b.dataset.planIa;
        const d = destinosDe(v).find(x => x.id === destId);
        if (!d || cargando[destId]) return;
        cargando[destId] = true;
        const caja = b.closest('.plan-ia');
        caja.innerHTML = `<p class="texto-suave ideas-cargando">✨ Buscando ideas para ${esc(d.nombre)}…</p>`;
        try {
          const datos = await pedirIA(v, d, !!b.dataset.otras);
          v.sugerencias = v.sugerencias || {};
          v.sugerencias[destId] = { ideas: datos.ideas || [], fuentes: datos.fuentes || [], mes: datos.mes || 0, creado: datos.creado || new Date().toISOString() };
          R.db.guardarViaje(v);
        } catch (e) {
          U.toast(e.message);
        } finally {
          cargando[destId] = false;
          pintarDe(destId);
        }
      });
    }
    cont.querySelectorAll('details[data-plan-dest]').forEach(enlazarBloque);
  }

  return { migrar, vistaHTML, enlazar, delDia, sinDia, todos, cuenta, editar, votar, votantes, planesDe, guardarPlan, nuevoPlan, ICONOS };
})();
