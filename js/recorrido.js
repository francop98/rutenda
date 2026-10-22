/* =========================================================
   Rutenda — cronograma del viaje
   Única fuente de verdad de la cronología.

   El viaje es una secuencia de traslados (segmentos) agrupados
   en tramos: ida (origen → primer destino), entre destinos y
   vuelta (último destino → casa). Cada traslado tiene:
     sale  { fecha, hora }   llega { fecha, hora }
     estado: 'a_definir' | 'estimado' | 'confirmado'
     noche:  true si hacés noche en la ciudad donde termina
             (solo para paradas intermedias de un tramo)
   Las noches en cada destino NO se escriben: se calculan entre
   la llegada y la siguiente salida. Las fechas del viaje
   (fechaInicio / fechaFin) y las de cada destino (desde / hasta)
   se derivan de acá con recalcular(v).
   ========================================================= */
window.R = window.R || {};

R.recorrido = (function () {
  const MEDIOS = {
    avion: { nombre: 'Avión', icono: '✈️', titulo: (a, b) => `Vuelo ${a} → ${b}`, impacto: 5, anticipacion: 60, conexionMin: 90, porque: 'Los vuelos suben de precio y se agotan; además fijan los horarios de todo lo demás.' },
    micro: { nombre: 'Micro', icono: '🚌', titulo: (a, b) => `Pasaje de micro ${a} → ${b}`, impacto: 4, anticipacion: 30, conexionMin: 30, porque: 'En temporada los micros se llenan; define a qué hora llegás.' },
    auto: { nombre: 'Auto propio', icono: '🚗', titulo: (a, b) => `Planificar el viaje en auto ${a} → ${b}`, impacto: 3, anticipacion: 14, conexionMin: 0, porque: 'Define paradas, horarios y si hace falta dormir en el camino.' },
    tren: { nombre: 'Tren', icono: '🚆', titulo: (a, b) => `Pasaje de tren ${a} → ${b}`, impacto: 4, anticipacion: 30, conexionMin: 30, porque: 'Los pasajes de tren tienen cupo limitado.' },
    barco: { nombre: 'Barco / ferry', icono: '⛴️', titulo: (a, b) => `Barco o ferry ${a} → ${b}`, impacto: 4, anticipacion: 45, conexionMin: 60, porque: 'Los cupos (sobre todo con auto) se agotan.' },
    otro: { nombre: 'Otro', icono: '🧭', titulo: (a, b, s) => `${s && s.medioOtro ? s.medioOtro : 'Transporte'} ${a} → ${b}`, impacto: 3, anticipacion: 30, conexionMin: 30, porque: 'Resolverlo con tiempo evita sorpresas.' }
  };
  const TIPOS_TRAMO = { ida: 'Ida', entre: 'Entre destinos', vuelta: 'Vuelta' };
  const ESTADOS = {
    a_definir: { nombre: 'A definir', clase: 'cr-adefinir' },
    estimado: { nombre: 'Estimado', clase: 'cr-estimado' },
    confirmado: { nombre: 'Confirmado', clase: 'cr-confirmado' }
  };
  const normal = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const nuevoId = p => (R.util ? R.util.id(p) : p + Math.random().toString(36).slice(2, 8));
  const lugar = l => ({
    nombre: (l && l.nombre) || '', region: (l && l.region) || '', pais: (l && l.pais) || '', codigoPais: (l && l.codigoPais) || '',
    lat: l && l.lat != null ? l.lat : null, lon: l && l.lon != null ? l.lon : null, zona: (l && l.zona) || ''
  });
  const medio = id => MEDIOS[id] || MEDIOS.otro;
  const sumar = (f, n) => (f && R.util ? R.util.sumarDias(f, n) : '');
  const dias = (a, b) => (a && b && R.util ? R.util.diasEntre(a, b) : null);

  function nuevoSegmento(desde, hasta, m) {
    return { id: nuevoId('seg'), desde: lugar(desde), hasta: lugar(hasta), medio: m || 'avion', medioOtro: '', sale: { fecha: '', hora: '' }, llega: { fecha: '', hora: '' }, estado: 'a_definir', noche: false };
  }
  /** Completa campos de versiones anteriores. */
  function normalizarSegmento(s) {
    s.sale = Object.assign({ fecha: '', hora: '' }, s.sale || {});
    s.llega = Object.assign({ fecha: '', hora: '' }, s.llega || {});
    if (!s.estado) s.estado = s.sale.fecha ? 'estimado' : 'a_definir';
    s.noche = !!s.noche;
    s.medioOtro = s.medioOtro || '';
    s.desde = lugar(s.desde); s.hasta = lugar(s.hasta);
    return s;
  }

  /* ---------------------------------------------------------
     Construcción de tramos
     --------------------------------------------------------- */
  /**
   * Arma (o actualiza) los tramos a partir del origen y los destinos con alojamiento,
   * conservando lo cargado en tramos con los mismos extremos.
   */
  /**
   * opciones: { soloIda } — sin tramo de vuelta.
   * Si el último destino es tu misma ciudad de salida, se toma como la vuelta (no se duplica).
   */
  function construir(origen, destinos, previo, medioDefecto, opciones) {
    const op = opciones || {};
    const lista = (destinos || []).filter(d => d.nombre && !d.soloDia);
    while (lista.length > 1 && origen && origen.nombre && normal(lista[lista.length - 1].nombre) === normal(origen.nombre)) lista.pop();
    const anterior = (previo || []).map(t => Object.assign({}, t, { segmentos: (t.segmentos || []).map(normalizarSegmento) }));
    const m = medioDefecto || 'avion';
    const hayOrigen = origen && origen.nombre;
    if (!lista.length) return [];
    const pares = [];
    if (hayOrigen) pares.push(['ida', origen, lista[0]]);
    for (let i = 1; i < lista.length; i++) pares.push(['entre', lista[i - 1], lista[i]]);
    if (hayOrigen && !op.soloIda) pares.push(['vuelta', lista[lista.length - 1], origen]);

    return pares.map(([tipo, desde, hasta]) => {
      const nD = normal(desde.nombre), nH = normal(hasta.nombre);
      const igual = anterior.find(t => t.tipo === tipo && normal(t.desde.nombre) === nD && normal(t.hasta.nombre) === nH);
      if (igual) {
        const segs = igual.segmentos;
        // Actualizar extremos con los datos del lugar (país, coordenadas, zona horaria)
        segs[0].desde = Object.assign(lugar(desde), { nombre: segs[0].desde.nombre || desde.nombre });
        segs[segs.length - 1].hasta = Object.assign(lugar(hasta), { nombre: segs[segs.length - 1].hasta.nombre || hasta.nombre });
        return Object.assign({}, igual, { desde: lugar(desde), hasta: lugar(hasta), destId: hasta.id || null, origenId: desde.id || null });
      }
      let segmentos = [nuevoSegmento(desde, hasta, m)];
      // La vuelta propone el mismo camino que la ida, al revés
      if (tipo === 'vuelta') {
        const ida = anterior.find(t => t.tipo === 'ida') || null;
        if (ida && ida.segmentos.length && lista.length === 1 && normal(ida.hasta.nombre) === nD) {
          segmentos = ida.segmentos.slice().reverse().map(s => Object.assign(nuevoSegmento(s.hasta, s.desde, s.medio), { medioOtro: s.medioOtro }));
          segmentos.forEach((s, i) => { if (i < segmentos.length - 1) s.noche = false; });
        }
      }
      return { id: nuevoId('trm'), tipo, desde: lugar(desde), hasta: lugar(hasta), destId: hasta.id || null, origenId: desde.id || null, segmentos };
    });
  }

  /** Divide el último segmento de un tramo agregando una ciudad intermedia. */
  function dividir(tramo, indice, intermedio) {
    const s = tramo.segmentos[indice];
    const a = Object.assign({}, s, { id: nuevoId('seg'), hasta: lugar(intermedio), llega: { fecha: s.sale.fecha || '', hora: '' }, noche: false, estado: s.sale.fecha ? 'estimado' : 'a_definir' });
    const b = Object.assign({}, s, { id: s.id, desde: lugar(intermedio), sale: { fecha: s.sale.fecha || '', hora: '' }, noche: s.noche });
    tramo.segmentos.splice(indice, 1, a, b);
  }

  /** Quita la parada entre el segmento i y el siguiente. */
  function unir(tramo, indice) {
    if (indice >= tramo.segmentos.length - 1) return;
    const a = tramo.segmentos[indice], b = tramo.segmentos[indice + 1];
    tramo.segmentos.splice(indice, 2, Object.assign({}, a, { hasta: b.hasta, llega: b.llega, noche: b.noche, estado: a.estado === 'confirmado' && b.estado === 'confirmado' ? 'confirmado' : (a.sale.fecha ? 'estimado' : 'a_definir') }));
  }

  /* ---------------------------------------------------------
     Ida y vuelta espejadas: lo que cargás en la ida se propone
     igual en la vuelta (misma ciudad de conexión, mismo medio).
     --------------------------------------------------------- */
  const mismo = (a, b) => !!a && !!b && normal(a.nombre) === normal(b.nombre);
  const tramoTipo = (recorrido, tipo) => (recorrido || []).find(t => t.tipo === tipo) || null;

  /** Después de agregar la parada (segmentos idx/idx+1 de la ida), la suma a la vuelta. */
  function espejarParada(recorrido, ida, idx) {
    const vuelta = tramoTipo(recorrido, 'vuelta');
    if (!vuelta || !ida || ida.tipo !== 'ida') return false;
    const a = ida.segmentos[idx], b = ida.segmentos[idx + 1];
    if (!a || !b) return false;
    const P = a.hasta, A = a.desde, B = b.hasta;
    if (vuelta.segmentos.some(s => mismo(s.hasta, P))) return false;
    let k = vuelta.segmentos.findIndex(s => mismo(s.desde, B) && mismo(s.hasta, A));
    if (k < 0 && mismo(A, ida.desde)) k = vuelta.segmentos.findIndex(s => mismo(s.hasta, A));
    if (k < 0 || vuelta.segmentos[k].estado === 'confirmado') return false;
    dividir(vuelta, k, P);
    vuelta.segmentos[k].medio = b.medio; vuelta.segmentos[k].medioOtro = b.medioOtro || '';
    vuelta.segmentos[k + 1].medio = a.medio; vuelta.segmentos[k + 1].medioOtro = a.medioOtro || '';
    return true;
  }

  /** Al quitar una parada de la ida, también se quita de la vuelta (si no estaba confirmada). */
  function desespejarParada(recorrido, ida, idx) {
    const vuelta = tramoTipo(recorrido, 'vuelta');
    if (!vuelta || !ida || ida.tipo !== 'ida') return false;
    const a = ida.segmentos[idx], b = ida.segmentos[idx + 1];
    if (!a || !b) return false;
    const P = a.hasta, A = a.desde;
    const j = vuelta.segmentos.findIndex((s, i) => i < vuelta.segmentos.length - 1 && mismo(s.hasta, P) && mismo(vuelta.segmentos[i + 1].hasta, A));
    if (j < 0 || vuelta.segmentos[j].estado === 'confirmado' || vuelta.segmentos[j + 1].estado === 'confirmado') return false;
    unir(vuelta, j);
    return true;
  }

  /** Cambiar el medio de un traslado de la ida cambia el de su par en la vuelta. */
  function espejarMedio(recorrido, seg, tramo) {
    if (!tramo || tramo.tipo !== 'ida') return false;
    const vuelta = tramoTipo(recorrido, 'vuelta');
    if (!vuelta) return false;
    let par = vuelta.segmentos.find(s => mismo(s.desde, seg.hasta) && mismo(s.hasta, seg.desde));
    // Primer tramo de la ida (desde tu casa) ↔ último de la vuelta (a tu casa)
    if (!par && tramo.segmentos.length > 1 && tramo.segmentos[0] === seg) {
      const ult = vuelta.segmentos[vuelta.segmentos.length - 1];
      if (vuelta.segmentos.length > 1 && mismo(ult.desde, seg.hasta) && mismo(ult.hasta, seg.desde)) par = ult;
    }
    if (!par || par.estado === 'confirmado') return false;
    par.medio = seg.medio; par.medioOtro = seg.medioOtro || '';
    return true;
  }

  /**
   * Ciudad de conexión del viaje (ej. el vuelo sale de otra ciudad):
   * la suma a la ida y a la vuelta con el medio elegido para llegar hasta ahí.
   */
  function aplicarConexion(recorrido, conexion) {
    const ida = tramoTipo(recorrido, 'ida');
    if (!ida || !conexion || !conexion.lugar || !conexion.lugar.nombre) return false;
    if (mismo(ida.desde, conexion.lugar) || mismo(ida.hasta, conexion.lugar)) return false;
    if (ida.segmentos.some(s => mismo(s.hasta, conexion.lugar))) {
      // Ya está: solo actualizar el medio hasta la conexión
      const s0 = ida.segmentos[0];
      if (mismo(s0.hasta, conexion.lugar) && s0.estado !== 'confirmado' && conexion.medio) { s0.medio = conexion.medio; espejarMedio(recorrido, s0, ida); }
      return false;
    }
    const principal = ida.segmentos[0].medio;
    dividir(ida, 0, conexion.lugar);
    ida.segmentos[0].medio = conexion.medio || 'micro';
    ida.segmentos[1].medio = principal;
    espejarParada(recorrido, ida, 0);
    return true;
  }

  /** Quita la conexión de la ida y de la vuelta. */
  function quitarConexion(recorrido, lugarConexion) {
    const ida = tramoTipo(recorrido, 'ida');
    if (!ida || !lugarConexion) return false;
    const i = ida.segmentos.findIndex((s, k) => k < ida.segmentos.length - 1 && mismo(s.hasta, lugarConexion));
    if (i < 0) return false;
    desespejarParada(recorrido, ida, i);
    unir(ida, i);
    return true;
  }

  /** Ciudad de conexión actual (primera parada de la ida), si hay. */
  function conexionDe(recorrido) {
    const ida = tramoTipo(recorrido, 'ida');
    if (!ida || ida.segmentos.length < 2) return null;
    return { lugar: ida.segmentos[0].hasta, medio: ida.segmentos[0].medio };
  }

  /* ---------------------------------------------------------
     Lectura
     --------------------------------------------------------- */
  function todosLosSegmentos(recorrido) {
    const r = [];
    (recorrido || []).forEach(t => t.segmentos.forEach((s, i) => r.push({ seg: s, tramo: t, indice: i })));
    return r;
  }
  const fechaSale = s => (s && s.sale && s.sale.fecha) || '';
  const fechaLlega = s => (s && ((s.llega && s.llega.fecha) || (s.sale && s.sale.fecha))) || '';

  /** Segmentos con contexto, para la guía (un paso por traslado). */
  function segmentos(v) {
    return todosLosSegmentos(v.recorrido).map(x => ({
      seg: x.seg, tramo: x.tramo, tipo: x.tramo.tipo, indice: x.indice, partes: x.tramo.segmentos.length,
      fecha: fechaSale(x.seg), destId: x.tramo.destId
    }));
  }

  function usaMedio(v, m) { return todosLosSegmentos(v.recorrido).some(x => x.seg.medio === m); }

  /** Medio "principal" (para el diseño): el más largo/importante que se use. */
  function medioPrincipal(recorrido) {
    const todos = todosLosSegmentos(recorrido).map(x => x.seg.medio);
    return ['avion', 'barco', 'tren', 'micro', 'otro', 'auto'].find(m => todos.includes(m)) || 'avion';
  }

  function etiquetaSegmento(s) { return `${medio(s.medio).icono} ${s.desde.nombre || '¿?'} → ${s.hasta.nombre || '¿?'}`; }

  /**
   * Estadías del viaje (donde dormís): cada destino con alojamiento y cada
   * parada intermedia en la que hacés noche. { id, nombre, lugar, desde, hasta, noches, tipo, destId, segId }
   */
  function estadias(v) {
    const r = [];
    const tramos = v.recorrido || [];
    const destinos = (v.destinos || []).filter(d => d.nombre && !d.soloDia);
    destinos.forEach((d, i) => {
      const entra = tramos.find(t => t.destId === d.id) || tramos.find(t => normal(t.hasta.nombre) === normal(d.nombre) && t.tipo !== 'vuelta');
      const sale = tramos.find(t => t.origenId === d.id && t !== entra) || tramos.find(t => normal(t.desde.nombre) === normal(d.nombre) && t !== entra);
      // Paradas con noche del tramo de llegada van antes
      if (entra) agregarParadas(entra);
      const desde = entra ? fechaLlega(entra.segmentos[entra.segmentos.length - 1]) : (i === 0 ? v.fechaInicio || '' : '');
      const hasta = sale ? fechaSale(sale.segmentos[0]) : (i === destinos.length - 1 ? v.fechaFin || '' : '');
      r.push({ id: d.id, tipo: 'destino', nombre: d.nombre, lugar: d, desde, hasta, noches: desde && hasta ? Math.max(0, dias(desde, hasta)) : null, destId: d.id, dePaso: !!d.dePaso });
    });
    const vuelta = tramos.find(t => t.tipo === 'vuelta');
    if (vuelta) agregarParadas(vuelta);
    return r;

    function agregarParadas(t) {
      t.segmentos.forEach((s, i) => {
        if (i >= t.segmentos.length - 1 || !s.noche) return;
        const sig = t.segmentos[i + 1];
        const desde = fechaLlega(s), hasta = fechaSale(sig);
        r.push({ id: 'par_' + s.id, tipo: 'parada', nombre: s.hasta.nombre, lugar: s.hasta, desde, hasta, noches: desde && hasta ? Math.max(0, dias(desde, hasta)) : null, segId: s.id });
      });
    }
  }

  /** ¿Están cargadas todas las fechas de salida? */
  function completo(v) {
    const segs = todosLosSegmentos(v.recorrido);
    return segs.length > 0 && segs.every(x => fechaSale(x.seg));
  }

  /* ---------------------------------------------------------
     Derivar fechas del viaje y de cada destino
     --------------------------------------------------------- */
  function recalcular(v) {
    const segs = todosLosSegmentos(v.recorrido);
    if (segs.length) {
      const primero = segs[0].seg, ultimo = segs[segs.length - 1].seg;
      const tieneVuelta = (v.recorrido || []).some(t => t.tipo === 'vuelta');
      v.fechaInicio = fechaSale(primero) || '';
      v.fechaFin = tieneVuelta ? (fechaLlega(ultimo) || '') : (v.fechaFin || '');
    }
    const est = estadias(v);
    (v.destinos || []).forEach(d => {
      if (d.soloDia) return;
      const e = est.find(x => x.id === d.id);
      d.desde = e ? e.desde : '';
      d.hasta = e ? e.hasta : '';
      d.noches = e && e.noches != null ? e.noches : '';
    });
    asignarBasesEscapadas(v);
    return v;
  }

  /** Cada escapada sale de un destino base: el anterior en la lista (o el siguiente). */
  function asignarBasesEscapadas(v) {
    const lista = v.destinos || [];
    lista.forEach((d, i) => {
      if (!d.soloDia) return;
      if (d.base && lista.some(x => x.id === d.base && !x.soloDia)) return;
      const antes = lista.slice(0, i).reverse().find(x => !x.soloDia && x.nombre);
      const despues = lista.slice(i + 1).find(x => !x.soloDia && x.nombre);
      d.base = (antes || despues || {}).id || null;
    });
  }

  /* ---------------------------------------------------------
     Husos horarios
     --------------------------------------------------------- */
  /** Minutos de diferencia con UTC de una zona en una fecha (ej. Buenos Aires → -180). */
  function offsetMin(zona, fecha) {
    if (!zona) return null;
    try {
      const d = new Date(`${fecha || '2026-01-01'}T12:00:00Z`);
      const partes = new Intl.DateTimeFormat('en-US', { timeZone: zona, timeZoneName: 'shortOffset' }).formatToParts(d);
      const t = (partes.find(p => p.type === 'timeZoneName') || {}).value || '';
      const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(t);
      if (!m) return t === 'GMT' ? 0 : null;
      return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
    } catch (e) { return null; }
  }
  /** Momento absoluto (minutos desde época) de una fecha+hora local en una zona. */
  function momento(fecha, hora, zona) {
    if (!fecha || !hora) return null;
    const [y, mo, d] = fecha.split('-').map(Number);
    const [h, mi] = hora.split(':').map(Number);
    const base = Date.UTC(y, mo - 1, d, h, mi) / 60000;
    const off = offsetMin(zona, fecha);
    return off == null ? base : base - off;
  }
  /** Duración de un traslado en minutos (respeta husos horarios si se conocen). */
  function duracion(s) {
    const a = momento(s.sale.fecha, s.sale.hora, s.desde.zona);
    const b = momento(fechaLlega(s), s.llega.hora, s.hasta.zona);
    return a != null && b != null ? b - a : null;
  }
  function fmtDuracion(min) {
    if (min == null || min < 0) return '';
    const h = Math.floor(min / 60), m = min % 60;
    return h ? `${h} h${m ? ' ' + m + ' min' : ''}` : `${m} min`;
  }
  function difHoraria(s) {
    const a = offsetMin(s.desde.zona, s.sale.fecha), b = offsetMin(s.hasta.zona, fechaLlega(s));
    if (a == null || b == null || a === b) return 0;
    return (b - a) / 60;
  }

  /* ---------------------------------------------------------
     Validador: detecta inconsistencias y avisos útiles
     --------------------------------------------------------- */
  function validar(v) {
    const r = [];
    const U = R.util;
    const add = (nivel, texto, segId) => r.push({ nivel, texto, segId: segId || null });
    const lista = todosLosSegmentos(v.recorrido);
    if (!lista.length) return r;

    lista.forEach((x, i) => {
      const s = x.seg;
      const ruta = `${s.desde.nombre} → ${s.hasta.nombre}`;
      if (!s.sale.fecha) return;
      if (s.llega.fecha && s.llega.fecha < s.sale.fecha) add('error', `${ruta}: la llegada es antes de la salida.`, s.id);
      const dur = duracion(s);
      if (dur != null && dur < 0) add('error', `${ruta}: la hora de llegada es anterior a la de salida.`, s.id);
      if (s.llega.fecha && s.llega.fecha > s.sale.fecha && !['auto'].includes(s.medio) && (s.llega.fecha === U.sumarDias(s.sale.fecha, 1))) {
        add('info', `${ruta}: viajás de noche, esa noche no necesitás alojamiento.`, s.id);
      }
      const dh = difHoraria(s);
      if (dh) add('info', `${ruta}: ${s.hasta.nombre} está ${Math.abs(dh)} h ${dh > 0 ? 'adelantada' : 'atrasada'} respecto de ${s.desde.nombre}. Los horarios son locales.`, s.id);

      const sig = lista[i + 1];
      if (!sig || !sig.seg.sale.fecha) return;
      const t = sig.seg;
      const llega = fechaLlega(s);
      if (t.sale.fecha < llega) {
        add('error', `${t.desde.nombre} → ${t.hasta.nombre} sale el ${U.fmtFecha(t.sale.fecha, 'corto')}, antes de que llegues (${U.fmtFecha(llega, 'corto')}).`, t.id);
        return;
      }
      const mismoTramo = sig.tramo === x.tramo;
      if (mismoTramo) {
        // Parada intermedia
        if (t.sale.fecha > llega && !s.noche) {
          add('aviso', `Llegás a ${s.hasta.nombre} el ${U.fmtFecha(llega, 'corto')} y seguís el ${U.fmtFecha(t.sale.fecha, 'corto')}. ¿Dónde dormís? Marcá que hacés noche ahí.`, s.id);
        }
        if (t.sale.fecha === llega && s.noche) add('aviso', `Marcaste que hacés noche en ${s.hasta.nombre}, pero seguís viaje el mismo día.`, s.id);
        const a = momento(llega, s.llega.hora, s.hasta.zona), b = momento(t.sale.fecha, t.sale.hora, t.desde.zona);
        if (a != null && b != null) {
          const gap = b - a;
          const minimo = Math.max(medio(t.medio).conexionMin, 30);
          if (gap < 0) add('error', `Conexión en ${s.hasta.nombre}: ${t.desde.nombre} → ${t.hasta.nombre} sale antes de que llegues.`, t.id);
          else if (gap < minimo) add('aviso', `Conexión en ${s.hasta.nombre} de ${fmtDuracion(gap)}: es muy justa${t.medio === 'avion' ? ' para un vuelo' : ''}.`, t.id);
          else if (t.medio === 'avion' && normal(s.hasta.nombre) === normal(t.desde.nombre) && s.medio !== 'avion' && gap < 150) add('aviso', `Llegás a ${s.hasta.nombre} ${fmtDuracion(gap)} antes del vuelo: contá el traslado al aeropuerto y el check-in.`, t.id);
        }
      } else {
        // Estadía en un destino
        if (t.sale.fecha === llega && x.tramo.tipo !== 'vuelta') {
          const d = (v.destinos || []).find(z => z.id === x.tramo.destId);
          if (!d || !d.dePaso) add('aviso', `En ${d ? d.nombre : s.hasta.nombre} llegás y te vas el mismo día. Si no dormís ahí, marcalo como "de paso" y no te pido alojamiento.`, t.id);
        } else if (t.sale.fecha > llega && x.tramo.tipo !== 'vuelta') {
          const d = (v.destinos || []).find(z => z.id === x.tramo.destId);
          if (d && d.dePaso) add('aviso', `Marcaste ${d.nombre} como de paso, pero te vas otro día. ¿Dormís ahí?`, t.id);
        }
        // Tiempo libre entre check-out y salida
        const aloj = datosAlojamiento(v, x.tramo.destId);
        if (aloj && aloj.checkoutFecha === t.sale.fecha && aloj.checkoutHora && t.sale.hora) {
          const libre = (momento(t.sale.fecha, t.sale.hora, t.desde.zona) || 0) - (momento(aloj.checkoutFecha, aloj.checkoutHora, t.desde.zona) || 0);
          if (libre >= 240) add('info', `El ${U.fmtFecha(t.sale.fecha, 'corto')} dejás ${aloj.nombre || 'el alojamiento'} a las ${aloj.checkoutHora} y salís a las ${t.sale.hora}: ${fmtDuracion(libre)} libres. ¿Dónde dejás las valijas?`, t.id);
        }
      }
    });

    // Escapadas fuera de la estadía de su base
    const est = estadias(v);
    (v.destinos || []).filter(d => d.soloDia && d.nombre && d.fecha && !d.fechaPendiente).forEach(d => {
      const base = est.find(e => e.id === d.base);
      if (base && base.desde && base.hasta && (d.fecha < base.desde || d.fecha > base.hasta)) {
        add('error', `La escapada a ${d.nombre} (${U.fmtFecha(d.fecha, 'corto')}) queda fuera de tu estadía en ${base.nombre}.`);
      }
    });
    const sinFecha = lista.filter(x => !x.seg.sale.fecha).length;
    if (sinFecha) add('info', `${sinFecha === 1 ? 'Falta la fecha de 1 traslado' : `Faltan las fechas de ${sinFecha} traslados`}.`);
    return r;
  }

  function datosAlojamiento(v, destId) {
    if (!v.tareas || !destId) return null;
    const t = v.tareas['a_reserva__' + destId];
    return t && t.datos ? t.datos : null;
  }

  /* ---------------------------------------------------------
     Cambios en cadena
     --------------------------------------------------------- */
  /** Corre N días todos los traslados posteriores a uno (y las escapadas de esas estadías). */
  function desplazarDesde(v, segId, n) {
    if (!n) return 0;
    const lista = todosLosSegmentos(v.recorrido);
    const i = lista.findIndex(x => x.seg.id === segId);
    if (i < 0) return 0;
    let movidos = 0;
    const desdeFecha = fechaLlega(lista[i].seg);
    lista.slice(i + 1).forEach(x => {
      const s = x.seg;
      if (s.sale.fecha) { s.sale.fecha = sumar(s.sale.fecha, n); movidos++; }
      if (s.llega.fecha) s.llega.fecha = sumar(s.llega.fecha, n);
      if (s.estado === 'confirmado') s.estado = 'estimado';
    });
    (v.destinos || []).forEach(d => { if (d.soloDia && d.fecha && d.fecha >= desdeFecha) d.fecha = sumar(d.fecha, n); });
    recalcular(v);
    return movidos;
  }

  /** Sugiere fechas por defecto mientras se completa el cronograma. */
  function autocompletar(recorrido) {
    const lista = todosLosSegmentos(recorrido);
    lista.forEach((x, i) => {
      const s = x.seg;
      if (s.sale.fecha && !s.llega.fecha && s.medio !== 'avion') { /* se deja vacía: llega el mismo día */ }
      if (s.sale.fecha && s.estado === 'a_definir') s.estado = 'estimado';
      if (!s.sale.fecha) s.estado = 'a_definir';
      const sig = lista[i + 1];
      // Dentro de un tramo, la siguiente parte sale el mismo día que llegás (o al otro si hacés noche)
      if (sig && sig.tramo === x.tramo && !sig.seg.sale.fecha && fechaLlega(s)) {
        sig.seg.sale.fecha = s.noche ? sumar(fechaLlega(s), 1) : fechaLlega(s);
        sig.seg.estado = 'estimado';
      }
    });
  }

  return {
    MEDIOS, TIPOS_TRAMO, ESTADOS, construir, dividir, unir, espejarParada, desespejarParada, espejarMedio, aplicarConexion, quitarConexion, conexionDe, segmentos, todosLosSegmentos, usaMedio, medioPrincipal,
    etiquetaSegmento, estadias, completo, recalcular, validar, desplazarDesde, autocompletar, normalizarSegmento,
    duracion, fmtDuracion, difHoraria, offsetMin, momento, fechaSale, fechaLlega, medio
  };
})();
