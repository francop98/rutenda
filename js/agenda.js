/* =========================================================
   Rutenda — el viaje (datos)
   Todo lo que pasa en el viaje vive en tres listas que
   escribís vos; la app no deduce nada:
   - agenda: lo que hacés cada día (vuelos, micros, paseos,
     comidas…). Lo que no tiene día es una idea ("Quiero hacer").
   - alojamientos: dónde dormís, de qué noche a qué noche.
   - pendientes: tu lista de cosas por hacer.
   También pasa los viajes de versiones anteriores a este
   esquema sin borrar nada de lo que tenían.
   ========================================================= */
window.R = window.R || {};

R.agenda = (function () {
  const U = R.util;

  /* ---------- Tipos de cosas en el itinerario ---------- */
  const TIPOS = {
    vuelo: { icono: '✈️', nombre: 'Vuelo', traslado: true, medio: 'avion' },
    micro: { icono: '🚌', nombre: 'Micro', traslado: true, medio: 'micro' },
    tren: { icono: '🚆', nombre: 'Tren', traslado: true, medio: 'tren' },
    barco: { icono: '⛴️', nombre: 'Barco', traslado: true, medio: 'barco' },
    auto: { icono: '🚗', nombre: 'Auto', traslado: true, medio: 'auto' },
    traslado: { icono: '🚐', nombre: 'Transfer', traslado: true, medio: 'transfer' },
    taxi: { icono: '🚕', nombre: 'Taxi o remis', traslado: true, medio: 'taxi' },
    otromedio: { icono: '🧭', nombre: 'Otro medio', traslado: true, medio: 'otro' },
    paseo: { icono: '📍', nombre: 'Paseo' },
    excursion: { icono: '🥾', nombre: 'Excursión' },
    comida: { icono: '🍽️', nombre: 'Comida' },
    entrada: { icono: '🎟️', nombre: 'Entrada' },
    otro: { icono: '📝', nombre: 'Otro' }
  };
  const ORDEN_TIPOS = ['paseo', 'excursion', 'comida', 'entrada', 'vuelo', 'micro', 'tren', 'barco', 'auto', 'traslado', 'taxi', 'otromedio', 'otro'];
  // Los que se muestran para elegir (los demás aparecen solo si algo ya es de ese tipo)
  const TIPOS_A_LA_VISTA = ['paseo', 'comida', 'excursion', 'vuelo', 'micro', 'tren', 'auto', 'traslado', 'taxi', 'otro'];
  /** Con horario fijo (hay que estar a una hora en un aeropuerto, terminal, estación o puerto). */
  const PROGRAMADOS = ['vuelo', 'micro', 'tren', 'barco'];
  const esProgramado = it => PROGRAMADOS.includes(it && it.tipo);
  const TERMINAL = { vuelo: 'aeropuerto', micro: 'terminal', tren: 'estación', barco: 'puerto' };
  /** Cómo llegás a la terminal o de la terminal a donde vas. */
  const CONEXIONES = [['taxi', '🚕', 'Taxi o remis'], ['transfer', '🚐', 'Transfer'], ['colectivo', '🚌', 'Colectivo'], ['buscan', '🙋', 'Me buscan / llevan'], ['auto', '🚗', 'En auto'], ['pie', '🚶', 'Caminando'], ['no', '✕', 'No hace falta']];
  const conexion = k => CONEXIONES.find(c => c[0] === k) || null;
  /** Cuántas conexiones de este traslado falta resolver (0, 1 o 2). */
  function conexionesFaltan(it) { return esProgramado(it) ? (it.alSalir ? 0 : 1) + (it.alLlegar ? 0 : 1) : 0; }
  const tipo = t => TIPOS[t] || TIPOS.otro;
  const esTraslado = it => !!tipo(it.tipo).traslado;
  const normal = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

  /* ---------- Lectura ---------- */
  function items(v) { return v.agenda || []; }
  /** Lo de un día, ordenado por hora (lo que no tiene hora va al final). */
  function delDia(v, fecha) {
    return items(v).filter(it => it.fecha === fecha).sort((a, b) => (a.hora || '99').localeCompare(b.hora || '99'));
  }
  /** "Quiero hacer allá": lo que todavía no tiene día. */
  function ideas(v) { return items(v).filter(it => !it.fecha && !it.tramo); }
  function item(v, id) { return items(v).find(it => it.id === id) || null; }
  function alojamiento(v, id) { return (v.alojamientos || []).find(a => a.id === id) || null; }
  /** "Hotel Patagonia", o "Alojamiento en Bariloche" si todavía no tiene nombre. */
  function nombreAlojamiento(a) { return (a && a.nombre) || (a && a.ciudad ? `Alojamiento en ${a.ciudad}` : 'Alojamiento'); }

  /** Dónde dormís la noche de esa fecha (la que vos cargaste; nunca se deduce). */
  function nocheDe(v, fecha) {
    return (v.alojamientos || []).find(a => a.desde && a.hasta && a.desde <= fecha && fecha < a.hasta) || null;
  }

  /** Los días que se muestran: del inicio al fin del viaje (y cualquier día que tenga algo cargado). */
  function dias(v) {
    const set = new Set();
    if (v.fechaInicio) {
      const fin = v.fechaFin && v.fechaFin >= v.fechaInicio ? v.fechaFin : v.fechaInicio;
      for (let f = v.fechaInicio, n = 0; f <= fin && n < 120; f = U.sumarDias(f, 1), n++) set.add(f);
    }
    items(v).forEach(it => { if (it.fecha) set.add(it.fecha); });
    (v.alojamientos || []).forEach(a => { if (a.desde) set.add(a.desde); if (a.hasta) set.add(a.hasta); });
    return Array.from(set).sort();
  }

  /** Archivos de una cosa del itinerario o de un alojamiento (también los de versiones anteriores). */
  function docsDe(v, id) {
    return (v.documentos || []).filter(d => d.itemId === id || (!d.itemId && viejoA(d.tareaId) === id));
  }
  function viejoA(tareaId) {
    const t = String(tareaId || '');
    if (t.startsWith('t_segmento__')) return 'm_' + t.slice(12);
    if (t.startsWith('a_reserva__')) return 'h_' + t.slice(11);
    if (t.startsWith('plan_')) return 'p_' + t.slice(5);
    return '';
  }

  /* ---------- Escritura ---------- */
  function nuevoItem(datos) {
    return Object.assign({ id: U.id('it'), fecha: '', hora: '', tipo: 'paseo', titulo: '', lugar: '', nota: '', creado: new Date().toISOString() }, datos);
  }
  function guardarItem(v, it) {
    v.agenda = items(v).filter(x => x.id !== it.id).concat([it]);
  }
  function borrarItem(v, id) {
    v.agenda = items(v).filter(x => x.id !== id);
    v.movimientos = (v.movimientos || []).filter(m => m.origenItem !== id);
  }
  function guardarAlojamiento(v, a) {
    v.alojamientos = (v.alojamientos || []).filter(x => x.id !== a.id).concat([a]);
  }
  function borrarAlojamiento(v, id) {
    v.alojamientos = (v.alojamientos || []).filter(x => x.id !== id);
    v.movimientos = (v.movimientos || []).filter(m => m.origenItem !== id);
  }

  /** Un traslado ya cargado entre los mismos lugares (y el mismo día, o sin día): para no duplicarlo al pegar una reserva. */
  function parecido(v, nuevo) {
    const igual = (a, b) => { const x = normal(a), y = normal(b); return x && y && (x === y || x.includes(y) || y.includes(x)); };
    return items(v).find(it => it.id !== nuevo.id && esTraslado(it) && igual(it.desde, nuevo.desde) && igual(it.hasta, nuevo.hasta) && (!it.fecha || !nuevo.fecha || it.fecha === nuevo.fecha)) || null;
  }

  /* ---------- Para el mapa, Google Maps, el resumen y el PDF ---------- */
  const MEDIOS = {
    avion: { icono: '✈️', nombre: 'Avión' }, micro: { icono: '🚌', nombre: 'Micro' }, auto: { icono: '🚗', nombre: 'Auto' },
    tren: { icono: '🚆', nombre: 'Tren' }, barco: { icono: '⛴️', nombre: 'Barco' }, taxi: { icono: '🚕', nombre: 'Taxi o remis' },
    transfer: { icono: '🚐', nombre: 'Transfer' }, otro: { icono: '🧭', nombre: 'Traslado' }
  };
  function lugarConocido(v, nombre) {
    const n = normal(nombre);
    if (!n) return null;
    const cand = [v.origen].concat(v.destinos || []).filter(x => x && x.nombre);
    return cand.find(x => normal(x.nombre) === n) || cand.find(x => n.includes(normal(x.nombre)) || normal(x.nombre).includes(n)) || null;
  }
  /** Los traslados como tramos { desde, hasta, medio, sale, llega } (con coordenadas si se conocen). */
  function segmentos(v) {
    return items(v).filter(it => esTraslado(it) && it.fecha && (it.desde || it.hasta))
      .sort((a, b) => (a.fecha + (a.hora || '')).localeCompare(b.fecha + (b.hora || '')))
      .map(it => {
        const lugar = n => Object.assign({ nombre: n || '' }, lugarConocido(v, n) || {}, { nombre: n || '' });
        return {
          id: it.id, medio: tipo(it.tipo).medio, desde: lugar(it.desde), hasta: lugar(it.hasta),
          sale: { fecha: it.fecha, hora: it.hora || '' }, llega: { fecha: it.fechaLlegada || it.fecha, hora: it.horaLlegada || '' },
          empresa: it.empresa || '', numero: it.numero || '', codigo: it.codigo || ''
        };
      });
  }
  /** Las ciudades del viaje en orden: por los traslados, o origen → destinos → origen. */
  function paradas(v) {
    const segs = segmentos(v).filter(s => s.desde.nombre && s.hasta.nombre);
    if (segs.length) {
      const r = [segs[0].desde];
      segs.forEach(s => r.push(s.hasta));
      return r.filter((x, i) => i === 0 || normal(x.nombre) !== normal(r[i - 1].nombre));
    }
    const ds = (v.destinos || []).filter(d => d.nombre && !d.soloDia);
    const o = v.origen && v.origen.nombre ? [v.origen] : [];
    return o.concat(ds, ds.length ? o : []);
  }
  /** Cómo se mueve el viaje (para el dibujo de la portada). */
  function medioPrincipal(v) {
    const cuenta = {};
    // Taxis y transfers no cuentan: el dibujo es del medio con el que hacés el viaje
    segmentos(v).filter(s => ['avion', 'micro', 'auto', 'tren', 'barco'].includes(s.medio)).forEach(s => { cuenta[s.medio] = (cuenta[s.medio] || 0) + 1; });
    const top = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a])[0];
    return top || (v.perfil && v.perfil.transporte) || 'avion';
  }
  function etiquetaSegmento(s) {
    const m = MEDIOS[s.medio] || MEDIOS.otro;
    return `${m.icono} ${s.desde.nombre || '?'} → ${s.hasta.nombre || '?'}${s.sale.fecha ? ' · ' + U.fmtFecha(s.sale.fecha, 'dia') : ''}${s.sale.hora ? ' ' + s.sale.hora : ''}`;
  }

  /* ---------- Check-in online de un vuelo (según la aerolínea) ---------- */
  const CHECKIN_HORAS = [
    [/jet ?smart|^(WJ|JA)\d/i, 72, 'JetSMART'],
    [/aerol[ií]neas argentinas|^AR\d/i, 24, 'Aerolíneas Argentinas'],
    [/flybondi|^FO\d/i, 48, 'Flybondi'],
    [/latam|^(LA|JJ|LP|XL|4C)\d/i, 48, 'LATAM'],
    [/gol\b|^G3\d/i, 48, 'Gol'],
    [/azul|^AD\d/i, 72, 'Azul'],
    [/copa|^CM\d/i, 24, 'Copa'],
    [/sky|^H2\d/i, 48, 'Sky'],
    [/iberia|^IB\d/i, 24, 'Iberia'],
    [/air europa|^UX\d/i, 24, 'Air Europa']
  ];
  /** Cuándo se habilita el check-in de un vuelo: { fecha, hora, horas, aerolinea } (solo si se sabe la aerolínea). */
  function checkin(it) {
    if (!it || it.tipo !== 'vuelo' || !it.fecha) return null;
    const num = String(it.numero || '').replace(/\s/g, '');
    const fila = CHECKIN_HORAS.find(([re]) => re.test(num) || re.test(it.empresa || ''));
    if (!fila) return null;
    const [hh, mm] = (it.hora || '12:00').split(':').map(Number);
    const sale = new Date(it.fecha + 'T00:00:00');
    sale.setHours(hh || 0, mm || 0, 0, 0);
    const abre = new Date(sale.getTime() - fila[1] * 3600000);
    const dos = n => String(n).padStart(2, '0');
    return { fecha: `${abre.getFullYear()}-${dos(abre.getMonth() + 1)}-${dos(abre.getDate())}`, hora: it.hora ? `${dos(abre.getHours())}:${dos(abre.getMinutes())}` : '', horas: fila[1], aerolinea: fila[2] };
  }
  /** "AR1672" → "Aerolíneas Argentinas" */
  function aerolineaDe(numero) {
    const m = String(numero || '').toUpperCase().replace(/\s/g, '').match(/^([A-Z0-9]{2})\d{1,4}$/);
    return m && R.lector ? R.lector.AEROLINEAS[m[1]] || '' : '';
  }
  /** Empresas y lugares que ya usaste (para sugerirlos al escribir). */
  function usados(campo) {
    const set = new Map();
    const sumar = x => { const t = String(x || '').trim(); if (t.length > 1 && !set.has(t.toLowerCase())) set.set(t.toLowerCase(), t); };
    (R.db.viajes() || []).forEach(v => {
      if (campo === 'alojamiento') (v.alojamientos || []).forEach(a => sumar(a.nombre));
      else (v.agenda || []).forEach(it => sumar(it[campo]));
    });
    if (campo === 'empresa' && R.lector) Object.values(R.lector.AEROLINEAS).forEach(sumar);
    return U.ordenAlfa(Array.from(set.values()), x => x);
  }

  /* ---------------------------------------------------------
     Viajes de versiones anteriores → este esquema
     No borra nada: solo agrega agenda, alojamientos y pendientes.
     Los ids salen de los datos viejos, así da lo mismo en todos los dispositivos.
     --------------------------------------------------------- */
  const MEDIO_A_TIPO = { avion: 'vuelo', micro: 'micro', tren: 'tren', barco: 'barco', auto: 'auto', otro: 'traslado' };
  const EVENTO_A_TIPO = { actividad: 'paseo', comida: 'comida', traslado: 'traslado', alojamiento: 'otro', excursion: 'excursion', vuelo: 'vuelo', otro: 'otro' };
  const PLAN_A_TIPO = { lugar: 'paseo', comida: 'comida', excursion: 'excursion', entrada: 'entrada', actividad: 'paseo', otro: 'paseo' };

  function migrar(v) {
    if (v.v2) return false;
    const agenda = [];
    const tareas = v.tareas || {};
    const segs = [];
    (Array.isArray(v.recorrido) ? v.recorrido : []).forEach(t => (t.segmentos || []).forEach(s => { if (s && s.desde && s.hasta) segs.push(s); }));

    // Traslados (con lo que se había cargado en cada pasaje)
    segs.forEach(s => {
      const d = (tareas['t_segmento__' + s.id] || {}).datos || {};
      const tramos = (d.tramos || []).filter(x => x && (x.numero || x.empresa || x.fechaSalida || x.horaSalida));
      const tipoIt = MEDIO_A_TIPO[s.medio] || 'traslado';
      const extra = [d.asientos ? 'Asientos ' + d.asientos : '', d.equipaje && d.equipaje !== 'Sin definir' ? d.equipaje : '', d.condiciones || ''].filter(Boolean).join(' · ');
      const base = (tr, i) => {
        const desde = (tr && tr.desde) || (s.desde || {}).nombre || '';
        const hasta = (tr && tr.hasta) || (s.hasta || {}).nombre || '';
        return {
          id: 'm_' + s.id + (i ? '_' + i : ''), tipo: tipoIt,
          fecha: (tr && tr.fechaSalida) || (s.sale || {}).fecha || '', hora: (tr && tr.horaSalida) || (s.sale || {}).hora || '',
          fechaLlegada: (tr && tr.fechaLlegada) || (s.llega || {}).fecha || '', horaLlegada: (tr && tr.horaLlegada) || (s.llega || {}).hora || '',
          desde, hasta, titulo: `${desde || '?'} → ${hasta || '?'}`,
          empresa: (tr && tr.empresa) || '', numero: (tr && tr.numero) || '', codigo: d.codigo || '',
          lugar: '', nota: i ? '' : extra, creado: v.creado || ''
        };
      };
      const lista = tramos.length ? tramos.map(base) : [base(null, 0)];
      lista.forEach(it => { if (it.fecha) agenda.push(it); });
    });

    // Lo que se había cargado a mano en el itinerario (no los traslados ni check-in, que ya están)
    (v.itinerario || []).filter(e => e && e.fecha && !/^(t_segmento__|a_reserva)/.test(e.origen || '')).forEach(e => {
      agenda.push({ id: 'e_' + e.id, fecha: e.fecha, hora: e.hora || '', tipo: EVENTO_A_TIPO[e.tipo] || 'otro', titulo: e.titulo || '', lugar: e.lugar || '', nota: e.nota || '', codigo: e.confirmacion || '', creado: v.creado || '' });
    });

    // "Qué hacer": lo que iba con día al día; lo que iba sin día, a "Quiero hacer"
    Object.values(v.planes || {}).forEach(l => (l || []).forEach(p => {
      if (!p || p.estado === 'descarto' || !p.titulo) return;
      agenda.push({
        id: 'p_' + p.id, fecha: p.estado === 'va' ? (p.fecha || '') : '', hora: p.hora || '', tipo: PLAN_A_TIPO[p.tipo] || 'paseo',
        titulo: p.titulo, lugar: p.lugar || '', nota: [p.nota, p.reservado && p.codigo ? 'Reserva ' + p.codigo : '', p.duracion ? '⏱ ' + p.duracion : ''].filter(Boolean).join(' · '),
        codigo: p.codigo || '', creado: v.creado || ''
      });
    }));

    // Alojamientos con datos cargados (sin datos, no se inventa nada)
    const llegaA = dst => { const s = segs.find(x => normal((x.hasta || {}).nombre) === normal(dst.nombre)); return s ? ((s.llega || {}).fecha || (s.sale || {}).fecha || '') : ''; };
    const saleDe = dst => { const s = segs.slice().reverse().find(x => normal((x.desde || {}).nombre) === normal(dst.nombre)); return s ? ((s.sale || {}).fecha || '') : ''; };
    const alojamientos = [];
    (v.destinos || []).forEach(dst => {
      const d = (tareas['a_reserva__' + dst.id] || {}).datos;
      if (!d || !d.nombre) return;
      alojamientos.push({
        id: 'h_' + dst.id, nombre: d.nombre, direccion: d.direccion || '',
        desde: d.checkinFecha || llegaA(dst) || '', hasta: d.checkoutFecha || saleDe(dst) || '',
        checkin: d.checkinHora || '', checkout: d.checkoutHora || '', codigo: d.codigo || '',
        nota: [d.contacto, d.desayuno ? 'Con desayuno' : '', d.cancelacionHasta ? 'Cancelación gratis hasta ' + U.fmtFecha(d.cancelacionHasta, 'corto') : ''].filter(Boolean).join(' · ')
      });
    });

    // Tus pasos propios → pendientes
    const pendientes = (v.tareasPropias || []).filter(t => t && t.titulo && !String(t.origen || '').startsWith('plan_')).map(t => ({
      id: 'q_' + t.id, texto: t.titulo, hecho: ((tareas[t.id] || {}).estado === 'hecha'), fecha: ''
    }));
    // El seguro, si estaba cargado, queda anotado
    const seg = (tareas.p_seguro || {}).datos;
    if (seg && seg.compania) pendientes.push({ id: 'q_seguro', texto: `Seguro: ${seg.compania}${seg.poliza ? ' · ' + seg.poliza : ''}${seg.telefono ? ' · Emergencias ' + seg.telefono : ''}`, hecho: true, fecha: '' });

    // Valija: una sola lista para todos
    const comun = { items: [] };
    Object.values(v.valijas || {}).forEach(val => (val && val.items || []).forEach(i => {
      if (!i || !i.texto || comun.items.some(x => normal(x.texto) === normal(i.texto))) return;
      comun.items.push({ id: i.id || U.id('vi'), texto: i.texto, categoria: i.categoria || i.cat || 'otros', hecho: !!i.hecho });
    }));

    v.agenda = (v.agenda || []).concat(agenda);
    v.alojamientos = (v.alojamientos || []).concat(alojamientos);
    v.pendientes = (v.pendientes || []).concat(pendientes);
    v.valijas = Object.assign({}, v.valijas || {});
    if (!v.valijas.comun) v.valijas.comun = comun;
    v.v2 = 26;
    return true;
  }

  return {
    TIPOS, ORDEN_TIPOS, TIPOS_A_LA_VISTA, MEDIOS, tipo, esTraslado, PROGRAMADOS, esProgramado, TERMINAL, CONEXIONES, conexion, conexionesFaltan,
    items, delDia, ideas, item, parecido, alojamiento, nombreAlojamiento, nocheDe, dias, docsDe,
    nuevoItem, guardarItem, borrarItem, guardarAlojamiento, borrarAlojamiento,
    segmentos, paradas, medioPrincipal, etiquetaSegmento, lugarConocido, checkin, aerolineaDe, usados, migrar
  };
})();
