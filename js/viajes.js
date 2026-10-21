/* =========================================================
   Rutenda — viajes
   Asistente de creación/edición (multidestino, país automático,
   salida del país, situaciones especiales, lo ya resuelto y
   viajeros), portada personalizada, pestañas y tarjetas.
   ========================================================= */
window.R = window.R || {};

R.viajes = (function () {
  const U = R.util;
  const { esc } = U;

  const TIPOS = [
    { id: 'vacaciones', nombre: 'Vacaciones', icono: '🏖️' },
    { id: 'escapada', nombre: 'Escapada', icono: '🌿' },
    { id: 'aventura', nombre: 'Aventura', icono: '🥾' },
    { id: 'familia', nombre: 'Visita familiar', icono: '🏠' },
    { id: 'trabajo', nombre: 'Trabajo', icono: '💼' },
    { id: 'otro', nombre: 'Otro', icono: '✳️' }
  ];
  function tipoDe(v) {
    const t = TIPOS.find(x => x.id === v.tipo) || TIPOS[0];
    return t.id === 'otro' && v.tipoOtro ? Object.assign({}, t, { nombre: v.tipoOtro }) : t;
  }
  /** Etiqueta de cómo se mueve el viaje (combinado si usa varios medios). */
  function etiquetaTransporte(v) {
    const medios = [];
    (v.recorrido || []).forEach(t => t.segmentos.forEach(s => { if (!medios.includes(s.medio)) medios.push(s.medio); }));
    if (!medios.length) return '';
    const M = R.recorrido.MEDIOS;
    if (medios.length > 1) return medios.map(m => (M[m] || M.otro).icono).join(' ') + ' Combinado';
    return `${(M[medios[0]] || M.otro).icono} ${(M[medios[0]] || M.otro).nombre}`;
  }

  // Cada opción suma pasos concretos a la guía (no es solo informativo)
  const EXTRAS = [
    { id: 'alquilaAuto', icono: '🚗', texto: 'Voy a alquilar auto', suma: 'Alquilar el auto y, si salís del país, revisar la licencia' },
    { id: 'menores', icono: '🧒', texto: 'Viajan menores de edad', suma: 'Autorización de viaje para menores' },
    { id: 'viajaConMascota', icono: '🐕', texto: 'Viajo con mi mascota', suma: 'Requisitos para viajar con tu mascota' },
    { id: 'mascotas', icono: '🏠', texto: 'Dejo mascotas en casa', suma: 'Organizar quién las cuida' },
    { id: 'accesibilidad', icono: '♿', texto: 'Alguien necesita asistencia o accesibilidad', suma: 'Pedir asistencia en el transporte y el alojamiento' },
    { id: 'equipamiento', icono: '🎿', texto: 'Deportes o actividades con equipo (ski, buceo, bici…)', suma: 'Reservar equipo y clases' },
    { id: 'eventoEspecial', icono: '🎉', texto: 'Hay un evento especial (cumpleaños, aniversario…)', suma: 'Organizar el momento especial' },
    { id: 'trabajo', icono: '💼', texto: 'Es un viaje de trabajo', suma: 'Rendir los gastos al volver' }
  ];
  const extraActivo = (b, id) => id === 'trabajo' ? b.tipo === 'trabajo' : !!b.perfil[id];

  const PESTANAS = [
    { id: 'guia', nombre: 'Guía', icono: '🧭' },
    { id: 'itinerario', nombre: 'Itinerario', icono: '🗓️' },
    { id: 'documentos', nombre: 'Documentos', icono: '📁' },
    { id: 'valija', nombre: 'Valija', icono: '🧳' },
    { id: 'viajeros', nombre: 'Viajeros', icono: '👥' },
    { id: 'gastos', nombre: 'Gastos', icono: '💸' }
  ];

  /* ---------- Ayudas de destinos ---------- */
  const conAlojamiento = v => (v.destinos || []).filter(d => !d.soloDia && d.nombre);
  const escapadas = v => (v.destinos || []).filter(d => d.soloDia && d.nombre);
  const normal = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

  function destinoCompleto(v) {
    const lista = conAlojamiento(v);
    const extra = escapadas(v).map(d => d.nombre);
    let txt;
    if (lista.length > 1) txt = lista.map(d => d.nombre).join(' → ');
    else if (lista.length === 1) txt = lista[0].pais ? `${lista[0].nombre}, ${lista[0].pais}` : lista[0].nombre;
    else txt = v.destino || '';
    if (extra.length) txt += ` (+ ${extra.join(', ')})`;
    return txt;
  }

  /** ¿Algún destino está en otro país que el origen? */
  function deteccionInternacional(origen, destinos) {
    const o = origen || {};
    const claveO = o.codigoPais || normal(o.pais);
    if (!claveO) return { estado: 'desconocido', paises: [] };
    const fuera = [];
    (destinos || []).forEach(d => {
      const claveD = d.codigoPais ? d.codigoPais : normal(d.pais);
      if (!claveD) return;
      const distinto = o.codigoPais && d.codigoPais ? d.codigoPais !== o.codigoPais : normal(d.pais) !== normal(o.pais);
      if (distinto && !fuera.some(f => f.pais === d.pais)) fuera.push({ pais: d.pais, codigoPais: d.codigoPais });
    });
    const conPais = (destinos || []).filter(d => d.codigoPais || d.pais).length;
    if (fuera.length) return { estado: 'si', paises: fuera };
    return { estado: conPais ? 'no' : 'desconocido', paises: [] };
  }

  /** Fechas del viaje y de cada destino: se derivan del cronograma. */
  function recalcularTramos(v) { R.recorrido.recalcular(v); }

  function estadoViaje(v) {
    const hoy = U.hoyISO();
    if (v.fechaFin && v.fechaFin < hoy) return 'pasado';
    if (v.fechaInicio && v.fechaInicio <= hoy) return 'en_curso';
    return 'planificando';
  }

  function cuentaRegresiva(v) {
    const hoy = U.hoyISO();
    const est = estadoViaje(v);
    if (!v.fechaInicio) return 'Fechas a definir';
    if (est === 'pasado') {
      const d = U.diasEntre(v.fechaFin, hoy);
      return d === 0 ? 'Volviste hoy' : `Viaje realizado · hace ${U.plural(d, 'día', 'días')}`;
    }
    if (est === 'en_curso') {
      const dia = U.diasEntre(v.fechaInicio, hoy) + 1;
      const total = v.fechaFin ? U.diasEntre(v.fechaInicio, v.fechaFin) + 1 : null;
      return total ? `Día ${dia} de ${total} · ¡a disfrutar!` : `Día ${dia} de viaje`;
    }
    const faltan = U.diasEntre(hoy, v.fechaInicio);
    if (faltan === 0) return '¡Es hoy!';
    if (faltan === 1) return '¡Salís mañana!';
    return `Faltan ${faltan} días`;
  }

  /* ---------------------------------------------------------
     Asistente paso a paso (crear o editar)
     --------------------------------------------------------- */
  /** La ciudad desde donde salís siempre: la última que usaste (se puede cambiar). */
  function ciudadDeSiempre() {
    const pref = R.db.prefs().ciudadOrigen;
    if (pref && pref.nombre) return Object.assign({}, pref);
    const ultimo = R.db.viajes().slice().sort((a, b) => String(b.creado || '').localeCompare(String(a.creado || '')))[0];
    return ultimo && ultimo.origen && ultimo.origen.nombre ? Object.assign({}, ultimo.origen) : { nombre: '' };
  }

  function abrirAsistente(existente) {
    const editando = !!existente;
    const yo = R.db.yo();
    const nuevoDestino = soloDia => ({ id: U.id('dst'), nombre: '', region: '', pais: '', codigoPais: '', noches: '', soloDia: !!soloDia, fecha: '' });
    const b = existente ? JSON.parse(JSON.stringify({
      nombre: existente.nombre, origen: existente.origen, destinos: existente.destinos,
      fechaInicio: existente.fechaInicio, fechaFin: existente.fechaFin, tipo: existente.tipo,
      perfil: existente.perfil, presupuesto: existente.presupuesto || '', monedaBase: existente.monedaBase,
      recorrido: existente.recorrido || [], tipoOtro: existente.tipoOtro || ''
    })) : {
      recorrido: [], tipoOtro: '',
      nombre: '', origen: ciudadDeSiempre(), destinos: [nuevoDestino(false)],
      fechaInicio: '', fechaFin: '', tipo: 'vacaciones',
      perfil: { internacionalManual: null, transporte: 'avion' },
      presupuesto: '', monedaBase: R.db.prefs().monedaBase || 'ARS'
    };
    if (!b.destinos.length) b.destinos.push(nuevoDestino(false));
    b.sinFechas = editando ? !b.fechaInicio : false;
    // Conexión previa (si el viaje ya tenía una ciudad de conexión en la ida)
    const conexionPrevia = editando ? R.recorrido.conexionDe(b.recorrido) : null;
    b.conexion = conexionPrevia ? { lugar: conexionPrevia.lugar, medio: conexionPrevia.medio } : null;
    b.conexionAplicada = conexionPrevia ? conexionPrevia.lugar.nombre : '';
    b.extrasManuales = [];
    b.resuelto = {};
    b.paqueteIncluye = ['vuelos', 'alojamiento'];
    b.resueltoIds = [];

    b.viajeros = editando
      ? existente.participantes.filter(id => id !== R.db.yoEn(existente)).map(id => R.db.persona(id)).filter(Boolean).map(p => ({ id: p.id, nombre: p.nombre }))
      : [];

    const PASOS = editando
      ? ['Destinos', 'Cronograma', 'Detalles', 'Viajeros']
      : ['Destinos', 'Cronograma', 'Detalles', 'Lo resuelto', 'Viajeros'];
    let editorCronograma = null;
    let paso = 0;
    let camposLugar = { origen: null, destinos: [] };

    const { el } = U.modal({
      titulo: editando ? 'Editar viaje' : 'Nuevo viaje',
      subtitulo: editando ? 'Ajustá lo que haga falta.' : 'Unas preguntas y tu viaje empieza a tomar forma.',
      cuerpo: '<div class="asistente-paisaje" id="asPaisaje"></div><div id="asistente"></div>',
      ancho: true
    });
    const cont = el.querySelector('#asistente');
    const banda = el.querySelector('#asPaisaje');

    const nombrePaso = () => PASOS[paso];
    const internacional = () => {
      if (b.perfil.internacionalManual != null) return b.perfil.internacionalManual;
      return deteccionInternacional(b.origen, b.destinos.filter(d => d.nombre)).estado === 'si';
    };

    function pintarBanda() {
      const lista = b.destinos.filter(d => d.nombre && !d.soloDia).map(d => d.nombre);
      const primerSeg = b.recorrido && b.recorrido[0] && b.recorrido[0].segmentos[0];
      const temaBanda = lista.length ? R.paisaje.tema({ destinos: b.destinos, perfil: b.perfil, fechaInicio: primerSeg && primerSeg.sale.fecha }) : 'campo';
      banda.style.background = R.paisaje.fondo({ id: lista[0] || 'viaje' }, temaBanda);
      banda.innerHTML = `${R.paisaje.svg(null, { tema: temaBanda, transporte: b.recorrido && b.recorrido.length ? R.recorrido.medioPrincipal(b.recorrido) : 'avion', progreso: paso / (PASOS.length - 1) })}
        <span class="ap-texto">${esc(lista.length ? lista.join(' → ') : 'Tu próximo viaje')}</span>`;
    }

    function pintar() {
      pintarBanda();
      const ultimo = paso === PASOS.length - 1;
      cont.innerHTML = `
        <div class="pasos-asistente">${PASOS.map((p, i) =>
          `<span class="paso-a ${i === paso ? 'actual' : ''} ${i < paso ? 'listo' : ''}"><i>${i < paso ? '✓' : i + 1}</i>${p}</span>`).join('')}</div>
        <div class="paso-movil"><span>Paso ${paso + 1} de ${PASOS.length}</span><strong>${PASOS[paso]}</strong>
          <span class="pm-puntos">${PASOS.map((p, i) => `<i class="${i < paso ? 'listo' : i === paso ? 'actual' : ''}"></i>`).join('')}</span></div>
        <div class="asistente-cuerpo">${contenidoPaso()}</div>
        <div class="asistente-pie">
          <button type="button" class="btn btn-suave" data-a="atras" ${paso === 0 ? 'style="visibility:hidden"' : ''}>← Atrás</button>
          <button type="button" class="btn btn-primario" data-a="seguir">${ultimo ? (editando ? 'Guardar cambios' : 'Empezar a organizar ✨') : 'Siguiente →'}</button>
        </div>`;
      enlazarPaso();
      // Al pasar de paso, arrancar desde arriba
      if (paso !== pasoPintado) {
        pasoPintado = paso;
        const caja = cont.closest('.modal-cuerpo');
        if (caja) caja.scrollTop = 0;
        const modal = cont.closest('.modal');
        if (modal) modal.scrollTop = 0;
      }
    }
    let pasoPintado = -1;

    function contenidoPaso() {
      const n = nombrePaso();
      if (n === 'Destinos') return `
        <h4 class="titulo-paso">¿Desde dónde salís?</h4>
        ${b.origen && b.origen.nombre && b.origen.codigoPais && !b.cambiarOrigen ? `
          <div class="origen-fijo">
            <span>${R.lugares.bandera(b.origen.codigoPais) || '📍'} <strong>${esc(b.origen.nombre)}</strong><small>${esc([b.origen.region, b.origen.pais].filter(Boolean).join(', '))}</small></span>
            <button type="button" class="btn btn-texto btn-chico" data-a="cambiarOrigen">Cambiar</button>
          </div>
          <p class="ayuda">La ida y la vuelta se arman solas desde acá.</p>` : `
        <p class="ayuda">Tu ciudad. La guardo para los próximos viajes y la ida y la vuelta se arman solas desde acá.</p>
        <div id="lugarOrigen"></div>`}
        <h4 class="titulo-paso">¿A dónde vas?</h4>
        <p class="ayuda">Si es un viaje combinado, agregá cada destino en orden.</p>
        <div class="lista-destinos">${b.destinos.map((d, i) => `
          <div class="fila-destino ${d.soloDia ? 'escapada' : ''}">
            <span class="fd-num">${d.soloDia ? '☀️' : b.destinos.filter((x, j) => !x.soloDia && j <= i).length}</span>
            <div class="fd-campo">
              ${d.soloDia ? '<small class="fd-etiqueta">Escapada de un día</small>' : ''}
              <div data-lugar-destino="${i}"></div>
            </div>
            ${b.destinos.length > 1 ? `<button type="button" class="btn-icono" data-quitar-destino="${i}" title="Quitar">×</button>` : ''}
          </div>`).join('')}</div>
        <div class="acciones-fila">
          <button type="button" class="btn btn-suave btn-chico" data-a="masDestino">+ Agregar otro destino</button>
          <button type="button" class="btn btn-suave btn-chico" data-a="masEscapada">+ Escapada de un día</button>
        </div>
        <p class="ayuda">Una escapada de un día es un lugar que visitás y del que volvés en el día, sin dormir ahí (aunque sea en otro país).</p>
        <div id="avisoInter"></div>
        <label class="campo"><span>Nombre del viaje (opcional)</span><input id="aNombre" value="${esc(b.nombre)}" placeholder="Ej: Vacaciones de invierno"></label>`;

      if (n === 'Cronograma') {
        b.recorrido = R.recorrido.construir(b.origen, b.destinos, b.recorrido, 'avion');
        const nueva = b.conexion && b.conexion.lugar && b.conexion.lugar.nombre ? b.conexion.lugar.nombre : '';
        if (b.conexionAplicada && normal(b.conexionAplicada) !== normal(nueva)) R.recorrido.quitarConexion(b.recorrido, { nombre: b.conexionAplicada });
        if (nueva) R.recorrido.aplicarConexion(b.recorrido, b.conexion);
        b.conexionAplicada = nueva;
        return `
        <h4 class="titulo-paso">¿Cómo y cuándo viajás?</h4>
        <p class="ayuda">Para cada traslado indicá si es <strong>directo</strong> o <strong>con conexión</strong>, en qué viajás y cuándo salís. Las noches se calculan solas con las fechas (o escribilas y ajusto la salida). Si la ida tiene una conexión, la vuelta la repite.</p>
        <div id="editorCronograma"></div>`;
      }

      if (n === 'Detalles') {
        const det = deteccionInternacional(b.origen, b.destinos.filter(d => d.nombre));
        const inter = internacional();
        return `
        <h4 class="titulo-paso">¿Salís del país en algún momento del viaje?</h4>
        ${det.estado === 'si' ? `<p class="aviso-suave">🌎 Detectamos que salís del país: ${det.paises.map(p => `${R.lugares.bandera(p.codigoPais)} ${esc(p.pais)}`).join(', ')}.</p>`
          : det.estado === 'no' ? '<p class="aviso-suave">📍 Por los destinos que cargaste, no salís del país.</p>' : ''}
        <div class="segmentado">
          <button type="button" data-inter="no" class="${!inter ? 'activo' : ''}">No salgo del país</button>
          <button type="button" data-inter="si" class="${inter ? 'activo' : ''}">Sí, en algún momento salgo</button>
        </div>
        <p class="ayuda">Aunque sea por un día, cuenta: cambia la documentación y el seguro.</p>
        <h4 class="titulo-paso">¿Hay algo más a tener en cuenta?</h4>
        <p class="ayuda">Cada opción que marques suma pasos a tu guía.</p>
        <div class="extras-lista">${EXTRAS.map(x =>
          `<label class="extra-op ${extraActivo(b, x.id) ? 'activo' : ''}"><input type="checkbox" data-extra="${x.id}" ${extraActivo(b, x.id) ? 'checked' : ''}>
            <span class="eo-icono">${x.icono}</span><span><strong>${esc(x.texto)}</strong><small>Suma: ${esc(x.suma)}</small></span></label>`).join('')}</div>
        <div class="fila-agregar">
          <input id="aExtraManual" placeholder="Otra cosa que tengas que hacer">
          <button type="button" class="btn btn-suave" data-a="agregarExtra">Agregar</button>
        </div>
        ${b.extrasManuales.length ? `<div class="chips-personas">${b.extrasManuales.map((x, i) => `<span class="chip-persona chip-texto">📝 ${esc(x)} <button type="button" data-quitar-extra="${i}" aria-label="Quitar">×</button></span>`).join('')}</div>` : ''}
        <p class="ayuda">Cada cosa que agregues se suma a tu guía como un paso más.</p>`;
      }

      if (n === 'Lo resuelto') {
        const opciones = pasosResolubles();
        return `
        <h4 class="titulo-paso">¿Ya tenés algo resuelto?</h4>
        <p class="texto-suave">Así la guía se organiza en base a lo que falta. Después te pido los datos (horarios, códigos, costos y archivos) para que quede todo guardado.</p>
        <label class="opcion-paquete ${b.resuelto.paquete ? 'activo' : ''}">
          <input type="checkbox" data-resuelto="paquete" ${b.resuelto.paquete ? 'checked' : ''}>
          <span class="op-icono">📦</span>
          <span><strong>Compré un paquete</strong><small>Vuelo + hotel u otros servicios con una agencia</small></span>
        </label>
        ${b.resuelto.paquete ? `
          <div class="campo"><span>¿Qué incluye el paquete?</span>
            <div class="checks-grilla">${[['vuelos', 'Vuelos'], ['alojamiento', 'Alojamiento'], ['traslados', 'Traslados'], ['excursiones', 'Excursiones'], ['seguro', 'Seguro'], ['auto', 'Auto']].map(([k, t]) =>
              `<label class="chip-check ${b.paqueteIncluye.includes(k) ? 'activo' : ''}"><input type="checkbox" data-incluye="${k}" ${b.paqueteIncluye.includes(k) ? 'checked' : ''}> ${t}</label>`).join('')}</div>
          </div>` : ''}
        <div class="campo"><span>${b.resuelto.paquete ? 'Fuera del paquete, ¿resolviste algo más?' : '¿Qué resolviste por tu cuenta?'}</span>
          ${opciones.length ? R.guia.fases.filter(f => opciones.some(o => o.fase === f.id)).map(f => `
            <small class="grupo-resuelto">${f.icono} ${esc(f.nombre)}</small>
            <div class="checks-grilla">${opciones.filter(o => o.fase === f.id).map(o =>
              `<label class="chip-check ${b.resueltoIds.includes(o.id) ? 'activo' : ''}"><input type="checkbox" data-resuelto-id="${o.id}" ${b.resueltoIds.includes(o.id) ? 'checked' : ''}> ${esc(o.titulo)}</label>`).join('')}</div>`).join('')
          : '<p class="texto-suave">Con el paquete ya está cubierto todo lo que suele resolverse antes.</p>'}
        </div>`;
      }

      if (n === 'Viajeros') {
        const conocidos = R.db.personas().filter(p => !p.esYo && !b.viajeros.some(x => normal(x.nombre) === normal(p.nombre)));
        return `
        <h4 class="titulo-paso">¿Quiénes viajan?</h4>
        <div class="lista-viajeros-asistente">
          <span class="chip-persona fijo">${U.avatar(yo, 26)} ${esc(yo.nombre)} <small>(vos)</small></span>
          ${b.viajeros.map((p, i) => `<span class="chip-persona">${U.avatar({ id: p.id || p.nombre, nombre: p.nombre }, 26)} ${esc(p.nombre)} <button type="button" data-quitar-viajero="${i}" aria-label="Quitar">×</button></span>`).join('')}
        </div>
        <div class="fila-agregar">
          <input id="aNuevaPersona" list="aConocidos" placeholder="Nombre de quien viaja con vos">
          <datalist id="aConocidos">${conocidos.map(p => `<option value="${esc(p.nombre)}">`).join('')}</datalist>
          <button type="button" class="btn btn-suave" data-a="agregarPersona">Agregar</button>
        </div>
        <p class="ayuda">${b.viajeros.length ? '' : 'Si viajás solo/a, seguí de largo. '}Si alguien ya viajó con vos, al escribir su nombre te lo sugerimos para que quede en su historial.</p>`;
      }

      return '';
    }

    function leerPaso() {
      const v = id => { const x = cont.querySelector('#' + id); return x ? x.value.trim() : ''; };
      const n = nombrePaso();
      if (n === 'Destinos') {
        if (camposLugar.origen) b.origen = camposLugar.origen.obtener();
        if (b.conexion && camposLugar.conexion) b.conexion.lugar = camposLugar.conexion.obtener();
        camposLugar.destinos.forEach((c, i) => { if (c && b.destinos[i]) Object.assign(b.destinos[i], c.obtener()); });
        b.nombre = v('aNombre');
      }
      if (n === 'Detalles') {
        cont.querySelectorAll('[data-extra]').forEach(x => {
          if (x.dataset.extra === 'trabajo') { if (x.checked) b.tipo = 'trabajo'; else if (b.tipo === 'trabajo') b.tipo = 'vacaciones'; }
          else b.perfil[x.dataset.extra] = x.checked;
        });
      }
      if (n === 'Lo resuelto') {
        cont.querySelectorAll('[data-resuelto]').forEach(x => { b.resuelto[x.dataset.resuelto] = x.checked; });
        const ids = cont.querySelectorAll('[data-resuelto-id]');
        if (ids.length) b.resueltoIds = Array.from(ids).filter(x => x.checked).map(x => x.dataset.resueltoId);
        const inc = cont.querySelectorAll('[data-incluye]');
        if (inc.length) b.paqueteIncluye = Array.from(inc).filter(x => x.checked).map(x => x.dataset.incluye);
      }
    }

    function validar() {
      const n = nombrePaso();
      if (n === 'Destinos') {
        b.destinos = b.destinos.filter((d, i) => d.nombre || i === 0);
        if (!b.destinos.some(d => d.nombre && !d.soloDia)) return 'Contanos a dónde vas (al menos un destino donde te quedes).';
      }
      if (n === 'Cronograma' && !b.sinFechas) {
        const v = { recorrido: b.recorrido, destinos: b.destinos, tareas: {} };
        const errores = R.recorrido.validar(v).filter(a => a.nivel === 'error');
        if (errores.length) return errores[0].texto;
        const segs = R.recorrido.todosLosSegmentos(b.recorrido);
        if (segs.length && !segs[0].seg.sale.fecha) return 'Cargá al menos la fecha de salida (o marcá que todavía no tenés fechas).';
      }
      return null;
    }

    function enlazarPaso() {
      const n = nombrePaso();
      cont.querySelector('[data-a="atras"]').onclick = () => { leerPaso(); paso = Math.max(0, paso - 1); pintar(); };
      cont.querySelector('[data-a="seguir"]').onclick = () => {
        leerPaso();
        const error = validar();
        if (error) { U.toast(error); return; }
        if (paso < PASOS.length - 1) { paso++; pintar(); } else finalizar();
      };

      if (n === 'Destinos') {
        const avisar = () => {
          const caja = cont.querySelector('#avisoInter');
          if (!caja) return;
          const origen = camposLugar.origen ? camposLugar.origen.obtener() : b.origen;
          const dests = camposLugar.destinos.map(c => c.obtener()).filter(d => d.nombre);
          const det = deteccionInternacional(origen, dests);
          caja.innerHTML = det.estado === 'si'
            ? `<p class="aviso-suave">🌎 Salís del país: ${det.paises.map(p => `${R.lugares.bandera(p.codigoPais)} ${esc(p.pais)}`).join(', ')}. Vamos a sumar documentación y seguro a la guía.</p>` : '';
        };
        const usadas = R.lugares.recientes();
        camposLugar.origen = cont.querySelector('#lugarOrigen') ? R.lugares.campo(cont.querySelector('#lugarOrigen'), { valor: b.origen, placeholder: 'Tu ciudad de salida', alCambiar: avisar, sugeridos: usadas }) : null;
        const bOrigen = cont.querySelector('[data-a="cambiarOrigen"]');
        if (bOrigen) bOrigen.onclick = () => { leerPaso(); b.cambiarOrigen = true; pintar(); const i = cont.querySelector('#lugarOrigen .lugar-input'); if (i) { i.focus(); i.select(); } };
        camposLugar.destinos = b.destinos.map((d, i) => R.lugares.campo(cont.querySelector(`[data-lugar-destino="${i}"]`), {
          valor: d, placeholder: d.soloDia ? 'Lugar que visitás en el día' : 'Ej: Roma, Cusco, Nueva York',
          sugeridos: usadas.filter(u => normal(u.nombre) !== normal(b.origen && b.origen.nombre)),
          alCambiar: () => { avisar(); }
        }));
        avisar();
        cont.querySelector('[data-a="masDestino"]').onclick = () => { leerPaso(); b.destinos.push(nuevoDestino(false)); pintar(); };
        cont.querySelector('[data-a="masEscapada"]').onclick = () => { leerPaso(); b.destinos.push(nuevoDestino(true)); pintar(); };
        cont.querySelectorAll('[data-quitar-destino]').forEach(x => x.onclick = () => { leerPaso(); b.destinos.splice(Number(x.dataset.quitarDestino), 1); pintar(); });
      }

      if (n === 'Cronograma') {
        editorCronograma = R.cronogramaEditor.montar(cont.querySelector('#editorCronograma'), b, { permitirSinFechas: true });
      }

      if (n === 'Detalles') {
        cont.querySelectorAll('[data-inter]').forEach(x => x.onclick = () => { leerPaso(); b.perfil.internacionalManual = x.dataset.inter === 'si'; pintar(); });
        cont.querySelectorAll('[data-extra]').forEach(x => x.onchange = () => x.closest('.extra-op').classList.toggle('activo', x.checked));
        const input = cont.querySelector('#aExtraManual');
        const agregar = () => { const t = input.value.trim(); if (!t) return; leerPaso(); b.extrasManuales.push(t); pintar(); cont.querySelector('#aExtraManual').focus(); };
        cont.querySelector('[data-a="agregarExtra"]').onclick = agregar;
        input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } };
        cont.querySelectorAll('[data-quitar-extra]').forEach(x => x.onclick = () => { leerPaso(); b.extrasManuales.splice(Number(x.dataset.quitarExtra), 1); pintar(); });
      }

      if (n === 'Lo resuelto') {
        cont.querySelectorAll('[data-resuelto], [data-incluye]').forEach(x => x.onchange = () => { leerPaso(); pintar(); });
        cont.querySelectorAll('[data-resuelto-id]').forEach(x => x.onchange = () => x.closest('.chip-check').classList.toggle('activo', x.checked));
      }

      if (n === 'Viajeros') {
        const input = cont.querySelector('#aNuevaPersona');
        const agregar = () => {
          const nombre = input.value.trim();
          if (!nombre) return;
          if (normal(nombre) === normal(yo.nombre)) { U.toast('Vos ya estás en el viaje 🙂'); return; }
          if (b.viajeros.some(p => normal(p.nombre) === normal(nombre))) { U.toast('Ya está en la lista.'); return; }
          const conocido = R.db.personas().find(p => !p.esYo && normal(p.nombre) === normal(nombre));
          b.viajeros.push(conocido ? { id: conocido.id, nombre: conocido.nombre } : { nombre });
          pintar();
          cont.querySelector('#aNuevaPersona').focus();
        };
        cont.querySelector('[data-a="agregarPersona"]').onclick = agregar;
        input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } };
        cont.querySelectorAll('[data-quitar-viajero]').forEach(x => x.onclick = () => { b.viajeros.splice(Number(x.dataset.quitarViajero), 1); pintar(); });
      }
    }

    /** Pasos de la guía que se pueden tener resueltos de antemano (según este viaje). */
    function pasosResolubles() {
      const temp = Object.assign({ tareas: {}, tareasPropias: [], participantes: [R.db.yo().id], personas: {}, itinerario: [], documentos: [], movimientos: [], cambios: [], valijas: {} }, datosDelViaje());
      recalcularTramos(temp);
      const incluye = b.resuelto.paquete ? b.paqueteIncluye : [];
      // Lo que tiene ventana (como el check-in) no se puede tener resuelto de antemano
      return R.motor.lista(temp).filter(t => !t.rec && !t.ventanaDias && t.fase !== 'definir' && t.base !== 'pq_paquete' && !R.formularios.incluidoEnPaquete(t, incluye));
    }

    /** Convierte los viajeros del asistente en personas guardadas (sin duplicar). */
    function resolverViajeros() {
      const yoId = editando ? R.db.yoEn(existente) : R.db.yo().id;
      return [yoId].concat(b.viajeros.map(p => {
        if (p.id && R.db.persona(p.id)) return p.id;
        const conocido = R.db.personas().find(x => !x.esYo && normal(x.nombre) === normal(p.nombre));
        return conocido ? conocido.id : R.db.crearPersona(p.nombre).id;
      }));
    }

    function datosDelViaje() {
      const destinos = b.destinos.filter(d => d.nombre).map(d => Object.assign({}, d));
      const perfil = Object.assign({}, b.perfil);
      perfil.internacional = internacional();
      const recorrido = R.recorrido.construir(b.origen, destinos, b.recorrido, 'avion');
      if (b.sinFechas) {
        // Sin fechas: todo queda "a definir" (los medios y paradas se conservan)
        R.recorrido.todosLosSegmentos(recorrido).forEach(x => {
          x.seg.sale = { fecha: '', hora: '' }; x.seg.llega = { fecha: '', hora: '' };
          if (x.seg.estado !== 'confirmado') x.seg.estado = 'a_definir';
        });
      }
      perfil.transporte = R.recorrido.medioPrincipal(recorrido);
      return {
        nombre: b.nombre, origen: b.origen, destinos, recorrido, tipoOtro: b.tipo === 'otro' ? b.tipoOtro : '',
        tipo: b.tipo, perfil, presupuesto: U.numero(b.presupuesto) || 0, monedaBase: b.monedaBase
      };
    }

    function agregarExtrasManuales(v) {
      b.extrasManuales.forEach(t => v.tareasPropias.push({
        id: U.id('pro'), titulo: t, fase: 'salida', impacto: 3, desc: 'Lo agregaste al armar el viaje.', dependeDe: []
      }));
    }

    function finalizar() {
      const datos = datosDelViaje();

      if (editando) {
        const v = R.db.viaje(existente.id);
        const firmaFechas = x => R.recorrido.todosLosSegmentos(x.recorrido).map(z => `${z.seg.sale.fecha}|${R.recorrido.fechaLlega(z.seg)}`).join(',');
        const antes = { fechas: firmaFechas(v), destinos: conAlojamiento(v).map(d => normal(d.nombre)).join('|'), participantes: v.participantes.slice().sort().join('|') };
        let participantes = resolverViajeros();
        const quitados = v.participantes.filter(p => !participantes.includes(p));
        const conMovimientos = quitados.filter(p => R.gastos.personaTieneMovimientos(v, p));
        if (conMovimientos.length) {
          U.toast(`${R.db.persona(conMovimientos[0]).nombre} tiene gastos cargados: sigue en el viaje.`);
          participantes = participantes.concat(conMovimientos);
        }
        Object.assign(v, datos, { participantes });
        agregarExtrasManuales(v);
        recalcularTramos(v);
        // Guardar el asistente confirma las bases que habían quedado "a revisar"
        if (R.motor.estado(v, 'd_destino') === 'revisar') R.motor.setEstado(v, 'd_destino', 'hecha');
        if (R.motor.estado(v, 'd_participantes') === 'revisar') R.motor.setEstado(v, 'd_participantes', 'hecha');
        R.db.guardarViaje(v);
        U.cerrarModal();
        R.app.refrescar();

        const motivos = [];
        if (antes.fechas !== firmaFechas(v) && ['t_segmento', 'a_reserva'].some(base => R.motor.idsDe(v, base).some(id => R.motor.estado(v, id) === 'hecha'))) motivos.push('fechas');
        if (antes.destinos !== conAlojamiento(v).map(d => normal(d.nombre)).join('|') && hayAvanceDespuesDe(v, 'd_destino')) motivos.push('destino');
        if (antes.participantes !== v.participantes.slice().sort().join('|') && ['t_segmento', 'a_reserva'].some(base => R.motor.idsDe(v, base).some(id => R.motor.estado(v, id) === 'hecha'))) motivos.push('participantes');
        if (motivos.length) {
          const nombres = { fechas: 'las fechas', destino: 'los destinos', participantes: 'los viajeros' };
          U.confirmar(`Cambiaste ${motivos.map(m => nombres[m]).join(' y ')} y ya tenías pasos resueltos que dependen de eso. ¿Querés que arme un plan para reorganizarlos?`, {
            titulo: 'Esto afecta otros pasos', textoSi: 'Sí, reorganizar', textoNo: 'Ahora no'
          }).then(ok => {
            if (!ok) return;
            R.motor.replanificar(v, motivos, 'Cambio hecho desde "Editar viaje"');
            marcarRaizResuelta(v, motivos);
            R.db.guardarViaje(v);
            R.app.refrescar();
            R.vistaGuia.mostrarPlan(v, R.motor.ordenarPlan(v, R.motor.pasosARevisar(v)));
          });
        } else {
          U.toast('Cambios guardados.');
        }
        return;
      }

      const v = Object.assign({
        id: U.id('via'),
        tareas: {}, tareasPropias: [], itinerario: [], documentos: [], movimientos: [], cambios: [],
        creado: new Date().toISOString()
      }, datos, { participantes: resolverViajeros() });
      R.db.guardarViaje(v); // normaliza
      if (b.origen && b.origen.nombre) R.db.guardarPrefs({ ciudadOrigen: Object.assign({}, b.origen) });
      recalcularTramos(v);
      agregarExtrasManuales(v);

      const ahora = new Date().toISOString();
      const marcar = id => { v.tareas[id] = Object.assign({}, v.tareas[id], { estado: 'hecha', fechaHecha: ahora }); };
      marcar('d_destino');
      marcar('d_participantes');

      if (b.resuelto.paquete) {
        v.perfil.paquete = { incluye: b.paqueteIncluye.slice() };
        R.formularios.aplicarPaquete(v);
      }
      const existentes = new Set(R.motor.lista(v).map(t => t.id));
      b.resueltoIds.filter(id => existentes.has(id)).forEach(marcar);

      R.db.guardarViaje(v);
      U.cerrarModal();
      const prog = R.motor.progreso(v);
      const faltan = R.motor.analizar(v).filter(t => t.faltanDatos).length;
      location.hash = `#viaje/${v.id}/guia`;
      if (v.perfil.paquete) {
        // Primero los datos del paquete y después, uno por uno, lo que incluye
        U.toast('¡Viaje creado! Ahora cargamos los datos del paquete.');
        setTimeout(() => R.formularios.abrir(R.db.viaje(v.id) || v, 'pq_paquete'), 350);
        return;
      }
      U.toast(`¡Viaje creado! Ya tenés ${U.plural(prog.hechas, 'paso resuelto', 'pasos resueltos')}${faltan ? '. Después completamos sus datos' : ''}.`);
    }

    pintar();
  }

  /** ¿Hay pasos hechos que dependen (en cadena) de este paso? */
  function hayAvanceDespuesDe(v, raiz) {
    const ts = R.motor.lista(v);
    const afectadas = new Set([raiz]);
    let crece = true;
    while (crece) {
      crece = false;
      ts.forEach(t => {
        if (!afectadas.has(t.id) && t.dependeDe.concat(t.despuesDe).some(p => afectadas.has(p))) { afectadas.add(t.id); crece = true; }
      });
    }
    afectadas.delete(raiz);
    return Array.from(afectadas).some(id => R.motor.estado(v, id) === 'hecha');
  }

  /** Si el cambio ya trae la definición nueva (ej. fechas cargadas), el paso raíz queda resuelto. */
  function marcarRaizResuelta(v, motivos) {
    if (motivos.includes('fechas') && R.recorrido.completo(v) && v.tareas.d_fechas) delete v.tareas.d_fechas;
    if (motivos.includes('destino') && v.destino) R.motor.setEstado(v, 'd_destino', 'hecha');
    if (motivos.includes('participantes')) R.motor.setEstado(v, 'd_participantes', 'hecha');
  }

  /* ---------------------------------------------------------
     Vista de un viaje
     --------------------------------------------------------- */
  /** Elegir a mano el estilo de la portada (o dejar que se arme solo según el destino). */
  function elegirPortada(v) {
    const actual = (v.perfil && v.perfil.portada) || '';
    const automatico = R.paisaje.tema(Object.assign({}, v, { perfil: Object.assign({}, v.perfil, { portada: '' }) }));
    const opcion = (id, nombre, idTema) => `
      <button type="button" class="portada-opcion ${actual === id ? 'activa' : ''}" data-portada="${id}">
        <span class="portada-muestra" style="background:${R.paisaje.fondo(v, idTema)}">${R.paisaje.svg(null, { tema: idTema, transporte: v.perfil.transporte || 'avion', progreso: 0.6 })}</span>
        <span>${esc(nombre)}</span>
      </button>`;
    U.modal({
      titulo: 'Estilo de la portada',
      subtitulo: 'Se arma sola según el destino. Si preferís otra, elegila acá.',
      ancho: true,
      cuerpo: `<div class="portada-opciones">
        ${opcion('', 'Automático · ' + R.paisaje.TEMAS[automatico].nombre, automatico)}
        ${Object.entries(R.paisaje.TEMAS).map(([id, t]) => opcion(id, t.icono + ' ' + t.nombre, id)).join('')}
      </div>`,
      alAbrir: el => el.querySelectorAll('[data-portada]').forEach(b => b.onclick = () => {
        v.perfil = v.perfil || {};
        if (b.dataset.portada) v.perfil.portada = b.dataset.portada; else delete v.perfil.portada;
        R.db.guardarViaje(v);
        U.cerrarModal();
        R.app.refrescar();
      })
    });
  }

  function renderViaje(app, v, pestana) {
    const prog = R.motor.progreso(v);
    const tipo = tipoDe(v);
    const personas = v.participantes.map(id => R.db.persona(id)).filter(Boolean);
    if (!PESTANAS.some(p => p.id === pestana)) pestana = 'guia';

    app.innerHTML = `
      <section class="portada-viaje" style="background:${R.paisaje.fondo(v)}">
        ${U.paisaje(v)}
        <div class="portada-contenido">
          <div class="portada-fila">
            <div>
              <span class="etiqueta-clara">${esc([v.tipo === 'trabajo' || v.tipo === 'otro' ? tipo.icono + ' ' + tipo.nombre : R.paisaje.TEMAS[R.paisaje.tema(v)].icono + ' ' + R.paisaje.TEMAS[R.paisaje.tema(v)].nombre, etiquetaTransporte(v), v.perfil.internacional ? '🌎 Internacional' : '', v.perfil.paquete ? '📦 Paquete' : ''].filter(Boolean).join(' · '))}</span>
              <h1>${esc(v.nombre || conAlojamiento(v).map(d => d.nombre).join(' → ') || v.destino)}</h1>
              <p class="portada-meta">${esc(destinoCompleto(v))} · ${esc(U.fmtRango(v.fechaInicio, v.fechaFin))}</p>
              <p class="portada-cuenta">${esc(cuentaRegresiva(v))}</p>
              <div class="portada-avatares">${personas.map(p => U.avatar(p, 30)).join('')}</div>
            </div>
            <div class="portada-lado">
              ${U.anillo(prog.pct, 92, 'listo')}
              <div class="portada-acciones">
                ${R.db.puedeOrganizar(v) ? '<button class="btn btn-vidrio btn-chico" data-a="portada" title="Elegir el estilo de la portada">🎨 Portada</button><button class="btn btn-vidrio btn-chico" data-a="editar">Editar</button>' : ''}
                ${R.db.esDueno(v) ? '<button class="btn btn-vidrio btn-chico" data-a="eliminar" title="Eliminar viaje">Eliminar</button>' : ''}
              </div>
            </div>
          </div>
        </div>
      </section>
      <nav class="pestanas" role="tablist">
        ${PESTANAS.map(p => `<a role="tab" href="#viaje/${v.id}/${p.id}" class="pestana ${p.id === pestana ? 'activa' : ''}"><span>${p.icono}</span>${p.nombre}</a>`).join('')}
      </nav>
      <section class="contenido-pestana" id="contPestana"></section>`;

    app.classList.toggle('rol-viajero', !R.db.puedeOrganizar(v));
    const bEditar = app.querySelector('[data-a="editar"]');
    if (bEditar) bEditar.onclick = () => abrirAsistente(v);
    const bPortada = app.querySelector('[data-a="portada"]');
    if (bPortada) bPortada.onclick = () => elegirPortada(v);
    const bEliminar = app.querySelector('[data-a="eliminar"]');
    if (bEliminar) bEliminar.onclick = async () => {
      const ok = await U.confirmar(`Se va a borrar "${v.nombre || v.destino}" con sus pasos, documentos y gastos. No se puede deshacer.`, { titulo: 'Eliminar viaje', textoSi: 'Eliminar', peligro: true });
      if (!ok) return;
      await R.db.eliminarViaje(v.id);
      location.hash = '#inicio';
      U.toast('Viaje eliminado.');
    };

    // En el celular, la pestaña activa queda siempre a la vista
    const barraPestanas = app.querySelector('.pestanas');
    const activa = app.querySelector('.pestana.activa');
    if (barraPestanas && activa) barraPestanas.scrollLeft = activa.offsetLeft - (barraPestanas.clientWidth - activa.offsetWidth) / 2;

    const cont = app.querySelector('#contPestana');
    if (pestana === 'guia') R.vistaGuia.render(v, cont);
    else if (pestana === 'itinerario') R.itinerario.render(v, cont);
    else if (pestana === 'documentos') R.documentos.render(v, cont);
    else if (pestana === 'viajeros') R.participantes.renderViajeros(v, cont);
    else if (pestana === 'gastos') R.gastos.render(v, cont);
    else if (pestana === 'valija') R.valija.render(v, cont);
  }

  /* ---------------------------------------------------------
     Tarjeta para la pantalla de inicio
     --------------------------------------------------------- */
  function tarjeta(v) {
    const prog = R.motor.progreso(v);
    const personas = v.participantes.map(id => R.db.persona(id)).filter(Boolean);
    return `
      <a class="tarjeta-viaje" href="#viaje/${v.id}/guia">
        <div class="tv-portada" style="background:${R.paisaje.fondo(v)}">
          ${U.paisaje(v)}
          <span class="tv-cuenta">${esc(cuentaRegresiva(v))}</span>
          <h3>${esc(v.nombre || conAlojamiento(v).map(d => d.nombre).join(' → ') || v.destino)}</h3>
        </div>
        <div class="tv-cuerpo">
          <p class="tv-meta">${esc(destinoCompleto(v))}</p>
          <p class="tv-meta">${esc(U.fmtRango(v.fechaInicio, v.fechaFin))}</p>
          <div class="barra-progreso"><span style="width:${prog.pct}%"></span></div>
          <div class="tv-pie">
            <span>${prog.pct}% organizado</span>
            <span class="tv-avatares">${personas.slice(0, 4).map(p => U.avatar(p, 24)).join('')}${personas.length > 4 ? `<span class="mas">+${personas.length - 4}</span>` : ''}</span>
          </div>
        </div>
      </a>`;
  }

  return {
    TIPOS, PESTANAS, EXTRAS, tipoDe, etiquetaTransporte, estadoViaje, cuentaRegresiva, destinoCompleto, deteccionInternacional, recalcularTramos,
    abrirAsistente, renderViaje, tarjeta, marcarRaizResuelta
  };
})();
