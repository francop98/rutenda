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
  const normal = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

  const PESTANAS = [
    { id: 'itinerario', nombre: 'Itinerario', icono: '🗓️' },
    { id: 'pendientes', nombre: 'Pendientes', icono: '✅' },
    { id: 'gastos', nombre: 'Gastos', icono: '💸' },
    { id: 'valija', nombre: 'Valija', icono: '🧳' }
  ];
  // Se abren desde el menú ⋯ o desde la portada
  const OTRAS = { documentos: 'Archivos', viajeros: 'Viajeros' };

  /* ---------- Datos del viaje ---------- */
  const lugares = v => (v.destinos || []).filter(d => d.nombre && !d.soloDia);
  function nombreDe(v) { return v.nombre || lugares(v).map(d => d.nombre).join(' → ') || v.destino || 'Viaje'; }
  function destinoCompleto(v) {
    const l = lugares(v);
    if (l.length > 1) return l.map(d => d.nombre).join(' → ');
    if (l.length === 1) return l[0].pais ? `${l[0].nombre}, ${l[0].pais}` : l[0].nombre;
    return v.destino || '';
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
    const ultimo = R.db.viajes().slice().sort((a, b) => String(b.creado || '').localeCompare(String(a.creado || '')))[0];
    return ultimo && ultimo.origen && ultimo.origen.nombre ? Object.assign({}, ultimo.origen) : { nombre: '' };
  }

  /* ---------------------------------------------------------
     Crear o editar un viaje (un solo cartel, tres datos)
     --------------------------------------------------------- */
  function nuevo(opciones) { abrirFormulario(null, opciones || {}); }
  function editar(v) { abrirFormulario(v, {}); }

  function abrirFormulario(existente, op) {
    const editando = !!existente;
    const yo = R.db.yo();
    const b = {
      nombre: editando ? existente.nombre || '' : '',
      origen: editando && existente.origen && existente.origen.nombre ? Object.assign({}, existente.origen) : ciudadDeSiempre(),
      destinos: editando ? lugares(existente).map(d => Object.assign({}, d)) : [],
      fechaInicio: editando ? existente.fechaInicio || '' : (op.fechas && op.fechas.desde) || '',
      fechaFin: editando ? existente.fechaFin || '' : (op.fechas && op.fechas.hasta) || '',
      monedaBase: editando ? existente.monedaBase : (R.db.prefs().monedaBase || 'ARS'),
      viajeros: editando
        ? existente.participantes.filter(p => p !== R.db.yoEn(existente)).map(id => ({ id, nombre: (R.db.persona(id) || {}).nombre || 'Viajero' }))
        : []
    };
    if (!b.destinos.length) b.destinos.push({ id: U.id('dst'), nombre: '' });
    const campos = [];
    let campoOrigen = null;

    const { el } = U.modal({
      titulo: editando ? 'Editar el viaje' : 'Nuevo viaje',
      subtitulo: editando ? '' : 'Tres datos y listo. Lo demás lo sumás cuando quieras.',
      cuerpo: '<div class="form-viaje"></div>',
      acciones: [
        { texto: 'Cancelar' },
        { texto: editando ? 'Guardar' : 'Crear viaje', clase: 'btn-primario', onClick: () => guardar() }
      ]
    });
    const caja = el.querySelector('.form-viaje');

    function leer() {
      campos.forEach((c, i) => { if (b.destinos[i]) Object.assign(b.destinos[i], c.obtener(), { id: b.destinos[i].id }); });
      if (campoOrigen) b.origen = campoOrigen.obtener();
      const q = s => caja.querySelector(s);
      if (q('#fvIda')) b.fechaInicio = q('#fvIda').value;
      if (q('#fvVuelta')) b.fechaFin = q('#fvVuelta').value;
      if (q('#fvNombre')) b.nombre = q('#fvNombre').value.trim();
      if (q('#fvMoneda')) b.monedaBase = q('#fvMoneda').value;
    }

    function pintar() {
      const conocidos = R.db.personas().filter(p => !p.esYo && !b.viajeros.some(x => normal(x.nombre) === normal(p.nombre)));
      caja.innerHTML = `
        <div class="campo"><span>¿A dónde vas?</span>
          <div class="fv-destinos">${b.destinos.map((d, i) => `
            <div class="fv-destino"><div data-lugar="${i}"></div>${b.destinos.length > 1 ? `<button type="button" class="btn-icono" data-quitar-destino="${i}" aria-label="Quitar">×</button>` : ''}</div>`).join('')}
          </div>
          <button type="button" class="btn-texto-mini" data-a="otroDestino">+ Otro lugar</button>
        </div>
        <div class="grilla-2">
          <label class="campo"><span>Salís</span><input type="date" id="fvIda" value="${esc(b.fechaInicio)}"></label>
          <label class="campo"><span>Volvés</span><input type="date" id="fvVuelta" value="${esc(b.fechaFin)}" ${b.fechaInicio ? `min="${b.fechaInicio}"` : ''}></label>
        </div>
        <p class="ayuda" id="fvDias">${esc(textoDias())}</p>
        <div class="campo"><span>¿Quiénes van?</span>
          <div class="fv-viajeros">
            <span class="chip-persona">${U.avatar(yo, 26)} ${esc(yo.nombre)} <small>(vos)</small></span>
            ${b.viajeros.map((p, i) => `<span class="chip-persona">${U.avatar({ id: p.id || p.nombre, nombre: p.nombre }, 26)} ${esc(p.nombre)} <button type="button" data-quitar-viajero="${i}" aria-label="Quitar">×</button></span>`).join('')}
          </div>
          <form class="fila-agregar" data-form="viajero"><input id="fvPersona" placeholder="Nombre de quien viaja con vos" list="fvConocidos" autocomplete="off"><button type="submit" class="btn btn-suave">Sumar</button></form>
          <datalist id="fvConocidos">${conocidos.map(p => `<option value="${esc(p.nombre)}">`).join('')}</datalist>
        </div>
        <details class="mas-datos" ${editando ? 'open' : ''}>
          <summary>Más datos <small>(opcional)</small></summary>
          <label class="campo"><span>Nombre del viaje</span><input id="fvNombre" value="${esc(b.nombre)}" placeholder="${esc(b.destinos.filter(d => d.nombre).map(d => d.nombre).join(' → ') || 'Ej: Vacaciones de verano')}" maxlength="60"></label>
          <div class="campo"><span>Salís desde</span><div id="fvOrigen"></div></div>
          <label class="campo"><span>Moneda de los gastos</span><select id="fvMoneda">${U.opcionesMoneda(b.monedaBase)}</select></label>
        </details>`;
      campos.length = 0;
      const usadas = R.lugares.recientes();
      caja.querySelectorAll('[data-lugar]').forEach(c => {
        const i = Number(c.dataset.lugar);
        campos[i] = R.lugares.campo(c, { valor: b.destinos[i], placeholder: 'Ciudad o lugar', sugeridos: usadas });
      });
      campoOrigen = R.lugares.campo(caja.querySelector('#fvOrigen'), { valor: b.origen, placeholder: 'Tu ciudad', sugeridos: usadas });
      caja.querySelector('[data-a="otroDestino"]').onclick = () => { leer(); b.destinos.push({ id: U.id('dst'), nombre: '' }); pintar(); const ult = caja.querySelectorAll('.lugar-input'); if (ult.length > 1) ult[ult.length - 2].focus(); };
      caja.querySelectorAll('[data-quitar-destino]').forEach(x => x.onclick = () => { leer(); b.destinos.splice(Number(x.dataset.quitarDestino), 1); pintar(); });
      caja.querySelectorAll('[data-quitar-viajero]').forEach(x => x.onclick = () => { leer(); b.viajeros.splice(Number(x.dataset.quitarViajero), 1); pintar(); });
      const fp = caja.querySelector('[data-form="viajero"]');
      fp.onsubmit = e => {
        e.preventDefault();
        const nombre = fp.querySelector('input').value.trim();
        if (!nombre) return;
        leer();
        if (b.viajeros.some(p => normal(p.nombre) === normal(nombre))) { U.toast('Ya está.'); return; }
        const conocido = R.db.personas().find(p => !p.esYo && normal(p.nombre) === normal(nombre));
        b.viajeros.push(conocido ? { id: conocido.id, nombre: conocido.nombre } : { nombre });
        pintar();
        const i = caja.querySelector('#fvPersona'); if (i) i.focus();
      };
      const ida = caja.querySelector('#fvIda'), vuelta = caja.querySelector('#fvVuelta');
      ida.addEventListener('change', () => {
        leer();
        if (b.fechaFin && b.fechaFin < b.fechaInicio) { b.fechaFin = ''; vuelta.value = ''; }
        vuelta.min = b.fechaInicio;
        caja.querySelector('#fvDias').textContent = textoDias();
      });
      vuelta.addEventListener('change', () => { leer(); caja.querySelector('#fvDias').textContent = textoDias(); });
      if (!editando && !b.destinos[0].nombre) setTimeout(() => { const i = caja.querySelector('.lugar-input'); if (i) i.focus(); }, 80);
    }
    function textoDias() {
      if (!b.fechaInicio) return 'Si todavía no sabés las fechas, dejalas vacías.';
      if (!b.fechaFin) return 'Poné la vuelta y se arman los días.';
      const d = U.diasEntre(b.fechaInicio, b.fechaFin);
      return d === 0 ? 'Ida y vuelta en el día.' : `${U.plural(d + 1, 'día', 'días')} · ${U.plural(d, 'noche', 'noches')}`;
    }

    function viajeros(v) {
      const yoId = editando ? R.db.yoEn(existente) : R.db.yo().id;
      return [yoId].concat(b.viajeros.map(p => {
        if (p.id && R.db.persona(p.id)) return p.id;
        const conocido = R.db.personas().find(x => !x.esYo && normal(x.nombre) === normal(p.nombre));
        return conocido ? conocido.id : R.db.crearPersona(p.nombre).id;
      }));
    }

    function guardar() {
      leer();
      const destinos = b.destinos.filter(d => d.nombre);
      if (!destinos.length) { U.toast('¿A dónde vas? Escribí al menos un lugar.'); return false; }
      if (b.fechaFin && b.fechaInicio && b.fechaFin < b.fechaInicio) { U.toast('La vuelta tiene que ser después de la ida.'); return false; }
      if (b.fechaFin && !b.fechaInicio) { U.toast('Poné también la fecha de ida.'); return false; }
      const datos = { nombre: b.nombre, origen: b.origen, destinos, fechaInicio: b.fechaInicio, fechaFin: b.fechaFin || b.fechaInicio, monedaBase: b.monedaBase };
      if (b.origen && b.origen.nombre) R.db.guardarPrefs({ ciudadOrigen: Object.assign({}, b.origen) });
      if (editando) {
        const v = R.db.viaje(existente.id);
        // Los viejos (escapadas de un día) se conservan
        const extra = (v.destinos || []).filter(d => d.soloDia);
        let participantes = viajeros(v);
        const quitados = v.participantes.filter(p => !participantes.includes(p));
        const conGastos = quitados.filter(p => R.gastos.personaTieneMovimientos(v, p));
        if (conGastos.length) {
          U.toast(`${(R.db.persona(conGastos[0]) || {}).nombre || 'Alguien'} tiene gastos cargados: sigue en el viaje.`);
          participantes = participantes.concat(conGastos);
        }
        Object.assign(v, datos, { destinos: destinos.concat(extra), participantes });
        R.db.guardarViaje(v);
        R.app.refrescar();
        U.toast('Cambios guardados.');
        return true;
      }
      const v = Object.assign({
        id: U.id('via'), v2: 26, creado: new Date().toISOString(),
        agenda: [], alojamientos: [], pendientes: [], valijas: { comun: { items: [] } },
        tareas: {}, tareasPropias: [], itinerario: [], documentos: [], movimientos: [], cambios: []
      }, datos, { participantes: viajeros(null) });
      R.db.guardarViaje(v);
      location.hash = `#viaje/${v.id}/itinerario`;
      U.toast('¡Viaje creado! Ahora sumá qué hacés cada día. 🧭');
      return true;
    }

    pintar();
  }

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
    if (org) ops.push(['editar', '✏️', 'Editar el viaje', 'Lugares, fechas, quiénes van']);
    ops.push(['viajeros', '👥', 'Viajeros', 'Invitar a quienes viajan con vos']);
    ops.push(['documentos', '📁', 'Archivos', 'Pasajes, vouchers, documentos y emergencias']);
    ops.push(['ruta', '🗺️', 'Ver la ruta en Google Maps', '']);
    ops.push(['mapa', '📍', 'Mapa del viaje', '']);
    ops.push(['pdf', '📄', 'Itinerario en PDF', 'Para imprimir o mandar']);
    if (R.familia && R.db.modo() === 'nube') ops.push(['familia', '👪', 'Link para la familia', v.linkFamilia && v.linkFamilia.activo ? 'Activo' : 'Ven dónde estás cada día']);
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
      else if (op === 'ruta') R.gmaps.abrirRutaViaje(v);
      else if (op === 'mapa') { const { el: m } = U.modal({ titulo: 'Mapa del viaje', ancho: true, cuerpo: '<div id="mapaViaje" class="mapa-viaje"></div>' }); R.mapa.mostrar(m.querySelector('#mapaViaje'), v); }
      else if (op === 'pdf') R.itinerarioPdf.descargar(v);
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
    const faltan = R.pendientes ? R.pendientes.faltan(v) : 0;
    app.innerHTML = `
      <section class="portada-viaje portada-compacta" style="background:${R.paisaje.fondo(v)}">
        ${U.paisaje(v)}
        <button class="btn-menu-viaje" data-a="menu" aria-label="Opciones del viaje">⋯</button>
        <div class="portada-contenido">
          <h1 ${org ? 'class="editable" data-a="editar" title="Editar el viaje"' : ''}>${esc(nombreDe(v))}</h1>
          <p class="portada-meta"><span ${org ? 'class="editable" data-a="editar"' : ''}>${esc(v.fechaInicio ? U.fmtRango(v.fechaInicio, v.fechaFin) : 'Sin fechas')}</span> · <strong>${esc(cuentaRegresiva(v))}</strong></p>
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
    else if (pestana === 'viajeros') R.participantes.renderViajeros(v, cont);
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
          <p class="tv-meta">${esc(v.fechaInicio ? U.fmtRango(v.fechaInicio, v.fechaFin) : 'Sin fechas')}</p>
          <div class="tv-pie"><span class="avatares">${personas.map(p => U.avatar(p, 24)).join('')}</span></div>
        </div>
      </a>`;
  }

  return {
    PESTANAS, nombreDe, destinoCompleto, estadoViaje, cuentaRegresiva, ciudadDeSiempre,
    nuevo, editar, abrirAsistente: (v, op) => (v ? editar(v) : nuevo(op)), finalizar, menuViaje, renderViaje, tarjeta
  };
})();
