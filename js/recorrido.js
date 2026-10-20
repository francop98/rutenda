/* =========================================================
   Tripbox — recorrido del viaje
   El viaje se arma en tramos: ida (origen → primer destino),
   entre destinos y vuelta (último destino → origen).
   Cada tramo puede hacerse en partes con distinto medio:
   ej. Bahía Blanca → Buenos Aires en micro y
       Buenos Aires → Puerto Iguazú en avión.
   ========================================================= */
window.R = window.R || {};

R.recorrido = (function () {
  const MEDIOS = {
    avion: { nombre: 'Avión', icono: '✈️', titulo: (a, b) => `Vuelo ${a} → ${b}`, impacto: 5, anticipacion: 60, porque: 'Los vuelos suben de precio y se agotan; además fijan los horarios de todo lo demás.' },
    micro: { nombre: 'Micro', icono: '🚌', titulo: (a, b) => `Pasaje de micro ${a} → ${b}`, impacto: 4, anticipacion: 30, porque: 'En temporada los micros se llenan; define a qué hora llegás.' },
    auto: { nombre: 'Auto propio', icono: '🚗', titulo: (a, b) => `Planificar el viaje en auto ${a} → ${b}`, impacto: 3, anticipacion: 14, porque: 'Define paradas, horarios y si hace falta dormir en el camino.' },
    tren: { nombre: 'Tren', icono: '🚆', titulo: (a, b) => `Pasaje de tren ${a} → ${b}`, impacto: 4, anticipacion: 30, porque: 'Los pasajes de tren tienen cupo limitado.' },
    barco: { nombre: 'Barco / ferry', icono: '⛴️', titulo: (a, b) => `Barco o ferry ${a} → ${b}`, impacto: 4, anticipacion: 45, porque: 'Los cupos (sobre todo con auto) se agotan.' },
    otro: { nombre: 'Otro', icono: '🧭', titulo: (a, b, s) => `${s && s.medioOtro ? s.medioOtro : 'Transporte'} ${a} → ${b}`, impacto: 3, anticipacion: 30, porque: 'Resolverlo con tiempo evita sorpresas.' }
  };
  const TIPOS_TRAMO = { ida: 'Ida', entre: 'Entre destinos', vuelta: 'Vuelta' };
  const normal = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  const nuevoId = p => (R.util ? R.util.id(p) : p + Math.random().toString(36).slice(2, 8));
  const lugar = l => ({ nombre: (l && l.nombre) || '', region: (l && l.region) || '', pais: (l && l.pais) || '', codigoPais: (l && l.codigoPais) || '', lat: l ? l.lat : null, lon: l ? l.lon : null });

  /**
   * Arma (o actualiza) los tramos a partir del origen y los destinos con alojamiento.
   * Conserva lo que ya estaba cargado en tramos con los mismos extremos.
   */
  function construir(origen, destinos, previo, medioDefecto) {
    const lista = (destinos || []).filter(d => d.nombre && !d.soloDia);
    const anterior = previo || [];
    const medio = medioDefecto || 'avion';
    if (!lista.length || !(origen && origen.nombre)) {
      return lista.length ? armar([['ida', null, lista[0]]].concat(lista.slice(1).map((d, i) => ['entre', lista[i], d]))) : [];
    }
    const pares = [['ida', origen, lista[0]]];
    for (let i = 1; i < lista.length; i++) pares.push(['entre', lista[i - 1], lista[i]]);
    pares.push(['vuelta', lista[lista.length - 1], origen]);
    return armar(pares);

    function armar(ps) {
      return ps.map(([tipo, desde, hasta]) => {
        const nDesde = normal(desde && desde.nombre), nHasta = normal(hasta && hasta.nombre);
        const igual = anterior.find(t => t.tipo === tipo && normal(t.desde.nombre) === nDesde && normal(t.hasta.nombre) === nHasta);
        if (igual) return Object.assign({}, igual, { desde: lugar(desde), hasta: lugar(hasta), destId: hasta && hasta.id ? hasta.id : null });
        // Para la vuelta, proponer lo mismo que la ida pero al revés
        let segmentos = [{ id: nuevoId('seg'), desde: lugar(desde), hasta: lugar(hasta), medio }];
        if (tipo === 'vuelta' && lista.length === 1) {
          const ida = anterior.find(t => t.tipo === 'ida' && normal(t.hasta.nombre) === nDesde) || null;
          if (ida && ida.segmentos.length) {
            segmentos = ida.segmentos.slice().reverse().map(s => ({ id: nuevoId('seg'), desde: lugar(s.hasta), hasta: lugar(s.desde), medio: s.medio, medioOtro: s.medioOtro }));
          }
        }
        return { id: nuevoId('trm'), tipo, desde: lugar(desde), hasta: lugar(hasta), destId: hasta && hasta.id ? hasta.id : null, segmentos };
      });
    }
  }

  /** Divide un segmento agregando una ciudad intermedia. */
  function dividir(tramo, indice, intermedio) {
    const s = tramo.segmentos[indice];
    const a = { id: nuevoId('seg'), desde: s.desde, hasta: lugar(intermedio), medio: s.medio, medioOtro: s.medioOtro };
    const b = { id: nuevoId('seg'), desde: lugar(intermedio), hasta: s.hasta, medio: s.medio, medioOtro: s.medioOtro };
    tramo.segmentos.splice(indice, 1, a, b);
  }

  /** Une un segmento con el siguiente (quita la ciudad intermedia). */
  function unir(tramo, indice) {
    if (indice >= tramo.segmentos.length - 1) return;
    const a = tramo.segmentos[indice], b = tramo.segmentos[indice + 1];
    tramo.segmentos.splice(indice, 2, { id: a.id, desde: a.desde, hasta: b.hasta, medio: a.medio, medioOtro: a.medioOtro });
  }

  /** Fecha estimada de un tramo. */
  function fechaTramo(v, tramo) {
    if (tramo.tipo === 'ida') return v.fechaInicio || '';
    if (tramo.tipo === 'vuelta') return v.fechaFin || '';
    const d = (v.destinos || []).find(x => x.id === tramo.destId);
    return (d && d.desde) || '';
  }

  /** Todos los segmentos del viaje con su contexto. */
  function segmentos(v) {
    const r = [];
    (v.recorrido || []).forEach(t => t.segmentos.forEach((s, i) => r.push({
      seg: s, tramo: t, tipo: t.tipo, indice: i, partes: t.segmentos.length,
      fecha: fechaTramo(v, t),
      destId: t.destId
    })));
    return r;
  }

  function usaMedio(v, medio) { return segmentos(v).some(x => x.seg.medio === medio); }

  /** Medio "principal" (para el diseño): el más largo/importante que se use. */
  function medioPrincipal(recorrido) {
    const todos = [];
    (recorrido || []).forEach(t => t.segmentos.forEach(s => todos.push(s.medio)));
    const prioridad = ['avion', 'barco', 'tren', 'micro', 'otro', 'auto'];
    return prioridad.find(m => todos.includes(m)) || 'avion';
  }

  function etiquetaSegmento(s) {
    const m = MEDIOS[s.medio] || MEDIOS.otro;
    return `${m.icono} ${s.desde.nombre || '¿?'} → ${s.hasta.nombre || '¿?'}`;
  }

  return { MEDIOS, TIPOS_TRAMO, construir, dividir, unir, segmentos, usaMedio, medioPrincipal, fechaTramo, etiquetaSegmento };
})();
