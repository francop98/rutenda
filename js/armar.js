/* =========================================================
   Rutenda — armar el viaje en tres páginas
   1. El viaje (obligatoria): nombre, de dónde salís, a dónde
      vas en orden (solo la ida), fechas y quiénes van.
   2. Transporte: cómo vas de un lugar a otro, tramo por tramo
      (la vuelta sale sola del recorrido).
   3. Noches: dónde dormís cada noche y el alojamiento.
   Las páginas 2 y 3 se pueden omitir: quedan como "para
   completar" en el itinerario y en pendientes.
   ========================================================= */
window.R = window.R || {};

R.armar = (function () {
  const U = R.util;
  const { esc } = U;
  const A = () => R.agenda;
  const normal = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

  const MEDIOS = [['avion', '✈️', 'Avión'], ['micro', '🚌', 'Micro'], ['auto', '🚗', 'Auto'], ['tren', '🚆', 'Tren'], ['barco', '⛴️', 'Barco'], ['taxi', '🚕', 'Taxi, remis o Uber'], ['transfer', '🚐', 'Transfer o excursión'], ['otro', '🧭', 'Otro']];
  const MEDIO_A_TIPO = { avion: 'vuelo', micro: 'micro', auto: 'auto', tren: 'tren', barco: 'barco', taxi: 'taxi', transfer: 'traslado', otro: 'otromedio' };
  const TIPO_A_MEDIO = { vuelo: 'avion', micro: 'micro', auto: 'auto', tren: 'tren', barco: 'barco', taxi: 'taxi', traslado: 'transfer', otromedio: 'otro' };

  /* ---------------------------------------------------------
     Recorrido: los tramos salen del orden de los destinos
     --------------------------------------------------------- */
  const destinosDe = v => (v.destinos || []).filter(d => d.nombre);
  function origenDe(v) { return Object.assign({ id: 'o', nombre: 'Tu ciudad' }, v.origen && v.origen.nombre ? v.origen : {}, { id: 'o' }); }

  /** Ida en orden; una escapada de un día va y vuelve al lugar anterior; al final, la vuelta a casa. */
  function tramos(v) {
    const o = origenDe(v);
    const r = [], cuenta = {};
    let prev = o;
    const sumar = (a, b, enElDia, vuelta) => {
      const k = `${a.id}>${b.id}`;
      cuenta[k] = (cuenta[k] || 0) + 1;
      r.push({ clave: `${k}#${cuenta[k]}`, desde: a, hasta: b, enElDia: !!enElDia, vuelta: !!vuelta || b.id === 'o' });
    };
    destinosDe(v).forEach(d => {
      if (d.soloDia) { sumar(prev, d, true); sumar(d, prev, true); } else { sumar(prev, d); prev = d; }
    });
    const vu = v.vuelta || {};
    if (prev !== o && !vu.soloIda) {
      const por = destinosDe(v).find(d => d.id === vu.por && !d.soloDia && d !== prev);
      if (por) { sumar(prev, por, false, true); sumar(por, o); } else sumar(prev, o);
    }
    return r;
  }

  /* ---------- La vuelta: directo o pasando por un lugar donde ya estuviste ---------- */
  const conNoche = ds => ds.filter(d => d.nombre && !d.soloDia);
  /** Si el primer destino queda mucho más cerca de tu casa que el último, seguramente volvés por ahí (conexión). */
  function vueltaSugerida(origen, ds) {
    const l = conNoche(ds);
    if (l.length < 2 || !origen || origen.lat == null) return '';
    const primero = l[0], ultimo = l[l.length - 1];
    if (primero.lat == null || ultimo.lat == null || !R.resumen) return '';
    const d1 = R.resumen.km(origen, primero), d2 = R.resumen.km(origen, ultimo);
    return d1 && d2 && d1 < d2 * 0.5 ? primero.id : '';
  }

  /** El traslado del itinerario que corresponde a un tramo (o uno cargado antes con los mismos lugares). */
  function itemsDeTramos(v) {
    const ts = tramos(v);
    const usados = new Set();
    const items = A().items(v);
    return ts.map(t => {
      let it = items.find(i => i.tramo === t.clave && !usados.has(i.id));
      if (!it) it = items.find(i => !i.tramo && !usados.has(i.id) && A().esTraslado(i) && normal(i.desde) === normal(t.desde.nombre) && normal(i.hasta) === normal(t.hasta.nombre));
      if (it) usados.add(it.id);
      return { t, it: it || null };
    });
  }

  /* ---------- ¿Qué falta completar? ---------- */
  function noches(v) {
    if (!v.fechaInicio || !v.fechaFin || v.fechaFin <= v.fechaInicio) return [];
    const r = [];
    for (let f = v.fechaInicio; f < v.fechaFin; f = U.sumarDias(f, 1)) r.push(f);
    return r;
  }
  const alojDe = (v, f) => A().nocheDe(v, f);
  /**
   * Un tramo está resuelto cuando sabés cómo vas: con taxi, transfer o auto alcanza con el medio;
   * con avión, micro, tren o barco hace falta el día (tienen horario).
   */
  function tramoResuelto(it) { return !!(it && !it.pendiente && !it.sinMedio && (it.fecha || !A().esProgramado(it))); }
  function faltaTransporte(v) { return itemsDeTramos(v).filter(x => !tramoResuelto(x.it)).length; }
  /** Cómo llegás al aeropuerto o terminal y de ahí al alojamiento (en vuelos, micros, trenes y barcos). */
  function faltanConexiones(v) { return A().items(v).filter(it => it.fecha && !it.pendiente).reduce((n, it) => n + A().conexionesFaltan(it), 0); }
  function faltanNoches(v) { return noches(v).filter(f => !alojDe(v, f) && !(v.noches || {})[f]).length; }
  /** Cuántas cosas de armado quedan (para la pestaña Pendientes). */
  function cuantasFaltan(v) { return v.armado ? (faltaTransporte(v) ? 1 : 0) + (faltanConexiones(v) ? 1 : 0) + (faltanNoches(v) ? 1 : 0) : 0; }

  /**
   * "Para completar": en el itinerario, solo lo que falta.
   * En Pendientes (completo = true), las tres partes: en verde lo que está y en rojo lo que falta.
   */
  function faltaHTML(v, completo) {
    if (!v.armado || !R.db.puedeOrganizar(v)) return '';
    const t = faltaTransporte(v), n = faltanNoches(v), c = faltanConexiones(v);
    if (!t && !n && !c && !completo) return '';
    const hayNoches = noches(v).length > 0;
    const fila = (ok, paso, icono, titulo, txtOk, txtFalta) => (ok && !completo) ? '' : `
      <a class="falta-fila ${ok ? 'ok' : 'falta'}" href="#armar/${v.id}/${paso}" data-revisar>
        <span aria-hidden="true">${ok ? '✅' : icono}</span><span>${titulo}<small>${ok ? txtOk : txtFalta}</small></span><b>${ok ? 'Ver' : 'Completar'}</b></a>`;
    return `
      <div class="falta-armar ${!t && !n && !c ? 'todo-ok' : ''}">
        <strong>${!t && !n && !c ? 'El viaje está armado' : 'Para completar cuando quieras'}</strong>
        ${fila(!t, 'transporte', '🚌', 'Cómo vas de un lugar a otro', 'Todos los tramos resueltos', U.plural(t, 'tramo sin resolver', 'tramos sin resolver'))}
        ${fila(!c, 'transporte', '🚕', 'Traslados a aeropuertos y terminales', 'Todos resueltos', `${c} sin resolver: cómo llegás y cómo salís`)}
        ${hayNoches ? fila(!n, 'noches', '🛏️', 'Dónde dormís', 'Todas las noches definidas', U.plural(n, 'noche sin definir', 'noches sin definir')) : ''}
      </div>`;
  }

  // Al entrar desde "Para completar", se marca en verde lo resuelto y en rojo lo que falta
  let revisarProx = false;
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-revisar]')) revisarProx = true; }, true);
  // Moverse entre las páginas guarda la que estás viendo
  let guardarActual = null;
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('[data-ir-paso]');
    if (!a) return;
    e.preventDefault();
    if (guardarActual && guardarActual() === false) return;
    location.hash = a.dataset.irPaso;
  });

  /* ---------------------------------------------------------
     Páginas
     --------------------------------------------------------- */
  let pendienteNuevo = null;
  function nuevo(op) { pendienteNuevo = op || null; location.hash = '#nuevo'; }

  function render(app, vista, id, paso) {
    const revisar = revisarProx;
    revisarProx = false;
    guardarActual = null;
    if (vista === 'nuevo') { document.title = 'Nuevo viaje · Rutenda'; pagDatos(app, null, pendienteNuevo || {}); pendienteNuevo = null; return; }
    const v = R.db.viaje(id);
    if (!v || !R.db.puedeOrganizar(v)) { location.hash = v ? `#viaje/${v.id}` : '#inicio'; return; }
    document.title = `${R.viajes.nombreDe(v)} · Rutenda`;
    if (paso === 'transporte') pagTransporte(app, v);
    else if (paso === 'noches') pagNoches(app, v);
    else pagDatos(app, v, {});
    const sec = app.querySelector('.armar');
    if (sec) sec.classList.toggle('revisar', revisar);
  }

  function pasosHTML(actual, v) {
    const lista = [['datos', '1', 'El viaje'], ['transporte', '2', 'Transporte'], ['noches', '3', 'Noches']];
    return `<ol class="armar-pasos">${lista.map(([id, n, t]) => {
      const link = v && id !== actual ? `href="#armar/${v.id}/${id}" data-ir-paso="#armar/${v.id}/${id}"` : '';
      return `<li class="${id === actual ? 'activo' : ''}"><a ${link}><span>${n}</span>${t}</a></li>`;
    }).join('')}</ol>`;
  }
  function pagina(app, paso, v, titulo, sub, cuerpo, botones) {
    app.innerHTML = `
      <section class="armar">
        ${pasosHTML(paso, v)}
        <h1 class="armar-titulo">${esc(titulo)}</h1>
        ${sub ? `<p class="texto-suave armar-sub">${esc(sub)}</p>` : ''}
        <div class="armar-cuerpo">${cuerpo}</div>
        <div class="armar-pie">${botones}</div>
      </section>`;
  }

  /* ---------- 1. El viaje ---------- */
  function pagDatos(app, existente, op) {
    const editando = !!existente;
    const yo = R.db.yo();
    const b = {
      nombre: editando ? existente.nombre || '' : '',
      origen: editando && existente.origen && existente.origen.nombre ? Object.assign({}, existente.origen) : R.viajes.ciudadDeSiempre(),
      destinos: editando ? destinosDe(existente).map(d => Object.assign({}, d)) : [],
      fechaInicio: editando ? existente.fechaInicio || '' : (op.fechas && op.fechas.desde) || '',
      fechaFin: editando ? existente.fechaFin || '' : (op.fechas && op.fechas.hasta) || '',
      monedaBase: editando ? existente.monedaBase : (R.db.prefs().monedaBase || 'ARS'),
      vuelta: Object.assign({ soloIda: false }, editando ? existente.vuelta : null),
      viajeros: editando
        ? existente.participantes.filter(p => p !== R.db.yoEn(existente)).map(id => ({ id, nombre: (R.db.persona(id) || {}).nombre || 'Viajero' }))
        : []
    };
    if (!b.destinos.length) b.destinos.push({ id: U.id('dst'), nombre: '' });
    const campos = [];
    let campoOrigen = null;

    pagina(app, 'datos', existente, editando ? 'Editar el viaje' : 'Nuevo viaje', editando ? '' : 'Lo único obligatorio es a dónde vas. Transporte y alojamiento vienen después (y los podés dejar para más adelante).',
      '<div class="form-viaje"></div>',
      editando ? `<button type="button" class="btn btn-suave" data-a="guardar">Guardar</button>
       <button type="button" class="btn btn-primario" data-a="guardarSeguir">Transporte →</button>`
        : `<a class="btn btn-suave" href="#inicio">Cancelar</a>
       <button type="button" class="btn btn-primario" data-a="guardar">Siguiente: transporte →</button>`);
    const caja = app.querySelector('.form-viaje');

    function leer() {
      campos.forEach((c, i) => { if (b.destinos[i]) Object.assign(b.destinos[i], c.obtener(), { id: b.destinos[i].id, soloDia: b.destinos[i].soloDia, paso: b.destinos[i].paso }); });
      if (campoOrigen) b.origen = campoOrigen.obtener();
      const q = s => caja.querySelector(s);
      b.fechaInicio = q('#fvIda').value; b.fechaFin = q('#fvVuelta').value;
      b.nombre = q('#fvNombre').value.trim(); b.monedaBase = q('#fvMoneda').value;
      caja.querySelectorAll('[data-clase-destino]').forEach(x => {
        const d = b.destinos[Number(x.dataset.claseDestino)];
        if (!d) return;
        d.soloDia = x.value === 'dia';
        if (x.value === 'paso') d.paso = true; else delete d.paso;
      });
    }

    function pintar() {
      const conocidos = R.db.personas().filter(p => !p.esYo && !b.viajeros.some(x => normal(x.nombre) === normal(p.nombre)));
      caja.innerHTML = `
        <section class="fv-seccion"><h3>🧭 El viaje</h3>
        <label class="campo"><span>Nombre del viaje <small>(opcional)</small></span><input id="fvNombre" value="${esc(b.nombre)}" placeholder="${esc(b.destinos.filter(d => d.nombre && !d.soloDia).map(d => d.nombre).join(' → ') || 'Un nombre para reconocer el viaje')}" maxlength="60"></label>
        </section>
        <section class="fv-seccion"><h3>🗺️ Recorrido</h3>
        <div class="campo"><span>Salís desde</span><div id="fvOrigen"></div></div>
        <div class="campo"><span>¿A dónde vas? <small>(en orden, solo la ida: la vuelta se arma sola)</small></span>
          <ol class="fv-destinos">${b.destinos.map((d, i) => `
            <li class="fv-destino">
              <span class="fv-num">${i + 1}</span>
              <div class="fv-destino-campos">
                <div data-lugar="${i}"></div>
              </div>
              ${b.destinos.length > 1 ? `<button type="button" class="btn-icono fv-quitar" data-quitar-destino="${i}" aria-label="Quitar" title="Quitar">×</button>` : ''}
              <div class="fv-destino-pie">
                  <select class="fv-clase" data-clase-destino="${i}" aria-label="Qué hacés en ${esc(d.nombre || 'este destino')}">
                    <option value="noche" ${!d.soloDia && !d.paso ? 'selected' : ''}>🛏️ Duermo ahí</option>
                    <option value="dia" ${d.soloDia ? 'selected' : ''}>🎒 Voy y vuelvo en el día</option>
                    <option value="paso" ${d.paso ? 'selected' : ''}>🚏 De pasada, sin dormir</option>
                  </select>
                </div>
            </li>`).join('')}
          </ol>
          <button type="button" class="btn btn-suave btn-chico" data-a="otroDestino">+ Otro destino</button>
        </div>
        <div class="campo fv-vuelta" id="fvVueltaBloque">${vueltaHTML()}</div>
        </section>
        <section class="fv-seccion"><h3>📅 Fechas</h3>
        <div class="grilla-2">
          <label class="campo"><span>Fecha de ida</span><input type="date" id="fvIda" value="${esc(b.fechaInicio)}"></label>
          <label class="campo"><span>Fecha de vuelta</span><input type="date" id="fvVuelta" value="${esc(b.fechaFin)}" ${b.fechaInicio ? `min="${b.fechaInicio}"` : ''}></label>
        </div>
        <p class="ayuda" id="fvDias">${esc(textoDias())}</p>
        </section>
        <section class="fv-seccion"><h3>👥 Quiénes van</h3>
        <div class="campo">
          <div class="fv-viajeros">
            <span class="chip-persona">${U.avatar(yo, 26)} ${esc(yo.nombre)} <small>(vos)</small></span>
            ${b.viajeros.map((p, i) => `<span class="chip-persona">${U.avatar({ id: p.id || p.nombre, nombre: p.nombre }, 26)} ${esc(p.nombre)} <button type="button" data-quitar-viajero="${i}" aria-label="Quitar">×</button></span>`).join('')}
          </div>
          <form class="fila-agregar" data-form="viajero"><input id="fvPersona" placeholder="Nombre de quien viaja con vos" list="fvConocidos" autocomplete="off"><button type="submit" class="btn btn-suave">Sumar</button></form>
          <datalist id="fvConocidos">${conocidos.map(p => `<option value="${esc(p.nombre)}">`).join('')}</datalist>
        </div>
        </section>
        <section class="fv-seccion"><h3>💸 Gastos</h3>
        <label class="campo"><span>Moneda de los gastos</span><select id="fvMoneda">${U.opcionesMoneda(b.monedaBase)}</select></label>
        </section>`;
      campos.length = 0;
      const usadas = R.lugares.recientes();
      caja.querySelectorAll('[data-lugar]').forEach(c => {
        const i = Number(c.dataset.lugar);
        campos[i] = R.lugares.campo(c, { valor: b.destinos[i], placeholder: 'Ciudad o lugar', sugeridos: b.destinos[i].nombre ? [] : usadas, alCambiar: () => { leer(); pintarVuelta(); } });
      });
      campoOrigen = R.lugares.campo(caja.querySelector('#fvOrigen'), { valor: b.origen, placeholder: 'Tu ciudad', sugeridos: usadas, alCambiar: () => { leer(); pintarVuelta(); } });
      pintarVuelta();
      caja.querySelectorAll('[data-clase-destino]').forEach(x => x.addEventListener('change', () => { leer(); pintarVuelta(); }));
      caja.querySelector('[data-a="otroDestino"]').onclick = () => {
        leer(); b.destinos.push({ id: U.id('dst'), nombre: '' }); pintar();
        const ins = caja.querySelectorAll('.fv-destino .lugar-input'); ins[ins.length - 1].focus();
      };
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
        caja.querySelector('#fvPersona').focus();
      };
      const ida = caja.querySelector('#fvIda'), vuelta = caja.querySelector('#fvVuelta');
      ida.addEventListener('change', () => {
        leer();
        if (b.fechaFin && b.fechaFin < b.fechaInicio) { b.fechaFin = ''; vuelta.value = ''; }
        vuelta.min = b.fechaInicio;
        caja.querySelector('#fvDias').textContent = textoDias();
      });
      vuelta.addEventListener('change', () => { leer(); caja.querySelector('#fvDias').textContent = textoDias(); });
      // El calendario de la vuelta arranca en la fecha de ida
      U.calendarioDesde(vuelta, () => ida.value);
      if (!editando && !b.destinos[0].nombre) setTimeout(() => { const i = caja.querySelector('.fv-destino .lugar-input'); if (i) i.focus(); }, 80);
    }
    /** "¿Volvés?" y "¿Por dónde volvés?", con los lugares del viaje como opciones. */
    function porElegido() {
      const l = conNoche(b.destinos);
      const id = b.vuelta.por === undefined ? vueltaSugerida(b.origen, b.destinos) : b.vuelta.por;
      return l.slice(0, -1).find(d => d.id === id) || null;
    }
    function vueltaHTML() {
      const l = conNoche(b.destinos);
      const ultimo = l[l.length - 1];
      const casa = (b.origen && b.origen.nombre) || 'tu ciudad';
      const por = porElegido();
      return `<span>¿Volvés?</span>
        <div class="chips-elegir chips-chicos">
          <button type="button" class="chip-op ${!b.vuelta.soloIda ? 'activo' : ''}" data-vuelta="si">Ida y vuelta</button>
          <button type="button" class="chip-op ${b.vuelta.soloIda ? 'activo' : ''}" data-vuelta="no">Solo ida</button>
        </div>
        ${!b.vuelta.soloIda && l.length > 1 ? `<span>¿Por dónde volvés?</span>
        <div class="chips-elegir chips-chicos">
          <button type="button" class="chip-op ${!por ? 'activo' : ''}" data-por="">Directo desde ${esc(ultimo.nombre)}</button>
          ${l.slice(0, -1).map(d => `<button type="button" class="chip-op ${por && por.id === d.id ? 'activo' : ''}" data-por="${d.id}">Por ${esc(d.nombre)}</button>`).join('')}
        </div>` : ''}
        <small class="ayuda">${b.vuelta.soloIda ? 'No se arma la vuelta.' : ultimo ? `La vuelta: ${esc(ultimo.nombre)}${por ? ' → ' + esc(por.nombre) : ''} → ${esc(casa)}.` : 'La vuelta se arma desde el último destino.'}</small>`;
    }
    function pintarVuelta() {
      const c = caja.querySelector('#fvVueltaBloque');
      if (!c) return;
      c.innerHTML = vueltaHTML();
      c.querySelectorAll('[data-vuelta]').forEach(x => x.onclick = () => { leer(); b.vuelta.soloIda = x.dataset.vuelta === 'no'; pintarVuelta(); });
      c.querySelectorAll('[data-por]').forEach(x => x.onclick = () => { leer(); b.vuelta.por = x.dataset.por; pintarVuelta(); });
    }

    function textoDias() {
      if (!b.fechaInicio) return 'Si todavía no sabés las fechas, dejalas vacías.';
      if (!b.fechaFin) return 'Poné la vuelta y se arman los días.';
      const d = U.diasEntre(b.fechaInicio, b.fechaFin);
      return d === 0 ? 'Ida y vuelta en el día.' : `${U.plural(d + 1, 'día', 'días')} · ${U.plural(d, 'noche', 'noches')}`;
    }

    function participantes() {
      const yoId = editando ? R.db.yoEn(existente) : R.db.yo().id;
      return [yoId].concat(b.viajeros.map(p => {
        if (p.id && R.db.persona(p.id)) return p.id;
        const conocido = R.db.personas().find(x => !x.esYo && normal(x.nombre) === normal(p.nombre));
        return conocido ? conocido.id : R.db.crearPersona(p.nombre).id;
      }));
    }

    /** Guarda la página. Devuelve el viaje, o false si falta algo. */
    function guardarDatos() {
      leer();
      const destinos = b.destinos.filter(d => d.nombre);
      if (!destinos.length) { U.toast('¿A dónde vas? Escribí al menos un destino.'); return false; }
      if (!b.origen || !b.origen.nombre) { U.toast('¿Desde dónde salís? Así se arma la vuelta.'); return false; }
      if (b.fechaFin && b.fechaInicio && b.fechaFin < b.fechaInicio) { U.toast('La vuelta tiene que ser después de la ida.'); return false; }
      if (b.fechaFin && !b.fechaInicio) { U.toast('Poné también la fecha de ida.'); return false; }
      // Cada escapada de un día sale del lugar anterior
      let base = '';
      destinos.forEach(d => { if (d.soloDia) d.base = base; else { delete d.base; base = d.id; } });
      const por = porElegido();
      const datos = { nombre: b.nombre, origen: b.origen, destinos, fechaInicio: b.fechaInicio, fechaFin: b.fechaFin || b.fechaInicio, monedaBase: b.monedaBase, vuelta: { soloIda: !!b.vuelta.soloIda, por: por ? por.id : '' } };
      R.db.guardarPrefs({ ciudadOrigen: Object.assign({}, b.origen) });
      if (editando) {
        const v = R.db.viaje(existente.id);
        let lista = participantes();
        const conGastos = v.participantes.filter(p => !lista.includes(p) && R.gastos.personaTieneMovimientos(v, p));
        if (conGastos.length) { U.toast(`${(R.db.persona(conGastos[0]) || {}).nombre || 'Alguien'} tiene gastos cargados: sigue en el viaje.`); lista = lista.concat(conGastos); }
        Object.assign(v, datos, { participantes: lista });
        // Tramos que ya no están en el recorrido (cambiaste destinos o la vuelta): se sacan del itinerario
        const vigentes = new Set(tramos(v).map(t => t.clave));
        A().items(v).filter(i => i.tramo && !vigentes.has(i.tramo)).forEach(i => A().borrarItem(v, i.id));
        R.db.guardarViaje(v);
        return v;
      }
      const v = Object.assign({
        id: U.id('via'), v2: 26, armado: true, creado: new Date().toISOString(),
        agenda: [], alojamientos: [], pendientes: [], noches: {}, valijas: { comun: { items: [] } },
        tareas: {}, tareasPropias: [], itinerario: [], documentos: [], movimientos: [], cambios: []
      }, datos, { participantes: participantes() });
      R.db.guardarViaje(v);
      return v;
    }
    if (editando) guardarActual = () => !!guardarDatos();
    app.querySelector('[data-a="guardar"]').onclick = () => {
      const v = guardarDatos();
      if (!v) return;
      if (editando) { U.toast('Cambios guardados.'); location.hash = `#viaje/${v.id}/itinerario`; }
      else location.hash = `#armar/${v.id}/transporte`;
    };
    const bs = app.querySelector('[data-a="guardarSeguir"]');
    if (bs) bs.onclick = () => { const v = guardarDatos(); if (v) location.hash = `#armar/${v.id}/transporte`; };
    pintar();
  }

  /* ---------- 2. Transporte ---------- */
  function pagTransporte(app, v) {
    const lista = itemsDeTramos(v).map(({ t, it }, i, todos) => {
      const ida = i === 0, ultimo = i === todos.length - 1;
      return {
        t, it,
        medio: it ? TIPO_A_MEDIO[it.tipo] || 'otro' : '',
        fecha: it ? it.fecha : (ida ? v.fechaInicio || '' : ultimo && t.vuelta ? v.fechaFin || '' : ''),
        hora: it ? it.hora || '' : '',
        fechaLlega: it ? it.fechaLlegada || (it.horaLlegada ? it.fecha || '' : '') : '',
        horaLlega: it ? it.horaLlegada || '' : '',
        empresa: it ? it.empresa || '' : '', numero: it ? it.numero || '' : '', codigo: it ? it.codigo || '' : '',
        aeroDesde: it ? it.aeroDesde || '' : '', aeroHasta: it ? it.aeroHasta || '' : '',
        alSalir: it ? A().conexion(it.alSalir) ? A().conexion(it.alSalir)[0] : '' : '', alLlegar: it ? A().conexion(it.alLlegar) ? A().conexion(it.alLlegar)[0] : '' : '',
        puntoSalida: it && it.puntoSalida ? it.puntoSalida : (t.desde.id === 'o' ? 'casa' : ''),
        puntoLlegada: it && it.puntoLlegada ? it.puntoLlegada : (t.hasta.id === 'o' ? 'casa' : ''),
        hayEscala: !!(it && it.escala && it.escala.lugar),
        escLugar: it && it.escala ? it.escala.lugar || '' : '', escLlegaF: it && it.escala ? it.escala.llegaFecha || '' : '', escLlegaH: it && it.escala ? it.escala.llegaHora || '' : '',
        escSaleF: it && it.escala ? it.escala.saleFecha || '' : '', escSaleH: it && it.escala ? it.escala.saleHora || '' : '',
        indef: !!(it && it.pendiente)
      };
    });
    lista.forEach(x => tiempoSinConexion(x));
    const etiqueta = x => x.t.vuelta ? 'Vuelta' : x.t.enElDia ? (x.t.hasta.soloDia ? 'Escapada de un día · ida' : 'Escapada de un día · vuelta') : 'Ida';
    /** El calendario de "Sale" arranca en la salida del tramo anterior (o en el inicio del viaje). */
    const minSale = i => { for (let k = i - 1; k >= 0; k--) if (lista[k].fecha) return lista[k].fecha; return ''; };
    const chipsMedios = (sel, attr) => MEDIOS.map(([k, ic, n]) => `<button type="button" class="chip-op ${sel === k ? 'activo' : ''}" data-${attr}="${k}">${ic} ${n}</button>`).join('');

    /** Los datos que dependen del medio: vuelo (aerolínea, número, aeropuertos), micro (empresa)… y cómo llegás a la terminal. */
    function datosHTML(x) {
      const tipo = MEDIO_A_TIPO[x.medio];
      if (!x.medio) return '';
      const prog = A().PROGRAMADOS.includes(tipo);
      const term = A().TERMINAL[tipo];
      const campoAero = (campo, ciudad) => `
        <div class="campo campo-aero"><span>Aeropuerto en ${esc(ciudad)}</span>
          <input data-f="${campo}" data-ciudad="${esc(ciudad)}" value="${esc(x[campo])}" autocapitalize="characters" autocomplete="off" placeholder="Sigla o nombre">
          <div class="chips-aero" data-chips="${campo}">${chipsAero(x[campo], ciudad, '')}</div>
        </div>`;
      return `
        ${tipo === 'vuelo' ? `
          <div class="grilla-2">
            <label class="campo"><span>N° de vuelo</span><input data-f="numero" value="${esc(x.numero)}" autocapitalize="characters" autocomplete="off" placeholder="Por ej.: AR1673"><small class="ayuda-campo" data-ayuda-vuelo hidden></small></label>
            <label class="campo"><span>Aerolínea</span><input data-f="empresa" value="${esc(x.empresa)}" list="dlEmpresasArmar" placeholder="Se completa con el número de vuelo"></label>
          </div>
          <div class="grilla-2 tramo-aeros">${campoAero('aeroDesde', x.t.desde.nombre)}${campoAero('aeroHasta', x.t.hasta.nombre)}</div>`
        : ['micro', 'tren', 'barco', 'traslado'].includes(tipo) ? `
          <label class="campo"><span>Empresa${tipo === 'traslado' ? ' <small>(opcional)</small>' : ''}</span><input data-f="empresa" value="${esc(x.empresa)}" list="dlEmpresasArmar" placeholder="Nombre de la empresa"></label>` : ''}
        ${prog ? `<label class="campo"><span>Código de reserva <small>(opcional)</small></span><input data-f="codigo" value="${esc(x.codigo)}" autocapitalize="characters"></label>
          <label class="check check-chico"><input type="checkbox" data-escala ${x.hayEscala ? 'checked' : ''}> Hace escala o combinación</label>
          <div class="escala" ${x.hayEscala ? '' : 'hidden'}>
            <label class="campo"><span>¿Dónde?</span><input data-f="escLugar" value="${esc(x.escLugar)}" placeholder="Ciudad de la escala"></label>
            <div class="tramo-horas">
              <span>Llegás</span><input type="date" data-f="escLlegaF" value="${esc(x.escLlegaF)}" aria-label="Día que llegás a la escala"><input type="time" data-f="escLlegaH" value="${esc(x.escLlegaH)}" aria-label="Hora que llegás a la escala">
              <span>Salís</span><input type="date" data-f="escSaleF" value="${esc(x.escSaleF)}" aria-label="Día que salís de la escala"><input type="time" data-f="escSaleH" value="${esc(x.escSaleH)}" aria-label="Hora que salís de la escala">
            </div>
          </div>
          <div class="ruta-con">${rutaHTML(x)}</div>` : ''}`;
    }

    /** Chips de aeropuertos: los de la ciudad, o los que coinciden con lo que escribiste. Marca el elegido. */
    function chipsAero(valor, ciudad, buscado) {
      if (!R.aeropuertos) return '';
      const q = String(buscado || '').trim();
      let lista = q.length >= 2 ? R.aeropuertos.buscar(q, 4) : R.aeropuertos.sugerencias(v, ciudad).slice(0, 3);
      const elegido = valor ? R.aeropuertos.porCodigo(valor) : null;
      if (elegido && !lista.some(a => a.iata === elegido.iata)) lista = [elegido].concat(lista).slice(0, 4);
      if (!lista.length) return q.length >= 2 ? '<small class="texto-suave">No lo encuentro: escribí la sigla de 3 letras (está en el pasaje).</small>' : '';
      return lista.map(a => `<button type="button" class="chip-mini ${elegido && elegido.iata === a.iata ? 'activo' : ''}" data-iata="${a.iata}" title="${esc(a.nombre)}">${a.iata} <small>${esc(a.ciudad || a.nombre)}</small></button>`).join('');
    }

    /** Puerta a puerta: de dónde salís, cómo llegás a la terminal, el viaje, y cómo llegás a destino. */
    function rutaHTML(x) {
      const tipo = MEDIO_A_TIPO[x.medio];
      const term = A().TERMINAL[tipo];
      const fem = term === 'terminal' || term === 'estación';
      const icono = A().tipo(tipo).icono;
      const nombreTerm = (aero, ciudad) => tipo === 'vuelo' ? `Aeropuerto ${aero ? aero + ' · ' + ciudad : 'de ' + ciudad}` : `${fem ? (term === 'terminal' ? 'Terminal' : 'Estación') : 'Puerto'} de ${ciudad}`;
      const paso = (campo, pregunta) => {
        const c = A().conexion(x[campo]);
        const ok = A().conexionResuelta(x[campo]);
        return `
          <button type="button" class="rc-paso ${ok ? 'ok' : 'sin'}" data-con="${campo}" aria-expanded="false">
            <span class="rc-linea" aria-hidden="true"></span>
            <span class="rc-elegido">${c ? `${c[1]} ${esc(c[2])}` : esc(pregunta)}</span><span class="rc-cambiar">${c ? 'Cambiar' : 'Elegir'}</span>
          </button>
          <div class="rc-opciones" data-ops="${campo}" hidden>${A().CONEXIONES.map(([k, ic, n]) => `<button type="button" class="chip-op ${x[campo] === k ? 'activo' : ''}" data-val="${k}">${ic} ${n}</button>`).join('')}</div>`;
      };
      // Los extremos (de dónde salís y a dónde vas) los elegís vos: no se da por hecho que es el alojamiento
      // Quedarse en la terminal se dice distinto según el lado: "Ya estoy en el aeropuerto" / "Me quedo en el aeropuerto"
      const elTerm = `${fem ? 'la' : 'el'} ${term}`;
      const textoPunto = (campo, k, n, ciudad) => k === 'aloj' && ciudad ? `Alojamiento en ${ciudad}`
        : k === 'combino' ? (campo === 'puntoSalida' ? `Ya estoy en ${elTerm} (vengo de otro transporte)` : `Me quedo en ${elTerm} hasta el próximo transporte`) : n;
      const extremo = (campo, pregunta, ciudad) => {
        const p = A().punto(x[campo]);
        return `
          <button type="button" class="rc-punto rc-punto-btn ${p ? '' : 'sin-punto'}" data-con="${campo}" aria-expanded="false">
            <span>${p ? `${p[1]} ${esc(textoPunto(campo, p[0], p[2], ciudad))}` : esc(pregunta)}</span><span class="rc-cambiar">${p ? 'Cambiar' : 'Elegir'}</span>
          </button>
          <div class="rc-opciones" data-ops="${campo}" hidden>${A().PUNTOS.map(([k, ic, n]) => `<button type="button" class="chip-op ${(A().punto(x[campo]) || [])[0] === k ? 'activo' : ''}" data-val="${k}">${ic} ${esc(textoPunto(campo, k, n))}</button>`).join('')}</div>`;
      };
      return `
        <span class="rc-titulo">Puerta a puerta</span>
        ${extremo('puntoSalida', '¿Desde dónde salís?', x.t.desde.nombre)}
        ${enTerminal(x.puntoSalida) ? '' : paso('alSalir', `¿Cómo llegás ${fem ? 'a la' : 'al'} ${term}?`)}
        <div class="rc-punto rc-term">${icono} ${esc(nombreTerm(x.aeroDesde, x.t.desde.nombre))}</div>
        <div class="rc-viaje"><span class="rc-linea punteada" aria-hidden="true"></span>${esc(A().tipo(tipo).nombre)}${x.hayEscala && x.escLugar ? ` · escala en ${esc(x.escLugar)}` : ''}</div>
        <div class="rc-punto rc-term">${icono} ${esc(nombreTerm(x.aeroHasta, x.t.hasta.nombre))}</div>
        ${enTerminal(x.puntoLlegada) ? '' : paso('alLlegar', `¿Cómo salís ${fem ? 'de la' : 'del'} ${term}?`)}
        ${extremo('puntoLlegada', '¿A dónde vas después?', x.t.hasta.nombre)}`;
    }

    /** Si te quedás en la terminal (o ya estás ahí), no hay traslado que resolver de ese lado.
        Si después cambiás a otro lugar, el traslado vuelve a quedar para elegir. */
    function enTerminal(k) { return (A().punto(k) || [])[0] === 'combino'; }
    function tiempoSinConexion(x) {
      [['puntoSalida', 'alSalir'], ['puntoLlegada', 'alLlegar']].forEach(([pu, co]) => {
        if (enTerminal(x[pu])) { if (x[co] !== 'no') x['auto_' + co] = true; x[co] = 'no'; }
        else if (x['auto_' + co]) { x[co] = ''; x['auto_' + co] = false; }
      });
    }

    /** La llegada no puede ser antes que la salida. Si es el mismo día y la hora es menor, es al día siguiente. */
    function validar(el) {
      const x = lista[Number(el.dataset.i)];
      leer(el);
      const aviso = el.querySelector('.tramo-aviso');
      const fl = el.querySelector('[data-f="fechaLlega"]');
      let msg = '', error = false;
      if (!x.indef && x.fecha && x.fechaLlega && x.fechaLlega < x.fecha) { msg = '⛔ La llegada es antes que la salida. Revisá las fechas.'; error = true; }
      else if (!x.indef && x.fecha && x.fechaLlega === x.fecha && x.hora && x.horaLlega && x.horaLlega < x.hora) {
        x.fechaLlega = U.sumarDias(x.fecha, 1); fl.value = x.fechaLlega;
        msg = `Llega al día siguiente (${U.fmtFecha(x.fechaLlega, 'dia')}): lo corregí.`;
      }
      if (!error && x.hayEscala && x.escLugar) {
        const t = (f, h) => (f || '') + ' ' + (h || '');
        if (x.escLlegaF && x.fecha && t(x.escLlegaF, x.escLlegaH) < t(x.fecha, x.hora)) { msg = '⛔ Llegás a la escala antes de salir. Revisá las fechas.'; error = true; }
        else if (x.escSaleF && x.escLlegaF && t(x.escSaleF, x.escSaleH) < t(x.escLlegaF, x.escLlegaH)) { msg = '⛔ Salís de la escala antes de llegar. Revisá las fechas.'; error = true; }
        else if (x.escSaleF && x.fechaLlega && t(x.fechaLlega, x.horaLlega) < t(x.escSaleF, x.escSaleH)) { msg = '⛔ La llegada final es antes de salir de la escala. Revisá las fechas.'; error = true; }
      }
      x.error = error;
      el.classList.toggle('con-error', error);
      aviso.textContent = msg;
      aviso.hidden = !msg;
      aviso.classList.toggle('error', error);
      return !error;
    }

    const cuerpo = `
      <div class="campo"><span>¿Todo el viaje en el mismo medio?</span>
        <div class="chips-elegir chips-chicos">${chipsMedios('', 'todos')}</div>
      </div>
      <div class="tramos">${lista.map((x, i) => `
        <div class="tramo" data-i="${i}">
          <div class="tramo-cab"><span class="tramo-num">${i + 1}</span><div><strong>${esc(x.t.desde.nombre)} → ${esc(x.t.hasta.nombre)}</strong><small>${etiqueta(x)}</small></div></div>
          <div class="chips-elegir chips-chicos tramo-medios">${chipsMedios(x.medio, 'medio')}</div>
          <label class="check check-chico tramo-indef"><input type="checkbox" data-indef ${x.indef ? 'checked' : ''}> Todavía no lo sé (lo completo después)</label>
          <div class="tramo-def" ${x.indef ? 'hidden' : ''}>
            <div class="tramo-horas">
              <span>Sale</span><input type="date" data-f="fecha" value="${esc(x.fecha)}" ${minSale(i) ? `min="${minSale(i)}"` : ''} aria-label="Día que sale"><input type="time" data-f="hora" value="${esc(x.hora)}" aria-label="Hora que sale">
              <span>Llega</span><input type="date" data-f="fechaLlega" value="${esc(x.fechaLlega)}" ${x.fecha ? `min="${x.fecha}"` : ''} aria-label="Día que llega"><input type="time" data-f="horaLlega" value="${esc(x.horaLlega)}" aria-label="Hora que llega">
            </div>
            <p class="tramo-aviso" hidden></p>
            <div class="tramo-datos">${datosHTML(x)}</div>
          </div>
        </div>`).join('')}</div>
      <datalist id="dlEmpresasArmar">${A().usados('empresa').map(e => `<option value="${esc(e)}">`).join('')}</datalist>
      <p class="ayuda">Lo que no sepas, dejalo vacío. Con taxi, transfer o auto alcanza con elegir el medio; con avión, micro, tren o barco falta el día. Lo que quede sin resolver aparece en "Para completar".</p>`;
    pagina(app, 'transporte', v, 'Cómo vas de un lugar a otro', 'Cada tramo del recorrido, con la vuelta incluida.', cuerpo,
      `<button type="button" class="btn btn-suave" data-a="omitir">Omitir por ahora</button>
       <button type="button" class="btn btn-primario" data-a="seguir">${noches(v).length ? 'Siguiente: noches →' : 'Listo'}</button>`);

    const leer = el => {
      const x = lista[Number(el.dataset.i)];
      el.querySelectorAll('[data-f]').forEach(inp => {
        const val = inp.value.trim();
        // En los aeropuertos solo vale una sigla (lo demás es lo que estás buscando)
        if (inp.dataset.f === 'aeroDesde' || inp.dataset.f === 'aeroHasta') { if (/^[A-Za-z]{3}$/.test(val)) x[inp.dataset.f] = val.toUpperCase(); else if (!val) x[inp.dataset.f] = ''; return; }
        x[inp.dataset.f] = val;
      });
    };
    const leerTodo = () => app.querySelectorAll('.tramo').forEach(leer);
    function enlazarDatos(el) {
      const x = lista[Number(el.dataset.i)];
      const repintarRuta = () => { const r = el.querySelector('.ruta-con'); if (r) { r.innerHTML = rutaHTML(x); enlazarRuta(); } };
      el._repintarRuta = repintarRuta;
      function enlazarRuta() {
        el.querySelectorAll('[data-con]').forEach(b => b.onclick = () => {
          const ops = el.querySelector(`[data-ops="${b.dataset.con}"]`);
          const abrir = ops.hidden;
          el.querySelectorAll('.rc-opciones').forEach(o => { o.hidden = true; });
          ops.hidden = !abrir;
          b.setAttribute('aria-expanded', String(abrir));
        });
        el.querySelectorAll('.rc-opciones [data-val]').forEach(b => b.onclick = () => {
          const campo = b.closest('.rc-opciones').dataset.ops;
          x[campo] = b.dataset.val;
          tiempoSinConexion(x);
          // Si te quedás en la terminal para combinar, el tramo que sigue sale de ahí
          const sig = lista[Number(el.dataset.i) + 1];
          const cambia = campo === 'puntoLlegada' && sig && (enTerminal(x.puntoLlegada) ? !sig.puntoSalida : enTerminal(sig.puntoSalida));
          if (cambia) {
            sig.puntoSalida = enTerminal(x.puntoLlegada) ? 'combino' : '';
            tiempoSinConexion(sig);
            const elSig = app.querySelector(`.tramo[data-i="${Number(el.dataset.i) + 1}"]`);
            if (elSig && elSig._repintarRuta) elSig._repintarRuta();
          }
          repintarRuta();
          marcarEstado(el);
        });
      }
      enlazarRuta();
      // Aeropuertos: tocar un chip lo marca; escribir busca por sigla, ciudad o nombre
      el.querySelectorAll('.campo-aero').forEach(c => {
        const inp = c.querySelector('input');
        const campo = inp.dataset.f;
        const pintarChips = q => {
          c.querySelector('.chips-aero').innerHTML = chipsAero(x[campo], inp.dataset.ciudad, q);
          c.querySelectorAll('[data-iata]').forEach(b => b.onclick = () => {
            x[campo] = b.dataset.iata; inp.value = b.dataset.iata;
            pintarChips(''); repintarRuta();
          });
        };
        pintarChips('');
        inp.addEventListener('input', () => {
          const val = inp.value.trim().toUpperCase();
          const exacto = /^[A-Z]{3}$/.test(val) && R.aeropuertos && R.aeropuertos.porCodigo(val);
          x[campo] = exacto ? val : (/^[A-Z]{3}$/.test(val) ? val : '');
          pintarChips(exacto ? '' : inp.value);
        });
        inp.addEventListener('blur', () => {
          // Si escribiste un nombre y hay un solo aeropuerto que coincide, se elige ese
          const val = inp.value.trim();
          if (val && !/^[A-Za-z]{3}$/.test(val) && R.aeropuertos) {
            const r = R.aeropuertos.buscar(val, 2);
            if (r.length === 1) { x[campo] = r[0].iata; inp.value = r[0].iata; pintarChips(''); }
          } else if (/^[A-Za-z]{3}$/.test(val)) inp.value = val.toUpperCase();
          repintarRuta();
        });
      });
      const esc1 = el.querySelector('[data-escala]');
      if (esc1) esc1.addEventListener('change', () => {
        x.hayEscala = esc1.checked;
        el.querySelector('.escala').hidden = !x.hayEscala;
        if (x.hayEscala) { const i = el.querySelector('[data-f="escLugar"]'); i.focus(); }
        validar(el); repintarRuta();
      });
      el.querySelectorAll('.escala [data-f]').forEach(i => i.addEventListener('change', () => { validar(el); repintarRuta(); }));
      const num = el.querySelector('[data-f="numero"]'), emp = el.querySelector('[data-f="empresa"]');
      // La aerolínea se completa sola mientras escribís el número (AR, FO, WJ, LA…)
      if (num && emp) num.addEventListener('input', () => {
        const r = A().leerVuelo(num.value);
        if (r.empresa && (!emp.value.trim() || emp.dataset.auto === '1')) { emp.value = r.empresa; emp.dataset.auto = '1'; x.empresa = r.empresa; }
        const ay = el.querySelector('[data-ayuda-vuelo]');
        if (ay) {
          ay.textContent = r.falta === 'letras' ? 'Sumá las letras de la aerolínea (por ej. AR1673) y se completa sola.'
            : r.falta === 'desconocida' ? `No conozco la aerolínea «${r.codigo}»: escribila abajo.` : '';
          ay.hidden = !ay.textContent;
        }
      });
      if (emp) emp.addEventListener('input', () => { emp.dataset.auto = ''; });
      // El calendario de las escalas arranca en el día que sale el tramo
      el.querySelectorAll('[data-f="escLlegaF"], [data-f="escSaleF"]').forEach(i => U.calendarioDesde(i, () => el.querySelector('[data-f="fecha"]').value || v.fechaInicio));
    }
    function cambiarMedio(el, medio) {
      leer(el);
      const x = lista[Number(el.dataset.i)];
      x.medio = medio;
      el.querySelectorAll('[data-medio]').forEach(b => b.classList.toggle('activo', b.dataset.medio === x.medio));
      el.querySelector('.tramo-datos').innerHTML = datosHTML(x);
      enlazarDatos(el);
    }
    app.querySelectorAll('.tramo').forEach(el => {
      const x = lista[Number(el.dataset.i)];
      enlazarDatos(el);
      el.querySelectorAll('[data-medio]').forEach(b => b.onclick = () => cambiarMedio(el, x.medio === b.dataset.medio ? '' : b.dataset.medio));
      const f = el.querySelector('[data-f="fecha"]'), fl = el.querySelector('[data-f="fechaLlega"]');
      el.querySelector('[data-indef]').addEventListener('change', e => {
        x.indef = e.target.checked;
        el.querySelector('.tramo-def').hidden = x.indef;
      });
      el.querySelectorAll('.tramo-def > .tramo-horas input').forEach(i => i.addEventListener('change', () => setTimeout(() => validar(el), 0)));
      // Sin fecha de salida, el calendario de "Llega" igual arranca en el viaje (no en hoy)
      if (!f.value && v.fechaInicio) fl.min = minSale(Number(el.dataset.i)) || v.fechaInicio;
      f.addEventListener('change', () => {
        fl.min = f.value || '';
        if (fl.value && fl.value < f.value) fl.value = '';
        const sig = app.querySelector(`.tramo[data-i="${Number(el.dataset.i) + 1}"] [data-f="fecha"]`);
        if (sig && f.value) sig.min = f.value;
        // La escapada de un día: la vuelta es el mismo día
        const par = x.t.enElDia ? lista[Number(el.dataset.i) + (x.t.hasta.soloDia ? 1 : -1)] : null;
        if (par && !par.fecha) {
          const otro = app.querySelector(`.tramo[data-i="${lista.indexOf(par)}"]`);
          otro.querySelector('[data-f="fecha"]').value = f.value;
        }
      });
    });
    app.querySelectorAll('[data-todos]').forEach(b => b.onclick = () => {
      app.querySelectorAll('.tramo').forEach(el => cambiarMedio(el, b.dataset.todos));
      app.querySelectorAll('[data-todos]').forEach(y => y.classList.toggle('activo', y === b));
    });

    // Calendarios: "Sale" arranca en el tramo anterior (o el inicio del viaje) y "Llega" en el día que sale
    app.querySelectorAll('.tramo').forEach(el => {
      const i = Number(el.dataset.i);
      U.calendarioDesde(el.querySelector('[data-f="fecha"]'), () => minSale(i) || v.fechaInicio);
      U.calendarioDesde(el.querySelector('[data-f="fechaLlega"]'), () => el.querySelector('[data-f="fecha"]').value || minSale(i) || v.fechaInicio);
      el.querySelectorAll('input, [data-indef]').forEach(inp => inp.addEventListener('change', () => marcarEstado(el)));
      marcarEstado(el);
    });

    const siguiente = () => { location.hash = noches(v).length ? `#armar/${v.id}/noches` : `#viaje/${v.id}/itinerario`; };
    app.querySelector('[data-a="omitir"]').onclick = () => { v.armado = true; R.db.guardarViaje(v); siguiente(); };
    guardarActual = guardarTransporte;
    app.querySelector('[data-a="seguir"]').onclick = () => { if (guardarTransporte()) siguiente(); };
    /** Verde si el tramo está resuelto (medio, día si tiene horario, y cómo llegás/salís de la terminal); rojo si falta algo. */
    function marcarEstado(el) {
      const x = lista[Number(el.dataset.i)];
      leer(el);
      const tipo = MEDIO_A_TIPO[x.medio];
      const prog = A().PROGRAMADOS.includes(tipo);
      const ok = !!x.medio && !x.indef && (!prog || !!x.fecha) && (!prog || (A().conexionResuelta(x.alSalir) && A().conexionResuelta(x.alLlegar)));
      el.classList.toggle('ok', ok);
      el.classList.toggle('falta', !ok);
    }
    function guardarTransporte() {
      leerTodo();
      const conError = [...app.querySelectorAll('.tramo')].find(el => !validar(el));
      if (conError) { U.toast('Hay un tramo con la llegada antes que la salida.'); conError.scrollIntoView({ behavior: 'smooth', block: 'center' }); return false; }
      lista.forEach(x => {
        if (!x.medio && !x.fecha && !x.it && !x.indef) return;
        const it = x.it ? Object.assign({}, x.it) : A().nuevoItem({});
        const medio = x.medio || (x.it ? TIPO_A_MEDIO[x.it.tipo] : '') || '';
        const tipo = MEDIO_A_TIPO[medio] || 'otromedio';
        const prog = A().PROGRAMADOS.includes(tipo);
        Object.assign(it, {
          tramo: x.t.clave, tipo, sinMedio: !medio, pendiente: !!x.indef,
          desde: x.t.desde.nombre, hasta: x.t.hasta.nombre, titulo: `${x.t.desde.nombre} → ${x.t.hasta.nombre}`,
          fecha: x.fecha, hora: x.hora, fechaLlegada: x.fechaLlega && x.fechaLlega !== x.fecha ? x.fechaLlega : '', horaLlegada: x.horaLlega,
          empresa: x.empresa || (tipo === 'vuelo' ? A().aerolineaDe(x.numero) : ''), numero: tipo === 'vuelo' ? x.numero.toUpperCase() : (it.numero || ''),
          codigo: prog ? x.codigo.toUpperCase() : (it.codigo || ''),
          aeroDesde: tipo === 'vuelo' ? x.aeroDesde.toUpperCase() : '', aeroHasta: tipo === 'vuelo' ? x.aeroHasta.toUpperCase() : '',
          alSalir: prog ? x.alSalir : '', alLlegar: prog ? x.alLlegar : '',
          puntoSalida: prog ? x.puntoSalida : '', puntoLlegada: prog ? x.puntoLlegada : '',
          escala: prog && x.hayEscala && x.escLugar ? { lugar: x.escLugar, llegaFecha: x.escLlegaF, llegaHora: x.escLlegaH, saleFecha: x.escSaleF, saleHora: x.escSaleH } : null
        });
        A().guardarItem(v, it);
      });
      v.armado = true;
      R.db.guardarViaje(v);
      return true;
    }
  }

  /* ---------- 3. Noches ---------- */
  // Si llegás al día siguiente antes de esta hora, puede que esa noche duermas en un alojamiento: se pregunta
  const HORA_DUDOSA = '04:00';
  /**
   * Dónde estás cada noche, según el recorrido en orden: desde que llegás a un lugar
   * hasta que salís de ahí, las noches son ahí. La ida sale el día que empieza el viaje
   * y la vuelta el día que termina (si no cargaste otra cosa).
   */
  function lugarSegunTransporte(v, f) {
    const base = itemsDeTramos(v).filter(x => !x.t.enElDia);
    const L = base.map((x, i) => {
      const it = x.it && x.it.fecha ? x.it : null;
      let sale = it ? it.fecha : '', llega = it ? (it.fechaLlegada || it.fecha) : '';
      if (!it && i === 0 && v.fechaInicio) sale = llega = v.fechaInicio;
      if (!it && i === base.length - 1 && x.t.vuelta && v.fechaFin) sale = llega = v.fechaFin;
      return { t: x.t, it, sale, llega };
    });
    // Esa noche estás en camino (saliste ese día o antes y llegás después)
    const enCamino = L.find(x => x.it && x.sale <= f && x.llega > f);
    if (enCamino) {
      const it = enCamino.it, e = it.escala;
      // Escala o combinación esa noche: ¿hotel ahí o aeropuerto/terminal?
      if (e && e.lugar && e.llegaFecha && e.saleFecha && e.llegaFecha <= f && e.saleFecha > f) return { pregunta: 'escala', tramo: enCamino, escala: e };
      // En auto, taxi o transfer de un día para otro: ¿parás a dormir en el camino?
      if (!A().esProgramado(it)) return { pregunta: 'auto', tramo: enCamino };
      // Llegás pasada la medianoche pero temprano (antes de las 4): puede que vayas a dormir a un alojamiento
      if (enCamino.llega === U.sumarDias(f, 1) && it.horaLlegada && it.horaLlegada < HORA_DUDOSA) return { pregunta: 'madrugada', tramo: enCamino };
      // Llegás al otro día más tarde (5, 6, 7…): dormiste viajando
      return { viaje: true, tramo: enCamino };
    }
    let j = -1;
    L.forEach((x, i) => { if (x.llega && x.llega <= f) j = i; });
    let k = L.findIndex((x, i) => i > j && x.sale && x.sale > f);
    if (k === -1) k = L.length;
    // Lugares posibles: a donde llegaste con el último tramo y los que vienen antes del próximo con fecha
    const posibles = [];
    for (let i = Math.max(j, 0); i < k; i++) {
      const h = (j === -1 && i === 0) ? null : L[i].t.hasta;
      if (h && h.id !== 'o' && !posibles.some(p => p.id === h.id)) posibles.push(h);
    }
    if (j === -1 && k < L.length && L[k].t.desde.id !== 'o' && !posibles.some(p => p.id === L[k].t.desde.id)) posibles.push(L[k].t.desde);
    if (j >= 0 && L[j].t.hasta.id === 'o' && k === L.length) return { lugar: L[j].t.hasta };
    // Donde solo pasás no se da por hecho un alojamiento: si te toca la noche ahí, se pregunta
    const reales = posibles.filter(p => !p.paso);
    if (posibles.length && !reales.length) return { pregunta: 'paso', lugar: posibles[0] };
    if (reales.length === 1) return { lugar: reales[0] };
    if (reales.length > 1) return { opciones: reales };
    const quedas = destinosDe(v).filter(d => !d.soloDia && !d.paso);
    if (quedas.length === 1) return { lugar: quedas[0] };
    return {};
  }

  function pagNoches(app, v) {
    const ns = noches(v);
    const quedas = destinosDe(v).filter(d => !d.soloDia && !d.paso);
    const manuales = (v.alojamientos || []).filter(a => !a.deArmado);
    const deArmado = (v.alojamientos || []).filter(a => a.deArmado);
    const elegido = {}, notas = {};
    ns.forEach(f => {
      const a = alojDe(v, f);
      const s = lugarSegunTransporte(v, f);
      if (s.opciones) notas[f] = `Puede ser ${s.opciones.map(o => o.nombre).join(' o ')}: falta el día que vas de uno a otro.`;
      if (s.pregunta === 'madrugada') notas[f] = `Llegás a ${s.tramo.t.hasta.nombre} a las ${s.tramo.it.horaLlegada}: ¿esa noche ya dormís en un alojamiento o la pasás viajando?`;
      if (s.pregunta === 'escala') notas[f] = `Hacés escala en ${s.escala.lugar} (llegás ${U.fmtFecha(s.escala.llegaFecha, 'dia')}${s.escala.llegaHora ? ' ' + s.escala.llegaHora : ''}, salís ${U.fmtFecha(s.escala.saleFecha, 'dia')}${s.escala.saleHora ? ' ' + s.escala.saleHora : ''}): ¿dormís en un hotel ahí o en el aeropuerto/terminal?`;
      if (s.pregunta === 'paso') notas[f] = `En ${s.lugar.nombre} solo pasás y esa noche te toca ahí: ¿la pasás en el aeropuerto o la terminal, o vas a un hotel?`;
      if (s.pregunta === 'auto') notas[f] = `Vas de ${s.tramo.t.desde.nombre} a ${s.tramo.t.hasta.nombre} y llegás otro día: ¿manejás de corrido o parás a dormir en el camino?`;
      if (a && !a.deArmado) elegido[f] = 'aloj:' + a.id;
      else if (a && a.deArmado && a.destinoId) elegido[f] = a.destinoId.startsWith('parada:') ? a.destinoId : 'lugar:' + a.destinoId;
      else if ((v.noches || {})[f]) elegido[f] = v.noches[f];
      else if (s.pregunta) elegido[f] = '';
      else if (s.viaje) elegido[f] = 'viaje';
      else if (s.lugar && s.lugar.id === 'o') elegido[f] = 'casa';
      else if (s.lugar && !s.lugar.soloDia) elegido[f] = 'lugar:' + s.lugar.id;
      else elegido[f] = '';
    });
    const separadas = new Set();
    // Datos que ya cargaste en cada alojamiento, para no perderlos al reagrupar
    const datosAloj = {};
    deArmado.forEach(a => { (datosAloj[a.destinoId] = datosAloj[a.destinoId] || []).push(a); });
    const escritos = {};

    const opciones = f => {
      const s = lugarSegunTransporte(v, f);
      const ops = quedas.map(d => [`lugar:${d.id}`, `🛏️ En ${d.nombre}`]);
      manuales.forEach(a => ops.push([`aloj:${a.id}`, `🛏️ ${A().nombreAlojamiento(a)}`]));
      if (s.escala) ops.unshift([`parada:${s.escala.lugar}`, `🛏️ Hotel en ${s.escala.lugar} (escala)`]);
      if (s.pregunta === 'paso') ops.unshift([`parada:${s.lugar.nombre}`, `🛏️ Hotel en ${s.lugar.nombre}`]);
      const tr = s.tramo ? `${s.tramo.t.desde.nombre} → ${s.tramo.t.hasta.nombre}` : '';
      ops.push(['viaje', s.pregunta === 'escala' || s.pregunta === 'paso' ? '✈️ En el aeropuerto / terminal' : tr ? `${A().tipo(s.tramo.it.tipo).icono} Viajando (${tr})` : '🚌 Viajando']);
      ops.push(['casa', '🏠 En casa']);
      // "En otro lugar": una parada en el camino (la escribís vos)
      const otro = (elegido[f] || '').startsWith('parada:') && !(s.escala && elegido[f] === `parada:${s.escala.lugar}`);
      ops.push([otro ? elegido[f] : '__otro', otro ? `🛏️ En ${elegido[f].slice(7)}` : '🛏️ En otro lugar (parada en el camino)…']);
      return `<option value="">Sin definir</option>${ops.map(([k, t]) => `<option value="${esc(k)}" ${elegido[f] === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}`;
    };

    /** Noches seguidas en el mismo destino = un alojamiento. */
    function grupos() {
      const r = [];
      ns.forEach(f => {
        const e = elegido[f] || '';
        if (!e.startsWith('lugar:') && !e.startsWith('parada:')) return;
        const ult = r[r.length - 1];
        if (ult && ult.clave === e && U.sumarDias(ult.hasta, 0) === f) ult.hasta = U.sumarDias(f, 1);
        else r.push({ clave: e, destinoId: e.startsWith('lugar:') ? e.slice(6) : e, desde: f, hasta: U.sumarDias(f, 1) });
      });
      const usados = {};
      r.forEach(g => {
        const d = quedas.find(x => x.id === g.destinoId) || {};
        g.ciudad = g.destinoId.startsWith('parada:') ? g.destinoId.slice(7) : d.nombre || '';
        const previos = datosAloj[g.destinoId] || [];
        const n = usados[g.destinoId] = (usados[g.destinoId] || 0);
        usados[g.destinoId]++;
        g.previo = previos[n] || null;
        g.k = `${g.destinoId}#${n}`;
      });
      return r;
    }

    const cuerpo = ns.length ? `
      <div class="noches"></div>
      <h2 class="titulo-seccion armar-sub2">Alojamientos</h2>
      <div class="alojs"></div>
      <p class="ayuda">El nombre y la dirección son opcionales: si todavía no reservaste, dejalo así y lo completás después.</p>` : '<p class="texto-suave">Es ida y vuelta en el día: no hay noches. 🎒</p>';
    pagina(app, 'noches', v, 'Dónde dormís', 'Noche por noche. Lo que se pudo, sale del transporte; cambialo si no es así.', cuerpo,
      `<button type="button" class="btn btn-suave" data-a="omitir">Omitir por ahora</button>
       <button type="button" class="btn btn-primario" data-a="listo">Listo</button>`);

    function leerEscritos() {
      app.querySelectorAll('[data-g]').forEach(el => { escritos[el.dataset.g] = { nombre: el.querySelector('[data-c="nombre"]').value, direccion: el.querySelector('[data-c="direccion"]').value }; });
    }
    function pintar() {
      const cn = app.querySelector('.noches');
      if (!cn) return;
      // Las noches seguidas con lo mismo van juntas en una fila ("Del 2 al 6 · 4 noches · En Bariloche").
      // Las que tienen una pregunta (madrugada, escala, auto) van solas.
      const bloques = [];
      ns.forEach(f => {
        const ult = bloques[bloques.length - 1];
        const solo = !!notas[f] || separadas.has(f);
        if (ult && !solo && !ult.solo && ult.valor === (elegido[f] || '')) ult.noches.push(f);
        else bloques.push({ valor: elegido[f] || '', noches: [f], solo });
      });
      const rango = b => {
        const f0 = b.noches[0], f1 = b.noches[b.noches.length - 1];
        return b.noches.length === 1 ? `Noche del ${U.fmtFecha(f0, 'dia')}` : `Del ${U.fmtFecha(f0, 'dia')} al ${U.fmtFecha(U.sumarDias(f1, 1), 'dia')} · ${b.noches.length} noches`;
      };
      cn.innerHTML = bloques.map(b => {
        const f = b.noches[0];
        return `
        <div class="noche ${b.valor ? 'ok' : 'falta'} ${notas[f] && !b.valor ? 'pregunta' : ''}">
          <span class="noche-fecha">${esc(rango(b))}</span>
          <select data-noche="${b.noches.join(',')}" aria-label="${esc(rango(b))}">${opciones(f)}</select>
          ${notas[f] ? `<small class="noche-nota">${esc(notas[f])}</small>` : ''}
          ${b.noches.length > 1 ? `<button type="button" class="btn-texto-mini noche-separar" data-separar="${b.noches.join(',')}">Cambiar alguna noche suelta</button>` : ''}
        </div>`;
      }).join('');
      cn.querySelectorAll('[data-separar]').forEach(b => b.onclick = () => { leerEscritos(); b.dataset.separar.split(',').forEach(f => separadas.add(f)); pintar(); });
      cn.querySelectorAll('[data-noche]').forEach(s => s.onchange = () => {
        leerEscritos();
        const fechas = s.dataset.noche.split(',');
        if (s.value === '__otro') {
          // Se pide el lugar ahí mismo
          const fila = s.closest('.noche');
          fila.insertAdjacentHTML('beforeend', `<form class="noche-otro"><input placeholder="Ciudad o lugar donde parás" aria-label="Dónde parás a dormir"><button class="btn btn-suave btn-chico">Listo</button></form>`);
          const fo = fila.querySelector('.noche-otro');
          fo.querySelector('input').focus();
          fo.onsubmit = e => { e.preventDefault(); const t = fo.querySelector('input').value.trim(); if (!t) return; fechas.forEach(f => { elegido[f] = 'parada:' + t; }); pintar(); };
          return;
        }
        fechas.forEach(f => { elegido[f] = s.value; }); pintar();
      });
      const gs = grupos();
      const ca = app.querySelector('.alojs');
      ca.innerHTML = gs.length ? gs.map(g => {
        const w = escritos[g.k] || {};
        const p = g.previo || {};
        const n = U.diasEntre(g.desde, g.hasta);
        return `
          <div class="aloj-armar" data-g="${g.k}">
            <strong>🛏️ ${esc(g.ciudad)}</strong><small>${U.plural(n, 'noche', 'noches')} · entrás el ${esc(U.fmtFecha(g.desde, 'dia'))}, salís el ${esc(U.fmtFecha(g.hasta, 'dia'))}</small>
            <label class="campo"><span>Nombre <small>(opcional)</small></span><input data-c="nombre" value="${esc(w.nombre != null ? w.nombre : p.nombre || '')}" placeholder="Nombre del hotel, departamento o casa" list="dlAlojArmar"></label>
            <label class="campo"><span>Dirección <small>(opcional)</small></span><input data-c="direccion" value="${esc(w.direccion != null ? w.direccion : p.direccion || '')}" placeholder="Calle y número, o nombre del lugar"></label>
          </div>`;
      }).join('') + `<datalist id="dlAlojArmar">${A().usados('alojamiento').map(x => `<option value="${esc(x)}">`).join('')}</datalist>`
        : '<p class="texto-suave">Elegí en qué destino dormís cada noche y acá aparece el alojamiento.</p>';
      if (R.direcciones) ca.querySelectorAll('[data-c="direccion"]').forEach(x => R.direcciones.enlazar(x, { cerca: R.direcciones.cercaDe(v, null) }));
    }
    pintar();

    const terminar = () => { location.hash = `#viaje/${v.id}/itinerario`; };
    app.querySelector('[data-a="omitir"]').onclick = () => { v.armado = true; R.db.guardarViaje(v); terminar(); };
    guardarActual = () => { guardarNoches(); return true; };
    app.querySelector('[data-a="listo"]').onclick = () => {
      guardarNoches();
      U.toast('¡Listo! Ahora sumá qué hacés cada día. 🧭');
      terminar();
    };
    function guardarNoches() {
      if (ns.length) {
        leerEscritos();
        const gs = grupos();
        const nuevos = gs.map(g => {
          const p = g.previo || {};
          const w = escritos[g.k] || {};
          return Object.assign({ checkin: '', checkout: '', codigo: '', nota: '' }, p, {
            id: p.id || U.id('al'), deArmado: true, destinoId: g.destinoId, ciudad: g.ciudad,
            nombre: (w.nombre || '').trim(), direccion: (w.direccion || '').trim(), desde: g.desde, hasta: g.hasta
          });
        });
        // Los alojamientos que ya no se usan se borran con su gasto (si tenían)
        const quedan = new Set(nuevos.map(a => a.id));
        deArmado.filter(a => !quedan.has(a.id)).forEach(a => A().borrarAlojamiento(v, a.id));
        v.alojamientos = (v.alojamientos || []).filter(a => !a.deArmado).concat(nuevos);
        v.noches = {};
        ns.forEach(f => { if (elegido[f] === 'viaje' || elegido[f] === 'casa') v.noches[f] = elegido[f]; });
      }
      v.armado = true;
      R.db.guardarViaje(v);
    }
  }

  return { nuevo, render, tramos, itemsDeTramos, noches, faltaHTML, cuantasFaltan, faltaTransporte, faltanNoches, faltanConexiones, tramoResuelto, lugarSegunTransporte };
})();
