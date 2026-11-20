/* =========================================================
   Rutenda — Pendientes
   - Por hacer: lo que anotás vos. Si le ponés fecha, se ordena
     por fecha; si le pedís aviso, te llega ese día.
   - Recomendadas para este viaje: salen del destino y de lo que
     cargaste. Se marcan como listas o "no aplica".
   Las ideas ("Quiero hacer") están arriba del itinerario.
   ========================================================= */
window.R = window.R || {};

R.pendientes = (function () {
  const U = R.util;
  const { esc } = U;
  const A = () => R.agenda;

  const SUGERENCIAS = [
    'Sacar el seguro de viaje', 'Avisar al banco que viajo', 'Revisar que el DNI o pasaporte no venza',
    'Descargar el mapa sin conexión', 'Cambiar plata o cargar la tarjeta', 'Hacer el check-in online',
    'Imprimir o bajar los vouchers', 'Dejar a alguien a cargo de las plantas o la mascota',
    'Avisar a la familia el itinerario', 'Cargar la SUBE o la tarjeta de transporte'
  ];
  let verHechos = false;

  function lista(v) { return v.pendientes || (v.pendientes = []); }
  function faltan(v) { return lista(v).filter(p => !p.hecho).length; }
  /** Por hacer: primero lo que tiene fecha (la más cercana arriba), después lo demás; lo hecho al final. */
  function ordenados(v) {
    const peso = p => p.fecha ? '0' + p.fecha : '1';
    return lista(v).filter(p => !p.hecho).sort((a, b) => peso(a).localeCompare(peso(b)) || String(a.creado || '').localeCompare(String(b.creado || '')));
  }
  function cuando(p) {
    if (!p.fecha) return '';
    const d = U.diasEntre(U.hoyISO(), p.fecha);
    const txt = d < 0 ? `venció el ${U.fmtFecha(p.fecha, 'corto')}` : d === 0 ? 'hoy' : d === 1 ? 'mañana' : U.fmtFecha(p.fecha, 'dia');
    return txt + (p.aviso ? ' · 🔔' : '');
  }
  function listasGuardadas() { return R.db.prefs().listasPendientes || []; }

  function render(v, cont) {
    const puede = R.db.puedeOrganizar(v);
    const pend = ordenados(v);
    const hechos = lista(v).filter(p => p.hecho);
    const guardadas = listasGuardadas();
    // Pendientes asignados: con más de un viajero, cada uno ve los suyos primero
    const yo = R.db.yoEn(v);
    const grupo = (v.participantes || []).length > 1;
    if (!grupo || !pend.some(p => p.quien)) filtroQuien = 'todos';
    const pendVer = (filtroQuien === 'mios' ? pend.filter(p => p.quien === yo) : pend.slice())
      .sort((a, b) => (grupo ? (b.quien === yo) - (a.quien === yo) : 0));
    cont.innerHTML = `
      <div class="pend2">
        <section class="bloque pend2-bloque">
          <div class="pend2-cab"><h2 class="titulo-seccion">Por hacer</h2><span class="texto-suave">${hechos.length} de ${lista(v).length} listos</span></div>
          ${puede ? `<form class="pend2-nuevo" data-form="pend">
            <input id="pTexto" placeholder="Agregar un pendiente" aria-label="Nuevo pendiente" autocomplete="off">
            <button type="submit" class="btn btn-primario" aria-label="Agregar">+</button>
          </form>` : ''}
          ${puede && R.armar ? R.armar.faltaHTML(v, true) : ''}
          ${grupo && pend.some(p => p.quien) ? `<div class="chips-filtro pend2-filtro">
            <button class="${filtroQuien === 'todos' ? 'activo' : ''}" data-quien="todos">Todos</button>
            <button class="${filtroQuien === 'mios' ? 'activo' : ''}" data-quien="mios">Los míos <span>${pend.filter(p => p.quien === yo).length}</span></button>
          </div>` : ''}
          ${pendVer.length ? `<div class="pend2-lista">${pendVer.map(p => filaHTML(p, puede, v)).join('')}</div>` : `<p class="texto-suave pend2-vacio">${hechos.length ? '¡Nada pendiente! 🎉' : 'Anotá lo que tengas que resolver antes o durante el viaje.'}</p>`}
          ${hechos.length ? `
            <button type="button" class="btn-texto-mini" data-a="hechos">${verHechos ? 'Ocultar' : 'Ver'} lo hecho (${hechos.length})</button>
            ${verHechos ? `<div class="pend2-lista pend2-hechos">${hechos.map(p => filaHTML(p, puede, v)).join('')}</div>` : ''}` : ''}
          ${puede ? `<div class="pend2-extras">
            ${guardadas.length ? guardadas.map(l => `<button type="button" class="chip-op" data-usar-lista="${l.id}">＋ ${esc(l.nombre)}</button>`).join('') : ''}
          </div>` : ''}
        </section>

        ${recomendacionesHTML(v, puede)}
      </div>`;
    enlazar(v, cont);
  }

  /* ---------------------------------------------------------
     Recomendadas para este viaje: salen del destino y de lo que
     cargaste (vuelos, auto, exterior…). Las marcás como listas
     o "no aplica" y se guardan resueltas.
     --------------------------------------------------------- */
  function recomendaciones(v) {
    const r = [];
    const sumar = (id, texto, detalle, link) => r.push({ id, texto, detalle: detalle || '', link: link || '' });
    const req = R.requisitos ? R.requisitos.analizar(v) : { internacional: false, tramites: [], aVerificar: [], fiebreAmarilla: [] };
    const ayuda = `#viaje/${v.id}/ayuda`;
    const destinos = (v.destinos || []).filter(d => d.nombre && !d.soloDia).map(d => d.nombre);
    const tieneSeguro = !!(((v.emergencias || {}).seguro || {}).compania || (((v.tareas || {}).p_seguro || {}).datos || {}).compania);
    // Del destino: documentación y salud
    if (req.internacional) {
      req.tramites.forEach(t => sumar('req_tramite_' + (t.codigo || t.pais), `Tramitar ${t.tramite || 'la visa de ' + t.pais}`, t.nota, ayuda));
      if (req.necesitaPasaporte) sumar('req_pasaporte', 'Revisar que el pasaporte esté vigente', 'Muchos países piden de 3 a 6 meses de vigencia después de volver.', ayuda);
      else sumar('req_dni', 'Revisar que el DNI esté vigente y en buen estado', 'Para este destino alcanza con el DNI.', ayuda);
      req.aVerificar.forEach(t => sumar('req_ver_' + (t.codigo || t.pais), `Confirmar los requisitos de entrada a ${t.pais}`, '', ayuda));
      if (!tieneSeguro) sumar('int_seguro', 'Contratar un seguro de viaje con cobertura en el exterior', 'En algunos países es obligatorio para entrar.');
      sumar('int_banco', 'Habilitar la tarjeta para usarla en el exterior', 'Desde la app o llamando al banco.');
      sumar('int_moneda', 'Prever cómo vas a pagar allá', 'Efectivo en moneda local, tarjeta o billetera virtual.');
      sumar('int_datos', 'Resolver internet en el celular', 'Roaming, chip local o eSIM.');
    } else if (!tieneSeguro) sumar('seguro', 'Revisar si necesitás seguro de viaje', 'Algunas tarjetas de crédito lo incluyen.');
    (req.fiebreAmarilla || []).forEach(x => sumar('req_fa_' + x.lugar, `Vacuna contra la fiebre amarilla (${x.lugar})`, 'Se aplica al menos 10 días antes de viajar.', ayuda));
    if (req.dengue) sumar('req_dengue', 'Llevar repelente', 'El destino tiene zonas con dengue.', ayuda);
    // De lo que cargaste
    const items = A().items(v).filter(it => it.fecha);
    items.filter(it => it.tipo === 'vuelo').forEach(it => {
      const c = A().checkin(it);
      sumar('vuelo_checkin_' + it.id, `Hacer el check-in del vuelo ${[it.empresa, it.numero].filter(Boolean).join(' ') || it.titulo}`, c ? `Se habilita el ${U.fmtFecha(c.fecha, 'dia')} a las ${c.hora}.` : 'Se hace online, en general entre 24 y 72 horas antes.');
    });
    if (items.some(it => it.tipo === 'vuelo')) sumar('vuelo_equipaje', 'Revisar qué equipaje incluye el pasaje', 'Medidas y peso de la valija y del bolso de mano.');
    if (items.some(it => it.tipo === 'auto')) {
      sumar('auto_revisar', 'Revisar el auto antes de salir', 'Aceite, agua, cubiertas (y la de auxilio), luces.');
      sumar('auto_papeles', 'Llevar los papeles del auto', 'Cédula, seguro al día, VTV y licencia de conducir.');
    }
    // Cancelación gratis: aparece con la fecha límite (si cambian los planes, cancelá antes)
    const hoy = U.hoyISO();
    (v.alojamientos || []).filter(a => a.cancelaHasta && a.cancelaHasta >= hoy).concat(A().items(v).filter(it => it.cancelaHasta && it.cancelaHasta >= hoy))
      .sort((a, b) => a.cancelaHasta.localeCompare(b.cancelaHasta))
      .forEach(x => {
        const d = U.diasEntre(hoy, x.cancelaHasta);
        r.push({ id: 'cancela_' + x.id + '_' + x.cancelaHasta, texto: `Cancelación gratis de ${x.titulo || A().nombreAlojamiento(x)}: hasta el ${U.fmtFecha(x.cancelaHasta, 'dia')}`, detalle: d <= 7 ? `⏰ Vence ${d === 0 ? 'hoy' : d === 1 ? 'mañana' : `en ${d} días`}. Si cambian los planes, cancelá antes.` : 'Si cambian los planes, cancelá antes de esa fecha.', urgente: d <= 7 });
      });
    // Pagos pendientes de reservas (seña pagada, falta el resto)
    const desde = U.sumarDias(hoy, -30);
    (v.alojamientos || []).filter(a => a.pagarHasta && a.pagarHasta >= desde).concat(A().items(v).filter(it => it.pagarHasta && it.pagarHasta >= desde))
      .sort((a, b) => a.pagarHasta.localeCompare(b.pagarHasta))
      .forEach(x => {
        const d = U.diasEntre(hoy, x.pagarHasta);
        const que = x.titulo || A().nombreAlojamiento(x);
        r.push({ id: 'pago_' + x.id + '_' + x.pagarHasta, texto: `Pagar ${x.pagarMonto ? x.pagarMonto + ' de ' : 'lo que falta de '}${que}: antes del ${U.fmtFecha(x.pagarHasta, 'dia')}`,
          detalle: d < 0 ? '⚠️ Ya pasó la fecha: fijate si quedó pago.' : d <= 7 ? `⏰ Vence ${d === 0 ? 'hoy' : d === 1 ? 'mañana' : `en ${d} días`}.` : 'Tildalo cuando lo pagues.', urgente: d <= 7 });
      });
    if ((v.alojamientos || []).length) sumar('aloj_horario', 'Confirmar el horario de entrada con el alojamiento', 'Sobre todo si llegás temprano o muy tarde.');
    if (destinos.length) sumar('mapas', `Descargar el mapa sin conexión de ${destinos.join(', ')}`, 'En Google Maps: tu foto → Mapas sin conexión.');
    return r;
  }
  function estadoRecos(v) { return v.recos || {}; }
  /** Las recomendaciones sin resolver. */
  function recosPendientes(v) { const e = estadoRecos(v); return recomendaciones(v).filter(x => !e[x.id]); }

  let verResueltas = false;
  function recomendacionesHTML(v, puede) {
    const todas = recomendaciones(v);
    if (!todas.length) return '';
    const e = estadoRecos(v);
    const pend = todas.filter(x => !e[x.id]);
    const res = todas.filter(x => e[x.id]);
    const fila = x => `
      <div class="reco ${e[x.id] ? 'reco-' + e[x.id] : ''} ${x.urgente && !e[x.id] ? 'reco-urgente' : ''}">
        <div class="reco-texto"><strong>${esc(x.texto)}</strong>${x.detalle ? `<small>${esc(x.detalle)}</small>` : ''}${x.link ? `<a href="${x.link}" class="reco-link">Ver requisitos →</a>` : ''}</div>
        ${puede ? (e[x.id]
          ? `<button type="button" class="btn-texto-mini" data-reco="${x.id}" data-valor="">${e[x.id] === 'hecho' ? '✓ Listo' : '✕ No aplica'} · deshacer</button>`
          : `<div class="reco-acc"><button type="button" class="btn btn-suave btn-chico" data-reco="${x.id}" data-valor="hecho">✓ Listo</button><button type="button" class="btn btn-texto btn-chico" data-reco="${x.id}" data-valor="no">No aplica</button></div>`) : ''}
      </div>`;
    return `
      <section class="bloque pend2-bloque">
        <div class="pend2-cab"><h2 class="titulo-seccion">Recomendadas para este viaje</h2><span class="texto-suave">${res.length} de ${todas.length}</span></div>
        <p class="texto-suave pend2-ayuda">Según el destino y lo que cargaste. Marcalas como listas o sacalas si no aplican.</p>
        ${pend.length ? `<div class="recos">${pend.map(fila).join('')}</div>` : '<p class="texto-suave pend2-vacio">¡Todo resuelto! 🎉</p>'}
        ${res.length ? `<button type="button" class="btn-texto-mini" data-a="resueltas">${verResueltas ? 'Ocultar' : 'Ver'} las resueltas (${res.length})</button>
          ${verResueltas ? `<div class="recos recos-resueltas">${res.map(fila).join('')}</div>` : ''}` : ''}
      </section>`;
  }

  let filtroQuien = 'todos';
  function filaHTML(p, puede, v) {
    const c = cuando(p);
    const quien = p.quien && v ? (p.quien === R.db.yoEn(v) ? 'vos' : ((R.db.persona(p.quien) || {}).nombre || '')) : '';
    const vencido = p.fecha && !p.hecho && p.fecha < U.hoyISO();
    return `
      <div class="pend2-fila ${p.hecho ? 'hecho' : ''} ${vencido ? 'vencido' : ''}">
        <button type="button" class="pend2-check" data-tildar="${p.id}" aria-pressed="${!!p.hecho}" aria-label="${p.hecho ? 'Desmarcar' : 'Marcar como hecho'}" ${puede ? '' : 'disabled'}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>
        </button>
        <button type="button" class="pend2-texto" data-editar="${p.id}" ${puede ? '' : 'disabled'}>
          <span>${esc(p.texto)}</span>${c || quien ? `<small>${esc([c, quien ? '👤 ' + quien : ''].filter(Boolean).join(' · '))}</small>` : ''}
        </button>
      </div>`;
  }

  function enlazar(v, cont) {
    const guardar = () => { R.db.guardarViaje(v); render(v, cont); if (R.recordatorios) R.recordatorios.actualizar(); };
    const fp = cont.querySelector('[data-form="pend"]');
    if (fp) fp.onsubmit = e => {
      e.preventDefault();
      const t = fp.querySelector('input').value.trim();
      if (!t) return;
      lista(v).push({ id: U.id('pe'), texto: t, hecho: false, fecha: '', creado: new Date().toISOString() });
      guardar();
      const i = cont.querySelector('#pTexto'); if (i) i.focus();
    };
    cont.querySelectorAll('[data-tildar]').forEach(b => b.onclick = () => {
      const p = lista(v).find(x => x.id === b.dataset.tildar);
      if (!p) return;
      p.hecho = !p.hecho;
      guardar();
    });
    cont.querySelectorAll('[data-editar]').forEach(b => b.onclick = () => editar(v, b.dataset.editar, () => render(v, cont)));
    const bh = cont.querySelector('[data-a="hechos"]');
    if (bh) bh.onclick = () => { verHechos = !verHechos; render(v, cont); };
    cont.querySelectorAll('[data-reco]').forEach(b => b.onclick = () => {
      v.recos = Object.assign({}, v.recos);
      if (b.dataset.valor) v.recos[b.dataset.reco] = b.dataset.valor; else delete v.recos[b.dataset.reco];
      R.db.guardarViaje(v); render(v, cont);
    });
    cont.querySelectorAll('[data-quien]').forEach(b => b.onclick = () => { filtroQuien = b.dataset.quien; render(v, cont); });
    const br = cont.querySelector('[data-a="resueltas"]');
    if (br) br.onclick = () => { verResueltas = !verResueltas; render(v, cont); };
    cont.querySelectorAll('[data-usar-lista]').forEach(b => b.onclick = () => {
      const l = listasGuardadas().find(x => x.id === b.dataset.usarLista);
      if (!l) return;
      const ya = new Set(lista(v).map(p => p.texto.toLowerCase()));
      const nuevos = (l.items || []).filter(t => !ya.has(String(t).toLowerCase()));
      nuevos.forEach(t => lista(v).push({ id: U.id('pe'), texto: t, hecho: false, fecha: '', creado: new Date().toISOString() }));
      guardar();
      U.toast(nuevos.length ? `Sumé ${U.plural(nuevos.length, 'pendiente', 'pendientes')} de "${l.nombre}".` : 'Ya los tenías todos.');
    });
  }

  function editar(v, id, alTerminar) {
    const p = lista(v).find(x => x.id === id);
    if (!p) return;
    const { el } = U.modal({
      titulo: 'Pendiente',
      cuerpo: `
        <label class="campo"><span>Qué</span><input id="peTexto" value="${esc(p.texto)}"></label>
        <label class="campo"><span>Para cuándo <small>(opcional)</small></span><input type="date" id="peFecha" value="${esc(p.fecha || '')}"></label>
        <label class="check"><input type="checkbox" id="peAviso" ${p.aviso ? 'checked' : ''}> Avisame ese día al celular</label>
        ${(v.participantes || []).length > 1 ? `<label class="campo"><span>¿Quién se ocupa? <small>(opcional)</small></span><select id="peQuien"><option value="">Nadie en particular</option>${v.participantes.map(id => `<option value="${id}" ${p.quien === id ? 'selected' : ''}>${esc(id === R.db.yoEn(v) ? 'Yo' : ((R.db.persona(id) || {}).nombre || 'Viajero'))}</option>`).join('')}</select></label>` : ''}`,
      acciones: [
        { texto: 'Borrar', clase: 'btn-texto peligro', onClick: () => { v.pendientes = lista(v).filter(x => x.id !== id); R.db.guardarViaje(v); alTerminar(); } },
        { texto: 'Cancelar' },
        { texto: 'Guardar', clase: 'btn-primario', onClick: f => {
          const t = f.querySelector('#peTexto').value.trim();
          if (!t) { U.toast('Escribí el pendiente.'); return false; }
          p.texto = t; p.fecha = f.querySelector('#peFecha').value; p.aviso = !!(p.fecha && f.querySelector('#peAviso').checked);
          const q = f.querySelector('#peQuien');
          if (q) p.quien = q.value;
          R.db.guardarViaje(v);
          if (R.recordatorios) R.recordatorios.actualizar();
          alTerminar();
        } }
      ]
    });
    const fe = el.querySelector('#peFecha'), av = el.querySelector('#peAviso');
    const sync = () => { av.disabled = !fe.value; if (!fe.value) av.checked = false; };
    fe.addEventListener('change', sync); sync();
  }

  /** Para "Cargar" y otros lugares: sumar un pendiente o una idea rápido. */
  function sumar(v, texto) { lista(v).push({ id: U.id('pe'), texto, hecho: false, fecha: '', creado: new Date().toISOString() }); }

  return { render, faltan, sumar, SUGERENCIAS, listasGuardadas, recomendaciones, recosPendientes };
})();
