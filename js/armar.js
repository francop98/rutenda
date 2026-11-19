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

  const MEDIOS = [['avion', '✈️', 'Avión'], ['micro', '🚌', 'Micro'], ['auto', '🚗', 'Auto'], ['tren', '🚆', 'Tren'], ['barco', '⛴️', 'Barco'], ['otro', '🚕', 'Otro']];
  const MEDIO_A_TIPO = { avion: 'vuelo', micro: 'micro', auto: 'auto', tren: 'tren', barco: 'barco', otro: 'traslado' };
  const TIPO_A_MEDIO = { vuelo: 'avion', micro: 'micro', auto: 'auto', tren: 'tren', barco: 'barco', traslado: 'otro' };

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
    const sumar = (a, b, enElDia) => {
      const k = `${a.id}>${b.id}`;
      cuenta[k] = (cuenta[k] || 0) + 1;
      r.push({ clave: `${k}#${cuenta[k]}`, desde: a, hasta: b, enElDia: !!enElDia, vuelta: b.id === 'o' });
    };
    destinosDe(v).forEach(d => {
      if (d.soloDia) { sumar(prev, d, true); sumar(d, prev, true); } else { sumar(prev, d); prev = d; }
    });
    if (prev !== o) sumar(prev, o);
    return r;
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
  function faltaTransporte(v) { return itemsDeTramos(v).filter(x => !x.it || !x.it.fecha).length; }
  function faltanNoches(v) { return noches(v).filter(f => !alojDe(v, f) && !(v.noches || {})[f]).length; }
  /** Cuántas cosas de armado quedan (para la pestaña Pendientes). */
  function cuantasFaltan(v) { return v.armado ? (faltaTransporte(v) ? 1 : 0) + (faltanNoches(v) ? 1 : 0) : 0; }

  function faltaHTML(v) {
    if (!v.armado || !R.db.puedeOrganizar(v)) return '';
    const t = faltaTransporte(v), n = faltanNoches(v);
    if (!t && !n) return '';
    return `
      <div class="falta-armar">
        <strong>Para completar cuando quieras</strong>
        ${t ? `<a class="falta-fila" href="#armar/${v.id}/transporte"><span aria-hidden="true">🚌</span><span>Cómo vas de un lugar a otro<small>${U.plural(t, 'tramo sin fecha', 'tramos sin fecha')}</small></span><b>Completar</b></a>` : ''}
        ${n ? `<a class="falta-fila" href="#armar/${v.id}/noches"><span aria-hidden="true">🛏️</span><span>Dónde dormís<small>${U.plural(n, 'noche sin definir', 'noches sin definir')}</small></span><b>Completar</b></a>` : ''}
      </div>`;
  }

  /* ---------------------------------------------------------
     Páginas
     --------------------------------------------------------- */
  let pendienteNuevo = null;
  function nuevo(op) { pendienteNuevo = op || null; location.hash = '#nuevo'; }

  function render(app, vista, id, paso) {
    if (vista === 'nuevo') { document.title = 'Nuevo viaje · Rutenda'; pagDatos(app, null, pendienteNuevo || {}); pendienteNuevo = null; return; }
    const v = R.db.viaje(id);
    if (!v || !R.db.puedeOrganizar(v)) { location.hash = v ? `#viaje/${v.id}` : '#inicio'; return; }
    document.title = `${R.viajes.nombreDe(v)} · Rutenda`;
    if (paso === 'transporte') pagTransporte(app, v);
    else if (paso === 'noches') pagNoches(app, v);
    else pagDatos(app, v, {});
  }

  function pasosHTML(actual, v) {
    const lista = [['datos', '1', 'El viaje'], ['transporte', '2', 'Transporte'], ['noches', '3', 'Noches']];
    return `<ol class="armar-pasos">${lista.map(([id, n, t]) => {
      const link = v && id !== actual ? `href="#armar/${v.id}/${id}"` : '';
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
      viajeros: editando
        ? existente.participantes.filter(p => p !== R.db.yoEn(existente)).map(id => ({ id, nombre: (R.db.persona(id) || {}).nombre || 'Viajero' }))
        : []
    };
    if (!b.destinos.length) b.destinos.push({ id: U.id('dst'), nombre: '' });
    const campos = [];
    let campoOrigen = null;

    pagina(app, 'datos', existente, editando ? 'Editar el viaje' : 'Nuevo viaje', editando ? '' : 'Lo único obligatorio es a dónde vas. Transporte y alojamiento vienen después (y los podés dejar para más adelante).',
      '<div class="form-viaje"></div>',
      `${editando ? `<a class="btn btn-suave" href="#viaje/${existente.id}">Cancelar</a>` : '<a class="btn btn-suave" href="#inicio">Cancelar</a>'}
       <button type="button" class="btn btn-primario" data-a="guardar">${editando ? 'Guardar' : 'Siguiente: transporte →'}</button>`);
    const caja = app.querySelector('.form-viaje');

    function leer() {
      campos.forEach((c, i) => { if (b.destinos[i]) Object.assign(b.destinos[i], c.obtener(), { id: b.destinos[i].id, soloDia: b.destinos[i].soloDia }); });
      if (campoOrigen) b.origen = campoOrigen.obtener();
      const q = s => caja.querySelector(s);
      b.fechaInicio = q('#fvIda').value; b.fechaFin = q('#fvVuelta').value;
      b.nombre = q('#fvNombre').value.trim(); b.monedaBase = q('#fvMoneda').value;
      caja.querySelectorAll('[data-en-el-dia]').forEach(x => { const d = b.destinos[Number(x.dataset.enElDia)]; if (d) d.soloDia = x.checked; });
    }

    function pintar() {
      const conocidos = R.db.personas().filter(p => !p.esYo && !b.viajeros.some(x => normal(x.nombre) === normal(p.nombre)));
      caja.innerHTML = `
        <label class="campo"><span>Nombre del viaje <small>(opcional)</small></span><input id="fvNombre" value="${esc(b.nombre)}" placeholder="${esc(b.destinos.filter(d => d.nombre && !d.soloDia).map(d => d.nombre).join(' → ') || 'Ej: Vacaciones de verano')}" maxlength="60"></label>
        <div class="campo"><span>Salís desde</span><div id="fvOrigen"></div></div>
        <div class="campo"><span>¿A dónde vas? <small>(en orden, solo la ida: la vuelta se arma sola)</small></span>
          <ol class="fv-destinos">${b.destinos.map((d, i) => `
            <li class="fv-destino">
              <span class="fv-num">${i + 1}</span>
              <div class="fv-destino-campos">
                <div data-lugar="${i}"></div>
                <div class="fv-destino-pie">
                  <label class="check check-chico"><input type="checkbox" data-en-el-dia="${i}" ${d.soloDia ? 'checked' : ''}> Voy y vuelvo en el día</label>
                  ${i > 0 ? `<button type="button" class="btn-icono" data-subir="${i}" aria-label="Subir" title="Subir">↑</button>` : ''}
                  ${b.destinos.length > 1 ? `<button type="button" class="btn-icono" data-quitar-destino="${i}" aria-label="Quitar" title="Quitar">×</button>` : ''}
                </div>
              </div>
            </li>`).join('')}
          </ol>
          <button type="button" class="btn btn-suave btn-chico" data-a="otroDestino">+ Otro destino</button>
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
        <label class="campo"><span>Moneda de los gastos</span><select id="fvMoneda">${U.opcionesMoneda(b.monedaBase)}</select></label>`;
      campos.length = 0;
      const usadas = R.lugares.recientes();
      caja.querySelectorAll('[data-lugar]').forEach(c => {
        const i = Number(c.dataset.lugar);
        campos[i] = R.lugares.campo(c, { valor: b.destinos[i], placeholder: 'Ciudad o lugar', sugeridos: b.destinos[i].nombre ? [] : usadas });
      });
      campoOrigen = R.lugares.campo(caja.querySelector('#fvOrigen'), { valor: b.origen, placeholder: 'Tu ciudad', sugeridos: usadas });
      caja.querySelector('[data-a="otroDestino"]').onclick = () => {
        leer(); b.destinos.push({ id: U.id('dst'), nombre: '' }); pintar();
        const ins = caja.querySelectorAll('.fv-destino .lugar-input'); ins[ins.length - 1].focus();
      };
      caja.querySelectorAll('[data-quitar-destino]').forEach(x => x.onclick = () => { leer(); b.destinos.splice(Number(x.dataset.quitarDestino), 1); pintar(); });
      caja.querySelectorAll('[data-subir]').forEach(x => x.onclick = () => { leer(); const i = Number(x.dataset.subir); const [d] = b.destinos.splice(i, 1); b.destinos.splice(i - 1, 0, d); pintar(); });
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
      if (!editando && !b.destinos[0].nombre) setTimeout(() => { const i = caja.querySelector('.fv-destino .lugar-input'); if (i) i.focus(); }, 80);
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

    app.querySelector('[data-a="guardar"]').onclick = () => {
      leer();
      const destinos = b.destinos.filter(d => d.nombre);
      if (!destinos.length) { U.toast('¿A dónde vas? Escribí al menos un destino.'); return; }
      if (!b.origen || !b.origen.nombre) { U.toast('¿Desde dónde salís? Así se arma la vuelta.'); return; }
      if (b.fechaFin && b.fechaInicio && b.fechaFin < b.fechaInicio) { U.toast('La vuelta tiene que ser después de la ida.'); return; }
      if (b.fechaFin && !b.fechaInicio) { U.toast('Poné también la fecha de ida.'); return; }
      // Cada escapada de un día sale del lugar anterior
      let base = '';
      destinos.forEach(d => { if (d.soloDia) d.base = base; else { delete d.base; base = d.id; } });
      const datos = { nombre: b.nombre, origen: b.origen, destinos, fechaInicio: b.fechaInicio, fechaFin: b.fechaFin || b.fechaInicio, monedaBase: b.monedaBase };
      R.db.guardarPrefs({ ciudadOrigen: Object.assign({}, b.origen) });
      if (editando) {
        const v = R.db.viaje(existente.id);
        let lista = participantes();
        const conGastos = v.participantes.filter(p => !lista.includes(p) && R.gastos.personaTieneMovimientos(v, p));
        if (conGastos.length) { U.toast(`${(R.db.persona(conGastos[0]) || {}).nombre || 'Alguien'} tiene gastos cargados: sigue en el viaje.`); lista = lista.concat(conGastos); }
        Object.assign(v, datos, { participantes: lista });
        R.db.guardarViaje(v);
        U.toast('Cambios guardados.');
        location.hash = `#viaje/${v.id}/itinerario`;
        return;
      }
      const v = Object.assign({
        id: U.id('via'), v2: 26, armado: true, creado: new Date().toISOString(),
        agenda: [], alojamientos: [], pendientes: [], noches: {}, valijas: { comun: { items: [] } },
        tareas: {}, tareasPropias: [], itinerario: [], documentos: [], movimientos: [], cambios: []
      }, datos, { participantes: participantes() });
      R.db.guardarViaje(v);
      location.hash = `#armar/${v.id}/transporte`;
    };
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
        fechaLlega: it ? it.fechaLlegada || it.fecha || '' : '',
        horaLlega: it ? it.horaLlegada || '' : ''
      };
    });
    const etiqueta = x => x.t.vuelta ? 'Vuelta' : x.t.enElDia ? (x.t.hasta.soloDia ? 'Escapada de un día · ida' : 'Escapada de un día · vuelta') : 'Ida';
    const cuerpo = `
      <div class="campo"><span>¿Todo el viaje en el mismo medio?</span>
        <div class="chips-elegir chips-chicos">${MEDIOS.map(([k, ic, n]) => `<button type="button" class="chip-op" data-todos="${k}">${ic} ${n}</button>`).join('')}</div>
      </div>
      <div class="tramos">${lista.map((x, i) => `
        <div class="tramo" data-i="${i}">
          <div class="tramo-cab"><span class="tramo-num">${i + 1}</span><div><strong>${esc(x.t.desde.nombre)} → ${esc(x.t.hasta.nombre)}</strong><small>${etiqueta(x)}</small></div></div>
          <div class="chips-elegir chips-chicos tramo-medios">${MEDIOS.map(([k, ic, n]) => `<button type="button" class="chip-op ${x.medio === k ? 'activo' : ''}" data-medio="${k}">${ic} ${n}</button>`).join('')}</div>
          <div class="tramo-horas">
            <span>Sale</span><input type="date" data-f="fecha" value="${esc(x.fecha)}" aria-label="Día que sale"><input type="time" data-f="hora" value="${esc(x.hora)}" aria-label="Hora que sale">
            <span>Llega</span><input type="date" data-f="fechaLlega" value="${esc(x.fechaLlega)}" aria-label="Día que llega"><input type="time" data-f="horaLlega" value="${esc(x.horaLlega)}" aria-label="Hora que llega">
          </div>
        </div>`).join('')}</div>
      <p class="ayuda">Si todavía no sabés algo, dejalo vacío: queda para completar. Empresa, número y código de reserva se suman después, tocando el tramo en el itinerario.</p>`;
    pagina(app, 'transporte', v, 'Cómo vas de un lugar a otro', 'Cada tramo del recorrido, con la vuelta incluida.', cuerpo,
      `<button type="button" class="btn btn-suave" data-a="omitir">Omitir por ahora</button>
       <button type="button" class="btn btn-primario" data-a="seguir">${noches(v).length ? 'Siguiente: noches →' : 'Listo'}</button>`);

    const leer = () => app.querySelectorAll('.tramo').forEach(el => {
      const x = lista[Number(el.dataset.i)];
      el.querySelectorAll('[data-f]').forEach(inp => { x[inp.dataset.f] = inp.value; });
    });
    const marcar = el => el.querySelectorAll('[data-medio]').forEach(b => b.classList.toggle('activo', b.dataset.medio === lista[Number(el.dataset.i)].medio));
    app.querySelectorAll('.tramo').forEach(el => {
      const x = lista[Number(el.dataset.i)];
      el.querySelectorAll('[data-medio]').forEach(b => b.onclick = () => { x.medio = x.medio === b.dataset.medio ? '' : b.dataset.medio; marcar(el); });
      const f = el.querySelector('[data-f="fecha"]'), fl = el.querySelector('[data-f="fechaLlega"]');
      f.addEventListener('change', () => {
        if (!fl.value || fl.value < f.value) fl.value = f.value;
        // La escapada de un día: la vuelta es el mismo día
        const par = x.t.enElDia ? lista[Number(el.dataset.i) + (x.t.hasta.soloDia ? 1 : -1)] : null;
        if (par && !par.fecha) {
          const otro = app.querySelector(`.tramo[data-i="${lista.indexOf(par)}"]`);
          otro.querySelector('[data-f="fecha"]').value = f.value; otro.querySelector('[data-f="fechaLlega"]').value = f.value;
        }
      });
    });
    app.querySelectorAll('[data-todos]').forEach(b => b.onclick = () => {
      lista.forEach(x => { x.medio = b.dataset.todos; });
      app.querySelectorAll('.tramo').forEach(marcar);
      app.querySelectorAll('[data-todos]').forEach(y => y.classList.toggle('activo', y === b));
    });

    const siguiente = () => { location.hash = noches(v).length ? `#armar/${v.id}/noches` : `#viaje/${v.id}/itinerario`; };
    app.querySelector('[data-a="omitir"]').onclick = () => { v.armado = true; R.db.guardarViaje(v); siguiente(); };
    app.querySelector('[data-a="seguir"]').onclick = () => {
      leer();
      lista.forEach(x => {
        if (!x.medio && !x.fecha && !x.it) return;
        const it = x.it ? Object.assign({}, x.it) : A().nuevoItem({});
        const medio = x.medio || (x.it ? TIPO_A_MEDIO[x.it.tipo] : '') || 'otro';
        Object.assign(it, {
          tramo: x.t.clave, tipo: MEDIO_A_TIPO[medio], desde: x.t.desde.nombre, hasta: x.t.hasta.nombre,
          titulo: `${x.t.desde.nombre} → ${x.t.hasta.nombre}`, fecha: x.fecha, hora: x.hora,
          fechaLlegada: x.fechaLlega && x.fechaLlega !== x.fecha ? x.fechaLlega : '', horaLlegada: x.horaLlega
        });
        A().guardarItem(v, it);
      });
      v.armado = true;
      R.db.guardarViaje(v);
      siguiente();
    };
  }

  /* ---------- 3. Noches ---------- */
  /** Dónde te deja el transporte cada noche, según lo que cargaste. */
  function lugarSegunTransporte(v, f) {
    const tr = itemsDeTramos(v).filter(x => x.it && x.it.fecha).map(x => ({ t: x.t, it: x.it, llega: x.it.fechaLlegada || x.it.fecha }));
    const enCamino = tr.find(x => x.it.fecha <= f && x.llega > f);
    if (enCamino) {
      const madrugada = x => x.llega === U.sumarDias(f, 1) && x.it.horaLlegada && x.it.horaLlegada < '09:00';
      return { viaje: true, pregunta: madrugada(enCamino), tramo: enCamino };
    }
    const llegados = tr.filter(x => x.llega <= f).sort((a, b) => (a.llega + (a.it.horaLlegada || '')).localeCompare(b.llega + (b.it.horaLlegada || '')));
    const ult = llegados[llegados.length - 1];
    if (ult) return { lugar: ult.t.hasta };
    const quedas = destinosDe(v).filter(d => !d.soloDia);
    return quedas.length === 1 ? { lugar: quedas[0] } : {};
  }

  function pagNoches(app, v) {
    const ns = noches(v);
    const quedas = destinosDe(v).filter(d => !d.soloDia);
    const manuales = (v.alojamientos || []).filter(a => !a.deArmado);
    const deArmado = (v.alojamientos || []).filter(a => a.deArmado);
    const elegido = {}, notas = {};
    ns.forEach(f => {
      const a = alojDe(v, f);
      const s = lugarSegunTransporte(v, f);
      if (s.pregunta) notas[f] = `Salís el ${U.fmtFecha(s.tramo.it.fecha, 'dia')}${s.tramo.it.hora ? ' a las ' + s.tramo.it.hora : ''} y llegás a ${s.tramo.t.hasta.nombre} a las ${s.tramo.it.horaLlegada}: ¿esa noche la pasás viajando o ya tenés alojamiento allá?`;
      if (a && !a.deArmado) elegido[f] = 'aloj:' + a.id;
      else if (a && a.deArmado && a.destinoId) elegido[f] = 'lugar:' + a.destinoId;
      else if ((v.noches || {})[f]) elegido[f] = v.noches[f];
      else if (s.pregunta) elegido[f] = '';
      else if (s.viaje) elegido[f] = 'viaje';
      else if (s.lugar && s.lugar.id === 'o') elegido[f] = 'casa';
      else if (s.lugar && !s.lugar.soloDia) elegido[f] = 'lugar:' + s.lugar.id;
      else elegido[f] = '';
    });
    // Datos que ya cargaste en cada alojamiento, para no perderlos al reagrupar
    const datosAloj = {};
    deArmado.forEach(a => { (datosAloj[a.destinoId] = datosAloj[a.destinoId] || []).push(a); });
    const escritos = {};

    const opciones = f => {
      const s = lugarSegunTransporte(v, f);
      const ops = quedas.map(d => [`lugar:${d.id}`, `🛏️ En ${d.nombre}`]);
      manuales.forEach(a => ops.push([`aloj:${a.id}`, `🛏️ ${A().nombreAlojamiento(a)}`]));
      ops.push(['viaje', s.viaje && s.tramo ? `🚌 Viajando (${s.tramo.t.desde.nombre} → ${s.tramo.t.hasta.nombre})` : '🚌 Viajando']);
      ops.push(['casa', '🏠 En casa']);
      return `<option value="">Sin definir</option>${ops.map(([k, t]) => `<option value="${k}" ${elegido[f] === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}`;
    };

    /** Noches seguidas en el mismo destino = un alojamiento. */
    function grupos() {
      const r = [];
      ns.forEach(f => {
        const e = elegido[f] || '';
        if (!e.startsWith('lugar:')) return;
        const ult = r[r.length - 1];
        if (ult && ult.clave === e && U.sumarDias(ult.hasta, 0) === f) ult.hasta = U.sumarDias(f, 1);
        else r.push({ clave: e, destinoId: e.slice(6), desde: f, hasta: U.sumarDias(f, 1) });
      });
      const usados = {};
      r.forEach(g => {
        const d = quedas.find(x => x.id === g.destinoId) || {};
        g.ciudad = d.nombre || '';
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
      cn.innerHTML = ns.map(f => `
        <div class="noche ${notas[f] && !elegido[f] ? 'pregunta' : ''}">
          <span class="noche-fecha">${esc(U.fmtFecha(f, 'dia'))}</span>
          <select data-noche="${f}" aria-label="Noche del ${esc(U.fmtFecha(f, 'dia'))}">${opciones(f)}</select>
          ${notas[f] ? `<small class="noche-nota">${esc(notas[f])}</small>` : ''}
        </div>`).join('');
      cn.querySelectorAll('[data-noche]').forEach(s => s.onchange = () => { leerEscritos(); elegido[s.dataset.noche] = s.value; pintar(); });
      const gs = grupos();
      const ca = app.querySelector('.alojs');
      ca.innerHTML = gs.length ? gs.map(g => {
        const w = escritos[g.k] || {};
        const p = g.previo || {};
        const n = U.diasEntre(g.desde, g.hasta);
        return `
          <div class="aloj-armar" data-g="${g.k}">
            <strong>🛏️ ${esc(g.ciudad)}</strong><small>${U.plural(n, 'noche', 'noches')} · entrás el ${esc(U.fmtFecha(g.desde, 'dia'))}, salís el ${esc(U.fmtFecha(g.hasta, 'dia'))}</small>
            <label class="campo"><span>Nombre <small>(opcional)</small></span><input data-c="nombre" value="${esc(w.nombre != null ? w.nombre : p.nombre || '')}" placeholder="Ej: Hotel Patagonia, depto de Airbnb" list="dlAlojArmar"></label>
            <label class="campo"><span>Dirección <small>(opcional)</small></span><input data-c="direccion" value="${esc(w.direccion != null ? w.direccion : p.direccion || '')}" placeholder="Escribí el hotel o la calle"></label>
          </div>`;
      }).join('') + `<datalist id="dlAlojArmar">${A().usados('alojamiento').map(x => `<option value="${esc(x)}">`).join('')}</datalist>`
        : '<p class="texto-suave">Elegí en qué destino dormís cada noche y acá aparece el alojamiento.</p>';
      if (R.direcciones) ca.querySelectorAll('[data-c="direccion"]').forEach(x => R.direcciones.enlazar(x, { cerca: R.direcciones.cercaDe(v, null) }));
    }
    pintar();

    const terminar = () => { location.hash = `#viaje/${v.id}/itinerario`; };
    app.querySelector('[data-a="omitir"]').onclick = () => { v.armado = true; R.db.guardarViaje(v); terminar(); };
    app.querySelector('[data-a="listo"]').onclick = () => {
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
      U.toast('¡Listo! Ahora sumá qué hacés cada día. 🧭');
      terminar();
    };
  }

  return { nuevo, render, tramos, itemsDeTramos, noches, faltaHTML, cuantasFaltan, faltaTransporte, faltanNoches };
})();
