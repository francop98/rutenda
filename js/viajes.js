/* =========================================================
   Tripbox — viajes
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

  const EXTRAS = [
    { id: 'alquilaAuto', icono: '🚗', texto: 'Voy a alquilar auto' },
    { id: 'menores', icono: '🧒', texto: 'Viajan menores de edad' },
    { id: 'viajaConMascota', icono: '🐕', texto: 'Viajo con mi mascota' },
    { id: 'mascotas', icono: '🏠', texto: 'Dejo mascotas en casa' },
    { id: 'accesibilidad', icono: '♿', texto: 'Alguien necesita asistencia o accesibilidad' },
    { id: 'equipamiento', icono: '🎿', texto: 'Deportes o actividades con equipo (ski, buceo, bici…)' },
    { id: 'eventoEspecial', icono: '🎉', texto: 'Hay un evento especial (cumpleaños, aniversario…)' }
  ];

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
  const normal = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

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

  /** Fechas de cada destino según las noches cargadas. */
  function recalcularTramos(v) {
    const lista = (v.destinos || []).filter(d => !d.soloDia);
    if (!v.fechaInicio) { lista.forEach(d => { d.desde = ''; d.hasta = ''; }); return; }
    if (lista.length === 1) { lista[0].desde = v.fechaInicio; lista[0].hasta = v.fechaFin || v.fechaInicio; return; }
    let cursor = v.fechaInicio;
    lista.forEach((d, i) => {
      const noches = U.numero(d.noches);
      if (noches > 0) { d.desde = cursor; d.hasta = U.sumarDias(cursor, noches); cursor = d.hasta; }
      else if (i === lista.length - 1 && v.fechaFin && cursor <= v.fechaFin) { d.desde = cursor; d.hasta = v.fechaFin; }
      else { d.desde = ''; d.hasta = ''; }
    });
  }

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
      nombre: '', origen: { nombre: '' }, destinos: [nuevoDestino(false)],
      fechaInicio: '', fechaFin: '', tipo: 'vacaciones',
      perfil: { internacionalManual: null, transporte: 'avion' },
      presupuesto: '', monedaBase: R.db.prefs().monedaBase || 'ARS'
    };
    if (!b.destinos.length) b.destinos.push(nuevoDestino(false));
    b.sinFechas = editando ? !b.fechaInicio : false;
    b.extrasManuales = [];
    b.resuelto = {};
    b.paqueteIncluye = ['vuelos', 'alojamiento'];
    b.resueltoIds = [];
    let agregandoParada = null;
    let campoParada = null;
    b.viajeros = editando
      ? existente.participantes.filter(id => id !== 'yo').map(id => R.db.persona(id)).filter(Boolean).map(p => ({ id: p.id, nombre: p.nombre }))
      : [];

    const PASOS = editando
      ? ['Destinos', 'Fechas', 'Recorrido', 'Estilo', 'Viajeros']
      : ['Destinos', 'Fechas', 'Recorrido', 'Estilo', 'Lo resuelto', 'Viajeros'];
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
      banda.style.background = U.portada(lista[0] || b.origen.nombre || 'viaje');
      banda.innerHTML = `${R.paisaje.svg(null, { transporte: b.recorrido && b.recorrido.length ? R.recorrido.medioPrincipal(b.recorrido) : 'avion', progreso: paso / (PASOS.length - 1) })}
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
    }

    function contenidoPaso() {
      const n = nombrePaso();
      if (n === 'Destinos') return `
        <h4 class="titulo-paso">¿Desde dónde salís?</h4>
        <div id="lugarOrigen"></div>
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

      if (n === 'Fechas') {
        const aloj = b.destinos.filter(d => !d.soloDia && d.nombre);
        const esc2 = b.destinos.filter(d => d.soloDia && d.nombre);
        const noches = b.fechaInicio && b.fechaFin ? U.diasEntre(b.fechaInicio, b.fechaFin) : null;
        return `
        <h4 class="titulo-paso">¿Cuándo?</h4>
        <div class="grilla-2">
          <label class="campo"><span>Salida</span><input type="date" id="aInicio" value="${esc(b.fechaInicio)}" ${b.sinFechas ? 'disabled' : ''}></label>
          <label class="campo"><span>Regreso</span><input type="date" id="aFin" value="${esc(b.fechaFin)}" min="${esc(b.fechaInicio)}" ${b.sinFechas ? 'disabled' : ''}></label>
        </div>
        <label class="check"><input type="checkbox" id="aSinFechas" ${b.sinFechas ? 'checked' : ''}> Todavía no tengo fechas firmes</label>
        ${!b.sinFechas && aloj.length > 1 ? `
          <h4 class="titulo-paso">¿Cuántas noches en cada lugar?</h4>
          <div class="lista-noches">${aloj.map(d => `
            <label class="fila-noches"><span>${esc(d.nombre)}</span><input type="number" min="0" inputmode="numeric" data-noches="${d.id}" value="${esc(d.noches)}" placeholder="0"> noches</label>`).join('')}</div>
          <p class="ayuda" id="controlNoches">${noches != null ? `El viaje tiene ${U.plural(noches, 'noche', 'noches')}.` : ''}</p>` : ''}
        ${!b.sinFechas && esc2.length ? `
          <h4 class="titulo-paso">¿Qué día hacés ${esc2.length > 1 ? 'las escapadas' : 'la escapada'}?</h4>
          ${esc2.map(d => `<div class="campo campo-escapada"><span>${esc(d.nombre)}</span>
            <input type="date" data-fecha-escapada="${d.id}" value="${esc(d.fechaPendiente ? '' : d.fecha)}" min="${esc(b.fechaInicio)}" max="${esc(b.fechaFin)}" ${d.fechaPendiente ? 'disabled' : ''}>
            <label class="check"><input type="checkbox" data-escapada-pendiente="${d.id}" ${d.fechaPendiente ? 'checked' : ''}> Todavía no lo decidí (depende del itinerario)</label></div>`).join('')}` : ''}
        <p class="ayuda">Con fechas, Tripbox calcula para cuándo conviene tener listo cada paso.</p>`;
      }

      if (n === 'Recorrido') {
        b.recorrido = R.recorrido.construir(b.origen, b.destinos, b.recorrido, 'avion');
        const M = R.recorrido.MEDIOS;
        if (!b.recorrido.length) return '<p class="texto-suave">Cargá al menos un destino para armar el recorrido.</p>';
        return `
        <h4 class="titulo-paso">¿Cómo te movés en cada tramo?</h4>
        <p class="ayuda">Si en un tramo cambiás de medio (por ejemplo, micro hasta otra ciudad y desde ahí avión), tocá "Pasar por otra ciudad".</p>
        ${!(b.origen && b.origen.nombre) ? '<p class="aviso-suave">Cargá desde dónde salís (paso 1) para armar también la ida y la vuelta.</p>' : ''}
        <div class="lista-tramos">${b.recorrido.map((t, ti) => `
          <div class="tramo-recorrido">
            <div class="tr-cab"><span class="tr-tipo tr-${t.tipo}">${R.recorrido.TIPOS_TRAMO[t.tipo]}</span><strong>${esc(t.desde.nombre || '¿?')} → ${esc(t.hasta.nombre)}</strong></div>
            ${t.segmentos.map((sg, si) => `
              <div class="segmento">
                ${t.segmentos.length > 1 ? `<small class="seg-etiqueta">${esc(sg.desde.nombre)} → ${esc(sg.hasta.nombre)}</small>` : ''}
                <div class="medios">${Object.entries(M).map(([k, m]) =>
                  `<button type="button" class="chip-medio ${sg.medio === k ? 'activo' : ''}" data-medio="${ti}|${si}|${k}" title="${m.nombre}"><span>${m.icono}</span>${m.nombre.replace(' / ferry', '').replace(' propio', '')}</button>`).join('')}</div>
                ${sg.medio === 'otro' ? `<input class="campo-otro" data-medio-otro="${ti}|${si}" value="${esc(sg.medioOtro || '')}" placeholder="¿Cuál? Ej: combi, motorhome, bici">` : ''}
                ${si < t.segmentos.length - 1 ? `<div class="parada">📍 Pasás por <strong>${esc(sg.hasta.nombre)}</strong> <button type="button" class="btn-texto-mini" data-unir="${ti}|${si}">Quitar</button></div>` : ''}
              </div>`).join('')}
            ${agregandoParada === ti ? `
              <div class="agregar-parada">
                <div id="lugarParada"></div>
                <div class="acciones-fila"><button type="button" class="btn btn-primario btn-chico" data-confirmar-parada="${ti}">Agregar parada</button><button type="button" class="btn btn-texto btn-chico" data-cancelar-parada>Cancelar</button></div>
              </div>` : `<button type="button" class="btn btn-suave btn-chico" data-parada="${ti}">+ Pasar por otra ciudad</button>`}
          </div>`).join('')}</div>`;
      }

      if (n === 'Estilo') {
        const det = deteccionInternacional(b.origen, b.destinos.filter(d => d.nombre));
        const inter = internacional();
        return `
        <h4 class="titulo-paso">¿Qué tipo de viaje es?</h4>
        <div class="chips-elegir">${TIPOS.map(t =>
          `<button type="button" class="chip-op ${b.tipo === t.id ? 'activo' : ''}" data-tipo="${t.id}">${t.icono} ${t.nombre}</button>`).join('')}</div>
        ${b.tipo === 'otro' ? `<label class="campo"><span>¿Qué tipo de viaje?</span><input id="aTipoOtro" value="${esc(b.tipoOtro)}" placeholder="Ej: luna de miel, estudio, recital, deportivo"></label>` : ''}
        <h4 class="titulo-paso">¿Salís del país en algún momento del viaje?</h4>
        ${det.estado === 'si' ? `<p class="aviso-suave">🌎 Detectamos que salís del país: ${det.paises.map(p => `${R.lugares.bandera(p.codigoPais)} ${esc(p.pais)}`).join(', ')}.</p>`
          : det.estado === 'no' ? '<p class="aviso-suave">📍 Por los destinos que cargaste, no salís del país.</p>' : ''}
        <div class="segmentado">
          <button type="button" data-inter="no" class="${!inter ? 'activo' : ''}">No salgo del país</button>
          <button type="button" data-inter="si" class="${inter ? 'activo' : ''}">Sí, en algún momento salgo</button>
        </div>
        <p class="ayuda">Aunque sea por un día, cuenta: cambia la documentación y el seguro.</p>
        <h4 class="titulo-paso">¿Hay algo más a tener en cuenta?</h4>
        <div class="checks-grilla">${EXTRAS.map(x =>
          `<label class="chip-check ${b.perfil[x.id] ? 'activo' : ''}"><input type="checkbox" data-extra="${x.id}" ${b.perfil[x.id] ? 'checked' : ''}> ${x.icono} ${esc(x.texto)}</label>`).join('')}</div>
        <div class="fila-agregar">
          <input id="aExtraManual" placeholder="Otra cosa (ej: llevar la bici, comprar ropa de nieve)">
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
        camposLugar.destinos.forEach((c, i) => { if (c && b.destinos[i]) Object.assign(b.destinos[i], c.obtener()); });
        b.nombre = v('aNombre');
      }
      if (n === 'Fechas') {
        const sin = cont.querySelector('#aSinFechas');
        b.sinFechas = sin ? sin.checked : b.sinFechas;
        b.fechaInicio = b.sinFechas ? '' : v('aInicio');
        b.fechaFin = b.sinFechas ? '' : v('aFin');
        cont.querySelectorAll('[data-noches]').forEach(x => { const d = b.destinos.find(y => y.id === x.dataset.noches); if (d) d.noches = x.value; });
        cont.querySelectorAll('[data-fecha-escapada]').forEach(x => { const d = b.destinos.find(y => y.id === x.dataset.fechaEscapada); if (d && !x.disabled) d.fecha = x.value; });
        cont.querySelectorAll('[data-escapada-pendiente]').forEach(x => { const d = b.destinos.find(y => y.id === x.dataset.escapadaPendiente); if (d) { d.fechaPendiente = x.checked; if (x.checked) d.fecha = ''; } });
      }
      if (n === 'Estilo') {
        cont.querySelectorAll('[data-extra]').forEach(x => { b.perfil[x.dataset.extra] = x.checked; });
        if (cont.querySelector('#aTipoOtro')) b.tipoOtro = v('aTipoOtro');
      }
      if (n === 'Recorrido') {
        cont.querySelectorAll('[data-medio-otro]').forEach(x => {
          const [ti, si] = x.dataset.medioOtro.split('|').map(Number);
          b.recorrido[ti].segmentos[si].medioOtro = x.value.trim();
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
      if (n === 'Fechas' && !b.sinFechas) {
        if (!b.fechaInicio) return 'Elegí la fecha de salida (o marcá que todavía no tenés fechas).';
        if (b.fechaFin && b.fechaFin < b.fechaInicio) return 'El regreso no puede ser antes de la salida.';
        const total = b.fechaFin ? U.diasEntre(b.fechaInicio, b.fechaFin) : null;
        const suma = b.destinos.filter(d => !d.soloDia).reduce((a, d) => a + U.numero(d.noches), 0);
        if (total != null && suma > total) return `Las noches por destino (${suma}) superan las del viaje (${total}).`;
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
        camposLugar.origen = R.lugares.campo(cont.querySelector('#lugarOrigen'), { valor: b.origen, placeholder: 'Tu ciudad de salida', alCambiar: avisar });
        camposLugar.destinos = b.destinos.map((d, i) => R.lugares.campo(cont.querySelector(`[data-lugar-destino="${i}"]`), {
          valor: d, placeholder: d.soloDia ? 'Lugar que visitás en el día' : 'Ej: Bariloche, Río de Janeiro, Madrid',
          alCambiar: () => { avisar(); }
        }));
        avisar();
        cont.querySelector('[data-a="masDestino"]').onclick = () => { leerPaso(); b.destinos.push(nuevoDestino(false)); pintar(); };
        cont.querySelector('[data-a="masEscapada"]').onclick = () => { leerPaso(); b.destinos.push(nuevoDestino(true)); pintar(); };
        cont.querySelectorAll('[data-quitar-destino]').forEach(x => x.onclick = () => { leerPaso(); b.destinos.splice(Number(x.dataset.quitarDestino), 1); pintar(); });
      }

      if (n === 'Fechas') {
        const sinF = cont.querySelector('#aSinFechas');
        sinF.onchange = () => { leerPaso(); pintar(); };
        // Se redibuja al salir del campo (no en cada dígito) para no perder el foco mientras se escribe
        ['#aInicio', '#aFin'].forEach(s => { cont.querySelector(s).onblur = () => {
          const antes = `${b.fechaInicio}|${b.fechaFin}`;
          leerPaso();
          if (antes !== `${b.fechaInicio}|${b.fechaFin}`) pintar();
        }; });
        cont.querySelectorAll('[data-escapada-pendiente]').forEach(x => x.onchange = () => { leerPaso(); pintar(); });
        const control = cont.querySelector('#controlNoches');
        cont.querySelectorAll('[data-noches]').forEach(x => x.oninput = () => {
          if (!control || !b.fechaInicio || !b.fechaFin) return;
          const total = U.diasEntre(b.fechaInicio, b.fechaFin);
          const suma = Array.from(cont.querySelectorAll('[data-noches]')).reduce((a, y) => a + U.numero(y.value), 0);
          control.textContent = `Asignaste ${suma} de ${U.plural(total, 'noche', 'noches')}.`;
          control.classList.toggle('error', suma > total);
        });
      }

      if (n === 'Estilo') {
        cont.querySelectorAll('[data-tipo]').forEach(x => x.onclick = () => { leerPaso(); b.tipo = x.dataset.tipo; pintar(); });
        cont.querySelectorAll('[data-inter]').forEach(x => x.onclick = () => { leerPaso(); b.perfil.internacionalManual = x.dataset.inter === 'si'; pintar(); });
        cont.querySelectorAll('[data-extra]').forEach(x => x.onchange = () => x.closest('.chip-check').classList.toggle('activo', x.checked));
        const input = cont.querySelector('#aExtraManual');
        const agregar = () => { const t = input.value.trim(); if (!t) return; leerPaso(); b.extrasManuales.push(t); pintar(); cont.querySelector('#aExtraManual').focus(); };
        cont.querySelector('[data-a="agregarExtra"]').onclick = agregar;
        input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } };
        cont.querySelectorAll('[data-quitar-extra]').forEach(x => x.onclick = () => { leerPaso(); b.extrasManuales.splice(Number(x.dataset.quitarExtra), 1); pintar(); });
      }

      if (n === 'Recorrido') {
        cont.querySelectorAll('[data-medio]').forEach(x => x.onclick = () => {
          leerPaso();
          const [ti, si, medio] = x.dataset.medio.split('|');
          b.recorrido[Number(ti)].segmentos[Number(si)].medio = medio;
          pintar();
          if (medio === 'otro') { const i = cont.querySelector(`[data-medio-otro="${ti}|${si}"]`); if (i) i.focus(); }
        });
        cont.querySelectorAll('[data-parada]').forEach(x => x.onclick = () => { leerPaso(); agregandoParada = Number(x.dataset.parada); pintar(); });
        const contParada = cont.querySelector('#lugarParada');
        if (contParada) {
          campoParada = R.lugares.campo(contParada, { placeholder: 'Ciudad por la que pasás (ej: Buenos Aires)' });
          campoParada.input.focus();
        }
        const conf = cont.querySelector('[data-confirmar-parada]');
        if (conf) conf.onclick = () => {
          const l = campoParada.obtener();
          if (!l.nombre) { U.toast('Escribí la ciudad por la que pasás.'); return; }
          leerPaso();
          const t = b.recorrido[Number(conf.dataset.confirmarParada)];
          R.recorrido.dividir(t, t.segmentos.length - 1, l);
          agregandoParada = null;
          pintar();
        };
        const canc = cont.querySelector('[data-cancelar-parada]');
        if (canc) canc.onclick = () => { agregandoParada = null; pintar(); };
        cont.querySelectorAll('[data-unir]').forEach(x => x.onclick = () => {
          leerPaso();
          const [ti, si] = x.dataset.unir.split('|').map(Number);
          R.recorrido.unir(b.recorrido[ti], si);
          pintar();
        });
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
      const temp = Object.assign({ tareas: {}, tareasPropias: [], participantes: ['yo'], itinerario: [], documentos: [], movimientos: [], cambios: [], valija: { items: [], listas: [] } }, datosDelViaje());
      recalcularTramos(temp);
      const incluye = b.resuelto.paquete ? b.paqueteIncluye : [];
      return R.motor.lista(temp).filter(t => !t.rec && t.fase !== 'definir' && t.base !== 'pq_paquete' && !R.formularios.incluidoEnPaquete(t, incluye));
    }

    /** Convierte los viajeros del asistente en personas guardadas (sin duplicar). */
    function resolverViajeros() {
      return ['yo'].concat(b.viajeros.map(p => {
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
      perfil.transporte = R.recorrido.medioPrincipal(recorrido);
      return {
        nombre: b.nombre, origen: b.origen, destinos, recorrido, tipoOtro: b.tipo === 'otro' ? b.tipoOtro : '',
        fechaInicio: b.fechaInicio || '', fechaFin: b.fechaFin || '',
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
        const antes = { inicio: v.fechaInicio, fin: v.fechaFin, destinos: conAlojamiento(v).map(d => normal(d.nombre)).join('|'), participantes: v.participantes.slice().sort().join('|') };
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
        if (R.motor.estado(v, 'd_fechas') === 'revisar' && v.fechaInicio && v.fechaFin) R.motor.setEstado(v, 'd_fechas', 'hecha');
        R.db.guardarViaje(v);
        U.cerrarModal();
        R.app.refrescar();

        const motivos = [];
        if ((antes.inicio !== v.fechaInicio || antes.fin !== v.fechaFin) && hayAvanceDespuesDe(v, 'd_fechas')) motivos.push('fechas');
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
      recalcularTramos(v);
      agregarExtrasManuales(v);

      const ahora = new Date().toISOString();
      const marcar = id => { v.tareas[id] = Object.assign({}, v.tareas[id], { estado: 'hecha', fechaHecha: ahora }); };
      marcar('d_destino');
      marcar('d_participantes');
      if (v.fechaInicio && v.fechaFin) marcar('d_fechas');

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
    if (motivos.includes('fechas') && v.fechaInicio && v.fechaFin) R.motor.setEstado(v, 'd_fechas', 'hecha');
    if (motivos.includes('destino') && v.destino) R.motor.setEstado(v, 'd_destino', 'hecha');
    if (motivos.includes('participantes')) R.motor.setEstado(v, 'd_participantes', 'hecha');
  }

  /* ---------------------------------------------------------
     Vista de un viaje
     --------------------------------------------------------- */
  function renderViaje(app, v, pestana) {
    const prog = R.motor.progreso(v);
    const tipo = tipoDe(v);
    const personas = v.participantes.map(id => R.db.persona(id)).filter(Boolean);
    if (!PESTANAS.some(p => p.id === pestana)) pestana = 'guia';

    app.innerHTML = `
      <section class="portada-viaje" style="background:${U.portada(v.destino)}">
        ${U.paisaje(v)}
        <div class="portada-contenido">
          <a href="#inicio" class="volver">← Mis viajes</a>
          <div class="portada-fila">
            <div>
              <span class="etiqueta-clara">${tipo.icono} ${esc(tipo.nombre)}${etiquetaTransporte(v) ? ' · ' + esc(etiquetaTransporte(v)) : ''}${v.perfil.internacional ? ' · 🌎 Internacional' : ''}${v.perfil.paquete ? ' · 📦 Paquete' : ''}</span>
              <h1>${esc(v.nombre || conAlojamiento(v).map(d => d.nombre).join(' → ') || v.destino)}</h1>
              <p class="portada-meta">${esc(destinoCompleto(v))} · ${esc(U.fmtRango(v.fechaInicio, v.fechaFin))}</p>
              <p class="portada-cuenta">${esc(cuentaRegresiva(v))}</p>
              <div class="portada-avatares">${personas.map(p => U.avatar(p, 30)).join('')}</div>
            </div>
            <div class="portada-lado">
              ${U.anillo(prog.pct, 92, 'listo')}
              <div class="portada-acciones">
                <button class="btn btn-vidrio btn-chico" data-a="editar">Editar</button>
                <button class="btn btn-vidrio btn-chico" data-a="eliminar" title="Eliminar viaje">Eliminar</button>
              </div>
            </div>
          </div>
        </div>
      </section>
      <nav class="pestanas" role="tablist">
        ${PESTANAS.map(p => `<a role="tab" href="#viaje/${v.id}/${p.id}" class="pestana ${p.id === pestana ? 'activa' : ''}"><span>${p.icono}</span>${p.nombre}</a>`).join('')}
      </nav>
      <section class="contenido-pestana" id="contPestana"></section>`;

    app.querySelector('[data-a="editar"]').onclick = () => abrirAsistente(v);
    app.querySelector('[data-a="eliminar"]').onclick = async () => {
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
        <div class="tv-portada" style="background:${U.portada(v.destino)}">
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
