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

  // Cinco pestañas; Viajeros se abre desde las caritas de la portada
  const PESTANAS = [
    { id: 'hoy', nombre: 'Hoy', icono: '☀️', soloViajando: true },
    { id: 'guia', nombre: 'Guía', icono: '🧭' },
    { id: 'itinerario', nombre: 'Itinerario', icono: '🗓️' },
    { id: 'gastos', nombre: 'Gastos', icono: '💸' },
    { id: 'valija', nombre: 'Valija', icono: '🧳' },
    { id: 'documentos', nombre: 'Docs', icono: '📁' },
    { id: 'viajeros', nombre: 'Viajeros', icono: '👥', oculta: true }
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
    b.resueltosOtros = [];

    b.viajeros = editando
      ? existente.participantes.filter(id => id !== R.db.yoEn(existente)).map(id => R.db.persona(id)).filter(Boolean).map(p => ({ id: p.id, nombre: p.nombre }))
      : [];

    // Tres pasos: a dónde (y con quién), cuándo, y qué ya tenés
    const PASOS = editando
      ? ['Destinos', 'Cronograma', 'Detalles']
      : ['Destinos', 'Cronograma', 'Lo resuelto'];
    const ETIQUETA_PASO = { Destinos: '¿A dónde?', Cronograma: '¿Cuándo?', 'Lo resuelto': '¿Ya tenés algo?', Detalles: 'Detalles' };
    let editorCronograma = null;
    let paso = 0;
    let camposLugar = { origen: null, destinos: [] };

    const { el } = U.modal({
      titulo: editando ? 'Editar viaje' : 'Nuevo viaje',
      subtitulo: '',
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
          `<span class="paso-a ${i === paso ? 'actual' : ''} ${i < paso ? 'listo' : ''}"><i>${i < paso ? '✓' : i + 1}</i>${ETIQUETA_PASO[p] || p}</span>`).join('')}</div>
        <div class="paso-movil"><span>Paso ${paso + 1} de ${PASOS.length}</span><strong>${ETIQUETA_PASO[PASOS[paso]] || PASOS[paso]}</strong>
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
      if (n === 'Destinos') return htmlDestinos() + htmlViajeros();
      if (n === 'Cronograma') return htmlCronograma();
      if (n === 'Detalles') return htmlDetalles();
      if (n === 'Lo resuelto') return htmlResuelto() + `
        <details class="plegable plegable-chico" data-extras ${b.extrasAbierto ? 'open' : ''}>
          <summary><span>¿Algo especial? Auto, mascotas, menores…</span></summary>
          <div class="plegable-cuerpo">${htmlDetalles()}</div>
        </details>`;
      return '';
    }

    function htmlDestinos() {
      return `
        <h4 class="titulo-paso">¿Desde dónde salís?</h4>
        ${b.origen && b.origen.nombre && b.origen.codigoPais && !b.cambiarOrigen ? `
          <div class="origen-fijo">
            <span>${R.lugares.bandera(b.origen.codigoPais) || '📍'} <strong>${esc(b.origen.nombre)}</strong><small>${esc([b.origen.region, b.origen.pais].filter(Boolean).join(', '))}</small></span>
            <button type="button" class="btn btn-texto btn-chico" data-a="cambiarOrigen">Cambiar</button>
          </div>
          ` : `
        <p class="ayuda">Tu ciudad. Queda guardada para los próximos viajes.</p>
        <div id="lugarOrigen"></div>`}
        <h4 class="titulo-paso">¿A dónde vas?</h4>
        <p class="ayuda">Si son varios, en orden.</p>
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
          <button type="button" class="btn btn-suave btn-chico" data-a="masDestino">+ Otro destino</button>
          <button type="button" class="btn btn-suave btn-chico" data-a="masEscapada">+ Escapada (ida y vuelta en el día)</button>
        </div>
        <div id="bloqueVuelta">${htmlVuelta()}</div>
        <div id="avisoInter"></div>
        <label class="campo"><span>Nombre del viaje <small>(opcional)</small></span><input id="aNombre" value="${esc(b.nombre)}" placeholder="Ej: Vacaciones de invierno"></label>`;
    }

    /** Destinos donde dormís, en orden. */
    const conAlojB = () => b.destinos.filter(d => d.nombre && !d.soloDia && normal(d.nombre) !== normal(b.origen && b.origen.nombre));

    /**
     * Volver pasando por una ciudad anterior (por ejemplo: Bahía → Buenos Aires → Iguazú,
     * y la vuelta Iguazú → Buenos Aires → Bahía) sin cargarla dos veces.
     * Si no lo elegiste, se deduce por distancia: si el primer destino queda mucho más cerca
     * de tu casa que el último, seguramente es tu ciudad de conexión.
     */
    function vueltaPorSugerida() {
      const ds = conAlojB();
      if (ds.length < 2 || !b.origen || b.origen.lat == null) return '';
      const primero = ds[0], ultimo = ds[ds.length - 1];
      if (primero.lat == null || ultimo.lat == null) return '';
      const d1 = R.resumen ? R.resumen.km(b.origen, primero) : 0, d2 = R.resumen ? R.resumen.km(b.origen, ultimo) : 0;
      return d1 && d2 && d1 < d2 * 0.5 ? primero.id : '';
    }
    function vueltaPor() {
      if (b.perfil.soloIda) return null;
      const ds = conAlojB();
      if (ds.length < 2) return null;
      const id = b.perfil.vueltaPor === undefined ? vueltaPorSugerida() : b.perfil.vueltaPor;
      return ds.slice(0, -1).find(d => d.id === id) || null;
    }
    function aplicarVueltaPor() {
      const vuelta = (b.recorrido || []).find(t => t.tipo === 'vuelta');
      const por = vueltaPor();
      const nombre = por ? por.nombre : '';
      if (vuelta && b.vueltaPorAplicada && normal(b.vueltaPorAplicada) !== normal(nombre)) {
        const i = vuelta.segmentos.findIndex(s => normal(s.hasta.nombre) === normal(b.vueltaPorAplicada));
        if (i >= 0 && i < vuelta.segmentos.length - 1) R.recorrido.unir(vuelta, i);
      }
      if (vuelta && por && !vuelta.segmentos.some(s => normal(s.hasta.nombre) === normal(nombre))) {
        R.recorrido.dividir(vuelta, vuelta.segmentos.length - 1, por);
      }
      b.vueltaPorAplicada = vuelta && por ? nombre : '';
    }

    function htmlVuelta() {
          const ds = conAlojB();
          const ultimo = ds.slice(-1)[0];
          const por = vueltaPor();
          const origen = b.origen && b.origen.nombre ? b.origen.nombre : 'tu ciudad';
          return `<div class="campo campo-vuelta"><span>¿Volvés?</span>
          <div class="segmentado">
            <button type="button" data-vuelta="si" class="${!b.perfil.soloIda ? 'activo' : ''}">Ida y vuelta</button>
            <button type="button" data-vuelta="no" class="${b.perfil.soloIda ? 'activo' : ''}">Solo ida</button>
          </div>
          ${!b.perfil.soloIda && ds.length >= 2 ? `
            <span class="vuelta-por-titulo">¿Por dónde volvés?</span>
            <div class="checks-grilla">
              <label class="chip-check ${!por ? 'activo' : ''}"><input type="radio" name="vueltaPor" data-vuelta-por="" ${!por ? 'checked' : ''}> Directo a ${esc(origen)}</label>
              ${ds.slice(0, -1).map(d => `<label class="chip-check ${por && por.id === d.id ? 'activo' : ''}"><input type="radio" name="vueltaPor" data-vuelta-por="${d.id}" ${por && por.id === d.id ? 'checked' : ''}> Por ${esc(d.nombre)}</label>`).join('')}
            </div>` : ''}
          <small class="ayuda">${b.perfil.soloIda ? 'No armo la vuelta.' : ultimo ? `La vuelta se arma sola: ${esc(ultimo.nombre)}${por ? ' → ' + esc(por.nombre) : ''} → ${esc(origen)}. No hace falta cargar ninguna ciudad dos veces.` : 'La vuelta se arma sola desde el último destino hasta tu ciudad.'}</small></div>`;
    }
    /** Repinta "¿Volvés? / ¿Por dónde volvés?" cuando cambian los destinos (sin perder lo escrito). */
    function refrescarVuelta() {
      const caja = cont.querySelector('#bloqueVuelta');
      if (!caja) return;
      camposLugar.destinos.forEach((c, i) => { if (c && b.destinos[i]) Object.assign(b.destinos[i], c.obtener()); });
      if (camposLugar.origen) b.origen = camposLugar.origen.obtener();
      caja.innerHTML = htmlVuelta();
      enlazarVuelta();
    }
    function enlazarVuelta() {
      cont.querySelectorAll('[data-vuelta]').forEach(x => x.onclick = () => { leerPaso(); b.perfil.soloIda = x.dataset.vuelta === 'no'; refrescarVuelta(); });
      cont.querySelectorAll('[data-vuelta-por]').forEach(x => x.onchange = () => { leerPaso(); b.perfil.vueltaPor = x.dataset.vueltaPor; refrescarVuelta(); });
    }

    function htmlCronograma() {
      {
        b.recorrido = R.recorrido.construir(b.origen, b.destinos, b.recorrido, 'avion', { soloIda: !!b.perfil.soloIda });
        const nueva = b.conexion && b.conexion.lugar && b.conexion.lugar.nombre ? b.conexion.lugar.nombre : '';
        if (b.conexionAplicada && normal(b.conexionAplicada) !== normal(nueva)) R.recorrido.quitarConexion(b.recorrido, { nombre: b.conexionAplicada });
        if (nueva) R.recorrido.aplicarConexion(b.recorrido, b.conexion);
        b.conexionAplicada = nueva;
        aplicarVueltaPor();
        return `
        <h4 class="titulo-paso">¿Cuándo salís y cuántas noches?</h4>
        <p class="ayuda">En qué viajás, cuándo salís y cuántas noches. El resto se calcula solo.</p>
        <div id="editorCronograma"></div>`;
      }
    }

    function htmlDetalles() {
      {
        const det = deteccionInternacional(b.origen, b.destinos.filter(d => d.nombre));
        const inter = internacional();
        return `
        <div class="inter-linea">
          <span>${inter ? '🌎 Salís del país' : '📍 No salís del país'}${det.estado === 'si' ? ': ' + det.paises.map(p => `${R.lugares.bandera(p.codigoPais)} ${esc(p.pais)}`).join(', ') : ''}</span>
          <button type="button" class="btn-texto-mini" data-inter="${inter ? 'no' : 'si'}">${inter ? 'No salgo' : 'Sí salgo'}</button>
        </div>
        <p class="ayuda">Marcá lo que corresponda: cada opción suma sus pasos a la guía.</p>
        <div class="extras-lista">${EXTRAS.map(x =>
          `<label class="extra-op ${extraActivo(b, x.id) ? 'activo' : ''}"><input type="checkbox" data-extra="${x.id}" ${extraActivo(b, x.id) ? 'checked' : ''}>
            <span class="eo-icono">${x.icono}</span><span><strong>${esc(x.texto)}</strong><small>Suma: ${esc(x.suma)}</small></span></label>`).join('')}</div>
        <div class="fila-agregar">
          <input id="aExtraManual" placeholder="Otra cosa que tengas que hacer">
          <button type="button" class="btn btn-suave" data-a="agregarExtra">Agregar</button>
        </div>
        ${b.extrasManuales.length ? `<div class="chips-personas">${b.extrasManuales.map((x, i) => `<span class="chip-persona chip-texto">📝 ${esc(x)} <button type="button" data-quitar-extra="${i}" aria-label="Quitar">×</button></span>`).join('')}</div>` : ''}`;
      }
    }

    function htmlResuelto() {
      {
        const opciones = pasosResolubles();
        return `
        <h4 class="titulo-paso">¿Ya tenés algo comprado o reservado?</h4>
        <p class="ayuda">Marcalo y la guía arranca por lo que falta. Si no, seguí de largo.</p>
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
        ${(() => {
          // Pocas opciones simples: una por tipo ("Pasajes", "Alojamiento"…). Si un tipo tiene varios, se puede afinar.
          const grupos = gruposResueltos(opciones);
          return `<div class="campo"><span>${b.resuelto.paquete ? 'Fuera del paquete, ¿tenés algo más?' : 'O por tu cuenta:'}</span>
            <div class="checks-grilla">${grupos.map(g => {
              const marcados = g.items.filter(o => b.resueltoIds.includes(o.id)).length;
              return `<label class="chip-check ${marcados ? 'activo' : ''}"><input type="checkbox" data-resuelto-grupo="${g.clave}" ${marcados ? 'checked' : ''}> ${g.icono} ${esc(g.nombre)}</label>`;
            }).join('')}
              ${b.resueltosOtros.map((x, i) => `<span class="chip-check activo">✓ ${esc(x)} <button type="button" class="chip-quitar" data-quitar-otro="${i}" aria-label="Quitar">×</button></span>`).join('')}
              <button type="button" class="chip-check chip-otro" data-a="otroResuelto">+ Otro</button></div>
            <div class="fila-agregar oculto" id="filaOtroResuelto"><input id="aOtroResuelto" placeholder="Ej: entradas del recital"><button type="button" class="btn btn-suave" data-a="agregarOtroResuelto">Agregar</button></div>
            ${grupos.filter(g => g.items.length > 1 && g.items.some(o => b.resueltoIds.includes(o.id))).map(g => `
              <div class="resuelto-detalle"><small>${esc(g.nombre)}: destildá lo que todavía no tengas</small>
                <div class="checks-grilla">${g.items.map(o => `<label class="chip-check chip-chico ${b.resueltoIds.includes(o.id) ? 'activo' : ''}"><input type="checkbox" data-resuelto-id="${o.id}" ${b.resueltoIds.includes(o.id) ? 'checked' : ''}> ${esc(o.corto)}</label>`).join('')}</div>
              </div>`).join('')}
          </div>`;
        })()}`;
      }
    }

    function htmlViajeros() {
      {
        const conocidos = R.db.personas().filter(p => !p.esYo && !b.viajeros.some(x => normal(x.nombre) === normal(p.nombre)));
        return `
        <h4 class="titulo-paso">¿Viaja alguien con vos?</h4>
        <div class="lista-viajeros-asistente">
          <span class="chip-persona fijo">${U.avatar(yo, 26)} ${esc(yo.nombre)} <small>(vos)</small></span>
          ${b.viajeros.map((p, i) => `<span class="chip-persona">${U.avatar({ id: p.id || p.nombre, nombre: p.nombre }, 26)} ${esc(p.nombre)} <button type="button" data-quitar-viajero="${i}" aria-label="Quitar">×</button></span>`).join('')}
        </div>
        <div class="fila-agregar">
          <input id="aNuevaPersona" list="aConocidos" placeholder="Nombre de quien viaja con vos">
          <datalist id="aConocidos">${conocidos.map(p => `<option value="${esc(p.nombre)}">`).join('')}</datalist>
          <button type="button" class="btn btn-suave" data-a="agregarPersona">Agregar</button>
        </div>
        <p class="ayuda">Si viajás solo/a, seguí de largo.</p>`;
      }
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
      if (n === 'Detalles' || n === 'Lo resuelto') {
        cont.querySelectorAll('[data-extra]').forEach(x => {
          if (x.dataset.extra === 'trabajo') { if (x.checked) b.tipo = 'trabajo'; else if (b.tipo === 'trabajo') b.tipo = 'vacaciones'; }
          else b.perfil[x.dataset.extra] = x.checked;
        });
      }
      if (n === 'Lo resuelto') {
        cont.querySelectorAll('[data-resuelto]').forEach(x => { b.resuelto[x.dataset.resuelto] = x.checked; });
        cont.querySelectorAll('[data-resuelto-id]').forEach(x => {
          const id = x.dataset.resueltoId;
          b.resueltoIds = b.resueltoIds.filter(y => y !== id).concat(x.checked ? [id] : []);
        });
        const inc = cont.querySelectorAll('[data-incluye]');
        if (inc.length) b.paqueteIncluye = Array.from(inc).filter(x => x.checked).map(x => x.dataset.incluye);
      }
    }

    function validar() {
      const n = nombrePaso();
      if (n === 'Destinos') {
        b.destinos = b.destinos.filter((d, i) => d.nombre || i === 0);
        // Tu ciudad cargada como último destino = la vuelta: no se duplica
        const conAloj = b.destinos.filter(d => d.nombre && !d.soloDia);
        if (conAloj.length > 1 && b.origen && normal(conAloj[conAloj.length - 1].nombre) === normal(b.origen.nombre)) {
          b.destinos = b.destinos.filter(d => d !== conAloj[conAloj.length - 1]);
          b.perfil.soloIda = false;
          U.toast(`Saqué ${b.origen.nombre} de los destinos: la vuelta ya se arma sola.`);
        }
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
        camposLugar.origen = cont.querySelector('#lugarOrigen') ? R.lugares.campo(cont.querySelector('#lugarOrigen'), { valor: b.origen, placeholder: 'Tu ciudad de salida', alCambiar: () => { avisar(); refrescarVuelta(); }, sugeridos: usadas }) : null;
        const bOrigen = cont.querySelector('[data-a="cambiarOrigen"]');
        if (bOrigen) bOrigen.onclick = () => { leerPaso(); b.cambiarOrigen = true; pintar(); const i = cont.querySelector('#lugarOrigen .lugar-input'); if (i) { i.focus(); i.select(); } };
        camposLugar.destinos = b.destinos.map((d, i) => R.lugares.campo(cont.querySelector(`[data-lugar-destino="${i}"]`), {
          valor: d, placeholder: d.soloDia ? 'Lugar que visitás en el día' : 'Ej: Roma, Cusco, Nueva York',
          sugeridos: usadas.filter(u => normal(u.nombre) !== normal(b.origen && b.origen.nombre)),
          alCambiar: () => { avisar(); refrescarVuelta(); }
        }));
        avisar();
        enlazarVuelta();
        cont.querySelector('[data-a="masDestino"]').onclick = () => { leerPaso(); b.destinos.push(nuevoDestino(false)); pintar(); };
        cont.querySelector('[data-a="masEscapada"]').onclick = () => { leerPaso(); b.destinos.push(nuevoDestino(true)); pintar(); };
        cont.querySelectorAll('[data-quitar-destino]').forEach(x => x.onclick = () => { leerPaso(); b.destinos.splice(Number(x.dataset.quitarDestino), 1); pintar(); });
      }

      if (n === 'Cronograma') {
        editorCronograma = R.cronogramaEditor.montar(cont.querySelector('#editorCronograma'), b, { permitirSinFechas: true });
      }

      if (n === 'Detalles' || n === 'Lo resuelto') {
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
        cont.querySelectorAll('[data-resuelto-id]').forEach(x => x.onchange = () => { leerPaso(); pintar(); });
        const bOtro = cont.querySelector('[data-a="otroResuelto"]');
        if (bOtro) bOtro.onclick = () => { cont.querySelector('#filaOtroResuelto').classList.remove('oculto'); cont.querySelector('#aOtroResuelto').focus(); };
        const agregarOtro = () => { const x = cont.querySelector('#aOtroResuelto'); const t = x.value.trim(); if (!t) return; leerPaso(); b.resueltosOtros.push(t); pintar(); };
        const bAgOtro = cont.querySelector('[data-a="agregarOtroResuelto"]');
        if (bAgOtro) bAgOtro.onclick = agregarOtro;
        const inOtro = cont.querySelector('#aOtroResuelto');
        if (inOtro) inOtro.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); agregarOtro(); } };
        cont.querySelectorAll('[data-quitar-otro]').forEach(x => x.onclick = () => { leerPaso(); b.resueltosOtros.splice(Number(x.dataset.quitarOtro), 1); pintar(); });
        const dx = cont.querySelector('details[data-extras]');
        if (dx) dx.addEventListener('toggle', () => { b.extrasAbierto = dx.open; });
        cont.querySelectorAll('[data-resuelto-grupo]').forEach(x => x.onchange = () => {
          const g = gruposResueltos(pasosResolubles()).find(y => y.clave === x.dataset.resueltoGrupo);
          if (!g) return;
          const ids = g.items.map(o => o.id);
          b.resueltoIds = b.resueltoIds.filter(id => !ids.includes(id)).concat(x.checked ? ids : []);
          pintar();
        });
      }

      if (n === 'Destinos') {
        const input = cont.querySelector('#aNuevaPersona');
        const agregar = () => {
          const nombre = input.value.trim();
          if (!nombre) return;
          if (normal(nombre) === normal(yo.nombre)) { U.toast('Vos ya estás en el viaje 🙂'); return; }
          if (b.viajeros.some(p => normal(p.nombre) === normal(nombre))) { U.toast('Ya está en la lista.'); return; }
          leerPaso();
          const conocido = R.db.personas().find(p => !p.esYo && normal(p.nombre) === normal(nombre));
          b.viajeros.push(conocido ? { id: conocido.id, nombre: conocido.nombre } : { nombre });
          pintar();
          cont.querySelector('#aNuevaPersona').focus();
        };
        cont.querySelector('[data-a="agregarPersona"]').onclick = agregar;
        input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } };
        cont.querySelectorAll('[data-quitar-viajero]').forEach(x => x.onclick = () => { leerPaso(); b.viajeros.splice(Number(x.dataset.quitarViajero), 1); pintar(); });
      }
    }

    /** Agrupa los pasos resolubles por tipo, con un nombre corto. */
    function gruposResueltos(opciones) {
      const NOMBRES = {
        t_segmento: ['✈️', 'Pasajes'], a_reserva: ['🏡', 'Alojamiento'], p_seguro: ['🛡️', 'Seguro'], mv_auto: ['🚗', 'Auto'],
        mv_traslado: ['🚕', 'Traslados'], e_excursiones: ['🌄', 'Excursiones'], doc_pasaporte: ['🛂', 'Pasaporte'], doc_visa: ['🛂', 'Visa o permiso'],
        p_vacunas: ['💉', 'Vacunas'], doc_dni: ['🪪', 'DNI al día']
      };
      const mapa = new Map();
      opciones.forEach(o => {
        const clave = o.base || o.id;
        const [icono, nombre] = NOMBRES[clave] || [R.guia.fase(o.fase).icono, o.titulo];
        if (!mapa.has(clave)) mapa.set(clave, { clave, icono, nombre, items: [] });
        const corto = clave === 't_segmento' ? o.titulo.replace(/^(Vuelo|Pasaje de \w+|Barco[^ ]*|Tren)\s*/i, '') : clave === 'a_reserva' ? o.titulo.replace(/^Reservar alojamiento en\s*/i, '') : o.titulo;
        mapa.get(clave).items.push(Object.assign({}, o, { corto }));
      });
      const orden = Object.keys(NOMBRES);
      return Array.from(mapa.values()).sort((a, b) => (orden.indexOf(a.clave) + 1 || 99) - (orden.indexOf(b.clave) + 1 || 99)).slice(0, 8);
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
      const recorrido = R.recorrido.construir(b.origen, destinos, b.recorrido, 'avion', { soloIda: !!b.perfil.soloIda });
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
      // Lo que ya tenías resuelto por tu cuenta ("Otro"): queda como paso hecho
      (b.resueltosOtros || []).forEach(t => {
        const id = U.id('pro');
        v.tareasPropias.push({ id, titulo: t, fase: 'experiencias', impacto: 2, desc: 'Lo tenías resuelto al armar el viaje.', dependeDe: [] });
        v.tareas[id] = { estado: 'hecha', fechaHecha: new Date().toISOString() };
      });
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
  /** Menú ⋯ del viaje: lo que se usa poco, fuera de la vista. */
  function menuViaje(v) {
    const ops = [];
    if (R.db.puedeOrganizar(v)) {
      ops.push(['editar', '✏️', 'Editar destinos, fechas y opciones']);
      if (estadoViaje(v) !== 'pasado') ops.push(['cambio', '🔄', 'Cambiaron los planes']);
    }
    if (R.preguntar && R.db.modo() === 'nube') ops.push(['preguntar', '✨', 'Preguntale a Rutenda']);
    ops.push(['viajeros', '👥', 'Viajeros']);
    ops.push(['ruta', '🗺️', 'Ver la ruta en Google Maps']);
    if (estadoViaje(v) === 'en_curso') ops.push(['guia', '🧭', 'Guía de organización']);
    ops.push(['pdf', '📄', 'Descargar itinerario en PDF']);
    if (R.familia && R.db.modo() === 'nube') ops.push(['familia', '👪', v.linkFamilia && v.linkFamilia.activo ? 'Link para la familia (activo)' : 'Link para la familia']);
    if (R.linkCuentas && R.db.modo() === 'nube' && (v.participantes || []).length > 1) ops.push(['linkCuentas', '🔗', v.linkCuentas && v.linkCuentas.activo ? 'Link de cuentas (activo)' : 'Link de cuentas para el grupo']);
    if (v.fechaInicio) ops.push(['resumen', '🖼️', 'Resumen para compartir']);
    if (R.db.esDueno(v)) ops.push(['eliminar', '🗑', 'Eliminar viaje']);
    const { el } = U.modal({
      titulo: v.nombre || conAlojamiento(v).map(d => d.nombre).join(' → ') || 'Viaje',
      cuerpo: `<div class="menu-acciones">${ops.map(([id, ic, t]) => `<button type="button" class="menu-op ${id === 'eliminar' ? 'peligro' : ''}" data-op="${id}"><span>${ic}</span>${t}</button>`).join('')}</div>`
    });
    el.querySelectorAll('[data-op]').forEach(b => b.onclick = async () => {
      const op = b.dataset.op;
      U.cerrarModal();
      if (op === 'editar') abrirAsistente(v);
      else if (op === 'cambio') R.vistaGuia.cambioDePlanes(v);
      else if (op === 'preguntar') R.preguntar.abrir(v);
      else if (op === 'ruta') R.gmaps.abrirRutaViaje(v);
      else if (op === 'viajeros') location.hash = `#viaje/${v.id}/viajeros`;
      else if (op === 'guia') location.hash = `#viaje/${v.id}/guia`;
      else if (op === 'pdf') R.itinerarioPdf.descargar(v);
      else if (op === 'resumen') R.resumen.abrir(v);
      else if (op === 'familia') R.familia.abrir(v);
      else if (op === 'linkCuentas') R.linkCuentas.abrir(v);
      else if (op === 'eliminar') {
        const ok = await U.confirmar(`Se borra "${v.nombre || v.destino}" con sus pasos, documentos y gastos. No se puede deshacer.`, { titulo: 'Eliminar viaje', textoSi: 'Eliminar', peligro: true });
        if (!ok) return;
        await R.db.eliminarViaje(v.id);
        location.hash = '#inicio';
        U.toast('Viaje eliminado.');
      }
    });
  }

  function renderViaje(app, v, pestana) {
    const prog = R.motor.progreso(v);
    const tipo = tipoDe(v);
    const personas = v.participantes.map(id => R.db.persona(id)).filter(Boolean);
    const viajando = estadoViaje(v) === 'en_curso';
    // Mientras viajás, la app abre directo en "Hoy"
    if (!pestana) pestana = viajando ? 'hoy' : 'guia';
    if (!PESTANAS.some(p => p.id === pestana) || (pestana === 'hoy' && !viajando)) pestana = 'guia';

    const grande = pestana === 'guia';
    const titulo = v.nombre || conAlojamiento(v).map(d => d.nombre).join(' → ') || v.destino;
    app.innerHTML = `
      <section class="portada-viaje ${grande ? '' : 'portada-compacta'}" style="background:${R.paisaje.fondo(v)}">
        ${U.paisaje(v)}
        <button class="btn-menu-viaje" data-a="menu" aria-label="Opciones del viaje">⋯</button>
        <div class="portada-contenido">
          <h1>${esc(titulo)}</h1>
          <p class="portada-meta">${esc(U.fmtRango(v.fechaInicio, v.fechaFin))} · <strong>${esc(cuentaRegresiva(v))}</strong></p>
          ${grande ? `
          <div class="portada-pie">
            <a class="portada-avatares" href="#viaje/${v.id}/viajeros" title="Viajeros">${personas.map(p => U.avatar(p, 30)).join('')}<span class="pa-mas">${personas.length > 1 ? personas.length + ' viajeros' : '+ Viajeros'}</span></a>
            <div class="portada-avance"><span><strong>${prog.pct}%</strong> organizado</span><span class="barra-progreso"><span style="width:${prog.pct}%"></span></span></div>
          </div>` : ''}
        </div>
      </section>
      ${estadoViaje(v) === 'pasado' && !v.ejemplo ? `<div class="aviso-vuelta"><span>🎉 <strong>¡Volviste!</strong> Mirá cómo fue el viaje.</span><button class="btn btn-primario btn-chico" data-a="verResumen">Ver resumen</button></div>` : ''}
      <nav class="pestanas" role="tablist">
        ${PESTANAS.filter(p => !p.oculta && (!p.soloViajando || viajando) && !(viajando && p.id === 'guia' && pestana !== 'guia')).map(p => `<a role="tab" href="#viaje/${v.id}/${p.id}" class="pestana ${p.id === pestana ? 'activa' : ''}"><span>${p.icono}</span>${p.nombre}</a>`).join('')}
      </nav>
      <section class="contenido-pestana" id="contPestana"></section>`;

    app.querySelector('[data-a="menu"]').onclick = () => menuViaje(v);
    const bRes = app.querySelector('[data-a="verResumen"]');
    if (bRes) bRes.onclick = () => R.resumen.abrir(v);
    const bEj = app.querySelector('[data-a="borrarEjemplo"]');
    if (bEj) bEj.onclick = () => borrarEjemplo(v);
    app.classList.toggle('rol-viajero', !R.db.puedeOrganizar(v));
    // En el celular, la pestaña activa queda siempre a la vista
    const barraPestanas = app.querySelector('.pestanas');
    const activa = app.querySelector('.pestana.activa');
    if (barraPestanas && activa) barraPestanas.scrollLeft = activa.offsetLeft - (barraPestanas.clientWidth - activa.offsetWidth) / 2;

    const cont = app.querySelector('#contPestana');
    if (pestana === 'hoy') R.itinerario.renderHoy(v, cont);
    else if (pestana === 'guia') R.vistaGuia.render(v, cont);
    else if (pestana === 'itinerario') R.itinerario.render(v, cont);
    else if (pestana === 'documentos') R.documentos.render(v, cont);
    else if (pestana === 'viajeros') R.participantes.renderViajeros(v, cont);
    else if (pestana === 'gastos') R.gastos.render(v, cont);
    else if (pestana === 'valija') R.valija.render(v, cont);
  }

  /* ---------------------------------------------------------
     Tarjeta para la pantalla de inicio
     --------------------------------------------------------- */
  /** "Falta: …" con un toque para resolverlo, sin entrar al viaje. */
  function siguienteHTML(v) {
    if (v.ejemplo || estadoViaje(v) === 'pasado' || !R.db.puedeOrganizar(v)) return '';
    const t = R.motor.proximos(v, 1)[0];
    if (!t) return '';
    return `<span class="sigue" role="button" tabindex="0" data-siguiente="${t.id}" data-viaje="${v.id}">
      <span class="sigue-texto"><small>Falta</small>${R.guia.fase(t.fase).icono} ${esc(t.titulo)}</span><b>Resolver →</b></span>`;
  }

  function tarjeta(v) {
    const prog = R.motor.progreso(v);
    const personas = v.participantes.map(id => R.db.persona(id)).filter(Boolean);
    return `
      <a class="tarjeta-viaje" href="#viaje/${v.id}">
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
          ${siguienteHTML(v)}
        </div>
      </a>`;
  }

  /* ---------------------------------------------------------
     Viaje de ejemplo: para ver cómo funciona sin cargar nada
     --------------------------------------------------------- */
  function crearEjemplo() {
    const ba = { nombre: 'Buenos Aires', region: 'Ciudad Autónoma de Buenos Aires', pais: 'Argentina', codigoPais: 'AR', lat: -34.61, lon: -58.38, zona: 'America/Argentina/Buenos_Aires' };
    const propia = ciudadDeSiempre();
    const origen = propia && propia.nombre ? propia : ba;
    let dest = { nombre: 'San Carlos de Bariloche', region: 'Río Negro', pais: 'Argentina', codigoPais: 'AR', lat: -41.13, lon: -71.31, zona: 'America/Argentina/Salta', elevacion: 893 };
    if (normal(origen.nombre) === normal(dest.nombre)) dest = { nombre: 'Mendoza', region: 'Mendoza', pais: 'Argentina', codigoPais: 'AR', lat: -32.89, lon: -68.83, zona: 'America/Argentina/Mendoza', elevacion: 746 };
    dest = Object.assign({ id: U.id('dst'), noches: '', soloDia: false, fecha: '' }, dest);
    const f = U.sumarDias(U.hoyISO(), 45);
    const recorrido = R.recorrido.construir(origen, [dest], [], 'avion');
    const ida = recorrido[0].segmentos[0], vuelta = recorrido[recorrido.length - 1].segmentos[0];
    ida.sale = { fecha: f, hora: '09:30' }; ida.llega = { fecha: f, hora: '11:50' }; ida.estado = 'estimado';
    vuelta.sale = { fecha: U.sumarDias(f, 5), hora: '18:10' }; vuelta.llega = { fecha: U.sumarDias(f, 5), hora: '20:30' }; vuelta.estado = 'estimado';
    const yo = R.db.yo().id;
    const v = {
      id: U.id('via'), ejemplo: true, nombre: 'Ejemplo: escapada a ' + dest.nombre.replace('San Carlos de ', ''),
      origen, destinos: [dest], recorrido, tipo: 'vacaciones', perfil: { transporte: 'avion', internacional: false },
      presupuesto: 900000, monedaBase: 'ARS', participantes: [yo],
      tareas: {}, tareasPropias: [], itinerario: [], documentos: [], movimientos: [], cambios: [], creado: new Date().toISOString()
    };
    R.db.guardarViaje(v);
    recalcularTramos(v);
    const ahora = new Date().toISOString();
    ['d_destino', 'd_participantes'].forEach(id => { v.tareas[id] = { estado: 'hecha', fechaHecha: ahora }; });
    R.motor.idsDe(v, 't_segmento').forEach(id => { v.tareas[id] = { estado: 'hecha', fechaHecha: ahora, sinDatosOk: true }; });
    // Ideas de ejemplo ya cargadas (en un viaje real se buscan al abrir "Qué hacer en…")
    const IDEAS = dest.nombre === 'Mendoza' ? [
      ['Recorrer bodegas en Luján de Cuyo', 'Visitas con degustación en algunas de las bodegas más conocidas de la zona.', 'gastronomia', true, 'medio día', 'Luján de Cuyo, Mendoza'],
      ['Parque General San Martín', 'El gran parque de la ciudad, con lago y el Cerro de la Gloria.', 'naturaleza', false, 'medio día', 'Parque General San Martín, Mendoza'],
      ['Alta montaña y Aconcagua', 'Excursión por la ruta 7 con vistas al cerro más alto de América.', 'excursion', true, 'día completo', 'Parque Provincial Aconcagua'],
      ['Termas de Cacheuta', 'Piletas termales al pie de la montaña, ideal para relajar.', 'naturaleza', true, 'medio día', 'Termas de Cacheuta'],
      ['Caminar por la Peatonal Sarmiento', 'Cafés, plazas y la vida del centro mendocino.', 'cultura', false, '1-2 h', 'Peatonal Sarmiento, Mendoza']
    ] : [
      ['Circuito Chico', 'El recorrido clásico por lagos, miradores y el Llao Llao.', 'imperdible', false, 'medio día', 'Circuito Chico, Bariloche'],
      ['Cerro Campanario', 'Aerosilla hasta uno de los mejores miradores de la zona.', 'naturaleza', false, '1-2 h', 'Cerro Campanario, Bariloche'],
      ['Isla Victoria y Bosque de Arrayanes', 'Navegación por el Nahuel Huapi hasta el bosque de arrayanes.', 'excursion', true, 'día completo', 'Bosque de Arrayanes'],
      ['Cerro Catedral', 'Medios de elevación con vistas a los lagos y la cordillera.', 'aventura', false, 'medio día', 'Cerro Catedral, Bariloche'],
      ['Chocolate y cervecerías artesanales', 'La calle Mitre y las cervecerías del kilómetro.', 'gastronomia', false, '1-2 h', 'Calle Mitre, Bariloche'],
      ['Centro Cívico', 'La plaza y los edificios de piedra y madera del centro.', 'cultura', false, '1-2 h', 'Centro Cívico, Bariloche']
    ];
    v.ideas = { [dest.id]: { ideas: IDEAS.map(([titulo, descripcion, tipo, reserva, duracion, lugar]) => ({ titulo, descripcion, tipo, reserva, duracion, lugar })), fuentes: [], mes: Number(f.slice(5, 7)), creado: ahora } };
    v.itinerario.push({ id: U.id('evt'), fecha: U.sumarDias(f, 2), hora: '10:00', tipo: 'actividad', titulo: 'Excursión de día completo', lugar: '', confirmacion: '', notas: '' });
    v.movimientos.push({
      id: U.id('mov'), tipo: 'gasto', concepto: 'Pasajes de avión', categoria: 'transporte', monto: 320000, moneda: 'ARS', cotizacion: 1,
      fecha: U.hoyISO(), persona: yo, division: { modo: 'igual', entre: [yo], montos: {} }, creado: ahora
    });
    R.db.guardarViaje(v);
    return v;
  }

  async function borrarEjemplo(v) {
    await R.db.eliminarViaje(v.id);
    location.hash = '#inicio';
    U.toast('Listo, borré el ejemplo. ¡Ahora el tuyo!');
  }

  return {
    crearEjemplo, borrarEjemplo,
    TIPOS, PESTANAS, EXTRAS, tipoDe, etiquetaTransporte, estadoViaje, cuentaRegresiva, destinoCompleto, deteccionInternacional, recalcularTramos,
    abrirAsistente, renderViaje, tarjeta, siguienteHTML, marcarRaizResuelta
  };
})();
