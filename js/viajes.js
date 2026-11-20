/* =========================================================
   Rutenda — viajes
   Crear un viaje: a dónde, cuándo y con quién. Nada más.
   Adentro del viaje, cuatro pestañas: Itinerario, Pendientes,
   Gastos y Valija. Lo demás (viajeros, archivos, PDF, links,
   ruta) está en el menú ⋯.
   ========================================================= */
window.R = window.R || {};

R.viajes = (function () {
  const U = R.util;
  const { esc } = U;

  const PESTANAS = [
    { id: 'itinerario', nombre: 'Itinerario', icono: '🗓️' },
    { id: 'pendientes', nombre: 'Pendientes', icono: '✅' },
    { id: 'gastos', nombre: 'Gastos', icono: '💸' },
    { id: 'valija', nombre: 'Valija', icono: '🧳' },
    { id: 'ayuda', nombre: 'Ayuda', icono: '🆘' }
  ];
  // Se abren desde el menú ⋯ o desde la portada
  const OTRAS = { documentos: 'Archivos', viajeros: 'Viajeros' };

  /* ---------- Datos del viaje ---------- */
  const lugares = v => (v.destinos || []).filter(d => d.nombre && !d.soloDia && !d.paso);
  const todos = v => (v.destinos || []).filter(d => d.nombre);
  function nombreDe(v) { return v.nombre || (lugares(v).length ? lugares(v) : todos(v)).map(d => d.nombre).join(' → ') || v.destino || 'Viaje'; }
  function destinoCompleto(v) {
    const l = lugares(v);
    if (l.length > 1) return l.map(d => d.nombre).join(' → ');
    if (l.length === 1) return l[0].pais ? `${l[0].nombre}, ${l[0].pais}` : l[0].nombre;
    return todos(v).map(d => d.nombre).join(' → ') || v.destino || '';
  }

  function estadoViaje(v) {
    const hoy = U.hoyISO();
    if (v.finalizado) return 'pasado';   // "Ya llegué": lo terminaste antes de que termine el día
    if (v.fechaFin && v.fechaFin < hoy) return 'pasado';
    if (v.fechaInicio && v.fechaInicio <= hoy) return 'en_curso';
    return 'planificando';
  }

  function cuentaRegresiva(v) {
    const hoy = U.hoyISO();
    const est = estadoViaje(v);
    if (!v.fechaInicio) return 'Fechas a definir';
    if (est === 'pasado') {
      const d = U.diasEntre(v.fechaFin || v.fechaInicio, hoy);
      return d <= 0 ? 'Volviste hoy' : `Viaje realizado · hace ${U.plural(d, 'día', 'días')}`;
    }
    if (est === 'en_curso') {
      const dia = U.diasEntre(v.fechaInicio, hoy) + 1;
      const total = v.fechaFin ? U.diasEntre(v.fechaInicio, v.fechaFin) + 1 : null;
      return total ? `Día ${dia} de ${total}` : `Día ${dia} de viaje`;
    }
    const faltan = U.diasEntre(hoy, v.fechaInicio);
    if (faltan === 0) return '¡Es hoy!';
    if (faltan === 1) return '¡Salís mañana!';
    return `Faltan ${faltan} días`;
  }

  /** La ciudad desde donde salís siempre: la última que usaste (se puede cambiar). */
  function ciudadDeSiempre() {
    const pref = R.db.prefs().ciudadOrigen;
    if (pref && pref.nombre) return Object.assign({}, pref);
    const ultimo = R.db.viajes().filter(v => v.origen && v.origen.nombre).sort((a, b) => String(b.creado || '').localeCompare(String(a.creado || '')))[0];
    return ultimo && ultimo.origen && ultimo.origen.nombre ? Object.assign({}, ultimo.origen) : { nombre: '' };
  }

  /* ---------- Crear o editar: páginas de js/armar.js ---------- */
  function nuevo(opciones) { R.armar.nuevo(opciones); }
  function editar(v) { location.hash = `#armar/${v.id}/datos`; }

  /* ---------------------------------------------------------
     "Ya llegué" y menú del viaje
     --------------------------------------------------------- */
  async function finalizar(v) {
    const ok = await U.confirmar('Damos el viaje por terminado. Los gastos, las cuentas y todo lo que cargaste siguen ahí.', { titulo: '🏠 ¿Ya llegaste?', textoSi: 'Sí, terminar el viaje', textoNo: 'Todavía no' });
    if (!ok) return;
    v.finalizado = U.hoyISO();
    R.db.guardarViaje(v);
    location.hash = '#inicio';
    R.app.refrescar();
    U.toast('¡Bienvenido a casa! 🏠');
  }

  function menuViaje(v) {
    const org = R.db.puedeOrganizar(v);
    const est = estadoViaje(v);
    const ops = [];
    if (org) ops.push(['editar', '✏️', 'Editar el viaje', 'Destinos, fechas, transporte y dónde dormís']);
    ops.push(['viajeros', '👥', 'Viajeros', 'Invitar a quienes viajan con vos']);
    ops.push(['documentos', '📁', 'Archivos', 'Pasajes, vouchers y documentos']);
    ops.push(['ruta', '🗺️', 'Ver la ruta en Google Maps', '']);
    ops.push(['mapa', '📍', 'Mapa del viaje', '']);
    ops.push(['pdf', '📄', 'Itinerario en PDF', 'Para imprimir o mandar']);
    if (R.calendario) ops.push(['calendario', '📅', 'Pasar al calendario del celular', 'Google Calendar, iPhone u Outlook']);
    if (R.familia && R.db.modo() === 'nube') ops.push(['familia', '🔗', 'Link del itinerario', v.linkFamilia && v.linkFamilia.activo ? 'Activo · solo los días, sin gastos ni pendientes' : 'Para tu familia o quien viaja sin la app']);
    if (R.linkCuentas && R.db.modo() === 'nube' && (v.participantes || []).length > 1) ops.push(['linkCuentas', '🔗', 'Link de cuentas para el grupo', v.linkCuentas && v.linkCuentas.activo ? 'Activo' : '']);
    if (v.fechaInicio) ops.push(['resumen', '🖼️', 'Resumen para compartir', '']);
    if (org && est === 'en_curso') ops.push(['finalizar', '🏠', 'Ya llegué: terminar el viaje', '']);
    if (org && v.finalizado && (!v.fechaFin || v.fechaFin >= U.hoyISO())) ops.push(['reabrir', '↩️', 'Seguir el viaje', 'Todavía no terminó']);
    if (R.db.esDueno(v)) ops.push(['eliminar', '🗑', 'Eliminar viaje', '']);
    const { el } = U.modal({
      titulo: nombreDe(v),
      cuerpo: `<div class="menu-acciones">${ops.map(([id, ic, t, sub]) => `<button type="button" class="menu-op menu-op-dato ${id === 'eliminar' ? 'peligro' : ''}" data-op="${id}"><span>${ic}</span><span class="mo-texto"><strong>${esc(t)}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}</span></button>`).join('')}</div>`
    });
    el.querySelectorAll('[data-op]').forEach(bt => bt.onclick = async () => {
      const op = bt.dataset.op;
      U.cerrarModal();
      if (op === 'editar') editar(v);
      else if (op === 'viajeros' || op === 'documentos') location.hash = `#viaje/${v.id}/${op}`;
      else if (op === 'transporte' || op === 'noches') location.hash = `#armar/${v.id}/${op}`;
      else if (op === 'ruta') R.gmaps.abrirRutaViaje(v);
      else if (op === 'mapa') { const { el: m } = U.modal({ titulo: 'Mapa del viaje', ancho: true, cuerpo: '<div id="mapaViaje" class="mapa-viaje"></div>' }); R.mapa.mostrar(m.querySelector('#mapaViaje'), v); }
      else if (op === 'pdf') R.itinerarioPdf.descargar(v);
      else if (op === 'calendario') R.calendario.descargar(v);
      else if (op === 'familia') R.familia.abrir(v);
      else if (op === 'linkCuentas') R.linkCuentas.abrir(v);
      else if (op === 'resumen') R.resumen.abrir(v);
      else if (op === 'finalizar') finalizar(v);
      else if (op === 'reabrir') { delete v.finalizado; R.db.guardarViaje(v); R.app.refrescar(); U.toast('Listo, el viaje sigue en curso.'); }
      else if (op === 'eliminar') {
        const ok = await U.confirmar(`Se borra "${nombreDe(v)}" con su itinerario, archivos y gastos. No se puede deshacer.`, { titulo: 'Eliminar viaje', textoSi: 'Eliminar', peligro: true });
        if (!ok) return;
        await R.db.eliminarViaje(v.id);
        location.hash = '#inicio';
        U.toast('Viaje eliminado.');
      }
    });
  }

  /* ---------------------------------------------------------
     Pantalla del viaje
     --------------------------------------------------------- */
  function renderViaje(app, v, pestana) {
    if (!pestana || !(PESTANAS.some(p => p.id === pestana) || OTRAS[pestana])) pestana = 'itinerario';
    const personas = v.participantes.map(id => R.db.persona(id)).filter(Boolean);
    const org = R.db.puedeOrganizar(v);
    const req = R.requisitos ? R.requisitos.resumen(v) : null;
    const faltan = (R.pendientes ? R.pendientes.faltan(v) : 0) + (R.armar ? R.armar.cuantasFaltan(v) : 0) + (req && req.partes.length ? 1 : 0);
    app.innerHTML = `
      <section class="portada-viaje portada-compacta" style="background:${R.paisaje.fondo(v)}">
        ${U.paisaje(v)}
        <button class="btn-menu-viaje" data-a="menu" aria-label="Opciones del viaje">⋯</button>
        <div class="portada-contenido">
          <h1 ${org ? 'class="editable" data-a="editar" title="Editar el viaje"' : ''}>${esc(nombreDe(v))}</h1>
          <p class="portada-meta"><span ${org ? 'class="editable" data-a="editar"' : ''}>${esc(v.fechaInicio ? U.fmtRango(v.fechaInicio, v.fechaFin) : 'Sin fechas')}${duracion(v) ? ' · ' + esc(duracion(v)) : ''}</span> · <strong>${esc(cuentaRegresiva(v))}</strong></p>
          <a class="portada-avatares" href="#viaje/${v.id}/viajeros" title="Viajeros">${personas.map(p => U.avatar(p, 28)).join('')}<span class="pa-mas">${personas.length > 1 ? personas.length + ' viajeros' : '+ Viajeros'}</span></a>
        </div>
      </section>
      ${OTRAS[pestana] ? `<div class="sub-vista-cab"><a href="#viaje/${v.id}/itinerario" class="btn btn-texto btn-chico">← ${esc(nombreDe(v))}</a><h2 class="titulo-seccion">${OTRAS[pestana]}</h2></div>` : `
      <nav class="pestanas pestanas-4" role="tablist">
        ${PESTANAS.map(p => `<a role="tab" aria-selected="${p.id === pestana}" href="#viaje/${v.id}/${p.id}" class="pestana ${p.id === pestana ? 'activa' : ''}"><span>${p.icono}</span>${p.nombre}${p.id === 'pendientes' && faltan ? `<em class="pestana-num">${faltan}</em>` : ''}</a>`).join('')}
      </nav>`}
      <section class="contenido-pestana" id="contPestana"></section>`;

    app.querySelector('[data-a="menu"]').onclick = () => menuViaje(v);
    app.querySelectorAll('[data-a="editar"]').forEach(x => x.onclick = () => editar(v));
    app.classList.toggle('rol-viajero', !org);
    const cont = app.querySelector('#contPestana');
    if (pestana === 'itinerario') R.itinerario.render(v, cont);
    else if (pestana === 'pendientes') R.pendientes.render(v, cont);
    else if (pestana === 'gastos') R.gastos.render(v, cont);
    else if (pestana === 'valija') R.valija.render(v, cont);
    else if (pestana === 'documentos') R.documentos.render(v, cont);
    else if (pestana === 'ayuda') R.ayuda.render(v, cont);
    else if (pestana === 'viajeros') R.participantes.renderViajeros(v, cont);
  }

  /** "Te salió $ 350.000" (tu parte; si viajás solo, el total). */
  function costoTexto(v) {
    if (!R.gastos || !(v.movimientos || []).some(m => m.tipo === 'gasto')) return '';
    const yo = R.db.yoEn(v);
    const mio = v.participantes.length > 1 ? R.gastos.parteDe(v, yo) : R.gastos.totales(v).neto;
    if (mio <= 0) return '';
    return `${estadoViaje(v) === 'pasado' ? 'Te salió' : 'Te va saliendo'} ${U.fmtMoneda(mio, v.monedaBase)}`;
  }

  /** "5 días · 4 noches" */
  function duracion(v) {
    if (!v.fechaInicio) return '';
    const d = U.diasEntre(v.fechaInicio, v.fechaFin || v.fechaInicio) + 1;
    return d === 1 ? 'Ida y vuelta en el día' : `${U.plural(d, 'día', 'días')} · ${U.plural(d - 1, 'noche', 'noches')}`;
  }

  /**
   * Cuánto está armado el viaje: transporte, noches, pendientes (los tuyos y los recomendados) y valija.
   * { pct, partes: [{ icono, nombre, hechos, total }] }
   */
  function progreso(v) {
    const partes = [];
    const sumar = (icono, nombre, hechos, total) => { if (total > 0) partes.push({ icono, nombre, hechos, total }); };
    if (R.armar && v.armado) {
      const tr = R.armar.itemsDeTramos(v);
      sumar('🚌', 'Transporte', tr.filter(x => R.armar.tramoResuelto(x.it)).length, tr.length);
      const ns = R.armar.noches(v);
      sumar('🛏️', 'Noches', ns.length - R.armar.faltanNoches(v), ns.length);
    }
    const pend = v.pendientes || [];
    const recos = R.pendientes ? R.pendientes.recomendaciones(v) : [];
    const recosOk = recos.filter(x => (v.recos || {})[x.id]).length;
    sumar('✅', 'Pendientes', pend.filter(p => p.hecho).length + recosOk, pend.length + recos.length);
    const val = R.valija ? R.valija.progreso(v) : { hechos: 0, total: 0 };
    sumar('🧳', 'Valija', val.hechos, val.total);
    const pct = partes.length ? Math.round(100 * partes.reduce((a, p) => a + p.hechos / p.total, 0) / partes.length) : 0;
    return { pct, partes };
  }
  function progresoHTML(v, clase) {
    const p = progreso(v);
    if (!p.partes.length) return '';
    return `
      <div class="avance ${clase || ''}">
        <div class="avance-cab"><span>${p.pct === 100 ? '¡Todo listo!' : 'Armado'}</span><strong>${p.pct}%</strong></div>
        <div class="barra-progreso"><span style="width:${p.pct}%"></span></div>
        <div class="avance-partes">${p.partes.map(x => `<span class="${x.hechos === x.total ? 'ok' : ''}">${x.icono} ${x.hechos}/${x.total}</span>`).join('')}</div>
      </div>`;
  }

  /* ---------- Tarjeta (Mis viajes) ---------- */
  function tarjeta(v) {
    const personas = v.participantes.map(id => R.db.persona(id)).filter(Boolean);
    return `
      <a class="tarjeta-viaje" href="#viaje/${v.id}">
        <div class="tv-portada" style="background:${R.paisaje.fondo(v)}">
          ${U.paisaje(v)}
          <span class="tv-cuenta">${esc(cuentaRegresiva(v))}</span>
          <h3>${esc(nombreDe(v))}</h3>
        </div>
        <div class="tv-cuerpo">
          <p class="tv-meta">${esc(destinoCompleto(v))}</p>
          <p class="tv-meta">${esc(v.fechaInicio ? U.fmtRango(v.fechaInicio, v.fechaFin) : 'Sin fechas')}${duracion(v) ? ' · ' + esc(duracion(v)) : ''}</p>
          ${costoTexto(v) ? `<p class="tv-meta tv-costo">💸 ${esc(costoTexto(v))}</p>` : ''}
          ${estadoViaje(v) !== 'pasado' ? progresoHTML(v, 'avance-chico') : ''}
          <div class="tv-pie"><span class="avatares">${personas.map(p => U.avatar(p, 24)).join('')}</span></div>
        </div>
      </a>`;
  }

  return {
    PESTANAS, nombreDe, destinoCompleto, estadoViaje, cuentaRegresiva, ciudadDeSiempre,
    costoTexto, duracion, progreso, progresoHTML, nuevo, editar, abrirAsistente: (v, op) => (v ? editar(v) : nuevo(op)), finalizar, menuViaje, renderViaje, tarjeta
  };
})();
