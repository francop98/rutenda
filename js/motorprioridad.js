/* =========================================================
   Tripbox — motor de prioridades
   Decide qué conviene hacer primero combinando:
   1. Impacto: cuánto cuesta cambiarlo y qué tan escaso es.
   2. Urgencia: cuánto falta para la fecha recomendada.
   3. Dependencias: qué está bloqueado y qué destraba cada paso.
   4. Orden sugerido: pasos que conviene hacer después de otros.
   También resuelve los "cambios de planes": reabre los pasos
   afectados en cadena y arma un plan de reorganización ordenado.
   ========================================================= */
window.R = window.R || {};

R.motor = (function () {
  const RESUELTO = new Set(['hecha', 'no_aplica']);

  /**
   * Lista concreta de pasos del viaje: aplica la plantilla al perfil,
   * repite pasos por destino / tramo / escapada y resuelve dependencias.
   */
  function lista(v) {
    const destinos = v.destinos || [];
    const conAloj = destinos.filter(d => !d.soloDia);
    const escapadas = destinos.filter(d => d.soloDia);
    const varios = conAloj.length > 1;
    const concreta = (t, id, ctx) => Object.assign({}, t, {
      id, base: t.id, ctx: ctx || null, destId: ctx && ctx.destino ? ctx.destino.id : (ctx && ctx.hasta ? ctx.hasta.id : null),
      titulo: typeof t.titulo === 'function' ? t.titulo(v, ctx || {}) : t.titulo,
      desc: typeof t.desc === 'function' ? t.desc(v, ctx || {}) : t.desc,
      consejo: typeof t.consejo === 'function' ? t.consejo(v, ctx || {}) : t.consejo,
      porque: typeof t.porque === 'function' ? t.porque(v, ctx || {}) : t.porque,
      impacto: typeof t.impacto === 'function' ? t.impacto(v, ctx || {}) : t.impacto,
      anticipacion: typeof t.anticipacion === 'function' ? t.anticipacion(v, ctx || {}) : t.anticipacion,
      dependeDe: (t.dependeDe || []).slice(),
      despuesDe: (t.despuesDe || []).slice(),
      propia: false
    });

    const base = [];
    R.guia.tareas.filter(t => !t.aplica || t.aplica(v)).forEach(t => {
      if (t.porDestino) {
        const lugares = conAloj.length ? conAloj : [{ id: 'unico', nombre: v.destino || 'destino' }];
        lugares.forEach(d => base.push(concreta(t, `${t.id}__${d.id}`, { destino: d, varios })));
      } else if (t.porTramo) {
        for (let i = 1; i < conAloj.length; i++) base.push(concreta(t, `${t.id}__${conAloj[i].id}`, { desde: conAloj[i - 1], hasta: conAloj[i] }));
      } else if (t.porEscapada) {
        escapadas.forEach(d => base.push(concreta(t, `${t.id}__${d.id}`, { destino: d })));
      } else {
        base.push(concreta(t, t.id, null));
      }
    });

    const propias = (v.tareasPropias || []).map(t => Object.assign({
      desc: '', consejo: '', porque: '', impacto: 3, anticipacion: null
    }, t, { base: t.id, dependeDe: (t.dependeDe || []).slice(), despuesDe: [], propia: true }));
    const todas = base.concat(propias);

    // Una dependencia a un paso repetido apunta a la copia del mismo destino o, si no hay, a todas.
    const porBase = {};
    todas.forEach(t => { (porBase[t.base] = porBase[t.base] || []).push(t.id); });
    const mapear = (ids, t) => {
      const r = [];
      ids.forEach(id => {
        const copias = porBase[id];
        if (!copias) { r.push(id); return; }
        const repetido = copias.some(c => c.includes('__'));
        if (t.destId && repetido) {
          // Un paso de un destino solo espera al paso equivalente de ese mismo destino.
          const mismo = copias.find(c => c.endsWith('__' + t.destId));
          if (mismo) r.push(mismo);
          return;
        }
        copias.forEach(c => r.push(c));
      });
      return r.filter(id => id !== t.id);
    };
    todas.forEach(t => { t.dependeDe = mapear(t.dependeDe, t); t.despuesDe = mapear(t.despuesDe, t); });
    return todas;
  }

  /** Ids concretos de un paso de la plantilla (ej. 'a_reserva' → una por destino). */
  function idsDe(v, base) {
    return lista(v).filter(t => t.base === base || t.id === base).map(t => t.id);
  }

  function estado(v, id) { return (v.tareas[id] && v.tareas[id].estado) || 'pendiente'; }
  function resuelta(v, id) { return RESUELTO.has(estado(v, id)); }

  function fechaLimite(v, t) {
    if (t.fechaManual) return t.fechaManual;
    if (t.anticipacion == null) return null;
    if (t.ref === 'fin') return v.fechaFin ? R.util.sumarDias(v.fechaFin, t.anticipacion) : null;
    return v.fechaInicio ? R.util.sumarDias(v.fechaInicio, -t.anticipacion) : null;
  }

  /** Analiza todos los pasos del viaje y calcula su prioridad con explicaciones. */
  function analizar(v) {
    const ts = lista(v);
    const ids = new Set(ts.map(t => t.id));
    const recs = new Set(ts.filter(t => t.rec).map(t => t.id));
    const hoy = R.util.hoyISO();
    const viajeEmpezo = v.fechaInicio && v.fechaInicio <= hoy;

    return ts.map(t => {
      const est = estado(v, t.id);
      // Un paso de la guía nunca espera a una recomendación
      const valida = d => ids.has(d) && (t.rec || !recs.has(d));
      const deps = t.dependeDe.filter(valida);
      const bloqueadaPor = deps.filter(d => !resuelta(v, d));
      const previasSugeridas = t.despuesDe.filter(d => valida(d) && !resuelta(v, d));
      const fl = fechaLimite(v, t);
      const dr = fl ? R.util.diasEntre(hoy, fl) : null;
      const destraba = ts.filter(o => !o.rec && o.dependeDe.includes(t.id) && !resuelta(v, o.id));

      let score = t.impacto * 12;
      const razones = [];

      if (!RESUELTO.has(est)) {
        if (t.porque) razones.push({ tipo: 'impacto', texto: t.porque });

        if (dr != null) {
          if (dr < 0) {
            score += 40 + Math.min(30, -dr * 2);
            razones.push({ tipo: 'urgente', texto: `Atrasado: convenía tenerlo listo hace ${R.util.plural(-dr, 'día', 'días')}.` });
          } else if (dr === 0) {
            score += 38;
            razones.push({ tipo: 'urgente', texto: 'Conviene resolverlo hoy.' });
          } else if (dr <= 7) {
            score += 32 - dr * 2;
            razones.push({ tipo: 'urgente', texto: `Conviene tenerlo listo en ${R.util.plural(dr, 'día', 'días')}.` });
          } else if (dr <= 30) {
            score += Math.round(16 - dr / 2.5);
            razones.push({ tipo: 'tiempo', texto: `Fecha recomendada: ${R.util.fmtFecha(fl, 'corto')} (en ${dr} días).` });
          }
        }

        if (destraba.length) {
          score += destraba.length * 5;
          razones.push({ tipo: 'destraba', texto: `Destraba ${R.util.plural(destraba.length, 'paso', 'pasos')}: ${destraba.slice(0, 3).map(o => o.titulo).join(', ')}${destraba.length > 3 ? '…' : ''}.` });
        }

        if (previasSugeridas.length) {
          score -= 15 * previasSugeridas.length;
          razones.push({ tipo: 'espera', texto: `Conviene después de: ${previasSugeridas.map(id => nombre(v, id)).join(', ')}.` });
        }

        if (est === 'revisar') {
          score += 12;
          razones.push({ tipo: 'cambio', texto: 'Quedó afectado por un cambio de planes.' });
        }
        if (est === 'en_curso') {
          score += 6;
          razones.push({ tipo: 'curso', texto: 'Ya lo empezaste: terminarlo libera la cabeza.' });
        }
        if (t.ref === 'fin' && !viajeEmpezo) score -= 40;
      }

      const bloqueada = bloqueadaPor.length > 0;
      const datosPaso = v.tareas[t.id] || {};
      const tieneFormulario = !!(R.formularios && R.formularios.tiene(t));
      const faltanDatos = !t.rec && tieneFormulario && est === 'hecha' && !datosPaso.datos && !datosPaso.sinDatosOk;
      return Object.assign({}, t, {
        postergado: !!datosPaso.postergado && !RESUELTO.has(est),
        tieneFormulario,
        faltanDatos,
        dependeDe: deps,
        estado: est,
        resuelta: RESUELTO.has(est),
        bloqueada,
        bloqueadaPor,
        previasSugeridas,
        fechaLimite: fl,
        diasRestantes: dr,
        destraba: destraba.map(o => o.id),
        score,
        orden: score - (bloqueada ? 200 : 0),
        razones
      });
    });
  }

  function nombre(v, id) {
    const t = lista(v).find(x => x.id === id);
    return t ? t.titulo : id;
  }

  /** Lo próximo a resolver: pendiente o a revisar, sin bloqueos, sin "en marcha" ni "más tarde". */
  function proximos(v, n) {
    return analizar(v)
      .filter(t => !t.rec && !t.resuelta && !t.bloqueada && t.estado !== 'en_curso' && !t.postergado)
      .sort((a, b) => b.orden - a.orden)
      .slice(0, n || 3);
  }

  function progreso(v) {
    const ts = lista(v).filter(t => !t.rec);
    let hechas = 0, noAplica = 0;
    ts.forEach(t => {
      const e = estado(v, t.id);
      if (e === 'hecha') hechas++;
      if (e === 'no_aplica') noAplica++;
    });
    const total = ts.length - noAplica;
    return { hechas, total, pct: total ? Math.round((hechas / total) * 100) : 0 };
  }

  function progresoPorFase(v) {
    const info = analizar(v);
    return R.guia.fases.map(f => {
      const delaFase = info.filter(t => t.fase === f.id && !t.rec);
      const validas = delaFase.filter(t => t.estado !== 'no_aplica');
      const hechas = validas.filter(t => t.estado === 'hecha').length;
      return { fase: f, tareas: delaFase, hechas, total: validas.length };
    }).filter(x => x.tareas.length);
  }

  /** Cambia el estado de un paso. Devuelve los pasos que quedaron destrabados. */
  function setEstado(v, id, nuevo) {
    const antes = analizar(v).filter(t => t.bloqueada).map(t => t.id);
    const previo = v.tareas[id] || {};
    v.tareas[id] = Object.assign({}, previo, {
      estado: nuevo,
      postergado: false,
      fechaHecha: nuevo === 'hecha' ? new Date().toISOString() : null
    });
    ultimasDeducidas = nuevo === 'hecha' ? deducirPrevios(v, id) : [];
    const despues = analizar(v);
    const destrabadas = despues.filter(t => antes.includes(t.id) && !t.bloqueada);
    return destrabadas;
  }

  /**
   * Si resolviste un paso, lo que era imprescindible antes también está resuelto
   * (ej.: si ya tenés los vuelos, las fechas están cerradas). Devuelve los pasos deducidos.
   */
  let ultimasDeducidas = [];
  function deducirPrevios(v, id) {
    const ts = lista(v);
    const porId = {};
    ts.forEach(t => { porId[t.id] = t; });
    const deducidas = [];
    const visitar = tid => {
      const t = porId[tid];
      if (!t) return;
      t.dependeDe.forEach(dep => {
        if (!porId[dep] || porId[dep].rec || resuelta(v, dep)) return;
        v.tareas[dep] = Object.assign({}, v.tareas[dep] || {}, { estado: 'hecha', deducido: true, postergado: false, fechaHecha: new Date().toISOString() });
        deducidas.push(porId[dep]);
        visitar(dep);
      });
    };
    visitar(id);
    return deducidas;
  }
  function deducidasRecientes() { return ultimasDeducidas.slice(); }

  /** "Más tarde": saca el paso de la sugerencia sin marcarlo. */
  function posponer(v, id, si) {
    v.tareas[id] = Object.assign({}, v.tareas[id] || { estado: 'pendiente' }, { postergado: si !== false });
  }

  /** Recomendaciones pendientes, de la más necesaria a la menos. */
  function recomendaciones(v) {
    const todas = analizar(v).filter(t => t.rec);
    const pendientes = todas.filter(t => !t.resuelta).sort((a, b) => b.orden - a.orden);
    return { pendientes, hechas: todas.filter(t => t.estado === 'hecha').length, total: todas.filter(t => t.estado !== 'no_aplica').length };
  }

  function enMarcha(v) { return analizar(v).filter(t => t.estado === 'en_curso'); }

  /** Ordena una lista de pasos respetando dependencias y luego prioridad. */
  function ordenarPlan(v, idsPlan) {
    const info = analizar(v).filter(t => idsPlan.includes(t.id) && !t.resuelta);
    const enPlan = new Set(info.map(t => t.id));
    const colocadas = new Set();
    const plan = [];
    const restantes = info.slice();

    while (restantes.length) {
      const listos = restantes.filter(t =>
        t.dependeDe.concat(t.despuesDe).every(d => !enPlan.has(d) || colocadas.has(d)));
      const candidatos = listos.length ? listos : restantes;
      candidatos.sort((a, b) => b.score - a.score);
      const elegido = candidatos[0];
      const previas = elegido.dependeDe.concat(elegido.despuesDe).filter(d => colocadas.has(d));
      elegido.motivoOrden = explicarOrden(v, elegido, previas, plan.length);
      plan.push(elegido);
      colocadas.add(elegido.id);
      restantes.splice(restantes.indexOf(elegido), 1);
    }
    return plan;
  }

  function explicarOrden(v, t, previas, posicion) {
    if (posicion === 0) {
      return t.porque ? `Va primero: ${minuscula(t.porque)}` : 'Va primero: es lo de mayor impacto ahora.';
    }
    const partes = [];
    if (previas.length) partes.push(`Se apoya en: ${previas.map(id => nombre(v, id)).join(', ')}.`);
    if (t.porque) partes.push(t.porque);
    return partes.join(' ') || 'Sigue según impacto y urgencia.';
  }

  function minuscula(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }

  /**
   * Cambio de planes: reabre los pasos raíz de cada motivo y, en cadena,
   * todo lo que dependía de ellos y ya estaba hecho. Devuelve el plan ordenado.
   */
  function replanificar(v, motivoIds, nota) {
    const ts = lista(v);
    const ids = new Set(ts.map(t => t.id));
    const raices = new Set();
    motivoIds.forEach(m => {
      const motivo = R.guia.motivosCambio.find(x => x.id === m);
      if (motivo) motivo.afecta.forEach(a => ts.filter(t => t.base === a || t.id === a).forEach(t => raices.add(t.id)));
    });

    const afectadas = new Set(raices);
    let creciendo = true;
    while (creciendo) {
      creciendo = false;
      ts.forEach(t => {
        if (afectadas.has(t.id)) return;
        if (t.dependeDe.concat(t.despuesDe).some(p => afectadas.has(p))) {
          afectadas.add(t.id);
          creciendo = true;
        }
      });
    }

    const reabiertas = [];
    const esRec = new Set(ts.filter(t => t.rec).map(t => t.id));
    afectadas.forEach(id => {
      const e = estado(v, id);
      if (e === 'no_aplica' || esRec.has(id)) return;
      if (raices.has(id) || e === 'hecha' || e === 'en_curso') {
        v.tareas[id] = Object.assign({}, v.tareas[id] || {}, { estado: 'revisar', fechaHecha: null });
        reabiertas.push(id);
      }
    });

    v.cambios.push({
      id: R.util.id('cam'),
      fecha: new Date().toISOString(),
      motivos: motivoIds,
      nota: nota || '',
      reabiertas
    });

    return ordenarPlan(v, reabiertas);
  }

  function pasosARevisar(v) {
    return lista(v).filter(t => !t.rec && estado(v, t.id) === 'revisar').map(t => t.id);
  }

  return {
    lista, idsDe, estado, resuelta, posponer, enMarcha, deducidasRecientes, recomendaciones, fechaLimite, analizar, nombre, proximos, progreso,
    progresoPorFase, setEstado, ordenarPlan, replanificar, pasosARevisar
  };
})();
